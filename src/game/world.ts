import type { Continent, Country, Fact, ModeId } from './types';

/** The set of countries in play for one game mode, plus the full dataset for question distractors. */
export interface World {
  mode: ModeId;
  /** Every country in the bundled dataset. */
  all: Country[];
  byId: Record<string, Country>;
  /** Ids of the countries in play for this mode. */
  ids: string[];
  inPlay: Set<string>;
  /** Land neighbours restricted to countries in play. */
  neighbours: Record<string, string[]>;
  /** Countries in play grouped by continent. */
  continents: Partial<Record<Continent, string[]>>;
  /** Curated facts, by the country they are about. */
  factsByCountry: Record<string, Fact[]>;
  /** Every sea and ocean in the data, with the continents of the countries that border it. */
  waters: Map<string, Set<Continent>>;
  /** Every major feature in the data, with its kind and the continents it is found on. */
  features: Map<string, { kind: string; continents: Set<Continent> }>;
}

export function buildWorld(all: Country[], mode: ModeId, facts: readonly Fact[] = []): World {
  const byId: Record<string, Country> = {};
  for (const c of all) byId[c.id] = c;
  const ids = all.filter((c) => mode === 'World' || c.continent === mode).map((c) => c.id);
  const inPlay = new Set(ids);
  const neighbours: Record<string, string[]> = {};
  const continents: Partial<Record<Continent, string[]>> = {};
  for (const id of ids) {
    const c = byId[id];
    neighbours[id] = c.borders.filter((b) => inPlay.has(b));
    (continents[c.continent] ??= []).push(id);
  }
  const factsByCountry: Record<string, Fact[]> = {};
  for (const fact of facts) if (byId[fact.country]) (factsByCountry[fact.country] ??= []).push(fact);
  const waters: World['waters'] = new Map();
  const features: World['features'] = new Map();
  for (const c of all) {
    for (const name of c.waters ?? []) {
      if (!waters.has(name)) waters.set(name, new Set());
      waters.get(name)!.add(c.continent);
    }
    for (const feat of c.features ?? []) {
      if (!features.has(feat.name)) features.set(feat.name, { kind: feat.kind, continents: new Set() });
      features.get(feat.name)!.continents.add(c.continent);
    }
  }
  return { mode, all, byId, ids, inPlay, neighbours, continents, factsByCountry, waters, features };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two country centres, in km. */
export function distanceKm(a: Pick<Country, 'lat' | 'lng'>, b: Pick<Country, 'lat' | 'lng'>): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
