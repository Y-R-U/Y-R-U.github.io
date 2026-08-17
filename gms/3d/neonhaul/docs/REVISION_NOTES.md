# NEONHAUL — build plan revision notes

What changed in `BUILD_PLAN.md` in response to `PLAN_REVIEW.md`, what I disagreed with, and what is
still open. This is a record, not a specification — the plan is the specification.

All fourteen blocking issues are addressed. Four of the review's specific claims were wrong or
incomplete and are corrected below with the reasoning; in every one of those cases the review's
*finding* was right and only its arithmetic or its suggested constants were off.

---

## 1. How the three.js claims were verified

Not from memory. I downloaded the pinned build and read it:

```
curl https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
curl https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/{EffectComposer,UnrealBloomPass,OutputPass,RenderPass,ShaderPass}.js
curl https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/LuminosityHighPassShader.js
```

`REVISION = '160'` confirmed in the file. Shader chunk bodies and `ShaderLib.physical`'s include
list were read by importing the module in node and printing them, not by grepping for names.

| claim | how it was checked | result |
|---|---|---|
| `output_fragment` → `opaque_fragment` | `three.module.js:19613` — `[ 'output_fragment', 'opaque_fragment' ], // @deprecated, r154`. `ShaderLib.physical.fragmentShader` contains `#include <opaque_fragment>`. | **Confirmed.** The old name survives only as an include *alias*, so a `.replace()` on `#include <output_fragment>` matches nothing. |
| `viewDir` → `geometryViewDir` | `three.module.js:13940`, `lights_fragment_begin` declares `vec3 geometryViewDir = …`. No `viewDir` identifier exists. | **Confirmed.** |
| `saturate` still available | `three.module.js:13878`, `common` chunk: `#ifndef saturate / #define saturate( a ) clamp( a, 0.0, 1.0 )` | **Confirmed available** — the review was right that this one is fine. |
| `fog_fragment` declares and consumes `fogFactor` in one chunk | `three.module.js:13910`, full body read | **Confirmed.** The whole `#include` must be replaced. It also uses `smoothstep`, not a lerp — see §3 below. |
| ACES never applies through a composer | `three.module.js:30147–30155` — `let toneMapping = NoToneMapping; if (material.toneMapped) { if (_currentRenderTarget === null …) toneMapping = _this.toneMapping; }` | **Confirmed, and the ambiguity is resolved.** The review hedged ("whichever way r160 resolves it"); it does not resolve either way — with a composer the define is simply never set. The first branch is the real one: the game would have shipped with no tone mapping at all. |
| `EffectComposer` default RT is `HalfFloatType` | `EffectComposer.js:27` | **Confirmed** — it is the default, so the risk is only a builder passing their own target. |
| `UnrealBloomPass` is 13 passes | `UnrealBloomPass.js:229–290`, counted `fsQuad.render()` calls: 1 high-pass + 5×2 blur + 1 composite + 1 blend | **Confirmed.** |
| `UnrealBloomPass` already halves | `UnrealBloomPass.js:184` — `setSize` does `Math.round(width / 2)` unconditionally | **Confirmed.** |
| Negative determinant already flips winding | `three.module.js:29177` — `const frontFaceCW = ( object.isMesh && object.matrixWorld.determinant() < 0 );` and `:23433` — `if ( frontFaceCW ) flipSided = ! flipSided;` | **Confirmed.** `InstancedMesh extends Mesh`, so `isMesh` is true. |
| `textureGrad` on WebGL2 | `three.module.js:20237` — the WebGL2 fragment prefix defines `#define texture2DGradEXT textureGrad` | **Confirmed but refined** — see §3 below. |
| `WebGLRenderTarget` accepts `samples` | `three.module.js:2965` — `this.samples = options.samples` | **Confirmed.** |
| `vWorldPosition` safe to inject on `MeshStandardMaterial` | `ShaderLib.physical.vertexShader` lines 3 and 40 declare it **only** under `#ifdef USE_TRANSMISSION`; `'transmission' in new MeshStandardMaterial()` is `false` | **Confirmed, with the reason.** |
| `wait_for_ltx_idle(local_job, …)` | read `site/gms/2d/awake/regen_helper.py:712` | **Confirmed.** Required positional, and mutated on line 723. |
| `LuminosityHighPassShader` knee width | `UnrealBloomPass.js:78` — `smoothWidth = 0.01`, hardcoded | **Confirmed** — the threshold is effectively a hard cut, which matters for §4.4's re-derivation. |

---

