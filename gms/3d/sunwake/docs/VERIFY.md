# SUNWAKE verification — living milestone record

Verification date: 2026-09-19 Australia/Brisbane (2026-09-18 UTC).
Scope: M1 sunset shell and harness; M2 water; M3 playable launch; M4 solid shores.
M5 is now independently accepted (see appended section); M6–M8 are in progress. The M1/M2 sections below are the original
record and were not rewritten; the M3/M4 sections at the end are this session's.

## Reproduce

Run from `gms/3d/sunwake/`:

```sh
curl -I http://127.0.0.1:8888/gms/3d/sunwake/
node tools/sim.mjs
node tools/sim.mjs --suite waves
~/.claude/bin/cdp start --port 9223
node tools/browser.mjs
```

The server already serves the repo root. Never restart it or serve this folder alone. In this command runner, keep the launcher and browser test in **one shell execution**, separated by a newline: child-process cleanup otherwise stops Chrome between calls. Local socket access needs network-capable execution. Node v24.15.0 is installed; harness requires Node 22+ with built-in fetch/WebSocket. No dependency install/build step.

Focused browser suites: `--suite shell`, `--suite preview`, `--suite water`. No flag runs both shell and water. `CDP_PORT` defaults to 9223; `BASE` defaults to the local SUNWAKE URL. The harness never launches Chrome itself, creates a new tab per scenario, closes it in `finally`, and disables cache before navigating. Successful scenarios reject every collected console error, runtime exception, network failure, HTTP error, and shader diagnostic. Fault-injection scenarios require a readable failure panel and whitelist only the intended diagnostics.

## M1

Passed: same-origin boot, exact vendored import map, successful first frame before boot flag, real mouse start/resume, real Escape pause, frozen time on pause. Failed module request, deliberately malformed module source, failed CSS request, unavailable WebGL2, and deliberately invalid GLSL all produce readable errors with reload actions. These injected errors are expected tests, not clean-run errors.

Original flat-shell evidence is `m1-title.png` and `m1-shell.png`. The final shell regression uses `m2-title.png` and `m2-shell-regression.png` so it does not overwrite those historical images. Fault images are `m1-failure-*.png` (latest regression of the M1 error gates).

## M2 numeric and render gates

- Pure Node production imports pass 20,000 deterministic height/slope/velocity/normal/derivative/continuity cases, signed chunk/lattice boundaries, large-coordinate rebase phase equivalence, ripple wrapping, and manifold topology/winding/index checks for every tier.
- A1 runtime bounds: height ±1.2700000000000002 m; slope ≤0.4101523742186674; vertical speed ≤2.135801663257494 m/s. Crest foam starts at 70% of the current height bound, 0.889 m at SEA_STATE=1.
- Maximum derivative difference observed: 1.8153e-8 (required <1e-6). Double-precision phase/rebase difference: 4.864e-10 m.
- Exact water geometry: high 49,153 vertices / 98,048 triangles; standard 30,721 / 61,248; low 16,385 / 32,640. Uint16 indices, one water draw. Empty scene including reference boat: 18 draws, water count +194 triangles.
- Browser height probe: 64 GPU samples at each t=0,2,5,10, both origin and `(1e7,-1e7)`, using the production `waveSurface` GLSL, RGBA8 two-channel packing. Largest observed error approximately 0.000204 m, below 0.002 m. Readback occurs only through the opt-in diagnostic.
- Frozen-time reference hull height is checked against the production CPU sampler. This is a quasi-static reference pose, **not** M3 buoyancy.
- Forced origin change from `(0,0)` to `(256,0)` at unchanged world position `(255.9,0)` is compared at screenshot pixel level. Final exact numbers and the repeated-frozen-frame stability assertion are in `browser-all.json`.
- Complete matrix: `m2-{standard,low}-{west,east}-t{0,2,5,10}.png`; both tiers also have `-near.png` and `-north.png`. Additional captures show high tier, a 10-million-metre origin, and 360×800 / 390×844 / 844×390 mobile layouts.
- Mobile layout checks use DPR 3, CPU ×4, and real CDP touch dispatch on the view control. These verify layout and the M2 view buttons, not the future M3 split helm.

## Visual assessment

