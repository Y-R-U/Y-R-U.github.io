# FX lane: effects

Owner: lane FX. Files: `js/fx/**`, `tools/fx.html`, this doc. Evidence: `docs/shots/fx/`.

The effects are pooled and use a fixed number of draw calls: a 4×4 sprite atlas is drawn on a canvas at boot (no assets),
and every pool is allocated once at its maximum size. Changing the quality tier only changes caps and emission rates,
so `setQuality` never allocates.

## Files
| file | what |
|---|---|
| `js/fx/index.js` | `createFX()`: tiers, plane tracking, every effect recipe, the event adapters |
| `js/fx/particles.js` | one instanced billboard pool (1 call): billboard / velocity-stretched / ground-flat quads, premultiplied blend so smoke (alpha) and fire/sparks (additive) share the call, 256-bucket back-to-front sort |
| `js/fx/ribbons.js` | camera-facing ribbon trails (wingtip vapour), all trails in 1 call |
| `js/fx/skids.js` | tyre-mark decals: ring buffer of flat quads, faded in the shader (1 call) |
| `js/fx/debris.js` | crash debris: one `InstancedMesh` (lit, livery-coloured panels, struts and a runaway wheel) |
| `js/fx/screen.js` | high tier only: heat-shimmer refraction (≤256² framebuffer copy) and the cockpit sun glare plus windscreen grime |
| `js/fx/atlas.js` | the canvas atlas: puff×2, glow, streak, cartoon star, ring, confetti, sparkle, fire, drop, dust, wisp, flecks, spray, soot, comic POW |

All the custom shaders include the fog chunks, with `mvPosition` in scope, so they pick up AIRPORT's patched FogExp2
(aerial perspective and cloud shadows). Additive particles fade to black in fog instead of glowing haze-coloured.

## API
```js
import { createFX } from './fx/index.js';
const fx = createFX({ scene, camera, renderer, quality: 'low'|'medium'|'high', world }); // world: buildWorld() result
fx.update(dt);              // once per frame, after rigs are synced and the camera has moved, before render. dt 0 = frozen
fx.setQuality(q);           // also call from the D6 governor
fx.setView('chase'|'center'|'cockpit');   // inside views get celebrations in front of the camera, glare, no shimmer
fx.track(id, { rig, ac, player = false, applyScale = true });  // continuous effects for this plane
fx.untrack(id); fx.reset(id);             // reset = respawn: clears damage smoke, trails, squash
fx.onAircraftEvent(id, ev); // Aircraft events: touchdown, impact, crash, tailstrike
fx.onGameEvent(type, d, id = 'player');   // SCORE events: combo, rankUp, protection
// low-level emitters (the adapters above call these)
fx.touchdown({ id | pos, sinkFpm, sideslip, surface, vel? });
fx.wash({ pos, dir, power, surface });   // one frame's worth, for untracked emitters
fx.vapour({ wingtipL, wingtipR, intensity });           // ditto, one manual trail pair
fx.impact({ id | pos, kind: 'bounce'|'damage'|'crash'|'water', normal?, strength 0..1, vel?, colors? }); // → squash Vector3 | null
fx.damageSmoke(id, { level 0..1 });     // tracked: persistent level. Untracked: pass pos every frame
fx.celebrate({ id | pos, kind: 'combo'|'rankup', mult? });
fx.scaleOf(id);             // the live squash-and-stretch Vector3 (FX applies it to rig.root.scale when applyScale)
fx.setWindFrom(fromDeg, kt) / fx.setWind(x, z);   // default comes from world.wind
fx.setLight(0..1);          // dims smoke/vapour at night (FX has no time of day yet)
fx.stats(); fx.clear(); fx.dispose(); fx.setTiming(true) // timing is for benches only, see Allocations
```
A tracked plane needs nothing else per frame. FX reads `rig.root.matrixWorld`, `rig.dims` and the Aircraft fields
`vel, alpha, beta, agl, onGround, surface, eng, ctl.brake, crashed`. If there is no `ac`, it works the velocity out from
the root's movement. The effect anchors (wingtips, mains, prop, exhaust, cowl, tail) are the C172's, scaled by `dims`.
PLANE can give other types exact anchors through an optional `rig.fxPoints = { tipL, tipR, mainL, mainR, nose, prop,
exhaust, cowl, tail }` (root-local).

