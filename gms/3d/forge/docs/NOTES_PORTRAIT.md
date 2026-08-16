# NOTES_PORTRAIT — portrait as the primary orientation

Aaron overrode the "landscape only" row in `CLAUDE.md`: *"I think it needs to be portrait mode
designed but also support landscape in both desktop and mobile, it may mean making roofs even
higher? I just prefer it."*

This is the record of how that was done, what was measured, and what was rejected. The headline is
smaller than the brief expected:

> **The whole camera change is one line of projection maths. `dist`, `height`, `camPitch`,
> `distIn`, `heightIn`, `pitchMaxIn`, `armMin` and `camRadius` are all unchanged, and so is every
> building. Roofs do not need to be higher.**

## 0. What changed

| file | change |
|---|---|
| `js/engine/fov.js` | **new.** `fovFor(aspect)` — the policy, pure, node-testable. |
| `js/engine/fov.test.js` | **new.** six assertions on the policy. |
| `js/engine/app.js` | `resize()` sets `camera.fov` from the aspect; `setFov`/`applyFov`; a `fov` knob. |
| `js/scenarios.js` | `frameCamera` calls `app.setFov(fov)`, so a scenario's `fov` is a short-axis field too. |
| `js/game/session.js` | `rotate()` no longer pauses or builds a card. |
| `js/game/game.css` | `.g-rotate` deleted; one `@media (orientation: portrait)` block. |

Nothing in `js/player.js`, `js/world/zones.js`, `js/world/interior.js`, `js/world/buildings.js`,
`js/editor/*` or any authored town was touched. `node --test` — **548 pass, 0 fail.**

---

## 1. The problem, measured

`three`'s `PerspectiveCamera.fov` is the **vertical** field. `app.js` fixed it at 55° and `resize()`
only ever wrote `aspect`, so the *horizontal* field was whatever the window happened to give:

| viewport | aspect | vFOV | hFOV |
|---|---|---|---|
| 844 × 390 | 2.164 | 55° | **96.8°** |
| 390 × 844 | 0.462 | 55° | **27.1°** |

96.8° is the number `WORLD.md` §2.1 measured and §2.4 solved the 10 m house minimum against. At
27.1° the street's own frontages are outside the frame: at the north-gate stand point the flanking
faces sit 10.5 m to each side of a camera 2 m behind them, which is **79° off axis** — no field
short of 158° reaches them. Portrait cannot show the buildings you are standing between. It can
only show the ones further down the street.

`shots/pt/ng_P55/street_dusk.png` is that frame: one wall on the right, nothing on the left, and a
player filling a quarter of the height. `shots/pt/ng_L55/street_dusk.png` is the same stand point
in landscape and is a street.

---

## 2. The policy, derived

### 2.1 The framing algebra

Everything below is in tan-normalised screen coordinates (frame centre 0, top +1, bottom −1), for
an arm of length `D` at pitch `p`, an aim point `H` above the player's feet, a player `PH` = 1.75 m
tall, a vertical field `v` and an aspect `a`. Write `t = tan(v/2)` and `tₕ = a·t`.

```
horizon on screen        y_hor    = tan(p) / t
player's head on screen  y_head   = −(H − PH)·cos(p) / (D·t)
player's height, as a fraction of the frame      = PH·cos(p) / (2·D·t)
world width in frame at the player's own depth   W = 2·D·cos(p)·tₕ
top frustum edge, above horizontal               θ = v/2 − p
camera eye above the player's feet               E = H + D·sin(p)
```

Checked against the shipped landscape rig (`D` 7.2, `H` 2.10, `p` 0.26, `v` 55, `a` 2.164): sky
24.4 % of the frame, head 54.5 % down, player 22.6 % of frame height, `W` = 15.68 m, θ = 12.6°,
`E` = 3.95 m. Those are `WORLD.md` §2.1–2.4's numbers, so the algebra reproduces the derivation it
has to stay compatible with.

Two consequences fall straight out and they are the whole design:

- **`H` alone sets where the player sits in the frame; `p` alone sets where the horizon sits.**
  They are independent, because the aim point is the frame centre by construction.
- **`W · playerFraction = PH · a · cos²(p)`** — a constant for a given aspect. You cannot buy street
  width without shrinking the player, and vice versa. In portrait, `a` is 0.462 against 2.164, so
  the product is 4.7× smaller and *something* has to give. This is not a tuning problem.

### 2.2 The rule

Hold the field on **whichever axis of the viewport is shorter**.

```
a ≥ 1   →   vFOV = 55°                       (the short axis is vertical)
a < 1   →   hFOV = 55°, i.e. vFOV = 2·atan(tan(27.5°)/a)   capped at 100°
```

`js/engine/fov.js`. Three reasons it is this and not something else:

**It is the only rule that changes nothing for landscape.** Every aspect at or above square keeps
exactly the 55° the K = 1.5 derivation assumes. Desktop 16:9 keeps its 85.6° horizontal, the gate
profile keeps its 96.8°, ultrawide keeps its 101°. There is no regression surface at all above
`a = 1` — verified: `tools/shot.mjs --all` reproduces the five critic plates unchanged
(`shots/pt/critic/`).

**A phone's short axis is 390 px either way up, so rotating it resizes nothing.** The player is 88
CSS px tall in both orientations; a metre of world is the same number of pixels in both. Rotating
the device is a pure *reveal* of the long axis, which is what a rotation physically is. Any other
rule makes the world jump in scale when the phone turns.

**The frustum is literally the same solid, transposed.** At the gate pair the two frustums are
exact transposes of each other, so three quantities that matter are identical to the digit:

| | landscape 844×390 | portrait 390×844 |
|---|---|---|
| solid angle | 1.410 sr | **1.410 sr** |
| near-plane corner distance | 0.1594 m | **0.1594 m** |
| `lighting.js` shadow-fit `s = tan²(v/2)·(1+a²)` | 1.540 | **1.540** |

