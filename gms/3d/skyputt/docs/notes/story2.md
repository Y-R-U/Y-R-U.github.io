# story2 — notes (back nine + story chapters 2–6)

Owner: `story2` agent. Status: **done** — back nine playable (map tabs, rounds), story chapters 2–6 playable,
all tests pass. Nothing committed (manager commits).

## Built

### Back nine (Sky Isles holes 10–18)
`js/course/holes/sky10..sky18.js`, theme-independent data (D6), only existing features. Sky Isles is now
**one 18-hole course** with `nines` (`front` 0–9, `back` 9–18) in `js/course/holes/index.js` (+ `nineOf()`):

| # | id | name | par | features |
|---|---|---|---|---|
| 10 | sky10 | Ice Rink | 3 | long ice patch over two bends, bumper on the ice, green rises to catch you |
| 11 | sky11 | Double Loop | 3 | boost pad → loop → boost pad → loop |
| 12 | sky12 | Corkscrew | 3 | high tee, glass tube spiralling one full turn down, bumper, sliding block guarding the green; void under the spiral |
| 13 | sky13 | The Fork | 4 | stone divider (static `block`) splits the fairway: boost lane vs sand + mover lane; bend with an open outer edge and a sand run-off |
| 14 | sky14 | Island Hop | 3 | two ramps over two drops, boost pad before the second, longer leap; `voids` over both drops |
| 15 | sky15 | Switchback | 3 | descending S with banked corners (±12°), sticky patch on the outside |
| 16 | sky16 | Pinball | 3 | 2.4 m plaza with six bumpers in a diamond, funnel, sand guarding the cup |
| 17 | sky17 | Twin Mills | 3 | two 3-blade windmills (0.9 / 1.2 rad/s), kink between, narrow straight before the second (gap 0.42) |
| 18 | sky18 | Sky Crown | 5 | S-bend, windmill, loop, two sliding blocks on the causeway, bumper-guarded green |

Back nine par 30 (front 28, total 58).

### Menus / rounds (18 holes, one nine per round)
- `Round` takes `end` (exclusive hole index); a `round` plays `startIndex .. end-1`. Round bonus (ladder +
  coins) when the round started at a nine's first hole and played to its end. Scorecard title says the nine.
- Title **Play front nine** = holes 1–9. Course map has **Front nine / Back nine** tabs (the map opens on the
  nine you're playing); **Play back nine** is disabled with a note until hole 9 is finished. Holes unlock in
  order across all 18 (`store.unlockedCount` unchanged), `?hole=10..18` works, HUD shows `10/18`.

### Story chapters 2–6
`js/story/data/ch2_club.js … ch6_legends.js` (pure data, same shape as ch1).

| # | tour | theme | rival (personality, skill) | lessons | tournament | finish |
|---|---|---|---|---|---|---|
| 1 | Muni | player's | Careful Carl (careful, 0.36) | aim, Long Sight, Mulligan | Muni Open, 6 holes, top 3 of 8 | Amateur |
| 2 | Club Tour | sky | Lucky Lou (lucky, 0.46) | ice, Magnet Cup, Steady Hands | Cloudbury Club Championship, holes 10–15, top 3 of 8 | Club Player |
| 3 | Regional Cup | frost | Remy Banks (banks, 0.56) | banked corners, Sticky Ball | Regional Cup, back nine, top 3 of 10 | Semi-pro |
| 4 | National Tour | spooky | Big Bertha (power, 0.66) | Power Tee, Bumper Guard | National Championship, front nine, top 3 of 10 | Pro |
| 5 | World Tour | per event (sky / frost / spooky) | Sterling Vance "The Pro" (pro, 0.74) | Ghost Ball, Double Loop clinic | World Tour Final, 9 mixed holes, top 3 of 12 | trophy only (stays Pro) |
| 6 | Legends | sky | Old Mags (mags, 0.84) — the final match, after the Legends Cup | Mags' last lesson (hole 18) | Legends Cup, 9 mixed holes, top 3 of 10 | Legend |

- Every tour: lessons, star-target rounds, one rival head-to-head (4 holes, ghost replay), a tournament with a
  leaderboard, dialogue cards (new speakers Lou, Banks, Bertha, Sterling Vance, announcer Sunny Vale; you speak
  once in ch6). Rival rewards = coins + a helper pack + a cosmetic (Carl: Lime ball, Lou: Polka, Banks:
  Checkers, Bertha: Ember trail, The Pro: Gold ball, Mags: Stardust trail). An owned cosmetic pays half its
  price in coins instead.
- **Gating:** a tour opens when the previous tour's rival is beaten (or the tour is finished). Rank =
  the best `rankOnFinish` of the finished tours (World Tour has none → trophy card instead of a rank card).
- Golfers: `js/story/data/golfers.js` has an entry per tour for returning characters (`lou_club`, `banks_reg`,
  `bertha_nat`, `pro_world`, `mags_legend`, …) so earlier events keep their skills; all ≤ 0.9 (D14).
- Career map: only the current tour is unfolded (others fold with Show/Hide); locked tours say who to beat.
  Each tour's intro plays the first time you open one of its events. Mags' tip follows the current tour.
- Themes: `startEvent` gets `theme` (event or chapter); main.js loads it for the round and restores the
  player's theme afterwards (like event rounds).

### Fixes from Aaron's phone test of chapter 1 (2026-11-03)
- Ch1 tips said Long Sight / Mulligan were "bottom right". The helper tray is a vertical column on the right
  (left with the left-handed HUD) in both portrait and landscape, Long Sight first, Mulligan second. Tips now
  say "Long Sight (the arrow, top of the helper column)" / "Mulligan (the undo arrow, second in the helper
  column)"; ch2–6 tips name the helper without a position. story_test guards against corner wording.
