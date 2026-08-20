# A8 — Whitewall

Whitewall only. Longacre and Blackstone are untouched and still seeded; the point of doing one
town first is that the approach can be judged before two more are built the same way.

Everything below was measured, not estimated. Every number came out of `node tools/shot.mjs`,
`node tools/budget.mjs --traverse` or `node --test` on this tree.

---

## 1. What was built, file by file

| file | what it now owns |
|---|---|
| **`js/editor/whitewall.js`** *(new, ~300 lines)* | The town. Plot table, wall circuit, streets, rooms, terraces, the reach. Pure — **no `three` import** — so `node --test` can walk the entire town as data. |
| **`js/editor/whitewall.test.js`** *(new, 14 tests)* | Whitewall against `data/areas.json`, `data/props.json`, `data/cast_at.json`, `data/gather.json` and `data/quests/*.json`, all read off disk. No coordinate is duplicated into the test. |
| `js/editor/demoScene.js` | Routes the light district to `whitewall()`; Longacre and Blackstone keep `layout()`. `bridgeFor()` lifted out because both paths need it. Applies the swept-ground mask. |
| `js/world/demo.js` | Nine `?dev=1` scenario framings, one per named place. They are **not** in `SHOTS`, so they create no keep-outs and cannot move the five the critic scores. |

Nothing else changed. `js/world/zones.js` untouched, `js/editor/scene.js` untouched, no new object
types, no editor UI, no new dependency, no build step.

### The town

139 objects: 29 `wallRun`, 13 `tower`, 50 `retaining`, 24 `mass`, 11 `house`, 7 `arcade`, 4 `pen`,
1 `cross`. Every one is the shared kit; the only thing that makes it Whitewall is `zones.light`.

- **Precinct wall** — the rectangle the four gates in `areas.json` define: x −632…−408, z −142…+32,
  h 12, t 3.6. 29 runs, four corner towers (r 5, octagonal), eight gate towers (r 4.4, 12-sided).
- **Sanctum Yard** — 60 × 50 m left empty. The **Lantern Spire** (`tower` r 9 h 58, WORLD.md's
  numbers) at its centre; the **Yard post** as a `cross`; market arcades down both long sides.
- **The Sanctum range** — Sanctum (34 × 26, walls 14 m, one 7 m doorway onto the Yard, an inner
  arcade, a chapter house behind), the **granary**, the **temple kitchen**. These three are one
  continuous 74 m block, which is *why* the paved avenue turns east at the Yard instead of running
  through to the south gate: there is no 3 m gap between the Sanctum and its kitchen to put a
  street in.
- **Cloister** — garth, arcades north and south, apprentice hall on the west, open at the
  north-east corner (14 m of the north wall and 18 m of the east). **That opening is deliberate**: `wall_day`'s camera stands at (−568, −122),
  which is inside the Cloister, and any wall centred within its 13 m keep-out would have been
  silently deleted by `nearCamera` and left a hole. The hole is the gateway.
- **Almonry** — the Store, two south doorways because `wwa.almonry.door` and `wwa.almonry.lock`
  are two props on that wall, an inner arcade on the east, Ivo's room off the east end.
- **Gate cells** — inside the north gate, west of the road. No north wall of their own: the
  precinct wall is it.
- **Works yard** — low walls, mason's lodge, a `pen` of dressed stone, Pell's house, open east.
- **Terraces** — three streets of frontages: north avenue (gate → Yard), east avenue (Yard →
  east gate), south quarter.
- **The reach** — quay and net lofts at the fish steps, a revetment and a drying `pen` at
  `stand.chalk`, `stand.low` and `stand.east`.
- **Road** — one polyline, north gate → Yard → east gate, `roadWidth` 9 to match the King's Road's
  own half-width so the two read as one road through the gate.
- **Swept ground** — the square and every room floor are pushed into the terrain's scatter mask so
  grass does not grow there. A 60 × 50 m lawn in the middle of a limestone town was the loudest
  wrong note in the first render.

### Area-by-area coverage

Working list derived by grepping `area` / `in` / `at` / `to` / `from` out of all 99 quest packs,
`props.json`, `cast_at.json`, `gather.json` and `escorts.json`, then filtering to `town: "light"`.

| area | built as | what stands in it |
|---|---|---|
| `wwa.northgate` | gap in the north wall + two gate towers, the road through it | Kesta |
| `wwa.southgate` | gap + two towers | — |
| `wwa.eastgate` | gap + two towers, where the King's Road ends | — |
| `wwa.westgate` | gap + two towers | — |
| `wwa.market` | 60 × 50 open square, arcades both sides, swept | Wick, the stall, kerb, lamp, board |
| `wwa.spire` | `tower` r 9 h 58, pinned to full LOD | — |
| `wwa.board` | `cross`, 3 steps | — |
| `wwa.temple` | 34 × 26 room, walls 14 m, north doorway, inner arcade, chapter house | Alder, font, hand table |
| `wwa.kitchen` | 18 × 18 room, north doorway, bakehouse behind | Marrin, the hearth node |
| `wwa.granary` | 18 × 20 room, south doorway, inner arcade, tithe store west | Bel, the lamp, 8 rats |
| `wwa.cloister` | garth, two arcades, apprentice hall | — (nothing placed here) |
| `wwa.almonry` | 38 × 30 room, two south doorways, inner arcade, Ivo's room | Ivo, shelf, tally, ledger, door, lock |
| `wwa.cells` | 18 × 18 room off the precinct wall | the hinge |
| `wwa.works` | walled yard, lodge, stone pen, Pell's house | Pell, the hurdle panel |
| `wwa.fishsteps` | quay revetment, two net lofts, fisherman's house | Rell, the fishing spot |
| `stand.chalk` | revetment + drying pen | the gauge post, a fishing spot |
| `stand.low` | revetment + drying pen | a fishing spot |
| `stand.east` | revetment + drying pen | the barrel, a fishing spot |
| `reach.light`, `reach.east`, `wwa` | regions, not plots — covered through their children | the forage patch is open bank by design |