The near-plane figure is the answer to "does the camera clip through geometry in portrait": the
frustum's near corner reaches 0.159 m from the camera point in **both** orientations, comfortably
inside the unchanged 0.26 m `camRadius` the arm already keeps clear. Nothing about collision,
`armMin`, the ceiling collider or `camfit.mjs` is orientation-dependent — the arm is pure geometry
and only the projection turned.

The shadow figure is why the shadow pass costs the same either way (§4).

### 2.3 The numbers

| viewport | aspect | vFOV | hFOV | solid angle | near corner | shadow `s` | player px | `W` at the player |
|---|---|---|---|---|---|---|---|---|
| **landscape phone** 844×390 | 2.164 | 55.0° | 96.8° | 1.410 sr | 0.159 m | 1.540 | 88 | 15.68 m |
| **portrait phone** 390×844 | 0.462 | **96.8°** | 55.0° | 1.410 sr | 0.159 m | 1.540 | 88 | 7.24 m |
| **desktop** 1600×900 | 1.778 | 55.0° | 85.6° | 1.276 sr | 0.146 m | 1.127 | 203 | 12.88 m |
| ultrawide 21:9 | 2.334 | 55.0° | 101.1° | 1.458 sr | 0.166 m | 1.747 | 247 | 16.91 m |
| desktop 4:3 | 1.333 | 55.0° | 69.5° | 1.066 sr | 0.132 m | 0.753 | 173 | 9.66 m |
| square window | 1.000 | 55.0° | 55.0° | 0.859 sr | 0.124 m | 0.542 | 203 | 7.24 m |
| tablet portrait 834×1112 | 0.750 | 69.5° | 55.0° | 1.066 sr | 0.132 m | 0.753 | 188 | 7.24 m |
| iPhone SE portrait 375×667 | 0.562 | 85.6° | 55.0° | 1.276 sr | 0.146 m | 1.128 | 85 | 7.24 m |
| Xperia 21:9, CSS 411×960 | 0.428 | **100.0°** (capped) | 54.1° | 1.422 sr | 0.164 m | 1.681 | 95 | 7.10 m |
| tall foldable 344×882 | 0.390 | **100.0°** (capped) | 49.9° | 1.315 sr | 0.162 m | 1.636 | 87 | 6.47 m |

`W` is the world width visible at the player's own depth. **7.24 m in every portrait viewport** —
3.6 m either side of the player. That is the price of portrait and no camera rig avoids it: it is
`PH·a·cos²p / playerFraction` and both terms are fixed by the aspect and by wanting the player to
stay the size he is. The buildings you are standing between are gone; the ones 12 m further on are
in frame and the street reads by convergence instead of by flanking. Compare
`shots/pt/final/street_L/street_dusk.png` with `shots/pt/final/street_P/street_dusk.png`.

The 100° cap binds below `a = tan(27.5°)/tan(50°) = 0.4368`, i.e. anything taller than **1 : 2.29**
— not the 0.39 first written here. Past it the horizontal field starts falling below 55° rather
than the frame stretching further, which is the right way to fail. **That threshold is inside the
shipping phone range**: Sony's 21 : 9 line is 1644 × 3840, `a` = 0.428, and it is capped. See §9.5
for what that does — briefly, the transpose stops being exact and rotating one of those phones
rescales the world by 2 %.

### 2.4 Relation to the K = 1.5 derivation

`WORLD.md` §2 rests on three camera constants: the 96.8° horizontal half-angle (§2.4, side walls),
the 12.6° top frustum edge (§2.2, ceiling) and the 2.03 m indoor set-back (§2.3, arm core). **The
policy leaves all three exactly as they are at every landscape aspect, so §2's derivation, the
K = 1.5 multiplier, the 10 m `house` minimum, the street widths in §3 and the `camfit.mjs`
measurements in the §2.7 correction box are all untouched and still valid.**

In portrait two of the three change, and only in portrait:

| §2 constant | landscape | portrait | effect |
|---|---|---|---|
| horizontal half-angle (§2.4) | 48.4° | **27.5°** | side walls enter frame *later* — §2.4's failure gets **better**, not worse |
| top frustum edge θ (§2.2) | 12.6° | **33.5°** | ceilings enter frame *earlier* — §2.2's failure gets worse. §3. |
| indoor set-back (§2.3) | 2.03 m | 2.03 m | unchanged; `distIn` and `pitchMaxIn` are untouched |

So portrait relaxes exactly the constraint that set the 10 m house width and tightens exactly the
one that set the 4.0 m ceiling. That is §3.

---

## 3. "It may mean making roofs even higher?" — not the roofs, and Aaron's call

**Rewritten 2026-08-17 (§9).** The first version of this section surveyed 29 rooms and recommended
raising nothing. There are **52 rooms**, the lowest ceiling is **3.13 m** rather than 3.61, and in
four of them the camera reaches the ceiling and the player sees sky through the roof. The
recommendation below is different, and it is a recommendation, not a decision: nothing in this
pass touched geometry, `K`, `zones.js` or an authored town.

### 3.1 What the algebra predicts

Indoors at the default rig (`distIn` 2.10, `heightIn` 2.05, `camPitch` 0.26): eye `E` = 2.589 m
above the floor, set-back 2.029 m. The ceiling enters the frame at `(H_ceil − E)/tan(θ)` from the
camera, θ = v/2 − p.

| | θ | 4.83 m ceiling enters frame | 3.13 m ceiling (the lowest in the world) |
|---|---|---|---|
| landscape | 12.6° | 10.03 m out = **8.00 m ahead of the player** | 2.42 m out = 0.39 m ahead |
| portrait | **33.5°** | 3.38 m out = **1.35 m ahead of the player** | 0.82 m out = *behind* the player |

On paper that is `WORLD.md` §2.2's failure returning in full. It overstates the problem in exactly
the way §3.2 originally said — the far wall cuts the ceiling off long before it becomes "the top
half of the screen is floorboards" — and understates it in one way nobody had looked at, which is
that in the lowest lofts the *camera* ends up in the ceiling.

### 3.2 The survey — all 52 rooms

