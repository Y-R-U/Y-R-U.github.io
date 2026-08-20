# Review — A8, Whitewall

Adversarial review of the uncommitted A8 wave on top of `4b13c82`. Everything below was run on
this tree. Where I disagree with the builder's notes or with Aaron's read of the renders, the
evidence is given so the disagreement can be settled rather than argued.

Twenty-two player-eye renders are in `shots/review_a8/` (gitignored). They were made by starting a
real campaign, standing the real player somewhere, and letting the real third-person camera settle
— not by a dev framing. Reproduction harness described in §8.

---

## Verdict

**Safe to commit as-is.** Nothing here breaks the build, the tests, the quest ladder or any of the
last four waves. The town is a large, real improvement and holding it back would cost more than it
saves.

**But three things must be fixed before Longacre and Blackstone are built the same way**, because
the pattern triplicates them: the Lantern Spire's walk-through plinth (D1), the swept-ground claim
that does not do what it says (D2), and the area-coverage test that is 11/12 hollow (D4). All three
are cheap. None of them is a reason to hold this commit.

---

## Demonstrated defects, worst first

### D1 — the player wades waist-deep through the Lantern Spire's plinth · **should-fix**

`js/editor/scene.js:49` — `tower: { plan: p => [p.radius, p.radius] }`
`js/world/buildings.js:286-287` — the drawn base is `radius * 1.3` and `radius * 1.5`

The tower collider is the shaft radius. The drawn battered foot is **1.5× that radius** at ground
level. For the Lantern Spire (`radius: 9`) the collider stops at 9 m and the stone reaches
**13.5 m** — a 4.5 m annulus of solid-looking masonry the player walks straight through, all the
way round the town's landmark, in the middle of the square the market quest uses.

