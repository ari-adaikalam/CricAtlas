// The career table of a player's profile must not wobble while it opens (Ari, 2026-10-25): no bar up and down or sideways that comes or goes, even for a frame, none for a few pixels, and the table's width
// stays put once it is there. A table with more rows than its area holds (Pollard) has its bar from the first frame to the last, which is right. A bar that is hidden again a frame later still moves the table (its width changes by the bar's width), which is the jitter seen as the rows animate. Samples on every animation frame for 3.5 s.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/profile-jitter.cjs [webkit]        (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PLAYERS = ['v-kohli-ba607b88', 'jj-bumrah-462411b3', 'ka-pollard-a757b0d8', 'ms-dhoni-4a8a2e3b'];
const SIZES = [[1352, 600], [1352, 700], [1440, 900]];
const SAMPLER = () => {
  window.__j = { frames: 0, bars: [], prev: null, widths: new Set(), heights: new Set(), rowsH: new Set(), t0: performance.now() };
  const tick = () => {
    const t = document.querySelector('.pgx .tsc'); const now = Math.round(performance.now() - window.__j.t0);
    if (t) {
      const cs = getComputedStyle(t);
      const x = cs.overflowX === 'scroll' || (/(auto|scroll)/.test(cs.overflowX) && t.scrollWidth > t.clientWidth + 1), y = cs.overflowY === 'scroll' || (/(auto|scroll)/.test(cs.overflowY) && t.scrollHeight > t.clientHeight + 1);
      // A bar is what the browser draws: the area's own width minus its client width, which is also what shakes the table.
      const barW = t.offsetWidth - t.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
      const state = `${x ? 'sideways ' : ''}${y ? 'down ' : ''}`.trim() || 'none';
      const over = Math.max(t.scrollHeight - t.clientHeight, t.scrollWidth - t.clientWidth);
      if (window.__j.prev !== null && window.__j.prev !== state) window.__j.bars.push(`${now}ms ${window.__j.prev} -> ${state}`);
      if ((x || y) && over <= 6) window.__j.bars.push(`${now}ms a bar for ${over}px of overflow`);
      window.__j.prev = state;
      window.__j.frames += 1; window.__j.widths.add(Math.round(t.clientWidth)); window.__j.heights.add(Math.round(t.clientHeight));
    }
    if (now < 3500) requestAnimationFrame(tick);
  };
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick));
};
(async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0;
  for (const [w, h] of SIZES) for (const slug of PLAYERS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.addInitScript(SAMPLER);
    await page.goto(`http://localhost:3100/players/${slug}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4200);
    const r = await page.evaluate(() => ({ frames: window.__j.frames, bars: window.__j.bars, widths: [...window.__j.widths], heights: [...window.__j.heights] }));
    checked += 1;
    if (r.frames < 20) bad.push(`${w}x${h} ${slug}: the table was not seen (${r.frames} frames)`);
    if (r.bars.length) bad.push(`${w}x${h} ${slug}: a bar that comes or goes, or is for a few pixels, on the career table (${r.bars.slice(0, 3).join('; ')}${r.bars.length > 3 ? ' ...' : ''})`);
    if (r.widths.length > 1) bad.push(`${w}x${h} ${slug}: the table's width changed (${r.widths.join(', ')})`);
    await page.close();
  }
  await browser.close();
  console.log(`${checked} profiles checked`);
  if (bad.length) { console.log(`${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('the career table opens with no bar and no change of width');
})();
