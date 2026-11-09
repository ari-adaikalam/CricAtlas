// Opens Batting, Bowling and Records for a player from the Records view and reports, for each: when the reveal starts after the click, the slow frames (over 30 ms) in the next seconds,
// and that every tile is built. Needs a production build on :3101 (NEXT_DIST_DIR=.next-prod npx next build && NEXT_DIST_DIR=.next-prod npx next start -p 3101) and the data server.
// Run:  PLAYWRIGHT_CORE=<path to playwright-core> node scripts/perf/open-views.cjs webkit|chromium   (WebKit is the one that matters: Safari)
const { webkit, chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await (process.argv[2]==='chromium' ? chromium : webkit).launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs=[]; page.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,120)); });
  await page.goto('http://localhost:3101/players/ba607b88?format=ODI&view=records'); await page.waitForTimeout(5000);
  for (const view of ['batting','bowling','records']) {
    await page.evaluate(() => { window.__e=[]; const t0=performance.now(); let last=t0; const tick=()=>{ const n=performance.now(); const car=document.querySelector('.car'); const bf=document.querySelector('.bfbar, .rail'); const kn=document.querySelector('.car > .tile .kn'); window.__x=[bf?(+getComputedStyle(bf).opacity).toFixed(2):'-', kn?(+getComputedStyle(kn).opacity).toFixed(2):'-']; let x='-', o='-'; if (car) { const m=new DOMMatrix(getComputedStyle(car).transform); x=Math.round(m.m41); o=(+getComputedStyle(car).opacity).toFixed(2); } window.__e.push([Math.round(n-t0), Math.round(n-last), o+'@'+x+' bar'+window.__x[0]+' kn'+window.__x[1], car?car.getAttribute('data-enter'):'']); last=n; if(n-t0<7000) requestAnimationFrame(tick)}; requestAnimationFrame(tick); });
    const sel = view==='profile' ? '.trt .mini:visible' : '#vsw button:visible';
    await page.locator(sel).filter({ hasText: new RegExp('^'+view+'( analysis)?$','i') }).first().click({ timeout: 8000 });
    await page.waitForTimeout(7200);
    const e = await page.evaluate(() => window.__e);
    const n = await page.evaluate(() => [...document.querySelectorAll('.car > .tile')].map(t=>t.children.length>=2?'B':'0').join(''));
    const w = e.findIndex(x=>x[3]==='wait'); const play = w>=0 ? e.slice(w).find(x=>x[3]==='play') : undefined;
    console.log('==', view, 'reveal at', play&&play[0], 'tiles', n, 'frames>30ms:', e.filter(x=>x[1]>30).map(x=>x[0]+':'+x[1]).join(' ')||'none');
    if (play) console.log(e.filter(x=>x[0]>=play[0]-40).filter((x,i)=>i%6===0).slice(0,9).map(x=>x.join(' ')).join(' | '));
  }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
