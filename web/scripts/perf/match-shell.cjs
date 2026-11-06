// The Match page shell: the summary of every kind of match, the working-state strip, the view switch, Change match, Back and Forward, and the missing-match state.
// Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-shell.cjs [webkit]
// Every line must end in ok. A case prints what the page said so the wording can be read, not only checked.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.env.PORT ?? '3100';
const engine = process.argv[2] === 'webkit' ? webkit : chromium;

// id, what it is. The ids are real matches picked from the data: a Test draw, an innings win and a chase win, an ODI with a revised target, both Hundreds,
// a tied T20 decided by a Super Over, two Super Overs, no result, a match awarded, WBBL and WPL.
const CASES = [
  [335982, 'T20 IPL, the first match'], [1544002, 'Test draw'], [1527274, 'Test innings win'], [1496584, 'Test chase win'], [1525657, 'ODI revised target'],
  [1521264, 'Hundred men'], [1521230, 'Hundred women'], [1544601, 'T20 tie, Super Over'], [1216517, 'two Super Overs'], [1554409, 'no result'], [1544610, 'awarded'],
  [1494568, 'WBBL'], [1513703, 'WPL'], [1359525, 'IPL impact players'],
];
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
// The side that batted first is on the left (Ari, 2026-10-20).
// Where the coin and the arrows must show: match id -> [team with the coin, a player with a green arrow, a player with a red arrow].
const MARKS = { 335982: ['Royal Challengers Bengaluru', null, null], 1359525: ['Lucknow Super Giants', 'A Badoni', 'Shubman Gill'] };
const LEFT = { 335982: 'Kolkata Knight Riders', 1216517: 'Mumbai Indians', 1521264: 'Trent Rockets', 1513703: 'Delhi Capitals' };

async function summary(page) {
  return page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.innerText?.replace(/\s+/g, ' ').trim() ?? null;
    return { legend: t('.mlg-text'), cards: [...document.querySelectorAll('.minns .blk')].map((c) => `${c.querySelector('h2')?.innerText}|${c.querySelector('.ov')?.innerText}|${c.querySelector('.sc')?.innerText}`), result: t('.resbar'), body: document.querySelector('.sum')?.innerText ?? '' };
  });
}

