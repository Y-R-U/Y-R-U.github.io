# BLESSED — the anti-mock record

DESIGN §10.8: *every assert must be validated by deliberately breaking the constant
it guards and confirming the test fails. A test that still passes after you revert
the fix was never testing the fix.* This file is that record for P4.

The switches live on the airframe as `bug`, exactly the way P1 shipped `?impl=screen`
alongside the correct parallax: **the forbidden implementation is in the shipping
module, behind a flag no shipped airframe sets**, so it can be measured rather than
argued about.

```bash
node tools/sim.mjs --fixtures                     # 9/9, hashes checked against BLESSED.json
node tools/sim.mjs --fixtures --bless             # rewrite BLESSED.json
node tools/sim.mjs --fixtures --break <name>      # revert one thing; expect red
node tools/sim.mjs --gates    --break <name>
```

Blessed hashes are in `tools/BLESSED.json`, written by `--bless`. They are FNV-1a over
every 6th tick of `(sx, sy, svx, svy, theta, roll)`.

## The seven switches, and what each one actually broke

| switch | what it reverts | fixtures red | gates red |
|---|---|---|---|
| `lift-body-axis` | lift resolved along the body normal (DESIGN §1.3 as written) instead of the wind axis | **loop** (12.3 s, alpha 146°), **glide** (L/D 2.44 vs 7.94) + all 8 hashes | **F8** 2.247, **F9** −3.41, **F10** 0.601 |
| `no-limiter` | `alphaMargin` 0.94 → 1.6: the alpha limiter off | **loop** (7.68 s, alpha 28.4°), **stallTurn**, **splitS**, **landing**, **stallSides** | none |
| `no-margin` | `AGILITY_MARGIN` → 1.0: the arcade manoeuvre margin removed | all 9 | **F6** 372 wu, **F9** −17.15 |
| `flat-atmosphere` | `H_SCALE` → ∞: altitude stops costing anything | all 9 | **F3** 14.78, **F9** −5.53, **F10** 1.000 |
| `no-flutter` | airframe `cFlutter` → 0: the high-speed drag rise removed | diveRecover hash only | **F5** terminal 98.94 = Vne × 1.064 |
| `no-stall-bias` | `STALL_BIAS` → 0: the nose no longer falls out of a stall | **stallRecover** (never recovers), glide hash | none |
| `fixed-drop` | the seeded wing drop replaced by a fixed side | **stallSides** 0L/12R | none |

## Two switches that the first version of this suite could not see, and what it cost

**`no-stall-bias` passed everything.** The stall-turn fixture reversed the aircraft
just as fast without the pitch-down bias, because the *wing drop* alone does it. One
of DESIGN §1.6's three stall components had no assert anywhere in the suite. Fixed by
adding **`stallRecover`**, which asserts the thing the bias is actually for: with the
stick still held hard back, the wing must bite again within 2.5 s of the break. Broken,
it never recovers.

**`fixed-drop` changed nothing at all.** Every other fixture runs one seed, and that
seed happened to draw the same side the broken build hardcodes — so a feature
(seeded, both-sided wing drop) was completely unprotected while looking covered.
Fixed by adding **`stallSides`**, which runs twelve seeds and requires at least three
of each side. Shipped: 4L/8R. Broken: 0L/12R.

Both are the D47 shape — a criterion that could not catch the bug it existed for — and
both were only visible because the broken build was run, not reasoned about.

## One switch that is only caught by a gate, deliberately

`no-flutter` moves exactly one fixture hash and no fixture assert. That is correct:
the flutter term's whole job is the terminal-velocity number, and **F5** is its guard.
Recorded here so nobody later "fixes" the fixtures to cover it.

## One criterion that cannot fail by construction, and that is correct

