// A scroll bar shows only where it is needed, and from the first frame (Ari, 2026-10-22 and 2026-10-24). This opens every page and view and samples every scroll area from the start of the page for a few
// seconds, at the window sizes Ari uses, and reports
//   1. a bar for a few pixels of overflow (6 or less: padding or a border), which must never show, and
//   2. a bar that showed and went, or came after the first frame, which flashes.
// The one allowed bar is the one a long list needs from the start. Real content past the end (the Key numbers tile in a short window) has a bar and is not reported.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/scrollbars.cjs [webkit]          (the app on port 3100, the data server on 8788)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const TINY = 6;
const SIZES = [[1352, 600], [1352, 660], [1352, 700], [1440, 900]];
const PAGES = [
  '/', '/?tile=explore', '/?tile=leaders', '/?tile=day%7Er', '/?tile=built', '/players', '/teams', '/matches', '/tournaments', '/series', '/records', '/api',
  '/players/v-kohli-ba607b88?view=batting', '/players/v-kohli-ba607b88?view=bowling', '/players/v-kohli-ba607b88?view=records', '/players/v-kohli-ba607b88?view=stats',
  '/teams/india~intl~male?view=results', '/teams/india~intl~male?view=players', '/teams/india~intl~male?view=bbf',
  '/matches/1298150', '/matches/1298150?view=analysis', '/matches/1298150?view=details', '/matches/1298150?view=replay',
  '/compare', '/compare/players?a=ba607b88&b=462411b3', '/compare/teams?a=india%7Cintl%7Cmale&b=australia%7Cintl%7Cmale',
];

// Installed before the page runs, so the first frame is seen. It follows every area that scrolls up and down.
const SAMPLER = (tiny) => {
  const label = (el) => { const p = []; let e = el; for (let i = 0; i < 3 && e && e !== document.body; i++) { p.unshift(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); e = e.parentElement; } return p.join(' > '); };
  const scroller = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const state = new Map(); const flips = {}; const t0 = performance.now();
  // The bar along the bottom is held to the same rule as the one at the side (Ari, 2026-10-25: a sideways bar showed on the player profile for a moment, and the table jittered while it was hidden).
  const sidewaysOn = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);
  const stateX = new Map();
  window.__sb = { flips, tinyNow: () => [...state.keys()].filter((el) => el.isConnected && scroller(el) && el.scrollHeight - el.clientHeight >= 1 && el.scrollHeight - el.clientHeight <= tiny).map((el) => [label(el), el.scrollHeight - el.clientHeight])
    .concat([...stateX.keys()].filter((el) => el.isConnected && sidewaysOn(el) && el.scrollWidth - el.clientWidth >= 1 && el.scrollWidth - el.clientWidth <= tiny).map((el) => [label(el) + ' (sideways)', el.scrollWidth - el.clientWidth])) };
  const tick = () => {
    const now = Math.round(performance.now() - t0);
    for (const el of document.querySelectorAll('*')) {
      if (sidewaysOn(el)) {
        const curX = getComputedStyle(el).overflowX === 'scroll' || el.scrollWidth > el.clientWidth + 1 ? 'x' : 'none'; const prevX = stateX.get(el);
        if (prevX !== undefined && prevX !== curX) flips[label(el) + ' (sideways)'] = (flips[label(el) + ' (sideways)'] ?? []).concat([[now, curX]]);
        stateX.set(el, curX);
      } else if (stateX.has(el) && stateX.get(el) !== 'none') { flips[label(el) + ' (sideways)'] = (flips[label(el) + ' (sideways)'] ?? []).concat([[now, 'none']]); stateX.set(el, 'none'); }
      if (!scroller(el)) { if (state.has(el) && state.get(el) !== 'none') { flips[label(el)] = (flips[label(el)] ?? []).concat([[now, 'none']]); state.set(el, 'none'); } continue; }
      // `overflow-y: scroll` draws the bar's track from the first frame, which is what a loading table is given on purpose (ScrollGuard), so it counts as a bar.
      const cur = getComputedStyle(el).overflowY === 'scroll' || el.scrollHeight > el.clientHeight + 1 ? 'y' : 'none'; const prev = state.get(el);
      if (prev !== undefined && prev !== cur) flips[label(el)] = (flips[label(el)] ?? []).concat([[now, cur]]);
      state.set(el, cur);
    }
    if (now < 3200) setTimeout(tick, 40);
  };
  document.addEventListener('DOMContentLoaded', tick);
};

if (process.argv.includes('--selftest')) {
  // proves the detector reports a bar for 4 px of overflow and for a bar that comes late, and passes a bar that real content needs, before the script is trusted
  (async () => {
    const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.addInitScript(SAMPLER, TINY);
    await page.goto('data:text/html,' + encodeURIComponent('<div id="a" style="height:100px;overflow:auto"><div style="height:104px"></div></div><div id="b" style="height:100px;overflow:auto"><div style="height:300px"></div></div><div id="c" style="height:100px;overflow:auto"><div id="cc" style="height:50px"></div></div><div id="d" style="width:100px;height:50px;overflow-x:auto;overflow-y:hidden"><div style="width:104px;height:20px"></div></div><script>setTimeout(()=>{document.getElementById("cc").style.height="200px"},700)</script>'));
    await page.waitForTimeout(3400);
    const r = await page.evaluate(() => ({ flips: window.__sb.flips, tiny: window.__sb.tinyNow() }));
    await browser.close();
    const ok = r.tiny.length === 2 && r.tiny.some((t) => t[1] === 4 && !/sideways/.test(t[0])) && r.tiny.some((t) => t[1] === 4 && /sideways/.test(t[0])) && Object.keys(r.flips).length === 1;
    console.log(ok ? 'self-test ok: ' + JSON.stringify(r) : 'self-test FAILED: ' + JSON.stringify(r)); process.exit(ok ? 0 : 1);
  })();
} else (async () => {
  const browser = await engine.launch(); const bad = []; let checked = 0;
  for (const [w, h] of SIZES) {
    for (const url of PAGES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.addInitScript(SAMPLER, TINY);
      await page.goto(`http://localhost:3100${url}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3400);
      const r = await page.evaluate(() => ({ flips: window.__sb?.flips ?? {}, tiny: window.__sb?.tinyNow() ?? [] }));
      checked += 1;
      for (const [k, v] of r.tiny) bad.push(`${w}x${h} ${url}: a bar for ${v}px of overflow in ${k}`);
      for (const [k, v] of Object.entries(r.flips)) bad.push(`${w}x${h} ${url}: a bar that flashes in ${k} ${JSON.stringify(v)}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(`${checked} pages and sizes checked`);
  if (bad.length) { console.log(`${bad.length} problems:`); bad.forEach((x) => console.log('  ' + x)); process.exit(1); } else console.log('no bar for a few pixels, none that flashes');
})();
