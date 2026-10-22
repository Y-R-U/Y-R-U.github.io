# AIRPORTS — more than one airport in the Kingdom (lane DESIGN2, 2026-10-22)

Answer to Aaron's "there will be more airports to go to, right?" (D14). Yes. This is the plan: which airports, how the
game moves between them on a phone, the data schema, what code must change, and the build order. Docs only; nothing
here is built yet. Inputs: BRIEF, DECISIONS D7/D8/D14/D18/D19/D22, DESIGN §1–§5, AIRPORT.md, ATC.md, ONLINE.md, PERF.md,
`js/world/layout.js`, `data/story.js`, `data/barks/build_script.py`. **A0 and A1 are built: see §7 Status.**

**Recommendation in one line:** load **one airport world at a time**, pick it from an illustrated **Kingdom Map**, and add
optional **ferry flights** later that hide the swap behind a cloud bank. Never stream two airports on a phone.
First, a no-behaviour-change refactor that turns `layout.js` into data. Second, the cheapest new airport: the farm strip.

---

## 1. The airports

Tower numbers follow build order (D14: "C-Tower <n>", one per airport, spoken "See Tower N"). Once a number ships it
never changes. Kingdom-map positions are in km from C-Tower 1 (+x east, +z south, the same as the world frame).

| C-Tower | airport | map km | character | comedic hook (gameplay) |
|---|---|---|---|---|
| **1** | **Krayzee Royal Aerodrome** (exists) | 0, 0 | 09/27 1400 m + crosswind 04/22, royal terminal, village, castle, lake | the reference airport: crossings, queues, the full infraction table |
| **2** | **Muckle Bottom Farm Strip** | −18, +6 | grass 07/25 650×20 m between hedges; a farm lane (16/34, 480 m, *officially not a runway*) crosses it; barn terminal ("Arrivals & Silage"); tower = converted water tank on stilts | **sheep** graze on the strip and drift with the wind. Scatter a flock on a low pass = `sheep_scatter`. Landing on the lane = `lane_landing`. Hitting a sheep follows protection rules (Rubber: the sheep bounces too, woolly puff) |
| **3** | **The Palace Lawn** (a satellite inside the C-Tower 1 world) | +0.78, −2.3 | 240 m croquet-lawn strip 14/32 across Krayzee Castle's hill plateau; a fountain at one end and a **ha-ha with a 70 m drop** at the other; no taxiways, one "stand" at the palace steps | takeoff = roll off the edge of the hill and hope. Arrivals are **announced like guests** ("The Baroness Four-Two… and her undercarriage"). Topiary low pass, fountain splash, landing on the croquet hoops |
| **4** | **Saltwhistle Sands** | −30, +22 | beach runway 02/20, 1100×40 m of hard sand along the shoreline; short asphalt strip 11/29 (600 m) by the pier; beach-hut terminal, ice-cream van, sunbathers | **the tide**: over a 12-minute game-time cycle the sea eats the beach runway from 1100 m usable down to ~400 m, then floods it completely. The tower re-announces the "runway length available" as it shrinks. Seaplanes (`sea` class, D7 roster) land on the sea instead |
| **5** | **Mount Krumpet Altiport** | +25, −28 | 520×25 m asphalt shelf, **12 % slope**, one-way: land 03 uphill, depart 21 downhill; a cliff beyond the top end (no go-around past the commit point); monastery as terminal; a goat | `wrong_way` here means landing *downhill*: worth double, terrifying. Commit-point aborts. Tower is a monk with a **word allowance** |
| **6** | **Krayzee International (KRZ)** | +32, +10 | two parallel 2800×45 m runways 08L/26R + 08R/26L (400 m apart), a full taxiway grid, 12 GA stands + 6 gates, a glass mega-terminal | **Thriftaire**, the grumpy commercial operator: huge slow airliners that the tower protects like sacred cows; cutting in front of a 747 is worth a lot and its **wake turbulence** flips light planes. A commoner airline at a royal airport is the running joke |

### Controllers (new voices except at C-Tower 1)

