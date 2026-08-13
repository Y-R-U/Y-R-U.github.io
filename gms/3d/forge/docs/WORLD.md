# WORLD — terrain, towns, scale, and the engine work to get there

The world/technical plan for the game built on the FORGE engine. Narrative and RPG systems are not
in this document; see `STORY.md` and `SYSTEMS.md`.

Every rule in `forge_test/CLAUDE.md` carries over. Where this plan needs one of them bent, it is
called out in **§5.10 Sign-off required** and nothing in that list should be built before Aaron
answers.

---

## 1. World map

### 1.1 Extents and why they are what they are

| | metres |
|---|---|
| Terrain mesh | x −720 → +720 (1440), z −400 → +320 (720) |
| Playable clamp | x −680 → +680, z −360 → +280 |
| Playable area | 1.36 km × 0.64 km = **0.87 km²** |
| Current demo, for comparison | 290 × 208 m = 0.06 km² (**14×** smaller) |

Movement speed is `player.js` `speed = 5.0` m/s, sprint ×1.7 = **8.5 m/s**. That is the number the
whole scale argument hangs on, and it is fast — 5 m/s is a hard run, not a walk.

| journey | metres walked | at 5 m/s | sprinting |
|---|---|---|---|
| Across one town | 240 | 48 s | 28 s |
| King's Road, Whitewall gate → Longacre gate | 505 | 101 s | 59 s |
| King's Road, Longacre gate → Blackstone gate | 573 | 115 s | 67 s |
| King's Road end to end | 1078 | 216 s | 127 s |
| Drove Road (northern bypass) | 1088 | 218 s | 128 s |
| Corner to corner | ~1600 | 320 s | 188 s |

**The target was 60–120 s of countryside per leg.** A trip you will make dozens of times has to be a
journey, not a commute. Under 45 s and the towns read as three districts again — which is precisely
the failure this plan exists to fix. Over 150 s and it becomes a chore that a fast-travel system
will be built to skip, at which point the countryside was never worth building.

Both legs land at 101 s and 115 s walking, ~60 s sprinting. That is the right band.

Straight-line town-centre separation is 520 m and 520 m. The road is 1078 m against a 920 m
straight line — a **1.17 sinuosity**, which is what "the roads meander" costs in time.

### 1.2 The map

```
        -720  -600  -480  -360  -240  -120     0   120   240   360   480   600
  -420  ........................................................................
  -390  ........................................................................
  -360  ....................  N O R T H   M O O R  .............................
  -330  .........................(playable edge)................................
  -300  .................................--------.........---------.............
  -270  .........-.....----------....-----..-...-----------.......---...........
  -240  .........--..---........------......-....... Drove Road ....---.........
  -210  ..........----......................-...................++++++-++++++...
  -180  ....++++++-++++++...................-...................+DDDDDDDDDD++...
  -150  ....+LLLLLLLLLL++...................-...................+DDDDDDDDDD++...
  -120  ....+LLLLLLLLLL++...................-...................+DDDDD*DDDD++...
   -90  ....+LLLLL*LLLL++...................-...................+DDDDDDDDDD++...
   -60  ....+LLLLLLLLLL+==...........+++++++-+++++..............=DDDDDDDDDD++...
   -30  ~~..+LLLLLLLLLL++==..........+NNNNNNNNNNN+.............==~~~~DDDDDD++...
     0  .~~.+LLLLLLLLLL++.==.....~~..+NNNNNNNNNN==............=~~++++~~~~++++...
    30  ...~~~+++++++++++..==..~~~~~~~~~~~NN*========.........~~++++++++~~~~+...
    60  ......~~~............=B~.....+NN~~==NNNNN+..===.....~B~............~~...
    90  ........~~...........~===..=======B~~NNNNN+...===~~~~=..............~~..
   120  ..........~~~..~~~~~~...====.+++++++~~~~~++.....~f==.................~~~
   150  ............~~~..............++++++++++~~~~...~~~......................~
   180  ...........................................~~~~.........................
   210  ....... W A T E R   M E A D O W S .......................................
   240  ........................................................................
   280  .........................(playable edge).................................

  L  Whitewall (Light)       N  Longacre (Neutral)   D  Blackstone (Dark)
  +  town edge           *  principal landmark     ~  the Vail (river)
  =  King's Road         -  Drove Road             B  bridge     f  ford
```

Each column is 20 m, each row 30 m. Coordinates are the same x/z the engine uses.

### 1.3 Towns

| town | zone | centre | footprint | ground | plan |
|---|---|---|---|---|---|
| **Whitewall** | light | (−520, −60) | 240 × 200 | chalk shelf, +22 m, stepping down eastward | radial, walled |
| **Longacre** | neutral | (0, +40) | 260 × 220 | valley floor, +2 m, flat | linear high street, unwalled |
| **Blackstone** | dark | (+520, −80) | 230 × 200 | basalt ridge, +30 m, three terraces | switchback, walled, gorge on the south |

Light in the west, Dark in the east, Neutral literally in the middle and literally lowest. The
elevation profile alone tells you where you are: **west is up and pale, east is up and black, the
middle is down and green.** That is the navigation backbone and it costs nothing.

### 1.4 The countryside between them

Named regions, because "the bit between the towns" is how you end up with 500 m of empty grass.

| region | x span | contents |
|---|---|---|
| **The Chalk Downs** | −680 → −400 | sheep pasture, drystone walls in long straight runs (`wallRun` at height 2, thickness 1.2 — the kit already does this), a ruined chapel (broken `wallRun` + `tower` stump), the Whitespring at the river's head |
| **The West March** | −400 → −140 | the Downs Bridge, hedged lanes, two shepherds' bothies (enterable), a wayshrine every ~120 m of road |
| **Longacre's field strips** | −140 → +160 | ridge-and-furrow strips radiating from the town, four outlying farmsteads at 150–200 m, hay barns, sheep pens, cattle byre |
| **The Ashen Heath** | +160 → +400 | burnt gorse, a ring of standing stones, the Hollow Ford, Ashen Crag (the reason the road detours), a charcoal burner's camp, a watchtower on a knoll |
| **The North Moor** | z < −200 | the Drove Road, a hillfort earthwork, a beacon tower at (−40, −280) that is the only thing visible from both the Light and Dark spurs |
| **The Water Meadows** | z > +180 | the Vail's flood plain, willow, reed beds, three fishing shacks, boggy ground the player sinks into (a slow-down volume, not a hazard) |

The rule for the countryside: **something worth walking to every 120–150 m of road** — roughly one
per 25 s. Less and the walk is dead time; more and the towns stop being special.

---

## 2. Building scale — the derivation

This is the most important number in the document, so it is derived rather than asserted.

### 2.1 The camera, measured

From `js/player.js` and `js/engine/app.js`:

| | value | source |
|---|---|---|
| Vertical FOV | 55° | `app.js:38` `new THREE.PerspectiveCamera(55, …)` |
| Gate aspect | 844 / 390 = 2.164 | `MOBILE_PROFILE` in `quality.js` |
| **Horizontal FOV** | **96.8°** (half-angle 48.4°, tan 1.1266) | derived |
| Outdoor arm | `dist` 6.2, `height` 1.62 | `player.js:46-47` |
| Indoor arm | `distIn` 1.45, `heightIn` 1.90 | `player.js:63, 62` |
| Pitch, indoors | −0.35 … **+0.55** (`PITCH_MAX_IN`) | `player.js:10` |
| Default pitch | 0.26 rad = 14.9° | `player.js:40` |
| Camera collision radius | 0.26 | `player.js:65` |
| Arm hard floor | 0.40 | `player.js:66` |

The arm is placed by `player.js:210-212`: horizontal set-back is `dist·cos(pitch)`, rise is
`dist·sin(pitch)` above the aim point, and the aim point is `heightIn` above the feet.

**Indoors, today:**

| pitch | set-back | eye above floor |
|---|---|---|
| 0.26 (default) | 1.40 m | 2.27 m |
| 0.40 | 1.34 m | 2.46 m |
| 0.55 (max) | 1.24 m | **2.66 m** |

### 2.2 Failure 1 — the ceiling is inside the camera

`interior.js:33-40` hard-clamps room height:

```js
this.roomH = twoUp
  ? clamp((wallTop - plinth) * 0.52 - 0.14, 2.25, 3.0)
  : clamp(wallTop - plinth - 0.25, 2.25, 3.15);
```

**3.15 m is the ceiling of every room in the game, no matter how large the house.** Scaling the
`house` w/d/h params alone widens rooms and leaves the ceiling exactly where it is.

At maximum indoor pitch the eye sits at 2.66 m and its collision sphere reaches 2.92 m. Against a
3.0 m ceiling that is **8 cm of clearance**, and there is no ceiling collider at all
(`doors.js:373-385` `wallColliders()` builds four wall slabs and nothing overhead) — so on a
2.25 m-ceiling room the camera is simply outside the shell, looking at the room through the
underside of the boards.

**Ceiling in frame.** The top edge of the frustum sits `fovY/2 − pitch` = 12.6° above horizontal.
From an eye at height E it meets a ceiling at height H at `(H − E)/tan(12.6°)` metres away:

| ceiling | eye 2.27 | ceiling enters frame at |
|---|---|---|
| 3.00 m | 2.27 | 3.27 m from camera = **1.87 m ahead of the player** |
| 3.15 m | 2.27 | 3.94 m = 2.54 m ahead |
| 4.00 m | 2.27 | 7.74 m = 6.3 m ahead |
| 4.50 m | 2.27 | 9.97 m = 8.6 m ahead |

This is the whole complaint in one line. **At today's ceiling the top half of the screen is
floorboards from 1.9 m in front of your feet.** That is why a room looks smaller from inside than
it measures.

**Requirement: ceiling ≥ 4.0 m**, so the ceiling stays out of the frame across the whole depth of a
normal room.

### 2.3 Failure 2 — the arm collapses almost everywhere

`interior.js:73` insets the walkable box by 0.42 m inside the wall face, and `doors.js` puts wall
colliders at the wall face. A full-length arm needs

```
S = dist·cos(pitch) + camRadius + clearance margin
  = 1.40 + 0.26 + 0.06 = 1.72 m
```
of clear space behind the player. Anywhere closer to a wall than that, the arm shortens; below
0.40 m it stops shortening and the camera is jammed against the back of the player's head.

