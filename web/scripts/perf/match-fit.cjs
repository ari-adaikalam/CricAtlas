// Does every line of the Match summary fit? Opens the matches with the longest results, player lines, team names, grounds and competition names (ids from scripts/match-lengths.ts) and reports any
// line that is cut off or runs outside its box, at three window sizes. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-fit.cjs [webkit] [id ...]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const args = process.argv.slice(2);
const engine = args[0] === 'webkit' ? webkit : chromium;
const IDS = (process.env.FIT_IDS ? process.env.FIT_IDS.split(',') : args.filter((a) => /^\d+$/.test(a)).length ? args.filter((a) => /^\d+$/.test(a)) : '1323160,1148671,501255,829807,1094693,1227877,426395,64050,1317484,238167,403368,426424,1011497,1019645,1019771,1082591,1082595,1082598,267713,1473508,1473509,1479577,1488248,1488249,1429634,1477672,1528338,1158359,1407870,1462856,1403297,1428745,1428746,1453909'.split(',')).map(Number);
const SIZES = process.env.FIT_SIZES ? process.env.FIT_SIZES.split(',').map((x) => x.split('x').map(Number)) : [[1350, 700], [1260, 700], [1100, 700], [1440, 900]];
const CHECK = '.rs1, .potm, .mbs, .mbt h1, .blk h2, .bh .ov, .bh .sc, .nm, .mso, .btns .btn';
(async () => {
  const browser = await engine.launch(); const bad = [];
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 140)); }); page.on('pageerror', (e) => logs.push(String(e).slice(0, 140)));
    for (const id of IDS) {
      logs.length = 0;
      await page.goto(`http://localhost:3100/matches/${id}`); await page.waitForSelector('.resbar', { timeout: 15000 }).catch(() => undefined); await page.waitForTimeout(500);
      const cut = await page.evaluate((sel) => {
        const out = [];
        for (const el of document.querySelectorAll(`.sum ${sel.split(', ').join(', .sum ')}`)) {
          if (!el.clientWidth) continue;
          const over = el.scrollWidth > el.clientWidth + 1;
          const box = el.closest('.blk, .mbanner, .resbar, .mso, .btns')?.getBoundingClientRect(); const r = el.getBoundingClientRect();
          const outside = box && (r.right > box.right + 1 || r.left < box.left - 1);
          if (over || outside) out.push(`${el.className || el.tagName}: "${el.innerText.replace(/\s+/g, ' ').slice(0, 90)}"`);
        }
        if (/NaN|undefined|Infinity|\[object|\bnull\b/.test(document.querySelector('.sum')?.innerText ?? '')) out.push('bad text on the summary');
        if (!document.querySelector('.minns .blk') && !/No balls were bowled/.test(document.body.innerText)) out.push('no innings block and no explanation');
        const strip = document.querySelector('.mact')?.getBoundingClientRect(); const foot = document.querySelector('.credit')?.getBoundingClientRect();
        if (strip && foot && strip.bottom > foot.top - 8) out.push(`the buttons are ${Math.round(foot.top - strip.bottom)} px above the footer`);
        return out;
      }, CHECK);
      for (const c of cut) bad.push(`${w}x${h} #${id} ${c}`);
      if (logs.length) bad.push(`${w}x${h} #${id} console: ${logs[0]}`);
    }
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} lines do not fit:`); bad.forEach((b) => console.log('  ' + b)); } else console.log(`all ${IDS.length} matches fit at ${SIZES.map((s) => s.join('x')).join(', ')}`);
  process.exit(bad.length ? 1 : 0);
})();
