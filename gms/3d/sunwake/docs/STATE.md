# SUNWAKE — continuation handoff

Updated 2026-09-19 Australia/Brisbane. This session: M3 finished, M4 built and verified.

## Status

**M1 COMPLETE. M2 COMPLETE. TASKS C1 FIXED. TASKS C2 FIXED. M3 COMPLETE. M4 COMPLETE.
M5 NOT STARTED — and was explicitly out of scope for this run.**

Read BRIEF → TASKS → STATE. TASKS section A overrides PLAN wherever they conflict.
Everything lives inside `gms/3d/sunwake/`. **No git writes of any kind** (no add, commit, push,
rebase, stash), no registration, no deployment, nothing touched outside this folder. The static
server on <http://127.0.0.1:8888/gms/3d/sunwake/> serves the repo root — **do not restart it**.

## What runs today

Title → Cast off → a sailable wooden launch on an endless sunset sea with six authored
limestone islands whose shores are provably solid. WASD/arrows on desktop, a fixed split helm
on touch, chase camera with A3 roll and island obstruction, wake ribbon, bow spray, shore foam,
pause via the button / Escape / P. No discovery loop, no chart, no save, no audio, no
procedural geography.

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

## Gotchas — every one of these cost real time

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

## Exact next action: M5 — endless archipelago

Nothing procedural exists yet. `core/world.mjs` was written so M5 slots in at one function:

1. Replace `chunkIsland(cx,cz)` with: authored `LANDMARKS` override first, otherwise
   `hash32(SEED,cx,cz,salt)` → 55% occupancy, at most one island, centre = chunk centre ± 64 m
   independent jitter, radius 26–64 m, adjacent centres ≥256 m apart on their separating axis,
   origin chunk and the 90 m spawn clearance reserved as water. Query order must not affect
   generation. Keep the descriptor shape `{id,cx,cz,x,z,radius,height,profile,landmark,seed}`.
2. Bound the descriptor cache to 256 chunks; collision may regenerate an uncached chunk
   immediately. **Pending meshes must never mean pending colliders.**
3. Streaming in `render/islands.mjs`: build within 1,000 m nearest-first, evict past 1,150 m,
   ≤2 ms and ≤2 work items per frame, LOD, prebuilt geometry pools. Right now all six islands
   are built at boot and never evicted — that is fine for six and wrong for infinity.
4. Gates (TASKS §B M5): `--suite world` — 10,000 chunks queried in different orders must be
   byte-identical; `--suite collision` — 100,000 randomised cases; a 20 km sailed route with
   stable memory and no water seam at rebases.

Then M6 (exploration loop), M7 (mobile performance, `docs/VERIFY.md` completion), M8 (hand-off).
Never cut, per TASKS A8: the water, the handling, the shore collision, the camera, both control
schemes, the six landmarks.

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
- Islands are a touch crisp against the horizon haze between 240 and 760 m; the scene fog range
  does not quite match the water shader's own 180–650 m fade.
- Terraces are regular enough to still read as concentric rings from close up.
- In portrait the compass strip sits close to the pause button and its degree readout is hidden
  by design at ≤600 px. Revisit with the real HUD in M6/M7.
- `world.nearby()` sorts a fresh array every frame. Fine for six islands, not for M5.
- M7's adaptive quality, real phone performance and Safari are unimplemented and unverified.