`node --test js/editor/whitewall.test.js` asserts this table's first column against
`data/areas.json` and its last against the three placement files. Nothing here is hand-maintained.

---

## 2. The decision that shaped everything: the rooms are open to the sky

**The named rooms are walled at ground level and have no roof.** This is the one call I most
expect to be argued with, so here is the whole reasoning.

`data/props.json`, `data/cast_at.json` and `data/gather.json` stand **ten props, five named bodies
and the kitchen hearth at world coordinates inside those rects** — the font at (−520, −24.2) is 5 m inside the
Sanctum, Bel stands in the granary doorway at (−547, −14.8), the Almonry's shelf, tally and ledger
are all inside its 38 × 30 m plot, and Marrin and the kitchen fire are dead centre of the kitchen.
`js/game/session.js` `beginCampaign()` puts the player on **the granary's area centre**, and the
spawner scatters `light.01`'s eight rats over the granary rect.

If those rooms were roofed `house` objects, then:

1. The player would spawn inside a solid collider box on a new game.
2. `doors.js` `setHidden(true)` hides `people.object3D` while you are in a generated interior, so
   Alder, Bel, Marrin and Ivo would **vanish the moment you walked in** — four `talk` objectives
   dark.
3. The props are seated on `groundAt`, and `interior.js`'s floor is `plinth + 0.05` above the
   house's seat, so every one of them would stand ~0.7 m sunk into the room's floorboards.
4. The rats walk on outdoor ground and would do the same.

Fixing that means changing `interior.js`, `doors.js`, `props.js` and `people.js` so an interior can
host world-placed content — a whole wave on its own, and not this one. The open-topped room keeps
every system exactly as the last three waves left it, and it is not a fudge: the third-person arm
is 7.73 m of set-back (WORLD.md §2.7), so a room you can see into from above is the readable form.
The Sanctum is *the tapped outcrop*, which wants sky over it anyway.

**Interiors are still real and still exercised.** Whitewall has 11 `house` objects with working
`doors.js` doors and generated `interior.js` rooms — apprentice hall, Pell's house, Ivo's room, the
chapter house, six terrace houses, the fisherman's house. All 11 were entered live via
`doors.jump()` and walked in four directions; every one produced a room 3.97–4.50 m high with a
loft, and `floorLocal` returned a finite height at every sample (§5, case 12).

---

## 3. How the gate was kept

Profile throughout: `--preset=medium --dpr=1 --w=844 --h=390`, `shadowRate` forced to *every
frame*, so the shadow pass is the worst case rather than whatever frame the capture landed on.

### The five scored scenarios

| scenario | main tris before → after | main calls | total tris before → after | total calls |
|---|---|---|---|---|
| `wall_day` | 154,176 → **140,982** (−8.6 %) | 79 → **122** | 240,752 → **234,148** | 107 → **184** |
| `street_dusk` | 110,285 → **110,339** (+0.0 %) | 64 → **64** | 166,277 → **166,477** | 93 → **93** |
| `gate_night` | 101,586 → **102,355** (+0.8 %) | 48 → **48** | 168,260 → **169,201** | 79 → **79** |
| `town_night` | 120,331 → **122,834** (+2.1 %) | 79 → **81** | 176,297 → **178,574** | 109 → **111** |
| `creek_day` | 96,420 → **98,294** (+1.9 %) | 82 → **83** | 128,212 → **130,360** | 112 → **113** |

The three Longacre/Blackstone framings move by 0.0–2.1 %, which is the foliage re-roll: `scatter`
walks `terrain.footprints` with one RNG stream, so changing the light district's footprint count
re-rolls every clump in the valley. `creek_day` differs 6.7 % against itself, so all three of these
are inside noise.

`wall_day` is the only one whose subject changed. See §4.

### The new places

| framing | main tris | main calls | total tris |
|---|---|---|---|
| `wwa_air` | 94k | 128 | 117k |
| `wwa_yard` | 166k | 118 | 310k |
| `wwa_gate` | 159k | 125 | 249k |
| `wwa_sanctum` | 151k | 82 | 297k |
| `wwa_granary` | 140k | 98 | 265k |
| `wwa_cloister` | 117k | 54 | 246k |
| `wwa_almonry` | 114k | 59 | 207k |
| `wwa_works` | 131k | 64 | 287k |
| `wwa_steps` | 87k | 70 | 174k |

### The traverse — the number that actually matters

`node tools/budget.mjs --traverse --step=25` walks every registered road at 25 m and three yaws —
A7's own step, so the two rows below are comparable. 348 samples against A7's 333: Whitewall's
paved street is a new path. It records the worst frame, not the mean. `docs/TRAVERSE_A8.json`.

| | A7 | **A8** | gate |
|---|---|---|---|
| worst total | 224.5k at (−520, −142) | **320.0k** at (−512, −71) | 350k |
| worst split | 142.6k main + 81.9k shadow | **180.4k main + 139.6k shadow** | |
| worst calls | 100 (76 main) | **189 (122 main)** | 150 |
| p50 / p95 tris | 55.4k / 171.9k | **74.1k / 254.2k** | |
| samples over the gate | 0 of 333 | **0 of 348** | |

**Triangles pass, with 8 % of margin at the worst frame.** That is thinner than A7's 36 %, and A8's
own note in WORLD.md §6.7 predicted exactly this ("the detail blocks will grow at A8").

**Draw calls fail: 189 against WORLD.md §6.7's 150.** I could not close this inside the wave's
constraints and I am not going to pretend otherwise — see §6.

### What bought the triangle margin

The first complete layout measured **467.8k at the worst sample, 22 of 426 over the gate** (at the
20 m step). One change fixed it, and it is the trick `demoScene.js` already used:

**Each terrace row gets exactly one full `house`; every other dwelling in it is a `mass`.** A
`mass` is `plainHouse` — a gabled block with a roof, a ridge, windows that light up at night and a
chimney. `tools/budget.mjs` measures the valley's masses at a **190-triangle mean against a
house's 6,500**, because a mass has no extruded openings, no quoins, no dormer, no lean-to and no
projecting bay. Along a street you cannot tell from more than about 15 m. Whitewall
went 21 houses / 14 masses → **11 houses / 24 masses**, and the worst frame went

> **467.8k → 325.9k, and 22 samples over the gate → 0.** (Both at the 20 m step, so like for
> like; the 25 m table above is the run that matches A7.)

Everything else was chosen cheap from the start rather than optimised later:

- **`retaining`, not `wallRun`, for every room.** Measured: **57 triangles a run**, against a
  curtain wall's **62 a metre** (`tools/budget.mjs`: a 60 m `wallRun` is 3.7k). A curtain is also
  a crenellated parapet with corbel tables and merlons, which a granary has no business having.
  49 of the town's 139 objects are `retaining` and together they cost under 3k.
- **The 60 m block LOD does the rest.** The 796 m circuit is 29 runs, but past 70 m each one is a
  taper-box and a coping box — 24 triangles. From anywhere in the town most of the wall is already
  a stub.
- **One exception, deliberately: the Lantern Spire is pinned `lod: 'full'`.** At 82 m in `wwa_gate`
  the proxy cylinder read as a grain silo, and this is the town's only wayfinding landmark. It is
  the single object in the world with a hand-set LOD.

### The BLK experiment, measured and rejected

The 189 calls are 20 populated 60 m blocks × ~3.5 merged meshes each (20 `wall`, 20 `trim`, 16
`roof`, 13 `glass` at the north gate, read off the scene graph). Whitewall's footprint *is* 20
blocks. So I tried `BLK` 60 → 90 in `scene.js` and re-ran the whole traverse:

| | BLK 60 (shipped) | BLK 90 |
|---|---|---|
| worst calls | 189 (122 main) | **151 (104 main)** |
| p95 calls | 154 | **123** |
| samples over the 350k gate | **0 of 426** | 3 of 426 |   *(both at the 20 m step)*
| p95 tris | 256.4k | 294.5k |

It buys 38 calls and costs the triangle gate. **Triangles are the gate and always were**
(WORLD.md §6.5), so `BLK` stays at 60 and the change is reverted. Recorded here because it is the
obvious next thing anyone will try.

---

## 4. `wall_day` changed subject, and Aaron should decide about it

The placeholder wall stood at z = −94. Whitewall's real north wall is at z = **−142**, because
that is where `wwa.northgate` is in `areas.json`. `wall_day`'s camera is at (−568, −122) — which is
now **20 m inside the town, in the Cloister's north-east gateway**, looking east-south-east across
the north avenue toward the Lantern Spire.

So the shot that was "wall + tower, midday" is now "a Whitewall street, midday": the Cloister's
north wall in the near ground, the north-west gate tower at the left edge, two terrace houses
across the avenue, the Spire's shaft on the right, the Almonry and the east wall beyond.

I did **not** move the camera. `SHOTS` is the critic's contract and its `keep` radii are the
generator's keep-outs; moving one silently re-scores a plate and moves the layout. Two things I did
do:

- Designed the Cloister so its open corner *is* where the camera stands, rather than letting
  `nearCamera` delete a wall run and leave a gap nobody authored. Verified live: **0 of the authored
  objects are dropped by any keep-out** — `whitewall()` returns 139 and
  `__forge.demo.builder.doc.objects.filter(o => o.dist === 0).length` is 139.
- Dropped the back-blocks from the north avenue's west terrace, which were 23 m from the lens and
  filling the frame, so the shot now reads two separate houses with a street gap between them.

**If the plate still wants a wall, the honest fix is a new framing rather than a moved town** — the
north gate at (−520, −178) is `wwa_gate`, and it is the best render in the set.

---

## 5. Tests, and the revert check for each one

Baseline 494 passing / 0 failing → **508 passing / 0 failing**. `lintQuests` 0 errors and the one
pre-existing `light.06` warning. `lintText` clean.

Every test below was checked by reverting the behaviour it defends and confirming it goes red. The
mutation is stated so the check can be repeated.

| # | test | mutation applied | result |
|---|---|---|---|
| 1 | the plots are the rects `data/areas.json` declares | moved `wwa.granary.x0` −556 → −552 | **red** (also reddened 2 and 3 — a moved plot really does bury props) |
| 2 | every light-side area a quest/prop/body/node names has geometry on it | deleted the `reach()` stands | **red** |
| 3 | the walled rooms enclose their own plot | deleted the Almonry's `room()` call | **red** — but test 2 stayed green, because Ivo's room next door is inside its 34 m radius. Test 2 catches a *missing place*, not a hollowed-out one; test 3 is what catches the second. |
| 4 | no prop, body or node is inside a collider | put the Almonry's arcade back over the tally at (−457, −122) | **red** |
| 5 | (same test) | put the watch house back at (−513, −131), over Kesta | **red** |
| 6 | every prop/body/node can be walked to from its area centre | both of the above | **red** |
| 7 | the granary is enterable and has room for its eight rats | removed the granary's door gap | **red** |
| 8 | (same test) | dropped a 14 × 16 grain bin on the granary's centre | **red** |
| 9 | each named room has a doorway a player fits through | removed the granary's door gap | **red** |
| 10 | the precinct wall is solid except at its four gates | dropped one 22 m run of the north face | **red** |
| 11 | (same test) | dropped the whole east face | **red** |
| 12 | all four gates are walked through, not looked at | `GAP` 18.5 → 0 | **red** |
| 13 | no wall run is long enough to grow a gatehouse | `RUN_MAX` 24 → 40 | **red** |
| 14 | every house has 3 m clear in front of its door | dropped a `mass` in front of the apprentice hall | **red** |
| 15 | every object stays inside its type's schema | forced every house to `w: 6` | **red** |
| 16 | the river stands are places, not bare bank | deleted the `reach()` stands | **red** |
| 17 | a gap cut out of a wall line leaves both stretches | `segments()` stops emitting the far side | **red** (took the wall-solidity test with it) |