| C-Tower | controller | voice id (new) | personality / delivery |
|---|---|---|---|
| 1 | Gerald, Imogen, Toby (story.js `CONTROLLERS`) | `tower_m` `tower_f` `tower_trainee` | unchanged |
| 2 | **Agnes Mudge**, farmer, controls between milkings | `tower_farm` | warm West Country, calls everyone "my duck", names every sheep; her tiers are about the *sheep*, not the rules ("You've upset Doreen.") |
| 3 | **Mr Fennimore**, the Royal Butler, on the battlements with a silver-tray radio | `tower_butler` | impeccably deferential; scolds by being *more* polite ("Might one suggest… not the fountain, Your Grace"). Tier 4 = he drops the tray |
| 4 | **Harbourmaster Morwenna "Mo" Pengelly**, megaphone, lifeguard chair | `tower_harbour` | nautical, gale-proof voice ("Ahoy, See Tower Four"); tide announcements; meltdown = she blows the whistle for a full second |
| 5 | **Brother Silas**, Order of Few Words | `tower_monk` | low and slow; the order allows **40 words a day**. HUD shows his word count; scolds cost words; at 0 he can only ring the bell (a bell clip replaces speech). Lines are 1–5 words long, which also keeps clips cheap |
| 6 | **Ms Prudence Vane**, ex-Thriftaire operations, now "Head of Stakeholder Airspace" | `tower_corp` | HR-speak ("I'm going to have to log that as a learning moment"). Plus an AI pilot voice for **Captain Clive Budge**, Thriftaire's chief pilot (`budge`, pilot bark set), who grumbles back at royals on the radio |

Imogen moving to KRZ in Season 2 is a story option. It reuses `tower_f` and saves a voice. See §4.

---

## 2. How the world scales (recommendation: one airport at a time + Kingdom Map; ferry flights later)

| option | phone cost | verdict |
|---|---|---|
| **A. Streamed kingdom** (one continuous 60×60 km map, terrain/trees/buildings paged in) | Phones are **CPU-bound already** (PERF: 16.6 ms/frame at 4× on low, target 11). A world build is 2.7–3.4 s of main-thread work at 4× even when sliced (`onProgress` stages); paging that while flying is guaranteed hitching. Fields/trees are world-space hashed, so in theory they extend, but the shade map (±4.6 km), the terrain grid, tree chunk LOD and the shadow box are all built around one origin. Float precision at 30 km is fine; the rest is a rewrite | **no** |
| **B. One airport per load, Kingdom Map jump** | identical to today: one world in memory (retained heap 45–49 MB), one build behind a loading card, dispose the old one first. Every airport must meet the same low-tier budget (≤ 80 calls, ≤ 160k tris) | **yes, do first** |
| **C. B + ferry flights** (fly out of A, "cloud seam", arrive at B) | same as B; the swap happens at ~8 km out, inside the haze (fog fades to haze colour at 9–13.8 km), behind a 2–3 s cloud-bank white-out with the map's route line animating | **yes, second** |

**Kingdom Map**: a 2D illustrated map (canvas or SVG, no 3D) showing six airports, routes between them, the castle and the
coast. Tap an airport → its card (controller, hook, best aircraft, your best PP there) → "Fly here" (map jump) or
"Ferry flight" (C). Locked airports show a padlock and the rank or story mission that unlocks them. It replaces nothing
in the current menu: Free Flight gains an airport chip that opens the map.

**Ferry flight (C), concretely**: depart A on `departureRoute(end, { outHeading: bearing to B })`. Time warp works as
normal (D18: AP-only, 1×/2×/5×). At 8 km from A (C172 at 5× ≈ 30 s real time) the screen fades to cloud and the route
line animates on a mini-map while `loadAirport(B)` runs. The plane then reappears 8 km out on B's arrival bearing at the
same altitude, speed and AP state, with B's welcome line. A ferry banks a small **"Grand Tour" PP bonus** (distance ×
`ppMult`) on landing at B. Never online (D18). Cost: the existing world build, plus one place-the-plane call.

**Phones**: B/C keep today's budgets exactly. Load time per airport is the same order as now (~1.3–2 s desktop, ~3 s at
4×). New per-airport content has to **replace**, not add to, the village/castle/lake budget; see each airport's biome in §3.
Voice packs load per airport (≈ 1.6 MB per tower voice).

---

## 3. Data-driven layout schema

### 3.1 One file per airport: `data/airports/<id>.js`

