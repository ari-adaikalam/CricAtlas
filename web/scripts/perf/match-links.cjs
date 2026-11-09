// Names that lead somewhere (Ari, 2026-10-20): a player's name opens a menu on hover and goes to their profile on a click, a team's name links to its team page (the innings headings and the strip), the menu stays inside the
// window and closes when the pointer leaves, and Back returns to the match. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/match-links.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
(async () => {
  const browser = await engine.launch(); const fails = [];
  const note = (name, ok, detail = '') => { console.log(`${name}: ${ok ? 'ok' : 'FAILED'} ${detail}`); if (!ok) fails.push(`${name} ${detail}`); };
  const page = await browser.newPage({ viewport: { width: 1350, height: 640 } });
  const logs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 160)); });
  await page.goto('http://localhost:3100/matches/1359525'); await page.waitForSelector('.resbar'); await page.waitForTimeout(1000);
  const links = await page.locator('.blk .nm a.el').count();
  note('player names are links', links >= 12, `${links} links`);
  note('team names in the innings headings link to the team page', await page.evaluate(() => { const a = [...document.querySelectorAll('.blk h2 a')]; return a.length > 0 && a.every((x) => /^\/teams\//.test(x.getAttribute('href') ?? '')); }));
  const first = page.locator('.blk .nm a.el').first(); const name = (await first.innerText()).trim();
  const requested = []; page.on('request', (r) => { const u = r.url(); if (/\/p\/(profile|view|bat|bowl)\//.test(u)) requested.push(u.replace(/^.*\/p\//, 'p/')); });
  await page.waitForTimeout(1500);
  const before = requested.length;
  await first.hover(); await page.waitForTimeout(900);
  const fetched = requested.slice(before);
  note('hovering a player fetches their profile and recorded views ahead of a click', fetched.some((u) => /^p\/profile\/[0-9a-f]{8}\.json/.test(u)) && fetched.some((u) => /^p\/view\//.test(u)), fetched.slice(0, 4).join(', '));
  const menu = await page.evaluate(() => { const m = document.querySelector('.elmenu'); if (!m) return null; const r = m.getBoundingClientRect(); return { items: [...m.querySelectorAll('[role=menuitem]')].map((x) => ({ t: x.innerText.trim(), off: x.getAttribute('aria-disabled') === 'true', href: x.getAttribute('href') })), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
  note('hover opens the menu', !!menu && menu.items.length === 2, JSON.stringify(menu?.items));
  note('View profile leads to the profile, Compare is dimmed', menu && /^\/players\/.+-[0-9a-f]{8}$/.test(menu.items[0].href ?? '') && !menu.items[0].off && menu.items[1].off && menu.items[1].href === null);
  note('the menu is inside the window', !!menu && menu.inside);
  await page.locator('.elmenu .elitem').first().hover(); await page.waitForTimeout(400);
  note('the menu stays while the pointer is on it', (await page.locator('.elmenu').count()) === 1);
  await page.mouse.move(700, 20); await page.waitForTimeout(500);
  note('the menu closes when the pointer leaves', (await page.locator('.elmenu').count()) === 0);
  // The last bowler row is near the bottom of a short window: the menu must flip or stay inside.
  const last = page.locator('.blk').last().locator('.cols > div').nth(1).locator('.r a.el:visible').last(); await last.hover(); await page.waitForTimeout(500);
  const inside = await page.evaluate(() => { const m = document.querySelector('.elmenu'); if (!m) return null; const r = m.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
  note('a menu near the bottom edge stays inside the window', inside === true);
  await page.mouse.move(700, 20); await page.waitForTimeout(400);
  // Keyboard: focus opens the menu, Escape closes it.
  await first.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  // Safari does not put links in the Tab order unless its setting "Press Tab to highlight each item" is on, so headless WebKit cannot Tab to a name: the check is Chromium's.
  if (process.argv[2] === 'webkit') console.log('keyboard focus opens the menu: skipped (Safari does not Tab to links by default)'); else note('keyboard focus opens the menu', (await page.locator('.elmenu').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  note('Escape closes it', (await page.locator('.elmenu').count()) === 0);
  // A click goes to the profile, with a short fade, and Back returns.
  await page.mouse.move(700, 20);
  await first.click(); await page.waitForURL(/\/players\//, { timeout: 15000 }); await page.waitForTimeout(1500);
  const url = page.url(); const title = await page.title();
  note('a click opens the profile', /\/players\/.+-[0-9a-f]{8}/.test(url), url.replace('http://localhost:3100', ''));
  await page.goBack(); await page.waitForSelector('.resbar', { timeout: 15000 }); await page.waitForTimeout(800);
  note('Back returns to the match', /\/matches\/1359525/.test(page.url()) && (await page.locator('.blk').count()) === 2);
  // Back must not jitter: nothing moves or animates on the summary after it has appeared (found 2026-10-20: the blocks replayed an entrance a second later).
  const rects = () => page.evaluate(() => [...document.querySelectorAll('.blk, .mbanner, .mact')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); }).join('|'));
  const r1 = await rects();
  const anim = await page.evaluate(() => new Promise((res) => { let m = 0; const t0 = performance.now(); const tick = () => { m = Math.max(m, document.getAnimations().filter((a) => a.playState === 'running' && /blk|bh|bb/.test((a.effect?.target?.className ?? '').toString())).length); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res(m); }; tick(); }));
  const r2 = await rects();
  note('after Back nothing animates or moves on the summary', anim === 0 && r1 === r2, `animations ${anim}, moved ${r1 !== r2}`);
  note('no console errors', logs.length === 0, logs.slice(0, 2).join(' / '));
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok'); process.exit(fails.length ? 1 : 0);
})();
