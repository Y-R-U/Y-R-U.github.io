# NEONHAUL — build plan review

Reviewer pass over `BUILD_PLAN.md` (2,542 lines) against `MANAGER_BRIEF.md` and `DECISIONS.md`,
before eleven build agents execute it. Claims were verified rather than trusted: Three.js version
and API names against the pinned release and the 68 sibling games, the reference plates by opening
them individually at full size, `regen_helper.py` function signatures by reading the source,
`forge/tools/compare.mjs` by reading the tool the plan says to port, and every piece of arithmetic
in §3.8, §3.11, §6.2, §7.4 and §11.4 by recomputation.

---

## 1. Verdict

**Ready after listed fixes.**

The document is unusually good. Its architecture is sound, its taste is right, it has read the
reference plates properly, and most of its arithmetic checks out. It is not a plan that needs
rework — the structure, module split, LOD scheme, atlas strategy and phase shape should all
survive intact.

But it cannot go to P0 as written, for three separate reasons:

1. **It predates three manager decisions and contradicts them** (city generation, client count,
   police/heat). Per decision 7 a builder must be able to execute from named sections alone; a
   builder handed §7.4 today will build a heat system the manager has cut.
2. **The economy is net-negative** — as specced, a delivery pays less than the fuel it burns, and
   the plan's own two payment numbers differ by 5×.
3. **Four rendering techniques do not work as written** — the per-instance window UV tiling, the
   tone-mapping path through the composer, the mirrored reflection group's face winding and depth
   order, and the fog/LOD interlock above 260 m.

None of these is a rewrite. They are surgical edits to a document that is otherwise ready. But
issues B1–B3 must be fixed by the manager/architect *before* P0's brief goes out, not by the
builder who trips over them.

---

## 2. Blocking issues

Ordered by severity. Each is tagged with the phase it blocks.

---

### B1 — The plan contradicts three settled decisions · blocks P0 (document), P2, P7, P9

**What is wrong.** `BUILD_PLAN.md` was written before `DECISIONS.md` and was never reconciled.
Three decisions are actively contradicted, and §15 still poses all six as open questions.

| Decision | Plan says | Where |
|---|---|---|
| **3. Seeded-infinite PLUS an authored core** | "The city is unbounded and deterministic. There is no world edge and **no map file**." No landmarks, no keep-out, no `data/landmarks.json` in the §2.1 file tree. §15.3 still asks the manager to choose. | §3.1, §2.1, §15.3 |
| **4. 16 clients for first playable** | 24 clients, four times (`data/clients.json` "24 client records", §9.1 table, §9.5, P9 done-criteria "24 clients generated", §15.4). | §9, P9 |
| **6. Police ambient only, no heat** | A full heat system: heat 0–4, decay, `patrol` tails at heat 3 and **impounds a parcel**, `HOT` zones "raise heat", `chase` music at heat ≥ 3, chatter weight ×4 at heat ≥ 2, `heat` in `__state`, a heat pip row on the right holo panel, the `TAIL` chip, a silent-running upgrade whose only function is halving heat gain. | §2.2, §2.7, §7.1, §7.4, §8.3, §8.7, §10.3, §10.4, §15.6 |

**Why it matters.** Decision 7 makes the plan the contract. A P2 builder reading §3.1 will build a
purely seeded city with no keep-out and no landmark hook, and adding an authored core afterwards
means reworking chunk generation, zone placement and the minimap. A P7 builder reading §7.4 will
build heat, pursuit and impound — a day of work the manager has already cut — and the `HOT` zone
type, the `silent running` upgrade and the `nocturne` hull's entire selling point go with it.

