# SUNDERFALL — handoff log

Append-only. Newest at the bottom. **Every agent writes a section before it stops** — agents are not
resumable, so this file is the only thing that survives. Read `ARCHITECTURE.md` first; it is the
contract and it is read-only.

Format for each section:

```
## <agent id> — <what you owned>   (date)
**Built:** ...
**Public API:** the exact signatures another agent must call
**Stubbed / not done:** be honest, this is the most useful part of the file
**Gotchas:** every trap you fell into
**Next:** what you would do with another hour
**REQUEST:** anything you needed from another module and could not get
```

---

## orchestrator — setup (2026-08-09)

**Built:** `ARCHITECTURE.md` (frozen contract), `art/tools/flux.py` (local image generation against
the mflux-queue on `127.0.0.1:7867`).

**Art direction decision:** the game is **painterly, not pixel art**. A test generation proved the
local Flux queue produces genuinely AAA-grade painted parallax backdrops at 1024×576 in ~36s. So:
backdrops are Flux-generated (original, ours, commercially clear), while characters, props and all
FX are drawn procedurally in code so they can be lit dynamically by whatever spell is going off.
This sidesteps competing with master pixel artists and puts the fight on ground where code wins.

**Naming:** boy = **Rook**, golden-child brother = **Cass**, dying wizard = **Elderman Vayne**,
village = **Thornmere**, forest = **the Sunderwood**, the threat = **the Darkness / the Sunder**.

**Gotchas:**
- `flux.py` blocks until the job finishes; the queue serialises jobs itself, so just submit and
  poll. Never invent your own lock. Flux and LTX cannot both be resident in 24 GB.
- Headless Chrome clamps the viewport to a 500px minimum width. To screenshot true 390px portrait,
  render the page inside a 390px-wide `<iframe>`.
- No ImageMagick and no PIL on this machine. `sips` and `ffmpeg` are available. Node is available.

**Next:** wave 1 agents — engine core, art pipeline, intro cinematic.

---

## A1-engine — core/ + gfx/ + shell (2026-08-09)

**Built:** the whole WebGL2 engine and the game shell.

```
game/index.html  game/css/game.css  game/engine-test.html
game/js/main.js
game/js/core/  loop.js input.js viewport.js rng.js math.js events.js
game/js/gfx/   renderer.js texture.js particles.js postfx.js lights.js
game/js/gfx/shaders/  gl.js sprite.js light.js post.js
```

Measured in headless Chrome (SwiftShader, i.e. *software* rasterisation, so a real GPU is far
faster): **60 fps at 11,430 sprites + 9,980 live particles + 49 lights in 15 draw calls.** Budget is
120 draw calls; a normal frame is 9–15. Verified at 1440×900 landscape and true 390×844 portrait.

### Pipeline, so you know why colours behave the way they do

1. `R.light()` calls accumulate into a **half-res additive light buffer**, which is then blurred
   twice. Softness is the whole trick — an unblurred falloff quad reads as a decal.
2. Sprites are drawn back-to-front by layer into an **RGBA16F HDR target**. Each fragment samples
   the light buffer at its own screen position and applies **that layer's** light response.
3. Post: bright-pass → 3-mip blurred bloom → optional god rays → composite (shockwave warp,
   chromatic aberration, exposure, teal/warm grade, ACES tonemap, contrast, saturation, vignette,
   flash, film grain) → approximate gamma encode.

**Everything is squared into pseudo-linear space at sample time and square-rooted at the end.**
Sprite tints, vertex colours, ambient, haze and light colours are all `c*c` internally. Consequences
you must plan for:

- A light colour of `(1, 0.5, 0.2)` becomes `(1, 0.25, 0.04)` in linear — brutally saturated.
  **Pick desaturated light colours.** `(1, 0.68, 0.38)` is a good warm fire.
- Albedo `0.5` is perceptually mid-grey, not linear mid-grey. Author tints the way they look.

### Public API — exact signatures

#### `gfx/renderer.js`

```js
import { createRenderer, LAYER, LAYER_COUNT, LAYER_NAMES } from './gfx/renderer.js';
const R = await createRenderer(canvasEl, { lightScale = 2, preserveDrawingBuffer = false });

LAYER.SKY BG_FAR BG_MID BG_NEAR TERRAIN_BACK ACTORS_BACK
     TERRAIN ACTORS FX TERRAIN_FRONT FG_OCCLUDE UI_WORLD      // 0..11

R.resize(cssW, cssH, dpr, worldW?)      // 4th arg optional; or R.setWorldWidth(w)
R.begin(cam)                            // cam = {x, y, zoom}; resets all batches
R.end()                                 // lights -> scene -> post -> present
R.tick(dtRealSeconds)                   // advance fx timers; call once per rendered frame
                                        // (begin() auto-ticks with its own clock if you don't)

R.sprite({ tex, sx, sy, sw, sh, x, y, w, h, rot=0, r=1,g=1,b=1,a=1,
           layer=LAYER.ACTORS, add=false, parallax=<layer default>, flipX, flipY })
R.spriteRaw(tex, u0,v0,u1,v1, x,y,w,h, rot, r,g,b,a, layer, add, parallax)   // zero-alloc fast path
R.quad({ x, y, w, h, rot, r,g,b,a, layer, add, parallax })
R.line(x1, y1, x2, y2, thickness, {r,g,b,a}, layer, { add, parallax, tex })
R.rect(x, y, w, h, thickness, {r,g,b,a}, layer)                              // outline
R.poly(points, {r,g,b,a}, layer, { add, parallax })   // CONVEX only; flat [x,y,..] or [{x,y},..]
R.tri(x1,y1,c1, x2,y2,c2, x3,y3,c3, layer, { add, parallax })  // c = [r,g,b,a]; gradients
R.backdrop(band, { tex, x, r,g,b,a })  // tiling parallax band from the art manifest
R.light({ x, y, radius, r,g,b, intensity=1, flicker=0, squash=1, angle=0, parallax=1, soft=0 })
R.lightRaw(x, y, radius, r, g, b, intensity, flicker)

R.setAmbient(r,g,b)      R.getAmbient()
R.setHaze(r,g,b)         // atmospheric colour distant layers mix toward
R.setClearColor(r,g,b)
R.setLayer(layer, { shade, response, haze, mul, parallax })
R.getLayer(layer)        R.setLayerParallax(layer, p)
R.createTexture(source, opts)
R.screenOf(worldX, worldY) -> {x,y}   // 0..1 screen uv, SHARED object, copy if you keep it

R.white R.blob R.disc R.streak        // built-in texture handles
R.fx  R.lights  R.gl  R.canvas  R.hasFloat  R.worldW  R.scale  R.cam  R.pixelW  R.pixelH
R.stats = { drawCalls, sprites, tris, lights, streams, frame }
```

Per-layer defaults (`shade` = how much lighting applies at all, `response` = light gain,
`haze` = mix toward the haze colour, `mul` = flat multiply):

| layer | shade | response | haze | mul |
|---|---|---|---|---|
| SKY | 0.30 | 0.10 | 0.55 | 1 |
| BG_FAR | 0.62 | 0.26 | 0.42 | 1 |
| BG_MID | 0.80 | 0.48 | 0.25 | 1 |
| BG_NEAR | 0.92 | 0.72 | 0.12 | 1 |
| TERRAIN_BACK | 1.00 | 0.88 | 0.05 | 1 |
| ACTORS_BACK | 1.00 | 0.95 | 0.03 | 1 |
| TERRAIN | 1.00 | 1.00 | 0 | 1 |
| ACTORS | 1.00 | 1.10 | 0 | 1 |
| FX | 0.18 | 1.00 | 0 | 1 |
| TERRAIN_FRONT | 1.00 | 0.85 | 0 | 1 |
| FG_OCCLUDE | 1.00 | 0.22 | 0 | 0.55,0.58,0.68 |
| UI_WORLD | 0 | 0 | 0 | 1 |

#### `R.fx` (from `gfx/postfx.js`)

```js
R.fx.shake(strength, seconds = 0.4)      // trauma accumulates, decays, offset = trauma² * fbm noise
R.fx.shockwave(x, y, strength = 1, { life = 0.55, speed = 1500 })   // world space, 4 concurrent
R.fx.flash(r, g, b, a, seconds = 0.15)
R.fx.chroma(amount, seconds = 0.25)
R.fx.timeScale(scale, seconds = 0.06)    // hitstop; recovers on REAL time, eases out
R.fx.getTimeScale()                      // feed this to createLoop
R.fx.vignette(amount)                    // sticky
R.fx.setRays(worldX, worldY, strength, decay = 0.94, density = 1)   // 0 strength = off
R.fx.setGrade([shadowR,G,B], [highR,G,B])
R.fx.reset()
R.fx.trauma        R.fx.shakeX  R.fx.shakeY     // read-only-ish
// sticky tunables, set per scene:
R.fx.bloom = 0.62    R.fx.threshold = 0.85   R.fx.knee = 0.30
R.fx.exposure = 1.0  R.fx.saturation = 1.06  R.fx.contrast = 1.14
R.fx.grain = 0.024   R.fx.vignetteAmt        R.fx.maxShake = 26   R.fx.shakeFreq = 22
```

Camera shake is folded into the camera in `R.begin`, **not** applied as a UV offset, so parallax
stays consistent while shaking.

#### `gfx/particles.js`

```js
const P = createParticles(R, capacity = 20000);
P.emit({
  x, y, count = 1,
  vx, vy,                  // base direction; if both 0 the cone is a full circle
  speed, speedVar,         // if `speed` is given it overrides |(vx,vy)| as the magnitude
  vSpread,                 // cone half-angle in radians (default PI when undirected, else 0)
  life = 0.7, lifeVar,
  size = 8, sizeVar, sizeEnd = size,
  color = [1,1,1,1], color2 = [r,g,b,0],   // lerped over life
  gravity = 0, drag = 0,   // drag is v /= (1 + drag*dt)
  add = false, layer = LAYER.FX, tex = R.blob,
  collide = false, bounce = 0.35, killOnHit = false,
  glow = 0,                // >0 emits light, budgeted
  rot, rotVar, spin, spinVar, jitter,
  alignVel, stretch,       // stretch implies alignVel: sparks stretch along velocity
  fadeIn = 0,              // fraction of life spent fading in; stops hard pops
});
P.update(dt);       // call in the fixed step
P.render();         // call inside R.begin/R.end
P.clear();
P.setTerrainQuery(fn)      // fn(x, y) -> true if solid. REQUIRED before collide:true does anything
P.count  P.capacity  P.glowBudget = 40  P.glowGain = 1
```

Flat SoA typed arrays, swap-remove on death, **zero allocation per frame**. `glow` particles emit
real lights but only `glowBudget` of them per frame, sampled evenly across the live set, so 10k
glowing embers cost 40 lights not 10,000.

#### `gfx/texture.js`

```js
createTexture(gl, source, { smooth=true, repeat=false, mips=false, premultiply=false, flipY=false, name, width, height })
updateTexture(handle, source)   destroyTexture(handle)
makeWhite(gl)  makeBlob(gl, size=64, power=2.1)  makeDisc(gl, size=64)  makeStreak(gl, w=32, h=96)
loadImage(url) -> Promise<Image>

const assets = createAssets(gl, baseUrl = '');
await assets.loadManifest('assets/atlas.json', onProgress)  // the art pipeline's manifest
assets.bands(sceneId) -> [band, ...]        // band.tex is attached; feed straight to R.backdrop
assets.scenes() -> ['thornmere','sunderwood','glyphglade','ruinreach']
assets.frame(atlasId, frameName) | assets.frame(name) | assets.f(name)
        -> { tex, sx, sy, sw, sh, ax, ay }  // spread into R.sprite; ax/ay are the art anchor
assets.frameNames(atlasId)
assets.loadTexture(id,url,opts) loadJSON(id,url) loadAtlas(id,png,json) loadAll(list,onProgress)
assets.get(id) getJSON(id) getAtlas(id) has(id) add(id,handle) fromCanvas(id,w,h,drawFn,opts)
assets.failed  // ids that 404'd — loading NEVER throws, it degrades
```

A texture handle is `{ tex, w, h, id, name, gl }`. Pass the handle itself as `tex`.

#### `core/viewport.js`

```js
const view = createViewport(canvas, bus, { maxDpr = 2 });
view.mode        // 'landscape' | 'portrait'   (portrait when h > w * 1.05)
view.w view.h    // css px          view.pw view.ph   // framebuffer px
view.dpr         // capped at 2 (or ?dpr= override)
view.worldW      // 1920 landscape / 820 portrait     view.worldH  view.scale
view.safe        // {top,right,bottom,left} real env(safe-area-inset-*)
view.toWorld(sx, sy, out?)   view.toScreen(wx, wy, out?)    // shared object unless `out` given
view.setCamera(cam)          // toWorld/toScreen need this to be the live camera object
view.onResize(fn)  view.refresh()  view.worldPerPx()
bus.emit('view:change', { mode, w, h, dpr, modeChanged, view })
```

#### `core/input.js`

```js
const input = createInput(canvas, view, bus);
input.held(action) / pressed(action) / released(action)
ACTIONS = 'left right up down jump dash cast interact pause'      // 'pause' is an addition
input.axisX  input.axisY          // analog −1..1, unified across keys / stick / gamepad
input.aim {x,y}                   // world space
input.pointerDown  input.pointerWorld {x,y}  input.pointerScreen {x,y}
input.onTap(fn) -> unsubscribe    // fn({x, y, worldX, worldY, id}); <350ms, <12px
input.consume(action)             // eat a press so two systems don't both react
input.setAction(action, bool)     // drive from code (UI buttons, cutscenes)
input.setAimOrigin(x, y)          // caster position, so right-stick aiming has an origin
input.registerZone(id, rectFn, action) -> unregister
input.clearZones()  input.zoneCount()  input.getZones()
input.update()                    // call ONCE per fixed tick before scene.update
input.lastSource                  // 'keyboard'|'pointer'|'touch'|'gamepad'
input.enabled  input.destroy()
```

`rectFn` returns `{x,y,w,h}` in **CSS pixels**, called on pointer-down only. Pass `action: 'move'`
to make the zone an analog stick — it drives `axisX/axisY` and the four direction actions.
Later-registered zones win overlaps. A pointer that hits no zone drives `cast` + `pointerWorld`.
There is **no built-in on-screen control art** — that is the UI agent's job; this is only the
hit-testing and action plumbing.

Keyboard: WASD/arrows, Space=jump, Shift=dash, E=interact, F/J=cast, Esc/P=pause.
Gamepad: A=jump B/RB=dash X/RT=cast Y=interact Start=pause, left stick + dpad move, right stick aims.

#### `core/loop.js`

```js
import { createLoop, DT } from './core/loop.js';   // DT === 1/60
const loop = createLoop({ update(dt), render(alpha, realDt), getTimeScale, maxSteps = 5, onStats });
loop.start()  loop.stop()  loop.running  loop.fps  loop.ms  loop.steps  loop.frame
```

Real delta is clamped to 0.25 s; if the step ceiling is hit the backlog is dropped rather than
spiralling. `timeScale` scales the **accumulator**, never `DT`.

#### `core/events.js` / `core/rng.js` / `core/math.js`

```js
createBus() -> { on(name,fn)->off, once, off, emit(name,payload), clear(name?) }
createRNG(seedNumberOrString) -> { seed, reseed, next, float, range(a,b), int(a,b), bool(p),
        sign, spread(a), pick, weighted(items,weights), shuffle, gauss(mean,sd), angle, fork(tag) }
hashSeed(str)
math: TAU DEG clamp clamp01 lerp invLerp mix smoothstep smootherstep damp(a,b,rate,dt)
      approach len len2 dist dist2 angleDiff lerpAngle aabbOverlap noise1(t,seed) fbm1(t,seed) hash2
```

#### `main.js` — ctx, scenes, and the modules it looks for

```js
ctx = { R, P, input, view, bus, rng, assets, audio, LAYER, DT,
        scenes, go(name, params), loop, ui, spells, story, mods,
        dom: { stage, ui, intro }, debug }
window.__sunderfall === ctx      // published before the intro runs
```

Scene object: `{ async enter(ctx, params), update(dt), render(alpha), exit() }`.
Registered: `play` (currently a demo scene inside main.js) and `gameover`.
`ctx.scenes.register(name, scene)` / `ctx.go(name, params)`.

**main.js dynamically imports these and tolerates every one of them missing.** These are the exact
paths and export names it probes — match them or main will silently fall back:

| module | paths tried (first hit wins) | export used |
|---|---|---|
| intro | `./intro/index.js`, `./intro/intro.js` | `runIntro(mountEl, {skip}) -> Promise` |
| sim | `./sim/index.js`, `./sim/world.js` | `createPlayScene(ctx) -> scene` (may be async) |
| ui | `./ui/index.js`, `./ui/hud.js` | `createUI(ctx) -> { update(dt), render(alpha) }` |
| spells | `./spells/registry.js` | `SPELLS` |
| story | `./story/script.js` | whole module |
| audio | `./core/audio.js` | `createAudio(ctx) -> audio` |

If `sim` exports `createPlayScene`, it **replaces** the demo `play` scene. Until then the demo runs.
`ctx.audio` is a silent no-op stub (`audio.stub === true`) until `core/audio.js` exists.

URL params on `game/index.html`: `?nointro`, `?scene=play`, `?debug`, `?dpr=1`, `?preserve`.

### Test harness — `game/engine-test.html`

Painterly night-forest stress scene with a live fps / draw-call / sprite / particle / light readout
and buttons for BOOM (shockwave + hitstop + trauma shake + chroma + flash), STRESS (6k extra
sprites across 5 layers), LIGHTS, BLOOM, 10K PARTICLES.

Params: `?stress ?fill ?nolights ?bare ?dpr=1 ?preserve`. `?bare` hides the procedural scenery so
you can inspect real art alone. Test hooks: `window.__t = { R, P, view, input, loop, opt, cam,
boom(x,y), set(key,val), setExtraDraw(fn(R,t)), stats() }`. `setExtraDraw` runs **inside** the
render pass, which is the only way to inject draws from a console/CDP eval.

Verified with it: hitstop 0.05→1, trauma shake decay to exactly 0, particle terrain collision,
multi-texture chunking (4 tex = +1 draw call, 12 tex = +2, 40 sprites cycling 12 textures = +5,
colour ramp continuous across the chunk boundary), input zones (button + analog stick + free
pointer + keyboard), portrait/landscape, and the art agent's real `assets/atlas.json` backdrops
rendering through `R.backdrop` with per-layer lighting and haze.

### Stubbed / not done

- **No audio.** `ctx.audio` is a no-op stub. Whoever writes `core/audio.js` should export
  `createAudio(ctx)`; main will pick it up automatically.
- **No sprite-atlas animation helper.** `assets.frame()` gives you the rect; frame sequencing/timing
  is the sim's.
- **No text rendering.** Use `assets.fromCanvas()` to bake a label into a texture, or DOM in
  `#ui-root`. I deliberately did not invent a font system.
- **`R.poly` is convex-only** (fan triangulation from vertex 0). Concave silhouettes must be built
  from `R.tri` strips — see `drawGround()` in engine-test.html for the pattern.
- **No render-to-texture for gameplay** (no mirrors/portals), no scissor/clip rects, no camera
  rotation.
- Gamepad rumble, key rebinding, and pointer-lock are absent.
- Only tested in Chrome. Safari's WebGL2 half-float path is very likely fine but unverified.

### Gotchas — read these before you file a bug against the engine

1. **Colours are squared.** See the pipeline note above. Saturated light colours go nuclear.
2. **Draw order inside one layer is fixed:** all normal-blend quads, then normal-blend tris, then
   additive quads, then additive tris. You cannot interleave a `tri` between two `sprite`s in the
   same layer — put them in different layers if the order matters.
3. **`parallax` translates only, it does not scale.** A `parallax: 0` sprite is glued to the camera;
   its world x/y then behave like screen offsets from the screen centre.
4. **A parallax band's own bottom edge will show as a ruled line** if the geometry stops inside the
   view. Extend backdrops and sky gradients well past where you think the ground is. This cost me
   two iterations; it looks exactly like a renderer bug and is not one.
5. **`input.update()` runs in the fixed step**, so during hitstop (`timeScale` 0.05) input edges are
   delayed by up to the hitstop duration. This is correct — the sim is frozen — but it will confuse
   you when testing input right after an explosion.
6. **`R.screenOf`, `view.toWorld`, `view.toScreen` return shared objects.** Copy the values if you
   keep them past the next call.
7. **`view.setCamera(cam)` must be called with the live camera object** or `toWorld` maps everything
   relative to the origin. The demo scene does this in `enter()`.
8. **More than 8 textures in one layer+blend group splits the batch.** Correct, but it costs draw
   calls — keep one atlas per band and you get one draw call per layer.
9. **`P.emit` with `collide: true` does nothing until someone calls `P.setTerrainQuery(fn)`.**
10. **Headless screenshots: `Page.captureScreenshot` HANGS on an animating WebGL canvas** under
    `--headless=new` + SwiftShader. `tools/shot.mjs` will appear to work and then never return. The
    working path is `?preserve=1` (turns on `preserveDrawingBuffer`) plus
    `canvas.toDataURL()` over `Runtime.evaluate` inside a double-rAF. Also pass **`?dpr=1`** —
    at dpr 2 the software rasteriser takes minutes per frame on this scene.
11. `R.begin()` auto-ticks the fx timers from its own clock if you did not call `R.tick(realDt)`.
    Call `R.tick` explicitly from your render callback so hitstop and shake use the loop's delta.
12. The light buffer is **half resolution and blurred**; very small bright lights bleed more than
    you would expect. That is deliberate, and it is the main reason the scene looks painted.

### Deviations from ARCHITECTURE.md (all additive, nothing removed)

- `R.resize(cssW, cssH, dpr)` takes an optional 4th `worldW`, because the renderer needs the world
  width to compute scale and the viewport owns that number. `R.setWorldWidth(w)` does the same.
- Added `R.spriteRaw`, `R.lightRaw`, `R.tri`, `R.rect`, `R.backdrop`, `R.tick`, `R.setAmbient`,
  `R.setHaze`, `R.setClearColor`, `R.setLayer`, `R.setLayerParallax`, `R.screenOf`, `R.stats`,
  and the built-in `R.white/blob/disc/streak` textures.
- `R.fx` gained `setRays`, `setGrade`, `getTimeScale`, `reset`, and the sticky tunables. §4.2 is
  implemented exactly as written on top of that.
- `P.emit` gained the optional fields listed above. Every field in §4.3 behaves as specified.
- `input` gained `axisX/axisY`, `consume`, `setAction`, `setAimOrigin`, `pointerScreen`,
  `lastSource`, `zoneCount`, `getZones`, and a `pause` action.
- `LAYER` and layer count are exactly §4.1.

### REQUEST — things I need from other modules

- **sim:** call `P.setTerrainQuery((x,y) => solid)` once terrain exists, or particle collision is
  dead code. Also call `input.setAimOrigin(player.x, player.y)` each tick so gamepad aiming works.
- **art:** `assets/atlas.json` background bands — I am interpreting `anchorY` as the band's **top**
  edge in world units, and `worldW`/`worldH` as one tile's world size. Confirm, or tell me
  otherwise in your section. Also: several bands stop above the ground line, which shows as a hard
  horizontal seam (gotcha 4). Bands that meet the terrain need to extend below it.
- **ui:** register touch controls with `input.registerZone(id, rectFn, action)` and use
  `action: 'move'` for the stick. Mount DOM in `#ui-root` (it is already `pointer-events: none`
  with safe-area padding; opt individual children back in).

### Next, with another hour

- A per-layer scissor/clip rect so the UI can mask world-space HUD elements.
- Occluders in the light buffer (draw FG silhouettes as negative light before the blur) — that
  would turn the god-ray pass into real shafts instead of a radial smear.
- A soft shadow pass: one blurred silhouette per actor projected away from the nearest light.
- Sprite-atlas animation helper on `assets`, since three modules will otherwise each write one.

---

## A2-art — all shipping art: parallax bands, terrain, destructibles, atlases (2026-08-09)

**Built:** a complete generate → key → compose → pack pipeline under `art/`, and the art it produces
under `game/assets/`. Nothing in `game/assets/` is hand-made; every byte is reproducible by re-running
the builders. **Total shipped payload: 7.67 MB** (budget 12 MB).

```
art/src/*.json      prompt + seed manifests — the source of truth for every render
   │  python3 art/tools/batch.py art/src/<x>.json art/raw     (queues on Flux :7867)
art/raw/*.png       75 raw Flux renders                                 [gitignored]
   │  node art/tools/keyall.js          matte extraction, cached per render
art/work/keyed/*    cutouts with real alpha                             [gitignored]
   │  node art/tools/build_bg.js        4 locations x 5 parallax bands
   │  node art/tools/build_props.js     intact → cracked x2 → debris → settled
   │  node art/tools/build_terrain.js   ground runs, caps, ledges, cliff faces, decals
   │  node art/tools/build_manifest.js  merge → game/assets/atlas.json
game/assets/        the shipped payload                                 [committed]
```

`art/tools/build_all.sh` runs the four builders in order (~2 min). Regenerating `art/raw/` from
scratch is ~70 min of Flux time. `node art/tools/verify.js` checks the manifest against the files
and fails on a busted frame, a missing image or a blown budget — **run it after any change**.

### `game/assets/atlas.json` — the contract, exactly

```jsonc
{
  "version": 1,

  // Sprite sheets. Every frame is trimmed. ax/ay is the pivot IN FRAME PIXELS:
  // props and terrain pivot at bottom-centre (feet), debris pivots at its centre
  // because debris spins. To draw: world x - (ax - w/2), y - (ay - h/2).
  "atlases": {
    "props":   { "image":"props.png",   "w":2048, "h":1772, "frames": {
                   "crate": {"x":2,"y":2,"w":96,"h":92,"ax":48,"ay":92}, ... } },
    "debris":  { "image":"debris.png",  "w":1024, "h":928,  "frames": { ... } },
    "terrain": { "image":"terrain.png", "w":2048, "h":2884, "frames": { ... } }
  },

  // Five bands per location, listed back to front.
  "backgrounds": {
    "sunderwood": { "bands": [
      { "id":"sunderwood_sky", "image":"bg/sunderwood_sky.jpg", "w":2048, "h":1016,
        "layer":"SKY", "tile":true, "parallax":0.05,
        "worldW":4608, "worldH":2291, "anchorY":-1290 }, ... ]}
  },

  // Destructibles, keyed by the props-atlas frame id of the intact state.
  "materials": {
    "crate": { "material":"TIMBER", "hp":40, "w":96, "h":92,
               "states":["crate","crate_crack1","crate_crack2"],  // same silhouette
               "settled":"crate_settled",       // persistent rubble; may be null
               "debris":["crate_d0", ...] }     // frames in the DEBRIS atlas, largest first
  },

  // Two-part props: break the trunk and the canopy falls on its own.
  // dy is the part anchor's offset from the composite anchor; +y is down.
  "composites": {
    "tree_oak": { "parts":[{"id":"oak_trunk","dx":0,"dy":0},
                           {"id":"tree_foliage","dx":0,"dy":-300}], "topples":"oak_trunk" }
  },

  // Ground. `run` pieces are interchangeable and abut with no step.
  "terrain": {
    "forest": { "run":["ground_forest_a","ground_forest_b"], "runW":1024, "runH":384,
                "surfaceY":24,
                "capL":"cap_forest_l", "capR":"cap_forest_r", "capW":256,
                "ledge":{"s":"ledge_forest_s","m":"ledge_forest_m","l":"ledge_forest_l"},
                "wall":"wall_forest", "wallSize":256 }
  },

  "decals": ["decal_rocks","decal_roots","decal_grass","decal_bramble","decal_mush",
             "decal_rubble","decal_bones"]
}
```