Measured live (`walkStep` at the spire's own ground height):

| distance from centre | blocked? |
|---|---|
| 8.5 m | yes |
| 9.5 m | yes |
| **10.5 m** | **no** |
| 12.5 m | no |
| 13.4 m | no |

At r = 10.5 the plinth's cone is 1.2 m tall; at r = 10.0 it is 1.7 m. `shots/review_a8/eye_plinth.png`
is the player standing at (−508, −60) buried to the waist in it. `wwa.market.stall` at 14.0 m from
the centre clears the skirt by 0.5 m — the render shows its legs against the slope.

**This is a pre-existing engine bug, not something A8 wrote.** But A8 is what exposed it: the seeded
towns' largest tower is `radius: 4.5` (2.2 m overhang, reads as a step); a `radius: 9` tower in a
public square makes it a wading hazard. It is also exactly the class of bug `whitewall.test.js`
cannot see — see §7.

Cheapest fix: `plan: p => [p.radius * 1.5, p.radius * 1.5]`, or seat the foot's widest ring at the
collider radius. The first costs 4.5 m of square; the second costs nothing.

### D2 — "swept ground" cannot do what its comment says, and Sanctum Yard is still a lawn · **should-fix**

`js/editor/whitewall.js:278-284` (the `SWEPT` comment) and `js/editor/demoScene.js:30-33`

> *"These go into the terrain's scatter mask, **which is the only thing that decides where grass
> grows** — a 60 × 50 m lawn in the middle of a limestone town was the single loudest wrong note in
> the first render."*

Both halves are false, and I can show it three ways.

**(a) The mask cannot change the ground colour.** `terrain.js:259 groundColour()` never reads
`occ`. It is zone tint × noise × AO × water band × slope. `occ` is read in exactly one place —
`terrain.js:164 blocked()` — and only scatter consults it. The green in Sanctum Yard is the
*ground*, and no scatter mask can ever remove it. The wrong note the comment says was fixed is
still there.

**(b) The mask leaks.** `mark(x, z, 2.2)` on the terrain's 2 m grid, called on a 3 m lattice, covers
**92–96%** of each swept rect, not 100%.

**(c) The mask is bypassed at every wall base.** `scatter.js:649-671` walks `T.footprints` and
plants a clump at every wall/ground join **without calling `T.blocked`**, and tags them priority so
"neither the cap nor the density knob can strip it". Counting the source scatter items standing
inside the eight swept rects:

| rect | items | rect | items |
|---|---|---|---|
| `wwa.temple` | **218** | `wwa.market` | **128** |
| `wwa.cloister` | 224 | `wwa.granary` | 128 |
| `wwa.almonry` | 202 | `wwa.works` | 93 |
| `wwa.kitchen` | 66 | `wwa.cells` | 30 |

**1,089 scatter items inside ground the town declares swept.**

**This is not a saved-scene problem.** Every render in `shots/review_a8/` is a freshly generated
first run with `localStorage` cleared. `eye_yard_spire.png`, `eye_sanctum_range.png` and
`eye_almonry_in.png` are green wall to wall. So is `shots/wall_day.png` — a *scored* plate.
`NOTES_A8_WHITEWALL.md` §8.6 describes this as something a saved scene loses; it is missing on the
first run of a new game.

The real fix is a paved-ground surface (a second `terrain.addPath()` or a ground-tint override on
the swept rects), which the notes themselves identify as the cost of the one-road-per-district
decision (§7, "Cost: Sanctum Yard is swept chalk rather than `marbleCobble` paving"). What is
actually shipped is neither swept chalk nor paving — it is grass. **At minimum the comment must stop
claiming a fix that the mechanism cannot deliver.**

### D3 — the Lantern Spire is a blank drum for its whole visible height · **should-fix**

`js/editor/whitewall.js:150-153`

Aaron is right, and pinning `lod: 'full'` did not address it. The openings are real but they are
generated at `shaftH × {0.34, 0.66, 0.88}` = **21.4 m, 39.2 m, 51.3 m above the ground**
(`buildings.js:294`). The bottom **21 metres** of a 58 m tower are guaranteed blank wall by
construction. From anywhere in the town the player is looking at that 21 m.

Evidence at player height: `eye_spire_mid.png` (40 m away, 30 m of shaft, zero openings),
`eye_works.png`, `eye_gate_approach.png`, and `shots/wall_day.png` where the shaft occupies the
right quarter of a scored plate as a featureless grey column. Compare a `radius: 4.4` gate tower in
the same frames — windows, arrow slits, a corbelled parapet — and the Spire reads like an object
from a different, worse build.

There is no lantern and no gallery. The name promises both. It does have a crenellated ring and a
cone at 58 m, visible only from the air (`wwa_air.png`).

Not a bug — a `radius: 9` tower is simply outside the range the generator was tuned for. The cheap
fix is a second `tower` of small radius stacked at 44 m as a lantern stage, or a hand-added opening
band. It is one object and it is the thing the whole town is navigated by.

### D4 — the area-coverage test is hollow for 11 of the 12 areas it checks · **should-fix**

`js/editor/whitewall.test.js:104-115`

The builder reported one honest instance of this (the Almonry). It is not one instance; it is
essentially the whole test. I deleted each area's own geometry in turn — where "own" means anything
standing inside the area's declared shape — and asked whether the test would still find something
within its 34 m radius:

```
15 referenced light-side areas — 3 skipped as regions, 12 checked

stand.east    own 2  foreign 0   genuinely covered
stand.chalk   own 1  foreign 1   STILL PASSES
stand.low     own 1  foreign 1   STILL PASSES
wwa.fishsteps own 1  foreign 2   STILL PASSES
wwa.works     own 8  foreign 2   STILL PASSES
wwa.market    own 2  foreign 4   STILL PASSES
wwa.cells     own 4  foreign 5   STILL PASSES
wwa.almonry   own 10 foreign 7   STILL PASSES
wwa.granary   own 8  foreign 8   STILL PASSES
wwa.kitchen   own 5  foreign 8   STILL PASSES
wwa.northgate own 2  foreign 9   STILL PASSES
wwa.temple    own 9  foreign 12  STILL PASSES

11 of 12 would still pass with their own geometry deleted
```

Only `stand.east` — the one plot isolated in the West March — is genuinely guarded. A 34 m radius
is larger than most Whitewall plots, so in a dense town the test asks "is there a building
somewhere near here", which in a town is always true.

Two further gaps worth knowing: `referenced()` finds only **15** light areas, not the 19 in the
notes' table — `wwa.spire`, `wwa.board`, `wwa.cloister` and three of the four gates are named by
nothing, so **no test asserts they have geometry at all** beyond their coordinates matching
`areas.json`.

The mitigation is real and the builder has it: **test 3 is sound.** I checked the same way — no plot
has three or more `retaining` runs belonging to a *different* plot inside its bounds, so deleting
any room's own walls does redden it, and I confirmed that live for the Almonry (test 3 red, test 2
green — exactly as reported). But test 3 only covers the 7 walled rooms. The Spire, the board, the
fish steps and the three stands rest on test 2 and are therefore unguarded.

