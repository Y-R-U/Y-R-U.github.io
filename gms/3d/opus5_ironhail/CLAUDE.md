# IRONHAIL — drone-spotted 3D tank warfare

Mobile-first Three.js (0.160 via CDN importmap, **no build step**). Descended from
`fable5_crow_tank_battle`, but rebuilt: real ballistics, a heightfield you can dig
craters into, an RPG garage, a 20-mission campaign and a simulated world ladder.

## The two ideas everything else hangs off

1. **Every shot is a ballistic body.** `solveElevation()` in `js/projectiles.js`
   is the whole game: given a muzzle velocity and a target offset it returns the
   launch angle. Guns take the low root, mortars the high one — which is why a
   mortar drops behind a wall and a railgun does not. Crosswind pushes shells
   sideways; how much of that the crew corrects for is the OPTICS upgrade.
2. **The battlefield is a mutable heightfield.** `js/terrain.js` owns a
   Float32Array of heights, the mesh is flat-shaded (so craters need no normal
   recompute) and only the touched rows are uploaded. `deformCrater()` digs;
   tanks read the field back through `terrainHeight()`/`terrainNormal()`, so a
   crater immediately changes how they drive and what they can see over.

## The assist model

Aiming has three tiers, and they are all the same code path — `findLock()` with
a different cone, plus `leadQuality` at either the optics value or 1:

| tier | cone | lead + wind | dispersion |
|---|---|---|---|
| bare optics | `0.055 + assistRange × 0.011` | `stats.leadQuality` | full |
| fire control, hand-aiming | `FIRECON.acquireNdc × 0.28` | perfect | `× 0.34`, stabilised |
| fire control, hands off | `FIRECON.acquireNdc`, then hunts | perfect | `× 0.34`, stabilised |

The **FIRE CONTROL COMPUTER** is a garage module (`MODULES.firecon`). It is
issued free on loan for act one — and for skirmishes taken before act one is
finished — so a new commander can learn the arc before paying for the crutch.
`fireControlFitted(mission)` in `save.js` is the only place that rule lives;
battle, the mission brief and the settings toggle all ask it. Settings can
switch the computer off whenever it is fitted, and the toggle turns into a
shopfront once the loaner goes back.

Hand-aiming always wins: any reticle movement over `FIRECON.manualDelta` sets
`manualT`, which narrows the cone and stops the computer hunting for its own
target for `FIRECON.manualHold` seconds.

## Controls

The touch layout is two independent settings, because "aim with my left, fire
with my right" is a real preference that one swap switch cannot express:

- `settings.aimSide` — which half of the glass drags the reticle. The drive
  stick takes the outer 44% of the other side; the middle band belongs to aim.
  Read by `isDriveZone()` in `input.js`.
- `settings.padSide` — which side FIRE and the action buttons sit on. Applied
  as `body.pad-left`, which flips every `right:` in the pad to `left:`.

`applySettings()` in `main.js` is the single place a settings write reaches the
live systems, and `setSetting()` in `menus.js` is the single place a settings
write happens. Settings are reachable from the pause menu (back returns to
pause, not the title) because the moment you discover the buttons are under the
wrong thumb is mid-battle.

## Files

| file | what it owns |
|---|---|
| `config.js` | tuning constants, URL modes, name pools |
| `utils.js` | maths, seeded RNG (`mulberry32`), formatting. Leaf module |
| `arsenal.js` | **pure data + pure functions**: hulls, guns, utilities, upgrades, camo, XP curve, the world-rank curve. Node-testable |
| `save.js` | the one localStorage blob, deep-merged over defaults |
| `bus.js` | tiny event bus — keeps the module graph a DAG |
| `state.js` | shared mutable battle state |
| `render.js` | renderer, scene, camera, post chain, the three scene roots |
| `meshkit.js` | `Parts` — authors an object out of primitives then merges it into **one** vertex-coloured geometry (1 object = 1 draw call) |
| `terrain.js` | heightfield, craters, scorch, ground clutter, ray-marching |
| `env.js` | 6 biomes × 7 times of day × weather; one parametric sky shader |
| `props.js` | destructible scenery: topple / launch / shatter / cook off |
| `particles.js` | pooled debris, flashes, rings, smoke, sparks |
| `projectiles.js` | the solver, shell flight, ricochets, splash, `updateFiring` |
| `tank.js` | terrain-following physics, armour facing, crits, death |
| `tankFactory.js` | procedural hulls (4 classes + the escort hauler) and the drone |
| `ai.js` | enemy crews — same solver, worse optics and slower reactions |
| `drone.js` | orbit/scout flight, spotting, the uplink camera, getting shot down |
| `player.js` | reticle → firing solution, aim assist, the fire-control computer, utilities, aim furniture |
| `haptics.js` | named vibration patterns, gated on the setting and the first gesture |
| `camera.js` | chase / scope / drone / kill-cam / menu orbit |
| `utility.js` | smoke, repair, nitro, EMP, mines, drone strike |
| `battle.js` | mission → battlefield, objectives, waves, scoring, attract mode |
| `missions.js` | the 20-mission campaign + the Tank Attack generator |
| `hud.js` | in-battle DOM: bars, minimap, tags, arrows, damage numbers, pad |
| `menus.js` | title, campaign, brief, garage, ladder, results, settings, pause |
| `preview.js` | the garage turntable |
| `main.js` | boot, screen routing, main loop, `window.__game` test hooks |

