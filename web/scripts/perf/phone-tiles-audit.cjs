// The phone checklist for every tile of a Player analysis view. It opens each tile on a phone-sized window at three heights and reports what breaks a rule of the phone round:
//   past      something sticks out of the tile's right or bottom edge (a table frame and a chart's own drawing are exempt)
//   scrolls   something scrolls that is not a table frame or a list (a tile that does not scroll on desktop never scrolls on the phone)
//   empty     the content ends well above the bottom of the tile and nothing in the tile is a scrolling table
//   font      a select or text field below 16px (iOS zooms the page into it)
//   canvas    a canvas whose touch-action does not let a sideways swipe move the row
//   chips     any switch in a tile with pills under 28px high or sticking out of the tile
//   switch    a tile switch (Share / Strike rate, the sorts) that does not span the tile under the title
//   overlap   two overlays on a 3D stage that cover each other (a legend and a note)
//   pinned    a table that scrolls sideways without its first column or header pinned
// With --sheets it also saves a screenshot of every tile state (at the middle height) and lays them out in contact sheets in /tmp/phone-sheets, because the numbers cannot say whether a tile looks right (Ari, 2026-10-26): every sheet is looked at.
// Run with the dev server and the data server up:  PLAYWRIGHT_CORE=<path> node scripts/perf/phone-tiles-audit.cjs [bat|bowl|rec|stats] [url base]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const VIEWS = { bat: ['#p-bat', 'batting'], bowl: ['#p-bowl', 'bowling'], rec: ['#p-rec', 'records'], stats: ['#p-stats', 'stats'] };
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHEETS = process.argv.includes('--sheets');
const VIEW = VIEWS[ARGS[0]] ? ARGS[0] : 'bat';
const BASE = ARGS[1] ?? 'http://localhost:3100';
const [PANE, PARAM] = VIEWS[VIEW];
const PAGE = `${BASE}/players/ba607b88?view=${PARAM}`;
const HEIGHTS = SHEETS ? [797] : [667, 797, 956];
const shots = [];
const fs = require('fs');

