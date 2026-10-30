# GAMBIT server

Go + SQLite (pure Go, `CGO_ENABLED=0`) service for online play: websocket lobby and game relay,
quick match, public/private rooms, rematch, draws/resign/abort, disconnect grace + resume,
**server-authoritative clocks**, **server-side move legality**, finished games (PGN), Glicko-2
ratings + leaderboard, and the online allowance (D12). Modelled on `gms/2d/clued/server`.
**Not deployed** (D19/D22). Client module: `js/app/net.js`.

| | |
|---|---|
| Run locally | `tools/server_run.sh` (`--bg`, `--stop`, `FRESH=1`) → `http://<host>:8094/gms/3d/gambit/api/…` |
| Tests | `server/test.sh` (gofmt, vet, Go tests, binary smoke) · `node tools/server_net_test.mjs` (net.js vs a running server) |
| Box | `127.0.0.1:8019`, `/srv/apps/gambit`, `/srv/data/gambit` (0700), `gambit.service`, Caddy `handle /gms/3d/gambit/api/*` |
| Deps | `modernc.org/sqlite` (BSD-3), `github.com/coder/websocket` (ISC). Chess rules are our own (`chess.go`, perft-tested). |

## Files
`chess.go` rules (mailbox copy-make, SAN, FEN, repetition key, material) · `clock.go` time
controls + clock · `glicko.go` Glicko-2 · `game.go` game model, PGN, client views ·
`hub.go` live state, pairing, allowance gate/count, finish/store, timers, restore ·
`session.go` websocket + message dispatch · `allowance.go` payments + local counting ·
`firebase.go` ID-token verification (from Clued; anonymous allowed) · `db.go` schema/queries ·
`limits.go`, `names.go` (from Clued) · `main.go` config, HTTP routes, CLI.