`tools/camfit.mjs` walks every room the player can stand in: **29 ground floors and 23 lofts.**
`autoStair` defaults to `true`, so a loft is ordinary walkable space and every one of them is
lower than the floor below it. The original survey read `__forge.doors.doors` → `roomH`, which is
the 29 ground floors only, and it read the *structural* height rather than what hangs below it.

Two corrections to the heights themselves:

- **The ground floor's lid is the loft deck, not `roomH`.** Measured over the 29:
  `3.57 · 3.75 · 3.91 · 3.94 ×3 · 3.99 · 4.08 · 4.30 · 4.46 ×3 · 4.70 · 4.83 ×16`. The floor is
  **3.57 m** (door 27, Blackstone, 10.1 × 6.8 m), not 3.61.
- **The lofts run lower.** `3.13 · 3.20 ×3 · 3.68 ×3 · 4.05 ×16`. **The lowest ceiling in the game
  is 3.13 m, in door 10's loft** — the very house the old §3.2 used as its worked example.

And one that matters more than either. A loft ceiling is not flat: `stairs.js gableCeiling` builds
a **gable**, so the height falls from the ridge to `roomH2 − rise` at the eaves, with
`rise = min(min(rx, rz) · 0.4, 1.28)`. In door 10's loft that is **1.90 m at the eaves against a
2.59 m eye.** `camfit` now measures the ceiling the player actually meets by raycasting the built
mesh rather than re-deriving it, which also catches the 0.02–0.18 m of slab, deck board and joist
that hangs below the structural figures above.

`node tools/camfit.mjs --json=docs/CAMFIT_PORTRAIT.json`. Share of the frame the ceiling fills,
worst of twelve headings, standing at the room centre with the arm at full length:

| | landscape 844×390 | portrait 390×844 |
|---|---|---|
| median ground floor, default pitch | **0.2 %** | **26.8 %** |
| median loft, default pitch | 24.0 % | 39.0 % |
| worst room, default pitch | 34.7 % (door 21 loft) | **43.0 %** (door 19 loft) |
| median room, looking up at `PITCH_MIN` | 45.2 % | 51.2 % |
| **worst room, looking up** | **75.4 %** (door 10 loft) | 63.4 % |

Three things to take from that table.

**Portrait roughly doubles the ceiling band at the default pitch, and it is a band, not a wall.**
In 16 of 52 rooms landscape shows no ceiling at all; portrait's median ground floor gives it a
quarter of the frame. The worst case is 43 %, not the 38.2 % asymptote and not the 26 % the old
§3.2 measured. `shots/fx/rooms/d13loft_L.png` against `d13loft_P.png` is the pair.

**Looking up, landscape is the worse orientation, not portrait.** This inverts the review's
table, which put landscape at 51 % against portrait's 66 %. The asymptote is
`(1 − tan(p)/tan(v/2))/2`, and at a *negative* pitch the wider vertical field pushes the bottom
edge further below the horizon, so the share falls back toward 50 %: landscape 85 %, portrait
66 %. The measured numbers are lower than both because the far wall cuts in, and they keep the
same order. `shots/fx/rooms/d13loft_up_L.png` (about 70 % ceiling) against `d13loft_up_P.png`
(about 58 %) is the pair, and the landscape one is plainly the worse frame.

**Four rooms are broken, and portrait is what makes it visible.** In doors 10, 13, 19 and 21's
lofts the eye at 2.59 m reaches the sloping ceiling for 2–6 of the 12 headings. The arm's ceiling
collider (`doors.js wallColliders`) is a flat lid at the *ridge*, so nothing stops it; the slab's
faces are backfacing from inside; and the outdoor world is hidden while you are indoors. The
player therefore looks **through the roof at the skybox**. `shots/fx/rooms/d10loft_void_P.png`
and `d13loft_P.png` are it — the top 14–17 % of a portrait frame is sky. This is not caused by the
orientation change: the camera is in the same place in landscape (`d10loft_void_L.png`), which
simply does not aim high enough to see out. Portrait's top frame edge is 33.5° above horizontal
instead of 12.6°, so it does.

For the spread, and because a worst case with nothing beside it is not evidence:
`shots/fx/rooms/d27gnd_P.png` is the lowest ground floor in the game (3.57 m, Blackstone) and
`d20gnd_P.png` a mid one (4.46 m); at 31.3 % and 26.8 % they read as low-beamed rooms with the
ceiling in the top third, everything in them legible. `d28gnd_P.png` (4.70 m) is a best case at
19.7 %, and the landscape twin of the worst of the three is 4.5 % (`d27gnd_L.png`).

### 3.3 The options, priced

The target, derived from the survey: the arm reaches `|u|` = 2.03 m off the ridge line, so the
ceiling's underside there must clear the 2.59 m eye. For a gable that is
`roomH2 ≥ 2.59 + rise·2.03/half + 0.078`, which for the four bad lofts is **3.26–3.33 m**, or
**3.52–3.59 m** if the 0.26 m `camRadius` is to clear as well. They are at 3.13 and 3.20.

| | what it costs | blast radius |
|---|---|---|
| **A. Accept it** | four rooms show sky through the roof; the ceiling takes up to 43 % of a portrait frame elsewhere | none |
| **B. Raise every house's `h`** | ~0.9 m of extra wall on every two-storey house in three towns | `whitewall.js`, `longacre.js`, `townkit.js`, every exterior silhouette, street proportions, shadow fit, the whole `camfit`/traverse/critic loop. The largest change available and the brief forbade it |
| **C. Re-split ground against loft in `interior.js`** | two constants: the 0.52 ground share and the loft's 3.00 clamp floor | interior proportions of every `twoUp` house. **barely works.** Doors 13/19/21 have 6.81 m to split between two floors, so the best even split is 3.40/3.41: past the bare 3.26–3.33 m, short of the 3.52–3.59 m that also clears the camera radius, and with both floors pinned at the 3.40 clamp minimum. Door 10 has room to spare (7.58 m) and would be fixed properly |
| **D. Reduce the indoor pitch in portrait** | nothing visible in the good rooms | **actively harmful.** The eye is `heightIn + distIn·sin(p)`, so *less* pitch lowers the eye but raises the ceiling's share of the frame (§3.2's PITCH_MIN column), and *more* pitch raises the eye straight into the ceiling. §6 already killed the outdoor version |
| **E. Raise the `twoUp` threshold from 6.6 to ~7.6** | the four worst houses (7.29–7.58 m of wall, against 8.29 for the next one up) lose their upstairs and gain a single room at the 4.70 m one-storey cap | one constant in `interior.js`, no geometry — but it deletes walkable space and leaves the exterior's second window row promising a floor that is not there |
| **F. Step the arm's ceiling collider to follow the gable** | ~10 lines in `doors.js wallColliders`: the single full-height lid box becomes a central strip at the ridge plus flanking boxes at the eaves | `doors.js` only. Nothing the player sees changes except that the camera reels in a little sooner in the four lowest lofts, which is what it already does near their walls (`fullFrac` there is 37 %) |