Call the region where the arm is *not* clamped the **core**. For a house of outer width `w` with
`panelT = 0.34`:

| outer w | walkable width | core width | core fraction |
|---|---|---|---|
| 7 | 5.36 | 2.76 | 51 % |
| **8 (default)** | **6.36** | **3.76** | **59 %** |
| 10 | 8.36 | 5.76 | 69 % |
| 12 | 10.36 | 7.76 | 75 % |

Default house is 8 × 7 → 59 % × 51 % = **30 % of the floor has a working camera**. Seventy per cent
of every room in the game is a jammed camera.

### 2.4 Failure 3 — the side walls close in

Side walls enter frame when the interior half-width equals `distance × tan(48.4°)`:

| interior half-width | side wall enters frame at | ahead of the player |
|---|---|---|
| 3.10 (default house, w = 8) | 2.75 m from camera | **1.35 m** |
| 4.40 | 3.91 m | 2.5 m |
| 5.40 | 4.79 m | 3.4 m |
| 6.10 | 5.41 m | 4.0 m |

At the default house you cannot see 1.4 m in front of yourself without a wall in the frame. There is
nowhere to fight.

### 2.5 The target interior, and where it comes from

Three requirements, each with a number:

1. **Ceiling ≥ 4.0 m** — §2.2, so the ceiling is out of the top of the frame.
2. **Core ≥ 60 % of the walkable extent in both axes** — the centre of the room has a working
   camera and the clamp only happens where you are pressed against a wall, which is correct
   behaviour rather than a bug.
3. **Side walls out of frame to ≥ 2.5 m ahead of the player** — you can see an approaching enemy
   before the wall does.

Solving requirement 2 for the *new* arm (see §2.7, set-back 2.03 m, `panelT` 0.51):

```
w = 2·[ (S − f·inset)/(1 − f) + t + 0.06 ],  S = 2.35, inset = 0.42, f = core fraction
  f = 0.50 →  9.70 m       f = 0.60 → 11.63 m       f = 0.70 → 18.05 m
```

Requirement 3 wants an interior half-width of 4.40, i.e. `w ≥ 4.40·2 + 2·(0.51 + 0.09) = 10.00` —
which is where the new `house` minimum width of 10 m comes from.

**Target dwelling interior: 10.9 × 9.3 m clear × 4.2 m high.**

### 2.6 The multiplier

Current default house `{w: 8, d: 7, h: 6}` produces a clear interior of **7.20 × 6.20 × 2.75 m**.

| axis | now | target | ratio |
|---|---|---|---|
| clear width | 7.20 | 10.9 | **1.51** |
| clear depth | 6.20 | 9.3 | **1.50** |
| clear height | 2.75 | 4.2 | **1.53** |

Three independent camera constraints — a frustum top-edge angle, a spring-arm length, and a
horizontal half-FOV — land on the same number to within 2 %.

> ## **K = 1.5**
>
> Every architectural dimension in the kit is multiplied by 1.5. Human-scale dimensions are not.

The default house becomes **12 × 10.5 × 9 m** with a **10.80 × 9.30 × 4.13 m** interior, and the
player mesh, the walk radius, the stair tread rise, the table height and the door-step rise stay
exactly where they are. That asymmetry *is* the design: the world is built oversized relative to a
human, which is both what the camera needs and what the reference plates look like.

Sanity check on the result: a 12 m-wide cottage with a 3.5 m front door and a 9 m eaves line, and a
1.75 m person walking through it. That is Tiny Glade proportion, not realism, and it is the correct
answer.

### 2.7 Camera changes that go with it

Scaling the room alone is not enough — a 1.45 m arm in an 11 m room shows less of it than a 1.45 m
arm in a 7 m room, proportionally. The arm moves too, sub-linearly (×1.45 indoors, ×1.29 outdoors),
because a longer arm clamps more often and the clamp is the thing we are fixing.

| `player.js` field | now | new | why |
|---|---|---|---|
| `distIn` | 1.45 | **2.10** | set-back 2.03 m at default pitch |
| `heightIn` | 1.90 | **2.05** | eye at 2.59 m — clear of a 4.0 m ceiling by 1.4 m |
| `PITCH_MAX_IN` | 0.55 | **0.50** | eye tops out at 3.06 m, +0.26 radius = 3.32, still 0.68 m under a 4.0 m ceiling |
| ~~`armMin`~~ | 0.40 | **0.40 — unchanged, see below** | ~~the hard floor scales with the world~~ |
| `dist` (outdoor) | 6.2 | **7.2, not 8.0 — see below** | set-back 6.96 m |
| `height` (outdoor) | 1.62 | **2.10** | eye at 4.16 m; you look over a 1.5×-scale kerb |
| `walkRadius` | 0.34 | 0.34 | **unchanged** — the player did not get bigger |
| `camRadius` | 0.26 | 0.26 | **unchanged** — it is a camera property |
| world clamp `(±145, −100…108)` | — | **delete** | `player.js:170-171`, replaced with the world bounds from terrain |

**A ceiling collider must be added** to `doors.js` `wallColliders()`. One more `wallBox`-style slab
at `oy + I.top`, horizontal. Without it the camera will still leave the room through the roof on any
room that ends up below 3.4 m — and after the change, some will, because `mass` blocks and
outbuildings are allowed to be small.

> **Corrected at A2, by measurement (`tools/camfit.mjs`).** Two of the rows above did not survive
> contact; the rest did, and the ceiling collider landed as specified.
>
> **`armMin` stays 0.40. "The hard floor scales with the world" is wrong** — it is bounded by two
> dimensions this very section declares unscaled: `interior.js`'s 0.42 m walkable inset and the
> 0.26 m `camRadius`. Pressed against a wall the arm ray is clipped at 0.16 m, so any `armMin`
> above `0.42 / cos(0.26)` = **0.435** pushes the camera out through the wall it was clamped
> against. Measured at 0.60: a 0.16 m poke into the wall panel in **all 25** demo rooms, plus 3 new
> "camera inside a building" cases in the outdoor door soak. At 0.40 both are zero.
>
> **`dist` is 7.2, not 8.0** — the `BUILD_PLAN.md` decision. It is a knob and the phone decides.
>
> Achieved against §2.5's requirement 2 (core ≥ 60 % per axis): **x 73.2 % mean, z 63.8 % mean**,
> zero shell escapes, least headroom under a ceiling +0.22 m. **The z axis is the weak one** and
> fails 60 % in six of the demo's rooms, because §2.5 solved the 10 m minimum for *width* only —
> the 10.5 m depth default gives a 54 % depth core. Author dwellings nearer square at A8 if it
> matters; the `house` `d` default is not changed here.

### 2.8 What breaks when you scale up — the complete list

Everything below is a specific file and a specific number. This is the checklist for Phase 1.

**`js/editor/scene.js` — parameter ranges.** The `SIZE` schema is shared by `house` and `mass`
today; it must split, because a `house` has an interior and therefore a camera-derived minimum,
while a `mass` is a shed and may be small.

| type | param | now (min/max/def) | new (min/max/def) |
|---|---|---|---|
| `house` | w | 3 / 24 / 8 | **10 / 36 / 12** |
| `house` | d | 3 / 20 / 7 | **9 / 30 / 10.5** |
| `house` | h | 3 / 18 / 6 | **7 / 27 / 9** |
| `mass` | w | 3 / 24 / 8 | **4 / 36 / 12** |
| `mass` | d | 3 / 20 / 7 | **4 / 30 / 10.5** |
| `mass` | h | 3 / 18 / 6 | **3 / 27 / 9** |
| `tower` | radius | 1.5 / 9 / 4 | **2.25 / 13.5 / 6** |
| `tower` | height | 5 / 40 / 18 | **8 / 60 / 27** |
| `tower` | sides | 8 / 16 / 12 | unchanged |
| `wallRun` | length | 8 / 90 / 40 | **12 / 135 / 60** |
| `wallRun` | height | 3 / 22 / 8 | **5 / 33 / 12** |
| `wallRun` | thickness | 1 / 5 / 2.4 | **1.5 / 7.5 / 3.6** |

The `house` minimum of 10 m is not arbitrary — it is §2.5 requirement 3. **Anything smaller than
w = 10 cannot be entered comfortably and should be a `mass`.** The editor should enforce this by
refusing to convert a sub-10 m `mass` into a `house`.

Footprint margins in the same file (`TYPES[t].margin`) scale ×1.5: house `[0.5,0.5]`→`[0.75,0.75]`,
tower `[1.6,1.6]`→`[2.4,2.4]`, wallRun `[0.6,0.7]`→`[0.9,1.05]`, mass `[0.3,0.3]`→`[0.45,0.45]`.
`tall()` for `wallRun` is `p.height + 6` → `+ 9`; the other two are already proportional.

**`js/world/buildings.js`.**

- `TUNING`: `wallSeg` 4.6 → **6.9**, `panelT` 0.34 → **0.51**, `eaves` 0.55 → **0.83**. `rubble` is a
  density multiplier, unchanged.
