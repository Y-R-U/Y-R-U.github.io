# SKYHAMMER — CONTRACTS

**This file is law.** Every agent reads it before touching code and never changes a signature
in it without the manager's written ruling (recorded in `DECISIONS.md`). Cross-file contracts
are where multi-agent builds die; this is the fence.

---

## 0. What the game is

Mobile-first **landscape** 2D side-scrolling plane game in the shape of *Aircraft Evolution*.
You fly left-to-right over a long level, your main gun auto-fires, you bomb ground targets with
special weapons on big thumb buttons, you dogfight enemy planes, you collect balloons, and
between levels you spend money in a hangar on plane / speed / armour / weapon upgrades.
Story mode is WW2 and runs to 100 levels across escalating eras. It does not take itself
seriously: nuclear bombs are on the upgrade tree and you survive your own blast.

Reference screenshots studied: Aircraft Evolution (Satur Entertainment). Read `ART.md` §1.

---

## 1. Hard technical rules

1. **No build step.** Vanilla ES modules loaded by `index.html`, served straight from GitHub Pages.
2. **No CDN imports, ever.** (Repo-wide gotcha: a CDN `three` import hangs a whole game with zero
   errors.) Everything is a relative path inside this folder.
3. **No npm, no node_modules.** Test tooling is raw CDP over a WebSocket — `tools/cdp.mjs`.
4. **Canvas 2D**, one `<canvas>`, no WebGL.
5. `js/sim/**` **must not touch the DOM, `window`, `document`, `Image`, `Audio`, `performance`,
   or `Math.random`.** It must import and run under plain node. This is what makes balance
   testable without a browser. `js/gfx/**` and `js/ui/**` may use the DOM freely.
6. All randomness goes through `core/rng.js` (seeded). A level replays identically from a seed.
7. Fixed timestep sim at **60 Hz** with an accumulator; render interpolates. `dt` is always
   `1/60` inside the sim. Never pass a variable dt into sim code.
8. Every file starts with a one-line comment saying what it owns. Comments elsewhere are rare and
   only where the code is genuinely surprising.

---

## 2. Coordinate system

**World space is y-up.**

- `x` increases to the right. A level runs `x = 0 … level.length` (typ. 14000–30000).
- `y` is altitude in world units. `y = 0` is sea level / base ground. `y` increases **upward**.
- Terrain surface height at a given x is `terrain.heightAt(x)` → world y of the ground
  (typically `-60 … 420`; water levels return 0).
- Ceiling is `world.ceiling` (default `2400`). The plane stalls above it.

**Screen space is y-down** (canvas native). Only `js/gfx/**` converts:

```js
sx = (wx - cam.x) * cam.scale
sy = (cam.y + cam.vh - wy) * cam.scale      // cam.y = world y of the viewport BOTTOM edge
```

### Viewport sizing

- `cam.vh` (visible world height) is **fixed at 900 world units**, always.
- `cam.vw = 900 * (screenW / screenH)`, clamped to `[1150, 2200]`.
- `cam.scale = screenH / 900` (CSS px per world unit).
- Design every sprite, every prop and every HUD gap against those 900 units.

---

## 3. Camera rule (Aaron's spec, item 6 — tunable, expect to retune)

All five numbers live in `js/data/tuning.js` under `CAM` and nowhere else.

- **x:** `camXTarget = plane.x - cam.vw * CAM.anchorX + plane.vx * CAM.lookahead`
  (`anchorX 0.36`, `lookahead 0.35`). Lerp at `CAM.lerpX = 6 /s`. Clamp to `[0, level.length - cam.vw]`.
- **y:** the camera sits still at `CAM.baseY = -170` (so ~170 units of earth show below the
  horizon) **until the plane climbs into the top `CAM.topBand = 0.12` of the viewport**, then it
  tracks so the plane stays exactly at that band edge.

