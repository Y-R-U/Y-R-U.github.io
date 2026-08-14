# A7 — LOD, culling and streaming

Working record. Appended as each sub-step lands; read `docs/NOTES_WORLD_A2-A5.md` first for A2–A6.

## The problem A7 inherited

`docs/BUDGET_A7_BEFORE.json`, measured at the gate profile (`--preset=medium --dpr=1 --w=844
--h=390`, headless) before anything in this phase changed:

| scenario | main tris drawn | resident |
|---|---|---|
| `wall_day` | 239.0k | 391.1k |
| `street_dusk` | 180.3k | 391.1k |
| `gate_night` | 122.0k | 391.1k |
| `town_night` | 240.9k | 391.1k |
| `creek_day` | 242.4k | 391.1k |

Three lines were drawn in **every** scenario at exactly the same cost, which is the signature of
a bounding sphere that catches every frustum:

- **`contactAO` 20.1k** — one mesh over the whole map. The third largest line in the budget.
- **roads 11.2k** — the King's Road is 1110 m in one ribbon.
- **foliage 70–81k** — one `InstancedMesh` per zone per kind, spanning 1440 m.

and the buildings merged into five district-spanning meshes, so `wall_day`, `town_night` and
`creek_day` all paid the same 98.7k however the camera was pointed.

## What landed

**`js/world/stream.js` (new)** owns everything that is drawn conditionally. Every static system
registers with it and it does one pass per frame:

| what | rule | knob |
|---|---|---|
| ground + bank chunks | distance | `groundCull` × `viewDist` (1.6) |
| road segments, decal cells | distance | `lodCull` × `viewDist` (1.45) |
| scene blocks | distance, then detail/proxy swap | `lodCull`, `lodDetail` (70 m) |
| foliage | re-pack to instances within a radius of the camera | `foliageCull` × `viewDist` (1.15), `foliageStep` (20 m) |

`streaming` (default on) turns the lot off **and also clears `frustumCulled` on every world mesh**,
so "off" reproduces what the world cost before A7 rather than being a debug flag. That is what
makes the A/B below a measurement rather than a comparison against a different commit.

### Per-block building LOD — `js/editor/build.js`

A district is no longer one batch. It is partitioned on A6's computed `blk` (60 m) and each block
merges into **two** sets — `detail` and `proxy` — of which exactly one is ever visible. Both carry
the whole block: the `mass` infill, the block's share of the district dressing (foundations, kerbs,
the bridge, wall rubble), and every real building either as itself or as a silhouette. The object's
`lod` field picks which builder it gets in *both* sets, so `full` and `proxy` are decided at build
time and never swap.

The first version put the infill and the dressing in a third always-on `base` set. That halved the
resident triangles but **doubled the draw calls** — 104–116 total against a 150 budget — because
every visible block then cost two sets instead of one. Duplicating the cheap geometry into both
sets took it to 61–91. Triangles are the gate but calls are the one that scales with the number of
blocks in range, which is an area.

The dressing cannot be built twice — its RNG stream has already been consumed — so its `Batch` is
built once and its geometries cloned for the second set.

Two things that had to be preserved exactly and were:

- **Footprint registration order.** `scatter.js` walks `terrain.footprints` with its own RNG, so
  reordering them re-rolls every clump in the world. Seating and `addFootprint` now run over the
  whole district in document order in a first pass, before anything is partitioned.
- **The district dressing's single RNG stream.** `seedDocument` recorded one stream per district
  and `kerb`/`bridge` consume it in order. The stream is still consumed in exactly that order; only
  the `Batch` each piece is written into changes. `buildings.js` gained one export, `emitBatch`,
  because `dressing`'s one-callback-one-batch shape cannot feed several batches from one stream.

Proxy geometry: anything that reads as a building becomes the plain gabled block a `mass` already
is (`plainHouse`); a `tower` gets a cylinder and a cone, a `wallRun`/`retaining` a battered box and
a coping. `pen` and `cross` have no silhouette at 70 m and are dropped.

### `contactAO` and the roads — `js/world/terrain.js`

Decals are bucketed into 120 m cells and the road ribbons cut into 110 m runs sharing a station.
Both are coarser than the 60 m building blocks on purpose: they are one draw call each, and a
tighter grid buys culled triangles at a bad price in calls. The road's end fade now keys off the
index into the whole road, not into the segment, or every join would fade to nothing.

`Terrain.update` is gone — the ground chunk cull moved into `stream.js` with its `groundCull` knob,
so there is one owner of visibility.

### Player-centred foliage — `js/world/scatter.js`

`applyTreeStyle` and `applyDensity` merged into one `repack()` that also applies a focus radius.
Every kind now keeps its source items (not just the trees), and `focus(x, z, r)` re-packs each
`InstancedMesh` to the instances within `r` of the camera. Under `?shot=` the camera never moves,
so a shot packs once and stays put.

