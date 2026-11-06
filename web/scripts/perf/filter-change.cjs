// How long a filter change takes to update the two tiles on screen (Key numbers and Form) and the totals beside the filters, for the busiest players. Budget: 300 ms.
// BASE=<url> tests another address (the live site). Run:  PLAYWRIGHT_CORE=<path> node scripts/perf/filter-change.cjs <seconds the page has been open, in ms, e.g. 8000>
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const cases = [['ba607b88','Kohli ODI batting','batting','ODI','Phase'],['462411b3','Bumrah Tests bowling','bowling','TEST','Overs'],['462411b3','Bumrah ODI bowling','bowling','ODI','Phase']];
  for (const [id, label, view, fmt, ctl] of cases) {
    await page.goto(`${process.env.BASE || 'http://localhost:3101'}/players/${id}?view=${view}&format=${fmt}`); await page.waitForTimeout(Number(process.argv[2]||6000));
    const sel = page.locator(`.bfbar select[aria-label="${ctl}"]`);
    const opts = await sel.locator('option:not([disabled])').evaluateAll(o => o.map(x => x.value));
    const times = [];
    for (const v of [opts[1], opts[0], opts[2] ?? opts[1]].filter(Boolean)) {
      const before = await page.evaluate(() => document.querySelector('.bfbar').innerText);
      await page.evaluate(() => { window.__done = null; window.__t0 = performance.now(); });
      await sel.selectOption(v);
      // updated when the totals beside the filters have changed and no tile on screen is loading
      await page.evaluate((b4) => { const tick = () => { const t = document.querySelector('.car > .tile'); const bar = document.querySelector('.bfbar').innerText; if (window.__done === null && bar !== b4 && ![...document.querySelectorAll('.car > .tile')].slice(0,2).some(t=>t.querySelector('[role=status]'))) window.__done = Math.round(performance.now() - window.__t0); if (window.__done === null) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, before);
      await page.waitForFunction(() => window.__done !== null, null, { timeout: 10000 }).catch(() => {});
      times.push(await page.evaluate(() => window.__done)); await page.waitForTimeout(800);
    }
    console.log(label, 'filter changes (ms to updated totals and no loader):', times.join(', '));
  }
  await b.close();
})();
