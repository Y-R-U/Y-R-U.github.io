# KITEHAWK — props: `poster.js` and the D39 verdict

**Owner: agent G.** Implements **D37**'s `poster.js`, answers **D39**, and runs D38's blind-critic
contact sheet. Written 2026-08-24.

Evidence: `art/tools/`, `docs/refs/poster/`, `docs/refs/probes_d39/`. Fourteen new plates, ~29
minutes of queue time, shared with another agent's jobs throughout — no OOM, no stall.

---

## 1. Verdict in one paragraph, including the part that is bad news

`poster.js` exists and it does what D37 asked, measurably. On every prop plate in the project it
lifts the warm-key/cool-shadow contrast from **10–35 into the 44–74 band where the two reference
plates sit** (`p08` 45.5, `p04` 81.9) — it recovers by code exactly what the neutral-light clause
strips, with no prompt change — and it removes the residual cast shadow deterministically on every
neutral-lit plate tested. **D39 is answered in favour of the first option: keep §7's neutral-light
rule, accept props as the hard case, lean on `poster.js`** (§4, with the cost stated). **But D38's
other condition is NOT met. Three blind critics over two rounds all identified the reference
instantly and scored our prop sheet 3.33 against it, a gap of −4.5 against §9's gate of −2.0, using
"flat", "posterise", "filter" and "wallpaper" throughout.** `poster.js` is necessary and it is not
sufficient. **The small-prop half of `TERRAIN` is therefore still blocked**, and §7 says what the
remaining blockers are and which of them are not `poster.js`'s to fix.

---

## 2. What `poster.js` does, and why each pass is there

`art/tools/poster.js`. Runs between `key.js` and `trim.js`, vanilla Node, no npm, no native deps —
`img.js` (ported verbatim from `gms/2d/sunderfall/art/tools/`) is the whole raster layer.

D37 specified four passes. All four are implemented. Two of them needed a different mechanism from
the one the finding assumed, and two more passes were added because the first results were not good
enough. Each is stated with what it is actually doing.

### Pass 1 — `dropShadow`

**D37 assumed the cast shadow "will already be a separate low-luminance blob under the content bbox
and is trivially detected". It is not.** Measured: the shadow is 80–90 luma below the backdrop, far
past `key.js`'s threshold, so it keys **fully opaque**. A partial-alpha rule finds nothing, and the
first implementation returned `shadowPx: 0` on the plate that visibly has one.

What does separate it, measured across `t01 t02 t03 t08 t10` (props), `p04` (cloud) and `z10`
(zeppelin):

| test | shadow | everything else in the candidate set |
|---|---|---|
| an achromatic darkening of the backdrop — `p ≈ s·bg`, `s ∈ (0.30, 0.965)`, small residual | yes | **a grey building passes this too** |
| wide and flat — bbox aspect | **5.6 / 6.3 / 10.6** | 0.6 – 1.8 |
| low in the content bbox — `topFrac` | **0.84 / 0.91 / 0.84** | 0.00 – 0.71 |

The first test alone is the trap, and it is worth stating plainly: **a grey object is a scaled copy
of a grey backdrop**, so `t01`'s 34,823-pixel hangar wall passes it cleanly. Adding aspect ≥ 2.5 and
`topFrac` ≥ 0.72 rejects the wall, the cloud and the airship while still catching every shadow. The
component is then dilated by 4 px to sweep its own decontaminated soft rim.

A fourth test was added later: a cast shadow is also **thin**. Measured heights as a fraction of the
content bbox are 0.06 / 0.09 / 0.06, so components taller than 0.15 are rejected.

`despeckle` follows it and removes opaque islands under 120 px — the crumbs the backdrop's own paper
grain leaves behind. It started at 40 and was raised because a blind critic itemised individual
debris specks and "green pixel confetti" in the backdrop of the contact sheet.

**Known limit, and it is load-bearing for §4.** The rule models a shadow as *neutral*. A prompt that
asks for directional light produces a **violet** cast shadow which is not detected
(`d39_gun_L1warmcool`: `shadowPx 0`). Raising the residual tolerance from 16 to 45 catches the Act-II
variant — and **it also took the bottom third of the gun's brass shell stack**, because brass bands
are wide, flat and low in frame too. The statistics did not show that; only looking at the output
did. `resMax` therefore stays at the measured 16, a tinted shadow is out of scope, and this is a
cost of the option D39 rejects rather than of the one it adopts.

