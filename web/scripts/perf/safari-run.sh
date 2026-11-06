#!/usr/bin/env bash
# Runs one of the Safari scripts in the front tab and prints its report (Ari, 2026-10-25). Safari needs Develop, Allow JavaScript from Apple Events, and the front tab must be on localhost:3100 (or on the live site when SAFARI_ORIGIN names it),
# which is checked before anything is run (a script was once run in a tab on another site).
#   web/scripts/perf/safari-run.sh <script.js> <address on localhost:3100> <done expression> <report expression> [wait seconds]
# The optional sixth argument is javascript to run in the page before the script (a click that opens a view). The seventh is javascript to call once the script is done, and the eighth the expression that says its second part is done. Example: safari-run.sh safari-matrix.js /players/v-kohli-ba607b88 'window.__matrix.done' 'window.__matrix.report' 240
# The report is an array of lines. The exit status is 1 when a line does not end in ok (or skipped), or when Safari gives no answer (a blank answer is a failure, never a pass).
set -u
SCRIPT="$1"; ADDR="$2"; DONE="$3"; REPORT="$4"; WAIT="${5:-240}"; PRE="${6:-}"; POST="${7:-}"; DONE2="${8:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# The origin under test: the local dev server, or the live site with SAFARI_ORIGIN=https://cricatlas.ariadaikalam.com. Nothing else is accepted.
ORIGIN="${SAFARI_ORIGIN:-http://localhost:3100}"
case "$ORIGIN" in http://localhost:3100|https://cricatlas.ariadaikalam.com) ;; *) echo "SAFARI_ORIGIN $ORIGIN is not allowed. Not run."; exit 2;; esac
js() { printf '%s' "$1" > /tmp/safari_x.js; osascript -e 'tell application "Safari" to do JavaScript (read POSIX file "/tmp/safari_x.js" as «class utf8») in current tab of front window' 2>&1; }
front="$(osascript -e 'tell application "Safari" to get URL of current tab of front window' 2>&1)"
case "$front" in "$ORIGIN"/*|"$ORIGIN") ;; *) echo "The front Safari tab is not on $ORIGIN ($front). Not run."; exit 2;; esac
js "location.href='$ORIGIN$ADDR'" >/dev/null; sleep 9
case "$(osascript -e 'tell application "Safari" to get URL of current tab of front window' 2>&1)" in "$ORIGIN"/*) ;; *) echo "The tab left $ORIGIN. Not run."; exit 2;; esac
[ -n "$PRE" ] && { js "$PRE" >/dev/null; sleep 4; }
osascript -e "tell application \"Safari\" to do JavaScript (read POSIX file \"$DIR/$SCRIPT\" as «class utf8») in current tab of front window" >/dev/null 2>&1
t=0; done_=""
while [ $t -lt "$WAIT" ]; do sleep 5; t=$((t+5)); done_="$(js "String(!!($DONE))")"; [ "$done_" = true ] && break; done
if [ "$done_" != true ]; then echo "$SCRIPT: no answer after ${WAIT}s (done=$done_)"; exit 1; fi
# A script that has a second part started by a call (the rapid clicks of the slides): run it and wait for the second flag.
if [ -n "$POST" ]; then js "$POST" >/dev/null; t=0; d2=""; while [ $t -lt "$WAIT" ]; do sleep 5; t=$((t+5)); d2="$(js "String(!!($DONE2))")"; [ "$d2" = true ] && break; done; [ "$d2" = true ] || { echo "$SCRIPT: the second part gave no answer after ${WAIT}s"; exit 1; }; fi
report="$(js "($REPORT||[]).join('\\n')")"
echo "$report"
[ -z "$report" ] && { echo "$SCRIPT: empty report"; exit 1; }
# A line passes when it says ok (or skipped) and never FAILED. A line that says neither is a failure, as is a blank answer.
if printf '%s\n' "$report" | grep -q 'FAILED'; then echo "$SCRIPT: FAILED"; exit 1; fi
# A result line has a colon or an arrow; the lines of a long detail (a match's score text) do not and are not judged.
if printf '%s\n' "$report" | grep -E ':|->' | grep -vE '(^|[ :(])ok($|[ ,;)])|skipped' | grep -q .; then echo "$SCRIPT: a result line does not say ok"; exit 1; fi
echo "$SCRIPT: ok"
