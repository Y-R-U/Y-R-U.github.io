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
FILESTORE_REVISION_SECONDS=2 \
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

head1 "pages"
req lead POST "/api/projects/$PID/members" "{\"userId\":$UID2,\"granted\":true}" >/dev/null

c=$(code bob POST "/api/projects/$PID/pages" '{"name":"Bobs page"}')
check "user CANNOT create a page" "$c" "403"
r=$(req lead POST "/api/projects/$PID/pages" '{"name":"Design notes"}')
check "lead creates a page"                 "$r" '"name":"Design notes"'
check "pages start readable by the project" "$r" '"access":"view"'
GID=$(echo "$r" | jget "['page']['id']")
r=$(req lead POST "/api/projects/$PID/pages" '{"name":"   "}')
check "empty page names are refused" "$r" '1-80'

r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>Hello <b>world</b></p>"}')
check "lead writes page content" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/pages/$GID")
# Go's JSON encoder escapes angle brackets, so the tags come back as <…
check "page content round-trips" "$r" '\u003cb\u003eworld\u003c/b\u003e'
r=$(req lead GET "/api/projects/$PID/pages")
check "the list carries names"          "$r" 'Design notes'
checkno "the list leaves out the body"  "$r" 'Hello '

head1 "pages: markup allow-list"
r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>hi</p><script>alert(1)</script>"}')
check "script tags are refused"        "$r" "doesn't support"
r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<p onclick=\"steal()\">hi</p>"}')
check "event handlers are refused"     "$r" "doesn't support"
r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<a href=\"javascript:alert(1)\">x</a>"}')
check "javascript: links are refused"  "$r" "doesn't allow"
r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<a href=\"java\nscript:alert(1)\">x</a>"}')
check "a split javascript: scheme is refused too" "$r" "doesn't allow"
r=$(req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">ok</a>"}')
check "a normal link is accepted"      "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/pages/$GID")
checkno "the refused markup never landed" "$r" 'alert(1)'
req lead PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>Hello <b>world</b></p>"}' >/dev/null