```js
const bandY = cam.y + cam.vh * (1 - CAM.topBand);
camYTarget = plane.y > bandY ? plane.y - cam.vh * (1 - CAM.topBand) : CAM.baseY;
```

  Lerp **up fast** (`CAM.lerpUp = 9 /s`) and **down slow** (`CAM.lerpDown = 2.5 /s`) so a dive
  does not yank the horizon. Clamp `cam.y >= CAM.baseY`.
- **Shake** is a separate additive offset applied at draw time only. It never enters `cam.x/y`.

---

## 3b. Flight control — RELATIVE POINT-AT-FINGER (Aaron's ruling, D7 + D10)

**The nose follows your finger, measured from where you first put it down.** Touch anywhere in the
play area: that point becomes the anchor. The **offset from the anchor to your finger is a
direction vector, and the aeroplane's nose turns to point along it.** Drag the finger in a circle
around the anchor and the plane flies a loop. Lift and the plane holds its heading.

This is a *relative* control, not an absolute one: the direction depends only on the finger's
offset from its own anchor, **never on where the plane is on screen**. That is what lets you put
your thumb down anywhere comfortable — low on the left, say — and fly from there.

```js
// core/input.js keeps this per steering pointer
aim = { active, ax, ay,      // anchor, screen px, set on touchdown
             sx, sy }        // current finger, screen px

// sim/plane.js, once per tick — note the y flip: screen y is down, world y is up
const dx = aim.sx - aim.ax, dy = aim.ay - aim.sy;
const mag = Math.hypot(dx, dy);
if (aim.active && mag > CTRL.deadPx) p.want = Math.atan2(dy, dx);
p.ang = turnToward(p.ang, p.want, p.def.turnRate * dt);   // shortest arc, rate limited
```

- **`turnRate` (rad/s) is the Manoeuvrability stat.** Biplane ≈ 2.6, late jets ≈ 4.2. The finger
  sets the *target* heading instantly; the aeroplane still takes time to get there. That gap is
  the whole feel of the game and the reason the upgrade matters.
- **Dead zone** `CTRL.deadPx = 16`: inside it, hold the previous target. No spinning at the anchor.
- **Floating anchor** `CTRL.maxPx = 96`: if the finger gets further than this from the anchor, drag
  the anchor along behind it so a long sweep never runs off the edge of the screen.
- **Magnitude does not control anything.** Only the angle is read. Distance past the dead zone
  changes nothing, so a small thumb movement and a big one steer identically.
- Speed is not steered. `p.speed` eases toward `def.cruise`, gains a little diving and loses a
  little climbing (`speed += -sin(ang) * PHYS.gravAssist * dt`), clamped to `[def.stall, def.vmax]`.
  Below stall the nose drops on its own. That is the whole flight model — no throttle stick.
- **Never steer from a touch that started on a HUD control.** `core/input.js` claims the first
  touch landing outside every rect registered with `js/ui/hitrects.js` as the steering pointer and
  keeps that `pointerId` until it lifts. Slot buttons are separate simultaneous touches, so you
  can bomb without letting go of the stick.
- **Either thumb may steer.** Because the control is relative, it works from either side of the
  screen. `settings.handedness` mirrors the four special-weapon buttons to the other corner; it
  does not restrict where you may steer from.
- Mouse/desktop: identical, with the anchor set on mousedown. Keyboard arrows are a fallback that
  drive a synthetic offset.
- `input.aim` is **screen px throughout**. The sim reads only the resulting angle — it never sees
  a screen coordinate and never needs a world conversion for steering.

All four numbers live in `js/data/tuning.js` under `CTRL`.

---

## 4. The world object — the single shared shape

`sim/world.js` owns it. Nothing else constructs one.

```js
world = {
  t: 0,                 // seconds elapsed, sim clock
  frame: 0,
  rng,                  // core/rng.js instance
  level,                // the frozen level def from data/levels.js
  terrain,              // sim/terrain.js instance
  cam:  { x, y, vw, vh, scale, shakeX, shakeY, shakeMag },
  player,               // an ent, kind:'player'; also present in ents
  ents: [],             // actors  — see §5
  projs: [],            // projectiles — see §6
  debris: [],           // physics chunks, no collision against actors
  events: [],           // drained every frame by gfx + audio, see §8
  mission: {...},       // sim/mission.js — objectives, progress, outcome
  stats: {...},         // kills, money earned, accuracy, time
  over: null,           // null | 'win' | 'dead' | 'bingo'
}
```

