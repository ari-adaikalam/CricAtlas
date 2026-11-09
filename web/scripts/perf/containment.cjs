// Containment: nothing sits outside the panel, tile or window that holds it, at the window sizes a laptop has.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/containment.cjs [webkit] [match|player]   (PLAYER_IDS, FIT_IDS and SIZES choose what to open)
// For each page state and each window size it finds two kinds of fault:
//   1. an element (text, chart text, bar, chip) whose box passes the edge of the panel it is in (.pan2, .mip, a Fall of wickets panel, the Ball by ball list, a tile) by more than 1 px,
//      unless something between them scrolls or clips it on purpose (overflow other than visible) or it is drawn into the page body (a tooltip);
//   2. the page itself scrolling sideways.
// Sizes: 1440x900, 1352x659 (Ari's Safari window), 1280x560, 1100x640. The phone layout is its own round and is not checked here.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const WHICH = process.argv[3] ?? 'match';
const SIZES = (process.env.SIZES ?? '1440x900,1352x659,1280x560,1100x640').split(',').map((s) => s.split('x').map(Number));
const MATCHES = (process.env.FIT_IDS ?? '1490706,1496584,1521264,1544601,1544002,1216517,1426629,1322277,1483765').split(',').map(Number);
const PARTS = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding', 'reviews', 'ball'];

// Runs in the page. Returns the faults found in what is on screen now.
function inspect(wantTile) {
  const CONTAINERS = '.pan2, .mip, .fwrow > div, .bbp, .tile';
  const faults = [];
  const clips = (el) => { const o = getComputedStyle(el); return o.overflowX !== 'visible' || o.overflowY !== 'visible'; };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(el.textContent || '').trim().slice(0, 28)}"`;
  const scope = wantTile ? document.querySelector(`[data-tile="${wantTile}"]`) : document.querySelector('.sum, .pane.on, main') ?? document.body;
  if (!scope) return { faults: ['no scope'], sideways: false };
  const boxes = [...scope.querySelectorAll(CONTAINERS)];
  if (scope.matches(CONTAINERS)) boxes.unshift(scope);
  for (const box of boxes) {
    const r = box.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const isTile = box.classList.contains('tile');
    for (const el of box.querySelectorAll('*')) {
      if (el.closest(CONTAINERS) !== box && !(el.closest('.tile') === box && !el.closest('.pan2, .mip, .fwrow > div, .bbp'))) continue;
      if (!(el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || el.tagName === 'svg' || el.tagName === 'rect' || el.tagName === 'text' || el.tagName === 'i')) continue;
      // something between the element and its box scrolls or clips it on purpose
      let hidden = false;
      for (let p = el.parentElement; p && p !== box; p = p.parentElement) if (clips(p)) { hidden = true; break; }
      if (hidden) continue;
      const e = el.getBoundingClientRect();
      if (e.width === 0 || e.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const side = isTile ? { l: -1e9, r: 1e9 } : { l: r.left - 1, r: r.right + 1 };
      if (e.left < side.l || e.right > side.r || e.bottom > r.bottom + 1 || e.top < r.top - 1) faults.push(`${describe(el)} passes its ${box.className.split(' ')[0] || box.tagName.toLowerCase()} (${Math.round(Math.max(side.l - e.left, e.right - side.r, e.bottom - r.bottom, r.top - e.top))} px)`);
    }
  }
  return { faults: [...new Set(faults)].slice(0, 6), sideways: document.documentElement.scrollWidth > window.innerWidth + 1 };
}

(async () => {
  const browser = await engine.launch(); const bad = [];
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 120)));
    if (WHICH === 'match') {
      for (const id of MATCHES) {
        const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
        await page.goto(`http://localhost:3100/matches/${id}`); await page.waitForSelector('.sum', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(1800);
        let r = await page.evaluate(inspect, null);
        if (r.faults.length || r.sideways) bad.push(`${w}x${h} #${id} ${b.match.kind} summary: ${r.sideways ? 'sideways scroll; ' : ''}${r.faults.join('; ')}`);
        const parts = b.match.kind === 'test' && b.innings.length > 2 ? PARTS : PARTS;
        for (const part of parts) {
          await page.goto(`http://localhost:3100/matches/${id}?view=details&tile=${part}`); await page.waitForSelector('.tile.dp', { timeout: 20000 }).catch(() => undefined);
          if ((await page.locator(`[data-tile="${part}"]`).count()) === 0) continue;
          await page.waitForTimeout(part === 'ball' ? 2200 : 1700);
          r = await page.evaluate(inspect, part);
          if (r.faults.length || r.sideways) bad.push(`${w}x${h} #${id} ${b.match.kind} ${part}: ${r.sideways ? 'sideways scroll; ' : ''}${r.faults.join('; ')}`);
        }
      }
    }
    if (WHICH === 'analysis') {
      for (const id of MATCHES) {
        const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
        await page.goto(`http://localhost:3100/matches/${id}?view=analysis`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(2200);
        const tileIds = await page.evaluate(() => [...document.querySelectorAll('#p-ana .car > .tile')].map((t) => t.dataset.tile));
        for (const tile of tileIds) {
          await page.goto(`http://localhost:3100/matches/${id}?view=analysis&tile=${tile}`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(2600);
          const r = await page.evaluate(inspect, tile);
          if (r.faults.length || r.sideways) bad.push(`${w}x${h} #${id} ${b.match.kind} analysis ${tile}: ${r.sideways ? 'sideways scroll; ' : ''}${r.faults.join('; ')}`);
        }
      }
    }
    if (WHICH === 'player') {
      const PLAYERS = (process.env.PLAYER_IDS ?? 'ba607b88,52d1dbc8,3d284ca3,02b87bde').split(',');
      const VIEWS = process.env.ONLY_BOWL ? [['bowl', 'Bowling']] : [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']];
      for (const id of PLAYERS) {
        await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
        let first = true;
        for (const [label, name] of VIEWS) {
          const button = first ? page.getByRole('button', { name: name === 'Full stats' ? 'Full stats' : `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
          if (!(await button.isEnabled().catch(() => false))) continue;
          await button.click(); first = false; await page.waitForTimeout(2800);
          const pane = `#p-${label}`;
          const ids = await page.evaluate((pane) => [...document.querySelectorAll(`${pane} .car > .tile`)].map((t) => t.dataset.tile), pane);
          for (let t = 0; t < ids.length; t++) {
            await page.evaluate(([pane, t]) => { const car = document.querySelector(`${pane} .car`); car.style.scrollBehavior = 'auto'; car.scrollLeft = [...car.children][t].offsetLeft - 60; }, [pane, t]);
            await page.waitForTimeout(label === 'stats' ? 800 : 600);
            const r = await page.evaluate(inspect, ids[t]);
            if (r.faults.length || r.sideways) bad.push(`${w}x${h} player ${id} ${label} ${ids[t]}: ${r.sideways ? 'sideways scroll; ' : ''}${r.faults.join('; ')}`);
          }
        }
      }
    }
    if (logs.length) bad.push(`${w}x${h} errors: ${logs[0]}`);
    console.log(`${w}x${h}: ${bad.filter((x) => x.startsWith(`${w}x${h}`)).length} faults`);
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`\n${bad.length} faults:`); bad.forEach((x) => console.log('  ' + x.slice(0, 260))); } else console.log('\nnothing outside its box');
  process.exit(bad.length ? 1 : 0);
})();
