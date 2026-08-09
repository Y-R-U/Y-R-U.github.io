# `sim/` — the world API

Owner: **B1-sim**. This is the contract the spell and enemy modules build against.
Everything below is implemented in `game/js/sim/`. If something you need is missing, add a
**REQUEST** to `HANDOFF.md` — do not edit files under `sim/`.

---

## 0. Getting hold of the world

```js
import { createPlayScene } from './sim/index.js';   // main.js does this for you
```

`createPlayScene(ctx)` is **async**, returns a scene `{ enter, update, render, exit }`, and as a
side effect sets:

```js
ctx.world            // the World object — everything below hangs off it
window.__sunderfall.world
```

`ctx.world` exists as soon as `createPlayScene` resolves, which is **before the intro runs**, so a
spell registry can capture it at boot. The level is not built until `enter()`. If you need to know
when entities exist, listen for `bus.on('sim:ready', ({world}) => ...)` — emitted at the end of
every `enter()`.

Convenience aliases on the world, so you rarely need `ctx`:

```js
world.ctx  world.R  world.P  world.bus  world.rng  world.input  world.assets  world.LAYER
world.player      // the Rook entity (or null before enter)
world.time        // seconds since enter, advances by DT only
world.frame       // fixed-step counter
world.dt          // 1/60, constant
```

---

## 1. Units and conventions

- World units are pixels at reference scale, **+Y is down**, gravity is positive.
- Everything is per **second**, never per frame. `dt` is always `1/60`.
- An **AABB is centred**: `x, y` is the centre, `w, h` the full width/height.
  `e.left = x - w/2`, `e.top = y - h/2`, `e.bottom = y + h/2`.
- Angles are radians, `0` = +X, increasing clockwise on screen (because +Y is down).
- Every function that returns a list takes an optional `out` array and reuses it. Every function
  that returns a record returns a **shared, reused object** — copy the fields if you keep it.

---

## 2. Materials

```js
import { MATERIAL, MATERIAL_NAMES, MAT } from './sim/materials.js';

MATERIAL.MASONRY MATERIAL.ROCK MATERIAL.TIMBER MATERIAL.FOLIAGE
MATERIAL.GLASS   MATERIAL.METAL MATERIAL.BONE
MATERIAL.EARTH   MATERIAL.FLESH        // additive: terrain soil, and creatures
```

They are small integers, usable as array indices. `MAT[MATERIAL.TIMBER]` is the descriptor:

```js
{
  id, name,
  density,          // affects debris mass / how hard it lands
  resist: Float32Array indexed by DAMAGE   // multiplier on incoming damage
  minDamage,        // impact below this is ignored entirely (METAL 26 — "dents and rings")
  flammable,        // 0..2 — how readily FIRE takes hold and spreads
  soluble,          // 0..1 — how fast ACID eats it
  conducts,         // 0..1 — LIGHTNING chains through it
  debrisShape,      // 'slab' | 'shard' | 'splinter' | 'clump' | 'sliver' | 'lump'
  dust:  [r,g,b],   // dust plume colour (pre-square: author it the way it should look)
  chip:  [r,g,b],   // spark/chip particle colour
  bounce, spin, dustScale, sparks, glow,
  sfx: { crack, break, debris, burn },   // string keys — audio agent to map these
}
```

### Resistance table (multiplier on incoming damage)

| material | IMPACT | FIRE | ACID | LIGHTNING | VOID | DECAY |
|---|---|---|---|---|---|---|
| MASONRY | 1.00 | 0.15 | 2.20 | 0.50 | 1.20 | 0.60 |
| ROCK | 0.80 | 0.10 | 1.40 | 0.60 | 1.20 | 0.30 |
| TIMBER | 1.10 | 2.50 | 1.80 | 1.20 | 1.00 | 1.60 |
| FOLIAGE | 1.30 | 3.50 | 2.00 | 1.40 | 0.90 | 2.20 |
| GLASS | 3.00 | 0.60 | 0.80 | 2.50 | 1.00 | 0.20 |
| METAL | 0.45 | 0.25 | 1.60 | 2.00 | 1.10 | 0.80 |
| BONE | 1.40 | 0.80 | 1.20 | 0.70 | 1.60 | 0.40 |
| EARTH | 1.00 | 0.30 | 1.30 | 0.50 | 1.00 | 0.80 |
| FLESH | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

