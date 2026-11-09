// Safari: the root pages Teams, Players, Matches, Tournaments and Series, one at a time, in the page that is open (set the address first, for example /series). It checks that the table draws, a filter
// narrows it and Clear all brings it back, the filter row keeps its height, the search filters the table, a row's headline is a link or opens, the top bar hover menu opens, and nothing logged an error. Run:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<this file>" as «class utf8») in current tab of front window'
// then read window.__rp.done and window.__rp.report. Every line must end in ok. The page must have been open for 3 seconds before the run.
(function () {
  var R = window.__rp = { done: false, report: [], cons: [] };
  var oe = console.error; console.error = function () { R.cons.push([].slice.call(arguments).join(' ').slice(0, 120)); return oe.apply(console, arguments); };
  window.addEventListener('error', function (e) { R.cons.push(String(e.message).slice(0, 120)); });
  var path = location.pathname.replace(/^\//, '');
  var sc = { teams: '.rtp', players: '.rpp', matches: '.rmp', tournaments: '.rtn', series: '.rsr' }[path];
  function say(label, ok, extra) { R.report.push(label + ': ' + (ok ? 'ok' : 'FAILED') + (extra ? ' ' + extra : '')); }
  if (!sc) { say('this is a root page', false, path); R.done = true; return 'wrong page'; }
  var q = function (s, all) { return all ? [].slice.call(document.querySelectorAll(sc + ' ' + s)) : document.querySelector(sc + ' ' + s); };
  var count = function () { var b = q('.cnt .t b'); return b ? Number(b.textContent.replace(/,/g, '')) : -1; };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  (async function () {
    var rows = q('tbody tr.rlink', true).length;
    say('rows are drawn', rows > 5, rows + ' rows');
    var total0 = count(); say('the count is shown', total0 > 0, String(total0));
    var fr = q('.fbar .fr'), h0 = Math.round(fr.getBoundingClientRect().height);
    var wide = Math.round(fr.getBoundingClientRect().right);
    var tbl = q('.tbl'); var tr = tbl.getBoundingClientRect().left + tbl.clientWidth;
    var cr = q('.cnt').getBoundingClientRect().right;
    say('the filter row ends where the table ends', Math.abs(cr - tr) <= 3, 'count ' + Math.round(cr) + ' table ' + Math.round(tr));
    // a filter narrows, then Clear all
    var sel = q('.fbar select', true).filter(function (s) { return s.options.length > 2; })[0];
    var opt = [].slice.call(sel.options).filter(function (o) { return o.value && !o.disabled; })[0];
    var before = count();
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(700);
    var after = count();
    say('a filter changes the list', after !== before && after > 0, before + ' -> ' + after);
    say('and the row keeps its height', Math.round(q('.fbar .fr').getBoundingClientRect().height) === h0);
    var clr = q('.clrw.on .clr'); say('Clear all appears', !!clr);
    if (clr) { clr.click(); await wait(700); say('Clear all returns the list', path === 'series' ? count() > before : count() === before); }
    // search filters the table
    var box = q('.big input'); var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto.set.call(box, 'zzzzqq'); box.dispatchEvent(new Event('input', { bubbles: true })); await wait(600);
    say('search with no match empties the table', q('tbody tr.rlink', true).length === 0 && !!q('.empty'));
    proto.set.call(box, ''); box.dispatchEvent(new Event('input', { bubbles: true })); await wait(600);
    say('and clearing the search restores it', q('tbody tr.rlink', true).length > 5);
    say('no suggestion list on a table search of Series', path !== 'series' || !q('.sug'));
    // sticky header stays in view while the table scrolls
    tbl.scrollTop = 600; await wait(300);
    var th = q('thead th'); var tt = tbl.getBoundingClientRect().top, thTop = th.getBoundingClientRect().top;
    say('the header stays at the top of the table', Math.abs(thTop - tt) <= 2, 'th ' + Math.round(thTop) + ' table ' + Math.round(tt)); tbl.scrollTop = 0;
    // the hover menu
    var item = [].slice.call(document.querySelectorAll('.nav .nmi')).filter(function (n) { return /Players/.test(n.textContent); })[0];
    if (item) {
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null })); item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, relatedTarget: null })); await wait(900);
      var on = document.querySelector('.nav .nmp.on'); var n = on ? on.querySelectorAll('a').length : 0;
      say('the hover menu opens with ten links (nine of the page and the page itself)', n === 10, String(n));
      item.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null })); await wait(500);
      say('and closes', !document.querySelector('.nav .nmp.on'));
    } else say('the hover menu exists', false);
    if (path === 'series') {
      var r1 = q('tbody tr.rlink', true)[0]; r1.click(); await wait(700);
      var open = q('tr.sxr.on .sxm', true).length; say('a Series row opens to its matches', open > 0, open + ' matches');
    }
    say('nothing logged an error', R.cons.length === 0, R.cons.join(' | '));
    R.done = true;
  })();
  return 'running';
})()
