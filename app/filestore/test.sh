#!/usr/bin/env bash
# End-to-end API test for filestore. Runs the real binary against a throwaway
# data dir on a spare port and exercises every role boundary and limit.
#
# Usage: ./test.sh [path-to-binary]      (defaults to ./filestore)
set -uo pipefail

BIN="${1:-./filestore}"
PORT="${PORT:-8099}"
BASE="http://127.0.0.1:$PORT"
TMP="$(mktemp -d)"
PASS=0; FAIL=0

cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }
head1(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# check <desc> <actual> <expected-substring>
check() { case "$2" in *"$3"*) ok "$1";; *) bad "$1" "got: ${2:0:220}";; esac; }
# checkno <desc> <actual> <substring-that-must-be-absent>
checkno(){ case "$2" in *"$3"*) bad "$1" "got: ${2:0:220}";; *) ok "$1";; esac; }

# req <jar> <method> <path> [json-body]
req() {
  local jar="$TMP/$1.jar" m="$2" p="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -sS -b "$jar" -c "$jar" -X "$m" -H 'Content-Type: application/json' -d "$b" "$BASE$p"
  else
    curl -sS -b "$jar" -c "$jar" -X "$m" "$BASE$p"
  fi
}
code() { # like req but prints the HTTP status only
  local jar="$TMP/$1.jar" m="$2" p="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -sS -o /dev/null -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" -H 'Content-Type: application/json' -d "$b" "$BASE$p"
  else
    curl -sS -o /dev/null -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" "$BASE$p"
  fi
}
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

# ─────────────────────────────────────────────────────────── start
FILESTORE_ADDR="127.0.0.1:$PORT" \
FILESTORE_DATA="$TMP/data" \
FILESTORE_ADMIN_USER="aaron@br8t.com" \
FILESTORE_ADMIN_PASSWORD="bootstrap-pw-1" \
FILESTORE_INSECURE_COOKIE=1 \
  "$BIN" > "$TMP/server.log" 2>&1 &
SRV=$!
for i in $(seq 1 50); do curl -sf "$BASE/healthz" >/dev/null && break; sleep 0.2; done
curl -sf "$BASE/healthz" >/dev/null || { echo "server failed to start:"; cat "$TMP/server.log"; exit 1; }

head1 "admin bootstrap + forced reset"
r=$(req admin POST /api/login '{"username":"aaron@br8t.com","password":"bootstrap-pw-1"}')
check "admin can sign in with the bootstrap password" "$r" '"role":"admin"'
check "admin is flagged for a forced reset"           "$r" '"mustReset":true'

r=$(req admin GET /api/projects)
check "forced-reset account is blocked from the app" "$r" 'must_reset'
# The gate is an exact path match, not a "/password" suffix.
r=$(req admin GET /api/projects/1/password)
check "a /password suffix does not slip past the reset gate" "$r" 'must_reset'

r=$(req admin POST /api/password '{"current":"wrong","new":"admin-pw-12345"}')
check "wrong current password is rejected" "$r" 'incorrect'

r=$(req admin POST /api/password '{"current":"bootstrap-pw-1","new":"short"}')
check "short new password is rejected" "$r" 'at least 8'

r=$(req admin POST /api/password '{"current":"bootstrap-pw-1","new":"admin-pw-12345"}')
check "admin sets a real password" "$r" '"ok":true'

r=$(req admin GET /api/me)
check "admin session survives the password change" "$r" '"role":"admin"'
checkno "must_reset is cleared"                     "$r" '"mustReset":true'

head1 "role boundaries: admin"
c=$(code admin POST /api/projects '{"name":"Admin Project"}')
check "admin CANNOT create a project" "$c" "403"

r=$(req admin POST /api/users '{"username":"leadjane","email":"jane@example.com"}')
check "admin can create a lead" "$r" '"role":"lead"'
LEADPW=$(echo "$r" | jget "['password']")
LEADID=$(echo "$r" | jget "['user']['id']")
[ -n "$LEADPW" ] && ok "a one-time password is returned" || bad "a one-time password is returned"

r=$(req admin POST /api/users '{"username":"sneakyuser"}')
check "admin only ever creates leads (never plain users)" "$r" '"role":"lead"'

head1 "role boundaries: lead"
r=$(req lead POST /api/login "{\"username\":\"leadjane\",\"password\":\"$LEADPW\"}")
check "lead signs in with the temporary password" "$r" '"role":"lead"'
r=$(req lead POST /api/password "{\"current\":\"$LEADPW\",\"new\":\"lead-pw-12345\"}")
check "lead sets their own password" "$r" '"ok":true'

r=$(req lead POST /api/projects '{"name":"My Addon"}')
check "lead can create a project" "$r" '"name":"My Addon"'
PID=$(echo "$r" | jget "['project']['id']")
check "project starts at the 100 MB default limit" "$r" '"quotaBytes":104857600'

