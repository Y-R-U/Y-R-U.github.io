# Lane G2 report: M1 loose ends + M2 (fake online, progression)

## What exists

| File | What |
|---|---|
| `js/meta/hash.js` | FNV-1a **with a murmur3 finaliser** (`hash32`, `unit`, `rngFrom`). The finaliser is what keeps neighbouring ranks from picking near-identical names (the snake-eee bug); `meta_test --break=hash` proves the check catches plain FNV |
| `js/meta/names.js` | `playerFor(key)` gives a believable `{ name, flag }`: region-weighted emoji flags, regional first names, gamer tags (adj+noun, 6 spellings), clan tags, a few one-offs. Thousands of combinations |
| `js/meta/ladder.js` | The ladder as a **curve**: 287,340 players, `rankOf(rating)` / `ratingAt(rank)` through log10(rank), `parAt` (expected placement, measured off rank), `ratingDelta`, `around()` (rows built on demand), `top()`, `neighbours()` (opponents are real ladder rows near you, de-duplicated by name stem) |
| `js/meta/leagues.js` | 8 leagues Bronze, Silver, Gold, Platinum, Diamond, Master, Champion, Legend cut by rank (180k/100k/50k/20k/5k/1k/100), demotion hysteresis 40 pts, `botProfile(league)` (skill, aggression, throttle), SVG badges |
| `js/meta/roster.js` | `buildRoster({ seed, rating })`: 7 opponents with names, flags, league, persona, skill around the league, 2 "human-feeling" bots |
| `js/meta/economy.js` | Coins/XP payout, level curve, `earn`/`spend` (never negative) |
| `js/meta/daily.js` | UTC day key, date-derived daily challenge (7 kinds), progress tracking, 7-day login calendar |
| `js/meta/shop.js` | Catalogue + `buy`/`equip`/`owns` |
| `js/meta/save.js` | One versioned key `throng.save` (`v: 1`, `savedAt`, `createdAt`), migration from wave-1 `throng.name`/`throng.muted`, type-checked fill of partial saves, injectable storage |
| `js/meta/progress.js` | `applyMatch(save, result, now)`: rating, league, stats, coins, XP, first win, challenge; returns everything the results screen animates |
| `js/ui/kit.js` | Helpers, icons, **sheet manager** (backdrop / X / Esc all close), `countUp` |
| `js/ui/menu.js` | New menu: profile chip (league badge, name, level + XP), coins, league/rating/rank pill, logo, PLAY, Practice link, today's-challenge chip, Locker / Ladder / Daily / Settings |
| `js/ui/lobby.js` | "Finding players… n/8": 7 players join one by one over 2–4 s with flag, name and league badge, then MATCH FOUND. Cancel returns to the menu |
| `js/ui/results.js` | Ranking with flags and league badges, rating and rank count-up, coin rows one by one, coin total + bank count-up, XP bar fill with level-ups, promotion/demotion banner, daily progress, victory emote |
| `js/ui/locker.js` | Tabs Colour / Name plate / Badge / Emote / Toasts, live previews, tap-to-confirm-then-buy, equip |
| `js/ui/panels.js` | Ladder, Daily, Profile (name + stats), Settings sheets |
| `js/ui/pause.js` | Pause / autopilot overlay with sound toggles and a two-tap Leave |
| `js/ui/hints.js` | First-match callouts |
| `js/ui/screens.js` | Composes the above |
| `tools/meta_test.mjs` | Node tests for the meta layer, 11 falsification arms |
| `tools/ladder_tune.mjs` | Career simulation + grid search for the ladder constants |

Changed: `js/main.js` (match kinds, lobby flow, pause/autopilot, catch-up, results, emotes, settings),
`js/ui/hud.js` (pause button, league badge + flags in the leaderboard, plates/badge/toast styles, emote
bubbles, `crownTop()`, portrait rows, pill scaling), `js/sim/bots.js` (aggression, throttle, human-feeling
behaviour), `js/sim/sim.js` (comeback knobs), `js/sim/match.js` (roster + locker colour), `js/audio.js`
(music and effects toggled separately, no own localStorage), `js/input.js` (`setKeepMoving`), `js/config.js`,
`css/ui.css`, `tools/sim_test.mjs`.

