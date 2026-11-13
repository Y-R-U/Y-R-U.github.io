# THRONG server

Go + SQLite (pure Go, `CGO_ENABLED=0`): websocket rooms, quick match, private rooms by code, snapshot
relay (host browser → guests), input relay (guests → host), host election and migration, late join,
online leaderboards. It never runs the game (DECISIONS D11). Protocol, timings and limits: `../docs/NET.md`.

| | |
|---|---|
| Run locally | `THRONG_ADDR=127.0.0.1:8024 THRONG_DATA=/tmp/throng THRONG_ORIGINS=http://127.0.0.1:8760 go run .` |
| Tests | `./test.sh` (gofmt, vet, `go test`, binary smoke) · `node ../tools/net_test.mjs` · `node ../tools/net_cdp.mjs --cdp=<port>` |
| Box | `127.0.0.1:8024`, `/srv/apps/throng`, `/srv/data/throng` (0700), `throng.service`, Caddy `handle /gms/3d/throng/api/*` |
| Deps | `modernc.org/sqlite`, `github.com/coder/websocket` (same versions as SKYPUTT) |
| Env | `THRONG_ADDR`, `THRONG_DATA`, `THRONG_PREFIX`, `THRONG_ORIGINS` (comma list), `THRONG_MAX_CONNS`, `THRONG_MAX_CONNS_PER_IP`, `THRONG_MAX_ROOMS`, `THRONG_QUICK_WAIT_MS`, `THRONG_NO_RATE` (tests only) |
| CLI | `THRONG_DATA=/srv/data/throng ./throng pause on\|off` (no new rooms) · `./throng stats` |

Files: `main.go` config, routes, health, CORS · `session.go` websocket, per-socket rate limits ·
`hub.go` members, rooms, quick match, relay, migration, late join, results · `boards.go` + `db.go`
leaderboards · `limits.go` per-IP windows · `names.go` name cleaning + room codes (from SKYPUTT).

Deploy (manager only): `CONFIRM=yes ./deploy.sh` — see `../docs/notes/O_report.md` for the steps.
