#!/usr/bin/env bash
# Every Safari script in turn, in the front tab (Ari, 2026-10-25). Safari needs Develop, Allow JavaScript from Apple Events, and the front tab on localhost:3100 (checked by safari-run.sh). About 45 minutes.
# Prints one line for each script and the report of the ones that fail. The exit status is 1 when any failed. Needs the app on 3100 and the data server on 8788, or SAFARI_ORIGIN=https://cricatlas.ariadaikalam.com to run against the live site.
#   web/scripts/perf/safari-all.sh            (ONLY='root|team slides' runs the ones whose name matches)
DIR="$(cd "$(dirname "$0")" && pwd)"; R="$DIR/safari-run.sh"
K=/players/v-kohli-ba607b88; M=/matches/1298150
fail=0
run() { name="$1"; shift; if [ -n "${ONLY:-}" ] && ! printf '%s' "$name" | grep -qE "$ONLY"; then return; fi; out="$("$R" "$@" 2>&1)"; rc=$?; last="$(printf '%s\n' "$out" | tail -1)"; if [ $rc -eq 0 ]; then echo "ok      $name"; else echo "FAILED  $name ($last)"; printf '%s\n' "$out" | grep -v ': ok' | head -12 | sed 's/^/          /'; fail=1; fi; }
run "player matrix"        safari-matrix.js "$K" 'window.__matrix.done' 'window.__matrix.report' 420
run "player view slides"   safari-view-slides.js "$K?format=ODI" 'window.__done' 'window.__res' 300
run "player edge cases"    safari-edge-cases.js "$K?format=ODI" 'window.__done2' 'window.__res2' 200
run "match page"           safari-match.js "$M" 'window.__sm.done' 'window.__sm.report' 90
run "match details"        safari-details.js "$M?view=details" 'window.__sd.done' 'window.__sd.report' 240
run "match analysis"       safari-analysis.js "$M?view=analysis" 'window.__sa.done' 'window.__sa.report' 300
run "match replay"         safari-replay.js "$M?view=replay" 'window.__sr.done' 'window.__sr.report' 240
for page in players teams matches tournaments series; do run "root $page" safari-root-pages.js "/$page" 'window.__rp.done' 'window.__rp.report' 120; done
run "team slides"          safari-team-slides.js "/teams/india~intl~male?view=results" 'window.__done' '(window.__res||[]).concat(window.__res2||[])' 420 "" 'window.__rapid()' 'window.__done2'
run "team tiles"           safari-team-tiles.js "/teams/india~intl~male?view=results" 'window.__tdone' 'window.__tiles' 300
OVERVIEW="(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(b){return b.textContent.trim()==='Overview'})[0];if(b)b.click();})()"
run "tournament slides"    safari-tournament-slides.js "/tournaments/ipl" 'window.__done' '(window.__res||[]).concat(window.__res2||[])' 420 "$OVERVIEW" 'window.__rapid()' 'window.__done2'
run "tournament tiles"     safari-tournament-tiles.js "/tournaments/ipl" 'window.__tdone' 'window.__tiles' 300 "$OVERVIEW"
echo; [ $fail -eq 0 ] && echo "every Safari script passed" || echo "some Safari scripts failed"
exit $fail
