# synthwild server

Accounts and world saves for SYNTHWILD. Go + SQLite (`modernc.org/sqlite`, no CGO), one binary.
Live at `https://games.br8t.com/gms/3d/synthwild/api/` as the `synthwild` systemd service on
`127.0.0.1:8011`, with data in `/srv/data/synthwild/synthwild.db`. The client is `../js/net/api.js`, and the
full API contract is in `../docs/notes/server.md`.

## Run locally
```bash
cd server
SYNTHWILD_DATA=/tmp/sw SYNTHWILD_INSECURE_COOKIE=1 SYNTHWILD_STATIC=../../../.. \
SYNTHWILD_PUBLIC_URL=http://localhost:8011/gms/3d/synthwild go run .
# game + API on one origin:  http://localhost:8011/gms/3d/synthwild/
SYNTHWILD_DATA=/tmp/sw SYNTHWILD_PUBLIC_URL=http://localhost:8011/gms/3d/synthwild go run . admin-link aaron@itmatters.mobi
```
`SYNTHWILD_STATIC` (local only) serves the site root so the game and the API share an origin. Google
admin sign-in works on `localhost`, since Firebase allows it by default.

| env | default |
|---|---|
| `SYNTHWILD_ADDR` | `127.0.0.1:8011` |
| `SYNTHWILD_DATA` | `./data` |
| `SYNTHWILD_PREFIX` | `/gms/3d/synthwild` (stripped from incoming paths; `/api/...` also works) |
| `SYNTHWILD_PUBLIC_URL` | `https://games.br8t.com/gms/3d/synthwild` (for admin links) |
| `SYNTHWILD_ADMINS` | `aaron@itmatters.mobi,dante@itmatters.mobi,malaki@itmatters.mobi` |
| `SYNTHWILD_GLOBAL_CAP` | 3 GiB of stored blobs + thumbs |
| `SYNTHWILD_DISK_FLOOR` | 400 MiB that must stay free on the data disk |
| `SYNTHWILD_INSECURE_COOKIE` | unset (set it for plain-http local testing) |
| `SYNTHWILD_TEST_CERTS` | test only: a `{kid: PEM}` file replacing Google's signing certs |

## Test
```bash
./test.sh                          # builds, starts a temp instance, 186 checks (KEEP=1 keeps the temp dir)
node ../tools/server_apitest.mjs   # api.js in headless Chrome against a temp server (48 checks)
```

## Deploy
```bash
./deploy.sh                 # build on the box, unit, Caddy route, static client, three.js, health check
RUN_TESTS=1 ./deploy.sh     # also runs test.sh on the box first
ROLLBACK_DRILL=1 ./deploy.sh  # ships a binary that cannot start; proves the auto-rollback (exits 1)
SKIP_STATIC=1 ./deploy.sh   # server only
```
The static client goes to `/srv/apps/br8tgames/site/gms/3d/synthwild/` (excluding `docs/`, `server/`, `tools/` and
`*.md`), and three.js goes to `/srv/apps/br8tgames/site/gms/lib/three/0.180.0/` (never with `--delete`).
`caddy_route.py` adds `handle /gms/3d/synthwild/api/* { reverse_proxy 127.0.0.1:8011 }` to the
`games.br8t.com` block once. It backs up the file, validates it and restores the backup on failure.
This script does not touch `games/deploy.sh`.
The box build runs with `GOMAXPROCS=1 nice go build -p 1`. The previous binary and unit are kept, and a failed health check
restores them and exits 1. The rate limiter relies on Caddy replacing any client-sent `X-Forwarded-For`, which it does
by default; this was verified live. If `trusted_proxies` is ever configured, revisit `clientIP` in `auth.go`.

## Admin sign-in
- Normal: the "Admin" button calls `api.adminGoogleSignIn()` (a Google popup via Firebase project `br8t-games`), and the
  server verifies the ID token and checks the allowlist.
- Fallback: `./admin-link.sh aaron@itmatters.mobi` prints a one-time URL that is valid for 15 minutes. Opening it signs you in as admin.
  On the box it runs `SYNTHWILD_DATA=/srv/data/synthwild /srv/apps/synthwild/synthwild admin-link <email>`.

## Backups
```bash
ssh br8t 'sqlite3 /srv/data/synthwild/synthwild.db ".backup /srv/data/synthwild/backup-$(date +%F).db"'
scp br8t:/srv/data/synthwild/backup-*.db ~/backups/synthwild/
```
`.backup` is safe while the service runs (the database is in WAL mode). Restore by stopping the service and copying the
backup over `synthwild.db`, after deleting `synthwild.db-wal` and `synthwild.db-shm`.

## Ops
```bash
ssh br8t 'systemctl status synthwild; sudo journalctl -u synthwild -n 50'
ssh br8t 'curl -s http://127.0.0.1:8011/api/health'
```
