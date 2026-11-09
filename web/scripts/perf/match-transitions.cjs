// Samples every frame of the Match page's transitions that exist so far: summary to Details, Details to the summary, and another match inside Details. Analysis and Replay
// are placeholders and have no row to slide, so their transitions are added when they are built. Prints the numbers, it does not judge. Needs the app and the data server running.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-transitions.cjs [chromium|webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await (process.argv[2] === 'chromium' ? chromium : webkit).launch();
  const page = await (await b.newContext({ viewport: { width: 1352, height: 697 } })).newPage();
  const errors = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text().slice(0, 120)); });
  await page.goto('http://localhost:3100/matches/335982'); await page.waitForSelector('.resbar'); await page.waitForTimeout(2500);
  const sample = async (label, act, ms = 1800) => {
    await page.evaluate((ms) => {
      window.__s = []; const t0 = performance.now();
      const shown = () => [...document.querySelectorAll('.app > .pane:not(.ghost)')].find((p) => getComputedStyle(p).display !== 'none' && getComputedStyle(p).visibility !== 'hidden');
      const op = (el) => (el ? (+getComputedStyle(el).opacity).toFixed(2) : '-');
      const tick = () => { const n = performance.now() - t0; const pane = shown(); const car = pane?.querySelector('.car'); const ghost = document.querySelector('.pane.ghost');
        window.__s.push([Math.round(n), 'sum', op(document.querySelector('.sum')), 'row', op(car), 'layer', op(ghost), 'rowLeft', car ? Math.round(car.getBoundingClientRect().left) : '-', 'rail', op(pane?.querySelector('.rail')), 'top', op(document.querySelector('.top'))]);
        if (n < ms) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, ms);
    await act(); await page.waitForTimeout(ms + 300);
    const rows = await page.evaluate(() => window.__s);
    console.log('==', label); console.log(rows.filter((_, i) => i % 6 === 0).map((x) => x.join(' ')).join('\n'));
    // The row must reach full opacity and never dip after it has: the first frame at 1.00 and the lowest value after it.
    const vals = rows.map((r) => r[4]).filter((v) => v !== '-').map(Number); const at = vals.findIndex((v) => v >= 0.99);
    if (at >= 0) console.log(`row reaches 1.00 at frame ${at}; lowest after it ${Math.min(...vals.slice(at)).toFixed(2)}`);
  };
  await sample('summary to Details', () => page.locator('.mact .btn').filter({ hasText: 'Match details' }).click());
  await page.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) { await page.locator('.arr.r').click(); await page.waitForTimeout(900); }
  await sample('Details (part 4) to the summary: the layer fades, then the summary', () => page.locator('.top .mini').filter({ hasText: 'Summary' }).click());
  await page.waitForTimeout(1500);
  await sample('summary to Details again (a fresh row, opens on the first part)', () => page.locator('.mact .btn').filter({ hasText: 'Match details' }).click());
  await page.waitForTimeout(2000);
  for (let i = 0; i < 2; i++) { await page.locator('.arr.r').click(); await page.waitForTimeout(900); }
  await page.locator('.top .tchg .mini').click(); await page.locator('.top input').fill('india pakistan'); await page.waitForTimeout(900);
  await sample('Change match inside Details (the row opens on the same part for the new match)', async () => { await page.locator('.top input').press('Enter'); }, 2200);
  const where = await page.evaluate(() => ({ url: location.pathname.slice(0, 50) + location.search, first: document.querySelector('.car')?.getAttribute('data-first') }));
  console.log('after the change:', JSON.stringify(where)); console.log('errors', JSON.stringify(errors));
  await b.close();
})();
