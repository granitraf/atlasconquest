import type { Topology } from 'topojson-specification';
import { DEFAULT_FLAG, sanitizeEmpire, type Empire } from './game/flag';
import { reviveGame } from './game/state';
import { MODES, type Country, type Fact, type GameState, type ModeId } from './game/types';
import { buildWorld, type World } from './game/world';
import { buildMapGeometry, type MapGeometry } from './map/geo';
import { generateTerrain, probeImage } from './map/terrain';

const BASE = import.meta.env.BASE_URL;
const SAVE_KEY = 'atlas-conquest:save:v1';
const EMPIRE_KEY = 'atlas-conquest:empire:v1';

export interface Manifest {
  countryCount: number;
  terrain: 'bluemarble' | 'procedural';
  dropped: { name: string; reason: string }[];
}

export interface GameData {
  countries: Country[];
  byId: Record<string, Country>;
  worlds: Record<ModeId, World>;
  geometry: MapGeometry;
  terrainUrl: string;
  terrainKind: 'bluemarble' | 'procedural';
}

export type FlagSize = 's' | 'l';
/** Country flags are small pixel-art PNGs (12 and 32 px tall) meant to be shown at twice their size. */
export const flagUrl = (cca2: string, size: FlagSize = 's') => `${BASE}flags/${size}/${cca2}.png`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}). Run "npm run setup" to build the game data.`);
  return (await res.json()) as T;
}

/** Loads the bundled data. Everything comes from /public; nothing here touches the network beyond this origin. */
export async function loadGameData(): Promise<GameData> {
  const [facts, topology, manifest, curated] = await Promise.all([
    getJson<Country[]>('countries.json'),
    getJson<Topology>('world.json'),
    getJson<Manifest>('manifest.json'),
    getJson<{ facts: Fact[] }>('facts.json'),
  ]);

  const geometry = buildMapGeometry(topology, new Set(facts.map((c) => c.id)));
  // Belt and braces: a country is only playable with both facts and a drawable shape.
  const countries = facts.filter((c) => geometry.byId[c.id]);
  const lost = facts.filter((c) => !geometry.byId[c.id]).map((c) => ({ name: c.name, reason: 'shape could not be drawn' }));
  const dropped = [...manifest.dropped, ...lost];
  if (dropped.length > 0) {
    console.info(
      `Atlas Conquest: ${countries.length} countries in play, ${dropped.length} dropped for lacking a map shape or complete facts:\n` +
        dropped.map((d) => `  ${d.name}: ${d.reason}`).join('\n'),
    );
  }

  // Blue Marble if it was bundled and decodes; otherwise terrain generated from the land shapes.
  const forceProcedural = new URLSearchParams(location.search).get('terrain') === 'procedural';
  let terrainUrl = `${BASE}data/terrain.png`;
  let terrainKind: GameData['terrainKind'] = 'bluemarble';
  try {
    if (forceProcedural || manifest.terrain !== 'bluemarble') throw new Error('no bundled terrain image');
    await probeImage(terrainUrl);
  } catch {
    terrainUrl = generateTerrain(geometry);
    terrainKind = 'procedural';
  }

  const worlds = Object.fromEntries(MODES.map((mode) => [mode, buildWorld(countries, mode, curated.facts)])) as Record<ModeId, World>;
  return {
    countries,
    byId: Object.fromEntries(countries.map((c) => [c.id, c])),
    worlds,
    geometry,
    terrainUrl,
    terrainKind,
  };
}

export function loadSave(data: GameData): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return reviveGame(JSON.parse(raw), (mode) => data.worlds[mode] ?? null);
  } catch {
    return null;
  }
}

export function writeSave(state: GameState | null): void {
  try {
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be full or blocked (private mode). The game still plays; it just will not resume.
  }
}

/** The empire name and flag the player last designed, so they do not have to redo it every game. */
export function loadEmpire(): Empire {
  try {
    const saved = sanitizeEmpire(JSON.parse(localStorage.getItem(EMPIRE_KEY) ?? 'null'));
    if (saved) return saved;
  } catch {
    // Fall through to a fresh empire.
  }
  return { name: '', flag: DEFAULT_FLAG };
}

export function saveEmpire(empire: Empire): void {
  try {
    localStorage.setItem(EMPIRE_KEY, JSON.stringify(empire));
  } catch {
    // Not being able to remember it is fine.
  }
}
