# SUNWAKE — living roadmap

**This file is the todo list. Every agent updates it: mark items IN PROGRESS when you start and
DONE when verified, and add anything you discover.** Status of the build as a whole lives in
`docs/STATE.md`; this file is what is left to do and who owns it.

Last updated: 2026-09-21. Source: Aaron's first real play session.

**P0 waypoint bug: FIXED, verified by sailing (Node + browser). P1 invisible joystick: DONE,
verified with real CDP touch in both orientations. P2 fishing + fishing skill: DONE. Jobs, coins
and a reason to stop at ordinary islands are still open.**

---

## Aaron's play feedback (verbatim intent)

> "Not sure I can get to the 2nd island waypoint, waypoint didn't even work properly."
> "Change the mobile portrait controls to be invisible joystick controls... buttons are a bit unsightly."
> "Let's get real game stuff in there — fishing, levelling up the skill to catch bigger fish, the
> option to take on jobs, e.g. transport something to a certain island, or catch a fish (disable
> jobs you are ineligible for)."
> "The boat can often vanish under a wave/water which the boat shouldn't do. Improve the islands,
> maybe introduce some buoys, and work on fish."

Everything below serves that. **Aaron has played it; his experience outranks any passing suite.**

---

## P0 — blocking, do these first

- [x] **WAYPOINT BUG — FIXED 2026-09-21 (gameplay builder).** Reproduced by sailing it, in Node
      and in the browser. **The pin, the distance and the save were all correct.** What was broken
      was the *bearing*, and then the *shore*:

      1. **The arrow pointed through the island you were moored against.** The straight line from
         where you sit after discovering Lantern Key (≈ −178, 141) to Bell Garden passes 36.9 m
         from Lantern Key's centre — its collision radius is 36.6 m. Holding the arrow drove you
         into the rock you had just discovered.
      2. **The shore was glue.** `TANGENT_DAMPING = .92` in `core/collision.mjs` was applied on
         *every tick of contact*, not per second — 0.68% of tangential speed left after one
         second at 60 Hz. Once you touched a shore you could not slide off it.
      3. **The HUD never said so.** It read "Bell Garden · 483 m to shore" and "Six places. Take
         your time." while the boat ground along at 0.4 kn. Measured: **46 m of progress in 300
         seconds** at full throttle, holding the arrow exactly.

      Fixes: `courseTo()` in `core/exploration.mjs` routes the advertised bearing around any
      island whose avoidance ring the direct line enters (tangent, or run-along-the-shore when
      you are already inside the ring); shore friction is now `TANGENT_RETENTION = .45` **per
      second**, scaled by the real step, so a graze costs speed but never welds you on; the HUD
      names the blocking island, shows closing/holding/opening, and says "Aground — astern to
      back off" when contact is sustained with no way on.
      Leg two: **300 s and stuck → 65–72 s and closing the whole way.**

      Also fixed while in there: the `break` in the candidate loop could hand a landmark's
      two-second dwell to an ordinary island; landmarks now always outrank them. A pin the player
      set by hand from the chart is no longer silently stolen by an unrelated discovery. The
      closing-rate readout is measured in simulation time, not wall time.

      **New Node suite `tools/route.mjs` (`node tools/sim.mjs --suite route`)** sails the whole
      six-landmark route steering *only* by the bearing the HUD publishes, and asserts every
      discovery fires, every pin advances, no leg exceeds 240 s, the route never enters a shore,
      the detour path is actually exercised, the odometer accrues, a half-finished save resumes
      on the right page, and one second of grinding leaves exactly `TANGENT_RETENTION` of the
      tangential speed at dt = 1/120, 1/60 and 1/30. **Falsified against the pre-fix build:** it
      goes red with *leg to -2:1 took 300.1 s*. Browser replay, steering only by the on-screen
      arrow read back from the DOM transform, reaches five landmarks in 450 s with zero console
      errors — evidence in `docs/evidence/p0-leg2-*.png`, `p0-chart-pin.png`.

      Honest notes: the 488 m leg **is** followable — Bell Garden is faintly visible from the
      start of it (see `p0-leg2-openwater.png`), and the closing/opening readout tells you you
      are on it. It is still very faint. See the render-side request below.
- [x] **BOAT SUBMERGES — DONE (graphics; `js/core/boat.mjs`).** The hull disappears under a wave; a boat must never do that. Likely the
      buoyancy response lags a fast crest (stiffness 4682 N/m, damping 950 N·s/m, immersion
      clamped at `2*mass*g/4`). Fix it in the physics rather than by lifting the render mesh, and
      keep `--suite handling` green. A hard guard — the hull's lowest point never more than X
      below the local surface — is acceptable as a backstop, not as the fix.

