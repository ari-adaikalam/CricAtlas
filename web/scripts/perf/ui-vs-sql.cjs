// What the root pages and the Team page show, against numbers worked out from the exported tables by tools/verify_ui_expected.py (SQL on `matches` and the balls, not the files the pages read). Run with the dev
// server on 3100 and the data server on 8788:
//   ../.venv/bin/python tools/verify_ui_expected.py --json /tmp/ui_expected.json     (from the repo root)
//   PLAYWRIGHT_CORE=<path> node scripts/perf/ui-vs-sql.cjs /tmp/ui_expected.json [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const fs = require('fs');
const exp = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const engine = process.argv.includes('webkit') ? webkit : chromium;
// The pages write a zero total as a dash.
const num = (t) => (String(t).trim() === '-' ? 0 : Number(String(t).replace(/[^\d-]/g, '')));
let bad = 0; const say = (ok, msg) => { if (!ok) { bad++; console.log('DIFF', msg); } };
(async () => {
  const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: 1352, height: 760 } });
  page.on('pageerror', (e) => { bad++; console.log('PAGEERROR', String(e).slice(0, 160)); });
  const table = async (sc) => page.evaluate((sc) => {
    const heads = [...document.querySelectorAll(`${sc} thead th`)].map((t) => t.textContent.trim());
    return [...document.querySelectorAll(`${sc} tbody tr.rlink`)].map((r) => ({ id: r.getAttribute('data-rk'), cells: Object.fromEntries([...r.children].map((c, i) => [heads[i], c.textContent.trim()])) }));
  }, sc);
  const showAll = async (sc) => { for (let i = 0; i < 80; i++) { const b = page.locator(`${sc} .more button`); if (!(await b.count())) break; await b.click(); await page.waitForTimeout(650); } }; // the button turns a ball for 360 ms before the rows are added

  // Teams root: every team
  await page.goto('http://localhost:3100/teams'); await page.waitForSelector('.rtp tbody tr.rlink'); await page.waitForTimeout(800); await showAll('.rtp');
  let rows = await table('.rtp'); const seenT = new Set();
  for (const r of rows) { const e = exp.teams[r.id]; seenT.add(r.id); if (!e) { say(false, `Teams: ${r.id} is not in the data`); continue; } const g = { played: num(r.cells.Mat), won: num(r.cells.Won), lost: num(r.cells.Lost) }; say(g.played === e.played && g.won === e.won && g.lost === e.lost, `Teams ${r.id}: page ${JSON.stringify(g)} sql ${JSON.stringify(e)}`); }
  say(seenT.size === Object.keys(exp.teams).length, `Teams: ${seenT.size} rows, ${Object.keys(exp.teams).length} in the data`);
  console.log(`Teams page: ${rows.length} teams compared`);

  // Tournaments root: the 32 with a page
  await page.goto('http://localhost:3100/tournaments'); await page.waitForSelector('.rtn tbody tr.rlink'); await page.waitForTimeout(800);
  rows = await table('.rtn');
  for (const r of rows) { const e = exp.tournaments[r.id]; if (!e) { say(false, `Tournaments: ${r.id} not in the data`); continue; } const g = { matches: num(r.cells.Mat), editions: num(r.cells.Eds), teams: num(r.cells.Teams) }; say(g.matches === e.matches && g.editions === e.editions && g.teams === e.teams, `Tournament ${r.id}: page ${JSON.stringify(g)} sql ${JSON.stringify(e)}`); }
  console.log(`Tournaments page: ${rows.length} compared`);

  // Players root: the sample, found by name
  await page.goto('http://localhost:3100/players'); await page.waitForSelector('.rpp tbody tr.rlink'); await page.waitForTimeout(800);
  let found = 0; const xiGap = [];
  for (const [id, e] of Object.entries(exp.players)) {
    await page.fill('.rpp .big input', e.name); await page.waitForTimeout(450);
    let row = null;
    for (let k = 0; k < 40 && !row; k++) { row = (await table('.rpp')).find((r) => r.id === id) ?? null; if (!row) { const b = page.locator('.rpp .more button'); if (!(await b.count())) break; await b.click(); await page.waitForTimeout(650); } }
    if (!row) { say(false, `Players: ${e.name} (${id}) not listed`); continue; }
    found++;
    const g = { matches: num(row.cells.Mat), runs: num(row.cells.Runs), wickets: num(row.cells.Wkts) };
    say(g.matches === e.matches && g.runs === e.runs && g.wickets === e.wickets, `Player ${e.name} ${id}: page ${JSON.stringify(g)} sql ${JSON.stringify({ matches: e.matches, runs: e.runs, wickets: e.wickets })}`);
  }
  console.log(`Players page: ${found} of ${Object.keys(exp.players).length} players compared`);

  // The profile's career tables count matches played the same way (the playing XI lists): the rows that are a format, in the Batting and the Bowling table.
  const once = (t) => { const s = String(t).trim(); const h = s.length / 2; return Number.isInteger(h) && s.slice(0, h) === s.slice(h) ? s.slice(0, h) : s; }; // a count that is counting up draws its text twice
  let profiles = 0;
  for (const [id, e] of Object.entries(exp.players)) {
    await page.goto(`http://localhost:3100/players/${id}`); await page.waitForSelector('.pgx table tbody tr', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(1500);
    for (const side of ['Batting', 'Bowling']) {
      if (side === 'Bowling') { const b = page.locator('.pgx button', { hasText: /^Bowling$/ }).first(); if (!(await b.count())) continue; await b.click(); await page.waitForTimeout(1200); }
      const got = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pgx table tbody tr')].map((r) => [r.children[0]?.textContent.trim(), r.children[1]?.textContent.trim()])));
      for (const [label, want] of Object.entries(e.xi_rows)) { if (!(label in got)) continue; say(num(once(got[label])) === want, `Profile ${e.name} ${id} ${side} ${label}: page ${once(got[label])} sql ${want}`); }
    }
    profiles++;
  }
  console.log(`Profile career tables: ${profiles} players compared, matches played as the playing XI lists them`);

  // Matches root: counts under filters
  await page.goto('http://localhost:3100/matches'); await page.waitForSelector('.rmp tbody tr.rlink'); await page.waitForTimeout(800);
  const count = async () => num(await page.textContent('.rmp .cnt .t b'));
  const pick = async (label, v) => { await page.selectOption(`.rmp select[aria-label="${label}"]`, { label: v }).catch(() => page.selectOption(`.rmp select[aria-label="${label}"]`, v)); await page.waitForTimeout(350); };
  const clear = async () => { const b = page.locator('.rmp .clrw.on .clr'); if (await b.count()) { await b.click(); await page.waitForTimeout(450); } };
  say((await count()) === exp.matches.total, `Matches total ${await count()} sql ${exp.matches.total}`);
  for (const [f, n] of Object.entries(exp.matches.format)) { await clear(); await pick('Format', f); say((await count()) === n, `Matches ${f}: page ${await count()} sql ${n}`); }
  for (const [g, n] of Object.entries(exp.matches.gender)) { await clear(); await pick('Gender', g); say((await count()) === n, `Matches ${g}: page ${await count()} sql ${n}`); }
  for (const [k, n] of Object.entries(exp.matches.pair)) { const [f, g] = k.split('|'); await clear(); await pick('Format', f); await pick('Gender', g); say((await count()) === n, `Matches ${f} + ${g}: page ${await count()} sql ${n}`); }
  console.log('Matches page: total, 4 formats, 2 genders and 8 pairs compared');

  // Team page: matches, won, lost in Tests, ODIs and T20Is of the busiest national teams
  let tp = 0;
  for (const [tid, byFmt] of Object.entries(exp.team_page)) {
    await page.goto(`http://localhost:3100/teams/${tid.replace(/\|/g, '~')}`); await page.waitForSelector('.sum .phead', { timeout: 30000 }); await page.waitForTimeout(700);
    await page.click('.btns button:has-text("Results")').catch(() => undefined); await page.waitForTimeout(900);
    for (const [f, e] of Object.entries(byFmt)) {
      const opt = await page.$$eval('.top select >> nth=0', (s) => []).catch(() => []);
      const ok = await page.selectOption('.top select >> nth=0', { label: f }).then(() => true).catch(() => false);
      if (!ok) { say(e.played === 0, `Team ${tid}: no ${f} choice but ${e.played} matches`); continue; }
      await page.waitForTimeout(900);
      const got = await page.evaluate(() => { const g = {}; for (const k of document.querySelectorAll('#p-res .kgrid .kn')) { const l = k.querySelector('span')?.textContent.trim(), v = k.querySelector('b')?.textContent.trim(); if (l && v) g[l] = v; } return g; });
      const g = { played: num(got.matches ?? 'x'), won: num(got.won ?? 'x'), lost: num(got.lost ?? 'x') };
      say(g.played === e.played && g.won === e.won && g.lost === e.lost, `Team page ${tid} ${f}: page ${JSON.stringify(g)} sql ${JSON.stringify(e)}`); tp++;
    }
  }
  console.log(`Team page: ${tp} team and format slices compared`);
  await browser.close();
  console.log(bad === 0 ? 'all agree' : `${bad} DIFFERENCES`); process.exit(bad === 0 ? 0 : 1);
})();
