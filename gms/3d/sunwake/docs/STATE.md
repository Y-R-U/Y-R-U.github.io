# SUNWAKE — continuation handoff

Updated 2026-09-19 Australia/Brisbane. M5 and M6 verified and signed off; M7 in progress.

## Status

**M1–M5 COMPLETE. TASKS C1/C2 and D1/D2 FIXED. M6 COMPLETE. M7 IN PROGRESS.**

Read BRIEF → TASKS → STATE. TASKS section A overrides PLAN wherever they conflict.
Everything lives inside `gms/3d/sunwake/`. **No git writes of any kind** (no add, commit, push,
rebase, stash), no registration, no deployment, nothing touched outside this folder. The static
server on <http://127.0.0.1:8888/gms/3d/sunwake/> serves the repo root — **do not restart it**.

## What runs today

A complete six-page sunset-atlas voyage in an endless deterministic archipelago. Keyboard and
split-helm touch sailing, solid shores, smooth follow camera, six distinct authored crowns,
two-second slow discovery, postcards, compass pinning, chart, named ordinary visits, distance,
atlas completion and continued sailing. `sunwake-v1` saves position/progress/settings, validates
imports and resumes at rest. Sound is synthesized and opt-in. Pause settings include reduced
motion, quality and explicitly confirmed restart. M7 adaptive performance is being added.

## Verification

```sh
curl -I http://127.0.0.1:8888/gms/3d/sunwake/
node tools/sim.mjs                        # shell + waves + handling + collision
node tools/sim.mjs --suite collision
~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs                    # 9 scenarios
~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs --suite islands
```

`~/.claude/bin/cdp` idle-kills Chrome after 300 s, so a later shell execution **must** call
`cdp start` again **in the same invocation** as the node command. Never spawn Chrome by hand.

All green as of this handoff. Node: `PASS shell / waves / handling / collision`.
Browser: boot+click+pause+resume, five injected boot failures, water matrix + GPU probe,
handling, islands — zero collected errors in every clean-render case.

`docs/VERIFY.md` now has full M3 and M4 sections with every measured number, the two rendering
bugs found by looking rather than by the suites, and the limitations. Read it before claiming
anything about a gate. `docs/evidence/index.html` is the screenshot gallery (repointed at the
current `m3-water-*` / `m3-handling-*` / `m4-*` captures).

### Headline numbers

M3 handling: immersion 0.2200 m · ahead 7.983 m/s · astern −2.125 m/s · turn 0.4300 rad/s ·
coast 9.967 s · max pitch 8.389° · max roll 10.948° · identical trajectories at 30/60/120 Hz.

M4 collision: worst clearance across every scenario **+0.001000 m** (the contact skin), worst
single-call penetration **0.000000 m** over 432 sweeps up to 10,000 m, 20,000 random sweeps
clear, 36,000 steps held against the wall at full throttle without creeping in, camera
obstruction engages to reach 0.389 and leaves the camera 0.401 m outside the stone.

**Physical-device gate remains NOT MET — no hardware available.** Chrome is ANGLE/SwiftShader.
No phone FPS, no Safari, no M7 performance claim.

## Architecture as built

`js/core/` is pure: no `window`, `document`, `localStorage`, WebGL or Three.js, so the Node
harness imports the real production code.

- `core/config.mjs` — A1 wave table behind one `SEA_STATE`, boat constants, camera constants.
- `core/waves.mjs`, `core/water-mesh.mjs`, `core/math.mjs` — unchanged since M2.
- `core/boat.mjs` — buoyancy, hydrodynamics, `hullPoint` with exact angle derivatives. It
  records the pre-integration position and hands it to `world.resolveBoat(b, px, pz, dt)`:
  **collision is injected, never sampled.**
- `core/simulation.mjs` — fixed 1/60 step, ≤4 catch-up steps, frame dt clamped to 0.067 s.
  `interpolateSimulation` runs `world.clearCentre` on the rendered centre.
