# NINE STRINGS — Frozen Contracts

Every signature here is **frozen**. If a lane needs one changed, it appends a
proposal to `docs/HANDOFF.md` and the manager changes it here first. Do not
silently widen a signature — that is how multi-file agent builds rot.

Golden rules restated, because they are contracts too:
- `js/sim/**` and `js/data/**` must import **nothing** from `js/gfx`, `js/ui`,
  `js/audio`, and must never touch `window`, `document`, `performance` or
  `Math.random`. They run under plain node.
- The sim talks to the world **only** by pushing onto `world.events`.
- Every module is an ES module with named exports. No default exports.

---

## 0. Units and conventions

- **World space** is in "units"; 1 unit = 1 pixel at zoom 1. Arena is unbounded;
  the camera follows the player.
- **Time** is seconds. The sim step is **fixed at 1/60**; `world.step()` takes no
  argument and always advances exactly one tick.
- **Angles** are radians, 0 = +x, increasing counter-clockwise (screen y is down,
  so visually clockwise; be consistent, do not "fix" it locally).
- Every entity has `.alive` (bool), `.x`, `.y`. Dead entities stay in the pool.
- IDs are integers from `world.nextId++`. Never reuse an id within a run.

---

## 1. `js/core/rng.js`

```js
export function makeRng(seed: number): Rng
interface Rng {
  next(): number         // [0,1)
  int(n): number         // [0,n)
  range(a, b): number    // [a,b)
  pick(arr): any
  chance(p): boolean
  shuffle(arr): arr      // in place, returns arr
  fork(): Rng            // independent stream, deterministic from parent
  state(): number        // serialisable
}
```
Implementation: mulberry32. Determinism is a gate: same seed + same inputs must
produce the same run to the tick.

## 2. `js/core/pool.js`

```js
export function makePool(factory: () => T, reset: (T) => void, cap = 4096): Pool<T>
interface Pool<T> {
  alloc(): T | null      // null when at cap; callers MUST handle null
  free(obj: T): void     // sets obj.alive = false
  each(fn: (T) => void): void   // iterates ACTIVE only
  readonly count: number
  clear(): void
}
```
No allocation inside `alloc()` after warm-up. Pools pre-warm to `cap/4`.

## 3. `js/core/events.js`

```js
export function makeEmitter(): { on(type, fn), off(type, fn), emit(type, payload), clear() }
```
Used by UI/gfx only. The **sim does not use this** — it uses `world.events`.

## 4. `js/core/input.js`  (DOM — not importable by sim)

```js
export function makeInput(el: HTMLElement): Input
interface Input {
  readonly moveX: number   // -1..1, already dead-zoned and normalised
  readonly moveY: number
  readonly active: boolean // is a stick/key currently held
  readonly stick: { ox, oy, x, y, held }   // for drawing the virtual stick
  update(): void           // call once per frame before the sim step
  destroy(): void
}
```
Touch model: **drag-anywhere**. First touch sets the origin, movement within a
72px radius maps to the vector; the origin re-centres if the thumb travels
beyond the radius (so the stick never runs out of travel). Keyboard: WASD +
arrows. Both feed the same two numbers.

## 5. `js/core/viewport.js`  (DOM)

```js
export function makeViewport(canvas): Viewport
interface Viewport {
  w, h            // CSS pixels
  dpr             // clamped device pixel ratio
  bw, bh          // backing store pixels
  safe: { top, bottom, left, right }   // env(safe-area-*) in CSS px
  zoom            // world units -> CSS px scale, derived from portrait width
  resize(): void
  onresize: (fn) => void
}
```
`zoom` is chosen so that a fixed **420 world units** of width are always visible
regardless of device — the play field must be identical on every phone or the
balance is not portable.

## 6. `js/core/save.js`  (DOM)

```js
export const SAVE_VERSION = 1
export function loadSave(): Save
export function writeSave(save: Save): void
export function resetSave(): void
interface Save {
  v, souls, unlocks: string[], chars: string[], stagesCleared: {}, curse: {},
  sanctum: { [nodeId]: level }, codex: { enemies: {}, lore: [] },
  challenges: {}, settings: { sfx, music, haptics, quality, stickSide },
  stats: { runs, kills, cuts, bestTime, conductorsKilled },
  story: { seen: string[], act: number }
}
```
Migrations live in `save.js` only. Never read localStorage anywhere else.

