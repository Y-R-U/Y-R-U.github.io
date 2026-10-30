# sculptor-fantasy-1 notes — Fantasy theme

## Done (round 1)
- `js/themes/fantasy/` registered (`fantasy:` line in `js/themes/index.js`). Unbuilt pieces
  (p r q k), the board and battle anims fall back to Classic.
- **Knight** (`knight.js`) — armoured warhorse bust: SDF-sculpted neck/jowl/muzzle, gold
  chanfron strip with centre ridge + horn spike, gold noseband, feathered crest plume in the
  side colour, scalloped caparison with gold hem, small glowing eyes. 7,660 tris, 1 mesh.
- **Bishop** (`bishop.js`) — wizard: folded robe with painted cape + stole, gold belt and
  collar, beard, sleeves, tall crooked pointed hat (lathe) with side-colour band and brim edge,
  dark slot strip running from the crown across the brim (the mitre-slot read from above),
  gold tip bead, staff with a glowing orb in a gold claw. 5,892 tris, 1 mesh.
- Plinth shared by all fantasy pieces (`common.js`): rounded base, painted gold band, thin
  glowing rune ring in the side colour, metal dais on top (gold / steel) so the figure's
  silhouette shows from straight above (the black side on dark squares especially).
- Move anims (`anims.js`): `gallop` (knights: rear, bound, stride bob, dust puff; 310 ms +
  50 ms squash) and `blink` (bishops: spin-shrink into sparkles, pop up on the target in
  side-coloured sparkles + ring; 290 ms + 45 ms). Classic hop/slide for everything else.
- `names` on the theme export: p Squire, n Warhorse, b Wizard, r Watchtower, q Sorceress,
  k High King.

## How it is built
- `sdf.js`: a small signed-distance sculpting kit (capsules, ellipsoids, smooth union/cut,
  labels) + a surface-nets mesher with gradient normals. The field is meshed once per piece type
  (cached), then per side only vertex colours change. Cell 0.0195 (knight) / 0.025 (bishop body)
  is what fits the budget.
- **One material per side** (`pieceMat` in `common.js`): everything is vertex data —
  colour = albedo, `uv.x` = glow (emissive = colour × glow), `uv.y` = metalness (roughness lerps
  to the metal roughness). Injected via `onBeforeCompile` on top of the kit rim, so
  `kit.ownMaterials` clones keep it. ⇒ 1 draw call per piece kind (+1 shadow).
- Close-up viewer for sculpting: `tools/sculpt_fantasy_view.html?piece=n,b&view=angle|top|side|front|back|high[&noyaw=1]`.

## How to test
- Gallery: `tools/board_gallery.html?theme=fantasy&view=top|default|angle` (+ `mode=play`).
- Viewer above for close-ups. Headless: `~/.claude/bin/cdp start --port 9511`, then
  `CDP_PORT=9511 node tools/board_cdp.mjs <outDir> '<spec>'`.

## Requests (to board / manager)
- kit: a documented per-vertex metal/glow channel (what `common.js` does with `uv`) would let
  other sculptors share one material per side. Happy for board to lift `patch()` into kit.
- kit: `sparkles`/`ring` are great for move anims; a `fx.trail(obj, ms)` (fading after-image)
  would make gallop/blink nicer.
- Fantasy figurines stand on a 0.13-tall plinth; recommended heights for the remaining fantasy
  pieces: p 0.8, r 0.95, n 1.0 (now), b 1.1 (now), q 1.25, k 1.4.

## Open issues
- Surface nets at these cell sizes leave slight stair-steps on the sharpest SDF creases (plume
  edge, chanfron lip) — invisible at board scale, visible in extreme close-ups.
- Bishop's arms/face mostly hide under the brim at the default angle; the robe is a simple cone.
- Slot on the bishop hat is a lathe wedge, so it widens toward the brim edge.

---

# sculptor-fantasy-2 — round 2: Pawn + Rook

