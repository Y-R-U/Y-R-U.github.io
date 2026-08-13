# Terrain, creek, foliage and scene dressing — notes

Owned files: `js/world/terrain.js`, `js/world/scatter.js`, `js/world/demo.js`, `js/world/buildings.js`,
`js/world/details.js`. One three-line change to `js/main.js` (see the bug below).

> **`scatter.js` has since been rewritten — see `NOTES_FOLIAGE.md`.** Section 3 below (foliage) and
> the tree parts of section 2 describe the round-3 state and are superseded. Everything about the
> terrain, the creek, the ground transitions and the building dressing still holds.

---

# Round 3 — what changed and why

## 0. A bug that was silently deleting every scenario's `look`

`main.js` added `{ update: () => controls.update() }` to the system list and then set
`controls.enabled = false` in shot mode. **`OrbitControls.update()` calls `object.lookAt(target)`
unconditionally — `enabled` does not gate it.** So every scenario rendered from its own `pos` but
looking at `(0, 4, 0)`, and the `look` field in the shot table had never done anything.

Fixed by not adding the controls updater at all in shot mode. This changes the framing of all five
shots. It is a straight improvement — `gate_night` now actually shows a gatehouse rather than a row
of houses, and `creek_day` puts the creek in the foreground the way its reference plate does. Two
`pos` values were then re-tuned (`wall_day`, and its `look`) now that `look` is live.

Consequence for other agents: **if a shot looks differently framed from the last round you saw, this
is why.** The shot table is now a single `SHOTS` const at the top of `demo.js` and it also feeds
`setCameras()`, so camera positions, keep-outs and view directions can no longer drift apart.

## 1. The creek — cut, not painted

The previous round believed it had cut a channel. `heightAt` did describe one. The **rendered mesh
did not contain it**: the ground grid was a flat 2.9 m step, and a 10 m wide, 1.75 m deep channel
sampled at 2.9 m is gone by the time it is triangulated. That is why the water read as a ribbon
lying on grass.

- **The ground grid is now non-uniform** (`XS` / `ZS` in `terrain.js`, built by `axis()`).
  Rows are **1.15 m through z ∈ [33, 79]** — the whole creek band — and 6 m at the far map edges,
  columns 6.1 m beyond |x| > 96. Net effect on triangles: **15 288, slightly fewer than the 15 862
  the uniform grid cost.** `surfaceY` looks the cell up with `fcell()` (binary search, returns
  index+fraction packed in one float).
- **Channel profile** (in `heightAt`): flat bed at `waterY - 1.75`, rising as `u^1.7` to meet the
  water line exactly at `d = creekHalf(x)`, then a bank that is steep at the water and flattens
  into the natural ground as `1 - (1-u)^2.4` over a further 5.4 m. Cross-section at x = 0 measured
  from the rendered mesh: −1.56 m at the centre, +1.9 m at 11 m out.
- **Water surface**: cross stations bunch towards the shore (`|t|^0.62`), colour and alpha ramp on
  **real depth** (`waterY - heightAt`), not on a parametric edge distance. Alpha reaches 0 at the
  water line, so the meeting of water and ground is a fade, not a vector edge.
- **Water material**: dark (`0x4a6570`), roughness 0.26, metalness 0, `envMapIntensity 0.6`.
  It was briefly mirror-smooth and metallic; with only the sky in the env map, grazing Fresnel
  painted the entire creek the colour of the brightest thing in the scene. Dark albedo + a modest
  sheen reads far closer to the plate.
- **`water.receiveShadow = true`** — the bridge deck now casts onto it.
- **Fake reflection** (`addReflection` / `buildReflections`): a smeared, ripple-broken dark quad on
  the water under each bridge, running towards +z because that is where `creek_day` looks from.
  84 triangles per bridge. It is not a planar reflection and will be wrong from other angles;
  it is there because a real one is not affordable.
- **The margin**: ground vertex colour now carries a strong wet band (×0.32 red at the water line,
  falling off over 2 m of height) and a pale shingle strip above it, both gated on distance to the
  channel so low ground elsewhere stays green. Reed and shingle clumps sit along the found waterline.

## 2. Bedding — clumps, not quads

`scatter.js` grew a `clump(x, z, opts)` helper. Everything that touches the ground now calls it
instead of dropping a single item:

