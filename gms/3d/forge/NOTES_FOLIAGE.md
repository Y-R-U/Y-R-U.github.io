# Foliage — grass, flowers, shrubs, loose stone, trees

Owned file: `js/world/scatter.js`. Additive changes to the `foliage` block of `js/world/zones.js`.
Nothing else was touched. `NOTES_TERRAIN.md` still covers the heightfield, creek and ground.

Brief was one line from Aaron on a phone: *"i think the trees may need a little work."*

---

## What was wrong

- **Trees.** Trunk + one smooth icosphere + a leaf fringe, all one flat colour. Read as a spiky
  green cone on a stick. No dark underside, no lit crown, no occlusion where trunk meets earth.
- **Grass.** Painted with a dark root (0.44 of the card's colour) so every card started on a hard
  dark line against pale ground. Placed one card per grid sample, so it read as an even sprinkle
  of sticks rather than tufts with bare ground between them.
- **Zone identity.** Only `grass[3]` / `trunk` / `leaf` existed in `zones.js`. Bushes, canopies,
  litter and the dry-bank tint were all hard-coded hexes in `scatter.js`, identical in all three
  zones. The brief's "three shades each per zone" was true of grass and of nothing else.

---

## 1. Trees

**Crown geometry (`blobGeo`).** Still one closed icosahedron at detail 1 — 80 triangles, unchanged
— but the displacement is now a sum of five wide overlapping lobes
(`r += amp · lobeWeight · max(0, dot(dir, lobeDir))^sharp`) plus a small noise octave, instead of
two octaves of value noise. Same cost, a clumped outline instead of an egg. Normals stay radial to
the *undisplaced* sphere, which keeps the shading soft while the silhouette stays ragged. Merging
several real spheres is still off the table — that is what produced the bright crack the previous
round removed.

**Crown colour is baked into the geometry, not the instance.** Vertex colour runs
`leaves[dark] → leaves[mid] → leaves[light]`, with `foliage.rim` mixed into the top third and the
bottom 22 % crushed to 26 % so the trunk join is genuinely occluded. On top of that a low-frequency
3-D noise mottles the crown ±30 %; **without the mottle a crown is one flat green mass at anything
closer than about 15 m.** Instance colour is now a near-1 brightness/warmth jitter
(`tint()`), because it multiplies the baked palette.

**Trunk.** Same 24-triangle three-point lathe, radii widened (0.46/0.22/0.115 → 0.54/0.29/0.165)
and a vertex ramp darkens the bottom 26 % to 32 %. That ramp plus the tight ground decal below is
what stops the tree reading as a sticker.

**Fringe.** Three alpha cards, 12 triangles, now offset off the trunk axis (`ox`/`oz`) and the leaf
texture is **rim-biased with an empty centre**. This matters: a card that fills its disc becomes a
solid dark slab straight through the crown the moment it is seen edge-on, and with three cards per
tree one always is. `cast: false` on the fringe as well — it was throwing a hairline shadow across
the crown it exists to soften. Its ramp is the canopy ramp compressed and multiplied by 0.86 so the
clumps read as leaves in front of the mass, not paper cutouts stuck on it.

**Ground dressing is deferred to after the cap.** This is the biggest single win in the file.
`tree()` used to emit a `propDecal` and a litter `clump()` for every *candidate*; about 613 trees
are generated and only 198 survive `CAP.tree`. So two thirds of the tree decals and two thirds of
the tree-base litter were being paid for by trees that never got drawn — the litter was eating
roughly a third of the grass instance budget. `tree()` now pushes a record into `set.pend`, which
is shuffled in lockstep with trunk/canopy/fringe, truncated to the cap, and only then emits
**two** decals (a wide crown shade and a tight one at the flare) and the litter clump.
`contactAO` went **11 344 → 8 789 triangles** despite going from one decal per tree to two.

---

## 2. Grass

**Two panels in one texture, no extra draw call.** `TEX.grass` is now a 512×160 atlas: left panel
the blade fan, right panel a low skirt of short broad leaves with blades standing through it.
`cardGeo` takes a `u0`/`u1` uv rect per card, so the two crossed quads of one clump take one panel
each. Every tuft therefore has two different silhouettes for the same 8 triangles.
*Pure* broad leaves (first attempt) read as agave at close range — the blades mixed back in fix it.

**The root takes the ground's hue.** `footRatio()` computes the per-channel linear ratio of
`groundTint` to `grass[0]` **with the brightness difference divided out**, and that goes into the
card's vertex colour at v = 0, fading to 1 by v = 0.42. Dividing out the luminance is essential:
the light zone's ground is far paler than its grass, and the raw ratio bleached the bottom half of
every blade white. The painted root also went 0.44 → 0.55, so a blade now starts in the earth
rather than on a black line.

**Tufts, not a sprinkle.** The sample grid went 2.15 → 2.7 m and each accepted point drops
`1..5` cards within 0.78 m, the count scaled by how near a scored camera it is. The cap then thins
everything in proportion, which is how the near field ends up dense while the far ridge stays
cheap. Colour varies *inside* a tuft (±23 %) as well as between tufts.

**Thinning is by tuft.** Items carry a group id and `groupShuffle()` shuffles whole groups. Without
this the `foliage` density knob turned every clump straight back into a sprinkle at anything below
1.0 — and `medium` runs at 0.6.

---

## 3. Flowers

They were reading as solid purple sticks: the instance colour multiplies the whole card, so
painting a flower like a blade of grass tints the stalk too. `flowerHeads()` paints the stalk at
rgb 46 — dark enough that any hue times it reads as a stem — and only the head near-white.
Count is down (440 → 300 cap, lower acceptance) and they are shorter. They are the one saturated
accent and they were not being sparing.

---

## 4. Bushes

Same `blobGeo` with 3 lobes, flatter (`flat` 0.55 → 0.68, `sy` 0.82 → 0.70) and a
`bush[dark→mid→light]` vertical ramp. Bushes dropped by verge/wall clumps are much smaller and sunk
deeper (`0.35–0.78 × size`, sunk 24 %) — at the old size they were pale beach balls sitting on the
road verge in `street_dusk`.

---

## 5. zones.js — exactly what was added

Additive only. No existing key was renamed or changed in value. Every new array is **[mid, light,
dark]**, matching the order `grass` has always used.

| key | light | neutral | dark |
|---|---|---|---|
| `foliage.leaves[3]` | `#82a070 #c2d9a4 #41573a` | `#77873f #b9c47e #333f22` | `#44553f #6f8064 #1a2219` |
| `foliage.bush[3]` | `#7d9569 #99ad85 #54694b` | `#68763f #84915a #3e472a` | `#3f4d3a #586552 #212a20` |
| `foliage.dirt[3]` | `#a3927a #c2b39a #7f7059` | `#8a7a58 #a89871 #645640` | `#4c483f #605b4f #332f29` |
| `foliage.sand[3]` | `#d5c9a8 #eae0c6 #b3a586` | `#c2b489 #dbd0ab #9d9068` | `#6e6a5c #877f6d #514d43` |
| `foliage.rim` | `#d6cd9c` | `#c4b878` | `#7b8a65` |
| `foliage.density` | 1.15 | 1.0 | 0.85 |
| `foliage.trees` | 0.85 | 1.0 | 1.25 |

`rim` is the warm colour mixed into a sunlit crown. `density` scales grass acceptance and `trees`
scales tree acceptance — both were requested in the previous round's notes. `dirt` replaced the
hard-coded `0x8f7a4a` litter tint, `sand` replaced `0xa8a055` (waterline) and `0xb8b063` (dry bank).
The old `foliage.leaf` and `foliage.trunk` keys are left in place and `trunk` is still used.

---

## Numbers

Measured at the gate profile, `--preset=medium --dpr=1 --w=844 --h=390`, foliage instance counts at
`foliage = 0.6`. Triangles are per-mesh visible geometry, summed by traversing the scene, not the
renderer's figure (which also counts the shadow passes).

| mesh | before | after |
|---|---|---|
| grass ×3 | 43 920 | 44 640 |
| bush ×3 | 10 800 | 10 800 |
| canopy ×3 | 9 600 | 9 600 |
| rock ×3 | 5 400 | 5 400 |
| trunk ×3 | 2 880 | 2 880 |
| flower ×3 | 3 168 | 2 020 |
| fringe ×3 | 1 440 | 1 440 |
| **foliage total** | **77 208** | **76 780** |
| `contactAO` (terrain, mostly tree decals) | 11 344 | 8 789 |
| whole scene, renderer figure | 505 k | 499 k |

**Foliage is 428 triangles down and the scene is 6 k down**, with two ground decals per tree instead
of one. `CAP.grass` is 3 100 (was 3 050); `CAP.flower` 300 (was 440). Nothing else moved.

Texture memory: **50.18 → 50.43 MB** of a 60 MB budget. Foliage's own share went 0.26 → 0.55 MB
(`foliage:grass` 512×160 = 0.42 MB, `foliage:leaf` 128×128, `foliage:flower` 96×96). All three go
through `track()`.

Headed perf gate, `--preset=medium --dpr=1 --w=844 --h=390 --headed --perf`:

| shot | gpu p95 | cpu p95 | calls | tris |
|---|---|---|---|---|
| wall_day | 5.3 ms | 2.6 ms | 78 | 500 k |
| street_dusk | 5.6 ms | 2.6 ms | 77 | 499 k |
| gate_night | 5.5 ms | 2.2 ms | 48 | 317 k |
| town_night | 7.4 ms | 3.1 ms | 78 | 500 k |
| creek_day | 5.4 ms | 2.9 ms | 78 | 500 k |

Budget 11 / 6 / 150 / 350 k / 60 MB. Inside everything except triangles, which the project was
already 45 % over before this round and which this round reduced.

---

## Dev scenarios

`Scatter.devScenarios()` registers `tree_macro` and `grass_macro`, **only under `?dev=1`**, so
`--all` still renders exactly the five the critic scores. `tree_macro` frames the tallest surviving
tree that is still near a scored camera (`this.trees`, filled in the cap loop).

```
node tools/shot.mjs --shot=tree_macro --w=1280 --h=720 --dpr=1 --set=dev=1
```

---

## Things that were tried and did not work

- **Brightening the blade root towards the ground colour with a raw channel ratio.** The light
  zone's `groundTint` is roughly 2× its `grass[0]` in the red and blue channels; the bottom half of
  every card came out near-white and the whole map looked frosted. Fixed by dividing the luminance
  out of the ratio and keeping only the hue.
- **Filling the fringe card's disc with leaves** so they'd read as clumps across the crown instead
  of a necklace. Looks better head-on, but any card seen edge-on becomes a hard dark slab running
  from the top of the crown to the ground. Reverted to a hollow centre and shortened the card.
- **A pure broad-leaf second panel.** Reads as agave/aloe at road-verge distance in `street_dusk`.
  Blades mixed back in over the top.
- **Painting flowers with the grass blade painter.** The instance hue multiplies the stalk, so a
  purple flower is a purple stick. Needed a dedicated painter with a near-black stalk.
- **`side: DoubleSide` on the grass cards** to halve their triangles — still not viable, for the
  reason already in the previous notes: Three flips the normal on back faces and an up-biased card
  normal becomes a down-facing one, so half of every card goes black.

---

## Still open

- **The near field is instance-budget-limited, not design-limited.** 3 100 cards per zone over a
  300 × 224 m map is about one card per 4 m² even with the camera weighting. Bare ground is visible
  within ~8 m of a camera in `grass_macro`. A real build streams this; here the only lever is the
  triangle budget, and the two big items in the scene (`wall` 95 k, `trim` 73 k) are not mine.
- **A fringe card seen exactly edge-on still leaves a faint vertical line** through the crown at
  macro distance. Invisible in all five scored shots. Killing it properly needs the fringe to be
  billboarded, which instanced geometry cannot do without a custom vertex shader.
- **Crowns are still smooth domes above the leaf ring.** The reference plates render the whole crown
  as a cloud of discrete leaf clusters. The mottle approximates it at shot distance; it does not at
  macro. That wants more cards, i.e. more triangles.
- `rockGeo` calls `.toNonIndexed()` on geometry that is already non-indexed and logs three console
  warnings per boot. Pre-existing, harmless, one-line fix if anyone cares.
- Requests to `materials.js` and `lighting.js` in `NOTES_TERRAIN.md` still stand. The `lighting.js`
  one ("grass reads as dark spikes at night") is much less bad now that the painted root is lighter.