The first mutation is worth calling out: changing one plot coordinate by 4 m reddened three tests,
including the two that read `props.json`. That is the property this file was written for.

### Checked live, in the browser, not in node

- New game → slate → Whitewall: `light.01` active and tracked, player at (−547.0, 31.4, −24.0),
  `here: ['wwa', 'wwa.granary']`.
- `spawner.tick()` × 20: **8 `grain_rat` placed, all inside the granary and all clear of geometry**
  (the spawner rejects blocked points, so this is the real test of the room being roomy enough).
- All **14** props whose id begins `wwa.` answer `props.targets()`.
- All **11** Whitewall houses entered via `doors.jump()`, walked 7.5 m in each of four directions:
  every one `state: 'in'`, rooms 3.97–4.50 m high, `floorLocal` finite at every sample, no
  fall-through, no confinement failure.
- Zero console warnings or exceptions through boot and play.

---

## 6. What a second town reuses, and what it needs fresh

This is the point of building one first, so: concretely.

### Reused as-is — no edit

- **`wallLine()` + `segments()`** — split a straight wall into runs of at most *n* metres with any
  number of gaps cut out of it. Blackstone's three terraces and its switchback wall are the same
  call with different endpoints.
- **`room()`** — four `retaining` runs round a rect with named doorways. Longacre's Tithe Barn
  precinct, Blackstone's forge, cistern, barracks, shift kitchen, chantry and Reeve's hall are all
  this shape, and all of them have props placed inside them by the same three data files.
- **`row()`** with its `real` ratio — the terrace generator. **The `real` knob is the whole perf
  story**; a second town starts at 1-in-3 and tunes from the traverse, not from a render.
- **`circuit()`** — gates as gaps flanked by towers, runs capped under 24 m. Blackstone is walled
  on three sides with a gorge as the fourth; that is `circuit()` with one face's gap set to the
  whole face.
- **The whole test file's machinery** — `blockedBy`, `walkable`, `placements()`, `referenced()`.
  Point them at `lac.*` or `bst.*` and every assertion holds verbatim. This is the highest-value
  thing in the wave: a second town gets the same 14 guarantees for the cost of a plot table.
- **The nine dev framings' shape** — absolute world coordinates, `?dev=1` gated, never in `SHOTS`.

### Needs writing fresh, per town

- **The plot table.** ~10 rects and ~6 circles copied out of `areas.json`, plus the test row that
  asserts they still match. Half an hour.
- **The road polyline.** One per district, and it must not overlap the King's Road's ribbon — see
  the 7 % luminance seam `demoScene.js` already warns about. Longacre's High Street *is* the
  King's Road, so **Longacre must keep `roadWidth: 0`** and surface no street of its own. That is
  already true in the current code and must survive A8.
- **The composition** — which plot faces which street, where the doorways go, what the landmark is.
  Not generatable; it is the wave.

### Needs new engine work before the town it belongs to

- **Blackstone's terraces.** `field.js` gives `dark` `pad: [30, 39, 48]` with a 26 m riser, so the
  ground really does step — which means `kerb()` finally fires, and `retaining` becomes structural
  rather than decorative. Whitewall exercised none of that: `light` is `pad: [22]`, a single flat
  shelf, so **no kerb in Whitewall has a drop and none of them became a collider**. The kerb code
  path is still untested by a shipped town.
- **`bst.levels`.** Still no subterranean support anywhere in the engine (`REMAINING.md` item 7).
- **Draw calls.** A second walled town of this footprint adds another ~20 populated blocks. If two
  towns are ever in one frustum the call count compounds; see §7.

---

## 7. Decisions that could have gone the other way

| decision | the alternative | why this way |
|---|---|---|
| Rooms open to the sky | roofed `house` objects with `interior.js` rooms | §2. The alternative deletes four NPCs and sinks 15 props. |
| Wall circuit = the rectangle the four gates define (224 × 174 m) | WORLD.md §3.1's "north 130, east 100, south 130, west 100" | Those four lengths cannot close any rectangle whose corners are the four gates. `areas.json` is the file the game reads; WORLD.md §3.1 is a sketch that predates it, exactly as its own §4.2/§4.3 did for the river. |
| Every wall run under 24 m | four long gated runs, one per face | `buildings.js` grows a gatehouse on any run over 24 m, and `colliders.js` makes every object a solid box — so the arch would be a gate you can see through and cannot walk through, four times. The cost is losing the buttresses (they need ≥ 4 modules, i.e. > 24 m) and losing the ruined stretch and the timber hoarding (they need ≥ 6 and ≥ 7 modules). Whitewall is a town that maintains its wall, so a clean parapet is in character; Blackstone will want those back and will have to solve this differently. |
| No terracing of the ground | six terraces at 3.5 m, per WORLD.md §3.1 | It needs `field.js` `pad: [22]` → a six-entry list, and every prop, NPC, gather node and area in the light zone was authored against the current heightfield. Moving the ground under 15 props and the `light.01` spawn to gain kerbs is not a trade I would make without asking. The town is a flat chalk shelf; the level changes are in the walls. |
| One road polyline, north gate → Yard → east gate | a second `terrain.addPath()` call for the east–west avenue and the ring | A district owns one `road` in the scene schema, and extending the schema is extending the editor. A second path would also be a side effect the editor cannot reproduce when a saved scene is loaded. The south gate's lane and the ring street are read off the frontages instead. **Cost: Sanctum Yard is swept chalk rather than `marbleCobble` paving.** That is the most visible thing I gave up. |
| `roadWidth: 9` | 14–18, so the Yard reads as paved | 9 is the King's Road's own half-width. Anything else puts a step in the ribbon at the east gate, which is the seam `demoScene.js` already documents. |
| Lantern Spire pinned `lod: 'full'` | leave it on the distance rule | Measured: at 82 m the proxy is a plain cylinder and cone, and this is the town's only landmark. One object, ~4k triangles, always resident. |
| `wall_day` left where it is | re-aim it at the new north wall | §4. It is the critic's contract and its `keep` radius is a generator input. |

