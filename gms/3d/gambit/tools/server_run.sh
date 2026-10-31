#!/usr/bin/env bash
# Run the GAMBIT server locally for UI testing (server agent).
#
#   tools/server_run.sh            build + run in the foreground on :8094 (Ctrl-C stops)
#   tools/server_run.sh --bg       run in the background (log: server/.run/server.log)
#   tools/server_run.sh --stop     stop a background run
#   FRESH=1 tools/server_run.sh    wipe the local DB first
#
# Dev mode: GAMBIT_DEV_AUTH=1 accepts "dev:<uid>:<name>:<anon|signed>" tokens, so two tabs can
# be two players without Firebase (net.js picks a random per-tab uid when no Firebase token is
# available, or use ?devuid=alice&devname=Alice[&devsigned=1]). Real Firebase tokens (anonymous
# or signed in) are verified against Google's certs as on the box.
# Allowance: this is Aaron's home server, so by default everyone on it plays UNLIMITED online
# games (Aaron, 2026-10-31). LIMITS=1 restores the "fake" allowance the tests need (guests 2/day
# and signed-in 5/day counted locally; dev uids that start with "pass", e.g.
# ?devuid=pass1&devsigned=1, have a BR8T Pass) — tools/online_cdp.mjs wants LIMITS=1.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRV="$HERE/server"
RUN="$SRV/.run"
PORT="${PORT:-8094}"
mkdir -p "$RUN"

if [ "${1:-}" = "--stop" ]; then
  [ -f "$RUN/pid" ] && kill "$(cat "$RUN/pid")" 2>/dev/null && echo "stopped" || echo "not running"
  rm -f "$RUN/pid"; exit 0
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use:"; lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
  echo "(the always-on home server is launchd com.airon.gambit-local — it IS this server, unlimited."
  echo " For a LIMITS=1 test run: launchctl unload ~/Library/LaunchAgents/com.airon.gambit-local.plist, test, then load it again;"
  echo " after server code changes: (cd server && go build -o .run/gambit .) && launchctl kickstart -k gui/\$(id -u)/com.airon.gambit-local)"
  exit 1
fi
[ -n "${FRESH:-}" ] && rm -rf "$RUN/data"
(cd "$SRV" && CGO_ENABLED=0 go build -o "$RUN/gambit" .)

export GAMBIT_ADDR="0.0.0.0:$PORT"
export GAMBIT_DATA="$RUN/data"
export GAMBIT_DEV_AUTH=1
if [ -n "${LIMITS:-}" ]; then
  export GAMBIT_ALLOWANCE="${GAMBIT_ALLOWANCE:-fake}"
else
  export GAMBIT_ALLOWANCE="${GAMBIT_ALLOWANCE:-off}" GAMBIT_ANON_PER_DAY="${GAMBIT_ANON_PER_DAY:-0}" GAMBIT_ANON_PER_IP_DAY="${GAMBIT_ANON_PER_IP_DAY:-0}"
fi
export GAMBIT_ORIGINS="${GAMBIT_ORIGINS:-http://192.168.0.236:8888,http://localhost:8888,http://127.0.0.1:8888,https://games.br8t.com}"

echo "GAMBIT server: http://localhost:$PORT/gms/3d/gambit/api/health  (LAN: http://192.168.0.236:$PORT/…)"
echo "UI: http://192.168.0.236:8888/gms/3d/gambit/  — net.js finds this server automatically on LAN/localhost"
if [ "${1:-}" = "--bg" ]; then
  nohup "$RUN/gambit" > "$RUN/server.log" 2>&1 &
  echo $! > "$RUN/pid"
  for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/gms/3d/gambit/api/health" >/dev/null && break; sleep 0.1; done
  curl -s "http://127.0.0.1:$PORT/gms/3d/gambit/api/health"; echo
  echo "running in background (pid $(cat "$RUN/pid")), log $RUN/server.log"
else
  exec "$RUN/gambit"
fi
