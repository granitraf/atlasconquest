// Shared helpers for driving the game in a real browser (your installed Google Chrome, headless).
// The game exposes its state on window.__atlas in development builds only; these checks read it
// to know the right answer, but every action goes through the real UI: clicks, taps, wheel, keys.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

export const BASE = process.env.ATLAS_URL ?? 'http://localhost:5173/';
export const SHOTS = decodeURIComponent(new URL('./screenshots/', import.meta.url).pathname);
mkdirSync(SHOTS, { recursive: true });

/**
 * The leaderboard's address in these checks. The .invalid domain can never resolve, and every call to
 * a leaderboard is answered by the stand-in below, so no check ever reaches a real database.
 */
export const SUPABASE_URL = 'https://leaderboard.invalid';
export const SUPABASE_KEY = 'test-public-key';
const LEADERBOARD_CALL = /\/rest\/v1\/rpc\//;

/**
 * A stand-in for the Supabase project: it keeps runs in memory and answers the two calls the game makes
 * (submit_run and top_runs) with the ranking rules of supabase/schema.sql.
 *   board.mode = 'ok' | 'down' (unreachable) | 'reject' (refuses every run)
 */
export function fakeLeaderboard() {
  const board = { rows: [], requests: [], mode: 'ok', clock: 0 };
  const order = (a, b) => b.score - a.score || a.battles - b.battles || a.created_at.localeCompare(b.created_at) || a.run_id.localeCompare(b.run_id);
  board.ranked = (campaign) => board.rows.filter((r) => r.campaign === campaign).sort(order).map((r, i) => ({ ...r, rank: i + 1 }));
  const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, board.clock++)).toISOString();
  /** Puts a run on the board directly, as if someone else had played it. */
  board.add = (campaign, empire_name, score, extra = {}) => {
    const row = { run_id: `00000000-0000-4000-8000-${String(board.rows.length + 1).padStart(12, '0')}`, campaign, empire_name, flag_pattern: board.rows.length % 16, flag_colours: ['#d8343c', '#f4f4ec', '#2b4fc4'], start_country: 'FRA', score, conquered: Math.round(score), continents: 0, battles: Math.round(score) + 1, best_streak: 3, outcome: 'defeat', created_at: stamp(), ...extra };
    board.rows.push(row);
    return row;
  };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  board.handle = async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const name = new URL(request.url()).pathname.split('/').pop();
    const args = request.postDataJSON() ?? {};
    board.requests.push({ name, args, url: request.url(), headers: request.headers() });
    if (board.mode === 'down') return route.abort('connectionrefused');
    if (name === 'submit_run') {
      if (board.mode === 'reject') return json(route, 400, { code: 'P0001', message: 'The score does not add up.' });
      if (!board.rows.some((r) => r.run_id === args.p_run_id)) {
        board.rows.push({ run_id: args.p_run_id, campaign: args.p_campaign, empire_name: args.p_empire_name, flag_pattern: args.p_flag_pattern, flag_colours: args.p_flag_colours, start_country: args.p_start_country, score: args.p_score, conquered: args.p_conquered, continents: args.p_continents, battles: args.p_battles, best_streak: args.p_best_streak, outcome: args.p_outcome, created_at: stamp() });
      }
      const run = board.rows.find((r) => r.run_id === args.p_run_id);
      return json(route, 200, board.ranked(run.campaign).find((r) => r.run_id === run.run_id).rank);
    }
    if (name === 'top_runs') {
      const campaigns = args.p_campaign ? [args.p_campaign] : [...new Set(board.rows.map((r) => r.campaign))];
      return json(route, 200, campaigns.flatMap((c) => board.ranked(c).slice(0, args.p_limit ?? 5)));
    }
    return json(route, 404, { message: 'no such function' });
  };
  return board;
}

export async function launch(opts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 860 },
    deviceScaleFactor: opts.dpr ?? 1,
    hasTouch: opts.touch ?? false,
    isMobile: opts.mobile ?? false,
  });
  const board = fakeLeaderboard();
  await context.route(LEADERBOARD_CALL, board.handle);
  const page = await context.newPage();
  const problems = [];
  // When a check takes the leaderboard down on purpose, the browser's complaints about it are expected.
  const expected = (url) => board.mode !== 'ok' && LEADERBOARD_CALL.test(url ?? '');
  page.on('console', (m) => {
    if (expected(m.location()?.url)) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    // A request the browser itself cancelled (an image still loading when the test reloads the page) is not a
    // failure of the game. A file that is really missing arrives as a 404 below, and other network errors still count.
    if (r.failure()?.errorText === 'net::ERR_ABORTED' || expected(r.url())) return;
    problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !expected(r.url())) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return { browser, context, page, problems, board };
}

export const state = (page) => page.evaluate(() => window.__atlas?.state ?? null);

