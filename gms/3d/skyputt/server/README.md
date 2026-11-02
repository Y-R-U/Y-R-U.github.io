# SKYPUTT server

Go + SQLite (pure Go, `CGO_ENABLED=0`) service for online mini golf: websocket lobby, private rooms
with invite codes, a public room list, quick play, ghost-AI seat fill, and a **shot relay**: every
client runs the deterministic physics (D5), sends each shot's input when it putts and the result when
the ball stops; every other client replays the shot as a ghost. Results are client-reported (**D11:
no cheat detection yet**). Online is **free**: no allowance / br8t-payments gate (proposal in
`docs/notes/online.md`). Modelled on `gms/3d/gambit/server`. **Not deployed.** Client: `js/net/`.

| | |
|---|---|
| Run locally | `tools/server_run.sh` (`--bg`, `--stop`, `FRESH=1`) → `http://<host>:8098/gms/3d/skyputt/api/…` (8094 is GAMBIT's) |
| Tests | `server/test.sh` (gofmt, vet, Go tests, binary smoke) · `node tools/online_test.mjs` (client + replay + net.js vs a running server) · `node tools/online_cdp.mjs` (two browsers) |
| Box | `127.0.0.1:8023`, `/srv/apps/skyputt`, `/srv/data/skyputt` (0700), `skyputt.service`, Caddy `handle /gms/3d/skyputt/api/*` |
| Deps | `modernc.org/sqlite` (BSD-3), `github.com/coder/websocket` (ISC) — same as GAMBIT |

## Files
`main.go` config, HTTP routes, CLI · `hub.go` users, lobby, quick play, dispatch, timers ·
`room.go` rooms, seats, holes, relay, scoring, host migration, AI takeover · `opts.go` room options,
shot modifiers, ball state validation · `session.go` websocket · `db.go` players + finished rounds ·
`firebase.go` ID tokens (from GAMBIT, anonymous allowed) · `limits.go`, `names.go` (from GAMBIT/Clued).

## How a round works
- **Lobby**: the host picks options; members join by code (or from the public list / quick play).
- **Start** (host, or the quick-play timer): empty seats fill with ghost AIs (`ai.count`, personality,
  skill ≤ 0.9 per D14; quick play fills every seat). Hole 1 starts `1.5 s` later at `holeAt`.
- **Play**: everyone plays the same hole at once. `holeAt` is the zero of the **shared obstacle clock**
  (clients set `world.time = (serverNow − holeAt)/1000` while not rolling), so windmills line up.
  A shot is relayed the moment it's taken (`shot`: velocity, `t0` on the obstacle clock, helpers,
  the exact ball state). When the ball stops the shooter sends `result` (`rest` / `oob` / `cup` + where);
  the server **counts the strokes itself** (+1 a shot, +1 more out of bounds, D9) and picks a seat up
  at par + 4 (D10). One ball in flight per seat; shot numbers (`n`) keep stale messages out.
- **AI seats** are driven by the **host's client** (js/ai planner in a worker): the host sends their
  `shot`/`result` with `seat`. Only the host may drive AI-controlled seats.
- **Hole end**: when every seat is done (or the hole time cap passes: `(shotClock+15)·(par+4)+30 s`, or
  6 min without a shot clock; unfinished seats are picked up) → scoreboard (`phase: board`). Next hole
  when every connected human taps Next, or after 20 s. After the last hole → `ended` (results, stored
  in `rounds`). The host can `again` → back to the lobby with the same people.
- **Disconnects**: a human offline 30 s mid-round gets an **AI stand-in** (`ctrl: ai`) until they come
  back (the welcome returns the room; their seat is theirs again). Leaving mid-round = AI finishes
  that seat; you can't rejoin it. **Host migration**: host offline 10 s (or leaving) → the longest-
  seated connected human becomes host and takes over the AI seats; shots the old host had in flight
  are voided (`result state: void`, no stroke). A shot without a result for 45 s is voided too, and a
  player who comes back (reload, new connection) has any shot of theirs still in flight voided at once.
  Rooms close when no human has been connected for 60 s (lobby) / 180 s (mid-round), 10 min after
  the results, or after 3 h.

