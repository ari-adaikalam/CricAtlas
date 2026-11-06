// Opens every chip of every Full stats tile on both sides for a player and prints the tables, rows, notes and any loader or bad value (NaN, undefined) it finds, then the console errors.
// Run:  PLAYWRIGHT_CORE=<path to playwright-core> node scripts/perf/fullstats-sweep.cjs "ba607b88?format=INTERNATIONAL&view=stats" Batting,Bowling   (the app and the data server must be running)
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async()=>{
 const url=process.argv[2], kinds=(process.argv[3]||'Batting,Bowling').split(',');
 const b=await webkit.launch(); const page=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
 const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160))}); page.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 await page.goto('http://localhost:3100/players/'+url); await page.waitForTimeout(9000);
 for (const kind of kinds){
  await page.locator('#p-stats .sbar button',{hasText:new RegExp('^'+kind+'$')}).click().catch(()=>{}); await page.waitForTimeout(1500);
  const n=await page.locator('#p-stats .car > .tile').count();
  for (let t=0;t<n;t++){
   const tile=page.locator('#p-stats .car > .tile').nth(t);
   await tile.scrollIntoViewIfNeeded().catch(()=>{});
   await page.evaluate((t)=>{const car=document.querySelector('#p-stats .car');car.style.scrollBehavior='auto';car.scrollLeft=[...car.children][t].offsetLeft-60},t); await page.waitForTimeout(900);
   const buttons=tile.locator('h4 .msw button'); const bc=await buttons.count();
   for (let o=0;o<Math.max(1,bc);o++){
    if(bc) await buttons.nth(o).click(); await page.waitForTimeout(1300);
    const info=await tile.evaluate((el)=>{const body=el.querySelector('.fsb');const txt=body?body.innerText:'';return {tables:body?body.querySelectorAll('table').length:0,rows:body?body.querySelectorAll('tbody tr').length:0,loader:!!el.querySelector('[role=status]'),bad:/NaN|undefined|Infinity|null/.test(txt),thin:(body&&body.querySelector('.thin'))?body.querySelector('.thin').textContent.slice(0,70):''}});
    const name=bc?await buttons.nth(o).textContent():'-';
    console.log(kind.padEnd(7),String(t+1)+'.',name.padEnd(20),'tables',info.tables,'rows',String(info.rows).padEnd(4),info.loader?'LOADER ':'',info.bad?'BAD-TEXT ':'',info.thin);
   }
  }
 }
 console.log('errors',JSON.stringify(errs.slice(0,6)));
 await b.close();})();