`LIFE` damage is negative damage: it heals, and it is always ×1 on FLESH and ×0 on everything else.

## 3. Damage types

```js
import { DAMAGE, DAMAGE_NAMES } from './sim/materials.js';

DAMAGE.IMPACT DAMAGE.FIRE DAMAGE.ACID DAMAGE.LIGHTNING DAMAGE.VOID DAMAGE.DECAY DAMAGE.LIFE
```

Also small integers. Every damage call accepts either the constant or the lowercase string
(`'fire'`), so `world.damage(e, 20, 'fire')` is legal.

---

## 4. Entities

### Creating one

```js
const e = world.spawn({
  kind: 'enemy',        // 'player'|'enemy'|'projectile'|'pickup'|'corpse'|'effect'|'prop'|'debris'|'custom'
  x, y,                 // centre. required
  w: 48, h: 96,         // AABB, default 32x32
  vx: 0, vy: 0,
  team: 1,              // 0 = player's side, 1 = hostile, 2 = neutral/world
  hp: 30,               // maxHp is set to the same unless you pass it
  material: MATERIAL.FLESH,

  gravity: 1,           // multiplier on world gravity (3000 px/s²). 0 = floats
  drag: 0,              // v /= (1 + drag*dt)
  bounce: 0,            // 0..1 restitution against terrain
  friction: 0,          // ground friction per second when resting
  collides: true,       // swept AABB vs terrain + platforms + rubble
  trigger: false,       // never resolves collisions, still reports overlaps
  ignoreOneWay: false,  // pass through one-way platforms
  ignoreProps: false,   // pass through solid props (projectiles that only care about terrain)
  stepUp: 0,            // px of ledge/slope this body is lifted over instead of stopped by
  mass: 1,              // divides incoming knockback
  maxFall: 1800,

  life: 0,              // >0 = auto-despawn after this many seconds
  invuln: 0,            // seconds of i-frames at spawn
  flammable: 0,         // 0..2, can catch fire from the surface layer
  faceX: 1,

  owner: casterEntity,  // ignored by damage() so a projectile can't hit its caster
  tag: 'emberbolt',     // free-form; queryable with {tag:'...'}
  layer: LAYER.ACTORS,  // only used by the built-in debug draw

  onUpdate(e, dt) {},           // called every fixed step while alive
  onHit(e, hit) {},             // terrain/platform/entity collision during movement
  onDamage(e, amount, type, src) {},   // return a number to override the amount applied
  onDeath(e, cause) {},         // hp hit 0, or kill() was called
  onLand(e, impactSpeed) {},
  onDespawn(e) {},
  render(e, alpha, R) {},       // OPTIONAL. If present the sim calls it in the render pass.
                                // If absent the entity is invisible (draw it yourself).
  data: { ... },        // shallow-copied onto e.data. Yours entirely.
});
```

**Pooling.** Entities come from a fixed pool (`world.entityCap`, default 1024). `spawn` returns
`null` if the pool is full — check it for anything that can spawn in bulk. Fields you do not pass
are reset to the defaults above, so a recycled slot never leaks state. `e.data` is a persistent
object per slot: it is **wiped** (`for key delete`) on spawn, so do not hold a reference to it
across a despawn.

### Reading / writing one

