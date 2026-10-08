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

## Chapter Two props (wave 3, `props/ch2.js`)
Ch2-only props start **inactive** (hidden, colliders off): `p.setActive(bool)`, `p.state.active`. `world.setChapter(2)` turns on
chair2, odieBowl, carpet, mouseHoles (plate2 stays level-driven: `props.get('plate2').setActive(true)`); `world.setChapter(1)` turns
them off again. `world.reset()` returns every prop to its default (the chapter's active set is kept). Hand props (`suitcase`,
`coffeeMug`, `whistle`, `spitballLauncher`, `tvBox`) can be reparented freely (`root`); `reset()` puts them home.

| id | anchor | API |
|---|---|---|
| `lymanDoor` | lymanDoor (landing → Lyman's room, swings into his room) | like bedroomDoor but starts CLOSED: `open() close() toggle() rattle() isOpen` (+ blocker) |
| `cupboardDoor` | cupboardDoor (under the stairs, swings into the living room) | starts closed: `open() close() toggle() isOpen` (+ blocker) |
| `bedroomDoor`, `frontDoor`, `fridge` | | + `toggle()`. `frontDoor.setLocked(false)` then `open()/close()` really swing it (reset re-locks; the house `frontDoorBlock` collider stays) |
| `dresser` | dresser (Jon's room) | always present. `sockDrawer.open()/close()/toggle()/isOpen/standPos()/play(dur)/socks[]` (open = surface collider at y UF+0.63 Garfield stands in; socks show while open). `breakDrawer.scratch(n)` (3 hits breaks) / `break()` → front pops off, reveals `spitballLauncher`. `middleDrawer` same API as sockDrawer |
| `spitballLauncher` | in the break drawer | inactive until revealed. `fire(from, to)` → Promise (spit-ball arcs, pops) |
| `socks` | — | `items[7]`, `take(i, parentObj, {pos, rot, scale})` → sock Mesh parented to e.g. Odie's ear/tail/mouth socket (dresser.reset puts them back) |
| `chair2` | lymanChair (left end of the table, faces +x) | full chair API (`seat`, `fallBack()`, `bounce()`...) |
| `plate2` | plateSpot2 | full plate API (`setFood`, `eaten`, `fling`...) |
| `catBowl` | | + `eaten(t)` (heap shrinks) |
| `odieBowl` | odieBowl | dog biscuits: `eaten(t)`, `bitePos()` |
| `soupBowl` | soupSpot (= plateSpot) | inactive. `splash()` → Promise (droplets + broth splats on table and floor), `eaten(t)` |
| `table` | | + `warp(t)` 0..1 (middle sags to the floor; top collider follows), `warpTo(t, dur)` → Promise (back to 0 bounces) |
| `tv` / `newTv` | tv | same CRT. `newTv` inactive. `world.swapTv()` = old tv → oldTvSpot on the carpet + newTv on. `tv.moveTo({pos, rotY})` |
| `tvBox` | tvBoxSpot | inactive. `open()` → flaps open |
| `carpet` | carpet (rug in front of the TV stand; the old TV rides it) | `pull({target, dur, height})` → Promise: rug yanks toward carpetEdge, the TV arcs onto `target` + squash. `edgePos()` |
| `biscuitBox` | biscuitBox (inside the cupboard) | always present. `burst()` → biscuits spill (heap in front), `eaten(t)`, `heapPos()` |
| `cheese` | cheeseSpots | `put(i, pos?)` (shows wedge i, default cheeseSpots[i]), `putAll()`, `remove(i)`, `nibble(i, t)`, `placed` |
| `mouseHoles` | mouseHoles | decals at mouseHole0..3 |
| `shedDecals` | shedBed/shedSofa/shedArmchair/shedTable | `set(name, t)` / `add(name, dt)` / `get(name)`; names bed/sofa/armchair/table (aliases jonBed, loungeChair, tableTop) |
| `furPile` | furPileSpot | inactive. `drop(pos?)` → Promise, `puff()` |
| `coffeeMug` | mugSpot | inactive. `spill(dirWorld)` → Promise |
| `suitcase` | suitcaseSpot | inactive. `handle` (Object3D at the grip) |
| `whistle` | whistleSpot | inactive, glints on the floor. `blow()` (faint puff) |
| `vase` | | `knock({target})`: lands/shatters at a world point (Odie's head) |