**Fix.**
- **§3.1**: add a subsection for the authored core — `data/landmarks.json` (id, chunk coords,
  prototype, scale, signage region ids, palette override), a `landmarkAt(cx,cz)` lookup consulted
  *before* the seeded field, and a keep-out rule ("a chunk containing a landmark generates
  `density × 0.4` and no building within `landmark.radius`"). Add `data/landmarks.json` and
  `data/names.json` to the §2.1 tree. Name the 2–3 districts that carry the core and pin the HUB
  inside one of them. This is a P2 dependency, so it must land before P2's brief.
- **§9 and P9**: 24 → 16 everywhere. Add one sentence that `clients.json` length drives everything
  and raising it is adding rows (decision 4 requires this explicitly).
- **§7.4, §7.1, §8.3, §8.7, §10.3, §10.4, §2.2, §2.7**: delete heat. Replace `HOT` with a
  **RUSH** zone (2.2× pay, tight timer, no heat), delete the `chase` music slot or re-trigger it on
  a rush timer under 30 s, retarget `silent running` to something real (cell efficiency), keep
  `patrol` as a traffic variant with distinctive lights and as radio flavour, and keep the minimap
  rear arc as a traffic indicator.
- **§15**: delete it or replace it with "all six answered in `docs/DECISIONS.md`". Leaving stale
  open questions in a document builders treat as the contract will produce a builder that
  relitigates.

**Also**: `DECISIONS.md` §8 asserts `docs/SUNO.md` "is extracted and complete". It does not exist —
`docs/` contains only `BUILD_PLAN.md`, `DECISIONS.md`, `MANAGER_BRIEF.md`. P0 is still tasked with
creating it. Either create it now (it is a copy-paste of §11) or correct the decision.

---

### B2 — The economy is net-negative and internally inconsistent by 5× · blocks P7

**What is wrong.** Three numbers in §7.3/§7.4 cannot all be true.

- Payment formula: `base = 40 + 26·distance_km + 30·risk`. The panel mock in §7.3 shows a **1.8 km,
  LOW-risk** job paying **420 CRD**. The formula gives `40 + 26×1.8 + 30×0 = 86.8 CRD`. With the
  maximum time bonus (+45 %) and one chain parcel (+12 %) that is 135 CRD. The mock is **~5×** the
  formula.
- Fuel: cell 100 units, −0.55/s cruising, CHARGE at **3 CRD/unit**. A 90-second delivery (§7.4's
  own first-playthrough timing: 25 s + 35 s of flight plus dock time) burns ~50 units = **150 CRD**
  of charge. At the formula's 87 CRD payout the player **loses ~63 CRD per delivery**. Even at the
  mock's 420 CRD, 36 % of gross income goes to fuel in a game the brief calls relaxed.
- Cell endurance: 100 / 0.55 = **182 seconds of cruising**, i.e. two deliveries before a forced
  detour to a CHARGE pad. Boosting at −1.8/s gives **55 seconds** of boost, total, ever.
- Tier 2 at 900 lifetime credits "in ~8 minutes": at ~90 s/job that is 5–6 jobs. At the formula's
  87–135 CRD that is 520–810 CRD — **tier 2 is not reachable in 8 minutes**, which is a stated P7
  gate. At the mock's 420 CRD it is reached in 2–3 jobs (~4 minutes) and tier 3 by minute 8.

**Why it matters.** This is the loop. A P7 builder will implement the formula, watch the player go
bankrupt, and invent its own numbers — which is exactly the "decision a builder should not have to
make" the plan's own preamble forbids. And "no fail state, you cannot be stranded" is quietly
violated: running the cell flat every three minutes with no money to refill is a soft fail state
with a tow animation.

**Fix.** Re-derive the economy as one system and write the derivation into §7.4, not just the
constants:
- Decide the target: a delivery should pay **3–5× its fuel cost**, and tier 2 should land at
  6 ± 1 jobs.
- Suggested: `base = 180 + 130·distance_km + 60·risk` (a 1.8 km job ≈ 414 CRD, matching the mock),
  charge at **0.8 CRD/unit** (a 50-unit top-up ≈ 40 CRD, ~10 % of gross), cruise drain **0.18/s**
  (≈ 9 minutes of flight per cell, so charging is a rhythm and not an interrupt), boost **0.9/s**.
- Then re-check the tier ladder against the new numbers and state the expected minutes-to-tier-2 in
  the section so P7 can assert it.
- Add the missing definition of `risk` — nothing in the plan says what sets it.

---

### B3 — The fog / LOD / draw-distance numbers do not interlock, and the fog colour is wrong · blocks P2, P3

Three related failures, all in the plan's most load-bearing system.

**(a) Above 260 m, fog does not cull anything, and LOD0 pops in plain sight.**
§4.2 sets `uClearMul = 0.45` above `uClearY = 260`, i.e. fog density is multiplied by 0.45 in clean
air. With `fogNear 60`, `fogFar 900`, the effective full-opacity distance at altitude becomes
`60 + 840/0.45 = 1,927 m`. Meanwhile:

- LOD0 ends at ring radius 2 → **640 m from the camera** (the plan's "1280 m" is the full width of
  the 5×5 ring, not a radius — note it quotes LOD1 the other way, as a half-width 1664 m).
- At 640 m the fog factor at altitude is `0.45 × (640−60)/840 = 0.31`. The LOD0→LOD1 transition —
  full prototype geometry with signs and strips, dropping to a 12-triangle box with no signage — is
  **69 % visible**. Not hidden. A hard, city-wide pop that sweeps toward the player as they fly.
- The `fog_city` critic shot is at **320 m altitude**, i.e. squarely in the clean-air band. The
  shot that is supposed to prove the rendering plan is the shot that shows the artefact.
- Same maths kills §3.6's claim that "beyond ~900 m the fog takes [the ground] entirely" — the
  2400 m ground plane's edge sits 1,200 m from the camera at 62 % visibility.
- §3.2's "culling is done by the band scheme and by fog, which is the honest answer" is therefore
  only true below 260 m.

**Fix.** Pick one and write the interlock rule into §3.2 as a constraint the builder must preserve:
either (i) make `uClearMul` a function of the LOD budget so effective visibility never exceeds
`0.8 × ringNear_radius` (which means clearMul ≈ 0.9 with these radii, losing the tower-top clarity),
or (ii) — better — keep the clean-air look and **raise `ringNear` to 3** (7×7 = 49 chunks, LOD0
radius 896 m) while cutting `density` or LOD0 prototype tris to pay for it, and add a **screen-space
LOD cross-fade over the last 15 % of the band** (dither or an opacity ramp on the LOD1 instance) so
the swap is never a step. Whichever is chosen, add "fogFar, uClearMul and ringNear are one system;
changing one requires recomputing the other two" to §3.2, and add an explicit P2 gate: "screenshot
at 320 m looking at the LOD0 boundary; no visible discontinuity".

**(b) The fog colour is far too dark to do the job the plan assigns it.**
§3.0 correctly identifies that `746850_01` works because "silhouettes stack in front of each other
at four or five separable depths". I opened that plate: the fog in it is a **mid-grey, roughly
#3a3d42**, noticeably *lighter* than the buildings — that luminance gap is the entire mechanism.
The plan's variants specify `deepnight` fog `0x05070c` and `stormnight` `0x070910`, which are
*darker* than the near-black building material `0x0a0c11`. Dark buildings against darker fog do not
separate; they merge into a single black field and every depth cue in §3.0 is lost. The same is
true of `1488490_00`, where the canyon haze is a clearly visible blue-grey.

**Fix.** Raise the fog colours to roughly `0x232830` (`deepnight`), `0x2a2f38` (`stormnight`),
`0x1f2028` (`predawn`), keeping the *frame* mostly black through the buildings, the grade lift and
the low exposure rather than through the fog. Add a one-line rule to §4.2: **fog colour must be
measurably lighter than the shell material's albedo, or depth banding does not exist.** This is a
number, not an architecture change, but it is the number the whole look hangs on and a builder
copying the table will ship the black-on-black version.

**(c) `patchFog` on additive materials.**
§4.2 says "`patchFog` must be applied to every lit and every **emissive** material". The stock fog
does `mix(color, fogColor, fogFactor)`. On an `AdditiveBlending` material (`signsNeon`, strobes,
streaks, halos, shafts) that makes distant neon *brighter* — it adds grey haze to the framebuffer
instead of fading out. Additive materials must instead use `gl_FragColor.rgb *= (1.0 - fogFactor)`.
State the two variants of the patch explicitly; a builder applying one helper to everything will
produce a glowing grey wash at distance and will not know why.

---

### B4 — The per-instance window UV scheme does not work with an atlas · blocks P1, P2

**What is wrong.** §3.4 is the technique the whole city rests on: one 4×4 atlas, one material,
per-instance `iUvOffset` (cell) and `iUvScale` (tiling), with the vertex shader computing
`vAtlasUv = uv * iUvScale + iUvOffset`.

`iUvScale` is `worldH / 3.6 / ROWS_PER_CELL` — for a 400 m tower that is ~111 rows, so
`iUvScale.y ≈ 3.5` even with 32 rows baked per cell. A UV that runs from 0 to 3.5 does not tile
within a 0.25-wide atlas cell; it **runs across the entire atlas and off the end**, sampling twelve
other window patterns and then clamping. Every building taller than one cell's worth of rows — that
is, essentially every building — renders garbage.

**Why it matters.** This is not a tuning value, it is the core rendering idea, and the plan states
it as settled with a code sample a builder will copy verbatim. It is also the single hardest thing
in the plan to debug after the fact, because it will "sort of work" on small buildings.

**Fix.** Atlas tiling requires per-fragment wrapping with explicit derivatives, because `fract()`
in the fragment shader creates a mip discontinuity at every cell seam:

```glsl
vec2 tiled = fract(vTileUv);                 // vTileUv = uv * iUvScale, from the vertex shader
vec2 auv   = vUvOffset + tiled * CELL;       // CELL = 0.25 for a 4x4 atlas
vec2 dx    = dFdx(vTileUv) * CELL;
vec2 dy    = dFdy(vTileUv) * CELL;
vec3 win   = textureGrad(emissiveMap, auv, dx, dy).rgb;
```

`textureGrad` is available in WebGL2 (which r160 uses by default) — no extension needed. Also
require **4-texel gutters around every cell** in `atlas.js`, or bilinear filtering pulls in the
neighbouring pattern at the seam. Write this into §3.4 in place of the current sample.

*(Note: signage is fine — §3.5.4's quads have `uv ∈ [0,1]` and `iUvScale = (w,h)` = the region size,
so the sample stays inside its region. The bug is specific to the tiling case.)*

---

### B5 — Tone mapping is not applied, and the bloom threshold is meaningless · blocks P0, P1

**What is wrong.** §2.3 sets `renderer.toneMapping = ACESFilmicToneMapping` and §4.6 removes
`OutputPass` in favour of a custom grade `ShaderPass` that is specified as handling only sRGB
(`linearToOutputTexel`). But everything renders through `EffectComposer`, i.e. into render targets,
and `OutputPass` exists in the first place *because* the composer's intermediate renders do not get
the renderer's output conversions. Whichever way r160 resolves the tone-mapping define, the plan is
wrong:

- If tone mapping is skipped for render-target renders (the reason `OutputPass` applies ACES
  itself), the game **ships with no tone mapping at all** — a linear frame with clipped neon and no
  filmic shoulder, which on a mostly-black image with saturated point sources looks exactly like
  blown-out garbage.
- If it *is* applied, then it is applied **before** bloom, so `threshold 0.62` is being tested
  against post-ACES values, not the HDR values §4.4's reasoning assumes ("in a mostly-black frame
  almost nothing is above 0.62 except the things we want blooming"). Post-ACES, a lot of the frame
  sits above 0.62 and the bloom smears.

Related: `EffectComposer` in r160 defaults its render targets to `HalfFloatType`, so the HDR range
is there — the plan should say so, because a builder that constructs the composer with a default
`UnsignedByteType` target clips everything above 1.0 and bloom stops working entirely.

**Why it matters.** This decides the tonal response of every frame in the game and it lands in P0/P1,
before any critic round can catch it. "Finish" and "Lighting" both die on it.

**Fix.** Set `renderer.toneMapping = THREE.NoToneMapping`, keep exposure as a uniform, and have the
grade `ShaderPass` do, in order: ACES (copy `<tonemapping_fragment>` or inline the standard fit) →
lift/gamma/gain → split tone → vignette → dither → `linearToOutputTexel`. State in §4.6 that the
bloom threshold is in **pre-tonemap linear** space and re-tune it (0.62 pre-ACES is roughly 1.1–1.3
in linear terms — expect to raise it). Assert the composer's render targets are `HalfFloatType`.

---

### B6 — The mirrored reflection group: BackSide is a double flip, and its depth order is unspecified · blocks P3

Two problems in §3.7(b), which the plan calls "the single best-value item".

**(a) `side: BackSide` is wrong.** Three.js already compensates for negatively-scaled objects:
`WebGLRenderer.renderBufferDirect` computes `frontFaceCW = object.matrixWorld.determinant() < 0`
and passes it to `state.setMaterial`, which flips the winding order in GL. A group at
`scale(1,-1,1)` therefore already renders its front faces correctly with `side: FrontSide`. Adding
`BackSide` on top applies the flip **twice**, and the mirrored quads become invisible from the side
you are looking at. The plan's parenthetical "(negative scale flips winding)" is the reason for a
correction three.js has already made.

**Fix.** Leave `side` as the source material's, or use `DoubleSide` on the mirror (the fields are
quads and the cost is nil). Delete the justification so a later builder does not re-add it.

