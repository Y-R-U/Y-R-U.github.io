# SKYHAMMER — ART NOTES

Written by the ART agent. Handover document for the **Three.js 2.5D renderer agent**.
Read `ART.md` first, then this. This file is findings, not instructions.

---

## 0. Status

The Canvas-2D renderer was cancelled mid-build (CONTRACTS §14, DECISIONS D12-D16). State of the
tree as I hand over:

| Path | State | Owner |
|---|---|---|
| `js/gfx/palette.js` | **LIVE.** I authored it; the 3D agent has since generalised it into a biome x timeOfDay x weather composition (D20). My values live on inside its `BIOME` / `TOD` tables. | **3D agent — not me. I have not touched it since.** |
| `js/gfx/bake.js`, `js/gfx/plates.js`, `js/gfx/models/` | LIVE, written by the 3D agent. Distinct files from the same-named copies under `dead2d/`. | 3D agent |
| `js/gfx/dead2d/**` | **DEAD.** Every file carries a DEAD banner. Nothing live imports it. Still parses, so it can be read for the cloud/sky bakes. Do not wire it up. | — |
| `tools/lab/plate_preview.html` | Background-bake preview harness. Not a game renderer. Verified still running against the current composed palette. | me |
| `shots/art/*.png` | The stills the verdict in §5 is based on. | me |

I never built the actors, projectiles, FX or explosion code. **There are no explosion findings** -
do not read anything into `ART.md` §5's explosion bullet beyond what the manager wrote there.
Treat explosions as entirely unexplored ground.

---

## 1. Palette - what I authored and what to know about it

The file is now the 3D agent's. This section is about the *content*, which is mine, and the two
conventions in it that are easy to misread.

`resolvePalette(biome, tod, weather)` composes 72 combinations from 13 authored entries and
returns one flat object: `sky.stops` / `sky.glow` / `sun` / `hemi` / `fog` / `earth` / `band` /
`cloud` / `water` / `prop` / `fx` / `post` / `star`. The seven originally required keys are all
reachable, and unlisted combinations fall back rather than crash.

**Angle convention - the thing most likely to be misread.** `sun.azimDeg` is
**0 = sun behind the camera (front-lit), 180 = behind the subject (fully backlit)**. Dawn and dusk
sit at 152-168, and that back-lighting is what produces the warm rim on props and aircraft. It is
most of why the reference looks the way it does. Midday sits at 55-78. Overcast is 96 with
`sun.intensity` dropped and `hemi.intensity` raised; under overcast there should be **no visible
sun disc at all** (see §5 - this is currently still wrong).

### Colour relationships that actually worked

1. **Background saturation under ~35% is not a style note, it is what makes the plane readable.**
   Every time I pushed a background colour more chromatic, the foreground lost separation.
2. **Enemy liveries are deliberately lower-contrast than every player livery.** `LIVERY.enemy` sits
   in the mid browns with a dull rim; the player's dark core + `#ffd9a0`-class rim always wins the
   frame. Do not "fix" enemies by making them pop.
3. **Distant bands must be mixed toward the horizon/fog colour, not toward the sky top colour.**
   Mixing toward zenith made mountains read as blue cardboard. The 3D agent's `resolvePalette`
   now *derives* the fog colour from the horizon stop, which enforces this automatically - that is
   a genuine improvement on what I wrote and it should stay.
4. **The hot horizon bloom belongs in the sky gradient, not only in a lens effect.** Baking it into
   the vertical ramp (peaking ~60 world units above sea level, falling off over ~900) is what makes
   the horizon feel lit rather than pasted.
5. Collectibles (`PICKUP`) keep fixed colours across every biome. A balloon that re-tints per
   palette stops reading as a pickup.

---

## 2. Composition — the most valuable thing I measured

This is the finding I would most want the 3D agent to have.

**`cam.vh` is 900 world units and `CAM.baseY` is −170, so the resting viewport spans world
y −170 … +730.** Everything below follows from that.

### Earth band height