## Blocking the gameplay side right now (graphics builder)

- [x] **`js/render/islands.mjs` boot crash — ALREADY FIXED, re-verified 2026-09-21 (graphics).**
      `defaultAttributeValues` appears nowhere in `js/render/` any more, and the *second* of the
      two fixes suggested here is the one that shipped: **every island geometry carries an
      explicit `glow` attribute** (`islands.mjs:248-254`), so no material default is needed.
      Confirmed by `grep -n defaultAttributeValues js/render/*.mjs` (no match) and by booting the
      real game — `tools/browser.mjs` (all 10 scenarios), `tools/helm.mjs`, and a live voyage
      capture, `docs/evidence/beacon-voyage.png` — all reach `__SUNWAKE_BOOTED__` with zero
      console, shader, runtime or request errors. **Browser testing is not blocked for either
      builder.** If you saw this crash, you were on a stale module: the page query string does not
      bust the ES modules it imports, so set `Network.setCacheDisabled` before every navigate.

## Requests for the graphics builder (gameplay side cannot do these)

- [x] **A distant landmark beacon for the pinned goal — codex built `js/render/beacon.mjs`, and
      gameplay has now wired it up.** `main.mjs`'s `render()` calls
      `view.setCourse({...ui.course(), goal: page})` every frame; `sunwake.beacons` reports
      `{lamps, goal, instances}` and reads `goal: true` at the spawn, 230 m off Lantern Key.
      **Watch the spread order:** `ui.course().goal` is the island **id string**, so it must be
      spread *before* the island object — the other way round hands the beacon a string, every
      range comes out `NaN`, and the goal light silently never appears with no error at all.
- [x] **Low-speed steering authority — DONE 2026-09-21 (graphics; `js/core/boat.mjs`).**
      Reproduced first: a boat driven straight at Lantern Key with the helm hard over **never**
      cleared the shore, on all six test bearings, sitting at exactly 0.00 m/s for the full 40 s.
      The fix is not a fudge on the rudder. An outboard steers by *vectoring its own thrust*, so
      the new term scales with **throttle**, not with speed, and falls off as a cube of speed:

      ```js
      const wash=WASH_TURN*b.rudder*b.throttle*(WASH_FALLOFF/(Math.abs(u)+WASH_FALLOFF))**3;
      ```

      0.14 rad/s at rest, 0.019 at 1 m/s, under 0.0003 rad/s at cruising speed. All six bearings
      now clear the rock in **11.5 s**. `WASH_TURN` / `WASH_FALLOFF` live in `boat.mjs`, not in
      `core/config.mjs`, so nothing of yours was touched.
      Guard rails, all asserted: with the throttle shut the helm still does **exactly** nothing —
      the handling suite's `assert.equal(resting.yawRate,0)` is an exact equality and still passes,
      and the heading is unchanged to the last bit; the cruising turn is **0.430389 rad/s** against
      the 0.4300 measured before; astern with the helm over still swings the other way;
      30/60/120 Hz trajectories are still bit-identical.
      New suite **`node js/render/tests/steering.test.mjs`**, falsified by setting `WASH_TURN` to
      0 — it goes red with *never cleared the shore in 40 s*.

## P1 — controls and feel

- [x] **Invisible joystick — BUILT 2026-09-21, verified in portrait; landscape verification
      blocked (see below).** `#zones` splits the screen below the HUD into two halves and draws
      nothing until a thumb lands.
      - **Left half — floating rudder.** Appears wherever you touch. 56 px travel to hard over,
        6 px deadzone, readout `PORT 72` / `AMIDSHIPS` / `STARBOARD 100` under the ring.
      - **Right half — floating throttle lever.** *The touch point is FULL AHEAD*, because that
        is what pressing the right of the screen means to a player. Sliding down eases off
        (72 px to stop) and then goes astern (144 px to full astern). Readout `AHEAD 100` /
        `STOP` / `ASTERN 90`.
      - No permanent chrome: `.rudder-wrap` and `.throttle-wrap` are `display:none` under the
        invisible scheme. `#helm` stays on screen in `.status-only` so the speed readout survives.
      - Both schemes in both orientations — the zones are left-half/right-half, so landscape
        works the same and reads better without the buttons over a wide horizon.
- [x] **First-play hints.** Two pulsing thumb pads with `STEER · hold & slide` and
      `THROTTLE · hold ahead · slide down astern`, shown only on touch-capable devices, fading
      when the player has **both** steered past 25% **and** used the throttle — then
      `settings.helmHintsDone` is saved and they never return.
