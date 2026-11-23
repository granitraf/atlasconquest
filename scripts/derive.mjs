// Applies the hand-edited config files to the bundled country data, without downloading anything.
//   npm run derive
// It sets, for every country:
//   fame                      from config/fame.json
//   waters, watersAvoid       seas and oceans it borders, from config/geography.json
//   features, featuresAvoid   great rivers, deserts, ranges and rainforests, from config/geography.json
//   lines, linesAvoid         lines on the globe that cross it, computed from the map shapes
//   languages, languagesAvoid corrections to the official languages, from config/languages.json
//   lanes                     the sea lanes it has a coast on (where its ships can go), from config/geography.json
//   cities                    well-known cities other than the capital, from config/cities.json
//   independence              the year it gained independence, from config/independence.json
//   flagKin                   the flags most like its own in colour and layout, worked out from the flag images
// The setup script calls the same functions, so a full rebuild gives the same result.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTRIES = join(ROOT, 'public', 'data', 'countries.json');
const FLAGS = join(ROOT, 'public', 'flags', 'l');
const WORLD = join(ROOT, 'public', 'data', 'world.json');

export const loadConfig = async (name) => JSON.parse(await readFile(join(ROOT, 'config', `${name}.json`), 'utf8'));

/** Sets `fame` (0 famous, 1 mid-known, 2 obscure) on every country. Throws on a name it does not recognise. */
export function applyFame(countries, config) {
  const names = new Set(countries.map((c) => c.name));
  const lists = { famous: 0, familiar: 1, obscure: 2 };
  const assigned = new Map();
  for (const [list, fame] of Object.entries(lists)) {
    for (const name of config[list] ?? []) {
      if (!names.has(name)) throw new Error(`config/fame.json: "${name}" in "${list}" is not a country in the game`);
      if (assigned.has(name)) throw new Error(`config/fame.json: "${name}" is listed twice`);
      assigned.set(name, fame);
    }
  }
  for (const c of countries) {
    c.fame = assigned.get(c.name) ?? (c.population < config.obscureBelowPopulation ? 2 : 1);
  }
  return countries;
}

