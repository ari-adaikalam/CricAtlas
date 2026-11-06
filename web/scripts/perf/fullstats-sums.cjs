// Checks that every Full stats table adds up: the Runs (Wkts) and Inns columns of the rows equal the Career row, for the tiles that use the standard columns.
// Run:  PLAYWRIGHT_CORE=<path to playwright-core> node scripts/perf/fullstats-sums.cjs "ba607b88?format=INTERNATIONAL&view=stats"   It prints only the tables that do not add up (none is the pass). A table drawn a window at a time is skipped, since only its window is in the page.
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async()=>{
 const url=process.argv[2];
 const b=await webkit.launch(); const page=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
 await page.goto('http://localhost:3100/players/'+url); await page.waitForTimeout(9000);
 for (const kind of ['Batting','Bowling']){
  await page.locator('#p-stats .sbar button',{hasText:new RegExp('^'+kind+'$')}).click().catch(()=>{}); await page.waitForTimeout(1500);
  const col=kind==='Batting'?'Runs':'Wkts';
  const n=await page.locator('#p-stats .car > .tile').count();
  for (let t=0;t<4;t++){
   const tile=page.locator('#p-stats .car > .tile').nth(t);
   await page.evaluate((t)=>{const car=document.querySelector('#p-stats .car');car.style.scrollBehavior='auto';car.scrollLeft=[...car.children][t].offsetLeft-60},t); await page.waitForTimeout(900);
   const buttons=tile.locator('h4 .msw button'); const bc=await buttons.count();
   for (let o=0;o<bc;o++){ await buttons.nth(o).click(); await page.waitForTimeout(1500);
    const res=await tile.evaluate((el,col)=>{const out=[];el.querySelectorAll('table.fst').forEach(tb=>{const heads=[...tb.querySelectorAll('thead th')].map(h=>h.textContent.replace(/[▲▼ ]/g,''));const idx=heads.indexOf(col), inns=heads.indexOf('Inns');if(idx<0||tb.querySelector('tr[data-spacer]'))return;const num=(td)=>Number((td.innerText||'').replace(/,/g,''));let sumR=0,sumI=0;tb.querySelectorAll('tbody tr:not([data-spacer])').forEach(tr=>{const tds=tr.querySelectorAll('td');if(tds.length>idx){sumR+=num(tds[idx]);sumI+=num(tds[inns]);}});const foot=tb.querySelectorAll('tfoot td');out.push({title:tb.previousElementSibling?.previousElementSibling?.textContent||tb.closest('.fsc')?.querySelector('.sub')?.textContent||'',rows:sumR,careerR:num(foot[idx]),innsRows:sumI,careerI:num(foot[inns])})});return out},col);
    for (const r of res){ const okR=r.rows===r.careerR, okI=r.innsRows===r.careerI; if(!okR||!okI) console.log(kind,'tile',t+1,'option',o+1,JSON.stringify(r)); }
   }
  }
 }
 console.log('done');
 await b.close();})();