The first sine-only captures looked too rounded. A2 was therefore applied, after review: horizontal displacements of 0.24 m and 0.11 m on octaves 0/1 only. Their Q values are shift/amplitude. Total possible shift ≤0.35 m, with smooth LOD fades and a Jacobian-corrected normal. CPU height sampling is unchanged. The accepted renderer/physics horizontal mismatch is ≤0.35 m; do not feed displaced GPU positions back into physics. The baseline remains in `m2-sine-baseline-{west,east}.png`.

The final water has visible changing crests/troughs, fine wind ripples, saturated teal troughs, peach/copper grazing reflections, and an alignment-driven broken sun road that leaves view when facing east or north. The near-water angle makes swell silhouettes clear. The horizon hides the disc rim in both aspect ratios. Standard and low screenshots were inspected directly, including the less flattering cross-wave/north view. Low has softer detail and visible pixel steps on some distant crest silhouettes: it is the intended cheaper tier, not a claim of identical image quality. No holes, exposed disc rim, origin jump, or shader errors were observed. The remaining angularity in the far cross-wave view is a tessellation limit rather than a seam; the full-detail near water stays continuous.

The launch is deliberately a simple M1/M2 reference mesh. It has no wake, spring buoyancy, steering, collision or exploration yet. Those limitations are not evidence of completed later milestones.

## Evidence and limitations

Open [the screenshot gallery](evidence/index.html). Numeric evidence: `evidence/node-sim.txt`. Final authoritative browser evidence: `evidence/browser-all.json`; focused reports are retained as development history.

Chrome is launched only by `~/.claude/bin/cdp start --port 9223`. Its wrapper selects ANGLE SwiftShader; the final report records actual browser and graphics identification. This is software-rendered desktop Chrome, **not** representative phone GPU performance.

**Physical-device gate: NOT MET — no hardware available.** No sustained phone FPS, thermals, iPhone Safari, or M7 dense-scene qualification is claimed. Emulation here covers only M2 layouts/touch at 390×844 and 844×390 (also 360×800), DPR 3, CPU ×4. M7 remains pending.

**Final combined run: PASS.** `node tools/browser.mjs` completed all seven scenarios; clean render cases have zero collected errors. Report timestamp 2026-09-18T15:22:01.087Z, Chrome 153.0.8010.48 / ANGLE SwiftShader. Rebase mean channel difference 0.0012708657424353343; fraction of channels differing by >8 is 0.000001191511102977062. Repeated frozen frames are pixel-identical (mean/max difference zero). M2 is accepted; M3 has not started.


---

# M3 — Playable launch (verified 2026-09-19)

Reproduce: `node tools/sim.mjs --suite handling`, then in one shell execution
`~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs --suite handling`.

## Numeric gates (PLAN §10.3, all derived, no literals reinstated)

| Gate | Required | Measured |
| --- | --- | --- |
| Flat-water immersion after 15 s | 0.22 ±0.02 m, pitch/roll → 0 | 0.2200 m, \|pitch\|,\|roll\| < 0.001 rad |
| Full ahead after 30 s | 7.5–8.5 m/s | 7.983 m/s |
| Full astern after 30 s | −2.4 to −1.8 m/s | −2.125 m/s |
| Full rudder at speed | 0.38–0.48 rad/s | 0.4300 rad/s |
| Neutral coast 8 → 1 m/s | 8–15 s | 9.967 s |
| 10 min in live waves | finite, ≤9° pitch / ≤12° roll | max 8.389° / 10.948° |
| 30 / 60 / 120 Hz render schedules | identical trajectories | byte-identical after 3,600 steps |

Also asserted: no spin at rest, yaw decays to zero, reverse steering flips with travel
direction, and the four hull-point velocities match a finite difference of the exact render
transform to 1e-5.

## Browser gates

Real `Input.dispatchKeyEvent` and `Input.dispatchTouchEvent`. `sunwakeTest.setInput` is left
null so `advance()` reads the live `platform/input.mjs` state — the production input path is
under test, not a stand-in.

- Landscape keyboard: W/S/A/D and the arrow keys, opposites cancelling, reverse steering,
  release to neutral, camera roll inside A3's 0.12 × roll-stop band and non-zero in a turn,
  camera never below local water +2 m, reduced motion zeroing camera roll.
