// Every view to view switch of the Team page, with the leaving view scrolled to each of its stops. At the start of the slide the leaving copy must keep every tile that fills the screen at full strength and
// moving with the row (a stale sliver mark made it fade and freeze), and the entering row must show its tiles. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/team-switch.cjs [team slug] [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const slug = process.argv[2] ?? 'india~intl~male';
const engine = process.argv[3] === 'webkit' ? webkit : chromium;
const VIEWS = [['res', 'Results'], ['ply', 'Players'], ['bbf', 'Bat, bowl, field']];
// The profile's buttons say the long name of the third view.
const PROFILE_BUTTON = { 'Bat, bowl, field': 'Batting, bowling and fielding' };
(async () => {
  const browser = await engine.launch();
  const bad = [];
  let cases = 0;
  for (const [a, la] of VIEWS) {
    for (const stop of [0, 1, 2, 4]) {
      for (const [b, lb] of VIEWS) {
        if (a === b) continue;
        const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
        await page.goto(`http://localhost:3100/teams/${slug}?format=TEST`); await page.waitForSelector('.sum .phead'); await page.waitForTimeout(1200);
        await page.click(`.btns button:has-text("${PROFILE_BUTTON[la] ?? la}")`); await page.waitForTimeout(2000);
        const stops = await page.evaluate((v) => document.querySelectorAll(`#p-${v} .nd`).length, a);
        if (stop >= stops) { await page.close(); continue; }
        if (stop) { await page.evaluate(([v, k]) => document.querySelectorAll(`#p-${v} .nd`)[k].click(), [a, stop]); await page.waitForTimeout(1800); }
        // The tiles that fill the screen now.
        const before = await page.evaluate((v) => { const c = document.querySelector(`#p-${v} .car`); const box = c.getBoundingClientRect(); return [...c.querySelectorAll(':scope > .tile')].map((t) => { const r = t.getBoundingClientRect(); return { id: t.dataset.tile, full: r.left >= box.left - 1 && r.right <= box.right + 1 }; }); }, a);
        await page.click(`#vsw button:has-text("${lb}")`);
        await page.waitForTimeout(110);
        const during = await page.evaluate(() => {
          const g = document.querySelector('.ghost');
          if (!g) return { ghost: false };
          return { ghost: true, op: getComputedStyle(g).opacity, tiles: [...g.querySelectorAll('.car > .tile')].map((t) => ({ id: t.dataset.tile, peek: t.hasAttribute('data-peek'), op: +getComputedStyle(t).opacity })) };
        });
        cases += 1;
        if (!during.ghost) bad.push(`${la}@${stop} -> ${lb}: no leaving copy`);
        else {
          for (const t of during.tiles) {
            const was = before.find((x) => x.id === t.id);
            if (was?.full && (t.peek || t.op < 0.95)) bad.push(`${la}@${stop} -> ${lb}: tile ${t.id} fills the screen but is ${t.peek ? 'marked a sliver' : ''} opacity ${t.op.toFixed(2)}`);
          }
        }
        // The entering row after the slide: its first screen has tiles with content.
        await page.waitForTimeout(1700);
        const after = await page.evaluate((v) => { const c = document.querySelector(`#p-${v} .car`); const box = c.getBoundingClientRect(); return [...c.querySelectorAll(':scope > .tile')].filter((t) => { const r = t.getBoundingClientRect(); return r.right > box.left + 40 && r.left < box.right - 40; }).map((t) => ({ id: t.dataset.tile, text: t.innerText.trim().length, op: +getComputedStyle(t).opacity })); }, b);
        for (const t of after) if (t.text < 20 || t.op < 0.95) bad.push(`${la}@${stop} -> ${lb}: entering tile ${t.id} settled with ${t.text} characters, opacity ${t.op.toFixed(2)}`);
        await page.close();
      }
    }
  }
  console.log(`${cases} switches checked`);
  console.log(bad.length ? bad.join('\n') : 'all ok');
  await browser.close();
})();
