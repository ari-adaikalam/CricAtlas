// Opens unusual players, each under every format, in every view; scrolls through every tile (and every chip of the Full stats tiles) and reports console errors, NaN or undefined text,
// a loader that never goes away, tiles with no content and chart areas with nothing drawn and no message. Run with the dev server on 3100 and the data server on 8788:
//   node scripts/perf/odd-players.cjs [--quick] [id ...]      (--quick: the default format only)
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PLAYERS = {
  'ba607b88': 'V Kohli (all formats, big career, bowled little)',
  '52d1dbc8': 'BL Mooney (women, big career)',
  '237ec05b': 'RS Gayakwad (women, bowler)',
  'a2f46292': 'KK Ahmed (bowler, hardly batted)',
  '29e95537': 'AM Rahane (batter, hardly bowled)',
  '6a97c7a4': 'Karanbir Singh (no tracking data)',
  '02b87bde': 'LW Potthoff (one match)',
  '3d284ca3': 'PD Salt (The Hundred)',
};
const args = process.argv.slice(2), quick = args.includes('--quick');
const ids = args.filter((a) => !a.startsWith('--')).length ? args.filter((a) => !a.startsWith('--')) : Object.keys(PLAYERS);
const FORMATS = quick ? [''] : ['', 'TEST', 'ODI', 'T20I'];
const BAD = /NaN|undefined|Infinity|\[object|null%/;
const VIEWS = [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']];

async function checkTile(page, pane, t, label, chips) {
  await page.evaluate(([pane, t]) => { const car = document.querySelector(`${pane} .car`); car.style.scrollBehavior = 'auto'; car.scrollLeft = [...car.children][t].offsetLeft - 60; }, [pane, t]);
  await page.waitForTimeout(label === 'stats' ? 800 : 550);
  const info = await page.evaluate(([pane, t]) => {
    const tile = document.querySelectorAll(`${pane} .car > .tile`)[t];
    const blank = [...tile.querySelectorAll('svg')].filter((s) => { const r = s.getBoundingClientRect(); return r.width > 200 && r.height > 80; }).filter((s) => {
      const marks = [...s.querySelectorAll('path[d]')].filter((p) => p.getAttribute('d').trim().length > 0).length
        + [...s.querySelectorAll('rect')].filter((r) => { const f = r.getAttribute('fill'); return f && f !== 'transparent' && f !== 'none' && r.getBoundingClientRect().width > 0; }).length + s.querySelectorAll('circle').length;
      const said = [...s.querySelectorAll('text')].some((x) => x.textContent.trim().length > 14);
      return marks === 0 && !said;
    }).length;
    return { text: tile.innerText.replace(/\s+/g, ' '), loader: !!tile.querySelector('[class*=loader], .tl-loader, .ldr'), len: tile.innerText.length, blank };
  }, [pane, t]);
  const found = [];
  if (info.len < 25) found.push('empty');
  if (BAD.test(info.text)) found.push(`text ${info.text.match(BAD)[0]}`);
  if (info.loader) found.push('loading');
  if (info.blank) found.push(`${info.blank} blank chart`);
  if (chips) {
    const count = await page.locator(`${pane} .car > .tile`).nth(t).locator('h4 .msw button').count();
    for (let c = 0; c < count; c++) {
      await page.locator(`${pane} .car > .tile`).nth(t).locator('h4 .msw button').nth(c).click(); await page.waitForTimeout(1000);
      const txt = await page.evaluate(([pane, t]) => document.querySelectorAll(`${pane} .car > .tile`)[t].innerText.replace(/\s+/g, ' '), [pane, t]);
      if (BAD.test(txt)) found.push(`chip ${c + 1} text ${txt.match(BAD)[0]}`);
    }
  }
  return found;
}

(async () => {
  const browser = await webkit.launch();
  let problems = 0;
  for (const id of ids) {
    for (const format of FORMATS) {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
      await page.goto(`http://localhost:3100/players/${id}${format ? `?format=${format}` : ''}`); await page.waitForTimeout(4500);
      const notes = [];
      let first = true;
      for (const [label, name] of VIEWS) {
        const button = first ? page.getByRole('button', { name: `${name === 'Full stats' ? 'Full stats' : name + ' analysis'}` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
        if (!(await button.isEnabled().catch(() => false))) { notes.push(`${label}: not available`); continue; }
        await button.click(); first = false; await page.waitForTimeout(2800);
        const pane = `#p-${label}`;
        const n = await page.evaluate((pane) => document.querySelectorAll(`${pane} .car > .tile`).length, pane);
        const found = [];
        for (let t = 0; t < n; t++) { const f = await checkTile(page, pane, t, label, label === 'stats'); if (f.length) found.push(`tile ${t + 1} ${f.join(', ')}`); }
        if (found.length) problems++;
        notes.push(`${label}: ${n} tiles${found.length ? ', ' + found.join(' | ') : ''}`);
      }
      if (errors.length) { problems++; notes.push(`console: ${[...new Set(errors)].slice(0, 3).join(' || ')}`); }
      console.log(`${id} ${PLAYERS[id] || ''} [${format || 'default'}]\n  ${notes.join('\n  ')}`);
      await page.context().close();
    }
  }
  await browser.close();
  console.log(problems ? `${problems} problem(s)` : 'all clear');
})();
