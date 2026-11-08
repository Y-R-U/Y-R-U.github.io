# protogate — protocol version gate (2026-11-09)

Owner: `protogate` agent. Status: done locally, **not committed / not deployed** (server change →
games.br8t.com needs a redeploy, and the client must ship in the same deploy).

## Why
Ball hits (notes/ballhit.md) added room opt `collide`, shot `balls` and result `knocks`, but server and
client both stayed on protocol 1 and nothing checked `v`. A cached pre-ballhit page could join a
Battle room, ignore knocks and replay shots as pass-through, so its view disagreed with everyone else's.

## What changed
- **Protocol 2** on both sides: `server/main.go` `protocolVersion = 2`, `minProtocol = 2`;
  `js/net/net.js` `PROTOCOL = 2`. Health and status report `protocol` + `minProtocol`; the welcome
  carries `v` + `min`.
- **Server** (`server/session.go` `serveOldClient`): a hello with `v` < 2 (or no `v`) is still
  token-checked (bad tokens behave as before), then gets
  1. an `{t:"error", code:"old_client", error:"SKYPUTT has been updated. Reload the page to play online.", v, min}` push,
  2. a welcome `{old: true, room: null, v: 2, min: 2, you}`,
  3. and from then on: `ping` → pong, `lobby` → the room list (one-off reply, no pushes), **every other
     request fails `old_client` with the reload text**. The session never touches the hub: no user,
     no seat, no presence, no room pushes, no player row. Closed with 4002 after 30 min
     (`oldClientTTL`); rate limits as usual.
- **New client** (`net.js`): `noteProtocol(v, min)` is fed by the welcome, `available()` (health) and
  `boards.available()` (health). A server newer than `PROTOCOL` → `net.update = {server, min, blocked}`
  and an `update` event. `old_client` (push, or a welcome whose `min` is above `PROTOCOL`) → `blocked`,
  the connect promise rejects `old_client`, the socket is closed and **not** reconnected; later
  `connect()` calls reject at once. `js/net/index.js` shows a fixed banner "Update available — reload
  …" (Reload / ×) on the `update` event, and the Online screen shows the reload text with a Reload
  button instead of "Try again" for `old_client`. CSS: `.net-update` in `css/online.css`.
- Boards HTTP endpoints don't look at versions (unchanged; boards suite passes).

## The live v1 client (js/net/*.js at 0c8f5ad6) — why the server doesn't just hang up
Read from `git show 0c8f5ad6:…`: v1 `net.js` only reacts to an `error` push when it is `bad_token`
(and nothing listens for that), and `ws.onclose` **always** schedules a reconnect (backoff to 12 s,
forever, whatever the close code). So a hard refusal (error + close) would leave a v1 page looping,
with "Can't reach the online server." + Try again — misleading and a socket every 12 s per stale tab.
What v1 does have: request errors reject with the server's `code` + `error`, and its Online screen
shows `ERR[code] || e.message`. `old_client` isn't in its ERR table, so it shows the server text.

So for a v1 page, after this deploy:
- Online opens normally (welcome, no room), the open-rooms list still loads.
- **Quick play / Create a room / Join (code, list, share link)** → toast or home note:
  "SKYPUTT has been updated. Reload the page to play online." It can never take a seat, so it can't
  desync a Battle room. Renaming shows the same text.
- No reconnect loop (stays connected; after 30 min the server closes, it reconnects once quietly).
- A v1 page that was mid-round at deploy time: the deploy restart ends all rooms anyway ("room closed").

## Tests
- Go: `server/protogate_test.go` — v1 / missing / zero `v` all refused (push, welcome shape, 8 request
  types refused with the text, ping + lobby work, not in the hub, no seat, no player row, host sees no
  change), same account after reload joins normally; a newer client (v3) is accepted; the old-client
  socket closes after `oldClientTTL`; health reports 2/2. `integration_test.go` `dial` now sends
  `v: protocolVersion` (`dialV` for other versions).
- `tools/online_test.mjs` section 4: update event from welcome / `net.available()` / `boards.available()`
  (stubbed fetch, protocol 3), raised once; `old_client` → blocked + closed + connect rejects; against
  the local server: health 2/2, no prompt for this build, and the **real v1 net.js fetched from git
  0c8f5ad6** connects (old welcome), sees the lobby, gets the reload text for quick / join / create,
  never takes a seat, and stays connected without reconnecting.
- Run 2026-11-09: `server/test.sh` ALL PASS (43 Go test funcs); online 49/49; physics 25/25;
  ballhit 46/46; boards 26 (against tools/server_run.sh, restarted with this build); story all
  passed; daily 83/83 (with `star`'s uncommitted course in the tree).
- Not checked in a browser: the banner's look (CSS only, same panel style as the Online cards).

## Commit notes
- `tools/online_test.mjs` also holds `star`'s Star Station hunk (rooms section) — commit hunks apart.
- Files: server/{main,session,hub}.go, server/integration_test.go, server/protogate_test.go (new),
  server/README.md, js/net/{net,index,boards}.js, css/online.css, tools/online_test.mjs, this note.
- Deploy server + static client together. Bump `minProtocol` (and `PROTOCOL`/`protocolVersion`)
  again whenever a wire change would make an older client simulate differently.
