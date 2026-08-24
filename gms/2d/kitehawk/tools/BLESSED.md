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
