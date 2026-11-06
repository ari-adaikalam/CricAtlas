// Scrolls the tile row across six tiles with smooth scrolling and reports the frame times and how many page writes happened (mutations). The slow frames come with the tile they happened at.
// BASE=<url> and PLAYER=<slug, e.g. v-kohli-ba607b88> test the live site.
// Run:  PLAYWRIGHT_CORE=<path> node scripts/perf/scroll-frames.cjs webkit|chromium "<css to inject, or empty>" batting|bowling|records   (injecting CSS is how a cost is bisected)
const { webkit, chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await (process.argv[2]==='chromium' ? chromium : webkit).launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const css = process.argv[3] || '';
  await page.goto(`${process.env.BASE || 'http://localhost:3101'}/players/${process.env.PLAYER || 'ba607b88'}?format=ODI&view=${process.argv[4]||'batting'}`);
  await page.waitForSelector('.car'); await page.waitForTimeout(9000);
  if (css) await page.addStyleTag({ content: css });
  const r = await page.evaluate(async () => {
    const car = document.querySelector('.car'); const frames=[]; let muts=0;
    const mo = new MutationObserver(l => { muts += l.length; }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    let last = performance.now(); let run = true; const tick=()=>{ const n=performance.now(); frames.push(n-last); if (n-last>40) window.__slow=(window.__slow||[]).concat([[Math.round(n-last), Math.round(car.scrollLeft), Math.round(n)]]); last=n; if(run) requestAnimationFrame(tick)}; requestAnimationFrame(tick);
    for (let i=0;i<6;i++) { car.scrollBy({ left: car.clientWidth*0.9, behavior: 'smooth' }); await new Promise(r=>setTimeout(r, 900)); }
    run=false; mo.disconnect();
    const f = frames.slice(2);
    return { slow: window.__slow, n: f.length, avg: +(f.reduce((a,b)=>a+b,0)/f.length).toFixed(1), over24: f.filter(x=>x>24).length, over50: f.filter(x=>x>50).length, max: Math.round(Math.max(...f)), mutations: muts };
  });
  console.log(process.argv[2], css || '(none)', JSON.stringify(r));
  await b.close();
})();
