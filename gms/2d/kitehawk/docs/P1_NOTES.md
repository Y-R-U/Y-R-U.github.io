# P1 — engine port A: renderer, shaders, `parts.js`

Written by the P1 build agent. Everything here was measured, not estimated; the reproduce command
for each number is at the bottom.

---

## 1. What landed

```
index.html                              40 lines   new
css/game.css                            78 lines   new
js/gfx/renderer.js                     780 lines   ported, 365 lines changed
js/gfx/shaders/sprite.js               179 lines   ported, 55 lines changed  (changes 2, 6, 7)
js/gfx/shaders/light.js                 68 lines   ported, 6 lines changed   (change 2)
js/gfx/shaders/gl.js                   102 lines   ported VERBATIM
js/gfx/shaders/post.js                 203 lines   ported VERBATIM
js/gfx/lights.js                       134 lines   ported, 10 lines changed  (change 2)
js/gfx/particles.js                    189 lines   ported, 6 lines changed   (CAP, glowBudget, parallaxY arg)
js/gfx/postfx.js                       323 lines   ported, 21 lines changed  (fx.gLoad)
js/gfx/texture.js                      377 lines   ported + makePaper() and makeRamp()
js/gfx/parts.js                        374 lines   NEW
js/gfx/gmath.js                         44 lines   NEW — see §5
tools/pages/{boot,parallax,parts}.html + harness.js   694 lines   debug pages
vendor/                                            empty by design — nothing third-party is used
```

No string `sunderfall` survives anywhere in the output. No file outside the P1 ownership list was
touched. No git command was run.

---

## 2. The nine changes, one by one

**Change 1 — fit-to-height.** `R.resize(w, h, dpr, worldH)` stores the base world height; `begin()`
computes `scale = (ph / worldH) * zoom`. `R.worldW` is a derived getter (`pw / scale`) and there is
no `setWorldWidth` any more — it is `setWorldHeight`. `R.worldH` returns the **visible** world height
(`worldH / zoom`), matching `R.worldW`'s meaning; the base value P2 passed in is `R.worldHBase`. That
distinction is not in ARCHITECTURE §6.1 and P2 will need it, because `resize()` takes the base and
`worldH` reads back the visible one.

**Change 2 — `parallaxY` as a world-space camera offset.** Instance float 15 repurposed, **stride
stays 16**. `SPRITE_VS` now reads `px = (world - u_cam * vec2(i_rotPar.y, i_misc.y)) * u_scale`.
`TRI_STRIDE` 7 → 8 (`a_parallax` is a `vec2`), `lights.js` `STRIDE` 10 → 12 (attribute 3 `vec2` →
`vec4` = squash, angle, parallaxY, 0). `visible()` takes both factors and uses `parallaxY` on Y.
Every public draw call accepts `parallax` and `parallaxY`, each defaulting to the layer config.

**ARCHITECTURE §2.4 change 2 claims R3 is satisfied by construction — confirmed.** The ported
`SPRITE_VS` line 28 was already `px = (world - u_cam * i_rotPar.y) * u_scale`: the parallax factor
scales the *camera position* and `u_scale` (which carries the zoom) is applied uniformly afterwards.
Making the factor a `vec2` did not change that property. Measured proof and a falsification are in
§4 (R3).

**Change 3 — the 14-layer table**, exactly as §2.4 lists it, with A's starting
shade/response/haze/parallax/parallaxY. The comment that render layers are depth and altitude bands
are something else is kept at the top of `renderer.js`.

**Change 4 — `R.skyBand()` and `R.gradient()`.** `skyBand` tiles in X, stretches to `[y0, y1]`, and
honours its own `parallaxY`. `gradient` is two per-vertex-coloured triangles on the existing tri
stream, spanning the visible width at that layer's parallax unless `opts.x0/x1` are given.
`backdrop()` is unchanged and keeps the Rorschach-axis warning about `mirror`.

**Change 5 / 9 — `R.ribbon()`.** *(ARCHITECTURE numbers this 5 in §2.3 and 9 in §2.4; there is no
change 5 in §2.4. They are the same change and only eight renderer changes are actually specified —
the ninth item is `gfx/parts.js`. No impact, recorded so nobody hunts for a missing change.)* A loop
over the existing `line()` path with per-segment width averaging and an alpha taper. No new stream,
no new shader, batches into the same chunk. Accepts flat `[x,y,…]` or `[{x,y},…]` and a scalar or
per-point width array.

