# online agent notes

Owner of `js/app/screens/online.js`, `online_game.js`, `online_common.js`, `css/online.css`,
`tools/online_cdp.mjs`. Protocol/client: `server/README.md`, `js/app/net.js` (server agent).

## Done (2026-10-31)
- **Route**: one line in `main.js` `PLUGINS` (`online: () => import('./screens/online.js')`) replaces
  the placeholder. Sub-routes: `#/online` (home), `#/online/seek/<tc>`, `#/online/room/<code>`,
  `#/online/join/<code>` (the share link), `#/online/game/<id>`. `css/online.css` is injected on
  first use by `online_common.js` (index.html untouched).
- **Home**: me card (name + rename, online rating per category with `?` while provisional, games
  count), allowance chip (pips, "N of M left today", reset time; guest: "Sign in for 5 a day" opens
  the **account layer's own panel** (clicks its fab); out: Pass button), "online game in progress"
  cards (resume), the D10/D11 cheating warning, tabs **Play** (rated/casual, quick-match chips by
  time control with live "people waiting" badges, Play a friend + code box, online/playing counts),
  **Lobby** (live public rooms, Join, Create room sheet: tc, rated/casual, public/private, colour),
  **Leaderboard** (per category; explains only signed-in non-provisional players are listed; the
  warning again).
- **Waiting**: quick-match radar screen (elapsed, others waiting, Cancel = unseek), my-room screen
  (big code, Copy code, link + Copy link, Web Share on touch devices, Close room; leaving closes
  it), join preview (host, rating, tc, colour, Join; closed/wrong code message). On pairing every
  waiting screen shows an "Opponent found" card (both names + ratings, your colour) for 1.4 s, then
  opens the board.
- **Game** (`online_game.js`): same layout/classes as the bot game; its own persistent board
  instance (disposed when you leave online games). Optimistic local move → `net.move`; a refusal
  resyncs from the server snapshot and rolls the board back (toast). Opponent moves animate; clocks
  from `net.clock()` every 100 ms (Unlimited shows days/hours left to move, opponent ∞). Battles
  online use their own setting `onlineBattleSpeed` (default 2×, D6) and in timed games are cut at
  1.2 s via `board.skip()` on `battlestart` (D24). Banners over the board: draw offer
  (Accept/Decline), opponent away with a claim countdown → Claim win / Draw, first-move abort
  timer, reconnecting. Actions: Abort (before ply 2) / Resign, Draw (Offered / Accept draw), Flip,
  View, battle speed. No undo/hint. Results sheet: outcome, reason, rating after/before/delta (+ `?`
  provisional), Rematch / Accept rematch / sent / declined, New game (same tc quick match). Resume
  after reload / reconnect from the welcome. Wake lock while on the game. Settings button opens the
  settings sheet in place (`app.openSettingsHere` hook in main.js) instead of leaving the game.
- **bfcache**: a page parked in the back/forward cache kept its websocket open in Chrome (server
  never saw it leave), so `pagehide(persisted)` closes the connection and `pageshow` reconnects.

## How to test
```
tools/server_run.sh --bg
~/.claude/bin/cdp start --port 9514 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
~/.claude/bin/cdp start --port 9515 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/online_cdp.mjs all [--w=1440 --h=900] [--out=DIR]   # ~3 min, exits 1 on any failure/console error
```
Two real browsers: quick match (seeking badge, found card) → refused optimistic move rolls back →
Fool's mate; private room code + link → join preview → draw offer/accept → rematch (colours swap)
→ resign; public room in the live lobby + leaderboard; abort before the first moves; an Unlimited
game; disconnect (tab closed) → banner + countdown → reload resumes at the same ply → leave again →
claim win after 30 s; a guest (2/day) plays two games → chip 0 of 2 → out-of-games sheet, and the
server refuses `createRoom` with `no_games_left`. Last run: ALL PASS at 360×740 and 1440×900, zero
console errors. `node tools/ui_cdp.mjs shots` still passes. Dev identities per run: A = Pass,
B = signed-in, G = guest (`?devuid=…&devsigned=1`).

## Requests
- **server (net.js)**: a move sent while reconnecting is queued, but `request()`'s 10 s timeout
  still rejects it and drops it from `_pending`, so after a >10 s outage the move is never resent
  (the screen then resyncs and rolls it back — safe, just annoying). Keeping queued moves until the
  next welcome would fix it. Also `end` updates `ratings[cat].r` but not `prov`; the screen calls
  `net.myRatings()` after each game.
- **ui / manager**: the main Home could show "Online game in progress" (it needs a `net.connect()`
  at boot; the Online home already lists them). Not done to avoid connecting for every visitor.
- **payments (deploy)**: the Pass button posts `/api/br8t/checkout` with `game:"gambit"` and falls
  back to `"hub"` on 400; add a `gambit` return page to payments if wanted. It only runs on
  games.br8t.com (no payments API on Pages / LAN).

## Open issues
- The online board is a second WebGL context while a bot-game board is still alive (game.js keeps
  its board for the session). Fine on desktop and mid phones; sharing one board would need game.js
  to hand its host over.
- Leaderboard is empty locally (needs signed-in, non-provisional players).
- No spectating, chat or premoves (deliberate / later).
