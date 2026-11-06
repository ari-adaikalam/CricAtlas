// A team's name is always shown with its emblem (Ari, 2026-10-22: "if team names come like this, there must be emblems always"). For each part of Details, each tile of Analysis and the Replay, it finds every label
// that starts with the name of one of the two teams (a heading, a legend entry, a row name) and has no emblem beside it, and reports them by tile. Sentences, tooltips, dropdowns and the legends inside charts are left out.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-emblems.cjs [webkit]        (IDS=1529228,1544002,1114879 chooses the matches)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.IDS ?? '1529228,1544002,1114879').split(',');
const PARTS = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding', 'reviews', 'ball'];

// Runs in the page.
function bare([teams, scopeSel]) {
  const scope = document.querySelector(scopeSel); if (!scope) return [];
  const out = [];
  const hasEmblem = (el) => !!(el.querySelector('svg.emblem, .tsw, .temb') || (el.previousElementSibling && (el.previousElementSibling.matches('svg.emblem, .tsw, .temb, g:has(svg.emblem)') || el.previousElementSibling.querySelector?.('svg.emblem'))));
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (t.length < 3) continue;
    const el = n.parentElement; // chart legends are left out (Ari, 2026-10-22: no emblem needed in a legend)
    if (!el || el.closest('select, option, [role=tooltip], .ctip, script, style, .elmenu, svg')) continue;
    // Places Ari chose not to have an emblem: sentences (the toss and result facts, "did not review"), the team chips that switch innings, and the summary's innings bars and banner.
    if (el.closest('dd, .rempty, .msw, .sw, .mbanner, .mact, .minns, .resbar, .top .one')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const team = teams.find((x) => t === x || t.startsWith(x + ',') || t.startsWith(x + ' batting') || t.startsWith(x + ' bowling') || t.startsWith(x + ' innings') || t.startsWith(x + ' reviews') || t.startsWith(x + ' fielding') || t.startsWith(x + ' won') || t.startsWith(x + ' chose'));
    if (!team) continue;
    // an emblem in the element, in its parent (a row or a heading), or in the legend group it belongs to
    let ok = hasEmblem(el);
    for (let p = el.parentElement, k = 0; !ok && p && k < 2 && !p.matches('.tile, .pan2, .pan, .car, svg'); p = p.parentElement, k++) ok = !!p.querySelector(':scope > svg.emblem, :scope > .tsw, :scope > .temb, :scope > * > svg.emblem, :scope > .tem');
    if (!ok) out.push(`"${t.slice(0, 44)}" in <${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}>`);
  }
  return [...new Set(out)];
}

(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader'] }); const rows = [];
  const add = (key, list) => { for (const x of list) rows.push(`${key}: ${x}`); };
  for (const id of IDS) {
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    const teams = b.match.teams.map((t) => t.name);
    const page = await browser.newPage({ viewport: { width: 1352, height: 659 } }); const tag = `#${id} ${b.match.kind}`;
    for (const part of PARTS) {
      await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=${part}`); await page.waitForSelector('#p-det .car > .tile', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2200);
      add(`${tag} Details ${part}`, await page.evaluate(bare, [teams, `#p-det [data-tile="${part}"]`]).catch(() => []));
    }
    await page.goto(`http://localhost:3100/matches/${id}?view=analysis`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 25000 }); await page.waitForTimeout(2500);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#p-ana .car > .tile')].map((t) => t.dataset.tile));
    for (const t of tiles) {
      await page.goto(`http://localhost:3100/matches/${id}?view=analysis&tile=${t}`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2600);
      add(`${tag} Analysis ${t}`, await page.evaluate(bare, [teams, `#p-ana [data-tile="${t}"]`]).catch(() => []));
    }
    await page.goto(`http://localhost:3100/matches/${id}?view=replay`); await page.waitForSelector('.rview .obody', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2500);
    for (const f of [0, 0.4, 0.95]) {
      await page.evaluate((f) => { const i = document.querySelector('.rpscrub input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(Math.floor(Number(i.max) * f))); i.dispatchEvent(new Event('input', { bubbles: true })); }, f); await page.waitForTimeout(900);
      add(`${tag} Replay`, await page.evaluate(bare, [teams, '.rview']).catch(() => []));
    }
    // the strip and the summary
    await page.goto(`http://localhost:3100/matches/${id}`); await page.waitForSelector('.btn.p', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2000);
    add(`${tag} Summary`, await page.evaluate(bare, [teams, '.sum']).catch(() => []));
    await page.close();
  }
  await browser.close();
  const uniq = [...new Set(rows)]; console.log(uniq.length ? `${uniq.length} team names with no emblem:\n${uniq.join('\n')}` : 'every team name has its emblem'); process.exit(uniq.length ? 1 : 0);
})();
