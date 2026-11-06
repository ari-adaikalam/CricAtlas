// Every player name on the Match page leads somewhere (Ari, 2026-10-22: "in many charts player names are not linked"). For each part of Details, each tile of Analysis and the Replay, it finds every name of a player of the
// match (batters, bowlers, fielders, the player of the match) that is drawn as text and is not inside a link, and reports them by tile. A name in a dropdown or in a tooltip is left out.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-names.cjs [webkit]        (IDS=1529228,1544002,1114879 chooses the matches)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.IDS ?? '1529228,1544002,1114879').split(',');
const PARTS = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding', 'reviews', 'ball'];

// Runs in the page: the names (from the match) drawn as text outside any link.
function unlinked([names, scopeSel]) {
  const scope = document.querySelector(scopeSel); if (!scope) return []; // a part the match does not have (no reviews, say)
  const out = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (t.length < 4) continue;
    const el = n.parentElement; if (!el) continue;
    if (el.closest('a, select, option, .elmenu, [role=tooltip], .ctip, script, style')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const hit = names.find((name) => t.includes(name));
    if (hit) out.push(`${hit} in <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.className && el.className.baseVal ? '.' + el.className.baseVal.split(' ')[0] : ''}>`);
  }
  return [...new Set(out)];
}

(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader'] }); const rows = new Map();
  const add = (key, list) => { for (const x of list) rows.set(`${key}: ${x}`, (rows.get(`${key}: ${x}`) ?? 0) + 1); };
  for (const id of IDS) {
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    const names = new Set();
    for (const i of b.innings) { for (const x of i.batters) names.add(x.name); for (const x of i.bowlers) names.add(x.name); for (const x of i.didNotBat ?? []) names.add(x.name); for (const f of i.fielding ?? []) names.add(f.name); }
    for (const p of b.match.potm ?? []) names.add(p.name);
    const list = [...names].filter((x) => x && x.length > 3).sort((a, z) => z.length - a.length);
    const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
    const tag = `#${id} ${b.match.kind}`;
    for (const part of PARTS) {
      await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=${part}`); await page.waitForSelector('#p-det .car > .tile', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2200);
      add(`${tag} Details ${part}`, await page.evaluate(unlinked, [list, `#p-det [data-tile="${part}"]`]).catch(() => []));
    }
    const tiles = await (async () => { await page.goto(`http://localhost:3100/matches/${id}?view=analysis`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 25000 }); await page.waitForTimeout(2500); return page.evaluate(() => [...document.querySelectorAll('#p-ana .car > .tile')].map((t) => t.dataset.tile)); })();
    for (const t of tiles) {
      await page.goto(`http://localhost:3100/matches/${id}?view=analysis&tile=${t}`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2600);
      add(`${tag} Analysis ${t}`, await page.evaluate(unlinked, [list, `#p-ana [data-tile="${t}"]`]).catch(() => []));
    }
    await page.goto(`http://localhost:3100/matches/${id}?view=replay`); await page.waitForSelector('.rview .obody', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2500);
    for (const at of [0.4, 0.95]) {
      await page.evaluate((f) => { const i = document.querySelector('.rpscrub input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(Math.floor(Number(i.max) * f))); i.dispatchEvent(new Event('input', { bubbles: true })); }, at); await page.waitForTimeout(900);
      add(`${tag} Replay`, await page.evaluate(unlinked, [list, '.rview']).catch(() => []));
    }
    await page.close();
  }
  await browser.close();
  const out = [...rows.keys()]; console.log(out.length ? `${out.length} unlinked names:\n${out.join('\n')}` : 'every name is a link');
  process.exit(out.length ? 1 : 0);
})();
