# meta — notes (M5 "Ladder and shop")

Owner: `meta` agent. Status: **M5 done**: weekly ladder with tiers, coin income + shop (helpers,
ball skins, trails), seeded chests with an opening animation, and six new helpers working in the physics.
All tests pass; checked in headless Chrome at 412x915 and 1440x900.

## Built

### Weekly ladder (`js/meta/ladder.js`, pure)
- The week runs **Monday 00:00 local → next Monday 00:00** (`weekKey(now)` = that Monday's `YYYY-MM-DD`).
  The clock is `nowFrom()` from events.js, so **`?eventdate=YYYY-MM-DD`** pins it (noon of that day) for tests.
- 6 tiers: Bronze → Silver → Gold → Platinum → Diamond → Legend. Board = **20** (19 bots + you).
  **Top 4 promote, bottom 4 relegate** (no relegation from Bronze, no promotion from Legend).
- Bots reuse the events ladder code: each (week, tier) is an events-style pseudo event
  (`weekBoard`) fed to `ladderPlayers` / `botPoints` (named bots whose points rise with the date, the
  same on every device, frozen at week end), × a per-tier `scale` and `pace`. Tuned so the promotion line
  is about **2 / 4 / 6 / 9 / 13** par-ish front-nine rounds a week for Bronze / Silver / Gold / Platinum /
  Diamond (`meta_test` prints it). D12: the more you play the higher you go.
- **Points per finished hole, any mode** (course, single hole, career, events):
  10 base (5 if picked up) · +8 per stroke under par · +10 for an ace · +3 per star · +3 per par above 2 ·
  `HARD` bonus from the measured difficulty (hole 7 and 9 +6, hole 1 +3, …) · × streak (+10% per day in a
  row, max +50%). A finished round of 6+ holes adds 5 per hole. An all-birdie front nine ≈ 350 points.
- **Streak** = local days played in a row (`touchStreak`); a missed day resets it.
- **Week end** (`settle`, run whenever the ladder is read): rank against the frozen board, move tier,
  queue a result `{ week, tier, rank, points, move, reward, claimed }`. Rewards: the tier's coins
  (60 / 100 / 150 / 220 / 320 / 450) + a silver chest (top 10) or wooden one; promoted = coins ×1.5 + a
  golden chest; relegated = half coins, no chest. **A week you didn't play changes nothing** (no reward,
  no relegation). If the clock goes back, nothing is re-settled. Claims are one-shot (`claimed` saved).
- **Screen** (`js/meta/screens.js` → `#ladder`): unclaimed week results with Claim, tier badge (SVG shield,
  pips, crown for Legend), points / rank / streak / holes, zones, the table (top 3, you ±3, last) with
  dashed promotion/relegation cut lines, how points work, and every tier's rewards.
  Title tile shows the tier badge, points and countdown (or "Reward ready!").

### Economy (`js/meta/economy.js`, pure) — income measured
- Per hole: **2 coins per star, +5 for an ace**; a finished round of 6+ holes **+2 per hole**; crystals
  pay 5 each the first time only (unchanged).
- **A 3-star front nine pays 72 coins** (+5 per ace, so ~85 for a strong round). The first clean pass
  of the front nine also pays 135 from its 27 crystals, so ≈ 210. (`meta_test` computes it; the browser
  `play` run confirms it, see test results.)
- Prices against ~75 coins a round: helpers 30–60 (under one round), colour balls 120, patterned
  220–400, Glow Ball 900 (~13 rounds), Gold Ball 1500 (~21 rounds), trails 250–750.
- Catalogue: balls Classic (free), Cherry, Ocean, Lime, Candy Swirl, Polka, Checkers, Starry Night, Glow
  Ball, Gold Ball; trails none, Streak, Ember, Rainbow, Stardust (sparkles).

