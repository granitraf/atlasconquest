import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLASSIC_PASSCODE_HASH, DAILY_EPOCH, DAILY_ORDER, countdown, dailyCountryId, dailyDay, dayLabel, dayNumber, hashCode, passcodeHash, passcodeMatches, previousDay, secondsUntilNextDay } from '../src/daily/daily';
import { DEFAULT_FLAG } from '../src/game/flag';
import { SEA_TIMER_SECONDS, finalScore, startDifficulty } from '../src/game/rules';
import { createGame, gameStats, reduce, reviveGame } from '../src/game/state';
import type { Country } from '../src/game/types';
import { buildWorld } from '../src/game/world';

const ALL: Country[] = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const WORLD = buildWorld(ALL, 'World');
const EMPIRE = { name: 'Daily Empire', flag: DEFAULT_FLAG };

describe('the daily clock', () => {
  it('turns over at midnight US Eastern time, in winter and in summer', () => {
    // Winter: Eastern time is five hours behind UTC.
    expect(dailyDay(new Date('2026-11-28T04:59:59Z'))).toBe('2026-11-27');
    expect(dailyDay(new Date('2026-11-28T05:00:00Z'))).toBe('2026-11-28');
    // Summer: four hours behind.
    expect(dailyDay(new Date('2027-07-04T03:59:59Z'))).toBe('2027-07-03');
    expect(dailyDay(new Date('2027-07-04T04:00:00Z'))).toBe('2027-07-04');
    // New Year.
    expect(dailyDay(new Date('2027-01-01T04:30:00Z'))).toBe('2026-12-31');
  });

  it('counts down to the next midnight', () => {
    expect(secondsUntilNextDay(new Date('2026-11-28T04:59:59Z'))).toBe(1);
    expect(secondsUntilNextDay(new Date('2026-11-28T05:00:00Z'))).toBe(86_400);
    expect(secondsUntilNextDay(new Date('2026-11-27T17:00:00Z'))).toBe(12 * 3600);
    expect([countdown(0), countdown(59), countdown(3661), countdown(86_399), countdown(-5)]).toEqual(['00:00:00', '00:00:59', '01:01:01', '23:59:59', '00:00:00']);
  });

  it('names days and steps back a day, across months and years', () => {
    expect(dayLabel('2026-11-27')).toBe('Friday 27 November');
    expect([previousDay('2026-11-27'), previousDay('2026-12-01'), previousDay('2027-01-01'), previousDay('2028-03-01')]).toEqual(['2026-11-26', '2026-11-30', '2026-12-31', '2028-02-29']);
  });
});

describe('the country of the day', () => {
  it('takes every country once, in a fixed order, before any comes round again', () => {
    expect(DAILY_ORDER).toHaveLength(WORLD.ids.length);
    expect([...DAILY_ORDER].sort()).toEqual([...WORLD.ids].sort());
    expect(dayNumber(DAILY_EPOCH)).toBe(0);
    expect(dailyCountryId(DAILY_EPOCH)).toBe(DAILY_ORDER[0]);
    const n = DAILY_ORDER.length;
    const day = (offset: number) => new Date(Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const cycle = Array.from({ length: n }, (_, i) => dailyCountryId(day(i)));
    expect(new Set(cycle).size).toBe(n);
    // It starts over after the last country, and works before the first day too.
    expect(dailyCountryId(day(n))).toBe(DAILY_ORDER[0]);
    expect(dailyCountryId(day(n + 3))).toBe(DAILY_ORDER[3]);
    expect(dailyCountryId(day(-1))).toBe(DAILY_ORDER[n - 1]);
  });

  it('is the same for everyone on a day and changes the next', () => {
    expect(dailyCountryId('2026-11-27')).toBe('KAZ');
    expect(dailyCountryId('2026-11-27')).toBe(dailyCountryId(dailyDay(new Date('2026-11-28T01:00:00Z'))));
    expect(dailyCountryId('2026-11-28')).not.toBe('KAZ');
    // The order is not sorted by fame or by name: neighbouring days are unrelated countries.
    expect(DAILY_ORDER.slice(0, 5)).not.toEqual([...DAILY_ORDER.slice(0, 5)].sort());
  });
});

describe('the passcode to the classic game', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is kept as a hash only: the code holds no passcode, and nothing obvious opens it', () => {
    expect(Number.isSafeInteger(CLASSIC_PASSCODE_HASH) && CLASSIC_PASSCODE_HASH > 0).toBe(true);
    expect(passcodeHash()).toBe(CLASSIC_PASSCODE_HASH);
    for (const typed of ['', ' ', 'password', 'classic', 'atlas', 'atlas conquest', '1234', String(CLASSIC_PASSCODE_HASH)]) expect(passcodeMatches(typed), typed).toBe(false);
  });

  it('matches whatever the case or the spaces around it', () => {
    // A passcode of the test's own, given the way a build can be given one.
    vi.stubEnv('VITE_CLASSIC_PASSCODE_HASH', String(hashCode('open sesame')));
    expect(passcodeHash()).toBe(hashCode('open sesame'));
    for (const typed of ['open sesame', ' Open Sesame ', 'OPEN SESAME']) expect(passcodeMatches(typed), typed).toBe(true);
    for (const typed of ['', 'open', 'opensesame', 'open sesame!']) expect(passcodeMatches(typed), typed).toBe(false);
    // Nonsense in the setting falls back to the hash in the code.
    for (const bad of ['', 'abc', '-5', '1.5', '0']) {
      vi.stubEnv('VITE_CLASSIC_PASSCODE_HASH', bad);
      expect(passcodeHash(), bad).toBe(CLASSIC_PASSCODE_HASH);
    }
  });

  it('is hashed the same way by the game and by `npm run passcode`', async () => {
    const script = await import('../scripts/passcode.mjs');
    for (const text of ['open sesame', 'a', 'Ünïcödé', 'x'.repeat(200)]) expect(script.hashCode(text), text).toBe(hashCode(text));
  });
});

