# FRESH: fewer repeats across games (2026-10-13)

Aaron's group plays ~10 games a night and noticed repeats. buildQuestions only deduped within one game. FRESH keeps a
rolling history of questions this device has shown and makes new games prefer unseen ones.

## History (`js/core/fresh.js`, key `clued.seen`, synced)
- `{ v: 1, h: 'abcde…', g: [[new, total] × last 10 games] }`. `h` = fixed-width 5-char base-36 tokens (FNV-1a of the
  same `dupKey` as the in-game dedupe = prompt + answer, flattened), oldest first. Capped at `SEEN_MAX` = 3,000 (15 KB);
  a re-asked question moves to the newest end. Collision space 60M, so a false "seen" is ~1 in 20,000 at the cap.
- Synced like `clued.sets` (added to `SYNCED`). The account layer syncs whole snapshots, newest wins, so two devices
  playing on the same account between syncs keep only the newer device's history (accepted: each host has its own).
- Recorded by the runner (`js/structures/runner.js`): every question that is actually rendered goes into a pending list,
  written once when the game ends (any reason) and when the page goes hidden; spares are never shown, so never recorded.
  Room questions that arrive hidden (mc/tf without the answer) wait until `settle()` fills the answer. This covers solo,
  pub quiz, party, daily, challenges, link challenges, server rooms and P2P rooms for every player (joiners too).
  Duel has its own loop and records in `js/structures/duel.js`.
- `recordSeen`, `freshFrom`, `seenInfo`, `resetSeen` are the API.

## Soft avoid (`js/core/spec.js` buildQuestions, option `fresh`)
- With `fresh` (a `freshFrom()` lookup), each round generates a bigger pool (`want × 2 + count` instead of `want`), ranks
  it unseen first (generated order kept), then seen ones by the order they were first demoted (oldest seen first), and
  cuts back to `want`. Formats are untouched. A round can never come up shorter than before: the pool is a superset.
- LOCAL: the normal list is ranked before `mixRound`, and `mixRound` takes an optional `rank` that orders its shuffled
  local list too, so the local share and the round difficulty are unchanged (unit-tested at More/Most/ALL, live on/off).
- Determinism: the build returns `fresh`, a string of 4-char tokens of every seen candidate in demotion order. Kept as
  `spec.fresh`, any later build of that spec (another device, no history) applies the same ranking to the same pool
  and picks the identical questions. The play screen stores it on the spec, so link challenges and server challenges
  made from a FRESH solo game replay exactly. Typical size: ≤ 300 chars after 10 pub quizzes, ≤ 550 after 30.
- Who passes `fresh`: `playSpec` for every structure except the daily (`structure === 'daily'` or `spec.daily`),
  duel, the host screen (server and device rooms), and room "Play again". Builds without it (daily, challenge and
  link-challenge receivers, LOCAL's `planRound` counts) behave exactly as before and ignore the history.
- Rooms: the host's history plus `recent` = every question this room has asked on the host's device (`ctx.asked` in
  js/net/room.js), so Play again avoids the last game even if the host's history was reset. Room specs don't carry
  `spec.fresh` (the questions travel with the room).

## UI
- Settings › "Questions you've seen": "1,234 questions remembered" + Reset (confirmPop).
- Stats page line under the tiles: "🆕 1,234 questions seen · 96% of the questions in your last 10 games were new to
  you" (from `g`; cheap and honest). A "X of Y in your themes still unseen" line was skipped: Y needs every format's
  generated space for every pack, which costs seconds of generation.

## Measured gain (`node tools/fresh_sim.mjs [games…]`)
One device hosts Classic Pub Quiz (5 × 10, the suggested set) games back to back, built as the host screen builds them.
Repeats = questions already asked earlier that night.

| | before | FRESH |
|---|---|---|
| 10 games (500 asked) | 107–114 (21–23%) | 62 (12.4%) |
| 30 games (1,500 asked) | 561 (37.4%) | 262 (17.5%) |

Every repeat left with FRESH is in the "Geography: name the country" round: it is difficulty 1 (easy), and the easy
world map has only 38 countries (pool at difficulty 0 = 198, 2 = 146, 3 = 160). The other four rounds go from 52 → 0
repeats over 10 games and 299 → 0 over 30. (The "before" figure moves a little between runs while MUSIC edits the hits packs.)
Build cost: ~2.5× generation per round (≈ 50 → 135 ms per 50-question game in node).

## Side checks
- (a) P2P latency: already compensated like server rooms. `js/net/p2p_room.js` `answerMs` mirrors scoring.go (client
  ms used when plausible, clamped to ≥ receive − 1.5 s and ≤ receive + 0.3 s), joiners sync their clock to the host
  (`op: 'time'`, NTP-style offset with the best RTT, js/net/p2p.js), and openings wait on the ready-gate
  (READY_CAP_MS 5 s). p2p_test covers the clamp ("one client's clock 3 s behind"). No change made.
- (b) Public room list focus badge: `server/roomhttp.go` `pubRoom` gains `local {cc, level}` (`specLocal`: cc must be
  3 capital letters, level more/most/all, else omitted); `js/net/join.js` shows "📍 Japan focus". Go test
  `server/publocal_test.go`. NEEDS A SERVER DEPLOY (the client hides the badge until the field arrives).

## Tests
- `node tools/fresh_test.mjs` (unit, ~3 s): history shape/cap/order/corruption, unseen first (4th game avoids the first
  three where a plain build repeats), exhausted pool returns oldest seen and stays full, every suggested set (adult +
  kids) never shorter with a full history, spec.fresh replay identical (plain + 3 LOCAL settings), daily ignores the
  history, room `recent` avoided, local shares kept. Falsified: no ranking → 3 fails; ignoring spec.fresh → 3 fails.
- `CDP_PORT=9580 node tools/fresh_e2e.mjs OUT [portrait|landscape]`: two solo games (second shares nothing with the
  first; history 10 → 20), Settings count, Reset → popup → Cancel keeps / Reset clears, stats line, public-list badge
  (stubbed /rooms/public).

## Requests / open
- CONTRACT GameSpec: additive `spec.fresh` (string, 4-char tokens) — please note it.
- Aaron: the Classic Pub Quiz map round is the remaining repeat source (38 easy countries). Options: difficulty 0
  (mixed, 198) for that round in js/net/suggested.js, or accept repeats there.