## What drives what
| effect | trigger (automatic for tracked planes) | notes |
|---|---|---|
| tyre smoke burst | `touchdown` event, paved surface | intensity = sink rate (120 to 820 fpm) + sideslip (β) |
| skid marks | after a touchdown (0.25–0.8 s by intensity), or brake > 0.75 above 10 m/s on paved surfaces | fade over 25 s (low), 40 s (medium), 60 s (high) |
| grass/dirt touchdown dust + flecks | `touchdown` on grass/dirt | |
| prop wash | engine > 45 %, AGL < 5 m, slow | heavy on grass/dirt; faint grit on paved surfaces only when nearly stopped |
| rolling dust trail | on the ground on grass/dirt above 2 m/s | taxi and landing roll |
| wingtip vapour | airborne, above 28 m/s, load factor 1.7 to 2.8 g or AoA 0.15 to 0.25 rad | load factor comes from the velocity derivative along the plane's up axis |
| heat shimmer | player only, high tier, chase view, ≤ 70 m away, AGL < 2, engine high, below 28 m/s | real refraction, see below |
| speed lines | player above 56 m/s (≈109 kt), full at 80 | subtle velocity-stretched streaks |
| thin cloud wisps | player above 350 to 700 m AGL and 38 to 55 m/s | the sky's clouds are a dome, so these only suggest flying through haze |
| BOING | `impact` with result `bounce` | yellow POW flash, a ring of cartoon stars, ground shock ring, puffs, and squash and stretch on `rig.root.scale` |
| damage | `impact` with result `damage` (Partial) | smaller BOING + sparks + soot puff |
| engine smoke | `protection` event (Partial): level = 1 − pct/100 (refills clear it) | grey to black, flickers of fire above 75 % |
| crash | `crash` event (not water) | flash, orange fireball → its own smoke, a rising sooty smoke ring, 3 stars, a 22 s black smoke column with fire at the base, livery-coloured debris + runaway wheel |
| water | `impact` kind `surface` over water, or a `crash` in water | droplets, spray, 3 expanding ripple rings, no fire |
| tail strike | `tailstrike` event | sparks |
| Royal Privilege | `combo` with mult ≥ 2 | royal confetti (purple, gold, red, white, blue) + gold sparkles; it inherits the plane's velocity, so it streams past |
| crown puff | `rankUp` | crown outline drawn in gold smoke, gems + tip sparkles, ~3 s. Ahead of the plane in chase, in front of the windscreen inside |
| cockpit glare | high tier, inside views, sun within ~57° of the view | additive bloom + streak + windscreen grime |

## Wiring for GAMEPLAY (`js/main.js`)
I tested this against the real game by injecting the same calls through CDP: an AP circuit with AI traffic, real
bounces through SCORE's impact handler, touchdowns, and no console errors.
```js
import { createFX } from './fx/index.js';
let fx = null;

// boot(), after `world` and `R` exist:
fx = createFX({ scene, camera, renderer: R.renderer, quality: R.quality, world });
//   in the existing R.setQuality wrapper (next to world.setQuality):  fx.setQuality(q);
// attract: add to createAttract's callbacks
//   onSpawn:   (e) => { wiring.addAI(e); fx.track(e.ac.id, { rig: e.rig, ac: e.ac }); }
//   onDespawn: (e) => { wiring.removeAI(e); fx.untrack(e.ac.id); }

// onPlay(), after S.player = traffic.add(...) and wiring.startPlay(mode, S.player):
fx.track('player', { rig, ac, player: true });
fx.setView(S.view);
const g = wiring.game;   // a new game object every play, so subscribe here
if (g) for (const k of ['combo', 'rankUp', 'protection']) g.on(k, (d) => fx.onGameEvent(k, d, 'player'));

// quitPlay():              fx.untrack('player');
// placePlayer() (respawn): fx.reset('player');
// setView(v):              fx?.setView(S.view);

// handleEvents(P): first line inside the loop over P.ac.events.splice(0):
fx.onAircraftEvent('player', ev);

// frame(): AI events are cleared with `e.ac.events.length = 0`. Forward them just before that:
for (const e of traffic.list) if (!e.player) { for (const ev of e.ac.events) fx.onAircraftEvent(e.ac.id, ev); e.ac.events.length = 0; e.ap?.events.splice(0); }

// frame(): after fcam.update / attract.updateCamera (the camera has moved) and before R.renderer.render:
fx.update(S.paused ? 0 : dt * TIMESCALE);
```
Notes:
- Call `fx.update` after the rigs' `updateMatrixWorld()` and after the camera update, or speed lines and glare lag a frame.
- Squash and stretch writes `rig.root.scale` for about 0.6 s after a bounce and resets it to 1. Nothing else writes the
  root's scale (`traffic.sync` only writes position and quaternion). Pass `applyScale: false` to get just the Vector3
  from `fx.scaleOf(id)`.
- Online remote planes can be tracked like AI. Without `ac`, FX derives velocity from movement.
- FX does not own the gag: the canopy and parachute after `destroyed` stays with GAMEPLAY. The crash smoke column keeps
  going for about 22 s at the crash site after the respawn.
- D8 weapons: muzzle flashes, tracers (stretched STREAK) and explosions (`impact kind:'crash'` without the column) fit
  the existing pool and atlas, so nothing here blocks them.

## Tiers and budgets
| tier | particle cap | emission | debris | skid fade | extras | extra draw calls (max) |
|---|---|---|---|---|---|---|
| low | 360 | ×0.45 | 10 | 25 s | none | **4** (particles, ribbons, skids, debris), each only while visible |
| medium | 800 | ×0.75 | 16 | 40 s | none | 4 |
| high | 1400 | ×1 | 24 | 60 s | shimmer, glare | **6** |