## Things that will bite you

- **Craters smaller than a grid cell hit no vertices.** `deformCrater` clamps the
  radius to `CELL * 1.4` for exactly this reason. Cell is ~2.16 units.
- **`mergeGeometries` needs consistent indexing.** `Parts.add()` converts every
  primitive to non-indexed before painting, because polyhedra come non-indexed
  and boxes come indexed.
- **Only AI hulls auto-fire.** `updateFiring()` pulls the trigger for anything
  with `tank.aiDriven`; the player's controller calls `fireWeapon()` itself so it
  can react to its own shot (kill cam). Set in the two controller constructors.
- **AI aim error is dispersion, not wobble.** An error added to `aimPoint` every
  frame means the turret never settles and the AI never fires. The crews aim
  true and their misses come from `tank.extraSpread` applied at launch.
- **`render.js` exports several bindings on one `export let` line.** Static
  import checkers often report these as missing. They are not.
- **Time dilation in headless Chrome.** `dt` is clamped to 0.05, so at ~15fps
  under swiftshader the sim runs ~3× slow. Budget wall-clock accordingly.
- **`navigator.vibrate` before the first tap logs an error.** `haptics.js` stays
  asleep until a real gesture arms it. Do not call `vibrate` from anywhere else.
- **The computer holds the trigger.** With a lock, `shoot()` refuses to fire
  while `aimError > 0.03` until the fire buffer nearly expires. Without that it
  fires mid-traverse and auto-aim scores worse than hand-aiming (23% vs 75% in
  a held-trigger soak).
- **`window.blur` auto-pauses the battle** — and would kill an unattended soak,
  so `AUTO_MODE` opts out. Anything else that runs the game headless for a long
  time needs the same escape hatch.
- **A wipe keeps `profile.settings`.** Control layout is not progress; making
  someone re-pick their aiming thumb after a reset is a punishment.

## Testing

Headless Chrome over raw CDP (no puppeteer needed) — launch with
`--headless=new --remote-debugging-port=… --use-angle=swiftshader
--enable-unsafe-swiftshader`, connect to the **page** target from `/json/list`
(the browser target has no `Runtime.enable`), and disable the network cache or
you will debug a stale module for twenty minutes.

URL hooks:

| hook | effect |
|---|---|
| `?mission=a2m3` | jump straight into a campaign mission (or a tier number for a skirmish) |
| `?start=garage\|ladder\|attack\|battle` | open on that screen |
| `?auto=1` | an AI drives the player — full unattended soak runs |
| `?lite=1` | no bloom, no shadows, fewer particles |
| `?dev=1` | debug readout |
| `?wipe=1` | clear the save on boot |
| `?env=night,tundra` | force an environment on the menu backdrop |
| `?seed=1234` | force a battlefield seed |

`window.__game` exposes `state`, `profile`, `terrainHeight`, `propList`,
`aimAt(x,z)`, `fireNow()`, `win()`, `info()` (draw calls/triangles),
`setSetting(k,v)` (writes and applies), `giveModule(id)`, `giveScrap(n)`,
`utils.useUtility` and the screen functions.

Useful battle probes: `state.fcFitted` / `state.fcTrial` / `state.autoAiming`,
`state.player.controller.manualT`, `state.player.extraSpread`.

## Balance notes

- Enemy damage scales with crew skill (`dmgMul = 0.5 + skill * 0.62`) so act one
  is survivable on a stock hull and act four is not.
- Stars: complete → inside par time → par time with half your hull left.
- BP per battle is `bpBase × (0.72 + 0.28 × stars/3) × (1 + accuracy × 0.3)`;
  a loss costs 26% of base. `RANK_ANCHORS` in `arsenal.js` maps BP to world rank
  and is the one place to retune the climb from #150,000 to #1.