**Band semantics — A1's reading is correct, confirmed:** `anchorY` is the **top edge of one tile**
in world units (ground is `y = 0`, up is negative), and `worldW`/`worldH` are **one tile's world
size**. Draw tile *n* with its top-left at `x = n*worldW + cam.x*(1 - parallax)`, `y = anchorY`, and
repeat in x to cover the view. Every band's texture aspect equals `worldW/worldH`, so a band drawn
at those numbers is never stretched — **if you change one, change the other**.

**Every band tiles seamlessly in x. No band tiles in y.** Tiling is guaranteed by construction, not
by a cross-fade: `Band.place()` draws a second copy of anything crossing an edge at `x - W`, and the
skies are built from a source resized to `W + 200` with the overlap faded back over the start.

**Every band now runs well below the ground line** (bottoms at world `+740` to `+1000`) and the
opaque ones ramp into a solid deep-fog colour on the way down, so no band edge can ever appear on
screen. This was A1's REQUEST #2 and it is fixed for all 20 bands.

### What is in there

- **4 locations × 5 bands** — `thornmere` (village edge at dusk), `sunderwood` (forest at night),
  `glyphglade` (scorched clearing, cracked barrier of light), `ruinreach` (gothic ruins in forest).
  Bands are `sky` (opaque JPEG) / `far` / `mid` / `near` / `fg`, parallax 0.05 / 0.18 / 0.38 / 0.62 /
  1.32, mapped to `LAYER.SKY / BG_FAR / BG_MID / BG_NEAR / FG_OCCLUDE`.
- **29 destructibles** across all seven materials, each with intact + 2 cracked states + a settled
  rubble frame + **6–12 debris chunks** (249 chunks total):
  `MASONRY` arch_stone, pillar_stone, rubble_heap, wall_brick ·
  `ROCK` boulder_big, boulder_small, rocks_small, standing_stone ·
  `TIMBER` barrel, burnt_trunk, crate, deadtree, fence, log, oak_trunk, stump, tree_trunk ·
  `FOLIAGE` bush, ferns, mushrooms, tree_foliage, tree_foliage_b, tree_small ·
  `GLASS` lantern, lamppost · `METAL` brazier, gate_iron · `BONE` ribcage, skull_pile.
- **Terrain** in three kinds (`forest`, `rock`, `stone`): 2 interchangeable 1024×384 ground runs,
  L/R caps, 3 ledge sizes, a both-axis-tiling cliff-face tile, plus 7 scatter decals.
- **5 comparison renders in `refs/ours/`** (`deadcells_04`, `ori_wotw_00`, `blasphemous2_02`,
  `thelastfaith_00`, `hollowknight_01`), each a 1920×1080 full-scene composition from the shipped
  assets. `node art/tools/scene.js <location> <out.png> --scale 1 [--cam N] [--broken]` remakes them;
  `--broken` swaps props for their cracked/settled/debris states.

### Public API (the tools, for whoever extends the art)

```
python3 art/tools/flux.py <prefix> "<prompt>" --w --h --steps --seed
python3 art/tools/batch.py <jobs.json> <outdir>     # resumable: skips existing outputs
node art/tools/keyall.js [--force]                  # raw → work/keyed
node art/tools/build_all.sh                         # keyed → game/assets
node art/tools/verify.js                            # manifest ↔ disk ↔ budget
node art/tools/preview.js <location>                # bands only, 960×540
node art/tools/scene.js <location> <out> [--scale 1] [--cam N] [--broken]
node art/tools/sheet.js <out> --cell N --cols N [--bg checker|dark|light] <files...>
```

Libraries, all dependency-free (this machine has **no ImageMagick and no PIL**):
- `art/tools/img.js` — hand-rolled PNG decode/encode (incl. an indexed-PNG8 encoder with alpha and
  Floyd–Steinberg dither, and `writeSmallest` which ships whichever of truecolour/palette is
  smaller), area-average `resize`, `crop`, `composite`, `trim`, `blur`, `grade`, `mapPixels`.
  `readImage()` reads the JPEG skies by bouncing them through `ffmpeg`.
- `art/tools/key.js` — matte extraction. Four modes: `flat` (uniform backdrop; border flood fill so
  gaps between trunks stay transparent, plus colour decontamination), `invluma` (dark = solid, for
  ink silhouettes), `luma` (bright = solid, for glow art on black), `dark`.
- `art/tools/raster.js` — seeded RNG, anti-aliased polygon and stroke coverage, tileable value
  noise/fbm, jittered Voronoi, polygon roughening.
- `art/tools/compose.js` — `Band`, the tiling parallax compositor (`place/haze/mist/glow/scatter`).
- `art/tools/destruct.js` — `makeChunks` / `makeCracked`, per material.
- `art/tools/terrain.js` — `makeSeamless`, `buildSlab`.
- `art/tools/atlas.js` — shelf packer + anchors.

### How the art is actually made (so it can be extended in the same voice)

Flux will not paint a usable game asset in a scene; it *will* paint one **"isolated on a completely
flat uniform light grey background"**, and that keys perfectly. Every prop, tree, building and ruin
in the game is a separate render on flat grey, keyed, then composited by `build_bg.js` into bands.
That is why the layers are genuinely separate with real transparency between trunks rather than one
picture sliced into strips. Silhouette elements (canopies, undergrowth) are instead prompted as
**"a solid pure black ink silhouette on a pure flat white background"** and keyed with `invluma`,
which survives the glow Flux likes to paint behind foliage.

Debris is cut out of the prop's own pixels with a per-material cell layout (masonry breaks on
staggered courses, rock/bone conchoidally via Voronoi, timber into grain-aligned planks, glass into
radial shards, metal into a few bent plates, foliage into leaf clusters). Cut edges get a
"fresh break face" in the material's interior colour; the original silhouette edges do not — that
difference is what makes a chunk read as *just broken off* rather than as a sticker.

### Gotchas — every one of these cost time

- **`flux2-klein-base-9b` and `-base-4b` are gated on HuggingFace and 401 on this machine.** The
  `--guidance` advice in the brief is therefore unusable; everything shipped is
  `flux2-klein-9b-mlx-4bit` at `--steps 6`, guidance 1.0. `batch.py` logs a failure and continues.
- **Four `batch.py` processes in parallel is the right way to use the queue.** It serialises itself;
  one process at a time leaves the GPU idle between submissions. Throughput was ~48 s/render.
- **A flood fill that fills every enclosed background pocket destroys the layer.** The gaps between
  tree trunks are enclosed *and* are genuinely background. `key.js` only fills pockets smaller than
  0.008% of the image; anything bigger stays transparent.
- **Colour decontamination is not optional.** Without unmixing the grey backdrop out of the soft
  edge, every cutout wears a pale halo the moment it sits on a dark scene.
- **A faint full-width veil in an occluder band reads as a hard rectangle on screen.** Flux paints a
  moonglow behind canopy art; keyed at ~0.4 alpha it covered the whole band and looked exactly like
  a renderer bug. `fgBand` now crushes alpha below 0.28 to zero.
- **Watch out for `sheet.js` padding when judging a single image** — the contact sheet's own border
  looks like a band edge. Read the preview PNG directly when hunting for seams.
- **A self-intersecting polygon makes `polyCoverage`'s even-odd fill hollow out the middle.** The
  first timber shards came out as translucent trapezoids for exactly this reason; timber cells are
  now explicit simple quads.
- **A debris cell can straddle two disconnected parts of a prop** (two fence pickets). `makeChunks`
  keeps only the largest connected blob per cell, and rejects slivers over the material's
  `maxAspect`.
- **The break-face feather must scale with the fragment**, not be a fixed pixel count, or thin
  shards turn into solid slabs of exposed-interior colour and lose all their material texture.
- **`sips` writes the JPEG skies** (~120 KB vs ~310 KB for a dithered palette PNG of the same
  gradient, and it looks better). `ffmpeg` on this machine has a webp **decoder but no encoder**, so
  webp is not an option.
- **The renderer is pseudo-linear** (colour squared on sample) and multiplies by a tinted ambient, so
  saturated backdrop colour compounds twice. The bands ship at `saturation 0.86` for that reason. In
  `game/sim-test.html` the sunderwood set still renders very blue — that is the scene's ambient
  colour, not the art. **Tune the ambient before you touch these files**, and if you do change the
  art, change the `saturation` constant in `build_bg.js` rather than editing PNGs.
- `art/raw/` and `art/work/` are gitignored (~27 MB). The prompts and seeds in `art/src/*.json`
  regenerate `art/raw/` exactly; if you would rather not depend on the Flux box being up, commit
  `art/raw/` (12 MB) and delete that line from `art/.gitignore`.

### Stubbed / not done

- **Only one seed per prompt survived.** Everything was generated once, looked at, and kept or
  worked around. There was no cull-from-many pass. `el_burnt_far` came out weak (tiny stubs) and was
  replaced by `el_burnt_far2`; the original is still in `art/raw/` and unused.
- **No enemy, character or FX art** — per ARCHITECTURE §1 those are drawn procedurally in code.
- **Ground runs repeat every 1024 px** and there are only two variants per kind. They interchange
  freely and the decals hide it, but a third variant would help. The base texture inside a run
  repeats at 512 px, which is visible on the rock kind if you look for it.
- **No per-location terrain tint.** `forest`/`rock`/`stone` are shared across all four locations;
  glyphglade in particular wants a scorched variant of `forest`.
- **The barrier of light (`el_barrier_a`) is a static image** placed in the glyphglade mid band. The
  Seam boss will want it animated — that is an FX job, not an asset job.
- **No portrait-specific art.** Everything is authored at reference scale and the bands are wide
  enough that portrait just crops; this has not been verified at 390×844.

### Next, with another hour

1. Generate 3–4 seeds per background element and cull hard — the elements are the ceiling on how
   good the bands can get, and each one was a single roll.
2. A scorched `forest` terrain variant for glyphglade and a mossy one for ruinreach.
3. Bake a soft contact shadow *into* each prop frame (`scene.js` draws one at render time and it
   makes an enormous difference to grounding — it should be a real asset, or a renderer feature).
4. More debris size variety on the big masonry pieces; `wall_brick` and `arch_stone` should throw
   two or three chunks large enough to stand on.

### REQUEST

- **To the renderer/scene owner:** the ambient tint in the play scene is currently strong enough to
  turn the sunderwood set solid blue. The bands are authored near-neutral on purpose so lighting can
  colour them; please tune the ambient against `refs/ours/ori_wotw_00.jpg`, which is what the art is
  supposed to look like.
- **To the level author:** `terrain.<kind>.surfaceY` is the collision top measured down from the
  frame's top edge, and the frame anchor is `(0, surfaceY)` — so drawing a run at world `(x, 0)` puts
  the walkable surface exactly on `y = 0`. Runs are only 384 px deep; tile `wall_<kind>` below them
  or the ground reads as a floating shelf (`scene.js` shows the pattern).

---

## A3-intro — the opening cinematic (2026-08-09)

**Built:** a self-contained, dependency-free cinematic. `game/js/intro/**`, `game/js/story/script.js`,
`game/intro-test.html`. No three.js, no vendored anything — raw WebGL2 plus 2D canvas. Nothing is
imported from `gfx/` or `sim/` (ARCHITECTURE §8). ~76 s runtime, works landscape and portrait.

### Public API — the only thing another module needs

```js
import { runIntro } from './js/intro/index.js';
await runIntro(mountEl, {
  skip,                  // false (default) | true = don't play at all, resolve immediately
                         //                | function = called once when the player skips
  script:   SCRIPT,      // default: story/script.js — swap for a retimed/localised cut
  autoStart: true,       // false = build, then wait for controller.resume()
  debug:    false,       // true also parks the controller on window.__intro
  dprCap:   2,           // hard cap on device pixel ratio
  maxPixels: 2_300_000,  // framebuffer budget; dpr is derived from this and the CSS size
  lowSpec:  null,        // null = auto-detect; true/false to force
});
```

Resolves when the cinematic finishes **or** the player skips. On resolve it has already removed
every listener, disconnected its ResizeObserver, cancelled the rAF, closed the AudioContext, freed
its GL objects and removed its own DOM from `mountEl`. `mountEl` must be positioned (the intro
mounts an `position:absolute; inset:0` host inside it).

It also parks a controller on the host element as `hostEl.__intro`:
`{ time, stage, skip(), pause(), resume(), seek(t, coarse=1/30) }`. `seek` is deterministic — it
resets and re-steps the simulation from zero, so particle state at `t` is the state it would really
have had. That is what the screenshot tooling drives.

### `story/script.js` — the cut, as data

Three parallel tracks, all plain arrays, all authored in seconds from frame one:

- `SHOTS` — `{id, scene, t, dur}`. `scene` selects a preset: `battle | seal | village | wood |
  clearing | meld | collapse`. Each maps to `Stage._sc_<scene>(localT, dt, audio)` for camera and
  state, and to `PALETTE[scene]` for lighting/layers/grade.
- `BEATS` — `{t, dur, who, text, anchor, ax, ay}`. `who` indexes `SPEAKER`; `anchor` is `'rook'` or
  `'vayne'`; the tail always points at that character's head, `ax` only decides which side the box
  sits on.
- `CUES` — `{t, fx}`. Fired the frame time crosses `t`, dispatched by `Stage.cue(name, audio)`.

`retime(script, k)` scales the whole thing; `shift(script, fromT, delta)` opens/closes a gap at a
point. Both return new objects.

**To add a beat:** push into `BEATS`. Nothing else. **To add a stage direction:** push into `CUES`
and add a `case` in `Stage.cue()`. **To retime:** edit the numbers, or wrap in `retime()`.

### Structure

| file | what |
|---|---|
| `intro/index.js` | `runIntro`, DOM/lifecycle, fixed-60Hz loop, cue+beat dispatch, skip, loader |
| `intro/stage.js` | art generation, camera, the seven scene presets, `cue()`, the frame pipeline, `PALETTE`, `RECT` |
| `intro/passes.js` | every GLSL pass: sky, parallax layer, mist, seam, ward, darkness, bright/down/up (bloom), god rays, composite |
| `intro/art.js` | procedural painting: trees, ground, canopy, Thornmere, scorched clearing, glyph, title lettering, point sampling |
| `intro/chars.js` | Rook and Vayne — skeletons, verlet cloth, the vein tree |
| `intro/particles.js` | pooled SoA particle system, one instanced draw call per system |
| `intro/bubbles.js` | speech bubbles on the 2D overlay |
| `intro/audio.js` | procedural WebAudio score |
| `intro/gl.js`, `intro/util.js` | WebGL2 helpers; rng/noise/easing |

### How the picture is made

Layers are painted **once at boot** into 2D canvases as *value + coverage only* (rgb = a grey
albedo, a = silhouette). All colour, rim light, fog and aerial perspective happen in the layer
shader, so the same eight sheets are lit as a night battle, a dusk village and a white detonation
without regenerating anything. Sheets are 4:1 (2560×640 desktop, 1536×384 low-spec) and mapped to
world rects in `RECT`; the canvases are zeroed after upload.

Per frame: sky at ⅓ resolution → upscale → darkness → seam → parallax layers (+ mist bands) → burnt
glyph → ward dome → characters → particles → title → foreground occluders → bloom (6-mip
down/up) → god rays (2× radial blur) → composite (shockwave displacement, chromatic aberration,
ACES, grade, vignette, grain, fade). ~25–35 draw calls.

Characters are redrawn every frame into a 768² canvas whose world rect tightens around whoever is on
screen, then uploaded as a texture — so a close-up stays sharp while a wide shot costs the same.
A second additive canvas carries the lifestone, the veins and the staff shard.

### Stubbed / not done — read this part

- **Audio is written but barely verified.** It is synthesised (drone beds, slams, cracks, a
  detonation with a bell, the meld knock, ember crackle) and it is armed on the first gesture, but
  headless Chrome runs `--mute-audio`, so **nobody has listened to it**. Assume mixing is wrong.
- **The `battle` cold open is the weakest shot.** It reads (dome, wizard, tear in the sky, embers)
  but the far treeline is a flat warm curtain and the beat-to-beat choreography of the fight is
  thin — the Darkness slams are shockwaves and flashes, not a legible attack. If you have an hour,
  spend it here: it is the scroll-stopper and it is only about 6/10.
- **`darkness.enter` (t≈74) is barely art-directed.** The shader works; the shot does not linger on
  it and the two eyes are small. The hard cut to black at 75.6 covers for it.
- `Stage.dbg` is a live per-pass kill-switch object (`stage.dbg.bloom = 0` etc.). It is debug
  scaffolding — harmless, ~12 branches per frame — but delete it if you want the file clean.
- No reduced-motion path. `prefers-reduced-motion` should probably skip straight to the game.
- Rook's walk cycle is procedural and stiff; he reads at silhouette size, which is all the intro
  needs, but he is not shippable as the in-game player sprite.

### Gotchas — every one of these cost real time

1. **`vUv.y` from the fullscreen-triangle vertex shader is BOTTOM-UP.** Every screen-space shader
   (sky, seam, darkness) flips it explicitly at the top of `main`. The composite deliberately does
   *not* flip, because it samples the scene texture, which is also bottom-up. Anything you feed to
   `godrays()` or to the shockwave list must be flipped (`1 - v`) — `Stage.render` and `Stage.wave`
   both do. Getting this wrong renders the sky upside down and hides the seam behind the treeline,
   which is exactly what happened for several hours.
2. **The god-ray radial blur must reject samples outside [0,1].** With `CLAMP_TO_EDGE` an
   overshooting march smears the border pixels into a solid rectangle across the frame. The fix is
   the `step()` guard in `RAY_FS`; the second sweep's density is also capped at 1.0.
3. **Rim light from `a - a_offsetTowardLight` is wrong for thin shapes.** A tree trunk is all edge,
   so the whole trunk lights up and solid interiors go black — the inverse of what you want. The
   layer shader now builds a normal from the *gradient* of coverage and multiplies by gradient
   magnitude, so interiors stay dark however soft the brushwork is.
4. **Bloom will eat the frame if any emissive is wildly over-bright.** The bright-pass clamps to 5.0
   for this reason. A single lollipop staff glow at intensity 2.6 was turning the whole picture into
   warm porridge.
5. **A wide additive falloff in a fullscreen shader is a fullscreen wash.** The seam's original
   outer glow term (`exp(-|dy|/(w*14)) * uGlow`) added ~0.6 red to every pixel. If a screen-space
   effect looks like "the scene is tinted", check its widest falloff term first.
6. **Headless Chrome runs SwiftShader.** Two consequences: (a) the sky/mist/darkness shaders use
   `fbm3` (3 octaves) rather than `fbm`, and the sky renders at ⅓ res, or a frame takes seconds;
   (b) the live rAF loop advances the story clock in slow motion there, because `acc` is clamped —
   that is a headless artefact, not a bug, but it means you cannot judge pacing from a live headless
   capture. Use `?paused` + `sfSeek()`.
7. **The harness loader fades over 500 ms.** Screenshot tooling that fires immediately after
   `__introReady` catches a glowing ember and a progress bar dead centre, which looks exactly like a
   render artefact. Wait ~900 ms. (I chased that dot for two rounds.)
8. `paintTitle` auto-fits the string to the canvas. It used to use a guessed point size and sliced
   the last L off `SUNDERFALL`.
9. Title particle targets are normalised to the **ink's** bounding box, not the canvas, or the word
   maps to a fraction of the intended rect and comes out tiny.
10. Portrait is not a letterboxed landscape: `viewH = cam.h * 1.25` in portrait, so both orientations
    show the same world *height* and characters stay the same relative size. Composition rule that
    follows: keep everything that matters within about the central 45 % of the world width.

### Testing

- `game/intro-test.html?paused&dpr=1&low=1` — builds, then waits. `window.sfSeek(t)` scrubs
  deterministically and `window.__introReady` resolves to the controller. `?ui` shows a scrub bar,
  `?t=12` seeks on load, `?dpr=`/`?low=` force the pixel budget and the low-spec asset path.
- `tools/shot.mjs` reloads per capture (slow). A seek-and-shoot driver that loads once and scrubs is
  much faster to iterate with — worth committing next to `shot.mjs` if someone rebuilds it.
- Verified by eye at 1200×750, 1440×900 and a true 390×844 portrait across the whole runtime.

### Next, with another hour

1. Re-choreograph the cold open (see above) — it is the single highest-value fix.
2. Listen to the audio and remix it.
3. The far treeline wants a second, darker sheet so `battle` and `clearing` do not share the same
   warm curtain.
4. `prefers-reduced-motion` → resolve immediately.

**REQUEST:** none blocking. When `core/viewport.js` lands, `Stage.resize` should take `view.safe`
so the skip button and bubbles respect notch insets — right now the button uses `env(safe-area-inset-*)`
in CSS and the bubbles just use a flat margin.

---

## C1-audio — `core/audio.js` + `core/audio/` + `game/audio-test.html` (2026-08-09)

**Built:** the entire sound of the game, procedurally. **Zero audio files. Zero network requests.**
231 distinct sounds, four generative ambience beds, an adaptive six-state score, a spatialised
voice pool with priority stealing, a ducking mixer with a limiter, and an offline verification
harness that measures every sound and fails the build on a silent, clipped or indistinguishable one.

```
game/js/core/audio.js              createAudio(ctx) — the only thing other modules touch
game/js/core/audio/dsp.js          pure-JS DSP kit + analysis (no AudioContext anywhere in it)
game/js/core/audio/bank.js         recipe registry, lazy bake, two-tier LRU cache
game/js/core/audio/keys.js         key resolution + the fallback chain
game/js/core/audio/mix.js          buses, procedural convolution rooms, ducking, limiter
game/js/core/audio/voices.js       voice pool, priority stealing, rate limits, panning, hitstop
game/js/core/audio/ambience.js     generative location beds + amb.* one-shots
game/js/core/audio/music.js        the adaptive score
game/js/core/audio/sfx-materials.js  9 materials x 4 events + generic world impacts
game/js/core/audio/sfx-creatures.js  9 enemies x 5 events (voice-profile driven) + Rook
game/js/core/audio/sfx-spells.js     18 spells x 3-4 events + 7 school generics
game/js/core/audio/sfx-ui.js         UI + rewards, tuned to the score's key (D minor)
game/audio-test.html               the bench: play everything, stress it, verify it
```

`main.js` picks it up automatically (`createAudio` from `./core/audio.js`). Verified booting inside
the real `game/index.html`: `audio.stub === false`, 231 keys, 60 fps held, bus hooks firing.

---

### The one-paragraph model

Every one-shot is **baked to a mono Float32 buffer by hand-written DSP** and played through a fixed
pool of voices. Nothing is synthesised live except music and ambience, which have to be live because
they must respond continuously. That choice buys two things: a voice costs **one**
`AudioBufferSourceNode` instead of a six-node graph (so a collapsing building is affordable), and
the bake is pure JS, which means **every sound can be rendered and measured offline** with no audio
device. Live node graphs cannot be inspected; arrays can. That is the whole reason the verification
below exists and works headless.

---

### Public API — exact signatures

```js
const audio = await createAudio(ctx);      // never throws, never blocks
audio.stub === false                       // main.js's no-op stub sets this true
audio.ready                                // context is running (false until a user gesture)
audio.available                            // false only if the browser has no WebAudio at all
audio.state                                // 'none'|'suspended'|'running'|'closed'
```

**One-shots**

```js
audio.sfx(key, opts) -> voiceId            // 0 = not played (rate-limited / out of range / locked)
audio.play(key, opts)                      // alias
opts = {
  x, y,          // world position. Omit for a non-positional sound.
  volume = 1,    // multiplier on the recipe's own mix gain
  pitch = 1,     // playbackRate multiplier
  variation = 1, // 0 disables the random pitch/variant spread
  pan,           // -1..1, used only when x/y are absent
  prio,          // override the recipe priority (0..9)
  delay = 0,     // seconds
  send,          // override reverb send 0..1
  force = false, // bypass the rate limit and the distance cull. Use sparingly.
  mat,           // MATERIAL index — only meaningful with key 'player.step'
}

audio.mat(MATERIAL, 'crack'|'break'|'debris'|'burn', opts)   // material shorthand
audio.step(entity, opts)                    // reads e.groundMat, e.x, e.y. Also takes a MATERIAL int.
audio.loop(key, opts) -> handle             // sustained: fire, acid, a channelled spell
   handle.volume(v) .pitch(p) .move(x, y) .stop(fade = 0.25) .alive
audio.stop(voiceId, fade)   audio.stopKey(key, fade)   audio.stopAll(fade)
```

**Music**

```js
audio.music(name, {immediate})   // 'menu'|'explore'|'tension'|'combat'|'boss'|'victory'|null
audio.stopMusic(fade = 2)
audio.setIntensity(v, immediate) // 0..1 combat heat — see the state machine note below
audio.combat(bool)               // setIntensity(1|0)
audio.setBossPhase(v)            // 0..1 — the Seam growing: adds the choir, pushes the tempo
audio.musicState                 // current state name
audio.musicStates()              // the list
```

**Ambience**

```js
audio.ambience(id, fade = 2.5)   // 'thornmere'|'sunderwood'|'ruinreach'|'glyphglade'|null
audio.setWind(mul, fade)         // 0..3 — Galewrench, a storm, the boss tearing the arena
audio.setRoom(name, fade)        // 'village'|'forest'|'glade'|'ruins'|'none'; ambience() sets it
audio.ambienceId                 // current
audio.ambiences()                // the list
```

**Mix — this is what the settings panel wants**

```js
audio.volumeNames()              // ['master','sfx','music','ambience','ui']
audio.setVolume(name, 0..1)      // setVolume(0.5) with one arg means master
audio.getVolume(name)            // audio.volumes returns a plain snapshot object
audio.setMuted(bool)  audio.toggleMute()  audio.muted
audio.duck(amount = 0.5, seconds = 0.45)     // pull music+ambience down under a big hit
audio.hitstop(scale = 0.1, seconds = 0.08)   // optional; it is polled automatically, see below
audio.setListener(x, y, halfWidth)           // turns OFF camera following
audio.followCamera(true)                     // turn it back on (default)
```

Defaults: `master 0.85, sfx 1.0, music 0.6, ambience 0.55, ui 0.8`, persisted to
`localStorage['sunderfall.audio']` as `{master, sfx, music, ambience, ui, muted}`. Volume changes
before the context starts are still stored and applied on unlock, so a settings panel works on the
title screen.

**Lifecycle**

```js
await audio.resume()   // -> bool. Call from a click handler. `unlock` is an alias.
audio.suspend()
audio.update(dt)       // OPTIONAL. An internal 40 Hz scheduler does the real work.
audio.preload([keys])  // bake these during idle so their first play has no bake cost
audio.dispose()
```

**Introspection / testing**

```js
audio.keys()          audio.has(key)      audio.resolve(key)     audio.recipe(key)
audio.missingKeys()   // every key that fell back — check this after a play session
audio.render(key, v)  // -> {data: Float32Array, sr, rawPeak}   works with NO AudioContext
audio.analyse(key, v) // -> {dur, peak, rms, dbPeak, dbRms, centroid, rolloff85, hiRatio,
                      //     zcr, clipped, attackMs, silent, mixPeak, gain, prio, bus}
audio.stats           // {state, started, voices, cap, keys, cached, bytes, genMs, genCount,
                      //  cpuMs, peak, music, bpm, ambience, room, missing}
audio._internals      // {actx, mix, voices, amb, music, bank, keys} — harness only, not a contract
```

---

### Key convention

