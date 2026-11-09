// Does the screen flash when a control on a page is used? For each page, every visible button, tab, chip and same-page link in the content is clicked in turn (from a fresh load), and the real screen is recorded at the
// browser's frame rate (Chromium's screencast) for 1.6 s after the click. Reports the largest change in brightness from one frame to the next for the whole screen and for the page background (a strip at the left
// edge, outside the panels), and lists any control above LIMIT.
//   PLAYWRIGHT_CORE=<path> [BASE=http://localhost:3101] [LIMIT=4] [MAX=14] node scripts/perf/brightness-all.cjs [page ...]      (needs `pillow` for python3)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const BASE = process.env.BASE ?? 'http://localhost:3101'; const LIMIT = +(process.env.LIMIT ?? 4); const MAX = +(process.env.MAX ?? 14);
const PAGES = process.argv.length > 2 ? process.argv.slice(2) : ['/', '/players', '/teams', '/matches', '/tournaments', '/players/ba607b88', '/teams/india~intl~male', '/tournaments/ipl', '/matches/1415755', '/matches/1415755?view=analysis', '/compare/players?a=ba607b88&b=1ee5d3f8'];
const MEASURE = `
import sys, glob, re
from PIL import Image
files = sorted(glob.glob(sys.argv[1] + '/f*.jpg'), key=lambda f: int(re.search(r'-(\\d+)\\.jpg', f).group(1)))
prev = None; worst = [0, 0, 0]
for f in files:
    im = Image.open(f).convert('L'); w, h = im.size
    mean = lambda box, size: sum(im.crop(box).resize(size).tobytes()) / (size[0] * size[1])
    cur = (mean((0, 0, w, h), (64, 36)), mean((0, int(h * 0.15), int(w * 0.03), int(h * 0.85)), (4, 12)))
    t = int(re.search(r'-(\\d+)\\.jpg', f).group(1))
    if prev:
        d0, d1 = abs(cur[0] - prev[0]), abs(cur[1] - prev[1])
        if d0 > worst[0]: worst[0], worst[2] = d0, t
        worst[1] = max(worst[1], d1)
    prev = cur
print(f'{worst[0]:.1f} {worst[1]:.1f} {worst[2]}')
`;
const LIST = () => [...document.querySelectorAll('.pgx :is(button, [role=tab], [role=button], .achip, a[href^="?"], a[href*="view="])')].filter((e) => { if (e.closest('.nav, .nmp, .res, .srch, svg, [aria-hidden=true]')) return false; const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 14 && r.top >= 0 && r.top < innerHeight && r.left >= 0 && r.left < innerWidth && !e.disabled; }).map((e, i) => (e.dataset.bi = String(i), (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 28)));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] }); const bad = []; let n = 0;
  for (const url of PAGES) {
    const probe = await browser.newPage({ viewport: { width: 1352, height: 659 } }); await probe.goto(BASE + url, { waitUntil: 'load' }); await probe.waitForTimeout(4500);
    const labels = (await probe.evaluate(LIST)).slice(0, MAX); await probe.close();
    for (let i = 0; i < labels.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1352, height: 659 } }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); const frames = [];
      cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); });
      try {
        await page.goto(BASE + url, { waitUntil: 'load' }); await page.waitForTimeout(4500); await page.evaluate(LIST);
        const el = page.locator(`[data-bi="${i}"]`); const box = await el.boundingBox(); if (!box) { await ctx.close(); continue; }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(250);
        await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 }); await page.waitForTimeout(200);
        await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(1600); await cdp.send('Page.stopScreencast');
        const base = frames[0]?.t ?? 0; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bri-'));
        frames.forEach((f, k) => fs.writeFileSync(`${dir}/f${String(k).padStart(3, '0')}-${Math.round((f.t - base) * 1000)}.jpg`, Buffer.from(f.data, 'base64')));
        const [whole, bg, at] = execFileSync('python3', ['-c', MEASURE, dir]).toString().trim().split(' ').map(Number); n++;
        if (whole > LIMIT || bg > LIMIT) bad.push(`${url} :: "${labels[i]}": screen ${whole.toFixed(1)}, background ${bg.toFixed(1)} at ${at} ms`);
      } catch (e) { bad.push(`${url} :: "${labels[i]}": could not be run (${String(e).slice(0, 60)})`); }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`${n} controls tried.`); if (bad.length) { console.log(`${bad.length} change brightness by more than ${LIMIT} levels a frame:`); bad.forEach((b) => console.log('  ' + b)); } else console.log('none changes brightness by more than ' + LIMIT + ' levels a frame.');
})();
