// An address that names a player, match, team or tournament the data does not have answers HTTP 404 with the not-found panel, and a real one answers 200 (Ari, 2026-10-24, src/proxy.ts). The panel
// names what was not found. Plain HTTP, no browser needed for the statuses; the words are read from the rendered page.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/not-found.cjs [webkit]        (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
// [path, status, a word the page must say (null for a real page)]
const CASES = [
  ['/players/0000ffff', 404, 'player'], ['/players/zzzzzzzz', 404, 'player'], ['/matches/999', 404, 'match'], ['/teams/nope~x~y', 404, 'team'], ['/tournaments/nope', 404, 'tournament'],
  ['/nothing-here', 404, 'page'], ['/compare/zzz', 404, 'page'],
  ['/players/jj-bumrah-462411b3', 200, null], ['/matches/64134', 200, null], ['/matches/1298150', 200, null], ['/teams/india~intl~male', 200, null], ['/tournaments/ipl', 200, null],
  ['/compare/players?a=zzzz1234&b=ba607b88', 200, null], ['/records?scope=bogus', 200, null],
];
(async () => {
  const browser = await engine.launch(); const bad = [];
  const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
  for (const [path, status, word] of CASES) {
    const r = await page.goto(`http://localhost:3100${path}`, { waitUntil: 'domcontentloaded' });
    if (r.status() !== status) bad.push(`${path}: status ${r.status()}, expected ${status}`);
    if (word) {
      await page.waitForTimeout(3000);
      const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
      if (!text.includes('That one went wide') || !text.includes(`that ${word}`)) bad.push(`${path}: the panel does not say "that ${word}" (${text.slice(0, 60).replace(/\n/g, ' ')})`);
    }
  }
  await browser.close();
  console.log(`${CASES.length} addresses checked`);
  if (bad.length) { console.log(`${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('unknown addresses answer 404 with the right words, and real ones 200');
})();
