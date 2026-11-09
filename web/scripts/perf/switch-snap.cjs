// When one team, tournament, match or player is changed for another on the same page, do the blocks of the page move smoothly? A table with more or fewer rows than before changes the height of its card, and
// everything under it moves with it. If that happens in one frame it is a snap, not a transition. This records every large block of the page frame by frame through the switch and lists any that jumps by
// more than LIMIT px in one frame (the player page's table is the reference: it eases over about half a second).
//   PLAYWRIGHT_CORE=<path> [LIMIT=36] node scripts/perf/switch-snap.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const BASE = process.env.BASE ?? 'http://localhost:3100';
const LIMIT = +(process.env.LIMIT ?? 36);
// [name, start, top bar menu, entry index]
const SWITCHES = [
  ['Player to a player', '/players/ba607b88', 'Players', 1], ['Player to a player 2', '/players/ba607b88', 'Players', 3],
  ['Team to another team', '/teams/india~intl~male', 'Teams', 2],
  // The router is called as a link would: a move between two addresses of one section changes the page in place.
  ['Team to a franchise', '/teams/india~intl~male', { push: '/teams/mumbai-indians~ipl~male' }], ['Franchise to a team', '/teams/mumbai-indians~ipl~male', { push: '/teams/india~intl~male' }],
  ['Franchise to a franchise', '/teams/mumbai-indians~ipl~male', { push: '/teams/delhi-capitals~ipl~male' }],
  ['Tournament to a tournament', '/tournaments/ipl', 'Tournaments', 1], ['Tournament to another', '/tournaments/ipl', 'Tournaments', 3],
  ['Tournament to the IPL', '/tournaments/bbl', { push: '/tournaments/ipl' }],
  ['Match to a match', '/matches/1415755', 'Matches', 1], ['Match to a Test', '/matches/1415755', { push: '/matches/64050' }], ['A Test to a T20', '/matches/64050', { push: '/matches/1415755' }],
];
const sample = () => {
  window.__ids = new WeakMap(); let n = 0; window.__f = []; const t0 = performance.now();
  const tick = () => { const frame = {}; for (const e of document.querySelectorAll('.pgx .app *')) {
      if (e.closest('.nmp, .nav, svg, canvas, table tr, [aria-hidden=true]')) continue;
      const r = e.getBoundingClientRect(); if (r.width < 160 || r.height < 24 || r.top > innerHeight + 400) continue;
      if (!window.__ids.has(e)) window.__ids.set(e, ++n); frame[window.__ids.get(e)] = [Math.round(r.top), Math.round(r.height), e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ')[0]];
    }
    window.__f.push([Math.round(performance.now() - t0), frame]); if (performance.now() - t0 < 2400) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
(async () => {
  const browser = await engine.launch(engine === webkit ? {} : { args: ['--use-gl=swiftshader'] }); const bad = [];
  for (const [name, start, menu, n] of SWITCHES) {
    const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
    try {
      await page.goto(BASE + start, { waitUntil: 'load' }); await page.waitForTimeout(4500);
      let href;
      if (typeof menu === 'object') { href = menu.push; await page.evaluate(sample); await page.evaluate((to) => window.next.router.push(to), menu.push); await page.waitForTimeout(2600); }
      else {
        await page.locator('.nmi > a:visible', { hasText: new RegExp('^' + menu + '$') }).first().hover(); await page.waitForTimeout(900);
        const el = page.locator('.nmi:has(> a:visible) .nmp.on a:visible').nth(n); href = await el.getAttribute('href');
        await page.evaluate(sample); await el.click(); await page.waitForTimeout(2600);
      }
      const frames = await page.evaluate(() => window.__f);
      const worst = new Map();
      for (let i = 1; i < frames.length; i++) for (const [id, cur] of Object.entries(frames[i][1])) { const prev = frames[i - 1][1][id]; if (!prev) continue;
        const dTop = Math.abs(cur[0] - prev[0]), dH = Math.abs(cur[1] - prev[1]); const d = Math.max(dTop, dH);
        if (d > LIMIT && (!worst.has(id) || d > worst.get(id).d)) worst.set(id, { d, what: cur[2], at: frames[i][0], dTop, dH }); }
      const list = [...worst.values()].sort((a, b) => b.d - a.d).slice(0, 3);
      if (list.length) bad.push(`${name} (${href}): ${list.map((w) => `${w.what} jumps ${w.d} px in one frame at ${w.at} ms`).join('; ')}`);
    } catch (e) { bad.push(`${name}: could not be run (${String(e).slice(0, 70)})`); }
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} of ${SWITCHES.length} switches snap:`); bad.forEach((b) => console.log('  ' + b)); } else console.log(`no block jumps by more than ${LIMIT} px in one frame in ${SWITCHES.length} switches`);
  process.exit(bad.length ? 1 : 0);
})();