## 2. `DECISIONS.md` compliance — the three contradictions

**Decision 3 — seeded-infinite plus an authored core.** §3.1's "there is no world edge and no map
file" is gone. New **§3.1.1** specifies eight landmarks (inside the 6–10 band) across three named
districts, authored purely as data in `data/landmarks.json` — existing §3.3 prototypes at larger
scale with hand-chosen signage and palette overrides, so the marginal cost is ~3,100 triangles and
zero new materials or draw calls. The keep-out rule is stated as a hard rule with a fixed lookup
order that puts the landmark table *before* the seeded field, and it applies to buildings, zone pads
and lane nodes alike. New **§3.1.2** adds `data/names.json`, which also closes N9's naming gap. Both
files are in the §2.1 tree, both are P2 dependencies and both are named in P2's brief. Player spawn
is now specified (on the `spindle` podium deck), which closes the other half of N9 — the first draft
put the HUB at the world origin, where chunk (0,0) generates 28 buildings with no keep-out.

**Decision 4 — 16 clients.** Changed in §2.1, §9.1, §9.5, §14 R5 and P9. §9.1 now states the
data-driven requirement explicitly: `clients.json`'s **length** drives the generator, the pad↔client
hash, the job board and the asset budget, **no file under `js/` may contain the literal 16**, and
raising it later is adding rows plus one script re-run. §7.1 specifies the pad↔client hash, which
the first draft never did (N9).

**Decision 6 — no heat.** Removed from all nine sections: §2.2, §2.7, §7.1, §7.4, §8.3, §8.7,
§10.3, §10.4, §15, plus the `nocturne`/"silent running" knock-on. `HOT` became **`RUSH`** — same
2.2× pay and tight timer, nothing raised. The `chase` music slot keeps its id and filename (so
anything already generated still drops in) but retriggers on a rush timer under 30 s and is retitled
in `SUNO.md`. "Silent running" retargets to **cell efficiency**, which gives `nocturne` a real
selling point in a game with nothing to hide from. §7.4.10 lists every deletion explicitly and tells
a builder to report any surviving heat reference rather than implement it, and P7a's done-criteria
is `grep -rn "heat" js/` returning nothing. §15 is replaced by a table pointing at `DECISIONS.md`.

---

## 3. Where I disagree with the review

The review is accurate and its arithmetic was spot-checked twice, so these are stated with working
rather than asserted.

### 3.1 The fog multiplier is worse than the review calculated — `1,927 m` was optimistic

The review says `uClearMul = 0.45` gives "effective full-opacity distance `60 + 840/0.45 = 1,927 m`".
That arithmetic presumes **linear** fog. three.js's `fog_fragment` is
`float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );` (verified verbatim), and `smoothstep`
saturates at 1.0 at `fogFar`. The first draft then did `fogFactor = clamp(fogFactor * k, 0, 1)`, so
above `uClearY` the fog factor **saturates at 0.45 and never reaches 1.0 at any distance at all**.
There is no 1,927 m; there is no distance.

