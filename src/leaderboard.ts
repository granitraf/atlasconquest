// The global leaderboard: the game's only use of the network. Finished runs are sent to a Supabase
// project and the best of each campaign read back. Everything here is optional: with no project
// configured, or none reachable, these functions reject and the game plays on without them.
//
// The project is reached over its REST interface with plain fetch, through the two database functions
// in supabase/schema.sql: submit_run (which validates and stores a run) and top_runs.

import { DEFAULT_FLAG, FLAG_COLOURS, FLAG_PATTERNS, cleanEmpireName, type EmpireFlag } from './game/flag';
import { nameAllowed } from './game/names';
import type { GameStats } from './game/state';
import { MODES, type GameState, type ModeId } from './game/types';

/** How many runs of a campaign the leaderboard shows. */
export const LEADERBOARD_SIZE = 5;
/** A request that takes longer than this counts as unreachable. */
export const LEADERBOARD_TIMEOUT_MS = 8000;
/** Shown in place of a stored name the filter would not have let through. */
export const UNNAMED_EMPIRE = 'Unnamed empire';

export type Outcome = 'victory' | 'defeat';

/** One finished run, as it is sent to the leaderboard. Nothing in it identifies the player. */
export interface RunRecord {
  runId: string;
  campaign: ModeId;
  empireName: string;
  flag: EmpireFlag;
  /** Id of the country the run started from. */
  startCountry: string;
  score: number;
  conquered: number;
  continents: number;
  battles: number;
  bestStreak: number;
  outcome: Outcome;
}

export interface LeaderboardRow extends RunRecord {
  /** Place within its campaign, from 1. */
  rank: number;
  createdAt: string;
}

export type Leaderboard = Record<ModeId, LeaderboardRow[]>;

/** The leaderboard could not be reached, or is not set up. */
export class LeaderboardUnavailable extends Error {}
/** The leaderboard answered, and refused the run. */
export class RunRejected extends Error {}

interface Config {
  url: string;
  key: string;
}

/** The project to talk to, from the build's environment; null when none is configured. */
function config(): Config | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return /^https?:\/\/[^/]+/.test(url) && key ? { url, key } : null;
}

export const leaderboardConfigured = (): boolean => config() !== null;

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const project = config();
  if (!project) throw new LeaderboardUnavailable('The leaderboard is not configured.');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LEADERBOARD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${project.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: project.key, Authorization: `Bearer ${project.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: abort.signal,
    });
  } catch {
    throw new LeaderboardUnavailable('The leaderboard could not be reached.');
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or unreadable answer is handled below.
  }
  if (response.ok) return body;
  const message = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : `HTTP ${response.status}`;
  // The database refuses a run it does not believe with a 4xx; anything else is the service being down.
  if (response.status === 400 || response.status === 409 || response.status === 422) throw new RunRejected(message);
  throw new LeaderboardUnavailable(message);
}

/** The run a finished game amounts to. */
export function runRecord(state: GameState, stats: GameStats, runId: string): RunRecord {
  return {
    runId,
    campaign: state.mode,
    empireName: state.empire.name,
    flag: state.empire.flag,
    startCountry: state.startId,
    score: stats.score,
    conquered: stats.conquered,
    continents: stats.continents.length,
    battles: stats.battles,
    bestStreak: stats.bestStreak,
    outcome: state.phase === 'victory' ? 'victory' : 'defeat',
  };
}

const submissions = new Map<string, Promise<number>>();

/**
 * Records a finished run and resolves with its place in its campaign. Sending the same run twice is
 * harmless: the database keeps one row per run id and answers with the same place.
 */
export function submitRun(run: RunRecord): Promise<number> {
  const known = submissions.get(run.runId);
  if (known) return known;
  const sent = rpc('submit_run', {
    p_run_id: run.runId,
    p_campaign: run.campaign,
    p_empire_name: run.empireName,
    p_flag_pattern: run.flag.pattern,
    p_flag_colours: run.flag.colours,
    p_start_country: run.startCountry,
    p_score: run.score,
    p_conquered: run.conquered,
    p_continents: run.continents,
    p_battles: run.battles,
    p_best_streak: run.bestStreak,
    p_outcome: run.outcome,
  }).then((rank) => {
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) throw new LeaderboardUnavailable('The leaderboard gave no rank.');
    return rank;
  });
  submissions.set(run.runId, sent);
  // A failed attempt is not remembered, so the next look at the end screen tries again.
  sent.catch(() => submissions.delete(run.runId));
  return sent;
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/** A row as the database sent it, made safe to show; null if it is not a run at all. */
export function parseRow(raw: unknown): LeaderboardRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.run_id !== 'string' || typeof r.campaign !== 'string' || !MODES.includes(r.campaign as ModeId)) return null;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score) || typeof r.rank !== 'number' || r.rank < 1) return null;
  const name = cleanEmpireName(typeof r.empire_name === 'string' ? r.empire_name : '');
  const colours = Array.isArray(r.flag_colours) ? r.flag_colours.map((c) => String(c).toLowerCase()) : [];
  const palette = FLAG_COLOURS as readonly string[];
  const pattern = r.flag_pattern;
  const flagOk = typeof pattern === 'number' && Number.isInteger(pattern) && pattern >= 0 && pattern < FLAG_PATTERNS.length && colours.length === 3 && colours.every((c) => palette.includes(c));
  return {
    runId: r.run_id,
    campaign: r.campaign as ModeId,
    empireName: name && nameAllowed(name) ? name : UNNAMED_EMPIRE,
    flag: flagOk ? { pattern: pattern as number, colours: [colours[0], colours[1], colours[2]] } : DEFAULT_FLAG,
    startCountry: typeof r.start_country === 'string' ? r.start_country : '',
    score: r.score,
    conquered: count(r.conquered),
    continents: count(r.continents),
    battles: count(r.battles),
    bestStreak: count(r.best_streak),
    outcome: r.outcome === 'victory' ? 'victory' : 'defeat',
    rank: Math.floor(r.rank),
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

/** The best runs of one campaign, or of every campaign when none is named. Best first. */
export async function topRuns(campaign?: ModeId): Promise<Leaderboard> {
  const rows = await rpc('top_runs', { p_campaign: campaign ?? null, p_limit: LEADERBOARD_SIZE });
  if (!Array.isArray(rows)) throw new LeaderboardUnavailable('The leaderboard gave no list.');
  const board = Object.fromEntries(MODES.map((mode) => [mode, [] as LeaderboardRow[]])) as Leaderboard;
  for (const raw of rows) {
    const row = parseRow(raw);
    if (row) board[row.campaign].push(row);
  }
  for (const mode of MODES) board[mode] = board[mode].sort((a, b) => a.rank - b.rank).slice(0, LEADERBOARD_SIZE);
  return board;
}

export const formatScore = (score: number): string => (Number.isInteger(score) ? String(score) : score.toFixed(1));
export const campaignTitle = (mode: ModeId): string => (mode === 'World' ? 'World conquest' : mode);
