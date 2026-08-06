# WATERLINE — W0 scaffold handoff

**Read this before touching anything.** Work is serial — one agent at a time — so this file is the
only context transfer between components. If something here is wrong, fix the file *and* fix this.

Every file in `BUILD_PLAN.md` §1 exists, imports cleanly, and boots. The engine is FORGE's, ported.
Everything else is a **stub that satisfies its §2 contract** — real shapes, real return types, grey
boxes. Replace the body of your own module; do not add files to the map without asking.

Where `BUILD_PLAN.md` and `REVIEW.md` disagree, **the review wins** — the plan will be revised to
match. Everything below already reflects that.

`js/main.js`, `js/world/materials/index.js`, `js/world/vfx/index.js` and `js/world/vfx/pool.js` are
**frozen**. Serial working makes the freeze about *stability*, not merge conflicts: every scenario,
knob, emitter and material registers itself from its own module, so a coder picking up a file cold
never has to reason about the boot sequence. If you need wiring that genuinely isn't there, ask.

Boot check, any time: `node tools/shot.mjs --shot=boot --w=1280 --h=720 --dpr=1`.

## What is real vs what is a stub

| Real, use it as-is | Stub, replace the body |
|---|---|
| `engine/{app,quality,stats,budget,aa,post}.js` | `world/{ocean,sky,lighting,bridgeLights,bridge,ship,shell}.js` |
| `world/vfx/{index,pool}.js` — pooling, one draw call | `world/vfx/{gun,impact,fire,round}.js` emitter bodies |
| `world/table.js` coordinate maths (cellToLocal / localToCell / pegWorld) | `world/table.js` appearance |
| `cine/{rig,director}.js` — timeline, play, skip, seek | `cine/sequences.js` staging |
| `world/textures/{noise,bake}.js` (FORGE, verbatim) | `world/textures/surfaces.js` — 2 generators so far |
| `config.js`, `save.js`, `net/multiplayer.js` | `ui/*`, `world/materials/{hull,bridge,table}.js` |
| `world/fleet.js` cell⇄world maths + `shipAt` | `world/fleet.js` dramatised layout |
| `tools/{shot,compare,purity}.mjs`, `sim.mjs` | `sim/index.js` — signatures only, all throw |

### Ownership, for a coder picking up a file cold

| File | Owner | Note |
|---|---|---|
| `world/{ocean,sky,lighting}.js` | C1 | `lighting.js` is exterior only — C2 must not import it |
| `world/{bridge,table,bridgeLights}.js`, `materials/{bridge,table}.js` | C2 | interior lamps live in `bridgeLights.js` |
| `world/{ship,fleet}.js`, `materials/hull.js`, `vfx/gun.js` | C3 | `fleet.js` is new — see B1 below |
| `vfx/{impact,fire}.js` | C4 | |
| all of `js/sim/`, `sim.mjs` | C5 | gated by `purity.mjs` + the soak invariants |
| all of `js/cine/`, `world/{shell,vfx/round}.js` | C6 | `round.js` owns tracer **and** all drifting smoke |
| all of `js/ui/`, `js/net/`, `save.js` | C7 | writes only *inside* `#ui`; `index.html` is frozen |
| `js/config.js` | everyone, **namespaced** | write inside your own export only |

## window.__waterline

Created in `main.js` before anything else runs. `tools/shot.mjs` and every future harness read
these by name — never rename, remove, or reshape them:

| | |
|---|---|
| `ready` | `false` until frame 2 has drawn **and** every `app.loading()` promise has settled |
| `frames()` | monotonic frame counter |
| `stats()` | perf snapshot |
| `scenarios` | live getter → `[{id, label, ref, …}]` |
| `app` | the App: `.renderer .scene .camera .quality .systems` |

Also wired: `three`, `quality`, `setPreset`, `setDprCap`, `setScenario(id)`, `texBreakdown()`,
`seek(sequenceId, t)`, `pace(mode)`, `world`, `cine`, `vfx`, `sim`, `ui`, `net`, `save`.

`world` = `{sky, lighting, ocean, bridge, bridgeLights, table, ship}`.
`cine` = `{rig, director, caption, fireShell, arcHeight}`.
`vfx` = `{alive(), clear(), emit}` — `emit` is the full façade (`muzzle/tracer/splash/hit/fire/smoke`).
`sim` = the module plus `game/view/place/fire/ai/newGame/autoplay/events/setBoard`; everything
throws `NotImplemented` until C5 lands. The hook **delegates** to the sim module rather than
reimplementing, so C5 landing the real functions needs no edit to frozen `main.js`.

