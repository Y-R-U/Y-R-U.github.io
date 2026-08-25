# P8a — the portrait gate's INSTRUMENT

**This file is a resumable handoff, not a report.** It is written from the first working step and
updated continuously, because the agent writing it expects to be cut off. At any moment it should
say what is done, what the numbers are, what was in flight and what the next concrete action is.

**The agent that wrote this does NOT decide portrait.** Per D117 it builds the instrument and
reports raw numbers; the verdict is the manager's, and the pivot is Aaron's.

---

## STATUS — updated 2026-08-25

| | |
|---|---|
| phase | **Deliverables 1–4 complete. 5 (this file) current.** |
| in flight when last updated | nothing — a clean stopping point |
| next concrete action | **P4 / P4b**, the largest remaining gap: a scripted 0 → 10,000 wu climb through `js/core/bands.js` plus the establishing crane, browser-side for the ramp/haze crossfade. See "Not done" at the foot of this file. |
| tools written | `tools/p8engage.mjs`, `tools/p8stability.mjs`, `tools/gates_portrait.mjs` |
| gate record | `shots/portrait/gate.json` (64 duels, 252 engagements) |
| **headline** | portrait **P0 FAIL / P2 FAIL / P3c FAIL / P6 NEITHER**; landscape **P0 NEITHER–PASS / P2 FAIL / P3c FAIL / P6 NEITHER**. **Read REPORT-1 and REPORT-2 before treating P0's number as a verdict.** |
| **7 REQUESTs** | at the foot of this file — REQUEST-1 (the engagement bound) is the one the orientation currently turns on |

### Read and understood
- `MANAGER_STATE.md` resume section; `DECISIONS.md` D2, D18, D26–D30, D47, D48, D61, D62, D75, D81,
  D94, D99, D105, D109, D113–D117.
- `ARCHITECTURE.md` §4.1 (the profile table), §4.2, §4.3 (the zoom solver), §4.4 (the gate).
- `BUILD_PLAN.md` §P8 only.
- `tools/p8probe.mjs`, `tools/p8duelbox.mjs`, `tools/camtrace.mjs`, `js/core/camera.js`,
  `js/core/viewprofile.js`, `js/modes/duel.js`, `js/sim/entities.js` (`framingContributions`).

### The three constants everything is indexed on (§4.4.1, ratios — D26 did not move them)
- **503 wu (75.5 m)** — widest fight the auto clamp `[0.78, 1.22]` can frame.
- **585 wu (87.8 m)** — widest fight portrait can frame at all. Above it, **PIVOT SIGNAL**.
- portrait at 390x844: `worldH 1000`, `scale 0.844 px/wu`, **`worldW 462.09 wu`**, `zoomFill 0.85`.

---

## LOG

### 1 — DELIVERABLE 1 DONE: `tools/p8engage.mjs`, an engagement fixture that is demonstrably a fight

**The definition, stated once.** An **ENGAGEMENT** is a maximal run of ticks inside ONE duel round
in which (a) the player is alive and ≥ 1 hostile is alive, and (b) the nearest hostile is within
**`zoomLockRange` = 1400 wu (210 m)**; excursions past (b) shorter than **1.0 s** do not split the
run; the run survives only if it lasts **≥ 2.0 s**.

`zoomLockRange` was chosen because it invents no new number. It is the radius
`framingContributions()` admits hostiles from, the radius the zoom lock arms at, and the radius
§4.4.2 **P2** already starts its warning clock at. An engagement is therefore exactly *"the camera
is being asked to frame a fight"* — the only interval a camera criterion has an opinion about.
`--sep` sweeps it; see the sensitivity table below, which is the most decision-relevant thing here.

**The definition validated, not asserted.** Over 64 duels / 16 aces / 487,934 ticks:

| | |
|---|---|
| **engagements** | **252** — P0's "over 200 seeded engagements" is reachable at 64 duels |
| engaged ticks | 198,138 = **40.6%** of all ticks |
| engagement duration | p10 4.40 s · p50 **9.42 s** · p90 26.05 s · max 48.90 s |
| engaged seconds per duel | 51.6 s of ~127 s |
| **player shots fired inside an engagement** | **2,360 / 2,360 = 100.0%** |

**100% of the shooting happens inside 40.6% of the ticks.** That is the evidence that the window
is the fight and the rest is transit, and it is the check the wall-clock fixture could never pass.
It holds down to `--sep 600`, where the window is 22.5% of ticks and still holds **99.7%** of shots.

**How D115's numbers move when the sample is restricted to engagements** (64 duels, `--sep 1400`):

