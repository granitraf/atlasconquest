import { BRANDS } from './brands';
import type { Country, Difficulty, Fact, Question, QuestionOption, QuestionType } from './types';
import { pick, randInt, shuffle, type Rng } from './rng';
import { distanceKm, type World } from './world';

// ------------------------------------------------------------------ difficulty
//
// A question's difficulty is not fixed by its type. It is a score:
//
//   score = type weight + country fame + option closeness
//
// and the score sets the tier: 1-2 Easy, 3-4 Medium, 5-6 Hard.

/** How hard the kind of question is in itself. Add a new type here with its weight. */
export const TYPE_WEIGHT: Record<QuestionType, 1 | 2 | 3> = {
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
};

/** Types whose wrong options can be close calls or far-fetched. For the others closeness counts as 0. */
export const USES_CLOSENESS: Record<QuestionType, boolean> = {
  flag: true,
  capital: true,
  water: true,
  border: true,
  currency: true,
  language: true,
  domain: true,
  brand: true,
  feature: true,
  lines: false,
  fact: false,
  population: false,
  area: false,
  notBorder: true,
};

export const QUESTION_TYPES = Object.keys(TYPE_WEIGHT) as QuestionType[];

/**
 * 0: wrong options come from anywhere in the world except the country's own subregion.
 * 1: wrong options are close calls: same subregion first, lookalike flags, neighbours of neighbours.
 */
export type Closeness = 0 | 1;

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export function questionScore(type: QuestionType, fame: 0 | 1 | 2, closeness: Closeness): number {
  return TYPE_WEIGHT[type] + fame + (USES_CLOSENESS[type] ? closeness : 0);
}

export function tierOf(score: number): Difficulty {
  return score <= 2 ? 'easy' : score <= 4 ? 'medium' : 'hard';
}

/** Chance that an opening flag question uses close-call options (lookalike and regional flags). */
export const FLAG_CLOSE_CHANCE = 0.5;

/** A curated fact is only asked if it is at least this well known (3 worldwide, 2 well-read player, 1 local). */
export const FACT_MIN_RECOGNITION = 2;

/** Types a player can work out from the map and the region, rather than having to know cold. */
export const REASON_OUT_TYPES: QuestionType[] = ['water', 'feature', 'lines', 'border', 'language'];

/**
 * Share of non-flag questions that should come from reason-out types, by how
 * well known the country is (fame 0, 1, 2). null means no bias.
 */
export const REASON_OUT_SHARE: Record<0 | 1 | 2, number | null> = { 0: null, 1: 0.4, 2: 0.6 };

/** Lines on the globe a country can be asked about. */
export const GLOBE_LINES = ['Equator', 'Tropic of Cancer', 'Tropic of Capricorn', 'Arctic Circle', 'Prime Meridian'];
export const NO_LINE = 'None of these';

/** How often each tier comes up when no slot asks for a particular one. */
export const DEFAULT_WEIGHTS: Record<Difficulty, number> = { easy: 0.4, medium: 0.35, hard: 0.25 };

// ------------------------------------------------------------------------ flags

/** Flags that cannot be told apart. Never offered together, at any difficulty. */
export const IDENTICAL_FLAGS: string[][] = [
  ['IDN', 'MCO'],
  ['ROU', 'TCD'],
];

/**
 * Flags that are easy to confuse. Offered together only when closeness is 1,
 * where they are the preferred wrong options.
 */
export const LOOKALIKE_FLAGS: string[][] = [
  ['IRL', 'CIV', 'ITA'],
  ['ITA', 'MEX'],
  ['NLD', 'LUX', 'HRV', 'PRY'],
  ['IDN', 'MCO', 'POL'],
  ['ROU', 'TCD', 'AND', 'MDA'],
  ['AUS', 'NZL'],
  ['MLI', 'GIN', 'SEN', 'CMR'],
  ['COL', 'ECU', 'VEN'],
  ['SVN', 'SVK', 'RUS', 'SRB'],
  ['NOR', 'ISL'],
  ['BHR', 'QAT'],
  ['EGY', 'IRQ', 'SYR', 'YEM'],
  ['HND', 'SLV', 'NIC'],
  ['AUT', 'LVA'],
  ['IND', 'NER'],
  ['BEL', 'DEU'],
  ['THA', 'CRI'],
  ['TUR', 'TUN'],
  ['ARE', 'KWT', 'JOR', 'PSE', 'SDN'],
  ['USA', 'LBR', 'MYS'],
  ['CUB', 'PRI'],
  ['GHA', 'BOL'],
  ['LIE', 'HTI'],
];

const inSameGroup = (groups: string[][], a: string, b: string) => groups.some((g) => g.includes(a) && g.includes(b));

export function flagsIdentical(a: Country, b: Country): boolean {
  return a.flagKey === b.flagKey || inSameGroup(IDENTICAL_FLAGS, a.id, b.id);
}

export function flagsLookAlike(a: Country, b: Country): boolean {
  return !flagsIdentical(a, b) && inSameGroup(LOOKALIKE_FLAGS, a.id, b.id);
}

/** One key per distinguishable flag, so two identical flags never fill two option slots. */
function flagIdentity(c: Country): string {
  const group = IDENTICAL_FLAGS.findIndex((g) => g.includes(c.id));
  return group >= 0 ? `identical-${group}` : c.flagKey;
}

// ------------------------------------------------------------------- currencies

/** Currency names that do not end in their unit. */
const CURRENCY_UNIT_OVERRIDES: Record<string, string> = { 'Venezuelan Bolívar Soberano': 'Bolívar' };

/**
 * The kind of currency without the country in front of it:
 * "Serbian Dinar" -> "Dinar", "United States Dollar" -> "Dollar", "Euro" -> "Euro".
 */
export function currencyUnit(name: string): string {
  return CURRENCY_UNIT_OVERRIDES[name] ?? name.trim().split(/\s+/).pop() ?? name;
}

