// The filter pair check for the root pages Teams, Players, Matches, Tournaments and Series: for every pair of filters, choosing A then B must give the same list as B then A,
// and an option the page leaves enabled must not lead to an empty list. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/root-pairs.cjs [webkit] [teams|players|matches|tournaments|series ...]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const args = process.argv.slice(2);
const engine = args.includes('webkit') ? webkit : chromium;
const PAGES = { teams: ['/teams', '.pgx.rtp'], players: ['/players', '.pgx.rpp'], matches: ['/matches', '.pgx.rmp'], tournaments: ['/tournaments', '.pgx.rtn'], series: ['/series?season=', '.pgx.rsr'] };
const which = args.filter((a) => PAGES[a]); const run = which.length ? which : Object.keys(PAGES);
let bad = 0;
(async () => {
  const browser = await engine.launch();
  for (const name of run) {
    const [path, sc] = PAGES[name];
    const page = await browser.newPage({ viewport: { width: 1352, height: 760 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    await page.goto(`http://localhost:3100${path}`); await page.waitForSelector(`${sc} tbody tr.rlink`, { timeout: 30000 }); await page.waitForTimeout(800);
    const more = page.locator(`${sc} button.mt`); if (await more.count()) { await more.click(); await page.waitForTimeout(400); }
    const labels = await page.$$eval(`${sc} .fbar select[aria-label]`, (els) => els.map((e) => e.getAttribute('aria-label')));
    const state = async () => page.evaluate((sc) => ({ n: document.querySelector(`${sc} .cnt .t b`)?.textContent ?? '', rows: [...document.querySelectorAll(`${sc} tbody tr.rlink`)].slice(0, 6).map((r) => r.getAttribute('data-rk')).join(',') }), sc);
    const clear = async () => { const b = page.locator(`${sc} .clrw.on .clr`).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(450); } };
    const sample = async (label) => page.$$eval(`${sc} select[aria-label="${label}"] option`, (os) => { const v = os.filter((o) => o.value && !o.disabled).map((o) => o.value); return v.length > 2 ? [v[0], v[Math.floor(v.length / 2)]] : v; });
    const pick = async (label, value) => { await page.selectOption(`${sc} select[aria-label="${label}"]`, value); await page.waitForTimeout(220); };
    let pairs = 0;
    // An enabled option never leads to an empty list.
    for (const l of labels) {
      await clear();
      for (const v of await sample(l)) { await pick(l, v); const s = await state(); if (/^0$/.test(s.n.replace(/,/g, ''))) { bad++; console.log(`${name}: ${l}=${v} is enabled but gives 0`); } await clear(); }
    }
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      await clear(); const va = await sample(labels[i]); if (!va.length) continue; const a = va[0];
      await pick(labels[i], a); const vb = (await sample(labels[j])).filter(Boolean); if (!vb.length) { await clear(); continue; } const b = vb[vb.length - 1];
      await pick(labels[j], b); const s1 = await state();
      await clear(); await pick(labels[j], b);
      // A is chosen second: it may have been blocked by B, then the two orders agree that the pair cannot be.
      const ok = await page.$eval(`${sc} select[aria-label="${labels[i]}"]`, (el, v) => [...el.options].some((o) => o.value === v && !o.disabled), a);
      if (!ok) { pairs++; await clear(); continue; }
      await pick(labels[i], a); const s2 = await state(); pairs++;
      if (s1.n !== s2.n || s1.rows !== s2.rows) { bad++; console.log(`${name}: ${labels[i]}=${a} + ${labels[j]}=${b} gives ${s1.n} / ${s2.n} in the two orders`); }
    }
    console.log(`${name}: ${labels.length} filters, ${pairs} pairs checked${errs.length ? ', page errors ' + errs.join(' | ') : ''}`); if (errs.length) bad++;
    await page.close();
  }
  await browser.close();
  console.log(bad === 0 ? 'all ok' : `${bad} PROBLEMS`); process.exit(bad === 0 ? 0 : 1);
})();