- Split helm at 844×390 and 390×844, `deviceScaleFactor:3`, `setCPUThrottlingRate(4)`:
  simultaneous rudder + AHEAD, port/starboard travel, the 8% dead zone, vertical travel
  ignored, release outside the button, AHEAD+ASTERN cancelling, `touchCancel` clearing both
  the axis and the button state. All three targets ≥48 px and inside the viewport in both
  orientations; no horizontal overflow.

Screenshots: `evidence/m3-handling-keyboard.png`, `m3-handling-touch-landscape.png`,
`m3-handling-touch-portrait.png`. Report: `evidence/browser-handling.json`.

## Visual assessment

TASKS **C2** is answered. The launch is 1,689 triangles in four material draws (budget
4,000 / 4). The black outboard drum that made it read as "a rowing dinghy with a black box on
the transom" is replaced by a pale cowling with a rust band, a grey leg, a brass gearcase and
prop, and a tiller; the transom is a cream panel with a varnished name board; a boot band just
above the waterline makes the hull read cream-over-dark from the chase camera. A cool
sky-bounce fill light was added because the chase camera always looks west into the sun and
every solid object was otherwise seen from its shaded side.

The wake was rebuilt: it previously read as two hard, dashed, laser-straight beams because the
ribbon's V coordinate alternated 0/1 per station. It now scrolls continuously and is broken up
by two octaves of analytic value noise. It is much better; it is still a flat two-arm V with no
turbulence offset, and right at the stern it is slightly too geometric. Bow spray quads are a
little large and round at close range.

---

# M4 — One unquestionably solid island (verified 2026-09-19)

Reproduce: `node tools/sim.mjs --suite collision`, then
`~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs --suite islands`.

TASKS **A1** numbers are used, not PLAN's older ones: shore wall top **+1.60 m**, bottom
−2.0 m, decorative apron only below **−1.45 m**. Asserted in the suite so they cannot drift.

## The invariant

`distance(boat, island) ≥ island.radius + 2.6 − 1e-6`, asserted after **every** fixed step
against **every** island — not just the last contact — and on the interpolated render centre
at alpha 0, 0.25, 0.5, 0.75 and 1 as well as the simulated one.

| Case | Steps | Contacts | Worst clearance |
| --- | ---: | ---: | ---: |
| Head-on, full ahead, 60 s | 3,600 | 2,667 | +0.001000 m |
| Tangent pass at exactly radius+2.6 | 3,600 | 1 | +0.001012 m |
| Oblique 26° approach, 70 s | 4,200 | 4,680 | +0.001000 m |
| Stern-first astern into the wall, 120 s | 7,200 | 4,132 | +0.001000 m |
| Held against the shore at full throttle, 600 s | 36,000 | 35,986 | +0.001000 m |
| Grinding along the wall, full rudder, 300 s | 18,000 | 28,768 | +0.001000 m |
| 3,000 m/s teleport-sized steps | 400 | — | clear |

Plus: coincident spawn (dead centre, a nanometre off centre, on the wall, just inside) all
resolve to the shore rather than teleporting, with +X used for an exactly coincident centre;
single-call displacements of 0, 1e-9, 0.001 … 10,000 m on 24 bearings straight through the
island, 432 sweeps, worst penetration **0.000000 m** and every blocked sweep ending on the
near side; the same sweeps against all six islands staying clear; and 20,000 seeded random
sweeps including starts already deep inside a shore.

## Falsifying the render-centre correction

The straight lerp between two simulated positions never actually crossed the hard radius in
any sailing case: at ≤12 m/s a 1/60 s chord on a 36.6 m circle sags about 1.4e-4 m, which the
1 mm `CONTACT_SKIN` already absorbs. It did enter that skin 14,719 times, so the grazing cases
are genuinely grazing. Because sailing therefore cannot exercise the corrector, it is falsified
directly instead: a constructed 40° chord across the clearance circle cuts **2.218 m** inside
the shore, and `world.clearCentre` is asserted to both move it and return it clear. Reported as
`rawRenderLerpViolations: 0`, `constructedChordCut: 2.218`.

## Browser gates

