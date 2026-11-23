// One-time data setup for Atlas Conquest.
// Downloads everything the game needs and bundles it into /public so the game
// never touches a live API at runtime.
//
//   npm run setup
//
// Outputs:
//   public/data/world.json      TopoJSON shapes (Natural Earth 50m), ids = ISO alpha-3
//   public/data/countries.json  Country facts
//   public/data/terrain.png     NASA Blue Marble as 4096x2048 pixel art: limited palette, lighter desaturated ocean
//   public/data/manifest.json   What was built, what was dropped and why
//   public/flags/{s,l}/<cca2>.png   Each flag as low-resolution pixel art in two sizes
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAll } from './derive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const FLAG_DIR = join(ROOT, 'public', 'flags');

const FACT_SOURCES = [
  'https://gitlab.com/restcountries/restcountries/-/raw/master/src/main/resources/countriesV3.1.json',
  'https://raw.githubusercontent.com/apilayer/restcountries/master/src/main/resources/countriesV3.1.json',
];
const TERRAIN_SOURCES = [
  'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg',
  'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg',
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg',
];
const flagUrl = (cca2) => `https://flagcdn.com/${cca2.toLowerCase()}.svg`;

// Natural Earth shapes that carry no ISO numeric code. Either join them by name
// to a fact record, or merge them into the country they are internationally
// recognised as part of, so the map has no unclickable holes.
const SHAPE_NAME_JOIN = { Kosovo: 'UNK' };
const SHAPE_NAME_MERGE = { Somaliland: 'SOM', 'N. Cyprus': 'CYP' };

// The fact dataset uses a few bare or duplicate names. Normalise them so two
// options in a question can never be the same thing under different labels.
const CURRENCY_ALIASES = {
  'Pound Sterling': 'British Pound',
  Krone: 'Danish Krone',
  Dalasi: 'Gambian Dalasi',
  Denar: 'Macedonian Denar',
  Lari: 'Georgian Lari',
  Leone: 'Sierra Leonean Leone',
};
const LANGUAGE_ALIASES = {
  'Swiss German': 'German',
  'Southern Sotho': 'Sotho',
  Nauru: 'Nauruan',
};

// Terrain is stored at this size; the game shows it through a pixel grid that never gets finer than this.
const TERRAIN_W = 4096;
const TERRAIN_H = 2048;
// Ocean colour ramp, deep to shallow: a muted blue instead of Blue Marble's near-black navy.
// These are the earlier slate values with their saturation raised by 15%.
const OCEAN_DEEP = [58, 92, 122];
const OCEAN_SHALLOW = [124, 167, 193];
// Flags are rasterised small and shown scaled up 2x without smoothing, so they read as pixel art.
const FLAG_HEIGHTS = { s: 12, l: 32 };

const UA = 'atlas-conquest-setup/1.0 (one-time data download)';