**I would take F, and accept the ceiling band.** F is the only option that fixes the only thing
that is actually broken, and it fixes it for landscape too. It touches no geometry, no `K`, no
`zones.js`, no authored town and no exterior; it needs one `camfit` re-run and two loft renders to
confirm. B is the change the original brief asked about — "making roofs even higher" — and it is
both the most expensive thing on the list and the wrong lever: the roofs are not the problem, the
camera going through one gable in four houses is.

The ceiling band itself I would leave alone. 43 % of the frame sounds bad written down and does
not look bad rendered: it is a beamed loft ceiling in a store room, the window, the stair and the
player stay legible, and buying it back costs either exterior geometry across three towns or a
zoom on every doorway (§6). **This is Aaron's call and F is not applied.**

---

## 4. Perf, both orientations

**Rewritten 2026-08-17 (§9).** The first version of this table sampled at `budget.mjs`'s default
`--step=20`. That is not the project's baseline grid: `docs/TRAVERSE_A8_LONGACRE.json` records
`"step": 25`, and a 20 m grid is not a superset of a 25 m one — only 96 of A8's 348 stations are
in the 426-station set, and A8's worst station is not one of them. The 286.8k landscape figure was
therefore **30k below the project's real landscape worst** and must not be adopted as a baseline.
The numbers below are the 25 m grid, which reproduces the recorded A8 figure to the digit.

Full road traverse, gate profile (`--preset=medium --dpr=1`, `shadowRate: every frame`) — every
registered road at 25 m × 3 yaws, 348 samples. Same working tree, same build, only `--w`/`--h`
differ.

```
node tools/budget.mjs --traverse --step=25 --w=844 --h=390 --preset=medium --dpr=1
node tools/budget.mjs --traverse --step=25 --w=390 --h=844 --preset=medium --dpr=1
```

| | landscape 844×390 | portrait 390×844 | gate |
|---|---|---|---|
| worst triangles | **316.6k** (186.0k main + 130.6k shadow) | **288.3k** (157.7k main + 130.6k shadow) | 350k |
| — at | (−512, −71) yaw 0 | the same station | |
| worst calls | **139** (109 main) at (−82, 109) | **120** (90 main), same station | 150 |
| p50 / p95 triangles | 83.5k / 237.4k | 67.6k / 219.8k | — |
| p50 / p95 calls | 78 / 124 | 62 / 110 | — |
| samples over the 350k gate | 0 of 348 | 0 of 348 | — |
| margin on triangles | 9.5 % | **17.6 %** | |
| margin on calls | 7.3 % | **20.0 %** | |

`docs/TRAVERSE_PT25_L.json`, `docs/TRAVERSE_PT25_P.json`. The landscape row is byte-for-byte the
worst station and count `TRAVERSE_A8_LONGACRE.json` recorded, so **nothing in the tree moved** —
the discrepancy the first version of this section flagged as unexplained was two different grids.
The 20 m pair (`docs/TRAVERSE_PORTRAIT_L.json`, `_P.json`) is still on disk and still internally
comparable; it is simply not the baseline.

**Portrait is cheaper than landscape at the true worst station too, and the gate has more headroom
in it, not less.** The brief expected the opposite because the earlier sweep held the aspect fixed
and raised vFOV alone, which grows the frustum on *both* axes — 60 calls at vFOV 55 to 110 at
vFOV 102 on one framing. The policy does not do that: it trades one axis for the other and the
solid angle is *exactly* conserved (§2.2), so the only difference left is which objects happen to
fall in. A world that is wide and low loses more buildings off the sides than it gains sky and
ground off the top and bottom. Portrait is not cheaper *everywhere* — on the 20 m grid it was
worse at 13 of 426 stations — but never by enough to matter.

The shadow pass is 130.6k in both, to the triangle, because `lighting.js`'s fit term
`tan²(v/2)·(1+a²)` is transpose-invariant. That was predicted before it was measured.

Real GPU, `--headed --perf`, worst scored framing (`town_night`): landscape **60 fps**, 139 calls /
208k tris; portrait **60 fps**, 110 calls / 182k tris. Headless GPU-ms figures are ignored per
`CLAUDE.md`.

---


## 5. HUD and UI

**Amended 2026-08-17 (§9.4).** The media block is now gated on `max-width: 560px` as well as
orientation, the cog has moved into the button column, and `rotate()` has been deleted rather than
neutered. Everything below still describes the block correctly apart from those three.

`js/game/session.js` `rotate()` no longer pauses; `.g-rotate` and its
`@media (orientation: portrait)` display rule are gone from `game.css`. One media block replaces
them. Everything in it is a portrait-only override; landscape CSS is byte-identical.

| assumption that inverted | landscape | portrait |
|---|---|---|
| `--thumb` (`game.css:266`) | 26 + 166·ui px of **width** reserved beside the buttons | `0`; `--stack` = 40 + 154·ui px of **height** reserved above them |
| the two round buttons | side by side, bottom right | **stacked**, dial above act |
| dialogue bubble + choices (`:87`) | a column beside the buttons | full width, above them |
| `.g-prompt` | inset by `--thumb` both sides | full width, above the stack |
| the slate's three panels (`:652`) | three across | one column |
| journal master/detail | 38 % list, 62 % pane | list on top, pane below |
| character sheet `.g-cols` | three columns | `auto-fit minmax(158px·ui)` — two at ui 1, one at 1.4 |
| day chip | same row as the vitals | under the cog, tracker under the chip |

