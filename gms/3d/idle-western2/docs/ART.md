# Idle Western 2 — art kit, town and characters (lane A)

Look A "Clay Caricature" (docs/ART_DIRECTION.md). Lane A owns `js/render/kit/*`, `js/data/palette.js`, `js/data/plots.js`,
`js/render/world.js` and this file. Lanes P (plots) and S (spectacle) build on the APIs below; ask for changes in
CONTRACT.md "Cross-lane requests".

## Street layout (`js/data/plots.js`) — read this before placing anything

- **One main street along +x.** Street centre `ROAD_Z = 9`, packed dirt `STREET_W = 8` wide (z 5 … 13), ruts at ±1.55 m.
- **North side = the 9 business lots** (`PLOTS`, kind `line`), plot origin at `z = 0`, `rotY = 0`, the front faces **+z**
  (the street). Lot widths `LOT_W` (plot-local x span, centred on the plot x):
  shine 12 · tubs 13 · livery 16 · saloon 16 · dentist 12 · garter 14 · undertaker 13 · jail 13 · bank 14 (`p.w`, `p.d = 9`).
  Lots in a block are 1 m apart; 8 m alleys split Lower Street / Saloon Row / Bank Block.
- **Plot-local convention:** facade plane at local `z ≈ 0`, boardwalk/porch `z 0 … 2.5`, open ground/queue `z 2.5 … 5`,
  street edge at local `z = 5`. Backyard `z < −4.5` (town.js puts outhouses/fences behind `z −7`). Keep the building inside
  `|x| ≤ w/2`.
- **Hub** (`kind: 'hub'`) = the open street in front of the Thirsty Gizzard: `x = saloon.x`, `z = ROAD_Z − 1.5`. Keep hub props
  inside local `|x| ≤ 8`, `|z| ≤ 3`.
- **South side** (town.js, lane A): `FRONTS` — Pomfrey's 7 frontages + Town Hall, facades at `z = 15.5` facing −z, porches
  to `z 13`. The church closes the street at `x = END + 24` (`STREET.end` = 145). Boot Hill: `BOOT_HILL {x, z, r, h}`.
  Landmarks: `LANDMARKS.waterTower`, `.windmill`, `.railEnd` (v1.1 Railroad End starts past the Bank Block corral).
- `STREET = { x0, x1, z, width, north: 5, south: 13, end }`. `HERO_VIEW` is the framing hint for the director (below).

### Hero framing (for lane S, `cameras.js`)
A portrait frame is only ±8° wide, so a camera looking straight down the street sees neither side. The composition that
reads like `refs/a_clay_hero.jpg`: **camera over the south boardwalk/street, looking down the street (+x), yawed ~18–22°
toward the north facades, elevation ~28–32°, look target on the north boardwalk edge (z ≈ 4–5), distance ~45–52 m.**
The business facades fill the left/middle, the street runs diagonally, Pomfrey's porch/awnings sit in the bottom-right
corner (the two colour camps in one frame). Test frames: `docs/art/a/t8.png` (yaw 20, el 29, r 50).

## Kit additions (all through `kit`, `js/render/kit/index.js`)

### Palette and skins (`js/data/palette.js`)
- Barn paints (same value band): `red teal mustard sage rose cream slate ochre plum`; wood `plank plank2 plank3 wood wood2 woodDark raw`;
  `tin rust roof roof2`; `cactus cactusDark scrub hay rock rock2 rock3 rockDark dust bone cloth brass badge star potion`.
- Ownership camps (W3): `you you2 youTrim youCream` (warm teal + brass), `pom pom2 pomTrim pomCream` (purple + gold).
- `SKINS.{you, pomfrey, civic, none}` → `{ trim, board, board2, awning, awningAlt, door, letter, crest }` — pass the key as
  `o.skin` to any western builder; `kit.SKINS` re-exports it.
- `LIGHTS.{dawn, day, golden, dusk, night}`; `DAY_KEYS` gives golden hour 15:30–19:00 (the money shot). Sun azimuth ≈ 40°
  (ahead-right of a camera looking down +x): north facades lit, shadows rake toward the lens. Night is violet, lamps warm.

### Procedural surfaces (`kit.SURF`, `build.js`)
`b.slab(slot, …, { surf })`; slots auto-pick: `plank*` → PLANK, `road` → DIRT, `dirt` → DIRT(0.15 wet), `grass*` → GRASS.
- `SURF.CLAP` (0.1) weathered clapboard on walls (horizontal boards + shadow lip). `falseFront` uses it.
- `SURF.PLANK` (0.18) floor boards along z / vertical boards on walls; `SURF.PLANKX` (0.21) boards along x.
- `SURF.DIRT(wet 0..1)` packed street dirt (pebbles, mottling; wheel ruts appear automatically inside the street band).
- `SURF.ROOF` (0.4) shingle/tin courses on up-facing faces; `SURF.GRASS` desert scrub.