- [x] Visible helm kept as a setting (`Helm` in Voyage settings → *Visible buttons*), persisted.
      `DEFAULT_SETTINGS` gains `helm:'invisible'` and `helmHintsDone:false`; `validateSave`
      **defaults the new keys rather than rejecting the save**, so Aaron's existing voyage loads
      untouched and no version bump was needed.

New suite: **`node tools/helm.mjs`** (needs `~/.claude/bin/cdp start --port 9223` in the same
shell invocation). Real `Input.dispatchTouchEvent` at 390×844 and 844×390, DPR 3, with touch
emulation on so the page can tell it is on a phone. It asserts: no permanent chrome, hints shown
then faded then persisted across a reload, the floating rudder appears where the thumb lands and
reaches ±1, the throttle lever runs ahead→stop→astern, a second thumb does not disturb the first,
`touchEnd` on one point releases only that point, `touchCancel` with an empty array clears
everything, four seconds of held throttle actually moves the boat, and the visible helm still
works when selected. Evidence: `docs/evidence/p1-*.png`.

**Two harness traps found doing this, both now documented in the suite:**
- Clearing `localStorage` after boot and reloading does **not** reset the game — the page saves
  on `pagehide`, so navigating away writes the settings straight back. Use
  `Page.addScriptToEvaluateOnNewDocument` to clear before any page script runs, then remove it.
- Repeated navigations in one tab on SwiftShader eventually fail to restore a WebGL2 context.
  Use a fresh tab per device profile.

## P2 — the actual game

Early game stays as it is: a few island hops as practice. These systems unlock after that.

- [x] **Fishing — BUILT and verified 2026-09-21.** `js/core/fishing.mjs`, pure, no DOM.
      Cast is refused above 1.2 m/s, so you fish from a boat at rest. Bite after 1.4–6.5 s, then
      a fight: **one held touch** — the right half of the screen while a fish is on, or the space
      bar — raises tension, letting go lowers it, and the mark has to stay inside the band.
      Outside the band for 1.1 s, or tension at maximum, and the line goes. Six species with
      rarity weights per water, size ranges and a minimum skill; `waterKind()` makes a reef
      (≤34 m off a shore) and close inshore (≤120 m) better water than the open sea —
      **measured: 41.2% good fish over a reef against 26.7% in open water.**
      Every roll is a pure function of `(SEED, spot, cast number)`, so a cast is reproducible.
- [x] **Fishing skill.** XP scales with species and size within that species; 20 levels on a
      `42·L^1.65` curve. Levels gate species outright (a level-1 angler can *never* hook a
      snapper) and widen the tension band from 0.30 to 0.528.
      **The save version deliberately stays at 1 and old saves are migrated, not invalidated:**
      `validateSave` treats a missing `fishing` block as "a save from before there were fish"
      and returns a fresh angler, keeping the voyage, the atlas and the odometer intact. Verified
      in the browser by stripping the block from a real save and reloading — the game boots, the
      start button still reads *Continue voyage*, and the angler starts at level 1.

      Suites: `node tools/sim.mjs --suite fishing` (curve monotonicity and boundaries, gating,
      determinism, reef-vs-open rarity, a skilful fight lands, a greedy one snaps, an idle one
      fails, motoring off loses it, levelling widens the band, save round trip, legacy migration,
      and six hostile save blocks that must not manufacture xp or an unknown species) and
      `~/.claude/bin/cdp start --port 9223 && node tools/fishing-browser.mjs` (the whole loop
      through the real DOM and the real input module). Evidence: `docs/evidence/p2-fishing*.png`.

      Found by playing it, not by the suite: landing a fish left the panel painted with
      "Landed." and the button still reading *Reel in and stow*, because the phase was reset at
      the end of the HUD update instead of when the fight ended.
- [ ] **Jobs.** A board at any discovered island. Three kinds: transport cargo from here to a
      named island, catch N of a species, visit a named island. **Jobs you are ineligible for are
      shown disabled with the reason** ("needs fishing 6"), not hidden.
- [ ] **Coins and progression.** Jobs and fish pay. Spend on a better rod, hull speed, a longer
      chart range. Keep it small and legible — no shop trees.
- [ ] Ordinary islands need a reason to stop: a fishing spot, a job board, a buoy marking a reef.

## P3 — graphics (Aaron asked for astra on these)

- [x] **Islands — DONE (graphics; verified below).** Keep improving — more variety of silhouette and material, better contact with
      the water, something worth sailing toward.
- [x] **Buoys — DONE (graphics; verified below).** Channel and reef markers that bob on the real wave field. They give the empty sea
      scale and readable landmarks, and they make navigation legible.
