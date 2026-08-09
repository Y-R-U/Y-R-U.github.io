# SUNDERFALL — architecture contract

**This file is the contract. Agents must not change it.** If you believe something here is wrong,
write the objection into `HANDOFF.md` and work around it; do not silently redesign.

Independent build. **No code copied from any other project in this repo.** Vanilla ES modules, no
build step, no npm, no bundler. Served as static files.

---

## 1. The pitch, so everyone builds the same game

A 2D side-scrolling roguelite platformer, mostly one long handcrafted level through a medieval
forest. You are **Rook**, a sulking teenager from the village of Thornmere who finds a dying wizard,
**Elderman Vayne**, and gets a lifestone melded into his chest whether he likes it or not. You learn
and level spells. Things break — that is the signature mechanic.

Art direction is **painterly**, not pixel art: hand-painted parallax depth (Ori / Blasphemous II),
near-black foreground occluders, one warm light source per scene against cool shadow, and heavy
volumetric light. Characters and FX are drawn procedurally in code so they can be lit dynamically by
whatever spell is going off. This is deliberate — it is why the game will read as expensive.

**Both orientations are first-class.** Desktop landscape (16:9) and mobile portrait (9:19.5). Portrait
is not a squeezed landscape: the camera zooms in, the HUD relocates, and touch controls appear.

---

## 2. Layout — who owns what file

Nobody writes outside the files they own. If you need something from another module, use the
contract below; if the contract is missing something, add it to `HANDOFF.md` as a **REQUEST**.

```
sunderfall/
  ARCHITECTURE.md      this file — read-only for agents
  HANDOFF.md           append-only log; every agent writes a section before stopping
  index.html           the art reference lab (already built, do not touch)
  lab.css lab.js       ditto
  refs/                reference material, do not touch
  art/
    tools/flux.py      local image generation helper (already written)
    tools/*            baking / atlas / trimming scripts
    src/*              prompt lists, generation manifests
  game/
    index.html         the game shell
    css/game.css
    assets/            GENERATED ART, committed — atlases, layers, json
    js/
      main.js          boot + scene manager
      core/  gfx/  sim/  spells/  ui/  intro/  story/  data/
```

## 3. Coordinates, units, timing

- World units are **pixels at reference scale**. The reference view is **1920×1080 worth of world**
  visible in landscape. Portrait shows **~820 world px wide**.
- **+Y is down.** Gravity is positive. Say it out loud before you write a jump.
- Ground level for the first level sits near `y = 0`; the world extends to negative Y upward.
- Simulation runs at a **fixed 60 Hz** (`DT = 1/60`). Rendering is uncapped and interpolates.
  Never read wall-clock time inside `update(dt)` — `dt` is always exactly `DT`.
- All speeds are **units per second**, not per frame.

## 4. Engine API — frozen once `core/` and `gfx/` land

`main.js` builds these once and passes them to every scene. Treat them as the only globals.

```js
const ctx = {
  R,        // renderer      (gfx/renderer.js)
  P,        // particles     (gfx/particles.js)
  input,    // core/input.js
  view,     // core/viewport.js
  bus,      // core/events.js
  rng,      // core/rng.js
  audio,    // core/audio.js
  assets,   // loaded textures / atlases
};
```

### 4.1 Renderer — `gfx/renderer.js`

WebGL2, single instanced sprite batcher, drawn back-to-front by layer.

```js
const R = await createRenderer(canvasEl);

R.resize(cssW, cssH, dpr);
R.begin(cam);            // cam = {x, y, zoom}  — world point at screen centre
R.sprite({
  tex,                   // texture handle from assets
  sx, sy, sw, sh,        // source rect in pixels (omit = whole texture)
  x, y, w, h,            // world position of the CENTRE and world size
  rot = 0,               // radians
  r = 1, g = 1, b = 1, a = 1,
  layer = LAYER.ACTORS,
  add = false,           // additive blending — use for anything glowing
  parallax = 1,          // 0 = locked to camera, 1 = world speed
  flipX = false,
});
R.quad({x, y, w, h, rot, r, g, b, a, layer, add});      // untextured
R.line(x1, y1, x2, y2, thickness, {r,g,b,a}, layer);
R.poly(points, {r,g,b,a}, layer);                        // convex, world space
R.light({x, y, radius, r, g, b, intensity = 1, flicker = 0});
R.end();                 // runs the post chain and presents
```