## Done
- **Pawn "Squire"** (`pawn.js`) — young foot-soldier: SDF body (marching stance, booted legs with
  plate greaves + knee cops, mail hauberk skirt, raised tabard panel front/back in the side colour
  with a gold hem, gold belt, short cape, steel/gold pauldrons, gorget, vambrace) + crisp plain
  geometry for the pointed spangenhelm (gold brow band, side-colour ring, ribs, nasal, finial),
  a curved kite shield (gold rim, side-colour field, gold cross + boss) and a spear (leaf blade,
  gold socket, swallow-tailed pennant). Smallest plinth (R 0.30, top 0.12). Helm top ≈ 0.83,
  spear tip ≈ 0.90. **5,992 tris, 1 mesh/material.**
  - It is turned 3/4 toward its owner (`YAW = 0.5`, baked into the geometry). Deliberate break
    of MODEL_GUIDE §2's "no baked yaw": after the board's ±90° side yaw it faces screen-left/right
    like the other figures, but the shield comes round toward the owning player's camera.
- **Rook "Watchtower"** (`rook.js`) — 8 staggered courses of individually cut, bevelled stone
  blocks (open lathe faces; the dark mortar core shows through the joints), gold-banded footing,
  arched door in a gold frame (planked leaf, iron bands, ring pull), 4 glowing arrow slits with
  gold lintels, 14 corbels under an overhanging parapet with a gold band, 6 merlons with coping
  slabs (gold on white, light steel on black) around a dark well, two heraldic banners (gold
  border, side-colour field fading darker, gold tower badge, rod + knobs). Door faces -x, so
  after the side yaw it faces the owner's camera. Top ≈ 0.95. **5,946 tris, 1 mesh/material.**
- Black side on dark squares: black squire = steel helm + steel pauldrons + red cape inside the
  gold ring; black rook = light-steel coping blocks alternating with dark crenels around a black
  well (coping is metal 0.4, not 1 — full metal reflected the dark env and vanished from above).
- **Move anims** (`anims.js`): `march` (pawns, weight 5): 2 swaying marching hops (3 for a double
  step), leaning in, dust at each footfall, stamp — 280 + 45 ms. `grind` (rooks, weight 5): rocks
  back to break loose (55 ms), shuddering heavy slide with a dust trail (235 ms), thud squash with
  a dust puff + faint ground ring (55 ms). Measured end-to-end through `board.applyMove` they take
  the same time as Classic's hop (~400–430 ms incl. board overhead in headless Chrome).
- Draw calls unchanged: 1 per kind per side (lineup 18, full army 12 + board).
- Viewer: `tools/sculpt_fantasy_view.html` gained `&az=<deg>` to orbit the camera (e.g.
  `?piece=p&view=side&noyaw=1&az=200` = the squire from the front).

## How to test
- Close-ups: `tools/sculpt_fantasy_view.html?piece=p,r&view=angle|top`, front `&view=side&noyaw=1&az=200`.
- Gallery: `tools/board_gallery.html?theme=fantasy&view=top|tilt|angle`, contrast FEN from MODEL_GUIDE §5.
- Anims: playground, then in the console `Math.random=()=>0.999` makes the board pick the last
  eligible anim (march for pawns, grind for rooks).

## Open issues / honest score
- Squire ~7/10: reads as a real armoured figurine with layered kit, but the face is mostly hidden
  under the helm, the SDF body is soft (cell 0.0168 to stay < 6k), cape/pauldron borders are a bit
  blotchy in close-ups, and at phone size from overhead it is a small helm + colour on a ring.
- Watchtower ~8/10: the stonework, door and banners are the best detail in the set so far; the
  parapet wall above the gold band is plain, and the black tower picks up a reddish cast from the
  kit's warm rim glow (reads as dark iron/red, which suits the side).
- Both sit right at the 6k budget; anything more needs a coarser plinth (shared, 24 seg here).

## Requests
- Board/manager: none blocking. If the board ever exposes a way to force a move anim by label in
  the gallery playground (`?anim=march`), anim review would be easier than stubbing Math.random.

---

# sculptor-fantasy-3 — round 3: Queen + King, move anims, island environment

