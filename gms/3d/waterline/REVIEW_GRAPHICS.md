# Waterline review — 23 September 2026

Scope: Waterline graphics, impact performance, and the fleet visibility control.

## Priority fixes completed

1. **P1: transparent-looking hulls.** Port and starboard triangles faced inward.
   Back-face culling removed the near wall and exposed the far wall. Corrected
   the winding rather than making every hull double-sided. Raised painted-steel
   roughness and reduced metalness/environment reflections. Raycasts verify both
   sides on destroyers, cruisers and battleships.
2. **P1: first-impact freeze.** Creating point lights during combat changed the
   shader light count; the original first hit compiled 19 additional programs.
   Lights now exist from boot. Effect textures, materials and reusable splash
   geometry are prepared and rendered offscreen behind the loading screen.
3. **P1: particle timing and cleanup.** The first emitter flushed shared buffers
   before later emitters and before the camera moved. Uploads now happen once
   after all updates. This also clears the final dead effect instead of leaving
   a stale particle image. Empty fields skip matrix work and drawing.
4. **P1: fast-forward desynchronisation.** Shells previously advanced on real time
   while the cinematic advanced faster. Cinematic shells now use the director's
   phase, reach the target with the camera, and release their trail at impact.
5. **P2: pooled effects interfering with each other.** Lights and splash meshes
   could be stolen while previous owners still updated/released them. Full pools
   now omit optional resources. Overflow splashes retain available spray cards;
   three full splash columns/foam patches remain the geometry budget. Burning
   ships leave two light slots for transient flashes; flashes release their light
   when illumination ends. Effect handles can safely be killed twice.
6. **P2: ordnance and explosion readability.** Brighter, hotter shell cores,
   lighter vapour trails, directional spark streaks and immediate initial
   ignition. Restored the splash-column shader hook lost by material cloning.
7. **Verification tooling.** Fixed the screenshot server root so vendored Three.js
   resolves. Async browser probes now await results and fail on exceptions;
   `--evalfile` runs repeatable probes without shell interpolation.
8. **P2: fleet eye alignment, desktop and mobile.** The shared `.hud button` rule
   overrode the eye's zero padding and 26px height. Increased the eye selector's
   specificity so its icon is centered inside the intended square, preserving
   the expanded 44px touch target. Verified both privacy states at phone and
   desktop widths using icon/button center coordinates and hit testing.

## Verification

Original HEAD was copied into `/tmp/waterline-baseline`, preserving the working
checkout. Both builds used the same headed Chrome impact probe, 1280×720, high
preset, DPR 1, on this Mac. These are local samples, not phone benchmarks.

| Measurement | Original | Updated |
| --- | ---: | ---: |
| First-hit longest frame | 1789.1 ms | 18.7 ms |
| First-hit new shader variants | 19 | 0 |
| First-hit frame p95 | 18.2 ms | 17.7 ms |
| First-splash creation | 16.8 ms | 1.5 ms |
| Nine-splash creation | 5.8 ms | 1.7 ms |

- Existing desktop gameplay/cinematic checks: **19/19 passed**.
- Existing portrait touch HUD/toggle checks: **10/10 passed**.
- New rendering regression probe: **22/22 passed**. Checks hull occlusion, material opacity, pool
  ownership/reserves, shader stability, concurrent particle uploads, cleanup,
  simultaneous splashes and fast-forward arrival.
- Inspected desktop broadside, hit/explosion and splash images, plus portrait
  shell flight. These scenarios ran at approximately 60 FPS without reported
  JavaScript or shader errors. Portrait emulation uses 390×844 at DPR 2/medium.
- Syntax checks and `git diff --check` pass.

Reproduce from this folder:

```sh
node tools/shot.mjs --shot=boot --headed --dpr=1 --evalfile=tools/impact_profile.js --outdir=/tmp/waterline-profile
node tools/shot.mjs --shot=boot --mobile --w=390 --h=844 --preset=medium --dpr=2 --evalfile=tools/render_checks.js --outdir=/tmp/waterline-checks
node tools/gates_pace.mjs --headed
node tools/gates_pace.mjs --mobile --quick
node tools/adversarial_sim.mjs
```

## Lower-priority follow-ups

The simulation adversarial audit reports **51 held / 4 broken**. No simulation
rules changed in this pass. G5 is intentionally allowed by D33/D39; G5b's
historical placement-event rewrite is a documented older limitation. A future
replay/history change should append corrective placement events with compatible
save handling. K4 concerns the Ghost placement strategy's exploitability; L1
concerns deliberate ways to bypass a regex-based source audit. These should be
handled separately from the combat rendering fixes.

Physical Android/iOS performance and Safari remain unverified.
