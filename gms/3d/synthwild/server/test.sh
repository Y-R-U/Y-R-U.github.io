#!/usr/bin/env bash
# End-to-end API test for the synthwild server. Builds (or takes) the binary,
# runs it on a spare port against a throwaway data dir with fake Google certs,
# and exercises every auth boundary and limit.
#
# Usage: ./test.sh [path-to-binary]
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$(command -v go || echo /usr/local/go/bin/go)"
PORT="${PORT:-8098}"
BASE="http://127.0.0.1:$PORT"
P="/gms/3d/synthwild"
TMP="$(mktemp -d)"
PASS=0; FAIL=0

cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${KEEP:-}" ] && echo "kept $TMP" || rm -rf "$TMP"; }
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }
head1(){ printf '\n\033[1m%s\033[0m\n' "$1"; }
check()   { case "$2" in *"$3"*) ok "$1";; *) bad "$1" "got: ${2:0:240}";; esac; }
checkno() { case "$2" in *"$3"*) bad "$1" "got: ${2:0:240}";; *) ok "$1";; esac; }
eq()      { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got: ${2:0:240}  want: $3"; }

ip() { echo "10.$((RANDOM%250)).$((RANDOM%250)).$((RANDOM%250))"; }

# req <jar> <method> <path> [json-body]   (body + status on the last line)
req() {
  local jar="$TMP/$1.jar" m="$2" p="$3" b="${4:-}"
  local args=(-sS -b "$jar" -c "$jar" -X "$m" -H "X-Forwarded-For: $(ip)" -w '\n%{http_code}')
  [ -n "$b" ] && args+=(-H 'Content-Type: application/json' --data-binary "$b")
  curl "${args[@]}" "$BASE$P$p"
}
code() { req "$@" | tail -n1; }
# read-only jar, safe to run many in parallel
pcode() { curl -sS -o /dev/null -w '%{http_code}' -b "$TMP/$1.jar" -X "$2" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' --data-binary "$4" "$BASE$P$3"; }
pput() { curl -sS -o /dev/null -w '%{http_code}' -b "$TMP/$1.jar" -X PUT -H "X-Forwarded-For: $(ip)" -H "Content-Type: $3" --data-binary "@$4" "$BASE$P$2"; }
body() { req "$@" | sed '$d'; }
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
# put <jar> <path> <content-type> <file>  -> status
put() {
  curl -sS -o "$TMP/put.out" -w '%{http_code}' -b "$TMP/$1.jar" -c "$TMP/$1.jar" -X PUT \
    -H "X-Forwarded-For: $(ip)" -H "Content-Type: $3" --data-binary "@$4" "$BASE$P$2"
}

# ─────────────────────────────────────────────────────────── build + start
if [ -n "${1:-}" ]; then BIN="$1"; else
  BIN="$TMP/synthwild"
  (cd "$HERE" && CGO_ENABLED=0 "$GO" build -o "$BIN" .) || { echo "build failed"; exit 1; }
fi
MINT="$TMP/mintjwt"
(cd "$HERE/../tools" && "$GO" build -o "$MINT" server_mintjwt.go) || { echo "mint helper build failed"; exit 1; }
"$MINT" keygen "$TMP"
mint() { "$MINT" mint "$TMP" "$@"; }

export SYNTHWILD_ADDR="127.0.0.1:$PORT" SYNTHWILD_DATA="$TMP/data" SYNTHWILD_INSECURE_COOKIE=1 \
       SYNTHWILD_TEST_CERTS="$TMP/certs.json" SYNTHWILD_GLOBAL_CAP=$((12*1024*1024)) SYNTHWILD_UPLOAD_SLOTS=3 \
       SYNTHWILD_PUBLIC_URL="$BASE$P"
"$BIN" > "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "$BASE$P/api/health" >/dev/null && break; sleep 0.2; done
curl -sf "$BASE$P/api/health" >/dev/null || { echo "server failed to start:"; cat "$TMP/server.log"; exit 1; }

head1 "health + routing"
check "health under the game prefix"        "$(curl -sS $BASE$P/api/health)" '"ok":true'
check "health without the prefix"           "$(curl -sS $BASE/api/health)" '"name":"synthwild"'
eq    "unknown endpoint is 404"             "$(code anon GET /api/nope)" 404
check "API responses are no-store"          "$(curl -sSI $BASE$P/api/health)" 'no-store'
eq    "static is off by default"            "$(curl -s -o /dev/null -w '%{http_code}' $BASE$P/index.html)" 404

head1 "anonymous boundaries"
check "me is null when signed out"          "$(body anon GET /api/me)" '"user":null'
eq    "list worlds needs a session"         "$(code anon GET /api/worlds)" 401
eq    "public worlds need a session"        "$(code anon GET '/api/worlds?scope=public')" 401
eq    "create world needs a session"        "$(code anon POST /api/worlds '{"name":"x"}')" 401
eq    "admin users needs a session"         "$(code anon GET /api/admin/users)" 401
eq    "add user needs a session"            "$(code anon POST /api/admin/users '{"username":"hacker"}')" 401
eq    "remove user needs a session"         "$(code anon DELETE /api/admin/users/aaron)" 401
eq    "forged cookie is rejected"           "$(curl -s -o /dev/null -w '%{http_code}' -b 'sw_session=forged' $BASE$P/api/worlds)" 401

head1 "admin Google sign-in (token verification)"
eq "garbage token → 401"                    "$(code x POST /api/admin/google '{"idToken":"abc.def.ghi"}')" 401
eq "missing token → 401"                    "$(code x POST /api/admin/google '{}')" 401
eq "bad signature → 401"                    "$(code x POST /api/admin/google "{\"idToken\":\"$(mint badsig=1)\"}")" 401
eq "wrong aud → 401"                        "$(code x POST /api/admin/google "{\"idToken\":\"$(mint aud=other-project)\"}")" 401
eq "wrong iss → 401"                        "$(code x POST /api/admin/google "{\"idToken\":\"$(mint iss=https://evil.example/br8t-games)\"}")" 401
eq "expired → 401"                          "$(code x POST /api/admin/google "{\"idToken\":\"$(mint exp=-60)\"}")" 401
eq "issued in the future → 401"             "$(code x POST /api/admin/google "{\"idToken\":\"$(mint iat=3600)\"}")" 401
eq "unverified email → 401"                 "$(code x POST /api/admin/google "{\"idToken\":\"$(mint verified=false)\"}")" 401
eq "unknown kid → 401"                      "$(code x POST /api/admin/google "{\"idToken\":\"$(mint kid=nope)\"}")" 401
eq "alg other than RS256 → 401"             "$(code x POST /api/admin/google "{\"idToken\":\"$(mint alg=HS256)\"}")" 401
eq "valid token, non-admin email → 403"     "$(code x POST /api/admin/google "{\"idToken\":\"$(mint email=someone@gmail.com)\"}")" 403
eq "lookalike admin email → 403"            "$(code x POST /api/admin/google "{\"idToken\":\"$(mint email=aaron@itmatters.mobi.evil.io)\"}")" 403
eq "old br8t.com admin email → 403"       "$(code x POST /api/admin/google "{\"idToken\":\"$(mint email=aaron@br8t.com)\"}")" 403
check "x is still signed out"               "$(body x GET /api/me)" '"user":null'
r=$(body admin POST /api/admin/google "{\"idToken\":\"$(mint email=Aaron@ItMatters.MOBI)\"}")
check "aaron signs in (email case-insensitive)" "$r" '"admin":true'
check "aaron gets player username 'aaron'"  "$r" '"username":"aaron"'
check "me shows admin"                      "$(body admin GET /api/me)" '"admin":true'
r=$(body dante POST /api/admin/google "{\"idToken\":\"$(mint email=dante@itmatters.mobi)\"}")
check "dante signs in as admin"             "$r" '"username":"dante"'

head1 "admin user management"
r=$(req admin POST /api/admin/users '{"username":"kid_one","display":"Kid  One"}')
eq    "add kid_one → 201"                   "$(echo "$r" | tail -n1)" 201
check "display is tidied"                   "$r" '"display":"Kid One"'
eq    "duplicate username → 409"            "$(code admin POST /api/admin/users '{"username":"kid_one"}')" 409
eq    "upper case is folded (Kid_Two ok)"   "$(code admin POST /api/admin/users '{"username":"Kid_Two","display":"Two"}')" 201
for n in ab a-b 'a b' '../etc' 'x@y' abcdefghijklmnopqrstu ''; do
  eq  "bad username '$n' → 400"            "$(code admin POST /api/admin/users "{\"username\":\"$n\"}")" 400
done
eq    "add an admin's own name → 409"       "$(code admin POST /api/admin/users '{"username":"dante"}')" 409
r=$(body admin GET /api/admin/users)
check "list has kid_one"                    "$r" '"username":"kid_one"'
check "list has kid_two"                    "$r" '"username":"kid_two"'
check "list marks admin accounts"           "$r" '"adminEmail":"aaron@itmatters.mobi"'
eq    "admin player can't be removed"       "$(code admin DELETE /api/admin/users/dante)" 400
eq    "removing a missing user → 404"       "$(code admin DELETE /api/admin/users/nobody)" 404
eq    "oversize JSON body → 400"            "$(code admin POST /api/admin/users "{\"username\":\"$(head -c 70000 /dev/zero | tr '\0' a)\"}")" 400

head1 "username login"
r=$(curl -sS -D "$TMP/h1" -c "$TMP/kid1.jar" -H 'Content-Type: application/json' -d '{"username":"KID_ONE"}' "$BASE$P/api/login")
check "kid_one logs in with just a username" "$r" '"username":"kid_one"'
check "kid_one is not admin"                 "$r" '"admin":false'
h=$(grep -i '^set-cookie' "$TMP/h1")
check "cookie is HttpOnly"                   "$h" 'HttpOnly'
check "cookie is SameSite=Lax"               "$h" 'SameSite=Lax'
check "cookie is scoped to the game path"    "$h" "Path=$P/"
check "cookie is long-lived"                 "$h" 'Max-Age=34560000'
eq    "unknown username → 404"               "$(code y POST /api/login '{"username":"ghost"}')" 404
eq    "invalid username → 404"               "$(code y POST /api/login '{"username":"../../x"}')" 404
eq    "bad JSON → 400"                       "$(code y POST /api/login 'nope')" 400
r=$(body kid2 POST /api/login '{"username":"kid_two"}')
check "kid_two logs in"                      "$r" '"username":"kid_two"'
eq    "B1b admin player name can't log in by username" "$(code aaronplay POST /api/login '{"username":"aaron"}')" 404
check "B1b same generic error as an unknown name" "$(body aaronplay POST /api/login '{"username":"dante"}')" '"error":"no such player"'
eq    "player session can't list users"      "$(code kid1 GET /api/admin/users)" 403
eq    "player session can't add users"       "$(code kid1 POST /api/admin/users '{"username":"sneaky"}')" 403
eq    "player session can't remove users"    "$(code kid1 DELETE /api/admin/users/kid_two)" 403
eq    "no session from the admin-name attempt" "$(code aaronplay GET /api/admin/users)" 401
eq    "cross-origin POST is refused"         "$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{"username":"kid_one"}' $BASE$P/api/login)" 403
eq    "same-origin POST is fine"             "$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: $BASE" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d '{"username":"kid_one"}' $BASE$P/api/login)" 200

head1 "logout"
cp "$TMP/kid2.jar" "$TMP/kid2old.jar"
eq    "logout → 200"                         "$(code kid2 POST /api/logout)" 200
check "me is null after logout"              "$(body kid2 GET /api/me)" '"user":null'
eq    "the old cookie is dead server-side"   "$(code kid2old GET /api/worlds)" 401
body kid2 POST /api/login '{"username":"kid_two"}' >/dev/null

head1 "worlds"
r=$(body kid1 POST /api/worlds '{"name":"  Glow  Forest ","seed":12345,"mode":"build"}')
W=$(echo "$r" | jget "['world']['id']")
check "create → world id"                    "$W" 'w_'
check "name is tidied"                       "$r" '"name":"Glow Forest"'
check "numeric seed stored as string"        "$r" '"seed":"12345"'
check "new world is version 0, private"      "$r" '"version":0'
check "new world is private"                 "$r" '"public":false'
eq    "bad mode → 400"                       "$(code kid1 POST /api/worlds '{"name":"x","mode":"hardcore"}')" 400
eq    "empty name → 400"                     "$(code kid1 POST /api/worlds '{"name":"   "}')" 400
eq    "49-char name → 400"                   "$(code kid1 POST /api/worlds "{\"name\":\"$(printf 'n%.0s' $(seq 49))\"}")" 400
eq    "65-char seed → 400"                   "$(code kid1 POST /api/worlds "{\"name\":\"s\",\"seed\":\"$(printf 's%.0s' $(seq 65))\"}")" 400
check "listMine has it"                      "$(body kid1 GET /api/worlds)" "\"id\":\"$W\""
eq    "bad scope → 400"                      "$(code kid1 GET '/api/worlds?scope=all')" 400

printf '{"hello":"world","n":1}' | gzip -c > "$TMP/save1.gz"
printf '{"hello":"again","n":2}' | gzip -c > "$TMP/save2.gz"
eq    "save without version → 400"           "$(put kid1 /api/worlds/$W/blob application/gzip $TMP/save1.gz)" 400
eq    "save v0 → 200"                        "$(put kid1 "/api/worlds/$W/blob?version=0" application/gzip $TMP/save1.gz)" 200
check "version is now 1"                     "$(cat $TMP/put.out)" '"version":1'
eq    "stale save (v0 again) → 409"          "$(put kid1 "/api/worlds/$W/blob?version=0" application/gzip $TMP/save2.gz)" 409
check "409 carries the current world"        "$(cat $TMP/put.out)" '"version":1'
check "409 code is conflict"                 "$(cat $TMP/put.out)" '"code":"conflict"'
eq    "save v1 → 200"                        "$(put kid1 "/api/worlds/$W/blob?version=1" application/gzip $TMP/save2.gz)" 200
curl -sS -D "$TMP/h2" -o "$TMP/got.gz" -b "$TMP/kid1.jar" "$BASE$P/api/worlds/$W/blob"
eq    "blob round-trips byte for byte"       "$(cmp -s $TMP/got.gz $TMP/save2.gz && echo same)" same
check "blob carries X-World-Version"         "$(cat $TMP/h2)" 'X-World-Version: 2'
check "blob keeps its content type"          "$(cat $TMP/h2)" 'application/gzip'
printf 'hi' > "$TMP/x.txt"
eq    "text/plain blob → 415"                "$(put kid1 "/api/worlds/$W/blob?version=2" text/plain $TMP/x.txt)" 415
: > "$TMP/empty"
eq    "empty blob → 400"                     "$(put kid1 "/api/worlds/$W/blob?version=2" application/json $TMP/empty)" 400
head -c $((8*1024*1024+1)) /dev/zero > "$TMP/big"
eq    "8 MB + 1 blob → 413"                  "$(put kid1 "/api/worlds/$W/blob?version=2" application/octet-stream $TMP/big)" 413
eq    "version unchanged after rejects"      "$(body kid1 GET /api/worlds/$W | jget "['world']['version']")" 2

printf '\xff\xd8\xff\xe0fakejpeg' > "$TMP/t.jpg"
eq    "png-ish thumb → 415"                  "$(put kid1 /api/worlds/$W/thumb image/jpeg $TMP/x.txt)" 415
eq    "jpeg thumb → 200"                     "$(put kid1 /api/worlds/$W/thumb image/jpeg $TMP/t.jpg)" 200
check "world now has a thumb"                "$(cat $TMP/put.out)" '"thumb":true'
{ printf '\xff\xd8\xff'; head -c $((100*1024)) /dev/zero; } > "$TMP/bigthumb.jpg"
eq    "thumb over 100 KB → 413"              "$(put kid1 /api/worlds/$W/thumb image/jpeg $TMP/bigthumb.jpg)" 413
eq    "thumb fetch → 200"                    "$(curl -s -o /dev/null -w '%{http_code}' -b $TMP/kid1.jar $BASE$P/api/worlds/$W/thumb)" 200
eq    "thumb version unchanged"              "$(body kid1 GET /api/worlds/$W | jget "['world']['version']")" 2

head1 "privacy + public visibility"
eq    "kid_two can't get a private world"    "$(code kid2 GET /api/worlds/$W)" 404
eq    "kid_two can't read its blob"          "$(code kid2 GET /api/worlds/$W/blob)" 404
eq    "kid_two can't read its thumb"         "$(code kid2 GET /api/worlds/$W/thumb)" 404
eq    "kid_two can't patch it"               "$(code kid2 PATCH /api/worlds/$W '{"public":true}')" 404
eq    "kid_two can't delete it"              "$(code kid2 DELETE /api/worlds/$W)" 404
eq    "kid_two can't overwrite it"           "$(put kid2 "/api/worlds/$W/blob?version=2" application/gzip $TMP/save1.gz)" 404
checkno "not in kid_two's public list"       "$(body kid2 GET '/api/worlds?scope=public')" "$W"
checkno "not in kid_two's own list"          "$(body kid2 GET /api/worlds)" "$W"
r=$(body kid1 PATCH /api/worlds/$W '{"public":true,"name":"Shared Glow"}')
check "owner makes it public + renames"      "$r" '"public":true'
check "rename applied"                       "$r" '"name":"Shared Glow"'
eq    "patch with bad name → 400"            "$(code kid1 PATCH /api/worlds/$W '{"name":""}')" 400
r=$(body kid2 GET '/api/worlds?scope=public')
check "public list shows it to kid_two"      "$r" "\"id\":\"$W\""
checkno "B1a public list never carries owner"  "$r" '"owner"'
checkno "B1a public list never shows the username" "$r" 'kid_one'
check "B1a a display that is the username is masked" "$r" '"ownerDisplay":"Player '
checkno "B1a single world view hides the owner" "$(body kid2 GET /api/worlds/$W)" 'kid_one'
check "owner still sees their own username"  "$(body kid1 GET /api/worlds/$W)" '"owner":"kid_one"'
check "public list marks it not mine"        "$r" '"mine":false'
eq    "kid_two can open the public world"    "$(code kid2 GET /api/worlds/$W)" 200
curl -sS -o "$TMP/got2.gz" -b "$TMP/kid2.jar" "$BASE$P/api/worlds/$W/blob"
eq    "kid_two can read the public blob"     "$(cmp -s $TMP/got2.gz $TMP/save2.gz && echo same)" same
eq    "kid_two still can't overwrite it"     "$(put kid2 "/api/worlds/$W/blob?version=2" application/gzip $TMP/save1.gz)" 403
eq    "kid_two still can't patch it"         "$(code kid2 PATCH /api/worlds/$W '{"public":false}')" 403
eq    "kid_two still can't delete it"        "$(code kid2 DELETE /api/worlds/$W)" 403
eq    "kid_two still can't change its thumb" "$(put kid2 /api/worlds/$W/thumb image/jpeg $TMP/t.jpg)" 403
r=$(body kid2 POST /api/worlds '{"name":"Copy of Shared Glow","seed":"12345","mode":"build"}')
C=$(echo "$r" | jget "['world']['id']")
eq    "'save a copy' = create + save"        "$(put kid2 "/api/worlds/$C/blob?version=0" application/gzip $TMP/got2.gz)" 200

head1 "path traversal + malformed ids"
for p in "/api/worlds/..%2f..%2fetc%2fpasswd" "/api/worlds/w_../blob" "/api/worlds/w_0123456789abcdeg" "/api/worlds/W_0123456789ABCDEF" "/api/worlds/$W%00" "/api/worlds/$W'%20OR%201=1--"; do
  eq  "GET $p → 404"                        "$(code kid1 GET "$p")" 404
done
eq    "raw ../ in the URL path → 404"        "$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -b $TMP/kid1.jar "$BASE$P/api/../../../../etc/passwd")" 404
eq    "raw ../ to the blob route → 404"      "$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -b $TMP/kid1.jar "$BASE$P/api/worlds/../../synthwild.db")" 404
eq    "removing a user by ../ name → 404"    "$(code admin DELETE '/api/admin/users/..%2Fkid_one')" 404

head1 "removing a username"
eq    "admin removes kid_one"                "$(code admin DELETE /api/admin/users/kid_one)" 200
eq    "kid_one's session is dead"            "$(code kid1 GET /api/worlds)" 401
eq    "kid_one can't log in"                 "$(code z POST /api/login '{"username":"kid_one"}')" 404
checkno "kid_one gone from the user list"    "$(body admin GET /api/admin/users)" '"kid_one"'
checkno "their public world is hidden"       "$(body kid2 GET '/api/worlds?scope=public')" "$W"
eq    "and can't be opened"                  "$(code kid2 GET /api/worlds/$W)" 404
eq    "re-adding the name → 201"             "$(code admin POST /api/admin/users '{"username":"kid_one","display":"Kid One"}')" 201
body kid1 POST /api/login '{"username":"kid_one"}' >/dev/null
checkno "B12 the new kid_one gets NONE of the old worlds" "$(body kid1 GET /api/worlds)" "$W"
eq    "B12 the old public world stays hidden" "$(code kid2 GET /api/worlds/$W)" 404
eq    "B12 the new account can't touch it"   "$(code kid1 DELETE /api/worlds/$W)" 404

head1 "delete"
eq    "owner deletes the copy"               "$(code kid2 DELETE /api/worlds/$C)" 200
eq    "deleted world is gone"                "$(code kid2 GET /api/worlds/$C)" 404
eq    "its blob is gone"                     "$(code kid2 GET /api/worlds/$C/blob)" 404

head1 "caps"
n=$(body kid1 GET /api/worlds | jget "['worlds'].__len__()")
for i in $(seq $((n+1)) 50); do code kid1 POST /api/worlds "{\"name\":\"w$i\"}" >/dev/null; done
eq    "kid_one now has 50 worlds"            "$(body kid1 GET /api/worlds | jget "['worlds'].__len__()")" 50
r=$(req kid1 POST /api/worlds '{"name":"one too many"}')
eq    "51st world → 403"                     "$(echo "$r" | tail -n1)" 403
check "with code quota"                      "$r" '"code":"quota"'
head -c $((8*1024*1024)) /dev/urandom > "$TMP/eight"
B1=$(body kid2 POST /api/worlds '{"name":"big one"}' | jget "['world']['id']")
B2=$(body kid2 POST /api/worlds '{"name":"big two"}' | jget "['world']['id']")
eq    "exactly 8 MB blob is accepted"        "$(put kid2 "/api/worlds/$B1/blob?version=0" application/octet-stream $TMP/eight)" 200
eq    "global cap (12 MB in test) → 507"     "$(put kid2 "/api/worlds/$B2/blob?version=0" application/octet-stream $TMP/eight)" 507
check "with code quota"                      "$(cat $TMP/put.out)" '"code":"quota"'
eq    "re-saving the same size still fits"   "$(put kid2 "/api/worlds/$B1/blob?version=1" application/octet-stream $TMP/eight)" 200
code kid2 DELETE /api/worlds/$B1 >/dev/null
eq    "after delete the space is free"       "$(put kid2 "/api/worlds/$B2/blob?version=0" application/octet-stream $TMP/eight)" 200

head1 "B5 atomic quotas"
for u in racer_a racer_b racer_c; do code admin POST /api/admin/users "{\"username\":\"$u\"}" >/dev/null; body $u POST /api/login "{\"username\":\"$u\"}" >/dev/null; done
PIDS=()
for i in $(seq 1 60); do pcode racer_a POST /api/worlds "{\"name\":\"r$i\"}" > /dev/null & PIDS+=($!); done
wait "${PIDS[@]}"
eq    "B5 60 concurrent creates → exactly 50 worlds" "$(body racer_a GET /api/worlds | jget "['worlds'].__len__()")" 50
used=$(python3 - "$TMP/data/synthwild.db" <<'PY'
import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select sum(size+thumb_size) from worlds").fetchone()[0])
PY
)
room=$(( 12*1024*1024 - used ))
chunk=$(( room / 2 + 4096 ))
head -c $chunk /dev/urandom > "$TMP/chunk"
for u in racer_a racer_b racer_c; do eval "R_$u=\$(body $u POST /api/worlds '{\"name\":\"cap race\"}' | jget \"['world']['id']\")"; done
code racer_a DELETE /api/worlds/$(body racer_a GET /api/worlds | jget "['worlds'][-1]['id']") >/dev/null
R_racer_a=$(body racer_a POST /api/worlds '{"name":"cap race"}' | jget "['world']['id']")
PIDS=()
for u in racer_a racer_b racer_c; do id=$(eval echo \$R_$u); ( pput $u "/api/worlds/$id/blob?version=0" application/octet-stream $TMP/chunk > "$TMP/race_$u" ) & PIDS+=($!); done
wait "${PIDS[@]}"
oks=$(cat $TMP/race_racer_* | grep -o 200 | wc -l | tr -d ' ')
eq    "B5 3 concurrent uploads that each fit alone, 2 would overflow → only 1 stored" "$oks" 1
used2=$(python3 - "$TMP/data/synthwild.db" <<'PY'
import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select sum(size+thumb_size) from worlds").fetchone()[0])
PY
)
eq    "B5 stored bytes stay under the global cap" "$([ "$used2" -le $((12*1024*1024)) ] && echo under)" under

head1 "B2 upload checks before the body + upload slots"
code kid2 DELETE /api/worlds/$B2 >/dev/null
cat > "$TMP/slow.py" <<'PY'
import socket, sys
port, path, cookie, cl, hold = int(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4]), float(sys.argv[5])
s = socket.create_connection(("127.0.0.1", port))
s.sendall((f"PUT {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nCookie: sw_session={cookie}\r\n"
           f"Content-Type: application/octet-stream\r\nContent-Length: {cl}\r\n\r\n").encode() + b"x" * 1024)
