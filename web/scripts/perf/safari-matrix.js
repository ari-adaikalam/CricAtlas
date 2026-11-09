// The invariants and the interaction matrix of a player page. Run in Safari through osascript with the profile of a player open (Safari, Developer,
// Allow JavaScript from Apple Events):
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<path>/safari-matrix.js" as «class utf8») in current tab of front window'
// then read window.__matrix.done and window.__matrix.report when done is true. It takes about three minutes. Every step must end in ok.
//
// After every step the page settles for 3.2 s and these must hold, whatever the step was:
//   console: no error or warning was logged during the step
//   played early: no tile has played its animation without having been at least 15% on screen
//   loading: no skeleton or loader is still showing
//   dimmed: no row is still dimmed (data-stale)
//   leftover layer: no copy of the leaving view is still in the page
//   text: no NaN, undefined, Infinity or [object in a tile on screen
//   row offset: the row of the active view sits at the left edge of its pane
//   displaced: no tile on screen is still moved by a transform
//   faded: no tile on screen is below full opacity
//   moved after settle: no tile on screen moves, resizes or changes after the page has settled
// A step that does not apply to the player says skipped and why (a player with one format has no format change); it is not a pass. A violation is a bug even when the step was not about it. Add an invariant here when a bug is found that none of them caught.
(function () {
  var M = window.__matrix = { done: false, report: [], visited: new WeakSet(), cons: [], step: 'setup' };
  var original = { error: console.error, warn: console.warn };
  console.error = function () { M.cons.push(M.step + ': ' + [].slice.call(arguments).join(' ').slice(0, 160)); original.error.apply(console, arguments); };
  console.warn = function () { M.cons.push(M.step + ': warn ' + [].slice.call(arguments).join(' ').slice(0, 160)); original.warn.apply(console, arguments); };

  // A tile counts as visited once 15% of it has been on screen. Tiles are watched as they appear.
  var seen = new WeakSet();
  var io = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.intersectionRatio >= 0.15) M.visited.add(e.target); }); }, { threshold: [0.15, 0.3, 0.6, 1] });
  function watch() { document.querySelectorAll('.car > .tile').forEach(function (t) { if (!seen.has(t)) { seen.add(t); io.observe(t); } }); }
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true }); watch();

  var PLAYED = 'svg.play, .play, [data-played="true"]';
  var BAD = /NaN|undefined|Infinity|\[object/;
  function activePane() { return [].slice.call(document.querySelectorAll('.pane')).filter(function (p) { return !p.classList.contains('held') && !p.classList.contains('ghost') && getComputedStyle(p).display !== 'none'; })[0]; }
  function onScreen(car) { var box = car.getBoundingClientRect(); return [].slice.call(car.children).filter(function (t) { if (!t.classList.contains('tile')) return false; var r = t.getBoundingClientRect(); return Math.min(r.right, box.right) - Math.max(r.left, box.left) > r.width * 0.2; }); }
  function snapshot(tiles) { return tiles.map(function (t) { var r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); }).join('|'); }

  function check(label, after) {
    var bad = [];
    if (M.cons.length) { bad.push('console ' + M.cons.slice(0, 2).join(' / ')); M.cons = []; }
    var pane = activePane(), car = pane && pane.querySelector('.car');
    [].slice.call(document.querySelectorAll('.car > .tile')).forEach(function (t) { if (!M.visited.has(t) && t.querySelector(PLAYED)) bad.push('played early: ' + (t.closest('.pane') || {}).id + ' ' + t.dataset.tile); });
    if (document.querySelectorAll('.pane.ghost').length) bad.push('leftover layer');
    if (car) {
      var shown = onScreen(car);
      var loaders = [].slice.call(car.querySelectorAll('[role="status"]')).filter(function (e) { return /loading$/.test(e.getAttribute('aria-label') || '') && shown.some(function (t) { return t.contains(e); }); });
      if (loaders.length) bad.push('loading: ' + loaders.map(function (e) { return e.getAttribute('aria-label'); }).join(', '));
      if (car.hasAttribute('data-stale')) bad.push('dimmed');
      shown.forEach(function (t) {
        if (BAD.test(t.innerText)) bad.push('text in ' + t.dataset.tile + ': ' + t.innerText.match(BAD)[0]);
        if (getComputedStyle(t).transform !== 'none') bad.push('displaced: ' + t.dataset.tile);
        if (+getComputedStyle(t).opacity < 0.99) bad.push('faded: ' + t.dataset.tile);
      });
      if (Math.abs(car.getBoundingClientRect().left - pane.getBoundingClientRect().left) > 1) bad.push('row offset ' + Math.round(car.getBoundingClientRect().left));
      var before = snapshot(shown);
      setTimeout(function () { var again = onScreen(car); if (snapshot(again) !== before) bad.push('moved after settle'); after(bad); }, 700);
      return;
    }
    after(bad);
  }

  var top = function (label) { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { var r = b.getBoundingClientRect(); return b.textContent.trim() === label && r.top > 0 && r.top < 100; })[0]; };
  var profileBtn = function (label) { return [].slice.call(document.querySelectorAll('.pgx button')).filter(function (b) { return b.textContent.trim() === label; })[0]; };
  var click = function (el) { if (!el) throw new Error('button not found'); el.click(); };
  var node = function (re) { return [].slice.call(document.querySelectorAll('.nd')).filter(function (b) { return re.test(b.getAttribute('aria-label') || '') && b.getBoundingClientRect().width > 0; })[0]; };
  var arrow = function (dir) { return document.querySelector('.arr.' + dir + ':not([hidden])'); };
  // The Phase filter is called Overs in Tests. A step uses whichever the page has, and the first two values that are not the current one, so every player gets a real filter change.
  var phaseSelect = function () { return [].slice.call(document.querySelectorAll('.bfbar select')).filter(function (x) { return /^(Phase|Overs)/.test(x.getAttribute('aria-label') || ''); })[0]; };
  var setSelect = function (s, value) { s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); };
  var phaseWas = null;
  var phaseAway = function () { var s = phaseSelect(); if (!s) throw new Error('no Phase or Overs filter'); phaseWas = s.value; var o = [].slice.call(s.options).filter(function (x) { return !x.disabled && x.value !== s.value && x.value !== 'all'; })[0]; if (!o) throw new Error('no other phase value'); setSelect(s, o.value); };
  var phaseBack = function () { var s = phaseSelect(); if (!s || phaseWas === null) throw new Error('no phase to go back to'); setSelect(s, phaseWas); };
  var formatSelect = function () { return [].slice.call(document.querySelectorAll('.top select')).filter(function (x) { return x.options.length > 1 && [].slice.call(x.options).some(function (o) { return /^(TEST|ODI|T20I|T20S|LEAGUE|INTERNATIONAL)$/.test(o.value); }); })[0]; };
  var formatWas = null;
  var formatAway = function () { var s = formatSelect(); if (!s) throw new Error('SKIP the player has only one format'); formatWas = s.value; var o = [].slice.call(s.options).filter(function (x) { return !x.disabled && x.value !== s.value; })[0]; if (!o) throw new Error('SKIP the player has only one format'); setSelect(s, o.value); };
  var formatBack = function () { var s = formatSelect(); if (!s || formatWas === null) throw new Error('SKIP the player has only one format'); setSelect(s, formatWas); };
  var VIEWS = { bat: 'Batting analysis', bowl: 'Bowling analysis', rec: 'Records', stats: 'Full stats' };

  // The steps: every way into a view and around it. Each is [label, action].
  var S = [];
  function add(label, fn) { S.push([label, fn]); }
  add('profile to Batting', function () { click(profileBtn(VIEWS.bat)); });
  add('Batting: arrow next x3', function () { click(arrow('r')); setTimeout(function () { click(arrow('r')); }, 400); setTimeout(function () { click(arrow('r')); }, 800); });
  add('Batting: timeline to Wagon wheel', function () { click(node(/Wagon wheel/)); });
  add('Batting: timeline back to Key numbers', function () { click(node(/Key numbers/)); });
  add('Batting: Phase to another value', function () { phaseAway(); });
  add('Batting: Phase back', function () { phaseBack(); });
  add('Batting to Bowling', function () { click(top(VIEWS.bowl)); });
  add('Bowling: timeline to Pitch map', function () { click(node(/Pitch map/)); });
  add('Bowling: timeline to Reviews', function () { click(node(/Reviews/)); });
  add('Bowling to Records', function () { click(top(VIEWS.rec)); });
  add('Records: arrow next x2', function () { click(arrow('r')); setTimeout(function () { click(arrow('r')); }, 500); });
  add('Records: format to another', function () { formatAway(); });
  add('Records: format back', function () { formatBack(); });
  add('Records to Full stats', function () { click(top(VIEWS.stats)); });
  add('Full stats: timeline to Time', function () { click(node(/^Time/)); });
  add('Full stats: timeline to Fielding', function () { click(node(/Fielding/)); });
  add('Full stats to Records (kept)', function () { click(top(VIEWS.rec)); });
  add('Records to Bowling (kept)', function () { click(top(VIEWS.bowl)); });
  add('Bowling to Batting (kept)', function () { click(top(VIEWS.bat)); });
  add('Batting to Full stats (kept)', function () { click(top(VIEWS.stats)); });
  add('rapid: Batting, Bowling, Records (150 ms apart)', function () { click(top(VIEWS.bat)); setTimeout(function () { click(top(VIEWS.bowl)); }, 150); setTimeout(function () { click(top(VIEWS.rec)); }, 300); });
  add('rapid: six view changes (120 ms apart)', function () { var order = ['bowl', 'stats', 'bat', 'rec', 'bowl', 'bat']; order.forEach(function (v, i) { setTimeout(function () { click(top(VIEWS[v])); }, i * 120); }); });
  add('Batting to profile', function () { click([].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === 'Profile' && b.getBoundingClientRect().top < 100; })[0]); });
  add('profile to Full stats', function () { click(profileBtn(VIEWS.stats)); });
  add('Full stats to profile', function () { click([].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === 'Profile' && b.getBoundingClientRect().top < 100; })[0]); });
  add('profile to Bowling', function () { click(profileBtn(VIEWS.bowl)); });

  var i = 0;
  (function next() {
    if (i >= S.length) { M.done = true; return; }
    var s = S[i++]; M.step = s[0]; M.cons = [];
    try { s[1](); } catch (e) { M.report.push(s[0] + ': ' + (/^SKIP/.test(e.message) ? 'skipped (' + e.message.slice(5) + ')' : 'STEP FAILED ' + e.message)); setTimeout(next, 500); return; }
    setTimeout(function () { check(s[0], function (bad) { M.report.push(s[0] + ': ' + (bad.length ? bad.filter(Boolean).join('; ') : 'ok')); setTimeout(next, 200); }); }, 3200);
  })();
  return 'matrix running';
})()