**Change 6 — the ramp-map sampler.** `sampler2D u_ramp` on unit 9, `u_rampAmt` per layer, one fetch
in `SPRITE_FS` **and** `TRI_FS`. Order is exactly sRGB→linear, `u_mul`, ramp, grain, haze, lighting.
`R.setRamp(tex)`, `rampAmt` in `R.setLayer()`. `rampAmt` starts at **0 on every layer** — a gradient
map with no LUT bound would map the world to white, so the art phase opts each layer in.

> **One deliberate deviation from the §2.4 snippet.** The snippet mixes the raw LUT texel into the
> linear value. Every other texture in this renderer is treated as display-space and squared into
> linear (`c.rgb * c.rgb`), and a LUT authored as a 256×1 PNG is display-space too, so the shipped
> code squares it: `lin = mix(lin, rc * rc, u_rampAmt)`. Without the square a ramped layer sits
> visibly brighter than an unramped one and the "keep the colour handling" instruction in §2.6 is
> broken. **The art phase should author ramp LUTs as ordinary sRGB strips.**

**Change 7 — screen-space paper grain.** `sampler2D u_grain` on unit 10, sampled by
`gl_FragCoord.xy * u_grainScale`, in `SPRITE_FS` and `TRI_FS` (the tri path is required — `parts.js`
draws there, and the grain over code actors is the whole point). Per-layer `grainAmt` multiplied by
a global from `R.setGrain(tex, scale, amount)`; global default **0.15**, and it is forced to zero
when no grain texture is bound. The **additive** pass takes a third of the grain: a glow with a full
paper tooth chewed out of it reads as dirt on the lens.

**Change 8 — `R.skyRamp(y0, y1, rampTex, layer, opts)`.** One quad spanning the whole column in
world space, rotated **−90°** so the quad's local x axis (which carries the `u` interpolant) lands on
world −Y: `u = 0` at `y0`, `u = 1` at `y1`. Because `u` is a vertex attribute the LUT is sampled per
fragment from world Y and is zoom-proof for free, and the rotation is what lets the **same 256×1
LUT** serve both this and the gradient-map sampler — a vertical 1×256 strip would have needed a
second texture format. Measured at 0/255 delta across the zoom range (§4, R4).

**Change 10 / `fx.gLoad(amount)`.** Wraps `vignetteAmt` + `saturation` + `flash`, no shader change.
Signed rather than 0..1: positive is greyout, negative is redout. `fx.gLoadRebase()` captures the
scene's own vignette/saturation as the zero point and must be called once per scene after those are
set, or gLoad(0) will snap the scene back to the renderer defaults.

**`gfx/parts.js`** — see §3.

**Kept untouched, as instructed:** `MAX_TEX_PER_CHUNK = 8`, the instance re-basing in
`pointQuadStream()`, `visible()`'s rotated-extent culling, `c.rgb * c.rgb`, lights squaring on the
way in, and the clear colour squared in `end()`. `particles.js` got exactly the two specified edits
(`CAP` 20000 → 12000, `glowBudget` 40 → 24) plus one argument on its `spriteRaw` call for the new
`parallaxY`.

---

## 3. `gfx/parts.js`

```js
const rig = createRig(def);
rig.setAngle(id, radians)   rig.pose(name, t)   rig.getAngle(id)
rig.setHidden(id, bool)     rig.setColor(id, rgb)   rig.setSide(id, 'near'|'far')
rig.get(id)                 rig.triBudget()
R.drawRig(rig, x, y, rot, scale, lights, layer, opts)
```

`def.parts[]`: `{ id, parent, x, y, angle, poly, normal, color, side, z, alpha, jitter, jitterRel,
edge, tones, hidden }`. `def`: `{ tones, terminator, jitter, jitterRel, edge, edgeDark, maxEdges,
parts, poses }`. Parents are resolved and topologically ordered at build; draw order is fixed at
build from `z` (sorting a part tree every frame both allocates and flickers when two parts tie).

