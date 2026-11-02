# frost agent: Frost Fair theme

Status 2026-11-02: **Frost Fair built** at `js/themes/frost/`. It implements THEME_CONTRACT and every engine
extension (`info.floor`, `info.voids`, `info.branches`, `info.viewDir`, boost UVs, the `mover` skin).
I tested it inside the real game (`?theme=frost&hole=1..9&noflyover`) at 412x915 portrait and 1440x900
landscape, at high and `q=low`. The console showed no errors. A title-screen theme swap (frost → sky →
spooky → frost) also ran clean.

## What is built
| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` returns `{ id:'frost', name:'Frost Fair', materials, buildEnvironment, skins, dispose }`, the same shape as sky and spooky |
| `materials.js` | Contract materials and internal ones (detail below) |
| `textures.js` | Canvas textures: frosted green with snowflakes, frosty fringe, candy stripes, snow, drift, fairy-light garland (map and emissive), slate, ice, snowy planks, chevrons, tee pad (map and emissive), flag, glow, flake, cloud atlas, frozen-fall streaks, fade |
| `sky.js` | Blue-hour dome: navy zenith, cold horizon, a big moon with maria and a cold halo, twinkling stars. Also **aurora ribbons** (three additive curtain strips that follow the camera and sway, with rays drifting), a moonlit sea of cloud, fog, a cool moonlight key (shadows), a warm rim and a hemi light, and a PMREM env map (no stars or aurora in it) |
| `island.js` | Sky's sweep (with voids), recoloured to a snow top, a snow overhang and blue slate with snow on the ledges. Also **icicles** along both rims, **frozen waterfalls** (a static ice sheet with ridged columns and a slow sheen sweeping down it), instanced snowy pines and a few frosted shrubs |
| `props.js` | Decorated Christmas trees (snow on every tier, baubles, two sets of twinkling bulbs, a star), snowy pines, snowmen (coal, carrot, top hat with holly, striped scarf, stick arms), presents and present piles, candy canes, warm lanterns (snow cap and wreath), wreaths, gingerbread houses, icicle rows |
| `backdrop.js` | **Ice palace** about 24 m tall on its crag: spires with snowy roof tips, warm windows, a rose window, a wreath over the gate, curtain walls with snowy tops and fairy lights, icicles on the eaves, a 7.5 m decorated tree, presents and big candy canes. Also small snowy crags (kinds `trees`, `snowman` (a giant one), `presents`, `village` (gingerbread houses), `canes`) with icicles under their rims |
| `sleigh.js` | **Santa's sleigh**: a red extruded sleigh with gold trim and runners, Santa waving, a sack of toys, three pairs of reindeer, and Rudolph leading with a glowing red nose and harness lines. It flies a slow loop (about 155 s per lap) whose front half crosses the view near the moon and whose back half passes high over the course. A twinkling gold trail follows it; each trail billboard is the sleigh's position some seconds ago |
| `snow.js` | Falling snow: one draw call of quads in a 14 m box that wraps around the camera (11 m on low), with sway and drift. Flakes fade within about 1.4 m of the camera, so none sits as a blob over the ball, and they also fade toward the box edge and with fog |
| `billboards.js` | A copy of spooky's billboards (static, sparkle, flicker, mist, rise, bat and drift modes) |
| `env.js` | Assembles everything (detail below). Returns `{ update(dt, t), dispose() }` |
| `skins.js` | All contract skins plus `mover` (see below) |
| `util.js` | A copy of sky's helpers, including `inVoid` and `distToLines` |

`materials.js` in detail:
- **Floor:** a frosted putting green on a 2 m tile with faint snowflake decals and mowing stripes. The fringe is frosty.
- **Walls:**
  - The wall material is **candy-cane stripes** (diagonal red and white with a pinstripe), which also covers `under`.
  - `wallTop` is a **snowy cap**.
  - `trim` is a **fairy-light garland**: 8 bulbs per metre, each twinkling on its own phase in an `onBeforeCompile` hook.
- **Surfaces:**
  - `sand` is a blue-grey snow drift, so a white ball still reads on it.
  - `water` is icy blue.
  - `ice` is pale cyan with cracks.
  - `boost` has ice-blue chevrons with the tip at u = 0, as spooky's do.
  - `bridge` is snow-dusted planks.
- **Other contract materials:** the cup rim is gold, and the flag is red with a white snowflake and a gold hem.
- **Internal materials:**
  - frosted fresnel ice glass, with its normalize guarded
  - `vcRock`, where vertex colours decide snow or slate, with twinkling dot glints on the snow
  - glossy, metal, snow and ice vertex-colour materials
  - a `candy` material with uv in metres, used for tubes
  - two bulb materials, `bulbA` and `bulbB`, which twinkle in antiphase
  - star, window and Rudolph-nose glows

`env.js` adds these, in order:
- **The course:** the course crag and its icicles, then the sky, then up to two frozen falls on the side the camera sees.
- **Along the course:** lanterns, alternating with small decorated trees and with presents or candy canes. All of them stay clear of voids and the branch plank.
- **At the tee:** two lanterns flanking it and present piles behind it, as in the ref, plus a 1 m decorated tree beside it.
- **Beside the course:** a big snowman (0.95 m) about 55% of the way along. Decorated trees, presents and candy canes are scattered over the island top.
- **Backdrop:** the palace sits along `info.viewDir`, with its own two frozen falls, and the crags sit around it.
- **Glows and particles:**
  - lantern, palace and tree-star glows, which flicker
  - tree lights, ice glints and glitter, which sparkle
  - moonlit cloud banks
  - the falling snow and the sleigh with its trail
- **Lights and markers:** a warm flickering point light at the tee and a soft gold beacon beam over the cup.

### Skins
- **windmill:** a gingerbread mill.
  - **Tower:**
    - a gingerbread footing on both sides of the tunnel
    - a tapered body with icing bands, dot piping and vertical piping
    - gumdrops around the base
    - a candy-cane arch around the tunnel on both faces
    - warm windows with icing frames
  - **Roof:** chocolate with a thick snow cap, an icicle fringe and a gold star on top.
  - **Wreath:** on the face between the tunnel and the hub.
  - **Rotor:**
    - a peppermint hub
    - candy-cane spars
    - red and white slat sails in a gold frame
    - fairy lights along the edge of each sail
  - The sail spans exactly x ∈ [0.018, 0.018+BW], radius 0.06 → BL, within ±0.022 in Z, as the contract requires.
- **loop:** candy-cane rails that follow the engine's eased x(u), a wide candy-striped band behind the track with white piping, about 50 twinkling fairy lights along the outer edges, and a big red bow on top facing the incoming ball.
- **tube:** frosted ice-glass fresnel with thin snow rings, candy-cane collars at both ends and a red ribbon bow on top of the entry.
- **flag:** a candy-cane pole, a gold star finial, and a waving red cloth with a white snowflake.
- **pickup:** a spinning, bobbing candy cane with a soft pink glow sprite, which fits the event's "candy canes" currency. The sprite has `raycast = () => {}` and is marked `noOcclude`, as in spooky.
- **bumper:** a snowman whose bottom snowball fills the collider radius, with a snow skirt.
- **teePad:**
  - a red enamel disc with a gold band and notches
  - a big white snowflake that glows a cold blue (one arm points up the fairway)
  - a gold rim with 8 twinkling bulbs
  - a pulsing gold ring
- **mover:** a present that fills the w×h×d box, with a crossed ribbon, a bow, snow on the lid and holly. The colour cycles red/gold, green/white and blue/gold.

## How to test
```
~/.claude/bin/cdp start --port 9534
node tools/frost_shots.mjs --holes=1-9 --sizes=p,l            # tee shots + draw calls/tris per hole (exit 1 on console errors)
node tools/frost_shots.mjs --holes=1-9 --sizes=p,l --q=low
node tools/frost_shots.mjs --holes=9-9 --sizes=p --breakdown  # triangles per mesh
node tools/frost_shots.mjs --holes=3-3 --sizes=p --t=22       # later in time: the sleigh crossing the moon
node tools/frost_shots.mjs --holes=3-3 --sizes=l --shoot=6.2:1500,2500   # putt through the loop
node tools/frost_shots.mjs --swap                             # title-screen theme swaps (dispose check)
CDP_PORT=9534 node tools/theme_preview_cdp.mjs docs/notes/frost_shots '[{"name":"skins_row","q":"theme=frost&view=row&hud=0&t=2","w":1440,"h":900}]'
```
`tools/frost_shots.mjs` is spooky's checker with frost defaults (port 9534, output `docs/notes/frost_shots/`)
plus `--swap`. Phone: http://192.168.0.236:8888/gms/3d/skyputt/?theme=frost&hole=3&noflyover

Shots are in `docs/notes/frost_shots/` (gitignored):
- `final-p-hole*.png`, `final-l-hole*.png` and the `-low` versions
- `t22-p-hole3.png` (the sleigh over the moon)
- `loop-l-hole3-shot*.png`, `skins_row.png` and `title-swap.png`

## Performance (renderer.info in the real game, headless SwiftShader, tee view)
| | draw calls | triangles |
|---|---|---|
| high, holes 1–9 portrait | 57–81 | 49.5k–59.6k |
| high, landscape | 58–81 | about the same |
| low, holes 1–9 portrait | 57–81 | 30.8k–40.0k |

Hole 9 (windmill and loop) is the heaviest, as in spooky.

**What low changes:**
- It halves the textures and uses a 1024 shadow map.
- It uses a coarser rock sweep, fewer icicles, one course frozen fall, fewer props, crags, pines, sparkles and clouds, 280 snowflakes instead of 700, two reindeer pairs instead of three, and a shorter trail.

**Draw-call and triangle savers:**
- Bulbs are octahedra.
- Backdrop present piles have no bows.
- Near props only cast shadows from the bulky buckets (`vc`, `gloss`, `snow`). Bulbs, stars, windows, metal, candy and ice don't cast.

I did not measure real-phone fps. The biggest fill costs are the dome, the cloud sea, the cloud billboards and the aurora (additive, about a quarter of the sky).

**Mobile GPU rule:**
- Every shader direction is length-guarded: `safeDir`, `moonSide`, and the glass fresnel only divides when `length > 1e-4`.
- Every `pow()` base is clamped.
- No `smoothstep` has reversed edges (reversed edges are undefined in GLSL; I use `1.0 - smoothstep(a, b, x)` instead).
- The PMREM env map is rendered from the dome without stars or aurora.

## Registration (not edited — app code belongs to the engine agent)
1. **Title-screen theme picker:** add one entry to `THEME_LIST` in `js/app/menus.js`, after spooky:
   ```js
   { id: 'frost', name: 'Frost Fair', swatch: 'linear-gradient(160deg, #0b1440 0%, #2a4a9a 55%, #e8eefa 56%, #c4d2ee 100%)', moon: '#f4f2e6' },
   ```
   The `swatch` is the navy sky over a snow island, and `moon` is the moon colour. Nothing else is needed: `loadTheme` imports `../themes/frost/index.js` by id.
2. **Frost Fair event:** in `js/events/data/frost_fair.js`, set `theme: 'frost'` and drop the "theme agent" TODO. You can remove `themeWanted` (or leave it as `'frost'`). Also remove the "Frost Fair skin coming soon; plays on Sky Isles for now" note logic in `js/events/screen.js` if it keys off `themeWanted !== theme`; it does, so it simply stops showing. The event's `FROST_SWATCH` in `screen.js` is pale. The theme now reads as navy and snow, so it could use the swatch above.
3. **Music:** `js/audio/music.js` has `THEMES = { sky }`, so `music.start('frost')` plays the Sky tune. That is fine until the sound agent adds a frost cue (sleigh bells and celesta would suit it).

## Contract notes / proposals
- The pickup is a candy cane. It matches the event currency (`canes`), so the event HUD and the in-world collectible agree.
- The sleigh uses the `t` from `update(dt, t)`. Its path is deterministic, so the sleigh's position at a given `t` is reproducible for screenshots (`--t=22` puts it over the moon on most holes).
- `renderer.info` in the game does not seem to include the shadow pass: turning off shadow casting on some buckets did not change the counts. That is worth knowing when comparing budgets.

## Known issues / next
- In landscape, the steep camera crops the moon and the sleigh at the top edge. Portrait shows them under the HUD's top-left buttons part of the time; the sleigh crosses the whole view during its pass.
- The palace sits in the same place relative to the view on every hole (top right in portrait), like spooky's mansion. It is consistent but a little repetitive across a round.
- The loop's candy band is opaque, as in sky and spooky, so the ball is hidden inside the loop from a side view.
- The low-quality grass shows a coarser frost speckle, because the texture is 128 px per metre.
- The reindeer are static: the whole team banks and bobs, but the legs don't animate. Animating them would need separate meshes, which costs more draw calls.
