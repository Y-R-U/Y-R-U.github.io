# Sculptor notes: Halloween theme

Owner this round: sculptor-halloween-1. Files: `js/themes/halloween/` (index.js, pieces.js,
anims.js), one line in `js/themes/index.js`, bench page `tools/sculpt_halloween_closeup.html`.

## Concept: "Harvest vs Midnight": cute-spooky, never gory
A pumpkin-patch graveyard on Halloween night. The pieces are toy-like figurines: chunky
shapes, soft matte finishes, small carved faces that glow. One glow colour per side, used
sparingly: lantern faces, crypt windows, maybe eyes. Nothing bloody and no skulls as the main read.

### Side palettes (they must read from straight overhead)
| | WHITE: "Harvest" | BLACK: "Midnight" |
|---|---|---|
| body / stone | bone `#eadfc4` (shade `#b4a587`) | violet-slate `#5a4a72` (shade `#3a2f4c`) |
| cloth | bone `#efe4c8` | near-black violet `#2c2338` |
| signature colour, seen from above | **pumpkin orange** `#f47a10` | **pumpkin purple** `#7446b4` |
| trim | orange `#ee7a16` | ghost green `#57d65a` |
| glow (emissive) | amber candle `#ffb02a` | ghost green `#8cff52` |
| fresnel rim | darken (outline on light squares) | faint green glow (0.16), for dark squares |
All of these are in `SIDES` in `halloween/pieces.js`. Import that object; don't copy the values.
From above, white = warm bone + orange and black = cold violet + green. They tell apart at 360 px
on both square colours (screenshots below).