head1 "pages: per-page access"
r=$(req bob GET "/api/projects/$PID/pages/$GID")
check "a shared page is readable by a project user" "$r" 'Hello '
check "read-only sharing says so"                   "$r" '"canEdit":false'
c=$(code bob PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>bob was here</p>"}')
check "a read-only page refuses a user's edit" "$c" "403"

r=$(req lead PATCH "/api/projects/$PID/pages/$GID" '{"access":"edit"}')
check "lead can open a page up for editing" "$r" '"access":"edit"'
r=$(req bob PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>bob was here</p>"}')
check "the user can now edit it" "$r" '"ok":true'

r=$(req lead PATCH "/api/projects/$PID/pages/$GID" '{"access":"lead"}')
check "lead can make a page private" "$r" '"access":"lead"'
c=$(code bob GET "/api/projects/$PID/pages/$GID")
check "a private page is invisible to the user" "$c" "404"
r=$(req bob GET "/api/projects/$PID/pages")
checkno "and is left out of their page list" "$r" 'Design notes'
req lead PATCH "/api/projects/$PID/pages/$GID" '{"access":"view"}' >/dev/null

c=$(code bob PATCH "/api/projects/$PID/pages/$GID" '{"access":"edit"}')
check "a user CANNOT re-share a page"  "$c" "403"
c=$(code bob DELETE "/api/projects/$PID/pages/$GID")
check "a user CANNOT delete a page"    "$c" "403"

r=$(req admin GET "/api/projects/$PID/pages/$GID")
check "admin can read pages for oversight" "$r" 'Design notes'
check "admin is read-only on pages"        "$r" '"canEdit":false'
c=$(code admin PUT "/api/projects/$PID/pages/$GID" '{"html":"<p>admin</p>"}')
check "admin CANNOT edit a page"    "$c" "403"
c=$(code admin POST "/api/projects/$PID/pages" '{"name":"Admin page"}')
check "admin CANNOT create a page"  "$c" "403"
c=$(code admin DELETE "/api/projects/$PID/pages/$GID")
check "admin CANNOT delete a page"  "$c" "403"

# A page id from another project must not be reachable through this one's URL.
r=$(req lead POST /api/projects '{"name":"Page Neighbour"}')
PID3=$(echo "$r" | jget "['project']['id']")
c=$(code lead GET "/api/projects/$PID3/pages/$GID")
check "a page id is scoped to its own project" "$c" "404"
req lead DELETE "/api/projects/$PID3" >/dev/null

r=$(req lead DELETE "/api/projects/$PID/pages/$GID")
check "lead deletes a page" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/pages")
checkno "the deleted page is gone" "$r" 'Design notes'

r=$(req lead POST "/api/projects/$PID/members" "{\"userId\":$UID2,\"granted\":false}")

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

head1 "display names"
# Earlier sections left bob without access; everything below needs him inside.
req lead POST "/api/projects/$PID/members" "{\"userId\":$UID2,\"granted\":true}" >/dev/null
r=$(req bob POST /api/profile '{"displayName":"Bobby"}')
check "anyone can set their own display name" "$r" '"displayName":"Bobby"'
r=$(req lead GET "/api/projects/$PID/files")
check "the display name shows on their edits" "$r" '"updatedBy":"Bobby"'
r=$(req bob POST /api/profile '{"displayName":"","changeUsername":false}')
check "an empty name is refused" "$r" '1-40'
r=$(req bob POST /api/profile '{"displayName":"bobby2","changeUsername":true}')
check "once a display name is set the username is left alone" "$r" 'username stays'

# The username swap is offered only while the display name is still the
# username, so it gets its own throwaway account rather than moving the sign-in
# handle of one the rest of the suite depends on.
r=$(req lead POST /api/users '{"username":"tempname"}')
TMPPW=$(echo "$r" | jget "['password']")
TMPID=$(echo "$r" | jget "['user']['id']")
req tmpu POST /api/login "{\"username\":\"tempname\",\"password\":\"$TMPPW\"}" >/dev/null
req tmpu POST /api/password "{\"current\":\"$TMPPW\",\"new\":\"temp-pw-12345\"}" >/dev/null
r=$(req tmpu POST /api/profile '{"displayName":"renamed.one","changeUsername":true}')
check "a user whose name is still their username can change both" "$r" '"username":"renamed.one"'
r=$(req tmpu2 POST /api/login '{"username":"renamed.one","password":"temp-pw-12345"}')
check "the new username signs in"  "$r" '"role":"user"'
r=$(req tmpu3 POST /api/login '{"username":"tempname","password":"temp-pw-12345"}')
check "the old one no longer does" "$r" 'incorrect username or password'
r=$(req tmpu POST /api/profile '{"displayName":"Renamed","changeUsername":false}')
check "and the display name is free after that" "$r" '"displayName":"Renamed"'
r=$(req bob POST /api/profile '{"displayName":"renamed.one","changeUsername":true}')
check "a taken username is refused" "$r" 'already'
req lead DELETE "/api/users/$TMPID" >/dev/null

head1 "presence"
r=$(req bob POST /api/presence "{\"projectId\":$PID,\"area\":\"file\",\"ref\":\"manifest.json\",\"editing\":true}")
check "a heartbeat is accepted"        "$r" '"interval"'
r=$(req lead POST /api/presence "{\"projectId\":$PID,\"area\":\"project\"}")
check "others in the project are reported" "$r" '"name":"Bobby"'
check "including what they have open"      "$r" '"ref":"manifest.json"'
check "and whether they are editing it"    "$r" '"editing":true'
r=$(req lead POST /api/presence '{"projectId":0}')
checkno "somewhere else, nobody is reported" "$r" '"name":"Bobby"'
# A spot inside a project the account can't reach is not reported to anyone.
r=$(req bob POST /api/presence '{"projectId":99999,"area":"project"}')
check "an unreachable project is ignored" "$r" '"people":[]'
r=$(req lead POST /api/presence "{\"projectId\":$PID,\"watch\":{\"kind\":\"file\",\"ref\":\"manifest.json\"}}")
check "the heartbeat reports the open file's version" "$r" '"watch"'

head1 "history"
# Its own file: sharing one with the sections above makes the version counts
# depend on how fast the suite happens to run.
req lead POST "/api/projects/$PID/files" '{"action":"newfile","path":"notes.txt"}' >/dev/null
r=$(req lead PUT "/api/projects/$PID/files" '{"path":"notes.txt","content":"one"}')
r=$(req lead PUT "/api/projects/$PID/files" '{"path":"notes.txt","content":"two"}')
check "a save reports the version it wrote" "$r" '"at"'
r=$(req lead GET "/api/projects/$PID/history?kind=file&ref=notes.txt")
n=$(echo "$r" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['revisions']))")
[ "$n" = "1" ] && ok "saves in the same window coalesce into one version" \
               || bad "saves in the same window coalesce into one version" "got $n"
REV=$(echo "$r" | jget "['revisions'][0]['id']")
r=$(req lead GET "/api/projects/$PID/history?kind=file&ref=notes.txt&rev=$REV")
check "a version can be read back"       "$r" '"content"'
check "holding the newest state of it"   "$r" 'two'

sleep 2.2
r=$(req lead PUT "/api/projects/$PID/files" '{"path":"notes.txt","content":"three"}')
r=$(req lead GET "/api/projects/$PID/history?kind=file&ref=notes.txt")
n=$(echo "$r" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['revisions']))")
[ "$n" = "2" ] && ok "a later save starts a new version" \
               || bad "a later save starts a new version" "got $n"
