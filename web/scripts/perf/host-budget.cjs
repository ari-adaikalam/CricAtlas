// The hosted-site budget: cold and warm visits to the live site, time until the page has its content, requests and bytes, and the data host's Cloudflare cache status (H hit, M miss, D dynamic). BASE=<url> to test another address, THROTTLE=1 for 60 ms latency and 20 Mbit. Run:  PLAYWRIGHT_CORE=<path> node scripts/perf/host-budget.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const BASE = process.env.BASE || 'https://cricatlas.ariadaikalam.com';
const THROTTLE = process.env.THROTTLE === '1';
const PAGES = [['home',''],['players root','players'],['Kohli','players/v-kohli-ba607b88'],['Bumrah','players/jj-bumrah-462411b3'],['India','teams/india~intl~male'],['IPL','tournaments/ipl'],['match T20','matches/1490706'],['match Test','matches/1187007'],['compare players','compare/players?a=ba607b88&b=3fb19989'],['api','api']];
const ready = () => { const h = document.querySelector('.pgx .sum h1, .pgx h1, h1'); const loading = document.querySelector('[data-page-loader]'); return h && h.textContent.trim().length > 1 && !loading && !document.body.classList.contains('loading'); };
(async()=>{const b=await chromium.launch();const rows=[];
for(const [name,u] of PAGES){for(const warm of [false,true]){
  const ctx=await b.newContext({viewport:{width:1352,height:700}});const pg=await ctx.newPage();const cdp=await ctx.newCDPSession(pg);
  await cdp.send('Network.enable');
  if(THROTTLE)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:20e6/8,uploadThroughput:20e6/8});
  if(warm){await pg.goto(`${BASE}/${u}`);await pg.waitForFunction(ready,null,{timeout:30000});await pg.waitForTimeout(2500);}
  const reqs=new Map();const stat={};let bytes=0,n=0,dbytes=0,dn=0,hit=0,miss=0,dyn=0,other=0;
  cdp.on('Network.responseReceived',e=>{reqs.set(e.requestId,{url:e.response.url,h:e.response.headers,fromCache:e.response.fromDiskCache||e.response.fromServiceWorker})});
  cdp.on('Network.loadingFinished',e=>{const r=reqs.get(e.requestId);if(!r)return;n++;bytes+=e.encodedDataLength;if(r.url.includes('cricatlas-data')){dn++;dbytes+=e.encodedDataLength;const c=(r.h['cf-cache-status']||'').toUpperCase();if(c==='HIT')hit++;else if(c==='MISS')miss++;else if(c==='DYNAMIC')dyn++;else other++;}});
  if(warm){await pg.reload({waitUntil:'commit'});}
  const t0=Date.now();if(!warm)await pg.goto(`${BASE}/${u}`,{waitUntil:'commit'});
  await pg.waitForFunction(ready,null,{timeout:30000});const t=Date.now()-t0;
  await pg.waitForTimeout(3000);
  rows.push({page:name,visit:warm?'warm':'cold',ms:t,reqs:n,kb:Math.round(bytes/1024),dataReqs:dn,dataKb:Math.round(dbytes/1024),cf:`${hit}H/${miss}M/${dyn}D`});
  await ctx.close();}}
console.table(rows);await b.close()})();
