import type { Empire } from './flag';

export const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
] as const;

export type Continent = (typeof CONTINENTS)[number];
export type ModeId = 'World' | Continent;
export const MODES: ModeId[] = ['World', ...CONTINENTS];

export interface Country {
  /** ISO alpha-3, the primary key everywhere in the game. */
  id: string;
  /** Lower-case ISO alpha-2, also the flag file name. */
  cca2: string;
  ccn3: string | null;
  name: string;
  officialName: string;
  capital: string;
  continent: Continent;
  region: string;
  subregion: string;
  borders: string[];
  landlocked: boolean;
  population: number;
  area: number;
  currencies: string[];
  languages: string[];
  /** Languages never offered for this country at all, neither as the answer nor as a wrong option. */
  languagesAvoid: string[];
  /** Internet country code domain, e.g. ".ch"; null where there is none. */
  tld: string | null;
  /** How well known the country is: 0 famous, 1 mid-known, 2 obscure. Set from config/fame.json. */
  fame: 0 | 1 | 2;
  /** Seas and oceans the country clearly borders (config/geography.json). */
  waters: string[];
  /** Seas and oceans it arguably touches: never the right answer, never offered as a wrong one. */
  watersAvoid: string[];
  /** Great rivers, deserts, mountain ranges and rainforests clearly found in the country. */
  features: { name: string; kind: FeatureKind }[];
  featuresAvoid: string[];
  /** Lines on the globe that clearly cross the country's land, computed from its shape. */
  lines: string[];
  /** Lines that pass between its islands or graze its edge. */
  linesAvoid: string[];
  lat: number;
  lng: number;
  /** Hash of the flag file; two countries with the same key fly the same flag. */
  flagKey: string;
}

export type FeatureKind = 'river' | 'desert' | 'mountains' | 'rainforest';

export const FACT_CATEGORIES = ['landmark', 'person', 'food', 'history', 'nature', 'culture', 'film', 'sport', 'economy'] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** One curated fact about a country (public/data/facts.json). */
export interface Fact {
  id: string;
  /** ISO alpha-3 code of the country the fact is about. */
  country: string;
  category: FactCategory;
  /** Facts of the same kind can stand in as wrong options for each other; "custom" facts bring their own. */
  kind: string;
  /** The question, with the country named in it. */
  prompt: string;
  answer: string;
  /** 3 = known worldwide, 2 = known to a well-read player, 1 = known mostly inside the country. */
  recognition: 1 | 2 | 3;
  /** A memorable, specific fact chosen to give the country its hook. */
  hook?: boolean;
  /** Hand-picked wrong options, for one-off questions. */
  wrong?: string[];
  /** Other countries this answer is also true for; it is never offered to them as a wrong option. */
  sharedWith?: string[];
  /** Answers in the same group are too close to offer against each other. */
  group?: string;
  /** Worth double-checking. */
  unsure?: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type QuestionType =
  | 'flag'
  | 'capital'
  | 'water'
  | 'border'
  | 'currency'
  | 'language'
  | 'domain'
  | 'brand'
  | 'feature'
  | 'lines'
  | 'fact'
  | 'population'
  | 'area'
  | 'notBorder';

export interface QuestionOption {
  label: string;
  /** Lower-case alpha-2 code when the option is shown as a flag image. */
  flag?: string;
}

export interface Question {
  /** Unique signature; a battle never asks two questions with the same one. */
  sig: string;
  type: QuestionType;
  /** Tier the question actually scored: type weight + country fame + option closeness. */
  difficulty: Difficulty;
  /** That score, 1 to 6. */
  score: number;
  /** 1 when the wrong options are close calls (same region, lookalikes), 0 when they come from far away. */
  closeness: 0 | 1;
  countryId: string;
  prompt: string;
  options: QuestionOption[];
  correctIndex: number;
}

export type StartLabel = 'Easy' | 'Medium' | 'Hard' | 'Very Hard' | 'Extreme';

/** Where a start sits on the map, judged by its in-mode land neighbours. */
export type StartPosition = 'open' | 'cheapExit' | 'boxedIn' | 'island';

export interface StartDifficulty {
  label: StartLabel;
  multiplier: number;
  fame: 0 | 1 | 2;
  position: StartPosition;
  /** One line explaining the rating. */
  reason: string;
  landNeighbours: number;
  /** Land neighbours defended lightly enough to be a cheap first conquest. */
  cheapNeighbours: number;
}

export interface Targets {
  /** Unowned countries sharing a land border with player territory. */
  land: string[];
  /** Unowned countries reachable by sea crossing. */
  sea: string[];
  /** True when nothing was in sea range and the nearest few were offered instead. */
  seaFallback: boolean;
}

/** 'recruit' happens once, right after the starting country is chosen. */
export type Phase = 'recruit' | 'attack' | 'battle' | 'gameover' | 'victory';

export interface RecruitState {
  /** 0-based index of the current question within the phase. */
  index: number;
  earned: number;
  correct: number;
  asked: string[];
  question: Question;
}

export interface BattleState {
  targetId: string;
  sea: boolean;
  defenders: number;
  maxDefenders: number;
  /** Troops the player had when the battle began. */
  startTroops: number;
  asked: string[];
  question: Question;
}

export type BattleOutcome = 'ongoing' | 'won' | 'lost';

export interface Feedback {
  /** Index the player chose, or null when the timer ran out. */
  chosen: number | null;
  correct: boolean;
  timedOut: boolean;
  correctLabel: string;
  correctFlag?: string;
  /** Troops gained by this answer: a recruit reward, or what the conquest is worth when it wins the battle. */
  troopsGained: number;
  /** Recruit: streak multiplier applied to this answer. */
  multiplier: number;
  /** Player troops lost by this answer. */
  troopsLost: number;
  /** Defenders eliminated by this answer. */
  defendersKilled: number;
  outcome: BattleOutcome | null;
}

export type GameEvent =
  /** The opening recruit phase is over. */
  | { kind: 'recruited'; earned: number; correct: number }
  /** `continent` is set when this conquest completed a whole continent. `troopsGained` is what the conquest was worth. */
  | { kind: 'conquered'; countryId: string; continent: Continent | null; troopsGained: number }
  | { kind: 'defeated'; countryId: string }
  /** `defendersLeft` of `defendersFull` were still standing; the country stays wounded. */
  | { kind: 'retreated'; countryId: string; troopsLost: number; defendersLeft: number; defendersFull: number };

export interface GameState {
  version: number;
  /** The player's empire: its name and flag. */
  empire: Empire;
  mode: ModeId;
  startId: string;
  startLabel: StartLabel;
  multiplier: number;
  owned: string[];
  troops: number;
  lives: number;
  streak: number;
  bestStreak: number;
  /** Attacks launched so far. */
  battles: number;
  phase: Phase;
  /** The opening recruit phase; null once it is over. */
  recruit: RecruitState | null;
  battle: BattleState | null;
  feedback: Feedback | null;
  /** Continents conquered in full; each is worth bonus points. */
  continentsCompleted: Continent[];
  /** Defenders already beaten in countries the player retreated from. They recover while the player attacks elsewhere. */
  wounds: Record<string, number>;
  /** Signatures of the questions asked most recently, so later battles ask something new. */
  recentSigs: string[];
  lastEvent: GameEvent | null;
  /** Bumped on every event so the UI can key animations and toasts. */
  eventSeq: number;
  answersCorrect: number;
  answersWrong: number;
  seed: number;
}