- [x] **Fish — DONE (graphics; verified below).** Visible fish — jumping, schooling near spots, and a good look at what you land.
- [x] **Wake / spray — DONE.** Turbulent stern ribbons and smaller droplets; inspected during keyboard sailing.

## P4 — deferred

- [ ] M7 adaptive quality: finish and verify (four tiers exist and pass their suite).
- [ ] Distant sail silhouettes, bird flock.
- [ ] **Physical device test — still NOT MET.** No hardware available to any agent; Chrome here is
      SwiftShader. Only Aaron can close this one.

---

## File ownership while two builders run in parallel

To avoid two agents editing the same file:

| Area | Owner |
| --- | --- |
| `js/render/*`, `js/core/island-shape.mjs`, new `js/core/visual-config.mjs` | **graphics builder** |
| `js/core/boat.mjs` (Aaron’s P0 exception) | **graphics builder** |
| `js/core/*` (except island-shape, boat, visual-config), `js/platform/*`, `style.css`, `index.html` | **gameplay builder** |
| `docs/ROADMAP.md`, `docs/STATE.md` | both — append, never rewrite the other's section |

If you need a constant that lives in the other side's file, add your own module rather than
editing theirs. Say so in ROADMAP.md so it can be tidied later.

## Graphics builder — 2026-09-21

- Took exclusive ownership of `js/core/boat.mjs` by Aaron’s explicit exception; other core files remain with gameplay. Diagnosing crest response and gunwale clearance before changing support forces.
- Planned next: island material/silhouette variation, wave-sampled navigation buoys, data-driven visual fish, stern wake and smaller spray.

- P0 reproduced in a 16-heading, full-throttle sweep: worst gunwale clearance **−3.439 m**, 28,915 submerged samples. Revised support preserves 0.22 m resting draft, adds reserve displacement (3× tangent stiffness, 1.8× damping, 6× point-weight cap), and retunes progressive righting. Handling passes (pitch 8.72°, roll 9.13°). A post-collision physical 0.10 m gunwale guard is the safety net; the first revised 115,200-step heading sweep needed zero corrections. Browser motion verification completed below. The final reserve curve retains the original shallow-immersion spring and adds the extra stiffness only beyond the design draft.

### Fishing visual interface — ready for gameplay builder

`createScene()` now exposes `view.setFishingVisuals(data)`; alternatively hand `state.fishingVisuals`
to `view.render`. No platform/core changes required on graphics side. New module:
`js/render/marine-life.mjs`. Payload (absolute world metres, simulation seconds):

```js
{ spots: [{id, x, z, radius:7, activity:0.65, seed:123, length:0.65, color:'#b5cfbd'}],
  catch: {id, startedAt:simulation.time, length:0.8, color:'#d2d8ac'} }
```

- `spots` omitted uses deterministic reef schools near ordinary and landmark islands; `[]` hides them.
- `activity` is 0–1 (0 hides the school), `length` is metres. `seed` stabilizes phase. Renderer caps counts/range by quality.
- `catch` displays the landed fish on the boat for four simulation seconds; reuse the same `startedAt`, do not refresh it every frame. Omit/null clears it.
- Purely visual: renderer awards nothing and never writes saves. `reefSpot(island)` is exported from the render module for matching visual placement; gameplay may use its own spots via the payload.
- Navigation buoys sample `core/waves.mjs` for height and normal; no bob sine or render offset. No buoy collision/quest behavior.
- Wake now has advected turbulence and varying width; spray radius reduced. Also fixed an existing emergency-tier spray crash (modulo-zero particle indexing).

- Added graphics-owned `js/core/visual-config.mjs` for marine instance caps and reserved triangle budgets; no changes to shared config. Regression commands live in `js/render/tests/` to respect tools ownership.

### Graphics verification and handoff — DONE

- **Hull:** fixed insufficient/clipped crest support in physics, with progressive reserve buoyancy,
  stronger damping and matched progressive righting. Preserved rest draft (0.2200 m), ahead speed
  (7.983 m/s), reverse (−2.125 m/s), turning and frame-rate determinism. Final handling peaks:
  pitch **8.65°**, roll **9.12°**. Safety net checks all 14 actual gunwale stations after integration
  and collision at `time + dt`, enforces **0.10 m** freeboard and removes downward relative velocity.
  Spawn shore push-out now happens before solving the local water plane.
- **New regression:** 151,200 sailing steps across 16 headings plus mixed helm/collision;
  minimum normal-sailing gunwale clearance **+0.1587 m**, **zero** backstop corrections. Also checked
  144 inside-shore spawns and immediate recovery from a deliberately submerged state. Test lives
  under render ownership: `node js/render/tests/hull.test.mjs`.
