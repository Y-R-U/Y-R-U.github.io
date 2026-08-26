# ENGINE + SIM notes

Owner: ENGINE+SIM agent. Files owned: `index.html`, `css/style.css`, `js/main.js`,
`js/core/**`, `js/sim/**`, `js/gfx/debug.js`, `tools/sim.mjs`. Nothing else was touched.

Written so a fresh agent can resume without re-deriving anything.

---

## 1. What is built and working

**Boot.** `index.html` → tap-to-start (`#tap`). First tap enters fullscreen, unlocks audio and
starts the level. CSS-only portrait nag (`#rotate`, a media query, no JS polling). No `alert()`
anywhere — messages go through the `#popup` overlay.

**Flight.** `sim/plane.js`. Relative point-at-finger per CONTRACTS §3b + `CTRL`: the target
heading is `atan2(ay - sy, sx - ax)` from the finger's own anchor, `deadPx` holds the previous
target, `maxPx` floats the anchor, magnitude is ignored. `turnRate` rate-limits the swing. Speed
eases to `cruise` at `SPEED_EASE = 0.9 /s` plus `-sin(ang) * PHYS.gravAssist`; that constant is
chosen so a sustained vertical climb *does* reach `stall` (equilibrium ~141, stall 210) and a
vertical dive tops out at ~719 under the Kestrel's 760 `vmax`. Below stall the nose falls at
`PHYS.stallDrop` regardless of the stick.

**Camera.** `sim/world.js: stepCamera`, exactly CONTRACTS §3, every number from `CAM`.
Verified in the browser: at 844x390 the plane sits at 36% across and pins to the 12% top band.

**Terrain.** `sim/terrain.js`, retuned to CONTRACTS §16 / `TERRAIN` — see §3 below.

**Combat.** Auto-firing main gun; 4 special slots; bombs with gravity, rockets, homing seekers,
cluster submunitions, pierce; blast always through `sim/damage.js`; ground props with hp bars and
debris; flak that solves a 3-iteration lead; four fighter AIs; balloons collected by touching.

**Mission / landing / results.** All CONTRACTS §12 objective types, §15.2 matching, `world.results`
with kills, money, time, stars, accuracy. Landing verified end to end on a1-03: 340x160 green pad,
auto-land at t=5.0s, refuel + rearm, objective completes, TAKE OFF relaunches.

**Events, shake, haptics.** The sim only ever pushes plain objects (§8); `main.js: fanOut` is the
only place they become sound or vibration. `sim/` has no DOM reference at all and the harness
proves it at source level.

**`window.__state`** carries plane, cam, stick (anchor + finger + resolved `want`), ent counts,
mission progress, stats, frame-time percentiles, `over`, `results`.

**URL params:** `?level=`, `?seed=`, `?auto=1`, `?dpr=`, `?nofs=1`, `?nosave`, `?ui=1`, `?camtune=1`
plus the seven camera overrides listed in §7.

---

## 2. The seams other agents land on

```js
// gfx: CONTRACTS §14, per the manager's ruling
makeRenderer({ gl: HTMLCanvasElement, hud: HTMLCanvasElement }) -> { resize(), draw(world, alpha, events) }
```

`js/gfx/debug.js` accepts that object, **ignores `gl`**, and draws the grey box into `#hud`'s 2D
context. Swapping in the real 3D renderer is one line in `main.js`:

```js
const { makeRenderer } = await import('./gfx/debug.js');   // -> './gfx/renderer.js'
const usingDebugRenderer = true;                            // -> false
```

**Read this before you flip it:** while `usingDebugRenderer` is true, `main.js` *removes* `#gl`
from the DOM. `tools/shot.mjs` captures `document.querySelector('canvas')`, which would otherwise
return the blank WebGL canvas and hand back a black screenshot that looks like a renderer bug.
With `#gl` detached the capture is `#hud`. Setting `usingDebugRenderer = false` keeps `#gl` in the
document and the capture targets it, which is correct for the 3D build.

**HUD.** `main.js` imports `js/ui/hud.js` and calls `drawHud(ctx, world, {w,h})` after
`renderer.draw`. If that import fails, `debug.js` draws its own thumb buttons and registers its own
`slot0..3` / `takeoff` rects, so the game stays playable. `js/ui/hitrects.js` is the only
UI module `core/input.js` depends on, and it is optional there too.

**What the sim gives the HUD:** `world.player.slots[i] = { id, ammo, cd, cdMax }` (kept in sync
each tick by `plane.js: syncSlots`), `p.fuel` / `p.fuelMax`, `world.loadout`, and
`world.mission.objectives[] = { label, have, need, done }`.

---

