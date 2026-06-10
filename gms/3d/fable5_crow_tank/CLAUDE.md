# Murder at Dusk — Fable 5 evil crow shooter

Wave shooter: drive a flak tank around a dusk farm field and shoot down
evil crows (glowing red eyes) that wheel overhead and dive at you.
Three.js 0.160 via CDN importmap, no build step.

## Files

- `js/config.js` — all gameplay tuning (waves, crow variants, tank stats)
  and the `?shot` / `?lite` / `?auto` URL modes
- `js/main.js` — boot, wave lifecycle, aiming (mouse cone snap / touch
  auto-aim), auto-driver for soak tests, camera, main loop
- `js/world.js` — dusk farm environment: gradient sky shader, sun, terrain,
  barn, windmill, fence, fireflies; exports `obstacles` collision circles
- `js/crows.js` — crow mesh factory + state machine
  (orbit → aim eye-flare → dive → skim → climb), variants crow/brute/boss
- `js/tank.js` — tank mesh + movement + turret tracking + firing
- `js/combat.js` — pooled tracer shells, segment-vs-sphere hits
- `js/particles.js` — pooled feathers / sparks / dust
- `js/ui.js` — HUD, banners, popups (never `alert()`), threat arrows
- `js/audio.js` — procedural Web Audio (caw, flak shot, wind ambience)
- `js/state.js`, `js/utils.js`, `js/input.js` — shared state / helpers / input

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`). `?auto=1&lite=1` lets the AI play in real
time (`window.__state` / `window.__game` hooks); `?shot=1` stages the
thumbnail frame. Chrome's `--virtual-time-budget` does NOT advance the sim.
