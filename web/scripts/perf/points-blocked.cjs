// The tiles of the Batting and Bowling views with the point files served, against the same tiles with the point files blocked (the SQL fallback). The text and the number of drawn marks of every tile
// must match. Run with the dev server on 3100 and the data server on 8788:   PLAYWRIGHT_CORE=<path> node scripts/perf/points-blocked.cjs [id ...]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const DEFAULT = ['ba607b88', '52d1dbc8', '237ec05b', 'a2f46292', '29e95537', '6a97c7a4', '02b87bde', '3d284ca3', '462411b3', '3fb19989'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const VIEWS = [['bat', 'Batting'], ['bowl', 'Bowling']];

async function snapshot(browser, id, blocked) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (blocked) await context.route(/\/p\/(pts|ptb)\//, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
  const out = {};
  let first = true;
  for (const [label, name] of VIEWS) {
    const button = first ? page.getByRole('button', { name: `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
    if (!(await button.isEnabled().catch(() => false))) { out[label] = null; continue; }
    await button.click(); first = false; await page.waitForTimeout(2800);
    const pane = `#p-${label}`;
    const n = await page.evaluate((pane) => document.querySelectorAll(`${pane} .car > .tile`).length, pane);
    const tiles = [];
    for (let t = 0; t < n; t++) {
      await page.evaluate(([pane, t]) => { const car = document.querySelector(`${pane} .car`); car.style.scrollBehavior = 'auto'; car.scrollLeft = [...car.children][t].offsetLeft - 60; }, [pane, t]);
      // A tile counts up and draws in after it is scrolled to, so it is read again until two reads 700 ms apart agree.
      const read = () => page.evaluate(([pane, t]) => {
        const tile = document.querySelectorAll(`${pane} .car > .tile`)[t];
        const marks = ['path[d]', 'circle', 'rect', 'line', 'polyline'].map((s) => tile.querySelectorAll(s).length).join('/');
        return { text: tile.innerText.replace(/\s+/g, ' ').trim(), marks };
      }, [pane, t]);
      await page.waitForTimeout(1200);
      let last = await read();
      for (let k = 0; k < 10; k++) { await page.waitForTimeout(700); const now = await read(); if (now.text === last.text && now.marks === last.marks) break; last = now; }
      tiles.push(last);
    }
    out[label] = tiles;
  }
  await context.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  for (const id of ids) {
    const a = await snapshot(browser, id, false), b = await snapshot(browser, id, true);
    const notes = [];
    for (const [label] of VIEWS) {
      const x = a[label], y = b[label];
      if (!x || !y) { if (!!x !== !!y) notes.push(`${label}: available only ${x ? 'with' : 'without'} the files`); continue; }
      if (x.length !== y.length) { notes.push(`${label}: ${x.length} tiles against ${y.length}`); continue; }
      x.forEach((tile, i) => {
        if (tile.text !== y[i].text) notes.push(`${label} tile ${i + 1} text differs: "${tile.text.slice(0, 90)}" | "${y[i].text.slice(0, 90)}"`);
        else if (tile.marks !== y[i].marks) notes.push(`${label} tile ${i + 1} marks ${tile.marks} against ${y[i].marks}`);
      });
    }
    if (notes.length) problems++;
    console.log(`${id}: ${notes.length ? '\n  ' + notes.join('\n  ') : 'same'}`);
  }
  await browser.close();
  console.log(problems ? `${problems} player(s) differ` : 'all same');
})();