c=$(code lead POST /api/users '{"username":"anotherlead"}')
check "lead can create a user" "$c" "200"
r=$(req lead POST /api/users '{"username":"bobuser"}')
check "the account a lead creates is a plain user" "$r" '"role":"user"'
USERPW=$(echo "$r" | jget "['password']")
UID2=$(echo "$r" | jget "['user']['id']")

head1 "files"
r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"manifest.json"}')
check "lead creates a file" "$r" '"ok":true'
r=$(req lead PUT "/api/projects/$PID/files" '{"path":"manifest.json","content":"{\"format_version\":2}"}')
check "lead saves text content" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files?path=manifest.json&mode=text")
check "content round-trips" "$r" 'format_version'

r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"textures/blocks/x.json"}')
check "nested paths work" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "listing includes the nested file" "$r" 'textures/blocks/x.json'

head1 "subfolders"
r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfolder","path":"textures"}')
check "creates a folder" "$r" '"ok":true'
r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfolder","path":"textures/blocks/deep"}')
check "creates a nested folder" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "empty folder is listed (not just files)" "$r" '"textures"'
check "nested folder is listed"                 "$r" 'textures/blocks/deep'

r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"textures/blocks/deep/note.txt"}')
check "file inside a nested folder" "$r" '"ok":true'
r=$(req lead POST "/api/projects/$PID/files" '{"action":"rename","path":"textures/blocks","to":"textures/items"}')
check "renaming a folder moves its contents" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "descendant paths follow the rename"  "$r" 'textures/items/deep/note.txt'
checkno "the old folder path is gone"       "$r" 'textures/blocks'

r=$(req lead DELETE "/api/projects/$PID/files?path=textures&dir=1")
check "deleting a folder removes it" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
checkno "folder is gone from the listing"  "$r" 'textures'
checkno "its files went with it"           "$r" 'note.txt'

head1 "LIKE wildcards in folder names don't hit their neighbours"
# "a_b" as a raw LIKE prefix would also match "axb/..." — deleting or renaming
# one folder must never touch the index rows of another.
req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"a_b/keep.txt"}' >/dev/null
req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"axb/keep.txt"}' >/dev/null
r=$(req lead POST "/api/projects/$PID/files" '{"action":"rename","path":"a_b","to":"a_c"}')
check "renames an underscore folder" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "the neighbour's path is untouched by the rename" "$r" 'axb/keep.txt'
check "the renamed folder's file moved"                 "$r" 'a_c/keep.txt'
r=$(req lead DELETE "/api/projects/$PID/files?path=a_c&dir=1")
check "deletes an underscore folder" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "the neighbour survives the delete" "$r" 'axb/keep.txt'
checkno "the underscore folder is gone"   "$r" 'a_c/keep.txt'
req lead DELETE "/api/projects/$PID/files?path=axb&dir=1" >/dev/null

# substr() counts characters, so a non-ASCII folder name must still rewrite
# descendant paths correctly.
req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"café/deep/n.txt"}' >/dev/null
r=$(req lead POST "/api/projects/$PID/files" '{"action":"rename","path":"café","to":"bar"}')
check "renames a non-ASCII folder" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "descendant path of a non-ASCII folder is rewritten correctly" "$r" 'bar/deep/n.txt'
req lead DELETE "/api/projects/$PID/files?path=bar&dir=1" >/dev/null

head1 "state-changing endpoints refuse GET"
c=$(code lead GET /api/logout)
check "logout is POST only"  "$c" "405"
c=$(code lead GET "/api/projects/$PID/reindex")
check "reindex is POST only" "$c" "405"
c=$(code lead POST "/api/projects/$PID/reindex" '{}')
check "reindex still works over POST" "$c" "200"

head1 "path traversal is refused"
for p in '../escape.txt' '/etc/passwd' 'a/../../b.txt' '../../../../../../tmp/x'; do
  c=$(code lead POST "/api/projects/$PID/files" "{\"action\":\"newfile\",\"path\":\"$p\"}")
  case "$c" in 400|404) ok "rejects '$p'";; *) bad "rejects '$p'" "status $c";; esac
done

# Query-param paths ARE url-decoded by net/http before we see them, so the
# percent-encoded form is a genuine attack vector and must be rejected too.
r=$(req lead GET "/api/projects/$PID/files?path=..%2F..%2Fetc%2Fpasswd")
check "rejects url-encoded traversal on read"   "$r" 'escapes the project'
r=$(req lead DELETE "/api/projects/$PID/files?path=..%2F..%2Fdata")
check "rejects url-encoded traversal on delete" "$r" 'escapes the project'