`lights` is a plain list, **not** the renderer's light buffer — it only chooses the tone. Entries are
either `{ dx, dy, intensity, r, g, b }` (a unit direction pointing *toward* the light — the sun) or
`{ x, y, radius, intensity, r, g, b }` (a world point light with an inverse-square-ish falloff). They
are summed into one direction and colour per part, from the part's own world centroid, so a burning
engine really does relight the parts near it. `opts.keyDir` is the fallback when the list is empty.

The four features:

1. **Three tones, hard terminator.** `nl = dot(worldNormal, lightDir)` picks `lit` above
   `terminator.hi`, `shadow` below `terminator.lo`, `mid` between. No smoothstep anywhere — a ramp
   reads as a 3D render.
2. **Stable jitter.** Offsets are hashed from `(hashStr(partId), vertexIndex)` once at `createRig`
   and never recomputed. Measured at **0 px** deviation and a bit-identical framebuffer over 120
   frames.
3. **Loaded shadow edge.** For each edge whose outward normal faces away from the light
   (`dot < −0.08`), a thickened dark quad inset from that edge, capped at `maxEdges` per part.
   The two ends use **different** widths from two different hashes, so the stroke tapers — a
   constant-width stroke is a pen, not a brush.
4. **Grain** is the renderer's, over the whole layer.

`opts.features = { tones, jitter, edge }` disables any of them individually; that is what the
five-way comparison on `parts.html` drives, and it is also how P16 can A/B a feature.

### The jitter finding, which matters to P16

Absolute jitter is the wrong control and the default is now **relative**: `jitterRel` (default
`0.045`) scales by the **geometric mean** of the part's extents, not the diagonal. Scaling by the
diagonal puts a 3-unit ripple in a 5-unit wing chord; an absolute amplitude that reads on a 30-unit
wing is a deformity on a 5-unit strut.

**And it is a close-up feature, unavoidably.** At combat framing the hull is 64 wu on an 844 px
column of 1,000 wu, i.e. ~54 px, so a jitter big enough to see (±2 px) would be ~2.4 wu — half the
chord of a wing. The honest statement is: vertex jitter earns its keep at `zoom ≥ 1.1`, in the
hangar, and in story beats, which is exactly where `ART.md` §4's close-detail tier lives. The
features carrying the painted read *during a fight* are the three tones, the loaded edge and the
grain.

---

## 4. Measured numbers

Every figure below is from headless Chrome with a **real GPU** (`--use-angle=metal --enable-gpu`,
`ANGLE Metal Renderer: Apple M5`), not SwiftShader. **An M5 is nothing like the Snapdragon 720G in
`ARCHITECTURE.md` §9.1** — 60 fps here is necessary, not sufficient, and the real budget check
belongs to P17 on hardware.

### R1 — draw calls and frame rate, 5,000 sprites across 8 layers

| configuration | sprites | drawCalls | fps |
|---|---|---|---|
| 390×844 dpr 1, 8 layers, 4 textures interleaved, 1 additive | 5,000 | **9** | 60.0 |
| 390×844 dpr 1, no additive stream | 5,000 | **8** | 60.0 |
| 390×844 **dpr 2** | 5,000 | 9 | 57.4–60.0 |
| 844×390 dpr 2 (landscape phone) | 5,000 | 9 | 60.0 |
| 1440×810 dpr 1 (desktop) | 5,000 | 9 | 60.0 |
| 390×844 dpr 1, **9,000 sprites** (§9.2 peak) | 9,000 | 9 | 60.0 |
| 390×844 dpr 1, 12 layers, 3 additive | 5,000 | 15 | 60.0 |

Eight populated layers with four textures interleaved freely cost **exactly one draw call per layer**
— the chunking claim in §2.2 holds after the port. Every additive stream is one more. `≤ 12` is met
with a real frame shape; 14 layers × 2 blends = 28 remains the ceiling, inside §9.2's `≤ 34` peak.
Sprite count does not move the draw call count at all: 9,000 sprites is still 9 draws.

### R2 — `parallaxY`, both axes measured independently

Layer at `parallax 0.20 / parallaxY 0.90`. The marker's position is read back **out of the
framebuffer** and its world position re-derived by inverting the shader, so the test runs through the
real pipeline rather than re-deriving the same arithmetic in JS.

