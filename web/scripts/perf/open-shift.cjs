// Every start page by every top bar destination: does the page content jump while the new page opens? The copy of the bar held over the page (barHold.ts) once kept the site bar hidden, so a new page sat under the bar and dropped 60 px when the copy went.
//   PLAYWRIGHT_CORE=<path> [BASE=http://localhost:3100] node scripts/perf/open-shift.cjs [chromium|webkit]
const pw = require(process.env.PLAYWRIGHT_CORE);
const eng = process.argv[2] || 'chromium';
const BASE = process.env.BASE || 'http://localhost:3100';
const STARTS = ['/', '/records', '/teams', '/players/v-kohli-ba607b88', '/tournaments', '/series', '/matches', '/api'];
const DESTS = ['/', '/players', '/teams', '/matches', '/tournaments', '/series', '/records', '/api'];
(async () => {
  const b = await pw[eng].launch();
  let bad = 0, n = 0;
  for (const start of STARTS) {
    const p = await b.newPage({ viewport: { width: 1352, height: 700 } });
    await p.goto(BASE + start, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    for (const dest of DESTS) {
      if (dest === new URL(p.url()).pathname) continue;
      await p.evaluate(() => { window.scrollTo(0, 0); });
      const startPath = new URL(p.url()).pathname;
      const link = await p.evaluateHandle((d) => { const nav = [...document.querySelectorAll('.nav')].find((x) => x.getBoundingClientRect().height > 0); return nav && (nav.querySelector('a[href="' + d + '"]')); }, dest);
      const el = link.asElement();
      if (!el) { console.log(start, '->', dest, 'no link'); continue; }
      const bx = await el.boundingBox();
      await p.mouse.move(bx.x + 10, bx.y + 10, { steps: 12 });
      await p.waitForTimeout(250);
      await p.evaluate(() => {
        window.__f = [];
        const t0 = performance.now();
        const start = location.pathname;
        const tick = () => {
          const e = [...document.querySelectorAll('.pgx .wrap, .pgx .app > :not(.nav), .pgx > main')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && !x.closest('#bar-hold'); });
          const r = e ? e.getBoundingClientRect() : null;
          window.__f.push([Math.round(performance.now() - t0), location.pathname, r ? Math.round(r.top) : null, r ? Math.round(r.left) : null]);
          if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await p.mouse.click(bx.x + 10, bx.y + 10);
      await p.waitForTimeout(2600);
      const f = await p.evaluate(() => window.__f);
      // after the address has changed, the content's top and left must not move by more than 2 px from one frame to the next
      let jumps = [], prev = null;
      for (const r of f) {
        if (r[2] === null) continue;
        if (r[1] !== startPath && prev && prev[1] !== startPath && (Math.abs(r[2] - prev[2]) > 2)) jumps.push(prev[2] + '->' + r[2] + '@' + r[0]);
        prev = r;
      }
      n++;
      if (jumps.length) bad++;
      console.log(start.slice(0, 22).padEnd(22), '->', dest.padEnd(12), p.url().replace(BASE, '').slice(0, 24).padEnd(24), jumps.length ? 'JUMP ' + jumps.join(' ') : 'steady');
      // go back to the start page for the next destination
      if (new URL(p.url()).pathname !== startPath) { await p.goto(BASE + start, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); }
    }
    await p.close();
  }
  console.log(eng, n, 'openings,', bad, 'with a jump');
  process.exitCode = bad ? 1 : 0;
  await b.close();
})();