---

## 8. What I could not verify, stated plainly

1. **Draw calls fail WORLD.md §6.7's gate: 189 worst against 150.** Main-pass is 122. The cause is
   structural and measured — Whitewall's 224 × 174 m footprint is 20 of the 60 m LOD blocks, every
   one of them is inside the 188 m cull radius from anywhere in the town, and each contributes
   2–4 merged meshes. Raising `BLK` to 90 fixes the calls and breaks the triangle gate (§3), so I
   left it. **This is unresolved and it will get worse with two more towns.** The levers I did not
   try, in the order I would try them: per-surface merging across adjacent blocks; dropping the
   separate `glass` surface into `trim` for daytime blocks; a coarser second-level block for
   anything past `lodDetail`.
2. **Everything perf here is software-rendered and headless.** Calls and triangles are real; every
   fps and every GPU millisecond in this document is meaningless and I have quoted none of them.
   Nothing has been on a phone. `docs/PHONE_TEST.md` is still owed.
3. **`light.01` was verified up to the point where the fight starts, not through it.** I confirmed
   live that the campaign begins, the player lands in the granary, all eight rats place inside it
   clear of geometry, and the lamp is in `props.targets()`. I did **not** drive eight kills and the
   relight through the runtime — `tools/campaign.test.mjs`'s `playThrough()` covers the ladder in
   the sim layer and is green, but that is not the same statement.
4. **The 350k gate is a *total* in WORLD.md §6.7 and a *main-pass* figure in this wave's brief.**
   I have reported both. Against main-pass the margin is large (167.8k worst). Against total it is
   7 %. If the intended gate is main-pass only, the traverse has 52 % of margin.
5. **The five scored plates were not blind-compared.** `tools/compare.mjs` exists and I did not run
   it. I judged the renders by eye against the brief, not against the reference plates.
6. **Nothing was verified in the editor.** The scene document round-trips through `normalise()`
   (asserted), but I did not open `?editor=1`, drag a Whitewall object, or save and reload the
   town. A saved scene also skips the swept-ground mask, because that runs in the generator and
   `startScene()` returns the saved document instead — grass would grow back in Sanctum Yard.
7. **Whitewall exercises no kerb.** The light pad is flat, so no kerb reaches the 0.6 m drop that
   turns it into a collider with steps. WORLD.md §3.1 called that path "the first genuine test" of
   `kerb()`; it is still untested and Blackstone now owns it.
8. **`stand.east` is in the West March.** `areas.json` marks it `town: "light"`, so I built it, but
   it sits at (−318, 50) in neutral country and may belong to Longacre's wave instead.
9. **`wwa_steps` is the weakest framing in the set.** The place is built and Rell and the fishing
   spot are on it, but the Vail reads as a pale band in the fog at that distance and I did not find
   a camera that fixes it inside my remaining budget.

---

# A8-fix — answering `docs/REVIEW_A8_WHITEWALL.md`

Same profile as §3 throughout: `--preset=medium --dpr=1 --w=844 --h=390`, `shadowRate` forced to
every frame, `node tools/budget.mjs --traverse --step=25` (348 samples). New traverse in
`docs/TRAVERSE_A8_FIX.json`; `docs/TRAVERSE_A8.json` is kept as the before.

| | before | after | gate |
|---|---|---|---|
| worst calls | **189** (122 main + 67 shadow) | **149** (122 main + 27 shadow) | 150 |
| samples over 150 calls | 19 of 348 | **0 of 348** | |
| worst total tris | 320.0k | **331.1k** (186.1k main + 145.0k shadow) | 350k |
| samples over 350k | 0 of 348 | **0 of 348** | |
| p50 / p95 | 74.1k / 254.2k · 74 / 154 | **76.6k / 263.0k · 72 / 124** | |

508 → **511 tests, 0 failing**. `lintQuests` 0 errors and the same one `light.06` warning.
`lintText` clean.

---

## 1. The draw-call gate — 189 → 149

Two changes, measured one at a time.

### One depth-only mesh per LOD set — 189 → 164

`build.js` `mergeShadow()`. Every block's `detail` and `proxy` holder now carries a single
position-only mesh merged from every surface that was casting on its own, and those surfaces get
`castShadow = false`. A shadow pass has no material distinctions to keep, so this is the same
shadow at one call a block instead of ~2.9.

The mechanism is the only one three allows. `material.visible` is read in **both** passes, but
`projectObject` builds the main render list *before* `shadowMap.render` runs, and `app.js` already
wrapped `shadowMap.render` for the stats mark. `App.shadowOnly` is a list of materials that
wrapper flips on for the shadow pass and off again; `demo.js` registers `build.js`'s one shared
`shadowOnly` material into it. Layers do not work for this — `WebGLShadowMap.renderObject` tests
`object.layers` against the **view** camera, so a layer excludes from both passes or neither.

Measured on its own: worst calls **189 → 164**, worst shadow calls 67 → 27, `wall_day` total
184 → 154. Triangles moved by +0.3 % (the merged mesh has one bounding sphere where three or four
used to be frustum-culled separately). Nothing else moved.

That left the overage in the **main** pass, which the review's arithmetic had attributed to blocks:
at the worst frame 20 drawn blocks are ~72 of 138 main calls, not all of them. The other ~66 are
9 contact-AO chunks, 8 water, 6 ground chunks, 6 road ribbons, 3 bank, ~12 foliage kinds and ~20
people / props / nodes / doors.

### `trim` folds into `wall` for proxy sets only — 164 → 148

`endBatch(root, fold)` renames surfaces on the way into the merge buckets, and `block()` passes
`PROXY_FOLD` for the proxy set. A proxy set is never seen closer than `lodDetail`'s 70 m, where the
ridge cap is 0.27 m and a window surround is 1.53 m — one to two pixels at 844 × 390. Four merged
meshes a block become three.