- `house()` `plinth` 0.44 → **0.66**. **This is the sharpest gotcha in the whole scale pass:**
  `WALK.stepUp` in `colliders.js` is 0.62, so a 0.66 m plinth makes every front doorstep
  unclimbable and the entire game becomes un-enterable. `stepUp` must go to **0.93** (1.5 × 0.62,
  and inside the knob's 0.1–1.2 range) in the same commit.
- `house()` `addSteps(... count: 3)` → **count: 5**. `addSteps` default `rise` is 0.19 and
  **must stay 0.19** — a step rise is ergonomics, not architecture. Five steps of 0.19 covers a
  0.66 m plinth with a tread to spare.
- Door: `dw` 1.25 → **1.75**, `dh` 2.35 → **3.20**. Sub-linear (×1.40, ×1.36) on purpose — a door
  has to keep reading as a door a person walks through, and 3.2 m for a 1.75 m player is exactly
  the storybook exaggeration the reference plates use.
- **Not on the original list, and required.** The window slot pitch stays at 2.0 m (scaling it puts
  a single slot dead centre on a narrow frontage, which is where the door is). A 1.75 m door and a
  1.35 m window on a 2.0 m pitch therefore *overlap*, and two crossing holes in one `ExtrudeGeometry`
  is a broken panel, not a wide opening. The old code skipped exactly one centre slot and assumed
  `slots > 1`; it now skips every slot within `dw/2 + winW/2 + 0.22` of the door. This was already
  marginally wrong at K = 1 on the narrowest frontages.
- Windows: `winW` 0.95 → **1.35**, `winH` caps 1.7 → **2.4** and 2.1 → **2.9**.
- Roof/dressing constants all ×1.5: string course 0.22 → 0.33, half-timber 0.15/0.07 → 0.22/0.11,
  ridge cap 0.2 × 0.44 → 0.3 × 0.66, barge boards 0.12 × 0.24 → 0.18 × 0.36, dormer 1.75/0.9 →
  2.6/1.35, lean-to 1.7–2.5 → 2.55–3.75, bay 2.6/1.25 → 3.9/1.9, chimney 0.9 and 1.7–3.1 → 1.35 and
  2.55–4.65.
- `wallRun()`: `foot` 1.25 → **1.9**, `gateW` cap 5.4 → **8.1**, `houseH` offset +4.4 → **+6.6**,
  merlon `height` 1.3 → **1.95** and `step` 1.95 → **2.9**, hoarding sections ×1.5, portcullis bar
  0.075 → 0.11.
- `tower()`: wall `t` 0.46 → **0.69**, `foot` 1.7 → **2.55**, window caps 1.05/1.9 → **1.5/2.85**,
  merlon `mh` 1.35 → **2.0**, finial 0.24 → 0.36, flag pole 2.4 → 3.6. **The window cap needs a
  guard.** Openings are holes in a panel exactly `shaftH` tall and the top level sits at
  0.88·`shaftH`, so a 2.85 m light only fits when `shaftH` ≥ 23.75 m — it breaks the extrusion on
  every tower in the demo and on the Longacre granary. Both the light and the arrow slit are capped
  at `shaftH − y − 0.6`.

**`js/world/interior.js` — the room itself.**

| line | now | new |
|---|---|---|
| `twoUp` threshold | `wallTop - plinth > 4.4` | **> 6.6** |
| two-storey `roomH` | `clamp(…·0.52 − 0.14, 2.25, 3.0)` | **`clamp(…·0.52 − 0.21, 3.40, 4.50)`** |
| one-storey `roomH` | `clamp(… − 0.25, 2.25, 3.15)` | **`clamp(… − 0.38, 3.40, 4.70)`** |
| `rx`/`rz` inset | `− t − 0.06` | **`− t − 0.09`** |
| `deck` gap | `ceil + 0.22` | **`+ 0.33`** |
| `roomH2` | `clamp(…, 2.0, 2.7)` | **`clamp(…, 3.00, 4.05)`** |
| `apW` / `apH` slack | `−0.03` / `−0.09`, `roomH − 0.24` | **`−0.045` / `−0.135`, `roomH − 0.36`** |
| `bounds` inset | `− 0.42` | **unchanged** — that is a shoulder, not a wall |
| boarding / dado / rail / skirting | 0.05 / 0.06 / 0.09×0.15 / 0.17×0.12 | ×1.5 |
| beams | spacing 1.4, section 0.17×0.19 | **2.1, 0.26×0.29** |
| hearth caps | `bw` 1.9, `bh` 2.3 | **2.85, 3.45** |
| leaded light | `gw` cap 2.0, `gy` cap 0.8 | **3.0, 1.20** |
| fire `PointLight` distance | 8.5 | **12.0** |

**Furniture does not scale.** The table stays 0.78 m high, the bed stays a bed, the stool stays a
stool. This is the single decision that makes the room read as *generously proportioned* rather than
as a unit change nobody can see. The consequence is that the new room is under-furnished — an 11 m
room with one table in it looks like a room that has been robbed. **Filling it is real work and it
is not in this plan**; flagged as an art task in §5.9.

**`js/world/stairs.js`.** `R` 0.85 → **1.15**, `GAP` 0.30 → **0.45**, `WALK_R` 0.52 → **0.70**,
`LEAD` 0.58 → **0.87**, `REACH` 0.7 → **1.05**. The per-tread rise is derived
(`n = max(12, round(rise/0.2))`) and **must stay at 0.2 m per tread** — a taller deck simply gets
more treads. `stairFits()` **does not scale ×1.5, and the claim that it would always pass at the new
room sizes is wrong**: a flat ×1.5 puts the x threshold at `2R + 2.18` = 4.48 m, and the 10 m
minimum house has `rx` = 4.40, so the entire minimum house class would be locked out of a loft while
still drawing two rows of exterior windows. The thresholds are `2R` plus the scaled offsets in
`stairPos` plus an **unscaled** 0.75 / 0.60 m of shoulder to walk round the well, which is the same
"clearances a person moves through do not scale" rule the rest of the pass follows: `2R + 1.80` and
`2R + 1.05`. The
scripted climb in `climb.js` is delicate (`NOTES_INTERIORS.md` §"what failed") and this is the one
change in the scale pass most likely to break silently; it needs the `triggerStair` test hook run
in both directions on all three zones.

**`js/world/doors.js`.** `OUT` 2.05 → **3.10**, `IN` 1.55 → **2.35**, `doorRadius` default 1.5 →
**2.25**, `nearest()` height tolerances 3.5/1.2 → **5.25/1.80**. Plus the ceiling collider from
§2.7.

**`js/world/colliders.js`.** `PAD_BY_TYPE` 0.15/0.25 → **0.22/0.38**, `WALK.stepUp` 0.62 →
**0.93**, `WALK.cell` 8 → **12**. `blocks()`'s `b.base <= y + 1.9` is "how tall is the player" and
stays. Bridge deck constants must mirror `build.js` exactly (they are duplicated today, which is a
latent bug at any scale).

**`js/editor/build.js`.** `foundation()` pads +0.4/+1.5 → **+0.6/+2.25**. `kerb()`: section
0.55/0.95 → **0.83/1.43**, `drop` threshold 0.4 → **0.6**, step count `drop/0.19` unchanged (so a
1.5× drop simply gets 1.5× the steps — correct). `bridge()`: deck `wy + 1.55` → **+2.33**, `w` 7.2 →
**10.8**, `len` offset +7 → **+10.5**, parapet 0.85/0.42 → **1.28/0.63**, bed −1.9 → **−2.85**.
`plainHouse()` window pane 1.02×1.5 → **1.53×2.25**, pane 0.66×1.06 → **0.99×1.59**, row heights
scale.

**`js/world/terrain.js` — the AO decals.** These are the thing `CLAUDE.md` calls "the single thing
that stops a building reading as a sticker", and they are all absolute metres.

- `addFootprint()`: `grow` default 0.4 → **0.6**; the AO falloff `smoothstep(3.2, −0.2, d)` →
  **`smoothstep(4.8, −0.3, d)`**; the scan radius `+ 3.5` → **`+ 5.25`**.
- `finish()`: decal ring pad 1.9 → **2.85**. The prop discs already take a radius.
- The GS = 1 occupancy grid: see §6.4.

**`js/world/scatter.js`.** Foliage is the one system that must *not* scale uniformly. Grass blades,
flowers and shrubs are real-world sized and stay; rocks and trees scale ×1.3 (sub-linear — a 1.5×
tree next to a 1.5× house is right, but the countryside is not architecture). The **densities**
must go up ×2.25 per unit area to keep the same visual density on 1.5×-scaled ground, which
collides head-on with the triangle budget — see §6.

**Perf consequence of the scale pass itself — measured, and it is not what this said.** The claim
was that triangle counts do not change because a 1.5× house has the same geometry. That is only
true if the *parameters* scale with the kit, and in Phase 1 they deliberately do not. Three of the
scaled constants are counts, not sizes:

- `wallSeg` 4.6 → 6.9 gives a 56 m run **8 modules instead of 12**;
- the `twoUp` threshold 4.4 → 6.6 drops most unscaled houses to **one window row instead of two**;
- the door now skips every window slot it overlaps, which on a narrow frontage is both of them.

Measured on the demo at the gate profile: **main pass 300.0k → 268.1k, buildings 180.5k → 150.7k**,
everything else within noise. So a Phase 1 verification should expect the count to *fall by about
16 % of the building budget*, and a count that did **not** move would mean the new constants never
reached the builders.

What changes visually is **screen coverage** — each building fills more of the
frame. That is neutral-to-good for fill rate (fewer, larger, opaque surfaces; less alpha-test
foliage overdraw per square metre of screen). The risk is the shadow map: at `shadowDist` 80 m the
fitted shadow camera now contains 1.5×-taller casters, so the same 1024² map spreads over a taller
frustum and contact shadows soften. `shadowDist` should come *down* to 60 m at medium to compensate,
which is also a triangle saving. **Measure on the phone; the headless GPU timer is not an
instrument** (`CLAUDE.md`).

---

## 3. Per-town plans

Street widths throughout are derived from the outdoor arm (§2.7): set-back 7.73 m + 0.32 m clearance
= **8.05 m of clear space behind the player for a full-length camera**.

| class | width | camera behaviour |
|---|---|---|
| Principal street | 18 m | full arm in every direction |
| Secondary street | 12 m | full arm along the street, ~5.7 m across it |
| Lane | 8 m | ~4 m arm — close, readable |
| Alley | 5 m | ~2.2 m arm — deliberately claustrophobic |
| Square | ≥ 45 m across | full arm, and the landmark frames |

### 3.1 Whitewall — the Light town

Radial and walled, on a chalk shelf that steps down eastward in six terraces. The plan is the most
*designed* of the three because that is the zone's character: nothing here happened by accident.

```
                        z −160
        +===============================================+     precinct wall, 4 runs
        |            NORTH GATE (to Drove spur)         |     len 100–130, h 12, t 3.6
        |     .....       |||||       .....             |
        |   .. terrace 6 ..|||.. terrace 6 ..            |
        |  +-------------+ ||| +-------------+           |
   WEST |  |  Cloister   | ||| |  Almonry    |           | EAST GATE
   GATE =  +-------------+ ||| +-------------+           =====> King's Road
   (x   |         \        |||        /                  |     (−400, −66)
  −640) |      .. ring street (12 m) ..                  |
        |          \       |||       /                   |
        |        +======[ SANCTUM YARD ]======+          |     60 × 50 m
        |        |     ((  SPIRE  ))          |          |     *
        |        |      +---------+           |          |
        |        |      | SANCTUM |           |          |     34 × 26 × 16
        |        +===========================+           |
        |          /       |||       \                   |
        |      .. ring street ..                         |
        |   .. terrace 2 ..|||.. terrace 2 ..            |
        |  ................|||................           |
        +==================|||==========================+
                        SOUTH GATE                z +40
                      (to the Vail, 55 m)
```

- **The Lantern Spire** — `tower` r 9, h 58, sides 12. Tallest object in the world. Its lit crown
  is the last thing to fade as you leave and the first to appear as you return, and at 250 m it is
  13° of screen height, which is unmissable on a phone.
- **The Sanctum** — `house` 34 × 26 × 16, `fp` override, enterable. Interior clear ≈ 32.9 × 24.9 ×
  4.5. This is the largest interior in the game and the reason the `house` max goes to 36.
- **Precinct wall** — four `wallRun` (north 130, east 100, south 130, west 100), h 12, t 3.6, each
  with a gate. Gates are the only way in, which is what makes the town a *place* rather than an area.
- **Terraces** — six levels stepping down 3.5 m each over the shelf's 22 m, each a terraced row of
  8–12 dwellings with a retaining kerb and a stair between. This is the layout the existing
  `kerb()` machinery was written for and never actually used (`NOTES_INTERIORS.md`: "in the shipped
  demo no kerb exceeds a 0.39 m drop, so none of them actually become colliders"). At 1.5× and a
  3.5 m terrace rise, **every kerb here becomes a real collider with real steps** — this is the
  first genuine test of that code path.
- **Legibility without a minimap** — four radial avenues, all pointing at the spire. Every ring
  street is paved (`marbleCobble`); every alley is not. Uphill is west, out of town. If you can see
  the spire you know where the centre is; if you can see paving you know you are on a through
  route.

### 3.2 Longacre — the Neutral town

Linear high street and market square: the English market town. Unwalled, because farmers do not
build walls — the edge is a hedge, a ditch and then field strips, and the transition from town to
country is gradual on purpose. It is the only town you can walk into without passing a gate.

```
   z −70   ..... open field strips, ridge and furrow, radiating .....
           .  Northfield farmstead (−170,−120)      Byre (150,−90)  .
   z −40   +----------+   +--------------------------+   +--------+
           | Cott row |   |       TITHE BARN         |   | stables|   40 × 18 × 15
           +----------+   +--------------------------+   +--------+   ridge E–W
   z  +5        |               |||||||||                    |
           .....|.......  MARKET SQUARE (60 × 45)  ...........|.....
   z +20   =====+============ * market cross ============+=========>  ASH GATE
        (High St, 18 m)        |||||||||                 |   (130, 20)
   z +45   +--------+   +------+---+   +-----------+     |
           | Forge  |   | Moot hall |  | Granary   |     |   granary = tower r5 h20
           +--------+   +-----------+  +-----------+     |
   z +75       |  Back Lane (10 m)  |      Mill Lane     |
   z +95   ~~~~~~~~~~~ MILLBRIDGE (−34, 86) ~~~~~~~~~~~~~~~~~~~~~~   the Vail
   z +120  +-------+  [ MILL + wheel ]  +--------+
           | drying |   20 × 16 × 14    | tanpit |
   z +150  ..... water meadows, willow, reed .....
```

- **The Mill** — `house` 20 × 16 × 14 straddling a race cut off the Vail, with a turning overshot
  wheel. Enterable; the interior is the one that most needs the extra volume, because a mill
  interior is a machine.
- **The Granary** — `tower` r 5, h 20. Total height ~26 m with its roof, and it is **deliberately
  the shortest of the three towns' landmarks.** Whitewall has 58 m, Blackstone 52 m, Longacre 26 m. The
  middle town is humble and reads as humble from the road.
- **The Tithe Barn** — `house` 40 × 18 × 15, ridge running E–W. The longest single building in the
  world and the strongest horizontal in any silhouette; it is what stops Longacre reading as a
  pile of identical cottages.
- **Farmland** — the requirement. Four outlying farmsteads at 150–200 m (each a courtyard of
  `mass` outbuildings plus one enterable `house`), long strip fields on ridge-and-furrow (a terrain
  displacement, not geometry — see §4.5), sheep pens, a cattle byre, and the existing `chicken.js`
  flock at 3× the count. Livestock beyond chickens is a `SYSTEMS.md` question, not mine.
- **Legibility** — the square is the hub and everything funnels to it; the mill wheel is the only
  moving thing in the world and is visible and audible from the south; the granary is the only thing
  above the roofline from the north. Field strips all point at the town, so if you are lost in the
  fields you follow the furrows.

### 3.3 Blackstone — the Dark town

Switchback, walled on three sides, with the Vail's gorge as the fourth. Three terraces at +0, +9 and
+18 m; the single street climbs the ridge in three legs and you are always either going up or going
down. It is the only town with a genuine third dimension, which makes it the hardest on the camera
and the most interesting to move through.

```
   z −180  +====================================================+
           |            UPPER TERRACE  (+18 m)                  |
           |     ((( THE BLACK KEEP )))  tower r11 h52  *       |
           |   +----------------------------------+             |
           |   |         Keep bailey              |             |
           |   +----------------------------------+             |
   z −110  |        \\\  switchback 3 (12 m, 1:8)  //            |
           |   +----------+        +-------------------+        |
           |   | Chantry  |        |  Reeve's hall     |        |
           |   +----------+        +-------------------+        |
   z −60   |         MIDDLE TERRACE  (+9 m)                      |
   WEST    |   .. undercroft alleys (5 m) ..                     |
   GATE ===|===  switchback 2  ==================================|
  (405,−80)|                                                     |
   z −10   |         LOWER TERRACE  (+0 m)                       |
           |   +--------+  +--------+  +--------+                |
           |   | forge  |  | cistern|  | barracks|               |
           |   +--------+  +--------+  +--------+                |
   z +20   +================ GORGE WALK (8 m) ==================+
   z +40   \\\\\\\\\\\  cliff, 12 m drop  \\\\\\\\\\\\\\\\\\\\\\
   z +60   ~~~~~~~~~~ the Black Race, in the gorge ~~~~~~~~~~~~~
```

- **The Black Keep** — `tower` r 11, h 52, sides 8. Octagonal, spiked crest, the second tallest
  thing in the world. Always uphill; you never have to ask which way the centre is.
- **The curtain** — three `wallRun` (west 100, north 115, east 100), h 15, t 4.5. The south side is
  a 12 m cliff into the gorge and needs no wall, which is the whole reason the town is here.
- **Terracing** — 9 m between levels is far beyond any step-up. Movement between terraces is *only*
  by the switchback street and two stair flights, which makes the town a real place to navigate and
  a real place to be chased through. Each terrace edge is a `wallRun` at h 9 doubling as a
  retaining wall, plus kerbs.
- **Camera risk — resolved at A2, build at 9 m.** The diagnosis above had the case backwards.
  Standing at the *edge* of a terrace is fine: the ground clamp only ever pushes the camera up, and
  the camera is already above the terrace it stands on. The failure is standing at the *foot* of the
  9 m retaining wall, where `groundAt` behind the player returns the terrace top, `camFloor` becomes
  `feet + 9.7`, and the old `back.y = max(back.y, camFloor)` **stretched a 7.2 m arm into a 9.7 m
  one** — which then rays over the wall instead of into it. `player.js` now swings the camera up the
  sphere of radius `dist` rather than stretching the arm, so the worst case is the camera going
  overhead at its correct length. That is normal third-person behaviour at the base of a cliff.
  Per-town `camDist` remains available as a knob if the phone disagrees. Analysed and simulated, not
  yet measured against real geometry — **re-run `tools/camfit.mjs` when A8 places Blackstone.**
- **Legibility** — up is the keep, down is the gorge, and the gorge is always south. The switchback
  means you are never on a street longer than 80 m, so the town reveals itself in pieces.

---

## 4. River and road spec

### 4.1 What exists

`terrain.js:68-72`:

```js
export const creekZ   = x => 56 + 7.5*Math.sin(x*0.0185) + 3.0*Math.sin(x*0.052 + 1.1);
export const creekHalf = x => 4.2 + 1.5*Math.sin(x*0.031 + 0.6) + 0.5*Math.sin(x*0.11);
export const waterY   = x => 0.15 - x*0.0042;
export const CHANNEL  = 1.75;
```

A single sine wave, ±10.5 m of wander over 300 m, a constant 1.75 m channel depth and a linear
water surface. It is a stream, not a river, and it is not authorable.

### 4.2 What it becomes

**`creekZ` becomes an authored spline.** A monotone-in-x Catmull-Rom through control points, plus a
small fbm/sine wobble for the sub-100 m wiggle. Sines cannot be made to pass through a specific
point on purpose; a spline can, which is what makes the river a *designed* feature rather than a
lucky one.

```js
export const RIVER_CP = [
  [-780,-60],[-700,-10],[-600, 50],[-520,112],[-430,142],[-340,118],[-262, 48],
  [-180, 10],[-100, 34],[ -30, 86],[  40,124],[ 130,166],[ 220,150],[ 300, 84],
  [ 380, 16],[ 452,-26],[ 530, -4],[ 620, 62],[ 720,150],[ 790,190],
];
export const creekZ = x => splineAt(RIVER_CP, x) + 9*fbm(x*0.011, 0.3, 2, 17);
```

Amplitude goes from ±10 m to **±100 m** — the river genuinely crosses the line of travel rather
than paralleling it.

**`creekHalf` becomes authorable per reach** — 3.5 m at the head in the Downs, 13 m at the Hollow
Ford, 4.5 m in the Blackstone gorge.

**`CHANNEL` becomes a function of x, not a constant.** This is the change that makes a ford
possible: at the ford the channel is 0.45 m deep and 26 m wide; in the gorge it is 4.5 m deep and
9 m wide. Everything that reads `CHANNEL` today (`heightAt`, `buildWater`'s depth attribute) takes
the function instead.

**`waterY` becomes three reaches with two steps.** A single linear fall of 0.0042 m/m over 1440 m is
6 m of drop, which is right for a river of this length, but a linear river has no weir, no mill
race and no waterfall. Three reaches — upper 0.006 m/m, valley 0.0022 m/m, gorge 0.009 m/m — joined
by two `smoothstep` transitions, plus a 1.2 m step at the Longacre weir (which is what drives the
mill wheel) and a 3 m cascade at the head of the gorge. It must stay monotonically decreasing in x
or the water surface will pond and the flow direction attribute in `buildWater` will lie.

### 4.3 Crossings

Four, each a different type, because four identical stone bridges is one landmark repeated.

| name | x | type | notes |
|---|---|---|---|
| **Downs Bridge** | −286 | two-arch stone, 24 m span | the existing `bridge()` builder, ×1.5, two piers |
| **Millbridge** | −34 | single-arch stone, 18 m, is the town's south gate | the road crosses *into* Longacre here |
| **Hollow Ford** | +252 | no structure — a shallowed, widened channel | 26 m wide, 0.45 m deep, stepping stones, wade-able |
| **Blackspan** | +348 | single high arch, 30 m span, 14 m above the water | over the head of the gorge |

**How a ford works mechanically.** No new system: `CHANNEL(x)` drops to 0.45 m across a 40 m band,
`creekHalf(x)` widens to 13, and the road ribbon (`addPath`) runs straight through. The player walks
on `terrain.surfaceY`, which at the ford is 0.45 m below the water line — so he walks *through* the
water and the existing depth-based alpha ramp in `buildWater` does the rest. A slow-down volume and
a splash are `SYSTEMS.md`'s call. There is one thing to check: `heightAt`'s channel profile
(`h = wy − CHANNEL·(1 − (d/half)^1.7)`) already handles a shallow channel correctly; nothing else
in `heightAt` needs to know a ford exists.

Between the Hollow Ford and Blackspan the road runs 110 m along the **south** bank, round the base
of Ashen Crag. That is deliberate: ford → south bank → high bridge is a three-beat sequence and it
is the most memorable 25 seconds of the King's Road.

### 4.4 Roads

Two, both splines, both registered with `terrain.addPath()`.

- **The King's Road** — Whitewall east gate (−400, −66) → Longacre (in the south gate, up the High
  Street, out the Ash Gate) → Blackstone west gate (405, −80). 1078 m, half-width 9 m outside towns
  (`roadWidth` 18), 1.17 sinuosity.
- **The Drove Road** — a northern bypass across the moor, Whitewall north gate to Blackstone north gate,
  1088 m, half-width 4 m, unmetalled. It exists so there is a second way to travel and a reason for
  the North Moor to have anything in it.
- **Spurs** — three, one per town, joining the two roads. Plus farm tracks around Longacre.
- **Milestones** every 100 m on the King's Road: a small carved stone with a direction. This is the
  navigation aid instead of a minimap and it costs about 12 `mass` objects.

### 4.5 What has to change in the terrain code

**`heightAt(x, z)`** — currently `wild()` + a town-pad flattener + the creek cut, all analytic and
all evaluated per vertex.

- `wild()`'s ridge terms are hardcoded to the current map (`smoothstep(-50,-100,z)`,
  `smoothstep(60,112,z)`, `smoothstep(104,152,|x|)`). They must be replaced with a **region
  profile**: a west chalk uplift, a central valley, an east basalt ridge, and north/south moor and
  meadow terms, all sized to the 1440 × 720 world.
- `townMask` / `padAt` / `CENTERS` / `DISTRICT_W` — the three-district assumption is baked into
  `terrain.js:10-11` and reads through into `scene.js`, `demoScene.js` and `player.js`. All of it
  goes. Towns become a data list with a centre, a half-extent and a pad height; `townMask` becomes a
  max over that list. Blackstone's mask needs a **three-step pad** rather than one level, which is a
  genuine new capability, not a rename.
- **Ridge and furrow** in Longacre's fields is a `heightAt` term, not geometry: a 0.35 m
  amplitude, 7 m period corrugation aligned to each strip's own direction, masked to the strip
  polygons. Cheap, and it is the single thing that will make the farmland read as farmland.
- `heightAt` is called ~5× per rendered vertex (once directly, four more inside `slopeAt`) and
  every extra term is paid five times over the whole world. **Cache `slopeAt` off the already-built
  height grid instead of re-evaluating `heightAt`** — a free 4× saving on terrain build time that
  should happen in the same pass.

**`addPath`** — works as-is, but it rasterises into the GS-grid at 1 m steps along the polyline and
over a `halfWidth`-square kernel. At 1078 m of road and a 9 m half-width that is ~350k cell writes
per road. Fine at boot, but the grid resolution has to change (§6.4) and `addPath` must take the
new GS.

**`buildWater`** — the biggest single change. Today it walks `x` from `X0` to `X1` in 2.6 m steps
and takes the cross-section at each. Over 1440 m that is 554 stations × 11 cross = 6094 verts,
11k triangles for the whole river, always drawn. That is affordable, but the whole thing is one
mesh with no culling. It must be **split into ~10 along-stream segments** so frustum culling works,
and the arc-length parameterisation (`creekArc`) must be built once over the whole river and shared.

Because the river now genuinely meanders, the 2.6 m along-stream step is measured in *x*, not in
arc length — on a bend where `dz/dx` is 1.5 the real spacing is 4.7 m and the bank goes faceted.
Step along **arc length** instead.

**The bank problem, and the fix that also solves the terrain budget.** `NOTES_TERRAIN.md` §1 is
emphatic: a 10 m channel sampled on a 2.9 m grid is not in the rendered mesh, which is why the
current terrain has a 1.15 m row band bolted across `z ∈ [33, 79]`. That trick is *separable* — a
fine band in Z is fine at all X — and it cannot follow a river that wanders 200 m in z.

The fix: **build the river's banks as a ribbon in (arc length, cross offset) space**, exactly the
way `buildWater()` already parameterises the water surface. One mesh, cross stations bunched toward
the channel, 400 along-stream stations × 21 cross = 8400 verts ≈ 16k triangles for the entire
1440 m of river at high fidelity, everywhere, permanently. The coarse world mesh then does not need
to know the river exists — see §6.2. This reuses machinery that is already written and tested and
it is the single best idea in this document.

---

## 5. Engine change plan

Ordered. Each phase is independently shippable and independently verifiable. Do not start a phase
until the previous one is green on the gate.

### Phase 0 — Instrument and freeze the baseline

**Files:** `tools/shot.mjs`, `tools/ratio.mjs`, a new `tools/budget.mjs`.

Before anything moves, get a per-system triangle attribution that survives the whole project: how
many triangles are ground / water / roads / buildings-by-surface / foliage-by-kind / decals /
people, at the mobile profile, for each of the five scenarios. `renderer.info` gives totals;
`budget.mjs` walks the scene graph and sums by `mesh.name`.

**Why first:** §6 spends a budget that nobody currently knows the breakdown of. Every number in §6
is an estimate derived from `NOTES_TERRAIN.md` and the shot JSONs, and every one of them should be
replaced with a measurement before a line of world code is written.

**Verify:** a committed `docs/BASELINE.json`, and the five scenarios re-rendered unchanged.

**Breaks:** nothing.

### Phase 1 — The scale pass (K = 1.5)

**Files:** `world/buildings.js`, `world/interior.js`, `world/stairs.js`, `world/doors.js`,
`world/colliders.js`, `world/terrain.js` (decals only), `editor/scene.js`, `editor/build.js`,
`player.js`.

Every number in §2.8, in **one commit**. A half-scaled world is worse than either end: a 1.5× house
with a 1× door does not fit a player through it, and a 1.5× plinth with a 1× step-up locks every
door in the game.

The demo scene's own coordinates do **not** scale in this phase. The three districts stay 70 m
apart and will look absurdly crowded. That is fine and expected — Phase 1 proves the *kit* scales,
and Phase 8 replaces the layout entirely.

**What could break:**
- `plinth` 0.66 > `stepUp` 0.62 → every door unreachable. Covered, but it is the one that will bite.
- `stairs.js` — the scripted climb has a history of failing silently (`NOTES_INTERIORS.md`).
- `interior.js` `apH = min(leafH − 0.135, roomH − 0.36)` — if either clamp bites, the doorway
  aperture stops matching the leaf and you get a hole to the sky from inside the room, which is the
  exact failure `NOTES_INTERIORS.md` §4 warns about.
- Roof pitch is clamped to `wallTop * 0.95`; at h = 27 (the new tower-adjacent max) a roof can be
  25 m tall on its own. Check the `spanW * 0.85` clamp still governs.

**Verify:**
1. `node tools/shot.mjs --all` — look at every PNG. Nothing floats, no doorway shows sky.
2. `__forge.doors.trigger(i)` for **every** door in the demo, in and out, all three zones.
3. `__forge.doors.triggerStair(true/false)` on every two-storey house.
4. A headless walk soak: 200 random positions, walk 20 m, assert never inside a collider box and
   never below terrain.
5. Re-run the arm soak from `NOTES_INTERIORS.md` §1 (21 doors × 12 headings × 3 distances) with the
   new constants; target is still zero cases of the camera inside a building.
6. Perf: expect **no triangle change**. If the count moves, something got rebuilt wrongly.

### Phase 2 — Camera fit and the ceiling collider

**Files:** `player.js`, `world/doors.js`.

The `player.js` constants from §2.7 and the ceiling collider. Split from Phase 1 so that if the
new camera feels wrong it can be reverted without unwinding the scale.

**Verify:** stand in each zone's default room, sweep pitch from min to max, screenshot at both ends.
The camera must never see the outside of the shell. Measure the core fraction empirically: sample a
grid across the room floor, record the achieved arm length at each, report the percentage at full
length. Target ≥ 60 % per axis.

**Sign-off gate:** Aaron has to *feel* this one. The outdoor arm going 6.2 → 8.0 is a real change in
how the game plays and no test can decide it.

### Phase 3 — World extents

**Files:** `player.js`, `world/terrain.js`, `world/lighting.js`, `engine/quality.js`.

- Delete the hardcoded `clamp(pos.x, −145, 145)` / `clamp(pos.z, −100, 108)` at `player.js:170-171`;
  replace with bounds exported from `terrain.js`.
- `X0/X1/Z0/Z1` → −720/+720/−400/+320.
- **Audit everything else sized to the old world:**

| thing | now | at 1440 × 720 |
|---|---|---|
| `camera.far` | `viewDist × 3` = 540 at medium | fine — fog kills the world at ~300 m |
| Camera `far` ceiling | 2000 (`app.js:38`) | fine |
| `FogExp2` density | `1.15 · amt / max(40, viewDist)` = 0.0064 | **fine, and it is the culling budget** — see §6.1 |
| `shadowDist` | 80 at medium | **→ 60** (§2.8) |
| Shadow fit radius | `min(shadowDist, 85, cam.far)` | fine |
| `CAMERAS` / `nearCamera` / `inCorridor` | keep-outs sized in tens of metres | still correct, but the five scenario positions all move |
| Occupancy grid `GS = 1` | 301 × 225 = 68k cells | **1.21 M cells at GS 1** — see §6.4 |
| `WALK.cell` broadphase | 8 m | → 12 m (§2.8) |
| `Colliders.hit()` | iterates **all** boxes, unindexed | at 550 objects this is 550 slab tests/frame; index it against the same cell grid `walkStep` uses |

**Verify:** walk to all four corners. Assert the ground exists, the fog closes, nothing NaNs, and
the frame time at the map edge matches the frame time at the centre.

### Phase 4 — Terrain rebuild

**Files:** `world/terrain.js` (substantially rewritten), `world/scatter.js`, `world/demo.js`.

The chunk/patch scheme in §6.2. This is the largest single piece of work in the plan and it is
where the schedule risk lives.

**Breaks:** everything that reads `heightAt`, `surfaceY`, `CENTERS`, `DISTRICT_W`, `zoneAt`,
`townMask`, `ao()`, `blocked()`. That is `player.js`, `colliders.js`, `build.js`, `demoScene.js`,
`scatter.js`, `people.js`, `chicken.js`, `doors.js`, `spell.js`.

**Verify:** `surfaceY` and `heightAt` must agree to within 5 cm everywhere in a patch (the existing
comment at `player.js:103-107` exists because they once did not, and the feet sank). Sample 10k
random points and assert. Then walk the whole King's Road with the headless walker and assert the
feet never leave the ground and no patch seam produces a step.

### Phase 5 — River and roads

**Files:** `world/terrain.js`, `world/water.js`, `editor/build.js`.

§4. The spline `creekZ`, `CHANNEL(x)`, three-reach `waterY`, the arc-length bank ribbon, the
segmented water mesh, the four crossing types.

**Verify:** a cross-section dump every 20 m of river — bed depth, water line, bank height — asserted
monotonic and continuous. Walk the ford and assert the player's y goes below `waterY` and comes back.
Render the four crossings.

### Phase 6 — Document schema v3

**Files:** `editor/scene.js`, `editor/build.js`, `editor/editor.js`, `editor/store.js`,
`world/colliders.js`, `world/doors.js`.

```jsonc
{
  "version": 3,
  "towns": [{
    "id": "fallowmere", "zone": "neutral", "label": "Longacre",
    "cx": 0, "cz": 40, "hw": 130, "hd": 110,
    "pad": [2.0],                  // one entry per terrace; Blackstone has three
    "plan": "linear",              // linear | radial | switchback — authoring hint only
    "streets": [{ "pts": [[x,z],…], "width": 18, "kind": "principal" }],
    "kerbs": [...], "dressSeed": 0
  }],
  "water": { "riverCP": [[x,z],…], "reaches": [...], "crossings": [...] },
  "roads": [{ "id": "kings", "cp": [[x,z],…], "width": 18 }],
  "objects": [{
    "id": 1, "town": "fallowmere",   // was `dist`
    "blk": 4,                        // NEW: street block, drives batching and LOD
    "lod": "full",                   // NEW: full | proxy | auto
    "zone": "neutral", "type": "house", "x": …, "z": …, "ry": …, "seed": …, "p": {…}
  }]
}
```

`districts` → `towns`, `dist` → `town` (a string id, not an index — an index into a list you are
editing is a bug waiting to happen), `road` → `streets` (plural), plus `blk` and `lod`. `bridge`
moves out of the town record and into `water.crossings`, because crossings exist outside towns.

The v2→v3 migration is straightforward: three districts become three towns, `dist: n` becomes
`town: ZONE_IDS[n]`, `blk` is computed from a spatial grid, `lod` defaults to `auto`. Keep it —
`normalise()`'s migration chain is good and refusing to migrate throws away the demo scene.

**`blk` should be computed, not authored.** A 60 m spatial grid over the town, assigned at load.
One less thing for a human to get wrong, and it re-derives correctly when a building is moved.

**Verify:** load the v2 demo, assert it migrates and renders identically to before. Round-trip
export/import. Feed `normalise()` deliberately broken documents.

### Phase 7 — LOD, culling and town streaming

**Files:** `editor/build.js`, `world/scatter.js`, a new `world/streaming.js`.

§6.3. Per-block detail/proxy meshes, distance and frustum culling, player-centred foliage, and the
town-resident swap.

**Verify:** a headless traverse of the King's Road end to end, sampling draw calls and triangles
every 10 m, producing a graph. The gate must hold at **every** sample, not at five hand-picked
camera positions. This is the single most valuable test in the project and it should be built here
and then run in every subsequent phase.

### Phase 8 — Author the three towns

**Files:** `editor/townGen.mjs` (new, node-only), `data/world.json` (new, committed).

§7. Generate, hand-tune, freeze.

### Phase 9 — Gate re-verification on the phone

Headed, `--preset=medium --dpr=1 --w=844 --h=390`, plus Aaron's actual phone, which
`forge_test/CLAUDE.md` correctly calls "the only number that has ever been stable".

### 5.10 Sign-off required — rules this plan bends

Nothing in this list gets built before Aaron answers.

**A. `zones.js` is frozen; this needs additive fields.** The three towns must differ by more than
material, and the rule says a zone differs "by material and by small roofline additions". Requested
additions, all additive, none renaming or removing anything:

```js
town: {
  plan: 'radial' | 'linear' | 'switchback',
  walled: true | false,
  streetWidth: { principal: 18, secondary: 12, lane: 8, alley: 5 },
  terraceRise: 3.5,             // 0 = flat town
  landmarkHeight: 58,
},
roof:   { overhang: 0.83 },     // requested in NOTES_BUILDINGS.md and never added
window: { density: 1.0 },       // requested in NOTES_BUILDINGS.md and never added
interior: { ceiling: 1.0 },     // per-zone multiplier on the derived room height
```

**B. "Same building blocks in every zone" versus a mill, a market cross and a granary.** Longacre
needs a watermill with a turning wheel, a market cross and drystone field walls. Whitewall needs a
cloister arcade. Blackstone needs a switchback retaining wall. None of these exist in the kit, and
writing them as `if (town === 'fallowmere')` inside `buildings.js` is exactly the thing the rule
forbids.

**Proposed resolution:** add them as **new `TYPES` in the scene document** — `mill`, `barn`, `pen`,
`cross`, `arcade`, `retaining` — each built from the existing `details.js` parts, each taking
`zoneId` and reading its materials and roofline from `zones.js` like everything else. A dark-zone
mill is then a completely legal object that simply is never placed. That keeps the letter and the
spirit of the rule: the difference lives in the *document*, which is data, not in geometry code.
It needs a v3 schema entry per type and it is real work. **Aaron's call.**

**C. The perf gate cannot be held without cutting foliage.** §6.1. The current single-town build is
already at 350k triangles. Three towns need the grass budget roughly halved and made
player-centred. This is a visible change to the thing the critic scores hardest on (grounding,
20 %). Numbers in §6.

**D. There is no scene-rebuild hook, so half the new tunables cannot be knobs.** `CLAUDE.md` says
everything tunable is a registered knob; `NOTES_BUILDINGS.md` says `TUNING` is not a knob because
changing it needs a scene rebuild that `buildings.js` cannot trigger. K, the street widths, the LOD
radii and the chunk sizes are all in that category. **Proposal:** `quality.register` gains an
optional `rebuild: true` on the schema, and `main.js` owns a debounced world rebuild. That is a
change to the knob contract and therefore needs approval.

**E. GPU buffer memory is not tracked.** `budget.js` tracks textures only. A resident town's merged
geometry is roughly 19 MB of vertex buffers and there will be moments during a town swap when two
are resident. The 60 MB texture budget says nothing about this. **Proposal:** extend `budget.js` to
track buffer bytes as a second, separately-gated number. Additive.

---

## 6. Performance plan

> **Measured at Phase 0 (`tools/budget.mjs` → `docs/BASELINE.json`).** Every estimate below that a
> measurement replaced has been replaced. Where an original estimate is still shown it is marked as
> such. The walk reconciles with `renderer.info`'s main pass to within 0.01 % on all five scenarios,
> so the attribution can be trusted.

### 6.1 The honest starting position

Measured at the gate profile — `--preset=medium --dpr=1 --w=844 --h=390`, headless:

| scenario | main calls | main tris | total tris, `shadowRate` every frame |
|---|---|---|---|
| `wall_day` | 69 | **301.3k** | **517k** (216k of shadow) |
| `street_dusk` | 68 | **300.0k** | **516k** |
| `gate_night` | 40 | **189.4k** | **329k** |
| `town_night` | 67 | **298.7k** | **517k** |
| `creek_day` | 66 | **296.9k** | **516k** |
| The gate | 150 | — | **350k total**, 60 MB textures, GPU p95 11 ms, CPU p95 6 ms |

**Correction to the earlier reading.** The 350,393-triangle figure quoted for `street_dusk` is not
reproducible and appears to have been a shadow-inclusive total read as a main-pass count. The main
pass is **300k**, not 350k, which is 14 % of margin rather than none.

**The conclusion does not change, and gets worse.** The shadow pass is a flat ~216k on any frame
that rebuilds the map, so the demo runs at **516k total against a 350k gate — 47 % over** — and the
only reason the five scenario JSONs do not all say so is that `shadowRate` makes the captured frame
bimodal, so which number you get depends on which frame you landed on. Three real towns is not 3×
this. There is no headroom to spend, and **the first place to look for it is the shadow pass, not
the main one**: 216k of shadow re-draws 72 % of the main pass for one 1024² map, and §6.5 budgets
it at half that.

Phase 1 then took the main pass to **268k** at the same profile — the scale pass is a triangle
*saving*, see the note at the end of §2.8. `docs/BUDGET.json` carries the post-A1 reading in the
same shape as the baseline.

**The one enormous free gift is fog.** At the medium preset the density is
`1.15 / max(40, viewDist=180) = 0.00639`, and `FogExp2` gives:

| distance | fog opacity |
|---|---|
| 100 m | 33 % |
| 200 m | 80 % |
| 250 m | 92 % |
| 300 m | 97.5 % |
| 400 m | 99.85 % |

**Nothing beyond ~300 m contributes a visible pixel at the mobile preset.** The world can be
1440 m across and the renderer only ever has to draw a 300 m bubble. The entire perf plan is: stop
drawing what the fog has already erased. That is not a cheat, it is the fog doing its job — the
current build simply draws all of it anyway because the world is small enough to get away with it.

The cull radius must be **driven off `viewDist`**, not hardcoded, or the high (260) and ultra (400)
presets will show the world ending.

### 6.2 Terrain: patches, a coarse world, and a river ribbon

Three kinds of ground mesh, all static, all built at boot.

| mesh | resolution | extent | triangles | drawn when |
|---|---|---|---|---|
| **Coarse world** | 12 m | 1440 × 720, split 3 × 2 for culling | 16.8k total, ~2800/piece | always; ~3 pieces pass frustum → **8.4k** |
| **Town patch** ×3 | 2.5 m | 340 × 300 each, split 3 × 3 | 32k each, ~3.6k/piece | within 260 m; ~4 pieces visible → **14k** |
| **River ribbon** | arc-length, cross-bunched | the whole 1440 m of river, 10 segments | 16k total, 1.6k/segment | ~2 segments visible → **3.2k** |

Total ground in a typical frame: **~26k triangles, 5–9 draw calls.** For comparison the current
300 × 224 m world costs 15k in one mesh. Twenty-one times the area for 1.7× the triangles.

Three details that make it work:

1. **The coarse mesh does not know the river exists.** Build it from `heightAt` *without* the
   channel term, so it is a smooth natural surface; the ribbon carries the trench. A 12 m grid
   cannot represent a 9 m channel anyway (`NOTES_TERRAIN.md` §1 is the whole story) and pretending
   otherwise is how the current build ended up with water lying on grass.
2. **Skirts, not stitching.** Every patch and every ribbon drops its outermost row 0.20 m below the
   true surface, so it always tucks *under* the coarse mesh at the seam. Trying to make two grids of
   different resolution agree exactly on a slope is a losing game; a skirt hides the crack and costs
   one extra row.
3. **`slopeAt` reads the height grid, not `heightAt`.** Today `slopeAt` calls `heightAt` four times,
   and `buildGround` calls both, so every terrain vertex costs five `heightAt` evaluations. Central
   differences on the already-computed grid are free. Over 80k vertices of new terrain this is the
   difference between a 400 ms and a 100 ms boot.

Boot cost: 3 patches (~14k verts each) + coarse (8.5k) + ribbon (8.4k) ≈ 59k `heightAt` evaluations,
~120 ms. Acceptable at boot, and Blackstone's patch can be deferred until you first go east.

### 6.3 Buildings: blocks, proxies, and one resident town

Each town is partitioned into **~10 street blocks** on a 60 m spatial grid. Each block is built
twice at boot:

- a **detail** mesh set — the real `house`/`tower`/`wallRun` geometry, 4–5 merged meshes;
- a **proxy** mesh set — every object in the block as a `mass` silhouette, 1 merged mesh, no
  windows, no dormers.

At runtime the LOD is a `.visible` flip per block. **No rebuild, no hitch, no merge on the fly.**

| player distance to block | shown |
|---|---|
| < 70 m | detail |
| 70 – 260 m | proxy |
| > 260 m or outside frustum | nothing |

Only **one town is resident at a time.** The other two hold proxy geometry only, at a whole-town
level (one merged skyline mass, ~3k triangles), so a distant town still reads as a town on the rare
preset where the fog lets you see it. Crossing the midpoint of a march triggers building the next
town's detail geometry, time-sliced over ~90 frames during the approach — you have 50 seconds of
walking to do 1.5 seconds of work in.

Per-building cost, **measured at Phase 0** by building each object alone and counting it
(`tools/budget.mjs`; full data in `docs/BASELINE.json`). The estimates this replaces were badly
wrong in one direction — towers and wall runs are between a third and a sixth of what was assumed:

| type | Phase 0 estimate | **measured** |
|---|---|---|
| `house`, detailed, K = 1 default 8 × 7 × 6 | ~6 000 | **3 200** |
| `house`, detailed, K = 1.5 default 12 × 10.5 × 9 | — | **4 900** |
| `house`, demo objects (n = 21, 8–17 m wide) | — | **5 600 mean**, 3.3k–9.3k |
| `tower`, demo objects (n = 9) | ~14 000 | **3 700 mean**, 2.0k–5.3k |
| `wallRun`, 60 m × 12 × 3.6 | ~25 000 | **4 100** |
| `mass` / proxy | ~250 | **250** (demo mean 207) |

And the objects §3 actually specifies, which is what the town budgets should be built from:

| object | triangles |
|---|---|
| The Lantern Spire — `tower` r 9, h 58 | **4 700** |
| The Black Keep — `tower` r 11, h 52, sides 8 | **3 100** |
| The Granary — `tower` r 5, h 20 | **2 400** |
| Whitewall precinct wall, 130 m × 12 × 3.6 | **9 900** |
| Blackstone curtain, 115 m × 15 × 4.5 | **7 600** |
| The Sanctum — `house` 34 × 26 × 16 | **23 200** |
| The Tithe Barn — `house` 40 × 18 × 15 | **11 400** |

**The cost driver is façade area, not height.** A tower is a ring of a dozen flat panels however
tall it is, so the 58 m spire is cheaper than a 12 m cottage row; a `house` spends its triangles on
window openings, and the slot count scales with the wall span, so the Sanctum alone costs five
detailed houses. Budget the big *enterable* buildings, not the landmarks.

A town of ~160 objects — 100 `mass` at 250, 45 `house` at the 4 900 default, 10 `wallRun` and
5 `tower` — comes to **~305k** of detail geometry against the ~200k projected. The projection was
low because it costed houses at 6k but assumed far fewer of them. Visible at once: ~12 detailed
buildings within 70 m plus a landmark, ~80 proxies beyond.

### 6.4 Foliage: the cut, and why it is the right cut

**Corrected at Phase 0.** Foliage measures **78.1k** triangles at the medium preset, of which
**grass is 44.6k**. The 90k / 73k figures were the *high* preset read as medium: `medium` sets
`foliage: 0.6` and `scatter.js` thins every instanced mesh live against it, so a third of the grass
the notes counted is already not being drawn. The saving available from the cut is therefore
**~21k, not ~49k** — still the largest single item after buildings, but it does not on its own pay
for a second town.

Foliage is still the largest non-building line item, and it is spent on grass you
cannot see: `scatter.js` currently weights placement toward the five *scenario cameras*
(`camDist`, `smoothstep(132, 28)`) because "the map is 300 × 224 m; spreading a 3050-instance budget
evenly buys one clump per 20 m²".

In a 0.87 km² world that approach does not survive contact. The fix is the same idea aimed at the
player instead:

- One zone's foliage kinds are live at a time (you are in one town's region), not three. **Saves
  two thirds of the instanced meshes and two thirds of the draw calls.**
