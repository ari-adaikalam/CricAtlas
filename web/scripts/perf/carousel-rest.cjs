// Wherever a row of tiles comes to rest, no wide tile is left half visible (Ari, 2026-10-21: "no full tile must be visible only half, be it scroll or timeline click, in either direction").
//   PLAYWRIGHT_CORE=<path> node scripts/perf/carousel-rest.cjs [webkit]
// In every view of the player page it moves the row in every way a user can and then reads where it rests (after the glide and the snap):
//   a click on the timeline from every tile to every other tile, the arrows both ways through the whole row, and scrolls of several lengths both ways.
// A wide tile that shows more than 5% and less than 95% of its width, or a tile asked for that is not whole on screen, is a fault. The few pixels of the next tile at the edge are the normal strip.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PLAYERS = (process.env.PLAYER_IDS ?? 'ba607b88,02b87bde').split(',');
const WIDTH = Number(process.env.WIDTH ?? 1440);

const REST = (pane) => {
  const car = document.querySelector(`#p-${pane} .car`), box = car.getBoundingClientRect();
  const cut = [...car.children].map((t) => { const r = t.getBoundingClientRect(), shown = Math.min(r.right, box.right) - Math.max(r.left, box.left); return t.classList.contains('wide') && shown > 0.05 * r.width && shown < 0.95 * r.width ? `${t.dataset.tile} ${Math.round((shown / r.width) * 100)}%` : null; }).filter(Boolean);
  return { cut, at: Math.round(car.scrollLeft), max: Math.round(car.scrollWidth - car.clientWidth) };
};

(async () => {
  const browser = await engine.launch(); const bad = []; let moves = 0;
  for (const id of PLAYERS) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
    await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
    let first = true;
    for (const [pane, name] of [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']]) {
      const btn = first ? page.getByRole('button', { name: name === 'Full stats' ? 'Full stats' : `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
      if (!(await btn.isEnabled().catch(() => false))) continue; await btn.click(); first = false; await page.waitForTimeout(2800);
      const n = await page.evaluate((pane) => document.querySelectorAll(`#p-${pane} .car > .tile`).length, pane);
      const check = async (what) => { await page.waitForTimeout(1900); moves++; const r = await page.evaluate(REST, pane); if (r.cut.length) bad.push(`${id} ${pane} ${what}: ${r.cut.join(', ')} (row at ${r.at} of ${r.max})`); };
      const home = () => page.evaluate((pane) => { const c = document.querySelector(`#p-${pane} .car`); c.style.scrollBehavior = 'auto'; c.scrollLeft = 0; }, pane).then(() => page.waitForTimeout(700));
      const stops = page.locator(`#p-${pane} .rtr button, #p-${pane} .rtr .stop`);
      // the timeline, from the start of the row to every tile, and from the end of it to every tile
      for (let to = 0; to < n; to++) {
        await home(); await stops.nth(to).click().catch(() => undefined); await check(`timeline from the start to tile ${to + 1}`);
        await page.evaluate((pane) => { const c = document.querySelector(`#p-${pane} .car`); c.style.scrollBehavior = 'auto'; c.scrollLeft = c.scrollWidth; }, pane); await page.waitForTimeout(700);
        await stops.nth(to).click().catch(() => undefined); await check(`timeline from the end to tile ${to + 1}`);
      }
      // the arrows through the whole row and back
      await home();
      for (let k = 0; k < n + 2; k++) { const r = page.locator(`#p-${pane} .arr.r:visible`).first(); if (!(await r.count())) break; await r.click().catch(() => undefined); await check(`right arrow ${k + 1}`); }
      for (let k = 0; k < n + 2; k++) { const l = page.locator(`#p-${pane} .arr.l:visible`).first(); if (!(await l.count())) break; await l.click().catch(() => undefined); await check(`left arrow ${k + 1}`); }
      // scrolls of several lengths, both ways, from several places
      for (const start of [0, 0.35, 0.7]) for (const delta of [260, 540, 980, 1700, -260, -540, -980, -1700]) {
        await page.evaluate(([pane, start]) => { const c = document.querySelector(`#p-${pane} .car`); c.style.scrollBehavior = 'auto'; c.scrollLeft = start * (c.scrollWidth - c.clientWidth); }, [pane, start]); await page.waitForTimeout(700);
        // A real wheel event over the row, as a trackpad gives: a scripted scrollBy is not snapped by headless WebKit and gave 37 false faults that real scrolling never shows (2026-10-22).
        await page.mouse.move(Math.round(WIDTH / 2), 450); await page.mouse.wheel(delta, 0);
        await check(`scroll ${delta > 0 ? 'right' : 'left'} ${Math.abs(delta)} from ${Math.round(start * 100)}%`);
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(`${moves} resting places read`);
  if (bad.length) { console.log(`${bad.length} with a wide tile half visible:`); [...new Set(bad)].slice(0, 30).forEach((x) => console.log('  ' + x)); } else console.log('no wide tile was left half visible');
  process.exit(bad.length ? 1 : 0);
})();
