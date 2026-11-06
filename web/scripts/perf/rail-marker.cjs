// The rail's marker is the same every time. A view that opens at its start put the white dot on the first tile in about one load in twelve and on the last tile on screen
// in the others, so a page looked different from one visit to the next. This opens each page several times, switches through its views and reads which dot is marked and which are the other tiles on screen in every
// kept view. A step that ends in more than one marking fails.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/rail-marker.cjs [webkit] [runs]     (default 10 runs a page)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv.includes('webkit') ? webkit : chromium;
const RUNS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 10);
const PAGES = [
  ['player', '/players/ba607b88', [['batting', 'button:has-text("Batting analysis")'], ['bowling', '#vsw button:text-is("Bowling")'], ['records', '#vsw button:text-is("Records")'], ['full stats', '#vsw button:text-is("Full stats")']]],
  ['team', '/teams/india~intl~male', [['results', '.btns button:has-text("Results")'], ['players', '#vsw button:text-is("Players")'], ['bat bowl field', '#vsw button:text-is("Bat, bowl, field")']]],
  ['tournament', '/tournaments/ipl', [['overview', '.btns button:has-text("Overview")'], ['players', '#vsw button:text-is("Players")'], ['teams', '#vsw button:text-is("Teams and matches")']]],
];
const SNAP = () => [...document.querySelectorAll('.pane')].map((pn) => {
  const t = pn.querySelector('.rtr');
  const id = pn.querySelector('[data-tile]')?.getAttribute('data-tile');
  const nds = t ? [...t.querySelectorAll('.nd')] : [];
  return `${id}:on=${nds.map((n, i) => (n.classList.contains('on') ? i : '')).join('')}:also=${nds.map((n, i) => (n.classList.contains('also') ? i : '')).join('')}`;
}).join(' ');

(async () => {
  const browser = await engine.launch();
  const bad = [];
  for (const [label, url, views] of PAGES) {
    const seen = new Map();
    for (let run = 0; run < RUNS; run++) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
      await page.goto(`http://localhost:3100${url}`, { waitUntil: 'load' });
      await page.waitForTimeout(3500);
      for (const [name, selector] of views) {
        const b = page.locator(selector).first();
        if (!(await b.count()) || !(await b.isEnabled().catch(() => false))) continue;
        await b.click().catch(() => undefined);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(2500);
        const sig = await page.evaluate(SNAP);
        const m = seen.get(name) ?? seen.set(name, new Map()).get(name);
        m.set(sig, (m.get(sig) ?? 0) + 1);
      }
      await page.close();
    }
    for (const [name, m] of seen) if (m.size > 1) bad.push(`${label} ${name}: ${[...m].map(([s, n]) => `x${n} ${s}`).join('  |  ')}`);
  }
  await browser.close();
  console.log(`${PAGES.length} pages, ${RUNS} runs each`);
  if (bad.length) { console.log(`${bad.length} steps ended in more than one marking:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); }
  console.log('the marker is the same every time');
})();