| terrain crest, world y | earth band as % of frame | verdict |
|---|---|---|
| ~ +90 | **45%** | ground swallows the frame (shot `plates_farmland_dawn_*_t3.png`) |
| ~ −30 | ~18–20% | workable, still heavy (shots `plates_v2_*`, `plates_v3_*`) |
| ~ **−80** | **~10%** | the reference (`ART.md` §1) |

Solve for it: `earthTopPx = (730 − crestY) × (screenH / 900)`. For a 10% band on any screen,
`crestY ≈ −80`.

> **Warning.** `CONTRACTS.md` §2 says `heightAt(x)` "typically returns −60 … 420". **The top half of
> that range is visually unusable.** At `y = 420` the ground fills ~65% of the frame. Rolling
> terrain wants a crest around −110 … −20, with peaks only occasionally reaching +60. If the SIM
> agent has already generated terrain in the 60–420 band, that is a bug you will see as "the game
> looks like a mud field", and the fix is in the terrain generator, not in the renderer.

### Sky ownership
The reference gives the sky ~90% of the frame. Target **88/12**. Anything under 80% and the image
stops feeling like a flying game.

### Prop and aircraft scale — already correct in the data
- Reference farmhouse ≈ 9% of viewport height ≈ **81 world units tall**. `enemies.js` `hut` is
  `h:34` half-extent = 68 units of hitbox; **draw the art ~20% taller than the hitbox** (roof
  overshoot) and it lands on the reference.
- `factory` at `h:96` → 192 units → 21% of viewport height. That is correct; it is meant to be a
  landmark you can see coming.
- Player `len:120` at 844×390 → 52 css px → **6.2% of screen width**. The reference is 6.5%.
  **`planes.js` `len` values need no adjustment.** Do not scale planes up because they "look small"
  in isolation — small is the look.

### The horizon curve — reproduce this in 3D
The reference's ground is a shallow arc across the whole screen, not a line. I applied a
screen-space dome: `curveOffsetPx(sx) = amp × u²` where `u = (sx/W − 0.5) × 2`, `amp = 0.05 × H`
(19.5 px at 390 tall), added to screen y, zero at centre and maximum at both edges.

**It is the single strongest compositional element in every shot I took.** Compare
`plates_farmland_dawn_*` (curve present but drowned by a too-tall earth band) with
`plates_v3_farmland_dawn_*`.

In 3D this is easier than it was in 2D: dome the ground mesh, or displace vertices in the vertex
shader by `−k·(ndcX)²`. In 2D it forced me to abandon `ART.md` §5's cached terrain strips, because
a world-space bitmap cannot carry a screen-space curve without stair-stepping the horizon
(measured: ~2 px steps at 40 slices across an 844 px frame). **That constraint disappears in 3D** —
you get chunk caching and the curve at the same time.

One thing I got wrong and you should not: **the curve was applied to the land horizon but not to
the water horizon**, because water was drawn as a screen-space fill. In `plates_v3_sea_day_*` the
sea horizon is dead flat while every land horizon arcs. A single curved ground/sea mesh fixes both.

---

## 3. The readability law (`ART.md` §2) — how I was solving it

Not with a post-hoc check. Built into the drawing, as a fixed three-pass order per aircraft
(`js/gfx/dead2d/shapes/draw.js`, `bakeShape`):

1. **Dark expanded outline.** Every polygon filled *and* stroked at ~1.5 px in the outline colour →
   a dark silhouette slightly larger than the plane.
2. **Warm rim, offset toward the light.** The same polygon set filled again in `LIVERY.rim`,
   translated a couple of pixels toward the sun. Leaves a bright warm sliver along the lit edges.
   Authoring rim polygons by hand is a waste of effort — this generic offset pass does it for free
   and stays correct when the shape changes.
3. **The real fills on top.**

Plus a soft elliptical halo (`bakeHalo`) at ~2× plane size, a barely-visible lighter lift so the
plane cannot camouflage against a matching sky value.