**Extending it:** assign new properties from your own module —
`window.__waterline.fleet = fleet`. Do not restructure what exists.

`app.loading(promise)` holds `ready` open. Anything the first frame must not be missing goes
through it, or the harness screenshots a half-built scene. A scenario's `setup(app)` may return a
promise and `main.js` routes it through `loading()` for you.

## Quality — presets and knobs

`potato · low · medium · high · ultra`, values from BUILD_PLAN §6. Default is picked off the user
agent as FORGE does: mobile or `innerWidth < 820` → `medium`, else `high`. **Only Wave C retunes
this table.**

Preset fields no knob claims are still readable, and are meant to be — they are the budgets you
size against: `oceanSegs`, `oceanRings`, `bridgeLights`, `vfxCap`, `smokeCards`, `texCap`, `aniso`,
`shadowMap`, `shadowDist`, `dprCap`.

Tunable *constants* (as opposed to quality tiers) go in `js/config.js`, which is **namespaced by
component** — `BOARD MODES ORDNANCE LADDER AI SHIP TABLE FLEET LOOK UI PACE CINE VFX SEA_STATES`.
Write inside your own export; do not add a new top-level name without asking. `UI` is deliberately
empty for C7 to fill.

```js
const segs = app.quality.get('oceanSegs');

quality.register(
  { key: 'seaChop', label: 'Sea chop', type: 'range', min: 0, max: 2, step: 0.05,
    default: 1, group: 'Ocean' },
  v => { water.chop = v; },
);
```

`apply` runs at registration, on every `set()`, and once per knob on `usePreset()`. Types:
`range | toggle | select | color`. Register from **your own module** — never by editing
`quality.js`. Every registered key is also a URL param: `?seaChop=1.4` just works.

A system handed to `app.add()` may have `object3D`, `update(dt, app)`, `registerKnobs(quality, app)`
— all optional. `app.renderPath` is the post-chain hook; `engine/post.js` and `engine/aa.js` already
use it and coordinate through `app.aa.apply()`.

**Every texture goes through `budget.track()`** or the memory readout lies:

```js
track(tex, { w: 1024, h: 1024, fmt: 'rgba', mips: true, label: 'sea normal' });
```

Verified ladder behaviour (`--eval` on the boot shot): potato 0 shadow calls & pixel ratio 0.6 ·
low `BasicShadowMap` + 2 shadow calls · medium/high `PCFShadowMap` · ultra `PCFSoftShadowMap` +
pixel ratio 1.25 · `vfxCap` 60→700 with a live CardField rebuild.

## Materials

```js
getMaterial(kit, surface)   // kit: 'hull' | 'bridge' | 'table'
```

Surfaces are listed in `materials/index.js` as `SURFACES`. An unknown kit or surface **throws** —
that is deliberate, a typo must not silently return grey forever. Fill in your own
`materials/<kit>.js`: return a material for the surfaces you have done and `null` for the rest, and
the dispatch falls back to an obviously-unfinished grey.

## VFX

```js
vfx.muzzle(anchor, size)          vfx.splash(pos, size)      vfx.smoke(pos, drift, size)
vfx.tracer(from, to, ms, size)    vfx.hit(pos, size)         vfx.fire(host, localPos, seconds)
vfx.update(dt)   vfx.clear()   vfx.alive()
```

`size` is `1 | 4 | 9` and resolves through `config.js` `VFX` — never a literal in an emitter.
Emitter files: `gun.js` (muzzle) C3 · `impact.js` (splash, hit) C4 · `fire.js` C4 ·
**`round.js` (tracer + all drifting smoke) C6**. Smoke lives with the shell trail rather than with
the muzzle because they are the same card system and two owners would build it twice (B12).
Emitters register themselves at import: `registerEmitter('splash', (ctx, pos, size) => …)`, and
return `ctx.add({ update(dt) → boolean, kill() })`. **A beat must not allocate.** Everything comes
from `ctx.cards` (one shared InstancedMesh — the entire particle system is one draw call) and
`ctx.lights` (a 4-light pool). When a pool is full the oldest live entry is recycled, so
`vfx.alive()` can never exceed the cap.

