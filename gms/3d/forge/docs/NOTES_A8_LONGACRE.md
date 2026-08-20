# A8 — Longacre, and the measured draw-call fix

Two things: the fix `docs/NOTES_THREE_TOWN_BUDGET.md` measured and did not apply, and the second
town. Blackstone is untouched and still seeded.

Everything below came out of `node tools/budget.mjs`, `node tools/callsat.mjs`, `node --test` or a
real browser on this tree. Profile throughout, unless a row says otherwise:
`--preset=medium --dpr=1 --w=844 --h=390`, `shadowRate` forced to every frame, `--traverse
--step=25` — A7's, A8's and the three-town pass's own profile, so every number here is comparable
with `docs/TRAVERSE_A8_FIX.json` and `docs/TRAVERSE_THREE_TOWN.json`.

**529 tests, 0 failing** (511 before). `lintQuests` 0 errors and the one pre-existing `light.06`
warning. `lintText` clean. `js/world/zones.js` is byte-for-byte untouched.

---

## 1. Task 1 — the fix, and the preset split as built

Two edits.

- **`js/editor/build.js`** — `PROXY_FOLD` is now `{ trim: 'wall', crest: 'wall', glass: 'wall' }`.
  A block past `lodDetail` merges into two meshes instead of three.
- **`js/engine/quality.js`** — `lodDetail` is now a **preset field**, not just a knob default:
  **50 on potato, low and medium; 70 on high and ultra.** It is in all five rather than only the
  two the decision named, because `usePreset` is `Object.assign` and a preset that does not name a
  key inherits whatever the last preset set — going high → low would otherwise keep 70.

`stream.js`'s `q.register(... default: 70 ...)` is untouched and now only fires if a future preset
omits the key. The knob is still live in the panel.

### The traverse, four configurations

Every row is the full traverse, 348 samples, same profile.

| | worst calls | main | over 150 | p95 calls | worst tris | over 350k | p95 tris |
|---|---|---|---|---|---|---|---|
| **control** — `d953417`, Whitewall authored, two seeded | **149** | 122 | 0 | 124 | **331.1k** | 0 | 263.0k |
| Whitewall only, both levers | **137** | 103 | 0 | 116 | **317.0k** | 0 | 235.5k |
| **Whitewall + Longacre**, no levers | **150** | 120 | 0 | 133 | **331.5k** | 0 | 262.7k |
| Whitewall + Longacre, glass fold only | **142** | 112 | 0 | 127 | 331.5k | 0 | 262.7k |
| **Whitewall + Longacre, as shipped** | **139** | 109 | **0** | 124 | **316.6k** | **0** | 237.4k |

`docs/TRAVERSE_CONTROL.json`, `docs/TRAVERSE_LAC_BEFORE.json`, `docs/TRAVERSE_A8_LONGACRE.json`.

**The control reproduces `docs/TRAVERSE_A8_FIX.json` to the digit** — 149 calls at (−518, −216)
yaw 120, 331,133 triangles at (−512, −71) yaw 0, 0 of 348 over either gate — so the three-town
pass's instrument is the one this wave used and its readings carry over.

**Both gates pass with both towns authored: 139 of 150 calls (7.3 % of margin) and 316.6k of 350k
triangles (9.5 %), 0 of 348 samples over either.** That is a wider triangle margin than Whitewall
alone shipped with (5.4 %), because a block that becomes a proxy also shrinks the merged depth mesh
that shadows it.

Two things worth writing down against the three-town pass's estimate:

- **A real Longacre is much cheaper than the stamp said.** The stamp put a second Whitewall-shaped
  walled town at Longacre's centre and measured **158 calls, 6 of 348 over**. The real town, with
  no levers at all, is **150 and 0 over**. §7 of that note called 158 "an upper bound" and
  "probably pessimistic for Longacre"; it was right, by 8 calls.
- **Which means the second lever was not needed for two towns.** The glass fold alone takes two
  authored towns to 142. `lodDetail` 50 buys the other 3 calls and 14.9k triangles, and it is
  Blackstone — measured at 163 in the stamp with the highest peak of the three — that it is being
  banked for. It is applied now rather than later because the whole point of the preset split is
  that the reference device gets the gate.

### Where the worst frame is now, and what it is made of

