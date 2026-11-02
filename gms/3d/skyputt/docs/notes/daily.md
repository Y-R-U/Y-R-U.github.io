# daily — notes (Daily Challenge)

Owner: `daily` agent. Status: **done** (see Test results). Nothing committed (manager commits).

## What it is
Something new every day, so the Mon–Thu gaps between weekend events always have a live thing to play.
Each local calendar day has one **Daily Challenge #N** (#1 = 2026-11-03):
- **one hole** from any course in `COURSES` (read at run time: Sky Isles, Festival Isles, Hollow Woods; a new
  course joins automatically), **one theme** from `THEME_LIST`, **one twist**;
- **3 tries**, best result counts; a try is used the moment it starts (quit / reload = used, no Restart in its menu);
- a **streak** (days in a row you hole out on the daily) with milestone rewards at 3 / 7 / 14 / 30 days, then every 30;
- **today's board**: your best against 11 seeded ghost AIs (same field on every device);
- normal ladder points, star coins, star chests for the hole itself through the usual `app.meta.onHole` hook
  (a daily try is a normal `Round`), plus the small daily rewards below;
- a **Share result** button: `SKYPUTT Daily #N: ⛳ 2 strokes, streak 5` + a hole/twist line + the game link
  (Web Share on phones, else clipboard, else a text box to copy).

### Picking the day
- Pure function of the date string `YYYY-MM-DD` (local date, `?eventdate=` pins it like events / ladder).
- **Hole**: rendezvous hashing — every hole scores `hash(day, hole id)`, lowest wins, skipping holes picked in the
  previous 6 days (a 28-day walk makes that exact and still a pure function of the date). Adding a course only changes
  the days where one of its holes wins.
- **Locked courses** (`lockedBy`, Hollow Woods until sky9 is finished) are dropped from the pool *for that player*.
  With rendezvous hashing they get the same hole as everyone else whenever the global winner is on a course they
  have (277 / 293 such days in the first 400), and a shared fallback otherwise. Locked holes *inside* Sky Isles
  (sequential unlocks) are not filtered — like weekend events, playing one opens it on the map (events2 rule).
- Once you start a try, the day's hole is **frozen** in the save, so unlocking Hollow Woods mid-day can't swap it.
- **Twist**: hash pick among the twists that fit the hole. **Theme**: hash pick per day.