- `core/collision.mjs` — **new.** `moveCircleSwept`, `sweepIsland`, `resolveOverlap`,
  `deepestOverlap`. `CONTACT_SKIN=0.001`, `MAX_CONTACTS=4`, `TANGENT_DAMPING=0.92`.
- `core/world.mjs` — **new.** 384 m chunks, `hash32`, the six authored `LANDMARKS`, chunk DDA
  `queryIslands`, `resolveBoat`, `clearSpawn`, `clearCentre`, `clearance`, `nearby`.
  `SHORE_TOP=1.60`, `SHORE_BOTTOM=-2.0`, `APRON_TOP=-1.45`, `BOAT_RADIUS=2.6`.
- `platform/input.mjs` — keyboard + fixed split helm, pointer capture, device arbitration.
- `render/` — `scene` (composition), `sky`, `shaders`, `textures`, `water`, `boat-view`,
  `camera`, `effects`, and **new** `islands.mjs`.
- `tools/` — `cdp`, `browser`, `sim`, `handling`, and **new** `collision.mjs`.

## 2026-09-21 — gameplay pass on Aaron's first play session

P0 waypoint bug and P1 invisible helm. Full detail and evidence in `docs/ROADMAP.md`; the
short version, and the new commands:

```sh
node tools/sim.mjs                                            # now 9 suites, route and fishing included
node tools/sim.mjs --suite route                              # sails the six-landmark route by the HUD bearing
node tools/sim.mjs --suite fishing                            # species, curve, fight, save migration
~/.claude/bin/cdp start --port 9223 && node tools/helm.mjs    # invisible helm, real CDP touch, both orientations
~/.claude/bin/cdp start --port 9223 && node tools/fishing-browser.mjs   # the fishing loop through the real DOM
```

`tools/browser.mjs`'s handling scenario now selects the **visible** helm before it drives
`#rudder`, because the invisible scheme is the default and those buttons are `display:none`.
That scenario is the visible helm's regression; `tools/helm.mjs` is the invisible one's.

- `core/exploration.mjs` gains **`courseTo()`**: the bearing the compass advertises is routed
  around any island whose avoidance ring (`COURSE_CLEARANCE = 14 m`) the direct line enters.
  Without it the arrow pointed straight through Lantern Key from the spot where you discover it.
- `core/collision.mjs`: `TANGENT_DAMPING = .92` **per step** became
  `TANGENT_RETENTION = .45` **per second**, scaled by the real `dt` now threaded through
  `world.resolveBoat(b,px,pz,dt)`. The old constant left 0.68% of tangential speed after one
  second of contact at 60 Hz and welded the hull to any shore it brushed.
- `stepExploration` no longer lets an ordinary island take a landmark's dwell, and no longer
  steals a pin the player set by hand from the chart.
- `platform/input.mjs` gains the dual-zone invisible helm; `DEFAULT_SETTINGS` gains
  `helm` and `helmHintsDone`, both **defaulted by `validateSave` rather than rejected**, so
  existing `sunwake-v1` saves load unchanged.
- `window.sunwake` snapshot gains `aground`, `contactSeconds`, a `helm` block
  (`scheme / hintsDone / used / zones / hintsVisible / zonesVisible / buttonsVisible`) and a
  `fishing` block (state plus `level`, `band`, `canCast`).
- **`core/fishing.mjs` is new and pure.** Cast → bite → one-held-touch tension fight → land.
  Six species gated by skill, rarity weighted by water (`waterKind`: reef ≤34 m, shore ≤120 m,
  open beyond), 20 levels on `42·L^1.65`. `input.reeling` is the single held touch — the
  throttle half of the screen, the AHEAD button, or the space bar.
- **`SAVE_KEY` stays `sunwake-v1` and the version stays 1.** `validateSave` treats a missing
  `fishing` block as a pre-fishing save and returns a fresh angler rather than rejecting it, and
  clamps xp, cast count, per-species counts and best weights. `encodeSave` takes fishing as an
  optional fourth argument, so a call without it still produces a valid save.

