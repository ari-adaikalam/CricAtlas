// What a typed text finds, on the real data. Every search box reads a text the same way, so a word that works in one works in all. This types each text into the nav box,
// reads the first results, and checks the root tables that filter by text. It fails on the first result that is not the one a person means ("rcb" is a team, "msd" is MS Dhoni, "ind vs aus" offers Compare).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/search-cases.cjs [webkit]          (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;

// [typed text, the group of the first result, a word its title must have]
const NAV = [
  ['v kohli', 'Players', 'V Kohli'], ['virat', 'Players', 'V Kohli'], ['kohli', 'Players', 'V Kohli'], ['virat kohli', 'Players', 'V Kohli'],
  ['dhoni', 'Players', 'MS Dhoni'], ['msd', 'Players', 'MS Dhoni'], ['ab de villiers', 'Players', 'AB de Villiers'], ['abd', 'Players', 'AB de Villiers'], ['sky', 'Players', 'SK Yadav'],
  ['rohiit', 'Players', 'RG Sharma'], ['babar', 'Players', 'Babar Azam'],
  ['rcb', 'Teams', 'Royal Challengers Bengaluru'], ['csk', 'Teams', 'Chennai Super Kings'], ['gt', 'Teams', 'Gujarat Titans'], ['srh', 'Teams', 'Sunrisers Hyderabad'], ['bangalore', 'Teams', 'Royal Challengers Bengaluru'],
  ['india', 'Teams', 'India'], ['windies', 'Teams', 'West Indies'],
  ['ipl', 'Tournaments', 'Indian Premier League'], ['wc', 'Tournaments', 'World Cup'], ['women ipl', 'Tournaments', "Women's Premier League"], ['women bbl', 'Tournaments', "Women's Big Bash League"],
  ['rcb vs gt', 'Compare', 'Royal Challengers Bengaluru'], ['ind vs aus', 'Compare', 'India'], ['csk vs mi', 'Compare', 'Chennai Super Kings'], ['pak v ind', 'Compare', 'Pakistan'],
  ['kohli vs bumrah', 'Compare', 'V Kohli'], ['ms dhoni vs ab de villiers', 'Compare', 'MS Dhoni'],
  ['australia women', 'Teams', 'Australia'], ['womens world cup', 'Tournaments', "Women's"], ['ipl 2023', 'Matches', null], ['wc final 2011', 'Matches', 'India v Sri Lanka'],
];
// [page, text, a check on what the table says]. The count is read from the line that says "N of M".
const ROOTS = [
  ['/matches', 'rcb vs gt', (n) => n > 0 && n < 40], ['/matches', 'ipl 2023', (n) => n > 50], ['/matches', 'wc final 2011', (n) => n >= 1 && n <= 5], ['/matches', 'ind vs aus', (n) => n > 100],
  ['/teams', 'rcb', (n) => n >= 1 && n <= 3], ['/teams', 'csk', (n) => n === 1], ['/teams', 'women india', (n) => n >= 1 && n <= 4],
  ['/players', 'msd', (n) => n >= 1], ['/players', 'virat kohli', (n) => n === 1], ['/players', 'sky', (n) => n >= 1],
  ['/tournaments', 'wc', (n) => n >= 3], ['/tournaments', 'ipl', (n) => n === 1], ['/tournaments', 'women ipl', (n) => n === 1],
  ['/series?season=', 'ind aus', (n) => n >= 5],
];

(async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0;
  const page = await browser.newPage({ viewport: { width: 1352, height: 700 } });
  await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
  const input = page.locator('.srch input:visible').first();
  for (const [text, group, word] of NAV) {
    await input.fill(''); await input.fill(text); await page.waitForTimeout(1100);
    const first = await input.evaluate((inp) => { const res = inp.closest('.srch').querySelector('.res'); let g = ''; for (const el of res.children) { if (el.tagName === 'H6') g = el.textContent; else if (el.tagName === 'A') return { group: g, title: el.querySelector('b')?.textContent ?? '' }; } return null; });
    checked += 1;
    if (!first) bad.push(`nav "${text}": nothing found`);
    else if (first.group !== group || (word && !first.title.includes(word))) bad.push(`nav "${text}": first result is ${first.group}: ${first.title}, expected ${group}${word ? ': ' + word : ''}`);
  }
  for (const [path, text, ok] of ROOTS) {
    const p = await browser.newPage({ viewport: { width: 1352, height: 700 } });
    await p.goto(`http://localhost:3100${path}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
    await p.locator('.pgx input[type="search"]').first().fill(text); await p.waitForTimeout(1300);
    const n = await p.evaluate(() => { const t = document.querySelector('.cnt')?.textContent ?? ''; const m = t.match(/([\d,]+) of/); return m ? Number(m[1].replace(/,/g, '')) : -1; });
    checked += 1;
    if (!ok(n)) bad.push(`${path} "${text}": the table says ${n}`);
    await p.close();
  }
  await browser.close();
  console.log(`${checked} searches checked`);
  if (bad.length) { console.log(`${bad.length} that do not find what they should:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('every search finds what it should');
})();