## 3. Decisions and deviations

### D-E1 — screen→world lives in `core/math.js`, not `gfx`
Only relevant historically: the pre-D7 absolute control needed it. Under the relative control the
sim never sees a screen coordinate at all. `screenToWorld(cam, sx, sy)` stays in `core/math.js`
for gfx to use, and `debug.js` re-exports it as `toWorld` so a renderer that does own the
transform stays compatible.

### D-E2 — fuel constant is not in `data/tuning.js`
CONTRACTS §4 has `over: 'bingo'` and §8 has a `lowfuel` event, but there is no fuel number in
`data/tuning.js`. `sim/plane.js` holds `FUEL = 600` seconds with `lowfuel` at 20%. Landing refuels.
If DESIGN wants it tunable, add a `FUEL` block and I read it instead.

### D-E3 — landing needs an approach-speed rule
§9 requires `speed < def.landSpeed`, but §3b's model eases speed to `cruise` in level flight and
`landSpeed` is below cruise for every plane, so in level flight the trigger is unreachable — you
would have to arrive on the deck inside the ~0.3 s window after a zoom climb. `sim/landing.js`
exposes `nearPad(p)` and `sim/plane.js` swaps the cruise target to `landSpeed * 0.8` inside a pad's
approach box (4x the pad half-extents). Reads as throttling back on finals. `landSpeed` is not in
`data/planes.js` either; the fallback is `round(stall * 1.5)`.

### D-E4 — enemy fire discipline (balance, not a contract change)
First harness run: two `scout`s took a full-health Kestrel from 100 to 0 in under 3 seconds. Enemy
aeroplanes share the player's weapon rows, so they inherited a 0.11 s cooldown with no accuracy
penalty. `sim/ai.js` now bursts (0.75 s on / 1.5-2.4 s off) and `sim/spawn.js` sets `spreadMul =
3.5` on enemy aeroplanes, which `sim/weapons.js` multiplies into the main-gun spread.

### D-E5 — bosses (superseded by §15.1, now compliant)
Bosses are damaged **per part only**; the boss AABB is never hit. Every `weak` part dead kills the
boss. Destroying a non-weak part nulls its `shoots`, sets `wreck`, and pays its share of the money.
A blast damages every part in radius. `boss.hp` is the live sum of part hp so a bar has something
to read.

### D-E6 — moving ground units no longer drive off the map
`tank` / `halftrack` / `mech_walker` have `moves`, and the first implementation despawned them at
`x < 60`. On a1-09 that made `Destroy armour x4` permanently unreachable, which is exactly the
class of bug the reachability check exists for. They now stop at `x = 240`.

### D-E7 — WITHDRAWN, superseded by D25
The flat "mean <= 16% / crest <= 30%" gate is gone, and with it the hard clamp the generator
needed to satisfy it. See §4 below.

### D-E8 — amplitude alone cannot move the MEAN earth band
The one thing to understand before touching `terrain.js`. `TERRAIN.profiles` gives each profile an
**amplitude multiplier**, and the natural reading is that turning it up fills more of the frame
with earth. It does not. The generator's signal is symmetric about zero, so raising its amplitude
raises the crests and deepens the valleys by the same amount and **the mean surface stays at 0** —
measured: `flat` 11.5%, `rolling` 11.6%, `hilly` 12.7%, `alpine` 12.9%, i.e. the profile knob was
very nearly a no-op against the very quantity the gate measures. Amplitude moves the *crest* band;
it barely moves the *mean* band.

So the profile's declared `band` range is also what sets how high the ground sits:

```js
const lift = ((prof.band[0] + prof.band[1]) / 2) * CAM.vh + CAM.baseY;
```

`flat` +3.5, `rolling` +35, `hilly` +98, `alpine` +134 world units. `y = 0` therefore stays "base
ground" for flat and rolling, which is where `spawns[].y = 'ground'` intuition actually matters,
and a hilly level genuinely fills more of the frame instead of merely having pointier hills.

This makes the gate a **consistency check between the level's declaration and the generator**,
which is exactly what D25 asks for — not an independent measurement of an absolute number, which
D25 explicitly rejects. It fires when the generator ignores the declaration; it cannot fire on a
legitimately hilly level.

---

## 4. Terrain framing (CONTRACTS §16 / D21 + D25)

`makeTerrain` builds a mean-zero signal from three sines at `hillWavelength` and its harmonics
plus value noise at `detailWavelength`, maps positive signal to `maxY * amp` and negative to
`minY * amp`, then adds the profile lift of D-E8. Alpine biomes use `s^1.5` so high crests stay
rare and short. **Vertical scale is the LEVEL's declared character**
(`level.terrainProfile`, default `'rolling'`); the biome only tilts that amplitude and supplies
roughness, bias and the water flag.

