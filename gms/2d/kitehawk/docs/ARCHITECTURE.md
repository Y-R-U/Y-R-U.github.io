# KITEHAWK — architecture contract

**This file is the contract. Build agents must not change it.** If you believe something here is
wrong, write the objection into `docs/HANDOFF.md` as an **OBJECTION** and work around it; do not
silently redesign. The manager reconciles.

Written 2026-08-23 by agent A during the planning phase. Everything about the Sunderfall renderer
in §2 was established by reading `gms/2d/sunderfall/game/js/gfx/*` and `core/*` line by line, not
from its documentation.

Vanilla ES modules. No build step, no bundler, no npm at runtime, nothing from a CDN. Served as
static files from `gms/2d/kitehawk/`.

---

## 1. The pitch, so everyone builds the same game

A painterly 2D biplane game in a WWI-that-never-was, where **altitude is the whole fight**. The
camera is side-on, the aircraft sits left-of-centre and the world scrolls past it, and the screen is
a **tall slice of a much taller column of sky**. The column is a six-rung ladder — shell-cratered
**Mud** and trench lines at the bottom, the flak **Belt**, the hazy **Floor**, the cloud **Deck**,
the zeppelin **Lane**, and the thin **Blue** with its low sun at the top — 1,500 m of it, ten
portrait screens tall. **You climb the ladder; you never see it all at once** (D27), and the
altitude tape is what shows you where you are on it. Far above the ceiling, permanently unreachable,
the Concord Line drifts at 4,000 m: it does not land and never looks down, and everything you own
came out of it. You climb to trade height for speed and speed for height; a dive is a decision, not a movement.
One thumb flies it — hold and slide anywhere on the lower screen to pitch, throttle is automatic,
guns auto-fire at anything inside the nose cone, and one tap fires the loaded special. Skill comes
out of the flight model (stall turns, Immelmanns, side-slips, energy management), never out of extra
buttons. **Supply crates falling under parachutes are the entire economy and the signature
mechanic** — catch them in the air, or shoot the silk so the crate falls to your airfield instead of
theirs. Five acts of twenty story missions, plus endless survival, pylon racing with ghosts, an
airlift mode that is crates alone, 1v1 duels against named aces, and a daily seeded challenge.
A hangar between missions spends crates on engine, wings, guns, armour, fuel, ammo and pilot traits.
**Portrait is primary and landscape is a first-class configuration, not a letterbox.** It has to
look stunning; where beauty and convenience conflict, beauty wins and the cost gets flagged.

---

## 2. Renderer decision — PORT Sunderfall's `gfx/`, with nine named changes

### 2.1 Verdict

**Port it.** I read all 2,004 lines of `sunderfall/game/js/gfx/` (renderer 575, postfx 304, texture
299, particles 189, lights 132, shaders 505) plus the seven `core/` modules we also need, a further
1,144 lines. The batcher is not "a sprite drawer we could rewrite in an afternoon" — it is a
layer-banded, chunked, instanced pipeline with a lighting buffer and a post chain whose *layer
response table is most of the art direction*. Rewriting it would cost a phase and lose the tuning.

Required changes are **nine** — five of mine plus four raised by agent C (R3/R4/R5a/R13) — and only
three of them touch a shader, none deeply. Estimated ~520 lines added or changed against ~3,150 lines
ported, plus one new module (`gfx/parts.js`, §2.6). Do the port.

### 2.2 What the code actually provides (verified by reading it)

- **`gfx/renderer.js` (575 lines)** — WebGL2, `alpha:false, depth:false, antialias:false,
  premultipliedAlpha:true`. Instance stride is 16 floats: `(x,y,w,h) (rot,parallax) (u0,v0,u1,v1)
  (r,g,b,a) (texSlot, UNUSED)`. Per `(layer, blend)` there is one quad stream and one triangle
  stream — 12 layers × 2 blends × 2 stream types = 48 streams, and any stream with `count === 0` is
  skipped entirely, so unused layers cost nothing.
- **Chunking.** `chunkFor()` keeps up to `MAX_TEX_PER_CHUNK = 8` textures live in the current chunk
  and selects between them with a per-instance index resolved by a `switch` in the fragment shader.
  A layer using ≤ 8 distinct textures is **one draw call regardless of sprite count**, and
  interleaving those 8 textures freely does not split the chunk. A 9th distinct texture opens a new
  chunk. This is why the measured frames are 9–15 draw calls.
- **Instance re-basing.** `pointQuadStream()` re-points the attribute pointers per chunk because
  `drawArraysInstanced` always starts at instance 0. Subtle and correct; do not "simplify" it.
- **Per-layer light response** — `defaultLayerConfig()` gives every layer `{shade, response, haze,
  mul, parallax}`. Distant layers take little light and a lot of haze so they read as air;
  `FG_OCCLUDE` gets `mul = [0.55,0.58,0.68]` so it crushes toward black. This table is the art
  direction in numbers and is the main thing a rewrite would throw away.
- **Colour handling.** The sprite FS does a cheap `c.rgb * c.rgb` sRGB→linear, sums light additively,
  and writes premultiplied. Lights square their colours on the way in (`lights.js: r*r*inten`), and
  the clear colour is squared in `end()`. Consistent; do not break it.
- **Culling.** `visible()` rejects per sprite before it is ever written to the stream, using the
  rotated-extent approximation. A 42,000-unit level costs nothing off-screen.
- **`gfx/lights.js` (132 lines)** — up to 256 additive lights into a half-resolution buffer, blurred
  twice. Per-light `radius, colour, intensity, flicker, squash, angle, parallax, soft`. The blur is
  the trick: an unblurred falloff quad reads as a decal, a blurred one reads as light in air.
- **`gfx/postfx.js` (304 lines)** — HDR target → 3-mip bloom → god rays → composite with exposure,
  saturation, contrast, shadow/highlight tint, vignette, grain, chromatic aberration, full-screen
  flash, and **four simultaneous world-space shockwave ring distortions**. It also owns trauma shake
  (quadratic decay, fbm noise) and `timeScale` hitstop, correctly on a *real-time* timer so it always
  recovers. `setRays(x, y, strength, decay, density)` does volumetric god rays from a world point —
  exactly the sun-through-a-cloud-deck shot this game is built around.
- **`gfx/particles.js` (189 lines)** — 20,000-particle SoA pool, swap-remove so the live set is
  `[0,count)` with no branching and **no allocation**. Supports gravity, drag, terrain collision with
  bounce, `alignVel` + `stretch` (velocity-aligned, speed-stretched quads), `fadeIn`, colour lerp
  over life, and `glow` which emits real lights under a stride-decimated budget.
- **`gfx/texture.js` (299 lines)** — texture handles `{tex,w,h,id,name}`, plus runtime-generated
  `white`, `blob`, `disc` and **`makeStreak(32,96)`**, a ready-made motion-streak texture.
- **`core/loop.js`** — fixed-step accumulator, `DT = 1/60`, `maxSteps = 5` with backlog drop,
  `timeScale` applied to the accumulator and never to `DT`, visibility-change reset.
- **`core/viewport.js`** — orientation detection, safe-area insets read through a hidden probe
  element (the only reliable way), `?dpr=` override for headless capture, iOS's stale-dimensions
  workaround after `orientationchange` (re-applies at +120 ms and +400 ms).
- **`core/input.js` (422 lines)** — the one that matters most for us. Actions are a **bitfield of
  sources**, so a released key cannot cancel a held gamepad button. `registerZone(id, rectFn, action,
  kind)` with `kind: 'stick'` gives **exactly the hold-and-slide stick this game needs**: the stick
  origin is set at the touch-down point, not at a fixed centre. It also carries three
  hard-won bug fixes we would otherwise rediscover — `lostpointercapture` routed to `onUp` (a lost
  touch-up permanently deadens an action, because `pressed` is a rising edge), `blur` zeroing every
  action, and `releaseAll()` on scene change.
- **Measured**: `HANDOFF.md:59` records 60 fps at 11,430 sprites + 9,980 live particles + 49 lights
  in **15 draw calls**, verified at 1440×900 and a true 390×844. `stats.drawCalls` counts content
  draws only; the post chain's ~18 fullscreen blits are not in that number.

### 2.3 What a biplane game needs that it does not have

| need | status | fix |
|---|---|---|
| Fit the world to **height**, not width | **Missing.** `scale = (pw / worldW) * zoom` in `begin()`, `view.scale = w / view.worldW` in the viewport. Width-fit gives a landscape phone a 23 px aircraft. | §2.4 change 1 |
| **Independent vertical parallax** | **Missing.** One scalar `parallax` multiplies `u_cam` on both axes: `px = (world - u_cam * i_rotPar.y) * u_scale`. A cloud deck at horizontal parallax 0.35 would also slide vertically at 0.35 and leave the altitude band it belongs to. **Altitude bands would lie about where they are.** | §2.4 change 2 — the critical one |
| Sky-column layer bands | Wrong set. The 12 layers are ground-platformer bands (`TERRAIN_BACK`, `FG_OCCLUDE`…). | §2.4 change 3 |
| **Huge parallax sky layers** | Partly there. `backdrop()` tiles horizontally with optional alternate-mirroring and anchors by `anchorY` at fixed `worldH`. It cannot stretch vertically to a band, has no vertical parallax, and there is no sky gradient primitive. | §2.4 change 4 |
| **Motion streaks / speed lines** | **Already solved.** `makeStreak()` + particles' `alignVel`/`stretch` do velocity-aligned stretched quads. No post-process radial blur needed, and it would be worse — a post blur smears the HUD and the enemy you are trying to read. Do not add one. |
| **Long thin trails** (smoke, tracer, prop wash) | Missing as a primitive; `R.line(x1,y1,x2,y2,thickness,col,layer,{tex})` already draws one textured segment. | §2.4 change 5 — `R.ribbon()`, a loop over `line`, no new shader |
| **Parachute canopy / silk** | Deformable cloth is not supported; the triangle stream is untextured. | Draw the canopy as a **6-segment strip of rotated sprite quads** sampling a canopy atlas. Same chunk, same draw call, deforms per segment, zero engine change. A textured-triangle stream (`R.mesh`) is **deferred**: if seams show at 2× zoom, agent E proposes it in HANDOFF and the manager decides. Do not build it speculatively. |
| Very tall portrait viewport | Works. Nothing in the pipeline assumes landscape; `pw`/`ph` are independent. |
| G-load greyout / redout | Already there as `fx.vignetteAmt` + `fx.saturation` + `fx.flash`. Wrap them in one `fx.gLoad(amount)` helper. No shader change. |
| Cloud-deck god rays | Already there — `fx.setRays()`. |

### 2.4 The nine changes, specified

**1 — fit-to-height.** Replace the single `worldW` with a fit mode.
- `core/viewport.js`: `view.fit = 'height'` always. `view.worldH = VIEW_PROFILE[mode].worldH`;
  `view.scale = h / view.worldH`; `view.worldW = w / view.scale`.
- `gfx/renderer.js`: `resize(w, h, dpr, worldH)` stores `worldH`; `begin()` computes
  `scale = (ph / worldH) * zoom`. `R.worldW` becomes a derived getter `pw / scale`.
- Everything downstream (`visible`, `screenOf`, `backdrop`) already works off `scale` and is unchanged.

**2 — `parallaxY` (do this before any art is authored).** Agent C reached this independently as
**R3** and specified the correct implementation: parallax is a **world-space camera offset**
(`camLayer = cam * pLayer`), never a screen-space scroll multiplier. The ported shader already does
it that way — `px = (world - u_cam * parallax) * u_scale` scales the *camera position*, then applies
zoom uniformly afterwards — so layers cannot slide against each other when the camera zooms. R3 is
therefore satisfied by construction; the only change is making the factor a `vec2`. **Do not
"optimise" this into a scroll offset applied after `u_scale`.** Instance float 15 is dead: the vertex
shader reads only `i_misc.x`, and the fragment shader declares no softness input at all. Repurpose it.
- `SPRITE_VS`: `vec2 px = (world - u_cam * vec2(i_rotPar.y, i_misc.y)) * u_scale;`
- `pushSprite(..., parallax, parallaxY)` writes `d[o+15] = parallaxY`. **Stride stays 16.** Zero cost.
- `TRI_VS`: `a_parallax` becomes `vec2`; `TRI_STRIDE` 7 → 8.
- `lights.js`: `STRIDE` 10 → 12, third attribute `vec2` → `vec4` = `(squash, angle, parallaxY, 0)`;
  `LIGHT_VS` applies it the same way.
- `visible()` must use `parallaxY` on the Y axis or tall bands get culled wrongly.
- Public API: every draw call takes `parallax` and `parallaxY`; `parallaxY` defaults to the layer
  config value, which defaults to `parallax`. Existing call sites keep working.

**3 — the layer table.** 12 → **14 layers**. The loop in `end()` is `for (l = 0; l < LAYER_COUNT)`,
so this is a table edit; empty streams are skipped, so the two extra layers are free.

```
0  SKY          gradient + sun disc + sun bleed
1  CLOUD_FAR    top cirrus, high haze
2  CLOUD_MID    the deck itself, back half
3  HORIZON      distant ridge line, smoke columns on the far horizon
4  GROUND_FAR   far terrain band
5  GROUND_MID   mid terrain, treelines, distant trenches
6  GROUND       the playable ground silhouette, wire, craters, buildings
7  ACTORS_BACK  aircraft and crates behind the player's plane in depth
8  TRAILS       smoke ribbons, prop wash, tracer streaks (mostly additive)
9  ACTORS       player, enemies, crates, parachutes, ground guns
10 FX           explosions, flak bursts, muzzle flash, debris
11 CLOUD_NEAR   foreground wisps that pass IN FRONT of the aircraft
12 FG_OCCLUDE   near ground/struts, crushed toward black
13 UI_WORLD     world-anchored HUD (threat pips, crate markers, damage numbers)
```

