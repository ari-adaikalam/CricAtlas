// Match details in Ari's Safari. Open a match page with ?view=details in the front tab (Safari, Develop, Allow JavaScript from Apple Events), then:
//   osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "<path>/safari-details.js" as «class utf8») in current tab of front window'
// and read window.__sd.done and window.__sd.report when done is true. Every line must end in ok. It checks the match in the front tab: every part, and for a Test both rounds,
// with the same sums as match-details.cjs (batting, bowling, phases, extras, fielding, reviews), no bad text, no table running sideways, and no console errors.
(function () {
  var D = window.__sd = { done: false, report: [], cons: [] };
  var oe = console.error, ow = console.warn;
  console.error = function () { D.cons.push('error ' + [].slice.call(arguments).join(' ').slice(0, 140)); oe.apply(console, arguments); };
  console.warn = function () { D.cons.push('warn ' + [].slice.call(arguments).join(' ').slice(0, 140)); ow.apply(console, arguments); };
  var BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
  var num = function (t) { var m = /-?\d+/.exec(String(t).replace(/,/g, '')); return m ? Number(m[0]) : NaN; };
  var say = function (name, ok, detail) { D.report.push(name + ': ' + (ok ? 'ok' : 'FAILED') + (detail ? ' ' + detail : '')); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var DATA = location.origin === 'http://localhost:3100' ? 'http://localhost:8788' : 'https://cricatlas-data.ariadaikalam.com/trial1';   // the data server locally, the data host on the live site
  var id = (/\/matches\/[^?]*?(\d+)(?:\?|$)/.exec(location.pathname + location.search) || [])[1];
  (async function () {
    try {
      var b = await (await fetch(DATA + '/m/bundle/' + id + '.json', { cache: 'no-store' })).json();
      var main = b.innings.filter(function (i) { return !i.super; });
      var test = b.match.kind === 'test';
      var car = document.querySelector('.car');
      say('Details is open with its carousel', !!car && !!location.search.match(/view=details/), 'match ' + id + ' ' + b.match.kind + ', window ' + innerWidth + 'x' + innerHeight);
      if (!car) { D.done = true; return; }
      var parts = [].slice.call(document.querySelectorAll('.tile.dp')).map(function (t) { return t.dataset.tile; });
      var want = ['info', 'batting', 'partnerships', 'fall', 'phases', 'bowling', 'extras', 'fielding'].concat(b.coverage.reviews > 0 ? ['reviews'] : []).concat(b.innings.some(function (i) { return i.super; }) ? ['so'] : []).concat(['ball']);
      say('the parts are the expected ones', JSON.stringify(parts) === JSON.stringify(want), parts.join(','));
      var rounds = test ? (main.length > 2 ? 2 : 1) : 1;
      for (var r = 0; r < rounds; r++) {
        var shown = test ? main.slice(r * 2, r * 2 + 2) : main;
        var problems = [];
        for (var pi = 0; pi < want.length; pi++) {
          var part = want[pi];
          car.style.scrollBehavior = 'auto';
          var tile = car.querySelector('[data-tile="' + part + '"]');
          car.scrollLeft = tile.offsetLeft - parseFloat(getComputedStyle(car).paddingLeft);
          if (r === 1 && part !== 'info') { var sw = tile.querySelectorAll('.msw button')[1]; if (sw) sw.click(); }
          await sleep(1600); // the runs count up when a part comes into view
          var t = car.querySelector('[data-tile="' + part + '"]');
          var pans = [].slice.call(t.querySelectorAll('.pan2'));
          var tables = pans.map(function (pan) {
            return {
              head: [].slice.call(pan.querySelectorAll('thead th')).map(function (x) { return x.innerText.trim(); }),
              rows: [].slice.call(pan.querySelectorAll('tbody tr')).map(function (tr) { return [].slice.call(tr.children).map(function (c) { return c.innerText.replace(/\s+/g, ' ').trim(); }); }),
              sideways: [].slice.call(pan.querySelectorAll('.tsc')).some(function (s) { return s.scrollWidth > s.clientWidth + 1; }),
            };
          });
          var fall = [].slice.call(t.querySelectorAll('.fwrow > div')).map(function (d) {
            var boxes = [].slice.call(d.querySelectorAll('.fow-g text')).map(function (x) { var r = x.getBoundingClientRect(); return { t: x.textContent, l: r.left, r: r.right, tp: r.top, b: r.bottom }; });
            var clash = []; boxes.forEach(function (a, i) { boxes.slice(i + 1).forEach(function (c) { if (a.l < c.r - 2 && c.l < a.r - 2 && a.tp < c.b - 8 && c.tp < a.b - 8) clash.push(a.t + ' / ' + c.t); }); });
            var g0 = d.querySelector('.fow-g'), sv = g0 && g0.closest('svg'), svg = sv && sv.getBoundingClientRect(); // the chart's own svg: the heading has the team emblem, also an svg
            var out = svg ? boxes.filter(function (x) { return x.l < svg.left - 1 || x.r > svg.right + 1 || x.tp < svg.top - 1 || x.b > svg.bottom + 1; }).map(function (x) { return x.t; }) : [];
            return { n: d.querySelectorAll('.fow-g').length, scores: [].slice.call(d.querySelectorAll('.fow-g')).map(function (m) { return m.querySelector('text').textContent; }), clash: clash, out: out };
          });
          if (BAD.test(t.innerText)) problems.push(part + ' has bad text: ' + (t.innerText.match(BAD) || [''])[0]);
          if (tables.some(function (x) { return x.sideways; })) problems.push(part + ' runs sideways');
          var rc = t.getBoundingClientRect(), lim = document.querySelector('.credit');
          if (lim && rc.bottom > lim.getBoundingClientRect().top + 1) problems.push(part + ' runs into the footer');
          shown.forEach(function (inn, k) {
            var tb = tables[k], e = inn.extras;
            if (['batting', 'partnerships', 'bowling', 'phases', 'extras'].indexOf(part) >= 0 && !tb) return problems.push(part + ' panel ' + k + ' missing');
            if (part === 'batting') {
              var ex = tb.rows.filter(function (x) { return x[0] === 'Extras'; })[0], tot = tb.rows.filter(function (x) { return x[0] === 'Total'; })[0];
              var bats = tb.rows.filter(function (x) { return x[0] !== 'Total' && x[0] !== 'Extras'; }).reduce(function (s, x) { return s + num(x[2]); }, 0);
              if (!ex || !tot || bats + num(ex[2]) !== inn.runs) problems.push('batting runs ' + bats + ' + extras ≠ ' + inn.runs);
            }
            if (part === 'bowling') {
              var runs = tb.rows.reduce(function (s, x) { return s + num(x[3]); }, 0), exp = inn.runs - e.b - e.lb - e.pen;
              if (runs !== exp) problems.push('bowling R ' + runs + ' ≠ ' + exp);
            }
            if (part === 'partnerships') {
              var pt = tb.rows.reduce(function (s, x) { return s + num(x[4]); }, 0);
              if (pt !== inn.runs) problems.push('partnerships ' + pt + ' ≠ ' + inn.runs);
              if (tb.rows.length !== inn.partnerships.length) problems.push('partnership rows ' + tb.rows.length + ' ≠ ' + inn.partnerships.length);
            }
            if (part === 'phases') {
              var pr = tb.rows.reduce(function (s, x) { return s + num(x[1]); }, 0), pw = tb.rows.reduce(function (s, x) { return s + num(x[2]); }, 0);
              if (pr !== inn.runs) problems.push('phases runs ' + pr + ' ≠ ' + inn.runs);
              if (pw !== inn.wkts) problems.push('phases wkts ' + pw + ' ≠ ' + inn.wkts);
            }
            if (part === 'extras') {
              var xt = tb.rows.filter(function (x) { return x[0] === 'Total'; })[0];
              if (!xt || num(xt[6]) !== e.wd + e.nb + e.b + e.lb + e.pen) problems.push('extras total ' + (xt && xt[6]));
            }
          });
          if (part === 'fall') shown.forEach(function (inn, k) {
            var f = fall[k]; if (!f) return problems.push('fall panel missing');
            var all = inn.fow.map(function (e) { return { runs: e.runs, n: e.n, ret: '', d: e.delivery }; }).concat(inn.retired.map(function (e) { return { runs: e.runs, n: e.n, ret: '*', d: e.delivery }; })).sort(function (x, y) { return x.d - y.d; });
            var want2 = all.map(function (e) { return e.runs + '-' + e.n + e.ret; });
            if (f.n !== all.length || JSON.stringify(f.scores) !== JSON.stringify(want2)) problems.push('fall scores ' + f.scores + ' ≠ ' + want2);
            if (f.clash.length) problems.push('fall texts overlap: ' + f.clash.slice(0, 2).join('; '));
            if (f.out.length) problems.push('fall text outside the chart: ' + f.out.slice(0, 2));
          });
          if (part === 'so') {
            var spair = b.innings.filter(function (i) { return i.super; }).slice(0, 2);
            var cards = [].slice.call(t.querySelectorAll('.pan2')).map(function (pan) { return [].slice.call(pan.querySelectorAll('tbody tr')).map(function (tr) { return [].slice.call(tr.children).map(function (c) { return c.innerText.replace(/\s+/g, ' ').trim(); }); }); });
            spair.forEach(function (inn, j) {
              var rowsX = cards[j] || [], bats = rowsX.filter(function (x) { return x[0] !== 'Extras'; }).reduce(function (s2, x) { return s2 + num(x[2]); }, 0), ex2 = rowsX.filter(function (x) { return x[0] === 'Extras'; })[0];
              if (bats + (ex2 ? num(ex2[2]) : 0) !== inn.runs) problems.push('super over ' + inn.team + ' R ' + bats + ' + extras ≠ ' + inn.runs);
            });
            if (!t.querySelector('.sores') || BAD.test(t.querySelector('.sores').innerText)) problems.push('super over result line missing');
          }
          if (part === 'ball') {
            // the list of the innings the tile shows: windowed, every row 34 px, and the last ball's score is the innings total
            var sc = t.querySelector('.bbl'), drawn = t.querySelectorAll('.bbr').length, shownInn = (r === 1 && main[1]) ? main[1] : main[0]; // round 2 pressed the second innings button of this tile
            if (!sc) problems.push('ball list missing');
            else {
              if (drawn > 110) problems.push('ball rows drawn ' + drawn);
              sc.scrollTop = sc.scrollHeight; await sleep(400);
              var rowsNow = [].slice.call(t.querySelectorAll('.bbr')), lastRow = rowsNow[rowsNow.length - 1];
              if (rowsNow.some(function (r) { return Math.round(r.getBoundingClientRect().height) !== 34; })) problems.push('ball row height is not 34');
              if (!lastRow || lastRow.lastElementChild.textContent !== shownInn.runs + '/' + shownInn.wkts) problems.push('last score ' + (lastRow && lastRow.lastElementChild.textContent) + ' ≠ ' + shownInn.runs + '/' + shownInn.wkts);
              sc.scrollTop = 0;
            }
          }
          if (part === 'fielding') {
            var cr = shown.reduce(function (s, inn) { return s + inn.fielding.reduce(function (a, f) { return a + f.c + f.st + f.ro; }, 0); }, 0);
            var sn = tables.reduce(function (s, x) { return s + x.rows.reduce(function (a, y) { return a + (y.length >= 5 ? num(y[4]) : 0); }, 0); }, 0);
            if (cr !== sn) problems.push('fielding ' + sn + ' ≠ ' + cr);
          }
          if (part === 'reviews') {
            var rv = shown.reduce(function (s, inn) { return s + inn.reviews.length; }, 0), rs = tables.reduce(function (s, x) { return s + x.rows.length; }, 0);
            if (rv !== rs) problems.push('reviews ' + rs + ' ≠ ' + rv);
          }
        }
        say((test ? 'round ' + (r + 1) + ': ' : '') + 'every part adds up and fits', problems.length === 0, problems.join('; '));
      }
      await sleep(300);
      say('no console errors', D.cons.length === 0, D.cons.join(' | '));
    } catch (e) { say('script ran', false, String(e)); }
    D.done = true;
  })();
})();
