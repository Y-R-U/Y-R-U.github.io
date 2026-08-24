# CAMFIX — D100: the camera's anchors are fractions of the PLAYFIELD

```bash
cd gms/2d/kitehawk
node tools/hudcheck.mjs --cdp --secs 60      # H5 (and H2 H4 H11 H12) — the number D100 is about
node tools/hudcheck.mjs --node               # H7 moved; it is still green
node tools/camtrace.mjs                      # P2's zoom suites — byte-identical to before
node tools/sim.mjs --gates                   # 14/14, untouched
```

Two files: `js/core/viewprofile.js` (one new field per mode) and `js/core/camera.js`
(the placement lines in `cam.update`). Nothing else was edited.

---

## 1. What was actually wrong

Not the anchors, and not the lead. **They were unbounded, and they add rather than
oppose.**

`anchorY` is a fraction of the frame. So is the coaming, which owns the bottom 14% of
that same frame. Nothing connected the two, so nothing stopped the camera from parking
the aeroplane inside the instrument panel — and the velocity lead made it worse in the
same direction:

| | portrait | why it compounds |
|---|---|---|
| climbing | `anchorYClimb` 0.78 | pushed low **on purpose**, so the sky above is visible |
| + lead | `leadY` -240 wu / 1000 wu column = **0.24** | camera moves up, so the aeroplane moves further **down** |
| = | **1.02** | off the bottom of the screen |

