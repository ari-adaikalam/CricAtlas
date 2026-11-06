// The Match info part lays its cards out for every case the data has (Ari, 2026-10-22): the Match, Player of the match and Officials cards in the first row, the Innings card (its innings stacked, the note at the
// bottom) and, when the match has replacements, the Replacements card in the second. With replacements Officials keeps its height; with none, Officials and the Player of the match run the full height. Checks, for
// one match of each case and at three window sizes, that no card is empty-sized or passes the tile, nothing inside a card passes its edge, the cards do not overlap, and the rule above holds.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-info-layout.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.IDS ?? '1355616,1299204,1417822,1417855,1355601,1152841,1387601,1233463,1377005,1263164,1339605,1442989,1473492,1426261,1152744,1206635,439153,1223869,1109604,531986').split(',');
const SIZES = (process.env.SIZES ?? '1352x659,1100x640,1280x560').split(',').map((s) => s.split('x').map(Number));
const read = () => {
  const tile = document.querySelector('[data-tile="info"]'); const grid = tile.querySelector('.minfo'); const g = grid.getBoundingClientRect();
  const cards = [...grid.querySelectorAll(':scope > .mip')].map((c) => ({ name: c.querySelector('h5')?.textContent ?? '', cls: c.className, r: c.getBoundingClientRect(), scroll: c.scrollHeight > c.clientHeight + 1, grid: grid.scrollHeight > grid.clientHeight + 1 }));
  const faults = [];
  // A window too short for the cards makes the area scroll inside itself, which is fine as long as it can scroll.
  const scrolls = /(auto|scroll)/.test(getComputedStyle(grid).overflowY);
  for (const c of cards) { if (c.r.width < 60 || c.r.height < 40) faults.push(`${c.name} is ${Math.round(c.r.width)}x${Math.round(c.r.height)}`); if (c.r.right > g.right + 1 || (c.r.bottom > g.bottom + 1 && !scrolls)) faults.push(`${c.name} passes the grid and the area does not scroll`); if (c.scroll) faults.push(`${c.name} has content passing its edge`); }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i].r, b = cards[j].r; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) faults.push(`${cards[i].name} overlaps ${cards[j].name}`); }
  const find = (n) => cards.find((c) => c.name === n);
  const off = find('Officials'), pom = find('Player of the match'), rep = find('Replacements'), inn = find('Innings');
  const rowH = pom ? pom.r.height : 0;
  if (rep) { if (off && off.r.height > rowH + 4 && off.r.bottom > (inn ? inn.r.top : 1e9)) faults.push('Officials is extended although there are replacements'); }
  else if (off && pom) { if (!(off.r.bottom > (inn ? inn.r.top : 0) + 20)) faults.push('Officials is not extended although the space is free'); if (!(pom.r.bottom > (inn ? inn.r.top : 0) + 20)) faults.push('Player of the match is not extended although the space is free'); }
  if (g.bottom - Math.max(...cards.map((c) => c.r.bottom)) > 80) faults.push('a gap of more than 80 px under the cards');
  return faults;
};
(async () => {
  const browser = await engine.launch(); const bad = [];
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    for (const id of IDS) {
      await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=info`); await page.waitForSelector('#p-det [data-tile="info"] .minfo', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2800);
      const f = await page.evaluate(read).catch((e) => [`could not read: ${String(e).slice(0, 80)}`]); for (const x of f) bad.push(`${w}x${h} #${id}: ${x}`);
    }
    await page.close();
  }
  await browser.close(); console.log(bad.length ? bad.join('\n') : `every Match info layout is as agreed (${IDS.length} cases, ${SIZES.length} window sizes)`); process.exit(bad.length ? 1 : 0);
})();
