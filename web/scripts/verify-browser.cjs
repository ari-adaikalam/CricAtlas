// The checks that need a browser, run together (Ari, 2026-10-24). The unit tests and the type check run on every commit and in CI. These need the app, the data server and a real browser, so they run on this machine before a release and
// after any change to a shared file (globals.css, the carousel, the motion hooks, the search code, ScrollGuard). Each script proves its own detector with `--selftest` first where it has one.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> node scripts/verify-browser.cjs [--webkit] [--only name,name] [--fast]
//
// Needs: the app on port 3100 (`npm run dev`) and the data server on 8788 (`npm run data`). `--fast` leaves out the slow sweeps.
const { spawnSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const args = process.argv.slice(2);
const engineArg = args.includes('--webkit') ? ['webkit'] : [];
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : '')).split(',').filter(Boolean);
const fast = args.includes('--fast');

// [name, script, arguments, what it protects, slow]
const CHECKS = [
  ['rows-wait-selftest', 'rows-wait.cjs', ['--selftest'], 'the detector of rows that show before their tile plays', false],
  ['rows-wait', 'rows-wait.cjs', [], 'no row or card shows before its tile plays, on every page and view', false],
  ['animation-replay', 'animation-replay.cjs', ['all'], 'nothing plays twice, and no rule starts a second animation', true],
  ['next-tile-waits', 'next-tile-waits.cjs', [], 'the tile beside the one in view stays unplayed until it is scrolled to', true],
  ['reload-in-place', 'reload-in-place.cjs', [], 'a reload comes back to the same view and tile', true],
  ['scrollbars-selftest', 'scrollbars.cjs', ['--selftest'], 'the detector of scroll bars for a few pixels and bars that come late', false],
  ['scrollbars', 'scrollbars.cjs', [], 'a scroll bar only where it is needed, from the first frame, never for a few pixels', false],
  ['scrollbar-flash', 'scrollbar-flash.cjs', ['player'], 'the player page, frame by frame, for a bar that shows and goes', true],
  ['search-cases', 'search-cases.cjs', [], 'every search box finds what a person means (rcb, msd, ind vs aus, women ipl)', false],
  ['chart-tips-selftest', 'chart-tips.cjs', ['--selftest'], 'the checker of chart tooltips', false],
  ['chart-tips', 'chart-tips.cjs', [], 'every chart tooltip is one shape: a title, label and value rows, short words', false],
  ['ellipsis-tips-selftest', 'ellipsis-tips.cjs', ['--selftest'], 'the detector of cut text without its tip', false],
  ['ellipsis-tips', 'ellipsis-tips.cjs', [], 'any text cut with an ellipsis shows its full text on hover', false],
  ['profile-jitter', 'profile-jitter.cjs', [], 'the career table of a profile opens with no bar that comes or goes, up and down or sideways, and no change of width', false],
  ['top-strip', 'top-strip.cjs', [], 'a page with its own strip opens with it at the top, and the site bar never shows above it', false],
  ['not-found', 'not-found.cjs', [], 'unknown players, matches, teams and tournaments answer 404 with the right words, real ones 200', false],
  ['replay-steady', 'replay-steady.cjs', [], 'the Replay score tile keeps one size while a match plays', true],
  ['match-replay', 'match-replay.cjs', [], 'the Replay: controls, panels that follow the tracking, numbers that agree, nothing past an edge', true],
];

const reachable = (port) => new Promise((resolve) => { const r = http.get({ host: 'localhost', port, path: '/', timeout: 4000 }, (res) => { res.resume(); resolve(true); }); r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); }); });

(async () => {
  const core = process.env.PLAYWRIGHT_CORE;
  if (!core) { console.error('Set PLAYWRIGHT_CORE to the path of a playwright-core whose browsers are installed.'); process.exit(2); }
  const [app, data] = await Promise.all([reachable(3100), reachable(8788)]);
  if (!app || !data) { console.error(`Not running: ${[!app && 'the app on port 3100 (npm run dev)', !data && 'the data server on port 8788 (npm run data)'].filter(Boolean).join(' and ')}.`); process.exit(2); }
  const results = [];
  for (const [name, script, extra, why, slow] of CHECKS) {
    if (only.length && !only.includes(name)) continue;
    if (fast && slow && !only.includes(name)) continue;
    process.stdout.write(`${name} ... `);
    const t0 = Date.now();
    const r = spawnSync('node', [path.join(__dirname, 'perf', script), ...extra, ...engineArg], { env: process.env, encoding: 'utf8', maxBuffer: 1 << 26 });
    const ok = r.status === 0;
    results.push({ name, ok, why, out: `${r.stdout}${r.stderr}`.trim() });
    console.log(`${ok ? 'ok' : 'FAILED'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) { console.log(`\n--- ${r.name}: ${r.why}\n${r.out.split('\n').slice(-30).join('\n')}`); }
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(', ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
})();