Sideways is the same shape and worse. `anchorX` is mirrored by facing (P2's call), so
flying west the aeroplane sits at 0.66 — and `leadX` up to 240 wu on a **462 wu wide**
portrait frame is another **0.52**, in the same direction:

```
flying west, 61 m/s:  0.66 + 0.52 = 1.14  ->  x 443 on a 390 px screen
```

That is not "drifts right". **The player's own aeroplane is entirely off the screen**,
with an edge chevron pointing at it. `hud_full_t50.png` in the falsification pair is a
frame with no aeroplane in it at all. Measured `x p50` was 438–448 in some runs and
**8, −3** in others (off the *left* edge, when the bot happened to spend the mission
flying east) — the same defect, either side, depending on the sortie.

The leads are not wrong for landscape, which is what §4.1's numbers read as if they
were sized for: 420 wu of 1212 wu wide is 0.35, against portrait's 0.52.

## 2. The fix

**`VIEW_PROFILE[mode].playfield`** — the fraction of the frame the HUD owns nothing
permanent in. Every `anchorY*` and `anchorX` is now a fraction of *that*, and
`camera.js` clamps the aeroplane's own box inside it, on the settled camera as well as
on its target.

```
portrait   { top: 0.05, right: 0.72, bottom: 0.86, left: 0.11 }
landscape  { top: 0.06, right: 0.82, bottom: 0.86, left: 0.03 }
```

Every edge has a source; none of them is a number that was moved until something passed:

| edge | portrait | where it comes from |
|---|---|---|
| `bottom` | 0.86 | `1 - COAM_FRAC 0.14`, ART §10, exactly. Same band in landscape, where the coaming splits into two corners |
| `left` | 0.11 | the altitude tape's gutter, `(6 + 34) / 390 = 0.103` |
| `top` | 0.05 | under the objective / wind row, `40.6 / 844 = 0.048` |
| `right` | `specialSlot.x` | **derived, not copied** — see §4 |

D100 asked for an effective `anchorY` ceiling of about **0.845**, and that is what falls
out rather than what was typed in: `bottom 0.86` minus the aeroplane's own half-height
(`hull * 0.25 / visH` = 0.016 at zoom 1) is **0.844**. The margin is derived from the
hull each tick, so it is still correct at `zoomIntimate`, where a fixed 0.845 would not
have been.

**The clamp is applied twice, and the second one is not redundant.** `approachK(…, 10)`
is a 0.1 s lag against an aeroplane that is still moving, so a target inside the
playfield still leaves the aeroplane outside it for a few frames after a reversal. H5 is
a per-frame criterion, not a p95 one. A blended framing override is exempt: §4.3.4 lets a
cinematic put the aeroplane where it likes, and it only runs with the player out of
control.

`anchorY 0.62` etc. keep their authored values and their intent — the frame still leads
the aeroplane, and a climb still opens sky above it. They just cannot push it under the
chrome or off the screen any more.

## 3. The numbers

`tools/hudcheck.mjs --cdp --secs 60`, 390×844, seed 7, the canonical ~94 s run.
The "before" rows are the same build with the fix reverted through its own break switch,
so the two arms differ in one field.

```
                    H5 occluded frames      screen x p5/p50/p95     screen y p5/p25/p50/p75/p95
before  run A       783/5610   13.96%       74 / 438 / 440          168/395/395/633/739
before  run B      4129/5861   70.45%      -35 /   8 / 352          237/529/529/601/730
before  run C      1583/5284   29.96%      -61 /  -3 / 367          180/519/519/605/739
before  P7 report   977/5659   17.26%      293 / 448 / 479          133/204/457/526/707

after   run 1          0/5647    0.00%       —                       —
after   run 2          0/5587    0.00%       79 / 217 / 235          230/473/475/594/656
after   run 3          0/5591    0.00%       79 / 217 / 235          230/473/475/594/656
```

`occlBy` before: `{tape 222–3551, coaming 528–547, belt 238–335, special 32–48, banner 33}`.
After: `{}`.

Two things in that table beyond H5 going green:

- **y p95 739 → 656**, against a coaming top of 725.8. **x p50 438 → 217**, on a 390 px
  screen. The aeroplane is in the picture.
- **The after runs are repeatable and the before runs are not** — 13.96%, 70.45%, 29.96%
  on the same seed, because which edge the aeroplane fell off depended on which way the
  sortie happened to go. **P8 is about to measure framing, and until now it would have
  been measuring a coin toss.** That is worth as much as the fix.

**H5 PASSES: 0/5587 frames, three runs.** **H11 still FAILS** — see §5.

Everything else, re-measured:

- `node tools/sim.mjs --gates` — **14/14**, unchanged. F14 (zoom neutrality) still
  byte-identical.
- `node tools/camtrace.mjs` — the JSON is **identical to the pre-fix run except its
  timestamp**. Nothing here touches the zoom solver, and P2's Z1–Z6 are all zoom.
- `node tools/hudcheck.mjs --node` — **15/15**. H7 moved and is reported rather than
  buried: **200/200 warned first** (was 196/196), **median lead 6.49 s** (was 7.72),
  p10 **2.58** (was 2.40), min **1.95** (was 1.73). The median fell because the aeroplane
  now sits nearer the middle of its own frame, so a diver crosses the frame edge sooner;
  the worst case, which is the half of H7 that matters, improved.
- `node tools/corecheck.mjs` — both files are still in the pure tier.

## 4. `playfield.right` is derived, and that is the interesting bit

With the coaming, the tape and the top row cleared, H5 read **0.88% — 49 frames, all of
them `special`**. The special ring is the one permanent widget that sits *inside* the
column instead of in a band at an edge, so a rectangle cannot dodge it unless the
rectangle stops there.

```js
for (const P of Object.values(VIEW_PROFILE)) P.playfield.right = P.specialSlot.x;
```

Written as an assignment rather than as `right: 0.72` **on purpose**. A copied 0.72 would
go stale the first time anyone moves the special, and H5 would then fail for a reason
nobody would connect to the move — this project has been bitten twice by a value declared
in two places (D72, D95).

The cost is that the westward framing asymmetry narrows: the mirrored anchor lands at
0.513 of the frame instead of 0.66, and the lead can carry it to 0.635. It still leads,
it is still mirrored, and it no longer hides the aeroplane behind a button.

## 5. H11 is better and still red, and it is not the camera's any more

```
before   7.84%   14.31%   15.44%      (+ P7's 7.78%, and 10.47% in shots/p7_hudcheck.json)
after    2.23%    8.18%    8.17%      cap 2%
```

Directionally the fix is worth roughly half of H11, but **H11 does not have a single
value** — D101 already said so, and the spread above is on a fixed seed with a fixed
thumb rest, because the thumb driver runs in real time.

What is left is geometric and it is *not* the coaming. The thumb rests at y 728 with an
82.5 px disc, so the disc's top edge is **y 645 — 81 px above the coaming**. The
aeroplane's y p95 is 656. To take H11 to zero the playfield's bottom would have to be
about **0.75 instead of 0.86**, i.e. surrender the 11% of the column between the coaming
and where a hand actually holds the phone.

**I have not done that, and it should not be done to make H11 pass.** It is a real
choice — either the thumb rest moves, or the stick stops being where the hand is, or H11
is restated as "the coaming and the permanent chrome", which is what ART §10's sentence
is actually about. Handing the bottom quarter of a portrait column to a criterion is
exactly the trade D2 says portrait exists to avoid.

## 6. Falsification

Every phase here has shipped a check that could not catch its own bug, so the switch was
built before the fix was trusted.

**`cam.mode.frame = 'full'`** restores the pre-D100 placement lines exactly — anchors as
fractions of the whole frame, no margins, no clamp. It is read every tick, so a harness
can flip it on a live page with no code path of its own.

| check | shipped | `frame: 'full'` |
|---|---|---|
| H5, in the browser, bot-driven, matched pair, same seed | **0/3600  0.00%** | **783/3600  21.75%** — `{tape 80, coaming 639, belt 259, special 69}` |
| H5, thumb-driven, `hudcheck --cdp` | 0/5587  0.00% | 4129/5861 **70.45%**, 1583/5284 **29.96%** |
| the invariant in node, 4 flight profiles × 3601 ticks | **0 frames outside the playfield** | **3019–3554** outside |

The node arm drives the real `camera.js` with full-speed reversals, sustained max climbs
and dives at 450 m, at 105 m, along the ground, and in landscape, and asks only whether
the aeroplane's box ever leaves the playfield.

**One honest hole in it.** The world-bounds clamp (`cam.bounds`) runs last and wins, so
below ground level the invariant breaks — 470 frames in an early run. The flight model
never goes there (with the aeroplane held at or above `y = 0` it is 0 frames in every
configuration), and the arithmetic says the bound only binds below `py = 264 wu`, about
40 m *under* the ground. Reported rather than papered over, because "the check passes as
long as nobody flies underground" is the kind of sentence that ages badly.

## 7. Two things bigger than this fix

1. **`leadMax 240` is sized for landscape, not portrait.** It is 52% of the portrait
   frame's width and 24% of its height, against 35% and — the landscape column being
   shorter — 75%. The clamp bounds the symptom; the lead itself is still large enough
   that it spends real time pinned against the bound, which is why the after runs are so
   repeatable. If P8 or P10 wants the frame to feel less rigid at the edges, the honest
   change is `leadMax`, and it needs a DECISIONS entry because §4.1 is verbatim.
2. **`js/main.js` cannot flip the break switch.** It forwards `slew`, `margin`, `track`
   and `enforce` from the URL; `frame` should join them (`frame: q.get('frame') || undefined`)
   so `?frame=full` works in the real game the way `?slew=symmetric` does. One line, in a
   file this task does not own. **REQUEST to the manager.**

---

# D106 / D107 — the lead, and the switch in `main.js`

## 8. `leadMax` portrait 240 → 162, and it is measurably inert in play

D106 authorised it and it ships: **162 wu = 35% of portrait's own 462 wu frame**, the
fraction landscape's 420 is of its 1212. Landscape unchanged. `js/main.js` now forwards
`frame` from the URL alongside `slew`/`margin`/`track`/`enforce` (D107) — one line,
nothing else in that file touched, so `?frame=full` reaches the real game.

**But it does not move the aeroplane, and the measurement says why.**

`cam.clipTicks` and `cam.capTicks` were added to answer the coordinator's question — two
integer counters, sampled against `cam.tick` over a trace window:

| | leadMax **240** | leadMax **162** |
|---|---|---|
| `leadMax` itself bound | 2.7% of ticks | **47.6%** of ticks |
| the playfield clamp discarded lead | **67.9%** (2445/3600) | **67.9%** (2445/3600) |
| screen x p5/p50/p95 | 83 / 213 / 237 | 83 / 213 / 237 |
| screen y p5/p25/p50/p75/p95 | 144/402/455/612/677 | 155/402/455/612/670 |

Bit-identical clip counts and an identical x distribution, with the cap biting on half the
ticks instead of one in forty. **The cap is real and it changes nothing**, because every
tick it bites on is a tick the playfield was already discarding *more* lead. Aaron's own
rule: force a suspect term to a constant, and identical output means the experiment
failed, not the hypothesis.

**The term that is sized for the other orientation is `leadSeconds`, not `leadMax`:**

```
portrait   0.55 s x 280 wu/s cruise = 154 wu = 33% of a 462 wu frame
landscape  0.70 s x 280 wu/s cruise = 196 wu = 16% of a 1212 wu frame
```

`leadMax 240` never bound in level flight at all — it needs 436 wu/s, which is above F4's
top speed. Combat cruise is ~280 wu/s, so the lead the camera actually applies is set by
`leadSeconds × v` and it is **twice the fraction of the frame** its landscape counterpart
is. Matching landscape would put portrait `leadSeconds` near **0.27 s**. That is a second
§4.1 constant and it is not in D106, so it has not been touched — **REQUEST to the
manager**, and it is the change that would actually take the clamp out of the loop.

**The first instrument for this question read 0.0% and was wrong.** "Is the aeroplane
touching the playfield bound" is what a harness reaches for, and it reports 0.0% on every
run — including a positive control with the bound deliberately moved to 0.45, which moved
x p95 from 237 to 140 while still reading 0.0% pinned. The position damping lags its
target by `v/k` ≈ 34 px at cruise, so the camera approaches the bound and never arrives.
The quantity that matters is whether the clamp *discarded* lead, which only the camera
can answer — hence `clipTicks`. A metric reading 0.0% while the clamp does two-thirds of
the work is this project's believable-wrong pattern again.

## 9. Re-verified after D106/D107

- `node tools/sim.mjs --gates` — **14/14**.
- `node tools/hudcheck.mjs --node` — **15/15**.
- `node tools/camtrace.mjs` — still identical to the pre-fix baseline **except its
  timestamp**.
- `node tools/hudcheck.mjs --cdp --secs 60` — **H5 0/5649 frames, 0.00%**. H12 713 px/min.
  H11 2.23% (2.23–8.18% across runs), **left failing and documented per D101**.
- break switch — `cam.mode.frame = 'full'`, matched bot-driven pair: **0.00% vs 24.28%**,
  `{tape 124, coaming 638, belt 285, special 120}`. Still red.

---

# D108 — `leadSeconds` 0.55 → 0.27, the term that was actually doing it

## 10. What moved, and the plain answer to "is it at the right level"

Portrait `leadSeconds` **0.55 → 0.27** (16% of a 462 wu frame, as landscape's 0.70 s is of
its 1212). **`leadMax` stays at D106's 162** and that is now coherent rather than
symptomatic: 35% of the frame width, the same fraction landscape's 420 is of its, and at
0.27 s it no longer binds in level flight at all — it needs ~600 wu/s, which is a Vne
dive, which is the case a cap exists for. Landscape untouched.

| bot-driven, 3600 ticks, seed 7 | `leadSeconds` **0.55** | `leadSeconds` **0.27** |
|---|---|---|
| playfield discarded lead | 67.9% of ticks (2445) | **45.9%** (1651) |
| mean discarded per clipped tick | **77.4 px** x, 0.1 px y | **51.0 px** x, 0.0 px y |
| lead discarded per tick, all ticks | 52.6 px | **23.4 px** (−55%) |
| `leadMax` bound | 47.8% | **0.0%** |
| screen x p5/p50/p95 | 83 / 213 / 237 | **104 / 208 / 227** |
| screen y p5/p25/p50/p75/p95 | 155/402/455/612/670 | **206/410/462/589/615** |

**Plainly: it moved, it more than halved, and it did not drop to something small.** The
count is still 45.9%. But the cause has changed, and the count on its own would have hidden
that — hence the magnitude column, which is why `clipSumX/Y` was added alongside the
counters. A count cannot tell a 10 px clip from a 150 px one and the two mean opposite
things.

**What is left is not the lead. It is that the playfield is only 0.61 of the frame wide.**
`playfield.right = specialSlot.x = 0.72`, so the westbound mirrored anchor sits at 0.513
and the bound is at `0.72 − 0.069` = 0.651: **54 px of headroom before any lead is added at
all.** At 0.27 s that headroom is used up above **237 wu/s ≈ 35 m/s**, and combat cruise is
~280. So the residual clipping is the special ring occupying the right 28% of the column,
not a lead that does not fit. **The fix that would remove it is moving the special to an
edge** — a HUD and one-thumb-ergonomics call, not a camera one, and not mine.

## 11. Does it read as tighter, or as the camera lagging?

**Tighter and more centred, and the distribution contracts on all four tails** — x
83→104 / 237→227, y 155→206 / 670→615. Nothing gets further from the middle.

It does not read as lag, and there is a reason rather than an impression: **the vertical
opening is done by the anchors, not by the lead.** `anchorYDive` 0.30 and `anchorYClimb`
0.78 (as playfield fractions) still put the sky you are going into on the correct side of
the aeroplane; what the 0.55 s lead was adding on top was *overshoot* — in a dive it took
the aeroplane to y≈90, up against the objective banner, and the same dive now sits at
y≈180 with the ground it is diving at fully visible below. Cruise frames are unchanged.
For P8: the frame is now noticeably calmer, and the aeroplane's own position is the most
stable it has been.

## 12. Re-verified after D108

- `sim.mjs --gates` **14/14**. `hudcheck --node` **15/15** (H7 200/200, median 6.49 s).
- `camtrace` — still identical to the pre-fix baseline **except its timestamp**.
- **H5 0.00% on three runs** (0/5180, 0/5528, 0/5818). H12 837 px/min.
- **H11 fell out green without being touched: 0.00% on all three runs**, from 2.23–8.18%.
  The mechanism is measured, not hoped for: the shorter lead pulled y p95 670 → **615**,
  and the thumb disc's top edge is at **645**, so the aeroplane no longer descends into
  the thumb's reach at all. **D101's caveat still stands** — this is the shipped rest
  position (0.75) only, and H11 has never had a single value; a rest-position sweep at the
  new lead has not been run. Reported as "no longer the binding problem", not as "solved".
- break switch `cam.mode.frame = 'full'` — **still red, 0.00% vs 4.92%**
  (`{special 139, tape 38}`). **Its margin shrank from 24.28%, and that is the expected
  direction**: D108 removed the term that made the unclamped camera catastrophic, so the
  clamp now does less work. It is still load-bearing — 4.92% is not 0.00% — but the
  camera no longer depends on it to be playable, which is what a fix at the right level
  looks like.