/** Runs in the page: the checks for the tile on screen. */
const CHECK = ({ pane }) => {
  const tiles = [...document.querySelectorAll(`${pane} [data-tile]`)];
  const cur = tiles.find((x) => { const b = x.getBoundingClientRect(); return b.left >= -5 && b.left < 60 && b.width > 300; });
  if (!cur) return { none: true };
  const tb = cur.getBoundingClientRect();
  const label = document.querySelector(`${pane} .rh span`)?.textContent ?? '';
  const issues = [];
  const all = [...cur.querySelectorAll('*')];
  const visible = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };

  // past
  const past = all.filter((e) => {
    if (!visible(e) || e.closest('.tsc, [class*="__side"], .tbrows, .bpc, .ptr, .skg, .trg, .mrl, .tw') || e.closest('svg') || e.closest('.charttip')) return false;
    const b = e.getBoundingClientRect();
    return b.right > tb.right + 1 || b.bottom > tb.bottom + 1;
  });
  if (past.length) issues.push(['past', past.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)}`).join(' ')]);

  // scrolls
  // The frames that may scroll: table frames, the long lists (best performances, partnerships, streaks, trophies, the bowling opponents) and the pitch map's table side.
  const allowed = (e) => ['tsc', 'tbrows', 'bpc', 'ptr', 'skg', 'trg', 'mrl', 'tw'].some((k) => e.classList.contains(k)) || /__side/.test(String(e.className));
  const scrolls = all.filter((e) => { const s = getComputedStyle(e); return !allowed(e) && ((/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2) || (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2)); });
  if (scrolls.length) issues.push(['scrolls', scrolls.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)} ${e.scrollWidth}x${e.scrollHeight}/${e.clientWidth}x${e.clientHeight}`).join(' ')]);

  // empty
  const hasFrame = !!cur.querySelector('.tsc, .tbrows, .bpc, .ptr, .skg, .trg, .mrl, .tw');
  let low = 0;
  for (const e of all) { if (visible(e) && e.children.length === 0 && !e.closest('.charttip')) { const b = e.getBoundingClientRect(); if (b.bottom <= tb.bottom + 2) low = Math.max(low, b.bottom); } }
  const art = cur.querySelector('.art, canvas, .charts');
  const artBottom = art ? art.getBoundingClientRect().bottom : 0;
  const fill = Math.max(low, artBottom);
  // Content that is centred in its tile (a stack of bars with a legend) leaves the same space above and below, which is fine; content that hugs the top and stops short is the problem.
  let first = Infinity;
  for (const e of all) { if (visible(e) && e.children.length === 0 && !e.closest('h4') && !e.closest('.charttip')) first = Math.min(first, e.getBoundingClientRect().top); }
  const topGap = Math.max(0, first - (tb.top + 40)), bottomGap = Math.max(0, tb.bottom - 14 - fill);
  if (!hasFrame && bottomGap / tb.height > 0.1 && topGap < bottomGap * 0.6) issues.push(['empty', `content ends ${Math.round(bottomGap)} px above the bottom, ${Math.round(topGap)} px under the title`]);

  // font
  const small = [...cur.querySelectorAll('select, input[type=text], input[type=search], input:not([type])')].filter((e) => visible(e) && parseFloat(getComputedStyle(e).fontSize) < 16);
  if (small.length) issues.push(['font', small.map((e) => `${e.tagName.toLowerCase()} ${getComputedStyle(e).fontSize}`).slice(0, 4).join(', ')]);

  // canvas
  const bad = [...cur.querySelectorAll('canvas')].filter((c) => !/pan-x/.test(getComputedStyle(c).touchAction) && getComputedStyle(c).touchAction !== 'auto' && getComputedStyle(c).touchAction !== 'manipulation');
  if (bad.length) issues.push(['canvas', bad.map((c) => `touch-action ${getComputedStyle(c).touchAction}`).join(', ')]);

  // chips: every switch in the tile has pills a finger can hit and stays inside the tile
  for (const sw of cur.querySelectorAll('.sw')) {
    if (!visible(sw)) continue;
    const s = sw.getBoundingClientRect();
    if (s.right > tb.right + 1 || [...sw.children].some((b) => b.getBoundingClientRect().height < 28)) issues.push(['chips', `${String(sw.className)} ${Math.round(s.width)}x${Math.round(s.height)}`]);
  }
  // switch
  const h4 = cur.querySelector('h4');
  for (const sw of cur.querySelectorAll('h4 .sw')) {
    const s = sw.getBoundingClientRect(), h = h4.getBoundingClientRect();
    if (Math.abs(s.left - h.left) > 1 || s.width < h.width - 2 || [...sw.children].some((b) => b.getBoundingClientRect().height < 30)) issues.push(['switch', `left ${Math.round(s.left - h.left)}, width ${Math.round(s.width)} of ${Math.round(h.width)}`]);
  }

  // overlap
  const stage = cur.querySelector('canvas')?.parentElement;
  if (stage) {
    const over = [...stage.querySelectorAll('*')].filter((e) => getComputedStyle(e).position === 'absolute' && e.tagName !== 'CANVAS' && visible(e) && !e.closest('.charttip'));
    const tops = over.filter((e) => !over.some((o) => o !== e && o.contains(e)));
    for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
      const a = tops[i].getBoundingClientRect(), b = tops[j].getBoundingClientRect();
      if (!(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)) issues.push(['overlap', `${String(tops[i].className).slice(-18)} / ${String(tops[j].className).slice(-18)}`]);
    }
  }

  // pinned
  for (const f of cur.querySelectorAll('.tsc, .tw')) {
    if (f.scrollWidth > f.clientWidth + 1) {
      const th = f.querySelector('thead th'), td = f.querySelector('tbody td');
      if (!th || !td || getComputedStyle(th).position !== 'sticky' || getComputedStyle(td).position !== 'sticky') issues.push(['pinned', 'a table scrolls sideways without its header and first column pinned']);
    }
  }
  return { label, id: cur.getAttribute('data-tile'), issues };
};

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const h of HEIGHTS) {
    const page = await browser.newPage({ viewport: { width: 440, height: h } });
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const count = await page.locator(`${PANE} .nd`).count();
    for (let i = 0; i < count; i++) {
      await page.evaluate(([pane, i]) => document.querySelectorAll(`${pane} .nd`)[i].click(), [PANE, i]);
      await page.waitForTimeout(i === 0 ? 800 : 1700);
      const r = await page.evaluate(CHECK, { pane: PANE });
      report.push({ height: h, index: i, ...r });
      if (SHEETS) shots.push({ label: r.label ?? `tile ${i}`, buf: await page.screenshot({ clip: { x: 0, y: 100, width: 440, height: 660 } }) });
      // Every state of the tile's switches is a state of the tile (Batter control has In control and False shots, Dismissals has Balls and Runs): each is opened and checked in turn.
      const labels = await page.evaluate(([pane]) => {
        const cur = [...document.querySelectorAll(`${pane} [data-tile]`)].find((x) => { const b = x.getBoundingClientRect(); return b.left >= -5 && b.left < 60 && b.width > 300; });
        return cur ? [...cur.querySelectorAll('.sw')].map((sw) => [...sw.children].map((b) => b.textContent.trim())) : [];
      }, [PANE]);
      for (let s = 0; s < labels.length; s++) {
        for (let b = 0; b < labels[s].length; b++) {
          const clicked = await page.evaluate(([pane, s, b]) => {
            const cur = [...document.querySelectorAll(`${pane} [data-tile]`)].find((x) => { const bb = x.getBoundingClientRect(); return bb.left >= -5 && bb.left < 60 && bb.width > 300; });
            const btn = cur?.querySelectorAll('.sw')[s]?.children[b];
            if (!btn || btn.classList.contains('on') || btn.getAttribute('aria-pressed') === 'true') return false;
            btn.click(); return true;
          }, [PANE, s, b]);
          if (!clicked) continue;
          await page.waitForTimeout(1500);
          const rs = await page.evaluate(CHECK, { pane: PANE });
          if (!rs.none) report.push({ height: h, index: i, ...rs, label: `${rs.label} [${labels[s][b]}]` });
          if (SHEETS) shots.push({ label: `${rs.label ?? ''} [${labels[s][b]}]`, buf: await page.screenshot({ clip: { x: 0, y: 100, width: 440, height: 660 } }) });
        }
      }
    }
    await page.close();
  }
  if (SHEETS) {
    // Six screenshots to a sheet, three across, each with its name above it.
    fs.mkdirSync('/tmp/phone-sheets', { recursive: true });
    for (const f of fs.readdirSync('/tmp/phone-sheets')) if (f.startsWith(`${VIEW}-`)) fs.unlinkSync(`/tmp/phone-sheets/${f}`);
    const sheetBrowser = browser;
    for (let n = 0; n * 6 < shots.length; n++) {
      const group = shots.slice(n * 6, n * 6 + 6);
      const page = await sheetBrowser.newPage({ viewport: { width: 1360, height: 1400 } });
      const cells = group.map((g) => `<figure><figcaption>${String(g.label).replace(/</g, '&lt;')}</figcaption><img src="data:image/png;base64,${g.buf.toString('base64')}" width="440"></figure>`).join('');
      await page.setContent(`<body style="margin:0;background:#000;color:#fff;font:600 15px sans-serif"><div style="display:grid;grid-template-columns:repeat(3,440px);gap:16px 20px;padding:10px">${cells}</div></body>`);
      await page.waitForTimeout(300);
      fs.writeFileSync(`/tmp/phone-sheets/${VIEW}-${n + 1}.png`, await page.screenshot({ fullPage: true }));
      await page.close();
    }
    console.log(`${shots.length} screenshots in ${Math.ceil(shots.length / 6)} sheets in /tmp/phone-sheets (${VIEW}-N.png)`);
  }
  await browser.close();
  let bad = 0;
  const seen = new Set();
  for (const r of report) {
    if (r.none) { console.log(`${r.height} #${r.index}: no tile on screen`); bad += 1; continue; }
    for (const [kind, detail] of r.issues) {
      const key = `${r.id}|${kind}|${detail}|${r.height}`;
      if (seen.has(key)) continue;
      seen.add(key); bad += 1;
      console.log(`${r.height} ${r.id} (${r.label}): ${kind}: ${detail}`);
    }
  }
  console.log(`${VIEW}: ${report.length} tile stops checked, ${bad} problems`);
  process.exit(bad ? 1 : 0);
})();
