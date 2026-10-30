# Sculptor notes: Sci-fi theme

Owner round 1: sculptor-scifi-1. Files: `js/themes/scifi/` (index.js, common.js, pawn.js,
rook.js, anims.js) + one line in `js/themes/index.js`. No other files touched.
Close-ups use the Halloween bench, which takes any theme:
`tools/sculpt_halloween_closeup.html?theme=scifi&types=pr&view=angle|top|low&theta=-0.9&dist=3.2`.

## Concept: "Aegis vs Nova" — sleek hard-surface droids, emissive light-lines as the signature
Toy-like, clean, chunky sci-fi (think EVE / Destiny ghosts / Halo hard-surface), not gritty.
Bevelled panels, crisp panel-line grooves, recessed light channels. Every piece has light-lines
that are visible **from straight overhead** (rings, dashes, crosses on top faces) — that is
how the dark side reads on dark squares.

### Faction palettes (`PAL` in `scifi/common.js` — import it, don't copy values)
| finish key | WHITE "Aegis" | BLACK "Nova" |
|---|---|---|
| body | pearl ceramic `#eef1f5` | gunmetal `#4b515d` (mid value, not near-black) |
| shade / deck | `#cfd7e1` / `#aab5c3` | `#3a3f49` / `#2b2f37` |
| trim (metal 1) | satin silver `#c9d2dd` | bright steel `#a7b0bf` (catches light from above) |
| dark / well | `#1d232c` / `#10141a` | `#0c0e13` / `#07080b` |
| glass (visors) | `#0b1119` | `#050608` |
| **line** (glow) | **cyan `#12c6ff`** | **magenta `#ff1a6c`** (red family = black side, per refs) |
| lineHi / lineLo | `#6fe6ff` ×1.2 / ×0.5 | `#ff6aa6` ×1.2 / ×0.5 |
| rim | darken `#16202c` (outline on light squares) | cool glow + top sheen (sheen is scaled by albedo, so wells and grooves stay dark) |
`PAL[c].spark` / `PAL[c].trail` are the FX colour lists for anims.

Overhead: white = pale disc + cyan rings/dashes; black = steel-grey disc + magenta rings/dashes.
Both read on both square colours at 360 px (screenshots below).

### Cast (all six; `names` already set in `index.js`)
| piece | name | idea | overhead read |
|---|---|---|---|
| p | **Drone** ✅ | hover-droid: landing pad with light ring, hover beam, teardrop body with arm fins, floating egg head, glass visor, two slanted glowing eyes | smallest; light ring + small dome with a glowing seam ring |
| r | **Bastion** ✅ | defence turret: octagonal plinth, 8 armour panels over a dark core, light strips, faceted collar with light band, 6 emitter blocks round a reactor well, sensor mast | ring of 6 glowing dashes around a dark well |
| n | **Strider** | mech walker head/cockpit, or a hover-bike seen side-on. Long armoured "head" (cockpit nose + sensor cluster) pointing -z, two antenna "ears", a light-line along the spine | long sideways head (≥ 0.5 footprint), ears; light line down its back from above |
| b | **Psi Oracle** | android oracle/psi-mage: slim robed android, tall split helmet = mitre; the **slot is a glowing light-line** splitting the helmet front-to-back, small glowing orb on top | dome cut by a bright line + a small dot |
| q | **AI Core** | a starship AI: a glowing core sphere held in a ring of 8 floating vane-blades (coronet), on a tapered pedestal; or a captain-mech with a vane crown | dotted ring of vane tips (light dots) around a bright centre |
| k | **Commander** | armoured commander bust/mech with a **"+" antenna array** on top (3D cross of antenna booms with glowing tips) and shoulder pauldrons | a clear "+" with 4 glowing tips |
Heights to keep the order (this round): pawn 0.68, rook 0.72 (0.86 with mast tip). Suggested:
knight ~1.0, bishop ~0.98, queen ~1.08, king ~1.25 (+ antenna).
Faces / visors: author toward -z; the pawn turns its head/arms 3/4 toward the owner (model -x)
with a baked `YAW = 0.55` like fantasy's squire, so the owner sees the visor at Tilt/3D.

