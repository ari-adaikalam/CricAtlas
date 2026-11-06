// Tables that have the same header under different chips keep each column at the same place and width (Ari, 2026-10-22).
// For every tile with chips: the left edge and width of each header (by its text) under each chip, compared with the first chip's.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/column-same.cjs [bat|bowl|rec|stats|match <id>]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const WHAT = process.argv[2] ?? 'stats';
const heads = (id) => {
  const t = document.querySelector(`[data-tile="${id}"]`); if (!t) return null;
  const out = {}; t.querySelectorAll('table').forEach((tb, ti) => tb.querySelectorAll('thead tr:last-child th').forEach((th) => { const r = th.getBoundingClientRect(); const a = tb.getBoundingClientRect(); out[`${ti}:${th.textContent.trim()}`] = [Math.round(r.left - a.left), Math.round(r.width), Math.round(a.width)]; }));
  return out;
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const bad = [];
  let scope = '';
  if (WHAT === 'match') { await p.goto(`http://localhost:3100/matches/${process.argv[3] ?? '1426629'}?view=details`); await p.waitForTimeout(3500); }
  else { await p.goto('http://localhost:3100/players/ba607b88'); await p.waitForTimeout(4500); await p.getByRole('button', { name: { bat: 'Batting analysis', bowl: 'Bowling analysis', rec: 'Records', stats: 'Full stats' }[WHAT] }).first().click(); await p.waitForTimeout(3000); scope = `#p-${WHAT} `; }
  const n = await p.evaluate((s) => document.querySelectorAll(`${s}.car > .tile`).length, scope);
  for (let k = 0; k < n; k++) {
    const tile = p.locator(`${scope}.car > .tile`).nth(k); const id = await tile.getAttribute('data-tile');
    const chips = tile.locator('.msw button, .sw button'); const c = await chips.count();
    if (c >= 2) {
      let base = null;
      for (let i = 0; i < c; i++) {
        await chips.nth(i).click().catch(() => undefined); await p.waitForTimeout(1600);
        const h = await p.evaluate(heads, id); if (!h) continue;
        if (!base) { base = h; continue; }
        for (const key of Object.keys(h)) if (base[key] && (Math.abs(base[key][0] - h[key][0]) > 2 || Math.abs(base[key][1] - h[key][1]) > 2) && base[key][2] === h[key][2]) bad.push(`tile ${id} chip ${i}: "${key}" at ${h[key][0]}/${h[key][1]} px, was ${base[key][0]}/${base[key][1]} under chip 0`);
      }
    }
    await p.locator(`${scope}.arr.r:visible`).first().click().catch(() => undefined); await p.waitForTimeout(1500);
  }
  console.log(bad.length ? [...new Set(bad)].slice(0, 25).join('\n') : 'same header, same place and width under every chip'); await b.close(); process.exit(bad.length ? 1 : 0);
})();