The buttons **stack** rather than staying a row for two reasons. Ergonomically a right thumb in a
portrait grip sweeps a vertical arc from the bottom-right corner, and a row puts the dial at
x = 198 of 390 — the middle of the screen, in the left thumb's territory and on top of the move
stick's half. Arithmetically a row is `26 + 60·ui + 30·ui + 76·ui` wide, which at uiScale 1.4 is
258 px of a 390 px screen and crosses the `innerWidth/2` line `input.js:58` splits move from look
on. Stacked it never can, at any text size.

`js/input.js` needed **no change**: the stick is a floating stick placed wherever the thumb lands
on the left half, and half of 390 is still a thumb. `js/game/hud.js` needed no change either: the
radial is drawn at the screen centre and *aimed* from the dial, so it is a direction gesture and
the two origins are allowed to differ — which is exactly what makes it survive a 390 px frame.

### Audited, not assumed

A DOM sweep for anything off-screen or overflowing its box, at uiScale 0.85 / 1.0 / 1.4, over the
HUD, the dialogue bubble, a three-choice list, the slate, the journal, the character sheet,
settings, pause and the market with stock:

- **portrait: clean at all three text sizes**, no overlaps, nothing off-screen, dial clear of the
  stick midline. Four real portrait-only faults were found this way and fixed in the block: the
  vitals overrunning the day chip at ui 1.4, `.g-track`'s `max-width: 46%` being narrower than its
  own `min-width: 190px`, the market ware row and till running 419 px wide, and the settings range
  input's 129 px intrinsic width blowing a 340 px row.
- **landscape: unchanged**, verified rect-by-rect against the same probe before and after.

Rotation was driven live, mid-session, five times in both directions
(landscape → portrait → landscape → portrait → landscape) with a dialogue scene open. FOV, aspect,
canvas size and every HUD rect track the viewport; `camPitch`, `camYaw` and the player's position
are bit-identical throughout; `paused` stays false and `pauses` stays empty; the landscape state
after four rotations is identical to the state before the first. The FOV change is instantaneous
and deliberately not eased — the short-axis scale does not change, so the frame reads as *growing
taller*, which is what the device just did. Easing it would add a zoom that did not happen.

Final frames: `shots/pt/hud/port_final.png`, `shots/pt/hud/land.png`, `shots/pt/hud/slate_P.png`,
`shots/pt/hud/jrnl_P.png`, `shots/pt/hud/u1.4_char.png`, `shots/pt/hud/u1.4_mkt.png`.

### Dialogue — flagged, not changed

`STORY.md`'s "two lines maximum per bubble" **survives portrait unchanged**. Measured in the page
over all 676 authored lines in the three packs: every one still renders as a single line in the
336 px portrait bubble (594 px in landscape). Nothing needs rewriting.

What tightens is the headroom under it. `MAX_LINE` (`js/game/questdef.js`) is **46** and the corpus
peaks at 43. In the portrait bubble ordinary prose wraps at **48–49 characters**, and a
wide-glyph 46-character line already wraps today. So the lint's 46 is now inside the noise instead
of having 24 characters of slack, and at uiScale 1.4 the portrait bubble only fits **36**
characters — every 37+ character line becomes two, and a two-line bubble becomes four. Nothing
breaks; the bubble grows. **Recommendation: drop `MAX_LINE` to 43, which the corpus already
satisfies, so the next line written cannot quietly become the first one that wraps.** Not done —
that is a content-policy decision.

### Found, not fixed (both pre-existing, both landscape)

- At uiScale 1.4 in **landscape**, `.g-chip` right-edge 788 against `.g-cog` left-edge 785 — a 3 px
  overlap of a rounded chip and a transparent button. Not caused by this work and not portrait.
- `.g-jrow i` is a hard `width: 12px` holding a glyph that measures 19 px at uiScale 1.4, in both
  orientations. Latent; 7 px of bleed.

---

## 6. Hypotheses tested and killed

**"Portrait wants a downward pitch."** The brief's read, and mine, and it is wrong. Rendered at the
north gate at vFOV 90, `camPitch` 0.26 / 0.36 / 0.473 / 0.58 (`shots/pt/ng_p26`, `ng_p36`, `ng_Q1`,
`ng_p58`): the more pitch, the worse. `ng_p26` — landscape's own pitch — is the best frame of the
four and `ng_p58` the worst. Pitching down trades away the thing that actually fills a tall frame
(upper storeys, roofs, the Lantern Spire, sky) for the thing that does not (bare pavement). What a
portrait frame needs is a *high top edge*, θ = v/2 − p, and pitch subtracts from it. The extra
vertical field must go **up**, not down, which is also coherent with the whole point of K = 1.5:
the buildings were made oversized so they would fill the frame.

**"Portrait wants a longer arm and more height."** Follows from the first and dies with it. Five
rigs derived to hold the sky fraction at landscape's 24.4 % and the player at a fixed pixel size,
at vFOV 62 / 70 / 78 / 82 / 90 / 96, with `D` from 6.6 m to 19.9 m and `H` up to 2.88 m
(`shots/pt/Q1`–`Q4`, `A`–`D`). None beat the stock rig. The algebra says why: once the player's
on-screen size and the pitch are fixed, `W` is 6.2–7.1 m for *every* vFOV in that range —
**vFOV and arm length are the same knob**, and the only thing choosing between them is perspective
compression and how often a 13 m arm collides with a building. The stock 7.2 m arm is the
practical end of that family, so the policy keeps it.