| | measured | expected |
|---|---|---|
| camera +4,000 wu in **X** → band moves | **802.20 wu** | 800 ± 8 |
| camera +4,000 wu in **Y** → band moves | **3,599.40 wu** | 3,600 ± 8 |
| X pan → Y drift | **0.00 wu** | 0 |
| Y pan → X drift | **0.00 wu** | 0 |

### R3 — parallax is a camera offset, not a scroll multiplier

Same band sampled at zoom 0.78 and 1.22; the recovered world position must agree.

| implementation | R2 X | R3 world drift dx / dy |
|---|---|---|
| **shipped** (world-space camera offset) | 802.20 wu | **0.662 / 0.706 wu** — pass (< 2) |
| control (forbidden screen-space shortcut) | 802.20 wu — *identical* | **53.6 / 164.3 wu** — fails by 27× and 82× |

`tools/pages/parallax.html?impl=screen` renders the shortcut version permanently, so this
falsification can be re-run at any time. Note that the shortcut passes R2 *exactly*: R2 alone cannot
catch it, which is precisely why R3 exists.

### R4 — `skyRamp` is per fragment from world Y

| world Y | zoom 0.78 | zoom 1.22 |
|---|---|---|
| −400 | row 442.4, rgb 188,178,149 | row 410.0, rgb 188,178,149 |
| −800 | row 368.1, rgb 185,178,157 | row 293.8, rgb 185,178,157 |
| −1200 | row 293.9, rgb 183,178,164 | row 177.6, rgb 183,178,164 |

**Worst channel delta across zooms: 0/255.** Complement, so the test is not vacuous: a *fixed screen
row* does change colour with zoom (181,179,168 → 183,178,162 → 184,178,159 at zoom 0.78 / 1.0 / 1.22),
which is the signature of world-Y evaluation. A per-frame-from-camera-Y implementation would show the
exact inverse.

### R5 — ramp order

Flat sprite under one additive light, sampled at the light's centre, converted back to linear scene
space (with `flatGrade` the composite reduces exactly to `sqrt(aces(scene))`).

| | gain at rampAmt 0 | gain at rampAmt 1 | change |
|---|---|---|---|
| **shipped** (ramp before lighting) | 4.624 / 2.387 / 1.420 | 4.557 / 2.376 / 1.419 | **1.46% / 0.48% / 0.07%** |
| control (ramp moved after lighting) | 4.624 / 2.387 / 1.420 | 1.764 / 1.723 / 1.168 | **61.9% / 27.8% / 17.7%** |

The residual on the shipped path is 8-bit quantisation at the sampled brightness, i.e. ≤ 1 LSB. The
albedo genuinely changed underneath (linear 0.0902 grey → 0.0732 / 0.0516 / 0.0516 tinted), so the
invariance is not because the ramp did nothing.

> The criterion in the gate table says "the light contribution is unchanged … within 3/255". Taken
> literally as an *absolute* difference that is not the right invariant: with the ramp before
> lighting the light term multiplies the ramped albedo, so the absolute contribution *must* move
> when the albedo does. The quantity that is invariant, and that distinguishes the two orders, is the
> **ratio** lit/unlit. The table above reports the ratio. Manager may want to reword the gate.

### R6 — grain is screen-space

- Camera panned 2,000 wu with the rig pinned to the same screen position: cross-correlation peak
  shift **0 px**, mean absolute difference 0.28% (float precision at world x ≈ 2,000). A world-locked
  grain would have shifted the pattern 2,000 px.
- Complement: the rig moved 41 px on screen with the camera still — the crop differs **0.88%** with
  grain and **0.16%** without, i.e. the tooth stayed on the screen instead of travelling with the
  object.

### R7 — the four painterly features

Rig bbox 269×159 px; the rig actually paints **57.8%** of that rectangle (a bounding box round a
biplane is mostly sky — the gaps between the wings and around the tail).

| feature disabled | over the bbox | over the rig's own footprint |
|---|---|---|
| three-tone shading | 6.89% | **11.92%** |
| stable vertex jitter | 2.61% | **4.52%** |
| loaded shadow edge | 4.09% | **7.08%** |
| screen-space paper grain | 2.74% | **4.74%** |
| *[control] identical redraw* | 0.0000% | — |

