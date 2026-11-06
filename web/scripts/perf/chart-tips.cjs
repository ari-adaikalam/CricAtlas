// Every chart tooltip has one shape (Ari, 2026-10-24, components/TipBody.tsx): a title, an optional line, label and value rows, an optional note. This opens every page and view, moves a real pointer over a grid of
// points in each tile, and checks each tooltip that appears: it is a TipBody (no loose bold and muted lines), it has at most 8 rows, its words are short (no sentences in a row), and it stays inside the window.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/chart-tips.cjs [webkit]          (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PAGES = [
  '/players/v-kohli-ba607b88?view=batting', '/players/jj-bumrah-462411b3?view=bowling', '/players/v-kohli-ba607b88?view=records', '/players/v-kohli-ba607b88?view=stats',
  '/teams/india~intl~male?view=results', '/teams/india~intl~male?view=players', '/teams/india~intl~male?view=batbowl',
  '/tournaments/ipl?view=overview', '/tournaments/ipl?view=players', '/tournaments/ipl?view=teams',
  '/matches/1298150?view=analysis', '/matches/1298150?view=details', '/matches/1298150?view=replay',
  '/compare/players?a=ba607b88&b=462411b3&view=overall', '/compare/players?a=ba607b88&b=462411b3&view=versus', '/compare/teams?a=india%7Cintl%7Cmale&b=australia%7Cintl%7Cmale&view=overall',
];

/** What a tooltip must look like. Returns the problems, empty when it is right. */
const PROBLEMS = (tip) => {
  const out = []; const box = tip.getBoundingClientRect();
  const kids = [...tip.children];
  if (kids.length !== 1 || !kids[0].classList.contains('ct')) out.push('not a TipBody');
  const rows = tip.querySelectorAll('.ct-row'); if (rows.length > 8) out.push(`${rows.length} rows`);
  for (const r of rows) { const l = r.querySelector('dt')?.textContent ?? ''; if (l.length > 40 || /[.]\s/.test(l)) out.push(`a long label "${l.slice(0, 30)}"`); }
  const t = tip.querySelector('.ct-h')?.textContent ?? ''; if (t.length > 70) out.push(`a long title "${t.slice(0, 30)}"`);
  for (const n of tip.querySelectorAll('.ct-note, .ct-sub')) if (n.textContent.length > 110) out.push(`a long line "${n.textContent.slice(0, 30)}"`);
  if (box.left < 0 || box.top < 0 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) out.push('outside the window');
  return out;
};

if (process.argv.includes('--selftest')) {
  // proves the checker passes a TipBody and reports loose lines, before the script is trusted
  (async () => {
    const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<div class="charttip" id="good" style="position:fixed;left:10px;top:10px"><div class="ct"><div class="ct-h"><b>2019</b></div><dl class="ct-rows"><div class="ct-row"><dt>Runs</dt><dd>9</dd></div></dl></div></div><div class="charttip" id="bad" style="position:fixed;left:10px;top:200px"><b>2019</b><span>1,234 runs from 18 innings</span></div>');
    const r = await page.evaluate((src) => { const f = eval(src); return { good: f(document.getElementById('good')), bad: f(document.getElementById('bad')) }; }, PROBLEMS.toString());
    await browser.close();
    const ok = r.good.length === 0 && r.bad.includes('not a TipBody');
    console.log(ok ? 'self-test ok' : 'self-test FAILED: ' + JSON.stringify(r)); process.exit(ok ? 0 : 1);
  })();
} else (async () => {
  const browser = await engine.launch(); const bad = []; let pages = 0, shown = 0;
  for (const url of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
    await page.goto(`http://localhost:3100${url}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('.car article[data-tile], .rview .pan, .pgx.mgx .car article')].map((a, i) => { a.setAttribute('data-probe', String(i)); return i; }));
    pages += 1;
    const seen = new Set();
    for (const i of tiles.slice(0, 40)) {
      await page.evaluate((k) => document.querySelector(`[data-probe="${k}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }), i);
      await page.waitForTimeout(1500);
      const rect = await page.evaluate((k) => { const r = document.querySelector(`[data-probe="${k}"]`)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, i);
      if (!rect || rect.w < 100) continue;
      for (let gy = 1; gy <= 3; gy++) for (let gx = 1; gx <= 5; gx++) {
        await page.mouse.move(rect.x + (rect.w * gx) / 6, rect.y + 40 + ((rect.h - 60) * gy) / 4); await page.waitForTimeout(70);
        const info = await page.evaluate((src) => { const f = eval(src); const t = document.querySelector('.charttip'); return t ? { text: t.innerText.replace(/\s+/g, ' ').slice(0, 60), problems: f(t) } : null; }, PROBLEMS.toString());
        if (info) { shown += 1; if (info.problems.length && !seen.has(info.text)) { seen.add(info.text); bad.push(`${url}: "${info.text}" ${info.problems.join(', ')}`); } }
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(`${pages} views checked, ${shown} tooltips seen`);
  if (shown === 0) { console.log('no tooltip appeared: the check cannot be trusted'); process.exit(1); }
  if (bad.length) { console.log(`${bad.length} tooltips that are not right:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('every tooltip is a TipBody and short');
})();