r=$(req lead POST "/api/projects/$PID/files" '{"action":"rename","path":"manifest.json","to":"../../pwned.txt"}')
check "rejects escaping via a rename target" "$r" 'escapes the project'
r=$(req lead POST "/api/projects/$PID/files" '{"action":"newfolder","path":"../../boom"}')
check "rejects escaping via a new folder"    "$r" 'escapes the project'

if [ -e "$TMP/escape.txt" ] || [ -e "$TMP/pwned.txt" ] || [ -e "$TMP/boom" ]; then
  bad "nothing escaped the project dir"
else
  ok "nothing escaped the project dir"
fi

head1 "binary upload + quota"
head -c 200000 /dev/urandom > "$TMP/blob.bin"
r=$(curl -sS -b "$TMP/lead.jar" -F "f=@$TMP/blob.bin" "$BASE/api/projects/$PID/upload")
check "binary upload succeeds" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files")
check "uploaded file is indexed" "$r" 'blob.bin'
check "usage is counted"        "$r" '"usedBytes":20'

# Squeeze the quota down and prove the limit actually bites.
r=$(req admin PATCH "/api/projects/$PID" '{"quota":1048576}')
check "admin can change a project's limit" "$r" '"quotaBytes":1048576'
head -c 2000000 /dev/urandom > "$TMP/big.bin"
r=$(curl -sS -b "$TMP/lead.jar" -F "f=@$TMP/big.bin" "$BASE/api/projects/$PID/upload")
check "over-quota upload is refused" "$r" 'storage limit'
r=$(req lead GET "/api/projects/$PID/files")
checkno "the rejected file was not kept" "$r" 'big.bin'
req admin PATCH "/api/projects/$PID" '{"quota":104857600}' >/dev/null

c=$(code lead PATCH "/api/projects/$PID" '{"quota":999999999}')
check "lead CANNOT raise their own limit" "$c" "403"

head1 "zip download + upload"
curl -sS -b "$TMP/lead.jar" "$BASE/api/projects/$PID/zip" -o "$TMP/out.zip"
python3 -c "import zipfile,sys; z=zipfile.ZipFile('$TMP/out.zip'); sys.exit(0 if 'manifest.json' in z.namelist() else 1)" \
  && ok "project downloads as a valid zip containing its files" \
  || bad "project downloads as a valid zip containing its files"

python3 - <<PY
import zipfile
with zipfile.ZipFile("$TMP/in.zip","w") as z:
    z.writestr("pack/manifest.json", '{"from":"zip"}')
    z.writestr("pack/textures/a.png", b"\x89PNG fake")
    z.writestr("../../evil.txt", "should be skipped")   # zip-slip attempt
PY
r=$(curl -sS -b "$TMP/lead.jar" -F "zip=@$TMP/in.zip" "$BASE/api/projects/$PID/import")
check "zip upload extracts its entries" "$r" '"extracted":2'
r=$(req lead GET "/api/projects/$PID/files")
check "extracted file is present"        "$r" 'pack/manifest.json'
checkno "the zip-slip entry was skipped" "$r" 'evil.txt'
[ -e "$TMP/evil.txt" ] && bad "zip-slip did not escape" || ok "zip-slip did not escape"

r=$(curl -sS -b "$TMP/lead.jar" -F "dest=sub" -F "zip=@$TMP/in.zip" "$BASE/api/projects/$PID/import")
r=$(req lead GET "/api/projects/$PID/files")
check "zip can extract into a subfolder" "$r" 'sub/pack/manifest.json'

head1 "project access control"
r=$(req bob POST /api/login "{\"username\":\"bobuser\",\"password\":\"$USERPW\"}")
check "user signs in" "$r" '"role":"user"'
req bob POST /api/password "{\"current\":\"$USERPW\",\"new\":\"bob-pw-12345\"}" >/dev/null

r=$(req bob GET /api/projects)
checkno "user sees no projects before being granted" "$r" 'My Addon'
c=$(code bob GET "/api/projects/$PID/files")
check "ungranted user cannot reach the project" "$c" "404"

r=$(req lead POST "/api/projects/$PID/members" "{\"userId\":$UID2,\"granted\":true}")
check "lead grants access" "$r" '"ok":true'
r=$(req bob GET /api/projects)
check "user now sees the project" "$r" 'My Addon'
r=$(req bob PUT "/api/projects/$PID/files" '{"path":"manifest.json","content":"{\"by\":\"bob\"}"}')
check "granted user can edit files" "$r" '"ok":true'

c=$(code bob GET "/api/projects/$PID/members")
check "user CANNOT see the member list"  "$c" "403"
c=$(code bob GET /api/users)
check "user CANNOT list users"           "$c" "403"
c=$(code bob POST /api/users '{"username":"bobsfriend"}')
check "user CANNOT create users"         "$c" "403"
c=$(code bob DELETE "/api/projects/$PID")
check "user CANNOT delete the project"   "$c" "403"
c=$(code bob POST /api/projects '{"name":"Bobs Project"}')
check "user CANNOT create projects"      "$c" "403"

