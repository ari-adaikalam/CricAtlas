// The match and player search panels (Ari, 2026-10-20): the panel stays inside the window, "india" lists all of India's matches a page at a time, "ind vs aus" lists matches between the two,
// the Men, Women choice narrows both searches. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-search.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
(async () => {
  const browser = await engine.launch();
  const fails = []; const note = (name, ok, detail = '') => { console.log(`${name}: ${ok ? 'ok' : 'FAILED'} ${detail}`); if (!ok) fails.push(`${name} ${detail}`); };
  for (const height of [640, 800]) {
    const page = await browser.newPage({ viewport: { width: 1350, height } });
    await page.goto('http://localhost:3100/matches/1359525'); await page.waitForSelector('.resbar'); await page.waitForTimeout(800);
    const panel = async () => page.evaluate(() => { const r = document.querySelector('.mbanner .res')?.getBoundingClientRect(); return r ? { bottom: Math.round(r.bottom), top: Math.round(r.top), h: innerHeight } : null; });
    const header = async () => (await page.locator('.mbanner .res h6').first().innerText().catch(() => '')).trim();
    const rows = async () => page.locator('.mbanner .res a[role="option"]').count();
    await page.getByRole('button', { name: 'Change match', exact: true }).first().click(); await page.waitForTimeout(500);
    let p = await panel(); note(`${height}px: the empty panel is inside the window`, p && p.bottom <= p.h, JSON.stringify(p));
    await page.locator('.mbanner input').fill('india'); await page.waitForTimeout(900);
    const h1 = await header(); const n1 = parseInt(h1.replace(/,/g, ''), 10);
    p = await panel(); note(`${height}px: "india" lists many matches`, n1 > 500 && p.bottom <= p.h, `${h1}, panel bottom ${p.bottom} of ${p.h}`);
    const fmts = await page.locator('.mbanner .res a[role="option"] .fmt').allInnerTexts();
    note(`${height}px: every result names its format`, fmts.length >= 40 && fmts.every((t) => /^(Test|ODI|T20I|T20|The Hundred)$/.test(t.trim())), [...new Set(fmts)].join(', '));
    const first = await rows(); await page.locator('.mbanner .res .more').click(); await page.waitForTimeout(300);
    note(`${height}px: Show more adds a page`, (await rows()) > first, `${first} -> ${await rows()}`);
    const sample = await page.locator('.mbanner .res a[role="option"] .mh b').allInnerTexts();
    note(`${height}px: every listed match has India`, sample.slice(0, 60).every((t) => /India/.test(t)), sample.slice(0, 3).join(' | '));
    await page.locator('.mbanner .rgen').getByRole('button', { name: 'Women', exact: true }).click(); await page.waitForTimeout(800);
    const nw = parseInt((await header()).replace(/,/g, ''), 10);
    note(`${height}px: Women narrows "india"`, nw > 0 && nw < n1, `${n1} -> ${nw}`);
    await page.locator('.mbanner .rgen').getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('.mbanner input').fill('ind vs aus'); await page.waitForTimeout(900);
    const pair = await page.locator('.mbanner .res a[role="option"] .mh b').allInnerTexts();
    note(`${height}px: "ind vs aus" lists India and Australia matches`, pair.length > 20 && pair.slice(0, 40).every((t) => /India/.test(t) && /Australia/.test(t)), `${await header()}, e.g. ${pair[0]}`);
    if (height === 800) await page.screenshot({ path: process.env.SHOT ?? '/tmp/match-search.png' });
    await page.close();
  }
  // The player search in the top bar has the same choice, and it is shared.
  {
    const page = await browser.newPage({ viewport: { width: 1350, height: 700 } });
    await page.goto('http://localhost:3100/matches/1359525'); await page.waitForSelector('.resbar'); await page.waitForTimeout(800);
    await page.locator('.pgx .nav input[type="search"]').fill('mandhana'); await page.waitForTimeout(900);
    const all = await page.locator('.pgx .nav .res a').allInnerTexts();
    await page.locator('.pgx .nav .rgen').getByRole('button', { name: 'Men', exact: true }).click(); await page.waitForTimeout(700);
    const men = await page.locator('.pgx .nav .res a').allInnerTexts();
    await page.locator('.pgx .nav .rgen').getByRole('button', { name: 'Women', exact: true }).click(); await page.waitForTimeout(700);
    const women = await page.locator('.pgx .nav .res a').allInnerTexts();
    note('player search: Men hides a woman, Women shows her', all.some((t) => /Mandhana/.test(t)) && !men.some((t) => /S Mandhana/.test(t)) && women.some((t) => /S Mandhana/.test(t)), `all ${all.length}, men ${men.length}, women ${women.length}`);
    await page.close();
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok'); process.exit(fails.length ? 1 : 0);
})();