```js
e.id          // stable while alive; e.gen increments on every reuse
e.alive       // false once despawned. ALWAYS check this before touching a stored reference
e.x e.y       // centre
e.px e.py     // position at the start of the tick — render with lerp(px, x, alpha)
e.vx e.vy
e.w e.h
e.onGround    // true this tick
e.wasGround   // true last tick
e.onWall      // -1 wall on the left, +1 on the right, 0 none
e.hp e.maxHp
e.team e.kind e.tag e.material
e.faceX       // -1 / +1
e.invuln      // seconds remaining
e.hitFlash    // 0..1, decays; multiply your colour toward white by this for a free hit flash
e.status      // Float32Array[STATUS_COUNT] of remaining seconds
e.power       // Float32Array[STATUS_COUNT] of status strength
e.burning     // convenience: seconds of burn remaining
e.groundMat   // MATERIAL of whatever it is standing on (footstep sounds, dust colour)
e.hitX e.hitY // -1/0/+1 per axis: which side collided during this tick's movement
e.slot e.gen  // pool slot and reuse counter — useful for staggering work across frames
```

**There is no entity-vs-entity collision.** Bodies pass through each other; only terrain, solid
props and settled rubble stop them. If an enemy needs separation, do it in its own `onUpdate`.

### Destroying one

```js
world.kill(e, cause)      // runs onDeath, emits 'enemy:died' for kind 'enemy', then despawns
world.despawn(e)          // immediate, silent, no onDeath
```

Both are safe to call during iteration — removal is deferred to the end of the step.

### Iterating

```js
world.entities            // dense array of live entities. Read-only. May be reordered any tick.
world.count               // == world.entities.length
world.each('enemy', (e) => {})
```

---

## 5. Damage — the interface spells and enemies live on

```js
world.damage(target, amount, type, opts) -> applied   // number actually dealt, after resistance
```

- `target` — an **entity**, a **prop** (from a query/hit record), or `null` (returns 0).
- `amount` — positive number, pre-resistance.
- `type` — `DAMAGE.*` or the lowercase string.
- `opts` (all optional, single shared object is fine, it is not retained):

```js
{
  src,          // the entity that caused it (for kill credit + owner immunity)
  hitX, hitY,   // world point of the hit — drives particles and the crack origin
  dirX, dirY,   // unit direction of the blow — drives debris and knockback
  force: 0,     // knockback impulse in px/s applied along dir
  crit: false,
  stagger: 0,   // seconds of stun on top of the damage
  noFlash: false,
  ignoreInvuln: false,
  status: 'burn', statusTime: 3, statusPower: 1,   // apply a status with the hit
}
```

Returns the damage actually applied (0 if resisted, blocked by i-frames, or below the material's
`minDamage`). Side effects: hit flash, hit particles in the material's chip colour, `spell:hit`-
adjacent bookkeeping (the *spell* module emits `spell:hit`, not the sim), `player:damage` if the
target is Rook, `enemy:died` / `prop:break` / `terrain:break` where appropriate.

### Area damage — the one you actually want

```js
world.damageArea(x, y, radius, amount, type, opts) -> hitCount
```

Same `opts`, plus:

```js
{
  falloff: 1,        // 0 = flat, 1 = linear to the edge, 2 = quadratic
  terrain: false,    // also chew a crater of `radius * terrainScale` out of the terrain grid
  terrainScale: 0.7,
  props: true,       // also damage destructible props whose AABB overlaps
  debris: true,      // also shove loose debris bodies
  team: -1,          // -1 = everything; 0/1/2 = only that team
  maxTargets: 64,
  force: 0,          // radial knockback, scaled by falloff
  los: false,        // require line of sight through terrain
}
```

After the call, `world.lastHits` is a reused array of hit records (see §7) describing everything
that was touched, in the order it was touched. Copy it before calling anything else.

### The one-line explosion

```js
world.explode(x, y, {
  radius: 180, damage: 40, type: 'fire', force: 900,
  terrain: true, props: true,
  shake: 0.5, hitstop: 0.05, flash: 0.15,     // set to 0 to opt out
  dust: 1, sparks: 1, light: 1,
  igniteChance: 0.6,        // fire only — chance flammable things in radius catch
});
```

This is the "make it feel expensive" path: it does the damage, the terrain crater, the dust plume,
the sparks, the light pop, the shockwave, the hitstop and the shake in the right order and with the
right numbers. **Prefer it over rolling your own.** It is also the reference implementation for how
much juice a big hit should have.

---

## 6. Queries