## Decisions (see also docs/notes/server.md)
- **Rules**: own Go implementation, not a library — no licence question, ~600 lines, perft
  matches the standard suite to depth 4–5 (start, kiwipete, pos 3–6). Auto-ends on checkmate,
  stalemate, insufficient material, 50-move rule (100 plies) and threefold repetition (matches
  the JS core's `isDraw()`); timeout vs a side that cannot mate = draw.
- **Rating: Glicko-2** (τ 0.5, start 1500/350/0.06, RD floor 45). Each game is its own rating
  period (lichess-style); RD grows with idle time (one period per 7 days). Why: the RD gives a
  principled **provisional** flag (RD > 110), new players converge fast, and returning or
  Unlimited players are handled without a fixed K. Separate ratings per category: bullet,
  blitz, rapid, classical, daily (Unlimited). Category = base + 40×inc: <180 s bullet, <480 s
  blitz, <1500 s rapid, else classical.
- **Anonymous players can play rated** and keep the rating when they sign in (Firebase
  linking keeps the uid). The **leaderboard lists only signed-in, non-provisional** players.
- **A game counts against the allowance when both players have made their first move**
  (ply 2). Aborts (before ply 2, incl. the 30 s first-move timer) cost nothing. Players are
  gated before they seek / create / join / accept a rematch: they need a game left after
  subtracting their started-but-uncounted games.
- **Clocks** don't run until both sides have moved (first-move timer 30 s each, then abort).
  From then the side to move's clock runs from the server's accept time of the previous move;
  increment after each timed move. **Lag credit (D24)**: each timed move is forgiven up to
  min(round-trip lag, 1000 ms), paid from a per-side quota (gain 140–300 ms per move by time
  control, starts at 3×, capped at 5× gain); lag is the full websocket ping RTT measured
  by the server (every 4 s in a timed game). A flag waits for the same credit. Method and abuse
  bound: `clock.go` "lag credit".
- **Unlimited** = correspondence-lite: no clock, each move within **3 days** or the side to
  move loses on time (abort if before ply 2). Games are persisted, survive restarts, players
  can leave and come back; up to 10 Unlimited games per player alongside 1 timed game.
- **Disconnects** (timed games): the clock keeps running; after **30 s** away the opponent may
  `claim` a win (or draw) — reason `abandoned` (aborted if before ply 2). Reconnecting
  restores everything from the `welcome`.
- **Restarts**: live games are written to `live_games` on every change; a restart credits
  the downtime back to timed games (heartbeat in `settings.stopped_at` every 5 s).

## Identity
Every client sends its Firebase ID token (anonymous users included) in `hello`. Verified
exactly as Clued does (RS256 vs Google's securetoken certs, aud/iss `br8t-games`, exp/iat/
auth_time) except that `sign_in_provider: anonymous` is allowed and marks the user `anon`.
No Google credentials needed. `GAMBIT_DEV_AUTH=1` (local only, refused by deploy.sh's check)
also accepts `dev:<uid>:<name>:<anon|signed>` (uid becomes `dev-<uid>`). Admins (verified
email in `GAMBIT_ADMINS`, default aaron@itmatters.mobi) are unlimited.

## Allowance (D12)
| Who | Limit | Counted by |
|---|---|---|
| anonymous uid | `GAMBIT_ANON_PER_DAY` = **2** / UTC day | this server (`anon_usage`), plus `GAMBIT_ANON_PER_IP_DAY` = 30 guest games per IP per day |
| signed in | **5** / UTC day | br8t-payments `POST /api/br8t/allowance {game:"chess", id}` with the player's bearer; `id` = stable UUID of (game, uid) so retries never double-spend |
| BR8T Pass / admin | unlimited | payments answers `unlimited` / admin bypass |

`GAMBIT_ALLOWANCE`: `on` (payments, the box) · `fake` (local: signed-in counted here at
`GAMBIT_SIGNED_PER_DAY`=5, dev uids starting `pass` have a Pass) · `off` (signed-in
unlimited). Payments unreachable or answering anything but 200/429 → the game goes ahead
(fail open, as Clued). A 429 at count time (raced elsewhere) is logged, the game goes on.
A spend still in flight counts as `pending` (reserved), and a payments refresh that
overlapped a spend is discarded, so a last game cannot be started twice.

Allowance object (in `welcome`, `allowance` events and replies):
```json
{"tier":"anon|free|supporter|pass|admin|off|unknown","perDay":2,"used":1,"remaining":1,
 "pending":0,"unlimited":false,"resetsAt":1793404800,"signedPerDay":5}
```
`perDay`/`remaining` are −1 when unlimited. `remaining` already subtracts `pending` (games
started but not yet counted). `signedPerDay` is for the "sign in for 5 a day" hint.

## Abuse bounds
Message ≤ 4 KB (bigger closes the socket) · 10 msg/s per socket, burst 30 · 60 websocket
opens/min and 12 concurrent sockets per IP · 800 sockets total · hello within 10 s · 1 seek,
2 open rooms, 1 timed + 10 Unlimited games per player · 20 room creates and 60 joins/seeks per
player per 10 min · 100 public rooms, 1000 rooms total · origins: `GAMBIT_ORIGINS` (websocket
Origin checked against the same list) · names cleaned + profanity-filtered (Clued's `names.go`).
`./gambit pause on|off` (run with `GAMBIT_DATA` set) refuses new games at once; `./gambit stats`.

## Protocol (v1)

Websocket: `wss://games.br8t.com/gms/3d/gambit/api/ws` (local `ws://<host>:8094/gms/3d/gambit/api/ws`).
JSON text frames. Client messages: `{t, id?, …}`. A message with `id` gets exactly one reply:
`{t:"ok", id, …}` or `{t:"error", id, code, error, …}` (`error` is human text). Everything
else is a server push (`t` = event name). Times are server epoch ms (`now` in welcome/pong).

### Client → server
| t | fields | reply data / effect |
|---|---|---|
| `hello` | `token`, `name?`, `v` | must be first, within 10 s → `welcome` (or error `bad_token` + close 4001) |
| `auth` | `token` | refresh the held token (same uid; a different uid closes 4001). net.js sends it every 45 min |
| `ping` | | `pong {now}` |
| `lobby` | `on` (default true) | `{lobby}`; while on, `lobby` pushes (≤ 1/s) |
| `seek` | `tc`, `rated` (default true) | `{seek:{tc,rated,at}}`; later `start` |
| `unseek` | | |
| `createRoom` | `tc`, `rated`, `public`, `name?`, `color` w\|b\|random (host's colour) | `{room}` |
| `closeRoom` | `code` | |
| `joinRoom` | `code` (case-insensitive) | `{game: id}`; both get `start` |
| `peekRoom` | `code` | `{room}` |
| `move` | `game`, `uci` (`e2e4`, `e7e8q`; `e1h1` castling accepted), `ply` (= moves so far) | `{san, lag}` (`lag` = ms credited, D24); both get `move`. Resend of an accepted move → `{dup:true}` |
| `resign` / `abort` | `game` | resign before ply 2 = abort; abort only before ply 2 |
| `draw` | `game`, `action` offer\|accept\|decline | one offer per side per move, only after ply 2; offering when the opponent already offered = accept; moving declines an offer to you |
| `claim` | `game`, `kind` win\|draw | timed games, opponent away ≥ 30 s |
| `rematch` | `game`, `action` offer\|accept\|decline | within 5 min of the end; both agree → new game, colours swapped, same tc/rated |
| `game` | `game` | `{game}` snapshot (resync) |
| `allowance` / `ratings` | | `{allowance}` / `{ratings}` |
| `leaderboard` | `cat`, `limit` | `{cat, rows}` |
| `rename` | `name` | `{name}` (future games) |

### Server → client
| t | fields |
|---|---|
| `welcome` | `you {pid,name,anon,admin,dev}`, `now`, `v`, `ratings {cat:{r,rd,prov,games}}`, `games [snapshot]` (live + finished < 5 min), `rooms [room]`, `seek`, `allowance`, `tcs [tc]`, `paused` |
| `lobby` | `lobby {rooms:[room], seeking:{tc:n}, playing, online}` |
| `start` | `game` snapshot (quick match, room join, rematch) |
| `move` | `game` (id), `ply`, `uci`, `san`, `fen`, `clock`, `drawOffer` |
| `end` | `game`, `result` 1-0\|0-1\|1/2-1/2\|* , `reason` checkmate\|stalemate\|repetition\|fifty\|material\|timeout\|resign\|agreement\|abandoned\|aborted, `pgn` ("" if aborted), `clock`, `ratings?` |
| `draw` / `rematch` | `game`, `by` w\|b, `action` offer\|decline |
| `opponent` | `game`, `status` gone\|back, `claimAt` (ms; 0 for Unlimited) |
| `allowance` | `allowance` |
| `seek` | `seek: null`, `reason?` (seek dropped: matched or no games left) |
| `roomClosed` | `code`, `reason` started\|closed\|host_left\|expired\|playing\|no_games_left |

**Game snapshot**: `{id, tc:{id,base,inc,name,cat}, rated, cat, white:{pid,name,rating,prov,anon},
black:{…}, you:"w"|"b", moves:[uci], sans:[san], fen, clock, status:"playing"|"ended",
drawOffer:""|"w"|"b", created, opponentGone?:{since,claimAt}, result?, reason?, ratings?,
rematch?:{you,them}, next?}`.
**clock**: `{at, turn, running, w, b, deadline, deadlineAborts}` — `w`/`b` ms left as of `at`
(server ms; null for Unlimited); the side to move's time runs if `running`. `deadline` = when
the side to move flags (or the game aborts if `deadlineAborts`: first moves / Unlimited first moves).
**ratings** (end): `{w:{before,after,delta,rd,prov}, b:{…}}` (`rd`/`prov` after the game; net.js
updates `net.ratings[cat]` from it, no `ratings` call needed).
**room**: `{code, public, name, tc, rated, color, created, host:{pid,name,rating,prov}}`.
**tc ids**: `1+0 2+1 3+0 3+2 5+0 5+3 10+0 10+5 15+10 30+0 unlimited`.

### Error codes
`bad_token` `bad_request` `rate_limited` `paused` `bad_tc` `no_games_left` (+`allowance`)
`ip_limit` `already_playing` `too_many_games` `too_many_rooms` `lobby_full` `no_room`
`own_room` `host_busy` `host_no_games` `opponent_busy` `no_game` `not_your_turn`
`stale_ply` (+`game` snapshot) `illegal_move` (+`game`) `game_over` (+`game`) `not_now`
`bad_name`. net.js adds `offline`, `timeout`, `no_token`.

### HTTP (CORS for `GAMBIT_ORIGINS`, GET only)
`/api/health` · `/api/status` (tcs, allowance mode, limits) · `/api/leaderboard?cat=&limit=`
→ `{cat, rows:[{rank,pid,name,rating,rd,games,wins,losses,draws}]}` · `/api/rooms` (lobby
view) · `/api/games/{id}` (finished game + PGN) · `/api/players/{pid}` (ratings + last 20 games).

## Deploy (later, with Aaron's OK)
1. **Payments env** (on the box, `/etc/br8t-payments/environment`): add `chess=5` to the
   existing `BR8T_FREE_PER_DAY` list, keeping every current entry — e.g.
   `BR8T_FREE_PER_DAY="ragdojo=3,clued=5,chess=5"`. No `BR8T_SUPPORTER_PER_DAY` entry
   (supporters get the free 5; Pass is unlimited), no top-up/promo entry. Then
   `sudo systemctl restart br8t-payments` and check `journalctl -u br8t-payments -n 5`.
   Without it payments answers 404 for `chess` and GAMBIT fails open (signed-in unlimited).
2. Check loopback 8019 is free: `ss -ltnp | grep 8019` (deploy.sh checks too).
3. `CONFIRM=yes server/deploy.sh` (builds on the box, installs `gambit.service`, health
   check with rollback, refuses if devAuth is on, adds the Caddy route via `caddy_route.py`
   — or merge `Caddyfile.fragment` by hand — and reloads Caddy, then checks public health,
   CORS and the websocket upgrade). `RUN_TESTS=1` runs `test.sh` on the box first.
4. Static client: the manager's normal static deploy (or `STATIC=1`). net.js picks
   `/gms/3d/gambit/api/` on games.br8t.com and `https://games.br8t.com/…` from GitHub Pages.
5. Verify with two real browsers: anonymous quick match (2/day), a signed-in account
   (5/day, `GET /api/br8t/allowance?game=chess` shows `usedToday` going up once per game),
   a Pass account (unlimited). Backups: SQLite `.backup` of `/srv/data/gambit/gambit.db`.