- `use:` lessons still pass on a hole in one, but `checkGoal` now returns `aceUse`; the result card says
  "A hole in one! No Mulligan needed — that counts." and Mags opens the after-dialogue with the same. A failed
  `use:` lesson says how: "didn't use Mulligan (hit a shot, then tap Mulligan to take it back)", and Mags'
  lose line explains it (lessons without their own `lose` lines).

## Files
New: `js/course/holes/sky10..18.js`, `js/story/data/ch2_club.js ch3_regional.js ch4_national.js ch5_world.js
ch6_legends.js`, this file.
Changed: `js/course/holes/index.js` (18 holes + nines), `js/game/play.js` (`end` option, round bonus per
nine, scorecard title), `js/app/main.js` (`startRound(i, mode, end)`, nine callback, career theme),
`js/app/menus.js` (nine tabs on the map), `css/app.css` (tabs, tour fold), `js/story/career.js`
(gating, rank, intros per tour, theme, cosmetic rewards, folding, tips), `js/story/data/{chapters,characters,golfers,ch1_muni}.js`,
`js/meta/ladder.js` (HARD bonus for the back nine), `js/ai/calib.js` (regenerated with the back nine),
`tools/ai_calib.mjs` (`--merge`), `tools/story_test.mjs`, `tools/meta_test.mjs` (economy per nine),
`tools/shots_cdp.mjs` (`overview` and `career` modes).

## How to test
```
node tools/{physics,store,story,events,meta}_test.mjs
node tools/holes_test.mjs [sky13] [--human=8]
~/.claude/bin/cdp start --port 9516
node tools/shots_cdp.mjs overview --port=9516 [--holes=10,11] [--themes=sky,spooky,frost] --out=DIR
node tools/shots_cdp.mjs career --port=9516 --chapter=2 [--only=club-l1,club-rival] [--holes1] [--open] --out=DIR
```

`node tools/story_test.mjs --difficulty [--seeds=8]` prints the difficulty table below (slow: real AI full sims).

## Difficulty

### Holes (`holes_test --human=16` back nine, `--human=8` front; planner + 2.5° aim / 5% power noise, avg vs par)
Front: 1 +0.4 · 2 +1.0 · 3 −0.5 · 4 0.0 · 5 −0.25 · 6 +0.4 · 7 +1.25 · 8 −0.6 · 9 +0.1..+1.0 (noisy).
Back: **10 −0.44 · 11 −0.38 · 12 +0.25 · 13 −0.81 (par 4, a breather) · 14 0.0 · 15 −0.06 · 16 +0.31 · 17 +1.75 · 18 +1.5**.
Every hole: the greedy planner holes out ≤ par (`holes_test` 18/18 ok). Ladder `HARD` bonus added for 12/14/16/17/18.
AI (ai_test back nine, js/ai/calib.js merged): Twin Mills and Sky Crown are the AI's hardest holes too
(+2.3 / +2.4 at skill 0.5); the AI is relatively strong on 11/13/14.

