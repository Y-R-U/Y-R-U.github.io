# courses3 — notes (Sugar Summit, a fourth course)

Owner: `courses3` agent. Status: **done** (see Test results). Nothing committed (manager commits).

## Sugar Summit (9 holes, par 30)
`js/course/holes/sugar1..sugar9.js`, theme-independent data (D6), only existing pieces and features — no engine or
theme changes. Registered as `COURSES.sugar` (`theme: 'candy'`, the look it was designed for). Theme: climbing a
candy mountain — uphill play where a short putt rolls back to your feet, banked switchbacks, boost pads as "sugar
rush" lanes, loops, sticky "caramel", ice "glaze", bumper "gumdrop" fields, a branching shortcut, and a spiral tube
descent from the top as the finale.

| # | id | name | par | idea |
|---|---|---|---|---|
| 1 | sugar1 | Base Camp | 2 | gentle climb round a soft bend; a gumdrop mid-climb, one on the outside of the bend to bank off |
| 2 | sugar2 | Sugar Rush | 3 | 21% ramp up a shoulder; a narrow sugar-rush (boost) lane up the middle carries you over, off it you need a firm putt or roll back |
| 3 | sugar3 | Caramel Switchbacks | 4 | three legs zig-zag up (0 → 0.64 m) with two banked r 0.9 m hairpins; caramel on the inside of each hairpin |
| 4 | sugar4 | Gumdrop Garden | 3 | 2.4 m meadow climbing between six staggered gumdrops, funnel to a green with a caramel apron |
| 5 | sugar5 | Glazed Ridge | 3 | narrow banked S of ice climbing to the green; too soft and the ball slides all the way back |
| 6 | sugar6 | Lollipop Loops | 3 | two loops back to back (right shift, then left), a boost before each, short climb to the green |
| 7 | sugar7 | Frosting Fork | 4 | long climb round the shelf (gumdrop chicane, caramel bend) vs a wall-less candy-cane bridge that rears up over the void to the green |
| 8 | sugar8 | Peppermint Mill | 4 | two steep sugar-cube steps, then a bend along the summit ridge to a windmill (cupcake mill in candy); the bend keeps balls bounced off the mill on the ridge |
| 9 | sugar9 | Spiral Descent | 4 | finale from the top (y 1.8): glass tube corkscrews two full turns (r 1 m) down round the peak over a void, glazed run, caramel basin, boost lane into a loop, green ringed by four gumdrops |

Authoring notes:
- Slopes over ~10% don't hold a resting ball on grass (roll 0.072 vs 5/7·sin θ); on ice anything over ~1% rolls back.
  That is the uphill mechanic here — every steep stretch has a flat landing below it so a short ball comes back to rest.
- Hairpins: legs 1.8 m apart (r 0.9 m, 5 Catmull-Rom points per hairpin). At 1.5 m apart (r 0.75) the inner walls
  folded over themselves and drew crossed wall ends. A 12° bank on the exit hairpin launched full-power balls over the
  outer wall (OOB) — keep exit-side banks ≤ 6°.
- The spiral's points are generated in the file (8 per turn, 0.08 m drop per point, 0.64 m between turns).
- 3 pickups per hole (events cap currency goals by pickups).

### Difficulty
`node tools/holes_test.mjs sugarN --human=8` (avg vs par; planner = greedy holes_test planner):

| hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | course |
|---|---|---|---|---|---|---|---|---|---|---|
| par | 2 | 3 | 4 | 3 | 3 | 3 | 4 | 4 | 4 | 30 |
| human-ish ×8 | +0.38 | −0.13 | +0.25 | −0.38 | −0.13 | +0.38 | −0.63 | +0.13 | +0.13 | **≈ 0.0** |
| planner | 1 | 1 | 2 | 1 | 1 | 1 | 2 | 1 | 2 | |

Friendly-to-medium: about Festival Isles (≈ +0.1/hole), well below Hollow Woods (+0.46/hole). Tuning history:
Peppermint Mill started at +1.88 as a par 3 (mill right at the top of a straight step; blade bounces rolled the
ball down both steps) → summit bend added, mill moved along the ridge, par 4. Caramel Switchbacks measured +1.0..+1.25
at par 3 (the tee shot reaches hairpin 2 at best, so it plays as three shots + putt) → par 4. Frosting Fork reads
easy (−0.63) because the bot takes the bridge well; kept as the reward for the risk. Spiral Descent: a full-power
tee shot can ride the tube, glaze, basin, boost and loop all the way to the green — that's the spectacle; most
balls stop in the caramel basin. Ladder `HARD` bonus (js/meta/ladder.js): sugar1 and sugar6 +1.

