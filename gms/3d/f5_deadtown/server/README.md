# f5deadtown server

One Go binary that serves the Deadtown game and its level editor from the
same project folder on two ports, both backed by a single SQLite database
reachable through a shared REST API.

Pure Go — no cgo, no system SQLite required (`modernc.org/sqlite`).

## Run

From the project folder (`f5_deadtown/`):

```sh
./run.sh
```

That `cd`s into `server/` and runs `go run . "$@"`, so any flags you pass to
`run.sh` are forwarded to the server, e.g.:

```sh
./run.sh -game-port 9001 -editor-port 9002
```

Or run it directly:

```sh
cd server
go run .
```

- Game: http://localhost:8901/
- Editor: http://localhost:8902/ (redirects to `/editor/`)
- Both ports expose the same API under `/api/*`.
- Listens on `0.0.0.0`, so it's reachable from a phone on the same LAN at
  `http://<your-lan-ip>:8901/`.

Stop with Ctrl-C (SIGINT) — shuts down both HTTP servers gracefully.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `-game-port` | `8901` | Port serving the game |
| `-editor-port` | `8902` | Port serving the level editor |
| `-db` | `../data/deadtown.db` | Path to the sqlite file (relative to `server/`'s working directory) |
| `-root` | `..` | Project folder to serve static files from |
| `-reseed` | `false` | Wipe `levels`, `level_versions`, and `config` (NOT `saves`), re-import `data/seed/*.level.json` and `data/seed/config.game.json`, then continue serving |

## Database

SQLite file at `-db` (default `../data/deadtown.db`, i.e.
`f5_deadtown/data/deadtown.db`), opened with WAL journal mode and a 5s busy
timeout. Tables (`data` columns hold raw JSON text; timestamps are RFC3339
UTC):

- `levels (id, name, data, updated_at)`
- `level_versions (vid, level_id, name, data, created_at)`
- `level version snapshots, restore-able`
- `config (key, data, updated_at)`
- `saves (slot, data, updated_at)`

The db file (and its `-wal`/`-shm` siblings) is never served over HTTP even
if it lives under the served root — static serving explicitly forbids
`/data/deadtown.db*`, the `/server/` folder itself, and any dotfile.

## Seeding

On first run (or whenever `-reseed` is passed), the server reads
`<root>/data/seed/*.level.json` — each file is a complete level document
with top-level `"id"` and `"name"` string fields — and inserts one row per
file into `levels`. If `<root>/data/seed/config.game.json` exists it's
upserted as `config` row with key `"game"`. If the seed directory is
missing or empty, the server logs a warning and continues; it does not
fail startup (seed files may not exist yet).

## REST API

JSON in, JSON out. Errors are `{"error":"..."}` with an appropriate HTTP
status. Any `id`/`key`/`slot`/`vid` appearing in a URL path must match
`[a-z0-9_-]{1,64}` or the request is rejected with 400.

- `GET /api/ping` → `{"ok":true}`
- `GET /api/levels` → `{"levels":[{"id","name","updated_at"}, ...]}` (by name)
- `POST /api/levels` `{"id"?,"name","data"}` → `{"id":...}` (201; 409 if id exists; slugified from name if id omitted)
- `GET /api/levels/{id}` → `{"id","name","data","updated_at"}` (404)
- `PUT /api/levels/{id}` `{"name"?,"data"}` → upsert, `{"ok":true}`
- `DELETE /api/levels/{id}` → deletes level + its versions, `{"ok":true}`
- `GET /api/levels/{id}/versions` → `{"versions":[{"vid","name","created_at"}, ...]}` (newest first)
- `POST /api/levels/{id}/versions` `{"name"}` → snapshots current level data, `{"vid":N}` (404 if level missing)
- `GET /api/versions/{vid}` → `{"vid","level_id","name","data","created_at"}` (404)
- `POST /api/levels/{id}/restore` `{"vid"}` → auto-snapshots current data, then overwrites level data with the version's, `{"ok":true}` (404 if level/version missing, 400 if version belongs to another level)
- `DELETE /api/versions/{vid}` → `{"ok":true}`
- `GET /api/config/{key}` → `{"key","data"}` (404)
- `PUT /api/config/{key}` `{"data"}` → upsert, `{"ok":true}`
- `GET /api/saves/{slot}` → `{"slot","data","updated_at"}` (404)
- `PUT /api/saves/{slot}` `{"data"}` → upsert, `{"ok":true}`
- `DELETE /api/saves/{slot}` → `{"ok":true}`
- `POST /api/publish` → writes `<root>/data/snapshot/game.json` with every level + config row, `{"ok":true,"levels":N}`

## Notes for production (br8t.com)

This is a clean, single self-contained Go module (`f5deadtown`) with one
external dependency (`modernc.org/sqlite`, pure Go). To deploy: copy the
`server/` folder, `go build -o f5deadtown .`, run the binary with
production `-root`/`-db`/port flags, put it behind a reverse proxy/TLS
terminator if desired. `Cache-Control: no-store` and permissive CORS are
dev-server defaults set in `withMiddleware` (main.go) — tighten those before
going properly public if needed.