- Grass instances are re-placed around the player rather than distributed over the map: a 3000-
  instance budget over a 60 m radius is one clump per 3.8 m², which is *denser* than today, not
  sparser. Re-scatter on a 20 m player movement threshold, writing into the existing
  `InstancedMesh` matrices — which `scatter.js` already does per-frame for canopies
  (`mesh.count = n` at line ~1017), so the machinery exists.
- Trees and rocks are world-placed and stay, culled by distance.

| | now (measured, medium) | planned |
|---|---|---|
| Grass | **44.6k** (3 zones) | **24k** (1 zone, player-centred, denser where it shows) |
| Bush | **10.8k** | |
| Rock | **5.4k** | |
| Canopy (`leaf0/1/2` + `cone`) | **11.7k** | |
| Trunk (`bark0/1/2`) | **3.6k** | |
| Flower | **2.0k** | |
| Everything but grass | **33.5k** | **16k** |
| **Foliage total** | **78.1k** | **40k** |
| Foliage draw calls | ~24 | **~8** |

**This is change C in §5.10 and it needs sign-off**, because grounding is 20 % of the critic's
rubric and grass is most of grounding. The argument for it: nothing is lost within 60 m of the
player, which is the only place a phone screen can resolve a grass blade, and 50k triangles is the
difference between shipping three towns and shipping one.

