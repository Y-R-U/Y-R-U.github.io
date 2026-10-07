# ROUNDS — multi-round online games (2026-10-08)

Aaron: "When setting up an online game I should be able to set up a number of rounds… 'Add round', then pick a theme
(I would often pick from favourites…), and each round should default to 10 questions each."

## What it does
- **Host setup is a round list** (server rooms and device rooms, `js/net/host.js`). It opens with the last hosted list
  (`clued.online` = `{ rounds, kidsRounds }`, per mode), or one Multiple choice round of 10. Each card shows icon, name, question
  count and a short summary in the favourites' style ("80s+90s · 10s clip · Hard"), plus ▲ ▼ ✎ ✕ (tap the card = edit).
  "＋ Add round" (up to 8) opens a picker: **♥ From your favourites** first (every saved fav across formats, newest first,
  one tap adds the round with its packs/options/difficulty and its count, else 10), then the format grid (→ round editor).
  "Start over with one round" resets. The room settings below are global: answer time, gap, private/public + auto-start.
- **Round editor** = the pub quiz's `pqround` screen, now shared (`js/structures/rounds.js`): format header with a
  **Change** button, optional round name, `optionsPanel` (♥ quick picks on top, themes, count, options, difficulty).
  New online rounds default to **10** questions (pub quiz keeps 6). The pub quiz builder uses the same cards (now with
  reorder; reordering clears jokers, as removing did) and the same favourites-first picker.
- **In the room:** lobby lists the rounds (badge "3 rounds"); the join screen says "3 rounds"; the HUD reads
  "Round 2 · 3/10". Each round's first question gets **5 s more lead-in** (8 s), shown as a round card on every screen:
  "ROUND 2 OF 3", icon, name, themes · N questions, top-3 scoreboard, "Starts in N". The last reveal of a round shows an
  "End of round 1 of 3 · Next: Music" card, the scoreboard switches to that round's points ("R1 +1,044"), and the gap
  reads "Round 2 in 3…" (host button "Round 2 ›"). The podium adds a **Round by round** table (best per round in green).
  Kids rooms: same builder with bigger cards/buttons/fav rows (`body.kids-on`), stars on the boards, no table.
- **Answer time follows the format's `timeScale` online too:** the host stores `q.tscale` on each question at create
  (and Play again); server/P2P limit = max(longFormat minimum, min(answer × tscale, 180 s)), tscale capped at 6. E.g.
  Closest guess at 10 s → 20 s, Type the answer → 30 s (its old minimum), Connections still 120 s.

## Server (deployed 2026-10-08, `server/deploy.sh`, /api/health OK, live probe returned `roundSizes`)
- `qMeta` reads `round` and `tscale`; `groupRounds` = consecutive runs of `question.round`.
- State (multi-round only): `round` (ordinal of the current question, omitted when 0), `roundSizes`, `roundSpec`
  (ordinal → `spec.rounds` index; a round whose media all failed is dropped, so they can differ). Players get `rs`
  (points per round). Peek gets `rounds`. Single-round rooms are unchanged.
- `advance()` adds `roundIntroMs` (5 s) on each round's first question. **Joining while a question is still counting down
  (now < qStart) plays that question** (was: the next one), so the round card is a natural join window. Late join,
  reconnect and votes need nothing else: every per-question rule is unchanged.
- **Body cap:** measured 4×10 rounds: mc pictures + listen + reveal + silhouette = 47 KB; connect + blitz60 + flag-map +
  pin-drop = 47 KB; ladder + chain + match + neighbours = 47 KB. Largest per question: listen 2.4 KB, chain 2.1 KB, so
  even 200 listen questions ≈ 475 KB < 512 KB. **Cap not raised.** The client trims with `fitSet` (≤ 200 questions,
  ≤ 500 KB) from the end of the biggest round, so every round survives (was: chopped the last round).

## P2P (`js/net/p2p_room.js`)
Same port: `groupRounds`, `roundStart`, `ROUND_INTRO_MS`, tscale in `limitFor`, join-during-countdown, `round/roundSizes/
roundSpec/rs` in state, `rounds` in peek. Snapshot/restore recomputes rounds from the questions.

## Files
- New: `js/structures/rounds.js` (cards, picker, `pqround`, list registry), `js/net/host.js` (host screen, moved out of
  join.js), `js/net/roundset.js` (pure: `roundAt`, `specRound`, `annotateTimes`, `fitSet`), `tools/rounds_p2p_e2e.mjs`.
- Changed: `js/structures/pubquiz.js` (uses rounds.js; its pickFormat/pqround moved there), `js/net/join.js` (hub buttons
  go straight to the host screen; join screen shows rounds; exports `nameField`), `js/net/index.js` (imports host.js),
  `js/net/room.js` (round card, labels, end-of-round, final table), `js/net/board.js` (`scoreboard({ round })`,
  `roundsTable`), `js/net/net.css`, `css/base.css` (`.pop.out { pointer-events: none }`: a closing popup no longer
  swallows the next tap for 220 ms), server `rooms.go`, `roomhttp.go`, `scoring.go`, `server_test.go`.
- Tests changed for the new host flow: `s_room_e2e`, `s_public_e2e` (also: its countdown check accepts 2:00), `p2p_e2e`,
  `fav_e2e`.

## Tests (all green)
- `server/test.sh` ALL PASS; new `TestMultiRound` (sizes/spec map/round fields, intro lead-in, join on the card vs after
  it opens, per-round scores, single round unchanged) and `TestTimeScaleLimits`. Falsified: dropping the intro or summing
  every answer into round 0 fails it.
- `node tools/p2p_test.mjs` 114/0 (same scenarios as the Go test; the old late-join check now opens the question first).
- `node tools/s_unit_test.mjs` ALL PASS (roundAt, specRound, annotateTimes, fitSet). `a_test` 467/0, `fav_test` 46/0.
- `node tools/s_room_e2e.mjs` **53/0** (CDP 9451–9453, metal): host builds 3 rounds by clicks (edit default → 5 Qs +
  name, round 2 from a ♥ tf favourite with 4 Qs, round 3 mc 10→5), reorder, lobby lists rounds, server sizes [5,4,5],
  every screen shows each round card, end-of-round cards, "Round 2 in…", **Bob refreshes mid-round-2** and comes back
  on "Round 2 · 2/4", podium + round table, rs sums = totals; then the old vote round and host handover.
- `node tools/rounds_p2p_e2e.mjs` 10/0 (real PeerJS broker): device host builds 2 rounds (one from a fav), join screen
  says 2 rounds, round cards on both screens, joiner refresh mid-round-2, per-round scores add up.
- `fav_e2e portrait` all ok (host step now goes Add round → listen), `s_public_e2e` 3/0, `a_e2e pubquiz` portrait + desktop ok.
- Screenshots looked at (384×854 and 1280×800, dpr 1): host round list, add-round picker, editor, lobby, round card,
  end of round, final table.

## Open / notes
- The client changes need the static deploy (manager commit / `STATIC=1`); the server is already live and backwards
  compatible (old clients ignore the new fields; their rooms are single-round).
- A fav from quick play carries its own count (e.g. 5): it wins over the default 10. Easy to flip in `roundFromFav`.
- Per-round answer-time overrides weren't added (room-level answer time stays global, per the request).
- `hostRoom(spec)` (pub quiz → host online) now seeds the editable round list from the spec.