This makes the finding stronger, not weaker — three separate claims elsewhere in the plan were
silently false rather than merely optimistic (§3.2's "culling is done by fog", §3.6's "beyond ~900 m
the fog takes it entirely", and the LOD boundary being hidden). The fix in §4.2 scales the fog
*distance* rather than the fog *factor*, which makes the review's formula literally correct as a
definition: `V(k) = fogNear + (fogFar − fogNear) / k`. **The review's number becomes true once the
shader is fixed.**

### 3.2 Fog alone cannot hide the LOD swap — the review's option (ii) does not close either

The review offers "(i) `clearMul ≈ 0.9`" or "(ii) raise `ringNear` to 3 plus a cross-fade". I
checked both and neither closes on its own.

Correct radius first: LOD0's conservative radius is **512 m** (`ringNear × 256`), not 640 m. 640 m
is the *centred* half-width and assumes the camera sits at a chunk centre; it can sit at a chunk
edge. The first draft's "1280 m" was the full width. All three numbers appear in the document and
only 512 is the one a constraint can be written against.

To get residual visibility at the boundary to a genuinely hidden ≤ 0.15 you need
`smoothstep(60, V, 512) ≥ 0.85`, i.e. `t ≥ 0.733`, i.e. `V ≤ 60 + 452/0.733 = 677 m` — which breaks
the far skyline that `fog_city` exists to prove. Option (ii)'s `ringNear = 3` costs `49/25 = 1.96×`
the LOD0 instances (~265k triangles in LOD0 alone) and still does not reach 0.15.

So §3.2.1 states the constraint at what fog *can* deliver — `vis(R₀) ≤ 0.45` — which solves to
`V ≤ 907 m` and therefore **`uClearMul = 1.0`**: the clean-air multiplier disappears entirely, and
the tower-top clarity comes from the murk being 2.2× thicker rather than clean air being thinner
than base. The remaining 44 % is closed by §3.2.2, which is mandatory rather than optional: the two
geometries are made to match (including deleting the first draft's "window UV tiling halved" at
LOD1, which was both the loudest half of the pop and a breach of §3.4's pitch rule), signage ramps
out over the last 15 % of the band, and a blue-noise dither cross-fade covers the swap. Cost: two
`discard`s and zero draw calls.

The interlock is then written as two checkable constraints, and `budget.mjs` verifies them from
`config.js` with no rendering. It falls out of that check that **LOW's `fogFar` must drop from 520 m
to 420 m**, which the review did not catch — at `ringNear = 1` the radius is only 256 m.

### 3.3 The review's economy target and its suggested constants disagree with each other

The review sets the target "a delivery should pay 3–5× its fuel cost" and then suggests constants
that deliver **10.4×**: `base = 180 + 130·km` gives 414 CRD for the mock's job, and its own
"50-unit top-up ≈ 40 CRD" is 9.7 % of that, not 20–33 %.

I built to the constants' intent, not the stated ratio: **fuel is 8–12 % of a job's base pay**.
3–5× would make fuel 20–33 % of gross income in a game the brief calls relaxed, which is a very
different game.

Consequence: **CHARGE is 2.2 CRD/unit, not the review's 0.8.** Working — a job burns ~60 s of flight
at 0.32 units/s = 19.2 units; at 2.2 that is 42 CRD, which is 10.2 % of a 415 CRD base. At 0.8 it
would be 15 CRD, under 4 %, which is not a cost at all. Worth naming: **the fuel price was never the
bug.** It moved from 3.0 to 2.2 — a 27 % reduction. The payment formula being 5× too small was the
entire problem, and the review is completely right about that.

I also declined the review's cruise drain of 0.18/s (9.3 minutes per cell ≈ 9 jobs, which is too
rare to be a rhythm) in favour of **0.32/s** — 5.2 minutes, 5.2 deliveries, a top-up every fifth job.
And I made drain **throttle-proportional with a 0.05/s hover floor**, which the review did not
propose and which is what actually closes its "soft fail state" observation: a player who puts the
phone down while hovering no longer drains to zero.

### 3.4 N21 is right in principle and wrong as written

"Import `mflux_generate()` rather than rewriting the poll loop" — the function exists and does the
loop, but it hardcodes `"seed": int(time.time()) % 100000` (`regen_helper.py:735`). §9.4 requires a
**stable per-client seed** and requires LTX to reuse the portrait's seed; a wall-clock seed makes the
client set unreproducible and makes `--force` regenerate a different person. §9.3 now imports
`mflux_post` / `mflux_get` / `mflux_download` — where the retry and error handling actually live —
and wraps them in a twelve-line function that supplies the seed. Same principle, correct application.

### 3.5 One review fix was refined rather than adopted verbatim

`textureGrad` — the review says it is "available in WebGL2, no extension needed". True, but three.js
compiles material shaders as **GLSL ES 1.00 source** and prepends a compatibility block on WebGL2;
the idiomatic and portable call is `texture2DGradEXT`, which three's own `cube_uv_reflection_fragment`
chunk uses behind an `#ifdef`. §3.4 specifies that form. I also added two things the review's snippet
omits: the varying must be `highp` (a 700 m `pale` tower reaches `vTileUv ≈ 6.1` and mediump would
quantise the wrap), and the gutter should be filled with the **wrapped continuation** of the cell's
own periodic pattern, which makes bilinear bleed correct rather than merely hidden.

---

## 4. Everything else that changed, by blocking issue

| # | issue | where it landed |
|---|---|---|
| **B1** | three settled decisions contradicted | §3.1/§3.1.1/§3.1.2, §7.1, §7.4.10, §9, §15, and every heat reference in §2, §7, §8, §10 |
| **B2** | economy net-negative, 5× internal inconsistency | §7.4 rebuilt as §7.4.0–§7.4.10, with two worked examples and the tier-2 timing |
| **B3a** | fog/LOD do not interlock | §3.2.1 (the rule + per-variant table), §3.2.2 (the cross-fade), §4.2 (the corrected shader) |
| **B3b** | fog colour darker than the buildings | §4.1 (five new colours), §4.1.1 (the derivation, the luminance table and the rule) |
| **B3c** | `patchFog` on additive materials | §4.2.1 — **three** modes, not the review's two: `opaque`, `additive`, `alpha`. A normally-blended lightbox that is fully fogged becomes a solid grey card unless its alpha fades too. |
| **B4** | window UV runs off the atlas | §3.4 rewritten with `fract` + `texture2DGradEXT`, `highp` varying, gutters and a clamped mip chain |
| **B5** | ACES never applies; bloom threshold meaningless | §2.3 (`NoToneMapping`, exposure as a uniform), §4.6 (pipeline order, six steps), §4.4 (threshold re-derived to **0.90** from a table of actual linear scene values) |
| **B6** | mirror double-flip and unspecified depth order | §3.7(b) — `DoubleSide`, a four-step draw-order table, and the "the road plane does not write depth" rule that makes it work; cost restated as 3 draws / 1.1 ms |
| **B7** | zero headroom, chunk gen budgeted twice, gates unmeasurable | §3.11 rebuilt to **13.4 ms** with 3.3 ms headroom; §3.2.3 gives one number (1.2 ms/frame, defer at 6 ms); §3.11.2 sets a 6 ms Mac *proxy* gate and puts the real phone measurement in P10 |
| **B8** | fill-rate items unpriced | §3.11.1 — the 0.35 ms/screen rule with its derivation, and the four repriced items; shafts 8→4 (§4.5), halos capped and gated (§4.4), zones nearest 3 (§7.1), backdrop blur replaced with an in-frame `drawImage` (§7.3) |
| **B9** | critic loop leaks | §12.4.1 — **nine** tells and their fixes, covering the review's five plus ordering bias, metadata, resampling direction, colour profile, padding and the black-level floor |
| **B10** | pipeline breakages | §9.3 (`wait_for_ltx_idle({})` and the mflux primitives), §9.2 (`trim=start_frame=1:end_frame=48`, 96 frames, 4.00 s), §3.5.6 (`oxipng` mandatory + an IHDR colour-type assertion) |
| **B11** | iOS video | §9.6 — the exact element, the `play().catch()` degradation, and a mobile-emulation P9 gate |
| **B12** | four wrong `onBeforeCompile` targets | §3.7(c) (`opaque_fragment`, `geometryViewDir`), §4.2 (`worldpos_vertex`, whole-chunk `fog_fragment` replacement), §2.3 (the `patch()` helper that warns on a miss) |
| **B13** | platform lifecycle missing | new **§2.8** — all seven, each with the sibling file to copy from, in P0's scope and done-criteria |
| **B14** | three phases too large | §13 — fourteen phases with a section-mapping table; P1→P1a/P1b, P3→P3a/P3b, P7→P7a/P7b; shafts' anchoring moved to P3b, shot cameras declared placeholders at P0 and frozen at P3b |

**Non-blocking items also fixed** (cheap): N1 draw/tri accounting, N2 the bloom half-res myth, N3
MSAA on the composer target, N4 `info.reset()`, N5 atlas gutters, N6 the damping/top-speed
contradiction, N7 the altitude contradiction, N8 `ALT_MAX` 520→760, N9 all six missing data specs
including the `?auto=1` autopilot in §2.6, N10 glyphs on the minimap and marker, N11 `wet_street`
moved to P3b, N12 the `day_smog` crop (x₀ 0.63) and its recorded expected deficit, N13 the
overstated plate analysis, N14–N16 the chatter distribution, N17 `split_chatter.py`'s failure path,
N18 M9's tag style, N19 §15, N20 the board rebuild in P1a, N21 (see §3.4 above), N22 the
`--virtual-time-budget` warning in §12.4.

**Not touched, per instruction**: §3.0's thesis, §3.2's instancing scheme and its reasoning,
§3.5.3's four abstract-glyph rules, §3.10's seven scale cues, §6.3's "attitude is a decoration",
§10.1's traffic-net bed, §12.3's rebuild-priority paragraph, and the zero-assets P8/P9 gates. §3.2's
band *radii* and generation *budget* changed; the instancing scheme itself did not.

---

## 5. `docs/SUNO.md`

Created. §11 of the plan is now a ~30-line pointer carrying only what a *builder* needs (pool sizes,
the split tool's failure path, the manifest rule); every prompt lives in `SUNO.md`.

It is organised for Aaron rather than for the plan: filenames and save paths first, a "generate
these seven first" list, then music / background / foreground, each slot numbered with its target
filename and marked required or optional. Every Style and Lyrics block is a clean copy-paste with no
editing needed. **All three formatting rules are preserved** and are restated at the top of the file
— spoken word only with the Style field saying so, one prompt in the Lyrics field with instructions
in `[square brackets]`, and shouted lines carrying both a bracket tag and capitalised text. Every
new line I wrote follows them; the one violation in the original (M9's `[spoken, distorted]`) is now
`[Man Speaking, distorted]` per N18.

**The chatter distribution fix**, which was the point of the extraction:

| | before | after |
|---|---|---|
| accept-confirm lines | **1** | **8** (`dispatch_confirm`, its own group) |
| pay lines | **1** | **8** (`dispatch_pay`, its own group) |
| civilian/ambient lines | — | **8** (`life`, new — N16) |
| foreground total | 33 | **57** |
| all slots | 49 | **73** |
| SUNO generations | 15 | **21** |

The two forced job-event lines were being heard **every ~90 seconds, forever**, which with people
absent from the world (§1.1) is the fastest possible route to a dead city. Eight lines each is sized
against a long session: 45 minutes is ~30 jobs, so a given line returns about every twelve minutes.
Six (the review's suggestion) would have been ~7.5 minutes and still noticeable.

**The repeat window claim is now true rather than adjusted.** The review is right that a 12-line
window over 33 lines permits a repeat at line 13, i.e. `13 × 36 s =` 7.8 minutes, not the claimed 20.
§10.4 replaces the window with a **two-stage shuffle bag** — weights pick the group, each group draws
without replacement — and the binding case is a five-line group drawn roughly every seventh line:
`5 × 7 × 36 s ≈` **21 minutes**. That number is stated with its working in both files, and P8's
done-criteria asserts it with a 25-minute virtual-clock run rather than trusting it.

---

## 6. Phase self-containment re-check (decision 7)

Each of the fourteen phases was re-checked against the section list in §13's table.

Three gaps were closing themselves as a side effect of other fixes and are worth naming, because
they were the specific things that would have made a phase un-executable:

- **P2** could not have built the city from §3.1–§3.3 alone: no landmark data, no keep-out, no spawn
  point, no name table. §3.1.1 and §3.1.2 supply all four.
- **P7a** could not have built the economy from §7.4 alone: `risk` was undefined, job selection was
  undefined, shop prices did not exist, and the payment formula contradicted the panel. All defined
  in §7.4.2, §7.4.5, §7.4.9, and the mock is now derived from the formula.
- **P0** could not have built the harness from §2 alone: no lifecycle spec at all. §2.8 supplies it
  with a sibling file per item.

Two remaining soft dependencies, both stated in the plan rather than left implicit:

- **P1a** builds the light shafts' geometry and view-dot term but cannot anchor them, because
  anchoring needs chunk gaps. §4.5 says so and P3b owns the anchoring.
- **P0** writes placeholder `shots/*.json` because there is no city to aim at; §12.1 says so and
  P3b authors and freezes the real cameras before the first scored round.

**P1b is fully independent** — it touches no game code and produces two files — so it may run first
or alongside P0 if the manager wants the schedule back. It is the only place the one-agent-at-a-time
rule could safely relax.

---

## 7. Still open — for the manager, not for a builder

One item, raised by review N13 and deliberately **not** decided in the plan.

**Are 2D figurative poster or hologram images on billboards permitted?**

Re-opening `1488490_00` at full resolution shows its four most prominent signage elements are large
figurative poster art — an anime face, a character on a CJK board, a mural, an illustrated panel —
plus real-CJK text blocks. §1.1 currently forbids "nothing figurative" on hero billboards, but the
brief's rule is explicitly about **3D character models in the world**, and a greyscale poster tile of
a face costs exactly the same in an atlas we are baking regardless as an abstract one.

This is not a builder's call and it is not mine. If the answer is yes, budget 6–8 `hero`/`panel`
tiles for it — it is the single cheapest way to close the density gap against `1488490_00` and
`1939970_00` (whose most striking element is a giant pink holographic figure). If the answer is no,
nothing changes; the plan as written already ships all-abstract hero tiles.

I have softened §3.5.0's overstated plate count either way, because the justification for
"abstract is the default" was leaning on a number the plate does not support. The narrower and honest
version — the near field is figurative and legible, the mid and far fields are not, and almost all of
our signage lives in the mid and far fields — supports the same conclusion and survives someone
opening the plate.
