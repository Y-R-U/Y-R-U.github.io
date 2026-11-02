# online — notes (M6 "Online", PLAN 2.9)

Owner: `online` agent. Status: **built and tested locally** (server on :8098, two-browser run).
**Not deployed** — the VPS, Caddy and payments were not touched. Deploy steps at the end.

## What works
- **Server** (`server/`, Go + SQLite, modelled on GAMBIT): websocket lobby, private rooms with a
  6-char invite code + share link (`?room=CODE`), public room list (live), quick play (joins the
  fullest open quick room or opens one; starts 20 s after creation / ≥ 6 s after the last join, at
  once when full; empty seats fill with ghost AIs), room options, start, shot relay, server-side
  stroke counting, scoreboard between holes, results (stored in SQLite), play again.
- **Room options**: name, invite-only / public, course + hole set (runs of 3, random 3, 9, 18 —
  generic over `COURSES`, so story2's back nine shows up), theme (Sky / Spooky / Frost), max players
  2–8, helpers mode (**off** / **everyone starts with N of each** / **own inventory**), shot clock
  (off/20/30/45/60 s), ghost AIs (count incl. "Fill", personality or Mixed, rank Nobody → Legend;
  skill capped at 0.9 server-side, D14).
- **Play**: everyone plays the same hole at once. Each shot is relayed the moment it's taken (velocity,
  obstacle-clock `t0`, helpers armed, exact ball state) and every other client **replays it with the
  same physics** as a translucent ghost ball with a name tag; the reported result wins (ghost snaps
  to it). The obstacle clock is **shared** (`world.time = serverNow − holeAt` while not rolling), so
  windmills/movers line up across clients. Replays are **bit-exact**: 108/108 test shots over all 18
  holes, including helpers (magnet, steady, sticky, guard, ghost) — `tools/online_test.mjs`.
- **AI seats**: driven by the **host's client** with js/ai (`aiClient().shot` in the worker,
  personality + skill noise), relayed like a player's shot. Chosen over server-side AI because the
  server has no physics and js/ai already runs deterministic planning in a worker.
- **Disconnects / rejoin**: reload or drop → the welcome brings the room back, your ball where the
  server has it (pos, strokes, shot number); the title shows "Rejoin room CODE" (local hint). Offline
  30 s mid-round → an **AI stand-in** plays your ball until you return. **Host leaves** → the
  longest-seated connected human becomes host (banner "You are the host now") and takes over the
  AI seats; in-flight AI shots of the old host are voided (no stroke). Leaving mid-round = an AI
  finishes your round. Rooms close when nobody's connected (60 s lobby / 180 s mid-round).
- **Shot clock**: client-side; when it runs out the ball is putted at zero power (= +1 stroke). The
  server also caps each hole's time (unfinished seats are picked up at par + 4).
- **No cheat detection** (D11): the warning is on the Online home, the room lobby and the results.
- **Menus**: title button "Online" (under Career) → Online home (name, Quick play, Create a room,
  join by code, open rooms) → create form / room lobby (code, Share link / Copy code, players + AI
  seats + open seats, options summary, host "Room options" editor, Start, Leave). In game: players
  strip (colour, name, strokes, ✓ done, AI / away / AI stand-in / host tags), shot-clock ring, a
  "Birdie! · +N ladder pts · waiting for …" pill after you hole out, the scoreboard card between
  holes (Next with countdown), the results card (places, per-hole table, Play again / Leave). The
  in-game menu has no Restart and doesn't pause play. Portrait and landscape (D13).
- Online holes give ladder points + star coins through `app.meta.onHole` (D12: more play → higher)
  and crystal coins once per pickup as usual; they don't change course bests / unlocks.

## Files
New:
```
server/{main,hub,room,opts,session,db,firebase,limits,names}.go  server/{integration,unit}_test.go
server/{go.mod,go.sum,.gitignore,README.md,test.sh,deploy.sh,caddy_route.py,Caddyfile.fragment,skyputt.service}
js/net/net.js       websocket client (GAMBIT's net.js shape): reconnect, resend shots/results, welcome resume
js/net/rooms.js     pure: hole sets, default/quick opts, rank↔skill, helper inventories per mode, share link
js/net/replay.js    pure: replay a relayed shot with the physics → ghost record
js/net/round.js     OnlineRound extends Round: relay my shots/results, ghosts, shared clock, shot clock
js/net/driver.js    host-side AI driver for AI seats (and AI stand-ins)
js/net/game.js      OnlineGame: wiring, strip / clock / waiting pill, scoreboard, results, leave
js/net/form.js      room options form
js/net/index.js     createOnline(): Online home, create, lobby, hand-off to OnlineGame
css/online.css
tools/server_run.sh tools/online_test.mjs tools/online_cdp.mjs
docs/notes/online.md
```
Small additive edits to shared files:
- `index.html`: `#t-online` button after Career, `#online` container, `css/online.css` link.
- `js/app/main.js`: import + `createOnline({ hooks: { enter, leave, setRound } })`, `#t-online`
  handler + tile text, `?room=CODE` invite link, `online` on `window.__skyputt`.
- `js/game/play.js`: `inventory` option (`this.inv`, defaults to the store) used by the helper code.
- `js/game/hud.js`: `pause()` takes optional `onRestart` (null hides it), `title`, `note`, `quitLabel`.