`node tools/callsat.mjs --at="-82,109,240" --step=25` — the new worst station, on the King's Road
107 m west-south-west of Longacre’s centre, looking back at the town:

```
139 calls (109 main + 30 shadow), 47 blocks in range: 3 detail, 15 proxy, 29 culled
 21 proxy       14 detail      11 foliage      8 contactAO     7 ground
  7 road         5 water        5 people        4 bank          4 wood
  2 crest  2 bush  2 rock  1 waterReflect  1 chickens  2 doorLeaves  1 nodes
```

**35 of the 104 walked meshes are blocks and 69 are not** — the same split the three-town pass
found and the same conclusion: past the proxy fold, half the main pass is not the town at all.
Whitewall's old worst frame (−518, −216) yaw 120 is now 137 calls and no longer the peak.

### The high preset, said plainly

With both towns, `--preset=high`: **163 calls, 396.7k triangles, 7 of 348 samples over 350k.**
The 150/350k gate is a `MOBILE_PROFILE` gate — medium, dpr 1, 844 × 390 — and **high has never
been measured against it, before this wave or after**. This is not a regression: the glass fold
applies at every preset, so high is strictly cheaper than it would have been. It is a number
nobody has asked for a budget for, recorded so the next wave does not discover it.

---

## 2. Task 2 — what Longacre is

**86 objects: 42 `mass`, 19 `pen`, 11 `house`, 10 `retaining`, 1 `barn`, 1 `mill`, 1 `cross`,
1 `tower`.** Whitewall is 139 objects of which 29 are `wallRun`, 13 `tower` and 7 `arcade`.

**Longacre has no `wallRun`, no `arcade` and one `tower`, and that is the whole point.** Its yard
walls are 2.6 m, not 9–14, so you see over them; its roofs are thatch; its streets are dirt with
grass verges; its biggest building lies down instead of standing up. A test asserts each of those.

### Files

| file | what it owns |
|---|---|
| **`js/editor/townkit.js`** *(new)* | The pieces a town is written out of: `segments`, `wallLine`, `room`, `row`, and the `put` / `house` / `mass` / `pen` / `tower` / `arcade` / `retWall` constructors. Lifted verbatim out of `whitewall.js`. No `three`, no zone. |
| **`js/editor/longacre.js`** *(new, 241 lines)* | The town. Plot table, the yards, the composition. Pure. |
| **`js/editor/longacre.test.js`** *(new, 18 tests)* | Longacre against `data/areas.json`, `props.json`, `cast_at.json`, `gather.json`, `escorts.json` and `field.js`'s road, all read off disk or computed. |
| `js/editor/whitewall.js` | Imports the kit instead of defining it. **`whitewall()`'s 139 objects are byte-identical across the move** — asserted by snapshot before and after, and its 17 tests are green. |
| `js/editor/demoScene.js` | An `AUTHORED` table replaces the `zone === 'light'` branch. `paveLight` → `paveTowns`. The dead `di === 1` branches in `layout()` are gone: that path is Blackstone's only path now. |
| `js/world/demo.js` | `paveTowns` on the saved-scene path; twelve `?dev=1` framings, one per named place. **Not** in `SHOTS`, so they create no keep-outs. |
| `js/editor/build.js` | `PROXY_FOLD` (§1) and **`mill()` — see §6.** |
| `js/engine/quality.js` | `lodDetail` per preset (§1). |

### The plan

The King's Road *is* Longacre. It comes over Millbridge from the south-west, climbs **Mill Lane**
past the mill, crosses the **market square** at the cross and leaves east down the **High Street**
through the Ash Gate. Three lanes cross it: the **North Lane** in front of the cott row, the barn
plat and the stables; the **Back Lane** behind the square; the **West Lane** down to the hen house
and the field. There is no wall and no gate: the edge is a fence line, then field strips.

The town registers **no road of its own** — `roadWidth: 0`, and now `road: null` as well, because
with the width at zero the polyline was only ever read by an `addPath` call that never fired. The
7 % luminance seam `demoScene.js` warns about cannot happen because there is nothing to overlap.

### Area by area

Every `lac.*` and neutral-side area in `data/areas.json`, at its own coordinates. The list was
derived from the data, not from `WORLD.md`: 15 `lac.*` areas plus `reach.neutral` and
`stand.quiet`.

