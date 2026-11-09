// Frames of a click on a top bar menu entry, to see what is on screen between the click and the finished page. The data can be delayed to stand for a slower network.
//   PLAYWRIGHT_CORE=<path> [DELAY=600] [START=/tournaments/ipl] [ENTRY=1] node scripts/perf/nav-frames.cjs <base url> <menu name> <file prefix> [frames] [ms between]
// Writes <prefix>-<n>-<ms>.jpg in WebKit. Piece the frames together to look at them.
const { webkit } = require(process.env.PLAYWRIGHT_CORE);
const [base, menu, out, n = '14', gap = '70'] = process.argv.slice(2);
(async () => {
  const b = await webkit.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 640 }, deviceScaleFactor: 0.5 });
  const DELAY = +(process.env.DELAY ?? 0);
  if (DELAY) await p.route(/bundle|\.parquet|\.json/, async (route) => { if (route.request().url().includes('/_next/')) return route.continue(); await new Promise((r) => setTimeout(r, DELAY)); route.continue(); });
  await p.goto(base + (process.env.START ?? '/'), { waitUntil: 'load' }); await p.waitForTimeout(4500);
  await p.locator('.nmi > a:visible', { hasText: new RegExp('^' + menu + '$') }).first().hover(); await p.waitForTimeout(1200);
  const entry = p.locator('.nmi:has(> a:visible) .nmp.on a:visible').nth(+(process.env.ENTRY ?? 0));
  const box = await entry.boundingBox(); await p.mouse.move(box.x + 10, box.y + 6);
  await p.mouse.down(); const t0 = Date.now(); await p.mouse.up();
  const frames = [];
  for (let i = 0; i < +n; i++) { const t = Date.now() - t0; frames.push([t, await p.screenshot({ type: 'jpeg', quality: 60 })]); await p.waitForTimeout(+gap); }
  const fs = require('fs'); frames.forEach(([t, buf], i) => fs.writeFileSync(`${out}-${String(i).padStart(2, '0')}-${t}ms.jpg`, buf));
  await b.close();
})();
