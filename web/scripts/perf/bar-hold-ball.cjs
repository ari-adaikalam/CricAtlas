// The copy of the top bar that lies over a page while a link opens must draw the whole ball. Its gradient and clip path are found by id, so a copy that drops the ids shows only the seam.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:3100';
(async () => {
  let bad = 0;
  for (const [name, eng] of [['chromium', chromium], ['webkit', webkit]]) {
    const b = await eng.launch();
    const p = await b.newPage({ viewport: { width: 1352, height: 700 } });
    await p.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
    await p.evaluate(() => { document.querySelector('.nav a[href="/players"]').click(); });
    let r = null;
    for (let i = 0; i < 40 && !r; i++) {
      r = await p.evaluate(() => {
        const h = document.getElementById('bar-hold'); const s = h && h.querySelector('svg'); if (!s) return null;
        const missing = [...s.querySelectorAll('*')].flatMap((e) => ['fill', 'stroke', 'clip-path'].map((a) => e.getAttribute(a))).filter((v) => v && v.startsWith('url(#')).map((v) => v.slice(5, -1)).filter((id) => !s.querySelector(`[id="${id}"]`));
        return { missing, ids: s.querySelectorAll('[id]').length };
      });
      if (!r) await p.waitForTimeout(25);
    }
    const ok = !!r && r.missing.length === 0 && r.ids > 0;
    if (!ok) bad++;
    console.log(`${name}: ${r ? `${r.ids} ids, ${r.missing.length} references with no target` : 'no held copy seen'} ${ok ? 'ok' : 'FAILED'}`);
    await b.close();
  }
  process.exit(bad ? 1 : 0);
})();
