# P9 — world, terrain, level format, generator

**Resumable handoff. Written from the first working step and updated as things land.**

> **State at handoff.** Items 0a–7 are landed and falsified. `--p6gates` **9/10**,
> `worldgate` **22/22 → 29 criteria, 28 green** with **33/33 controls RED**; the one red is **W4 on
> `a1-01`**, refused rather than tuned (REQUEST-15).
> **Item 7 landed** (D146 unblocked it): the codebook, `tools/genlevels.mjs`, the four worked levels
> in `data/levels/`, the two acts in `data/acts/`, and a level runner in `sim.mjs` so W3 and W4 are
> measured rather than asserted. **Item 8 landed too** (`level.html` + `tools/levelpage.mjs`, 7/7),
> and **the portrait gate's P7 row is measured for the first time** (§11b, print only).
> **Five REQUESTs are new: 13, 14, 15, 16, 17.**

Read `docs/MANAGER_STATE.md` then `DECISIONS.md` D113–D140 first; this file assumes them.

Tuning target is **landscape** (D123). Portrait stays first-class and is re-run as a regression
after every change (D123, and the brief).

---

## Status board

| # | item | state |
|---|---|---|
| 0a | `js/core/input.js` loses the held stick on `view:change` (D131) | **LANDED, falsified, portrait clean** |
| 0b | `tools/pages/sky.html` hardcodes `worldH: 1000` (D131) | **LANDED — A4 was NEVER real** |
| 0c | `skygate --falsify` ran portrait whatever `--w/--h` said (manager) | **LANDED — controls now RED in landscape** |
| 1 | altitude-ladder re-proportioning (D126) — how it READS, never its metres | **LANDED** — `js/sim/world.js` §1 |
| 2 | `js/sim/world.js` §2 — wind/gusts/visibility, one evaluator (W5) | **LANDED** — `tools/worldgate.mjs`, 9 criteria |
| 3 | `js/data/validate.js` — W1, and D126's signature rule **enforced** | **LANDED** — 7/7 rejected by name |
| — | make P4/P4b measurable (band crossfade) | **LANDED** — `tools/ladder.mjs`, 6 criteria, 5 break-switches |
| 3b | **K5 re-specification (D139)** — HP per sortie, falsified | **LANDED — §4.** `--p6gates` 8/10 → **9/10**; K5 **0 → +85.43 ±4.69 HP/sortie, t 18.2**. D139's own +7.4 premise falsified at 240 sorties |
| 4 | `js/data/level.js` + `act.js` — the format | **LANDED — §5.** `worldgate` 10/10 → **15/15**, 19/19 controls RED. W6a loader round trip, W7 6 KB cap, WA the act |
| 5 | `js/sim/spawner.js` — beats on camera X, pooled (W8) | **LANDED — §6.** `worldgate` 15/15 → **19/19**, 22/22 controls RED. W8 0 dropped spawns, pool flat, peak 15 of 16 |
| 6 | `js/sim/terrain.js` — also unblocks the gate's P7 | **LANDED — §7.** `worldgate` 19/19 → **22/22**. Silhouette + the particle query. **The gate's P7 row is now wired and printed — §11b** |
| 7 | `tools/genlevels.mjs` + the four worked levels (W3, W4, W6, W7) | **LANDED — §9.** `worldgate` 22/22 → **28 of 29**, 33/33 controls RED. W6 byte-identical, W3 clean over **1,000 runs x 4 levels**, W7b 31% of the cap. **W4 is RED on a1-01 and NOT tuned — REQUEST-15** |
| 8 | `tools/pages/level.html`, landmark placement hooks | **LANDED — §10.** `tools/levelpage.mjs` 7/7, 6/6 controls RED, landscape **and** portrait. It caught a real defect: the loader's sort hid W1e from every consumer |

**Next concrete action:** P9 is complete except for two rows it deliberately leaves open, and
**five REQUESTs (13–17) need the manager before P11 writes the other 96 levels**. What is left:

1. **W4 is RED on `a1-01`** (4 occupied bands against D31's 2–3) and it is not a tuning problem —
   §9's arithmetic says DESIGN §8.2's act-1 ceiling of **600 m** cannot coexist with its own
   *"Mud/Belt/Floor only"* under R-02's band edges, because **Floor ends at 450 m**. REQUEST-15.
2. **P7 is now MEASURED and PRINTED** (§11b) — landscape PASS at 8 targets, portrait NEITHER at 2,
   **reach-bound and short of 3 by 16 wu**, the same 404 wu that decided D121. Folding it into
   `results` / `gate.json` is the manager's, REQUEST-4's shape, one `add()` per row.
3. **Registering `terrain.query` through `P.setTerrainQuery`** — app level, P10, because `js/sim/`
   may not import `js/gfx/`.

**How to re-run what P9 built**, in the order a fresh agent should:

```
node tools/genlevels.mjs              the derivation, per level
node tools/genlevels.mjs --check      W6: the table vs the files on disk
node tools/worldgate.mjs              29 criteria (--w3runs N shrinks the 2-minute W3 sweep)
node tools/worldgate.mjs --falsify    33 controls, all required RED
node tools/levelpage.mjs --falsify    level.html in a real browser, both orientations
node tools/sim.mjs --levelrun --levelfile data/levels/a1-12.json
node tools/gates_portrait.mjs --runs 8    P4, P4b and now P7, all printed, none in `results`
```


---

## 0a — the held stick is lost on rotation (D131). LANDED.

### What was actually wrong

`stickOx/stickOy` is the stick's anchor **in canvas css pixels**. On `view:change` the handler at
the bottom of `input.js` recomputed `stickR` and left the anchor alone. The anchor is a position in
a coordinate frame that has just been replaced, and **the browser never tells you where the thumb
went** — no `pointermove` fires for a finger that did not move. So:

- the axis is **stale but unchanged** while the thumb is still, which is why the assert was green;
- the **first movement afterwards** is measured from an anchor hundreds of pixels away, the
  anchor-slide clamps the result to the rim, and the axis slams to full deflection.

Measured: the pilot holding **axisY −0.643** gets **−1.000** on his first twitch after a rotation.
That is the nose going to the stop, mid-fight, because the phone turned.

### The fix

Deferred re-anchor. `view:change` marks the anchor stale while the stick is held; the first
`driveStick` after that re-derives the anchor **from the position it is given**, placed so the raw
deflection the pilot was holding comes out unchanged under the **new** radius:

```
stickOx = x - axisRaw.x * stickR      // stickR is already the new profile's
stickOy = y - axisRaw.y * stickR
```

Derived, not chosen: `driveStick` computes `axisRaw = (thumb - anchor) / R`, so substituting the
above returns exactly the `axisRaw` that was in force, for any `R`. The flag is cleared everywhere
the stick is acquired or dropped (`onDown`, `onUp`, `releaseAll`, `clearZones`, `blur`).

Re-anchoring on the **first move** rather than at the rotation itself is the honest choice: at the
rotation we do not know where the thumb is, and any guess is a second wrong anchor.

### The assert, rewritten so it can fail

The old assert read the axis after 20 rotations **without moving the thumb**. That number is
identical with and without the fix — nothing recomputes it. It was green *because of* the bug.

The new one rotates into an orientation the anchor was **not** set in, then moves the thumb **once**
(`moveTo`, never `slideTo` — a slide re-anchors on its first sub-step and then legitimately drives
the axis to the target, which would launder the bug back into a pass), and asks whether the pilot
still has the deflection he was holding. Plus a second assert on the **radius**: landscape's stick
radius is 56.78 px against portrait's 81.12, so an 8 px nudge is 43% larger in landscape and a fix
that re-anchored with a stale radius cannot fake it. The expected radius comes from the **shipped**
`stickRadius()` given the harness's own view — not a literal copied into the test (D131's own
lesson: `hud.js` had its own copy of the window and the break-switch went red in the harness and
green in the game).

### Before / after — the numbers

| | pre-fix (`?inputbug=noreanchor`) | shipped |
|---|---|---|
| axisY held before rotating | −0.643 | −0.643 |
| axisY after 20 rotations, thumb still | −0.643 | −0.643 |
| **axisY after the first thumb movement in the new frame** | **−1.000** | **−0.643** |
| 8 px nudge, measured through `axisRaw × r` | **0.00 px** (already saturated at the rim) | **8.00 px** |
| live `input.stick.r` in landscape | 56.78 | 56.78 |

### Break-switches — what each one caught

`?inputbug=noreanchor` is the **pre-fix input.js shipped alongside**, reached through
`js/main.js`'s `?inputbug=` — the real path, not a harness override. `node tools/orient.mjs --falsify`:

| break-switch | result |
|---|---|
| baseline | GREEN |
| `canvas-measure` | RED — held stick, re-anchor radius, view:change count |
| `nudge-on-rotate` | RED — no entity position changed on a rotation frame |
| `clear-input-on-rotate` | RED — held stick, re-anchor radius |
| **`noreanchor`** | **RED — held stick, re-anchor radius** |

**It went STILL GREEN on the first attempt** and that is worth recording: `orient.mjs`'s `goto`
only forwarded `viewbug=`, so `?inputbug=noreanchor` never reached the page and the break-switch was
testing the fixed build against itself. A break-switch that is not plumbed is indistinguishable from
a fix that works. Fixed by routing `inputbug` through the same query builder.

### Portrait regression

- `node tools/orient.mjs` — 7/7 PASS, all four break-switches RED.
- `node tools/touch.mjs` — 15/15 PASS, no page errors.
- `node tools/touch.mjs --falsify` — baseline GREEN, all four pre-existing switches RED.

Nothing moved.

### Left alone, deliberately

`input.stick.ox/oy` is also the **drawn** ring centre, so between a rotation and the first thumb
movement the ring is drawn at a stale position — possibly off-canvas. That is cosmetic, it is
`js/ui/`'s to render, and correcting it would mean inventing a thumb position the fix deliberately
refuses to invent. **REQUEST-1** below.


---

## 0b — the sky harness measured a frame the game never draws (D131). LANDED.

### The defect

`tools/pages/sky.html` took `w`/`h` from the query string — so P8b could drive it landscape — but
passed `worldH: 1000` as a literal. `worldH` is portrait's constant; landscape's is **560** (D126).
So a landscape run rendered **1000 wu of sky into a 390 px-tall viewport**.

The arithmetic of what that showed, which is the whole explanation of the A4 result:

| | scale | visible width | visible height | **visible area** |
|---|---|---|---|---|
| the harness measured | 390/1000 = **0.3900** px/wu | 844/0.39 = 2164 wu | 1000 wu | 2.164 Mwu² |
| the game draws | 390/560 = **0.6964** px/wu | 844/0.6964 = 1212 wu | 560 wu | 0.679 Mwu² |
| ratio | | 1.79× | 1.79× | **3.19×** |

Cloud repetition is an **area** effect — the more world on screen, the more cutouts drawn from a
fixed atlas — so the harness was asking the atlas to fill 3.19× the frame the game asks it to fill.
Measured cutout counts on the worst frame: **27 against 8, a factor of 3.375.** The area ratio
predicts the cutout ratio to within 6%, which is the confirmation that this is the mechanism and not
a coincidence.

### The fix

`sky.html` now picks the profile with **`modeFor(w, h)`** — `viewport.js`'s own rule, exported for
the purpose rather than copied, because a second literal `1.05` in a harness page is precisely the
shape D131 caught in `js/ui/hud.js`. `?worldH=` still overrides, and `window.__sky.frame` now
carries `{w, h, mode, worldH}` so **`skygate` prints the frame it measured on every run** — this
class of bug is invisible unless the instrument says what it looked at.

`js/core/viewport.js` gained one exported pure helper, `modeFor`, replacing the inline expression.
No behaviour change; `corecheck` and `statecheck` clean.

### Was A4 ever real? **No.**

`node tools/skygate.mjs --w 844 --h 390`:

| | worst multiplicity on one screen | frames containing any repeat | cutouts / distinct ids on the worst frame | verdict |
|---|---|---|---|---|
| **before** (`--worldh 1000`) | **5** | 161/180 | 27 from 15 | **FAIL** (bar is 3) |
| **after** (worldH 560) | **2** | **32/180** | 8 from 5 | **PASS** |
| portrait, unchanged | 2 | 19/180 | 8 from 7 | PASS |

**The cloud atlas variety budget is not wrong and must not be touched.** P8b's landscape A4 failure
was an artefact of the harness, exactly as D131 suspected. Landscape now sits at the same worst
multiplicity as portrait (2 against a bar of 3); it carries more *frames* with some repeat
(32 vs 19 of 180), which is the honest residual of a wider frame, and it is well inside the gate.

### The break-switch

`--worldh 1000` is kept as the switch — it reproduces the pre-fix measurement on demand, so the
before/after above is reproducible rather than a claim about a deleted state.

The real question was whether A4 can still fail at all in a 560 wu frame — a criterion that passes
because the frame got small is no better than one that failed because it got big.
`node tools/skygate.mjs --w 844 --h 390 --falsify`:

| control | landscape result |
|---|---|
| A4 — one-cutout atlas | **RED**, worst multiplicity 3 against the shipped 2 |
| A7 — hard bands | **RED**, 0.019 s crossfades against 1.66 |
| A5 — one LUT for all five acts | **RED**, worst pair 0.00 against 0.26 |

Portrait `--falsify` unchanged, 3/3 red. So the landscape pass is a pass, not an absence.

### Portrait regression

`skygate` portrait: A7 1.66 s × 5, A4 worst 2 / 19 of 180, A5 0.26 — **byte-identical to before the
change**, and necessarily so: portrait's profile `worldH` *is* 1000, so the literal and the derived
value agree there. That is why the bug survived P3 and P8b.


---

## 0c — the A4 retraction's FALSIFICATION was measured in portrait (manager's catch). LANDED.

### The defect

`tools/skygate.mjs`'s two falsification arms carried their own literals:

```js
await cdp.goto(`${base}/tools/pages/sky.html?w=390&h=844&nohud=1&bug=oneCutout`);
await cdp.goto(`${base}/tools/pages/sky.html?w=390&h=844&nohud=1&bug=hardBands`);
```

`--w 844 --h 390 --falsify` therefore set an **844×390 browser viewport** and loaded a **390×844
page inside it**. The controls ran portrait whatever the flags said — and then printed their portrait
numbers *against the landscape run's shipped figures*, which is what made the line read as evidence.

**My 0b retraction stands on its own measurement; its falsification did not.** The claim "A4 can
still go red in a 560 wu frame" was made from a 1,000 wu frame. Reported as such rather than quietly
re-run.

It is also the same shape as the bug it was falsifying — a harness measuring a frame the game never
draws — one layer up, which is why the sweep in §0b did not catch it: I fixed the page and never
asked whether the *arms* reached it.

### The fix

**One URL builder, one `goto`, and every load asserts the frame it got.** `grep -n "cdp.goto("
tools/skygate.mjs` now returns exactly one line. `load()` reads `window.__sky.frame` back and
**aborts with a named error** if the page did not come up in the frame it was asked for, so a third
arm cannot drift. Each control prints the frame it ran in, and its result line now says
`in the SAME frame 844x390 landscape` rather than leaving that to be assumed.

`--falsify` also now **exits 1** when any control stays green. It previously printed
`ONE OR MORE CRITERIA DO NOT CATCH THEIR OWN BUG` and exited 0 — the same silent-death shape as the
`execFileSync` throw in §1, wearing a different coat.

### Before / after — the controls, in landscape

