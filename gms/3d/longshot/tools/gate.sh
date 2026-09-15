#!/bin/bash
# The LONGSHOT regression gate. Run before committing anything that touches
# city generation, spawning, ballistics or the firing position.
#
#   tools/gate.sh            # tests only (fast, no browser)
#   tools/gate.sh --full     # + visibility audit + bot sweep (slow, needs Chrome)
#
# Gate numbers as of the B1-B8 campaign: ballistics 21, utils 54, bot 11/11 on
# seed 4, and NO mark at 0/49 on seeds 1,4,9.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== node tests =="
node tools/test_ballistics.mjs | tail -1 || fail=1
[ -f tools/test_utils.mjs ] && { node tools/test_utils.mjs | tail -1 || fail=1; }

if [ "${1:-}" = "--full" ]; then
  PORT=${PORT:-8843}; CDP=${CDP_PORT:-9223}
  echo "== serving site root on :$PORT =="
  ( cd ../../.. && python3 -m http.server "$PORT" >/dev/null 2>&1 ) &
  srv=$!
  trap 'kill $srv 2>/dev/null; ~/.claude/bin/cdp stop "$CDP" >/dev/null 2>&1' EXIT
  ~/.claude/bin/cdp start --port "$CDP" >/dev/null
  export CDP_PORT=$CDP BASE="http://127.0.0.1:$PORT/gms/3d/longshot/"

  echo "== 7x7 visibility audit (seeds 1,4,9) =="
  node tools/audit_visibility.mjs 1,4,9 | tee /tmp/ls_vis.txt
  if grep -q 'ZERO' /tmp/ls_vis.txt; then echo "  !! a mark is visible from 0 of 49 spots - THAT IS A BUG"; fail=1; fi

  echo "== bot sweep (seed 4) =="
  node tools/bot_sweep.mjs s01,s02,s03,s05,s08,s09,s12,s13,s17,s19,s21 4 | tee /tmp/ls_bot.txt
  won=$(grep -c WON /tmp/ls_bot.txt || true)
  # s08 is a timing window and flips on the SAME seed run to run (measured
  # 4/4 one pass, 3/4 the next, on builds that differ by nothing relevant).
  # Count it separately so it cannot fail the gate on its own; a second loss
  # alongside it still does.
  s08bad=$(grep -c '^s08.*\(LOST\|TIMEOUT\)' /tmp/ls_bot.txt || true)
  echo "  bot won $won/11 (s08 flaky-loss this run: $s08bad)"
  if [ "$won" -lt $((11 - s08bad)) ]; then
    echo "  !! A/B against 'git archive HEAD' before believing a regression"; fail=1
  elif [ "$s08bad" -gt 0 ]; then
    echo "  (s08 only - known flaky, see CLAUDE.md; re-run before believing it)"
  fi
fi

[ "$fail" = 0 ] && echo "GATE PASS" || echo "GATE FAIL"
exit $fail