r=$(req lead POST "/api/projects/$PID/members" "{\"userId\":$UID2,\"granted\":false}")
r=$(req bob GET /api/projects)
checkno "access can be revoked" "$r" 'My Addon'

head1 "admin oversight"
r=$(req admin GET /api/projects)
check "admin sees every project"      "$r" 'My Addon'
check "admin gets the lead filter list" "$r" 'leadjane'
r=$(req admin "GET" "/api/projects?owner=$LEADID")
check "admin can filter by lead"      "$r" 'My Addon'
r=$(req admin "GET" "/api/projects?owner=99999")
checkno "filtering by another lead excludes it" "$r" 'My Addon'

c=$(code admin PUT "/api/projects/$PID/files" '{"path":"manifest.json","content":"admin was here"}')
check "admin is read-only on project files" "$c" "403"
c=$(code admin DELETE "/api/projects/$PID")
check "admin CANNOT delete a project"       "$c" "403"

r=$(req admin GET /api/admin/stats)
check "admin stats include disk figures" "$r" '"diskFree"'
check "admin stats include the audit log" "$r" '"audit"'
c=$(code lead GET /api/admin/stats)
check "lead CANNOT read admin stats" "$c" "403"

r=$(req admin POST /api/admin/settings '{"defaultQuota":52428800}')
check "admin can change the default limit" "$r" '"ok":true'
r=$(req lead POST /api/projects '{"name":"Second Addon"}')
check "new projects pick up the new default" "$r" '"quotaBytes":52428800'
PID2=$(echo "$r" | jget "['project']['id']")

head1 "disable / delete users"
r=$(req admin PATCH "/api/users/$LEADID" '{"disabled":true}')
check "admin can disable a lead" "$r" '"disabled":true'
c=$(code lead GET /api/projects)
check "disabling kills live sessions" "$c" "401"
r=$(req lead2 POST /api/login '{"username":"leadjane","password":"lead-pw-12345"}')
check "a disabled account cannot sign in" "$r" 'incorrect username or password'
req admin PATCH "/api/users/$LEADID" '{"disabled":false}' >/dev/null
r=$(req lead POST /api/login '{"username":"leadjane","password":"lead-pw-12345"}')
check "re-enabling restores sign-in" "$r" '"role":"lead"'

c=$(code lead DELETE "/api/users/$LEADID")
check "a lead CANNOT delete another lead" "$c" "403"
c=$(code admin DELETE "/api/users/$LEADID")
check "admin cannot delete a lead who still owns projects" "$c" "409"

r=$(req lead DELETE "/api/projects/$PID2")
check "lead deletes their own project" "$r" '"ok":true'
r=$(req lead GET /api/projects)
checkno "deleted project is gone" "$r" 'Second Addon'

r=$(req lead POST "/api/users/$UID2/reset" '')
check "lead can reset their user's password" "$r" '"password"'
NEWPW=$(echo "$r" | jget "['password']")
c=$(code bob GET /api/projects)
check "a password reset signs the user out" "$c" "401"
r=$(req bob POST /api/login "{\"username\":\"bobuser\",\"password\":\"$NEWPW\"}")
check "the new temporary password works"    "$r" '"mustReset":true'

r=$(req lead DELETE "/api/users/$UID2")
check "lead deletes their own user" "$r" '"ok":true'
r=$(req bob2 POST /api/login "{\"username\":\"bobuser\",\"password\":\"$NEWPW\"}")
check "the deleted user can no longer sign in" "$r" 'incorrect username or password'

head1 "misc"
r=$(req anon POST /api/login '{"username":"nobody","password":"whatever"}')
check "unknown user gets the same generic error" "$r" 'incorrect username or password'
c=$(code anon GET /api/projects)
check "signed-out requests are rejected" "$c" "401"
r=$(req lead POST /api/users '{"username":"leadjane"}')
check "duplicate usernames are refused" "$r" 'already taken'
r=$(req lead POST /api/users '{"username":"a"}')
check "short usernames are refused" "$r" '3-40'
r=$(req lead POST /api/projects '{"name":""}')
check "empty project names are refused" "$r" '1-80'

r=$(req lead DELETE "/api/projects/$PID")
check "lead deletes the main project" "$r" '"ok":true'
[ -d "$TMP/data/files/p$PID" ] && bad "project files removed from disk" || ok "project files removed from disk"
# The delete stages the directory aside as a rollback point; on success the
# staging copy must not survive.
[ -d "$TMP/data/files/p$PID.trash" ] && bad "no staging dir is left behind" || ok "no staging dir is left behind"

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
