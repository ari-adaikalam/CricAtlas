// Going back from a wide tile to the half tile in front of it must stay on screen, whole, with no wide tile left cut (Ari, 2026-10-21: Partnerships from Streaks came back to Streaks). For every wide tile that follows a half tile, in every view
// of the player page, it goes to the wide tile, then goes back to the half tile with the left arrow and again with the timeline, waits for the glide and the snap, and the half tile must be whole on screen with the half tile before it, and no wide tile cut in half.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/carousel-back.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PLAYERS = (process.env.PLAYER_IDS ?? 'ba607b88').split(',');
(async () => {
  const browser = await engine.launch(); const bad = []; let tried = 0;
  for (const id of PLAYERS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(4500);
    let first = true;
    for (const [pane, name] of [['bat', 'Batting'], ['bowl', 'Bowling'], ['rec', 'Records'], ['stats', 'Full stats']]) {
      const btn = first ? page.getByRole('button', { name: name === 'Full stats' ? 'Full stats' : `${name} analysis` }).first() : page.locator(`.pgx button:text-is("${name}")`).last();
      if (!(await btn.isEnabled().catch(() => false))) continue; await btn.click(); first = false; await page.waitForTimeout(2800);
      const tiles = await page.evaluate((pane) => [...document.querySelectorAll(`#p-${pane} .car > .tile`)].map((t) => [t.dataset.tile, t.classList.contains('wide'), t.querySelector('h4 .ttl')?.firstChild?.textContent ?? '']), pane);
      for (let i = 1; i < tiles.length; i++) {
        if (!tiles[i][1] || tiles[i - 1][1]) continue;
        for (const how of ['arrow', 'timeline']) {
          await page.evaluate(([pane, i]) => { const car = document.querySelector(`#p-${pane} .car`); car.style.scrollBehavior = 'auto'; car.scrollLeft = [...car.children][i].offsetLeft - 60; }, [pane, i]); await page.waitForTimeout(900);
          if (how === 'arrow') await page.locator(`#p-${pane} .arr.l:visible`).first().click();
          else await page.locator(`#p-${pane} .rtr button, #p-${pane} .rtr .stop`).nth(i - 1).click().catch(() => undefined);
          await page.waitForTimeout(2200); tried++;
          // the half tile asked for is whole on screen, and no wide tile is left cut in half at the edge (Ari, 2026-10-21: "don't allow half full tiles")
          const here = await page.evaluate(([pane, i]) => {
            const car = document.querySelector(`#p-${pane} .car`), box = car.getBoundingClientRect(), tiles = [...car.children];
            const want = tiles[i - 1].getBoundingClientRect();
            const cut = tiles.map((t) => { const r = t.getBoundingClientRect(), shown = Math.min(r.right, box.right) - Math.max(r.left, box.left); return t.classList.contains('wide') && shown > 0.05 * r.width && shown < 0.95 * r.width ? `${t.dataset.tile} ${Math.round((shown / r.width) * 100)}%` : null; }).filter(Boolean);
            return { whole: want.left >= box.left - 2 && want.right <= box.right + 2, cut, left: Math.round(car.scrollLeft) };
          }, [pane, i]);
          if (!here.whole) bad.push(`${id} ${pane} ${how}: from ${tiles[i][0]} back to ${tiles[i - 1][0]}, it is not whole on screen (row at ${here.left})`);
          if (here.cut.length) bad.push(`${id} ${pane} ${how}: back to ${tiles[i - 1][0]} leaves a wide tile cut: ${here.cut.join(', ')}`);
        }
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(`${tried} backward steps tried`);
  if (bad.length) { console.log(`${bad.length} that did not stay:`); bad.forEach((x) => console.log('  ' + x)); } else console.log('every step back stayed on the tile it was sent to');
  process.exit(bad.length ? 1 : 0);
})();
