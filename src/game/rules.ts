import type { BattleOutcome, Difficulty, StartDifficulty, StartLabel, StartPosition, Targets } from './types';
import { distanceKm, type World } from './world';

/**
 * Everything on screen is counted in soldiers: each unit of the game's
 * arithmetic (a troop, a defender) is shown as this many. The rules themselves
 * work in units, so 10 starting troops read as 10,000, a country with 9
 * defenders as 9,000, and a wrong answer as 2,000 lost.
 */
export const SOLDIERS_PER_UNIT = 1000;

/** A number of troops or defenders as it is shown: 9 -> "9,000". */
export function soldiers(units: number): string {
  return (units * SOLDIERS_PER_UNIT).toLocaleString('en-US');
}

/** The same, for places with no room: 9 -> "9k". */
export function soldiersShort(units: number): string {
  return `${(units * SOLDIERS_PER_UNIT) / 1000}k`;
}

export const START_TROOPS = 10;
/** Hardcore: one life. Lose a battle and the game is over. */
export const START_LIVES = 1;
/** Bonus points for holding every country of a continent. */
export const CONTINENT_BONUS = 10;
/** Questions in the opening recruit phase, the one chance to enlarge the army before the first attack. */
export const RECRUIT_QUESTIONS = 5;
export const WRONG_ANSWER_TROOP_LOSS = 2;
export const SEA_RANGE_KM = 2500;
/**
 * An empire with a coast always has at least this many countries to attack (while that many
 * remain): if its borders and the sea range give fewer, the nearest shores beyond the range
 * are offered until there are this many.
 */
export const MIN_TARGETS = 3;
/** Every question is on the clock; running out counts as a wrong answer. */
export const QUESTION_TIMER_SECONDS = 20;
/** Sea crossings are harder: half the time. */
export const SEA_TIMER_SECONDS = 10;
export const MIN_DEFENDERS = 3;
export const MAX_DEFENDERS = 14;
/** Every country gains one defender for each this many countries the player holds. */
export const ESCALATION_EVERY = 15;
/** A country the player retreated from wins back this many defenders each time the player attacks somewhere else. */
export const WOUND_HEAL_PER_BATTLE = 2;
/** Share of the army lost by retreating. */
export const RETREAT_SHARE = 0.25;

/**
 * A country's own defending troops, scaled smoothly with population (3 more per
 * tenfold) and never fewer than 3: micro-states and Malta 3, Ireland 6,
 * Netherlands 8, Germany 10, USA 11, India 13.
 */
export function defendersFor(population: number): number {
  const scaled = Math.round(3 + 3 * (Math.log10(Math.max(1, population)) - 5.7));
  return Math.max(MIN_DEFENDERS, Math.min(MAX_DEFENDERS, scaled));
}

/** Extra defenders when attacking across the sea: a third again, at least 1. */
export function seaBonus(defenders: number): number {
  return Math.max(1, Math.round(defenders / 3));
}

/** Extra defenders every country gets as the player's empire grows, so the late game gets harder. */
export function escalation(countriesHeld: number): number {
  return Math.floor(Math.max(0, countriesHeld) / ESCALATION_EVERY);
}

/** Full strength of a country when attacked: its own defenders, plus escalation, plus the sea bonus on top. */
export function battleDefenders(population: number, sea: boolean, countriesHeld = 0): number {
  const base = defendersFor(population) + escalation(countriesHeld);
  return base + (sea ? seaBonus(base) : 0);
}

/** Defenders actually standing in a wounded country. At least one always remains to be beaten. */
export function standingDefenders(full: number, wound = 0): number {
  return Math.max(1, full - Math.max(0, wound));
}

/**
 * Wounded countries recover while the player is busy elsewhere: every attack on
 * another country gives each of them some defenders back. The country being
 * attacked (`except`) does not heal. Fully healed ones drop off the list.
 */
export function healWounds(wounds: Readonly<Record<string, number>>, except?: string): Record<string, number> {
  const healed: Record<string, number> = {};
  for (const [id, wound] of Object.entries(wounds)) {
    if (id === except) healed[id] = wound;
    else if (wound > WOUND_HEAL_PER_BATTLE) healed[id] = wound - WOUND_HEAL_PER_BATTLE;
  }
  return healed;
}

export function questionSeconds(sea: boolean): number {
  return sea ? SEA_TIMER_SECONDS : QUESTION_TIMER_SECONDS;
}