### Chests
- Earned from **ladder tier rewards**, **event goals / final ranks** (`chest: 'silver'|'gold'|'wood'` in
  the reward objects of spooky_open.js and frost_fair.js), and **every 3rd three-star hole** (wooden, max
  3 a day so hole 1 can't be farmed forever).
- Contents = `rollChest(seed, serial, kind, owned)`: a pure function of a per-save random seed and the
  chest's serial number. `openChest()` grants and saves (serial++) **before** the animation, so reloading
  can never reroll a chest or lose the prize. Wood 15–40 coins + 1–2 helpers, silver 40–90 + 2–3, gold
  100–200 + 3–4 and a 25% chance of an unowned ball/trail (price ≤ 600).
- Animation (`#chest`): the chest shakes, opens on tap (or after 1.6 s): lid swings, light rays spin,
  confetti burst, the prizes pop out one by one with star / coin sounds, then Collect.

### Shop (`#shop`)
Tabs Chests (badge with the count) / Helpers (icon, owned count, description, Buy) / Balls / Trails
(previews drawn from the same canvas as the in-game texture). Cosmetics take two taps to buy (the first
asks "Buy for N?") and are equipped at once; owned ones equip on tap. Title tile shows coins + chest badge.

### Cosmetics in game (`js/meta/cosmetics.js`)
- `makeSkinnedBall(id)`: canvas equirect texture per pattern (stripe, swirl, dots, checker, stars,
  plain); Glow Ball = emissive + an additive halo sprite; Gold Ball = metalness 1 (uses the theme's
  environment map). `disposeBall` frees the halo too.
- `Trail`: a ribbon of the last ~48 positions (vertex RGBA, additive, tapering, 0.75 s life), only grows
  while the ball rolls; Stardust adds 70 sparkle points. 1–2 draw calls, no allocation per frame.

### Helpers (PLAN 2.4) — `js/meta/helpers.js` (defs, icons, tooltips), effects in physics + play.js
All one-shot helpers: **tap to arm (uses one), tap again before the shot to take it back (refunded)**;
spent when the shot ends (rest / cup / out); refunded if never shot (restart, next hole, quit). The guide
line traces with the armed helpers (they live on the ball, and `Ball.clone()` copies them).
- **Magnet Cup** — `ball.mods.magnet`: inside `MAGNET_R` 0.5 m of the cup, a pull toward it (2.6 m/s²,
  stronger closer in) and damping of the sideways part. meta_test: 20/20 off-line putts drop, 0 without.
- **Steady Hands** — `world.clock = 0.3`: the round advances `world.time` by `DT * clock`, so every
  kinematic pose (a pure function of time) slows; surface velocities are scaled by the clock too.
  `simulateShot` / `traceGuide` honour the clock. Deterministic (tested).
- **Sticky Ball** — `mods.sticky`: non-floor contacts keep 30% of their restitution (wall bounce 1.99 → 0.59 m/s).
- **Power Tee** — `aim.powerMul = 1.25` (max 8 m/s, still under the 10 m/s no-tunnelling cap).
- **Bumper Guard** — the builder now emits `hole.guards` `{ tris, quads }`: a 12 cm rail on every open
  edge (skipped where floor continues just outside: hole 7's plank junctions stay open) and on every wall
  top (so a hop can't leave the track). `World` takes `guards`, checks them only for a ball with
  `mods.guard` (contact kind 5, wall material). A glowing see-through mesh shows them while armed.
- **Ghost Ball** — `mods.ghost` 1 → 2 → 3: the first kinematic obstacle touched is passed through; it
  stays "passing" while the ball is inside that body's reach, then it's spent and later obstacles collide.
  A windmill's blades share a `group`, so they count as one obstacle. Static blocks / walls are not obstacles.
- **Tray**: built from `HELPERS`; Long Sight + Mulligan always shown, others when you hold one or it is
  armed (`ON` label + glow). It scrolls (vertical, hidden scrollbar) when taller than the space. Tooltips:
  hover (mouse), long-press (touch, doesn't use it), and a short tip on every tap. Unusable buttons get
  `.off` (not `disabled`) so their tip still shows. Ids `#h-sight` / `#h-mull` kept; others `#h-<id>`.
- New saves start with 1 of each new helper (3 Long Sight, 3 Mulligan as before). The 3-star hole reward
  now gives whichever helper you hold fewest of (all eight).

### Hole card
Adds "+N ladder pts", the streak, "Round complete: +pts · +coins" on the last hole of a full round, and
"Chest earned!" with a chest icon. Coins on the card = crystals + star coins.

## Files
New: `js/meta/{helpers,economy,ladder,meta,cosmetics,screens}.js`, `tools/meta_test.mjs`, this file.
Changed: `js/engine/physics.js` (ball.mods, clock, guards, magnet, sticky, ghost), `js/engine/sim.js`
(clock, guard hits), `js/course/builder.js` (guard rails), `js/course/features.js` (windmill blade
`group`), `js/game/play.js` (helpers, meta, cosmetics), `js/game/hud.js` (tray, tooltips, card lines,
`chestIcon`), `js/game/aim.js` (`powerMul`), `js/app/{main,store}.js`, `index.html`, `css/app.css`,
`js/events/{events.js (export rng), screen.js (chests in rewards), data/*.js (chest rewards)}`,
`js/story/career.js` (helper names), `tools/shots_cdp.mjs` (`meta` mode).
Also (coordinator request): `js/app/menus.js` THEME_LIST gains `frost` (Frost Fair), and
`js/events/data/frost_fair.js` now has `theme: 'frost'` (themeWanted, its TODO and the "skin coming soon"
note / FROST_SWATCH special case in events/screen.js removed).
Not touched: `js/themes/frost/`, `js/ai/`.

## How to test
```
node tools/meta_test.mjs            # ladder, economy, chests, shop, all six helpers in the physics
node tools/{physics,store,story,events,holes}_test.mjs
~/.claude/bin/cdp start --port 9512
node tools/shots_cdp.mjs meta [--sizes=p,l] --out=DIR   # title, ladder, shop tabs, chest, tray + tooltip, armed helpers, ball/trail, week rollover + claim
```
URL: `?eventdate=2026-11-10` to jump weeks (play on `?eventdate=2026-11-04` first). Debug:
`__skyputt.meta` (`ladder()`, `onHole()`, `openChest()`, `buy()`), `__skyputt.metaScreens`.

## Test results (2026-11-02)
- meta_test: all pass (see the file for the list). physics 25/25, store, story, events, holes all pass.
- Browser `meta` run, both sizes: no console errors; ladder 4/20 mid-week; golden chest opened
  (+195 coins, 4 helpers); glow ball bought + equipped; Bumper Guard + Ghost armed on hole 7
  (rails visible, ghost ball translucent), spent after the shot; Nov 4 → Nov 10 rollover: "finished 2/20,
  promoted to Silver", Claim gave 90 coins + a golden chest, tier = Silver.
- Browser `play` run (fresh save, front nine by touch drags, 412x915), measured: 1 1 2 1 1 1 2 3 2 (14 vs par 28),
  card coins 26 / 21 / 21 / 21 / 16 / 11 / 11 / 4 / 29 = **160 coins on a first pass** (stars + aces + round
  bonus + the crystals the bot happened to collect), **425 ladder points**, 2 star chests (holes 3 and 6).
  Every card showed ladder points; the last one showed "Round complete: +45 pts · +18". No console errors.
- Title with the third theme chip (Frost Fair) fits at 412 px; the longer names wrap onto two lines.

## Known issues / notes
- Ghost AI replays (js/ai/ghost.js) don't know about Steady Hands; they already aren't synced to the
  obstacle clock (engine note). No js/ai change needed: the AI never sets `ball.mods` and its worlds
  keep `clock = 1`, so its sims are bit-identical to before.
- A tooltip appears on every tap as well as on long-press; if that feels noisy on phones, keep only long-press.
- The ladder bots don't know your tier history; each (week, tier) board is fresh.
- Storage: `store.data.{cosmetics, chests, ladder}` are added to the v1 save (old saves get defaults).

## Proposals for DECISIONS
- P1 Weekly ladder: Monday 00:00 local, 20-player tier boards, top 4 up / bottom 4 down, idle weeks
  neither reward nor relegate.
- P2 Income: 2 coins per star + 5 per ace + 2 per hole for a full round; crystals once. Prices pinned to
  "rounds of play" (helper < 1, cosmetics 2–21).
- P3 Chests are seeded per save + serial and granted before the animation (no reroll by reloading).
- P4 One-shot helpers can be taken back before shooting (refund), spent once the shot is taken.
