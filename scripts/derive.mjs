// Applies the hand-edited config files to the bundled country data, without downloading anything.
//   npm run derive
// It sets, for every country:
//   fame                      from config/fame.json
//   waters, watersAvoid       seas and oceans it borders, from config/geography.json
//   features, featuresAvoid   great rivers, deserts, ranges and rainforests, from config/geography.json
//   lines, linesAvoid         lines on the globe that cross it, computed from the map shapes
//   languages, languagesAvoid corrections to the official languages, from config/languages.json
//   lanes                     the sea lanes it has a coast on (where its ships can go), from config/geography.json
// The setup script calls the same functions, so a full rebuild gives the same result.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTRIES = join(ROOT, 'public', 'data', 'countries.json');
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

export async function deriveAll(countries, topology) {
  const boxes = landBoxes(topology);
  applyFame(countries, await loadConfig('fame'));
  const geography = await loadConfig('geography');
  applyGeography(countries, geography, boxes);
  applyGlobeLines(countries, boxes, geography.linesAvoid);
  applyLanes(countries, geography);
  applyLanguages(countries, await loadConfig('languages'));
  return countries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const countries = await deriveAll(JSON.parse(await readFile(COUNTRIES, 'utf8')), JSON.parse(await readFile(WORLD, 'utf8')));
  await writeFile(COUNTRIES, JSON.stringify(countries));
  const count = (test) => countries.filter(test).length;
  console.log(`Fame: ${[0, 1, 2].map((f) => count((c) => c.fame === f)).join(' / ')} (famous / mid-known / obscure).`);
  console.log(`Waters: ${count((c) => c.waters.length > 0)} countries. Features: ${count((c) => c.features.length > 0)}. Globe lines: ${count((c) => c.lines.length > 0)}.`);
  const lanes = [...new Set(countries.flatMap((c) => c.lanes))];
  console.log(`Sea lanes: ${lanes.map((lane) => `${lane} ${count((c) => c.lanes.includes(lane))}`).join(', ')}.`);
}