**"The empty foreground is a framing bug."** It is not; it is the location and the HUD. The market
approach (`shots/pt/final/square_P`) is bare because that stretch of Mill Lane genuinely is an open
paved square — its landscape twin only looks full because two buildings sit 80° off axis. On a real
street (`street_P`) the foreground is cobbles and reads fine, and in play the bottom
40 + 154·ui px of a portrait frame is under the button stack and the dialogue bubble anyway. World
detail down there would be *worse*, not better.

**"Widening the frustum will blow the perf gate."** §4. It does the opposite, and the reason is
exact rather than lucky.

**"The interior needs its own field through the `indoor` blend."** §3.3. Any vFOV low enough to keep
the ceiling out is too low to show the room, and it costs a zoom on every door.

---

## 7. What I did not do, and what I am unsure about

Not done, deliberately, per the brief: no change to `zones.js`, to K, to any authored town, to the
level editor, or to any dialogue or quest text. No geometry moved.

Not done, and worth someone's attention:

- **Nothing has been on a phone.** Every render here is Chrome under CDP with device emulation. The
  thumb reach argument in §5 is geometry and pixel counts, not a hand. `PHONE_TEST.md` is the place
  this should be closed out, and the safe-area insets in particular (`env(safe-area-inset-*)` is
  always 0 under emulation, so the notch and home-indicator behaviour of the new portrait block is
  *untested* — that is the single most likely thing to be wrong).
- **During a three-choice dialogue in portrait the bubble stack reaches the player's head** (the
  head sits 52 % down; the choices start around 51 %). It is a judgement call: I chose a full-width
  bubble over keeping the player clear, because narrowing the bubble to clear the button column
  would cut the line length to ~264 px and start wrapping the shipped script. `shots/pt/hud/port_final.png`.
  Easily reversed if Aaron would rather see the character.
- ~~**The 100° cap is a guess.** It only binds below `a ≈ 0.39`.~~ **Wrong on both counts** — it
  binds at `a = 0.4368`, which the 21 : 9 phones reach. §2.3 and §9.5.
- **`pickDefaultPreset()` (`app.js:151`) still branches on `innerWidth < 820`.** In portrait a phone
  is 390 px and gets `medium`, which is right, but so does any narrow desktop window. Pre-existing;
  the policy did not change it and I left it alone.
- ~~**The traverse triangle discrepancy in §4** — 286.8k against the recorded 316.6k — is
  unexplained.~~ **Solved: two different grids.** A8 sampled at `--step=25`, this at `budget.mjs`'s
  default 20. Re-run at 25 and landscape reproduces A8 exactly. §4.

---

## 8. Proposed replacement for the `CLAUDE.md` Orientation row

**Rewritten 2026-08-17 (§9).** The first version claimed every landscape aspect keeps the 96.8°
horizontal. It does not — 55° *vertical* is what is held, so the horizontal varies with the
window: 85.6° at 16:9, 96.8° at the 844 × 390 gate, 102.0° at 21:9. The useful claim, and the
reason there is no regression surface, is that landscape is unchanged from what shipped.

Aaron to apply; the current row is now wrong.

> | Orientation | **Portrait first, landscape everywhere.** Both are first class on phone and desktop; there is no rotate prompt. `js/engine/fov.js` holds the 55° field on whichever axis of the viewport is *shorter*, which leaves **landscape bit-for-bit what shipped**: every landscape aspect keeps exactly its 55° vertical, so 16:9 still reads 85.6° horizontal and the 844 × 390 gate still reads the 96.8° the K = 1.5 derivation assumes. A phone in portrait gets that same frustum transposed — 96.8° vertical, 55° horizontal, the same solid angle, near-plane reach and shadow fit — so rotating the device rescales nothing, bar the 21 : 9 phones that reach the 100° cap and rescale by 2 %. The rig is orientation-independent: no arm, height, pitch or clamp differs. Portrait costs street width, 7.2 m in frame at the player against 15.7 m, and gives the ceiling a quarter to two-fifths of an interior frame. **Roofs were not raised; four lofts let the camera through the ceiling and that is pre-existing — see `docs/NOTES_PORTRAIT.md` §3.** |

---

## 9. Review pass — 2026-08-17

`docs/REVIEW_PORTRAIT.md` confirmed the camera policy and could not break the transpose, so the
policy stands untouched. Everything below is the ring of problems around it. **§3, §4 and §8 were
rewritten in place** rather than corrected here, because all three were going to be read as fact
by someone who was not going to scroll this far.

Nothing in this pass touched geometry, `K`, `zones.js`, an authored town, the editor, or the
concurrent work in `js/sim/foes.js`, `js/game/spawner.js`, `js/game/onboard.js`, `data/quests/*` or
`tools/lintQuests.mjs`. `node --test` **569 pass / 0 fail** (561 before, 8 new).

| file | change |
|---|---|
| `js/scenarios.js` | `frameCamera` writes the scenario's field through the `fov` knob instead of past it |
| `js/engine/app.js` | `setFov`'s comment now describes what the code does |
| `js/engine/fov.js` | the cap threshold, corrected from "about 1 : 2.2" to 1 : 2.29 |
| `js/engine/fov.test.js` | **+2**: the cap threshold, and that the comment states the number the constants produce |
| `js/scenarios.test.js` | **new, 3**: a scenario's field survives the preset re-apply |
| `js/game/session.js` | `rotate()` and its two listeners deleted; `combat()`'s comment no longer claims portrait pauses |
| `js/game/game.css` | the portrait block is gated on width; the cog moves into thumb reach; the 258px comment; two of the review's low findings |
| `js/game/portrait.test.js` | **new, 3**: the width gate, the cog, and the dead listener |
| `tools/camfit.mjs` | measures the ceiling each of the 52 rooms actually shows, in both orientations |

### 9.1 The `fov` knob stomped every scenario

Confirmed exactly as reported. `frameCamera` wrote `app.camera.fov` directly; `usePreset()`
re-applies every registered knob from `this.settings`, `fov` is in no preset, and `main.js` runs
`applyParams()` eighty lines after `shot.setup(app)`. Twenty scenario definitions carry a non-55
`fov` and all twenty rendered at 55.

