// Match details: every part of every kind of match, checked against the bundle with numbers worked out from what the page shows.
//   PLAYWRIGHT_CORE=<path> FIT_IDS=1,2,3 [ONLY=fall,batting] [VH=500] node scripts/perf/match-details.cjs [webkit]      (default ids: a spread of kinds; ONLY checks just those parts)
// For each match it opens Details, goes to each part, and for a Test to each round. It reports console errors, NaN or undefined text, a table that runs sideways, and these sums:
//   Batting: the R column plus extras equals the total.  Bowling: the R column equals the innings runs less byes, leg byes and penalty runs.  Phases and Extras: the totals equal the innings.
//   Fielding: the Total column equals the dismissals credited.  Reviews: the rows equal the review rows of the match.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const DEFAULT = '335982,1359525,1496584,1527274,1544002,1525657,1521264,1521230,1544601,1216517,1554409,1544610,1494568,1513703,1528547,1505123';
const IDS = (process.env.FIT_IDS ?? DEFAULT).split(',').map(Number);
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
const num = (t) => { const m = /-?\d+/.exec(String(t).replace(/,/g, '')); return m ? Number(m[0]) : NaN; };

(async () => {
  const browser = await engine.launch(); const bad = [];
  const page = await browser.newPage({ viewport: { width: 1352, height: Number(process.env.VH ?? 659) } });
  const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 160)); }); page.on('pageerror', (e) => logs.push(String(e).slice(0, 160)));
  for (const id of IDS) {
    logs.length = 0;
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    const main = b.innings.filter((i) => !i.super);
    await page.goto(`http://localhost:3100/matches/${id}?view=details`); await page.waitForSelector('.tile.dp', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(1800);
    if ((await page.locator('.car').count()) === 0) { const msg = await page.evaluate(() => document.body.innerText); if (!/No balls were bowled/.test(msg) || b.innings.length) bad.push(`#${id} no carousel and no explanation`); console.log(`${id} ${b.match.kind} no balls: ok`); continue; }
    const parts = await page.evaluate(() => [...document.querySelectorAll('.tile.dp')].map((t) => t.dataset.tile));
    const rounds = b.match.kind === 'test' ? (main.length > 2 ? 2 : 1) : 1;
    const flag = (what) => bad.push(`#${id} ${b.match.kind} ${what}`);
    const wantParts = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding', ...(b.coverage.reviews > 0 ? ['reviews'] : []), ...(b.innings.some((i) => i.super) ? ['so'] : []), 'ball'];
    const loopParts = wantParts.filter((p) => !process.env.ONLY || process.env.ONLY.split(',').includes(p));
    if (JSON.stringify(parts) !== JSON.stringify(wantParts)) flag(`parts ${parts} expected ${wantParts}`);
    for (let r = 0; r < rounds; r++) {
      const shown = b.match.kind === 'test' ? main.slice(r * 2, r * 2 + 2) : main;
      for (const part of loopParts) {
        await page.evaluate((p) => { const car = document.querySelector('.car'); car.style.scrollBehavior = 'auto'; const t = car.querySelector(`[data-tile="${p}"]`); car.scrollLeft = t.offsetLeft - parseFloat(getComputedStyle(car).paddingLeft); }, part);
        if (r === 1 && part !== 'info') { const sw = page.locator(`[data-tile="${part}"] .msw button`).nth(1); if (await sw.count()) await sw.click().catch(() => undefined); }
        await page.waitForTimeout(Number(process.env.WAIT ?? 1600)); // runs count up when a part comes into view, WebKit needs the longer wait
        const got = await page.evaluate((p) => {
          const t = document.querySelector(`[data-tile="${p}"]`); const pans = [...t.querySelectorAll('.pan2')];
          const tables = pans.map((pan) => ({ title: pan.querySelector('h5')?.innerText ?? '', head: [...pan.querySelectorAll('thead th')].map((x) => x.innerText.trim()), rows: [...pan.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim())), sideways: [...pan.querySelectorAll('.tsc')].some((s) => s.scrollWidth > s.clientWidth + 1), note: pan.querySelector('p.g')?.innerText ?? '' }));
          const fall = [...t.querySelectorAll('.fwrow > div')].map((d) => {
            const marks = [...d.querySelectorAll('.fow-g')]; const boxes = [...d.querySelectorAll('.fow-g text')].map((x) => { const r = x.getBoundingClientRect(); return { t: x.textContent, l: r.left, r: r.right, tp: r.top, b: r.bottom }; });
            const clash = []; boxes.forEach((a, i) => boxes.slice(i + 1).forEach((c) => { if (a.l < c.r - 2 && c.l < a.r - 2 && a.tp < c.b - 8 && c.tp < a.b - 8) clash.push(`${a.t} / ${c.t}`); }));
            const svg = d.querySelector('svg:not(.emblem)')?.getBoundingClientRect(); const pan = d.getBoundingClientRect(); const out = svg ? boxes.filter((x) => x.l < svg.left - 1 || x.r > svg.right + 1 || x.tp < svg.top - 1 || x.b > svg.bottom + 1 || x.b > pan.bottom + 1 || x.tp < pan.top - 1).map((x) => x.t) : [];
            return { n: marks.length, scores: marks.map((m) => m.querySelector('text')?.textContent), clash, out };
          });
          return { text: t.innerText, tables, fall, sideways: tables.some((x) => x.sideways) };
        }, part);
        if (BAD.test(got.text)) flag(`${part} has bad text: ${(got.text.match(BAD) || [''])[0]}`);
        if (got.sideways) flag(`${part} runs sideways`);
        if (part === 'batting') shown.forEach((inn, k) => { const t = got.tables[k]; if (!t) return flag(`batting panel ${k} missing`); const rows = t.rows; const total = rows.find((x) => x[0] === 'Total'), extras = rows.find((x) => x[0] === 'Extras'); const bats = rows.filter((x) => x[0] !== 'Total' && x[0] !== 'Extras').reduce((s, x) => s + num(x[2]), 0); if (!extras || !total || bats + num(extras[2]) !== inn.runs) flag(`batting ${inn.team} R ${bats} + extras ${extras && extras[2]} ≠ ${inn.runs}`); if (!(total && num(total[2]) === inn.runs)) flag(`batting total ${total && total[2]} ≠ ${inn.runs}`); if (rows.length - 2 !== inn.batters.length) flag(`batting rows ${rows.length - 2} ≠ ${inn.batters.length}`); });
        if (part === 'bowling') shown.forEach((inn, k) => { const t = got.tables[k]; if (!t) return flag('bowling panel missing'); const e = inn.extras; const runs = t.rows.reduce((s, x) => s + num(x[3]), 0); const wk = t.rows.reduce((s, x) => s + num(x[4]), 0); if (runs !== inn.runs - e.b - e.lb - e.pen) flag(`bowling R ${runs} ≠ ${inn.runs - e.b - e.lb - e.pen}`); if (wk !== inn.bowlers.reduce((s, x) => s + x.wkts, 0)) flag(`bowling W ${wk}`); });
        if (part === 'partnerships') shown.forEach((inn, k) => { const t = got.tables[k]; if (!t) return flag('partnerships panel missing'); const total = t.rows.reduce((s, x) => s + num(x[4]), 0); if (total !== inn.runs) flag(`partnerships ${total} ≠ ${inn.runs}`); if (t.rows.length !== inn.partnerships.length) flag(`partnership rows ${t.rows.length} ≠ ${inn.partnerships.length}`); });
        if (part === 'fall') shown.forEach((inn, k) => { const f = got.fall[k]; if (!f) return flag('fall panel missing'); const all = [...inn.fow.map((e) => ({ ...e, ret: '' })), ...inn.retired.map((e) => ({ ...e, ret: '*' }))].sort((x, y) => x.delivery - y.delivery); if (f.n !== all.length) flag(`fall marks ${f.n} ≠ ${all.length}`); const want = all.map((e) => `${e.runs}-${e.n}${e.ret}`); const strict = Number(process.env.VH ?? 659) >= 659; // a shorter window may leave out the score of a wicket in a tight cluster (its tooltip has it), never write a wrong one
          if (strict ? JSON.stringify(f.scores) !== JSON.stringify(want) : f.scores.some((x, i) => x && x !== want[i]) || f.scores.length !== want.length) flag(`fall scores ${f.scores} ≠ ${want}`); if (f.clash.length) flag(`fall texts overlap: ${f.clash.slice(0, 2).join('; ')}`); if (f.out.length) flag(`fall text outside the chart: ${f.out.slice(0, 2)}`); });
        if (part === 'so') {
          const srs = b.innings.filter((i) => i.super); const rounds2 = Math.ceil(srs.length / 2);
          for (let k = 0; k < rounds2; k++) {
            if (rounds2 > 1) { await page.locator('[data-tile="so"] .msw button').nth(k).click(); await page.waitForTimeout(1500); }
            const pair = srs.slice(k * 2, k * 2 + 2);
            const cards = await page.evaluate(() => [...document.querySelectorAll('[data-tile="so"] .pan2')].map((pan) => ({ title: pan.querySelector('h5')?.innerText, rows: [...pan.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim())), bowl: pan.querySelector('.sobowl')?.innerText })).concat([{ result: document.querySelector('[data-tile="so"] .sores')?.innerText }]));
            pair.forEach((inn, j) => { const c = cards[j]; if (!c) return flag(`so round ${k + 1} card ${j} missing`); const bats = c.rows.filter((x) => x[0] !== 'Extras').reduce((t, x) => t + num(x[2]), 0), ex = c.rows.find((x) => x[0] === 'Extras'); if (bats + (ex ? num(ex[2]) : 0) !== inn.runs) flag(`so round ${k + 1} ${inn.team} R ${bats} + extras ≠ ${inn.runs}`); if (!c.title.includes(`${inn.runs}/${inn.wkts}`)) flag(`so title ${c.title}`); if (!c.bowl || !c.bowl.startsWith('Bowling:')) flag('so bowling line missing'); });
            const res = cards[cards.length - 1].result; if (!res || BAD.test(res)) flag(`so result line ${res}`);
            if (pair.length === 2) { const t = pair[0].runs === pair[1].runs ? 'tied' : `by ${Math.abs(pair[0].runs - pair[1].runs)} run`; if (!res.includes(pair[0].runs === pair[1].runs ? 'was tied' : t)) flag(`so result "${res}" does not say ${t}`); }
          }
        }
        if (part === 'phases') shown.forEach((inn, k) => { const t = got.tables[k]; if (!t) return flag('phases panel missing'); const runs = t.rows.reduce((s, x) => s + num(x[1]), 0); const wk = t.rows.reduce((s, x) => s + num(x[2]), 0); if (runs !== inn.runs) flag(`phases runs ${runs} ≠ ${inn.runs}`); if (wk !== inn.wkts) flag(`phases wkts ${wk} ≠ ${inn.wkts}`); });
        if (part === 'extras') shown.forEach((inn, k) => { const t = got.tables[k]; if (!t) return flag('extras panel missing'); const tot = t.rows.find((x) => x[0] === 'Total'); const e = inn.extras; if (!tot || num(tot[6]) !== e.wd + e.nb + e.b + e.lb + e.pen) flag(`extras total ${tot && tot[6]}`); const phs = t.rows.filter((x) => x[0] !== 'Total').reduce((s, x) => s + num(x[6]), 0); if (tot && phs !== num(tot[6])) flag(`extras phases ${phs} ≠ ${tot[6]}`); });
        if (part === 'fielding') { const credited = shown.reduce((s, inn) => s + inn.fielding.reduce((a, f) => a + f.c + f.st + f.ro, 0), 0); const seen = got.tables.reduce((s, t) => s + t.rows.reduce((a, x) => a + (x.length >= 5 ? num(x[4]) : 0), 0), 0); if (credited !== seen) flag(`fielding ${seen} ≠ ${credited}`); }
        if (part === 'reviews') { const credited = shown.reduce((s, inn) => s + inn.reviews.length, 0); const seen = got.tables.reduce((s, t) => s + t.rows.length, 0); if (credited !== seen) flag(`reviews ${seen} ≠ ${credited}`); }
      }
    }
    if (logs.length) flag(`console: ${logs[0]}`);
    console.log(`${id} ${b.match.kind} ${b.match.gender} ${main.length} innings: ${bad.filter((x) => x.startsWith(`#${id} `)).length ? 'FAILED' : 'ok'}`);
  }
  await browser.close();
  if (bad.length) { console.log(`\n${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); } else console.log(`\nall ${IDS.length} matches ok`);
  process.exit(bad.length ? 1 : 0);
})();
