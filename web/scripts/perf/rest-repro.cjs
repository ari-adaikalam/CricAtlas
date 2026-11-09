// The hand-scroll cases of carousel-rest for one pane in WebKit, run alone (a repro for the failures the full check reported). MODE=wheel scrolls with real mouse wheel events instead of scrollBy.
const { webkit } = require(process.env.PLAYWRIGHT_CORE);
(async () => {
  const b = await webkit.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3100/players/ba607b88'); await page.waitForTimeout(4500);
  await page.getByRole('button', { name: 'Batting analysis' }).first().click(); await page.waitForTimeout(2800);
  const cut = () => page.evaluate(() => { const car = document.querySelector('#p-bat .car'), box = car.getBoundingClientRect(); return [...car.children].map((t) => { const r = t.getBoundingClientRect(), shown = Math.min(r.right, box.right) - Math.max(r.left, box.left); return t.classList.contains('wide') && shown > 0.05 * r.width && shown < 0.95 * r.width ? `${t.dataset.tile} ${Math.round(shown / r.width * 100)}%` : null; }).filter(Boolean); });
  let bad = 0, n = 0;
  for (const start of [0, 0.35, 0.7]) for (const delta of [260, 540, 980, 1700, -260, -540, -980, -1700]) {
    await page.evaluate((s) => { const c = document.querySelector('#p-bat .car'); c.style.scrollBehavior = 'auto'; c.scrollLeft = s * (c.scrollWidth - c.clientWidth); }, start); await page.waitForTimeout(700);
    if (process.env.MODE === 'wheel') { await page.mouse.move(720, 450); await page.mouse.wheel(delta, 0); } else await page.evaluate((d) => { document.querySelector('#p-bat .car').scrollBy({ left: d, behavior: 'smooth' }); }, delta); await page.waitForTimeout(1900);
    const c = await cut(); n++; if (c.length) { bad++; console.log(`from ${start * 100}% by ${delta}: ${c.join(', ')}`); }
  }
  console.log(`${n} resting places, ${bad} with a wide tile half visible`);
  await b.close();
})();