| area | built as | what stands in it |
|---|---|---|
| `lac.square` | 60 × 45 of beaten earth, frontages west and east, three hurdle pens for the stock market | — |
| `lac.cross` | `cross` (4 steps, 6 m shaft) standing **in** the road at the bend | the price post, Ansel |
| `lac.barn` | the **barn plat**: a 2.6 m walled yard with a cart gate north and a way in east | Dob, the Household's table, the tithe crate, the bank hearth, the cooking fire |
| — | the **Tithe Barn**, `barn` 40 × 18, thatched, ridge E–W, closing the plat's south side *and* the market place's north side | — |
| `lac.cotts` | three crofts on the North Lane's north side with gardens behind and the row's bakehouse at the corner | the escorted hen, in the strip in front |
| `lac.stables` | a range north, a cart shed east, a paddock south, the middle left clear | the plot stone |
| `lac.moot` | the **Moot Hall**, `house` 18 × 13 × 11 gable-end to the road, and the pound opposite | the ledger, on its lectern outside the door |
| `lac.forge` | the smithy (`house`, door on the Back Lane), the charcoal store, the shoeing yard | — |
| `lac.granary` | the **seed store**, `tower` r 5 h 20 — WORLD.md §3.2's numbers — plus the seed loft and the sack yard | Granny Sedge |
| `lac.henhouse` | the hen house and its run | — |
| `lac.westfield` | **a fence and nothing else.** Three `pen` runs; the east side is the field gate | six props and three gather nodes, one of them the boundary post |
| `lac.ashgate` | two piers, the **weigh house** and the wing fences that narrow the road | — |
| `lac.mill` | the **mill yard**: the river wall along the bank, the drying ground east | Hana, the meal crate, the hatch, the hurdle |
| — | the **Mill**, `mill` 16 × 13 × 11.5, wheel 3.5 on its south face over the weir | — |
| `lac.leat` | two bank revetments either side of the sluice, and the withy pen | the sluice |
| `lac.millbridge` | the landing stage on the north-west bank and Fen's hut above it. The bridge deck itself is the district's `bridge`, from `CROSSINGS` | Fen, the ferry crate |
| `stand.quiet` | a revetment and a drying pen on the bank, like Whitewall's stands | the fishing spot |
| `lac`, `reach.neutral` | regions, not plots — covered through their children | |

`longacre.test.js` asserts the first column against `data/areas.json` and the last against the
four placement files. Nothing here is hand-maintained.

### Three of the five scored plates are Longacre plates

`street_dusk` stands at (0, 84) on **Mill Lane** looking 70 m north up the lane to the cross;
`town_night` is 26 m up at (40, 86) over the **square**; `creek_day` is on the south bank at
(−4, 152) looking at **Millbridge**. All three were pointing at seeded jitter and now point at an
authored town. **The Whitewall notes never mentioned this, and it is the largest single thing this
wave changed about what the critic sees.** `street_dusk` is the one the composition was laid out
for: the cross closes its vista at 58 m with the Tithe Barn's roof beyond it. **`creek_day` did
not come out as planned** — the Mill is 49.8° off its axis against a 48.4° half-FOV, so the wheel
is just outside the frame and what the plate actually gets is the bridge, the mill yard's river
wall and the Mill's gable at the right edge. It is a better plate than the seeded one it replaces
and it is not the one I aimed at.

Measured on this tree, same profile — `docs/BUDGET_A8_LONGACRE.json`:

| plate | total calls | main | total tris | main tris |
|---|---|---|---|---|
| `wall_day` (Whitewall) | 139 | 107 | 243.2k | 145.5k |
| `street_dusk` (Longacre) | 113 | 84 | 194.3k | 126.1k |
| `gate_night` (Blackstone) | 67 | 46 | 168.5k | 101.9k |
| `town_night` (Longacre) | 139 | 106 | 208.3k | 140.0k |
| `creek_day` (Longacre) | 121 | 96 | 131.8k | 100.6k |

A per-plate before/after is not offered for the three Longacre plates: their subject changed, so
the delta measures a different picture rather than a cost. `texMB` is **55.1 on all five, exactly
as before** — a second authored town adds no art, which is what the shared kit is for.

---

## 3. Decisions that could have gone the other way