## Done
- **Queen "Sorceress"** (`queen.js`) — layered gown: side-colour underskirt panel with a gold band,
  ivory/ebony overskirt split open at the front (inverted V) with gold edges, floor-length mantle
  (side colour, deep folds, gold border + hem, pale lining on the cut edge), puffed sleeves, bell
  cuffs, hair locks, scalloped fan collar with gold ribs, sceptre (ring + glowing gem), a glowing orb
  in a gold armillary ring hovering over her left palm. **Coronet**: jewelled band, side-colour cap,
  8 flaring gold points tipped with **pearls** + a gold circlet through the tips, and a centre
  finial with a gem — the dotted circle from above (pearls, not gems, so they read on the
  blue/red mantle). Top ≈ 1.19. **5,990 tris, 1 mesh/material.** `YAW = 0.55` toward the owner.
- **King "High King"** (`king.js`) — armoured king, both gauntlets on the pommel of a great sword
  planted point-down; cuirass with a soft-edged side-colour tabard panel + gold ridge, layered
  pauldrons, elbow cops, greaves + sabatons, split surcoat with gold hem, thick **ermine collar**
  (pale ring from above — the black king's best read on dark squares), long cloak with gold edges,
  pale lining and an ermine hem with black tail tufts, bearded head, arched crown (band with gems,
  fleurons with pearls, velvet cap, two arches). **The monde + 3D cross is NOT yawed** with the
  figure, so its arms lie on the board axes = a clean "+" from overhead (arms 0.19 wide). Gold
  cross on white, light steel on black. Top 1.42 (tallest). **7,824 tris, 1 mesh/material.**
- `drape.js`: indexed cloth shells (gown layers, mantles, cloaks): a closed (r,y) section swept
  round the back, per-height front opening (warped angles), radial folds, end caps, and a painter
  that gets exact row/column ids — so gold borders are crisp narrow bands (extra narrow edge
  columns / band rows via `rows()`), not vertex-colour blotches. Far cheaper than SDF for big
  smooth cloth; SDF stays for bodies/arms/heads.
- **Move anims** (`anims.js`): `glide` (queens): lift, one full twirl across with a mantle flare
  (x/z swell), sparkle trail, ring + sparkles on landing — 40+210+55+35 ms. `stride` (kings):
  2 heavy strides (3 when castling) leaning in, cloak swish (yaw sway reversing each stride), dust
  per footfall, stamp + faint gold ring — 260(285)+50 ms. End-to-end via `board.applyMove` in
  headless: queen ~480 ms, king ~385–400 ms vs Classic hop 368–450 ms on the same moves.
- **Environment** (`board.js`, registered as `board: { environment }` — squares + frame still
  fall back to Classic so D28 contrast is untouched): floating stone island — flagstone deck
  (one canvas texture), gold-trimmed rounded-square edge, block wall, craggy underside with a
  grassy lip and hanging moss, **4 blue rune medallions** at the deck corners, **4 braziers**
  (stone pedestal, gold bowl, additive flame cards), **4 banners** on gold poles (blue on white's
  side, red on black's, gold border + crowned-shield emblem), small trees/bushes at the corners,
  3 waterfalls off the rim, **10 distant floating islands** (cliffs, strata, trees, 3 with
  castles), a cloud sea below + far cloud banks, vertex-colour sky dome, light fog. Hidden below
  minPhi 0.12 → **Top view: 18 draw calls (unchanged)**; Tilt/3D/Free: 30 draw calls, env ≈ 24k
  tris. Nothing casts shadows, nothing animates per frame. Background colour for Top = dusk blue.
- `tools/sculpt_fantasy_view.html`: `&ty=<y>` sets the look-at height (face close-ups).

## How to test
- Close-ups: `tools/sculpt_fantasy_view.html?piece=q,k&view=angle`, faces `&view=side&noyaw=1&az=200&dist=1.4&ty=0.95`.
- Gallery: `tools/board_gallery.html?theme=fantasy&view=all`, phone contrast FEN (MODEL_GUIDE §5).
- Environment: `&mode=play&view=angle`, or Free then `G.boards[0].camera.orbit(0.6,0.6); G.boards[0].camera.zoom(3)` for the whole island.
- Anims: playground + `Math.random=()=>0.999` (glide/stride are last in the list).

## Honest scores
- Queen ~7/10: regal silhouette, layered gown + pearl coronet read well at angle; face is a plain
  egg (no features at this cell size), stomacher edge is soft. From Top at 360 px the coronet is
  small (~15 px): readable as a pearl ring with zoom, but the mantle colour does most of the work.
- King ~7.5/10: strong statue pose, ermine + cross read great; arms are a bit tube-like and the
  white king's face/beard are low-contrast ivory-on-ivory.
- Environment ~7/10 first pass: the diorama reads as the ref's floating island; trees/bushes are
  toy-like low-poly, distant islands are simple, no animated fire/water.
- Note: on Top the tall q/k tops shift toward the board edge by camera parallax (ranks 1/8); not
  fixable in the model.

## Requests
- Board: optional per-frame hook for environments (`env.update(dt)`) so flames / waterfalls / clouds
  could drift cheaply — only while tilted, only when the board is already rendering.
- Manager: a fantasy-specific board build (squares with gold inlay like the ref) could follow; I
  left the Classic squares on purpose to keep D28 contrast tuned in one place.

---

# sculptor-fantasy-polish — polish pass (raise the set toward the refs)

## Done
- **Faces** (`face.js`, new): a head is its own small SDF meshed at a fine cell (0.012–0.013 vs
  the bodies' 0.022–0.028) with brow ridge, nose, cheekbones, eye sockets + eyeballs, ears, a
  hairline that leaves the face clear (the old queen's hair ellipsoid fully covered her face), an
  optional beard + moustache, and a flat cut under the hat/crown. Painted by feature for value
  contrast: warm skin vs darker sockets/eyes, brows, lips. Black royals/wizard get faintly glowing
  red eyes (uv glow channel). Cached per style, recoloured per side.
- **Wizard rebuilt** (`bishop.js`): drape-shell coat split below the belt over a side-colour
  underrobe (inner face repeats every outer row so the end caps follow the varying opening — the
  first try had big gold cap triangles across the V), floor-length mantle with gold border, stole
  either side of a long beard, gold belt + gem buckle, spellbook at the hip, lathe-tube arms with
  hanging bell sleeves + gold cuffs (replacing lumpy SDF arms), rolled hood, staff with a gold
  crescent cradling the orb. Hat 10% smaller, pushed back (0.14 rad) so the face shows at an angle.
  **Slot** = a constant-width (0.021) ribbon lying on brim + crown front-to-back: a crisp dark line
  from straight above (glowing red on black). Turned 3/4 toward the owner via
  `facing: { byType: { b: 0.5 } }` (no baked yaw). **5,966 tris** (was 5,892).
- **Queen**: sculpted head (`hair: 'queen'`: parted cap, locks framing the face, bun); blotchy
  painted stomacher dropped (clean ivory/ebony bodice). Pearls 6×4, mantle 14 cols, collar 18 cols,
  plinth 20 seg to stay in budget. **5,976 tris** (was 5,990).
- **King**: sculpted head with a **gold-brown beard** on white (was ivory-on-ivory), charcoal on
  black; plate arms are now crisp lathe tubes (rerebrace with two gold lame ridges, gold couter with
  a fan wing, vambrace flaring into a gold gauntlet cuff, gauntlets on the pommel) instead of SDF
  tubes; ermine roll a touch slimmer/lower so the beard shows; crown arches fixed (`kit.torus` has
  no arc arg, so they were full rings dipping into the face — now `THREE.TorusGeometry(..., PI)`).
  Body cell 0.025 → 0.028. **7,982 tris** (was 7,824; ≤ 8k).
- **Fantasy board** (`squares.js`, new; `board: { build, environment }`): marble squares from
  `kit.boardLooks.marble` (dark squares identical to Classic, D28) with fine **gold inlay lines**
  between squares + diamond studs at the crossings — real metal via a metalness/roughness mask
  canvas on the same material; deep blue-black marble frame with raised gold mouldings, gold
  filigree scroll runs from each corner, a glowing blue **rune medallion** in a gold bezel at each
  corner, gold lozenges with blue gems mid-edge. **4 draw calls, 4,994 tris** (Classic 3 / 1,858).
  `runeTexture(kit)` exported and shared with the island deck.
- **Island life** (`board.js`, uses board-2's `env.update(dt, t)`): flames lick + flicker
  (vertex/fragment shader on a time uniform), waterfalls stream (tileable streak texture scrolled;
  fades in-shader), the cloud sea drifts (one rotation), distant islands bob (each its own
  phase/amplitude in the uv channel), banners sway with their embroidered crests (crests moved
  into the cloth mesh), deck medallions breathe. `update()` costs ~1 µs; no per-vertex CPU work.
- **Richer scenery**: oaks (leaning trunk, two limbs, five lumpy AO-shaded clumps) and ragged
  drooping pines replace the cone-stack trees; flowering bushes; hanging crags under every island
  (noise + curled tips) and strata/greenery on cliffs; two **great castles** (curtain wall with
  crenellations, corner towers, gatehouse, keep with turrets and a tall central spire, blue
  roofs, gold finials) — one behind each side. The archipelago and cloud sea moved **below** the
  board's island: measured at the 3D preset only y < -18 is in frame 40 units out, so the old
  islands (y up to +7) never appeared behind the board; now the castle shows over the far edge in
  3D (very ref-like on a phone) and two high islands remain as silhouettes for low Free views.
- `minPhi` 0.12 → **0.24**: Tilt (13°) only ever showed a sliver of deck, and an env with
  `update` makes the board re-render at the ambient rate while visible. Top + Tilt pay nothing.

## Numbers (headless Chrome, Metal ANGLE)
| | before | after |
|---|---|---|
| tris/piece p n b r q k | 5992 7660 5892 5946 5990 7824 | 5992 7660 **5966** 5946 **5976** **7982** |
| Top / Tilt idle, full army | 18 draw calls, 0 fps | 19 draw calls, 0 fps |
| 3D idle | 30 draw calls, static | 32 draw calls, ambient ~20 fps @ 0.9 ms frame CPU |
| environment | ~24k tris, static | 48.9k tris, 10 draw calls, build 39 ms |
| board build | Classic 1.9k tris | 5.0k tris, 18 ms |
Zero console errors across gallery Lineup/Turntable/Playground (all views, 360×740 + 1440×900),
25 s autoplay at 2× with battles, and the close-up viewer.

## How to test
- Faces: `tools/sculpt_fantasy_view.html?piece=k&side=w&one=1&view=side&noyaw=1&az=210&dist=1.3&ty=0.95`
  (new `&side=w|b` and `&one=1` = a single piece; `&parts=1` makes `assemble()` log triangles per
  part into `FANTASY_PARTS` — how the budgets above were trimmed).
- Wizard: `...?piece=b&side=w&one=1&view=angle&noyaw=1&az=200&dist=2.6&ty=0.55`; slot from above
  `...?piece=b&side=w&one=1&view=top&dist=1.4&ty=0.7`.
- Board/island: gallery `?theme=fantasy&mode=play&view=angle`, then Free + orbit for the island.
  Ambient anim follows the board's `ambientAnim` option/setting.

## Honest scores
- Wizard **7.5/10** (was 6.5): reads as a wizard with face, beard, stole, book, sleeves, crisp slot;
  still low-poly hands (spheres), sleeve droop is slightly papery at extreme close-up, hat is big.
- Queen **7.5/10** (was 7): a real face with framing hair at angle; coronet still small from Top.
- King **8/10** (was 7.5): beard/face contrast fixed, armoured arms read as plate; tabard panel on the
  coarser body is soft-edged.
- Board **8/10**: gold inlay + frame very close to the refs' mood; squares are matte-ish marble, no
  real reflections (by design: cheap, D28-safe).
- Island **8/10** (was 7): alive, castle in view, less toy-like vegetation; still stylised low-poly,
  waterfalls are flat cards without mist.

## Requests
- Board/manager: MODEL_GUIDE §8 could document `env.update(dt, t)` (only called while the env is
  visible + ambient on) and note that its presence makes the board render at the ambient rate while
  the env shows — a theme should keep `minPhi` above Tilt unless Tilt shows real scenery.
- kit: `kit.torus` silently ignores a 5th (arc) argument; an `arc` param would avoid the bug the king had.

## Open issues
- The great castle peeks over the far edge in 3D at 1440×900 (only ~2 units of background band
  there); it is fully visible in portrait and Free views.
- Faces are ~1k tris each; further detail would need a finer cell and budget elsewhere.