/** Units that are the same word in different spellings, or close enough to be an unfair trap side by side. */
const CURRENCY_FAMILIES: string[][] = [
  ['krone', 'krona', 'koruna'],
  ['rial', 'riyal', 'riel', 'real'],
  ['dinar', 'denar'],
  ['leu', 'lev', 'lek'],
  ['som', 'somoni'],
  ['rupee', 'rupiah', 'rufiyaa'],
  ['kwacha', 'kwanza'],
  ['lira', 'lari'],
  ['bolivar', 'boliviano'],
];

const plainLetters = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();

/** A key shared by lookalike units, so two of them are never offered in the same question. */
export function currencyFamily(unit: string): string {
  const plain = plainLetters(unit);
  return CURRENCY_FAMILIES.find((family) => family.includes(plain))?.[0] ?? plain;
}

// ------------------------------------------------------------------------ names

const NEEDS_ARTICLE = new Set([
  'United States',
  'United Kingdom',
  'United Arab Emirates',
  'Netherlands',
  'Philippines',
  'Bahamas',
  'Maldives',
  'Seychelles',
  'Comoros',
  'Solomon Islands',
  'Marshall Islands',
  'Cook Islands',
  'Cayman Islands',
  'Falkland Islands',
  'Faroe Islands',
  'British Virgin Islands',
  'United States Virgin Islands',
  'Northern Mariana Islands',
  'Pitcairn Islands',
  'Turks and Caicos Islands',
  'Åland Islands',
  'Dominican Republic',
  'Central African Republic',
  'Republic of the Congo',
  'Isle of Man',
  'Gambia',
]);

/** The country's name as it reads inside a sentence: "the Netherlands", "France". */
export function countryPhrase(country: Pick<Country, 'name'>): string {
  return NEEDS_ARTICLE.has(country.name) ? `the ${country.name}` : country.name;
}

/** Words too general to count as "the country's name" when they appear in an answer. */
const GENERIC_NAME_WORDS = new Set(['south', 'north', 'east', 'west', 'western', 'northern', 'central', 'saint', 'republic', 'islands', 'island', 'united', 'states', 'kingdom', 'arab', 'emirates', 'british', 'virgin', 'city', 'isle', 'equatorial', 'papua']);
const words = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/**
 * True if an answer would name the country it is about, e.g. "Niger River" for
 * Niger or "Indian Ocean" for India. The country is always in the question, so
 * such an answer gives itself away and is never used.
 */
export function givesAway(answer: string, country: Pick<Country, 'name'>): boolean {
  const answerWords = words(answer);
  return words(country.name)
    .filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word))
    .some((word) => answerWords.some((a) => a.length >= 4 && (a.startsWith(word) || word.startsWith(a))));
}

// ------------------------------------------------------------------- population

/** Two areas closer than this ratio are too similar to ask about fairly. */
const AREA_MARGIN = 1.3;

export const POPULATION_BUCKETS: { max: number; label: string }[] = [
  { max: 10_000, label: 'Under 10,000' },
  { max: 100_000, label: '10,000 – 100,000' },
  { max: 1_000_000, label: '100,000 – 1 million' },
  { max: 5_000_000, label: '1 – 5 million' },
  { max: 10_000_000, label: '5 – 10 million' },
  { max: 25_000_000, label: '10 – 25 million' },
  { max: 50_000_000, label: '25 – 50 million' },
  { max: 100_000_000, label: '50 – 100 million' },
  { max: 250_000_000, label: '100 – 250 million' },
  { max: Infinity, label: 'Over 250 million' },
];

export function populationBucket(population: number): number {
  return POPULATION_BUCKETS.findIndex((b) => population < b.max);
}

// ---------------------------------------------------------------------- pools

type Exclude = ReadonlySet<string>;
const NONE: Exclude = new Set();

/** Close-call pool: same subregion first, then the rest of the continent, then the rest of the world. */
function regionTiers(world: World, c: Country): Country[][] {
  const sub: Country[] = [];
  const cont: Country[] = [];
  const rest: Country[] = [];
  for (const o of world.all) {
    if (o.id === c.id) continue;
    if (o.continent === c.continent) (o.subregion === c.subregion ? sub : cont).push(o);
    else rest.push(o);
  }
  return [sub, cont, rest];
}

/**
 * Far-fetched pool: the whole world except the country's own subregion. The
 * subregion is kept as a last resort so a question can always be completed.
 */
function worldTiers(world: World, c: Country): Country[][] {
  const away: Country[] = [];
  const near: Country[] = [];
  for (const o of world.all) {
    if (o.id === c.id) continue;
    (o.continent === c.continent && o.subregion === c.subregion ? near : away).push(o);
  }
  return [away, near];
}

const poolFor = (world: World, c: Country, closeness: Closeness) =>
  closeness === 1 ? regionTiers(world, c) : worldTiers(world, c);

/** Countries one step beyond the border: the most tempting wrong "neighbours". */
function neighboursOfNeighbours(world: World, c: Country): Country[] {
  const seen = new Set<string>([c.id, ...c.borders]);
  const out: Country[] = [];
  for (const b of c.borders) {
    for (const bb of world.byId[b]?.borders ?? []) {
      if (!seen.has(bb) && world.byId[bb]) {
        seen.add(bb);
        out.push(world.byId[bb]);
      }
    }
  }
  return out;
}

/**
 * Walks the tiers in order (shuffled within each tier) and collects up to n
 * values with distinct keys. `map` returns null to reject a country.
 */
function collect<T>(
  tiers: Country[][],
  n: number,
  rng: Rng,
  map: (c: Country) => T | null,
  keyOf: (value: T) => string,
  taken: Iterable<string> = [],
): T[] {
  const seen = new Set<string>(taken);
  const out: T[] = [];
  for (const tier of tiers) {
    for (const c of shuffle(rng, tier)) {
      const value = map(c);
      if (value === null) continue;
      const key = keyOf(value);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length === n) return out;
    }
  }
  return out;
}

