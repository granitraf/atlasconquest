import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultEmpireName, savedEmpireName } from '../src/game/flag';
import type { Country } from '../src/game/types';
import {
  ALLOWED_NAMES,
  BLOCKED_TERMS,
  EMPIRE_NAME_MAX,
  EMPIRE_NAME_MIN,
  NEW_EMPIRE,
  hasBlockedTerm,
  typedName,
  validateEmpireName,
} from '../src/names/validateEmpireName';

const ALL: Country[] = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const NAMES = JSON.parse(readFileSync(new URL('./fixtures/empire-names.json', import.meta.url), 'utf8')) as {
  valid: string[];
  invalidCharacters: string[];
  tooShort: string[];
  tooLong: string[];
  slurs: Record<'plain' | 'spaced' | 'stretched' | 'mixedCase' | 'embedded', string[]>;
  allowlisted: string[];
};
const SLURS = Object.values(NAMES.slurs).flat();
const reasonOf = (name: string) => validateEmpireName(name).reason;

/** Every country, capital and city in the game, as a player could type it: letters and apostrophes, 3 to 24 characters. */
const PLACES = [...new Set(ALL.flatMap((c) => [c.name, c.capital, ...(c.cities ?? [])]))]
  .filter(Boolean)
  .map((place) => place.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]+/g, ' ').replace(/\s+/g, ' ').trim())
  .filter((place) => place.length >= EMPIRE_NAME_MIN && place.length <= EMPIRE_NAME_MAX);

describe('validateEmpireName: the format', () => {
  it('passes ordinary names, tidied', () => {
    for (const name of NAMES.valid) expect(validateEmpireName(name), name).toEqual({ valid: true, reason: 'ok', name });
    expect(validateEmpireName('  New    Rome ')).toEqual({ valid: true, reason: 'ok', name: 'New Rome' });
  });

  it('refuses numbers, symbols, punctuation, emoji and accented or look-alike letters', () => {
    for (const name of NAMES.invalidCharacters) expect(reasonOf(name), name).toBe('invalid_characters');
    expect(reasonOf(42 as unknown as string)).toBe('invalid_characters');
  });

  it('refuses names shorter than 3 or longer than 24 characters, and says which', () => {
    for (const name of NAMES.tooShort) expect(reasonOf(name), name).toBe('too_short');
    for (const name of NAMES.tooLong) expect(reasonOf(name), name).toBe('too_long');
    expect(reasonOf('Abc')).toBe('ok');
    expect(reasonOf('Abcdefghijklmnopqrstuvwx')).toBe('ok');
    expect(reasonOf('Abcdefghijklmnopqrstuvwxy')).toBe('too_long');
    expect(reasonOf('   ')).toBe('empty');
  });

  it('lets only letters and single spaces into the field as the player types', () => {
    expect(typedName('N1gg@ 88 Empire!!')).toBe('Ngg Empire');
    expect(typedName('New  Rome')).toBe('New Rome');
    expect(typedName(' Rome')).toBe('Rome');
    expect(typedName('New ')).toBe('New ');
    expect(typedName('Café 🦅 Royale')).toBe('Caf Royale');
    expect(typedName('King’s Realm')).toBe("King's Realm");
    expect(typedName("'Rome''s  Land")).toBe("Rome's Land");
    expect(validateEmpireName('King’s Realm')).toEqual({ valid: true, reason: 'ok', name: "King's Realm" });
    expect(typedName('x'.repeat(40))).toHaveLength(EMPIRE_NAME_MAX);
  });
});

describe('validateEmpireName: slurs and profanity', () => {
  it.each(Object.entries(NAMES.slurs))('refuses them %s', (_form, names) => {
    expect(names.filter((name) => reasonOf(name) !== 'not_allowed')).toEqual([]);
  });

  it('says only that a name is not allowed, never which word', () => {
    const result = validateEmpireName('Big Nigger Land');
    expect(result).toEqual({ valid: false, reason: 'not_allowed', name: 'Big Nigger Land' });
  });

  it('passes the allowlisted place names and words', () => {
    expect(NAMES.allowlisted.filter((name) => !validateEmpireName(name).valid)).toEqual([]);
  });

  it('only lets an allowlisted word through whole: it does not unlock what surrounds it', () => {
    for (const name of ['Essex Nigger', 'Japan Fuck', 'Essexfuck', 'Pakistan Nazi']) expect(reasonOf(name), name).toBe('not_allowed');
  });

  it('never refuses a country, capital or city in the game', () => {
    expect(PLACES.length).toBeGreaterThan(400);
    expect(PLACES.filter((place) => !validateEmpireName(place).valid)).toEqual([]);
  });

  it('keeps its word lists simple to edit: lower-case letters, no repeats', () => {
    for (const term of BLOCKED_TERMS) expect(term).toMatch(/^[a-z]+$/);
    for (const name of ALLOWED_NAMES) expect(name).toMatch(/^[a-z]+( [a-z]+)*$/);
    expect(new Set(BLOCKED_TERMS).size).toBe(BLOCKED_TERMS.length);
    expect(new Set(ALLOWED_NAMES).size).toBe(ALLOWED_NAMES.length);
    // Every blocklisted term is itself refused.
    expect(BLOCKED_TERMS.filter((term) => term.length >= EMPIRE_NAME_MIN && validateEmpireName(term).valid)).toEqual([]);
  });
});

