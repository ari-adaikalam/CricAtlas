// The tile peeking at the right edge of a view that was just opened must not have played. Run in Safari through osascript after:
//   open a player's profile, click Batting analysis, wait 5 s, click Bowling analysis in the top bar, wait 3.5 s. Then run this; replace #p-bowl with #p-bat to check a kept view.
// Tile 3 (about 6% visible) must say played=no. It said yes when held slivers were measured against the sliding row (2026-10-20).
(function(){ var car=document.querySelector('#p-bowl .car'); if(!car) return 'no bowl pane'; var box=car.getBoundingClientRect();
 return [...car.children].filter(t=>t.classList.contains('tile')).slice(0,5).map(function(t,i){ var r=t.getBoundingClientRect(); var vis=Math.max(0,Math.min(r.right,box.right)-Math.max(r.left,box.left))/r.width;
   var played=t.querySelector('svg.play, .play, [data-played="true"]');
   return (i+1)+' '+t.dataset.tile+' visible '+Math.round(vis*100)+'% played='+(played?'yes':'no'); }).join(' | '); })()
