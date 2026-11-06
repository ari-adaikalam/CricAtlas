// Screenshots a list of pages on a phone-sized window and lays them out in contact sheets (six to a sheet, three across, each named), so a page can be looked at in every case it has.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/phone-sheet.cjs [--h 797] [--name sheet] [--wait 6000] "<label>=<path or url>[@<selector to click first>]" ...
// Sheets are written to /tmp/phone-sheets/<name>-N.png, outside the repository. Needs the dev server and the data server.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const H = Number(opt('h', 797)), NAME = opt('name', 'sheet'), WAIT = Number(opt('wait', 6000)), BASE = opt('base', 'http://localhost:3100');
const skip = new Set(['--h', '--name', '--wait', '--base'].flatMap((f) => { const i = argv.indexOf(f); return i >= 0 ? [i, i + 1] : []; }));
const targets = argv.filter((_, i) => !skip.has(i)).map((a) => {
  const [label, rest] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, a];
  const [path, click] = rest.split('@');
  return { label, url: path.startsWith('http') ? path : `${BASE}${path}`, click };
});

(async () => {
  const browser = await chromium.launch();
  const shots = [];
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: 440, height: H } });
    await page.goto(t.url, { waitUntil: 'load' }).catch(() => undefined);
    await page.waitForTimeout(WAIT);
    if (t.click) { await page.evaluate((sel) => { const el = [...document.querySelectorAll('button, a')].find((e) => e.textContent.trim() === sel); el?.click(); }, t.click); await page.waitForTimeout(2500); }
    shots.push({ label: t.label, buf: await page.screenshot() });
    await page.close();
  }
  fs.mkdirSync('/tmp/phone-sheets', { recursive: true });
  for (const f of fs.readdirSync('/tmp/phone-sheets')) if (f.startsWith(`${NAME}-`)) fs.unlinkSync(`/tmp/phone-sheets/${f}`);
  for (let n = 0; n * 6 < shots.length; n++) {
    const group = shots.slice(n * 6, n * 6 + 6);
    const page = await browser.newPage({ viewport: { width: 1360, height: 1400 } });
    const cells = group.map((g) => `<figure style="margin:0"><figcaption>${String(g.label).replace(/</g, '&lt;')}</figcaption><img src="data:image/png;base64,${g.buf.toString('base64')}" width="440"></figure>`).join('');
    await page.setContent(`<body style="margin:0;background:#000;color:#fff;font:600 15px sans-serif"><div style="display:grid;grid-template-columns:repeat(3,440px);gap:16px 20px;padding:10px">${cells}</div></body>`);
    await page.waitForTimeout(300);
    fs.writeFileSync(`/tmp/phone-sheets/${NAME}-${n + 1}.png`, await page.screenshot({ fullPage: true }));
    await page.close();
  }
  await browser.close();
  console.log(`${shots.length} pages in ${Math.ceil(shots.length / 6)} sheets: /tmp/phone-sheets/${NAME}-N.png`);
})();