r=$(req lead GET "/api/projects/$PID/files?path=notes.txt&mode=text")
check "the file holds the newer content" "$r" 'three'

r=$(req lead POST "/api/projects/$PID/history" "{\"kind\":\"file\",\"ref\":\"notes.txt\",\"rev\":$REV}")
check "an older version restores" "$r" '"ok":true'
r=$(req lead GET "/api/projects/$PID/files?path=notes.txt&mode=text")
check "and the file is back to it" "$r" 'two'

r=$(req lead POST "/api/projects/$PID/files" '{"action":"rename","path":"notes.txt","to":"notes2.txt"}')
r=$(req lead GET "/api/projects/$PID/history?kind=file&ref=notes2.txt")
check "history follows a rename" "$r" '"revisions":[{'
r=$(req lead DELETE "/api/projects/$PID/files?path=notes2.txt&dir=0")
r=$(req lead GET "/api/projects/$PID/history?kind=file&ref=notes2.txt")
check "and is dropped when the file is deleted" "$r" '"revisions":[]'

c=$(code bob GET "/api/projects/$PID/history?kind=file&ref=manifest.json")
check "a project member can read history" "$c" "200"
c=$(code bob GET "/api/projects/$PID/history?kind=page&ref=99999")
check "history is not a way into a page you can't open" "$c" "404"

head1 "save conflicts"
r=$(req lead PUT "/api/projects/$PID/files" '{"path":"manifest.json","content":"{\"who\":\"lead\"}"}')
AT=$(echo "$r" | jget "['at']")
r=$(req bob PUT "/api/projects/$PID/files" "{\"path\":\"manifest.json\",\"content\":\"{\\\"who\\\":\\\"bob\\\"}\",\"base\":1}")
check "saving over someone else's newer version is refused" "$r" '"code":"conflict"'
r=$(req bob PUT "/api/projects/$PID/files" "{\"path\":\"manifest.json\",\"content\":\"{\\\"who\\\":\\\"bob\\\"}\",\"base\":1,\"force\":true}")
check "…unless you say so"                                  "$r" '"ok":true'
r=$(req bob PUT "/api/projects/$PID/files" "{\"path\":\"manifest.json\",\"content\":\"{\\\"who\\\":\\\"bob2\\\"}\",\"base\":$AT}")
checkno "saving from the current version is not a conflict"  "$r" 'conflict'

