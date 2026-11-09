// Ball by ball in Match details, checked against the ball files and the bundle with numbers worked out from what the page shows.
//   PLAYWRIGHT_CORE=<path> FIT_IDS=1,2,3 node scripts/perf/match-balls.cjs [webkit]
// For each innings of each match it opens Ball by ball and scrolls the whole list in steps. It checks: every ball is drawn once, in order, with the result chip the data gives; the score on the last
// ball equals the innings total and wickets; the rows drawn stay few (the list is windowed); every row is 34 px; one over heading for each over and one bar in the map; a click on a bar brings its
// over to the top; no chips above the list; the win chance column exists only when the match is not a Test and 90% of balls have a value; no bad text or console errors.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.FIT_IDS ?? '1490706,1496584,1521264,1544601,335982,1216517').split(',').map(Number);
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
const chipOf = (f, i) => { if (f.w[i]) return 'W'; if (f.wd[i]) return f.wd[i] === 1 ? 'Wd' : `${f.wd[i]} Wd`; if (f.nb[i]) return f.rb[i] ? `${f.rb[i]} Nb` : 'Nb'; if (f.by[i]) return `${f.by[i]} B`; if (f.lb[i]) return `${f.lb[i]} LB`; if (f.pe[i]) return `${f.pe[i]} Pen`; return f.rb[i] === 0 ? '•' : String(f.rb[i]); };

