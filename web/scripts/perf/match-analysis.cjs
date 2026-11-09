// Match analysis, stage 3: every tile of every format opens with content, no NaN or undefined text, a tooltip on the charts, Spells opens its card, a Test's innings switch
// changes the panels, and the Super Over note is there when a match had one.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-analysis.cjs        (IDS=1490706,1496584 to choose matches)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const IDS = (process.env.IDS ?? '1490706,1496584,1426629,1521264,1027319,1544601,1114879,1122731').split(',');
// Tiles by format. The tracking tiles are drawn only when 30% of the balls carry their field.
const expectFor = (kind, cov, par) => {
  const flow = kind === 'test' ? ['worm', 'blocks', 'manhattan', 'sources'] : ['worm', 'manhattan', 'sources', 'phases'];
  const pos = cov.positioned / cov.balls >= 0.3, trk = cov.tracked / cov.balls >= 0.3;
  // The story (stage 5): none in a Test; Win probability on 90% of the balls; the par band when the match has one; the chase tracker.
  const story = kind === 'test' ? [] : [...(cov.winProb / cov.balls >= 0.9 ? ['win'] : []), ...(par ? ['par'] : []), 'chase'];
  return [...story, ...flow, 'partnerships', ...(trk ? ['shotmix'] : []), ...(pos ? ['ring', 'wagon'] : []), 'spells', ...(trk ? ['pitch', 'wicketmap'] : []), 'matchups'];
};
(async () => {
  const browser = await chromium.launch(); const bad = [];
  for (const id of IDS) {
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    const kind = b.match.kind; const supers = b.innings.some((i) => i.super);
    const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    await page.goto(`http://localhost:3100/matches/${id}?view=analysis`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(2500);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#p-ana .car > .tile')].map((t) => t.dataset.tile));
    const par = kind !== 'test' && (await fetch(`http://localhost:8788/m/par/${id}.json`)).status === 200;
    const want = expectFor(kind, b.coverage, par);
    if (ids.join() !== want.join()) bad.push(`#${id} ${kind}: tiles ${ids.join()}, expected ${want.join()}`);
    const summary = await page.evaluate(() => document.querySelector('#p-ana .rh span')?.textContent ?? '');
    if (supers && !/Super Over/.test(summary)) bad.push(`#${id}: no Super Over note in "${summary}"`);
    for (const t of ids) {
      await page.evaluate((t) => { const c = document.querySelector('#p-ana .car'); c.style.scrollBehavior = 'auto'; c.scrollLeft = document.querySelector(`#p-ana [data-tile="${t}"]`).offsetLeft - 60; }, t);
      await page.waitForTimeout(1900);
      const info = await page.evaluate((t) => {
        const el = document.querySelector(`#p-ana [data-tile="${t}"]`); const text = el.innerText;
        return { text: text.slice(0, 4000), shapes: el.querySelectorAll('svg rect, svg path, .spc, .muc, .stk i, .bpr, table, .rrow, .ctlcell, .phc, canvas').length, loader: !!el.querySelector('[role=status]') };
      }, t);
      if (/\b(NaN|undefined|null|Infinity)\b/.test(info.text)) bad.push(`#${id} ${t}: text has ${info.text.match(/\b(NaN|undefined|null|Infinity)\b/)[0]}`);
      if (info.loader) bad.push(`#${id} ${t}: still loading`);
      if (info.shapes < (['worm', 'blocks', 'shotmix', 'win', 'par', 'chase'].includes(t) ? 2 : 5) && !['partnerships', 'wagon', 'pitch'].includes(t)) bad.push(`#${id} ${t}: nothing drawn (${info.shapes})`);
      // a tooltip on the charts
      const target = { worm: 'svg rect[fill=transparent]', manhattan: 'svg rect[fill=transparent]', blocks: 'svg g rect[fill=transparent]', sources: '.stk i', win: 'svg rect[fill=transparent]', par: 'svg rect[fill=transparent]', chase: 'svg rect[fill=transparent]', matchups: '.muc[data-c]', wicketmap: '.ctlcell[data-c]', ring: '.rrow' }[t];
      if (target) {
        const box = await page.locator(`#p-ana [data-tile="${t}"] ${target}`).first().boundingBox().catch(() => null);
        if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(250); if (!(await page.locator('.charttip').count())) bad.push(`#${id} ${t}: no tooltip on hover`); await page.mouse.move(5, 5); }
        else bad.push(`#${id} ${t}: nothing to hover`);
      }
      if (['shotmix', 'ring', 'wagon', 'pitch', 'wicketmap'].includes(t)) {
        // the panels open on the whole side; the Batter or Bowler dropdown above a panel narrows it to one player and back
        const note = () => page.locator(`#p-ana [data-tile="${t}"] .tpp`).first().getAttribute('data-sample');
        const whole = await note();
        if (!/the whole side/.test(whole ?? '')) bad.push(`#${id} ${t}: a panel does not open on the whole side: ${whole}`);
        // changing one panel must not blank the other: the neighbour's picture keeps its weight (a drawn wagon wheel or pitch map is a much bigger PNG than an empty one)
        const second = page.locator(`#p-ana [data-tile="${t}"] .tpp`).nth(1).locator('canvas').first();
        const weight = async () => ((await second.count()) ? (await second.screenshot()).length : 0);
        const heavy = await weight();
        const who = page.locator(`#p-ana [data-tile="${t}"] .tpside select`).first();
        const first = await who.locator('option:nth-child(2)').getAttribute('value');
        await who.selectOption(first); await page.waitForTimeout(600);
        const one = await note();
        if (one === whole || /the whole side/.test(one ?? '')) bad.push(`#${id} ${t}: the dropdown did not narrow the panel: ${one}`);
        if (heavy > 0 && (await weight()) < heavy * 0.7) bad.push(`#${id} ${t}: changing the first panel blanked the second (${heavy} to ${await weight()} bytes)`);
        await who.selectOption(''); await page.waitForTimeout(600);
        if ((await note()) !== whole) bad.push(`#${id} ${t}: choosing the whole side did not go back`);
        if (kind === 'test' && b.innings.filter((i) => !i.super).length > 2) {
          // each side has its own innings dropdown, so a panel never goes empty because the other side did not bat
          const inn = page.locator(`#p-ana [data-tile="${t}"] .tpside select[aria-label$="innings"]`).first();
          if (!(await inn.count())) bad.push(`#${id} ${t}: no innings dropdown in a Test panel`);
          else {
            const before = await note();
            // a side with one innings has nothing to narrow to: All innings and that innings are the same balls
            const many = (await inn.locator('option').count()) > 2;
            await inn.selectOption({ index: 1 }); await page.waitForTimeout(600);
            const after = await note();
            if (many && before === after) bad.push(`#${id} ${t}: the panel's innings dropdown did not change the sample`);
            if (/ 0 balls/.test(after ?? '')) bad.push(`#${id} ${t}: an innings of the side's own gave an empty panel: ${after}`);
            await inn.selectOption({ index: 0 }); await page.waitForTimeout(400);
          }
        }
      }
      if (t === 'spells') {
        // The bowler's name is a link to their profile, so the row is selected by its figures, not by the name.
        const row = page.locator('#p-ana [data-tile="spells"] .spr:not(.sph) .spl em').first(); await row.click(); await page.waitForTimeout(300);
        const card = await page.locator('#p-ana [data-tile="spells"] .spf').count(); const dim = await page.locator('#p-ana [data-tile="spells"] .spr.dim').count();
        if (!card || !dim) bad.push(`#${id} spells: click on a bowler gave card=${card} dim=${dim}`);
        const chips = await page.locator('#p-ana [data-tile="spells"] .spfs em').count(); if (!chips) bad.push(`#${id} spells: the card has no spell chips`);
        await page.locator('#p-ana [data-tile="spells"] .spf button').click(); await page.waitForTimeout(200);
        if (await page.locator('#p-ana [data-tile="spells"] .spf').count()) bad.push(`#${id} spells: Close did not close the card`);
      }
      if (kind === 'test' && (t === 'spells' || t === 'matchups') && b.innings.filter((i) => !i.super).length > 2) {
        const before = await page.locator(`#p-ana [data-tile="${t}"] h5`).allTextContents();
        await page.locator(`#p-ana [data-tile="${t}"] .msw button:not(.on)`).first().click({ force: true }); await page.waitForTimeout(900);
        const after = await page.locator(`#p-ana [data-tile="${t}"] h5`).allTextContents();
        if (before.join() === after.join()) bad.push(`#${id} ${t}: the innings switch did not change the panels (${before.join(' | ')})`);
      }
    }
    if (errs.length) bad.push(`#${id}: errors ${errs.slice(0, 2).join(' | ')}`);
    await page.close();
  }
  await browser.close();
  console.log(bad.length ? `${bad.length} problems:\n  ${bad.join('\n  ')}` : `every analysis tile is fine in ${IDS.length} matches`);
  process.exit(bad.length ? 1 : 0);
})();
