import { battleRhythm, nextBattleQuestion, nextRecruitQuestion } from './questions';
import { sanitizeEmpire, type Empire } from './flag';
import { createRng, nextSeed, type Rng } from './rng';
import {
  CONTINENT_BONUS,
  DECIMATE_STREAK,
  RECRUIT_QUESTIONS,
  START_LIVES,
  START_TROOPS,
  battleDefenders,
  canRetreat,
  conquestTroops,
  finalScore,
  getTargets,
  healWounds,
  resolveBattleAnswer,
  resolveRecruitAnswer,
  retreatCost,
  standingDefenders,
  startDifficulty,
} from './rules';
import type { Continent, Feedback, GameState, ModeId, Question } from './types';
import type { World } from './world';

export const SAVE_VERSION = 4;
/**
 * How many asked questions are remembered, across games as well as within one, so they are not asked
 * again while anything else fits.
 */
export const RECENT_SIGS_KEPT = 300;
/** How many of the wrong options shown with a question are remembered, so it rotates them next time. */
export const DECOYS_KEPT = 6;

/** What carries over from one game to the next on the same device: the questions asked, and their wrong options. */
export interface GameMemory {
  sigs: string[];
  decoys: Record<string, string[]>;
}

/** Adds an asked question to the memory, keeping only the most recent questions and their wrong options. */
export function remember(memory: GameMemory, question: Question): GameMemory {
  const sigs = [...memory.sigs.filter((sig) => sig !== question.sig), question.sig].slice(-RECENT_SIGS_KEPT);
  const shown = question.options.filter((_, i) => i !== question.correctIndex).map((option) => option.label);
  const kept = new Set(sigs);
  const decoys: Record<string, string[]> = {};
  for (const [sig, labels] of Object.entries(memory.decoys)) if (kept.has(sig) && sig !== question.sig) decoys[sig] = labels;
  decoys[question.sig] = [...shown, ...(memory.decoys[question.sig] ?? []).filter((label) => !shown.includes(label))].slice(0, DECOYS_KEPT);
  return { sigs, decoys };
}

/** Reads a memory from untrusted input (stored data); anything malformed is dropped. */
export function sanitizeMemory(raw: unknown): GameMemory {
  const empty: GameMemory = { sigs: [], decoys: {} };
  if (!raw || typeof raw !== 'object') return empty;
  const { sigs, decoys } = raw as Partial<GameMemory>;
  const cleanSigs = Array.isArray(sigs) ? sigs.filter((sig): sig is string => typeof sig === 'string').slice(-RECENT_SIGS_KEPT) : [];
  const kept = new Set(cleanSigs);
  const cleanDecoys: Record<string, string[]> = {};
  if (decoys && typeof decoys === 'object') {
    for (const [sig, labels] of Object.entries(decoys)) {
      if (kept.has(sig) && Array.isArray(labels)) cleanDecoys[sig] = labels.filter((l): l is string => typeof l === 'string').slice(0, DECOYS_KEPT);
    }
  }
  return { sigs: cleanSigs, decoys: cleanDecoys };
}

const memoryOf = (state: Pick<GameState, 'recentSigs' | 'recentDecoys'>): GameMemory => ({ sigs: state.recentSigs, decoys: state.recentDecoys });

export type Action =
  /** Answer the current question; index null means the timer ran out. */
  | { type: 'answer'; index: number | null }
  /** Dismiss answer feedback and move on. */
  | { type: 'continue' }
  | { type: 'attack'; targetId: string }
  /** Take a target outright with a ready DECIMATE: no battle questions. */
  | { type: 'decimate'; targetId: string }
  /** Give up: the run ends where it stands. (How a Daily Game is abandoned: it counts, and cannot be restarted.) */
  | { type: 'forfeit' }
  | { type: 'retreat' };

/**
 * A new game. `memory` is what this device remembers of earlier games: their questions wait their turn.
 * `daily` is the day a Daily Game is for: everyone starts from the same country that day, so the start
 * carries no score multiplier.
 */
