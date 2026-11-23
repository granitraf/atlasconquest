import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_FLAG, type Empire } from '../src/game/flag';
import type { Continent, Country, Fact, GameState } from '../src/game/types';
import { reduce } from '../src/game/state';
import type { World } from '../src/game/world';

export const ALL: Country[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'countries.json'), 'utf8'),
);

export const FACTS: Fact[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'facts.json'), 'utf8'),
).facts;

export const EMPIRE: Empire = { name: 'Testland', flag: DEFAULT_FLAG };

/** Builds a synthetic country for small hand-made worlds. */
export function fake(id: string, over: Partial<Country> = {}): Country {
  return {
    id,
    cca2: id.toLowerCase().slice(0, 2),
    ccn3: null,
    name: `Land ${id}`,
    officialName: `Republic of ${id}`,
    capital: `${id} City`,
    continent: 'Europe' as Continent,
    region: 'Europe',
    subregion: 'Testland',
    borders: [],
    landlocked: false,
    population: 2_000_000,
    area: 1000,
    currencies: [`${id} Dollar`],
    languages: [`${id}ish`],
    tld: `.${id.toLowerCase().slice(0, 2)}`,
    fame: 1,
    waters: [],
    // Every made-up coast is on the same sea, unless a test says otherwise.
    lanes: ['Test Sea'],
    watersAvoid: [],
    features: [],
    featuresAvoid: [],
    lines: [],
    linesAvoid: [],
    languagesAvoid: [],
    lat: 0,
    lng: 0,
    flagKey: `flag-${id}`,
    ...over,
  };
}

/** Answers the current question (correctly or not) and dismisses the feedback. */
export function answerOnce(world: World, state: GameState, correct: boolean): GameState {
  const question = state.phase === 'recruit' ? state.recruit!.question : state.battle!.question;
  const index = correct ? question.correctIndex : (question.correctIndex + 1) % question.options.length;
  const answered = reduce(world, state, { type: 'answer', index });
  return reduce(world, answered, { type: 'continue' });
}

/** Plays the opening recruit phase with the given answer pattern. */
export function playRecruit(world: World, state: GameState, pattern: boolean[]): GameState {
  let s = state;
  for (const correct of pattern) s = answerOnce(world, s, correct);
  return s;
}

/** Attacks a country and answers everything correctly until the battle is over. */
export function conquer(world: World, state: GameState, targetId: string): GameState {
  let s = reduce(world, state, { type: 'attack', targetId });
  if (s.phase !== 'battle') throw new Error(`${targetId} cannot be attacked`);
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 60) s = answerOnce(world, s, true);
  return s;
}