/** Troops and defenders as the game shows them: every unit is 1,000 soldiers. */
export const k = (units) => (units * 1000).toLocaleString('en-US');

/**
 * Text that does not fit its box. Reports every label, button, chip, tooltip or message whose
 * content is wider or taller than the box drawn around it, and every piece of a panel that
 * sticks out of the panel. Boxes that deliberately cut their text short (an ellipsis) are skipped.
 */
export const misfits = (page) =>
  page.evaluate(() => {
    const out = [];
    const shown = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden && r.width > 0 && r.height > 0;
    };
    const name = (el) => `${el.className || el.tagName} "${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 40)}"`;
    const boxes = '.map-tooltip, .target-chip, .stat, .chip, .btn, .toast, .option, .verdict, .hint, .target-info, .target-reward, .turn-chip, .progress-caption, .progress-label, .tug-name, .country-row, .filter, .mode';
    for (const el of document.querySelectorAll(boxes)) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline') continue;
      if (cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} is ${el.scrollWidth - el.clientWidth}px too wide for its box`);
      if (cs.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 3) out.push(`${name(el)} is ${el.scrollHeight - el.clientHeight}px too tall for its box`);
    }
    const inside = [
      ['.tug', '.tug-side, .tug-track, .tug-count, .tug-name'],
      ['.progress', '.progress-title, .progress-label, .progress-caption, .progress-track'],
      ['.topbar', '.stat, .brand, .turn-chip, .quit, .quit-confirm'],
      ['.card', '.card-head > *, .card-foot > *, .options > *, .target, .target > *, .prompt, .lead'],
      ['.toast', '.toast > *'],
      ['.map-tooltip', '.map-tooltip > *'],
    ];
    for (const [outer, inner] of inside) {
      for (const box of document.querySelectorAll(outer)) {
        if (!shown(box)) continue;
        const b = box.getBoundingClientRect();
        for (const el of box.querySelectorAll(inner)) {
          if (!shown(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) out.push(`${name(el)} sticks out of ${outer}`);
        }
      }
    }
    // Nothing may run off the screen either.
    for (const el of document.querySelectorAll('.map-tooltip, .toast, .topbar, .tug, .progress, .card')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) out.push(`${name(el)} runs off the screen`);
    }
    return [...new Set(out)];
  });

/** Where the map sits in the view: its edges in CSS px and the zoom shown in the corner. */
export const mapEdges = (page) =>
  page.evaluate(() => {
    const [, tx, ty, s] = /translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)/.exec(document.querySelector('.map-hit g').getAttribute('transform')).map(Number);
    const box = document.querySelector('.map').getBoundingClientRect();
    return { left: tx, top: ty, right: tx + 2048 * s, bottom: ty + 1024 * s, width: box.width, height: box.height, zoom: parseFloat(document.querySelector('.zoom-level').textContent) };
  });

/** Picks a campaign and a starting country. The game opens with its one recruit phase. */
export async function startGame(page, mode, id) {
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId('search').fill('');
  await page.getByTestId(`start-${id}`).click();
  await page.getByTestId('begin').click();
  await page.getByTestId('question-card').waitFor();
}

/** Plays out the opening recruit phase with the given pattern of right/wrong answers. */
export async function recruit(page, pattern = [true, true, true, true, true]) {
  for (const correct of pattern) await answer(page, correct);
  await page.getByTestId('attack-panel').waitFor();
}

/**
 * With a target picked, presses whichever button the panel offers: Attack, which opens a battle, or
 * DECIMATE (when a 15 streak has earned one), which takes the country outright. Returns which it was.
 */
export async function strike(page) {
  await page.getByTestId('target-card').waitFor();
  if ((await page.getByTestId('decimate-button').count()) > 0) {
    const before = (await state(page)).owned.length;
    // The DECIMATE button never stops pulsing, so it is clicked without waiting for it to hold still.
    await page.getByTestId('decimate-button').click({ force: true });
    await page.waitForFunction((n) => window.__atlas.state.owned.length > n, before, { timeout: 8000 });
    return 'decimated';
  }
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  return 'battle';
}

/** Picks a target from the list and attacks it (or decimates it, if a DECIMATE is ready). */
export async function attack(page, id) {
  await page.getByTestId(`target-${id}`).click();
  return strike(page);
}

/** Waits until the game has moved past the question with this signature (or on to the map). */
export const movedOn = (page, sig, timeout = 8000) =>
  page.waitForFunction(
    (sig) => {
      const s = window.__atlas.state;
      if (!s || s.feedback) return false;
      const q = s.phase === 'recruit' ? s.recruit.question : s.phase === 'battle' ? s.battle.question : null;
      return !q || q.sig !== sig;
    },
    sig,
    { timeout },
  );

/**
 * Answers the question on screen through the UI. Returns the state after the answer registered.
 * There is no Continue button: the game moves on by itself. By default this skips the wait with
 * the Enter key; with { wait: false } it returns while the answer feedback is still showing.
 */
export async function answer(page, correct, { wait = true } = {}) {
  const before = await state(page);
  const q = before.phase === 'recruit' ? before.recruit.question : before.battle.question;
  const index = correct ? q.correctIndex : (q.correctIndex + 1) % 4;
  await page.getByTestId(`option-${index}`).click();
  await page.getByTestId('verdict').waitFor();
  const after = await state(page);
  if (wait) {
    await page.keyboard.press('Enter');
    await movedOn(page, q.sig);
  }
  return after;
}

export function check(results, name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Finds a screen point that really is inside a country's shape (or on its marker). */
export async function pointOn(page, id) {
  return page.evaluate((id) => {
    const hit = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-id]')?.getAttribute('data-id') === id;
    const marker = document.querySelector(`.marker[data-id="${id}"] .marker-hit`);
    if (marker) {
      const r = marker.getBoundingClientRect();
      const p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      if (hit(p.x, p.y)) return p;
    }
    const el = document.querySelector(`path.country[data-id="${id}"]`);
    if (!el) return null;
    const shape = window.__atlas.data.geometry.byId[id];
    const m = el.getScreenCTM();
    const toScreen = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const c = toScreen(shape.cx, shape.cy);
    if (hit(c.x, c.y)) return c;
    const [[x0, y0], [x1, y1]] = shape.bounds;
    for (let n = 6; n <= 40; n += 6) {
      for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
        const p = toScreen(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n);
        if (p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight && hit(p.x, p.y)) return p;
      }
    }
    return null;
  }, id);
}

export async function clickCountry(page, id) {
  const p = await pointOn(page, id);
  if (!p) throw new Error(`no clickable point found on ${id}`);
  await page.mouse.click(p.x, p.y);
  return p;
}

/** Waits for the camera to stop moving. */
export async function settle(page, ms = 1100) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.querySelector('.map-hit g').getAttribute('transform'));
    if (t === last) return;
    last = t;
    await page.waitForTimeout(ms / 6);
  }
}

export async function hud(page) {
  return page.evaluate(() => {
    const v = (id) => Number(document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-value'));
    return {
      lives: v('lives'),
      streak: v('streak'),
      troops: v('troops'),
      countries: v('countries'),
      phase: document.querySelector('[data-testid="phase-chip"]')?.textContent,
    };
  });
}

export const classOf = (page, id) =>
  page.evaluate((id) => document.querySelector(`path.country[data-id="${id}"]`)?.getAttribute('class') ?? '', id);

export async function open(page) {
  await page.goto(BASE);
  await page.getByTestId('start-screen').waitFor({ timeout: 20000 });
}

/** Fights the current battle to its end, answering every question the same way. */
export async function fight(page, correct) {
  for (let i = 0; i < 80; i++) {
    const s = await state(page);
    if (s.phase !== 'battle') return s;
    await answer(page, correct);
  }
  throw new Error('battle did not end');
}

/**
 * Reads the colour the map has drawn at a point inside a country: `base` is terrain + tints + borders,
 * `fx` is highlights and markers. Returns [r, g, b, a].
 */
export async function sample(page, id, layer = 'base') {
  const p = await pointOn(page, id);
  if (!p) throw new Error(`no point on ${id}`);
  return page.evaluate(({ p, layer }) => {
    const canvas = document.querySelector(`.pixel-${layer}`);
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((p.x - r.left) / r.width) * canvas.width);
    const y = Math.floor(((p.y - r.top) / r.height) * canvas.height);
    // Read from a copy, so the game's own canvas is left alone.
    const copy = document.createElement('canvas');
    copy.width = copy.height = 1;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, x, y, 1, 1, 0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, { p, layer });
}

/** Counts map pixels of exactly this colour on a layer: hard-edged pixel lines have no in-between shades. */
export function countPixels(page, layer, [r, g, b, a = 255]) {
  return page.evaluate(({ layer, r, g, b, a }) => {
    const canvas = document.querySelector(`.pixel-${layer}`);
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b && d[i + 3] === a) n++;
    return n;
  }, { layer, r, g, b, a });
}

export const sounds = (page) => page.evaluate(() => window.__atlas.sounds.map((s) => ({ name: s.name, hz: Math.round(s.hz), text: s.text })));
/** The last sound that was not just the pointer passing over something. */
export const lastSound = async (page) => (await sounds(page)).filter((s) => s.name !== 'pulse').at(-1)?.name;
/** Forgets the sounds heard so far. */
export const hush = (page) => page.evaluate(() => { window.__atlas.sounds.length = 0; });
export const isGreen = ([r, g, b]) => g > r + 25 && g > b + 25;