### Story (`story_test --difficulty --seeds=8`): score you need vs par to pass (rival: beat their total; tournament: goal place)
| event | holes | need ≤ (avg) | humanish bot |
|---|---|---|---|
| muni-rival (Carl .36) | 4, par 12 | +5.1 | +2.1 |
| muni-open | 6, par 17 | +5.6 | +1.0 |
| club-rival (Lou .46) | 4, par 12 | +2.9 | +0.7 |
| club-champ | 6, par 18 | +4.5 | +1.6 |
| reg-rival (Banks .56) | 4, par 13 | +1.3 | +1.9 |
| reg-cup | 9, par 30 | +3.0 | +2.1 |
| nat-rival (Bertha .66) | 4, par 13 | +1.8 | +1.0 |
| nat-champ | 9, par 28 | +3.5 | +2.6 |
| world-rival (Pro .74) | 4, par 16 | +1.1 | +3.3 |
| world-final | 9, par 32 | +0.9 | +4.9 |
| leg-cup | 9, par 31 | +1.3 | +4.8 |
| leg-final (Mags .84, measured at .86) | 4, par 14 | −0.9 | +4.0 |
Rival matches are 4 holes, so single results swing ±4. Ch1–4 are winnable by a practised player without
helpers; World Tour and Legends expect birdies and helper use (Magnet, Long Sight, Steady Hands, Mulligan) —
the late-chapter holes (7, 9, 17, 18) are where the noisy bot loses most, real players may do better.

## Test results (2026-11-03)
- physics 25/25, store, story (incl. chapters 2–6 data, ramp, D14, gating, ranks, old-save compat, cosmetic
  grant), events, meta: all pass. `holes_test`: 18/18 ok.
- Browser: `overview` all 9 back-nine holes × sky / spooky / frost, no console errors; `nines` (tabs, lock
  note, Play back nine → 10/18 with `end` 18, round bonus on hole 18, "Sky Isles · Back nine" scorecard);
  `career --holes1` for chapters 2–6: every event opens, tour intros + before dialogue play, lessons arm their
  helper, rival / field warm-up cards show, themes switch per chapter/event (frost, spooky, mixed World Tour)
  and the player's theme is restored; no console errors.

## Known issues
- Spooky theme ignores `info.voids` (sky and frost honour them), so Island Hop's drops in spooky read as
  steps in one long island, and the Corkscrew spiral passes over spooky ground. Fix belongs in
  js/themes/spooky/island.js (copy sky's `courseFrames` void pull-back).
- In sky, Island Hop's first drop is short (0.7 m): from high angles the tee island's rounded end overlaps the
  next island visually; it reads as a step-down from the tee.
- ai_test's "Banks bounces more than The Pro" check is ×1.12 on the back nine alone (needs ×1.15); the
  back nine has walls everywhere, so everyone banks. Front-nine runs still pass.
- Full chapter 2–6 playthroughs to the rank card were not run headless (the Muni one took ~26 min);
  `career --chapter=N` without `--holes1` does it if wanted.
- Ghost replay timing vs obstacles is unchanged (engine note), visible on Twin Mills / Sky Crown rivals.
- The title "Play front nine" button stays front-only; the back nine is reached from the course map.

## Proposals for DECISIONS
- P1: Sky Isles is one 18-hole course split into nines (`nines`); a round = one nine, unlock order spans all 18.
- P2: A tour unlocks when the previous tour's rival is beaten (tournament optional for progress, needed
  for the rank). World Tour grants a trophy, not a rank (ranks stay Nobody → … → Legend over 6 tours).
- P3: Story difficulty ramp (D14 extension): rival skill .36 / .46 / .56 / .66 / .74 / .84; tournament
  fields' mean rises per tour, all ≤ .84 except the rival.
- P4: Spooky theme should honour `info.voids` like sky / frost.