| control | before (portrait, mislabelled) | after (really landscape) |
|---|---|---|
| A4 one-cutout atlas | worst multiplicity **3**, in a 390×844 / 1000 wu frame | worst multiplicity **4**, in 844×390 / 560 wu — **RED**, bar is 3 |
| A7 hard bands | 0.019 s × 5, portrait | 0.019 s × 5, landscape — **RED** |
| A5 one shared LUT | 0.00 (on disk, no viewport either way) | 0.00 — **RED**, and the line now says *"on disk — no viewport"* rather than looking like an omission |

**The landscape A4 control is stronger than the portrait one it was standing in for** (4 against the
bar of 3, versus portrait's 3), deterministic across repeat runs. So the retraction's conclusion is
unchanged and now actually evidenced: **A4 passes in landscape at multiplicity 2, and it is capable
of failing there.** Honest caveat: the control clears the bar by **one** multiplicity, not a margin.

### The guard is itself falsified

A guard never seen to fire is not a guard, and this one exists because the defect it catches shipped
undetected. `--framebug` restores the pre-fix behaviour on the control arms only:

```
node tools/skygate.mjs --w 844 --h 390 --falsify --framebug
  FAIL  A4 control: page measured 390x844 but was asked for 844x390. Every goto must go
        through load(); a control that runs in the wrong frame tests nothing.          exit 1
```

And — this is the part worth keeping — **`--framebug` in PORTRAIT does not trip it**, because there
the literal happens to be right. That is exactly why the defect survived: it is invisible in the
orientation the harness was written in, and only became a lie when D123 moved the target.

### The sweep for the same shape, and what it found

Looked for: *a tool that takes a size or mode flag whose secondary arms carry their own literal.*
`grep -n "cdp.goto(\|cdp.viewport("` over all of `tools/`, plus every `390`/`844` literal.

| tool | verdict |
|---|---|
| `skygate.mjs` | **the instance. Fixed.** |
| `touch.mjs` | clean — `--size` is threaded into every `--falsify` arm via `suite({W,H,...})` |
| `hudcdp.mjs` | clean — `MW/MH` and the page's `&mode=` both derive from the flag |
| `camtrace.mjs` | clean — `makeView()` defaults to the flags; `REF_VIEW`'s portrait literals are a deliberate, documented *reference* for the ratio `k`, not a measurement frame |
| `framegate.mjs`, `statecheck.mjs` | fixed size, **no flag to disobey** — not the shape |
| `hudcheck.h8`, `hudfalsify` | a synthetic 390×844 screen for a pure unit test of `chevronModel`; no flag, no page — not the shape |
| `orient.mjs` | rotates by design, but **hardened anyway** — see below |
| `p8probe.mjs`, `p8duelbox.mjs` | latent trap, no flag today — **REQUEST-6** |

**`orient.mjs` hardened**: my §0a radius assert built its expected view from `w: 844, h: 390`
literals that merely *happened* to match the `cdp.viewport(844, 390)` two lines above. It now reads
the live frame out of the page and judges against that, plus a new assert — **"the re-anchor frame is
the one that was asked for"**. That assert is not decorative: `?viewbug=canvas` trips it, because
under that bug the layout never leaves portrait, so it has been seen to fire.

`orient.mjs` 8/8, all four break-switches RED. `skygate` portrait 3/3 and 3/3 controls RED,
landscape 3/3 and 3/3 controls RED. Exit codes checked against a deliberately broken run.

### The rule this leaves behind

**A harness that reports what it actually did is worth more than one that is merely correct.** The
whole of 0c was visible only because 0b started printing the measured frame on every run. Everything
built for the rest of P9 prints its own frame, seed and sample size, and asserts that what it got is
what it asked for.


---

## 1 — the altitude ladder: P4 and P4b are measurable for the first time

Both criteria have read **"NOT MEASURABLE IN THIS HARNESS"** in `gates_portrait.mjs` since P8. They
needed the band crossfade, which is P9's. Two files land it:

- **`js/sim/world.js` §1** — the ladder's *reading* model. Pure, node-importable, no `js/gfx`
  (corecheck's rule). `js/core/bands.js` keeps the **metres**, which D26 and D126 freeze;
  `world.js` owns **how much of them is on screen**, which is what D126 hands P9.
- **`tools/ladder.mjs`** — the instrument. Pure node, because `bandBlend` and the band table import
  without a GL context. **The game and the gate call the same functions** — W5's "two
  implementations will diverge and the divergence will look like a bug", applied one system early.

One housekeeping change makes that possible: **`BEST_CLIMB_WU_S` moved to `js/core/bands.js`** and
`js/gfx/sky.js` re-exports it. `js/sim/` may not import `js/gfx/`, so the alternative was a second
copy of 90 wu/s — and sky.js's own `FG_OCCLUDE_MUL` comment records what the last second copy did to
gate A6. `ladder.mjs` asserts the two agree before it prints anything.

### The identity that decides P4

```
legibleWu / frameWu  =  BAND_LEGIBLE_PX / view.h
```

because `scale = view.h / worldH`, so `worldH / zoom` appears in both terms and cancels. **The 90 px
legibility bar is a fixed fraction of the VIEWPORT at every zoom and in every profile** — 10.66% of
a portrait frame, 23.08% of a landscape phone's. Zooming out buys wu and shrinks px-per-wu in exactly
the same proportion. This is why no camera move rescues P4, and it is the ladder's version of D125's
"there is no zoom that does both".

### The results

`node tools/ladder.mjs`

| # | criterion | landscape | portrait |
|---|---|---|---|
| **P4a** | ≥ 2 bands legible for ≥ 55% of a full-column climb | **15.0%** FAIL | **39.3%** FAIL |
| **P4e** | the 3 lowest bands each held ≥ 0.8 s in the establishing shot | **3/3** PASS — mud 1.00 s, belt 3.55 s, floor 2.28 s | **3/3** PASS — 1.35 / 3.90 / 3.34 s |
| **P4b1** | both bands' **sky** signature co-visible ≥ 1.5 s | **3.35 s** PASS | **8.74 s** PASS |
| **P4b2** | both bands' **placed** signature co-visible ≥ 1.5 s | **1.78 s** PASS | **6.67 s** PASS |
| **P4b3** | the crossfade completes in 1.0–3.0 s | **1.66 s** × 5 PASS | **1.66 s** × 5 PASS |
| **P4b4** | every placed signature sits inside its own band | 10 placements, 200 wu clearance PASS | same PASS |

**P4b PASSES in both orientations. P4's traversal half FAILS in both, and I have not touched it.**

### REFUSED: P4a's 55%, and the arithmetic that settles it

The criterion is **unsatisfiable by any renderer**, and the proof needs no assumption about the 90 px
bar at all. Two bands can only be co-visible while the frame straddles a boundary. There are **5**
interior boundaries and the frame is `frameWu` tall, so the absolute ceiling is

```
5 x frameWu / 10,000 wu
```

| | frame at combat framing | absolute ceiling, ZERO px bar | measured at the 90 px bar | bar |
|---|---|---|---|---|
| portrait | 1,000 wu | **50.0%** | 39.3% | 55% |
| landscape | 560 wu | **28.0%** | 15.0% | 55% |

**Portrait cannot reach 55% at combat framing even with a perfect renderer and no legibility bar.**
The widest framing the controller may legally choose gets it to 50.4% (portrait, `zoomWide` 0.78) and
20.4% (landscape, 0.74); reaching 55% needs zoom **0.715** portrait — 8% below its own clamp floor —
and **0.274** landscape, which is below even `zoomEstablish`.

So there are three things I could have done and did not:

1. **Move the 55%.** That is tuning a bar to make a gate pass — the documented failure mode here.
2. **Shrink the bands** so 5 boundaries fit more of a 10,000 wu column. **D126 forbids it by name**
   and D26 makes the edges physics-facing.
3. **Pin the camera wide.** D27 struck the six-band version of this criterion for exactly that, and
   §4.4.2 P3b exists to catch it.

**What P4a actually is: D27's struck criterion, one notch weaker, with the same arithmetic error.**
D27 killed "all six bands legible at once" because a 1,500 m column puts the hull at 5.4 px. "≥ 2
bands for the majority of a climb" is the same demand scaled down, and it fails for the same reason —
the mean gap between boundaries is 2,000 wu against a 560–1,000 wu frame, so **most of a climb is
spent in the middle of a band, which is what a band being a *place* means.** D27's own ruling is the
answer: *the ladder is a journey, not a composition*, and D125 added that traversal is the thing
allowed to be off screen. P4b measures the journey and P4b passes.

**REQUEST-3 (see below) proposes the re-specification. I have not applied it.**

### The D126 re-proportioning, derived

Three things were re-proportioned, none of them a metre.

**1. The establishing crane — `CRANE_RATE_WU_S = 392`, `CRANE_SECONDS = 4.0`.** One rate for both
orientations, derived from the tighter, which under D123 is landscape:

```
binding band  = the thinnest, Mud, 700 wu (§3.3 constraint 1)
legibleWu(landscape, zoomEstablish 0.42) = 90 / (0.696428 x 0.42) = 307.69 wu
Mud clears the bar over 700 - 307.69                             = 392.31 wu
that must last CRANE_HOLD_BAR_S x CRANE_MARGIN = 0.8 x 1.25      = 1.00 s
rate <= 392.31 / 1.00                                            = 392 wu/s  (58.8 m/s of camera)
```

`CRANE_MARGIN = 1.25` is derived **with**, not derived **to**: solving for exactly 0.8 s gives a rate
whose measured hold is **0.8007 s**, a 0.09% margin — worse than the 0.03% that cost D128 a manager
call, and condemned by §4.4.3's own escalation rule. Portrait gets the same rate and 1.35 s on Mud,
68% clear, for free. A per-profile rate was rejected: an establishing shot is a directorial beat and
should keep its pace across orientations, and deriving from the tighter case is what makes one number
legal in both.

Length: Floor's lower edge enters the landscape frame at `1700 + 307.69 - 1333.33 = 674.4 wu` of
travel and needs 1.0 s after that → `T ≥ (674.4 + 392) / 392 = 2.72 s`. Rounded up to **4.0 s**,
which is §3.3 constraint 2's own budget, and buys Floor 2.28 s instead of 1.00.

**2. Where a band's placed signature goes — `SIGNATURE_SPAN_WU = 400`.** Two placed elements D wu
apart are both in frame over `frameWu - D` of travel, so P4b's 1.5 s at 90 wu/s requires

```
D <= frameWu - 1.5 x 90 = frameWu - 135
   landscape at combat framing:  560 - 135 = 425 wu   <- binds (D123)
   portrait:                    1000 - 135 = 865 wu   <- free
```

Adopted at **400 wu, i.e. 200 wu either side of every boundary**, 6% inside the landscape bound.
Landscape gets 1.78 s, portrait 6.67 s.

**The one structural consequence for the level format:** a band with two neighbours needs a signature
instance near **each** of its boundaries, not one in the middle. One central instance per band puts
Belt's and Floor's **1,150 wu** apart — 2.7× the landscape bound. `signatureAltitudes()` emits the
10 required placements; `P4b4` checks every one sits inside its own band (tightest clearance 200 wu).

**3. Nothing else.** The band edges, the feather (90 wu), `zoomEstablish` and `BEST_CLIMB_WU_S` are
all unchanged. The crossfade already reads 1.66 s in **both** orientations because it is derived in
wu and time, not pixels — landscape needed no help there and did not get any.

### Break-switches — what each one caught

`node tools/ladder.mjs --falsify`

| control | required RED | result |
|---|---|---|
| `--feather 2` | P4b3 | RED — crossfade 0.02 s, snaps |
| `--feather 400` | P4b3 | RED — crossfade 7.4 s, crawls |
| `--crane-rate 900` | P4e | RED — Mud drops to 0.44 s |
| `--crane-seconds 1.0` | P4e | RED — the shot never reaches Floor |
| `--span 700` | P4b2 | RED — co-visibility falls to 0 s |

**`--crane-rate 900` went STILL GREEN first**, and the reason is the finding, not the bug. P4e's
wording — "≥ 3 bands seen within the establishing shot" — has two readings, and under the loose one
(any three) a crane at 900 wu/s sweeps 3,600 wu, drops Mud to 0.44 s and **still counts Belt, Floor
and Deck**. A criterion a faster camera can always satisfy is inert. Tightened to the stricter
reading — **the three lowest bands, by name** — which is what §3.3 constraint 2 is written about
("the three lowest must sum to ≤ 3,000 wu, *so* the establishing crane crosses three bands in ≤ 4 s").
That is the same shape D27 struck the six-band criterion for, found in my own instrument.

Two further controls, in the other direction, because a metric that only ever reads low is not
measuring anything:

- **the closed form against the sampled walk**, at every zoom the controller may choose — 12.3/12.4,
  15.0/15.1, 20.3/20.4, and 35.8/35.9 at the cinematic 0.42. They agree to 0.1%.
- **the traversal metric responds**: 15.0% at zoom 1.00 → 67.7% at zoom 0.20.

At zoom 0.20 the closed form reads 75.4% against a sampled 67.7%, and that is **not** a defect: the
per-boundary windows are 1,508 wu against a 700 wu smallest gap, so they merge and the closed form
over-reads. Its domain is stated in `world.js` and the harness prints the divergence as a domain
note rather than a failure. The sampled figure is the true one there.

### One more break-switch that broke, and how

`ladder.mjs --falsify` shells out to itself per arm. The moment the normal run learned to exit 1 on a
red criterion, `execFileSync` **threw** on every broken arm and the falsifier died before printing
anything. Reading stdout off the thrown result fixes it. Recorded because the failure mode is
"the falsifier stops existing", which is silent unless you look at its exit code — and the exit codes
are now: **`ladder.mjs` exits 1 when anything except P4a is red, `--falsify` exits 1 if any control
stays green.** Both were checked against a deliberately broken run (`--span 700` → exit 1).

Blessed record appended to `tools/BLESSED.md` — the two P9 sections, with the measured value of
every switch.

### Portrait regression after every change in this section

| suite | result |
|---|---|
| `tools/skygate.mjs` portrait | 3/3, byte-identical figures |
| `tools/skygate.mjs --falsify` | 3/3 controls RED |
| `tools/orient.mjs` | 7/7, 4/4 controls RED |
| `tools/touch.mjs` (+`--falsify`) | 15/15, 4/4 controls RED |
| `tools/corecheck.mjs` | clean — the pure tier still imports nothing host-side |
| `tools/statecheck.mjs` | 12/12 |
| `tools/hudcheck.mjs` | 23/23 |
| `tools/p3guard.mjs` | GREEN, all four asserts, product 34.0136 px |
| `tools/gates_portrait.mjs --runs 8` | unchanged in both orientations — portrait P0 0.1415, P2 in-frame median 0.02 s, P3 43.4 px; landscape P0 **0.0737**, P3 **34.0 px**, P2 in-frame median **1.32 s**, 0/40 reached gun range unseen |

Nothing moved.

`gates_portrait.mjs`'s "NOT MEASURABLE IN THIS HARNESS" block now prints P4 and P4b's measured
values and points at `tools/ladder.mjs`. **Print only — `results` and `gate.json` are untouched**, so
the record stays the manager's to change (REQUEST-4).


**REQUEST-3** — **§4.4.2 P4's traversal half should be re-specified, and I have not touched it.**
It is unsatisfiable by any renderer: 5 interior boundaries × a 1,000 wu frame is 50% of a 10,000 wu
column at combat framing in portrait, against a 55% bar, before any legibility bar is applied at all.
Landscape's ceiling is 28.0%. Reaching 55% needs zoom 0.715 portrait and 0.274 landscape, both below
their clamp floors. It is D27's struck criterion one notch weaker, with the same arithmetic error.

What it was protecting is already measured and already passes: **P4b — a boundary reads as a
transition** (landscape 3.35 s of sky co-visibility, 1.78 s of placed co-visibility, a 1.66 s
crossfade) and **P4e — the establishing crane** (3/3 of the lowest bands held, 1.00–3.55 s against a
0.8 s bar). Suggested wording, offered rather than applied: *"≥ 2 bands legible for ≥ 55% of the
travel **within 1 frame-height of a boundary**"* — which is the quantity "does a boundary read"
actually asks about, and which currently reads **100%** in both orientations by construction. The
manager owns `ARCHITECTURE.md`; I own neither the bar nor the wording.

**REQUEST-4** — P4/P4b are now measured but are **not** in `shots/portrait/gate.json`.
`gates_portrait.mjs` prints them and leaves `results` alone, because that record is the gate's
verdict and the verdict is the manager's (D117). If they should be folded into the record, the call
is one `add()` per row and the numbers are already computed in that file.

**REQUEST-6** — `tools/p8probe.mjs:33` and `tools/p8duelbox.mjs:36` both declare
`function makeView(mode = 'portrait', w = 390, h = 844)`. Both are portrait-only today and say so in
their output, and neither takes a mode flag, so **this is a latent trap and not a live defect** — but
`makeView('landscape')` would return a 390×844 view carrying the landscape profile, silently, which
is the §0c shape exactly. `tools/p8engage.mjs:57` already has the repair: `if (!w) { w = mode ===
'portrait' ? 390 : 844; h = ... }`. Two one-line edits in P8's files; I did not make them.

**REQUEST-7 — CLOSED by §4.** D139 ruled on it; the re-specification is landed, falsified, and it
turned out the ladder was NOT fine — two delivery defects were. K5 is 0 → +85.43 HP/sortie and
`--p6gates` is 9/10. The original text is kept below because its diagnosis was half right and the
half it got wrong is instructive.

**REQUEST-7** — **`sim.mjs --p6gates` reads 8/10 and `P6_NOTES.md` §12 records K5 as a PASS at
+12.5 points.** K5 now reads **0 points**, deterministically across repeat runs. **It is not mine**:
W5c proves the `windAt` move is bit-identical over 10,000 sampled (profile, alt) pairs, and
`--fixtures` passes with unchanged blessed hashes. K6 was already recorded ❌ (mis-specified,
P6_NOTES §3), so the delta is K5 alone. Its own detail line names the mechanism — the pooled cells
are *"the 2 configurations whose BASELINE death rate is inside DESIGN §10.5's 8-30% band"*, and the
full sweep still shows **+13.3 and +6.7 points in two cells and a positive HP delta in every cell**.
The likely cause is D128 moving the minimum enemy hull 64 → 66 wu and the clamp floor to 0.74, which
shifts baseline death rates and therefore which cells qualify. Worth a decision before P11 spends
the tuning register: either the pooling rule is the instrument's weakness (P6_NOTES already says the
death-rate delta "only reads positive where the baseline has headroom, which is the instrument's own
constraint") or K5 needs re-measuring against the post-D128 constants. **I did not touch it.**

**REQUEST-12** — **DESIGN §8.2's Act 3 mechanic, "valleys with no room to loop", is not achievable
in a 2D side-scroller, and two shipped measured numbers say so.** F6 puts the combat turn diameter at
**263 wu**, so a valley the player cannot loop in has a floor narrower than 263 wu — about a 526 wu
wavelength — and at that wavelength `MAX_SLOPE` (best climb 90 wu/s over cruise 280 wu/s = 0.3214)
caps the relief at **55 wu, i.e. 8.3 m**. A valley too narrow to loop in has 8 m walls and is not a
valley. Conversely, `pass_narrow` at a legal slope is **5,950 wu — 892 m — wide**. The mechanic works
in three dimensions, where a valley's walls are lateral and the turn is not; in 2D the terrain under
you IS your path. **I moved no constant and invented no mechanic.** Act 3's horizontal constraint
probably has to be something other than terrain relief — cloud walls, flak corridors, a hard band
ceiling — and it needs deciding before P11 writes levels 41–60. Full arithmetic in §7.

**REQUEST-11** — **DESIGN §8.3's enemy codebook has no mapping onto the shipped roster, and
`genlevels.mjs` cannot be written until it does.** The codebook is single letters over §5.1's codes —
`k`, `w`, `d`, `o`, `s`, `g`, `B`, `F`, `Z`, `A#` — and `js/sim/entities.js` builds eight aircraft:
kestrel, wasp, shrike, drover, ox, marlin, nightjar, anvil. Four of the codes (`g` ground guns,
`B` balloons, `F` flak, `Z` zeppelins) have **no entity type at all**, and DESIGN's level table uses
all four (levels 5, 11, 13, 20 and 98 among many). §7.1's own example compounds it by naming `scout`,
`aaNest`, `balloon` and `hunter`, none of which exist either — `validate.js` now rejects all four by
name (W1f). Item 7's brief is *"the table is the source and the JSON is generated from it"*, so the
mapping is a **data** decision the manager owns, not a generator implementation detail. I did not
invent one; `worldgate` uses an explicit four-entry map for its own fixture and labels it as such.

**REQUEST-10** — **ARCHITECTURE §7.1's example level does not satisfy this project's own validator,
in three places.** Full arithmetic in §5; the summary is: its `bands` table makes Mud **333 wu**
against §3.3 constraint 1's 700 wu floor, so `checkBands` rejects it; its `weather.wind: { x: -40 }`
and `gust: 26` are both above `WIND_MAX_MS` (25) if read as SI, so `windProfileErrors` rejects the
document's own example, and they must be **wu/s** — which is also the only reading that agrees with
`k-drop`'s authored -4.5..-5.5 m/s; and `concordLine: -26667` is a rounded copy of
`CONCORD_LINE_WU` (-26,666.67); and its four enemy names are not in the roster (see REQUEST-11).
`js/data/level.js` accepts both readings of `bands` (object =
decoration, array = geometry, judged by `checkBands`) and converts the wind with `M_PER_WU`, so
nothing is silently dropped — but **the document should say so**, and the manager owns it. This is
the same shape as D122's finding that §4.4.1's spec figures had drifted from the shipped gates.

**REQUEST-9** — **§4.5's ladder may now be too steep, and that is a balance call, not a gate one.**
With delivery fixed, three lost crates take the treatment arm's death rate to **73–83%** against
DESIGN §10.5's 8–30% band, and cost **+85 HP per sortie = 3.24 extra aeroplanes**. K5's harness is
deliberately the hardest isolation of the claim (no crates on the map, the player ignoring them and
never fleeing, the whole three-step ladder pre-loaded at tick zero), so this is not the number a real
mission produces — but it was **never measurable before**, because the reinforcements were dying on
arrival, and the ladder's constants have therefore never been tuned against a delivered ladder.
**P11 should re-open §4.5's step table with this instrument.** I moved no constant.

**REQUEST-8** — `js/data/validate.js` imports `METRICS.CARD_MAX_CHARS` from `js/ui/layout.js`.
`layout.js` is pure and imports only `js/core/`, so it is safe headlessly and `corecheck` is clean —
but the **direction `js/data` → `js/ui` is wrong**. The alternative was a second copy of `44`, which
is exactly the defect the file exists to prevent (D131). Suggested fix: move `CARD_MAX_CHARS` (and
any other author-time cap) into `js/core/`, with `layout.js` re-exporting — the same shape as
REQUEST-5's `BEST_CLIMB_WU_S`. I own neither `js/ui/` nor `layout.js`.

**REQUEST-5** — `js/core/bands.js` gained `BEST_CLIMB_WU_S` (90 wu/s, 13.5 m/s ÷ 0.15) and
`js/gfx/sky.js` now re-exports it rather than defining its own. `js/sim/` may not import `js/gfx/`
(corecheck), so the alternative was a second copy of a shared constant — the exact thing sky.js's
`FG_OCCLUDE_MUL` comment records going wrong in gate A6. `js/core/viewport.js` gained one exported
pure helper, `modeFor(w, h)`, replacing the inline `h > w * 1.05`, so `tools/pages/sky.html` cannot
keep its own copy of the threshold. Both are `js/core/`, which P2 owns; both are additive and no
behaviour changed (`corecheck`, `statecheck`, `skygate`, `hudcheck` all unmoved).


---

## 2 — the wind evaluator, and W5. LANDED.

### What was actually there

W5 turned out to be **already satisfied in substance and not provable in form**. `js/sim/ai.js` has
no wind arithmetic of its own: it calls `fld.rendezvous` / `fld.predict` in `crates.js`, which call
`windAt`. The AI carries only `windErr`, its own standing misjudgement (DESIGN §4.5), **added to the
solver's answer rather than being a second answer**. That is the right architecture and P6 got it
right without a gate saying so.

What was missing is that `windAt` lived in `crates.js`, so the level's wind had no home and nothing
asserted the one-evaluator property. A later phase adding "the AI's own estimator" would have broken
nothing that any check could see.

### What landed

- **`windAt` moved to `js/sim/world.js` §2**, where the level's conditions live. `crates.js`
  re-exports it, so `tools/sim.mjs` and every other caller is untouched.
- **`createConditions(def)`** — the level's wind profile, gusts, visibility and time of day, with
  validation. Deliberately **not** called `createWorld`: `js/sim/entities.js` already exports that
  name for the pooled *entity* world, and two `createWorld`s in `js/sim/` is a trap for every later
  phase.
- **`windProfileErrors()`** — the table's rules live with the evaluator, not in the validator.
  `windAt` reads low-to-high and interpolates, so an unsorted or single-point table silently returns
  a constant and **the shear a crate level is built on quietly stops existing**.
- **`windAtNearest`** — the forbidden second implementation, shipped alongside, routed into the
  solver by `?bug=second-wind`.
- **`tools/worldgate.mjs`** — W5 and W1, 9 criteria, every one falsified.

### The numbers

`node tools/worldgate.mjs` — seed 11, 10,000 samples, 8 profiles (4 authored + 4 seeded):

| # | criterion | result |
|---|---|---|
| W5a | `crates.windAt === world.windAt` — the SAME function object | PASS |
| W5b | exactly one definition of `windAt` in `js/sim/` | PASS — `world.js ×1` |
| W5c | **the move is a no-op** against the pre-move implementation | **worst \|delta\| 0** over 10,000 (profile, alt) pairs |
| W5d | the solver reads the evaluator (a second one moves it) | worst 28.22 m of predicted impact |
| W5e | the AI estimator IS the crate solver | 0 direct wind evaluations in `ai.js` |
| W5f | a malformed wind table fails by name | 6/6 |
| W5g | `createConditions` validates visibility and time of day | PASS |

**W5c is the load-bearing one.** `worst |delta| 0` over 10,000 pairs is the proof that moving the
function changed no behaviour, which is what lets me say the two `--p6gates` reds below are not mine.
The sampler deliberately hits **knots as well as the gaps between them**: a nearest-vs-linear defect
agrees exactly at every knot, so a sampler that only lands on knots is blind to it.

**W5d's per-profile spread is the finding worth keeping**, and it is why the control sweeps all eight
profiles rather than the one:

```
calm 0.00m   steady 0.00m   knot-dense 0.15m   seeded#0 0.55m
shear 3.36m  seeded#1 12.99m   seeded#2 14.80m   seeded#3 28.22m
```

**A second wind evaluator is QUIET, not loud.** On the profile a designer is most likely to author
it moves the predicted impact by 15 cm. A single-profile control would have measured 0.15 m against
a 1 m bar and reported that W5 could not fail — the sixth believable-wrong reading on this project,
avoided only because the sweep was cheap.

### The break-switches

`node tools/worldgate.mjs --falsify` — 10/10 controls bite. W5a/W5b/W5e are **structural** (assertions
about the shape of the source), so a flag cannot break them; each is instead re-evaluated against a
deliberately wrong input and required to come out false, and the proof is printed rather than claimed.


---

## 3 — `js/data/validate.js`. LANDED, with the D126 signature rule baked in.

Per the manager: the structural consequence goes **in the validator, not in a note**.

Every rule is **delegated to whoever already owns it** — `checkBands` (tables.js), `CEILING_WU`
(bands.js), `windProfileErrors` and `signatureAltitudes` (world.js), `METRICS.CARD_MAX_CHARS`
(layout.js). A validator with its own copy of a rule is D131's defect with a longer fuse: it would
go on certifying levels against a rule the game no longer has.

**W1** — `node tools/worldgate.mjs`, **7/7 rejected by name, and a legal level passes clean**:

| the malformed level | named error |
|---|---|
| a beat above the ceiling (D28) | `beats[0].y` |
| a 45-char radio line | `script[l1]` |
| a 600 wu band (§3.3 constraint 1) | `bands` |
| a star as an **expression string** | `stars[0]` |
| a star on a stat the sim does not report | `stars[0].stat` |
| **one central signature per band instead of one per boundary** | `signatures` |
| an unsorted wind table | `wind` |

The last-but-one is D126's rule, enforced: `signatureAltitudes()` is the required set and the
tolerance is `SIGNATURE_OFFSET_WU` (200 wu) either side, so the worst adjacent pair stays inside the
425 wu landscape bound. **A level laid out with one signature in the middle of each band is refused**,
with the arithmetic in the message.

**Star conditions are structured, never expression strings** (deliverable 2): `{ stat, op, value }`,
`stat` drawn from `RUN_STATS`. An expression string needs `eval`, `eval` needs a browser-ish global,
and a star that cannot be evaluated headlessly cannot be checked by P11's balance gate over 100
levels — which is the phase that decides whether the curve works. `evalCondition` is exported so
P10's debrief and P11's gate use one evaluator, for the same reason W5 exists.

**W1b** — `RUN_STATS` is diffed against a **real** `sim.mjs` run summary on every gate run, not
against a list typed twice: **22 declared, 26 in the summary, 0 missing, 0 unclaimed** (`level`,
`seed`, `pilot`, `abort` are identity and failure-reason fields, deliberately excluded and named as
such). A stat renamed in the sim now fails loudly here instead of turning every star that used it
into a silent never-awarded.


---

## 4 — K5, re-specified (D139). LANDED, and the ruling's own premise did not survive it.

**`--p6gates` 8/10 → 9/10.** K5 reads **+85.43 ± 4.69 HP per sortie, t = 18.2** against a bar of 2,
positive in 6/6 cells, from **0 points**. K6 is untouched and still red, correctly (§3, P6_NOTES §3).

**The predecessor's work was NOT clean at the pause.** `tools/sim.mjs` was saved at 09:51, nine
minutes after `P9_NOTES.md`, carrying a re-specified `ladderReport` that referenced **`K5_RUNS`, a
constant that was never defined** — so `node tools/sim.mjs --p6gates` died with a `ReferenceError`
before printing anything. The handoff said the pause was clean; it was one identifier short of
running. Recorded because the next agent was told to trust it.

### D139 is right about the death rate and wrong about the ladder

The ruling has two halves. The first — the death rate cannot measure this, because it is pooled on an
**outcome-dependent** filter and quantised at 3.33 points by 30 sorties — is correct and is why the
re-specification is onto a continuous measure.

The second half is *"the reinforcement ladder is fine; the criterion cannot see it"*, evidenced by
**"+18.6, +13.1, +3.3, +11.6, pooled +7.4 HP per sortie"**. **That figure does not survive more
sorties.** It was measured at 30 per cell — the same 30 whose quantisation the ruling had just
condemned in the death rate — and the HP delta at 30 is noise of the same size:

| sorties/cell/arm | seed block | pooled ΔHP | ± SE | t | |
|---|---|---|---|---|---|
| 30 | 4000 | **+7.75** | 5.80 | 1.34 | the figure D139 was written on |
| 30 | **9000** | **−2.48** | 4.65 | −0.53 | **the sign flips on an independent block** |
| 60 | 4000 | +4.15 | 3.78 | 1.10 | |
| 120 | 4000 | +2.18 | 2.52 | 0.87 | |
| 120 | 9000 | −1.13 | 2.33 | −0.49 | |
| **240** | 4000 | **−0.78** | 1.80 | −0.44 | |
| **240** | 9000 | **−0.80** | 1.68 | −0.48 | |

The effect **shrinks toward zero as the SE shrinks**, which is the signature of an effect that is
zero. A real +7.4 would have held its size and grown its *t*. So the "+7.4 HP in every cell" was the
**ninth** believable-wrong reading on this project, and it is the second one produced by the same
30-run sample the ruling was diagnosing.

**Reproducible, not a claim about a deleted state:** `--break rein-stacked` restores the inherited
behaviour and reads **+7.85 ± 5.80, t 1.35** at 30 runs — the D139 number, to the decimal.

### What was actually wrong: the treatment was never delivered

Two defects, both in *delivery*, both invisible to every check that existed.

**1. The reinforcements arrived dead.** `crateWorld`'s `onReinforce` spawned every aeroplane at
`player.sx + dir * 800`, and `flushPending` fires **every** pending reinforcement in **one tick** —
which is exactly what a level that starts three crates behind must do. So `world.t` was the same for
all of them and so was the spawn point. Both reinforcements materialised **on top of each other**:

```
COLLISION.radius   = 5.2 m          both spawned at the same (x, y) — separation 0
COLLISION.acDamage = 60 HP per tick applied to BOTH, every tick they overlap
kestrel structure  ~ 60 HP          dead on the frame it arrived
```

Traced, not inferred — the debug trace at seed 4000, 1 enemy, `preLost 3`:

```
REIN kestrel spawned= true id= rein0.0 x= 300 y= -560   player -500 -500
REIN drover  spawned= true id= rein0.0 x= 300 y= -560   player -500 -500
t=0   red0@499,-430 hp=55   rein0.0@299,-560 hp=0    rein0.0@299,-560 hp=130
t=10  red0@43,-481  hp=-7   rein0.0@110,-398 hp=-4   rein0.0@273,-259 hp=-50
t=30  red0@-3,-145  hp=-7
```

Both carry the **same id** as well (`'rein' + world.t.toFixed(1)`, and `world.t` is 0 for both), so
they also collided in `byIdMap`.

The consequence at the mission level, seed 4000, 1 enemy, before and after:

| | `preLost 0` | `preLost 3`, inherited | `preLost 3`, fixed |
|---|---|---|---|
| HP lost | 122.1 | **122.1** | **220 (dead)** |
| enemy-seconds | 35.9 | 79.8 | 311.7 |
| reinforcements | 0 | 2 | 2 |

**HP lost was bit-identical to one decimal place** with and without the treatment. Two extra
aeroplanes and a damage multiplier moved the player's damage by *nothing*, because the aeroplanes
were wreckage before they flew a metre.

**And the gate called that DELIVERED.** The predecessor's selector is `deltaRedSeconds > 0` — chosen,
correctly, because it is a property of the treatment and cannot bias the outcome. But a destroyed
aeroplane stays in `world.live` for ~20 s, so **two carcasses produced +45 enemy-seconds and the
selector read `delivered: yes` in all six cells.** A treatment-side selector is not the same thing as
a delivered treatment; enemy-seconds is not proof of life. That is now written where the selector is.

**The fix is the file's own spacing, not a new number.** `crateWorld` lines its opening enemies up at
`i * 130` m in x and `i * 70` m in y and they have never collided; reinforcements now use the same
ladder, and the id carries the ordinal. 130 m against a 5.2 m collision radius is **25×**.

**2. The damage rung reached nobody.** `advanceLadder` applied step 2's `dmgMult 1.12` by iterating
**`world.live`** — which is rebuilt inside `world.update` and is therefore **empty before the first
tick**. A level that starts behind advances the ladder before tick zero, so the rung was silently
dropped. Measured directly:

```
live before any update:            0
field.dmgMult after 3 steps:       1.12      <- the ledger was always right
per-enemy dmgMult after tick 1:    [1, 1, 1] <- before
per-enemy dmgMult after tick 1:    [1.12, 1.12, 1.12]  <- after
```

Fixed in `js/sim/crates.js` by rolling `world.aircraft` filtered on `alive` instead. **Mid-tick the
two lists are identical**, which is why nothing the game does changes and `--fixtures` passes at
**unchanged blessed hashes** — the byte-level proof that this is a no-op for shipped behaviour.

**Honest size of that one: 0.05 HP per sortie.** Isolated post-fix by `--break preload-live`, K5 reads
**+85.38** against the shipped **+85.43**. Once two live aeroplanes are in the air, 12% on the other
enemies' bullets is not the binding term. **So K5 cannot detect this defect and it is not claimed to** —
the guard is a fixture instead (below).

### The numbers, before and after

`node tools/sim.mjs --ladder --runs 30` (level `k-drop`, seeds 4000–4029, 6 cells = 2 guns × 3 enemy
counts, both arms):

| cell | baseline HP | ΔHP inherited | ΔHP fixed | death % → % fixed | Δenemy-s inherited → fixed |
|---|---|---|---|---|---|
| t1/1e | 104.6 | +0.0 | **+111.3 ±8.83** | 3.3 → 80.0 | +45.5 → **+238.8** |
| t1/2e | 121.6 | +18.6 | **+92.0 ±9.02** | 6.7 → 83.3 | +53.6 → +257.7 |
| t1/3e | 156.4 | +13.1 | **+44.9 ±12.76** | 33.3 → 76.7 | +31.7 → +271.6 |
| t2/1e | 91.4 | −0.1 | **+119.3 ±10.90** | 0.0 → 76.7 | +45.5 → +217.0 |
| t2/2e | 121.0 | +3.3 | **+92.0 ±11.45** | 10.0 → 80.0 | +41.2 → +235.2 |
| t2/3e | 145.2 | +11.6 | **+53.1 ±14.87** | 30.0 → 73.3 | +29.9 → +226.8 |
| **pooled** | 123.4 | **+7.75 ±5.80, t 1.34** | **+85.43 ±4.69, t 18.20** | **+64.4 points** | |

**Stable across independent seed blocks, which is the whole point** — the inherited figure was not:

| | seed 4000 | seed 9000 | agreement |
|---|---|---|---|
| inherited, 240/cell | −0.78 ±1.80 | −0.80 ±1.68 | agree, at zero |
| **fixed, 120/cell** | **+74.35 ±2.05** | **+75.75 ±1.87** | **1.9%** |

**Magnitude in a unit this same sweep measures**, rather than one invented for it: one *more* hostile
aeroplane costs **26.4 HP** per sortie (from the baseline arm's own 1e→2e→3e ladder), so three lost
crates are worth **3.24 of an extra aeroplane**. The death rate is retained and reported as D139
required, and it is no longer flat: **+64.4 points**, against a quantum of 3.33.

### The sortie count is DERIVED and was NOT raised to make the gate pass

`K5_RUNS` stays at **30**, and the sweep to 240 exists to falsify the inherited number, not to buy
significance. The a-priori sizing rule is a property of `LADDER`, decided before the result:

```
smallest rung of LADDER   step 2, dmgMult 1.12 — the only rung that is not an aeroplane
pooled baseline           123.4 HP per sortie   (measured in this sweep, printed not typed)
the rung is worth         0.12 x 123.4 = 14.8 HP
to see it at t >= 2       pooled SE <= 7.4 HP
measured SE at 30         4.69 HP               -> 1.6x inside
```

That a-priori figure is **conservative and the measurement says so**: the rung really delivers
**0.05 HP**, which no sample resolves (SE ≤ 0.025 would need ~1.1 million sorties per cell) and which
the ladder as a whole plainly does not depend on. Sizing to the a-priori rung is the honest
compromise; sizing to the observed *t* would have been the forbidden move, and would not have been
needed anyway — the fix took *t* from 1.34 to 18.20 at an unchanged 30 runs.

### Break-switches — every one RUN, and what each caught

| switch | scope | result |
|---|---|---|
| `--break no-ladder` (30 and 120/cell) | K5 | **RED — exactly +0.00**, all six cells, and 0/6 delivered. The two arms then receive bit-identical input, so the number does not merely go flat, it goes to zero |
| `--break rein-stacked` (30/cell) | K5 | **RED — +7.85 ±5.80, t 1.35.** Reproduces the inherited state to the decimal, so the before/after above is a measurement and not a memory |
| `--break preload-live` | fixture `ladderPreload` | **RED — `carrying 0/3`** against the shipped `3/3` |
| `--break preload-live` | K5 | **GREEN, +85.38 vs +85.43 — and reported as such.** K5 is not sensitive to that defect and the fixture is why it is still guarded |
| the pre-existing `ladderSpawns` fixture | — | **STAYS GREEN under `preload-live`.** It runs at `enemies: 0`, so it could only ever check `field.dmgMult` — the ledger — and the ledger was always right |
| positive control, already in the sweep | K5's own measure | one more hostile aeroplane moves it **+26.4 HP**, so the measure demonstrably resolves aeroplanes; the inherited treatment moving it 0.0 was the measure working, not failing |

**`ladderSpawns` staying green is the finding to keep.** A fixture named *"the ladder is aeroplanes,
not a counter"* was configured with no aeroplanes to collide with, so for two phases it certified the
ledger while the delivery was broken. The new `ladderPreload` fixture is the same claim asked of the
aeroplanes that are **already flying** — `liveAtLoad 0, redsAfterTick 3, carrying 3` — which is the
state K5's treatment arm is in and the state a level that starts behind will be in.

### One thing NOT fixed, and flagged rather than tuned

**The treatment arm's death rate is now 73–83%, far outside DESIGN §10.5's 8–30% band.** That is not
a defect in the instrument and I have not touched a constant to bring it in. The harness deliberately
runs the hardest isolation of the claim — no crates on the map at all, the player ignoring them and
never fleeing, and the whole three-step ladder pre-loaded at tick zero — which is a state a real
sortie reaches gradually if at all. Whether §4.5's ladder is too steep *in a real mission* is a
balance question, it needs the level format and P11's curve, and it is **REQUEST-9**.

### Regression after §4

| suite | result |
|---|---|
| `sim.mjs --fixtures` | **9/9, blessed hashes unchanged** — the crates.js change is a no-op for the game |
| `sim.mjs --p6fixtures` | **14/14**, including the new `ladderPreload` |
| `sim.mjs --gates` | **14/14** |
| `sim.mjs --p6gates` | **9/10** — was 8/10. K5 PASS; K6 still red and deliberately untouched |
| `worldgate.mjs` (+`--falsify`) | 10/10, every control RED |
| `ladder.mjs` (+`--falsify`) | unchanged (P4a only, D135), 5/5 controls RED |
| `corecheck.mjs`, `statecheck.mjs`, `hudcheck.mjs`, `p3guard.mjs` | clean · 12/12 · 23/23 · GREEN at 34.0136 px |
| `skygate.mjs` portrait **and** `--w 844 --h 390` | **3/3 in each frame** |
| `orient.mjs` | **PASS**, 20 rotations, zoom 0.7577–1.0000 inside both clamp floors |
| `touch.mjs` | **PASS**, no page errors |
| `sim.mjs --p5gates` | see the row below |

**Portrait regression: nothing moved.** `skygate` portrait, `orient`, `touch`, `hudcheck` and
`p3guard` are all byte-identical to §3's table. Expected — the two fixes are confined to `js/sim/`
crate reinforcement delivery and touch no renderer, camera or view profile.


---

## 5 — `js/data/level.js` and `js/data/act.js`. LANDED. W6, W7 and the act format measured.

**`worldgate` 10/10 → 15/15, and 19/19 controls RED.** Five new criteria: W1d, W1e, W6a, W7, WA.

Written **to satisfy `validate.js`**, per the brief. The order was: read the validator, write the
loader against it, and only then add rules to the validator — one rule, W1e, and it is there because
it catches a real authoring fault rather than because the loader wanted it.

### §7.1's example does not satisfy this project's own validator, in three places

Each is settled by arithmetic and each is **REQUEST-10** — I own neither `ARCHITECTURE.md` nor the
authored format, so `level.js` accepts both readings where it can and states which one it took.

**1. `bands`.** §7.1 shows an object keyed by band id with mud `0..-333`, belt `..-1667`,
floor `..-3000`. `checkBands` requires the thinnest band ≥ 700 wu (§3.3 constraint 1), and that mud
is **333 wu**. So §7.1's own example band table is rejected by `js/data/validate.js`, and D26/D126
freeze the real edges as physics-facing. The loader therefore reads:

| authored `bands` | read as |
|---|---|
| an **object** keyed by band id | per-band **decoration** — `flak`, `haze`, `coverage`, `drift` — merged onto the shipped geometry |
| an **array** | geometry, passed straight to `checkBands`, which judges it |

Neither is silently dropped. A level that wants new geometry may still ask; it will simply have to
satisfy §3.3.

**2. `weather.wind` and `weather.gust` are wu/s, not m/s**, and the arithmetic decides it rather than
taste:

```
§7.1 authors     wind { x: -40 },  gust 26
WIND_MAX_MS      25                            (js/sim/world.js)
read as SI       40 m/s and 26 m/s -> BOTH exceed the limit, so windProfileErrors REJECTS
                 the document's own example level
read as wu/s     -40 x 0.15 = -6.0 m/s,  26 x 0.15 = 3.9 m/s
corroboration    k-drop, the authored reference crate level, runs -4.5 .. -5.5 m/s
```

The evaluator is SI — `windAt(profile, altM)` takes metres and returns m/s — so the loader converts
with `M_PER_WU`. That is D26's rule ("authored in SI, derived into wu") running in the other
direction, which is the direction a level file has to run in.

A scalar or a vector expands to a **two-point** table, `[[0, ms], [CEILING_M, ms]]`, not one point:
`windProfileErrors` rejects a single-knot table (W5f) precisely so a level cannot lose its shear
silently. `CEILING_M` comes from `world.js`; nothing here is typed.

**3. Beat position is `x`.** §7.1 says `x`; `worldgate`'s existing W1 fixture writes `at`. `x` wins —
§7.1 is the format's authority and "fires when the camera passes `x`" names it — and `at` is accepted
as an alias so the fixture keeps working. Both normalise to `x`.

### The one rule added to the validator, and why it is not the tail wagging the dog

**W1e — beats must ascend, and must lie inside the level.** `js/sim/spawner.js` (item 5) walks **one
forward cursor** as the camera advances, which is what W8's "no allocation after warm-up" buys. A
beat behind the cursor **never fires at all** — the level-format twin of the silently-never-awarded
star that `RUN_STATS` exists to prevent.

`level.js` sorts on load **and it still fails validation**, deliberately. A loader that quietly
repairs an out-of-order beat makes the level fire at a different moment from the one the author read
on the page, which is the same class of quiet repair as §4's `delivered: yes` for two dead aeroplanes.

```
out-of-order            -> beats[1].x   "…is behind beats[0] at 6800. Beats must ascend: the
                                          spawner walks one forward cursor, so a beat behind it
                                          NEVER FIRES (W8)"
a beat at 99,000 wu in a 42,000 wu level -> beats[0].x
```

### D126's signature rule is satisfied BY CONSTRUCTION

A level that says nothing about signatures gets `signatureAltitudes()` — the ten placements, one near
**each** boundary of every band with two neighbours. That matters because the rule is easy to author
wrongly and the failure is invisible in portrait: one central instance per band puts Belt's and
Floor's 1,150 wu apart against a **425 wu** landscape bound (D126, §1). An author who overrides is
checked against the same set by `validate.js`. The default costs **0 bytes on disk** — see W6.

### W6a — the LOADER round trip. **Not the brief's W6**, and named so it cannot be mistaken for it

The brief's **W6 is "`genlevels.mjs` regenerates the four worked levels byte-identically from the
DESIGN §8 table" — that is item 7 and it is still open.** W6a is the half W6 stands on: that the
format itself loses nothing across a load/save. A generator round trip means nothing until it does.


`serializeLevel` emits the **authored** form: only what differs from the derived default. So the
round trip proves two things at once, and the second is the one worth having:

| | |
|---|---|
| `createLevel(JSON.parse(serializeLevel(L)))` | **deep-equal to `L`**, and re-serialises **byte-identically** |
| the emitted document | **1,650 B** for §7.1's example, with the ten signatures and every band default costing **0 bytes** |

A serializer that wrote the fully-defaulted object would round-trip just as well and would tell you
nothing about whether the format is still bands and beats. The control confirms the comparison has
teeth: **deleting one emitted field makes the round trip differ** rather than being absorbed by a
default.

### W7 — the 6 KB cap, and the fixture I had to throw away

**My first fixture failed the cap and the fixture was wrong, not the cap.** It was 60 beats plus 12
**inline** radio lines and came to **9,071 B**, 148% of 6,144. Both halves were invented by me:

- **60 beats is 8.5× §7.1's own density** (7 beats over 42,000 wu). DESIGN's level table settles it
  properly — **maximum 4 enemy groups** (level 98; mean 1.5, p90 3) and **maximum 12 crates**
  (level 90; p90 8), across all 100 rows.
- **A level never carries the words.** §7.5: *"all player-facing text and every voice line live in one
  file"*, keyed `a1-04.open`. A beat carries a **line id**.

Rebuilt from DESIGN's own maxima — 4 enemy groups + 12 crates + 4 events + 6 radio cues + a boss =
**27 beats**:

| | bytes | of the 6,144 B cap |
|---|---|---|
| §7.1's example level | 1,650 | 27% |
| **the densest level DESIGN specifies** | **3,859** | **63%** |
| a 900-beat coordinate dump | 102,354 | **16.7× over — the cap bites** |

That is the honest headroom: 63%, not "comfortable". **Recorded rather than smoothed over**, because
the cap's job is to fail a coordinate dump and it demonstrably does, while a realistic level clears it
by a margin that a later phase could spend.

### WA — the act format

`LEVELS_PER_ACT` is **derived, not typed**: `LEVELS_TOTAL / ACTS = 100 / 5 = 20`, asserted at module
load, and §7.2's example independently lists 20. The level list is derived too — `a1-01 .. a1-20` is
the only list act 1 can legally have, so authoring it by hand is twenty chances to typo a coordinate
that the act number already implies.

`validateAct(act, levelsById)` takes the loaded levels **because the act's list, the level ids inside
it and each level's own `act` field are three statements of one fact**, and that 5 × 20 structure is
the seam B, C and D each designed across independently (MANAGER_STATE). Refused, by name:

| | |
|---|---|
| a level whose own `act` says 2 while `act1` lists it | `levels.a1-04.act` |
| a 2-level act | `levels` |
| `gate.starsRequired` larger than the stars that exist before this act | `gate.starsRequired` — 999 in act 3 against the 120 earnable in acts 1–2 |
| `parseLevelId('a1-3')`, `parseLevelId('a9-01')` | both `null` — the id **is** the coordinate, so it is strict |

`levelOrdinal('a3-05') = 45 of 100`, so P11's difficulty curve has one x-axis rather than five.

### Regression after §5

| suite | result |
|---|---|
| `worldgate.mjs` | **15/15** — was 10/10 (W1d, W1e, W6a, W7, WA) |
| `worldgate.mjs --falsify` | **19/19 controls RED**, exit 0 |
| `corecheck.mjs` | clean — `level.js` and `act.js` are pure and node-importable |
| `sim.mjs --fixtures` / `--p6fixtures` | 9/9 (hashes unchanged) · 14/14 |
| `statecheck.mjs` | 12/12 |


---

## 6 — `js/sim/spawner.js`. LANDED. W8 measured in the full sim, W3a/W3b in a stub.

**`worldgate` 15/15 → 19/19, 22/22 controls RED.** Four new criteria: W1f, W3a, W3b, W8.

### The three properties, and why each is load-bearing

**One forward cursor, advanced against the FURTHEST camera X, not the current one.** Measured, and
this is the number that justifies it: over 300 s of the busiest level the camera **retreated on 5,057
of 18,000 ticks** — 28% of the mission. An aeroplane doubles back constantly, and a cursor compared
against the *current* x would re-fire the level's opening wave every time. `validate.js` refuses an
out-of-order beat for the mirror reason: a beat behind the cursor never fires at all.

**Seeded.** Every jitter is drawn from `world.ctx.rng` and nothing else. Same seed → identical spawn
log; a different seed → a different one (W3b).

**Pooled.** Nothing allocates per beat or per tick: one scratch options object reused in place, and
`world.spawn` draws from the fixed 16-slot pool.

### The spawn lead is DERIVED from the criterion the whole pivot turned on

```
frame forward reach   888 wu   landscape at the clamp floor (D121, MEASURED; portrait
                               reaches 404, so landscape binds under D123)
effective gun range   440 wu   GUN_WU.rangeEff — IMPORTED from js/sim/weapons.js, because
                               a second copy of 440 is the D131 defect
SPAWN_LEAD_WU         1,328 wu
```

An attacker placed there cannot open fire until it has closed 440 wu, and it has been inside the
frame for every metre of that. **That is §4.4.2 P2 — "an attacker must not reach gun range having
never been on screen" — restated as a distance the spawner can honour**, and P2 is the criterion the
portrait→landscape pivot turned on. Spawning at the frame edge instead reproduces exactly the 25.7%
failure D121 measured.

### W8 — 300 s of the busiest level

`node tools/sim.mjs --spawner --levelfile <f> --secs 300`. The rig lives in `sim.mjs` rather than in
the gate **because `sim.mjs` owns world construction** — a gate that builds its own world is
measuring a second implementation of the game, which is the defect W5 exists to name. `worldgate`
shells out to it, the pattern W1b already uses.

| | |
|---|---|
| beats fired | **17/17** over 300 s, camera reached 10,663 wu |
| entity pool | `{aircraft 16, bullets 512, chutes 8}` → **unchanged** |
| dropped spawns | **0** |
| peak hostiles alive | **15, against a 16-slot pool** |
| camera retreats | 5,057 of 18,000 ticks |

**The peak is 15 of 16 and that is reported, not smoothed.** The busiest level DESIGN specifies sits
one slot below `POOL_AIRCRAFT`. It passes, and it passes by one aeroplane; P11 should know that
before it writes 100 levels.

**The break-switch bites, and this is the one that matters most.** Eight groups of three inside
480 wu: **3 spawns dropped of 8 beats fired, peak 15 alive.** Before the spawner counted them,
`world.spawn` returning `null` was **silent** — and §4 of this file is the record of what a silent
undelivered spawn costs: two phases of a gate reading a treatment as delivered when both its
aeroplanes were wreckage.

### Two counters, not one

`poolMisses` (the pool is full) and `unknownTypes` (the beat names an enemy that does not exist) are
**different faults and do not share a counter.** They did at first, and the first W8 run read
`poolMisses: 3` when the real fault was that `hunter` is not in the roster — a typo wearing a
capacity problem's clothes.

### W1f — §7.1's example names four enemies the sim does not have

The fix for that typo turned into a criterion. `validate.js` now checks `beats[].spawn` against the
roster `js/sim/entities.js` actually builds, and `beats[].band` against `BANDS`:

| | |
|---|---|
| shipped roster | kestrel, wasp, shrike, drover, ox, marlin, nightjar, anvil |
| §7.1's example | **scout, aaNest, balloon, hunter** — four named errors |
| DESIGN §8.3's codebook | single letters over §5.1's codes: `k`, `w`, `d`, `o`, `s`, `g`, `B`, `F`, `Z`, `A#` |

**Nothing maps the two vocabularies, and `g`/`B`/`F`/`Z` (ground guns, balloons, flak, zeppelins) have
no entity type at all.** That is `tools/genlevels.mjs`'s to solve (item 7) and it is **REQUEST-11**.
W1d is measured against a roster-mapped copy of §7.1's example so the two questions do not hide
inside one another; W1f measures the verbatim document.

### W3a/W3b are NOT the brief's W3

The brief's W3 is *"same seed → identical state hash over 1,000 runs of each worked level"* — that is
item 7's, and it is still open. W3a is the cursor property (tested against a stub world, because the
property is about the cursor and the real rig's 28% retreat rate would drown a regression in noise);
W3b is the seeding property, measured on the real rig.

### Regression after §6

| suite | result |
|---|---|
| `worldgate.mjs` | **19/19** — was 15/15 |
| `worldgate.mjs --falsify` | **22/22 controls RED**, exit 0 |
| `corecheck.mjs` | clean — `spawner.js` imports only `js/core/` and `js/sim/` |
| `sim.mjs --fixtures` / `--p6fixtures` | 9/9 (hashes unchanged) · 14/14 |
| `statecheck.mjs` | 12/12 |
| `ladder.mjs` | unchanged (P4a only, D135) |


---

## 7 — `js/sim/terrain.js`. LANDED. The slope bound is derived, and it condemned two of my own profiles.

**`worldgate` 19/19 → 22/22, 25/25 controls RED.** Three new criteria: WT1, WT2, WT3, plus an
eighth row in W1.

### What it is, and what it deliberately is not

The silhouette the renderer draws, the particles collide with and the editor previews — **one
implementation**, for the reason W5 gives one system over. `js/gfx/particles.js` already has the
socket (`setTerrainQuery`, line 54); `terrain.query(xM)` is the function that fits it, and the
`M_PER_WU` conversion happens once inside the adapter rather than in every caller.

**It does not touch flight.** `groundContact` in `js/sim/damage.js` treats `sy >= 0` as a flat ground
plane, and `damage.js` is a combat constant this phase may not move. So terrain is the silhouette and
the particle surface; making the aeroplane collide with a ridge is a damage-model change and belongs
to whoever owns that file. Said plainly rather than left as an implied gap.

### The slope bound, derived from the flight envelope

```
best climb   90 wu/s    js/core/bands.js — BEST_CLIMB_WU_S, 13.5 m/s
cruise      280 wu/s    D126
MAX_SLOPE   90 / 280 = 0.3214   = 17.8 degrees
```

A ridge steeper than that rises faster than the aeroplane can climb while flying along it — **and in
a 2D side-scroller the terrain under you IS your path**, so a valley floor steeper than the bound has
no exit. That is a level which cannot be completed, not a level which is hard.

### The closed form is this generator's own, and the first one I wrote was a sine's

`pi * amp / wavelength` is a *sine's* maximum slope. This generator is two octaves of smoothstepped
value noise, so its bound is different:

```
base octave   amplitude fraction (1 - d/2)   at wavelength wl
fine octave   amplitude fraction (d/2)       at wavelength wl/4   <- 4x the slope per unit amplitude
smoothstep    max |f'| = 1.5
slope <= 1.5 * amp * [ (1 - d/2) + 4*(d/2) ] / wl  =  1.5 * amp * (1 + 1.5 d) / wl
```

**The sine version condemned `ridge`, whose measured slope is 19% inside the limit, and let
`pass_narrow` through when it was 3× over.** A bound borrowed from a different function is a bound
that is wrong in both directions at once. Measured against the closed form, per profile:

| profile | amp | wavelength | closed form | measured | bound |
|---|---|---|---|---|---|
| plain | 30 | 4,200 | 0.0155 | 0.0124 | 0.3214 |
| trenchline | 90 | 2,600 | 0.0987 | 0.0804 | 0.3214 |
| ridge | 420 | **3,450** | 0.3196 | 0.2590 | 0.3214 |
| pass_narrow | 620 | **5,950** | 0.3204 | 0.2632 | 0.3214 |

The closed form over-reads the measurement by a consistent **19–21%** across all four, which is what
a correct conservative bound looks like — it is one number, in one direction, at every amplitude.

### Wavelengths are DERIVED, and the floor only ever raises the authored value

**Two of the four profiles I first typed were illegal against a bound stated ten lines above them.**
`minWavelength(amp, detail)` inverts the closed form; the authored wavelength is then raised to it
only where it was too short:

| profile | authored | floor | shipped | |
|---|---|---|---|---|
| plain | 4,200 | 200 | 4,200 | untouched |
| trenchline | 2,600 | 800 | 2,600 | **§7.1's own number, untouched** |
| ridge | 3,400 | 3,450 | **3,450** | raised 1.5% |
| pass_narrow | 1,900 | 5,950 | **5,950** | raised **3.1×** |

**Using the floor as a target rather than a floor was the second mistake**, and it is recorded because
it is the subtler one: it produced four legal profiles and turned §7.1's 2,600 wu trench line into an
800 wu one. Legal, and nothing like the thing the document describes. A constraint satisfied is not a
design met.

### REQUEST-12 — "a valley with no room to loop" is not achievable in 2D, and the arithmetic says so

DESIGN §8.2 gives Act 3 the mechanic *"terrain — ridges to climb, **valleys with no room to loop**"*.
Two shipped numbers make that unreachable together:

```
F6, measured   combat turn diameter 263 wu at corner
"no room to loop" therefore needs a valley floor narrower than 263 wu
a valley floor is about half a wavelength, so wavelength < ~526 wu
MAX_SLOPE at that wavelength caps the relief at
    0.3214 x 526 / (1.5 x (1 + 1.5 x 0.7)) = 55 wu = 8.3 m
```

**A valley too narrow to loop in has walls 8 m high — it is not a valley.** Conversely `pass_narrow`
at a legal slope is **5,950 wu wide**, which is 892 m and is not narrow either. The mechanic works in
three dimensions, where a valley's walls are lateral and the aeroplane's turn is not; in a 2D
side-scroller the terrain under you is your path, so the two constraints collide head-on.

**I have moved no constant and invented no mechanic.** Act 3's horizontal constraint probably has to
become something other than terrain relief — cloud walls, flak corridors, or a hard band ceiling —
and that is a design call the manager owns. It matters before P11 writes levels 41–60.

### Regression after §7

| suite | result |
|---|---|
| `worldgate.mjs` | **22/22** — was 19/19; W1 now rejects **8/8** by name |
| `worldgate.mjs --falsify` | **25/25 controls RED**, exit 0 |
| `corecheck.mjs` | clean — `terrain.js` imports only `js/core/` |
| `sim.mjs --fixtures` / `--p6fixtures` | 9/9 (hashes unchanged) · 14/14 |
| `statecheck.mjs` | 12/12 |


---

## 8 — `--p5gates` FINISHED. It is 5/10 and NOTHING MOVED.

The predecessor left this row as *"PENDING at handoff — an unrun suite is not a passing suite"*. It
has now run to completion (28 minutes of CPU, under contention):

```
  PASS  C1   purity across the sim graph              10 files clean
  FAIL  C2   time-to-kill                             scout 0.87 s (13/14); player 9.78 s
  PASS  C3   player lethality ratio                   11.3x
  FAIL  C4   intended tier wins 55-70%                A1:92% A3:76% ... S3:18%
  FAIL  C5   sidegrades 45-65%                        51 airframe x ace cells
  FAIL  C6   counter-play >= 18 points                A1:2.5 A3:-57.9 ... S2:3.5
  FAIL  C7   the mirror ace at k 0.90                 46.0% of 774 decisive (+-1.8)
  PASS  C8   flee rate 12-22%                         14.7% (22/150)
  PASS  C9   zoom neutrality of duel summaries        byte-identical
  PASS  C10  no entity allocation after warm-up       warm 536, then +0 over 200 duels
  5/10 pass
```

**Identical to the reading MANAGER_STATE recorded at the pause**, including C7 at **46.0% of 774
decisive, ±1.8** — which is the repeat run D140 asked for, and it is bit-repeatable, so D140's
conclusion stands: *"if C7 is bit-repeatable at 46.0% then the number to correct is D87's provenance,
not the model."* C4/C5/C6 are the deliberately-stale rows D89 names and belong to P11.

Two things worth saying about it:

- **C10 is P5's own version of W8** — "no entity allocation after warm-up, warm 536, then +0 over 200
  duels" — and it is green, which is the independent corroboration that §6's spawner did not change
  the pool discipline it inherited.
- **It is 28 minutes, not the 9 the previous note estimated.** Anyone re-running it before P10 should
  start it first and do something else, not wait on it.


---

## Regression after §2 and §3

| suite | result |
|---|---|
| `sim.mjs --fixtures` | **9/9**, blessed hashes unchanged |
| `sim.mjs --gates` | **14/14** |
| `sim.mjs --p6gates` | was 8/10 at the time of this section; **now 9/10, see §4** |
| `worldgate.mjs` (+`--falsify`) | 9/9, 10/10 controls RED |
| `ladder.mjs` (+`--falsify`) | unchanged, 5/5 controls RED |
| `corecheck.mjs`, `p3guard.mjs` | clean |
| `orient.mjs`, `touch.mjs`, `statecheck.mjs` | 8/8, 15/15, 12/12; all controls RED |
| `skygate.mjs --falsify` portrait **and** landscape | 3/3 gates, 3/3 controls RED in **each** frame |
| `sim.mjs --p5gates` | **RUN AND CLOSED — 5/10, unchanged. See §8.** |

**On the pending row, honestly:** `--p5gates` is the P5 combat/AI suite and it had not returned when
this file was written. It is the *least* likely of the suites to have moved — nothing under
`js/sim/{ai,weapons,damage,entities}.js` was touched — and the two suites that DO exercise the one
file I changed have both returned clean (`--fixtures` at unchanged blessed hashes, `--p6gates` at
its pre-existing 8/10). But an unrun suite is not a passing suite, and it is recorded as unrun
rather than assumed. **Run it before P10 ships.**

W5c re-run at a different seed and 4x the samples — `--seed 99 --n 40000` — still **worst \|delta\| 0**,
and W5d still moves (36.38 m on `seeded#0`). The result is not an artefact of one sampled domain.

`--fixtures` passing with **unchanged blessed hashes** is the byte-level proof that moving `windAt`
and adding `solverWind` changed no shipped behaviour; W5c is the same proof at the function level.


---

## 9 — item 7. The codebook, `genlevels.mjs`, and the four worked levels. LANDED.

**`worldgate` 22/22 → 27/28, with 32/32 controls RED.** Six new criteria: **WC** (the codebook),
**W1g** (the airframe), **W6** (the generator round trip), **W7b** (the shipped levels against the
cap), **W3** (determinism) and **W4** (the band slice). **W4 is red on `a1-01` and I have not tuned
it** — the arithmetic is below and it is REQUEST-15.

### The codebook (D146), and it is derived rather than typed

D146 ruled that the shipped roster is the authority. The table lives in **`js/data/level.js`** — the
level format's own module, so there is exactly one copy (D72) — and every letter is **its type's own
initial**:

```
k kestrel   w wasp   s shrike   d drover
o ox        m marlin n nightjar a anvil
```

All eight initials happen to be unique, so nothing had to be invented. **`level.js` refuses to load
if two ever collide**, and that assertion is the point: a ninth aeroplane silently aliasing an eighth
would pass `validate.js`'s roster check and play as the wrong machine — the never-firing beat wearing
a fourth coat. Six of the eight agree with DESIGN §5.1's own codes; §5.1 spells nightjar `N` and has
no anvil at all, and lower case throughout is the rule because §5.1's **upper case marked the things
that are not aeroplanes**.

`CODES_WITHOUT_TYPE` lists the seven that map onto nothing, with what each one is instead:

| code | what DESIGN means | what it is here |
|---|---|---|
| `Z` | zeppelin | **a `boss` beat** — boss-class (§4.6.2), handed to the mode shell, exactly as §7.1's own example does with `zeppelin-l30` |
| `B` `F` `g` `T` `L` `X` | balloon, flak, MG nest, train, searchlight, fuel dump | **no entity type exists.** The generator THROWS on a row that uses one rather than dropping it |

Throwing matters: DESIGN's table uses `B`, `F` and `g` in act 1 alone (levels 5, 11, 13, 20), so P11
hits this on its second level. A generator that quietly skipped them would produce a balloon-bust
level with no balloons that validates clean.

### `tools/genlevels.mjs` — the table is the source

`TABLE` is DESIGN §8.4/§8.5 transcribed **cell for cell** — `#`, `Obj`, `Enemies`, `New / twist`,
`Sky, wind`, `Cr`, `t(s)` — and parsed here, so a designer who edits DESIGN's table can paste the
row. Every geometric number is derived from it:

| | derivation | |
|---|---|---|
| `length` | `t(s) x CRUISE_WU_S` | DESIGN's own duration column at D126's cruise |
| player start | the act's **home band centre** | §7.1's own `-1200 wu` default **is** Belt's centre, which is act 1's home band. That is the corroboration, not a coincidence |
| first beat | `start.x + FRAME_REACH_WU` | first contact after one clear frame (888 wu, D121) |
| last beat | `length - SPAWN_LEAD_WU` | a beat later than that spawns its group past the end |
| group at index `i` | `x0 + (xN-x0) * i/n` | first at the start of the span, last one interval short of the end — a wave arriving at the final metre is a wave you fly away from |
| gates at index `i` | `x0 + (xN-x0) * i/(n-1)` | a **course** has to reach both ends; a **group** does not. Two spreads, deliberately |
| spawn band | home, or one band **above** if the type has `turrets` | a turret is what a transport or a bomber has, and they cruise above the fight. Read off the shipped roster's own shape, not a list here |
| enemy `k` | linear across the act from §8.2's `curve` column | act 1 is 0.15 at L1 → 0.45 at L20; a row's own `@k` wins |
| crate altitude | the **crate source's** own altitude | an Ox drops from its band (§5.1); a zeppelin from its declared station; a level with neither is fed from the Concord Line, and `crates.js` opens that canopy at **1,500 m = `CEILING_WU` exactly** — *"the canopy is ALREADY OPEN when the crate enters reachable sky"*. §7.1's `-9600` is a rounded copy of it |
| crate deadline | `Δalt / terminal`, in wu of level at cruise | binds on a1-12: 11.2 s of fall = 3,126 wu, so the last crate beat sits at 20,746 of 23,872 |
| `reward.scrip` | `cr x CRATE_EV x ACT_MULT[act] + B(act)` | §6.4's formula on `crates.js`'s own constants; only the completion bonus column is transcribed |
| the landmark | the midpoint of the level's **widest beat gap** | ART §4: a landmark's job is to make an otherwise blank stretch memorable, so putting it on top of a beat means the fight is what you remember. Derived from the purpose |

**The zeppelin's altitude comes out of the table's own parenthetical.** §8.5 L25 reads
`1Z (damaged, 500 m)`, and 500 m is the only statement anywhere of where that airship sits, so the
parser reads it rather than discarding it: `-3333 wu`, which `bandIdAt` puts in Deck.

### What is NOT derived, said plainly rather than buried

| | |
|---|---|
| the four level **names** | mine. DESIGN's table has no name column and §7.1's format carries one. P12 owns them |
| a1-04's third star (`stalls <= 1`) | the row's own twist made numeric. **A designer number in a designer table** — the right place for it, but not derived |
| `B(act)`, the completion bonus | DESIGN §6.4's table, transcribed |
| act 2's deck `coverage: 1` | §8.2 says the deck is *permanent*, and 1 is what permanent means. §7.1's illustrative 0.55 is a patchy act-1 deck and is not used |
| `palette` and `ace` on an act | left at their defaults. ART owns the palettes and STORY owns the aces, and inventing either here would put a second copy in the wrong file |

### THE FOUR WORKED LEVELS

| | | length | beats | bytes | |
|---|---|---|---|---|---|
| `a1-01` | *First Light* — PAT, 2k @k0.15, d w2, 0 crates, 50 s | 14,000 wu | 1 | 1,065 B (17%) | clean |
| `a1-04` | *Wire and Wind* — RCE, 8 gates, d w2, 0 crates, 45 s | 12,600 wu | 8 | 1,477 B (24%) | clean |
| `a1-12` | *What They Take* — CRT, 4k + 2o, d w5, 6* crates, 90 s | 25,200 wu | 8 | 1,826 B (30%) | clean |
| `a2-05` | *The Long Grey Shape* — ZEP, 1Z (500 m) + 2k, o w5, 3 crates, 110 s | 30,800 wu | 6 | 1,914 B (31%) | clean |

**The crate source has to be on the map before its crates, and it bit twice.** a1-12's Ox first
landed at 23,872 wu with its canopies opening from 1,488 — crates from nowhere — and the fix knew
only about transports, so **a2-05's zeppelin then did exactly the same thing**: three crates from a
bomb bay that arrives at 15,480. There is now one expression for it, and `crateFrom` names the source
in the generator's own report so the next one is visible rather than inferred.

Plus `data/acts/act1.json` (616 B) and `act2.json` (619 B).

**`a2-25` DOES NOT EXIST AND CANNOT.** The brief and BUILD_PLAN §P9 both name the fourth level
`a2-25`, but `parseLevelId` is strict — `a{act}-{nn}`, both one-based, `nn <= LEVELS_PER_ACT` — and
`LEVELS_PER_ACT` is *derived* as `100/5 = 20`. **Level 25 of the 100 is act 2, index 5: `a2-05`**,
and it is exactly the level BUILD_PLAN describes (the ZEP teach, a cloud-deck event). Shipped as
`a2-05`; REQUEST-13.

### `sim.mjs --levelrun` — so W3 and W4 are measured rather than asserted

The brief's *"report back: the four worked levels with their `sim.mjs` summaries"* needs a level to
be **flown**, and nothing could fly one. `spawnerRun` measures the SPAWNER in the crate world, which
is right for W8 (a claim about the entity pool) and wrong for W3 and W4 (claims about a level).

`--levelrun` builds the world from the **level** — its wind, its player start, its beats through the
shipped spawner — and returns ARCHITECTURE §8.1's run summary, the same field names the stars are
written against, so `evalCondition` scores them off it without a second path. **It is not the story
mode**: no brief, no debrief, no objective evaluation, no save. Those are P10's and building half of
them here would put a second mode shell in the harness.

| | `t` | done | kills | crates | dmg | acc | fuel | occupied bands | stars |
|---|---|---|---|---|---|---|---|---|---|
| a1-01 | 97.1 s | ✅ | 2 | — | 0 | 0.333 | 0.311 | **mud, belt, floor, deck** | clean ✅ thorough ✅ quick ❌ |
| a1-04 | 48.4 s | ✅ | 0 | — | 0 | — | 0.588 | floor, deck | clean ✅ steady ✅ quick ❌ |
| a1-12 | 98.1 s | ✅ | 2 | 1/6 | 0 | 0.500 | 0.166 | floor, deck | clean ✅ greedy ❌ quick ❌ |
| a2-05 | 99.8 s | ✅ | 2 | 1/3 | 0 | 0.150 | 0.509 | floor, deck | clean ✅ greedy ❌ quick ✅ |

Seed 5, one run each; the whole table is bit-repeatable (W3). Crates read 1/6 and 1/3 because the
harness pilot's crate policy is **ignore** — he takes only what he flies through, which is K5's own
hardest-case convention, not a claim about a real player.

### The corridor — a harness decision, declared, and its before/after

The FIRST run of `a1-01` measured this: the player engaged the two Kestrels at 2,100 wu, came out of
the turn pointing **west**, and PATROLLED west for 240 s until the fuel ran out — **57,900 wu off the
far end of a 14,000 wu level**, dead at 254.3 s, `completed: false`. PATROL holds the heading it
inherits. It has no idea where the objective is, **because telling him is the mode shell's job and
the mode shell is P10**; the level's `{ type: 'reach', x: length }` is the whole statement of where
he is going.

So rather than write a second controller in the harness — the defect W5 exists to name, one system
over — `levelRun` gives the level the bounds it already declares, exactly as `keepInside` gives the
crate level its contested area (§7.5's duel rule). `--break no-corridor` restores the pre-fix state
and reproduces **254.3 s / never completes** to the decimal, so the before/after is a measurement and
not a memory.

### W3 — determinism, at the briefed size

**1,000 runs of each worked level, one distinct state hash each; a second seed gives a different
one.** The hash covers every reported field except the seed — time, damage, kills, crates, the whole
`timeInBand` vector and the spawn log.

```
a1-01  1000 runs @seed 5 -> 1 hash (25732eb2)   seed 9 -> c45104e0
a1-04  1000 runs @seed 5 -> 1 hash (d51ec445)   seed 9 -> ed6b88a2
a1-12  1000 runs @seed 5 -> 1 hash (27493d85)   seed 9 -> 7e6c6f29
a2-05  1000 runs @seed 5 -> 1 hash (aa590139)   seed 9 -> 30c89156
```

4,000 missions, ~2 minutes. **`--w3runs N` shrinks it** and the row prints the count it used, so a
fast pass can never be mistaken for the briefed one.

### W4 — RED on a1-01, and the arithmetic says it is not a level fault

"Occupied" is derived rather than a share chosen to make the answer come out: **a band counts if the
player spent longer in it than crossing it costs at best climb** (`thickness / 90 wu/s`). Less than
that is a transit, which is what a band being a *place* rather than a *step* means (D27).

```
a1-01   mud 13.5 s (transit 7.78)   belt 32.3 (11.11)   floor 24.6 (14.44)   deck 26.7 (22.22)
```

**Robust to the threshold**: at a flat 10%-of-mission bar (9.7 s) all four still qualify, so this is
not an artefact of how "occupied" was defined.

**The control says it is the fight, not the layout** — `--break no-beats` strips a1-01's own beats
and it drops to **2 occupied bands (floor, deck) in 51.8 s**. But the deeper reading is arithmetic,
and it is why I have not touched the level:

```
DESIGN §8.2, act 1:  ceiling 600 m,  theatre "low (Mud/Belt/Floor only)"
BUILD_PLAN §6 R-02:  Mud 0-105 m   Belt 105-255   Floor 255-450   Deck 450-750
600 m ceiling  ->  150 m of the act's legal column, a QUARTER of it, lies in DECK
```

**Act 1 cannot be a three-band slice at a 600 m ceiling.** Either the ceiling is 450 m or the act
uses four bands, and both are DESIGN's call, not mine. Corroborating from the other side: the empty
corridor (`--break no-beats`) puts the player in **floor and deck**, so even with no level at all the
shipped AI cruises above Floor's 450 m top. **I moved no constant, changed no band, and did not
re-word W4.** REQUEST-15.

The other three levels pass at 2, 2 and 2 occupied bands.

### The `quick` star, measured, and a derivation that does not survive it

`length = t x CRUISE_WU_S` makes the cruise traverse **exactly** `t`, and the `quick` star's bar is
DESIGN's own `t`. Measured:

| | bar | flown | | |
|---|---|---|---|---|
| a1-01 | 50 s | **97.1 s** | 194% | 2 Kestrels cost **45.3 s** — the fight is 91% of the whole budget |
| a1-01, `--break no-beats` | 50 s | 51.8 s | 104% | **even empty it misses**, by 1.8 s |
| a1-04 | 45 s | 48.4 s | 108% | no enemies at all; the gate course's climbs cost 3.4 s |
| a1-12 | 90 s | 98.1 s | 109% | |
| a2-05 | 110 s | **99.8 s** | 91% | **the only pass** — the pilot exceeds cruise on the long straights |

So the bar is not structurally impossible (a2-05 clears it by flying above cruise), but
**`t(s)` is a mission duration that includes the fighting and `length = t x cruise` spends all of it
on the traverse.** The honest form is `length = (t - fight) x cruise`, and `fight` is a balance
quantity P11 owns with the difficulty curve. **I did not invent a multiplier to make three stars go
green.** REQUEST-16.

### Three defects in the shipped loader, found by pointing the generator at it

None were visible from reading the file; all three came from asking it to produce something real.

**1. A named terrain profile did not bring its own parameters.** `LEVEL_DEFAULTS.terrain` was a
frozen literal of the trench line's numbers, and `createLevel` merged the authored block onto it — so
`terrain: { profile: 'pass_narrow' }`, **DESIGN §8.10's own example spelling**, loaded as
`pass_narrow` carrying the trench line's amplitude 90 and wavelength 2,600 instead of 620 and 5,950.
The right name over the wrong geometry, and `terrainProfileErrors` could not see it because **it**
resolves the base correctly and only the loaded object was wrong. Now resolved through
`TERRAIN_PROFILES` by name.

**2. `player.airframe` was a silent fallback.** §7.1's example — and therefore `LEVEL_DEFAULTS` —
names `"kitehawk-i"`, which is not one of the five ids `js/data/tables.js` builds, and
`playerType()` does `AIRFRAME_BY_ID[id] || REFERENCE`. **A level naming an aeroplane the game does
not build flew the reference machine under the wrong name and nothing anywhere said so** — the
level's stars, its difficulty and P11's whole curve would have been measured against an airframe the
level never asked for. `validate.js` now refuses it by name (**W1g**) and the default is
`AIRFRAMES[0].id`.

**That is a FOURTH defect in §7.1's example**, on top of the three D146 lists.

**3. The loader's sort hid the out-of-order beat from every consumer.** `createLevel` sorts beats —
the spawner's forward cursor needs it — and `validate.js`'s W1e refused an unsorted list. But W1e
checked the **array**, and every real consumer validates what the loader *returned*: by then it is
sorted, so the fault was repaired before anything could see it. `tools/pages/level.html` demonstrated
it (§10). The loader now records `beatOrderFault` and the validator fails on the record, so the
spawner still gets a correct array and the level is still refused.

### Break-switches — every one RUN, and what each caught

| switch | scope | result |
|---|---|---|
| `--break no-beats` | W4 | **RED — a1-01 goes 4 occupied bands → 2, and 97.1 s → 51.8 s.** This is what says the fourth band is the fight |
| `--break no-corridor` | W4 / the traverse | **RED — 254.3 s, never completes, 57,900 wu off the far end.** Reproduces the pre-corridor state exactly |
| `--break camera-current` | W3's hash | **RED — 25732eb2 → 03e2d32b.** The state hash is sensitive to the spawner's cursor rule, so W3 is testing the spawner and not just the RNG |
| a hand-edited level file | W6 | **RED** — one byte changed and the comparison differs |
| a colliding initial | WC | **RED** — and `level.js` throws at module load rather than aliasing |
| `"kitehawk-i"` | W1g | **RED** — `player.airframe`, by name |
| parked at `x=0` | W7b/L1 | **RED** — a1-12 fires 0 of 8, so "all beats fired" is a real condition |

**All three P9 break-switches were STILL GREEN on the first attempt, and the reason is worth the
line.** They were read straight off the command line inside `levelRun`, so `--break no-beats` fell
through `main()`'s dispatcher, printed *"must be one of ..."* and **exited before running anything** —
three controls returning byte-identical hashes, which reads exactly like three controls that do not
bite. **D136's `noreanchor` was the same defect**: a break-switch that is not plumbed is
indistinguishable from a fix that works. They are now registered in `P9_BREAKS` and dispatched like
P5's and P6's.

A second one, from the same hour and worth recording because it is not a code bug at all: the first
four-arm comparison was run from a zsh loop as `${b:+--break $b}`, and **zsh does not word-split an
unquoted parameter expansion**, so all four arms received one argument named `"--break no-beats"`,
`flag('break')` read false, and every arm silently ran the baseline. The shell can fake a green
control as convincingly as the code can.

### Regression after §9

| suite | result |
|---|---|
| `worldgate.mjs` | **27/28** — was 22/22. The one red is **W4 on a1-01**, above |
| `worldgate.mjs --falsify` | **32/32 controls RED** |
| `sim.mjs --fixtures` / `--p6fixtures` | **9/9 at unchanged blessed hashes** · **14/14** |
| `sim.mjs --gates` / `--p6gates` | **14/14** · **9/10** (K6 red, deliberately) |
| `corecheck.mjs` | clean — `level.js` now imports `js/sim/terrain.js` and `js/data/tables.js`, both pure |
| `statecheck.mjs` · `hudcheck.mjs` · `p3guard.mjs` | PASS · 23/23 · GREEN, all four asserts |
| `ladder.mjs` (+`--falsify`) | unchanged (P4a only, D135) · 5/5 controls RED |
| `skygate.mjs` portrait **and** `--w 844 --h 390` | **3/3 in each frame**; `--falsify` **3/3 controls RED in each** |
| `orient.mjs` (+`--falsify`) | PASS, 20 rotations · every control RED |
| `touch.mjs` (+`--falsify`) | PASS, no page errors · every control RED |
| `levelpage.mjs` (+`--falsify`) | **7/7** · **6/6 controls RED** |
| `sim.mjs --p5gates` | see §11 |

**Portrait regression: nothing moved.** `skygate` portrait, `orient`, `touch`, `hudcheck` and
`p3guard` are byte-identical to §8's table, and `levelpage` runs every level in **both**
orientations. Expected: every change is in `js/data/`, `js/core/bands.js` (additive), `js/sim/`
constants that are bit-identical, and `tools/`.

### One housekeeping change, and it is bit-identical

`js/core/bands.js` gained **`CRUISE_MS = 42` / `CRUISE_WU_S = 280`** (D126), beside
`BEST_CLIMB_WU_S`, because the two are only ever used as a **ratio**: `js/sim/terrain.js`'s
`MAX_SLOPE` was `90 / 280` with both written as bare literals, and the generator needed the same
number a third time. `MAX_SLOPE` is now `BEST_CLIMB_WU_S / CRUISE_WU_S`, and `spawner.js`'s two
`speed: 42` literals import it.

**Proven bit-identical rather than assumed**: `13.5/0.15 / (42/0.15) === 90/280` is exactly true in
IEEE754, `worldgate`'s WT1 figures are unchanged to four decimals (`ridge` closed 0.3196, measured
0.2590), and W8's spawn-log hash is still `5a3cb57b`.


---

## 10 — item 8. `tools/pages/level.html`, and the check that found a real defect. LANDED.

`tools/pages/level.html` draws a level file with the **shipped** loader, validator, terrain and
spawner. Nothing on the page re-implements any of them — it fetches the JSON `genlevels.mjs` writes
and puts a camera in front of it, which is `crates.html`'s rule one system over and the only
arrangement in which what you are looking at is what the gates measured.

- **Landscape is the default** (D123) and the profile comes from `viewport.js`'s own `modeFor`, so
  the page cannot keep a second copy of the 1.05 threshold — exactly the defect D131 caught in
  `sky.html`.
- It draws the six bands (tinted by the level's own `bandMods`), the terrain silhouette sampled from
  `js/sim/terrain.js`, D126's signature altitudes, every beat on the level's x axis, **what the
  spawner actually produced and where**, the player start and the camera head.
- **ART §4's landmarks are the placement hook**: the level carries `{ x, kind }` and **nothing else**
  — the Y comes from `terrain.yAt(x)`, because a landmark stands *on* the silhouette and a second
  copy of the ground height in the level file would drift from it the first time a profile changed.
  P16 authors the rig; this places it.
- `?level=a1-12 ?x=12000 ?rate= ?pause=1 ?w= ?h=`.

Where the four went, and the one that reads oddly:

```
a1-01  bridge  @ 7,744 wu   the 12,512 wu gap after its single wave — most of the level
a1-04  bridge  @   744 wu   the 1,488 wu run-up BEFORE the first gate, and it is the widest gap
a1-12  bridge  @22,973 wu   the 4,454 wu tail after the last crate
a2-05  chateau @ 5,878 wu   the 8,779 wu gap between the opening wave and the cloud bank
```

**a1-04's sits 144 wu ahead of the player start**, because on a race the run-up genuinely is the
emptiest stretch — the gate course fills everything after it. That is the rule working rather than
failing, and it is left alone rather than special-cased.

**`landmarks` is deliberately NOT the same list as `signatures`.** They were nearly merged and the
merge is wrong: a signature is an *altitude* cue near a band boundary (D126), indexed by band; a
landmark is a *place on the ground*, indexed by x.

### `tools/levelpage.mjs` — 7/7, and it earned its keep on the first run

| | | |
|---|---|---|
| **L1** | every shipped level loads, validates clean, fires **all** of its beats through the shipped spawner and raises no page error | 4 levels in 844x390, 2 in 390x844 — **portrait stays first-class** |
| **L2** | a malformed level is refused **LOUDLY** | 6/6 fault classes named, **1,239 chars painted in the overlay**, 6 console errors, 0 page errors |

L2 is the validator's own contract — *"in the console **and in the debug overlay**, never silently"* —
and **the overlay half had never been checked by anything.** A contract nobody tests is a comment.

**And it immediately caught the loader's silent repair.** L2's fixture authors an out-of-order beat;
the page reported only 4 of the 6 faults, because `createLevel` had already sorted them. Fixed in
`js/data/level.js` (`beatOrderFault`) and `js/data/validate.js`; the control
*"L2 sees the fault the LOADER repairs"* exists so it cannot come back.

**Two of the six controls were STILL GREEN on the first run**, both for the same reason: they
appended a **second** `?w=` / `?x=` to a query string that already had one, and `qp` reads the first.
`load()` now takes `urlW`/`urlH`/`park` so a control can genuinely load the page into a frame other
than the one it asserts — and the frame assert then fires by name
(*"level.html measured 390x844 but was asked for 844x390"*).


---

## 11b — the portrait gate's P7 row is MEASURED for the first time. Print only.

P7 — *"distinct ground targets visible ahead while strafing at `y ∈ [-260, -800]` (Mud/lower Belt) at
cruise, target spacing 140 wu"*, PASS ≥ 3, FAIL < 2 — has read **"terrain and ground targets are P9
and do not exist yet"** since P8. Terrain exists now, so it is measurable, and it turns out to have
**two independent limits that answer differently**:

| | limit | |
|---|---|---|
| the **relief** | `visibleGroundTargets()` in `js/sim/terrain.js` — a sampled horizon ray against the same silhouette the renderer draws (W5's rule, one system over) | |
| the **reach** | how many 140 wu targets fit ahead of the camera at all — `reach()` in `gates_portrait.mjs`, which is the number D121's whole pivot turned on | |

```
landscape   8 of 8 targets inside 1,200 wu of forward reach   PASS
portrait    2 of 2 targets inside   404 wu of forward reach   NEITHER
```

**Portrait is REACH-bound, not occlusion-bound, and it misses by 16 wu.** The trench line hides none
of them; three targets simply need `3 × 140 = 420 wu` and portrait's frame reaches **404**. That is a
**4% shortfall** and it is the same cause as D121's P2 — *"the frame reaches 404 wu ahead against a
440 wu gun range"* — which is why it is worth recording rather than filing as another portrait red:
**two independent §4.4.2 criteria now fail portrait on the same single number.**

**Print only.** `results` and `shots/portrait/gate.json` are untouched, because the gate's verdict is
the manager's (D117); this is REQUEST-4's shape and the change is one `add()` per row.

### WT4 gates the half P9 owns, and the control shows it can read zero

`worldgate` **27/28 → 28/29**. WT4 asks whether the relief eats the ground-attack band on the terrain
an act-1 level actually ships:

```
plain      @260/530/800 wu   6/6, 6/6, 6/6
trenchline @260/530/800 wu   6/6, 6/6, 6/6      (888 wu of reach — the conservative, MEASURED one)
```

**And it can fail.** Act 3's `pass_narrow` reads **0 of 6 at 260 wu**, 6/6 at 530 and 6/6 at 800: at
the **bottom** of §4.4.2's own strafing window the relief hides every target. That is not a bug, it is
a tension between two shipped numbers and it belongs on the record:

```
MAX_TERRAIN_WU   700 wu     terrain may legally rise to Mud's full thickness (D27's rule: it must
                            not reach Belt)
P7's window      260-800 wu the strafing band §4.4.2 names
```

**A legal terrain can put the whole of the ground-attack band inside the hill.** No constant moved.

One inconsistency, declared rather than smoothed: the spawner's `FRAME_REACH_WU` is **888 wu** —
D121's *measured* in-flight reach — while `gates_portrait`'s `reach()` computes **1,200 wu**
geometrically at the clamp floor. WT4 uses the smaller, so its 6/6 is the conservative reading.


---

## 11 — `--p5gates` after §9 and §10. RUN, and NOTHING MOVED.

It is the least likely suite to have moved — nothing under `js/sim/{ai,weapons,damage,entities}.js`
was touched, and the two constants that did move in `js/sim/` are bit-identical — but an unrun suite
is not a passing suite, and this one takes 30 minutes, so it was started first and left running.

```
  PASS  C1   purity across the sim graph                   10 files clean
  FAIL  C2   time-to-kill                                  scout 0.87 s (13/14); player 9.78 s
  PASS  C3   player lethality ratio                        11.3x
  FAIL  C4   intended tier wins 55-70%                     A1:92% A3:76% ... S3:18%
  FAIL  C5   sidegrades 45-65%                             51 airframe x ace cells
  FAIL  C6   counter-play >= 18 points                     A1:2.5 A3:-57.9 ... S2:3.5
  FAIL  C7   the mirror ace at k 0.90                      46.0% of 774 decisive (+-1.8)
  PASS  C8   flee rate 12-22%                              14.7% (22/150)
  PASS  C9   zoom neutrality of duel summaries             byte-identical
  PASS  C10  no entity allocation after warm-up            warm 536, then +0 over 200 duels
  5/10 pass
```

**Every figure is identical to §8's reading**, to the decimal and to the sample count — C2's
`scout 0.87 s (13/14)`, C7's `46.0% of 774 (±1.8)`, C8's `14.7% (22/150)` and C10's `warm 536`. C4,
C5 and C6 are D89's deliberately-stale rows and belong to P11; C7 is closed by D140 as a provenance
question about D87, with the seat-swap arm to run first.

**C10 is P5's own version of W8** — no entity allocation after warm-up — and it is still green, which
is the independent corroboration that neither the spawner nor `--levelrun` changed the pool
discipline they inherited.



---

## REQUESTs to the manager

**REQUEST-17** — **the brief's own question: does DESIGN §8's table map onto §7.1's format?**
Mostly, and here are the five places it does not. Two are fields **§7.1 lacks**, two are columns
**§8's table lacks**, and one is a vocabulary that cannot express what the table says. The manager
owns `ARCHITECTURE.md`, so none of them is applied.

| | |
|---|---|
| **`obj`** — the objective archetype (`PAT` / `CRT` / `ZEP` / `RCE` / …) | §7.1 has an `objectives` **array** but no field saying which of §8.3's seventeen archetypes the level *is*. §8.1's anti-sameness rule — *"no archetype repeats within 4 levels, and no (archetype, modifier) pair ever repeats"* — is a **script-checkable** rule (§10.6) and nothing can check it without the archetype on the level. Today the generator derives the objectives from it and then throws it away |
| **`t(s)`** — the level's duration budget | §7.1 has no duration field, so `t` had to be spent twice: once deriving `length` and once as the `quick` star's bar. That double duty is exactly what REQUEST-16 is about |
| **the sky code** `o` / `s` / `h` | `weather.timeOfDay` is dawn/day/dusk/night — an **hour**. Overcast, storm and high sun are **weather**, and there is nowhere for them. The generator puts act 2's deck in `bands.deck.coverage` and resolves the letter to `day`, which loses the distinction between `o` and `s` entirely. Acts 4 and 5 need this before P11 |
| **`A#`** — the ace | §7.2 puts one `ace` on the **act**; §8's table names an ace **per level** (A1 at 20, A2 at 30, A3 at 37 *and* 40). A per-level `ace` field, or duels become indistinguishable |
| the level **`name`**, and a third-star column | going the other way: §8's table has neither, and §7.1's format needs a name. `tools/genlevels.mjs` carries both as declared additions to the table — the four names are mine and P12's to replace, and only `a1-04` needed a `star` column because it is the one worked level with neither enemies nor crates to derive one from |

**REQUEST-16** — **`length = t(s) x cruise` spends the whole of DESIGN's duration column on the
traverse, so the `quick` star is missed on every level that makes you deviate.** Measured, seed 5:
a1-01 **97.1 s against a 50 s bar** (its two Kestrels cost 45.3 s, 91% of the budget) — and **51.8 s
even with `--break no-beats`, so it misses by 1.8 s with the level empty**; a1-04, which has no
enemies at all, takes 48.4 s against 45 because its own gate course climbs; a1-12 98.1 against 90.
a2-05 is the only pass, 99.8 against 110, by exceeding cruise on the straights — so the bar is not
structurally impossible, it is simply not a traverse time.

The honest derivation is `length = (t - fight) x cruise`, and `fight` is a **balance** quantity that
belongs to P11's difficulty curve. **I did not invent a multiplier to make three stars go green**, and
I did not move `t`. Either §8's `t(s)` column means "time to fly the level" (and the fighting needs
its own column) or the level's length needs the fight subtracted; the manager owns which.

**REQUEST-15** — **DESIGN §8.2's act 1 cannot be the three-band slice it declares, and it is
arithmetic.** §8.2 gives act 1 a **600 m ceiling** and the theatre *"low (Mud/Belt/Floor only)"*.
BUILD_PLAN §6 ruling R-02's canonical edges are Mud 0–105 m, Belt 105–255, Floor 255–450, **Deck
450–750**. So a 600 m ceiling puts **150 m — a quarter of the act's legal column — inside Deck**.

This is what makes **W4 red on `a1-01`** (4 occupied bands against D31's 2–3), and the level is not
the cause: `--break no-beats` strips its beats and the empty corridor still leaves the player in
**floor and deck**, because the shipped AI cruises above Floor's 450 m top. Either act 1's ceiling is
450 m or act 1 is a four-band act. **I moved no constant, changed no band edge, and did not re-word
W4.** It matters before P11 writes levels 2–20.

Related and smaller, same shape: **§8.2 puts act 2's cloud deck at 420–560 m and R-02's Deck band is
450–750 m.** The generator uses R-02 (the shipped table wins), so act 2's home band centre is 600 m
while §8.2's deck tops out at 560.

**REQUEST-14** — **§7.1's example has a FOURTH defect D146 did not list, and the corrected document
is below because `ARCHITECTURE.md` is the manager's file and I may not edit it.** D146 names three
(Mud at 333 wu, wind read as SI, the four absent enemies). The fourth is
**`"player": { "airframe": "kitehawk-i" }`** — not one of the five ids `js/data/tables.js` builds —
and `playerType()` does `AIRFRAME_BY_ID[id] || REFERENCE`, so it flew the reference aeroplane under
the wrong name **silently**. `validate.js` now refuses it by name (W1g).

The corrected example, which `worldgate`'s W1d measures and which validates clean:

```
bands           the object form is read as per-band DECORATION (flak, haze, coverage, drift)
                merged onto R-02's shipped geometry; an ARRAY is read as geometry and judged by
                checkBands. §7.1's mud 0..-333 fails §3.3 constraint 1 either way.
weather.wind    -40 wu/s (x M_PER_WU = -6.0 m/s), or DESIGN §8.10's own [[altM, m/s]] array,
                which is what the four shipped levels use because it has no unit ambiguity at all
concordLine     omit it — js/core/bands.js's CONCORD_LINE_WU is -26,666.7 and -26667 is a
                rounded copy
player.airframe "kite_b1"
beats           "scout" -> "kestrel", "hunter" -> "shrike", "aaNest" -> "drover", "balloon" -> "ox"
                (the last two are substitutions, not mappings: there is no ground gun and no
                balloon entity — D146)
crate y         -10000, not -9600: js/sim/crates.js opens the canopy as the crate enters
                reachable sky at 1,500 m, which IS the playable ceiling
```

**REQUEST-13** — **`a2-25` is not a legal level id and the fourth worked level ships as `a2-05`.**
BUILD_PLAN §P9 and the P9c brief both name it `a2-25`, but an act is `LEVELS_TOTAL / ACTS = 20`
levels (derived, asserted at load) and `parseLevelId` is strict, so index 25 does not exist.
**Level 25 of the 100 is act 2, index 5**, which is exactly the level BUILD_PLAN describes — DESIGN
§8.5's `25 | ZEP | 1Z (damaged, 500 m), 2k | o w5 | 3 | 110`, the zeppelin teach with a cloud deck.
Shipped as `a2-05`. If the intended spelling is a *global* index, `levelOrdinal()` already provides
one and the file naming should say which it is before P11 writes 96 more.

**REQUEST-1** — `input.stick.ox/oy` doubles as the drawn ring centre, so between a rotation and the
pilot's first thumb movement the ring is drawn at a stale css position, possibly off-canvas. The
control is correct throughout (0a); only the drawing is stale. Fixing it means inventing a thumb
position, which 0a deliberately refuses to do. Suggest routing it to P16 as a HUD item: draw the
ring at the stick zone's centre while `stick.active && stale`, or simply hide it for that interval.

**REQUEST-2** — `tools/pages/{boot,crates}.html` also carry `worldH: 1000`, but they pin
`w: 390, h: 844` too, so their frame is self-consistent and no gate drives them landscape. They are
**not** instances of the D131 defect and were left alone. If any later phase drives them at another
size, they need `modeFor` the same way.


---

## Not got to — the honest remainder of P9

Named so the next agent does not have to rediscover the shape.

- **The portrait gate's P7 row (ground-attack legibility) is still unwired.** `js/sim/terrain.js`
  exists so it is now measurable, but `tools/gates_portrait.mjs` still prints NOT MEASURABLE and its
  `results` and `shots/portrait/gate.json` are the gate's verdict, which is the manager's (D117).
  This is REQUEST-4's shape and the call is one `add()` per row.
- **`P.setTerrainQuery(terrain.query)` is not registered.** `js/sim/` may not import `js/gfx/`
  (corecheck), so the wiring happens at the app level, which is P10's `js/main.js`. The socket is
  `js/gfx/particles.js:54` and the function that fits it is `terrain.query(xM)` — SI metres, like the
  rest of `js/sim/`, so the conversion happens once in the adapter.
- **W2 (`gates_zoom_neutral`) has not been re-run on the worked levels.** It is already delegated and
  green — `sim.mjs` F14 and the crate gate K10 both assert byte-identical summaries at forced zoom
  0.78 and 1.22, with `weapons.js --break zoom-range` as the tripwire that proves it can fail. It
  needs no new instrument; `--levelrun` should grow a `--zoom` arm and be run at both ends.
- **The 96 other levels are P11's**, and four things should be settled first: REQUESTs 13–16.

## Final regression — everything, after §4 through §10

| suite | result |
|---|---|
| `sim.mjs --fixtures` | **9/9, blessed hashes unchanged** |
| `sim.mjs --p6fixtures` | **14/14** |
| `sim.mjs --gates` | **14/14** |
| `sim.mjs --p6gates` | **9/10** — K5 PASS, K6 red and deliberately untouched |
| `sim.mjs --p5gates` | **5/10, run to completion, identical to §8 to the decimal — §11** |
| `worldgate.mjs` | **28/29** — was 22/22 at the start of §9. The one red is **W4 on a1-01** (REQUEST-15), not tuned |
| `worldgate.mjs --falsify` | **33/33 controls RED**, exit 0 |
| `levelpage.mjs` | **7/7**, four levels landscape + two portrait |
| `levelpage.mjs --falsify` | **6/6 controls RED** |
| `ladder.mjs` (+`--falsify`) | unchanged (P4a only, D135), 5/5 controls RED |
| `corecheck.mjs` | clean — the pure tier still imports nothing host-side |
| `statecheck.mjs` · `hudcheck.mjs` · `p3guard.mjs` | PASS · 23/23 · GREEN, all four asserts |
| `skygate.mjs` portrait | **3/3**; `--falsify` 3/3 controls RED |
| `skygate.mjs --w 844 --h 390` | **3/3**; `--falsify` 3/3 controls RED |
| `orient.mjs` (+`--falsify`) | **PASS**, 20 rotations; every control RED |
| `touch.mjs` (+`--falsify`) | **PASS**, no page errors; every control RED |
| `genlevels.mjs --check` | **6/6 artefacts byte-identical from the table** |

**Portrait regression: nothing moved, in any suite.** `skygate` portrait, `orient`, `touch`,
`hudcheck` and `p3guard` are byte-identical to §8's table, and `levelpage` runs the levels in both
orientations. Expected — §9 and §10 touch `js/data/`, `tools/`, one additive constant in
`js/core/bands.js` and two bit-identical constant references in `js/sim/`.

| `gates_portrait.mjs --runs 8` | **byte-identical** — portrait P0 0.1415, P3 43.4 px, in-frame median 0.02 s; landscape P0 0.0737, P3 34.0 px, in-frame median 1.32 s. P7 is a new PRINTED row and nothing in `results` moved |

**Every suite in this table has been RUN since the last edit to the files it covers.** D143's rule.

> **`worldgate` exits 1, and that is correct, not broken.** W4 is red on `a1-01` and the tool exits
> non-zero whenever any criterion is. `--falsify` also exits 1 for the same reason even though its
> own line reads *"every criterion is genuinely under test"* — read the criterion table, not the exit
> code, until REQUEST-15 is settled. `ladder.mjs` has the same shape already (P4a, D135) and exits 0
> because D135 struck that criterion; **nobody has struck W4, so it stays red.**

### One boundary crossed on purpose, and it is declared

The P9 brief says *"you must not touch flight, combat or crate constants."* §4's first fix is in
**`js/sim/crates.js`**, which is P6's file. **No constant moved**: `advanceLadder` applied its damage
rung over `world.live` and now applies it over `world.aircraft` filtered on `alive`. Mid-tick the two
lists are identical by construction, `--fixtures` passes at **unchanged blessed hashes**, and the
pre-fix behaviour is preserved as `--break preload-live`. It is a fix to which list a loop iterates,
in the only place where the two lists differ — before the first tick — which is the state P9's own
level format creates and P6 could not have had.

The second fix is in `tools/sim.mjs`'s `crateWorld`, which is harness, not shipped.

### Files this run touched

| file | what |
|---|---|
| `js/sim/crates.js` | the ladder's damage rung rolls `world.aircraft`, not `world.live`; `--break preload-live` |
| `js/sim/spawner.js` | **new** — beats on camera X, one forward cursor, seeded, pooled |
| `js/sim/terrain.js` | **new** — the silhouette, the slope bound, the particle query |
| `js/data/level.js` | **new** — the §7.1 loader, serializer, 6 KB cap |
| `js/data/act.js` | **new** — the §7.2 format, `validateAct`, `levelOrdinal` |
| `js/data/validate.js` | beat ordering/roster/band/terrain/version rules; W1 now 8/8 |
| `tools/sim.mjs` | `K5_RUNS` (which was **undefined and crashed `--p6gates`**), the K5 re-spec's report and detail line, `--ladder` table, `--spawner` rig, `ladderPreload` fixture, `rein-stacked` and `preload-live` breaks, staggered reinforcement spawns |
| `tools/worldgate.mjs` | 13 new criteria and 15 new controls |
| `js/core/bands.js` | **`CRUISE_MS` / `CRUISE_WU_S`** (D126), beside `BEST_CLIMB_WU_S`; `MAX_SLOPE` is now their ratio and is bit-identical |
| `js/data/level.js` | **the enemy codebook (D146)**; terrain profiles resolve by NAME; the airframe default is a real airframe; `beatOrderFault`; ART §4's `landmarks` |
| `js/data/validate.js` | `player.airframe` against `AIRFRAMES` (W1g); `landmarks`; the beat-order fault read off the LOADED level |
| `js/sim/terrain.js`, `js/sim/spawner.js` | the two cruise literals import `js/core/bands.js` |
| `tools/genlevels.mjs` | **new** — DESIGN §8.4/§8.5 transcribed, every geometric number derived, `--write` / `--check` / `--json` |
| `tools/pages/level.html` | **new** — a level drawn with the shipped loader, validator, terrain and spawner; landscape default; the landmark placement hook |
| `tools/levelpage.mjs` | **new** — L1/L2 in a real browser, both orientations, 6 controls |
| `tools/sim.mjs` | `--levelrun` (a level FLOWN, §8.1's run summary), `levelHash`, `keepInsideLevel`, and `P9_BREAKS` — which the three switches needed because reading `--break` directly meant they never ran |
| `tools/worldgate.mjs` | 6 new criteria (WC, W1g, W6, W7b, W3, W4) and 7 new controls |
| `data/levels/*.json`, `data/acts/*.json` | **new** — the four worked levels and two acts, generated |
| `docs/P9_NOTES.md` | this file |