```js
world.queryRadius(x, y, r, opts, out) -> out     // array of entities, nearest first
world.queryBox(x, y, w, h, opts, out) -> out     // centred box
world.nearest(x, y, r, opts) -> entity | null
world.nearestEnemy(x, y, r) -> entity | null     // shorthand for {team:1, alive, targetable}
```

`opts`:

```js
{
  team: -1,           // -1 any
  kind: null,         // string or array of strings
  tag: null,
  exclude: entity,    // skip this one (usually the caster)
  targetable: true,   // skip corpses, pickups, effects and dead things
  los: false,         // require an unobstructed line through terrain
  sort: true,         // by distance
  max: 64,
}
```

Props are **not** entities. Query them separately:

```js
world.queryProps(x, y, r, out) -> out      // destructible props whose AABB is within r
world.propAt(x, y) -> prop | null
```

### Terrain

```js
world.solidAt(x, y) -> bool            // THE terrain query. Cheap: one array read.
world.materialAt(x, y) -> MATERIAL
world.solidBox(x, y, w, h) -> bool      // any solid cell inside this centred box
world.groundY(x, fromY, maxDist) -> y   // top surface of the first solid below, or NaN
world.ceilingY(x, fromY, maxDist) -> y
world.raycast(x, y, dirX, dirY, maxDist, opts) -> hit | null
world.lineOfSight(x0, y0, x1, y1) -> bool
```

`raycast` opts: `{ entities: true, props: true, terrain: true, team: -1, exclude, step: 6 }`.
It returns the shared `world.hit` record, or `null`.

### "What did I just hit?" — the projectile path

```js
const hit = world.sweep(x0, y0, x1, y1, opts);   // moved from (x0,y0) to (x1,y1) this step
```

Returns `null`, or the shared hit record. This is the call a spell projectile makes every tick:
move, sweep, and if a hit comes back, resolve it. `opts` is the `raycast` opts plus
`{ radius: 0 }` for a fat ray.

---

## 7. The hit record

Shared and reused — **copy anything you keep**.

```js
{
  what: 'terrain' | 'prop' | 'entity' | 'debris',
  entity,        // set when what === 'entity'
  prop,          // set when what === 'prop'
  debris,        // set when what === 'debris'
  x, y,          // contact point
  nx, ny,        // surface normal, unit, pointing back at the caster
  dist,          // distance travelled before contact
  t,             // 0..1 along the swept segment
  material,      // MATERIAL of whatever was hit — key your impact FX off this
  cellX, cellY,  // terrain cell indices when what === 'terrain'
}
```

`world.materialFx(material, x, y, dirX, dirY, strength)` plays the correct impact burst (chips,
dust, ring, glass glint, splinters) for a material. Call it whenever you land a hit and you get
material-correct feedback for free.

---

## 8. Destructibles — props

A prop is a static breakable authored from `assets/atlas.json`'s `materials` block. It is *not* an
entity; it has its own pool and its own list.

```js
const p = world.addProp('wall_brick', x, yBottom, {
  hp,                 // default from the atlas manifest
  flip: false,
  scale: 1,
  layer: LAYER.TERRAIN_FRONT,   // default TERRAIN
  solid: true,        // does it block movement (props default to solid unless FOLIAGE/small)
  grounded: null,     // null = decide by sampling terrain under the base
  supports: [otherProp, ...],   // things that fall when this goes
  supportedBy: [otherProp, ...],// convenience inverse; both directions get wired
  needs: -1,          // how many supporters must survive. -1 (default) = ALL of them
  burnable: null,     // null = from material
  tint: [r,g,b],
  onBreak(prop, cause) {},
  data: {},
});
```

`x, yBottom`: props are placed by their **foot**, because the atlas anchors are foot anchors.

Prop fields: `p.alive p.x p.y p.w p.h p.left p.right p.top p.bottom p.hp p.maxHp p.material
p.state ('intact'|'cracked'|'shattering'|'debris'|'settled'|'gone') p.burn p.charred p.acid
p.stable p.supports[] p.supportedBy[]`.