`world.step()` advances **exactly one 60 Hz tick**. It is pure w.r.t. the DOM.
`world.events` is **append-only during a tick and drained after it** by the caller.

---

## 5. Actors — `world.ents`

```js
ent = {
  id, kind, def,            // def = the frozen row from data/*.js
  x, y, vx, vy, ang,        // ang in radians, 0 = nose right, +ve = nose up
  hp, hpMax, team,          // team: 0 player, 1 enemy, 2 neutral
  w, h, r,                  // AABB half-extents and a broad-phase radius
  dead: false, t: 0,
  ai: null,                 // enemy planes only
  parts: null,              // multi-part bosses / destructible structures
}
```

`kind` is one of:

| kind | what | notes |
|---|---|---|
| `player` | the player aeroplane | exactly one |
| `fighter` | enemy aeroplane | has `ai` |
| `ground` | building, tank, bunker, factory | destructible, sits on terrain |
| `flak` | ground AA gun | shoots up at you |
| `balloon` | collectible floating pickup | drifts, gives money/ammo |
| `boss` | multi-part boss | `parts` array |
| `pad` | landing zone (green box) | see §9 |
| `pickup` | dropped money/ammo/health | falls under gravity |

Register every kind's behaviour in `sim/behaviour.js` as `BEHAVIOUR[kind] = (ent, world) => {}`.
**Adding a new kind must not require editing `world.js`.**

---

## 6. Projectiles — `world.projs`

```js
proj = { id, x, y, vx, vy, ang, team, dmg, ttl, kind, def, dead, homing, gravity, radius }
```

`kind`: `bullet` | `shell` | `bomb` | `rocket` | `cluster` | `nuke` | `tracer`.
Gravity applies when `def.gravity` is truthy. Collision is broad-phase-by-x then AABB.
A projectile that expires or hits calls `damage.applyBlast(world, x, y, def)` and pushes an
event. **Explosions are always resolved through `sim/damage.js`, never inline.**

---

## 7. Weapons

`data/weapons.js` exports frozen rows keyed by id:

```js
{ id:'bomb_std', name:'Bomb', slotType:'special', ammo:3, cooldown:0.35,
  proj:'bomb', dmg:120, blastR:180, blastFalloff:0.5, shake:0.5, price:250,
  icon:'bomb', tier:1, sfx:'drop' }
```

- The **main gun auto-fires**; it is never in a slot. Its row is `slotType:'main'`.
- The player has **4 special slots**. Loadout is `save.loadout = [id|null, id|null, id|null, id|null]`,
  chosen in the hangar. In flight, slot buttons are the 4 big thumb buttons bottom-right.
- Firing goes through `sim/weapons.js: fire(world, ent, weaponId)`. It is the only place that
  creates projectiles.

---

## 8. Events — the sim → presentation channel

The sim never plays a sound and never spawns a particle. It pushes plain objects:

```js
{ e:'explode', x, y, r, big:false, kind:'ground' }
{ e:'hit',     x, y, team, dmg }
{ e:'kill',    x, y, kind, def }
{ e:'fire',    x, y, weapon, ang }
{ e:'pickup',  x, y, what, amount }
{ e:'shake',   mag }
{ e:'haptic',  pattern:'hit'|'kill'|'boom' }
{ e:'ui',      what:'objective'|'wave'|'lowfuel'|'landed' , ... }
```

`gfx/fx.js`, `core/audio.js` and `core/haptics.js` each read the drained list. Adding a new event
never requires a sim change downstream.

---

## 9. Landing (Aaron's spec, item 11)

