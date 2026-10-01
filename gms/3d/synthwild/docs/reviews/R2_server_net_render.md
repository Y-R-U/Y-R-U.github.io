# R2: server, client net and render review (adversarial)

Reviewer B, 2026-10-02. Scope: `server/*` and deploy, `js/net/api.js` and its use in `js/ui/*`, and `js/render/*`.
R1 (client game logic) is not repeated here. The only production traffic was `GET api/health` and `GET api/me`, both
direct to Caddy (`via: 1.1 Caddy`, no CDN, no AAAA record). Every attack ran against throwaway local servers.

Repro scripts (all in `tools/`):
- `review_b_server.sh` covers B1, B5 and B9, the cascade check and the Origin variants (throwaway server on :8131).
- `review_b_memburst.sh` covers B2 (`N=60 bash tools/review_b_memburst.sh`).
- `review_b_thumbdesync.mjs` covers B4. It runs the real `api.js` in node against a throwaway server.
- `review_b_gpu.mjs` covers B3: GPU and heap counters across world, chunk-churn and mini-game cycles (CDP :9332, metal).
- `review_b_ctxloss.mjs` checks WebGL context loss and restore (CDP :9333). It passed (see SOUND).

Line numbers are from the files as read on 2026-10-02. A fixer is editing `js/` at the same time, so they may drift.

---

## B1 · HIGH · PROVEN: the public world list gives every signed-in player the credential to take over any public-world owner
`server/worlds.go:26` (`worldColumns` includes `u.username`), `:161-163` (public scope), and `server/auth.go:203-231` (login by
username only).

The design (D-notes) accepts username-only login. The problem is that the server then hands every signed-in user the
usernames, which are the credential. `GET worlds?scope=public` returns `owner` (the raw username) for up to 500 worlds. Any
player can sign in as any of those owners, list their **private** worlds, and patch, overwrite or delete them. The victim's
own session stays valid and nothing tells them it happened. The admins' player accounts (`aaron`, `dante`, `malaki`, the
email local parts) are covered too. They are not admin sessions, but they hold the admins' worlds.

Repro (`review_b_server.sh`):
```
mallory harvested owner username from public list: alice
stolen session sees: ['Alice SECRET', 'Alice public']
DELETE alice's private world: 200
alice's own session still valid (no notice)
```
Login also answers 404 for an unknown name and 200 for a known one, so names can be enumerated at 10 tries per minute per
IP even without the leak.

**Fix:** drop `owner` from non-owner responses (return `ownerDisplay` only) and stop api.js from showing `@username`.
Better still, give each player an admin-issued secret (a 4–6 word code or PIN) that is separate from the visible name. At
minimum, ask for a confirmation code before deleting a world.

## B2 · HIGH · PROVEN (locally): one signed-in player can push the service past its memory cap with concurrent blob uploads
`server/worlds.go:134-151` (`readBody` uses `io.ReadAll` up to 8 MB), `:320-345` (the body is read **before** the version
and quota checks), `server/db.go:75` (`SetMaxOpenConns(1)`), and `server/synthwild.service` (`GOMEMLIMIT=96MiB`,
`MemoryMax=192M`).