```
<material>_<event>        stone_break, glass_tinkle, wood_burn   (flat — sim/materials.js owns these)
spell.<id>.<event>        cast | travel | impact | loop
spell.@<school>.<event>   the school generic — the fallback target, callable directly
enemy.<id>.<event>        spawn | tell | attack | hit | death
player.<event>            step[.<surface>] | jump | land[.hard] | dash | hurt | death | cast |
                          heal | focus_low
ui.<event>                click hover select confirm back deny error tick xp pickup pickup_shard
                          pickup_focus circle_ready levelup spell_learn spell_levelup pause
                          unpause menu_open menu_close gameover
impact.soft|hard|heavy    explosion.small|big   collapse.start|land   whoosh.small|big
fire.loop acid.loop slime.loop wind.gust
amb.<event>               ambience's own one-shots (the ambience module fires these itself)
```

**Every key implemented (231).** Material (30): `bone_break bone_clatter bone_crack dirt_break
dirt_crack dirt_fall flesh_burn flesh_burst flesh_hit gib glass_break glass_crack glass_tinkle
leaf_burn leaf_burst leaf_fall leaf_rustle metal_break metal_clang metal_dent rock_break rock_crack
rock_debris stone_break stone_crack stone_debris wood_break wood_burn wood_crack wood_debris`.
World (13): `acid.loop collapse.land collapse.start explosion.big explosion.small fire.loop
impact.hard impact.heavy impact.soft slime.loop whoosh.big whoosh.small wind.gust`.
Player (19): `player.cast .dash .death .focus_low .heal .hurt .jump .land .land.hard .step` plus
`player.step.{stone,rock,wood,leaf,glass,metal,bone,dirt,flesh}`.
Enemy (48): `{husk, sporeling, thornhound, gloamarcher, stonewarden, wispmaw, oozelord,
sunderwraith, theseam} x {spawn, tell, attack, hit, death}`, plus `enemy.theseam.roar`,
`enemy.theseam.tear`, `enemy.theseam.phase`.
Spell (59): all 18 ids x `{cast, travel, impact}` plus `.loop` for `cinderwake pyreveil stormcall
acidrain nullring`.
Spell generics (28): `spell.@{fire,storm,earth,decay,void,life,arcane}.{cast,travel,impact,loop}`.
UI (21) and ambient (13) as listed above.

### Fallback rules — the important bit

**An unknown key never produces silence.** `resolve()` walks, caches the result, and logs it once
(`audio.missingKeys()`). In order:

1. Exact key.
2. Alias table (`step`→`player.step`, `pickup`→`ui.pickup`, `boom`→`explosion.big`,
   `terrain.break`→`dirt_break`, `boss`→`enemy.theseam.roar`, ~40 entries — see `keys.js`).
3. Namespace rules, after lowercasing and mapping `: / \` to `.`:
   - `spell.<id>.<ev>` — event synonyms are mapped (`fire|shoot|launch`→cast, `fly|trail`→travel,
     `hit|explode|boom|burst|detonate`→impact). If the id is unknown, the **school is guessed from
     the id text** (ember/pyre/cinder→fire, spark/storm/gale/bolt→storm, stone/quake/sunder/thorn→
     earth, acid/blight/blood/rot→decay, void/mirror/null/rift→void, grave/heal/bless→life) and it
     resolves to `spell.@<school>.<ev>`. `spell.fire.cast` (school in the id slot) works too.
     Nothing matches → `spell.@arcane.<ev>`.
   - `enemy.<id>.<ev>` / `mob.` / `npc.` / `boss.` — event synonyms mapped; unknown id falls to a
     substring match against the nine, then to `enemy.husk.<ev>`.
   - `player.step.<surface>` → the surface's step, else `player.step`.
   - `mat.<material>.<event>` and the flat `timber_break` / `brick_crack` forms map through a
     material alias table to the canonical flat key.
   - `ui.*` → the named UI sound, else `ui.click`.
4. Loose word matching (`/explo|blast/`→explosion, `/collaps|topple/`→collapse.land,
   `/heavy|slam|crush/`→impact.heavy, `/hit|thud|knock/`→impact.hard, and so on).
5. Last resort `impact.soft`.

Verified live: `spell.frostlance.impact → spell.@arcane.impact`, `enemy.gribbly.death →
enemy.husk.death`, `mat.timber.crack → wood_crack`, `timber_break → wood_break`,
`boss.attack → enemy.theseam.attack`, `spell.fire.cast → spell.@fire.cast`,
`ui.whatever → ui.click`, `some_nonsense → impact.soft`.

**Spell agent:** use `spell.<yourId>.cast|travel|impact`. If your id is one of the 18 in DESIGN.md
it already exists and is tuned. If you invent an id, you still get a school-correct sound for free —
but tell me (or the next audio pass) so it can be given its own.

---

### Mix and priority model

```
voices(sfx)  ─┐
voices(ui)   ─┼──► master ──► limiter ──► soft clip ──► out
music ─duck ─┤
amb   ─duck ─┘
(any) ─send ─► convolver(room IR) ─► return ─^
```

- **Pool:** 40 positional sfx slots + 8 UI slots + 10 ambience slots. UI can never be stolen by
  debris because it lives in its own pool.
- **Priority 0..9** per recipe (debris 1, footsteps 2, cracks 3, casts/attacks 5, breaks/impacts 7,
  explosions 8-9, player hurt/death 8-9). When the pool is full the lowest-priority, oldest voice is
  stolen with an 8 ms fade if its priority is **≤** the incoming one; otherwise the new sound is
  dropped.
- **Per-key rate limit** (`rate` seconds) and **per-key concurrency cap** (`max`). `stone_debris` is
  28 ms / 5 concurrent.
- **Density compensation:** every play suppressed by the rate limit increments a counter, and the
  next allowed play of that key is up to +45 % louder. A hundred bricks therefore read as a
  rockslide rather than a metronome. This is the single thing that makes mass destruction sound
  right, and it is why you should *not* pre-thin your `sfx()` calls — call once per event and let
  the limiter shape it.
- **Distance:** `att = ref / (ref + dist)` where `ref` is 0.85 × the camera half-width, plus a
  **distance lowpass** (19 kHz → 700 Hz) and an increased reverb send with distance. Beyond
  7 × half-width the sound is culled. Off-screen is quiet and dull, never absent.
- **Pan:** `dx / halfWidth`, clamped and scaled by 0.82 so nothing ever collapses fully into one ear.
- **Ducking:** `audio.duck(amount, secs)` drops music+ambience on a separate gain stage so it never
  fights the user's volume slider. Auto-ducked on `sim:hitstop` (0.35) and `player:damage` (0.25).
- **Limiter:** compressor at −3 dBFS / 16:1 / 1.5 ms, then a `x/(1+x⁴)^¼` waveshaper — unity slope at
  the origin so it is transparent below about −6 dB, asymptotic to 1 so **nothing can leave clipped**.
- **Rooms** are procedurally generated impulse responses (decaying noise + early reflections +
  channel decorrelation), swapped under a gain fade when the location changes.

### Hitstop — the decision

**One-shot sfx sag with the freeze; music and ambience do not.** When `R.fx.timeScale` drops, every
live positional voice ramps its `playbackRate` down to `0.68 + 0.32 × scale` over 12 ms and back up
when the hitstop ends, and any sound *started* during the window is pitched by the same factor. On a
big impact this reads as mass, which is the whole point of hitstop. Music and ambience are on other
buses and are deliberately untouched — a stuttering score is the classic tell of an engine doing
this naively.

**You do not have to call anything.** The 40 Hz scheduler polls `ctx.R.fx.getTimeScale()` and reacts
to any hitstop regardless of who triggered it. `audio.hitstop(scale, secs)` exists if you want to be
explicit; a 40 ms cooldown prevents double-triggering with the `sim:hitstop` bus event.

### Bus hooks (automatic, opt-out with `audio.autoBus = false`)

Only events nothing else is documented to sound, and every one is rate-limited so a duplicate call
from another module is swallowed rather than doubled:

| event | what plays |
|---|---|
| `sim:hitstop` | pitch bend + 0.35 duck |
| `player:damage` | `player.hurt` + 0.25 duck |
| `player:died` | `player.death`, music stops, ambience drops to 40 % |
| `player:level` | `ui.levelup` |
| `spell:learn` / `spell:levelup` | `ui.spell_learn` / `ui.spell_levelup` |
| `pickup` | `ui.pickup`, or `ui.pickup_shard` when `payload.tag === 'shard'` |
| `enemy:died` | `enemy.<payload.tag>.death` at the payload position |

Deliberately **not** hooked: `terrain:break`, `prop:break` (the sim already calls `audio.sfx` with
the material key), `spell:cast`, `spell:hit` (the spell module should call `sfx` itself with its own
id so it gets the right spell, not a generic).

### Music

D natural minor. Physically-modelled plucked string (Karplus-Strong rendered sample-exact in JS),
detuned-saw bowed low strings, an additive choral pad, a frame drum, a distant inharmonic bell, and a
filtered-saw ostinato. Melody, ornaments and rests are generated per bar from the current chord by a
weighted random walk that resolves onto chord tones, so it never repeats.

States and measured levels (10 s offline render, RMS / spectral centroid):

| state | bpm | rms | centroid | character |
|---|---|---|---|---|
| explore | 62 | 0.031 | 515 Hz | pluck + pad + low strings, sparse |
| tension | 74 | 0.073 | 566 Hz | bowed tremolo enters low, drum ghosts |
| combat | 96 | 0.109 | 1029 Hz | ostinato + frame drum, tremolo up an octave |
| boss | 104 | 0.118 | 1368 Hz | + dissonant choir cluster, tremolo up two octaves |

Escalation is not a crossfade: the state change lands **on the bar**, preceded by a two-beat riser
and a noise swell and hit with a drum entry. Measured — the quietest 250 ms window through an
explore→combat transition is **92 %** of the pre-transition level.

**`setIntensity()` hands state selection to the heat curve; `music('combat')` alone does not.** An
explicit `music(state)` sticks until you call `setIntensity`, at which point explore/tension/combat
are chosen automatically (thresholds 0.18 / 0.5, with a 6 s combat dwell so one kill does not flip
the score). `boss`, `victory` and `menu` are locked and ignore intensity entirely. This bit me during
verification — combat and tension were rendering as explore — so it is now explicit.

### Ambience

Four beds, each a live graph of layered wind (each layer modulated by two LFOs at mutually
irrational rates), a drone, insects or shimmer, plus a randomised one-shot scheduler. Measured over
6 s: level drift 4–12 %, timbre drift 1–8 %, centroids `ruinreach 457 · glyphglade 728 ·
thornmere 1202 · sunderwood 2266 Hz` — a ×4.96 spread, so they are genuinely four different places.
Ruinreach is high-Q resonant wind through stonework with drips and settling rubble; the Glyphglade
has the unstable detuned sub-drone, whispers and void pulses.

---

### Verification — `game/audio-test.html`

Board for all 231 sounds grouped by family, material sweep, the four beds, the music demo, five
stress presets, live voice/CPU/peak/memory readout, and the offline check suite.

```
node tools/shot.mjs --url "http://localhost:8888/gms/2d/sunderfall/game/audio-test.html" \
  --console --eval "window.__audioTest.verify()"
