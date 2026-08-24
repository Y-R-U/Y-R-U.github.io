# BLESSED — P5's anti-mock record

DESIGN §10.8: *every assert must be validated by deliberately breaking the constant it
guards and confirming the test fails.* P4 put its switches on the airframe as `bug`;
combat's live on **`ctx.bug`**, because a gun, a lock and a morale table are not
properties of an aeroplane. The forbidden implementation ships **inside** the module
behind a flag no game ever sets, exactly the way P1 shipped `?impl=screen` next to the
correct parallax.

```bash
node tools/sim.mjs --p5fixtures                    # 10 fixtures
node tools/sim.mjs --break <switch> --p5fixtures   # revert one thing; expect red
node tools/sim.mjs --break <switch> --combat       # the gunnery rig, broken
node tools/lab/zoomtrip.mjs                        # C9's tripwire, made able to fail
```

## The nine switches, and what each one actually broke

| switch | what it reverts | measured effect |
|---|---|---|
| `no-overpenetration` | a destroyed component keeps soaking 65% of every round | **`timeToKill` 0.87 → 1.82 s**; `straddle` ratio 0.76 → 0.94 |
| `hitscan` | rounds arrive instantly at the target — no drop, lead, dispersion or travel | **`hitAspect` red**: all four aspects collapse to the identical histogram (pilot only). The geometry is gone. |
| `no-convergence` | both ports on the boresight | **`hitAspect` red**: dead astern stops reaching the tail |
| `no-cone` | the auto-fire cone opens to 90° | **`coneStrict` red**: 0 rounds at 20° off-nose becomes a burst |
| `no-hysteresis` | the 0.40 s lock hold removed | **`lockStability` red**: 5 lock changes per 10 s → 6 |
| `aim-noise-per-tick` | the `k` error resampled every tick instead of held | `kMonotone` gradient collapses — the believable-wrong-metric shape |
| `no-morale` | morale never falls | flee rate → 0.0% (gate C8 red) |
| `no-promotion` | the 2.5 s delay on a dead leader | A11's `killLeader` counter loses its value |
| `zoom-range` | gun range scales with `ctx.zoom` | **gate C9 red** — see below |

## The one that closes a hole P4 named

P4_NOTES §6 records that F14, zoom neutrality, *"cannot fail by construction… nobody
should read its green as evidence of anything"*. That was true and it is not any more.
`zoom-range` plumbs the camera into the weapon, which is the exact thing §4.3.5 forbids,
and the run summaries diverge immediately:

```
bug="none"        zoom 0.78 -> 1/2    zoom 1.22 -> 1/2    IDENTICAL   (C9 green)
bug="zoom-range"  zoom 0.78 -> 2/1    zoom 1.22 -> 11/0   DIFFERENT   (C9 red)
```

C9's green is now evidence of something.

## Two fixtures that could not catch the switch they exist for

Both are the D47/D78 shape, and both were found by running the switch rather than
reasoning about it.

**`lockStability` measured 5 changes per 10 s with the hysteresis in and 5 with it
removed.** The scenario put every candidate permanently inside the cone, so the
hysteresis branch never executed. Fixed twice over: the targets now weave *across* the
cone edge, and the assert is **differential** — it runs the same scenario with
`no-hysteresis` live and requires the 0.40 s hold to be doing measurable work. An
absolute count against register T13's "< 4" cannot fail when the feature is deleted.

**`kMonotone` measured a gradient of 0.0 points against A10.** That cell reads 86% at
every value of `k`, and a ceiling cannot show a gradient. It is measured on the mirror
cell instead, where the win rate sits mid-band and has room to move: 49.1% at `k` 0.25
against 34.0% at 0.95, a **15.2 point** gradient.

## The placebo that was not one

The counter-play harness (gate C6) runs a control: two deliberately irrelevant scripts
through the identical machinery, so that "worth 18 points" can be distinguished from
"this bot is better".

`placeboB` — holding a sinusoidal altitude — behaves: over sixteen aces it never
exceeds **+4.5 points** and averages **−29**.

`placeboA` — a slow porpoise — **does not**. It is worth **+35.1 points against A10**
and +24.1 against A3. On inspection it is not meaningless at all: a porpoise is a lag
yo-yo, and a lag yo-yo is a real manoeuvre. It is not a valid control, this file says so
rather than quietly dropping it, and the counter numbers in the report are stated
against `placeboB` alone. A plausible-looking control is as dangerous as a
plausible-looking metric.

## What is NOT covered

- **`no-morale` and `no-promotion` move no fixture**, only gates — the flee rate and the
  A11 counter respectively. That is correct (they are population effects, not single-
  fight ones) and is recorded so nobody later "fixes" the fixtures to cover them.
- **Nothing falsifies the framing-box contributions.** `framingContributions()` is pure
  and tested by inspection only; the camera side of it is P7/P8's and the criterion that
  would catch a mistake — rule 18's "a boss contributes its engaged section only" —
  needs a boss, which is P9's.
- **`recycle` proves the pool is order-independent, not that it is state-free.** It runs
  the same duel alone and after fifty others and requires identical summaries. A
  carry-over that is symmetric between the two aircraft would pass it.
