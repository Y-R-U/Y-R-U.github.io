#!/bin/zsh
# Full regression (manager gate before a commit). One browser at a time on one Chrome.
#   tools/verify-all.sh [port] > verify.log 2>&1    then: grep -E '^== |passed|green;|✗|FAIL|GREEN' verify.log
cd "${0:A:h}/.."
P=${1:-9641}
run() { echo "== $*"; node "$@" 2>&1 | tail -6; }
for t in tools/flight-sim.mjs tools/atc-sim.mjs tools/score-sim.mjs js/assist/test/landahead.test.mjs tools/tasks-sim.mjs tools/stovl-sim.mjs tools/airport-check.mjs tools/loop/freeze-test.mjs tools/controls-sim.mjs tools/sheep-sim.mjs; do run $t; done
run data/barks/check_towers.mjs --audio
echo "== go test"; (cd server && go test ./... 2>&1 | tail -3)
for p in 9711 9712; do ~/.claude/bin/cdp start --port $p --idle 7200 --max 21600 -- --use-angle=metal >/dev/null 2>&1; done
~/.claude/bin/cdp start --port $P --idle 7200 --max 21600 -- --use-angle=metal --autoplay-policy=no-user-gesture-required >/dev/null 2>&1
for t in test-stovl test-map test-palace; do run tools/$t.mjs --port=$P; done
run tools/test-map.mjs --cases=tour --orient=portrait --port=$P
run tools/test-access.mjs
for t in test-hud4 test-controls test-sheep; do run tools/$t.mjs --port=$P; done
run tools/story/test-intro.mjs --port=$P
run js/radio/test/tower-audio.mjs --airport=farm --port=$P
run tools/test-tasks.mjs --port=$P
for m in 1 2 3 4 5 6 7 8 9 10; do run tools/story/test-mission.mjs --mission=$m --port=$P; done
run tools/story/test-mission.mjs --mission=2 --diff=medium --port=$P
run tools/story/test-picker.mjs --port=$P
run tools/story/test-warp.mjs
for g in --quick --jets --roster --roster2 ""; do run tools/test-loop.mjs $g --port=$P; done
echo ALLDONE