This is WORLD.md §6.4's cut arriving as a **cull, not a density reduction**: nothing within the
radius is thinned. `street_dusk`'s 63.4k of grass was two thirds Whitewall's and Blackstone's,
520 m away behind 99 % fog.

## Measured — the gate profile

`--preset=medium --dpr=1 --w=844 --h=390`, headless. **`tools/budget.mjs` now forces
`shadowRate` to `every frame`** before it reads: at `15hz` the captured frame is bimodal and half
the A7-before rows below read a shadow pass of zero, which is why only two of them have one.

| scenario | main **before** | main **after** | shadow after | **total after** | main calls before → after |
|---|---|---|---|---|---|
| `wall_day` | 239.0k | **144.7k** | 82.9k | **227.7k** | 66 → 64 |
| `street_dusk` | 180.4k | **105.5k** | 52.2k | **157.8k** | 44 → 57 |
| `gate_night` | 122.0k | **95.6k** | 62.9k | **158.5k** | 29 → 38 |
| `town_night` | 241.0k | **111.4k** | 52.0k | **163.4k** | 66 → 66 |
| `creek_day` | 242.4k | **87.0k** | 27.8k | **114.8k** | 69 → 67 |

Totals with the shadow pass: **88 / 81 / 61 / 90 / 91 draw calls** against a 150 budget, and
**115k–228k triangles against 350k**. The worst scenario, `wall_day`, has **35 % of margin**.

Where it came from, `street_dusk`, drawn triangles:

| | before | after |
|---|---|---|
| `contactAO` | 20.1k | **3.6k** |
| roads | 10.0k | **3.0k** |
| foliage | 80.8k | **29.5k** (grass 63.4k → 16.3k) |
| buildings | 33.8k | 33.8k (this camera was already looking at everything near it) |

`docs/BUDGET_A7_NOSTREAM.json` is the same build with `streaming=0`, i.e. nothing culled at all:
**383k main + 186k shadow = 569k** on every one of the five, within 1 % of each other. That is the
resident cost and the number the whole phase is measured against.

## The traverse — `node tools/budget.mjs --traverse`

`BUILD_PLAN.md` and `WORLD.md §5` both say the gate has to hold *between* the scenario cameras,
so this is the harness. It walks **every registered road** — all five of §4.4 plus the town
streets, 11 path runs — at `--step` metres, and at each station points the camera along the line
and then at ±120°, giving 333 samples at 25 m × 3 yaws. The camera sits 6 m up looking 22 m ahead,
which is roughly the outdoor arm. `shadowRate` is forced to every frame.

The whole traverse runs **inside the page** in batches of 40 — camera, systems, `info.reset()`,
`render()`, read — so 333 samples cost one navigation and about 40 s rather than 333 of them.

`docs/TRAVERSE_A7.json`:

| | |
|---|---|
| worst total | **224.5k** (142.6k main + 81.9k shadow) at (−520, −142), Whitewall |
| worst calls | **100** (76 main) at (−116, 74), the King's Road between Whitewall and Longacre |
| p50 / p95 triangles | 55.4k / 171.9k |
| over the 350k gate | **0 of 333 samples** |

**The budget is held.** 36 % of triangle margin and 33 % of call margin at the worst frame on the
whole road network, with the shadow pass counted every frame.

Two honest caveats on that number:

1. **The countryside is under-populated, so it is cheap.** `scatter.js` still places against the
   five scenario cameras (A4's `reach` gate), so the moorland between towns has almost no grass.
   The worst frame is inside a town, which is the right place for it, but the traverse's p50 of
   55k is not what a fully scattered world would cost. A8 or a later pass has to make placement
   player-centred as well as *drawing* player-centred; the `focus` machinery is now there for it.
2. **The demo town is 27 objects, not §6.3's 160.** Blocks visible scale with area, not with
   object count, so the call count will hold; the triangle count of the 4–6 detail blocks will not.

## Determinism

Two consecutive renders of the same scenario, 1280 × 720 dpr 1:

| | |
|---|---|
| `gate_night` | **byte-identical** |
| `street_dusk` | **0.147 %** of pixels differ by >2/255, mean 0.0001 |

Both inside the noise floor A5 recorded (byte-identical / 0.16 %). `?shot=` is not broken: the
foliage focus re-packs on a camera-movement threshold and a shot camera never moves, so it packs
once during the first frame and stays put.

## Tooling

- **`node tools/shot.mjs --all` completes again — 13 s for five scenarios.** Its defaults were
  1600 × 900 at dpr 2, i.e. 3200 × 1800 software-rendered; a sweep now defaults to 1280 × 720 at
  dpr 1 and prints `[n/5] <shot>` before each render and the elapsed seconds after it. An explicit
  `--w/--h/--dpr` still wins.
- **Port collisions fixed.** `PORT` and `CDP_PORT` were `pid % 200` offsets and three agents
  running these tools at once collided; the HTTP server now walks up to a free port and the CDP
  port is probed before Chrome is spawned. That second one mattered: Chrome given a busy
  `--remote-debugging-port` does not fail, `/json/version` answers from whoever owns it, and the
  run attaches to **another agent's browser**.
- `tools/budget.mjs` gained `--set=` (passed through to the page URL) and `--traverse`.

---

# The `street_dusk` seam — found

**It is the road texture's tile wrap, sampled through the triplanar Y plane. It is not the
terrain, not the noise lattice, not `townAt`, and it is not a step.**

## The measurement everyone before this was making was the wrong one

A2 and A5 both quote a "5–6 %" then "7.1 % vertical luminance step", measured as the mean
luminance of a column band left of x = 0 against one right of it. Dump the actual per-column
profile of rows 560–640 and that number is not what your eye is looking at:

```
col 635  115.2   ← the road's specular crown
    638  112.3
    639  105.8
    640  101.2   ← the line
    641  104.9
    644  106.2
    674  110.9   ← climbing again
```

There are **two** features. A broad, smooth luminance hump across the carriageway, which is
asymmetric, and a **~2 px dark notch** sitting on it. The band metric measures the hump's
asymmetry; the notch is what is visible. That is why three passes of re-phasing noise moved the
7 % figure around by a few tenths without ever touching the line.

Everything below is measured with a **notch** metric instead: the local minimum within ±3 px of
column 639, against the mean of columns ±5..±10 either side. Control = **7.71 % deep**.

## What it is

| experiment | notch | reading |
|---|---|---|
| control | **7.71 %** | |
| road meshes removed from the scene | 0.68 % | it is entirely in the road ribbon |
| ground material `pScale = 0` | 7.77 % | not the ground |
| ground `vertexColors = false` | 7.64 % | not the ground's vertex colour |
| **road material `pScale = 0`** | **0.13 %** | it is the road's triplanar texture lookup |
| triplanar weights forced to Y only | 7.71 % | …the **Y (top-down) plane** |
| forced to X only / Z only | 0.08 % / 0.26 % | not the X or Z planes, not `sign(pN.x)` |
| `pUvY = vec2(0.0, z) * pScale` | **0.12 %** | it is the **u = worldX · pScale** coordinate |
| `pUvY = vec2(z, 0.0) * pScale` | 14.77 % | not v |
| `pUvY.x = x + 240.0` (**exactly 100 tiles**) | **7.69 %** | reproduced bit for bit |
| `pUvY.x = x + 1.2` (**half a tile**) | **−0.12 %** | gone |
| `pUvY.x = x + 1000.0` (0.67 of a tile) | 0.82 % | gone |
| mipmaps off (`LinearFilter`, verified: 3.2 % of pixels changed) | 8.29 % | not mipmapping |
| `NearestFilter` (5.8 % of pixels changed) | 8.44 % | not filtering |
| `normalScale = 0` | 3.26 % | the normal map is **half** of it |
| roughness forced constant | 6.98 % | not roughness |
| `transparent = false, depthWrite = true` | 8.26 % | not blending or overdraw |
| `MirroredRepeatWrapping` | 5.55 % | inconclusive — mirrored repeat puts its own mirror axis on u = 0 |

`TILE.road` is **2.4 m** and `pScale = 1/2.4`, so the triplanar Y plane puts a texture tile
boundary at **every 2.4 m of world x**. Scanning the whole row band for local minima finds them at
columns **465, 640, 816** — and the raycast says 175 px = 2.4 m at that depth. Those are world
**x = −2.4, 0, +2.4**. The one at x = 0 measures 8.9 luminance units deep and the neighbours 3.2
and 3.8, because x = 0 is nearest the camera and sits on the crown of the street.

So the artefact is not at x = 0 at all. **It is at every tile boundary; x = 0 is simply the one
the camera is pointed at.** Which is also why yawing the camera moved it exactly as the projection
of world x = 0 predicted — the neighbours moved too, they were just never looked for.

The road tile is measurably less seamless in u than its neighbours are in the interior. Reading
the baked canvases directly, mean |difference| per channel:

| texture | across the u wrap | between adjacent interior columns | ratio |
|---|---|---|---|
| `neutral:road` albedo | **8.29** | 4.67 | **1.78×** |
| `neutral:ground` albedo | 15.74 | 13.18 | 1.19× |
| `light:road` albedo | 15.32 | 12.62 | 1.21× |

The road is the worst offender in the set and the ground, at 1.19×, shows no line.

## `townAt` / `padAt` — ruled out by the experiment A2 asked for

The same camera geometry as `street_dusk` (eye at `cx`, `cz + 44`, looking at `cx`, `cz − 26`),
run at **Whitewall x = −520** and **Blackstone x = +520**. Both are a town centre `cx`, so both
have `townAt`'s `|x − cx|` and `padOf` doing exactly what they do at Longacre.

**Neither shows a line.** It is not `townAt`, not `padOf`, not the pad interpolation.

That test does carry one caveat worth writing down: Longacre's street *is* the King's Road, while
Whitewall's and Blackstone's are their own district ribbons, and their tile phase relative to
`cx` is different (±520 / 2.4 = ±216.67 — two thirds of a tile off a boundary, which is exactly
the `+1000.0` case above, and exactly why nothing shows). The conclusion is the same either way,
and it is the tile-phase explanation that predicts both results.

## Real hardware

Reproduced `--headed` at 1280 × 720: notch **7.66 %**, minima at 465 / 640 / 816. Not a
software-rasteriser artefact.

## The fix, for whoever picks it up

Both candidates are outside A7's file list, which is why this is characterised and handed over
rather than fixed:

1. **Make `roadTex` tile seamlessly in u** — `js/world/textures/`. The cheapest fix and it also
   removes the two fainter lines at ±2.4 m. Check `bake.js`'s wrap handling for the whole set
   while you are there: `light:wood` (20.73 vs 5.78) and `neutral:wall` in v (44.31 vs 1.90) are
   worse ratios than the road and will be showing the same line somewhere nobody has looked.
2. **Give the road ribbon its own UVs running along the carriageway** and a projection mode that
   uses them, instead of sampling world x/z. This needs a mode in `js/world/textures/project.js`.
   It is the better answer on the merits as well as the fix: cobbles should run with the street,
   not with the world axes, and a world-axis tile grid on a road that bends is wrong however
   seamless the tile is.

**Do not** re-test, in addition to A2's and A5's lists: mipmapping, texture filtering,
anisotropy, transparency and depth write, roughness, the ground material, the ground's vertex
colours, the triplanar X and Z planes, `sign(pN.x)`, `townAt`, `padOf`, and the terrain field at
x = 0 (`region`, `waterY`, `corridorW` and `townAt` are all provably flat in x through the
−200..200 band; A4 already re-phased `detail()` to irrational offsets).

**And measure the notch, not the band.** The band figure is the specular hump.

---

# Two things only a render found

**The proxy tower was 3.4 m too short.** `tower()` puts its lathe roof 2.4 m above the
machicolation ring and rises `radius · pitch` again on top of that; the first proxy stopped its
cone at the shaft. At `creek_day` that gap was the entire part of Longacre's campanile that clears
the roofs in front of it, so the tower simply vanished at 110 m. Every numeric check passed.
Proxy silhouettes have to reach where the real roof reaches, not where the walls stop.

**Proxy windows were claiming a second point light each.** `materials.js`'s `discover()` clusters
runs of lit glass out of merged geometry to place window lights. Both LOD sets are in the scene
graph at once and `traverse` does not care about `.visible`, so every `auto` house was found twice.
`discover` now skips anything under a `:proxy` holder. Distant proxy panes still glow emissively;
they just do not get a light, which is right at 70 m+ anyway.

# State at the end of A7

| | |
|---|---|
| `node --test` | **296 / 296** |
| `tools/lintQuests.mjs`, `tools/lintText.mjs` | clean |
| five scenarios | rendered and looked at; all read correctly |
| `?shot=` determinism | `gate_night` byte-identical, `town_night` 0.015 %, `street_dusk` 0.12–0.13 % over three runs |
| headed, real GPU, 844 × 390 medium, shadow every frame | `wall_day` **228k tris, 88 calls, gpu 4.3 ms, 60 fps** against 350k / 150 / 11 ms |

## Left for whoever is next

1. **`scatter.js` still *places* against the five scenario cameras.** Drawing is now
   camera-centred but placement is not, so the countryside between the towns is bare and the
   traverse's p50 is optimistic. `Scatter.focus`/`repack` is the machinery a player-centred
   *placement* pass needs; the loops in `build()` want `camDist` replaced by a distance to a
   moving centre and a re-run on the same threshold.
2. **Draw calls, not triangles, are the number to watch at A8.** Triangles have 36 % of margin;
   calls have 33 % and they scale with the number of blocks inside the cull radius, which is
   an *area*, not an object count. If §6.3's ten blocks per town lands and calls climb, the lever
   is a coarser LOD cell — `blockOf`'s `BLK` is 60 m and everything reads it.
3. **The seam** — see above. The fix is in `js/world/textures/`.
4. `tools/shot.mjs` still fails outright perhaps one run in ten while three agents are rendering
   at once. It is not the port collision (fixed); it is Chrome failing to come up or dropping the
   CDP socket. A retry around `open()` would pay for itself.