**(b) The reflection is below the ground plane and nothing says how it survives.** The mirrored
content lives at `y < 0`. §3.6's ground is an opaque `MeshStandardMaterial` that writes depth.
Drawn afterwards with `depthWrite:false` but depth *test* on (unstated), the mirror is entirely
occluded by the ground and nothing appears. With depth test off it paints over buildings that are
in front of it. Neither is specified, and the builder will have to invent the answer for the
plan's highest-value visual feature.

**Fix.** State the order explicitly: **(1)** opaque scene including the ground, ground writes depth;
**(2)** mirror group with `depthTest: true`, `depthWrite: false`, `renderOrder` after opaque and
before the wet plane — but for that to pass the depth test the ground must *not* write depth, so
instead: **(1)** opaque scene without the ground; **(2)** mirror group, `depthTest: true`,
`depthWrite: false` (buildings correctly occlude reflections); **(3)** the wet plane as a
`transparent`, `depthWrite: false` overlay carrying the roughness/ripple tint. Then the ground and
the water are one surface and the reflection sits under it. Add a P3 gate screenshot: a building
between the camera and a sign must occlude that sign's reflection.

**(c) Its cost is understated.** "4 draw calls, ~18k tris, ~0.6 ms" prices the geometry, not the
fill. In the `wet_street` framing (5 m above the street) the mirrored sign, strip, strobe and streak
fields blend over roughly the lower half of the frame, on top of the wet plane's own transparent
pass. Expect **1.5–2.0 ms**, not 0.6 ms, in exactly the shot it exists for.

---

### B7 — The frame budget has zero headroom, contradicts itself on chunk generation, and its numbers cannot be measured · blocks P0 (gates), P2

**(a) 16.7 ms of work in a 16.7 ms frame.** §3.11's table sums to exactly 16.7 ms, which is the
frame *period*, not the frame *budget*. Nothing is left for the browser's own compositing, Safari's
canvas presentation, GC, the audio thread, DOM layout, or the ~1 ms of jitter any real device has.
A frame that is 100 % allocated misses vsync constantly and drops to a 30 fps cadence, which reads
worse than a steady 45. The honest target is **≤ 13 ms of engine work** for a stable 60.

**(b) Chunk generation is budgeted twice, at 1.5 ms and at 4 ms.** §3.11 allocates **1.5 ms**
amortised for chunk generation. §3.2 permits **4 ms per chunk**, one chunk per frame, deferring
only if the frame would pass **12 ms**. So the permitted case is a 12 + 4 = 16 ms frame *plus* post
— a guaranteed dropped frame on every generating frame, and while streaming that is most frames.
The R1 mitigation ("one chunk per frame, hard-capped") does not resolve it because the cap is set
above the budget.

**Fix.** Split chunk generation into work units of **≤ 1.2 ms** (the plan already proposes a
descriptor pass and a matrix-write pass — make each independently yieldable and cap the *per-frame*
total, not the per-chunk total), lower the defer threshold to `now - frameStart > 6 ms`, and rebuild
the §3.11 table to sum to ~13 ms. Re-check the P2 gate against the new numbers.

**(c) The "measured" numbers are estimates, and the ship gate cannot be met.**
§4.4 says bloom cost was "**measured** at ~3.5 ms at 1170×2532 dpr 2 on an iPhone-class GPU". No
code exists; nothing has been measured. More importantly, §1's shipping definition requires "60 fps
sustained on a recent iPhone… **Measured, not guessed** — `tools/budget.mjs` writes the numbers",
and `budget.mjs` runs headless Chrome on a Mac with `--use-angle=metal`. **An M-series Mac GPU is
not a phone GPU** — it will pass every gate the plan sets while an A15 at native resolution
struggles. There is no path in the plan to a real device number.

**Fix.** (i) Relabel every "measured" figure as an estimate until something measures it. (ii) Add a
real device step to P10's done-criteria: the Pages URL opened on Aaron's phone with `?perf`, in
portrait and landscape, at default and `?lite=1`, with the four numbers written into the ship
handoff. (iii) Add a proxy gate `budget.mjs` *can* enforce on a Mac: cap the desktop frame at
**6 ms** at dpr 2 (roughly a 2.5× headroom factor over a mid phone) rather than the current 18 ms
mean, which a desktop will pass while rendering something a phone cannot.

---

### B8 — The fill-rate items — which are what actually kill mobile GPUs — are unpriced · blocks P1, P3

Draw calls and triangles are not this game's risk; the plan budgets them carefully and lands at ~81
draws (see N1) and 250k tris, both fine. The risk is **blended overdraw**, and four items are
priced at roughly a tenth of what they will cost.