### 6.5 The frame budget

First, **what the current demo actually spends**, measured at Phase 0 (`street_dusk`, medium,
844 × 390 — the four daylight scenarios are within 2 % of each other because almost nothing culls):

| system | triangles | note |
|---|---|---|
| Buildings — `wall` | 94.6k | |
| Buildings — `trim` | 72.3k | |
| Buildings — `glass` / `roof` / `crest` / door leaves | 13.6k | |
| **Buildings, total** | **180.5k** | 60 % of the main pass |
| Foliage | 78.1k | §6.4 |
| Ground | 15.3k | one mesh, never culled |
| Contact AO decals | 8.8k | |
| People + chickens + their contact discs | 13.3k | |
| Water + reflection | 2.6k | |
| Roads | 1.6k | |
| **Main pass** | **300.0k** | 68 calls |
| Shadow pass | **216k** | 45 more calls |
| **Total** | **516k** | against a 350k gate |

Two things this says that the projection below does not. **`wall` + `trim` is 167k of 300k** — the
merged district batches are the frame, and `trim` (string courses, corbels, quoins, barge boards,
sills) costs 80 % of what the walls themselves do. And **frustum culling currently returns almost
nothing**: a district merges into five meshes spanning the whole district, so their bounding
spheres intersect every frustum and 301.3k of the 301.8k resident triangles are drawn in `wall_day`.
That is the strongest argument in this document for §6.3's per-block partition — the culling is not
underperforming, it is structurally absent.

