# Foliage — grass, flowers, shrubs, loose stone, trees

Owned file: `js/world/scatter.js`. Additive changes to the `foliage` block of `js/world/zones.js`.
Nothing else was touched.

This round: **a conifer exploration** (Aaron: *"we could try a pine tree look? as this could be a
triangle prism? with a texture?"*) plus **a real lighting bug** the blind critic found — foliage was
being lit far brighter than everything else in the world.

---

## 1. The lighting bug — measured, confirmed, fixed

The critic's read was that fog or hemisphere light was being *added* to foliage. That is not what
was happening, but the effect was the same and the cause was worse.

`materials.js` owns `setEnvIntensity`, which walks the materials it built and sets
`envMapIntensity = envPower` (default **0.28**). **Foliage builds its own materials inside
`scatter.js`, so it was never in that list** and every grass card, crown, bush and rock kept the
Three default of **1.0**. Foliage was drawing the sky IBL at **3.57× the rest of the world**.

Verified in-page before touching anything:

```
["wall",0.28] ["trim",0.28] ["roof",0.28] ["road",0.28] ["water",0.6]
["light:grass",1] ["light:canopy",1] ["light:fringe",1] ["light:bush",1] … all 1.0
```

Measured with `scratch/lum.mjs`, which renders each shot three times — full, `treeStyle=none`,
`foliage=0` — and diffs to get an exact per-pixel mask for "tree", "tuft" and "the ground each
stands on". sRGB Rec709 luminance, 800×450.

| wall_day | before | after |
|---|---|---|
| sky | 0.694 | 0.694 |
| canopy | **0.561** | **0.373** |
| ground behind canopy | 0.674 | 0.674 |
| canopy→ground separation | 0.113 | **0.301** |
| tufts | 0.424 | 0.339 |
| ground behind tufts | 0.432 | 0.468 |
| tuft→ground separation | **−0.008** (tufts *brighter*) | **0.129** (tufts darker) |
| canopy p97 | 0.866 | 0.730 |

| creek_day (after) | |
|---|---|
| sky | 0.772 |
| canopy | 0.269, p97 **0.681** |
| ground | 0.568 |

Every target the critic set is met: peak foliage p97 0.681 against a 0.72 ceiling, canopy→ground
separation ≥ 0.12 in both shots, tufts darker *and* more saturated than the mat they grow from.
The treeline no longer dissolves into the horizon, and the frame passes a squint test.

Three new knobs, all in the World group:

- **`foliageEnv`** (default **1.4**) — a *multiplier* on `envPower`, not an absolute. Leaves are
  translucent so a little above the world's figure is right; 3.57× above it was the bug. It
  subscribes to `quality.onChange` so it still tracks the Sky bounce slider.
- **`canopyLevel`** (default 0.78) — `material.color` scalar on canopy, fringe, bush and all three
  conifer meshes.
- **`grassLevel`** (default 0.78) — the same for grass cards.

`foliageEnv` at 1.0 looks correct in daylight but turns the shadowed verge in `street_dusk` into
black spikes. 1.4 keeps the daylight separation and puts the dusk verge back.

`TUNING.canopy.top` / `bush.top` / `cone.top` were also added: the ramp now only travels 60–72 % of
the way to `leaves[1]`, because the light zone's `#c2d9a4` at full strength is a pale mint that
reads as a highlight rather than a leaf. `canopy.rim` went 0.2 → 0.14 for the same reason.

---

## 2. Three conifer candidates

All three are built in a unit box (`y` 0..1, radius ±1) so **one instance matrix drives whichever
is selected**, and every tree carries an instance in *every* variant. `treeStyle` is therefore a
repack of 66 matrices per zone, not a rebuild — anything the current style does not want gets
`count = 0` and is never drawn, so only one crown's triangles are ever paid for.

### `cone` — 4 stacked tiered skirts, 56 tris

Each tier is a cone standing on its own rim plus a downward-facing fan closing that rim
(`under: 0.34` crushes it to 34 % value). The overhang of a tier over the one below is the whole
trick: it casts the dark horizontal band that makes a conifer legible at 40 m. Rim radius *and* rim
height are jittered per segment, so the tier edge is never a straight line in profile. No texture.

### `prism` — Aaron's idea taken literally, 12 tris

Three tapered three-sided prisms of different heights clustered on one trunk, flat-shaded, with the
needle band alpha-tested across each face. **Four triangles a spike.** Reads as a cypress or a
Lombardy poplar rather than a spruce — a narrow, very dark vertical accent. This is by far the
cheapest thing in the file: 69 % less than the broadleaf crown.

### `spire` — 4 open skirts + 3 needle spray cards, 36 tris

The skirts without their undersides (24 tris) plus three alpha cards at the tier rims (12 tris) to
break the outline. Softer and flatter than `cone` because nothing casts the tier shadow band.

### `mixed` — per-zone fraction, and the current default

`foliage.conifer` in `zones.js` gives the fraction of a zone's trees that are conifers: **light
0.18, neutral 0.4, dark 0.85**. Broadleaf keeps the valleys and the light zone, conifers take the
ridges and the dark zone. `TUNING.tree.conifer` names which conifer geometry `mixed` uses (`cone`).

`treeStyle` also has a `none` option, which is what `scratch/lum.mjs` uses to isolate tree pixels.

---

## 3. Numbers

Gate profile, `--preset=medium --dpr=1 --w=844 --h=390`, `foliage = 0.6` (119 trees).
"tree tris" is trunk + whichever crown is drawn, counted by traversing the scene.

| style | tree tris | foliage tris | renderer tris | calls | tex MB |
|---|---|---|---|---|---|
| `broadleaf` (previous round) | 13 920 | 76 780 | 499 735 | 78 | 50.60 |
| `cone` | **9 600** (−31 %) | 72 460 | 492 535 | 75 | 50.60 |
| `prism` | **4 320** (−69 %) | 67 180 | **481 975** | 75 | 50.60 |
| `spire` | **8 160** (−41 %) | 71 020 | 488 215 | 78 | 50.60 |
| `mixed` ← default | 11 776 (−15 %) | 74 636 | 496 143 | 84 | 50.60 |

**Every conifer option is cheaper than the broadleaf.** An all-`prism` world is **18 k renderer
triangles** below the previous round — if the project needs to claw back toward the 350 k budget,
that is the lever, though it costs the broadleaf mass entirely.

`mixed` costs +6 draw calls because both the broadleaf and the conifer crown meshes are live in
all three zones. 84 of a 150 budget.

Texture: **50.43 → 50.60 MB** of 60. The only addition is `foliage:needle`, a 256×128 RGBA atlas
(0.17 MB with mips), tracked through `track()` like the rest. It is built in every configuration,
so the figure does not change with `treeStyle`.

Headed gate, all five scored shots:

| shot | gpu p95 | cpu p95 | calls | tris |
|---|---|---|---|---|
| wall_day | 5.0 ms | 2.8 ms | 84 | 496 k |
| street_dusk | 5.6 ms | 2.7 ms | 83 | 495 k |
| gate_night | 5.7 ms | 2.5 ms | 53 | 313 k |
| town_night | 7.9 ms | 3.0 ms | 84 | 496 k |
| creek_day | 5.3 ms | 3.0 ms | 84 | 496 k |

Budget 11 / 6 / 150 / 350 k / 60 MB. Inside everything except triangles, which this round reduced
again (499.7 k → 496.1 k in `mixed`, 482.0 k in `prism`).

---

## 4. The premultiplied-alpha trap (this cost the most time)

The needle cards rendered as **pure black spikes**. Two separate causes, both worth knowing about
because they will bite any future alpha card:

1. **A 2-D canvas stores partly transparent pixels premultiplied.** Uploading the element hands the
   shader `rgb·a`, and once mipmapping averages a thin alpha shape, the level whose alpha still
   clears `alphaTest` arrives with its colour already multiplied down to near-black. `paint()` now
   goes `getImageData` (unpremultiplied) → manual row flip → **`DataTexture`**, and `bleed()` floods
   the opaque pixels' colour out over every transparent one so a mip only ever fades the alpha.
   Every foliage texture now goes through this, which also quietly cleaned up the grass and leaf
   cards' dark fringes.
2. **Non-uniform instance scale flattens a card's normal.** A conifer crown is scaled roughly
   (1.2, 5, 1.2). The normal matrix is the inverse transpose, so a card's up-biased `(0.42, 0.9,
   0.42)` normal comes out of it as `(0.35, 0.18, 0.35)` — nearly horizontal, catching cool sky
   instead of sun. `pushCard` takes an `up` option for this; the sprig cards use `up: 3.8`.

Neither is visible in a level-0 texture dump or a vertex-colour dump. The way to find it is to
substitute a plain white material and see whether the *shading* or the *albedo* is wrong.

---

## 5. zones.js — exactly what was added

Additive only. No existing key renamed or revalued. Another agent was editing the `robe` blocks at
the same time; every edit here was a surgical `Edit` against a freshly read file.

| key | light | neutral | dark |
|---|---|---|---|
| `foliage.needles[3]` | `#6d8b6a #9cb790 #2f4030` | `#5f7448 #8e9d6c #26301c` | `#37472f #5a6a4e #121810` |
| `foliage.conifer` | 0.18 | 0.4 | 0.85 |