```js
export default {
  id: 'farm', n: 2, name: 'Muckle Bottom Farm Strip', short: 'Muckle Bottom',
  map: [-18, 6],                       // kingdom km, for the map + ferry bearings
  elev: 40,                            // display only: HUD altitude = y + elev (the world stays y = 0 at the field)
  controllers: ['agnes'],              // story.js CONTROLLERS ids; first = default shift
  wind: { from: 250, kt: 8 },          // default; Free Flight "let the wind decide" picks the active end from it
  patternAlt: 250,
  runways: [
    { id: '07/25', ends: ['07', '25'], center: [0, 0, 0], heading: 70, length: 650, width: 20,
      surface: 'grass',                // asphalt | grass | sand | lawn  → surfaceAt, pavement look, rolling drag
      departures: true,                // false = arrivals only (today's 04/22 rule)
      oneWay: null,                    // e.g. { land: '03', depart: '21' } (altiport)
      slope: null,                     // e.g. { pct: 12, upEnd: '21' } (altiport): runway end heights
      closed: false,                   // closed unless a mission/decree opens it (closed_runway)
      tide: null,                      // e.g. { periodS: 720, minLen: 400, fromEnd: '20' } (beach)
      markings: 'none' },              // icao | grass_cones | none
    { id: '16/34', ends: ['16', '34'], center: [120, 0, 30], heading: 160, length: 480, width: 6,
      surface: 'asphalt', closed: true, markings: 'none', fake: 'lane' }, // the farm lane: lane_landing, not a runway to ATC
  ],
  taxiwayWidth: 10,
  taxiways: [{ id: 'A', points: [[-300, -60], [300, -60]], surface: 'grass' }, /* stubs … */],
  holdOffset: 35,                      // HOLD_OFFSET per airport (narrow strips want less than 50)
  holds: [],                           // optional manual overrides; default = computed from the taxi graph
  aprons: [{ rect: [[-90, -140], [60, -90]] }],                // AABBs or quads in local XZ
  stands: [{ id: 'S1', position: [-60, 0, -110], heading: 160 }, /* … */],
  inbound: { via: 'A3', lane: [[40, -70], [-80, -70]] },       // optional one-way inbound lane (today derived from 'A3')
  circuits: { '07': { side: 'R', upwindExt: 500, downwindOff: 800, finalLen: 1200 }, '25': { side: 'L' } },
  terminal: { kind: 'barn', center: [-20, 0, -170], size: [60, 20], height: 9, heading: 160 },
  tower: { kind: 'watertank', position: [80, 0, -150], height: 18 },
  finish: { designated: [-60, -110], radiusEasy: 300 },        // D19 areas; medium/hard derive from runways/aprons/stands
  flat: [{ rect: [[-500, -300], [500, 200]] }],               // terrain must be dead flat here (+ approach corridors from runways)
  scenery: { biome: 'farm', seed: 0x51a3, village: null, castle: null, lake: null, sea: null, peaks: null },
  hazards: [{ type: 'sheep', area: [[-250, -15], [250, 15]], count: 24, drift: 'wind' }],
  infractions: ['sheep_scatter', 'lane_landing'],             // extras active here (rules.js entries)
  satellites: [],                                              // other fields inside THIS world (Palace Lawn in airport 1)
};
```

Airport 1 becomes `data/airports/royal.js`: exactly today's `layout.js` values (09/27 + 04/22 closed and arrivals-only,
A + A1–A4, APRON, TERMINAL, TOWER, 8 STANDS, PATTERN_ALT 300, HOLD_OFFSET 50, CIRCUIT) plus `scenery` naming today's
village, castle and lake positions (TOWN, CASTLE and LAKE now live as constants in `terrain.js`), and
`satellites: [palaceLawn]` once C-Tower 3 exists.

A **satellite** is an airport def in the same world, with its own ATC instance and tower, and an `atc: 'uncontrolled'`
flag: no sequencing, only detectors, welcome/land/scold lines, and its own outrage meter. Radio hands over by zone: inside
1.5 km of the lawn (and below 300 m AGL) the active tower is C-Tower 3, otherwise C-Tower 1, with "contact See Tower Three".

### 3.2 `layout.js` becomes a facade (zero diff for airport 1)

`layout.js` keeps every current export name, but as `export let`, plus `useAirport(def)` and `LAYOUT_REV`.
`useAirport(def)` reassigns all of them from the def and bumps `LAYOUT_REV`. ES live bindings mean that
`import { RUNWAYS }` keeps working. Code that **snapshots at import time** does not, and has to change (list below).
Default = `royal.js`, so with no call the game is byte-identical to today.

For multi-instance cases (Palace Lawn has two ATCs in one world), the real API is `makeGeometry(def)` returning an
object. `createATC({ geo })` and `buildRoutes(geo)` take it explicitly, and the facade is just `makeGeometry(currentDef)`.

### 3.3 What has to change, by file (found by reading the code)