**This matters most for the next two towns**, because §6 of the notes sells "a second town gets the
same 14 guarantees for the cost of a plot table". It gets 13. Fix: tighten the radius to the area's
own extent, or require the near objects to be *inside* the shape.

### D5 — the draw-call gate fails, and `BLK` is not the lever · **should-fix**, see §6

189 total against 150. Reproduced exactly. See §6 for the full analysis and a costed fix.

### D6 — `wall_day`'s label is now wrong · **minor**

`js/world/demo.js:19` — `label: 'Wall + tower, midday'`

The framing no longer contains a wall as its subject; it is a street inside the Cloister. The label
and the `ref: '2198150_03'` plate are the critic's contract and both now describe a shot that isn't
there. One-line fix, but see §5 for the substantive question.

### D7 — the comment above `WALL_MIN` describes something else · **minor**

`js/editor/whitewall.js:62-65`

```js
// `retaining` is the enclosure wall: a battered face, a coping course and buttresses every 8 m.
// Measured at 57 triangles a run against a curtain wall's 62 a metre, and none of the
// crenellation a granary has no business having.
const WALL_MIN = 6;
```

Three lines about `retaining`'s triangle cost, sitting on top of a constant that means "the
shortest wall stretch worth emitting". It is not wrong about `retaining`; it is attached to the
wrong declaration, and it leaves the one genuinely non-obvious thing on that line — why 6 — undocumented.
By the CLAUDE.md rule this is two comments' worth of noise where one short one was needed.

---

## Suspicions I could not demonstrate

- **The `retaining` triangle numbers.** "57 triangles a run against a curtain wall's 62 a metre"
  and "a `mass` at 190 against a house's 6,500" are the load-bearing perf claims of the whole
  design. Geometry is merged into district batches by the time it is in the graph, so I could not
  attribute per-object triangles without instrumenting `build.js`. The aggregate numbers are
  consistent with the claims and the traverse reproduces exactly, so I have no reason to doubt them
  — but they are unverified.
- **`row()`'s `real` parameter is dead in this town.** All six `row()` calls omit it, so it is 1
  everywhere. That is fine here, but §6 of the notes calls it "the `real` **ratio**" and says a
  second town "starts at 1-in-3". It is a *count*, not a ratio — the code comment at
  `whitewall.js:229` has it right ("how many of the `n`"). Someone building Longacre from §6 would
  write `real: 3` expecting 1-in-3 and get three houses per row. Worth correcting in the notes;
  I have not shown it causes a problem because nothing uses it yet.
- **The masonry reads as brick, not limestone.** At K = 1.5 the course height in the room walls
  reads as a running-bond brick wall rather than ashlar (`eye_sanctum_range.png`,
  `eye_granary_door.png`). This is a `zones.js` material question, not A8's, and `zones.js` is
  frozen — flagging it only because Whitewall is the first place a 14 m blank wall face has existed
  to show it off.
- **The arcades read as roofless colonnades.** Seven `arcade` objects; from the ground they look
  like viaducts or ruins rather than market frontage (`eye_works.png`, `eye_almonry_in.png`). The
  type was signed off in CLAUDE.md, so this is a note, not a finding.
- **There is no approach landscape.** From 40 m outside the north gate the countryside is bare
  green with no trees (`eye_gate_outside.png`). This is A7's known limitation — `scatter.js` still
  places against the five scored cameras — but a real town makes its absence much more visible.
- **`tools/compare.mjs` cannot run on this machine at all.** `gms/3d/aaa_refs/refs/clean/` does not
  exist here. §8.5 of the notes says the builder "did not run it"; it could not have.

---

## What I verified as correct

Everything in this list I checked independently rather than taking from the notes.

**Perf, reproduced exactly.** `node tools/budget.mjs --traverse --step=25`:
worst total **320.0k** (180.4k main + 139.6k shadow) at (−512, −71); worst calls **189 (122 main)**
at (−520, −143); p50/p95 **74.1k / 254.2k**; **0 of 348 samples over the 350k gate**. Every figure
in the notes' traverse table is right to the digit.

