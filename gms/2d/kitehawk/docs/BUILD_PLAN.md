# KITEHAWK — BUILD PLAN

**Written 2026-08-24 by the build-plan agent. This file supersedes the provisional phase table in
`MANAGER_STATE.md`.**

---

## How to read this file

**Nobody reads this file whole. Not the manager, not a build agent.** NEONHAUL's build plan reached
218 KB and had to be marked "never read whole"; this one is written so that never has to be said.

- A **build agent** reads exactly three things: `docs/DECISIONS.md` (all of it, D1–D40),
  `docs/ARCHITECTURE.md` (all of it — it is the contract), and **its own phase brief in §3 below**.
  Its brief names, by section number, every other passage it needs. It reads those passages and
  nothing else.
- The **manager** reads §0 (standing rules), §1 (the phase table), §4 (open items), §5 (the tuning
  register map), §6 (contradictions and the rulings that settle them), and whichever phase brief is
  live.
- §6 is the important one for the manager and it is **short on purpose**. It lists every place two
  planning documents disagree in a way `DECISIONS.md` did not already settle, and gives the ruling.
  Those rulings are binding on build agents exactly as `DECISIONS.md` is.

Precedence, when two documents say different things:

```
DECISIONS.md  >  §6 of this file  >  ARCHITECTURE.md  >  DESIGN.md / ART.md / STORY.md / SUNO.md / SFX.md
```

`ART_AB_FINDINGS.md` and `VO_AUDITION.md` are **measurements**, not designs; where they contradict
`ART.md` or `SUNO.md` the measurement wins, and D34–D39 and D23–D25 have already promoted the
important ones.

---

## §0 — The standing brief

**Paste the whole of this section into every phase agent's prompt.** It is the part that does not
change.

### 0.1 What you are building

A painterly 2D biplane game, mobile-first portrait, at `gms/2d/kitehawk/`, served as static files.
Altitude is the fight; parachute-borne supply crates are the economy and the signature mechanic.
The one-paragraph pitch is `ARCHITECTURE.md` §1. Read it once and build that game.

### 0.2 The rules that get people fired

1. **Only touch the files your phase brief says you own.** Other agents and other Claude sessions
   are editing this repo concurrently. If you need something from a module you do not own, use the
   contract in `ARCHITECTURE.md` §6. If the contract is missing it, write a **REQUEST** into
   `docs/HANDOFF.md` and stop short of the thing you cannot do. Do not reach into another file.
2. **Do not run git.** Not `add`, not `commit`, not `status` as a basis for staging. Say what you
   changed; the manager stages selectively and commits (D9).
3. **Do not edit `ARCHITECTURE.md`, `DECISIONS.md` or this file.** Disagreement goes into
   `docs/HANDOFF.md` as an **OBJECTION**, and you work around it. The manager reconciles.
4. **Write your section of `docs/HANDOFF.md` before you stop.** You are not resumable. Record what
   you built, the public API, what is stubbed, what you would do next, every gotcha, and every
   number you measured. Assume the reader has none of your context.
5. **Nothing from a CDN, ever** (D6). Vendor everything into `vendor/`.
6. **No `alert`, `confirm`, `prompt` or blocking modal, ever.** In-page callouts only.
7. **The game must be fully playable and correct with `assets/audio/` renamed away** (D7).
8. **+Y is DOWN.** Gravity is positive, climbing decreases `y`, altitude is `-y`. Say it out loud
   before writing gravity, lift, a climb, a dive or a camera clamp.
9. **`Math.random()` is banned** under `js/sim/`, `js/modes/` and `data/`. Fork an `rng` stream.
10. **Never read wall-clock time inside `update(dt)`.** `dt` is always exactly `DT = 1/60`.
11. **No allocation in the hot loop.** Pool everything.
12. **Flight constants are authored in SI and derived into world units, never the reverse** (D26).
    `1 wu = 0.15 m`. A wu number with no SI number beside it is unreviewable. Cross-check every
    derived constant against a physical identity before trusting it.
13. **Zoom changes the view only, never the sim** (D18, `ARCHITECTURE.md` §4.3.5). Nothing under
    `js/sim/` imports `core/camera.js` or reads `cam.zoom`.
14. **Comments are sparse.** Explain *why*, never *what*. No headers on obvious things.
15. **No placeholder art in a "done" deliverable.** A grey box is not a deliverable.
16. **Never clamp, floor or special-case a value to make a gate pass.** If a gate is red, either the
    design is wrong or the gate is wrong. Fix the one that is wrong and write down what it cost.

### 0.3 Testing, and who writes what

| artefact | owner | what it is |
|---|---|---|
| `tools/sim.mjs` | build agents (the flight agent creates it, later agents extend it) | the headless game. `ARCHITECTURE.md` §8.1 |
| `tools/genlevels.mjs` | the world agent | level generation from the `DESIGN.md` §8 table |
| `tools/cdp.mjs` `shot.mjs` `touch.mjs` | the engine agent | headless Chrome over raw CDP |
| debug pages under `tools/pages/` | any build agent | prove your own subsystem |
| **`tools/gates_*.mjs`** | **the manager, and nobody else** | the independent check on your claim |

**Build agents report numbers; the manager writes the gate that checks the claim independently.**
Do not write a `gates_*.mjs`. Do not edit one.

Every gate writes one JSON record to `shots/<gate>/_gates.json` in the shape in
`ARCHITECTURE.md` §8.3, and every numeric result carries `value`, `threshold`, `op`, `unit` and a
`detail` line **containing the raw measurement**. The manager reads detail lines, not pass counts.

### 0.4 Concurrency

**One build agent at a time** (D11, D40) — the reason is Aaron's usage limits, not caution. The one
standing exception is a **blind art critic running alongside a builder**. §7 names the phases whose
file ownership is disjoint, so that a concurrency window, if Aaron opens one, can be spent well.

### 0.5 The manager does not wait

Per **D40**, when a phase reports and its claims verify, the next phase is spawned immediately.
Playtest is the only checkpoint. The manager surfaces non-obvious calls without stopping. The only
things that still go to Aaron are: the portrait→landscape pivot if the §4.4 gate fails, and anything
irreversible or outward-facing beyond the routine commit/push he has already authorised.

---

## §1 — The phases

| # | phase | agent role | owns | ends with |
|---|---|---|---|---|
| **P1** | Engine port A — renderer, shaders, `parts.js` | E engine | `js/gfx/**`, `index.html`, `css/` | `gates_render` |
| **P2** | Engine port B — camera, input, audio engine, harness | E engine | `js/core/**`, `js/audio/**`, `tools/cdp,shot,touch` | `gates_boot`, `gates_zoom_stability`, `gates_orientation` — **first engine commit** |
| **P3** | Sky, ramps, the art pipeline, first atlases | R art | `js/gfx/{sky,clouds}.js`, `art/**`, `assets/**` | payload gate + blind-critic round 0 |
| **P4** | Flight model and envelope | F flight | `js/sim/{flight,aero,physics,pilot}.js`, `js/data/tables.js`, `tools/sim.mjs` | `gates_flight`, `gates_purity` |
| **P5** | Combat, AI and the Duel | C combat | `js/sim/{entities,weapons,damage,ai}.js`, `js/modes/duel.js` | duel-matrix report |
| **P6** | The parachute crates | C combat | `js/sim/crates.js`, canopy rig, specials | `gates_crates` |
| **P7** | HUD — the gate mitigations and the one-thumb loop | U ui | `js/ui/**` | HUD gate |
| **P8** | **THE PORTRAIT GATE** | **manager** | `tools/gates_portrait.mjs` | portrait ratified, or Aaron decides |
| **P9** | World, terrain, level format, generator | W world | `js/sim/{world,terrain,spawner}.js`, `js/data/{level,act,validate}.js`, `tools/genlevels.mjs`, `data/**` | `gates_zoom_neutral`, level validation |
| **P10** | Story-mode shell → **FIRST PLAYABLE** | M meta | `js/modes/story.js`, `js/main.js` scenes, `js/core/save.js` | **commit, push, `projects.js` `wip:true`** |
| **P11** | The 100 levels and the balance pass | W world | `data/levels/**`, `data/tables/**`, `tools/sim.mjs` extensions | `gates_balance` |
| **P12** | Story delivery — script, runner, radio, pools | S story | `js/story/**`, `data/script.json`, `tools/manifest.mjs` | `gates_vo` V1/V2/V4 |
| **P13** | Hangar, upgrades, economy, traits, save | M meta | `js/ui/hangar.js`, `js/modes/*`, `data/tables/upgrades.json` | economy gate |
| **P14** | The other five modes | M meta | `js/modes/{survival,race,airlift,daily}.js` | mode gates |
| **P15** | Audio content — aviation SFX, VO, music handoff | S story | `js/audio/sfx/**`, `assets/audio/**`, `tools/vo/**` | audio verify, `gates_vo` V3 |
| **P16** | The art pass and the blind-critic rounds | R art | `art/**`, `assets/**`, rig definitions | `ART.md` §9 gate |
| **P17** | Ship — perf, low preset, screenshot, register | manager + E | `tools/gates_perf.mjs`, `projects.js` | pushed, `wip` removed |

**P1+P2 are one commit.** Nothing is committed until P2's gates are green, which is how D17's
"sustained audio in the first engine commit" is satisfied literally.

---

## §2 — File ownership, one table

This is `ARCHITECTURE.md` §5.1 expanded to the phases in §1. **Ownership is assigned, not
negotiated.** Where a file passes from one phase to another the hand-over is named.

| path | created by | later owned by |
|---|---|---|
| `index.html`, `css/game.css` | P1 | P7 may add UI roots only, by REQUEST |
| `js/gfx/{renderer,particles,lights,postfx,texture,parts}.js`, `js/gfx/shaders/**` | P1 | **frozen after P2.** Changes only by manager approval |
| `js/gfx/{sky,clouds}.js` | P3 | P16 |
| `js/core/{viewport,viewprofile,camera,input,events,rng,loop,math,quality,debug}.js` | P2 | frozen |
| `js/core/save.js` | P2 (shape) | P10 (data model), P13 (economy fields) |
| `js/core/audio.js` — the §6.8 facade | P2 | **hand-over to P15.** See §6 ruling R-15 |
| `js/audio/core.js` — DSP engine + sustained layer, `js/audio/lab.html` | P2 | P15 extends, never rewrites |
| `js/audio/sfx/**` | P15 | — |
| `js/sim/{flight,aero,physics,pilot}.js`, `js/data/tables.js` | P4 | P11 may retune constants only |
| `js/sim/{entities,weapons,damage,ai}.js` | P5 | P11 may retune |
| `js/sim/crates.js` | P6 | P11 may retune |
| `js/sim/{world,terrain,spawner}.js`, `js/data/{level,act,validate}.js` | P9 | P11 |
| `js/ui/**` | P7 | P13 adds `hangar.js`, P12 fills `cards.js` content |
| `js/modes/duel.js` | P5 | P14 |
| `js/modes/story.js`, `js/main.js` | P10 | P14 |
| `js/modes/{survival,race,airlift,daily}.js` | P14 | — |
| `js/story/**`, `data/script.json`, `tools/manifest.mjs`, `tools/split_take.py`, `tools/vo/**` | P12 | P15 |
| `data/levels/**`, `data/acts/**` | P9 (format + 4 samples) | P11 (all 100) |
| `data/tables/upgrades.json`, `airframes.json`, `enemies.json`, `economy.json` | P4 (airframes), P5 (enemies), P13 (upgrades, economy) | P11 retunes |
| `art/**`, `assets/**` (non-audio) | P3 | P16 |
| `assets/audio/**` | P15 | — |
| `tools/{cdp,shot,touch}.mjs` | P2 | — |
| `tools/sim.mjs` | P4 | P5, P6, P9, P11 extend |
| `tools/genlevels.mjs` | P9 | P11 |
| `tools/blind.mjs` | P3 (ported from `sunderfall/tools/blind.mjs`) | P16 |
| `tools/gates_*.mjs`, `docs/**`, `projects.js`, git | **manager, always** | — |

---

## §3 — The phase briefs

---

### P1 — Engine port A: renderer, shaders, `parts.js`

**Goal.** Port Sunderfall's proven WebGL2 batcher out of `gms/2d/sunderfall/game/js/gfx/` into
`gms/2d/kitehawk/js/gfx/`, applying the nine named changes, and write the new `gfx/parts.js`
painterly actor renderer. **This is first because everything downstream draws through it, and
because four of the nine changes are the ones that are ruinously expensive to retrofit** — the
`parallaxY` world-space camera offset, the ramp-map sampler, the screen-space grain, and the four
painterly-geometry features. Art authored against a single-parallax renderer would have to be
re-anchored; procedural actors bolted onto a renderer without the grain and the three-tone shading
would fail every blind critic in round one and no amount of later painted work would rescue them.

**You own.**

```
index.html            css/game.css
js/gfx/renderer.js  particles.js  lights.js  postfx.js  texture.js  parts.js
js/gfx/shaders/gl.js  sprite.js  light.js  post.js
tools/pages/boot.html   tools/pages/parallax.html   tools/pages/parts.html
vendor/
```

**You must not touch** anything under `js/core/`, `js/sim/`, `js/ui/`, `js/modes/`, `js/story/`,
`data/`, `art/`, `assets/`, `docs/` (except your `HANDOFF.md` section), or any `tools/gates_*.mjs`.
`js/core/` is P2's and is being built immediately after you; leave stubs out of it entirely — your
debug pages construct what they need inline.

**Read.**

- `ARCHITECTURE.md` **§2 in full** — this is your specification. §2.1 verdict, §2.2 what the code
  actually provides, §2.3 what is missing, **§2.4 the nine changes (this is the work)**, **§2.5
  `gfx/parts.js`**, §2.6 the port list file by file.
- `ARCHITECTURE.md` **§6.1, §6.2, §6.3** — the exact public API you must expose. Frozen once you
  land it.
