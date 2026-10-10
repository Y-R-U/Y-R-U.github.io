# MYROOMS — clearing online rooms you created and left (2026-10-10)

Aaron: "I need to be able to clear online games I have created and left."

## What changed

### Online hub: "Your rooms" (`js/net/join.js`, `util.js`, `api.js`, `net.css`)
- Server-room seats are now also kept on the device: localStorage `clued.myrooms` = `{ CODE: { key, id, via:'server', host?, at } }`
  (newest 20). `saveSeat` writes it (host.js passes `host: true` on create); `loadSeat` falls back to it when the tab
  has no sessionStorage seat, so **Rejoin** works from a new tab. `dropSeat(code, forget)` / `forgetRoom(...codes)`.
  Device (p2p) rooms are never stored: they can't outlive their tab.
- The hub shows **Your rooms** above "Host a game" (hidden when empty), fetched live with `POST /rooms/mine` on open
  and every 10 s while visible. Each card: code, title, phase chip (In the lobby / Playing · Q3/10 / Finished), role
  ("👑 You host", "You left · 👑 Ann hosts", "You left · nobody in it", "You made it · 👑 Ann hosts"), players (online),
  public/private, age. Rooms the server reports gone (expired, ended, key unknown, kicked), and rooms a non-creator
  left, are forgotten silently.
- Actions: **Rejoin** (→ join screen → silent key rejoin). Creator or current host: **End room**, inline two-tap
  confirm (first tap arms "End for everyone?" in red for 4 s, second tap ends; no popup). Plain player: **Leave**
  (`POST leave`, forgets the seat).

### Leaving a room (`js/net/room.js`)
- The leave confirm popup is replaced by an inline docked bar (`.net-leavebar`, no scrim, game keeps running under
  it), used by the 🚪 button, the runner's ✕ and browser back (the screen guard):
  - server host with others: **"Leave (room keeps going, someone else becomes host)"** / **"End room for everyone"** / Stay.
    Leaving keeps the room under Your rooms (to rejoin or end later).
  - server host alone: "Leave (room stays open for now)" (empty rooms close after 20 min) / "End room" / Stay.
  - device (p2p) host: "This device runs the room, so leaving ends it for everyone." + **"End room for everyone"** / Stay.
  - player: "Leave" / Stay; leaving forgets the seat.
- Final podium: the host gets **Play again** + **Done**. Done ends the finished room (`end` for server rooms,
  `leave` = close for device rooms) and goes home; players keep the podium with **"The host ended the room."** and a
  Done button. A room ended in its lobby shows a "The host ended the room" panel instead of an empty podium.
  Device-room joiners now read "The host ended the room." too (was "closed").
- Seeing `ended`/`closed` drops the seat everywhere; the "room has ended" screen text no longer says "6 hours".

### Server (`server/`, deployed 2026-10-10)
- **`POST /rooms/{code}/end {hostKey|key}`** (the existing action, redefined — no shipped client called it): ends the
  room for everyone. Phase → `final` (if not already), `ended: true` in state/peek. Final rooms aren't counted by the
  public or private caps and aren't listed, so the slot frees at once (public list cache reset). Allowed for the
  current host **or the creator** (`Room.Owner`, set at create; `you.owner` in state) even after they left or handed
  host over; a plain player gets 403 `not_host`. After `end`: new joins 410 `room_ended`, other host actions 409
  `room_ended`, a key rejoin still works (shows the podium), ending twice is harmless. An ended room stays while
  someone is still connected and goes 2 min after the last one (30 min hard cap).