- **Every building footprint** — anchors at 0.3 per metre of perimeter, 3–6 items each, and the
  outward offset ranges from **−0.35 m** (i.e. partly behind the wall face) to +0.95 m. The negative
  offset is the point: a tuft next to a footing leaves the razor line intact either side of it.
- **Road verges** get clumps with a litter bias (browner, shorter grass plus pebbles).
- **Tree bases** get a litter clump around the flare.
- **Rocks are sunk**, not perched — every rock instance drops 18–45 % of its size into the ground.
- **Shrubs are thickets**: 2–4 overlapping blobs plus surrounding grass, one AO decal for the group.
- **Trunks have a root flare** — a three-point lathe (0.46 → 0.22 → 0.115 radius) instead of a
  cylinder, 24 triangles.

**The rubble at building bases was removed.** `addRubble` emits half-metre stones on the `wall`
surface, and `materials.js` projects triplanar from world space — so each pebble came out as two or
three brick courses and read as a painted zebra tile. The instanced `rock` kind (flat-coloured, no
map) does that job now. The only `addRubble` left is the spill at the collapsed wall stretch, on
`trim`, at a size where the coursing reads as masonry.

## 3. Foliage — alpha cards

`scatter.js` now builds its own canvas textures (`paint()`, tracked through `budget.js`) and its own
alpha-tested materials. `materials.js` was not touched.

- **Grass** is a crossed pair of quads carrying a painted 22-blade cluster: **8 triangles for 22
  blades**, against 6 triangles for 3 with the old tuft. Each quad is emitted twice with opposite
  winding rather than using `DoubleSide`, which flips the normal on the back face and blackens half
  of every card.
- **Flowers** are a single card, 4 triangles.
- **Canopy leaf fringe**: three crossed leaf-cluster cards, 12 triangles, sized 25 % wider than the
  canopy so the parts that poke out break the silhouette. This is what stops an 80-face icosphere
  reading as a polygon against the sky.
- `alphaTest` is 0.26–0.35, deliberately low: at 0.45 the mip chain thinned the alpha and distant
  grass evaporated.
- Textures: 256×128 + 96×96 + 128×128 RGBA ≈ **0.5 MB total**.

**Canopies and shrubs are now one displaced icosahedron with radial normals**, not three merged
spheres. The old version showed a bright crack across the canopy wherever two lobes intersected.
Canopy 80 tris (was 120), shrub 20 (was 60) — which is where the budget for 2.3× as many shrubs and
much denser grass came from.

**Grass placement is weighted towards the shot cameras** (`camDist`, `smoothstep(132, 28)`). The map
is 300 × 224 m; spreading a 3 050-instance budget evenly buys one clump per 20 m² and the near field
looks bare whatever you do to the card. This is an instance-budget decision, not a cheat — a real
build would stream it.

**Trees are copses, not an orchard**: the grid step went 8.5 → 11 m and each accepted cell places
1–4 trees within ±3.2 m with different heights. Trees on the far ridge (z < −52) get a height boost,
which is what softens the hard low-poly ridge line in `town_night`.

## 4. Silhouette

- **`wallRun` loses one stretch of parapet.** A random non-gate segment drops to 34–50 % of the wall
  height, gets a ragged crown of broken courses instead of merlons and corbels, and a rubble spill
  either side. A 56 m parapet running dead level is a silhouette failure by itself.
- **`wallRun` gains a timber hoarding** on another stretch: a projecting gallery with deck, planking,
  posts, raking braces and a pitched roof, on both faces, ~100 triangles. It puts a roofline above
  the parapet and something that is not stone into the shot.
- **Trees are kept out of the first 34 m of each shot's sight line** (`inCorridor` in `terrain.js`).
  A canopy dropped there fills a third of the frame; this was happening in `wall_day`.

## 5. Ground transitions

Road ribbons feather over a **noisy** width now (`0.30 + 0.16·fbm` instead of a fixed 0.55), the end
fade is longer, and the verge clump pass runs at 1.5 m spacing with litter. The hard grass/cobble
boundary in `gate_night` is much softer. The cobble **tiling** repeat is `materials.js` and is still
visible — see Requests.

## 6. One triangle saving worth knowing about

Window panes were `extrude(shape, 0.05)` — a front cap, a back cap and a side wall per pane. A pane
sits inside a reveal and is only ever seen from the front. `details.js` gained `flat(shape)`
(`ShapeGeometry`) and `plainHouse`'s pane box became a `PlaneGeometry`. **Glass went from 23 880
triangles to 5 108** across the three districts. That single change paid for the whole foliage
upgrade.