Each PUT buffers its whole body (and `ReadAll`'s doubling makes the peak higher) before the server checks
`version=` or the quota. So stale-version PUTs that will all answer 409 still cost 8–16 MB each while they are in flight.
GOMEMLIMIT is soft, so this traffic blows through it.

| concurrent 8 MB PUTs to ONE world | peak RSS |
|---|---|
| 12 (to 12 worlds) | 153 MiB |
| 30 | 181 MiB |
| 60 | **254 MiB** (above the unit's `MemoryMax=192M`, so the cgroup OOM-kills the service on the box) |

Each request has up to 120 s (`ReadTimeout`) to trickle its body, so ~4 MB/s of upstream is enough to hold this. All DB
work also shares one connection with no request context. A burst of 8 MB transactions therefore stalls `/api/me` and
every other user's request behind it, and work for a disconnected client still runs. B1 makes "signed-in" cheap.
Concurrent `GET worlds/{id}/blob` on a public 8 MB world loads the full blob into memory per request in the same way.

**Fix:** check ownership, `version` (one cheap SELECT) and `Content-Length` before reading the body. Put a global semaphore
on in-flight blob bodies (for example 3 × 8 MB) and answer 503 with Retry-After when it is full. Also add a per-user
semaphore, and stream large reads (`QueryContext` with `r.Context()`).

## B3 · MEDIUM · PROVEN: every mini-game run leaks GPU geometry, textures and JS heap (bot bodies and CTF flags are never disposed)
`js/minigames/bots/view.js:59` (`dispose() { ctx.scene?.remove(g); }` frees no geometry, material or `CanvasTexture`
name tag, and none of the per-bot avatar parts from `createAvatar()`), and `js/minigames/games/ctf.js:265` (flag
pole, banner and glow meshes are removed but not disposed).

From `review_b_gpu.mjs`, read on the title screen after each run (after a forced `gc()`):

| after | geometries | textures | JS heap |
|---|---|---|---|
| 4 normal world cycles | 11 → 11 → 11 → 11 (clean) | 15 | 76–89 MB |
| parkour | 11 | 15 | 93 |
| floorfall | **73** | 17 | 108 |
| ctf | **166** | 20 | 141 |
| siege | 169 | 21 | 152 |
| ctf (2nd) | **262** | 24 | 163 |
| siege (2nd) | 264 | 24 | 167 |

That is about +93 geometries and +3 textures per CTF run, and about +10 MB of retained heap per mini-game. The scene
object count goes back to 103 each time, so the objects are detached but never released. On a phone, a dozen
replays is enough to make the OS kill the tab. Normal world start/stop and chunk churn (6 teleports of 400 m:
geometries 117–195, bounded) are clean.

**Fix:** `dispose()` should `g.traverse(o => { o.geometry?.dispose(); [].concat(o.material||[]).forEach(m => { m.map?.dispose(); m.dispose(); }); })`
without disposing materials that are shared with the player avatar. Do the same for the CTF flags in `end()`.

## B4 · MEDIUM · PROVEN: a failed thumbnail upload after a successful blob save causes a false "changed somewhere else" conflict
`js/net/api.js:153-158` (`save` = blob PUT then `putThumb`, so a thumb error throws away the blob's new meta),
`js/ui/store.js:48-52`, and `js/ui/shell.js:281-296`.

The blob PUT bumps the server to v+1. If the thumbnail PUT then fails (507 quota, 401 after an admin removal, a network
drop between the two requests, 415), `save()` throws. `shell` keeps `meta.version = v`, reports "Could not save"
(although the blob **was** saved), and the next autosave sends `version=v`. The result is a 409, and the player is asked
"Someone saved this world from another device…" about their own save. Choosing "Save as copy" (the default when the
popup is dismissed) also forks the world needlessly. `worlds.create({data, thumb})` has the same shape: the world and
blob are created, then the thumb error is thrown, so a "Save a copy" can leave a duplicate.

```
saved v1
save #2 threw 415 bad_request; client still holds v1; server is at v2 with the new blob
save #3 (same tab, no other device) -> 409 conflict: "the world was saved somewhere else"
```
**Fix:** in `worlds.save`/`create`, catch the thumbnail error and return the blob's meta (thumbs are best-effort; log a warning).

## B5 · MEDIUM · PROVEN: the 50-world quota and the global 3 GB / disk-floor cap are check-then-act races
`server/worlds.go:219-227` (COUNT, then a separate INSERT tx) and `:122-131` with `:343` (`roomFor` runs outside the
transaction that writes).

- 60 concurrent creates by one user gave **54 worlds** (limit 50). Each extra world can hold 8 MB.
- 12 concurrent 7 MiB uploads with the cap set to 40 MiB stored **63 MiB** (+57%). The disk-floor check races the same
  way, and the floor is what protects the other live apps on the shared box.

**Fix:** run COUNT and INSERT in one `BEGIN IMMEDIATE` transaction (or `INSERT … SELECT … WHERE (SELECT COUNT(*)…) < 50`).
Do the `storedBytes()` check inside the write transaction, or reserve bytes in an in-process mutex-guarded counter.

## B6 · MEDIUM · PROVEN (ratio) / SUSPECTED (crash): a public world can carry a decompression bomb or a hostile save, and visiting it crashes the tab
`js/net/api.js:85-94` (`DecompressionStream` → `Response.text()` → `JSON.parse`, no size limit), and
`js/main.js:198-211` (`save.world` and `save.player.pos` are trusted).

The server lets the uploader pick `application/gzip` and checks nothing inside the blob. gzip of zeros compresses about
1000:1 (`head -c 1G /dev/zero | gzip -9` → 1,043,656 bytes), so an 8 MB blob inflates to about 8 GB. Any player who taps
**Visit** on that public world runs it to OOM. A JSON save with `player.pos: [1e9, NaN, 0]` or a huge `sections` map is
also loaded without validation. That is the NaN black-frame and stall class of bug, reachable by anyone who can publish
(see B1).

**Fix:** decompress through a counting `TransformStream` and abort above ~64 MB. Validate `save.v`, `pos` (finite and in
range) and section count and size before `World.deserialize`. The server could also refuse gzip blobs whose ISIZE
trailer is larger than 64 MB.

## B7 · MEDIUM · PROVEN (by reading): one failed health probe hides the cloud for the rest of the session
`js/net/api.js:24-43`, with no caller of `available(true)` anywhere in `js/` (grep).

`availProbe` is cached forever, including a `false` result. A 2.5 s timeout on a slow mobile connection at load, a
moment offline, or the ~3 s restart window after B2's OOM kill all leave `account.refresh()` showing "Playing offline"
until the page is reloaded. The player's cloud worlds disappear from the list, and new worlds silently go to IndexedDB.
**Fix:** don't cache `false`. Re-probe on `online`/`visibilitychange` and before `account.refresh()`, and back the
timeout off rather than treating one slow reply as final.

## B8 · MEDIUM · SUSPECTED: deploy builds a heavy module on the small shared box and has no rollback
`server/deploy.sh:33` and `:42`.

- `go build` of `modernc.org/sqlite` (a transpiled C library of about 10 MB of Go) needs well over 1 GB of RAM when it is
  not cached. This runs on an 845 MB box next to live apps, so a module bump or a cleared build cache can push the box into
  swap or OOM. **Fix:** cross-compile locally (`GOOS=linux GOARCH=amd64 CGO_ENABLED=0`) and rsync the binary.
- `mv $BIN.new $BIN && systemctl restart` keeps no copy of the old binary. The health loop never fails the script, so a
  bad binary leaves `synthwild` down and the only way back is a rebuild. `RUN_TESTS` is opt-in. **Fix:** keep `$BIN.prev`,
  and if health fails after the restart, restore it and exit non-zero.

## B9 · LOW · PROVEN: log injection through an encoded newline in the path
`server/main.go:221-228` logs the decoded `r.URL.Path` with `%s`. The 404 path guard runs inside the handler, but the
logger wraps the handler, so rejected paths are logged anyway.
`GET /api/x%0a2026/10/02%2000:00:00%20POST%20/api/admin/users%20FORGED` writes a forged line into journald:
`2026/10/02 00:00:00 POST /api/admin/users FORGED 0s`. **Fix:** log with `%q`, or strip control characters.

## B10 · LOW · SUSPECTED: the rate limit is one shared bucket per IP, and X-Forwarded-For uses its first entry
`server/auth.go:148-190`.

(a) Login, admin/google and admin/link share 10 tries per minute per IP. A classroom or family behind one NAT IP, with
typos, will lock each other out, and one person can lock out the whole school. (b) `clientIP` takes the **first** XFF
entry. That is only safe because current Caddy replaces XFF from untrusted clients. If anyone later adds
`trusted_proxies` (Cloudflare, for example), the first entry becomes attacker-chosen and the limit can be bypassed per
request. **Fix:** take the last (rightmost) XFF hop. Key on IP plus attempted username, or count failures only (404s), so
that successful kid logins don't use up the budget.

## B11 · LOW · SUSPECTED (architectural): every script on games.br8t.com is trusted by synthwild, including for minting admin sessions
`server/main.go:181-195` and `js/net/api.js:190-218`.

The cookie path `/gms/3d/synthwild/` limits only where the cookie is sent, not who can send requests. Any page on the
same origin (the hub, every other game) can `fetch('/gms/3d/synthwild/api/…', {credentials:'include'})`. The hub also
keeps its Firebase session in IndexedDB on this origin (`/lib/auth/auth.js:45`). An admin who is signed in to the hub
therefore lets any script on games.br8t.com call `getIdToken()` and POST it to `admin/google`. The Google popup is not a
real barrier. One XSS in any br8t game is enough to get a synthwild admin. **Fix:** accept this and document it, or
require `auth_time` to be within the last ~5 minutes (a fresh popup) for `admin/google`. Long term, give the API its own
subdomain.

## B12 · LOW · PROVEN (by reading): re-adding a removed username hands the old player's private worlds to the new holder
`server/users.go:80-90`. This restore is deliberate, but the names are kids' first names. If "sam" is removed and a
different Sam is added later, the new Sam inherits the first Sam's private worlds. **Fix:** when an admin re-adds a removed
name, ask "restore the old account, or start fresh?". A fresh start renames the old row to `sam~<id>`.

## B13 · LOW · SUSPECTED: the database is probably world-readable on the shared box
`deploy.sh:24` creates `/srv/data/synthwild` with `install -d` (0755), and SQLite creates `synthwild.db`, `-wal` and `-shm`
with mode 0644 (the service sets no `UMask=`). Session tokens are hashed, but usernames are credentials (B1), and all
blobs are readable by any local account or other app on the box. I did not check this on the box. **Fix:** add
`UMask=0077` in the unit and `chmod 700` the data directory.

## B14 · LOW · PROVEN (by reading): render memory and robustness items
- `js/render/chunks.js:28,33-37`: `keyCache` (section key → parsed array) is cleared only by `setWorld`. It grows by 8
  entries for every column ever visited in a session, so long exploration builds an unbounded Map. **Fix:** delete keys in
  the cull loop (`:199`) together with `secs.delete`.
- `js/render/mesherpool.js:18`: when a worker reports an `error`, the job is dropped and the key is never put back in
  `stale`, so that section stays a hole until something else dirties it. **Fix:** re-queue it once through a callback.
- `js/render/post.js:28-31`: after switching from High to Med or Low, the bloom composer (a full-resolution HalfFloat
  target plus the mip chain) stays allocated and is even resized on every `onResize`. **Fix:** dispose the composer on
  `setEnabled(false)`.

## B15 · LOW · SUSPECTED: the Google admin popup will likely be blocked on iOS Safari
`js/net/api.js:190-208`. `signInWithPopup` runs only after `await available()` and two dynamic CDN imports of the
Firebase SDK, so the user gesture has usually expired by then. On a cold mobile cache this gives `popup-blocked`, and
`account.js` shows "Allow pop-ups", which the user can't do in a way that helps. **Fix:** preload the SDK when the
Sign-in sheet opens, and call `signInWithPopup` directly from the click handler.

## B16 · LOW · PROVEN (by reading): an unknown `kid` forces a Google cert fetch while holding the cache mutex
`server/firebase.go:134-146` and `:61-106`. A token with a random `kid` zeroes the cache expiry and refetches. The fetch
runs under `certCache.Lock()` with a 10 s client timeout, so every concurrent admin verification queues behind it. If
Google is slow or unreachable, each forged token stalls admin sign-in for 10 s. The rate limit bounds this per IP but not
globally. **Fix:** allow at most one forced refetch per minute, and fetch outside the lock.

---

## Checked and believed SOUND
- **Firebase verification:** RS256 only (the `alg` is checked before key lookup, so `none` or HS256 confusion is
  impossible), keys are looked up by `kid` only from Google's x509 set, `aud`/`iss` match exactly, `exp` is checked
  (0 means expired), `iat`/`auth_time` must be ≤ now+5 min, `sub` must be non-empty, `email_verified` is required, and
  the email is lower-cased against the allowlist. Lookalike, suffix and case tricks were rejected (test.sh plus my reading).
  Unicode case-folding tricks don't help, because Google has already verified the address.
- **Admin link:** 256-bit token, stored hashed, consumed atomically (`DELETE … RETURNING`), 15-minute expiry, and the
  allowlist is re-checked when the link is used. The query string is not logged by the app.
- **Sessions:** a new random token on every login (no fixation), the token is SHA-256 hashed in the DB, cookies are
  HttpOnly + Secure + SameSite=Lax + path-scoped, admin rights are re-checked against the allowlist on every request, and
  removing a user deletes their sessions inside a transaction.
- **CSRF:** all state changes are POST/PUT/PATCH/DELETE. The Origin values `null`, `https://files.br8t.com` and
  `host.evil.io` all get 403. A request with no Origin passes, but browsers always send Origin on cross-origin
  non-GET requests, and SameSite=Lax already withholds the cookie cross-site. `X-Forwarded-Host` comes from Caddy.
- **IDOR:** every world read goes through `visibleToUser` (owner, or public with an active owner). Writes need `Mine`, and
  DELETE also filters on `owner_id`. Private worlds of others answer 404, and removed users' worlds are hidden from the
  public list and from direct GETs. World IDs must match `^w_[0-9a-f]{16}$`.
- **SQL injection:** every query is parameterised. The only string concatenation is of constant fragments.
- **Path traversal:** unclean paths and `%2x`/`%5x` get 404. Static serving is local-dev only.
- **Body limits:** JSON bodies are capped at 64 KB, blobs at 8 MB, thumbs at 100 KB, with the JPEG magic checked.
  Content-Length is checked before reading, and `ReadHeaderTimeout` is 10 s (Caddy also absorbs slowloris).
- **Served content types:** blobs come back with the stored type from a 3-value allowlist, thumbs as `image/jpeg`,
  always with `nosniff`. Nothing renders as HTML.
- **world_data cascade:** `foreign_keys(1)` holds on the pooled connection, and deleted worlds leave no orphan
  `world_data` rows (checked).
- **DB concurrency:** every transaction uses only `tx` (no `db` calls inside a tx, which would deadlock with
  MaxOpenConns=1). The version check is an atomic conditional UPDATE. WAL with busy_timeout is set.
- **Panics:** I found no reachable nil dereference. net/http recovers panics per request, and the deferred `Rollback`
  releases the connection.
- **Caddy edit:** idempotent (an existing route makes it exit early), backed up, validated, and the backup is restored on
  failure. Caddy reloads only when the route was added. The systemd unit has `ProtectSystem=strict`, `NoNewPrivileges`
  and runs as `deploy`, not root.
- **Stored XSS:** world names, usernames and display names reach the DOM only as text nodes (`dom.h` children, toasts,
  popups) or through `setAttribute`. The `innerHTML` sinks (`minigames/hud.js`, `wheel.js`, `glyphs.js`, `brushview.js`,
  `touch.js`) only receive internal strings and bot names. Cloud `thumbUrl` is built from a server-validated id and an
  integer, so the CSS `url("…")` can't be broken out of.
- **IndexedDB:** quota errors abort the transaction (`onabort` → reject → "Could not save" toast), and `local.put` is
  atomic across the two stores.
- **Render lifecycle:** world start/stop returns to exactly 11 geometries and 15 textures. Chunk columns dispose their
  geometry on cull and on `setWorld(null)`. Mesh results are tagged with a generation (`gen`), so a stale world's jobs
  are dropped. There is one job per section in flight, and a re-dirtied busy section stays stale until it is re-meshed.
- **Mesher borders:** `meshPayload` packs all 26 neighbours (with UNLOADED/COREPLATE fill), and a chunk load marks its
  8 loaded neighbours' sections dirty. Light writes and edits on a section face dirty the adjacent section.
- **Context loss:** `WEBGL_lose_context` lose and restore during play gave a screen mean of 142.9 before, 28.7 while lost
  and 147.4 after restore. The view re-rendered fully, and chunks kept meshing after a 200 m teleport. There were no
  exceptions. Three.js re-uploads everything.
- **Mobile defaults:** pixel ratio is capped at 1.25 (Med on mobile), bloom is High-only, render distance is 6 on
  mobile, and the mesher uses at most 3 workers with 3 jobs each. Upload and rebuild work is time-budgeted at
  3–4 ms per frame, and fx particles, holos and EMP spheres are pooled.