The whole plane was to be **baked once per (shape × livery) at 256 px reference length** and drawn
rotated, rather than re-pathed each frame. In 3D the equivalent is: keep the dark base colour, put
the rim in as a real rim/fresnel term lit by `sun`, and keep the halo as a small additive sprite or
a bloom-only emissive — **do not drop the halo**, it is doing the work the sun cannot when the plane
crosses the bright horizon bloom.

**`tools/contrastgate.mjs` was never written, so the readability law has never been measured or
falsified on this project.** That work is entirely outstanding. When it is built, `ART.md` §2's
instruction stands: run it against a build with the plane drawn in sky colour and confirm it FAILS
before trusting a pass.

---

## 4. Clouds — this transfers, and here is exactly how

**Keep these.** In 3D they become textures on camera-facing planes at negative z. The bake is in
`js/gfx/dead2d/clouds.js` (`bakeMask`) and `dead2d/bake.js` (`tintMask`, `noiseAlphaTile`).

**16 sprites, 384 × 132 px alpha masks, baked once at boot.** Construction:

1. 9–14 radial blobs along a horizontal spine, each vertically squashed **0.42–0.62**.
2. Blob radius 0.055–0.13 of sprite width, multiplied by an edge-falloff term so the ends taper —
   this is what makes them **wide and flat** instead of a lumpy sausage.
3. Accumulate with `globalCompositeOperation = 'lighter'` so overlaps saturate to a solid core with
   soft edges.
4. **Flatten the base into a shelf**: `destination-out` a linear gradient from ~58% height downward.
   Skipping this gives fluffy cumulus balls, which is explicitly wrong for this reference.
5. One pass of value noise at alpha **0.16**. More than that and they read as dirty.

Tinting (`tintMask`): vertical gradient `cloud.top` → `mix(cloud.bot, band.haze, 0.25)`,
`destination-in` the mask, then **`source-atop` the mask again offset up 5.5% at alpha 0.20–0.30**.
That second step is the lit top edge and it is the difference between "painted" and "blurred". It
is worth reproducing as a texture detail or a simple gradient term in the material.

**Band values that looked right in the final shots** (parallax / count per tile / tile width in
world units / world y range / scale / alpha):

| band | parallax | n per tile | tile (world u) | world y | scale | alpha |
|---|---|---|---|---|---|---|
| far | 0.06 | 16 | 3700 | 420–1350 | 2.4–4.2 | 0.62 |
| mid | 0.18 | 14 | 4900 | 300–980 | 1.7–3.0 | 0.80 |
| near | 0.55 | 9 | 6100 | 150–700 | 1.0–1.9 | 0.95 |

I started at 5/5/3 per tile and it was **far too sparse** — the sky read as empty. Tripling the
counts and raising the mask core alpha from 0.85/0.50/0.12 to 1.0/0.72/0.22 is what fixed it.
Different tile widths per band are deliberate: equal widths make the repeat obvious.

**Still wrong, fix it in 3D:** all cloud is in the upper third and the sky just above the horizon is
empty. `ART.md` §1 says clouds are **more opaque near the horizon** and my altitude fade does the
opposite. Add a fourth band — very wide, very flat, high opacity, hugging world y 60–220.

---

## 5. Screenshot verdict — plainly

Based on `shots/art/`, at 844×390, dpr 1. I looked at all of these.

**`plates_v3_city_dusk_844x390_t3.png` — the best frame I got.** Warm horizon glow, stars coming
through the upper sky, mountains catching the light, cloud masses reading as painted. This one is
close to the reference and is a fair target.

**Right:**
- The horizon curve. Everything.
- Sky gradient blue → mauve → peach → hot bloom. Convincing at dawn and dusk.
- Earth as near-silhouette with essentially no interior detail — correct, and resist the urge to
  detail it.
- Trees breaking the crest line. Cheap, and it sells the silhouette.
- Alpine's near-white haze on distant mountains. The conifer treeline reads.
- Water's horizon reflection band.

**Wrong:**
- **Mountains are too warm and too saturated at dusk** (`plates_v3_city_dusk`) — they read as
  orange sand dunes, not hazed distance. `band.far` is being mixed too far toward `band.haze` at
  high `glowK`. Cap the haze mix, or desaturate the result.