### Twists (only what the engine already does cleanly)
| id | name | goal | how |
|---|---|---|---|
| par | Par or better | ≤ par | — |
| birdie | Birdie hunt | < par (par ≥ 3 only) | — |
| nohelpers | No helpers | ≤ par | `makeInventory({mode:'off'})`, tray hidden (online helper mode) |
| kit | Fixed kit | < par (par ≥ 3 only) | `makeInventory({mode:'fixed', n:1})`: one of each, own helpers untouched |
| crystals | Crystal sweep | all crystals + hole out | fresh in-memory pickup ledger + `currency` 💎 (no coin farming); holes with ≥ 1 crystal |
| clock | Shot clock | ≤ par, 15 s per shot | `DailyRound.shotClock` (online's rule: zero-power auto putt = +1 stroke), `.net-clock` look |
Over 400 days each twist comes up 50–80 times. Mirror was skipped (the engine has no mirroring).

## Rewards / balance
- Daily: **8 coins** for the first hole-out of the day + **12 coins** the first time the twist goal is met
  → **≤ 20 coins a day**, once a day however many tries.
- Streak milestones: 3 days 20 coins + 1 Long Sight · 7 days 40 + wooden chest · 14 days 60 + 1 Mulligan + wooden chest ·
  30 days 100 + silver chest · every further 30 days the 30-day reward. Never a golden chest.
- Comparison: a perfect weekend event ≤ 185 coins + wooden chest (events3.md); a day is ≤ 1/9 of that.
  A perfect 30 days = 600 + 220 = 820 coins + 2 wooden + 1 silver chest ≈ 11 front-nine rounds of income
  (~75 coins each, meta.md), for ~3 minutes a day. Plus the hole's own star coins / ladder points like any hole.
- Streak = **days you hole out** (any try, picked up / quit don't count). The twist goal is the bonus, not the streak
  (a hard twist like Crystal sweep shouldn't break a streak). A missed day shows 0 and the next finish restarts at 1.
  A try started before midnight is recorded on (and counts for) the day it started; the streak never moves backwards.
  Separate from the ladder's own "days played" streak (meta).

## Today's board
11 ghosts per day: names from the events name lists, a personality from `PERSONALITY_IDS`, skill 0.2–0.9 (D14),
1–3 tries each; strokes = best of their tries drawn from the **calibrated quick-mode histograms** (`quickScores`,
js/ai/calib.js — instant, no physics). Ranked by strokes, ties go to you. Typical field median is par.

## Files
New: `js/daily/daily.js` (pure: picking, twists, field/board, save state, rewards, streak, share text),
`js/daily/round.js` (`DailyRound extends Round`: helper modes, shot clock, fresh ledger, no Restart),
`js/daily/screen.js` (#daily page + `dailyTileHTML`), `css/daily.css`, `tools/daily_test.mjs`, this file.
Changed (additive): `js/game/play.js` (optional `doneLabel` for the last hole card's button, default 'Scorecard'), `index.html` (Online now shares a `.t-row` with the new `#t-daily` tile; `#daily` card-wrap;
`css/daily.css` link), `js/app/main.js` (imports, `renderDailyTile()` in showTitle, a daily block after events —
`play` mirrors `playEvent`; `daily` / `dailyScreen` on `__skyputt`; Online subtitle shortened to
"Friends, rooms, ghost AIs" so it fits the half-width tile), `tools/shots_cdp.mjs` (`daily` mode).
Save: `store.data.daily = { v, days: { ymd: { n, hole, twist, theme, tries[], paid } }, streak: { count, last, best }, log }`,
created on first use (store.js untouched; Store keeps unknown keys); day records older than 45 days are pruned.

## How to test
```
node tools/daily_test.mjs          # 72 checks; spawns itself with TZ=… for the timezone / DST checks
~/.claude/bin/cdp start --port 9590
node tools/shots_cdp.mjs daily --port=9590 --own --out=DIR [--day=2026-11-03] [--sizes=p,d,l]
```
URLs: `?eventdate=2026-11-03` (#1 Fixed kit, sky17), `2026-11-07` (shot clock), `2026-11-15` (no helpers),
`2026-11-06` (crystal sweep). Debug: `__skyputt.daily` (`current()`, `streak()`, `board()`, `shareText()`).

## Test results (2026-11-03)
- `daily_test` 72/72 (determinism over 400 days, no repeats within 6 days, every hole / twist / theme / course
  appears, goals, locked courses skipped + frozen day, tries, 23:59 → 00:01 rollover, try started before midnight,
  pruning, TZ child processes: Kiritimati / UTC / Pago Pago on one instant, New York 25 h + 23 h DST days, London,
  LA midnight; streak continue / break / quit-only days / 60-day run / never rewinds; reward balance; board; share text).
- `physics` 25/25, `store`, `story`, `events`, `meta` all pass; `holes_test` passes; `online_test` 28/28 (:8098, untouched).
- Browser (`shots_cdp daily`, Chrome :9590 `--own`, no console errors): title tile at 412×915, 1440×900, 844×390
  (title fits, no horizontal overflow); page at all three; a Fixed-kit try on sky17 in frost played by touch drags
  (kit = 1 of each, own Long Sight unchanged, 5 strokes, card button "Back to the daily", +8 finish coins, rank 10/12,
  streak 1, theme restored to sky); share text via the copy box; two quit tries → no tries left; shot-clock day: clock
  shows, runs out → +1 stroke, pause menu has no Restart ("Quit try"), overlay removed on quit; no-helpers day: tray
  hidden, back after; next day tile "Daily #2 🔥1".

## Online daily leaderboard — skipped, proposal
Not built (scope + the server is deployed and every server change needs a redeploy that Aaron OKs). Proposal:
- Server: table `daily(day TEXT, hole TEXT, uid TEXT, name TEXT, strokes INT, tries INT, at INT, PRIMARY KEY(day, hole, uid))`,
  keep 14 days (sweepDB). Over the existing websocket (auth/session already there): `dailySubmit {day, hole, strokes}`
  (upsert min strokes; day must be within ±1 of server UTC date; strokes 1…12; rate bucket `daily` 30 / 10 min per uid)
  and `dailyBoard {day, hole}` → top 50 + your row. Board keyed by (day, hole) because locked players can have a fallback hole.
- Client: after a try, if `ONLINE_PUBLIC` and a session exists, fire-and-forget submit; the daily page shows a
  "Players" tab when the board fetch succeeds within ~2 s, else only the ghost board (fully offline as today).
- Tests: Go integration test (submit, min wins, bad day / strokes rejected, rate limit), online_test addition.
- Client-reported (D11 warning applies).

## Known issues / notes
- Adding a course or theme changes future days' picks (and today's if not started yet); started days are frozen.
- The board is static all day (the whole field is shown from midnight); fine for a solo daily.
- Quitting from the browser (closing the tab) mid-try leaves that try as "quit" — intended (no free retries).
- The shot clock counts real seconds (wall time), so it's fair on slow devices whose frame dt is capped.

## Proposals for DECISIONS
- P1 Daily Challenge: one hole + theme + twist per local day, 3 tries, best counts; ≤ 20 coins a day; streak milestones
  3/7/14/30 (+ every 30), never a golden chest.
- P2 The daily streak counts days you hole out, not days you meet the twist goal.
- P3 Locked courses are dropped per player (rendezvous hashing keeps most players on the same hole).
