// Samples every frame of the confirmed transitions of the player page and prints the numbers the document promises, so a change that breaks one shows up.
// Needs the app and the data server running. Run:  PLAYWRIGHT_CORE=<path to playwright-core> node scripts/perf/transitions.cjs [http://localhost:3100]
// Read the output against the "What to check" lines of the transitions. It prints, it does not judge.
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const base = process.argv[2] ?? 'http://localhost:3100';
(async () => {
  const b = await webkit.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
  await page.goto(`${base}/players/ba607b88?format=ODI`); await page.waitForTimeout(8000);

  // One sample per animation frame, every 8th printed: time, opacity of the profile summary, the new row, the leaving layer, the new row's left edge and the layer's left edge.
  const sample = async (label, act, ms = 1800) => {
    await page.evaluate((ms) => {
      window.__s = []; const t0 = performance.now();
      // Visited views are kept in the page, so the pane on screen is the one that is displayed.
      const shown = () => [...document.querySelectorAll('.app > .pane:not(.ghost)')].find((p) => getComputedStyle(p).display !== 'none');
      const sel = (q) => (q.startsWith('.pane:not(.ghost) ') ? shown()?.querySelector(q.slice(18)) : document.querySelector(q));
      const op = (q) => { const e = sel(q); return e ? (+getComputedStyle(e).opacity).toFixed(2) : '-'; };
      const left = (q) => { const e = sel(q); return e ? Math.round(e.getBoundingClientRect().left) : '-'; };
      const tick = () => { const n = performance.now() - t0;
        window.__s.push([Math.round(n), 'sum', op('.sum'), 'row', op('.pane:not(.ghost) .car'), 'layer', op('.pane.ghost'), 'rowLeft', left('.pane:not(.ghost) .car'), 'layerLeft', left('.pane.ghost .car')]);
        if (n < ms) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, ms);
    await act(); await page.waitForTimeout(ms + 300);
    console.log('==', label); console.log((await page.evaluate(() => window.__s)).filter((_, i) => i % 8 === 0).map((x) => x.join(' ')).join('\n'));
  };
  const view = (re) => () => page.locator('#vsw button').filter({ hasText: re }).first().click();
  await sample('profile to Batting', () => page.locator('.pgx .btn').filter({ hasText: /^Batting analysis/ }).first().click());
  await page.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) { await page.locator('.arr.r').click(); await page.waitForTimeout(900); }
  await sample('Batting (tiles 4 and 5) to Bowling: the layer leaves left, the row comes from the right', view(/^Bowling/));
  await page.waitForTimeout(2500);
  await sample('Bowling to Batting: the reverse (Batting is kept in the page, so it slides in with its tiles where they were)', view(/^Batting/));
  await page.waitForTimeout(2500);
  await sample('Batting to the profile: the layer fades, then the profile', () => page.locator('.trt .mini').click());
  await page.waitForTimeout(1500);
  console.log('errors', JSON.stringify(errors));
  await b.close();
})();
