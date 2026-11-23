import { describe, expect, it } from 'vitest';
import { BRANDS } from '../src/game/brands';
import {
  DIRECTION_CLEAR,
  DIRECTION_ELSEWHERE,
  FACT_MIN_RECOGNITION,
  FLAG_CLOSE_CHANCE,
  GLOBE_LINES,
  NO_LINE,
  REASON_OUT_SHARE,
  RECRUIT_RAMP,
  REASON_OUT_TYPES,
  countryPhrase,
  givesAway,
  IDENTICAL_FLAGS,
  LOOKALIKE_FLAGS,
  POPULATION_BUCKETS,
  QUESTION_TYPES,
  TYPE_WEIGHT,
  USES_CLOSENESS,
  bearing,
  bearingGap,
  combinations,
  currencyFamily,
  currencyUnit,
  flagsIdentical,
  flagsLookAlike,
  generateQuestion,
  nextBattleQuestion,
  nextRecruitQuestion,
  pickForTier,
  pickQuestion,
  populationBucket,
  questionScore,
  sigKind,
  sigType,
  tierOf,
  tierOrder,
  type Closeness,
} from '../src/game/questions';
import { createRng } from '../src/game/rng';
import { FACT_CATEGORIES, type Country, type Difficulty, type Fact, type Question } from '../src/game/types';
import { buildWorld } from '../src/game/world';
import { ALL, FACTS } from './helpers';

const world = buildWorld(ALL, 'World', FACTS);
const byName = new Map(ALL.map((c) => [c.name, c]));
const byCca2 = new Map(ALL.map((c) => [c.cca2, c]));
const brandHome = new Map(Object.entries(BRANDS).flatMap(([id, brands]) => brands.map((b) => [b, id] as const)));
const id = (name: string) => byName.get(name)!.id;

const COMPASS: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };
/** Line-up questions ("which of these is the biggest?") show the country as one of the four options. */
const isLineUp = (q: Question) => ['area:biggest', 'area:smallest', 'population:most', 'population:fewest'].includes(sigKind(q.sig));

/** Checks an answer against the raw data, independently of the generator. */
function isTrue(q: Question, optionIndex: number): boolean {
  const c = world.byId[q.countryId];
  const option = q.options[optionIndex];
  switch (q.type) {
    case 'flag':
      return byCca2.get(option.flag!)!.flagKey === c.flagKey;
    case 'capital':
      return option.label === c.capital;
    case 'border': {
      const o = byName.get(option.label)!;
      const parts = q.sig.split(':');
      if (!c.borders.includes(o.id)) return false;
      if (parts[1] === 'both') return world.byId[parts[3]].borders.includes(o.id);
      if (parts[1] === 'direction') return bearingGap(bearing(c, o), COMPASS[parts[3]]) <= DIRECTION_CLEAR;
      if (parts[1] === 'landlocked') return o.landlocked === (parts[3] === 'is');
      return true;
    }
    case 'notBorder':
      return !c.borders.includes(byName.get(option.label)!.id);
    case 'currency':
      return c.currencies.map(currencyUnit).includes(option.label);
    case 'language':
      return c.languages.includes(option.label);
    case 'domain':
      return option.label === c.tld;
    case 'brand':
      return brandHome.get(option.label) === c.id;
    case 'water':
      return c.waters.includes(option.label) || c.watersAvoid.includes(option.label);
    case 'feature':
      return c.features.some((f) => f.name === option.label) || c.featuresAvoid.includes(option.label);
    case 'lines':
      return c.lines.includes(option.label) || c.linesAvoid.includes(option.label);
    case 'fact':
      // True for this country if it is one of its own answers, or another country's answer shared with it.
      return (
        (world.factsByCountry[c.id] ?? []).some((f) => f.answer === option.label) ||
        FACTS.some((f) => f.answer === option.label && f.sharedWith?.includes(c.id))
      );
    case 'population': {
      const people = (label: string) => byName.get(label)!.population;
      if (q.sig.startsWith('population:most:')) return q.options.every((other) => people(other.label) <= people(option.label));
      if (q.sig.startsWith('population:fewest:')) return q.options.every((other) => people(other.label) >= people(option.label));
      return POPULATION_BUCKETS[populationBucket(c.population)].label === option.label;
    }
    case 'area': {
      const o = byName.get(option.label)!;
      if (q.sig.startsWith('area:biggest:')) return q.options.every((other) => byName.get(other.label)!.area <= o.area);
      if (q.sig.startsWith('area:smallest:')) return q.options.every((other) => byName.get(other.label)!.area >= o.area);
      if (q.sig.startsWith('area:larger:')) return o.area > c.area;
      if (q.sig.startsWith('area:smaller:')) return o.area < c.area;
      // "Closest in size": no other option is nearer to the country's area.
      const gap = (label: string) => Math.abs(Math.log(byName.get(label)!.area / c.area));
      return q.options.every((other) => gap(other.label) >= gap(option.label));
    }
  }
}

function checkWellFormed(q: Question) {
  const c = world.byId[q.countryId];
  expect(q.options).toHaveLength(4);
  expect(q.correctIndex).toBeGreaterThanOrEqual(0);
  expect(q.correctIndex).toBeLessThan(4);
  expect(q.score).toBe(questionScore(q.type, c.fame, q.closeness));
  expect(q.difficulty).toBe(tierOf(q.score));
  expect(q.prompt.length).toBeGreaterThan(5);
  const keys = q.options.map((o) => (q.type === 'flag' ? o.flag : o.label));
  expect(new Set(keys).size, `duplicate options in ${q.sig}: ${keys.join(' | ')}`).toBe(4);
  for (const o of q.options) expect(o.label).toBeTruthy();
  if (isLineUp(q)) {
    // A line-up ranks the country against three others: it is one of the options, and may be the answer.
    expect(q.options.map((o) => o.label), q.sig).toContain(c.name);
  } else {
    // The country is named in the question, and the answer is never the country's own name.
    expect(q.prompt, q.sig).toContain(c.name.split(/,| and /)[0]);
    // (A flag question shows four flag images; its label is only revealed after answering.)
    if (q.type !== 'flag') expect(q.options[q.correctIndex].label, q.sig).not.toBe(c.name);
  }
  // Exactly one option is true.
  const truths = q.options.map((_, i) => isTrue(q, i));
  expect(truths.filter(Boolean), `${q.sig}: ${keys.join(' | ')}`).toHaveLength(1);
  expect(truths[q.correctIndex], `${q.sig}: marked answer is not the true one`).toBe(true);
}

