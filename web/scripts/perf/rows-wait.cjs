// A row waiting for its tile to play must stay hidden: globals.css shows a held-back table after 3 seconds (rowsUnstick) so a script that never runs cannot leave it blank, and a tile nobody has visited
// yet waits much longer, so its rows used to appear on their own, vanish when the tile was reached and fade in again (found on the Compare pages, 2026-10-25). This loads every page and view, waits past the
// 3 seconds, and reports each row that is on screen and visible while its container still says wait (a row below the fold of a tall tile is shown at once by design, `data-late`).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/rows-wait.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
// A row is whatever carries `data-mrow` (RowMarker stamps it from domain/rowSelector.ts) and a table body row. The check does not know a class name: that list is what drifted (Ari, 2026-10-24). A second sweep is the net
// for the next new kind of row: inside a waiting container, a group of four or more siblings with the same tag and class that is not marked and shows is reported as UNMARKED. Mark it (`data-mrow` in its markup or a
// class in rowSelector.ts), or exempt a part that should show at once with `data-static`.
const ROWS = '[data-mrow], tbody tr';
const scan = (page) => page.evaluate((sel) => {
  const shown = (r) => +getComputedStyle(r).opacity > 0.05 && r.getBoundingClientRect().height > 0 && r.getBoundingClientRect().top < innerHeight && r.getBoundingClientRect().bottom > 0 && r.getBoundingClientRect().left < innerWidth && r.getBoundingClientRect().right > 0;
  const where = (m) => m.closest('[data-tile]')?.dataset.tile ?? m.className.toString().slice(0, 14);
  const out = [];
  for (const m of document.querySelectorAll('[data-rows="wait"]')) {
    for (const r of m.querySelectorAll(sel)) if (shown(r)) out.push(`${where(m)}:${r.className.toString().slice(0, 14) || r.tagName.toLowerCase()}`);
    const groups = new Map();
    for (const el of m.querySelectorAll('*')) {
      if (!el.parentElement || el.hasAttribute('data-mrow') || el.closest('[data-mrow], [data-static], svg, thead, canvas') || el.tagName === 'TR' || !el.className || typeof el.className !== 'string') continue;
      const key = el.tagName + '.' + el.className.trim().split(/\s+/).join('.'); const list = groups.get(el.parentElement) ?? new Map(); list.set(key, (list.get(key) ?? []).concat([el])); groups.set(el.parentElement, list);
    }
    for (const list of groups.values()) for (const [key, els] of list) if (els.length >= 4 && els.some((e) => e.textContent.trim() && shown(e))) out.push(`UNMARKED ${where(m)}:${key.slice(0, 26)} x${els.length}`);
  }
  return out;
}, ROWS);
if (process.argv.includes('--selftest')) {
  // proves the detector sees a marked row that shows while its container waits, an unmarked group of rows that shows, and passes rows that stay hidden, a group that is `data-static` and a container that plays, before the script is trusted
  (async () => {
    const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const group = (cls, extra = '') => `<div ${extra}>` + [1, 2, 3, 4].map((i) => `<div class="${cls}">card ${i}</div>`).join('') + '</div>';
    await page.goto('data:text/html,' + encodeURIComponent('<style>.hide{opacity:0}</style><div data-rows="wait" data-tile="shows"><div class="cr" data-mrow>shown</div></div><div data-rows="wait" data-tile="hidden"><div class="cr hide" data-mrow>hidden</div></div><div data-rows="play" data-tile="playing"><div class="cr" data-mrow>playing</div></div><div data-rows="wait" data-tile="newkind">' + group('zz') + '</div><div data-rows="wait" data-tile="exempt">' + group('legend', 'data-static') + '</div><div data-rows="wait" data-tile="marked">' + group('yy hide') + '</div>'));
    const found = await scan(page); await browser.close();
    const ok = found.length === 2 && found.some((f) => f.startsWith('shows:')) && found.some((f) => f.startsWith('UNMARKED newkind:'));
    console.log(ok ? 'self-test ok: ' + found.join(' ') : 'self-test FAILED: ' + JSON.stringify(found)); process.exit(ok ? 0 : 1);
  })();
} else (async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0;
  const check = async (page, label) => { await page.waitForTimeout(4500); const found = [...new Set(await scan(page))]; checked += 1; if (found.length) bad.push(`${label}: ${found.slice(0, 6).join(' ')}`); };
  const open = async (url, label, views = []) => {
    const page = await browser.newPage({ viewport: { width: 1481, height: 751 } });
    await page.goto(`http://localhost:3100${url}`); await page.waitForTimeout(3000);
    await check(page, label);
    for (const [name, selector] of views) { const b = page.locator(selector).first(); if (!(await b.count()) || !(await b.isEnabled().catch(() => false))) continue; await b.click().catch(() => undefined); await page.waitForTimeout(2500); await check(page, `${label} ${name}`); }
    await page.close();
  };
  for (const id of (process.env.PLAYER_IDS ?? 'ba607b88,3d284ca3').split(',')) await open(`/players/${id}`, `player ${id}`, [['batting', 'button:has-text("Batting analysis")'], ['bowling', '#vsw button:text-is("Bowling")'], ['records', '#vsw button:text-is("Records")'], ['full stats', '#vsw button:text-is("Full stats")']]);
  for (const slug of (process.env.TEAM_SLUGS ?? 'india~intl~male,mumbai-indians~ipl~male').split(',')) await open(`/teams/${slug}`, `team ${slug}`, [['results', '.btns button:has-text("Results")'], ['players', '#vsw button:text-is("Players")'], ['bat bowl field', '#vsw button:text-is("Bat, bowl, field")']]);
  for (const key of (process.env.TOURNAMENTS ?? 'ipl,hnd').split(',')) await open(`/tournaments/${key}`, `tournament ${key}`, [['overview', '.btns button:has-text("Overview")'], ['players', '#vsw button:text-is("Players")'], ['teams', '#vsw button:text-is("Teams and matches")']]);
  for (const id of (process.env.FIT_IDS ?? '1490706,1544601').split(',')) await open(`/matches/${id}`, `match ${id}`, [['analysis', 'button:has-text("Match analysis")'], ['replay', '#vsw button:text-is("Replay")'], ['details', '#vsw button:text-is("Details")']]);
  for (const [label, path] of [['teams list', '/teams'], ['players list', '/players'], ['matches list', '/matches'], ['tournaments list', '/tournaments'], ['series list', '/series'], ['records', '/records'], ['records bowling', '/records?scope=odi-male&cat=bowling'], ['compare players', '/compare/players?a=ba607b88&b=30a45b23&view=overall&format=ODI'], ['compare players versus', '/compare/players?a=ba607b88&b=30a45b23&view=versus&format=ODI'], ['compare teams', '/compare/teams?a=india%7Cintl%7Cmale&b=australia%7Cintl%7Cmale&view=overall&format=ODI'], ['compare teams versus', '/compare/teams?a=india%7Cintl%7Cmale&b=australia%7Cintl%7Cmale&view=versus&format=ODI']]) await open(path, label);
  await browser.close();
  console.log(`${checked} pages and views checked`);
  if (bad.length) { console.log(`${bad.length} with rows showing while they should wait:`); bad.forEach((x) => console.log('  ' + x)); } else console.log('no row shows before its tile plays');
  process.exit(bad.length ? 1 : 0);
})();