## Identity
Same as GAMBIT: every client sends a Firebase ID token (anonymous users included) in `hello`, verified
against Google's securetoken certs (aud/iss `br8t-games`). `SKYPUTT_DEV_AUTH=1` (local only; deploy.sh
refuses a box with it on) also accepts `dev:<uid>:<name>:<anon|signed>`.

## Abuse bounds
Message ≤ 4 KB · 12 msg/s per socket, burst 40 · 60 websocket opens/min and 12 sockets per IP · 800
sockets · hello within 10 s · one room per user (joining another leaves the first) · 20 room creates,
60 quick plays, 60 joins+peeks per user per 10 min, 200 joins+peeks per IP per 10 min · codes 6 chars
of 31 (no 0/O/1/I/L) · 500 rooms, 100 public, 3 public per IP · names cleaned + profanity filtered
(`names.go`) · shot velocity ≤ 9 m/s, positions finite and |x| < 1000 · helper use checked against the
room's helper mode (`off`: none; `fixed`: N of each per round incl. Long Sight stacks and Mulligans;
`own`: the client's own inventory, unchecked) · `./skyputt pause on|off` (with `SKYPUTT_DATA` set)
refuses new rooms at once · `./skyputt stats`.

## Protocol (v1)
Websocket: `wss://games.br8t.com/gms/3d/skyputt/api/ws` (local `ws://<host>:8098/gms/3d/skyputt/api/ws`).
JSON text frames. Client messages `{t, id?, …}`; a message with `id` gets exactly one reply
`{t:"ok", id, …}` or `{t:"error", id, code, error}`. Everything else is a push. Times are server epoch ms.

### Client → server
| t | fields | reply / effect |
|---|---|---|
| `hello` | `token`, `name?`, `v` | first, within 10 s → `welcome` (or `bad_token` + close 4001) |
| `ping` | | `pong {now}` |
| `lobby` | `on` (default true) | `{lobby}`; while on, `lobby` pushes (≤ 1/s) |
| `rename` | `name` | `{name}` |
| `createRoom` | `opts` | `{room}` (you are host) |
| `quick` | `opts` (used only if a new quick room is needed) | `{room}`: joins the fullest open quick room, else opens one (public, AI-filled, starts 20 s after creation / ≥ 6 s after the last join, or at once when full) |
| `joinRoom` / `peekRoom` | `code` (any case) | `{room}` (lobby only; members can always rejoin) / `{room: listing, state}` |
| `leaveRoom` | | lobby: seat removed; mid-round: AI finishes it |
| `room` | | `{room}` snapshot (resync) |
| `setOpts` | `opts` | host, lobby → `{room}` |
| `start` | | host, lobby; needs ≥ 2 seats incl. AIs |
| `shot` | `hole`, `n`, `vx`, `vz`, `t0`, `aim`, `power`, `mods`, `ball`, `seat?` | `{seat, n}`; others get `shot` |
| `result` | `hole`, `n`, `state` rest\|oob\|cup, `to [x,y,z]`, `seat?` | `{seat, strokes, done, picked}`; others get `result` |
| `mulligan` | `hole`, `seat?` | `{seat, strokes, to}`; others get `mulligan` (back to before the last shot) |
| `next` | | ready for the next hole (board phase) |
| `again` | | host, after the round → lobby |

