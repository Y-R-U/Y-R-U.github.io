# Props (owner: props)

```js
import { createProps, updateProps, resetProps, allColliders, createNewspaper } from './props/index.js'
const props = await createProps({ scene, quality, anchors, sfx })  // Map id → prop; roots already added to scene at anchors
world.colliders.push(...allColliders(props))   // world-space AABBs, mutated in place (min/max/enabled)
updateProps(props, dt)                         // every frame; re-syncs colliders of animating props
resetProps(props)                              // everything back to its level-start state
```
`sfx(name, opts)` is optional (audio.sfx-compatible names: crash, shatter, rip, creak, door, fridge, wind, whack, boing, click, pop, spit, swipe).

Every prop: `{ id, root, colliders, state, update(dt), reset(), anim }`. All actions are time-based, idempotent
(calling twice is harmless), and the animated ones return Promises.

| id | anchor | API |
|---|---|---|
| `table` | tableTop (surface point) | `bump(strength=1)` → Promise (plate + pan `jolt()` too). `topY`, `top` (Object3D) |
| `bench` | kitchenBench | static (seat surface 0.45) |
| `chair` | jonChair (+Z faces table) | `breakLeg(i=0)` (0 = legPos leg, 1 = legPosR leg), `fallBack()` (teeter .35 / fall .45 / settle .3 s; breaks leg first), `bounce(h=0.3)`, `seat` (Object3D socket for Jon), `seatPos(out)`, `seatQuat(out)`, `legPos()`, `legPosR()`, `fallTiming` |
| `plate` | plateSpot | `setFood('steak'|'lasagna'|'meatloaf'|null)`, `eaten(t 0..1)`, `fling(toPos, {dur, height})` → Promise (lands upright + splat + crumbs; `state.onFloor`), `jolt(s)`, `pos` (live world Vector3), `food()` |
| `pan` | panSpot | `serveScoop()` → Promise, `toFridge(slot=fridge.slot)` → Promise, `swingCatch()` (wobble only), `eaten(t)` (portion by portion), `jolt(s)`, `pos`. Reparent `root` freely; `reset()` restores |
| `catBowl` | catBowl | `spitBits(fromWorld?, dirWorld?)`, `bitePos(out)` |
| `vase` | vase (on sill, +Z = off the edge) | `knock({dir?, floorY?})` → Promise; then `fragments = {pos, radius: 0.55}` (null before) |
| `curtains` | curtains (rod centre) | `shred(stage?)` 0..3 (no arg = next stage), `wave(bool)`, `state.stage`, `scratchPoints()` |
| `window` | window (opening centre) | `open()`, `close()` → Promise, `isOpen`; open = breeze streaks + curtains.wave(true). Glass blocker always on |
| `fridge` | fridgeFront (+Z = facing) | `open()`, `close()`, `isOpen`, `lightOn`, `slot` (Object3D on middle shelf), `slotPos()`, `top {y,w,d}` |
| `vine` | fridgeTop + panSpot + ceiling | `grab()`, `release()`, `tip` (live world Vector3), `pivot`, `length`, `omega`, `theta0` (fridge side), `thetaTable`, `grabPoint`, `target`, `isOverTarget(tol)`. Default: undamped pendulum while grabbed. To drive it: `autoSwing=false` + `setTip(v)` / `swingAngle(θ)` / `swing(tSinceGrab)` |
| `bedroomDoor` | bedroomDoor (hinge local −X, swings to +Z) | starts OPEN. `open()`, `close()` (blocker collider on), `rattle()`, `isOpen` |
| `frontDoor` | frontDoor | locked: `open()` just rattles; `rattle()` |
| `jonBed` | jonBed | `shred(stage 1..3)` (rips + stuffing + feathers; 3 bursts a pillow), `topY` |
| `garfieldBed` | garfieldBed | static plaid bed + blanket; `sleepPos(out)` |
| `tv` | tv (on stand top, +Z = screen) | `setMode('cartoon'|'static'|'off')` |
| `newspaper` | — | `throwAt(from, to, {onHit, folded=true})` → Promise; `spawn(opts)`. Also `createNewspaper({folded})` → Object3D (~0.3 m along local X) |

Food models live in `js/world/food.js` (plate-local; `FOOD_SCALE` 1.4 in plate.js). Gallery + action buttons:
`tools/props.html` (`?view=food|pan|chair|vase|curtains|...`, `?shot=1` hides the UI, `window.__props`).
Particles (`util.Particles`) are world-space InstancedMeshes; shards/feathers/scraps stay until `reset()`.
No props add lights (light toggles recompile shaders); glows are emissive.