**F14, zoom neutrality**, compares the run summary under `--zoom 0.78` and `--zoom 1.22`.
It is byte-identical because **nothing under `js/sim/` reads the flag at all** — which is
the property §4.3.5 and rule 17 demand. There is deliberately no `--break` for it: the
only way to make it fail is to plumb the camera into the sim, which is the thing being
forbidden. It is a tripwire for a future change, not a measurement of today's build, and
nobody should read its green as evidence of anything else.

## What is NOT covered, and should be at P5

- `no-limiter` trips five fixtures but **no gate**. The limiter is a playability
  feature (DESIGN §1.6, "the player cannot stall by pulling"), and no numeric gate
  in the P4 table measures playability. P7's thumb harness or a CDP trace is the
  right home for it.
- Nothing yet asserts the **auto-throttle's anti-overshoot cut** (DESIGN §1.10) —
  it needs a target to sit behind, which is P5.
- Nothing asserts **greyout/blackout timing**. `diveRecover` records `peakStress`
  1.059 and 14.7 HP of over-stress damage, which covers the airframe half of D32 but
  not the pilot half.

## The second blessed fixture: `tools/p3guard.mjs` (P8c, D128)

Not a P4 airframe hash — a CONSTANT guard, and it lives here because it is the same
discipline. Landscape P3 is `hull × scale × zoomWide ≥ 34 px` and Aaron accepted it
knowingly at **34.0136 px**, a 0.04% margin (D128). A criterion passing by a hundredth
of a pixel breaks silently, so the guard asserts the **three terms separately** and the
failure message names which one moved and who owns it, rather than reporting "P3 broke".

```bash
node tools/p3guard.mjs                  # four asserts. exit 1 on red
node tools/p3guard.mjs --hull 65        # D128's mandated break-switch. RED
node tools/p3guard.mjs --zoomwide 0.73  # RED on the clamp floor
node tools/p3guard.mjs --worldh 561     # RED on the scale term
```

Every term is read live from the shipped module; only the blessed values and §4.4.2 P3's
34 px line are literals. All three arms were run and all three go red — including
`worldh`, which D128 calls stable, because "stable" is a claim and an assert never run is
not evidence. **It also prints the term D128 does not name**: `scale = view.h / worldH`,
so any landscape viewport shorter than **389.84 css px** fails P3 at the blessed
constants, and the reference 390 clears by 0.16 px. See `docs/P8C_NOTES.md` §1.

---

## P9 — the altitude ladder (`tools/ladder.mjs`)

P4 and P4b were "NOT MEASURABLE IN THIS HARNESS" from P8 until P9. The instrument is pure node —
`bandBlend` and the band table import without a GL context — and the model it measures is
`js/sim/world.js` §1, which the game reads too, so there is one implementation rather than two.

```bash
node tools/ladder.mjs                    # both orientations, 6 criteria
node tools/ladder.mjs --falsify          # every switch below, each required RED
```

| switch | what it breaks | criterion that must go red | measured |
|---|---|---|---|
| `--feather 2` | the band crossfade becomes a line | **P4b3** | 0.02 s against a 0.4 s snap floor |
| `--feather 400` | the crossfade crawls | **P4b3** | 7.4 s against a 4.0 s crawl ceiling |
| `--crane-rate 900` | the establishing crane outruns the thinnest band | **P4e** | Mud held 0.44 s against 0.8 |
| `--crane-seconds 1.0` | the crane never reaches the third band | **P4e** | 2/3 bands |
| `--span 700` | placed signatures too far apart to be co-visible | **P4b2** | 0.00 s against 1.5 |

**`--crane-rate 900` went STILL GREEN on its first run and the criterion was wrong, not the switch.**
"≥ 3 bands seen within the establishing shot" read loosely lets a faster, longer crane count Belt,
Floor and Deck while dropping Mud to 0.44 s — a criterion any faster camera satisfies is inert.
Tightened to §3.3 constraint 2's own subject: **the three lowest bands, by name.**

Two positive controls, because a metric that only ever reads low measures nothing:

- the closed form against a 1 wu sampled walk of the whole column, at every zoom the controller may
  choose: 12.3/12.4, 15.0/15.1, 20.3/20.4, and 35.8/35.9 at the cinematic 0.42 — agreement to 0.1%;
- the traversal metric responds: 15.0% at zoom 1.00 → 67.7% at zoom 0.20.

**Exit codes.** `ladder.mjs` exits 1 when anything except P4a goes red. P4a is a reported finding,
not a build break — its 55% bar is unsatisfiable by any renderer (5 boundaries × a 1,000 wu frame is
50% of a 10,000 wu column before any legibility bar applies). The falsifier reads a broken arm's
stdout off the thrown `execFileSync` result for that reason; without it the falsifier dies on the
first arm that works.

## P9 — the held stick across a rotation (`tools/orient.mjs`)

D131's shipped-code bug. `?inputbug=noreanchor` is the pre-fix `js/core/input.js`, shipped alongside
and reached through `js/main.js`'s `?inputbug=` — the real path, not a harness override.

```bash
node tools/orient.mjs                    # 7 asserts
node tools/orient.mjs --falsify          # four switches, each required RED
node tools/orient.mjs --bug noreanchor   # one switch, with its numbers
```

| switch | criterion that must go red | measured |
|---|---|---|
| `canvas-measure` | view:change count (+ both stick asserts) | layout never leaves portrait |
| `nudge-on-rotate` | no entity moved on a rotation frame | 0.5 wu step |
| `clear-input-on-rotate` | the held stick survives every rotation | axis 0.000 |
| **`noreanchor`** | the held stick survives every rotation | **axisY −0.643 → −1.000** on the first thumb movement after a rotation |

**It went STILL GREEN on the first attempt**: `orient.mjs`'s `goto` forwarded only `viewbug=`, so the
break-switch never reached the page and was testing the fixed build against itself. A break-switch
that is not plumbed is indistinguishable from a fix that works.

## P9 — the world gate (`tools/worldgate.mjs`)

W5 (one wind evaluator) and W1 (the level validator), 9 criteria, 10 controls.

```bash
node tools/worldgate.mjs                      # the table; prints seed, sample size, profiles
node tools/worldgate.mjs --falsify            # every control below
node tools/worldgate.mjs --seed N --n 50000   # a different sampled domain
```

The forbidden second implementation is `windAtNearest` in `js/sim/world.js`, routed into the crate
**solver** — and therefore the AI's estimator — by `?bug=second-wind` on the existing `bugOf(ctx)`
channel. It agrees with `windAt` at every knot and disagrees between them, which is what a
divergence between two hand-written wind models actually looks like.

| control | criterion | measured |
|---|---|---|
| a genuinely second function object | W5a | `windAtNearest !== windAt` |
| a real `function windAt` line | W5b | the scan regex matches it |
| `windAtNearest` in the sampler | W5c | moves the comparison well off zero |
| `?bug=second-wind` in the solver | W5d | up to **28.22 m** of predicted impact |
| hand-rolled wind in `ai.js` | W5e | the scan regex matches it |
| six malformed wind tables | W5f | 6/6 named |
| bad visibility / time of day | W5g | 2 named errors |
| seven malformed levels | W1 | 7/7 named, and a legal level still passes |
| a stat dropped from `RUN_STATS` | W1b | the diff against a real `sim.mjs` summary moves |

**W5d must be swept over every profile, and this is why.** The per-profile deltas are
`calm 0.00m, steady 0.00m, knot-dense 0.15m, seeded#0 0.55m, shear 3.36m, seeded#1 12.99m,
seeded#2 14.80m, seeded#3 28.22m`. **A second wind evaluator is quiet, not loud** — on a
designer-plausible profile it moves the impact point by 15 cm. A single-profile control would have
measured 0.15 m against a 1 m bar and certified that W5 cannot fail.