async function fetchWithRetry(url, { tries = 3, timeoutMs = 60000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < tries) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? lastErr}`);
}

async function firstWorking(urls, validate, opts) {
  const errors = [];
  for (const url of urls) {
    try {
      const buf = await fetchWithRetry(url, opts);
      const value = await validate(buf);
      return { url, value };
    } catch (err) {
      errors.push(String(err.message ?? err));
    }
  }
  throw new Error(errors.join('\n  '));
}

function continentOf(rec) {
  switch (rec.region) {
    case 'Africa':
    case 'Asia':
    case 'Europe':
    case 'Oceania':
      return rec.region;
    case 'Americas':
      return rec.subregion === 'South America' ? 'South America' : 'North America';
    default:
      return null;
  }
}

/** Returns a list of missing fact names; empty means the record is complete. */
function missingFacts(rec) {
  const missing = [];
  if (!rec.name?.common) missing.push('name');
  if (!rec.cca2 || !rec.cca3) missing.push('ISO codes');
  if (!Array.isArray(rec.capital) || !rec.capital[0]) missing.push('capital');
  if (!rec.region) missing.push('region');
  if (!rec.subregion) missing.push('subregion');
  if (rec.region && !continentOf(rec)) missing.push('playable continent');
  if (typeof rec.landlocked !== 'boolean') missing.push('landlocked flag');
  if (!(rec.population > 0)) missing.push('population');
  if (!(rec.area > 0)) missing.push('area');
  if (!rec.currencies || Object.keys(rec.currencies).length === 0) missing.push('currencies');
  if (!rec.languages || Object.keys(rec.languages).length === 0) missing.push('languages');
  if (!Array.isArray(rec.latlng) || rec.latlng.length !== 2) missing.push('lat/lng');
  return missing;
}

const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

/**
 * Recolours the satellite image in place for a brighter, blockier look:
 *  - water (anything dark and blue-dominant, so lakes are included) is remapped by brightness
 *    onto a light, desaturated ocean ramp;
 *  - land is lifted out of the shadows and given a little more colour.
 */
function restyleTerrain(data, channels) {
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Open water is blue-dominant; the big lakes are near-black in this image.
    const water = (b > r + 10 && b >= g - 6 && r < 120) || (r < 24 && g < 30 && b < 44 && b >= r && b >= g - 3);
    if (water) {
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const t = Math.min(1, luminance / 0.2) ** 0.75;
      data[i] = OCEAN_DEEP[0] + (OCEAN_SHALLOW[0] - OCEAN_DEEP[0]) * t;
      data[i + 1] = OCEAN_DEEP[1] + (OCEAN_SHALLOW[1] - OCEAN_DEEP[1]) * t;
      data[i + 2] = OCEAN_DEEP[2] + (OCEAN_SHALLOW[2] - OCEAN_DEEP[2]) * t;
    } else {
      // Gamma lift, then push each channel away from grey for more saturation.
      const lr = 255 * (r / 255) ** 0.72;
      const lg = 255 * (g / 255) ** 0.72;
      const lb = 255 * (b / 255) ** 0.72;
      const grey = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      data[i] = Math.max(0, Math.min(255, grey + (lr - grey) * 1.3));
      data[i + 1] = Math.max(0, Math.min(255, grey + (lg - grey) * 1.3));
      data[i + 2] = Math.max(0, Math.min(255, grey + (lb - grey) * 1.3));
    }
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await rm(FLAG_DIR, { recursive: true, force: true });
  await mkdir(FLAG_DIR, { recursive: true });

  const dropped = [];
  const drop = (name, reason) => dropped.push({ name, reason });

  // ---------------------------------------------------------------- shapes
  const topo = JSON.parse(
    await readFile(join(ROOT, 'node_modules', 'world-atlas', 'countries-50m.json'), 'utf8'),
  );
  const shapes = topo.objects.countries.geometries;
  console.log(`Shapes: ${shapes.length} features from world-atlas countries-50m.json`);

  // ----------------------------------------------------------------- facts
  console.log('Downloading country facts…');
  const facts = await firstWorking(FACT_SOURCES, (buf) => {
    const json = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(json) || json.length < 200) throw new Error('unexpected facts payload');
    return json;
  });
  console.log(`Facts: ${facts.value.length} records from ${facts.url}`);
  const byNumeric = new Map();
  const byAlpha3 = new Map();
  for (const rec of facts.value) {
    if (rec.ccn3) byNumeric.set(String(rec.ccn3).padStart(3, '0'), rec);
    if (rec.cca3) byAlpha3.set(rec.cca3, rec);
  }

  // ------------------------------------------------------------------ join
  // shape -> fact record, primarily by ISO numeric code.
  const shapeOwner = new Map(); // geometry index -> cca3
  const shapesFor = new Map(); // cca3 -> geometry indexes
  shapes.forEach((geom, i) => {
    const shapeName = geom.properties?.name ?? `shape #${i}`;
    let rec = null;
    if (geom.id != null) rec = byNumeric.get(String(geom.id).padStart(3, '0')) ?? null;
    else if (SHAPE_NAME_JOIN[shapeName]) rec = byAlpha3.get(SHAPE_NAME_JOIN[shapeName]) ?? null;
    else if (SHAPE_NAME_MERGE[shapeName]) rec = byAlpha3.get(SHAPE_NAME_MERGE[shapeName]) ?? null;
    if (!rec) {
      drop(shapeName, geom.id != null ? `map shape has no fact record (ISO numeric ${geom.id})` : 'map shape has no ISO numeric code and no fact record');
      return;
    }
    shapeOwner.set(i, rec.cca3);
    if (!shapesFor.has(rec.cca3)) shapesFor.set(rec.cca3, []);
    shapesFor.get(rec.cca3).push(i);
  });

  const included = new Map(); // cca3 -> fact record
  for (const rec of facts.value) {
    const name = rec.name?.common ?? rec.cca3 ?? '(unnamed)';
    if (!shapesFor.has(rec.cca3)) {
      drop(name, 'facts but no map shape');
      continue;
    }
    const missing = missingFacts(rec);
    if (missing.length) {
      drop(name, `incomplete facts: missing ${missing.join(', ')}`);
      continue;
    }
    included.set(rec.cca3, rec);
  }

  // ----------------------------------------------------------------- flags
  console.log(`Downloading ${included.size} flags…`);
  const flagHash = new Map();
  const { default: sharp } = await import('sharp');
  for (const size of Object.keys(FLAG_HEIGHTS)) await mkdir(join(FLAG_DIR, size), { recursive: true });
  await pool([...included.values()], 8, async (rec) => {
    try {
      const buf = await fetchWithRetry(flagUrl(rec.cca2), { tries: 4, timeoutMs: 30000 });
      const text = buf.toString('utf8');
      if (!text.includes('<svg')) throw new Error('not an SVG');
      for (const [size, height] of Object.entries(FLAG_HEIGHTS)) {
        await sharp(buf, { density: 144 })
          .resize({ height, kernel: 'lanczos3' })
          .flatten({ background: '#ffffff' })
          .png({ palette: true, colours: 24, dither: 0, compressionLevel: 9 })
          .toFile(join(FLAG_DIR, size, `${rec.cca2.toLowerCase()}.png`));
      }
      flagHash.set(rec.cca3, createHash('sha1').update(buf).digest('hex').slice(0, 10));
    } catch (err) {
      drop(rec.name.common, `flag download failed (${err.message})`);
      included.delete(rec.cca3);
    }
  });

  // ------------------------------------------------------------- countries
  const countries = [...included.values()]
    .map((rec) => ({
      id: rec.cca3,
      cca2: rec.cca2.toLowerCase(),
      ccn3: rec.ccn3 ?? null,
      name: rec.name.common,
      officialName: rec.name.official ?? rec.name.common,
      capital: rec.capital[0],
      continent: continentOf(rec),
      region: rec.region,
      subregion: rec.subregion,
      borders: [...new Set(rec.borders ?? [])].filter((b) => included.has(b) && b !== rec.cca3),
      landlocked: rec.landlocked,
      population: rec.population,
      area: rec.area,
      currencies: [
        ...new Set(
          Object.values(rec.currencies)
            .map((c) => titleCase(c.name))
            .map((n) => CURRENCY_ALIASES[n] ?? n),
        ),
      ],
      languages: [...new Set(Object.values(rec.languages).map((l) => LANGUAGE_ALIASES[l] ?? l))],
      // Internet domain, e.g. ".ch". Some records list several; the first plain two-letter one is the country code.
      tld: (rec.tld ?? []).find((t) => /^\.[a-z]{2}$/.test(t)) ?? null,
      lat: rec.latlng[0],
      lng: rec.latlng[1],
      flagKey: flagHash.get(rec.cca3),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Borders must be symmetric or the attack graph gets one-way streets.
  const byId = new Map(countries.map((c) => [c.id, c]));
  let fixedBorders = 0;
  for (const c of countries) {
    for (const b of c.borders) {
      const other = byId.get(b);
      if (!other.borders.includes(c.id)) {
        other.borders.push(c.id);
        fixedBorders++;
      }
    }
  }
  for (const c of countries) c.borders.sort();

  // ------------------------------------------------------------- world.json
  topo.objects.countries.geometries = shapes
    .map((geom, i) => {
      const owner = shapeOwner.get(i);
      if (!owner || !byId.has(owner)) return null;
      return { type: geom.type, arcs: geom.arcs, id: owner, properties: { name: byId.get(owner).name } };
    })
    .filter(Boolean);
  await writeFile(join(DATA_DIR, 'world.json'), JSON.stringify(topo));
  // Fame, seas, features and globe lines come from the config files and the shapes just written.
  await deriveAll(countries, topo);
  await writeFile(join(DATA_DIR, 'countries.json'), JSON.stringify(countries));

  // ---------------------------------------------------------------- terrain
  let terrain = 'procedural';
  let terrainSource = null;
  const terrainPath = join(DATA_DIR, 'terrain.png');
  console.log('Downloading NASA Blue Marble…');
  try {
    const img = await firstWorking(
      TERRAIN_SOURCES,
      async (buf) => {
        const meta = await sharp(buf).metadata();
        if (!meta.width || meta.width < 1024 || Math.abs(meta.width / meta.height - 2) > 0.02) {
          throw new Error('not a 2:1 equirectangular image');
        }
        return buf;
      },
      { tries: 2, timeoutMs: 120000 },
    );
    const { data, info } = await sharp(img.value)
      .resize(TERRAIN_W, TERRAIN_H, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    restyleTerrain(data, info.channels);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png({ palette: true, colours: 64, dither: 0, compressionLevel: 9, effort: 10 })
      .toFile(terrainPath);
    terrain = 'bluemarble';
    terrainSource = img.url;
    console.log(`Terrain: ${TERRAIN_W}x${TERRAIN_H} from ${img.url}`);
  } catch (err) {
    await rm(terrainPath, { force: true });
    console.warn(`Terrain download failed, the game will generate terrain procedurally.\n  ${err.message}`);
  }

  // --------------------------------------------------------------- manifest
  dropped.sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    generatedAt: new Date().toISOString(),
    countryCount: countries.length,
    shapeSource: 'world-atlas countries-50m.json (Natural Earth)',
    factSource: facts.url,
    flagSource: 'https://flagcdn.com',
    terrain,
    terrainSource,
    terrainSize: [TERRAIN_W, TERRAIN_H],
    flagSizes: FLAG_HEIGHTS,
    dropped,
  };
  await writeFile(join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nIncluded ${countries.length} countries (${fixedBorders} one-way borders made symmetric).`);
  console.log(`Dropped ${dropped.length}:`);
  for (const d of dropped) console.log(`  - ${d.name}: ${d.reason}`);
  const perContinent = {};
  for (const c of countries) perContinent[c.continent] = (perContinent[c.continent] ?? 0) + 1;
  console.log('\nPer continent:', perContinent);
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message ?? err);
  process.exit(1);
});