Each pool is allocated once at the high maximum (≈ 1400 × 35 floats). Meshes hide themselves when empty, so a quiet
frame costs 0 calls.

Measured in headless Chrome with ANGLE Metal on the M5, 390×844 at DPR 2. The worst case is a crash column with fire and
debris, a damaged plane trailing smoke and vapour, skids, and a combo burst plus a bounce every 2 s:
| tier | peak particles | FX draw calls | `fx.update` CPU | frame time base → with FX |
|---|---|---|---|---|
| low | 352 | 4 | 0.05–0.2 ms | 1.82 → 2.09 ms |
| medium | 493 | 4 | 0.10–0.22 ms | 2.93 → 3.26 ms |
| high | 614 | 4 (+2 shimmer/glare when active) | 0.14–0.29 ms | 3.28 → 4.00 ms |

Typical single effects use 20–130 particles and 1–2 calls (per-shot numbers are in the bench log). Headless GPU time is
only indicative, so take an S22 measurement with the real game.

### Allocations
I checked these with the CDP heap sampling profiler, 16-byte interval, over 3000 `fx.update` calls after a 12000-frame warm-up:
- Pools never grow, and `stats().dropped` counts spawns refused at the cap. No objects, arrays or closures are created per frame.
- Measurement noise for the harness alone was about 0.8 B/frame. Steady states with no spawning (idle plane, vapour only,
  crash column) measured 0.7–1.9 B/frame, i.e. nothing. Steady states that spawn every frame (damage smoke, wash, speed
  lines) measured 4–10 B/frame, about 0.5 KB/s. That comes from V8 boxing a float inside a spawn path. It is about one
  minor GC every half hour and well below three.js's own render, which measured about 250 B/frame on this scene.
- I removed the earlier sources: closure `let` doubles (time, dt, CPU timer) now live in a `Float64Array`; emission rates
  and ribbon and skid arguments pass through typed arrays; per-effect functions are small enough for V8 to inline.
- `performance.now()` boxes a double on every call, so CPU timing is opt-in (`fx.setTiming(true)`). The bench turns it on.

## Test bench: `tools/fx.html`
`http://localhost:8888/gms/3d/krayzee/tools/fx.html?q=low|medium|high` (`&shot=1` hides UI, `&notiming=1`).
It shows the real world, a real `createPlane` rig with the pilot, and a fake Aircraft state driven by scripted scenarios.
Buttons cover every effect (Butter / Firm / Hard+slip / Grass land, Run-up, Grass run-up, Taxi grass, 3g turn, Fast,
BOING, Dmg 30/60/90 %, Crash, Water, Combo, Rank up, Sun glare), plus tier, view and camera (chase / side / orbit).
The stats overlay shows fps, total calls, FX calls, particles and cap, FX CPU, shimmer and glare state.
Hooks in `window.__fx`:
- `run(name, opts)`, `advance(sec)` for deterministic frames, `pause(on)`, `cam(mode)`, `camAt(pos, look)`
- `callsWithout()`: draw calls with and without FX
- `shimmerDiff()`: pixel proof that the refraction changes the image
- `stress()` and `perf(sec, skipFx)`
- `allocProbe(iter, withRender)`

Heat shimmer: `renderer.copyFramebufferToTexture` runs inside the shimmer mesh's `onBeforeRender`, so it copies the
frame after the opaque pass, at the plume's screen position. It works on the antialiased canvas: 2420 pixels change and
`gl.getError()` stays 0. At zero strength the redraw matches the frame (mean difference 0.006). If the copy ever throws,
the shimmer switches itself off (`stats().shimmerOk`).

Screenshots in `docs/shots/fx/` (each `_1280x800` and `_390x844`):
- touchdown, touchdown_skids, grass_landing, propwash_grass, taxi_grass, vapour_turn, shimmer, boing, damage60,
  damage_sparks, crash_fireball, crash_column, water, fast_lines, combo, rankup, glare_cockpit
- combo_center, rankup_center
- low tier: `*_390x844_low`
- `atlas.png`
- `game_*`: the real game with the wiring injected: takeoff roll, flare, touchdown, two rubber bounces

The CDP driver scripts (`fxdrive.mjs` + scenario files) live in the session scratchpad, not in the repo, because
`tools/` outside `fx.html` belongs to other lanes. If the manager wants it kept, I can add a `tools/fx-shots.mjs`.

## Known gaps / ideas
- No depth-fade soft particles: there is no depth texture to read without an extra pass. Billboards fade near the camera
  instead, and ground puffs start 0.25–0.35 m up, which hides most hard intersections.
- Smoke is lit by a fixed top-down shade and `setLight`, not by the sun direction or time of day.
- Wisps are a hint only. Real cloud fly-through needs volumetric or billboard clouds from AIRPORT.
- `impact` events from Aircraft carry no contact normal, so wall bounces put their stars in the horizontal plane.
  Adding `n` to the `impact` emit (TRAFFIC/FLIGHT lane) would let the stars face the wall.
- Skid marks also appear for AI landings (by design), but only AI within about 1.4 km get continuous effects (distance LOD).