describe('a daily game', () => {
  const start = dailyCountryId('2026-11-27');

  it('carries its day and no start multiplier, whatever the country is rated', () => {
    expect(new Set(['USA', 'KAZ', 'NRU'].map((id) => startDifficulty(WORLD, id).multiplier)).size).toBeGreaterThan(1);
    for (const id of ['USA', 'KAZ', 'NRU']) {
      const classic = createGame(WORLD, id, 7, EMPIRE);
      const daily = createGame(WORLD, id, 7, EMPIRE, undefined, '2026-11-27');
      expect(classic.daily).toBeNull();
      expect(classic.multiplier).toBe(startDifficulty(WORLD, id).multiplier);
      expect(daily.daily).toBe('2026-11-27');
      expect(daily.multiplier).toBe(1);
      // Everything else is the same game: the same recruiting questions from the same seed.
      expect({ ...daily, daily: null, multiplier: classic.multiplier }).toEqual(classic);
    }
    expect(finalScore(12, 1, 1)).toBe(22);
  });

  it('keeps the ten seconds for a sea crossing', () => {
    expect(SEA_TIMER_SECONDS).toBe(10);
  });

  it('can be given up at any point, which ends it as a defeat with what was conquered', () => {
    const fresh = createGame(WORLD, start, 7, EMPIRE, undefined, '2026-11-27');
    const ended = reduce(WORLD, fresh, { type: 'forfeit' });
    expect(ended).toMatchObject({ phase: 'gameover', lives: 0, recruit: null, battle: null, feedback: null, daily: '2026-11-27' });
    expect(ended.lastEvent).toEqual({ kind: 'surrendered' });
    expect(ended.eventSeq).toBe(fresh.eventSeq + 1);
    expect(gameStats(WORLD, ended)).toMatchObject({ conquered: 0, score: 0 });
    // Between battles, with land already taken.
    const mid = { ...fresh, phase: 'attack' as const, recruit: null, owned: [start, 'KGZ', 'UZB'], battles: 3, bestStreak: 5 };
    const stopped = reduce(WORLD, mid, { type: 'forfeit' });
    expect(stopped.phase).toBe('gameover');
    expect(stopped.owned).toEqual(mid.owned);
    expect(gameStats(WORLD, stopped)).toMatchObject({ conquered: 2, score: 2, battles: 3 });
    // A finished game cannot be given up again.
    expect(reduce(WORLD, stopped, { type: 'forfeit' })).toBe(stopped);
  });

  it('survives a reload as a daily game, and a damaged day is dropped', () => {
    const game = createGame(WORLD, start, 7, EMPIRE, undefined, '2026-11-27');
    const saved = JSON.parse(JSON.stringify(game));
    expect(reviveGame(saved, () => WORLD)?.daily).toBe('2026-11-27');
    expect(reviveGame({ ...saved, daily: 'tomorrow' }, () => WORLD)?.daily).toBeNull();
    expect(reviveGame({ ...saved, daily: undefined }, () => WORLD)?.daily).toBeNull();
  });
});