A `pad` ent is a carrier deck, airstrip or road, 340×160 world units. Off its **left end** sits a
**translucent green square** — `GATE.size` = 90 units a side (one tenth of the 900-unit viewport,
so ~40 CSS px on a phone), centred `GATE.lead` = 20 units left of the deck and `GATE.rise` = 55
above it. Auto-land triggers when **both** hold: the plane's **centre** is inside that square, and
`vx > 0` (moving toward the ship). Nothing else — not speed, not attitude. The square goes amber
only while you are flying away from the ship.

The square's POSITION is derived, not chosen: the settle carries the aeroplane
`landSpeed × 1.2 / 2` (148–269 units across the tiers) further along the deck, so triggering
anywhere in the square puts every tier's touchdown inside the deck's ±170.

Revision 1 was "plane AABB overlaps the pad, `|ang| < 0.25`, `vx > 0`, `speed < landSpeed`" — a
460×190 slab, i.e. "be roughly near the boat". Revision 2 derived a 300-unit window over the stern
and kept the speed and attitude tests. Aaron rejected both: *"as long as you are moving toward boat
and hit the small square you are good, almost cheat mode auto land. but if the box is pretty small
like 40px x 40px then only hitting the box when moving the correct direction is the challenge."*
The difficulty is all in placing the aeroplane, none of it in a checklist you cannot see.

`js/sim/landing.js` exports `approachBox(pad, plane)`; **the sim tests it and the gfx draws it, and
neither restates it**. On trigger the sim takes control and flies a scripted 1.2 s settle to the
deck. Taking off again is a single **TAKE OFF** button that scripts a 1.0 s launch. Landing
refuels, rearms and is how some missions are completed. Gate: `tools/landing_gate.mjs`.

---

## 10. File ownership

**One owner per file. An agent edits only what it owns.** Anything else is a request to the manager.

| Path | Owns |
|---|---|
| `index.html`, `css/`, `js/main.js`, `js/core/**` | **ENGINE** |
| `js/sim/**`, `tools/sim.mjs` | **SIM** |
| `js/gfx/**` | **ART** |
| `js/ui/**` | **UI** |
| `js/data/**` | **DESIGN** |
| `js/modes/**` | **MODES** |
| `tools/cdp.mjs`, `tools/shot.mjs`, `tools/touch.mjs` | shared, **frozen** — copied from KITEHAWK, do not edit |
| `docs/DECISIONS.md`, `docs/MANAGER.md` | **manager only** |

`js/main.js` is the only glue. If two agents both need a line in it, they each write their module
and the manager wires it.

---

## 11. Module APIs that agents may rely on

```js
// core/rng.js
export function makeRng(seed)            // → { f(), i(n), range(a,b), pick(arr), seed }

// core/input.js
export const input = {
  aim: { active, ax, ay, sx, sy },      // anchor + current finger, screen px, see §3b
  slots: [bool,bool,bool,bool], takeoff, pause
}

// ui/hitrects.js  — the fence between steering touches and buttons
export function register(id, rect)       // rect in CSS px
export function hitTest(x, y)            // → id | null
export function clear()

// core/audio.js
export const audio = { unlock(), sfx(id, opts), music(trackId), setMusic(on), setSfx(on), duck(x) }

// core/save.js
export const save = { data, load(), flush(), money, loadout, upgrades, planeId, levelsDone }

// sim/world.js
export function createWorld({ level, seed, save }) // → world
// world.step() ; world.drainEvents() → array

// sim/terrain.js
export function makeTerrain(level, rng)  // → { heightAt(x), waterAt(x), sample(x0,x1,n) }

// gfx/renderer.js
export function makeRenderer(canvas)     // → { resize(), draw(world, alpha, events) }

// data/levels.js
export const LEVELS = [...]              // see §12
```

---

## 12. Level definition