**Contract note for the manager:** lane G now also owns `js/meta/**`, `tools/meta_test.mjs`,
`tools/ladder_tune.mjs`. Nothing in `js/render/**` or `js/world/**` was touched.

## Decisions (for the REVIEW list)

- **Two match kinds.** `sim-online` (PLAY): rated, ladder opponents, never stops. `practice` (small link under
  PLAY): offline, generic team names, no rating or coins, real pause. The menu says "Play"; nothing claims
  real people are online; there is no "N online" counter anywhere.
- **Pause in sim-online = autopilot.** The pause button and tab hide both put your crowd on the `?auto` bot
  and show an AUTOPILOT overlay ("The match is live…"). On return from a hidden tab the sim is **caught up**
  by the time you were away (autopilot steering, capped at the match end), and the overlay says
  "You were away N s". If the match ended while away, results show directly. Practice really pauses.
- **Leaving** a sim-online match counts as 8th place (rating applied, no coins), two taps to confirm.
- **Days roll at 00:00 UTC**, so the challenge is the same for everyone that day (Australia: ~11:00).
- **Login calendar never resets**: it advances one step per day claimed; a missed day costs nothing.
- **Default name "You"** (editable in Profile). Bots carry ladder names.
- **No ads, no ad doublers**: first-win-of-the-day bonus instead.

## Running the tests

```
node tools/sim_test.mjs                 # 24 matches per map + sim-online rosters (Bronze/Diamond/Legend); exit 1 on failure
node tools/sim_test.mjs --break=<determinism|nan|stuck|leak|events|distribution|jitter|league>
node tools/meta_test.mjs                # exit 1 on failure
node tools/meta_test.mjs --break=<ladder|ladder-slight|curve|curve-slight|names|names-slight|hash|daily|economy|save|progress>
node tools/ladder_tune.mjs [--grid]     # career table (below); --grid re-searches k/lossMul/par
```

Every falsification arm was run and goes red (both suites green without one). meta_test covers: ladder
monotonicity (rank in rating, rating in rank, delta in place, no negative rating, league thresholds,
hysteresis), the rank curve (strong player 58–84 wins to top 100, never-top-3 stalls 800–6,000), name
uniqueness over 30 neighbours at five depths, roster distinctness, hash avalanche, daily determinism and UTC
boundaries, login cycle maths, 4,000 random economy ops never leaving whole non-negative coins, save
migration/round trip/`savedAt`, and one full `applyMatch` path. The "slight" arms are deliberately barely wrong
(k 10 → 7, a 0.2 loss multiplier sign flip, one duplicated rank key) and still go red; `curve-slight` passed
at first, so the curve window was tightened until it didn't.

## Ladder tuning (`node tools/ladder_tune.mjs`, 200 careers per model)

Constants: population 287,340, span 5,000 pts, k 10, lossMul 1, win bonus 4, gain cap 60, loss cap 40,
par by log10(rank) `[[5.46,6.3],[4.3,5.7],[3.3,5.6],[2,2.7],[1,2],[0,1.6]]`.

```
model         top100%  wins→top100 (p25/med/p75)  matches  rank@50     @100     @200     @400     @800   final p10/p50/p90
strong          100%              63/71/82         208     4,587      339      123      105      106   82/109/148
good              0%                     —       never    15,213    1,576      450      423      383   290/421/552
never-top3        0%                     —       never   100,732   48,229   21,040    6,927    2,947   1,600/2,052/3,291
weak              0%                     —       never   130,499   78,146   42,639   27,812   23,978   12,133/24,099/42,426
```

Models (placement weights 1st..8th, Bronze → Legend): strong 42/20/14/9/6/4/3/2 → 30/20/15/12/9/7/4/3;
never-top-3 0/0/0/34/28/18/12/8 → 0/0/0/26/26/20/16/12. Strong reaches the top 100 in a median **71 wins**
(~208 matches); never-top-3 **stalls around #2,000**. League thresholds in points: Silver 186, Gold 420,
Platinum 696, Diamond 1,060, Master 1,612, Champion 2,252, Legend 3,168.

