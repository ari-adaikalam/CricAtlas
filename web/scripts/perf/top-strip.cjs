// A page that has its own strip (player, team, match, tournament, Compare) must open with that strip at the top of its first frame, and the site bar must never show above it (Ari, 2026-10-24).
// A site bar that took its 60 px first made the strip draw low and then jump up, which looked like two bars. This follows the top of the strip from the moment of navigation, and fails when it ever
// sits below 0, when the site bar is on screen at the same time, or when it stays hidden on a page that needs it (a not-found panel).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/top-strip.cjs [webkit]        (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const OWN = [
  '/players/jj-bumrah-462411b3', '/players/jj-bumrah-462411b3?format=ODI&view=bowling', '/teams/india~intl~male', '/teams/england~intl~male?format=TEST&view=results',
  '/matches/64134', '/matches/64134?view=replay', '/matches/1298150?view=analysis', '/tournaments/ipl', '/tournaments/ipl?view=teams',
  '/compare', '/compare/players', '/compare/players?a=ba607b88&b=a757b0d8&view=overall', '/compare/teams',
];
// Pages that use the site bar: it must be there once they have drawn.
const SITE = ['/players/0000ffff', '/matches/999', '/teams/nope~x~y', '/tournaments/nope', '/players', '/records'];

const SAMPLE = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const site = document.querySelector('.site-nav'), siteOn = !!site && vis(site);
  const strips = [...document.querySelectorAll('.pgx .nav, .pgx .top')].filter((e) => vis(e) && !e.closest('.site-nav')).map((e) => Math.round(e.getBoundingClientRect().top));
  return { siteOn, strips };
};

(async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0;
  const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
  await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  for (const path of OWN) {
    await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(800);
    await page.goto(`http://localhost:3100${path}`, { waitUntil: 'commit' });
    const seen = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) { const s = await page.evaluate(SAMPLE).catch(() => null); if (s) seen.push(s); await page.waitForTimeout(12); }
    checked += 1;
    const low = seen.filter((s) => s.strips.some((t) => t > 2)), both = seen.filter((s) => s.siteOn && s.strips.length > 0);
    if (low.length) bad.push(`${path}: the strip was drawn low (${low[0].strips.join(',')}) in ${low.length} samples`);
    if (both.length) bad.push(`${path}: the site bar and the strip were on screen together in ${both.length} samples`);
    if (!seen.some((s) => s.strips.length > 0)) bad.push(`${path}: no strip appeared`);
  }
  for (const path of SITE) {
    await page.goto(`http://localhost:3100${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
    const s = await page.evaluate(SAMPLE); checked += 1;
    if (!s.siteOn) bad.push(`${path}: the site bar is missing`);
  }
  await browser.close();
  console.log(`${checked} pages checked`);
  if (bad.length) { console.log(`${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('the strip is at the top from the first frame, and the site bar shows where it should');
})();