/** Countries the player holds go last: they are on the player's own map, so they make weak options. */
function unknownFirst(tiers: Country[][], known: Exclude): Country[][] {
  if (known.size === 0) return tiers;
  return [...tiers.map((tier) => tier.filter((o) => !known.has(o.id))), tiers.flat().filter((o) => known.has(o.id))];
}

/** Line-ups of other countries that start in the region and widen to the continent, then the world. */
function wideningPools(world: World, c: Country): Country[][][] {
  const [sub, cont, rest] = regionTiers(world, c);
  return [[sub, cont, rest], [[...sub, ...cont], rest], [[...sub, ...cont, ...rest]]];
}

// ------------------------------------------------------------------- variants
//
// Several types come in more than one form ("larger than X", "the biggest of
// these", "closest in size to X"). The form is the second part of the signature.

const VARIANTS = new Set(['larger', 'smaller', 'closest', 'biggest', 'smallest', 'most', 'fewest', 'both', 'direction', 'landlocked']);

/** The question type a signature belongs to. */
export function sigType(sig: string): QuestionType {
  return sig.split(':', 1)[0] as QuestionType;
}

/** The form of question a signature stands for: "area:closest", "border:both", or just "capital". */
export function sigKind(sig: string): string {
  const [type, second] = sig.split(':');
  return VARIANTS.has(second) ? `${type}:${second}` : type;
}

/**
 * The forms of a type in the order to try them: the ones asked least so far go
 * first (ties at random), so the same form does not keep coming back.
 * '' is the plain form.
 */
function leastAskedFirst<T extends string>(rng: Rng, exclude: Exclude, type: QuestionType, forms: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const sig of exclude) counts.set(sigKind(sig), (counts.get(sigKind(sig)) ?? 0) + 1);
  const asked = (form: T) => counts.get(form === '' ? type : `${type}:${form}`) ?? 0;
  return shuffle(rng, forms).sort((a, b) => asked(a) - asked(b));
}

const COMPASS = [
  ['north', 0],
  ['east', 90],
  ['south', 180],
  ['west', 270],
] as const;

/** Compass bearing from one country's centre to another's, in degrees (0 north, 90 east). Flat-map maths: fine for neighbours. */
export function bearing(from: Pick<Country, 'lat' | 'lng'>, to: Pick<Country, 'lat' | 'lng'>): number {
  const dLng = ((to.lng - from.lng + 540) % 360) - 180;
  const dx = dLng * Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180);
  return ((Math.atan2(dx, to.lat - from.lat) * 180) / Math.PI + 360) % 360;
}

/** Degrees between two bearings, 0 to 180. */
export const bearingGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** A neighbour counts as lying on one side when its centre is within this many degrees of that compass point. */
export const DIRECTION_CLEAR = 30;
/** A neighbour offered as a wrong option must be at least this far round from the side asked about. */
export const DIRECTION_ELSEWHERE = 75;

/**
 * "Which of these is the biggest?": the country itself and three others, ranked
 * by a measure, with a clear winner. The country is one of the options on
 * purpose, and is sometimes the answer.
 */
function ranking(
  world: World,
  c: Country,
  rng: Rng,
  exclude: Exclude,
  form: string,
  prompt: string,
  measure: (o: Country) => number,
  highest: boolean,
): Draft | null {
  const pools = wideningPools(world, c);
  for (let attempt = 0; attempt < 18; attempt++) {
    const pool = pools[Math.min(pools.length - 1, Math.floor(attempt / 6))];
    const others = collect(pool, 3, rng, (o) => (measure(o) > 0 ? o : null), (o) => o.id);
    if (others.length < 3) return null;
    const line = [c, ...others].sort((x, y) => (highest ? measure(y) - measure(x) : measure(x) - measure(y)));
    const [first, second] = line.map(measure);
    if (Math.max(first, second) < Math.min(first, second) * AREA_MARGIN) continue;
    const sig = `${form}:${c.id}:${others
      .map((o) => o.id)
      .sort()
      .join(',')}`;
    if (exclude.has(sig)) continue;
    return { sig, prompt, correct: countryOption(line[0]), wrong: line.slice(1).map(countryOption) };
  }
  return null;
}

/** What a generator produces; scoring and shuffling are added afterwards. */
interface Draft {
  sig: string;
  prompt: string;
  correct: QuestionOption;
  wrong: QuestionOption[];
  /** Keep the options in this order instead of shuffling (population ranges read in sequence). */
  ordered?: QuestionOption[];
}

const countryOption = (c: Country): QuestionOption => ({ label: c.name });
const labels = (values: string[]): QuestionOption[] => values.map((label) => ({ label }));

/**
 * `exclude` holds signatures that must not be asked again. `known` holds the
 * countries the player already has: they are on the player's own map, so a
 * question about who borders whom never has one of them as its answer.
 */
type Generator = (world: World, c: Country, closeness: Closeness, exclude: Exclude, rng: Rng, known: Exclude) => Draft | null;

