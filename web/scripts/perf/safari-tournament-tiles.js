// Safari: every tile of every view of the Tournament page, one stop at a time: the tile has content, no NaN or undefined text, nothing passes the tile's bottom or right edge, and the Change tournament box opens. Run like safari-tournament-slides.js; read window.__tiles once window.__tdone is true. Every line must end in ok.
(function () {
  window.__tiles = []; window.__tdone = false;
  var views = [['ov', 'Overview'], ['ply', 'Players'], ['tm', 'Teams and matches']];
  var BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
  var vi = 0, ti = 0, ids = [];
  function btn(name) { return [].slice.call(document.querySelectorAll('#vsw button')).filter(function (b) { return b.textContent.trim() === name; })[0]; }
  function nextView() {
    if (vi >= views.length) return changeTeam();
    var v = views[vi][0]; btn(views[vi][1]).click(); ti = 0;
    setTimeout(function () { ids = [].slice.call(document.querySelectorAll('#p-' + v + ' .car > .tile')).map(function (t) { return t.dataset.tile; }); nextTile(); }, 1800);
  }
  function nextTile() {
    var v = views[vi][0];
    if (ti >= ids.length) { vi++; return nextView(); }
    var nds = document.querySelectorAll('#p-' + v + ' .nd'); if (nds[ti]) nds[ti].click();
    var id = ids[ti]; ti++;
    setTimeout(function () {
      var tile = document.querySelector('#p-' + v + ' .car > .tile[data-tile="' + id + '"]'), issues = [];
      if (!tile) issues.push('missing');
      else {
        var r = tile.getBoundingClientRect(), text = tile.innerText.trim();
        if (text.length < 20) issues.push('empty');
        if (BAD.test(text)) issues.push('text ' + text.match(BAD)[0]);
        var over = 0;
        [].slice.call(tile.querySelectorAll('.kn, .bcr, .tpr, .phc, .kc, .trr, .msr, tr, .hbr')).forEach(function (e) {
          var b = e.getBoundingClientRect(); if (b.height === 0) return;
          // Rows inside a box that clips or scrolls them (a list under a fixed heading) are not passing the tile; the box itself must stay inside it.
          var clip = null; for (var a = e.parentElement; a && a !== tile; a = a.parentElement) { var o = getComputedStyle(a); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') { clip = a; break; } }
          var box = clip ? clip.getBoundingClientRect() : b;
          if (box.bottom > r.bottom + 2 || box.right > r.right + 2) over++;
        });
        if (over) issues.push('passesEdge ' + over);
        if (+getComputedStyle(tile).opacity < 0.99) issues.push('dim');
      }
      window.__tiles.push(views[vi][0] + '/' + id + ' ' + (issues.length ? issues.join('; ') : 'ok'));
      nextTile();
    }, 1400);
  }
  function changeTeam() {
    var open = document.querySelector('.top .tchg .mini'); if (open) open.click();
    setTimeout(function () {
      var box = document.querySelector('.top .srch input, .top .tchg input');
      window.__tiles.push('change tournament: search box ' + (box ? 'open' : 'missing') + ' ' + (box ? 'ok' : 'FAILED'));
      window.__tdone = true;
    }, 1200);
  }
  nextView();
  return 'running';
})()