### Pass 2 — luminance quantise, 5–7 bands

As specified, with three details that turned out to matter:

- **Band the form, not the surface.** Quantising raw luminance turned the hangar's weathered wall
  mottle into large blobs — a textbook posterise-filter artefact. A small bilateral finds the form
  first; the surface texture is added back afterwards at `detail` amplitude.
- **Band centres, not endpoints.** Snapping to the 2nd/98th percentile pushed whole wall panels to
  the top of the range. Centres keep the ends off the rails.
- **The dither is the paper grain, not Bayer.** Band boundaries then break along paper fibres the
  way gouache pools, instead of on a visible 4×4 grid. A separate *undithered* band map drives
  pass 3b, because running the ink accent off the dithered map scatters it as speckle.

### Pass 3 — split tone (added; the D39 answer)

Not in D37's list. The top bands are leaned cream and the bottom bands violet, as a **luma-preserving
tint** — both directions satisfy `0.299·dr + 0.587·dg + 0.114·db = 0`, so the temperature moves and
the value structure the quantiser just built is left exactly alone. This is the whole mechanism by
which §7's neutral render can still read as painted, and §4 is its measurement.

**The cool end is tapered**, to 40% at the bottom of the ramp rising to full by `t = 0.35`. At full
strength the darkest band went saturated navy while its parent body stayed olive, and a blind critic
called that out as *"the single most obvious processed tell on the sheet … a white-balance or levels
error applied to the shadow end, not a paint decision."* The warm end keeps full strength.

### Pass 3b — wet edge (added)

Gouache and poster work pool pigment where one flat tone meets the next, and that dark accent is a
lot of what the eye reads as *painted* rather than *rendered*. Drawn on the darker side of every
band boundary, so it follows the form the quantiser found rather than tracing an outline.

### Pass 4 — paper grain

`art/tools/grain.js` extracts the grain from **one of our own plates** by high-pass, picks the
window with the least drawing in it (lowest local mean of |high-pass| at a scale above the tooth),
clips the spikes and writes `art/tools/paper_grain.png`. Donor default is `p01_sky_dawn`, whose best
window is bare washed paper; `p08`'s best window still carries two cloud rims. Sampled with
**mirrored** wrap, so it never seams, at a per-prop offset *and one of the eight square symmetries*
so forty props do not wear the same fibre in the same direction — a blind critic looking at eight
baked props called out *"the brush streaks run in the same near-vertical direction on every object
regardless of that object's form"*, which is exactly what one tile at one orientation does.
Multiplied in at `grain` opacity.

### Pass 5 — `roughEdge`

Softens the matte, displaces the boundary along a two-octave noise field, re-sharpens. Wander is
about ±1 px at the default.

**This one had a real bug worth recording.** The first version ran over the whole image and punched
white holes through the middle of both hangars. Cause: a grey prop on a grey backdrop keys with
genuinely *semi-transparent patches inside it* — the pale wall panels sit within a few units of the
backdrop colour — and re-sharpening drove them to zero. The fix is that the pass is confined to a
4 px collar around the true silhouette, found by flood-filling the outside from the frame border.
Interior alpha is never touched.

### The `--maxHole` trade, which a critic caught and the statistics did not

The same root cause suggested a second fix: raise `key.js`'s hole-fill ceiling from `0.00008` to
`0.004` so painted ground stops showing through the hangar doors. It does fix the hangar
(`docs/refs/poster/in_situ.png`). **It also fills genuine openwork**, and the first blind critic
named the consequence unprompted: *"the wagon's wheel spokes have salmon-pink sky between them"* —
the gaps came back as backdrop grey and the split-tone warmed them.

Measured alpha histograms of enclosed non-opaque regions on the two subjects overlap almost exactly,
so **no threshold separates "veil" from "real gap".** It is therefore a **per-asset flag, default
off**: use it on solid grey-on-grey subjects, never on anything with openwork. `poster.js` also
gained a `veil` guard so a backdrop-coloured opaque pixel is never tinted, which makes the flag safe
where it is used.

The deeper lesson for whoever writes the `TERRAIN` manifest: **a grey prop on a grey backdrop is a
keying problem at generation time.** Consider a backdrop the subject does not contain.

### Two presets, because one set of numbers does not fit both prop classes

