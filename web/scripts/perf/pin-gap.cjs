// Pinned parts of a Full stats table (cards, title, header, footer) cover the rows that scroll under them: nothing shows through any gap between them (Ari, 2026-10-22).
// It scrolls each visible table and looks at what is drawn on top (elementFromPoint) along the pinned stack.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/pin-gap.cjs      (SIZES=1352x600,1000x560 to choose windows)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const SIZES = (process.env.SIZES ?? '1352x600,1100x640,1000x560,1440x900,1660x880').split(',').map((s) => s.split('x').map(Number));
const check = () => {
  const out = [];
  const tile = [...document.querySelectorAll('#p-stats .car > .tile')].find((t) => { const r = t.getBoundingClientRect(); return r.left >= -5 && r.left < innerWidth / 2; });
  if (!tile) return out;
  for (const s of tile.querySelectorAll('.tw.sc.fsb')) {
    const a = s.getBoundingClientRect();
    if (a.width === 0 || s.scrollHeight - s.clientHeight < 8) continue;
    for (const top of [20, (s.scrollHeight - s.clientHeight) / 2, s.scrollHeight]) {
      s.scrollTop = top;
      const x = a.left + a.width * 0.3;
      // every row of pixels along the top of the area down to the first row of the table body, and up from the bottom edge to the footer
      for (let y = a.top + 1; y < a.bottom - 1; y += 3) {
        const e = document.elementFromPoint(x, y); if (!e) continue;
        const pinned = e.closest('.fcs, .sub, thead, tfoot');
        const body = e.closest('tbody td');
        // A header that is not pinned (a multi table scrolls it away) can end on a half pixel (30.5 px high); a point inside that last pixel hit-tests to the row below it, which is not a row showing through.
        if (body && y < a.top + 100) { const th = s.querySelector('thead th'); if (th && th.getBoundingClientRect().bottom > y + 1) out.push(`a row shows at ${Math.round(y - a.top)} px from the top, above the header (scroll ${Math.round(s.scrollTop)})`); }
        if (!pinned && !body && e !== s && !e.closest('table')) { /* empty area */ }
      }
      const f = s.querySelector('tfoot td');
      if (f) { const fr = f.getBoundingClientRect(); const below = document.elementFromPoint(a.left + a.width * 0.3, Math.min(a.bottom - 2, fr.bottom + 2)); if (fr.bottom < a.bottom - 2 && below?.closest('tbody td')) out.push(`a row shows under the footer (scroll ${Math.round(s.scrollTop)})`); }
    }
  }
  return out;
};
(async () => {
  const b = await chromium.launch(); const bad = [];
  for (const [w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:3100/players/v-kohli-ba607b88'); await p.waitForTimeout(4500);
    await p.getByRole('button', { name: 'Full stats' }).first().click(); await p.waitForTimeout(3000);
    const n = await p.evaluate(() => document.querySelectorAll('#p-stats .car > .tile').length);
    for (let k = 0; k < n; k++) {
      const chips = p.locator('#p-stats .car > .tile').nth(k).locator('.msw button, .sw button');
      const c = await chips.count();
      for (let i = -1; i < c; i++) {
        if (i >= 0) { await chips.nth(i).click().catch(() => undefined); await p.waitForTimeout(1500); }
        const g = await p.evaluate(check); if (g.length) bad.push(`${w}x${h} tile ${k} chip ${i}: ${[...new Set(g)].join('; ')}`);
      }
      await p.locator('#p-stats .arr.r:visible').first().click().catch(() => undefined); await p.waitForTimeout(1500);
    }
    await p.close();
  }
  console.log(bad.length ? bad.join('\n') : 'nothing shows through the pinned parts'); await b.close(); process.exit(bad.length ? 1 : 0);
})();
