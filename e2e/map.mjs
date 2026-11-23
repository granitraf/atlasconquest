// The map: one dense pixel grid for terrain and borders, with working zoom and pan.
import { launch, SHOTS, check, open, pointOn, countPixels, settle, startGame } from './lib.mjs';
const results = [];
const { browser, page, problems } = await launch();
await open(page);
await page.waitForTimeout(600);
const zoomText = () => page.locator('.zoom-level').innerText();
const transform = () => page.evaluate(() => document.querySelector('.map-hit g').getAttribute('transform'));

// Everything on the map is drawn into one low-resolution pixel grid and scaled up without smoothing.
const grid = () => page.evaluate(() => {
  const map = document.querySelector('.map');
  const base = document.querySelector('.pixel-base');
  const fx = document.querySelector('.pixel-fx');
  return {
    cellPx: Number(map.dataset.cellPx),
    cell: Number(map.dataset.cell),
    terrainWidth: Number(map.dataset.terrainWidth),
    terrain: document.querySelector('.app').dataset.terrain,
    rendering: [getComputedStyle(base).imageRendering, getComputedStyle(fx).imageRendering],
    canvas: [base.width, base.height],
    view: [map.clientWidth, map.clientHeight],
  };
});
let g = await grid();

// Start screen only: wood planks fill the space the map does not cover, and a gold trim sits on
// the map's top and bottom edges. Neither is part of the map, so neither zooms.
const frame = () => page.evaluate(() => {
  const map = document.querySelector('.map');
  const style = getComputedStyle(map);
  const box = map.getBoundingClientRect();
  const [, ty, k] = /translate\([^,]+,([^)]+)\) scale\(([^)]+)\)/.exec(document.querySelector('.map-hit g').getAttribute('transform')).map(Number);
  const edge = (sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return { shown: getComputedStyle(el).display !== 'none', top: r.top - box.top, bottom: r.bottom - box.top, width: r.width, events: getComputedStyle(el).pointerEvents };
  };
  return {
    wood: style.backgroundImage,
    repeat: style.backgroundRepeat,
    size: style.backgroundSize,
    mapTransform: style.transform,
    mapTop: ty,
    mapBottom: ty + 1024 * k,
    width: box.width,
    top: edge('.map-edge-top'),
    bottom: edge('.map-edge-bottom'),
  };
});
const near = (a, b) => Math.abs(a - b) <= 1;
const f0 = await frame();
check(results, 'start screen: wood plank texture fills the space around the map', f0.wood.startsWith('url("data:image/png') && f0.repeat === 'repeat', `${f0.wood.slice(0, 28)}… ${f0.repeat}`);
check(results, 'start screen: gold trim sits on the top and bottom edges of the map', f0.top.shown && f0.bottom.shown && near(f0.top.bottom, f0.mapTop) && near(f0.bottom.top, f0.mapBottom), `trim ${f0.top.bottom.toFixed(1)} / ${f0.bottom.top.toFixed(1)}, map ${f0.mapTop.toFixed(1)} / ${f0.mapBottom.toFixed(1)}`);
check(results, 'the trim runs the full width and never catches the pointer', near(f0.top.width, f0.width) && near(f0.bottom.width, f0.width) && f0.top.events === 'none' && f0.bottom.events === 'none', `${f0.top.width} of ${f0.width}`);
check(results, 'terrain is the bundled Blue Marble at 4096x2048', g.terrain === 'bluemarble' && g.terrainWidth === 4096, JSON.stringify(g));
check(results, 'map layers are scaled with image-rendering: pixelated', g.rendering.every((r) => r === 'pixelated'), g.rendering.join(', '));
check(results, 'map is drawn at pixel-grid resolution, not screen resolution', g.canvas[0] < g.view[0] && g.canvas[0] >= g.view[0] / 4, `canvas ${g.canvas.join('x')} for a ${g.view.join('x')} view`);
check(results, 'map pixels are 2 to 4 screen px at world zoom', g.cellPx >= 2 && g.cellPx < 4, `${g.cellPx}px, cell = ${g.cell} map units`);
check(results, '230 country shapes are hit-testable', (await page.locator('path.country').count()) === 230, String(await page.locator('path.country').count()));
check(results, 'small-country markers exist', (await page.locator('.marker').count()) > 30, String(await page.locator('.marker').count()));
// Borders are part of the pixel grid: a dark line darkens whole cells. Compare a border cell with the land beside it.
const dark = await page.evaluate(() => {
  const c = document.querySelector('.pixel-base');
  const copy = document.createElement('canvas');
  copy.width = c.width;
  copy.height = c.height;
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(c, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] < 60 && d[i + 1] < 70 && d[i + 2] < 80) n++;
  return n;
});
check(results, 'borders are drawn as pixels in the grid', dark > 2000, `${dark} border pixels`);

check(results, 'starts at 1.0x', (await zoomText()) === '1.0×', await zoomText());
const map = page.locator('.map');
const box = await map.boundingBox();
const cx = box.x + box.width * 0.55, cy = box.y + box.height * 0.33;

// wheel zoom in
await page.mouse.move(cx, cy);
const t0 = await transform();
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(40); }
await page.waitForTimeout(300);
const afterWheel = parseFloat(await zoomText());
check(results, 'mouse wheel zooms in', afterWheel > 1.5 && (await transform()) !== t0, `${afterWheel}x`);
await page.screenshot({ path: SHOTS + '02-zoom-wheel.png' });