(async () => {
  const browser = await engine.launch(); const bad = [];
  const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
  await page.addInitScript(() => { window.addEventListener('unhandledrejection', (e) => { try { (window.__rej = window.__rej || []).push(String((e.reason && e.reason.stack) || e.reason).slice(0, 300)); } catch (_) { /* nothing to report */ } }); });
  const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.text().slice(0, 160)} @ ${m.location().url.slice(-60)}:${m.location().lineNumber} on ${page.url().slice(-50)}`); }); // The query engine starts downloading when a page has been idle for a few seconds. Leaving the page cuts the download off, and WebKit then reports the library's own "Load failed", which is not a fault of the page.
  let engineCut = false;
  page.on('requestfailed', (r) => { if (/duckdb/.test(r.url())) engineCut = true; if (process.env.DBG) logs.push(`request failed ${r.url().slice(-70)} ${r.failure() && r.failure().errorText}`); });
  page.on('pageerror', (e) => logs.push(String(e).slice(0, 160)));
  for (const id of IDS) {
    logs.length = 0;
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    const main = b.innings.filter((i) => !i.super);
    await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=ball`); await page.waitForSelector('.tile.dp', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(1500);
    const flag = (what) => bad.push(`#${id} ${b.match.kind} ${what}`);
    if ((await page.locator('[data-tile="ball"]').count()) === 0) { if (main.length) flag('no Ball by ball part'); continue; }
    for (let k = 0; k < (process.env.SO_ONLY ? 0 : main.length); k++) { // SO_ONLY=1 checks just the Super Over lists
      const inn = main[k];
      if (main.length > 1) { await page.locator('[data-tile="ball"] .msw button').nth(k).click(); await page.waitForTimeout(900); }
      await page.waitForSelector('[data-tile="ball"] .bbl', { timeout: 15000 }).catch(() => undefined);
      const f = await (await fetch(`http://localhost:8788/m/balls/${id}_${inn.n}.json`)).json();
      const n = f.d.length, label = `innings ${inn.n}`;
      const seen = new Map(); let maxDrawn = 0, rowH = new Set();
      const step = 280; const total = await page.evaluate(() => document.querySelector('[data-tile="ball"] .bbl').scrollHeight);
      for (let y = 0; y <= total + step; y += step) {
        const got = await page.evaluate((y) => { const s = document.querySelector('[data-tile="ball"] .bbl'); s.scrollTop = y; return null; }, y);
        await page.waitForTimeout(40);
        const rows = await page.evaluate(() => { return [...document.querySelectorAll('[data-tile="ball"] .bbr')].map((r) => ({ t: r.dataset.i, chip: r.querySelector('.rc')?.textContent, score: r.lastElementChild.textContent, h: Math.round(r.getBoundingClientRect().height), lab: r.firstElementChild.textContent, wp: r.querySelector('.wp') ? r.querySelector('.wp').textContent : null })); });
        maxDrawn = Math.max(maxDrawn, rows.length); rows.forEach((r) => { seen.set(r.lab + '|' + r.score + '|' + r.t, r); rowH.add(r.h); });
      }
      const list = [...seen.values()];
      if (list.length !== n) flag(`${label}: ${list.length} balls drawn, the file has ${n}`);
      if (maxDrawn > 110) flag(`${label}: ${maxDrawn} rows drawn at once (not windowed)`);
      if ([...rowH].some((h) => h < 34) || rowH.size > 1 || (n > 110 && [...rowH].some((h) => h !== 34))) flag(`${label}: row heights ${[...rowH]}`); // a short list stretches its rows to the room, a long one keeps 34
      // chips in order, from a second pass at the top
      await page.evaluate(() => { document.querySelector('[data-tile="ball"] .bbl').scrollTop = 0; }); await page.waitForTimeout(120);
      const first = await page.evaluate(() => [...document.querySelectorAll('[data-tile="ball"] .bbr .rc')].slice(0, 12).map((c) => c.textContent));
      const want = f.d.slice(0, first.length).map((_, i) => chipOf(f, i));
      if (JSON.stringify(first) !== JSON.stringify(want)) flag(`${label}: first chips ${first} ≠ ${want}`);
      // the last ball's score
      await page.evaluate(() => { const s = document.querySelector('[data-tile="ball"] .bbl'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(150);
      const last = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-tile="ball"] .bbr')].pop(); return r ? r.lastElementChild.textContent : null; });
      if (last !== `${inn.runs}/${inn.wkts}`) flag(`${label}: last score ${last} ≠ ${inn.runs}/${inn.wkts}`);
      const heads = await page.evaluate(() => ({ bars: document.querySelectorAll('[data-tile="ball"] .om').length, chips: [...document.querySelectorAll('[data-tile="ball"] .av i')].map((i) => i.textContent), win: !!document.querySelector('[data-tile="ball"] .bbh.bbw'), text: document.querySelector('[data-tile="ball"] .bbp').innerText }));
      const overs = new Set(f.ov).size;
      if (heads.bars !== overs) flag(`${label}: ${heads.bars} bars for ${overs} overs`);
      if (heads.chips.length) flag(`${label}: chips ${heads.chips} should not be drawn`);
      const wins = f.wp.filter((v) => v >= 0).length, showWin = b.match.kind !== 'test' && n > 0 && wins / n >= 0.9;
      if (heads.win !== showWin) flag(`${label}: win column ${heads.win} ≠ ${showWin}`);
      if (BAD.test(heads.text)) flag(`${label}: bad text ${(heads.text.match(BAD) || [''])[0]}`);
      // a click on a bar brings its over to the top
      if (overs > 3) {
        const bar = Math.min(overs - 1, 2);
        await page.evaluate(() => { document.querySelector('[data-tile="ball"] .bbl').scrollTop = 0; }); await page.waitForTimeout(100);
        await page.locator('[data-tile="ball"] .om').nth(bar).click(); await page.waitForTimeout(2200);
        // The over headings stick to the top of the list, so the landing is read from the first ball row at or below the top: it must be the first ball of the chosen over.
        const first = await page.evaluate(() => { const s = document.querySelector('[data-tile="ball"] .bbl').getBoundingClientRect(); const r = [...document.querySelectorAll('[data-tile="ball"] .bbr')].find((e) => e.getBoundingClientRect().top >= s.top + 30); return r ? r.firstElementChild.textContent : null; });
        const want = b.match.kind === 'hundred' ? String(bar * 5 + 1) : `${bar}.1`;
        if (first !== want) flag(`${label}: jump to bar ${bar + 1} landed on ball ${first}, wanted ${want}`);
      }
    }
    // The Super Over rounds: both innings of a round are listed one after the other, each under its own heading.
    const supers = b.innings.filter((i) => i.super);
    for (let k = 0; k * 2 < supers.length; k++) {
      const pair = supers.slice(k * 2, k * 2 + 2), label = `super over round ${k + 1}`;
      await page.locator('[data-tile="ball"] .msw button').nth(main.length + k).click(); await page.waitForTimeout(1200);
      const files = await Promise.all(pair.map(async (i) => (await fetch(`http://localhost:8788/m/balls/${id}_${i.n}.json`)).json()));
      const want = files.reduce((t, f) => t + f.d.length, 0);
      const got = await page.evaluate(() => ({ balls: document.querySelectorAll('[data-tile="ball"] .bbr').length, heads: [...document.querySelectorAll('[data-tile="ball"] .ovh')].map((e) => e.innerText.replace(/\s+/g, ' ')), omap: document.querySelectorAll('[data-tile="ball"] .om').length, text: document.querySelector('[data-tile="ball"] .bbp').innerText, scores: [...document.querySelectorAll('[data-tile="ball"] .bbr')].map((r) => r.lastElementChild.textContent) }));
      if (got.balls !== want) flag(`${label}: ${got.balls} balls drawn, the files have ${want}`);
      if (got.heads.length !== pair.length) flag(`${label}: ${got.heads.length} headings for ${pair.length} innings`);
      if (got.omap !== 0) flag(`${label}: the over map is drawn`);
      if (BAD.test(got.text)) flag(`${label}: bad text ${(got.text.match(BAD) || [''])[0]}`);
      let at = 0; pair.forEach((i, j) => { at += files[j].d.length; const last = got.scores[at - 1]; if (last !== `${i.runs}/${i.wkts}`) flag(`${label} innings ${j + 1}: last score ${last} ≠ ${i.runs}/${i.wkts}`); });
    }
    const real = logs.filter((l) => !(engineCut && /Load failed/.test(l)));
    engineCut = false;
    if (real.length) flag(`console: ${real[0]} ${JSON.stringify(await page.evaluate(() => window.__rej || []).catch(() => []))}`);
    console.log(`${id} ${b.match.kind} ${b.match.gender} ${main.length} innings: ${bad.filter((x) => x.startsWith(`#${id} `)).length ? 'FAILED' : 'ok'}`);
  }
  await browser.close();
  if (bad.length) { console.log(`\n${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); } else console.log(`\nall ${IDS.length} matches ok`);
  process.exit(bad.length ? 1 : 0);
})();
