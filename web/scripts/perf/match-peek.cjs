// A tile beside the one in view shows a strip of itself, and nothing in it may have played yet (the build method, "The smoothness standard"; Ari, 2026-10-21: the Ball by ball rows were already
// showing in the strip and then replayed when the tile slid in, because a class of its own collided with an older `.rise`).
//   PLAYWRIGHT_CORE=<path> FIT_IDS=1,2,3 node scripts/perf/match-peek.cjs [webkit]
// For each match and each part of Details: open the part, wait for it to settle, and look at the tile after it and the tile before it. Every row, panel, bar or number that waits for the tile to be
// seen (a `data-rows="wait"` area, or a Fall of wickets line without `.play`) must still be hidden or at zero.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.FIT_IDS ?? '1490706,1496584,1521264,1544601,1233463').split(',').map(Number);
const WIDTHS = (process.env.WIDTHS ?? '1352,1500,1100').split(',').map(Number);

function look(index) {
  const tiles = [...document.querySelectorAll('.car > .tile')];
  const out = [];
  for (const k of [index - 1, index + 1]) {
    const t = tiles[k]; if (!t) continue;
    const r = t.getBoundingClientRect(), box = document.querySelector('.car').getBoundingClientRect();
    const shown = Math.min(r.right, box.right) - Math.max(r.left, box.left);
    if (shown < 8) continue; // not showing at the edge at this width
    for (const area of t.querySelectorAll('[data-rows="wait"]')) {
      const early = [...area.querySelectorAll('.bbrise, tbody tr:not([data-late]), .mip, .kvl > div, .inl > div, .rpl > div')].filter((e) => +getComputedStyle(e).opacity > 0.05).length;
      // the over bars grow up from zero height (scaleY, the d of the matrix), the Partnerships bars out from zero width (scaleX, the a)
      const bars = [...area.querySelectorAll('.om i, td.pb i')].filter((e) => { const m = new DOMMatrixReadOnly(getComputedStyle(e).transform); return e.matches('.om i') ? m.d > 0.05 : m.a > 0.05; }).length;
      if (early || bars) out.push(`${t.dataset.tile}: ${early} rows or panels visible and ${bars} bars grown while waiting`);
    }
    for (const svg of t.querySelectorAll('svg:not(.play) .fow-g')) { if (+getComputedStyle(svg).opacity > 0.05) { out.push(`${t.dataset.tile}: a Fall of wickets mark is visible while waiting`); break; } }
  }
  return out;
}

(async () => {
  const browser = await engine.launch(); const bad = [];
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 760 } });
    for (const id of IDS) {
      const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
      const parts = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding', ...(b.coverage.reviews > 0 ? ['reviews'] : []), ...(b.innings.some((i) => i.super) ? ['so'] : []), 'ball'];
      for (let k = 0; k < parts.length; k++) {
        await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=${parts[k]}`); await page.waitForSelector('.tile.dp', { timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(1400);
        const index = await page.evaluate((part) => [...document.querySelectorAll('.car > .tile')].findIndex((t) => t.dataset.tile === part), parts[k]);
        const found = await page.evaluate(look, index);
        found.forEach((f) => bad.push(`${w}px #${id} ${b.match.kind} beside ${parts[k]}: ${f}`));
      }
    }
    console.log(`${w}px: ${bad.filter((x) => x.startsWith(`${w}px`)).length} problems`);
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`\n${bad.length} problems:`); bad.slice(0, 25).forEach((x) => console.log('  ' + x)); } else console.log('\nnothing beside the view has played');
  process.exit(bad.length ? 1 : 0);
})();