---

## 7. THE SIM

### 7.1 `js/sim/world.js`

```js
export function createWorld(opts): World
// opts: { rng: Rng, stage: StageDef, character: CharacterDef,
//         relics: RelicDef[], sanctum: {nodeId:level}, curse: number,
//         seed: number, tutorial: boolean }

interface World {
  // ---- state
  tick: number            // integer ticks elapsed
  time: number            // tick / 60
  rng: Rng
  nextId: number
  stage: StageDef
  player: Player
  enemies: Pool<Enemy>
  projectiles: Pool<Projectile>
  pickups: Pool<Pickup>
  conductors: Pool<Conductor>
  hazards: Pool<Hazard>      // zones, auras, lingering fields
  allies: Pool<Ally>         // Freed puppets
  strings: Pool<Stringf>     // the threads
  damageNumbers: never       // NOT sim state; gfx derives these from events
  events: SimEvent[]         // append-only within a tick; drained by the host
  over: null | 'dead' | 'victory'
  pendingLevels: number      // level-ups waiting for the player to choose
  // ---- api
  step(): void               // exactly one 1/60 tick. The only mutator.
  chooseUpgrade(id: string): void      // resolves one pendingLevel
  offerUpgrades(n: number): Offer[]    // deterministic; does not mutate
  applyRelic(id), addWeapon(id), addPassive(id)
  spatialQuery(x, y, r, out: []): Entity[]   // reuses `out`, returns it
}
```

`step()` order is **frozen** (balance depends on it):
1. `world.tick++`
2. player movement + status ticks
3. spawn director
4. conductors (movement, affix upkeep, choir maintenance)
5. strings (re-target, tension, sever checks)
6. enemy AI + movement
7. weapons fire
8. projectiles + hazards move
9. collision + damage resolution
10. pickups + magnetism
11. deaths, drops, level-ups
12. stage timeline (chorus, boss, victory)

### 7.2 Entities

```js
Player   { id,x,y,vx,vy, hp,maxHp, level,xp,xpNext, speed, magnet,
           weapons: WeaponInst[], passives: {id:level}, stats: DerivedStats,
           iframes, dashCd, revives, facing, alive }
Enemy    { id,x,y,vx,vy, hp,maxHp, def:EnemyDef, speed, dmg, armour,
           stringId|0, choir|0, affixes:number (bitmask), limpUntil,
           knockX,knockY, statuses:{}, elite, alive }
Conductor{ id,x,y, hp,maxHp, def, choirColour, affix, choirSize, hover, alive }
Stringf  { id, conductorId, enemyId, slack, taut, cut, colour, alive }
Projectile{ id,x,y,vx,vy, damage, pierce, life, kind, ownerWeapon, radius,
            cuts:bool, hitSet, alive }
Pickup   { id,x,y, kind:'shard'|'heart'|'chest'|'bomb'|'magnet'|'coin', value, alive }
Hazard   { id,x,y, r, damage, tickRate, life, kind, alive }
Ally     { id,x,y, hp, damage, life, alive }
```

`DerivedStats` is recomputed by `js/sim/stats.js` whenever a weapon/passive/
relic/sigil changes, never per-frame:
```js
{ might, area, haste, speed, duration, amount, pierce, magnet, luck,
  armour, regen, crit, critMult, curse, growth, greed, sever }
```
Multiplicative stats are stored as multipliers (1.0 = base). `sever` is the
string-cut radius multiplier.

### 7.3 `world.events` — the ONLY sim→host channel

Each entry is a plain object, valid for exactly one frame. The host drains with
`world.events.length = 0` after reading.

```js
{ t:'hit',        x, y, dmg, crit, enemyId, weaponId }
{ t:'kill',       x, y, enemyId, defId, elite }
{ t:'cut',        x, y, stringId, colour, conductorId }
{ t:'conductorDown', x, y, conductorId, colour, choir: number }
{ t:'chorus',     phase:'start'|'end', n }
{ t:'levelup',    level }
{ t:'pickup',     x, y, kind, value }
{ t:'playerHurt', x, y, dmg, dead:boolean }
{ t:'chest',      x, y }
{ t:'evolve',     weaponId, intoId }
{ t:'boss',       phase:number, id }
{ t:'over',       result:'dead'|'victory', time, kills, cuts }
{ t:'say',        key:string }        // tutorial / barks; UI resolves the key
{ t:'shake',      amount:number }     // sim-authored camera shake magnitude
```

