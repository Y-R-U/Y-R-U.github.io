#!/usr/bin/env bash
# clued server tests: gofmt + vet + Go tests (rooms, scoring, expiry, rate limits,
# CORS, SSE, challenges, Firebase), then a smoke run of the real binary.
#
#   ./test.sh            build + test
#   ./test.sh <binary>   also smoke-test that binary (deploy.sh RUN_TESTS uses this)
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$(command -v go || echo /usr/local/go/bin/go)"
PORT="${PORT:-8097}"
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
if CGO_ENABLED=0 "$GO" test -count=1 ./... > "$TMP/gotest.log" 2>&1; then
  ok "go test ($(grep -c '^func Test' *_test.go) test funcs)"
else
  bad "go test"; grep -v 'expired$' "$TMP/gotest.log" | tail -n 30
fi

if [ -n "${1:-}" ]; then BIN="$1"; else
  BIN="$TMP/clued"
  CGO_ENABLED=0 "$GO" build -o "$BIN" . || { bad "build"; exit 1; }
fi
CLUED_ADDR="127.0.0.1:$PORT" CLUED_DATA="$TMP/data" "$BIN" > "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.2; done
B="http://127.0.0.1:$PORT/gms/2d/clued/api"
h="$(curl -sS "$B/health")"
case "$h" in *'"ok":true'*) ok "binary health";; *) bad "binary health" "$h"; cat "$TMP/server.log";; esac
pre="$(curl -sS -o /dev/null -D - -X OPTIONS "$B/rooms" -H 'Origin: https://y-r-u.github.io' -H 'Access-Control-Request-Method: POST')"
case "$pre" in *'access-control-allow-origin: https://y-r-u.github.io'*|*'Access-Control-Allow-Origin: https://y-r-u.github.io'*) ok "binary CORS preflight";; *) bad "binary CORS preflight" "$pre";; esac
code="$(curl -sS -X POST "$B/rooms" -H 'Content-Type: application/json' \
  -d '{"hostName":"Smoke","questions":[{"format":"mc","answer":0,"options":[{"text":"a"},{"text":"b"}]}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["code"])' 2>/dev/null)"
[ ${#code} -eq 5 ] && ok "binary creates room $code" || bad "binary create room"
[ "$(stat -c '%a' "$TMP/data" 2>/dev/null || stat -f '%Lp' "$TMP/data")" = "700" ] && ok "data dir is 700" || bad "data dir mode"

echo
[ $FAIL -eq 0 ] && echo "ALL PASS" || { echo "$FAIL FAILED"; exit 1; }
