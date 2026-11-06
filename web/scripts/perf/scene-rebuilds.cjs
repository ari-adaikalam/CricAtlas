// Counts how often the wagon wheel's canvas is removed and re-created, and how many WebGL contexts are made, across three phase changes.
// Run with the dev server on 3100 and the data server on 8788:  node scripts/perf/scene-rebuilds.cjs   (for the pitch map: Bowling analysis, tile 'pitch', Bumrah 462411b3)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}); const page=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
 await page.addInitScript(()=>{ window.__ctx=0; const g=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(t,...a){ if(/webgl/.test(t)) window.__ctx++; return g.call(this,t,...a); }; });
 await page.goto('http://localhost:3100/players/ba607b88?format=ODI'); await page.waitForTimeout(6000); await page.getByRole('button',{name:'Batting analysis'}).first().click(); await page.waitForTimeout(5000);
 await page.evaluate(()=>{const car=document.querySelector('#p-bat .car');car.style.scrollBehavior='auto';const t=[...car.children].filter(x=>x.dataset&&x.dataset.tile==='wagon')[0]; car.scrollLeft=t.offsetLeft-60;}); await page.waitForTimeout(6000);
 const state=()=>page.evaluate(()=>{const t=document.querySelector('#p-bat [data-tile="wagon"]'); return {contexts:window.__ctx, canvases:t.querySelectorAll('canvas').length, loader:!!t.querySelector('[role="status"]')}});
 console.log('after open', JSON.stringify(await state()));
 await page.evaluate(()=>{ window.__ev=[]; const t=document.querySelector('#p-bat [data-tile="wagon"]'); const t0=performance.now(); new MutationObserver(ms=>{ for(const m of ms){ m.addedNodes.forEach(n=>{ if(n.nodeType===1&&(n.tagName==='CANVAS'||n.querySelector&&n.querySelector('canvas'))) window.__ev.push(Math.round(performance.now()-t0)+' canvas added'); if(n.nodeType===1&&n.getAttribute&&n.getAttribute('role')==='status') window.__ev.push(Math.round(performance.now()-t0)+' loader shown'); }); m.removedNodes.forEach(n=>{ if(n.nodeType===1&&(n.tagName==='CANVAS'||n.querySelector&&n.querySelector('canvas'))) window.__ev.push(Math.round(performance.now()-t0)+' canvas REMOVED'); }); } }).observe(t,{childList:true,subtree:true}); });
 const sel=page.locator('.bfbar select[aria-label="Phase"]');
 for (const v of ['powerplay','middle','death']) { await sel.selectOption(v); await page.waitForTimeout(3500); console.log('phase',v, JSON.stringify(await state())); }
 console.log('events', JSON.stringify(await page.evaluate(()=>window.__ev)));
 await b.close(); })();