| decision | the alternative | why this way |
|---|---|---|
| **The Tithe Barn stands *south* of `lac.barn`; the rect is its walled plat** | a 40 × 18 `barn` on the rect | `props.json`, `cast_at.json` and `gather.json` put Dob, the Household's table, the tithe crate, the bank hearth and the cooking fire at world coordinates spanning x −12…12.4, z −57.1…−44.5 — the whole rect. A solid barn buries all five, exactly as §2 of the Whitewall notes describes for the Sanctum. Standing it on the south side puts the town's strongest horizontal across the market place's north side, which is the better composition anyway, and an open fire in the lee of a barn is the only version of `lac.barn.fire` that is not absurd inside a building full of dry grain. **Cost: STORY.md's "enterable only in the Neutral campaign" is not delivered.** It needs the same engine work Whitewall's §2 named. |
| **The market cross stands in the road** | 8 m east of it, off the carriageway | The road bends at (0, 20) and `lac.cross` is a 6 m circle on the bend; anywhere clear of the ribbon is outside its own area. A market cross standing in the road at a junction is what a market cross is. The road test asserts it is the *only* thing on the carriageway, so this is one named exception rather than a hole. |
| **`lac.westfield` stays green; the surfacing rule is a size, not a list** | Whitewall's rule — `PAVED` is exactly the plot table | Longacre is a farming village and grass is the right answer over most of it. Paving the West Field would pave the least impressive location in the game, which is the point of the West Field. The rule became "a rect plot with more than 400 m² of open standable ground is surfaced or is a declared field", plus a guard that a declared field carries nothing but `pen`. |
| **The Moot Hall is west of its own plot, gable-end to the street** | centred on `lac.moot` | The King's Road runs up x ≈ 1 straight through that rect, and `lac.moot.ledger` sits at (−1, 51.4) on it. A hall on the plot is a hall in the road. Off to the west it frames `street_dusk`'s left-hand side, and the ledger becomes a lectern chained up outside the door — which is a better joke than one inside. |
| **The seed store is 8 m east of `lac.granary`'s centre** | on the centre, as WORLD.md draws it | Granny Sedge stands 4.2 m north of that centre and a radius-5 tower's battered foot is 6.5 m of collider (`TOWER_FOOT`). On the centre she is inside the stone and the area centre is unwalkable. |
| **The Mill is 16 × 13 × 11.5, not WORLD.md §3.2's 20 × 16 × 14** | the documented size | The plot is hemmed by the road on the west, four placements in the middle and the bank on the south. At 14 m the blank gable that faces the approach up Mill Lane was the worst thing in the town; 11.5 is still 4 m above the crofts. |
| **Yard walls at 2.6 m** | Whitewall's named rooms, which go up to 14 m | The single most legible difference between the two towns at eye level. You look over a farm yard wall and into the plat; you look at a precinct wall. It also means the plat is not a corridor of blank stone. |
| **`stagger` added to `row()`** | a second row generator in `longacre.js` | Two lines, defaults to 0, and `whitewall()`'s output is byte-identical. A village row of crofts does not stand in a line and a terrace does. |
| **`townkit.js` extracted** | copy `wallLine`/`row`/`room` into `longacre.js` | The Whitewall notes' reuse claim is only true if the code is actually shared; a copy would have been two divergent copies by Blackstone. The extraction is byte-verified. |
| **`mill()` given openings** | leave the kit alone | §6. |

---

## 4. What actually got reused, and where the Whitewall prediction was wrong

`NOTES_A8_WHITEWALL.md` §9 made a prediction. Blackstone's brief comes out of the corrections.

### Right

- **`zones.js` is still byte-for-byte untouched, and `longacre.js` names no zone at all.** The
  property the whole approach rests on survived a second town. This is the claim that mattered most
  and it held.
- **The test harness is the highest-value thing, exactly as predicted.** `blockedBy`, `walkable`,
  `overlaps`, `placements`, `REGIONS` and the coverage/burial/reachability/schema/door tests
  transferred by changing `light` to `neutral` — 7 of Longacre's 18 tests are the Whitewall ones
  with a different filter.
- **`terrain.addPatch` is the second.** One draw call surfaces six yards in the zone's own dirt, no
  new art, scatter masked. The prediction "Longacre's Tithe Barn precinct will be a lawn unless it
  is in that list" was correct — it is in the list.
- **The draw-call machinery scales per block, as predicted.** Longacre's 12 new blocks arrived
  already paying the merged-shadow and proxy-fold rate: two authored towns cost 150 calls before
  this wave's lever, against the 189 Whitewall alone cost before A8-fix.