## 2026-09-21 — jobs, coins and a reason to stop at an ordinary island

```sh
node tools/sim.mjs                                                       # now 10 suites
node tools/sim.mjs --suite jobs                                          # boards, gates, the sailed delivery, hostile saves
~/.claude/bin/cdp start --port 9223 && node tools/jobs-browser.mjs       # the loop through the real DOM
```

- **`core/jobs.mjs` is the model.** Pure. A board is `boardFor(island, day)` — three jobs, one
  cargo, one catch, one passage, a pure function of `(SEED, island, day)`; `DAY_SECONDS = 600` of
  sailing is a day. `eligibility(job, context)` is what greys a card, and it always returns words:
  the board itself never filters, because Aaron asked for ineligible jobs to be shown with the
  reason. An accepted job is stored as nothing but `(island, day, slot, progress)` and regenerated
  from its board on load, so a tampered save cannot invent a job or a payout.
- **`jobGoal(job, boat)` is a two-leg approach and must stay one.** See ROADMAP: handing
  `courseTo` a drop point that carries the destination island's id exempts that island from
  routing, which is right on the jetty's side and points the arrow straight through the rock on
  the other. The standoff leg is the fix.
- **`SAVE_KEY` is still `sunwake-v1` and the version is still 1.** `validateSave` treats a
  missing `jobs` block exactly as it treats a missing `fishing` block: a save from before there
  were jobs, migrated to an empty purse, atlas and odometer intact.
- **Upgrades live in one place, `jobs.upgrades`, and are read back out.** `applyUpgrades()` in
  `main.mjs` copies the rod level onto `fishing.rod` and the hull's newtons onto
  `simulation.bonusThrust`. With a stock hull `bonusThrust` is 0 and every trajectory is
  bit-identical to before — asserted.
- `window.sunwake` gains a `jobs` block: coins, earned, completed, seconds, day, upgrades, the
  active list, the followed job id, and the berth (`{id, name, gap, known, open, reason}`).
- New HUD: `#purse`, `#berth-open`, `#berth-hint`, `#logbook`, and the `#board` panel
  (`mode('board')`, **J** to open and close).

## Gotchas — every one of these cost real time

- **`world.clearance()` is clamped at zero.** It is `-deepestOverlap()`, so it reads `0.000` in
  mid-ocean and `0.000` on a shore. `clearance > 0` is an assertion that can never pass and
  `-clearance <= tolerance` is one that can never fail. Both were in the first draft of
  `tools/jobs.mjs`. Measure a signed gap yourself
  (`hypot(x-island.x, z-island.z) - island.radius - BOAT_RADIUS`) and anchor it with a negative
  control — the jetty `deck` point is genuinely inside the collider, so use that.
- **Never cache anything on `simulation.time`.** `setPose` and `fixtureView` rebuild the
  simulation with the clock back at zero, so a "recomputed every 0.25 s" cache hands back the
  value from before the teleport. That is how the job board silently failed to open for the first
  quarter second at every island a test dropped the boat beside.
- **`sunwakeTest.advance(1)` renders a full frame per tick.** A loop of 6,000 of them is minutes
  of SwiftShader and looks exactly like a deadlock. Steer once per `advance(6)` — 0.1 s, which is
  also the rate the HUD actually redraws at, and the fastest a human could react.
- **A CDP timeout in a sailing test is almost always the renderer being slow, not a deadlock.**
  This cost an hour: `CDP timeout: Runtime.evaluate` after a long `advance` run got blamed first
  on `returnByValue` choking on a bare function value, then on `Page.captureScreenshot`. Both
  were wrong, and the function one was **falsified directly** —
  `p.eval('window.__probe=(n)=>n+1')` returns `{}` in 353 ms. The real cause was a single
  `__sail(120)` call crossing unstreamed chunks and taking longer than the 20 s default. Raise
  the timeout and trace each step before theorising.