`tracer` additionally returns `.at(t) → Vector3` and `.object3D` — that query is what the chase
camera and the match-cut screen-position assertion read, so keep it.

## Cine — the seek architecture (REVIEW.md B5, settled here)

**A sequence generator runs once, at play/seek time, to compile a timeline of absolute-time beats.
`play()` evaluates that timeline from a clock; `seek()` evaluates it from an argument. Nothing runs
the generator twice.** This was the open architectural question and it is now closed — `--at=` is
the only capture path for `window_out` and `match_cut`, so it had to be.

```js
director.registerSequence(id, function* (rig, ctx) { … yield { until: 900 }; });
director.play(id, ctx)      → Promise      director.skip()
director.seek(id, t, ctx)   → boolean      director.duration(id, ctx)
```

Three rules follow. Break one and your sequence cannot be posed, which means it cannot be scored:

1. **Every rig verb records a tween; nothing mutates the camera directly.** Even `at`/`look`/`cut`
   record as zero-length tweens — if they applied immediately, the compile pass would run all of
   them and leave the camera at the *last* pose in the sequence whatever `t` you asked for.
2. **A tween's `apply(u)` must be idempotent and side-effect-free.** Anything that *is* a side
   effect — a muzzle flash, a shake, a sound — goes through `rig.on(fn)`: edge-triggered under
   `play`, and **suppressed entirely under `seek`**. `rig.shake()` is already an `on()`.