- **Draw calls were the binding constraint, and the traverse had to be run before the composition
  was fixed.** Both true.

### Wrong, or too generous

1. **"`wallLine()` + `segments()`, `room()`, `circuit()` — unchanged, free."** Not free: they were
   module-private in `whitewall.js`. Reuse meant extracting them, which is an edit to a shipped
   town. More importantly **`circuit()` and `room()` were not used at all.** `circuit()` is a wall
   with gates and Longacre has neither; `room()` is four sides with doorways and Longacre's one
   enclosure is three `retaining` sides plus a barn. What transferred is `wallLine`, `segments`,
   `row` and the constructors. **Blackstone will use `circuit()` and `room()` heavily and Longacre
   proved neither of them.**
2. **`placements()` reads three files; there are four.** `escorts.json` exists and its only entry in a town
   area is Longacre's — the hen in `lac.cotts`; the other two are out in the country. A Blackstone harness copied from
   Whitewall's silently ignores it.
3. **"A town's `PAVED` list is its plot table."** False for a farming village, and the test that
   enforced it would have made Longacre pave its own field. See §3.
4. **"Tall towers — Blackstone's keep gets it for nothing."** Untested here. Longacre's landmark is
   20 m, deliberately under `tower()`'s 30 m `LOFTY` threshold, so the lofty path this project
   added at A8-fix has still never been exercised by a shipped town other than the Spire.
5. **Nothing predicted the road.** Whitewall's road terminates at its own gates; Longacre's plan
   *is* `field.js` `ROADS[0]`, and it runs through `lac.moot`, through `lac.mill` and over
   `lac.cross`. Three buildings and a fence were moved because of it, and it needed a test with no
   Whitewall counterpart. **Blackstone's west gate is at (411, −80) and the King's Road's last three
   control points are (408, −6), (411, −44), (411, −80) — the road turns north and runs *into* the
   town, so the same problem exists there and is worse, because it arrives on a 26 m riser.**
6. **Nothing predicted that three of the five scored plates stand in Longacre.** They do.
   `gate_night` is Blackstone's and it will change the same way.
7. **The area table can defeat the coverage test on its own.** `lac.leat` (r 14) and
   `lac.millbridge` (r 12) have centres 20.5 m apart, so the two circles overlap and each is
   covered by the other's bank geometry; deleting either alone stays green (deleting both is red).
   **`bst.keep` and `bst.levels` are concentric circles at (520, −146) with radii 12 and 16.** That
   is not an overlap, it is containment: no geometry can ever distinguish them, and Blackstone's
   coverage test will be hollow for that pair by construction. Decide what to do about it before
   writing the test, not after.

### The bills Blackstone still arrives owing

1. **Terraces and kerbs.** Unchanged and still owed. `field.js` gives `dark` `pad: [30, 39, 48]`
   with a 26 m riser; `neutral` is `pad: [2]`, one flat shelf. **No kerb in Longacre has a drop
   either.** `kerb()` has now survived two authored towns without being exercised.
2. **`bst.levels`.** Still no subterranean support anywhere.
3. **Draw calls.** 11 of margin at medium with two towns. The stamp's whole-world worst was 163
   without either lever and Blackstone owned that frame; with both levers it was 149. Both levers
   are now spent.
4. **`wall_day`.** Still where it was, still a 13 m keep-out through the Cloister, still labelled
   "Wall + tower, midday" for a shot with no wall in it. Longacre added no new keep-out — the three
   neutral scenario cameras already existed — so this is the same open question the review left.
5. **`stand.east`.** Still marked `town: "light"`, still at (−318, 50) in the West March, still
   built by `whitewall.js`. Nothing in Longacre's data reaches it and `reach.neutral` does not
   contain it, so it was not this wave's to move.
6. **Geometry memory.** 49.9 MB with two authored towns (11.9 MB of it depth meshes, 23.8 %),
   against 45.4 MB shipped. The three-town pass's stamp predicted 58.5 MB for two towns: it put the
   increase at 13.1 MB where the real one is 4.5, over-estimating by 2.9× the same way it
   over-estimated the draw calls. Still nothing tracks or gates it.

---

## 5. Tests, and the revert check for each one