| preset | for | bands | dither | smooth / range | detail | ink | temp | sat | grain | edge |
|---|---|---|---|---|---|---|---|---|---|---|
| `mech` (default) | rounded rendered metal — gun, bowser, wire spool | 5 | 0.30 | 3 / 20 | 0.52 | 0.20 | 0.60 | 1.15 | 0.10 | 0.22 |
| `struct` | large flat planes with surface texture — hangar, hut, tower | 7 | 0.25 | 4 / 30 | 0.70 | 0.14 | 0.50 | 1.05 | 0.12 | 0.16 |

`detail` was raised and `ink` and `edge` lowered from the first tuning after the critic round in §7
called the result "a posterise-and-cutout pass"; §7 lists which knob answers which complaint.

`mech` exists to break a smooth gradient into flat tones, which is D37's actual complaint. On a
building there is no gradient to break, so hard banding fights the surface texture instead of the
lighting, and an architectural silhouette that gets chewed reads as damage rather than as brush.
Like `model` (D21/D36), this is a **per-asset manifest field**, not a global.

---

## 3. Before / after

Both baked at `--maxdim 360`, seed 5. "Before" is the **same** crop → key → resize → trim with
`--bypass 1`, so the comparison isolates this one step and nothing else.

| | before | after |
|---|---|---|
| worst offender, `t01_hangar_oldgrammar` | `docs/refs/poster/t01_hangar_before.png` | `docs/refs/poster/t01_hangar_after.png` |
| best so far, `t10_aagun_twotone_noassetphrase_4b` | `docs/refs/poster/t10_aagun_before.png` | `docs/refs/poster/t10_aagun_after.png` |
| all four together | `docs/refs/poster/before_after.png` | |
| the same four on painted ground | `docs/refs/poster/in_situ.png` | |

**`in_situ.png` is the one to look at**, because a cutout that reads fine on a paper swatch can
still look pasted on once it sits in the world. Before: cool grey props with clean machine edges and
a grey shadow fighting the field. After: the tent and the shell stack carry warmth that belongs with
the ground, the wheels and roof go cool, the edges are hand-cut, the shadow is gone.

Measured, on the plates E graded 6/10 (chroma = mean `max−min` of RGB; split = mean `R−B` of the
lightest quartile minus the darkest quartile, which is warm-key-against-cool-shadow in one number):

| plate | chroma before → after | **split before → after** |
|---|---|---|
| `t01` hangar (old grammar) | 25.7 → 37.3 | 38.1 → **84.2** |
| `t02` hangar (new grammar) | 23.7 → 31.1 | 28.4 → **71.5** |
| `t03` aagun (9B) | 14.8 → 22.3 | 17.6 → **50.1** |
| `t08` aagun (4B) | 17.5 → 22.8 | 13.1 → **37.5** |
| `t10` aagun (4B) | 15.0 → 21.2 | 16.1 → **39.5** |
| — reference `p08_hero_9b` | 43.7 | 45.5 |
| — reference `p04_cloud_cutout` | 43.1 | 81.9 |

All figures are on the final settings, re-measured after §6's fixes. **The metric is not the gate.**
It says the warm/cool contrast is now in the right band, and §6 says three blind critics still score
the result 3.33 — both are true, and the second is the one that decides.

Chroma stays below `p08`'s and that is correct: `p08` is a full-colour scene plate, and a shared
prop is supposed to arrive with value structure and let §4's ramp-map supply the act colour.

**Said honestly, three ways it is not a magic wand:**

1. `t01` is improved but not rescued. It is a photoreal architectural render made with the
   *superseded* §7 grammar; post-processing makes it flatter and more graphic and cannot make it a
   gouache painting. The fix for that class is D34's stem, and `poster.js` on top.
2. The pale mottle on both hangars survives, because it is genuinely in the plate. `--bands 7`
   (the `struct` preset) and `--smooth` control how far it gets promoted.
3. A tinted cast shadow is not detected — see pass 1.

---

## 4. The D39 A/B

`docs/refs/probes_d39/`, manifest `d39.json`, reproduce with
`python3 gen_d39.py d39.json .`. Two subjects (`gun` seed 13, `hangar` seed 12) × four lighting
clauses, **everything else identical** — same D34 stem, same subject clause, same isolation tail,
same model (4B, per D36), same 768×512, same 16 steps. Only the LIGHT clause varies.