**The BLK experiment, reproduced exactly.** BLK 90 gives 151 calls (104 main), p95 123 calls,
3 of 348 over the triangle gate, p95 tris 289.5k. As reported.

**508 pass / 0 fail.**

**Seven of the seventeen revert checks, re-run** — all reproduce, including the reported negative:

| mutation | result | notes said |
|---|---|---|
| `wwa.granary.x0` −556 → −552 | 3 red | 3 red ✓ |
| delete the Almonry's `room()` | **test 3 red, test 2 green** | exactly this ✓ |
| drop the north face's `wallLine` | wall-solidity red | ✓ |
| `GAP` 18.5 → 0 | 2 red | ✓ |
| `RUN_MAX` 24 → 40 | 1 red | ✓ |
| every house `w: 6` | 2 red | ✓ |
| `segments()` drops the far side | 2 red | "took the wall-solidity test with it" ✓ |

The test table is trustworthy. Where it claims a negative it states it honestly.

**No object is dropped by a camera keep-out.** The built document carries 139 light-zone objects:
29 `wallRun`, 13 `tower`, 50 `retaining`, 24 `mass`, 11 `house`, 7 `arcade`, 4 `pen`, 1 `cross`.
`whitewall()` returns 139. Nothing is lost. *(The notes say 50 `retaining` in §1 and 49 in §3; 50 is
right.)*

**All 14 `wwa.*` props answer `props.targets()`** — lamp, granary.lamp, market.kerb, market.stall,
board, temple.font, temple.hand, almonry.{shelf,tally,ledger,door,lock}, cells.hinge, fence.panel.
Plus 7 named bodies (bel, alder, marrin, ivo, pell, rell, kesta) and the light-side gather nodes.

