# P5 — the four things from Aaron's phone round

Pass 1. All four items landed. Nothing in `js/sim/` was touched and `js/main.js` is untouched — no
wiring in it was needed.

Files changed: `js/ui/hud.js`, `js/ui/flow.js`, `js/cine/sequences.js`, `js/world/fleet.js`,
`js/config.js`, `style.css`. One new file: **`js/ui/drama.js`**. `js/cine/caption.js` is unchanged
(see item 4 for why).

Probes are in
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/p5/`:
`drama_test.mjs`, `leak_test.mjs`, `stress.mjs` (node, no browser), and `frames.mjs`, `soak.mjs`,
`hit.mjs`, `hud.mjs`, `burn.mjs`, `first.mjs` (CDP). Images referenced below are in the same folder.

---

## 1. The privacy blank on the own-fleet box

The box is now a panel with a header (`Your fleet` + an eye control) over the button that opens the
layout editor. The eye is a **sibling** of that button, never nested inside it — a button inside a
button is invalid and the inner tap would still have fired the outer handler. Its face is 26 px and
a pseudo-element grows its hit box to 44 px without spending 44 px of the phone's top corner.

Blanked, the grid is replaced by a flat panel reading HIDDEN and the eye picks up a bar through it.

**The roster is half private.** `You 4/5` and `lost 3 2` are a readout of *your* fleet's condition;
hiding the grid and leaving them beside it hides nothing, so they go with it (`visibility: hidden`,
so the box does not resize). `Enemy 3/5` and `sunk 3 2` are facts about the enemy and stay — they are
the only place those figures appear and they are not what the person over your shoulder wants.

Worth saying out loud: **your ships on the sea are still visible while the box is blanked**, and that
is correct — those positions are dramatised and carry no information about your board. The box is
the only thing on screen that shows where your fleet really is.

Measured (`hud.mjs`, 390×844, real `Input.dispatchTouchEvent` taps):

| | |
|---|---|
| tapping the eye opens the layout editor | **no** (`isOpen() === false`) |
| tapping the box still opens it | yes |
| survives a turn's `paint()` | yes — the class is on the box, `drawOwn()` only rewrites the cells |
| survives a **genuine** reload + resume | yes (proved with a `window` marker, D39/P3's method) |
| stored | `settings.hideFleet`, read back in `boot()` and in `enterMatch()` |
| console | clean |

`hud_open.png` / `hud_blank.png` / `hud_resume.png`.

I did **not** add it to the settings dialog. Aaron asked for it on the box, the control is visible on
the blanked box itself, and a second control for the same state in a second place is a thing to keep
in sync for no gain.

## 2. The four beats now solve their station — D45

`shell_chase`, `impact_hit`, `impact_miss` and `enemy_volley` no longer ship a hard-coded eye offset.
Each keeps its authored *direction* (that is composition) and solves its *distance* from the
subject's extent and `ctx.aspect`, floored at the station it already had — the same shape as
`fire_out`'s D42 fix, so landscape never comes in. `aspect` is passed from `present()` to every beat.

Frame width **at the subject**, mean over the beat, measured live in a real match (`frames.mjs`):

| beat | portrait 390×844 | landscape 1600×900 |
|---|---|---|
| `shell_chase` | 14.7 → **31.4** m (tightest instant 3.4 → **7.6**) | 51.4 → 55.9 (tightest 13.1 → **13.1**, unchanged) |
| `impact_hit` | 21.7 → **33.8** | 83.7 → 106.8 |
| `impact_miss` | 25.9 → **31.0** | 99.7 → 111.7 |
| `enemy_volley` | 16.5 → **38.9** | 63.5 → 67.7 |

Landscape's *stations* are unchanged in all four — the solve lands under the floor at 1.78. The
landscape numbers still move on `impact_hit` and `impact_miss` because those two beats **had no
`rig.fov()` call at all** and were inheriting whatever `shell_chase` left (36°, the end of its ramp).
They now declare 44° and 40°, which is the whole of the landscape change (tan 44/2 ÷ tan 36/2 = 1.24,
and 83.7 × 1.24 = 104). That is worth having on its own: those beats posed differently depending on
whether a sequence had run before them.

**`shell_chase` needed a different solve and it is the interesting one.** Its station cannot be
derived from the offset's own length, because the beat looks *ahead* of the round: the camera stands
`off` behind a point further down the arc than the round is, and the two nearly cancel. 34 m of
offset put the camera **9.6 m** from the round, which is where portrait's 3.4 m frame came from.
Worse, the range is not monotonic — it *closes* to a minimum about a fifth of the way through the
flight and opens again, so pulling the camera back **moves the minimum**, and a scalar solved at the
old one misses. Two wrong answers before the right one: a closed-form per-pose quadratic gave
zoom 1.0 (it tested the lead alone, not the pose), and fixing that test gave 4.4 m instead of the
7.4 m target because the minimum had moved. It is now a binary search on one scalar over 25 samples
of the whole beat, which hits it: 7.6 m against a 7.4 m target.

## 3. A hit lands on a hull — D43 and D44

### The arrangement

New file `js/ui/drama.js`. It solves the enemy arrangement under the full constraint set: every
revealed hit carries a hull, every revealed miss is open water, and every sunk ship is pinned to its
own revealed cells with a hull of exactly that length. Backtracking search with most-constrained-cell
selection, forward checking, and a lower bound on the hulls still needed.

`flow.js` re-solves it after every shot of yours and hands the result to `fleet.reform(1, …)`, which
**steams the escorts** to the new arrangement while the round is in the air and the camera is on your
own guns. `UI.drama.steamMs` is 1100/1900 against `fire_out`'s 1280/2180, so the move is over before
the shell exists; `present()` also calls `fleet.settle(side)` before creating the tracer, so the
guarantee holds under fast-forward, under a skip, and at `instant` pace where there is no `fire_out`
at all.

Ship **identity** is preserved across a re-pack: the arrangement is indexed by fleet slot, so hull *i*
is always the ship of length `fleet[i]`, and a ship that sinks turns out to be exactly the length the
chart says. `stations()` in `fleet.js` now hashes its jitter and bearing on the **ship**, not on its
cell — hashed on the cell, a hull that moved one square re-rolled its whole station and teleported.
That is why the fleet mostly stands still: **0.36 hull moves per shot** over 27,510 shots.

Because a re-pack can move a struck cell onto a *different* hull, damage is not accumulated from
events. `fleet.setDamageState()` / `commitDamage()` derive it from the board: each hull's list angle
and its fires come from how many of the cells it currently covers are revealed hits. So the fire
follows the damage rather than the object.

**Misses too.** The grid's own space is not the space the fleet stands in — a station is pulled 0.42
toward its formation's centre — so a column raised at the bare cell had no relationship to the hulls.
`fleet.missPoint()` applies the same pull and then pushes clear of every hull. Same-frame control
(the point it used to use, measured on the same frame): minimum clearance **19.3 m → 22.5 m** across
the sample. This is a guarantee made explicit, not a bug caught: in the frames I measured the old
point never actually landed *on* a hull.

### The look — D44

`resolve()` now uses the scored `hit_explode` vocabulary. The fireball is emitted at
`hullSide()` with an `out` normal so it breaks **out of the plating** rather than sitting on it, and
the flank is chosen as the one facing the gun that fired. `impact_hit` frames the struck hull:
`eyeDir` swings the authored 40/26/66 onto that flank, and the look point is biased 35% toward the
ship's middle — aimed at the impact alone, the hull ran out of one corner and the shot read as a
fireball with grey behind it. Burning ships keep their fire and their list, and a sunk ship gets a
second one aft.

Fire sizing is a card budget, not a look decision: `size` stays low (16 cards) and `scale` buys the
ten metres of flame a 115 m hull needs at 130 m, because buying the same height through `size` costs
four times the cards. `BURN_CAP` is 4 hulls per side; the rest take damage and list without burning.

### What it measures

Reproduced baseline (the manager's, in D43): nearest dramatised hull to the explosion **46.3 m**.

Now, distance from the explosion to the **surface of the nearest hull** (its own local frame,
`max(|x| − L/2, |z| − B/2)`, so ≤ 0 is inside the hull):

```
-0.2  -0.1   0.0   0.0   0.0   0.0   3.3   3.4   4.5      max 4.5 m
```

The 3–4.5 m values are `hullSide()` on a tapered section plus the swell heave; the point is on the
plating, the box test is conservative. **Max 4.5 m against 46.3 m.**

`hit_portrait.png` and `p5_impact.png` are the same shot as `impact_0.png`. `burning_fleet.png` is
the enemy line late in a match: two ships burning with smoke columns, one listing hard, the roster
reading `Enemy 3/5 · sunk 3 2`.

### Why it leaks nothing

**Structural.** `drama.js` imports nothing from `js/sim` and is never handed a Game, a View or an
owner map. Its whole input is two boolean masks over the board, the cells of the ships that have
already gone down, the fleet's lengths, the private `dramaSeed`, and the arrangement currently on
screen — every one of which the player is looking at on the chart. There is no channel for the
unrevealed board to arrive through, so conditioned on the chart, the arrangement is independent of
the truth by construction.

**Measured, and this is the number that matters.** A raw correlation between the shown fleet and the
true one is *expected* and is not a leak: both are conditioned on the same public evidence. So the
test is a control — an independent layout drawn by rejection sampling from the sim's own placement
prior, conditioned on exactly the same chart. Over 2,681 positions and 247,285 unrevealed cells:

| | phi with the hidden truth |
|---|---|
| the dramatised fleet | **0.060** |
| a blind evidence-only guess (control) | 0.087 |
| 2σ | 0.004 |

**The fleet on the sea correlates with the hidden board *less* than a guess any player could make
from the chart.** (It is lower because the "prefer where the hull already is" bias makes it a poorer
posterior sampler, which here is a virtue.) `leak_test.mjs`.

### Soak

`drama_test.mjs`, ten independent runs: 60 matches each (10×10, 8×8, 12×12), **27,510 shots, zero
failures**, worst solve 4 ms. `stress.mjs` on the largest legal board (16×16, 12 ships): 2,856 shots,
worst solve 11 ms. The soak earned its keep — it caught two real search failures before any of this
ran in a browser (see "what the tests could not have caught" below).

## 4. The notice — D46

A fixed strip at the very top of the play screen, present from the first frame of the match:

> **Sea view is a mock-up. The chart is the real board.**

Tapping it opens the full sentence over the scene without pushing the HUD down:

> Where the ships sit on the sea, and where the shells land on it, are drawn for effect and are not
> the real positions. Everything true about this battle is on the chart: your fleet in the box below,
> the enemy's on the plotting table.

It says the true thing plainly and it names both halves Aaron asked for — ship positions *and* impact
positions — and then says where the truth is instead, which the old caption never did. No legal
padding: no "for illustration only", no "not to scale". It fades with the rest of the HUD during the
fleet fly-out.

`caption.js` is unchanged: D2's brevity stands for the in-flight caption and the two now do different
jobs — the caption marks the moment, the strip is where you can learn what it means.

`first_portrait.png` is the moment a player first meets it: the notice is on screen over the opening
flyover, which is exactly when they are looking at the sea and forming the wrong belief about it.

## 6. Soak, budget

Ten turns, portrait 390×844, save, genuine reload, resume (`soak.mjs`), with the shown fleet checked
against the chart after **every** shot:

| | |
|---|---|
| consistency failures over 10 turns | **none** |
| after reload + resume | none |
| console errors/warnings | **clean** |
| draw calls with damage on screen | **78 main** (104 worst observed, ceiling 120) |
| triangles | 82k |
| texture | **39.6 MB** of 45 |
| live vfx | 5 |

A separate late-match run with three damaged hulls and two sunk: **70 main calls** (87 with shadows),
39.5 MB. The D44 look cost nothing measurable — the fire fields are shared instanced meshes, so more
burning ships is more cards, not more draw calls, and the card budget is what `BURN_CAP` protects.

Regression: `hit_explode`, `fleet_wide`, `guns_fire`, `splash_miss` all render (`tools/shot.mjs
--dpr=1 --w=1600 --h=900`). Scenarios use `stage()`, not `layout()`, so the station hashing change
cannot reach them.

---

## What my tests could not have caught

- **No finger has touched any of this**, still true after five passes. Every tap in item 1 was a
  synthesised `Input.dispatchTouchEvent`. The eye's 44 px hit box overlaps the fleet button's by
  9 px on three sides; a synthesised tap lands on a point, a thumb lands on an area, and iOS Safari
  resolves that overlap on its own terms. Item 1 is exactly the kind of control where that matters.
- **Whether the re-forming fleet reads as station-keeping or as teleporting.** I measured the
  distances (`burn.mjs`): most shots move nothing, a typical move is 31.9 m — one grid cell — but the
  worst observed was **159.5 m in 1.1 s**, about 280 knots. It happens when a sink pins one hull and
  displaces others. It is covered by `fire_out` with the camera on your own guns 900 m away, so I
  believe it is masked, but nothing I ran can tell me whether a person watching the horizon sees it.
  Halving it means either a longer `steamMs` than `fire_out` affords or a solver that pays to move
  less; both are real options and neither is free.
- **Fast-forward.** Holding the screen runs the director at 4× but the fleet tween on the real clock,
  so `settle()` snaps the last of the move. Correct — the hit still lands on a hull — but a snap.
- **Whether the impact reads as a hit.** I can prove the explosion is on the plating to 4.5 m and I
  can look at the frame, but the D44 look has not been blind-scored. `hit_explode` was; this is that
  vocabulary in a live match, at a station and a light the scenario never had. It wants a critic.
- **The dark-hull problem.** In several impact frames the struck ship is a near-black silhouette
  against a bright dusk sea and the fire is the only thing reading. That is the tone-mapping item
  already on Wave C's list (§4), not something item 3 introduced, but item 3 is where it now shows.
- **Landscape play.** I measured all four beats in landscape and checked the HUD renders, but I did
  not play ten turns there.

## For DECISIONS.md

1. **A beat's standoff is solved from the range to its subject, not from the length of its offset.**
   `shell_chase` looks ahead of the round, so its 34 m offset put the camera 9.6 m from the thing it
   was framing. Any beat whose look point is not its subject has this shape. And where the range
   varies over the beat, the solve is a search over the whole beat, because pulling back moves the
   minimum — solving at the old minimum is the second wrong answer, and it looks like the right one.
2. **A beat that does not call `rig.fov()` inherits the last one.** `impact_hit` and `impact_miss`
   were posing at 36° because that is where `shell_chase`'s ramp ended, so they framed differently
   depending on what ran before them. Every beat should declare its own.
3. **The dramatised fleet is a constraint solver, not a seed.** `dramaSeed` alone cannot satisfy
   D43; what makes it safe is that `js/ui/drama.js` imports nothing from `js/sim` and its whole input
   is what is on the chart. Keep that import list empty and the leak proof is structural. The
   statistical claim needs a control, not an absolute: correlation with the truth is expected, and
   the question is whether it exceeds a blind evidence-only guess. It does not (0.060 against 0.087).
4. **Visual damage is derived from the board, never accumulated from events.** A re-pack can move a
   revealed hit onto a different hull, and a fire attached to the object it was spawned on would stay
   behind on a ship the chart no longer says was hit.
5. **`size` is a card budget and `scale` is a height.** Buying flame height through `size` costs four
   times the cards for the same metres, and the cards are shared with the impact that has to spawn in
   the same frame.

---

# P5 pass 2 — the chase beat

One file, one beat: `js/cine/sequences.js`, `shell_chase`. Nothing else moved, `js/config.js`
included — the beat needed no knob.

## Three faults, not one

**1. The camera was framing a point the shell had not reached.** This is the whole of the "round is
off screen for the first half" report. `Round.update()` runs `u = elapsed / ms` from **0**, and the
beat mapped its own time onto `start + (end − start) · u` with `start = 0.06`. Over a 900 m flight
that is **54 m of arc** the camera is ahead of the shell at `u = 0`, against a standoff that only put
it ~30 m behind the point it was framing — so the round was **behind the lens**, not merely off the
edge. The two clocks agree only where `0.06 + 0.91u = u`, at `u = 0.67`; the manager measured the
round entering at 48%, which is that crossing softened by the look-ahead. The beat now reads
`round.round.u` and falls back to the ramp only when there is no live round.

**2. The offset was built on the tangent, and at launch the tangent points at the sky.** `back` was
the chord over 0.055 of arc, which at `u = 0` is `(0, −28, −46)` — 28 m **below** the round. The
camera sat under a climbing shell looking up past it. Measured on the played beat, the horizon's NDC
y ran **−1.16 → +2.28**: off the bottom of the frame at the start (everything above it is sky, which
is the flat grey Aaron is looking at) and off the top by the end. The offset is now built on the
**horizontal course**, which is what "behind the round" means to a viewer.

**3. The look-ahead was unbounded.** Correct in intent — the impact has to be in frame before it
lands — but at launch `aim` is 0.09 of arc ahead, ~81 m, and 39 m higher. At any standoff that
throws the round outside a 42° portrait cone. The lead is now **clamped**: the look direction is
slerped back toward the round until the round is within `LEAD = 0.45` of the narrow half-frame
(`NDC = tan(offset) / tan(halfAngle)`). It binds for the first ~60% of the beat and releases as the
aim converges on the impact, so the end of the beat — where the manager's profile showed the lead
working — is unchanged in behaviour.

**The standoff search was searching the wrong quantity, and it did not need to be a search.** Pass 1
subtracted `at(u)` from `at(start + (end − start)·u)` and called it a lead vector; it is the gap
between the two clocks in fault 1. It also is not needed: `pos = head + zoom · off(u)`, so the range
from the round is **exactly `zoom · |off(u)|`** and the solve is `zoom = max(1, maxᵤ N(u) / |off(u)|)`
in closed form. Predicted 73.3 m at `u = 0`; measured 73.7 m on the played beat.

`halfW` went from `R · 3.7` to `R · 13`. 3.7 m frames the 1.35 m body and nothing else. The glow
streak alone runs ~17 m behind the head and the smoke trail further, so a frame cut to the body is a
grey field with a dot in it — which is also part of what Aaron was reading as "zoom out".

Everything is in calibres now, the trail term included. It was in metres first and that quietly
rotated the offset for big rounds: only the side and lift terms grew with `R`, so a salvo's camera
tipped toward overhead and its horizon left the top of the frame (measured: horizon NDC y 0.59 →
1.32, an all-sea frame). Scaled, a salvo composes identically to a shell.

## Measured — the round in NDC, on the played beat

`wl_chase2.mjs`. Every frame of `shell_chase`, `round.head()` projected into the live camera;
`offscreen` counts frames where `max(|x|, |y|) > 1`. "pass 1" is a reconstructed pass-1 tree, and it
reproduces the manager's numbers (they measured 80 offscreen / 4.5 worst; I get 69 / 4.47 on my own
match seed).

| portrait 390×844 | frames | offscreen | worst NDC | frame at round, min / mean |
|---|---|---|---|---|
| pass 1 | 155 | **69** | **4.47** | 7.6 / 30.7 m |
| pass 2 | 156 | **0** | **0.45** | **26.1 / 33.9 m** |

| landscape 1600×900 | frames | offscreen | worst NDC | frame at round, min / mean |
|---|---|---|---|---|
| pass 1 | 155 | **43** | **44.59** | 7.6 / 27.1 m |
| pass 2 | 155 | **0** | **0.43** | **26.1 / 34.1 m** |

```
through the beat      0%    10%   19%   29%   39%   48%   58%   68%   77%   87%   97%
pass 1, portrait     4.47  2.37  1.65  1.30  1.07  0.92  0.81  0.72  0.65  0.35  0.04
pass 2, portrait     0.20  0.20  0.22  0.28  0.37  0.45  0.41  0.31  0.24  0.21  0.02
pass 1, landscape    0.70  1.26  8.75  1.57  0.69  0.46  0.35  0.27  0.23  0.13  0.02
pass 2, landscape    0.43  0.42  0.39  0.35  0.25  0.25  0.24  0.27  0.34  0.37  0.09
```

The 0.45 plateau is the clamp holding; the fall after it is the clamp releasing.

And the composition, since 70% sky was half the complaint — the horizon's NDC y, +1 top, −1 bottom:

```
pass 1, portrait   -1.16 -0.85 -0.53 -0.21  0.14  0.47  0.82  1.20  1.57  1.89  2.28
pass 2, portrait    0.13  0.17  0.21  0.25  0.32  0.44  0.57  0.66  0.71  0.74  0.62
```

Pass 1 opens with the horizon **below the frame** — the shot is all sky — and ends with it above.
Pass 2 opens with the sea holding 56% of the frame and closes at 86% as the camera looks down onto
the impact. Neither end is a flat field.

Other ordnance, portrait, played: **heavy** 0 offscreen, worst 0.44, frame 44.4 / 59.8 m; **salvo**
0 offscreen, worst 0.40, frame 67.9 / 88.3 m, horizon 0.14 → 0.76 — the same profile as a shell,
which is the point of the calibre fix.

Under 4× fast-forward, portrait: pass 1 had the round outside the frame for **all 39** frames of the
compressed beat (worst 54.6); pass 2, **0** (worst 0.28).

Cost, sampled inside the beat over three shots: **83 → 86 draw calls** against the 120 ceiling,
77.5k → 92.8k triangles, ~60 fps, console clean on both trees. The extra calls are real — a wider
frame holds more of both fleets — and they are inside budget.

## Frames

`p2chase_0/1/2.png` in the scratchpad, portrait 390×844, captured from inside the played beat 12 s
after the opening settled, with the round's NDC printed for each:

| | `u` | round NDC | what is in it |
|---|---|---|---|
| `p2chase_0.png` | 0.051 | 0.16, −0.20 | the round and its trail dead centre over the sea, own escorts under way top-left, horizon at 38% |
| `p2chase_1.png` | 0.365 | 0.31, −0.15 | round mid-frame, three hulls with wakes, sea holding two-thirds |
| `p2chase_2.png` | 0.685 | 0.40, 0.10 | the enemy line under the arc, round upper right, horizon at 22% |

`p2land_1.png` is the same beat at 1600×900: the round in frame, the fleet in the sun's glitter path.
Compare `chase2_0/1/2.png`, the manager's pass-1 captures.

## The re-pack, since I was in the beat

`wl_repack3.mjs`, 16 shots, tracking the fastest-moving side-1 hull every frame and projecting both
its previous and its current world position **through the same live camera**, so the camera's own
motion is out of the number.

- Every movement frame I sampled, across three runs, is tagged **`fire_out`**. Not one landed in
  `shell_chase` or in either impact beat. `settle()` before the tracer is doing its job.
- While it is on screen it is at **969–975 m** and in the band **NDC y 0.02–0.20** — on the horizon,
  behind the hour slate on the first shot of a match and under the fleet box after.
- Its own screen displacement is **0.03 NDC/s**, mean and max: about 6 px/s on a 390 px phone, ~7 px
  over the whole 1.1 s move, while the camera is craning across your own bow and the guns are firing
  into the lens.

**A number I cannot see.** The fastest on-screen move in this sample was 43 knots; I never caught the
159.5 m / 280 knot case, which needs a sink to displace several hulls at once. Scaled linearly that
is ~0.2 NDC/s, ~40 px over the move, still at a kilometre and still under `fire_out`. I would not
spend a longer `steamMs` on it.

## Correcting one line of pass 1's record

Pass 1's DECISIONS note 1 says `shell_chase`'s 34 m offset "put the camera 9.6 m from the thing it
was framing". The camera stands off the **round itself** — `pos = head + off` — so the range was
always `|off|`, ~30 m. The 9.6 m was the distance to a round that was 54 m of arc behind the framed
point, i.e. it was fault 1 measured through a distance meter. The general lesson in that note is
still right; the mechanism named in it is not.

## What my tests could not have caught

- **Whether it reads.** Nothing here has been blind-scored. I can prove the round is in frame every
  frame and that the horizon sits where a horizon should; I cannot prove the shot is *good*. The one
  I would put in front of a critic is the clamp's plateau: for the first 60% of the beat the round
  sits at a constant NDC 0.45 while the world moves under it, and a constant screen position can
  read as a locked-off camera rather than as a chase.
- **One seed per aspect.** Every profile above is one shot of one match. The arc geometry barely
  varies — every enemy cell is ~900 m out — but a shot at the far corner of a 16×16 board is a longer
  course than anything I fired.
- **Fast-forward still ends the beat early.** The director runs at 4× and `Round.update` runs on the
  real clock, so the beat ends with the shell at `u ≈ 0.25` and the impact cuts in while it is still
  in the air. That mismatch is not mine to fix from this file — `shell.js` owns the round's clock —
  but the failure has changed shape: the camera now stays *with* the shell instead of racing ahead of
  it, which is why the FF numbers above are what they are.
- **No finger.** As every pass before: `Input.dispatchTouchEvent`, never a thumb. Free look is a live
  offset applied after the timeline, so a player dragging during the chase can put the round outside
  the frame deliberately, and I have not measured what that feels like against the clamp.
- **The dark-hull tone-mapping item is still there** and the chase now shows more hulls per frame
  than it used to, so it shows up more often.

## For DECISIONS.md

1. **A beat that follows a live object reads that object's clock. It does not re-derive one.**
   `shell_chase` mapped beat time onto its own stretch of the arc while the round ran `elapsed / ms`
   from zero, and the 0.06 of arc between them was enough to put the subject behind the camera for
   half the beat. Every framing number came out right because they were all measured against the
   frame; nobody projected the subject into it.
2. **Distance is not framing.** The pass-1 numbers were true and the picture was wrong. A framing
   claim is a claim about where the subject lands in NDC, and the only test for it is to project the
   subject into the live camera on the played beat, every frame. Frame width at the subject cannot
   detect a subject that is not in the frame — it is happiest when the subject is furthest away.
3. **A look-ahead is a composition and therefore has a budget.** Lead the subject by an angle, capped
   as a fraction of the *narrow* half-frame, not by a distance along its path: a distance ahead is an
   angle that grows without bound as the standoff closes, and the aspect that makes the frame narrow
   is the one that cannot afford it.
4. **Behind a climbing object is not back along its tangent.** At launch the arc points 33° up, so a
   camera set back along it is *under* the shell — the sky Aaron filed. Trail on the horizontal
   course and spend the pitch on the horizon.
5. **If part of an offset is in calibres, all of it is.** One term left in metres rotates the whole
   offset as the calibre changes, so a salvo composed differently from a shell — the same class of
   fault as a beat that does not declare its own `fov`.