### Board idea (not built — Classic marble shows for now)
A **glass-and-metal deck** on a space station: light squares = pale frosted ceramic tiles,
dark squares = smoked slate-blue glass (keep the value near Classic's `#69717f`, D28), every seam a
thin dim emissive grid line (cyan on white's half fading to magenta on black's half), small
bevelled metal frame with corner docking clamps and running-light dots. Environment (tilted
views only): a hangar floor around the board, a huge curved **viewport window** behind it
showing a starfield, a ringed planet and a nebula (one sky sphere texture / a few sprites),
slow-blinking beacon sprites. Lights: cool key, cyan/magenta rim fills from each side.
`overlayStyle`: cyan last-move, white select, magenta hint dots read well with the palette.
Battles idea: drones zap with lightning (`fx.lightning`) and get "derezzed" (flash + sparks + shrink),
rooks fire emitter beams, etc.

## Done (round 1)
- Theme registered; `scifi/index.js` with `names` for all six; unbuilt n b q k, the board and the battle
  anims fall back to Classic.
- **One material per side** (`pieceMat`), same scheme as fantasy: vertex colour = albedo, `uv.x` glow,
  `uv.y` metal. Two additions in the patch: (1) glowing vertices have their *lit* albedo dimmed 80%, so
  light-lines stay saturated neon instead of washing to white under the key light; (2) the kit rim's
  overhead top sheen is multiplied by albedo luminance and (1 − glow), so dark wells and grooves stay dark
  on the black side (without it the black rook's well read grey from above).
- **`hsLathe()`** (common.js) — a hard-surface lathe: per-segment finishes, creases stay crisp unless a
  point is flagged smooth, optional faceting around (`flat: true` → octagons), partial sweeps with caps
  (`phiStart/phiLength/closed/caps`). Grooves are just 3–4 extra profile points with the `dark` or `line`
  finish. `fixWinding()` makes winding agree with normals so you never fight face orientation.
  Gotcha: Three primitives must go through `prep()` (sets colour + uv), or their real UVs read as glow/metal.
- **Pawn "Drone"** (`pawn.js`): **5,780 tris, 1 mesh**. Height 0.68, footprint R 0.285.
- **Rook "Bastion"** (`rook.js`): **4,546 tris, 1 mesh**. Height 0.72 (mast tip 0.86), footprint R 0.338
  (octagon vertex).
- **Move anims** (`anims.js`, measured with `kit.Timeline` at 1×; both end exactly on `ctx.to`, scale 1):
  - `hoverGlide` (p, weight 5): ring pulse and thruster burst, lift 0.16 on the beam with the nose up, bank into the
    glide while a glowing **jet-wake ribbon** streams from the thruster, brake-flare, drop and bob.
    **324 ms (1 sq) / 344 ms (2 sq)**.
  - `maglev` (r, weight 5): ring pulse, lifts 0.06 on mag-lev, slides with a lagging lean, and leaves **two
    glowing light rails** behind (particles spawned evenly along the distance, so it is a continuous ribbon at
    any frame rate), then clamps down with a ring and a spark burst. **308 ms (1) / 320 ms (2) / 352 ms (7 sq)**.
  - When the timeline is skipped (`tl.instant`), the trails don't dump their particles all at once.
  - Classic `hop` / `slide` stay in the list (weight 1 each) for variety and for the unbuilt types.
- Draw calls: unchanged from Classic, 1 per kind per side (lineup 18, full army in play 20 with board + FX).
- Console clean in every run (lineup all views, playground, autoplay at 2×).

## How to test
- Gallery: `tools/board_gallery.html?theme=scifi&mode=lineup&view=top|tilt|angle|all`, the D28 FEN from MODEL_GUIDE §5,
  `mode=play` for the playground.
- Close-ups: the Halloween bench URL above (`view=low&theta=-1.2&dist=2.6` shows the white drone's face).
- Forcing an anim in the playground: `Math.random = () => 0.999` picks the last eligible one (hoverGlide for p,
  maglev for r). Slow motion: wrap `theme.moveAnims[i]` so `ctx.tween` gets `ms * 14`
  (the theme object from `loadTheme('scifi')` is the same one the board uses).
- Headless: `~/.claude/bin/cdp start --port 9523 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist`, and send
  `Network.clearBrowserCache` before each run (board_cdp.mjs only disables the cache).

## Self-score (honest)
- **Drone 7.5/10.** Has real charm: the glass visor with slanted eyes, the floating head and the glowing beam
  read as a little droid at once. From overhead it is the smallest piece: a light ring and a dome, clear on both
  squares. Held back by: the top of the head above the crown seam looks a bit like a flat lid, the arm fins are
  plain ellipsoids, the black drone's body is dark at an angle (it reads by its magenta ring and beam), and the
  face is only visible from the owner's side.
- **Bastion 7/10.** Crisp hard-surface turret: faceted plinth and collar, panel gaps with light strips,
  sensor slits, and the emitter ring is the clearest rook read from overhead in any theme so far (six bright
  dashes round a black well). Held back by: the panel drum is a little plain and tall (could use a hatch or
  greebles), the battlement blocks are simple wedges, and the mast is the only asymmetry.

## Requests
- kit (optional): lift `hsLathe` / `fixWinding` into the kit. They are generic and handy for any hard-surface
  or architectural theme (crisp grooves without un-indexed-merge faceting).
- kit: a per-vertex glow/metal channel is now used by 2 themes (fantasy, scifi) with near-identical patches;
  one shared `kit.fxMaterial({glowScale, metalRough, dimGlowAlbedo})` would remove the duplication.
- board (repeat of halloween's): per-type `pieces.facing`. The drone's visor would face the opponent, and the knight
  could stay sideways, without baking a yaw.
- board (repeat): a shared idle uniform for glow pulses — slowly breathing light-lines would sell the theme.

## Open issues
- Board, environment, battle anims and n b q k not built yet (Classic fallback).
- Pawn tris 5,780 are close to the 6k budget (head lathe 36×22 + visor). If more detail is needed, drop the pad
  or body to 32 segments.

---
## Round 2 (sculptor-scifi-2): Knight "Strider" + Bishop "Psi Oracle"
Files: `scifi/knight.js`, `scifi/bishop.js` (new), `scifi/common.js` (added `loft`, `chamferRect`, `strut`,
finish `canopy`), `scifi/anims.js` (+`jumpJet`, `phaseBlink`), `scifi/index.js` (n, b registered). p and r unchanged.

### New helpers (common.js)
- **`loft(THREE, color, secs, {capStart, capEnd, smoothZ})`**: sweeps a CCW cross-section polygon through
  sections along z. Same finish convention as hsLathe (a point's key = finish of the edge ending there);
  `sec.key` paints the whole band before that section (transverse grooves/trim bands); `sec.smooth`
  softens the curve along z except next to keyed bands; a point flag `[x,y,key,true]` softens that corner.
  Flat facets by default = crisp hard-surface panels. Caps take a finish key.
- **`chamferRect(w,h,c,{cx,cy,bot,side,top,ch})`**: 8-point section. **`strut(THREE,color,A,B,sec,ts,opts)`**:
  lofts `sec(t)` along A→B (ts may be `{t,key}` for bands). Struts in a y-z plane keep local x = world x.
- `PAL[c].canopy`: tinted cockpit glass (w `#1d4258`, b `#1a0c14`). Black-glass canopy made the white
  knight read half-dark from overhead.

### Knight "Strider" (`knight.js`): **4,736 tris, 1 mesh**, height 0.995 (ear tips), footprint 0.39 (nose)
Chicken-walker mech. Hull = one `loft` of a 22-point section (chamfered box + side panel groove + recessed
spine channel whose floor is the light-line), 15 sections: rear bevel, transverse groove, canopy frame band,
tinted wrap-around canopy, glowing visor slits in the side grooves at the front, nose sensor. Swept ear
blades with glowing tips, side sensor pods (light strip on top, 2×2 emitter face), chin cannons, two
jump-jet bells on the back (glowing throats), pelvis + axle, reverse-jointed legs (thigh/shin struts,
glowing joint hubs, shin light-line on the outer face), bevelled feet with glowing toe caps, deck pad.
Overhead: long hull pointing sideways with the bright spine line, pods at the shoulders, ear dots at the back.

### Bishop "Psi Oracle" (`bishop.js`): **5,116 tris, 1 mesh**, height 1.03 (orb), footprint 0.295
Pad; hard-surface robe lathe (glowing hem band, panel groove, sash, chest); glowing seam down the front
of the skirt; faceted octagon mantle with a light edge; faceted shoulder plates; flared sleeves meeting in
front around a floating psi orb in a trim ring; head with glass faceplate + eye-line; **split mitre**: two
half-lathes (`phiLength: PI`, caps finished `line`) scaled long front-to-back, leaning apart 0.2 rad from
the brow, with a `lineHi` blade plate filling the V; floating orb above the tip. Overhead: oval dome cut by
a bright line (the glowing cut faces tilt up toward the camera) + dot, octagon mantle, pad ring.

### Anims (measured by summing ctx.tween ms at 1×)
- `jumpJet` (n, weight 5): crouch 45 → jet wash across the deck + plume + ring → arc leap (H 0.5–0.85)
  nose-up then nose-down with evenly spaced exhaust puffs → stomp: thick ring, dark ring, spark skid,
  0.02 shake, squash. **313 ms** (knight move, 2.24 sq).
- `phaseBlink` (b, weight 5): ring + motes, collapses into a needle of light (85) → flash → a dotted light
  streak races along the diagonal (100–140) → flash + motes + ring, re-forms with overshoot (95).
  **314 ms** at 4 diagonal squares. No material changes (ownMaterials clones would drop the glow patch).
- Both use `ctx.tl.instant` guards so tap-to-skip doesn't dump the trail particles at once.
- Wall-clock with board overhead: 350–420 ms (the pawn's 324 ms anim measures 426 ms the same way).

### Testing round 2
- Slow motion incl. FX: in the playground, wrap `theme.moveAnims[i]` so `ctx.tween` gets `ms*SLOW`, and
  wrap `ctx.fx.update = dt => orig(dt/SLOW)` (the board resets `fx.rate` every frame, so setting the rate
  does nothing). Script: `$SCRATCH/slow.js` pattern, not checked in.
- Gallery Top 360 with `fen=8/8/1nnbb1pp/8/8/1NNBB1PP/8/8 w - - 0 1` puts each n/b on both square colours.
- Results: console clean (lineup all views, 360 + 1440, close-ups, slow-mo runs, 25 s autoplay at 2×);
  draw calls 18 lineup / 20 in play (unchanged); frame CPU 0.43 ms, 60 fps.

### Self-score (honest)
- **Strider 7.5/10.** Reads as a mech at once, and from overhead it is the clearest knight "long head
  pointing sideways" in the set. Panel grooves, canopy, slits and glowing joints sell the hard-surface look.
  Held back by: the hull is visibly faceted on the curved canopy (flat bands), the rear is a bit plain,
  and the legs are mostly hidden from Top.
- **Psi Oracle 6.5–7/10.** Clean silhouette, nice glowing hem/seam/orb, and the split mitre reads as a bright
  slot from overhead on both squares. Held back by: the helmet still reads a bit "egg" at an angle (the slot
  shows as a stripe on one side unless seen from the front/back), the sleeves read like a strap across the
  chest from some angles, the faceplate is small.

### Requests
- kit (optional): `loft`/`chamferRect`/`strut` are generic hard-surface tools, candidates for the kit next to hsLathe.
- board: a way to slow FX together with the timeline for tests (`fx.rate` is overwritten each frame).
- (no facing override used: both pieces use the default sideways yaw; the bishop slot then reads left-right.)

## Round 2 — sculptor-scifi-3: Queen, King, board + environment, sounds
Files (new): `js/themes/scifi/queen.js`, `king.js`, `board.js`, `sounds.js`. `index.js`: imports + `q`, `k`,
`facing.byType.k = 'player'`, `board`, two move anims appended to `moveAnims`, `sounds`. Nothing else touched.

### Queen "AI Core" (`queen.js`) — 4,640 tris, 1 mesh, height 1.11
16-gon plinth with a light channel → 12-gon panelled pedestal (groove, light ring, 4 light strips) → emitter dish →
hover beam → **floating crown collar** with a light band → **8 swept vanes** (hsLathe wedges re-shaped by a
`swirl()` pass: taper toward the tip + a quadratic twist of 0.55 rad, so they look caught mid-spin; flat facets via
`computeVertexNormals` on the non-indexed result), each with a proud glowing rib and a `lineHi` bead at the tip,
tied by a thin crown hoop → the **glowing heart** (icosphere) in two crossed trim gimbal rings on a spindle.
Overhead: a dotted circle of 8 bright beads + bright centre, swirl of vanes between (clear at 360 px on both squares).
Gotcha: hsLathe `caps` take the FIRST profile point's finish — make it 'body' or the blade sides go black.

### King "Commander" (`king.js`) — 5,544 tris, 1 mesh, height 1.38 (antenna tip)
Octagonal plinth → 8 armour tassets round a dark core (light strips front/back) → hip ring with a glowing belt →
faceted chest lofted with `loft`+`chamferRect` (stood up with rotateX; groove band, broad shoulders) with a hex
reactor and chevron light-lines → faceted octagonal pauldrons with light stripes → armoured arms (`strut`, glowing
gauntlet band, block fists) → backpack with two thruster nozzles → gorget + faceted helmet, glass visor band with a
glowing slit, low crest fin → **"+" antenna array**: mast, hub, four bevelled booms whose top face is `lineHi` framed
by dark chamfers (pops on pearl and gunmetal alike), `lineHi` beads at the four tips and on the mast top.
Faces its owner via `pieces.facing.byType.k = 'player'` (the "+" is 4-fold so it stays axis-aligned).

### Move anims (in queen.js / king.js, appended in index.js; tweens only, end exactly on `ctx.to`)
- `coreSpin` (q, weight 5): spin-up + flash ring, lift 0.14 on the hover field, glide while spinning 1.5 turns with
  motes thrown off the vane tips (spawned by distance, no burst on skip), settle onto whole turns (no snap) + ring
  pulse. Nominal 60 + (160 + 14·dist, ≤ 210) + 55 = **≈ 290–325 ms**.
- `commandJet` (k, weight 5): crouch, backpack thruster flare, low powered hop pitched into the move with a jet trail,
  heavy landing: stomp ring, dark shock ring, spark skid, shake 0.015. 45 + (185 + 15·dist, ≤ 230) + 60 =
  **≈ 300–335 ms** (castling 2 sq ≈ 320). Wall-clock in headless incl. screenshot overhead: 365–400 ms.

### Board (`board.js` build) — 3 draw calls, static
One 1024² canvas: frosted pearl ceramic tiles (`#d3d8df`, bevel highlight, speckle) vs smoked gunmetal glass
(`#656d7c`, ≈ Classic's D28 value, diagonal sheen, cut-corner inset), dark 4 px seams; an **emissive map** lights only
the seam cores, cyan on white's half → violet → magenta on black's half, with brighter nodes at the crossings.
Coordinates in monospace, flipped for 'b', `coordinates:false` honoured. Frame: bevelled gunmetal extrusion + trim
lips + 4 corner docking clamps (one vertex-colour material); light strips along every edge (cyan white side, magenta
black side, violet at the side midpoints) + running-light dots on the outer face and clamp nubs (one unlit
material, `toneMapped:false`). `overlayStyle`: cyan last move, white select, magenta hint. Colours in `LOOK`.

### Environment (tilted views only, `minPhi` 0.12) — 15 draw calls, 10.7k tris (board: 3 calls, 2.6k tris)
Octagonal station platform (panel-plate canvas texture), faceted hull underneath, 16 slanted viewport mullions with
light strips + top rail, radial deck light rails, 4 consoles beside the board with glowing screens, a plinth under
the board. Sky = camera-centred sphere with a procedural star + nebula shader (direction-based, crisp at any zoom),
**drawn last at the far plane** (only shades uncovered pixels). A ringed gas giant rises over the far railing in the
3D view from white's side; a moon and a ring station (blinking red beacons) beyond black's side; 3 small ships with
engine glow drift along lanes placed in the visible band (`env.update` moves them). Railing beacons blink on the
shared ambient clock (`userData.ambient`). Lights: cool key (shadow) + hemi + faint cyan/magenta side fills; cool
studio envScene. Positions were placed from measured camera rays: in the 3D preset the sky shows only from about
-27° to -32° elevation above the deck's far edge, so everything in the vista lives in that band.
Cost: Top view = 0 fps when idle (nothing ambient on the board), 14–18 draw calls. Tilt/3D/Free = ambient loop at the
capped ~20 fps, **0.6–0.8 ms CPU/frame**, 25–30 draw calls.

### Sounds (`sounds.js`, audio-agent recipe format)
move (4 var.: hover hiss → mag-clamp on a metal deck: stone tap + metal modes + low thump + servo blip), capture
(falling square/saw zap + noise crack + heavy clamp + sub thump), castle (two clamps), check (two-tone console alert
E6→B5, square + FM bell), promote (filtered saw sweep + rising FM arpeggio), `laser` override (detuned diving saws +
muzzle crack), `thud` (mech step), `knock`. `node tools/audio_cdp.mjs --port=…` → all scifi sounds render, peaks ≤ -3 dBFS,
move -17, capture -13…-14, all passed. No music declared (none generated).

### How to test (round 2)
- Gallery: `tools/board_gallery.html?theme=scifi&mode=lineup|play&view=top|tilt|angle|free`; force anims with
  `&anim=coreSpin` / `&anim=commandJet` in play mode; `G.boards[0].setOrientation('b')` shows black's vista.
- Q/K top read: `&mode=lineup&view=top&fen=8/2qk1kq1/8/8/8/8/2QK1KQ1/8%20w%20-%20-%200%201` at 360×740.
- Close-ups: `tools/sculpt_halloween_closeup.html?theme=scifi&types=qk&view=angle|top|low&theta=-1.3&dist=3.4`
  (the bench ignores `facing.byType`, so the king shows sideways there).

### Self-score (honest)
- **AI Core 7/10.** Distinct regal silhouette, the spin is legible even at rest, dotted circle + bright heart from
  overhead. Held back by: the vanes read a little like a claw/cage at low angles; the heart is small behind the
  gimbals from the side; the bench lighting washes the light-lines toward pastel.
- **Commander 7.5/10.** Reads as an armoured mech officer at once (visor, reactor, pauldrons, thrusters), tallest
  piece, and the "+" is the clearest king read in any theme so far at 360 px. Held back by: arms are plain struts,
  the backpack nozzles are simple, the back view (what the opponent sees) is less interesting than the front.
- **Board 7.5/10, environment 7/10.** Board is crisp and readable with real D28 contrast and seams that glow just
  enough. The 3D vista (planet over the railing, starfield) sells "station deck"; the deck itself is a bit flat/dark
  and the consoles are simple boxes.

### Requests (scifi-3)
- board: an `env.update(dt, t, camera)` camera argument would let vistas follow the view (Free orbit) instead of
  being placed per side.
- board: ambient loop runs at Tilt too (env visible above minPhi 0.12) even though only deck edges show; an env
  option like `ambientMinPhi` would let themes keep Tilt idle at 0 fps.
- audio: an ear check of the scifi set (designed + measured only); a `scifi` music loop if Music Studio has time.