18 new tests. Every one was checked by reverting the behaviour it defends and confirming it goes
red; the mutation is stated so the check can be repeated. `js/editor/whitewall.test.js` was run
alongside every one of them and stayed green throughout.

| # | mutation | result |
|---|---|---|
| 1 | `lac.square.x0` −30 → −26 in `PLOTS` | **red** — the plot table |
| 2 | the Tithe Barn deleted | **red** ×2 — plat sides, longest building |
| 3 | the plat's north wall deleted | **red** — plat sides |
| 3b | every plat wall deleted | **red** — plat sides |
| 4 | `westfield()` deleted | **red** — coverage |
| 5 | `henhouse()` deleted | **red** — coverage |
| 6 | `stables()` deleted | **red** — coverage |
| 7 | `moot()` deleted | **red** — coverage |
| 8 | `forge()` deleted | **red** — coverage |
| 9 | `seedStore()` deleted | **red** ×3 — coverage, one-landmark, shortest-landmark |
| 10 | `quietStretch()` deleted | **red** — coverage |
| 11 | `leat()` deleted | **green** — see below |
| 12 | `millbridge()` deleted | **green** — see below |
| 13 | the pound put back at (5, 58) | **red** — on the King's Road |
| 14 | the miller's cott put back at (−22, 92) | **red** — on the King's Road |
| 15 | the Mill moved 10 m north off the weir | **red** ×2 — on the King's Road, wheel over water |
| 16 | `lac.square` dropped from `YARD_IDS` | **red** — 400 m² of open ground |
| 17 | `lac.westfield` added to `YARD_IDS` | **red** — a declared field is a field |
| 18 | a `mass` dropped in the West Field | **red** ×4 — buried, reachable, flood fill, field |
| 19 | a 40 m `wallRun` round the square | **red** — unwalled |
| 20 | `YARD_H` 2.6 → 9 | **red** — unwalled |
| 21 | `'lac.mill'` added to `REGIONS` | **red** — the regions guard |
| 22 | `row()`'s `stagger` term removed | **red** ×2 — reachable (the hen), the townkit test |
| 23 | the seed store moved onto `lac.granary`'s centre | **red** ×3 — buried (Sedge), reachable, flood fill |
| 24 | the Tithe Barn dropped on the plat | **red** ×5 — buried, reachable, flood fill, plat sides, longest building |
| 25 | **both** plat gates walled up | **red** — flood fill |
| 26 | `leat()` **and** `millbridge()` both deleted | **red** — coverage |
| 27 | the hen run put back overlapping the West Field | green on its own; it is what made #4 green before it was fixed |

**Rows 11 and 12 are the one residual hole, and it is honest.** `lac.leat` and `lac.millbridge`
are circles 20.5 m apart with radii 14 and 12, so they overlap as areas; every dry metre inside
either is inside the other, and the bank geometry of one covers the other. Deleting both is red
(row 26). This is `wwa.cells` again in a different shape, and §4.7 says why it matters for
Blackstone.

Two mutations found real defects rather than confirming a guard: #4 was green until the hen run was
moved 2 m east off the West Field's fence line, and #3 was green until the plat's side walls were
put on the plot line instead of 1.5 m outside it. Both are fixed and both now redden.

### What the 18 tests are

Seven are Whitewall's with `light` → `neutral`: the plot table, per-plot coverage, the `REGIONS`
guard, nothing buried in a collider, everything walkable from its area centre, three metres in
front of every door, and the schema. Eleven are new:

- **nothing is walled off from the King's Road, or standing in the water** — a 1 m flood fill out of
  the road at the market cross over the whole town and its reach, with `depthAt > 0` not walkable.
  This is the guarantee the Whitewall review verified by hand and never wrote down.
- **nothing but the market cross is built on the King's Road** — every station of every road inside
  `lac`, sampled across an 8 m carriageway. The one thing on it must be the cross.
- **Longacre is unwalled, ungated and has one landmark** — 0 `wallRun`, 0 `arcade`, 1 `tower`, no
  `retaining` over 3 m.
- **the landmark is the shortest of the towns built so far** — against `whitewall()`, and it must be
  the tallest thing in its own town.
- **the Tithe Barn is the longest building in the world** — against both towns' object lists — **and
  stands clear of the plat.**
- **the barn plat is a yard** — a `retaining` on each of three sides and the barn's north face on the
  fourth.
