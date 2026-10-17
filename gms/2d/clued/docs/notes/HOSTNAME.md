# Lane HOSTNAME: change your name (host and joiners), Settings › Your name

Aaron: "As host I never get the chance to change my name." (2026-10-17)

## How names worked before
- Online (server + device rooms): host screen and join screen both use `nameField()` (js/net/join.js), silently
  pre-filled by `suggestedName()` (js/net/ident.js): the remembered `clued.name` (localStorage, NOT in the synced
  keys), else the br8t account's display name. Host/join success calls `rememberName()`. The host's field was easy to
  miss (pre-filled, among the round settings) and there was no way to change a name once in the room.
- Server: `cleanName` (names.go: control/format chars and `<>` stripped, whitespace collapsed, 20 runes, profanity
  refused) + `dedupeName` (" 2", " 3"… case-insensitive against active players) on join/create.
- P2P: `tidy` + `dedupe` in js/net/p2p_room.js (no profanity filter, same as P2P joins).
- Party/pub quiz/duel are one-device modes with editable player rows (duel is fixed Red/Teal); not touched, except
  Party's first-time default Player 1 is now your name.

## What changed
- Lobby: your own chip has a ✎ (`[data-act=rename]`). It swaps the name for an inline input
  (`[data-field=rename]`); Enter or leaving the field saves, Escape cancels. No popup. While editing, state pushes
  reuse your chip so the input survives re-renders. A successful rename is also remembered as `clued.name`.
- Transport: `rename(code, key, name) -> state` on both transports (transport.js contract updated).
  - Server: `POST /api/rooms/{code}/rename {key, name}` (roomhttp.go `handleRename`, rooms.go `Room.rename`).
    Same `cleanName` + `dedupeName` (excluding yourself, so recasing your own name is fine), "join" rate bucket,
    409 `in_question` while a question is open (incl. its lead-in), 409 `room_ended`, 410 kicked. `changed()` pushes
    the new state over SSE/poll to everyone; the public list/peek host name follows.
  - P2P: client sends op `rename`; the host's `P2PRoom.rename` applies the same rules and `changed()` triggers the
    host's state broadcast to every connection.
- Settings: "Your name" panel at the top (`[data-set=name]`, `[data-field=settings-name]`), stored in `clued.name`.
  Empty + signed in → shows the account's FIRST name (`accountFirstName()`), never saved over a typed name.
  `suggestedName()` now falls back to the first name too.

## Tests
- `cd server && go test ./...` (new rename_test.go; falsified by dropping the route → FAIL).
- `node tools/p2p_test.mjs` (rename block added).
- `node tools/hostname_e2e.mjs [--p2p]` — Settings name → host pre-fill; host ✎+Enter → joiner sees it; joiner
  ✎+blur clash → deduped on the host; Escape cancels; names carry into the game. Screenshots at 390x844.
- Env note: the live server has the daily allowance on, so signed-out device hosting stops at the sign-in panel.
  `p2p_e2e.mjs` / `rounds_p2p_e2e.mjs` therefore time out at "lobby code" as written (not caused by this lane); with
  `&api=` pointed at a local server they pass (rounds 11/0; p2p 41/2, the 2 being the known early-reveal flake).
  hostname_e2e always points `?api=` at its own local server for that reason.
