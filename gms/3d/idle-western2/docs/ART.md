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
Two rigs, one shader. **lite** (default, ~7.6 k verts) and **full** (~22 k, every variant; the spectacle cast — default when
`hats:false`, or pass `rig:'full'`). Head ≈ 40 %, a big bulbous rosy nose with a highlight, jug ears, heavy brows, beady
catchlit eyes with lids, bushy moustaches spreading from under the nose, and five **expressions** (`kit.EXPR` grump · grin ·
shock · angry · sozzled; `look(i, {expr})`; clips override: flail/handsup/sprawl → shock, punch/duel/draw → angry,
cheer/tiphat/cancan → grin, stagger/slump/dizzy → sozzled). Variant codes are masks (hair 100+, moustache 300+, expression
400+), so a lite part stands in for several full variants. Lite accessories: apron badge vest dress bottle scarf.
**Town crowd pool** (`kit.crowdPool`, PERF P#4): every lite crowd is mirrored each hero frame into ONE `town:crowd`
InstancedMesh + one blob mesh (per-instance frustum cull, hidden instances skipped). Source meshes sit on
`kit.CROWD_LAYER.card` (cards only); `pool.poolOnly(crowd)` = never drawn directly (ambient folk). `world.prepare` sets layers.
Passers-by wear everyday hats at 0.85–1.05 scale (1 in 6 bare-headed); giant hats are for the named cast and your tier.
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

### Ghosts (`kit.ghost`, `kit/ghost.js`)
`kit.ghost({ count, hat, tint, glow })` → `{ mesh, set(i, x, y, z, heading, s), hide(i), alpha(a), commit() }`. Bedsheet
ghost in a dark stetson, translucent with a cyan fresnel rim, hem flutter + bob in the shader; one draw, ~1.6 k verts each.

### Sky and day cycle (W18)
- `kit/lighting.js` sky dome (one draw, follows the camera, layers all): gradient horizon → mid → top, warm band toward the
  sun, sun disc that blooms, streaky clouds lit from the sun side, moon + stars at night. Disc position is decorative:
  `LIGHTS[k].disc {az, el}` (golden −8°/7°, low on the horizon where the hero looks).
- `js/data/clock.js` (pure): ~20 min cycle on `game.simTime` — golden 15 %, dusk 4 %, night 21 %, dawn 6 %, day 54 %; a fresh
  save boots in golden hour. `world.clock` / `world.gameClock()`; light re-evaluated every 1 s. `?cycle=60` fast day,
  `?clock=sec` offset, `?tod=h` pins the light.
- Night is deep blue with a warm horizon glow and warm lantern pools (hero luma 0.42 at tod 23; mist is blue-grey, not lilac).
- Mesas (R4): painted into the sky dome, not geometry — `buttes()` in lighting.js, 26 buttes in three haze layers (far
  low/hazy → near taller/clearer), 1–3.5° tall so the sky stays open, sun-side flanks lit, strata stripes, a notch for the sun
  disc. Colours `LIGHTS[k].rock {lit, shade}`. Visible in the hero AND every card (cards used to hide `town:far`). A ranch
  windmill + water tower silhouette past the end of the street are still geometry.
- Sky gradient (R4) is framed per view: `uTopY` (sky height at the frame's top edge) maps horizon → rose → violet onto
  whatever slice of sky the camera sees, so a card with 6° of sky still gets the full sunset ramp.

### Town (`kit/town.js`, built by `world.js`; `world.town`)
- Chunks are x-cells (56 m) × two bands (R5): `nm` (north lots + street) and `s` (Pomfrey's side); ground pebbles/tufts
  live in their cell's chunk (one draw per cell). `mesh.userData.cell = {x0, x1, band}`. Cards (`world.prepare` line) show only cells
  within ±40 m of the plot, hide `s` unless the card camera faces south, hide `town:far`; hero chunks > 60 m from the look
  point don't cast shadows (P#2/P#5).
- `world.town.signs` (town sign batch mesh), `world.town.graves.setCount(n)` (world calls it from `state.graves.length`;
  40 slots on Boot Hill), `world.town.lamps`, `world.town.life` (`walks`, `pigeonSpots`), windmill rotor spins in `tick`.

## Budgets (W10)
- Crowd: hero = 2 draws total for every lite crowd (pool); cards = 1 + 1 blob per crowd. Lite rig 8.0 k verts/person (R4).
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
- 2026-10-04 A round 2: lite crowd rig (7.6 k vs 22.3 k full) + town crowd pool (one hero draw), card culling in
  `world.prepare` (cells ±40 m, Pomfrey's side and `town:far` hidden, ambient folk pool-only), far chunks don't cast shadows,
  W18 game clock (`data/clock.js`) + warm blue night, sky dome with sun disc/clouds/stars, faceted striped mesas, skyline
  windmill + tank, caricature push (bulbous nose, jug ears, lids, bushy moustaches, five expressions), smaller everyday hats on
  passers-by, `kit.ghost`. Shots `docs/art/a/r2_*.png`.
  Perf (perf-audit, CDP 9331; vertex and draw counts are exact, timings were taken with load avg 6–16 from other lanes):
  static hero 109 calls / 2,793 k verts → 80 / 1,373 k (−51 %; all crowds 1.40 M → 272 k in 1 draw);
  cards 754–1,095 k → 244–451 k verts (−60 to −70 %), 25–29 → 19–25 draws. rAF p95 is not comparable under that load
  (before 3.1–3.6 ms at load 3.4; after 5.9–10.5 ms at load 6–16); test-scroll phone 8.2 ms at load 13–20 (gate 8),
  desktop 6.2 ms pass. Pool gather costs ~0.1 ms at CPU 4×. Re-measure on a quiet machine.
- 2026-10-04 A round 3 (critic r2 fixes). **Light:** golden is the hero default look (sun el 23°, az 36, warm `#ffbf78`
  6.6, cool blue hemisphere `#8494e0` 0.46, long raking shadows); "day" is now a low warm afternoon too (el 30, was 46).
  **Night:** fill −67 % (0.72 → 0.24, blue `#3c5290`), deep navy sky, moon disc low in the hero frame (el 4°, bigger, with
  maria), stars down to the horizon band, crowd rim no longer blue-washed. Light pools = the existing additive decal
  draw, now 2× stronger plus `ambient.addSpill([[x, z, rx, rz]])` warm spill in front of every frontage (world.js adds one
  per lot and Pomfrey front; no extra draws, no point lights). **Characters:** `CROWD_K` 1.22 → 1.4 (people ≈ 15 % bigger
  vs buildings), heads ×1.14 in the rig shader (every rig, incl. the cast), bigger eyes/catchlights, thicker brows,
  mouths and moustaches (read at ~150 px). **Materials:** per-board tone ±12 % on clapboard and planks, bleached grey and
  dark replaced boards. **Windows:** `windowW` puts a dark silhouette (head + shoulders, sometimes a hat brim) in ~½ of
  the lit windows (`interior:false` opts out; +11 k verts town-wide). **Signs:** every plot builder carries
  `b.signText` (line name, sign-shaped by `signName()` in plotbase.js) and a lazy `b.signs` batch on its own tier;
  `plots/western.js signBoard()` paints it (style `pomfrey` on purple boards, else `civic`; `o.text` overrides).
  **Bulb strings** moved to their own mesh `town:bulbs`, raised to 7.4–7.6 m; `world.prepare(line)` hides it in cards.
  Shots: `docs/art/a/r3_before/`, `r3_before_sheet.jpg`, `r3_after/`, `r3_after_hero17.jpg`, `r3_after_hero22.jpg`,
  `r3_after_cards.jpg`. Perf (CDP 9331, load ~3): hero 1.63 M verts/render idle (static 1.70 M, 97 calls avg, 122 max —
  +~9 sign draws), S22 test-scroll rAF p95 3.9 ms, desktop 2.7–5.6 ms, PASS.
- 2026-10-04 A round 4 (critic r3). **Crowd:** hero pool keeps ~30 % of each crowd (`pool.keep`, first live instances)
  plus `pool.clear` zones (saloon door ejection lane) → 63 → 24 people in the saloon hero (−62 %); `crowd.thin=false` opts out.
  **Rig** (lite + full): stocky boots with sole + shaft, thicker legs, barrel torso + belly, arms standing clear of the body
  (shoulder ball, angled sleeve, cuff on full) ending in big mitten hands with a thumb; held props moved to the new hands;
  idle acting variants by instance (talker gesturing, akimbo, relaxed), bigger walk swing + forward lean. Lite 7,968 verts
  (full 22.9 k). **Clay shading:** crowd shader gets a warm terminator (subsurface-ish) band + wrap fill from the sun
  (`uSunDir/uSunCol`, set in `kit.setLight`) and an under-side occlusion. **Sky:** sunset palette (golden top `#6656b0`,
  mid `#e8869a`, horizon `#ffb47c`), view-framed gradient, broader sun glow, painted butte layers; the geometric mesa ring is
  gone (perf). Haze: hero fog `dist+45 … dist·2+560`, cards `70 … 430`. **Ground:** hashed boot/hoof prints and sunbaked red
  patches in DIRT; rock clusters, tufts and pebble scatter along both kerbs and the porch fronts. **Facades:** trim slot is
  now dark wood `#8a5c3e`; chipped/worn paint at clapboard edges; ground-contact AO on every upright face (y < 0.85 m).
  **Night:** violet ambient + sky + purple butte silhouettes; lamp light soft-clipped in the shader (amber, never > the bloom
  threshold); bloom threshold 1.65 at night (was 0.8) so only emissives bloom; glow > 2 = half by day, full at night
  (bulbs 2.4); lamp pool decals deeper amber, lighter; mist violet.
  Shots `docs/art/a/r4_before/`, `r4_after/` (includes other lanes' R4 work), `r4_before_sheet.jpg`, `r4_after_sheet.jpg`,
  `r4_after/lineup_lite.png`. Perf (perf-audit static, CDP 9331): hero 101 calls / 1.72 M verts / GPU 4.0 ms with post →
  109 calls (other lanes) / 1.56 M / 2.62 ms; cards +20–35 k verts each (rig + kerb dressing), GPU equal or lower.
  test-boot, test-cards PASS; test-scroll desktop pass, phone 3.8 ms PASS on the first run, 8.2–10.5 ms under load avg 7–11.
- 2026-10-04 A round 5 (critic r4). **Draw trim** (`tools/drawlist.mjs [vp] [tod] [pin]` lists one hero frame's draws by
  object, scene + shadow pass): town bands n+m merged and ground cells folded into their chunks (25 → 10 hero draws);
  card-only `fg` framers moved to the card layer (they drew a zero-scale matrix in the hero: −13); new `kit.plotBatch`
  (`kit/plotbatch.js`) merges every plot's sign batch + contact shadows + the town contact + town signs into one mesh per
  material on the town layer, rebuilt only when the visible set changes (originals go to the card layer, so cards still
  draw their own): −14. Hero frame (desktop, saloon pin) 134 → 91 draws incl. post + shadow; test-scroll desktop hero
  151 → 98–101, phone 143 → 96; frame max 216 → 151–180. Hero verts 1.52 M (far desert scatter −40 %, eyes +120 v/person).
  **Light:** golden sun el 23 → 14 (long shadows), fill 0.46 → 0.36 and bluer, env/bounce down, exposure 1.13, fog pushed
  out (hero `dist+110 … dist·3+1000`, cards `120 … 760`); statics' fresnel rim is sun-side weighted (`RIM_FRAG` uses
  `uSunDir`), crowd rim likewise (backlit edges). **Night:** blue moonlight `#7c9cff` 1.15 + blue hemisphere, zero warm bounce,
  warmth only from lamp pools (decal 0.34 → 0.55, deeper amber) and lamp light; glow Points 2.6 → 0.9 m; bloom `wide`
  (1/8-res level) × 0.15 at night, threshold 1.85 (post.js `bloom.wide`, see CONTRACT) — no floating orbs; mist 0.05.
  **Faces:** eye whites + big inward-looking pupils + catchlight, brows always dark `#3a2620` and 25 % thicker, skin palette
  desaturated, warm skin/terminator push cut ~60 %. **Wood:** new WOOD surface (slots wood/wood2/woodDark/raw/door/trunk,
  axis = the part's long side → `aPbr.w` 0.27/0.28/0.29): grain streaks, board seams every 0.23 m, knots; `iron` (hoops),
  `brass`, `bottle` get spec/metal in `SLOT_PBR`. **Backdrop:** sun disc moved into the street gap (az 7°, el 3.6°, smaller,
  pale gold), tighter glow; cloud bands with lit undersides (dim at night); buttes taller (to ~4.5°), saturated red lit
  faces with a warm top rim, haze 0.62/0.36/0.12 → 0.46/0.22/0.06.
  Shots `docs/art/a/r5_before/` (= r4_after) + `r5_before_sheet.jpg`, `r5_after/` + `r5_after_sheet.jpg`.
  test-boot, test-cards, test-scroll PASS (phone rAF p95 4.1 ms, desktop 1.6 ms).
  Open: night cards still bright under lamp light; dirt reads a bit monochrome red-brown at golden; mesas in cards are good,
  in the hero partly hidden by the HUD band.