| file | today (airport-1 assumptions) | change |
|---|---|---|
| `js/atc/geometry.js` | `const { RUNWAYS,… } = L` snapshot; `TWA = 'A'` assumed to be **the** parallel and to run along +X (`twaZ`, direction `[1,0]`); `MAIN = RUNWAYS[0]` is the only departure runway; `CONNECTORS` hold = `MAIN.center[2] − HOLD` (assumes an E–W runway with the terminal to the north); `exitFor` for 04/22 hard-wires "east via A"; `G.APRON_LANE_Z`, `apronX`; `INTERSECTIONS`/`TAXI_CROSSINGS` computed at import | `makeGeometry(def)`. Derive holds, connectors, crossings and exits from **the same taxi graph `routes.js` already builds** (it computes hold nodes generically from thresholds). Taxiway crossings of runways = graph edges that enter a runway rect. Departure-capable = `runway.departures`. Exits = graph nodes on the runway ≥ `EXIT_MIN` from the threshold. Circuit G-values come from `def.circuits[end]` |
| `js/atc/index.js` | imports `TOWER, TERMINAL, STANDS`; one intersection mutex logic tuned for 09/27×04/22; "04/22 arrivals-only" | take `geo`; mutex per entry of `INTERSECTIONS` (already a list); `departures:false` replaces the 04/22 special case; `oneWay` filters the ends allowed for each operation; tide → `setRunwayLength(id, usable)` (thresholds move, `closed` when < min); new detectors (`sheep_scatter`, `lane_landing`, `downhill_landing`, `beach_buzz`, `wake_upset`) as optional per-airport extras |
| `js/flight/routes.js` | `APRON_LANE_Z` const at import; inbound lane "fed from A3 northbound" via an x-heuristic; `END_CACHE`, `GRAPH` caches never invalidated; default `endId = '09'` | rebuild caches when `LAYOUT_REV` changes; inbound lane from `def.inbound` (fall back to today's heuristic); defaults from `def` |
| `js/flight/autopilot.js` | `demandTakeoff({ ends: ['09','27'] })`; flat ground | ends = departure-capable ends of the current airport; slope: touchdown/rollout use `groundHeightAt` (uphill landing flares earlier, downhill rollout needs brakes) |
| `js/flight/attract.js`, `js/story/host.js` | `activeEnd = '09'` / `'27'` fallbacks; tower camera shots | read `atc.activeRunway()`; camera shots from `def.tower` / `def.terminal` |
| `js/world/terrain.js` | `LAKE`, `CASTLE`, `TOWN`, `AIRFIELD_FLAT` constants; `RWV` map at import; the strip shader inlines runways and **`RUNWAYS[1]` as "r22"** | build from `def.flat`, `def.scenery`, `def.runways` (any count); sea/coastline and peaks as new terrain terms; sloped runway = a planar term over the runway rect |
| `js/world/pavement.js`, `geom.js`, `lights.js`, `props.js`, `terminal.js`, `tower.js` | `Y_PAVE` flat; ICAO markings only; one terminal and one tower design; `ROADS`/`APRON_RECT`/`CAR_PARK` constants | pavement drapes on `groundHeightAt` when sloped; `surface`/`markings` pick materials (grass strips = mown band + cones, sand = no paint); `terminal.kind` / `tower.kind` select a builder (royal, barn, watertank, beachhut, lifeguard, monastery, mega). Each kind gets its own budget line in AIRPORT.md |
| `js/world/airport.js` | `buildWorld(scene, renderer, opts)` builds airport 1 | `buildWorld(…, { airport: def })`, plus `world.dispose()` (geometries, materials, textures, impostor atlas, shade map), which is mandatory for B/C |
| `js/game/finish.js`, `js/hud/prompts.js`, `js/core/wiring.js`, `js/flight/traffic.js`, `js/story/intro.js` | import `RUNWAYS/APRON/STANDS/TAXIWAYS/TOWER` directly | read the facade (live bindings are enough), plus `def.finish` for D19 |
| `data/modes.js` | `HOST_OPTIONS.runway = ['wind','27','09','04','22']`; Decree `crosswind_open` names 04/22 | runway list = `['wind', …ends of the room's airport]`; decree becomes "secondary runway open" |
| `data/rules.js` | `intersection_dash`, `closed_runway` text mention 09/27 × 04/22 | generic wording; new extras added with `airports: [...]` |
| tower bark text | `taxi` lines say "Alpha One" / "via Alpha"; `rwy_27` etc. splice clips | each new controller writes their own taxi lines (the farm says "along the hedge"); runway-suffix clips per airport's ends (§5) |
| `tools/airport.html`, `tools/atc-sim.mjs`, `tools/score-sim.mjs`, `tools/perf.mjs`, `js/assist/test/fakeworld.mjs` | single layout | `?airport=<id>` / `--airport=<id>`; atc-sim copies `data/airports/` in `--falsify` |

**Regression gate for the refactor (must hold before any new airport):** with `royal.js`, atc-sim 97/97 + `--falsify`
26/26, flight-sim, score-sim, assist tests, and perf `calls`/tris identical to the last reference run. **Falsify the
generalisation** with a synthetic `royal_rot37.js`: today's airport rotated 37° and moved (+5 km, −3 km). It must pass
the 30-min attract soak with zero AI infractions. If any leftover axis assumption survives, that soak catches it.

---

## 4. Story and online use

**Story.** Season 1, "The Peerage" (DESIGN §3.2, 13 missions), stays at C-Tower 1 unchanged. `MISSIONS[i].airport`
defaults to `'royal'`, so there is zero rework. One optional touch: mission 13 ends with the coronation flypast landing on the
Palace Lawn. **Season 2, "The Grand Tour"** (D8 weapons can be a later Season 3) takes the Pomfrey-Smythe rivalry around the
kingdom. Each airport unlocks on the Kingdom Map when you finish its first mission. Two missions per new airport, sketched:

| airport | missions (objective in the existing `objectives` vocabulary, plus new types) |
|---|---|
| 2 Farm | *Mind the Flock*: land with the sheep on the strip, `no_contact` + `sheep_scatter`×1 · *Harvest Festival*: land on the farm lane during the tractor parade (`lane_landing`, `pp`) |
| 3 Palace Lawn | *An Invitation*: ferry from C-Tower 1, land on the lawn, stop at the palace steps (`land_at` designated, D19 Hard) · *Croquet Is Cancelled*: three landings on the lawn in 6 min while Rupert does the same (`beat_rival_pp`) |
| 4 Saltwhistle | *Beat the Tide*: land before usable length < 500 m, then take off before it floods (`land_before`, `airborne_before`) · *The Seaside Special*: Beaver on the sea (`water_landing`), beach buzz |
| 5 Krumpet | *Uphill Struggle*: land uphill and stop by the monastery (`land_manual`, `no_contact`) · *A Vow Broken*: make Brother Silas spend all 40 words (`outrage_tier` 4 equivalent) without scandal |
| 6 KRZ | *Cattle Class*: cut in front of three Thriftaire airliners (`cut_in_victim` ×3) · *The State Visit*: the season finale. Land the Bathtub between two 747s, Captain Budge furious, Imogen guest-controlling |

New objective types: `land_at`, `land_before`/`airborne_before` (game-clock), `water_landing`, `ferry` (arrive at B).
`missions.js` already takes plain step data (STORY.md), so this is data plus a few predicates.

**Free Flight**: an airport chip opens the map. D22 continuity stores `{ airport, pos }`, so you resume at the airport where
you stopped. Unlock: farm and lawn from the start (or after mission 1), the others by Season 2 progress or by rank (Saltwhistle Earl,
Krumpet Marquess, KRZ Duke). That gives ranks another concrete unlock.

**Online** (ONLINE.md is unchanged in architecture): a room has **one airport**. It is a host option, `airport`, plus `layoutRev`
(a hash of the def), so a client with a stale def is refused at join with "update the game". The room server only stores the
option. Default venue per room type (the host may change it unless fixed):

| room type | default airport | why |
|---|---|---|
| Court Session / Coronation / Open Court | C-Tower 1 | the full infraction table and crossings |
| Royal Rumble | Farm | rubber sheep chaos |
| Strict Tower | KRZ | airliners and wake: real stakes |
| Garden Party | Palace Lawn (in the C-Tower 1 world) | gentle, social |
| Joust | Palace Lawn, fixed | one short strip, two royals, best of five |

Later: a "Grand Tour" Court option that changes venue between rounds. Every client rebuilds (~3 s) and the host waits
for all `ready` before resuming. Each airport has its own outrage meter (DESIGN §1.3 is already "per tower").

---

## 5. Voice work per airport

The pipeline is unchanged (Qwen3-TTS design → saved clone voice → BARKS batch; ~13 s/clip on the local box, based on 816 clips in ~3 h).

| item | clips | notes |
|---|---|---|
| new controller voice: design prompt in `data/voices.json` + full tower set (17 routine intents + 10 scold groups × 4 tiers, as `tower_m`) | ~74 | lines written in the controller's voice (taxi wording per airport, no "Alpha" at the farm) |
| splice set for that voice: 23 titles + 10 digits | 33 | needed because tower lines say "Baroness Four-Two" (§5.4) |
| runway-suffix clips for that airport's ends (e.g. `rwy_07`, `rwy_25`) | 2–4 per controller | plus the same clips for existing voices if they guest there |
| welcome lines with `{TOWER}` | 2 per controller | **`build_script.py` change:** `AIRPORTS = [1]` currently generates `welcome_a<n>` for *every* tower voice × every airport. Make it `AIRPORTS = {1: ['tower_m','tower_f','tower_trainee'], 2: ['tower_farm'], …}` so only rostered controllers get welcomes (ids unchanged for airport 1) |
| hazard/airport pilot barks (optional): e.g. `sheep` ("Shoo!"), `tide`, `wake` | 1 × 15 pilot voices each | at most 2 new intents in total |
| Captain Budge (KRZ): pilot-style bark set | 33 | AI rival voice, like `toff`/`duchess` |
| Brother Silas | fewer: lines are 1–5 words; plus a bell clip | cheapest controller |

Per new controller: **~110 clips ≈ 25 min of generation, ≈ 1.6 MB**, loaded only at that airport. All five new airports
plus Budge come to ~600 clips, ~2.5 h of generation, ~9 MB on the server and ~1.6 MB per session. RADIO must load the
tower voice pack by `def.controllers` (today it assumes the three C-Tower 1 voices) and pick `welcome_a<n>`.

---

## 6. Phased build plan

Effort is in lane sessions (one focused agent run): S ≈ 0.5, M ≈ 1, L ≈ 2, XL ≈ 3+.

| # | phase | lanes | effort | done when |
|---|---|---|---|---|
| **A0** | `data/airports/royal.js` + `layout.js` facade + `useAirport` / `LAYOUT_REV`; `world.dispose()` | AIRPORT + TRAFFIC | M | regression gate in §3.3 green, perf counts identical |
| **A1** | generalise `atc/geometry.js` onto the taxi graph (`makeGeometry(def)`), routes caches, AP/attract/host defaults, modes runway list | ATC/TRAFFIC | L | the `royal_rot37` soak passes (zero AI infractions, ≤ 1 go-around / 15 min) |
| **A2** | `buildWorld({ airport })`: terrain flat zones + scenery from the def, surface/markings variants, terminal/tower `kind` registry | AIRPORT | M–L | royal unchanged; a bare test airport builds within the low budget |
| **A3** | Kingdom Map screen, `loadAirport(id)` (dispose → build behind the loading card), D22 continuity per airport, mission `airport` field, online `airport` + `layoutRev` option | UI + GAMEPLAY + NET | M | swap royal ↔ test airport 20× with flat retained heap (PERF `heap`) |
| **A4** | **C-Tower 2 Farm**: grass strip, lane, barn, water-tank tower, sheep (instanced, 1 call, wind drift, scatter), Agnes voice, 2 missions | AIRPORT + ATC + BARKS + STORY | M | low ≤ 80 calls / 160k; atc soak at the farm; Aaron plays it |
| A5 | **C-Tower 3 Palace Lawn** satellite: second ATC instance (`uncontrolled`), radio zone handoff, plateau widened to fit 240 m, ha-ha drop, butler | ATC + RADIO + AIRPORT + BARKS | M | both towers in one session; Joust room on the lawn |
| A6 | Ferry flights (§2 C), Grand Tour PP bonus | GAMEPLAY + STORY | M | royal → farm ferry with no visible pop and no frame over 50 ms after the cloud card |
| A7 | **C-Tower 4 Saltwhistle**: coastline/sea terrain term (reuse the lake's PBR water), sand runway, tide (`setRunwayLength`), beach huts, Mo | AIRPORT + ATC + BARKS | L | tide cycle soak: AI never lands on the flooded part |
| A8 | **C-Tower 5 Krumpet**: sloped runway (pavement drape, PAPI on a slope, AP uphill flare / downhill braking), one-way ops, peaks, word-allowance HUD, Silas | AIRPORT + TRAFFIC + ATC + HUD | L | AI completes 20 uphill landings without a crash; `downhill_landing` detected |
| A9 | **C-Tower 6 KRZ**: parallel runways, gate stands, mega-terminal, Thriftaire AI, wake, Prudence + Budge | everyone | XL, **blocked on D7 airliner models** (dash8/a320/jumbo are `planned`) | low budget held with 6 airliners on stands |

**Build first: A0 → A1 → A4.** A0 and A1 are pure refactors with a mechanical gate, and they pay off for every later
airport. The farm needs no new rendering technology (fields, hedges and grass already exist) and proves the whole chain
(def → world → ATC → voice → mission → online venue) cheaply. Then do A3/A5, so Aaron gets the map and a second tower
early. KRZ comes last because it depends on new plane models.

D8 (weapons later): `hazards[]` is a generic entity list (sheep today). Weapons-era targets and ranges can be added as hazard
types, and nothing here assumes they won't exist.

## 7. Status (lane AIRPORTS, 2026-10-22)

**A0 done.** `data/airports/royal.js` holds C-Tower 1. `js/world/layout.js` is a facade: same exports, now live `export let`
bindings, plus `AIRPORT`, `AIRPORT_DEFS`, `LAYOUT_REV`, `useAirport(def)`, `registerAirport(def)`, `setAirport(id)` and
`onLayoutChange(fn)`. `js/atc/geometry.js` (`makeGeometry(def)`) and `js/flight/routes.js` (`makeRoutes(def)`) rebuild on
a switch. Their module exports always mean the active airport. `world.dispose()` is **not** done. It moves to A2 with
`buildWorld({ airport })`.

Regression gate on the royal airport (final code, 2026-10-22 15:30):

| gate | before (reference) | after |
|---|---|---|
| `atc-sim` | 97/97 | 97/97 at A0/A1. After the test-flight ATC fix below: 96/98 (+1 `play start` check, which passes; the default `mixed types` seed now fails, see below) |
| `atc-sim --falsify` | 26/26 | 26/26 |
| `flight-sim` | 81/81 | 81/81 |
| `score-sim` | 143/143 | 143/143, byte-identical output |
| assist tests | 18/18 | 18/18 |
| `perf.mjs --quick` draw calls + tris by owner (static world, all 5 owner tables, 161 rows) | — | **identical** |
| boot `?start=free` in headless Chrome | — | no console errors, AP takeoff + circuit |

Per-moment totals in perf drift by ±1–3 calls / ±3k tris between any two runs, including two runs of the same build,
because AI traffic is in different places. The owner tables with `plane/*` and `fx-particles` rows removed are the
identity check.

**test-flight `override: AP still landed on the runway` (failed about 1 run in 4 once seedRivals was added). The cause
was in ATC, and it is fixed.** A node repro (`atc-sim --only=playstart`) reproduces the game's `?start=free` start: 4
attract AI of mixed types, the player lined up on 27, a seedRivals final at 3.6 km and one at the hold. In 10 of 16 starts
the player was sent round with `runwayOccupied`. There were three causes, and each was fixed in js/atc:
1. **Intersection-queue deadlock.** A departure was lined up behind a slow lander. The next arrival then joined the 09/27×04/22
   mutex queue while that departure was blocking it, and so took the head of the queue the departure needed to roll.
   Neither could move, and the arrival and the player behind it went around. Fix: a lander joins the queue only when
   nothing else stops its clearance.
2. **Line-up timing.** `lineUpWait` was given while a lander was still taxiing along the runway to a far exit. Fix: line
   up only if the next arrival will still be outside `arrivalBlockLinedUp` once the runway is projected free
   (`T.lineUpSlack`).
3. **Slow types occupy the runway longer.** Touchdown to clear measured 30 s for a C172, 72 s for a Tiger and 62 s for the
   bathtub, against 60 s threshold spacing. Fix: `T.spacingFullType` (Tiger 85 s, bathtub 75 s), with the strip `type`
   passed from bridge.js.

After the fixes, all 72 starts land on the first circuit with no go-around (seeds 1–48 at a 5 s menu, 1–24 at 20 s). The
check is falsified: against the pre-fix js/atc it fails 10/16. In the browser (`test-flight --only=override`, 8 runs after the fix), there were no go-arounds. 5 runs passed with touchdown at 382–387 s. **3 still failed** in a
different way: the player was number 3 or later behind the attract final, the seedRivals final and an arrival,
was extended to 4.1–4.8 km downwind, and was still on final when the test's 480 s `waitFor` ran out. That is
sequencing working as designed. The test's budget is too tight for the busier circuit, and test-flight.mjs is not
this lane's file. Options: raise the budget to about 720 s, or start the test with `?lite=1` / without seedRivals.
Cost: the default `mixed types` soak seed now holds one departure 366 s. During that hold, idle creep in
aircraft.js carries the plane to 45 m, and the run fails with `runway_steal` at 1262 s (bug (b) below). Across the seed
sweep, the hold times and infraction rates of that soak are the same before and after the fix (holdMax 330–440 s on
most seeds both ways).

**A1 done.** ATC and routes are layout-agnostic. They read no runway or taxiway names, and they do not assume a
`RUNWAYS[0]`-only departure runway or a terminal to the north. Holds, entries, crossings and exits come from the taxi
graph (docs/ATC.md). `data/airports/tests.js` has `royal_rot37` (rotated 37° → 13/31 + 08/26, taxiway K, stands G1–G8),
`royal_rot37m` (mirrored first) and `royal_rot0` (identity control). Run them with `node tools/atc-sim.mjs --airport=<id>`.
Flight soaks run natively at the test airport through `setAirport`.

Rotated soak results. There are 5 thirty-minute soaks per airport, and each was run on 4 seed sets (`--seedOffset=0..3`):
- **attract 6 (the A1 gate): `royal_rot37` has 0 infractions and 0 separation losses on all 4 seeds**, with ≤ 1
  go-around and no crashes. `royal_rot37m` and `royal_rot0` are also clean.
- Full circuits on both ends of the departure runway (`attract 4 + 2 circuits`, 31 active and 13 active): 8–10
  touch-and-goes per soak, and every end was flown. Runway change ×2: wrong-end landings 0 every time.
- Residual AI infractions across all 20 soaks: **rot37 3/20, identity 4/20**, the same rate. They also reproduce on
  the royal airport itself, e.g. `atc-sim --only=flight "--run=runway change" --seedOffset=2` → `runway_incursion` at
  1194 s. So they are C-Tower 1 behaviour, not leftover axis assumptions. Cause: AI hold-short precision. The hold node
  is 50 m from the centreline. ATC counts a plane as occupying the runway at 15 + 30 = 45 m. That leaves a 5 m buffer,
  and the autopilot uses it up in two ways: (a) when a runway change re-routes a holding plane, its U-turn at the hold
  swings about 5 m forward; (b) a plane holding under full brake at idle creeps forward: 1.3 m (C172), 1.9 m (Tiger) and 3.0 m (bathtub)
  per 150 s in aircraft.js on flat ground. The fix belongs in autopilot.js: brake to zero at the hold and turn away without moving forward. Or move the
  stop point a few metres behind the painted line. The `steady flow` check and the kinematic `circuits 09` check fail on
  the identity control too. Their thresholds are tuned for 27-active royal traffic.

**Hard-coding left (outside A0/A1 scope):**
- `js/flight/autopilot.js:392`: `demandTakeoff({ ends = ['09','27'] })`.
- `js/flight/attract.js:26`: `activeEnd = () => '09'`. `js/core/wiring.js:40,151`: `'09'` fallback.
  `js/story/host.js:19`: `'27'` fallback. `js/radio/index.js:128-129`: `'27'` fallback. All of these should read the
  def's first departure end.
- `data/modes.js:28`: `HOST_OPTIONS.runway = ['wind','27','09','04','22']`.
- `js/hud/prompts.js:111` and `js/world/pavement.js:132,208` / `props.js:37`: taxiway id `'A'` as *the* parallel.
- `js/world/textures.js:296,321-323`: sign and number textures for 09/27/04/22 and A–A4 only.
- `js/world/terrain.js:119,240`: mown-strip mask uses `RUNWAYS[0]`, and LAKE/CASTLE/TOWN constants (A2: from
  `def.scenery`).
- `js/game/finish.js:17`: `onApron` assumes an axis-aligned apron (ignores `heading`). `js/main.js:14`: `const { STANDS }`
  snapshot at import.
- `js/assist/test/landahead.test.mjs`: royal-only expectations. That is fine for a test.

**Notes for GAMEPLAY (`setAirport`):**
- Call `setAirport(id)` **before** `buildWorld` and before creating ATC, traffic and autopilots. ATC/geometry and routes
  follow at once (`onLayoutChange`). Anything already built (world meshes, an ATC instance's runway state, AP routes in
  flight) does not migrate. Rebuild them, or for a second tower in one world use `createATC({ geo: makeGeometry(def) })`.
- Any def must be registered first: `registerAirport(def)`. Only `royal` is registered by default. The test airports are
  in `data/airports/tests.js` and are not for players.
- Default runway ends come from the def (`runways[].departures`, `closed`, `oneWay`, `wind`). Use
  `atc.activeRunway().end` and never a literal `'09'`/`'27'`. That fixes the list above.
- `setAirport` with the current id is a no-op. `LAYOUT_REV` increments on every real switch, so cache code can key on it.

## Questions for Aaron
1. Is **one airport per load + Kingdom Map** OK, with ferry flights as the "fly there" option? (A seamless streamed kingdom
   would cost phone frame rate.)
2. Which new airport first? Recommended: the **farm strip with sheep** (cheapest). Are the six airports and their controllers right?
3. Should the Palace Lawn be inside the C-Tower 1 world, so you can see the castle and land there without loading? It costs
   a second tower running at once.
