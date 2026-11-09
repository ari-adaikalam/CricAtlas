// Match Replay in Ari's Safari. Open a match page with ?view=replay in the front tab (localhost:3100 or the live site), then:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<path>/safari-replay.js" as «class utf8») in current tab of front window'
// and read window.__sr.done and window.__sr.report. Every line must end in ok: the controls are there before the first ball, play moves the match on and pause holds it, the scrubber jumps, the score at the end of
// every innings is the scorecard, the wagon wheel and pitch map draw (a canvas with size), there is no bad text and no console error.
(function () {
  var D = window.__sr = { done: false, report: [], cons: [] };
  var oe = console.error; console.error = function () { D.cons.push([].slice.call(arguments).join(' ').slice(0, 140)); oe.apply(console, arguments); };
  var BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
  var say = function (name, ok, detail) { D.report.push(name + ': ' + (ok ? 'ok' : 'FAILED') + (detail ? ' ' + detail : '')); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var DATA = location.origin === 'http://localhost:3100' ? 'http://localhost:8788' : 'https://cricatlas-data.ariadaikalam.com/trial1';   // the data server locally, the data host on the live site
  var id = (/\/matches\/[^?]*?(\d+)(?:\?|$)/.exec(location.pathname + location.search) || [])[1];
  var text = function () { var p = document.querySelector('.rview .rp-score > .pan'); return p ? p.innerText : ''; };
  var setPos = function (v) { var i = document.querySelector('.rpscrub input'); var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); };
  (async function () {
    try {
      var b = await (await fetch(DATA + '/m/bundle/' + id + '.json', { cache: 'no-store' })).json();
      var main = b.innings; // a Super Over is part of the Replay
      say('Replay is open', !!document.querySelector('.rview .obody') && /view=replay/.test(location.search), 'match ' + id + ' ' + b.match.kind + ', window ' + innerWidth + 'x' + innerHeight);
      var play = document.querySelector('.rpplay'), bar = document.querySelector('.rpbar');
      var bb = bar && bar.getBoundingClientRect();
      say('the controls are in the window before the first ball', !!play && !!bb && bb.bottom <= innerHeight + 1 && bb.top >= 0, bb ? 'bar ' + Math.round(bb.top) + ' to ' + Math.round(bb.bottom) : '');
      // Start from a known state: paused, before the first ball (the tab may have been left playing).
      if (play && /Pause/.test(play.getAttribute('aria-label') || '')) { play.click(); await sleep(300); }
      setPos(0); await sleep(500);
      var t0 = text();
      say('it starts before the first ball', /0\/0/.test(t0) && /Before the first ball/.test(t0));
      play.click(); await sleep(3500);
      var t1 = text();
      say('play moves the match on', t1 !== t0, t1.split('\n').slice(0, 3).join(' '));
      play.click(); await sleep(300); var held = text(); await sleep(1500);
      say('pause holds it', text() === held);
      var start = 0, canvases = [];
      for (var k = 0; k < main.length; k++) {
        var r = await fetch(DATA + '/m/balls/' + id + '_' + main[k].n + '.json', { cache: 'no-store' });
        if (r.status !== 200) continue;
        var n = (await r.json()).d.length;
        setPos(start + n); await sleep(700);
        var tx = text();
        say('the end of innings ' + (k + 1) + ' is the scorecard', tx.indexOf(main[k].runs + '/' + main[k].wkts) >= 0, main[k].runs + '/' + main[k].wkts);
        say('no bad text at the end of innings ' + (k + 1), !BAD.test(document.querySelector('.rview').innerText));
        start += n;
      }
      var cs = [].slice.call(document.querySelectorAll('.rview canvas')).map(function (c) { var r2 = c.getBoundingClientRect(); return Math.round(r2.width) + 'x' + Math.round(r2.height); });
      var pos = b.coverage.positioned / b.coverage.balls >= 0.3, pit = (b.coverage.pitched === undefined ? b.coverage.tracked : b.coverage.pitched) / b.coverage.balls >= 0.3, trk = pit || pos; // the pitch scene is drawn when the match has a line and length, or beside the wagon wheel (the panel then says an innings has none)
      say('the ground and pitch scenes are drawn when the match has the tracking', cs.length === (pos ? 1 : 0) + (trk ? 1 : 0) && cs.every(function (s) { return !/^0x|x0$/.test(s); }), cs.join(' '));
      setPos(Math.floor(start * 0.5)); await sleep(1200);
      say('a jump to the middle shows an innings in progress', /\(\d+\)/.test(text()) && !BAD.test(document.querySelector('.rview').innerText));
      say('no console errors', D.cons.length === 0, D.cons.slice(0, 2).join(' | '));
    } catch (e) { say('the script', false, String(e)); }
    D.done = true;
  })();
})();