```js
{ id:'a1-03', act:1, name:'Coastal Push', biome:'farmland'|'coast'|'city'|'sea'|'alpine'|'desert',
  length:16000, seed:9012, timeOfDay:'dawn'|'day'|'dusk'|'night',
  weather:'clear'|'overcast'|'storm',
  objectives:[ {type:'destroy', kind:'ground', tag:'depot', count:4},
               {type:'survive', seconds:60}, {type:'land', padId:'carrier'},
               {type:'kill', kind:'fighter', count:6}, {type:'collect', count:5} ],
  spawns:[ { at:2400, kind:'ground', def:'bunker', y:'ground' }, ... ],
  waves:[ { at:5000, kind:'fighter', def:'ju87', n:3, spacing:400 } ],
  reward:{ money:400, xp:120 }, par:120, intro:'...' }
```

`spawns[].y` may be the literal string `'ground'` (snap to terrain) or a number (world y).

---

## 13. The rules this project inherits, already paid for

- **Falsify every gate.** A check that has never been proven to fail against a deliberately broken
  build is not evidence. Break it on purpose once, record that it failed, then trust it.
- **Read detail lines, not pass counts.** A green summary has hidden a third of a map being
  unreachable before.
- **Never `git add -A`** in this repo — other sessions have live uncommitted work. Stage
  `gms/2d/skyhammer/`, the one `projects.js` hunk and the screenshot, explicitly.
- **Agents do not run git.** The manager commits.
- Popups, never `alert()`.

---

## 14. Rendering — Three.js, side-on 2.5D (supersedes every Canvas-2D assumption above)

**Ruling D12.** The game renders with **Three.js r180, vendored locally at `vendor/three/`**.
Gameplay is unchanged: it is still a pure XY side-scroller. 3D buys us real lighting, real
shadows, real particle explosions with an actual light flash, mesh debris, and free parallax.

### Absolute rules

1. **Never import three from a CDN.** Repo-wide gotcha: a CDN `three` import hangs the entire
   game with zero console errors and no stack. Import maps resolve to `../vendor/three/`.
2. `js/sim/**` is **unchanged and still DOM-free and node-runnable.** 3D touches nothing but
   `js/gfx/**`. The `makeRenderer(canvas)` API of §11 is unchanged.
3. **World units are three.js units, 1:1**, with the y-up convention of §2 already matching.
   Gameplay lives at **z = 0**. No conversion helper is needed any more; the sim's x/y *are*
   the mesh's x/y.

### Camera

A **PerspectiveCamera with a narrow FOV (18–24°) placed far back on +z**, not an orthographic
one. A narrow-FOV perspective camera reads as flat side-on, has negligible distortion in the
gameplay plane, and — unlike ortho — gives **true parallax from z alone**, which is how the
background layers separate for free. Fit the frustum so the visible height at `z = 0` is exactly
`CAM.vh = 900` world units; §3's camera rule then applies verbatim to the camera's x/y.

### Scene layout by z

| z | contents |
|---|---|
| `-6000 … -2000` | sky backdrop, far cloud planes, distant skyline |
| `-1500 … -400` | mid cloud bands, mountains, treelines |
| `0` | **all gameplay**: terrain, props, aircraft, projectiles, FX |
| `+200 … +600` | near foreground: grass, occasional cloud wisps passing in front |

### Lighting and atmosphere

- One **DirectionalLight as the sun**, low and warm, casting shadows onto terrain and props.
  One shadow map, tightly fitted to the visible span — not the whole level.
- A **HemisphereLight** for sky/ground bounce, keyed off the biome palette.
- **Fog** (`FogExp2` or linear) tuned to the horizon colour. This is what gives the reference's
  hazed mountains, and it is nearly free — use it rather than hand-painting haze.
- **UnrealBloomPass** (already vendored at `vendor/three/addons/postprocessing/`) on fire,
  explosions and the player's rim light. It **must** be behind the settings' "reduce effects"
  toggle, and the game must look correct with it off.

### Models

- Built **in code**, low-poly, flat-shaded, from `BufferGeometry` / `Box` / `Lathe` / `Extrude` /
  `Shape`. No model files, no loaders, no textures to key. This is the same reason as before:
  procedural geometry cannot have a matte artifact and recolours per era for free.