**Do not confuse render layers with altitude bands.** `CLOUD_FAR / CLOUD_MID / CLOUD_NEAR` are
**depth** layers — how far from the camera a sprite sits. `Mud / Belt / Floor / Deck / Lane / Blue`
(§3.3) are **altitude** bands — where in the world column a thing is. The Deck band is drawn using
all three cloud layers; a wisp in `CLOUD_NEAR` may belong to any band.

Starting layer config — agent A's numbers, agent C (art) may retune within them and must record the
change in HANDOFF:

| layer | shade | response | haze | parallax | parallaxY |
|---|---|---|---|---|---|
| SKY | 0.10 | 0.06 | 0.70 | 0.00 | 0.06 |
| CLOUD_FAR | 0.34 | 0.18 | 0.52 | 0.06 | 0.30 |
| CLOUD_MID | 0.58 | 0.34 | 0.38 | 0.22 | 0.78 |
| HORIZON | 0.55 | 0.22 | 0.48 | 0.10 | 0.14 |
| GROUND_FAR | 0.72 | 0.34 | 0.32 | 0.26 | 0.55 |
| GROUND_MID | 0.88 | 0.62 | 0.16 | 0.58 | 0.82 |
| GROUND | 1.00 | 0.95 | 0.04 | 1.00 | 1.00 |
| ACTORS_BACK | 1.00 | 0.95 | 0.06 | 0.94 | 0.94 |
| TRAILS | 0.30 | 0.90 | 0.00 | 1.00 | 1.00 |
| ACTORS | 1.00 | 1.10 | 0.00 | 1.00 | 1.00 |
| FX | 0.18 | 1.00 | 0.00 | 1.00 | 1.00 |
| CLOUD_NEAR | 0.44 | 0.30 | 0.10 | 1.35 | 1.15 |
| FG_OCCLUDE | 1.00 | 0.22 | 0.00 (mul 0.55,0.58,0.68) | 1.55 | 1.25 |
| UI_WORLD | 0.00 | 0.00 | 0.00 | 1.00 | 1.00 |

Note `parallaxY` > `parallax` for cloud and ground bands. That asymmetry is the whole point: bands
must barely slide sideways (they are far away) but must track altitude almost exactly (or the
altitude they claim to occupy is a lie).

**4 — sky bands and gradients.**
- `R.skyBand(band, opts)` — a `backdrop()` variant that tiles horizontally, **stretches vertically to
  `[band.y0, band.y1]`**, and honours `parallaxX`/`parallaxY` separately. ~35 lines, reuses
  `pushSprite`.
- `R.gradient(y0, y1, colTop, colBottom, layer, opts)` — two triangles on the existing tri stream
  with per-vertex colour. `R.tri()` already does per-vertex colour, so this is ~12 lines and no
  shader work. Local fills only — **the sky itself is `R.skyRamp()` (change 8)**.
- `backdrop()` stays as-is for the ground bands, mirroring included. Keep the comment warning that
  `mirror` on anything with a silhouette produces a Rorschach axis — it applies to treelines here too.

**6 — the ramp-map sampler (agent C, R4).** One `sampler2D u_ramp` on **texture unit 9**, one
`u_rampAmt` uniform, one extra fetch in `SPRITE_FS` and `TRI_FS`. A per-act 256×1 LUT gradient-maps
neutral-lit art, which is what lets one cloud atlas and one terrain atlas serve all five acts.
**Order matters and is fixed:** sRGB→linear, then `u_mul`, then the ramp, then haze, then lighting.

```glsl
vec3 lin = c.rgb * c.rgb * u_mul;
if (u_rampAmt > 0.0) {
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  lin = mix(lin, texture(u_ramp, vec2(clamp(l, 0.0, 1.0), 0.5)).rgb, u_rampAmt);
}
lin = mix(lin, u_haze, u_hazeAmt);
```

Ramping *after* lighting would re-map additive light and break every glow in the game. `rampAmt` is
per-layer (in the layer config) so actors can opt out while backdrops opt in.
API: `R.setRamp(tex)`, and `rampAmt` in `R.setLayer()`.

**7 — screen-space paper grain over the actor layers (agent C, R5a).** One `sampler2D u_grain` on
**texture unit 10** plus `u_grainScale`/`u_grainAmt`, sampled by `gl_FragCoord.xy * u_grainScale`.
Screen space, not world space — a grain that tracks the world swims and reads as dirt on the lens.
Per-layer `grainAmt`, so the same tooth sits over every actor and every FX at the same density,
which is the thing that stops procedurally-drawn actors reading as vector art pasted onto a painting.

**8 — `R.skyRamp(y0, y1, rampTex, layer, opts)` (agent C, R13).** The sky gradient is one quad
spanning the **whole column in world space** (`y0 = +200` to `y1 = -1700`), with its `v` coordinate
mapped to world Y and sampled from the per-act ramp LUT. Because the interpolant is a vertex
attribute, the ramp is evaluated **per fragment from world Y** — which is C's R13 requirement, and
it is zoom-proof for free. **The forbidden alternative is computing the gradient once per frame from
camera Y**: that flattens the sky the moment the camera zooms out, and C flags it as the likeliest
zoom bug in the project. `R.gradient()` (change 4) stays for local two-stop fills and must not be
used for the sky.

**9 — `R.ribbon(points, widths, col, layer, opts)`** — a polyline of textured quads for smoke trails,
prop wash and tracer. Implemented as a loop over the existing `line()` path with a per-segment width
taper and alpha taper; no new stream, no new shader, batches into the same chunk. ~45 lines.

### 2.5 `gfx/parts.js` — the actor part-tree (agent C, R5b–d and R6)

**New module, not a port. It lands in the first engine commit, not as a retrofit.** Agent C names the
painted-world / code-actor seam as the single biggest risk to "stunning", and every one of these is
cheap up front and expensive to bolt on afterwards.

An actor is a tree of parts; each part is a convex polygon with a pivot, a parent, a 2D surface
normal and a tone triple. `drawRig` walks the tree and emits **per-vertex-coloured triangles on the
existing tri stream** — no new stream, no new shader.

```js
const rig = createRig(def);              // def from data or code; parts hash to stable ids
rig.setAngle(partId, radians);           // prop, control surfaces, pilot head, canopy panels
rig.pose(name, t);                       // named pose, t = 0..1
R.drawRig(rig, x, y, rot, scale, lights, layer, opts);
```

Four features, all in this module, all required in the first commit:

1. **Three-tone shading per part.** A part is filled in `lit / mid / shadow` chosen from
   `dot(partNormal, lightDir)` against the supplied light list, with the terminator hard, not
   smooth. Three flat tones is what makes it read as painted; a smooth ramp makes it read as 3D.
2. **Stable per-part vertex jitter.** Every vertex is offset by a **deterministic** hash of
   `(partId, vertexIndex)` — a fixed wobble, computed once at rig build. No edge in the game is
   machine-straight. It must be stable: jitter re-rolled per frame crawls, and crawling is worse
   than straight.
3. **A hand-loaded darker edge on the shadow side only.** One thickened dark stroke along the edges
   whose normal faces away from the light. Not an outline — an outline all the way round is a
   cartoon; a loaded edge on one side only is a brush.
4. **The shared screen-space paper grain** (change 7) sits over the result, which is what glues code
   actors to painted backdrops.

Ownership: agent **E** builds `gfx/parts.js`; agent **R** authors rig definitions and draws through
it. Neither edits the other's file.

### 2.6 Port list, file by file

Copy **out of** `gms/2d/sunderfall/game/js/` **into** `gms/2d/kitehawk/js/`. Copying *into*
Sunderfall is forbidden by its own contract; copying out is explicitly allowed by the manager brief.
Strip every Sunderfall-specific identifier on the way through — no `sunderfall` string survives.

| source | dest | verbatim? |
|---|---|---|
| `gfx/shaders/gl.js` | `gfx/shaders/gl.js` | verbatim |
| `gfx/shaders/sprite.js` | `gfx/shaders/sprite.js` | **changes 2, 6, 7** (parallaxY; ramp LUT on unit 9; screen-space grain on unit 10) |
| `gfx/shaders/light.js` | `gfx/shaders/light.js` | **change 2** (parallaxY) |
| `gfx/shaders/post.js` | `gfx/shaders/post.js` | verbatim |
| `gfx/renderer.js` | `gfx/renderer.js` | changes 1–9; keep chunking, culling, re-basing, colour handling untouched |
| — | `gfx/parts.js` | **new** (§2.5) |
| `gfx/lights.js` | `gfx/lights.js` | **change 2** only |
| `gfx/postfx.js` | `gfx/postfx.js` | verbatim + `fx.gLoad(amount)` helper |
| `gfx/particles.js` | `gfx/particles.js` | verbatim; `CAP` 20000 → 12000, `glowBudget` 40 → 24 |
| `gfx/texture.js` | `gfx/texture.js` | verbatim |
| `core/math.js` | `core/math.js` | verbatim |
| `core/events.js` | `core/events.js` | verbatim |
| `core/rng.js` | `core/rng.js` | verbatim — `fork()` and `hashSeed()` are load-bearing for daily seeds |
| `core/loop.js` | `core/loop.js` | verbatim |
| `core/viewport.js` | `core/viewport.js` | **change 1**, plus the `VIEW_PROFILE` table (§4) |
| `core/input.js` | `core/input.js` | new `ACTIONS` list, kitehawk keymap, `onDoubleTap`/`onFlick` added; keep the stick path, the bitfield, and **all three pointer bug fixes** |
| `core/debug.js` | `core/debug.js` | verbatim, it is a free overlay |
| `core/progress.js` | `core/save.js` | shape only; the data model is ours (§7.3) |
| `core/audio.js` + `core/audio/*` | — | **do not port.** 12 modules of synthesised DSP for a different game. Write the thin facade in §6.8 instead. Re-porting the DSP bank is a later option, decided by the manager, never by a build agent. |
| `tools/shot.mjs` | `tools/cdp.mjs` + `tools/shot.mjs` | port the CDP client; keep both headless gotchas (§8.2) |

**Nothing else comes across.** No `sim/`, no `spells/`, no `ui/`, no `enemies/`, no `intro/` — those
are Sunderfall's game, not its engine.

**Sanity checks the porting agent must run before declaring the port done** (these are gates, see §8):
a boot page that draws 5,000 sprites across 8 layers in ≤ 12 draw calls; a parallax page that proves
a band with `parallax 0.2 / parallaxY 0.9` stays glued to its altitude while the camera pans both
axes; and a 390×844 portrait capture through the CDP harness.

---

## 3. Coordinates, units, timing

### 3.0 THE SCALE RULE — read this before writing any constant

**1 world unit = 0.15 m.** (DECISIONS **D26**.)

> **Flight constants are authored in SI and DERIVED into world units, never the reverse.**

That rule exists because this document previously did the reverse. A `1 wu = 8 ft` figure was chosen
to make the altitude column read as a tidy 12,000 ft, and it silently made this document's own stall
speed 268 m/s and its Vne 1512 m/s. Three of the four planning documents independently agreed at
~0.15 m/wu; only the column figure dissented, and the physics won.

Every table in §3.4 therefore has an **SI column first** and a wu column derived from it. If you need
a new constant, write the metres, the m/s or the m/s² down, divide by 0.15, and put both in the
table. Never tune the wu number and back-fill the SI.

```
wu   = metres / 0.15          metres = wu * 0.15
wu/s = (m/s)  / 0.15          wu/s²  = (m/s²) / 0.15
feet = wu * 0.15 * 3.28084    (display only — the altimeter, §3.3)
```

Two deliberate deviations from 1917 reality, both named, both with a factor, so nobody re-derives
them as bugs:

| | factor | what it means |
|---|---|---|
| **K = 1.6** hull scale | the aircraft is *drawn* 1.6× oversize | a 6.0 m fuselage renders as 9.6 m of world |
| **A = 2.8** agility factor | manoeuvre and climb rates are 2.8× a real 1917 airframe | apparent load factors are ~2.8× real, so the g-meter reads **airframe stress**, not physical g (§3.4) |
| altitude | **1 : 1, no compression** | this is new. Under the corrected scale the column is real metres. It is no longer a fiction and must not be described as one |

### 3.1 Axes and timing

- **+Y is DOWN.** Say it out loud before you write gravity or a climb. Gravity is **positive**.
  The ground is `y = 0`. **Altitude is `-y`.** A plane at `y = -6000` is at 900 m. Climbing
  *decreases* y. Sliding the thumb *up* gives `axisY < 0`, which commands nose-up, which rotates the
  aircraft's heading vector toward `-Y`.
- Aircraft heading is a single angle `a` in radians, `0` = flying screen-right (+X), increasing
  **clockwise on screen** (`atan2(vy, vx)` with +Y down). `a = -π/2` is straight up.
- **Fixed 60 Hz sim: `DT = 1/60`.** `update(dt)` always receives exactly `DT`. Never read
  `performance.now()`, `Date.now()` or `Math.random()` inside `update`. Rendering is uncapped and
  interpolates with `render(alpha, dtReal)`.
- **All speeds are units per second.** All rates are per second. Never per frame.

### 3.2 Reference view sizes

Both orientations **fit to height**. This is the single decision that makes the pivot cheap: the
aircraft is the same physical size on screen in both, and only the amount of *air around it* changes.

| | portrait | landscape |
|---|---|---|
| reference device | 390 × 844 css (iPhone 12/13/14 class, 9:19.5) | 1440 × 810 css desktop, **and** 844 × 390 css phone |
| `worldH` (visible sky, zoom 1) | **1000 wu = 150 m** | **560 wu = 84 m** |
| `scale` at reference | 0.844 css px / wu | 1.446 (desktop) / 0.696 (phone) |
| `worldW` (derived) | **462 wu = 69.3 m** | 995 wu = 149 m (desktop) / 1212 wu = 182 m (phone) |