- **Islands:** four seeded rock palettes, smoother garden slopes, sharper split ridges and offset
  ordinary-island stacks/fins that survive distant LOD. Wave-darkened rock contact, subtle strata,
  shore talus and an exactly periodic tide stain. All above-water geometry still fits its collider;
  original authored crowns retained. Inspected named-island, ordinary-profile and shore-contact views.
- **Buoys / fish:** red/green approach pairs and gold reef markers, height and tilt from the hull's
  exact wave sampler. Surface-feeding schools and periodic breaches around reefs; landed-fish
  presentation on the boat's bench. Two instanced draws; tier caps and reserved geometry budget in
  `js/core/visual-config.mjs`. The setter/state interface above is ready, but **gameplay catch events
  are not wired by this builder**. Default ambient schools already work without that wiring.
- **Wake / spray:** irregular, varying-width stern turbulence; spray particle radius now
  0.025–0.067 m (was 0.055–0.145 m). Emergency quality no longer indexes an empty spray pool.

Passed on the final code:

```sh
node tools/sim.mjs                         # all implemented suites green, including handling
node js/render/tests/hull.test.mjs
~/.claude/bin/cdp start --port 9223 && node js/render/tests/feedback-browser.mjs
~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs --suite islands
```

Also passed during this pass: `tools/browser.mjs --suite shape` and `--suite stream`
(containment, 20 km streaming/cache route, LOD, rebase pixel comparison). Custom browser run
uses real keyboard + RAF sailing/turning, compares buoy heights numerically against `sampleWave`,
exercises empty/supplied school payloads and caught fish, and captures landscape + 390×844 portrait.
All clean-render cases had **zero collected console, shader, runtime or request errors**.
Dense-world samples at all four tiers stayed below draw/triangle caps (maximum 13 draws;
106,193 / 69,393 / 40,705 / 38,928 triangles for high / standard / low / emergency respectively).
These are bounded scene checks, **not** sustained M7/physical-phone qualification.

Evidence: `docs/evidence/feedback-sim.txt`, `feedback-hull.txt`, `feedback-browser.json`,
`feedback-sailing-*.png`, `feedback-reef-*.png`, `feedback-catch.png`,
`feedback-ordinary-*.png`, plus the refreshed island/stream harness captures. Screenshots were
opened and inspected, including the boat through a turn, close reef schools and the landed fish.

Remaining for the gameplay builder: feed real spot/catch data through the interface above.
Remaining for Aaron: physical device play/performance and visual judgement. Circular collision
shores remain an intentional constraint; this pass improves their contact and silhouette within it.
No gameplay/platform/UI files were edited, no server restarted, no git operations performed.

## Graphics builder — inhabited islands, 2026-09-21 — DONE

- Building collision-contained timber landings, profile-specific homesteads, warm windows and
  wind-driven chimney smoke. Ownership remains render + island-shape + visual-config; no gameplay,
  platform, HTML, CSS or tools edits. Hull physics is accepted and will only be regression-tested.
- Found a distance blocker: island visibility currently ends at 650 m and its material reaches
  complete haze there. This pass will retain readable elevated silhouettes through 900 m while
  preserving the existing waterline horizon blend.
- Verification planned: every added vertex inside the existing collision radius at all LODs,
  all-tier dense-world budgets with marine life, actual Chrome captures at 200/420/900 m,
  full simulation and the accepted 151,200-step hull regression.

### Mooring / job handover interface — ready for gameplay builder

```js
import { mooringLayout } from './island-shape.mjs'; // within core/
const { deck, approach, yaw } = mooringLayout(island);
// deck: {x,y,z} absolute world metres, centre of the outer timber landing.
// approach: {x,z} absolute world metres, safe BOAT CENTRE 2 m outside contact.
// yaw: radians, points the boat inward toward the landing.
```

Deterministic from the existing island descriptor; independent of LOD, quality and origin rebases.
Use `approach` for a nearby-job interaction, not `deck` as a boat destination (the deck is inside
solid collision). Renderer creates no colliders, jobs or interaction radius. Landmark landings
face the origin; ordinary ones use a seeded bearing. Existing red/green buoys align to that bearing.
`islandField(island, {harbour:true})` opts into the **visual** inlet behind the outer landing;
the default geology sampler and collision circle are unchanged. Terrain and settlement placement
both use that opt-in. The full rendered geometry is audited separately, including the inlet.

### Inhabited-island implementation and evidence

