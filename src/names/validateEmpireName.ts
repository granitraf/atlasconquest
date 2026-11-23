// The one check on an empire name. Pure and free of the browser, so the same function can run on a
// server (Node, Deno or a Supabase Edge Function), because checks made only in the browser can be bypassed.
//
//   1. Format: letters A to Z, apostrophes inside or at the end of a word (O'Brien, Dragons'), and single
//      spaces, 3 to 24 characters after trimming.
//   2. Words on the allowlist (allowed-names.json) are taken out, so Essex and Scunthorpe pass.
//   3. What is left is checked, with apostrophes ignored, as typed and with the spaces taken out and stretched letters squeezed
//      (N I G G A, niiigga), against the obscenity library's English list and against the custom
//      blocklist (blocked-names.json), whose terms are refused anywhere inside the name.

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import allowedFile from './allowed-names.json';
import blockedFile from './blocked-names.json';

export const EMPIRE_NAME_MIN = 3;
export const EMPIRE_NAME_MAX = 24;
/** What a name loaded from saved data becomes if it no longer passes. */
export const NEW_EMPIRE = 'New Empire';

export type EmpireNameReason = 'ok' | 'empty' | 'invalid_characters' | 'too_short' | 'too_long' | 'not_allowed';

export interface EmpireNameResult {
  valid: boolean;
  reason: EmpireNameReason;
  /** The name trimmed, with repeated spaces collapsed: the form to store when it is valid. */
  name: string;
}

export const BLOCKED_TERMS: readonly string[] = blockedFile.blocked;
export const ALLOWED_NAMES: readonly string[] = allowedFile.allowed;

/** Words of letters, with apostrophes inside or at the end of a word (O'Brien, rock'n'roll, Dragons'), and single spaces. */
export const NAME_FORMAT = /^[A-Za-z]+('[A-Za-z]+)*'?( [A-Za-z]+('[A-Za-z]+)*'?)*$/;

/** The custom checks as two patterns, shared word for word with the database (see scripts/names-sql.mjs). */
const byLength = (list: readonly string[]) => [...list].sort((a, b) => b.length - a.length || a.localeCompare(b));
export const ALLOWED_PATTERN = ` (${byLength(ALLOWED_NAMES).join('|')})(?= )`;
export const BLOCKED_PATTERN = `(${byLength(BLOCKED_TERMS).join('|')})`;
const ALLOWED = new RegExp(ALLOWED_PATTERN, 'g');
const BLOCKED = new RegExp(BLOCKED_PATTERN);

const library = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** Trims a name, collapses its runs of spaces, and makes curly apostrophes (as phones type them) straight. */
export function tidyName(name: string): string {
  return name.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * The forms of a well-formed name that are checked: as typed (lower case, apostrophes ignored, allowlisted words taken out),
 * then with the spaces taken out, then with letters repeated three or more times squeezed to one and to two
 * (niiigga, nigggger).
 */
export function nameForms(name: string): string[] {
  const typed = ` ${name.toLowerCase().replace(/'/g, '')} `.replace(ALLOWED, ' ').trim();
  const joined = typed.replace(/ /g, '');
  return [typed, joined, joined.replace(/(.)\1\1+/g, '$1'), joined.replace(/(.)\1\1+/g, '$1$1')];
}

/** True if a well-formed name contains a custom blocked term, the part of the check the database repeats. */
export function hasBlockedTerm(name: string): boolean {
  return nameForms(name).some((form) => BLOCKED.test(form));
}

/** Checks an empire name. Never says which word was the trouble: the reason is only a code. */
export function validateEmpireName(raw: unknown): EmpireNameResult {
  if (typeof raw !== 'string') return { valid: false, reason: 'invalid_characters', name: '' };
  const name = tidyName(raw);
  if (name === '') return { valid: false, reason: 'empty', name };
  if (!NAME_FORMAT.test(name)) return { valid: false, reason: 'invalid_characters', name };
  if (name.length < EMPIRE_NAME_MIN) return { valid: false, reason: 'too_short', name };
  if (name.length > EMPIRE_NAME_MAX) return { valid: false, reason: 'too_long', name };
  const forms = nameForms(name);
  if (forms.some((form) => BLOCKED.test(form) || (form !== '' && library.hasMatch(form)))) return { valid: false, reason: 'not_allowed', name };
  return { valid: true, reason: 'ok', name };
}

/** What the name field lets through while typing: letters, apostrophes and single spaces, at most the maximum length. */
export function typedName(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^A-Za-z' ]/g, '')
    .replace(/'{2,}/g, "'")
    .replace(/ {2,}/g, ' ')
    .replace(/(^| )'/g, '$1')
    .replace(/^ /, '')
    .slice(0, EMPIRE_NAME_MAX);
}

/** A name that passes, made from a starting country's name: "Empire of Germany", "Bosnia and Herzegovina", or "New Empire". */
export function countryEmpireName(countryName: string): string {
  const plain = tidyName(countryName.normalize('NFKD').replace(/[̀-ͯ]/g, ''));
  // Letters and apostrophes, with any apostrophe that would start a word or follow another dropped.
  const letters = tidyName(plain.replace(/[^A-Za-z']+/g, ' ').replace(/(^| )'+/g, '$1').replace(/'{2,}/g, "'"));
  const fits = [`Empire of ${letters}`, `${letters} Empire`, letters].find((candidate) => validateEmpireName(candidate).valid);
  return fits ?? NEW_EMPIRE;
}
