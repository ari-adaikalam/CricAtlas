// Safari: every tile of every view of the Team page, one stop at a time: the tile has content, no NaN or undefined text, nothing passes the tile's bottom or right edge, and the Change team box opens with its
// chips. Run like safari-team-slides.js; read window.__tiles once window.__tdone is true. Every line must end in ok.
(function () {
  window.__tiles = []; window.__tdone = false;
  var views = [['res', 'Results'], ['ply', 'Players'], ['bbf', 'Bat, bowl, field']];
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
          var scroller = e.closest('.tsc, .ugrid, .mtl, .kos, .trg, .tw'); if (scroller) return;
          if (b.bottom > r.bottom + 2 || b.right > r.right + 2) over++;
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
      var chips = document.querySelectorAll('.rcomp button').length, gender = document.querySelectorAll('.rgen button').length, sep = !!document.querySelector('.rsep');
      var emblems = [].slice.call(document.querySelectorAll('.res.mres a .tem svg')).filter(function (s) { var b = s.getBoundingClientRect(); return b.width > 10 && getComputedStyle(s).position !== 'absolute'; }).length;
      var arrow = !!document.querySelector('.rarr.r');
      window.__tiles.push('change team: ' + chips + ' chips, ' + gender + ' gender buttons, divider ' + sep + ', emblems in the list ' + emblems + ', more-arrow ' + arrow + ' ' + (chips >= 8 && gender === 3 && sep && emblems > 3 ? 'ok' : 'FAILED'));
      window.__tdone = true;
    }, 1200);
  }
  nextView();
  return 'running';
})()