| Item | Plan's number | Why it is wrong | Realistic |
|---|---|---|---|
| **Light shafts, 4 → 8 cards** | **+0.15 ms** | Eight large additive cards with `depthWrite:false` and `fog:false`. Each covers perhaps 25–35 % of the frame; eight is ~2.4 screens of alpha blend on a 2.96 Mpx target (dpr 2, 1170×2532), ~7 M blended fragments with a texture fetch each. Reducing *opacity* by the view-dot term does not reduce rasterisation — the cards still shade every covered pixel. | **0.6–1.5 ms** for the eight, in `daysmog` where `shafts = 1.0` |
| **LOW-tier halo sprites** | **+0.5 ms**, "three extra draw calls" | ~2,800 quads (900 signs + 1,200 strips + 700 strobes) redrawn at **2.5× scale = 6.25× the area**, additive, unbounded — it scales with how many signs are on screen, and it is on the *weakest* device. This replaces bloom, which is a **fixed** cost. | **1.5–2.5 ms** on a mid Android, i.e. plausibly *more* than the bloom it replaces |
| **Dock zone volumes** | 16 draws, unpriced | 14 m × 26 m `DoubleSide` additive cylinders with `depthWrite:false` = 2× overdraw each; standing next to one it fills the frame. Eight active is also 20 % of the entire draw budget for something you can only be near one of. | Cull to the **nearest 3**, fade the rest; saves 10 draws and the fill |
| **`backdrop-filter: blur(24px)`** on the docking panel | unpriced | On mobile Safari, a 24 px backdrop blur over a **live WebGL canvas** forces a full-resolution readback and blur every composited frame. This is the main UI of the game. | **5–15 ms/frame** while docked |

**Fix.**
- Shafts: cap at **4** on HIGH and **1** on LOW; cull any card whose view-dot term is below 0.05
  (set `visible = false`, do not just fade); shrink the cards and rely on bloom to spread them.
- Halos: cap the halo field to the **nearest N instances** (400 signs, 500 strips, 300 strobes),
  scale 1.8× not 2.5×, and add a P3 gate that measures LOW *with* halos against LOW *without* — if
  halos cost more than the bloom they replace, the substitution has failed and LOW should simply be
  bloom-less.
- Zones: nearest 3.
- Docking panel: **do not blur the live canvas.** Render one frame into a small offscreen canvas
  when the panel opens, downscale it, and use it as a static blurred `background-image`; the city
  behind the panel is not moving anyway because the craft is docked. Note this in §7.3 as a rule,
  because "24 px backdrop blur" is written there as a visual requirement.
- Add a line to §3.11: "Transparent and additive layers, not draw calls, are the mobile budget. Any
  new full-screen-ish blended layer must be costed at ~0.35 ms per screen of coverage at dpr 2
  before it is added."

---

### B9 — The blind critic loop leaks which image is ours · blocks P3 (first scored round)

§12.4 states the critic "never receives the plate id, the shot id, the repo path". The tool it says
to port — `forge/tools/compare.mjs`, which I read — violates that in three ways, and the plan
inherits all three verbatim.

1. **The sheet filename is the shot id.** `critique/fog_city_r1.png`. The critic is handed that
   path. `cockpit`, `day_smog`, `wet_street` and `hero_craft` also announce what the shot is *of*,
   which primes the whole scoring.
