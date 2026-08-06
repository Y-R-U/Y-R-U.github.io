# HANDOFF_VFX — C4, impact VFX

Splash columns, shell hits, sustained fire, burning-ship smoke, rain.

---

## §0 PASS 3 — the light, not the tint (final pass for phase 1)

### The finding that mattered

A reviewer said the panels "apply a global colour wash instead of lighting the scene", measured on
`hit_explode` as near water **169/92/46** against far horizon **118/53/29** — same hue two
kilometres apart. I assumed that was the dusk grade and it was not. **Isolating C4 settled it in one
render:**

```
node tools/shot.mjs --shot=night_burn \
  --pre="(()=>{Object.assign(__c4,{sea:0,light:0,hot:0,flame:0,smoke:0,rain:0,col:0,spray:0,apron:0});return 1})()"
```

| `night_burn`, row of frame | all C4 off | C4 on (pass 2) |
|---|---|---|
| 0.68 (mid sea) | 57/36/34 | 126/73/46 |
| 0.80 | 44/28/31 | 83/43/35 |
| 0.95 (foreground) | 35/21/25 | 67/33/28 |

The base scene was already dark and near-neutral, and matched the plate almost exactly. **C4's own
sea lights were the wash**, because `ocean.js`'s sea-light term is

```
att = radius / (radius + dist);   col += colour * att * att * ...
```

which is a **very fat tail**. At `seaRadius: 210` a fire still put a third of its peak on water
200 m away and a tenth of it on water at a kilometre. Pass 2 had set 210 and 160 m on the two hero
fires and 70 m on everything else, plus `R*12` (= 200 m) on the hit, and that alone painted the
whole frame. Radii are now **24–52 m**, intensities rebalanced, and the falloff appears on its own:

| | near water R−B | far sea R−B |
|---|---|---|
| `hit_explode` pass 2 | 75 | 65 |
| `hit_explode` **now** | **69** | **24** |

The second half was `skyHaze` and `seaHaze`. `uHazeAmt` mixes the dusk grade's orange `uHorizon`
into the low sky *and*, through `skyBase()`, into the ocean's airlight; `seaHaze` scales the
ocean's own `fogK`. Pass 2 ran `skyHaze: 1.9 / 1.6` with `seaHaze` at its default 1.0, so every
metre of sea past ~400 m *was* the horizon sky. Now `skyHaze 0.42 / 0.50` and `seaHaze 0.55 / 0.50`.

**I tried the `night` grade as the alternative and rejected it on measurement**, not taste:
57.4% of the frame at luma ≤ 4, p1 = 1, median 3 — `CRUSHED`. Dusk with the wash removed is the
right base; a darker grade only trades a grey wash for a black one.

### What else changed

1. **Real point lights with a cutoff that ends inside the ship.** `light.distance` was `H*8` on
   fires and `R*11` on hits — one fire lit a 140 m hull stem to stern at one value, which is why
   nothing had a shadow face. Now `H*4.2` / `R*4.5` (three.js windows the 1/d² by
   `(1−(d/cutoff)⁴)²`, so the pool genuinely ends), with candela cut to match. Funnel, bridge and
   masts now have a lit side and a dark side. No point light casts shadows — a `PointLight` shadow
   is six cube faces, and the brief said be selective.
2. **Ship ambient down** from 0.30/0.16 to **0.075** on both night shots. The hemisphere term was
   filling in exactly the faces the fires were supposed to leave dark.
3. **Smoke is a dark mass, not grey haze.** `dark` 0.050–0.105 → **0.0065–0.023**, alpha up to
   0.42–0.66, `NS` 14→18 per size unit. It is now darker than the sky it stands against, which is
   what the plate does and what finally moved p1.
4. **The smoke column is sheared, not drifted.** The lean is now proportional to how far the puff
   has already climbed, so the column bends over progressively instead of the whole cloud sliding
   downwind. Plus per-card aspect (`ar`), a slow `spin` with age, and a `fat` exponent giving a
   ~6:1 instance size range at any one moment.
