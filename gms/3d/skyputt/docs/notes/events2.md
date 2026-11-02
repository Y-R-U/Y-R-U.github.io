# events2 — notes (Festival Isles + 2027 special events)

Owner: `events2` agent. Status: **done** (see Test results). Nothing committed (manager commits).

## 1. Spooky voids fix
`js/themes/spooky/` now honours `info.voids` and `info.branches` the way sky / frost do:
- `util.js`: `inVoid()` + `distToLines()` (copied from sky).
- `island.js`: `courseFrames(…, voids)` pulls each side's crag edge back out of a void; `buildCourseRock(…, voids)`;
  `buildFoliage(…, voids, branches)` skips shrubs in voids / on branch tracks.
- `env.js`: passes `info.voids` / `info.branches`; the shared `clear(x, z, pad)` test (used by the lava falls,
  jack-o'-lanterns, candles, tee pumpkins, cauldron, graves, dead trees, fences) now also rejects points in a
  void or within 0.5 m of a branch.
Checked by screenshot: Corkscrew (sky12) now spirals over open sky in spooky (it sat on crag before); Island Hop
(sky14) reads the same as sky (the short first drop still looks like a step in every theme — known sky14 issue).

## 2. Festival Isles (9 holes, par 29)
`js/course/holes/fest1..fest9.js`, theme-independent data (D6), only existing features. Registered as
`COURSES.festival` (`js/course/holes/index.js`) — so `holes_test`, `ai_test --course=festival`, online rooms
(the room form shows a Course picker once there are 2 courses) and events all see it.

| # | id | name | par | idea |
|---|---|---|---|---|
| 1 | fest1 | Lantern Lane | 2 | gentle S opener, bumper on the outside of the 2nd bend, sand in the inside corner |
| 2 | fest2 | Three Lanes | 3 | two stone dividers → 3 lanes: boost lane (left), mover-guarded straight (middle), slow sand lane (right) |
| 3 | fest3 | Ferris Slide | 3 | boost pad → loop ("the big wheel") → glass tube snaking down to a lower island green (void under the slide) |
| 4 | fest4 | Stepping Stones | 4 | four platforms, each 0.18 m lower, 0.4 m open gaps; firm putts carry, lazy ones fall (voids on every gap) |
| 5 | fest5 | Bumper Cars | 3 | 2.4 m arena, two blocks sliding across out of step, three bumpers between |
| 6 | fest6 | Tightrope | 4 | fairway swings wide round a drop; a 6 m wall-less plank (branch) cuts straight across: safe arc vs the wire |
| 7 | fest7 | Hilltop Mill | 3 | boost pad up a hill to a six-sail windmill on the crest, green falls away with sand outside |
| 8 | fest8 | Toboggan Run | 3 | icy banked S down the hill (±10°), two bumpers, sticky mat before the green |
| 9 | fest9 | Grand Parade | 4 | 3-sail windmill, bend, boost up a ramp over a drop to a bumper plaza, sliding block before the green |

Difficulty — `node tools/holes_test.mjs festN --human=8` (planner + 2.5° aim / 5% power noise, avg vs par):

| hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| par | 2 | 3 | 3 | 4 | 3 | 4 | 3 | 3 | 4 |
| human-ish ×8 | +0.50 | −0.50 | +0.13 | +0.13 | +0.38 | −0.63 | +0.75 | −0.13 | +0.25 |
| planner (holes_test) | 1 | 1 | 2 | 1 | 1 | 2 | 2 | 1 | 2 |

Mid difficulty: softer than the back nine's 17/18 (+1.5..+1.75), similar to the front nine. Stepping Stones was
+0.5 as a short par 3 but its gaps didn't read; with longer platforms it measured +1.13 as a par 3 (falls are
costly, results bimodal), so it is a par 4. Every hole: planner holes out ≤ par.