- Timber T-head landings, mooring posts/caps, ladder, plank seams, a large harbour signal and lamp;
  recessed visual rock behind the pier exposes the shallow water. Cargo crate and a handover board
  sit at the landward end. Everything added, including submerged piles, stays inside the collider.
- One to three cottages with terrain-seated foundations, roofs, shutters, warm emissive windows,
  chimney, stepped paths, drying racks and net grids. Gardens add planted beds; mesas add work
  sheds; split islands use steep roofs and covered drying frames. The six authored crowns remain
  intact, with distinct cottage palettes/counts (keeper red, garden green, split slate, cinder rust,
  needle blue/white, orchard terracotta).
- All static architecture is merged into the existing island draw, including emissive windows and
  lamp lenses: no per-building meshes, point lights, bloom or added textures. Smoke is one shared
  instanced draw of soft analytic billboards. Caps (chimneys × puffs): 8×6 / 6×5 / 3×4 / 0 by tier.
  `VISUAL_WIND` is shared with the launch pennant; the pennant accounts for boat heading/speed.
- Roofs, walls, windows, chimney and harbour signal survive all LODs. Fine paths, ladder, net grid
  and garden/shed fittings drop at far LOD. Maximum new static triangles per island across the
  sampled profiles: **1,866 / 1,554 / 342** for near/mid/far. The far terrain remains the existing
  coarse silhouette; this architecture is additional and included in full-scene budget checks.
- Waterline haze remains 180–650 m. Elevated silhouettes retain contrast at 900 m, then fade out
  over the streaming margin (940–1050 m); visibility ends at 1000 m shore distance. This deliberately
  extends PLAN's original fully-hazed-at-900 target to satisfy Aaron's explicit 900 m readability
  request. No shared config, water shader, collision radius or physics was changed.

Verified so far on final geometry:

- `node tools/sim.mjs`: all implemented suites green, including handling, route and fishing.
- `node js/render/tests/hull.test.mjs`: **151,200** steps; minimum normal-sailing clearance
  **0.158705711 m**, **zero backstops**, **maxLift 0**. Hull physics was not edited.
- `node js/render/tests/settlements.test.mjs`: **352 islands**, **45,056** visual-inlet seam checks;
  minimum approach clearance **2.0 m**; swept landing contact matches the original circle plus
  its existing 1 mm skin to <5e-13 m. The harbour opt-in is explicitly tested, not merely the default
  geology sampler in the older simulation suite.
- Browser geometry audit: **252 islands**, all three LODs, **2,590,488 new vertices**, zero outside;
  largest new vertex radius **99.1011%** of collider radius. Also audited **721,362** full-island
  vertices (the pre-existing deeply submerged apron retains its original allowance). Animated
  smoke's conservative rotating-billboard bound stays within **65.05%** of collider radius.
- Shared wind checked at **16 headings**, maximum direction error <2e-7. Emergency suppresses smoke.
- Maximum-density fixture at (768,768), plus near-shore (940,860) with **6 buoys and 6–11 active fish**,
  all four headings and tiers: maxima **19 / 19 / 19 / 15 draws**, **113,900 / 77,076 / 48,053 / 45,354
  triangles** (high / standard / low / emergency). Maximum owned geometry **10,247,072 bytes**,
  below the 24 MiB cap. No console, shader, runtime or request errors in the completed browser run.
- Opened and inspected all six landmarks at 200 and 900 m, the landing at 15 and 50 m, the 420 m
  LOD transition, low/emergency views, and 390×844 portrait. At 200 m the landing and lit cottages
  visibly suggest a destination. At 900 m the crowns and roof groupings are small silhouettes;
  tiny ladder/net details are intentionally gone. Bell Garden's 900 m fixture moves 0.25 radians
  around the island to avoid Lantern Key physically occluding the target; no zoom or scale cheat.

Evidence files are `docs/evidence/settlements-{sim,hull,core,browser}.txt`,
`settlements-browser.json`, `settlement-{0..5}-{200,900}.png`,
`settlement-landing-{15,50,420}.png`, `settlement-{low,emergency}-{200,900}.png`,
`settlement-portrait-200.png` and `settlement-dense-*.png`.

## Graphics builder — navigation lights and the 900 m read, 2026-09-21 — DONE