2. **`.keys/` is inside the game directory.** `const KEYS = resolve(ROOT, '.keys')`, with a comment
   claiming it is "outside the critic's reading path". A critic agent with Read/Bash/Glob (which is
   what the repo's `fp-critic` has) can `ls` its way to the answer key in one command. `.gitignore`
   hides it from git, not from an agent.
3. **Our render is a PNG; the plate is a JPEG.** Both go through the same ffmpeg prep into one PNG
   sheet, so the *geometry* is matched — but the reference half carries JPEG ringing, chroma
   subsampling and block edges from the original press screenshot, and our half is mathematically
   clean. That is a visible, learnable tell, and it is the one a careful critic notices.

Two more, smaller:

4. **The `TRIM` table covers exactly one plate** (`746850_02`). Every other plate must be checked
   for the source game's HUD, watermark or logo. `1488490_00` and `746850_03` in particular need
   confirming — a visible third-party HUD identifies the real game instantly.
5. **The calibration round is game-able.** `--calib` puts the *identical file* on both sides. A
   critic that notices they are pixel-identical will score them identically by inspection, so the
   check passes without measuring anything about critic reliability.

**Fix.**
- Write the sheet to `critique/sheet_<8-hex>.png` and record the mapping in the key file. Hand the
  critic only that path.
- Move `.keys/` **outside the repo**, e.g. `~/.cache/neonhaul-keys/`, and say so in §12.4.
- Encode the sheet as **JPEG q88** and add a matched light grain to both halves
  (`noise=alls=4:allf=t+u` in the shared `prep` chain) so both sides share an artefact floor.
- Audit all six plates for source-game UI and fill in `TRIM` before round 1.
- Make `--calib` use two *different* crops of the same plate (or the same plate with a ±2 % exposure
  jitter on one side) so the critic cannot shortcut, and keep the ≥ 8 / ≤ 1.0 rule as-is — that part
  is a genuinely good check.

---

### B10 — Three concrete breakages in the media pipeline · blocks P9

All three verified against the actual source.

**(a) `wait_for_ltx_idle()` will raise `TypeError`.** The real signature in
`site/gms/2d/awake/regen_helper.py:712` is `wait_for_ltx_idle(local_job, timeout=150)` — `local_job`
is a **required positional argument** and the function mutates it
(`local_job["status"] = "waiting_ltx_idle"`). §9.3 calls it as `wait_for_ltx_idle()`.
**Fix:** `wait_for_ltx_idle({})`. Everything else in §9.3/§9.4 checks out — `best_effort_unload(api)`
takes the api ✓, the module has no import-time side effects (the server is under `__main__`) ✓,
`IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"` matches ✓ (the root `CLAUDE.md`'s `flux2-klein-4b` is the
stale one), `ALLOWED_RESOLUTIONS = {(384,640),(576,960)}` matches ✓, and every LTX payload field the
plan uses (`image_strength`, `tiling`, `no_audio`, `cfg_scale`, `negative_prompt`, `image`) is real ✓.
Also: `mflux_generate()` already implements the submit-poll-download loop §9.4 spells out by hand —
import it rather than rewriting it.

**(b) The ping-pong still hitches at the loop point.** `select='gt(n\,0)'` correctly drops the
duplicated frame at the *turn* (reversed frame 0 == forward frame 48). But the **last** reversed
frame equals forward frame 0, so when `<video loop>` wraps, frame 0 is shown twice. The plan's own
"49 forward + 48 reverse = 4.04 s" arithmetic is right; the seam count is not.
**Fix:** drop both ends of the reversed segment — `[b]reverse,trim=start_frame=1:end_frame=48,setpts=N/FRAME_RATE/TB[r]`
— giving 49 + 47 = 96 frames = 4.0 s at 24 fps, with no duplicate at either seam.

**(c) A canvas cannot produce an 8-bit greyscale PNG.** §3.5.1 mandates "**8-bit greyscale PNG**";
§3.5.6 produces it via `canvas.toDataURL('image/png')`, which always emits 8-bit **RGBA**, and then
makes the optimiser optional ("if `oxipng` or `pngquant` is on `PATH`"). The RGBA version of a 2048²
sheet will be roughly 2–3× the greyscale size and will likely blow the 400 KB budget, causing a
builder to needlessly drop to 1536².
**Fix:** make **`oxipng -o4 --strip safe`** a hard requirement of the bake (it performs the colour-type
reduction to greyscale automatically when all channels are equal), and fail the bake with an
install instruction if it is absent rather than shipping the raw PNG.

---

### B11 — The docking panel's video will not play on iOS · blocks P7, P9

§9 specifies `<video poster>`, `preload="none"` and a `src` set on open, but never specifies
`muted`, `playsinline` and `autoplay`. On iOS Safari, a `<video>` without `playsinline` **takes over
the screen in the native fullscreen player** on play, and without `muted` it will not autoplay at
all without a user gesture. The client loop is the centrepiece of the main UI of a mobile-first
game; it will silently fail on the platform the brief names first.

**Fix.** §9.6 must specify the element exactly:
`<video muted playsinline webkit-playsinline autoplay loop preload="none" disablepictureinpicture poster="…">`,
plus `video.play().catch(() => { /* fall back to the still */ })` — a rejected play promise must
degrade to §9.6's still-with-shimmer path, not throw. Add it to P9's done-criteria as an explicit
mobile-emulation check in the CDP harness.

---

### B12 — Four `onBeforeCompile` patches target names that do not exist in 0.160 · blocks P1

The pin itself is correct and verified: **three@0.160.0 is real**, it is what hotwire, voidcast and
ironhail use, and **68 of the 70** `gms/3d/*` games use that exact line (two use 0.180.0). Every API
the plan names exists in it — `SRGBColorSpace`, `NoColorSpace`, `ACESFilmicToneMapping`,
`PMREMGenerator`, `mergeGeometries`, `InstancedMesh.setColorAt`, `renderer.info.autoReset`,
`UnrealBloomPass`, `ShaderPass`, `OutputPass`. But four shader-patch details are wrong for r160
specifically, and each fails **silently** — `material.fragmentShader.replace()` on a string that is
not present is a no-op, so the builder gets no error, just a missing effect.

1. **`<output_fragment>` was renamed `<opaque_fragment>` in r152.** §3.7(c)'s fresnel rim must patch
   `#include <opaque_fragment>` (or inject before it). Targeting the old name does nothing.
2. **`viewDir` does not exist.** r155 renamed the shader's geometry struct fields; the fragment
   shader's view direction is `geometryViewDir` (available after `<lights_fragment_begin>`), or
   `normalize(vViewPosition)`. `saturate` *is* fine — three defines it in `common`.
3. **The `vWorldPosition` sample is the buggy version the prose warns about.** §4.2's prose says
   "for instanced meshes this must … use the instanced-transformed position", and then gives the
   code as `vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;` — which is precisely the
   version that fogs every building as if it were at the origin. A builder copying the code block
   ships the bug the paragraph predicts. Replace the sample with:
   ```glsl
   #ifdef USE_INSTANCING
     vWorldPosition = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
   #else
     vWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
   #endif
   ```
   (`vWorldPosition` is not declared by `MeshStandardMaterial` in r160, so injecting the varying is
   safe — no redeclaration conflict.)
4. **`<fog_fragment>` declares `fogFactor` and consumes it in the same chunk**, so there is nowhere
   to "inject" between the two. The patch must **replace the whole `#include <fog_fragment>`** with
   a rewritten body. Say so.

Add one line to §2.3: *any* `onBeforeCompile` patch must `console.warn` if its target substring was
not found, so a chunk rename on a future three.js bump fails loudly instead of quietly deleting a
visual effect.

---

### B13 — Platform lifecycle is missing entirely · blocks P0

None of the following appears anywhere in 2,542 lines, and every one of them is standard in the
sibling games:

| Missing | Consequence | House pattern |
|---|---|---|
| AudioContext unlock on first gesture | **No sound at all on iOS**, ever. The entire §10 audio design — which decision-level reasoning says now carries the sense of a populated city — is inert. | `voidcast/js/audio.js:23 resumeAudio()` |
| `visibilitychange` | Backgrounding the tab leaves the clock, `?auto=1` and the audio graph running; returning produces a huge `dt` and a teleporting craft | — |
| `webglcontextlost` / `restored` | Common on mobile after backgrounding; the game becomes a black canvas with no message | — |
| `resize` / `orientationchange` | The brief requires portrait **and** landscape. The composer's render targets and the bloom pass's internal mips must be resized too, not just the camera aspect | `voidcast/js/main.js:69–71` (`orientationchange` → `setTimeout(resize, 120)`) |
| `touch-action:none; user-select:none; overscroll-behavior:none` | Double-tap zoom (and §6.1 uses **double-tap-and-hold** for boost, so this is guaranteed to fire), rubber-band scroll, text selection on drag | `voidcast/style.css:25`, `hotwire/style.css:5` |
| `window.onerror` → `__state.errors` | `__state.errors[]` is specified but nothing populates it, so the harness's error reporting is decorative | — |
| Save `JSON.parse` guard / version migration | One corrupt save bricks the game with no recovery | — |

**Fix.** Add a short §2.8 "Platform lifecycle" listing all seven with the sibling file to copy from,
and put them in P0's scope and done-criteria. They are perhaps forty lines of code in total and
each one is a shipped-game failure if omitted.

---

### B14 — Three phases are too large for one agent, and the riskiest UI is buried at the end of the largest one · blocks the phase plan

Decision 7 requires phases executable from their named sections alone. Three are not.

- **P1** = `atlas.js` + `materials.js` (three shader patches) + `sky.js` (5 variants, clock, blend,
  sky dome, PMREM bake, light shafts) + `districts.js` + the grade `ShaderPass` + **the entire
  offline signage bake** (a bake page, an abstract glyph generator with three families and a shelf
  packer, 242 regions, tofu detection, a CDP driver, PNG optimisation). The bake alone is a phase.
  **Split: P1a** atlases/materials/sky/grade, **P1b** the signage bake (it is fully offline and
  independent — it could even run first, or concurrently with P0).
- **P3** = signage placement (5 layers + clustering + per-chunk determinism) + `weather.js` (GPU
  rain, wind, lightning, windscreen droplets) + `reflect.js` (mirror group, wet ground, ripples) +
  strobe/antenna/bridge fields + LOW halos + **two critic shots at three passes each**. This is the
  phase the whole look depends on and it is the largest in the plan.
  **Split: P3a** signage + strips + strobes + antennae, **P3b** weather + reflections + halos, with
  the critic round after P3b (and see N12 — `wet_street` should be scored there too).
- **P7** = `zones.js` + `dock.js` + `missions.js` + `economy.js` + the job board + the shop, ending
  with a 3-delivery CDP test. R4 in the plan's own risk register says the docking panel "is the
  piece most likely to be rushed at the end of a long phase by an agent that has been doing shader
  work all day" — and then P7 does exactly that to it.
  **Split: P7a** zones + missions + economy + job board + shop, **P7b** the docking panel alone,
  with §7.3's checklist as its entire brief and its own review gate.

**Ordering problems that will cause rework:**

- **Light shafts are in P1 but their anchoring is a P2/P3 dependency.** §4.5 anchors them "to gaps
  between near-ring towers, chosen at chunk load" — chunks do not exist until P2. P1 can build the
  card geometry, material and view-dot term; the placement must move to P3.
- **Shot cameras cannot be authored at P0.** P0's done-criteria requires
  `shot.mjs --shot=fog_city` to write a PNG, and `shot.mjs` hard-fails on an unknown id — but §12.1
  gives shot cameras only as prose ("320 m altitude, wide, level") with no coordinates, and there is
  no city to point them at until P2. State that P0's six `shots/*.json` are placeholders and that
  **P3 authors and freezes the final cameras before the first scored round**, since §12.4 correctly
  insists a shot that moves between rounds makes score movement meaningless.

---

## 3. Non-blocking issues

### Rendering and performance

**N1 — Draw-call accounting is optimistic by ~9 and the tri target contradicts the tri accounting.**
The world total of 66 is arithmetically correct (I re-added it). Post is not: `UnrealBloomPass` with
5 mips is **~13 draws** (1 high-pass + 5 × 2 separable blurs + 1 composite + 1 additive blend), not
5, plus `RenderPass` and the grade pass. Real total ≈ **81**, so headroom is **9**, not the claimed
18. Separately, §3.8's headline target is "≤ **230k** triangles at HIGH" while its own accounting
totals **250k** — the target is below the plan. Pick one (260k, matching the `budget.mjs` gate).
Also "the reason it is 71" should read 72.

**N2 — `UnrealBloomPass` already halves internally.** Its `setSize(w,h)` does
`Math.round(w/2)` for the bright target and then quarters down the mip chain — so "half res" is the
default, not an upgrade, and the `resolution` vector passed to the constructor is **overwritten by
`EffectComposer.setSize()` on the first resize**. The §1.1 line crediting "+0.8 ms" to running at
half instead of quarter is describing an option that requires subclassing `setSize`. Harmless, but
it shows the bloom figure was not derived from the class.

**N3 — `antialias: !low` does nothing when everything goes through the composer.** The default
framebuffer's MSAA is unused; the composer's targets are single-sampled. On a near-black frame full
of bright thin neon lines and thin edge strips, aliasing crawl is exactly the "Finish" killer §3.5.4
worries about for mipmaps. **Fix:** construct the composer with
`new THREE.WebGLRenderTarget(w, h, { samples: low ? 0 : 4, type: THREE.HalfFloatType })` (WebGL2
multisampled targets work in r160), or add an FXAA/SMAA pass on HIGH.

**N4 — `renderer.info.autoReset = false` with no reset.** §2.3 disables auto-reset (correctly, so
the composer's several render calls accumulate into one frame's total) but nothing calls
`renderer.info.reset()`. Draw and triangle counts will climb monotonically forever and `__state.draws`
and every `budget.mjs` gate become meaningless. Add "call `renderer.info.reset()` at the top of the
frame, before the composer" to §2.3.

**N5 — The signage atlas needs gutters.** 242 shelf-packed variable-size regions with mipmaps down
to 1×1 will bleed neighbouring tiles into each other at distance — a distant blade sign picking up
half of the poster packed above it. Specify **≥ 8 px padding** between regions in the packer, and
clamp the sampled mip (or pad to a power-of-two-friendly shelf height). This is a two-line change to
`bake_signs.mjs` and an invisible bug if missed.

### Flight and gameplay

**N6 — The flight constants make the stated top speeds unreachable.** With `DAMP_ACTIVE = 0.9 /s`
applied while the stick is held, terminal velocity is `ACC / DAMP` = `46 / 0.9` = **51 m/s**, not the
stated `MAX_FWD` of 62. `MAX_BOOST` 105 would need ~95 m/s² of acceleration. The per-craft "top m/s"
column in §5.2 (46–84, and `lance` at 84) is therefore decorative. **Fix:** either apply damping only
to the velocity component *not* being commanded, or raise `ACC_FWD` to ~1.3 × `DAMP × MAX`, or state
that max speeds are hard clamps and drop damping while commanding. Say which — a builder will
otherwise pick one at random and the craft table becomes fiction. (The auto-stop arithmetic in §6.2
is, by contrast, exactly right: 0.154 s / 0.56 s / 1.03 s all recompute correctly, and the 1.2 s P4
gate is consistent with `STOP_SNAP`.)

**N7 — §6.1 contradicts itself on altitude.** "The stick is **planar**. It never controls altitude"
and, two bullets later, "forward thrust is applied along that heading *including its pitch
component*… pushing forward while looking up climbs". Both are defensible designs; only one can be
built. State which wins (the look-relative version is the better one — it is what makes flying feel
free — so reword the first bullet to "the stick has no dedicated altitude axis").

**N8 — `ALT_MAX 520 m` is below the tallest buildings.** `pale` reaches 700 m and `vault` 620 m, so
the player cannot fly over a third of the skyline in a game about a very tall city, and the hard
clamp will feel like a wall. Raise to ~760 m with the haze warning starting at 620, or lower the
`pale`/`vault` height bands.

**N9 — Data a builder will have to invent.** These are named in the UI but defined nowhere:
- **Pad and district display names** ("Kell's Rest", "Ardent") — the dock panel, dash, minimap, holo
  panel and chatter all show them. There is no name table and no `data/names.json`.
- **Job selection** — §7.4 gives the payment formula but not how pickup/drop pairs are chosen,
  distance bounds, how many are on the board, or refresh rules.
- **`risk`** — used in the payment formula, never assigned.
- **Client ↔ zone assignment** — which of the 16 clients appears at which pad, and whether it is
  stable across a reload (it must be, given the world is seed-derived).
- **Spawn** — where the player starts, facing where, in what craft, with what credits. §7.1 puts the
  HUB "at the world origin", but chunk (0,0) also generates 28 seeded buildings there with no
  keep-out (this is the same hole as B1's landmark keep-out).
- **`?auto=1` autopilot behaviour** — required from P0, gated in P4, used by `soak.mjs` and
  `budget.mjs`, and specified nowhere beyond "flies a lane circuit, docks, accepts, delivers".

**N10 — Zone colour is the sole identifier.** §7.1 states "Colour is the primary identifier and it
is consistent everywhere". Six types including green/red/amber makes the world markers and minimap
dots unusable for the ~8 % of male players with a red-green deficiency. The world volume already has
a floating glyph and the holo panel a type glyph — carry the same glyph onto the **minimap dot** and
the **HUD marker** and the problem disappears for free.

### Critic loop and references

**N11 — `wet_street` is scored only at P10, five phases after the system it tests ships.** The wet
ground double is called "the single best-value item in this plan" and lands in P3; its dedicated
shot is not scored until the final phase, when there is no time to act on the result. Move
`wet_street` into the **P3** round (three shots there, which is why P3 should split per B14) and
leave `day_smog` at P10.

**N12 — `day_smog` will systematically under-score, and its crop clips the figure.** I opened
`1091500_08`: the sky is a near-white blown grey occupying ~45 % of frame and the tower carries
visible rust-orange and teal panels with warm-lit window rows — it is *not* a silhouette. §4.3's
`daysmog` sky (`0x585048` → `0x3b3a3e`) is far darker than the plate. That may well be the right call
for the brief ("still fairly dark"), but it means the shot will lose Lighting and Atmosphere points
for a deliberate deviation. **Record that as an expected deficit in `SCORES.md` before round 1** so
the gap is not misread as a defect and chased.
Separately, the crop `[0.58, 0.00, 1.00, 0.78]` — whose ~0.96:1 aspect I verified — puts its left
edge right on the figure's right arm (~x = 0.575–0.585 at full res). **Use x₀ = 0.63** and eyeball
the result once before round 1.

**N13 — §3.5.0's plate analysis is overstated, and it hides a real manager question.** The claim is
that `1488490_00` contains "roughly forty signage elements… about four have legible glyphs… everything
else is colour fields, bars, dot grids and shapes". I opened it. The frame's four most prominent
signage elements are **large figurative poster art** — an anime face on the "EXOTIC" board, a
character on the blue 净跑者 board, a figurative green/pink mural, an illustrated orange panel — plus
several large real-CJK text blocks and dozens of small legible warm signs in the mid-ground. Abstract
signage is still the right default (Aaron settled that), but the plan should not justify it with a
count the plate does not support, because the justification is load-bearing for the atlas design.
**The real question this exposes, which the plan never asks:** §1.1 forbids "nothing figurative" on
hero billboards under the no-people rule — but the brief's rule is about *3D character models in the
world*, and a greyscale poster tile of a face costs exactly the same as an abstract one in an atlas
we are baking anyway. Ask the manager: are **2D figurative poster/hologram images on billboards**
permitted? If yes, budget 6–8 `hero`/`panel` tiles for them; it is the single cheapest way to close
the density gap against `1488490_00` and `1939970_00` (whose most striking element is a giant pink
holographic figure).

### Audio and SUNO

**N14 — The no-repeat arithmetic is wrong by 2.5×.** §11.4 claims "roughly 20 minutes before a player
hears a repeat" from 33 foreground lines. With a **12-line** no-repeat window, a line may repeat at
line 13; at one line every 22–50 s (mean 36 s) that is **7.8 minutes**. The 20-minute figure is only
true with a shuffle-bag that exhausts the pool. **Fix:** make it a shuffle-bag (draw without
replacement, reshuffle when empty) and say so — then the 20-minute claim becomes true and costs
nothing.

**N15 — The two most-heard lines in the game have one variant each.** §10.4 forces a `dispatch`
confirm on every accept and a `dispatch` pay line on every delivery. In C1 that is line 2 and line 4
— **one** of each. At ~90 s per job the player hears the identical "Courier, your parcel is logged…"
and "Nice run. Credits are clearing now…" roughly every 90 seconds, forever. That is the fastest
route to the city feeling dead, and per DECISIONS the audio is now carrying the entire sense of a
populated city. **Fix:** split C1 into `dispatch_confirm_01–06` and `dispatch_pay_01–06` as their own
SUNO groups (12 lines where there are now 2), and make the job-event forcing draw from those pools.
This is the highest-value single change in §11.

**N16 — 33 foreground lines is thin for the job it now has.** Consider adding a **`life` group** —
non-dispatch, non-police civilian traffic: a courier grumbling about a pad, a market broadcast, a
tower maintenance callout, a taxi driver, a call-in to the pirate station. Six to eight lines in the
same voice as the existing ones would nearly double the sense of a populated city for the cost of one
SUNO generation. The writing quality bar is already set (see §5) — this is volume, not craft.

**N17 — `split_chatter.py` has no failure path.** SUNO does not reliably honour "leave two seconds of
silence", and frequently adds a musical bed despite the Style field. Specify what happens when the
silence split yields the wrong number of segments: print the detected boundaries, write
`chatter/_unsplit_<group>.mp3`, and let the operator name them by hand. Otherwise the tool will
silently write six wrong files.

**N18 — M9's tag style is inconsistent.** `[spoken, distorted]` vs the `[Man Speaking, …]` convention
used everywhere else. Cosmetic, but SUNO responds better to the capitalised speaker form.

### Process and documentation

**N19 — §15 is entirely stale.** All six "left open for the manager" items are answered in
`DECISIONS.md`. A builder reading §15 will think decisions are still open. Delete it and point at
`DECISIONS.md`.

**N20 — Decision 1's board rebuild is not in any phase.** `DECISIONS.md` §1 says "The board page still
shows the old set until it is rebuilt — **rebuild it at P1**". P1's task list does not mention it.
Add it (it is outside `site/`, so it is a tools task, not a game task).

**N21 — Import, don't rewrite, the mflux poll loop.** §9.4 spells out submit → poll → download by
hand; `regen_helper.mflux_generate(prompt, target, mode=…)` already does exactly that including
failure handling. Same reasoning the plan already applies to `wait_for_ltx_idle`.

**N22 — The `--virtual-time-budget` warning is in the brief but not in §12.4.** It is the kind of
thing a tooling builder rediscovers expensively. One line in §12.4 next to the software-renderer
caveat.

---

## 4. Compliance table

`§` references are to `BUILD_PLAN.md`.

### MANAGER_BRIEF.md

| Requirement | Status | Where / note |
|---|---|---|
| Mobile-first Three.js, ships to `/gms/3d/neonhaul/` | **met** | §1, §2.1 |
| Very large, very tall city | **met** | §3.1, §3.10 |
| Variants of darkness; day "interesting but still fairly dark" | **met** | §4.1, §4.3 — strong; but see N12 (darker than its own plate) |
| Never a blue sky | **met** | §4.3 (1), asserted in the P1 gate on a sampled pixel |
| Buildings simple, glass/metallic, detail from emissive | **met** | §3.0, §3.3, §3.4 |
| Reflections good and important | **partial** | §3.7 — the design is right; §3.7(b) has a wrong `side` and an unspecified depth order (**B6**) |
| Interiors never modelled; windows opaque emissive | **met** | §1.1, §3.4 |
| Mostly-black frame; saturated colour = light source | **partial** | Stated §1/§3.0, but the near-black fog colours defeat the depth banding it depends on (**B3b**) |
| Signage: majority English + abstract | **met** | §3.5.2 — 110 abstract + 62 English + 58 non-textual + 12 ja = 242 ✓ |
| 8–15 real Japanese tiles, short and plain | **met** | §3.5.2 — 12 tiles, all 1–4 chars, all ordinary shopfront words |
| No runtime CJK webfont; bake offline | **met** | §3.5.1, §3.5.6 — see B10(c) on the PNG format |
| Cut real-script tiles if they cost more | **met** | Mechanical coverage-check fallback, §3.5.2 |
| 60 fps recent iPhone / 30 fps mid Android, portrait + landscape | **partial** | Claimed §1; no path to a real device measurement, and the budget is 100 % allocated (**B7**) |
| Everything survives `?lite=1` | **partial** | §2.5 is a genuine tier, but the halo substitute may cost more than the bloom it replaces, and shafts/zones are not tiered (**B8**) |
| Instancing, atlasing, fog culling | **partial** | Instancing and atlasing excellent; fog culling fails above 260 m (**B3a**) |
| Left = fly, right = look, flippable | **met** | §6.1, §6.5 |
| Finger off = auto-stop, quickly | **met** | §6.2 — arithmetic verified, 1.03 s, asserted in the P4 gate |
| No fighting inertia, no crashing as a fail state | **met** | §6.3 (3)(4), no damage anywhere |
| Desktop keyboard/mouse fallback | **met** | §6.4 |
| "Flying should feel extremely easy" | **partial** | The scheme is right; the constants are inconsistent so top speeds are unreachable (**N6**), and §6.1 contradicts itself on altitude (**N7**) |
| Neon transparent colour-coded zones | **met** | §7.1 — see N10 on colour-only identity |
| Stop in a zone → docking panel; must look outstanding | **partial** | §7.3 is a genuinely strong spec; but it is buried at the end of the largest phase (**B14**) and its backdrop blur is a mobile trap (**B8**) |
| Panel shows a generated still + ~2 s talking loop, reversed, looped | **met** | §9.1, §9.2 — 4.0 s ping-pong; see B10(b), B11 |
| Accept / make deliveries; payments and events as HUD toasts | **met** | §7.4, §8.4 |
| Cockpit: simple frame + floating holo panels | **met** | §8.1, §8.3 |
| Dashboard with speed, current task | **met** | §8.2 |
| An excellent minimap | **met** | §8.6 — the altitude ring and footprint drawing are the right calls |
| Rear-view only if it genuinely works | **met** | §8.7 — reasoned, costed, declined; fallback specified |
| **No character models anywhere in the 3D world** | **met** | §1.1 — enforced hard, including no occupant in the cabin, checked at P6 |
| Only person depicted = the client on the panel | **met** | §1.1, §9 |
| Distant fabric silhouettes optional, cut if weak | **met** | §3.9, with an explicit kill criterion |
| Vehicles sleek, black, metal and glass | **met** | §5.1, §5.3 |
| Variation is length/height/width only | **partial** | §5.1 adds three integer options (nacelles/fins/canopy). Defensible and probably better, but it is a small expansion of a stated rule — worth the manager confirming |
| Lights shared across civilian types; specials excepted | **met** | §5.4 |
| Vehicle sounds synthesised by agents | **met** | §10.1 |
| SUNO music/chatter droppable at any time, graceful absence | **met** | §10.3 — the HEAD-check + text-only fallback design is excellent, gated at P8 with zero files |
| Foreground chatter as a HUD popup held for a slow reader | **met** | §8.5 — 1.8 + 0.085/char, 6.9 s for 60 chars ✓, with a settings multiplier |
| No build step, importmap from CDN | **met** | §2.3 — 0.160.0 verified against 68 sibling games |
| Never `alert()`/`confirm()`/`prompt()` | **met** | §1 ship gate greps for it |
| Small sensible files under `js/` | **met** | §2.2 — 28 modules |
| Never `git add -A`; stage only our paths | **met** | §1, P10 |
| Test with headless Chrome + CDP, `?shot`/`?lite`/`?auto` early | **met** | §2.6, §12.4, P0 |
| `--virtual-time-budget` warning | **partial** | Honoured in spirit in `soak.mjs`; not restated (**N22**) |
| Reference bar / plate table | **met** | §12.1–12.2 |
| Blind critic protocol, gate, calibration, fixed plate, `SCORES.md` | **partial** | Protocol followed, but the tooling leaks which image is ours (**B9**) |
| Local generation servers, queue discipline, 24 GB constraint | **met** | §9.3, R5 — correct ordering; one wrong call signature (**B10a**) |
| One agent at a time; critic is the only concurrency | **met** | §12.4, §13 |

### DECISIONS.md

| Decision | Status | Where / note |
|---|---|---|
| 1. Plate substitutions accepted | **met** | §12.1–12.2 match; but §15.1 still presents them as open (**N19**), and the board rebuild is not in P1 (**N20**) |
| 2. Rear-view — no; keep the 2.2 ms spec | **met** | §8.7 |
| 3. Seeded infinite **plus an authored core** | **missing** | §3.1 says "no map file"; no landmarks, no keep-out, no data file; §15.3 still asks (**B1**) |
| 4. 16 clients | **missing** | 24 in §9.1, §9.5, P9, §15.4 (**B1**) |
| 5. Keep the 12 Japanese tiles | **met** | §3.5.2 |
| 6. Police and heat — ambient only, no heat system | **missing** | A full heat system across nine sections (**B1**) |
| 7. Sections must be self-contained | **partial** | Mostly true and unusually well organised; P1/P3/P7 are too large and several data specs are absent (**B14**, **N9**) |
| 8. SUNO unblocked, `docs/SUNO.md` extracted and complete | **missing** | The file does not exist; P0 is still tasked with creating it (**B1**, final note) |

---

## 5. What is good — leave these alone

- **§3.0 and the whole "spend nothing on geometry" thesis.** The read of `746850_01` is correct and
  the conclusions drawn from it are the right ones. This is the strategic core of the plan and it is
  sound.
- **§3.2's global-instanced-mesh-with-chunk-slot-ranges scheme.** Rejecting per-chunk instancing is
  the right call and the reasoning (100 draws before a single sign) is exactly right. The per-chunk
  LOD migration bound of ~40 matrix writes is good engineering.
- **§3.5 as a whole.** Treating signage as a first-class subsystem is the correct priority call, and
  §3.5.3's four rules for the abstract glyph generator (shared sub-grid, constant stroke width,
  varying advance, word grouping) are genuinely insightful — that is the difference between an alien
  script and paint spill, and it is worth more than the shader work.
- **§3.5.5's two placement rules.** Perpendicular blades and cluster-don't-sprinkle are the two rules
  that will carry the density score. Do not let a later phase weaken either.
- **§3.10, the seven scale cues.** The best section in the document. The window-pitch ruler, the
  strobes every 60 m and the fixed signage size bands are cheap, correct and mutually reinforcing,
  and the instruction "a builder must not fix a small-looking sign by scaling it up" pre-empts the
  exact mistake that would be made.
- **§4.2's height-fog idea** (not its colours or its multiplier interlock) — a smog band with a hard
  top that doubles as an altitude marker across the whole skyline is ten lines of GLSL for a large
  return, and the plan is right that it is the highest-value shader work available.
- **§4.3's analysis of "daytime but still dark".** Correctly identifies that the sky is bright and the
  buildings are not, and that the instinct to raise ambient is the failure mode.
- **§4.6 item 4, the blue-noise dither, kept in LOW.** Correct and correctly reasoned; landing it in
  P1 rather than polish is the right scheduling call.
- **§5.1's single hull generator.** One curve language, variation by L/W/H, is exactly the brief and
  it means new craft cost nothing.
- **§6.3's "attitude is a decoration, not a state variable"** and the guarantee that velocity never
  reads visual attitude. That single sentence is the mechanism that makes flying easy, and it is the
  thing most likely to be accidentally broken later — it deserves the emphasis it has.
- **§8.5's read-time rule**, and §8.7's reasoned refusal of the rear view with a costed fallback.
- **§9.6's absence behaviour** and §10.3's manifest-with-every-slot-listed design. "The game is fully
  playable with the entire `assets/clients/` directory deleted, and P9's gate includes running it
  that way" is exactly the right discipline, and the same is true of the zero-audio-files P8 gate.
- **§10.1's traffic-net bed.** A procedural, deliberately unintelligible radio murmur running from
  frame one is the single best idea for the no-people problem, and it costs almost nothing.
- **§11's writing.** The chatter is genuinely good — "Nine flavours. All of them are paste.",
  "Cancel the mayday. I found a ledge. It'll do.", "Craft that cannot descend should continue.",
  "Log it as weather." These have a voice and they will make the city feel inhabited. All of Aaron's
  formatting rules are followed exactly: every chatter Style field says spoken-word-only, every
  lyrics field is a single prompt with bracketed instructions, and **all seven shouted lines carry
  both a bracket tag and capitalised text** (B2, C1, C2, C3, C4, and both in C5). The two lyric
  tracks each justify their vocals correctly. The problem in §11 is volume and distribution
  (**N14–N16**), not craft.
- **§12.3's "where the points actually are"** — the instruction to resist adding building detail after
  a failed round, with the rebuild priority ordered signage → fog → reflection → windows, is the
  single most useful paragraph for a builder in the whole document.
- **§12.4's tooling lessons** — `freePort()` before launching Chrome, shot-id validation, capturing
  console exceptions so a black frame explains itself, and the `TRIM` table's origin story. These are
  scars from real sessions and they are worth carrying.
- **§14's risk register**, particularly R4's prediction that the docking panel gets rushed. It is
  correct; it just needs the phase plan changed to act on it (**B14**).
