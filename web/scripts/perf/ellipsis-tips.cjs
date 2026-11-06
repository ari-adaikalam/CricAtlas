// Text that is cut short with "…" has its full text on hover (Ari, 2026-10-24, components/EllipsisTips.tsx). This opens every page and view in a narrow window, where text gets cut, moves a real pointer over each piece
// of cut text that is on screen, and fails when no tip with its text appears (an area with a tip of its own, `data-tip` or `title`, is left to it).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/ellipsis-tips.cjs [webkit]          (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PAGES = ['/', '/players', '/teams', '/matches', '/tournaments', '/series', '/records', '/matches/1529228', '/matches/1529228?view=details', '/matches/1529228?view=analysis', '/teams/india~intl~male?view=results',
  '/players/v-kohli-ba607b88?view=batting', '/compare/players?a=ba607b88&b=462411b3'];

const CUT = () => [...document.querySelectorAll('body *')].filter((el) => {
  if (!(el instanceof HTMLElement) || el.closest('.ellip-tip') || el.closest('[data-tip]') || el.hasAttribute('title') || el.closest('[title]')) return false;
  const cs = getComputedStyle(el); if (cs.textOverflow !== 'ellipsis' || el.scrollWidth <= el.clientWidth + 1) return false;
  const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 6 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.05;
}).slice(0, 12).map((el, i) => { el.setAttribute('data-cut-probe', String(i)); const r = el.getBoundingClientRect(); return { i, x: r.x + Math.min(20, r.width / 2), y: r.y + r.height / 2, text: el.textContent.replace(/\s+/g, ' ').trim() }; });

if (process.argv.includes('--selftest')) {
  // proves the detector finds cut text that has no tip, and leaves cut text that has a tip of its own, before the script is trusted
  (async () => {
    const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto('data:text/html,' + encodeURIComponent('<style>.c{width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><div class="c">a very long piece of text that is cut</div><div class="c" title="own tip">another very long piece of text that is cut</div>'));
    const cuts = await page.evaluate(CUT); await browser.close();
    const ok = cuts.length === 1 && cuts[0].text.startsWith('a very long');
    console.log(ok ? 'self-test ok: ' + cuts.map((c) => c.text.slice(0, 20)).join(' | ') : 'self-test FAILED: ' + JSON.stringify(cuts)); process.exit(ok ? 0 : 1);
  })();
} else (async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0, cutSeen = 0;
  for (const [w, h] of [[900, 700], [1100, 700]]) {
    for (const url of PAGES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`http://localhost:3100${url}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
      // The Home hero plays on its own and rewrites its readouts every few frames, so a tip read when the pointer arrived is not the text a moment later. It is paused for the check (a live readout is not a cut text without a tip).
      if (url === '/') { await page.click('.hm-ib[aria-label="Pause"]').catch(() => undefined); await page.waitForTimeout(300); }
      const cuts = await page.evaluate(CUT); checked += 1;
      for (const c of cuts) {
        cutSeen += 1;
        await page.mouse.move(2, 2); await page.waitForTimeout(150); await page.mouse.move(c.x, c.y); await page.waitForTimeout(600);
        const tip = await page.evaluate(() => { const t = document.querySelector('.ellip-tip'); return t && t.classList.contains('on') ? t.textContent : null; });
        if (!tip || !tip.includes(c.text.slice(0, 20))) bad.push(`${w}px ${url}: "${c.text.slice(0, 50)}" is cut and shows ${tip ? '"' + tip.slice(0, 40) + '"' : 'no tip'}`);
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(`${checked} pages checked, ${cutSeen} cut texts hovered`);
  if (bad.length) { console.log(`${bad.length} cut texts without their tip:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('every cut text shows its full text');
})();