- **A visible tiling seam** in the mountain/hill plates: a hard-edged flat-topped wedge just left of
  centre, in every frame. It is the 1600 px tile repeat. This **confirms the manager's worry about
  generated background plates is real, not theoretical** — anything tiled horizontally must be
  genuinely seamless or you get a defect once per screen width.
- **The mid-hills band (parallax 0.35) is invisible**, merged into either the mountains or the earth.
  Three ground bands is one more than the value separation supports; either pull it much darker or
  drop it.
- **Water specular glints read as rows of white dashes**, not sparkle — too regular, too rectangular,
  hard-edged. Wave bands are ruled lines at even spacing. Both need randomised length and soft ends.
- **Overcast still shows a sun disc bloom.** Under `alpine/overcast` there should be no disc at all;
  `sun.discK` is 0.16 and even that is too much. Gate the disc off when `intensity < 0.7`.
- **Alpine reads dead** — very low contrast, near-black earth against a pale grey sky, no colour
  anywhere. It needs either a cool blue shift in the shadows or a hint of warmth somewhere.
- Surface detail props (trees, tufts) are uniformly sized and evenly spaced — reads as a repeating
  stamp. Needs real scale variance and clustering.

---

## 6. Background plates — the swappable-source contract

The manager's requirement (background layers behind one door so a generated Flux plate can drop in)
was implemented by me as `js/gfx/dead2d/plates.js` (the 3D agent has since written their own
live `js/gfx/plates.js`; the contract below is what mine guaranteed): `getPlate(key, pal, palKey, variant, index)` with a
registered procedural baker as the **permanent** fallback, `setPlateSource()` to inject a bitmap,
and silent fallback if a source is missing, still loading, wrongly sized or throws. That structure
is worth keeping in 3D as a texture provider. The contract:

| key | px | tiles X | tiles Y | parallax | tinting |
|---|---|---|---|---|---|
| `sky` | 4 × 1400 | no | no | 0.00 | baked per palette; stretched to full viewport |
| `stars` | 512 × 512 | **yes** | yes | 0.03 | alpha-scaled by `star` |
| `sun` | 256 × 256 | no | no | 0.08 | additive |
| `cloud` (indexed 0–15) | 384 × 132 | no | no | 0.06 / 0.18 / 0.55 | **already palette-tinted; carries its own soft alpha; never tinted again at draw time** |
| `mountains` | 1600 × 400 | **yes — must be genuinely seamless** | no | 0.14 | baked per palette |
| `hills` | 1600 × 260 | **yes — must be genuinely seamless** | no | 0.35 | baked per palette |
| `water` | 512 × 512 | **yes** | yes | 1.00 | multiplied over the water gradient |
| `earthtex` | 128 × 128 | **yes** | yes | 1.00 | baked per palette |

Foreground art (props, aircraft, FX) is **not** a plate and must not become one: it needs real alpha
edges and per-piece damage states.

---

## 7. Performance

`p95` **background-only** draw time, measured in the preview harness, 844×390, dpr 1, headless
SwiftShader: **0.5–0.8 ms**. Treat this as close to meaningless for the 3D build — it is software
rasterisation, background layers only, no actors, no projectiles, no FX, no bloom pass. It is
recorded only to say that the layered-parallax background approach was never the cost problem.

**No 60 fps claim has been verified on any device for this project.**

---

## 8. Falsification ledger

Per CONTRACTS §13, gates must be proven to fail before they are trusted.

| gate | falsified? |
|---|---|
| `tools/contrastgate.mjs` | **NOT BUILT.** Outstanding work, and the readability law has therefore never been measured on this project. |
| console-error check via `tools/shot.mjs --console` | Not deliberately falsified. It did surface a real fault by accident: a zsh word-splitting bug silently fed `biome="city dusk"` to three captures, which fell back to `farmland/dawn` and produced three identically-wrong stills. **The HUD readout printing the resolved palette key is what caught it — the filenames looked fine.** Keep a resolved-state readout burned into any debug capture. |

Nothing in this document is backed by a gate. It is backed by looking at the images listed in §5.