/** Latitude/longitude box of every separate landmass of every country: id -> [[west, south, east, north], …]. */
export function landBoxes(topology) {
  const boxes = new Map();
  for (const f of feature(topology, topology.objects.countries).features) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const list = boxes.get(String(f.id)) ?? [];
    for (const polygon of polygons) {
      let w = Infinity;
      let s = Infinity;
      let e = -Infinity;
      let n = -Infinity;
      for (const [lon, lat] of polygon[0]) {
        w = Math.min(w, lon);
        e = Math.max(e, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
      list.push([w, s, e, n]);
    }
    boxes.set(String(f.id), list);
  }
  return boxes;
}

const LINES = [
  { name: 'Equator', lat: 0 },
  { name: 'Tropic of Cancer', lat: 23.4366 },
  { name: 'Tropic of Capricorn', lat: -23.4366 },
  { name: 'Arctic Circle', lat: 66.5634 },
  { name: 'Prime Meridian', lon: 0 },
];
/** A line must clear a landmass's edge by this many degrees to count as crossing it. */
const LINE_MARGIN = 0.15;

/**
 * `lines`: the line clearly crosses one of the country's landmasses.
 * `linesAvoid`: it passes between the country's islands or grazes its edge, so it is neither a right nor a wrong answer.
 */
export function applyGlobeLines(countries, boxes, overrides = {}) {
  for (const c of countries) {
    const list = boxes.get(c.id) ?? [];
    c.lines = [];
    c.linesAvoid = [];
    for (const line of LINES) {
      const span = (box) => (line.lat !== undefined ? [box[1], box[3], line.lat] : [box[0], box[2], line.lon]);
      // A landmass wrapping the antimeridian has a meaningless longitude span; ignore it for the meridian.
      const usable = list.filter((box) => line.lat !== undefined || box[2] - box[0] < 180);
      const crosses = usable.some((box) => {
        const [lo, hi, at] = span(box);
        return lo < at - LINE_MARGIN && hi > at + LINE_MARGIN;
      });
      if (crosses) {
        c.lines.push(line.name);
        continue;
      }
      const all = usable.map(span);
      const lo = Math.min(...all.map((s) => s[0]));
      const hi = Math.max(...all.map((s) => s[1]));
      const at = line.lat ?? line.lon;
      if (all.length > 0 && lo < at + LINE_MARGIN && hi > at - LINE_MARGIN) c.linesAvoid.push(line.name);
    }
    // Hand overrides, for shapes that include disputed land.
    for (const name of overrides[c.id] ?? []) {
      c.lines = c.lines.filter((line) => line !== name);
      if (!c.linesAvoid.includes(name)) c.linesAvoid.push(name);
    }
  }
  return countries;
}

const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Sets waters / watersAvoid / features / featuresAvoid from config/geography.json. */
export function applyGeography(countries, config, boxes) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  const check = (ids, where) => {
    for (const id of ids) if (!byId.has(id)) throw new Error(`config/geography.json: unknown country code "${id}" in ${where}`);
  };
  for (const c of countries) Object.assign(c, { waters: [], watersAvoid: [], features: [], featuresAvoid: [] });

  const waterByName = new Map(config.waters.map((w) => [w.name, w]));
  for (const water of config.waters) {
    check(water.countries, water.name);
    check(water.avoid ?? [], water.name);
    const avoid = new Set(water.avoid ?? []);
    // A country on a sea is never offered that sea's ocean as a wrong answer.
    for (const child of config.waters) {
      if (child.parent !== water.name) continue;
      if (!waterByName.has(child.parent)) throw new Error(`config/geography.json: unknown parent "${child.parent}"`);
      for (const id of child.countries) avoid.add(id);
    }
    // Safety net: any coastal country reaching into the body's rough box is treated as arguable.
    if (water.box) {
      for (const c of countries) {
        if (!c.landlocked && (boxes.get(c.id) ?? []).some((box) => intersects(box, water.box))) avoid.add(c.id);
      }
    }
    for (const id of water.countries) {
      // Only coastal countries can border a sea (the Caspian's landlocked neighbours are listed under avoid).
      if (byId.get(id).landlocked) throw new Error(`config/geography.json: ${id} is landlocked but listed on ${water.name}`);
      byId.get(id).waters.push(water.name);
      avoid.delete(id);
    }
    for (const id of avoid) byId.get(id).watersAvoid.push(water.name);
  }

  for (const feat of config.features) {
    check(feat.countries, feat.name);
    check(feat.avoid ?? [], feat.name);
    for (const id of feat.countries) byId.get(id).features.push({ name: feat.name, kind: feat.kind });
    for (const id of feat.avoid ?? []) byId.get(id).featuresAvoid.push(feat.name);
  }
  return countries;
}

/**
 * Sets `lanes`: the sea lanes each country has a coast on. A sea crossing needs a lane in common.
 * Every coastal country must end up on at least one, or it could never be reached or leave by sea.
 */
export function applyLanes(countries, config) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  const { byWater, add = {} } = config.lanes;
  for (const c of countries) c.lanes = [];
  const put = (id, lane, where) => {
    const c = byId.get(id);
    if (!c) throw new Error(`config/geography.json: unknown country code "${id}" in lanes (${where})`);
    if (!c.landlocked && !c.lanes.includes(lane)) c.lanes.push(lane);
  };
  for (const water of config.waters) {
    const lane = byWater[water.name];
    if (!lane) throw new Error(`config/geography.json: "${water.name}" has no lane in lanes.byWater`);
    for (const id of water.countries) put(id, lane, water.name);
  }
  const known = new Set(Object.values(byWater));
  for (const [lane, ids] of Object.entries(add)) {
    if (!known.has(lane)) throw new Error(`config/geography.json: lanes.add names an unknown lane "${lane}"`);
    for (const id of ids) put(id, lane, `add.${lane}`);
  }
  const adrift = countries.filter((c) => !c.landlocked && c.lanes.length === 0).map((c) => c.name);
  if (adrift.length > 0) throw new Error(`config/geography.json: coastal countries on no sea lane: ${adrift.join(', ')}`);
  return countries;
}

/**
 * Applies config/languages.json: `ask` replaces a country's languages (only these can be the answer),
 * `avoid` lists languages never offered for it at all. Throws on a country it does not recognise.
 */