const GENERATORS: Record<QuestionType, Generator> = {
  flag(world, c, closeness, exclude, rng) {
    const sig = `flag:${c.id}`;
    if (exclude.has(sig) || !c.cca2) return null;
    // Close calls lead with lookalike flags; far-fetched options never include one.
    const lookalikes = world.all.filter((o) => flagsLookAlike(o, c));
    const tiers = closeness === 1 ? [lookalikes, ...regionTiers(world, c)] : worldTiers(world, c);
    const wrong = collect(
      tiers,
      3,
      rng,
      (o) => (flagsIdentical(o, c) || (closeness === 0 && flagsLookAlike(o, c)) ? null : o),
      flagIdentity,
      [flagIdentity(c)],
    );
    return {
      sig,
      prompt: `Which flag belongs to ${countryPhrase(c)}?`,
      correct: { label: c.name, flag: c.cca2 },
      wrong: wrong.map((o) => ({ label: o.name, flag: o.cca2 })),
    };
  },

  capital(world, c, closeness, exclude, rng) {
    const sig = `capital:${c.id}`;
    // Skipped where the capital carries the country's name (Djibouti, Singapore, Mexico City).
    if (exclude.has(sig) || !c.capital || givesAway(c.capital, c)) return null;
    const wrong = collect(poolFor(world, c, closeness), 3, rng, (o) => o.capital || null, (cap) => cap, [c.capital]);
    return { sig, prompt: `What is the capital of ${countryPhrase(c)}?`, correct: { label: c.capital }, wrong: labels(wrong) };
  },

  border(world, c, closeness, exclude, rng, known) {
    const neighbours = c.borders.map((b) => world.byId[b]).filter(Boolean);
    if (neighbours.length === 0) return null;
    // A neighbour the player already holds would be a free answer: it is right there on their map.
    const hidden = neighbours.filter((n) => !known.has(n.id));
    const nearby = () => (closeness === 1 ? [neighboursOfNeighbours(world, c), ...regionTiers(world, c)] : worldTiers(world, c));

    const forms: Record<'' | 'both' | 'direction' | 'landlocked', () => Draft | null> = {
      // "Which country borders X?"
      ''() {
        const candidates = hidden.filter((n) => !exclude.has(`border:${c.id}:${n.id}`));
        if (candidates.length === 0) return null;
        const answer = pick(rng, candidates);
        const wrong = collect(unknownFirst(nearby(), known), 3, rng, (o) => (c.borders.includes(o.id) ? null : o), (o) => o.id);
        return {
          sig: `border:${c.id}:${answer.id}`,
          prompt: `Which country borders ${countryPhrase(c)}?`,
          correct: countryOption(answer),
          wrong: wrong.map(countryOption),
        };
      },

      // "Which country borders both X and Y?" Y is a country the player holds when there is one,
      // which turns their own map into a clue rather than the answer.
      both() {
        const seconds = [...shuffle(rng, neighbours.filter((n) => known.has(n.id))), ...shuffle(rng, hidden)];
        for (const second of seconds) {
          const shared = hidden.filter(
            (n) => n.id !== second.id && second.borders.includes(n.id) && !exclude.has(`border:both:${c.id}:${second.id}:${n.id}`),
          );
          if (shared.length === 0) continue;
          const answer = pick(rng, shared);
          const bordersBoth = (o: Country) => c.borders.includes(o.id) && second.borders.includes(o.id);
          // The tempting wrong answers border one of the two, not both.
          const oneOnly = world.all.filter(
            (o) => o.id !== c.id && o.id !== second.id && c.borders.includes(o.id) !== second.borders.includes(o.id),
          );
          const tiers = closeness === 1 ? [oneOnly, ...nearby()] : worldTiers(world, c);
          const wrong = collect(unknownFirst(tiers, known), 3, rng, (o) => (o.id === second.id || bordersBoth(o) ? null : o), (o) => o.id);
          if (wrong.length < 3) continue;
          return {
            sig: `border:both:${c.id}:${second.id}:${answer.id}`,
            prompt: `Which country borders both ${countryPhrase(c)} and ${countryPhrase(second)}?`,
            correct: countryOption(answer),
            wrong: wrong.map(countryOption),
          };
        }
        return null;
      },

      // "Which country borders X to the east?" Only asked where the side is clear-cut.
      direction() {
        if (neighbours.length < 2) return null;
        const side = (o: Country, angle: number) => bearingGap(bearing(c, o), angle);
        // Microstates, enclaves and far-off territories make a poor "to the north".
        const enclave = (n: Country) => n.landlocked && n.borders.length < 2;
        const clear = (n: Country) => n.area >= 2000 && !enclave(n) && distanceKm(c, n) <= 4000;
        const choices = shuffle(
          rng,
          COMPASS.flatMap(([name, angle]) =>
            hidden
              .filter((n) => clear(n) && side(n, angle) <= DIRECTION_CLEAR && !exclude.has(`border:direction:${c.id}:${name}:${n.id}`))
              .map((n) => ({ name, angle, n })),
          ),
        );
        for (const { name, angle, n } of choices) {
          // A wrong option is either no neighbour at all, or a neighbour on a clearly different side.
          const elsewhere = neighbours.filter((o) => side(o, angle) >= DIRECTION_ELSEWHERE);
          const tiers = closeness === 1 ? [elsewhere, ...nearby()] : worldTiers(world, c);
          const wrong = collect(
            unknownFirst(tiers, known),
            3,
            rng,
            (o) => (c.borders.includes(o.id) && side(o, angle) < DIRECTION_ELSEWHERE ? null : o),
            (o) => o.id,
          );
          if (wrong.length < 3) continue;
          return {
            sig: `border:direction:${c.id}:${name}:${n.id}`,
            prompt: `Which country borders ${countryPhrase(c)} to the ${name}?`,
            correct: countryOption(n),
            wrong: wrong.map(countryOption),
          };
        }
        return null;
      },

      // "Which of these neighbours of X is landlocked?" All four options are neighbours, so it is always a close call.
      landlocked() {
        if (closeness !== 1) return null;
        const locked = neighbours.filter((n) => n.landlocked);
        const coastal = neighbours.filter((n) => !n.landlocked);
        const ways = shuffle(rng, [
          { key: 'is', right: locked, others: coastal, prompt: `Which of these neighbours of ${countryPhrase(c)} is landlocked?` },
          { key: 'not', right: coastal, others: locked, prompt: `Which of these neighbours of ${countryPhrase(c)} is not landlocked?` },
        ]);
        for (const way of ways) {
          const candidates = way.right.filter((n) => !exclude.has(`border:landlocked:${c.id}:${way.key}:${n.id}`));
          if (candidates.length === 0 || way.others.length < 3) continue;
          const answer = pick(rng, candidates);
          return {
            sig: `border:landlocked:${c.id}:${way.key}:${answer.id}`,
            prompt: way.prompt,
            correct: countryOption(answer),
            wrong: shuffle(rng, way.others).slice(0, 3).map(countryOption),
          };
        }
        return null;
      },
    };

    for (const form of leastAskedFirst(rng, exclude, 'border', ['', 'both', 'direction', 'landlocked'] as const)) {
      const draft = forms[form]();
      if (draft) return draft;
    }
    return null;
  },

  currency(world, c, closeness, exclude, rng) {
    const sig = `currency:${c.id}`;
    if (exclude.has(sig) || c.currencies.length === 0) return null;
    // Options are the kind of currency only ("Dinar", not "Serbian Dinar"): the country name would give it away.
    const own = [...new Set(c.currencies.map(currencyUnit))];
    const ownFamilies = new Set(own.map(currencyFamily));
    const wrong = collect(
      poolFor(world, c, closeness),
      3,
      rng,
      // A wrong option that echoes the country's name ("Franc" for France) would be a trap, not a test.
      (o) => o.currencies.map(currencyUnit).find((unit) => !ownFamilies.has(currencyFamily(unit)) && !givesAway(unit, c)) ?? null,
      currencyFamily,
      ownFamilies,
    );
    return { sig, prompt: `What currency does ${countryPhrase(c)} use?`, correct: { label: pick(rng, own) }, wrong: labels(wrong) };
  },

  language(world, c, closeness, exclude, rng) {
    const candidates = c.languages.filter((l) => !exclude.has(`language:${c.id}:${l}`));
    if (candidates.length === 0) return null;
    const answer = pick(rng, candidates);
    const wrong = collect(
      poolFor(world, c, closeness),
      3,
      rng,
      (o) => shuffle(rng, o.languages).find((l) => !c.languages.includes(l)) ?? null,
      (l) => l,
      c.languages,
    );
    return {
      sig: `language:${c.id}:${answer}`,
      prompt: `Which of these is an official language of ${countryPhrase(c)}?`,
      correct: { label: answer },
      wrong: labels(wrong),
    };
  },

  domain(world, c, closeness, exclude, rng) {
    const sig = `domain:${c.id}`;
    if (exclude.has(sig) || !c.tld) return null;
    const first = c.tld[1];
    let wrong: string[];
    if (closeness === 1) {
      // Close calls: codes you could plausibly guess from the name, and real domains starting with the same letter.
      const letters = plainLetters(c.name);
      const guesses = [...new Set([letters.slice(0, 2), letters[0] + letters[letters.length - 1], letters[0] + (letters[2] ?? '')])]
        .filter((code) => code.length === 2)
        .map((code) => `.${code}`)
        .filter((code) => code !== c.tld);
      const sameLetter = world.all.filter((o) => o.id !== c.id && o.tld && o.tld[1] === first);
      const invented = shuffle(rng, guesses).slice(0, 2);
      wrong = [
        ...invented,
        ...collect([sameLetter, ...regionTiers(world, c)], 3, rng, (o) => o.tld, (t) => t, [c.tld, ...invented]),
      ].slice(0, 3);
    } else {
      // Far-fetched: real domains from elsewhere that do not even share the first letter.
      wrong = collect(worldTiers(world, c), 3, rng, (o) => (o.tld && o.tld[1] !== first ? o.tld : null), (t) => t, [c.tld]);
    }
    return { sig, prompt: `What is the internet domain of ${countryPhrase(c)}?`, correct: { label: c.tld }, wrong: labels(wrong) };
  },

  brand(world, c, closeness, exclude, rng) {
    const candidates = (BRANDS[c.id] ?? []).filter((b) => !exclude.has(`brand:${c.id}:${b}`));
    if (candidates.length === 0) return null;
    const answer = pick(rng, candidates);
    // One brand from each of three other countries, so no two wrong options share a home.
    const wrong = collect(
      poolFor(world, c, closeness),
      3,
      rng,
      (o) => (BRANDS[o.id]?.length ? pick(rng, BRANDS[o.id]) : null),
      (b) => b,
      BRANDS[c.id],
    );
    return {
      sig: `brand:${c.id}:${answer}`,
      prompt: `Which company was founded in ${countryPhrase(c)}?`,
      correct: { label: answer },
      wrong: labels(wrong),
    };
  },

  water(world, c, closeness, exclude, rng) {
    if (c.landlocked) return null;
    const candidates = c.waters.filter((w) => !givesAway(w, c) && !exclude.has(`water:${c.id}:${w}`));
    if (candidates.length === 0) return null;
    const answer = pick(rng, candidates);
    // Wrong options are bodies of water the country does not touch, not even arguably.
    const off = new Set([...c.waters, ...c.watersAvoid]);
    const others = [...world.waters.keys()].filter((w) => !off.has(w));
    const near = others.filter((w) => world.waters.get(w)!.has(c.continent));
    const far = others.filter((w) => !world.waters.get(w)!.has(c.continent));
    const wrong = (closeness === 1 ? [near, far] : [far, near]).flatMap((tier) => shuffle(rng, tier)).slice(0, 3);
    return {
      sig: `water:${c.id}:${answer}`,
      prompt: `Which sea or ocean does ${countryPhrase(c)} border?`,
      correct: { label: answer },
      wrong: labels(wrong),
    };
  },

  feature(world, c, closeness, exclude, rng) {
    const candidates = c.features.filter((f) => !givesAway(f.name, c) && !exclude.has(`feature:${c.id}:${f.name}`));
    if (candidates.length === 0) return null;
    const answer = pick(rng, candidates);
    // Wrong options are features of the same kind that the country does not contain, not even arguably.
    const off = new Set([...c.features.map((f) => f.name), ...c.featuresAvoid]);
    const others = [...world.features.entries()].filter(([name, f]) => f.kind === answer.kind && !off.has(name));
    const near = others.filter(([, f]) => f.continents.has(c.continent)).map(([name]) => name);
    const far = others.filter(([, f]) => !f.continents.has(c.continent)).map(([name]) => name);
    const wrong = (closeness === 1 ? [near, far] : [far, near]).flatMap((tier) => shuffle(rng, tier)).slice(0, 3);
    const where = countryPhrase(c);
    const prompts = {
      river: `Which river flows through ${where}?`,
      desert: `Which desert lies in ${where}?`,
      mountains: `Which mountain range runs through ${where}?`,
      rainforest: `Which rainforest is found in ${where}?`,
    };
    return {
      sig: `feature:${c.id}:${answer.name}`,
      prompt: prompts[answer.kind],
      correct: { label: answer.name },
      wrong: labels(wrong),
    };
  },

  lines(_world, c, _closeness, exclude, rng) {
    const candidates = c.lines.filter((line) => !exclude.has(`lines:${c.id}:${line}`));
    if (candidates.length === 0) return null;
    const answer = pick(rng, candidates);
    // Other lines that clearly miss the country, plus "none of these".
    const off = new Set([...c.lines, ...c.linesAvoid]);
    const misses = shuffle(
      rng,
      GLOBE_LINES.filter((line) => !off.has(line)),
    ).slice(0, 2);
    if (misses.length < 2) return null;
    const correct = { label: answer };
    const none = { label: NO_LINE };
    const wrong = [...labels(misses), none];
    return {
      sig: `lines:${c.id}:${answer}`,
      prompt: `Which of these lines on the globe passes through ${countryPhrase(c)}?`,
      correct,
      wrong,
      ordered: [...shuffle(rng, [correct, wrong[0], wrong[1]]), none],
    };
  },

  fact(world, c, _closeness, exclude, rng) {
    const own = world.factsByCountry[c.id] ?? [];
    const candidates = own.filter(
      (f) => f.recognition >= FACT_MIN_RECOGNITION && !exclude.has(`fact:${f.id}`) && !givesAway(f.answer, c),
    );
    if (candidates.length === 0) return null;
    const fact = pick(rng, candidates);
    // Anything that is also true for this country can never be a wrong option.
    const alsoTrue = new Set(own.map((f) => f.answer));
    let wrong: string[];
    if (fact.wrong && fact.wrong.length >= 3) {
      wrong = shuffle(
        rng,
        fact.wrong.filter((w) => !alsoTrue.has(w)),
      ).slice(0, 3);
    } else {
      // Answers to the same kind of fact about other countries, nearest regions first.
      const usable = (o: Country): Fact | null =>
        shuffle(rng, world.factsByCountry[o.id] ?? []).find(
          (f) =>
            f.kind === fact.kind &&
            !alsoTrue.has(f.answer) &&
            !f.sharedWith?.includes(c.id) &&
            !(fact.group && f.group === fact.group),
        ) ?? null;
      wrong = collect(regionTiers(world, c), 3, rng, usable, (f) => f.answer, alsoTrue).map((f) => f.answer);
    }
    return { sig: `fact:${fact.id}`, prompt: fact.prompt, correct: { label: fact.answer }, wrong: labels(wrong) };
  },

  population(world, c, _closeness, exclude, rng) {
    if (!(c.population > 0)) return null;
    const people = (o: Country) => o.population;
    const forms: Record<'' | 'most' | 'fewest', () => Draft | null> = {
      // "What is the population of X?": a window of four neighbouring ranges that contains the right one.
      ''() {
        const sig = `population:${c.id}`;
        if (exclude.has(sig)) return null;
        const bucket = populationBucket(c.population);
        const minStart = Math.max(0, bucket - 3);
        const maxStart = Math.min(POPULATION_BUCKETS.length - 4, bucket);
        const start = minStart + randInt(rng, maxStart - minStart + 1);
        const ordered = POPULATION_BUCKETS.slice(start, start + 4).map((b) => ({ label: b.label }));
        const correct = ordered[bucket - start];
        return {
          sig,
          prompt: `What is the population of ${countryPhrase(c)}?`,
          correct,
          wrong: ordered.filter((o) => o !== correct),
          ordered,
        };
      },
      most: () => ranking(world, c, rng, exclude, 'population:most', 'Which of these has the most people?', people, true),
      fewest: () => ranking(world, c, rng, exclude, 'population:fewest', 'Which of these has the fewest people?', people, false),
    };
    for (const form of leastAskedFirst(rng, exclude, 'population', ['', 'most', 'fewest'] as const)) {
      const draft = forms[form]();
      if (draft) return draft;
    }
    return null;
  },

  area(world, c, _closeness, exclude, rng) {
    if (!(c.area > 0)) return null;
    const tiers = regionTiers(world, c);
    const size = (o: Country) => o.area;
    const isLarger = (o: Country) => o.area >= c.area * AREA_MARGIN;
    const isSmaller = (o: Country) => o.area > 0 && o.area * AREA_MARGIN <= c.area;

    // "Which of these is larger than X?"
    const compare = (kind: 'larger' | 'smaller'): Draft | null => {
      const right = kind === 'larger' ? isLarger : isSmaller;
      const wrongSide = kind === 'larger' ? isSmaller : isLarger;
      const [answer] = collect(
        tiers,
        1,
        rng,
        (o) => (right(o) && !exclude.has(`area:${kind}:${c.id}:${o.id}`) ? o : null),
        (o) => o.id,
      );
      if (!answer) return null;
      const wrong = collect(tiers, 3, rng, (o) => (wrongSide(o) ? o : null), (o) => o.id);
      if (wrong.length < 3) return null;
      return {
        sig: `area:${kind}:${c.id}:${answer.id}`,
        prompt: `Which of these is ${kind} than ${countryPhrase(c)} by area?`,
        correct: countryOption(answer),
        wrong: wrong.map(countryOption),
      };
    };

    // "Closest in size" compares four other countries with this one. Line-ups start regional and
    // widen to the continent and then the world.
    const gap = (o: Country) => Math.abs(Math.log(o.area / c.area));
    const closest = (): Draft | null => {
      const pools = wideningPools(world, c);
      for (let attempt = 0; attempt < 24; attempt++) {
        const pool = pools[Math.min(pools.length - 1, Math.floor(attempt / 4))];
        const four = collect(pool, 4, rng, (o) => (o.area > 0 ? o : null), (o) => o.id).sort((x, y) => gap(x) - gap(y));
        if (four.length < 4) return null;
        // The winner must be clearly closer than the runner-up.
        if (gap(four[1]) - gap(four[0]) < Math.log(AREA_MARGIN)) continue;
        const sig = `area:closest:${c.id}:${four
          .map((o) => o.id)
          .sort()
          .join(',')}`;
        if (exclude.has(sig)) continue;
        return {
          sig,
          prompt: `Which of these is closest in size to ${countryPhrase(c)}?`,
          correct: countryOption(four[0]),
          wrong: four.slice(1).map(countryOption),
        };
      }
      return null;
    };

    // Five forms, taken in turn. The line-up forms (biggest, smallest, closest) are practically
    // inexhaustible, which is what guarantees a very long battle never has to repeat a question.
    const forms: Record<'larger' | 'smaller' | 'biggest' | 'smallest' | 'closest', () => Draft | null> = {
      larger: () => compare('larger'),
      smaller: () => compare('smaller'),
      biggest: () => ranking(world, c, rng, exclude, 'area:biggest', 'Which of these is the biggest by area?', size, true),
      smallest: () => ranking(world, c, rng, exclude, 'area:smallest', 'Which of these is the smallest by area?', size, false),
      closest,
    };
    for (const form of leastAskedFirst(rng, exclude, 'area', ['larger', 'smaller', 'biggest', 'smallest', 'closest'] as const)) {
      const draft = forms[form]();
      if (draft) return draft;
    }
    return null;
  },

  notBorder(world, c, closeness, exclude, rng, known) {
    const neighbours = c.borders.filter((b) => world.byId[b]);
    if (neighbours.length < 3) return null;
    // Three real neighbours are shown. Ones the player holds are obvious, so at most one of them is used.
    const hidden = neighbours.filter((id) => !known.has(id));
    if (hidden.length < 2) return null;
    const decoys = [...shuffle(rng, hidden), ...shuffle(rng, neighbours.filter((id) => known.has(id)))].slice(0, 3);
    // The odd one out is nearly a neighbour when close, and nowhere near when far-fetched.
    const tiers = closeness === 1 ? [neighboursOfNeighbours(world, c), ...regionTiers(world, c)] : worldTiers(world, c);
    const [answer] = collect(
      unknownFirst(tiers, known),
      1,
      rng,
      (o) => (c.borders.includes(o.id) || exclude.has(`notBorder:${c.id}:${o.id}`) ? null : o),
      (o) => o.id,
    );
    if (!answer) return null;
    return {
      sig: `notBorder:${c.id}:${answer.id}`,
      prompt: `Which of these does NOT border ${countryPhrase(c)}?`,
      correct: countryOption(answer),
      wrong: shuffle(rng, decoys).map((id) => countryOption(world.byId[id])),
    };
  },
};

