// Names and matches on the player page lead somewhere (Ari, 2026-10-22): an opponent player in the two Opponents tables (Batting and Bowling analysis) is a link to their profile, and the match of a Best
// performances row and of a Best partnerships row is a link to its Match page. Clicking the name goes there and the row does not also act on the click; clicking elsewhere on the row keeps its job.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/player-links.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader'] }); const bad = []; const ok = (name, good, detail = '') => { console.log(`${name}: ${good ? 'ok' : 'FAILED'} ${detail}`); if (!good) bad.push(name); };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = []; page.on('pageerror', (e) => logs.push(String(e).slice(0, 140)));
  const open = async (view, pane, tile) => { await page.goto(`http://localhost:3100/players/ba607b88?view=${view}&tile=${tile}`); await page.waitForSelector(`#p-${pane} .car > .tile`, { timeout: 25000 }); await page.waitForTimeout(3500); };
  for (const [view, pane, label] of [['batting', 'bat', 'Batting'], ['bowling', 'bowl', 'Bowling']]) {
    await open(view, pane, 'opponents');
    const rows = await page.evaluate((p) => [...document.querySelectorAll(`#p-${p} [data-tile="opponents"] tbody tr.oprow`)].slice(0, 12).map((r) => !!r.querySelector('td a')), pane);
    ok(`${label}: opponents are links`, rows.length > 0 && rows.every(Boolean), `${rows.filter(Boolean).length} of ${rows.length}`);
    // clicking the row away from the name still picks the opponent, clicking the name goes to the profile and picks nothing
    const row = page.locator(`#p-${pane} [data-tile="opponents"] tbody tr.oprow`).first();
    await row.locator('td').nth(1).click(); await page.waitForTimeout(600);
    ok(`${label}: a click on the row picks the opponent`, (await page.locator(`#p-${pane} [data-tile="opponents"] tr.oprow.on`).count()) === 1);
    await row.locator('td').nth(1).click(); await page.waitForTimeout(300);
    await row.locator('td a').first().click(); await page.waitForTimeout(2500);
    ok(`${label}: a click on the name goes to the profile`, /\/players\/.+-[0-9a-f]{8}/.test(new URL(page.url()).pathname) && !/ba607b88/.test(new URL(page.url()).pathname), new URL(page.url()).pathname);
  }
  await open('records', 'rec', 'highs');
  // Best performances: the whole row leads to its match (Ari, 2026-10-22), and the opponent's name inside it is a link to the team.
  const best = await page.evaluate(() => [...document.querySelectorAll('#p-rec .bpr')].slice(0, 10).map((r) => ({ row: r.getAttribute('role') === 'link', team: r.querySelector('.bpo a')?.getAttribute('href') ?? null })));
  ok('Records: each Best performances row is a link and its opponent leads to the team', best.length > 0 && best.every((x) => x.row && x.team && /^\/teams\//.test(x.team)), `${best.filter((x) => x.row && x.team).length} of ${best.length}`);
  if (best[0]) { await page.locator('#p-rec .bpr .bpb').first().click(); await page.waitForTimeout(3000); ok('Records: a click on a row opens the Match page', /\/matches\//.test(new URL(page.url()).pathname), new URL(page.url()).pathname); await page.goBack(); await page.waitForTimeout(2500); }
  await open('records', 'rec', 'partnerships');
  const pt = await page.evaluate(() => [...document.querySelectorAll('#p-rec [data-tile="partnerships"] .pti')].slice(0, 10).map((r) => ({ row: r.getAttribute('role') === 'link', team: r.querySelector('.pth em a')?.getAttribute('href') ?? null })));
  ok('Records: each partnership row is a link and its opponent leads to the team', pt.length > 0 && pt.every((x) => x.row && x.team && /^\/teams\//.test(x.team)), `${pt.filter((x) => x.row && x.team).length} of ${pt.length}`);
  ok('no page errors', logs.length === 0, logs.slice(0, 2).join(' | '));
  await browser.close(); console.log(bad.length ? `${bad.length} FAILED` : 'every link is as agreed'); process.exit(bad.length ? 1 : 0);
})();