`--suite islands`, zero collected errors. Real keyboard drive into Lantern Key: worst clearance
over the approach and the grind **+0.001 m**, the boat held at 2.601 m from the shore
(= 2.6 m boat radius + 1 mm skin), and the water shader receives ≥1 shore circle. Camera
obstruction: parked against the shore facing away, the chase seat would be 10.5 m inside the
stone; the swept 0.4 m camera sphere pulls it in to **reach 0.389** and the camera finishes
**0.401 m outside** the wall, then eases back to reach > 0.99 once clear.

Screenshots: `m4-approach.png`, `m4-shore-contact.png`, `m4-shore-grind.png`,
`m4-camera-obstruction.png`, `m4-wide.png`, `m4-split-crown.png`, `m4-last-orchard.png`.
Report: `evidence/browser-islands.json`.

## Visual assessment and honest limitations

The islands read as low limestone keys: a continuous cream shore wall with a wet stain at the
waterline, irregular terraces, sparse cypresses and olive scrub, and one readable crown feature
per profile (tower / spire / cairn). Two rendering bugs were found by looking rather than by
the suites, and both had passed every numeric gate:

1. Every island triangle except the apron was wound inside-out, so the near wall was
   back-face culled and you looked straight through the island at the sea inside it.
2. Shore foam used `max(shore,0)`, so every water pixel *inside* a shore circle got full foam.
   With the wall invisible that produced a huge white saucer. Foam is now gated to the outside
   of the circle.

Remaining: at 240–760 m the islands are still a little crisp against the horizon haze compared
with the water's own fade; the terraces are regular enough to read as concentric at close
range; only the six authored landmark islands exist — there is **no procedural geography yet**,
that is M5.

**Physical-device gate still NOT MET — no hardware available.** Nothing in M3 or M4 changes
that. Chrome remains ANGLE/SwiftShader and no phone FPS, Safari result or M7 performance
qualification is claimed.


## M5 — signed off 2026-09-19

Commands: `node tools/sim.mjs`, `node tools/sim.mjs --suite collision`, and the prescribed
CDP launcher followed by `node tools/browser.mjs --suite stream`, `--suite shape`, and
`node tools/m5-extra.mjs`. Existing :8888 server returned HTTP 200; no restart performed.
Sandbox socket isolation required execution with local network access.

- World: 10,000 chunks, seven query orders byte-identical; 5,543 occupied; three profiles.
- Collision: 100,000 live randomized sweeps, 35,392 overlapping starts, 38,319 shore hits;
  minimum clearance 0.001 m. Actual 20,000.05 m route: 160,804 steps, 14,573 contacts,
  67 entered chunks, simulated and interpolated centres clear throughout. Cache ≤256.
- Added regression uses seeded case 1399 and an independent spatial overlap scan. Freezing
  the initial query band reproduces **−2.787036 m clearance**. Production re-queries after
  tangent projection, accumulates candidates, makes three contacts and remains clear without
  endpoint recovery. This tests the original failure, not a narrowed fixture.
- Browser streaming: 21 sampled locations up to 20 km radius and return, pool ≤40,
  peak 20 islands / 28 uploaded geometries / 15 draws / 20,685 island triangles. Home has
  24 uploaded geometries; descriptor cache 256. Worst sampled mesh build 0.40 ms.
  These browser positions are controlled teleports, not a claim of a 20 km browser sail.
- Real simulated sailing in Chrome crosses both signs of 256 m rebases and 384 m chunk
  boundaries. `(1e7,-1e7)` renders and sails with intact collision and GPU wave probe.
- Rebase image mean channel difference 0.002562; fraction differing by >8: 0.000000715.
- **D2 confirmed fixed**, including direct inspection of fresh `d1-approach.png` and
  `d1-far.png`: shared 180–650 m fade and identical linear-space sky colour. No straight
  fog discontinuity, white interior foam, inside-out faces or far-water shelves observed.
- Reports: `evidence/browser-stream.json`, `browser-shape.json`, `m5-extra.json`,
  `m5-collision.txt`. All browser runs have zero collected errors.

M5 accepted. M6 is next. **Physical-device gate: NOT MET — no hardware available.**


## M6 — exploration signed off 2026-09-19

Commands: `node tools/sim.mjs --suite exploration`, `--suite collision`, and the prescribed
launcher followed by `node tools/exploration-browser.mjs`.

