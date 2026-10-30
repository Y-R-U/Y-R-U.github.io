#!/usr/bin/env bash
# gambit server tests: gofmt + vet + Go tests (perft, clocks, Glicko-2, allowance tiers,
# two-client integration games), then a smoke run of the real binary.
#
#   ./test.sh            build + test
#   ./test.sh <binary>   also smoke-test that binary (deploy.sh RUN_TESTS uses this)
#   SHORT=1 ./test.sh    skip the deep perft depths (on the 1-CPU box)
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$(command -v go || echo /usr/local/go/bin/go)"
PORT="${PORT:-8098}"
TMP="$(mktemp -d)"
FAIL=0
cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
ok()  { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }

cd "$HERE"
unformatted="$("$(dirname "$GO")/gofmt" -l . 2>/dev/null || gofmt -l .)"
[ -z "$unformatted" ] && ok "gofmt" || bad "gofmt" "$unformatted"
"$GO" vet ./... && ok "go vet" || bad "go vet"
short=""; [ -n "${SHORT:-}" ] && short="-short"
if CGO_ENABLED=0 "$GO" test $short -count=1 -timeout 300s ./... > "$TMP/gotest.log" 2>&1; then
  ok "go test ($(grep -c '^func Test' *_test.go | awk -F: '{s+=$2} END {print s}') test funcs)"
else
  bad "go test"; tail -n 30 "$TMP/gotest.log"
fi

if [ -n "${1:-}" ]; then BIN="$1"; else
  BIN="$TMP/gambit"
  CGO_ENABLED=0 "$GO" build -o "$BIN" . || { bad "build"; exit 1; }
fi
GAMBIT_ADDR="127.0.0.1:$PORT" GAMBIT_DATA="$TMP/data" "$BIN" > "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.2; done
B="http://127.0.0.1:$PORT/gms/3d/gambit/api"
h="$(curl -sS "$B/health")"
case "$h" in *'"ok":true'*'"devAuth":false'*|*'"devAuth":false'*'"ok":true'*) ok "binary health (devAuth off)";; *) bad "binary health" "$h"; cat "$TMP/server.log";; esac
pre="$(curl -sS -o /dev/null -D - "$B/leaderboard" -H 'Origin: https://y-r-u.github.io')"
echo "$pre" | grep -qi '^access-control-allow-origin: https://y-r-u.github.io' && ok "binary CORS" || bad "binary CORS" "$pre"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://games.br8t.com' "$B/ws" 2>/dev/null)"
[ "$code" = "101" ] && ok "binary websocket upgrade" || bad "binary websocket upgrade" "HTTP $code"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' "$B/ws" 2>/dev/null)"
[ "$code" = "403" ] && ok "binary refuses foreign origin" || bad "binary refuses foreign origin" "HTTP $code"
[ "$(stat -c '%a' "$TMP/data" 2>/dev/null || stat -f '%Lp' "$TMP/data")" = "700" ] && ok "data dir is 700" || bad "data dir mode"

echo
[ $FAIL -eq 0 ] && echo "ALL PASS" || { echo "$FAIL FAILED"; exit 1; }
