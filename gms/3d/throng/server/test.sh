#!/usr/bin/env bash
# throng server tests: gofmt + vet + Go tests, then a smoke run of the real binary (health, CORS,
# websocket upgrade, foreign origin refused, data dir mode).
#
#   ./test.sh            build + test
#   ./test.sh <binary>   also smoke-test that binary (deploy.sh RUN_TESTS uses this)
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$(command -v go || echo /usr/local/go/bin/go)"
PORT="${PORT:-18124}"
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
if CGO_ENABLED=0 "$GO" test -count=1 -timeout 120s ./... > "$TMP/gotest.log" 2>&1; then
  ok "go test ($(cat *_test.go | grep -c '^func Test') test funcs)"
else
  bad "go test"; tail -n 30 "$TMP/gotest.log"
fi

if [ -n "${1:-}" ]; then BIN="$1"; else
  BIN="$TMP/throng"
  CGO_ENABLED=0 "$GO" build -o "$BIN" . || { bad "build"; exit 1; }
fi
THRONG_ADDR="127.0.0.1:$PORT" THRONG_DATA="$TMP/data" "$BIN" > "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.2; done
B="http://127.0.0.1:$PORT/gms/3d/throng/api"
h="$(curl -sS "$B/health")"
case "$h" in *'"ok":true'*) ok "binary health";; *) bad "binary health" "$h"; cat "$TMP/server.log";; esac
pre="$(curl -sS -o /dev/null -D - "$B/boards?period=day" -H 'Origin: https://y-r-u.github.io')"
echo "$pre" | grep -qi '^access-control-allow-origin: https://y-r-u.github.io' && ok "binary CORS" || bad "binary CORS" "$pre"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://yru.br8t.com' "$B/ws" 2>/dev/null)"
[ "$code" = "101" ] && ok "binary websocket upgrade" || bad "binary websocket upgrade" "HTTP $code"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' "$B/ws" 2>/dev/null)"
[ "$code" = "403" ] && ok "binary refuses foreign origin" || bad "binary refuses foreign origin" "HTTP $code"
[ "$(stat -c '%a' "$TMP/data" 2>/dev/null || stat -f '%Lp' "$TMP/data")" = "700" ] && ok "data dir is 700" || bad "data dir mode"

echo
[ $FAIL -eq 0 ] && echo "ALL PASS" || { echo "$FAIL FAILED"; exit 1; }