**W5a/W5b/W5e are structural** — assertions about the shape of the source, which no runtime flag can
break. They are falsified by re-evaluating each against a deliberately wrong input and requiring
`false`, and the proof is printed rather than claimed.

**W5c is a migration proof, not an ongoing definition.** `windAtPreMove` in the gate is `windAt`
exactly as it stood in `crates.js` before P9 moved it, and the criterion is `worst |delta| == 0` over
10,000 sampled (profile, alt) pairs. The sampler hits **knots as well as the gaps between them**: a
nearest-vs-linear defect agrees exactly at every knot, so a knots-only sampler is blind to it.

## P9 — skygate's falsification arms ran in the wrong frame

`tools/skygate.mjs --falsify` carried its own `w=390&h=844` literals, so `--w 844 --h 390 --falsify`
set a landscape browser viewport and loaded a portrait page inside it. Every landscape control was
measured in portrait. Now one URL builder, one `goto`, and `load()` asserts the page came up in the
frame it asked for.

```bash
node tools/skygate.mjs --w 844 --h 390 --falsify              # A4 RED at multiplicity 4
node tools/skygate.mjs --w 844 --h 390 --falsify --framebug   # the guard fires, exit 1
node tools/skygate.mjs --w 390 --h 844 --falsify --framebug   # does NOT fire — see below
node tools/skygate.mjs --w 844 --h 390 --worldh 1000          # the pre-P9 sky.html measurement
```

**`--framebug` in portrait does not trip the guard, because there the literal happens to be right.**
That is precisely why the defect survived a whole phase: it is invisible in the orientation the
harness was written in, and only became a lie when D123 moved the target.

## P9 item 7 — the level generator, and three break-switches that were never plumbed

`tools/genlevels.mjs` writes `data/levels/{a1-01,a1-04,a1-12,a2-05}.json` and
`data/acts/{act1,act2}.json` from DESIGN §8.4/§8.5, transcribed cell for cell. **The table is the
source**; `--check` is W6 and it goes red on a one-byte hand edit.

```bash
node tools/genlevels.mjs --check                       # W6: 6/6 byte-identical
node tools/worldgate.mjs                               # 29 criteria; W4 is RED on a1-01, see below
node tools/worldgate.mjs --w3runs 20                   # the same, without the 2-minute W3 sweep
node tools/worldgate.mjs --falsify                     # 33 controls, all RED
node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json
node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json --break no-beats
node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json --break no-corridor
node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json --break camera-current
node tools/levelpage.mjs --falsify                     # level.html, both orientations, 6 controls
```

| break | what it restores | measured |
|---|---|---|
| `no-beats` | the level's content stripped, corridor only | a1-01 goes **4 occupied bands → 2**, 97.1 s → 51.8 s |
| `no-corridor` | the level stops being `0..length` | **254.3 s, never completes, 57,900 wu off the far end** |
| `camera-current` | the spawner fed the camera's current x | state hash **25732eb2 → 03e2d32b** |

**All three were STILL GREEN on the first attempt.** They were read straight off the command line
inside `levelRun`, so `--break no-beats` fell through `main()`'s dispatcher, printed *"must be one
of ..."* and **exited before running anything** — three controls returning byte-identical hashes,
which reads exactly like three controls that do not bite. Registered in `P9_BREAKS` now. D136's
`noreanchor` was the same defect.

**And a second, from the shell rather than the code:** the first comparison ran the four arms from a
zsh loop as `${b:+--break $b}`, and **zsh does not word-split an unquoted parameter expansion**, so
every arm received one argument named `"--break no-beats"`, `flag('break')` read false, and all four
arms silently ran the baseline.

**W4 is RED on `a1-01` and must not be tuned green.** DESIGN §8.2 gives act 1 a 600 m ceiling and
says *"Mud/Belt/Floor only"*; R-02's Floor ends at **450 m**, so a quarter of the act's legal column
is in Deck. See `docs/P9_NOTES.md` REQUEST-15.
