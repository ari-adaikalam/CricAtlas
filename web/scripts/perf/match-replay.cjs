// The Match Replay: the controls are there from the first ball, play moves the match on, pause holds it, the scrubber jumps to any ball and every number agrees with the scorecard
// at the end of each innings, the panels follow the tracking a match has, nothing is NaN or undefined, and no panel has anything passing its edge at the window sizes a laptop has.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-replay.cjs [webkit]        (IDS=... chooses the matches, SIZES=1440x900,... the windows)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const IDS = (process.env.IDS ?? '1529228,1544002,1521264,1114879,1122731,1442989,1544601,1417822').split(',');
const SIZES = (process.env.SIZES ?? '1352x659,1100x640,1280x560').split(',').map((s) => s.split('x').map(Number));

// Runs in the page: the scrubber to a position, as a user dragging it.
const setPos = (v) => { const i = document.querySelector('.rpscrub input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); };
const text = () => document.querySelector('.rview .rp-score > .pan')?.innerText ?? '';
const faults = () => {
  const out = [];
  for (const pan of document.querySelectorAll('.rview .pan')) {
    const r = pan.getBoundingClientRect(); if (r.width === 0) continue;
    // A panel that is too short scrolls inside itself, so what is below its edge is scrolled to, not lost.
    if (/(auto|scroll)/.test(getComputedStyle(pan).overflowY) && pan.scrollHeight > pan.clientHeight + 1) { if (pan.scrollHeight - pan.clientHeight > 1 && pan.querySelector('.kv')) { const ok = pan.hasAttribute('data-sg') ? pan.getAttribute('data-sg') === '1' : true; if (!ok) out.push('a short panel does not scroll'); } continue; }
    for (const el of pan.querySelectorAll('h3, .kv, .big, .tk, .tover, .rc, svg text')) {
      let clipped = false; for (let p = el.parentElement; p && p !== pan; p = p.parentElement) { const o = getComputedStyle(p); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') { clipped = true; break; } }
      if (clipped) continue;
      const e = el.getBoundingClientRect(); if (e.width === 0) continue;
      if (e.bottom > r.bottom + 1 || e.right > r.right + 1 || e.left < r.left - 1) out.push(`${el.tagName.toLowerCase()}.${(el.className.baseVal ?? el.className).toString().split(' ')[0]} "${(el.textContent || '').trim().slice(0, 24)}" passes its panel`);
    }
  }
  const bar = document.querySelector('.rpbar')?.getBoundingClientRect(); const win = window.innerHeight;
  if (!bar || bar.bottom > win + 1 || bar.top < 0) out.push('the control bar is not in the window');
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('page scrolls sideways');
  return [...new Set(out)].slice(0, 6);
};

(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] }); const bad = [];
  for (const id of IDS) {
    const b = await (await fetch(`http://localhost:8788/m/bundle/${id}.json`)).json();
    // Every innings, a Super Over's included: it is part of the Replay (Ari, 2026-10-22).
    const main = b.innings;
    const test = b.match.kind === 'test';
    const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    await page.goto(`http://localhost:3100/matches/${id}?view=replay`); await page.waitForSelector('.rview .obody', { timeout: 25000 }).catch(() => undefined); await page.waitForTimeout(2500);
    const tag = `#${id} ${b.match.kind}`;
    if (!(await page.$('.rpplay'))) { bad.push(`${tag}: no play button`); await page.close(); continue; }
    // the panels follow the tracking the match has
    // The pitch panel is there when the match has a line and length, or when the wagon wheel is (it then says so for an innings without).
    const pos = b.coverage.positioned / b.coverage.balls >= 0.3, trk = (b.coverage.tracked >= 0 && (b.coverage.pitched ?? b.coverage.tracked) / b.coverage.balls >= 0.3) || pos;
    const titles = await page.evaluate(() => [...document.querySelectorAll('.rview .pan h3')].map((h) => h.textContent));
    const want = [...(pos ? ['Wagon wheel'] : []), ...(trk ? ['Pitch map'] : [])];
    for (const w of want) if (!titles.includes(w)) bad.push(`${tag}: no "${w}" panel (${titles.join(', ')})`);
    if (!pos && titles.includes('Wagon wheel')) bad.push(`${tag}: a wagon wheel with no positions`);
    // The chart (win probability, chase tracker, Manhattan) was removed from the Replay (Ari, 2026-10-22): the panels are the score, the wagon wheel, the pitch map and the last six balls.
    if (titles.includes('Win probability') || titles.includes('Manhattan') || titles.includes('Chase tracker')) bad.push(`${tag}: a chart panel is still in the Replay (${titles.join(', ')})`);
    // from the first ball
    let t0 = await page.evaluate(text);
    if (!/0\/0/.test(t0) || !/Before the first ball/.test(t0)) bad.push(`${tag}: does not open before the first ball (${t0.slice(0, 40).replace(/\n/g, ' ')})`);
    // play moves it on, pause holds it
    await page.evaluate(() => document.querySelector('.rpplay').click()); await page.waitForTimeout(3500);
    const playing = await page.evaluate(text);
    if (playing === t0) bad.push(`${tag}: play did not move the match`);
    await page.evaluate(() => document.querySelector('.rpplay').click()); await page.waitForTimeout(300);
    const held = await page.evaluate(text); await page.waitForTimeout(1500);
    if ((await page.evaluate(text)) !== held) bad.push(`${tag}: pause did not hold`);
    // the end of every innings is the scorecard
    const total = Number(await page.evaluate(() => document.querySelector('.rpscrub input').max));
    let start = 0;
    const balls = []; for (const i of main) { balls.push(i.deliveries ?? i.balls); }
    for (const [k, i] of main.entries()) {
      const n = await page.evaluate(async ([id, n]) => { const r = await fetch(`http://localhost:8788/m/balls/${id}_${n}.json`); return r.status === 200 ? (await r.json()).d.length : 0; }, [id, i.n]);
      if (n === 0) continue;
      await page.evaluate(setPos, start + n); await page.waitForTimeout(500);
      const tx = await page.evaluate(text);
      if (!tx.includes(`${i.runs}/${i.wkts}`)) bad.push(`${tag}: end of innings ${k + 1} says "${tx.slice(0, 60).replace(/\n/g, ' ')}", the card says ${i.runs}/${i.wkts}`);
      if (/NaN|undefined|null|Infinity/.test(tx)) bad.push(`${tag}: bad text in the score panel`);
      start += n;
    }
    // innings headings
    await page.evaluate(setPos, 5); await page.waitForTimeout(300);
    const h1 = await page.evaluate(text);
    if (!test && !/batting first/.test(h1)) bad.push(`${tag}: first innings heading is "${h1.split('\n')[0]}"`);
    // near the end of a match with a Super Over the last innings can be a ball or two long, so the check looks at the very end
    if (!test && main.length > 1) { await page.evaluate(setPos, total - (b.innings.some((i) => i.super) ? 0 : 3)); await page.waitForTimeout(400); const h2 = await page.evaluate(text); if (!/chasing/.test(h2) || !/Required rate|Need/.test(h2)) bad.push(`${tag}: chase heading or lines missing near the end (${h2.slice(0, 80).replace(/\n/g, ' ')})`); }
    // No tile changes size from the first ball to the last (Ari, 2026-10-22).
    const sizes = () => [...document.querySelectorAll('.rview .rp-score > .pan, .rview .rp-main > .pan, .rview .rp-side > .pan, .rview .rp-last > .pan')].map((e) => { const r = e.getBoundingClientRect(); return `${e.parentElement.className.split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`; }).join(', ');
    await page.evaluate(setPos, 0); await page.waitForTimeout(700); const s0 = await page.evaluate(sizes);
    for (const at of [1, 6, Math.floor(total / 2), Math.max(0, total - 1)]) { await page.evaluate(setPos, at); await page.waitForTimeout(700); const sx = await page.evaluate(sizes); if (sx !== s0) bad.push(`${tag}: tiles resized at ${at}: ${s0} then ${sx}`); }
    if (b.innings.some((i) => i.super)) { await page.evaluate(setPos, total - 2); await page.waitForTimeout(500); const hs = await page.evaluate(text); if (!/Super Over/.test(hs)) bad.push(`${tag}: no Super Over heading near the end (${hs.slice(0, 60).replace(/\n/g, ' ')})`); }
    if (errs.length) bad.push(`${tag}: ${errs.length} errors, first: ${errs[0]}`);
    // nothing passes a panel edge at the laptop sizes, at the first ball and near the end
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
      for (const at of [0, Math.floor(total * 0.8)]) { await page.evaluate(setPos, at); await page.waitForTimeout(1700); const f = await page.evaluate(faults); if (f.length) bad.push(`${tag} ${w}x${h} at ${at}: ${f.join('; ')}`); }
    }
    await page.close();
  }
  await browser.close(); console.log(bad.length ? bad.join('\n') : `every replay is as expected in ${IDS.length} matches`); process.exit(bad.length ? 1 : 0);
})();
