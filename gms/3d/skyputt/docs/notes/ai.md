# ai — notes (ghost AI golfers, PLAN 2.6)

Owner: `ai` agent. Status: **module done, not wired into the game yet** (js/game, js/app are the
`engine` agent's). Everything lives in `js/ai/`, `tools/ai_*` and this file.

## Files
```
js/ai/index.js      public entry: re-exports + simulateRound() for the story (js/story/opponents.js)
js/ai/planner.js    Planner: coarse → refine → robustness search with the real 240 Hz physics
js/ai/pathfield.js  along-track distance to the cup (graph of builder frames + branches, Dijkstra)
js/ai/golfers.js    personalities, skill → rating/rank/noise/budget, AIGolfer, names/bios, story rivals, fields, room fill
js/ai/round.js      takeShot / playHoleSync (headless play, 30 Hz traces), GhostRecorder (record the player)
js/ai/worker.js     module Web Worker + createAIClient() (inline fallback when Worker is missing or fails)
js/ai/ghost.js      GhostBall (THREE.Group: translucent ball + fading ribbon trail), GhostPlayer
js/ai/calib.js      GENERATED stroke histograms for quick mode (tools/ai_calib.mjs)
js/ai/rng.js        mulberry32 seeded RNG + gauss
tools/ai_test.mjs   every golfer x skills x holes x N rounds, table + sanity checks (multi-process)
tools/ai_calib.mjs  ai_test --json → js/ai/calib.js
tools/ai_demo.html / ai_demo.js   one hole, 3 ghosts taking turns in the real hole view + theme
tools/ai_demo_cdp.mjs             headless-Chrome screenshots of the demo
```

## How it works
- **Aim convention** = `Round.debugShoot`: heading `aim` in radians, 0 = −Z, `vx = sin(aim)·v`,
  `vz = −cos(aim)·v`, `v = shotSpeed(power)` (the game's power curve), power 0..1.
- **Cost** of a simulated result ≈ expected strokes still to play (`strokesFrom(d)`): holed = 0,
  rest = f(along-track distance to the cup), OOB = 1 + `wOob` + strokes from the start spot. The
  distance is along the track graph (`pathfield.js`), so a ball behind a bend is far, and branch
  tracks (hole 7's plank) are real shortcuts. Personality terms: `wBank` (bonus per wall bounce),
  `wPower`, `wHole` (go-for-it bonus), `layup` (Carl: from > 2.5 m aim to leave it 0.4 m short).
- **Search** (`Planner.plan`), budget in **physics steps** (deterministic on every device):
  1. coarse grid: headings ± `span` around the route 2.5 m ahead (+ straight at the cup when < 3.5 m),
     powers spaced evenly in roll distance plus a putt-weight guess; ~50% of the budget;
  2. on holes with moving parts, the best few are retried with waits (0.35/0.7/1.05 s) — timing;
  3. pattern-search refinement around the 3 best distinct candidates (to 80%);
  4. robustness: the 4 best finalists re-run at ±aim/±power (±timing on kinematic holes) noise,
     aggregated as `worst·w + mean·m + best·b` (the golfer's `risk`). Lowest aggregate wins.
  Sims are cached per start spot, so golfers planning from the same tee on a static hole share work.
  Early outs: OOB as soon as the ball is 0.25 m below the lowest course geometry; 15 s cap per sim.
- **Execution noise**: `golfer.ticket()` draws 4 random numbers on the caller's side, the worker
  applies them (`execute(plan, ticket)`), so results are identical inline or in the worker.

## Golfers (`golfers.js`)
| id | name | flavour (planner style) |
|---|---|---|
| carl | Careful Carl | wOob 4, worst-case risk, lay-up, soft pace, knows his own noise |
| bertha | Big Bertha | wPower 1.6, wHole 1.5, best-case risk, wOob 0.1, power-scaled noise |
| banks | Banks | wBank 1.4 (bonus per wall bounce) |
| lou | Lucky Lou | streaky noise: 22% "hot" (×0.15), 23% "wild" (×2.2); best-case risk |
| pro | The Pro | more search, less noise, balanced risk |
| professor | The Professor (new) | 1.5× search, precise aim, timid pace (wPower −0.5) |
| zoe | Zippy Zoe (new) | 0.35× search, never waits for obstacles |
| mags | Old Mags (new) | the coach as the Legends final boss: strong, robust, a little bank-happy |

**Skill 0..1** → `rating = 600 + 1800·skill`, rank `Nobody <.15 ≤ Amateur <.35 ≤ Club Player <.55 ≤
Semi-pro <.72 ≤ Pro <.9 ≤ Legend`. Noise with k = (1−skill)^1.3: aim sd `0.9° + 9°·k`, power sd
`3% + 19%·k`, timing sd `0.02 + 0.22·(1−skill)` s, each × the personality's aimK/powerK. Search budget
`40k steps × (0.25 + 0.75·skill) × budgetK`, heading fan `45° + 35°·skill`. Robustness assumes the
golfer's own noise × (0.35 + 0.65·skill) (novices underrate how wild they are; Carl doesn't).

Generators: `makeGolfer({ personality?, skill?, seed })` (name with nickname, home course, bio),
`makeField({ size, skill, spread, seed })`, `STORY` (one named rival per tour: Carl → Lou → Banks →
Bertha → The Pro → Mags) with `storyRival(tour)` / `storyField(tour)`, `roomFill({ count, personality, rank, seed })`.

## API
```js
import { simulateRound, createAIClient, AIGolfer, makeField, storyRival, Planner } from './js/ai/index.js';
import { GhostBall, GhostPlayer } from './js/ai/ghost.js';      // THREE; kept out of index.js

// story / tournaments (already called by js/story/opponents.js → playField)
await simulateRound({ holes, golfer: { id, name, personality: 'careful'|'power'|'banks'|'lucky'|'pro'|<our ids>, skill }, seed,
                      mode: 'auto'|'full'|'quick', trace = true, budgetScale = 0.75 })
// → { mode, scores: [{ strokes, picked, oob?, ace?, shots? }] }  shots: [{ vx, vz, t0, aim, power, from, to, state, penalty, path, hz }]

// live play (worker, never blocks rendering)
const ai = createAIClient();                    // ai.mode === 'worker' | 'inline'
const s = await ai.shot(holeDef, golfer, ballState, { t0 });   // one stroke: plan + noise + 30 Hz path, s.rest = next ball state
const rec = await ai.hole(holeDef, golfer, { t0 });            // whole hole → ghost record
const recs = await ai.round(holeDefs, golfer);                 // one golfer RNG stream over a round
const plan = await ai.plan(holeDef, ballState, { t0, style }); // raw planner

// ghosts
const g = new GhostBall({ color: golfer.color }); scene.add(g); g.place(tee);
g.play(shot, { onDone }); /* per frame */ g.update(dt);       // or new GhostPlayer(g, rec).update(dt)
```
`simulateRound` modes: **full** plans and simulates every shot in the worker (gives `shots`);
**quick** samples strokes from `calib.js` per hole/personality/skill (instant, no shots; unknown holes
use all holes pooled relative to par); **auto** = full for ≤ 4 holes (rival matches), quick for longer
(tournament fields). The choice depends only on the inputs, so the same seed gives the same result.
Measured: Careful Carl @ 0.38, 4 holes, full = 0.67 s in headless Chrome's worker / 0.94 s inline in node
(loaded M-series Mac; ≈ 2.5–4 s on a mid phone, off the main thread); a 6-hole quick round is < 1 ms.
Node inline and the Chrome worker return identical strokes for the same seed.

## Integration (for the engine/game agent)
- **Story rival matches**: already wired through `playField` → `simulateRound` (auto = full for 4 holes).
  To show the rival as a ghost, play `scores[h].shots` with a `GhostBall` after (or interleaved with)
  each of the player's strokes; the paths are complete, so no physics is needed on the main thread.
  Kinematic obstacles: the shots were simulated with `t0` on a clock that starts at 0 per hole (+1–2 s
  think time per stroke). To make blades/blocks match, start the ghost shot when `world.time ≡ t0`,
  or (better, live) request each stroke with `ai.shot(..., { t0: world.time + 1.0 })` at the start of
  the AI's turn and launch the ghost exactly at `t0` (the demo does this on one shared clock).
- **Tournament fields**: `simulateRound` auto → quick. Fields of generated golfers: `storyField(tour)`
  or `makeField`. Watched rivals can use mode 'full' explicitly.
- **Online fill** (M6): `roomFill({ count, personality, rank, seed })`; each client can run the same
  seeded AI locally (deterministic) or the host broadcasts the shots (`vx, vz, t0`) like a player's.
- **Recording the player** (ghost replays of yourself, async online): `GhostRecorder` —
  `begin({ t0, aim, power, from })`, `step(ball)` per physics step, `end(state, to)`.
- The worker rebuilds colliders from the hole **def** (plain data) with the node-safe builder; a
  Planner per hole is cached in the worker (≤ 12 holes).

## Story interface (js/story/opponents.js) — status and mismatches
- `js/ai/index.js` now exports `simulateRound({ holes, golfer, seed })` exactly as specified; the
  probe import succeeds, so `source` becomes `'ai'` and the "simulated" note / console 404 go away.
- Personality ids map `careful→carl, power→bertha, banks, lucky→lou, pro`; our own ids also work.
- `playField` awaits golfers **one after another**. Auto mode keeps that cheap: the 4-hole rival match
  runs full sims in the worker (~0.7 s desktop, a few seconds on a phone; worth a "warming up" line),
  the 6-hole Muni Open (7 golfers) uses quick mode (instant). If the story wants ghosts for tournament
  leaders, call `simulateRound({ ..., mode: 'full' })` for those few only.
- Quick mode returns no `shots`; `picked` there means strokes reached par+4.
- Scores include extra fields (`oob`, `ace`; shots carry `aim, power, from, to, state, path, hz`).
- The roster's `pro` at 0.92 averages about −6 over 9 holes, i.e. far better than a new player:
  fine for a cameo, too strong as an opponent before the World Tour.

## Tuning table (`node tools/ai_test.mjs`, 20 rounds × 9 holes per cell, par 28, avg strokes vs par)
Average strokes for 9 holes (par 28), `+x` vs par, `[OOB per round, aces per round, wall bounces per shot]`:

| golfer | 0.1 Nobody | 0.3 Amateur | 0.5 Club Player | 0.7 Semi-pro | 1.0 Legend |
|---|---|---|---|---|---|
| Careful Carl | 41.4 +13.4 [1.8 0.1 2.0] | 40.3 +12.3 [2.8 0.1 1.9] | 35.2 +7.2 [1.4 0.3 1.9] | 29.0 +1.0 [0.4 0.3 1.9] | 25.1 −3.0 [0.1 0.5 1.5] |
| Big Bertha | 44.4 +16.4 [2.0 0.1 2.1] | 43.2 +15.2 [2.4 0.2 2.3] | 40.5 +12.6 [1.8 0.1 2.5] | 35.5 +7.5 [1.4 0.1 2.4] | 27.3 −0.8 [0.8 1.2 2.4] |
| Banks | 42.9 +14.9 [1.4 0.1 2.1] | 44.9 +16.9 [3.4 0.0 2.4] | 39.4 +11.4 [2.3 0.5 2.5] | 32.4 +4.4 [1.1 0.3 2.5] | 26.3 −1.8 [0.3 1.0 2.4] |
| Lucky Lou | 43.1 +15.2 [1.3 0.2 1.9] | 40.6 +12.7 [1.9 0.3 2.1] | 36.3 +8.3 [1.9 0.4 2.0] | 31.3 +3.3 [1.4 0.5 1.9] | 23.1 −5.0 [0.3 0.9 2.0] |
| The Pro | 38.0 +10.0 [2.3 0.3 2.0] | 35.8 +7.8 [2.1 0.2 2.1] | 32.0 +4.0 [1.6 0.5 2.4] | 27.4 −0.6 [1.3 0.8 2.0] | 20.8 −7.3 [0.1 0.9 1.5] |
| The Professor | 40.3 +12.3 [2.0 0.1 2.0] | 35.5 +7.6 [1.6 0.1 1.9] | 29.9 +1.9 [0.9 0.8 1.9] | 25.9 −2.1 [0.7 0.7 1.8] | 21.7 −6.3 [0.1 1.3 1.6] |
| Zippy Zoe | 54.0 +26.0 [3.0 0.3 2.2] | 44.9 +16.9 [1.1 0.1 2.0] | 40.6 +12.7 [2.0 0.1 2.2] | 28.8 +0.8 [0.5 0.6 2.0] | 24.4 −3.7 [0.1 0.8 1.7] |
| Old Mags | 40.4 +12.4 [2.3 0.3 2.2] | 39.1 +11.2 [2.1 0.1 2.3] | 34.0 +6.0 [1.4 0.3 2.3] | 29.5 +1.5 [0.6 0.6 2.2] | 21.1 −6.9 [0.0 1.7 2.1] |

Totals across skills: Bertha 165 OOB vs Carl 128 (×1.29), aces 37 vs 27. Hardest for the AI: hole 7
(The Shortcut, ~+3 at low/mid skill) and hole 9 (windmill + loop). Story roster skills 0.22–0.38
land at roughly +11..+17 over 9 holes, i.e. +1.2..+1.9 per hole: beatable Muni opponents.

## Planner cost (budget → time)
Budgets are physics steps; one step is ~1.5–3 µs in node on an M-series Mac (more on the windmill /
loop holes). Single process on a busy box: The Pro @ 1 (≈ 48k steps) ≈ 70 ms avg, 285 ms worst per shot → **≈ 300–500 ms on a mid
phone (×4)**; skill ≤ 0.5 golfers ≈ 20–30k steps ≈ 150–250 ms phone. The ms columns in ai_test are
inflated (8 processes + other work on the box). For a hard wall-clock cap pass `budgetMs` (makes the
plan device-dependent) or a smaller `budgetScale` (deterministic); simulateRound uses 0.75.

## Checks (all pass)
Pro @ 1 under par · every personality @ 0.1 well over par (≥ +0.4/hole) · skill 1 beats 0.1 clearly ·
Bertha more OOB (×1.2) and more aces than Carl · Banks more wall bounces than The Pro · Lou streakier
than The Pro · deterministic (child process vs inline) · plans don't depend on what the planner planned before
(cached sims still count against the step budget) · plans within budget. Also checked: `simulateRound`
returns identical results twice; worker mode works in Chrome (`demo.mode = 'worker'`).

## Known issues / proposals
- **The planner is better than people at top skill.** Pro/Professor @ 1 average ~−7 on the front
  nine (lots of aces): the physics is deterministic, so a near-noiseless golfer finds ace lines.
  For story bosses use skill ≤ 0.9 (−2..−6). Proposal for DECISIONS: Legend-rank AIs cap at 0.92.
- Hole 7 (The Shortcut) is the hardest hole for the AI at low skill (+3.5); the plank is tempting
  and the U-bend is long. Hole 9 at mid skill too (windmill + loop needs power).
- Timing on windmill/mover holes is only a few discrete waits; the game's own think time isn't
  modelled beyond 1–2 s.
- Ghost replay uses recorded positions, so it is exact; re-simulating from `vx, vz, t0` in the game's
  world is near-exact but a rested ball's support flags (`supported`, normal) can differ after an
  OOB reset (the game uses `ball.place`, the AI a fresh Ball). Prefer the paths.
- `strokesFrom` is a hand-tuned curve, not learned; quick mode is only as good as the last calibration
  — **rerun `ai_test --json` + `ai_calib` after hole or physics changes**.
- Engine wishes (none blocking): a `Ball.copyFrom`/state export so worker ↔ game ball state is one
  call; `simulateShot` early-out hook for OOB (the planner has its own loop for that).
- Demo: when a ghost goes through the windmill tunnel the chase camera can end up behind a blade for a
  moment (same rig as the game; occlusion pull-in doesn't cover moving skins). Screenshot strip:
  `tools/ai_shots/demo_sky9_strip.png`.
- The demo's camera reuses the game's `CameraRig`; in headless Chrome (~10 fps) playback runs at half
  speed because dt is capped at 50 ms.

## How to test
```
node tools/ai_test.mjs [--rounds=20] [--skills=0.1,0.3,0.5,0.7,1] [--golfers=pro,carl] [--holes=sky1] [--jobs=8] [--json=FILE]
node tools/ai_calib.mjs FILE          # regenerate js/ai/calib.js from that JSON
http://192.168.0.236:8888/gms/3d/skyputt/tools/ai_demo.html?hole=sky9&golfers=pro:0.9,bertha:0.6,banks:0.6&speed=1
~/.claude/bin/cdp start --port 9513 && node tools/ai_demo_cdp.mjs --speed=4 --at=6,12,20,30
```