/**
 * Generates one question of a specific type and closeness, or null if the
 * country lacks the data for it (or every variant is excluded). The tier is
 * whatever the score works out to.
 */
export function generateQuestion(
  world: World,
  countryId: string,
  type: QuestionType,
  rng: Rng,
  exclude: Exclude = NONE,
  closeness: Closeness = 1,
  known: Exclude = NONE,
): Question | null {
  const country = world.byId[countryId];
  if (!country) return null;
  const applied: Closeness = USES_CLOSENESS[type] ? closeness : 0;
  const draft = GENERATORS[type](world, country, applied, exclude, rng, known);
  if (!draft || draft.wrong.length !== 3) return null;
  const options = draft.ordered ?? shuffle(rng, [draft.correct, ...draft.wrong]);
  const score = questionScore(type, country.fame, applied);
  return {
    sig: draft.sig,
    type,
    difficulty: tierOf(score),
    score,
    closeness: applied,
    countryId,
    prompt: draft.prompt,
    options,
    correctIndex: options.indexOf(draft.correct),
  };
}

// --------------------------------------------------------------- filling slots

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/** The tiers to try for a target, nearest first; on a tie the easier one comes first. */
export function tierOrder(target: Difficulty): Difficulty[] {
  return [...DIFFICULTIES].sort((a, b) => Math.abs(RANK[a] - RANK[target]) - Math.abs(RANK[b] - RANK[target]) || RANK[a] - RANK[b]);
}