head1 "kicks and blocks"
req bob POST /api/presence "{\"projectId\":$PID,\"area\":\"file\",\"ref\":\"manifest.json\"}" >/dev/null
GID2=$(req lead POST "/api/projects/$PID/pages" '{"name":"Team notes"}' | jget "['page']['id']")
r=$(req lead GET /api/people)
check "the lead sees their people"        "$r" '"name":"Bobby"'
check "with where they are"               "$r" '"projectName":"My Addon"'
check "and the (empty) block list"        "$r" '"bans":[]'
c=$(code bob GET /api/people)
check "a user CANNOT open the people console" "$c" "403"

r=$(req lead POST /api/people/kick "{\"userId\":$UID2,\"projectId\":$PID,\"scope\":\"file\",\"ref\":\"manifest.json\",\"reason\":\"reorganising\"}")
check "the lead can move someone out of a file" "$r" '"ok":true'
r=$(req bob POST /api/presence "{\"projectId\":$PID,\"area\":\"file\",\"ref\":\"manifest.json\"}")
check "the order reaches them on their next heartbeat" "$r" '"type":"kick"'
check "with the reason attached"                       "$r" 'reorganising'
r=$(req bob POST /api/presence "{\"projectId\":$PID,\"area\":\"file\",\"ref\":\"manifest.json\"}")
checkno "and is delivered only once" "$r" '"order"'

r=$(req lead POST /api/people/ban "{\"userId\":$UID2,\"projectId\":$PID,\"scope\":\"file\",\"ref\":\"manifest.json\",\"reason\":\"leave it alone\",\"minutes\":60}")
check "the lead can block someone from one file" "$r" '"ok":true'
r=$(req bob GET "/api/projects/$PID/files?path=manifest.json&mode=text")
check "the blocked file refuses to open"  "$r" '"code":"banned"'
check "and says why"                      "$r" 'leave it alone'
c=$(code bob PUT "/api/projects/$PID/files" '{"path":"manifest.json","content":"x"}')
check "and refuses writes"                "$c" "403"
c=$(code bob GET "/api/projects/$PID/files?path=pack/manifest.json&mode=text")
check "a different file is unaffected"    "$c" "200"
c=$(code lead GET "/api/projects/$PID/files?path=manifest.json&mode=text")
check "the lead is not caught by their own block" "$c" "200"
BAN=$(req lead GET /api/people | jget "['bans'][0]['id']")
r=$(req lead POST /api/people/bantime "{\"banId\":$BAN,\"minutes\":0}")
check "a time limit can be cleared" "$r" '"until":0'
r=$(req lead POST /api/people/unban "{\"banId\":$BAN}")
check "and the block lifted"        "$r" '"bans":[]'
c=$(code bob GET "/api/projects/$PID/files?path=manifest.json&mode=text")
check "the file opens again"        "$c" "200"

r=$(req lead POST /api/people/ban "{\"userId\":$UID2,\"projectId\":$PID,\"scope\":\"page\",\"ref\":\"$GID2\",\"reason\":\"not for you\"}")
c=$(code bob GET "/api/projects/$PID/pages/$GID2")
check "a page can be blocked too" "$c" "403"
BAN=$(req lead GET /api/people | jget "['bans'][0]['id']")
req lead POST /api/people/unban "{\"banId\":$BAN}" >/dev/null