/** x1 below 5 correct in a row, x2 from 5, x3 from 10. Applies to recruit rewards. */
export function streakMultiplier(streak: number): number {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

/** Base troops for a correct recruit answer. */
export function troopReward(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
}

/** Defenders eliminated by a correct battle answer. */
export function defenderKills(difficulty: Difficulty): number {
  return difficulty === 'hard' ? 2 : 1;
}

export interface RecruitResult {
  streak: number;
  earned: number;
  multiplier: number;
}

/**
 * Resolves one recruit answer. The streak counts the answer being resolved, so
 * the fifth correct answer in a row is the first one to be doubled.
 */
export function resolveRecruitAnswer(streak: number, difficulty: Difficulty, correct: boolean): RecruitResult {
  if (!correct) return { streak: 0, earned: 0, multiplier: 1 };
  const next = streak + 1;
  const multiplier = streakMultiplier(next);
  return { streak: next, earned: troopReward(difficulty) * multiplier, multiplier };
}

export interface BattleResult {
  troops: number;
  defenders: number;
  troopsLost: number;
  defendersKilled: number;
  outcome: BattleOutcome;
}

/** Resolves one battle answer: correct hurts the defenders, wrong hurts the player. */
export function resolveBattleAnswer(
  troops: number,
  defenders: number,
  difficulty: Difficulty,
  correct: boolean,
): BattleResult {
  if (correct) {
    const defendersKilled = Math.min(defenders, defenderKills(difficulty));
    const left = defenders - defendersKilled;
    return { troops, defenders: left, troopsLost: 0, defendersKilled, outcome: left === 0 ? 'won' : 'ongoing' };
  }
  const troopsLost = Math.min(troops, WRONG_ANSWER_TROOP_LOSS);
  const left = troops - troopsLost;
  return { troops: left, defenders, troopsLost, defendersKilled: 0, outcome: left === 0 ? 'lost' : 'ongoing' };
}

/**
 * How far along a battle is, 0..1. Defenders eliminated push it up; troop
 * losses scale it back down, so a wrong answer visibly drops the bar.
 */
export function battleProgress(defenders: number, maxDefenders: number, troops: number, startTroops: number): number {
  if (maxDefenders <= 0 || defenders <= 0) return 1;
  const advance = (maxDefenders - defenders) / maxDefenders;
  const strength = startTroops > 0 ? Math.max(0, Math.min(1, troops / startTroops)) : 0;
  return advance * strength;
}

/**
 * Countries the player may attack.
 *
 * Land: any unowned country bordering player territory.
 * Sea: with at least one coastal country owned, any unowned coastal country
 * within SEA_RANGE_KM (centre to centre) of an owned country.
 * Top-up: an isolated empire (a lone island far from anything, or a large
 * country whose centre is far from every shore) would have next to nothing to
 * attack. If land and sea together give fewer than MIN_TARGETS, the nearest
 * coastal countries beyond the range are added until there are MIN_TARGETS.
 * Well-connected empires are not affected: the range itself does not change.
 *
 * Whenever unowned countries remain the result is never empty: if neither rule
 * yields a target (e.g. only landlocked countries are left and none touch
 * player territory), the nearest few countries of any kind are offered as
 * crossings, so no country can ever be unreachable.
 */
export function getTargets(world: World, owned: readonly string[]): Targets {
  const ownedSet = new Set(owned);
  const ownedCountries = owned.map((id) => world.byId[id]).filter(Boolean);
  const land = new Set<string>();
  for (const id of owned) {
    for (const n of world.neighbours[id] ?? []) if (!ownedSet.has(n)) land.add(n);
  }

  const nearestOwnedKm = (id: string) => {
    const c = world.byId[id];
    let best = Infinity;
    for (const o of ownedCountries) best = Math.min(best, distanceKm(o, c));
    return best;
  };
  const byDistance = (ids: string[]) =>
    ids
      .map((id) => ({ id, km: nearestOwnedKm(id) }))
      .sort((a, b) => a.km - b.km || a.id.localeCompare(b.id));

  let sea: string[] = [];
  let seaFallback = false;
  const unowned = world.ids.filter((id) => !ownedSet.has(id) && !land.has(id));
  if (ownedCountries.some((c) => !c.landlocked)) {
    const ranked = byDistance(unowned.filter((id) => !world.byId[id].landlocked));
    sea = ranked.filter((r) => r.km <= SEA_RANGE_KM).map((r) => r.id);
    // Short of options: the nearest shores beyond the range open up, nearest first.
    const beyond = ranked.slice(sea.length, sea.length + Math.max(0, MIN_TARGETS - land.size - sea.length));
    if (beyond.length > 0) {
      sea = [...sea, ...beyond.map((r) => r.id)];
      seaFallback = true;
    }
  }

  if (land.size === 0 && sea.length === 0 && unowned.length > 0 && ownedCountries.length > 0) {
    sea = byDistance(unowned)
      .slice(0, MIN_TARGETS)
      .map((r) => r.id);
    seaFallback = true;
  }

  return { land: [...land].sort(), sea, seaFallback };
}

/** A neighbour defended by this many or fewer is a cheap first conquest. */
export const CHEAP_DEFENDERS = 6;

export const START_LABELS: StartLabel[] = ['Easy', 'Medium', 'Hard', 'Very Hard', 'Extreme'];

export const START_MULTIPLIER: Record<StartLabel, number> = {
  Easy: 1,
  Medium: 1.5,
  Hard: 2,
  'Very Hard': 2.5,
  Extreme: 3,
};

/**
 * How many defenders a conquest has to beat for each troop it is worth. After
 * the opening recruit phase, conquests are the only way to gain troops.
 */
export const DEFENDERS_PER_TROOP = 3;

/**
 * Troops gained by conquering a country: one for every DEFENDERS_PER_TROOP
 * defenders it had at full strength in that battle (its own, plus the extra
 * for the size of the player's empire, plus the sea bonus), rounded, at least
 * 1. The bigger the fight, the more it pays: 3-4 defenders 1 troop, 5-7 two,
 * 8-10 three, 11-13 four. A wounded country still pays for its full strength.
 */
export function conquestTroops(defenders: number): number {
  return Math.max(1, Math.round(defenders / DEFENDERS_PER_TROOP));
}

/** Rating by how well known the country is (rows) and where it sits (columns). */
export const START_RATING: Record<0 | 1 | 2, Record<StartPosition, StartLabel>> = {
  0: { open: 'Easy', cheapExit: 'Easy', boxedIn: 'Easy', island: 'Easy' },
  1: { open: 'Medium', cheapExit: 'Medium', boxedIn: 'Hard', island: 'Very Hard' },
  2: { open: 'Hard', cheapExit: 'Hard', boxedIn: 'Very Hard', island: 'Extreme' },
};

const POSITION_REASON: Record<StartPosition, string> = {
  open: 'several lightly defended neighbours',
  cheapExit: 'a lightly defended neighbour to start on',
  boxedIn: 'every neighbour is strongly defended',
  island: 'every expansion is a sea crossing',
};

/**
 * Where a start sits, counting only land neighbours in the mode and their own defenders:
 *  - island:    no land neighbours
 *  - open:      3+ neighbours, at least 2 of them with CHEAP_DEFENDERS or fewer
 *  - cheapExit: at least one neighbour with CHEAP_DEFENDERS or fewer
 *  - boxedIn:   neighbours, but every one of them is stronger than that
 */
export function startPosition(
  world: World,
  id: string,
): { position: StartPosition; landNeighbours: number; cheapNeighbours: number } {
  const neighbours = world.neighbours[id] ?? [];
  const cheap = neighbours.filter((n) => defendersFor(world.byId[n].population) <= CHEAP_DEFENDERS).length;
  const position: StartPosition =
    neighbours.length === 0 ? 'island' : neighbours.length >= 3 && cheap >= 2 ? 'open' : cheap >= 1 ? 'cheapExit' : 'boxedIn';
  return { position, landNeighbours: neighbours.length, cheapNeighbours: cheap };
}

/**
 * Start difficulty: how well known the country is, crossed with its position.
 * It sets the score multiplier, and through the country's fame how hard (and how
 * well paid) the opening recruit questions are.
 */
export function startDifficulty(world: World, id: string): StartDifficulty {
  const { position, landNeighbours, cheapNeighbours } = startPosition(world, id);
  const fame = world.byId[id].fame;
  const label = START_RATING[fame][position];
  const island = position === 'island';
  const reason =
    fame === 0
      ? `Well known ${island ? 'island nation' : 'country'}`
      : `${fame === 1 ? 'Mid-known' : 'Obscure'} ${island ? 'island' : 'country'}: ${POSITION_REASON[position]}`;
  return { label, multiplier: START_MULTIPLIER[label], fame, position, reason, landNeighbours, cheapNeighbours };
}

/**
 * Troops lost by retreating: a quarter of the army, rounded up (at least 1).
 * Nothing if there is nothing left to lose.
 */
export function retreatCost(troops: number): number {
  return troops <= 0 ? 0 : Math.max(1, Math.ceil(troops * RETREAT_SHARE));
}

/**
 * A retreat has to be paid for, and it can never take the last troop: with no
 * troops and no way to raise more, the empire could not attack again.
 */
export function canRetreat(troops: number): boolean {
  return troops - retreatCost(troops) >= 1;
}

/**
 * Final score: countries conquered times the start's difficulty multiplier,
 * plus a bonus for every continent conquered in full.
 */
export function finalScore(conquered: number, multiplier: number, continents = 0): number {
  return Math.round((conquered * multiplier + continents * CONTINENT_BONUS) * 10) / 10;
}