/** Every type and closeness the country could be asked, with the tier each would score. */
export function combinations(country: Country): { type: QuestionType; closeness: Closeness; tier: Difficulty }[] {
  return QUESTION_TYPES.flatMap((type) =>
    (USES_CLOSENESS[type] ? ([0, 1] as const) : ([0] as const)).map((closeness) => ({
      type,
      closeness,
      tier: tierOf(questionScore(type, country.fame, closeness)),
    })),
  );
}

/** What a slot knows about the game so far, beyond the questions it must not repeat. */
export interface AskContext {
  /** Signatures asked earlier in the game: avoided for as long as anything else fits. */
  stale?: Exclude;
  /** Countries the player holds. */
  known?: Exclude;
}

/**
 * Fills a difficulty slot with a type-and-closeness combination. In order of
 * importance:
 *
 * 1. Variety. Types already asked in `exclude` (this battle) wait their
 *    turn: a type is not asked a second time while another one is still unused.
 * 2. Freshness. A question asked earlier in the game (`stale`) is passed over
 *    while the types whose turn it is have something new to ask.
 * 3. The target tier. If nothing fits it (an obscure country has no Easy
 *    questions, a famous one no Hard ones) the nearest tier is used.
 *
 * Within a tier, types that cannot be asked any harder go first, which saves
 * the ones that can for the harder slots that follow. For mid-known and
 * obscure countries a set share of slots (REASON_OUT_SHARE) prefers reason-out
 * types when one is available.
 */