- `ARCHITECTURE.md` **§9.2** — the performance budget you are building against.
- `ARCHITECTURE.md` **§10** rules 1, 6, 8, 9, 12, 13.
- `ART.md` **§4** (layer and parallax spec, including *Dynamic camera zoom* at the end of that
  section — the `camL = cam * pL` correctness condition and the two-grain rule) and **§11** ("the
  biggest risk to stunning" — the four features, and R3/R4/R5/R6/R13/R14).
- `ART.md` **§5** "Drawing spec — the aeroplane" and "Drawing spec — the parachute crate", for what
  `parts.js` has to be able to express. You do **not** author rigs; you build the module that can
  draw them.
- **§6 rulings R-05 and R-06** of this file (layer table reconciliation; zoom clamp).

**Deliverables.**

1. **The port**, file by file per §2.6. Strip every Sunderfall identifier on the way through — no
   `sunderfall` string survives in the output. Copying *out of* Sunderfall is explicitly allowed;
   copying *into* it is forbidden.
2. **Change 1 — fit-to-height.** `R.resize(w, h, dpr, worldH)`; `begin()` computes
   `scale = (ph / worldH) * zoom`; `R.worldW` becomes a derived getter.
3. **Change 2 — `parallaxY`, as a world-space camera offset.** Instance float 15 is dead; repurpose
   it. **Stride stays 16.** `TRI_STRIDE` 7→8, `lights.js` `STRIDE` 10→12. `visible()` must use
   `parallaxY` on the Y axis. **Do not "optimise" this into a screen-space scroll offset applied
   after `u_scale`** — that is the single failure mode that makes painted layers slide against each
   other every time the camera breathes.
4. **Change 3 — the 14-layer table** exactly as `ARCHITECTURE.md` §2.4 lists it, with A's starting
   `shade/response/haze/parallax/parallaxY` values. Render layers are not altitude bands; keep the
   comment that says so.
5. **Change 4 — `R.skyBand()` and `R.gradient()`.** `backdrop()` stays for ground bands, mirroring
   included, and keeps its warning that `mirror` on a silhouette produces a Rorschach axis.
6. **Change 6 — the ramp-map sampler.** `sampler2D u_ramp` on texture unit 9, `u_rampAmt`, one fetch
   in `SPRITE_FS` and `TRI_FS`. **Order is fixed and is not negotiable:** sRGB→linear, then `u_mul`,
   then the ramp, then haze, then lighting. Ramping after lighting re-maps additive light and breaks
   every glow in the game.
7. **Change 7 — screen-space paper grain**, `sampler2D u_grain` on unit 10, sampled by
   `gl_FragCoord.xy * u_grainScale`, per-layer `grainAmt`. Screen space, never world space.
8. **Change 8 — `R.skyRamp(y0, y1, rampTex, layer, opts)`.** One quad spanning the whole column in
   world space, `v` mapped to world Y, sampled per-fragment. **The forbidden alternative is
   computing the gradient once per frame from camera Y** — that flattens the sky the instant the
   camera zooms out, and it is the likeliest zoom bug in the project.
9. **Change 9 — `R.ribbon()`**, a loop over the existing `line()` path with per-segment width and
   alpha taper. No new stream, no new shader.
10. **`gfx/parts.js`** — new module. `createRig(def)`, `rig.setAngle`, `rig.pose`, `R.drawRig`.
    Emits per-vertex-coloured triangles on the existing tri stream. **All four features, in this
    commit:**
    - three-tone shading per part (`lit`/`mid`/`shadow` from `dot(partNormal, lightDir)`), with a
      **hard** terminator — a smooth ramp reads as 3D and loses the game;
    - **stable** per-part vertex jitter from a deterministic hash of `(partId, vertexIndex)`,
      computed once at rig build. Jitter re-rolled per frame crawls, and crawling is worse than
      machine-straight;
    - a hand-loaded darker edge **on the shadow side only** — an outline all the way round is a
      cartoon;
    - the shared screen-space grain (change 7) sitting over the result.
11. **`fx.gLoad(amount)`** helper wrapping `vignetteAmt` + `saturation` + `flash`. No shader change.
12. **Three debug pages** under `tools/pages/`: `boot.html` (5,000 sprites across 8 layers),
    `parallax.html` (a band at `parallax 0.2 / parallaxY 0.9` glued to its altitude while the camera
    pans both axes), `parts.html` (a hand-authored throwaway rig showing all four painterly
    features, and a side-by-side of the same rig with each feature disabled).

**Keep untouched:** the chunking (`MAX_TEX_PER_CHUNK = 8`), the instance re-basing in
`pointQuadStream()`, `visible()`'s rotated-extent culling, and the colour handling
(`c.rgb * c.rgb`, lights squaring on the way in, the clear colour squared in `end()`). These are
subtle, correct, and the reason the port is worth doing. `particles.js` gets exactly two edits:
`CAP` 20000 → 12000 and `glowBudget` 40 → 24.

**The gate — `tools/gates_render.mjs` (manager writes it).**

| # | criterion | PASS |
|---|---|---|
| R1 | boot page: 5,000 sprites across 8 layers | `R.stats.drawCalls ≤ 12`, 60 fps at 390×844 dpr 1 |
| R2 | **`parallaxY` correctness** | with `parallax 0.20 / parallaxY 0.90`, panning the camera 4,000 wu in X moves the band 800 ±8 wu; panning 4,000 wu in Y moves it 3,600 ±8 wu. **Both axes measured independently** |
| R3 | parallax is a camera offset, not a scroll multiplier | the same band, sampled at zoom 0.78 and 1.22, has the same *world* position within 2 wu. A screen-space implementation fails this by construction |
| R4 | `skyRamp` is per-fragment from world Y | sample the sky at three screen heights at zoom 1.22 and at 0.78; the world-Y→colour mapping is identical at both zooms within 2/255 |
| R5 | ramp order | a ramped sprite lit by an additive light: the light contribution is unchanged when `rampAmt` goes 0→1 (within 3/255). Proves the ramp is before lighting |
| R6 | grain is screen-space | pan the camera 2,000 wu; the grain pattern over an actor does not translate (cross-correlation peak stays at offset 0) |
| R7 | **the four painterly features are individually load-bearing** | `parts.html` renders the same rig 5 ways (all on, and each of the 4 disabled). Each disabled render differs from the all-on render by > 4% mean absolute pixel difference over the rig's bbox. A feature that changes nothing was not implemented |
| R8 | jitter is stable | the same rig at the same pose over 120 frames: per-vertex screen positions vary by 0 px |
| R9 | no CDN | no network request leaves the origin |
| R10 | budget | stride still 16; `R.stats.tris` for one 14-part rig ≤ 90 |

**Report back.** Every one of the nine changes with its line count and where it landed. The measured
draw calls and frame time at 390×844 and 844×390. Anything in §2.4 you found already true by
construction (§2.4 change 2 claims R3 is satisfied by the ported shader — confirm or deny it, with
the shader line). Whether the 6-segment canopy strip will need a textured-triangle stream (`R.mesh`,
deferred by §11 — the manager decides on your report, do **not** build it speculatively). Anything
you could not wire because it belongs to P2.

---

### P2 — Engine port B: camera, input, audio engine, harness

**Goal.** The rest of the engine: `core/`, the sustained-audio layer, and the headless harness.
**This is here and not later because of D17** — the aviation SFX content sits in P15, but the
sustained-source layer is engine architecture and retrofitting sustain into a one-shot engine is the
expensive version. It is also where the camera's zoom solver lands, because `R.begin(cam)` needs it
and because the portrait gate at P8 measures the controller the player actually gets.

**You own.**

```
js/core/viewport.js  viewprofile.js  camera.js  input.js  events.js  rng.js  loop.js
         math.js  quality.js  save.js  debug.js  audio.js
js/audio/core.js   js/audio/lab.html   js/audio/css/
js/main.js                      (boot + ctx assembly + an empty scene machine only)
tools/cdp.mjs  shot.mjs  touch.mjs
tools/verify_audio.mjs          (ported harness, not a gate — see below)
tools/pages/camera.html   tools/pages/input.html
```

**You must not touch** `js/gfx/**` (P1's, frozen), `js/sim/**`, `js/ui/**`, `js/modes/**`,
`js/story/**`, `data/**`, `art/**`, `assets/**`.

**Read.**

- `ARCHITECTURE.md` **§4.1** (`VIEW_PROFILE`, both entries, verbatim — copy the numbers, do not
  re-derive them), **§4.2** (what must exist before the gate — you build neither, but you build the
  camera hooks they need), **§4.3 in full** (the zoom controller: framing box, solve, asymmetric
  slew, hysteresis, the user preference, framing overrides, and §4.3.5 sim-neutrality).
- `ARCHITECTURE.md` **§6.4 through §6.11** — the exact API for input, viewport, camera, bus, audio,
  rng, quality, save. Frozen once you land it.
- `ARCHITECTURE.md` **§7.3** (save shape), **§8.2** (the two CDP gotchas — carry them verbatim),
  **§10** rules 1, 2, 3, 8, 17, 18.
- `SFX.md` **in full** — it is 5 KB and it is your audio brief. Note especially "The real gap, and
  it is a big one".
- `DESIGN.md` **§2.2, §2.3, §2.4** (the stick, the horizontal drag-override, the special) and
  **§9.2, §9.3** (assists and accessibility settings that live in `save.settings`).
- **§6 rulings R-06 (zoom clamp), R-12 (stick radius), R-15 (audio facade ownership)** of this file.

**Deliverables.**

1. **`core/viewprofile.js`** — the `VIEW_PROFILE` table and `ZOOM_BIAS`, copied from
   `ARCHITECTURE.md` §4.1 with no edits. This is the only file in the game that knows about
   orientation-dependent numbers. **A HUD widget or a system that reads `view.mode` directly is a
   bug**; if something needs a mode branch it needs a new profile field, added here, and recorded in
   HANDOFF.
2. **`core/viewport.js`** — ported, plus change 1 (fit-to-height). Keep the safe-area hidden probe,
   the `?dpr=` override, and the iOS stale-dimensions workaround at +120 ms and +400 ms.
3. **`core/camera.js`** — the full §4.3 controller. Framing box with the **8-member cap**, the
   solve, the asymmetric slew (out 5× faster than in), the dwell/margin/deadband hysteresis,
   `cam.track` **re-assertion-based** so a stale member cannot pin the zoom to the floor forever,
   `cam.setThreatAbove`, `cam.punch`, `cam.bounds`, and `requestFraming`/`releaseFraming`.
   **`allowOutsideClamp` is refused in code, with a console warning, whenever the player has combat
   control.** A cinematic framing that escapes the clamp while the player can fly is how a camera
   decision turns into a difficulty change; refusing it in prose is not enough.
4. **`core/input.js`** — ported, with the new `ACTIONS` list, the kitehawk keymap, and
   `onDoubleTap` / `onFlick` added. **Keep the bitfield-of-sources design and all three pointer bug
   fixes** (`lostpointercapture` routed to `onUp`; `blur` zeroing every action; `releaseAll()` on
   scene change). The stick zone is the whole lower 55% in portrait; touching it anywhere sets the
   stick origin at the touch point. See ruling R-12 for `stickR`.
5. **`core/quality.js`, `core/save.js`, `core/rng.js`, `core/events.js`, `core/loop.js`,
   `core/math.js`, `core/debug.js`** per §6.7–§6.11. `save.js` is `progress.js`'s **shape only** —
   the data model is `ARCHITECTURE.md` §7.3. A corrupt save falls back to a fresh one with one
   console warning and **an in-page callout, never an alert**.
6. **`js/audio/core.js`** — port `gms/3d/forge_test/audio/js/core.js` (graph, buses, reverb IR,
   envelopes, Karplus-Strong, noise) **unchanged in behaviour**, and port the whole 53-effect bank
   with it. It costs nothing and the lab is more useful to Aaron intact than pruned.
7. **The sustained-source layer** — this is the actual work of the audio half and D17 says it is the
   piece most likely to be underestimated. The existing contract is `play(eng, o)`: fire and forget.
   You are adding a handle you create, push parameters at every frame, and release:
   ```js
   const h = eng.sustain('rotary', { rpm, load, mixture, x, y });
   h.set({ rpm, load });        // every frame, allocation-free
   h.release(fadeSeconds);
   ```
   Requirements: sources are **pooled and capped** (a hundred aircraft may not open a hundred
   oscillators — the cap is 12 simultaneous sustained voices, nearest-first, with the cut voices
   silently released); **doppler and distance** are computed from `setListener`; a released handle is
   idempotent; and the whole layer is a no-op when the AudioContext has not started. You build the
   **layer and two proving sources** — `rotary` (RPM/load-driven) and `slipstream` (airspeed-driven
   noise bed). The remaining continuous sources (wire hum, stall buffet, engine damage states,
   zeppelin drone) are P15's content on your layer.
8. **`js/audio/lab.html`** — port the lab page. Aaron auditions and retunes sounds by dragging
   sliders and has asked to check them at playtest; **ship the defaults he lands on**, not the ones
   an agent guessed. The lab must expose the sustained sources as live parameter sliders, not just
   trigger buttons.
9. **`tools/verify_audio.mjs`** — port `forge_test/audio/tools/verify.mjs`. It renders every effect
   in an `OfflineAudioContext` inside headless Chrome and asserts it makes sound. **A broken
   envelope is silent and looks perfectly fine in source; this harness is the only thing that catches
   it.** Extend it to sustained sources: create, push 60 parameter frames, release, and assert
   non-silence during and silence 0.5 s after. The manager verified 53/53 clean on the source lab on
   2026-08-23 — your port must report 53/53 plus your two sustained sources.
10. **`js/core/audio.js`** — the thin facade in `ARCHITECTURE.md` §6.8, over your engine.
    `createAudio()` **never throws, never blocks, never awaits a file.** Resolution order for a key:
    manifest file on disk → built-in synth → silent no-op. A missing file, a missing manifest and a
    missing folder each cost **one console warning and nothing else**. `audio.voice()` returning
    `playing: false` is the normal path. See ruling R-15: you create this file, P15 inherits it.
11. **`tools/cdp.mjs` / `shot.mjs` / `touch.mjs`** — ported from `sunderfall/tools/shot.mjs`, split
    into a shared client plus capture plus touch. `touch.mjs` drives `Input.dispatchTouchEvent` with
    real `touchStart`/`touchMove`/`touchEnd` and real touchPoint arrays, so a hold-and-slide is
    actually a hold-and-slide. **Both gotchas carry over verbatim:** use
    `Emulation.setDeviceMetricsOverride` (never `--window-size`, headless clamps to 500 px and lies);
    capture via `canvas.toDataURL` with `?preserve=1` and `?dpr=1` (`Page.captureScreenshot` hangs
    forever with no error on an animating WebGL canvas under `--headless=new` + SwiftShader).
12. **`js/main.js`** — boot, `ctx` assembly per §6, and an **empty** scene machine with the eight
    scene names registered as no-ops. Do not write a scene.
13. **`window.__kh = ctx` and `window.__state`** — a flat, JSON-safe snapshot per §8.2. Every later
    gate asserts on `__state`, so the shape matters: tick, fps, frame ms, draw calls, sprites,
    particles, lights, entity counts, player state, band occupancy, `errors[]`.

**The gate.**

`tools/gates_boot.mjs`:

| # | criterion | PASS |
|---|---|---|
| B1 | boots at 390×844 dpr 2, 844×390, 1440×810 | no console error, no unhandled rejection |
| B2 | no request leaves the origin | 0 cross-origin requests |
| B3 | `assets/audio/` absent | boots, `audio.ready` resolves, exactly one console warning |
| B4 | audio bank | `tools/verify_audio.mjs` reports **55/55 clean** (53 ported + rotary + slipstream) |
| B5 | sustained-source cap | opening 40 rotaries yields ≤ 12 live voices and no `AudioContext` error |

`tools/gates_zoom_stability.mjs` (this is `ARCHITECTURE.md` §4.4 **P4c**, run early because it is
cheap and because a pumping camera invalidates every later measurement):

| # | criterion | PASS | FAIL |
|---|---|---|---|
| Z1 | reversals over a 120 s scripted framing-box trace | ≤ **6** per minute | > 12 |
| Z2 | no reversal pair inside 1.2 s | 0 violations | any |
| Z3 | no sustained oscillation of amplitude > 0.05 for > 3 s | 0 | any |
| Z4 | zoom-out is never blocked | given a target below current zoom, the controller starts moving within 1 tick, every time | any delay |
| Z5 | `allowOutsideClamp` refused under player control | attempting it logs and clamps | escapes the clamp |
| Z6 | stale framing member cannot pin the floor | a member added once and never re-asserted drops out within 2 ticks | persists |

`tools/gates_orientation.mjs`: rotate 20× during a scripted flight; assert the sim tick counter is
continuous, **no entity position changed on the rotation frame**, and no input latched. (The sim does
not exist yet — run it against a scripted dummy entity list on `ctx`, and re-run it after P10.)

**Report back.** The measured stickR in css px at 390 and 844 wide. Whether `VIEW_PROFILE`'s
`zoomFill 0.85` and `zoomLockRange 1400` behave as the §4.3.1 solve predicts on a synthetic box, with
the numbers. The sustained-voice cap behaviour under stress. **Whether the ported lab page still
audits cleanly against Aaron's expectations** — say plainly if any of the 53 sounds regressed in the
port. Anything you could not wire because it belongs to a later phase.

---

### P3 — Sky, ramps, the art pipeline, first atlases

**Goal.** Stand up the whole painted-art production line and produce the atlases the game can be
built against: the sky ramp system, the cloud deck, the FX brush sheet, and the large painted hero
objects. **This is here because P4's flight work and P7's HUD both need something to fly against
that is not a grey box, and because the small-prop half of the terrain atlas is gated on `poster.js`
(D37, D38) which is built in this phase.** It is also the first phase whose ownership is fully
disjoint from the sim, so it is the natural companion if Aaron ever opens a concurrency window.

**You own.**

```
js/gfx/sky.js   js/gfx/clouds.js
art/tools/  flux.py  crop.js  key.js  trim.js  tile.js  poster.js  ramp.js  atlas.js  verify.js
art/src/*.json      (the generation manifests — the reproducible source)
art/raw/  art/work/ (gitignored)
assets/**           (except assets/audio/**)
tools/blind.mjs     (ported from gms/2d/sunderfall/tools/blind.mjs)
tools/pages/sky.html
```

**You must not touch** `js/gfx/renderer.js`, `js/gfx/parts.js` or the shaders — **you draw through
`R`, you never edit it.** Nothing under `js/core/`, `js/sim/`, `js/ui/`, `js/modes/`, `data/`.

**Read.**

- `ART.md` **§1, §2** (the direction and the six pillars — each pillar has a test a critic runs;
  know them), **§4 in full** (layer/parallax spec, tiling, the ramp-map, the zoom subsection),
  **§5** "The split, decided" (what is painted and what is code), **§6** (per-act palettes — but
  read **ruling R-03** of this file first, the act indices move), **§7** (the pipeline, the bake,
  where files land — but read **ruling R-04**, the file tree is stale), **§9** (the critic
  protocol), **§11** (risks and the ramp-map failure mode).
- **`ART_AB_FINDINGS.md` in full.** It is 17 KB and it corrects `ART.md` on the points that matter
  most to you: **§3** is your prompt grammar, **§4** is why small props need `poster.js`, **§6**
  is what you may and may not generate yet.
- `DECISIONS.md` **D21, D22, D34, D35, D36, D37, D38, D39** — these are the A/B's findings promoted
  to decisions and they override `ART.md` §7 and §8C.
- `ARCHITECTURE.md` **§2.4 changes 3, 4, 6, 7, 8** (the layer table and the API you draw through),
  **§3.3** (the six bands and the column — with **ruling R-02**, which fixes the edges), **§6.1**
  (the renderer API), **§9.2** (the texture-memory and payload budget).
- `DESIGN.md` **§0b** (what each band mechanically *does* — the art must make each one legible as a
  place) and **§8.13** (act theatres and hours — see ruling R-03).

**Deliverables.**

1. **The bake chain**, in `art/tools/`. `key.js`, `atlas.js`, `verify.js` and `flux.py` port from
   `gms/2d/sunderfall/art/tools/`; **`crop.js`, `trim.js`, `tile.js`, `ramp.js` and `poster.js` do
   not exist there and must be written** — `ART.md` §7 is wrong when it says port all six. Order is
   fixed: `crop → key → poster (TERRAIN props only) → trim → tile (strips only) → atlas → verify`.
   - `crop.js` is the **mandatory first step**, not housekeeping: a fixed inset of 4% every edge and
     8% top and bottom on wide strips. This model paints a cream paper mount, a signature and a
     caption; negatives are inert (D22) and cropping removes all of it deterministically.
   - `key.js` needs a **tolerance**, not an exact backdrop match — `ART_AB_FINDINGS.md` §2 records
     that the winning FX grammar puts grain in the backdrop. Keep the colour-decontamination step;
     skipping it gives every cutout a pale halo the instant it sits against a dark sky.
   - **`poster.js`** (D37) — quantise luminance to 5–7 bands with a small dither, multiply in the
     shared paper grain at low opacity, erode the alpha edge 1 px and re-dilate with an irregular
     kernel, and drop the residual cast shadow (it is a separate low-luminance blob under the content
     bbox and is trivially detected). Runs on `TERRAIN` props only.
2. **The generation manifests** in `art/src/*.json`. Every entry carries `prompt, seed, size, steps,
   model`. **`model` is per-asset** (D21, D36): **9B for large structured subjects** (zeppelin,
   aircraft reference plates, buildings), **4B for props and FX**. A re-roll is `base + index + 100k`
   and **the accepted `k` is written back**. A batch must be reproducible from the manifest alone.
3. **The stem, verbatim, in every prompt** (D34, replacing `ART.md` §7's):
   ```
   Hand-painted gouache painting in the style of a WWI aviation poster and a Studio Ghibli
   aviation film, visible brush strokes and paper grain, romantic and beautiful,
   ```
   For FX subjects, **describe the paint mark, never the phenomenon** (D35), and any multi-item
   sheet carries "all different shapes and sizes and ages … irregular scattered layout, no two
   alike" or the bake produces a row of clones. **Never ask Flux for lettering** (D22) — every
   roundel, serial, stencil and crate marking is a code decal. **Never use "a few large flat poster
   shapes"** — it overshoots into flat vector, which `ART.md` §1 bans.
4. **Resolve D39** — the open item. `ART.md` §7's neutral-light rule
   (`even overcast light, low saturation, neutral grey-blue`) is what lets one asset serve five acts
   through the LUT, and it is also what strips the warm-key/cool-shadow contrast that makes the
   winning plates read as painted. Run a **six-plate A/B**: three props neutral-lit and three
   act-lit, same seeds, all six through `poster.js`, then one blind-critic round. Two admissible
   outcomes — accept neutral light and lean on `poster.js`, or make `TERRAIN` props act-exclusive
   and prompt them in palette (which costs 5× the prop atlas memory and must be checked against the
   §9.2 payload ceiling before you choose it). **Record the choice and the plates in HANDOFF.**
5. **The ramp LUTs.** `ramp.js` generates the 256×1 PNGs from the hex ramps. Per **ruling R-03**
   there is one LUT per **(act, sky-state)** pair, not per act: five act base ramps × the sky states
   that act actually uses (`DESIGN.md` §8.4–8.8's `sky` column), lerped from the act base. Act 1 and
   Act 2's hexes carry over from `ART.md` §6 unchanged; Acts 3, 4 and 5 are re-authored per R-03.
   **Check the first cloud atlas by histogram before generating all 24**: the cutouts want a
   luminance spread of roughly 0.15–0.90 with no clipping at either end. Too little range and they
   gradient-map to mush; too much and they band.
6. **`js/gfx/sky.js`** — the sky column: `R.skyRamp` for the gradient (world Y, per fragment), the
   sun disc and its painted glare bloom, `fx.setRays` driven from the sun's world position, and the
   per-band haze/ramp crossfade. **Band boundaries feather; nothing in this game changes at a line.**
   The crossfade must complete in **1.0–3.0 s** at best climb rate — that is gate P4b at P8 and it is
   your number to hit.
7. **`js/gfx/clouds.js`** — `CLOUD_MID` placement. Poisson-distributed atlas cutouts, random scale
   0.6–1.8, random horizontal flip, per-instance tint jitter ±4% value / ±3° hue. **`CLOUD_MID` does
   not tile.** `CLOUD_FAR` and the ground strips do tile, by cross-fade, **never by mirroring** — a
   mirror axis in a 1,500 px-tall viewport is instantly visible and counts as a repeat on the §9
   rubric. Every strip ships **two variants A and B** which alternate, and each 2048-texel strip maps
   to **4096 world units**, giving the A/B pair an 8192-unit period.
8. **The atlases you may generate now** (D38): `CLOUD_MID` (8 large at 1024² + 16 small at 512²), the
   **FX brush sheet**, and the **large painted hero objects** — zeppelin envelope in its seven
   separable pieces, balloon envelopes, the bridge, the chateau, Marnhault's roofless cathedral, the
   Ferrow Green grandstand with the RESULTS board (`STORY.md` §8 item 3 lists the story objects that
   need art). Plus the five act ground/horizon strips.
9. **The small-prop half of `TERRAIN`** — generate it **only after** `poster.js` exists and one
   blind-critic contact sheet of props (before and after `poster.js`) has passed. If the posterise
   pass does not close the gap, **stop and report**: the fallback is that terrain props are drawn in
   code like the actors, which is expensive and is the manager's call, not yours.
10. **`tools/blind.mjs`** ported, and **critic round 0** run per `ART.md` §9: three fresh critics,
    three shots (an Act 2 day frame, an Act 4 night frame, an Act 1 mud frame), sides randomised,
    project preference withheld, **never told which is ours, never reused across rounds**.
11. **Reference plates.** `ART.md` §9's protocol needs real professional frames on disk. They are
    third-party and **must never enter the repo** — they go in `docs/refs/study/`, which is
    gitignored and which the manager populates locally. If it is empty, say so and score against
    `docs/refs/probes/p08_hero_9b.png`, which is ours, and say in the report that you did.

**Generation hygiene.** Before any batch: `curl -s localhost:7867/api/status` (a `queue_depth` of 30+
is an hour — do not start) and `curl -s localhost:7866/api/status` (if LTX's `worker_warm` is true,
**wait** — Flux and LTX cannot both hold a worker in 24 GB; LTX releases after 120 s of queue idle).
**Never invent a lockfile** — the queues serialise themselves. Budget ~1 minute per plate.

**The gate.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| A1 | total committed art payload | ≤ **11 MB**, hard ceiling **12 MB** | over 12 MB |
| A2 | atlas hygiene (`verify.js`) | no atlas over 2048², every manifest entry present, no fully-transparent entry, contact sheet emitted | any |
| A3 | tiling | three copies composited; **mean absolute difference at each join ≤ 2/255**; no mirror axis anywhere | > 2/255 |
| A4 | **P6, nothing repeats inside one screen** | a human names every repeat over a full level scroll at three speeds. **−1 per repeat named** on the §9 rubric | ≥ 3 repeats named in one screen |
| A5 | **the ramp actually does the work** | the same cloud atlas under all five act LUTs: pairwise mean hue difference ≥ 25° for every pair | any pair under 15° |
| A6 | **P3, near layers go near-black** | luminance histogram of everything on `FG_OCCLUDE`: **90th percentile below 0.12** | above 0.18 |
| A7 | band crossfade timing | crossing any band boundary at best climb rate: crossfade completes in **1.0–3.0 s** | snaps (< 0.4 s) or crawls (> 4 s) |
| A8 | blind-critic round 0 | recorded, with the differences lists verbatim | not run |
| A9 | D39 resolved | the six-plate A/B exists, the choice is recorded with its reason | unresolved |
| A10 | small props | either generated *after* `poster.js` passed a critic sheet, or not generated and reported as blocked | generated at volume without the sheet |

**A8 is not scored yet.** Round 0 is a baseline — the §9 gate (mean gap ≥ −2.0, and two consecutive
rounds where no critic says *flat*, *uniform*, *the same ambient*, *sticker*, *tiling*, *repeated* or
*wallpaper*) is P16's gate, not yours. **Read the differences lists, not the scores**: on NEONHAUL the
numeric gap moved −5.17 → −5.00 across a whole art pass, inside a ±1.5 noise floor and therefore not
a result, while the differences lists changed completely and told us exactly what was fixed.

**Report back.** Every atlas with its byte size. The measured payload against the 11 MB target. The
D39 decision and why. The prop contact-sheet critic scores before and after `poster.js`, as a number
and as the differences list. Which `ART.md` §6 hexes you changed under ruling R-03 and what you
replaced them with. Any pillar you believe is unachievable with this pipeline — say it plainly now,
not at P16.

---

### P4 — Flight model and envelope

**Goal.** The aeroplane. A point-mass aerodynamic model in the vertical plane that reproduces
`ARCHITECTURE.md` §3.4's envelope, plus `tools/sim.mjs` — the headless game that makes 100 levels of
balance testable without a browser. **This is the phase that decides whether the game is fun**, and
it is also where the two open flight decisions (D32, D33) are resolved.

**You own.**

```
js/sim/flight.js  aero.js  physics.js  pilot.js
js/data/tables.js
data/tables/airframes.json
tools/sim.mjs
tools/pages/envelope.html
```

**You must not touch** the renderer, `js/core/**`, `js/ui/**`, or any combat module.

**Read.**

- `ARCHITECTURE.md` **§3 in full** — §3.0 the scale rule, §3.1 axes and timing, §3.2 reference view
  sizes, **§3.3 the altitude column** (with **ruling R-02**, which fixes the band edges — A's own
  provisional table violates A's own constraint 1), **§3.4 the envelope you must reproduce**, **§3.5
  turn geometry — the numbers the portrait gate is built on**.
- `ARCHITECTURE.md` **§8.1 in full** (the `sim.mjs` contract, the purity precondition, the run
  summary field names, the per-tick invariants), **§10** rules 6, 7, 8, 16, 17.
- `DESIGN.md` **§1 in full** — §1.1 model class, §1.2 atmosphere, §1.3 forces and the lift/drag
  curves, §1.5 the derived envelope *(the arithmetic is worked; check yours against it)*, §1.6 stall
  and the alpha limiter, §1.7 pitch control, §1.8 reversal and inverted flight, §1.9 what the player
  feels by regime, §1.10 fuel and auto-throttle, §1.11 airframes.
- `DESIGN.md` **§10.1** (the envelope report and its assert bands), **§10.8** (regression fixtures
  and the anti-mock rule), **§10.9** (determinism), **§12** (the tuning register).
- **§6 rulings R-01, R-02, R-07, R-08, R-09** of this file. **R-01 is the central task of your
  phase — read it before you write a line of code.**

**Deliverables.**

1. **The coefficient fit.** `ARCHITECTURE.md` §3.4 gives the envelope as a set of SI targets;
   `DESIGN.md` §1 gives the model form and a set of airframe coefficients that produce a *different*
   envelope. **Your first task is to re-derive `m`, `S`, `CLmax`, `CD0`, `T0` and the flutter
   coefficient so that `DESIGN.md` §1's model form reproduces `ARCHITECTURE.md` §3.4's targets.**
   Ruling R-01 gives the target list, the tolerances, and — importantly — **which targets may move
   and by how much**, because the system is over-determined and something has to give. Show the
   arithmetic in HANDOFF, in SI, the way `DESIGN.md` §1.5 does.
2. **The agility factor, honestly implemented** (ruling R-01). `A = 2.8` is not a wing; it is a
   deliberate arcade multiplier and `ARCHITECTURE.md` §3.0 already says so. Apply it to the **turn
   kinematics** — the aircraft may command a load factor up to `A`-scaled what the wing physically
   gives — but compute the **induced-drag penalty from the commanded load factor**, so the energy
   cost of the turn stays real. That is what preserves `DESIGN.md` §1.5's instantaneous-vs-sustained
   gap and its "a max-g turn costs about 8 metres of altitude per second", which is the single number
   the whole tactical layer rests on.
3. **Resolve D32 — the 4.5 g structural limit is decorative.** Ruling R-07 gives the manager's
   recommended resolution (restate the limit as a normalised **stress** scale, do not lower `A`,
   whose floor is 2.67 and below which the combat turn stops fitting portrait). Implement it, and
   **do not leave `4.5 g` sitting in a table looking load-bearing.** The HUD prints **STRESS**, never
   **G**.
4. **Resolve D33 — the drag constant.** Ruling R-08: this is not a 7% error, it is **two different
   quantities conflated**, and there is a real bug hiding behind it — under `ARCHITECTURE.md` §3.4 as
   written the nominal dive terminal (84 m/s) is *below* Vne (93 m/s), which means **a dive can never
   overspeed the airframe** and `DESIGN.md` §1.9's entire "over the red" regime and the airframe-stress
   mechanic are dead. Fix it: author `k` for the unpowered case, add the powered-vertical case with
   the flutter term, and **require `V_terminal(vertical, full power) > Vne` by 2–5%**. Put both
   numbers in the table with their SI values so nobody conflates them again.
5. **`sim/flight.js` / `aero.js` / `physics.js`** — the model. Six state variables per aircraft.
   The alpha limiter that means **the player cannot stall by pulling** (this is why the game is easy
   to play), with the expert's escape hatch: the limiter releases on full deflection held > 0.35 s
   below 24 m/s, so a hammerhead is available on demand. The stall's three components (pitch-down
   bias, seeded wing drop, authority loss) must produce a **stall turn as an emergent manoeuvre** —
   nobody writes a `stallTurn()` function.
6. **`sim/pilot.js`** — the virtual pilot at three tiers (`novice`, `competent`, `ace`). **The same
   file drives the in-game AI at P5.** That is the trick that makes 100 levels balanceable: the thing
   that plays the game headlessly is the thing that flies the enemies.
7. **`tools/sim.mjs`** — the harness. The CLI forms in `ARCHITECTURE.md` §8.1, the run summary with
   exactly those field names (they are the `stat` vocabulary star conditions use), and **the per-tick
   invariants that abort the run with the tick number and state**: no NaN or Infinity; `0 ≤ speed ≤
   Vne × 1.05`; `-10000 ≤ y ≤ 400`; angles finite and wrapped; entity count never exceeds the pool;
   and under zero throttle and zero pitch input, total energy `½v² + g·(-y)` is **monotonically
   non-increasing**. That last one catches more sign errors than any test you will write on purpose.
8. **`--envelope`** — the report in `DESIGN.md` §10.1, for every airframe × three altitudes.
9. **The regression fixtures** from `DESIGN.md` §10.8 that do not need combat: a 360° loop from
   40 m/s, a deliberate stall turn, an Immelmann, a split-S, a 500 m engine-out glide, a full-speed
   dive to Vne and recovery, a landing at the §7.4 gate. Blessed state hashes, plus
   **`tools/BLESSED.md` recording, for each fixture, what you broke and what failed.** A fixture whose
   assert still passes after you revert the constant it guards was never testing it.
10. **The band edges**, per ruling R-02, written into `js/data/tables.js` as the canonical set, with
    the four `ARCHITECTURE.md` §3.3 constraints asserted in code at load.

**The gate — `tools/gates_flight.mjs` and `tools/gates_purity.mjs`.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| F1 | **purity** | grep over the `js/sim/`, `js/modes/`, `js/data/` module graph finds zero imports of `document`, `window`, `performance`, `Date`, `requestAnimationFrame`, WebGL, `core/camera.js`, and zero `Math.random` | any hit |
| F2 | stall speed | **16.5 ± 1.0 m/s** at sea level, reference airframe | outside |
| F3 | best climb rate | **13.5 ± 1.0 m/s** | outside |
| F4 | level top speed | **60 ± 2 m/s** | outside |
| F5 | **terminal > Vne** | vertical full-power terminal exceeds Vne by **2–5%** | terminal ≤ Vne |
| F6 | **combat turn diameter at corner speed** | ≤ **286 wu** (the derived figure is 273 wu). This is gate P1 at P8 and it is the number portrait lives or dies on | > 300 wu |
| F7 | dive recovery from Vne | vertical extent ≤ **1,111 wu** (the derived figure is 1,053; above 1,111 gate P0 fails at P8) | > 1,111 wu |
| F8 | instantaneous vs sustained gap | `ω_inst_max / ω_sus_max` in **1.15 – 1.30** | outside — the tactical decision has been flattened |
| F9 | energy bleed in a max-g turn | **−7 to −9 m/s** of specific energy at corner speed | outside |
| F10 | thin air | sustained turn rate at 1,350 m is **0.62 – 0.72** of the sea-level figure | outside — the ceiling has no meaning |
| F11 | zoom climb | trading Vne for altitude buys **400 – 460 m** in 8–11 s (D31's "427 m in about 9 s") | outside |
| F12 | determinism | same seed + same input trace → identical state hash over 1,000 runs | any divergence |
| F13 | **band edges** | the four §3.3 constraints hold; **no band under 700 wu** | any violated |
| F14 | zoom neutrality | `--zoom 0.78` and `--zoom 1.22` produce **byte-identical** run summaries | any difference |
| F15 | anti-mock | `tools/BLESSED.md` exists and records a broken-constant run for every fixture | missing |

**Report back.** The coefficient fit, in SI, with the arithmetic. Which §3.4 targets you had to move
and by how much (R-01 permits some movement; say exactly what you spent). The D32 and D33 resolutions
as implemented, with numbers. Every `DESIGN.md` §12 [START] value you touched (T1–T7, T27) and what
it measured at. **Whether the flight model is fun** is not something you can report — say so, and
name what you would want Aaron to fly for ninety seconds.

---

### P5 — Combat, AI and the Duel

**Goal.** Guns, damage, the death spiral, the nine-state AI, and the Duel mode — because
`DESIGN.md` §7.5 is right that the duel is the pure, unconfounded test of the flight model and
doubles as the balance harness's fixture. **This is before the portrait gate because gate criteria
P2, P3, P3b, P3c and P6 all measure real engagements**; measuring them against a strawman would make
the pivot decision on bad data.

**You own.**

```
js/sim/entities.js  weapons.js  damage.js  ai.js
js/modes/duel.js
data/tables/enemies.json
tools/pages/duel.html
tools/sim.mjs        (extend only — the duel matrix and the AI harness)
```

**You must not touch** flight constants (`js/sim/flight.js`, `aero.js`, `physics.js`, `pilot.js` are
P4's — if the model needs changing, REQUEST it), the renderer, or `js/ui/`.

**Read.**

- `DESIGN.md` **§3 in full** (damage model, damage states, the death spiral, collisions, ground
  fire, how a fight reads on a small screen), **§5 in full** (roster, the nine-state AI and its three
  dials, morale, formations, the named aces), **§7.5** (Duel), **§10.2** (the duel matrix — the best
  signal in the harness), **§10.5** (time-to-complete and death rate).
- `ARCHITECTURE.md` **§6.4** (the auto-fire cone contract — there is no fire button and there never
  will be), **§6.7** (the reserved event names — `gun:*`, `enemy:*`, `player:*` must be emitted from
  day one), **§8.1** (the run summary you extend), **§4.3.1** (what a system may add to the framing
  box, and rule 18: **a boss contributes its engaged section only**).
- **§6 rulings R-09 (gun range and cone), R-10 (HP and hull sizes), R-11 (the ace roster mapping)**
  of this file.
- `STORY.md` **§3.3** (the named aces — who they are, when they appear) and **§6.7** (shooting a man
  in his parachute; the mechanical effect is `DESIGN.md` §3.3's "Blooded", and **the game never
  comments**).

**Deliverables.**

1. **Geometric hit allocation, not a damage roll.** Three capsule colliders per aircraft plus
   fuselage sub-rects for engine / fuel / pilot / tail. A bullet hits what it geometrically hits.
   **This is why six o'clock low is the deadly position and nobody should ever be told that in a
   tutorial.** Collider dimensions scale from `DESIGN.md` §3.1's metres by ruling R-10.
2. **Component damage as first-class aircraft state**, shared by the player and every AI aircraft —
   `DESIGN.md` §3.3's death spiral and §3.2's smoke are one implementation used by everything that
   flies. There is **no damage bar and no health number**; §3.2's visual states are the entire damage
   UI, which makes each one's legibility at 40 css px a hard requirement on the rig definitions (P16).
3. **Weapons** per ruling R-09: cone **±11°**, range **440 wu (66 m)**, real projectiles with muzzle
   speed, gravity drop, dispersion, travel time and convergence. **No hit-scan, no aim snapping, no
   soft-lock magnetism, ever.** The assist decides *when* to pull the trigger; it never decides
   *where* the bullets go. Keep `DESIGN.md` §2.5's target-priority scoring and its 0.40 s lock
   hysteresis verbatim — without hysteresis the reticle strobes between two crossing aircraft and the
   player can read nothing.
4. **The nine-state AI** driven by relative specific energy `E_rel = E(self) − E(player)` in metres,
   with the three dials (`k`, `morale`, `aggro`) and the morale table. **A fled enemy that reaches its
   own line survives and returns next level with `k + 0.05` and a grudge marker.** Formations with the
   **2.5 s promotion delay** on a dead leader — that is a real, discoverable reward for target
   selection and it is the counter to one of the aces.
5. **`js/modes/duel.js`** — 1v1, no ground fire, no crates, no third parties. Both start at 400 m,
   40 m/s, 800 m apart, closing. Best of three, **nothing heals between rounds**.
6. **The duel matrix** in `sim.mjs`: every airframe × every upgrade tier × every ace, 200 headless
   duels each. Report win rate, mean and p90 time-to-kill, rounds fired, modal cause of loss.
   **The counter-play check is the one that matters:** 200 duels with a scripted bot executing each
   ace's stated counter and 200 without; **the counter must be worth ≥ 18 percentage points**. An ace
   whose counter is worth 3 points does not have a counter, it has a description.
7. **The framing-box contributions.** Hostiles enter the box within `zoomLockRange` when they have
   line of fire or close at > 120 wu/s. **A zeppelin is 1,400 wu and never fits at any zoom in range;
   that is deliberate.** Contribute the engaged section only, ≤ 320 wu.
8. **Fixtures** added to `sim.mjs`: a 2v1 element split, a fire blown out by a dive.

**The gate.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| C1 | purity still holds after your modules land | `gates_purity` green | any hit |
| C2 | time-to-kill sanity | player DPS on a 60 HP scout kills in **0.4–0.8 s on target**; a single enemy needs **> 6 s of continuous fire** on the player | outside |
| C3 | the player is ~14× more lethal than a single enemy | ratio **10–18** | outside — difficulty must come from numbers and positioning, never from making the player paper |
| C4 | duel matrix, intended-tier | the act's intended loadout wins **55–70%** against that act's ace | outside |
| C5 | duel matrix, sidegrades | every airframe wins **45–65%** against every act-appropriate ace. Outside that band on more than **two** aces means the sidegrades have collapsed into a ladder | > 2 aces outside |
| C6 | **counter-play** | every ace's stated counter is worth **≥ 18 points** of win rate | < 18 for any ace |
| C7 | the mirror ace | flying the player's loadout at `k 0.90`, wins **48–52%** | outside — the ace `k` scaling is wrong |
| C8 | flee rate | **12–22%** of enemies bug out | outside |
| C9 | zoom neutrality | duel summaries byte-identical at forced zoom 0.78 and 1.22 | any difference |
| C10 | no allocation | 200 headless duels allocate no new entity objects after warm-up | growth |

**Report back.** The duel matrix as a table. Every ace whose counter measured under 18 points, and
whether you believe the counter or the ace is wrong. The `DESIGN.md` §12 values you refined (T10–T14,
T23, T24) with their measured numbers. Which of `DESIGN.md` §5.3's twelve behaviour profiles you
implemented and which you stubbed — ruling R-11 says the names come later, at P11.

---

### P6 — The parachute crates

**Goal.** The signature mechanic (D4). Crates fall under canopies from the unreachable Concord Line,
the player catches them, cuts the silk, or denies them, and the enemy contests. **This is before the
first playable build because D4 says explicitly it must not be deferred to a content phase**, and
before the portrait gate because contested crates are members of the framing box and a gate measured
without them would be optimistic about portrait's scarce axis.

**You own.**

```
js/sim/crates.js
js/gfx/rigs/canopy.js  crate.js       (rig definitions, drawn through R.drawRig — you do not edit parts.js)
data/tables/specials.json
tools/pages/crates.html
tools/sim.mjs          (extend only — the reachability solver)
```

**You must not touch** `js/gfx/parts.js`, the renderer, flight constants, or `js/ui/`.

**Read.**

- `DESIGN.md` **§4 in full** — §4.1 where crates come from, §4.2 canopy physics and wind,
  §4.3 the three ways to take one, §4.4 what is in a crate, §4.5 **the enemy reinforcement ladder**,
  §4.6 the three level situations that only work because of crates, §4.7 carrying, §4.8 specials.
- `DESIGN.md` **§10.4** — crate reachability, and read the paragraph about the scar it exists for.
- `ARCHITECTURE.md` **§3.4** (crate and canopy sizes in wu), **§6.7** (`crate:*` events — the
  signature mechanic's events, emitted from day one), **§7.1** (the level format's crate beats and
  the rule that a beat's `y` is where the canopy is *already open*).
- `ART.md` **§5** "Drawing spec — the parachute crate" — the canopy is the best-drawn object in the
  game: 12 segments, independently shaded, a lit crown and a shadowed skirt, a translucent back-lit
  rim, it breathes, and it collapses asymmetrically from the segment nearest the hit.
- `DECISIONS.md` **D4, D28** (why a crate has ~90 s of fall and why the Line is unreachable).

**Deliverables.**

1. **Canopy physics** — a single point mass with a big drag area and a pendulum offset, **not a cloth
   sim**. Terminal 7.75 m/s (**check `CdA` against the identity**, per rule 16). The pendulum swings
   with a 4.9 s period and **the hitbox actually moves**, so a fly-through interception has to be
   timed against the swing.
2. **Wind is the skill.** A per-level piecewise-linear altitude table. A crate under canopy is
   drag-dominated and relaxes to the local wind with a ~1.3 s time constant, so a **shear layer makes
   a falling crate curve** — that is what makes `DESIGN.md` §4.6.1's "The Shear" a real decision and
   not flavour.
3. **The three takes**, with their real economics: fly-through at **1.0×** and it costs you position;
   **canopy cut at 1.6×** (six rounds, or one shotgun shell) with a 35% burst chance above 250 m and
   95% survival below 120 m; deny at **0 value and the enemy gets nothing**. **The optimum is to cut
   low**, which drags the player into the small-arms envelope at the altitude where a stall is fatal.
   `DESIGN.md` calls this the best decision in the document. **Do not soften it.**
4. **The enemy reinforcement ladder** (`DESIGN.md` §4.5). When the enemy banks a crate it is a live
   reinforcement, not a number on a ledger. This is what makes crates a battlefield objective instead
   of a shop, and it is what makes denial correct.
5. **Specials** — the one-tap slot, one loaded at a time, swappable mid-mission by an Ordnance crate.
6. **The canopy rig** through `R.drawRig`, as a **6-segment strip of rotated sprite quads** sampling a
   canopy atlas (`ARCHITECTURE.md` §2.3). If seams show at 2× zoom, **write an OBJECTION in HANDOFF
   proposing a textured-triangle stream and stop** — that decision is the manager's (§11) and you must
   not build `R.mesh` speculatively.
7. **The reachability solver** in `sim.mjs` (`DESIGN.md` §10.4). Build a reachability cone from the
   player's spawn using the airframe's real climb rate, top speed and the level's wind, integrate the
   crate's actual fall, and check for an intersection — then repeat for the canopy-cut option.
   **The solver may not contain any fallback, clamp, or "if unreachable, move the drop point"
   convenience.** If a crate is unreachable the test fails and a human moves the drop point.

**The gate — `tools/gates_crates.mjs`.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| K1 | fall time | a crate released at the top of the reachable column reaches the ground in **85–95 s** (D28's "~90 s") | outside |
| K2 | shear curves a crate | with a reversing wind profile, a crate's ground impact point differs from its release X by **> 200 wu** | ≤ 200 wu — the shear is decoration |
| K3 | **the canopy-cut multiplier earns its place** | expected value of a low cut is **≥ 1.35×** a fly-through after burst risk and the extra exposure. **This is the riskiest number in the game** — below ~1.35× the signature mechanic degenerates into a floating pickup | < 1.35× |
| K4 | a high cut is worse than a fly-through | expected value of a cut above 250 m is **below** 1.0× | ≥ 1.0× |
| K5 | **the reinforcement ladder is not decoration** | losing 3 crates in a level raises the measured death rate by **≥ 8 percentage points** over the same level with 0 lost | < 4 points |
| K6 | pendulum matters | fly-through capture rate with the swing enabled is **2–6%** lower than with it pinned | 0% or > 10% |
| K7 | reachability solver falsifies | deliberately move one drop point out of reach; the solver **fails and names that crate with its margin in seconds** | passes, or reports only a count |
| K8 | detail lines | the report prints **every crate with its margin in seconds, sorted ascending**, and the ten tightest are printed **even when everything passes** | prints a pass count |
| K9 | events | `crate:drop`, `crate:caught`, `crate:lost`, `crate:canopyHit` all fire, with payloads | any missing |
| K10 | zoom neutrality | crate runs byte-identical at forced zoom 0.78 and 1.22 | any difference |

**Report back.** K3's measured multiplier — it is the number the manager most wants. K5's measured
death-rate delta. The tuning register values you refined (T15, T17–T22). Whether the 6-segment canopy
showed seams at 2× zoom, with a screenshot.

---

### P7 — HUD: the gate mitigations and the one-thumb loop

**Goal.** The HUD, and specifically the two mitigations `ARCHITECTURE.md` §4.2 says **must be live
before the portrait gate runs** — the altitude tape and the edge threat-chevrons. Running the gate
against a stripped portrait build would be testing a strawman, and under D26/D28 the column is ten
portrait screens tall, so the tape is no longer a convenience: **it is the only thing that shows the
ladder at all**, and gate P2 depends on it warning of a diving attacker before that attacker can
enter the frame.

**You own.**

```
js/ui/layout.js  hud.js  stick.js  alttape.js  cards.js  map.js
css/ additions
tools/pages/hud.html
```

**You must not touch** anything under `js/sim/`, the renderer, or `js/core/`. If a HUD element needs
a value the sim does not expose, REQUEST it.

**Read.**

- `ARCHITECTURE.md` **§4.1** (the HUD grid: **named slots resolved from the profile, in normalised
  units, with safe-area insets. A HUD widget that contains a literal pixel offset is a bug**),
  **§4.2** (the two mitigations, in detail), **§6.4** (the one-thumb contract), **§7.5** (the radio
  card: **hard-capped at 44 characters, never wraps, orientation-aware, never takes input, never
  pauses, never becomes a modal**).
- `ART.md` **§10 in full** — this is your art direction. The governing principle (**the HUD is on the
  glass or on the aeroplane; it is never floating in the sky**), the coaming, the ribbon, the arc, the
  belt, **the contrast rule stated numerically**, "the HUD does not zoom", type, and what the HUD must
  never do.
- `DESIGN.md` **§2.2** (the stick), **§2.3** (the horizontal drag-override), **§2.4** (the special),
  **§2.6** (the lead pip — it shows truth, it does not aim), **§2.7** (the HUD element table, and
  note the **removal of the damage bar** — R11 is accepted in full), **§2.9a** (what must stay
  readable at maximum zoom-out, and the promotion rule), **§3.6** (how a fight reads on a small
  screen — six rules in priority order; if one fights the art direction, that list wins),
  **§9.2, §9.3** (assists and accessibility).
- **§6 ruling R-12 (stick radius)** of this file.

**Deliverables.**

1. **The altitude tape.** A 34 px vertical strip, left in portrait, showing the **whole 10,000 wu /
   1,500 m column**: all six bands with their signature icon and their **ratified name** (Mud, Belt,
   Floor, Deck, Lane, Blue — D19, frozen), the player's position, **the Concord Line drawn above the
   top of the playable column and visibly out of reach**, and **pips for threats and crates that are
   off-screen vertically**. Band segments are drawn from the act's own ramp, so the tape can never
   clash in any act, by construction.
2. **Edge threat-chevrons.** Screen-edge arrows for contacts outside the viewport horizontally,
   scaled by distance, coloured by closure rate, with an above/below tick. This is the answer to
   portrait's 462 wu of width. **If more than three are live, merge the nearest three and drop the
   rest** — a cluttered edge reads as noise, not danger.
3. **Threat brackets.** A converging red bracket **0.5 s before** any enemy with a firing solution
   opens fire. `DESIGN.md` calls this the single most important readability feature in the game.
4. **The fixed-screen-size overlay layer.** Threat brackets, allegiance glyphs, the lead pip and crate
   pips are drawn at **fixed screen size** and positioned from a world point, so they survive
   zoom-out. World-space things are allowed to become illegible; if a thing is not allowed to become
   illegible then it is on this layer or on the HUD. **The HUD never zooms.**
5. **The stick.** Hold-and-slide anywhere in the lower 55%. **No input is produced on touchdown** —
   putting a thumb down never twitches the aircraft. Anchor slide so the player can never run out of
   screen at the bottom bezel. Release eases to 0 over 0.18 s.
6. **The coaming** — the bottom 14% of the portrait frame, painted, below the safe-area inset, in the
   thumb dead-zone, carrying the speed arc **with its ghost energy needle**, the ammo belt, and the
   engine gauge. That second needle teaches the entire flight model without a tutorial line.
7. **The radio card** — the widget only; P12 fills it. Top third in portrait, top-left in landscape,
   non-blocking, never modal. **The card's duration is computed from the text**
   (`clamp(1.1 + len/13.5, 1.6, 7.0)`), and audio may only ever *extend* it (`ARCHITECTURE.md` §7.5).
8. **Colour is never the only channel**: hostiles carry a chevron tab and friendlies a roundel dot,
   both at fixed screen size.
9. **Every UI element is drawn twice** — a 2 px dark outline at alpha 0.55 (an outline, offset 0,0,
   not a drop shadow), then the element. Anything whose luminance lands between 0.35 and 0.65 also
   gets a 1 px light inner edge. That single rule removes every per-act UI exception.
10. **One vendored typeface**, a stencil face, as a local WOFF2. **Never a CDN font.**

**The gate — `tools/gates_hud.mjs`.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| H1 | **no literal pixel offsets** | grep `js/ui/` for numeric px constants outside `layout.js`'s slot table: **zero** | any |
| H2 | orientation | every element lands inside its profile slot and inside the safe area at 390×844, 844×390, 1440×810 | any overflow |
| H3 | contrast | every element sampled against `#FFFFFF` and against `#080B12`: **minimum luminance contrast ratio 4.5:1** in both | below on either |
| H4 | **the HUD does not zoom** | every HUD element's screen bbox is identical at zoom 0.78 and 1.22 within 1 px | any change |
| H5 | **nothing occludes the aeroplane** | over a 60 s auto-flown mission, no HUD element's rect overlaps the player's screen rect on any frame | any frame |
| H6 | tape shows the whole column | the tape spans 0 → −10,000 wu with all six bands named, and the Concord Line drawn above the playable top | any missing |
| H7 | **tape warns before the frame does** | over 200 seeded dives, the tape pip appears **before** the attacker's silhouette enters the frame, with a median lead of **≥ 0.6 s** | median < 0.4 s |
| H8 | chevron merge | with 8 off-screen contacts, exactly 3 chevrons are drawn | more |
| H9 | radio card cap | any `kind: "radio"` string over 44 characters **fails the load** in console and in the debug overlay | renders wrapped |
| H10 | card duration is text-derived | with the audio layer stubbed out entirely, every scheduled card shows for its text duration | any 0 ms card |
| H11 | **thumb occlusion** | a 165 css px disc (44 mm) at the median stick contact point over a 60 s auto-flown mission: ≤ **18%** of screen area, and overlaps the player's rect on ≤ **2%** of frames | > 25% area, or > 6% of frames |
| H12 | thumb travel | median thumb travel per minute ≤ **2,200 css px** (`DESIGN.md` §2.9 P4, folded in here) | > 3,000 |
| H13 | no modals | grep the whole tree for `alert(`, `confirm(`, `prompt(`: zero | any |

**Report back.** H7's measured tape lead — the portrait gate's P2 depends on it. H11 and H12 with
their traces. The stickR you settled on and what T8 measured. Anything in `DESIGN.md` §2.9a's
"promoted to a HUD marker" list you could not deliver.

---

### P8 — THE PORTRAIT GATE

**Goal.** Settle the highest-risk decision in the project with numbers rather than taste (D2).
**The manager runs this phase. No build agent is spawned for it.**

**Owned by the manager.** `tools/gates_portrait.mjs`, `shots/portrait/`, and the decision.

**Read.** `ARCHITECTURE.md` **§4.4 in full** — §4.4.1 the tension named, §4.4.2 the criteria table,
§4.4.3 the decision rule and "what would actually fail". Plus `DECISIONS.md` **D2, D18, D26, D27,
D28, D30**, and `DESIGN.md` **§2.9** (whose P3/P3b/P3c are already folded into `ARCHITECTURE.md`'s
P3b/P3c and whose P4 is folded into P7's H12).

**Preconditions, all of which must be true before the gate is run.**

- P7's H6 and H7 green — **the altitude tape is live** (§4.2 mitigation 1).
- P7's H8 green — **edge chevrons are live** (§4.2 mitigation 2).
- P4's F6 and F7 green — the turn and the dive recovery are the real ones.
- P5's C4–C7 green — the duels being measured are real fights, not a bot orbiting.
- P6's K1 and K3 green — contested crates are real framing-box members.
- P2's Z1–Z6 green — **the zoom controller is not pumping.** A pumping controller invalidates every
  "at the delivered zoom" measurement in the criteria table.

**The criteria are `ARCHITECTURE.md` §4.4.2's table, P0 through P9, unchanged.** They are not
restated here; restating them is how they drift. Measurements at **390×844 css, dpr 2** in the CDP
harness and in `sim.mjs`, with the controller **live, unmodified, at `zoomBias: 'normal'`**.

**The decision rule.**

- **P0 or P9 FAIL → stop.** P9 means the build is wrong, not the orientation: fix it and re-run.
  P0 means no zoom in portrait frames the fight legibly, and **that is the pivot signal**.
- Any other FAIL → **pivot to landscape-primary**. `VIEW_PROFILE.landscape` becomes the tuning
  target, the world agent re-proportions the bands, portrait stays a supported secondary config, and
  **no code moves** — that is what §4.1 bought. **This specific call goes to Aaron regardless**
  (D15, D40): it changes the game he asked for.
- All PASS but **two or more criteria within 10% of a FAIL threshold** → escalate with the numbers
  and both screenshots.
- All PASS with margin → **portrait is ratified**, `ARCHITECTURE.md` §4.4 becomes read-only history,
  and P9 starts immediately (D40).

**Do not tune a value purely to make a gate pass.** If P0 needs the framing box narrowed, that is an
AI design change with a stated cost, recorded in HANDOFF — not a number quietly edited in a gate file,
and never a `zoomFill` nudged from 0.85 to 0.95 to buy 12% on paper.

**The three numbers to carry into the report.** **503 wu (75.5 m)** is the widest fight the auto
clamp can frame; **585 wu (87.8 m)** is the widest fight portrait can frame at all; and the two levers
are the **minimum enemy hull** (art) and the **p90 framing-box width** (flight and AI tuning). If the
p90 box lands between 503 and 585 wu, widening the clamp floor to **0.68** is on the table and is the
manager's call (§11); below 0.671 no zoom is legible at all.

---

### P9 — World, terrain, level format, generator

**Goal.** The world the levels are made of: wind, gusts, terrain, spawning, the level and act JSON
formats with their validator, and `tools/genlevels.mjs`. **This is after the gate because the gate's
outcome decides whether the world agent proportions the bands for portrait or for landscape.**

**You own.**

```
js/sim/world.js  terrain.js  spawner.js
js/data/level.js  act.js  validate.js
tools/genlevels.mjs
data/levels/**   data/acts/**    (the format plus four worked examples this phase)
tools/pages/level.html
```

**You must not touch** flight, combat or crate constants, `js/ui/`, or the renderer.

**Read.**

- `ARCHITECTURE.md` **§7.1** (the level format — **bands and beats, never a coordinate dump; a beat
  fires when the camera passes `x`. That is what makes 100 of them tractable**), **§7.2** (act
  format), **§3.3** (the column and the band edges, with **ruling R-02**), **§8.1** (the run summary
  and the invariant `-10000 ≤ y ≤ 400`).
- `DESIGN.md` **§8.1** (how sameness is prevented — six structural mechanisms, all checkable by a
  script), **§8.3** (the codebook), **§8.10** (the level data shape), **§8.13** (act theatres and
  hours), **§0b** (what each band does), **§4.2** (the wind profile format the crate solver and the
  AI estimator both read).
- `ART.md` **§4** "Tiling without seams" — **landmarks are never tiled**; a chateau, a wrecked bridge,
  a burning factory are placed by level data at authored X positions, one instance each per level.
  **That is the real anti-repetition mechanism**; the strips are only connective tissue.
- `DECISIONS.md` **D28** (the Concord Line is outside the playable column and is never a reachable
  coordinate), **D31** (a mission occupies a **2–3 band slice**, not the whole column — a full climb
  is 107 s against a ~131 s mission; the five forced climbs are the deliberate exceptions).

**Deliverables.**

1. **`js/data/validate.js`** — a malformed level **fails loudly in the console and in the debug
   overlay, never silently**. It **rejects any beat, spawn or objective placed above `ceiling`**
   (D28), rejects any `kind: "radio"` line over 44 characters, and rejects a band set that violates
   `ARCHITECTURE.md` §3.3's four constraints.
2. **Star conditions are structured, never expression strings**, and their `stat` names come from the
   `sim.mjs` run summary so stars evaluate headlessly without a browser and without `eval`.
3. **`js/sim/world.js`** — the per-level wind profile as a piecewise-linear altitude table, gusts,
   visibility, time of day; **the same evaluator serves the crate solver and the AI's wind
   estimator**, because two implementations will diverge and the divergence will look like an AI bug.
4. **`js/sim/terrain.js`** — the ground silhouette, and `P.setTerrainQuery(fn)` registered so
   particles collide.
5. **`js/sim/spawner.js`** — beats fire on camera X, seeded, with the pooled entity contract.
6. **`tools/genlevels.mjs`** — writes exactly the §7.1 format from the `DESIGN.md` §8 table.
   **The table is the source and the JSON is generated from it**, so a designer edits one place.
   A human must be able to edit the generated result afterwards without breaking the generator.
7. **Four worked levels** this phase — `a1-01`, `a1-04`, `a1-12` and `a2-25` — chosen to exercise a
   crate beat, a boss beat, a cloud-deck event and a forced climb. The other 96 are P11.
8. **`js/gfx/rigs/` terrain landmark placement** hooks so P3's painted landmarks can be positioned by
   level data. You place; the art agent authors.

**The gate.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| W1 | validator falsifies | a level with a beat above `ceiling`, a 45-char radio line, and a 600 wu band each fail the load with a named error | any passes |
| W2 | **`gates_zoom_neutral`** | the same seeded mission at forced zoom **0.78 and 1.22** produces **bit-identical** run summaries | any difference at all |
| W3 | determinism | same seed → identical state hash over 1,000 runs of each worked level | any divergence |
| W4 | band slice | each worked level's `timeInBand` shows the player spending time in **2–3 bands** (D31), except a declared forced climb | outside without a declaration |
| W5 | wind evaluator is shared | the crate solver and the AI estimator return identical values for 10,000 sampled (alt, t) pairs | any divergence |
| W6 | generator round-trip | `genlevels.mjs` regenerates the four worked levels byte-identically from the table | any drift |
| W7 | no coordinate dumps | every level file is under 6 KB | over |
| W8 | pool discipline | 300 s of the busiest worked level allocates no new entity objects after warm-up | growth |

**Report back.** The four worked levels with their `sim.mjs` summaries. Whether `DESIGN.md` §8's
table maps cleanly onto §7.1's format or needed fields §7.1 does not have — **name them; the manager
decides whether to extend the format** (it is `ARCHITECTURE.md`'s, so you may not).

---

### P10 — Story-mode shell → FIRST PLAYABLE

**Goal.** The scene machine, the story mode, the save model, and a game a human can pick up and play
from the browser. **This is the first commit, the first push, and the first `projects.js` entry
(`wip: true`)** per D9 and the manager's standing instruction.

**You own.**

```
js/main.js              (the scene machine — you inherit the empty one from P2)
js/modes/story.js
js/core/save.js         (the data model; P2 built the shape)
js/ui/ additions        by REQUEST only — P7 owns js/ui/
```

**Read.** `ARCHITECTURE.md` **§6** (the `ctx` and the scene contract: `boot`, `title`, `hangar`,
`brief`, `play`, `pause`, `debrief`, `map`), **§7.3** (the save shape), **§6.11** (`save` API).
`DESIGN.md` **§7.1** (Story: win, lose, three stars, the checkpoint at 60% for levels over 120 s and
all bosses), **§9.4** (failure philosophy: **a mission never costs progress; restart is a 1.2 s
"again" card, not a modal, not a menu**).

**Deliverables.**

1. The eight scenes, with `input.releaseAll()` on **every** scene change.
2. Story mode over P9's four worked levels: brief → play → debrief, stars evaluated from the run
   summary, progress written.
3. Save with `save.migrate(from, to)` — **every version bump ships a migration, never a wipe.**
   `?nosave` disables read and write for gate runs.
4. A title screen and a level map good enough to navigate four levels. Not good enough to ship; say so.
5. `?debug` overlay wired to `window.__state`.

**The gate.**

| # | criterion | PASS |
|---|---|---|
| M1 | a human plays level `a1-01` end to end on a real phone-sized viewport | completes, no console error |
| M2 | **crates are in it** (D4) | at least one crate is caught, one is cut, and one is denied, in a real session |
| M3 | audio folder renamed away | boots, plays, completes | |
| M4 | rotate 20× mid-flight | `gates_orientation` green against the real sim | |
| M5 | save round-trip | quit mid-campaign, reload, state restored; corrupt the JSON, get a fresh save + **one console warning + one in-page callout, no alert** | |
| M6 | restart | 1.2 s "again" card, no modal, no menu | |

**Then the manager, and only the manager:**

- stages **only** paths under `gms/2d/kitehawk/`, plus one `projects.js` hunk, plus the screenshot.
  **Never `git add -A`** — other Claude sessions have uncommitted work in this repo;
- commits and pushes;
- adds the `projects.js` entry with `wip: true` and a screenshot at
  `assets/screenshots/kitehawk.jpg`.

---

### P11 — The 100 levels and the balance pass

**Goal.** All 100 levels, generated from the `DESIGN.md` §8 table, and the balance harness that
proves the curve. **This is the phase the tuning register is spent in.**

**You own.** `data/levels/**`, `data/acts/**`, `data/tables/{enemies,economy}.json`,
`tools/genlevels.mjs`, and **retune-only** access to the sim constants (`js/data/tables.js` values,
not code).

**Read.** `DESIGN.md` **§8.4 through §8.8** (the five act tables — 100 rows, this is your source),
**§8.9** (the distribution check and the one declared near-miss), **§8.11** (the beat levels'
mechanical specs — every one is a flag on an existing system and **nothing there needs new physics**),
**§8.12** (mode unlock schedule), **§10.3, §10.4, §10.5, §10.6, §10.7** (the asserts).
`STORY.md` **§4** (the five acts) and **§8** (the reconciliation notes). **§6 ruling R-11** of this
file — the ace roster mapping is resolved here.

**Deliverables.**

1. **All 100 levels generated**, plus the five act files.
2. **`data/tables/aces.json`** — ruling R-11. One file mapping each named ace from `STORY.md` §3.3 to
   a `DESIGN.md` §5.3 behaviour profile and to its level ids, plus names for the behaviour profiles
   `STORY.md` does not cover. **Where a level id collides, the story beat wins** and the non-story
   duel moves to the nearest free slot; record every move.
3. **The static content audit** (`DESIGN.md` §10.6) run as data, not as prose: archetype spacing with
   the two declared exceptions **listed by level id in the test rather than by loosening the rule**;
   ≥ 2 left-turn levels and ≥ 2 breathers per act; every "new noun" appearing exactly once; one forced
   climb per act terminating in Lane or Blue; **no enemy's HP differing between acts**; and D's fixed
   beat levels (33, 50, 56, 65, 67, 70, 90, 100) plus the three worked crate situations (2·35, 3·48,
   4·65) present at exactly those ids.
4. **The economy simulation** (`DESIGN.md` §10.3) across three archetypes.
5. **The ammo and fuel audit** (`DESIGN.md` §10.7). **The second half of that assert is the important
   one** — at the *previous* tier the margin must be negative, which is what proves the upgrade was
   *needed* rather than merely available.

**The gate — `tools/gates_balance.mjs`.**

| # | criterion | PASS | FAIL |
|---|---|---|---|
| L1 | **every guaranteed crate in every one of the 100 levels is reachable** by at least one of the three methods, and the 3-star crate target is achievable with **≥ 15% time margin** | all | any unreachable |
| L2 | L1's report | per-crate detail lines with margins in seconds, sorted ascending, **ten tightest printed even when everything passes** | a pass count |
| L3 | difficulty curve | no level more than **0.18** off the smoothed act curve | any |
| L4 | novice completability | no level a `novice` pilot fails 3 of 8 times while its neighbours do not | any |
| L5 | completion time | mean within **±35%** of the level's target `t` | any outside |
| L6 | death rate | **8–30%**, with the declared exemptions (L56 up to 55%, L67 up to 60%, the five bosses up to 45%) **encoded in the data, not in the test** | any outside |
| L7 | economy | lifetime income / total cost lands in **1.05–1.20**; competent affords the act kit by `act*20 − 2`; sloppy lags ≤ 6 levels; great leads ≤ 8 | any outside |
| L8 | no runaway level | no single level's income exceeds 3× the act mean | any |
| L9 | upgrade necessity | ≥ 15% margin at the intended tier and **negative margin at the previous tier** | any tier positive at the tier below |
| L10 | static audit | every §10.6 check | any |
| L11 | anti-mock | for each of L1, L3, L6, L7 and L9: break the constant it guards and confirm the gate goes red. Recorded in `tools/BLESSED.md` | any still passing |

**Report back.** The difficulty curve as a table. Every level you had to move a number in and what it
cost. The measured values of the whole `DESIGN.md` §12 register that this phase owns (T16, T25, T26,
T29, T30) — and **explicitly** whether T19 (the canopy-cut multiplier) and T21 (the reinforcement
ladder) held up at 100-level scale, since those are two of the three the design names as riskiest.

---

### P12 — Story delivery: script, runner, radio, pools

**Goal.** `data/script.json` as the single source of truth for every player-facing word, the story
runner that schedules it, and the pooled chatter that gives the other ~72 levels a voice.
**Audio does not exist yet and must not be needed** (D7).

**You own.**

```
js/story/runner.js  script.js
data/script.json
tools/manifest.mjs
```

**You must not touch** `js/ui/cards.js` (P7's widget — you fill it through its API), the sim, or
`assets/audio/`.

**Read.** `STORY.md` **§5 in full** (the four contexts, the line-length caps measured against the
actual viewport, the radio timing numbers, **the suppression rules**, the pools), **§6 in full**
(the script — this is the content you are transcribing into `script.json`), **§6.7** (Blooded),
**§7 in full** (the audio-optional contract, the loader's rule, the four gates, speaker labels).
`ARCHITECTURE.md` **§7.5** (the `script.json` format and the card-duration formula) and **§7.6** (the
generated manifest). `DECISIONS.md` **D7, D23, D25**.

**Deliverables.**

1. **`data/script.json`** — every line from `STORY.md` §6, plus the thirteen pooled groups from §5.4.
   `text` is **mandatory and non-empty**; `audio` is advisory.
2. **The card is scheduled from the text, always, and never from the audio.**
   `dur = clamp(1.1 + text.length/13.5, 1.6, 7.0)`, and audio may only *extend* it. Deriving duration
   from audio gives a **0 ms card** when the file is missing, which is precisely how "playable with
   the audio folder empty" ships broken while every boot test still passes.
3. **The suppression rules** (`STORY.md` §5.3): not in the first 4 s or last 3 s of a mission; not
   while a target is inside the gun cone; not below 150 m; not within 2 s of a crate catch or loss.
   **Story beat lines outrank pooled chatter and cancel a queued pooled line outright — do not
   crossfade them.** A story line that arrives after its moment is worse than one dropped.
4. **The bag rule that will otherwise ship broken:** a dead or departed speaker's lines are **removed
   from every bag at the act boundary that kills them**, and any line of theirs already in the queue
   is **dropped, not played**. Aurie is dead from level 34; Odile leaves at 54 and returns at 87 with
   a *different* pool. A cheerful bark from Aurie at level 61 is the worst bug this system can have
   and it is one line of code to prevent.
5. **Six foreground radio lines per mission is the ceiling and four is the target.** Beat levels get
   six; ordinary levels get three or four from pools.
6. **`tools/manifest.mjs`** — generates `assets/audio/manifest.json` from `script.json`. **Never
   hand-edited**: an authored manifest drifts from the script the first time a line is reworded, and
   then the game says one thing and the card says another.
7. **The Air Board is `bm_george`, not `am_echo`** (D23). Apply it in the cast table now; `SUNO.md`
   §3.1 is stale on that line until P15 regenerates.

**The gate — `tools/gates_vo.mjs`, V1/V2/V4 (V3 waits for P15).**

| # | criterion | PASS |
|---|---|---|
| V1 | every entry has non-empty `text`, and **every string in it** is within its ctx's cap (`radio` **44**, `brief` situation 90, objective 60, `debrief` 70, `hangar` 80). **Run it against `STORY.md` §6 as well as against `script.json`**, so the doc and the data cannot drift | 0 violations |
| V2 | every `.mp3` under `assets/audio/vo/` is named by an id present in `script.json` — **an orphan file is a failure** | 0 orphans |
| V4 | every `who` exists in the cast table and has a voice id | 0 missing |
| V5 | every gate above can be shown to fail (`--falsify`) | all three go red on demand |
| V6 | card scheduling | with the audio layer stubbed, 3 beat levels play and **every scheduled card appears with a non-zero duration** | 0 zero-duration cards |

**Report back.** Line counts per context and per speaker. Any `STORY.md` §6 line you had to shorten
to meet its cap, with the before and after. Any pool that came in under its target size.

---

### P13 — Hangar, upgrades, economy, traits, save

**Goal.** The between-missions loop: the hangar screen, the upgrade tree, Reputation-gated pilot
traits, and the economy wired to real crate income.

**You own.** `js/ui/hangar.js`, `data/tables/upgrades.json`, `js/core/save.js` (economy fields),
`js/modes/story.js` (debrief and reward flow).

**Read.** `DESIGN.md` **§6 in full** (currencies, the tree, pilot traits, crate income per act, **the
purchase schedule checked**, failure costs and the no-grind guarantees), **§1.11** (airframes are
**sidegrades, not a ladder, and must never be presented as tiers in the UI**), **§9.1** (what
difficulty is forbidden from touching). `ARCHITECTURE.md` **§7.4** (the upgrades format —
**multipliers, never absolutes**, so a flight retune does not invalidate the table), **§7.3** (save).
`ART.md` **§10** for the screen's visual language.

**Deliverables.**

1. The tree, with **multipliers not absolutes**.
2. Traits as **Reputation-gated, not bought**. Re-equip free, any time.
3. **The fake-ad doubler hook** (`Field Bonus — double this mission's Scrip`, max 3/day, an inline
   card on the results screen, **never a modal**) — implemented and **shipped OFF** behind
   `settings.fieldBonus = false`. **There is never a real ad and never a purchase.**
4. Repair fee 1 Scrip per 4 structure lost, **capped at 60**. A failed mission still banks every crate
   taken before dying. **You never lose progress.**
5. **After three consecutive failures on the same level**, an inline dismissible card offers a
   wingman. **Dismissed twice, never offered on that level again.** The game does not nag.

**The gate.** `L7`, `L8` and `L9` from P11 re-run against the real hangar; plus: no modal anywhere in
the flow; airframes rendered as a row of alternatives, never as a ladder; and a save round-trip
through a version bump using `migrate`, never a wipe.

---

### P14 — The other five modes

**Goal.** The Long Patrol, Pylon Race, Airlift, Duel (promoted from P5's harness build to a real
mode), and the Daily seeded challenge.

**You own.** `js/modes/{survival,race,airlift,daily}.js`, and `duel.js` (inherited from P5).

**Read.** `DESIGN.md` **§7.2 through §7.6** — and note that each mode's brief opens with **why it
exists**; a mode that does not exercise a part of the flight model the others do not should be a level
type inside Story instead. **§8.12** (the unlock schedule: Duel 18 · Daily 20 · Race 31 · Long Patrol
40 · Airlift 50). `ARCHITECTURE.md` **§7.3** (ghost storage: a base64 `Float32Array` of
`(t, x, y, angle)` at 10 Hz, cap 20, evict oldest) and **§6.9** (`rng.fork`, and why `hashSeed` is
load-bearing for daily seeds).

**The gate.** Ghost replay reproduces the recorded run within 2 wu over a full lap. The Daily produces
**identical levels from the same date string on two separate processes**. Airlift's loaded envelope
matches `DESIGN.md` §4.7's numbers (stall 21.9, climb 4.1, corner 49 — rescaled by P4's fit, per
ruling R-01). Long Patrol runs 15 minutes without a leak, an allocation trend, or a fps decline over
5%.

---

### P15 — Audio content: aviation SFX, VO, music handoff

**Goal.** Fill P2's engine with content. **Nothing here blocks anything** (D7) — this phase exists to
make the game better, not to make it work.

**You own.** `js/audio/sfx/**`, `js/core/audio.js` (inherited from P2, ruling R-15),
`assets/audio/**`, `tools/vo/**`, `tools/split_take.py`.

**Read.** **`SFX.md` in full** (what carries over from the 53, and the to-build lists — continuous
and one-shot). `SUNO.md` **§1, §3.1, §3.4, §4** (where files go, the local cast, the three voice-prompt
rules, and Aaron's checklist). **`VO_AUDITION.md` in full** — it is the measured proof of the pipeline
and it carries four findings that will bite you. `DECISIONS.md` **D7, D8, D16, D17, D23, D24, D25**.

**Deliverables.**

1. **The aviation one-shots**: Vickers/Spandau (synchronised, period — **must not sound like a modern
   gun**), ricochet, canopy deploy snap, crate catch, wing-shear, gear touchdown and ground roll, the
   flak *crump* as distinct from a generic explosion, prop-strike and prop-stop.
2. **The remaining continuous sources on P2's sustained layer**: wire hum and airframe stress keyed to
   dynamic pressure, stall buffet, the engine damage states (misfire, rough, cough, dead-stick, air
   restart), and the zeppelin drone. **A period rotary blips on and off rather than throttling, which
   is a gift: the sound of cutting the blip is the sound of a stall turn.**
3. **Every new effect goes into `verify_audio.mjs` in the same run.** An unverified effect is assumed
   silent.
4. **The VO batch.** `tools/vo/kokoro_say.py` is **taken from NEONHAUL again, verbatim, not forked
   from `docs/vo_audition/`**. **Batch every line the build needs into one `jobs.json`** — the
   pipeline loads an 82 M model and a phonemiser once (~6 s) and then costs ~0.8 s a line; a process
   per clip would spend the whole run loading weights. **Sort jobs by voice prefix**: `lang_code` is
   the first letter of the voice name, and a list that alternates `b*` and `a*` pays the load twice.
5. **Tune pace against measured wpm, not against the speed multiplier** (D24). `VO_AUDITION.md` §4.1
   measured all fifteen voices on one control sentence: `grelle` at 0.92 is the **4th fastest** voice
   in the game, `drach` at 0.90 is mid-pack, and Hurdy — the most-heard voice — sits 9 wpm from Aurie
   despite a much higher speed setting, which will not read as a character trait. The Ferrys /
   Baumgart / Roo bottom three and the Ferber pair already do what was intended: **do not touch them**.
6. **The Air Board is `bm_george`** (D23), and **the British bench is now full** (D25): four British
   female voices all assigned, `bm_george` the last British male. Any further British part must double
   up an existing voice at a different speed. **Know this before promising a new Verrine character a
   voice that does not exist.**
7. **The radio chain in ffmpeg, not in the prompt** — four profiles (`own`, `air`, `ground`, `dry`)
   which are four physical situations, not four EQ presets. **`hangar` lines are `dry`.** Putting them
   through the radio chain is the single most likely mistake here and it would make the warmest scenes
   in the game sound like traffic control.
8. **Check the loudness stage on the Countess specifically** (`VO_AUDITION.md` §4.3): `af_nova`
   rendered 8.7 LU below the loudest clip, so the −16 LUFS shelf applies ~14 dB of gain to her and
   lifts whatever noise floor sits under it.
9. **Play the `bulletin` clip twice** (§4.4): whisper heard *"Conquered line, patients"* for
   *"Concord Line, Patience"*, on the one voice deliberately delivered flat, on a radio. If it is
   genuinely unclear the fix is a beat of separation (`SUNO.md` §3.4's array-of-cards trick), **not** a
   speed change — and it argues for a lighter band-limit on `bulletin`.
10. **`tools/split_take.py`** ported from NEONHAUL, for Aaron's two SUNO takes. Write the SUNO handoff
    note; **SUNO is Aaron's manual step** and this phase must not wait on it.

**The gate.** `tools/verify_audio.mjs` reports **N/N clean** including every new effect and every
sustained source. `gates_vo` **V3**: rename `assets/audio/` away — **move the files, do not set a
flag** — and replay three beat levels; assert every scheduled card appeared with a non-zero duration
and the mission completed. **A `?noaudio` flag would only ever prove that the flag works.**
Plus: no gameplay logic hangs off an audio callback, and the sustained-voice cap holds in a 12-aircraft
furball.

---

### P16 — The art pass and the blind-critic rounds

**Goal.** Get the game past `ART.md` §9's gate. **This is the only phase whose success is decided by
agents who are not told which image is ours** (D10).

**You own.** `art/**`, `assets/**` (non-audio), `js/gfx/{sky,clouds}.js`, and the **rig definitions**
under `js/gfx/rigs/`. You still may not edit `js/gfx/parts.js`, `renderer.js` or the shaders.

**Read.** `ART.md` **§2** (the six pillars, and the test each one fails), **§5** "Drawing spec — the
aeroplane" (the part order, banking sold three ways, three-tone shading, component damage, the
**torn-variant silhouette** on a shed part — P2 depends on a dying aeroplane being a visibly
*different shape*), **§9 in full** (the protocol, the rubric, the gate, the reference plates), **§11**
(the biggest risk). `ART_AB_FINDINGS.md` **§3** (the winning grammar) and **§4** (props).
`DESIGN.md` **§3.2** (every damage state must be visually distinct **at 40 css px** — there is no
damage bar, so this is the entire damage UI) and **§2.9a**.

**The gate — `ART.md` §9, unchanged.** Two conditions, **both** required:

- **Mean gap ≥ −2.0** across three critics × three shots.
- **For two consecutive rounds, no critic uses the words** *flat*, *uniform*, *the same ambient*,
  *sticker*, *tiling*, *repeated* or *wallpaper* in a differences list.

**The second condition is the real one.** On NEONHAUL the numeric gap moved −5.17 → −5.00 across a
whole art pass — inside a ±1.5 noise floor and therefore not a result — while the differences lists
changed completely and told us exactly what was fixed. **Read the differences lists, not the scores.**
A gate that passes on a number while a critic is still saying "sticker" has not passed.

Plus the pillar tests, run as measurements: **P1** (desaturate, ask a critic to trace the shadow
direction on the aeroplane, the nearest cloud and the ground strip; and sample the shadow hue against
the key hue — **under 40° of hue separation means the shadow is a multiply and P1 is broken**);
**P2** (black-on-white alpha silhouette, every object nameable, and **"some planes" is a fail**);
**P3** (the `FG_OCCLUDE` histogram); **P4** (**the removal test** — delete each light source class and
re-render; if nothing else in the image changed, it was a sticker); **P5** (a 200×200 patch from a
cloud and one from the player's upper wing must **both** have visible non-uniform texture; a flat fill
or a clean linear gradient on the wing is a fail); **P6** (named repeats, −1 each).

**Report back.** Every differences list, verbatim. Which pillar tests failed and what you changed.
Whether `gfx/parts.js` needs a fourth tone (§11 — agent R decides on blind-critic scores; **three tones
ship first**).

---

### P17 — Ship

**Goal.** 60 fps on the target devices, the low-detail preset actually applying, the screenshot,
`projects.js`, and the push.

**Owned by the manager, with the engine agent for the perf work.**

**Read.** `ARCHITECTURE.md` **§9 in full** — §9.1 targets, §9.2 the budget line by line, §9.3 the
low-detail preset. `ART.md` **§11** ("portrait fill-rate": if it does not hold 60 fps, **the layer to
cut is `CLOUD_NEAR`, then `HORIZON_FAR` — never `FG_OCCLUDE`**, which is P3 and is doing the most work
per byte in the whole stack).

**The gate — `tools/gates_perf.mjs`.**

| # | criterion | PASS |
|---|---|---|
| S1 | 60 fps at 390×844 dpr 2 on the busiest level | mean frame ≤ **16.7 ms**, p95 ≤ 22 ms |
| S2 | 844×390 and 1440×810 | same |
| S3 | draw calls | ≤ **26 typical, ≤ 34 peak** |
| S4 | sprites / particles / lights | ≤ 4,000 typ / 9,000 peak · ≤ 6,000 live, cap 12,000 · ≤ 24 |
| S5 | texture memory / total payload | ≤ **96 MB** / ≤ **10 MB** |
| S6 | zero allocation in the hot loop | no heap growth over 300 s |
| S7 | **the low preset actually applies** | with `?low=1`, every one of the §9.3 rows measurably changes, **each read from `quality.low` in exactly one place per system**. Grep for inline `if (low)` in a draw path: zero |
| S8 | `quality.auto()` | flips to low when mean frame exceeds 22 ms over 3 s, and **never flips back up** |
| S9 | the whole game with `assets/audio/` moved away | boots, plays a full act, no console error |
| S10 | `gates_boot` no-CDN | 0 cross-origin requests |

**Then:** the screenshot to `assets/screenshots/kitehawk.jpg`, the `projects.js` entry with `wip`
removed, commit, push. **Anything irreversible or outward-facing beyond this routine goes to Aaron**
(D15, D40).

---

## §4 — The open items, and where each one is resolved

| item | what is open | resolved in | how |
|---|---|---|---|
| **D32** | the 4.5 g structural limit is decorative — even the corrected 126 °/s is 8.5 g at corner speed and a sustained turn is 10.1 g | **P4** | ruling R-07. Restate the limit as a normalised **stress** scale; do not lower `A` (floor 2.67). **Do not let 4.5 g stay in the tables looking load-bearing** |
| **D33** | drag `k` gives 84 m/s, not the intended 90 | **P4** | ruling R-08. It is two different quantities conflated, and it hides a real bug: terminal must **exceed** Vne or a dive can never overspeed the airframe |
| **D39** | `ART.md` §7's neutral-light rule fights the style fix | **P3** | a six-plate A/B, both plates through `poster.js`, one blind-critic round, and the choice recorded |
| **`assets/audio/` vs `audio/`** (agent A's open question) | which path | **P3** (one-line doc fix) | ruling R-04. `ARCHITECTURE.md` §5's tree wins: `assets/` at the game root, `assets/audio/` for audio. `ART.md` §7's `game/assets/` is stale and is the only dissent |
| **`R.mesh`** textured-triangle stream for deforming silk | build it or not | manager, on **P6**'s report | only if the 6-segment canopy strip shows seams at 2× zoom. **Do not build it speculatively** |
| **re-porting Sunderfall's synthesised audio bank** | needed or not | manager, after **P15** reports | `ARCHITECTURE.md` §11 |
| **widening the auto zoom clamp below 0.78** | to 0.68 | manager, on **P8**'s P0 measurement | only if the p90 framing box lands between 503 and 585 wu. Below 0.671 no zoom is legible at all |
| **a fourth tone in `parts.js`** | needed or not | agent R, on **P16** blind-critic scores | three tones ship first |
| **portrait → landscape** | the pivot | **P8**, and **Aaron regardless** (D15, D40) | it changes the game he asked for |

---

## §5 — The tuning register, mapped to phases

`DESIGN.md` §12 lists 30 **[START]** values, each naming the test that refines it. Here is which phase
runs which test. **A value that leaves its phase unmeasured must be reported as unmeasured**, not
quietly kept.

| phase | register entries | the test |
|---|---|---|
| **P4** | T1 atmosphere `H` · T2 flutter drag · T3 `CD0` · T4 post-stall CL table · T5 `K_q` · T6 alpha-limiter margin · T7 limiter release · T27 camera base height | `sim.mjs --envelope` and the §10.8 fixtures. F10 is T1's test; F5 is T2's |
| **P5** | T10 cone half-angle · T11 convergence · T12 target-priority weights · T13 lock hysteresis · T14 structure/DPS ratio · T23 ace `k` · T24 morale coefficients | the duel matrix and the §10.5 hit-rate and flee-rate measurements |
| **P6** | T15 fire blow-out · T17 small-arms curve · **T18 crate terminal** · **T19 canopy-cut multiplier** · T20 high-cut burst chance · **T21 reinforcement ladder** · T22 crate contents weights | gates K3, K4, K5, and the §10.3 expected-value model |
| **P7** | T8 stick radius · T9 stick response exponent · T28 zoom slew rates | the CDP touch harness (H11, H12) and the zoom trace |
| **P11** | T16 flak lead error · T25 income constants · T26 upgrade costs · T29 level target times · T30 band edges | `gates_balance` L3–L9, plus `timeInBand` for T30 |

**The three riskiest, named by `DESIGN.md` itself: T19, T21 and T1.**

- **T19, the 1.6× canopy-cut multiplier, is the one to watch.** `DESIGN.md` §12 marks it *low
  confidence and load-bearing*: **below about 1.35× nobody will fly into the Mud for it**, and the
  entire §4.3 design — the best decision in the design document, the thing that pushes the player into
  the dangerous part of the sky — degenerates into a floating pickup. Gate K3 measures it directly at
  P6 and P11 re-measures it at 100-level scale. **If it measures below 1.35×, re-argue the system;
  do not nudge the number.**
- **T21, the enemy reinforcement ladder.** If losing three crates does not measurably raise the death
  rate, the ladder is decoration and crates are a shop rather than a battlefield objective. Gate K5.
- **T1, the atmosphere scale height.** If thin air does not measurably worsen the turn, the ceiling has
  no meaning and the whole top half of the ladder is scenery. Gate F10.

---

## §6 — Rulings: what the planning documents disagree about

These are places two source documents conflict in a way `DECISIONS.md` does not already settle. **Each
ruling is binding exactly as `DECISIONS.md` is**, and each names the phase that implements it. Where a
build agent believes a ruling is wrong, it writes an **OBJECTION** in `HANDOFF.md` and works around it.

---

**R-01 — the flight model. `DESIGN.md` §1 and `ARCHITECTURE.md` §3.4 describe two different
aeroplanes, and this is the biggest unresolved conflict in the project.** *(implemented at P4)*

`DESIGN.md` §1 derives a full point-mass aero model from a specific airframe (`m 520 kg`, `S 18 m²`,
`CLmax 1.459`, `CD0 0.060`, `T0 2300 N`, `n_lim 4.5 g`) and gets stall 17.8 · V_max 58.3 · terminal 90
· RoC 9.2 · corner 37.8 m/s · instantaneous turn **65 °/s**. `ARCHITECTURE.md` §3.4 states, post-D26,
stall 16.5 · V_max 60 · terminal 84 · Vne 93 · RoC 13.5 · corner 45 m/s · pitch rate **126 °/s**.
These are not roundings of each other: at 45 m/s, 126 °/s is a **10.1 physical g** turn, and
`DESIGN.md`'s wing cannot produce more than about 6.4 g there.

**Ruling.**

1. **`DESIGN.md` §1.1–1.3 and §1.6–1.10 win on the *model form*** — the state variables, the lift
   curve and its post-stall table, the drag polar, the atmosphere and thrust lapse, the alpha limiter
   and its escape hatch, the pitch-rate law, inverted flight, the auto-throttle. That is the
   implementable physics and it is good.
2. **`ARCHITECTURE.md` §3.4 wins on the *envelope targets*** — those are the numbers `ARCHITECTURE.md`
   §4.4's gate is built on, and D26/D29 corrected them. `DESIGN.md` §0a's `M_PER_WU = 0.1550`, its
   `1 wu = 8 ft` discussion, its `4.5 g`, and its `150 °/s → 95 °/s` pitch envelope are **all
   pre-D26 and are struck**.
3. **The flight agent re-derives the airframe coefficients** so the §1 model form reproduces the §3.4
   envelope. The system is over-determined, so here is what may move:

| target | value | tolerance | may it move? |
|---|---|---|---|
| gravity | 9.81 m/s² | exact | **no** |
| stall | 16.5 m/s | ±1.0 | no |
| best climb rate | 13.5 m/s | ±1.0 | no |
| **combat turn diameter at corner** | ≤ 286 wu (273 derived) | — | **no. Portrait lives on this** |
| **dive recovery vertical extent** | ≤ 1,111 wu (1,053 derived) | — | **no. P0 fails above it** |
| level top speed | 60 m/s | ±2 | yes, within tolerance |
| Vne | 93 m/s | **86 – 93** | **yes** — and lowering it *helps* the dive-recovery constraint |
| terminal (vertical, powered) | — | **Vne × 1.02 – 1.05** | derived, but must satisfy this |
| `m`, `S`, `CLmax`, `CD0`, `T0`, flutter coefficient | — | free | **yes, entirely.** Nobody ever sees a wing loading |

4. **`A = 2.8` is an explicit arcade multiplier on turn kinematics, not a wing.** `ARCHITECTURE.md`
   §3.0 already says so ("apparent load factors are ~2.8× real, so the g-meter reads airframe stress,
   not physical g"). Implement it as: the aircraft may command a load factor up to `A`-scaled what the
   wing physically gives, **and the induced-drag penalty is computed from the commanded load factor**,
   so the energy cost of a hard turn is real. That preserves `DESIGN.md` §1.5's two most valuable
   emergent numbers — the 65-vs-54 instantaneous/sustained gap (gate F8) and the ~8 m/s-per-second
   energy bleed (gate F9) — which are the entire tactical layer.
5. **Every `DESIGN.md` §1.5 table is a *shape* to preserve, not a set of values to reproduce.** Check
   your fit against its structure: a flat best-climb band between 30 and 40 m/s (so the player does not
   need to hit a precise number — good for a thumb), a ~5:1 speed band, a corner speed near the middle
   of the band, and a sustained best that is slower than the instantaneous best.

---

**R-02 — the band edges. `ARCHITECTURE.md` §3.3's own provisional table violates `ARCHITECTURE.md`
§3.3's own constraint 1, and `DESIGN.md` §0b is pre-D28.** *(implemented at P4, consumed by P3, P7,
P9)*

§3.3 requires **no band thinner than 700 wu**; its own Mud is **333 wu**. `DESIGN.md` §0b uses a
per-act ceiling of 600–1100 m, which D28 replaced with a single playable ceiling of **1,500 m /
10,000 wu**.

**Ruling — this is the canonical set, and it satisfies all four constraints:**

| band | metres | y range (wu) | thickness | altimeter |
|---|---|---|---|---|
| **Mud** | 0 – 105 | 0 → −700 | 700 | 0 – 344 ft |
| **Belt** | 105 – 255 | −700 → −1700 | 1000 | 344 – 837 ft |
| **Floor** | 255 – 450 | −1700 → −3000 | 1300 | 837 – 1,476 ft |
| **Deck** | 450 – 750 | −3000 → −5000 | 2000 | 1,476 – 2,461 ft |
| **Lane** | 750 – 1125 | −5000 → −7500 | 2500 | 2,461 – 3,691 ft |
| **Blue** | 1125 – 1500 | −7500 → −10000 | 2500 | 3,691 – 4,921 ft |

Checks: minimum thickness **700 wu** ✓ · three lowest sum to **3,000 wu** ✓ · Deck **2,000 ≥ 1,300** ✓
· total **10,000** ✓. It also happens to reconcile `DESIGN.md` §0b, whose Mud is 0–110 m and whose
mechanics (small arms fading by 250 m, flak starting at 220 m) sit correctly inside Belt at 105–255 m.

**`DESIGN.md` §0b's per-act ceilings are struck. What survives from §0b is which bands a mission
*occupies*** — Act 1 lives in Mud/Belt/Floor, Act 2 opens Deck and Lane, Act 3 opens Blue, Act 4 makes
the middle hostile, Act 5 makes Blue the arena. That is D31's 2–3 band slice, and it is one line of
level data rather than a moving ceiling.

---

**R-03 — act theatres and palettes. `ART.md` §6 and `DESIGN.md` §8.13 assign different hours to
different acts.** *(implemented at P3)*

`ART.md` §6: I overcast morning · II gold hour · **III night** · **IV alpine noon** · V burning dusk.
`DESIGN.md` §8.13: 1 spring midday · 2 summer morning · **3 mountains autumn late afternoon** ·
**4 winter night** · 5 late summer high sun with a dusk finale.

**`DESIGN.md` wins on which act is which hour**, because the `sky` column in `DESIGN.md` §8.4–8.8 is
**100 rows of data** (33 day, 22 overcast, 15 night, 12 dusk, 10 storm, 8 high sun) and prose loses to
data. `DESIGN.md` §8.13 anticipated exactly this: *"C's five key/shadow relationships survive any
reshuffle of theatres because they are anchored to the hour, not the terrain."*

**`ART.md` wins on the five key/shadow relationships and on the rule that no two acts share one.**

**Ruling — the LUT is keyed on `(act, sky-state)`, not on act alone.** Each act has a base ramp and
each sky state it uses is a variant lerped from it.

| act | hour | relationship | palette |
|---|---|---|---|
| 1 | spring midday, flat, mud | cool-key / cool-shadow (dead) | `ART.md` §6 **Act I**, unchanged |
| 2 | summer morning, over-deck glare vs flat grey below | warm-key / violet-shadow | `ART.md` §6 **Act II**, key cooled toward morning |
| 3 | mountains, autumn, late afternoon raking | **warm-key / black-shadow, cold accent** | **re-authored.** Structure from §6 Act III (one accent, near-black shadow), hue inverted to a warm raking key |
| 4 | winter night, storms, four hard sources and no ambient | **cold-key / black-shadow, hot accent** | `ART.md` §6 **Act III "Night Raid"**, re-indexed to act 4 |
| 5 | late summer high sun, dusk finale | hot-key / black-red-shadow | `ART.md` §6 **Act V**, plus a high-sun variant |
| — | `s` storm / blizzard sky-state, mostly Act 4 | **white-key / blue-shadow** (the only cold key) | `ART.md` §6 **Act IV "The White Front"**, re-purposed as a **sky-state** palette rather than an act one |

That preserves all five relationships, keeps the "no two acts share one" rule (act 3 is warm key with a
cold accent; act 4 is cold key with a hot accent — a genuine inversion), and finds the alpine palette a
home in the blizzard levels `DESIGN.md` actually schedules (L71, L79). **The art agent may
counter-propose in HANDOFF; it may not silently re-index.**

Two consequences: **`ART.md` §3's band names (MUD/FLAK/WORK/DECK/SUNLIT/THIN) are struck** — the names
are D19's, frozen — and **`ART.md` §3's `alt = altitude_m / 6000` becomes `altitude_m / 1500`** (D28:
normalise on the playable ceiling).

---

**R-04 — the file tree.** *(implemented at P3)*

`ART.md` §7 "Where files land" puts shipped art under `kitehawk/game/assets/`. There is no `game/`
directory in `ARCHITECTURE.md` §5. **`ARCHITECTURE.md` §5's tree wins**: `assets/` at the game root,
`assets/audio/` for audio, `art/{tools,src,raw,work}/` for production with `raw/` and `work/`
gitignored. This also settles agent A's open `assets/audio/` vs `audio/` question — `assets/audio/`,
and every other document already agrees.

Two smaller corrections in the same section: **`crop.js`, `trim.js`, `tile.js`, `ramp.js` and
`poster.js` do not exist in `gms/2d/sunderfall/art/tools/`** and must be written, not ported (only
`key.js`, `atlas.js`, `verify.js`, `flux.py` and `img.js` port). And `docs/refs/study/` is gitignored
and the manager populates it locally (`ART.md` R2).

---

**R-05 — the layer table.** *(implemented at P1, consumed by P3)*

`ART.md` §4 lists 13 layers; `ARCHITECTURE.md` §2.4 change 3 lists 14. **`ARCHITECTURE.md` wins — it is
the contract.** Mapping for the art agent:

```
ART SKY_GRAD + CELESTIAL → SKY(0)      ART CLOUD_FAR   → CLOUD_FAR(1)
ART CLOUD_MID            → CLOUD_MID(2) ART HORIZON_FAR → HORIZON(3)
ART GROUND_FAR           → GROUND_FAR(4) ART GROUND_MID → GROUND_MID(5)
ART TERRAIN              → GROUND(6)
new: ACTORS_BACK(7), TRAILS(8), UI_WORLD(13)
ART ACTORS → ACTORS(9)   ART FX → FX(10)   ART CLOUD_NEAR → CLOUD_NEAR(11)
ART FG_OCCLUDE → FG_OCCLUDE(12)
ART GLASS → not a world layer. Screen-locked UI, drawn by js/ui/.
```

`ARCHITECTURE.md` §2.4's `parallax`/`parallaxY` table is A's starting set and it says the art agent may
retune within it. `ART.md` §4's `px`/`py` numbers are the retune target; every change is recorded in
HANDOFF with its reason.

---

**R-06 — the zoom range.** *(implemented at P1/P2)*

`ART.md` §4 and `DESIGN.md` §2.8 both use 0.80–1.30; `ARCHITECTURE.md` §4.1 uses **0.78–1.22**
(span 1.56×), re-anchored so 1.00 means combat framing. **`ARCHITECTURE.md` wins.** This is
*favourable* to `ART.md` R12's texture-memory argument: the zoom-in cap drops from 1.30 to **1.22**,
so the sharp-layer bill falls from 1.69× to **1.49×** and the art payload lands comfortably under the
12 MB ceiling with margin. `DESIGN.md` §2.1's `CAM_H_BASE = 132 m` is likewise replaced by
`worldH = 1000 wu = 150 m`.

---

**R-07 — D32, the structural limit.** *(implemented at P4)*

Adopt the **restate** option, not the lower-`A` option. `A = 2.8` is chosen so the combat turn circle
is 273 wu = 59% of portrait's width; its floor is 2.67 and there is no headroom to spend.

Delete "4.5 g structural" as a physical-g limit. Define instead:

```
STRESS = n_commanded / N_REF        N_REF = the sustained corner-speed turn (~10.1 physical g at A = 2.8)
```

so the reference turn reads **1.00 stress**. `ARCHITECTURE.md` §3.4's greyout (0.72 held > 1.2 s) and
blackout (0.88 held > 0.8 s) then apply unchanged. `DESIGN.md` §1.11's per-airframe `n_lim` values
(4.5 / 4.7 / 4.9 / 4.1 / 5.0) become **stress limits** at `n_lim / 4.5`: 1.00 / 1.04 / 1.09 / 0.91 /
1.11 — the same spread, on a scale that means something. **The HUD prints STRESS, never G**
(`ARCHITECTURE.md` §3.4). The `Iron Neck` trait's "`n_lim +0.4`" becomes "+0.09 stress".

---

**R-08 — D33, the drag constant, and the bug behind it.** *(implemented at P4)*

D33 reads the 84-vs-90 m/s gap as a 7% error in `k`. It is not: `v_term = √(g/k)` is the **unpowered,
1 g-drag** terminal, while `DESIGN.md` §1.5's 90 m/s is the **vertical, full-power, flutter-term**
terminal. Two different quantities, both legitimate. `ARCHITECTURE.md` §3.4's `k = 2.085×10⁻⁴ /wu` is
correct **for the quantity it labels**.

But there is a real bug underneath: `ARCHITECTURE.md` §3.4 lists nominal dive terminal at **84 m/s**
and Vne at **93 m/s**. If terminal is below Vne, **a dive can never overspeed the airframe**, and
`DESIGN.md` §1.9's entire "over the red" regime — the rigging howl, the fabric flutter, the wings dying
at 6 HP/s, "let go, let go now" — is unreachable. `DESIGN.md` §1.5 states the intent explicitly:
*"V_NE = 88 m/s sits just below [terminal 90] — so a sustained vertical dive will break the aircraft if
you hold it. Deliberate."*

**Ruling:** the flight agent must satisfy `V_terminal(vertical, full power, flutter term) = Vne ×
1.02–1.05`, which R-01 permits by letting Vne float down to 86 m/s. **Both terminals go in the table
with their SI values and their defining conditions**, so nobody conflates them again. Gate F5.

---

**R-09 — gun range and the auto-fire cone.** *(implemented at P5)*

`ARCHITECTURE.md` §4.3.5 and §6.4: cone **±11°**, range **440 wu = 66 m**. `DESIGN.md` §2.5: cone 8°
(+6° inside 50 m), `RANGE_EFFECTIVE` **140 m**. **`ARCHITECTURE.md` wins**, and its derivation is why:
440 wu is **95% of portrait's 462 wu visible width at `zoomCombat`**, so no hostile weapon outranges
the frame the flight model was tuned in — and 66 m is squarely inside the 50–100 m at which WWI guns
were actually effective, which the pre-D26 scale's 1,073 m absurdly was not.

Consequently every gunnery distance in `DESIGN.md` §2.5 rescales by **0.47**:

| | `DESIGN.md` | ruling |
|---|---|---|
| cone half-angle | 8° (+6° inside 50 m) | **±11°, no snap bonus** — the snap existed to compensate a long range that no longer exists |
| effective range | 140 m | **66 m (440 wu)** |
| tracer range | 220 m | **105 m (700 wu)** |
| convergence | 90 m | **40 m (267 wu)** |
| Long Vickers / Eagle Eye | 190 m / +25% | **90 m / 82 m** |
| bullet speed | 420 m/s | unchanged — time of flight to 66 m is 0.157 s, a 50 m/s crosser needs 0.8 hull-lengths of lead, so the lead pip is still a real skill |

Everything else in §2.5 and §2.6 carries over unchanged: the target-priority scoring, the 0.40 s lock
hysteresis, real projectiles with gravity drop and dispersion, the close-range straddle that makes
ramming worse, and **the rule that the assist decides when to fire and never where the bullets go**.

---

**R-10 — HP, hull sizes and colliders.** *(implemented at P5)*

`ARCHITECTURE.md` §7.4's `"hp": 100` is an illustrative JSON fragment; `DESIGN.md` §3.1's component
model (Structure 220 + seven components) is the specification. **`DESIGN.md` wins on damage; the JSON
example is updated to match.** Data files are agent-owned, not contract.

Hull size: **`ARCHITECTURE.md` §3.4 wins** — 9.6 m / **64 wu** drawn length (6.0 m × K 1.6), with
enemy scouts at **60–70 wu and never below 60**; below 54 wu the portrait gate's P3 fails outright, so
this is a hard art constraint too. `DESIGN.md` §3.1's collider dimensions were authored against a
7.4 m hull and **scale by 1.297**: fuselage capsule 9.6 × 1.82 m, upper wing 11.0 × 1.17 m offset
−1.17 `n`, lower wing 10.4 × 1.17 m offset +0.91 `n`.

---

**R-11 — the ace roster.** *(implemented at P11)*

`DESIGN.md` §5.3 has twelve behaviour profiles A1–A12 with placeholder names at specific level ids;
`STORY.md` §3.3 has seven named aces (eight pilots, counting the Ferber brothers) at partly different
ids. The ids collide at 18, 56, 87, 98 and 99.

**Ruling: `STORY.md` wins on *who and when*** — it is the script, with forty written scenes and every
radio line depending on it. **`DESIGN.md` wins on *what they do*** — the behaviour profiles are a
library, and `DESIGN.md`'s own rule is right that each ace must be beatable by **a specific idea, not
by more DPS**. Where a level id collides, **the story beat wins** and the non-story duel moves to the
nearest free slot.

P11 produces one `data/tables/aces.json` mapping name → behaviour profile → level ids → counter, names
the four or five behaviour profiles `STORY.md` does not cover (they become named opponents, not
"elite #3"), and records every level move. Two placements already agree in shape and should be kept:
**L56 is a duel you survive rather than win** in both documents, and **L70 is a duel you win by taking
a crate rather than by shooting** in both. Those are the two levels `DESIGN.md` §8.1 calls the cheapest
variety in the game; do not lose them.

---

**R-12 — the stick radius.** *(implemented at P2, refined at P7)*

`ARCHITECTURE.md` §6.4 ports Sunderfall's `stickR = max(36, min(zone.w, zone.h) * 0.36)`, which on a
390-wide portrait zone gives ~140 css px. `DESIGN.md` §2.2 specifies `R = 90 px` on a 432-wide
reference canvas, i.e. **0.208 of the viewport width** — about 81 css px at 390. **Use `DESIGN.md`'s
figure as the initial value** (`stickR = max(36, view.w * 0.208)`), keeping the ported `max(36, …)`
floor. It is T8 in the tuning register and P7's thumb-travel harness refines it; the ported formula was
tuned for a landscape game with a half-width stick zone and has no claim here.

---

**R-13 — `ARCHITECTURE.md` §4.4 P4's "≥3 bands at establish".** *(no action — recorded so it is not
re-litigated)*

Already settled by **D30**: it means the establishing **shot**, a slow vertical crane, not a static
frame. A static frame cannot contain three bands at any legible zoom (the three lowest sum to 3,000 wu;
showing them needs zoom 0.33 and an 18 px hull). R-02's band edges preserve the constraint that makes
the crane cross three bands in ≤ 4 s.

---

**R-14 — `DESIGN.md` §2.9's gate vs `ARCHITECTURE.md` §4.4's gate.** *(implemented at P7 and P8)*

`ARCHITECTURE.md` §4.4 wins; it is the contract, and D27/D30 amended it. `DESIGN.md` §2.9's P3/P3b/P3c
are already folded in as `ARCHITECTURE.md`'s P3b/P3c. **One `DESIGN.md` criterion has no home in §4.4
and must not be lost: P4, median thumb travel ≤ 2,200 css px per minute.** It is folded into P7's HUD
gate as H12.

---

**R-15 — who owns `js/core/audio.js`.** *(P2 creates, P15 inherits)*

`ARCHITECTURE.md` §5.1 assigns `js/core/audio.js` to the story/audio agent, and §2.6 says not to port
Sunderfall's DSP bank but to write the thin facade instead. But D17 and `SFX.md` require the
**sustained-source layer** — ported from `gms/3d/forge_test/audio/js/core.js` and extended — to land
in the first engine phase, and `main.js` needs *something* satisfying §6.8 at boot.

**Ruling: P2 creates both `js/audio/core.js` (the DSP engine plus the sustained layer, the lab page,
and the verify harness) and `js/core/audio.js` (the §6.8 facade over it). Ownership of `js/core/audio.js`
transfers to the story/audio agent at P15**, which extends the facade and fills `js/audio/sfx/`.
`ARCHITECTURE.md` §5.1's ownership column is amended by this ruling and by nothing else. P15 **extends,
never rewrites**, P2's engine.

---

## §7 — Critical path and concurrency

**The critical path is:** P1 → P2 → P4 → P5 → P6 → P7 → **P8 (the gate)** → P9 → P10 (first playable)
→ P11 → P13 → P17.

Everything on it is blocking. The four items on it most likely to cost real time:

1. **P1's `parallaxY` and `parts.js`.** Both are "cheap now, ruinous later". If `parts.js`'s four
   painterly features are not right, P16 cannot pass and the game does not look good — and that will
   not be discovered until P16.
2. **P4's coefficient fit (R-01).** It is a genuine over-determined optimisation, not a transcription,
   and gates F6 and F7 are the two numbers portrait lives or dies on.
3. **P8's outcome.** A FAIL costs a re-proportioning pass across P3, P7 and P9 and goes to Aaron.
4. **P6's K3.** If the canopy-cut multiplier measures below 1.35× the signature mechanic degenerates
   and a design conversation, not a tuning nudge, follows.

**Off the critical path**, and therefore the phases to spend a concurrency window on if Aaron opens
one (D11's standing exception is only the blind critic, so this is contingent, not planned):

| may run alongside | because ownership is disjoint |
|---|---|
| **P3** (art) ‖ P4, P5, P6 | `art/**`, `assets/**`, `js/gfx/{sky,clouds}.js` touch nothing under `js/sim/` |
| **P12** (story text) ‖ P11 or P13 | `data/script.json` and `js/story/**` touch nothing else |
| **P15** (audio content) ‖ P14 or P16 | `assets/audio/**` and `js/audio/sfx/**` are disjoint from both |
| a **blind critic** ‖ any builder | the standing exception (D10, D11) |

**The one deliberate scheduling choice worth stating.** Crates (P6) sit *before* the portrait gate
rather than after it, even though the gate does not strictly require them. D4 puts them in the first
playable build, and a framing box measured without contested crates would be optimistic about exactly
the axis — portrait's 69.3 m of width — that P0 and P6 exist to test. Measuring the gate against a
game missing its signature mechanic is the strawman that §4.2 was written to prevent, applied to a
different mitigation.