### Proposed cast (also in the theme's `names`, used by the board's name tags)
| piece | name | idea | overhead read (MODEL_GUIDE §4) |
|---|---|---|---|
| p | **Pumpkin Imp** ✅ | little cloaked imp with a jack-o'-lantern head, leaf collar | small ribbed pumpkin ball + stem dot, smallest footprint |
| r | **Crypt Tower** ✅ | coursed stone tower, crooked battlements, glowing gothic windows, crypt door | ring of merlons around a dark well |
| n | **Nightmare** | skeletal / ghostly horse head with a wispy flame mane (glow), hollow eye sockets glowing | long head sideways, muzzle ≥ 0.5 footprint, ears; flame mane can be glow mat |
| b | **Witch** | figure in a wide-brim pointed hat with a crooked tip; a **broomstick laid across the brim** | the broom is the dark slot line across the round brim; hat tip = small ball |
| q | **Vampire Countess** | tall high-collared cloak, a coronet of **bat-wing points** around a gem finial | ring of points (dotted circle) around a centre finial |
| k | **Pumpkin King** | big crowned jack-o'-lantern on a robed body; finial = **crossed bones forming a "+"** (or a wrought-iron grave cross) | the "+" from above; crown ring around it |
Heights should follow Classic's order (pawn 0.66 here, rook 0.76; knight ~1.0, bishop ~0.95,
queen ~1.05, king ~1.25). Faces look toward -z (the board turns them to the player's left), as
the pawn's does.

### Board idea (not built yet; Classic's board is the fallback)
Graveyard flagstones: light squares = pale weathered limestone with lichen spots, dark squares =
dark slate with moss in the joints, a thin glowing-moss line in the grout. Frame = a low
stone kerb with an iron fence of spiked railings, a tiny tombstone at each corner and a candle
cluster or jack-o'-lantern at the corners (emissive). Environment (only when tilted): a
moonlit hill with crooked trees, scattered pumpkins and tombstones, low fog planes (alpha cards),
a big pale moon (sprite), and an indigo night `background` with fog. Lights: cool moonlight key
plus a warm low fill from the corner lanterns. overlayStyle: an orange last-move tint and green
legal-move dots fit.

## Done (round 1)
- `halloween/index.js`: theme scaffold. Missing pieces (n b q k), the board and battle anims
  fall back to Classic. `names` covers all six pieces.
- **Pawn: Pumpkin Imp.** Lathe body with a scalloped cloak hem and soft folds (vertex
  deformation), coloured hem trim, five drooping pumpkin leaves as a collar, stubby
  capsule arms with dark mitts, and a ribbed pumpkin head (an 8-lobe lathe deformation with
  darkened creases). The carved face (triangle eyes, nose and a toothy grin) is glow material
  with a burnt dark rim. It is wrapped onto the curved lobe after longest-edge refinement, so
  the face doesn't sink into the pumpkin. The stem is curved, with a curl. **5,484 tris, 2 mats.**
- **Rook: Crypt Tower.** Lathe core (plinth, mortar core, corbelled parapet, dark well) plus
  64 real stone blocks (8 staggered courses × 8, bevelled `latheSegment`s with per-block
  colour and moss), six crooked merlons of uneven height with light caps and dark crenel
  floors so the ring reads from above, an arched plank door with a glowing grille and an iron
  ring, and four pointed windows with dark mullions. **5,788 tris, 2 mats.**
- Move anims: `impHop` (p, weight 4: a stretchy hop with a side-to-side wobble and a jelly
  landing, about 175–250 ms plus a 90 ms landing) and `cryptRumble` (r, weight 4: a heavy grinding slide with
  jitter, lean-back and rock-forward, and grave-dust puffs, about 190–290 ms plus a 60 ms squash). Classic's hop, slide,
  spin hop and knight leap stay in the list for the other pieces (and occasionally for p and r).
- Draw calls: +2 per built kind (body + glow), so a full Halloween army costs 16 instead of 12
  (gallery lineup: 21 with the board).

- **Dark-on-dark contrast (Aaron's playtest rule):** the black rook has lavender merlon caps
  and parapet top (`SIDES.b.cap` `#9a86bc`), so from Top view at 360×740 it reads as a light ring on dark
  squares. The black pawn reads by its purple pumpkin, green leaf collar and green hem trim, plus
  a faint green fresnel rim. Follow-up sculptors: give every black piece a light top surface or a green accent that shows from above.
- Measured anim length (kit.Timeline, 1×): imp hop 300 ms (1 square) / 330 ms (2), crypt rumble
  270 ms (1) / 350 ms (7 squares). Both end exactly on `ctx.to`.

## How to test
- Gallery: `/gms/3d/gambit/tools/board_gallery.html?theme=halloween&mode=lineup&view=top|default|angle`
- Close-up bench (2 rows: black behind, white in front, each type on a light and a dark square):
  `/gms/3d/gambit/tools/sculpt_halloween_closeup.html?theme=halloween&types=pr&view=angle|top|low&theta=0.5&dist=4`
  (`light=`/`dark=` override square colours). It prints tris per piece in the corner.
- Headless: `~/.claude/bin/cdp start --port 9512`, then `CDP_PORT=9512 node tools/board_cdp.mjs <out> '[...]'`.

## Self-score (honest)
- Pawn **7.5/10**. It has charm at an angle (the face and leaf collar are the best bits) and is
  unmistakable from above (an orange or purple ribbed disc). Held back by: the cloak is a
  plain bell shape, the arms are tiny and nearly invisible on the black side, and from the
  default near-overhead camera the face is seen side-on (the shared facing yaw is sideways).
- Rook **7/10**. Real blocks and crooked merlons look good at an angle, and the ring around
  the dark well is crisp from above. Held back by: the battlements are a bit thin and low next to
  the chunky body, the moss on the white plinth reads slightly as dirty-yellow, and the blocks
  are a regular grid (no cracks, ivy or bat yet). Possible additions with about 200 tris
  spare: a tiny bat perched on a merlon, and ivy tendrils.

## Requests (kit / board)
- kit: a `kit.wrapDecal(geom, {surface R(theta,y), theta, y0, lift})` plus a `kit.refine(geom, maxEdge)`
  helper. Every figurine theme will want carved faces and windows on curved surfaces; local
  copies of both live in `halloween/pieces.js` (`wrap`, `refine`).
- kit: `kit.colorize(g, fn -> [r,g,b])` (absolute set, not a multiply) and a small value-noise
  `kit.noise3(x,y,z)`. Both are local here too.
- board: per-piece-kind **facing override** (`pieces.facing` is per theme). Face-bearing pawns
  would look better facing the opponent (+x in model space) while knights keep the sideways yaw.
- board (later): a cheap idle flicker for glow materials (one shared uniform per theme), so
  lanterns and windows flicker without breaking instancing.

## Open issues
- The Halloween board and environment are not built (Classic marble shows). The gold frame is
  off-theme next to the pumpkins.
- Black pawn arms/mitts are very dark against the dark cloak; fine from above, invisible at an angle.

---

# Round 2: sculptor-halloween-2 (knight + bishop)

## Done
- **Knight: Nightmare** (`pieces.js` `knight`). A cartoon horse skull lofted along a curved spine
  (new local `loft()` helper: elliptical cross-sections with sculpt dents). It has big round eye sockets with a bony
  rim and glowing pupils (glow mat), nostril dents, a slightly open lower jaw with a dark mouth,
  four buck teeth and two pointed bone ears. It sits on a stack of five chunky vertebrae (spool lathes with
  spinous fins) over a dark spinal core, on a low grave-dirt mound. The mane is ten ghost-flame tongues
  (`flameTongue()`: wobbly lathe teardrops, vertex-coloured base→tip ramp from `SIDES.flame`)
  streaming back off the neck and crown. **6,928 tris, 2 mats (body + glow).**
  - Overhead: a long bone head pointing sideways (muzzle tip at z = −0.32, 0.47 long × 0.24 wide),
    ears, and an orange or green mane trailing behind, inside a trim-coloured plinth ring. The
    black skull is lavender (`SIDES.b.bone` `#7e6ba2`, top `#b4a2d6`) so it reads on dark squares;
    the white mound is darker earth so the bone head stands off it.
- **Bishop: Witch** (`pieces.js` `bishop`). A robed witch with a ragged hem, a pointed cape collar
  in trim colour, little arms, a face (dark eyes with glints, rosy cheeks, crooked nose; peach skin
  for white, green for black) and a ragged bob of hair. She wears a huge wavy-brimmed crooked hat (orange or purple,
  lighter at the brim edge) with a dark (white side) or green (black side) band and a glowing buckle. A **broomstick is tucked through the band**,
  lying across the brim as a chord, with a bound straw bundle at one end. The whole hat tilts back 0.13 rad
  so the face peeks out at an angle. **5,812 tris, 2 mats.**
  - Overhead: a big round brim crossed by the dark stick (the bishop's slot line), the straw bundle,
    and the small tip ball. The black brim is mid-purple fading to lavender `#a07ad8` at the edge,
    so it is clearly visible on dark squares.
- New `SIDES` keys (both sides): `bone boneTop boneShade socket flame[3] hat hatShade hatEdge band
  skin cheek hair straw strawDark stick`. Shared `plinth()` (pawn-style base, trim ring on the
  outer bevel).
- **Move anims** (`anims.js`, measured with `kit.Timeline` at 1×; both end exactly on `ctx.to`):
  - `nightmareLeap` (n, weight 5, "spectral leap"): rears, then makes a high arc pitched nose-down while the mane sheds
    side-coloured additive wisps (`fx.burst`), and lands in a puff of spirit smoke. **332 ms** (incl. 65 ms squash).
  - `witchSwoop` (b, weight 5, "broom swoop"): a quick lift, a low glide leaning into the flight and a
    twirl (1 turn, or 2 when moving more than 2.5 squares, random direction), so the broom sweeps round seen from above. It leaves a sparkle trail
    and makes a light bob on landing. **288 ms** (1 square) / **348 ms** (3+ squares).
- Draw calls: +2 per kind per side as before. The gallery lineup is now 26 (was 21 with the Classic
  n and b). Autoplay at 1440×900 ran 25 s with captures: about 49 fps headless, console clean.

## How to test (additions)
- Close-up: `tools/sculpt_halloween_closeup.html?theme=halloween&types=nb&view=angle|top|low&theta=0.5&dist=2.7`
- Headless Chrome caches unchanged-looking JS heuristically (python http.server sends
  Last-Modified and no Cache-Control). An edited `anims.js` was served stale even with
  `Network.setCacheDisabled`. Send `Network.clearBrowserCache` before a test run.

## Self-score (honest)
- Knight **7/10**. It is charming at an angle: the big glowing sockets, buck teeth and flame mane
  give it character, and it's unmistakably a sideways head from above. Held back by: the
  vertebra neck is a plain stack (it reads a bit "spine on a stick" from the side), the flames are matte
  vertex colour, so they look sculpted rather than burning, the mound is plain, and at 360 px the
  white skull is small and pale on light squares (the orange ring and mane carry it).
- Bishop **7.5/10**. Instantly a witch, and the strongest overhead read of the set: a coloured disc with a
  dark bar. Held back by: the hat dominates and the body is a plain cone under it, the face is
  only visible from low or side angles, and the arms are tiny. The white witch is very orange
  (consistent with the pumpkin pawn, but less "white" than the bone rook).

## Requests
- kit: adopt `loft(spine, sec, {rings, segs, color})` (an elliptical tube along a y-z spine with per-ring
  sculpting) and `flameTongue()`. Both are generic (necks, tails, tentacles, flames), and local copies live
  in `halloween/pieces.js`. Also adopt the round-1 `wrap`/`refine`/`colorize`/`noise` requests.
- board (repeat of round 1): a shared idle flicker uniform for glow materials. The Nightmare's eyes
  and the witch's buckle would sell it.
- board: `pieces.facing` per type. The witch's face would look better toward the opponent
  (or the camera) while the knight keeps the sideways yaw.

## Open issues
- The knight's flames have no glow. A glow-material inner core on 3–4 tongues would cost about 600 tris and
  read more "ghost fire", but would add a lot of emissive area. I left it to keep the glow sparing.

---

# Round 3: sculptor-halloween-3 (queen + king, first board)

## Done
- **Queen: Vampire Countess** (`royals.js` `queen`). A pale little countess (big glinting eyes,
  flicked lashes, rosy cheeks, a tiny smile with two fangs) with a widow's-peak updo and bun. She wears
  a long gown with a scalloped hem, a darker V bodice and a trim sash, under a floor-length cape that is
  open at the front with a bat-wing scalloped hem. A **towering collar** fans up behind her head: five
  bat-wing points, the lining facing the head and a trim rim. On her head is a **coronet of eight bat-wing
  points** leaning outward, each tipped with a bright bead, around a centre post with a **glowing gem**
  finial. Sleeves are in the cape colour and her hands are clasped at the waist; there is a brooch at the throat.
  **5,960 tris, 2 mats (body + glow), height 1.19.**
  - Overhead: a ring of light beads (the dotted circle) around a glowing centre dot, framed by the
    collar crescent (orange on white, green on black).
  - Colours: white = orange gown, bone cape, orange lining, gold coronet, auburn hair. Black = violet-black
    gown, purple cape, green lining, pale-green coronet, lavender skin. New `SIDES` keys:
    `gown gownShade cape capeShade lining pale lips vampHair crown crownShade crownTip`.
- **King: Pumpkin King** (`royals.js` `king`). A big squat jack-o'-lantern head (8 lobes; the ribs
  soften across the face so the carved decals sit flush) with a proud carved face that glows: slanted eyes,
  a nose and a wide grin with three teeth. It sits on a stout robe with buttons and an ermine placket, under a
  royal mantle that is open at the front with ermine edging and hem. He has a fat ermine collar with black ermine
  tails, sleeves with ermine cuffs and dark mitts, and a short orb sceptre in one hand. The flared crown has
  six bead-tipped points and a glowing gem at the front. A **cross of bones** sits on top: an upright bone plus two
  crossing bars, with a green vine curl and leaf at its foot. **7,880 tris, 2 mats, height 1.32 (tallest).**
  - Overhead: a big orange or purple pumpkin disc, a gold or pale-green crown ring, and a clear bone **"+"**
    with knobbly ends. The black king's bones are lavender (`boneTop`) and its ermine is lavender, so
    it reads on dark squares.
  - New `SIDES` keys: `royal royalShade ermine ermineSpot bat`. The white mantle is brick (`#a8420e`), so the
    pumpkin head still stands out against it.
- Heights are now: pawn 0.64, rook 0.77, bishop 1.00, knight 1.14 (the flames), **queen 1.19, king 1.32**.
  `lift()` stretches the body (not the head) to reach these heights, and it transforms normals analytically.
- `pieces.js` now exports `H` (helpers: `mats col mix … wrap refine loft plinth`, plus `setThree`) so
  that `royals.js` doesn't copy them. The queen and king live in `royals.js`, which `index.js` merges into `pieces`.
- Gotcha (fixed in `shell()`): `kit.latheSegment`/`kit.merge` return **non-indexed** geometry, so a
  later `computeVertexNormals()` (inside `deform`) gives **flat, faceted** shading. `shell()` welds it with
  `mergeVertices` first. Colour shells *before* deforming them, while inner/outer is still a clean
  radius test.
- **Move anims** (`anims.js`; measured with `kit.Timeline` at 1×, 16 ms steps; all end exactly on `ctx.to`, scale 1):
  - `countessBats` (q, weight 5, "bat swarm"): she twists and shrinks while 5 bats burst out (one
    `InstancedMesh` added to `ctx.scene` and removed in a `finally`, flapping by wing-span scale). The swarm
    swirls along an arc with additive wisps, then folds in and she pops back with a back-out overshoot,
    with side-coloured mist at both ends. **~300 ms (1 sq) / ~340 ms (7 sq).**
  - `countessGlide` (q, weight 2, "vampire glide"): a hover-glide leaning back, with a little twist and mist puffs. ~300–350 ms.
  - `royalHop` (k, weight 5, "royal hop"): a crouch, then a stately arc with a regal sway and a short mantle
    "flutter" wobble on the descent, landing with a stomp ring (amber or green), sparks and dust. **~300–335 ms.**
- **Board, first pass** (`board.js`, wired in `index.js` as `board: {build, environment, overlayStyle}`):
  - Surface: one 1024² canvas texture of irregular, chipped flagstones. Light squares are limestone `#d8d1bf` with
    lichen rosettes and hairline cracks. Dark squares are violet-grey slate `#6a7182`; that value is
    deliberately close to Classic's `#69717f` (D28). Moss creeps in from the dark mossy grout, and a small
    512² emissive map draws a broken, faint glowing-moss line in the joints. Coordinates match Classic.
  - Frame: 32 stone kerb blocks (jittered heights and tones, mossy patches), corner pillars, each
    with a leaning tombstone (one is a cross) and three candles (glowing flames), a tiny pumpkin on two corners,
    and a low spiked iron railing (17 posts a side, two rails). **3 draw calls** in total (surface, props, flames).
  - Environment (tilted views only, `minPhi` 0.12): a rolling ground with a hill behind, about 17 big tombstones
    and pumpkins, four crooked bare trees, nine soft fog cards and a big moon sprite. It sets an indigo
    `background` (`#120f20`) and a far `Fog` (22–60, so the board never fogs). Lights: the warm key is kept
    as default (so piece colours stay true), plus a cool moon rim light and an indigo hemi. It uses a dim studio env
    for reflections. About 12 draw calls (1 merged mesh + 9 sprites + moon), ~9k tris.
  - `overlayStyle`: orange last-move, amber select, green hint.
- Numbers: Playground start position **40 draw calls** at 3D (24 pieces + 3 board + 11 env + FX), **22 at Top**
  with the D28 FEN, lineup Top 30. Autoplay ran 25 s at 1440×900 at 60 fps (headless Metal), console clean.

## How to test (additions)
- Close-up: `tools/sculpt_halloween_closeup.html?theme=halloween&types=qk&view=angle&theta=-1.3&dist=3`
  (negative theta sees the faces: the board turns white +90°).
- Slow-motion anim frames: in the gallery Playground, filter `theme.moveAnims` to one label and wrap
  `ctx.tween` with `ms * 14`, then `G.boards[0].applyMove({...})` and screenshot. That is how the bat swarm was checked.

## Self-score (honest)
- Queen **7/10**. The face is the most charming of the set, and the bat-wing coronet and fanned collar
  say "vampire countess" at an angle. From above, the dotted ring and glowing gem read as a queen. Held back by:
  the arms are stiff sticks, the hair is a plain cap (the widow's peak is subtle), the collar is a flat
  shell (no thickness detail), and at 360 px the coronet ring is only ~10 px across.
- King **7.5/10**. Unmistakable everywhere: the bone "+" is the clearest king read in any theme so far, the carved
  grin glows nicely, and the ermine tails add charm. Held back by: the crown is a plain flared band, the
  mantle and robe are simple lathes, and the arms hang stiffly.
- Board **6.5–7/10** (first pass). The flagstones and mossy joints look good, it is cheap (3 draw calls) and
  D28 contrast holds. Held back by: the grout is a little wide, the corner props are small at the default
  camera, the environment ground is a plain murky surface (no grass detail) and the trees sit mostly out of frame.

## Requests
- kit: `kit.boardLooks.graveyard` (the `LOOK` object in `halloween/board.js`), so that D28 square contrast is
  tuned in one place.
- board: a shared idle-flicker uniform for glow materials (repeat). The candles, lantern faces and the
  countess's gem would all use it.
- board: per-type `pieces.facing` (repeat). The countess and king faces would look better toward the
  player.
- Halloween **battle anims** are not built yet (they fall back to Classic). This is a good next task: the
  countess bites, the king's pumpkin chomps, the witch zaps, and so on.

## Open issues
- Environment: the fog sprites are 9 separate draw calls. They could become one instanced billboard if the env budget gets tight.
- `kit.merge` un-indexing makes every `deform` after a merge faceted. Round 1–2 pieces have a few such
  parts (the witch's hair, for example). They are minor and left alone.
