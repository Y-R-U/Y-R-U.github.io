#!/usr/bin/env bash
# R2 reviewer repro: one signed-in player, one world, N concurrent 8 MB blob PUTs.
# Every body is read fully into memory before the version / quota check.
#   N=30 bash tools/review_b_memburst.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../server" && pwd)"
PORT="${PORT:-8132}"; N="${N:-30}"
BASE="http://127.0.0.1:$PORT"; P="/gms/3d/synthwild"
TMP="$(mktemp -d)"
cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
(cd "$HERE" && CGO_ENABLED=0 go build -o "$TMP/sw" .) || exit 1
export SYNTHWILD_ADDR="127.0.0.1:$PORT" SYNTHWILD_DATA="$TMP/data" SYNTHWILD_INSECURE_COOKIE=1 \
       SYNTHWILD_PUBLIC_URL="$BASE$P" GOMEMLIMIT=96MiB
"$TMP/sw" > "$TMP/log" 2>&1 & SRV=$!
for i in $(seq 1 50); do curl -sf "$BASE/api/health" >/dev/null && break; sleep 0.2; done
c() { curl -sS -b "$TMP/j" -c "$TMP/j" "$@"; }
c -o /dev/null "$("$TMP/sw" admin-link aaron@br8t.com 2>/dev/null)"
id=$(c -H 'Content-Type: application/json' -d '{"name":"x"}' "$BASE$P/api/worlds" | python3 -c 'import sys,json;print(json.load(sys.stdin)["world"]["id"])')
head -c $((8*1024*1024 - 16)) /dev/urandom > "$TMP/big"
( while kill -0 $SRV 2>/dev/null; do ps -o rss= -p $SRV; sleep 0.05; done ) > "$TMP/rss" & MON=$!
PIDS=()
for i in $(seq 1 "$N"); do
  c -o /dev/null -w '%{http_code} ' -X PUT -H 'Content-Type: application/octet-stream' \
    --data-binary @"$TMP/big" "$BASE$P/api/worlds/$id/blob?version=0" & PIDS+=($!)
done
wait "${PIDS[@]}"; echo
kill $MON 2>/dev/null
echo "N=$N concurrent 8 MB PUTs to one world: peak RSS $(sort -n "$TMP/rss" | tail -1 | awk '{printf "%.0f MiB", $1/1024}') (prod unit: GOMEMLIMIT=96MiB, MemoryMax=192M)"
