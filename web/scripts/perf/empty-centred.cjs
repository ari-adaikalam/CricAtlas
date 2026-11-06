// Every "nothing to show" message sits in the middle of the box that holds it, across and down (Ari, 2026-10-22). Opens the sparse-data players in Batting, Bowling and Records and a few matches in Details and
// Analysis, goes through every tile, and measures each `.thin` and `.rempty` message against the box it is in (within 14 px on both axes). Reports the ones that are off, and how many it measured.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/empty-centred.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const PLAYERS = (process.env.PLAYER_IDS ?? '02b87bde,6a97c7a4,237ec05b,a2f46292,29e95537').split(',');
const MATCHES = (process.env.IDS ?? '1529228,1544601,1114879').split(',');
const measure = () => {
  const out = []; let seen = 0;
  for (const m of document.querySelectorAll('.thin, .rempty')) {
    const r = m.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const box = m.closest('.art, .tsc, .tpbody, .hsc, .pan2, .tile'); if (!box) continue;
    const t = box.closest('.tile'); const tr = t ? t.getBoundingClientRect() : null;
    const b = box.getBoundingClientRect(); if (b.width === 0) continue;
    seen++;
    const text = document.createRange(); text.selectNodeContents(m); const tx = text.getBoundingClientRect();
    const dx = (tx.left + tx.right) / 2 - (b.left + b.right) / 2, dy = (tx.top + tx.bottom) / 2 - (b.top + b.bottom) / 2;
    if (Math.abs(dx) > 14 || Math.abs(dy) > Math.max(14, b.height * 0.06)) out.push(`${(t && t.dataset.tile) || box.className.split(' ')[0]}: "${(m.textContent || '').trim().slice(0, 40)}" off by ${Math.round(dx)} across, ${Math.round(dy)} down (box ${Math.round(b.width)}x${Math.round(b.height)})`);
  }
  return { out: [...new Set(out)], seen };
};
(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader'] }); const bad = []; let seen = 0;
  const walk = async (page, car, label) => {
    const n = await page.evaluate((c) => document.querySelectorAll(`${c} > .tile`).length, car);
    for (let k = 0; k < n; k++) {
      await page.evaluate(([c, k]) => { const el = document.querySelector(c); el.style.scrollBehavior = 'auto'; el.scrollLeft = el.children[k].offsetLeft - 40; }, [car, k]); await page.waitForTimeout(900);
      const r = await page.evaluate(measure); seen += r.seen; for (const x of r.out) bad.push(`${label} tile ${k}: ${x}`);
    }
  };
  for (const id of PLAYERS) {
    for (const [name, car] of [['Batting analysis', '#p-bat .car'], ['Bowling analysis', '#p-bowl .car'], ['Records', '#p-rec .car']]) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
      await page.goto(`http://localhost:3100/players/${id}`); await page.waitForTimeout(3500);
      await page.getByRole('button', { name: name === 'Records' ? 'Records' : name }).first().click().catch(() => undefined); await page.waitForSelector(`${car} > .tile`, { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(2500);
      await walk(page, car, `${id} ${name}`); await page.close();
    }
  }
  for (const id of MATCHES) {
    for (const [view, car] of [['details', '#p-det .car'], ['analysis', '#p-ana .car']]) {
      const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
      await page.goto(`http://localhost:3100/matches/${id}?view=${view}`); await page.waitForSelector(`${car} > .tile`, { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2500);
      await walk(page, car, `#${id} ${view}`); await page.close();
    }
  }
  await browser.close(); console.log(`${seen} messages measured`); console.log(bad.length ? bad.join('\n') : 'every message is centred'); process.exit(bad.length ? 1 : 0);
})();