5. **The sourceless puffs were `fleet.plumes`, not my cards.** `night_burn` staged its far hulk at
   `x = 760, z = -1180`; the frame at that range is **±562 m**, so the hull was off the right edge
   and only its plume drifted in — a horizontal row of lobes standing in clear air with nothing
   under them, exactly as described. Same defect on `hit_explode`'s `x = 980, z = -1420` and its
   `x = 176, z = -276` casualty. All three moved in-frame, `drift` cut ~3×, `rise` raised 2–3×,
   `spread` raised to ~1.15 so the puffs are not a chain.
6. **The black quad is fixed and its cause is worth keeping.** It was a smoke card whose quad
   straddled the sea: cards are `depthWrite:false` but still depth-*tested*, so the sea clipped it
   along the sea's own triangle edges and what survived was a hard-sided unlit polygon lying on the
   water. Every smoke/steam card in `fire.js` and `impact.js` now clamps to
   `y ≥ seaY + size*0.6`, and sinking `debris` is alpha-gated on the same test. Verified gone at 4×.
7. **Contact events.**
   - `ringTexture()` (new, 128², +0.065 MB) — a broken annulus with a bright crest and a short
     aerated tail, on a `WaterPatch` so it follows the swell. Every splash now sends out a ring at
     a real shallow-water celerity, `r = R·1.1 + √(g·H·0.06)·t`, thinning as `1/r`.
   - Fires on water get a **foam apron** (`apronTexture` on a `WaterPatch`) and **steam** — small
     warm-at-the-root spray cards.
   - The apron/ring/foam patches are `depthTest: false`. With depth testing they were cut along the
     sea's triangle edges wherever a crest in front rose past their `lift`, drawing a hard white
     plate on the water — the same class of bug as the black quad, opposite value. **C6: this means
     they will draw over anything between them and the camera.** Nothing is, in the scored set.
8. **Rain.** The warm term had the identical no-falloff bug: `min(1, radius*0.8/dd)²` was flat to
   150 m, so every streak in frame got the same cream tint whether it crossed a fire or not. It is
   now a true `(radius·0.3/dd)²` plus a screen-space term gated on the fire's **apparent** radius
   (`atan2(radius·0.34, along)`), so only streaks silhouetted against a fire warm. Distance falloff
   `(near/d)^0.22` → `^0.62`; width no longer a fixed fraction of length; a third of the drops carry
   their own gust so the frame is not one ruled angle. Added **rain strikes on the sea** (soft-
   additive specks seated on the swell) and **murk curtains** — 18 large cool low-alpha cards
   stratified across the frame at 380–1900 m, which is what breaks the dusk grade's uniform horizon
   band. Measured on row 0.57, nine samples across: `213/213/213/179/213/213/213/68/213` before,
   `152/146/133/131/167/198/181/65/163` after.

### Light budget as it stands

Pool cap is 4; `ocean.setSeaLights()` takes 2.

