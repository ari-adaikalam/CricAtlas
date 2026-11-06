(function(){
 window.__res=[]; window.__done=false;
 var all=[...document.querySelectorAll('.pgx button')]; var rec=all.filter(b=>b.textContent.trim()==='Records').pop(); var grp=[...rec.parentElement.children];
 var btn={bat:grp[0],bowl:grp[1],rec:grp[2],stats:grp[3]}; var pane={bat:'#p-bat',bowl:'#p-bowl',rec:'#p-rec',stats:'#p-stats'};
 var seq=['bowl','rec','stats','rec','bowl','bat','stats','bat','rec','stats','bowl','stats','rec','bat','bowl'];
 var cur=null; function activeName(){ for (var k in pane){ var p=document.querySelector(pane[k]); if(p&&!p.classList.contains('held')&&getComputedStyle(p).display!=='none'&&getComputedStyle(p).visibility!=='hidden') return k;} return null; }
 var i=0;
 function step(){
  if(i>=seq.length){ window.__done=true; return; }
  var to=seq[i], from=activeName(); var n=i; i++;
  // scroll the row we leave to a varied tile first
  var fp=document.querySelector(pane[from]); var fc=fp&&fp.querySelector('.car'); if(fc&&n%2===0){ var tl=[...fc.children].filter(t=>t.classList.contains('tile')); var k=(n%5)+1; if(tl[k]){ fc.style.scrollBehavior='auto'; fc.scrollLeft=tl[k].offsetLeft-60; } }
  setTimeout(function(){
   var np=document.querySelector(pane[to]); var car0=np&&np.querySelector('.car'); var sc0=car0?Math.round(car0.scrollLeft):null;
   var t0=performance.now(), issues=[], maxOpGap=0, frames=0;
   btn[to].click();
   (function f(){
     var t=performance.now()-t0; frames++;
     var p=document.querySelector(pane[to]); var car=p&&p.querySelector('.car');
     if(car&&t>60){
       if(sc0!==null && Math.abs(car.scrollLeft-sc0)>2 && issues.indexOf('scrollJump')<0) issues.push('scrollJump '+sc0+'->'+Math.round(car.scrollLeft)+'@'+Math.round(t));
       if(t>500){ var b=car.getBoundingClientRect(); [...car.children].filter(x=>x.classList.contains('tile')).forEach(function(tile,ti){ var r=tile.getBoundingClientRect(); var inside=r.left>=b.left-1&&r.right<=b.right+1&&r.right>0&&r.left<innerWidth; var op=+getComputedStyle(tile).opacity; if(inside&&op<0.99&&t>900){ var key='hiddenTile'+ti; if(issues.indexOf(key)<0) issues.push(key+' op'+op.toFixed(2)+'@'+Math.round(t)); } }); }
     }
     if(t<2300) requestAnimationFrame(f); else {
       var g=document.querySelectorAll('.pane.ghost').length; var p2=document.querySelector(pane[to]); var c2=p2&&p2.querySelector('.car'); var bad=0; if(c2){ [...c2.children].filter(x=>x.classList.contains('tile')).forEach(function(tile){ var r=tile.getBoundingClientRect(); if(r.right>0&&r.left<innerWidth&&+getComputedStyle(tile).opacity<0.99) bad++; }); }
       if(g) issues.push('ghostLeft '+g); if(bad) issues.push('endDimTiles '+bad);
       window.__res.push((from+'->'+to)+' frames'+frames+' '+(issues.length?issues.join('; '):'ok'));
       setTimeout(step,500);
     }
   })();
  },700);
 }
 step(); return 'running';
})()