(async () => {
  const browser = await engine.launch();
  const fails = [];
  const check = (name, ok, detail = '') => { if (!ok) fails.push(`${name} ${detail}`); return ok ? 'ok' : `FAILED ${detail}`; };
  for (const [id, label] of CASES) {
    // The smallest laptop window the page is designed for: the summary and its buttons must fit.
    const page = await browser.newPage({ viewport: { width: 1350, height: 700 } });
    const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()) /* a headless GPU performance notice from a 3D scene, not an error of the page */) logs.push(m.text().slice(0, 160)); }); page.on('pageerror', (e) => logs.push(String(e).slice(0, 160)));
    await page.goto(`http://localhost:${PORT}/matches/${id}`); await page.waitForSelector('.resbar', { timeout: 15000 }).catch(() => undefined); await page.waitForTimeout(700);
    const s = await summary(page);
    const problems = [];
    if (!s.result) problems.push('no result bar');
    if (BAD.test(s.body)) problems.push(`bad text ${s.body.match(BAD)[0]}`);
    if (s.cards.length < 1 || s.cards.length > 4) problems.push(`${s.cards.length} innings blocks`);
    const fits = await page.evaluate(() => { const b = [...document.querySelectorAll('.btns button')].map((x) => x.getBoundingClientRect().bottom); return Math.max(...b) <= window.innerHeight - 30; });
    if (!fits) problems.push('the buttons run past the bottom of the window');
    if (LEFT[id] && !s.cards[0]?.startsWith(LEFT[id] + '|')) problems.push(`left card is ${s.cards[0]?.split('|')[0]}, expected ${LEFT[id]}`);
    // Nothing may animate on the page once it has settled: a block's entrance is for blocks that arrive later (found 2026-10-20: every block replayed it 1.2 s after the page opened, which showed as a jitter after Back).
    const running = await page.evaluate(() => new Promise((res) => { let m = 0; const t0 = performance.now(); const tick = () => { const n = document.getAnimations().filter((a) => a.playState === 'running' && /blk|bh|bb/.test((a.effect?.target?.className ?? '').toString())).length; m = Math.max(m, n); if (performance.now() - t0 < 2400) requestAnimationFrame(tick); else res(m); }; tick(); }));
    if (running) problems.push(`${running} animations still running on the innings blocks after the page settled`);
    const marks = await page.evaluate(() => ({ coins: [...document.querySelectorAll('.blk h2, .mso span')].filter((h) => h.querySelector('.coin')).map((h) => h.innerText.replace(' did not bat.', '').trim()), ins: [...document.querySelectorAll('.blk .nm')].filter((n) => n.querySelector('.sub-in')).map((n) => n.innerText.trim()), outs: [...document.querySelectorAll('.blk .nm')].filter((n) => n.querySelector('.sub-out')).map((n) => n.innerText.trim()), text: document.querySelector('.sum')?.innerText ?? '' }));
    if (/won the toss|Impact players used/.test(marks.text)) problems.push('the toss or impact line is still written out');
    if (marks.coins.length === 0) problems.push('no coin');
    if (MARKS[id]) { const [coin, up, down] = MARKS[id]; if (!marks.coins.includes(coin)) problems.push(`coin is on ${marks.coins}, expected ${coin}`); if (up && !marks.ins.includes(up)) problems.push(`no green arrow on ${up}`); if (down && !marks.outs.includes(down)) problems.push(`no red arrow on ${down}`); }
    const extra = await page.evaluate(() => ({ dls: [...document.querySelectorAll('.ovw[title*="revised for rain"]')].map((e) => e.title), banner: [...document.querySelectorAll('.mbs')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | ') }));
    const follow = await page.evaluate(() => [...document.querySelectorAll('.blk .ov')].map((e) => e.innerText).filter((t) => /\(f\/o\)/.test(t)));
    if (id === 1544002 && follow.length !== 1) problems.push(`follow-on labels: ${follow}`);
    if (id !== 1544002 && follow.length) problems.push(`a follow-on label on a match with none: ${follow}`);
    if (id === 1359525 && !(await page.evaluate(() => !!document.querySelector('.resbar .sub-out')))) problems.push('no red arrow on the player of the match');
    if (/Rain, the chase/.test(marks.text)) problems.push('the DLS sentence is still written out');
    if (id === 1525657 && !extra.dls.some((t) => /^Target \d+ from \d+ overs, revised for rain \(DLS\)$/.test(t))) problems.push(`no DLS tip: ${extra.dls}`);
    if (id !== 1525657 && extra.dls.length) problems.push('a DLS tip on a match that was not revised');
    if (/^(1544002|1527274|1496584)$/.test(String(id)) && !/\|\s*(One|Two|Three|Four|Five) days?\s*\|.* to \d+ \w{3} \d{4}$/.test(extra.banner)) problems.push(`Test banner: ${extra.banner}`);
    if (!/^(1544002|1527274|1496584)$/.test(String(id)) && / to \d+ \w{3} \d{4}$/.test(extra.banner)) problems.push(`a date range outside a Test: ${extra.banner}`);
    await page.getByRole('button', { name: 'Match analysis', exact: true }).click(); await page.waitForTimeout(1200);
    const strip = await page.evaluate(() => ({ one: document.querySelector('.top .one')?.innerText.replace(/\s+/g, ' '), top: getComputedStyle(document.querySelector('.top')).opacity }));
    if (strip.top !== '1' || !strip.one) problems.push('strip not shown');
    if (BAD.test(strip.one ?? '')) problems.push('bad strip text');
    for (const v of ['Replay', 'Details', 'Analysis']) { await page.locator('#vsw').getByRole('button', { name: v, exact: true }).click(); await page.waitForTimeout(250); }
    await page.getByRole('button', { name: 'Back to the summary' }).click(); await page.waitForTimeout(1000);
    const back = await page.evaluate(() => getComputedStyle(document.querySelector('.sum')).opacity);
    if (back !== '1') problems.push(`summary opacity ${back}`);
    if (logs.length) problems.push(`console: ${logs.slice(0, 2).join(' / ')}`);
    console.log(`${id} ${label}: ${check(`${id}`, problems.length === 0, problems.join('; '))}`);
    console.log(`    ${s.legend}`); console.log(`    ${s.cards.join('   ')}`); console.log(`    ${s.result}`); console.log(`    strip: ${strip.one}`);
    await page.close();
  }
  // Change match, from the summary and from the strip, and Back and Forward.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()) /* a headless GPU performance notice from a 3D scene, not an error of the page */) logs.push(m.text().slice(0, 160)); });
    await page.goto(`http://localhost:${PORT}/matches/335982`); await page.waitForSelector('.resbar'); await page.waitForTimeout(800);
    await page.evaluate(() => { window.__marker = 'same page'; });
    const before = await summary(page);
    await page.getByRole('button', { name: 'Change match', exact: true }).first().click();
    await page.locator('.mbanner input').fill('england australia 2019'); await page.waitForTimeout(700);
    const options = await page.locator('.mbanner [role="option"]').allInnerTexts();
    console.log(`search "england australia 2019": ${options.length} results, first: ${options[0]?.replace(/\s+/g, ' ')}   ${check('search results', options.length > 0)}`);
    await page.locator('.mbanner input').press('Enter'); await page.waitForTimeout(1500);
    const after = await summary(page);
    const marker = await page.evaluate(() => window.__marker);
    console.log(`change from the summary: url ${new URL(page.url()).pathname}, same page ${marker === 'same page'}, result "${after.result}"   ${check('change in place', marker === 'same page' && after.result !== before.result && /matches\//.test(page.url()))}`);
    await page.getByRole('button', { name: 'Match details', exact: true }).click(); await page.waitForTimeout(1200);
    await page.locator('.top .tchg').getByRole('button', { name: 'Change match', exact: true }).click();
    await page.locator('.top input').fill('india pakistan 2019'); await page.waitForTimeout(700);
    const o2 = await page.locator('.top [role="option"]').allInnerTexts();
    await page.locator('.top input').press('ArrowDown'); await page.locator('.top input').press('Enter'); await page.waitForTimeout(1500);
    const url2 = new URL(page.url());
    const view = url2.searchParams.get('view');
    console.log(`change from the strip: ${o2.length} results, url ${url2.pathname}?view=${view}   ${check('change keeps the view', view === 'details' && o2.length > 0)}`);
    await page.goBack(); await page.waitForTimeout(1200);
    const backUrl = new URL(page.url()).pathname;
    const backResult = (await page.evaluate(() => document.querySelector('.top .one')?.innerText.replace(/\s+/g, ' ')));
    console.log(`Back: ${backUrl}, strip "${backResult}"   ${check('back restores the match', /royal challengers|kolkata/i.test(backResult ?? '') || backUrl !== url2.pathname)}`);
    if (logs.length) fails.push(`console on change: ${logs.slice(0, 2)}`);
    await page.close();
  }
  // A match that is not there, and an address that is not a match.
  for (const [path, what] of [['/matches/99999999', 'unknown id'], ['/matches/not-a-match', 'bad slug']]) {
    const page = await browser.newPage();
    const response = await page.goto(`http://localhost:${PORT}${path}`); await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`${what}: status ${response.status()}, says "${text.replace(/\s+/g, ' ').slice(0, 70)}"   ${check(what, /could not find|not found|went wide|404/i.test(text))}`);
    await page.close();
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n${fails.join('\n')}` : '\nall ok');
  process.exit(fails.length ? 1 : 0);
})();
