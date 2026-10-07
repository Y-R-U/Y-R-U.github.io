# TIMING — online answer timing, auto-answers and scoring fairness (2026-10-08)

Aaron's report, two phones side by side in a server room playing Apple music rounds:
1. "Very occasionally it would auto answer for both players at the start of a round."
2. "Sometimes the quicker person had the worse round score… host clicking next round vs the 5 s being up?"
3. (follow-ups) "I selected 5 s but it felt like 2 or 3 s"; "I didn't realise the streak adds points"; drop Grow.

"Round" in his words means a question (the 5 s is the gap before the next question; the host's button reads
"Next question ›").

## Evidence (snapshot of the live DB taken just after they played)
Rooms 4XG4W (listen, 20 questions, Grow "auto" so every question had `stages: 5`, clip 5, art off, answer 10 s,
gap 5 s, public; `game: 5` = the sixth game in the room) and UNVDC (mc, 20 questions, `game: 2`). KN6BU never started.
Only the last game of each room survives (`again` resets answers), and answers store `g/c/p/ms` only (no receive
time), so the earlier games are gone.

Rebuilt every one of the 80 answers from the server formula (script in the session scratchpad, `recon.py`):
listen window = max(10 s, 1.5 × answer time) = 15 s, mc = 10 s, every listen answer at stage 0 (nobody used Show
more), streak +10% per answer after the first, capped at +50%. **0 mismatches.** So the server did what the code says;
the questions are why the code says it.

- **Faster but fewer points: 3 cases, all the streak bonus.**
  - 4XG4W Q15: 4.1 s → 390 speed × 1.1 (2 in a row) = **429**; 5.9 s → 343 × 1.5 (7 in a row) = **515**.
  - UNVDC Q1: 1.6 s → 437 (streak 1) vs 2.1 s → 416 × 1.1 = **458**.
  - UNVDC Q18: 1.4 s → **442** (streak 1) vs 2.8 s → 389 × 1.4 (5 in a row) = **545**.
  The reveal only showed "+515 pts · 1st of 2", so the bonus was invisible (Aaron thought the 🔥 was decoration).
- **Auto-answer for both at a question start:** not in the surviving games (every question has at least one answer),
  so it happened in an earlier game. The mechanism below reproduces it exactly, in a Go test and in the browser.
  In 4XG4W game 5, Q0 has no host answer at all (the joiner answered at 6.5 s); that one looks like the host's clip or
  question loading late, not the race (the race would have stopped both).
- **"5 s felt like 2–3 s":** Grow "auto" turned on for online rooms, so stage 0 played **1 s** (1 → 2 → 4 → 8 → 15)
  and the chosen 5 s was silently ignored. Every 4XG4W answer was at stage 0, i.e. they heard 1 s clips (plus replays).

## Root causes
1. **A host "Next" was not bound to a question.** `POST /next` in phase `reveal` advanced, and in phase `question`
   it *revealed* (ended) the open question. Two everyday paths send a Next that lands after the server already moved on:
   - the host taps "Next question ›" / "Round 2 ›" as the gap countdown hits 0; the 250 ms tick advances first, the tap
     arrives in the new question's lead-in and ends it;
   - the old reveal card (and its live Next button) stayed on screen while the client fetched the next question and ran
     `prepareFormats` — for listen that is a HEAD request to Apple, so music rounds kept the stale button up longest.
   The ended question went straight to reveal: both clients skipped the countdown, rendered, saw `phase: reveal` and
   recorded "Time's up". No answer stored, streaks reset for everyone.
2. **Media loading ate the answer window, unequally.** The clip was fetched and decoded only after the question
   rendered at `qStart`, so each device started the music a different time after the window opened (no prefetch for a
   round's first question at all). A slow phone heard the music later but was timed from the same start.
3. **Client clock could buy speed.** The server took the client's ms whenever it was ≤ receive time + 300 ms, with no
   lower bound: a clock estimate running behind scored faster than the real tap.
4. **Invisible scoring.** No breakdown; streak bonus not explained; the runner card's local "+N" (with listen's own
   clip factor) could disagree with the server's "+N pts" on the same card, because online the server ignored listen's
   clip/artwork/replay factors.
5. **Grow hid the chosen clip length** (above).

Ruled out: stale deadline from the previous question (the runner takes `qDeadline` from the current state); vote
extensions (no votes in the data); the progressive multiplier (stage 0 throughout); client ms from render (it was
already `serverNow() − qStart`); the round-card lead-in itself (early "Round 2 ›" during the reveal is fine — only a
Next landing *after* the advance hurt).