s.settimeout(hold)
try:
    print(s.recv(200).split(b"\r\n")[0].split(b" ")[1].decode())
except socket.timeout:
    print("timeout")
PY
ck() { grep sw_session "$TMP/$1.jar" | awk '{print $NF}'; }
W_A=$(body racer_a GET /api/worlds | jget "['worlds'][0]['id']")
VA=$(body racer_a GET /api/worlds/$W_A | jget "['world']['version']")
eq    "B2 stale version answers 409 before the 8 MB body arrives" "$(python3 $TMP/slow.py $PORT "$P/api/worlds/$W_A/blob?version=$((VA+5))" "$(ck racer_a)" $((8*1024*1024)) 3)" 409
eq    "B2 oversize Content-Length answers 413 before the body" "$(python3 $TMP/slow.py $PORT "$P/api/worlds/$W_A/blob?version=$VA" "$(ck racer_a)" $((9*1024*1024)) 3)" 413
eq    "B2 chunked (no Content-Length) upload → 411" "$(curl -s -o /dev/null -w '%{http_code}' -b $TMP/racer_a.jar -X PUT -H 'Transfer-Encoding: chunked' -H 'Content-Type: application/json' --data-binary @$TMP/x.txt "$BASE$P/api/worlds/$W_A/blob?version=$VA")" 411
python3 $TMP/slow.py $PORT "$P/api/worlds/$W_A/blob?version=$VA" "$(ck racer_a)" 1000000 6 > "$TMP/hold_a" &
HA=$!
sleep 0.7
W_A2=$(body racer_a GET /api/worlds | jget "['worlds'][1]['id']")
VA2=$(body racer_a GET /api/worlds/$W_A2 | jget "['world']['version']")
eq    "B2 a second upload by the same user while one is in flight → 503" "$(put racer_a "/api/worlds/$W_A2/blob?version=$VA2" application/gzip $TMP/save1.gz)" 503
check "with code busy"                       "$(cat $TMP/put.out)" '"code":"busy"'
HOLDS=($HA)
for u in racer_b racer_c; do
  id=$(body $u GET /api/worlds | jget "['worlds'][0]['id']"); v=$(body $u GET /api/worlds/$id | jget "['world']['version']")
  python3 $TMP/slow.py $PORT "$P/api/worlds/$id/blob?version=$v" "$(ck $u)" 1000000 6 > "$TMP/hold_$u" &
  HOLDS+=($!)