r=$(req lead POST /api/people/ban "{\"userId\":$UID2,\"projectId\":$PID,\"scope\":\"project\",\"reason\":\"take a break\",\"minutes\":1}")
check "a whole project can be blocked" "$r" '"ok":true'
r=$(req bob GET "/api/projects/$PID/files")
check "every door into it is shut"     "$r" '"code":"banned"'
r=$(req bob GET /api/projects)
check "though they can still see the project exists" "$r" 'My Addon'
BAN=$(req lead GET /api/people | jget "['bans'][0]['id']")
req lead POST /api/people/unban "{\"banId\":$BAN}" >/dev/null
c=$(code bob GET "/api/projects/$PID/files")
check "unblocking lets them back in" "$c" "200"

# Moderation stops at the edge of what a lead owns.
c=$(code bob POST /api/people/kick "{\"userId\":$UID2,\"projectId\":$PID,\"scope\":\"project\"}")
check "a user CANNOT kick anyone"                 "$c" "403"
c=$(code lead POST /api/people/ban "{\"userId\":$LEADID,\"projectId\":$PID,\"scope\":\"project\"}")
check "a lead CANNOT block another lead"          "$c" "403"
c=$(code lead POST /api/people/kick "{\"userId\":$UID2,\"projectId\":99999,\"scope\":\"project\"}")
check "nor act inside a project they don't own"   "$c" "403"
req lead DELETE "/api/projects/$PID/pages/$GID2" >/dev/null

head1 "admin acting as a lead"
c=$(code lead POST /api/acting '{"asLead":true}')
check "a lead CANNOT switch role"  "$c" "403"
c=$(code bob POST /api/acting '{"asLead":true}')
check "a user CANNOT switch role"  "$c" "403"
c=$(code admin GET /api/acting '')
check "switching role is POST only" "$c" "405"

r=$(req admin POST /api/acting '{"asLead":true}')
check "admin switches into lead mode" "$r" '"actingAsLead":true'
r=$(req admin GET /api/me)
check "it now reads as a lead"       "$r" '"role":"lead"'
check "and remembers what it really is" "$r" '"realRole":"admin"'

r=$(req admin POST /api/projects '{"name":"Admin Test Project"}')
check "acting admin can create a project" "$r" '"name":"Admin Test Project"'
APID=$(echo "$r" | jget "['project']['id']")
r=$(req admin POST "/api/projects/$APID/files" '{"action":"newfile","path":"try.json"}')
check "acting admin can create files"     "$r" '"ok":true'
r=$(req admin POST "/api/projects/$APID/pages" '{"name":"Admin test page"}')
check "acting admin can create pages"     "$r" '"name":"Admin test page"'

r=$(req admin GET /api/projects)
check "it sees the project it owns"          "$r" 'Admin Test Project'
checkno "and only that one, like any lead"   "$r" 'My Addon'
c=$(code admin GET /api/admin/stats)
check "the Server tab is out of reach in lead mode" "$c" "403"
r=$(req admin GET /api/users)
checkno "the leads list is out of reach too"        "$r" 'leadjane'

r=$(req admin POST /api/acting '{"asLead":false}')
check "admin switches back"        "$r" '"actingAsLead":false'
r=$(req admin GET /api/me)
check "it is an admin again"       "$r" '"role":"admin"'
r=$(req admin GET /api/projects)
check "and sees every project once more" "$r" 'My Addon'
c=$(code admin GET /api/admin/stats)
check "the Server tab is back"     "$c" "200"
c=$(code admin PUT "/api/projects/$APID/files" '{"path":"try.json","content":"x"}')
check "as admin it is read-only again, even on its own project" "$c" "403"

# The switch is per session: a second sign-in on the same account is unaffected.
r=$(req admin2 POST /api/login '{"username":"aaron@br8t.com","password":"admin-pw-12345"}')
req admin POST /api/acting '{"asLead":true}' >/dev/null
r=$(req admin2 GET /api/me)
check "another session of the same account stays admin" "$r" '"role":"admin"'
req admin DELETE "/api/projects/$APID" >/dev/null
r=$(req admin GET /api/projects)
checkno "acting admin deletes its own test project" "$r" 'Admin Test Project'
req admin POST /api/acting '{"asLead":false}' >/dev/null

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