The fix is one line: `frameCamera` calls `app.quality.set('fov', fov)`. The knob's `settings` entry
then *is* the scenario's value, so `usePreset` re-applies 60 rather than 55, and it stays correct
for a preset changed later from the panel — which reordering the boot would not have covered.

Verified in the browser, not just in node:

```
node tools/shot.mjs --shot=wwa_air   --set=dev=1 --preset=medium --dpr=1 --eval=…camera.fov  → 60
node tools/shot.mjs --shot=door_light --set=dev=1 --preset=medium --dpr=1 --eval=…camera.fov  → 45
node tools/shot.mjs --shot=wwa_air --set=dev=1 --preset=high --dpr=2 → [60, 60, 60, 2]
```

`shots/fx/fov/door_light.png` (45°, correct) against `shots/fx/fov55/door_light.png` (55°, the bug,
reproduced with `--set=dev=1&fov=55`) is the pair, and they are visibly different framings.
`shots/fx/fov/wwa_air.png` is the 60° one.

**One correction to the review.** `--dpr` was never a second stomp path. `setDprCap → resize →
applyFov` reads `this.fovMinor`, which is whatever `setFov` last wrote — the scenario's value.
`usePreset` was the only writer that ever overrode it, so moving `applyParams()` above
`shot.setup(app)` *would* have fixed both. The knob write-through is still the better seam, for the
runtime-preset-change reason above, but the diagnosis had one path too many in it.

### 9.2 The interior survey — §3

Rewritten. Headlines: 52 rooms not 29, the lowest ceiling is 3.13 m not 3.61, the lowest ground
floor is 3.57 m, and the loft ceiling is a **gable** whose eaves come down to 1.90 m against a
2.59 m eye — which the review's flat-lid algebra could not see. Four lofts let the camera reach the
ceiling and the player looks through the roof at the sky. `camfit.mjs` now raycasts the built mesh
for the ceiling profile and reports the ceiling's share of the frame in both orientations at both
pitches, so the survey is repeatable. Recommendation, costs and blast radius are in §3.3; the short
version is **fix the arm's collider, not the roofs, and it is Aaron's call.**

### 9.3 Three comments that were not true

- **`session.js` `rotate()` — deleted, with its two listeners and its call in the constructor.**
  `pauses` is a runtime `Set` that appears nowhere in `save.js`, `snapshot()` or `normalise`, so no
  save from any build has ever carried a pause set, and nothing has pushed `'portrait'` since the
  rotate prompt went. Keeping it would mean a comment explaining a permanent no-op, which is the
  kind of comment `CLAUDE.md` asks to be deleted; and the `resize` listener fired the no-op on every
  viewport change a mobile browser makes. Re-adding one line is cheap if a rotate ever needs
  handling. `App` still has its own `resize` listener, which is the one that matters.
- **`app.js` `setFov()`** now says scenarios reach the field through the knob, which is true as of
  §9.1.
- **`game.css` 236px → 258px.** 26 + 166 × 1.4 = 258.4. `NOTES_PORTRAIT.md` §5 repeated it and is
  fixed too. The conclusion was always right — both numbers cross the 195 px midline.
- Also fixed, and flagged by the review: `session.js` `combat()`'s "everything that pauses the game
  — a menu, a hidden tab, portrait" no longer names portrait.

### 9.4 The HUD — the cog, and the media query

Both in the `@media` block; landscape CSS is still byte-identical to what shipped.

**The cog.** It is still the only touch route to pause and settings, and at (362, 26) it was 818 px
— about 135 mm — from where a portrait grip pivots the thumb. It now joins the **top of the button
column**: `bottom: env + 26px + 170px·ui`, right-aligned with the dial and act, with `--stack`
grown to `40px + 170px·ui + var(--cog)` so the dialogue bubble still clears the cluster. Measured
from the bottom-right corner of a 390 × 844 viewport:

| uiScale | cog rect | distance from the pivot | left edge vs the 195 px midline |
|---|---|---|---|
| 0.85 | 320–364 × 630–674 | **198 px** | clear |
| 1.0 | 320–364 × 604–648 | **223 px** | clear |
| 1.4 | 311–364 × 527–580 | **295 px** | clear |

Top of the column rather than bottom because the cog is the least-used of the three and the act
button has to keep the corner rest position; a menu button at the exact thumb rest is a mis-tap
magnet. It also picked up a `text-shadow` and a little opacity, because at the top of the frame it
sat against sky and down here it sits against sunlit pavement.
`shots/fx/hud/port_ui1.png`, `port_ui14.png`, `port_flip.png`.

**The media query.** `@media (orientation: portrait)` → `and (max-width: 560px)`. 560 clears the
widest phone in portrait (430) and stops short of the narrowest tablet (744). Checked:

- **890 × 900 desktop** now gets the landscape HUD — cog top-right, day chip on the vitals row,
  buttons side by side, bubble inset by `--thumb`. `shots/fx/hud/desk890.png`.
- **834 × 1194 tablet in portrait** gets the same, and it fits: the button cluster sits at
  x 642–808 against a 417 px midline, and the bubble gets 614 px instead of 810.
  `shots/fx/hud/tab834.png`. The camera is unaffected and still runs the portrait policy at 73.4°
  vertical, which is the whole point of keeping the two rules independent.
- The cog on a tablet in portrait is 1168 px from a bottom-right pivot, which is only fine because
  a 13-inch device is held in two hands. If a 600–740 px phone-like device ever matters, the gate
  is the number to move.

**Two of the review's low findings came along with it**, because leaving them would have been
odder than fixing them: `body.flip .g-right` now sets `align-items: flex-start` so the dial stops
being right-aligned inside the act's box (the 16 px misalignment), and `.g-chip`/`.g-track` clear
the vitals by a *scaled* gap rather than the 3 px a fixed one left at uiScale 1.4 — 14 px and 12 px
at 1.4, 10 px and 12 px at 0.85. The 3 px was a Chrome font metric and iOS `system-ui` is a
different font.

### 9.5 The 100° cap

