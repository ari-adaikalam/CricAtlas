// Resident memory of the whole browser process tree for a blank tab, Kohli's profile with the engine file blocked, with it allowed, and with Batting open.
// Run with `next start -p 3200` and the data server on 8788:  node scripts/perf/engine-memory.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { execSync } = require('child_process');
function rssOf(rootPid){ const rows=execSync('ps -axo pid=,ppid=,rss=').toString().trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number)); const kids=new Map(); rows.forEach(([p,pp])=>{ if(!kids.has(pp)) kids.set(pp,[]); kids.get(pp).push(p); }); const own=new Map(rows.map(([p,pp,r])=>[p,r])); let tot=0; const st=[rootPid], seen=new Set(); while(st.length){ const p=st.pop(); if(seen.has(p)) continue; seen.add(p); tot+=own.get(p)||0; (kids.get(p)||[]).forEach(c=>st.push(c)); } return Math.round(tot/1024); }
(async()=>{
 for (const [name,block,wait,view] of [['blank tab',null,0,false],['profile, engine file blocked',true,8000,false],['profile, engine allowed (8 s)',false,8000,false],['Batting open, engine allowed',false,9000,true]]) {
  const tag='memtag'+Date.now(); const b=await chromium.launch({args:['--'+tag+'=1']}); const pid=Number(execSync(`ps -axo pid=,command= | grep -- '--${tag}=1' | grep -v grep | head -1`).toString().trim().split(/\s+/)[0]);
  const ctx=await b.newContext({viewport:{width:1440,height:900}}); const page=await ctx.newPage();
  if(block) await page.route('**/*.wasm',r=>r.abort());
  if(name!=='blank tab'){ await page.goto('http://localhost:3200/players/ba607b88?format=ODI'); await page.waitForSelector('text=V Kohli'); }
  await page.waitForTimeout(wait||800);
  if(view){ await page.getByRole('button',{name:'Batting analysis'}).first().click(); await page.waitForTimeout(9000); }
  console.log(name+': '+rssOf(pid)+' MB');
  await b.close(); await new Promise(r=>setTimeout(r,800));
 }})();