`needles` is `[mid, light, dark]`, the same order as `grass` and `leaves`. It runs darker and less
yellow than `leaves`, which is most of what tells a fir from an oak at 60 m.

---

## 6. Dev scenarios

`Scatter.devScenarios()` registers `tree_macro`, `tree_stand` and `grass_macro`, **only under
`?dev=1`**, so `--all` still renders exactly the five the critic scores. `tree_stand` is the new one
— a stand of a dozen trees at 30 m, which is the distance the choice actually has to work at.

```
node tools/shot.mjs --shot=tree_stand --w=1280 --h=720 --dpr=1 --set="dev=1&treeStyle=cone"
```

Side-by-side comparison sheets are in **`shots/styles/<style>/{creek_day,wall_day,tree_stand}.png`**
for all five styles. Regenerate with:

```bash
for s in broadleaf cone prism spire mixed; do for sh in creek_day wall_day tree_stand; do
  node tools/shot.mjs --shot=$sh --w=1280 --h=720 --dpr=1 --set="dev=1&treeStyle=$s" --outdir=shots/styles/$s
done; done
```

`scratch/lum.mjs --shot=wall_day [--extra="foliageEnv=3.57&canopyLevel=1&grassLevel=1"]` reproduces
the before/after luminance table; `--extra` with those values is exactly the previous round's
lighting.

