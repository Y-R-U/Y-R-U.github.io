# Lane 6 — Server notes

Status (2026-10-02): **server, api.js and deploy DONE and LIVE.** `https://games.br8t.com/gms/3d/synthwild/api/health` → ok.
`server/test.sh` 160/160 locally and on the box, and `tools/server_apitest.mjs` (api.js in headless Chrome) 28/28.
The contract below is what lane 5 codes against. It is implemented as written.

## Client API contract (`js/net/api.js`)

```js
import { api, ApiError } from './net/api.js';   // also `export default api`
```
Every call is async. Errors throw `ApiError { status, code, message }` (status 0 = network/offline).
`code` values: `offline`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `bad_request`,
`too_large`, `rate_limited`, `quota`, `server`.

### Availability and session
| call | returns | notes |
|---|---|---|
| `api.available()` | `bool` | probes `api/health` once (2.5 s timeout, cached; `available(true)` re-probes). `false` on GitHub Pages / offline. All cloud calls throw `code:'offline'` when unavailable. |
| `api.me()` | `User \| null` | null = not signed in (or offline) |
| `api.login(username)` | `User` | 404 `not_found` if the username doesn't exist; 429 `rate_limited` |
| `api.logout()` | `void` | |
| `api.adminGoogleSignIn()` | `User` (`admin:true`) | loads the Firebase SDK on demand, Google popup, server verifies. 403 `forbidden` if the email isn't one of the 3 admins. Popup blocked → `code:'popup'`. |

`User = { username, display, admin: bool, email: string|null }`.
An admin who signs in with Google is logged in **as their player username** with `admin:true`.
Logging in with the same username via `login()` gives a normal (non-admin) session.

### Admin (needs `admin:true`, else 403)
| call | returns |
|---|---|
| `api.admin.listUsers()` | `[{ username, display, createdAt, createdBy, adminEmail /*null for kids*/, worlds /*count*/ }]` |
| `api.admin.addUser(username, display)` | the new user row. 400 `bad_request` for bad names (3–20 chars, `[a-z0-9_]`, lower-cased by the client), 409 `conflict` if taken |
| `api.admin.removeUser(username)` | `void`. Kills their sessions; their worlds are kept but hidden. Admin usernames can't be removed (400). |

### Worlds — cloud (`api.worlds`) and local (`api.local`) share one shape
```js
WorldMeta = {
  id,                     // cloud: 'w_<16 hex>'   local: 'l_<...>'
  source: 'cloud'|'local',
  owner, ownerDisplay,    // local: owner = '' , ownerDisplay = 'This device'
  mine: bool,             // local: always true
  name, seed /*string*/, mode: 'survival'|'build', public: bool,
  version /*int, 0 = no save data yet*/, size /*bytes of stored blob*/,
  thumbUrl /*string|null — use as <img src>*/,
  createdAt, updatedAt    // ms since epoch
}
```
| call | returns | notes |
|---|---|---|
| `worlds.listMine()` | `WorldMeta[]` newest first | |
| `worlds.listPublic()` | `WorldMeta[]` | every public world of active users, including your own (`mine:true`) |
| `worlds.get(id)` | `{ meta, data }` | `data` = the decoded save object (whatever was passed to save), or `null` if version 0. Owner, or anyone signed in if public. A non-owner gets `meta.mine:false` → play a copy, "Save a copy" = `worlds.create({..., data})` |
| `worlds.create({ name, seed, mode, public=false, data?, thumb? })` | `WorldMeta` | if `data` is given it is saved immediately (version 1) |
| `worlds.save(id, data, version, { thumb }?)` | `WorldMeta` (new version) | `version` = the version you loaded. Mismatch → `ApiError` 409 `conflict` with `err.current` = the server's `WorldMeta` |
| `worlds.patch(id, { name?, public? })` | `WorldMeta` | owner only |
| `worlds.remove(id)` | `void` | owner only |
| `local.list()` | `WorldMeta[]` | IndexedDB `synthwild` / store `worlds`; works offline and on GitHub Pages |
| `local.get(id)` | `{ meta, data }` | |
| `local.put({ id?, name?, seed?, mode?, data?, thumb? })` | `WorldMeta` | no id → new world. With an id, only the given fields change. Version increments on every put. |
| `local.remove(id)` | `void` | |

- `data` is any JSON-serialisable object (e.g. `game.save()` output). api.js JSON-encodes and gzips it with
  `CompressionStream('gzip')` where available (plain JSON otherwise). `Uint8Array`/`Blob` also accepted and stored as-is.
- `thumb`: a JPEG `Blob` or a `data:image/jpeg` URL, ≤ 100 KB (aim for ~256×144 at quality 0.7). Use
  `canvas.toBlob(cb, 'image/jpeg', 0.7)`; the renderer needs `preserveDrawingBuffer` or capture right after render.
- Limits: blob ≤ 8 MB compressed (413 `too_large`), 50 worlds per user (403 `quota`), the global 3 GB / disk-floor cap
  (507 `quota`), names 1–48 chars, seeds ≤ 64 chars.
- `api.online` is the last `available()` result (sync). `api.base` is the resolved API URL.
- Thumbnails are uploaded after the blob; a thumb upload doesn't bump `version`.
- Helper: `api.isCloud(meta)`.

