// Timeline clicks (Ari, 2026-10-22): opened on ?tile=form a click on Form does not move the row; a click on the tile just beyond two half tiles moves one tile; the marker never steps back on the way.
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:3100/players/v-kohli-ba607b88?format=ODI&view=batting&tile=form'); await p.waitForTimeout(4500);
  const state = () => p.evaluate(() => { return { left: Math.round(document.querySelector('#p-bat .car').scrollLeft) }; });
  const bad = [];
  const s0 = await state();
  await p.locator('#p-bat .rail button[aria-label="Form"]').click(); await p.waitForTimeout(1200);
  const s1 = await state(); if (s1.left !== s0.left) bad.push(`click Form moved the row (${s0.left} to ${s1.left})`);
  const marks = []; const t0 = Date.now();
  await p.locator('#p-bat .rail button[aria-label="Progression"]').click();
  while (Date.now() - t0 < 1500) { marks.push(await p.evaluate(() => (document.querySelector('#p-bat .rail .nd.on') || {}).getAttribute?.('aria-label'))); await p.waitForTimeout(30); }
  const s2 = await state(); const w = await p.evaluate(() => document.querySelector('#p-bat .car > .tile').offsetWidth);
  console.log('moves', s0.left, s1.left, s2.left, 'tile', w, 'marks', [...new Set(marks)].join(' > '));
  if (Math.abs(s2.left - s1.left) > w * 1.2) bad.push('Progression moved more than one tile');
  if ([...new Set(marks)].some((m) => /Key/.test(m ?? ''))) bad.push('marker stepped back to Key numbers');
  console.log(bad.length ? bad.join('\n') : 'ok'); await b.close(); process.exit(bad.length ? 1 : 0);
})();
