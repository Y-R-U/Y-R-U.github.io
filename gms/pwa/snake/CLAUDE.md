# Snake-eee — working notes

Arena snake PWA, plain `<script>` globals, no build step. Live at
games.br8t.com/gms/pwa/snake/. Read `MULTIPLAYER.md` before touching
`js/net.js`, `js/netgame.js`, `js/rooms.js` or `server/`.

Do not "fix": the sub-linear body curve, mass conservation (never clamp a
pellet's value up), the AI skill tiers (tier 0's flaws are deliberate).

## Deploy
`server/deploy.sh` (room server, health-checked with rollback) and
`STATIC=1 server/deploy.sh` for the client too. Commit first. The client
rsync excludes `server/`, `tools/`, `*.md`. Bump `CACHE_NAME` in `sw.js`
when the asset list changes; `mpgate` checks `ASSETS` against index.html.

## Tests
- `cd server && go test ./...`
- `node gms/pwa/snake/tools/mpgate.mjs` (from the repo root; 52 checks)
- `node gms/pwa/snake/tools/perfbench.mjs [baselineRoot] [root]`
- Hooks: `?test` skips the account layer; `?net=ws://…` picks a room server;
  `?p2p=0` forces relay; `game.net._dropSocket()` kills the socket without a
  goodbye (reconnect path); `window.__netlog` records handoffs and reconnects.

## 2026-10-11 hub review changes
- `sw.js` v10: network-first with a 3 s timeout (lie-fi no longer hangs
  boot), `cache:'no-cache'` fetches, query URLs (share links, `?test`) served
  from and stored under the plain path, old query entries purged on activate.
- Death/win screens scroll (`safe center`) and go to one row of stat tiles
  under 500px tall; no backdrop blur while in a room.
- Centre HUD (mass, goal bar, kills) drops below `--br8t-account-space` on
  screens under 600px wide, like the leaderboard.
- Audio: unlock on pointerdown/touchend/click/keydown for the page's life,
  `audioSession.type='playback'`, suspend when hidden.
- Silent room reconnect (see MULTIPLAYER.md); `#reconnect-pill`.
- Grid doubles its spacing below 24px on screen. Note the furthest level zoom
  (0.34) gives 27px, so in today's game it never triggers.
- Menu/dead/won no longer clear the canvas every frame.
- Floating joystick: the base follows the finger past the rim (reverse after
  a long drag now takes one stick radius, ~65px, instead of the whole drag).
- Death screen names the killer ("Eaten by X, your regular" for regulars,
  "You hit the edge of the arena"); `#rival-toast` for killing a regular or a
  regular overtaking you (8 s between toasts, 30 s per regular; kills always show).

## Safe spawns (2026-10-11)
`Snake.placeSafely(snakes)` (snake.js) runs for every bot, room player and
remote player before it joins. The new body stays `SPAWN_HUMAN_AHEAD` (650px)
clear of a human's head in its forward cone, `SPAWN_HUMAN_SIDE` elsewhere,
`SPAWN_BOT_GAP` from bot heads; the new head stays clear of every body and
faces away from the nearest human. Up to `SPAWN_TRIES` samples, else the
roomiest. Before: ~3% of spawns landed in reach of the player's head.