| id | LIGHT clause |
|---|---|
| **L0** | `even overcast light, low saturation, neutral grey-blue` — §7's rule, the control |
| **L1** | `warm cream sunlight on the upper surfaces and cool violet shadow below` — `z10`'s winning clause |
| **L2** | `low warm gold sunlight raking from the left, deep violet-blue shadow on the undersides, dusty ochre and cream and violet, high summer` — act-exclusive, Act II in palette |
| **L3** | `even flat light with a warm cream key on the upper surfaces and a cool blue-grey shadow below, low saturation, restrained colour` — a hybrid: keep the neutral saturation, add the direction |

Grids: `docs/refs/probes_d39/_grid_raw.png` and `_grid_baked.png`.

| subject | light | raw chroma | raw split | **baked chroma** | **baked split** |
|---|---|---|---|---|---|
| gun | L0 neutral | 17.0 | **12.7** | 21.7 | **34.8** |
| gun | L1 warm/cool | 33.2 | 42.7 | 43.6 | 81.9 |
| gun | L2 Act II | 39.6 | 77.4 | 53.4 | 121.3 |
| gun | L3 hybrid | 24.5 | 16.0 | 31.0 | 47.8 |
| hangar | L0 neutral | 21.2 | **23.3** | 32.7 | **71.1** |
| hangar | L1 warm/cool | 44.1 | 48.8 | 59.9 | 94.3 |
| hangar | L2 Act II | 57.8 | 94.9 | 76.2 | 146.4 |
| hangar | L3 hybrid | 36.1 | 45.8 | 48.5 | 86.7 |
| *reference* | `p08_hero_9b` | 43.7 | **45.5** | | |
| *reference* | `p04_cloud_cutout` | 43.1 | **81.9** | | |

### What it says

**E's flag was right about the diagnosis.** L0 raw sits at split 10–21 against references of 45–82.
The neutral clause really does strip the warm-key/cool-shadow contrast, and that really is a large
part of why props do not look painted. Look at the raw grid: L0 is flat olive, L1 and L2 are visibly
paintings.

**But the conclusion goes the other way, because the bake closes the gap.** L0 + `poster.js` lands
at split 34.8 and 71.1 — in the reference band, from a plate that carries no act colour at all.
L1 and L2 baked overshoot to 82–146, well past both references; they read garish and they are locked
to one act.

**There is also a fact in `ART.md` worth surfacing to the manager.** §7 requires shared assets to be
neutral-lit *because the ramp-map supplies colour at runtime*, and yet **`p04_cloud_cutout`, the
plate §8 calls "excellent — the pipeline result", was prompted with `warm cream sunlit top-left face
and cool violet-grey shadowed underside` and is therefore not neutral-lit.** The best shared asset
in the project already breaks the rule. What it actually has is neutral *saturation* with a
directional *temperature* — which is exactly what L0 + `poster.js` produces, and exactly what a
luminance→colour ramp can still retint.

### Verdict

**Adopt option one: `TERRAIN` props stay shared and stay neutral-lit per §7, and the painted look is
restored deterministically by `poster.js`.**

### What it costs — stated plainly

- **Prop chroma lands at 21–33 against `p08`'s 43.7.** Props will look under-saturated beside
  act-exclusive terrain **unless §4's ramp-map is actually implemented and actually supplies act
  colour**. This verdict makes props dependent on the LUT. If the LUT is ever cut, props must be
  re-prompted per act and this decision reverses.
- **The baked warm/cool axis is fixed at bake time.** A modest split survives a ramp remap as
  subtle variation (`p04` proves the shape works), but a prop cannot carry an act-specific key hue
  — Act III's cool moonlight key has to come from the LUT, not from the prop.
- **One more bake step in the chain**, with two presets and a per-asset field to get wrong. Cheap,
  and it is deterministic and re-runnable from `art/raw/`.
- **Props do not share a key-light direction, and a blind critic counted six different ones across
  eight props** (§6). Neutral light does not mean *no* direction, it means *unspecified* direction,
  and the model picks a different one each time. `poster.js` unifies temperature but cannot unify
  direction. If this turns out to matter more than the LUT does, the cheap partial remedy is to add
  a fixed direction *without* colour — e.g. `light from the upper left` with the saturation clause
  intact — which was not one of the four clauses tested here and is the obvious next A/B.