**Course map**: Festival Isles is a third tab on the course map (`Front nine | Back nine | Festival Isles`).
Holes unlock in order inside the course (hole 1 open from the start; finishing a hole anywhere, including in an
event round, opens the next), and any hole you have already played (e.g. in an event) is open on the map — this
one-line rule in `showMap` applies to Sky Isles tiles too (holes played in Spooky Open used to show a best but stay locked). "Play festival isles" plays all 9 with a scorecard. URL: `?course=festival&hole=N`.
Not on the title "Play" button and not in the story.

**AI**: `tools/ai_test.mjs` takes `--course=festival` (and `--holes=` from any course);
`js/ai/calib.js` regenerated with `--merge` (27 holes). AI per round on Festival (par 29 after the fest4 change;
measured at par 28): skill 0.5 Pro +0.65, Carl +5.45, Bertha +14.25; skill 1 Pro −7.9. The ai_test personality
check "Banks bounces more than The Pro" fails on the festival nine (2.64 vs 2.36, needs ×1.15) — same as the back
nine (walls everywhere, everyone banks); every other check passes.

## 3. 2027 events (`js/events/data/`)
| id | name | dates (incl.) | theme | holes | currency |
|---|---|---|---|---|---|
| lunar-lanterns-2027 | Lunar Lantern Festival | 2027-01-27 → 02-21 (New Year 02-06, Lantern Festival 02-20) | frost | fest1 fest6 sky10 fest4 sky13 fest9 | 🧧 Lucky envelopes |
| candy-carnival-2027 | Candy Carnival | 2027-02-24 → 03-17 | **candy** (fallback sky) | fest2 fest5 sky16 fest8 sky11 fest3 | 🍭 Lollipops |
| egg-hunt-2027 | Easter Egg Hunt | 2027-03-20 → 04-05 (Easter 03-28) | sky | fest1 sky4 fest4 sky14 fest6 fest7 | 🥚 Painted eggs |
| sky-games-2027 | Midyear Sky Games | 2027-06-26 → 07-18 | sky | fest2 fest3 sky11 fest5 fest7 sky17 fest9 | 🏅 Medals |
No overlaps with each other or with Spooky Open (10-20 → 11-08) / Frost Fair (12-01 → 01-06).
Each has 6–7 goals (rounds / currency up to "all N" / underPar / aces / points), a 29-bot ladder (unique seed)
and 4 rank tiers (top 1 with a title: Lantern Keeper, Sugar Royalty, Golden Egg, Sky Games Champion). Lunar
numbers lean on 8s (88 coins, 888 points…). Pickups are the theme's own (crystal / pumpkin / snow…); the event's
currency name + icon show in the HUD and cards.

Framework changes (small, additive):
- `js/events/events.js`: `holeDef(id, courseId)` + `eventHoles(ev)` — an event's holes may come from any course
  (`ev.course` first). `screen.js` uses it for the par line and the round (dropped its COURSES import).