- Pure discovery: all six valid outside their collision circles; strict speed <3 m/s,
  two continuous seconds; speed or range interruption resets dwell. One reward per landmark,
  one completion event; nearest undiscovered pin; 300 ordinary arrivals retain latest 256.
- Save validation: version, seed, finite bounded coordinates, known and deduplicated atlas IDs,
  bounded ordinary records; corrupt data recovers. Restored position is collision-validated
  with velocity reset. `core/` remains DOM/Three/storage-free.
- Browser first voyage: **38.25 simulated seconds** to Lantern Key from the default launch,
  using real CDP W/A/S/D events and production fixed ticks. No pose/teleport after restart.
  This is deterministic accelerated sailing, not a claim of 38.25 wall-clock seconds.
- Remaining five: controlled positions outside shores followed by **real RAF discovery dwell**.
  Completion opens all six illustrated cards; closing the atlas permits continued key sailing.
- Reload preserves all six pages and position with zero velocity. Malformed saved JSON and
  throwing storage operations both leave a bootable/playable game with an explanatory notice.
- Local canvas-drawn postcards and distinct authored lighthouse, bells, twin crown, brazier,
  needle and six-tree orchard. All six silhouettes persist through LOD; no external assets.
- Directly inspected first-sail discovery, bell approach, completion chart and postcard captures.
  No shore foam fill or inside-out surfaces observed. UI is legible and completion is playable.
- Evidence: `evidence/m6-browser.json`, `m6-first-sail.png`, `m6-lantern-discovered.png`,
  `m6-{bells,crown,cinder,needle,orchard}.png`, `m6-atlas-complete.png`, `m6-postcards.png`.
  Browser errors: zero. Full collision regression still passes.

M6 accepted. M7 qualification remains next. Sound synthesis is implemented but audible output
has not been assessed. Distant sail silhouettes and the optional bird flock are deferred per
TASKS A8; all ordinary names, audio and settings are retained.

---

# 2026-09-21 — gameplay pass on Aaron's first play session

## P0 — the waypoint bug

**Reproduced before it was diagnosed**, in Node and in the browser, by sailing the route rather
than reading the source.

| | before | after |
|---|---|---|
| Leg 2 (Lantern Key → Bell Garden, 488 m), Node autopilot on the HUD bearing | **300.1 s** | **71.8 s** |
| Same leg, browser, steering only by the on-screen arrow read back from `getComputedStyle` | **46 m covered in 300 s**, full throttle | **~65 s, closing the whole way** |
| Seconds of the whole six-landmark route spent pinned to a shore making no way | 109.6 s | **0** |
| Whole route, Node | never completed | **607.8 s, 4.5 km, all six** |

Root causes, in order of weight:
1. The advertised bearing ran through the island the player was moored against. From (−178, 141)
   the straight line to Bell Garden passes **36.9 m** from Lantern Key's centre; its collision
   radius is **36.6 m**.
2. `TANGENT_DAMPING = .92` was applied per *tick* of contact, not per second: **0.68 %** of
   tangential speed survived one second at 60 Hz. Now `TANGENT_RETENTION = .45` **per second**,
   measured at dt = 1/120, 1/60 and 1/30 → **0.45, 0.45, 0.45**.
3. The HUD reported "483 m to shore" and "Six places. Take your time." throughout.

**Both fixes were isolated before either was tuned.** With only the friction fixed, leg 2 is
148 s with 109 s aground; with only the bearing fixed, it is 71.8 s with 0 s aground and the
friction is never exercised. The bearing is the primary fix; the friction is what stops a player
who wanders into a shore — which an autopilot never does — from being welded to it.

**The new suite was falsified against the pre-fix build**: `node tools/sim.mjs --suite route`
goes red with *leg to -2:1 took 300.1 s*, and its friction probe goes red with *one second of
grinding left 0.000 of the tangential speed, not 0.45*.

Collision regression after the friction change: worst clearance **+0.001000 m**, worst single-call
penetration **0.000000 m**, 100,000 live random sweeps clear, 20 km route clear — unchanged. The
seeded negative control had to be **re-derived** (seed 1399 → 12773, frozen-band penetration
**−21.95 m**) because the deflected path depends on the friction constant.

