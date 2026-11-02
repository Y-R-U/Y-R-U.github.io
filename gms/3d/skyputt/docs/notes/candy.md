# candy agent: Candy Land theme

Status 2026-11-03: **Candy Land built** at `js/themes/candy/` and registered in `THEME_LIST` (`js/app/menus.js`).
It implements THEME_CONTRACT and every engine extension (`info.floor`, `info.voids`, `info.branches`,
`info.viewDir`, the windmill blade layout, the loop's eased x(θ), boost UVs, the `mover` skin). Tested inside
the real game (`?theme=candy&hole=1..18`, fly-over skipped) at 412x915 portrait and 1440x900 landscape, high
and `q=low`, plus `tools/theme_preview.html?theme=candy`. No console errors on any hole. The node tests
(`physics`, `store`, `story`, `events`, `meta`) still pass (nothing outside `js/themes/candy/` and one
`THEME_LIST` line changed).

## What is built
| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'candy', name:'Candy Land', materials, buildEnvironment, skins, dispose }` (same shape as frost) |
| `materials.js` | contract materials + internal ones (below), shared `uTime`, the cake shader, the lollipop swirl shader |
| `textures.js` | canvas textures: mint frosting green, sprinkle fringe, strawberry wafer, sprinkled icing cap, icing-drip trim (alpha cut-out), cake crumb, brown sugar, blue-raspberry hard candy, graham cracker, chevrons, candy stripe, rainbow belt, swirl mask, cookie tee pad (map + emissive star), polka-dot flag, glow, sparkle, cotton-candy cloud atlas, chocolate-fall streaks, fade |
| `sky.js` | pastel day dome (blue zenith, pink-peach horizon, soft sun behind the player), a **rainbow** arc ahead (not in the env map), a **cotton-candy cloud sea** (pink and sky-blue floss), pastel fog, a warm sun key (the one shadow caster, 2048/1024 map fitted to the bounds), a pink rim, a hemi fill, PMREM env map |
| `island.js` | the **layer cake** under the course: pink frosting top with shader sprinkles + sugar glints, a frosting lip, straight sides with sponge / jam / sponge / cream / chocolate-cake layers, a craggy cookie-crumb base tapering below. Same sweep frames as sky/frost (rounded caps, curvature limit, `voids`, one slab per solid run of `floor`). **Frosting drips** hang off both rims; **chocolate** pours over the edge (UV-scrolled sheet, fades out); instanced **gumdrops** and **cotton-candy trees** on the frosting. Round cake islands for the backdrop |
| `props.js` | lollipops (swirl discs), cupcakes (fluted liner, swirl, sprinkles, cherry), gumdrops (+ cheap 30-tri studs), candy canes, ice-cream cones, donuts, wrapped sweets, cotton-candy trees, marshmallows, chocolate bars |
| `backdrop.js` | **candy castle** (~24 m) on its own cake island along `info.viewDir`: a three-tier cake keep with drips and a giant cherry, pastel towers with soft-serve striped roofs and gumball finials, icing crenellations, chocolate door, giant lollipops and candy canes at the gate, a chocolate river pouring off the island. Small cake islands: `lollipops`, `gumdrops`, `cupcake`, `icecream`, `donut`, `canes` |
| `sprinkles.js` | ambient: a light drift of tumbling rainbow sprinkles in a box that wraps round the camera (one draw call; fade near the camera, at the box edge and with fog) |
| `env.js` | assembles everything (below). Returns `{ update(dt, t), dispose() }` |
| `skins.js` | all contract skins + `mover` (below) |
| `billboards.js`, `util.js` | copies of frost's |

Contract materials: `grass` mint frosting (2 m tile, mowing stripes, faint pale sprinkles), `fringe` green with
rainbow sprinkles, `wall` strawberry wafer (also `under`), `wallTop` white icing with sprinkles, `trim` white
icing drips over the top 2.5 cm of both wall faces (alphaTest, so the wafer shows between drips), `tee` pink,
`cupRim` white with a pink glow, `flag` hot pink polka dots with a lollipop emblem, `sand` brown sugar
(`sticky` too), `water` glossy chocolate (unused by the engine so far), `ice` blue-raspberry hard candy,
`boost` dark magenta with glowing pink chevrons (tip at u = 0, scrolling +v, as the M2 UV note says),
`bridge` graham cracker, `rock` cake crumb.

`env.js` order: course cake + drips → sky/lights/fog → up to two chocolate pours on the sides the camera
sees → along the course (alternating sides, clear of voids/branches/gaps) lollipops, cupcakes, gumdrop clusters
and candy canes → at the tee two big lollipops, gumdrops behind, an ice-cream cone beside → a giant cupcake
~55 % along → scattered sweets on the frosting → instanced gumdrops + cotton-candy trees → castle + cake
islands → cake / drips merged into one mesh each → castle window glows, sugar sparkles around the course,
cotton-candy cloud billboards below and around → sprinkle drift → a soft pink beam over the cup.

### Skins (tris / meshes, high, measured with `--skins`)
- **windmill** (3.1k / 8): a cupcake mill — chocolate-cookie footing either side of the tunnel, flared fluted
  hot-pink liner with round icing-framed windows, sponge rim, a four-tier frosting swirl with sprinkles, a
  cherry on top, a candy-cane arch round the tunnel on both faces, gumdrop studs round the base. Rotor: a
  lollipop swirl hub, candy-striped spars on the radial lines, pastel slat sails in white icing frames with a
  gumdrop on the tip. The sail spans exactly x ∈ [0.018, 0.018 + bladeWidth], r 0.06 → bladeLength, ±0.022 Z.
- **loop** (2.9k / 5): a rainbow sour-belt band behind the track, pink/white candy rails on the engine's eased
  x(u), white icing piping on both band edges, gumdrop studs along the outer edges, a big swirl lollipop on top
  facing the incoming ball.
- **tube** (≈3k for a 4 m tube / 3): pink hard-candy fresnel glass (normalize guarded), white and pink icing
  rings, candy-striped collars at both ends.
- **flag** (0.3k): candy-striped pole, yellow gumball finial, waving polka-dot cloth.
- **pickup** (0.7k): a spinning, bobbing wrapped sweet (4 colourways) with a pink glow sprite
  (`raycast = () => {}`, `noOcclude`, as frost/spooky).
- **bumper** (0.4k): a giant sugared gumdrop filling the collider (radius r, height ≥ h), icing ring at its foot; colours cycle.
- **teePad** (1.0k): a pink-iced cookie with a white star (glowing), piped dots and sprinkles, white icing rim, gumdrop studs, pulsing pink ring.
- **mover** (0.3k): a chocolate bar filling w×h×d (segmented top, paper sleeve in hot pink / blue / orange, foil edges).

## How to test
```
~/.claude/bin/cdp start --port 9512
node tools/candy_shots.mjs --holes=1-18 --sizes=p,l             # tee shots + draw calls/tris per hole (exit 1 on console errors)
node tools/candy_shots.mjs --holes=1-18 --sizes=p --q=low
node tools/candy_shots.mjs --holes=9-9 --sizes=p --breakdown    # triangles per mesh (backdrop meshes are named back.*)
node tools/candy_shots.mjs --skins                              # triangles / meshes per skin
node tools/candy_shots.mjs --preview='view=hole&hud=1' --sizes=p,l   # tools/theme_preview.html
node tools/candy_shots.mjs --swap                               # title-screen theme swaps (dispose check)
```
`tools/candy_shots.mjs` is frost's checker opening (and closing) its own CDP target on port 9512, plus
`--preview` and `--skins`. Phone: http://192.168.0.236:8888/gms/3d/skyputt/?theme=candy&hole=3&noflyover
Shots in `docs/notes/candy_shots/` (gitignored by the existing `docs/notes/*_shots/` pattern):
`v4-p-hole*.png` / `v4-l-hole*.png` (high, all 18), `v5-p-hole*-low.png` (low, all 18), `final-{p,l}-hole9..11.png`
(after the last colour pass), `v1-preview-*.png`, `title-swap.png`.

## Performance (renderer.info in the real game, headless SwiftShader, tee view)
| | draw calls | triangles |
|---|---|---|
| high, holes 1–18 portrait/landscape | 41–73 | 67k–84k (hole 18 heaviest) |
| low, holes 1–18 portrait | 42–73 | 35k–49k |

High is ~15–25 % more triangles than Frost Fair (50–60k). The extra is the cake's straight layered sides
(crisp layer boundaries need doubled rows) and round sweets. Draw calls are in the same range as frost.
Low halves textures, uses a 1024 shadow map, a coarser cake sweep, fewer drips/props/islands/sparkles/clouds,
90 sprinkles instead of 220, one chocolate pour, and low-poly props.
Real-phone fps not measured. Biggest fill costs: dome, cloud sea, cloud billboards.

**Mobile GPU rule:** sky directions use `safeDir` / length-guarded `sunSide`; the rainbow uses
`acos(clamp(dot))` and is excluded from the PMREM env map; glass fresnel divides only when `length > 1e-4`;
every `pow()` base is clamped; no reversed smoothstep edges in the shaders.

## Music idea (for the sound agent; `js/audio/` untouched)
"Sugar Rush Waltz": a bouncy 3/4 at ~150 bpm in F major. Celesta / music-box lead, pizzicato strings,
glockenspiel sparkles on the off-beats, a soft tuba or bass-clarinet oom-pah, and a kazoo or slide-whistle
fill every 8 bars. Ambience: a faint bubbling chocolate river, occasional sugar "tinkle" chimes, and a
cork-pop + chime sting for collecting a wrapped sweet.

## For the manager
- **Title screen overflow:** with four themes, `.t-themes` (`css/app.css:221`, `display:flex`, no wrap) is wider
  than a 412 px phone, so the Candy Land chip is cut off at the right edge (see `candy_shots/title-swap.png`).
  Not edited (outside my brief). One-line fix: add `flex-wrap: wrap;` (or `overflow-x: auto`) to `.t-themes`.
- Title swaps sky → spooky → frost → candy run clean (no errors; geometry/texture counts return to normal).

## Known issues / next
- In landscape the camera is steep, so the rainbow and the top of the castle are cut by the top edge (as the
  other themes' moon / palace). The castle sits in the same view-relative spot on every hole.
- The wafer pattern on the 12 cm walls mostly reads as fine pink/cream layers; the pressed grid only shows up close.
- Big cotton-candy trees placed near the tee can crop into the lower corners of the frame.
- The loop's rainbow band is opaque (like the other themes), so the ball hides inside the loop from the side.
- `water` (chocolate) is supplied but the engine draws no water patches yet.
