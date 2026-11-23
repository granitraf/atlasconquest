// Responsiveness: phone-sized, touch-only runs (portrait, landscape, small), plus the terrain fallback.
import { launch, BASE, SHOTS, check, open, state, pointOn, settle, movedOn, misfits, mapEdges } from './lib.mjs';
const results = [];

async function noOverflow(page, label) {
  const o = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.top-dock *, .dock *, .start *, .end *, .tug-dock *, .progress, .zoom-controls')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('.target-list, .country-list')) continue; // scroll containers
      // The start panel is a scroll container: its content may run below the fold, but never off the sides.
      const scrolls = el.closest('.start') && !el.closest('.start-foot');
      if (r.right > innerWidth + 1 || r.left < -1 || (!scrolls && (r.bottom > innerHeight + 1 || r.top < -1))) bad.push(`${el.className || el.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    return { bad: bad.slice(0, 4), scrollW: document.documentElement.scrollWidth, w: innerWidth };
  });
  check(results, `${label}: nothing overflows the screen`, o.bad.length === 0 && o.scrollW <= o.w, JSON.stringify(o));
  const tight = await misfits(page);
  check(results, `${label}: every text fits its box`, tight.length === 0, tight.slice(0, 4).join(' ; '));
}

async function phone(viewport, tag) {
  const { browser, context, page, problems, board } = await launch({ viewport, touch: true, mobile: true, dpr: 2 });
  // Runs already on the leaderboard, one of them under the longest name the game allows.
  for (const [name, score] of [['Greatest Kingdom', 687], ['Bravo', 36.5], ['Charlie', 30], ['Delta', 24], ['Echo', 12]]) board.add('World', name, score);
  board.add('Europe', 'Solo', 3);
  await open(page);
  await noOverflow(page, `${tag} start screen`);
  const begin = await page.getByTestId('begin').boundingBox();
  check(results, `${tag}: the Begin button is always on screen`, begin.y >= 0 && begin.y + begin.height <= viewport.height, `bottom at ${Math.round(begin.y + begin.height)} of ${viewport.height}`);
  await page.screenshot({ path: SHOTS + `60-${tag}-start.png` });
  const title = await page.evaluate(() => {
    const word = document.querySelector('.start-head h1 span').getBoundingClientRect();
    const logo = document.querySelector('.start-head h1 [data-testid="logo"]').getBoundingClientRect();
    return { right: logo.right, left: logo.left, wordRight: word.right, sameLine: logo.top < word.bottom && logo.bottom > word.top, w: innerWidth };
  });
  check(results, `${tag}: the title and its logo share one line and fit the screen`, title.sameLine && title.left >= title.wordRight && title.right <= title.w - 8, JSON.stringify(title));
  // The start panel covers the map on a phone, so the rules open from a button in its header and fill the screen.
  check(results, `${tag}: the Rules button is in the menu header (the one above the map is hidden)`, (await page.getByTestId('rules-open').isVisible()) && !(await page.getByTestId('rules-toggle').isVisible()));
  await page.getByTestId('rules-open').tap();
  await page.getByTestId('rules').waitFor();
  const sheet = await page.evaluate(() => {
    const rules = document.querySelector('.rules');
    const r = rules.getBoundingClientRect();
    const wide = [...rules.querySelectorAll('.rule, .rule-country, .rule-chips li, .ladder li, .rules-hero, .rule-formula, .rule-callout')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => `${el.className} "${el.innerText.slice(0, 24)}"`);
    const back = document.querySelector('[data-testid="rules-toggle"]').getBoundingClientRect();
    return { full: r.left === 0 && r.top === 0 && r.right === innerWidth && r.bottom === innerHeight, sideways: rules.scrollWidth > rules.clientWidth + 1, wide, backOnScreen: back.left >= 0 && back.right <= innerWidth && back.top >= 0, onTop: Boolean(document.elementFromPoint(innerWidth / 2, innerHeight * 0.6)?.closest('.rules')) };
  });
  check(results, `${tag}: the rules fill the screen and nothing in them is too wide`, sheet.full && sheet.onTop && !sheet.sideways && sheet.wide.length === 0 && sheet.backOnScreen, JSON.stringify(sheet));
  await page.screenshot({ path: SHOTS + `60-${tag}-rules.png` });
  await page.getByTestId('rules').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  check(results, `${tag}: the rules end with the credit`, /Created by Granit Raf/i.test(await page.getByTestId('rules-credit').innerText()) && (await page.getByTestId('rules-credit').isVisible()));
  await page.getByTestId('rules-toggle').tap();
  check(results, `${tag}: Back to the map returns to the menu`, (await page.getByTestId('rules').count()) === 0 && (await page.getByTestId('begin').isVisible()));
  // The leaderboard opens the same way, from a button beside Rules in the menu header.
  const doors = await page.evaluate(() => { const a = document.querySelector('[data-testid="rules-open"]').getBoundingClientRect(); const b = document.querySelector('[data-testid="leaderboard-open"]').getBoundingClientRect(); return { rightOf: b.left >= a.right, sameLine: Math.abs(a.top - b.top) < 2, onScreen: b.right <= innerWidth }; });
  check(results, `${tag}: a Leaderboard button sits to the right of Rules in the menu header`, (await page.getByTestId('leaderboard-open').isVisible()) && doors.rightOf && doors.sameLine && doors.onScreen && !(await page.getByTestId('leaderboard-toggle').isVisible()), JSON.stringify(doors));
  await page.getByTestId('leaderboard-open').tap();
  await page.locator('[data-testid="leaderboard"][data-status="ready"]').waitFor();
  const hall = await page.evaluate(() => {
    const el = document.querySelector('.leaderboard');
    const r = el.getBoundingClientRect();
    const back = document.querySelector('[data-testid="leaderboard-toggle"]').getBoundingClientRect();
    return { full: r.left === 0 && r.top === 0 && r.right === innerWidth && r.bottom === innerHeight, sideways: el.scrollWidth > el.clientWidth + 1, wide: [...el.querySelectorAll('.board-row, .board-card, .board-card h2, .rules-hero')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className), cards: el.querySelectorAll('.board-card').length, rows: el.querySelectorAll('.board-row').length, back: back.left >= 0 && back.right <= innerWidth && back.top >= 0, rulesButtonHidden: getComputedStyle(document.querySelector('[data-testid="rules-toggle"]')).display === 'none' };
  });
  check(results, `${tag}: the leaderboard fills the screen, nothing in it is too wide, and the way back is on screen`, hall.full && !hall.sideways && hall.wide.length === 0 && hall.cards === 7 && hall.rows === 6 && hall.back && hall.rulesButtonHidden, JSON.stringify(hall));
  await page.screenshot({ path: SHOTS + `61-${tag}-leaderboard.png` });
  await page.getByTestId('leaderboard-toggle').tap();
  check(results, `${tag}: Back to the map returns from the leaderboard to the menu`, (await page.getByTestId('leaderboard').count()) === 0 && (await page.getByTestId('begin').isVisible()));
  await page.getByTestId('search').fill('germ');
  await page.getByTestId('start-DEU').tap();
  await page.getByTestId('begin').tap();
  await page.getByTestId('question-card').waitFor();
  await settle(page);
  await noOverflow(page, `${tag} recruit`);
  await page.screenshot({ path: SHOTS + `61-${tag}-recruit.png` });
  // Answer by tapping. Nothing else to tap: each next question arrives by itself.
  for (let i = 0; i < 5; i++) {
    const s = await state(page);
    await page.getByTestId(`option-${s.recruit.question.correctIndex}`).tap();
    await page.getByTestId('verdict').waitFor();
    await movedOn(page, s.recruit.question.sig);
  }
  await page.getByTestId('attack-panel').waitFor();
  check(results, `${tag}: the attack panel has no End turn button`, (await page.getByTestId('end-turn').count()) === 0);
  await settle(page);
  await noOverflow(page, `${tag} attack phase`);
  await page.screenshot({ path: SHOTS + `62-${tag}-attack.png` });

  // Pinch zoom with two real touch points.
  const cdp = await context.newCDPSession(page);
  const zoomLevel = async () => parseFloat(await page.locator('.zoom-level').innerText());
  const z0 = await zoomLevel();
  const cx = viewport.width / 2, cy = viewport.height * 0.3;
  const touch = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
  await touch('touchStart', 30);
  for (let d = 40; d <= 120; d += 10) { await touch('touchMove', d); await page.waitForTimeout(16); }
  await touch('touchEnd', 0);
  await page.waitForTimeout(200);
  const z1 = await zoomLevel();
  check(results, `${tag}: pinch zooms in`, z1 > z0 * 1.5, `${z0}x -> ${z1}x`);
  await touch('touchStart', 120);
  for (let d = 110; d >= 30; d -= 10) { await touch('touchMove', d); await page.waitForTimeout(16); }
  await touch('touchEnd', 0);
  await page.waitForTimeout(200);
  const z2 = await zoomLevel();
  check(results, `${tag}: pinch zooms out`, z2 < z1 * 0.7, `${z1}x -> ${z2}x`);

  // One-finger drag pans.
  const tr = () => page.evaluate(() => document.querySelector('.map-hit g').getAttribute('transform'));
  const before = await tr();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - i * 12, y: cy + i * 6, id: 1 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  check(results, `${tag}: one-finger drag pans`, (await tr()) !== before);

  // Tap a target on the map (after re-framing with the + / reset buttons available on touch too).
  await page.getByLabel('Show whole world').tap();
  await settle(page);
  await page.getByLabel('Zoom in').tap(); await page.waitForTimeout(300);
  check(results, `${tag}: + button works on touch`, (await zoomLevel()) > 1);
  // Bring France into view via its chip, then tap the country itself.
  await page.getByTestId('target-FRA').tap();
  await settle(page);
  await page.getByTestId('target-card').waitFor();
  await page.getByText('Cancel').tap();
  await settle(page);
  const p = await pointOn(page, 'POL');
  if (p) {
    await page.touchscreen.tap(p.x, p.y);
    await page.getByTestId('target-card').waitFor({ timeout: 3000 }).catch(() => {});
    const card = (await page.getByTestId('target-card').count()) ? await page.getByTestId('target-card').innerText() : '';
    check(results, `${tag}: tapping a country on the map selects it`, /Poland/.test(card), card.replace(/\n/g, ' '));
    const tipShown = await page.locator('.map-tooltip').isVisible();
    check(results, `${tag}: a tap names the country (no hover on touch)`, tipShown && /Poland/.test(await page.locator('.map-tooltip').innerText()));
  } else check(results, `${tag}: Poland visible to tap`, false, 'not on screen');
  await noOverflow(page, `${tag} target selected`);
  await page.screenshot({ path: SHOTS + `63-${tag}-target.png` });
  await page.getByTestId('attack-button').tap();
  await page.getByTestId('question-card').waitFor();
  await settle(page, 1500);
  await noOverflow(page, `${tag} battle`);
  const frame = await page.evaluate(() => {
    const shape = window.__atlas.data.geometry.byId.POL;
    const m = document.querySelector('path.country[data-id="POL"]').getScreenCTM();
    const [[x0, y0], [x1, y1]] = shape.bounds;
    const card = document.querySelector('[data-testid="question-card"]').getBoundingClientRect();
    const tug = document.querySelector('.tug').getBoundingClientRect();
    // On a short screen the side bar steps aside altogether.
    const bar = document.querySelector('.progress')?.getBoundingClientRect() ?? { right: 0 };
    return { left: m.a * x0 + m.e, right: m.a * x1 + m.e, top: m.d * y0 + m.f, bottom: m.d * y1 + m.f, cardTop: card.top, tugBottom: tug.bottom, barRight: bar.right, w: innerWidth };
  });
  check(results, `${tag}: country under attack is not covered by the card, HUD or side bar`, frame.top >= frame.tugBottom && frame.bottom <= frame.cardTop && frame.left >= frame.barRight && frame.right <= frame.w, JSON.stringify(Object.fromEntries(Object.entries(frame).map(([k, v]) => [k, Math.round(v)]))));
  await page.screenshot({ path: SHOTS + `64-${tag}-battle.png` });
  const s = await state(page);
  await page.getByTestId(`option-${(s.battle.question.correctIndex + 1) % 4}`).tap();
  await page.getByTestId('verdict').waitFor();
  await page.waitForTimeout(350);
  await noOverflow(page, `${tag} battle feedback`);
  await page.screenshot({ path: SHOTS + `65-${tag}-battle-wrong.png` });
  // No Continue button to tap: the game moves on to the next question by itself.
  check(results, `${tag}: there is no Continue button`, (await page.getByTestId('continue').count()) === 0 && (await page.locator('.card-foot button').count()) === 0);
  await movedOn(page, s.battle.question.sig);
  const next = await state(page);
  check(results, `${tag}: the next question arrives by itself`, next.phase === 'battle' && next.battle.question.sig !== s.battle.question.sig && (await page.getByTestId('retreat').count()) === 1);
  await noOverflow(page, `${tag} next question`);
  check(results, `${tag}: no console errors or failed requests`, problems.length === 0, problems.slice(0, 4).join(' ; '));
  await browser.close();
}

await phone({ width: 390, height: 844 }, 'phone');
await phone({ width: 844, height: 390 }, 'landscape');
await phone({ width: 360, height: 640 }, 'small');

// Terrain fallback, forced.
{
  const { browser, page, problems } = await launch();
  await page.goto(BASE + '?terrain=procedural');
  await page.getByTestId('start-screen').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.map').dataset.terrainWidth);
  const kind = await page.evaluate(() => [document.querySelector('.app').dataset.terrain, document.querySelector('.map').dataset.terrainWidth]);
  check(results, 'procedural terrain: generated from the land shapes as a 2048-wide texture', kind[0] === 'procedural' && kind[1] === '2048', kind.join(', '));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + '70-procedural-terrain.png' });
  check(results, 'procedural terrain: no console errors', problems.length === 0, problems.join(' ; '));
  await browser.close();
}
// Terrain fallback when the image genuinely fails to load.
{
  const { browser, page } = await launch();
  await page.route('**/data/terrain.png', (route) => route.abort());
  await page.goto(BASE);
  await page.getByTestId('start-screen').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.map').dataset.terrainWidth);
  check(results, 'if the Blue Marble image fails to load, the game falls back to procedural terrain', (await page.evaluate(() => document.querySelector('.app').dataset.terrain)) === 'procedural');
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
  check(results, 'no broken images after the fallback', broken === 0);
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length ? 1 : 0);