- **What is NOT paid, which is the point:** no 5× atlas for five act variants of every shared prop
  (§4's byte ceiling), no baked act colour, and no saturated cast shadow needing a hand matte. The
  L1/L2 plates all carry one; `poster.js` cannot lift it, and it would land on whoever bakes 40 props.

**Fallback, if a specific prop still reads dead after baking:** use **L3**, not L1 or L2. It keeps
saturation low (chroma 24.5 / 36.1, against L1's 33.2 / 44.1) so it stays broadly LUT-compatible,
and its cast shadow stays neutral enough for `dropShadow` to find. Record it in the manifest as a
per-asset light override, the same way `model` and `preset` are recorded.

---

## 5. How to bake a prop

```bash
# one prop, atlas-sized, from a raw Flux plate
node art/tools/bake.js art/raw/terrain/aagun.png art/work/terrain/aagun.png \
     --maxdim 320 --preset mech --seed 3

# a building or a large flat-planed prop
node art/tools/bake.js art/raw/terrain/hangar.png art/work/terrain/hangar.png \
     --maxdim 360 --preset struct --seed 7
```

`bake.js` runs **crop (4% inset, §7 step 1) → key → poster → trim** and prints the size, the
estimated backdrop and the pass statistics. `--seed` picks the grain offset and orientation, so it is free
to change and it **should differ per prop** — that is what stops forty props wearing the same brush
direction.

**`--maxHole 0.004` for solid grey-on-grey subjects only** (a hangar, a hut). Never on anything with
openwork — it fills the gaps. See §2.

Useful flags: `--bypass 1` (same pipeline, `poster.js` off — this is the honest "before"),
`--shadow 0` (leave a cast shadow alone), `--bands` / `--temp` / `--ink` / `--grain` / `--edge` /
`--smooth` / `--detail` / `--sat` / `--collar` / `--resMax` / `--maxHole`, all with the defaults
listed in `poster.js`'s `DEFAULTS` and `PRESETS`.

Supporting tools, all in `art/tools/`:

| file | what |
|---|---|
| `img.js`, `key.js` | ported verbatim from `gms/2d/sunderfall/art/tools/` |
| `grain.js` | `node grain.js [srcPlate] [out] [tile]` — rebuild `paper_grain.png` |
| `poster.js` | the bake step; also usable standalone with `--bgfrom raw.png` |
| `bake.js` | crop → key → poster → trim, the command above |
| `sheet.js` | `node sheet.js out.png a.png b.png … --cols 4 --cell 384 --bg paper\|sky\|night --ground plate.png` — contact sheets, including over painted terrain |

**Generate large and downscale** (D37). `--maxdim` resizes *before* the grain and edge passes, so
the paper tooth and the hand-cut silhouette land at the size the atlas actually ships; baking at
1024 and letting `atlas.js` shrink it afterwards throws both away.

---

## 6. Blind-critic contact sheet — the result, which is a fail

**Sheet:** `docs/refs/poster/prop_sheet.png` — eight baked `TERRAIN` props (`prop_sheet_ground.png`
is the same eight on painted ground). **Reference:** `docs/refs/probes/p08_hero_9b.png`.

Protocol per `ART.md` §9 and D10. Each critic was given two unlabelled files in **randomised** order
and told only that one *may* be shipped professional work. No critic was reused; the round-2 critic
was fresh and got a re-baked sheet. None was told which plate was ours, and the round-2 critic
explicitly declined to open the answer key that was sitting next to the plates.

| round | sheet | critic picked the reference? | ours (mean of 6 axes) | reference | **gap** |
|---|---|---|---|---|---|
| 1 | first bake | yes | 3.33 | 8.00 | **−4.67** |
| 1 | first bake | yes | 3.33 | 8.00 | **−4.67** |
| 2 | after fixes | yes | 3.33 | 7.67 | **−4.34** |

`ART.md` §9's gate is **mean gap ≥ −2.0**, plus two consecutive rounds in which no critic uses
*flat*, *uniform*, *the same ambient*, *sticker*, *tiling*, *repeated* or *wallpaper*. **Neither
condition is met and it is not close.** All three critics identified the reference immediately, and
all three described our sheet as post-processed source rather than painting: *"a prop sheet with a
painterly post-filter applied on top of underlying geometry"*, *"photo/3D-render source run through
a posterise-and-cutout pass"*, *"matted photo/render fragments"*.

Per §9, the differences lists matter more than the numbers, and they were unusually concrete. Round 2
produced a 23-item artefact inventory with pixel coordinates. Sorting it by owner:

### Fixed in this pass — they were `poster.js`'s fault

| critic's words | fix |
|---|---|
| "salmon-pink sky between the wagon's wheel spokes" | `--maxHole` demoted to a per-asset flag, plus the `veil` guard |
| "the wheels are saturated navy while their bodies are olive … a levels error applied to the shadow end" | cool end of the split tone tapered at the bottom of the ramp |
| "the brush streaks run in the same near-vertical direction on every object" | per-prop grain orientation |
| "1–3 px ring of half-erased dithered speckle instead of an edge" | edge noise moved from 0.28 fine / 0.72 coarse to 0.12 / 0.88, and re-sharpened harder |
| "isolated dark speck … green pixel confetti" | `speck` 40 → 120 |
| "hard posterisation banding … four or five flat plateaus" | `detail` raised, `ink` and `edge` lowered in both presets |

### NOT `poster.js`'s to fix — these are generation defects, and they are why the sheet still fails

Every one of these is in the raw plate. No bake step can remove them, and they are the real reason
the sheet reads as broken rather than as merely un-painterly. **This is the list the `TERRAIN`
manifest has to solve.**

1. **Ground gets painted in despite `no ground`.** A grass-and-dirt patch under the plank hut, a
   green groundline under the hangar and tent. Two critics itemised these independently. `no ground`
   is a negative, and D22 already says negatives are close to inert.
2. **Amputated and impossible structure.** The watchtower's legs stop in mid-air; the field gun has
   no trail or spade; the machine-gun post has no right-hand support. This is a *structure* failure,
   and 9B is the structure model — **it argues that D36's "4B for props" needs a carve-out for props
   with a load-bearing part tree.** Flagged as a REQUEST.
3. **Repeats inside one asset.** "The three drums are one drum instanced", "the two crates are the
   same crate". **D35's `all different, no two alike` clause was not in these prop prompts and should
   have been** — D35 says any multi-item sheet needs it, and a prop containing several of one object
   is a multi-item sheet. My omission.
4. **Period drift.** A searchlight/locator trailer, pneumatic tyres, red-oxide modern roofing. For a
   WWI game a critic called three of eight assets post-1930.
5. **No shared key-light direction.** Props generated independently under overcast light each carry
   their own residual direction, and a critic traced six different ones across eight props. This is
   inherent to §7's neutral rule and is the one place where the D39 verdict has a visible cost.
   `poster.js`'s split tone unifies *temperature* but cannot unify *direction*.

### Not a defect — an artefact of how the comparison was staged

- **Scale spread across the sheet** ("7.5× px/m"). `sheet.js` fits each cell independently; the
  atlas packs at authored size. A future sheet should be laid out at one px/m with a shared
  baseline. Real risk for the atlas, not a property of the assets.
- **Composition scored 2–3.** A prop sheet has no subject by construction and is being compared with
  a staged hero frame. The light, colour and paint axes are the fair ones, and they are also the
  ones we lose worst.
- **"No cast shadows … seven of eight assets float."** Removing the shadow is what `poster.js` is
  *for* — a baked shadow cannot respond to the act's light. Contact shadows belong to the renderer
  (D5, paint the world / code the actors). **REQUEST for the renderer agent: `TERRAIN` props need a
  code-drawn contact shadow, or they will float exactly as the critics describe.**

---

## 7. What the next agent should do, in order

1. **Add `all different, no two alike` to every prop prompt** containing more than one of a thing
   (D35). Free, and it kills the instanced-drum complaint.
2. **Re-prompt the five structurally broken props on 9B** and check whether the part tree resolves.
   If it does, D36 gains a carve-out: 4B for props, 9B for props with load-bearing structure.
3. **Deal with painted-in ground deterministically.** `no ground` does not work (D22). Either crop it
   at bake time — it is a bottom-edge band, so a bbox-relative rule like `dropShadow`'s would find
   it — or generate on a backdrop colour the ground cannot be confused with.
4. **Give the renderer contact shadows** before judging any prop sheet again.
5. **Re-run §9's protocol on a scene shot, not a prop sheet** — three critics, an Act II frame with
   props in it. That is the test the gate was written for, and it is the one that decides whether
   the atlas is safe.

Do **not** re-tune `poster.js` first. Two rounds of tuning moved the numbers not at all (3.33 → 3.33)
while the differences lists changed completely, which is the same shape as the NEONHAUL result in
§9 and means the remaining gap is not in this step.
