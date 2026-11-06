// A state that was already shown under a chip or filter comes back at once, with no animation (Ari, 2026-10-22); the first time it animates.
// For each tile with chips: show chip 1 (plays), chip 0 (plays), then chip 1 again. 150 ms after that last click nothing inside the tile may differ from what it is 2.5 s later
// (opacity, position, size, text), and no animation may be running.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/switch-back.cjs [bat|bowl|rec|stats|match <id>]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const WHAT = process.argv[2] ?? 'bat';
const snap = (tileId) => {
  const t = document.querySelector(`[data-tile="${tileId}"]`); if (!t) return null;
  const out = new Map(); let i = 0;
  for (const e of t.querySelectorAll('*')) {
    const r = e.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(e);
    out.set(i++, `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${cs.opacity}|${(e.children.length === 0 ? e.textContent : '').slice(0, 20)}`);
  }
  return { cells: [...out.values()], running: t.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length };
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const bad = [];
  let scope = '';
  if (WHAT === 'match') { await p.goto(`http://localhost:3100/matches/${process.argv[3] ?? '1426629'}?view=${process.argv[4] ?? 'details'}`); await p.waitForTimeout(3500); }
  else {
    await p.goto('http://localhost:3100/players/ba607b88'); await p.waitForTimeout(4500);
    const name = { bat: 'Batting analysis', bowl: 'Bowling analysis', rec: 'Records', stats: 'Full stats' }[WHAT];
    await p.getByRole('button', { name }).first().click(); await p.waitForTimeout(3000); scope = `#p-${WHAT} `;
  }
  const n = await p.evaluate((s) => document.querySelectorAll(`${s}.car > .tile`).length, scope);
  for (let k = 0; k < n; k++) {
    const tile = p.locator(`${scope}.car > .tile`).nth(k); const id = await tile.getAttribute('data-tile');
    const chips = tile.locator('.msw button, .sw button'); const c = await chips.count();
    if (c >= 2) {
      const flip = async (i) => { await chips.nth(i).click().catch(() => undefined); await p.waitForTimeout(2600); };
      await flip(1); await flip(0);
      await chips.nth(1).click().catch(() => undefined); await p.waitForTimeout(150);
      const early = await p.evaluate(snap, id); await p.waitForTimeout(2500); const late = await p.evaluate(snap, id);
      if (early && late) {
        const diff = early.cells.reduce((a, v, i) => a + (v !== late.cells[i] ? 1 : 0), 0) + Math.abs(early.cells.length - late.cells.length);
        if (diff > 0 || early.running > 0) bad.push(`tile ${id}: ${diff} things differ 150 ms after switching back, ${early.running} animations running`);
      }
    }
    await p.locator(`${scope}.arr.r:visible`).first().click().catch(() => undefined); await p.waitForTimeout(1500);
  }
  console.log(bad.length ? bad.join('\n') : 'every state that was shown before came back at once'); await b.close(); process.exit(bad.length ? 1 : 0);
})();
