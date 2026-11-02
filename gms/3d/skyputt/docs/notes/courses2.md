# courses2 — notes (Hollow Woods, a third course)

Owner: `courses2` agent. Status: **done** (see Test results). Nothing committed (manager commits).

## Hollow Woods (9 holes)
`js/course/holes/wood1..wood9.js`, theme-independent data (D6), only existing features and pieces — no engine
or theme changes. Registered as `COURSES.woods` (`theme: 'spooky'`, the look it was designed for), so
`holes_test`, `ai_test --course=woods`, `ai_calib`, online rooms (Course picker) and events all see it.

Ideas that make it feel different from Sky / Festival:
- **Ledge drops** (holes 4, 8, 9): the track ends in a floorless 0.4 m gap and resumes 0.25–0.35 m lower. A
  **catch pad** (a `branch`) sits under the gap so the ball always lands — the drop is a real fall, not a
  ramp. The pad is walled only across the gap (the main walls take over below, no doubled walls), and its
  back end rises under the overhang to 4 cm below the upper floor (the floor has no underside collider), so a
  ball rolling back wedges and rolls down again instead of getting under the ledge and off the pad's end. Authoring pattern (no Catmull-Rom lip or dip at the edge):
  `{z: E-0.1}, {z: E}, {z: E-0.01, gap: true, walls: ''}, {z: E-0.4, y: low, walls: 'LR'}, {z: E-0.5}` and the
  landing runs straight ≥1.2 m so a full-power leap still lands between the walls.
- **Gravestone fields**: upright static `block` slabs (`size [0.2–0.3, 0.2, 0.07]`) + bumpers (jack-o'-lanterns
  in spooky).
- **Gates**: pairs of `mover`s in counter-phase whose leaves slide into slots in the walls (open when they part,
  too narrow for the ball ~15–25% of the cycle). The engine's movers only slide, so "swinging" gates are sliding
  double doors.
- **Tunnel crossing** (hole 6): a glass tube (the hollow log) dives under the boardwalk you just played; a void
  under the crossing makes the boardwalk a bridge.
- **Fork with a risky shortcut** (hole 7): a wall-less log `branch` over a ravine with a jump gap in it.
- **Frozen pond** (holes 3, 9): wide ice with stump bumpers.

| # | id | name | par | idea |
|---|---|---|---|---|
| 1 | wood1 | Crooked Path | 3 | narrow (0.95 m) left-right-left winding track, a grave slab inside two bends |
| 2 | wood2 | Gravestone Field | 3 | 2.6 m churchyard, 7 slabs in staggered 2-3-2 rows, two lantern bumpers at the gate, funnel, sand by the cup |
| 3 | wood3 | Frozen Pond | 3 | wide ice pond with three stumps, the exit is a narrow creek off the far left, climbing green |
| 4 | wood4 | Witch's Stair | 3 | two ledge drops (0.32 / 0.25 m) with a bend + sand between; graves flank the green |
| 5 | wood5 | Lych Gates | 3 | 0.9 m lane, two sliding double gates (2.4 s / 2.0 s), dogleg between |
| 6 | wood6 | Hollow Log | 3 | raised boardwalk, U-turn, a log tube that dives under the boardwalk to a lower green |
| 7 | wood7 | Crow's Fork | 4 | long way round a ravine (grave chicane) vs a wall-less log with a jump straight to the green |
| 8 | wood8 | Bone Chute | 4 | steep 2.2 m chute of bumpers + slabs (downhill pinball), a ledge drop, a gate before the green |
| 9 | wood9 | Headless Hollow | 5 | finale: sliding coffin, ledge drop onto a frozen pond with stumps, log tube corkscrewing one turn down round the hanging tree (void under it), green ringed with graves + a slider |

Par 31.

### Difficulty
`node tools/holes_test.mjs woodN --human=8` (planner + 2.5° aim / 5% power noise, random 0–0.4 s timing; avg vs par):

| hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | course |
|---|---|---|---|---|---|---|---|---|---|---|
| par | 3 | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 31 |
| human-ish ×8 | +0.75 | +0.75 | +0.75 | +0.13 | +1.13 | +0.38 | −0.38 | +0.38 | +0.25 | **+4.1 (+0.46/hole)** |

Every hole: the greedy planner holes out ≤ par. Front nine ≈ +0.3/hole, back nine ≈ +0.4 with 17/18 at +1.5..+1.75,
Festival ≈ +0.1 — so Hollow Woods is the most consistently demanding nine without a single brutal hole. Lych Gates
is the timing hole: the bot's random 0–0.4 s timing error makes it read harder than it plays for someone who
watches the gates (cf. Twin Mills +1.75 at par 3). Crow's Fork is bimodal (2 via the log or 5–6 after a fall).
Tuning history: Lych Gates started at +3.25 (three gates that shut fully, 2–3 s periods) → two slow gates
(4.2 / 3.6 s) that close to a ball-wide slit; Gravestone Field +1.63 → 2-3-2 slab rows; Headless Hollow +2.0 →
+0.25 after fixing ledge exits (see Known issues / fixed). Ladder `HARD` bonus (js/meta/ladder.js) for
wood1/2/3 (2), wood5 (4), wood6/8 (1), wood9 (2).

## Map tab + unlock
- `js/app/main.js`: one change — `courses: [course, COURSES.festival, COURSES.woods]`.
- `js/app/menus.js` `showMap`: a course may carry `lockedBy: { hole, note }`; until `store.data.unlocked[hole]` is set
  (finishing that hole anywhere) the course's tab shows a lock, every tile is locked (except holes already played,
  the existing events2 rule), the note shows and the Play button is disabled. Hollow Woods: `lockedBy.hole = 'sky9'`
  ("Finish the Sky Isles front nine to open Hollow Woods.") — same idea as the back nine's lock. Inside the course,
  holes unlock in order as usual. `?course=woods&hole=N` still works (dev/test URL, not gated).