// drag pans
const t1 = await transform();
await page.mouse.down(); await page.mouse.move(cx - 180, cy + 60, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(150);
const t2 = await transform();
check(results, 'drag pans the map', t1 !== t2, `${t1} -> ${t2}`);
const f1 = await frame();
check(results, 'zoomed and panned: the trim follows the map edges', near(f1.top.bottom, f1.mapTop) && near(f1.bottom.top, f1.mapBottom) && f1.mapBottom - f1.mapTop > (f0.mapBottom - f0.mapTop) * 1.4, `trim ${f1.top.bottom.toFixed(1)} / ${f1.bottom.top.toFixed(1)}, map ${f1.mapTop.toFixed(1)} / ${f1.mapBottom.toFixed(1)}`);
check(results, 'zoomed and panned: the wood does not zoom or move', f1.wood === f0.wood && f1.size === f0.size && f1.mapTransform === 'none' && near(f1.top.bottom - f1.top.top, 8), `size ${f1.size}, transform ${f1.mapTransform}`);

// + button up to the max
for (let i = 0; i < 14; i++) { await page.getByLabel('Zoom in').click(); await page.waitForTimeout(260); }
const max = parseFloat(await zoomText());
check(results, '+ button zooms, capped at 40x', max === 40, `${max}x`);
await page.screenshot({ path: SHOTS + '03-zoom-max.png' });
g = await grid();
check(results, 'at 40x the grid is finer but pixels are still 2 to 4 screen px (lines stay crisp)', g.cellPx >= 2 && g.cellPx < 4 && g.cell < 0.5, `${g.cellPx}px, cell = ${g.cell} map units`);
// Halfway in, a different grid level is in use: pixel size on screen stays in range at every zoom.
const seen = [];
for (let i = 0; i < 6; i++) { await page.getByLabel('Zoom out').click(); await page.waitForTimeout(260); seen.push((await grid()).cellPx); }
check(results, 'pixel size stays in range while zooming', seen.every((px) => px >= 2 && px < 4), seen.join(', '));
for (let i = 0; i < 6; i++) { await page.getByLabel('Zoom in').click(); await page.waitForTimeout(260); }

// keyboard + - and minus button back to the min
await page.keyboard.press('-'); await page.waitForTimeout(300);
check(results, 'keyboard - zooms out', parseFloat(await zoomText()) < 40, await zoomText());
for (let i = 0; i < 14; i++) { await page.getByLabel('Zoom out').click(); await page.waitForTimeout(260); }
check(results, '- button zooms, floored at 1x', (await zoomText()) === '1.0×', await zoomText());
for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(30); }
check(results, 'wheel cannot zoom out below 1x', (await zoomText()) === '1.0×', await zoomText());

// hover tooltip
const brazil = await pointOn(page, 'BRA');
await page.mouse.move(brazil.x, brazil.y);
await page.waitForTimeout(150);
const tip = await page.locator('.map-tooltip').innerText();
check(results, 'hover shows country name tooltip', tip.includes('Brazil'), tip.replace(/\n/g, ' | '));
await page.screenshot({ path: SHOTS + '04-tooltip.png' });

// clicking a country on the map selects it as the start
await page.mouse.click(brazil.x, brazil.y);
await settle(page);
check(results, 'clicking the map selects a start country', (await page.getByTestId('pick').innerText()).includes('Brazil'));
check(results, 'the selected country gets a hard-edged gold pixel outline', (await countPixels(page, 'fx', [255, 209, 102])) > 100, `${await countPixels(page, 'fx', [255, 209, 102])} gold pixels`);
await page.screenshot({ path: SHOTS + '05-start-selected.png' });

// search
await page.getByTestId('search').fill('germ');
check(results, 'search filters the list', (await page.locator('.country-row').count()) === 1 && (await page.locator('.country-row').innerText()).includes('Germany'));
await page.getByTestId('search').fill('reykj');
check(results, 'search also matches capitals', (await page.locator('.country-row').innerText()).includes('Iceland'));
await page.getByTestId('search').fill('zzzz');
check(results, 'empty search result is explained', (await page.locator('.empty').count()) === 1);
await page.getByTestId('search').fill('');

// A very wide monitor: the planks and the trim simply run on.
await page.setViewportSize({ width: 2560, height: 1440 });
await page.getByLabel('Show whole world').click();
await settle(page);
await page.waitForTimeout(300);
const wide = await frame();
check(results, 'wide monitor: planks and trim span the whole width', wide.width > 2000 && near(wide.top.width, wide.width) && wide.mapTop > 100 && near(wide.top.bottom, wide.mapTop) && near(wide.bottom.top, wide.mapBottom), `${wide.top.width} of ${wide.width}, bars ${wide.mapTop.toFixed(0)}px`);
await page.screenshot({ path: SHOTS + '06-start-wide.png' });
await page.setViewportSize({ width: 1440, height: 860 });
await settle(page);

// Once a game starts the planks and the trim are gone.
await startGame(page, 'World', 'DEU');
const played = await frame();
check(results, 'in a game the wood and the gold trim are gone', played.wood === 'none' && !played.top.shown && !played.bottom.shown, `${played.wood}, trim shown: ${played.top.shown}/${played.bottom.shown}`);

check(results, 'no console errors or failed requests', problems.length === 0, problems.join(' ; '));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