## Map tab + unlock (pick: Festival Isles hole 9)
- `js/app/main.js`: `courses: [course, COURSES.festival, COURSES.woods, COURSES.sugar]` (tab after Hollow Woods).
- `COURSES.sugar.lockedBy = { hole: 'fest9', course: 'festival', note: 'Finish Festival Isles to open Sugar Summit.' }`.
  Festival is always open and sits at Sugar's difficulty, so finishing it is the natural gate (Woods stays on sky9).
- Five tabs fit at 412 px (checked). `?course=sugar&hole=N` works for dev/test (not gated).

## Online, weekends, daily, events
- `js/net/rooms.js` / `form.js` are generic over `COURSES` (Course select lists Sugar Summit; hole sets runs of 3 /
  random 3 / all 9). Server id regex `^[a-z0-9][a-z0-9_-]{0,31}$` accepts `sugar` / `sugarN`.
- Weekend events (`calendar.js allHoles()`) and the daily pick from every course automatically. Daily drops locked
  courses per player (`courseOpen` handles any `lockedBy`). `tools/daily_test.mjs` updated: the "open" store now
  has `fest9` too, new checks that Sugar Summit is locked until fest9 and its holes only come up once open, and the
  "locked players share the global hole" ratio now excludes every gated course (205/240 = 0.854 vs ≥ 0.85 — close
  to the line; if a future course tips it, lower the threshold or exclude more).
- Candy Carnival (`js/events/data/candy_carnival.js`): Lollipop Loops (sugar6) replaces sky11; still 3 pickups per
  hole (18 lollipops). Only one swap because events_test requires ≥ 1 Sky Isles hole per event (sky16 stays).

## AI
`node tools/ai_test.mjs --course=sugar --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --jobs=9 --json=F` → **all checks
passed** (incl. Banks bounce and Bertha aces, which failed on woods/festival). `ai_calib F --merge` → `js/ai/calib.js`
now covers 45 holes. Per round (par 30) at skill 0.5: Pro −2.35, Professor −2.35, Mags +3.05, Carl +3.15, Lou +4.65,
Banks +9.7, Zoe +9.8, Bertha +11.9; skill 1: Pro −7.35, Professor −7.4. Easier for the AI than Hollow Woods
(Pro +5.0 at 0.5), about Festival.

## Files
New: `js/course/holes/sugar1..sugar9.js`, this file.
Changed: `js/course/holes/index.js` (imports + COURSES.sugar), `js/app/main.js` (one line), `js/meta/ladder.js` (HARD),
`js/events/data/candy_carnival.js` (sky11 → sugar6), `tools/daily_test.mjs` (gated-course checks), `js/ai/calib.js`
(regenerated with `--merge`).

## How to test
```
node tools/{physics,store,story,events,meta,daily}_test.mjs && node tools/holes_test.mjs && node tools/online_test.mjs
node tools/holes_test.mjs sugar3 --human=8
~/.claude/bin/cdp start --port 9570
node tools/shots_cdp.mjs overview --port=9570 --own --course=sugar --holes=1,2,3,4,5,6,7,8,9 --themes=candy,sky,spooky,frost --out=DIR
```
URL: `?course=sugar&hole=9&theme=candy`.

## Test results (2026-11-03)
- `physics` 25/25 · `store`, `story`, `events`, `meta`: all passed · `daily` 74/74.
- `holes_test`: 45/45 ok (18 sky + 9 festival + 9 woods + 9 sugar; planner ≤ par everywhere).
- `online_test`: 28/28 (local :8098 server left running).
- `ai_test --course=sugar`: all checks passed.
Browser (CDP :9570, `--own`): overview tee + overhead of all 9 holes × candy / sky / spooky / frost, no console
errors; close-ups of the spiral and switchbacks in candy. Map: fresh save → Sugar Summit tab locked, 9 tiles locked,
note shown, Play disabled; after fest9 finished → open, hole 1 open, "Play sugar summit" starts sugar1 (HUD 1/9).

## Known issues
- The overhead/chase cameras flatten slopes: Peppermint Mill's steps and Sugar Rush's ramp read as gentle from the
  tee; the climb is clearer in the fly-over and from the side. Steeper ramps would read better but play harsher.
- Spiral Descent's tube is glass, so from the tee it reads as a faint coil; striking from the side (spooky reads best).
- The human-ish bot misses many 10–15 cm putts on the high greens (5–9% power); same on other courses — treat the
  table as relative.
- Rounds play in the player's theme (like Festival / Woods); Sugar Summit is not forced into candy.
- Weekend/daily picks change for not-yet-played days because a course was added (events3 / daily known behaviour).

## Proposals for DECISIONS
- P1: Sugar Summit opens after Festival Isles hole 9 (`lockedBy: fest9`).
- P2 (authoring): steep stretches (>10% grass, >1% ice) need a flat landing below; banks on the exit side of a
  hairpin ≤ 6°; hairpin legs ≥ 1.8 m apart at width 1.0.