`seat` is only for AI-controlled seats (host). **opts**: `{name, public, course, courseName,
holes:[{id,par}] (1–18, client hole ids), theme, max 2–8, helpers:{mode off|fixed|own, n 1–5},
shotClock 0|20|30|45|60, ai:{count 0–7, personality any|carl|bertha|banks|lou|pro|professor|zoe|mags, skill (≤ 0.9)}}`.
**mods**: `{magnet, sticky, guard, ghost, steady, power, sight 0–3}` (helpers armed for that shot).
**ball**: `{x,y,z,sup,n:[3],surf}` (js/ai/round.js `ballState`, the shooter's ball before the shot).

### Server → client
| t | fields |
|---|---|
| `welcome` | `you {pid,name,anon,dev}`, `now`, `v`, `room` (snapshot or null: you are put back in your room), `paused` |
| `lobby` | `{rooms:[listing], playing, online}` |
| `room` | `room` snapshot, `ev?` holeStart \| holeEnd \| end (pushed on every structural change: joins, leaves, presence, options, host, takeover, phase) |
| `shot` | `seat`, `hole`, `n`, `vx`, `vz`, `t0`, `aim`, `power`, `mods`, `ball` |
| `result` | `seat`, `hole`, `n`, `state` rest\|oob\|cup\|void, `to` (null = tee), `strokes`, `done`, `picked` |
| `mulligan` | `seat`, `hole`, `to`, `strokes` |
| `roomClosed` | `code`, `reason` left\|empty\|expired\|joined_other |

**room**: `{code, opts, quick, state lobby|playing|ended, host (seat), you (seat), created, startAt,
startedAt, hole, phase play|board, holeAt, capAt, boardAt, nextAt, endedAt, roundId, now,
seats:[{i, kind human|ai, name, color, ctrl human|ai, left, next, online, host?, pid?, ai?{personality,skill,seed},
total, scores[] (-1 = not yet), picked[], uses{helper:n}, cur:{strokes, n, pos|null, done, picked, flying, mull}}]}`.
**listing**: `{code, name, quick, players, max, holes, course, courseName, theme, helpers, shotClock, ai, host, startAt, created}`.

### Error codes
`bad_token` `bad_request` `rate_limited` `paused` `lobby_full` `too_many_rooms` `no_room` `in_play`
`room_full` `not_host` `not_now` `need_players` `bad_course` `bad_theme` `bad_holes` `bad_max`
`bad_helpers` `bad_clock` `bad_ai` `bad_name` `not_your_seat` `stale_hole` `stale_shot` `hole_done`
`in_flight` `bad_shot` `bad_result` `no_helpers` `no_helpers_left`. net.js adds `offline`, `timeout`, `unavailable`.

### HTTP (CORS for `SKYPUTT_ORIGINS`, GET only)
`/api/health` · `/api/status` (limits, personalities) · `/api/rooms` (lobby view) · `/api/rounds/{id}`
(a finished round: holes + seats with scores, totals, ranks).

## Deploy (later, with Aaron's OK — nothing here has touched the box)
1. Check loopback **8023** is free on the box: `ss -ltnp | grep 8023` (8005 filestore, 8012 clued,
   8016 payments, 8019 gambit). Change `PORT` in deploy.sh, `skyputt.service`, `Caddyfile.fragment`
   and `caddy_route.py` together if it isn't.
2. No payments change (online SKYPUTT is free).
3. Flip `ONLINE_PUBLIC = true` in `js/net/net.js` (until then Pages / games.br8t.com show "Online:
   coming soon" and never open a socket). Commit + push that with the static deploy.
4. `CONFIRM=yes server/deploy.sh` (builds on the box with 1 CPU at low priority, installs
   `skyputt.service`, health check with rollback, refuses if devAuth is on, adds the Caddy route via
   `caddy_route.py` — or merge `Caddyfile.fragment` by hand — reloads Caddy, then checks public
   health, CORS and the websocket upgrade). `RUN_TESTS=1` runs `test.sh` on the box first;
   `STATIC=1` also rsyncs the client to games.br8t.com.
5. Verify with two real devices: Online → Create room → share the link → the other joins → play
   3 holes with 2 ghost AIs; quick play; reload mid-round (rejoin); host leaves (migration).
6. Backups: SQLite `.backup` of `/srv/data/skyputt/skyputt.db` (only finished rounds + players).