done
sleep 0.7
K=$(body kid2 POST /api/worlds '{"name":"slots"}' | jget "['world']['id']")
eq    "B2 global slots full (3 in test) → 503 for another user" "$(put kid2 "/api/worlds/$K/blob?version=0" application/gzip $TMP/save1.gz)" 503
wait "${HOLDS[@]}"
eq    "B2 slots free again after the slow uploads give up" "$(put kid2 "/api/worlds/$K/blob?version=0" application/gzip $TMP/save1.gz)" 200

head1 "B9 B13 B16"
curl -s -o /dev/null "$BASE$P/api/x%0a2026/10/02%2000:00:00%20POST%20/api/admin/users%20FORGED"
eq    "B9 encoded newline can't forge a log line" "$(grep -c '^2026/10/02 00:00:00 POST' $TMP/server.log)" 0
check "B9 the attempt is logged escaped"     "$(cat $TMP/server.log)" '/api/x?2026/10/02'
perm() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
eq    "B13 data dir is 0700"                 "$(perm $TMP/data)" 700
eq    "B13 database file is 0600"            "$(perm $TMP/data/synthwild.db)" 600
eq    "B13 WAL file is 0600"                 "$(perm $TMP/data/synthwild.db-wal)" 600
f0=$(grep -c 'fetching signing certs' $TMP/server.log)
for i in 1 2 3 4 5; do code x POST /api/admin/google "{\"idToken\":\"$(mint kid=rand$i)\"}" >/dev/null; done
f1=$(grep -c 'fetching signing certs' $TMP/server.log)
check "B16 cert fetches are logged"          "$f0" ''
eq    "B16 five unknown-kid tokens → at most one refetch" "$([ "$f0" -ge 1 ] && [ $((f1-f0)) -le 1 ] && echo bounded)" bounded