### Western vocabulary (`kit.western.*`, `js/render/kit/western.js`)
Every function is `(b, x, z, o)` in the builder's space; `o.ry` (0 = front faces +z), `o.y`, `o.parent` (Matrix4).
- `falseFront(b, x, z, { w, d, h, top, parapet: 'flat'|'stepped'|'arched'|'gabled'|'scroll', paint, trim, skin, floors,
  door: 'single'|'double'|'swing'|'none', doorX, doorLeaves, windows, porch: true|false|{d, h}, awning, balcony, sign,
  text, signs, signStyle, roof: 'gable'|'shed'|false, roofSlot, lean, boardwalk, steps, lamps, curtain, shutters })`
  → `{ M, w, d, h, top, front, sign: {x,y,z,w,h} (local to M), door: {x,z}, porch: {d,h,y}, lamps, hang: {x,y,z} }`.
  Extruded bevelled false front (soft clay edges), clapboard, trim band following the parapet, sign board, windows with
  night glow, porch with posts/braces and tin roof — or a striped skin `awning`, or a spindle `balcony` (2 floors).
  Pomfrey's skin adds his **crest** (gold-edged purple shield with a gold top hat). Porch lamps are pushed to `b.lamps`.
- `hangingSign(b, x, y, z, { w, h, reach, skin, signs, text, style, ry, parent, glyph })` — iron arm + board hung
  **perpendicular** to the facade (W3); painted both sides. Use `r.hang` from `falseFront` for the arm position.
- `stake(b, x, z, { kind: 'forsale'|'reserved', signs, text, lot: [w, d], tilt })` — the empty-lot stake (+ string lines).
- Furniture: `hitch`, `trough`, `barrel({lying, s, slot})`, `crate({s, slot})`, `hay`, `wheel({r, lean})`, `lanternPost`,
  `wantedBoard({n, bounties, signs})`, `bunting(b, a3, c3, {colors, sag})`, `bulbString(b, a3, c3, {n, sag})`, `rail(b, x0, z0, x1, z1)`.
- Parts: `windowW(b, x, y, z, {w, h, trim, shutters, curtain, parent})`, `doorW(...)`, `crest(b, x, y, z, {s})`.
- Desert/skyline: `cactus({s, arms, flower})`, `prickly`, `tuft`, `rock`, `tumbleweedGeo()` (geometry, r ≈ 0.45),
  `mesa(b, x, z, w, d, h)`, `waterTower`, `windmill` + `windmillRotor(b)` (dynamic, spin about local z), `grave({kind: 'cross'|'stone'|'board'})`.

### Painted signs (`kit.signs`, `js/render/kit/signs.js`)
One shared canvas atlas (2048×1024 pages, 64 px rows), cells cached by text+style+aspect.
- `const sb = kit.signs.batch(); sb.board(text, x, y, z, w, h, { ry, rx, rz, parent, style, back, rows }); sb.finish()`
  → one Mesh (one draw) — `\n` makes two lines. The painted cell **is** the board face; put it ~0.01 m in front of a slab.
- Styles: `you · pomfrey · civic · none · forsale · reserved · poster` (WANTED + face sketch + the text as the bounty) `· brass · chalk`.
- `kit.signs.single(text, w, h, style)` → a standalone two-sided board Mesh (falling/swinging/carried signs, the Deed sign-drop).
- In plots: **`P.text(tier)`** returns a batch owned by the plot: `'lot'` (shown only while unowned), `0|1|2` (from that visual
  tier up) or `'always'`. Example: `kit.western.falseFront(P.b, 0, 0, { skin: 'you', signs: P.text(0), text: line.name })`
  and `kit.western.stake(P.lot, 3, 3, { kind: 'reserved', signs: P.text('lot') })`.

### Characters (`kit.crowd`, `js/render/kit/crowd.js`)
One rig, one InstancedMesh (+ one blob draw) per crowd. Head ≈ 40 %, big rosy nose, thick brows, ears, catchlit eyes.
Hats, moustaches and accessories are **inside the rig** and chosen per instance, so a crowd is still one draw.
- `crowd.set(i, x, y, z, heading, clip, phase?, speed?)` (unchanged) · `crowd.place(i, { x, y, z, heading, pitch, roll, clip,
  phase, speed, s, ground })` — full tumble pose; pitch/roll pivot about the body centre, blob stays on `ground`.
- `crowd.look(i, { top, bot, skin, hair, style, acc, stache, hat, hatScale, hatColor })` — `acc`: name / index / array of
  names (`kit.ACC`: apron badge vest tails duster overalls dress mask bottle monocle cigar scarf gunbelt bigbadge pistol lantern
  rollingpin pliers garters hammer longjohns); `stache`: `walrus handlebar pencil beard chops` or −1; `hat`: name or index
  (`kit.hats.TYPES`), `hatScale` any (0.2 … 4+), `hatColor`: `kit.hats.COLORS` key or hex.
- `crowd.hat(i, type, scale, color)` · `crowd.body(i, headK, legK, s, girth)` · `crowd.dress(i, name)` · `crowd.headTop(i)`.
- `createCrowd({ hats: true })` gives every townsperson a random town hat (stetson/bowler/derby/ten/boater/flat/cap/bonnet)
  and a moustache roll; pass `hats: false` for bare heads, or set per instance.