- **Sailing into unstreamed chunks builds island and settlement geometry synchronously**, and on
  this machine a single `Runtime.evaluate` spanning a chunk boundary can take 25 s. `tools/cdp.mjs`
  `eval`/`shot` now take an optional timeout (default unchanged at 20 s); `tools/jobs-browser.mjs`
  passes 240 s.

- **A numeric suite that stops at the first landmark proves nothing about the second.** Every
  suite was green while the second leg of the atlas route was unsailable, because the only
  sailing test aimed the autopilot at the landmark's true coordinates. `tools/route.mjs` now
  steers by the bearing the HUD actually publishes; if the HUD lies, the test fails.
- **`TANGENT_DAMPING` was applied per contact, and contact is every tick.** Any constant that
  looks like "a small penalty for scraping" is a per-second rate in disguise. `tools/route.mjs`
  measures the surviving tangential speed after one second at dt = 1/120, 1/60 and 1/30.
- **The seeded negative control in `tools/collision.mjs` depends on shore friction.** Changing
  `TANGENT_RETENTION` moves the deflected path, so the frozen-band case stops penetrating and
  the control silently loses its power. Re-derive it (scan the seeded sweeps for a start whose
  frozen-band result is deep inside a shore the live band keeps clear) and say so in the comment.
- **The game saves on `pagehide`.** Clearing `localStorage` and then navigating writes the old
  settings straight back, so a CDP test cannot reset state that way. Clear with
  `Page.addScriptToEvaluateOnNewDocument` before any page script runs, then remove the script.
- **Repeated navigations in one tab eventually lose the WebGL2 context** on SwiftShader. Use a
  fresh `connect()` per device profile; it looks exactly like a boot bug and is not one.
- **`ui.course().goal` is an island ID STRING, not the island.** `main.mjs` feeds the render
  beacon `{...ui.course(), goal: page}` and the order matters: spread the course first. Reversed,
  the beacon gets a string, every distance is `NaN`, and the goal light simply never appears —
  no exception, no console error, nothing to grep for.
- **Run one CDP suite per Chrome.** Four browser suites back to back against a single
  `cdp start` produce `CDP timeout: Runtime.evaluate` / `Page.captureScreenshot` failures that
  look exactly like real hangs. Each suite passes on its own with a fresh browser; put
  `pkill -f "Chrome.*9223"` and a fresh `cdp start` between them.
- **`navigator.maxTouchPoints` is 0 under `setDeviceMetricsOverride{mobile:true}` alone.**
  Without `Emulation.setTouchEmulationEnabled` the page cannot tell it is on a phone, so anything
  gated on touch capability (the thumb hints) never appears and the test reads as a feature bug.

- **CDP `touchEnd` names the points being *lifted*, not the ones left behind.** Passing the
  remaining points leaves the released pointer stuck down and the helm reads a stale axis.
  `touchCancel` must be sent with an **empty** array or Chrome rejects the call outright.
- **Pointer moves are coalesced onto rAF.** A `touchMove` dispatched and read back immediately
  silently does nothing. `tools/browser.mjs` waits two `requestAnimationFrame`s after every
  touch dispatch. Do not remove that.
- `sunwakeTest.advance(n)` with `setInput(null)` runs the **real** `platform/input.mjs`. That is
  the only way to test input deterministically; rAF timing in headless Chrome is not reliable.
- **Island triangle winding.** Rings run counter-clockwise in `(x,z)`; with Y up, `(a,c,b)` is
  the outward/upward face. Getting it backwards back-face-culls the near wall and you look
  straight through the island at the sea inside it — and every numeric suite still passes.
  If you add island geometry, look at a screenshot.
- **Shore foam must be gated to the outside of the circle.** `max(shore,0)` gave every water
  pixel *inside* an island full foam, which is invisible until a wall sliver shows and then it
  is a blinding white saucer.
- **The DDA band is direction-asymmetric at a chunk corner.** A segment that grazes a corner
  picks up a different diagonal halo walked each way. That is harmless — the band is a superset
  either way and candidates are ID-sorted — so the suite asserts superset-in-both-directions
  and repeat-identical, **not** forward == backward. Also: terminate the walk on
  `min(tMaxX,tMaxZ) > 1` as well as on the end cell, or a segment ending exactly on a corner
  never matches its end cell and the walk runs away across the world.
