import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPIRE_NAME_MAX, cleanEmpireName, defaultEmpireName } from '../src/game/flag';
import { LEET_FROM, LEET_TO, LOOKALIKE_FROM, LOOKALIKE_TO, nameAllowed, plainName } from '../src/game/names';
import type { Country } from '../src/game/types';

const ALL: Country[] = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

/** Names no empire may carry: the terms, and the disguises players use to slip them past a filter. */
const REFUSED = [
  // Numbers and symbols for letters.
  'n1gga', 'N1GG3R', 'nigg@', 'sh!t', 'sh1t empire', '5h17', 'b1tch', 'B!tch Empire', 'a$$', 'Dumb@ss', 'phuck',
  // Spaced, dotted, run together, stretched.
  'N I G G A', 'n.i.g.g.e.r', 'f u c k', 'Mother F u c k e r', 's h i t', 'A S S', 'sh.it', 'xXfuckXx', 'niiiigger', 'fuuuck', 'Niggaz', 'NIGGERS',
  // Starred out, letters dropped, letters swapped.
  'f*ck', 'f**k', 'n*gga', 'fvck', 'fuk empire',
  // Look-alike letters: full width, Cyrillic, accents.
  'ｆｕｃｋ', 'fцck', 'nіgga', 'NІGGA', 'Fück', 'fücking',
  // Slurs.
  'Wetback', 'Raghead', 'Gook', 'Beaner', 'Spic Squad', 'Chink Empire', 'Kike', 'Tranny', 'Fag Lords', 'Retard Army', 'Paki',
  // Hate and extremism.
  'Hitler Youth', 'Nazi Empire', 'Third Reich', 'Sieg Heil', 'Neonazi', 'White Power', 'Ku Klux Klan', 'Kkk Klan', 'Aryan Nation',
  '1488', '14/88 Legion', 'Taliban', 'Al Qaeda', 'ISIS', 'Jihad Army', 'Holocaust', 'Genocide',
  // Sexual, and abuse.
  'Pedophile', 'Blowjob', 'Hentai', 'Cum Lords', 'Big Tits', 'Slut', 'Pussy Cats', 'Rape Squad', 'Porn Empire',
  // Swearing, insults, self-harm.
  'Dickhead', 'Bollocks', 'Ass Empire', 'Asses', 'Bullshit', 'Kill Yourself', 'KYS', 'Wanker', 'Cunt',
]; // prettier-ignore

/** Harmless names that contain one of those terms, or look like one: none of them may be refused. */
const ALLOWED = [
  'Scunthorpe United', 'Essex Rising', 'Sussex', 'Middlesex', 'Cockburn Town', 'Hancock', 'Peacock Throne', 'Cockatoo', 'Dickens',
  'Grape Kingdom', 'Therapist Guild', 'Matsushita', 'Mitsubishi Tea', 'Shiitake', 'Ashkenazi League', 'Nazareth', 'Raccoon City',
  'Empire of Niger', 'Nigeria', 'Montenegro', 'Pakistan', 'Japanese Empire', 'Spice Islands', 'Assyria', 'Assassins', 'Passion',
  'Classic Empire', 'Bass Kingdom', 'Massachusetts', 'Phu Quoc', 'Phuket', 'Fukuoka Shogunate', 'Kumquat', 'Cumbria',
  'Circumference', 'Documents', 'Pennsylvania', 'Penistone', 'Sextant Isles', 'Saxony', 'Scrap Empire', 'Milford Haven', 'Slutsk',
  'Clitheroe', 'Princes Town', 'Fire Retardant', 'Dragging Empire', 'Analytica', 'Hell Riders', 'Hello Kingdom', 'Shell Oil',
  'Heilbronn', 'Reichenau', 'Isles of Scilly', 'Titanic Empire', 'Arsenal FC', 'Kitchen', 'Hong Gang', 'Bastardo', 'Gypsum',
  'Holy Roman Empire', 'Ottoman Empire', 'Golden Horde', 'Kingdom of Kush', 'Great Mughal', 'Empire 1', 'Empire 88',
]; // prettier-ignore

describe('empire names: the filter', () => {
  it('refuses slurs, hate, sexual terms and swearing, however they are disguised', () => {
    expect(REFUSED.filter(nameAllowed)).toEqual([]);
  });

  it('lets through harmless names that merely contain or resemble one', () => {
    expect(ALLOWED.filter((name) => !nameAllowed(name))).toEqual([]);
  });

  it('never refuses a country, its capital or its cities, nor the name an unnamed empire is given', () => {
    const places = ALL.flatMap((c) => [c.name, c.capital, defaultEmpireName(c.name), ...(c.cities ?? [])]).filter(Boolean);
    expect(places.filter((name) => !nameAllowed(name))).toEqual([]);
  });

  it('reads a name the way a player meant it', () => {
    expect(plainName('Sh1t-K1NGDÖM!')).toBe('shit-kingdomi');
    expect(plainName('ｆцck')).toBe('fuck');
    expect(plainName('nіgga')).toBe('nigga');
    expect(plainName('phuck')).toBe('fuck');
    expect([...LOOKALIKE_FROM]).toHaveLength([...LOOKALIKE_TO].length);
    expect([...LEET_FROM]).toHaveLength([...LEET_TO].length);
  });

  it('keeps the length limit it had', () => {
    expect(EMPIRE_NAME_MAX).toBe(22);
    expect(cleanEmpireName('x'.repeat(40))).toHaveLength(22);
  });
});

describe('empire names: the database applies the same filter', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;');
    await db.exec(SQL);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });

  const inDatabase = async (names: string[]) =>
    (await db.query<{ name: string; ok: boolean }>('select n as name, public.atlas_name_allowed(n) as ok from unnest($1::text[]) as n', [names])).rows;

  it('agrees with the game on every test name, every place name, and every name the game makes', async () => {
    const places = ALL.flatMap((c) => [c.name, c.capital, defaultEmpireName(c.name)]).filter(Boolean);
    const rows = await inDatabase([...REFUSED, ...ALLOWED, ...places]);
    expect(rows.filter((r) => r.ok !== nameAllowed(r.name)).map((r) => `${r.name}: database ${r.ok ? 'allows' : 'refuses'} it`)).toEqual([]);
  });

  it('refuses a run under a refused name', async () => {
    const submit = (name: string) =>
      db.query("select public.submit_run('00000000-0000-4000-8000-000000000001', 'Europe', $1, 0, array['#d8343c','#f4f4ec','#2b4fc4'], 'DEU', 0, 0, 0, 1, 0, 'defeat') as rank", [name]);
    for (const name of ['N I G G A', 'fцck', '1488']) await expect(submit(name), name).rejects.toThrow('That empire name is not allowed.');
    expect((await submit('Essex Rising')).rows).toEqual([{ rank: 1 }]);
  });
});
