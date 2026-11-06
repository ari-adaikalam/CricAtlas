// Safari: every view to view switch on the Team page, with the leaving row scrolled to varied tiles, then rapid clicks. Run on a team page in Safari:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<this file>" as «class utf8») in current tab of front window'
// then read window.__res and window.__res2 once window.__done and window.__done2 are true. Every line must end in ok.
(function () {
  window.__res = []; window.__done = false; window.__res2 = []; window.__done2 = false;
  var names = { res: 'Results', ply: 'Players', bbf: 'Bat, bowl, field' }, pane = { res: '#p-res', ply: '#p-ply', bbf: '#p-bbf' };
  function btn(k) { return [].slice.call(document.querySelectorAll('#vsw button')).filter(function (b) { return b.textContent.trim() === names[k]; })[0]; }
  function activeName() { for (var k in pane) { var p = document.querySelector(pane[k]); if (p && !p.classList.contains('held') && getComputedStyle(p).display !== 'none' && getComputedStyle(p).visibility !== 'hidden') return k; } return null; }
  // The first visits come first (a view not opened yet is built fresh), then revisits (kept views), the last stretch with the row scrolled to varied tiles.
  var seq = ['ply', 'bbf', 'res', 'bbf', 'ply', 'res', 'ply', 'bbf', 'res', 'bbf', 'ply', 'bbf', 'res', 'ply', 'res'];
  var i = 0;
  function tiles(car) { return [].slice.call(car.children).filter(function (x) { return x.classList.contains('tile'); }); }
  function step() {
    if (i >= seq.length) { window.__done = true; return; }
    var to = seq[i], from = activeName(), n = i; i++;
    if (!from || from === to) { setTimeout(step, 50); return; }
    var fp = document.querySelector(pane[from]), fc = fp && fp.querySelector('.car');
    if (fc && n % 2 === 0) { var tl = tiles(fc), k = (n % 4) + 1; if (tl[k]) { fc.style.scrollBehavior = 'auto'; fc.scrollLeft = tl[k].offsetLeft - 60; } }
    setTimeout(function () {
      // The tiles that fill the leaving row's screen: they must leave whole and at full strength.
      var fb = fc.getBoundingClientRect(), full = tiles(fc).filter(function (t) { var r = t.getBoundingClientRect(); return r.left >= fb.left - 1 && r.right <= fb.right + 1; }).map(function (t) { return t.dataset.tile; });
      var np = document.querySelector(pane[to]), car0 = np && np.querySelector('.car'), sc0 = car0 ? Math.round(car0.scrollLeft) : null;
      var t0 = performance.now(), issues = [], frames = 0, checked = false;
      btn(to).click();
      (function f() {
        var t = performance.now() - t0; frames++;
        if (!checked && t > 100) {
          checked = true;
          var g = document.querySelector('.pane.ghost');
          if (!g) issues.push('noLeavingCopy');
          else [].slice.call(g.querySelectorAll('.car > .tile')).forEach(function (tile) { if (full.indexOf(tile.dataset.tile) >= 0 && (tile.hasAttribute('data-peek') || +getComputedStyle(tile).opacity < 0.95)) issues.push('leavingTileFaded ' + tile.dataset.tile); });
        }
        var p = document.querySelector(pane[to]), car = p && p.querySelector('.car');
        if (car && t > 60) {
          if (sc0 !== null && Math.abs(car.scrollLeft - sc0) > 2 && issues.indexOf('scrollJump') < 0) issues.push('scrollJump ' + sc0 + '->' + Math.round(car.scrollLeft) + '@' + Math.round(t));
        }
        if (t < 2300) requestAnimationFrame(f); else {
          var gh = document.querySelectorAll('.pane.ghost').length, p2 = document.querySelector(pane[to]), c2 = p2 && p2.querySelector('.car'), bad = 0, empty = 0;
          if (c2) tiles(c2).forEach(function (tile) { var r = tile.getBoundingClientRect(); if (r.right > 0 && r.left < innerWidth) { if (+getComputedStyle(tile).opacity < 0.99) bad++; if (tile.innerText.trim().length < 20) empty++; } });
          if (gh) issues.push('ghostLeft ' + gh); if (bad) issues.push('endDimTiles ' + bad); if (empty) issues.push('emptyTiles ' + empty);
          window.__res.push(from + '->' + to + ' frames' + frames + ' ' + (issues.length ? issues.join('; ') : 'ok'));
          setTimeout(step, 500);
        }
      })();
    }, 700);
  }
  step();
  // Rapid clicks: three switches 40 ms apart, then everything must settle on the last one with no copy left behind.
  window.__rapid = function () {
    var order = ['res', 'ply', 'bbf', 'res', 'bbf', 'ply'], j = 0;
    (function go() { if (j < order.length) { btn(order[j]).click(); j++; setTimeout(go, 40); } else setTimeout(function () {
      var want = 'ply', now = activeName(), gh = document.querySelectorAll('.pane.ghost').length, cars = document.querySelector(pane[now] + ' .car'), dim = 0;
      if (cars) tiles(cars).forEach(function (tile) { var r = tile.getBoundingClientRect(); if (r.right > 0 && r.left < innerWidth && +getComputedStyle(tile).opacity < 0.99) dim++; });
      window.__res2.push('rapid clicks end on ' + now + (now === want ? '' : ' (wanted ' + want + ')') + ', ghosts ' + gh + ', dim tiles ' + dim + ' ' + (now === want && !gh && !dim ? 'ok' : 'FAILED'));
      window.__done2 = true;
    }, 3000); })();
  };
  return 'running';
})()