### 7.4 `js/sim/strings.js`

```js
export function attachString(world, conductor, enemy): Stringf
export function severString(world, s, x, y): void        // pushes 'cut'
export function stringPoints(s, world, out: Float32Array): number
// Writes N*2 floats of the catenary curve into `out` (cap 16 points),
// returns N. Shared by the renderer AND by the sever hit test, so what you
// see is exactly what you can cut. This function is pure.
export function segmentHitsString(world, s, x0,y0, x1,y1, r): boolean
```

The sever test is: does the damaging shape's swept segment come within
`r * stats.sever` of any curve segment. Weapons opt in with `cuts: true`.

### 7.5 `js/sim/spawn.js`

```js
export function makeDirector(world): Director
interface Director { step(): void }
```
Reads `stage.timeline` (see §8.3). Owns the spawn ring radius, the density cap
(`stage.maxAlive`, hard), the Conductor cadence and the Chorus windows.
**Hard rule:** never exceed `maxAlive`; convert overflow into upgraded enemies
rather than more bodies, or the frame budget dies.

---

## 8. DATA — `js/data/**`

All data modules export a frozen object keyed by id, plus a `list` array.

### 8.1 `weapons.js`
```js
export const WEAPONS = { [id]: WeaponDef }
interface WeaponDef {
  id, name, desc, tag,          // tag = 2-4 letter icon glyph
  kind: 'arc'|'orbit'|'shot'|'aura'|'zone'|'chain'|'summon'|'strike'|'trail'|'boomerang',
  colour: [r,g,b],              // 0-1, drives its particles + projectile tint
  cuts: boolean,                // does this weapon sever threads
  base: { damage, cooldown, area, speed, count, duration, pierce, knock, crit },
  // levels[i] are DELTAS applied at level i+2 (levels[0] is the level-2 step)
  levels: Array<Partial<base> & { text: string, flags?: string[] }>,  // exactly 7
  target?: 'nearest'|'random'|'moststrung'|'conductor'|'thread'|'self'|'aim',
  evolvesTo?: id, requires?: passiveId,
  charOnly?: characterId
}
```
**`target` (added after Lane C-content's R2).** Defaults to `'nearest'`. Without
it, four weapons whose whole identity is *what they aim at* — Choirbreaker
(most-strung), Thurible of the Nine (Conductors), Requiem (under the Conductor),
Ninefold Arc (threads over bodies) — could only say so in prose, and
`js/sim/weapon.js` would have to hard-code four weapon ids. A weapon's target is
data.

**`levels[].flags` (R1).** A level step may carry behaviour, not only numbers.
`js/sim/weapon.js` owns the flag vocabulary; record every flag you consume in
your lane file so content can rely on it.
`kind` is interpreted by `js/sim/weapon.js`. **Adding a weapon of an existing
kind must not require touching the sim.** A genuinely novel weapon registers a
behaviour in `js/sim/behaviours.js` and sets `kind:'custom', behaviour:'id'`.

### 8.2 `enemies.js`
```js
export const ENEMIES = { [id]: EnemyDef }
interface EnemyDef {
  id, name, hp, speed, dmg, armour, radius, xp, mass,
  sprite: SpriteSpec,           // see §9.2 — procedural, not a file
  ai: 'chase'|'charge'|'orbit'|'ranged'|'burst'|'swarm'|'split'|'spit',
  aiParams?: {}, onDeath?: 'explode'|'split'|'summon'|null,
  hover?: boolean,              // not grounded: no separation, draws a far shadow
  phases?: Array<PhaseDef>,     // bosses only; descending hp thresholds
  strungChance: number,         // 0..1 — how often this type takes a thread
  elite?: boolean, boss?: boolean, codex: string
}
```

### 8.3 `stages.js`
```js
export const STAGES = { [id]: StageDef }
interface StageDef {
  id, act, name, subtitle, duration,        // seconds
  palette: { ground, fog, accent, choir: [[r,g,b],...] },
  backdrop: string,                          // art/ key, lazily loaded, optional
  maxAlive: number,
  timeline: Array<TimelineEvent>,
  boss?: enemyId, bossAt?: seconds,
  conductor: { first: seconds, every: seconds, choir: number, affixes: string[] },
  chorus: number[],                          // seconds at which a Chorus fires
  rewards: { souls: number, unlocks: string[] },
  intro: storyKey, outro: storyKey
}
interface TimelineEvent {
  at, until, every,          // seconds
  enemy: enemyId | enemyId[],
  n: number,                 // per spawn burst
  pattern: 'ring'|'edge'|'wall'|'pack'|'rain',
  scale?: { hp?: number, speed?: number }   // multiplier ramp over the window
}
```

### 8.4 Others
```js
passives.js   PASSIVES  { id, name, desc, tag, levels: [{stat, add|mul, text}] x5 }
evolutions.js EVOLUTIONS{ id, from, requires, name, desc, ...WeaponDef overrides }
characters.js CHARACTERS{ id, name, title, portrait, weapon, trait:{stat,mul}, unlock:UnlockDef, blurb }
relics.js     RELICS    { id, name, desc, good:string, bad:string, apply(stats) }
sigils.js     SIGILS    { id, name, desc, rule:string, tier:1|2|3 }
meta.js       SANCTUM   { id, name, desc, stat, perLevel, max, cost(level), requires }
story.js      STORY     { [key]: { title, lines:[{who, portrait, text}], art? } }
unlocks.js    UNLOCKS   { id, kind:'char'|'weapon'|'stage'|'mode'|'sigil', cond:{...}, text }
```

`relics.apply(stats)` is the one place a data file holds a function; it must be
pure and must only touch `DerivedStats` fields.

---

## 9. GFX — `js/gfx/**`  (never imported by sim)

### 9.1 `renderer.js`
```js
export function createRenderer(canvas, viewport): Renderer
interface Renderer {
  begin(camX, camY, zoom): void
  sprite(id, x, y, rot, scale, r,g,b,a): void       // atlas id from §9.2
  quad(x, y, w, h, rot, r,g,b,a): void              // untextured
  line(x0,y0,x1,y1, w, r,g,b,a): void
  curve(pts: Float32Array, n, w, r,g,b,a): void     // the threads
  layer(name: 'ground'|'shadow'|'main'|'add'|'ui'): void
  text(str, x, y, size, r,g,b,a, align): void       // bitmap font from the atlas
  end(): void                                       // flush + post
  setQuality(q: 0|1|2): void
  readonly stats: { draws, sprites, ms }
  lost: boolean                                     // context-loss flag
}
```
**One texture. One shader per blend mode.** `layer()` switches the target bucket;
buckets are flushed in fixed order at `end()`. Additive is its own bucket so
glow never forces a state change mid-batch.

### 9.2 `atlas.js` — procedural sprite baking
```js
export function buildAtlas(): { texCanvas: HTMLCanvasElement, frames: FrameTable }
export function spriteId(key: string, frame = 0): number
interface SpriteSpec {
  rig: 'humanoid'|'crawler'|'bloat'|'hulk'|'wisp'|'demon'|'boss',
  palette: [skin, cloth, accent],   // hex strings
  build: number,   // 0..1 gauntness->bulk
  tatter: number,  // 0..1 how ruined
  extra?: string[],// 'horns'|'chains'|'lantern'|'armour'|'jaw'|'halo'
  frames: number   // walk cycle frames baked, 4 or 6
}
```
The atlas is built once at boot into a 2048² canvas and uploaded. Everything —
enemies, players, projectiles, shards, particles, the bitmap font, UI icons —
lives in that one texture. Budget is tracked in `docs/HANDOFF.md`.

### 9.3 Others
```js
particles.js  makeParticles(cap) -> { emit(spec), step(dt), draw(renderer),
                                      setBudget(n), clear(), count, budget, capacity }
              // module also exports PRESETS (tweakable data) and
              // setSpriteResolver(fn) — installs atlas.spriteId late, so
              // particles.js can import nothing and stay decoupled.
postfx.js     makePost(gl, viewport) -> { begin(), end(opts), setQuality(q),
                                          resize(), destroy(), quality, ok, hdr }
              // opts: { bloom, shake:{x,y}, chroma, vignette, flash, desat, time }
              // opts MUST be ONE persistent object mutated in place, never a
              // per-frame literal.
              // Returns a NO-OP OBJECT, never null, when WebGL2 or the shaders
              // are unusable — callers need no null check.
camera.js     makeCamera() -> { x, y, zoom, trauma, follow(target,dt), shake(a),
                                kick(x,y), punch(z), update(dt, world),
                                setBounds(...), snap(x,y), reset() }
              // zoom is a MULTIPLIER (1.0 = neutral); main.js does
              // viewport.zoom * camera.zoom.
              // trauma (0..1) drives the postfx `chroma` amount. Do NOT also
              // feed the post `shake` uniform from it — the camera already
              // shakes the world and the two would double.
scenefx.js    makeSceneFx({ renderer, particles, camera, audio, viewport })
              // .consume(world.events) — THE single place events become pixels
hud.js        makeHud(renderer) -> { draw(world, state) }
```

**Adaptive quality ladder** — whoever owns the frame clock calls BOTH
`renderer.setQuality(q)` (which forwards to post) and `particles.setBudget(n)`:
`q2 / 4000` -> `q1 / 2200` -> `q0 / 1200`.
`scenefx.consume()` is the seam. No other gfx module may read `world`.

---

## 10. UI — `js/ui/**`  (DOM overlay, not canvas)

The HUD is canvas; **menus are DOM** (crisp text, real accessibility, easy
layout, safe-area aware). One `#ui` root, one screen visible at a time.

```js
export function makeScreens(root, ctx): Screens
interface Screens {
  show(name, props): void
  hide(): void
  readonly current: string
}
```
Screens: `boot`, `title`, `stageSelect`, `charSelect`, `loadout`, `dialogue`,
`levelup`, `pause`, `results`, `sanctum`, `codex`, `settings`, `challenges`.

`ctx` is `{ save, audio, emitter, run }`. A screen module exports
`export function screenName(root, ctx, props): { destroy() }` and owns only its
own subtree.

**Hard UI rules**
- Every tappable control is **≥44px** tall and ≥32px wide. Gated by `uishot.mjs --hit`.
- Nothing sits under the notch or the home bar: use `env(safe-area-inset-*)`.
- `alert`/`confirm`/`prompt` are **banned**. Use the in-page callout.
- The level-up screen must be reachable and dismissable **one-thumb**, bottom
  half of the screen, because that is where a thumb is during a run.
- All colour comes from CSS custom properties in `css/style.css`. No hex
  literals in UI JS.

---

## 11. AUDIO — `js/audio/**`

```js
export function makeAudio(): Audio
interface Audio {
  unlock(): void                 // from the first user gesture
  sfx(name, opts?): void
  music(trackId, opts?): void
  duck(ms): void
  setVolumes({sfx, music}): void
  readonly ready: boolean
}
```
**Fully procedural WebAudio. No audio files.** Percussive noise + filtered
oscillators + a small reverb impulse generated at runtime. Music is a scheduled
generative layer per act (drone + pulse + choir pad) that rises with on-screen
threat. Zero bytes downloaded, no licensing, no pop-in.

---

## 12. HOST — `js/main.js`

Owns the fixed-step loop, wires everything, and is the **only** file allowed to
import from both `sim` and `gfx`.

```
accumulator loop @ 60Hz, max 5 catch-up steps per frame
for each step:  world.step()
after steps:    scenefx.consume(world.events); world.events.length = 0
render:         interpolate alpha, renderer draw, hud, post
```

Query flags (used by the gates — all must keep working):
`?auto` bot plays itself · `?stage=id` · `?seed=n` · `?t=seconds` skip ahead ·
`?dpr=1` · `?preserve=1` preserve drawing buffer · `?quality=0|1|2` ·
`?unlockall` · `?nostory`

`window.__ns` exposes `{ world, renderer, screens, audio, save, version }` for
the harness. It is a **data property**, not an accessor — the falsify arm must
be able to poke it.