export function createGame(
  world: World,
  startId: string,
  seed: number,
  empire: Empire,
  memory: GameMemory = { sigs: [], decoys: {} },
  daily: string | null = null,
): GameState {
  if (!world.inPlay.has(startId)) throw new Error(`${startId} is not in play in mode ${world.mode}`);
  const rng = createRng(seed);
  const difficulty = startDifficulty(world, startId);
  const state: GameState = {
    version: SAVE_VERSION,
    empire,
    mode: world.mode,
    startId,
    startLabel: difficulty.label,
    multiplier: daily ? 1 : difficulty.multiplier,
    daily,
    owned: [startId],
    troops: START_TROOPS,
    lives: START_LIVES,
    streak: 0,
    bestStreak: 0,
    battles: 0,
    // The game opens with its one recruit phase: five questions about the starting country.
    // After that, troops come only from conquests.
    phase: 'recruit',
    recruit: null,
    battle: null,
    feedback: null,
    continentsCompleted: [],
    wounds: {},
    recentSigs: memory.sigs.slice(-RECENT_SIGS_KEPT),
    recentDecoys: memory.decoys,
    decimateReady: false,
    lastEvent: null,
    eventSeq: 0,
    answersCorrect: 0,
    answersWrong: 0,
    seed: 0,
  };
  state.recruit = {
    index: 0,
    earned: 0,
    correct: 0,
    asked: [],
    question: nextRecruitQuestion(world, startId, [], rng, { recent: state.recentSigs, decoys: state.recentDecoys }),
  };
  state.seed = nextSeed(rng);
  // A one-country mode would be won before it starts; no such mode exists, but never dead-end.
  if (world.ids.length === 1) state.phase = 'victory';
  return state;
}

function makeFeedback(question: Question, index: number | null): Feedback {
  const correctOption = question.options[question.correctIndex];
  return {
    chosen: index,
    correct: index === question.correctIndex,
    timedOut: index === null,
    correctLabel: correctOption.label,
    correctFlag: correctOption.flag,
    troopsGained: 0,
    multiplier: 1,
    troopsLost: 0,
    defendersKilled: 0,
    outcome: null,
  };
}

function answer(state: GameState, index: number | null): GameState {
  if (state.feedback) return state;
  if (state.phase === 'recruit' && state.recruit) {
    const { question } = state.recruit;
    if (index !== null && (index < 0 || index >= question.options.length)) return state;
    const feedback = makeFeedback(question, index);
    const result = resolveRecruitAnswer(state.streak, question.difficulty, feedback.correct);
    feedback.troopsGained = result.earned;
    feedback.multiplier = result.multiplier;
    return {
      ...state,
      troops: state.troops + result.earned,
      streak: result.streak,
      bestStreak: Math.max(state.bestStreak, result.streak),
      answersCorrect: state.answersCorrect + (feedback.correct ? 1 : 0),
      answersWrong: state.answersWrong + (feedback.correct ? 0 : 1),
      recruit: {
        ...state.recruit,
        earned: state.recruit.earned + result.earned,
        correct: state.recruit.correct + (feedback.correct ? 1 : 0),
        asked: [...state.recruit.asked, question.sig],
      },
      feedback,
    };
  }
  if (state.phase !== 'battle' || !state.battle) return state;
  const { question } = state.battle;
  if (index !== null && (index < 0 || index >= question.options.length)) return state;
  const feedback = makeFeedback(question, index);
  const result = resolveBattleAnswer(state.troops, state.battle.defenders, question.difficulty, feedback.correct);
  feedback.troopsLost = result.troopsLost;
  feedback.defendersKilled = result.defendersKilled;
  feedback.outcome = result.outcome;
  // Conquests are the only source of troops; they are handed over when the country changes hands.
  if (result.outcome === 'won') feedback.troopsGained = conquestTroops(state.battle.maxDefenders);
  const streak = feedback.correct ? state.streak + 1 : 0;
  return {
    ...state,
    troops: result.troops,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    answersCorrect: state.answersCorrect + (feedback.correct ? 1 : 0),
    answersWrong: state.answersWrong + (feedback.correct ? 0 : 1),
    battle: {
      ...state.battle,
      defenders: result.defenders,
      asked: [...state.battle.asked, question.sig],
    },
    feedback,
  };
}

