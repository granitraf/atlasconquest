import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLAG,
  EMPIRE_NAME_MAX,
  FLAG_COLOURS,
  FLAG_H,
  FLAG_PATTERNS,
  FLAG_W,
  defaultEmpireName,
  flagPixels,
  hexToRgb,
  sanitizeEmpire,
} from '../src/game/flag';

const picture = (pattern: number, w = FLAG_W, h = FLAG_H) => {
  const px = flagPixels(pattern, w, h);
  return Array.from({ length: h }, (_, y) => [...px.slice(y * w, (y + 1) * w)].join(''));
};

describe('empire flags', () => {
  it('offers 16 presets and 12 colours', () => {
    expect(FLAG_PATTERNS).toHaveLength(16);
    expect(FLAG_COLOURS).toHaveLength(12);
    expect(new Set(FLAG_PATTERNS.map((p) => p.name)).size).toBe(16);
  });

  it('every preset uses at least two colour slots and only slots 0 to 2', () => {
    FLAG_PATTERNS.forEach((_, i) => {
      const used = new Set(flagPixels(i));
      expect(used.size, FLAG_PATTERNS[i].name).toBeGreaterThanOrEqual(2);
      for (const slot of used) expect([0, 1, 2]).toContain(slot);
    });
  });

  it('every preset looks different, at menu size and at map size', () => {
    for (const [w, h] of [[FLAG_W, FLAG_H], [9, 6]]) {
      const drawn = FLAG_PATTERNS.map((_, i) => picture(i, w, h).join('/'));
      expect(new Set(drawn).size).toBe(16);
    }
  });

  it('draws recognisable shapes', () => {
    expect(picture(0)).toEqual([
      '000000000000',
      '000000000000',
      '000000000000',
      '111111111111',
      '111111111111',
      '222222222222',
      '222222222222',
      '222222222222',
    ]);
    // Nordic cross: an off-centre upright and a centred bar.
    expect(picture(4)).toEqual([
      '000110000000',
      '000110000000',
      '000110000000',
      '111111111111',
      '111111111111',
      '000110000000',
      '000110000000',
      '000110000000',
    ]);
    // Sun disc: symmetric left to right and top to bottom.
    const disc = picture(7);
    expect(disc).toEqual([...disc].reverse());
    for (const row of disc) expect(row).toBe([...row].reverse().join(''));
    expect(disc[3]).toMatch(/^0+1+0+$/);
  });

  it('parses colours', () => {
    expect(hexToRgb('#d8343c')).toEqual([216, 52, 60]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });
});

describe('empire details', () => {
  it('names an empire after its home country when the player leaves the name empty', () => {
    expect(defaultEmpireName('Peru')).toBe('Empire of Peru');
    expect(defaultEmpireName('Saint Vincent and the Grenadines').length).toBeLessThanOrEqual(EMPIRE_NAME_MAX);
  });

  it('accepts a valid saved empire and rejects anything else', () => {
    expect(sanitizeEmpire({ name: ' Rome ', flag: DEFAULT_FLAG })).toEqual({ name: 'Rome', flag: DEFAULT_FLAG });
    // A saved name that no longer passes becomes "New Empire"; the flag is kept.
    expect(sanitizeEmpire({ name: 'Nazi Empire', flag: DEFAULT_FLAG })).toEqual({ name: 'New Empire', flag: DEFAULT_FLAG });
    expect(sanitizeEmpire({ name: 'x'.repeat(80), flag: DEFAULT_FLAG })!.name).toBe('New Empire');
    expect(sanitizeEmpire(null)).toBeNull();
    expect(sanitizeEmpire({ name: 'Rome' })).toBeNull();
    expect(sanitizeEmpire({ name: 'Rome', flag: { pattern: 16, colours: DEFAULT_FLAG.colours } })).toBeNull();
    expect(sanitizeEmpire({ name: 'Rome', flag: { pattern: 1, colours: ['red', '#fff', '#000000'] } })).toBeNull();
    expect(sanitizeEmpire({ name: 'Rome', flag: { pattern: 1, colours: ['#ffffff', '#000000'] } })).toBeNull();
  });
});
