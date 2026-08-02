# FORGE — level editor & graphics test bed

A Three.js test bed for hitting **Tiny Glade-grade visuals at 60fps on a phone**, which then
doubles as the level editor for the game built on it. Mobile first; desktop gets tuned later.

## The bar (approved, not up for renegotiation)

**Tiny Glade.** Storybook PBR. Beauty comes from four affordable things:

1. One strong directional sun with soft shadows.
2. Good medium-res stone / tile / thatch materials — albedo + normal + roughness.
3. Contact occlusion wherever a surface meets the ground.
4. Warm point lights in windows after dark.

Not from polygon count. Not from 4K textures. Not from a post-processing stack.

Reference plates live in `~/cc/yru/gms/3d/aaa_refs/refs/clean/` — **outside this repo, and they
stay there.** They are copyrighted press screenshots and must never be committed or copied into
`site/`.

## Non-negotiables

- **No build step.** ES modules, `three` via the importmap in `index.html`. Matches the rest of the repo.
- **Same building blocks in every zone.** A zone differs by *material* and by small roofline
  additions — never by having its own geometry code. If you find yourself writing
  `if (zone === 'dark')` outside `zones.js`, stop and put the difference in `zones.js` instead.
- **Everything tunable is a knob.** Register it with `quality.register(schema, apply)` and it gets
  panel UI for free. No magic numbers buried in a module.
- **Track every texture** through `engine/budget.js` `track()`, or the memory readout lies.
- **The perf gate is real.** See below.

## Comments — read this twice

Aaron has ADHD and finds comment noise genuinely hard to read. The code is self-documenting.

- **Only comment to clear up something genuinely confusing.** A non-obvious formula, a workaround
  for a Three.js quirk, a unit that isn't guessable.
- Never restate what the line does. Never write section-banner comments. Never write JSDoc blocks.
- A short file-top line saying what the file owns is fine. That's usually the only comment a file needs.
- If in doubt, delete the comment.

## Layout

```
index.html            importmap, HUD, panel, boot
style.css
js/main.js            boot + wiring
js/scenarios.js       named camera setups — the critic's contract
js/engine/app.js      renderer, loop, resize, window.__forge
js/engine/stats.js    perf HUD (fps, gpu p95, cpu p95, calls, tris, tex MB, verdict)
js/engine/quality.js  presets + knob registry
js/engine/budget.js   texture memory accounting
js/world/zones.js     ★ the three zones. Frozen — additive changes only, ask first.
js/world/materials.js getMaterial(zoneId, surface)
js/world/lighting.js  sun / sky / fog / time of day
js/world/buildings.js wallRun / tower / house
js/world/demo.js      demo scene + scenario registration
js/editor/panel.js    settings UI, generated from the knob schemas
tools/shot.mjs        headless render → PNG + perf JSON
tools/compare.mjs     blind side-by-side sheet vs the reference plate
```

## Shared contracts — do not change these signatures without asking

```js
getMaterial(zoneId, surface)   // 'wall' 'roof' 'trim' 'road' 'ground' 'wood' 'crest' 'glass'
                               // additive only — new surfaces fine, renames are not
wallRun(zoneId, { length, height, thickness })
tower(zoneId, { radius, height, sides })
house(zoneId, { w, d, h })
// every builder returns an Object3D whose origin sits on the ground at its centre
```

## Rendering and checking your work

```bash
node tools/shot.mjs --shot=wall_day --w=1280 --h=720 --dpr=1   # one scenario
node tools/shot.mjs --all                                       # every scenario
node tools/compare.mjs --shot=wall_day --round=2                # blind sheet vs reference
```

`shots/<id>.png` + `shots/<id>.json` (perf snapshot). Look at your PNG with the Read tool —
**always actually look at it.** Numbers in a JSON file will not tell you it looks wrong.

Headless renders on this machine are software-rendered, so the *image* is trustworthy but the
*timings* are not. For a real perf number add `--headed --perf`.

## The perf gate

Measured at `--preset=medium --dpr=1 --w=844 --h=390` (mid-phone profile), headed:

| Metric | Budget |
|---|---|
| GPU p95 | **< 11 ms** |
| CPU p95 | **< 6 ms** |
| Draw calls | **< 150** |
| Triangles | **< 350k** |
| Texture memory | **< 60 MB** |

A component that looks superb and blows the budget has failed. Beauty we can't draw isn't a result.

## How your work gets judged

Renders go into a **blind** side-by-side against a Tiny Glade plate — an adversarial critic scores
both images without being told which is ours. Rubric:

| Axis | Weight |
|---|---|
| Light — one clear sun direction, soft far / tight contact shadows, cool shadows against warm light | 25% |
| Material read — you can name the surface at arm's length on a phone; roughness varies across one wall | 20% |
| Grounding — nothing floats; occlusion at every join; debris breaks the wall/ground line | 20% |
| Silhouette — legible as a black shape; varied heights; no long unbroken horizontal edge | 15% |
| Zone identity — light / neutral / dark tellable from a 200px thumbnail, from material not shape | 10% |
| Colour discipline — limited palette, one sparing accent, no saturated primaries | 10% |

Up to 3 rounds. Losing badly three times means the approach gets rethought, not that you keep sanding.