Measured mean earth band per profile x biome (`heightAt` every 25 units, all inside the profile's
declared range unless noted):

| profile | want | farmland | city | coast | desert | alpine | sea |
|---|---|---|---|---|---|---|---|
| flat | 8–15% | 11.9 | 11.8 | 12.0 | 11.6 | 12.0 | 11.1 |
| rolling | 10–20% | 15.8 | 15.5 | 14.6 | 15.2 | 15.8 | 11.1 |
| hilly | 16–28% | 23.1 | 22.7 | 19.9 | 22.2 | 23.0 | **11.2 out** |
| alpine | 20–32% | 27.1 | 26.9 | 23.3 | 26.0 | 26.8 | **11.4 out** |

**Known limit, and the gate says so in its failure text:** a water biome's surface is pinned to
the waterline, so a `sea` or flooded `coast` level physically cannot exceed ~11% and must be
declared `flat` or `rolling`. No level in `levels.js` or `levels_gen.js` declares a profile today,
so all 100 default to `rolling` and all 100 pass.

---

## 5. The harness — `tools/sim.mjs`

```
node tools/sim.mjs --level a1-01 --seeds 12
node tools/sim.mjs --all --seeds 2 [--plane sabre] [--ticks N] [--quiet]
```

Plain node, no browser, no npm. Loads `data/levels.js` **and** `data/levels_gen.js` (100 levels
under `--all`). Each level is flown by `sim/autopilot.js`, the reference bot, which drives the same
`world.stick` and `world.slots` a thumb does — so the harness and `?auto=1` exercise the player's
code path, not a parallel one. `--all` gives the bot an act-appropriate aeroplane, upgrades and
loadout; flying every level in the starting Kestrel measures the wrong thing.

Detail lines per seed: ticks, outcome, kills by kind, money, shots/hits/accuracy, explosion count,
stars, **`took N dmg from [source:amount ...]` and the death cause**, the objective board, and the
player's final x and hp. The damage-attribution line is what found D-E4 in one run.

### The three gates, each proven to fail

| gate | what it checks | falsified by | result |
|---|---|---|---|
| 0 · sim purity | source scan of `js/sim/**` for `document \| window \| localStorage \| navigator \| requestAnimationFrame \| performance.now \| Math.random \| new Image \| new Audio`, **plus any import of three** (bare `three`, `three/addons/*`, or a relative `vendor/three/*` path) | (a) appending `document.title` to `sim/damage.js`; (b) `import * as THREE from 'three'` in `sim/world.js`; (c) the same via `'../../vendor/three/three.module.js'` | **fired on all three**, exit 1 |
| 1 · terrain framing | measured mean band must fall inside the range declared by `level.terrainProfile` (D25) | declaring a1-01 `terrainProfile:'flat'` while forcing the generator to use `TERRAIN.profiles.alpine` | **fired**: `profile 'flat' want 8-15%, generator produced 26.4%`, exit 1 |
| 2 · completability | at least one seed of each level must reach `win` | forcing every gravity weapon's `dmg` to 0 | **fired**: `outcomes: dead 4` → `no seed of this level was completable`, exit 1 |

The purity lint runs **before** `js/sim/**` is imported, and refuses to continue if it trips.
That ordering matters: variant (c) above — a relative path to the vendored three — loads perfectly
happily under node, so nothing else would have caught it; and variant (b) kills node at import
time, which without the early lint is an unreadable `ERR_MODULE_NOT_FOUND` stack instead of a
one-line explanation.

Gate 2 was **weak on the first attempt** and this is the important note. With bomb damage zeroed,
every seed still "ran clean" and the harness exited 0 — a pass count alone hid a total loss of the
game's primary weapon. Only the per-level "at least one win" rule turned it red. Every gate here
has now been seen to fail; a fourth check would need the same treatment before it counts as
evidence.

### What the harness currently says, and how to read it

`--level a1-01 --seeds 12` → **12/12 win**, ~23 s each, 3 stars, 6/6 objective, 0 damage taken.

`--all --seeds 1` over 100 levels → terrain gate clean on all 100; outcomes **18 win / 69 dead /
13 timeout**, 82 levels with no win. **Do not read that as 82 broken levels.** The reference bot is
the limiting instrument, not the content — the failure rate is flat across all five acts
(a1 14/20, a2 15/20, a3 16/20, a4 19/20, a5 18/20), which is the signature of a weak pilot rather
than of act-specific content problems. Aggregated damage sources across the sweep:

```
laser_turret 4565   sam_site 3720   plasma_nest 2870   flakHeavy 2712
stealth_drone 2068  jet_fighter 1647  proto_jet 1463   mig_ghost 1235
```

Long-range ground AA (range 1500–2400) dominates. `PHYS.ceiling` is 2400, so altitude alone can
never escape a `plasma_nest` — flying over it is not an available answer, which is a real design
observation for the manager. The bot's remaining gap is that it presses ground attacks inside AA
envelopes it should be suppressing first.

**Two tuning experiments were tried and reverted**, recorded so nobody repeats them:
1. Standing off above a flak gun's range during the setup phase — deadlocked the bot into an
   endless orbit and produced timeouts. Reverted.
2. A vertical break-turn when a faster fighter is on the tail — dropped levels-with-a-win from
   9/20 to 7/20. The hypothesis did not hold; reverted rather than tuned further.

---

## 6. Browser verification

`node tools/shot.mjs --url "/index.html?level=a1-01&auto=1&nofs=1" --size 844x390 --at 0,4,10 --out shots/p1 --state --console`
→ 3 frames, fps 60.4 / 60.1 / 60.0, **zero console output and zero page errors**, no off-origin
requests.

Real-touch suite driven through `tools/touch.mjs` as a library (scratch script, not committed):

```
PASS  nose up                      ang 1.57  want 1.57
PASS  stick anchor exposed         {active,ax:220,ay:236,sx:220,sy:140}
PASS  nose down                    ang -1.57
PASS  diving gains speed           v 614 (cruise 430)
PASS  tiny offset still steers     18px offset -> want 0.000  (magnitude ignored)
PASS  dead zone holds heading      8px move changes want by 0
PASS  anchor floats within maxPx   580px sweep -> offset 96.0
PASS  slot0 rect registered
PASS  HUD touch does not steer     stick.active=false
PASS  HUD touch fires the slot     ammo 6 -> 4
PASS  zero page errors
frame time: p50 17ms  p95 18ms  p99 18ms  worst 18ms  fps 60.1 over 721 frames
```

`?auto=1` frame-time **p95 = 18 ms** at 844x390 dpr 1 under SwiftShader, i.e. the rAF cap with no
long frames at all. Note SwiftShader makes any *drawing* cost unrepresentative; what this measures
honestly is that the sim + 2D overlay never blow the budget.

### A gotcha worth carrying
`tools/cdp.mjs` picks its debug port as `9200 + random(600)` and attaches to the **first page
target it finds**. With another agent running `shot.mjs` concurrently I attached to *their* Chrome
and captured *their* lab page — the symptom was `fps undefined` plus a wall of "OFF-ORIGIN
REQUESTS" that were actually same-origin. If a capture returns nonsense, re-run it before
believing it.

---

## 7. What I would do next

1. **The reference bot is the weakest thing here.** It should suppress long-range AA before
   pressing a ground attack, and it should not tail-chase a faster fighter. Until it does, gate 2
   over `--all` reports pilot skill, not content health.
2. **`a1-03` is the sharpest balance question**: 6 `bf109` kills (hp 130, turnRate 3.0, cruise 540)
   in a stock Kestrel (hp 100, turnRate 2.6, cruise 430, mg dmg 7 = 19 hits per kill). The bot
   reliably gets 4–5 and dies. A human will do better, but the margin is thin for level three.
3. `PHYS.ceiling = 2400` versus `plasma_nest` range 2400 — decide whether altitude is meant to be
   an answer to ground AA. Right now it is not.
4. **Camera tuning is ready for Aaron's playtest.** `world.camTune` is a live copy of `CAM` and
   `stepCamera` reads only that, never `CAM` directly. Three ways in, no reload:
   `?camtune=1` puts a 7-slider panel on screen (`topBand`, `lerpUp`, `lerpDown`, `anchorX`,
   `lookahead`, `lerpX`, `baseY`); URL params `?topband=&lerpup=&lerpdown=&anchorx=&lookahead=
   &lerpx=&basey=` set them at boot; `window.__game.camTune.set({ topBand: 0.3 })` sets them from
   the console. The panel registers its own hit rect so it never swallows a steering touch —
   verified. `window.__state.camTune` reports the resolved values. **When the session settles on
   numbers, they go back into `data/tuning.js: CAM`; `camTune` is a dial, not a store.**
5. `sim/behaviour.js: BEHAVIOUR.boss` moves air bosses left at a fixed 46/s. It has had no design
   pass; boss choreography is content work nobody has done yet.
6. The debug renderer's resolved-state block and the UI's HUD both want the top of the screen.
   The block is bottom-left now, but once the real renderer lands somebody should own that layout.
