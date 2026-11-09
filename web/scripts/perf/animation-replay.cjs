// Nothing in the app plays an animation twice. A tile or a row must play once, when it is first seen, and not again when it slides in or
// when a class of an older rule starts something of its own. This records every CSS animation start in the page and every transform or opacity transition start, as a user walks through a page tile by tile
// and back, and reports each element that
//   1. started the same animation more than once without its data changing (a replay), or
//   2. started two different animations (a rule of one name starting before the rule meant for it).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/animation-replay.cjs [webkit] [match|player|team|tournament|other|all]     (default all: every page the app has)
// Every page must pass, the new ones as they are built and the old ones after any change to a shared file (`globals.css`, the carousel, the motion hooks): the home page, the match page in its views,
// the player page in its views, the search boxes and the not-found page. Add a new page to the list in `other` below when it is built.
// An element that React drops and draws again counts as a new element, so a long list scrolling is not a replay. Animations that loop on purpose (`infinite`) are left out.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const WHICH = process.argv.find((a) => ['match', 'player', 'team', 'tournament', 'compare', 'other', 'all'].includes(a)) ?? 'all';
const doMatch = WHICH === 'match' || WHICH === 'all', doPlayer = WHICH === 'player' || WHICH === 'all', doTeam = WHICH === 'team' || WHICH === 'all', doTour = WHICH === 'tournament' || WHICH === 'all', doCompare = WHICH === 'compare' || WHICH === 'all', doOther = WHICH === 'other' || WHICH === 'all';
const TEAMS = (process.env.TEAM_SLUGS ?? 'india~intl~male,mumbai-indians~ipl~male').split(',');
const MATCHES = (process.env.FIT_IDS ?? '1490706,1496584,1544601,1521264').split(',').map(Number);
const PLAYERS = (process.env.PLAYER_IDS ?? 'ba607b88,3d284ca3').split(',');

const INIT = () => {
  window.__anim = [];
  let counter = 0;
  const idOf = (el) => (el.__aid ??= ++counter);
  const describe = (el) => {
    const tile = el.closest && el.closest('[data-tile]');
    return `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${tile ? ' in ' + tile.dataset.tile : ''} "${(el.textContent || '').trim().slice(0, 18)}"`;
  };
  document.addEventListener('animationstart', (e) => {
    const cs = e.target.nodeType === 1 ? getComputedStyle(e.target) : null;
    if (cs && /infinite/.test(cs.animationIterationCount)) return;
    // The 3 second fallback that shows a table still held back (globals.css, rowsUnstick) changes nothing the visitor sees, so it is not counted.
    if (e.animationName === 'rowsUnstick') return;
    window.__anim.push({ id: idOf(e.target), kind: 'animation', name: e.animationName, declared: cs ? cs.animationName : '', what: describe(e.target), t: Math.round(performance.now()) });
  }, true);
  document.addEventListener('transitionstart', (e) => {
    if (!/^(transform|opacity)$/.test(e.propertyName)) return;
    // The carousel arrows answer the pointer (hover, press) and are not an entrance. The Home hero's result bar comes in once for each innings it replays, with new text each time.
    if (e.target.closest && e.target.closest('.arr, .hm-rs')) return;
    window.__anim.push({ id: idOf(e.target), kind: 'transition', name: e.propertyName, what: describe(e.target), t: Math.round(performance.now()) });
  }, true);
};

function summarise(events) {
  const byEl = new Map();
  for (const e of events) { if (!byEl.has(e.id)) byEl.set(e.id, []); byEl.get(e.id).push(e); }
  const found = [];
  for (const list of byEl.values()) {
    const anims = list.filter((e) => e.kind === 'animation');
    const names = [...new Set(anims.map((e) => e.name))];
    // one rule can declare several animations on purpose (the sliver tile of a slide: `peekIn, peekStayNext`), and each starts on its own delay. Only a name the element did not declare when the first started is a collision.
    const declared = new Set((anims[0]?.declared ?? '').split(',').map((x) => x.trim()));
    const stray = names.filter((n) => !declared.has(n));
    if (names.length > 1 && stray.length) found.push(`${list[0].what}: ${names.join(' then ')}`);
    else if (names.length === 1 && anims.length > 1) found.push(`${list[0].what}: ${anims[0].name} played ${anims.length} times`);
    const trans = list.filter((e) => e.kind === 'transition');
    const tn = {}; trans.forEach((e) => { tn[e.name] = (tn[e.name] ?? 0) + 1; });
    for (const [n, c] of Object.entries(tn)) if (c > 2) found.push(`${list[0].what}: ${n} transition ran ${c} times`);
  }
  return found;
}