## Fixes
Server (`server/`, deployed 2026-10-08 with `deploy.sh`, `/api/health` OK, live probe: `streakBonus`, `/ready` work):
- **Next is bound to the question on the host's screen** (`roomhttp.go`): body `q`. In `reveal`, advance only if
  `q` is absent or equals the current question; in `question`, end it only if `q` names the open question *and* it has
  opened. A stale or q-less tap is a no-op returning state. Old live clients send no q, so they can no longer end a
  question by accident — this fixes bug 1 for the already-shipped client.
- **Media-ready hold** (`rooms.go` `checkHold`, `POST /rooms/{code}/ready {key, q}`): clients announce support
  (`q: -1`) and report each question once its question JSON and media are loaded. 700 ms before the planned opening,
  if an online, playing, reporting client is not ready, the opening is held (`state.hold`, `qStart` = plan + 5 s cap);
  when the last one reports, it opens 800 ms later with the full window (deadline recomputed). Never waits for old
  clients or offline players; capped at 5 s. Chosen over "start each player's window when their audio plays" because
  that would make each player's speed depend on their own device's report (not server-authoritative) and break the
  shared deadline/early-end logic; the hold keeps one start time for everyone.
- **Speed clamp** (`scoring.go` `answerMs`): client ms used only within [receive − 1.5 s, receive + 0.3 s], then
  [0, limit]. Same real moment → same speed points.
- **Breakdown**: answers store `sp` (speed/base points), `bo` (streak bonus), listen `cm/am/rp`; `last` in state
  carries `speed, bonus, streak, stage, stages, clipMul, artMul, clip, replays`; players carry `rb` (streak bonus
  per round) next to `rs`.
- **Listen factors server-side** (non-progressive listen, not kids): `speed × clip (1 s ×2 … 5 s ×1.25 … 30 s ×0.7) ×
  artwork (off 1 / blur 0.85 / on 0.65) × 0.85^replays`, replays client-reported and clamped to the question's
  `data.replays`. Clip and artwork are host settings, identical for everyone.
- **Streak bonus room setting**: `streak` (bool) on create/settings, or `spec.streak: "off"`; `state.streakBonus`.
  Off = the 🔥 counter still counts, no points. Old clients don't send it, so their rooms keep the bonus.

P2P (`js/net/p2p_room.js`, `p2p.js`): the same next binding, ready hold (`ready` op + `transport.ready`), `answerMs`
clamp, `listenFactors`, breakdown fields, `rb`, streak setting (constructor `streak`, settings `streak`, spec), and
the new fields in snapshot/restore.

Client:
- `room.js`: Next sends `{ q: st.q }`; `beforeQ` replaces the old reveal with the countdown immediately and loads in
  parallel; media preloads during the lead-in (`format.preload`, listen = fetch + decode the exact slice), then
  `ready`; listen skips the per-question HEAD check (its loader refreshes dead previews anyway); the countdown waits
  while `hold` ("Waiting for everyone's question to load…") and re-syncs the ring if the opening moves; answers send
  `replays`; the runner card's "+N" is replaced by the server's points; reveal shows the breakdown line, e.g.
  `260 speed (6.0 s) · ×1.25 5 s clip · −15% 1 replay · +39 streak (2 in a row)` (streak part only when on);
  scoreboard rows show each player's time and streak bonus; end-of-round rows show "incl. +N streak". Lobby: host
  gets the streak choice beside answer time/gap; others see a "🔥 Streaks add points / just for show" badge.
- `board.js`: `pointsBreakdown(last, { streakBonus })`, `rowNote`.
- `listen.js`: **Grow removed** (option gone; `opts.grow` from old favourites/rooms ignored; never `stages`), plays
  exactly the chosen clip; replay is how you hear more; `preload(q)` hook. Old progressive listen questions (rooms
  created before this) still render.
- Streak bonus setting everywhere: `js/ui/streakopt.js` (chips "Adds points" / "Just for show" + inline ⓘ, no
  modal). Settings and every solo/party setup and the pub quiz builder share one remembered preference
  (`settings.streakPts`, default **Adds points**), applied in `structures/session.js` (the daily keeps the standard
  rule). Online host setup: room-level, **default "Just for show" for new rooms** (my call: then the quicker correct
  answer always wins the question, which is what players expect when they're side by side; the host's last choice is
  remembered in `clued.online.streak`). Hidden for kids.

