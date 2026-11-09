// Does the screen change smoothly when a page is opened from a link? Records the real screen at the browser's frame rate (Chromium's screencast) from the click until the new page has settled, and reports the
// largest change in brightness from one frame to the next, for the whole screen and for the top bar. A cut to an empty page and a fade up from it showed as a jump of 13 levels; a blend between the two
// pages changes by about one level a frame.
//   PLAYWRIGHT_CORE=<path> [LIMIT=4] node scripts/perf/nav-brightness.cjs        (dev server on 3100, data server on 8788; needs `pillow` for python3)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { FLOWS } = require('./nav-flows.cjs');
const BASE = process.env.BASE ?? 'http://localhost:3100';
const LIMIT = +(process.env.LIMIT ?? 4);
const BG_LIMIT = +(process.env.BG_LIMIT ?? 2);
const MEASURE = `
import sys, glob, re
from PIL import Image
files = sorted(glob.glob(sys.argv[1] + '/f*.jpg'), key=lambda f: int(re.search(r'-(\\d+)\\.jpg', f).group(1)))
prev = None; worst = (0, 0, 0); wbg = 0
for f in files:
    im = Image.open(f).convert('L'); w, h = im.size
    mean = lambda box, size: sum(im.crop(box).resize(size).tobytes()) / (size[0] * size[1])
    cur = (mean((0, 0, w, h), (64, 36)), mean((0, 0, w, int(h * 0.09)), (64, 6)), mean((0, int(h * 0.15), int(w * 0.03), int(h * 0.85)), (4, 12)))
    t = int(re.search(r'-(\\d+)\\.jpg', f).group(1))
    if prev: worst = (max(worst[0], abs(cur[0] - prev[0])), max(worst[1], abs(cur[1] - prev[1])), worst[2] if abs(cur[0] - prev[0]) < worst[0] else t)
    if prev: wbg = max(wbg, abs(cur[2] - prev[2]))
    prev = cur
print(f'{worst[0]:.1f} {worst[1]:.1f} {worst[2]} {wbg:.1f}')
`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] }); const bad = []; const rows = [];
  for (const [name, start, pick] of FLOWS) {
    const ctx = await browser.newContext({ viewport: { width: 1352, height: 659 } }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); const frames = [];
    cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); });
    try {
      await page.goto(BASE + start, { waitUntil: 'load' }); await page.waitForTimeout(4200);
      const el = await pick(page); const box = await el.boundingBox(); await page.mouse.move(box.x + 8, box.y + 5); await page.waitForTimeout(250);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 }); await page.waitForTimeout(200);
      const t0 = Date.now(); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(2200); await cdp.send('Page.stopScreencast');
      const base = frames[0]?.t ?? 0; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'));
      frames.forEach((f, i) => fs.writeFileSync(`${dir}/f${String(i).padStart(3, '0')}-${Math.round((f.t - base) * 1000)}.jpg`, Buffer.from(f.data, 'base64')));
      const [whole, bar, at, bg] = execFileSync('python3', ['-c', MEASURE, dir]).toString().trim().split(' ').map(Number);
      rows.push(`${name}: whole screen ${whole.toFixed(1)}, bar ${bar.toFixed(1)}, page background ${bg.toFixed(1)}`);
      if (bg > BG_LIMIT) bad.push(`${name}: the page background changes by ${bg.toFixed(1)} levels in one frame`);
      if (whole > LIMIT || bar > LIMIT) bad.push(`${name}: a jump of ${whole.toFixed(1)} on the screen, ${bar.toFixed(1)} on the bar, at ${at} ms`);
    } catch (e) { bad.push(`${name}: could not be run (${String(e).slice(0, 70)})`); }
    await ctx.close();
  }
  await browser.close();
  console.log(rows.join('\n'));
  if (bad.length) { console.log(`\n${bad.length} of ${FLOWS.length} openings jump by more than ${LIMIT} levels a frame:`); bad.forEach((b) => console.log('  ' + b)); } else console.log(`\nevery opening changes by less than ${LIMIT} levels a frame (${FLOWS.length} openings)`);
  process.exit(bad.length ? 1 : 0);
})();
