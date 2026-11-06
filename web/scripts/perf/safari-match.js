// The Match page in Ari's Safari. Open a match page in the front tab (Safari, Develop, Allow JavaScript from Apple Events), then:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<path>/safari-match.js" as «class utf8») in current tab of front window'
// and read window.__sm.done and window.__sm.report when done is true (about 25 seconds). Every line must end in ok. It moves through the page by its own buttons, so the page is never reloaded.
(function () {
  var M = window.__sm = { done: false, report: [], cons: [] };
  var oe = console.error, ow = console.warn;
  console.error = function () { M.cons.push('error ' + [].slice.call(arguments).join(' ').slice(0, 140)); oe.apply(console, arguments); };
  console.warn = function () { M.cons.push('warn ' + [].slice.call(arguments).join(' ').slice(0, 140)); ow.apply(console, arguments); };
  window.__marker = 'same page';
  var BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var btn = function (text, scope) { return $$('button', scope).filter(function (b) { return b.textContent.trim() === text; })[0]; };
  var say = function (name, ok, detail) { M.report.push(name + ': ' + (ok ? 'ok' : 'FAILED') + (detail ? ' ' + detail : '')); };
  var wait = function (ms, fn) { setTimeout(fn, ms); };
  var fits = function () {
    var bad = [];
    $$('.sum .rs1, .sum .potm, .sum .mbs, .sum .blk h2, .sum .bh .ov, .sum .bh .sc, .sum .nm, .sum .btn').forEach(function (el) {
      if (!el.clientWidth) return;
      if (el.scrollWidth > el.clientWidth + 1) bad.push((el.className || el.tagName) + ': ' + el.innerText.slice(0, 50));
    });
    var strip = $('.mact'), foot = $('.credit');
    if (strip && foot && strip.getBoundingClientRect().bottom > foot.getBoundingClientRect().top - 8) bad.push('the buttons are too close to the footer');
    if (BAD.test(($('.sum') || {}).innerText || '')) bad.push('bad text');
    return bad;
  };
  var steps = [
    function (next) {
      var s = $('.sum');
      say('the summary is on screen', !!s && !!$('.resbar') && $$('.minns .blk').length > 0, $$('.minns .blk').length + ' innings blocks, window ' + innerWidth + 'x' + innerHeight);
      var b = fits(); say('every line fits and the buttons clear the footer', b.length === 0, b.join('; '));
      say('the first block is the side that batted first', true, ($('.blk h2') || {}).innerText + ' / ' + ($('.blk .ov') || {}).innerText);
      next();
    },
    function (next) {
      btn('Match analysis', $('.mact')).click();
      wait(1300, function () { var top = $('.top'); say('Match analysis shows the strip', !!top && getComputedStyle(top).opacity === '1' && $('.top .one').innerText.length > 5, $('.top .one').innerText.slice(0, 70));
        ['Replay', 'Details', 'Analysis'].forEach(function (v) {}); next(); });
    },
    function (next) { btn('Details', $('#vsw')).click(); wait(600, function () { say('the view switch changes the view', !!$('#p-det'), 'pane p-det'); btn('Replay', $('#vsw')).click(); wait(500, function () { say('Replay too', !!$('#p-rep')); next(); }); }); },
    function (next) { btn('Summary', $('.top')).click(); wait(1200, function () { say('Summary comes back', getComputedStyle($('.sum')).opacity === '1' && getComputedStyle($('.top')).opacity === '0'); next(); }); },
    function (next) {
      var before = $('.resbar').innerText;
      btn('Change match', $('.mbanner')).click();
      wait(500, function () {
        var input = $('.mbanner input'); var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'india vs aus'); input.dispatchEvent(new Event('input', { bubbles: true }));
        wait(1200, function () {
          var opts = $$('.mbanner [role="option"]'); var panel = $('.mbanner .res').getBoundingClientRect();
          say('"india vs aus" lists matches between the two', opts.length > 10 && opts.slice(0, 10).every(function (o) { return /India/.test(o.innerText) && /Australia/.test(o.innerText); }), $('.mbanner .res h6') ? $('.mbanner .res h6').innerText : '');
          say('every result names its format', opts.slice(0, 10).every(function (o) { return /\b(Test|ODI|T20I|T20|The Hundred)\b/.test(o.querySelector('.fmt').innerText); }));
          say('the panel stays inside the window', panel.bottom <= innerHeight + 1 && panel.right <= innerWidth + 1, 'bottom ' + Math.round(panel.bottom) + ' of ' + innerHeight);
          // Frame by frame: the banner's centred lines must not shift while the words change.
          var lefts = [], t0 = performance.now();
          var sample = function () { var e = $$('.mbt .mbs').map(function (x) { var r = x.getBoundingClientRect(); return Math.round(r.left * 10) / 10 + ':' + Math.round(r.width * 10) / 10; }); lefts.push(e.join('|')); if (performance.now() - t0 < 1500) requestAnimationFrame(sample); };
          requestAnimationFrame(sample);
          opts[0].click();
          wait(1800, function () {
            var after = $('.resbar').innerText;
            say('Change match changed the match in place', window.__marker === 'same page' && after !== before, location.pathname.slice(0, 60));
            var uniq = {}; lefts.forEach(function (l) { uniq[l] = 1; });
            say('the banner lines kept their place while the words changed', Object.keys(uniq).length <= 2, Object.keys(uniq).length + ' distinct positions over ' + lefts.length + ' frames');
            next();
          });
        });
      });
    },
    function (next) {
      var a = $('.blk .nm a.el');
      if (!a) { say('player names are links', false, 'none'); return next(); }
      a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', relatedTarget: null })); a.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      wait(500, function () {
        var m = $('.elmenu'); var r = m && m.getBoundingClientRect();
        say('hovering a player opens the menu', !!m && m.querySelectorAll('[role=menuitem]').length === 2, m ? m.innerText.replace(/\s+/g, ' ') : 'no menu');
        say('the menu is inside the window', !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight);
        a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: null })); a.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        wait(600, function () { say('the menu closes when the pointer leaves', !$('.elmenu')); next(); });
      });
    },
    function (next) { say('no console error or warning', M.cons.length === 0, M.cons.slice(0, 2).join(' / ')); next(); },
  ];
  var i = 0;
  (function run() { if (i >= steps.length) { M.done = true; return; } try { steps[i++](run); } catch (e) { M.report.push('step ' + i + ' threw: ' + e.message); M.done = true; } })();
  return 'running';
})()
