// Checklist 2-7: the game itself, played through the real UI in Chrome.
// Run one section with: node e2e/game.mjs <section>
import { launch, SHOTS, check, open, startGame, recruit, attack, answer, movedOn, k, misfits, mapEdges, lastSound, hush, fight, state, hud, classOf, clickCountry, pointOn, settle, sample, countPixels, sounds, isGreen } from './lib.mjs';

const results = [];
const allProblems = [];
const only = process.argv[2];
const sections = {};
const section = (name, fn) => (sections[name] = fn);

const REWARD = { easy: 1, medium: 2, hard: 3 };

// ---------------------------------------------------------------- 2 + 3 + 4
section('germany', async (page) => {
  await open(page);
  await startGame(page, 'World', 'DEU');
  let h = await hud(page);
  check(results, 'Germany start: 10 troops, 1 life, 1/230 countries', h.troops === 10 && h.lives === 1 && h.countries === 1, JSON.stringify(h));
  check(results, 'troops are counted in thousands: the army reads 10,000', (await page.getByTestId('troops').innerText()).replace(/\s+/g, ' ').startsWith('10,000'), await page.getByTestId('troops').innerText());
  check(results, 'recruit rewards read in thousands too', /\+1,000 troops/.test(await page.getByTestId('difficulty').innerText()), await page.getByTestId('difficulty').innerText());
  check(results, 'recruit question: every text fits its box', (await misfits(page)).length === 0, (await misfits(page)).join(' ; '));
  const lives = page.getByTestId('lives');
  check(results, 'lives show as a single hardcore heart labelled "1 heart"', (await lives.locator('svg.heart').count()) === 1 && /1 heart/i.test(await lives.innerText()), await lives.innerText());
  let s = await state(page);
  check(results, 'the game opens with the recruit phase', s.phase === 'recruit' && s.recruit.index === 0 && /Recruit/i.test(h.phase), `${s.phase}, "${h.phase}"`);
  check(results, 'no attackable highlights during the recruit phase', (await page.locator('path.country.s-land, path.country.s-sea').count()) === 0 && (await countPixels(page, 'fx', [255, 255, 255])) === 0);
  // While a question is open, hovering the map must not name any country.
  const tipOver = async (id) => {
    const p = await pointOn(page, id);
    if (!p) return null;
    await page.mouse.move(p.x + 1, p.y + 1);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(120);
    return (await page.locator('.map-tooltip').innerText()).replace(/\n/g, ' | ');
  };
  await settle(page);
  const recruitTips = [await tipOver('FRA'), await tipOver('POL'), await tipOver('DEU')];
  check(results, 'recruit phase: hovering the map names no country', recruitTips.every((t) => t && t.startsWith('???') && !/France|Poland|Germany/.test(t)), recruitTips.join(' ; '));
  check(results, 'recruit questions have no Retreat button', (await page.getByTestId('retreat').count()) === 0 && /one chance to recruit/i.test(await page.getByTestId('question-card').innerText()));

  // 3. The opening recruit phase adds the right number of troops; the fifth correct answer in a row is doubled.
  let expected = 10;
  const log = [];
  const ramp = [];
  for (let i = 0; i < 5; i++) {
    s = await state(page);
    const q = s.recruit.question;
    check(results, `recruit question ${i + 1} is about the starting country`, q.countryId === 'DEU' && q.options.length === 4, q.prompt);
    ramp.push(q.difficulty);
    if (i === 0) check(results, 'the recruit phase opens with the flag question', q.type === 'flag' && (await page.locator('.options.flags img.px-flag').count()) === 4, q.prompt);
    const mult = i === 4 ? 2 : 1;
    expected += REWARD[q.difficulty] * mult;
    await answer(page, true, { wait: false });
    h = await hud(page);
    log.push(`${q.difficulty}${mult > 1 ? ' x2' : ''} -> ${h.troops}`);
    check(results, `recruit answer ${i + 1} (${q.difficulty}) pays ${REWARD[q.difficulty] * mult}`, h.troops === expected && h.streak === i + 1, `HUD troops ${h.troops}, expected ${expected}, streak ${h.streak}`);
    if (i === 4) {
      const verdict = await page.getByTestId('verdict').innerText();
      check(results, '5th answer is announced as doubled', /×2 streak bonus/.test(verdict), verdict);
    }
    await page.keyboard.press('Enter');
    await movedOn(page, q.sig);
  }
  await page.getByTestId('attack-panel').waitFor();
  h = await hud(page);
  s = await state(page);
  check(results, 'a perfect recruit phase takes Germany from 10 to 20 troops', h.troops === expected && expected === 20, `${log.join(', ')}; total ${h.troops}`);
  // Germany is a famous country, so nothing about it scores Hard: the fifth slot falls back to Medium.
  check(results, 'recruit slots are filled by tier: easy, easy, medium, medium, then the nearest tier to hard', ramp.join(',') === 'easy,easy,medium,medium,medium', ramp.join(','));
  const recruitToast = (await page.locator('.toast').innerText()).replace(/\n/g, ' ');
  check(results, 'the end of recruiting is announced', /Recruited 10,000 troops/.test(recruitToast) && /only from conquests/i.test(recruitToast), recruitToast);

  // From here on there is no more recruiting and no turn to end.
  check(results, 'after recruiting the game is on the map, ready to attack', s.phase === 'attack' && s.recruit === null && s.battles === 0 && /Choose a target/i.test(h.phase), `${s.phase}, "${h.phase}"`);
  check(results, 'there is no End turn button', (await page.getByTestId('end-turn').count()) === 0 && (await page.getByTestId('attack-panel').locator('button', { hasText: /end turn/i }).count()) === 0);
  check(results, 'the panel says troops now come only from conquests', /only from\s+conquests/i.test(await page.getByTestId('attack-panel').innerText()));
  check(results, 'the top bar no longer shows a streak multiplier', (await page.getByTestId('streak-mult').count()) === 0 && !/×/.test(await page.getByTestId('streak').innerText()));

  // 2. Starting as Germany, France is attackable.
  await settle(page);
  check(results, 'France is attackable from Germany (map state)', (await classOf(page, 'FRA')).includes('s-land'), await classOf(page, 'FRA'));
  check(results, 'France is in the target list as a land target', (await page.getByTestId('target-FRA').getAttribute('data-kind')) === 'land');
  check(results, 'all 9 German neighbours are marked attackable', (await page.locator('path.country.s-land').count()) === 9, String(await page.locator('path.country.s-land').count()));
  const white = await countPixels(page, 'fx', [255, 255, 255]);
  check(results, 'attackable countries get a hard-edged white pixel outline', white > 300, `${white} pure white pixels`);
  // Attackable countries are marked by their thick white outline alone: no tint over the country, and nothing pulses.
  const still = [];
  for (let i = 0; i < 12; i++) { still.push(`${(await sample(page, 'FRA', 'fx')).join()}|${await countPixels(page, 'fx', [255, 255, 255])}`); await page.waitForTimeout(150); }
  check(results, 'attackable countries do not pulse: the white outline stays exactly as it is', new Set(still).size === 1 && still[0].startsWith('0,0,0,0|') && Number(still[0].split('|')[1]) === white, `${new Set(still).size} different frames over 1.8 s; inside France rgba(${still[0].split('|')[0]})`);
  const deu = await sample(page, 'DEU');
  check(results, 'Germany is tinted green', isGreen(deu), `rgb(${deu.slice(0, 3).join(', ')})`);
  // Your own outline is as thick as the white one around the countries you can attack.
  const lineWidth = (layer, rgb) => page.evaluate(({ layer, rgb }) => {
    const canvas = document.querySelector(`.pixel-${layer}`);
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const is = (x, y) => { const i = (y * copy.width + x) * 4; return d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2] && d[i + 3] === 255; };
    // Width of the line wherever it runs roughly up and down: the commonest short run of its colour along a row.
    const runs = {};
    let pixels = 0;
    for (let y = 0; y < copy.height; y++) {
      let run = 0;
      for (let x = 0; x <= copy.width; x++) {
        if (x < copy.width && is(x, y)) { run++; pixels++; } else { if (run > 0 && run <= 4) runs[run] = (runs[run] ?? 0) + 1; run = 0; }
      }
    }
    const width = Number(Object.entries(runs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
    return { width, pixels };
  }, { layer, rgb });
  const greenLine = await lineWidth('base', [120, 255, 180]);
  const whiteLine = await lineWidth('fx', [255, 255, 255]);
  check(results, 'the green outline of your territory is as thick as the white outline of attackable countries', greenLine.width === whiteLine.width && greenLine.width >= 2 && greenLine.pixels > 200, `green ${greenLine.width}px wide (${greenLine.pixels} pixels), white ${whiteLine.width}px wide`);
  check(results, 'France is not green yet', !isGreen(await sample(page, 'FRA')));
  check(results, 'Spain is not attackable by land yet', !(await classOf(page, 'ESP')).includes('s-land'), await classOf(page, 'ESP'));
  const fr = await pointOn(page, 'FRA');
  await page.mouse.move(fr.x, fr.y);
  await page.waitForTimeout(120);
  const tip = (await page.locator('.map-tooltip').innerText()).replace(/\n/g, ' | ');
  check(results, 'tooltip on France: name + attackable + 9,000 enemies', /France/.test(tip) && /by land/.test(tip) && /9,000 enemies/.test(tip) && !/defenders/i.test(tip), tip);
  // One colour code: enemies pink, troops gained green (and a sea crossing blue, further down).
  const tones = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.map-tooltip [class^="tone-"]')].map((el) => [el.className, `${getComputedStyle(el).color} ${el.textContent}`])));
  const PINK = 'rgb(255, 156, 159)', GREEN = 'rgb(61, 220, 132)', BLUE = 'rgb(212, 236, 255)', BROWN = 'rgb(194, 166, 122)';
  const landTones = await tones();
  check(results, 'in the tooltip the enemies are pink and the troops to gain are green', landTones['tone-enemy'] === `${PINK} 9,000 enemies` && landTones['tone-gain'] === `${GREEN} worth +2,250 troops`, JSON.stringify(landTones));
  await page.screenshot({ path: SHOTS + '20-germany-attack-phase.png' });

  // Clicking a non-attackable country does nothing harmful.
  await clickCountry(page, 'DEU');
  check(results, 'clicking own territory selects nothing', (await page.getByTestId('target-card').count()) === 0);

  // What each target is worth is shown before attacking: a quarter of its enemies.
  const chips = await page.evaluate(() => [...document.querySelectorAll('.target-chip')].map((c) => ({ id: c.getAttribute('data-testid').slice(7), defenders: Number(c.getAttribute('data-full')), reward: Number(c.getAttribute('data-reward')), text: c.innerText })));
  const worth = Object.fromEntries(chips.map((c) => [c.id, c.reward]));
  check(results, 'every target shows what its conquest is worth: France (9,000 enemies) +2,250, Luxembourg (3,000) +750', worth.FRA === 2.25 && worth.LUX === 0.75 && /9,000\s*\+2,250/.test(await page.getByTestId('target-FRA').innerText()) && /3,000\s*\+750/.test(await page.getByTestId('target-LUX').innerText()), `${await page.getByTestId('target-FRA').innerText()} ; ${await page.getByTestId('target-LUX').innerText()}`.replace(/\n/g, ' '));
  check(results, 'a conquest is worth exactly a quarter of the enemies, always a clean number', chips.length > 20 && chips.every((c) => c.reward === c.defenders / 4 && (c.reward * 1000) % 250 === 0 && c.text.includes(`+${k(c.reward)}`) && c.text.includes(k(c.defenders))), [...new Set(chips.map((c) => `${c.defenders}→${c.reward}`))].sort((a, b) => parseInt(a) - parseInt(b)).join(', '));
  // The longest tooltip there is: a sea crossing, with defenders, reward and timer.
  await page.getByLabel('Show whole world').click();
  await settle(page);
  const far = await tipOver('GBR');
  const tipBox = await page.evaluate(() => { const t = document.querySelector('.map-tooltip'); const r = t.getBoundingClientRect(); return { text: t.scrollWidth, box: t.clientWidth, left: r.left, right: r.right, w: innerWidth }; });
  check(results, 'a long tooltip (sea crossing, defenders, reward, timer) fits inside its box', /Sea crossing · [\d,]+ enemies · worth \+[\d,]+ troops · 10s timer/.test(far) && tipBox.text <= tipBox.box + 1 && tipBox.left >= 0 && tipBox.right <= tipBox.w, `${far} — text ${tipBox.text}px in a ${tipBox.box}px box`);
  const seaTones = await tones();
  check(results, 'in the tooltip "Sea crossing" is the light blue of the dashed outline', seaTones['tone-sea'] === `${BLUE} Sea crossing` && seaTones['tone-enemy']?.startsWith(PINK) && seaTones['tone-gain']?.startsWith(GREEN), JSON.stringify(seaTones));
  // Ships follow the water: from Germany the Atlantic shore is open as far as Morocco, but not the Mediterranean or the Black Sea.
  const bySea = await page.evaluate(() => [...document.querySelectorAll('.target-chip.sea')].map((c) => c.getAttribute('data-testid').slice(7)));
  check(results, 'from Germany you can sail to Britain, Sweden, Spain, Portugal and Morocco', ['GBR', 'SWE', 'FIN', 'ESP', 'PRT', 'MAR'].every((id) => bySea.includes(id)), `${bySea.length} by sea`);
  check(results, 'but not to Italy, Greece, Turkey or Ukraine: the Mediterranean and the Black Sea are closed to a North Sea power', ['ITA', 'GRC', 'TUR', 'UKR', 'ROU', 'TUN', 'HRV'].every((id) => !bySea.includes(id)), bySea.join(' '));
  const blocked = await tipOver('ITA');
  check(results, 'the tooltip on Italy says which sea is missing', /^Italy \| No sea route yet · take a coast on the Mediterranean first/.test(blocked), blocked);
  check(results, 'the legend keeps its light brown text', (await page.locator('.legend').evaluate((el) => getComputedStyle(el).color)) === BROWN);
  const gains = await page.evaluate(() => [...new Set([...document.querySelectorAll('.target-chip .chip-gain')].map((el) => getComputedStyle(el).color))]);
  const strengths = await page.evaluate(() => [...new Set([...document.querySelectorAll('.target-chip b')].map((el) => getComputedStyle(el).color))]);
  check(results, 'in the target list every enemy count is pink and every reward is green', gains.join() === GREEN && strengths.join() === PINK, `rewards ${gains.join()}; enemies ${strengths.join()}`);
  check(results, 'attack panel: every text fits its box', (await misfits(page)).length === 0, (await misfits(page)).join(' ; '));

  // The empty space under Antarctica can never be dragged into view, at any zoom; the top still behaves as before.
  const dragMap = async (dy) => {
    await page.mouse.move(700, 300);
    await page.mouse.down();
    await page.mouse.move(700, 300 + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const pinned = [];
  for (const zoomIns of [0, 1, 2, 4]) {
    await page.getByLabel('Show whole world').click();
    await settle(page);
    for (let i = 0; i < zoomIns; i++) { await page.getByLabel('Zoom in').click(); await page.waitForTimeout(350); }
    for (let i = 0; i < 6; i++) await dragMap(-260);
    const up = await mapEdges(page);
    for (let i = 0; i < 6; i++) await dragMap(260);
    const down = await mapEdges(page);
    pinned.push({ zoom: up.zoom, gapBelow: Math.round(up.height - up.bottom), topAfterDraggingDown: Math.round(down.top), moved: down.top !== up.top });
  }
  check(results, 'dragging the map up never shows empty space below it, at 1x or zoomed in', pinned.every((p) => p.gapBelow <= 0), JSON.stringify(pinned));
  check(results, 'dragging still pans (zoomed in), and the top edge stops at the top bar as before', pinned.slice(1).every((p) => p.moved && p.topAfterDraggingDown <= 70), JSON.stringify(pinned));
  check(results, 'zoom is untouched: still 1x to 40x in a game', pinned[0].zoom === 1 && (await (async () => { for (let i = 0; i < 14; i++) { await page.getByLabel('Zoom in').click(); await page.waitForTimeout(120); } const z = (await mapEdges(page)).zoom; await page.getByLabel('Show whole world').click(); await settle(page); return z; })()) === 40);
  await page.mouse.move(fr.x, fr.y);
  check(results, 'the map tooltip gives the reward too', /worth \+2,250 troops/.test(tip), tip);

  // 4. Winning a battle turns the country green and updates the attackable set.
  await clickCountry(page, 'FRA');
  await page.getByTestId('target-card').waitFor();
  check(results, 'clicking France on the map selects it as the target', /France/.test(await page.getByTestId('target-card').innerText()));
  const franceReward = page.getByTestId('target-reward');
  check(results, 'the target card gives the reward: "+2,250 troops upon victory", in green, and nothing about ratios', (await franceReward.getAttribute('data-troops')) === '2.25' && (await franceReward.innerText()).trim() === '+2,250 troops upon victory' && (await franceReward.locator('.gain').evaluate((el) => getComputedStyle(el).color)) === GREEN, await franceReward.innerText());
  const franceCard = (await page.getByTestId('target-card').innerText()).replace(/\n/g, ' ');
  check(results, 'the target card counts "9,000 enemies" in pink, and never says "defenders"', /9,000 enemies · land attack/.test(franceCard) && !/defenders|for every/i.test(franceCard) && (await page.locator('.target-info b.enemy').evaluate((el) => `${getComputedStyle(el).color} ${el.textContent.trim()}`)) === `${PINK} 9,000 enemies`, franceCard);
  const troopsBefore = (await hud(page)).troops;
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  s = await state(page);
  check(results, 'the top bar counts the battle', /Battle 1/i.test((await hud(page)).phase) && s.battles === 1, (await hud(page)).phase);
  const clock = page.getByTestId('timer');
  check(results, 'questions show a big 20 second countdown', (await clock.getAttribute('data-total')) === '20' && (await clock.boundingBox()).width >= 80, `${await clock.getAttribute('data-total')}s, ${Math.round((await clock.boundingBox()).width)}px wide`);
  check(results, 'France defends with 9 troops (67M people)', s.battle.defenders === 9 && s.battle.maxDefenders === 9);
  check(results, 'the battle opens with "which flag belongs to France"', s.battle.question.type === 'flag' && s.battle.question.countryId === 'FRA', s.battle.question.prompt);
  check(results, 'land battle questions get 20 seconds', (await page.getByTestId('timer').getAttribute('data-total')) === '20');
  const bar = await page.locator('.tug').boundingBox();
  const track = await page.locator('.tug-track').boundingBox();
  const side = await page.getByTestId('battle-progress').boundingBox();
  check(results, 'battle bars are large', bar.width >= 800 && track.height >= 34 && side.width >= 80, `tug ${Math.round(bar.width)}px wide with a ${Math.round(track.height)}px track; side bar ${Math.round(side.width)}px wide`);
  check(results, 'battle question: every text fits its box', (await misfits(page)).length === 0, (await misfits(page)).join(' ; '));
  check(results, 'the question card speaks in thousands', /defeats 1,000 enemies/.test(await page.getByTestId('difficulty').innerText()) && /−2,000 troops/.test(await page.getByTestId('question-card').innerText()), await page.getByTestId('difficulty').innerText());
  check(results, 'tug-of-war bar shows both army sizes', (await page.getByTestId('battle-troops').innerText()).startsWith(k(troopsBefore)) && (await page.getByTestId('battle-defenders').innerText()).startsWith('9,000'));
  check(results, 'battle progress bar is visible and starts empty', (await page.getByTestId('battle-progress').getAttribute('data-value')) === '0');

  // Camera: the country under attack must be on screen and not under the HUD or the question card.
  await settle(page, 1500);
  const frame = await page.evaluate(() => {
    const shape = window.__atlas.data.geometry.byId.FRA;
    const m = document.querySelector('path.country[data-id="FRA"]').getScreenCTM();
    const [[x0, y0], [x1, y1]] = shape.bounds;
    const card = document.querySelector('[data-testid="question-card"]').getBoundingClientRect();
    const tug = document.querySelector('.tug').getBoundingClientRect();
    return { left: m.a * x0 + m.e, right: m.a * x1 + m.e, top: m.d * y0 + m.f, bottom: m.d * y1 + m.f, cardTop: card.top, tugBottom: tug.bottom, w: innerWidth };
  });
  check(results, 'camera fits France between the HUD and the question card', frame.top >= frame.tugBottom && frame.bottom <= frame.cardTop && frame.left >= 0 && frame.right <= frame.w, JSON.stringify(Object.fromEntries(Object.entries(frame).map(([k, v]) => [k, Math.round(v)]))));
  check(results, 'camera zoomed in on the target', parseFloat(await page.locator('.zoom-level').innerText()) > 4, await page.locator('.zoom-level').innerText());
  // In battle the neighbours stay anonymous, so the map cannot answer "which country borders France".
  const battleTips = {};
  for (const id of ['ESP', 'ITA', 'BEL', 'CHE', 'DEU', 'GBR']) battleTips[id] = await tipOver(id);
  const seenTips = Object.values(battleTips).filter(Boolean);
  check(results, 'battle: hovering neighbouring countries (and your own) shows no names', seenTips.length >= 3 && seenTips.every((t) => t.startsWith('???') && !/Spain|Italy|Belgium|Switzerland|Germany|Kingdom/.test(t)), JSON.stringify(battleTips));
  check(results, 'battle: only the country under attack is named', /^France \| Under attack/.test(await tipOver('FRA')), await tipOver('FRA'));
  await page.mouse.move(5, 300);
  const reds = [];
  for (let i = 0; i < 8; i++) { reds.push(await sample(page, 'FRA', 'fx')); await page.waitForTimeout(120); }
  check(results, 'target is tinted red and pulsing', reds.every(([r, g, b, a]) => a > 0 && r > g + 60 && r > b + 60) && new Set(reds.map((c) => c[3])).size > 1, `alpha ${reds.map((c) => c[3]).join(', ')}`);
  await page.screenshot({ path: SHOTS + '21-battle-france.png' });

  // One correct answer: defender falls, bar fills.
  s = await state(page);
  const kills = s.battle.question.difficulty === 'hard' ? 2 : 1;
  const firstSig = s.battle.question.sig;
  const afterRight = await answer(page, true, { wait: false });
  const rightAt = Date.now();
  // While the answer feedback is up there is nothing to click: no Continue button, and Retreat is out of the way.
  const footButtons = await page.locator('.card-foot button').count();
  const flashed = await page.locator('.flash.good').count();
  check(results, `correct ${s.battle.question.difficulty} answer kills ${kills} defender(s)`, afterRight.battle.defenders === 9 - kills && afterRight.troops === troopsBefore);
  check(results, 'there is no Continue button, and no Retreat button under the pointer while feedback shows', footButtons === 0 && (await page.getByTestId('continue').count()) === 0, `${footButtons} buttons in the card footer`);
  check(results, 'green flash on a correct answer', flashed === 1);
  const filled = Number(await page.getByTestId('battle-progress').getAttribute('data-value'));
  check(results, 'progress bar fills as defenders are eliminated', filled > 0, `${filled}%`);
  await movedOn(page, firstSig);
  const rightWait = (Date.now() - rightAt) / 1000;
  check(results, 'after a correct answer the next question arrives by itself, in about a second', rightWait > 0.7 && rightWait < 2.5 && (await page.getByTestId('retreat').count()) === 1, `${rightWait.toFixed(1)}s`);
  check(results, 'the target flag joins the battle bar once the flag question is done', (await page.locator('.tug-name img.px-flag').count()) === 1);

  // One wrong answer: 2 troops lost, bar drops, correct answer shown, red flash.
  s = await state(page);
  const wrongQ = s.battle.question;
  const afterWrong = await answer(page, false, { wait: false });
  const wrongAt = Date.now();
  check(results, 'wrong answer kills 2 of the player troops, no defenders', afterWrong.troops === troopsBefore - 2 && afterWrong.battle.defenders === 9 - kills);
  const dropped = Number(await page.getByTestId('battle-progress').getAttribute('data-value'));
  check(results, 'progress bar drops visibly on a wrong answer', dropped < filled && (await page.locator('.progress.hit').count()) === 1, `${filled}% -> ${dropped}%`);
  const verdict = await page.getByTestId('verdict').innerText();
  check(results, 'wrong answer shows the correct answer', verdict.includes(wrongQ.options[wrongQ.correctIndex].label) && /Wrong/.test(verdict), verdict);
  check(results, 'the loss reads in thousands, on the card and on the battle bar', /You lost 2,000 troops/.test(verdict) && /−2,000/.test(await page.getByTestId('battle-troops').innerText()), `${verdict} ; ${(await page.getByTestId('battle-troops').innerText()).replace(/\n/g, ' ')}`);
  check(results, 'answer feedback: every text fits its box', (await misfits(page)).length === 0, (await misfits(page)).join(' ; '));
  check(results, 'red flash on a wrong answer', (await page.locator('.flash.bad').count()) === 1);
  check(results, 'streak resets to 0 on a wrong answer', (await hud(page)).streak === 0);
  check(results, 'a wrong answer plays the wrong sound', (await lastSound(page)) === 'wrong');
  await page.screenshot({ path: SHOTS + '22-battle-wrong-answer.png' });
  await movedOn(page, wrongQ.sig);
  const wrongWait = (Date.now() - wrongAt) / 1000;
  check(results, 'after a wrong answer the correct one stays up for about 3 seconds, then the game moves on by itself', wrongWait > 2.4 && wrongWait < 4.5, `${wrongWait.toFixed(1)}s`);

  // Finish it.
  const sigs = new Set();
  let hardSeen = false;
  for (let i = 0; i < 40; i++) {
    s = await state(page);
    if (s.phase !== 'battle') break;
    hardSeen ||= s.battle.question.difficulty !== 'easy';
    if (s.battle.question.difficulty === 'hard') throw new Error('a famous country produced a Hard question');
    if ((await page.getByTestId('difficulty').getAttribute('data-value')) !== s.battle.question.difficulty) throw new Error('tier label does not match the question');
    check(results, `battle question ${s.battle.asked.length + 1} is about France and not a repeat`, s.battle.question.countryId === 'FRA' && !sigs.has(s.battle.question.sig) && !s.battle.asked.includes(s.battle.question.sig), s.battle.question.prompt);
    sigs.add(s.battle.question.sig);
    await answer(page, true);
  }
  await page.getByTestId('attack-panel').waitFor();
  await page.waitForTimeout(400);
  s = await state(page);
  h = await hud(page);
  check(results, 'winning the battle: France is now owned', s.owned.includes('FRA') && h.countries === 2, `owned ${s.owned.join(',')}`);
  check(results, 'the conquest plays its fanfare', (await lastSound(page)) === 'conquer');
  await page.waitForTimeout(1700);
  const fra = await sample(page, 'FRA');
  check(results, 'France turns green on the map', (await classOf(page, 'FRA')).includes('s-owned') && isGreen(fra), `rgb(${fra.slice(0, 3).join(', ')})`);
  const difficulties = [...sigs].length;
  check(results, 'later battle questions were harder than the opening ones, and each showed its tier', difficulties > 0 && hardSeen, `${difficulties} more questions`);
  check(results, 'attackable set updates: Spain, Italy, Andorra, Monaco now glow', (await Promise.all(['ESP', 'ITA', 'AND', 'MCO'].map((id) => classOf(page, id)))).every((c) => c.includes('s-land')));
  check(results, 'France is no longer a target', (await page.getByTestId('target-FRA').count()) === 0);
  check(results, 'battle HUD is hidden outside battle', (await page.getByTestId('battle-progress').count()) === 0 && (await page.locator('.tug').count()) === 0);
  check(results, 'winning cost the 2,000 troops from the wrong answer and brought the 2,250 that France was worth', h.lives === 1 && h.troops === troopsBefore - 2 + 2.25 && s.lastEvent.troopsGained === 2.25 && (await page.getByTestId('troops').innerText()).replace(/\s+/g, ' ').startsWith(k(troopsBefore + 0.25)), JSON.stringify(h));
  const franceToast = (await page.locator('.toast').innerText()).replace(/\n/g, ' ');
  check(results, 'toast announces the conquest and the troops it brought', /France conquered/.test(franceToast) && /\+2,250 troops join/.test(franceToast), franceToast);
  const heard = (await sounds(page)).filter((x) => x.name === 'correct' || x.name === 'wrong');
  const run = heard.slice(heard.map((x) => x.name).lastIndexOf('wrong') + 1).map((x) => x.hz);
  check(results, 'the correct-answer sound rises in pitch with the streak', run.length >= 5 && run.slice(0, 6).every((hz, i) => i === 0 || hz > run[i - 1]), run.join(' < ') + ' Hz');
  await settle(page);
  await page.screenshot({ path: SHOTS + '23-france-conquered.png' });

  // A small country is worth less: Luxembourg has 3,000 enemies, +750.
  const beforeLux = (await hud(page)).troops;
  await page.getByTestId('target-LUX').click();
  check(results, 'Luxembourg\'s card promises +750 troops', (await page.getByTestId('target-reward').getAttribute('data-troops')) === '0.75' && /\+750 troops upon victory/.test(await page.getByTestId('target-reward').innerText()), await page.getByTestId('target-reward').innerText());
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  s = await state(page);
  const luxLast = s.battle.defenders;
  for (let i = 0; i < 6 && (s = await state(page)).phase === 'battle'; i++) {
    const winning = s.battle.defenders <= (s.battle.question.difficulty === 'hard' ? 2 : 1);
    if (!winning) { await answer(page, true); continue; }
    await answer(page, true, { wait: false });
    const won = (await page.getByTestId('verdict').innerText()).replace(/\n/g, ' ');
    check(results, 'the winning answer says what the conquest brought', /Luxembourg has fallen: \+750 troops/.test(won), won);
    check(results, 'the troops arrive when the country changes hands, not before', (await hud(page)).troops === beforeLux);
    await movedOn(page, s.battle.question.sig);
  }
  await page.getByTestId('attack-panel').waitFor();
  h = await hud(page);
  const luxToast = (await page.locator('.toast').innerText()).replace(/\n/g, ' ');
  check(results, 'conquering Luxembourg (3,000 enemies) adds exactly 750 troops', h.troops === beforeLux + 0.75 && h.countries === 3 && luxLast === 3, `${beforeLux} -> ${h.troops}`);
  check(results, 'the toast announces the new troop', /Luxembourg conquered/.test(luxToast) && /\+750 troops join/.test(luxToast), luxToast);

  // Straight on to the next attack; retreat costs no life but resets the streak.
  await attack(page, 'ESP');
  // With the question card open the map still cannot be pulled up past its bottom edge.
  await settle(page, 1500);
  for (let i = 0; i < 8; i++) await dragMap(-240);
  const inBattle = await mapEdges(page);
  check(results, 'in a battle too, no empty space can be dragged in below the map', inBattle.bottom >= inBattle.height - 0.5 && inBattle.zoom > 2, `map bottom ${Math.round(inBattle.bottom)} of ${inBattle.height} at ${inBattle.zoom}x`);
  await answer(page, true);
  const beforeRetreat = await hud(page);
  const battle = (await state(page)).battle;
  const quarter = Math.ceil(beforeRetreat.troops * 0.25);
  const price = await page.getByTestId('retreat').getAttribute('data-cost');
  check(results, 'the Retreat button shows what it will cost: a quarter of the army', Number(price) === quarter && (await page.getByTestId('retreat').innerText()).includes(`−${k(quarter)}`), `${await page.getByTestId('retreat').innerText()} with ${beforeRetreat.troops} troops`);
  await page.getByTestId('retreat').click();
  await page.getByTestId('attack-panel').waitFor();
  h = await hud(page);
  s = await state(page);
  check(results, 'retreat: a quarter of the troops lost, streak reset, still alive, country not taken', h.lives === 1 && h.troops === beforeRetreat.troops - quarter && beforeRetreat.streak > 0 && h.streak === 0 && !s.owned.includes('ESP'), `before ${JSON.stringify(beforeRetreat)} after ${JSON.stringify(h)}`);
  check(results, 'the retreat and its cost are announced', new RegExp(`cost ${k(quarter)} troops`).test(await page.locator('.toast').innerText()), (await page.locator('.toast').innerText()).replace(/\n/g, ' '));
  // Spain stays wounded: the defender beaten before the retreat is still down.
  const chip = page.getByTestId('target-ESP');
  check(results, 'the country retreated from stays wounded', s.wounds.ESP === battle.maxDefenders - battle.defenders && (await chip.getAttribute('data-standing')) === String(battle.defenders) && (await chip.getAttribute('data-full')) === String(battle.maxDefenders), `Spain ${await chip.getAttribute('data-standing')}/${await chip.getAttribute('data-full')}`);
  await chip.click();
  check(results, 'the target card explains the wound', /wounded/.test(await page.getByTestId('target-card').innerText()), (await page.getByTestId('target-card').innerText()).replace(/\n/g, ' '));
  await page.getByText('Cancel').click();

  // Wounds heal while the army is busy elsewhere: attacking another country gives Spain 2 defenders back.
  const wound = s.wounds.ESP;
  await attack(page, 'ESP');
  s = await state(page);
  check(results, 'going straight back in meets only the defenders left standing', s.battle.defenders === battle.defenders && s.wounds.ESP === wound, `${s.battle.defenders} of ${s.battle.maxDefenders}`);
  await page.getByTestId('retreat').click();
  await page.getByTestId('attack-panel').waitFor();
  await attack(page, 'ITA');
  s = await state(page);
  check(results, 'a wounded country wins back up to 2 defenders each time you attack elsewhere', (s.wounds.ESP ?? 0) === Math.max(0, wound - 2), JSON.stringify(s.wounds));
  check(results, 'five attacks launched so far, counted in the top bar', s.battles === 5 && /Battle 5/i.test((await hud(page)).phase), `${s.battles}, ${(await hud(page)).phase}`);
  check(results, 'the recruit phase never comes back', s.recruit === null && s.phase === 'battle');
});

// ------------------------------------------------------------------------ 5
section('defeat', async (page) => {
  await open(page);
  await startGame(page, 'World', 'DEU');
  await recruit(page, [false, false, false, false, false]);
  let h = await hud(page);
  check(results, 'an all-wrong recruit phase earns nothing: 10 troops to attack with', h.troops === 10 && h.streak === 0, JSON.stringify(h));
  await attack(page, 'LUX');
  // Let the first question run out of time: that is a wrong answer too.
  const t0 = Date.now();
  await page.getByTestId('verdict').waitFor({ timeout: 26000 });
  const waited = (Date.now() - t0) / 1000;
  let s0 = await state(page);
  check(results, 'a question times out after ~20 seconds and counts as wrong', waited > 18 && waited < 22.5 && s0.feedback.timedOut && !s0.feedback.correct && s0.troops === 8, `${waited.toFixed(1)}s, "${await page.getByTestId('verdict').innerText()}"`);
  const ticks = (await sounds(page)).filter((x) => x.name === 'tick').map((x) => x.hz);
  check(results, 'a clock ticks through the last 5 seconds of the countdown: tick, tock, and sharper at the end', ticks.length === 5 && ticks[0] === ticks[2] && ticks[1] === ticks[3] && ticks[1] < ticks[0] && ticks[4] > ticks[0], ticks.join(', ') + ' Hz');
  // Nothing to press: the game moves on by itself.
  await movedOn(page, s0.battle.question.sig);
  check(results, 'after a timeout the next question arrives without any input', (await state(page)).battle.asked.length === 1);
  for (let i = 0; i < 3; i++) await answer(page, false);
  h = await hud(page);
  check(results, '4 wrong answers leave 2 troops, still alive', h.troops === 2 && h.lives === 1 && h.streak === 0, JSON.stringify(h));
  // With 2 troops a retreat costs 1. With the last troop there is nothing to pay with.
  check(results, 'with 2 troops a retreat costs 1', (await page.getByTestId('retreat').getAttribute('data-cost')) === '1' && (await page.getByTestId('retreat').isEnabled()));
  await page.getByTestId('retreat').click();
  await page.getByTestId('attack-panel').waitFor();
  h = await hud(page);
  check(results, 'the retreat leaves 1 troop, and attacking is still possible', h.troops === 1 && (await page.locator('.target-chip').count()) > 0, JSON.stringify(h));
  await attack(page, 'LUX');
  const retreat = page.getByTestId('retreat');
  check(results, 'the last troop cannot retreat: the button is disabled and says so', (await retreat.isDisabled()) && /No retreat/i.test(await retreat.innerText()) && /last troop/i.test(await retreat.getAttribute('title')), await retreat.innerText());
  const last = await answer(page, false, { wait: false });
  check(results, 'troops reach 0: the attack is lost', last.troops === 0 && last.feedback.outcome === 'lost');
  check(results, 'cannot retreat from a lost battle', (await page.getByTestId('retreat').count()) === 0);
  await page.screenshot({ path: SHOTS + '30-attack-failed.png' });
  await page.getByTestId('gameover-screen').waitFor();
  let s = await state(page);
  const text = (await page.getByTestId('gameover-screen').innerText()).replace(/\s+/g, ' ');
  check(results, 'one life: losing a single battle ends the game, with no button pressed', s.phase === 'gameover' && s.lives === 0 && s.troops === 0 && /Game over/i.test(text));
  check(results, 'the game over sound plays', (await lastSound(page)) === 'gameOver');
  check(results, 'game over shows the empire and its flag', (await page.getByTestId('end-empire').innerText()).toLowerCase().includes(s.empire.name.toLowerCase()) && (await page.getByTestId('end-empire').locator('canvas.empire-flag').count()) === 1, (await page.getByTestId('end-empire').innerText()).replace(/\n/g, ' '));
  check(results, 'game over shows countries conquered, best streak, battles fought, score', (await page.getByTestId('stat-conquered').innerText()).startsWith('0') && (await page.getByTestId('stat-streak').innerText()) === String(s.bestStreak) && (await page.getByTestId('stat-battles').innerText()) === '2' && s.battles === 2 && /Battles fought/i.test(text) && !/Turns/i.test(text) && (await page.getByTestId('stat-score').innerText()) === '0', text);
  check(results, 'with no continent conquered, the bonus is explained rather than awarded', (await page.getByTestId('stat-continents').getAttribute('data-value')) === '0' && /worth \+10/.test(await page.getByTestId('stat-continents').innerText()));
  await page.screenshot({ path: SHOTS + '31-game-over.png' });

  // Game over survives a refresh, and Play again leads back to a working start screen.
  await page.reload();
  await page.getByTestId('gameover-screen').waitFor();
  check(results, 'game over screen survives a refresh', true);
  await page.getByTestId('play-again').click();
  await page.getByTestId('start-screen').waitFor();
  check(results, 'Play again returns to the start screen', (await page.getByTestId('begin').isDisabled()) === true);
  await page.reload();
  await page.getByTestId('start-screen').waitFor();
  check(results, 'finished game is not resumed after Play again + refresh', true);
});

// -------------------------------------------------------------------- 2 + 6
section('iceland', async (page) => {
  await open(page);
  // Five start ratings, each with its multiplier and a one-line reason.
  const rowText = async (query, code) => {
    await page.getByTestId('search').fill(query);
    return (await page.getByTestId(`start-${code}`).innerText()).replace(/\n/g, ' | ');
  };
  const rows = { DEU: await rowText('germany', 'DEU'), PRT: await rowText('portugal', 'PRT'), ROU: await rowText('romania', 'ROU'), THA: await rowText('thailand', 'THA'), ISL: await rowText('ice', 'ISL'), PLW: await rowText('palau', 'PLW') };
  check(results, 'famous countries are Easy x1, whatever their position', /Easy ×1/.test(rows.DEU) && /Easy ×1/.test(rows.PRT) && /Well known country/.test(rows.PRT), `${rows.DEU} ; ${rows.PRT}`);
  check(results, 'mid-known starts: Medium x1.5 with a way out, Hard x2 boxed in, Very Hard x2.5 on an island', /Medium ×1\.5/.test(rows.ROU) && /Hard ×2/.test(rows.THA) && /Very Hard ×2\.5/.test(rows.ISL), `${rows.ROU} ; ${rows.THA} ; ${rows.ISL}`);
  check(results, 'an obscure island is Extreme x3, with the reason shown', /Extreme ×3/.test(rows.PLW) && /Obscure island: every expansion is a sea crossing/.test(rows.PLW), rows.PLW);
  await page.getByTestId('search').fill('');
  const filterCounts = {};
  for (const tier of ['easy', 'medium', 'hard', 'very-hard', 'extreme']) {
    await page.getByTestId(`filter-${tier}`).click();
    const shown = await page.locator('.country-row').count();
    const labels = new Set(await page.locator('.country-row').evaluateAll((els) => els.map((el) => el.dataset.difficulty)));
    filterCounts[tier] = shown;
    if (labels.size !== 1) throw new Error(`filter ${tier} shows ${[...labels].join(', ')}`);
  }
  await page.getByTestId('filter-all').click();
  check(results, 'the start list can be filtered by each of the five ratings', Object.values(filterCounts).every((n) => n > 0) && Object.values(filterCounts).reduce((a, b) => a + b, 0) === 230, JSON.stringify(filterCounts));
  const colours = await page.evaluate(() => [...new Set([...document.querySelectorAll('.filter:not(.all)')].map((f) => { f.classList.add('active'); const c = getComputedStyle(f).color; f.classList.remove('active'); return c; }))].length);
  check(results, 'the five ratings have five distinct colours', colours === 5, `${colours} colours`);
  await startGame(page, 'World', 'ISL');
  let h = await hud(page);
  check(results, 'Iceland starts with the same 10 troops and 1 life', h.troops === 10 && h.lives === 1);

  // 6. Refresh during the recruit phase.
  await answer(page, true);
  await answer(page, true);
  let before = await state(page);
  await page.reload();
  await page.getByTestId('question-card').waitFor();
  let after = await state(page);
  check(results, 'refresh mid-recruit resumes the same state', JSON.stringify(before) === JSON.stringify(after), `question ${after.recruit.index + 1}/5, troops ${after.troops}`);
  check(results, 'same question is on screen after the refresh', (await page.getByTestId('question-card').getAttribute('data-sig')) === before.recruit.question.sig);
  await recruit(page, [true, true, true]);

  // 2. Starting as Iceland, sea targets appear.
  await settle(page);
  let s = await state(page);
  const seaCount = await page.locator('.target-chip.sea').count();
  check(results, 'Iceland has no land targets', (await page.locator('.target-chip.land').count()) === 0 && (await page.locator('.hl-land').count()) === 0);
  check(results, 'Iceland has sea targets', seaCount > 0 && (await page.locator('path.country.s-sea').count()) === seaCount, `${seaCount} sea targets`);
  const dashes = await countPixels(page, 'fx', [214, 238, 255]);
  check(results, 'sea targets get a dashed pixel outline', dashes > 200 && (await countPixels(page, 'fx', [255, 255, 255])) === 0, `${dashes} dash pixels, no solid white outline`);
  check(results, 'the UK and Ireland are among them', (await classOf(page, 'GBR')).includes('s-sea') && (await classOf(page, 'IRL')).includes('s-sea'));
  const landlocked = await page.evaluate(() => [...document.querySelectorAll('.target-chip.sea')].map((c) => c.getAttribute('data-testid').slice(7)).filter((id) => window.__atlas.data.byId[id].landlocked));
  check(results, 'no landlocked country is offered by sea', landlocked.length === 0, landlocked.join(','));
  await page.screenshot({ path: SHOTS + '40-iceland-sea-targets.png' });

  // Refresh during the attack phase.
  before = await state(page);
  await page.reload();
  await page.getByTestId('attack-panel').waitFor();
  after = await state(page);
  check(results, 'refresh mid-attack-phase resumes the same state', JSON.stringify(before) === JSON.stringify(after));
  check(results, 'sea targets are still shown after the refresh', (await page.locator('path.country.s-sea').count()) === seaCount);

  // Sea battle: +3 defenders and a 10 second timer.
  await page.getByTestId('target-IRL').click();
  await settle(page);
  const card = await page.getByTestId('target-card').innerText();
  check(results, 'sea target card explains the crossing', /sea crossing/i.test(card) && /10s per question/.test(card) && /^Ireland\s+8,000 enemies/.test(card), card.replace(/\n/g, ' '));
  check(results, 'on the target card the sea crossing text is the light blue of the dashed outline', (await page.locator('.target-info .sea').evaluate((el) => `${getComputedStyle(el).color} ${el.textContent}`)) === 'rgb(212, 236, 255) sea crossing (more enemies, 10s per question)');
  check(results, 'a sea crossing meets more enemies, so it is worth more: Ireland +2,000 by sea (it is +1,500 by land)', /\+2,000 troops upon victory/.test(card) && (await page.getByTestId('target-IRL').getAttribute('data-reward')) === '2', card.replace(/\n/g, ' '));
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  s = await state(page);
  check(results, 'sea battle: Ireland (5M people) defends with 6 + 2 = 8', s.battle.sea === true && s.battle.defenders === 8, `defenders ${s.battle.defenders}`);
  check(results, 'sea battle questions get only 10 seconds', (await page.getByTestId('timer').getAttribute('data-total')) === '10');
  await answer(page, true);

  // 6. Refresh mid-battle.
  before = await state(page);
  await page.reload();
  await page.getByTestId('question-card').waitFor();
  after = await state(page);
  check(results, 'refresh mid-battle resumes the same state', JSON.stringify(before) === JSON.stringify(after), `vs ${after.battle.targetId}: ${after.troops} troops v ${after.battle.defenders} defenders`);
  check(results, 'battle HUD is back after the refresh', (await page.getByTestId('battle-defenders').innerText()).startsWith(k(before.battle.defenders)) && (await page.getByTestId('question-card').getAttribute('data-sig')) === before.battle.question.sig);
  check(results, 'target is still marked as under attack', (await classOf(page, 'IRL')).includes('s-battle'));
  await settle(page, 1500);
  await page.screenshot({ path: SHOTS + '41-sea-battle-resumed.png' });

  // Let the 10 second timer run out: counts as a wrong answer.
  const t0 = Date.now();
  const troopsBefore = (await hud(page)).troops;
  await page.getByTestId('verdict').waitFor({ timeout: 15000 });
  const elapsed = (Date.now() - t0) / 1000;
  s = await state(page);
  const verdict = await page.getByTestId('verdict').innerText();
  check(results, 'sea question times out after ~10 seconds', elapsed > 8.5 && elapsed < 11.5, `${elapsed.toFixed(1)}s`);
  check(results, 'timeout counts as a wrong answer (2 troops lost, answer shown)', s.feedback.timedOut && !s.feedback.correct && s.troops === troopsBefore - 2 && /Out of time/.test(verdict) && verdict.includes(s.feedback.correctLabel), verdict);
  await movedOn(page, s.battle.question.sig);

  // Refresh while answer feedback is showing must not dead-end. (A wrong answer: its feedback stays up longest.)
  const shown = await answer(page, false, { wait: false });
  before = await state(page);
  await page.reload();
  await page.getByTestId('verdict').waitFor();
  after = await state(page);
  check(results, 'refresh while feedback is showing resumes it', JSON.stringify(before) === JSON.stringify(after) && after.feedback !== null);
  await movedOn(page, shown.battle.question.sig);
  check(results, 'and the game then moves on by itself', (await state(page)).feedback === null && (await page.getByTestId('retreat').count()) === 1);

  // Win the sea battle.
  await fight(page, true);
  await page.getByTestId('attack-panel').waitFor();
  s = await state(page);
  check(results, 'sea battle can be won: Ireland is owned', s.owned.includes('IRL') && (await classOf(page, 'IRL')).includes('s-owned'));
  check(results, 'owning Ireland makes the UK a land target', (await classOf(page, 'GBR')).includes('s-land'));
});


// ---------------------------------------------------------------- islands
// A tiny island across the sea must be winnable and it must be obvious when you have won it.
section('malta', async (page) => {
  await open(page);
  await startGame(page, 'World', 'ITA');
  await recruit(page);
  await settle(page);
  const maltaBefore = (await hud(page)).troops;
  check(results, 'Malta is offered as a sea target from Italy', (await page.getByTestId('target-MLT').getAttribute('data-kind')) === 'sea');
  const p = await pointOn(page, 'MLT');
  await page.mouse.click(p.x, p.y);
  await page.getByTestId('target-card').waitFor();
  const card = (await page.getByTestId('target-card').innerText()).replace(/\n/g, ' ');
  check(results, 'clicking Malta\'s marker on the map selects it', /Malta/.test(card), card);
  check(results, 'Malta defends with 4 by sea (3 + 1), not 6', /^Malta\s+4,000 enemies/.test(card) && /sea crossing/.test(card), card);
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  await settle(page, 1500);
  let s = await state(page);
  const zoom = parseFloat(await page.locator('.zoom-level').innerText());
  check(results, 'the camera zooms all the way in on a tiny island', zoom === 40, `${zoom}x`);
  const size = await page.evaluate(() => {
    const m = document.querySelector('path.country[data-id="MLT"]').getScreenCTM();
    const shape = window.__atlas.data.geometry.byId.MLT;
    const card = document.querySelector('[data-testid="question-card"]').getBoundingClientRect();
    return { width: (shape.box[2] - shape.box[0]) * m.a, bottom: shape.box[3] * m.d + m.f, cardTop: card.top };
  });
  check(results, 'Malta is clearly visible during the battle, above the question card', size.width > 40 && size.bottom < size.cardTop, `${Math.round(size.width)}px wide`);
  const red = await sample(page, 'MLT', 'fx');
  check(results, 'Malta itself is tinted red while under attack', red[3] > 0 && red[0] > red[1] + 60, `rgba(${red.join(', ')})`);
  check(results, 'the battle opens with Malta\'s flag', s.battle.question.sig === 'flag:MLT');
  await page.screenshot({ path: SHOTS + '45-malta-battle.png' });
  let answers = 0;
  while ((s = await state(page)).phase === 'battle' && answers < 10) { await answer(page, true); answers++; }
  await page.getByTestId('attack-panel').waitFor();
  s = await state(page);
  check(results, 'Malta falls after at most 4 correct answers', s.owned.includes('MLT') && answers <= 4, `${answers} correct answers`);
  check(results, 'the conquest is announced', /Malta conquered/.test(await page.locator('.toast').innerText()) && (await lastSound(page)) === 'conquer');
  check(results, 'Malta had 4 defenders, so taking it adds 1 troop', s.troops === maltaBefore + 1 && s.lastEvent.troopsGained === 1 && /\+1,000 troops join/.test(await page.locator('.toast').innerText()), `${maltaBefore} -> ${s.troops} troops`);
  // The island blinks white, then stays marked in green.
  await page.waitForTimeout(250);
  const during = await sample(page, 'MLT', 'fx');
  await page.screenshot({ path: SHOTS + '46-malta-conquered.png' });
  await page.waitForTimeout(1900);
  await settle(page);
  // Once the blink is over, your flag stands on the island: count its colours (default flag: red, white, blue).
  const cloth = (await countPixels(page, 'fx', [216, 52, 60])) + (await countPixels(page, 'fx', [43, 79, 196]));
  check(results, 'a conquered island flashes, then flies your flag', during[3] > 0 && cloth >= 72, `flash rgba(${during.join(', ')}), then ${cloth} flag pixels across Italy and Malta`);
  check(results, 'Malta counts as owned in the HUD', (await hud(page)).countries === 2 && (await classOf(page, 'MLT')).includes('s-owned'));
  await page.screenshot({ path: SHOTS + '47-malta-owned.png' });
});

// ------------------------------------------------------------------ empire
section('empire', async (page) => {
  await open(page);
  // The designer comes first in the menu, before the campaign and the country list.
  const order = await page.evaluate(() => [...document.querySelectorAll('.start-section h2')].map((h) => h.textContent));
  check(results, 'the empire designer is the first thing in the start menu', order[0] === 'Your empire' && order.indexOf('Campaign') > 0, order.join(' > '));
  check(results, '16 preset flags and 12 colours to choose from', (await page.locator('.flag-presets .preset').count()) === 16 && (await page.locator('.palette .colour').count()) === 12);
  check(results, 'the start menu shows no country flags (they would give away the first question)', (await page.locator('.start img').count()) === 0);

  await page.getByTestId('empire-name').fill('Granitopia');
  await page.getByTestId('flag-4').click();
  await page.getByTestId('slot-0').click();
  await page.getByTestId('colour-2b4fc4').click();
  await page.getByTestId('slot-1').click();
  await page.getByTestId('colour-ffcd3c').click();
  check(results, 'picking a preset and colours updates the flag', (await page.getByTestId('flag-4').getAttribute('aria-checked')) === 'true' && (await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-conquest:empire:v1')).flag.colours.slice(0, 2).join())) === '#2b4fc4,#ffcd3c');
  const preview = await page.evaluate(() => {
    const c = document.querySelector('.empire-preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return { size: `${c.width}x${c.height}`, corner: [d[0], d[1], d[2]], cross: [d[4 * 3], d[4 * 3 + 1], d[4 * 3 + 2]], rendering: getComputedStyle(c).imageRendering };
  });
  check(results, 'the flag is 12x8 pixel art in the chosen colours', preview.size === '12x8' && preview.corner.join() === '43,79,196' && preview.cross.join() === '255,205,60' && preview.rendering === 'pixelated', JSON.stringify(preview));

  // The design is remembered.
  await page.reload();
  await page.getByTestId('start-screen').waitFor();
  check(results, 'the empire is remembered after a refresh', (await page.getByTestId('empire-name').inputValue()) === 'Granitopia' && (await page.getByTestId('flag-4').getAttribute('aria-checked')) === 'true');

  // A saved name that no longer passes, or the "New Empire" stand-in, leaves the field empty; the flag is kept.
  const emptied = [];
  for (const name of ['Sh1t Kingdom', 'New Empire']) {
    await page.evaluate((name) => { const key = 'atlas-conquest:empire:v1'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), name })); }, name);
    await page.reload();
    await page.getByTestId('start-screen').waitFor();
    emptied.push(await page.getByTestId('empire-name').inputValue());
  }
  check(results, 'a saved name that fails, or "New Empire", comes back as an empty field', emptied.join('|') === '|' && (await page.getByTestId('flag-4').getAttribute('aria-checked')) === 'true', JSON.stringify(emptied));
  await page.getByTestId('empire-name').fill('Granitopia');

  // Picking a start plants a preview flag on it.
  await page.getByTestId('search').fill('germ');
  await page.getByTestId('start-DEU').click();
  await settle(page);
  const planted = () => countPixels(page, 'fx', [43, 79, 196]);
  const one = await planted();
  check(results, 'the flag is previewed on the chosen starting country', one > 20, `${one} flag-blue pixels`);
  await page.getByTestId('begin').click();
  await page.getByTestId('question-card').waitFor();
  let s = await state(page);
  check(results, 'the game carries the empire name and flag', s.empire.name === 'Granitopia' && s.empire.flag.pattern === 4);
  check(results, 'the top bar shows the empire', /Granitopia/i.test(await page.getByTestId('empire-brand').innerText()) && (await page.getByTestId('empire-brand').locator('canvas.empire-flag').count()) === 1);
  check(results, 'the first question is still the home country\'s flag, which was not shown beforehand', s.recruit.question.sig === 'flag:DEU');

  await recruit(page);
  await settle(page);
  check(results, 'the attack panel shows no country flags', (await page.getByTestId('attack-panel').locator('img').count()) === 0);
  // Outside questions the map names countries as before.
  const fr = await pointOn(page, 'FRA');
  await page.mouse.move(fr.x, fr.y);
  await page.waitForTimeout(120);
  check(results, 'in the attack phase the map still names countries', /^France/.test(await page.locator('.map-tooltip').innerText()));
  const perFlag = await planted();
  const fra = await sample(page, 'FRA', 'fx');
  await page.getByTestId('target-LUX').click();
  check(results, 'the selected target card shows no flag either', (await page.getByTestId('target-card').locator('img').count()) === 0);
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  await fight(page, true);
  await page.getByTestId('attack-panel').waitFor();
  await page.getByTestId('target-FRA').click();
  await page.getByTestId('attack-button').click();
  await page.getByTestId('question-card').waitFor();
  await fight(page, true);
  await page.getByTestId('attack-panel').waitFor();
  await page.waitForTimeout(1800);
  await settle(page);
  // A flag stands in the middle of each of the three countries now held.
  const centres = await page.evaluate(() => {
    const canvas = document.querySelector('.pixel-fx');
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const r = canvas.getBoundingClientRect();
    const m = document.querySelector('path.country[data-id="DEU"]').getScreenCTM();
    const out = {};
    for (const id of ['DEU', 'FRA', 'LUX', 'ESP']) {
      const shape = window.__atlas.data.geometry.byId[id];
      const x = Math.floor(((m.a * shape.cx + m.e - r.left) / r.width) * canvas.width);
      const y = Math.floor(((m.d * shape.cy + m.f - r.top) / r.height) * canvas.height);
      // Count flag-coloured pixels in the box where a flag would stand.
      const d = ctx.getImageData(x - 6, y - 8, 14, 12).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if ((d[i] === 43 && d[i + 1] === 79 && d[i + 2] === 196) || (d[i] === 255 && d[i + 1] === 205 && d[i + 2] === 60)) n++;
      out[id] = n;
    }
    return out;
  });
  check(results, 'your flag is planted in the centre of every country you hold, and only those', centres.DEU >= 30 && centres.FRA >= 30 && centres.LUX >= 30 && centres.ESP === 0, JSON.stringify(centres));
  await page.screenshot({ path: SHOTS + '48-flags-planted.png' });

  // Left blank, an empire is named after its home country.
  await page.getByText('New game').click();
  await page.getByText('Yes, quit').click();
  await page.getByTestId('start-screen').waitFor();
  await page.getByTestId('empire-name').fill('   ');
  await startGame(page, 'World', 'ISL');
  s = await state(page);
  check(results, 'an unnamed empire is named after its home country', s.empire.name === 'Empire of Iceland', s.empire.name);

  const look = await page.evaluate(() => ({
    cursor: getComputedStyle(document.querySelector('.map-hit .country')).cursor,
    button: getComputedStyle(document.querySelector('.option')).cursor,
    font: getComputedStyle(document.body).fontSize,
    option: getComputedStyle(document.querySelector('.option-label, .option')).fontSize,
  }));
  check(results, 'the cursor is a custom plus-shaped crosshair on the map and on buttons', /^url\(/.test(look.cursor) && /crosshair$/.test(look.cursor) && look.button === look.cursor, look.cursor.slice(0, 40) + '…');
  check(results, 'text is larger than before', parseFloat(look.font) >= 25 && parseFloat(look.option) >= 25, `body ${look.font}, options ${look.option}`);
});

// Sound can be switched off, and stays off.
section('sound', async (page) => {
  await open(page);
  await startGame(page, 'World', 'DEU');
  const toggle = page.getByTestId('sound-toggle');
  check(results, 'sound is on by default', (await toggle.getAttribute('aria-pressed')) === 'true');
  await answer(page, true);
  await answer(page, true);
  const audio = await page.evaluate(() => {
    const before = window.__atlas.sounds.length;
    return { logged: before };
  });
  check(results, 'answers make sound', audio.logged >= 2);
  await toggle.click();
  check(results, 'the sound button mutes', (await toggle.getAttribute('aria-pressed')) === 'false' && (await page.evaluate(() => localStorage.getItem('atlas-conquest:muted'))) === '1');
  await page.reload();
  await page.getByTestId('question-card').waitFor();
  check(results, 'mute survives a refresh', (await page.getByTestId('sound-toggle').getAttribute('aria-pressed')) === 'false');
  await page.getByTestId('sound-toggle').click();
  check(results, 'and can be switched back on', (await page.getByTestId('sound-toggle').getAttribute('aria-pressed')) === 'true');
});

// ------------------------------------------------------------------------ 7
async function conquerAll(page, label) {
  let battles = 0;
  let promised = 0;
  let recruited = null;
  for (let guard = 0; guard < 400; guard++) {
    const s = await state(page);
    if (s.phase === 'victory' || s.phase === 'gameover') return { s, battles, promised, recruited };
    if (s.phase !== 'recruit') recruited ??= s.troops;
    const asked = s.recruit?.question ?? s.battle?.question;
    if (asked && /(which|what) continent/i.test(asked.prompt)) throw new Error(`continent question asked: ${asked.prompt}`);
    if (asked?.type === 'currency' && asked.options.some((o) => /\s/.test(o.label))) throw new Error(`currency option names a country: ${asked.options.map((o) => o.label).join(' | ')}`);
    if (s.phase === 'recruit' || s.phase === 'battle') await answer(page, true);
    else if (s.phase === 'attack') {
      if (s.lastEvent?.kind === 'conquered' && s.lastEvent.continent && label === 'world-continent') return { s, battles, promised, recruited };
      // Alternate between picking targets on the map and from the list.
      const ids = await page.evaluate(() => [...document.querySelectorAll('.target-chip')].map((c) => c.getAttribute('data-testid').slice(7)));
      if (ids.length === 0) throw new Error('attack phase with no targets');
      const id = ids[0];
      promised += Number(await page.getByTestId(`target-${id}`).getAttribute('data-reward'));
      const p = battles % 2 === 0 ? await pointOn(page, id) : null;
      if (p) await page.mouse.click(p.x, p.y);
      else await page.getByTestId(`target-${id}`).click();
      await page.getByTestId('target-card').waitFor();
      await page.getByTestId('attack-button').click();
      await page.getByTestId('question-card').waitFor();
      battles++;
    }
  }
  throw new Error('campaign did not finish');
}

section('campaign', async (page) => {
  await open(page);
  await page.getByTestId('mode-South America').click();
  await page.waitForTimeout(1000);
  check(results, 'South America campaign lists its 13 countries', (await page.locator('.country-row').count()) === 13);
  check(results, 'countries outside the campaign are dimmed', (await classOf(page, 'USA')).includes('s-out') && !(await classOf(page, 'BRA')).includes('s-out'));
  await page.screenshot({ path: SHOTS + '50-campaign-start.png' });
  await startGame(page, 'South America', 'URY');
  const h = await hud(page);
  check(results, 'campaign HUD counts 1/13', h.countries === 1 && /\/13/.test(await page.getByTestId('countries').innerText()));
  const { s, battles, promised, recruited } = await conquerAll(page, 'campaign');
  await page.getByTestId('victory-screen').waitFor();
  const text = (await page.getByTestId('victory-screen').innerText()).replace(/\s+/g, ' ');
  check(results, 'a full continent campaign can be played from start to victory', s.phase === 'victory' && s.owned.length === 13, `${battles} battles`);
  check(results, 'a flawless campaign ends with the recruited army plus exactly what the 12 conquests were worth', recruited >= 20 && s.troops === recruited + promised && promised > 0 && s.answersWrong === 0, `${recruited} + ${promised} = ${s.troops}`);
  check(results, 'victory screen shows countries, best streak, battles fought and score', /Victory/i.test(text) && (await page.getByTestId('stat-conquered').innerText()).startsWith('12') && (await page.getByTestId('stat-streak').innerText()) === String(s.bestStreak) && (await page.getByTestId('stat-battles').innerText()) === '12' && s.battles === 12, text);
  const score = await page.getByTestId('stat-score').innerText();
  check(results, 'score = countries x multiplier + 10 for the conquered continent', Number(score) === 12 * s.multiplier + 10, `12 x ${s.multiplier} + 10 = ${score}`);
  check(results, 'the end screen lists the conquered continent and its bonus', (await page.getByTestId('stat-continents').getAttribute('data-value')) === '1' && /South America\s*\+10/.test(await page.getByTestId('stat-continents').innerText()) && /plus 1 continent × 10 = 10 bonus/.test(await page.getByTestId('score-sum').innerText()), (await page.getByTestId('score-sum').innerText()));
  check(results, 'every country in the campaign is green', (await page.locator('path.country.s-owned').count()) === 13);
  check(results, 'conquering a continent no longer grants a life', s.lives === 1, `lives ${s.lives}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + '51-victory.png' });
  await page.getByTestId('play-again').click();
  await page.getByTestId('start-screen').waitFor();
  check(results, 'Play again after victory returns to the start screen', true);
});

// Continent bonus inside a World game.
section('continent-bonus', async (page) => {
  await open(page);
  await startGame(page, 'World', 'BRA');
  // Only ever attack South American targets.
  for (let guard = 0; guard < 400; guard++) {
    const s = await state(page);
    if (s.owned.length === 13) break;
    if (s.phase === 'recruit' || s.phase === 'battle') await answer(page, true);
    else {
      const id = await page.evaluate(() => [...document.querySelectorAll('.target-chip')].map((c) => c.getAttribute('data-testid').slice(7)).find((id) => window.__atlas.data.byId[id].continent === 'South America'));
      await page.getByTestId(`target-${id}`).click();
      await page.getByTestId('attack-button').click();
      await page.getByTestId('question-card').waitFor();
    }
  }
  await page.getByTestId('attack-panel').waitFor();
  const s = await state(page);
  const h = await hud(page);
  const toast = (await page.locator('.toast').innerText()).replace(/\n/g, ' ');
  check(results, 'World mode: conquering all of South America is recorded for bonus points', s.owned.length === 13 && h.lives === 1 && s.phase === 'attack' && s.continentsCompleted.join() === 'South America', `continents ${s.continentsCompleted.join()}, ${toast}`);
  check(results, 'the bonus is announced', /South America is yours: \+10 bonus points/.test(toast), toast);
  check(results, 'the game goes on (World is not won yet)', (await page.locator('.target-chip').count()) > 0 && /13\/230/.test((await page.getByTestId('countries').innerText()).replace(/\s/g, '')));
  await page.screenshot({ path: SHOTS + '52-continent-bonus.png' });
});


// A less-than-perfect player: wrong answers and retreats. After the opening recruit phase the only way to
// raise troops is conquest, so every troop lost is gone for good, and the game must still reach an ending.
section('campaign-imperfect', async (page) => {
  await open(page);
  await startGame(page, 'South America', 'BOL');
  let seed = 12345;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // The recruit phase: four of five right.
  await recruit(page, [true, true, false, true, true]);
  const army = (await state(page)).troops;
  let retreats = 0, actions = 0, peak = army, gained = 0, s, previous = null;
  for (; actions < 3000; actions++) {
    s = await state(page);
    if (s.phase === 'recruit') throw new Error('the recruit phase came back');
    // Troops only ever go up at the moment a country is taken, and by what that country was worth.
    if (previous && s.troops > previous.troops) {
      if (s.owned.length !== previous.owned.length + 1 || s.troops - previous.troops !== s.lastEvent.troopsGained) throw new Error(`troops rose from ${previous.troops} to ${s.troops} without a matching conquest`);
      gained += s.troops - previous.troops;
    }
    previous = s;
    peak = Math.max(peak, s.troops);
    if (s.phase === 'victory' || s.phase === 'gameover') break;
    if (s.phase === 'battle') {
      // A wrong answer at 2 troops or fewer is fatal: this player pulls out first whenever a retreat is allowed.
      if (!s.feedback && s.troops <= 2 && (await page.getByTestId('retreat').isEnabled())) {
        await page.getByTestId('retreat').click();
        await page.getByTestId('attack-panel').waitFor();
        retreats++;
      } else await answer(page, rand() < 0.8);
    } else {
      const chips = await page.evaluate(() => [...document.querySelectorAll('.target-chip')].map((c) => ({ id: c.getAttribute('data-testid').slice(7), defenders: Number(c.getAttribute('data-standing')) })));
      if (chips.length === 0) throw new Error('attack phase with nothing to attack and no victory');
      if (s.troops < 1) throw new Error('left on the map with no troops and no way to get any');
      if ((await page.getByTestId('end-turn').count()) > 0) throw new Error('an End turn button is on screen');
      await attack(page, chips.sort((a, b) => a.defenders - b.defenders)[0].id);
    }
  }
  const ended = s.phase === 'victory' || s.phase === 'gameover';
  check(results, 'imperfect play (80% right) reaches an ending with no dead end', ended, `${s.phase} after ${s.battles} battles: ${s.owned.length}/13 countries, ${retreats} retreats, ${s.answersWrong} wrong answers`);
  check(results, 'after recruiting, troops were never gained except by conquest', army > 10 && s.troops <= army + gained && peak <= army + gained, `recruited to ${army}, +${gained} from conquests, peak ${peak}, ended on ${s.troops}`);
  await page.getByTestId(s.phase === 'victory' ? 'victory-screen' : 'gameover-screen').waitFor();
  check(results, 'its end screen reports the same numbers as the game state', (await page.getByTestId('stat-battles').innerText()) === String(s.battles) && (await page.getByTestId('stat-streak').innerText()) === String(s.bestStreak) && Number(await page.getByTestId('stat-score').innerText()) === (s.owned.length - 1) * s.multiplier + 10 * s.continentsCompleted.length);
});

// Oceania is almost all islands: the whole campaign has to be won by sea crossings.
section('campaign-oceania', async (page) => {
  await open(page);
  await startGame(page, 'Oceania', 'NZL');
  let seaBattles = 0, fallbackOffered = false, s;
  for (let guard = 0; guard < 1500; guard++) {
    s = await state(page);
    if (s.phase === 'victory' || s.phase === 'gameover') break;
    if (s.phase === 'recruit' || s.phase === 'battle') await answer(page, true);
    else {
      const first = page.locator('.target-chip').first();
      if ((await first.getAttribute('data-kind')) === 'sea') seaBattles++;
      if (/nearest ones beyond/.test(await page.getByTestId('attack-panel').innerText())) fallbackOffered = true;
      await first.click();
      await page.getByTestId('attack-button').click();
      await page.getByTestId('question-card').waitFor();
    }
  }
  check(results, 'an island campaign (Oceania, 23 countries) can be won entirely through the UI', s.phase === 'victory' && s.owned.length === 23, `${s.phase}, ${s.owned.length}/23, ${seaBattles} sea battles`);
  check(results, 'sea crossings carried it', seaBattles >= 15, `${seaBattles} sea battles`);
  console.log(`      (nearest-shore fallback was ${fallbackOffered ? '' : 'not '}needed during this run)`);
});

// ------------------------------------------------------------------ rules
// The rule book: a gold button centred above the map that swaps the map for the rules and back.
section('rules', async (page) => {
  await open(page);
  await settle(page);
  const toggle = page.getByTestId('rules-toggle');
  const rect = async (testid) => page.getByTestId(testid).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, centre: (r.left + r.right) / 2 }; });
  const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  let box = await rect('rules-toggle');
  const edges = await mapEdges(page);
  check(results, 'a Rules button sits above the map, in the centre', (await toggle.innerText()).trim() === 'Rules' && Math.abs(box.centre - (440 + view.w) / 2) <= 2 && box.top >= 0 && box.bottom < edges.top, `centre ${Math.round(box.centre)} of map area ${(440 + view.w) / 2}, bottom ${Math.round(box.bottom)}, map top ${Math.round(edges.top)}`);

  // The emblem: two crossed gold swords in pixel art, right of the word Conquest, and the same drawing as the favicon.
  const logo = await page.evaluate(async () => {
    const svg = document.querySelector('.start-head h1 [data-testid="logo"]');
    const word = document.querySelector('.start-head h1 span').getBoundingClientRect();
    const r = svg.getBoundingClientRect();
    const panel = document.querySelector('.start').getBoundingClientRect();
    const colours = new Set([...svg.querySelectorAll('rect')].map((el) => el.getAttribute('fill')));
    const icon = document.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    const favicon = await (await fetch(icon)).text();
    return {
      label: svg.getAttribute('aria-label'),
      text: document.querySelector('.start-head h1').innerText.replace(/\s+/g, ' ').trim(),
      rightOfWord: r.left >= word.right && r.left - word.right < 24,
      sameLine: r.top < word.bottom && r.bottom > word.top,
      inPanel: r.right <= panel.right - 8,
      size: Math.round(r.width),
      pixels: svg.querySelectorAll('rect').length,
      crisp: svg.getAttribute('shape-rendering'),
      fills: [...colours].sort(),
      cells: [...svg.querySelectorAll('rect')].map((el) => `${el.getAttribute('x')},${el.getAttribute('y')},${el.getAttribute('fill')}`).sort().join(' '),
      icons: document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').length,
      favicon,
    };
  });
  check(results, 'the crossed gold swords sit to the right of the word Conquest, on the same line', logo.text === 'ATLAS CONQUEST' && logo.rightOfWord && logo.sameLine && logo.inPanel && /crossed gold swords/i.test(logo.label), JSON.stringify({ rightOfWord: logo.rightOfWord, sameLine: logo.sameLine, inPanel: logo.inPanel, size: logo.size }));
  check(results, 'the emblem is pixel art in gold: hard-edged squares, two screen pixels each', logo.crisp === 'crispEdges' && logo.pixels > 70 && logo.size === 32 && logo.fills.every((fill) => ['#150d05', '#a8760f', '#c8961c', '#ffcf4a', '#ffd95c', '#fff0b8'].includes(fill)) && logo.fills.includes('#ffcf4a'), `${logo.pixels} pixels at ${logo.size}px in ${logo.fills.join(' ')}`);
  const background = /<rect width="16" height="16" fill="(#[0-9a-f]{6})"\/>/.exec(logo.favicon)?.[1];
  const swords = [...logo.favicon.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="(#[0-9a-f]{6})"\/>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), fill: m[3] }));
  const golds = swords.filter((p) => p.fill !== '#150d05');
  const span = { left: Math.min(...golds.map((p) => p.x)), right: Math.max(...golds.map((p) => p.x)), top: Math.min(...golds.map((p) => p.y)), bottom: Math.max(...golds.map((p) => p.y)) };
  const at = new Map(swords.map((p) => [`${p.x},${p.y}`, p.fill]));
  // Both points and both pommels: a sword runs from each bottom corner to the opposite top corner.
  const corners = [[1, 1], [14, 1], [1, 14], [14, 14]].every(([x, y]) => at.has(`${x},${y}`));
  check(results, 'the favicon is two crossed gold swords on plain dark brown, with no globe', logo.icons === 1 && background === '#2a1a0c' && !/circle|rx=|#1d4f91|#3ddc84/.test(logo.favicon) && golds.length > 70 && new Set(golds.map((p) => p.fill)).size >= 4 && golds.every((p) => ['#fff0b8', '#ffcf4a', '#ffd95c', '#c8961c', '#a8760f'].includes(p.fill)), `${golds.length} gold pixels on ${background}`);
  check(results, 'the title emblem and the favicon are the same drawing, pixel for pixel', swords.map((p) => `${p.x},${p.y},${p.fill}`).sort().join(' ') === logo.cells, `${swords.length} pixels in the favicon, ${logo.pixels} in the title`);
  check(results, 'the swords are as large as the icon allows: they start one pixel in from every edge', corners && span.left === 1 && span.top === 1 && span.right === 14 && span.bottom === 14, JSON.stringify(span));

  // Gold that pops: bright at rest, brighter with a glow under the pointer. Same for Begin conquest.
  const look = (testid) => page.getByTestId(testid).evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, glow: cs.boxShadow.split('rgba(255, 214, 90').length - 1, opacity: cs.opacity }; });
  const light = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const OLD_GOLD = light('rgb(200, 150, 28)');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  const rulesRest = await look('rules-toggle');
  await toggle.hover();
  await page.waitForTimeout(300);
  const rulesHover = await look('rules-toggle');
  check(results, 'the Rules button is bright gold, and brighter with a glow when hovered', light(rulesRest.bg) > OLD_GOLD + 15 && light(rulesHover.bg) > light(rulesRest.bg) + 15 && rulesHover.glow === 1 && rulesRest.glow === 0, `${rulesRest.bg} -> ${rulesHover.bg}`);
  await page.getByTestId('search').fill('germ');
  await page.getByTestId('start-DEU').click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  const beginRest = await look('begin');
  await page.getByTestId('begin').hover();
  await page.waitForTimeout(300);
  const beginHover = await look('begin');
  check(results, 'Begin conquest is the same brighter gold, and brighter again when hovered', beginRest.bg === rulesRest.bg && beginHover.bg === rulesHover.bg && beginHover.glow === 1 && beginRest.opacity === '1', `${beginRest.bg} -> ${beginHover.bg}`);
  await page.getByTestId('search').fill('');

  // Open the rules: they take the place of the map.
  await toggle.click();
  const rules = page.getByTestId('rules');
  await rules.waitFor();
  const cover = await rect('rules');
  const under = await page.evaluate(() => { const el = document.elementFromPoint((440 + innerWidth) / 2, innerHeight / 2); return { inRules: Boolean(el?.closest('.rules')), onMap: Boolean(el?.closest('.map')) }; });
  check(results, 'pressing it replaces the map with the rules', cover.left === 440 && cover.right === view.w && cover.top === 0 && cover.bottom === view.h && under.inRules && !under.onMap, JSON.stringify({ cover, under }));
  box = await rect('rules-toggle');
  check(results, 'the button stays where it was and now leads back to the map', (await toggle.innerText()).trim() === 'Back to the map' && (await toggle.getAttribute('aria-expanded')) === 'true' && Math.abs(box.centre - (440 + view.w) / 2) <= 2);
  check(results, 'the start menu stays usable beside the rules', (await page.getByTestId('begin').isVisible()) && (await page.getByTestId('start-screen').isVisible()));

  const text = (await rules.innerText()).replace(/\s+/g, ' ');
  const chapters = await page.locator('.rule h2').allInnerTexts();
  check(results, 'ten chapters: the game, the goal, campaigns, the start, recruitment, enemies, battle, spoils, retreat, a growing empire', chapters.length === 10 && ['GAME', 'GOAL', 'CAMPAIGNS', 'START', 'RECRUITMENT', 'ENEMIES', 'BATTLE', 'SPOILS', 'RETREAT', 'EMPIRE'].every((word, i) => chapters[i].toUpperCase().includes(word)), chapters.map((c) => c.replace(/\s+/g, ' ')).join(' | '));
  const campaigns = await page.getByTestId('rules-campaigns').locator('li').allInnerTexts();
  const counts = await page.evaluate(() => Object.fromEntries(Object.entries(window.__atlas.data.worlds).map(([mode, w]) => [mode, w.ids.length])));
  check(results, 'it lists the 7 campaigns with their real sizes', campaigns.length === 7 && campaigns.every((c) => { const [, name, n] = /^(.*?)\s+(\d+)$/.exec(c.trim()); return counts[name] === Number(n); }) && /7 CAMPAIGNS/i.test(chapters[2]), campaigns.join(', '));
  const grades = await page.getByTestId('rules-grades').locator('td .badge').allInnerTexts();
  const ratingCounts = (await page.getByTestId('rules-rating-counts').innerText()).match(/\d+/g).map(Number);
  check(results, 'it explains the difficulty grading: a 3 x 4 table of grades, why, and how many countries get each', grades.length === 12 && grades[0].startsWith('Easy') && grades[11].startsWith('Extreme') && ratingCounts.length === 5 && ratingCounts.reduce((a, b) => a + b, 0) === 230 && /Why\?/.test(text) && /how well known it is/.test(text), `${grades.map((g) => g.replace(/\s+/g, ' ')).join(', ')} ; ${ratingCounts.join('+')}`);
  const ladder = await page.getByTestId('rules-ladder').locator('li').allInnerTexts();
  check(results, 'it shows a perfect recruit round climbing from 10,000 to 20,000, and says why recruiting matters', ladder.length === 6 && ladder[0].includes('10,000') && ladder[5].includes('20,000') && ladder[5].includes('+4,000') && /Why it matters/.test(text) && /only way to grow is to conquer/.test(text) && /up to 24,000/.test(text), ladder.map((l) => l.replace(/\s+/g, ' ')).join(' > '));
  const countries = await page.locator('.rule-country').evaluateAll((els) => els.map((el) => {
    const canvas = el.querySelector('canvas');
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 255) drawn++;
    return { id: el.dataset.id, defenders: Number(el.dataset.defenders), helmets: el.querySelectorAll('.helmet').length, drawn, pixelated: getComputedStyle(canvas).imageRendering, text: el.innerText.replace(/\s+/g, ' ') };
  }));
  check(results, 'it shows what a number of defenders looks like: Luxembourg 3,000, Ireland 6,000, France 9,000, India 13,000', countries.map((c) => `${c.id}:${c.defenders}`).join() === 'LUX:3,IRL:6,FRA:9,IND:13', countries.map((c) => c.text).join(' | '));
  check(results, 'each is drawn in pixels with one helmet per 1,000 defenders and "about N questions"', countries.every((c) => c.helmets === c.defenders && c.drawn > 150 && c.pixelated === 'pixelated' && c.text.includes(`about ${c.defenders} questions`) && c.text.includes(`${k(c.defenders)} enemies`) && c.text.includes(`worth +${k(c.defenders / 4)} troops`)) && /every 1,000 enemies is about one question/.test(text) && /worth \+750 troops/.test(countries[0].text) && /worth \+1,500 troops/.test(countries[1].text) && /worth \+2,250 troops/.test(countries[2].text) && /worth \+3,250 troops/.test(countries[3].text), countries.map((c) => `${c.id} ${c.helmets} helmets, ${c.drawn}px`).join(' ; '));
  const spoils = await page.getByTestId('rules-spoils').locator('tbody tr').allInnerTexts();
  check(results, 'it gives the spoils: a quarter of the enemies, from 3,000 for +750 up to 13,000 for +3,250', spoils.length === 6 && /^3,000\s+\+750$/.test(spoils[0].trim()) && /^6,000\s+\+1,500$/.test(spoils[2].trim()) && /^13,000\s+\+3,250$/.test(spoils[5].trim()) && /1,000 for every 4,000 enemies/.test(text), spoils.map((r) => r.replace(/\s+/g, ' ')).join(' ; '));
  check(results, 'it covers the goal, the single heart, the score, battles, the sea and retreat', /Fly your flag over every country/.test(text) && /single heart/.test(text) && /Score = countries conquered/.test(text) && /−2,000 of your own troops/.test(text) && /20 seconds/.test(text) && /third more enemies/.test(text) && /quarter of your army/.test(text) && /every country gains 1,000 enemies/.test(text) && !/defenders/i.test(text) && /on a sea you already have a coast on/.test(text));

  // Nothing spills, and the page scrolls under its plank rather than under the button.
  const fit = await page.evaluate(() => {
    const out = [];
    const rules = document.querySelector('.rules');
    if (rules.scrollWidth > rules.clientWidth + 1) out.push('the page scrolls sideways');
    for (const el of document.querySelectorAll('.rule, .rule-country, .rule-chips li, .ladder li, .rule-formula, .rule-callout, .rule-versus, .rule-table, .rules-hero')) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} "${el.innerText.slice(0, 30)}" is too wide`);
    }
    for (const step of document.querySelectorAll('.ladder li')) {
      const a = step.getBoundingClientRect(), b = step.parentElement.getBoundingClientRect();
      if (a.top < b.top - 1 || a.bottom > b.bottom + 1) out.push('a ladder step sticks out');
    }
    return out;
  });
  check(results, 'rules: every text fits its box', fit.length === 0, fit.join(' ; '));
  await rules.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(250);
  const end = await page.evaluate(() => {
    const credit = document.querySelector('[data-testid="rules-credit"]');
    const bar = document.querySelector('.rules-bar').getBoundingClientRect();
    const toggle = document.querySelector('[data-testid="rules-toggle"]').getBoundingClientRect();
    const r = credit.getBoundingClientRect();
    const all = document.querySelector('.rules-page').innerText.trim();
    return { text: credit.innerText.trim(), last: all.toLowerCase().endsWith('created by granit raf'), visible: r.top >= bar.bottom && r.bottom <= innerHeight, barTop: bar.top, buttonOnBar: toggle.top >= bar.top && toggle.bottom <= bar.bottom };
  });
  check(results, 'the rules end with "Created by Granit Raf"', /^Created by Granit Raf$/i.test(end.text) && end.last && end.visible, JSON.stringify(end));
  check(results, 'scrolled to the end, the button still sits on its plank at the top, clear of the text', end.barTop === 0 && end.buttonOnBar, JSON.stringify(end));
  await page.screenshot({ path: SHOTS + '56-rules-end.png' });
  await rules.evaluate((el) => el.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOTS + '55-rules.png' });

  // Three ways back to the map.
  await toggle.click();
  check(results, 'pressing the button again brings the map back', (await rules.count()) === 0 && (await toggle.innerText()).trim() === 'Rules' && (await page.evaluate(() => Boolean(document.elementFromPoint((440 + innerWidth) / 2, innerHeight / 2)?.closest('.map')))));
  await toggle.click();
  await rules.waitFor();
  await page.keyboard.press('Escape');
  check(results, 'Escape closes the rules', (await rules.count()) === 0);
  await toggle.click();
  await rules.waitFor();
  await page.getByTestId('rules-close').click();
  check(results, 'so does the button at the end of the rules', (await rules.count()) === 0);
  const z0 = (await mapEdges(page)).zoom;
  await page.getByLabel('Zoom in').click();
  await page.waitForTimeout(400);
  const z1 = (await mapEdges(page)).zoom;
  check(results, 'the map behind is untouched: it still zooms', z1 > z0, `${z0}x -> ${z1}x`);

  // Starting a game from inside the rules closes them, and the button is gone once the game is on.
  await toggle.click();
  await rules.waitFor();
  await startGame(page, 'World', 'DEU');
  check(results, 'beginning a conquest closes the rules; in a game there is no Rules button', (await rules.count()) === 0 && (await toggle.count()) === 0 && (await page.getByTestId('question-card').isVisible()));
});

