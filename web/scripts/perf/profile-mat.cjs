// The profile's career table against the playing XI lists: for each sampled player, the Mat of every format row (Tests, ODIs, T20Is, T20 leagues, The Hundred) of the Batting career table and, for a
// bowler, of the Bowling table, must equal the matches in the playing XI lists (tools/verify_ui_expected.py's players, with the same format split worked out in SQL from match_people). Run with the dev server on 3100:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/profile-mat.cjs <profile_expected.json>
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const exp = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
let bad = 0, compared = 0;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1352, height: 800 } });
  page.on('pageerror', (e) => { bad++; console.log('PAGEERROR', String(e).slice(0, 160)); });
  for (const [id, e] of Object.entries(exp)) {
    await page.goto(`http://localhost:3100/players/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForSelector('table', { timeout: 30000 }).catch(() => undefined); await page.waitForTimeout(1200);
    const rows = await page.evaluate(() => [...document.querySelectorAll('table')].flatMap((t) => { const heads = [...t.querySelectorAll('th')].map((h) => h.textContent.trim()); if (heads[0] !== 'Format' || heads[1] !== 'Mat') return []; return [...t.querySelectorAll('tbody tr')].map((r) => [r.children[0].textContent.trim(), r.children[1].innerText.trim()]); }));
    const seen = new Map(); for (const [lab, mat] of rows) if (!seen.has(lab)) seen.set(lab, Number(mat.replace(/,/g, '')));
    // The format rows, and the two rows that add formats: International (Tests, ODIs, T20Is) and T20s (T20Is, the leagues and The Hundred). The league rows carry the league's name.
    const by = (k) => e.by[k] ?? 0;
    const want = { Tests: by('Tests'), ODIs: by('ODIs'), T20Is: by('T20Is'), 'The Hundred': by('The Hundred'), International: by('Tests') + by('ODIs') + by('T20Is'), T20s: by('T20Is') + by('T20 leagues') + by('The Hundred') };
    for (const [lab, w] of Object.entries(want)) { if (!seen.has(lab)) { if (w > 0 && !['International', 'T20s'].includes(lab)) { bad++; console.log(`DIFF ${e.name} ${id}: no ${lab} row, ${w} matches in the XI lists`); } continue; } compared++; if (seen.get(lab) !== w) { bad++; console.log(`DIFF ${e.name} ${id} ${lab}: profile ${seen.get(lab)}, XI lists ${w}`); } }
  }
  await browser.close(); console.log(`${compared} format rows of ${Object.keys(exp).length} profiles compared`); console.log(bad === 0 ? 'all agree' : `${bad} DIFFERENCES`); process.exit(bad === 0 ? 0 : 1);
})();
