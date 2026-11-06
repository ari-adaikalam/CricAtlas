// The gate of the loading plan: when a Batting or a Bowling view opens and every tile is visited, which questions still reach the query engine, and does
// the engine start at all? Each player is run twice: normally (the engine is warmed up at page load) and as a light device (navigator.deviceMemory = 2, so there is no warm-up and the engine starts
// only when a tile asks it something). The questions are the "query ..." entries the engine writes to the performance timeline (src/data/engine.ts); the engine files are read from the network.
//
// Run with the dev server on 3100 and the data server on 8788 (a production build gives the real picture):
//   node scripts/perf/engine-gate.cjs [id ...]        default: Kohli, Bumrah, Mooney, Salt
//   PLAYWRIGHT_CORE=<path> PORT=3100 node scripts/perf/engine-gate.cjs
// Prints, for each player, view and mode: whether the engine files were requested, how many questions the engine answered, and the first words of each distinct question with the tile that was
// on screen when it was asked. A view that opens, scrolls through every tile and asks the engine nothing has passed the gate.
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.env.PORT ?? '3100';
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['ba607b88', '462411b3', '52d1dbc8', '3d284ca3'];
const ALL = [['bat', 'Batting analysis'], ['bowl', 'Bowling analysis'], ['rec', 'Records'], ['stats', 'Full stats'], ['pro', null]];
const VIEWS = process.env.VIEWS ? ALL.filter((v) => process.env.VIEWS.split(',').includes(v[0])) : ALL.slice(0, 2); // VIEWS=rec,stats,pro adds the others; pro is the profile page, nothing is clicked

async function run(browser, id, [view, button], light) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (light) await context.addInitScript(() => { Object.defineProperty(navigator, 'deviceMemory', { value: 2 }); });
  const page = await context.newPage();
  const engineFiles = [];
  page.on('request', (r) => { if (/\.wasm|duckdb-.*worker/.test(r.url())) engineFiles.push(r.url().split('/').pop()); });
  await page.goto(`http://localhost:${PORT}/players/${id}`); await page.waitForTimeout(5000);
  if (button) {
    const btn = page.getByRole('button', { name: button }).first();
    if (!(await btn.isEnabled().catch(() => false))) { await context.close(); return { skipped: 'view not available' }; }
    await btn.click(); await page.waitForTimeout(3000);
  }
  const pane = view === 'pro' ? '.pgx' : `#p-${view}`;
  const tiles = await page.evaluate((pane) => [...document.querySelectorAll(`${pane} .car > .tile`)].map((t) => t.dataset.tile), pane);
  const seen = new Map();
  let lastCount = 0; // questions asked while the view opened are counted too, attributed to the first tile
  for (let i = 0; i < tiles.length; i++) {
    await page.evaluate(([pane, i]) => { const car = document.querySelector(`${pane} .car`); car.style.scrollBehavior = 'auto'; car.scrollLeft = [...car.children][i].offsetLeft - 60; }, [pane, i]);
    await page.waitForTimeout(1500);
    const all = await page.evaluate(() => performance.getEntriesByType('measure').filter((m) => m.name.startsWith('query ')).map((m) => m.name.slice(6, 80)));
    for (const q of all.slice(lastCount)) if (!seen.has(q)) seen.set(q, tiles[i]);
    lastCount = all.length;
  }
  // Read the timeline once more at the end: a page with no tiles (the profile) scrolls nothing, and questions asked by background loading are still questions.
  await page.waitForTimeout(2000);
  const finalQs = await page.evaluate(() => performance.getEntriesByType('measure').filter((m) => m.name.startsWith('query ')).map((m) => m.name.slice(6, 80)));
  for (const q of finalQs) if (!seen.has(q)) seen.set(q, 'page');
  const total = finalQs.length;
  await context.close();
  return { engineFiles: [...new Set(engineFiles)].length > 0, tiles: tiles.length, questions: total, distinct: [...seen.entries()].map(([q, tile]) => `${tile}: ${q}`) };
}

(async () => {
  const browser = await chromium.launch();
  for (const id of IDS) for (const v of VIEWS) for (const light of [false, true]) {
    const r = await run(browser, id, v, light);
    const head = `${id} ${v[0]} ${light ? 'light device' : 'normal'}:`;
    if (r.skipped) { console.log(`${head} ${r.skipped}`); continue; }
    console.log(`${head} engine files requested: ${r.engineFiles ? 'yes' : 'no'}, ${r.questions} question(s) answered by the engine over ${r.tiles} tiles${r.questions === 0 ? '  PASSED' : ''}`);
    for (const d of r.distinct) console.log(`    ${d}`);
  }
  await browser.close();
})();