`glass` deliberately stays its own surface. I measured folding it too: another **12 calls** at the
worst frame (149 → 137) and no visible difference at all in `town_night` or from outside the north
gate at night, because Whitewall's wall hides its houses — **but** a night view of Longacre from
120 m loses its three or four lit windows entirely, and the whole window-lighting system exists for
that. Not taken. It is the next lever if Blackstone needs it, and it is worth 12.

### What this did *not* fix

The worst frame is **(−518, −216) yaw 120**, on the Drove road 74 m outside the north gate, where
19 of Whitewall's 20 blocks are drawn as proxies at once. 149 against 150 is **one call of
margin**, and two more walled towns of this footprint will not fit under it. Ranked, measured
where I could:

1. **`glass` into `wall` for proxies** — −12, costs distant lit windows. Measured.
2. **A coarser second-level block past `lodDetail`** — the 19 proxy blocks are ~54 of the 122 main
   calls; grouping them 3 × 3 would be ~12. Not attempted; it needs stream.js to fall back to
   per-block sets wherever one sub-block is inside the detail radius.
3. **`AOC` 120 → 240** in terrain.js — worth ~4–5 calls and costs decal triangles, which is the
   wrong way round: the comment on `AOC` already says so.

`BLK` is dead, as the review established. Do not measure it again.

## 2. Sanctum Yard was grass, and the mask could not have fixed it

The review is right on all three counts and the comment at `whitewall.js:278` was false. Replaced,
and the mechanism replaced with one that works.

**`terrain.addPatch(rect, zoneId)`** surfaces a rectangle in the zone's own `road` material —
`marbleCobble` for Whitewall — as one merged mesh per zone, built in `buildPatches()` and pushed
into `roadSegs` so it culls on the same distance rule the ribbons do. It sits at `surfaceY + 0.05`,
0.01 m under the road ribbon and at `renderOrder` 0, so the street crossing the square is the
street rather than a seam. The edge fades over 2.4 m with the same fbm the ribbons wear, and the
rect is grown by that fade so a room's paving runs under its wall rather than stopping at it.
**One draw call for the whole town.**

`whitewall.js` `SWEPT` is now `PAVED` and is the eight plots: the square and the seven walled rooms.
`demoScene.paveLight()` applies it, and `demo.js` calls it on the **saved-scene path too** — §8.6's
"a saved scene loses the swept ground" is closed.

The scatter leak is closed at its source. The occupancy grid's second bit now means *surfaced*
(`terrain.paved()`), and `scatter.js`'s `clump()` returns early on it. It cannot use `blocked()`:
that ring is exactly where the anti-sticker tufts belong, and testing it would strip the wall-footing
grass off every building in the valley.

**Proof.** Counting instanced scatter transforms inside the eight rects on a cleared-storage first
run: the review counted 1,089 source items; the tree now draws **0 of 2,960 instances inside the
paved rects**, against 2,641 inside the precinct wall. By eye: `shots/wwa_yard.png`,
`wwa_sanctum.png`, `wwa_almonry.png`, `wwa_cloister.png`, `wwa_works.png` and `wall_day.png` are
paved wall to wall. This is a first run with `localStorage` cleared, same as the review's.

## 3. The room floors, not the roofs

Done as the review recommended, by the same mechanism as finding 2 — the seven walled rooms are in
`PAVED`. `wwa_sanctum.png` is a courtyard with the font standing on cobble; `wwa_almonry.png` is
the Store's yard with the shelf and the tally on it; `wwa_granary.png` is the game's opening frame.
**No room was roofed and no `house` was substituted**: the four reasons in §2 stand, the review
verified them, and nothing in `interior.js`, `doors.js`, `props.js` or `people.js` was touched. All
11 Whitewall houses still enter (`doors.jump()` → `state: 'in'` on every one).

## 4. The Lantern Spire

The cause is that every dressing in `tower()` is a *fraction of the shaft*, which is right for the
two- and three-storey turrets it was tuned on and wrong at 58 m. Fixed generally, above a
threshold, so no existing tower in the world changes:

```js
const LOFTY = 30, STOREY = 8.4;   // shaft metres; floor-to-floor at K = 1.5
```

A shaft over 30 m gets its opening bands and its string courses on the absolute storey rhythm
instead of at 0.34 / 0.66 / 0.88, plus a ground-level doorway on one face standing on the plinth the
batter already climbs to, plus a **lantern**: a glazed stage on half the shaft's faces, standing
inside the parapet and carrying the roof. The lantern's panes are ordinary `glass`, so
`materials.js` `windows.discover()` finds them and the Spire lights from the inside after dark
without a line of code about it.

Lowest opening **21.4 m → 8.1 m**; first string course 22.5 m → 5.4 m; the doorway at 2.9 m. Only
two towers in the world are over `LOFTY` — the Spire and the Blackstone keep in `budget.mjs`'s spec
table — and every other tower is byte-identical, including its RNG draws.

**Cost, and what I traded back.** The Spire is the one object pinned `lod: 'full'`, so its
triangles are resident everywhere. First cut was 4.7k → 13.7k and took the worst traverse frame to
337.7k, a 3.5 % margin. Halving the lantern's faces (`n >> 1`) and dropping the lofty opening
probability from 0.62 to 0.44 brought it to **9.9k** and the worst frame to **331.1k**. The
Blackstone keep goes 3.1k → 7.1k on the same rule, which is a bill A9 now owes.

Judged by eye at player height: `wwa_yard.png`, `wwa_gate.png`, and framings from the south gate
and from the Yard's south edge. It is no longer a blank drum for its visible height and it has the
thing it is named for.

## 5. The Spire's collider

Fixed generally, and both halves moved so nothing invisible is left behind.

- `scene.js` exports `TOWER_FOOT = 1.3` and `TYPES.tower.plan` is `radius × TOWER_FOOT`.
- `buildings.js` imports the same constant and the drawn foot's widest ring is now
  `radius × TOWER_FOOT` instead of `× 1.5`.

