import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLAG, EMPIRE_NAME_MAX, FLAG_COLOURS, FLAG_PATTERNS } from '../src/game/flag';
import { ALLOWED_PATTERN, BLOCKED_PATTERN } from '../src/names/validateEmpireName';
import { CONTINENT_BONUS, START_MULTIPLIER, finalScore } from '../src/game/rules';
import { createGame, gameStats } from '../src/game/state';
import { CONTINENTS, MODES, type Country } from '../src/game/types';
import { buildWorld } from '../src/game/world';
import { LEADERBOARD_SIZE, LeaderboardUnavailable, RunRejected, UNNAMED_EMPIRE, campaignTitle, formatScore, leaderboardConfigured, parseRow, runRecord, submitRun, topRuns, type RunRecord } from '../src/leaderboard';

const ALL: Country[] = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

describe('supabase/schema.sql mirrors the game', () => {
  it('knows the seven campaigns, how many countries each has and how many continents can be held', () => {
    const rows = [...SQL.matchAll(/^\s*\('([^']+)', (\d+), (\d+)\),?$/gm)].map((m) => ({ name: m[1], countries: Number(m[2]), continents: Number(m[3]) }));
    expect(rows.map((r) => r.name).sort()).toEqual([...MODES].sort());
    for (const row of rows) {
      const world = buildWorld(ALL, row.name as (typeof MODES)[number]);
      expect(row.countries, row.name).toBe(world.ids.length);
      expect(row.continents, row.name).toBe(row.name === 'World' ? CONTINENTS.length : 1);
    }
    // The table's own check lists the same campaigns.
    const listed = /campaign in \(([^)]+)\)/.exec(SQL)![1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(listed.sort()).toEqual([...MODES].sort());
  });

  it('accepts exactly the scores the game can produce', () => {
    const multipliers = /unnest\(array\[([^\]]+)\]\) as m/.exec(SQL)![1].split(',').map(Number);
    expect(multipliers).toEqual(Object.values(START_MULTIPLIER));
    expect(SQL).toContain(`round(p_conquered * m + p_continents * ${CONTINENT_BONUS}, 1) = p_score`);
    // The game's own formula, for every multiplier: a multiple of a half, so rounding to one decimal loses nothing.
    for (const m of multipliers) expect(finalScore(7, m, 2)).toBe(7 * m + 2 * CONTINENT_BONUS);
  });

  it('accepts exactly the flags the game can draw', () => {
    const palette = /p_flag_colours <@ array\[([^\]]+)\]/.exec(SQL)![1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(palette).toEqual([...FLAG_COLOURS]);
    expect(SQL).toContain(`p_flag_pattern not between 0 and ${FLAG_PATTERNS.length - 1}`);
    expect(SQL).toContain(`flag_pattern between 0 and ${FLAG_PATTERNS.length - 1}`);
  });

  it('applies the same name rules: the length limit and the same filter, word for word', () => {
    expect(SQL).toContain(`char_length(v_typed) not between 3 and ${EMPIRE_NAME_MAX}`);
    expect(SQL).toContain(`check (char_length(empire_name) between 3 and ${EMPIRE_NAME_MAX} and empire_name ~ '^[A-Za-z]+(''[A-Za-z]+)*''?( [A-Za-z]+(''[A-Za-z]+)*''?)*$')`);
    for (const part of [ALLOWED_PATTERN, BLOCKED_PATTERN]) expect(SQL).toContain(`'${part}'`);
  });

  it('lets anyone read, and nobody write except through the one checking function', () => {
    expect(SQL).toMatch(/alter table public\.runs enable row level security/);
    expect([...SQL.matchAll(/create policy/g)]).toHaveLength(1);
    expect(SQL).toMatch(/create policy "[^"]+" on public\.runs\s+for select to anon, authenticated using \(true\)/);
    expect(SQL).toMatch(/revoke all on table public\.runs from anon, authenticated/);
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)[^;]*on table public\.runs/i);
    expect(SQL).toMatch(/on conflict \(run_id\) do nothing/);
    expect(SQL).toMatch(/created_at\s+timestamptz\s+not null default now\(\)/);
    // The ranking: score, then fewer battles, then the earlier run.
    expect(SQL).toContain('order by r.score desc, r.battles asc, r.created_at asc');
  });
});

const run: RunRecord = { runId: '1b663b9a-0bcf-461d-bbc7-7dde5db0f976', campaign: 'Europe', empireName: 'Empire of Germany', flag: DEFAULT_FLAG, startCountry: 'DEU', score: 37.5, conquered: 15, continents: 0, battles: 19, bestStreak: 11, outcome: 'defeat' };
const stored = { rank: 2, run_id: run.runId, campaign: 'Europe', empire_name: 'Empire of Germany', flag_pattern: 4, flag_colours: ['#d8343c', '#f4f4ec', '#2b4fc4'], start_country: 'DEU', score: 37.5, conquered: 15, continents: 0, battles: 19, best_streak: 11, outcome: 'defeat', created_at: '2026-01-01T00:00:00Z' };
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const configure = () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key');
};