describe('the database and the daily game', () => {
  let db: PGlite;
  let today: string;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;');
    // Twice: the file is meant to be safe to run again.
    await db.exec(SQL);
    await db.exec(SQL);
    today = (await db.query<{ d: string }>('select public.atlas_today()::text as d')).rows[0].d;
    await db.exec('set role anon');
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });

  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const base = () => ({ day: today, campaign: 'World', name: 'Daily Empire', start: dailyCountryId(today), score: 4, conquered: 4, continents: 0, battles: 5, streak: 3, outcome: 'defeat' });
  const submit = (n: number, over: Partial<ReturnType<typeof base>> = {}) => {
    const r = { ...base(), ...over };
    return db.query<{ rank: number }>('select public.submit_run($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12) as rank', [id(n), r.day, r.campaign, r.name, ['#d8343c', '#f4f4ec', '#2b4fc4'], r.start, r.score, r.conquered, r.continents, r.battles, r.streak, r.outcome]);
  };

  it('carries the current order of countries (npm run daily)', () => {
    expect(() => execFileSync(process.execPath, ['scripts/daily-sql.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('keeps the same clock as the game', async () => {
    expect(today).toBe(dailyDay(new Date()));
  });

  it('agrees with the game on the country of every day, for two years either side of the first', async () => {
    const days = Array.from({ length: 1500 }, (_, i) => new Date(Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + (i - 750) * 86_400_000).toISOString().slice(0, 10));
    const rows = (await db.query<{ day: string; country: string }>('select d::text as day, public.atlas_daily_country(d::date) as country from unnest($1::text[]) as d', [days])).rows;
    expect(rows).toHaveLength(days.length);
    expect(rows.filter((r) => r.country !== dailyCountryId(r.day))).toEqual([]);
  });

  it('refuses what the daily game could not have produced', async () => {
    const other = DAILY_ORDER.find((c) => c !== dailyCountryId(today))!;
    const refused: [Partial<ReturnType<typeof base>>, string][] = [
      [{ start: other }, 'That is not the starting country of the day.'],
      [{ campaign: 'Europe' }, 'The daily game is a World conquest.'],
      // A classic start multiplier has no place in a daily score.
      [{ score: 12 }, 'The score does not add up.'],
      [{ score: 6 }, 'The score does not add up.'],
      [{ day: previousDay(previousDay(today)), start: dailyCountryId(previousDay(previousDay(today))) }, 'That daily game is over.'],
      [{ day: '2030-01-01', start: dailyCountryId('2030-01-01') }, 'That daily game is over.'],
      [{ battles: 3 }, 'The battles fought do not match the countries conquered.'],
      [{ outcome: 'victory' }, 'The outcome does not match the countries conquered.'],
      [{ continents: 1 }, 'The score does not add up.'],
      [{ name: 'Ro' }, 'That empire name is not allowed.'],
    ];
    for (const [over, why] of refused) await expect(submit(99, over), JSON.stringify(over)).rejects.toThrow(why);
    expect((await db.query('select count(*)::int as n from public.runs')).rows).toEqual([{ n: 0 }]);
  });

  it("ranks a day's runs, keeps yesterday's apart, and counts players on each score", async () => {
    const yesterday = previousDay(today);
    expect((await submit(1)).rows).toEqual([{ rank: 1 }]);
    // Sent again: still one row, the same place.
    expect((await submit(1)).rows).toEqual([{ rank: 1 }]);
    expect((await submit(2, { score: 9, conquered: 9, battles: 12 })).rows).toEqual([{ rank: 1 }]);
    // The same score in more battles ranks below.
    expect((await submit(3, { battles: 9 })).rows).toEqual([{ rank: 3 }]);
    // Giving up between battles: as many battles as conquests, and nothing conquered at all.
    expect((await submit(4, { battles: 4 })).rows).toEqual([{ rank: 2 }]);
    expect((await submit(5, { score: 0, conquered: 0, battles: 0, streak: 0 })).rows).toEqual([{ rank: 5 }]);
    // Holding a continent is worth ten.
    expect((await submit(6, { score: 24, conquered: 14, continents: 1, battles: 20 })).rows).toEqual([{ rank: 1 }]);
    // A game still being played at midnight counts for the day it began.
    expect((await submit(7, { day: yesterday, start: dailyCountryId(yesterday), score: 50, conquered: 50, battles: 60 })).rows).toEqual([{ rank: 1 }]);

    const top = (await db.query<{ rank: number; score: number; battles: number; day: string }>('select rank::int, score::float as score, battles, day::text from public.top_runs()')).rows;
    expect(top).toEqual([
      { rank: 1, score: 24, battles: 20, day: today },
      { rank: 2, score: 9, battles: 12, day: today },
      { rank: 3, score: 4, battles: 4, day: today },
      { rank: 4, score: 4, battles: 5, day: today },
      { rank: 5, score: 4, battles: 9, day: today },
    ]);
    expect((await db.query('select rank::int from public.top_runs($1::date, 10)', [today])).rows).toHaveLength(6);
    expect((await db.query('select score::float as score, players::int as players from public.day_scores()')).rows).toEqual([
      { score: 0, players: 1 },
      { score: 4, players: 3 },
      { score: 9, players: 1 },
      { score: 24, players: 1 },
    ]);
    expect((await db.query('select score::float as score, players::int as players from public.day_scores($1::date)', [yesterday])).rows).toEqual([{ score: 50, players: 1 }]);
    expect((await db.query('select rank::int, score::float as score from public.top_runs($1::date)', [yesterday])).rows).toEqual([{ rank: 1, score: 50 }]);
    // Still no way in but the function.
    await expect(db.query("insert into public.runs (run_id, campaign, empire_name, flag_pattern, flag_colours, start_country, score, conquered, continents, battles, best_streak, outcome) values ('00000000-0000-4000-8000-000000000077', 'World', 'Sneaky', 0, array['a','b','c'], 'DEU', 999, 0, 0, 0, 0, 'defeat')")).rejects.toThrow(/permission denied/);
  });
});