- **Vertex colours and merged geometry.** Batch aggressively — the target is a handful of draw
  calls for the whole ground layer, not one per prop. Instance repeated props.
- Damage states are real: props lean, shed pieces, and break into mesh debris that tumbles,
  bounces once on terrain and settles.

### The 2D layers that remain

- **Sky and clouds** stay image-backed: textured planes at large negative z, their textures
  supplied by `js/gfx/plates.js` — procedurally baked to an offscreen canvas today, and
  replaceable with a Flux-generated plate later without a rewrite. The procedural bake stays the
  permanent fallback; a missing plate must never blank a layer.
- **The HUD is a separate 2D overlay canvas** stacked over the WebGL canvas — a WebGL context and
  a 2D context cannot share one canvas. `index.html` carries `#gl` and `#hud`;
  `js/ui/hud.js: drawHud(ctx2d, world, screen)` is unchanged, it simply receives `#hud`'s context.

### Performance

60 fps on a mid phone. Cap `devicePixelRatio` at 2. Shadow map 1024 and tightly fitted. No
per-frame geometry or material creation. Pool every particle and debris chunk. Frustum-cull by
level x-span, and never build the whole level's geometry at once — stream it in chunks.

---

## 15. Rulings that close the DESIGN agent's open questions

These were extrapolations by the DESIGN agent against an under-specified contract. They are now
law. SIM implements them; nobody re-derives them.

### 15.1 Boss parts (D17) — ratifies the shape already in `data/enemies.js`

```js
part = { id, dx, dy, hp, w, h, tag, shape, weak?:bool, shoots?:enemyId }
```

- A part sits at `boss.x + dx`, `boss.y + dy`, and rotates with the boss.
- **Parts take damage independently.** A blast damages *every* part whose AABB falls inside its
  radius — that is what makes a big bomb feel right against a big target.
- `boss.hp: 0` is deliberate and means **the boss has no body hit points of its own.**
  **The boss dies when every part marked `weak: true` is dead.** Nothing else kills it.
- Destroying a non-weak part is not cosmetic: it **permanently disables that part's `shoots`**,
  leaves a burning wreck attached to the boss, and pays its share of the money. Stripping the
  turrets before going for the core is the intended way to fight one.
- Each part destroyed pushes its own `explode` event, sized from the part's `w`/`h`.

### 15.2 Objective semantics (D18) — the matching rule, stated once

Objectives are a **conjunction**: the level is won the moment *every* objective is complete.
There is no separate "fly to the end" requirement.

| objective | completes when |
|---|---|
| `{type:'destroy', tag, count}` | `count` ents with `def.tag === tag` have died |
| `{type:'destroy', kind, count}` | `count` ents with `ent.kind === kind` have died |
| `{type:'destroy', kind, tag, count}` | both must match on the same ent |
| `{type:'kill', kind, count}` | **exact alias of `destroy`** — it reads better for aircraft, it is not a second code path |
| `{type:'collect', count}` | `count` `balloon`-kind ents collected. A bare `collect` means balloons |
| `{type:'survive', seconds}` | the player has been alive `seconds` sim-seconds since level start |
| `{type:'land', padId}` | the player has completed an auto-land on the pad with that `padId` |

- **A death counts however it happened** — player weapon, blast, collision, a boss part falling on
  it, or an enemy flying into terrain. Do not require the player to have landed the blow; that
  distinction is invisible to the player and produces objectives that feel broken.
- Money and XP follow the same rule. Simpler, and it never punishes a lucky shot.
- `mission.js` exposes per-objective `{done, have, need}` so the HUD and the brief can render
  progress without knowing the matching rule.

### 15.3 Weapon behaviour fields (D19) — SIM implements all five

The DESIGN agent's "fun" weapons carry fields beyond the seeded set. They are not aspirational;
each is a few lines and each is the entire point of the weapon it appears on.

