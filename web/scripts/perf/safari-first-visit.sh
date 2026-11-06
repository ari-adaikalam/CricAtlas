#!/usr/bin/env bash
# For every pair of views (A then B), starting from a fresh profile page with nothing scrolled: open A, wait, switch to B, check that no tile of B that is beside the view (under 15% visible) has
# played, then switch back to A and check the kept A the same way. A tile plays only when scrolled to.
# Needs Safari with Developer, Allow JavaScript from Apple Events. Run with the dev server on 3100:  web/scripts/perf/safari-first-visit.sh [player id] [format]   (about 6 minutes)
# Every line must end in ok. A blank answer from Safari counts as a failure, never as a pass.
set -u
PLAYER="${1:-ba607b88}"; FORMAT="${2:-ODI}"; BASE="http://localhost:3100/players/$PLAYER?format=$FORMAT"
TMP="$(mktemp -d)"
run_js() { # $1 = javascript text
  printf '%s' "$1" > "$TMP/x.js"
  osascript -e "tell application \"Safari\" to do JavaScript (read POSIX file \"$TMP/x.js\" as «class utf8») in current tab of front window" 2>&1
}
top_click() { run_js "(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(b){var r=b.getBoundingClientRect();return b.textContent.trim()==='$1'&&r.top>0&&r.top<100})[0];if(!b)return 'NO BUTTON $1';b.click();return 'clicked'})()"; }
profile_click() { run_js "(function(){var b=[].slice.call(document.querySelectorAll('.pgx button')).filter(function(b){return b.textContent.trim()==='$1'})[0];if(!b)return 'NO BUTTON $1';b.click();return 'clicked'})()"; }
probe() { run_js "(function(p){var car=document.querySelector(p+' .car');if(!car)return 'no pane '+p;var box=car.getBoundingClientRect();var early=[];var n=0;[].slice.call(car.children).filter(function(t){return t.classList.contains('tile')}).forEach(function(t){n++;var r=t.getBoundingClientRect();var vis=Math.max(0,Math.min(r.right,box.right)-Math.max(r.left,box.left))/r.width;if(vis<0.15&&t.querySelector('svg.play, .play, [data-played=\"true\"]'))early.push(t.dataset.tile)});return early.length?'EARLY '+early.join(','):(n>0?'ok':'no tiles')})('$1')"; }
declare -a NAMES=("Batting analysis:#p-bat" "Bowling analysis:#p-bowl" "Records:#p-rec" "Full stats:#p-stats")
fail=0; total=0
for a in "${NAMES[@]}"; do for b in "${NAMES[@]}"; do
  [ "$a" = "$b" ] && continue
  la="${a%%:*}"; pa="${a##*:}"; lb="${b%%:*}"; pb="${b##*:}"
  run_js "location.href='$BASE'" >/dev/null; sleep 9
  c1=$(profile_click "$la"); sleep 5
  c2=$(top_click "$lb"); sleep 3.6
  r1=$(probe "$pb")
  c3=$(top_click "$la"); sleep 3.6
  r2=$(probe "$pa")
  line="$la -> $lb: new view [$r1], kept view [$r2]"; echo "$line"; total=$((total+1))
  [ "$r1" = ok ] && [ "$r2" = ok ] || fail=1
done; done
rm -rf "$TMP"
[ $fail -eq 0 ] && echo "all $total pairs ok" || echo "FAILURES above"