So the drawn stone and the collider are the same number, from one place. The skirt loses 0.2 ×
radius of a 0.6 m-tall ring; nothing else about a tower changes. The alternative — collider at 1.5
× radius, geometry untouched — costs 4.5 m of Sanctum Yard and stops the player 4.5 m short of
anything they can see.

Measured live with the real `walkStep` at the Spire, stepping inward one metre at a time:

| distance from centre | before | after |
|---|---|---|
| 9.5 m | blocked | blocked |
| **10.5 m** | **free** | blocked |
| 11.9 m | free | blocked |
| **12.5 m** | free | **free** |

Drawn stone now reaches 11.7 m and the player stops at 12.22 m (11.7 + 0.18 collider pad + 0.34
body). `wwa.market.stall` at 14.0 m clears it by 2.3 m instead of 0.5 m.

**The gate opening changed and the comment with it.** `whitewall.js:53` claimed 18.8 m; the review
pointed out the *visual* opening was 14.8 m. Both numbers are now one number: 2 · (14 − 1.3 · 4.4)
= **16.6 m** drawn, 16.2 m walkable, measured at ±7 m either side of the centre line. That is 1.4 m
under WORLD.md §3's 18 m principal street. I did not widen `TOW` to buy it back: at `TOW` 15 the
north gate's west tower comes within 0.3 m of the gate cells' east wall, and the layout is tuned
tighter than that number is worth.

## 6. The coverage test

`whitewall.test.js` is 14 → 17 tests. The 34 m radius is gone.

**Coverage now reads the area table, not the quest graph.** `referenced()` is deleted: walking
`area` / `in` / `at` keys out of the packs only ever found 15 of the 19 light-side areas, which is
why nothing asserted the Spire, the board, the Cloister or three of the four gates existed. The
test iterates every light-side area in `areas.json` — **18 plots**, up from 12 — minus an explicit
three-entry `REGIONS` list.

**"Near" is replaced by "on".** `overlaps(area, object)` is separating-axis between the object's
collider plan and the area's shape. In a town of 20 m plots a 34 m radius asked "is there a
building somewhere near here", which is always true.

**The exemption list is guarded.** `REGIONS` is the hole a future town could hide in, so a test
asserts each entry is a rect at least 100 m across that fully contains at least one light area that
is *not* exempt.

Revert checks, each run and each reddened:

| # | mutation | old test 2 | new tests |
|---|---|---|---|
| 1 | delete `yard()` — Spire, Yard post, market arcades | **green** | coverage **red** (market, spire, board) |
| 2 | delete `almonry()` | **green** | coverage **red**, room-sides **red** |
| 3 | delete `works()` | **green** | coverage **red**, room-sides **red** |
| 4 | delete `cloister()` | **green** (unchecked) | coverage **red**, room-sides **red** |
| 5 | delete `sanctumRange()` | red | coverage **red**, room-sides **red** |
| 6 | delete `cells()` | green | room-sides **red**, coverage green — see below |
| 7 | delete `reach()` | red | coverage **red** ×4 |
| 8 | `room()` stops emitting its east side | green | room-sides **red** |
| 9 | the works yard loses its north wall | green | room-sides **red** |
| 10 | the granary left off `PAVED` | — | paving **red** |
| 11 | `plan: p => [p.radius, p.radius]` back in scene.js | green | tower-foot **red** |
| 12 | `'wwa.spire'` added to `REGIONS` | — | regions **red** |
| 13 | `'wwa.market'` added to `REGIONS` | — | regions **red** |

**Test 3 is now per side.** "Three or more `retaining` runs within 4 m of the plot" became "every
one of the four sides has wall on it", with a two-entry table naming the sides that are open by
design — `wwa.cells` north (the precinct wall is it) and `wwa.works` east (open to the street).
That table is now an assertion rather than a paragraph in this file.

**Row 6 is the one residual hole and it is honest.** `wwa.cells` is a 18 × 18 rect immediately
inside the north gate, and the west gate tower's collider stands inside it. So the *coverage* test
still passes with the cells deleted; the *room-sides* test does not. Every other plot is covered by
its own geometry alone.

Two more tests were added for the fixes above so they cannot silently revert: `PAVED` must be
exactly the plot table, and every tower's collider plan must equal `radius × TOWER_FOOT`.

## 7. Checked live, in the browser

- **`light.01` completes end to end on this tree.** Cleared `localStorage` → slate → Whitewall →
  player at (−547.0, −24.0), `here: ['wwa','wwa.granary']` → `spawner.tick()` places **8 rats, all
  `area: wwa.granary`** → **15 real `session.cast()` bolts** kill all eight (the review's number to
  the bolt) → step 2 → lamp lit through the real context button, which resolved to
  `interact` / `wwa.granary.lamp` → step 3 → Bel's context resolved to `talk` / `bel` and
  `light.01.out` played to its last line → **`light.01: done`**, flags `wwa.granary.clear`,
  `unlocked.light.02`, `unlocked.light.05`.
- All **11** Whitewall houses entered via `doors.jump()`; `state: 'in'` on every one. 25 doors in
  the world, unchanged — the proxy fold does not duplicate them.
- `?editor=1` boots: 189 objects, 35 blocks, no exceptions.
- Zero console warnings or exceptions through boot and play.

## 8. What this cost, stated plainly

1. **Geometry memory is up 10.7 MB.** The depth meshes are 934,692 vertices of positions against
   1,097,417 vertices of everything else in the scene — a 31 % increase in mesh memory for the
   whole world. Nothing gates this and nothing tracks it (`budget.js` `track()` is textures), but it
   is real and it is on a phone. Quantising those positions to `Int16` inside each block's box would
   halve it and is not done.
2. **One call of margin.** 149 against 150 at the worst frame. Two more towns will break it; §1
   ranks the levers with the two I measured.
