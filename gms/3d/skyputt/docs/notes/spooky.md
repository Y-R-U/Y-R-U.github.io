# spooky agent: Spooky Hollow theme

Status 2026-11-02: **Spooky Hollow built** at `js/themes/spooky/`, implementing THEME_CONTRACT plus the
engine extensions. Tested **inside the real game** (`?theme=spooky&hole=1..9`) at 412x915 portrait
and 1440x900 landscape, high and `q=low`, with no console errors.

## What is built
| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'spooky', name:'Spooky Hollow', materials, buildEnvironment, skins, dispose }` (same shape as sky) |
| `materials.js` | contract materials + internal ones. Mossy grass with a purple cast, purple-grey stone walls, slate caps, **ember trim** (dark iron band with glowing orange segments, emissive flickers), red tattered `flag` (alpha-tested), grave-dirt `sand`, toxic green `water`, orange-chevron `boost`, ghost-green glass, basalt `vcRock` with **glowing lava cracks** (emissive via `onBeforeCompile`) |
| `textures.js` | canvas textures: grass, fringe with leaves, stone blocks, slate, ember trim (map + emissive), basalt, crack map, dirt, planks, ice, chevrons, tee pad (map + emissive jack-o'-lantern face), pumpkin face, glow, fog-wisp atlas, two-frame bat atlas, lava streaks, lightning bolt, tattered flag |
| `sky.js` | night dome: purple zenith, teal horizon, **huge full moon** (maria, limb darkening, halo), stars, lightning flash term; a mist sea with green pockets; fog; cool moonlight key (shadows) + warm orange rim + hemi; PMREM env map |
| `island.js` | the course crag (sky's sweep, basalt palette), round crags, spikes, **lava falls** (UV-scrolled), dark shrubs + glowing mushrooms (instanced) |
| `props.js` | jack-o'-lanterns (ribbed body + glowing carved face), gravestones (3 kinds), spiked iron fences, gargoyles on pillars, candles, cauldron, dead trees, skulls |
| `backdrop.js` | haunted mansion on a floating crag (gables, spires, warm/green windows, fence, pumpkins), skull rock with a lava stream from its jaw that falls off the crag, small crags (graves / trees / pumpkins / leaning tower) |
| `billboards.js` | copy of sky's billboards plus modes `rise` (embers, cauldron bubbles), `bat` (orbiting, two-frame flap), `drift` (fog wisps) |
| `env.js` | assembles everything; jack-o'-lanterns + candles along the course, gargoyle pillars + big pumpkins + candles at the tee, a cauldron beside the fairway, graves, fences on the crag rim, bats (across the moon, round the mansion, over the course), green will-o'-wisps, embers, lightning (deterministic double flicker every ~10 s: sky flash + bolt quad + key light boost), one flickering warm point light at the tee, green beacon over the cup |
| `skins.js` | all contract skins + `mover` (see below) |
| `util.js` | copy of sky's helpers |

Skins:
- **windmill**: rickety crooked plank tower on a stone footing, iron bands, ember-trimmed tunnel, crooked witch-hat roof, broken weathervane, lit windows (one green), **skull hub** with glowing eyes, sails with missing/crooked slats and a cloth tatter. The sail frame still spans exactly x ∈ [0.018, 0.018+BW], r 0.06 → BL (the physics box).
- **loop**: iron + ember rails on the engine's eased x(u), dark wood band with ember edge strips, **ring of carved pumpkins** on both outer edges facing the approaching ball, a big pumpkin on top.
- **tube**: ghostly green fresnel glass, green glow rings, iron end collars.
- **flag**: dark iron pole with a skull finial, tattered red cloth (alpha holes, ragged fly end) that waves.
- **pickup**: mini glowing jack-o'-lantern, bobbing and spinning, orange glow sprite.
- **bumper**: a jack-o'-lantern that fills the collider cylinder (radius r, height h), ember ring at the base.
- **teePad**: carved stone disc, iron rim with spikes, glowing jack-o'-lantern face under the ball (top of the face toward the cup), pulsing orange ring.
- **mover** (engine skin not yet in THEME_CONTRACT, used by hole 8): a coffin filling the w×h×d box, iron corners, ember strip on the lid, small skulls.

## How to test
```
~/.claude/bin/cdp start --port 9533
node tools/spooky_shots.mjs --holes=1-9 --sizes=p,l            # tee shots + draw calls/tris per hole
node tools/spooky_shots.mjs --holes=1-9 --sizes=p --q=low
node tools/spooky_shots.mjs --holes=9-9 --sizes=p --breakdown   # triangles per mesh
node tools/spooky_shots.mjs --holes=3-3 --sizes=l --shoot=6.2:1500,2500   # putt down the tee line, shots mid-roll
CDP_PORT=9533 node tools/theme_preview_cdp.mjs docs/notes/spooky_shots '[{"name":"skins_row","q":"theme=spooky&view=row&hud=0&t=2","w":1440,"h":900}]'
```
The tool skips the fly-over (`round.endFlyover()`), use `--fly` to keep it. Shots go to `docs/notes/spooky_shots/` (gitignored):
`final-p-hole*.png` (high portrait), `v4-l-hole*.png` (landscape), `final-p-hole*-low.png` (low), `skins_row.png`, `loop-l-hole3-shot*.png` (ball through the loop).

## Performance (renderer.info in the real game, headless SwiftShader, tee view)
| | draw calls | triangles |
|---|---|---|
| high, holes 1–9 portrait | 48–74 | 40k–51k (hole 9 is the heaviest) |
| high, landscape | 49–72 | similar |
| low, holes 1–9 portrait | 48–74 | 23k–34k |

Low quality: halved textures, 1024 shadow map, fewer lanterns/props/graves/fences/crags/wisps/bats/embers, one course lava fall, coarser sweeps.
Real-phone fps not measured (headless is software GL). The biggest fill costs are the dome, the mist sea, fog-wisp billboards and the moon.

**Mobile GPU rule:** every shader direction is guarded (`safeDir`, `moonSide` with length checks, the glass fresnel normalises only when `length > 1e-4`), and every `pow()` base is clamped to ≥ 0.

## Contract gaps / engine issues found (not edited — for the engine agent / manager)
1. **`mover` skin** is used by holeview (hole 8) but is not in THEME_CONTRACT. Spooky implements it as `mover({width,height,depth})` → Object3D with its base at y = 0, centred (same as greybox). Please document it. Sky Isles has no `mover` and falls back to greybox.
2. **Camera occlusion raycast crashes on Sprites.** `CameraRig.avoidOcclusion` (`js/game/camera.js`) calls `Raycaster.intersectObjects` without `raycaster.camera`, so any `THREE.Sprite` inside the hole group throws `Cannot read properties of null (reading 'matrixWorld')` every frame (seen on hole 9 when the camera passed a pickup). Spooky works around it (the pickup sprite has `raycast = () => {}` and `userData.noOcclude`). **Sky's crystal pickup uses a Sprite too and should hit the same crash.** Fix: set `_ray.camera = this.camera`, or skip `isSprite` objects.
3. **Boost UVs**: the engine's boost patch has u = lateral metres from the centre line (0 = middle), not 0..1 across the pad as sky.md assumed. Sky's chevrons therefore show only their arm ends on a narrow pad. Spooky draws the chevron tip at u = 0 and wraps the arms; sky should do the same (or the engine should switch to 0..1).
4. `info` would benefit from the initial **camera heading** (a `cameraHint`). Spooky derives a "view" direction from the first ~3 m of `path` to place the moon, the mansion and the skull rock, because tee→cup is sideways on hairpins (hole 7).
5. The `tube` skin takes `{ curve, radius }` and holeview marks its children `noOcclude`; that works as is.

## Known issues / next
- In landscape the camera is steep, so the moon is cut by the top edge and the mansion is often out of frame; the backdrop crags overhead show their undersides. Portrait matches the ref well.
- The lava fall off the course crag is a flat scrolling sheet; fine at play distance, plain up close.
- The loop's pumpkins face the approaching ball, so from the side they show no faces.
- Pumpkin faces are separate glowing slabs on the body (cheap); up close the grin is blocky.
- Ambient sound/music for Spooky is not part of this pass (the sound agent owns audio).