function advance(world: World, state: GameState, rng: Rng): GameState {
  const feedback = state.feedback;
  if (!feedback) return state;

  if (state.phase === 'recruit' && state.recruit) {
    const recruit = state.recruit;
    const memory = remember(memoryOf(state), recruit.question);
    const recentSigs = memory.sigs;
    const recentDecoys = memory.decoys;
    if (recruit.index + 1 < RECRUIT_QUESTIONS) {
      return {
        ...state,
        feedback: null,
        recentSigs,
        recentDecoys,
        recruit: {
          ...recruit,
          index: recruit.index + 1,
          question: nextRecruitQuestion(world, state.startId, recruit.asked, rng, { recent: recentSigs, decoys: recentDecoys }),
        },
      };
    }
    // The army is as large as recruiting will ever make it. From here on, troops come from conquests.
    return {
      ...state,
      feedback: null,
      recentSigs,
      recentDecoys,
      recruit: null,
      phase: 'attack',
      lastEvent: { kind: 'recruited', earned: recruit.earned, correct: recruit.correct },
      eventSeq: state.eventSeq + 1,
    };
  }

  if (state.phase === 'battle' && state.battle) {
    const battle = state.battle;
    // Every question asked is remembered, with its wrong options: a later battle, or a later game, steers clear of it.
    const memory = remember(memoryOf(state), battle.question);
    const recentSigs = memory.sigs;
    state = { ...state, recentSigs, recentDecoys: memory.decoys };
    if (feedback.outcome === 'won') {
      // A country that falls without a single mistake on a long enough streak earns a DECIMATE.
      return takeCountry(world, { ...state, decimateReady: state.streak >= DECIMATE_STREAK }, battle.targetId, feedback.troopsGained, false);
    }
    if (feedback.outcome === 'lost') {
      // The last troop is gone and there is no way to raise more: the empire falls.
      return {
        ...state,
        lives: 0,
        phase: 'gameover',
        battle: null,
        feedback: null,
        lastEvent: { kind: 'defeated', countryId: battle.targetId },
        eventSeq: state.eventSeq + 1,
      };
    }
    return {
      ...state,
      feedback: null,
      battle: {
        ...battle,
        question: nextBattleQuestion(world, battle.targetId, battle.asked, rng, {
          recent: recentSigs,
          owned: state.owned,
          decoys: state.recentDecoys,
          rhythm: battle.rhythm,
        }),
      },
    };
  }
  return state;
}

/** A country changes hands: added to the empire with the troops it was worth, completing a continent or the campaign. */
function takeCountry(world: World, state: GameState, targetId: string, troopsGained: number, decimated: boolean): GameState {
  const owned = [...state.owned, targetId];
  const ownedSet = new Set(owned);
  const continent = world.byId[targetId].continent;
  const members = world.continents[continent] ?? [];
  const continentDone = !state.continentsCompleted.includes(continent) && members.every((id) => ownedSet.has(id));
  const continentsCompleted: Continent[] = continentDone ? [...state.continentsCompleted, continent] : state.continentsCompleted;
  const { [targetId]: _healed, ...wounds } = state.wounds;
  return {
    ...state,
    owned,
    troops: state.troops + troopsGained,
    continentsCompleted,
    wounds,
    battle: null,
    feedback: null,
    phase: owned.length >= world.ids.length ? 'victory' : 'attack',
    lastEvent: {
      kind: 'conquered',
      countryId: targetId,
      continent: continentDone ? continent : null,
      troopsGained,
      ...(decimated ? { decimated: true } : {}),
    },
    eventSeq: state.eventSeq + 1,
  };
}

/**
 * A ready DECIMATE takes a target outright: no questions. It counts as a battle won and pays the full
 * spoils, and it spends the streak, which starts again from 0.
 */
function decimate(world: World, state: GameState, targetId: string): GameState {
  if (state.phase !== 'attack' || !state.decimateReady) return state;
  const targets = getTargets(world, state.owned);
  const sea = targets.sea.includes(targetId);
  if (!sea && !targets.land.includes(targetId)) return state;
  const { full } = targetStrength(world, state, targetId, sea);
  return takeCountry(
    world,
    { ...state, battles: state.battles + 1, wounds: healWounds(state.wounds, targetId), streak: 0, decimateReady: false },
    targetId,
    conquestTroops(full),
    true,
  );
}

/**
 * How strongly a country is held right now: its full strength (own defenders, escalation for the size of
 * the player's empire, sea bonus) and how many are standing if an earlier retreat left it wounded.
 */
export function targetStrength(
  world: World,
  state: Pick<GameState, 'owned' | 'wounds'>,
  targetId: string,
  sea: boolean,
): { full: number; standing: number } {
  const full = battleDefenders(world.byId[targetId].population, sea, state.owned.length);
  return { full, standing: standingDefenders(full, state.wounds[targetId]) };
}

function attack(world: World, state: GameState, targetId: string, rng: Rng): GameState {
  if (state.phase !== 'attack' || state.troops <= 0) return state;
  const targets = getTargets(world, state.owned);
  const sea = targets.sea.includes(targetId);
  if (!sea && !targets.land.includes(targetId)) return state;
  const strength = targetStrength(world, state, targetId, sea);
  // The order of difficulties for this battle is dealt now, so it holds if the page is reloaded.
  const rhythm = battleRhythm(rng);
  return {
    ...state,
    phase: 'battle',
    feedback: null,
    battles: state.battles + 1,
    // A DECIMATE cannot be held: attacking any other way gives it up.
    decimateReady: false,
    // Countries left wounded by an earlier retreat recover while the army is busy here.
    wounds: healWounds(state.wounds, targetId),
    battle: {
      targetId,
      sea,
      defenders: strength.standing,
      maxDefenders: strength.full,
      startTroops: state.troops,
      asked: [],
      rhythm,
      question: nextBattleQuestion(world, targetId, [], rng, { recent: state.recentSigs, owned: state.owned, decoys: state.recentDecoys, rhythm }),
    },
  };
}