// ---------------------------------------------------------- sound effects
// Which sound each thing makes. (The log records every sound the game asks for, audible or not.)
section('sound-effects', async (page) => {
  await open(page);
  await settle(page);
  const names = async () => (await sounds(page)).map((x) => x.name);
  const heardAfter = async (act) => { await hush(page); await page.waitForTimeout(90); await act(); await page.waitForTimeout(90); return names(); };
  const is = (list, expected) => list.join() === expected.join();

  // Designing the flag: the same blip for the preset, for each of the three colour slots, and for the palette.
  const preset = await heardAfter(() => page.getByTestId('flag-4').click());
  const slots = [];
  for (const i of [0, 1, 2]) slots.push((await heardAfter(() => page.getByTestId(`slot-${i}`).click())).join());
  const colour = await heardAfter(() => page.getByTestId('colour-2b4fc4').click());
  check(results, 'choosing a flag, a colour slot or a colour all make the same selection blip', is(preset, ['select']) && slots.every((x) => x === 'select') && is(colour, ['select']), `flag: ${preset}; slots: ${slots.join(' / ')}; colour: ${colour}`);

  // Difficulty filters: the same blip.
  const filters = [];
  for (const tier of ['easy', 'medium', 'hard', 'very-hard', 'extreme', 'all']) filters.push((await heardAfter(() => page.getByTestId(`filter-${tier}`).click())).join());
  check(results, 'All, Easy, Medium, Hard, Very Hard and Extreme make the selection blip', filters.every((x) => x === 'select'), filters.join(' / '));

  // Campaigns are announced by a voice, by their full names.
  const said = [];
  for (const mode of ['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']) {
    await hush(page);
    await page.getByTestId(`mode-${mode}`).click();
    const log = await sounds(page);
    said.push(log.length === 1 && log[0].name === 'voice' ? log[0].text : `?${JSON.stringify(log)}`);
  }
  check(results, 'each campaign button says its name: World, Africa, Asia, Europe, North America, South America, Oceania', said.join('|') === 'World|Africa|Asia|Europe|North America|South America|Oceania' && (await page.getByTestId('mode-North America').innerText()).startsWith('N. America'), said.join(', '));
  const voice = await page.evaluate(() => ({ can: 'speechSynthesis' in window, voices: speechSynthesis.getVoices().filter((v) => /^en[-_]GB/i.test(v.lang)).map((v) => v.name).slice(0, 6) }));
  console.log(`      (speech synthesis ${voice.can ? 'available' : 'missing'} here; British voices: ${voice.voices.join(', ') || 'none listed'})`);
  await page.getByTestId('mode-World').click();

  // The Rules button: a pulse under the pointer, a snap when pressed.
  await page.mouse.move(5, 5);
  const rulesHover = await heardAfter(() => page.getByTestId('rules-toggle').hover());
  const rulesClick = await heardAfter(() => page.getByTestId('rules-toggle').click());
  const rulesBack = await heardAfter(() => page.getByTestId('rules-toggle').click());
  check(results, 'Rules: a pulse on hover, a snap on click', is(rulesHover, ['pulse']) && is(rulesClick, ['snap']) && is(rulesBack, ['snap']), `hover: ${rulesHover}; click: ${rulesClick}; back: ${rulesBack}`);

  // Starting countries in the list: a pulse for each one the pointer passes, then snap + whoosh when picked.
  await page.getByTestId('search').fill('an');
  await page.mouse.move(5, 5);
  const rows = await page.locator('.country-row').evaluateAll((els) => els.slice(0, 3).map((el) => el.getAttribute('data-testid')));
  const passes = [];
  for (const row of rows) passes.push((await heardAfter(() => page.getByTestId(row).hover())).join());
  check(results, 'moving over starting countries in the list: a pulse for each', rows.length === 3 && passes.every((x) => x === 'pulse'), passes.join(' / '));
  await page.getByTestId('search').fill('germ');
  const rowPick = await heardAfter(() => page.getByTestId('start-DEU').click());
  check(results, 'picking a starting country: the snap, layered with a whoosh as the map zooms in', is(rowPick.filter((x) => x !== 'pulse'), ['snap', 'whoosh']), rowPick.join());
  await page.getByTestId('search').fill('');

  // The same on the map.
  await page.getByLabel('Show whole world').click();
  await settle(page);
  const overMap = async (id) => { const p = await pointOn(page, id); await page.mouse.move(p.x + 2, p.y + 2); await page.mouse.move(p.x, p.y); };
  await page.mouse.move(700, 40);
  const mapHover = [];
  for (const id of ['BRA', 'AUS', 'CHN']) mapHover.push((await heardAfter(() => overMap(id))).join());
  check(results, 'moving over countries on the map before the game: a pulse for each', mapHover.every((x) => x === 'pulse'), mapHover.join(' / '));
  const mapPick = await heardAfter(async () => { const p = await pointOn(page, 'BRA'); await page.mouse.click(p.x, p.y); });
  check(results, 'picking a starting country on the map: snap + whoosh', is(mapPick.filter((x) => x !== 'pulse'), ['snap', 'whoosh']) && (await page.getByTestId('pick').innerText()).includes('Brazil'), mapPick.join());

  // Begin conquest: a pulse on hover, then the siege call.
  await page.getByTestId('search').fill('germ');
  await page.getByTestId('start-DEU').click();
  await page.mouse.move(700, 40);
  const beginHover = await heardAfter(() => page.getByTestId('begin').hover());
  const beginClick = await heardAfter(() => page.getByTestId('begin').click());
  await page.getByTestId('question-card').waitFor();
  const call = (await sounds(page)).find((x) => x.name === 'siege');
  check(results, 'Begin conquest: a pulse on hover, then a trumpet call ("da-TUM") when pressed', is(beginHover, ['pulse']) && is(beginClick.filter((x) => x !== 'pulse'), ['siege']) && call.hz === 392, `hover: ${beginHover}; click: ${beginClick}`);

  // While a question is open the map is silent: no pulse, no snap, however the pointer moves.
  await settle(page);
  const quiet = await heardAfter(async () => {
    for (const id of ['FRA', 'POL', 'DEU', 'ITA']) { await overMap(id); await page.waitForTimeout(70); }
    const p = await pointOn(page, 'FRA');
    await page.mouse.click(p.x, p.y);
  });
  check(results, 'during recruit questions, moving over or clicking countries makes no sound', quiet.length === 0, quiet.join() || 'silence');
  await recruit(page);
  await settle(page);

  // Choosing a target: a pulse over countries you can attack, a snap (and no whoosh) when you pick one.
  await page.mouse.move(700, 40);
  const targetHover = [];
  for (const id of ['FRA', 'POL']) targetHover.push((await heardAfter(() => overMap(id))).join());
  const ownHover = await heardAfter(() => overMap('DEU'));
  check(results, 'choosing a target: a pulse over each attackable country, none over your own', targetHover.every((x) => x === 'pulse') && ownHover.length === 0, `targets: ${targetHover.join(' / ')}; own: ${ownHover.join() || 'silence'}`);
  const targetPick = await heardAfter(async () => { const p = await pointOn(page, 'FRA'); await page.mouse.click(p.x, p.y); });
  check(results, 'picking a target on the map: only the snap, no whoosh', is(targetPick.filter((x) => x !== 'pulse'), ['snap']) && /France/.test(await page.getByTestId('target-card').innerText()), targetPick.join());
  await page.getByText('Cancel').click();
  await page.mouse.move(700, 40);
  const chipHover = await heardAfter(() => page.getByTestId('target-POL').hover());
  const chipPick = await heardAfter(() => page.getByTestId('target-POL').click());
  check(results, 'the same in the target list: pulse on hover, snap on click', is(chipHover, ['pulse']) && is(chipPick.filter((x) => x !== 'pulse'), ['snap']), `hover: ${chipHover}; click: ${chipPick}`);

  // The Attack button fires: a deep "pew pew".
  const fire = await heardAfter(() => page.getByTestId('attack-button').click());
  await page.getByTestId('question-card').waitFor();
  const shot = (await sounds(page)).find((x) => x.name === 'attack');
  check(results, 'Attack: two deep shots ("pew pew"), low in pitch', is(fire.filter((x) => x !== 'pulse'), ['attack']) && shot.hz < 450, `${fire.join()} at ${shot?.hz} Hz`);

  // In battle the map is silent again.
  await settle(page, 1500);
  const battleQuiet = await heardAfter(async () => {
    for (const id of ['POL', 'DEU', 'CZE', 'UKR']) { const p = await pointOn(page, id); if (!p) continue; await page.mouse.move(p.x + 2, p.y + 2); await page.mouse.move(p.x, p.y); await page.waitForTimeout(70); }
    const p = await pointOn(page, 'DEU');
    if (p) await page.mouse.click(p.x, p.y);
  });
  check(results, 'during battle questions, moving over or clicking countries makes no sound', battleQuiet.length === 0, battleQuiet.join() || 'silence');
});