---

## 7. Things that were tried and did not work

*(the previous round's list still stands — DoubleSide grass, raw-ratio blade roots, filled fringe
discs, pure broad-leaf panels, painting flowers with the grass painter. New this round:)*

- **Winding.** Both `tierGeo` and `prismGeo` were written apex-last in increasing angle order, which
  is the *inward* face. Everything rendered as bare trunks. Going from a base ring at angle `a` to
  `a+Δ` to the apex is backwards; it has to be `a+Δ`, `a`, apex.
- **`InstancedMesh.computeBoundingSphere()` after setting `userData.max`.** It only walks up to
  `mesh.count`, and at that moment `count` was still 0 from the previous style. Result: an empty
  sphere with `radius = -1`, and the whole mesh silently frustum-culled. `count` has to be set
  *before* the call.
- **Bleeding the alpha map only a few pixels.** The first `bleed()` ran five dilation passes. That
  is enough for the grass atlas and nowhere near enough for the needle spray, where the gaps between
  needles are 20 px wide — a coarse mip averaged the remaining black straight back in. It has to
  flood to saturation (it is a BFS now, one pass, O(N)).
- **Thin `stroke()`d needles.** A 2 px line is almost entirely antialiased edge; there are no solid
  interior texels for the mip chain to keep. Every needle is a filled triangle now.
- **`receiveShadow` on the sprig cards.** They sit inside the skirt that shadows them, and a
  shadowed alpha card against a lit crown reads as a black spike. `cast: false, receive: false`.
  (This turned out to be a red herring for the *original* black spikes — the normal squash was the
  real cause — but it is still the right setting.)
- **`under` on all four `cone` tiers vs. the lower two only.** Skipping the upper undersides saves
  14 triangles and loses the shadow band that makes the top of the tree read. Kept on all four.

---

## 8. Which one I would pick

**`mixed`, which is what the default now is.** One knob (`treeStyle`) flips it to any of the five.

- `cone` is the strongest single conifer: the tier undersides give it a value structure nothing else
  here has, and it reads unmistakably as a conifer at every distance from 15 m to the far ridge.
- An **all**-conifer world reads as taiga, not as a storybook village — the crowns are narrow, so
  the wooded rim thins out and the frame loses mass. `mixed` keeps the broadleaf mass in the valleys
  and uses the conifers as vertical accents and hard silhouettes on the ridges, which is better on
  the *Silhouette* axis (varied heights, no unbroken horizontal edge) than either pure world.
- `prism` is the one to reach for if triangles get tight, or as a *second species* rather than the
  main conifer — it reads as cypress and would suit a formal avenue or a graveyard.
- `spire` is the weakest of the three: without the tier undersides it is flatter than `cone` for
  more triangles than `prism`.

---

## 9. Still open

- **Bushes at night still read as pale green glowing balls** while the stone around them goes deep
  blue (`town_night`, bottom right). The hemisphere fill at `nightLift` is desaturated grey, so a
  green albedo stays green while a grey albedo takes the moon's blue. This is a `lighting.js`
  question, not a `scatter.js` one — the fix is a hue pull toward the moon colour on the night fill.
- **Ground decals are baked once and cannot follow `treeStyle`.** `terrain.finish()` runs after
  `scatter.build()`, so the crown-shade disc is sized from whether the tree was *born* a conifer
  (`foliage.conifer`). Flipping the knob to `cone` leaves broadleaf-width shade discs under narrow
  crowns in the zones where `conifer` is low. Invisible at shot distance; worth knowing.
- The near field is still instance-budget-limited, the fringe card still leaves a faint edge-on
  line, and crowns are still smooth domes above the leaf ring — all three from the previous round.
- The `rockGeo` `toNonIndexed()` console warning is gone (it was a no-op call on already
  non-indexed geometry).