Now the projection. Standing in Longacre's market square, medium preset, 844 × 390.

| system | triangles | draw calls |
|---|---|---|
| Town patch (4 of 9 pieces) | 14 000 | 4 |
| Coarse world (3 of 6 pieces) | 8 400 | 3 |
| River ribbon (2 segments) | 3 200 | 2 |
| Water surface | 4 000 | 1 |
| Roads | 3 000 | 3 |
| Contact AO decals (resident town only) | 2 000 | 1 |
| Buildings — 12 detail blocks-worth within 70 m | 72 000 | 5 |
| Buildings — 1 landmark tower | 14 000 | 1 |
| Buildings — ~80 proxies, 70–260 m | 20 000 | 3 |
| Foliage (§6.4) | 40 000 | 8 |
| People + chickens | 14 000 | 3 |
| Door leaves, sky, spells, misc | 6 000 | 5 |
| **Main pass** | **200 600** | **39** |
| Shadow pass (casters within `shadowDist` 60 m) | ~110 000 | ~14 |
| **Total** | **~311 000** | **~53** |
| Gate | 350 000 | 150 |
| **Margin** | **11 %** | 65 % |

Draw calls are comfortable. **Triangles are the gate and always were.** 11 % of margin is thin —
it is one bad street away from failing, which is why the Phase 7 traverse test samples every 10 m of
the King's Road rather than trusting five hand-picked camera positions.

