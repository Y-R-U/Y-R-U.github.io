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
