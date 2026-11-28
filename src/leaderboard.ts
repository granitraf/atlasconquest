// The daily leaderboard: the game's only use of the network. A finished Daily Game is sent to a Supabase
// project, and the day's best runs and the spread of everyone's scores are read back. Everything here is
// optional: with no project configured, or none reachable, these functions reject and the game plays on
// without them. Classic games are never sent.
//
// The project is reached over its REST interface with plain fetch, through the database functions in
// supabase/schema.sql: submit_run (which validates and stores a run), top_runs and day_scores.

import { DEFAULT_FLAG, FLAG_COLOURS, FLAG_PATTERNS, type EmpireFlag } from './game/flag';
import { NEW_EMPIRE, validateEmpireName } from './names/validateEmpireName';
import type { GameStats } from './game/state';
import { MODES, type GameState, type ModeId } from './game/types';

/** How many of a day's runs the end screen shows, and how many the Leaderboard page shows. */
export const LEADERBOARD_SIZE = 5;
export const LEADERBOARD_PAGE_SIZE = 10;
/** A request that takes longer than this counts as unreachable. */
export const LEADERBOARD_TIMEOUT_MS = 8000;
/** Shown in place of a stored name that does not pass validateEmpireName. */
export const UNNAMED_EMPIRE = NEW_EMPIRE;

export type Outcome = 'victory' | 'defeat';

/** One finished run, as it is sent to the leaderboard. Nothing in it identifies the player. */
export interface RunRecord {
  runId: string;
  /** The day (YYYY-MM-DD, US Eastern) the run is the Daily Game for. */
  day: string;
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
  /** Place within its day, from 1. */
  rank: number;
  createdAt: string;
}

/** How many players finished a day on each score: the spread a player's own score is set against. */
export interface ScoreCount {
  score: number;
  players: number;
}

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

/** The run a finished Daily Game amounts to. */
export function runRecord(state: GameState, stats: GameStats, runId: string): RunRecord {
  return {
    runId,
    day: state.daily ?? '',
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
 * Records a finished Daily Game and resolves with its place in its day. Sending the same run twice is
 * harmless: the database keeps one row per run id and answers with the same place.
 */
export function submitRun(run: RunRecord): Promise<number> {
  const known = submissions.get(run.runId);
  if (known) return known;
  const sent = rpc('submit_run', {
    p_run_id: run.runId,
    p_day: run.day,
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
  const checked = validateEmpireName(r.empire_name);
  const colours = Array.isArray(r.flag_colours) ? r.flag_colours.map((c) => String(c).toLowerCase()) : [];
  const palette = FLAG_COLOURS as readonly string[];
  const pattern = r.flag_pattern;
  const flagOk = typeof pattern === 'number' && Number.isInteger(pattern) && pattern >= 0 && pattern < FLAG_PATTERNS.length && colours.length === 3 && colours.every((c) => palette.includes(c));
  return {
    runId: r.run_id,
    day: typeof r.day === 'string' ? r.day : '',
    campaign: r.campaign as ModeId,
    empireName: checked.valid ? checked.name : UNNAMED_EMPIRE,
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

/** The best runs of a day, best first. */
export async function topRuns(day: string, limit: number = LEADERBOARD_SIZE): Promise<LeaderboardRow[]> {
  const rows = await rpc('top_runs', { p_day: day, p_limit: limit });
  if (!Array.isArray(rows)) throw new LeaderboardUnavailable('The leaderboard gave no list.');
  return rows
    .map(parseRow)
    .filter((row): row is LeaderboardRow => row !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

/** How many players finished a day on each score, lowest score first. */
export async function dayScores(day: string): Promise<ScoreCount[]> {
  const rows = await rpc('day_scores', { p_day: day });
  if (!Array.isArray(rows)) throw new LeaderboardUnavailable('The leaderboard gave no scores.');
  return rows
    .map((raw): ScoreCount | null => {
      const r = raw as { score?: unknown; players?: unknown } | null;
      if (!r || typeof r.score !== 'number' || !Number.isFinite(r.score) || typeof r.players !== 'number' || r.players < 1) return null;
      return { score: r.score, players: Math.floor(r.players) };
    })
    .filter((row): row is ScoreCount => row !== null)
    .sort((a, b) => a.score - b.score);
}

/**
 * Where a score stands among a day's players: how many there were, and the share of the others it beat
 * (null when it is the only one).
 */
export function standing(scores: readonly ScoreCount[], mine: number): { players: number; beat: number | null } {
  const players = scores.reduce((n, s) => n + s.players, 0);
  const below = scores.filter((s) => s.score < mine).reduce((n, s) => n + s.players, 0);
  return { players, beat: players > 1 ? Math.round((below / (players - 1)) * 100) : null };
}

export const formatScore = (score: number): string => (Number.isInteger(score) ? String(score) : score.toFixed(1));
export const campaignTitle = (mode: ModeId): string => (mode === 'World' ? 'World conquest' : mode);