| shot | pooled `PointLight`s | sea slots |
|---|---|---|
| `splash_miss` | 0 | 1 (the near column's wash; the far one loses the arbitration) |
| `hit_explode` | 3 — hit, ship fire 0.33, ship fire 0.58 | 2 — ship fire (0.9 / 28 m), near oil pool (0.55 / 24 m) |
| `night_burn` | 3 — ship A main, ship A forward, ship B main | 2 — ship A (1.5 / 34 m), ship B (1.2 / 26 m) |

One light is deliberately left spare in each for C6. **A point light on open water is wasted** —
the ocean is a raw `ShaderMaterial` and no `PointLight` reaches it; water is lit only through
`seaSource()`. Give lights to fires that have a hull near them.

### Final numbers

| shot | draw calls | triangles | fps | `vfx.alive()` | texMB (project total) |
|---|---|---|---|---|---|
| `splash_miss` | **48** / 90 (48 main) | 65k / 300k | 60 | 2 | 39.31 / 45 |
| `hit_explode` | **65** / 90 (53 main) | 74k / 300k | 60 | 7 | 36.69 / 45 |
| `night_burn` | **77** / 90 (65 main) | 78k / 300k | 60 | 9 | 36.70 / 45 |

Up from 44 / 58 / 69: **+4 splash_miss** (ring patches), **+7 hit_explode** and **+8 night_burn**
(3 foam patches, 3 ring patches, the spray field now claimed by steam). Still 13 calls of headroom
on the worst shot. Triangles +3k/+4k/+8k. 60 fps unchanged. C4's texture share is ~0.40 MB.

`node tools/exposure.mjs shots/splash_miss.png shots/hit_explode.png shots/night_burn.png`:

| | p1 | p5 | median | p99 | verdict |
|---|---|---|---|---|---|
| `splash_miss` | 10 | 25 | 86 | 166 | **ok** |
| `hit_explode` | **15** | 22 | 60 | 193 | **ok** (was 22/39/84/200 `LIFTED`) |
| `night_burn` | **14** | 21 | 48 | 140 | **ok** (was 26/32/63/159 `LIFTED`) |
| plate `1272010_01` (through `compare.mjs`'s own crop) | 21 | 27 | 88 | 202 | `LIFTED` |
| plate `1272010_06` (same) | 10 | 21 | 95 | 220 | ok |

Note for whoever reads this next: measured through the **exact sheet crop `compare.mjs` uses**,
plate 01 itself reports p1 = 21 and trips `LIFTED`. The brief's figure of 15 came from somewhere
else. Both our night shots are now below the plate at the dark end; where we are still short is the
bright end and the middle (median 48 vs 88, p99 140 vs 202 on `night_burn`).

The fire colour ceiling is intact and was re-measured after raising flame brightness — over the
fire region (`R>150 && R−B>60`): neutral pips **0.001%**, `G=255` **0.000%**, max G where R>200
**250** on `hit_explode`; **0.000% / 0.000% / 242** on `night_burn`. Same profile as pass 2.

### Escalated

Nothing. Every fix landed inside `impact.js`, `fire.js`, `field.js` and my own scenario setups.

### Honest ranked list of what is still weak — the phase-1 revisit list

1. **`night_burn` is a stop too dark in the middle.** Median 48 against the plate's 88, p99 140
   against 202. The plate is a *bright* rainy dusk with a dark sea; ours is a dim one. Getting the
   sky and the fires up without putting the wash back is the single biggest remaining gap, and I
   ran out of pass to do it. Start with the fires: they are 240–330 m away and physically small on
   screen, so raising `scale` on the two heroes buys p99 more cheaply than exposure does.
2. **The dusk grade's horizon band.** `uHorizon` is `#d9853f` and `gradPow` is 0.38, so the lowest
   several degrees of sky are orange no matter what — it is broken up by the murk curtains now, not
   removed. Neither plate has it. A fourth grade (a cool overcast storm dusk) is the real fix and
   it is C1's file; a scenario cannot author one.
3. **Smoke reads as round lobes at 4×.** Better than pass 2 — dark, sheared, size-varied,
   source-attached — but the silhouette is still made of soft circles. It needs alpha broken at the
   *card* level (a second noise fetch in the smoke texture weighted to the rim) rather than by
   overlapping more discs.
4. **`fleet.plumes` puffs are still countable** where they thin out. `Plumes.add` places them on a
   fixed `t = i/puffs` path with one `spread` jitter; at 12–17 puffs the chain is visible if you
   look. It is C3's class and the parameters are all a caller has.
5. **Hulls meet the sea in a straight cut.** No bow wave, no waterline collar. I fixed contact for
   splashes and for fires on water; hull-to-water is `ship.js`'s and I left it alone.
6. **Rain is better but not right.** Widths and angles vary now and the tint responds to the fires,
   but the streaks are still hard-edged at 4× and there is no near-field motion blur or lens
   interaction. The strikes on the sea are specks, not rings.
7. **`hit_explode`'s foreground is close to blown** around the near oil pool — row 0.78 measures
   126 against the plate's ~89. Trimming further started to kill the "the fire lights the water"
   read, so I stopped; it wants the fire made smaller rather than the light made dimmer.
8. **`splash_miss`'s far column has a contact event now but a thin one.** The ring survives
   minification (the crest was widened from 0.045 to 0.075 uv for exactly that), but at 330 m it is
   a pale disturbance rather than a crown. A real crown needs the card count raised at size 4,
   which currently ladders off `VFX[4].cards = 1.6`.
9. **`depthTest: false` on the water patches is a constraint, not a fix.** It is correct for a
   static shot where nothing is between the foam and the camera. The moment C6 flies the camera
   behind a hull, foam will draw through it.

Files owned: `js/world/vfx/impact.js`, `js/world/vfx/fire.js`, `js/world/vfx/field.js`.
`js/world/vfx/index.js`, `pool.js` and `gun.js` are **not** mine — index.js is frozen, gun.js is C3's.

Written for **C6**, who drives all of this off the shell's flight and its impact.

---

## 1. The trigger API

Everything goes through the frozen façade `window.__waterline.vfx` (`vfx/index.js`). C4 registers
three of its six names: `splash`, `hit`, `fire`. Every call returns a handle
`{ get alive, kill() }` — `kill()` is idempotent and releases every card, light and sea source the
effect holds.

```js
const emit = window.__waterline.vfx.emit ?? window.__waterline.vfx;   // both spellings exist
```

### `vfx.splash(pos, size)` — a shell falling short

```js
vfx.splash(new THREE.Vector3(x, 0, z), 9);            // shorthand: size only
vfx.splash(pos, { size: 9, seed: 991, at: 1.35 });    // full form
```

| field | default | meaning |
|---|---|---|
| `size` | `9` | `1 \| 4 \| 9`, resolved through `config.js` `VFX[size]` — scale, card count, light. Never pass a metre value here. |
| `height` | `15` | column height in metres **at size 1**, before `VFX[size].scale`. Size 9 → 39 m. |
| `seed` | rotating | integer. Same seed → identical splash. Omit and consecutive splashes differ. |
| `at` | — | pose this one splash at `t` seconds (see §2). |

`pos.y` is ignored — the column seats itself on `ocean.heightAt(pos.x, pos.z)` every frame, so a
splash on a 2.8 m swell rides the swell.

Lifetime is `1.1 + H/11` s and it self-expires; you do not have to `kill()` it.

**C6 note.** A salvo of four should be four `splash()` calls in a row with **different seeds**, not
one call four times. The shared pin (§2) staggers them by emission order automatically.

### `vfx.hit(pos, size)` — a shell striking a hull

```js
vfx.hit(ship.hullSide(0.42, 1), {
  size: 9,
  out: new THREE.Vector3(0.22, 0.16, 0.96),   // outward normal of the plating that was struck
  wind: [-14, 6],                              // m/s, XZ
  seed: 4409,
  seconds: 6.0,
  sea: true,                                   // false = do not claim a sea-light slot
});
```

`out` is the one field worth getting right: the fireball, the smoke shell and the point light are
all built around it, and the light is deliberately pushed **off** that axis so the plating around the
hit is not lit at grazing incidence. Default is `(0,0,1)`.

`hit` does **not** start a fire. It is a 6 s event. If the cell should burn afterwards, follow it
with a `fire()` on the same ship — that is what `hit_explode` does.

### `vfx.fire(host, localPos, seconds)` — a sustained fire

```js
// on a ship — localPos is in the ship's local space, so it rides the hull's roll
vfx.fire(ship.object3D, ship.object3D.worldToLocal(ship.hullSide(0.33, 1)), {
  seconds: 0,          // 0 = burns until vfx.clear() or handle.kill()
  size: 9, scale: 1.0,
  seed: 71, wind: [-14, 6],
  candela: 210,        // PointLight intensity before VFX[size].light
  lightRange: 68,      // PointLight cutoff in metres; defaults to H*4.2
  seaIntensity: 0.9,   // 0..2, how hard it lights the water
  seaRadius: 28,       // metres — see the falloff note below. NOT a "how far you can see it".
  light: true,         // false = no PointLight (use for all but the 1-2 hero fires)
  sea: true,           // false = no sea-light claim
  smoke: 1,            // multiplier on smoke alpha; drop it on near-camera fires, whose columns
                       // otherwise fill the frame
  warmRadius: 190,     // reach of its lighting on rain/smoke; defaults to seaRadius, then H*9.
                       // NOT gated by `sea` — a fire always lights what is near it.
});
```

**`seaRadius` is the single most dangerous number in this API.** `ocean.js` attenuates as
`(r/(r+d))²`, which still delivers a quarter of peak at `d = r` and a tenth at `d = 2r`. A value in
the low hundreds does not make a bright pool, it tints the whole sea. Working range for a fire that
should light the water it stands on and nothing else: **24–52 m.** Same for `hit`, whose `seaRadius`
now defaults to `R*2.6` rather than `R*12`.

```js

// on the water — host null, localPos is a WORLD position, y ignored, seats on the swell
vfx.fire(null, new THREE.Vector3(-20, 0, -66), { seconds: 0, size: 4, scale: 1.0, seed: 1201 });
```

`seconds` numeric → burns that long with a 3.5 s burn-out ramp; `0` → infinite.
`scale` is a free multiplier on top of `VFX[size].scale`; use it for "same size class, a bit bigger".

**Budget discipline, and this is the part C6 has to respect.** There are only **4 pooled point
lights** for the whole VFX system (`vfx/index.js`), and `ocean.setSeaLights()` takes at most **2**.
Pass `light:false, sea:false` on every fire that is not one of the one or two heroes in frame. A
scene of eight fires with `light:true` silently starves the pool and you get an unlit hero.

### `rain(opts)` — not on the façade

`rain` is not one of the six names the frozen façade knows, so it is a **named export of
`fire.js`**:

```js
import { rain } from './js/world/vfx/fire.js';
rain({ count: 330, near: 9, far: 200, seed: 8821, lean: 0.13, tone: 0.21,
       murk: 18,     // large soft cool curtains standing across the horizon; 0 disables
       hits: 54 });  // soft-additive strikes seated on the swell in the near field

It must be called **after at least one `fire()` or `splash()`**, because it borrows the emitter
context those stash (`useCtx`). It lays streaks out around the *current* camera in a log-uniform
depth distribution, so it is a still/short-shot effect: it does not follow a moving camera. If C6
flies the camera during rain, re-issue it — `kill()` the old handle first.

Rain tints itself from the live sea-source list, so a streak crossing a fire's glow warms. That is
automatic; the only requirement is that at least one fire has `sea: true`.

---

## 2. Pose and determinism hooks

The shot harness settles 45 frames before it captures, and D13 says two runs of the same code land
on different animation phases anyway (`night_burn` measures a **33% / mean 1.218** noise floor
against `sea_dusk`'s 4.5% / 0.086). So nothing in a scored still may run on the wall clock.

Two clocks, exported from `field.js` and re-exported from `impact.js` / `fire.js`:

```js
import { setImpactPhase, setFirePhase } from './js/world/vfx/impact.js';

setImpactPhase(0.08, 0.03);  // every live splash/hit poses at t = 0.08 s, staggered 0.03 s per
                             // emission order (so a salvo is not four identical columns)
setImpactPhase(null);        // release: impacts run on the clock again
setFirePhase(30);            // every live fire poses at t = 30 s
setFirePhase(null);          // release
```

`resetImpactOrder()` (exported from `impact.js`) zeroes the stagger counter. Call it at the top of
any scenario that uses `setImpactPhase` with a non-zero spread, or the stagger keeps accumulating
across scenario switches.

Per-effect override: `{ at: 1.35 }` on a single `splash`/`hit`/`fire` beats both pins. Use it when
two columns in one frame must be at different ages.

**A pinned effect never expires.** `update()` returns true forever while a pin is set, so
`vfx.clear()` (which `vfxScene()` calls) is what ends it. That is intentional — a still must not
have its subject time out mid-settle.

Determinism: every emitter draws from `rng(seed)` in `textures/noise.js`, which is a pure integer
PRNG. Same seed + same pin ⇒ same geometry every run. What is *not* deterministic run-to-run is
the ocean's `uTime`, and the effects read `ocean.heightAt()`, so a splash base and a water fire
still move a little between runs. That is D13's noise floor, not a bug.

---

## 3. What `field.js` is

VFX-private (only `impact.js` and `fire.js` import it). It exists because `vfx/index.js` is frozen
and its shared `CardField` cannot do three things C4 needs:

1. **Soft-additive blending.** `softAdd(mat)` sets `dst' = src·(1 − dst) + dst`, which approaches 1
   asymptotically and cannot reach it. Plain additive blending happens *after* tone mapping, so N
   cards sum in LDR and clip to a flat white plateau; this is the soft knee the scene has no bloom
   pass for. **Do not replace this with a bloom pass** — see C3's E4. The factor is on the source
   *colour*, so alpha no longer modulates it and every texture on this path is premultiplied.
2. **Non-uniform scale** — a flame tongue and a rain streak are both far taller than wide.
3. **Per-instance alpha on the normal-blended path** (`aAlpha` attribute + `alphaPatch`), so a
   cloud of smoke fades card by card instead of popping out on one frame.

### The fields

One `Cards` instance per material, shared by both files. Each is **one draw call**.

| field | cap | blend | used by |
|---|---|---|---|
| `sprayField` | 560 | normal | splash column, crown, veil, droplets |
| `smokeField` | 280 | normal | hit smoke, fire smoke column |
| `hotField` | 260 | softAdd | fireball, embers, flame roots, tips |
| `flameField` | 220 | softAdd | flame tongues |
| `rainField` | 360 | softAdd | rain streaks only |

`take()` → a slot or `null` when the field is full; `give(slot)` returns it. **An emitter that
cannot get a slot must `break`, not throw** — every loop here does.

`pumpCards(camera)` re-orients and uploads every field, frame-guarded on
`window.__waterline.frames()` so the twelve live effects calling it cost one flush.

### Other services

- `WaterPatch` — a disc mesh whose vertices are written from `ocean.heightAt()` every frame, so
  foam and fire glow lie **on** the swell instead of slicing through the crests. `set(x, z, radius,
  lift)`, `hide()`. This is the seam C6 should reuse for anything that has to touch the water.
  Five of them are live now: the splash apron, the splash **ring** (`ringTexture()`, pass 3), the
  fire glow, the fire **foam** apron, and their pools. Everything but the glow runs
  `depthTest: false` — see §6.
- `warmSource(radius)` / `dropWarmSource()` / `warmSources()` — "what is bright enough to light
  everything else". Every fire and every fireball registers one whether or not it won a sea-light
  slot. Rain reads it; anything C6 adds that needs to know where the light is should read it too.
  It is uncapped, unlike the sea arbiter.
- `seaSource()` / `dropSeaSource()` / `pumpSea()` — the sea-light arbiter. `ocean.setSeaLights()`
  takes 2 and `gun.js` **clears the list outright** when a muzzle dies, so a last-writer-wins call
  site is wrong. Everything registers here, the two strongest intensities win, and the list is
  re-asserted every frame so another component's clear cannot survive.
- `vfxScene(app, grade, opts)` — the scenario preamble. Sets grade, sea state, fog (via D15's
  `lighting.setFog`), detail fade, shadow extent and ship ambient, in the order that survives the
  sky-grade listeners. `{ seaState, shadow, sky, fog, fade, amb }`.
- `dbg` — `window.__c4`, read every frame. Isolation switches for
  `col, spray, apron, flame, smoke, hot, sea, light, rain`. Use with `--pre`:
  `node tools/shot.mjs --shot=night_burn --pre="__c4.rain=0"`. Forcing a term to a constant is the
  only way to tell "wired wrong" from "wired right and multiplied out".

---

## 4. Quality knobs

There is no C4-private knob. Everything scales through two existing seams:

- **`VFX[size].cards`** in `config.js` — every card loop is `Math.round(N * cfg.cards)`, so the
  1/4/9 size classes already ladder card counts 1.0 / 1.6 / 2.4.
- **`app.quality`'s `vfxCap`** resizes the *frozen* field only. C4's own fields are fixed-cap
  `InstancedMesh`es sized for the worst scored shot; they cost their draw call whether 3 or 300
  slots are live, and the geometry cost of a dead slot is zero (scale is set to 0).

If a phone preset needs to shed VFX cost the lever is `VFX[size].cards`, not new knobs.

Screen-space minimum card size is enforced in `Cards.flush()` (`minPx`, default 2.5 px): a card
whose projected size falls under it is grown and its alpha reduced to conserve integrated energy.
Without it, embers at 1 km resolve to hard aliased 1-px squares.

---

## 5. Perf and texture cost

Reported as counts (D4). Budget: **90 draw calls, 300k triangles, 45 MB texture (project total,
D16 — C4/C6/C7 share ~6 MB of it)**.

**Superseded by §0 — these are the pass-2 figures, kept for the delta.**

| shot | draw calls | triangles | fps | `vfx.alive()` | texMB (project total) |
|---|---|---|---|---|---|
| `splash_miss` | **44** / 90 (44 main) | 62k / 300k | 60 | 2 | 39.22 / 45 |
| `hit_explode` | **58** / 90 (46 main) | 70k / 300k | 60 | 7 | 36.52 / 45 |
| `night_burn` | **69** / 90 (57 main) | 70k / 300k | 60 | 9 | 36.53 / 45 |

Unchanged from pass 1 on draw calls (44 / 58 / 69) and fps. Triangles rose 59k → 62k on
`splash_miss` only — more spray cards and a finer apron patch. `splash_miss` carries the highest
texMB because it is the only scored shot on the `noon` grade, which resident-bakes more; the C4
share of that total is ~0.34 MB.

Exposure after every change: `node tools/exposure.mjs shots/splash_miss.png shots/hit_explode.png
shots/night_burn.png` → **0.0% dead, 0.0% clipped** on all three, medians 86 / 84 / 63.

**Draw-call cost of C4 is fixed and small:** five card fields (5 calls) + at most 3 splash column
meshes + 3 aprons + 5 fire glow patches, and those last three only while alive. Nothing here
allocates per beat: a sustained fire takes its cards once and cycles them on a phase.

**Texture cost is 7 procedural canvases, ~0.30 MB total, all shared across every effect:**

| texture | size | fmt | notes |
|---|---|---|---|
| `vfx:spray` | 128² | rgba+mips | splash cards |
| `vfx:smoke` | 128² | rgba+mips | all smoke |
| `vfx:flame` | 64×128 | rgba+mips | one flame tongue, premultiplied |
| `vfx:hot` | 64² | rgba+mips | fireball / ember / glow blob, premultiplied |
| `vfx:apron` | 128² | rgba+mips | splash foam ring + contact darkening |
| `vfx:column` | 64×96 | rgba+mips | the splash's dense root |
| `vfx:rain` | 16×128 | rgba+mips | one streak |
| `vfx:ring` | 128² | rgba+mips | the wave a splash sends out (pass 3, +0.065 MB) |

(`vfx:hot` is 96² rather than 64²: at 64² the noise that stops it being a perfect disc was
under-sampled. +0.023 MB.)

No baked maps, no per-effect bakes, nothing over 128². Prefer procedural geometry and vertex
colours over anything new here — C6 and C7 are sharing the same 6 MB.

---

## 6. Traps this cost real time to find — read before you debug anything here

**`ocean.setSeaState(n)` does not stick.** It writes `stateIdx`, which `applyGrade()` overwrites
from the grade every time anything touches the sky — and `sky.setSun()` runs *after* the scenario
preamble in two of the three scored shots. Measured: all three C4 scenarios were rendering the dusk
grade's `slight` (0.7 m) no matter what they asked for, which is why a reviewer called the sea "a
flat plane" while displacement was demonstrably live. The fix is the **quality knob**,
`app.quality.set('seaState', n)`, which writes `stateOverride` — the one value `applyGrade` respects.
`vfxScene()` now does this, and passes `-1` when a scenario doesn't specify, handing the state back
to the grade. Same class of bug as D12 (`texCap`), D15 (`setFog`) and D14: *a value written once at
setup and also written by a listener belongs to the listener.*

**A card centred on the waterline is depth-clipped by the sea, along the sea's triangle edges.**
Cards are `depthWrite:false` but still depth-*tested*. One 19 m veil card straddling the surface
came back as a hard-edged grey polygon lying on the water. The splash crown is therefore ~22 small
cards rather than 11 big ones, and the veil sits at 0.30–0.44 H.

**A translucent mesh must match the value of the cards it covers.** The splash column body was
`color 1.32` against spray at `1.52–1.62`, so it *darkened* everything behind it and stamped its
low-poly silhouette across the base of every column. It is 1.58 now. If you re-grade the spray,
re-grade the column with it.

**The ocean's sea-light term is `max(dot(N, L), 0)` per fragment.** A source at `y = 2` makes `L`
near-horizontal, the terminator lands on the wave mesh, and you get a straight edge across the
swell. Splash and fire sources sit well above the surface for this reason.

**The ocean's sea light has a very fat tail, and it is not an intensity knob.** `att = r/(r+d)`
then squared: at `d = 2r` it is still a tenth of peak, at `d = 5r` a fiftieth, and a fiftieth of a
bright source against a dusk sea whose deep colour is `#191419` is still a doubling. Pass 2 ran
`seaRadius` at 70–210 m and every scored shot came back as one flat orange. Keep it in the tens of
metres and raise `seaIntensity` instead — the pool gets brighter, the frame does not.

**A three.js `PointLight`'s `distance` is what gives a hull a shadow face.** The windowing term is
`(1 − (d/cutoff)⁴)²`, so nothing much happens until `d` is most of the way to `cutoff`. At `H*8`
the pool covered a whole ship and the plating came back one value; `H*4.2` ends it inside the hull's
own length.

**A water patch that is depth-tested gets cut along the sea's triangle edges.** Wherever a crest in
front rises past the patch's `lift`, the sea occludes part of it and the survivor is a hard-sided
polygon lying on the water — bright for foam, black for smoke. The aprons and rings are
`depthTest: false` for this reason, and the smoke and steam cards clamp to `y ≥ seaY + size·0.6`.
**C6: `depthTest: false` is only safe while nothing is between the water patch and the camera.**

**Rain must not be alpha-blended.** An alpha streak drawn over a bright fire can only darken it, so
however warm you make the streak's colour it comes back cool. `rainField` is soft-additive.

**`fleet_wide` does not complete on this machine, and it is not C4's.** Observed while checking for
regressions: `node tools/shot.mjs --shot=fleet_wide` sits with chrome alive and node at 0% CPU,
blocked inside a CDP call, for 7+ minutes on an otherwise idle box (load 1.5, zero stray browsers).
`shot.mjs`'s own timeouts are all bounded, so the stall is in `Runtime.evaluate` /
`Page.captureScreenshot`, not in its polling. Evidence it is not this component: `js/world/vfx/
field.js` is imported **only** by `impact.js` and `fire.js`; `main.js` imports those two purely for
their `registerEmitter` / `defineScenario` side effects; nothing in them allocates a field, a
texture or a card until an emitter is called, and `fleet_wide` calls none. `sea_dusk` (3 calls) and
all three C4 scenarios (44–69 calls, ships staged, 62–70k tris) render in 10–25 s in the same
session. Whoever owns `fleet_wide` next should re-check it on a clean machine before reading
anything into its numbers.

**Two faint horizontal seams across the water near the splash base are not C4's** — they are in the
frame with every C4 term forced to zero (`--pre="__c4.col=0;__c4.spray=0;__c4.apron=0;__c4.sea=0"`).
They are `ocean.js`'s radial-grid ring boundaries. Likewise the soft dark ovals on the hull in
`hit_explode` are `ship.setDamage()` decals, not scorch from the hit.

## 7. Known gaps / where to look first

- The splash column's dense root is a real ragged tube (`buildColumnGeo`), faded by `|N·V|` so its
  silhouette dissolves rather than drawing a mesh edge. It only covers the bottom ~34% of the
  column height; above that the cards own it. Making the mesh the whole column reads as a moulded
  traffic cone whatever is drawn on it.
- `rain()` is camera-relative and does not track a moving camera. Its `murk` curtains and `hits`
  are laid out on the camera's axes too, so they move with it in exactly the same way.
- Fire tongues are billboards. Seen exactly edge-on from directly above they degenerate; no camera
  in the scored set does that, but a C6 fly-over might.
- Colour ceiling: flame emissive is deliberately held below neutral white — the hottest core rolls
  red → orange → yellow and never reaches G = 255. If a future change makes fire look "hotter" by
  raising green, it is wrong; make the *shape* carry the heat. Measured over the `hit_explode` fire
  region: `R=255 & G≥250` (a neutral pip) **0.001%**, red clip **0.33%**, `G=255` **0.000%**, max G
  where R>200 **251**. Source ratios that hold that: flame texture core `(255, 204, 110)`, tongue
  tint `(1, 0.56, 0.30)`, flame root `(1, 0.42, 0.16)`, fireball `(1, ≤0.47, ≤0.15)`.
- `hit_explode` is posed at `setImpactPhase(0.24)`, not 0.08. At 0.08 the fireball is still inside
  the plating it came out of and is half depth-culled by the hull; the ball cluster is also offset
  `0.45–1.0 R` along `out` for the same reason.
- `Cards.flush()` reads `window.innerHeight` and `devicePixelRatio` for its `minPx` conversion. If
  C6 ever renders to an offscreen target of a different size, that estimate is wrong and the floor
  will be applied at the wrong scale. It degrades gracefully (cards get slightly too big or too
  small), it does not break.