head1 "rate limiting"
lg() { curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-For: $1" -H 'Content-Type: application/json' -d "{\"username\":\"$2\"}" $BASE$P/api/login; }
last=""
for i in $(seq 1 11); do last=$(lg 10.250.250.250 ghost); done
eq    "11th try of one name from one IP → 429" "$last" 429
eq    "B10 another name from the same IP still works" "$(lg 10.250.250.250 kid_two)" 200
eq    "another IP is unaffected"             "$(lg 10.250.250.251 ghost)" 404
for i in $(seq 1 60); do last=$(lg 10.250.250.252 "nobody_$i"); done
eq    "B10 per-IP ceiling: 61st try from one IP → 429" "$(lg 10.250.250.252 kid_two)" 429
eq    "B10 rightmost X-Forwarded-For hop is used" "$(lg '10.250.250.250, 10.250.250.253' ghost)" 404

head1 "admin-link CLI"
L=$("$BIN" admin-link malaki@itmatters.mobi 2>/dev/null)
check "admin-link prints a URL"              "$L" "$P/api/admin/link?t="
"$BIN" admin-link kid@example.com >/dev/null 2>&1; eq "admin-link refuses non-admins" "$?" 1
T=${L#*t=}
eq    "link signs in (302)"                  "$(curl -s -o /dev/null -w '%{http_code}' -c $TMP/mal.jar "$BASE$P/api/admin/link?t=$T")" 302
r=$(body mal GET /api/me)
check "malaki is admin"                      "$r" '"admin":true'
check "malaki's player username"             "$r" '"username":"malaki"'
eq    "link is one-time"                     "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$P/api/admin/link?t=$T")" 401
eq    "bogus link → 401"                     "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$P/api/admin/link?t=abc")" 401

head1 "secure cookie mode"
kill "$SRV"; wait "$SRV" 2>/dev/null
unset SYNTHWILD_INSECURE_COOKIE
"$BIN" >> "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "$BASE$P/api/health" >/dev/null && break; sleep 0.2; done
h=$(curl -sS -D - -o /dev/null -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d '{"username":"kid_two"}' "$BASE$P/api/login" | grep -i '^set-cookie')
check "cookie is Secure in production mode"  "$h" 'Secure'
check "data survived a restart"              "$(curl -sS -b "$TMP/kid2.jar" $BASE$P/api/worlds)" '"name":"slots"'

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