export function applyLanguages(countries, config) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  for (const c of countries) c.languagesAvoid = [];
  for (const [id, rule] of Object.entries(config.countries ?? {})) {
    const c = byId.get(id);
    if (!c) throw new Error(`config/languages.json: unknown country "${id}"`);
    if (rule.ask) {
      if (rule.ask.length === 0) throw new Error(`config/languages.json: "${id}" needs at least one language to ask about`);
      c.languages = [...rule.ask];
    }
    c.languagesAvoid = (rule.avoid ?? []).filter((language) => !c.languages.includes(language));
  }
  return countries;
}

/**
 * Sets `cities` from config/cities.json: other cities of the country, offered as wrong answers to its
 * capital question. Throws if a listed city is a capital (its own or anyone else's).
 */
export function applyCities(countries, config) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  const capitals = new Map(countries.filter((c) => c.capital).map((c) => [c.capital, c.name]));
  for (const c of countries) c.cities = [];
  for (const [id, cities] of Object.entries(config.cities)) {
    const c = byId.get(id);
    if (!c) throw new Error(`config/cities.json: unknown country "${id}"`);
    for (const city of cities) {
      if (capitals.has(city)) throw new Error(`config/cities.json: "${city}" (${id}) is the capital of ${capitals.get(city)}`);
    }
    if (new Set(cities).size !== cities.length) throw new Error(`config/cities.json: a city is listed twice for "${id}"`);
    c.cities = [...cities];
  }
  return countries;
}

/**
 * Sets `independence` ({ year, also }) from config/independence.json, or null for a country with no
 * clear date. `also` holds other significant years, which wrong options are kept away from.
 */
export function applyIndependence(countries, config) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  for (const c of countries) c.independence = null;
  for (const [id, entry] of Object.entries(config.countries)) {
    const c = byId.get(id);
    if (!c) throw new Error(`config/independence.json: unknown country "${id}"`);
    if (!Number.isInteger(entry.year) || entry.year < 1500 || entry.year > 2100) throw new Error(`config/independence.json: bad year for "${id}"`);
    c.independence = { year: entry.year, also: [...(entry.also ?? [])] };
  }
  return countries;
}

// ------------------------------------------------------------------ flag likeness
//
// Each flag is boiled down to which colours it uses and where: every pixel of a small copy is put in
// one of a dozen colour bins, for the whole flag and for each cell of a 3 x 3 grid. Two flags are alike
// when they use the same set of colours in similar amounts (which is most of it) in similar places.

const FLAG_W = 24;
const FLAG_H = 16;
const BINS = ['white', 'black', 'red', 'orange', 'yellow', 'green', 'sky', 'blue', 'purple', 'pink'];
/** How many of the most similar flags are kept for each country. */
export const FLAG_KIN = 10;
/** A colour has to cover this much of a flag to count as one of "its colours". */
const COLOUR_SHARE = 0.06;

function colourBin(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const light = (max + min) / 2;
  const spread = max - min;
  const saturation = spread === 0 ? 0 : spread / (1 - Math.abs(2 * light - 1));
  if (light >= 0.9 || (light >= 0.78 && saturation <= 0.4)) return 'white';
  if (light <= 0.14) return 'black';
  if (saturation <= 0.2) return light > 0.5 ? 'white' : 'black';
  let hue;
  if (max === r / 255) hue = ((g - b) / 255 / spread + 6) % 6;
  else if (max === g / 255) hue = (b - r) / 255 / spread + 2;
  else hue = (r - g) / 255 / spread + 4;
  hue *= 60;
  if (hue < 18 || hue >= 340) return 'red';
  if (hue < 42) return 'orange';
  if (hue < 68) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 200) return 'sky';
  if (hue < 262) return light > 0.62 ? 'sky' : 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