`worldH` is a mode constant, `worldW` is derived. Portrait shows **1.79× the vertical air** of
landscape at the same aircraft size — 150 m of sky against 84 m. That ratio is the design thesis in
one figure, and it is scale-free, so the D26 correction did not touch it.

Every figure here is at **zoom 1.00**, combat framing. The camera zooms continuously between 0.78
and 1.22 (§4.3), so portrait's visible extent ranges from 820×379 wu (123×57 m) to 1282×592 wu
(192×89 m). All world-space quantities in §3.4 and §6 are zoom-invariant by rule (§4.3.5).

### 3.3 The altitude column

**Six bands. The names are ratified (D19) and are used verbatim in DESIGN, ART and STORY** — forty-odd
written briefings and every radio line depend on them. Do not rename or re-order them.
**Agent B owns the exact edge altitudes**; the table below is A's provisional cut, satisfying the
constraints listed under it. B may move any edge that keeps those constraints true.

**Playable ceiling: 1,500 m = 10,000 wu (D28).**

| band | altitude | y range (wu) | wu | altimeter | what it is |
|---|---|---|---|---|---|
| **Mud** | 0 – 50 m | 0 → -333 | 333 | 0 – 164 ft | craters, wire, trenches, airfields, AA nests |
| **Belt** | 50 – 250 m | -333 → -1667 | 1334 | 164 – 820 ft | the flak belt, balloons |
| **Floor** | 250 – 450 m | -1667 → -3000 | 1333 | 820 – 1,476 ft | hazy underside beneath the deck |
| **Deck** | 450 – 750 m | -3000 → -5000 | 2000 | 1,476 – 2,461 ft | the cloud deck proper |
| **Lane** | 750 – 1150 m | -5000 → -7667 | 2667 | 2,461 – 3,773 ft | the zeppelin lane |
| **Blue** | 1150 – 1500 m | -7667 → -10000 | 2333 | 3,773 – 4,921 ft | thin air and the sun |
| *(the Concord Line)* | *4,000 m* | *-26,667* | — | *13,123 ft* | **permanently unreachable (D28).** Never flyable, never touchable. You only ever get what it drops |

Constraints B must keep:

1. **No band thinner than 700 wu (105 m)** — at the 90 wu/s climb rate a thinner band is crossed in
   under 8 s and cannot read as a place.
2. **The three lowest bands must sum to ≤ 3,000 wu (450 m)**, so the establishing crane (§4.4 P4)
   crosses three bands in ≤ 4 s.
3. **Deck thickness ≥ 1,300 wu (195 m)** — a vertical transit of the cloud must take ≥ 14 s.
4. Total must equal 10,000 wu. The Concord Line is *outside* the playable column and is not a band.

**The altimeter reads feet, derived from SI** — `ft = -y × 0.15 × 3.28084`. Period flavour on a
correct number. The playable ceiling reads **4,921 ft**; the Concord Line, which the player can see
but never reach, reads **13,123 ft**. That gap is the point, and it is now mechanical fact rather
than characterisation.

Consequences, and they are the whole orientation argument:

- The column is **10 portrait screens tall** at zoom 1. You see ~10% of it at a time. This is the
  single biggest change the D26 correction made: the ladder is a **journey**, not a composition
  (D27), and every gate criterion about bands has been rewritten accordingly.
- **A full climb from ground to ceiling takes 107 s** at best climb rate. Altitude is a commitment,
  not a movement.
- **But a zoom climb from Vne to stall buys 427 m — 2,847 wu, nearly two whole bands — in about
  9 s.** `Δh = (v₁² - v₂²) / 2g = (93² - 16.5²) / 19.62 = 427 m`. That is real physics falling out
  of the corrected scale, and it is what makes energy tactical instead of a grind. It is the single
  most valuable thing the D26 correction handed us.
- Portrait at zoom 1 shows 1000 wu = 150 m: **one band and part of a neighbour**, typically two.
- Landscape phone at zoom 1 shows 560 wu = 84 m: **usually one band only.** Portrait sees the
  boundary you are climbing through; landscape phone frequently does not. That is the band argument,
  restated honestly at the corrected scale.

### 3.4 Aircraft size and the flight envelope

Sizes. `K = 1.6` is already applied to the wu column.

| | SI (authored) | wu (derived) | why |
|---|---|---|---|
| player hull length | 9.6 m (6.0 m × K) | **64 wu** | 54 css px portrait, 44.6 landscape phone, 92.6 landscape desktop — all above the 34 px silhouette floor (§4.4 P3) |
| player hull height | 5.1 m | 34 wu | |
| enemy scout / fighter | 9.0 – 10.5 m | **60 – 70 wu, never below 60** | 60 wu reads at 39.5 css px even at the zoom floor 0.78; below 54 wu the portrait gate's P3 fails outright |
| zeppelin | 210 × 39 m | 1400 × 260 wu | a real L30 was 198 m. **No longer heroic — this is life size.** It is 3 portrait screen-widths long and cannot be seen whole; only its engaged section (≤ 320 wu = 48 m) ever enters the framing box (§4.3.1) |
| crate | 3.9 × 3.3 m | 26 × 22 wu | |
| crate canopy | 12.6 m span | 84 wu, 6 strip segments | a real cargo chute is ~10 m |

Speeds. Authored in SI against a Sopwith Camel, run ~10–15% hot for arcade feel.

| speed | SI (authored) | wu/s (derived) | note |
|---|---|---|---|
| stall | 16.5 m/s (59 km/h) | 110 | below this the wing lets go |
| best climb speed | 31.5 m/s (113 km/h) | 210 | |
| corner (best turn) | 45 m/s (162 km/h) | 300 | |
| cruise | 48 m/s (173 km/h) | 320 | 5 hull-lengths per second |
| full throttle, level | 60 m/s (216 km/h) | 400 | |
| dive, nominal terminal | 84 m/s (302 km/h) | 560 | |
| **Vne** (hard cap, structural) | 93 m/s (335 km/h) | 620 | above 590 wu/s the airframe takes damage |
| best climb **rate** | 13.5 m/s (A × 4.8) | 90 | ground to ceiling in **107 s** |
| crate canopy descent | 17 m/s | 113 | 1,500 m of reachable sky in **88 s** — this is D28's "~90 s" |
| crate free-fall (no canopy) | 50 m/s | 333 | |
| AI **committed-dive** speed cap | 70 m/s (252 km/h) | **467** | a design constant, not a gate fudge — see §4.4 P2. The cost is that a bounce is less lethal than a real Albatros dive, and that is accepted |

Rates and constants. **Note that gravity and drag were both wrong in the pre-D26 draft, by 9.5×.**

| rate | SI (authored) | wu (derived) |
|---|---|---|
| gravity | 9.81 m/s² | **65.4 wu/s²** *(was 620 — wrong by 9.5×)* |
| quadratic drag `k` | 1.390 × 10⁻³ /m | **2.085 × 10⁻⁴ /wu** *(was 1.98 × 10⁻³ — wrong)* |
| max commanded pitch rate | **126 °/s at ≤ 45 m/s**, falling to **67 °/s at Vne** | same (angles are scale-free) |
| structural stress limit | 1.00 stress unit | greyout 0.72 held > 1.2 s; blackout 0.88 held > 0.8 s |

Verify the drag constant against the terminal speed rather than trusting it: `v_term = √(g/k)`, so
`√(9.81 / 1.390e-3) = 84.0 m/s` ✓ and `√(65.4 / 2.085e-4) = 560 wu/s` ✓. If those two disagree, the
scale conversion is broken, not the physics.

**The g-meter reads airframe stress, not physical g.** With `A = 2.8`, a sustained corner-speed turn
pulls `a = v·ω = 45 × 2.199 = 98.9 m/s² ≈ 10.1 physical g`, which no 1917 pilot survives. Normalising
to a 1.00 stress unit at that turn keeps the greyout/blackout mechanic honest without the HUD
printing a number that is a lie. Print "STRESS", never "G".

### 3.5 Turn geometry — the numbers the portrait gate is built on

Derived in SI, then converted. A real Camel turns 360° in ~8 s at 45 m/s (`ω = 0.785 rad/s`,
`r = 57.3 m`). With `A = 2.8`:

- **Combat turn at corner speed.** `ω = 2.8 × 0.785 = 2.199 rad/s = 126 °/s`;
  `r = 45 / 2.199 = 20.5 m = 136 wu`; **diameter 273 wu = 41 m**; full 360° in **2.86 s**.
  - Portrait at zoom 1: 273/462 = **59% of the width** ✓, 27% of the height.
  - Landscape phone at zoom 1: 273/560 = **49% of the height** ✓.
  - Both fit. `A = 2.8` was chosen for exactly this: at `A = 3.0` the circle is 254 wu and at the
    real-airframe `A = 1.0` it is **764 wu**, 165% of portrait's width. An unmodified 1917 turn
    circle does not fit any phone in any orientation, which is why the factor has to exist and has
    to be written down.
- **Dive recovery from Vne.** Pitch rate 67 °/s at 93 m/s gives `r = 79 m`; a half-loop pull-out
  consumes **158 m vertically = 1,053 wu**, and 79 m = 527 wu horizontally.
  - Portrait at zoom 1: 1053/1000 = **105% of the height** — it does *not* fit at combat framing,
    and the camera must reach **zoom ≤ 0.855** to contain it. That is comfortably inside the auto
    clamp `[0.78, 1.22]`.
  - Landscape (phone or desktop): needs **zoom ≤ 0.478**, which is **outside** the clamp. Landscape
    cannot contain a full-speed dive recovery at any zoom the controller is allowed to reach.

**The pre-D26 draft reached this same conclusion from a wrong number** (748 wu vs the correct
1,053 wu). The conclusion survived the correction because it turns on a ratio, not on the scale:
the pull-out is a manoeuvre in the vertical plane, and portrait is the orientation with a vertical
plane in it. The correction made it *sharper* — portrait now needs to zoom out to hold the manoeuvre
too, it just has the room to do it and landscape does not.

---

## 4. Orientation strategy — and the portrait gate

This is the highest-risk decision in the project. It is handled by making orientation a **data
selection**, never a code branch, and by settling it with numbers at the end of the flight phase.

### 4.1 One profile table, one camera policy, one HUD grid

Everything mode-dependent lives in exactly one exported table, `core/viewprofile.js`. Pivoting to
landscape-primary means changing which profile the tuning targets — not moving code.

```js
export const VIEW_PROFILE = {
  portrait: {
    worldH: 1000,               // world units visible vertically at zoom 1.00
    anchorX: 0.34,              // aircraft sits 34% from the left edge
    anchorY: 0.62,              // 62% down: 620 wu (93 m) of sky above, 380 wu below
    anchorYClimb: 0.78,         // eased to when climbing faster than 30 wu/s
    anchorYDive: 0.30,
    anchorYThreatAbove: 0.75,   // a committed diving attacker forces this (§4.4 P2)
    leadSeconds: 0.55, leadMax: 240,

    // --- zoom anchors. 1.00 = combat framing. Below 1.00 shows MORE world.
    zoomCombat:    1.00,        // the reference. visible 1000 x 462 wu = 150 x 69 m
    zoomIntimate:  1.22,        // alone, slow, landing, story beat. 820 x 379 wu = 123 x 57 m
    zoomWide:      0.78,        // HARD auto floor. 1282 x 592 wu = 192 x 89 m
    zoomEstablish: 0.62,        // CINEMATIC ONLY, outside the auto clamp (§4.3.4)
    zoomFill: 0.85,             // the framing box may fill at most 85% of the frame

    // --- slew, asymmetric. units of zoom per second.
    zoomOutRate: 1.10,          // 1.22 -> 0.78 in 0.40 s
    zoomInRate:  0.22,          // 0.78 -> 1.22 in 2.00 s
    zoomOutK: 9.0, zoomInK: 1.8, // exponential approach constants, 1/s

    // --- hysteresis
    zoomInMargin: 1.18,         // only tighten if the frame is 18% roomier than needed
    zoomInDwell:  0.90,         // ...and has been for this long, continuously
    zoomDeadband: 0.02,         // ignore smaller corrections entirely
    zoomLockRange: 1400,        // 210 m. never tighten past zoomCombat*1.05 with a hostile this
                                //   near, and a hostile inside it is trackable (§4.4 P2)

    hud: 'portrait',
    stickZone:   { x: 0.00, y: 0.45, w: 1.00, h: 0.55 },
    specialSlot: { x: 0.72, y: 0.30, w: 0.24, h: 0.12 },
    altTape:     { side: 'left',  w: 34 },
    radioCard:   { x: 0.00, y: 0.06, w: 1.00, h: 0.14 },   // top third, non-blocking
  },
  landscape: {
    worldH: 560,
    anchorX: 0.30, anchorY: 0.55, anchorYClimb: 0.70, anchorYDive: 0.34,
    anchorYThreatAbove: 0.66,
    leadSeconds: 0.70, leadMax: 420,

    zoomCombat: 1.00, zoomIntimate: 1.22, zoomWide: 0.78, zoomEstablish: 0.42,
    zoomFill: 0.85,
    zoomOutRate: 1.10, zoomInRate: 0.22, zoomOutK: 9.0, zoomInK: 1.8,
    zoomInMargin: 1.18, zoomInDwell: 0.90, zoomDeadband: 0.02, zoomLockRange: 1400,

    hud: 'landscape',
    stickZone:   { x: 0.00, y: 0.30, w: 0.46, h: 0.70 },   // handedness-mirrored
    specialSlot: { x: 0.82, y: 0.62, w: 0.14, h: 0.22 },
    altTape:     { side: 'right', w: 30 },
    radioCard:   { x: 0.02, y: 0.06, w: 0.42, h: 0.16 },   // top-left, non-blocking
  },
};

// Persistent user preference (save.settings.zoomBias). NOT a per-moment control.
export const ZOOM_BIAS = { tight: +0.10, normal: 0.00, wide: -0.08 };
```

