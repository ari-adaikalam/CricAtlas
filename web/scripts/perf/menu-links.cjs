// A link in the top bar's hover menu to another address of the same section (a player to a player, a team to a team, a match to a match, a tournament to a tournament) shows that page,
// not the one that was open. It was broken by the shared page for every address (src/components/useAddressShell.tsx), and the URL changed while the content stayed. Run:
//   BASE=<url> PLAYWRIGHT_CORE=<path> node scripts/perf/menu-links.cjs     (default http://localhost:3100)
const { chromium } = require(process.env.PLAYWRIGHT_CORE);
const BASE=process.env.BASE||'http://localhost:3100';
(async()=>{const b=await chromium.launch();const pg=await (await b.newContext({viewport:{width:1352,height:760}})).newPage();
const snap=()=>pg.evaluate(()=>location.pathname+' | '+((document.querySelector('.pgx h1, h1')||{}).textContent||'').slice(0,45));
for(const [start,menu,k] of [['/tournaments/ipl','Tournaments',3],['/players/v-kohli-ba607b88','Players',0],['/teams/india~intl~male','Teams',1],['/matches/1490706','Matches',2]]){
  await pg.goto(BASE+start);await pg.waitForTimeout(5000);
  console.log('==',menu,'start',await snap());
  for(const i of [0,1]){
    const nmi=pg.locator('.nmi:visible').nth(k);
    await pg.mouse.move(700,400);await pg.waitForTimeout(300);
    await nmi.hover();
    try{await nmi.locator('.nmp.on a').first().waitFor({timeout:12000})}catch{console.log('  menu did not open');break}
    const link=nmi.locator('.nmp.on a:not(.all)').nth(i);const label=(await link.innerText()).trim();const href=await link.getAttribute('href');
    await link.click();await pg.waitForTimeout(4500);
    console.log('  click',JSON.stringify(label),href,'=>',await snap());
  }
}
await b.close()})();