## How to run / test
```
tools/server_run.sh --bg              # :8098, dev auth, data in server/.run/ (FRESH=1 wipes it; --stop)
open http://192.168.0.236:8888/gms/3d/skyputt/ → Online   (two tabs = two players; or ?devuid=alice&devname=Alice)
server/test.sh                         # gofmt, vet, 23 Go tests (rooms, codes, relay, scoring, AI fill,
                                       # helper modes, rejoin, reload mid-shot, takeover, host migration, quick play, caps), binary smoke
node tools/online_test.mjs             # rooms.js, replay determinism on every hole, net.js vs the running server
~/.claude/bin/cdp start --port 9512 && ~/.claude/bin/cdp start --port 9513
node tools/online_cdp.mjs --out=DIR    # two browsers (412x915 phone + 1440x900 desktop): create via the UI,
                                       # join by code, play 3 holes with 2 ghost AIs, Next, reload+rejoin, results, play again
```
net.js picks the server: `?server=<base>` > LAN/localhost → `http://<host>:8098/gms/3d/skyputt` >
(only when `ONLINE_PUBLIC`) games.br8t.com. On Pages today the Online screen says "Coming soon".
Debug: `__skyputt.online` (`net`, `game`, `view`), `__skyputt.online.game.room`.

## Test results (2026-11-02)
- `server/test.sh`: ALL PASS (23 Go tests + binary health/CORS/websocket/origin/data-dir checks).
- `node tools/online_test.mjs`: 28/28 (replay 108/108 bit-exact over 18 holes; net.js create/join/
  start/relay/oob/mulligan/AI-seat permission/scoreboard/next/reconnect-rejoin against :8098).
- Existing suites still pass: physics 25/25, store, story, events, meta, holes_test (exit 0, 18 holes).
- `node tools/online_cdp.mjs`: **ALL PASS, no console errors**. Alice (412x915 touch) creates a room
  through the UI, Bob (1440x900) joins by typing the code; 3 holes with 2 ghost AIs (Alice's client
  runs them); both bots putt through `Round.shoot` (relayed), ghosts replay with name tags; Next on
  each scoreboard; Bob reloads mid-hole 2 and rejoins (his orphaned shot voided, ball back, strip/
  clock right); both see identical totals on the results; Play again → both back in the lobby; Bob
  leaves; Alice's Quick play starts on its timer with 3 ghost AIs; landscape-phone title + Online home.
  Screenshots were written to the scratchpad (not kept in the repo).
- Found + fixed by the browser run: `this.ghosts` clashed with Round's story-ghost field (renamed
  `peers`); the AI driver stuck after a server-voided shot; a reload mid-shot waited 45 s (now voided
  at once on reconnect, Go test added); tied places say "joint"; names in the results table.

## Known issues / notes
- **Client-reported results** (D11). The server checks shape, shot order, helper counts (off/fixed
  modes) and counts strokes from the outcome, but a modified client can still report a cup.
  A later step could re-simulate shots server-side (needs the physics in Go or a node sidecar).
- Ghost replays are exact, but a ghost is shown starting when its shot *arrives* (≈ one latency late),
  so on windmill holes its path can look a few cm off the blades' visible pose for that moment.
- Steady Hands slows *your* obstacle clock while armed and rolling (as offline); other clients replay
  your shot correctly (they use your `t0` + clock) but see the windmill at normal speed.
- The AI driver plans on the host's phone (worker, `budgetScale 0.6`); with 6–7 AIs on a slow phone the
  AIs putt a little slower than humans. The hole cap guarantees progress.
- Live rooms are in memory: a server restart ends them (clients see "the room closed").
- One room per user; joining another room leaves the first.
- Quick-play rooms ignore a later joiner's options (the first player's options win).
- Headless Chrome on a loaded box ran at 1–3 fps; ghost playback and the AI driver are frame-bound, so
  there the AIs often hit the hole time cap (picked up at par + 4). On real phones (30–60 fps) not an issue.
- The landscape-phone title card (844x390) is taller than the screen now that it has Career, Online,
  Events, Ladder/Shop and Play/Map rows: `css/online.css` makes `#title` scroll there (`align-items:
  safe center`) and hides the Online tile's subtitle. A proper two-column landscape title is a UI task.
- Two Chrome tabs in one headless browser: only one window gets frames, so `online_cdp.mjs` uses two
  browsers (ports 9512 + 9513).

## Proposals for DECISIONS
- P1 **Online is free** for now: no allowance gate / br8t-payments (GAMBIT's allowance code was not
  copied). Revisit if the box load or abuse needs it.
- P2 **AI seats are run by the host's client** (js/ai worker) and relayed like players; host migration
  hands them to the next human. Server stays physics-free.
- P3 **Shared obstacle clock per hole** from the server's `holeAt`; everyone plays the hole at once,
  no turns; hole ends when all seats are done or the time cap passes.
- P4 Disconnect rules: AI stand-in after 30 s offline mid-round; host migration after 10 s; leaving
  mid-round can't be undone; rooms close 60 s (lobby) / 180 s (round) after the last human drops.
- P5 Online rounds award ladder points + star coins like any hole, but don't touch course bests.
- P6 Box port **8023** for skyputt (8019 gambit) — check it's free before deploying.

## Deploy steps (only with Aaron's OK)
1. On the box: `ss -ltnp | grep 8023` must be empty (else change the port in deploy.sh,
   skyputt.service, Caddyfile.fragment, caddy_route.py).
2. Set `ONLINE_PUBLIC = true` in `js/net/net.js`; commit + push with the rest of M6.
3. From this repo: `CONFIRM=yes gms/3d/skyputt/server/deploy.sh` (optionally `RUN_TESTS=1`,
   `STATIC=1` to rsync the client to games.br8t.com). It builds on the box, installs
   `skyputt.service` (127.0.0.1:8023, data /srv/data/skyputt 0700), health-checks with rollback,
   refuses if devAuth is on, adds the Caddy route (`handle /gms/3d/skyputt/api/*`) via
   `caddy_route.py` and reloads Caddy, then checks public health / CORS / websocket upgrade.
4. No payments env change (free).
5. Check with two real phones: create + share link + join, quick play, reload mid-round, host leaves.