All four clear 4% over the footprint. **Two of them do not clear it over the raw bounding rectangle**,
and I do not think that is a defect in the features — a bbox mixes the rig with 42% background, so it
divides every feature that only modulates painted pixels by 0.578. Jitter and grain are exactly those
features. `__parts.coverage()` returns the fraction so a gate can normalise; recommend the gate
measure over the footprint, or drop the bbox threshold to 2%.

I did **not** raise the jitter or grain defaults to clear the bbox threshold. The values shipped are
the ones that look right (see `shots/p1/parts_five_way.png`), and inflating them to pass a gate is
the anti-footgun in `ARCHITECTURE.md` §10 rule 4.

### R8 — jitter stability

62 rig vertices, 120 consecutive frames at the same pose: **max screen deviation 0 px**, and the
framebuffer hash of the rig bbox changed **0 / 120** times. Bit-identical.

### R9 — no CDN

`Network.requestWillBeSent` over a full page load: 13 requests, **all** to the page's own origin.
No `http://`, `cdn`, `unpkg`, `jsdelivr`, `esm.sh` or `skypack` string exists in `index.html`,
`css/`, `js/gfx/**` or `tools/pages/**`. `vendor/` is empty because nothing third-party is used.

### R10 — budget

- **Instance stride is still 16 floats.** `TRI_STRIDE` is 8, `lights.js` `STRIDE` is 12.
- One **14-part rig**: worst case **90** triangles, **84** actually drawn, in **1 draw call**.
  The worst case is `Σ(nv − 2) + maxEdges × 2` per part; `rig.triBudget()` returns it, so a rig
  author can check before shipping a definition.

### API smoke test

Every method on the frozen §6.1/§6.2/§6.3 surface was called in one frame — 33 call sites including
both `poly` point formats, both `ribbon` point formats, sub-rect and flipped sprites, tiled and
untiled `backdrop`/`skyBand`, `skyRamp` with and without an explicit LUT, `light` with every optional
field, all of `R.fx`, and a `createRig`/`pose`/`drawRig` round trip. **Zero exceptions, zero console
output, zero off-origin requests.**

---

## 5. What P2 must know

1. **`js/gfx/gmath.js` is new and deliberate.** `postfx.js` and `lights.js` needed `fbm1`/`clamp01`
   from `core/math.js`, which is P2's file and which P1 is forbidden to create. `gfx/` therefore
   carries its own copy of `clamp01`, `noise1`, `fbm1`, `hash2` and `hashStr`. **P2 should still
   write `core/math.js` with the same functions for everyone else** — `gfx/` is frozen after P2 and
   should not break when a shared maths file is retuned. The two copies are byte-identical in
   behaviour to Sunderfall's originals; if P2 would rather have one copy, say so and the manager can
   collapse them, but the duplication is 30 lines and it makes `gfx/` self-contained.
2. **`resize(w, h, dpr, worldH)` takes the BASE world height.** Read it back as `R.worldHBase`.
   `R.worldH` is the *visible* height at the current zoom, to match `R.worldW`.
