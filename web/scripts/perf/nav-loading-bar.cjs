// The thin loading bar shows only when a click waits for data past 150 ms: never on a fast open, for the length of the wait on a slow one.
//   PLAYWRIGHT_CORE=<path> [BASE=http://localhost:3101] node scripts/perf/nav-loading-bar.cjs [screenshot.png]   (the data server on 8788 is held back by 0, 350 and 900 ms in turn)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const BASE = process.env.BASE ?? 'http://localhost:3101';
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  for (const delay of [0, 350, 900]) {
    const p = await b.newPage({ viewport: { width: 1352, height: 659 } });
    if (delay) await p.route('http://localhost:8788/**', async (r) => { await new Promise((x) => setTimeout(x, delay)); r.continue(); });
    await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(4500);
    await p.evaluate(() => { window.__b = []; const t0 = performance.now(); const tick = () => { const h = getComputedStyle(document.documentElement, '::after'); const on = document.documentElement.hasAttribute('data-nav-pending'); window.__b.push([Math.round(performance.now() - t0), on, h.height, h.opacity]); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await p.locator('.nmi > a:visible', { hasText: /^Matches$/ }).first().hover(); await p.waitForTimeout(900);
    await p.locator('.nmi:has(> a:visible) .nmp.on a:visible').first().click();
    if (delay === 900) { await p.waitForTimeout(450); if (process.argv[2]) await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 0, width: 1352, height: 80 } }); }
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => window.__b); const shown = r.filter((x) => x[1]);
    console.log('data delay', delay, 'ms: bar frames', shown.length, shown.length ? 'from ' + shown[0][0] + ' to ' + shown[shown.length - 1][0] + ' ms after load of sampler, height ' + shown[0][2] : '');
    await p.close(); }
  await b.close(); })();