| | ALL ticks (D115's fixture) | ENGAGED ticks |
|---|---|---|
| nearest hostile inside the frame | 12.7% | **31.3%** |
| framing box holds a hostile | 12.0% | **29.5%** |
| nearest hostile p50 | 2,286 wu | **495 wu** |
| delivered zoom p50 | 1.20 (`zoomIntimate`) | **1.04** |
| **p90 framing-box width** | **366 wu** | **942 wu** |

**Falsification of my own harness, run and recorded.** The first version reported engaged shots as
**281.9% of total shots**. `player.shotsFired` belongs to the entity and each round seats a new
player, so the raw delta goes negative at every round boundary. Caught only because a percentage
came out over 100. Fixed by clamping the delta; the 100.0% above is post-fix.

**Positive control (`--arena 150`), the manager's own control arm, reproduced:** engaged fraction
39.8% → **~76%**, boxed ticks 12.0% → 33.6%, p90 box width over ALL ticks 364 → **1,094.6 wu**
(the manager measured 1,095). The instrument moves when the world moves.

#### ⚠ REPORT-1 — the p90 box width is dominated by the ENGAGEMENT BOUND, and the verdict flips inside it

This is the thing the manager most needs before reading any P0 number. `--sep` swept, 16 duels:

| `--sep` (wu) | engaged % of ticks | shots captured | **p90 box W** | contain z ≤ | §4.4.1 verdict |
|---|---|---|---|---|---|
| 600 (≈ 1.4× gun range) | 22.5% | 99.7% | **490.8** | 0.800 | **inside the auto clamp** |
| 880 (2× gun range) | 30.8% | 100.0% | **618.3** | 0.635 | **PIVOT SIGNAL** |
| **1400 (`zoomLockRange`)** | 39.8% | 100.0% | **917.0** | 0.428 | **PIVOT SIGNAL** |
| 2000 | 46.6% | 100.0% | **820.7** | 0.479 | **PIVOT SIGNAL** |

The engagement bound caps the nearest hostile's separation, and the framing box is (player + lead)
∪ (admitted hostiles), so **`boxW_p90` is to first order a restatement of whichever bound is
chosen.** Every bound from 600 up captures ≥ 99.7% of the shooting, so "captures the fight" does
not discriminate between them. **A number that decides the game's orientation must not be that
sensitive to a definition the measurer picked.** I am not choosing which row is P0; that is a
manager call, and it is stated as REQUEST-1 below.

**Reproduce:**
```
node tools/p8engage.mjs --runs 64                  # 252 engagements, the table above
node tools/p8engage.mjs --runs 16 --arena 150      # positive control
node tools/p8engage.mjs --runs 16 --sep 600        # the bound sweep
```

#### ⚠ REPORT-2 — `zoomLockRange` (1400 wu) and §4.4.1's 585 wu pivot signal are numerically incompatible

Measured, not argued. Over 198,138 engaged ticks (64 duels):

| | |
|---|---|
| engaged ticks with **0** box members | 70.5% — box W p50 **247** wu, p90 **326** wu (player + lead only) |
| engaged ticks with **≥ 1** member | 29.5% — box W p50 **690** wu, p90 **1,406** wu |
| farthest admitted member's separation | p50 **611** wu, p90 **1,241** wu |
| **box W − farthest member** | p50 **79.9** wu, p90 **164.5** wu |

**`boxW` IS the separation of the farthest admitted hostile, plus ~80–165 wu of padding and lead.**
`buildBox()` takes the union AABB of player ∪ lead ∪ members, so it cannot be anything else.

The arithmetic that follows is the incoherence:

- §4.3.1 admits **any** hostile inside `zoomLockRange` **1400 wu (210 m)** that closes faster than
  120 wu/s or has line of fire. Gun range is **440 wu (66 m)** — the admission radius is **3.2× the
  radius at which the hostile can shoot at all**.
- §4.4.1 declares **boxW > 585 wu ⇒ no zoom satisfies both legibility and containment ⇒ PIVOT**.
- Subtracting the measured padding: **any tick on which one hostile is admitted past ~505 wu of
  separation is a pivot-signal tick by construction**, whatever portrait does.
- Measured: of engaged ticks that have a member, **64.9% exceed 503 wu and 58.2% exceed 585 wu**.
  As a fraction of all engaged ticks that is 19.2% and 17.2%, which is why the p90 lands where it
  does — the p90 sits inside the boxed 29.5%.

**Neither constant is being touched.** `zoomLockRange` is load-bearing for §4.4.2 **P2** (it is where
the warning clock starts) and 585 wu is derived from the legibility floor, not chosen. The two are
simply not consistent with each other, and P0 as written reports the inconsistency rather than
portrait's fitness. See REQUEST-1/REQUEST-2.

**This is not, however, an artefact that makes portrait look worse than it is.** The same
arithmetic run for landscape (`worldW` 1212 wu, legibility floor 0.814) gives a containment ceiling
of `0.85 × 1212 / 0.814` = **1,265 wu** — landscape frames a **2.16× wider** fight legibly than
portrait's 585 wu. A 1,400 wu box is outside both, but the margin is entirely different. §4.4.1's
"portrait's window closes on width" is measured and true; what is in dispute is only whether the
number that closes it should be indexed on `zoomLockRange`.

---

### 2 — DELIVERABLE 2: the stability family re-specified (`tools/p8stability.mjs`)

Measured on the **engagement fixture** (reversals counted only inside engagements), 16 duels,
14.5 engaged minutes per arm, portrait 390×844, controller live at `zoomBias: 'normal'`.

| arm | revZ/min | **UNEXPL/min** (D114) | pairViol | osc% | **PUMP%** | pumpAmp | travelZ/T |
|---|---|---|---|---|---|---|---|
| **SHIPPED** | 6.84 | **2.28** | 1 | 0.09 | **0.00** | 0.000 | 0.891 |
| `?slew=symmetric` | 11.68 | **0.55** | 0 | 4.74 | **0.19** | 0.092 | 1.253 |
| `?margin=strict` | 6.22 | 1.80 | 0 | 0.12 | 0.00 | 0.000 | 0.549 |
| `?track=sticky` | 6.84 | 2.28 | 1 | 0.09 | 0.00 | 0.000 | 0.891 |
| noclear + reassert | 6.84 | 2.28 | 1 | 0.09 | 0.00 | 0.000 | 0.891 |
| noclear + `?track=sticky` | 6.22 | **0.97** | 0 | 0.66 | 0.00 | 0.000 | **0.344** |

`osc%` / `PUMP%` are **fractions of 3 s windows scanned**, not bare counts — a count is not
comparable between traces of different length, which is how the earlier figures ("6 windows",
"55 windows") could not be put beside each other.

#### ⚠ REPORT-3 — D114's re-specification, implemented exactly as written, is still won by a break-switch

The explanation window is `zoomInDwell` = **0.90 s**, derived rather than invented: it is the
longest lag `VIEW_PROFILE` permits the controller before it may follow its target. Both traces are
filtered at `zoomDeadband` (0.02) before counting, on both sides — an unfiltered target reverses on
tick noise and would explain *every* delivered reversal, which would make the re-specification
vacuous in one line.

Implemented that way, **SHIPPED scores 2.28 unexplained reversals/min and goes green against the
≤ 6 bar. `?slew=symmetric` scores 0.55 and goes greener.** The break-switch stays green, so by D47
this is a defect in the criterion, not a pass. The mechanism is plain and was not guessed: symmetric
slew has no deadband, no dwell and no margin, so it *follows its target closely* — and a criterion
that rewards following the target rewards the arm that follows it fastest. D114 moved the defect
rather than removing it.

#### The re-specification that does discriminate, and is falsified

Keep D114's principle — *the controller may not be blamed for a reversal its target asked for* — but
apply it to **amplitude** instead of to the count:

> **P4c (re-specified).** Over 3 s sliding windows inside engagements, count a window as a **PUMP**
> when it contains ≥ 3 significant reversals in `cam.zoom`, the delivered zoom's peak-to-peak
> exceeds **0.05**, *and* the delivered peak-to-peak **exceeds `cam.zoomTarget`'s peak-to-peak over
> the same window**. **PASS = zero pump windows.**

One sentence: *the controller may not swing further than its target asked it to.*

| | SHIPPED | `?slew=symmetric` |
|---|---|---|
| PUMP windows | **0.00%** — exactly zero | **0.19%**, worst excess amplitude **0.092** |
| travel ratio Σ\|Δzoom\| / Σ\|Δtarget\| | **0.891** (filters) | **1.253** (amplifies) |

**Break-switch run and recorded: `?slew=symmetric` goes RED and SHIPPED goes GREEN at exactly 0.**
The literal §4.4 wording ("no oscillation of amplitude > 0.05 sustained > 3 s") **fails SHIPPED** at
0.09% of windows, because a real fight genuinely does demand a 0.4-amplitude zoom-out and zoom-in
when a hostile enters and leaves the box. The pump form passes it at zero, for the right reason.

**What the pump form does NOT catch, stated rather than hidden:** `?track=sticky` (0.00%). It is not
supposed to. A frozen camera does not pump — it under-moves (travel ratio 0.344 in the arm where it
is live). Freezing is a framing defect and §4.4.2's P4c family has no criterion for it; D61 already
recorded that only Z6 catches sticky.

#### ⚠ REPORT-4 — `?track=sticky` is INERT against every real driver of the camera. It is not a break-switch.

`?track=sticky` disables member expiry. But **every driver that resembles the game calls
`cam.clearTracked()` every tick and re-asserts** — `tools/pages/hud.html:234`,
`tools/hudcheck.mjs:387`, `tools/p8probe.mjs:91`, `tools/p8duelbox.mjs:62`, and my own
`tools/p8engage.mjs`. `clearTracked()` empties the member map unconditionally, so the expiry path
`?track=sticky` breaks is never reached. **The arm's numbers are bit-identical to SHIPPED across
every column above.**

Only `tools/camtrace.mjs` and `tools/pages/camera.html` drive the camera by re-assertion alone — and
those are where D61's "sticky scores the BEST Z1–Z3 numbers" came from. Proven by adding a
**driver-level** switch (`noClear`) that suppresses `clearTracked()`: with it, `?track=sticky`
finally moves (unexplained 2.28 → 0.97, travel ratio 0.891 → 0.344, osc% 0.09 → 0.66) while
`noclear` on its own stays bit-identical to SHIPPED, because `TRACK_GRACE = 1` expires an
un-re-asserted member in one tick anyway.

This is **not** a bug in `camera.js` — clear-and-re-assert is the stronger discipline and §6.6's
intent. It is a statement about what the control proves: **any gate arm using `?track=sticky` against
a `clearTracked()` driver is measuring nothing**, and P8 must not count it as a falsification.

**Reproduce:** `node tools/p8stability.mjs --runs 16`

---

### 3 — §4.4.1's arithmetic re-run against the SHIPPED numbers, and D62's open question settled

§4.4.1's table is built on assumed figures. P4's own gates (`node tools/sim.mjs --gates`, all green)
report different ones. **Nothing was tuned; these are the shipped model's measurements.**

| quantity | §4.4.1 assumes | **shipped, measured** | source |
|---|---|---|---|
| combat turn diameter at corner | 273 wu | **263 wu** | gate **F6** (PASS, bar ≤ 286) |
| **Vne dive-recovery vertical extent** | **1,053 wu** | **585 wu** | gate **F7** (PASS, bar ≤ 1,111) |
| minimum enemy hull | 60 wu | **64 wu** — every one of the 8 enemy types is `hullWu: 64` | `entities.js` |
| portrait scale | 0.844 px/wu | 0.844 px/wu | 844/1000 ✓ |

Note a coincidence that must not be allowed to become a confusion: **the measured dive recovery is
585 wu and §4.4.1's pivot signal is also 585 wu.** They are unrelated — one is an altitude loss, the
other `0.85 × 462.09 / 0.671`.

#### The re-run window, portrait

- legibility floor at the shipped **64 wu** hull: `34 / (64 × 0.844)` = **0.6295** (§4.4.1's 0.671 is
  the 60 wu figure)
- dive-recovery containment at 585 wu: `0.90 × 1000 / 585` = **1.5385**, or at `zoomFill` 0.85,
  `0.85 × 1000 / 585` = **1.4530**. **Either way it is above `zoomIntimate` 1.22 — it never binds.**

**§4.4.1's headline sentence "the window's upper bound is now set by the dive recovery (0.855), not
by the framing box" is FALSE against the shipped flight model.** At 585 wu the dive recovery is not
in the running; the framing box is the only thing that can close portrait's window, and REPORT-2
says what closes it.

#### ⚠ REQUEST-3 / D62 SETTLED — P1b is derived at `zoomFill` 0.85, and at the shipped extent it does not matter

D62 left open whether P1b is at 90% fill or at `zoomFill 0.85`. Three things to record:

1. **§4.4.2's P0 formula is internally inconsistent with itself.** It reads
   `zoomContain = min(0.85 × 462 / boxW_p90, 0.90 × 1000 / recoveryH_p90)` — **0.85 on the width term
   and 0.90 on the height term, in one expression.** The shipped solver uses one number on both:
   `needW = boxW / zoomFill; needH = boxH / zoomFill`, `zoomFill = 0.85`.
2. **Recommendation (manager to ratify): use `zoomFill` = 0.85 on both axes**, because P0 and P1b are
   about *the zoom the controller may legally choose*, and a fill the solver never uses describes a
   framing no controller ever asks for. `tools/gates_portrait.mjs` reports **both** so the choice is
   visible rather than baked in.
3. **At the shipped 585 wu recovery the choice changes no verdict** — 1.5385 vs 1.4530, both above
   `zoomIntimate`. It would have been decisive at the assumed 1,053 wu: 0.8547 (PASS, window 0.075
   wide, clears P0's ≥ 0.06) vs 0.8072 (**window 0.027 wide, under P0's 0.03 FAIL threshold**). D62
   was a live risk under the old number and is inert under the measured one.

#### ⚠ REPORT-5 — the landscape half of §4.4.1's comparison also does not survive the measured number

§4.4.1 argues portrait is the only option partly because *"landscape phone's window is empty for that
manoeuvre"*. Re-run at 585 wu, landscape 844×390 (`worldH` 560, scale 0.6964 px/wu, `worldW` 1212):

| | at 1,053 wu (assumed) | **at 585 wu (measured)** |
|---|---|---|
| landscape legibility floor (64 wu hull) | 0.7629 | **0.7629** |
| landscape dive-recovery ceiling @0.90 | `0.90×560/1053` = 0.4786 | `0.90×560/585` = **0.8615** |
| landscape dive-recovery ceiling @0.85 | 0.4522 | `0.85×560/585` = **0.8137** |
| **landscape window** | **EMPTY** | **[0.7629, 0.8137] — open**, and ∩ clamp = **[0.78, 0.8137]** |

**P1b is the criterion §4.4.1 says landscape fails, and against the shipped flight model landscape
does not fail it.** The comparison the gate exists to make therefore has to be made on the framing
box, not on the dive recovery. Portrait's advantage on this criterion has evaporated; portrait's
disadvantage on width (REPORT-2: 585 wu vs landscape's 1,265 wu ceiling) has not.

**I am not drawing the conclusion.** These are the numbers; the verdict is the manager's (D117).

---

### 4 — DELIVERABLE 3: `tools/gates_portrait.mjs` — the gate, portrait AND landscape

```
node tools/gates_portrait.mjs                          # 32 duels, the table
node tools/gates_portrait.mjs --runs 64                # 252 engagements — P0's sample size
node tools/gates_portrait.mjs --falsify --runs 8       # every break-switch and what it caught
node tools/gates_portrait.mjs --runs 64 --json shots/portrait/gate.json
```

Node-side throughout; `camera.js`, `viewprofile.js`, `entities.js`, `duel.js` and `ai.js` are
imported and driven, never re-implemented. F6 (turn) and F7 (dive recovery) are **read from
`tools/sim.mjs --gates`**, the blessed flight measurement, rather than re-derived — re-deriving them
in the gate would test the gate's own arithmetic, which is P1's R2/R3 lesson.

**64 seeded duels · 16 aces · 487,934 ticks · 252 engagements · 198,138 engaged ticks (40.6%).**
Controller live and unmodified at `zoomBias: 'normal'`. Gate record in `shots/portrait/gate.json`.

| # | portrait 390×844 | value | landscape 844×390 | value |
|---|---|---|---|---|
| **P0** @`zoomFill` 0.85 | **FAIL** | legible ≥ 0.6294, contain ≤ **0.4170**, overlap **−0.2124** | **NEITHER** | overlap +0.0509, in-clamp width **0.0337** (PASS needs 0.06, FAIL under 0.03) |
| **P0** @90% fill | **FAIL** | identical — the width term binds, not the height | **PASS** | in-clamp width **0.0815** |
| **P1** | **NEITHER** | 263 wu; PASS needs ≤ 235 at `zoomIntimate`, FAIL needs "does not fit" (visible 378.8) | **NEITHER** | same 263 wu; visible 993.4 |
| **P1b** both fills | **PASS** | 585 wu → z ≤ 1.4530 / 1.5385 — **never binds** | **PASS** | z ≤ 0.8137 / 0.8615 — binds, but clears `zoomWide` |
| **P2** | **FAIL** | total median 1.75 s ✓ · **in-frame median 0.03 s** (bar 0.90) · p05 **0.00 s** | **FAIL** | total 1.75 s ✓ · **in-frame median 1.28 s ✓** · p05 **0.00 s** ✗ |
| **P3** | **PASS** | **42.1 px** at `zoomWide` (bar 34) · 64.8 px at delivered p90 · **54.0 px** at `zoomCombat` (bar 44) | **PASS** | **34.8 px** (bar 34 — **2.4% margin**) · 53.5 · **44.6 px** (bar 44 — **1.4% margin**) |
| **P3b** | PASS but **VACUOUS** | 0.00% at zoom ≥ 1.25 — see REPORT-6 | PASS but VACUOUS | 0.00% |
| **P3c** | **FAIL** | **0 / 252** engagements | **FAIL** | **3 / 252** = 1.2% |
| **P4c** (re-specified) | **PASS** | 5.83 raw rev/min · **2.13 unexplained/min** · **0.00% PUMP windows** · travel 0.948 | **PASS** | 5.65 · 2.91 · 0.00% · travel 1.059 |
| **P6** | **NEITHER** | **12.5%** of 801 damage events (PASS ≤ 12%, FAIL > 25%) | **NEITHER** | **14.9%** of 801 |
| **P9** | **PASS** | delegated to `sim.mjs` F14, byte-identical | **PASS** | same |

**The framing box is identical in both orientations (p90 941.9 wu)** and must be: it is a world-space
quantity and `zoomLockRange` is 1400 in both profiles. Every difference in the table above comes from
`worldW`/`worldH`/`scale` alone, which is exactly the comparison §4.4 exists to make.

#### The horizontal-reach arithmetic, printed by the gate

Maximum world distance from the player to the frame edge, against the **440 wu** gun range:

| zoom | portrait visible W | ahead | behind | | landscape visible W | ahead | behind |
|---|---|---|---|---|---|---|---|
| 0.78 (`zoomWide`) | 592 | **404** | 289 | | 1554 | **1139** | 648 |
| 1.00 (`zoomCombat`) | 462 | **315** | 225 | | 1212 | **888** | 505 |
| 1.22 (`zoomIntimate`) | 379 | **259** | 185 | | 993 | **728** | 414 |

#### ⚠ REPORT-6 — three criteria are defective as written, independent of any measurement

1. **P3b cannot fail.** It measures "fraction of duel time spent at `zoom ≥ 1.25`" and FAILs above
   35%. `zoomIntimate` is **1.22** and §4.3.3 says the clamp is absolute — *"no preference may push
   the auto zoom below `zoomWide`"*, and the ceiling is enforced identically in `camera.js`
   (`cam.zoom = clamp(framed - punch, lo, P.zoomIntimate)`). **Zoom ≥ 1.25 is unreachable, so P3b
   reads 0.00% on every arm including every break-switch.** It is a REQ-B4 criterion written to stop
   P3 being passed by pinning the camera tight, and it cannot detect that. The threshold it needs is
   `zoomIntimate` itself, or `zoomCombat × 1.05` (the zoom-lock cap the controller actually uses).
2. **P1 has a gap between its bars.** PASS requires ≤ 235 wu of the 379 wu visible at `zoomIntimate`;
   FAIL requires "does not fit at all". The shipped turn is **263 wu** — it fits (263 < 378.8) and it
   is over 235. **Neither bar is met, in either orientation.** Note 235/379 = 62% fill against the
   solver's own `zoomFill` 0.85 = 322 wu, which the turn clears comfortably; the 235 appears to be a
   different fill assumption again (cf. D62/REQUEST-3).
3. **P3c is a p100 statistic and is therefore P0 restated at its worst tick.** "At each duel's moment
   of maximum framing demand" means the single widest box in the window, so one tick on which a
   hostile is admitted near `zoomLockRange` fails the whole engagement. Given REPORT-2 — admission
   past ~505 wu is a pivot-signal tick by construction — P3c can only pass if no hostile is ever
   admitted beyond ~505 wu in any engagement. It reads **0/252 in portrait and 3/252 in landscape**,
   and **no break-switch moved it in either direction**, which is the signature of a criterion that
   is not measuring a variable.

#### ⚠ REPORT-7 — P2 fails in BOTH orientations, but for different reasons, and portrait's is structural

- **portrait** in-frame median **0.03 s** against a 0.90 s bar, and **30% of approaches reach gun
  range having never been on screen at all**.
- **landscape** in-frame median **1.28 s** — it clears the 0.90 s bar comfortably — and fails only on
  the 5th percentile (0.00 s), i.e. on the worst approaches.

The mechanism is arithmetic and is printed above. §4.3.5 justifies the 440 wu gun range with *"no
hostile weapon may outrange the visible width at `zoomCombat` (462 wu) … 440 is 95% of 462."*
**That compares a radius with a diameter.** The gun range is measured from the shooter; the quantity
it has to beat is the distance from the player to the frame edge, which is at most **315 wu ahead**
at `zoomCombat` (the player sits at `anchorX` 0.34 of a playfield spanning 0.11–0.72 of the frame)
and **404 wu ahead even at the `zoomWide` clamp floor**. In portrait, **at no zoom the controller may
legally choose is the full gun range on screen ahead of the player.** In landscape it is, by 2–2.6×.

This is the same class of error as D26 (a scale that made the stall 268 m/s): two quantities that
looked comparable and were not. **I am not proposing a change to either constant** — 440 wu is
corroborated against real WWI gunnery at 66 m and `anchorX` is D100/D104 work — only recording that
the derivation in §4.3.5 does not support the conclusion drawn from it, and that P2 and P6 are
measuring the consequence.

---

### 5 — DELIVERABLE 4: falsification. Every break-switch, run, and what it caught.

`node tools/gates_portrait.mjs --falsify --runs 8` — portrait, 8 duels per arm.

| arm | engagements | engaged % | boxW p90 | **what it caught** |
|---|---|---|---|---|
| baseline (shipped) | 32 | 37.9% | 925 | — |
| **ALL TICKS (pre-D115)** | 8 | 100.0% | **363** | **P0 FAIL → PASS, at both fills** |
| `?slew=symmetric` | 32 | 37.9% | 925 | **P4c PASS → FAIL** |
| `?margin=strict` | 32 | 37.9% | 925 | P6 NEITHER → PASS (wider frame, more attackers on screen) |
| `?track=sticky` | 32 | 37.9% | 925 | **NOTHING. Bit-identical to baseline — see REPORT-4** |
| `?track=sticky` + `noclear` | 32 | 37.9% | **3,677** | P6 NEITHER → PASS |
| `--arena 150` (positive control) | 28 | **78.0%** | 1,201 | P6 NEITHER → PASS; engaged fraction doubles |
| `--minhull 40` | 32 | 37.9% | 925 | **P3 PASS → FAIL** |
| forced `zoomIntimate` | 32 | 37.9% | 925 | **P6 NEITHER → FAIL** |
| forced `zoomCombat` | 32 | 37.9% | 925 | nothing — P2/P6 are already at their delivered-zoom values |
| `--recovery 1400` | 32 | 37.9% | 925 | **P1b PASS → FAIL, at both fills** |

**The most important row is the second.** Reverting the sample to wall-clock ticks — exactly the
fixture D115 caught — moves the p90 framing box **925 → 363 wu** and turns **P0 from FAIL to PASS**.
That is D115 demonstrated rather than argued: *the pre-D115 instrument would have ratified portrait.*

**Coverage, criterion by criterion.**

| criterion | proven capable of going red? | by what |
|---|---|---|
| P0 | yes, and of going green | currently FAIL; ALL-TICKS turns it PASS |
| P1 | **no** — it is stuck at NEITHER on every arm | REPORT-6 item 2: the bars have a gap |
| P1b | **yes** | `--recovery 1400` |
| P2 | **yes**, and it passes the in-frame bar in landscape | orientation itself is the control |
| P3 | **yes** | `--minhull 40` |
| P3b | **NO — and it cannot be** | REPORT-6 item 1: the threshold is above the clamp ceiling |
| P3c | **no**, in either direction, on any arm | REPORT-6 item 3: a p100 restating P0 |
| P4c (re-specified) | **yes** | `?slew=symmetric`, PASS → FAIL |
| P6 | **yes** | forced `zoomIntimate`, NEITHER → FAIL |
| P9 | delegated | `sim.mjs --break` has its own switch set (`tools/BLESSED.md`) |

**Break-switches that stayed green, reported as defects rather than as passes:** `?track=sticky`
(REPORT-4, inert against any `clearTracked()` driver) and forced `zoomCombat` (redundant here —
the delivered zoom in engagements already sits near `zoomCombat`; not a defect, just an arm that
adds nothing on this fixture).

**Instrument bugs found in my own harnesses and fixed, both caught by an impossible value:**
1. engaged shots read **281.9%** of total shots — `player.shotsFired` resets each round, so the raw
   delta went negative at every round boundary.
2. P6's "time since the attacker was last on screen" read **−19.8 s** — the last-seen map was being
   consulted at the end of the run instead of at the moment of the hit.

---

## WHAT IS DONE, WHAT IS NOT, AND THE NEXT CONCRETE ACTION

### Done
- `tools/p8engage.mjs` — the engagement fixture, its definition, its validation (100% of shots),
  its bound sensitivity, the positive control, and the box-width decomposition.
- `tools/p8stability.mjs` — D114's re-specification implemented, measured, shown insufficient, and
  replaced with a falsifiable form (PUMP windows).
- `tools/gates_portrait.mjs` — P0, P1, P1b, P2, P3, P3b, P3c, P4c, P6, P9 at 390×844 **and**
  844×390, `--falsify`, `--json`. Gate record at `shots/portrait/gate.json`.

### Not done — the next agent's list, in priority order
1. **P4 and P4b are not measured.** They need a scripted 0 → 10,000 wu climb driven through
   `js/core/bands.js` plus the ramp/haze crossfade, which lives in the renderer and needs the CDP
   harness. `tools/skygate.mjs` is the closest precedent. This is the largest remaining gap.
2. **P5 is not re-measured here.** P7 measured it as H11/H12 (D101, D112: 0.00% across three runs at
   the shipped rest position). D101's caveat — H11 has no single value, it depends on where the thumb
   rests — still stands, and no rest-position sweep has been run at the post-D108 lead.
3. **P7 is unmeasurable** until P9 exists — there is no terrain and there are no ground targets.
4. **P8 (blind critique)** needs the renderer plus `tools/blind.mjs` and three critic agents.
5. **The CDP arm is not built.** Everything above is node-side because the modules are DOM-free on
   purpose. What genuinely needs a browser: P4/P4b's crossfade timing, P5's thumb geometry, and a
   portrait/landscape still pair for P8. `tools/cdp.mjs` + `tools/pages/hud.html` are the harness.
6. `tools/p8probe.mjs` and `tools/p8duelbox.mjs` are **superseded** by `p8engage.mjs`. They are left
   in place because D115's numbers cite them.

### REQUESTs for the manager (I do not edit DECISIONS / ARCHITECTURE / BUILD_PLAN)

- **REQUEST-1.** Ratify the engagement definition, and specifically the **bound**. `boxW_p90` is a
  restatement of the bound (REPORT-1): 490.8 wu at `--sep 600` is *inside the auto clamp*, 618.3 wu at
  `--sep 880` is a *pivot signal*. Every bound ≥ 600 captures ≥ 99.7% of the shooting, so
  "captures the fight" does not choose between them. **The orientation of the game currently turns on
  this choice and it is not mine to make.**
- **REQUEST-2.** `zoomLockRange` = 1400 wu and §4.4.1's 585 wu pivot signal are numerically
  incompatible (REPORT-2): a single hostile admitted past ~505 wu of separation is a pivot-signal tick
  by construction, and 64.9% of boxed engaged ticks exceed 503 wu. Either the criterion is indexed on
  something other than the raw box, or the admission rule and the criterion must be reconciled.
  **I have not touched either constant.**
- **REQUEST-3 (settles D62).** Use `zoomFill` = 0.85 on both axes; §4.4.2's P0 formula currently mixes
  0.85 (width) and 0.90 (height) in one expression. At the shipped 585 wu recovery the choice changes
  no verdict, but it would have been decisive at the assumed 1,053 wu.
- **REQUEST-4.** §4.4.1's worked table is built on a 1,053 wu dive recovery, a 273 wu turn and a 60 wu
  hull. The shipped, gate-green figures are **585 wu**, **263 wu** and **64 wu**. Two of §4.4.1's
  conclusions do not survive the substitution: the dive recovery no longer sets portrait's upper bound
  (it never binds), and **landscape's window is no longer empty for the Vne recovery** (REPORT-5).
- **REQUEST-5.** P3b as written cannot fail; P1's bars have a gap the shipped value sits in; P3c is a
  p100 restating P0. See REPORT-6.
- **REQUEST-6.** §4.3.5's derivation of the 440 wu gun range compares a radius with a diameter
  (REPORT-7). The consequence is what P2 and P6 measure. No constant touched.
- **REQUEST-7.** `?track=sticky` is not a break-switch against any `clearTracked()` driver
  (REPORT-4). D61's conclusions drawn from it should be re-read in that light, and P8 should not
  count it as a falsification.

### The one thing I did NOT do, deliberately

**No verdict.** P0 reads FAIL in portrait and NEITHER/PASS in landscape on this instrument, and
REPORT-1 and REPORT-2 say plainly why that number should not be taken at face value before the
manager settles the engagement bound and the `zoomLockRange` incoherence. **Nothing was tuned to move
any criterion**: not `zoomLockRange`, not `closingWu` (D116 is untouched), not `zoomFill`, not the AI,
not the arena, not a threshold. Every control arm is an *additional* code path, never an edit to a
shipped one, and the only file under `js/` I touched is none.
