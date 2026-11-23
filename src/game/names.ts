// The filter on empire names, which other players see on the leaderboard. It refuses slurs, racist,
// extremist and sexual terms and swearing, and sees through the usual disguises:
//   numbers and symbols for letters      n1gga, sh!t, a$$, b1tch, phuck
//   letters spaced or dotted apart       N I G G A, f.u.c.k
//   letters stretched                    niiigga, fuuuck
//   look-alike letters                   ｆｕｃｋ (full width), fцck and nіgga (Cyrillic), accents
//   letters starred out or dropped       f*ck, f**k, n*gga, sh*t
// The database applies exactly the same rules again (atlas_name_allowed in supabase/schema.sql), and
// tests/names.test.ts runs that SQL to prove the two agree. No word list is ever complete: a determined
// player will find a spelling this misses, and a bad name can always be deleted from the database by hand.

/**
 * Terms refused anywhere in a name, even run together with other words or with the spaces taken out.
 * Only terms that never turn up inside an innocent word belong here.
 */
export const BLOCKED_ANYWHERE = [
  // Slurs.
  'nigger', 'nigga', 'faggot', 'wetback', 'raghead', 'towelhead', 'golliwog', 'redskin', 'halfbreed',
  'zipperhead', 'slanteye', 'chinaman', 'reggin',
  // Hate and extremism.
  'hitler', 'himmler', 'goebbels', 'mengele', 'mussolini', 'neonazi', 'siegheil', 'swastika', 'fuhrer', 'fuehrer',
  'whitepower', 'whitepride', 'kukluxklan', 'kkk', 'holocaust', 'genocide', 'ethniccleansing', 'terrorist',
  'terrorism', 'alqaeda', 'alqaida', 'taliban', 'binladen', 'polpot',
  // Sexual.
  'porn', 'vagina', 'orgasm', 'nipple', 'titties', 'blowjob', 'handjob', 'rimjob', 'cumshot', 'jizz', 'hentai',
  'pedophile', 'paedophile', 'molest', 'bestiality', 'necrophil', 'whore', 'pussy', 'skank',
  // Swearing and insults.
  'fuck', 'asshole', 'arsehole', 'bitch', 'bollocks', 'dickhead', 'cocksucker', 'douchebag', 'dumbass', 'jackass',
  'bellend', 'shithole', 'shithead', 'bullshit', 'horseshit', 'dipshit', 'wanker', 'killyourself',
]; // prettier-ignore

/**
 * Terms refused only as a whole word (with an optional plural), because they hide inside innocent ones:
 * Ashkenazi, grape, Essex, Scunthorpe, Cockburn, Dickens, Japan, Pakistan, Montenegro, spice, raccoon,
 * Slutsk, Milford, Penistone, therapist, Mitsubishi, fire retardant, Princes Town.
 */
export const BLOCKED_WORDS = [
  // Slurs.
  'negro', 'coon', 'spic', 'chink', 'gook', 'kike', 'beaner', 'paki', 'jap', 'wog', 'injun', 'gyppo', 'gypo', 'pikey',
  'honky', 'kraut', 'yid', 'heeb', 'dago', 'wop', 'squaw', 'darkie', 'darky', 'fag', 'dyke', 'tranny', 'homo',
  'spaz', 'spastic', 'retard', 'retarded', 'ngger', 'nggr', 'ngga', 'nigg',
  // Hate and extremism.
  'nazi', 'heil', 'reich', 'aryan', 'stalin', 'isis', 'jihad', 'klan',
  // Sexual.
  'sex', 'sexy', 'penis', 'cum', 'semen', 'dildo', 'anal', 'anus', 'orgy', 'horny', 'boob', 'tits', 'titty', 'clit',
  'milf', 'xxx', 'slut', 'thot', 'rape', 'rapist', 'pedo', 'paedo', 'incest',
  // Swearing and insults.
  'fuk', 'fuq', 'fck', 'fk', 'fcuk', 'fukk', 'shit', 'shitty', 'sht', 'ass', 'arse', 'cunt', 'cnt', 'twat', 'dick',
  'dck', 'cock', 'prick', 'piss', 'pissed', 'crap', 'bastard', 'bugger', 'tosser', 'minge', 'wank', 'douche',
  'btch', 'kys', 'suicide',
]; // prettier-ignore

