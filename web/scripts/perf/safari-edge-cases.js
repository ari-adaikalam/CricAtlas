(function(){
 window.__res2=[]; window.__done2=false;
 var q=(t)=>[...document.querySelectorAll('.pgx button')].filter(b=>b.textContent.trim()===t);
 var rec=q('Records').pop(); var grp=[...rec.parentElement.children]; var btn={bat:grp[0],bowl:grp[1],rec:grp[2],stats:grp[3]};
 var profile=q('Profile').pop();
 function check(label,cb){ setTimeout(function(){
   var ghosts=document.querySelectorAll('.pane.ghost').length; var issues=[]; if(ghosts) issues.push('ghostLeft '+ghosts);
   var cars=[...document.querySelectorAll('.pane .car')].filter(c=>!c.closest('.held')&&!c.closest('.ghost')&&c.getBoundingClientRect().width>0);
   cars.forEach(function(c){ var b=c.getBoundingClientRect(); var dim=0, off=0; [...c.children].filter(x=>x.classList.contains('tile')).forEach(function(t){ var r=t.getBoundingClientRect(); if(r.right>0&&r.left<innerWidth){ if(+getComputedStyle(t).opacity<0.99) dim++; if(Math.abs((+getComputedStyle(t).transform.split(',')[4]||0))>1) off++; } }); if(dim) issues.push('dimTiles '+dim); if(off) issues.push('movedTiles '+off); if(Math.abs(b.left)>1) issues.push('rowOffset '+Math.round(b.left)); });
   window.__res2.push(label+' : '+(issues.length?issues.join('; '):'ok')); cb(); },2600); }
 var steps=[
  ['rapid bat->bowl->rec (200ms)', function(n){ btn.bat.click(); setTimeout(function(){btn.bowl.click(); setTimeout(function(){btn.rec.click();},200);},200); }],
  ['rapid rec->stats->bat->bowl (150ms)', function(n){ btn.stats.click(); setTimeout(function(){btn.bat.click(); setTimeout(function(){btn.bowl.click();},150);},150); }],
  ['double click same view', function(n){ btn.rec.click(); setTimeout(function(){btn.rec.click();},100); }],
  ['view->profile', function(n){ profile.click(); }],
  ['profile->view (bat)', function(n){ var b=q('Batting analysis')[0]||q('Batting')[0]; b.click(); }],
  ['bat->bowl then back mid-slide (250ms)', function(n){ btn.bowl.click(); setTimeout(function(){btn.bat.click();},250); }],
  ['stats chips after slide', function(n){ btn.stats.click(); }],
  ['bowl->rec->stats rapid x6', function(n){ var o=[btn.bowl,btn.rec,btn.stats,btn.bat,btn.rec,btn.bowl]; o.forEach(function(b,k){ setTimeout(function(){b.click();},k*120); }); }]
 ];
 var i=0; function next(){ if(i>=steps.length){ window.__done2=true; return; } var s=steps[i++]; s[1](); check(s[0],next); }
 setTimeout(next,300); return 'running2';
})()