3. **A generator must not read live world state at compile time** (the camera's current position, a
   ship's current heading). Take it from `ctx`, or use an explicit pose, or read a fixed scene
   anchor. Otherwise the same `t` poses differently on the second call and score movement stops
   meaning anything.

`rig` verbs: `at look cut dolly orbit hold shake exposure fov on`, plus `freeLook`/`nudge` which
are **declared and unimplemented** — that is where the brief's look-around beat lands (see below).

Verified: `seek` walks `open_flyover` monotonically (220→165→57→33→0 on x), seeking `0.4 → 1.0 →
0.4` returns a bit-identical pose, and `vfx.alive()` does not move across a seek.

The eight ids in `cine/sequences.js` are frozen.

## The sim contract, where it changed

`js/sim/index.js` is signatures only. Two deliberate departures from BUILD_PLAN §2.1, both from
REVIEW.md — implement these shapes, not the plan's:

- **`legal(game, side, shot)` returns `null` when legal and a reason string when not** (B7). The
  plan's `true | 'reason string'` made *every failure truthy*, so the obvious
  `if (legal(...)) fire(...)` fired on illegal shots. Read it as: `const why = legal(…); if (why)
  return why;`. This is the one shape where the wrong idiom fails loudly — nothing legal ever
  fires — instead of silently permitting the illegal case.
- **`autoplay(game, turns, opts)`, `events(game)` and `setBoard(game, side, ships)` are real sim
  exports**, not browser-only hooks (B13). `sim.mjs` needs them as much as the harness does.

Everything under `js/sim/` must stay pure — no three, no `window`, no `document`, no
`performance`, no `Math.random`, no `Date.now`. `node tools/purity.mjs` enforces it and the soak
harness runs it first.

## Cell ⇄ world: `js/world/fleet.js`

Added in W0 because nothing owned it (REVIEW.md B1) and every cinematic beat needs it. The sim
speaks `{r,c}`; `buildTable()` maps cells to the *table prop inside the bridge*, which is a
different space. `fleet.js` owns the sea-side mapping and the dramatised arrangement:

```js
buildFleet(quality) → { object3D, layout(side, view), cellToWorld(side, r, c) → Vector3,
                        shipAt(side, r, c) → { ship, def, t } | null,
                        gunFor(side, shipId) → Object3D,
                        mark(side, r, c, kind) → handle, clearMarks() }
```

`shipAt(...).t` feeding `buildShip().hullPoint(t)` is what makes the brief's step 6 possible at all
— *which* of your ships was struck and *where* along it. `mark()` is the red indicator (B2); the
`hull` material kit has a `'marker'` surface waiting for it and `config.FLEET` has `markerScale` /
`markerFade`.

The arrangement is dramatised **on purpose** — the ships shown are not at the true grid positions,
which is exactly what the disclaimer caption exists for. Authoring it is a design job, not a camera
job, and it belongs to C3 in this file.

## Adding a scenario

A scenario is the unit the blind critic scores. Its `id` and its `ref` must not change between
rounds. Register it **from your own module** at import time — `main.js` owns only `boot`:

```js
defineScenario({
  id: 'bridge_table',
  label: 'Bridge over the plotting table',
  ref: '1489630_00',
  setup(app) { frameCamera(app, { pos: [0, 4.2, 6], look: [0, 3.1, 0], fov: 46 }); },
});
```

## Running the tools

```bash
node tools/shot.mjs --shot=boot --w=1280 --h=720 --dpr=1
node tools/shot.mjs --shot=boot --mobile --w=390 --h=844 --dpr=2      # → shots/boot_m.png
node tools/shot.mjs --all --preset=medium
node tools/shot.mjs --shot=bridge_table --perf --headed               # real GPU, budget gate
node tools/shot.mjs --shot=window_out --at=0,0.25,0.5,0.75,1          # posed, not raced
node tools/shot.mjs --shot=hit_explode --seed=7 --turn=30             # a specific board state
node tools/compare.mjs --shot=bridge_table --round=1
node tools/compare.mjs --shot=match_cut --sheet=motion --round=1      # 3×2 tile of the @ frames
node tools/purity.mjs && node sim.mjs 5000                            # C5's gate
```

`shots/<id>.png` + `shots/<id>.json`; `--mobile` adds an `_m` suffix so a phone run never
overwrites the desktop one. **Look at the PNG with the Read tool every time.**

The default shot is `bridge_table` per BUILD_PLAN §5 — it does not exist until C2 lands, so pass
`--shot=boot` until then.

`--mobile` sets the iPhone UA, touch emulation and `pointer: coarse`. It is the only run that
tests what a phone does.

`--at=` calls `seek(shot, t)` and writes `<shot>@<t>.png`, canonicalising whole numbers to one
decimal so `--at=1` writes `@1.0` — the key `plates.json` maps. It throws loudly if `seek` is
missing rather than silently shooting the same frame five times.

`--seed=`/`--turn=` are consumed in `main.js` and forwarded to `sim.autoplay`. They warn (visibly,
in the shot output) while the sim is stubbed.

### The plate crop table

`compare.mjs` is driven by `tools/plates.json` — **not yours to edit**; a separate agent owns it.
Plate resolution: `--ref=` → `plates.shots[shot]` → the scenario's `ref`. A plate missing from
`plates.json`, or listed under `dropped`, is a hard error.

- `both: true` — a UI trim applied to **both** images, so the crop can't itself be the tell.
- `both: false` — a reframe of a HUD-bordered plate applied to the **plate only**; the scenario
  camera must be authored to match that framing or the field of view is the tell instead.

Sheet cells are 900×506 (1.78:1) and the fit is scale-to-fill then centre-crop, so a rect whose
aspect is far from 16:9 loses the edges it was chosen to keep. `compare.mjs` now **warns** when
that will happen (it fires on `1272010_06`, which is 1.14:1). The rect is plates.json's to fix.

**Never pass `--hud` to a shot destined for `compare.mjs`** — the perf HUD in frame is exactly the
tell that voided four of FORGE's rounds.

## The perf gate

BUILD_PLAN §6, measured `--preset=medium --dpr=1 --w=844 --h=390 --mobile --headed --perf`.
`BUDGETS` in `stats.js` carries the looser sea/cine column — gpu 11 ms, cpu 6 ms, 120 calls,
300k tris, 45 MB, 50 ms worst frame. Bridge shots are tighter (120 calls / 260k tris) and are
checked in review, not by the HUD. Counts are **totals** including the shadow pass;
`mainCalls`/`mainTris` show the visible pass alone.

## Things that bit me

- **`THREE.BasicShadowMap === 0`**, so FORGE's `SHADOW_TYPE[v] || THREE.PCFShadowMap` silently
  turned every `hard` into `soft` — the cheapest shadow tier never existed. Now `??`. If you copy
  another lookup out of FORGE, check it for a legitimate zero.
- **A directional light parked outside its own shadow camera's far plane renders an empty shadow
  map, with no error.** At `--preset=low` the map drew literally nothing and the scene just had no
  shadow. `lighting.js` now derives the light's distance from the shadow extent. If your shadows
  vanish, check `shadowCalls` in `stats()` before you touch a bias.
- `shotmode` keys off the **presence** of `?shot=`, not off finding the scenario — a sequence-only
  `--at` capture named a sequence id, found no scenario, and put the HUD and the ordnance buttons
  into a sheet a critic would then have scored.
- `director.seek()` must not apply beats *after* the seek point. Applying one at `t=0` snaps the
  camera to that beat's start pose and silently undoes everything before it — the flyover posed
  identically at 0.5 and 1.0 until this was fixed.
- `defineScenario(...)` at the bottom of a module is a statement, not a hoisted declaration. It
  must run before `main.js` reads `?shot=`. Registering at import time is why component modules
  work and why `main.js` only owns `boot`.
- Headless renders are software-rendered: the **image** is trustworthy, the **timings** are not.
  The boot scene — 14 draw calls, byte-identical output — reported GPU p95 of 0.1, 1.9, 8.1 and
  12.4 ms across runs minutes apart while fps and every count stayed identical. Attribute cost
  with counts.
- `shot.mjs` kills its Chrome *and* its `/tmp/waterline-cdp-<pid>` profile dir by matching on the
  dir, because killing the spawned parent leaves the renderer and GPU children alive. Do not
  simplify it away — orphaned browsers are what corrupted FORGE's timings.
  Check `ps aux | grep waterline-cdp` if numbers look wild.
- Ports are `9131+pid%200` (static server) and `9831+pid%200` (CDP), chosen to miss FORGE's
  8731/9431 and monopole's 8931/9631.
- ffmpeg 8.1 silently placed **four** of six tiles for an `xstack` layout using `w0*2`, no error.
  The motion sheet uses hstack rows + vstack. Count the tiles in any sheet you build.
- `noise.js`'s field accessor is `.at(u, v)`, not `.sample()`, and `hexRgb` wants a **string**
  (`'#5a6470'`), not `0x5a6470`.

## REVIEW.md findings, and what W0 did about each

| # | Finding | State |
|---|---|---|
| B1 | Nothing owns cell⇄world | **fixed** — `js/world/fleet.js`, wired into `main.js` and `__waterline.world.fleet` |
| B2 | No red indicator on your struck ship | **seam built** — `fleet.mark()`, `hull:'marker'` surface, `config.FLEET.marker*`. Not designed |
| B3 | Look-around beat and `bridge_look` have no owner | **seam built** — `rig.freeLook()`/`rig.nudge()` declared unimplemented, `config.LOOK` populated. The `bridge_look` scenario is C2's to register, plate `1272010_02` |
| B4 | `both:false` crops aren't 16:9, silently centre-cropped | **made loud** — `compare.mjs` warns with the direction of the loss. The rects belong to `plates.json`'s owner |
| B5 | `seek` incompatible with a generator rig | **fixed, architecture chosen** — compiled timeline, see the Cine section. Proven deterministic |
| B7 | `legal()` returns truthy on failure | **fixed** — `null` when legal, reason string when not |
| B9 | `config.js` and `textures/*` unowned | **fixed** — both created, config namespaced per component |
| B12 | `tracer`/`smoke` have no owning file | **fixed** — `js/world/vfx/round.js`, owned by C6 |
| B13 | `?seed`/`?turn` consumed by nothing | **fixed** — wired in `main.js` before it froze, delegating to `sim.autoplay`; `setup()` may return a promise and is routed through `app.loading()` |

## Known gaps in W0

- `tools/measure.mjs` (mean frame luma for the `window_out` continuity gate) is **not built**. It
  is in REVIEW.md's fix list, not in BUILD_PLAN, and nobody asked me for it.
- **B6** (fog of war leaks through the `place` event stream) and **B10** (soak invariant holes) are
  C5's contract, not the scaffold's. `sim.mjs` implements the invariants BUILD_PLAN §4.4 lists and
  no more.
- `sim.mjs`'s invariant suite is written out in full but reports `stubs only` and exits 0 until
  `sim.implemented` flips true. It is C5's gate, not a W0 blocker.
- Shader pre-warm is not implemented; `stats.reset()` at frame 20 still hides boot cost from the
  readout rather than removing it.
- `fleet.layout()` places one model per ship on a plain grid. It is a placeholder for the
  dramatised arrangement, not a design.
