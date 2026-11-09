// A scroll bar that is not needed never shows, even for a moment (Ari, 2026-10-21: "it appears, then realises it is not needed after the animation plays and disappears"). Each scroll area (an element with data-rows
// whose content can scroll) is sampled every frame while its tile comes into view and plays. A bar that was on screen in some frame and gone at the end is a flash. One that was never on screen but is needed at the end
// is also reported (it should have shown).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/scrollbar-flash.cjs [match|player]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const WHICH = process.argv.includes('match') ? 'match' : 'player';
const SAMPLER = () => {
  window.__bars = new Map();
  const desc = (el) => `${el.className.toString().split(' ')[0] || el.tagName.toLowerCase()} in ${(el.closest('[data-tile]') || {}).dataset?.tile ?? '?'}`;
  const tick = () => {
    for (const el of document.querySelectorAll('[data-rows], .tsc, .tw.sc, .bbl, .minfo, .mil, .trg, .bpc, .log, .res, .pop, .kgrid, .art')) {
      const cs = getComputedStyle(el); if (!/(auto|scroll|hidden)/.test(cs.overflowY)) continue;
      const over = el.scrollHeight - el.clientHeight;
      // a bar is on screen when the area may scroll and its content is taller than it
      const bar = /(auto|scroll)/.test(cs.overflowY) && over > 0;
      let rec = window.__bars.get(el); if (!rec) { rec = { name: desc(el), shown: 0, frames: 0, widths: new Set() }; window.__bars.set(el, rec); }
      rec.frames++; if (bar) rec.shown++; rec.last = bar; rec.over = over; rec.widths.add(el.clientWidth);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const REPORT = () => [...window.__bars.values()].flatMap((r) => {
  const out = [];
  if (r.shown > 0 && !r.last) out.push(`a bar showed for ${r.shown} frames and was gone at the end`);
  else if (r.last && r.over <= 6) out.push(`a bar for only ${r.over} px of overflow`);
  else if (r.last && r.widths.size > 1 && r.shown < r.frames) out.push('bar appeared after content was visible (width changed)');
  return out.map((m) => `${r.name}: ${m}`);
});

(async () => {
  const browser = await chromium.launch(); const bad = [];
  if (WHICH === 'player') {
    for (const id of (process.env.PLAYER_IDS ?? 'ba607b88,3d284ca3').split(',')) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await page.addInitScript(SAMPLER);
      await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
      bad.push(...(await page.evaluate(REPORT)).map((x) => `player ${id} profile: ${x}`));
      let first = true;
      for (const [pane, name] of [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']]) {
        const btn = first ? page.getByRole('button', { name: name === 'Full stats' ? 'Full stats' : `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
        if (!(await btn.isEnabled().catch(() => false))) continue; await btn.click(); first = false; await page.waitForTimeout(2800);
        const n = await page.evaluate((pane) => document.querySelectorAll(`#p-${pane} .car > .tile`).length, pane);
        for (let k = 1; k < n; k++) { const r = page.locator(`#p-${pane} .arr.r:visible`).first(); if (!(await r.count())) break; await r.click().catch(() => undefined); await page.waitForTimeout(1700); }
        bad.push(...(await page.evaluate(REPORT)).map((x) => `player ${id} ${pane}: ${x}`));
        await page.evaluate(() => window.__bars.clear());
      }
      await page.close();
    }
  } else {
    for (const id of (process.env.FIT_IDS ?? '1490706,1496584').split(',')) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(SAMPLER);
      await page.goto(`http://localhost:3100/matches/${id}?view=details`); await page.waitForTimeout(3000);
      const n = await page.evaluate(() => document.querySelectorAll('.car > .tile').length);
      for (let k = 1; k < n; k++) { const r = page.locator('.arr.r:visible').first(); if (!(await r.count())) break; await r.click().catch(() => undefined); await page.waitForTimeout(1700); }
      bad.push(...(await page.evaluate(REPORT)).map((x) => `match ${id} details: ${x}`));
      await page.close();
    }
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} scroll bars wrong:`); [...new Set(bad)].forEach((x) => console.log('  ' + x)); } else console.log('no scroll bar flashed and none that was needed was missing');
  process.exit(bad.length ? 1 : 0);
})();
