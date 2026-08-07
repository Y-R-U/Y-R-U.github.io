# FACET — low-poly isometric test bed

A Three.js diorama test bed for **AAA-grade low-poly**: faceted, cartoony, isometric, 60fps on a
phone. Sibling to `../forge` (which chases photoreal storybook PBR at ground level). Shared engine
plumbing, completely different art.

## The bar

Reference plates live in `~/cc/yru/gms/3d/aaa_refs/refs/lowpoly/` — **outside this repo, and they
stay there.** Copyrighted, never copied into `site/`. `INDEX.md` says what each one demonstrates.

**Read `refs/lowpoly/CRAFT.md` before writing art code.** It is the style bible: the twelve
blocky tells and their codeable fixes, the colour rules, the three-light rig, the camera maths, and
the 12-point reviewer checklist your work is scored against.

### The one hard constraint

**It must not read as blocky.** Voxel, Minecraft, cube-stacking, axis-aligned boxes — all failures.
Low polygon count has to read as *elegant faceted geometry*. The top three fixes, in order:

1. **Odd radial segment counts — 5, 7, 9, 11. Never 4, 8 or 12.** An even n-gon presents two pairs
   of parallel flats to a 45° azimuth camera and the eye completes them into a cube.
2. **Everything tapers.** A top/bottom radius ratio of 1.0 is banned.
3. **Nothing is axis-aligned or plumb.** Random yaw per instance, ±2–7° tilt on anything organic,
   and no two adjacent objects sharing a yaw within ±10°.

## Non-negotiables

- **No build step.** ES modules, `three` r160 via the importmap in `index.html`.
- **No textures.** Colour lives in the geometry as a vertex-colour attribute. That is what lets the
  whole world merge into a handful of draw calls, and it is why there is no texture budget to blow.
- **Everything tunable is a knob.** `quality.register(schema, apply)` gets you panel UI for free.
- **Build through `shape.js`.** If you find yourself reaching for `THREE.BoxGeometry`, stop — the
  kit exists precisely because a raw box is the failure mode.

## Comments — read this twice

Aaron has ADHD and finds comment noise genuinely hard to read. The code is self-documenting.

- **Only comment to clear up something genuinely confusing.** A non-obvious formula, a workaround
  for a Three.js quirk, a unit that isn't guessable.
- Never restate what the line does. No section banners. No JSDoc blocks.
- A short file-top line saying what the file owns is fine. Usually that's the only comment needed.
- If in doubt, delete the comment.

## Layout

```
index.html              importmap, HUD, panel, boot
js/main.js              boot + wiring
js/scenarios.js         named camera setups — the critic's contract
js/engine/app.js        renderer, loop, resize, window.__facet
js/engine/isocam.js     the ortho/long-lens isometric rig
js/engine/quality.js    presets + knob registry
js/engine/stats.js      perf HUD
js/engine/budget.js     texture memory accounting (near-empty by design)
js/world/shape.js       ★ the anti-blocky primitive kit — read this first
js/world/palette.js     ★ the four palettes. Light and colour together.
js/world/batch.js       ★ merge everything into a handful of draw calls
js/world/rng.js         seeded random + value noise
js/world/terrain.js     faceted ground + the cut slab it sits on
js/world/lighting.js    sun / sky fill / rim / fog / sky gradient
js/world/world.js       ★ assembles the diorama, defines the module contract
js/world/{buildings,water,nature,life}.js   the art modules
js/editor/panel.js      settings UI, generated from the knob schemas
tools/shot.mjs          headless render → PNG + perf JSON
tools/compare.mjs       blind side-by-side sheet vs a reference plate
```

## The module contract

```js
export function populate(ctx) { }      // required — push geometry into the batch
export function update(dt, app) { }    // optional — only if the module animates something
```

Modules run in the order `buildings → water → nature → life` and share one occupancy registry.
That ordering *is* the composition: the village stakes its ground first, water fills what is below
the line, nature grows in what is left, life is placed last against everything already standing.

`ctx` gives you:

| | |
|---|---|
| `p` | the palette — `p.ground.grass`, `p.build.roof`, `p.flora.canopy`… every triple is `[mid, light, dark]` |
| `rng` | seeded, per module. `rng.range/int/pick/chance/bell/sub` |
| `terrain` | `heightAt(x,z)`, `normalAt`, `slopeAt`, `biomeAt`, `isWater`, `inBounds`, `halfX`/`halfZ`, `sizeX`/`sizeZ`, `waterY`, `riverPath`, `distToPath` |
| `place(geo, {x,z,ry,rx,rz,scale,y,sink,cls})` | drops a geometry onto the ground. `sink` buries the base so it meets a slope without a gap |
| `raw(geo, matrix, cls)` | for anything already positioned |
| `dynamic(obj3d)` | escape hatch for things that must move — **each one is its own draw call** |
| `occupy(x,z,r,tag,{ao})` / `free(x,z,r,{ignore})` | the shared claim registry. Claim what you place; the terrain bakes contact AO from it, and `ao` scales how hard (negative brightens, which is how light pools work) |
| `village` | `{ plots, paths, centre }` — buildings fills it, nature and life read it. Each plot carries world-space `windows[]`, `door` and `chimney` anchors |
| `detail` `scatter` `life` | quality dials, 0–2 / 0–1.6 / 0–1 |
| `batch` `materials` `quality` | the raw handles, if you need them |

