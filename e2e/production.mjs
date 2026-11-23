// Production build smoke test: the dev hook is not shipped, so this plays by the DOM alone,
// with every request to another origin blocked to prove the game needs no live API.
import { launch, check, BASE, SHOTS } from './lib.mjs';
const results = [];
const { browser, page, problems } = await launch();
const external = [];
// Block every request that is not to this origin: the game must not need the network.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE) || url.startsWith('data:')) return route.continue();
  external.push(url);
  return route.abort();
});
await page.goto(BASE);
await page.getByTestId('start-screen').waitFor({ timeout: 20000 });
check(results, 'production build loads', true);
check(results, 'debug hook is not shipped', (await page.evaluate(() => typeof window.__atlas)) === 'undefined');
check(results, '230 countries listed', (await page.locator('.country-row').count()) === 230);
// Every country's flag image is bundled in both sizes and decodes.
const flags = await page.evaluate(async () => {
  const countries = await (await fetch('data/countries.json')).json();
  const broken = [];
  await Promise.all(countries.flatMap((c) => ['s', 'l'].map(async (size) => {
    const img = new Image();
    img.src = `flags/${size}/${c.cca2}.png`;
    try { await img.decode(); if (!img.naturalWidth) broken.push(img.src); } catch { broken.push(img.src); }
  })));
  return { total: countries.length * 2, broken };
});
check(results, 'all 460 flag images (230 countries, 2 sizes) load, none broken', flags.total === 460 && flags.broken.length === 0, JSON.stringify(flags.broken.slice(0, 5)));
check(results, 'the empire designer is present', (await page.locator('.flag-presets .preset').count()) === 16);
await page.getByTestId('search').fill('germany');
await page.getByTestId('start-DEU').click();
await page.getByTestId('begin').click();
await page.getByTestId('question-card').waitFor();
// Play the opening recruit phase by clicking options blindly. There is no Continue button: the UI must
// carry us from question to question, and on to the attack phase, by itself.
for (let i = 0; i < 5; i++) {
  await page.getByTestId('option-0').click();
  await page.getByTestId('verdict').waitFor();
  if ((await page.getByTestId('continue').count()) !== 0) throw new Error('a Continue button is on screen');
  await page.getByTestId('verdict').waitFor({ state: 'detached', timeout: 8000 });
}
await page.getByTestId('attack-panel').waitFor();
check(results, 'the recruit phase plays through to the attack phase with no Continue button', true);
check(results, 'there is no End turn button', (await page.getByTestId('end-turn').count()) === 0 && !/end turn/i.test(await page.getByTestId('attack-panel').innerText()));
check(results, 'France is attackable from Germany in the production build', (await page.getByTestId('target-FRA').count()) === 1);
await page.getByTestId('target-FRA').click();
await page.getByTestId('attack-button').click();
await page.getByTestId('question-card').waitFor();
await page.getByTestId('option-1').click();
await page.getByTestId('verdict').waitFor();
check(results, 'battle runs', (await page.getByTestId('battle-defenders').count()) === 1);
check(results, 'there is no Continue button: the next question arrives by itself', (await page.getByTestId('continue').count()) === 0);
await page.getByTestId('verdict').waitFor({ state: 'detached', timeout: 8000 });
await page.getByTestId('retreat').waitFor();
const saved = await page.evaluate(() => localStorage.getItem('atlas-conquest:save:v1'));
await page.reload();
await page.getByTestId('question-card').waitFor();
check(results, 'refresh resumes from localStorage', (await page.evaluate(() => localStorage.getItem('atlas-conquest:save:v1'))) === saved && (await page.getByTestId('battle-defenders').count()) === 1);
const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
check(results, 'no broken images in game', broken === 0);
check(results, 'no request left this origin', external.length === 0, external.join(', '));
check(results, 'no console errors or failed requests', problems.length === 0, problems.slice(0, 4).join(' ; '));
await page.screenshot({ path: SHOTS + '80-production.png' });
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