```js
world.damageProp(p, amount, type, opts)   // same opts as world.damage
world.breakProp(p, cause)                 // skip straight to shattering
world.igniteProp(p, strength)
world.collapse(p, delay)                  // structural failure — falls, then breaks on landing
```

**The break chain is authored for you.** `intact → cracked1 (hp<66%) → cracked2 (hp<33%) →
shattering (0.10s of scale/flash) → debris (physics bodies) + settled sprite → settled`. You never
have to drive it; you only ever apply damage.

### Structural support — the showpiece

Props have a support graph. `p.supports` is the list of props that depend on this one. A prop is
**stable** if it is `grounded` (its base rests on terrain) or it is supported, transitively, by a
stable prop. Whenever a prop breaks or the terrain under a prop's base is destroyed, the whole
graph is re-solved (a BFS from the grounded set) and everything that is no longer reachable
**collapses**, with a staggered delay so an arch comes down as a cascade, not a single frame.

To author a structure: create the parts bottom-up and pass `supportedBy`. Example — an arch on two
buttresses:

```js
const l = world.addProp('pillar_stone', 5200, 0);
const r = world.addProp('pillar_stone', 5500, 0);
const a = world.addProp('arch_stone', 5350, -330, { supportedBy: [l, r] });
```

Take out either pillar and the arch comes down.

```js
world.solveSupport()        // force a re-solve; the sim does this automatically on any break
world.supportEdges(out)     // [{ax,ay,bx,by,stable}, ...] for the debug overlay
```

### Registering a new destructible type

Everything in `atlas.json`'s `materials` block is available by name — no registration needed:

```
wall_brick arch_stone pillar_stone boulder_big boulder_small rocks_small
crate barrel fence stump tree_trunk oak_trunk deadtree burnt_trunk
tree_foliage tree_foliage_b tree_small bush ferns mushrooms
lantern gate_iron brazier skull_pile
```

Composites (a trunk plus a canopy that topple together) live in the manifest's `composites` block:

```js
world.addTree('tree_oak', x, yBottom, opts)   // 'tree_oak' | 'tree_young'
```

Every one of those is also reachable through the subsystem directly (`world.props.add`,
`world.props.damage`, …) — the flat `world.*` names are aliases, both are supported.

To add a type that is not in the atlas, call `world.defineProp(id, def)` before `enter()`. The def
shape is `{ id, material, hp, w, h, states: [uv, uv, uv], settled: uv, debris: [frameName…],
solid, chunks, hinge, airy, heavy, light, fire }` where each `uv` is
`{ tex, u0, v0, u1, v1, w, h }`. You will also need art, which is the art agent's file, not mine.

---

## 9. Destructible terrain

A chunked grid. Cell size **16** world px; chunks are 32×32 cells (512 px).

```js
world.terrain.cell                     // 16
world.terrain.solid(cx, cy) -> bool    // CELL indices, not world px
world.terrain.matAt(cx, cy) -> MATERIAL
world.terrain.toCellX(worldX)  world.terrain.toCellY(worldY)

world.terrain.damage(x, y, radius, amount, type, opts) -> cellsDestroyed
world.terrain.carve(x, y, radius, opts)     // unconditional hole, no hp check
world.terrain.fill(x, y, radius, material)  // Bulwark builds terrain with this
world.terrain.scorch(x, y, radius, amount)  // visual char, no structural change
```

`damage` opts: `{ jitter: 1, debris: 1, dust: 1 }` — `jitter` roughens the crater edge, the other
two switch off debris spawning and the dust plume for cheap repeated calls (acid does this).
It spawns material-correct debris and a dust plume, emits `terrain:break`, and marks any prop whose
base it undermined for a support re-solve.

Level authoring (called from `level.js`, but available to anyone before `enter()` finishes):

```js
world.terrain.box(x, y, w, h, material)         // top-left anchored, world px
world.terrain.hill(x0, x1, fn, material)        // fn(x) -> surface y
world.terrain.platform(x, y, w, h, material, { oneWay: true })
world.terrain.circle(x, y, r, material)
```