## HTTP endpoints (all under `/gms/3d/synthwild/api/`, JSON unless noted)
Errors are `{error, code}`. A session is required except where it says none.
| method + path | auth | body → response |
|---|---|---|
| `GET health` | none | `{ok, name:'synthwild', version}` |
| `GET me` | none | `{user: User|null}` |
| `POST login` | none, rate-limited | `{username}` → `{user}` + cookie; 404 unknown |
| `POST logout` | none | clears the session server-side |
| `POST admin/google` | none, rate-limited | `{idToken}` (Firebase) → `{user}` admin session; 401 bad token, 403 not allowlisted |
| `GET admin/link?t=` | none, rate-limited | one-time link from the CLI → 302 to the game with an admin session |
| `GET admin/users` | admin | `{users:[...]}` |
| `POST admin/users` | admin | `{username, display}` → 201 `{user}`; 409 taken. Re-adding a removed name restores it (and its worlds) |
| `DELETE admin/users/{username}` | admin | removes it, kills sessions, hides worlds; 400 for admin accounts |
| `GET worlds?scope=mine|public` | user | `{worlds:[World]}` (public: max 500, newest first) |
| `POST worlds` | user | `{name, seed, mode, public}` → 201 `{world}` (version 0) |
| `GET worlds/{id}` | owner, or anyone if public | `{world}`. Private worlds of others → 404 |
| `PATCH worlds/{id}` | owner | `{name?, public?}` → `{world}` |
| `DELETE worlds/{id}` | owner | |
| `GET worlds/{id}/blob` | owner/public | raw bytes, `Content-Type` as stored, `X-World-Version`; 204 if none |
| `PUT worlds/{id}/blob?version=N` | owner | raw body (`application/gzip|json|octet-stream`, ≤ 8 MB) → `{world}`; 409 `{code:'conflict', world}` |
| `GET worlds/{id}/thumb` | owner/public | `image/jpeg` (private cache 1 day; the client adds `?v=updatedAt`) |
| `PUT worlds/{id}/thumb` | owner | raw JPEG ≤ 100 KB → `{world}` |
Server `World` JSON = `WorldMeta` minus `source`/`thumbUrl`, plus `thumb: bool` (api.js converts it).

## Security model
- Cookie `sw_session`: HttpOnly, Secure (https), SameSite=Lax, `Path=/gms/3d/synthwild/`. It lasts 400 days for players
  and 30 days for admins. Tokens are stored as SHA-256 in the database.
- Admin = a session created through Google or the admin link **and** an email still in `SYNTHWILD_ADMINS`. Logging in by
  username never grants admin.
- Firebase token checks: RS256 only, a kid from Google's securetoken x509 certs (cached by `max-age`, refetched once
  on an unknown kid), aud `br8t-games`, iss `https://securetoken.google.com/br8t-games`, exp, iat/auth_time
  (5 min skew), a non-empty sub, `email_verified`, and the email in the allowlist (case-insensitive).
- Rate limit: 10 attempts per minute per client IP across login, admin/google and admin/link. X-Forwarded-For is
  trusted only from loopback (Caddy).
- Non-GET requests with a foreign `Origin` → 403. Paths that are not clean or contain `%2x`/`%5x` → 404. World ids
  must match `^w_[0-9a-f]{16}$`.

## Files
- `server/*.go`: `main.go` (config, router, CLI), `auth.go` (sessions, login, rate limit, admin link), `firebase.go`
  (token verification), `users.go` (admin user management), `worlds.go`, `db.go` (schema + `migrations` list).
- `server/test.sh` runs the API tests. `server/deploy.sh` deploys. `server/caddy_route.py` holds the idempotent Caddy
  edit. `server/admin-link.sh` is the CLI fallback over ssh. `server/synthwild.service` is the systemd unit.
  `server/README.md`.
- `tools/server_mintjwt.go` fakes Google certs and tokens for test.sh. `tools/server_apitest.{html,mjs}` is the
  browser test of api.js (CDP port 9316, server on :8097).

## Deploy state (box)
- Service `synthwild` is active, ~12 MB RSS (`GOMEMLIMIT=96MiB`, `MemoryMax=192M`). The database is
  `/srv/data/synthwild/synthwild.db`.
- The Caddy `games.br8t.com` block now has `handle /gms/3d/synthwild/api/* { reverse_proxy 127.0.0.1:8011 }` with
  `file_server` wrapped in `handle {}`. The backup is `/etc/caddy/Caddyfile.bak-synthwild-*`. The other vhosts are untouched and all
  checked 200 afterwards.
- `deploy.sh` also ships the static client folder (everything except docs/, server/, tools/ and *.md) and rsyncs
  `gms/lib/three/0.180.0/` without `--delete`. Re-run `server/deploy.sh` whenever the client changes (`games/deploy.sh` is
  not used for synthwild).
- Aaron's admin player account `aaron` already exists (created by the live admin-link check).

## For Aaron / manager
- **Firebase:** `games.br8t.com` must be in Firebase Console → Authentication → Settings → Authorized domains. It
  already is, because the hub uses Google sign-in there. `localhost` is allowed by default. Nothing else to do, since the
  Google provider is already enabled. Real Google sign-in has not been tested headless (it needs a human for the popup). Try it once from the title
  screen when lane 5 wires the Admin button. If it fails, use `server/admin-link.sh aaron@br8t.com`.
- Admin usernames default to the email's local part: `aaron`, `dante`, `malaki`.
- Backups: see server/README.md (`sqlite3 .backup`). Nothing is scheduled yet.

## Requests to other lanes
- Lane 5: the title "Login" panel should have a username field → `api.login()`, plus a small "Admin (Google)" link →
  `api.adminGoogleSignIn()`. Show an admin panel (list/add/remove usernames) only when `me().admin`. Check
  `api.available()` first and hide the cloud UI when it's false (GitHub Pages). Handle `conflict` on save by offering
  "Overwrite" (re-save with `err.current.version`) or "Save as copy".
- Lane 2 (main.js): for thumbnails, either `preserveDrawingBuffer:true` or call `canvas.toBlob` right after a render.
