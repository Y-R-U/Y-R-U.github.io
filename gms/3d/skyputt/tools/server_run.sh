#!/usr/bin/env bash
# Run the SKYPUTT online server locally (online agent). Port 8098 is reserved for it (8094 is GAMBIT's).
#
#   tools/server_run.sh            build + run in the foreground on :8098 (Ctrl-C stops)
#   tools/server_run.sh --bg       run in the background (log: server/.run/server.log)
#   tools/server_run.sh --stop     stop a background run
#   FRESH=1 tools/server_run.sh    wipe the local DB first
#
# Dev mode: SKYPUTT_DEV_AUTH=1 accepts "dev:<uid>:<name>:<anon|signed>" tokens, so two tabs can be two
# players without Firebase (js/net/net.js picks a random per-tab uid when no Firebase token is
# available, or use ?devuid=alice&devname=Alice). Real Firebase tokens are verified as on the box.
# js/net/net.js finds this server by itself when the page is served from localhost / 192.168.x / 10.x.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRV="$HERE/server"
RUN="$SRV/.run"
PORT="${PORT:-8098}"
mkdir -p "$RUN"

if [ "${1:-}" = "--stop" ]; then
  [ -f "$RUN/pid" ] && kill "$(cat "$RUN/pid")" 2>/dev/null && echo "stopped" || echo "not running"
  rm -f "$RUN/pid"; exit 0
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use:"; lsof -nP -iTCP:"$PORT" -sTCP:LISTEN; exit 1
fi
[ -n "${FRESH:-}" ] && rm -rf "$RUN/data"
(cd "$SRV" && CGO_ENABLED=0 go build -o "$RUN/skyputt" .)

export SKYPUTT_ADDR="0.0.0.0:$PORT"
export SKYPUTT_DATA="$RUN/data"
export SKYPUTT_DEV_AUTH=1
export SKYPUTT_ORIGINS="${SKYPUTT_ORIGINS:-http://192.168.0.236:8888,http://localhost:8888,http://127.0.0.1:8888,https://games.br8t.com}"

echo "SKYPUTT server: http://localhost:$PORT/gms/3d/skyputt/api/health  (LAN: http://192.168.0.236:$PORT/…)"
echo "UI: http://192.168.0.236:8888/gms/3d/skyputt/ → Online"
if [ "${1:-}" = "--bg" ]; then
  nohup "$RUN/skyputt" > "$RUN/server.log" 2>&1 &
  echo $! > "$RUN/pid"
  for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/gms/3d/skyputt/api/health" >/dev/null && break; sleep 0.1; done
  curl -s "http://127.0.0.1:$PORT/gms/3d/skyputt/api/health"; echo
  echo "running in background (pid $(cat "$RUN/pid")), log $RUN/server.log"
else
  exec "$RUN/skyputt"
fi