async function walkTiles(page, label, bad) {
  // forward through the tiles with the arrow, then back to the start, as a user does
  const count = await page.evaluate(() => document.querySelectorAll('.car > .tile').length);
  for (let k = 1; k < count; k++) { const next = page.locator('.arr.r:visible').first(); if (!(await next.count())) break; await next.click().catch(() => undefined); await page.waitForTimeout(1300); }
  for (let k = 1; k < count; k++) { const prev = page.locator('.arr.l:visible').first(); if (!(await prev.count())) break; await prev.click().catch(() => undefined); await page.waitForTimeout(900); }
  const events = await page.evaluate(() => window.__anim);
  if (process.env.DBG) { const c = {}; events.forEach((e) => { c[`${e.kind}:${e.name}`] = (c[`${e.kind}:${e.name}`] ?? 0) + 1; }); console.log(label, events.length, 'starts', JSON.stringify(c)); }
  const found = summarise(events);
  found.slice(0, 8).forEach((f) => bad.push(`${label}: ${f}`));
}

if (process.argv.includes('--selftest')) {
  // proves the recorder sees a replay and a collision before it is trusted
  (async () => {
    const browser = await engine.launch(); const page = await browser.newPage(); await page.addInitScript(INIT);
    await page.goto('data:text/html,' + encodeURIComponent('<style>@keyframes a{from{opacity:0}to{opacity:1}}@keyframes b{from{opacity:0}to{opacity:1}}</style><div id=x>x</div><div id=y>y</div>'));
    await page.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const x = document.getElementById('x'), y = document.getElementById('y'); x.style.animation = 'a 0.1s both'; y.style.animation = 'a 0.1s both'; await w(250); x.style.animation = 'none'; await w(50); x.style.animation = 'a 0.1s both'; y.style.animation = 'b 0.1s both'; await w(300); });
    const found = summarise(await page.evaluate(() => window.__anim)); console.log(found.length === 2 ? 'self-test ok: ' + found.join(' | ') : 'self-test FAILED: ' + JSON.stringify(found));
    await browser.close(); process.exit(found.length === 2 ? 0 : 1);
  })();
} else (async () => {
  const browser = await engine.launch(); const bad = [];
  if (doMatch) {
    for (const id of MATCHES) {
      // The Replay plays for a few seconds: nothing in it may start an animation twice (the playhead is its motion, not a CSS animation).
      {
        const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
        await page.goto(`http://localhost:3100/matches/${id}?view=replay`); await page.waitForTimeout(3000);
        await page.evaluate(() => { window.__anim = []; const p = document.querySelector('.rpplay'); if (p) p.click(); }); await page.waitForTimeout(5000);
        const f = summarise(await page.evaluate(() => window.__anim)); f.slice(0, 6).forEach((x) => bad.push(`match ${id} replay playing: ${x}`));
        await page.close();
      }
      for (const view of ['details', 'analysis', 'summary']) {
        const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
        await page.goto(`http://localhost:3100/matches/${id}${view === 'details' ? '?view=details' : view === 'analysis' ? '?view=analysis' : ''}`); await page.waitForTimeout(2600);
        await walkTiles(page, `match ${id} ${view}`, bad);
        // the other views of the page, one after another, each judged on its own
        if (view === 'summary') for (const name of ['Match analysis', 'Replay', 'Details', 'Summary']) {
          const button = page.locator('button:visible', { hasText: new RegExp(`^${name}$`) }).first();
          if (!(await button.count())) continue;
          await page.evaluate(() => { window.__anim = []; }); await button.click().catch(() => undefined); await page.waitForTimeout(2200);
          const f = summarise(await page.evaluate(() => window.__anim)); f.slice(0, 6).forEach((x) => bad.push(`match ${id} ${name}: ${x}`));
        }
        await page.close();
      }
    }
  }
  if (doPlayer) {
    for (const id of PLAYERS) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await page.addInitScript(INIT);
      await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
      let first = true;
      for (const [label, name] of [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']]) {
        const button = first ? page.getByRole('button', { name: name === 'Full stats' ? 'Full stats' : `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
        if (!(await button.isEnabled().catch(() => false))) continue;
        await page.evaluate(() => { window.__anim = []; });
        await button.click(); first = false; await page.waitForTimeout(2800);
        await walkTiles(page, `player ${id} ${label}`, bad);
      }
      await page.close();
    }
  }
  if (doTeam) {
    for (const slug of TEAMS) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
      await page.goto(`http://localhost:3100/teams/${slug}`); await page.waitForSelector('.sum .phead', { timeout: 30000 }); await page.waitForTimeout(2500);
      let first = true;
      for (const [label, name, long] of [['results', 'Results', 'Results'], ['players', 'Players', 'Players'], ['batbowl', 'Bat, bowl, field', 'Batting, bowling and fielding'], ['results again', 'Results', 'Results']]) {
        const button = first ? page.locator('.btns button', { hasText: long }).first() : page.locator(`#vsw button:text-is("${name}")`).first();
        if (!(await button.isEnabled().catch(() => false))) continue;
        await page.evaluate(() => { window.__anim = []; });
        await button.click(); first = false; await page.waitForTimeout(2800);
        await walkTiles(page, `team ${slug} ${label}`, bad);
        // the leaders chips on the Players view: each group plays once, and going back to one shows it at once
        if (label === 'players') {
          await page.evaluate(() => { window.__anim = []; });
          for (const g of ['Bowling', 'Fielding and awards', 'Batting', 'Bowling']) { const chip = page.locator(`.msw button:text-is("${g}")`).first(); if (await chip.count()) { await page.evaluate(() => document.querySelector('#p-ply [data-tile="top"]')?.scrollIntoView?.()); await chip.click().catch(() => undefined); await page.waitForTimeout(900); } }
          const f = summarise(await page.evaluate(() => window.__anim)); f.slice(0, 6).forEach((x) => bad.push(`team ${slug} leaders chips: ${x}`));
        }
      }
      await page.close();
    }
  }
  if (doTour) {
    for (const key of (process.env.TOURNAMENTS ?? 'ipl,hnd').split(',')) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
      await page.goto(`http://localhost:3100/tournaments/${key}`); await page.waitForSelector('.sum .phead', { timeout: 30000 }); await page.waitForTimeout(2500);
      let first = true;
      for (const [label, name, long] of [['overview', 'Overview', 'Overview'], ['players', 'Players', 'Players'], ['teams', 'Teams and matches', 'Teams and matches'], ['overview again', 'Overview', 'Overview']]) {
        const button = first ? page.locator('.btns button', { hasText: long }).first() : page.locator(`#vsw button:text-is("${name}")`).first();
        await page.evaluate(() => { window.__anim = []; });
        await button.click(); first = false; await page.waitForTimeout(2800);
        await walkTiles(page, `tournament ${key} ${label}`, bad);
      }
      // The Edition filter changes which tiles the Overview has (one edition or all), and the new ones play once.
      await page.locator('#vsw button:text-is("Overview")').first().click(); await page.waitForTimeout(1500);
      for (const [label, index] of [['all editions', 0], ['one edition again', 1]]) {
        await page.evaluate(() => { window.__anim = []; });
        await page.selectOption('.top .filters select >> nth=-1', { index }).catch(() => undefined); await page.waitForTimeout(2800);
        await walkTiles(page, `tournament ${key} ${label}`, bad);
      }
      await page.close();
    }
  }
  if (doCompare) {
    // Compare players and Compare teams: Overall and Versus, the tiles walked forward and back, a switch between the two views, the way back to the pick screen and into a view again.
    const PAIRS = [['players', 'a=ba607b88&b=30a45b23&format=ODI'], ['teams', 'a=india%7Cintl%7Cmale&b=australia%7Cintl%7Cmale&format=ODI']];
    for (const [kind, query] of PAIRS) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
      await page.goto(`http://localhost:3100/compare/${kind}?${query}&view=overall`); await page.waitForSelector('.cs.on .car > .tile', { timeout: 40000 }); await page.waitForTimeout(3000);
      await walkTiles(page, `compare ${kind} overall`, bad);
      for (const [label, act] of [['to Versus', () => page.locator('.cs.on #vsw button', { hasText: 'Versus' }).first().click()], ['back to Overall', () => page.locator('.cs.on #vsw button', { hasText: 'Overall' }).first().click()], ['to the pick screen', () => page.locator('.cs.on .top button', { hasText: /^Change (teams|players)/ }).click()], ['into Overall again', () => page.locator('.cs.on .btns2 button').first().click()]]) {
        await page.evaluate(() => { window.__anim = []; }); await act().catch(() => undefined); await page.waitForTimeout(2600);
        summarise(await page.evaluate(() => window.__anim)).slice(0, 6).forEach((x) => bad.push(`compare ${kind} ${label}: ${x}`));
      }
      await page.evaluate(() => { window.__anim = []; }); await page.locator('.cs.on #vsw button', { hasText: 'Versus' }).first().click().catch(() => undefined); await page.waitForTimeout(2000);
      await walkTiles(page, `compare ${kind} versus`, bad);
      await page.close();
    }
  }
  if (doOther) {
    const PAGES = [['home', '/'], ['not found, match', '/matches/0'], ['not found, player', '/players/nobody'], ['not found', '/nothing-here'], ['teams list', '/teams'], ['players list', '/players'], ['matches list', '/matches'], ['tournaments list', '/tournaments'], ['records', '/records'], ['records team lists', '/records?scope=odi-male&cat=team'], ['api', '/api'], ['series list', '/series']];
    for (const [label, path] of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 700 } }); await page.addInitScript(INIT);
      await page.goto(`http://localhost:3100${path}`); await page.waitForTimeout(3800);
      await walkTiles(page, label, bad);
      // the search box of the page: open it, type, and clear it
      const box = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Find"]').first();
      if (await box.count()) {
        await page.evaluate(() => { window.__anim = []; });
        await box.click().catch(() => undefined); await page.waitForTimeout(900);
        await box.fill('kohli').catch(() => undefined); await page.waitForTimeout(1600);
        await box.fill('india').catch(() => undefined); await page.waitForTimeout(1600);
        summarise(await page.evaluate(() => window.__anim)).slice(0, 6).forEach((x) => bad.push(`${label} search: ${x}`));
      }
      await page.close();
    }
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} replays:`); bad.forEach((x) => console.log('  ' + x.slice(0, 230))); } else console.log('no animation played twice');
  process.exit(bad.length ? 1 : 0);
})();
