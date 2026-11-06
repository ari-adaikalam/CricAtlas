// A reload in a view comes back on the same tile (found 2026-10-22: the story tiles of Match analysis arrive after the ball files and pushed the row onto another tile).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/reload-in-place.cjs        (IDS=... TILES=spells,wagon,... to choose)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const IDS = (process.env.IDS ?? '1490706,1114879,1544002,1521264').split(',');
(async () => {
  const browser = await chromium.launch(); const bad = [];
  for (const id of IDS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await page.goto(`http://localhost:3100/matches/${id}?view=analysis`); await page.waitForSelector('#p-ana .car > .tile', { timeout: 20000 }); await page.waitForTimeout(2500);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#p-ana .car > .tile')].map((t) => t.dataset.tile));
    for (const t of ids.slice(1)) {
      await page.evaluate((t) => { const c = document.querySelector('#p-ana .car'); c.style.scrollBehavior = 'auto'; c.scrollLeft = document.querySelector(`#p-ana [data-tile="${t}"]`).offsetLeft - 60; }, t);
      await page.waitForTimeout(1200);
      const url = page.url(); const named = new URL(url).searchParams.get('tile');
      await page.reload(); await page.waitForSelector('#p-ana .car > .tile', { timeout: 20000 }); await page.waitForTimeout(3000);
      const after = await page.evaluate(() => { const c = document.querySelector('#p-ana .car'); const box = c.getBoundingClientRect(); return [...c.children].filter((k) => { const r = k.getBoundingClientRect(); return Math.min(r.right, box.right) - Math.max(r.left, box.left) > r.width * 0.6; }).map((k) => k.dataset.tile); });
      const url2 = new URL(page.url()).searchParams.get('tile');
      if (!after.includes(named.replace(/~r$/, ''))) bad.push(`#${id} ${named}: after reload ${after.join('+')}`);
      if (url2 !== named) bad.push(`#${id} ${named}: address became ${url2}`);
    }
    await page.close();
  }
  await browser.close(); console.log(bad.length ? bad.join('\n') : 'ok'); process.exit(bad.length ? 1 : 0);
})();