- `js/app/main.js` `playEvent`: if the event theme didn't load (`app.themeId !== ev.theme`) and the event has a
  `themeFallback`, that theme is used instead of greybox. Candy Carnival has `themeFallback: 'sky'`.
  (`THEME_LIST` already lists candy for the swatch; if it is ever removed the swatch falls back to sky's.)

## Files
New: `js/course/holes/fest1..fest9.js`, `js/events/data/{lunar_lanterns,candy_carnival,egg_hunt,sky_games}.js`, this file.
Changed: `js/themes/spooky/{util,island,env}.js` (voids), `js/course/holes/index.js` (festival course),
`js/events/data/index.js`, `js/events/events.js`, `js/events/screen.js`, `js/app/main.js` (map course tab,
`startRound(i, mode, end, course)`, `?course=`, theme fallback), `js/app/menus.js` (`showMap` `courses`/`onCourse`),
`js/ai/calib.js` (regenerated, merged), `tools/events_test.mjs`, `tools/ai_test.mjs` (`--course`),
`tools/shots_cdp.mjs` (`--own`, overview `--course`, `events2` mode).

## How to test
```
node tools/{physics,store,story,events,meta}_test.mjs && node tools/holes_test.mjs && node tools/online_test.mjs
node tools/holes_test.mjs fest4 --human=8
~/.claude/bin/cdp start --port 9541          # --own opens a fresh target, so a shared Chrome is fine
node tools/shots_cdp.mjs overview --port=9541 --own --course=festival --holes=1,2,3 --themes=sky,spooky,frost --out=DIR
node tools/shots_cdp.mjs events2  --port=9541 --own --out=DIR [--only=lunar,candy,egg,sky-games,fallback,map] [--quick]
node tools/ai_test.mjs --course=festival --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --json=F && node tools/ai_calib.mjs F --merge
```
URLs: `?course=festival&hole=6`, `?eventdate=2027-02-06` (Lunar live), `2027-03-01` (Candy), `2027-03-28` (Eggs),
`2027-07-01` (Sky Games).

## Test results (2026-11-03)
- `physics` 25/25 · `store`, `story`, `events` (incl. the new 2027 checks), `meta`: all passed ·
  `holes_test` 27/27 ok (18 sky + 9 festival, planner ≤ par) · `online_test` 28/28 (local server on :8098, left running).
- events_test (new): every event's holes resolve (cross-course), currency goals ≤ pickups, goal kinds / helper ids /
  chests valid, rank tiers ascend and cover the 30-player board, unique ids + ladder seeds, **no date overlaps**
  across all six events, each new event live on its key day (Lunar 02-06 + 02-20, Candy 03-01, Eggs on Easter
  03-28 + inclusive end 04-05, Sky Games 07-01), `featured` picks the next one between events, `?eventdate=`
  override, candy `themeFallback`, each new event mixes ≥3 Festival + ≥1 Sky hole, a daily ~3-under player finishes
  every goal and ends top 10, 3 casual par rounds don't reach the points goal.
- Browser (`shots_cdp events2`, 412×915 touch): each 2027 event via `?eventdate=` → title tile LIVE with its icon,
  list, page (par line from mixed courses), round starts in its theme (Lunar → frost, Candy → **candy** (the candy
  agent's theme loaded), Eggs / Games → sky) on the right holes, quitting restores the player's theme. The Egg Hunt
  round was played to the end by touch drags: 8 strokes vs par 19, +8 painted eggs, +296 points, goals claimed.
  Candy with its theme forced missing → round in **sky** (only console output: the deliberate 404 + loader warning).
  Map: Festival Isles tab, tiles, hole 1 from the map shows HUD 1/9, back to the map, tab back to Sky Isles.
- Screenshots: all 9 festival holes × sky / spooky / frost (tee view + high overview), fest4/5/9 re-shot after
  changes: no props on the track, voids read as drops (Ferris Slide, Tightrope), no console errors.
  One run caught `this.applyShift is not a function` in js/game/camera.js mid-edit by another agent (fine on re-run).

## Known issues
- Online: festival holes can be picked in rooms (form shows a Course select). A client from before this change
  joining such a room refuses with "update the game" (server only checks hole id shape). No server change needed.
- Chrome: my first `cdp start --port 9512` replaced a Chrome another agent had on 9512 (cdp's "replacing pid").
  I moved to port 9541 and added `--own` to shots_cdp (fresh target each run).
- Short drops (Stepping Stones' 0.4 m gaps, Grand Parade's jump) still show the rounded rock caps of the two
  islands overlapping from high angles in all themes; the drop reads from the tee view. Same as sky14's first drop.
- Pickups can't sit on a branch (`at` snaps to the main track), so the Tightrope plank has no crystal on it.
- AI calibration was measured with fest4 at par 3 for the full-course run; fest4 itself was re-measured after
  its change and merged.

## Proposals for DECISIONS
- P1: Courses beyond Sky Isles live in `COURSES` and appear as extra tabs on the course map; events may mix holes
  from any course (`eventHoles`).
- P2: Event data may carry `themeFallback` (used when `theme` fails to load) — for themes still in development.