export function pickForTier(
  world: World,
  countryId: string,
  target: Difficulty,
  rng: Rng,
  exclude: Exclude = NONE,
  { stale = NONE, known = NONE }: AskContext = {},
): Question | null {
  const country = world.byId[countryId];
  if (!country) return null;
  const uses = new Map<QuestionType, number>();
  for (const sig of exclude) uses.set(sigType(sig), (uses.get(sigType(sig)) ?? 0) + 1);
  const combos = combinations(country);
  const hardest = (type: QuestionType) => Math.max(...combos.filter((combo) => combo.type === type).map((combo) => RANK[combo.tier]));
  const all = combos.map((combo) => ({ ...combo, uses: uses.get(combo.type) ?? 0, spare: hardest(combo.type) > RANK[combo.tier] }));
  const levels = [...new Set(all.map((combo) => combo.uses))].sort((a, b) => a - b);
  // For less familiar countries, lean towards questions that can be reasoned out from the map.
  // The roll decides which kind of question this slot prefers.
  const share = REASON_OUT_SHARE[country.fame];
  const preferReasonOut = share === null ? null : rng() < share;
  const preferred = (combo: { type: QuestionType }) => preferReasonOut === null || REASON_OUT_TYPES.includes(combo.type) === preferReasonOut;
  // Questions not asked before in this game come first; then ones only asked a while ago.
  const avoid = stale.size > 0 ? [new Set([...exclude, ...stale]), exclude] : [exclude];
  for (const level of levels) {
    const orderedByTier = tierOrder(target).map((tier) => {
      const inTier = shuffle(
        rng,
        all.filter((combo) => combo.uses === level && combo.tier === tier),
      );
      return [
        ...inTier.filter((combo) => preferred(combo) && !combo.spare),
        ...inTier.filter((combo) => preferred(combo) && combo.spare),
        ...inTier.filter((combo) => !preferred(combo) && !combo.spare),
        ...inTier.filter((combo) => !preferred(combo) && combo.spare),
      ];
    });
    for (const set of avoid) {
      for (const ordered of orderedByTier) {
        for (const combo of ordered) {
          const question = generateQuestion(world, countryId, combo.type, rng, set, combo.closeness, known);
          if (question) return question;
        }
      }
    }
  }
  return null;
}

