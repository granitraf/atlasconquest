// A basic profanity filter for empire names, which are shown to other players on the leaderboard.
// The same two word lists are checked again by the database (supabase/schema.sql); a unit test keeps
// the two in step. It is a courtesy, not a wall: a determined player will always find a spelling.

/** Blocked wherever they appear inside a word. Nothing innocent contains these. */
export const BLOCKED_ANYWHERE = ['fuck', 'nigger', 'nigga', 'faggot', 'bitch', 'asshole', 'whore', 'pussy', 'retard', 'hitler'];

/**
 * Blocked only as whole words (with an optional plural), because they hide inside innocent ones:
 * Essex, Cockburn Town, grape, Matsushita, Ashkenazi, raccoon.
 */
export const BLOCKED_WORDS = [
  'ass', 'arse', 'shit', 'shitty', 'bullshit', 'cock', 'dick', 'cunt', 'twat', 'slut', 'rape', 'rapist', 'nazi', 'kkk',
  'penis', 'vagina', 'porn', 'sex', 'fag', 'kike', 'spic', 'chink', 'coon', 'tranny', 'wank', 'wanker', 'prick', 'piss',
  'tits', 'cum', 'dildo', 'anus', 'pedo', 'paedo', 'jizz', 'bastard',
]; // prettier-ignore

/** Digits and symbols that stand in for letters: sh1t, a$$, f4g. */
export const LEET_FROM = '013457@$!';
export const LEET_TO = 'oieastasi';

const ANYWHERE = new RegExp(`(${BLOCKED_ANYWHERE.join('|')})`);
const WORDS = new RegExp(`(^| )(${BLOCKED_WORDS.join('|')})(s|es)?( |$)`);

/** A name as the filter reads it: lower case, accents and stand-in characters undone, punctuation dropped. */
export function plainName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!]/g, (ch) => LEET_TO[LEET_FROM.indexOf(ch)])
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** False for a name the leaderboard should not carry. */
export function nameAllowed(name: string): boolean {
  const plain = plainName(name);
  return !ANYWHERE.test(plain) && !WORDS.test(plain);
}