## Leagues are the difficulty curve

`botProfile`: skill 0.34 → 0.90, aggression ×0.9 → ×1.15, **throttle 0.80 → 1.00** (bots steer at that
fraction of full stick; +0.08 when fleeing). Skill and aggression alone did nothing measurable (the auto-player
placed 4.38 in Bronze and 4.00 in Legend: more aggressive bots just eat each other), so the throttle is the
real lever. The `?auto=1` bot (skill 0.8) as the player, 24 matches each:

| rating | league | mean place | top-3 | final count |
|---|---|---|---|---|
| 0 | Bronze | 1.79 | 88 % | 962 |
| 700 | Platinum | 2.92 | 71 % | 663 |
| 1600 | Diamond | 3.67 | 50 % | 468 |
| 4000 | Legend | 4.63 | 33 % | 347 |

sim_test asserts Legend placement is at least one place worse than Bronze (`--break=league` flattens the
profiles and fails it).

Human-feeling bots (2 per lobby): occasionally hesitate (0.25–0.85 s at 15 % stick, never while fleeing),
sometimes switch to a good second-choice target, and emote (hello at the start, brag on an absorb, "noo"
when absorbed, crown on taking the lead, gg at the end; at most one per 9 s per bot). sim_test checks that
sim-online rosters at Bronze, Diamond and Legend never get stuck, travel ≥ 300 m and don't jitter.

## Bot retune (M1 item 4)

