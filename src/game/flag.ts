// The player's empire flag: a preset pattern plus three colours, drawn as pixel art.
// Patterns are functions of position, so the same flag can be drawn at any pixel size
// (12x8 in the menu, 9x6 on the map).

export const FLAG_W = 12;
export const FLAG_H = 8;

export interface EmpireFlag {
  /** Index into FLAG_PATTERNS. */
  pattern: number;
  /** Three colours as #rrggbb; a pattern uses two or three of them. */
  colours: [string, string, string];
}

export interface Empire {
  name: string;
  flag: EmpireFlag;
}

export const EMPIRE_NAME_MAX = 22;

export const FLAG_COLOURS = [
  '#f4f4ec',
  '#1b1f33',
  '#d8343c',
  '#ef7d2e',
  '#ffcd3c',
  '#2fa84f',
  '#1fa2a0',
  '#5fb3f2',
  '#2b4fc4',
  '#7b3fb5',
  '#f078b4',
  '#8a5a3b',
] as const;

export interface FlagPattern {
  name: string;
  /** Colour slot (0, 1 or 2) at a point; u runs left to right and v top to bottom, both 0..1. */
  at: (u: number, v: number) => 0 | 1 | 2;
}

/** Distance from the centre, corrected for the flag being wider than it is tall. */
const radial = (u: number, v: number) => Math.hypot((u - 0.5) * (FLAG_W / FLAG_H), v - 0.5);

export const FLAG_PATTERNS: FlagPattern[] = [
  { name: 'Three bands', at: (_u, v) => (v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2) },
  { name: 'Three pales', at: (u) => (u < 1 / 3 ? 0 : u < 2 / 3 ? 1 : 2) },
  { name: 'Two bands', at: (_u, v) => (v < 0.5 ? 0 : 1) },
  { name: 'Two pales', at: (u) => (u < 0.5 ? 0 : 1) },
  { name: 'Nordic cross', at: (u, v) => ((u > 0.25 && u < 0.42) || (v > 0.375 && v < 0.625) ? 1 : 0) },
  { name: 'Centre cross', at: (u, v) => ((u > 0.41 && u < 0.59) || (v > 0.375 && v < 0.625) ? 1 : 0) },
  {
    name: 'Saltire',
    at: (u, v) => (Math.abs(u - v) < 0.14 || Math.abs(u + v - 1) < 0.14 ? 1 : 0),
  },
  { name: 'Sun disc', at: (u, v) => (radial(u, v) < 0.3 ? 1 : 0) },
  { name: 'Canton', at: (u, v) => (u < 0.42 && v < 0.5 ? 1 : Math.floor(v * 4) % 2 === 1 ? 2 : 0) },
  { name: 'Hoist triangle', at: (u, v) => (u < 0.5 - Math.abs(v - 0.5) ? 1 : v < 0.5 ? 0 : 2) },
  { name: 'Diagonal', at: (u, v) => (Math.abs(u - v) < 0.12 ? 2 : u > v ? 0 : 1) },
  { name: 'Five stripes', at: (_u, v) => (Math.floor(v * 5) % 2 === 0 ? 0 : 1) },
  {
    name: 'Bordered',
    at: (u, v) => (u < 0.1 || u > 0.9 || v < 0.14 || v > 0.86 ? 1 : radial(u, v) < 0.2 ? 2 : 0),
  },
  { name: 'Quartered', at: (u, v) => (u < 0.5 === v < 0.5 ? 0 : 1) },
  {
    name: 'Diamond',
    at: (u, v) => (Math.abs(u - 0.5) + Math.abs(v - 0.5) * 1.1 < 0.4 ? (radial(u, v) < 0.17 ? 2 : 1) : 0),
  },
  {
    name: 'Centre pale',
    at: (u, v) => (u < 0.28 || u > 0.72 ? 0 : radial(u, v) < 0.2 ? 2 : 1),
  },
];

export const DEFAULT_FLAG: EmpireFlag = { pattern: 0, colours: ['#d8343c', '#f4f4ec', '#2b4fc4'] };

/** Colour slot of every pixel of a flag drawn at width x height, row by row. Sampled at pixel centres. */
export function flagPixels(pattern: number, width = FLAG_W, height = FLAG_H): Uint8Array {
  const at = (FLAG_PATTERNS[pattern] ?? FLAG_PATTERNS[0]).at;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = at((x + 0.5) / width, (y + 0.5) / height);
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Parses "#rrggbb" into [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Returns a usable empire from untrusted input (a save file, stored preferences), or null. */
export function sanitizeEmpire(raw: unknown): Empire | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, flag } = raw as Partial<Empire>;
  if (typeof name !== 'string' || !flag || typeof flag !== 'object') return null;
  const { pattern, colours } = flag as Partial<EmpireFlag>;
  if (!Number.isInteger(pattern) || pattern! < 0 || pattern! >= FLAG_PATTERNS.length) return null;
  if (!Array.isArray(colours) || colours.length !== 3 || !colours.every((c) => typeof c === 'string' && HEX.test(c))) return null;
  return {
    name: cleanEmpireName(name),
    flag: { pattern: pattern!, colours: [colours[0], colours[1], colours[2]] },
  };
}

export function cleanEmpireName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, EMPIRE_NAME_MAX);
}

/** The name used when the player leaves the field empty. */
export function defaultEmpireName(startCountryName: string): string {
  return cleanEmpireName(`Empire of ${startCountryName}`) || 'The Empire';
}
