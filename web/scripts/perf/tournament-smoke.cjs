// A first look at the Tournament page: opens a tournament, each view and each tile, prints console errors and any text that should not be on a page (NaN, undefined, null), and saves a picture of each stop.
// Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/tournament-smoke.cjs [tournament key] [out dir] [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const slug = process.argv[2] ?? 'ipl';
// Screenshots go to the system temp folder, never into the repo (a run once left 37 of them in web/).
const out = process.argv[3] ?? require('path').join(require('os').tmpdir(), 'cricatlas-shots');
require('fs').mkdirSync(out, { recursive: true });
const engine = process.argv[4] === 'webkit' ? webkit : chromium;
const PORT = process.env.PORT ?? '3100';
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;

(async () => {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text())) logs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/tournaments/${slug}`);
  await page.waitForSelector('.sum .phead', { timeout: 20000 });
  console.log('summary in', Date.now() - t0, 'ms');
  const text = async () => page.evaluate(() => document.body.innerText);
  let t = await text();
  console.log('summary bad text:', BAD.test(t) ? t.match(BAD)[0] : 'none');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/tournament-${slug}-sum.png` });
  for (const [view, label] of [['ov', 'Overview'], ['ply', 'Players'], ['tm', 'Teams and matches']]) {
    await page.click(`#vsw button:has-text("${label}")`).catch(async () => { await page.click(`.btns button:has-text("${label}")`); });
    await page.waitForTimeout(900);
    const n = await page.evaluate((v) => document.querySelectorAll(`#p-${v} .nd`).length, view);
    console.log(view, 'stops', n);
    for (let i = 0; i < n; i++) {
      await page.evaluate(([v, k]) => document.querySelectorAll(`#p-${v} .nd`)[k].click(), [view, i]);
      await page.waitForTimeout(1300);
      const name = await page.evaluate(([v, k]) => document.querySelectorAll(`#p-${v} .nd .lb`)[k]?.textContent ?? '', [view, i]);
      t = await text();
      const bad = BAD.test(t) ? t.match(BAD)[0] : '';
      console.log(`  ${view} ${i} ${name}${bad ? ' BAD:' + bad : ''}`);
      await page.screenshot({ path: `${out}/tournament-${slug}-${view}-${i}.png` });
    }
  }
  console.log('console:', logs.length ? logs.join('\n  ') : 'clean');
  await browser.close();
})();