**Two rows of this projection are not supported by the Phase 0 measurement and should be treated as
open, not as budget.** The shadow-pass row assumes 110k at `shadowDist` 60; the demo measures **216k
at 80** over a world one twenty-first the area, and the shadow camera fits a radius rather than a
frustum, so it is not obvious that 60 m buys the 49 % reduction assumed. And the decal row assumes
2k for a resident town; the demo's 82 objects already cost **8.8k**, which puts a 160-object town at
~17k. Between them that is up to 120k of unbudgeted triangles against 34k of margin. Re-derive both
at Phase 7 from a real traverse before any content is authored against this table.

Texture memory: 54.2 MB today against a 60 MB budget. The new work adds **nothing** — every new
object type reuses the existing `getMaterial` surfaces, and stained glass is already built lazily
per zone visited. The only risk is if the three towns need more than three material sets, which they
must not.

Occupancy grid: at `GS = 1` over 1440 × 720 that is **1.04 M cells** — a 1 MB `Uint8Array`, a 4.2 MB
`Float32Array`, and a two-pass separable blur over a million cells at boot (~180 ms). Fix: **allocate
the grid per patch, not per world.** Only the three town patches and the road corridors need
occupancy at all; empty moorland needs none. That is ~120k cells total, and `GS` can stay at 1 where
it matters.

