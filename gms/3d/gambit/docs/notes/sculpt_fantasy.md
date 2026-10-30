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
