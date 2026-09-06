# SECOND HAND

A portrait-first Three.js clockwork heist. The first playable tower is a visual
vertical slice: wind the mainspring, rewind that action into an echo, release
the counterweight while the echo supplies power, and recover the chronometer.

## Run

The workspace's existing server serves this project at:

http://localhost:8888/gms/3d/secondhand/

Alternatively, serve the **site root**, not this folder, because Three.js lives
in the shared `gms/lib/three/` directory:

```sh
cd /Users/aaronair/cc/yru/site
python3 -m http.server 8890
```

## Play

- Wind spring records a five-second action. The timeline stops when it finishes.
- Rewind returns to that interval. The echo now winds the spring for you.
- Release weight during the echo to break the glass and open the iris.
- Take artefact completes the heist. Watch the heist replays the recorded events.
- The time slider scrubs recorded history, including glass fracture and reassembly.
- Drag the scene to orbit; pinch or use the mouse wheel to zoom. The inspection
  button cycles through the three mechanisms and the complete tower.
- Space toggles playback; R rewinds; Escape restores the interface in photo mode.
- Sound starts only after the sound button is pressed. Quality and camera-motion
  preferences, and the best completion time, are saved locally when available.

## Files

- `main.js`: lighting, camera, input, UI, render loop, adaptive pixel ratio.
- `tower.js`: code-built geometry, materials, batching, reversible machinery.
- `glass.js`: Rapier fracture simulation and interpolated transform recording.
- `heist.js`: simulation-independent puzzle and timeline state.
- `audio.js`: synthesized mechanical ticks, glass harmonics and completion tones.
- `tests/heist.test.mjs`: regression coverage for recording, echo gates and replay.

Run the state tests from this folder:

```sh
node --test tests/heist.test.mjs
```

The browser regression script uses Playwright and the installed Mac Chrome.
It covers touch input, pause/resume, the complete heist, exact repeated glass
poses, replay, reset, preferences, sound, and five viewport sizes:

```sh
npm install --prefix /private/tmp/second-hand-tools playwright
PLAYWRIGHT_MODULE=/private/tmp/second-hand-tools/node_modules/playwright node tests/browser.mjs
```

Override `CHROME_PATH` or `SECONDHAND_URL` when needed. Screenshots are written
to `/private/tmp/second-hand-*.png`; the test uses an isolated browser profile.

## Rendering Contract

Three.js 0.180.0 comes from `../../lib/three/0.180.0/`. The shared 0.160.0
`BufferGeometryUtils` is used only for its compatible `mergeGeometries` helper.
Rapier 0.17.3 and Lucide 0.468.0 are vendored with their licenses. Rapier's WASM
is embedded in the compatibility module, so no separate WASM fetch is needed.
DM Sans and Manrope are vendored under the SIL Open Font License. Runtime
requests stay on the site's own origin.

Sixty glass pieces are simulated at 60 Hz for seven seconds, then their poses
are sampled from a bounded Float32Array. Rewinding never attempts negative
physics timesteps. One intact pane replaces the fragments before impact.
Fixed geometry is batched by material; articulated assemblies remain separate.
Adaptive quality caps pixel ratio at 1.35 on narrow screens and 1.5 elsewhere,
and drops to 1 when the initial frame timing is slow. Low quality disables
the directional shadow; high quality allows pixel ratio up to 2.

The `window.secondHand` object exposes read-only state, render metrics,
a sample fragment pose and mechanism screen coordinates for browser checks.

## Scope

This is one complete short heist, not a multi-tower campaign. The fracture is
physically simulated; the mechanism opening and counterweight are authored
animations driven by the same timeline. There is one recorded echo, no player
avatar, no backend and no external AI service needed during play.