describe('the leaderboard client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is simply unavailable when no project is configured, without touching the network', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(leaderboardConfigured()).toBe(false);
    await expect(topRuns()).rejects.toBeInstanceOf(LeaderboardUnavailable);
    await expect(submitRun({ ...run, runId: 'unconfigured' })).rejects.toBeInstanceOf(LeaderboardUnavailable);
    // Half a configuration is no configuration.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    expect(leaderboardConfigured()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is unavailable when the project cannot be reached or answers with a server error', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(topRuns('World')).rejects.toBeInstanceOf(LeaderboardUnavailable);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(503, { message: 'down' })));
    await expect(topRuns('World')).rejects.toBeInstanceOf(LeaderboardUnavailable);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { not: 'a list' })));
    await expect(topRuns('World')).rejects.toBeInstanceOf(LeaderboardUnavailable);
  });

  it('sends a run to submit_run with the public key and returns its rank', async () => {
    configure();
    const fetch = vi.fn().mockResolvedValue(answer(200, 7));
    vi.stubGlobal('fetch', fetch);
    expect(leaderboardConfigured()).toBe(true);
    await expect(submitRun(run)).resolves.toBe(7);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/submit_run');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'public-key', Authorization: 'Bearer public-key' });
    expect(JSON.parse(init.body)).toEqual({
      p_run_id: run.runId, p_campaign: 'Europe', p_empire_name: 'Empire of Germany', p_flag_pattern: 0, p_flag_colours: DEFAULT_FLAG.colours,
      p_start_country: 'DEU', p_score: 37.5, p_conquered: 15, p_continents: 0, p_battles: 19, p_best_streak: 11, p_outcome: 'defeat',
    });
    // The same run asked about again is not sent twice.
    await expect(submitRun(run)).resolves.toBe(7);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tells a refused run apart from an unreachable leaderboard, and tries again next time', async () => {
    configure();
    const fetch = vi.fn().mockResolvedValueOnce(answer(400, { message: 'The score does not add up.' })).mockResolvedValueOnce(answer(200, 3));
    vi.stubGlobal('fetch', fetch);
    const refused = { ...run, runId: 'refused-once' };
    await expect(submitRun(refused)).rejects.toThrow('The score does not add up.');
    await expect(submitRun(refused)).resolves.toBe(3);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(400, { message: 'no' })));
    await expect(submitRun({ ...run, runId: 'refused' })).rejects.toBeInstanceOf(RunRejected);
  });

  it('reads the top runs of every campaign, best first, five at most', async () => {
    configure();
    const rows = [
      ...[3, 1, 2, 4, 5, 6].map((rank) => ({ ...stored, run_id: `w${rank}`, campaign: 'World', rank, score: 100 - rank })),
      { ...stored, rank: 1 },
      { ...stored, run_id: 'x', campaign: 'Atlantis' },
      null,
    ];
    // A fresh answer each time: a response can only be read once.
    const fetch = vi.fn().mockImplementation(async () => answer(200, rows));
    vi.stubGlobal('fetch', fetch);
    const board = await topRuns();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ p_campaign: null, p_limit: LEADERBOARD_SIZE });
    expect(Object.keys(board)).toEqual(MODES);
    expect(board.World.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board.Europe).toHaveLength(1);
    expect(board.Africa).toEqual([]);
    await topRuns('Asia');
    expect(JSON.parse(fetch.mock.calls[1][1].body).p_campaign).toBe('Asia');
  });

  it('never trusts what comes back: bad rows are dropped, bad flags and names replaced', () => {
    expect(parseRow(stored)).toEqual({ ...run, flag: { pattern: 4, colours: ['#d8343c', '#f4f4ec', '#2b4fc4'] }, rank: 2, createdAt: '2026-01-01T00:00:00Z' });
    expect(parseRow({ ...stored, flag_pattern: 99 })!.flag).toEqual(DEFAULT_FLAG);
    expect(parseRow({ ...stored, flag_colours: ['#d8343c', 'url(evil)', '#2b4fc4'] })!.flag).toEqual(DEFAULT_FLAG);
    expect(parseRow({ ...stored, empire_name: 'Fuck Empire' })!.empireName).toBe(UNNAMED_EMPIRE);
    expect(parseRow({ ...stored, empire_name: 'Empire '.repeat(40) })!.empireName).toBe(UNNAMED_EMPIRE);
    expect(parseRow({ ...stored, empire_name: 'N1gga' })!.empireName).toBe(UNNAMED_EMPIRE);
    expect(parseRow({ ...stored, empire_name: 42 })!.empireName).toBe(UNNAMED_EMPIRE);
    expect(parseRow({ ...stored, battles: -4, best_streak: 'many' })).toMatchObject({ battles: 0, bestStreak: 0 });
    for (const bad of [null, 'row', {}, { ...stored, campaign: 'Atlantis' }, { ...stored, score: 'lots' }, { ...stored, rank: 0 }, { ...stored, run_id: 7 }]) expect(parseRow(bad)).toBeNull();
  });

  it('turns a finished game into a run with no personal data in it', () => {
    const world = buildWorld(ALL, 'Europe');
    const game = { ...createGame(world, 'DEU', 7, { name: 'Empire of Germany', flag: DEFAULT_FLAG }), phase: 'gameover' as const, owned: ['DEU', 'LUX', 'BEL'], battles: 4, bestStreak: 6 };
    const record = runRecord(game, gameStats(world, game), 'some-id');
    expect(record).toEqual({ runId: 'some-id', campaign: 'Europe', empireName: 'Empire of Germany', flag: DEFAULT_FLAG, startCountry: 'DEU', score: 2 * game.multiplier, conquered: 2, continents: 0, battles: 4, bestStreak: 6, outcome: 'defeat' });
    expect(runRecord({ ...game, phase: 'victory' }, gameStats(world, game), 'x').outcome).toBe('victory');
    expect(Object.keys(record).sort()).toEqual(['battles', 'bestStreak', 'campaign', 'conquered', 'continents', 'empireName', 'flag', 'outcome', 'runId', 'score', 'startCountry']);
  });

  it('formats scores and campaign titles', () => {
    expect([formatScore(12), formatScore(37.5), campaignTitle('World'), campaignTitle('Asia')]).toEqual(['12', '37.5', 'World conquest', 'Asia']);
  });
});
