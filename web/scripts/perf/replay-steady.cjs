// The Replay's score tile keeps one size while a match plays (Ari, 2026-10-24): the scale that shrinks its content to fit (`--z`), and the height of its header, stats and over, must not change from ball
// to ball, apart from the one step when a chase adds its Need and Required rate rows. The over's label and balls sit on two lines that never wrap, so a fifth ball or an extra cannot change the tile.
// Plays a match at its top speed and samples the tile every 100 ms. Fails when the scale or a height changes more than the allowed number of times.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/replay-steady.cjs [webkit]        (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const MATCHES = [['297794', 1], ['1298150', 2]]; // [id, the most steps the tile may take (a chase adds rows once)]
(async () => {
  const browser = await engine.launch(); const bad = [];
  for (const [id, allowed] of MATCHES) {
    const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
    await page.goto(`http://localhost:3100/matches/${id}?view=replay`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.rpstart', { timeout: 30000 }); await page.waitForTimeout(1500);
    await page.click('.rpstart'); await page.click('.rpbar button:last-child').catch(() => undefined);
    const seen = [];
    for (let i = 0; i < 90; i++) {
      seen.push(await page.evaluate(() => { const p = document.querySelector('.rp-score > .pan'); if (!p) return ''; const h = (s) => { const e = p.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; }; return [Number(getComputedStyle(p).getPropertyValue('--z')).toFixed(2), h('.rhead'), h('.tover'), h('.tochips')].join('|'); }));
      await page.waitForTimeout(100);
    }
    const steps = seen.filter((s, i) => i > 0 && s !== seen[i - 1]).length;
    if (steps > allowed) bad.push(`#${id}: the score tile changed size ${steps} times while playing (allowed ${allowed}): ${[...new Set(seen)].join(' ')}`);
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('the score tile keeps one size while a match plays');
})();