- **Clips** `kit.CLIP`: idle walk carry work cheer sit sip sweep **flail** (thrown/air) **slump** (drunk/defeated) **duel**
  (hand hovering) **draw** (gun arm forward) **point** **piano** (seated, hands bouncing) **stagger** (drunk walk) **hammer**
  **dizzy** (bonked) **tiphat** **sprawl** (lying, use with pitch −π/2) **handsup** (robbery) **cancan** **punch** (brawl).
- **Named cast** `kit.CHARACTERS` (use `crowd.dress(i, key)`): mabel (huge, apron, tiny bowler) · wendell (sheriff, dinner-plate
  badge, ten-gallon) · mortimer (undertaker, stovepipe, long legs) · lulu (madam, feathered hat, dress) · pickles (drunk, droopy
  hat, bottle, long johns) · pomfrey (purple tails, monocle, handlebar, giant top hat) · stranger (duster, flat brim, cigar —
  a Leone duster, never a poncho/sombrero) · mulligan1/2/3 (overalls, red beards) · fingers (pianist, bowler, garters) · bart
  (black hat, mask) · nubbin (kid, cap) · pete (dentist, pliers) · thrupp (banker) · hortense · wife (rolling pin) · longjohns · you.
- **Hats library** `kit.hats`: `geometry(type)` (standalone, hat-local, seat at origin, white felt for instanceColor tint, baked
  band/feathers; use with an InstancedMesh per type), `TYPES`, `HAT` (name → index; 0–7 match lane S's cast map),
  `SEAT` (1.13, rig units, head-top seat), `COLORS`, `forTier(HATS row)` → `{type, scale, color}` (derby → bowler → stetson →
  ten-gallon scaled up to the hundred-gallon), `forPomfrey(POMFREY_HATS row)` (purple top hat shrinking to a silver thimble).

### Town (`kit/town.js`, built by `world.js`; `world.town`)
- `world.town.signs` (town sign batch mesh), `world.town.graves.setCount(n)` (world calls it from `state.graves.length`;
  40 slots on Boot Hill), `world.town.lamps`, `world.town.life` (`walks`, `pigeonSpots`), windmill rotor spins in `tick`.

## Budgets (W10)
- Crowd: 1 draw + 1 blob draw per crowd, whatever the hats/accessories. ~9 k rig vertices per instance (hats are ~45 %).
- Signs: 1 draw per batch (town: 1; plots: 1 per text tier used).
- Town: ~3 bands × x-cells of 40 m merged chunks + ground cells + far/mesas + contact + signs + rotor + graves.

## Progress log
- 2026-10-04 A1: palette + skins + LIGHTS (golden default), surfaces (dirt+ruts, clapboard, planks), western kit, sign atlas,
  `P.text`, Dribble Creek layout + south side + church + Boot Hill + backdrop, caricature rig + 12 hats + accessories +
  moustaches + 22 clips + named cast. Lab: `tools/artlab-cast.html?chars=…&clips=…&hats=1&cam=three` (cast lineup).
- 2026-10-04 A2: parametric in-shader hat (rig 31 k → ~20 k verts/person; 12 hat types ≈ 1.2 k verts), terrain is now the
  DIRT surface everywhere (no apron slab; flatter desert), bolder dirt texture (pebbles, mud cracks, dusty/packed patches,
  darker ruts), wagons (`western.wagon` flat/covered/hay/broken), yard dressing (`sage skull lumber washLine woodPile doghouse`),
  ambient boardwalk folk (8, Pickles staggers) + a rolling tumbleweed, golden light shifted orange, night darker with
  stronger lamp pools (luma 0.31), window glass no longer buried in the facade, cream Grand Hotel, bigger crest.
- Shots: `docs/art/a/` (h_sal4 hero, r1_night, r1_south, r1_lineup, town overview, cast4/cast5 lineups).
  Critic sheets r1 (blind, key in `docs/art/critic/KEY.md`): `A_r1_hero_r1 A_r1_south_r1 A_r1_lineup_r1 A_r1_night2_r1`.
- Honest self-score vs refs (critic will be ~1.5 lower): lineup/characters ~7, Pomfrey south row ~6.5, hero ~5.5 (empty
  street foreground; no sky/mesas in frame with the current high camera), night ~6.
- Perf (CDP 9331, all lanes' current work): phone S22 4× 60 fps, dt p95 16.8, rAF work p95 8.3–10.9 ms (FAIL ≤ 8; it
  was already 9.1 on my first run with other lanes active), hero calls 93–113 of which lane A ≈ 15 (town chunks, ground,
  far, signs, rotor, ambient 3); desktop pass. Biggest call counts are plot dioramas and spectacle meshes.
- Next for A: street-edge clutter density, south-row backs (bodies read as boxes from the town view), mesa haze/scale in town
  view, rig vert trim (hair styles), per-plot sign examples for lane P.