The auto clamp is **[zoomWide, zoomIntimate] = [0.78, 1.22], a span of 1.56×** — D18's "~1.6× span"
survives intact; only the anchor moved, from D18's 0.8–1.3 to a range centred on combat framing at
1.00. That re-anchoring is the change the manager adopted: it makes "1.0" mean something (the frame
the flight model was tuned in) instead of an arbitrary midpoint.

- **Camera** (`core/camera.js`) reads only this table plus the sim. No widget, no system and no
  content file may read `view.mode` directly. One place. If you need a mode branch elsewhere, you
  need a new profile field — add it here and say so in HANDOFF.
- **HUD** (`ui/layout.js`) lays out into **named slots** resolved from the profile, in normalised
  units, with safe-area insets applied. A HUD widget that contains a literal pixel offset is a bug.
- **Input zones** are `rectFn` closures reading `view` — Sunderfall's design already — so rotation
  re-derives them for free.
- **Rotation must not disturb the sim.** On `view:change`, the camera and HUD relayout, the sim is
  untouched. Required test (gate): rotate 20× during a flight in the CDP harness and assert the sim
  tick counter is continuous, no entity position changed on the rotation frame, and no input latched.

### 4.2 Two mitigations that must exist BEFORE the gate is run

Running the gate against a stripped portrait build would be testing a strawman.

1. **Altitude tape** — a compressed vertical strip (34 px, left in portrait) showing the whole
   **10,000 wu (1,500 m)** column, all six bands with their signature icon and their ratified name,
   the player's position in it, the Concord Line drawn above the top of the playable column and
   visibly out of reach, and **pips for threats and crates that are off-screen vertically**.
   Under D26/D28 the column is ten portrait screens tall, so the tape is no longer a convenience —
   **it is the only thing that shows the ladder at all**, and gate P2 depends on it giving warning
   of a diving attacker before that attacker can enter the frame.
2. **Edge threat chevrons** — screen-edge arrows for attackers outside the viewport horizontally,
   scaled by distance and coloured by closure rate. This is the answer to portrait's 462 wu width.

### 4.3 Dynamic camera zoom (DECISIONS D18)

Zoom is **automatic**, framing-driven, continuous, and it **never touches the simulation**.

#### 4.3.1 What drives it — the framing box

Every tick the camera builds one AABB in world space, the **framing box**, and picks the zoom that
contains it. There are no discrete camera modes; `zoomIntimate`, `zoomCombat` and `zoomWide` are
**anchors the solved zoom lands between**, not states it switches into.

Members of the box, nearest-first, **capped at 8** so one messy furball cannot drag the zoom to the
floor and hold it there:

| member | included when | padding |
|---|---|---|
| the player | always | 1.4 hull lengths every side |
| the player's lead point | always | `pos + vel × 0.5 s` |
| a hostile | within `zoomLockRange` (1400 wu = 210 m) **and** (has line of fire, or closes at > 120 wu/s) | 1.0 hull length |
| a crate | contested — any hostile within 700 wu (105 m) of it | 1.0 canopy span |
| a boss | always, but **only its engaged section** (gondola, nacelle, fin), never the whole hull | 1.0 section |
| a scripted point | while a framing override is live (§4.3.4) | as given |

**A zeppelin is 1400 wu — 210 m, life size — and never fits at any zoom in range. That is
deliberate.** If a build
agent puts the whole boss AABB in the framing box, the solver pins to the floor for the entire fight
and the game reads as a map. Bosses contribute their engaged section, ≤ 320 wu (48 m), and nothing else.

Solve:

```
needW = boxW / zoomFill        needH = boxH / zoomFill        (zoomFill = 0.85)
zoomNeeded = min( worldW_at_1 / needW , worldH_at_1 / needH )     // worldW_at_1 = 462, worldH_at_1 = 1000
target = clamp( zoomNeeded + ZOOM_BIAS[settings.zoomBias], zoomWide, zoomIntimate )
```

`zoomNeeded` rises when the fight is small and quiet (alone, slow, landing → the box is just the
player, so the solver asks for a tight frame and the painted art is the reward) and falls when a
threat is about to leave frame, closing speed is high, or a crate is contested. That is D18's
"framing-driven, not speed-driven" expressed as one number rather than a list of cases.

#### 4.3.2 Slew — asymmetric, with hysteresis

```
if (target < zoom)                      // OUT: immediate, no dwell, no margin.
    zoom += (target - zoom) * min(1, zoomOutK * dt)      // never let a threat leave frame
    clamp the step to zoomOutRate * dt                   // 1.10 /s -> full sweep in 0.40 s
else                                    // IN: earn it.
    require target > zoom * zoomInMargin (1.18)
    AND that condition held continuously for zoomInDwell (0.90 s)
    AND no hostile within zoomLockRange, else cap target at zoomCombat * 1.05
    then zoom += (target - zoom) * min(1, zoomInK * dt), step clamped to zoomInRate * dt (0.22 /s)
if (abs(target - zoom) < zoomDeadband) do nothing        // 0.02 — kills the pump
```

Out is **5× faster than in** (1.10 vs 0.22 zoom-units/s). The dwell timer resets to zero on any
zoom-out, so a threat oscillating at the frame edge produces one zoom-out and then silence, not a
pump. The deadband is what stops a threat sitting exactly on the boundary from dithering the frame.

#### 4.3.3 The user preference

`save.settings.zoomBias ∈ {'tight','normal','wide'}`, offsets `{+0.10, 0.00, -0.08}` added to the
solver's target **before** the clamp. It is a persistent options setting, not a control — a zoom
button would be a second input in a one-thumb game (§6.4) and a manual zoom becomes a mandatory
skill, which is what "easy to play" forbids. **The clamp is absolute: no preference may push the
auto zoom below `zoomWide`.** A "wide" player simply spends more time sitting on the floor. This is
deliberate — it means §4.4's legibility criterion only ever has to be evaluated at one number.

#### 4.3.4 Framing overrides for story beats and landings

```js
cam.requestFraming(tag, { zoom, box, seconds, ease, priority, allowOutsideClamp });
cam.releaseFraming(tag);
```

- `priority: 'beat'` — a story beat, a landing, a crate hand-off. Blends over the solver but is
  **still clamped to [zoomWide, zoomIntimate]**. The player may still have control.
- `priority: 'cinematic'` — level open, boss reveal, debrief. May set `allowOutsideClamp: true` and
  reach `zoomEstablish` (0.62 portrait), which is where all five altitude bands are legible at once.
- **Enforcement, not etiquette:** the camera ignores `allowOutsideClamp` and logs a warning whenever
  the player has combat control. A cinematic framing that escapes the clamp while the player can fly
  is exactly how a "camera decision" turns into a difficulty change, so it is refused in code rather
  than forbidden in prose.

#### 4.3.5 Zoom changes the view only, never the sim

The auto-fire cone (±11°, **440 wu = 66 m**), every weapon range, turn rates, AI awareness radii, spawn
distances and collision are **world units and are identical at every zoom**. Nothing under `js/sim/`
may import `core/camera.js` or read `cam.zoom`; `gates_purity.mjs` asserts it by grep, and
`gates_zoom_neutral.mjs` asserts it by behaviour — the same seeded mission run at forced zoom 0.78
and 1.22 (`?zoom=`) must produce **bit-identical run summaries** (§8.1). If it does not, zoom has
become a silent difficulty modifier and the build is broken. See §10 rule 16.

The gun range is 440 wu for one derived reason: **no hostile weapon may outrange the visible width
at `zoomCombat` (462 wu)**, or you are shot by something that was never on screen at the frame the
flight model was tuned in. 440 is 95% of 462. Under the D26 scale that lands at **66 m**, which is
squarely inside the 50–100 m at which WWI guns were actually effective — the constraint and the
period agree, which they did not under the pre-D26 scale (1,073 m, absurd).

---

### 4.4 THE PORTRAIT GATE

Evaluated at the **end of the flight-model phase**, before any content agent starts on the 100
levels. Run by the manager as `tools/gates_portrait.mjs`, producing one gate record (§8.3).
Measurements are taken at **390×844 css, dpr 2** in the CDP harness and in `tools/sim.mjs`.
Both mitigations in §4.2 must be live. **Any single FAIL means we pivot to landscape-primary.**

#### 4.4.1 The tension, named

In a 2D orthographic side view there is no perspective, so **on-screen silhouette size is a function
of zoom alone** — an enemy 900 wu away is the same number of pixels as one 90 wu away. That makes
the gate unusually clean, and it makes the conflict unavoidable. Three constraints, one variable:

| constraint | inequality | binds at |
|---|---|---|
| **Legibility** wants zoom HIGH | `zoom ≥ 34 / (minHull × 0.844)` | **z ≥ 0.671** at a 60 wu hull |
| **Turn containment** (width) | `zoom ≤ 0.62 × 462 / 273` | z ≤ 1.049 — never binding |
| **Dive-recovery containment** (height) | `zoom ≤ 0.90 × 1000 / 1053` | **z ≤ 0.855** |
| **Framing-box containment** (width) | `zoom ≤ 0.85 × 462 / boxW` | see the table below |

**Answering the manager's outstanding question: yes, P1 and P3 hold at a single zoom.** Ignoring the
framing box, the simultaneous window is **[0.671, 0.855]**, 0.184 wide; intersected with the auto
clamp `[0.78, 1.22]` it is **[0.78, 0.855]**, 0.075 wide. That clears P0's ≥ 0.06 requirement, but
only just — and note what changed under D26: the window's *upper* bound is now set by the dive
recovery (0.855), not by the framing box. **The clamp floor of 0.78 is now doing real work.** There
is 0.075 of room and no more, so any tuning that pushes containment lower has nowhere to go.

With the framing box added, and a 60 wu minimum enemy hull:

| framing box width `boxW` | containment ceiling | verdict |
|---|---|---|
| 320 wu (48 m — 1v1 turning fight) | z ≤ 1.227 | dive recovery binds first; window [0.78, 0.855] |
| 460 wu (69 m — 1v1 plus an incoming) | z ≤ 0.854 | window [0.78, 0.854] — still open |
| **503 wu (75.5 m)** | z ≤ **0.781** | **the auto clamp floor is reached; window ≈ zero** |
| 560 wu (84 m) | z ≤ 0.701 | window survives only if the clamp widens to 0.68 |
| **> 585 wu (87.8 m)** | z < 0.671 | **no zoom satisfies both — PIVOT SIGNAL** |

Three numbers to carry, and they are ratios so **D26 did not move them**: **503 wu (75.5 m)** is the
widest fight the auto clamp can frame; **585 wu (87.8 m)** is the widest fight portrait can frame at
all; and the two levers are the **minimum enemy hull** (art, §3.4) and the **p90 framing-box width**
(flight and AI tuning).

The fair comparison on a landscape phone (844×390, `worldW` 1212 wu, `worldH` 560 wu, scale 0.696):
its width window is enormous and never binds, and its legibility floor is 0.814. But its **height**
ceiling for a Vne dive recovery is `0.90 × 560 / 1053 = 0.478`, **below its own legibility floor and
outside its own clamp**. Landscape phone's window is empty for that manoeuvre; portrait's is
[0.671, 0.855] and open. **Portrait's window closes on width; landscape's is closed on height before
it starts.**

#### 4.4.2 Criteria

Every criterion is measured **at the zoom the controller actually delivers**, and P1/P3/P4 are
additionally measured at the clamp extremes. "Delivered" means: the controller is live, unmodified,
at `zoomBias: 'normal'`.