async function flagSignature(sharp, file) {
  const { data } = await sharp(file).resize(FLAG_W, FLAG_H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const whole = Object.fromEntries(BINS.map((bin) => [bin, 0]));
  const cells = Array.from({ length: 9 }, () => Object.fromEntries(BINS.map((bin) => [bin, 0])));
  for (let y = 0; y < FLAG_H; y++) {
    for (let x = 0; x < FLAG_W; x++) {
      const i = (y * FLAG_W + x) * 3;
      const bin = colourBin(data[i], data[i + 1], data[i + 2]);
      whole[bin] += 1 / (FLAG_W * FLAG_H);
      const cell = Math.min(2, Math.floor((y * 3) / FLAG_H)) * 3 + Math.min(2, Math.floor((x * 3) / FLAG_W));
      cells[cell][bin] += 9 / (FLAG_W * FLAG_H);
    }
  }
  return { whole, cells, colours: new Set(BINS.filter((bin) => whole[bin] >= COLOUR_SHARE)) };
}

/** 0 for the same flag, towards 1 for flags with nothing in common. */
function flagDistance(a, b) {
  const gap = (x, y) => BINS.reduce((sum, bin) => sum + Math.abs(x[bin] - y[bin]), 0) / 2;
  const shared = [...a.colours].filter((bin) => b.colours.has(bin)).length;
  const union = new Set([...a.colours, ...b.colours]).size;
  const palette = union === 0 ? 0 : 1 - shared / union;
  const layout = a.cells.reduce((sum, cell, i) => sum + gap(cell, b.cells[i]), 0) / 9;
  return 0.45 * palette + 0.35 * gap(a.whole, b.whole) + 0.2 * layout;
}

/**
 * Sets `flagKin`: for each country, the ids of the FLAG_KIN countries whose flags look most like its
 * own, most alike first. Countries that fly the very same flag are left out.
 */
export async function applyFlagKin(countries) {
  const { default: sharp } = await import('sharp');
  const signature = new Map();
  for (const c of countries) signature.set(c.id, c.cca2 ? await flagSignature(sharp, join(FLAGS, `${c.cca2}.png`)) : null);
  for (const c of countries) {
    const mine = signature.get(c.id);
    c.flagKin = !mine
      ? []
      : countries
          .filter((o) => o.id !== c.id && o.flagKey !== c.flagKey && signature.get(o.id))
          .map((o) => ({ id: o.id, d: flagDistance(mine, signature.get(o.id)) }))
          .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
          .slice(0, FLAG_KIN)
          .map((o) => o.id);
  }
  return countries;
}

export async function deriveAll(countries, topology) {
  const boxes = landBoxes(topology);
  applyFame(countries, await loadConfig('fame'));
  const geography = await loadConfig('geography');
  applyGeography(countries, geography, boxes);
  applyGlobeLines(countries, boxes, geography.linesAvoid);
  applyLanes(countries, geography);
  applyCities(countries, await loadConfig('cities'));
  applyIndependence(countries, await loadConfig('independence'));
  await applyFlagKin(countries);
  applyLanguages(countries, await loadConfig('languages'));
  return countries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const countries = await deriveAll(JSON.parse(await readFile(COUNTRIES, 'utf8')), JSON.parse(await readFile(WORLD, 'utf8')));
  await writeFile(COUNTRIES, JSON.stringify(countries));
  const count = (test) => countries.filter(test).length;
  console.log(`Fame: ${[0, 1, 2].map((f) => count((c) => c.fame === f)).join(' / ')} (famous / mid-known / obscure).`);
  console.log(`Waters: ${count((c) => c.waters.length > 0)} countries. Features: ${count((c) => c.features.length > 0)}. Globe lines: ${count((c) => c.lines.length > 0)}.`);
  console.log(`Cities: ${count((c) => c.cities.length > 0)} countries have at least one besides the capital.`);
  console.log(`Independence: ${count((c) => c.independence)} countries have a year.`);
  const names = new Map(countries.map((c) => [c.id, c.name]));
  for (const id of ['AND', 'IRL', 'DEU', 'JPN', 'USA']) console.log(`Flags most like ${names.get(id)}: ${countries.find((c) => c.id === id).flagKin.map((k) => names.get(k)).join(', ')}.`);
  const lanes = [...new Set(countries.flatMap((c) => c.lanes))];
  console.log(`Sea lanes: ${lanes.map((lane) => `${lane} ${count((c) => c.lanes.includes(lane))}`).join(', ')}.`);
}