describe('difficulty score', () => {
  it('is type weight + country fame + option closeness', () => {
    expect(TYPE_WEIGHT).toEqual({
      flag: 1,
      capital: 1,
      water: 1,
      border: 2,
      currency: 2,
      language: 2,
      domain: 2,
      brand: 2,
      feature: 2,
      lines: 2,
      fact: 2,
      population: 3,
      area: 3,
      notBorder: 3,
    });
    expect(questionScore('capital', 0, 0)).toBe(1);
    expect(questionScore('capital', 2, 1)).toBe(4);
    expect(questionScore('notBorder', 2, 1)).toBe(6);
  });

  it('closeness does not count for population and area questions', () => {
    expect(USES_CLOSENESS.population).toBe(false);
    expect(USES_CLOSENESS.area).toBe(false);
    expect(questionScore('population', 1, 1)).toBe(questionScore('population', 1, 0));
    expect(questionScore('area', 2, 1)).toBe(5);
  });

  it('scores 1-2 Easy, 3-4 Medium, 5-6 Hard', () => {
    expect([1, 2, 3, 4, 5, 6].map(tierOf)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard']);
  });

  it('scores the worked examples', () => {
    const rng = createRng(1);
    const ask = (name: string, type: Parameters<typeof generateQuestion>[2], closeness: Closeness) =>
      generateQuestion(world, id(name), type, rng, undefined, closeness)!;
    expect(ask('France', 'capital', 0)).toMatchObject({ score: 1, difficulty: 'easy' });
    expect(ask('Palau', 'capital', 1)).toMatchObject({ score: 4, difficulty: 'medium' });
    expect(ask('Japan', 'flag', 0)).toMatchObject({ score: 1, difficulty: 'easy' });
    expect(byName.get('Comoros')!.fame).toBe(2);
    expect(ask('Comoros', 'population', 1)).toMatchObject({ score: 5, difficulty: 'hard', closeness: 0 });
  });

  it('a famous country has no Hard questions and an obscure one no Easy ones', () => {
    const tiers = (name: string) => new Set(combinations(byName.get(name)!).map((c) => c.tier));
    expect([...tiers('France')].sort()).toEqual(['easy', 'medium']);
    expect([...tiers('Romania')].sort()).toEqual(['easy', 'hard', 'medium']);
    expect([...tiers('Palau')].sort()).toEqual(['hard', 'medium']);
  });

  it('tries the nearest tier first when the target is impossible, the easier one on a tie', () => {
    expect(tierOrder('easy')).toEqual(['easy', 'medium', 'hard']);
    expect(tierOrder('hard')).toEqual(['hard', 'medium', 'easy']);
    expect(tierOrder('medium')).toEqual(['medium', 'easy', 'hard']);
  });
});

describe('question generation', () => {
  it('every question for every country has 4 distinct options and exactly one true answer, at both closeness levels', () => {
    const rng = createRng(20261122);
    let generated = 0;
    for (const c of ALL) {
      for (const type of QUESTION_TYPES) {
        for (const closeness of [0, 1] as const) {
          for (let round = 0; round < 3; round++) {
            const q = generateQuestion(world, c.id, type, rng, undefined, closeness);
            if (!q) continue;
            expect(q.type).toBe(type);
            expect(q.countryId).toBe(c.id);
            expect(q.closeness).toBe(USES_CLOSENESS[type] ? closeness : 0);
            checkWellFormed(q);
            generated++;
          }
        }
      }
    }
    expect(generated).toBeGreaterThan(ALL.length * 7 * 6);
  });

  it('never asks for a capital that is just the country\'s own name', () => {
    const rng = createRng(8);
    const skipped = ALL.filter((c) => generateQuestion(world, c.id, 'capital', rng) === null).map((c) => c.name);
    for (const name of ['Djibouti', 'Singapore', 'Monaco', 'Luxembourg', 'Mexico', 'Guatemala', 'Panama', 'Kuwait', 'San Marino']) expect(skipped).toContain(name);
    for (const name of ['France', 'Brazil', 'Japan', 'Algeria']) expect(skipped).not.toContain(name);
    expect(skipped.length).toBeLessThan(25);
  });

  it('every country can always be asked its flag, currency, language, population and area', () => {
    const rng = createRng(7);
    for (const c of ALL) {
      for (const type of ['flag', 'currency', 'language', 'population', 'area'] as const) {
        for (const closeness of [0, 1] as const) {
          expect(generateQuestion(world, c.id, type, rng, undefined, closeness), `${type} for ${c.name}`).not.toBeNull();
        }
      }
    }
  });

  it('skips types a country has no data for', () => {
    const rng = createRng(3);
    // Iceland has no land borders.
    expect(generateQuestion(world, 'ISL', 'border', rng)).toBeNull();
    expect(generateQuestion(world, 'ISL', 'notBorder', rng)).toBeNull();
    // Portugal borders only Spain: fine for "borders", not enough for "does NOT border".
    expect(generateQuestion(world, 'PRT', 'border', rng)).not.toBeNull();
    expect(generateQuestion(world, 'PRT', 'notBorder', rng)).toBeNull();
    // No brands on file for Palau; Kosovo has no country code domain.
    expect(generateQuestion(world, id('Palau'), 'brand', rng)).toBeNull();
    expect(generateQuestion(world, id('Kosovo'), 'domain', rng)).toBeNull();
    for (let i = 0; i < 200; i++) {
      const q = pickQuestion(world, 'ISL', rng)!;
      expect(['border', 'notBorder']).not.toContain(q.type);
    }
  });

  it('closeness 1 draws wrong options from the same region; closeness 0 avoids the subregion', () => {
    const rng = createRng(11);
    const germany = world.byId.DEU;
    const capitalOf = new Map(ALL.map((c) => [c.capital, c]));
    for (let i = 0; i < 30; i++) {
      const close = generateQuestion(world, 'DEU', 'capital', rng, undefined, 1)!;
      const far = generateQuestion(world, 'DEU', 'capital', rng, undefined, 0)!;
      for (const [index, option] of close.options.entries()) {
        if (index !== close.correctIndex) expect(capitalOf.get(option.label)!.subregion).toBe(germany.subregion);
      }
      for (const [index, option] of far.options.entries()) {
        if (index !== far.correctIndex) expect(capitalOf.get(option.label)!.subregion).not.toBe(germany.subregion);
      }
      const borderFar = generateQuestion(world, 'DEU', 'border', rng, undefined, 0)!;
      for (const [index, option] of borderFar.options.entries()) {
        if (index !== borderFar.correctIndex) expect(byName.get(option.label)!.subregion).not.toBe(germany.subregion);
      }
      const oddOneOut = generateQuestion(world, 'DEU', 'notBorder', rng, undefined, 0)!;
      expect(byName.get(oddOneOut.options[oddOneOut.correctIndex].label)!.subregion).not.toBe(germany.subregion);
    }
  });

  it('widens the pool rather than repeating an option when the region is too small', () => {
    const rng = createRng(5);
    // Almost all of Western Europe uses the Euro, so currency distractors must come from further afield.
    for (let i = 0; i < 30; i++) checkWellFormed(generateQuestion(world, 'DEU', 'currency', rng)!);
  });

  it('respects the exclusion set', () => {
    const rng = createRng(13);
    expect(generateQuestion(world, 'FRA', 'capital', rng, new Set(['capital:FRA']))).toBeNull();
    const france = world.byId.FRA;
    const asked = new Set<string>();
    // Border questions come in a limited number of variants, never repeat one, and then run out.
    for (let i = 0; i < 400; i++) {
      const q = generateQuestion(world, 'FRA', 'border', rng, asked);
      if (!q) break;
      expect(asked.has(q.sig)).toBe(false);
      asked.add(q.sig);
    }
    expect(asked.size).toBeGreaterThan(france.borders.length);
    expect(asked.size).toBeLessThan(400);
    for (const neighbour of france.borders) expect(asked).toContain(`border:FRA:${neighbour}`);
    expect(generateQuestion(world, 'FRA', 'border', rng, asked)).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    expect(pickQuestion(world, 'BRA', createRng(123))).toEqual(pickQuestion(world, 'BRA', createRng(123)));
  });

  it('never asks which continent a country is on', () => {
    const rng = createRng(77);
    expect(QUESTION_TYPES).not.toContain('continent');
    for (const c of ALL) {
      for (let i = 0; i < 8; i++) {
        const q = pickQuestion(world, c.id, rng)!;
        // (A curated fact may mention continents: Istanbul famously lies on two.)
        if (q.type !== 'fact') expect(q.prompt).not.toMatch(/continent/i);
        expect(q.prompt).not.toMatch(/(which|what) continent/i);
      }
    }
  });

  it('population ranges cover every country', () => {
    for (const c of ALL as Country[]) {
      const bucket = populationBucket(c.population);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(c.population).toBeLessThan(POPULATION_BUCKETS[bucket].max);
      if (bucket > 0) expect(c.population).toBeGreaterThanOrEqual(POPULATION_BUCKETS[bucket - 1].max);
    }
  });
});

describe('flags', () => {
  const flagOptions = (q: Question) => q.options.map((o) => byCca2.get(o.flag!)!);

  it('keeps identical and lookalike flags on separate lists', () => {
    expect(IDENTICAL_FLAGS).toContainEqual(['ROU', 'TCD']);
    expect(IDENTICAL_FLAGS).toContainEqual(['IDN', 'MCO']);
    expect(flagsIdentical(world.byId.ROU, world.byId.TCD)).toBe(true);
    expect(flagsLookAlike(world.byId.ROU, world.byId.TCD)).toBe(false);
    expect(flagsLookAlike(world.byId.IRL, world.byId.CIV)).toBe(true);
    expect(flagsLookAlike(world.byId.NLD, world.byId.LUX)).toBe(true);
    expect(flagsIdentical(world.byId.NLD, world.byId.LUX)).toBe(false);
    // Two territories that fly the very same flag file count as identical too.
    expect(flagsIdentical(world.byId.FRA, world.byId.MAF)).toBe(true);
    for (const group of [...IDENTICAL_FLAGS, ...LOOKALIKE_FLAGS]) for (const code of group) expect(world.byId[code], code).toBeDefined();
  });

  it('never offers identical flags together, at either closeness', () => {
    const rng = createRng(9);
    for (const c of ALL) {
      for (const closeness of [0, 1] as const) {
        for (let i = 0; i < 6; i++) {
          const options = flagOptions(generateQuestion(world, c.id, 'flag', rng, undefined, closeness)!);
          for (const a of options) for (const b of options) if (a !== b) expect(flagsIdentical(a, b), `${a.name} / ${b.name}`).toBe(false);
        }
      }
    }
  });

  it('offers lookalike flags only when closeness is 1, and then prefers them', () => {
    const rng = createRng(10);
    for (const c of ALL) {
      const lookalikes = ALL.filter((o) => flagsLookAlike(o, c));
      for (let i = 0; i < 6; i++) {
        const far = flagOptions(generateQuestion(world, c.id, 'flag', rng, undefined, 0)!);
        expect(far.filter((o) => flagsLookAlike(o, c)), `${c.name} at closeness 0`).toEqual([]);
        const close = flagOptions(generateQuestion(world, c.id, 'flag', rng, undefined, 1)!);
        const used = close.filter((o) => flagsLookAlike(o, c)).length;
        // Every available lookalike is used, up to the three wrong slots (identical twins share one slot).
        const distinct = new Set(lookalikes.map((o) => IDENTICAL_FLAGS.find((g) => g.includes(o.id))?.[0] ?? o.id)).size;
        expect(used, `${c.name} at closeness 1`).toBe(Math.min(3, distinct));
      }
    }
    const ireland = flagOptions(generateQuestion(world, 'IRL', 'flag', rng, undefined, 1)!).map((o) => o.id);
    expect(ireland).toEqual(expect.arrayContaining(['CIV', 'ITA']));
  });

  it('opening flags use close-call options about half the time', () => {
    expect(FLAG_CLOSE_CHANCE).toBe(0.5);
    const rng = createRng(4);
    let close = 0;
    for (let i = 0; i < 400; i++) close += nextBattleQuestion(world, 'IRL', [], rng).closeness;
    expect(close).toBeGreaterThan(160);
    expect(close).toBeLessThan(240);
  });
});

describe('currency, domain and brand questions', () => {
  it('names currencies by their kind only, without the country', () => {
    expect(currencyUnit('Serbian Dinar')).toBe('Dinar');
    expect(currencyUnit('United States Dollar')).toBe('Dollar');
    expect(currencyUnit('Euro')).toBe('Euro');
    expect(currencyUnit('West African CFA Franc')).toBe('Franc');
    expect(currencyUnit('Venezuelan Bolívar Soberano')).toBe('Bolívar');
    const rng = createRng(31);
    for (const c of ALL) {
      const q = generateQuestion(world, c.id, 'currency', rng, undefined, c.id.charCodeAt(0) % 2 ? 1 : 0)!;
      for (const option of q.options) expect(option.label, q.prompt).not.toMatch(/\s/);
      expect(new Set(q.options.map((o) => currencyFamily(o.label))).size, q.options.map((o) => o.label).join(' | ')).toBe(4);
    }
    const serbia = generateQuestion(world, 'SRB', 'currency', rng)!;
    expect(serbia.options[serbia.correctIndex].label).toBe('Dinar');
    expect(currencyFamily('Krona')).toBe(currencyFamily('Krone'));
  });

  it('asks for the internet domain, with guessable fakes when close and unrelated real ones when far', () => {
    const rng = createRng(41);
    const real = new Set(ALL.map((c) => c.tld));
    for (let i = 0; i < 40; i++) {
      const close = generateQuestion(world, 'CHE', 'domain', rng, undefined, 1)!;
      expect(close.prompt).toBe('What is the internet domain of Switzerland?');
      expect(close.options[close.correctIndex].label).toBe('.ch');
      for (const o of close.options) expect(o.label).toMatch(/^\.[a-z]{2}$/);
      // Close calls start with the same letter as the country or its real domain.
      const wrong = close.options.filter((_, index) => index !== close.correctIndex);
      expect(wrong.filter((o) => 'sc'.includes(o.label[1])).length).toBeGreaterThanOrEqual(2);
      const far = generateQuestion(world, 'CHE', 'domain', rng, undefined, 0)!;
      for (const [index, o] of far.options.entries()) {
        if (index === far.correctIndex) continue;
        expect(real.has(o.label)).toBe(true);
        expect(o.label[1]).not.toBe('c');
      }
    }
    expect(questionScore('domain', 0, 0)).toBe(2);
  });

  it('asks which company was founded in the country, one wrong brand per other country', () => {
    const rng = createRng(42);
    for (let i = 0; i < 40; i++) {
      const q = generateQuestion(world, 'SWE', 'brand', rng, undefined, 1)!;
      expect(q.prompt).toBe('Which company was founded in Sweden?');
      expect(BRANDS.SWE).toContain(q.options[q.correctIndex].label);
      const homes = q.options.map((o) => brandHome.get(o.label));
      expect(new Set(homes).size).toBe(4);
      // Close calls come from the rest of Europe.
      for (const home of homes) expect(world.byId[home!].continent).toBe('Europe');
    }
    const far = generateQuestion(world, 'SWE', 'brand', rng, undefined, 0)!;
    for (const [index, o] of far.options.entries()) {
      if (index !== far.correctIndex) expect(world.byId[brandHome.get(o.label)!].subregion).not.toBe('Northern Europe');
    }
  });

  it('brand data is sound: real countries, no duplicates, no name that gives the country away', () => {
    const seen = new Set<string>();
    for (const [code, brands] of Object.entries(BRANDS)) {
      const country = world.byId[code];
      expect(country, code).toBeDefined();
      expect(brands.length).toBeGreaterThan(0);
      for (const brand of brands) {
        expect(seen.has(brand), `${brand} listed twice`).toBe(false);
        seen.add(brand);
        expect(brand.toLowerCase()).not.toContain(country.name.toLowerCase());
      }
    }
    expect(Object.keys(BRANDS).length).toBeGreaterThanOrEqual(40);
  });
});

describe('filling difficulty slots', () => {
  it('returns the target tier whenever the country can reach it', () => {
    const rng = createRng(55);
    for (const c of ALL) {
      const reachable = new Set(combinations(c).map((combo) => combo.tier));
      for (const target of ['easy', 'medium', 'hard'] as Difficulty[]) {
        const q = pickForTier(world, c.id, target, rng)!;
        expect(q, `${c.name} ${target}`).not.toBeNull();
        if (reachable.has(target) && target !== 'hard') expect(q.difficulty, `${c.name} ${target}`).toBe(target);
        // Hard needs a type the country has data for; when it has none, the nearest tier steps in.
        if (!reachable.has(target)) expect(q.difficulty).toBe(tierOrder(target).find((t) => reachable.has(t)));
      }
    }
  });

  it('a battle opens with the flag, then follows Easy, Medium, Medium, then mostly Hard, as far as the country allows', () => {
    const rank = { easy: 0, medium: 1, hard: 2 } as const;
    const rng = createRng(61);
    // Romania is mid-known with five neighbours: it can reach every tier.
    for (let run = 0; run < 20; run++) {
      const asked: string[] = [];
      const tiers: Difficulty[] = [];
      for (let i = 0; i < 12; i++) {
        const q = nextBattleQuestion(world, 'ROU', asked, rng);
        if (i === 0) expect(q.type).toBe('flag');
        asked.push(q.sig);
        tiers.push(q.difficulty);
      }
      expect(tiers[1]).toBe('easy');
      expect(tiers[2]).toBe('medium');
      expect(tiers[3]).toBe('medium');
      expect(Math.min(...tiers.slice(4).map((t) => rank[t]))).toBeGreaterThanOrEqual(1);
    }
    // France is famous: its Hard slots fall back to Medium. Palau is obscure: its Easy slot rises to Medium.
    const tiersFor = (code: string) => {
      const asked: string[] = [];
      return Array.from({ length: 10 }, () => {
        const q = nextBattleQuestion(world, code, asked, rng);
        asked.push(q.sig);
        return q.difficulty;
      });
    };
    expect(tiersFor('FRA')).not.toContain('hard');
    expect(tiersFor(id('Palau'))).not.toContain('easy');
  });

  it('every country can fill every slot of a long battle without errors or repeats', () => {
    const rng = createRng(99);
    for (const c of ALL) {
      const asked: string[] = [];
      for (let i = 0; i < 60; i++) {
        const q = nextBattleQuestion(world, c.id, asked, rng);
        expect(asked, `${c.name} repeated ${q.sig} at question ${i + 1}`).not.toContain(q.sig);
        expect(q.countryId).toBe(c.id);
        if (i === 0) expect(q.type).toBe('flag');
        checkWellFormed(q);
        asked.push(q.sig);
      }
    }
  });
});

describe('opening recruit phase', () => {
  it('opens with the starting country\'s flag, follows the ramp and never repeats a question or a type', () => {
    expect(RECRUIT_RAMP).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
    const rng = createRng(44);
    for (const c of ALL) {
      const asked: string[] = [];
      for (let i = 0; i < 5; i++) {
        const q = nextRecruitQuestion(world, c.id, asked, rng);
        expect(q.countryId).toBe(c.id);
        if (i === 0) expect(q.sig).toBe(`flag:${c.id}`);
        expect(asked, `${c.name} repeated ${q.sig}`).not.toContain(q.sig);
        checkWellFormed(q);
        asked.push(q.sig);
      }
      expect(new Set(asked.map(sigType)).size, `${c.name}: ${asked.join(' ')}`).toBe(5);
    }
  });
});

describe('variety', () => {
  const ask = (code: string, type: 'border' | 'area' | 'population' | 'notBorder', seed: number, known: string[] = [], exclude: string[] = []) =>
    generateQuestion(world, code, type, createRng(seed), new Set(exclude), 1, new Set(known));
  const names = (q: Question) => q.options.map((o) => o.label);

  it('reads the form of a question from its signature', () => {
    expect(sigType('area:closest:DEU:AUT,BEL,CHE,NLD')).toBe('area');
    expect(sigKind('area:closest:DEU:AUT,BEL,CHE,NLD')).toBe('area:closest');
    expect(sigKind('border:DEU:POL')).toBe('border');
    expect(sigKind('border:both:DEU:FRA:CHE')).toBe('border:both');
    expect(sigKind('capital:DEU')).toBe('capital');
    for (const f of FACTS) expect(sigKind(`fact:${f.id}`), f.id).toBe('fact');
  });

  it('asks about size in five forms, including which of four is the biggest, with the country in the line-up', () => {
    const seen = new Map<string, Question>();
    for (let seed = 0; seed < 200; seed++) {
      const q = ask('DEU', 'area', seed)!;
      checkWellFormed(q);
      seen.set(sigKind(q.sig), q);
    }
    expect([...seen.keys()].sort()).toEqual(['area:biggest', 'area:closest', 'area:larger', 'area:smaller', 'area:smallest']);
    expect(seen.get('area:biggest')!.prompt).toBe('Which of these is the biggest by area?');
    expect(names(seen.get('area:biggest')!)).toContain('Germany');
    // Across many line-ups the country is sometimes the answer and sometimes not.
    const answers = new Set<boolean>();
    for (let seed = 0; seed < 300; seed++) {
      const q = ask('DEU', 'area', seed)!;
      if (isLineUp(q)) answers.add(q.options[q.correctIndex].label === 'Germany');
    }
    expect([...answers].sort()).toEqual([false, true]);
  });

  it('asks about population as a range or as a line-up of four', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const q = ask('BRA', 'population', seed)!;
      checkWellFormed(q);
      kinds.add(sigKind(q.sig));
    }
    expect([...kinds].sort()).toEqual(['population', 'population:fewest', 'population:most']);
  });

  it('takes the forms of a type in turn: the one asked least comes first', () => {
    for (let seed = 0; seed < 60; seed++) {
      const asked: string[] = [];
      for (let i = 0; i < 5; i++) asked.push(ask('DEU', 'area', seed * 7 + i, [], asked)!.sig);
      // Five size questions in a row use all five forms: "closest in size" comes up once, not again and again.
      expect(new Set(asked.map(sigKind)).size, asked.join(' ')).toBe(5);
    }
  });

  it('asks about borders in four forms', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      for (const code of ['DEU', 'FRA', 'ZMB']) {
        const q = ask(code, 'border', seed)!;
        checkWellFormed(q);
        kinds.add(sigKind(q.sig));
      }
    }
    expect([...kinds].sort()).toEqual(['border', 'border:both', 'border:direction', 'border:landlocked']);
  });

  it('"borders both" names a second country and the answer touches the two of them', () => {
    let found = 0;
    for (let seed = 0; seed < 400 && found < 40; seed++) {
      const q = ask('DEU', 'border', seed, ['FRA'])!;
      if (sigKind(q.sig) !== 'border:both') continue;
      found++;
      // The second country is one the player holds when there is one: their own map becomes the clue.
      expect(q.prompt).toBe('Which country borders both Germany and France?');
      expect(['Belgium', 'Luxembourg', 'Switzerland']).toContain(q.options[q.correctIndex].label);
      expect(names(q)).not.toContain('France');
    }
    expect(found).toBeGreaterThan(10);
  });

  it('"borders to the east" is only asked where the side is clear, and no wrong option is a neighbour on that side', () => {
    const rng = createRng(12);
    const seen = new Map<string, string>();
    for (const c of ALL) {
      for (let i = 0; i < 12; i++) {
        const q = generateQuestion(world, c.id, 'border', rng, undefined, i % 2 ? 1 : 0);
        if (!q || sigKind(q.sig) !== 'border:direction') continue;
        const [, , , side, answerId] = q.sig.split(':');
        expect(q.prompt).toBe(`Which country borders ${countryPhrase(c)} to the ${side}?`);
        const answer = world.byId[answerId];
        expect(bearingGap(bearing(c, answer), COMPASS[side]), q.sig).toBeLessThanOrEqual(DIRECTION_CLEAR);
        // Not a microstate or an enclave.
        expect(answer.area, q.sig).toBeGreaterThanOrEqual(2000);
        for (const [index, option] of q.options.entries()) {
          const o = byName.get(option.label)!;
          if (index !== q.correctIndex && c.borders.includes(o.id)) expect(bearingGap(bearing(c, o), COMPASS[side]), `${q.sig}: ${o.name}`).toBeGreaterThanOrEqual(DIRECTION_ELSEWHERE);
        }
        seen.set(`${c.name} ${side}`, answer.name);
      }
    }
    expect(seen.size).toBeGreaterThan(60);
    // A few every player would agree with.
    const sides = (name: string, side: string) => {
      const out = new Set<string>();
      for (let seed = 0; seed < 600; seed++) {
        const q = ask(id(name), 'border', seed)!;
        if (q.sig.startsWith(`border:direction:${id(name)}:${side}:`)) out.add(q.options[q.correctIndex].label);
      }
      return [...out].sort();
    };
    // (Czechia's centre lies east-south-east of Germany's, within the margin.)
    expect(sides('Germany', 'east')).toEqual(['Czechia', 'Poland']);
    expect(sides('Germany', 'north')).toEqual(['Denmark']);
    expect(sides('United States', 'north')).toEqual(['Canada']);
    expect(sides('United States', 'south')).toEqual(['Mexico']);
    expect(sides('Spain', 'west')).toEqual(['Portugal']);
  });

  it('"which neighbour is landlocked" offers four real neighbours, exactly one of the kind asked for', () => {
    let found = 0;
    for (const c of ALL) {
      for (let seed = 0; seed < 12; seed++) {
        const q = ask(c.id, 'border', seed);
        if (!q || sigKind(q.sig) !== 'border:landlocked') continue;
        found++;
        const wanted = q.sig.split(':')[3] === 'is';
        expect(q.prompt).toBe(`Which of these neighbours of ${countryPhrase(c)} is ${wanted ? '' : 'not '}landlocked?`);
        const options = q.options.map((o) => byName.get(o.label)!);
        for (const o of options) expect(c.borders, q.sig).toContain(o.id);
        expect(options.filter((o) => o.landlocked === wanted), q.sig).toHaveLength(1);
      }
    }
    expect(found).toBeGreaterThan(40);
  });

  it('a country the player holds is never the answer to a border question', () => {
    const rng = createRng(31);
    for (const c of ALL.filter((x) => x.borders.length >= 2)) {
      const held = c.borders.slice(0, Math.ceil(c.borders.length / 2));
      const known = new Set(held);
      for (let i = 0; i < 12; i++) {
        const q = generateQuestion(world, c.id, 'border', rng, undefined, i % 2 ? 1 : 0, known);
        if (!q) continue;
        checkWellFormed(q);
        const answer = byName.get(q.options[q.correctIndex].label)!;
        if (sigKind(q.sig) !== 'border:landlocked') expect(held, `${q.sig}`).not.toContain(answer.id);
      }
    }
    // With every neighbour held there is nothing left to ask about who borders it.
    const all = new Set(world.byId.PRT.borders);
    for (let seed = 0; seed < 30; seed++) expect(generateQuestion(world, 'PRT', 'border', createRng(seed), undefined, 1, all)).toBeNull();
  });

  it('"does not border" shows at most one neighbour the player holds', () => {
    const rng = createRng(8);
    for (const c of ALL.filter((x) => x.borders.length >= 4)) {
      const held = c.borders.slice(0, c.borders.length - 2);
      for (let i = 0; i < 6; i++) {
        const q = generateQuestion(world, c.id, 'notBorder', rng, undefined, 1, new Set(held));
        if (!q) continue;
        checkWellFormed(q);
        expect(q.options.filter((o) => held.includes(byName.get(o.label)!.id)).length, q.sig).toBeLessThanOrEqual(1);
      }
    }
    // Fewer than two neighbours the player does not hold: the question is skipped.
    const fra = world.byId.FRA;
    expect(generateQuestion(world, 'FRA', 'notBorder', rng, undefined, 1, new Set(fra.borders.slice(1)))).toBeNull();
  });

  it('a battle does not ask the same type twice while another type is still unused', () => {
    const rng = createRng(73);
    for (const c of ALL) {
      // Every type this country can be asked at all.
      const available = new Set(QUESTION_TYPES.filter((type) => [0, 1].some((closeness) => generateQuestion(world, c.id, type, rng, undefined, closeness as Closeness))));
      const asked: string[] = [];
      const types: string[] = [];
      for (let i = 0; i < available.size; i++) {
        const q = nextBattleQuestion(world, c.id, asked, rng);
        asked.push(q.sig);
        types.push(q.type);
      }
      expect(new Set(types).size, `${c.name}: ${types.join(' ')}`).toBe(available.size);
    }
  });

  it('"closest in size" comes up at most once in the first dozen questions of a battle', () => {
    const rng = createRng(19);
    for (const c of ALL.filter((x) => x.fame < 2).slice(0, 80)) {
      const asked: string[] = [];
      for (let i = 0; i < 12; i++) asked.push(nextBattleQuestion(world, c.id, asked, rng).sig);
      expect(asked.filter((sig) => sigKind(sig) === 'area:closest').length, `${c.name}: ${asked.join(' ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('a battle steers clear of questions asked earlier in the game', () => {
    const rng = createRng(5);
    for (const code of ['DEU', 'BRA', 'KEN', 'THA']) {
      const first: string[] = [];
      for (let i = 0; i < 8; i++) first.push(nextBattleQuestion(world, code, first, rng).sig);
      // A second attack on the same country (after a retreat, say) opens with the flag again, then asks new things.
      const second: string[] = [];
      for (let i = 0; i < 8; i++) second.push(nextBattleQuestion(world, code, second, rng, { recent: first }).sig);
      expect(second[0]).toBe(`flag:${code}`);
      expect(second.slice(1).filter((sig) => first.includes(sig)), code).toEqual([]);
    }
  });
});

describe('reason-it-out questions', () => {
  const rng = createRng(71);
  const options = (q: Question) => q.options.map((o) => o.label);

  it('names the country properly inside a sentence', () => {
    expect(countryPhrase(world.byId.NLD)).toBe('the Netherlands');
    expect(countryPhrase(world.byId.FRA)).toBe('France');
    expect(generateQuestion(world, 'USA', 'capital', rng)!.prompt).toBe('What is the capital of the United States?');
  });

  it('never uses an answer that names the country', () => {
    expect(givesAway('Niger River', world.byId.NER)).toBe(true);
    expect(givesAway('Niger River', world.byId.NGA)).toBe(true);
    expect(givesAway('Indian Ocean', world.byId.IND)).toBe(true);
    expect(givesAway('Gulf of Mexico', world.byId.MEX)).toBe(true);
    expect(givesAway('Sea of Japan', world.byId.JPN)).toBe(true);
    expect(givesAway('Gulf of Guinea', world.byId.GNQ)).toBe(true);
    expect(givesAway('Sahara', world.byId.ESH)).toBe(true);
    expect(givesAway('Indian Ocean', world.byId.KEN)).toBe(false);
    expect(givesAway('Atlantic Ocean', world.byId.ZAF)).toBe(false);
    expect(givesAway('Niger River', world.byId.MLI)).toBe(false);
    for (let i = 0; i < 40; i++) {
      expect(generateQuestion(world, 'IND', 'water', rng)!.options.map((o) => o.label)[0]).toBeDefined();
      const india = generateQuestion(world, 'IND', 'water', rng)!;
      expect(india.options[india.correctIndex].label).not.toBe('Indian Ocean');
      const niger = generateQuestion(world, 'NER', 'feature', rng)!;
      expect(niger.options[niger.correctIndex].label).not.toBe('Niger River');
    }
  });

  it('asks coastal countries which sea or ocean they border, and never offers one they touch', () => {
    const croatia = generateQuestion(world, 'HRV', 'water', rng, undefined, 1)!;
    expect(croatia.prompt).toBe('Which sea or ocean does Croatia border?');
    expect(['Adriatic Sea', 'Mediterranean Sea']).toContain(croatia.options[croatia.correctIndex].label);
    expect(croatia).toMatchObject({ score: 1 + world.byId.HRV.fame + 1, closeness: 1 });
    let asked = 0;
    for (const c of ALL) {
      for (const closeness of [0, 1] as const) {
        const q = generateQuestion(world, c.id, 'water', rng, undefined, closeness);
        if (c.landlocked) expect(q, c.name).toBeNull();
        if (!q) continue;
        asked++;
        for (const [index, label] of options(q).entries()) {
          if (index === q.correctIndex) expect(c.waters).toContain(label);
          else {
            expect(c.waters, `${c.name}: ${label}`).not.toContain(label);
            expect(c.watersAvoid, `${c.name}: ${label}`).not.toContain(label);
          }
        }
      }
    }
    expect(asked).toBeGreaterThan(300);
    // Close options are seas of the same part of the world; far ones are not.
    const near = generateQuestion(world, 'HRV', 'water', rng, undefined, 1)!;
    for (const [index, label] of options(near).entries()) if (index !== near.correctIndex) expect(world.waters.get(label)!.has('Europe')).toBe(true);
  });

  it('asks about a great river, desert, range or rainforest only where the country has one', () => {
    expect(generateQuestion(world, 'EGY', 'feature', rng)!.prompt).toMatch(/^Which (river flows through|desert lies in) Egypt\?$/);
    expect(generateQuestion(world, 'LAO', 'feature', rng)!).toMatchObject({ prompt: 'Which river flows through Laos?' });
    expect(generateQuestion(world, 'COM', 'feature', rng)).toBeNull();
    expect(generateQuestion(world, 'ISL', 'feature', rng)).toBeNull();
    for (const c of ALL) {
      for (const closeness of [0, 1] as const) {
        const q = generateQuestion(world, c.id, 'feature', rng, undefined, closeness);
        if (c.features.length === 0) expect(q, c.name).toBeNull();
        if (!q) continue;
        const answer = c.features.find((f) => f.name === q.options[q.correctIndex].label)!;
        expect(answer).toBeDefined();
        for (const [index, label] of options(q).entries()) {
          // Every option is the same kind of feature as the answer.
          expect(world.features.get(label)!.kind).toBe(answer.kind);
          if (index !== q.correctIndex) {
            expect(c.features.map((f) => f.name)).not.toContain(label);
            expect(c.featuresAvoid, `${c.name}: ${label}`).not.toContain(label);
          }
        }
      }
    }
  });

  it('asks which line on the globe crosses a country, with "none" as an option', () => {
    const kenya = generateQuestion(world, 'KEN', 'lines', rng)!;
    expect(kenya.prompt).toBe('Which of these lines on the globe passes through Kenya?');
    expect(options(kenya)[kenya.correctIndex]).toBe('Equator');
    expect(options(kenya)[3]).toBe(NO_LINE);
    expect(kenya).toMatchObject({ closeness: 0, score: 2 + world.byId.KEN.fame });
    expect(world.byId.GBR.lines).toEqual(['Prime Meridian']);
    expect(world.byId.BRA.lines).toEqual(['Equator', 'Tropic of Capricorn']);
    expect(world.byId.DEU.lines).toEqual([]);
    expect(generateQuestion(world, 'DEU', 'lines', rng)).toBeNull();
    for (const c of ALL) {
      for (const line of [...c.lines, ...c.linesAvoid]) expect(GLOBE_LINES).toContain(line);
      const q = generateQuestion(world, c.id, 'lines', rng);
      if (!q) continue;
      for (const [index, label] of options(q).entries()) {
        if (index === q.correctIndex) expect(c.lines).toContain(label);
        else if (label !== NO_LINE) expect([...c.lines, ...c.linesAvoid], `${c.name}: ${label}`).not.toContain(label);
      }
    }
  });

  it('gives less familiar countries more reason-out questions: about 60% for obscure, 40% for mid-known, no bias for famous', () => {
    expect(REASON_OUT_SHARE).toEqual({ 0: null, 1: 0.4, 2: 0.6 });
    expect(REASON_OUT_TYPES).toEqual(['water', 'feature', 'lines', 'border', 'language']);
    const share = (ids: string[], seed: number) => {
      const r = createRng(seed);
      let reason = 0;
      let total = 0;
      for (const id of ids) {
        for (let run = 0; run < 30; run++) {
          const asked: string[] = [];
          // The Easy, Medium and Medium slots after the flag: tiers where both kinds of question exist.
          for (let i = 0; i < 4; i++) {
            const q = nextBattleQuestion(world, id, asked, r);
            asked.push(q.sig);
            if (i === 0) continue;
            total++;
            if (REASON_OUT_TYPES.includes(q.type)) reason++;
          }
        }
      }
      return reason / total;
    };
    // Countries with a coast, borders and a feature, so reason-out types are available in every tier.
    const obscure = ALL.filter((c) => c.fame === 2 && c.waters.length > 0 && c.borders.length >= 3).map((c) => c.id);
    const midKnown = ALL.filter((c) => c.fame === 1 && c.waters.length > 0 && c.borders.length >= 3).map((c) => c.id);
    expect(obscure.length).toBeGreaterThan(10);
    expect(share(obscure, 1)).toBeGreaterThan(0.52);
    expect(share(obscure, 1)).toBeLessThan(0.68);
    expect(share(midKnown, 2)).toBeGreaterThan(0.32);
    expect(share(midKnown, 2)).toBeLessThan(0.48);
  });
});

describe('curated facts and hooks', () => {
  const rng = createRng(81);
  const ids = new Set(ALL.map((c) => c.id));

  it('every fact has a valid shape', () => {
    const seen = new Set<string>();
    for (const f of FACTS as Fact[]) {
      expect(typeof f.id).toBe('string');
      expect(seen.has(f.id), `duplicate id ${f.id}`).toBe(false);
      seen.add(f.id);
      expect(ids.has(f.country), `${f.id}: unknown country`).toBe(true);
      expect(FACT_CATEGORIES, f.id).toContain(f.category);
      expect([1, 2, 3], f.id).toContain(f.recognition);
      expect(f.kind.length, f.id).toBeGreaterThan(0);
      expect(f.answer.trim().length, f.id).toBeGreaterThan(0);
      expect(f.prompt.endsWith('?'), `${f.id}: ${f.prompt}`).toBe(true);
      // The country is given in the question, and the answer is never its name.
      const country = world.byId[f.country];
      expect(f.prompt, f.id).toContain(country.name.split(/,| and /)[0]);
      expect(f.answer, f.id).not.toBe(country.name);
      for (const code of f.sharedWith ?? []) expect(ids.has(code), `${f.id}: sharedWith ${code}`).toBe(true);
      if (f.kind === 'custom') {
        expect(f.wrong, `${f.id}: a one-off fact needs its own wrong options`).toHaveLength(3);
        expect(new Set([f.answer, ...f.wrong!]).size, f.id).toBe(4);
      }
      for (const key of Object.keys(f)) {
        expect(['id', 'country', 'category', 'kind', 'prompt', 'answer', 'recognition', 'hook', 'wrong', 'sharedWith', 'group', 'unsure'], `${f.id}: ${key}`).toContain(key);
      }
    }
    expect(FACTS.length).toBeGreaterThan(600);
  });

  it('every country has at least one hook it can actually be asked', () => {
    const missing = ALL.filter(
      (c) => !(world.factsByCountry[c.id] ?? []).some((f) => f.hook && f.recognition >= FACT_MIN_RECOGNITION && !givesAway(f.answer, c)),
    );
    expect(missing.map((c) => c.name)).toEqual([]);
  });

  it('no hook is wasted: none has an answer that names its own country', () => {
    for (const f of FACTS) if (f.hook) expect(givesAway(f.answer, world.byId[f.country]), f.id).toBe(false);
  });

  it('asks hooks about the given country, with sensible wrong options', () => {
    const tunisia = new Map<string, Question>();
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion(world, 'TUN', 'fact', rng)!;
      tunisia.set(q.sig, q);
    }
    const carthage = tunisia.get('fact:TUN-carthage')!;
    expect(carthage.prompt).toBe("Which ancient city's ruins are in Tunisia?");
    expect(carthage.options[carthage.correctIndex].label).toBe('Carthage');
    const starWars = tunisia.get('fact:TUN-star-wars')!;
    expect(starWars.prompt).toBe('Which film series shot its desert planet scenes in Tunisia?');
    expect(starWars.options.map((o) => o.label).sort()).toEqual(['Dune', 'Mad Max', 'Star Trek', 'Star Wars']);
    expect(tunisia.has('fact:TUN-the-arab-spring')).toBe(true);
    expect(carthage).toMatchObject({ type: 'fact', closeness: 0, score: 2 + world.byId.TUN.fame });
  });

  it('never asks a fact below the recognition threshold', () => {
    expect(FACT_MIN_RECOGNITION).toBe(2);
    const byId = new Map(FACTS.map((f) => [`fact:${f.id}`, f]));
    let asked = 0;
    for (const c of ALL) {
      const own = world.factsByCountry[c.id] ?? [];
      const askable = own.filter((f) => f.recognition >= 2 && !givesAway(f.answer, c));
      for (let i = 0; i < 12; i++) {
        const q = generateQuestion(world, c.id, 'fact', rng);
        if (askable.length === 0) expect(q, c.name).toBeNull();
        if (!q) continue;
        asked++;
        expect(byId.get(q.sig)!.recognition, q.sig).toBeGreaterThanOrEqual(2);
        expect(byId.get(q.sig)!.country).toBe(c.id);
      }
    }
    expect(asked).toBeGreaterThan(2000);
    // A recognition-1 fact exists in the data but is never the question…
    const obscureFact = FACTS.find((f) => f.recognition === 1)!;
    const excludeOthers = new Set((world.factsByCountry[obscureFact.country] ?? []).filter((f) => f.recognition >= 2).map((f) => `fact:${f.id}`));
    expect(generateQuestion(world, obscureFact.country, 'fact', rng, excludeOthers)).toBeNull();
  });

  it('no wrong option is also true for the country, including shared rivers, peaks and dishes', () => {
    for (const c of ALL) {
      const own = new Set((world.factsByCountry[c.id] ?? []).map((f) => f.answer));
      for (let i = 0; i < 15; i++) {
        const q = generateQuestion(world, c.id, 'fact', rng);
        if (!q) break;
        for (const [index, option] of q.options.entries()) {
          if (index === q.correctIndex) continue;
          expect(own.has(option.label), `${q.sig}: ${option.label}`).toBe(false);
          expect(FACTS.some((f) => f.answer === option.label && f.sharedWith?.includes(c.id)), `${q.sig}: ${option.label} is shared`).toBe(false);
        }
      }
    }
    // Mount Everest is shared with China, so it is never a wrong "highest mountain" for anyone it belongs to;
    // Mont Blanc is never offered as wrong for Italy.
    expect(FACTS.find((f) => f.answer === 'Mont Blanc')!.sharedWith).toContain('ITA');
    // Oil and gas are never set against each other as a biggest export.
    for (let i = 0; i < 60; i++) {
      const q = generateQuestion(world, 'SAU', 'fact', rng, new Set((world.factsByCountry.SAU ?? []).filter((f) => f.kind !== 'export').map((f) => `fact:${f.id}`)))!;
      expect(q.prompt).toBe("What is Saudi Arabia's biggest export?");
      expect(q.options.map((o) => o.label)).not.toContain('Natural gas');
      expect(q.options.map((o) => o.label)).not.toContain('Oil and gas');
    }
  });

  it('skips a category the country has nothing well known in', () => {
    // No footballer on file for Palau: it never gets a famous-person question.
    const palau = id('Palau');
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion(world, palau, 'fact', rng);
      if (q) expect(q.prompt).not.toMatch(/footballers|sports stars|musicians/);
    }
    const kinds = new Set((world.factsByCountry.HRV ?? []).map((f) => f.kind));
    expect(kinds.has('footballer')).toBe(true);
    const croatia = new Set<string>();
    for (let i = 0; i < 200; i++) croatia.add(generateQuestion(world, 'HRV', 'fact', rng)!.prompt);
    expect(croatia).toContain("Which of these footballers has played for Croatia's national team?");
  });
});