/** The game's only state transition function. Pure: same state + action in, same state out. */
export function reduce(world: World, state: GameState, action: Action): GameState {
  const rng = createRng(state.seed);
  let next: GameState = state;
  switch (action.type) {
    case 'answer':
      next = answer(state, action.index);
      break;
    case 'continue':
      next = advance(world, state, rng);
      break;
    case 'attack':
      next = attack(world, state, action.targetId, rng);
      break;
    case 'decimate':
      next = decimate(world, state, action.targetId);
      break;
    case 'forfeit':
      // The run ends as it stands: what was conquered is kept, and nothing more can be.
      if (state.phase === 'recruit' || state.phase === 'attack' || state.phase === 'battle') {
        next = {
          ...state,
          phase: 'gameover',
          lives: 0,
          recruit: null,
          battle: null,
          feedback: null,
          decimateReady: false,
          lastEvent: { kind: 'surrendered' },
          eventSeq: state.eventSeq + 1,
        };
      }
      break;
    case 'retreat':
      // Retreating saves your life but costs troops and the streak. Not available once the battle is
      // decided, or when it would take the last troop.
      if (
        state.phase === 'battle' &&
        state.battle &&
        (!state.feedback || state.feedback.outcome === 'ongoing') &&
        canRetreat(state.troops)
      ) {
        const { targetId, defenders, maxDefenders } = state.battle;
        const troopsLost = retreatCost(state.troops);
        next = {
          ...state,
          phase: 'attack',
          troops: state.troops - troopsLost,
          streak: 0,
          feedback: null,
          battle: null,
          // The defenders already beaten stay beaten for now: the country is left wounded.
          wounds: { ...state.wounds, [targetId]: maxDefenders - defenders },
          lastEvent: { kind: 'retreated', countryId: targetId, troopsLost, defendersLeft: defenders, defendersFull: maxDefenders },
          eventSeq: state.eventSeq + 1,
        };
      }
      break;
  }
  if (next === state) return state;
  return { ...next, seed: nextSeed(rng) };
}

export interface GameStats {
  conquered: number;
  owned: number;
  total: number;
  bestStreak: number;
  battles: number;
  /** Continents held in full, and the bonus points they are worth. */
  continents: Continent[];
  continentBonus: number;
  score: number;
  multiplier: number;
}

export function gameStats(world: World, state: GameState): GameStats {
  // The starting country was given, not conquered.
  const conquered = Math.max(0, state.owned.length - 1);
  return {
    conquered,
    owned: state.owned.length,
    total: world.ids.length,
    bestStreak: state.bestStreak,
    battles: state.battles,
    continents: state.continentsCompleted,
    continentBonus: state.continentsCompleted.length * CONTINENT_BONUS,
    score: finalScore(conquered, state.multiplier, state.continentsCompleted.length),
    multiplier: state.multiplier,
  };
}

/** Validates a saved game against the current data; returns null if it cannot be resumed. */
export function reviveGame(raw: unknown, worldFor: (mode: ModeId) => World | null): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameState>;
  if (s.version !== SAVE_VERSION || typeof s.mode !== 'string' || !Array.isArray(s.owned)) return null;
  const world = worldFor(s.mode as ModeId);
  if (!world) return null;
  if (s.owned.length === 0 || !s.owned.every((id) => typeof id === 'string' && world.inPlay.has(id))) return null;
  if (typeof s.troops !== 'number' || typeof s.lives !== 'number' || typeof s.seed !== 'number') return null;
  if (typeof s.battles !== 'number') return null;
  const empire = sanitizeEmpire(s.empire);
  if (!empire || !Array.isArray(s.continentsCompleted)) return null;
  if (!s.wounds || typeof s.wounds !== 'object') return null;
  switch (s.phase) {
    case 'recruit':
      if (!s.recruit?.question) return null;
      break;
    case 'battle':
      if (!s.battle?.question || !world.inPlay.has(s.battle.targetId)) return null;
      break;
    case 'attack':
    case 'gameover':
    case 'victory':
      break;
    default:
      return null;
  }
  const memory = sanitizeMemory({ sigs: s.recentSigs, decoys: s.recentDecoys });
  const battle = s.battle
    ? { ...s.battle, rhythm: Array.isArray(s.battle.rhythm) && s.battle.rhythm.length > 0 ? s.battle.rhythm : battleRhythm(createRng(s.seed)) }
    : null;
  return {
    ...(s as GameState),
    empire,
    battle,
    recentSigs: memory.sigs,
    recentDecoys: memory.decoys,
    decimateReady: s.phase === 'attack' && s.decimateReady === true,
    daily: typeof s.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.daily) ? s.daily : null,
  };
}