3. `R.setWorldWidth` is gone. It is `R.setWorldHeight(h)`.
4. **`viewport.js` must set `view.worldH` from the `VIEW_PROFILE` table and pass it to `resize`.**
   The renderer has no idea what a view profile is and `worldH` defaults to 1,000 wu (R-06's figure).
5. **Every draw call now takes `parallaxY`.** `spriteRaw`'s signature grew one trailing argument
   (`…, layer, add, parallax, parallaxY`); it defaults to `parallax` when omitted, so existing call
   shapes still work, but the camera module should pass both.
6. `R.fx.gLoadRebase()` must be called once per scene after the scene sets its own `vignetteAmt` and
   `saturation`, or `gLoad(0)` will reset those to the renderer defaults (0.55 / 1.06).
7. `#safe-probe` exists in `index.html` and is styled with the four `env(safe-area-inset-*)` paddings
   — that is what `viewport.js` measures. `index.html` currently dynamic-imports `./js/main.js` and
   shows an in-page callout when it is absent; P10 supplies `boot()`.
8. **The debug pages construct the renderer inline and import nothing from `js/core/`.** They are not
   a specification of P2's API and should not be treated as one.

---

## 6. Things the manager should decide

**REQUEST-1 — `R.mesh` (textured triangles) for the parachute canopy: NOT needed yet, and I did not
build it.** ARCHITECTURE §2.3's plan — a 6-segment strip of rotated sprite quads out of a canopy
atlas — works with the shipped renderer as-is, and `R.ribbon()` covers the shroud lines. `parts.js`
can already draw the canopy as a shaded polygon strip with the three-tone treatment if the art phase
prefers procedural silk to a painted atlas. The seam question in §11 cannot be answered until there
is a canopy atlas to look at, i.e. after P3. **Recommend the decision stay deferred to P16's first
canopy at 2× zoom.**

**REQUEST-2 — the world-space brushwork term (`ART.md` §4's two-grain rule) has no home in the frozen
API.** `R.setGrain` is the screen-locked tooth only. The second, world-locked stroke-direction term
that fades in above zoom 1.10 would need either a third sampler and a world-UV varying (a shader
change to a frozen file) or, cheaper and with no engine change, the art phase drawing a brushwork
overlay sprite per part on `ACTORS` at low alpha. **Recommend the sprite route**; flagging it now so
it is not discovered at P16 as a renderer change.

**REQUEST-3 — the gate wording for R5 and R7.** R5's "unchanged within 3/255" is not the invariant
that separates the two ramp orders (see §4, R5); the ratio is. R7's "over the rig's bbox" divides
every footprint-local feature by the rig's coverage of its own bounding rectangle (0.578 here). Both
are measurable as written; both would pass or fail the wrong things at the margin.

**OBJECTION — none.** Nothing in the P1 brief turned out to be wrong or impossible. The only
substantive deviation is the sRGB square on the ramp LUT (§2, change 6), and the reason is that the
alternative breaks the colour handling §2.6 explicitly says not to break.

**Noted for the art phase (P3/P16), not blocking:**

- `SKY` ships with `haze 0.70`. A `skyRamp` drawn on `SKY` is therefore 70% washed toward the haze
  colour before it ever reaches the light buffer. That is A's number and it may well be right for
  cloud sprites on that layer, but the sky gradient itself probably wants its own haze. Retune at P3
  and record it.
- `rampAmt` is 0 on every layer. Turning it on for the shared painted layers (`CLOUD_*`, `HORIZON`,
  `GROUND_*`) is P3's job, and LUTs are authored as ordinary sRGB 256×1 strips.
- `makePaper()` and `makeRamp()` in `texture.js` are runtime stand-ins in the same class as
  `makeBlob`/`makeDisc`/`makeStreak`, so the debug pages have a real tooth and a real LUT to work
  with. P3 replaces them with the painted plate and the per-act strips; `setGrain`/`setRamp` take
  either.
- The 14-part rig on `parts.html` is a throwaway built to exercise the module. It is not a rig
  definition and P16 should not inherit it.

---

## 7. Reproducing the numbers

```
python3 -m http.server 8731            # from the kitehawk root
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9331 --user-data-dir=/tmp/kh-gpu \
  --no-first-run --use-angle=metal --enable-gpu about:blank
```

Then, by hand in a browser or over CDP:

| page | what it shows |
|---|---|
| `tools/pages/boot.html?n=5000&layers=8&add=1` | R1. `window.__boot.stats`, `.fps()` |
| `tools/pages/boot.html?mode=ramp` | R5. `__boot.setRamp(0\|1)`, `__boot.setLight(bool)`, `__boot.probe(x,y)` |
| `tools/pages/parallax.html?mode=band` | R2/R3. `__px.setCam`, `__px.setMark`, `__px.measure()` |
| `tools/pages/parallax.html?mode=band&impl=screen` | the forbidden shortcut, for falsifying R3 |
| `tools/pages/parallax.html?mode=sky` | R4. `__px.sampleWorldY(y)` |
| `tools/pages/parts.html` | the five-way comparison, side by side |
| `tools/pages/parts.html?grid=0` | R6/R7/R8/R10. `__parts.shot`, `.diff`, `.coverage`, `.grainShift`, `.grainScreenLock`, `.vertexScreen`, `.hashCrop` |

Captures: `shots/p1/parts_five_way.png` (all on, then each of the four disabled),
`shots/p1/parts_solo.png`, `shots/p1/skyramp.png`.