---

## Numbers

Headless, 1280 × 720, dpr 1, `--preset=high`:
**44 draw calls, 339 k triangles, 50.2 MB textures** (was 40 / 337 k / 49.7).

Mobile gate, **headed**, `--preset=medium --dpr=1 --w=844 --h=390`:

| shot | gpu p95 | cpu p95 | calls | tris |
|---|---|---|---|---|
| wall_day | 3.7 ms | 2.2 ms | 44 | 282 k |
| street_dusk | 4.3 ms | 2.1 ms | 44 | 282 k |
| gate_night | 4.4 ms | 1.9 ms | 27 | 182 k |
| town_night | 7.3 ms | 2.1 ms | 44 | 282 k |
| creek_day | 3.7 ms | 1.5 ms | 44 | 282 k |

Budget is 11 / 6 / 150 / 350 k / 60 MB. Inside all five, 60 fps everywhere.

Triangle budget is still the tight one: **339 k of 350 k**. The knobs that move it, in order of
effect: `CAP` in `scatter.js` (grass 3050 × 8 tris × 3 zones = 73 k is the single biggest line),
`bush` 300 × 20 × 3 = 18 k, the `house()` : `plainHouse` ratio in `demo.js`, and the row spacing in
`axis()` in `terrain.js`. `wall` (110 k) and `trim` (70 k) in the merged district batches are the
two largest items overall and neither has been trimmed this round.

---

## Constraints that have not changed

- **`CAMERAS` in `terrain.js` is filled from `SHOTS` in `demo.js` by `setCameras()`.** Do not edit
  the literal; edit `SHOTS`. Two of the five entries were stale before this round.
- **Nothing is built north of z = −19.** That intramural strip is the raking corridor `wall_day` and
  `gate_night` both need.
- **`getMaterial(zoneId, 'ground')` has `vertexColors = true`; `'road'` has
  `vertexColors / transparent / depthWrite:false`**, set from `terrain.js` on the shared instance.
  **Do not use `'ground'` or `'road'` as a surface inside a `Batch`** — `normalize()` in `details.js`
  strips the colour attribute and the geometry renders black.
- Everything scattered is an `InstancedMesh` thinned live by `quality.settings.foliage`
  (`foliage=0.4` → 249 k tris, verified).

---

## Requests

- **`materials.js`** — the two that would move the score most:
  1. **A `'water'` surface.** The creek owns a hand-rolled `MeshStandardMaterial` outside
     `setEnvIntensity`, so it does not follow time of day. It is tuned for morning and reads a
     little flat at dusk.
  2. **Cobble tiling.** The road repeat is visible at about 2 m in `gate_night` and `street_dusk`.
     Anything that breaks it — a second octave, a random UV rotation per triplanar axis, a large
     low-frequency value modulation — would help a lot and is entirely inside `materials.js`.
  3. Small stone geometry (rubble, kerb stones) under world-space triplanar comes out with two or
     three brick courses across a half-metre object. If there were a `'stone'` surface with a much
     finer or non-repeating pattern, `addRubble` could come back at the wall bases.
- **`zones.js`** (additive, not blocking): `foliage.density` and `foliage.tree` per zone. The three
  districts still differ only in foliage colour, not in how wooded or how lush they are.
- **`lighting.js`** — the grass cards read as dark spikes at night because the painted blade base is
  a dark grey and the hemisphere ground half is doing very little for a near-vertical card. Not
  changing anything on my side for it; flagging it in case the fill can lift low geometry.

## Still open

- The water has no real reflection. The bridge smear is a fake and only correct for `creek_day`.
  A planar reflection pass for a ~10 m wide ribbon would be one extra render target; I did not
  spend the draw calls or the code on it without asking.
- There is a faint vertical seam down the centre of the road in `street_dusk`. It is not the road
  ribbon (its width lerp is continuous) and not a ground zone-group boundary (those are at x ≈ ±35).
  Unresolved.
- Grass card silhouettes are all vertical fans. Real variety wants a second card texture (broad-leaf,
  fern) — cheap, just not done.
- Interpenetrating `plainHouse` masses still show a thin bright z-fight line where two roofs cross.
- `TUNING` in `buildings.js` and the terrain constants still need a scene-rebuild hook before they
  can be `quality.register` knobs. `foliage` and `groundAO` are live.