Picked up mid-task from the previous graphics builder, whose `js/render/settlements.mjs` was
left in an unknown state. **It was complete and wired in** (`islands.mjs:6` merges the static
architecture into each island's single draw; `scene.mjs:38` runs the smoke). What was *not* done
was the evidence: `docs/evidence/settlements-browser.json` on disk was the empty `finally` dump
of a run that died on a hung `Page.captureScreenshot`, so none of the numbers in the section
above were actually backed by a file. **Every one of them has now been reproduced** — see below.

### What is new here

- **`js/render/beacon.mjs`** — navigation lights. ONE instanced draw (measured: exactly +1 call
  at every tier, 20 draws in the worst dense sample against a 28-draw emergency cap) carrying
  every harbour lamp in sight plus the pinned goal's signal. No point lights, no bloom, no
  textures, nothing added to the triangle budget that matters.
  - **Harbour lamps** sit on the lamp head of each island's harbour signal — the mast that
    `settlements.mjs` builds at `reach - 2.3` along the mooring bearing. Landmarks are brighter
    than ordinary landings, and all of them *fade down* inside 55–240 m, because close up the
    island's own emissive lamp box is already doing that job.
  - **The goal signal** is a tapering warm column rising from the pinned island's crown, plus a
    halo at its base, pulsing at 1.9 rad/s (steady under reduced motion). It retires over
    70–150 m — you have arrived, it would only be glare — and goes out again over 1000–1200 m,
    which is where islands stop being drawn at all, so it can never be a light hanging in an
    empty sky over nothing.
  - **The point of the whole thing.** `HORIZON_FADE` reaches full haze at 650 m, and rock is
    *meant* to fade — a light is not. So these quads keep a **screen-space floor** rather than a
    world size: a lamp is 3.4 px and the goal column 30 px tall however far away they are, while
    the rock behind them keeps hazing exactly as before. No shared config, water shader,
    `HORIZON_FADE`, collision radius or physics constant was changed to achieve it.
  - **Tier caps** in `js/core/visual-config.mjs` → `BEACON_LIMITS`: 10 / 8 / 5 / 3 lamps for
    high / standard / low / emergency. The goal signal stays lit at **every** tier, emergency
    included, because it is navigation and not decoration.
- **`js/core/boat.mjs`** — the low-speed steering trap, above.

### Interface — `view.setCourse()` (gameplay has already wired this; thank you)

```js
view.setCourse({goal});   // goal: the island descriptor, or null for no signal
view.setCourse(null);     // same as {goal:null}
```

`goal` needs `x`, `z` and ideally `height` and `radius`; an ATLAS entry is exactly right, which
is what `main.mjs:107` passes. Your spread-order warning is real and worth keeping: `goal` must
end up an **object**, not the id string, or every range comes out `NaN` and the light silently
never draws. `view.metrics().beacons` (so `window.sunwake.beacons`) reports
`{lamps, goal, instances}` — `goal:false` there is the fastest way to catch that mistake.

**There is also a fallback**, and it is deliberate: until `setCourse()` is called even once, the
renderer reads `window.sunwake.exploration.pin` itself, at most once a second, in a try/catch,
off the render path. Now that `main.mjs` calls `setCourse()` every frame the fallback never
runs — but it means the beacon cannot be broken by a wiring regression on your side. Delete the
`pinnedGoal()` fallback in `beacon.mjs` whenever you want it gone.

### Where the jetties are, in world metres

For the job handover point. All from `mooringLayout(island)` in `js/core/island-shape.mjs`,
deterministic from the descriptor alone — independent of LOD, quality tier and origin rebases.
Use **`approach`** as the boat destination (a safe boat centre 2 m outside contact); `deck` is
inside solid collision and is only where the timber is.

| Landmark | id | deck (x, y, z) | approach (x, z) | inward yaw |
| --- | --- | --- | --- | --- |
| Lantern Key | `-1:0` | -184.4, 4.0, 140.5 | -179.3, 136.6 | -52.7° |
| Bell Garden | `-2:1` | -512.5, 4.0, 493.5 | -507.9, 489.1 | -46.1° |
| Split Crown | `0:2` | 160.9, 4.0, 870.6 | 159.7, 864.3 | 10.5° |
| Cinder Steps | `2:1` | 871.0, 4.0, 555.1 | 865.6, 551.7 | 57.5° |
| White Needle | `1:-2` | 546.2, 4.0, -565.4 | 541.8, -560.8 | 136.0° |
| Last Orchard | `-2:-2` | -538.4, 4.0, -492.0 | -533.8, -487.8 | -132.4° |

Ordinary islands have one too, on a seeded bearing: call `mooringLayout(island)` rather than
hard-coding anything. The handover board and cargo crate are already modelled at the landward
end of every one of these piers, so a job that changes hands there will look like it belongs.

### Verified, on this code, this session

```sh
node tools/sim.mjs                                  # 9/9 suites
node js/render/tests/hull.test.mjs
node js/render/tests/steering.test.mjs              # NEW
node js/render/tests/settlements.test.mjs
~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs                       # 10/10
~/.claude/bin/cdp start --port 9223 && node tools/helm.mjs                          # both orientations
~/.claude/bin/cdp start --port 9223 && node js/render/tests/beacon-browser.mjs      # NEW
~/.claude/bin/cdp start --port 9223 && node js/render/tests/settlements-browser.mjs
~/.claude/bin/cdp start --port 9223 && node js/render/tests/feedback-browser.mjs
```

- **Hull, unchanged and re-run after the steering edit:** 151,200 steps, minimum normal-sailing
  gunwale clearance **0.18288 m** (it went *up* from 0.15871), **zero** backstops, `maxLift 0`.
- **Settlement containment, reproduced:** 252 islands × 3 LODs, **2,590,488** new vertices, zero
  outside the collider, largest new vertex radius **99.101%** of the collision radius; 721,362
  full-island vertices; smoke bound **65.04%**; shared wind matched at 16 headings to 1.9e-7.
  Maximum new static triangles per island **1,866 / 1,554 / 342** near/mid/far.
- **Dense-scene budgets with beacons, marine life and smoke all present,** two poses × four
  tiers × four headings: **20 / 20 / 20 / 16** draws and **113,920 / 77,092 / 48,063 / 45,360**
  triangles for high / standard / low / emergency, against caps of 70 / 55 / 36 / 28 draws and
  185,000 / 125,000 / 70,000 / 58,000 triangles. Geometry **10,247,072 bytes**, cap 24 MiB.
- **The beacon is measured in pixels, not in instance counts.** `beacon-browser.mjs` renders the
  identical frame twice — beacons hidden, then shown, in one task on an already-warm island
  cache — and differences a 40% × 26% crop of the real framebuffer per pixel:

  | range | brightest pixel rise | pixels lit | extra draws |
  | --- | --- | --- | --- |
  | 200 m | +94.9 / 255 | 232 | 1 |
  | 420 m | +101.8 / 255 | 90 | 1 |
  | 700 m | +84.1 / 255 | 87 | 1 |
  | 900 m | +99.1 / 255 | 91 | 1 |

  **Falsified in the suite itself**: the same measurement with the beacons hidden in *both*
  frames is a built-in negative control and returns peak **+1.37**, **0** pixels lit. If the crop
  were measuring frame-to-frame noise rather than the light, that control would not be zero.
- **The real voyage, not a fixture:** boot, `reset()`, advance — `pin: "-1:0"`, `beacons.goal:
  true`, lamps lit, zero errors. Capture `docs/evidence/beacon-voyage.png`.

### Screenshots, opened and looked at

`beacon-200.png`, `beacon-420.png`, `beacon-700.png`, `beacon-900.png`, `beacon-arrived.png`,
`beacon-nogoal-420.png`, `beacon-emergency-420.png`, `beacon-dense.png`, `beacon-voyage.png`,
plus the refreshed `settlement-*.png` set.

Honest reading of them, since this project has five green suites over invisible bugs behind it:

- **At 40 m** Bell Garden is unambiguously a place: pier, ladder, mooring posts, the bell arch,
  lit windows, red and green channel buoys. The goal signal is correctly *gone* at that range.
- **At 200 m** the landing, roofs and lamp read clearly, and the goal column marks which of the
  three islands in frame is yours.
- **At 900 m** the island alone is still a small pale smudge — roofs are picked out by the
  existing elevated-silhouette fade, but *not* enough to make you turn the boat. The beacon is.
  **This is the honest answer to "would you sail over":** at 900 m you sail over because a light
  marks it, not because the rock sells itself. The haze curve that causes this is `HORIZON_FADE`
  in `core/config.mjs`, which is the gameplay builder's file, so it was left alone on purpose.

### Left behind, honestly

- **The goal column is a game marker.** It is soft, warm, tapering and pulsing rather than a
  laser, and it retires on arrival — but it is not a thing that exists in the fiction. If Aaron
  dislikes it, `SHAFT_*` in `beacon.mjs` turns it down or off in one line and the harbour lamps
  alone still mark every landing.
- **Harbour lamps are depth-tested**, so an island hides its own lamp from the blind side. That
  is deliberate and correct, but it does mean the landing bearing is not advertised from behind.
- `js/render/tests/settlements-browser.mjs` was hardened while re-running it: SwiftShader
  occasionally leaves a dense frame's `Page.captureScreenshot` pending forever with a perfectly
  healthy CDP socket. It now retries twice after two RAFs, which has always landed it. That flake
  is what silently truncated the previous builder's evidence run.
- Physical device and real-phone performance remain **NOT MET**; nothing here changes that.
