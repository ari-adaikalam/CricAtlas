// How long a loading ball is on screen after opening a view and after a phase change, at normal and slowed CPU, on a production build.
// Run with `next start -p 3200` and the data server on 8788:  node scripts/perf/loading-ball.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async()=>{
 const b=await chromium.launch({args:['--enable-precise-memory-info']});
 for (const rate of [1,4,6]) {
  const ctx=await b.newContext({viewport:{width:1440,height:900}}); const page=await ctx.newPage();
  const cdp=await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:20*1024*1024/8,uploadThroughput:5*1024*1024/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  const t0=Date.now(); await page.goto('http://localhost:3200/players/ba607b88?format=ODI'); await page.waitForSelector('text=V Kohli',{timeout:90000}); const tProfile=Date.now()-t0;
  // generic probe: run an action in the page and log loaders every frame for `ms`
  const probe=(action,ms)=>page.evaluate(([action,ms])=>new Promise(res=>{
    const L=()=>[...document.querySelectorAll('[role="status"]')].filter(e=>/loading$/.test(e.getAttribute('aria-label')||'')&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().right>0&&e.getBoundingClientRect().left<innerWidth);
    const start=performance.now(); let first=null,last=null,maxN=0,frames=0,slow=0,prev=start;
    const act=new Function('return ('+action+')')(); act();
    (function f(){ const t=performance.now()-start; frames++; if(performance.now()-prev>50) slow++; prev=performance.now(); const n=L().length; if(n>0){ if(first===null) first=t; last=t; maxN=Math.max(maxN,n);} if(t<ms) requestAnimationFrame(f); else res({first:first&&Math.round(first),last:last&&Math.round(last),maxN,slowFrames:slow,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}); })();
  }),[action,ms]);
  const view=await probe(`()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batting analysis').click()}`,6000);
  const out=[]; 
  for (const v of ['powerplay','middle','death']) {
    out.push(v+' '+JSON.stringify(await probe(`()=>{const s=document.querySelector('.bfbar select[aria-label=\"Phase\"]'); const o=[...s.options].find(x=>x.value==='${v}'); if(o){s.value='${v}'; s.dispatchEvent(new Event('change',{bubbles:true}));}}`,5000)));
  }
  console.log(`CPU x${rate}: profile on screen ${tProfile} ms\n  open Batting: ${JSON.stringify(view)}\n  `+out.join('\n  '));
  await ctx.close();
 }
 await b.close();})();