| # | criterion | measurement | PASS | **FAIL** |
|---|---|---|---|---|
| **P0** | **The zoom window is non-empty and usable** | `zoomContain = min(0.85 × 462 / boxW_p90, 0.90 × 1000 / recoveryH_p90)` vs `zoomLegible = 34 / (minHull × 0.844)`, over 200 seeded engagements | overlap exists, is **≥ 0.06 wide**, and **intersects [0.78, 1.22]** | **no overlap**, or overlap misses the clamp, or overlap **< 0.03 wide** (the controller would oscillate across it) |
| **P1** | A combat turn fits | diameter of the flown circle at corner speed, sustained max-rate, at **`zoomCombat` and at `zoomIntimate`** | ≤ 286 wu (43 m) at combat — the derived figure is **273 wu** — **and** ≤ 235 wu of the 379 wu visible at `zoomIntimate` | **> 370 wu at combat**, or does not fit at all at `zoomIntimate` |
| **P1b** | A Vne dive recovery fits **inside the clamp** | vertical extent of the pull-out from Vne, and the zoom needed to contain it at 90% fill | contained at **zoom ≥ `zoomWide` (0.78)**; the derived figure is 1,053 wu needing **z ≤ 0.855** ✓ | **requires zoom < `zoomWide`** — i.e. no framing the controller may legally choose contains the manoeuvre |
| **P2** | Warning on a diving attacker | seconds from the attacker becoming trackable (`zoomLockRange`, 1400 wu) to its guns entering the 440 wu range, split into **tape warning** and **in-frame warning**, 200 seeded engagements in `sim.mjs`, at delivered zoom **and** at forced `zoomCombat` | **total** median ≥ **1.50 s**; **in-frame** median ≥ **0.90 s** at delivered zoom and ≥ **0.75 s** at forced `zoomCombat`; in-frame 5th-pct ≥ **0.60 s** | **in-frame median < 0.70 s**, or total median < 1.10 s, or in-frame 5th-pct < 0.45 s |
| **P3** | Enemy silhouette legibility **across the range** | on-screen hull length of the **smallest** enemy in the level, at `zoomWide`, at delivered p90 zoom, and at `zoomCombat` | ≥ **34 css px at `zoomWide`** (39.5 px for a 60 wu hull) and ≥ 44 px at `zoomCombat` | **< 34 px at `zoomWide`**, or < 28 px at any zoom the controller can reach |
| **P3b** | P3 is not passed by pinning the camera wide *(agent B, REQ-B4)* | fraction of duel time spent at `zoom ≥ 1.25` | ≤ **20%** | **> 35%** — the controller is parking at the tight end to flatter P3 |
| **P3c** | Legibility survives **peak** framing demand *(agent B, REQ-B4)* | at each duel's moment of maximum framing demand, the fight must fit at 85% fill **and** the enemy hull must be ≥ **40 css px**, both at the same instant | both true in ≥ **90%** of duels | both true in **< 75%** of duels |
| **P4** | The ladder reads as a **journey** *(D27)* | a scripted full-column climb, 0 → 10,000 wu, plus the establishing crane | ≥ **2 bands** simultaneously legible (≥ 90 css px each) for ≥ **55%** of the traversal at combat framing; ≥ **3 bands** seen **within the establishing shot**, each held ≥ 0.8 s | < 2 bands for more than half the traversal, or < 3 bands in the establishing shot |
| **P4b** | A band boundary reads **as a transition** *(D27)* | crossing any boundary at best climb rate | both bands' signature elements on screen together for ≥ **1.5 s**, and the ramp/haze crossfade completes in **1.0 – 3.0 s** | either band's signature never co-visible with the other's, or the crossfade snaps (< 0.4 s) or crawls (> 4 s) |
| **P4c** | The zoom controller does not pump | zoom trace over a 120 s auto-flown mission | ≤ **6** direction reversals per minute, no reversal pair inside **1.2 s**, no oscillation of amplitude > 0.05 sustained > 3 s | **> 12 reversals/min**, or any visible pump |
| **P5** | Thumb occlusion | a 165 css px disc (44 mm) at the median stick contact point, 60 s auto-flown mission | ≤ **18%** of screen area, overlaps the player's screen rect on ≤ **2%** of frames | **> 25%** of area, or > 6% of frames |
| **P6** | Horizontal awareness (portrait's weak axis) | fraction of damage events whose attacker was never on screen in the preceding 1.0 s, edge chevrons active, at delivered zoom | ≤ **12%** | **> 25%** |
| **P7** | Ground-attack legibility | distinct ground targets visible ahead while strafing at `y ∈ [-260, -800]` (Mud/lower Belt) at cruise, target spacing 140 wu (21 m) | ≥ **3** | **< 2** |
| **P8** | Blind framing critique | 3 critic agents score a portrait still and a landscape still of the same combat moment, sides randomised, project preference withheld (`tools/blind.mjs`) | portrait mean within **1.0** of landscape mean on a 10-scale | portrait mean **≥ 1.5 below** landscape |
| **P9** | Zoom is sim-neutral | the same seeded mission at forced zoom 0.78 and 1.22 | run summaries (§8.1) **bit-identical** | **any difference at all** |

**Why P4 is worded that way.** The pre-D27 draft required all six bands legible at once. Under the
corrected scale that is arithmetically impossible: fitting a 1,500 m column onto an 844 px screen
puts the player's hull at **5.4 css px**, and the only way to "pass" would be pinning the camera at a
zoom that turns the game into a map. That is the workaround-inside-a-gate shape this repo has been
burned by before, and the criterion is struck (D27).

One reading is recorded here rather than assumed silently: D27 says "≥ 3 at establish", and **a
static establishing frame cannot contain three bands at any legible zoom** (the three lowest bands
sum to 3,000 wu; showing them needs zoom 0.33 and an 18 px hull). It is therefore implemented as
**≥ 3 bands within the establishing *shot*** — a slow vertical crane at `zoomEstablish`, which is
faithful to D27's own words, *"the ladder is a journey, not a composition"*. The band-edge constraint
in §3.3 (three lowest bands ≤ 3,000 wu) is what makes the crane cross three bands in ≤ 4 s. **If the
manager intended a static frame, this criterion is unpassable and must come back.**

#### 4.4.3 Decision rule

- **P0 or P9 FAIL → stop.** P9 means the build is wrong, not the orientation; fix it and re-run.
  P0 means no zoom in portrait frames the fight legibly: **that is the pivot signal**, and it is the
  one this whole section exists to detect.
- Any other FAIL → **pivot to landscape-primary**: `VIEW_PROFILE.landscape` becomes the tuning
  target, the world agent re-proportions the bands, portrait stays a supported secondary config.
  No code moves. Per D15 this specific call still goes to Aaron — it changes the game he asked for.
- All PASS but **two or more criteria within 10% of a FAIL threshold** → escalate with the numbers
  and both screenshots.
- All PASS with margin → portrait is ratified and this section becomes read-only history.

**What would actually fail.** P0, P2 and P6 are the realistic killers, and P0 and P6 are the same
failure seen twice: portrait has 69.3 m of width at the frame the flight model was tuned in, and
every extra aircraft in a fight spends it. P0 fails if the p90 framing box exceeds **585 wu (87.8 m)**
or if the dive-recovery extent grows past 1,111 wu. P2 is newly at risk under D26: the column is ten
screens tall, so a diving attacker's *first* warning is a pip on the altitude tape, not a silhouette
— which is why §4.2's tape is a precondition and why the AI's committed-dive speed is capped at
467 wu/s (§3.4). P3 fails if art draws any enemy under **54 wu** of hull. P1b is the criterion
landscape fails, stated in the same terms so the comparison is honest rather than rhetorical.

**Do not tune a value purely to make a gate pass.** If P0 needs the framing box narrowed, that is an
AI design change with a stated cost, recorded in HANDOFF — not a number quietly edited in a gate
file, and never a `zoomFill` nudged from 0.85 to 0.95 to buy 12% on paper.

---

## 5. Layout and file ownership

```
gms/2d/kitehawk/
  index.html               the game shell — one canvas, one ui root, no build step
  css/game.css
  docs/
    MANAGER_BRIEF.md       the manager's, nobody edits
    ARCHITECTURE.md        this file — read-only for build agents
    DESIGN.md ART.md STORY.md SUNO.md
    HANDOFF.md             append-only; every agent writes a section before it stops
    refs/                  reference material, study only, never ships
  js/
    main.js                boot, ctx assembly, scene machine
    core/    viewport.js viewprofile.js camera.js input.js events.js rng.js
             loop.js math.js quality.js audio.js save.js debug.js
    gfx/     renderer.js particles.js lights.js postfx.js texture.js parts.js
             sky.js clouds.js shaders/{gl,sprite,light,post}.js
    sim/     flight.js aero.js pilot.js world.js terrain.js entities.js
             weapons.js crates.js ai.js damage.js spawner.js physics.js
    modes/   story.js survival.js race.js airlift.js duel.js daily.js
    ui/      layout.js hud.js stick.js alttape.js hangar.js cards.js map.js
    story/   runner.js script.js
    data/    level.js act.js tables.js validate.js      (loaders + validators only)
  data/
    levels/  a1-01.json … a5-20.json                    (100, hand-authored or generated)
    acts/    act1.json … act5.json
    tables/  upgrades.json airframes.json enemies.json economy.json
    script.json                                         SINGLE SOURCE OF TRUTH for all text + VO
  assets/    atlases, sky bands, cloud sheets, terrain, audio manifest — GENERATED, committed
  assets/audio/   manifest.json + sfx/ music/ vo/ — may be ENTIRELY ABSENT (§10 rule 3)
  art/
    tools/   flux.py and the baking / atlas / trim scripts
    src/     prompt lists and generation manifests
  tools/     cdp.mjs shot.mjs touch.mjs sim.mjs genlevels.mjs blind.mjs
             manifest.mjs        generates assets/audio/manifest.json from data/script.json
             split_take.py       ported from NEONHAUL, not reinvented
             gates_*.mjs                                (MANAGER'S — see §8.4)
  shots/     gate captures and gate records             (gitignored except the ship screenshot)
  vendor/    anything third-party, vendored. Nothing is ever loaded from a CDN.
```

### 5.1 Ownership

| agent | owns | never touches |
|---|---|---|
| **E — engine** | `js/core/*`, `js/gfx/*`, `index.html`, `css/game.css`, `tools/cdp.mjs`, `tools/shot.mjs`, `tools/touch.mjs` | anything in `js/sim`, `js/ui`, `js/modes` |
| **F — flight** | `js/sim/{flight,aero,pilot,physics}.js`, `js/data/tables.js`, `tools/sim.mjs` | the renderer |
| **C — combat** | `js/sim/{entities,weapons,crates,ai,damage}.js` | flight constants |
| **W — world** | `js/sim/{world,terrain,spawner}.js`, `js/data/{level,act,validate}.js`, `tools/genlevels.mjs`, `data/**` | |
| **R — art systems** | `js/gfx/{sky,clouds}.js`, rig definitions, `art/**`, `assets/**` | `js/gfx/renderer.js`, `js/gfx/parts.js` and the shaders — draws *through* `R`, never edits it |
| **U — UI** | `js/ui/*` | the sim |
| **M — meta** | `js/modes/*`, `js/core/save.js`, the hangar screen | |
| **S — story/audio** | `js/story/*`, `js/core/audio.js`, `data/script.json`, `tools/manifest.mjs`, `tools/split_take.py`, `assets/audio/**` | the UI's radio card widget |
| **manager** | `docs/*`, `tools/gates_*.mjs`, `projects.js`, git | |

**Nobody writes outside the files they own.** If you need something from another module, use the
contract in §6. If the contract is missing something, add a **REQUEST** to `docs/HANDOFF.md` and stop
short of the thing you cannot do — do not reach into someone else's file. Agents run concurrently.

**Agents do not run git.** Not `add`, not `commit`, not `status`. Report what you changed; the
manager stages and commits.

---

## 6. The engine API — frozen once `core/` and `gfx/` land

`main.js` builds these once and passes them to every scene. Treat them as the only globals.

```js
const ctx = {
  R,        // renderer        gfx/renderer.js
  P,        // particles       gfx/particles.js
  input,    // core/input.js
  view,     // core/viewport.js
  cam,      // core/camera.js
  bus,      // core/events.js
  rng,      // core/rng.js      — the run's root stream; fork it, never reseed it
  audio,    // core/audio.js    — always present, may be a total no-op
  save,     // core/save.js
  quality,  // core/quality.js
  assets,   // loaded textures / atlases
  LAYER, DT,
  dom: { stage, ui },
  debug,    // bool, from ?debug
  go(name, params),          // scene change
};
```

A scene is:

```js
{ async enter(ctx, params) {}, update(dt) {}, render(alpha, dtReal) {}, exit() {} }
```

Scenes: `boot`, `title`, `hangar`, `brief`, `play`, `pause`, `debrief`, `map`. `dt` is always `DT`.

### 6.1 Renderer — `gfx/renderer.js`

```js
const R = await createRenderer(canvasEl, { preserveDrawingBuffer, lightScale });

R.resize(cssW, cssH, dpr, worldH);      // fit-to-height; worldW is derived
R.begin(cam);                            // cam = {x, y, zoom} — world point at screen centre
R.end();                                 // runs lights + post chain and presents
R.tick(dtReal);                          // advance real-time effect timers, once per rendered frame

R.sprite({
  tex, sx, sy, sw, sh,                   // source rect in px; omit for the whole texture
  x, y, w, h,                            // world CENTRE and world size
  rot = 0,                               // radians, +Y down so positive is clockwise on screen
  r = 1, g = 1, b = 1, a = 1,
  layer = LAYER.ACTORS,
  add = false,                           // additive — everything that glows
  parallax,                              // defaults to the layer config
  parallaxY,                             // defaults to the layer config, which defaults to parallax
  flipX = false, flipY = false,
});
R.spriteRaw(tex,u0,v0,u1,v1,x,y,w,h,rot,r,g,b,a,layer,add,parallax,parallaxY);   // no-alloc fast path
R.quad({x,y,w,h,rot,r,g,b,a,layer,add,parallax,parallaxY});
R.line(x1, y1, x2, y2, thickness, {r,g,b,a}, layer, {tex, add, parallax, parallaxY});
R.ribbon(points, widths, {r,g,b,a}, layer, {tex, add, taper, parallax, parallaxY});
R.poly(points, {r,g,b,a}, layer, opts);              // convex, world space
R.tri(x1,y1,c1, x2,y2,c2, x3,y3,c3, layer, opts);    // per-vertex colour
R.rect(x, y, w, h, thickness, col, layer);
R.gradient(y0, y1, colTop, colBottom, layer, opts); // LOCAL fills only — the sky is skyRamp
R.skyRamp(y0, y1, rampTex, layer, opts);             // per-fragment from WORLD Y, zoom-proof (R13)
R.drawRig(rig, x, y, rot, scale, lights, layer, opts);   // gfx/parts.js — painterly actors
R.backdrop(band, opts);                              // horizontally tiling ground band
R.skyBand(band, opts);                               // tiles X, stretches to [y0,y1], own parallaxY
R.light({x, y, radius, r, g, b, intensity = 1, flicker = 0, squash, angle, parallax, parallaxY, soft});
R.lightRaw(x, y, radius, r, g, b, intensity, flicker);

R.setLayer(layer, {shade, response, haze, mul, parallax, parallaxY, rampAmt, grainAmt});
R.setRamp(tex);                          // per-act 256x1 LUT, texture unit 9
R.setGrain(tex, scale, amount);          // screen-space paper tooth, texture unit 10
R.setAmbient(r,g,b);  R.setHaze(r,g,b);  R.setClearColor(r,g,b);
R.createTexture(imageOrBytes, opts);
R.screenOf(worldX, worldY) -> {x, y}                 // normalised 0..1, reused object — copy it
R.stats = { drawCalls, sprites, tris, lights, streams, frame }   // content draws only
R.white  R.blob  R.disc  R.streak                    // runtime textures, always available
R.zoom  R.scale  R.worldW  R.worldH                  // LIVE at draw time (R14) — art systems may
                                                     // size strokes and cloud detail against zoom
```

`band` for `skyBand` / `backdrop`:
`{ tex, layer, parallax, parallaxY, worldW, worldH | y0, y1, anchorY, tile, mirror }`.

### 6.2 Screen effects — `R.fx`

```js
R.fx.shake(strength, seconds);          // trauma, accumulates, decays quadratically
R.fx.shockwave(x, y, strength, {life, speed});   // up to 4 live, world space
R.fx.flash(r, g, b, a, seconds);
R.fx.chroma(amount, seconds);
R.fx.timeScale(scale, seconds);         // hitstop — 0.06 for 0.07 s on a kill
R.fx.vignette(amount);                  // sticky
R.fx.gLoad(amount);                     // 0..1 — greyout/redout; drives vignette + saturation
R.fx.setRays(x, y, strength, decay, density);    // god rays from the sun, strength 0 = off
R.fx.setGrade(shadowTint, highTint);
// tunables set per scene: bloom threshold knee exposure saturation contrast grain maxShake
```

### 6.3 Particles — `gfx/particles.js`

One pooled system, **cap 12,000**, SoA, no allocation. Emitters are plain data.

```js
P.emit({
  x, y, count, jitter,
  vx, vy, vSpread, speed, speedVar,
  life, lifeVar, fadeIn,
  size, sizeVar, sizeEnd,
  color: [r,g,b,a], color2: [r,g,b,a],   // lerped over life
  rot, rotVar, spin, spinVar,
  gravity = 0, drag = 0, bounce = 0.35,
  add = false, layer = LAYER.FX, tex = null,     // null = soft blob
  collide = false, killOnHit = false,            // needs P.setTerrainQuery
  alignVel = false, stretch = 0,                 // velocity-aligned, speed-stretched — SPEED LINES
  glow = 0,                                      // emits light if > 0, under P.glowBudget
});
P.update(dt);  P.render();  P.clear();
P.setTerrainQuery(fn);      // fn(x, y) -> true if solid; the world agent registers it
P.glowBudget = 24;          // hard cap on particle-emitted lights
P.count  P.capacity
```

Motion streaks are `alignVel: true, stretch: 0.6, tex: R.streak, add: true`. There is no
post-process motion blur and there will not be one — it smears the HUD and the target.

### 6.4 Input — `core/input.js`

Unified keyboard / mouse / gamepad / touch. **Never read a raw DOM event in game code.**

```js
ACTIONS = ['pitchUp','pitchDown','slipLeft','slipRight','special','brake','pause']

input.axisY                 // -1 .. 1  — PITCH. Negative (thumb up) = nose up = toward -Y
input.axisX                 // -1 .. 1  — rudder / side-slip trim
input.held(action) / pressed(action) / released(action) / consume(action)
input.setAction(action, on) // drive from UI or a cutscene
input.registerZone(id, rectFn, action, kind)   // kind 'stick' | 'button'; rectFn -> css px rect
input.clearZones()
input.onTap(fn)             // -> unsubscribe; fn({x, y, worldX, worldY, id})
input.onDoubleTap(fn)       // -> unsubscribe; within 280 ms and 30 css px
input.onFlick(fn)           // -> unsubscribe; fn({dx, dy, speed}) — > 900 css px/s in < 160 ms
input.pointerDown  input.pointerScreen  input.pointerWorld
input.lastSource            // 'keyboard' | 'pointer' | 'touch' | 'gamepad'
input.releaseAll()          // MUST be called on every scene change
input.update()              // once per tick, before the sim
```

**The one-thumb contract.**
- The **stick zone is the whole lower 55% of the screen** in portrait (profile `stickZone`). Touching
  it anywhere sets the stick origin at the touch point — hold and slide. `stickR` is
  `max(36, min(zone.w, zone.h) * 0.36)` css px, ported unchanged.
- **Throttle is automatic.** There is no throttle input. `brake` (airbrake / slip) is available on
  keyboard and pad only; on touch it is the `axisX` extreme.
- **Guns auto-fire** whenever a valid target is inside the nose cone. Cone: **±11°, range 440 wu
  (66 m — period-correct for a Vickers)**
  — the sim owns this, there is no fire button and never will be. 440 wu is derived, not chosen: no
  hostile weapon may outrange the visible width at `zoomCombat` (462 wu), or you are shot by
  something that was never on screen (§4.3.5). The cone is in world units and **does not vary with
  zoom**.
- A **tap outside the stick zone** fires the loaded special. A **flick up at < 150 wu/s airspeed**
  commands a stall turn. A **double-tap in the stick zone** commands a hard reversal.
- **Handedness**: `save.settings.handed` mirrors the landscape stick zone. Portrait is full-width and
  needs no mirroring.

### 6.5 Viewport — `core/viewport.js`

```js
view.mode                   // 'portrait' | 'landscape'
view.w  view.h  view.dpr    // css px
view.pw view.ph             // framebuffer px
view.worldH                 // world units visible vertically — the fitted axis
view.worldW                 // derived
view.scale                  // css px per world unit, before camera zoom
view.safe                   // {top,right,bottom,left} — notch insets, read via a hidden probe
view.profile                // the VIEW_PROFILE entry for the current mode
view.toWorld(sx, sy, out) -> {x,y}
view.toScreen(wx, wy, out) -> {x,y}
view.worldPerPx()
view.setCamera(cam)  view.refresh()  view.onResize(fn)
bus.emit('view:change', {mode, w, h, dpr, modeChanged, view})
```

`?dpr=1` forces the ratio — the headless harness needs it. Keep it.

### 6.6 Camera — `core/camera.js`

```js
cam.x  cam.y  cam.zoom          // read by R.begin(); zoom is the SOLVED, slewed value
cam.update(player, dt)          // once per tick, after the sim, before render
cam.setThreatAbove(bool)        // raises anchorY so a diving attacker is seen in time (gate P2)
cam.punch(strength)             // small zoom kick on a kill; decays in 0.35 s, inside the clamp
cam.bounds = {minY, maxY}       // clamped to the column so the camera never leaves the world

// --- framing box: systems ADD members, the camera solves the zoom (§4.3.1)
cam.track(id, x, y, w, h, weight)   // re-asserted every tick; a member not re-asserted drops out
cam.untrack(id)
cam.box                              // read-only {x, y, w, h} — the solved AABB, for the debug overlay
cam.zoomTarget                       // read-only — what the solver asked for, before slew
cam.zoomReason                       // read-only string, for the debug overlay and gate P4b

// --- framing overrides (§4.3.4)
cam.requestFraming(tag, {zoom, box, seconds, ease, priority, allowOutsideClamp});
cam.releaseFraming(tag);             // 'beat' stays inside the clamp; only 'cinematic' may leave it,
                                     // and only while the player has no combat control
```

The camera is the only thing that reads `view.profile`, and the only thing that owns `zoom`.
Everything else asks the camera. **Nothing under `js/sim/` may import this module** (§4.3.5).

`cam.track()` is re-assertion-based on purpose: a system that stops caring about an entity simply
stops calling it, and there is no way to leak a stale framing member that pins the zoom to the floor
forever. That failure mode is the one to design against — see the zeppelin note in §4.3.1.

### 6.7 Bus — `core/events.js`

`bus.on(name, fn) -> off`, `bus.once`, `bus.emit(name, payload)`, `bus.off`, `bus.clear`.
Synchronous. Handlers added during an emit do not fire for that emit. A throwing handler is caught
and logged, never propagated.

Reserved names — do not repurpose:

```
view:change     scene:change    quality:change
player:damage   player:stall    player:blackout   player:died   player:land
enemy:spawn     enemy:killed    enemy:fled
crate:drop      crate:caught    crate:lost        crate:canopyHit
gun:fire        gun:hit         special:fire      flak:burst
level:start     level:end       objective:done    star:earned
story:beat      story:done      audio:cue         save:write
```

`crate:*` are the signature mechanic's events and must be emitted from day one.

### 6.8 Audio facade — `core/audio.js`

**Hard rule: the game must be fully playable and correct with `assets/audio/` completely absent** —
not merely empty, and not merely flagged off.
Do not port Sunderfall's synthesised DSP bank; write this facade instead.

```js
const audio = await createAudio(ctx);    // never throws, never blocks, never awaits a file

audio.ready                 // false until a user gesture starts the AudioContext — behaviour-neutral
audio.sfx(key, {x, y, gain, rate, force}) -> id|false
audio.loop(key, {x, y, gain}) -> id|false
audio.stop(id, fade)  audio.stopAll(fade)
audio.music(name, {fade}) audio.stopMusic(fade) audio.setIntensity(0..1)
audio.ambience(id, fade)
audio.voice(lineId) -> {playing:boolean, len:number}   // resolves take + sprite from the manifest;
                        // playing:false is the NORMAL path — the card is scheduled from text anyway
audio.hasTake(take) -> boolean
audio.setListener(x, y, halfWidth)  audio.followCamera(on)
audio.duck(amount, seconds)  audio.hitstop(scale, seconds)
audio.setVolume(name, v)  audio.getVolume(name)  audio.setMuted(b)
audio.report()              // for the debug overlay
```

Resolution order for a key: manifest file on disk → a small built-in synth for the ~20 core keys →
silent no-op. A missing file, a missing manifest and a missing folder each cost **one console
warning** and nothing else.

`audio.voice()` returning `playing: false` is the normal path, not an error. **Every line has a text
card, the card is authored first in `data/script.json`, and its duration is computed from the text
(§7.5) — never from the audio.** A card that asks the audio how long to stay up is a card that
appears for 0 ms the moment a file is missing, which is the exact way this contract gets violated
while every boot test still passes. Asset generation never blocks a milestone.

### 6.9 Seeded RNG — `core/rng.js`

```js
const rng = createRNG(seedStringOrInt);
rng.next() float() range(a,b) int(a,b) bool(p) sign() spread(a) pick(arr)
rng.weighted(items, weights) shuffle(arr) gauss(mean, sd) angle()
rng.fork(tag) -> rng        // an independent stream
hashSeed(str) -> uint32
```

`Math.random()` is **banned everywhere under `js/sim/`, `js/modes/` and `data/`** — it makes the
headless sim non-reproducible and the daily challenge unfair. Fork a stream per system
(`rng.fork('spawner')`, `rng.fork('weather')`) so one system consuming numbers cannot desync another.
The particle system's cosmetic jitter is the one permitted exception and it must never feed the sim.

### 6.10 Quality — `core/quality.js`

```js
quality.low                 // bool — the single source of truth
quality.set(low)            // emits 'quality:change'
quality.auto(enabled)       // flips to low if mean frame > 22 ms over 3 s; never flips back up
```

Read `quality.low` in one place per system. An ad-hoc `if (isSlowPhone)` anywhere is a bug (§9.3).

### 6.11 Save — `core/save.js`

```js
save.data                   // the live object (§7.3)
save.load()  save.write()   // write is debounced 400 ms and coalesced
save.reset()                // wipes; used by ?nosave and the settings screen
save.migrate(from, to)      // every version bump ships a migration, never a wipe
save.export() -> string     // base64 of the JSON, for the debug overlay
save.import(str) -> boolean
```

One localStorage key. `?nosave` disables both read and write for gate runs. Corrupt JSON, a failed
checksum or a future `v` falls back to a fresh save with **one console warning and an in-page
callout** — never an alert, never a blocking modal.

---

## 7. Data formats

Everything is JSON on disk, loaded with `fetch` and validated by `js/data/validate.js` at load time.
**A malformed level must fail loudly in the console and in the debug overlay, never silently.**
All 100 levels are hand-authorable and script-generatable — `tools/genlevels.mjs` writes exactly this
format and a human can edit the result.

### 7.1 Level — `data/levels/a1-04.json`

Levels are described as **bands and beats**, never as a coordinate dump. A beat fires when the camera
passes `x`. This is what makes 100 of them tractable.

All positions are world units at **0.15 m/wu** (§3.0). `length: 42000` is **6.3 km**, about 131 s at
cruise. A crate beat's `y` is where the canopy is already open — near the top of the playable column,
because the drop itself happens at the Concord Line, 4,000 m up and permanently out of reach (D28).
The `concordLine` field is drawn by the art and the altitude tape and is **never** a reachable
coordinate; `js/data/validate.js` rejects any beat, spawn or objective placed above `ceiling`.

```json
{
  "v": 1,
  "id": "a1-04",
  "act": 1,
  "index": 4,
  "name": "Wire and Wind",
  "seed": "a1-04",
  "length": 42000,
  "column": { "ground": 0, "ceiling": -10000, "concordLine": -26667 },
  "bands": {
    "mud":   { "y0": 0,     "y1": -333 },
    "belt":  { "y0": -333,  "y1": -1667, "flak": 0.7 },
    "floor": { "y0": -1667, "y1": -3000, "haze": 0.35 },
    "deck":  { "y0": -3000, "y1": -5000, "coverage": 0.55, "drift": -18 },
    "lane":  { "y0": -5000, "y1": -7667 },
    "blue":  { "y0": -7667, "y1": -10000 }
  },
  "terrain": { "profile": "trenchline", "amp": 90, "wavelength": 2600, "detail": 0.6 },
  "weather": { "wind": { "x": -40, "y": 0 }, "gust": 26, "visibility": 0.85, "timeOfDay": "dawn" },
  "player": { "start": { "x": 600, "y": -1200 }, "airframe": "kitehawk-i", "fuel": 1.0, "ammo": 500 },
  "beats": [
    { "x": 2400,  "spawn": "scout",    "n": 2, "band": "belt",  "from": "ahead" },
    { "x": 6800,  "spawn": "aaNest",   "n": 3, "band": "mud",   "spacing": 420 },
    { "x": 9000,  "crate": { "kind": "ammo", "y": -9600, "drift": -30, "owner": "neutral" } },
    { "x": 14000, "spawn": "balloon",  "n": 1, "band": "belt",  "hp": 3 },
    { "x": 21000, "event": "cloudbank", "len": 3400 },
    { "x": 30000, "spawn": "hunter",   "n": 3, "band": "deck",  "from": "above", "wave": true },
    { "x": 39000, "boss":  "zeppelin-l30", "band": "lane" }
  ],
  "objectives": [
    { "type": "reach",   "x": 42000 },
    { "type": "collect", "what": "crate", "n": 4 },
    { "type": "survive", "maxDeaths": 0 }
  ],
  "stars": [
    { "id": "clean",  "desc": "Not a scratch",        "stat": "damageTaken",  "op": "==", "value": 0 },
    { "id": "greedy", "desc": "Every crate recovered", "stat": "cratesMissed", "op": "==", "value": 0 },
    { "id": "quick",  "desc": "Under 3:20",            "stat": "time",         "op": "<=", "value": 200 }
  ],
  "reward": { "crates": 3, "scrip": 120 },
  "music": "patrol", "ambience": "front-line"
}
```

Star conditions are **structured, never expression strings**. `stat` names come from the run summary
in §8.1 so `sim.mjs` can evaluate stars headlessly without a browser and without `eval`.

### 7.2 Act — `data/acts/act1.json`

```json
{
  "v": 1,
  "id": "act1",
  "name": "The Kite Line",
  "levels": ["a1-01","a1-02","a1-03","a1-04","a1-05","a1-06","a1-07","a1-08","a1-09","a1-10",
             "a1-11","a1-12","a1-13","a1-14","a1-15","a1-16","a1-17","a1-18","a1-19","a1-20"],
  "unlocks": { "airframes": ["kitehawk-i"], "upgrades": ["engine.1","guns.1","fuel.1"] },
  "gate": { "starsRequired": 0 },
  "intro": "story.act1.open",
  "outro": "story.act1.close",
  "palette": "dawn-ochre",
  "ace": "von-marbach"
}
```

### 7.3 Save — one localStorage key, versioned

```json
{
  "v": 3,
  "created": 1755990000000,
  "saved": 1755993000000,
  "profile": { "name": "", "flags": { "seenIntro": true, "seenHangar": true } },
  "economy": { "crates": 46, "scrip": 1180 },
  "hangar": {
    "airframe": "kitehawk-ii",
    "owned": ["kitehawk-i", "kitehawk-ii"],
    "upgrades": { "engine": 3, "wings": 2, "guns": 2, "armour": 1, "fuel": 1, "ammo": 2 },
    "traits": ["ironStomach"]
  },
  "story": { "act": 2, "level": 7, "beatsSeen": ["a1-01.open", "a1-20.close"] },
  "levels": { "a1-01": { "best": 184.2, "stars": ["clean","quick"], "runs": 3 } },
  "modes": {
    "survival": { "bestWave": 14, "bestScore": 88210 },
    "race":     { "a1-04": { "best": 121.6, "ghost": "b64:…" } },
    "duel":     { "von-marbach": { "wins": 2, "losses": 5 } },
    "daily":    { "date": "2026-08-23", "seed": "kh-2026-08-23", "score": 4120, "done": true }
  },
  "settings": {
    "volume": { "master": 0.9, "sfx": 1.0, "music": 0.7, "voice": 1.0 },
    "lowDetail": false, "orientationLock": "auto", "handed": "right", "assist": "off"
  },
  "checksum": "fnv1a:9c3ab21f"
}
```

Race ghosts are a base64 `Float32Array` of `(t, x, y, angle)` at 10 Hz — ~16 bytes/s, ~3 KB for a
3-minute lap. Cap stored ghosts at 20 and evict the oldest.

### 7.4 Economy and upgrades — `data/tables/upgrades.json`

```json
{
  "v": 1,
  "currency": { "crates": "hard, caught in the air", "scrip": "soft, paid per sortie" },
  "tracks": {
    "engine": {
      "name": "Engine", "desc": "Power. Climb rate and top speed.",
      "levels": [
        { "cost": {},                         "power": 1.00, "climb": 1.00 },
        { "cost": { "scrip": 140 },           "power": 1.10, "climb": 1.08 },
        { "cost": { "scrip": 320, "crates": 2 }, "power": 1.22, "climb": 1.17 },
        { "cost": { "scrip": 700, "crates": 5 }, "power": 1.36, "climb": 1.28 }
      ]
    },
    "wings": {
      "name": "Wings", "desc": "Lift and turn. Biplane, triplane, sesquiplane.",
      "levels": [
        { "cost": {},                            "form": "biplane",     "clMax": 1.32, "pitchRate": 1.00, "cd0": 1.00 },
        { "cost": { "scrip": 260, "crates": 3 }, "form": "triplane",    "clMax": 1.51, "pitchRate": 1.14, "cd0": 1.09 },
        { "cost": { "scrip": 640, "crates": 7 }, "form": "sesquiplane", "clMax": 1.44, "pitchRate": 1.08, "cd0": 0.92 }
      ]
    }
  },
  "airframes": {
    "kitehawk-i": {
      "name": "Kitehawk I", "kind": "biplane",
      "mass": 620, "wingArea": 22, "clMax": 1.32, "cd0": 0.035, "thrust": 3400,
      "hull": { "len": 64, "hgt": 34 }, "hp": 100, "guns": 2, "ammo": 500, "fuel": 240,
      "unlock": { "act": 1 }
    }
  },
  "traits": {
    "ironStomach": { "name": "Iron Stomach", "desc": "You grey out later.",
                     "effect": { "gTolerance": 1.25 }, "cost": { "crates": 8 } }
  }
}
```

Multipliers, never absolutes, so a flight-model retune does not invalidate the whole table.

### 7.5 Script — `data/script.json`, the single source of truth

**All player-facing text and every voice line live in one file.** `text` is mandatory; `audio` is
advisory. `assets/audio/manifest.json` is **generated** from this file by `tools/manifest.mjs` and is
never hand-edited — an authored manifest drifts from the script the first time a line is reworded,
and then the game says one thing and the card says another.

```json
{
  "v": 1,
  "speakers": {
    "lead":  { "name": "Flight Lead", "take": "flightlead", "colour": "#d8c08a" },
    "you":   { "name": "Kitehawk",    "take": null }
  },
  "lines": {
    "a1-04.open": {
      "speaker": "lead",
      "text": "Belt's thick today. Climb through it.",
      "kind": "radio",
      "audio": { "take": "flightlead", "start": 41.20, "len": 2.35 }
    },
    "a1-04.crate": {
      "speaker": "lead",
      "text": "Silk at ten. Take it or they will.",
      "kind": "radio"
    },
    "a1-20.close": {
      "speaker": "lead",
      "text": "You came back. Not everyone did.",
      "kind": "card",
      "audio": { "take": "flightlead", "start": 118.6, "len": 3.10 }
    }
  }
}
```

**Card duration is scheduled from the TEXT, always, and never from the audio.**

```js
const dur = clamp(1.1 + text.length / 13.5, 1.6, 7.0);   // ~13.5 chars/s ≈ 160 wpm
const shown = audioPresent ? Math.max(dur, audioLen) : dur;
```

Deriving duration from the audio gives a **0 ms card** when the file is missing — which is precisely
how "playable with the audio folder empty" ships broken while still passing a boot test. Audio may
only ever *extend* a card, never shorten it below the text duration.

**Radio lines are hard-capped at 44 characters and never wrap.** `js/data/validate.js` fails the load
of any `kind: "radio"` line longer than 44 characters, at author time, in the console and the debug
overlay. A wrapped radio line in a portrait top-third band eats two lines of sky.

The **radio card is orientation-aware and non-blocking**: `VIEW_PROFILE.portrait.radioCard` is the
top third, `VIEW_PROFILE.landscape.radioCard` is top-left. It never takes input, never pauses, and
never becomes a modal (§10 rule 2).

```js
radioCard: { x: 0.00, y: 0.06, w: 1.00, h: 0.14 },   // portrait: the top third band
radioCard: { x: 0.02, y: 0.06, w: 0.42, h: 0.16 },   // landscape: top-left
```

### 7.6 Audio manifest — `assets/audio/manifest.json` (GENERATED)

Written by `tools/manifest.mjs` from `data/script.json` plus the SFX and music tables. Committed so
the game never needs a build step, regenerated whenever the script changes.

```json
{
  "v": 1,
  "generatedFrom": "data/script.json",
  "base": "assets/audio/",
  "sfx": {
    "gun.vickers": { "file": "sfx/gun_vickers.mp3", "gain": 0.8, "variants": 3, "rateLimit": 0.045 },
    "flak.burst":  { "file": "sfx/flak_burst.mp3",  "gain": 1.0, "variants": 4 },
    "crate.chute": { "file": null, "synth": "chuteWhump", "gain": 0.7 },
    "stall.horn":  { "file": null, "synth": "stallHorn",  "gain": 0.9, "loop": true }
  },
  "music": { "patrol": { "file": "music/patrol.mp3", "loop": [4.0, 92.5], "gain": 0.7 } },
  "ambience": { "front-line": { "file": "amb/frontline.mp3", "gain": 0.5, "loop": true } },
  "vo": {
    "flightlead": {
      "file": "vo/flightlead.mp3",
      "sprite": { "a1-04.open": [41.20, 2.35], "a1-20.close": [118.6, 3.10] }
    }
  }
}
```

`"file": null` means synth-or-silence. **Every entry may be absent from disk. The manifest itself may
be absent. The whole `assets/audio/` folder may be absent.** All three are normal states, not errors.

VO takes are split from long recordings with `tools/split_take.py`, **ported from NEONHAUL rather
than reinvented** — the sprite offsets in the manifest come out of it.

---

## 8. Test harness contract

This repo has been burned by tests that mocked the fix and by gates that passed because of a
workaround inside the gate. The rules below are not optional.

### 8.1 `tools/sim.mjs` — headless flight and combat

**Architectural precondition, and it is the reason this works at all: nothing under `js/sim/`,
`js/modes/` or `js/data/` may touch `document`, `window`, `performance`, `Date`,
`requestAnimationFrame`, WebGL, `core/camera.js` or `Math.random`.** The sim modules are pure ES
modules that node imports directly. If a sim module needs a timer it takes one on `ctx`.

**Confirmed explicitly, because agent B's entire balance plan is a fiction about a different game if
it is not true (REQ-B5).** `gates_purity.mjs` asserts, by grep over the module graph, that every one
of these imports nothing from the DOM, WebGL, wall-clock time or the camera:

| module | what it owns |
|---|---|
| `sim/flight.js`, `sim/aero.js`, `sim/physics.js` | the flight model |
| `sim/weapons.js`, `sim/damage.js` | combat resolution |
| `sim/ai.js`, `sim/pilot.js` | AI and the virtual pilot |
| `sim/crates.js` | crate release, canopy, catch and denial |
| `sim/world.js`, `sim/terrain.js`, `sim/spawner.js` | wind, gusts, terrain, spawning |
| `modes/*.js`, `data/tables.js` | economy, rewards, progression |

Anything one of these needs from the outside arrives on `ctx` as a plain value or a pure function.
That is what makes `sim.mjs` measure the shipping game rather than a headless approximation of it.

```
node tools/sim.mjs --level a1-04 --seed 7 --pilot ace --secs 300
node tools/sim.mjs --all --runs 8 --pilot competent --json shots/balance.json
node tools/sim.mjs --duel kitehawk-ii+engine3 vs fokker-d7 --runs 400
node tools/sim.mjs --envelope             # dumps the turn/climb/dive envelope as CSV
node tools/sim.mjs --level a1-04 --seed 7 --zoom 0.78   # forced zoom; the summary MUST NOT change
```

`js/sim/pilot.js` supplies the **virtual pilot** at three skill tiers — `novice`, `competent`, `ace`
— and the *same file* drives the in-game AI. That is the trick that makes 100 levels balanceable:
the thing that plays the game headlessly is the thing that flies the enemies.

Per-run summary, and these field names are the `stat` vocabulary star conditions use (§7.1):

```json
{ "level":"a1-04", "seed":7, "pilot":"competent", "completed":true,
  "time":214.3, "damageTaken":38, "deaths":0, "kills":11,
  "cratesCaught":5, "cratesMissed":1, "shotsFired":842, "hits":97, "accuracy":0.115,
  "ammoLeft":118, "fuelLeft":0.31, "peakG":3.4, "stalls":2, "blackouts":0,
  "timeInBand":{"mud":18.2,"belt":96.1,"floor":22.0,"deck":49.4,"lane":24.9,"blue":3.7},
  "difficulty":0.62 }
```

Invariants asserted **every tick**, and a violation aborts the run with the tick number and state:
no NaN or Infinity anywhere; `0 ≤ speed ≤ Vne × 1.05` (620 wu/s); **`-10000 ≤ y ≤ 400`** — nothing
the player can reach exists above the D28 ceiling; angles finite and wrapped;
entity count never exceeds the pool; under zero throttle and zero pitch input, total energy
(`½v² + g·(-y)`) is monotonically non-increasing; and **the run summary is byte-identical under
`--zoom 0.78` and `--zoom 1.22`** — camera framing is not an input to the sim (§4.3.5).

`--all` runs all 100 levels × N seeds and reports a **difficulty curve**, flagging any level whose
difficulty index is more than 0.18 off the smoothed act curve, and any level a `novice` pilot cannot
finish in 3 of 8 runs while its neighbours can.

### 8.2 CDP headless Chrome — real touch

`tools/cdp.mjs` is the shared client (attach, eval, wait, screenshot, console capture) ported from
Sunderfall's `shot.mjs`. `tools/shot.mjs` captures; `tools/touch.mjs` drives real input via
`Input.dispatchTouchEvent` with `touchStart` / `touchMove` / `touchEnd` and real touchPoint arrays,
so a hold-and-slide is actually a hold-and-slide. Screenshots alone miss interaction bugs.

Two gotchas that are carried over verbatim because rediscovering them costs an hour each:

1. **Headless Chrome clamps the window to a 500 px minimum width and lies about narrow viewports.**
   Use `Emulation.setDeviceMetricsOverride` to get a true 390×844. Never `--window-size`.
2. **`Page.captureScreenshot` hangs forever, with no error, on an animating WebGL canvas under
   `--headless=new` + SwiftShader.** Capture via `canvas.toDataURL`, which requires the page to have
   been created with `preserveDrawingBuffer` — hence `?preserve=1`. Also pass `?dpr=1`: at dpr 2 the
   software rasteriser takes minutes a frame. Both query flags are ported from Sunderfall's
   viewport/renderer and must survive the port.

The game exposes `window.__kh = ctx` and `window.__state` (a flat, JSON-safe snapshot: tick, fps,
frame ms, draw calls, sprites, particles, lights, entity counts, player state, band occupancy, and an
`errors` array). Gates assert on `__state` and on **sampled pixels**, not on a screenshot's vibe.

### 8.3 Gate records

Every `tools/gates_*.mjs` writes exactly one JSON record to `shots/<gate>/_gates.json` and exits
non-zero if any result failed.

```json
{
  "gate": "portrait",
  "at": "2026-08-24T10:22:04.118Z",
  "low": false,
  "headed": false,
  "viewport": { "w": 390, "h": 844, "dpr": 2, "mode": "portrait" },
  "results": [
    {
      "name": "P2 — reaction window on a diving attacker",
      "pass": true,
      "value": 1.47, "threshold": 1.20, "op": ">=", "unit": "s", "n": 200,
      "detail": "median 1.47 s over 200 seeded dives; 5th-pct worst 0.89 s (floor 0.75); camera raised anchorY to 0.72 on 186/200; the 14 that did not are all tail-chase re-entries",
      "artifacts": ["shots/portrait/dive_seed118.png"]
    }
  ],
  "pass": 7, "fail": 0, "skipped": 0,
  "artifacts": ["shots/portrait/turn_circle.png", "shots/portrait/five_bands.png"]
}
```

Rules for gate authors:

- `value`, `threshold`, `op` and `unit` are **required** on any numeric result, so two runs can be
  diffed mechanically and a regression is visible without reading prose.
- **`detail` must carry the raw measurement**, never "ok" or "as expected". The manager reads detail
  lines, not pass counts — a gate that passed because of a workaround inside it has previously hidden
  a third of a map being unreachable in this repo.
- A gate must fail if the thing it tests is reverted. Before landing a gate, revert the fix and
  confirm it goes red. A gate that still passes was never testing the fix.
- Never clamp, floor or special-case a value to make a gate pass. If the number is wrong, the design
  is wrong; change the design and write down what it cost.

### 8.4 Ownership

`tools/gates_*.mjs` are the **manager's files**. Build agents do not write them and do not edit them.
Build agents write `sim.mjs`, `genlevels.mjs` and the debug pages; they report their numbers, and the
manager writes the gate that checks the claim independently.

Standing gates: `gates_purity` (no DOM, no `Math.random`, no `core/camera.js` import anywhere under
`js/sim/`), `gates_boot` (loads, no console error, no request leaves the origin), `gates_render`
(draw calls, `parallaxY` correctness), `gates_flight` (envelope matches §3.4), **`gates_zoom_neutral`**
(§4.3.5 — the same seeded mission at forced zoom 0.78 and 1.22 produces bit-identical summaries),
`gates_zoom_stability` (§4.4 P4b — no pumping), `gates_portrait` (§4.4), `gates_crates`,
`gates_balance` (the 100-level curve), `gates_orientation` (rotate 20× mid-flight), `gates_perf`
(§9), **`gates_vo`** (agent D's V1–V4: every `data/script.json` line has `text`; no `kind:"radio"`
line exceeds 44 characters; card durations are text-derived; and **V3 renames `assets/audio/` out of
the way and replays a full mission** — a `?noaudio` flag would only ever prove that the flag works).

---

## 9. Performance budgets

### 9.1 Targets

60 fps at **390×844 css, dpr 2** (780×1688 = 1.32 Mpx) on a 2021 mid-range Android — Snapdragon 720G
class — and on a 2019 MacBook Air. Test at 390×844 portrait, 844×390 landscape phone and 1440×810
landscape desktop before claiming anything works.

### 9.2 Budget

| | budget | note |
|---|---|---|
| frame | 16.7 ms | sim 2.5 / sprite build 2.0 / GPU sprites 4.5 / lights 1.5 / post 3.0 / headroom 3.2 |
| **`R.stats.drawCalls`** | **≤ 26 typical, ≤ 34 peak** | content only. 14 layers × 2 blends is the ceiling; a normal frame uses 7–9 layers with 1–2 atlases each |
| fixed fullscreen passes | ~18 | light accum 1 + light blur 4 + bright 1 + down 2 + blur 6 + up 2 + rays 1 + composite 1. Not in `drawCalls`. This is why the low preset attacks the post chain first |
| sprites | ≤ 4,000 typical, ≤ 9,000 peak | Sunderfall sustained 11,430 |
| particles live | ≤ 6,000 typical, cap **12,000** | 12k × 24 Float32Arrays ≈ 1.15 MB, allocated once |
| lights | ≤ 24 | `P.glowBudget = 24`; the light buffer is half-res and blurred twice |
| triangles | ≤ 3,000 | gradients and terrain silhouette |
| texture memory | ≤ 96 MB | atlases 2048² max, no mips on atlases |
| total payload | ≤ 10 MB | sky and cloud atlases ≤ 5 MB of it. Parallax layers are the budget hogs — size them honestly |
| allocation in the hot loop | **zero** | pool aircraft, bullets, crates, canopies, debris, ribbons, damage numbers. `R.screenOf` returns a shared object — copy it if you keep it |

The lighting fetch is per-fragment on every sprite, so a full-screen sky band still samples the light
buffer even at `shade: 0.10`. Cap simultaneous full-screen sky bands at **5**.

### 9.3 Low-detail preset

One switch: `quality.low`, from `?low=1`, `save.settings.lowDetail`, or `quality.auto()` when the
mean frame exceeds 22 ms over 3 s. It never flips back up automatically — a stutter loop is worse
than a slightly ugly frame.

| | high | low |
|---|---|---|
| dpr cap | 2.0 | 1.25 |
| `lights.blurPasses` / `lightScale` | 2 / 2 | 1 / 3 |
| `fx.bloom` | 0.85 | 0.45, deepest mip skipped |
| god rays, grain | on | off |
| particle cap | 12,000 | 4,000 |
| `CLOUD_MID` layer | on | skipped |
| cloud sprite count | 100% | 50% |
| ribbon segments | 100% | 50% |

Every one of these reads `quality.low` in **one** place in its own system, on `quality:change`. An
inline `if (low)` scattered through a draw path is a bug — it is how a preset silently stops
applying.

---

## 10. Anti-footguns — rules, with the reason

1. **Nothing from a CDN. Ever.** A CDN import has silently hung every other 3D game in this repo with
   zero console errors — the page just never boots and nothing tells you why. Vendor everything into
   `vendor/`. `gates_boot` asserts that no network request leaves the origin.
2. **No `alert`, `confirm`, `prompt` or blocking modal.** In-page popups and callouts only. Aaron
   hates modals, and a modal that opens under a thumb also eats the `pointerup` and permanently
   deadens an action (§2.2). Errors surface as a dismissible in-page callout plus a console line.
3. **Audio is optional.** The game must be fully playable and correct with `assets/audio/` **renamed
   away**, not flagged off — a flag only proves the flag works. Every line has a text card, authored
   first in `data/script.json`, and **the card's duration comes from the text, never from the audio**
   (§7.5): ask the file how long to show the card and a missing file gives you a 0 ms card that no
   boot test will catch. `gates_vo` V3 runs the real mission with the folder moved.
   Asset generation never blocks a milestone.
4. **Never clamp a value to make a gate pass.** If a gate is red, either the design is wrong or the
   gate is wrong. Fix the one that is wrong, and write down what it cost in HANDOFF. A gate that
   passes because of a workaround inside the gate has hidden a third of a map being unreachable in
   this repo before.
5. **A test that still passes after you revert the fix was never testing the fix.** Revert it, watch
   it go red, put it back.
6. **+Y is DOWN.** Gravity is positive, climbing decreases `y`, altitude is `-y`. Say it out loud
   before writing gravity, lift, a climb, a dive or a camera clamp.
7. **`Math.random()` is banned in `js/sim/`, `js/modes/` and `data/`.** It breaks the headless sim's
   reproducibility and makes the daily challenge unfair. Fork an `rng` stream per system.
8. **Never read wall-clock time inside `update(dt)`.** `dt` is always exactly `DT = 1/60`. Real time
   belongs to `render(alpha, dtReal)` and to `R.tick(dtReal)`.
9. **No allocation in the hot loop.** Pool everything. `R.screenOf()` and `view.toWorld()` return
   shared objects — copy the values if you keep them past the current statement.
10. **Only touch files you own** (§5.1). Other agents are editing this repo concurrently, and other
    Claude sessions have uncommitted work in it.
11. **Agents do not run git.** Not `add`, not `commit`, not `status -s` as a basis for staging. Say
    what you changed; the manager stages and commits.
12. **Comments are sparse.** Explain *why*, never *what*. No comment headers on obvious things. A
    comment earns its place by recording a trap, not by narrating the next line.
13. **No placeholder art in a "done" deliverable.** A grey box is not a deliverable.
14. **Write your section of `docs/HANDOFF.md` before you stop.** You are not resumable; the handoff is
    the only thing that survives you. Record what you built, the public API, what is stubbed, what
    you would do next, and every gotcha. Assume the reader has none of your context.
15. **Do not change this file.** Objections go in HANDOFF as an **OBJECTION**; needs from another
    agent's module go in as a **REQUEST**. The manager reconciles.
16. **Flight constants are authored in SI and derived into world units, never the reverse** (D26).
    Write the metres, the m/s or the m/s² down first, divide by 0.15, put both in the table. This
    document once did the reverse — a world-unit scale was chosen to make an altitude figure read
    tidily, and it silently made this project's own stall speed 268 m/s and its gravity 1512 m/s².
    A wu number with no SI number beside it is unreviewable, which is exactly how it survived a
    full pass. **Cross-check every derived constant against a physical identity before trusting it**
    — `v_term = √(g/k)` caught the gravity error here.
17. **Zoom changes the view only, never the sim.** The auto-fire cone's range and angle, every
    weapon range, turn rates, AI awareness radii, spawn distances and collision are world units and
    are **identical at every zoom**. Nothing under `js/sim/` imports `core/camera.js` or reads
    `cam.zoom`. The moment a sim value is derived from the camera, zoom stops being a camera
    decision and becomes a silent, invisible, unbalanceable difficulty modifier that no gate written
    against a single zoom level will ever catch. `gates_zoom_neutral` asserts it by behaviour, not
    by inspection.
18. **Never grow the framing box to fit something that cannot fit.** A zeppelin is 1400 wu (210 m); if
    it enters the framing box whole, the zoom solver pins to the floor for the entire fight and the
    game reads as a map. Bosses contribute their engaged section only (§4.3.1). Framing members are
    re-asserted every tick so a stale one cannot leak.

---

## 11. Deferred decisions — named decider, named moment

Nothing here is "TBD". Each has an owner and a trigger.

| decision | decided by | when |
|---|---|---|
| Portrait vs landscape-primary | the §4.4 gate; Aaron regardless, per D15 — it changes the game he asked for | end of the flight-model phase |
| Textured-triangle stream `R.mesh` for deforming silk | manager, on agent E's HANDOFF report | only if the 6-segment canopy strip shows seams at 2× zoom |
| Re-porting Sunderfall's synthesised audio bank | manager | after the story/audio agent reports how far the thin facade got |
| Exact band edge altitudes inside the 10,000 wu / 1,500 m column (D28) | **agent B**, keeping the four constraints in §3.3 (no band < 700 wu; three lowest ≤ 3,000 wu; Deck ≥ 1,300 wu; total = 10,000 wu). The count and names are fixed by D19 | before the world agent generates levels |
| Exact enemy roster and per-band population | agent B, within the §3.4 envelope | design phase |
| Whether the sesquiplane is the act-4 or act-5 unlock | agent B | design phase |
| Widening the auto zoom clamp below `zoomWide` 0.78 | manager, on the §4.4 P0 measurement | only if the p90 framing box lands between 503 and 585 wu — the fallback floor is 0.68, and below 0.671 no zoom is legible at all |
| Whether `gfx/parts.js` needs a fourth tone | agent R, on blind-critic scores | after the first painterly pass; three tones ship first |
| Per-act ramp LUT authoring (who draws the 256×1 strips) | agent R | before act 2 art begins; act 1 ships with one |
| Name is ratified (D13) — no longer deferred | — | done |
| Whether a mission spans the whole ladder or a 2–3 band slice | **agent B** — a full ground-to-ceiling climb is now **107 s**, most of a 131 s mission, so this is a real design question the D26 correction created | before level generation |
| Whether P4's "≥3 bands at establish" means a crane or a static frame | **manager** — A implemented it as a crane because a static frame cannot contain three bands at any legible zoom; if a static frame was intended the criterion is unpassable | before the flight-phase gate runs |
| The agility factor `A = 2.8` | agent B may retune within §3.5's bounds; below `A ≈ 2.67` the combat turn stops fitting portrait at zoom 1 | flight phase |
