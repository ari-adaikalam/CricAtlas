// The Compare players Overall view for several pairs: every format the pair offers, every tile, one stop at a time. It reports console errors, text that should not be on a page (NaN, undefined, Infinity, null),
// a tile with no content and a tile whose content passes its bottom or right edge. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/compare-smoke.cjs [webkit] [versus] [a,b ...]
// `versus` checks the Versus each other view instead of Overall.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const args = process.argv.slice(2);
const engine = args.includes('webkit') ? webkit : chromium;
const V = args.includes('versus') ? 'vs' : 'ov';
const PAIRS = [['ba607b88', '30a45b23', 'Kohli v Smith'], ['462411b3', '3fb19989', 'Bumrah v Starc'], ['be150fc8', '5d2eda89', 'Perry v Mandhana'], ['ba607b88', 'be150fc8', 'a man and a woman'],
  ['5f547c8b', 'e087956b', 'Rashid Khan v Stokes'], ['7673c908', 'f3a18a0c', 'Kerr v Sciver']];
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
const pairs = args.filter((a) => a.includes(',')).map((a) => a.split(',')).concat(args.some((a) => a.includes(',')) ? [] : PAIRS);
let bad = 0, stops = 0;
(async () => {
  const browser = await engine.launch();
  for (const [a, b, name] of pairs) {
    const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
    const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|hydrat/i.test(m.text())) logs.push(m.text().slice(0, 160)); }); page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 160)));
    await page.goto(`http://localhost:3100/compare/players?a=${a}&b=${b}`); await page.waitForSelector('.btns2 .btn.p, .hint', { timeout: 30000 }); await page.waitForTimeout(1500);
    if (!(await page.locator('.btns2 .btn.p').count())) { console.log(`${name}: no comparison`); await page.close(); continue; }
    await page.click(V === 'vs' ? '.btns2 button:nth-child(2)' : '.btns2 button:nth-child(1)'); await page.waitForSelector(`#p-${V} .car > .tile`, { timeout: 30000 }); await page.waitForTimeout(2500);
    const formats = await page.$$eval('.top .filters label.fl:first-child select option', (os) => os.filter((o) => !o.disabled).map((o) => o.value)).catch(() => []);
    for (const f of (formats.length ? formats : [null])) {
      if (f) { await page.selectOption('.top .filters label.fl:first-child select', f); await page.waitForTimeout(2200); }
      const ids = await page.evaluate((v) => [...document.querySelectorAll(`#p-${v} .car > .tile`)].map((t) => t.dataset.tile), V);
      for (let i = 0; i < ids.length; i++) {
        await page.evaluate(([k, v]) => document.querySelectorAll(`#p-${v} .nd`)[k]?.click(), [i, V]); await page.waitForTimeout(1300);
        const r = await page.evaluate(([id, v]) => {
          const t = document.querySelector(`#p-${v} .car > .tile[data-tile="${id}"]`); if (!t) return { missing: true };
          const box = t.getBoundingClientRect(); const text = t.innerText.trim();
          const scrolls = (e) => { for (let x = e; x && x !== t; x = x.parentElement) { const o = getComputedStyle(x); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') return x; } return null; };
          let over = 0; for (const e of t.querySelectorAll('.cr, .cc, .kn, .tpr, .dsr, .phc, .h2r, svg')) { const c = scrolls(e); const b2 = (c ?? e).getBoundingClientRect(); if (b2.height && (b2.bottom > box.bottom + 2 || b2.right > box.right + 2)) over += 1; }
          return { len: text.length, text, over, loading: /Loading/.test(text) };
        }, [ids[i], V]);
        stops += 1; const tag = `${name} ${f ?? ''} ${ids[i]}`;
        if (r.missing) { bad++; console.log(`${tag}: missing`); continue; }
        if (r.loading) { await page.waitForTimeout(2500); }
        if (r.len < 25) { bad++; console.log(`${tag}: empty (${r.len})`); }
        if (BAD.test(r.text)) { bad++; console.log(`${tag}: text ${r.text.match(BAD)[0]}`); }
        if (r.over) { bad++; console.log(`${tag}: ${r.over} parts pass the tile edge`); }
      }
    }
    if (logs.length) { bad += logs.length; console.log(`${name}: console ${[...new Set(logs)].join(' | ')}`); }
    await page.close();
  }
  await browser.close();
  console.log(`${stops} tile stops checked`); console.log(bad === 0 ? 'all clear' : `${bad} PROBLEMS`); process.exit(bad === 0 ? 0 : 1);
})();