Clip-length check: `pickStart` keeps Apple starts in [3 s, dur − len − 1.5 s] and the slice is len + 0.25 s, so a
5 s clip is never cut short. Measured in Chrome (e2e): buffer 5.25 s, start→ended ≥ 4.9 s, and the clip starts
4–25 ms after the question opens on both devices (it never plays before the question is visible: render precedes
play).

## Tests
- Go `server/timing_test.go` (HTTP only, so it compiles against the pre-fix server): `TestStaleNextDoesNotEndNewQuestion`,
  `TestReadyHold` (decided 700 ms early, 5 s cap, 800 ms go, equal points), `TestReadyHoldOnlyForReportingClients`,
  `TestSpeedClamp`, `TestBreakdownAndStreakSetting` (the UNVDC Q18 numbers, on vs off, settings, spec),
  `TestBreakdownStage`, `TestListenFactors`. **All 5 original ones fail on the old server** (stale next → `phase=reveal
  q=1`, `/ready` 404, ms 950 accepted, no `streakBonus`, no breakdown). `server_test.go`: two calls that used Next to
  skip an open question now pass `q`. `server/test.sh` ALL PASS.
- Node: `tools/p2p_test.mjs` 129/0 (new block mirrors the Go tests; old code: stale next ends q1 then skips to q2),
  `tools/s_unit_test.mjs` ALL PASS (breakdown text, row notes, `answerMs`, `listenFactors`, no Grow option; old code:
  `pointsBreakdown` missing), `tools/au_test.mjs` (listen never progressive, clip = chosen length, Grow option gone).
  `a_test` 467/0, `fav_test` 46/0, `f_test`, `l_test` pass.
- E2E `node tools/s_room_e2e.mjs --timing` (CDP 9461–9463, metal, cache disabled, autoplay allowed): a 2-round listen
  room built through the host screen; the "slow" phone's `audio-ssl.itunes.apple.com` requests are held 4.5 s each;
  host presses "Round 2 ›" during the gap, then a stale Next (with q and without) arrives after the advance; two
  players tap at the same moment. 22/0: holds on the short-lead-in questions, clips start within 25 ms of the opening
  on both phones, full 5 s clip, equal speed points every question, nobody saw "Time's up", breakdown visible.
  Against the pre-fix code (`--site http://127.0.0.1:8899/... --server <old>`): **10 failures** — stale Next ended
  round 2's first question and skipped to q3, the slow phone got "Time's up", 1 s clips, no breakdown.
- The regular `s_room_e2e` (55/4) and `rounds_p2p_e2e` (7/3) fail the same favourite-count checks on the pre-fix code
  too (a ♥ round now adds 10 questions, not the fav's 4) — pre-existing, not from this work.

## Not done / for the manager
- Static files are not shipped and BUILD not bumped. Until they are, live clients already get the server-side fixes
  (stale Next ignored, speed clamp, listen factors, breakdown data) but not the hold, preloading, breakdown UI, Grow
  removal or the streak setting.
- Someone added a `.net-live` pill rule to `js/net/net.css` (for the join hub's live button) while I worked; it also
  matches the room's reveal box `div.net-live.stack`, drawing a big rounded border round the reveal scoreboard
  (visible in the e2e screenshot). Scope it to `button.net-live` or rename one of them.
- DESIGN.md "Listen options"/"Vote to reveal more" still describe Grow; S.md's timing paragraph predates `ready`/`hold`.

## Pre-ship run (2026-10-08, current tree incl. CARDS + STATS)
- The manager's rule is that a ♥ favourite round takes the round default (10 online), not the favourite's own count.
  `s_room_e2e` and `rounds_p2p_e2e` now expect "10 questions" on the favourite card, edit it down to 5, and expect
  rounds [5,5,5] / [5,5]. With `.net-livechip` the reveal box renders correctly again (screenshot checked).
- `a_e2e` menus clicked `.home-foot .btn` index 1, which is now STATS' "Stats" button, so it moved to index 2 (Credits).
- Results: Go `test.sh` ALL PASS · a_test 467/0 · f_test 2378549/0 · fav_test 46/0 · l_test 60/0 · cards_test 17332/0 ·
  stats_test 63/0 · au_test pass · p2p_test 129/0 · s_unit_test ALL PASS · m_test 5433/5433 · geo2_test 12042/12042 ·
  a_e2e portrait 11/11 and landscape 11/11 scenarios · l_e2e portrait all passed · stats_e2e 27/0 · s_room_e2e 54/0 ·
  s_room_e2e --timing 22/0 · rounds_p2p_e2e 11/0 · p2p_e2e 39/0.