`a_cap = tan(27.5°)/tan(50°) = 0.43681`, i.e. **1 : 2.2893**, not the 0.39 in §2.3 and §7 nor the
"about 1 : 2.2" in `fov.js`. Both corrected, and `fov.test.js` now asserts the threshold *and*
that the comment quotes the number the constants produce — this is the seventh review running to
find a comment that says something the code does not, and this one carries a number `CLAUDE.md`
would have inherited.

**A real phone class is capped.** Sony's 21 : 9 line is 1644 × 3840, `a` = 0.4281. Measured:
vFOV 100.000°, hFOV **54.06°** — so in portrait its short axis carries 54.06° where in landscape it
carries 55.0°, and rotating the device magnifies the world by `tan(27.5°)/tan(27.03°)` = **2.1 %**.
The review put this at "about 3 %", which is the figure for `a` = 0.423; at the actual Sony aspect
it is 2.1 %. Either way it is the one exception to "rotating the phone rescales nothing" and §8's
row now says so. Nothing else about the cap misbehaves: solid angle *falls* past it (1.42 sr at the
Sony aspect against 1.47 sr for the 21 : 9 landscape it rotates from), so the frustum gets cheaper,
and the frame is unremarkable to look at.

### 9.6 The traverse — §4

Rewritten. The review's diagnosis is exactly right and I reproduced it on this tree: `--step=25`
gives landscape **316.6k tris / 139 calls at (−512, −71) yaw 0**, matching
`TRAVERSE_A8_LONGACRE.json` to the digit, and portrait **288.3k / 120** at the same station with
0 of 348 samples over the gate. The honest margins are **9.5 % landscape / 17.6 % portrait** on
triangles. `docs/TRAVERSE_PT25_L.json`, `_P.json`.

### 9.7 Where I think the review was wrong

It is a good review and four of its seven findings needed no argument. Three things:

1. **The `--dpr` stomp does not exist.** §9.1.
2. **Its frame-share table has landscape at 51 % looking up. It is 85 %.** The asymptote is
   `(1 − tan(p)/tan(v/2))/2`, and at `p` = −0.35 that is `(1 + 0.7012)/2` for landscape and
   `(1 + 0.3238)/2` for portrait — so **looking up is the one case where the wider portrait field
   is the *better* one**, because it pushes the bottom edge further below the horizon. Measured over
   all 52 rooms the worst is 75.4 % landscape against 63.4 % portrait, and
   `shots/fx/rooms/d13loft_up_L.png` next to `d13loft_up_P.png` shows it plainly. The review used
   this table to argue the loft case was worse than reported; the loft case *is* worse than
   reported, but for a different reason (the gable), and looking up is not it.
3. **"Nothing clips indoors" and "0 shell escapes over all 52 rooms" are true of the wrong
   surface.** `camfit`'s escape test uses `I.top`, the flat ridge, which is also what the arm's
   collider uses. The ceiling the player sees is a gable up to 1.28 m below that, and the camera
   goes through it in four rooms. The review is not wrong about the *shell*; it is that the shell
   is not the ceiling.

Its 21 : 9 rescale figure (3 % against a measured 2.1 %) and its "3.61 m is the floor" correction
(right for the structural lid, ~0.08 m optimistic for what the eye meets) are small enough to be
footnotes rather than errors.

### 9.8 Tests, and the revert-to-red evidence

Eight new assertions. Each was checked by putting the bug back and confirming the test failed.

| test | file | reverting | result |
|---|---|---|---|
| a scenario's declared field survives the preset re-apply that follows it | `scenarios.test.js` | `app.quality.set('fov', fov)` → `app.setFov(fov)` | **red** |
| a scenario field is a short-axis field, so a portrait shot keeps its declared horizontal | `scenarios.test.js` | same | **red** |
| no preset carries a fov, so a preset change cannot redefine a scenario field | `scenarios.test.js` | — | **stays green.** It defends the *precondition* of the write-through, not the write-through: put `fov` in a preset and the fix silently stops working. Kept deliberately, reported honestly |
| the cap binds at 1 : 2.29, which the 21:9 phones reach | `fov.test.js` | — | **stays green** unless `FOV_MINOR`/`FOV_MAX` move, which is exactly what it is for |
| fov.js states the threshold its own constants produce | `fov.test.js` | comment back to "about 1 : 2.2" | **red** |
| the portrait block is gated on a phone-shaped viewport, not merely a tall one | `portrait.test.js` | dropping `and (max-width: 560px)` | **red** |
| portrait brings the cog into thumb reach instead of leaving it in the far corner | `portrait.test.js` | deleting the portrait `.g-cog` rule | **red** |
| a rotate is no longer an event the session handles | `portrait.test.js` | restoring `rotate()` and the `orientationchange` listener | **red** |

Each revert reddened only its own test, so none of them is passing for a second reason.

`node tools/lintQuests.mjs` — 99 quests, 405 steps, 175 nodes, the one known `light.06` warning.
`node tools/lintText.mjs` — 175 nodes, 705 lines, longest 43/46, clean.

### 9.9 Still not done

- **Still nothing on a phone.** Every measurement here is Chrome under CDP. The cog's 223 px is a
  pixel count, not a thumb, and `env(safe-area-inset-*)` still reads 0 under emulation. The cog now
  lives inside the `--stack` band, so a home indicator pushes it up with the buttons rather than
  under itself, which is the one thing the move made *less* risky.
- **`docs/AUDIT_MOBILE.md` and `docs/PHONE_TEST.md`** still describe the rotate prompt and still
  say "phone on the same wifi, landscape". The review's finding 8, not in this brief's list, and
  they are stale in a way that will mislead whoever runs the phone pass.
- **The four broken lofts.** §3.3 option F is ten lines in `doors.js`. It was not applied because
  the brief reserved the interior decision for Aaron, and because a collider change wants its own
  `camfit` run and its own pair of renders rather than being smuggled in at the end of a docs pass.
- **`pickDefaultPreset()`** still branches on `innerWidth < 820`. Unchanged, pre-existing, and now
  deliberately *not* the same number as the CSS gate — the preset is about how fast the device is
  and the gate is about how the HUD should be laid out.