```

Every line is printed as `[VERIFY] …` and the run ends with `DONE failures=N`. **Current result:
0 failures.**

- **231 recipes rendered offline in ~1.3 s** (299.5 s of audio). 0 silent, 0 clipped, 0 warnings.
- **17/17 contrast checks.** A sample: `glass_break` centroid **7497 Hz** vs `stone_break` **718 Hz**
  (a bright shatter really is 10× brighter than a stone thud); `dirt_break` **206 Hz** (genuinely
  dull); glass high-band energy 0.999 vs earth 0.005; `metal_dent` rings for **1.80 s** vs
  `bone_crack` **0.28 s**; `glass_break` sparkle tail **1.70 s**; storm impact peaks
  **0.27 ms** after onset (the fastest transient in the game); every enemy tell peaks in its own back
  half; footsteps sit at 0.28 mix peak against a break's 0.81. Plus a pairwise fingerprint distance
  over all nine material breaks (centroid / duration / high-ratio / zero-crossing) — the closest pair
  is `wood_break`/`bone_break` at d=0.99, comfortably distinct.
- **Mix:** 120 simultaneous voice requests through the real bus → 80 played (rate limits and the cap
  absorbed the rest), master peak **0.848**, **0 clipped samples**. Deliberate abuse — 60 stacked
  `explosion.big` — peaks at **0.845**, still clean.
- **Ambience and music** as tabulated above, including the transition-gap and intensity-escalation
  checks.

Live path measured in headless Chrome with a real AudioContext: **300 debris events + a full
collapse + 220 more + 4 sustained loops + a hitstop** → 38 of 40 voices used, master peak 0.689,
scheduler cost **0.03 ms** per 25 ms tick.

**This suite caught four real bugs**, which is the argument for writing it:
1. The Chamberlin SVF went unstable above `2πfc/sr ≈ 2 − 1/Q` and blew `glass_break` up to **1e38**.
   Replaced with a TPT/ZDF state-variable filter, unconditionally stable at any cutoff.
2. The master soft-clip curve (`tanh(1.9x)/tanh(1.9)`) had a **slope of ~2 at the origin** and was
   quietly doubling the whole mix. Replaced with `x/(1+x⁴)^¼`.
3. Storm impacts peaked **44 ms** in, behind their own thunder — a lightning strike that reads as a
   firework. (Root cause: `brown()` is ~5× hotter than `white()` for the same nominal `amp`.)
4. The auto-intensity state machine silently overrode explicit `music('combat')`.

---

### Performance and memory

- **~20 MB** of AudioBuffers, LRU-capped, plus a 3 MB raw-float intermediate cache. The full bank
  would be ~75 MB, so only the hot set (51 keys, baked in ~870 ms of *idle* time via
  `requestIdleCallback`) is pre-warmed; everything else bakes on first use in 1–4 ms and then stays
  resident. Call `audio.preload([...])` at scene load for the enemies and spells that scene uses.
- Scheduler settles at **0.01–0.04 ms per 25 ms tick**. Nothing runs in the render frame.
- Per voice: **one** new node (the `AudioBufferSourceNode`, which the spec forces). Gain, lowpass,
  panner and reverb-send nodes are allocated once per slot and reused forever. `sfx()` allocates
  nothing beyond that.

### Stubbed / not done

- **No mobile hardware test.** Everything here is Chrome desktop + headless Chrome. iOS Safari needs
  a real check: it is stricter about the unlock gesture and `StereoPannerNode` on very old versions.
  The code degrades (no panner → no pan, still audible), but nobody has heard it.
- **Nobody has heard any of this.** Structural verification proves a sound is not silent, not
  clipped, and distinguishable from its neighbours. It cannot prove it sounds *good*. Someone with
  ears should sit with `audio-test.html` for twenty minutes and retune the recipes that annoy them —
  the tuning surface is the small `{dur, gain, prio, rate, max, send, variants, sr}` block at the top
  of each recipe, and re-running `verify()` will tell you if you broke the contrasts.
- **No `travel` sounds are wired to anything** — the spell agent has to start and stop them.
  `spell.<id>.travel` is a seamless loop; use `audio.loop()` and `handle.move(x, y)` per tick.
- **No per-spell `.loop` for the 13 non-sustained spells** (they get `travel`, which is the same
  material). Fine as is.
- **No footstep timing.** The sim calls `audio.sfx('player.step', {mat, x, y})`; deciding *when* is
  the player controller's job.
- **No music stem for the intro** — `intro/audio.js` has its own independent AudioContext (A3-intro
  owns it), and the two never coexist because the intro disposes before `play` starts. If they are
  ever made to overlap, one of them must go.
- **No 3D/HRTF**, no occlusion (a wall between you and a sound does not muffle it), no doppler.
  Occlusion would be a genuine win in Ruinreach and is maybe 30 lines against `world.lineOfSight`.
- **Reverb room is per-location, not per-space.** Standing inside a ruined hall sounds the same as
  standing outside it.

### Gotchas

1. **`brown()` is roughly 5× hotter than `white()` or `pink()` for the same `amp`.** It random-walks,
   so its peak also arrives at an unpredictable time. If a sound's peak is landing late, this is why.
2. **Buffers are normalised to 0.95 after generation**, so the `amp` numbers inside a recipe are
   *relative* only. Perceived loudness comes from the recipe's `gain` field, which is what
   `analyse().mixPeak` reports. Do not try to balance sounds by changing internal amplitudes.
3. **`svf` band output has gain ≈ Q.** A `q: 9` bandpass is nine times louder than you expect.
4. **A recipe that returns a `Float32Array` replaces the buffer** (that is how loops work, via
   `loopify`). Loop recipes must set `trim: false` or the tail crossfade is cut off.
5. **`audio.sfx()` before the first user gesture returns 0 and does nothing.** Desired ambience,
   music, intensity and volumes set before then are stored and applied on unlock, so you can call
   them from `enter()` without caring.
6. **The scheduler is `setInterval(25 ms)`, not the game loop.** It keeps running when the game is
   paused (that is correct — pause music should keep playing) and pauses on `visibilitychange`.
   `audio.update()` is optional and only refines the listener position.
7. **The listener follows `ctx.R.cam` automatically.** If you call `audio.setListener()` once, camera
   following turns off permanently until you call `audio.followCamera(true)`.
8. **`enemy:died` uses `payload.tag` as the enemy id**, per `sim/API.md` §13. If the enemy module
   puts the id somewhere else, death sounds will all fall back to the husk — tell me, or set `tag`.
9. **Ambient one-shots are non-positional** (random pan). They are a bed, not world objects.
10. **`OfflineAudioContext` renders `setTimeout`-based work never happen** — `mix.setRoom()`'s
    convolver swap is deferred by a timeout, so an offline render always uses the initial forest IR.
    Only matters for the harness.
11. Headless Chrome blocks autoplay unless you launch it with
    `--autoplay-policy=no-user-gesture-required`; `tools/shot.mjs` does not pass that flag, which is
    fine because the whole verification suite is offline and needs no running context.

### Next, with another hour

- Occlusion: lowpass + attenuate a voice when `world.lineOfSight(listener, source)` is false.
- A proper "spell charge" loop layer that rises with cast progress, driven by `handle.pitch()`.
- Per-enemy attack variants (right now `attack` is one recipe with pitch variance; two or three
  distinct swings per enemy would stop the fodder sounding mechanical).
- A `victory`/`death` musical sting that resolves the current chord instead of stopping.
- Retune by ear. See "Stubbed" above — this is the highest-value hour available.

### REQUEST — from other modules

- **spells:** call `audio.sfx('spell.<id>.cast'|'.impact', {x, y})` and use
  `audio.loop('spell.<id>.travel', {x, y})` + `handle.move()` + `handle.stop()` for projectiles and
  channels. Do **not** emit `spell:cast` and expect a sound; that hook is deliberately absent so you
  get your spell rather than a generic. Also call `audio.setIntensity()` — the score cannot escalate
  on its own without someone telling it there is a fight.
- **enemies:** `audio.sfx('enemy.<id>.tell', {x, y})` on the wind-up is worth more than any other
  single call you can make — it is the telegraph the player actually reacts to. Set `tag` to the
  enemy id on the entity so the automatic `enemy:died` hook picks the right death.
- **sim:** you already call `audio.sfx(key, {x, y})` with the material keys, which all exist. For
  footsteps please pass the material: `audio.sfx('player.step', {mat: e.groundMat, x, y})`, or just
  `audio.step(e)`. For a big collapse, `audio.sfx('collapse.start')` then `'collapse.land'` reads far
  better than debris alone.
- **ui:** volume sliders are `audio.volumeNames()` / `getVolume` / `setVolume(name, 0..1)`, mute is
  `toggleMute()`, and they persist themselves. A "start audio" affordance somewhere in the first
  screen is worth having — call `audio.resume()` from the click handler and check the boolean.
- **level/scene:** call `audio.ambience('<location>')` on entering each of the four movements, and
  `audio.preload([...])` with that section's enemy and spell keys at load time.

---

## B2-spells — `game/js/spells/**` + `game/spell-test.html` (2026-08-09)

**Built:** all 18 spells from `DESIGN.md` §3 at 5 behaviour-changing ranks each, the five-circle
cast system with focus/XP/learning/offers, a shared juice layer (decals, impacts, wind-ups,
budgeted screen feedback), 18 code-drawn icons, three custom surface kinds, and a proving-range
harness. Verified visually at 1440×900 and 390×844; **60 fps / 10 draw calls** with all five
circles auto-casting and everything on fire, measured under headless SwiftShader (software).

```
game/js/spells/
  registry.js          SPELLS export (what main.js probes for) + createSystem
  system.js            cast circles, focus, cooldowns, auto-cast, XP, levels, offers
  fx.js                decals, impact/castFlash/windup, hitstop+shake+shockwave budgets
  common.js            projectile / field entity helpers, targeting queries, dmgOpts
  surfaces.js          the three surface kinds this module defines
  icons.js             all 18 icon(c2d, size) drawings
  schools/  fire.js storm.js earth.js decay.js void.js life.js
  testkit/  shim.js range.js      ← TEST-ONLY, see "the shim" below
game/spell-test.html   the proving range
```

### How it hooks itself up — nothing else has to call anything

`main.js` imports `./spells/registry.js` for `SPELLS` **after** it publishes `window.__sunderfall`,
so importing the registry is enough: it finds the ctx and builds the system itself.

The system then gets its ticks from **one invisible "conductor" entity** it spawns into the sim on
`bus.on('sim:ready')`. The sim calls that entity's `onUpdate` every fixed step and its `render()`
inside the render pass. This matters: **the only place a spell can draw is inside the sim's
render pass**, because anything drawn after the sim's `R.end()` goes nowhere. Every spell visual is
therefore an entity `render()` callback, never a stray draw from a scene or the UI.

If the world is swapped (respawn, new level), call `SPELLS.system.attachWorld(world)` again — it
re-spawns the conductor, re-defines the surfaces and clears decals. `sim:ready` already does this.

### The `SPELLS` export — exact shape

`SPELLS` is a plain **array** of spell definitions with extra properties hung off it, so
`ctx.spells = mods.spells.SPELLS` still gives the UI everything.

```js
import { SPELLS, createSpellSystem } from './spells/registry.js';

SPELLS                      // Array<SpellDef>, 18 long, in school order
SPELLS.byId                 // Map<id, SpellDef>
SPELLS.get(id)              // SpellDef | undefined
SPELLS.ofSchool('fire')     // SpellDef[]
SPELLS.schools              // ['fire','storm','earth','decay','void','life']
SPELLS.colors               // { fire:{base,hot,dark}, ... } RGB triples, renderer-safe
SPELLS.SLOTS                // 5
SPELLS.CIRCLE_UNLOCK        // [1, 3, 7, 12, 18]  player level per circle
SPELLS.xpForLevel(level)    // XP needed to reach level+1
SPELLS.createSystem(ctx)    // idempotent; also sets ctx.spellSystem
SPELLS.system               // the live system once created (null before)
```

A `SpellDef` is exactly `ARCHITECTURE.md` §7 plus five additive fields:

```js
{
  id, name, school, desc, unlockLevel, manualOnly, cost, cooldown, range, levels: 5,
  targeting: 'aim'|'nearest'|'self'|'ground'|'area',
  scale(rank) -> stats,          // called ONCE per rank at boot and cached; never in a cast
  cast(C, caster, target, stats),
  icon(c2d, size),               // plain 2D canvas, transparent bg, restores its own state

  windup: 0.10..0.50,            // ADDED: seconds of anticipation before cast() runs
  rankText: [5 strings],         // ADDED: what each rank adds — this is the level-up card copy
  castSfx: 'spell_x_cast',       // ADDED
}
```

`stats` from `scale(rank)` may include `cooldown` and `cost`, which override the def's values —
that is how ranks change cadence. All other fields are the spell's own business.

`cast(C, …)` receives **C, an extended ctx** (this is a deviation from §7's bare `ctx`, and it is
what makes spells one-liners):

```js
C = { world, R, P, bus, rng, input, view, audio, LAYER, sys,
      x, y,            // cast origin (world.castOrigin — Rook's lifestone)
      tx, ty,          // resolved target point
      dirX, dirY,      // unit vector origin -> target
      target,          // the entity, when targeting resolved to one, else null
      rank, slot, manual,
      report(src, target, applied, type, material) }   // call on every hit -> emits spell:hit
```

### The cast-circle / focus / XP API the UI needs

```js
const S = SPELLS.system;      // or ctx.spellSystem

// circles — index 0 is circle 1 (the manual one). Read-only for the UI.
S.circles[i] = { index, spellId, def, rank, cd, cdMax, cost, ready, unlocked, auto, blocked }
//   blocked: '' | 'cooldown' | 'focus' | 'reserved' | 'queue' | 'notarget'
//   'reserved' is the important one: auto-cast is refusing to eat slot 1's next cast.
S.setSlot(i, spellId)   S.clearSlot(i)   S.swapSlots(a, b)
S.castSlot(i, manual = i===0, force = false) -> bool

// focus
S.focus  S.focusMax (100)  S.focusRegen (12/s)  S.regenPause  S.regenPauseTime (0.8)
S.starving        // true while auto-cast is holding the pool near empty — show it

// progression
S.level  S.xp  S.xpToNext  S.maxLevel (24)  S.shards
S.addXp(n, 'kill'|'break')      // the system already listens for enemy:died / prop:break /
                                // terrain:break and pays out itself; you rarely call this
S.known                          // Map<id, rank>
S.knownList() -> [{id, rank, def}]
S.rankOf(id)  S.statsFor(id, rank)
S.learn(id, rank)  S.rankUp(id)  S.grantShard(id?)   // shard = elite drop, ranks something up

// pick 1 of 3 (generated automatically on every even level)
S.offer = { level, choices: [{ id, def, rank, isNew, name, school, icon, text, subtext }, …] }
S.chooseOffer(index) -> bool     // applies it, auto-assigns to a free circle, clears the offer
S.rerollOffer()  S.forceOffer()

// misc
S.autoEnabled       // master switch for circles 2–5
S.manualEnabled     // if true (default) the system itself fires slot 1 on input.pressed('cast').
                    // SET IT FALSE if the UI wants to own the cast button.
S.castSpell(id, rank, { x, y, manual }) -> bool     // ignores cost/cooldown; test + scripted use
S.serialize() / S.restore(d) / S.softReset()        // softReset = death: keep knowledge, ranks -> 1
S.stats = { casts, hits, damage, xpFromKills, xpFromBreaking }
```

**Focus arithmetic, so the tension is real.** 100 pool, 12/s regen, 0.8 s regen pause after a
manual cast. Auto-cast may only spend down to a reserve of `slot1.cost * 1.7`, and no two
auto-casts fire within 0.14 s of each other. Emberbolt R1 costs 7 at a 0.5 s cooldown = 14 focus/s
sustained, which is already above regen; put Emberstorm (58) and Acid Rain (50) in circles 2 and 3
and slot 1 will visibly stutter. That is the intended puzzle. `circle.blocked === 'reserved'` and
`S.starving` are how the player finds out why.

### Bus events emitted

| event | payload |
|---|---|
| `spell:cast` | `{ id, rank, slot, manual, school, x, y, tx, ty, cost, focus }` |
| `spell:hit` | `{ id, target, x, y, damage, type, material }` — capped at 24 per cast |
| `spell:learn` | `{ id, def, rank, isNew: true }` |
| `spell:levelup` | `{ id, def, rank, from }` — **spell** rank up |
| `player:level` | `{ level, unlockedCircle (1-5 or 0), xpToNext }` |
| `spell:offer` | the offer object (extra, for the card UI) |
| `spell:offerTaken` | `{ id, rank, isNew }` (extra) |
| `spell:slots` | `{ circles }` (extra, on any slot change) |
| `spell:starved` | `{ slot, id, need, have }` (extra, manual cast fizzled) |
| `spell:ready` | `{ system }` (extra, once the world is attached) |

### The 18 spells and what each rank actually changes

Ranks never add only numbers. Every rank listed below is a behaviour change (plus scaling).

**fire · emberbolt** (aim, 7f, 0.50s, L1) — R2 impact splash · R3 forks two bolts on a kill ·
R4 pierces the first thing it kills · R5 pours a line of `fire` along the whole flight path.
World: ignites TIMBER/FOLIAGE, scorches the ground, always leaves a mark.
**fire · cinderwake** (self, 22f, 6.5s, L4) — R2 3 embers + props ignite · R3 4 embers, drips fire
onto the floor · R4 embers detonate on contact and rekindle · R5 double-radius burning wake.
**fire · emberstorm** (area, 58f, 15s, L10) — R2 12 meteors · R3 craters left burning ·
R4 a 2.6× finale meteor at the band centre · R5 4 s firestorm over the band. Craters terrain,
second IMPACT pass so it genuinely breaks MASONRY/ROCK, leaves ash along the ground line.
**fire · pyreveil** (self, 26f, 9s, L8) — R2 knocks crossers back · R3 sets the ring's ground
alight · R4 burns enemy projectiles out of the air · R5 detonates on expiry. Always leaves a
burnt circle.
**storm · sparklash** (nearest, 14f, 1.15s, L2) — R2 4 chains · R3 5 chains and the arc jumps
*through* METAL props · R4 6 chains + stun · R5 final target explodes and fuses glass into the
ground. World: GLASS breaks instantly on the segment, METAL rings and conducts.
**storm · stormcall** (ground, 34f, 10s, L6) — R2 strikes ignite · R3 TIMBER splinters (×2.2) ·
R4 each strike chains · R5 the cell drifts toward the nearest enemy. Fires a final strike on expiry.
**storm · galewrench** (aim, 12f, 1.8s, L2) — R2 topples FOLIAGE via `world.collapse` · R3 sets
`world.surfaces.wind` for 2.6 s so every fire on screen leans downwind · R4 slams targets into
terrain · R5 becomes a 1.1 s channel with 4.5 s of wind. Shoves debris; wind decays back to 0.
**earth · stonepin** (aim, 20f, 1.6s, L5) — R2 landing quake · R3 ROOTs the target and carries on
into the ground · R4 splits into 3 shards · R5 the buried shard becomes real terrain
(`terrain.fill`). Always ×2.1 vs MASONRY/ROCK, always leaves the shard as a decal.
**earth · sunderquake** (self, 42f, 7.5s, L7) — R2 launches · R3 carves a real fissure that
undermines prop bases → the support graph drops arches · R4 second wider wave · R5 aftershock +
forced collapse of anything unstable. Leaves permanent floor cracks.
**earth · thornsurge** (ground, 24f, 4.2s, L6) — R2 8 spikes · R3 bursts through MASONRY and
cracks the floor · R4 spikes persist 8 s as **solid entities** (`gridSolid`) · R5 they burst into a
`rot` cloud when they die.
**earth · bulwark** (ground, 30f, 8.5s, L9) — R1 EARTH slab · R2 ROCK · R3 stepped MASONRY ·
R4 smothers fire/acid/oil under it · R5 erupts, launching anything standing there. Builds real
terrain with `terrain.fill`; re-solves support so it can hold props up.
**decay · acidrain** (area, 50f, 14s, L11) — R2 denser/wider · R3 deeper pools · R4 CORRODE ·
R5 permanent caustic bog (240 s of eating + a stain that does not fade). Drops real `acid`
surface which oozes downhill and is eaten by a slow **caustic field** entity that keeps chewing
MASONRY/TIMBER for up to four minutes.
**decay · blightbloom** (nearest, 26f, 6s, L8) — R2 bigger · R3 **spreads corpse to corpse**
(every kill inside blooms again, up to 3 generations) · R4 rotted foliage crumbles outright and
TIMBER starts to go · R5 the ground re-blooms once on its own after 6 s. Pours `rot`.
**decay · bloodtithe** (nearest, 18f, 3.2s, L4) — R2 two tethers · R3 kills FOLIAGE props outright
and the dead ground stays marked · R4 overheal becomes SHIELD · R5 three tethers + a healing burst
on a kill.
**void · voidlash** (nearest, 22f, 5s, L5) — R2 two · R3 three, pile-up impact damage · R4 drags
props **and hauls fire/acid off the floor into the pile** · R5 implodes and leaves a `void` scar.
Debris is pulled in with a negative `shoveDebris`.
**void · mirrorstep** (self, 16f, 3.4s, L2) — R2 further, decoy taunts · R3 i-frames + the
detonation carves terrain · R4 two decoys · R5 the blink path shears the world (damages everything
along the line, leaves a permanent slit).
**void · nullring** (ground, 32f, 11s, L12) — R2 stronger slow · R3 `surfaces.freeze` — fire and
acid inside stop spreading · R4 holds props stable so nothing falls · R5 releases everything it
held in one blast. Erases enemy projectiles; leaves frost and a scratched ring.
**life · gravewake** (ground, 44f, 12s, L9) — R2 3 risen + it will raise from bare ground ·
R3 they burst into bone shrapnel · R4 4 risen and each spent pile leaves a **mound of new terrain**
· R5 the risen raise their own dead. **BONE props are consumed permanently**, not broken.

### Surface kinds this module defines

`world.surfaces.define()` is called once per world in `surfaces.js`:

| id | behaviour |
|---|---|
| `void` | no spread, no flow, `consumes 0.6`, 9 dps VOID + slow. Voidlash/Mirrorstep residue. |
| `rot` | slow spread + flow, `consumes 1.4`, 7 dps DECAY. Blightbloom, Thornsurge R5. |
| `ash` | inert, `decay 0.0016` (≈10 min), tiny flow so no cell can hang in the air. Pure memory. |

Everything else uses the built-ins (`fire`, `acid`, `frost`, `oil`).
`leaveAsh(world, x, y, r, amount)` lays ash **along the ground line**, not as a disc.

### Audio keys called (all currently into the no-op stub)

Per spell, `spell_<id>_windup` (fired by the system at commit) and `spell_<id>_cast` (fired by the
spell at release). Plus:

```
spell_emberbolt_hit  spell_emberbolt_fork  spell_cinderwake_fade
spell_emberstorm_launch  spell_emberstorm_impact  spell_emberstorm_finale
spell_pyreveil_burn  spell_pyreveil_burst
spell_sparklash_hit  spell_sparklash_burst  spell_stormcall_strike
spell_stonepin_impact  spell_sunderquake_slam  spell_sunderquake_crack
spell_thornsurge_erupt  spell_thornsurge_impale  spell_bulwark_raise
spell_acid_drip  spell_blightbloom_burst
spell_voidlash_crush  spell_voidlash_implode
spell_mirrorstep_detonate  spell_mirrorstep_arrive
spell_nullring_eat  spell_nullring_release
spell_gravewake_raise  spell_gravewake_consume  spell_gravewake_shrapnel
minion_swing  bone_clatter  glass_break  metal_ring  spell_fizzle
level_up  level_up_circle
```

`glass_break` / `metal_ring` / `bone_clatter` overlap with the material `sfx` keys in
`materials.js` on purpose — same sound, two callers.

### `game/spell-test.html` — the proving range

Range: sloped ground with a basin (so acid has somewhere to ooze), a 3×2 masonry wall with a glass
window on top, a stone arch on two pillars with a capstone (the support-graph showpiece), five
trees, crates/barrels/fences, two bone piles, an iron gate, a brazier, lanterns, boulders, and 15
dummy targets with visible health bars.

```
?spell=<id>&rank=1..5&t=<seconds>    cast it, fast-forward t, then FREEZE the sim
&live                                don't freeze (let it keep running)
&all                                 cast all 18 at once — the frame-budget stress test
&auto                                turn auto-cast on
&px=<x>                              move Rook (default −300; use 1200 for the tree line)
&x=<offset>                          aim offset from Rook (default 300, snaps to nearest dummy)
&preserve=1&dpr=1                    required for headless canvas capture
```

**The freeze is the point.** `shot.mjs` settles for ~1 s before capturing, which would eat the
whole effect; freezing after the fast-forward means `?t=0.35` really is the frame at 0.35 s.

Keyboard: click = cast the selected spell at the pointer, 1–5 = fire that circle, Q/E = rank,
A/D/space = move, R = reset, X = cast everything. `window.__spell = { world, ctx, R, P, system,
SPELLS, player, cast, select, fastForward, castEverything, audioKeys(), stats() }`.

Headless recipe used throughout:
```
node tools/shot.mjs --url ".../spell-test.html?preserve=1&dpr=1&spell=acidrain&rank=5&t=30" \
  --canvas --size 1440x900 --at 0 --wait 800 --out DIR --name acid
```

### `spells/testkit/` — the shim, and why it exists

`sim/index.js` did not exist while this was written (only `materials.js` and `status.js`), and a
spell you have never watched run is a spell you have not built. `testkit/shim.js` is a **test
double for `sim/API.md`**: terrain grid, props with a real break chain and support graph, debris,
the fluid/surface layer with staggered slow ticks, entities, damage, queries, `sweep`, `explode`,
`materialFx`, and a minimal player. `testkit/range.js` builds the range using only documented
authoring calls (`terrain.hill`, `addProp` with `supportedBy`, `addTree`), so the same code runs
against the real sim.

**Nothing outside `testkit/` imports it, and `spell-test.html` is the only page that loads it.**
If `sim/index.js` behaves differently from the shim, the sim is right. Delete the shim once the
real sim can host the range.

### Stubbed / not done — be honest

- **Run against the real `sim/` — it landed mid-session and all 18 cast clean.** I probed the
  world API against everything the spell module touches: the only missing method is
  `despawnProp` (see REQUEST). All 18 cast at rank 5 in `game/index.html?nointro&scene=play`
  with zero console errors, and they look right over the real painterly backdrops. Two real bugs
  came out of that run and are fixed:
  - `world.materialAt()` returns **-1** for an empty cell and `MAT[-1]` is undefined, which
    throws inside `burstDebris`/`materialFx`. Use `matAt(world, x, y)` from `common.js`.
  - the shared `P.emit` descriptor had `tex: null`; `particles.js` only falls back to `R.blob`
    on `undefined`, so every spell particle was drawing as a hard white quad. Both `tex`
    branches now use `undefined`.
  Still unverified against the real sim: whether `shoveDebris` treats a negative force as a pull
  (Voidlash R1 assumes it does), whether prop `tint` is writable after creation
  (Blightbloom/Bloodtithe assume so — harmless if not), and whether the sim's `acid` surface
  already eats props (if so Acid Rain's caustic field double-dips and its `strength` should come
  down). Balance against the real level is completely untuned — every number was tuned on the
  test range.
- **`world.despawnProp` is a shim addition.** Gravewake needs a BONE prop to *cease*, not to break
  into debris. It falls back to `breakProp` when the method is missing, which still reads fine.
  See the REQUEST below.
- Gravewake's risen are mine, not the enemy agent's: simple walk-to-nearest-enemy melee, procedural
  bone silhouette. They will look out of place next to real enemy art.
- No spell reads `manualOnly` yet — every spell can go in slot 1, per DESIGN ("their funeral").
- The offer generator can return **2 choices instead of 3** at level 2 if too few spells are
  unlocked. Fixed by lowering `unlockLevel` on Galewrench and Mirrorstep to 2; if the unlock table
  is retuned, re-check it.
- No save integration — `serialize`/`restore` exist, nobody calls them.
- Slot-1 mobile aim assist is the sim's `input.aim`; there is no extra assist cone.

### Gotchas — the ones that cost me time

1. **You cannot draw outside the sim's render pass.** `R.begin()` resets the batches and `R.end()`
   presents. Every spell visual is an entity `render(e, alpha, R)` callback for that reason, and
   the whole system rides on one conductor entity. If your spell is invisible, that is why.
2. **`R.fx.shockwave` has a null-deref bug** (see REQUEST). Four shockwaves in one *rendered* frame
   crashes it. `fx.js` exports a wrapper that allows one per rendered frame; `frameReset()` is
   called from the render pass, *not* the sim step, because the wave slots age on real time — a
   fast-forwarded sim that never renders must not be allowed a second one.
3. **`LAYER.FX` is barely lit** (shade 0.18). Anything that should read as a physical object —
   a storm cloud, a decoy body — must go on `ACTORS`/`ACTORS_BACK` or it stays the colour you
   typed, which on a dark sky is invisible. Additive glow belongs on FX; matter does not.
4. **Never pour a flowing fluid as a disc.** Cells land inside solid rock, can never flow out, and
   draw as bars of colour buried in the ground. Pour at the surface, or let the fluid fall.
5. **An area spell that steps a wave along the ground will hit the same target once per step.**
   Sunderquake did 12× its damage and levelled the entire screen until I added per-wave dedupe
   lists for entities and props. Any travelling effect needs this.
6. **Prop `grounded` must be re-sampled on every support solve.** Latching it true at creation
   means blowing the floor out from under a wall does nothing — which is exactly the showpiece the
   game is selling. (This was a shim bug, but the real sim should be checked for it.)
7. `scale(rank)` runs once per rank at boot and is cached. Do not put randomness in it.
8. `e.data` is wiped on spawn and the object is reused per pool slot — never hold a reference to a
   `data` object across a despawn.
9. Colours are squared by the renderer. Every school palette in `fx.js` is deliberately
   desaturated; `[1, 0.5, 0.2]` becomes `[1, 0.25, 0.04]` and looks radioactive.
10. `world.queryProps`/`queryRadius` return **shared reused arrays**. Two nested loops over two
    queries will silently share a buffer — every call site here passes its own scratch array.

### REQUEST — things I need from other modules

- **A1-engine (`gfx/postfx.js`): `shockwave()` can dereference null.** The slot picker starts
  `oldest = 0` and only assigns `slot` when `w.t / w.life > oldest`, so when all four waves have
  `t === 0` — four shockwaves in one frame, which a busy fight will do — `slot` stays `null` and
  the next line throws. Fix: initialise `oldest = -1`, or fall back to `waves[0]`. I am working
  around it with a one-per-frame limiter in `spells/fx.js`.
- **B1-sim: please add `world.despawnProp(prop)`** — remove a prop with no debris, no `prop:break`,
  and a support re-solve. Gravewake *spends* BONE piles rather than breaking them, and the
  difference is visible: broken leaves bones on the floor, spent leaves a grave.
- **B1-sim: confirm `world.shoveDebris(x, y, r, force)` treats a negative force as an inward pull.**
  Voidlash R1's "pulls loose debris and props inward" depends on it. If not, I need
  `world.pullDebris` or I will do it by hand.
- **B1-sim: confirm `world.surfaces.wind` is read by fire spread and is safe to write from a
  spell.** Galewrench R3+ sets it and eases it back to 0 over a few seconds; if something else
  owns that value we will fight over it.
- **UI agent:** the system fires slot 1 itself off `input.pressed('cast')`. Set
  `SPELLS.system.manualEnabled = false` if you want to own the cast button, then call
  `system.castSlot(0, true)`. Do **not** call `system.update()` — the conductor entity does that,
  and a second call would double-tick focus and cooldowns.
- **Audio agent:** key list above. `spell_<id>_windup` fires ~0.1–0.5 s before `spell_<id>_cast`;
  they are meant to be two halves of one sound.

### Next, with another hour

- Run the whole set against the real `sim/` and fix the mismatches listed above.
- Slot-1 aim assist for touch (a cone snap toward the nearest valid target, overridable by drag).
- Elemental cross-reactions: Galewrench into Acid Rain should carry the pools; Sparklash into a
  WET target should already double via the sim's WET status but nothing sets WET yet.
- A `spell:hit` damage-number hook for the UI (the event carries everything needed already).

---

## B1-sim — `game/js/sim/**` + `game/sim-test.html` (2026-08-09)

**Built:** the whole simulation layer — entities, physics, the player controller, destructible
terrain, destructible props with a real structural-support graph, pooled debris that settles and
persists, a persistent surface/fluid layer (fire spreads, acid flows and eats), the play scene, and
a visual proof harness with scripted destruction demos.

```
game/js/sim/ index.js world.js entities.js physics.js player.js
             terrain.js props.js debris.js surfaces.js materials.js status.js level.js
             API.md            <- READ THIS, it is the contract, not this section
game/sim-test.html
```

**`game/js/sim/API.md` is the real API document.** Everything a spell or an enemy needs is in it,
with exact signatures. This section is the archaeology: why things are the way they are, what is
missing, and the traps.

Measured in headless Chrome (SwiftShader — software): **60 fps with 596 live debris bodies, 80
props, fire spreading and a full backdrop stack, in 11–12 draw calls.** All 596 asleep within ~4 s
of landing. Verified at 1440×900 landscape and true 390×844 portrait, and through `game/index.html`
(main.js picks up `createPlayScene` and replaces its demo scene automatically — confirmed).

### What the systems actually are

- **Terrain** — one `Uint8Array` of material + hp + flags + char per **16 px** cell, in 32×32-cell
  chunks. Each chunk caches a flat `Float32Array` draw list and rebuilds only when a cell in it
  changes, so a static frame is a walk over a few typed arrays and a blast costs one rebuild per
  touched chunk. Rendered in two passes: run-merged body quads for the mass, then a soft blob
  "cap" on every cell with an exposed face. That second pass is the whole reason it does not read
  as Terraria — it dissolves the staircase without any marching-squares machinery that destruction
  would then have to re-run.
- **Props** — the full `intact → cracked1 → cracked2 → shattering → falling → debris → settled`
  chain, driven purely by applying damage. Every id in `atlas.json`'s `materials` block works out
  of the box, including the crack states, the settled sprite and the per-prop debris frames the art
  agent authored. The settled sprite is swapped in *under* the dust plume, which is the standard
  trick and it works.
- **Support graph** — see API.md §8. AND semantics by default (every declared supporter is
  load-bearing), solved as a greatest fixpoint. This is what makes the arch come down when you take
  out one buttress, and it is the single most important behaviour in the module.
- **Debris** — 900-body pool, boxes with an angle, swept per axis, asleep after 0.3 s still.
  Sleeping bodies stamp a per-column **rubble heightfield** which `world.solidAt` reports as solid,
  so you can genuinely stand on a pile of bricks you just made.
- **Surfaces** — a sparse 32 px grid per fluid kind, ticked on a staggered fifth-of-the-cells slice.
  `fire acid slime frost oil` ship; `surfaces.define({...})` adds more as pure data.
- **Player** — see below. Drawn entirely from primitives (two-bone IK legs, swinging arms, a verlet
  cloak, three verlet hair strands, squash/stretch, lean), so a spell going off next to him lights
  him for free.

### Tuning numbers, so nobody has to rediscover them

Rook: run 540, ground accel 5200 / decel 6200 / turn 9000, air accel 2600 / drag 1000, gravity 3000
(×1.32 falling, ×0.72 near the apex for hang time), jump −1075, variable-jump cut ×0.42, coyote
0.10 s, jump buffer 0.13 s, dash 1290 for 0.155 s with 0.24 s i-frames and a 0.46 s cooldown,
wall slide 250, wall jump (640, −940), corner correct 15 px, step-up 20 px, AABB 46×152.

Scene look (calibrated by screenshot, do not nudge blind — see gotcha 1): ambient `0.125,0.155,0.245`,
haze `0.26,0.35,0.55`, TERRAIN response 1.30, BG bands multiplied down to 0.80/0.72/0.62, bloom 0.58,
threshold 0.86, vignette 0.62, plus **two camera-following moon lights** (0.55 and 0.20 intensity).
Terrain body colour falls off to 26 % at 12 cells deep and is boosted ×1.45 on the surface row.

### Stubbed / not done — be honest, this is the useful part

- **No enemies and no AI.** `kind:'enemy'` entities work completely (spawn, physics, damage, death,
  knockback, statuses, corpses, `enemy:died`) but nothing in `sim/` drives one.
- **No entity-vs-entity collision.** Bodies pass through each other. Terrain, solid props and
  settled rubble stop them. Enemy separation is the enemy agent's problem.
- **No real slopes.** Slopes are step-up: a body blocked horizontally with clear space up to
  `stepUp` px higher is lifted instead of stopped. Reads identically for stairs, hills and rubble
  and costs nothing. A 45° ramp still walks like a staircase of 16 px steps if you author one.
- **Props do not rotate their AABB while falling.** The sprite rotates, the collision box does not.
  Nobody has noticed in any screenshot, but do not build a puzzle on it.
- **Prop debris ignores prop collision** — it only collides with terrain and rubble.
- **`terrain.fill()` (for Bulwark) works but does not push entities out of the new geometry.** Call
  `unstick()` from `physics.js` on anything inside it.
- **No pickups, no XP, no focus, no HUD, no save.** `bus.emit('pickup', …)` is wired and unused.
- **Composite trees are two props linked by support**, not one object. The canopy is flung sideways
  when the trunk topples (see `dropSupported`), which reads correctly, but it is not rigidly
  parented — a very slow topple would show them separating.
- **The level is a test level.** Three zones proving the systems, not DESIGN.md §5's 35–50 minutes.
  `level.js` is meant to be replaced wholesale.
- `MATERIAL.EARTH` and `MATERIAL.FLESH` are additive to ARCHITECTURE §6's seven. Terrain soil needed
  a material and creatures needed one so `damage()` has a single code path. Nothing was removed.

### Gotchas — these cost me real time

1. **The scene was pure black on the first three attempts.** Ambient alone cannot carry an unlit
   layer at painterly albedos: the renderer squares colours, so ambient `0.125` is `0.0156` linear,
   and a `0.28` terrain albedo lands at `0.0012`. You need actual lights. The fix is two big soft
   camera-following moon lights plus warm point sources (braziers/lanterns) placed roughly every
   900–1200 px through the level. **Then** the terrain albedo can stay dark and read as painted.
   If you brighten albedos instead, everything flattens into one blue slab — I did that too.
2. **`R.fx.shockwave` THROWS when all four ring slots are busy** (`postfx.js:84` dereferences a null
   slot). Ten explosions in one frame killed the frame. Use **`world.shockwave(x, y, s)`** — it
   try/catches and rate-limits to one per tick. Anything that can fire twice in a frame must.
3. **Debris would not sleep.** The de-penetration walk-back leaves a body ~1 px clear of the ground,
   so it free-falls for two or three frames before touching again; a rest timer keyed on "did I
   collide this frame" therefore resets forever and 600 bodies stay hot. Key it on "is there ground
   under me" (a probe 3 px below) instead. Same trap will bite anything else that settles.
4. **`--wait` in `tools/shot.mjs` happens before the `--at` offsets, and demos that run on page load
   have already finished by the first capture.** Drive the interesting moment with
   `--eval "__sim.demo('arch')"` instead — evals run after the wait, so `--at 0.25,0.7,1.1` then
   actually samples the collapse. I spent two rounds screenshotting aftermath and thinking the
   physics was instant.
5. **A backdrop band's bottom edge is a ruled line the moment the camera drops below it** (A1's
   gotcha 4, and it bites hard the first time you look into a chasm). Do not guess a fill colour —
   re-draw the band's bottom pixel row (`v0: 0.995`) stretched 3200 px downward at the same
   parallax and tiling. It continues the art exactly. `fillUnder()` in `index.js`.
6. **Prop `grounded` must test `terrain.filled`, not `terrain.solid`** — `solid` excludes one-way
   platforms, so every prop standing on a wooden ledge was declared unsupported and collapsed on
   load. With AND support semantics an authoring mistake like that takes the whole level down.
7. **Anything that damages every tick must pass `noFlash: true` and must not trigger the hurt
   pose.** Standing in fire or acid otherwise pins `hitFlash` at 1 and Rook renders as a solid white
   silhouette forever. `e.onDamage` ignores anything under 2.5 damage for exactly this reason.
8. **Support cascades need staggered delays or the collapse is one frame and reads as a delete.**
   0.12 s + 0.17 s per prop in the fall order + jitter. The delay *is* the drama.
9. **`R.tri` draws after all `R.sprite`s within a layer**, so a character built from both cannot be
   ordered freely. Rook's body is quads only; the cloak is tris and lives on `ACTORS_BACK`.
10. **Fire will eat the world if any common terrain material is flammable.** `EARTH` was 0.25 for
    about ten minutes and the entire level burned to the horizon in five seconds. It is 0 now: fire
    lives on TIMBER/FOLIAGE props, timber terrain and oil. There is also a hard `cap` on live cells
    per fluid kind (fire 320) as a backstop.
11. **Budgeted fire lights need their stand-in gain clamped.** Sampling 22 lights out of 600 cells
    and scaling each by `cells/22` blows the frame to pure white. Clamp the gain (3.2 here).
12. `world.lastHits` and `world.hit` are shared and reused. Copy before you call anything else.

### REQUEST — things I need from other modules

- **art:** the `_settled` frames are used the moment a prop breaks (under the dust) and they work
  well. Two asks: (a) the parallax bands' **top** edges are also hard lines — `*_near` and `*_fg`
  show a ruled seam when the camera rises; feathering the top 32 px of those PNGs would fix it and
  I cannot fix it from my side the way I fixed the bottoms. (b) there is no terrain *tile* art —
  `atlases.terrain` is six ground decals only — so terrain mass is drawn procedurally. A single
  512×512 tiling rock/soil/masonry texture per material would upgrade it enormously for very little
  payload; I would sample it in `terrain.js` `buildChunk` in an afternoon.
- **engine (A1, if anyone picks it up):** `R.fx.shockwave` should return `false` when saturated
  rather than throwing (gotcha 2).
- **ui:** health/focus, damage numbers and the death screen are yours. Listen for `player:damage`,
  `player:died`, `enemy:died`, `prop:break`, `terrain:break`, `pickup`. `world.player.hp/maxHp` is
  live. Register touch controls with `input.registerZone`; the sim already reads `input.axisX`,
  `pressed('jump')`, `pressed('dash')` and `input.aim`, so a virtual stick works with no change.
- **spells:** spawn `kind:'projectile'` entities with `onUpdate`/`onHit`, or drive `world.sweep()`.
  Use `world.explode()` for anything big — it is the reference for how much juice an impact gets.
  Every spell that should touch the world already has a call: `world.terrain.damage`,
  `world.surfaces.pour/ignite/clear/freeze`, `world.debris.shove`, `world.props.collapse`,
  `world.terrain.fill` (Bulwark), `world.surfaces.wind` (Galewrench).
- **enemies:** `stonewarden` smashing terrain is `world.terrain.damage(x, y, r, dmg, 'impact')`;
  `sunderwraith` phasing is `collides: false`; `oozelord` slime is
  `world.surfaces.pour('slime', …)`; `gravewake` should consume `skull_pile` props
  (`world.propAt` / `world.queryProps`, material `BONE`).

### Next, with another hour

1. Replace the test level with DESIGN.md §5's four movements. `level.js` is the only file to touch.
2. Parent composite-tree canopies rigidly to the trunk transform while it topples.
3. Sample a real tiling texture in `terrain.buildChunk` once art exists (see REQUEST).
4. Rotate prop AABBs while falling so a toppling pillar actually crushes what is under its tip.
5. A `world.serialize()` / `restore()` so "the world remembers" survives a scene change, not just a
   session. Everything needed is already flat typed arrays and pools.

---

## B3-enemies — `game/js/enemies/**` + `game/enemy-test.html` (2026-08-09)

**Built:** all nine enemies from DESIGN §4 including the boss, a procedural segmented
animation/rig system, shared AI sensing, a death/corpse/gib layer, enemy projectiles, an elite
drop, a data-driven difficulty director, and a visual test harness.

```
game/js/enemies/
  index.js          public API (below)
  registry.js       id -> def table + spawnEnemyById (exists to break a unit<->index cycle)
  base.js           defineEnemy / makeEnemy: action+telegraph state machine, damage, death, render
  rig.js            bones, pooling, solve, draw, glow, silhouette mode
  ai.js             ledge/gap/wall/hazard probes, walkToward, flyToward, targeting, think budget
  fx.js             hit reactions, gibs, corpses, the five death flavours, SFX keys
  projectiles.js    tracking bolt, burning glob, slime blob
  pickups.js        spell shard
  director.js       encounters + pressure, MOVEMENTS/THREAT tables
  units/*.js        husk sporeling thornhound gloamarcher stonewarden wispmaw
                    oozelord sunderwraith theseam
  testbed/world.js  TEST-ONLY stand-in for sim/ (see "Gotchas")
game/enemy-test.html
```

### Public API — exact signatures

```js
import {
  ENEMIES, ENEMY_IDS, spawnEnemy, createDirector, initEnemies,
  raiseCorpse, findCorpses, isRaisable, countEnemies, despawnAllEnemies,
  setSilhouette, silhouette, MOVEMENTS, THREAT, SFX,
} from './enemies/index.js';

ENEMIES                                   // id -> frozen-by-convention definition
ENEMY_IDS                                 // ['husk','sporeling',...,'theseam']
initEnemies(world)                        // idempotent; binds the world + defines the 'spore'
                                          //   surface kind. spawnEnemy calls it for you.
spawnEnemy(world, id, x, y, opts) -> entity | null
createDirector(world, opts) -> { update(dt), spawnWave(spec, o), spawnElite(id,x,y,o),
                                 spawnBoss(x,y,arena), setMovement(name), setIntensity(k),
                                 set(key,val), clear(), reset(), config, stats }
```

**`x, y` passed to `spawnEnemy` is the FOOT position**, not the centre — level authors think in
ground lines and the atlas props use foot anchors, so enemies match. Flyers are placed by their
centre-ish foot too; pass a y well above the ground for them.

`spawnEnemy` opts: `{ team=1, scale=1, hp, hpMul, faceX, spawnIn, cd, xp, owner, gen, arena }`.
`spawnIn: true` gives a 0.55s fade-in-from-the-tear entrance with particles and 0.35s of i-frames.

### The nine enemies

| id | hp | w×h | speed | role | attack (wind/act/recover, cd) | tell colour | world interaction |
|---|---|---|---|---|---|---|---|
| `husk` | 30 | 30×62 | 66 | fodder | swipe 0.45/0.14/0.34, cd 1.05, 9 impact, r34 | sickly green | leaves a corpse |
| `sporeling` | 12 | 26×32 | 158 | swarm | lunge 0.36/0.22/0.28, cd 1.5, 7 decay | acid green | death cloud pours `'spore'` surface |
| `thornhound` | 46 | 60×40 | 130 | rusher | charge 0.52/1.5/0.55 cd 2.2 (15 impact, 620 force); bite 0.38 cd 0.9 | hot red | breaks props/terrain it slams into, stuns itself |
| `gloamarcher` | 26 | 28×66 | 96 | ranged | loose 0.62/0.1/0.42 cd 2.0 (tracking bolt, 11 void); kick 0.35 cd 1.6 | violet | perches on ledges, never melees |
| `stonewarden` | 240 | 68×92 | 54 | armour | slam 0.72/0.16/0.62 cd 2.4 (30 impact, r132, **terrain crater**); smash 0.55 cd 0.9 | furnace orange | punches through walls and props instead of pathing round |
| `wispmaw` | 34 | 48×42 | 128 | flyer | drop 0.44/0.12/0.4 cd 2.1 (burning glob) | ember orange | glob ignites the surface layer and scorches terrain |
| `oozelord` | 190 | 66×62 | 74 | **elite** | spray 0.5/0.3/0.45 cd 3.0 (5 slime blobs); slam 0.46 cd 2.2 | slime green | pours real `'slime'` constantly; splits; drops a spell shard |
| `sunderwraith` | 130 | 40×88 | 168 | **elite** | rend 0.45/0.16/0.5 cd 1.9 (19 void, r62) | magenta | `collides:false` — moves THROUGH terrain, scorches a scar as it passes; drops a shard |
| `theseam` | 2600 | 150×330 | — | **boss** | lash / grasp / drag / birth / rain (see below) | magenta | **tears the arena down** via `world.collapse` |

Every wind-up is **≥ 0.35s, enforced structurally** in `defineEnemy` (`a.wind = max(0.35, …)`), so a
unit file cannot ship an unreadable attack. A wind-up is three simultaneous cues: the pose, the
`tell` colour bleeding into flagged bones plus a halo and a real light, and inward-gathering
particles in the tell colour. Verified in-page: `TELEGRAPH_VIOLATIONS 0`.

**Armour** (`stonewarden` only): `def.armour = { min: 24, types: [DAMAGE.ACID], mul: 0.5 }`. Under
`min` the hit is *fully* refused and sparks off the plate with an `armour_ping`; over it, anything
not in `types` is halved. Acid and heavy impact are the answers, exactly as DESIGN says.

### The Seam — boss

Four phases keyed to hp fraction: **1 widening** (100%), **2 grasping** (≤72%), **3 collapse**
(≤44%), **4 unmaking** (≤16%). Each transition is a 2.4s invulnerable `shift` — hitstop, flash,
shockwave, `bus.emit('boss:phase', {entity, phase, name})` — and it **collapses a share of the
arena**: 28% of the arena props at phase 2, 42% at phase 3, 75% at phase 4, staggered 0.13s apart
so the support graph cascades rather than snapping. Props within 130px of the player are skipped so
nothing lands on their head unannounced. Death collapses everything still standing.

Actions: `lash` (a sweeping void beam that carves terrain where it lands), `grasp` (an arm comes out
of the tear and slams the player's ground position — 165px crater, `terrain:true`, plus a pulsing
floor marker during the wind-up), `drag` (breathes in: debris, props and Rook are pulled toward the
tear), `birth` (vomits adds; the table widens per phase), `rain` (phase 4 only, shards fall across
the arena). Phase 2 also spawns an oozelord, phase 3 a sunderwraith.

```js
director.spawnBoss(x, y, { x, y, w, h })   // arena rect; props inside it are the teardown set
// or: spawnEnemy(world, 'theseam', x, y, { arena: { x, y, w, h } })
```
If you pass no `arena` it uses a 1800×900 box around itself. **The level agent should pass the real
Glyphglade arena rect**, and should build that arena out of supported props (`supportedBy`) — the
teardown is only as good as the support graph underneath it.

Boss state for the UI: `e.data.boss === true`, `e.data.bossName`, `e.data.bossPhase` (1–4),
`e.data.phaseName`. Events: `boss:spawn {entity,id,name,hp}`, `boss:phase {entity,phase,name}`,
`boss:dead {entity,id,x,y}`.

### THE CORPSE CONTRACT — Gravewake reads this

`husk` is currently the only enemy with `leavesCorpse: true` (and not if it died burning —
`corpseIf`). A corpse is:

```js
kind: 'corpse', tag: 'corpse', team: 2, trigger: true      // NOT targetable
data = {
  corpse: true,
  from: 'husk',        // enemy id — raise it back as the same creature
  raisable: true,      // false once raised or fully rotted
  raised: false,
  decay: 1 -> 0,       // over data.decayTime (90s default), then it despawns itself
  facing: -1 | 1,
  hpBase: <maxHp of the creature it came from>,
}
```

Because corpses are not targetable, **a query must pass `targetable: false`**:

```js
world.queryRadius(x, y, r, { kind: 'corpse', targetable: false })
```

Use the helpers instead — they filter out already-raised and rotted bodies:

```js
findCorpses(world, x, y, r, out) -> [corpse, ...]   // nearest first
isRaisable(entity) -> bool
raiseCorpse(world, corpse, { as, hpMul = 0.6, scale = 0.92, tint, life, owner }) -> entity | null
```

`raiseCorpse` despawns the corpse and returns the **same enemy definition on team 0**, with
`data.raised = true` and a green tint. There is no separate minion type: an allied husk uses
`findTarget`, which returns the nearest team-1 entity instead of Rook. `bus.emit('corpse:raised',
{entity, from, x, y})` fires. A corpse also emits `corpse:spawn` when it lands.

BONE props (`skull_pile`) are the sim's, not mine — Gravewake should handle those through
`world.queryProps` + `world.breakProp`, and can spawn a raised husk with
`spawnEnemy(world, 'husk', x, y, { team: 0, hpMul: 0.5, spawnIn: true, xp: 0 })`.

### Director — the data format

```js
const dir = createDirector(world, {
  movement: 'thornmere' | 'sunderwood' | 'ruinreach' | 'glyphglade',   // picks a preset
  intensity: 1,          // global multiplier on budget / maxAlive / rate
  pressure: true,        // the off-screen trickle; false = authored encounters only
  budget: null,          // threat points allowed alive at once (null = from the movement)
  maxAlive: null,
  perMinute: null,
  table: null,           // override the spawn table
  spawnRadius: [640, 1180],
  onSpawn(entity, id) {},
  encounters: [ /* below */ ],
});
dir.update(dt);          // call once per fixed step from the play scene
```

`MOVEMENTS` (exported, edit freely — it is data):

| movement | table | budget | maxAlive | perMinute |
|---|---|---|---|---|
| thornmere | husk×2, sporeling | 4 | 5 | 5 |
| sunderwood | husk, sporeling×2, thornhound, wispmaw | 9 | 9 | 11 |
| ruinreach | husk, thornhound, gloamarcher, stonewarden, wispmaw | 15 | 12 | 14 |
| glyphglade | husk, thornhound, gloamarcher, wispmaw, sporeling | 20 | 14 | 16 |

`THREAT` is the per-head cost that the budget is measured in (husk 1 … oozelord 7, wraith 6).

An encounter is authored, positional and fires once:

```js
{
  id: 'ruin-ambush',
  x: 4200, w: 300, y: undefined, h: 400,      // trigger band in world space
  trigger(world, player) { return … },        // or a predicate instead of x/w
  onStart(world, director) {},
  waves: [
    { delay: 0,   spawn: [{ id: 'husk', n: 3, at: 'ahead', spread: 90 }] },
    { delay: 2.2, spawn: [{ id: 'thornhound', n: 1, at: 'behind' },
                          { id: 'wispmaw',    n: 1, at: 'above' }] },
  ],
}
```

Spawn spec fields: `{ id, n, at: 'ahead'|'behind'|'above'|[dx,dy], spread, stagger, hpMul, scale,
team, faceX, spawnIn }`. `at` is resolved off-screen and snapped to the ground with `world.groundY`;
flyers default to `'above'`. Elites are **not** in the pressure tables on purpose — place them with
`dir.spawnElite('oozelord', x, y)` so the level author owns where they appear.

### Audio keys emitted (all silent stubs today)

`enemy_hurt enemy_die elite_die enemy_gib corpse_flop armour_ping gravewake_raise shard_pickup
bolt_hit glob_splash slime_splat ooze_split sporeling_burst hound_slam stone_break`
plus, per action, `<sfx>_wind` on the wind-up and `<sfx>` on the release, where `<sfx>` is:
`husk_swipe sporeling_lunge hound_charge hound_bite archer_loose warden_slam warden_smash
wisp_drop ooze_spray ooze_slam wraith_rend seam_lash seam_grasp seam_drag seam_birth seam_rain`,
and the boss extras `seam_slam seam_phase seam_death`.

### The rig system (if you need to draw a creature)

```js
import { buildRig, acquireRig, solveRig, drawRig, glowRig, beginPaint,
         setSilhouette, wobbleChain, ik2 } from './rig.js';
