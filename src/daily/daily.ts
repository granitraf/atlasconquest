// The Daily Game: one starting country a day, the same for every player, changing at midnight US Eastern
// time. Pure functions of a date, so the game and the database (supabase/schema.sql) can agree on which
// country belongs to which day.

import schedule from '../../config/daily-order.json';

/** The clock the daily game runs on: a new country at 12:00am here. */
export const DAILY_TIME_ZONE = 'America/New_York';
/** Day 0, and the order countries are taken in from then on. */
export const DAILY_EPOCH: string = schedule.epoch;
export const DAILY_ORDER: readonly string[] = schedule.order;

const parts = (now: Date) => {
  const read = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(read.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
};
const two = (n: number) => String(n).padStart(2, '0');

/** Today's date in the daily game's time zone, as YYYY-MM-DD. */
export function dailyDay(now: Date = new Date()): string {
  const p = parts(now);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

const utcMidnight = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Days from the epoch to a day (negative before it). */
export function dayNumber(day: string): number {
  return Math.round((utcMidnight(day) - utcMidnight(DAILY_EPOCH)) / 86_400_000);
}

/** The starting country for a day: the next in the fixed order, which starts over after its last country. */
export function dailyCountryId(day: string): string {
  const n = DAILY_ORDER.length;
  return DAILY_ORDER[((dayNumber(day) % n) + n) % n];
}

/** The day before a day, as YYYY-MM-DD. */
export function previousDay(day: string): string {
  return new Date(utcMidnight(day) - 86_400_000).toISOString().slice(0, 10);
}

/** Seconds until the next daily game begins (midnight in the daily time zone). */
export function secondsUntilNextDay(now: Date = new Date()): number {
  const p = parts(now);
  return Math.max(1, 86_400 - (p.hour * 3600 + p.minute * 60 + p.second));
}

/** A countdown as HH:MM:SS. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** A day written out: "Friday 27 November". */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(utcMidnight(day)));
}

/**
 * The passcode to the classic game, as a hash: the game compares what is typed with this, so the passcode
 * itself is not written in the code. It is a soft lock, not security: anyone who reads the code can get past
 * it. Change it with `npm run passcode -- NEWCODE`.
 */
export const CLASSIC_PASSCODE_HASH = 5930617031180738;

/**
 * The hash in force: a build may be given its own as VITE_CLASSIC_PASSCODE_HASH (the browser checks use
 * one of theirs, so they never need to know the real passcode); otherwise the one above.
 */
export function passcodeHash(): number {
  const given = Number(import.meta.env.VITE_CLASSIC_PASSCODE_HASH);
  return Number.isSafeInteger(given) && given > 0 ? given : CLASSIC_PASSCODE_HASH;
}

/** A short, fast hash of a string (cyrb53). Not cryptographic. */
export function hashCode(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Is this the passcode to the classic game? Case and surrounding spaces do not matter. */
export function passcodeMatches(typed: string): boolean {
  return hashCode(typed.trim().toLowerCase()) === passcodeHash();
}