Wanderer persona: greed 1.1, pickup 0.9, fear 1.3, courage 0.9, wander 0.35 (was 1.0), skill 0.55.
Comeback: respawn at max(5, 12 % of the other crowds' mean size) and +2.5 m reach while under 25 % of the leader.
Real map, 24 matches (`node tools/sim_test.mjs`):

```
persona        mean  median  best  kills deaths  wins
opportunist*    497     431   550    0.8    0.1     5
coward          473     401   518    0.1    0.2     4
sprinter        441     337   508    0.7    0.3     6
opportunist     389   329.5   447    0.6    0.5     2
wanderer        356   288.5   446    0.5    0.5     3      (was 70)
collector       321   241.5   369    0.2    0.7     3
hunter          232   193.5   288    0.5    0.7     0
bully           208   175.5   286    0.3    0.8     1
winner median 1001; last place at the end ~60 (was ~20); elims 3.8, lead changes 10.5 per match
```

Stub map: lowest persona bully 224, winner median 712.

## Economy numbers

| Source | Coins | XP |
|---|---|---|
| Placement 1st..8th | 50, 35, 26, 20, 15, 12, 10, 8 | 30 + (9 − place)·8 |
| Each crowd absorbed | 8 | 10 |
| Peak crowd | 1 per 40 people, max 40 | 1 per 25, max 60 |
| First win of the day | 120 | 100 |
| Daily challenge | 150 + 50·tier (150–300) | 80 + 30·tier |
| Level-up to level L | 40 + 10·L | |
| Login calendar | 40, 60, 80, 120, 160, 200, 400 | |
| Leaving a match | 0 | 10 |

Level n needs 120 + 30·(n − 1) XP. A typical mid-table match pays ~30–60 coins; a first win of the day with
a completed challenge paid 582 in a test run. Shop: colours 250 (the 7 team colours) to 1,500 (Ultraviolet);
plates 400–1,500; badges 400–900; emotes 300–800; toast styles 500–900. Picking a locker colour makes the
nearest team colour sit out, so no bot shares your colour.

Daily challenge kinds: finish with 300–600, absorb 2–5 crowds (day total), hold the crown 15–45 s in one
match, top-3 2–4 times, recruit 600–1,500 (day total), win 1–2, peak 400–700.

## M1 loose ends

1. `setCameraMode('showcase')` before the attract `setCrowds`, `'follow'` before the match `setCrowds`;
   crown clearance from `renderer.crownTop()` with the old constant as the fallback.
2. Pause / autopilot as above.
3. Portrait HUD: leaderboard top 3 + you (`CONFIG.UI.leaderboardRowsPortrait`), 12.4em wide, minimap 6.6em
   tucked under it. Landscape minimap 7em at 82 % opacity (R item 12). Panel height follows `--rows`;
   measured slack under the last row 3–5 px in all three layouts (R item 13).
4. Bots retuned (above).
5. First-match hints: "Drag anywhere to move" (until you drag or 8 s), "Sweep up the grey people" (until
   +20 or 7 s), "Bigger crowds absorb smaller ones. Run from big, chase small!" (when a bigger crowd comes
   within 30 m, or at 30 s). Pointer-events none; `tutorialDone` saved after the first match.

Also from lane R wave 2: count pills, floaters and emotes scale 1 → 0.78 with the viewport-normalised
pixels per metre at your crowd (R item 9); the HUD draws no world-space pickup markers (item 10). Lead
toasts are suppressed in the first 8 s of play (a spurious "LOST THE LEAD" at 1:59).

## Verified in headless Chrome (`cdp start --port 9282 -- --use-angle=metal`, server :8762)

All taps are `Input.dispatchTouchEvent`, each checked with `elementFromPoint` first.

- Menu → PLAY → lobby (players join, MATCH FOUND) → match → `setAuto(true)` + `stepSeconds` → results with
  payouts → MENU, at 390×844, 844×390 and 1440×900. Rating, coins, XP and stats in `localStorage` survive a reload.
- Every sheet opened from the menu and closed with the X; backdrop tap closes; Daily claim pays and steps the
  calendar; Locker buy (two taps) of Mint colour, Neon plate and Jewel badge, re-equip, reload: the next
  practice match is mint (cyan team sat out), with the neon row and jewel pill.
- A touch drag moved the crowd 17.5 m. Practice pause froze sim time and resumed. Online: a simulated tab hide
  turned autopilot on, the return caught the sim up and showed "You were away 3 s…". Pause button in online →
  autopilot; Leave two-tap → LEFT MATCH, rating 236 → 218, matches +1.
- Promotion: rating 180 + a win → "PROMOTED TO SILVER" banner, level 1 → 3 with two level-up rows.
- Settings: left-handed mirror class and keep-moving persisted across reload; Reset progress (in-sheet confirm)
  zeroed coins/rating and kept settings.
- Zero console errors and zero `__game.errors` on the final runs. (An earlier run caught a ground-shader
  compile error in lane R's in-progress code, `inMap` used before declaration; it was gone in later runs.)
- Screenshots looked at and fixed: buttons not inheriting font size (desktop chips tiny), desktop results
  overflowing (two-column results in all landscape), lobby flags showing before a player joined, ladder sheet
  scrolling its own header away, the XP track invisible, near-duplicate names in one lobby. Final set:
  `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g2shots/F_*`
  (menu, lobby, match early/mid, results, locker, ladder, daily, settings, profile × p/l/d) plus
  `results_promo_p`, `autopilot_p`, `pause_p`, `lefty_p`, `locker2_*`.

Chrome on 9282 and the server on 8762 are stopped.

## Known gaps

- Audio still not listened to; music and effects toggles verified only as state.
- Emote bubbles ride on the count pill, so a human-feeling bot's emote is dropped while its crowd is off
  screen (you see fewer than are sent). A 3D bubble is in `G_requests.md`.
- Ladder neighbours often show the **same rating** (about 57 players per point at Platinum depth). That is the
  curve being honest, but a column of "928" may read oddly; a decimal or a hidden tiebreak would hide it.
- The rating sim models placement odds, not real humans. The first real-device players will show whether
  Bronze (the auto bot wins ~half) is too soft.
- Catch-up after a long hidden tab runs up to 120 s of sim in one go (~0.2 s on this Mac; untested on a phone).
- Countdown beeps/hints are not localised; the UTC day roll is not shown to the player except in the Daily sheet.
- No cloud save yet: `savedAt` and the single versioned key are ready for `/lib/auth/cloud.js` to adopt.
- The leaderboard rows briefly overlap while two close crowds swap places (spring transition); cosmetic.