- **the mill wheel hangs over water, not over a field** — `depthAt` at the hub, which `build.js`
  puts at `w / 2 + 0.9` on the +x face.
- **a plot with 400 m² of open ground is surfaced or is a declared field**, **a declared field
  carries nothing but its fence**, and **everything surfaced is a plot of this town**.
- **`row()` staggers alternate plots and leaves a terrace in a line without one** — the townkit
  change, from both sides.

### Checked live, in the browser

- **`light.01` completes end to end on this tree.** Cleared `localStorage` → slate → Whitewall →
  player at (−547.0, −24.0), `here: ['wwa','wwa.granary']` → 8 `grain_rat` placed, all
  `area: wwa.granary` → real `session.cast()` bolts kill all eight → lamp lit through the real
  context button, which resolved to `interact` / `wwa.granary.lamp` → Bel's context resolved to
  `talk` / `bel` and `light.01.out` played out → **`light.01: done`**, flags `wwa.granary.clear`,
  `unlocked.light.02`, `unlocked.light.05`. Whitewall is not regressed.
- **The built document carries 139 / 86 / 22 objects.** `longacre()` returns 86, so **0 of
  Longacre's objects are deleted by a scenario keep-out**, and Whitewall's 139 is unchanged.
  47 blocks, up from 35.
- All **17** `lac.*` props answer `props.targets()`; all **5** neutral bodies (Sedge, Hana, Fen,
  Ansel, Dob) answer `cast.targets()`; all **5** neutral gather nodes answer `nodes.targets()`.
- All **11** Longacre houses entered via `doors.jump()` — `state: 'in'` on every one, floor
  8.80–9.70 m. 29 doors in the world.
- **Surfaced ground is right on both paths.** `terrain.paved()` is true at the market square, the
  barn plat and Sanctum Yard and false in the West Field, on the generated path **and** after
  saving the document to `localStorage` and reloading — the correction `NOTES_A8_WHITEWALL.md` §9
  asked for, applied to the second town.
- `?editor=1` boots the saved scene: 248 objects, 47 blocks, no exceptions.
- Zero console warnings or exceptions through boot, play and the editor.

---

## 6. `mill()` had no openings, and I changed it

**This is the one change outside the brief.** `js/editor/build.js` `mill()` was `gabled()` plus a
wheel, a launder and a chimney, and `gabled()` emits no opening in any wall. `barn()` breaks its
own walls with cart doors; `mill()` did not, so three of the Mill's four faces were blank stone —
11.5 m of it on the face you walk up to, which is quest N01's destination.

Added: a sack door on each ±z face, a hoist door above one of them, a **lucam** over it and the
beam it swings from. Eight lines, zone-agnostic, no new parameter, no schema change, no editor UI.
It is the same call A8-fix made for `tower()` above 30 m — a kit tuned at one scale being wrong at
another — and there is exactly one `mill` in the world, so nothing else moves.

Judged by eye from Mill Lane and from the south bank. The gable that faces the approach is still
blank, which is correct for a mill's gable and is why the building was also brought down from 14 m
to 11.5.

---

## 7. Fen crosses no water — a proposal, not a change

The open question, restated from the data rather than from the layout: `lac.millbridge` is at
(−34, 119) and `creekZ(−34)` is 119.4, so the area really is on the Vail. **Fen at (−28.6, 110)
and his crate at (−32.2, 108.2) are both about 10 m north of the centreline, on the town bank, and
so is everything they serve.** Nothing was moved to make that true and nothing could move it: the
placement layer anchors both to `lac.millbridge`.

**I did not change anything about this. What I did do is read every step the quest packs give
him, and they already answer it.**

| quest | the step | where it goes |
|---|---|---|
| `light.17`, `dark.15`, `sandbox.18` | *"Cross with the load"* — `escort fen → lac.mill` | **32 m downstream, on the same bank** |
| `light.21` | *"Fen will row you past the gorge"* | downstream, past Blackstone |
| `neutral.03`, `neutral.26` | the quiet stretch | `stand.quiet` (150, 100) — 185 m downstream, same bank |
| `neutral.23` | *"Bring the cart back to the bridge"* | a cart, on the road |
| `light.16`, `dark.09` | fish `reach.neutral`, recover to `lac.millbridge` | the reach, both banks, no crossing |