describe('names the game makes or loads', () => {
  it('names an unnamed empire after its home country with a name that passes, for every country', () => {
    expect(defaultEmpireName('Japan')).toBe('Empire of Japan');
    expect(defaultEmpireName('Germany')).toBe('Empire of Germany');
    expect(defaultEmpireName('Côte d’Ivoire')).toBe("Empire of Cote d'Ivoire");
    expect(defaultEmpireName('Bosnia and Herzegovina')).toBe('Bosnia and Herzegovina');
    expect(defaultEmpireName('Saint Vincent and the Grenadines')).toBe(NEW_EMPIRE);
    for (const c of ALL) expect(validateEmpireName(defaultEmpireName(c.name)).valid, c.name).toBe(true);
  });

  it('replaces a saved name that no longer passes with "New Empire", and keeps one that does', () => {
    expect(savedEmpireName('Granit Empire')).toBe('Granit Empire');
    expect(savedEmpireName(' New   Rome ')).toBe('New Rome');
    expect(savedEmpireName('')).toBe('');
    expect(savedEmpireName('Empire of Germany')).toBe('Empire of Germany');
    for (const name of ['The Greatest Empire Ever Built', 'Sh1t Kingdom', 'Nazi Empire', 'Ro']) expect(savedEmpireName(name), name).toBe(NEW_EMPIRE);
    expect(validateEmpireName(NEW_EMPIRE).valid).toBe(true);
  });
});

describe('the database applies the same name rules', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;');
    await db.exec(SQL);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });

  it('carries the current word lists (npm run names)', () => {
    expect(() => execFileSync(process.execPath, ['scripts/names-sql.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('agrees with the game on the format and the custom lists, for every test name and every place', async () => {
    const names = [...NAMES.valid, ...NAMES.invalidCharacters, ...NAMES.tooShort, ...NAMES.tooLong, ...SLURS, ...NAMES.allowlisted, ...PLACES, ...BLOCKED_TERMS];
    const rows = (await db.query<{ name: string; ok: boolean }>('select n as name, public.atlas_name_allowed(n) as ok from unnest($1::text[]) as n', [names])).rows;
    const game = (name: string) => {
      const checked = validateEmpireName(name);
      // The database checks the format and the custom lists, not the obscenity library's.
      return checked.reason === 'ok' || (checked.reason === 'not_allowed' && !hasBlockedTerm(checked.name));
    };
    expect(rows.filter((r) => r.ok !== game(r.name)).map((r) => `${r.name}: database ${r.ok ? 'allows' : 'refuses'} it`)).toEqual([]);
    // Whatever the database lets through, the game would too: it is never the stricter of the two.
    expect(rows.filter((r) => r.ok && !validateEmpireName(r.name).valid && hasBlockedTerm(r.name))).toEqual([]);
  });

  it('refuses a run under a name that fails, and stores one that passes', async () => {
    // A run of today's Daily Game, from the country the database says the day starts in.
    const submit = (name: string) =>
      db.query(
        "select public.submit_run('00000000-0000-4000-8000-000000000001', public.atlas_today(), 'World', $1, 0, array['#d8343c','#f4f4ec','#2b4fc4'], public.atlas_daily_country(public.atlas_today()), 0, 0, 0, 1, 0, 'defeat') as rank",
        [name],
      );
    for (const name of ['N I G G A', 'Kikeland', "N'igger Land", 'N1gga', 'Ro', 'The Greatest Empire Ever Built', "'Tis Rome"]) await expect(submit(name), name).rejects.toThrow('That empire name is not allowed.');
    expect((await submit('  King’s   Realm ')).rows).toEqual([{ rank: 1 }]);
    expect((await db.query('select empire_name from public.runs')).rows).toEqual([{ empire_name: "King's Realm" }]);
  });
});
