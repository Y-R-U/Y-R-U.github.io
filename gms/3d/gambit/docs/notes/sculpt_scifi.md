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