```
A definition's `parts` array compiles once into flat typed arrays. Per part:
`{ n, p, ax, ay, len, w, h, sh:'bar'|'disc'|'blob'|'streak', col, a, add, tell, glow, layer, gib, rel, rest }`.
`len > 0` spans from the origin along the bone; `len === 0` is centred on it.

**Angles are ABSOLUTE by default** (0 = forward, +π/2 = down, −π/2 = up) — a pose function says
"this arm points down" and means it, regardless of the torso. `rel: 1` opts a bone into inheriting
its parent's rotation, which is what joint bends (shins, forearms, jaws) and trailing chains
(tendrils, cloaks, tails, boss arms) want. This was originally relative-everywhere and every limb
inherited the torso's lean; if a limb ever points somewhere absurd, check `rel` first.

`setSilhouette(true)` forces every bone to near-black, drops all additive/glow parts and all lights,
and gibs/corpses/projectiles honour it too. That is the readability test; it is a button in the
harness and `?sil` on the URL.

### Test harness — `game/enemy-test.html`

```
?enemy=stonewarden&n=6      spawn a group
?lineup=1                   one of every enemy, camera framed to fit  (?lineup=husk,wispmaw)
?stage                      clean flat lit platform, no props — the rig inspection rig
?idle                       spawned enemies hold position (actions still run)
?focus                      lock the camera on the first spawned enemy / the boss
?zoom=11 &gap=250 &at=400   framing
?attack                     trigger every enemy's next action 0.4s in (cycles through its actions)
?boss=1..4                  summon the Seam already at that phase
?corpses                    spawn husks and kill them, for Gravewake work
?director&movement=ruinreach&intensity=1.5
?sil                        SILHOUETTE MODE
?sim=1                      run against the real sim/ instead of the test-bed world
?preserve=1&dpr=1           REQUIRED for tools/shot.mjs (see A1 gotcha 10)
```
Buttons for all of it, plus a damage row (one per damage type), AABB and support-graph overlays.
Keys: 1–9 spawn, T attack, K kill, G raise the nearest corpse, B summon the boss.
`window.__enemy = { world, spawn, attack, kill, damage, boss, phase, sil, stats, director }`.

### Verified

- 34 enemies of six kinds live: **60 fps, 7 draw calls, ~1000 sprites, 46 lights** under headless
  SwiftShader (software). Zero allocation in the AI hot loop; expensive senses are gated behind
  `thinkNow(world, e, period)`, which offsets by `e.id` so the crowd never thinks on the same frame.
- Silhouette pass at 1440×900: all nine read as distinct black shapes.
- Corpse → `findCorpses` → `raiseCorpse` → allied husk fighting for the player.
- Boss phases 1–4, arena teardown cascading, beam and grasp.
- Portrait 390×844 and landscape 1440×900.
- `TELEGRAPH_VIOLATIONS 0`.

### Stubbed / not done — be honest

- **`game/js/enemies/testbed/world.js` is a stand-in for `sim/`.** When I started, `sim/index.js`
  did not exist. It implements the documented surface (entities, damage/damageArea/explode,
  queries, terrain grid + carving, props with a real support graph and break chain, debris,
  statuses, surfaces, a simple Rook) faithfully enough to prove the enemies, and the harness uses it
  by default. **The enemy module itself never imports it** — only `sim/API.md` calls are used. When
  B1's world is stable, run the harness with `?sim=1` and fix whatever differs. The one place I
  expect friction: `world.addProp` / `world.addTree` / `world.collapse` are documented on the world
  but B1's `world.js` currently exposes props under `world.props.*`. **REQUEST below.**
- No sound. No hit-pause tuning against real spells. No enemy health bars (UI agent's).
- `sunderwraith` phases through terrain but does not path *intelligently* through it — it flies the
  straight line to Rook, which is the design, but it can end up hovering inside a thick wall
  drifting slowly. It takes half damage there and cannot attack, so it is not a stalemate, but it
  looks odd.
- The `oozelord` split children inherit `hpMul` through an explicit `hp` — if the level agent scales
  elite hp globally, scale it via `hpMul` and the children will not follow. Fix by reading
  `e.maxHp` in `split()` (it already does) but the *first* generation's threshold is set at spawn.
- The boss's four arms all emerge from the same root point. It reads fine because only one is out at
  a time, but two simultaneous grasps would look wrong.
- No difficulty response to how well the player is doing — the director is positional and budgeted,
  not adaptive. That is deliberate for a handcrafted level; add it in `census()` if wanted.
- `theseam` does not fight back while `shift` is running (it is invulnerable for 2.4s). If that
  feels like dead air in play, give it a `rain` during the shift.

### Gotchas — read before filing a bug

1. **`d.phase` is the ACTION phase** (0 wind, 1 active, 2 recover), owned by `base.js`. The boss's
   fight phase is `d.bossPhase`. Colliding those cost me a debugging pass.
2. **`R.blob` is a soft radial falloff, not a filled circle.** Body masses drawn with it render as
   smudges that vanish under low light. Solid shapes use `sh: 'disc'`; `blob` is for glow only.
3. **Colours are squared by the renderer.** A base albedo of 0.15 is nearly black once lit by a
   moonlit ambient. Enemy bodies sit around 0.19–0.30 and still need a key light in the scene —
   if the sim's scene has no warm source near the fight, the enemies will read as silhouettes.
4. **Additive parts draw after all normal parts within a layer** (A1 gotcha 2), so a glowing eye is
   always on top of the head. That is what you want; do not fight it.
5. Entity `data` is wiped on spawn, so pooled entities cannot carry closures cheaply. All shared
   callbacks (gibs, corpses, projectiles, pickups) read the world from a module-level `_w` set on
   spawn. **There is exactly one world at a time**; if that ever stops being true, this breaks.
6. `world.damageArea` with `team:` set to the *opposing* team is how an enemy attack avoids hitting
   its friends. `team: e.team === 1 ? 0 : 1` appears in every unit's `fire()` — a raised minion's
   attacks correctly hit team 1.
7. Flyers must be spawned well above the ground: `spawnEnemy` treats `y` as the foot, and a
   `gravity: 0` creature placed on the floor will drift up slowly and look broken for a second.
8. `walkToward`'s `ledgeStop: true` makes a walker refuse to leave a platform. The stonewarden uses
   it (it cannot jump). Without it, a non-jumper turns round at every edge, which looks twitchy.
9. The director's `at: 'ahead'` uses the player's velocity sign, so a player standing still always
   gets spawns on their right. Pass explicit `[dx, dy]` when placement matters.
10. `initEnemies(world)` defines the `'spore'` surface kind. If a sporeling dies before it has been
    called, `world.surfaces.pour('spore', …)` is a silent no-op. `spawnEnemy` calls it, so this only
    bites if something spawns a sporeling by another route.

### Next, with another hour

- Re-verify everything against the real `sim/` (`?sim=1`) and delete the test-bed world once it
  passes; it is ~1300 lines of duplicate surface area that will rot.
- Group behaviour: husks currently converge on Rook individually. A cheap "flank slot" reservation
  would stop three of them standing in the same pixel.
- A stagger/parry reaction distinct from the hurt squash, so heavy spells feel different from light.
- The stonewarden's overhead slam wants a held frame at full extension (currently it eases straight
  through the apex).

### REQUEST — things I need from other modules

- **sim:** `sim/API.md` §8 documents `world.addProp / addTree / defineProp / damageProp / breakProp /
  igniteProp / collapse / solveSupport / supportEdges` **on the world object**. `world.js` currently
  keeps them under `world.props.*`. The boss's arena teardown calls `world.collapse(prop, delay)`
  and `world.queryProps(x, y, r, out)` directly, per the doc. Please either expose the documented
  aliases or say so in your section and I will be wrong in the handoff rather than in the code.
- **sim:** confirm `world.surfaces.define(def)` accepts a new kind at any time (I define `'spore'`
  lazily on first `initEnemies`), and that `world.surfaces.kinds` is a Map — I feature-detect it.
- **spells (Gravewake):** the corpse contract above is final unless you tell me otherwise. If you
  need a corpse from more than the husk, say which and I will set `leavesCorpse` on them.
- **level:** pass the real Glyphglade arena rect to `spawnBoss(x, y, arena)`, and build that arena
  from props wired with `supportedBy` — the boss's signature only works if the support graph exists.
- **ui:** boss bar from `e.data.bossName / bossPhase / phaseName` and the `boss:*` events; XP from
  `enemy:died` + the dead entity's `data.xp`.

### Addendum — the other modules' key dialect (written after B/C-wave modules landed)

`sim/`, `spells/`, `enemies/` and `ui/` landed while this was being built, and they name their
sounds with **underscores and short creature words** (`warden_slam`, `hound_charge`,
`spell_emberbolt_fork`, `enemy_hurt`) rather than the dotted convention above. Rather than ask four
agents to rewrite their call sites, **the resolver now speaks that dialect natively** — no changes
were made outside `core/audio/`.

- `spell_<id>_<event>` → `spell.<id>.<event>`, with the full synonym set they actually use
  (`fork finale launch strike erupt impale crush implode detonate arrive raise consume shrapnel eat
  release crack slam windup fade drip burn`).
- `<creature>_<event>` → `enemy.<id>.<event>` via a short-name table
  (`husk minion sporeling spore hound archer warden wisp ooze elite wraith seam boss`), e.g.
  `hound_charge → enemy.thornhound.tell`, `archer_loose → enemy.gloamarcher.attack`,
  `seam_birth → enemy.theseam.spawn`.
- Explicit aliases for the remainder: `armour_ping → metal_dent`, `metal_ring → metal_clang`,
  `bolt_hit → impact.hard`, `glob_splash → spell.@fire.impact`, `slime_splat → flesh_hit`,
  `ooze_split → flesh_burst`, `sporeling_burst → enemy.sporeling.death`,
  `gravewake_raise → spell.gravewake.impact`, `shard_pickup → ui.pickup_shard`,
  `level_up → ui.levelup`, `level_up_circle → ui.spell_learn`, `spell_fizzle → player.focus_low`,
  `spell_acid_drip → acid.loop`, `explode → explosion.small`, `jump → player.jump`.

**All 105 keys those four modules emit were enumerated from their source and confirmed to resolve to
a characterful sound** — none falls through to the generic last resort.

One deliberate compromise: `enemies/fx.js` emits `enemy_hurt` / `enemy_die` / `elite_die` /
`enemy_gib` / `corpse_flop` with **no creature id** (`fx.js:50,99,167,229` pass only `{x, y}`), so
they cannot be given the right voice. They therefore resolve to *body* sounds —
`flesh_burst`, `impact.heavy`, `gib`, `flesh_hit` — while the correct **per-creature death voice is
played by the `enemy:died` bus hook**, which does get `payload.tag` (`base.js:66` sets
`tag: def.id`). The two layer rather than double: a body burst under the creature's own dying sound.
`enemy_hurt` is the one that loses out — it resolves to `enemy.husk.hit` for every creature.

**REQUEST (enemies):** replace `SFX.hurt`/`SFX.die` with `'enemy.' + e.tag + '.hit'` /
`'.death'`, and add `audio.sfx('enemy.' + def.id + '.tell', {x, y})` on the telegraph and
`'.spawn'` on spawn. All 48 of those keys exist and are per-creature. That single change is the
biggest audible upgrade available for the least work — a stonewarden currently grunts like a husk
when hit.

---

## B4-ui — `game/js/ui/**` + `game/ui-test.html` (2026-08-09)

**Built:** the whole HUD and every menu — five cast circles, health/focus/XP, damage numbers,
speech bubbles, boss bar, toasts, level-up moment, pick-1-of-3 spell cards, loadout/assign, pause,
settings, death, and first-class portrait touch controls. Verified at 1440×900 and true 390×844,
with **real CDP touch emulation**, not by imagining it.

```
game/js/ui/
  index.js      createUI(ctx) — orchestrator, public API, bus wiring, the spells/system.js binding
  theme.js      palette, type scale, canvas primitives (cached gradients, rgba, fonts, numerals)
  state.js      the mirrored model + settings persistence (localStorage 'sunderfall.settings.v1')
  layout.js     every rect in CSS px, recomputed only on resize; circle hit-testing
  circles.js    the five cast circles + icon bitmap cache + spark pool
  hud.js        contrast wash, crest/HP/focus/XP, boss bar, toasts, screen states, level burst
  world.js      pooled damage numbers + world-anchored speech bubbles
  touch.js      virtual stick, jump/aim arbitration, input zone registration
  overlays.js   the DOM half: pause, settings, loadout, cards, level-up, death
  icons.js      18 fallback spell icons + a fallback spell table
  ui.css        injected by index.js; everything namespaced under #sf-ui
game/ui-test.html   the harness (drives every state, over a real painted backdrop)
```

### Why it is split DOM / canvas

- **Canvas overlay** (`#sf-canvas`, `position:fixed`, `z-index:5`, `pointer-events:none`): cast
  circles, bars, boss bar, damage numbers, toasts, speech bubbles, virtual stick. These need
  per-frame animation, additive glow and world-anchored positions — all painful in DOM.
- **DOM** (`#sf-ui`, `z-index:6`): pause, settings, loadout, spell cards, level-up, death. These
  need text layout, wrapping, scrolling, focus order and keyboard/AT behaviour — all painful on a
  canvas, and all free in DOM.

Nothing draws through `R`. The UI works with a dead or absent renderer, which is exactly what
`ui-test.html` exploits: it boots the real `core/` modules with **no WebGL context at all**.

Both mount inside `#ui-root` but use `position: fixed`, because `#ui-root` has safe-area *padding*
and an absolutely-positioned child would be inset by it. Safe-area insets are applied deliberately
in `layout.js` from `view.safe` instead.

### Public API — `createUI(ctx) -> ui`

`main.js` already probes `./ui/index.js` for `createUI`. Matches exactly; returns synchronously.

```js
ui.update(dt)            // call in the fixed step, after input.update()
ui.render(alpha)         // call in the render pass; it derives its own REAL dt internally, so UI
                         // animation does not slow down during hitstop

// --- state (all optional; the sim may use none, some, or all of these) ---
ui.setStats({hp, maxHp, focus, maxFocus, level, xp, xpNext, kills, broken, runTime, ...})
ui.setSource(fn)         // pull adapter: fn() runs every tick and may mutate ui.state directly
ui.setLevel(n, silent)
ui.setSlot(i, spellId|null, rank)
ui.setRank(spellId, rank)
ui.setCooldown(i, secs, maxSecs)
ui.learn(spellId, rank)
ui.onCast(i, {cost, cooldown})     // fire the presentation for a cast the sim already performed
ui.tryCast(i) -> bool              // player-driven attempt; plays the refusal if it can't go

// --- feedback ---
ui.damage(worldX, worldY, value, kind)   // kind: 'hit'|'crit'|'heal'|'focus'|'player'|'break'
ui.toast(text, {value, kind, life})      // kind: 'shard'|'spell'|'heal'|'gold'|'break'|'warn'|'info'
ui.say({who, text, dur, x, y, ax, ay, anchor})   // x/y are WORLD coords; see below
ui.boss({name, subtitle, hp, maxHp, phases})  / ui.boss(null)  / ui.bossDamage(hp)
ui.levelUp(level, unlockText)
ui.offerSpells([id|def, …]) -> Promise<id|null>

// --- screens ---
ui.setPaused(bool)  ui.togglePause()  ui.paused
ui.death({level, runTime, kills, broken})
ui.setTouch(bool)        // force the on-screen controls on/off (null = auto)
ui.setVisible(bool)      // the scene machine drives this; see the intro gotcha
ui.setDemo(bool)         // harness only: auto-fire the circles so the HUD is alive
ui.reset()  ui.destroy()

// --- read ---
ui.state   ui.slots   ui.settings   ui.layout   ui.spells   ui.bubbles
```

**Speech bubbles:** `ui.say()` takes the **exact shape story/script.js already uses** —
`{who, text, dur, anchor, ax, ay}` — and looks `who` up in `SPEAKER` (via `ctx.story`), so
Rook is a hard angular panel with clipped typing and Vayne is a trembling parchment lit from
inside. `x`/`y` are world coordinates; pass `anchor: () => ({x, y})` instead and the bubble tracks
a moving actor every frame. `bus.emit('story:beat', beat)` does the same thing with no import.
Bubbles clamp themselves inside the safe play area and stretch their tail rather than leave frame.

### Bus events

**Listened for** — `player:damage {amount|hp, maxHp, x, y}`, `player:heal`, `player:level
{level, unlockedCircle|unlock}`, `player:died`, `spell:cast {slot, id, cost, cooldown}`,
`spell:hit {x, y, damage, crit}`, `spell:learn {id, rank}`, `spell:levelup {id, rank}`,
`spell:ready {system}`, `spell:offer`, `enemy:died {xp}`, `terrain:break`, `prop:break`,
`pickup {kind, text, value}`, `story:beat`, `scene:change`, `intro:done`, `view:change`.

**Emitted** —

| event | payload | meaning |
|---|---|---|
| `ui:ready` | `{ui}` | the HUD exists |
| `ui:cast` | `{slot, spellId, cost, auto:true}` | the player pressed a cast circle. **`auto:true` means no aim point was supplied — use auto-aim** (see gotcha 3) |
| `ui:pause` | `{paused}` | **the sim must honour this**; the UI cannot stop the sim itself |
| `ui:assign` | `{slot, spellId}` | loadout change |
| `ui:spell-chosen` | `{id, rankUp}` | a card was taken |
| `ui:settings` | `{key, value, settings}` | a setting changed |
| `ui:aim` | `{x, y, active}` | drag-to-aim on the right flank, in CSS px |
| `ui:restart` / `ui:quit` | `{}` | death/pause buttons |

### It binds itself to `spells/system.js` — read this before touching progression

`B2-spells` owns circles, focus, XP, levels and the offer. The HUD detects the system (at boot via
`ctx.spellSystem`, or on `bus 'spell:ready'`) and **stops simulating anything**: `ui.setSource()`
is pointed at a mirror that pulls `S.circles / S.focus / S.level / S.xp / S.known` every fixed
step. `ui.setSlot()` forwards to `S.setSlot`/`S.clearSlot`. `spell:offer` builds the cards and the
choice calls `S.chooseOffer(index)`. Verified live in `game/index.html`: bound, mirroring, 60 fps.

Without a system bound the HUD runs its own mirror instead (focus regen, cooldowns ticking,
optional demo auto-cast) so it is never a still image — that is what the harness uses.

`circle.blocked === 'reserved'` (auto-cast refusing to eat slot 1's next cast) gets its **own**
visual — gold ring plus three chevrons — deliberately different from "out of focus", because those
are different problems and the player has to tell them apart.

### The focus story, which is the point of the HUD

Three devices teach the loadout puzzle with no tutorial text:

1. a **notch** on the focus bar at slot 1's cost; the stretch below it goes red when unaffordable;
2. **bites** — an auto-cast tears a school-coloured chunk out of the bar where it was spent, and it
   shrinks away, so you watch circles 2–5 eating your bar. Under the bar, one pip per auto-slot
   sized by its share of the pool, flashing when it fires, labelled `AUTO`;
3. a **net-rate readout**: `+12` cyan, or a red `−10.6` when the autos out-spend regen. The pause
   screen spells the same number out and adds an amber line: *"Your circles are outspending you."*

A starved circle also fills with cyan like a glass filling with focus, and its cost number goes red.

### Touch — verified with real `Input.dispatchTouchEvent`, not by eye

Zones are registered stick → act → circles (the engine resolves overlaps last-registered-first).
Slot 1 is registered with action `'cast'`, so existing sim plumbing works untouched; slots 2–5 and
the right flank register the **non-existent action `'ui'`**, which the engine safely ignores while
still stopping a free-pointer world cast — that is intentional, not a bug.

Measured behaviour at 390×844 with touch emulation on:

| test | result |
|---|---|
| stick materialises where the thumb lands, drives `axisX` | 0.97, `held('right')` true |
| release | axis back to 0 |
| press slot 1 | `ui:cast {slot:0}` fired, cooldown started |
| tap right flank | `jump` held, then released |
| drag right flank | `input.pointerScreen` written, **no** jump |
| tap a locked circle | refusal animation |

Layout: slot 1 is 88 px across at the thumb rest, slots 2–5 on a 112 px arc at 98°/131°/164°/197°.
`settings.leftHanded` mirrors the whole thing.

### Stubbed / not done — be honest

- **No sound.** Nothing calls `ctx.audio`. Every UI interaction should have one: circle press,
  refusal, card hover/pick, level-up, toast, pause open/close. `C1-audio` shipped keys; wiring them
  is 30 minutes and is the single biggest remaining upgrade here.
- **No gamepad navigation of the menus.** Keyboard works (Esc, 1–5, 1/2/3 and arrows on the cards);
  a pad cannot move focus.
- **No minimap, no objective marker, no interaction prompt** ("press E to…"). The sim will want the
  last one; `ui.say()` with a short `dur` is a passable stand-in until then.
- **No settings for key rebinding** and no language/locale layer. Strings are inline in English.
- **`settings.master/music/sfx` are stored and emitted but nothing consumes them** — `core/audio.js`
  should listen for `ui:settings` (or read `ui.settings`) and apply them.
- The **XP denominator** is assumed to be `S.xp + S.xpToNext`. If `xpToNext` is a total rather than
  a remainder the ring will be wrong; one line in `bindSpellSystem` in `index.js`.
- Only tested in Chrome.

### Gotchas — the expensive ones

1. **`Page.captureScreenshot` hangs while ANY canvas element exists on the page** in this headless
   setup — not just an animating WebGL one, a *static 2D* canvas hangs it too. `tools/shot.mjs`'s
   `--canvas` path is no help either: a full-res PNG data URL is ~10 MB and the CDP WebSocket never
   delivers it. Two working paths, both built into `ui-test.html`:
   - `?comp=1` folds the UI canvas into `#game`, then read `#game.toDataURL()` back **in slices**
     (600 KB at a time) over `Runtime.evaluate`. Full resolution, canvas content only.
   - `?flat=<seconds>` composites everything into a mid-res JPEG, pins it as the stage background
     and removes both canvases — after which plain `tools/shot.mjs` works and captures the live DOM
     overlays on top. Use this for cards/pause/death/level-up.
   A **full-resolution** data URL used as a CSS background wedges the software rasteriser for
   minutes. 1500 px wide is the ceiling that stays instant.
2. **The intro would be painted over by the HUD.** `#intro-root` has no `z-index` and the HUD needs
   one to sit above the WebGL canvas. So the UI starts **hidden** whenever `ctx.scenes` exists and
   only shows on `scene:change` to `play`/`gameover` (or `intro:done`). If you add a scene and the
   HUD vanishes, that is why.
3. **A cast fired from the slot-1 circle has no aim point.** `core/input.js` only updates
   `pointerScreen` for pointers that hit no zone, so a press on the circle leaves `input.aim` at
   wherever the mouse last hovered — which on desktop is the HUD itself. `ui:cast` carries
   `auto: true` to say "the player did not aim this; use auto-aim". Honour it.
4. **Drag-to-aim writes `input.pointerScreen` directly**, because that is the only supported way to
   move `input.aim` from outside — `input.update()` rebuilds `aim` from `pointerScreen` every tick.
   It lands one tick late. See the REQUEST below.
5. **The UI wraps `R.fx.shake/flash/chroma`** so the screen-shake slider and the reduce-flashes
   toggle are real. Originals are restored in `ui.destroy()`. If you wrap them too, wrap after.
6. **`ctx.filter` is never used on the 2D context** — it forces a compositing layer every frame and
   is a genuine frame-time cliff. Desaturation is done with alpha and tint instead.
7. **Icons are re-centred on their own alpha bounding box** the first time they are cached, so a
   spell that draws around the origin instead of into `(0,0)-(size,size)` still lands correctly.
   The cost is one `getImageData` per (spell, size, dpr) at first use, never per frame.
8. Gradients, rgba strings, fonts and integer strings are all cached; **nothing in the draw path
   allocates**. The gradient cache is keyed partly on coordinates and is dropped on resize.
9. `L.circles[i]` and `L.*` rects are **stable objects** — the input zone callbacks hold references
   to them. Never replace one, mutate it.
10. The harness backdrop is composited once per resize into an offscreen canvas and blitted; five
    2048-wide layers redrawn per frame is a real frame-time sink under software rasterisation.

### Verify it yourself

```
game/ui-test.html?clean=1&comp=1[&touch=1][&lv=20][&scene=thornmere|sunderwood|ruinreach|glyphglade]
   &state=<comma list of: demo dmgloop hits hurt starve fill levelup unlock choice choice2
                          pause settings assign death boss bosshit bubble toast cast touch>
   &flat=<s>   freeze+flatten for DOM shots     &stop=<s>   just freeze
   &lv= &hp= &focus= &xp=          &clean       hide the dev toolbar
```
Without `?clean` there is a button bar along the bottom with every state on it.

### REQUEST — things I need from other modules

- **engine (`core/input.js`)**: `input.setAim(screenX, screenY)` and a readable
  `input.stick = {active, ox, oy, x, y}`. I currently write `input.pointerScreen` directly and run
  my own passive `pointerdown/move/up` listeners on the canvas purely to know where the thumb
  landed, because the engine keeps `stickOx/stickOy` private. Both are read-only needs.
- **sim**: honour `bus 'ui:pause' {paused}` — the UI blocks its own input and freezes its own
  animation, but it cannot stop the world. Also honour `ui:cast {auto:true}` (gotcha 3), and
  `ui:restart` / `ui:quit`.
- **sim**: set `ctx.player = {x, y}` (or `ctx.sim.player`) so the level-up burst and any future
  world-anchored HUD can find Rook. It currently falls back to screen centre.
- **audio**: consume `ui:settings` for master/music/sfx, and give me a key list for UI sounds
  (press, deny, ready, card hover, card pick, level up, toast, pause) — I will wire them.
- **spells**: confirm whether `S.xpToNext` is remaining or total (see Stubbed).

### Next, with another hour

1. Wire `ctx.audio` into every UI interaction — the single biggest perceived-quality jump left.
2. An interaction prompt and an off-screen objective/enemy marker ring at the screen edge.
3. Gamepad focus navigation for the menus.
4. A first-run coach: the first time a circle unlocks, pulse it and hold a one-line bubble.

---

## A2b-art-pass2 — the lighting pass over A2's art (2026-08-09)

**Built:** one new module (`art/tools/light.js`) and a rework of every builder that consumes it,
plus a rewritten `art/tools/scene.js`. Nothing was re-generated from Flux — `art/raw/` is untouched.
This pass answers the round-1 blind critique (`CRITIQUE.md`, scored 4 / 4 / 4.5 against 9 / 8 / 8).

Payload **7.83 MB** of 12 MB (was 7.67). `node art/tools/verify.js` → 0 errors, 0 warnings.

### The one idea

The critic's verdict was *"competently drawn asset kits arranged in an editor, not lit scenes."*
Everything below follows from fixing that literally: **there is now exactly one key light for the
whole game**, `light.KEY` — upper-left, `dir [0.62, 0.785]`, warm `[1.00, 0.86, 0.62]`, everything
that is not the key goes cool `[0.46, 0.62, 0.92]` — and **every prop, ledge, decal, debris chunk
and background element is lit to it at build time**.

```
art/tools/light.js          the whole lighting toolkit (new)
  KEY                       the single global key. Do not add a second one.
  sculpt(img, o)            bake form: broad key/shadow split, cool fill, contour rim,
                            cavity occlusion, bottom contact darkening
  pointRelight(img, o)      an emitter's effect on a neighbour, with falloff
  castShadow(img, o)        project a silhouette onto the ground along a light direction
  shadowOnto(dst, sh, ...)  multiply a shadow into a view, with a clip line
  pool / halo               a light's falloff on a surface / in the air (`wrap` for bands)
  soften(img, r, amt)       progressive edge softness with distance
  bandedHaze(img, ...)      discrete atmosphere plateaus instead of an airbrush ramp
```

`sculpt` is the load-bearing function. It combines a **silhouette-normal** term (from the gradient
of a blurred alpha field) with a **planar** ramp across the object along the light axis. The normal
term alone only lights a band as wide as the blur radius, so a wide trunk stays neutral through the
middle and still reads flat — which is exactly what the critic caught. `planar` (default 0.55) is
what guarantees a big tree is not the same value on its left and right edges.

Amounts are deliberately moderate (`keyAmt 0.40`, `shadowSide 0.55`). **What is baked is form, not
the dynamic light.** The runtime's 256-light buffer multiplies what is there; it cannot invent an
occluded crevice or a dark side, but it will fight a hard baked key.

### Defect by defect, against the ranked list

1. **No dominant light source — FIXED in the art.** `sculpt` applied to all 116 prop frames + 249
   debris chunks (baked *before* the cracked/chunk/settled cut, so the whole destruction chain
   inherits one light), all 21 ledges, all 21 decals, and every background element via
   `build_bg.js` `L(name, depth)` with per-depth strength (`DEPTH.far/mid/near`). The forest shafts
   were leaning the wrong way — they are flipped so they now come from the same upper-left as the
   key, and `scene.js` puts a cool ground pool where each shaft lands, so the drawn light finally
   lands on something.
2. **Local lights cast nothing — FIXED.** Emissive props (`brazier`, `lantern`, `lamppost`,
   `mushrooms`) carry an `emit` spec and are relit from their own emitter, so their bodies obey
   their own light. In a scene each entry in `SCENES[loc].lights` gets a squashed ground pool, a
   weak air halo, `pointRelight` spill onto every prop within 1.5× its radius, and a second short
   cast shadow thrown *away* from it. The thornmere lantern post also has a baked pool in the
   `near` band itself.
3. **No cast shadows or contact shading — FIXED, split between baked and drawn.** Baked: `sculpt`'s
   `contact` term darkens every object's bottom edge per column (not as a rectangle), and `cavity`
   darkens crevices from a luminance high-pass. Drawn: `scene.js` gives every prop a two-pass
   contact AO (tight near-black core + wide soft skirt — one soft blob alone reads as an airbrush
   smudge), a key-direction cast shadow, and every ledge and raised shelf throws its own shadow onto
   the ground below.
4. **Dead mid-ground — MOSTLY FIXED.** Every `mid` band now has a `midContent()` layer at
   knee-to-shoulder height: receding logs, bracken, fallen masonry, scorch, clumped with real gaps.
   Atmosphere is stepped by `depthHaze()` into three plateaus per band, **and** the depth stack is
   given real value separation between bands by `TONE` (far light + flat + desaturated, near dark +
   contrasty). Honest caveat below.
5. **Platform rectangles — FIXED.** Three ledges per kind became **seven** (`xs s m l xl jl jr`)
   with varied width, thickness, surface height and roughness; `addTopLip()` shoulders one end out
   of the top silhouette in the slab's own material; `addUnderFringe()` hangs roots and vines off
   the underside. `jl`/`jr` are capped at **one end only** and every scene drives one of them into a
   trunk or a cliff face so at least one platform per screen is structurally attached.
6. **One horizontal line + dead lower third — FIXED.** Every scene has two ground shelves with a
   cliff face between them; props are placed in clumps with real gaps; the camera dropped to
   `camY -380` so the soil cross-section is ~15% of frame, not 20%; and five to eight near-black
   foreground elements are cropped off the bottom edge. The ground run's lower body also goes much
   darker and picks up low-frequency strata instead of being an evenly lit texture swatch.
7. **Stamp repetition — PARTLY FIXED.** 3–4 variants for the seven most-scattered props
   (`ferns mushrooms bush rocks_small skull_pile rubble_heap crate`) and 3 per decal, each mirrored,
   rescaled and value-drifted, exposed as `atlas.json.variants`. Scatter is clumped, not stepped.
   Not done: hand-varying the two or three most prominent instances individually.
8. **No focal hierarchy — FIXED per scene.** One bright emitter sits directly against the
   near-black base of the hero object: cyan mushrooms against the oak's root mass (sunderwood),
   brazier against the pillar (ruinreach / glyphglade), lamp against the fence line (thornmere).
9. **Orphan saturated accents — FIXED.** A `tone` grade runs *before* lighting on
   `wall_brick boulder_big boulder_small rocks_small crate barrel fence log stump oak_trunk deadtree
   burnt_trunk tree_foliage* tree_small bush ferns` — roughly a 40–50% desaturation with a cool
   tint on the worst offenders (the orange rock face and the orange brick).
10. **Uniform hard edges at every depth — FIXED.** `soften()` at 3.2 / 1.6 / 0.7 px on far / mid /
    near. Sky and the `fg` occluder are untouched, so the foreground stays razor-crisp.
11. **Structureless backdrops — FIXED.** `skyStructure()` adds a moon (or a hazy sun in glyphglade)
    **placed at the key's origin so the light in the scene is motivated**, a cloud mass run through
    `sculpt` so it has a lit edge on the key side, and two heavily blurred low-contrast ridgelines.

### Deliberately NOT fixed, and why

- **The engine has not been re-tuned to this art.** `game/js/**` belongs to other agents this
  session and I did not touch it. I also could not get a frame out of
  `game/engine-test.html?bare&preserve=1&dpr=1` — headless CDP hung on the page while five agents
  were mid-edit. **The comparison frames in `refs/ours/` are `scene.js` output, not engine output.**
  Everything `scene.js` does is something the engine can do (soft pools, spill, per-layer haze,
  bloom) *except* projecting a cast shadow from a sprite silhouette — see REQUEST.
- **Hand-varied hero instances (defect #7's stronger form).** Variants are procedural mirrors and
  rescales. Genuinely hand-drawn alternates need new Flux rolls, which is a generation pass.
- **The three atmosphere plateaus are milder than the brief asked.** I built them hard first and it
  was worse: a full-width value step is a ruled line across the screen and reads as a renderer bug.
  They are now softened (`hardness 0.92`) and jittered in x by noise, and the real depth separation
  is carried by `TONE` between bands. If a future pass wants harder steps, the steps have to be
  *occluded by content* at the boundary, not drawn across open air.
- **Ground runs still repeat every 1024 px** and there are still only two variants per kind.
- **No portrait check.** Same gap A2 left.

### Gotchas — every one of these cost real time this session

- **Anything painted across a tiling band must be periodic in x.** `Band.glow()` was a radial
  clipped at the strip edge; because the strip tiles, that clip became a **hard vertical seam down
  the middle of the screen** that looked exactly like a torn texture. `glow()` now wraps, and
  `light.pool/halo` take `{wrap:true}`. I chased this for three rebuilds thinking it was the fog.
- **Band content was authored below the ground line.** `world(a) = anchorY + a*worldH/H[band]`, so
  world y = 0 sits at author y **384 / 480 / 564 / 712** for far / mid / near / fg. The near band's
  undergrowth was authored at 636 — 120 px underground, therefore invisible. There is now a `GY`
  constant in `build_bg.js`; place against it, never against `H[band]`.
- **`el_treeline_*` are 1536-px-wide panoramas with a SOLID RECTANGULAR BASE**, not objects. At the
  old fog levels the rectangle was invisible; with real value separation it appeared as a lit block
  with a hard vertical cut mid-frame. Horizon elements now get `trim → fadeBottom → fadeSides`.
- **A mirrored lit stamp carries mirrored light**, which is worse than the repetition it was meant
  to fix. Variants are built from the toned-but-**unlit** source, flipped there, then re-sculpted.
  Same rule in `scene.js` for any `flip:true` prop.
- **A two-pass box blur leaves piecewise-linear plateaus in its gradient**, which show up as blocky
  banding across any large flat form once you differentiate it. `facing()` uses three passes.
- **A crop leaves a ruled alpha line.** `tree_foliage`'s `cropBottom` drew a straight edge across
  the sky under the canopy. Cropped edges are now feathered, the crop is much smaller, and the
  composite draws the canopy *before* the trunk so the branches cover the join.
- **Ridgelines must be low-contrast and heavily blurred** (alpha 0.42/0.55, blur 14/7). My first
  attempt at "horizon logic" put two crisp ridges across the sky and they read as grey rectangles —
  the exact defect I was there to remove.
- **Stacking graded corrections goes black fast.** The near band already had a `tint [0.40,0.46,0.52]`
  from A2; adding `TONE.near` and `sculpt`'s `shadowSide` on top turned every near-band tree into a
  flat silhouette. Check the band in isolation (`art/work/dbg_*.png`) before blaming the composite.

### Public API — what changed for other agents

- `atlas.json` gains **`variants`**: `{ ferns: ["ferns","ferns_v1","ferns_v2","ferns_v3"], … }`.
  **Scatter code must pick from this list**, not stamp one frame repeatedly.
- `atlas.json.terrain.<kind>.ledge` gains `xs`, `xl`, `jl`, `jr`. `jl` is open on the **left** and
  `jr` on the **right**: place them so the open end is buried in a wall, cliff or trunk.
  `ledge.s/m/l` keep their meaning but their art is new (thicker, asymmetric, with root fringes).
- `atlas.json.decals` is now 21 entries (7 × 3 readings) rather than 7.
- `composites.tree_oak` canopy `dy` moved `-300 → -235` (and `tree_young` `-190 → -150`) so the
  canopy overlaps the trunk. **Draw the canopy part first and the trunk second.**
- Everything else in the contract is unchanged: same atlas names, same anchors, same band schema.
- `art/tools/build_all.sh` still rebuilds everything; it is now ~2.5 min (sculpt is the cost).

### REQUEST

- **To the renderer owner:** a **cast-shadow draw path**. Everything else in `scene.js` maps onto
  the existing API, but nothing in `R.*` can throw a sprite's silhouette onto the ground. The cheap
  version is enough: draw the same sprite again, tinted near-black at ~0.5 alpha, sheared by the key
  direction and squashed to ~0.26 in y, into `LAYER.TERRAIN_BACK`. `light.castShadow()` is the
  reference implementation. Contact and cast shadows are most of what stops art floating, and they
  are the one thing the art cannot bake for a mobile object.
- **To the renderer owner:** the key is now a real, fixed thing — `light.KEY`, upper-left,
  `dir [0.62, 0.785]`. Any global directional term, god rays (`R.fx.setRays`) or ambient gradient
  should agree with it, and warm/cool should follow `KEY.warm` / `KEY.cool`.
- **To whoever runs the next blind test:** `refs/ours/*.jpg` have been regenerated at the same five
  filenames from `bash` over `art/tools/scene.js` (mapping: ori→sunderwood cam 700, hollowknight→
  sunderwood cam 250, blasphemous2→ruinreach, thelastfaith→glyphglade, deadcells→thornmere). Re-run
  the same pairs. **The number that counts is still an in-engine frame**, not these.

### Next, with another hour

1. Get a real engine frame and re-tune the ambient against it — the art is authored near-neutral on
   purpose and the sunderwood set will still go solid blue under a strong blue ambient.
2. Hand-vary the two or three most prominent scattered instances per screen instead of instancing.
3. A scorched `forest` terrain variant for glyphglade and a mossy one for ruinreach; per-location
   terrain tint is still missing.
4. Push the mid-ground further: the band between the play plane and the horizon carries silhouettes
   now, but no *readable* landmark. One receding ruined wall or ridge per location would do it.

### Addendum — what the art actually looks like in the engine

I did get a frame out in the end. `game/engine-test.html?bare` does **not** show shipping art — that
page never loads `assets/atlas.json`; `?bare` only hides its own procedural scenery. The page that
shows the real art is **`game/sim-test.html`**, and `tools/shot.mjs` needs `--canvas` or
`Page.captureScreenshot` hangs forever on the animating WebGL canvas (A2 documented that; I lost a
run to it).

```
node tools/shot.mjs --url "http://localhost:8888/gms/2d/sunderfall/game/sim-test.html?preserve=1&dpr=1" \
     --out art/work/eng4 --size 1440x900 --at 3 --canvas
```

The frame is at `art/work/eng4/shot_1440x900_t3.png`. **The good news:** the braziers and lanterns
throw real warm pools onto the fence and ground at runtime, and the props read. **The bad news, and
it is A2's REQUEST restated with evidence:** the sunderwood ambient is so strongly blue and so dark
that the whole frame collapses to one hue and the bottom third goes to near-flat black — the exact
defect this pass was sent to remove. **That is a scene-tuning problem, not an art problem**, and
`game/js/**` was not mine to touch this session.

Whoever owns the play scene: tune the ambient against `refs/ours/ori_wotw_00.jpg`, which is what
this art is supposed to look like. The bands are authored near-neutral at `saturation 0.86` on
purpose, and they now carry baked value structure, so they will take a much lighter, much less
saturated ambient than they needed before. Do that before touching any PNG.

---

## D1-ground — the sub-ground void: `sim/terrain.js` + camera framing in `sim/index.js` (2026-08-09)

**Fixed:** the bottom ~30% of every gameplay frame was a flat near-black slab carrying no
information (`docs/shots/first-ingame-2026-08-09.png`). Both causes are gone. Before/after:
`docs/shots/first-ingame-2026-08-09.png` → `docs/shots/ground-textured-2026-08-09.png` and
`…-portrait-2026-08-09.png`.

**Cost: zero.** 60 fps, **12 draw calls**, 646 → 672 sprites (+4%, from finer depth bucketing), both
1440×900 and true 390×844. Measured with `--eval` on `R.stats` / `loop.fps`; B1's bar was 60 fps in
11–12 draw calls and it is unchanged. Payload cost is three 256×256 textures built at runtime from
pixels already in `terrain.png` — **no new files, no new download**.

### Cause 1 — texturing the mass

`atlases.terrain` has shipped `wall_forest` / `wall_rock` / `wall_stone` since A2 and nothing used
them; A2 filed the REQUEST and B1 asked for exactly this in its "Next, with another hour" list.

**The approach, and why.** The three options were per-cell textured quads, repeat-wrapped standalone
textures, or something else. I took the middle one with a twist: the frames are sub-rects of a
packed 2048×3724 page so they cannot be `REPEAT`-wrapped in place, so on first render each 256px
tile is **blitted out of the atlas page into its own power-of-two texture** via
`assets.fromCanvas(..., {repeat:true, mips:true})`, and the existing **run-merged body quads** get
UVs derived from world position. Per-cell quads would have been thousands of sprites a frame for the
same picture; this adds **not one quad**. `loadImage('assets/terrain.png')` a second time is a
browser cache hit, not a second download.

Everything B1 built is intact: the chunk cache and dirty-rebuild, the soft cap pass on exposed faces
(untouched — it is still what stops the grid reading as Terraria), the depth ramp, and destruction
(verified with `?demo=quake`: the crater's exposed interior is textured and the chunks rebuild).

Details that mattered:

- **The tiles ship at ~0.06 mean albedo** — five times darker than the flat `MAT.body` colour they
  replace. Drawn as authored they made the void *worse*. Each tile is normalised at blit time so its
  mean luminance lands at `MAT[m].body` luminance × `WALL_EXPOSURE`, with a contrast expansion about
  that new mean (a flat 4× gain lifts crevices as much as highlights and yields a wash). The gain is
  derived from the tile's own pixels, so it survives an art rebuild.
- **UVs come from the drawn rect, not the cell rect.** The quads are 1.5px oversized to hide seams;
  mapping 0..1 across the cell would shear the tile 9% on every row.
- **`WALL_SHEAR`** slides the sampling window sideways with depth. Without it the tile's brightest
  facet lands at the same screen height on every repeat and the mass is wallpaper — this was by far
  the most visible artefact of the naive version. It is one add per quad, seamless (the tile is
  seamless in x), and the leaning strata read as bedding.
- **Tile spans are 224 (rock) / 208 (earth) / 256 (masonry) world px**, i.e. *under* the authored
  256 for the natural kinds. Bigger reads as repeated shapes; smaller reads as fractured stone.
  Masonry must stay at 256 or the brick courses stop being brick-sized.
- **The depth ramp now spans 24 cells, not 12** (`shadeBucket` repacked, char moved to bit 32).
  Portrait shows ~570px of sub-ground and a ramp that bottomed out after 192px left the lower half
  flat. Floor is 0.55 with a ×1.30 lit lip — the ramp only has to suggest mass now that the tile
  carries the detail, so it no longer runs to near-black.
- **`hill()` jitters the crust/bedrock interface.** Dead flat, the EARTH→ROCK boundary drew a ruled
  line right across the frame once the two materials carried different tiles.
- Materials with no wall frame (TIMBER platforms, and anything a spell fills in) take the original
  flat-colour path untouched. If the blit fails, `wallTex` stays empty and the whole thing degrades
  to exactly the old rendering.

### Cause 2 — camera framing

`lead` was `halfH * 0.20`, putting the ground line ~70% down the frame. It is now **`halfH * 0.38`
in landscape → ground line ~78%**, which is the framing `refs/ours/ori_wotw_00.jpg` is composed for.
The falling look-down is kept and now scales with `halfH` (`-0.15 … +0.34 × halfH` instead of a
fixed −90…+190) so it means the same thing in both orientations. `enter()` seeds `cam.y` from the
same number so there is no lurch on spawn.

**Portrait is deliberately different: `halfH * 0.22`.** Portrait sees 1774 world px of height
against landscape's 1200, and the `*_fg` occluder band is only 1470px tall; lifting the camera drags
its hard top edge down into the sky. See below — I fixed the seam, but the band still runs out of
art eventually, so portrait leans on the texturing rather than on reframing. **Raise
`LEAD_PORTRAIT` toward 0.38 the moment those bands are taller or feathered.**

Two consequences I had to follow through on, both inside `index.js`:

- **The second moon light was buried in the soil.** It sat at `cam.y + halfH*0.35`, which is below
  the ground line at either lead; once the sub-ground was textured it lit the dirt from within and
  the mass glowed brighter than the sky behind it. It is now `+0.06`, just above the horizon.
- **`fillOver()`, next to B1's `fillUnder()`.** The `*_fg` band's unfeathered **top** edge rules a
  line across the sky whenever the camera rises — portrait always, and in landscape anywhere with
  high ledges (the ruins). This is B1's open REQUEST to art (a) and it pre-dates me, but my lower
  horizon made it far more prominent, so I fixed it the same way B1 fixed the bottoms: redraw the
  band **mirrored above itself**, 2px overlapping. The join matches exactly because it is a mirror,
  and only the mirrored top few hundred px are ever on screen, which is canopy in every set. It
  costs a handful of quads on a layer that already has that texture bound, so no extra draw call.
  This is slightly outside the brief's stated ownership of `index.js`; flagging it explicitly.

### Tuning knobs — sweep by URL, do not reason on paper

Same pattern as `look()`'s existing `?amb`/`?haze`. On `game/index.html`:

```
?wexp=0.72   tile exposure (fraction of MAT.body luminance the tile mean targets)
?wcon=1.50   contrast expansion about that mean
?wfloor=0.55 depth-ramp floor        ?wlip=1.30  surface-row boost
?wshear=0.35 UV shear per tile of depth
?wsr=224 ?wse=208   rock / earth tile span in world px
?flatground  A/B: skip the wall tiles entirely and render the old flat mass
?lead=0.38   camera vertical lead as a fraction of halfH (overrides both orientations)
```

`?flatground` is the honest before/after — use it rather than trusting my screenshots.

### Not fixed, in priority order

1. **The frame is still crushed into blue.** Sampling the rendered PNG, the red channel clamps to
   **exactly 0** across most of the backdrop: post's `contrast 1.12` + `saturation 1.06` on a
   blue-dominant pixel drives red negative and it clips. That is why the soil tile — which is warm
   brown in the atlas — renders blue-grey. This is the ambient/grade problem, not mine, but it is
   now the *largest* remaining defect and it caps how much the texturing can pay off. Do not fix it
   by raising ambient; look at `R.fx.contrast` / `saturation` / `setGrade` first.
2. **`*_near` and `*_fg` still run out of art at the top in the extreme.** `fillOver` covers the
   canopy case, but B1's REQUEST to art — feather the top 32px of `*_near`/`*_fg`, or make them
   taller — is still the right permanent fix, and it is what unblocks the portrait lead.
3. **No wall tile for TIMBER.** Wooden one-way platforms are 22px thin so nothing shows, but a
   timber cliff face would be needed if anyone authors thick timber terrain.
4. **One tile per material, shared across all four locations.** Glyphglade wants a scorched forest
   variant and ruinreach a mossy one (A2 said the same about the ground runs).
5. **The `ground_<kind>` run art (1024×384) is still unused.** It is the real painted ground
   cross-section and would beat a tiled wall for the top 384px — but it fights a destructible cell
   grid, so it needs a real idea, not a patch.
6. **The cap pass is still flat colour** at `MAT.body × 1.85`. It works — it is the lit lip and it
   reads — but it is now the only untextured part of the terrain and it looks it under a bright
   light. Sampling the same tile with a blob alpha mask would finish the job.

---

## A3b-intro-pass2 — the single improvement pass over A3's cinematic (2026-08-09)

**Scope:** `game/js/intro/**`, `game/js/story/script.js` (untouched in the end), `game/intro-test.html`
(untouched). Nothing outside those. The architecture, the `runIntro` API, the script format, the
seven scene presets and the beat structure are all unchanged — this was a defect pass against the
intro list in `CRITIQUE.md`, not a rebuild. **A3's ten gotchas still all hold.** Read them first.

### The two structural ideas, because everything else follows from them

**1. `parY = 1` on every parallax band.** The layer shader multiplies the camera by `uPar` on *both*
axes. Each band therefore drifted vertically at its own rate, so no two bands could agree on where
the ground was — that is the mechanical cause of "nothing touches the ground". Every layer spec now
carries `parY: 1`, so a world `y` is the same screen `y` in every band, always. Horizontal parallax
is untouched. Recession is now staged **explicitly** instead of emerging: each band's ground line is
authored at a different world y, and the `RECT` table documents them:

```
far   -125     mid   -72     near  -12     fgBand +10 (lip)     fg  +85
```

`_mist` was passing `par` for both axes too; it now passes `(par, 1)`.

**2. Each tree band paints its own soil.** `paintTrees` has `groundY: 0.74` on all four sheets — the
bottom quarter of every sheet is a soil bank painted *after* the trees, so it buries their bases. A
band is grounded **by construction**; there is no cross-sheet alignment to get wrong. Consequently
`RECT.<band>.y = groundLine - 0.74 * h`. If you change `groundY`, change the rects to match or the
whole picture unpins.

### Defect by defect, against the intro list in CRITIQUE.md

**1. Nothing touches the ground — fixed.** The two ideas above, plus: trunks are drawn continuing
*below* the ground line (`bury = 0.10*height + 1.4*trunkW`) so the soil covers a real overlap rather
than butting a line; a basal flare widens the bole over its bottom eighth; 3–6 root limbs flare over
the soil; `groundBank()` adds a lit top surface (a gradient from the lip down, key-side bright,
falling to near-black), a symmetric contact-darkening ellipse and a raking cast smear per trunk, and
clods/grass along an irregular lip. **`clearing` had no near-ground layer at all** — `treeNear` was
the last thing drawn before the characters, which is why the meld shot was the worst offender; it
now has `groundNear` after it.

**2. Far bands are barcodes — fixed.** `clusterX()` replaces even-spacing-plus-jitter with 2–4
clusters whose members bunch at the core (cubed distribution) and leave real gaps. Every tree also
draws in one of **three contrast tiers** inside its own band (`tiers: [0.34, 0.66, 1.0]` scaling
value, with per-tier height, gauge and foliage-scale multipliers), drawn back to front. Trunk width
is decoupled from height via `gauge`, and `lean` is randomised per tree, so the band carries thin
saplings and heavy boles instead of one gauge.

**3. Single-hue wash, no light model — largely fixed.** Three changes in `LAYER_FS`:
   - The shadow term was `uBase * uAmbCol` — a warm base tinted by a blue ambient still comes out
     warm, which *was* the monochrome wash. It is now `mix(uAmbCol, uAmbCol*uBase, 0.30)`, and every
     palette's `ambCol` was retuned to a genuinely cool desaturated blue (`~[0.30, 0.38, 0.66]`).
   - **One key per shot.** New `uKeyDir` uniform (a world-space direction, from `pal.keyDir`) drives
     the rim, instead of "whichever local light is nearest", which is why adjacent trunks used to
     disagree about where the light was. Every palette keys upper-left. A layer may opt out with
     `keyMode: 1` to use the local point light instead — only the two nearest bands in `battle` and
     `clearing` do, because there the ward really is a practical light in frame.
   - The rim is sampled at two gradient scales (tight terminator + wide falloff) and modulated by
     the painted value, so it is a soft band that varies, not a constant-width gold wire.
   - The `uScatter` fill was `(1.0 - lum*0.5)` — **inverted**: it put the most light on the darkest
     paint and flattened every internal value distinction. Now `(0.30 + lum*1.00)`.

**4. Character silhouettes — Rook fixed, Vayne improved.** New shared helpers in `chars.js`:
`contactShadow()` (a value-0 partial-alpha ellipse painted into the character sheet, which
composites as a real cast shadow over the ground — both figures used to hover) and `negativeGap()`
(a `destination-out` stroke that punches one slot of daylight between the near arm and the torso).
Rook: value spread across the parts (far limbs 0.42×, cloak 0.50×, torso 1.0×, head 1.15×) instead
of one flat fill; the 16-spike hair is now one capping mass plus six chunky locks; boots have a heel
and a toe; hands have a palm mass and a thumb. Vayne: the propping arm is solved *before* anything
is drawn so **the staff is planted through his hand** with a knuckle mass closed round the shaft —
it used to float behind him; plus a palm-and-fingers hand on the casting arm and a negative gap.
Character lighting was rebalanced hard: `charScatter` was a flat warm wash over the whole figure
independent of value, and it — not the rim — was what made both of them orange cut-outs.

**5. Visible VFX bounding boxes — fixed.** The ward's `if (d.y > 0.06) discard` cut the dome's alpha
flat at its base, which is the full-width horizontal seam the critic found; the cut moved to 0.26
and `baseFade = smoothstep(0.20, -0.02, d.y)` fades it out *inside* the cut. `MIST_FS` had no
horizontal falloff at all, so its quad's left and right edges were two vertical seams — it now
fades over the outer 10% of its own uv. New `uFeather` uniform on the layer shader fades a quad's
own borders; the glyph uses it at 0.06. Additive VFX were already drawn under `front`; that ordering
is unchanged.

**6. Undifferentiated particle field — partly fixed.** New `Stage._ash(rate)`: three depth tiers
with size, opacity, speed and gravity all keyed off depth, and the near tier is pushed to one side
of `_focusX()` (Rook, else Vayne, else the camera) leaving a ~240 px hole around whoever is
speaking. `battle` and `clearing` both call it. **Embers, fireflies and the title swarm are
untouched** — they are the subject, not atmosphere.

**7. Dead lower fifth — partly fixed.** New `paintFgBand()` + `fgBandSpec` in every `front`: a
near-black bank of undergrowth built from nine gaussian mounds with real gaps between them, plus
brambles, ferns at three scales, blades at three gauges and two heavy roots cropping the corners.
Every vertical run in the picture now disappears behind it. To make room for it the camera was
raised ~65–100 world px in all five scenes (`cam.y` in each `_sc_*`), so the ground line sits about
20% up from the bottom edge instead of being welded to it. The bottom ~20% is still near-black — it
now has silhouette, but there is no *content* down there. **No mid-ground landmark was added.**

**8. Flat-quad craft — partly fixed.** Tapered trunks with a basal flare and root flares (above),
plus **bark striations**: six offset polylines of varying value drawn along the trunk spine. This
matters more than it sounds — a flat fill has no gradient except at its two silhouette edges, so the
shader's wide rim lit one whole face and every trunk read as a leaning plank. Grass is drawn at three
gauges in both `paintGround` and `groundBank`; ferns in `paintGround` are now clumped (1–4 per clump)
at three scales rather than evenly spaced at one. **`paintVillage` was not touched** — the houses are
still flat triangles with a thin rim.

### Deliberately NOT fixed, and why

- **The title card.** The brief said to discount the "ghosted serif letterforms" note; it is the
  title mid-fade judged out of context. Untouched.
- **No mid-ground landmark** (list item 7's other half). That is a composition/content job, not a
  lighting one, and it needs a new asset per scene. Out of scope for one pass.
- **`paintVillage`.** The Thornmere dusk gradient and the moon-in-the-gap were named as working and
  the shot now reads; re-cutting the house silhouettes risked the one composition the critic liked.
- **Vayne is still the weaker figure.** He is a slumped, foreshortened pose seen from the side; he
  now has a contact shadow, a hand on his staff and internal value separation, but he does not read
  at 25% the way Rook does. He is the next character job.
- **Audio.** Still never listened to. Unchanged from A3.
- **The `darkness.enter` shot (t≈74)** is still barely art-directed, exactly as A3 said.
- **Embers/fireflies/title particles** left uniform — see defect 6.

### New gotchas, on top of A3's ten

11. **`parY` and the `RECT` table are one system.** A rect's `y` is derived from its sheet's
    `groundY` (0.74 for tree bands, 0.30 for `fgBand`, `topY` for `paintGround`, 0.34 for
    `paintClearingFloor`). Change a `groundY` without changing the rect and the band floats again.
12. **The foreground band will eat your characters.** `paintFgBand`'s lip amplitude and its fern and
    blade scales are tuned so the tallest silhouette rises ~90 world px above the lip. The first
    attempt used 0.22 h of noise and 0.4 h ferns and swallowed Vayne whole. Its sheet is 4:1 like
    every other; `RECT.fgBand` must stay 4:1 or the art stretches.
13. **`uTexel` was wrong for the character sheet.** `_layer` used `1/genW, 1/genH` (the 4:1 parallax
    sheet) for a 768² canvas, so the rim gradient was four times wider vertically than horizontally.
    Pass `texelX`/`texelY` for any layer whose texture is not the parallax sheet.
14. **`uScatter` is a flat wash, not a light.** It has no direction and barely attenuates on anything
    near the light, so a value above ~0.15 on a small subject wipes out every other term. If a
    character looks like a solid orange cut-out, that is the number, not the rim.
15. **A bright rim on a long continuous edge is a ruled line across the screen.** The fg band's lip
    at `rim: 0.34` drew a bright orange wire the full width of the frame. Thin, all-edge geometry
    (undergrowth, grass, ferns) wants a *low* rim — 0.11–0.26 — where a solid trunk wants 0.3–0.8.
16. **Canvas `source-atop` is canvas-wide.** `groundBank`'s lit-lip gradient has to be clipped to
    the bank path or it re-grades every tree already drawn in the sheet.

### Verified

Captured with `tools/shot.mjs --canvas --seek` at 1440×900 (t = 3, 9, 15, 24, 38, 52, 66, 74) and at
a true 390×844 portrait (t = 3, 24, 52). No console errors, no shader failures, the runtime and the
beat structure are unchanged. Rook's final clearing position is pulled in to −128 in portrait; at
−175 he was half off the left edge, which is A3's gotcha 10 biting.

**Do not trust my score.** What changed is above; what it is worth is for the blind critic.

## playtest-fixes-1 — first real mobile playtest, defect pass (2026-08-09)

The user played the built game on a phone for the first time. Everything below is a fix for
something they hit, plus the two engine bugs those symptoms turned out to be sitting on. No new
systems, no rebalance beyond what the defects forced.

### The two that mattered most — both one-liners, both invisible in every harness

**1. `P.update(dt)` was never called in the play scene.** `world.render()` drew the particles;
nothing ticked them. Every spark, bolt trail and ember hung in the air exactly where it was emitted,
forever, until the pool filled — the user saw it as "spell trails remain on screen". It also
explains a lot of the washed-out blue mush in earlier in-engine shots: thousands of dead additive
particles stacked over the frame. Only `createDemoScene` in `main.js` ever called it, which is why
no harness caught it. Fixed in `world.update`, after `surfaces.update`.

**2. `world.kill()` never latched for the player.** `kill` skips `ents.despawn` for the player, and
`dead` is only set *by* despawn — so every subsequent damage tick killed him again: another
`player:died`, another death overlay, another flash, another death sfx, every frame. That is the
"death screen flickers with noise blaring, I have to reset the page". There is now an `e.killed`
latch, checked in `kill` and in `damage`, cleared in `entities.reset` and `world.respawn`.

### Fire was unsurvivable, and the reason was not the numbers

`world.damage` re-applied `STATUS.BURN` for 2.5s on any fire damage to a flammable entity — and the
burn tick *is* fire damage. So burn re-armed itself forever: once alight, the player was dead, with
no way to douse it. `BURN_OPTS` now carries `noIgnite` (and `noIframe`, because a DoT tick was also
handing out 0.55s of invulnerability to everything else on screen). On top of that:

- fire surface: `spread 0.42 → 0.20`, `decay 0.055 → 0.105`, `damage 26 → 16`, `statusTime 2.4 → 1.6`.
  Measured: one lit barrel used to cover 1200 world px in 3s and never go out; it now peaks around
  380 px and is completely out in ~15s. Fire is a front that eats its fuel and dies behind itself.
- burn is asymmetric on purpose: 9/s on the player, 14/s on everything else. Emberbolt is the
  starting spell, so brushing your own fire has to cost a slice of health, not the run.
- **level:** the six `fence` sections at a 200px pitch were a *continuous* 1200px timber wall (a
  section is 196 wide) running the whole opening screen — one ember lit the lot. Cut to three.

### Auto-aim on touch

`ui/touch.js` had a comment about "overriding the sim's auto-aim" and there was no auto-aim: every
cast went wherever the last tap happened to land. `core/input.js` now owns aim *authority* —
`input.aimIsManual()` / `input.holdAim(ms)`. Mouse and gamepad are always manual; on touch the sim
drives aim unless a drag on the aim flank or a tap out in the world claims it, for 700ms. `player.js`
`autoAim()` points at `world.nearestEnemy` within 820px, falling back to 340px ahead of Rook's
facing, snapping on a target *change* and easing while tracking one. The HUD draws four corner ticks
on `input.autoTarget` so the player can see the lock.

### UI defects

- **Modals stole the tap that was already in flight.** The level-up offer appearing mid-fight took
  the tap heading for a cast circle. `overlays.js` now has `ARM_MS = 900`: the offer and the death
  screen are inert (and visibly dimmed, `.sf-modal.arming`) for that long after opening.
- **`ui:restart` / `ui:quit` had no listener at all** — the death screen's buttons did nothing, so
  the only way out was reloading. `main.js` handles both: restart re-enters `play` (which rebuilds
  the level in `enter()`), calls `ui.reset()` and `spellSystem.softReset()`; quit reloads to a clean
  boot with `?nointro` (there is no Thornmere hub yet).
- **A spell learned with no free circle was lost.** `autoAssign` gave up silently, and nothing
  revisited it — so taking an auto-cast spell at level 1 did nothing, and levelling to 3 opened an
  *empty* circle while the chosen spell sat unused. `syncCircles` now calls `fillOpenedCircles()`,
  but only on the frame a circle actually opens (otherwise clearing a circle in the loadout refills
  itself before you let go). Learning with nowhere to put it emits `spell:unplaced`, which toasts.
- Tapping a locked circle was silent; it now toasts "Circle 2 opens at level 3".
- `sim/index.js` `enter()` subscribed `view:change` every time — a leak now that restart is a real
  path.

### Intro, portrait only (landscape untouched)

- **The canopy ate the S of SUNDER.** The title draws before the foreground occluders and the
  portrait title is a stacked column that runs up into the near tree. Rather than move the word off
  the composition it was built for, the `front` layers fade to 32% while the title is up
  (`frontFade`, portrait only) — the canopy reads as a scrim over the letterforms.
- **Rook was completely off-screen for the whole meld shot.** A `cam.h` of 430 is ~250 world px
  *wide* in portrait, narrower than the gap between Rook and Vayne. `_sc_meld` now has a portrait
  branch (`h 700→620`, `x 20→10`, `y -250→-212`) and Rook's final clearing mark moved −128 → −105.
  Both figures are in frame for the whole shot.

### Verified

`tools/shot.mjs` against a true 390×844 portrait: auto-aim acquires and releases correctly, death
fires exactly once and the overlay arms after 900ms, "Again" restarts twice in a row (hp 100, 79
props rebuilt, particles 0), a held spell drops into circle 2 the moment it opens. Fire measured
before and after with a scripted ignition. No console errors.

### Still open

- **The play scene is still washed blue** (NEXT-SESSION BUG 1). Removing the dead-particle haze
  helped a lot but the ambient/haze tuning is untouched.
- Nobody has heard the audio.

## playtest-fixes-2 — the second round of the same playtest (2026-08-09)

Three more from the phone, and the first two share one root cause with `ui:restart`: **a bus event
was emitted and nothing listened.** Worth grepping for more of these.

**`ui:pause` had no listener, so nothing has ever paused the world.** Not the pause menu, not the
spell offer, not the death screen — all three drew over a running sim. The user died reading the
level-up cards. `ui/index.js` now exposes `get blocked()` (`paused || overlays.blocking`) and
`main.js` gates `scenes.update(dt)` on it. `ui.update(dt)` still runs, so the HUD keeps animating.
Measured: 0 world frames advance while the offer is open, and it resumes on pick.

**Dying with the offer open left it stacked under the death screen** — unresolved, hidden behind,
and still a full-screen `pointer-events: auto` element. Pressing Again restarted the run *underneath
an invisible modal that ate every touch*, which is the likeliest explanation for "after first death
recover I can no longer move". `showDeath()` now calls `cancelChoice()` (resolves the pending
promise with null), and `ui.reset()` clears death, choice, pause and assign mode.

**Latched input across a scene change.** Dying with a thumb on the stick leaves `stickPointer` owned
and the direction bit set, and nothing clears them if that pointer's `pointerup` never arrives — the
death modal takes the touch, the browser cancels it, the finger lifts outside the window. A held
stick also *suppresses the keyboard axis fallback*. New `input.releaseAll()`, called from the play
scene's `enter()`, so a restart never inherits a held control. `touch.setEnabled` now clears its
stick on both transitions, not only on disable.

**`?diag=1`** forces the corner readout on and appends `scene/frame/playerControl/state/hp/axisX/
zones/lastSource`. That is the line that says whether a "can't move" is the sim, a stalled scene
machine or a latched input — there is no console on a phone.

### Gotcha for whoever is next

`bus.emit` with no listener fails silently and looks exactly like working code. `ui:restart`,
`ui:quit` and `ui:pause` were all dead on arrival. If a UI affordance "does nothing", check that
something is actually listening before you debug the UI.

## playtest-fixes-3 — framing, and it ships (2026-08-09)

**Rook's Sunderwood line.** "Quiet's wrong." parses as "Quiet is wrong" and nobody read it as
intended. Tried "No birds." (too oblique), settled on the user's own suggestion: **"Why is it so
quiet?"** — the original idea, said plainly. It still sets up "That's not sunset." two seconds later.

**Destruction was happening off camera.** Portrait shows 820 world px against landscape's 1920, so a
cascade runs along a structure faster than the frame can follow and the player arrives at rubble.
Two changes:

- **Look-ahead.** `updateCamera` leads on velocity *and* on `faceX`, harder in portrait
  (`0.32 / ±280` vs `0.22 / ±230`), so you see what you are about to walk into. The aim pull now
  also fires for touch auto-aim, not just a mouse — with auto-aim that points at the thing you are
  about to blow up, which is precisely what should be in frame.
- **Off-screen destruction holds.** A prop waiting on `collapseIn`, or mid-`shattering`, freezes
  that timer while it is more than 260px outside the view, up to `MAX_HOLD = 8s`. Only the
  pre-break states hold — anything already `falling` keeps its physics, or a half-visible beam
  would stop in mid-air. Verified: the showcase arch stayed intact for 3s after its pillar was
  blown, and came down when the camera arrived.

**Shipped.** `gms/2d/sunderfall/` committed and pushed to main, registered in `projects.js` as
`wip: true` pointing at `/gms/2d/sunderfall/game/`, screenshot at `assets/screenshots/sunderfall.jpg`
(the title card). `.gitignore` now also excludes `art/raw/`, `art/work/`, `docs/shots/` and
`refs/sprites/` — ~110 MB of Flux working set, session screenshots and third-party reference that
`game/assets` is already baked from. 12.4 MB / 182 files committed. Live and booting clean from
`yru.br8t.com/gms/2d/sunderfall/game/`.

### One defect spotted while shooting the promo image, NOT fixed

At 1400×729 landscape there are **pale grey rectangular bands** floating in the mid-distance — see
the first hero attempt: one around the burning tree line, another over the far bank on the left.
They sit at a consistent world y, which smells like a band's own edge row being sampled (the
`fillUnder`/`fillOver` seam family, A1 gotcha 4) rather than a stray sprite. Not visible in portrait
at the framings tested. Worth chasing before anyone judges the art again.

## playtest-fixes-4 — the reason nothing was passable (2026-08-09)

**`moveBody` abandoned the Y axis whenever X was blocked.** The header comment promised "separated
per axis so a body sliding along a wall keeps its vertical speed"; the code `break`ed out of the
whole substep loop. Hold a direction into anything solid and you could not rise or fall AT ALL —
velocity integrated, position never moved. Rook was pinned to the first crate stack at x=539, and
every "I can't get past this and I can't jump it" report traces here. It is not level-specific: it
made **every wall in the game** a total pin for anyone holding the stick towards it. Blocking an
axis now zeroes that axis and continues the solver; the Y branch does the same so landing no longer
cancels the horizontal movement left in the frame.

Auto-walk results as each blocker fell (hold right, jump when stalled, shoot when stalled):

```
539  →  2537  →  4853  →  5997  →  6265  →  past the wall, 6662+
physics    ledge     arch     chasm     wall(2)
```

**Sunderwood ledges were solid boxes at fixed world y over ground that rises ~130px through the
wood.** The first one ended up with its underside 8px BELOW Rook's head: he could not walk under it,
and at 206px up he could not jump onto it (a full jump clears 185, measured). The whole wood was
sealed by a rock slab at head height. They are all `oneWay` now — one-way cells never block
horizontally, so a mistuned ledge height can no longer wall off a route; the worst case is a ledge
you cannot reach yet. Heights re-stepped 150px apart so the climb works.

**The arch's pillars and the acid wall's buttress are no longer solid.** An arch is a thing you walk
under; in a side view its legs stand either side of the road, not across it. Solid, the arch was a
385px unclimbable wall on the only path through Ruinreach, breakable only by chewing 40 fire casts
through masonry that resists fire at 0.15.

**The chasm was a silent softlock.** 500px wide with vertical masonry sides and a floor at y=520 —
falling in meant no death, no respawn, nothing to do but reload. Now: narrowed to 340 (a running
jump covers ~380, so losing your own bridge does not end the run), the bridge deck lowered from
313px above the rim to *at* the rim so it is actually the road, `world.pitY` (300 here) respawns
anyone who ends up down there, and a rolling checkpoint follows the player forward over safe ground
so a fall does not send them back to Thornmere.

**The acid wall is two courses, not three.** Three was 62 casts / 75 seconds with the starting
spell and the bottom course still standing. Acid is the intended answer (masonry takes 2.2× from
it); the fire fallback now has to be a fight rather than a chore. Knocking the top course down
leaves climbable rubble, which is what makes it a gate you open rather than a wall of HP.

### The general fix, which matters more than any of the above

**`hint:blocked`.** Lean into something for 0.9s while actually pushing towards it and the game says
what it is and what to do — "Jump it", "Brick wall — break it", "Solid rock — blast through it" —
sized off a real probe of the obstacle, measured from the ground he last stood on (measuring
mid-jump made a 335px pillar report 158 and advise an impossible jump). Jumping does not reset the
timer, because jumping at a wall is exactly what a stuck player does. Gates are fine; silent gates
are not.

**Damage numbers no longer spam 0.** A burn tick is ~0.15hp, which `Math.round`ed to a screen full
of zeroes. Fractions are banked and a number is thrown only once a whole point of health has gone;
`api.damage` refuses anything under 1 outright. The hurt vignette now scales with the hit instead
of flashing hard on every tick.

### Still open

- The iron gate at 6780 sits on the parapet and gates the *upper* route only; the ground route below
  it is clear. Fine as-is, but nobody has decided whether that upper route is meant to be a shortcut.
- Nothing has been tuned for enemy pressure during traversal — the auto-walk runs with `noenemies`.

---

## Session — playtest-fixes-5 (mobile jump, the lift, own-fire, barks)

Reported from mobile portrait: a rock the toast said to jump could not be jumped; the second
Sunderwood ledge could not be reached; and fire from your own spells forced a permanent retreat, so
the destruction — the point of the game — always happened off screen behind you.

### The mobile jump was 78px, not 186px

`ui/touch.js` fired jump on touch-**UP**, out of a tap-versus-drag test, and held it for three fixed
ticks (~50ms). `player.js` then applied the variable-height cut, `vy *= 0.42`, the moment the button
was not held. So every jump on mobile was a 50ms jump:

| | before | after |
|---|---|---|
| flick tap (30ms) | 78px | **152px** |
| tap (120ms) | 78px | **186px** |
| held | 78px | 186px |
| tap ×2 (lift, level 1) | — | **243px** |

It also cost 100–300ms of input latency, because nothing happened until the finger lifted. Jump is
now pressed on touch-DOWN and held for as long as the finger is down — real variable height, no
latency — with `jumpMin` keeping a flick alive long enough for the fixed step to see it. `CUT_FLOOR`
(745 px/s) stops the cut ever leaving less than ~150px, and `CUT_AFTER` (55ms) stops it applying
before there is any hold to read.

**This was the whole "impassable rock" report.** The level is built against 185; mobile had 78.

### Lift — the lifestone's air jump

Aaron's idea, and the right one: a magic-powered second jump that grows with level.
`liftStats(world)` reads `world.playerLevel()` (which asks `ctx.spellSystem`, tolerating its
absence so sim-test still runs) and returns power `0.56 → 1.0` across levels 1–14, with a second
charge at 12. Measured reach: **230px at level 1, 370 at 14, 555 with both charges**. It also shoves
forward in the held direction, because it is for gaps as much as for ledges.

- `aboutToLand()` refuses a lift when he is falling with floor just below him, so the 130ms jump
  buffer cannot spend an air jump one frame before the ground jump it was meant for.
- The lifestone on his chest **is** the gauge — spent, it drops to 45% brightness and its light
  shrinks; a lift throws a flat ring at his feet. No HUD element.
- `hint:blocked` is now sized off `jumpReach(world)` rather than a constant, with a new middle tier:
  ≤82% of a plain jump says "Jump it", ≤78% of full reach says "Jump, then jump again", above that
  it is a break. The advice can no longer outrun what the player is able to do.
- Teaching: one `hint:tip` toast the first time he is falling with a charge unspent, after his first
  real jump. New `player.lift` sfx.

### Own fire is now a hindrance, not a death sentence

Fire did 16/s standing in it plus a re-armed 9/s burn — about 25/s, four seconds from full health.
The correct play was to light everything and run away from the best thing in the game. Surfaces
gained per-kind `playerScale` / `playerStatus`:

- fire `0.20 / 0.5`, acid `0.40 / 0.6`
- burn DoT on the player 9/s → **3/s**

Measured: standing in continuously re-lit fire is now **3.4hp/s** (30s from full), and a direct 30
fire hit still lands for exactly 30 — enemy fire attacks are untouched, only lingering surfaces and
the DoT are scaled. Self-damage from your own spell *impacts* already returned 0 (`world.damage`
line 210).

### Rook talks — `sim/barks.js`

He had one cinematic of voice and then went silent for the whole game. Barks are one line at a time
on an 11s global cooldown (4s if the new line outranks the last), never repeating until the pool is
exhausted, nothing in the first 4s of a run. Triggers: own fire ("This magic stuff sucks."), acid,
big hits, low health, breaking something structural, a three-kill streak, level up, falling in the
pit, and the first lift. Emits `bark`; `ui/index.js` turns it into a speech bubble anchored to a
function that tracks him, so it survives the run it is said during.

### Also

`drawToasts` clamped its panel to `L.toast.w` but never trimmed the text, so a long line overprinted
its own value badge — visible on 390px portrait. `fitText()` now ellipsises to the available width.

### Verified

Auto-walk (hold right, escalate to jump → air jump → cast when stalled) reaches the end of the level
at x=8209 **with enemies active**, one blocking hint on the way (the acid wall, by design). Pause
freezes the world (0 frames), death fires once, restart rebuilds 78 props at full hp and jumps 186px.

---

## Session — playtest-fixes-6 (death buttons, swap picker, damage bars)

### The two death buttons did nearly the same thing, and neither said so

"Again" soft-reset (spells kept, ranks and level reset); "Back to Thornmere" reloaded the page,
which — since nothing is persisted — was a total wipe. Two very different costs, no label
difference, and the second one named a hub that does not exist.

Now: **Again · Keep your spells** and **Start over · Forget everything**, with the death panel
spelling out the difference. `ui:quit` no longer reloads: `S.hardReset()` clears known spells and
circles, restores the starting kit, and the play scene re-enters in place — same wipe, no second
asset load. The pause menu's two equivalents got the same labels.

### Tapping a circle no longer opens the whole pause overlay — `ui/picker.js`

The tap already says which circle you mean, so the picker shows only that circle's options as a grid
over the thumb cluster, with the circle's current spell in the grid and marked. Tap one to swap, tap
anywhere else to leave. Canvas, not DOM, because it has to live in the same geometry as the circles
it belongs to. `ui.blocked` includes it, so the world stops while it is open.

Falls back to the full loadout when there is nothing to choose between (one spell known). Exposed as
`ui.picker` so a headless test can read item positions and tap them.

### Damage bars on things that are a job — `props.drawBar`

A prop shows a bar only if the hit that just landed would need **more than three of itself** to
finish it — which means it scales with the player's damage instead of with a hand-picked list, and a
crate that dies in two hits never shows one. On screen for 1.15s after the last hit and gone.

- Props ≥150px tall carry the bar **inside** their own top; smaller ones float it 16px above.
- A ghost bar trails the real value, so a big hit reads as a chunk taken rather than a slide.
- Burn and acid attrition modify `p.hp` directly rather than going through `damage()`, so they do
  not raise bars — otherwise everything on fire would wear one.

### Also

`touch.hint` ran off the right edge in portrait once "TAP AGAIN IN THE AIR" was added to it — three
short lines now, not two long ones. At 9.5px with tracking, ~20 characters is the portrait limit.

### Verified

Picker opens on the tapped circle with the current spell marked, freezes the sim (0 frames), swaps
on tap, dismisses on an outside tap. Bars: `oak_trunk` h=340 inside, `fence` h=79 above, a hit that
would kill in one gets nothing. `softReset` keeps 4 known spells, `hardReset` drops to 1. Full
auto-walk still reaches x=8206; pause/death/restart unchanged.

---

## Session — playtest-fixes-7 (Vayne's ward)

"Again" reset spell ranks to 1 and the player to level 1, which made it a much harsher option than
its label implied. Aaron's call, and it gives the mechanic a reason to exist in the fiction: the old
man bound a ward to the boy's life before it cost him his own, so dying replays the day.

`S.softReset()` now:

- **keeps every spell at the rank it was taken to** (it used to stamp them all back to 1)
- **keeps shards**
- **drops a third of his levels, floored at 3** — `max(min(level, 3), level - ceil(level/3))`

Measured: 24→16, 12→8, 7→4, 5→3, 3→3, 2→2. The floor cannot promote, so dying at level 2 leaves
you at level 2. Three is deliberate: `CIRCLE_UNLOCK` opens the second cast circle there, so a death
is never a return to one-spell nothing.

`Start over` is unchanged and is now the only total wipe. Death-screen copy says what the ward does;
the buttons read **Again · Ward keeps most of it** and **Start over · Nothing kept**.

**The ward explains itself the first time it is used.** `tellWard()` in main.js fires three lines
after the restarted run loads — two from Vayne, one from Rook — once per session, and only while the
play scene is up and he is alive. They go out as `bark` events, so they use the speech bubbles that
already track him; anyone who is not Rook speaks from his other side so the exchange does not stack
in one place.

DESIGN §5's roguelite paragraph was rewritten to match — it still described the old rule.

### Verified

Level 12 with `emberbolt:4 cinderwake:3` and 7 shards survives an Again as level 8, same ranks, same
shards, circles rebuilt with the right unlock state. Three ward lines on the first Again, zero on the
second. Death panel is 367×540 in a 390×844 portrait with no overflow. Auto-walk still reaches the
end of the level.

---

## Session — playtest-fixes-8 (the picker on desktop)

The picker already opened on desktop — clicks reach `touch.js`'s pointer handler the same way taps
do — but it **rendered off the bottom of the screen**, which is what "an info message I can't read
because it goes below the screen" was. Measured at 1440×900: panel at `y=890`, height 139, viewport
900.

Cause: the placement clamped with `y = max(L.toast.y + 40, y)`. That was written for portrait, where
toasts sit at the top and the panel must stay clear of them. In landscape `L.toast.y` is
`h - pad - 30` — the bottom of the screen — so the clamp shoved the panel off the frame. It now
clamps against the **viewport** on all four sides and only keeps clear of the resource cluster at the
top. Verified fully on screen at 1440×900, 1280×720 and for circles 2/3/5.

While in there, since desktop has the room:

- **Rank badges** (`R3`) on any spell above rank 1, and the **circle number** of any spell already
  placed elsewhere — so a swap can no longer silently empty another circle without you seeing it.
- **Keys 1–5 open that circle's picker** instead of the whole pause overlay, matching the click.
  Pressing the same number again closes it; a locked circle toasts its unlock level. (Note: `close()`
  clears `slot`, so the toggle has to read the slot *before* closing — the first version reopened.)

---

## Session — playtest-fixes-9 (arrow keys jump, step-up, magic through scenery)

### Up jumps

`KEYMAP` mapped `ArrowUp`/`KeyW` to `up` only, and `up` drives the analog axis (dash aims off it),
not jump. Jump was `Space` alone — while DESIGN §6 has always said W jumps. A key can now carry more
than one action (`ArrowUp: ['up', 'jump']`), so up both jumps and keeps feeding `axisY`. Verified:
Space, ArrowUp and KeyW each clear 186px, and `axisY` is still −1 with up held.

### Getting stuck on scenery

`stepUp` was **20px** — a kerb, a root or a fallen brick could stop Rook dead, which reads as a bug
whatever the level says. Now **52**: anything ankle-to-knee is walked over, a crate (78) is still a
jump. The probe loop went 2px → 3px granularity so the cost per blocked substep did not go up with
it.

A census of every place a walk-only run stops (`RIGHT` held, no jump, no cast) now reads:

```
538   crate         70px   flick-tap clears it
1098  stump         78px   flick-tap clears it
2117  boulder_small 78px   flick-tap clears it
6265  wall_brick   374px   must be broken
```

That is the shape the game wants: traversal is free, the one hard stop is the thing you are meant to
break. **A masonry stub at 4300 was the exception** — the "broken parapet" was 120px tall and stood
in the middle of the walkway, making a 144px step in the one place the region changes, 8px under a
standing jump. Knee-high is what "broken" should look like: 48 tall and under the step-up.

Guard test: holding RIGHT into the acid wall for ten seconds still gets +84px and stops. The bigger
step-up does not climb anything that is meant to gate.

### Magic no longer stopped by things your body walks through

`world.sweep` stopped on **any** prop, `solid` or not — and 52 of the level's 78 props are
non-solid. Fences, hedges, ferns, trunks and bone piles were eating spells aimed past them, which
with auto-aim on a phone is most of them.

`o.soft` on a sweep collects pass-through props instead of stopping. The test is deliberately **not**
`!p.solid` alone: `solid: false` means two different things here — scenery you walk through, and
level-geometry overrides like the arch pillars, which are masonry and must still eat a bolt. So it
is non-solid **and** made of TIMBER / FOLIAGE / BONE / GLASS. Confirmed classification:

```
PASSES   fence, bush, ferns, mushrooms, oak_trunk, tree_trunk, burnt_trunk,
         deadtree, tree_foliage, tree_foliage_b, skull_pile, lantern
STOPS    every solid prop, plus pillar_stone, rocks_small, brazier, wall_brick,
         arch_stone, gate_iron, boulder_*
```

Passing through is not free for the prop: it takes the shot's **element across the whole object**
(`grazeSoft` in spells/common.js) — fire ignites it, storm/decay/void/earth chip it. Measured: an
emberbolt fired at a target past a fence reaches x=333 with the fence at 190, and leaves the fence at
23/30 hp and burning. So shooting through cover both reaches the enemy and lights the cover, which is
the answer to "it went through the hedge, so the hedge is on fire now".

### Not done, deliberately

Aaron also floated **rank upgrades that let spells pierce solid objects** — electrify/freeze a whole
wall. That is a real design decision rather than a fix: a piercing bolt walks straight past the acid
wall and the arch, which are the two gates the last three sessions went into making legible. Worth
doing, but it wants a gate-safe rule first (pierce only non-structural props? pierce but not through
anything the support graph is holding up?). Flagged, not built.

---

## playtest-fixes-10 — aiming down, thumb misses, and progress that survives a refresh

Round: *"there is a part of the map I think I need to go down, but I am finding it difficult to aim
down on mobile"*, *"sometimes it feels like I click the buttons but it jumps instead"*, and *"if I
refresh page I think I lose all progress? lets track progress so we can continue"*.

### Aim is a direction now, not a screen point

The old model: a drag on the right flank wrote `input.pointerScreen`, which the engine turned into a
world point and aimed at. That is the wrong model for a thumb. **The aim flank is the bottom-right of
the phone**, so "drag down" put the finger down-*and-right* of the caster and the shot went
diagonally. Aiming straight down needed a finger where the caster already was — i.e. it was not
possible, which is exactly what was reported.

`input.setAimVector(dx, dy, src)` / `input.clearAimVector()` take a **direction**, anchored to
`aimOrigin` (the caster, pushed every tick by player.js) and re-projected in `input.update()` because
the caster moves and `aim` is world-space. `aimIsManual()` is true while a vector is live, so the
sim's auto-aim stands down.

Two thumbs can drive it, and the right one wins:

- **The movement stick.** Its vertical axis drove *nothing at all* — `up`/`down` were set and never
  read by anything — while the only way to aim was the far thumb, which is also the one holding jump.
  Push the stick down and the shot goes down. It only claims aim past `STICK_AIM_ON = 0.50` of full
  deflection and gives it back below `0.34`, so running left and right never steals auto-aim off an
  enemy and a wobbling thumb does not flicker between the two.
- **The right flank drag**, unchanged as a gesture, now relative to where the drag started.

A drag on the right flank also **releases the jump** the moment it becomes a drag (`> TAP_PX`).
Before, every attempt to aim also launched him — and aiming *down* launched him *up*. Measured: an
aim drag now moves him 1px where a real jump is 186px, and a plain tap still jumps its full 186.

Feedback for both: an ember arrow out of the owning thumb (touch.js) plus a dotted line and chevron
from the caster in world space (`drawAimVector` in ui/index.js). The camera leans up to 250px the way
you are aiming (sim/index.js) — aiming down at something you cannot see is the same as not being able
to aim down.

### Auto-aim now targets blockers

With no enemy up, aim defaulted to a point 340px ahead at head height, which sails over a crate and
misses anything below entirely. `autoBlocker()` in player.js picks the nearest **solid** prop instead
(fences and ferns are walked and shot through — targeting one is targeting scenery).

The trap here, and it is a real one: **never target the structure holding him up.** An auto-cast
circle chewing through the bridge deck under his own feet is a death he never asked for. `standingSet()`
excludes the prop underfoot, its supporters, *and its siblings on those supporters* — the bridge is
four deck segments on shared pillars, and excluding only the one he stands on still had the aim
quietly demolishing the span he was about to walk along. Verified: standing on deck segment 5810 the
target is the acid wall at 6420, not the bridge.

### The thumb cluster swallows its own misses

Reported as "I click the buttons but it jumps instead". The cast circles are round, the jump flank is
a rectangle behind them, so **every near miss — and the whole 82px band below the big circle, which
is where a thumb naturally lands — was a jump**.

`L.clusterAt(x, y)` returns a circle index, `-2` for "inside the cluster, off every circle" (swallow
it), or `-1`. Near misses snap to the **nearest** circle within `r + 16` (nearest-wins, so the slack
splits the gap between neighbours down the middle rather than letting the earlier index claim it).
The cluster region is a disc around the arc centre in portrait, a box carried to the bottom-right
corner in landscape. The stick still wins where the disc laps over it.

```
on circle 0            -> 0
12px past its rim      -> 0     (snapped)
55px under it          -> -2    (swallowed; used to jump)
between circles 1 and 2-> 1     (nearest)
mid-flank              -> -1    (still jumps)
```

### Progress survives a refresh — core/progress.js

`sunderfall.progress.v1` in localStorage. Saved: level, XP, known spells **and their ranks**, which
circle each sits in, shards, run stats, the rolling checkpoint, and hp. Debounced 1.2s, flushed on
`pagehide` and on hidden `visibilitychange` (a phone rarely gives you an unload event and never gives
you two). `S.serialize()` / `S.restore()` live on the spell system; the HUD is a pull-mirror of it,
so restoring the state *is* restoring the display — no event ordering to get right.

**Not saved: the state of the world.** Broken props, scorched ground, spent enemies. Serialising a
destructible level is a much larger job and the game rebuilds it on every restart anyway, so a resume
puts him back at his last checkpoint in an intact world. You keep the character, you replay the road.
Say so if it ever surprises anyone.

Two rules worth keeping:

- **Refreshing on the death screen must not be cheaper than pressing Again.** The save is written the
  moment he dies, before either button is pressed, so a reload from there would hand back the whole
  run with the ward unpaid. The blob carries `dead: true` and `boot()` charges `softReset()` on the
  way in. Verified: died at 12 → boots at 8, ranks intact, spawn back at the top of the road.
- **"Start over" wipes the save**, or a refresh hands back the run the player just chose to throw away.

Persistence is off for `?nosave`, `?noenemies` and `?demo`, so a regression run never measures
whatever the last one left behind. **Use `&nosave` in every headless test from now on.**

Tested with a genuine cold boot, not just a round-trip: `save2.js` loads the game in an iframe, earns
levels, removes the iframe, then loads a second one — session two came up at level 9 with
`emberbolt:3 cinderwake:2`, 4 shards and spawned at x=2600 instead of 470.

---

## playtest-fixes-11 — nobody had ever heard the intro

Reported as "the intro is soundless, game has sound though". The intro is not missing sound. It has
a complete procedural score — menace pulse, wind, a village drone, a bell, stone-on-bone knocks —
already cue-driven off `story/script.js`. It was playing at zero for every player who has ever
loaded the game, and here is why:

- `IntroAudio` constructs with `master.gain.value = 0.0`, and only `arm()` raises it to 0.85.
- `arm()` is called from the intro's own `keydown` / `pointerdown` handlers, which do not exist
  until the intro is already running.
- The intro auto-runs on page load. Nothing before it collects a gesture — the boot card dismisses
  itself.
- And the trap: `onPointer` is `armAudio(); if (storyT > 1.0) requestSkip();`. **The only gesture
  that could unmute the cinematic also ends it**, one second in. Tap to hear it, and you skip it.

So the working combination was "tap within the first second, then never tap again", which nobody
does. This is also why every audio note in the docs said "nobody has heard it" — the score was fine.

### The fix: the boot card is now the gate

`#boot` gains a `tap to begin / sound on` button (`main.js waitForStart()`), shown once loading is
done. That tap is a real user gesture, so the AudioContext the intro builds afterwards is allowed to
start, and `runIntro` takes a new `armed` option that calls `audio.arm()` immediately rather than
waiting for a tap it must not receive.

The cold open is untouched — the player still lands straight in the fight, they just pass through a
card they were already reading. Skip behaviour is unchanged: tap-to-skip after 1s still works, and
now costs nothing, because the sound is already on.

**`?autostart` skips the gate.** Automation has no gesture to give and would otherwise sit on the
boot card until the harness gave up. `?nointro` and `?scene=play` never reach the gate at all.

Verified with `gatetest.mjs` (raw CDP, `--autoplay-policy=document-user-activation-required`,
instruments `AudioParam.setTargetAtTime` and counts source nodes per context before any page script
runs):

```
BEFORE TAP  gate visible, intro not started, 1 audio context (the game's)
AFTER TAP   gate hidden, intro active, 2 contexts both running,
            new ramp to 0.85 (= IntroAudio.arm), 32 sources started by the intro context
```

32 oscillators/buffer sources in the first six seconds is the score genuinely generating, not merely
being unmuted. Regression: `?autostart` → gate hidden, intro runs; `?nointro` and `?scene=play` →
no gate, player exists. Both viewport sizes render the card correctly.

### On the forge SFX library

`/gms/3d/forge/audio/` was offered as a source of sounds. It is a procedural SFX lab — 53
parameterised one-shots (`explosionBoom`, `glassBreak`, `stoneGrind`, `impactWood`…) behind a
`play(eng, o)` contract built on forge's own `core.js` primitives.

**Not worth porting.** Sunderfall's `core/audio/` is already more specialised than forge for exactly
the thing this game is about: `keys.js` maps 10 materials × `crack` / `break` / `debris` / `burn` /
`step`, each with variants, priority, rate limiting and a voice cap, and destruction drives it.
Forge's generic `explosionBoom` would be a downgrade on a masonry wall that already has its own
crack, break and debris layers. Revisit only if a specific sound is missing, and port that one.

### Voice-over and music

`docs/VOICE-AND-MUSIC.md` now holds every spoken line in the game — the 19 intro beats with their
timecodes and direction, all 9 bark pools, the death-screen text — plus Suno prompts for narration
and for each music state. The key facts a generation has to respect: the score is **D natural minor
throughout**, the per-state tempos are fixed (menu 56 / explore 62 / tension 74 / combat 96 / boss
104 / victory 68), and the boss loop's ♭II is a deliberate semitone clash. Any recorded track in
another key will fight the live synth on every state change.

---

## playtest-fixes-12 — the intro has a voice

Two Suno takes arrived (one per character, each holding that character's whole part) and
are now cut into the cinematic: `game/audio/vo/vayne.mp3` and `rook.mp3`, 253KB for the
pair after re-encoding down from 1.2MB.

**All 19 lines are in, verified end to end.** A full 80s headless run played every clip in
script order, correct offsets, correct file per speaker, no overlaps.

### Getting the timings was the hard part — see `docs/VO-TIMING-RECIPE.md`

Short version, because two obvious approaches both fail on Suno output:

- **Silence detection is useless** — there is a music bed under the voice, so there is no
  silence. `silencedetect` found one gap in a 15s file containing seven lines.
- **Energy thresholding is useless on its own** — the bed sits ~10dB under the voice and
  changes level between sections, so any single threshold merges phrases or loses them.
  Several parameter sets were tried; the counts that matched did so by coincidence and the
  boundaries were wrong.
- **Whisper drifts** — two runs put "Hold." at 1.20s and 3.40s. Its bias is consistently
  *early*: measured onsets ran 0.2–0.6s after its word starts.

What works: whisper for **which line and in what order**, then a
**characters-per-second sanity check** (English is 11–22 cps; anything outside is a bad
edge, not a short line), then the envelope for any line still in doubt. Lead-in is trimmed
only where a measured onset is >0.3s later *and* cps stays ≤24 — which kept all of Rook's
whisper timings (tight) and trimmed five of Vayne's (early).

Clips are padded −0.10s at the front and +0.15s at the back. **Cut wide when unsure**: bed
before a word disappears under the fade, a clipped consonant sounds broken.

### How it plays

`intro/vo.js` decodes each take once and plays sub-ranges — no pre-cut files, so the fade
lengths stay tunable without re-encoding. A beat carries `vo: [offset, length]` in
`story/script.js`, in seconds into that speaker's FILE, which is why `retime()` correctly
leaves it alone.

- Fades: 0.10s in, 0.18s out. The bed clicks on a hard cut.
- `start(when, offset, len + 0.03)` — the tail keeps the fade-out on real samples.
- **Voice is routed past `master`, not through it.** `duck()` pulls master down so the
  score gets out of the way of a line; a voice inside master would duck itself. Both buses
  fade together on skip, and `voice.stop()` runs on skip and on cleanup so a line never
  outlives the cinematic.
- Nothing waits on the fetch. If it 404s or the decode fails, `say()` is a no-op and the
  cinematic plays exactly as it did before.

Tightest margin in the whole cut is 0.31s (between "Holding it isn't wielding it." and
"I'd have picked anyone else."). **If you retime the script, re-check that no clip runs
into the next line** — the check is `beat[i].t + len[i] < beat[i+1].t`.

### Test

`votest.mjs` patches `AudioBufferSourceNode.prototype.start` before any page script runs
and records every call that passes both an offset and a duration — the synthesised score
plays whole buffers, so any such call is a VO clip. It taps the boot gate, then watches:

```
FETCHED  ["rook.mp3 200","vayne.mp3 200"]
19 clips, script order, offsets exact, rook lines from the 15.56s file and
vayne lines from the 36.24s file
```

---

## playtest-fixes-13 — Rook talks during the game too

The barks were the last unvoiced text in the build. They are voiced now, from a third Suno
take generated as a *continuation of Rook's intro part* — which is why it is the same voice
and not a stranger with the same lines. The take opens with the last three lines of the
intro (the seed the model needed to copy itself); those seconds were trimmed off and every
offset shifted to match.

**Files**

- `game/audio/vo/barks.mp3` — 44.8s, 21 lines, 249 KB (mono/32 kHz/VBR q8, from 1.1 MB)
- `game/js/core/audio/vo.js` — new; loads the one take, plays `say(offset, length)` slices
- `game/js/core/audio/mix.js` — new `voice` bus, wired straight to master
- `game/js/core/audio.js` — creates the VO on context start, fetches on `resume()`,
  exposes `audio.voice(at, len)` / `audio.stopVoice()` / `audio.speaking`
- `game/js/sim/barks.js` — `LINES` entries are now `{ t, vo: [offset, length] }`

**Why `voice` is its own bus.** `mix.duck()` pulls music and ambience down so a line is
audible over them. A voice routed through the ducked stage ducks itself — the same trap the
intro hit, documented in `intro/audio.js`. `voice` connects to `master` directly.

**Why one file and not 22.** One fetch, one decode, and the fades stay tunable without
re-encoding. `say()` also cuts any line still speaking, which matters because two barks
inside the 4s priority cooldown would otherwise talk over each other.

**Three lines were reworded to match what was actually recorded** — `selfBurn[2]`,
`streak[0]`, `streak[1]`; the table is in `docs/VOICE-AND-MUSIC.md` §3. A bubble that
disagrees with the voice reads as a bug, so the recording wins. `blocked[1]` — *"Right.
Through it, then."* — is a fragment in the take and carries no `vo`; it plays as a silent
bubble, which is exactly what every bark did yesterday.

**Finding the timings** was the same problem as the intro and the same answer, plus one new
step now written into `docs/VO-TIMING-RECIPE.md`: **round-trip every cut**. Slice it out
with ffmpeg, transcribe that slice alone, compare first word / last word / length. All 21
came back clean against the shipped file, which also proves the trim and the re-encode did
not move the timeline. It is what caught `blocked[1]` being half a line, and what turned up
"I'm" where the script said "I am".

**Verified** (`scratchpad/barkvo.mjs`, play scene, headless):

```
STATE   {"scene":"play","audio":"running","fetched":["barks.mp3 200"]}
BARK    emitted (t=5.5, alive=true)
SLICES  [{"off":0.24,"dur":0.08,"len":44.83},{"off":33.22,"dur":1.85,"len":44.83}]
```

The second slice is `level[0]` — a real `player:level` event through barks.js, not a direct
call. Still unrecorded anywhere in the build: nothing. Every line of text now has a voice
except the one fragment above.
