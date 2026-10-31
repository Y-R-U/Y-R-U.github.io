# MAP — the Kingdom Map, Muckle Bottom and RAF Much Snoring (lane MAP, 2026-10-27)

D26 (farm strip, C-Tower 2), D29 (Kingdom Map, one airport loaded at a time, magic-cloud swaps) and the long-runway
air base promised with D33. Design background: docs/AIRPORTS.md. This file is what was built.

## What the player sees

- A **MAP** chip in Free Flight: under the time-warp chip in portrait, in the top row left of the view button in
  landscape. During a trip it reads `MAP Muckle Bottom · 12.4 km`.
- Tapping it opens the **Kingdom Map** sheet (not a modal: the game keeps flying under it; ✕ closes it). Pins for
  C-Tower 1 (Krayzee Royal), C-Tower 2 (Muckle Bottom), C-Tower 4 (RAF Much Snoring), faint "coming soon" pins for
  Saltwhistle Sands, Mount Krumpet and Krayzee International, your plane as a gold arrow, a dashed route line.
- Tap a pin: a card with name, controller, runway (`RWY 07/25 · 620 m grass · 19 km WSW`), a blurb, and whether your
  plane fits (`Fits your Royal Runabout (needs 319 m)` or red `TOO SHORT FOR THE ROYAL JUMBO` + the farmer's quip).
- One button: **START HERE** on the ground before your first take-off (the start-at entry: a quick cloud swap and you
  are lined up on that airport's runway), otherwise **FLY THERE**. A refused airport shakes the card and the quip is
  flashed on the HUD banner; nothing changes.
- FLY THERE: "COURSE SET · MUCKLE BOTTOM · WSW". The autopilot turns for it (AP pill `TO MUCKLE BOTTOM`); the HUD's
  gold diamond points at it with distance (`MUCKLE BOTTOM · 9.6 nm`), with an edge arrow when it is off screen.
  The player can hand-fly; the trip still works.
- About 4 km out from the home field, flying toward the destination, **magic clouds** roll in: fog thickens and a
  pastel cloud layer covers the land with "MAGIC CLOUDS · Muckle Bottom ahead" (the HUD stays on top). Behind it
  the sim freezes for the swap (0.7–1.3 s on a desktop), then the clouds part and you come out ~5.5 km from the
  destination on the line from home, same height (300–700 m AGL), speed and power, on an arrival route.
- The new tower takes over: C-Tower 2 is **Farmer Mudge** ("Muckle Bottom. Shut the gate behind you."), C-Tower 4 is
  Imogen's voice as Much Snoring. LAND, ATC, DEMAND IT (+ refuel), DEMAND TAKEOFF and scoring all work there.
- In a plane the farm cannot take: the map says TOO SHORT, FLY THERE / START HERE are refused with a quip, and the
  aircraft chips on the ground at the farm refuse the jumbo/herc/F-35 the same way.
- Story missions, the intro and online rooms always fly from C-Tower 1: starting one from elsewhere swaps home first.
- `?airport=farm|airbase|royal` starts the game at that airport (if the plane fits; otherwise C-Tower 1).

## The airports

| | C-Tower 1 Krayzee Royal | C-Tower 2 Muckle Bottom | C-Tower 4 RAF Much Snoring |
|---|---|---|---|
| file | data/airports/royal.js | data/airports/farm.js | data/airports/airbase.js |
| kingdom km | 0, 0 | −18, +6 (19 km WSW) | +24, −16 (29 km ENE) |
| runway | 09/27 1400×30 asphalt (+ closed 04/22) | 07/25 **620×18 grass** | 09/27 **2800×45 asphalt** |
| taxiways | A + A1–A4 | hedge track H + H1/H2 | A + A1–A4 (20 m) |
| stands | 8 | 4 (farmyard) | 8 (heavies take two) |
| tower | royal tower | water tank on stilts with a shed cab, "C-TOWER 2" | concrete block + glass cab, "C-TOWER 4" |
| terminal | royal terminal | red barn, "ARRIVALS & SILAGE" | ops block, "RAF MUCH SNORING" |
| props | (hand-built) | farmhouse, 2 silos, shed, hay bales, tractor, 5 hedges, 34 sheep, 15 cows, pond, 2 windsocks | hangar, 3 hardened shelters, 2 fuel tanks, radar dome, 2 sheds, 2 windsocks |
| planes | all six | C172, Tiger, Bathtub | all six |
| AI jets | 7 % (JETCORE) | none | 30 % |

Tower 3 is the Palace Lawn (D27, inside C-Tower 1's world): see **C-Tower 3 · The Palace Lawn** below.
Saltwhistle/Krumpet/KRZ are only map pins; when they are built they take the next free numbers.

**Runway rule** (data/airports/kingdom.js `canUse`): a type needs max(take-off roll × 1.1, landing roll × 1.5) of
usable runway (`performance` in data/aircraft.js): C172 319 m, Tiger 210, Bathtub 165, Herc 630, F-35 1050, Jumbo
1375 (C-Tower 1's 1400 m just fits it). The farm's 620 m takes the light planes and refuses the rest.

The autopilot lines up / DEMANDs a take-off only with `Autopilot._minRun()` of runway ahead: jets their roll × 1.1 (at
least 600 m), light types their roll × 1.4 (at least 150 m: C172 406, Tiger 224, Bathtub 210). tools/airport-check.mjs
checks this floor (+15 m line-up) for every airport. A STOVL jet at an airport with `vertical: true` is exempt (it goes up).

## Data schema additions (on top of docs/AIRPORTS.md §3.1)

- `towerName` (radio name), `towerVoice` (an existing tower voice) or `towerLines` (text lines for a new voice id).
- `scenery.biome` (`royal` = js/world/airport.js's hand-built world; anything else = js/world/site.js),
  `scenery.mown` (footprints of mown airfield grass, `{ center, size, heading }`), `scenery.pond` (`{ x, z, rx, rz }`).
- `windsocks: [[x, z], …]`.
- `props`: `{ kind, center, size, heading, h }` for `house shed silo bales tractor hangar shelter fueltank radar`,
  `{ kind: 'hedge', pts, h }`, `{ kind: 'flock', type: 'sheep'|'cow', center, size, heading, count }`.
  Footprints use the apron convention (heading 0 = size[0] along +X).
- `exitMin` (ATC's first usable exit from the landing threshold), already supported by js/atc/geometry.js.

farm.js is authored along +X like C-Tower 1 and turned 20° in the file (`P()`), so the layout is the proven topology.

## Code

| file | what |
|---|---|
| data/airports/kingdom.js | registry: KINGDOM, ORDER, SOON, blurbs, `runwayNeed`, `canUse` (+ quips), `offsetM` |
| data/airports/farm.js, airbase.js, farm-lines.js | the two airports; Farmer Mudge's lines (text, `tower_farm`) |
| js/world/site.js | builds any non-royal airport from its data: terrain (via terrain.js site terms), grass strip or asphalt + markings, buildings, hedges, instanced flocks, windsocks, trees, shade; same API as buildWorld + `dispose()` |
| js/world/dispose.js | frees a world: geometries, materials, textures (incl. render targets, onBeforeCompile uniforms), instanced/skinned meshes, lights, fog |
| js/world/airport.js | `buildWorld` dispatches on `scenery.biome`; C-Tower 1 gets `dispose()`; otherwise unchanged |
| js/world/terrain.js | scenery terms (flat rects, lake, castle, town, long road, airfield mask) behind `setTerrainSite()`; `null` = C-Tower 1's constants, byte-for-byte the old maths |
| js/world/trees.js | `dispose()` for the near-tree geometries and the bake-only geometry |
| js/world/pavement.js | `export` on runwaySurface / clipPolyline / dashed / holdLines (no behaviour change) |
| js/map/index.js | the map sheet + chip, destinations, the ferry leg, magic clouds, the swap, arrival placement, `bootAirport()`, test hooks (`window.__kingdom`) |
| js/core/wiring.js | ATC is re-bindable: `setWorld(world, def)` builds the new ATC + link, moves the game / tasks / radio listeners, flushes the old tower's queue, names the new tower (`setTower`) |
| js/game/finish.js | `DEFAULT_SPOT` follows the loaded airport; `onApron` uses layout's rotation-aware `inApron` |
| js/hud/prompts.js | "land on the taxiway" uses the airport's parallel taxiway (`PARALLEL`) instead of a literal 'A' |
| js/hud/msgcap.js | the open map sheet counts as a 'sheet' (other messages shed while it is open) |
| js/main.js | `// MAP` lines: import, `bootAirport`, `createKingdom`, `adoptWorld` (env, trees, FX, envMaps, Hard spot), the frame freeze, the marker target, aircraft-chip refusal, swap home before story/intro/online, reset on quit |

### The swap (js/map/index.js `doSwap`)
1. Clouds roll in for 2.4 s real (fog density × 14 + the cloud layer), then the sim freezes (`frame()` returns early).
2. Every attract AI is despawned (twice, 300 ms apart, to catch a spawn in flight); stand owners cleared.
3. `world.dispose()`; `layout.setAirport(id)` (routes and ATC geometry follow `onLayoutChange`); AI jet chance per airport.
4. `buildWorld` (yields between stages), main's `adoptWorld`, `wiring.setWorld` (new ATC/link/listeners/tower).
5. `attract.start()`; the player is placed (arrival or, for START HERE, main's `placePlayer` at the runway start).
6. Shader warm-up (`warmShaders()`: `renderer.compile()` plus our own per-material poll, capped 3 s, cancelled by the
   next swap; three's `compileAsync` poll could not be stopped and threw after a dispose), clouds part over 2.8 s.
   `ap.airportChanged()` runs right after `layout.setAirport` and drops LAND/DEMAND/hold state and the old ATC gate.

Same-world trips (royal ↔ palace) skip the clouds: FLY THERE flies straight at the destination and hands over at
1.5 km (mode `near`), with no teleport; the new tower's arrival route starts where the plane is.

The trip is "one airport at a time": airports live in kingdom km and a world is always built around its own field
at the origin. A future one-world build only has to add `map × 1000` as a world offset; nothing else assumes the swap.

## C-Tower 3 · The Palace Lawn (lane WORLD, C2 / D27, 2026-10-28)

**What it is.** A 240 × 24 m striped croquet lawn (08/26) at the foot of the castle hill, 2 km NNE of C-Tower 1, inside
C-Tower 1's world. Gravel walk G (96 m north, stubs G1/G2 at the thresholds, holds 48 m), a forecourt with three
stands P1–P3 and red carpets, the Orangery (terminal: glazed bays, pediment, gilded dome), the gilded folly
(C-Tower 3), a fountain, box parterres, topiary rows and a topiary peacock, yew walls, a ha-ha to the south, an avenue
up to the castle drive, flagpoles, croquet hoops on the margin, and **Mr Fennimore the butler** by the 08 threshold
waving a semaphore flag in each hand. Tower: `C-Tower 3 · Mr Fennimore` (text lines, `tower_butler`, subtitles until
VOICE voices them: data/airports/palace-lines.js, 73 lines in Farmer Mudge's shape).

**Who may use it** (`canUse`): Tiger (needs 210), Bathtub (165), and the **F-35 by vertical landing** (`vertical: true`:
a STOVL type is allowed whatever its roll). Refused with the butler's quip: C172 (319: "It would end its run in the
fountain"), Pitts (420), Herc, Jumbo. Cub and Throne fit by length.

**How it works.**
- data/airports/palace.js is an ordinary Kingdom airport (`world: 'royal'`, `scenery.biome: 'royal'`), so the map, the
  swap, `?airport=palace`, ATC (its own uncontrolled-style instance via `wiring.setWorld`), routes, LAND, DEMAND IT and
  DEMAND TAKEOFF all run on it unchanged. The lawn is drawn and surfaced by C-Tower 1's world, always: the lawn rolls as
  `runway` (rolled like a billiard table: runway friction), the walk is `taxiway`, the forecourt `apron`.
- **No rebuild between C-Tower 1 and the lawn.** `world.dispose()` of C-Tower 1's world parks it; the next
  `buildWorld` takes it back when the new airport shares it (palace ↔ royal) and frees it first otherwise (farm, air
  base), so test-map's memory gate is unchanged. A royal ↔ palace swap measures 0.65–1.2 s (despawn wait, ATC, attract,
  shader warm-up) instead of a world build.
- C-Tower 1's builders (pavement, lights, props, terminal, tower, geom, terrain) now read data/airports/royal.js
  directly instead of the live layout, so C-Tower 1's world is the same whichever airport is active (it used to be
  built from whatever `layout` held).
- AI at the lawn: js/world/aipool.js keeps the AI type pool main.js hands to attract in step with the airport
  (`def.aiTypes`, filtered by `canUse`; jets only where they fit). The lawn's pool is the Bathtub and the Cub (FLIGHTFIX4).
- `js/assist/landahead.js` (one `// WORLD (C2)` block): a runway shorter than LAND's standard aim + strip (480 m) is
  offered with its touchdown near the threshold (`aim` = length − landing roll × 1.25 − 10, ≥ 20 m) and a strip of
  roll × 1.25, on a virtual end. Without it LAND never picked the lawn (it chose a field). Royal/farm/air base runways
  take the old path (landahead tests 36/36).

**Known limits:** fixed by FLIGHTFIX4 (2026-10-30, docs/FLIGHT.md): short-field landing on runways < 500 m (aim
30 m in, 1.2 Vs0, no float, hard braking), STOVL DEMAND TAKEOFF falls back to a vertical take-off, same-world handover,
"(vertical landing)" card wording, `JET_CHANCE.palace = 0`. Still open: the Moth is kept out of the lawn's AI pool (in
the ATC soak it touched down ~140 m in and drew "uninvited landing").

**Gates:** airport-check palace rows (runway table, quips, floor, 70 props clear, holds/graph, 30-min Bathtub soak:
4 arrivals, 7 departures, 0 infractions) with `--break=lawn|lawnprop|lawnfloor`; `node tools/test-palace.mjs` (real
taps): Tiger map → START HERE or FLY THERE → butler on the radio → LAND on the lawn → DEMAND IT + refuel → DEMAND
TAKEOFF; F-35 `?airport=palace` → VERTICAL TAKEOFF → LAND HERE on the lawn → DEMAND IT → VERTICAL TAKEOFF; C172
refused with the quip. `--falsify=surface|refuse|tower` must go red.

## Gates

- `node tools/airport-check.mjs` (node, ~10 s): runway vs plane table (expected: royal + air base all six, farm the
  three light types), quips for refusals, the autopilot runway floor, prop/building/flock/tower/terminal overlap with
  runway strips (±25 m, +60 m ends), approaches (600 m × ±60 m, nothing over 3 m), taxiways (±10 m), aprons and stands,
  holds 50/45/60 m up a stub from each threshold, every stand to every hold and back, then a 30-min native AP + ATC
  soak at the farm (light types) and the air base (with jets). `--control` adds a C-Tower 1 soak; `--break=short|
  overlap|graph|approach` breaks the data on purpose (each goes red).
- `node tools/test-map.mjs` (headless Metal Chrome, real taps, 390×844 and 844×390): farm trip in the C172 (map →
  FLY THERE → clouds → emerged → C-Tower 2 on the radio → LAND → DEMAND IT + refuel → DEMAND TAKEOFF), jumbo refused
  at the farm then flown to the air base and landed, and six START HERE swaps on the ground with memory read with the
  AI sent home (boot → after 3 → after 6 must stay flat). `--falsify=noswap|nofuel|refuse|leak|cover` must go red.
  Screenshots + JSON in docs/shots/map/.
- `tools/map-view.html?swaps=3` builds royal → farm → airbase → royal three times in an empty page and lists
  renderer.info.memory after each build (window.__swap): world geometries/textures return exactly to the boot numbers.

## Follow-ups (not done here)

- **Farmer Mudge's voice**: his lines are text only (subtitles; the bank has no `tower_farm` clips). A BARKS run over
  data/airports/farm-lines.js (61 lines plus the 33 title/digit splices, ~95 clips at the usual ~13 s each)
  gives him a real voice; nothing else changes.
- The F-35 is refused at the farm by the length rule. Once STOVL lands, the farm could accept it if the arrival flew
  a vertical landing (needs the STOVL lane's AP).
- (done) Autopilot `_minRun()` is per type now (roll × 1.4, ≥ 150 m).
- Sheep don't scatter yet (`sheep_scatter` in AIRPORTS.md); no Grand Tour PP bonus for a trip; online rooms stay at
  C-Tower 1.