| field | behaviour |
|---|---|
| `flavor` | **presentation only.** Shop and brief text. No sim code. |
| `moneyMult` | money from any kill caused by this weapon's blast is multiplied by it |
| `fuseDelay` | on impact the projectile sticks and waits this many seconds before detonating |
| `returns` | at max range the projectile reverses and flies back along its path, still live |
| `stunR` / `stunTime` | ents within `stunR` stop shooting and moving for `stunTime` seconds — needs an `ent.stun` countdown that `behaviour.js` checks first |

### 15.4 Palettes are composed, never enumerated (D20)

Act 1 alone wants 6 biomes × 4 times of day × 3 weathers. **Do not author 72 palettes.** Author
13 and compose them:

```js
BIOME[biome]      // ground albedo, prop tints, vegetation colour, water flag, skyline silhouette
TOD[timeOfDay]    // sun colour + elevation + intensity, sky gradient stops, ambient/hemisphere
WEATHER[weather]  // fog density multiplier, cloud cover, light attenuation, desaturation, precip

resolvePalette(biome, timeOfDay, weather)   // → the flat palette object the renderer consumes
```

The renderer only ever sees the resolved object, so this costs it nothing and every new
combination is free. `weather` is a **modifier**, never its own palette.

---

## 16. Terrain framing is a hard constraint (D21)

The earth band's share of the frame is `(surfaceY - CAM.baseY) / CAM.vh`. The reference sits near
**10–12%**, and that low band with a big warm sky above it is most of what makes the game look
like the reference rather than like a platformer.

Measured on the first build: mean terrain **y = +65.6**, peaks **+190**, against `CAM.baseY = -170`
— an earth band of **26% average and 40% at the peaks**. That reads as an art failure and is not
one. It is a number in the terrain generator.

**The ruling, now in `data/tuning.js` as `TERRAIN`:**

- `CAM.baseY = -100` (was `-170`).
- Terrain surface `y` keeps **mean ≈ 0** — `y = 0` stays "base ground", which is what makes
  `spawns[].y = 'ground'` in level data intuitive.
- Range `[-90, +120]`. Valleys may clip off the bottom of the frame; that is normal and correct
  for the genre. Ordinary crests then occupy ~24% of frame at their highest, which is dramatic
  where it should be.
- `peakY = 200` is **alpine only**, and must be rare and short.
- **Mountains are a background parallax layer owned by `gfx`, not gameplay terrain.** Gameplay
  terrain never needs to be tall. If you want a big skyline, it goes behind, at negative z.

### The gate is per-level intent, not a global threshold (D25)

Aaron's ruling: **10–30% earth band on average is all fine, depending on the layout.** So a flat
threshold is the wrong instrument — 26% is inside his acceptable range, and 26% is exactly what
the D21 bug measured. A global number would either permit the bug or forbid a legitimately hilly
level.

Instead **each level declares its terrain character** and the gate checks the generator produced
what was asked for:

```js
level.terrainProfile = 'flat' | 'rolling' | 'hilly' | 'alpine'   // default 'rolling'
```

`TERRAIN.profiles` in `data/tuning.js` gives each an amplitude multiplier and an expected band
range. `tools/sim.mjs` samples every level and **fails when the measured mean band falls outside
its declared profile's range**. That catches "the generator is not doing what the level asked
for", which is the real bug class, while leaving the whole 8–32% span available to design.

Falsify it once — set a `flat` level's amplitude to `alpine` and confirm it fires.

The player's aeroplane stays **~120 world units long** — 6.2% of screen width, against the
reference's 6.5%. **Do not scale the aircraft up.** Small is the look; the frame reads as sky and
air, and a bigger plane immediately reads as a different, cheaper game.

### 13.1 Every debug capture prints its resolved state

Added after a real incident: a shell word-splitting bug fed `biome="city dusk"` into three
captures, which silently fell back to the default palette and produced three identically-wrong
stills. **The filenames all looked correct.** Only a resolved-state readout burned into the frame
would have caught it.

So: every lab page and every debug capture renders its **resolved** configuration on-screen —
palette key actually used, seed, level id, viewport size, dpr. Not the requested one. The
requested value is what lies to you.