/** A question of a random tier, drawn by DEFAULT_WEIGHTS. */
export function pickQuestion(world: World, countryId: string, rng: Rng, exclude: Exclude = NONE): Question | null {
  let roll = rng();
  const target = DIFFICULTIES.find((d) => (roll -= DEFAULT_WEIGHTS[d]) < 0) ?? 'hard';
  return pickForTier(world, countryId, target, rng, exclude);
}

/** The opening question of the recruit phase and of every battle: the flag, with a coin flip for how close the options are. */
function openingFlag(world: World, countryId: string, rng: Rng, exclude: Exclude): Question | null {
  const closeness: Closeness = rng() < FLAG_CLOSE_CHANCE ? 1 : 0;
  return generateQuestion(world, countryId, 'flag', rng, exclude, closeness);
}

/** Target tier for each question of a battle after the opening flag: Easy, Medium, Medium, then mostly Hard. */
export function battleDifficulty(index: number, rng: Rng): Difficulty {
  if (index <= 1) return 'easy';
  if (index <= 3) return 'medium';
  return rng() < 0.75 ? 'hard' : 'medium';
}

/**
 * Next question in a battle. The first is always the target's flag; after that
 * each slot asks for a tier. Never repeats a signature already asked in that
 * battle, rotates through the question types, steers clear of questions asked
 * earlier in the game (`recent`) and never makes a country the player holds
 * (`owned`) the answer to a border question.
 */
export function nextBattleQuestion(
  world: World,
  targetId: string,
  asked: readonly string[],
  rng: Rng,
  { recent = [], owned = [] }: { recent?: readonly string[]; owned?: readonly string[] } = {},
): Question {
  const exclude = new Set(asked);
  const context: AskContext = { stale: new Set(recent), known: new Set(owned) };
  const index = asked.length;
  const question =
    (index === 0 ? openingFlag(world, targetId, rng, exclude) : null) ??
    pickForTier(world, targetId, battleDifficulty(index, rng), rng, exclude, context) ??
    pickForTier(world, targetId, 'medium', rng, exclude) ??
    pickForTier(world, targetId, 'medium', rng);
  if (!question) throw new Error(`No question can be generated for ${targetId}`);
  return question;
}

/** Target tiers for the five questions of the opening recruit phase. The first is always the flag. */
export const RECRUIT_RAMP: Difficulty[] = ['easy', 'easy', 'medium', 'medium', 'hard'];

/**
 * Next question of the opening recruit phase, about the player's starting
 * country. Opens with its flag, then follows RECRUIT_RAMP. No question and no
 * type comes up twice.
 */
export function nextRecruitQuestion(world: World, countryId: string, asked: readonly string[], rng: Rng): Question {
  const exclude = new Set(asked);
  const index = asked.length;
  const target = RECRUIT_RAMP[Math.min(index, RECRUIT_RAMP.length - 1)];
  const question =
    (index === 0 ? openingFlag(world, countryId, rng, exclude) : null) ??
    pickForTier(world, countryId, target, rng, exclude) ??
    pickForTier(world, countryId, target, rng);
  if (!question) throw new Error(`No recruit question can be generated for ${countryId}`);
  return question;
}