// ------------------------------------------------------------ leaderboard
// The global leaderboard. A stand-in answers for the Supabase project (see fakeLeaderboard in lib.mjs),
// so these checks cover everything the game does with it without touching a real database.
section('leaderboard', async (page, board) => {
  // Runs other players have already finished.
  for (const [name, score] of [['Alpha', 40], ['Bravo', 36], ['Charlie', 30], ['Delta', 24], ['Echo', 12], ['Foxtrot', 6]]) board.add('World', name, score);
  board.add('Europe', 'More battles', 20, { battles: 40 });
  board.add('Europe', 'Fewer battles', 20, { battles: 25 });
  for (const [name, score] of [['Third', 10], ['Fourth', 8], ['Fifth', 6]]) board.add('Europe', name, score);

  await open(page);
  await settle(page);
  const rect = (testid) => page.getByTestId(testid).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, centre: (r.left + r.right) / 2 }; });
  const look = (testid) => page.getByTestId(testid).evaluate((el) => { const cs = getComputedStyle(el); return [cs.backgroundColor, cs.borderTopColor, cs.color, cs.fontFamily, cs.fontSize, cs.fontWeight, cs.boxShadow].join(' | '); });
  const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const rulesBox = await rect('rules-toggle');
  const boardBox = await rect('leaderboard-toggle');
  check(results, 'a Leaderboard button sits to the right of the Rules button, on the same line', (await page.getByTestId('leaderboard-toggle').innerText()).trim() === 'Leaderboard' && boardBox.left >= rulesBox.right && boardBox.left - rulesBox.right <= 16 && boardBox.top === rulesBox.top && boardBox.bottom === rulesBox.bottom && boardBox.right <= view.w, JSON.stringify({ rulesBox, boardBox }));
  check(results, 'the Rules button is still centred above the map', Math.abs(rulesBox.centre - (440 + view.w) / 2) <= 2, `centre ${Math.round(rulesBox.centre)}`);
  await page.mouse.move(5, 5);
  check(results, 'it has the same gold, border, font and size as the Rules button', (await look('leaderboard-toggle')) === (await look('rules-toggle')), await look('leaderboard-toggle'));
  check(results, 'the start screen asks the leaderboard nothing until it is opened', board.requests.length === 0, `${board.requests.length} requests`);

  const names = async () => (await sounds(page)).map((x) => x.name);
  await hush(page);
  await page.getByTestId('leaderboard-toggle').hover();
  await page.waitForTimeout(90);
  const hoverSound = await names();
  await hush(page);
  await page.getByTestId('leaderboard-toggle').click();
  await page.waitForTimeout(90);
  const clickSound = await names();
  check(results, 'the Leaderboard button pulses under the pointer and snaps on a click, like Rules', hoverSound.join() === 'pulse' && clickSound.join() === 'snap', `hover: ${hoverSound}; click: ${clickSound}`);

  const hall = page.getByTestId('leaderboard');
  await page.locator('[data-testid="leaderboard"][data-status="ready"]').waitFor();
  const cover = await rect('leaderboard');
  const under = await page.evaluate(() => { const el = document.elementFromPoint((440 + innerWidth) / 2, innerHeight / 2); return { inBoard: Boolean(el?.closest('.leaderboard')), onMap: Boolean(el?.closest('.map')) }; });
  check(results, 'pressing it replaces the map with the leaderboard, beside a start menu that still works', cover.left === 440 && cover.right === view.w && cover.top === 0 && cover.bottom === view.h && under.inBoard && !under.onMap && (await page.getByTestId('begin').isVisible()), JSON.stringify({ cover, under }));
  const cards = await hall.locator('.board-card').evaluateAll((els) => els.map((el) => el.getAttribute('data-campaign')));
  check(results, 'it has a card for each of the seven campaigns', cards.join() === 'World,Africa,Asia,Europe,North America,South America,Oceania', cards.join());
  const rowsOf = (campaign) => page.getByTestId(`board-${campaign}`).locator('.board-row').evaluateAll((els) => els.map((el) => ({ rank: el.querySelector('.board-rank').innerText.trim(), name: el.querySelector('.board-name').innerText.trim(), score: el.querySelector('.board-score').innerText.trim(), flag: (() => { const c = el.querySelector('canvas.empire-flag'); return c ? `${c.width}x${c.height}` : null; })(), detail: el.querySelector('.board-detail')?.innerText.replace(/\s+/g, ' ').trim() })));
  const world = await rowsOf('World');
  check(results, 'World shows its top five in order, with rank, pixel flag, empire name and score', world.map((r) => `${r.rank} ${r.name} ${r.score}`).join(', ') === '1 Alpha 40, 2 Bravo 36, 3 Charlie 30, 4 Delta 24, 5 Echo 12' && world.every((r) => r.flag === '12x8'), JSON.stringify(world));
  check(results, 'a sixth run is not shown', !(await hall.innerText()).includes('Foxtrot'));
  check(results, 'each row says where the empire started and how far it got', world.every((r) => /France · \d+ countries/.test(r.detail)), world[0].detail);
  const europe = await rowsOf('Europe');
  check(results, 'a tie on score goes to the empire that fought fewer battles', europe.map((r) => r.name).join(' > ') === 'Fewer battles > More battles > Third > Fourth > Fifth', europe.map((r) => r.name).join(' > '));
  check(results, 'a campaign nobody has finished says so', /No empire has finished this campaign yet/.test(await page.getByTestId('board-Africa').innerText()) && (await page.getByTestId('board-Africa').locator('.board-row').count()) === 0);
  const asked = board.requests.filter((r) => r.name === 'top_runs');
  check(results, 'it reads every campaign in one call, with the public key, from the configured project', asked.length >= 1 && asked.every((r) => r.args.p_campaign === null && r.args.p_limit === 5 && r.headers.apikey === 'test-public-key' && r.url === 'https://leaderboard.invalid/rest/v1/rpc/top_runs'), JSON.stringify(asked.map((r) => [r.url, r.args])));
  const fit = await hall.evaluate((el) => ({ sideways: el.scrollWidth > el.clientWidth + 1, wide: [...el.querySelectorAll('.board-row, .board-card, .board-card h2')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className) }));
  check(results, 'leaderboard: every row fits its card', !fit.sideways && fit.wide.length === 0 && (await misfits(page)).length === 0, JSON.stringify(fit) + (await misfits(page)).join(' ; '));
  await page.screenshot({ path: SHOTS + '85-leaderboard.png' });

  // The two pages share the space above the map: each button leads to its own page and back.
  check(results, 'while it is open its button reads Back to the map, and Rules still reads Rules', (await page.getByTestId('leaderboard-toggle').innerText()).trim() === 'Back to the map' && (await page.getByTestId('rules-toggle').innerText()).trim() === 'Rules');
  await page.getByTestId('rules-toggle').click();
  await page.getByTestId('rules').waitFor();
  check(results, 'Rules opens the rule book in its place', (await hall.count()) === 0 && (await page.getByTestId('leaderboard-toggle').innerText()).trim() === 'Leaderboard');
  await page.getByTestId('leaderboard-toggle').click();
  await hall.waitFor();
  check(results, 'and Leaderboard brings the leaderboard back', (await page.getByTestId('rules').count()) === 0);
  await page.keyboard.press('Escape');
  check(results, 'Escape returns to the map', (await hall.count()) === 0 && (await page.getByTestId('leaderboard-toggle').innerText()).trim() === 'Leaderboard');

  // Names: letters, apostrophes and single spaces, 3 to 24 characters, and nothing offensive.
  await page.getByTestId('mode-Europe').click();
  await page.getByTestId('start-DEU').click();
  const field = page.getByTestId('empire-name');
  const begin = page.getByTestId('begin');
  const hint = page.getByTestId('name-hint');
  check(results, 'the name field carries the hint "Letters and apostrophes, 3 to 24 characters"', (await hint.innerText()).trim() === 'Letters and apostrophes, 3 to 24 characters' && !(await hint.evaluate((el) => el.classList.contains('bad'))));
  await field.fill('');
  await field.pressSequentially('N1gg@  88 Empire!!');
  check(results, 'numbers, symbols and double spaces never reach the field while typing', (await field.inputValue()) === 'Ngg Empire', await field.inputValue());
  await field.fill('x'.repeat(40));
  check(results, 'the field stops at 24 characters', (await field.inputValue()).length === 24);
  await field.fill('');
  await field.pressSequentially("King’s  Dragons' Realm");
  check(results, 'apostrophes are allowed, and a curly one becomes straight', (await field.inputValue()) === "King's Dragons' Realm" && (await page.getByTestId('name-warning').count()) === 0 && (await begin.isEnabled()), await field.inputValue());
  await field.fill('Ro');
  check(results, 'a name under 3 letters turns the hint red and disables Begin conquest', (await begin.isDisabled()) && (await hint.evaluate((el) => el.classList.contains('bad'))));
  await field.fill('Essex Rising');
  check(results, 'an innocent name that contains a blocked word is accepted', (await page.getByTestId('name-warning').count()) === 0 && (await begin.isEnabled()));
  await field.fill('Kikeland');
  const warning = (await page.getByTestId('name-warning').innerText()).trim();
  check(results, 'an offensive name gets a neutral message that never repeats the word, and Begin conquest is disabled', warning === "That name isn't allowed. Try another." && (await begin.isDisabled()), warning);
  await page.getByTestId('start-DEU').dblclick();
  check(results, 'double-clicking a country does not start a game under it either', (await page.getByTestId('start-screen').isVisible()) && (await state(page)) === null);
  await field.fill('');
  check(results, 'an empty name is fine: the empire is named after its home country', await begin.isEnabled());

  /** Starts a game and loses it at once: every recruit question wrong, then every answer of the first battle. */
  const lose = async (mode, id) => {
    await startGame(page, mode, id);
    await recruit(page, [false, false, false, false, false]);
    await page.locator('.target-chip').first().click();
    await page.getByTestId('attack-button').click();
    await page.getByTestId('question-card').waitFor();
    for (let i = 0; i < 4; i++) await answer(page, false);
    await answer(page, false, { wait: false });
    await page.getByTestId('gameover-screen').waitFor();
    return state(page);
  };
  const endBoard = page.getByTestId('end-board');
  const ready = () => page.locator('[data-testid="end-board"][data-status="ready"]').waitFor();
  const endRows = () => endBoard.locator('.board-row').evaluateAll((els) => els.map((el) => ({ rank: el.querySelector('.board-rank').innerText.trim(), name: el.querySelector('.board-name').innerText.trim(), score: el.querySelector('.board-score').innerText.trim(), mine: el.classList.contains('mine'), flag: Boolean(el.querySelector('canvas.empire-flag')) })));

  // A run that ends outside the top five.
  let s = await lose('Europe', 'DEU');
  check(results, 'a run started with no name is named after its home country, in a name that passes', s.empire.name === 'Empire of Germany', s.empire.name);
  await ready();
  const sent = board.requests.filter((r) => r.name === 'submit_run');
  const run = sent[0]?.args ?? {};
  const fields = ['p_battles', 'p_best_streak', 'p_campaign', 'p_conquered', 'p_continents', 'p_empire_name', 'p_flag_colours', 'p_flag_pattern', 'p_outcome', 'p_run_id', 'p_score', 'p_start_country'];
  check(results, 'the finished run is sent once, with exactly the agreed fields and nothing personal', sent.length === 1 && Object.keys(run).sort().join() === fields.join() && sent[0].url === 'https://leaderboard.invalid/rest/v1/rpc/submit_run', `${sent.length} sent: ${Object.keys(run).sort().join()}`);
  check(results, 'it carries the campaign, empire name, flag, start, score, conquests, continents, battles, streak and outcome', run.p_campaign === 'Europe' && run.p_empire_name === 'Empire of Germany' && run.p_flag_pattern === s.empire.flag.pattern && run.p_flag_colours.join() === s.empire.flag.colours.join() && run.p_start_country === 'DEU' && run.p_score === 0 && run.p_conquered === 0 && run.p_continents === 0 && run.p_battles === 1 && run.p_best_streak === s.bestStreak && run.p_outcome === 'defeat' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run.p_run_id), JSON.stringify(run));
  let rows = await endRows();
  check(results, 'the end screen shows the global top five for that campaign', /Global top 5\s+Europe/i.test((await endBoard.innerText()).replace(/\s+/g, ' ')) && rows.slice(0, 5).map((r) => r.name).join(' > ') === 'Fewer battles > More battles > Third > Fourth > Fifth' && rows.every((r) => r.flag), JSON.stringify(rows));
  check(results, 'a run outside the top five is added below it, highlighted, with its rank', rows.length === 6 && rows[5].mine && rows[5].rank === '6' && rows[5].name === 'Empire of Germany' && rows.filter((r) => r.mine).length === 1 && /ranks #6/.test(await page.getByTestId('board-standing').innerText()), JSON.stringify(rows[5]) + ' ' + (await page.getByTestId('board-standing').innerText()));
  const endFit = await page.evaluate(() => { const end = document.querySelector('.end').getBoundingClientRect(); return [...document.querySelectorAll('.end-board, .end-board .board-row')].filter((el) => { const r = el.getBoundingClientRect(); return r.left < end.left || r.right > end.right || el.scrollWidth > el.clientWidth + 1; }).length; });
  check(results, 'end screen: the leaderboard fits inside the panel, and Play again is still there', endFit === 0 && (await misfits(page)).length === 0 && (await page.getByTestId('play-again').isVisible()), `${endFit} outside; ${(await misfits(page)).join(' ; ')}`);
  await page.screenshot({ path: SHOTS + '86-end-leaderboard.png' });

  // Looking at the same finished run again does not count it twice.
  await page.reload();
  await page.getByTestId('gameover-screen').waitFor();
  await ready();
  const again = board.requests.filter((r) => r.name === 'submit_run');
  check(results, 'after a refresh the same run id is sent again, and the board still holds it once', again.length === 2 && again[1].args.p_run_id === run.p_run_id && board.rows.filter((r) => r.run_id === run.p_run_id).length === 1 && (await endRows())[5]?.rank === '6', `${again.length} sent, ${board.rows.filter((r) => r.run_id === run.p_run_id).length} stored`);
  await page.getByTestId('play-again').click();
  await page.getByTestId('start-screen').waitFor();

  // A run that makes the top five: nobody has finished Oceania yet.
  await page.getByTestId('empire-name').fill('Southern Cross');
  s = await lose('Oceania', 'AUS');
  await ready();
  rows = await endRows();
  const second = board.requests.filter((r) => r.name === 'submit_run').at(-1).args;
  check(results, 'a new game is a new run, under the name it was given', second.p_run_id !== run.p_run_id && second.p_empire_name === 'Southern Cross' && second.p_campaign === 'Oceania');
  check(results, 'a run inside the top five is highlighted where it stands', rows.length === 1 && rows[0].mine && rows[0].rank === '1' && rows[0].name === 'Southern Cross' && /greatest/i.test(await page.getByTestId('board-standing').innerText()), JSON.stringify(rows));

  // The leaderboard refuses the run: the board is still shown, and the game says the run was not recorded.
  board.mode = 'reject';
  await page.reload();
  await page.getByTestId('gameover-screen').waitFor();
  await ready();
  check(results, 'a run the leaderboard refuses is reported as not recorded, beside the top five', /could not be recorded/i.test(await page.getByTestId('board-standing').innerText()) && (await endRows()).length === 1);

  // The leaderboard is unreachable: the end screen says so, and everything else carries on.
  board.mode = 'down';
  await page.reload();
  await page.getByTestId('gameover-screen').waitFor();
  await page.locator('[data-testid="end-board"][data-status="unavailable"]').waitFor();
  check(results, 'with the leaderboard unreachable the end screen says it is unavailable and keeps its score', /Leaderboard unavailable/i.test(await endBoard.innerText()) && (await page.getByTestId('stat-score').innerText()) === '0' && /Game over/i.test(await page.getByTestId('gameover-screen').innerText()));
  await page.getByTestId('play-again').click();
  await page.getByTestId('start-screen').waitFor();
  await page.getByTestId('leaderboard-toggle').click();
  await page.getByTestId('leaderboard-unavailable').waitFor();
  check(results, 'the Leaderboard page says it is unavailable, and the start menu still works beside it', /unavailable/i.test(await hall.innerText()) && (await hall.locator('.board-card').count()) === 0 && (await page.getByTestId('begin').isVisible()));
  board.mode = 'ok';
  await page.getByTestId('leaderboard-retry').click();
  await page.locator('[data-testid="leaderboard"][data-status="ready"]').waitFor();
  check(results, 'Try again loads it once the leaderboard is back', (await rowsOf('Oceania')).map((r) => r.name).join() === 'Southern Cross' && (await rowsOf('Europe')).length === 5);
  await page.getByTestId('leaderboard-close').click();

  // And a whole game still plays with the leaderboard gone.
  board.mode = 'down';
  await startGame(page, 'Europe', 'DEU');
  await recruit(page);
  await attack(page, 'LUX');
  const after = await fight(page, true);
  check(results, 'with the leaderboard unreachable a game still starts, recruits, attacks and conquers', after.phase === 'attack' && after.owned.includes('LUX'), after.phase);
  board.mode = 'ok';
});

// ----------------------------------------------------------------- runner
for (const [name, fn] of Object.entries(sections)) {
  if (only && only !== name) continue;
  console.log(`\n=== ${name} ===`);
  const { browser, page, problems, board } = await launch();
  try {
    await fn(page, board);
  } catch (err) {
    check(results, `${name}: ran to completion`, false, err.message.split('\n')[0]);
    await page.screenshot({ path: SHOTS + `error-${name}.png` }).catch(() => {});
  }
  check(results, `${name}: no console errors, warnings or failed requests`, problems.length === 0, problems.slice(0, 5).join(' ; '));
  allProblems.push(...problems);
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length ? 1 : 0);
