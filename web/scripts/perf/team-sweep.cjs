// Every tile of every view of several kinds of team, at two window sizes: console errors, text that should not be on a page (NaN, undefined), content that passes the edge of its tile, and tiles that leave a
// large part of their height empty (the fit rule). Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/team-sweep.cjs [webkit] [team slug ...]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const args = process.argv.slice(2);
const engine = args[0] === 'webkit' ? webkit : chromium;
const slugs = args.filter((a) => a !== 'webkit');
const TEAMS = slugs.length ? slugs : ['india~intl~male', 'india~intl~female', 'mumbai-indians~ipl~male', 'manchester-originals~hnd~male', 'iran~intl~male', 'chile~intl~male', 'malaysia~intl~male', 'rangpur-riders~bpl~male', 'delhi-capitals~wpl~female', 'china~intl~male'];
const SIZES = [[1352, 700], [1180, 620]];
const VIEWS = [['res', 'Results'], ['ply', 'Players'], ['bbf', 'Bat, bowl, field']];
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;

function measure(view, id) {
  const tile = document.querySelector(`#p-${view} .car > .tile[data-tile="${id}"]`);
  if (!tile) return { missing: true };
  const r = tile.getBoundingClientRect(), cs = getComputedStyle(tile);
  const top = r.top + parseFloat(cs.paddingTop) + 30, bottom = r.bottom - parseFloat(cs.paddingBottom);
  const inner = bottom - top;
  const scrolls = (el) => { for (let e = el; e && e !== tile; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2) return true; } return false; };
  const pieces = [...tile.querySelectorAll('.kn, .bcr, .tpr, .phc, .kc, .trr, .msr, .mrow, tr, svg, .fstrip, .hbr, .psc, .psr, .tpk, .slnote, .onote, .thin, h5, .ptw, .pti, .bpr, .stk, .tkh, .phrow')].filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('[data-spacer]'));
  let contentBottom = top, overflow = 0, bottomEl = '';
  for (const e of pieces) {
    const b = e.getBoundingClientRect();
    if (b.bottom > contentBottom) { contentBottom = b.bottom; bottomEl = e.className.toString().slice(0, 20) || e.tagName; }
    if (b.bottom > r.bottom + 2 && !scrolls(e)) overflow = Math.max(overflow, Math.round(b.bottom - r.bottom));
  }
  const textOverflowX = [...tile.querySelectorAll('td, th, span, b, h5')].some((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > r.right + 2 && !scrolls(e) && !e.closest('.tsc, .ugrid, .mtl, .tw, .kos, .trg'); });
  const hasScroll = [...tile.querySelectorAll('.tsc, .tw, .ugrid, .mtl, .kos, .trg')].some((e) => e.scrollHeight > e.clientHeight + 2);
  return { free: Math.max(0, Math.round(((bottom - contentBottom) / inner) * 100)), overflow, textOverflowX, hasScroll, bottomEl, thin: !!tile.querySelector('.thin') };
}

(async () => {
  const browser = await engine.launch();
  const issues = [];
  let tiles = 0;
  for (const slug of TEAMS) {
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const logs = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message|DevTools/.test(m.text())) logs.push(m.text().slice(0, 160)); });
      page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
      try {
        await page.goto(`http://localhost:3100/teams/${slug}`); await page.waitForSelector('.sum .phead', { timeout: 30000 }); await page.waitForTimeout(1200);
        for (const [v, label] of VIEWS) {
          const btn = label === 'Bat, bowl, field' ? 'Batting, bowling and fielding' : label;
          if (v === 'res') await page.click(`.btns button:has-text("${btn}")`); else await page.click(`#vsw button:has-text("${label}")`);
          await page.waitForTimeout(1500);
          const slice = await page.evaluate(() => { const m = /([\d,]+) match/.exec([...document.querySelectorAll('.bfn')].map((e) => e.innerText).join(' ')); return m ? Number(m[1].replace(/,/g, '')) : 99; });
          const ids = await page.evaluate((view) => [...document.querySelectorAll(`#p-${view} .car > .tile`)].map((t) => t.dataset.tile), v);
          for (let i = 0; i < ids.length; i++) {
            await page.evaluate(([view, k]) => document.querySelectorAll(`#p-${view} .nd`)[k]?.click(), [v, i]);
            await page.waitForTimeout(1300);
            const m = await page.evaluate(measure, [v, ids[i]].length ? undefined : undefined).catch(() => null);
            const res = await page.evaluate(`(${measure.toString()})(${JSON.stringify(v)}, ${JSON.stringify(ids[i])})`);
            tiles += 1;
            const text = await page.evaluate(`document.querySelector('#p-${v} .car > .tile[data-tile="${ids[i]}"]')?.innerText ?? ''`);
            const tag = `${slug} ${w}x${h} ${v}/${ids[i]}`;
            if (BAD.test(text)) issues.push(`${tag}: text ${text.match(BAD)[0]}`);
            if (res.overflow > 0) issues.push(`${tag}: content passes the tile bottom by ${res.overflow}px (${res.bottomEl})`);
            if (res.textOverflowX) issues.push(`${tag}: text passes the tile's right edge`);
            // A team with three matches or fewer in the slice has nothing to fill a tile with: the blank space is missing data, not layout.
            // The Trophies and knockouts tile of a team with tournament editions but no knockout match is one header line: there is nothing more to show.
            const noKnockouts = ids[i] === 'trophies' && (await page.evaluate(`document.querySelectorAll('#p-${v} .tile[data-tile="trophies"] .kc').length`)) === 0;
            if (!res.thin && !res.hasScroll && res.free > 28 && !(slice <= 3) && !noKnockouts) issues.push(`${tag}: ${res.free}% of the tile is empty below ${res.bottomEl}`);
          }
        }
      } catch (e) { issues.push(`${slug} ${w}x${h}: ${String(e).slice(0, 160)}`); }
      if (logs.length) issues.push(`${slug} ${w}x${h}: console ${[...new Set(logs)].slice(0, 3).join(' || ')}`);
      await page.close();
    }
  }
  console.log(`${tiles} tiles checked`);
  console.log(issues.length ? issues.join('\n') : 'all ok');
  await browser.close();
})();