**Rubble is a separate solid layer.** Settled debris raises a per-column heightfield
(`world.rubbleTop[col]`) which entities collide with, so you really can stand on a pile of bricks
you just made. `world.solidAt` returns true for rubble too; `world.terrain.solid(cx,cy)` does not.

---

## 10. Debris

Pooled rigid bodies (position, rotation, angular velocity, sleep). Cap `world.debrisCap` (default
900). Oldest sleeping bodies are recycled when the pool is exhausted, so you can never stall the
game by breaking too much.

```js
world.spawnDebris({
  x, y, vx, vy, spin,
  frame: 'wall_brick_d3',    // an atlas frame name, or omit and pass `material` for a random one
  material, w, h, scale: 1,
  life: 0,                   // 0 = persists forever once asleep
  layer: LAYER.TERRAIN_FRONT,
  burning: 0,
}) -> debris | null

world.burstDebris(x, y, material, count, {
  frames,        // array of frame names to pick from
  speed: 300, speedVar: 220, spread: Math.PI, dir: -Math.PI/2,
  size: 1, sizeVar: 0.4, spin: 8,
})

world.shoveDebris(x, y, radius, force)     // Galewrench, explosions
world.debrisCount                          // live bodies
world.clearDebris()
```

Debris sleeps after ~0.35 s below the motion threshold, and a sleeping body stops costing anything
except a draw. Waking is automatic when something lands on it or shoves it.

---

## 11. Statuses

```js
import { STATUS } from './sim/status.js';
STATUS.BURN STATUS.ACID STATUS.SLOW STATUS.STUN STATUS.ROOT
STATUS.SHIELD STATUS.HASTE STATUS.WET STATUS.CORRODE STATUS.MARK

world.applyStatus(e, STATUS.BURN, seconds, power = 1)   // refreshes time, takes the max power
world.hasStatus(e, id) -> seconds remaining (0 = no)
world.statusPower(e, id) -> power
world.clearStatus(e, id)
world.knockback(e, dirX, dirY, force)     // impulse in px/s; scaled by 1/mass for heavies
```

Built-in behaviour: `BURN` ticks FIRE damage and emits flame particles and light; `ACID` ticks ACID
damage and drips; `SLOW` scales movement; `STUN` zeroes control input; `ROOT` zeroes horizontal
movement only; `WET` suppresses BURN and doubles LIGHTNING.

To add a status the sim does not know about, use `e.data` — the sim will not clear it while alive.

---

## 12. Surfaces and fluids — "the world remembers"

A coarse grid (32 px cells) of persistent fluid/surface amounts. This is the layer that makes fire
spread, acid pool and ooze downhill, and slime slow you down two minutes after the fight.

```js
world.surfaces.add(kindId, x, y, amount)             // one cell
world.surfaces.pour(kindId, x, y, amount, radius)    // a splash
world.surfaces.amountAt(kindId, x, y) -> 0..1
world.surfaces.clear(kindId, x, y, radius)           // Nullring, rain, a Bulwark burying a fire
world.surfaces.freeze(x, y, radius, seconds)         // stop ALL spread/flow in a radius
world.surfaces.count(kindId) -> live cells
world.surfaces.ignite(x, y, radius, strength)        // shorthand for pour('fire', ...)
```

Built-in kinds: `'fire'`, `'acid'`, `'slime'`, `'frost'`, `'oil'`.

### Adding your own kind

```js
world.surfaces.define({
  id: 'void',
  color: [0.5, 0.2, 0.9], color2: [0.1, 0, 0.2],
  add: true,              // additive rendering
  light: 0,               // 0..1 — how much light a full cell emits
  layer: LAYER.FX,
  decay: 0.05,            // amount lost per second
  spread: 0.0,            // per second, to neighbouring cells
  flow: 0,                // 0..1 downhill flow rate
  needsFuel: false,       // only lives on flammable material (fire does)
  consumes: 0,            // material hp eaten per second per unit amount
  damage: 8,              // per second to entities standing in it
  damageType: 'void',
  status: null, statusTime: 0,
  cap: 900,               // hard ceiling on live cells of this kind; adds beyond it are dropped
  max: 1,                 // per-cell amount ceiling
  onCell(s, cx, cy, amount, dt) {},   // optional per-cell hook, called on the slow tick
  particle(s, x, y, amount) {},       // optional; omit for the default puff
});
```

