# Lane A-fx — status

Owner updates THIS file only. The manager rolls these up into BUILD_PLAN.md.
Concurrent lanes must never edit the same file, which is why this exists.

Status: **DONE** — `particles.js`, `camera.js`, `postfx.js` are written, syntax
clean, and exercised in a real WebGL2 context. `postfx.js` is **not wired in**
by anyone yet (see "Wiring" below) — that is deliberate: `renderer.js` belongs
to Lane A-render and I did not touch it.

Covers BUILD_PLAN **A3** (particles + camera) and the `postfx.js` half of **A4**.
`scenefx.js` is still TODO and is the file that will actually call all of this.

---

## 1. `js/gfx/particles.js`

`makeParticles(cap = 4000)` → `{ emit(spec), step(dt), draw(renderer),
setBudget(n), clear(), count, budget, capacity }`.
Module also exports `PRESETS` and `setSpriteResolver(fn)`.

- **Struct-of-arrays**: 21 `Float32Array` lanes + `Int32Array` sprite id +
  `Uint8Array` flags + `Uint32Array` birth ticket, all allocated once. A
  particle is an index, never an object. Death is a swap with the last live
  index, exactly like `js/core/pool.js` keeps its active set dense.
- **Zero allocation** in `emit` / `step` / `draw`. The caller's spec object is
  read into a module-level scratch (`S`) and **never retained** — the `sprite`
  field is nulled at the end of the read so not even a string reference
  survives the call.
- `step(dt)` integrates with `exp(-drag*dt)` damping (frame-rate independent),
  memoising the `exp()` per drag value — particles from one burst are
  contiguous and share a drag, so the memo hits nearly every iteration. `dt` is
  clamped to 0.1s so a tab returning from the background does not teleport the
  whole field.
- `draw(renderer)` is **two passes, never interleaved**: `layer('main')` then
  every solid particle, `layer('add')` then every glow particle. One additive
  particle in the middle of the solid pass would split the renderer's batch.
- Draw call is `renderer.sprite(id,x,y,rot,scale,r,g,b,a)` when a sprite id
  resolves, otherwise `renderer.quad(x,y,w,h,rot,r,g,b,a)`. **Stretched
  particles are always quads** — `sprite()` takes one uniform scale and the
  whip look is entirely in length-vs-thickness.
- **Adaptive budget**: `setBudget(n)` caps live particles. Over budget, `emit`
  is never refused; instead the oldest `cheap: 1` particles are retired
  (ambient embers, smoke, blood), and only if that is not enough does it start
  on the rest. Two linear passes + an age threshold from the birth ticket — a
  sort would allocate and a repeated min-search is O(need × n).

### Sprite ids — read this before wiring the atlas
`particles.js` **imports nothing**, on purpose: a static import of `atlas.js`
would couple this module's load state to a file another lane is writing, and
`main.js` treats a failed gfx import as a boot-gate failure. Presets name their
sprite as a **string key**; until a resolver is installed every particle draws
as an untextured quad (ugly, never blank). Once the atlas exists, one line
anywhere in the host:

```js
import { setSpriteResolver } from './gfx/particles.js';
import { spriteId } from './gfx/atlas.js';
setSpriteResolver(spriteId);
```

No preset currently sets a `sprite`, so this is optional polish, not a blocker.

### PRESETS

Tweakable data, not numbers buried in call sites. Call them as
`particles.emit({ preset:'cut', x, y, col: choirColour })` — any field the spec
sets overrides the preset, anything it omits falls back to the preset and then
to `DEF`.

| preset | layer | what it is |
|---|---|---|
| `hit` | add | 6 short yellow-white sparks, the default "something connected" |
| `crit` | add | 16 longer gold sparks, `cheap:0` |
| `blood` | **main** | 10 dark-red gobs with real gravity — the one thing that should read as wet matter, not light |
| `death` | main | 14 bone-white motes expanding into a puff, `cheap:0` |
| `cut` | add | **the signature.** 14 near-white whips, 330u/s, 0.19s, hard velocity-stretch, fading into the Choir colour. `cheap:0` |
| `shockwave` | add | 44-spoke ring at 430u/s for a Conductor death. `cheap:0` |
| `pickup` | add | 5 small cyan motes that drift up |
| `levelup` | add | 40-spoke gold ring, rising, `cheap:0` |
| `burn` | add | 4 orange embers for a fire aura, per tick |
| `spark` | add | 8 tiny fast white sparks (ricochet, deflect) |
| `ember` | add | 3 slow ambient embers, 1.7s — cheap by design, culled first |
| `smoke` | main | 5 dark drifting puffs that grow 4→15u |
| `chorus` | add | 60 motes pulled **inward** (negative speed) to the lattice, 1.5s, `cheap:0` |