3. **The triangle margin is thinner: 8.6 % → 5.4 %.** 11.1k of that is the Spire (+5.2k main,
   +5.0k in the shadow pass because the depth mesh carries it too) and the paving (~2.4k, always
   resident inside the town).
4. **Every foliage clump in the valley re-rolled.** `clump()`'s new early return and the tower
   footprint change both shift the scatter RNG stream, which §3 already documents as re-rolling the
   whole world. `creek_day` moved 98,294 → 98,769 tris (+0.5 %) and its trees moved; the other four
   scored plates are within noise. This is visible in `shots/creek_day.png` and it is not a defect.
5. **Still no phone.** Every number here is headless and software-rendered. `docs/PHONE_TEST.md` is
   still owed, and 150 is still an unmeasured budget.
6. **The five plates were still not blind-compared.** `tools/compare.mjs` cannot run here —
   `gms/3d/aaa_refs/refs/clean/` does not exist on this machine, exactly as the review found. I
   judged every render by eye at player height.
7. **`wall_day` is unresolved.** The review recommends promoting a north-gate framing into `SHOTS`
   and re-aiming or retiring `wall_day`, and gives a second reason: its 13 m keep-out is a permanent
   hole through the Cloister. I did not touch `SHOTS` — it is the critic's contract and moving a
   camera re-scores a plate and moves the layout. It is a decision for Aaron, not a fix. §4's
   account and D6's label complaint both still stand.
8. **The `retaining` triangle claims are still unverified**, as the review said. So is the masonry
   reading as brick rather than ashlar — that is `zones.js`, which is frozen.
9. **`row()`'s `real` is a count, not a ratio.** The review is right; §6 below says so now.

## 9. What a second town reuses, and what it needs fresh — rewritten

This replaces §6. §6 was written before the review; three of its claims were wrong or too generous
and the fixes above changed two more.

### Free, and now genuinely free

- **`wallLine()` + `segments()`, `room()`, `circuit()`** — unchanged, zone-agnostic, and
  `js/world/zones.js` is still byte-for-byte untouched. That property survived this pass and it is
  what makes the next two towns a plot table rather than a wave of engine work. Keep it.
- **The test harness.** `blockedBy`, `walkable`, `placements()`, `overlaps()`, `REGIONS`. Point
  them at `lac.*` / `bst.*` and every assertion holds verbatim — but read the corrections below
  before believing §6's "the same 14 guarantees for the cost of a plot table". It is now 17
  guarantees and the two that mattered were hollow until this pass.
- **Paved ground.** `terrain.addPatch(rect, zoneId)` costs one draw call for a whole town's squares
  and room floors, surfaces them in that zone's own `road` material with no new art, and masks
  scatter off them properly. A town's `PAVED` list is its plot table; one test asserts the two
  agree. **Longacre's Tithe Barn precinct and Blackstone's forge, cistern, barracks, shift kitchen
  and chantry are all `room()` shapes and will all be lawns unless they are in that list.** This is
  the single highest-value thing this pass added.
- **Tall towers.** `tower()` dresses anything over a 30 m shaft on a storey rhythm with a door and
  a lantern stage, and the lantern lights itself at night through the existing window system.
  Blackstone's keep (r 11, h 52) is over the threshold and gets it for nothing — but see the bill
  below.
- **The draw-call machinery.** The merged shadow pass and the proxy surface fold are per-block, so
  they scale with the towns rather than being spent on Whitewall. A second town's blocks arrive
  already paying the reduced rate.

### Corrections to §6

- **`row()`'s `real` is a count, not a ratio.** §6 said "a second town starts at 1-in-3". Writing
  `real: 3` gives you three full houses in that row, not one in three. The knob is still the whole
  perf story; the sentence was wrong.
- **The reuse claim was 13 guarantees, not 14.** Coverage was hollow for 11 of the 12 areas it
  checked and did not check four of them at all. It is fixed here — but the lesson generalises: a
  guarantee expressed as a radius around a point is not a guarantee in a dense town.
- **A saved scene used to lose the paving.** It does not now (`demo.js` calls `paveLight` on the
  load path), but the pattern is worth copying: anything the *generator* does to the terrain has to
  be redone on the saved-scene path, because `startScene()` returns the document and skips the
  generator entirely. There is exactly one such thing today. Do not add a second without wiring it
  the same way.

### Needs writing fresh, per town — unchanged

The plot table (~10 rects and ~6 circles out of `areas.json`), the `PAVED` list (the same table),
the road polyline, and the composition. Longacre must still keep `roadWidth: 0`.

### The bills the next two towns arrive owing

1. **Draw calls, 1 of margin.** Whitewall alone is 149 of 150 at the worst frame, and the worst
   frame is *outside* the town looking at 19 proxy blocks. Longacre and Blackstone each add another
   ~20 blocks and the King's Road runs between all three. **Measure the traverse before authoring
   the second town's composition, not after.** The two levers are §1's list; the first is measured
   at −12 and the second at roughly −40 but needs stream.js work.
2. **Triangles, 5.4 % of margin.** Blackstone's keep costs 7.1k instead of 3.1k under the new tall
   tower rule, and if it is pinned `lod: 'full'` the way the Spire is, that is resident everywhere
   in the town. Decide that deliberately.
3. **Blackstone's terraces.** Unchanged from §6: `field.js` gives `dark` a real 26 m riser, so
   `kerb()` finally fires and `retaining` becomes structural. Whitewall exercised none of it.
4. **`bst.levels`.** Still no subterranean support anywhere in the engine.
5. **`wall_day`.** Settle it before Longacre, not after — each town gets a scenario keep-out and
   the question is otherwise answered three times.
6. **`stand.east` is still in the West March**, still marked `town: "light"`, and may belong to
   Longacre's wave.

### The one-line version

A second town is a plot table, a `PAVED` list, a road polyline and a composition — about a day —
plus a traverse run *before* the composition is fixed, because the draw-call budget is now the
binding constraint and Whitewall spent all but one call of it.