Kinds tick on a **staggered slow update** — a fifth of the live cells each frame, so 1,000 burning
cells cost about what 200 do. Do not assume `onCell` runs every frame; it gets the elapsed time.

### Fire specifically

Fire only survives where there is fuel: flammable terrain (`TIMBER`, `FOLIAGE`, `EARTH` with
grass), a flammable prop, or burning debris. It burns fuel down, chars what it touches, spreads to
neighbours weighted by `MAT[m].flammable`, throws embers and heat haze, emits real light, and when
a prop's fuel is exhausted the prop **collapses** (which then runs the support graph, so a burning
buttress can drop an arch). Wind: `world.surfaces.wind = 0` (−1..1) biases spread sideways —
Galewrench should set it briefly.

---

## 13. Bus events emitted by the sim

```js
'terrain:break'  { x, y, radius, material, cells, type }
'prop:break'     { prop, id, x, y, material, cause }
'prop:collapse'  { prop, id, x, y }
'player:damage'  { amount, type, hp, maxHp, src, x, y }
'player:died'    { x, y, cause }
'enemy:died'     { entity, x, y, kind, tag, src }
'pickup'         { entity, kind, tag, value, x, y }
'sim:ready'      { world }
'sim:hitstop'    { seconds }
```

The sim **listens** for nothing it needs. It never emits `spell:cast` / `spell:hit` — those belong
to the spell module.

---

## 14. Player

```js
world.player                       // the Rook entity, or null before enter()
world.player.data.state            // 'idle'|'run'|'jump'|'fall'|'land'|'dash'|'wall'|'hurt'|'dead'
world.player.data.dashCd           // seconds
world.player.data.canDash
world.playerControl = true         // set false to take control away (cutscenes, death)
world.setPlayerSpawn(x, y)
world.respawn()
```

The player's aim origin is pushed to `input.setAimOrigin` every tick, so `input.aim` is a valid
world point for spell targeting without any work on your side.

Rook has no attack of his own — **all offence comes from the spell module.** The sim gives you a
correctly-positioned, correctly-facing entity with a cast anchor:

```js
world.castOrigin(out)   // {x, y} — the lifestone in Rook's chest, where a spell should spawn from
world.player.data.castPose(seconds)   // play the cast wind-up/recoil animation
```

---

## 15. Debug

```js
world.debug.aabb = false        // entity + prop AABBs
world.debug.grid = false        // terrain cells
world.debug.support = false     // support graph, green = stable, red = about to fall
world.debug.surfaces = false    // fluid cell amounts
world.debug.rubble = false      // the rubble heightfield
world.debug.player = false      // controller state, coyote/buffer timers
world.stats                     // { entities, props, debris, awake, surfaceCells, chunksDrawn, ms }
```

`game/sim-test.html` turns these on with checkboxes and has scripted destruction demos:

```
?demo=arch | fire | acid | quake | wall | tree | all      run a demo on load
?t=3                                                       fast-forward N seconds before showing
&auto                                                      cycle every demo
```

`window.__sim = { world, ctx, R, P, demo(name), fastForward(seconds), stats() }`.

---

## 16. Things the sim deliberately does not do

- **No enemies.** `kind:'enemy'` entities work fully — spawn, physics, damage, death, statuses,
  knockback, corpses — but no AI ships in `sim/`. That is the enemy agent's module.
- **No spells and no projectile registry.** Spawn a `kind:'projectile'` entity with `onUpdate` and
  `onHit`, or drive `world.sweep()` yourself.
- **No HUD.** The sim never draws UI. Health, focus and damage numbers are the UI agent's.
- **No audio.** Materials carry `sfx` string keys and the sim calls `ctx.audio.sfx(key, {x, y})`
  for every break, footstep and impact. Wiring those keys to sounds is the audio agent's.
- **No save/load.** The world is rebuilt from `level.js` on every `enter()`.