- Rounds play in the player's chosen theme (like Festival Isles); `COURSES.woods.theme = 'spooky'` is informational.

## Online
`js/net/rooms.js` / `form.js` are generic over `COURSES`, so the room form's Course select lists Hollow Woods and its
hole sets (runs of 3, random 3, all 9). Server: course id `woods` and hole ids `wood1..9` pass `opts.go`'s id regex.
A client from before this change joining such a room gets the existing "update the game" refusal.

## Story
World Tour's round **Hollow Masters** (`world-r2`, already spooky-themed) now plays `wood2, wood7, wood9` (was
sky7/sky16/sky17), 7 stars over 3 holes (par 12); Sunny's intro and The Pro's after-line ("You took the log over the
ravine on Crow's Fork…") follow. Needed one line in `js/story/career.js` (event holes may come from any course,
chapter course first) and `tools/story_test.mjs` looks holes up across courses. Saves that already passed
world-r2 keep it. Spooky Open (live now, ends 11-08) is untouched.

## Files
New: `js/course/holes/wood1..wood9.js`, this file.
Changed: `js/course/holes/index.js` (COURSES.woods), `js/app/main.js` (one line), `js/app/menus.js` (`lockedBy`),
`js/meta/ladder.js` (HARD), `js/story/career.js` (one line), `js/story/data/ch5_world.js` (world-r2),
`tools/story_test.mjs` (any-course hole lookup), `js/ai/calib.js` (regenerated with `--merge`).

## How to test
```
node tools/{physics,store,story,events,meta}_test.mjs && node tools/holes_test.mjs && node tools/online_test.mjs
node tools/holes_test.mjs wood5 --human=8
node tools/ai_test.mjs --course=woods --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --json=F && node tools/ai_calib.mjs F --merge
~/.claude/bin/cdp start --port 9570
node tools/shots_cdp.mjs overview --port=9570 --own --course=woods --holes=1,2,3,4,5,6,7,8,9 --themes=spooky,sky,frost,candy --out=DIR
```
URL: `?course=woods&hole=6` (any theme with `&theme=spooky`).

## AI
`node tools/ai_test.mjs --course=woods --rounds=20 --skills=0.1,0.3,0.5,0.7,1` then `ai_calib --merge` →
`js/ai/calib.js` now covers 36 holes. Per round on Hollow Woods (par 31), skill 0.5: Professor +2.85, Pro +5.0,
Mags +7.05, Carl +9.05, Lou +12.75, Banks +15.1, Bertha +17.75; skill 1: Pro −5.75, Professor −6.8. (Festival at
0.5: Pro +0.65.) So the AI finds Hollow Woods clearly harder than Festival — between the back nine and Legends,
as intended. Hardest for the AI: Lych Gates and Gravestone Field. All ai_test checks pass except two personality
checks: "Banks bounces more than The Pro" (3.02 vs 2.70, needs ×1.15 — same known failure as the back nine and
Festival, walls everywhere) and "Bertha makes more aces than Carl" (4 vs 12 over all skills — the woods' aces come
from soft, exact pace through tubes / off ledges, which suits Carl; Bertha's power runs off the ledges).

## Test results (2026-11-03)
- `physics` 25/25 · `store`, `story` (incl. world-r2 on woods holes), `events`, `meta`: all passed.
- `holes_test`: 36/36 ok (18 sky + 9 festival + 9 woods; planner ≤ par on every woods hole).
- `online_test`: 28/28 (local server on :8098, left running); rooms helpers give woods hole sets / courseForRoom.
- Browser (CDP :9570, `--own`): `overview` of all 9 woods holes × spooky / sky / frost / candy (tee + overview, 72
  shots), no console errors. Map: fresh save → Hollow Woods tab with a lock, all tiles locked, note, Play disabled;
  after sky1..sky9 finished → tab open, hole 1 open, "Play hollow woods" starts a woods round (HUD 1/9).

## Known issues
- Gates are sliding double doors (the engine has no swinging kinematic); the leaves slide into the walls and poke
  out of the wall's outer face by up to ~8 cm at full open — reads as a gate post.
- Movers are pinch-unsafe in general: a ball squeezed between a mover and a wall (gap < ball diameter) is popped
  over the wall. All woods movers either stay ≥12 cm from walls or never leave their wall slot, and gate leaves
  never close below a 12–14 cm slit. Worth knowing for future holes (sky/festival movers keep clear gaps already).
- Floors have no underside collider; a ball can roll under an overhang. Catch pads rise to 4 cm under the ledge.
- The drop faces of the ledges read as small steps from high angles (island rock fills under them), clearer from
  the tee view — same as the festival / sky14 short drops.
- Hollow Log's crossing reads as a tunnel under the ground in spooky / frost (the void under the boardwalk is
  small next to the island); the log is visible where it enters and leaves.
- Crow's Fork's jump gap on the log is hard to see from the tee (it's on the far side of a rise).
- Frost: a snowman prop stands right at the inside edge of Hollow Log's U-turn (off the track, no collider).
- The human-ish bot uses random 0–0.4 s timing, so Lych Gates (+1.13) likely plays easier for people.
- Course rounds play in the player's theme (like Festival); Hollow Woods is not forced into spooky.

## Proposals for DECISIONS
- P1: Courses may carry `lockedBy: { hole, note }` (course-level gate on the map); Hollow Woods opens after sky9.
- P2: Story events may name holes from any course (chapter course first) — Hollow Masters uses Hollow Woods.
- P3 (authoring rule): movers must keep ≥ ball-diameter + 2 cm clear of walls, or stay inside a wall slot.