- **`POST /rooms/{code}/leave`** accepts `{ key }` or `{ playerKey }` (unchanged behaviour: player gone, host hands over).
- **`POST /rooms/mine { rooms: [{ code, key }] }`** (≤ 30) → `{ now, rooms: [{ code, title, phase, q, total, players,
  online, host, public, created, touched, isHost, owner, left }], gone: [codes] }`. Read-only: it never marks anyone
  online (so it can't keep a ghost room alive or block host handover). Rate bucket "answer".
- **Abandoned rooms:** a room with nobody connected (no SSE stream and no poll within 30 s) expires 20 min after
  the last one went (`emptyRoomMs`); public lobbies keep their 10 min, ended rooms 2 min. The 6 h idle cap stays the
  hard limit for rooms with people in them. A rejoin (refresh) inside the window resets the clock. `EmptyAt` is
  persisted (marked dirty), and `loadRooms` only grants the 30 s reconnect grace to rooms that weren't already empty,
  so a deploy doesn't restart an abandoned room's clock.
- **Admin:** `POST /admin/close-finished` closes every final/ended room and every room with nobody online
  (`{ closed, codes }`); per-room Close kept (both share `closeRoom`). The overview's rooms carry `ended`. Admin page:
  "Close all finished/abandoned (N)" button on the Live rooms panel (shown when N > 0), phase column shows "ended".

## Tests
- Go: new `server/myrooms_test.go` — `TestEndRoom` (non-host 403, creator ends after leaving + handover, a creator
  who left can't run Next, ended state/peek, no new joins/again, idempotent, lingers while watched then goes),
  `TestEndFreesCaps` (public count/list and private cap free at once), `TestPlayerLeaveAndMine` (`playerKey` leave,
  mine rows + gone list, mine doesn't bump `ver`), `TestAbandonedRoomExpiry` (in-game room with nobody connected kept
  at 15 min, rejoin inside the window resets, expires at 20 min, a polled room survives, restored empty room keeps its
  clock), `TestAdminCloseFinished`. `TestExpiryAndPersistence` now keeps a connection open so it still tests the 6 h
  cap (it passed by accident otherwise). Falsified: letting anyone end fails `TestEndRoom` ("a non-host must not end
  the room: 200"); a 100× empty limit fails `TestAbandonedRoomExpiry`/`TestAdminCloseFinished`; an `end` that only
  flags the room fails `TestEndFreesCaps`. `server/test.sh` ALL PASS.
- `node tools/s_unit_test.mjs` ALL PASS, `node tools/p2p_test.mjs` 141/0.
- E2E `node tools/s_room_e2e.mjs --myrooms` (CDP 9521–9523, metal, cache disabled, 384×854): **25/0** — host creates
  a public room (Ann joins) and a private one through the host screen; leave bar wording, Stay, no popup; leaves both;
  Your rooms lists both with the right role/phase/players/age; two-tap End on the public one → Ann's screen "The host
  ended the room", `/status` publicFree 4 → 5, gone from `/rooms/public`, forgotten locally; Rejoin the private one as
  host; Bob joins, leaves from his Your rooms (host sees him go); Bob rejoins, game skipped to the podium, host Done →
  Bob keeps the podium with "The host ended the room", server peek `ended`, host's Your rooms empty again.
- Regular `s_room_e2e` 58/0 (its podium skip used `end` as "finish the game": now it steps through with Next).
  `p2p_e2e` 42/0 (wording now "The host ended the room"; new check: the device host's bar offers only "End room for
  everyone" with "leaving ends it for everyone"). One earlier p2p run had 2 early-reveal timing failures after the
  host refresh (unrelated; passed on the next two runs).
- Screenshots looked at (384×854): leave bar (with others / alone / device host), Your rooms list, armed End, Ann's
  ended panel, host final with Play again + Done, Bob's ended podium.

## Deploy / state
- Server deployed with `server/deploy.sh`: healthy, `/api/health` rooms 8 before and after (all 8 existing rooms
  restored), `/api/status` still `debugLogs: true` (flag untouched), live probes: `/rooms/mine` → gone list,
  peek has `ended`, `end` with a bad key → 403 `bad_key`, `/admin/close-finished` → 401 without a token.
  Under the new rule, rooms with nobody connected (those 8 were all `final`) expire about 20 min after the restart.
- **Client not shipped, BUILD not bumped** (manager). Until then live clients don't show Your rooms / the leave bar;
  the server change is backwards compatible (old clients never call `end`, ignore `ended`/`owner`).
- Not touched: js/audio/*, js/core/debuglog.js, debuglog server code, the debug flag, git, BUILD.
- One `s_room_e2e --myrooms` run (the first) failed its first room create with "Can't reach the Clued server" against
  the local server; it did not reproduce in the next four runs (machine load; other sessions were editing files).
