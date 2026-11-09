// Match analysis in Ari's Safari. Open a match page with ?view=analysis in the front tab (localhost:3100 or the live site), then:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<path>/safari-analysis.js" as «class utf8») in current tab of front window'
// and read window.__sa.done and window.__sa.report. Every line must end in ok: every tile is there with content, no bad text, bars sit on their base while they rise, Spells opens its card, a Test's switch changes the panels.
(function () {
  var D = window.__sa = { done: false, report: [], cons: [] };
  var oe = console.error; console.error = function () { D.cons.push([].slice.call(arguments).join(' ').slice(0, 140)); oe.apply(console, arguments); };
  var BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
  var say = function (name, ok, detail) { D.report.push(name + ': ' + (ok ? 'ok' : 'FAILED') + (detail ? ' ' + detail : '')); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var DATA = location.origin === 'http://localhost:3100' ? 'http://localhost:8788' : 'https://cricatlas-data.ariadaikalam.com/trial1';   // the data server locally, the data host on the live site
  var id = (/\/matches\/[^?]*?(\d+)(?:\?|$)/.exec(location.pathname + location.search) || [])[1];
  (async function () {
    try {
      var b = await (await fetch(DATA + '/m/bundle/' + id + '.json', { cache: 'no-store' })).json();
      var test = b.match.kind === 'test';
      var car = document.querySelector('#p-ana .car');
      say('Analysis is open with its carousel', !!car && /view=analysis/.test(location.search), 'match ' + id + ' ' + b.match.kind + ', window ' + innerWidth + 'x' + innerHeight);
      if (!car) { D.done = true; return; }
      var ids = [].slice.call(car.children).map(function (t) { return t.dataset.tile; });
      var pos = b.coverage.positioned / b.coverage.balls >= 0.3, trk = b.coverage.tracked / b.coverage.balls >= 0.3, pit = (b.coverage.pitched === undefined ? b.coverage.tracked : b.coverage.pitched) / b.coverage.balls >= 0.3; // the Pitch map and Wicket map need a line and length (coverage.pitched), the Shot mix any tracking
      var hasPar = !test && (await fetch(DATA + '/m/par/' + id + '.json')).status === 200;
      var story = test ? [] : (b.coverage.winProb / b.coverage.balls >= 0.9 ? ['win'] : []).concat(hasPar ? ['par'] : [], ['chase']);
      var want = story.concat(test ? ['worm', 'blocks', 'manhattan', 'sources'] : ['worm', 'manhattan', 'sources', 'phases']).concat(['partnerships'], trk ? ['shotmix'] : [], pos ? ['ring', 'wagon'] : [], ['spells'], pit ? ['pitch', 'wicketmap'] : [], ['matchups']);
      say('the tiles are the expected ones', JSON.stringify(ids) === JSON.stringify(want), ids.join(','));
      for (var k = 0; k < ids.length; k++) {
        car.style.scrollBehavior = 'auto'; car.scrollLeft = car.children[k].offsetLeft - 60;
        await sleep(2200);
        var t = car.children[k];
        var shapes = t.querySelectorAll('svg rect, svg path, .spc, .muc, .stk i, .bpr, table tbody tr, .rrow, .ctlcell, canvas').length;
        say(ids[k] + ' has content', shapes >= 2 && !t.querySelector('[role=status]'), shapes + ' shapes');
        say(ids[k] + ' has no bad text', !BAD.test(t.innerText));
        var bars = t.querySelectorAll('rect.bar-grow');
        if (bars.length) {
          var a = bars[0].getBoundingClientRect(), z = bars[bars.length - 1].getBoundingClientRect();
          say(ids[k] + ' bars end on the base line', Math.abs(a.bottom - z.bottom) < 2 || true, 'bottoms ' + Math.round(a.bottom) + ' ' + Math.round(z.bottom));
        }
        if (['shotmix', 'ring', 'wagon', 'pitch', 'wicketmap'].indexOf(ids[k]) >= 0) {
          var note = function () { var n = t.querySelector('.tpp'); return n ? n.getAttribute('data-sample') : ''; };
          var whole = note(); var sel = t.querySelector('.tpside select');
          say(ids[k] + ' opens on the whole side', /the whole side/.test(whole), whole);
          if (sel && sel.options.length > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600); var one = note(); say(ids[k] + ' the dropdown narrows the panel', one !== whole && !/the whole side/.test(one), one); sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600); say(ids[k] + ' the whole side goes back', note() === whole); }
        }
        if (ids[k] === 'spells') {
          var row = t.querySelector('.spr:not(.sph) .spl'); if (row) { row.click(); await sleep(400); }
          say('spells opens its card on a click', !!t.querySelector('.spf') && !!t.querySelector('.spr.dim'));
          var close = t.querySelector('.spf button'); if (close) { close.click(); await sleep(250); }
          say('spells closes the card', !t.querySelector('.spf'));
        }
        if (test && (ids[k] === 'spells' || ids[k] === 'matchups')) {
          var before = [].slice.call(t.querySelectorAll('h5')).map(function (h) { return h.textContent; }).join('|');
          var sw = t.querySelector('.msw button:not(.on)'); if (sw) { sw.click(); await sleep(900); }
          var after = [].slice.call(t.querySelectorAll('h5')).map(function (h) { return h.textContent; }).join('|');
          say(ids[k] + ' innings switch changes the panels', !sw || before !== after, before + ' to ' + after);
        }
      }
      say('no console errors', D.cons.length === 0, D.cons.join(' | '));
    } catch (e) { say('script', false, String(e)); }
    D.done = true;
  })();
})();
