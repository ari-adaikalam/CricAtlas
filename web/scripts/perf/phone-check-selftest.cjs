// The phone check proves itself first: on a page with one planted fault of each kind it must report every kind, and on the clean copy it must pass.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/phone-check-selftest.cjs [webkit]      (dev server on 3100; the report is read from the screen, so nothing is written)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv.includes('webkit') ? webkit : chromium;
const KINDS = ['sideways', 'tap', 'past-panel', 'clipped', 'empty', 'scrolls', 'replay'];

async function run(browser, fixture) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100/dev/phone-check?url=${encodeURIComponent(fixture)}&auto=1`);
  await page.waitForFunction(() => /report saved|report not saved|the walk stopped/.test(document.body.innerText), null, { timeout: 60000 });
  const text = await page.evaluate(() => document.body.innerText);
  await ctx.close();
  return text;
}

(async () => {
  const browser = await engine.launch();
  const bad = [];
  const faulty = await run(browser, '/dev/phone-fixture');
  for (const k of KINDS) if (!new RegExp(`^${k}: \\d+`, 'm').test(faulty)) bad.push(`planted fault not seen: ${k}`);
  const clean = await run(browser, '/dev/phone-fixture?clean=1');
  if (!/^PASS/m.test(clean)) bad.push(`the clean page did not pass:\n${clean}`);
  await browser.close();
  console.log(`faulty page: ${KINDS.map((k) => `${k} ${new RegExp(`^${k}: (\\d+)`, 'm').exec(faulty)?.[1] ?? 0}`).join(', ')}`);
  console.log(`clean page: ${/^PASS/m.test(clean) ? 'PASS' : 'FAIL'}`);
  if (bad.length) { bad.forEach((b) => console.log('  ' + b)); process.exit(1); }
  console.log('the phone check sees every planted fault and passes the clean page');
})();
