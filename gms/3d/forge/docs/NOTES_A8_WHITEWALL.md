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
