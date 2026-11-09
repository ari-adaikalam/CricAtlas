// The unusual tournaments sweep: every tournament (the 32 of data/export/n/index.json), every format it has, All editions and the latest edition, every view and tile. Reports console errors, page errors, text that
// should not be on a page (NaN, undefined, Infinity, [object, null) and a tile that draws nothing. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/tournament-sweep.cjs [webkit] [key ...]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const fs = require('fs');
const engine = process.argv.includes('webkit') ? webkit : chromium;
const only = process.argv.slice(2).filter((a) => a !== 'webkit');
const index = JSON.parse(fs.readFileSync(`${__dirname}/../../../data/export/n/index.json`, 'utf8'));
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
const FMTS = { TEST: 'TEST', ODI: 'ODI', T20: 'T20' };
(async () => {
  const browser = await engine.launch();
  const bad = []; let tiles = 0, pages = 0;
  for (const [key, , , , , , , , , formats] of index) {
    if (only.length && !only.includes(key)) continue;
    const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|favicon/.test(m.text())) logs.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
    // The Hundred is a T20 match in the file's own list but its own format on the page; the page opens on the format with most matches, so each format is asked for by name.
    const fmts = key === 'hnd' ? ['HUNDRED'] : formats.map((f) => FMTS[f]).filter(Boolean);
    for (const fmt of fmts) for (const edition of ['all', 'latest']) {
      pages++;
      const view = (v) => `http://localhost:3100/tournaments/${key}?format=${fmt}${edition === 'all' ? '&edition=all' : ''}&view=${v}`;
      for (const v of ['overview', 'players', 'teams']) {
        try {
          await page.goto(view(v)); await page.waitForSelector('.pane .tile', { timeout: 20000 }); await page.waitForTimeout(900);
          const stops = await page.evaluate(() => document.querySelectorAll('.pane:not(.held) .nd').length);
          for (let i = 0; i < stops; i++) {
            await page.evaluate((k) => document.querySelectorAll('.pane:not(.held) .nd')[k]?.click(), i); await page.waitForTimeout(450);
            const r = await page.evaluate(() => { const pane = document.querySelector('.pane:not(.held)'); const car = pane.querySelector('.car').getBoundingClientRect(); const t = [...pane.querySelectorAll('.car > .tile')].find((x) => { const q = x.getBoundingClientRect(); return Math.min(q.right, car.right) - Math.max(q.left, car.left) > q.width * 0.6; }); return t ? { id: t.getAttribute('data-tile'), text: t.innerText, empty: t.innerText.trim().length < 12 } : null; });
            tiles++;
            if (!r) continue;
            if (BAD.test(r.text)) bad.push(`${key} ${fmt} ${edition} ${v} ${r.id}: bad text ${r.text.match(BAD)[0]}`);
            if (r.empty) bad.push(`${key} ${fmt} ${edition} ${v} ${r.id}: tile is empty`);
          }
        } catch (e) { bad.push(`${key} ${fmt} ${edition} ${v}: ${String(e).slice(0, 120)}`); }
      }
    }
    for (const l of [...new Set(logs)].slice(0, 4)) bad.push(`${key}: console ${l}`);
    await page.close();
  }
  console.log(`${pages} page loads, ${tiles} tile stops checked`);
  console.log(bad.length ? bad.join('\n') : 'all clear');
  await browser.close();
})();