`LAYER` (exported from `gfx/renderer.js`) — the depth bands the art direction depends on:

```
LAYER.SKY  BG_FAR  BG_MID  BG_NEAR  TERRAIN_BACK  ACTORS_BACK
LAYER.TERRAIN  ACTORS  FX  TERRAIN_FRONT  FG_OCCLUDE  UI_WORLD
```

### 4.2 Screen effects — `R.fx`

```js
R.fx.shake(strength, seconds);         // camera trauma, accumulates, decays quadratically
R.fx.shockwave(x, y, strength);        // world-space ring distortion
R.fx.flash(r, g, b, a, seconds);       // full-screen additive hit
R.fx.chroma(amount, seconds);          // chromatic aberration pulse
R.fx.timeScale(scale, seconds);        // hitstop — 0.05 for 0.06s on a big impact
R.fx.vignette(amount);                 // sticky, set per-scene
```

### 4.3 Particles — `gfx/particles.js`

One pooled GPU-instanced system, 20k particles. Emitters are plain data.

```js
P.emit({
  x, y, count,
  vx, vy, vSpread,       // base velocity + random cone
  speed, speedVar,
  life, lifeVar,
  size, sizeEnd,
  color:  [r,g,b,a],     // start
  color2: [r,g,b,a],     // end, lerped over life
  gravity = 0,
  drag = 0,
  add = false,
  layer = LAYER.FX,
  tex = null,            // null = soft round blob
  collide = false,       // bounce off terrain (costs more)
  glow = 0,              // emits light if > 0
});
```

### 4.4 Input — `core/input.js`

Unified: keyboard, mouse, gamepad, touch. Never read raw DOM events in game code.

```js
input.held('left'|'right'|'up'|'down'|'jump'|'dash'|'cast'|'interact')
input.pressed(action)     // this tick only
input.released(action)
input.aim                 // {x, y} world-space point the player is aiming at
input.pointerDown         // bool
input.pointerWorld        // {x, y}
input.onTap(fn)           // returns an unsubscribe
```

### 4.5 Viewport — `core/viewport.js`

```js
view.mode        // 'landscape' | 'portrait'
view.w  view.h   // css pixels
view.worldW      // world units visible horizontally
view.safe        // {top,right,bottom,left} — notch insets
view.toWorld(screenX, screenY)
view.toScreen(worldX, worldY)
bus.on('view:change', ({mode}) => ...)
```

### 4.6 Bus — `core/events.js`

`bus.on(name, fn) -> off`, `bus.emit(name, payload)`, `bus.once(name, fn)`.

Reserved event names (do not repurpose):

```
view:change   scene:change    player:damage   player:level   player:died
spell:cast    spell:hit       spell:learn     spell:levelup
enemy:spawn   enemy:died      terrain:break   prop:break
story:beat    story:done      intro:done      pickup
```

## 5. Scenes

`main.js` owns a tiny scene machine. A scene is an object:

```js
{
  async enter(ctx, params) {},
  update(dt) {},        // dt is always 1/60
  render(alpha) {},     // alpha = interpolation 0..1
  exit() {},
}
```

Scenes: `intro`, `play`, `pause`, `gameover`. The intro is self-contained (§8).

## 6. Materials and destruction — the signature mechanic

Every breakable prop and every terrain chunk declares a **material**. Materials drive break
behaviour, debris, sound, and which spells are effective.

```js
MATERIAL = {
  MASONRY,  // brick/mortar — breaks into rectangular chunks along grid lines
  ROCK,     // conchoidal, irregular chunks, heavy dust plume
  TIMBER,   // splinters into long shards; BURNS instead of shattering
  FOLIAGE,  // trees/bushes — hinge and topple as one, foliage bursts separately
  GLASS,    // instant, tiny fast shards, bright specular flash
  METAL,    // dents and rings, only yields to heavy impact
  BONE,     // clatters, leaves remains that Gravewake can raise
}
```