**Every route Fen has runs along the Vail, not across it.** The only thing in the game that says
otherwise is three words of flavour: *"Take a turn on the ferry"* in `light.17`, `neutral.10` and
`dark.15`, and `sandbox.18`'s title *"Ferry Shift"*.

**The layout makes the along-the-river reading natural rather than merely permissible.** The Mill
stands on the weir — `field.js` drops `waterY` 1.2 m between x −32 and −12 and calls it "the
Longacre weir that drives the mill wheel". **A loaded boat cannot pass a weir.** So a boat coming
down the Vail is landed at the wharf below the bridge head and its cargo is carried the last 32 m
to the mill by hand, which is exactly what `escort fen → lac.mill` is. The landing stage at
(−37, 103) is built for that and for nothing else.

So, for Aaron, two ways:

1. **Change four words and nothing else.** Fen is the Vail's **lighterman**, `sandbox.18` is
   "Lighter Shift", and "take a turn on the ferry" becomes "take a turn on the boat". No area
   moves, no geometry moves, no quest graph changes, and the crate labelled `load` in
   `props.json` starts making sense. This is what I would do.
2. **If a crossing is genuinely wanted**, the layout gives it one and it needs no new area: the
   south bank at Millbridge is z > 131 and is already inside `reach.neutral` (x −140…160,
   z 24…176), which reaches 45 m past the water before `meadow` begins. A far landing there is a
   `retaining` and a `pen` inside an area that already exists. **But nothing in the data asks to
   go there**, so it would be a place with no reason, which is the thing the West Field is
   deliberately not.

I have not written either. Option 1 is `data/quests/*.json` text, which is content and was not
this wave's to edit; option 2 is a place nothing needs.

---

## 8. What I could not verify, stated plainly

1. **The mill wheel does not touch the water.** It overhangs the race in plan — that is what the
   test asserts and all it asserts — but its rim's lowest point is **3.7 m above the surface** (8.51 against `waterY` 4.84).
   `mill()` puts the axle at `wheel + 0.6` above the building's origin, so the rim bottom is always
   0.6 m above the seat, and `build.js` seats a building at `terrain.range(...).hi` — the *highest*
   ground under its footprint, which for anything standing on a bank is the bank top. A wheel can
   only reach the water if the whole mill stands at water level. Fixing it means changing `mill()`
   or the seat rule and I did neither. It is visible in `shots/lac/mill_south3.png`.
2. **`lac.leat` and `lac.millbridge` cover each other**, so the coverage test cannot tell them
   apart. §5, rows 11/12/26.
3. **Everything perf here is headless and software-rendered.** Calls, triangles and byte counts are
   real; every fps and GPU millisecond this session produced is meaningless and none is quoted.
   Nothing has been on a phone. `docs/PHONE_TEST.md` is still owed and three budgets now depend on
   it.
4. **`lodDetail` 50 was judged on stills, not on a walk.** The three-town pass said the same thing
   and it is still true: the LOD swap happens while the player moves, and a pop at 50 m is more
   noticeable than one at 70 in a way a still cannot show. I did not make a video.
5. **The five plates were not blind-compared.** `tools/compare.mjs` still cannot run —
   `gms/3d/aaa_refs/refs/clean/` does not exist on this machine. Every render was judged by eye at
   player height, from `tools/eyeshot.mjs` framings in `shots/lac/` and the twelve `?dev=1`
   scenarios; the two dev cameras that turned out to be standing inside a wall were moved, and the
   only altitude shot in the set (`lac_air`) was not used to judge anything.
6. **`light.01`'s fight took 52 bolts in my harness against the review's 15.** All eight rats die
   and the ladder completes, but my harness re-aims `camYaw` at the nearest foe and steps 5 frames
   between casts, so the bolt count is a property of the harness and not of the game. Do not read
   it as a balance number.
7. **Nothing was dragged in the editor.** It boots the saved scene and the document round-trips
   through `normalise()`, but I did not move a Longacre object by hand and save it.
8. **Blackstone is still the stamp's word.** Nothing in this wave measured a real Blackstone, and
   §4's warnings about its road, its terraces and its concentric `bst.keep`/`bst.levels` are read
   off the data, not built.
9. **The masonry still reads as brick rather than ashlar**, as the Whitewall review said. That is
   `zones.js`, which is frozen, and Longacre's square-cut brown stone makes it more visible than
   Whitewall's limestone did.