- **The 1 mm contact skin absorbs the render-lerp chord error** at ≤12 m/s, so sailing cannot
  falsify `clearCentre`. It is falsified by construction instead (a 40° chord cuts 2.218 m in).
  If you ever remove the skin, the render correction becomes load-bearing.
- The chase camera always looks west into the sun, so every solid object is seen from its
  shaded side. `render/scene.mjs` adds a cool sky-bounce fill from the east for this.
- Preserved from M1/M2: the relative vendored import map needs repo-root serving;
  `Network.enable` + `Network.setCacheDisabled` before **every** navigate (a `?v=` on the page
  does not bust the ES modules it imports); the first RAF timestamp can predate
  `performance.now()`; screenshot capture waits two RAFs; the error UI must keep its inline
  styling and use `textContent`; wave-test bounds are derived from the table, never literals.

## Exact next action

ROADMAP P2 is closed: fishing, the fishing skill, jobs, coins, progression and a reason to stop
at an ordinary island are all in and verified. What is left is in `docs/ROADMAP.md` P4 —
M7 adaptive quality, distant sails and birds — plus the physical-device gate only Aaron can
close, and whatever his next play session turns up. **Play it before building more.**

## Superseded: M7 — mobile qualification and polish

Add adaptive quality, emergency tier, scene/ornament budgets and diagnostics. Run dense-scene
budgets and sustained CDP mobile emulation at both orientations, DPR 3 and CPU ×4. Inspect
final screenshots and regress collision. Physical hardware remains unavailable.

M5: `browser-stream.json`, `browser-shape.json`, `m5-extra.json`, `m5-collision.txt`.
M6: `m6-browser.json`, `m6-*.png`, `m6-collision.txt`; Node `--suite exploration`.
Real CDP keyboard sailing from default spawn discovers Lantern Key in 38.25 simulation seconds.
The other five used controlled positions followed by real RAF dwell. Completion, continued
sailing, reload, corrupt save and denied storage all passed. Original canvas postcard art is
in `platform/ui.mjs`; discovery logic and validation stay in pure core modules.

## Debug surface

`window.sunwake` is a getter returning a frozen metrics snapshot — now also `clearance`,
`shoreDistance`, `islands`, `islandTriangles`, `shoreUniforms`, `cameraReach`.

`?test=1` exposes frozen `window.sunwakeTest`: `snapshot()`, `setView({time,x,z,yaw,near})`
(visual fixture, freezes time), `setPose({x,z,yaw,vx,…})`, `reset()`, `setInput(v|null)`,
`advance(ticks)`, `setQuality(tier)`, `setOrigin(x,z)`, `probeWaves(x,z,time)`, `resumeTime()`,
`setReducedMotion(v)`. `setPose` and `setView` both go through `createSimulation` → `createBoat`
→ `world.clearSpawn`, so a test spawn inside an island is pushed out to the shore rather than
teleporting. `advance()` ends with `interpolateSimulation`, so the snapshot's `x`/`z` are the
**corrected render centre**. Never expose mutation hooks without the query flag.

## Known defects, honestly

- The wake still reads slightly too geometric right at the stern; it is a flat two-arm V with no
  turbulence offset. Much better than the dashed beams it replaced, not beautiful.
- Bow spray quads are a little large and round at close range.
- D2 closed: shared HORIZON_FADE and linear-space sky colour; fresh approach/far screenshots inspected.
- D1 closed: irregular terrain accepted and visually reconfirmed.
- In portrait the compass strip sits close to the pause button and its degree readout is hidden
  by design at ≤600 px. Revisit with the real HUD in M6/M7.
- `world.nearby()` sorts a fresh array every frame. Fine for six islands, not for M5.
- M7's adaptive quality, real phone performance and Safari are unimplemented and unverified.