/** Numbers that are hate symbols in their own right, however they are punctuated: 14/88, 1488. */
export const BLOCKED_NUMBERS = /1[^0-9a-z]*4[^0-9a-z]*8[^0-9a-z]*8/i;

/** Letters from other alphabets that look like Latin ones: fцck, nіgga, ѕhit. Upper and lower case alike. */
export const LOOKALIKE_FROM = 'АВЕКМНОРСТУХІЈЅЦПаеорсухіјѕцпԁɡΑΒΕΖΗΙΚΜΝΟΡΤΥΧαβεικνορτυχ';
export const LOOKALIKE_TO = 'abekmhopctyxijsunaeopcyxijsundgabezhikmnoptyxabeikvoptux';

/** Digits and symbols that stand in for letters: n1gga, sh!t, a$$, b1tch, 5h17. */
export const LEET_FROM = '0123456789@$!|+€£(¢¡';
export const LEET_TO = 'oizeasgtbgasiitelcci';

/** Letters a filter has to treat as one: v for u (fvck). (Not l for i: that reads Hell as Heil.) */
const LETTER_CLASS: Record<string, string> = { u: '[uv]', v: '[uv]' };

/**
 * A term as a pattern: each letter may be stretched (niiigga) or swapped for its look-alike (fvck). Names are
 * read with ph as f (phuck), so the terms are too (pedofile).
 */
export function termPattern(term: string): string {
  return [...term.replace(/ph/g, 'f')].map((letter) => `${LETTER_CLASS[letter] ?? letter}+`).join('');
}

/** The two patterns the filter uses; supabase/schema.sql carries them word for word. */
export const ANYWHERE_PATTERN = `(${BLOCKED_ANYWHERE.map(termPattern).join('|')})`;
export const WORD_PATTERN = `^(${BLOCKED_WORDS.map(termPattern).join('|')})(s|es|z)?$`;

const ANYWHERE = new RegExp(ANYWHERE_PATTERN);
const WORD = new RegExp(WORD_PATTERN);

function translate(text: string, from: string, to: string): string {
  return [...text].map((ch) => {
    const at = [...from].indexOf(ch);
    return at === -1 ? ch : [...to][at];
  }).join(''); // prettier-ignore
}

/** A name as the filter reads it: lower-case Latin letters, with every stand-in undone. Punctuation stays. */
export function plainName(name: string): string {
  const latin = translate(name.normalize('NFKD').replace(/[̀-ͯ]/g, ''), LOOKALIKE_FROM, LOOKALIKE_TO);
  return translate(latin.toLowerCase(), LEET_FROM, LEET_TO).replace(/ph/g, 'f');
}

/** Words, with runs of single letters joined back up: "n i g g a" is one word. */
function joinLetters(text: string): string[] {
  const words: string[] = [];
  let run = '';
  for (const word of text.split(' ').filter(Boolean)) {
    if (word.length === 1) {
      run += word;
      continue;
    }
    if (run) words.push(run);
    run = '';
    words.push(word);
  }
  if (run) words.push(run);
  return words;
}

/** False for a name the game will not carry. */
export function nameAllowed(name: string): boolean {
  if (BLOCKED_NUMBERS.test(name)) return false;
  const plain = plainName(name);
  // Everything run together: f.u.c.k, N I G G A, xXfuckXx.
  if (ANYWHERE.test(plain.replace(/[^a-z]/g, ''))) return false;
  // Word by word, reading punctuation both as a gap (d.i.c.k) and as nothing at all (sh.it).
  const gapped = joinLetters(plain.replace(/[^a-z]+/g, ' '));
  const closed = joinLetters(plain.replace(/[^a-z ]/g, ''));
  return ![...gapped, ...closed].some((word) => WORD.test(word));
}