**Nothing is buried and nothing is unreachable.** All 28 Whitewall targets are standable (the real
`walkStep`, not the test's model). A 0.5 m flood-fill of the whole district from the road *outside*
the north gate reaches **615,788 of 615,788 open cells** — the town is one connected component, no
prop, body, node or room is walled off.

**8 rats spawn inside the granary, clear of geometry, with clear line of sight** from the spawn
point — `sight()` returns true for all eight at 1.1–8.4 m.

**`light.01` completes end to end in the runtime.** New game → Whitewall slate → player at
(−547.0, −24.0), `here: ['wwa','wwa.granary']` → 8 rats spawn with `area: wwa.granary` → **15 real
`session.cast()` bolts** kill all eight → step 2 → lamp lit through the real context button
(`act('interact')`, context resolved to `wwa.granary.lamp`) → step 3 → Bel's `light.01.out`
dialogue played to its end → **`light.01: done`**, flags `wwa.granary.clear`, `unlocked.light.02`,
`unlocked.light.05`. This is the verification the builder said it owed.

**All 11 interiors are solid.** Each entered via `doors.jump()`, then walked 8 m in eight
directions with `camPitch` at its indoor maximum: `state` stayed `'in'` in every one of 88 walks,
`pos.y` finite at every sample, and the camera never rose more than **3.70 m** above the house's
seat against a floor-to-lid of ≥ 3.97 m. **No ceiling clip, no fall-through, no confinement
failure.** All 11 also exit — driving `P.vel` toward the door normal starts the leave animation in
1–44 steps. (My first two attempts showed every house failing to exit; that was my harness setting
`pos` without `vel`, which `watchInside()` reads. Not a defect.)

**`js/world/zones.js` is byte-for-byte unmodified**, and `whitewall.js` names no zone at all — it
imports one constant (`HOUSE_MIN_W`) and emits plain objects. The only zone conditional in the wave
is the dispatch at `demoScene.js:18`. The claim that a second town is cheap because there is no
zone-specific geometry code is true.

**The 74 m Sanctum range really does exclude a street.** −556 to −482 is 74 m; the nominal 3 m gap
between the Sanctum and the kitchen is 0.3 m of clear space once the two 2.7 m-thick `retaining`
colliders are counted. The note is right.

**The gate opening comment is right.** `whitewall.js:53` claims 18.8 m; 2 × (14 − 4.4 − 0.18) =
18.84 m with the collider pad. I nearly filed this as a wrong comment and it is not. (What *is*
worth knowing: because of D1's 1.5× base flare the **visually** clear opening between the gate
towers is 14.8 m, not 18.8.)

**The Almonry's two doors, the cells hinge's position, the fence panel's corner, the twelve circuit
towers, the 60 × 50 yard, the 224 × 174 circuit** — all checked against the code and all correct.

---

## Aaron's three visual observations

### 1. "The Lantern Spire is a featureless cylinder" — **you are right, and worse than you thought**

Not just featureless — featureless *by construction* for its bottom 21 m, which is the only part a
player ever sees. Pinning `lod: 'full'` was a fix for the wrong problem. See D3.

### 2. "Sanctum Yard is grass" — **you are right, and this is not a saved-scene issue at all**

Every render I made is a fresh first run with storage cleared. `eye_yard_spire.png` is the player
standing in the yard in daylight on a green lawn. So is `shots/wall_day.png`, a scored plate.

More than that: the mechanism the notes credit with fixing it *cannot* fix it. The mask only
suppresses scatter; the ground colour is untouched by design. So the answer to "does this affect a
normal player's first run" is **yes, always, and the saved-scene caveat in the notes is a smaller
problem than the one that is already shipping.** See D2. This raises the severity rather than
lowering it.

### 3. "The named rooms read as foundations or ruins from any elevation" — **partly wrong, and the real problem is different**

You cannot get elevation. I looked for one: the walls have no stair, the terrain around Whitewall is
a flat chalk shelf (`light` is `pad: [22]`), and the third-person camera tops out about 3.7 m above
the player. From every position a player can genuinely reach, the room walls (9–14 m) are far taller
than the eye, so **you never see into a room from outside and they never read as foundations.**
`eye_gate_approach.png`, `eye_wall_north.png` and `eye_avenue_sanctum.png` show what a player
actually sees: a walled town with a crenellated curtain and a paved street. The only view that
reads as ruins is `wwa_air.png`, which is a dev camera 74 m up.

**But the builder's reasoning still does not survive contact.** The problem is not how the rooms
look from outside — it is what happens when you walk in. `eye_sanctum_range.png` and
`eye_almonry_in.png`: the Sanctum, the town's temple and the hub of three quests, is **a grass
paddock between 14 m of blank brick with a font standing on the lawn**. The Almonry, "the Store", is
a lawn with a colonnade. And the game's opening frame — the player spawns at the granary's centre —
is a grass yard inside a 9 m blank wall with sky above it (`eye_granary_door.png`,
`wwa_granary.png`).

So on the substance: the four reasons the builder gives for not roofing them are all **true and
verified** — I confirmed the spawn point is the granary centre, that `doors.js` `setHidden(true)`
would take four `talk` objectives dark, and that 10 props plus 5 named bodies plus the hearth stand
at world coordinates inside those rects. The call to leave them open was correct and I would have
made it too. **The cheaper option it missed is not roofing — it is the floor.** Give the walled
rooms a paved ground surface and the Sanctum stops being a lawn and becomes a courtyard, which is a
building an open sky is plausible over. That is the same fix as D2, it costs no engine work in
`interior.js`/`doors.js`/`props.js`/`people.js`, and it converts the weakest thing in the town into
a deliberate one.

---

## The draw-call gate

### Is 150 real?

**Yes, and it is unambiguously a total.** `WORLD.md` is muddled about this — §6.1 puts 150 in a
column headed "main calls" while §6.5 puts it against a projection of ~53 *total* — but
`../forge_test/CLAUDE.md` settles it in as many words:

> *"Draw calls and triangles are the **total** the GPU drew that frame — shadow pass plus main pass
> — because that is what costs time. … **The gate is on the total.**"*

So the builder is right to call 189 a failure and right not to hide behind the main-pass reading.
The one caveat worth attaching: 150 sits in a mid-phone budget table next to "GPU p95 < 11 ms" and
"CPU p95 < 6 ms", and **none of those three has ever been measured on a phone** —
`docs/PHONE_TEST.md` is still owed. 150 is conservative for WebGL2 on a modern handset. I am not
going to relax an eight-wave-old gate on that hunch, but the cheapest possible resolution is to run
`PHONE_TEST` before spending a wave chasing 39 calls.

### How badly does it fail?

Not as badly as one number suggests. From `docs/TRAVERSE_VERIFY.json`:

| | |
|---|---|
| worst total calls | **189** (122 main + 67 shadow) at (−520, −143) |
| samples over 150 **total** calls | **19 of 348 (5.5 %)** |
| samples over 150 **main** calls | **0 of 348** — max main is 138 |
| p95 total / p95 main | **154 / 106** |

And the traverse forces `shadowRate` to *every frame*. The shipped default is **`15hz`**
(`lighting.js:247`), so at 60 fps the shadow pass rebuilds on **one frame in four**. Three frames in
four the worst point on the road network costs 122 calls, inside the gate with 19 % to spare. The
failure is a 26 %-over spike every 67 ms — a real stutter risk, not noise, but it is a *shadow-pass*
failure, not a town-density failure.

### `BLK` is not the lever — I extended the experiment

The builder measured 60 and 90 and concluded that 90 "fixes the calls" but breaks triangles. Two
corrections. First, **90 does not fix the calls** — 151 is still over 150. Second, I ran the
intermediate nobody tried:

| `BLK` | worst calls | worst total tris | over the 350k gate |
|---|---|---|---|
| **60 (shipped)** | **189** (122 main) | **320.0k** | **0 of 348** |
| 75 | 162 (114 main) | 372.5k | 2 of 348 |
| 90 | 151 (104 main) | 392.5k | 3 of 348 |

**No value of `BLK` reaches the gate, and every value above 60 breaks the triangle gate.** The
builder's decision to revert was correct; the reason is stronger than the one recorded. This lever
is closed — write it off rather than leaving it as "the obvious next thing anyone will try".

### The cheapest way inside 150

Not any of the three the builder listed, because all three attack the main pass and the main pass
is not where the overage is. At the worst sample, 35 blocks are in range: 8 detail, 15 proxy, 12
culled — **23 drawn blocks** producing 122 main calls (≈ 5.3 each) and **67 shadow calls**
(≈ 2.9 each).

**Merge the shadow pass to one depth-only mesh per block.** A shadow pass has no material
distinctions to preserve — `wall`, `trim`, `roof` and `glass` all write the same depth. Collapsing
2.9 calls per block to 1 saves ≈ **44 calls**, taking the worst frame from 189 to **≈ 145**. It
touches no triangle, no LOD, no layout and no scored plate, and it scales: two more towns add
blocks, and the saving grows with them. `WORLD.md` §6.1 already pointed here — *"the first place to
look for it is the shadow pass, not the main one"*.

Second-cheapest, if that is not enough: fold `glass` into `trim` for daylight blocks (worth ~13
calls by the builder's own scene-graph count). Combined, ≈ 132.

**Recommendation: keep the gate at 150, close out `BLK` as a dead lever, and put the merged
depth-only shadow pass on the list before Blackstone.** Do not block this commit on it — the
triangle gate, which the project has always said is the real one, passes with 8 % of margin and
0 of 348 samples over.

---

## `wall_day`, and whether the wall shot is lost

The builder's account is accurate: the camera at (−568, −122) is now 20 m inside the town because
the real north wall is at z = −142, and it did not move the camera because `SHOTS` is the contract
and its `keep` radius is a generator input. All correct.

**On the Cloister gateway.** I checked the counterfactual rather than taking the argument. With
`keep: 13` at (−568, −122), a 14 m run centred at (−571, −126) is 5.0 m from the camera and a 18 m
run centred at (−564, −117) is 6.4 m — both inside the radius, both deleted. **The builder removed
exactly the two runs `nearCamera` would have removed anyway.** So "the hole is the gateway" is a
fair description of the mechanism, not a dodge.

It is still a hole. `eye_cloister_gateway.png` is the player standing where the camera stands: two
`retaining` runs ending in raw square faces with a coping, 32 m of nothing between them, grass. No
arch, no jamb, no threshold, no path through. It reads as unfinished masonry, not as a gateway —
and it is in the frame of a scored plate. The honest description is "authored the deletion" rather
than "authored a gateway".

**Is losing the wall shot a real loss?** No — the subject is not lost, the camera is just pointing
the wrong way. `eye_gate_approach.png` (player at (−520, −186) looking south) and
`eye_wall_north.png` (player at (−470, −168)) are both better "wall + tower, midday" plates than the
placeholder ever produced: a crenellated curtain running to a corner tower, a twelve-sided gate
tower with real openings, the road running through the gate. The builder's own recommendation —
*"the honest fix is a new framing rather than a moved town"* — is right, and `wwa_gate` already
exists.

**What I would do:** promote a north-gate framing into `SHOTS` as a sixth scored scenario carrying
`ref: '2198150_03'`, and either re-aim `wall_day` or retire it. Two things push that way. First,
`wall_day`'s label (D6) and its reference plate now describe a shot that isn't there, so the plate
is measuring nothing. Second, and more structurally: **leaving `wall_day` where it is permanently
carves a 26 m keep-out through the middle of Whitewall.** Every future edit to that corner —
Longacre and Blackstone will each get one too — has to work around a hole nobody wants. That is a
cost that compounds, and it is a better reason to move the camera than the composition is.

---

## Test quality, and what the "no `three` import" purity buys

I confirmed the chain is genuinely pure: `whitewall.js → scene.js → zones.js, field.js`, and
`placement.js → areas.js`. No `three` anywhere, so `node --test` really does walk the whole town as
data.

**What it buys is real**, and I proved it by mutation rather than by reading: moving one plot
coordinate by 4 m reddens three tests including the two that read `props.json`; deleting a room's
walls reddens test 3; dropping a wall run reddens the circuit test; `GAP → 0` shuts the gates;
`RUN_MAX → 40` grows a gatehouse. Seven for seven. This is not the appearance of coverage.

**Its limit is precise and worth writing down for the next two towns.** The tests reason about
`TYPES[].plan` — the collider abstraction — not about what `buildings.js` draws. Every defect in
this review that a test could plausibly have caught lives in exactly that gap:

- **D1** is `plan` disagreeing with the drawn geometry by 4.5 m. Structurally invisible to a pure
  test, because the pure test *is* `plan`.
- **D2** is the terrain and scatter layers, which the pure test never touches.
- **D3** is what the geometry looks like.

So the purity is the right call and should be kept — but it should be stated in the notes that
these 14 tests guarantee *the town's data is consistent with the game's data files*, and guarantee
nothing about the town's geometry. The renders are still the only instrument for the second half,
which is why this wave needed to be judged by eye.

---

## Should this be repeated for Longacre and Blackstone?

**Yes, and the wave has earned it.** `eye_avenue_sanctum.png` and `eye_gate_approach.png` are the
argument: standing on the north avenue, Whitewall reads as a real medieval town, which no amount of
seeded jitter was going to produce. The reuse claim in §6 checks out — `wallLine`, `segments`,
`room`, `row`, `circuit` and the whole test harness are zone-agnostic, `zones.js` is untouched, and
the only per-town cost is a plot table and a composition.

Five things to change before the second town, in order:

1. **Fix D1 first.** It is one line in `scene.js`, it is a live bug in the shipped town today, and
   Blackstone's landmarks will be at least as large.
2. **Solve the room floor, not the roof.** D2 and observation 3 are the same problem. Whitewall's
   most disappointing interiors are lawns. Longacre's Tithe Barn precinct and Blackstone's forge,
   cistern, barracks and chantry are all the same `room()` shape and will all be lawns unless the
   ground is dealt with. This is the single highest-value fix in the list and it is worth a small
   wave of its own before either town is authored.
3. **Tighten test 2** (D4) before the harness is pointed at `lac.*` and `bst.*`, or the two new
   towns inherit a guarantee that is 11/12 hollow.
4. **Settle `wall_day`** before Longacre is built, so the keep-out question is answered once rather
   than three times.
5. **Do the merged depth-only shadow pass** before Blackstone, not after. Two more walled towns of
   this footprint will make the call count worse in exactly the way the notes predict, and the
   shadow lever is the only one that has been shown to work.

One thing to carry forward unchanged: **the notes' §8, "What I could not verify, stated plainly".**
Every item in it was accurate, including the two that made the wave look worse. Three of them (the
`light.01` fight, the interiors, `compare.mjs`) are now closed by this review; the rest stand. That
list is why this review could be short on suspicion and long on evidence, and it is the practice
most worth repeating.