`cheap: 0` marks the effects the budget culler must never eat: the signature
beats have to survive a frame where the screen is full of embers.

Useful spec fields beyond the obvious: `ring:1` (spokes on a circle of radius
`r`, velocity outward — `speed` may be **negative** for inward), `align:1`
(rotation tracks velocity), `stretch` (length added per unit of speed),
`col`/`col2` (start/end `[r,g,b,a]` ramp), `cheap`, `add`, `vx`/`vy` (inherit
the emitter's motion), `grav` (negative = rises).

**Measured** (SwiftShader, headless): 3200 live particles, 60 × `step` +
`draw` into a counting stub = **2.8ms total**, i.e. ~0.05ms/frame of JS. The
frame cost is the renderer's batching, not this.

---

## 2. `js/gfx/camera.js`

`makeCamera()` → `{ x, y, zoom, trauma, follow(target,dt), shake(a),
kick(x,y), punch(z), update(dt, world), setBounds(...), snap(x,y), reset() }`

Three stacked springs, all using the **implicit critically-damped** form
(unconditionally stable at any `dt`; the naive `v += (t-x)*k*dt` explodes the
first time the tab stalls). Everything is exponential-in-`dt`, so the camera is
the same camera at 45, 60 and 120fps — verified: 1s of follow at 30fps lands at
x=299.99 and at 120fps at x=300.00.

- **Follow**: soft spring at `followHz: 2.6` onto `player + velocity * lead`.
  Lead is `0.26s` of velocity, capped at 52u, weighted `leadX 1.15 / leadY
  0.85`. The visible field is 420u wide and ~900u tall in portrait, so the
  **horizontal** axis is the short one and wants the bigger lead; too much
  vertical lead drags the player's own sprite away from the thumb.
  First `update` with a player **snaps** rather than swooping in from (0,0).
- **Shake**: `shake(a)` accumulates a magnitude that decays exponentially. The
  offset target is smooth **value noise** (hashed integers, smoothstepped) —
  not a fresh random per frame, which reads as television static — and a stiff
  spring (`shakeOmega 190`) chases that target, so the camera rings rather than
  teleporting. Noise frequency falls with magnitude: **small hits buzz at 27Hz,
  big hits slam at 11Hz.** Measured peak displacement:

  | `shake(a)` | peak | as % of the 420u width |
  |---|---|---|
  | 0.25 | 1.5u | 0.4% — a buzz |
  | 0.6  | 3.5u | 0.8% |
  | 1.5  | 8.3u | 2.0% |
  | 3.0  | 15.7u | 3.7% — a slam |

  Magnitude is capped at 3.5, so `world.events`' `{t:'shake', amount}` can be
  passed straight through without a sanity clamp at the call site.
- **Kick**: `kick(x,y)` is a directional velocity impulse into a slower spring
  (`kickOmega 22`) — a punch that overshoots and settles. `kick(-1, 0.3)` peaks
  at 6.6u. Use it for `playerHurt`, with the vector pointing **away** from the
  damage source.
- **Zoom punch**: `punch(0.08)` pushes in 8% and settles in ~0.4s. Use it for
  `conductorDown` and `chorus`. `shake(a)` with `a >= 1.2` auto-punches
  proportionally, so a big event still gets the push even if nobody calls
  `punch` explicitly.
- `cam.zoom` is a **multiplier** (1.0 = neutral) — `main.js` already does
  `viewport.zoom * camera.zoom`.
- `cam.trauma` (0..1) is exported for `scenefx` to drive the postfx `chroma`
  amount with. **Do not** also feed the postfx `shake` uniform from it: the
  camera already shakes the world, and post `shake` on top would double it. The
  post `shake` uniform exists for effects the camera should not have (a boss
  screen-wobble while the camera stays locked).
- `setBounds(minX,minY,maxX,maxY)` clamps the camera **centre**; pass `null` to
  clear. The arena is unbounded so nothing needs it yet.
- All feel numbers are plain mutable properties on the returned object
  (`cam.followHz`, `cam.lead`, `cam.shakeAmp`, …) so the feel pass is edits in
  one place, not a hunt through call sites.

---

## 3. `js/gfx/postfx.js`

`makePost(gl, viewport)` → `{ begin(), end(opts), setQuality(q), resize(),
destroy(), quality, ok, hdr }`.

Pipeline: scene FBO → bright-pass **with a 4-tap box downsample** → separable
9-tap gaussian (5 linear taps) at quarter res, 2 iterations → one composite
doing chromatic aberration, bloom add, vignette, grain, desaturation and flash.

- **Quality, switchable at runtime with no reload** (adaptive quality has to be
  able to drop bloom the instant the frame clock slips):
  `2` = bloom at ¼ res, 2 blur iterations, chroma on ·
  `1` = bloom at ⅛ res, 1 iteration, **no chroma** ·
  `0` = no bloom at all, straight composite (vignette/flash/desat still apply).
  Changing `div` rebuilds the bloom targets; changing between 2 and 1 is the
  only rebuild, 2→0 is free.
- **HDR when it is available.** If `EXT_color_buffer_half_float` (or `_float`)
  is present the scene and bloom targets are `RGBA16F`, so additive glow can
  exceed 1.0 and the bright-pass has something to find; threshold 0.75. Without
  it we fall back to `RGBA8` and the threshold drops to 0.55, because in 8-bit
  everything saturates at white. Verified `hdr=true` under SwiftShader; a real
  phone will have it too.
- No vertex buffer: the fullscreen triangle comes from `gl_VertexID`, so post
  has **no attribute state** that can collide with the renderer's.
- `end()` leaves `BLEND`, `DEPTH_TEST`, `CULL_FACE` and `SCISSOR_TEST`
  **disabled**, no program bound, VAO null, TEXTURE0/1 unbound. The renderer
  must set its own blend state at the start of each frame (it should already).
- Context-loss safe: every entry point early-returns on `gl.isContextLost()`,
  and `makePost` returns a no-op object (not `null`) if the context or the
  shaders are unusable, so the caller never needs a null check.
- Auto-resizes when `gl.drawingBufferWidth/Height` changes; `resize()` forces
  it.

### The NaN guard — how I guarded it

A NaN in the bright-pass gets smeared over the whole screen by the blur and
composites to black with a perfectly healthy HUD on top. Four guards, and I
would keep all four:

1. **`max(c, 0.0)` before the `pow`.** `pow()` of a negative base is undefined
   and is NaN on most drivers. This is the classic source and the one this repo
   has been bitten by before. The bright-pass does it twice: once on the
   downsampled colour, and again on `b` immediately before `pow(b, uKnee)`.
2. **`scrub()`** — `mix(c, vec3(0.0), vec3(notEqual(c, c)))`. `x != x` is true
   only for NaN, so this replaces a NaN channel with black and leaves every
   real value untouched. It runs in the bright-pass (so a NaN never enters the
   blur) **and** in the composite (so a NaN arriving from the renderer's own
   output never reaches the screen).
3. **Firefly clamp** `min(b, vec3(6.0))` after the bright-pass. INF poisons a
   blur exactly as thoroughly as NaN, and an RGBA16F target can hold one.
4. **`clamp(col, 0.0, 1.0)`** on the final write, plus `clamp` on every UV so a
   large `uShake` cannot sample outside the texture.

Proven in a real WebGL2 context: all three shaders compile and link, a
begin/end cycle at q=2, 1, 0 and back to 2 produces **zero `gl.getError()`**,
and a pixel readback of a magenta clear gives `209,80,209` at centre and
`88,44,88` in the corner — i.e. the composite wrote real colour and the
vignette darkened the corner. A NaN-black failure would have read `0,0,0`.

---

## Wiring — the lines someone else needs to add

I did **not** touch `renderer.js`. Lane A-render (or the manager) adds this:

```js
import { makePost } from './postfx.js';                  // top of renderer.js
const post = makePost(gl, viewport);                     // after the gl context exists
// first line of begin():           post.begin();
// last line of end(), after the layer buckets are flushed:
//                                  post.end(POST);
// inside setQuality(q):            post.setQuality(q);
// inside resize():                 post.resize();
```

`POST` must be **one persistent object**, mutated in place by `scenefx`, never
a fresh literal per frame:

```js
const POST = { bloom: 1, shake: { x: 0, y: 0 }, chroma: 0, vignette: 0.65,
               flash: 0, desat: 0, time: 0 };
```

Two ordering requirements:
- `post.begin()` must come **before** the renderer clears, and `post.end()`
  **after** every layer bucket has been flushed — otherwise half the frame is
  composited and half is not.
- The HUD is drawn on the `ui` layer and therefore sits **inside** post, per
  D5. That is intended (the HUD should bloom and flash), but if it ever needs
  to sit outside, that is a renderer change, not a postfx one.

Adaptive quality: whoever owns the frame clock should call **both**
`renderer.setQuality(q)` (which forwards to `post.setQuality(q)`) and
`particles.setBudget(n)`. Suggested ladder — `q2 / 4000` → `q1 / 2200` →
`q0 / 1200`. Nothing calls `setBudget` today, so the budget sits at `cap`.

---

## Contract changes I am REQUESTING (not making)

None of these break an existing signature; they are all additive, and the code
already satisfies CONTRACTS §9.3 as written.

1. **§9.3 camera** — the contract says `update(dt)`, but `js/main.js` already
   calls `camera.update(dt, w)`. Please record the real signature as
   `update(dt, world)`: passing the world is what lets the camera follow
   without `main.js` doing the `follow()` call itself.
2. **§9.3 camera** — add `punch(z)` (zoom punch) and `trauma` (0..1, read by
   `scenefx` to drive post `chroma`) to the documented interface.
3. **§9.3 particles** — add `setBudget(n)` and the module-level export
   `setSpriteResolver(fn)` to the documented interface, and note that `PRESETS`
   is exported data.
4. **§9.3 postfx** — add `resize()` to the documented interface, and record
   that `makePost` returns a **no-op object rather than null** when WebGL2 or
   the shaders are unusable, so callers need no null check.

## Open / next

- `scenefx.js` (A4) is the consumer for all of this and is still TODO. The
  event→preset mapping I would write: `hit`→`hit` (or `crit` when
  `e.crit`), `kill`→`blood` + `death`, `cut`→`cut` (pass `col: e.colour`,
  `dir` along the string tangent if it is available) + `camera.shake(0.35)`,
  `conductorDown`→`shockwave` + `camera.shake(2.2)` + `camera.punch(0.08)` +
  `POST.flash = 0.45`, `chorus`→`chorus` + `POST.desat` ramp + whiteout,
  `levelup`→`levelup`, `pickup`→`pickup`, `playerHurt`→`camera.kick(away)` +
  `POST.chroma` spike, `shake`→`camera.shake(e.amount)` straight through.
- No preset uses a sprite yet. Once `atlas.js` bakes a soft round dot and a
  4-frame smoke puff, `smoke`/`ember`/`death` should switch to it — quads are
  correct for whips and sparks and should stay quads.

## Log

- **2026-09-14** — `particles.js`, `camera.js`, `postfx.js` written. Shaders
  compiled and a full begin/end cycle run in real WebGL2 through
  `tools/cdp.mjs` (scratchpad harness, nothing added to the repo): zero GL
  errors at every quality level, pixel readback confirms a lit, vignetted
  composite. `node --check` clean on all three. `node tools/boot.mjs
  --allow-placeholder`: boots, soaks 600 frames, **no console errors**, and
  neither `camera.js` nor `particles.js` appears in `__ns.missing`. The two
  remaining gate FAILs (`every module loaded`, `canvas is lit`) are
  `renderer.js` / `scenefx.js` / `hud.js` / `screens.js`, i.e. other lanes.
- Shake and kick amplitudes were **measured and retuned**, not guessed: the
  first pass peaked at 5.7u for `shake(3)` (1.4% of screen width — invisible)
  because a 62 rad/s spring low-passes a 27Hz noise target into nothing.
  `shakeOmega` 62→190 and `shakeAmp` 7→13 put the ladder where the table above
  shows it.