Material classes: `solid` `foliage` (two-sided) `glossy` `glow` (unlit) `water`.

## Rendering and checking your work

```bash
node tools/shot.mjs --shot=village_day --w=1200 --h=800 --dpr=1        # one scenario
node tools/shot.mjs --all --preset=high                                 # every scenario
node tools/shot.mjs --shot=craft_macro --set=only=nature                # build one module alone
node tools/compare.mjs --shot=village_day --round=1                     # blind sheet vs a plate
```

`shots/<id>.png` + `.json`. **Always actually look at the PNG with the Read tool.** Numbers in a
JSON file will not tell you it looks blocky.

Scenarios: `village_day` `island_wide` `shore_dusk` `woods_autumn` `craft_macro` `frost_ridge`.
Every one of them picks a camera azimuth 30–60° off its palette's sun azimuth, deliberately — that
offset is what makes shadows fall across the screen diagonal instead of hiding behind objects.
Don't "fix" one by aligning it with the sun.

Scenario targets resolve their height from the terrain at `setup()` time, not at registration —
a palette change rebuilds the terrain, and a target left at an authored `y` ends up buried in a
hillside.

Headless renders here are software-rendered: the **image** is trustworthy, the **timings** are not.
The counts — draw calls, triangles — are trustworthy. Attribute cost with counts.

## The perf gate

Measured at `--preset=medium --dpr=1 --w=844 --h=390` (mid-phone profile):

| Metric | Budget |
|---|---|
| Draw calls | **< 30** (60 is the hard ceiling) |
| Triangles | **< 180k** total, shadow pass included |
| Texture memory | **< 2 MB** — there is one 8×256 sky gradient and nothing else |
| GPU p95 | < 11 ms |

A component that looks superb and blows the budget has failed.

## How your work gets judged

A blind adversarial critic scores our render side by side with a reference plate without being told
which is which, against `CRAFT.md`'s 12-point checklist. Any one of these sinks a render on its own:

- fog colour ≠ sky colour where the far edge fades out (visible seam)
- a grey `AmbientLight` in the rig
- terrain showing regular diagonal corduroy from a uniform triangulation
- any prop whose bounding box is within 15% of a cube
- draw calls > 60


## Gotchas that have already cost real time

- **Orthographic camera + fog.** The rig sits `rig.dist` (260 units) back from the pivot at every
  zoom, so fog depth is ~260 for a 150-unit diorama. `FogExp2` against that erases the entire
  scene to flat haze. Linear `THREE.Fog` with near/far anchored to `rig.dist` is the only thing
  that means anything here.
- **A sky dome does not work under ortho** — it falls outside the frustum's side planes and is
  never drawn. The sky is a `CanvasTexture` on `scene.background`; three draws a plain (non-cube)
  background texture as a fullscreen quad.
- **Ortho frustum must size on `max(R, R/aspect)`**, never on height alone, or the diorama's sides
  crop on a portrait phone.
- **Clouds cannot be placed out of the way.** Under ortho a cloud 60 up and 80 behind projects
  onto the same pixels as a hillside from any low-elevation framing, and no altitude fixes it for
  a camera that orbits. They draw first with `depthTest: false` and `renderOrder = -1`, which makes
  them unconditionally sky.
- **Terrain quad winding**: `a→d→c` is counter-clockwise seen from above, `a→b→c` is not. Getting
  it backwards backface-culls the whole ground and you see nothing but sky.
- **The slab is rectangular** (150 × 106). `terrain.halfX/halfZ/sizeX/sizeZ` are the real bounds.
  There is deliberately no `terrain.size` — a square bound is always wrong here.
- **Slab faces perpendicular to both sun and rim crush to black.** The skirt lifts its vertex
  colour by exactly the light the side is missing; the cut face is a diagram and has to read the
  same on all four sides.
- `mergeGeometries` fails by returning `null` when inputs disagree on attributes, which surfaces
  much later as a blank scene. `Batch.push` normalises every geometry on the way in — one raw
  three primitive (uv, no color) would otherwise take the whole batch down.

## State of play

All five art modules are populated and every scenario renders. Measured at the mid-phone gate
(`--preset=medium --dpr=1 --w=844 --h=390`): **16 draw calls, 148k triangles, 60fps** — against
budgets of 30 and 180k. Roughly 6.9k lines.

Known weak, in rough priority order:
- The far ridge in `woods_autumn` still reads cooler and more chromatic than the mid-ground, so
  atmospheric perspective runs slightly backwards on it.
- Broadleaf canopies are blob clusters rather than authored foliage at macro range; they want a
  purpose-built canopy primitive instead of a displaced icosahedron.
- Clouds are the weakest single element — smooth lobes with hard notches where they overlap.
- No foliage sway. Vertex-shader sway would be the highest-value animation left and needs a hook
  in the shared material.
- Light pools are hand-calibrated against the dusk palette and exposure 0.82; changing either
  needs them retuned.
- Window panes are a fixed size because the plot anchors carry position and yaw but no dimensions.
