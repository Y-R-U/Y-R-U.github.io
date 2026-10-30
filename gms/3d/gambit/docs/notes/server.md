# server — notes

Owner: server agent. Files: `server/` (Go service), `js/app/net.js`, `tools/server_*`.
Protocol + deploy steps: `server/README.md` (the source of truth; keep this file short).

## Done (2026-10-31)
- Go service (`server/`): websocket lobby + relay, quick match by time control (D8 list incl.
  Unlimited), public waiting rooms (name, tc, rated, host colour), private 5-letter codes,
  rematch (colours swap), resign / draw offers / abort before ply 2, disconnect grace + claim
  after 30 s, reconnect resume via `welcome`, live games persisted (restart-safe, downtime
  credited to timed clocks).
- Server-authoritative clocks; server-side legality with our own Go rules (`chess.go`, perft
  = standard suite). Finished games (PGN) + ratings in SQLite.
- Glicko-2 ratings per category (bullet/blitz/rapid/classical/daily), provisional = RD > 110,
  leaderboard (signed-in + non-provisional only), player profile endpoint.
- Identity: Firebase ID tokens incl. anonymous (Clued's verifier, anon allowed); dev tokens
  only with `GAMBIT_DEV_AUTH`. Allowance per D12 (anon 2/day here, signed-in 5/day via payments
  `chess`, Pass unlimited); a game counts at ply 2.
- `js/app/net.js` client; `tools/server_run.sh`; `tools/server_net_test.mjs`;
  `server/test.sh`, `deploy.sh` (guarded by `CONFIRM=yes`), `Caddyfile.fragment`,
  `caddy_route.py`, `gambit.service`. Nothing deployed.

## How to test
```sh
tools/server_run.sh --bg            # :8094, dev auth, fake allowance; --stop to stop
node tools/server_net_test.mjs      # net.js end to end: 24 checks, ALL PASS
server/test.sh                      # gofmt, vet, 21 Go tests (perft, clocks, Glicko, allowance, integration), binary smoke
```
Go tests: `cd server && go test -race ./...` (all pass, race-clean). The integration tests run
two (or three) websocket clients through full games: quick match → Fool's mate, private room →
draw → rematch, disconnect → resume → claim, flag by tick, first-move abort, anon 2/day + next
day + IP cap, signed-in tier against a fake payments server (spend body/UUID, 429, Pass), restart
restore, abuse (bad token, oversize message, foreign Origin, room caps).
Browser check: from `http://192.168.0.236:8888/gms/3d/gambit/` in headless Chrome, `net.connect()`
got a **real Firebase anonymous token** verified against Google's certs (`dev:false`), no console errors.

## How the ui should use net.js
```js
import { net, CHEAT_WARNING, FRIENDS_TIP } from './net.js';
await net.connect({ name: settings.displayName });   // once, when the Online screen opens
```
- **Always show `CHEAT_WARNING`** on the Online lobby and next to the online rating /
  leaderboard (D10/D11) — the exact text:
  > The server does not try to detect cheating yet — if you think an opponent cheated, try not to stress about it.

  and suggest friends (`FRIENDS_TIP`: "Online is most fun with people you know: make a private
  room and send them the code.").
- **Connection state**: `net.state` + `net.on('state', s => …)` (`connecting`, `open`,
  `reconnecting`, `closed`). Show a small "Reconnecting…" banner; moves made while
  reconnecting are queued and resent (they carry the ply, so it is safe).
- **Who am I / limits**: `net.me` (`name`, `anon`), `net.ratings[cat]` (`r`, `prov` → show
  "1500?" while provisional), `net.allowance` + `net.on('allowance')`. Show "`remaining` of
  `perDay` online games left today" unless `unlimited`; for `tier === 'anon'` add "Sign in for
  `signedPerDay` a day" (open the account panel); tier `pass` = "Unlimited (BR8T Pass)". On
  error code `no_games_left` show the same, plus "resets at" `new Date(resetsAt*1000)`.
  `ip_limit` → ask them to sign in. Bots and puzzles are always unlimited.
- **Lobby**: `await net.subscribeLobby()` then `net.on('lobby', l => …)` → `l.rooms` (public
  rooms: `name`, `tc.name/id`, `rated`, `host.name`, `host.rating`, `host.prov`, `color`),
  `l.seeking[tcId]` (people waiting per time control — nice for the quick-match buttons),
  `l.online`, `l.playing`. `subscribeLobby(false)` when leaving the screen.
- **Quick match**: `net.quickMatch(tcId, {rated})` → spinner "Finding an opponent…";
  `net.cancelQuickMatch()`. Pairing arrives as `net.on('start', ({game}) => …)`.
  `net.on('seek', ({seek, reason}))` with `seek === null` + `reason` means it was dropped.
- **Rooms**: `net.createRoom({tc, rated, public, name, color})` → `room.code` (show big,
  copyable, "send this to a friend"); `net.joinRoom(code)` (case-insensitive) → `start`.
  `net.closeRoom(code)`; `net.on('roomClosed')`. Time-control ids are `net.tcs[].id`
  (`1+0 … 30+0, unlimited`); show `tc.name` (Bullet/Blitz/Rapid/Classical/Unlimited).
- **In game**: the `game` snapshot has `you` ('w'|'b'), `white/black` {name, rating, prov},
  `moves` (uci), `sans`, `fen`, `status`. Orientation = `you`.
  - Your move: ask core first (legal client-side), animate, then `await net.move(id, uci)`.
    If it rejects (`illegal_move`, `not_your_turn`, `stale_ply`, `game_over`) the game has
    already been resynced from the server: `net.on('sync', ({game}) => board.setPosition(game.fen))`.
  - Opponent's move: `net.on('move', ({gameId, uci, san, fen, clock, mine}))` — the server
    echoes every move to both sides; skip animating when `mine` is true (just take `clock`).
  - Clocks: every frame `net.clock(id)` → `{w, b, turn, running, deadline, deadlineAborts}`
    in ms, already extrapolated. Before both first moves `running` is false and `deadline`
    is the 30 s first-move timer (`deadlineAborts`: "Make a move or the game is aborted").
    Unlimited: `w/b` are null; show "Move by <deadline date>" (3 days per move).
  - Buttons: `net.resign(id)` (before both moved it aborts), `net.abort(id)` (only before
    ply 2), `net.offerDraw / acceptDraw / declineDraw(id)` + `net.on('draw', {by, action, mine})`
    (show "Opponent offers a draw" with Accept/Decline; moving also declines),
    `net.on('opponent', {status:'gone'|'back', claimAt})` → after `claimAt` offer
    `net.claim(id, 'win'|'draw')`.
  - End: `net.on('end', {result, reason, ratings, pgn})` — `ratings[you].delta` for "+8".
    Then `net.offerRematch(id)` / `acceptRematch` / `declineRematch`, `net.on('rematch')`;
    the new game arrives as `start`.
- **Resume**: on (re)connect `net.on('resume', ({games}))` lists live games — if the player is
  not on the game screen, offer "You have a game in progress". Unlimited games can be many:
  list them on the Online screen (`[...net.games.values()].filter(g => g.status === 'playing')`).
- **Leaderboard**: `net.leaderboard(cat, 50)` (HTTP, works without connecting) →
  `rows[{rank, name, rating, games, wins, losses, draws}]`. Categories: bullet, blitz, rapid,
  classical, daily. Only signed-in, non-provisional players are listed — say so.
- **Battle speed** (D6): online games should default battles to 2× and the board should let
  the clock-runner skip. The server cannot pause your clock for an animation (see open issues).
- **Local testing**: run `tools/server_run.sh`; net.js finds `http://<host>:8094` on
  localhost/LAN automatically (`?server=<base>` overrides). Two tabs = two players (per-tab
  dev uid when no Firebase token; or `?devuid=alice&devname=Alice`, add `&devsigned=1` for
  the signed-in tier, `devuid=pass…` for a Pass).

## Requests
- **/lib/auth/ owner (manager)**: `auth.getIdToken()` returns null for anonymous users, but
  D12 needs their token too. net.js works around it by reading the same Firebase Auth instance
  (`getAuth(getApp()).currentUser.getIdToken()` from the SDK URL in `config.js`). Cleaner: add
  `auth.getIdTokenAnyUser(force)` to `/lib/auth/auth.js` — net.js already uses it when present.
- **Manager / Aaron**: decide lag/animation compensation for timed online games (below).
- **Deploy (Aaron's OK)**: payments env `BR8T_FREE_PER_DAY` += `chess=5`; steps in
  `server/README.md` "Deploy".

## Open issues / later
- No lag compensation: network latency and the receiving player's battle animation run on
  their clock. Options: lichess-style per-move lag credit (client reports its own think time,
  server credits up to ~300 ms + a lag quota), or a fixed per-move grace. Not done yet.
- No spectating, no takebacks, no chat (deliberate: less moderation).
- Rating is anonymous-playable; an abuser could farm rated games with throwaway anon uids
  (2/day each, 30/day per IP). Leaderboard excludes anon, so it only affects their own number.
- Allowance gate for signed-in users reads payments at seek/create/join time; a player with 1
  game left could still start two at once from two rooms in the same second (both count; the
  second 429s and goes ahead). Accepted (fail open).
- `stopped_at` heartbeat every 15 s: after a crash (not a clean stop) up to 15 s of downtime is
  charged to the side to move.