Every destructible authors the full chain, never just intact→gone:

`intact → cracked (1–2 states, same silhouette) → shattering (the break frames) → debris (physics
bodies) → settled (persistent rubble that occludes and can be stood on)`

Contract for anything breakable:

```js
{
  material, hp, maxHp,
  aabb: {x, y, w, h},
  resist: {fire: 0.5, impact: 0, acid: 2, ...},   // multiplier on incoming damage
  onDamage(amount, type, hitX, hitY, dirX, dirY),
  onBreak(cause),
  supports: [],   // structures above that fall when this goes — walls must collapse, not float
}
```

**Fire spreads.** `TIMBER` and `FOLIAGE` ignite, burn over time, spread to neighbours within range,
and eventually collapse. **Acid pools** persist, ooze downhill, and eat `MASONRY`/`TIMBER` over time.
Secondary effects are the whole point — a spell that only damages the thing it hits is a failure.

## 7. Spells

Five cast circles. **Slot 1 is manual** — the player taps/clicks it (or the fire button) to cast.
Slots 2–5 are **auto-cast**: they fire on cooldown as soon as a valid target is in range, and unlock
at player levels 3, 7, 12, 18. Any learned spell can be dragged into any slot.

Spell definition contract (`spells/registry.js`):

```js
{
  id: 'emberbolt',
  name: 'Emberbolt',
  school: 'fire'|'storm'|'earth'|'decay'|'void'|'life',
  desc: '...',                       // one short line, in the game's voice
  unlockLevel: 1,
  manualOnly: false,
  cost: 8,                           // focus
  cooldown: 0.65,                    // seconds at rank 1
  range: 620,
  levels: 5,
  scale(rank) { return {damage, cooldown, count, radius, ...}; },
  targeting: 'aim'|'nearest'|'self'|'ground'|'area',
  cast(ctx, caster, target, stats) {},   // spawns the projectile/effect
  icon(c2d, size) {},                // draws its own icon — no icon PNGs
}
```

## 8. The intro

Self-contained. Owns its own canvas, may use its own WebGL context or a vendored three.js, must not
import from `gfx/` or `sim/`. It exports:

```js
export async function runIntro(mountEl, {skip}) -> Promise<void>
```

It resolves when finished or skipped. There must be a **signature wow moment inside the first five
seconds** — something that makes a person stop scrolling. Not a CSS fade. Story is told in short
cartoon speech bubbles (§ story/script.js), a few words each.

## 9. Performance budget

- 60 fps on a 2019 MacBook Air and a mid-range Android phone.
- ≤ 120 draw calls/frame. Batch aggressively; that is why there is one atlas per band.
- Total asset payload ≤ 12 MB. Parallax layers are the budget hogs — size them honestly.
- No allocation in the hot loop. Pool everything: particles, projectiles, debris, damage numbers.
- Test at 390×844 (portrait) and 1440×900 (landscape) before claiming anything works.

## 10. Rules for agents

1. **Only touch files you own.** Concurrent agents are editing this repo.
2. **Write your section of `HANDOFF.md` before you stop.** You are not resumable — the handoff is
   the only thing that survives you. Record: what you built, the public API, what is stubbed, what
   you would do next, and every gotcha you hit. Assume the reader has none of your context.
3. **No third-party art ships.** `refs/` is study material. Generated art from `art/tools/flux.py`
   is ours and is fine. The CC0 sheets in `refs/sprites/` may be used as *shape reference* to draw
   over, and the CC0 ones may ship if genuinely needed — CC-BY ones require a credit line.
4. **No placeholder art left in a "done" deliverable.** A grey box is not a deliverable.
5. **Verify visually.** Headless Chrome screenshots, and look at them. Note: headless Chrome clamps
   the viewport to 500px min width — to test 390px portrait, render the page inside a 390px iframe.
6. Comments: sparse. Explain *why*, never *what*. Match the surrounding code.