### 6.6 Honest risk assessment

**Can three towns at this fidelity hold the phone gate? Yes — but only with §6.3 *and* §6.4, and
only with about 11 % of margin.** If either the per-block LOD or the foliage cut is dropped, the
answer is no, by 50–70k triangles.

If it turns out not to hold on Aaron's actual phone, the things that give, in the order they should
give:

1. **`shadowDist` 60 → 45 m.** Saves ~35k of shadow-pass triangles for a barely visible loss.
2. **Detail radius 70 → 55 m.** Saves ~25k. Costs the mid-distance read of the street.
3. **A `detail` level on the `house` builder** — drop the dormer, bay, lean-to and quoins on any
   house not on a principal street. ~6k → ~3.5k each; saves ~30k. This is the first change that a
   critic would notice, and it is worth building the switch now even if it stays off.
4. **Three towns become two towns and a hamlet.** Blackstone's terracing is the most expensive
   geometry in the plan (three levels of retaining wall) and the least essential to the premise.
5. **Give up the 1.5× scale.** Do not do this. The scale is the fix for the actual reported
   problem; the perf work exists to pay for it.

**The three things most likely to go wrong that are not on this list:**

- **Fill rate, not triangles.** The gate has a GPU p95 of 11 ms and `CLAUDE.md` says plainly that
  the GPU timer here is not a trustworthy instrument. A 1.5× world means bigger, closer surfaces
  and more alpha-tested foliage overdraw per screen pixel near the camera. Triangle counts can be
  perfect and the phone can still miss 60 fps. **This can only be answered on the phone**, and it
  should be answered in Phase 2, before the world work, not in Phase 9.
- **Boot time.** 59k `heightAt` evaluations, three towns of merged geometry, a million-cell blur if
  §6.5 is skipped, and 550 collider boxes. The current build boots in ~2 s. If this becomes 8 s the
  game has a real problem that no frame-rate number will show.
- **The town swap.** Time-slicing a 200k-triangle merge over 90 frames sounds fine and will
  probably produce a 4 ms CPU spike on one of them. CPU p95 budget is 6 ms.

---

## 7. Level-editor impact

### 7.1 Where the editor is now

It edits one document with three districts assigned by nearest `cx`, by touching objects in the 3D
view, with the result in `localStorage`. `NOTES_EDITOR.md` is a good document and the editor is a
good editor — for 82 objects in a 300 m world.

Three towns is **~550 objects across 0.87 km²**. Nothing about touching things in a 3D view survives
that.

### 7.2 What it has to become

| need | why |
|---|---|
| **Top-down map mode** | orthographic over the whole 1440 × 720, pan/zoom, objects as footprints. You cannot navigate 1.4 km in a third-person view to move a building. This is the single biggest missing piece. |
| **Town list** | jump-to-town, per-town zone/plan/pad fields, and a resident-town swap so the editor only ever holds one town's geometry |
| **Row and terrace brushes** | drag a line, get a terrace of N houses with correct setbacks, kerbs and seeded variation. Placing 550 objects one at a time is not a thing a person will do. |
| **Multi-select** | select a block, move/rotate/duplicate/re-zone it as one |
| **Spline editors** | drag control points for the river and the roads, live-preview the ribbon |
| **Block overlay** | show the computed `blk` partition and the 70 m detail radius, so you can see what the LOD will actually do while you author |
| **File as the source of truth** | `data/world.json`, committed. localStorage stays as the scratch layer. A 550-object document is ~180 KB. |
| **A budget readout in the editor** | live triangle count for the resident town against the §6.5 line. Finding out you blew the budget in Phase 9 is finding out too late. |

### 7.3 Generated, hand-authored, or both — the recommendation

> **Generate once, hand-tune, then freeze the output and delete the generator from the pipeline.**

**Why not pure hand-authoring.** 550 objects on a touch editor is weeks, and 90 % of them are
terrace infill whose exact position nobody will ever notice. The parts that must be hand-placed are
the ~40 objects that carry the composition: landmarks, the square, the bridge approaches, gate
sightlines, the skyline.

**Why not pure generation.** A generated town reads as generated. Requirement 2 from the owner is
that each town "should read as designed, not scattered", and the thing that makes a town read as
designed is the twenty deliberate decisions a generator cannot make — the barn that closes the
square's north side, the alley that frames the spire, the house that is slightly wrong so the row
looks old.

**Why freezing matters more than either.** `demoScene.js` already proves a generator can emit a
plain document, and `seedDocument()` already proves the output can be stamped so it never re-rolls.
The failure mode to avoid is the obvious one: hand-tune the town, then tweak the generator, then
lose the tuning. So:

1. `tools/townGen.mjs` — a **node script, not a runtime module** — reads a town spec (centre,
   extent, plan style, street splines, a seed) and writes objects into a document.
2. Run it once per town. Commit the output to `data/world.json`.
3. Hand-tune in the editor. Commit again.
4. **The generator is now dead.** It stays in the repo as documentation of how the towns were laid
   out; it is never run against a tuned file again. Re-running it is a deliberate act that starts a
   town over.

This is exactly the `demoScene()` → `seedDocument()` pattern that already exists, promoted from a
runtime convenience to the authoring pipeline.

### 7.4 What the generator is good at, per town

| town | generator does | human does |
|---|---|---|
| Whitewall | the four radial avenues, two ring streets, six terraces of infill, wall runs between gates | spire and sanctum placement, the sanctum yard's proportions, gate sightlines, the cloister |
| Longacre | High Street frontage, back lanes, field-strip geometry, four farmsteads, outbuilding clutter | the square's four edges, mill and bridge, tithe barn, granary, the moment you come over Millbridge and see the square |
| Blackstone | three terraces of infill, the switchback, retaining walls, undercroft alleys | keep and bailey, the gorge walk, every point where you can see down onto a lower terrace |

---

## 8. Open questions for Aaron

Only the things I cannot decide alone.

1. **`zones.js` additions — approved?** §5.10-A. Six additive fields. Without them the three towns
   differ only in material, and "three entire towns" collapses back into three districts wearing
   different paint.

2. **New scene `TYPES` for mill / barn / pen / cross / arcade / retaining — approved?** §5.10-B.
   This is the honest way to give Longacre a mill without writing a town check into `buildings.js`.
   The alternative is that Longacre has no mill, and the requirement says it needs one.

3. **The foliage cut — approved?** §6.4. Grass from 73k to 24k triangles, player-centred instead of
   camera-centred. Nothing is lost within 60 m. It is 50k triangles, and without it three towns do
   not fit. But grounding is 20 % of the critic's rubric and this is the system that does grounding.

4. **Is the game landscape-only?** The gate profile is 844 × 390 and there is no orientation
   handling anywhere. Every camera number in §2 assumes it. **In portrait the horizontal FOV drops
   from 96.8° to 27.1°** and the entire scale derivation has to be redone — a portrait player would
   need rooms roughly twice as wide again. If portrait is ever a target, say so now.

5. **Outdoor camera 6.2 → 8.0 m — does it feel right?** §2.7. The maths says a 1.5× world needs a
   longer arm; only you can say whether the game still feels like the same game. Worth a build in
   Phase 2 before any world work starts.

6. **Blackstone's 9 m terraces — accept the camera risk?** §3.3. A stepped town is the most interesting
   place to move through in the plan and the worst case for the spring arm. It may need a per-town
   camera profile. If you would rather not take the risk, Blackstone becomes a two-level town with 4.5 m
   steps and loses some of its character.

7. **Where does the player start, and does the game open in a town or on the road?** It changes
   which town is built first, which determines the order of Phases 8 and 9. Probably a `STORY.md`
   question, but it lands on my schedule.

8. **The 1.5× scale is world-wide and permanent.** Every saved scene, every screenshot, every number
   in the existing notes becomes historical the moment Phase 1 lands. Confirm before it starts.
