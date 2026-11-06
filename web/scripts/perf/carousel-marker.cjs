// The timeline marker follows the tile that is selected: the cases of the Bowling view, by timeline click, round button, address and hand scroll.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/carousel-marker.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const browser = await chromium.launch(); const bad = []; let cases = 0;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const open = async (url) => { await page.goto(url); await page.waitForTimeout(4500); await page.getByRole('button', { name: 'Bowling analysis' }).first().click().catch(() => undefined); await page.waitForTimeout(2800); };
  const read = () => page.evaluate(() => {
    const car = document.querySelector('#p-bowl .car'), box = car.getBoundingClientRect();
    const label = (t) => document.querySelector(`#p-bowl .nd[aria-label]:nth-of-type(1)`) && t;
    const tiles = [...car.children];
    const labels = [...document.querySelectorAll('#p-bowl .rtr .nd')].map((n) => n.getAttribute('aria-label'));
    const vis = tiles.map((t, k) => { const r = t.getBoundingClientRect(); return (Math.min(r.right, box.right) - Math.max(r.left, box.left)) / r.width >= 0.9 ? labels[k] : null; }).filter(Boolean);
    const on = [...document.querySelectorAll('#p-bowl .rtr .nd.on')].map((n) => n.getAttribute('aria-label'));
    const also = [...document.querySelectorAll('#p-bowl .rtr .nd.also')].map((n) => n.getAttribute('aria-label'));
    return { page: vis.join(' + '), marker: on.join(','), lit: on.length + also.length, url: new URL(location.href).searchParams.get('tile'), at: Math.round(car.scrollLeft) };
  });
  const expect = async (what, page_, marker, extra = {}) => {
    await page.waitForTimeout(1500); cases++;
    const r = await read();
    if (r.page !== page_) bad.push(`${what}: shows "${r.page}", wanted "${page_}"`);
    if (r.marker !== marker) bad.push(`${what}: marker on "${r.marker}", wanted "${marker}"`);
    if (extra.noMove !== undefined && Math.abs(r.at - extra.noMove) > 2) bad.push(`${what}: the row moved (${extra.noMove} to ${r.at}) and should not`);
    return r;
  };
  const click = (label) => page.locator(`#p-bowl .rtr .nd[aria-label="${label}"]`).click();
  // a person waits for the row to arrive before pressing again
  const right = async () => { await page.waitForTimeout(1400); await page.locator('#p-bowl .arr.r:visible').first().click(); };
  const left = async () => { await page.waitForTimeout(1400); await page.locator('#p-bowl .arr.l:visible').first().click(); };
  await open('http://localhost:3100/players/ba607b88');

  // timeline clicks
  await click('Pitch map'); await expect('T click Pitch map', 'Pitch map', 'Pitch map');
  await click('Length by phase'); await expect('T4 Pitch map, click Length by phase', 'Length by phase + Line and length', 'Length by phase');
  let r = await read(); const at1 = r.at;
  await click('Line and length'); r = await expect('T1 click Line and length (already on screen, no move)', 'Length by phase + Line and length', 'Line and length', { noMove: at1 });
  await click('Pitch map'); await expect('T5 back to Pitch map', 'Pitch map', 'Pitch map');
  await click('Batters faced'); await click('Batters'); await expect('T3 Batters faced, click Batters', 'By season + Batters', 'Batters');
  r = await read();
  await click('By season'); await expect('T2a By season on screen, click By season', 'By season + Batters', 'By season', { noMove: r.at });
  await click('Batters'); await expect('T2b click Batters (marker only)', 'By season + Batters', 'Batters', { noMove: r.at });
  await click('Reviews'); await expect('T8 click Reviews', 'Dismissal types + Reviews', 'Reviews');
  await click('Dismissal map'); await expect('T9 click Dismissal map', 'Dismissal map + Dismissal types', 'Dismissal map');
  await click('Key numbers'); await expect('T11 click Key numbers', 'Key numbers + Form', 'Key numbers');
  await click('Phases'); await expect('T7 click Phases (from its left: the right tile of its page)', 'Progression + Phases', 'Phases');

  // round buttons
  await click('Key numbers'); await expect('A start', 'Key numbers + Form', 'Key numbers');
  await right(); await expect('A1 right', 'Form + Progression', 'Progression');
  await left(); await expect('A left', 'Key numbers + Form', 'Key numbers');
  await click('By season'); await right(); await expect('A3 By season, Batters, right', 'By season + Batters', 'Batters');
  await left(); await expect('A10 By season, Batters, left', 'Runs conceded + By season', 'Runs conceded');
  await click('Pitch map'); await right(); await expect('A9 Pitch map, right', 'Length by phase + Line and length', 'Length by phase');
  await right(); await expect('A2 right', 'Line and length + Control', 'Control');
  await left(); await expect('A5 left', 'Length by phase + Line and length', 'Length by phase');
  await left(); await expect('A6 left to Pitch map', 'Pitch map', 'Pitch map');

  // two presses of a button without waiting: the second goes on from the page the first is heading to
  await click('Key numbers'); await page.waitForTimeout(1500);
  await page.locator('#p-bowl .arr.r:visible').first().click(); await page.locator('#p-bowl .arr.r:visible').first().click(); cases++; await page.waitForTimeout(2200);
  r = await read();
  if (r.page !== 'Progression + Phases') bad.push(`two quick presses of the right button show "${r.page}", wanted "Progression + Phases"`);

  // the address follows the marker
  const tileIds = await page.evaluate(() => [...document.querySelectorAll('#p-bowl .car > .tile')].map((t) => t.dataset.tile));
  const tileLabels = await page.evaluate(() => [...document.querySelectorAll('#p-bowl .rtr .nd')].map((n) => n.getAttribute('aria-label')));
  for (const want of ['Line and length', 'Batters']) {
    await click(want); await page.waitForTimeout(1500); r = await read(); cases++;
    if (r.url?.replace(/~r$/, '') !== tileIds[tileLabels.indexOf(want)]) bad.push(`the address names "${r.url}" with the marker on ${want} (its tile is ${tileIds[tileLabels.indexOf(want)]})`);
  }

  // an address opens with the marker on its tile
  const ids = await page.evaluate(() => [...document.querySelectorAll('#p-bowl .car > .tile')].map((t) => t.dataset.tile));
  await page.evaluate(() => 0);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#p-bowl .rtr .nd')].map((n) => n.getAttribute('aria-label')));
  for (const want of ['Line and length', 'Reviews', 'Batters']) {
    const id = ids[labels.indexOf(want)];
    await open(`http://localhost:3100/players/ba607b88?view=bowling&tile=${id}`);
    const rr = await read(); cases++;
    if (rr.marker !== want) bad.push(`O address tile=${id}: marker on "${rr.marker}", wanted "${want}" (page "${rr.page}")`);
  }

  // a scroll by hand: the marker goes to the tile that came into view
  await open('http://localhost:3100/players/ba607b88');
  await click('Key numbers'); await page.waitForTimeout(1200);
  const box = await page.locator('#p-bowl .car').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(700, 0); await page.waitForTimeout(2200); cases++;
  r = await read();
  const pageTiles = r.page.split(' + ');
  if (!pageTiles.includes(r.marker)) bad.push(`S scroll right by hand: marker on "${r.marker}" which is not on screen (${r.page})`);
  if (r.marker === 'Key numbers') bad.push('S scroll right by hand: the marker stayed on Key numbers though the row moved');

  await browser.close();
  console.log(`${cases} cases`);
  if (bad.length) { console.log(`${bad.length} wrong:`); bad.forEach((x) => console.log('  ' + x)); } else console.log('every case is as agreed');
  process.exit(bad.length ? 1 : 0);
})();