Is the 488 m leg followable? **Yes.** Bell Garden is faintly visible from the start of it
(`docs/evidence/p0-leg2-openwater.png`) and the HUD now reads *closing / holding / opening*. It
is still very faint; a distant beacon is requested from the graphics builder in ROADMAP.md.

## P1 — invisible helm

`node tools/helm.mjs` at 390×844 and 844×390, DPR 3, touch emulation on, real
`Input.dispatchTouchEvent`. Both orientations pass. Held throttle from rest: **14.1 m in 4.0 s,
reaching 6.38 m/s**. Rudder reaches **PORT 100 / STARBOARD 100** from a thumb landing anywhere in
the left half. Asserted: no permanent chrome, hints shown → faded → persisted across reload, a
second thumb does not disturb the first, `touchEnd` releases only the named point, `touchCancel`
with an empty array clears everything, and the visible helm still works when selected.

**Physical-device gate remains NOT MET — no hardware available to any agent.** Everything above
is CDP emulation on SwiftShader. Only Aaron can close it.

## P2 — fishing

`node tools/sim.mjs --suite fishing` and `node tools/fishing-browser.mjs`. Reef water yields
**41.2 %** good fish against **26.7 %** in open water. Tension band **0.30** at level 1 → **0.528**
at level 20. A level-1 angler hooked a gated species **0 times in 2,000 rolls**. Ten casts to
level 3. Holding the reel flat out always loses the fish; a slack-and-ease policy always lands it.

**Save compatibility verified rather than assumed:** the version stays at **1**, and a save with
the `fishing` block stripped out (injected before any page script runs, because the game writes
the save on `pagehide`) still boots, still reads *Continue voyage*, keeps its 900 m odometer and
its atlas, and comes back as a level-1 angler.

## P2 — jobs, coins and progression

`node tools/sim.mjs --suite jobs` (inside the ten-suite `node tools/sim.mjs`) and
`node tools/jobs-browser.mjs`.

**The suite found a real bug before it shipped.** The delivery goal re-created the P0 waypoint
bug: `jobGoal()` handed `courseTo` a drop point carrying the destination island's own id, which
exempts that island from routing. Correct on the jetty's side; on the other side the arrow points
through the rock. Sailed, pre-fix: the autopilot reached the far shore in **120 s** and then
ground along it at **0.1–0.5 m/s for 280 s**, 76 m from the drop, while the HUD read
*"76 m · holding"* and named no blocking island. Post-fix, same start, same dumb bearing-only
pilot: **112 s, paid**. The suite is falsified against the pre-fix `jobGoal` and goes red with
*the delivery was never handed over — 400.02 s holding the arrow, still 74 m off*.

Every drop point on **72** generated cargo jobs across all six landmarks and twelve in-game days
is clear water at exactly the promised **2.000 m** margin, measured with a signed gap rather than
`world.clearance()` — which is clamped at zero and cannot fail that assertion. The check is
anchored by a negative control: the jetty `deck` point is asserted to be **inside** the collider.

Six deliberate breakages, each confirmed to turn the suite red:

| Breakage | Assertion that fired |
| --- | --- |
| skill gate removed from `eligibility` | a gated job became takeable |
| cargo dropped at `deck` instead of `approach` | *the drop must be the jetty approach point* |
| `validateSave` rejects a save with no `jobs` block | *a pre-jobs save is not an invalid save* |
| tampered progress clamp removed | *a save must never hand back a completed job* |
| handover speed gate removed | *handover happened at speed* |
| `HULL_THRUST` zeroed | the bought-hull speed assertion |

Also asserted: a board is a pure function of `(SEED, island, day)` and changes with both; every
board offers one cargo, one catch and one passage; **14** hostile save blocks (negative, infinite
and string coins, upgrades above and below their range, an unknown upgrade key, an invented
island id, a path-traversal id, a slot past the end of the board, forty jobs in a three-job
logbook, a job already finished, duplicates, a negative clock, and total garbage) each clamp and
round-trip without manufacturing money, a job or an upgrade; a stock hull is **bit-identical**
(`bonusThrust === 0` produces exactly the same `x` and `z` after 600 ticks as the untouched
simulation); and a bought hull is measurably faster on the water — **7.983 → 9.327 m/s**.
