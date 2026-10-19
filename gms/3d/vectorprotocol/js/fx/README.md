# js/fx — FX toolkit + per-unit signature effects (battle agent owns js/fx/* except js/fx/units/<id>.js)

## Per-unit hook
1. Create `js/fx/units/<id>.js` (`<id>` = the unit def id from js/data/units.js, or the robots model id).
2. Register it with **one line** in `js/fx/units/index.js`: `<id>: () => import('./<id>.js'),` (never list a file that doesn't exist, D19).
3. `export default { attack(ctx), impact(ctx), overdrive(ctx) }`. Every hook is optional. A unit without a file (or a hook)
   gets the generic role/delivery effects. Return `'default'` from a hook to run the generic effect as well.
   Copy `js/fx/units/_example.js` as a starting point.

| hook | called | notes |
|---|---|---|
| `attack(ctx)` | the attack anim's `fire` frame (or `fireT + 0.15 s` if the anim never fires) | `ctx.timing.travel` = seconds until the sim's impact: make projectiles land then |
| `impact(ctx)` | every non-DoT hit this unit lands (`ctx.hit` = sim `hit` event: amount, crit, absorbed, kill, adv) | damage numbers / hit flash / HP bars stay generic |
| `overdrive(ctx)` | the overdrive release, after the generic banner + charge swirl + slow-mo + camera push | `ctx.targets` = all targets |
| `shot(ctx)` | **every** `fire` / `cast` / `impact` frame of the current attack anim (after `attack()` on index 0) and of the overdrive anim | `ctx.shot = { index, typeIndex, type, anim, phase:'attack'\|'overdrive', socket }`: `index` counts all events of that anim from 0, `typeIndex` = the kit's per-type index, `socket` = world pos of the kit's socket for that event (alternates muzzle/muzzleL, orbR/orbL). Use it for bursts (BARB 3, GUNNER 5/8, PRISM OD 4) instead of `fx.after` guesses. Overdrive anim events can arrive **before** `overdrive()` (which runs at the sim's fireT). Without `shot` and without `attack`, generic units get an extra tracer per later `fire` frame. |
| `heal(ctx)` | every sim `heal` event this unit causes (`ctx.heal` = the event: amount, hp, maxHp, ability) | replaces the generic green pulse + heal beam; the number and HP bar stay generic. Also fires for overdrive heals (one per target) and self-heal passives (`src === target`). |
| `shield(ctx)` | a shield this unit grants lands (`ctx.shield` = sim `shield` event, amount > 0) | replaces the generic `shieldHit` flare; the bubble, bar and number stay generic |
| `shieldBreak(ctx)` | this unit's attack breaks a target's shield (`e.broken`; src = the breaker) | replaces the generic cyan sparks |
| `buff(ctx)` | a buff status this unit applies (`ctx.buff` = sim `buff` event: status, duration) | replaces the generic gold `buffAura` |
| `debuff(ctx)` | a debuff status this unit applies lands (`ctx.debuff` = sim `debuff` event: status, duration; `ctx.status` = its id, e.g. `burn`, `slow`, `stun`, `expose`; `ctx.src` = the applier, `ctx.target` = the afflicted) | replaces the generic `debuffAura`; CC rings (stun/shock/taunt) stay generic. Use it instead of `fx.after` timing for burn/slow visuals |
| `deploy(ctx)` | the unit appears on its plate (squad drop-in and wave arrivals) | `ctx.noDrop` tells you whether it drops in. Replaces the beam (`fx.deploy`) or, for noDrop units, `fx.materialize` |

### Model flags read by the battle
- **`noDrop: true`** on the model def (`js/actors/models/<id>.js`, read as `unit.def.noDrop`, or `unit.noDrop`): no drop from the sky, no landing
  shockwave or shake; the unit appears in place with `fx.materialize` (or your `deploy(ctx)` hook). The kit (js/actors/units.js) skips its own body
  drop for the same flag.
- **`unit.extraDrawCalls`** (number, or a function returning one): meshes your model adds outside the kit's slots (PHASE ghosts, extra
  sprites). `battle.unitStats()` → `{units, calls, extra, tris}` sums `unit.drawCalls + extraDrawCalls`; battle_test's `?perf=1` shows it.
  (The engine's frame `calls` already counts real draws; this is the per-unit budget view.)

### ctx
```js
{ kind: 'attack'|'impact'|'overdrive', fx /* toolkit below */, THREE,
  event /* sim event */, ability /* AbilityDef from data */, hit? /* impact only */,
  src, target, targets[],  // actor views: { id, side, slot, role, faction, rarity, name, unit, root, sockets, color, x, z, height, alive,
                           //   pos(socket='core') -> new Vector3 (world; sockets: muzzle, muzzleL, head, core, hand, handL, orbL, orbR) }
  timing: { now (s), travel (s until impact), windup (s), speed (1|2|4) },
  palette: { faction /* this unit's HDR colour */, plate, cyan, blue, orange, red, purple, gold, green, white, pink } }
```
Colours are HDR `THREE.Color`s (values > 1 bloom). Time passed to effects is already scaled by speed ×2/×4 and slow-mo.

## Toolkit (`ctx.fx`, built by `createEffects(vfx, hooks)` in toolkit.js)
All take world `Vector3`s (copied; safe to reuse temporaries).
**Sizes are world metres** (`size` = the whole particle quad; a soft glow, kind 0, only covers about the middle half of it). The board is ~14 x 30 m
and units stand ~3-5 m tall, so flames, fireballs and explosion cores need `size` 1.5-3 to read on a phone; 0.3 is a spark.
- **Shots**: `muzzle(pos, color, k)`, `tracer(a, b, color, width)` (hitscan slug), `bolt(a, b, color, dur, {size, arc, trail})` (travels for `dur` s),
  `rail(a, b, color, width)` (lingering rail beam + motes), `beam(a, b, color, life, width, jitter)`.
- **Hits**: `impact(pos, color, k)`, `sparks(pos, color, n, speed, up)`, `shieldHit(pos, color)`, `explosion(pos, color, k)` (light + smoke + shake),
  `deathBurst(pos, color)`, `orbital(pos, color)`.
- **Dark**: `darkCore(pos, size, life, color?, alpha?)` = normal-blended solid dark disc (holds full strength for 60% of `life`) + smoke skirt
  (void cores; battle-5 fix: it used to be a soft glow the bloom washed out). `size` 1.5-3 for a core that reads. Raw: `fx.vfx.alpha.spawn({kind: 0, color: dark, ...})` draws black.
- **Dark / no bloom** (battle-7): `fx.darkCore` discs now go into the bloom-masked `vfx.dark` pool and stay truly black (bloom, screen flash and
  grade lift are all gated off where it covers). For your own black meshes / billboards call **`fx.noBloom(materialOrObject3D)`** once (or
  `import { markNoBloom } from '../vfx.js'` in a model file): colour blends exactly as before (normal, or premultiplied if the material already
  was), and the material's output alpha becomes the bloom mask, so write alpha = how black/opaque that pixel is. A bright rim drawn by the same
  material loses its bloom halo inside its own footprint (the glow outside stays); keep a big emissive ring in a separate material if that matters.
  Raw: `fx.vfx.dark.spawn({...same as particles, kind: 5})`. Debug view: `engine.post.grade.uniforms.uMaskDbg.value = 1` (white = bloom allowed).
- **Tubes** (battle-7, roots / vines / tendrils): lit, normal-blended solid tubes that grow along a path, hold, then wither back toward the root.
  One draw call for all of them (pool of 32, 16 on low); geometry is written once at spawn and the animation runs on the GPU.
  - `fx.tube(points | THREE.Curve, { radius 0.12, radius1 (tip, default radius/4), color (albedo, LDR THREE.Color), emissive k (glow = color * k),
    tipGlow k (hot growing tip), grow 0.35 s, life 2 s (total), wither 0.4 s, delay, bulge: t => radius multiplier })` -> `{ kill(), alive }`.
    `points` are world Vector3s along the path (centripetal Catmull-Rom; 3-12 points is plenty). Tubes are lit by the arena lights, so use
    real albedo colours (bark ~0.3,0.21,0.13; vine ~0.2,0.3,0.1) and `emissive` 0.3-1 for magic vines.
  - `fx.roots(from, to, { n 3, radius 0.2, spread 0.7, height 2.4, color, emissive, tipGlow, grow 0.4, life 1.8, wither 0.45, stagger 0.06 })`:
    roots erupt at `from`, snake across the floor and coil up around `to` (outside the pedestal, r ~1.1 m). Returns the handles.
  - `fx.entangle(pos, { n 4, height 3.4, radius 1.15, vine 0.14, color, emissive, tipGlow, grow 0.5, life 2.2, wither 0.5 })`: vines spiral up
    around a unit from the ground. `fx.entangle(target.pos('core').setY(0), { emissive: 0.5, tipGlow: 2 })` for a glowing snare.
  - Sizes: the board is ~14 m wide, a 0.15 m radius root is ~9 px on a phone. Pedestals are r ~1.1 m, so coils smaller than that hide in the plate.
- **Arrivals**: `deploy(pos, color)` (sky beam), `land(pos, color, k)`, `plateArm(pos, color, dur)`, `materialize(pos, color, height)` (blink-in).
- **Support / areas**: `heal(pos)`, `healField(center, radius, color, life)`, `areaField(center, {radius, color, life, kind:'zone'|'heal'|'debuff'|'hex', motes})`,
  `emp(center, color, radius)`, `buffAura(pos, color)`, `debuffAura(pos, color)`, `charge(pos, color, dur)`, `deploy(pos, color)`.
- **Persistent (return handles with `.kill()`)**: `shieldBubble({follow: Object3D, offsetY, radius, color, life, alpha})` (`.flare()` on hit),
  `drones({around: Object3D|Vector3, n, radius, height, speed, color, life})` → handles with live `.pos`.
- **Screen / time**: `shake(a)`, `screenFlash(color, a)`, `dim(k, dur)` (scene-wide dim + cold desaturate, k 0..1, held `dur` battle-s with a
  0.15 s ramp in / 0.4 s out; bloom is added after it, so HDR beams/flashes stay vivid: use it for "lights out" moments such as Last Light;
  separate from the Overdrive spotlight), `lean(view|id, x, z, dur)` (tilt a unit by world-axis radians, eased in/out, battle-owned: use it
  instead of writing `unit.body.rotation`), `slowmo(scale, dur)` (real-time seconds), `cameraPush(toVec3, k, dur)`,
  `light(pos, color, intensity, life)` (pooled point light).
- **Scheduling**: `after(seconds, fn)` (scaled battle time; use instead of setTimeout so ×4 speed and slow-mo stay in sync).
- **Raw pools** (`fx.vfx`): `add` / `alpha` particles `spawn({pos, vel, color, alpha, life, size, size1, drag, grav, kind:0 glow|1 spark|2 smoke|3 chunk|4 star|5 solid disc, streak, floor, fadeIn, hold})`
  (`hold` = fraction of life at full alpha before the fade),
  `beams.spawn({a, b, color, width, width1, core, life, taper, hold, jitter, fn(beam,k)})`, `rings.spawn({pos, color, r0, r1, thick, life, kind:0 ring|1 disc|2 hex, face, hold})`.
  One draw call per pool (the dark and tube pools draw nothing while empty); budgets (high): ~1400 additive particles, 96 dark discs, 32 tubes, 160 beams, 96 rings, 16 bubbles, 24 drones. Oldest entries are recycled.

## Other modules
- `vfx.js` pools, `tube.js` tube builder (`tubeGeometry(points, {r0, r1, seg, rad, bulge})` for static scenery, `samplePath`), `reflection.js` planar mirror (from HEIRFRAME), `textures.js` / `textures_fantasy.js` procedural canvas textures.

## Testing an effect in isolation (tools/battle_test.html)
- `&charge=1` starts every unit with a full Overdrive (auto fires it at once); `&charge=p2:1` / `e0:0.95` / `2:1` sets one slot (bare slot = player;
  slot = col*3 + lane, the order of `&p=` / `&e=`); comma-separate to mix, e.g. `&charge=0.5,p1:1`. Values <= 1 are fractions, > 1 percent.
- With `&nostart=1` you can hook `__battle.battle.on('event', fn)` before calling `__battle.battle.start()`.
