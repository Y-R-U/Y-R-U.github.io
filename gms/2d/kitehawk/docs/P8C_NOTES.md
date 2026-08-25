# P8c — the LANDSCAPE RETUNE. This one CHANGES constants.

**This file is a resumable handoff, written from the first working step and updated
continuously.** At any moment it says what has landed, the before/after numbers, what each
break-switch caught, what was in flight and the next concrete action. Expect the agent writing it
to be cut off.

**Method, per the brief and this project's record:** derive, never type · measure before and after
and show both · falsify every change · portrait stays first-class (D123) and is re-run as a
regression after every change · refuse rather than tune a value to make a gate pass.

**No git, ever. `docs/DECISIONS.md` `ARCHITECTURE.md` `MANAGER_STATE.md` `BUILD_PLAN.md`
`MANAGER_BRIEF.md` `P8_NOTES.md` `P8B_NOTES.md` are not edited — changes to them are REQUESTs in
§R below.**

---

## STATUS

| | |
|---|---|
| landed | **1. the P3 guard (D128)** — `tools/p3guard.mjs`, four asserts, all three terms falsified independently · **2. D128's two constants** — minimum enemy hull 64 → **66 wu**, landscape `zoomWide` 0.78 → **0.74** · **3. `landscape.playfield.top` 0.06 → 0.12** — H5 **23.92% → 0.00%** · **4. landscape `leadSeconds` 0.70 → 0.39** — clamp-discarded lead **49.8% → 6.0%** of engaged ticks · **5. the stick radius** — `min(zone.w, zone.h)`, landscape R **175.55 → 56.78 px**, nose-down reach **39.7% → 126.5%** · **6. `layout.js`'s named portrait dependency** — `RANGES` → `rangesFor(profile)` · **BOTH inert break-switches** — camtrace's landscape `symmetric-slew/jitter` **0/0/0 → 52 / 103 / 680** and `hudfalsify`'s `framepip` **MISS → RED**. `hudfalsify --mode landscape` is now **10/10**, as portrait is. |
| landed (cont.) | **7. D120's admission radius, DERIVED and shipped** — now **`VIEW_PROFILE.admitWu`, per profile (D129): portrait 700, landscape 1400.** Portrait P0 **−0.3615 FAIL → +0.1583 PASS**; landscape keeps its **1.23 s** in-frame warning. §8, §10. |
| **D129 item 2 — REQUEST-11 swept** | Seven more instances of the class found, verified against source and **fixed**: `js/ui/hud.js`'s `framepip` window (**the only SHIPPED one — a break-switch that went red in the harness and green in the game**), `p8duelbox`/`p8probe` re-merging admission with lock, `p8probe`'s literal `0.7801` floor, `camtrace`'s literal `700` admission, `p8engage`'s literal `462.09`, `p8bslots` asserting a bug that was already fixed, and `hudcdp`'s H4 sweeping portrait's clamp band in both modes. **Fixing camtrace's retracts P8B REQUEST-13**: landscape is now *better* than portrait on every Z1 fight row, not worse. Nine more found and left with reasons. §12, REQUEST-12…20. |
| also repaired, and it was NOT on the list | **`orient.mjs`** — its clamp assert was a literal `0.78` read across a trace that rotates into landscape 20 times, so `zoomWide` 0.74 turned it red. Repaired to read the profile, and the second, subtler red it then showed (a stale sample from the pre-rotation frame) traced to `main.js`'s tick order rather than to the camera. **6/6 PASS, `--falsify` 3/3 still red.** §9. |
| in flight | nothing — a clean stopping point. The eight original items and all three D129 follow-ups are done or refused with reasons. |
| **headline** | **landscape P0 is now a PASS**: in-clamp **0.0337 NEITHER → 0.0737 PASS**, 23% clear of the 0.06 bar, exactly the figure D124 verified. P3 sits at **34.0136 px against 34** and the guard is what holds it there. |
| **portrait regression** | **one number moved and it is reported loudly: portrait P0 in-clamp −0.3602 → −0.3615.** The enemy hull is a SHARED constant (§2.3); raising it widens every framing box by 2 wu in both orientations. Portrait P0 was FAIL before and is FAIL after — nothing crossed a bar. Portrait P3 *improved* 42.1 → 43.4 px. Every other portrait row is unchanged. |
| **REQUEST-6, measured properly: landscape H11 FAILS, and no single number of it is quotable** | Ten identical 30 s runs at the shipped config: **1.74 · 4.25 · 5.91 · 9.67 · 15.42 · 15.42 · 26.03 · 27.73 · 50.79 · 50.79%**, median **15.4%**, **9 of 10 over the 2% cap**. Portrait beside it: **0.00% on 5 of 5.** The spread is `hudcdp.mjs` stepping the thumb on the **wall clock** — D105 one layer down — but portrait's five zeroes are the control that says the overlap is real. Cause, exact and deterministic: **landscape's climb anchor sits 9.5 px INSIDE the thumb's 165 px contact disc; portrait's clears it by 70 px.** §11. **Nothing changed.** |
| **D129 ruled on REQUEST-10** | The manager's check is sharper than mine: **landscape P0 is 0.0737 at admit 440 / 585 / 700 / 935 / 1400 — identical to four decimals**, because it is height-bound. In landscape the radius bought **nothing** and cost 0.53 s of warning. `admitWu` is now per-profile. **Landscape P2 still FAILS either way** — p05 0.35 s against a 0.45 s bar at 1400; only the median (1.23 s) clears. §10. |
| next concrete action | **REQUEST-18** — `js/core/input.js` is the last shape-D instance in shipped code and it is propping up a green assert in `orient.mjs`; the two must land together. Then **REQUEST-13** (`sky.html` hardcodes `worldH: 1000`, so the landscape A4 verdict may be measured on a frame the game never draws — fix before touching the atlas) and **REQUEST-20** (`sep = 1400`, the highest-value latent copy). §11.4 has the H11 routing, which is blocked on making the thumb driver deterministic. |

### Reproduce everything in this file
```
node tools/p3guard.mjs                       # the guard. exit 1 = red
node tools/p3guard.mjs --hull 65             # D128's mandated break-switch. RED
node tools/p3guard.mjs --zoomwide 0.73       # RED on the floor term
node tools/p3guard.mjs --worldh 561          # RED on the scale term
node tools/gates_portrait.mjs                # both orientations, P0-P9
node tools/sim.mjs --fixtures                # 9/9, hashes unchanged by the hull
node tools/sim.mjs --gates                   # 14/14, unchanged
node tools/hudcheck.mjs --node --mode landscape              # 15/15
node tools/hudcheck.mjs --cdp --secs 40 --mode landscape     # H5 green, H11 RED (REQUEST-6)
node tools/hudcheck.mjs --cdp --secs 30 --mode landscape --thumbsweep   # D101's H11 sweep
node tools/hudfalsify.mjs ; node tools/hudfalsify.mjs --mode landscape  # 10/10 BOTH
node tools/camtrace.mjs   ; node tools/camtrace.mjs --mode landscape    # Z1-Z6, control live in both
node tools/p8clead.mjs                       # the per-axis lead derivation + sweep
node tools/p8blead.mjs --runs 16             # the clip accounting
node tools/touch.mjs                         # the 15-case input suite
node tools/gates_portrait.mjs --runs 16 --admit 1400   # the pre-D120 admission radius
node tools/orient.mjs ; node tools/orient.mjs --falsify   # 6/6, and 3/3 arms red
node tools/p8duelbox.mjs --runs 2 ; node tools/p8probe.mjs --runs 2   # now admit at admitWu
node tools/statecheck.mjs ; node tools/corecheck.mjs
```

### THE ONE-LINE SUMMARY

**Eight items plus D129's three follow-ups. Seven constants landed, each with a derivation, a
before/after and a break-switch that was run; sky atlas A4 routed to P16 untouched. Both P0s now
PASS — portrait +0.1583, landscape 0.0737. Two things I refused to move (portrait's `leadSeconds`,
the landscape thumb rest) and the arithmetic for both is in §4.6 and §11.3. Ten instances of one
bug class repaired across `js/**` and `tools/**`, of which the sharpest was a break-switch that
went red in the harness and green in the shipped game. One P8B finding retracted (REQUEST-13) and
two of my own claims corrected in place (§5.3's cause, §8's single shared radius). Portrait moved
on exactly one number and it did not cross a bar.**

### What I have changed, exhaustively

**`js/**`**
- `js/data/tables.js` — new `PLAYER_HULL_WU 64` / `MIN_ENEMY_HULL_WU 66` with the derivation in the
  comment; `makeAirframe` takes `hullWu` from its spec (default `PLAYER_HULL_WU`) instead of
  hardcoding 64.
- `js/sim/entities.js` — `buildEnemyAirframe` passes `hullWu: MIN_ENEMY_HULL_WU`;
  `FRAMING.hullWu` imports the same constant instead of restating `64`.
- `js/core/viewprofile.js` — `landscape.zoomWide` 0.78 → 0.74, with the derivation and the D127
  "both levers together" note.

- `js/core/viewprofile.js` — `landscape.playfield.top` 0.06 → 0.12, with D100's own derivation.
- `js/core/viewprofile.js` — `landscape.leadSeconds` 0.70 → 0.39, with the per-axis derivation.
- `js/core/viewprofile.js` — `stickRadius(view)` takes the VIEW and uses `min(zone.w, zone.h)`
  instead of `view.w` (`P2_NOTES` §R-12). Portrait's radius is unchanged to the digit.
- `js/core/input.js` — one call site follows the signature.
- `js/ui/layout.js` — `RANGES` (a frozen constant naming `VIEW_PROFILE.portrait`) replaced by
  `rangesFor(profile)`; `resolveLayout` attaches `L.ranges`.
- `js/ui/hud.js` — reads `L.ranges.CHEV_RANGE_WU`, and `hudState` publishes `s.pipRangeWu`.
- `js/ui/alttape.js` — `tapeModel` takes the pip radius from `st.pipRangeWu` and **throws** if it
  is missing rather than silently promoting every contact to a pip.
- `js/ui/layout.js` — `framePipWindowPx(view, tapeRect)`, ONE definition of the `framepip`
  break-switch's window, used by both `js/ui/hud.js` and `tools/hudcheck.mjs` (§12.1).
- `js/ui/hud.js` — the shipped `?hudbug=framepip` switch uses it instead of a flat 26 px.
- `tools/p8duelbox.mjs`, `tools/p8probe.mjs` — admit at `view.profile.admitWu`, not `zoomLockRange`;
  `p8probe`'s clamp-floor comparison reads the profile.
- `tools/camtrace.mjs` — the trace's own admission rule reads `P.admitWu` instead of a literal 700.
- `tools/p8engage.mjs` — the printed containment ceiling uses `view.worldW`, not the literal 462.09.
- `tools/p8bslots.mjs` — no longer asserts a bug that item 6 fixed.
- `tools/hudcdp.mjs` — H4 sweeps each profile's own `zoomWide`…`zoomIntimate` band.
- `js/core/viewprofile.js` — **`admitWu` is a PER-PROFILE field (D129)**: portrait **700**
  (derivation in the comment), landscape **assigned from `zoomLockRange` below the table**, the way
  `playfield.right` is assigned from `specialSlot.x`. The header now names both non-§4.1 fields.
- `js/sim/entities.js` — `framingContributions` takes the radius with **no default and throws
  without it**; `FRAMING.admitWu` is gone (a shared constant was the bug).
- `tools/pages/hud.html`, `tools/p8engage.mjs`, `tools/hudcheck.mjs` — pass `view.profile.admitWu`.

**`tools/` — all additive; every existing default reproduces unchanged**
- `tools/p3guard.mjs` — new. The blessed P3 fixture.
- `tools/p8clead.mjs` — new. The per-axis lead derivation and its sweep.
- `tools/p8engage.mjs` — two extra per-tick arrays, `T.vx` / `T.vy`. Nothing else touched; the
  lead is applied per axis and a single `|v|` cannot say which axis a clip came from.
- `tools/camtrace.mjs` — the `static`/`jitter` isolation fixture and the bias probe are mapped to
  the profile's own zoom demand (§6). **Portrait's numbers reproduce byte-for-byte** — `k` is 1
  there and the literals are untouched.
- `tools/hudcheck.mjs` — a `--thumbsweep` flag reaching `runCdp`'s existing rest-position sweep
  (D101 says H11 has no single value and no flag had ever reached the arm); `pipRangeWu` passed to
  `tapeModel` in H6 and H7; **`framepip`'s window is derived from the frame's own column instead of
  a flat 26 tape-px** (§7.4).
- `tools/p8bslots.mjs` — follows the two API changes (`rangesFor`, `stickRadius(view)`).
- `tools/orient.mjs` — its clamp assert read a literal `0.78` across a trace that rotates into
  landscape 20 times, and it went red the moment the floor moved (§9). Now reads the profile.
- `tools/pages/input.html` — a stale comment describing the old stick formula.
- `tools/BLESSED.md` — a section recording `p3guard.mjs` as the second blessed fixture.

---

## 1 — THE P3 GUARD (D128). `tools/p3guard.mjs`

D128: *"`hull × scale × zoomWide ≥ 34` must be a blessed regression fixture that fails loudly,
asserted on the three terms rather than on the product, so the failure message names which one
moved … it is not evidence until it has been run against a deliberately broken build — set hull to
65 and confirm red."*

**Every term is read live from the shipped module** (`ENEMY_TYPES` for the hull,
`VIEW_PROFILE.landscape` for `zoomWide` and `worldH`). Only the blessed values and §4.4.2 P3's
34 px line are literals — that is the difference between a fixture and a second copy of the
arithmetic (D72).

```
  ok  hull               66   blessed         66   ART §3.4 — the minimum enemy hull
  ok  zoomWide         0.74   blessed       0.74   VIEW_PROFILE.landscape — the auto clamp FLOOR
  ok  scale        0.696429   blessed 0.6964285714285714   VIEW_PROFILE.landscape.worldH
  ok  product     34.013571   blessed         34   §4.4.2 P3 — the criterion itself
  66 wu x 0.696429 px/wu x 0.74 = 34.0136 px against 34 px  (margin 0.040%)
```

### 1.1 Falsification — every term proven capable of going red, independently

Run before the constants landed *and* after. The pre-landing run is itself a positive control: on
the shipped 64 wu hull the guard came up **RED on the hull term alone**, correctly naming
ART §3.4 as the owner while `zoomWide`, `scale` and the product were all still green.

| arm | hull | zoomWide | scale | product | px |
|---|---|---|---|---|---|
| shipped, **before** item 2 landed | **RED** | ok | ok | ok | 34.766 |
| **shipped, after item 2 (the blessed state)** | ok | ok | ok | ok | **34.0136** |
| `--hull 65` — **D128's mandated switch** | **RED** | ok | ok | **RED** | **33.4982** |
| `--zoomwide 0.73` | ok | **RED** | ok | **RED** | 33.5539 |
| `--worldh 561` | ok | ok | **RED** | **RED** | 33.9529 |

D128 names two live risks — "anyone retuning `zoomWide`, and anyone lowering the art minimum" —
and **both trip it**, each naming its own owner rather than "P3 broke". The `worldh` arm is the
third term D128 calls stable, included because "stable" is a claim and an assert that has never
been run is not evidence.

Exit status is 1 on red, so it drops straight into a suite.

### 1.2 What the guard found that D128 did not name: the viewport is the fourth term

D128 says *"`scale` is stable (390/560 is fixed by `worldH`, not by the device)"*. **`scale` is
`view.h / worldH` and `view.h` is exactly the device.** The guard therefore also reports the
critical viewport height — the shortest landscape frame that still clears 34 px:

> `h_crit = barPx × worldH / (hull × zoomWide) = 34 × 560 / (66 × 0.74) = ` **389.84 css px**

**The reference 844×390 frame clears it by 0.16 px.** Any landscape viewport shorter than 389.84
css px fails P3 with every constant at its blessed value — an iPhone SE rotated (568×320) reads
**27.9 px**. This is not something the guard can assert (the device is not a constant), so it is
**REQUEST-1** rather than a fourth red row, and the guard prints it on every run so it cannot be
forgotten.

---

## 2 — D128's TWO CONSTANTS, LANDED

### 2.1 Minimum enemy hull 64 → 66 wu — derived, not typed

D128 gives the value; the derivation it implies is written into `js/data/tables.js` so the next
reader does not have to reconstruct it:

> `hull ≥ barPx × worldH / (refH × zoomWide) = 34 × 560 / (390 × 0.74) = ` **65.97 wu → 66 wu**
> (integer wu) **= 9.90 m** at D26's 0.15 m/wu.

64 wu gives 32.98 px and fails. **There is 0.03 wu of slack** — which is the whole reason §1 exists.

`PLAYER_HULL_WU` stays **64** (9.60 m — D26's corroboration, a Camel at 5.7 m under ART's K = 1.6).
D127's "the smallest enemy is larger than the player" is preserved as a fact and, per D128, is
meaningless in practice at 66 vs 64.

### 2.2 Landscape `zoomWide` 0.78 → 0.74

P0's window is `containH − zoomWide` and landscape's ceiling is **pinned at 0.8137** by the 585 wu
dive recovery (F7), so the floor is the only term that can widen it. Measured, not projected:

| | before | after |
|---|---|---|
| landscape P0 in-clamp @ `zoomFill 0.85` | `[0.7800, 0.8137]` = **0.0337 NEITHER** | `[0.7400, 0.8137]` = **0.0737 PASS** |
| landscape P0 @ 90% fill | 0.0815 | 0.1215 |
| landscape P3 at the floor | 34.77 px | **34.01 px** |
| landscape horizontal reach at the floor | 1139 wu ahead | **1200 wu ahead** |

0.0737 is **exactly** the figure D124 verified on the harness, reproduced here from a clean run.

### 2.3 The hull is a SHARED constant, and it had a SECOND home. Both stated loudly.

**`FRAMING.hullWu` in `js/sim/entities.js` was a second literal `64`** — the size a non-boss enemy
contributes to the framing box, i.e. the same enemy hull P3 measures. Landing 66 in only one of its
two homes is precisely D72's drift, so `FRAMING.hullWu` now imports `MIN_ENEMY_HULL_WU`.

That has a measurable cost and it lands on **both** orientations, because the hull is not a
landscape constant:

| | before | after |
|---|---|---|
| p90 box W (both orientations, world-space) | 935.6 wu | **938.6 wu** |
| **portrait P0 in-clamp** | **−0.3602 FAIL** | **−0.3615 FAIL** |
| portrait P0 `zLegible` | 0.6294 | 0.6104 (better) |
| portrait P3 | 42.1 px | **43.4 px** (better) |
| portrait, opponent in frame | 32.1% | 32.2% |
| portrait P4c unexplained rev/min | 2.19 | 2.23 |
| landscape, opponent in frame | 49.2% | 49.7% |
| landscape P2 in-frame p05 | 0.28 s | **0.40 s** (bar 0.45 — still FAIL, closer) |
| landscape P2 never-seen | 2.6% | **1.3%** |
| landscape P4c travel ratio | 1.064 | 1.046 |

**Nothing crossed a bar in portrait.** P0 was FAIL and is FAIL; the 0.0013 shift is the 2 wu wider
box. Portrait's own P3 gained 1.3 px. Everything else — P1, P1b, P2, P3b, P3c, P6, P9 — is
unchanged to the digit.

### 2.4 Regression: the flight model is untouched

`node tools/sim.mjs --fixtures` **9/9, every blessed hash unchanged**; `--gates` **14/14**,
including F12 determinism `53cda0f1` and F14 zoom neutrality. The hull is a framing and legibility
quantity only — nothing in flight, damage or collision reads `airframe.hullWu` (collision uses
`HULL_M` in `damage.js`).

---

## 3 — `landscape.playfield.top` 0.06 → 0.12. H5 23.92% → 0.00%

### 3.1 0.06 was not portrait's derivation carried — it was a DIFFERENT RULE

P8B called it carried. It is worse than that, and the arithmetic says so exactly:

| | portrait | landscape |
|---|---|---|
| `radioCard.y` (profile) | 0.06 | **0.06** |
| shipped `playfield.top` | **0.05** | **0.06 — identical to `radioCard.y`** |
| what that value clears | the objective row's **BOTTOM** (40.57 / 844 = 0.0481 → 0.05) | the radio card's **TOP** |
| banner row, resolved | y 18.57 → **40.57** px = 0.0481 | y 23.40 → **45.40** px = **0.1164** |
| banner inside the playfield? | no (40.57 < 42.20) | **YES** (45.40 > 23.40) |

The profile's own comment says landscape's *"left / top clear the radio card's corner"* — so the
two orientations were derived by two different rules and only portrait's is the one D100 states.
The radio card is `// top third, non-blocking` and H5 does not count it as an occluder; the banner
is neither.

### 3.2 The derivation, in closed form

In landscape `resolveLayout` takes its **second branch** — the card starts 23.40 px down and
leaves no 17 px gap, so the objective row sits *beside* the card at the card's own `y`. Hence

> `top ≥ (row bottom) / H = radioCard.y + BANNER_H / H = 0.06 + 22/390 = 0.11641` → **0.12**

rounded up to 2 dp, which is the same rounding that turns portrait's 0.04807 into 0.05. **Portrait
re-derived under the identical rule gives 0.05 — unchanged, so nothing portrait-side moves.**

### 3.3 Measured, and falsified against the derivation itself

`node tools/hudcheck.mjs --cdp --secs 40 --mode landscape`:

| `playfield.top` | H5 |
|---|---|
| **0.06 shipped** | **FAIL — 626/2617 frames = 23.92%**, `{"banner": 626}` |
| 0.11 | FAIL — 472/2616 = 18.04% |
| 0.115 — *just under* the derived 0.11641 | **FAIL — 464/2616 = 17.74%** |
| **0.12 — the derivation** | **PASS — 0/2619 = 0.00%** |

**The two sub-derived arms are the point.** They prove the derived value is the *boundary* and not
an overshoot chosen for safety: 0.115 is 0.0014 below the derived figure and still fails on 17.74%
of frames. A fix that merely went green would not have distinguished 0.12 from 0.20.

(P8B recorded 23.95% / 627 frames; this run reads 23.92% / 626. The CDP harness is not
bit-repeatable at that resolution — a 1-frame difference over 2,617.)

### 3.4 What it costs, measured

Raising the top shortens landscape's playfield from **0.80 → 0.74 of frame = 448 → 414.4 wu**:

| | before | after |
|---|---|---|
| landscape climb headroom | 118 wu | **108 wu** |
| landscape dive headroom | 136 wu | **125 wu** |
| vy at which the climb lead exhausts | 25.4 m/s | **23.2 m/s** |
| vy at which the dive lead exhausts | 29.2 m/s | **26.8 m/s** |
| vertical lead clip, engaged ticks | 25.9% | **28.3%** |
| landscape P2 in-frame median | 1.28 s | 1.30 s |
| landscape P2 in-frame p05 | 0.40 s | 0.35 s (bar 0.45 — **FAIL either side**) |
| landscape P6 blind hits | 11.1% | **9.2%** |
| landscape, opponent in frame | 49.7% | 49.9% |

**It makes the vertical lead worse, which is item 4's subject.** That is the correct order — the
playfield is a chrome fact and the lead is fitted to it, not the other way round.

**Portrait regression: `gates_portrait.mjs` diffs on landscape lines only. Every portrait row is
byte-identical.**

---

## 4 — `landscape.leadSeconds` 0.70 → 0.39. Derived per axis. `tools/p8clead.mjs`

### 4.1 Why D108 cannot be re-applied, and what replaces it

D108's rule is *"the lead at cruise is 16% of the frame's WIDTH"*, and P8B showed it is circular
(portrait was fitted to landscape's 0.70, which was never measured). It is also single-axis:
`camera.js:393` computes `rawLeadY = vy * P.leadSeconds` from the same scalar.

The replacement is a **constraint with a measurable failure mode** rather than a target fraction:

> the clamp DISCARDS the lead whenever `|v_axis| × leadSeconds > headroom_axis`, so any lead time
> above `headroom_axis / |v_axis|` buys **nothing** on that axis and merely pins the aeroplane
> against the playfield bound — D106's *"the frame now spends real time pinned against the bound,
> which is a worse camera than one whose lead fits its frame"* and D110's *"what 0.55 s was adding
> was overshoot"*.
>
> **`leadSeconds ≤ min over axes of ( headroom_axis / v_axis,p90 )`**

Neither half is chosen. The headrooms are the closed form of `camera.js:420-433` (the same
arithmetic P8B §4.1 validated against two numbers D111 recorded independently). The speeds are
**measured per axis over engaged ticks**, not D108's assumed 280 wu/s cruise. **p90 is the gate's
own percentile** — §4.4.2 P0 takes `boxW` at p90 over engaged ticks — so it is not a free parameter
either.

### 4.2 The measurement, and the structural finding

Measured speeds, 16 duels, 52,078 engaged ticks. The sim is orientation-blind, so one column is
both orientations:

| axis | n | p50 | p75 | **p90** | p95 | p99 |
|---|---|---|---|---|---|---|
| \|vx\| | 52,078 | 251 | 338 | **404** | 421 | 480 |
| climb \|vy\| | 25,046 | 73 | 171 | **237** | 256 | 310 |
| dive \|vy\| | 27,032 | 88 | 198 | **317** | 377 | 456 |

Headroom ÷ that p90 = each axis's lead budget, in seconds:

| axis | PORTRAIT | LANDSCAPE |
|---|---|---|
| x | 63.84 / 404 = **0.158 s** | 255.22 / 404 = **0.631 s** |
| climb | 162.20 / 237 = 0.684 s | 108.32 / 237 = 0.457 s |
| dive | 227.00 / 317 = 0.716 s | 124.90 / 317 = **0.394 s** |
| **binding axis** | **X, 0.158 s** | **DIVE, 0.394 s** |
| shipped | 0.27 (**1.71× its own budget**) | 0.70 (**1.78×**) |

**The binding axis is the opposite one in the two orientations, and the x/dive budget ratio
inverts by 7.2×** (portrait 0.221, landscape 1.601). That is the structural finding: **no single
scalar can be right on both axes of both profiles, and in landscape it cannot be right on both
axes at all** — the two budgets are 0.39 s and 0.63 s. Landscape ships the smaller, and 0.24 s of
horizontal budget goes unspent. See REQUEST-3.

**0.394 → 0.39, rounded DOWN because it is an upper bound.**

### 4.3 Measured, before and after — 16 duels, 52,078 engaged ticks

| landscape | before (0.70) | after (0.39) |
|---|---|---|
| **clamp discarded the lead** | **25,952 = 49.8% of engaged** | **3,117 = 6.0%** |
| ...horizontal | 12,207 = 23.4% | **0 = 0.0%** |
| ...vertical | 14,723 = 28.3% | **3,117 = 6.0%** |
| lead discarded, mean px/tick x | 11.38 | **0.00** |
| lead discarded, mean px/tick y | 12.42 | **1.16** |
| `leadMax` cap ticks | 0 | **0** (still inert — it binds at 420/0.39 = 1,077 wu/s, 2.7× top speed. P8B REQUEST-3 holds) |

The residual 6.0% is exactly what a p90 budget predicts: the derivation buys the lead in full up to
the 90th percentile of the binding axis's own speed and no further.

### 4.4 Falsification — the counter is driven to both ends and is monotone

`tools/p8clead.mjs`'s sweep, cloned profiles, never a mutation of `VIEW_PROFILE`
(clipX% / clipY% of engaged ticks):

| `leadSeconds` | PORTRAIT | LANDSCAPE |
|---|---|---|
| 0 | 0.0% / 0.0% | **0.0% / 0.0%** |
| 0.20 | 29.5% / 0.0% | 0.0% / 0.0% |
| 0.27 (shipped P) | 44.8% / 0.0% | 0.0% / 0.7% |
| **0.39 (shipped L, derived)** | 65.1% / 0.0% | **0.0% / 6.0%** |
| 0.50 | 73.6% / 0.1% | 4.5% / 14.8% |
| 0.63 (landscape's x budget) | 79.9% / 0.6% | 19.0% / 24.9% |
| 0.70 (previous L) | 81.8% / 0.9% | 23.4% / 28.3% |
| 1.0 | 86.7% / 3.1% | **41.0% / 38.5%** |

Driven to zero and to saturation, monotone throughout, and it moves when the *other* profile's
value is substituted. The counter is `camera.js`'s own `clipSumX/Y`, not a re-derivation — the
instrument D109 was written to replace.

### 4.5 What it costs, measured

| landscape | before | after |
|---|---|---|
| opponent in frame, engaged ticks | 49.9% | **48.0%** |
| P2 in-frame warning, median | 1.30 s | **1.23 s** (PASS sub-bar ≥ 0.90) |
| P2 in-frame p05 | 0.35 s | 0.35 s (**FAIL either side**, bar 0.45) |
| P6 blind hits | 9.2% | **10.3%** (PASS, bar ≤ 12%) |

Against the **true P8c baseline** (before item 2), landscape reads opponent-in-frame 49.2% → 48.0%
and P6 11.1% → 10.3%: **1.2 pp of on-screen time given up, 0.8 pp of blind hits gained back.** The
forward reach the lead buys is small against the axis it sits on — at \|vx\| p50 the lead falls
175.7 → 97.9 wu against an ahead reach of **1,200 wu** at the clamp floor and a **440 wu** gun
range. Nothing crosses a bar.

**Portrait regression: `gates_portrait.mjs` diffs on landscape lines only. Every portrait row is
byte-identical, as it must be — this is a landscape-only field.**

### 4.6 What I did NOT change, and why

**Portrait `leadSeconds` stays 0.27, although the same derivation gives 0.15.** Portrait is 1.71×
its own budget and clips horizontally on 44.8% of engaged ticks. That is not news and it is not
mine: D108 said it in as many words (*"the honest answer to 'does the lead fit the frame' is still
no"*) and **D111 named the cause as the HUD, not the camera** — `playfield.right = specialSlot.x =
0.72` leaves 53.9 px of headroom because the special ring owns the right 28% of the column.
Lowering portrait's lead to 0.15 would trade a real camera behaviour to paper over a HUD
constraint, in a first-class supported orientation, with no mandate. **The derivation reproducing
portrait's known, recorded, unfixed defect is corroboration of the rule, not a licence to retune
portrait.** REQUEST-4.

---

## 5 — THE STICK RADIUS. `min(zone.w, zone.h)` — §5.3's H11 claim is withdrawn, see §11

### 5.1 The derivation is `P2_NOTES` §R-12's, and it is portrait-neutral by construction

`stickRadius` was `max(36, view.w × 0.208)`, and **`view.w` is the SHORT edge in portrait and the
LONG edge in landscape**. DESIGN §2.2's 0.208 was a fraction of a portrait canvas *whose stick zone
is the full width and the short side*, so the quantity it meant is **0.208 of the stick zone's
shorter side**. That is `P2_NOTES` §R-12's proposed form, written in P2 and not made by P7's T8.

**It reproduces portrait exactly** — portrait's zone IS the full width, `min(390, 464.2) = 390`,
`0.208 × 390 = 81.12 px`, unchanged to the digit. That is the whole argument for this form and it
is why no portrait number can move.

| | zone px | R before | **R after** | full deflection needs | **room DOWN** |
|---|---|---|---|---|---|
| portrait 390×844 | 390.0 × 464.2 | 81.12 | **81.12 (identical)** | 77.1 px | 116.0 px = **150.6%** |
| landscape 844×390 | 388.2 × 273.0 | **175.55** | **56.78** | 53.9 px | 68.3 px = **39.7% → 126.5%** |
| desktop 1440×810 | 662.4 × 567.0 | **299.52** | **117.94** | 112.0 px | 141.8 px = **126.5%** |

**In landscape the thumb could reach 39.7% of full nose-down deflection and now reaches 126.5%.**
The desktop case R-12 called "wrong" (a 300 px stick radius) comes back to 117.94 px for free.

### 5.2 H12 moves the way P8B predicted a CORRECT metric would, which is the falsification

P8B §8.2 called landscape H12 the fifth believable-wrong metric: *"travel is lower because the
thumb is clamped, not because the control is cheaper … a cap on thumb travel cannot distinguish
'an efficient stick' from 'a stick that cannot be pushed any further'."*

| | before | after |
|---|---|---|
| landscape H12 travel | **519 px/min** at R 175.6 | **738 px/min** at R 56.8 (40 s run) |
| landscape swept union | 14.51% | **9.26%** |
| portrait H12 travel | 1072 / 890 / 1193 across prior runs | 1057 (within the same spread) |
| portrait H11 disc overlap | 0.00% | **0.00%** |

A *smaller* radius means less thumb travel per unit of axis, so travel should have FALLEN. **It
rose by 42%** — because the thumb was previously pinned against the zone edge and stopped moving.
That is the clamped-stick hypothesis confirmed by a positive control, and it is why the old H12
pass was not evidence.

`node tools/touch.mjs` — the 15-case input suite — **PASS, every case**, unchanged.

### 5.3 Landscape H11 — the VERDICT here stands, the CAUSE I gave was wrong. §11 replaces it.

> **"The stick fix turns landscape H11 red" is right** — ten identical runs put 9 of 10 over the
> cap at a median of 15.4%, against portrait's 0.00% on 5 of 5 (§11.1). **"The cause is that the
> stick-zone centre is 31 px from the aeroplane" is wrong.** I compared landscape's eastbound case
> with portrait's eastbound case; portrait's *westbound* aeroplane rests **4.9 px** from the thumb
> centre — closer than landscape's worst — and portrait still reads zero. The cause is vertical:
> the climb anchor sits inside the thumb disc. §11.2. Left in place because it is what I reported
> and the correction is the point.

| landscape H11, disc overlap with the player rect (cap 2%) | |
|---|---|
| before the fix (R 175.55) | **1.83% PASS** |
| after the fix, 40 s run | **8.95% FAIL** |
| after the fix, 30 s run (sweep arm) | **50.79% FAIL** |
| after the fix + item 7, 40 s run | **26.02% FAIL** |

**This is D99's pattern, not a regression.** H11 passed because an unusable stick keeps the thumb
away from the aeroplane: *"an unflyable build scored better than a flyable one on two criteria."*

The cause is HUD geometry and it is arithmetic, not judgement. The harness holds the thumb at the
stick zone's horizontal centre:

| | thumb x | aeroplane's resting screen x | separation |
|---|---|---|---|
| portrait | 195.0 px (zone 0…390) | 0.317 × 390 = **123.6 px** | **71.4 px** |
| landscape | 194.1 px (zone 0…388) | 0.267 × 844 = **225.1 px** | **31.0 px** |

**Landscape's stick zone centre is 31 px from where the camera rests the aeroplane**, and the thumb
disc is 165 px across. Vertically it is the same story — portrait separates thumb rest (728) from
player rest (466) by 262 px; landscape by 117 px.

D101's rest-position sweep, now reachable via `--thumbsweep` (the arm existed in `hudcdp.mjs` and
no flag had ever called it), 30 s runs:

| rest | thumb y | overlap | swept | travel |
|---|---|---|---|---|
| 0.35 | 213 | 31.5% | 11.5% | 510 |
| 0.55 | 267 | 16.7% | 11.4% | 458 |
| **0.75 (shipped model)** | **322** | **50.8%** | 9.3% | 596 |
| 0.90 | 363 | **1.8%** | 7.2% | **229** |

**Only 0.90 clears the cap, and 0.90 is the rest position D101 already rejected by name** — it
clamps the thumb against the bezel and *"flatters both H11 and H12 by simply not letting the thumb
move"*, which is visible here as travel collapsing 596 → 229. **So there is no rest position that
honestly clears H11 in landscape, and I have not moved one to make it pass.** REQUEST-6.

Also worth flagging on its own: **8.95% / 26.02% / 50.79% across three runs on the same seed.**
D101 said H11 has no single value across rest positions; it does not have a stable one across runs
either. Every reading is red; the spread is a reason not to quote a single figure, not a reason to
doubt the finding. REQUEST-8.

---

## 6 — `layout.js`'s NAMED PORTRAIT DEPENDENCY (item 6), repaired and falsified

`layout.js` had, one line under a comment warning about exactly this class of bug:

```
PIP_RANGE_WU:  VIEW_PROFILE.portrait.zoomLockRange,
CHEV_RANGE_WU: VIEW_PROFILE.portrait.zoomLockRange * 2,
```

frozen at module scope and read in both orientations. Now `rangesFor(profile)`, with
`resolveLayout` attaching `L.ranges`; `hud.js` publishes `s.pipRangeWu` from the view and
`alttape.js` reads it from the caller.

**`tapeModel` THROWS on a missing `pipRangeWu` rather than defaulting.** An undefined radius makes
`Math.abs(dx) > undefined` false for every contact, so every aircraft in the arena becomes a tape
pip — a failure that would read as a *better* H7 warning. That is the shape this project has been
caught by five times, so it is loud.

**Falsified.** With `landscape.zoomLockRange` forced to D120's 700 wu on a cloned profile:

| | portrait | landscape |
|---|---|---|
| `L.ranges` at the shipped 1400 | `{1400, 2800}` | `{1400, 2800}` |
| `L.ranges` with landscape forced to 700 | `{1400, 2800}` (untouched) | **`{700, 1400}`** |
| a contact 900 wu abeam → tape pips | 1 | **0** |
| missing `st.pipRangeWu` | — | **throws**, as designed |

Before the change the forced 700 would have produced `{1400, 2800}` and 1 pip in landscape — the
control could not have gone red, which is what made it a latent bug rather than a visible one.

**Regression: `hudcheck --node` 15/15 in both orientations. Portrait H7 reproduces P8B's numbers
to the digit — median lead 6.49 s, p10 2.60, min 1.95.**

---

## 7 — camtrace's INERT BREAK-SWITCH, repaired. Z1–Z3 now have a control in landscape

### 7.1 What was wrong, and why the obvious repair made it worse

`control:symmetric-slew / jitter` is camtrace's largest signal — **52 rev/min, 103 gap violations,
680 oscillation windows** in portrait — and it read **0 / 0 / 0** in landscape. The fixture holds a
member **150 wu** ahead and wobbles it ±30%; against a 1212 wu frame the solve saturates at
`zoomIntimate` and the wobble moves nothing. The tool's own comment names the failure mode:
*"a wobble that never moves the clamped target proves nothing, which is how a test quietly becomes
vacuous."*

**The obvious repair — scale the offset by `worldW` — does not work, and I ran it before believing
it.** The framing box is `offset + padding + hull` and the last two terms are absolute
(measured off the shipped `cam.box`: **217.6 wu**, identical in both profiles), so equal fractions
of the frame do not give equal zoom demands. That arm still read 0/0/0.

**A second wrong repair, also run: solve the offset for the same SETTLED zoom.** With one member
held still the deadband and the dwell settle *both* profiles on exactly 1.00 at any offset, so the
bisection found offset ≈ 0 and reproduced the vacuous fixture it was written to replace. The
observable had to be the box's **demand**, not the delivered zoom.

**A third, and it is the one worth recording.** Matching only the *centre* of the wobble left
landscape a 1.3× larger swing (the absolute 217.6 is a smaller fraction of a larger offset), and
the result was **shipped 51 rev/min against the broken arm's 52** — a control both arms fail,
which is no better than one neither fails.

### 7.2 The repair: map the wobble's WHOLE RANGE to the same zoom demand

> `demand(a) = worldW × zoomFill / (a + C)`  → `a' = k × (a + C) − C`,
> `k = (worldW' × zoomFill') / (worldW × zoomFill)`

applied per tick to `150 × wob`, with `C` measured from the shipped camera. **In portrait `k` is 1
and this returns `150 × wob` unchanged**, so every prior camtrace number reproduces byte-for-byte.

| arm / scenario | portrait, before **and** after | landscape, **before** | landscape, **after** |
|---|---|---|---|
| `shipped / static` | 0 / 0 / 0 | 0 / 0 / 0 | **0 / 0 / 0** |
| `shipped / jitter` | 0 / 0 / 0 | 0 / 0 / 0 | **0 / 0 / 0** |
| **`control:symmetric-slew / jitter`** | **52 / 103 / 680** | **0 / 0 / 0 — INERT** | **52 / 103 / 680** |

(rev/min / gap violations / oscillation windows.)

Landscape's break-switch is now **bit-identical to portrait's**, which is the point: the fixture
presents the same stimulus to both profiles, so what is compared is the controller and not the
frame. **Z1–Z3 have a working control in landscape for the first time** — D118's requirement, and
`MANAGER_STATE`'s "Z1–Z3 have no working control in landscape" is discharged.

The bias probe's 160 wu box got the same mapping (P8B REQUEST-12).

### 7.3 What is still portrait-sized in camtrace, and was NOT repaired

`shipped/scripted` reads **10.5 rev/min portrait against 0.5 landscape** — its programme is a list
of absolute box widths (150…900 wu) and the same collapse applies. It is not the break-switch
`MANAGER_STATE` names and mapping a 17-step programme is a larger change than the one-line
`matchAhead` above, so it is **REQUEST-9**, not done.

### 7.4 The SECOND inert break-switch: `hudfalsify`'s `framepip`. MISS → RED

`framepip` replaces the tape's pips with pips for contacts within **26 tape-px** of the player —
"a pip derived from the frame" — and H7 exists to prove the tape warns *before* the frame. In
portrait it is caught (0/60 warned). In landscape it read **warned 60/60, median lead 1.72 s** and
H7 could not tell the tape from the frame, so **H7's landscape PASS was unfalsified.**

The cause is the same one as §7.1, in a different file: **26 px is an absolute tape-pixel window,
and the tape is 53.0 px per 1,000 wu in portrait against 24.0 in landscape.**

| | portrait | landscape |
|---|---|---|
| the 26 px window as WORLD column | **490.4 wu** | **1,083 wu** |
| the profile's own half-frame at zoom 1 | 500 wu | **280 wu** |
| so the substitute is… | **narrower** than the frame → no warning | **3.9× wider** than the frame → warns early |

A substitute wider than the frame warns earlier than the frame, which is why it stayed green. The
switch's own premise is *a pip derived from the frame*, so the window is now the same fraction of
each profile's own column — portrait's shipped 26 px is **0.4904 of its 1,000 wu**, and the
formula reproduces **26.00 px** there exactly.

| | portrait | landscape |
|---|---|---|
| derived window | **26.00 px** = 490.4 wu (unchanged) | **6.58 px** = 274.6 wu |
| `framepip` verdict | RED, warned 0/60 (unchanged) | **MISS (60/60, 1.72 s) → RED, warned 0/60** |
| `hudfalsify` total | **10/10** | **9/10 → 10/10** |

`node tools/hudfalsify.mjs` and `node tools/hudfalsify.mjs --mode landscape` both catch every
switch. **`MANAGER_STATE`'s "two break-switches are INERT in landscape" is discharged.**

---

## 8 — ITEM 7: D120's ADMISSION RADIUS, DERIVED AND LANDED

> **SUPERSEDED IN PART BY §10 (D129).** The derivation below stands and is what portrait ships.
> The single shared 700 wu it landed did not: in landscape the radius buys nothing and costs
> 0.53 s of in-frame warning, so `admitWu` is now per-profile. Read §8.2 for the derivation and
> §10 for where it applies.

### 8.1 D120 was measured but NOT SHIPPED

`framingContributions(world, player, out, lockRangeWu)` defaulted to **1400** and every caller
passed `view.profile.zoomLockRange` — the same constant `camera.js` uses to cap zoom-IN. The 700 wu
figure existed only as `gates_portrait.mjs`'s `--admit` arm. So the defect D120 names — one number
doing two opposite jobs — **was still shipped in both orientations**, and every portrait P0 FAIL in
the tables above is that 1400.

Now `FRAMING.admitWu`, a separate named constant, with `zoomLockRange` keeping its other job
untouched. `tools/pages/hud.html`, `p8engage.mjs` and `hudcheck.mjs` follow.

### 8.2 The derivation, and it reproduces 700 without being fitted to it

A hostile is a **framing subject** if the camera must already have him in frame by the time he can
shoot. (Whether he is *trackable* is the tape's and the chevrons' job — §4.2, and D120's whole
point.) So the radius is the range he can shoot from, plus the ground he covers while the camera
opens up:

> `admit = gunRange + closing_p90 × t_widen`

| term | value | where from |
|---|---|---|
| `gunRange` | **440 wu** | §4.3.5, shipped |
| `closing_p90` | **618 wu/s** | p90 of the closing rate on the ticks where **this rule's own** `closing > closingWu 120` condition holds — 13,969 of 52,016 engaged ticks, 16 duels |
| `t_widen` portrait | **0.400 s** | measured off `camera.js` driving `zoomIntimate` → the clamp floor; the `zoomOutRate 1.10` cap binds, so it matches `(1.22 − 0.78)/1.10` |
| `t_widen` landscape | **0.433 s** | same, `(1.22 − 0.74)/1.10 = 0.436` |

> portrait  440 + 618 × 0.400 = **687.4 wu**
> landscape 440 + 618 × 0.433 = **707.8 wu**  →  **700 wu, shared**

The two differ by 3% and both round to D120's sweep point. **A derivation reproducing a number it
was not fitted to is the reason to believe it** — the same test §2's hull derivation and P8B §4.1's
headroom formula passed. One shared constant is inside the rounding, so it does not need to be
per-profile (and item 6 makes that safe either way).

### 8.3 Measured — and D120's statement of the cost is INCOMPLETE

32 duels, 121 engagements, 95,449 engaged ticks:

| | portrait 1400 → 700 | landscape 1400 → 700 |
|---|---|---|
| p90 box W | 938.6 → **418.6 wu** | 938.6 → **418.6 wu** |
| **P0 in-clamp @ `zoomFill 0.85`** | **−0.3615 FAIL → +0.1583 PASS** | 0.0737 → **0.0737 PASS** (height-bound, D124) |
| opponent in frame | 32.2% → **31.7%** | 48.0% → **45.7%** |
| **P2 in-frame warning, median** | 0.03 → **0.02 s** | **1.23 → 0.70 s** |
| P2 in-frame p05 | 0.00 → 0.00 s | 0.35 → **0.18 s** |
| reached gun range never seen | 25.7% → **28.9%** | 1.3% → **3.3%** |
| P3c | 0/121 → **6/121** | 1/121 → **13/121** |
| P4c unexplained rev/min | 2.23 → 2.07 | 3.28 → **0.98** |
| P4c travel ratio | 0.924 → 0.650 | **1.046 → 0.599** |

**Portrait P0 goes FAIL → PASS at +0.1583, which is D120's own prediction reproduced** (it read
+0.1654 at a 64 wu hull; the 66 wu hull accounts for the difference). Landscape P0 does not move at
any radius, exactly as D124 said.

**But D120's *"the cost of the whole thing is 0.5 percentage points of on-screen time"* is not the
whole cost.** It is right about portrait's on-screen time (32.2 → 31.7, 0.5 pp). It does not
mention P2, and **P0 and P2 pull in opposite directions on this radius, monotonically.** 16-duel
sweep, portrait "reached gun range having never been on screen":

| admit | portrait P0 in-clamp | portrait never-seen | landscape P0 | landscape opponent in frame |
|---|---|---|---|---|
| 440 (gun range) | +0.3555 PASS | **82.6%** | 0.0737 PASS | 45.2% |
| 585 (dive recovery) | +0.2710 PASS | 64.0% | 0.0737 PASS | 46.1% |
| **700 (derived, shipped)** | **+0.1503 PASS** | **31.4%** | **0.0737 PASS** | 46.6% |
| 935 (the old p90 box) | −0.0506 FAIL | 26.7% | 0.0737 PASS | 45.2% |
| 1400 (previous) | −0.3531 FAIL | 26.7% | 0.0737 PASS | 49.1% |

A tighter radius means fewer box members, so the camera tightens (landscape travel ratio
1.046 → 0.599, unexplained reversals 3.28 → 0.98 — the controller is markedly calmer) and the frame
shows less world, so attackers appear later. **That is the trade, and it is real in both
orientations.**

### 8.4 Why it landed anyway, stated as a call rather than buried

D124 says the admission radius *"lands regardless: it was a defect in both orientations"*, D120 says
*"derive it before it ships"*, and the derivation above is now on file and reproduces the value
independently. Separating two contradictory jobs from one constant is not a tuning decision.

**What the manager did not have when ruling that is §8.3's right-hand column: landscape's in-frame
warning median falls 1.23 → 0.70 s, and D121/D123 chose landscape on that quantity** (1.28 s against
portrait's 0.03 s). Two things bound it:

1. **Landscape P2 was FAIL before and is FAIL after** — the p05 misses the 0.45 s bar either way.
   Nothing crossed a bar; a margin narrowed.
2. **Total warning is invariant at 1.75 s median across every radius in the sweep.** Only the
   *in-frame* component moves, and D121's own resolution for portrait was that §4.2's tape and
   chevrons carry the warning the picture does not. H7 still passes in landscape with a median lead
   of 4.43 s over the frame, and its break-switch is now live there (§7.4).

**REQUEST-10 carries this to the manager with the sweep**, because "the pivot's headline number
halved" is the kind of thing that should be read by the person who made the pivot, not folded into
a phase report.

## 9 — WHAT THE `zoomWide` CHANGE CAUGHT ON ITS WAY PAST: `orient.mjs`

**`orient.mjs` went 6/6 → 5/6 FAIL** on `zoom stayed inside the clamp through every rotation`,
reading `zoom 0.7577 .. 1.0000`. The assert was

```
Math.min(...zooms) >= 0.78 - 1e-9 && Math.max(...zooms) <= 1.22 + 1e-9
```

**a literal of PORTRAIT's clamp floor, applied to a trace that rotates into landscape 20 times.**
It is item 6's bug in a third file, and it was invisible for exactly as long as both profiles
carried 0.78. 0.7577 is legal — it is inside landscape's `[0.74, 1.22]`.

**And then the profile-aware version went red too, for a different and more interesting reason:**
`10 tick(s) outside, worst portrait 0.7620`. Ten samples, over twenty rotations, all in portrait —
one per rotation *into* portrait. That is not the camera carrying an illegal zoom across a
rotation; it is the harness:

- `js/main.js` runs `cam.update` **after** the scene update (*"the camera runs AFTER the sim and
  before render — it is a consumer, never an input"*), and `orient.mjs` pushes its trace row from
  the scene update.
- So row *i* carries the zoom `cam.update` produced during frame *i−1*, **under the profile in
  force then**. On the first row after a rotation the mode has flipped but the sample has not.
- `camera.js:360` re-clamps `zoomBase` to `P.zoomWide` on the next `cam.update`, before `render`,
  so **no rendered frame is ever outside its own clamp.**

Checked against `js/main.js`'s loop, not assumed. The criterion is unchanged and now asks the
profile that was in force when the sample was produced:

```
node tools/orient.mjs             # 6/6 PASS, 20 rotations, zoom 0.7577 .. 1.0000
node tools/orient.mjs --falsify   # 3/3 arms still RED as required
```

**Falsification:** the assert is demonstrably able to fail — it did, twice, on the way to this
version (literal-0.78, and profile-of-the-wrong-row). What changed is *which profile it asks*, not
whether it can go red, and `--falsify`'s three harness break-switches all still fire.

**This is the strongest argument for the P3 guard §1 exists to be.** A shared constant became
per-profile and three separate places had silently assumed it never would: `layout.js` (item 6),
`orient.mjs` (here), and `camtrace`'s fixtures (§7). None of them was found by reading code; each
was found by a number moving.

## 10 — D129: `admitWu` PER PROFILE. Portrait 700, landscape 1400

### 10.1 The manager's check is sharper than my REQUEST-10, and I verified it independently

I reported the admission radius as a **trade**. In landscape it is not one. Reproduced on my own
harness by swapping the two profiles' values (§10.3):

> **Landscape P0 in-clamp is 0.0737 at admit 440, 585, 700, 935 and 1400 — identical to four
> decimals**, because landscape's containment is HEIGHT-bound: the ceiling is pinned at 0.8137 by
> the 585 wu dive recovery while the width term runs 1.0975 → 2.4610 and never binds.

So **landscape's 0.0337 → 0.0737 came entirely from D128's clamp floor**, not from the admission
radius. At 700 wu the radius bought landscape nothing and cost **0.53 s of in-frame warning**.

`admitWu` is now a `VIEW_PROFILE` field — D104's own pattern, the one that made `playfield`
per-mode. Portrait keeps the derived **700**; landscape admits at its full **`zoomLockRange` 1400**,
*assigned* from it below the table rather than copied, exactly as `playfield.right` is assigned from
`specialSlot.x`.

### 10.2 Measured. Portrait is BYTE-IDENTICAL; landscape's warning comes back

`gates_portrait.mjs`, 32 duels, 121 engagements, diffed against the shared-700 run:

| | portrait (admit 700, unchanged) | landscape (700 → 1400) |
|---|---|---|
| **every portrait row** | **byte-identical — zero diff** | — |
| P0 in-clamp @ `zoomFill 0.85` | **+0.1583 PASS** | 0.0737 → **0.0737 PASS** (unmoved, as predicted) |
| p90 box W | 418.6 wu | 418.6 → **938.6 wu** |
| **P2 in-frame warning, median** | 0.02 s | **0.70 → 1.23 s** |
| P2 in-frame p05 | 0.00 s | 0.18 → **0.35 s** |
| reached gun range never seen | 28.9% | 3.3% → **1.3%** |
| opponent in frame | 31.7% | 45.7% → **48.0%** |
| P4c unexplained rev/min | 2.07 | 0.98 → 3.28 |
| P3c | 6/121 | 13/121 → 1/121 |

### 10.3 Falsified — each profile responds to ITS OWN field

Values swapped on a temporary edit (portrait 1400 / landscape 700), 16 duels, then reverted:

| | portrait | landscape |
|---|---|---|
| p90 box W, shipped → swapped | 422.2 → **920.0 wu** | 938.6 → **422.2 wu** |
| P0 in-clamp, shipped → swapped | **+0.1503 PASS → −0.3531 FAIL** | 0.0737 → **0.0737** (unmoved) |
| P2 in-frame median, shipped → swapped | 0.03 s | 1.23 → **0.70 s** |

Both profiles move on their own field and neither moves on the other's, so the field is genuinely
per-profile. **And the swap independently re-confirms D129's premise**: landscape's P0 reads 0.0737
at 700 *and* at 1400, on a run whose only purpose was to break the change.

`framingContributions` now **throws** without a radius rather than defaulting. A default would have
to name one profile — the exact shape that started this — and an omitted radius would make
`dWu > undefined` false for every hostile, admitting the whole arena: a framing box containing
everything reads as a camera that frames the fight perfectly. Verified it fires.

### 10.4 STATED PLAINLY, because the improvement must not read as a pass

**Landscape P2 still FAILS, at 1400 as at 700.** The criterion is
`FAIL if in-frame median < 0.70 s OR total median < 1.10 s OR in-frame p05 < 0.45 s`, and landscape
reads **p05 0.35 s against the 0.45 s bar**. Only the median (1.23 s) and the total (1.75 s) clear.
Going 700 → 1400 moved p05 from 0.18 to 0.35 — it recovered ground D129's ruling correctly refused
to give away, and it did **not** turn P2 green. Portrait's P2 is unchanged and still fails on all
three sub-bars.

## 11 — REQUEST-6: LANDSCAPE H11, CHARACTERISED. Report only, nothing changed

Per D129 item 3: measure and characterise, do not fix, do not move the rest position.
**Nothing in `js/**` was changed for this section.** Two option probes were run on temporary edits
and reverted; `js/core/viewprofile.js` was diffed byte-for-byte against its pre-probe copy
afterwards and is identical.

### 11.1 Ten identical runs. The verdict holds; the individual numbers do not.

D101 says H11 has no single value across rest positions. It has no single value across *runs*
either, so I stopped quoting one and ran the shipped configuration ten times at 30 s, unchanged,
and portrait five times beside it.

| landscape 844×390, shipped, 30 s, ten runs | portrait 390×844, five runs |
|---|---|
| 1.74 · 4.25 · 5.91 · 9.67 · 15.42 · 15.42 · 26.03 · 27.73 · 50.79 · 50.79 % | **0.00 · 0.00 · 0.00 · 0.00 · 0.00 %** |
| median **≈ 15.4%**, range **1.74 – 50.79%**, **9 of 10 over the 2% cap** | **5 of 5 at exactly zero** |

**So the verdict is solid and the precision is not.** Landscape H11 fails — not marginally, and not
on one unlucky run. Portrait does not fail, ever, on any run. What is untrustworthy is any single
landscape *figure*, mine included: I earlier reported 8.95% and later 1.74% as though each meant
something, and both are draws from that distribution.

**The spread has a structural cause and it is in `hudcdp.mjs`'s own driver:**

```
for (let i = 0; i < steps; i++) {
  const s = await cdp.eval(...);      // read wantAxis / axisY over CDP
  off = ... GAIN * (want - have) * R;
  await t.moveTo(tx, ty);
  await sleep(1000 / HZ);             // <-- WALL CLOCK
}
```

The thumb is stepped at 20 Hz on the **wall clock**, over a CDP round trip, against a browser frame
loop running independently. Nothing is seeded, so the touch sequence — and the flight that follows
it — differs every run. **This is D105's shape one layer down**: D105 made the *camera* repeatable
after the same seed produced 13.96 / 70.45 / 29.96% occlusion; the thumb driver was never in scope,
and H11/H12 sit downstream of it.

**Portrait's five identical zeroes are the control that makes this readable.** The non-determinism
only produces a spread where there is overlap to sample; portrait has none, so it reads clean every
time. That is why the landscape spread is evidence of a real overlap rather than of a broken
instrument — and it is also why **no single landscape number should be quoted without the
distribution.**

### 11.2 The geometry, which IS deterministic and does not depend on any of that

`resolveLayout` and `VIEW_PROFILE` are pure, so this half is exact. `THUMB_DISC` is **165 px**, ART
§10's 44 mm thumb contact — an absolute physical size, not a tunable.

| | portrait 390×844 | landscape 844×390 |
|---|---|---|
| stick zone | x 0…390, y 379.8…844.0 | x 0…388.2, y 117.0…390.0 |
| thumb rest (zone centre, 0.75 down) | (195.0, **728.0**) | (194.1, **321.8**) |
| disc y band | **645.5…810.5** | **239.3…404.3** |
| playfield y | 42.2…725.8 (683.6 px) | 46.8…335.4 (**288.6 px**) |
| **playfield ∩ disc, vertically** | 80.4 px = **11.8%** of the playfield | 96.1 px = **33.3%** |
| **climb anchor y vs disc top** | 575.4 vs 645.5 — **clear by 70.0 px** | 248.8 vs 239.3 — **INSIDE by 9.5 px** |
| aeroplane rest x, eastbound / westbound | 123.8 / **199.9** | **225.3** / 492.1 |
| dx from thumb, eastbound / westbound | 71.2 / **4.9** | **31.2** / 297.9 |
| playfield height + disc vs frame height | 683.6 + 165 = 848.6 > **844** | 288.6 + 165 = 453.6 > **390** |

**Two things fall out, and the first corrects my own §5.3.**

1. **It is NOT the horizontal separation.** I reported landscape's 31 px against portrait's 71 px.
   That compared landscape's eastbound case with portrait's eastbound case — **portrait's
   *westbound* aeroplane rests 4.9 px from the thumb centre**, six times closer than landscape's
   worst, and portrait still reads 0.00%. The horizontal is not what saves portrait.
2. **It is the vertical, and specifically the climb anchor.** Portrait's climb anchor clears the
   disc's top edge by 70 px; landscape's sits 9.5 px *inside* it. So in landscape the aeroplane
   enters the thumb's disc every time it climbs, and in portrait it only does so in a deep pull-out
   at the very bottom of the playfield.

**And note the last row: NEITHER orientation can make them disjoint.** 165 px of thumb plus the
playfield exceeds the frame height in both. Portrait is not clean by design — it is clean because
its overlap band is 11.8% of the playfield and no anchor lives in it.

### 11.3 The options, costed. I am not choosing between them.

| option | what it buys | what it costs |
|---|---|---|
| **A. `anchorYClimb` 0.70 → 0.66** | climb anchor clears the disc top by 2.0 px (from −9.5) | the look-up sweep D126 counted on falls **62.2 → 45.6 wu**, a 27% cut in "pan upwards as the plane climbs". Climb headroom *improves* 108.3 → 124.9 wu. **Measured H11: 1.90% vs a 1.74% baseline — inside the instrument's spread, so unproven.** |
| A′. `anchorYClimb` → 0.60 | 19.3 px of clearance | sweep 62.2 → **20.7 wu**; at 0.55 the climb anchor *is* the rest anchor and the feature is gone |
| **B. narrow `stickZone.w` 0.46 → 0.28** | thumb centre moves 194.1 → 118.2 px, clearing the resting aeroplane by 107.2 px against the 104.8 px needed (disc radius + hull half-width) | stick radius 56.8 → 49.2 px (still reachable: 46.7 px needed against 68.3 px of room); zone 62×43 → **38×43 mm**. **But it cannot be guaranteed** — at cruise the lead sweeps the eastbound aeroplane left to x 48.3, back across the zone. **Measured H11: 2.00% on one run — same objection as A. H12 rose 449 → 537 px/min.** |
| C. move the stick zone right | the 174.9 px gap right of the aeroplane's x range *is* wide enough for a 165 px disc | it is where `specialSlot` (x 0.82 = 692 px) and the tape (808…838 px) live, and it is the wrong hand — the profile comments the landscape zone as `handedness-mirrored` |
| D. raise `playfield.bottom` 0.86 → ≤ 0.6136 | full vertical separation | **surrenders 28% of the vertical column.** D101 rejected this exact shape at 11% in portrait |
| E. move the thumb rest to 0.90 | 1.8% overlap | **rejected by D101 by name** — it clamps the thumb against the bezel; travel collapses 596 → 229 px/min |
| **F. re-specify H11 for landscape** | a criterion that can be evaluated | needs §11.1 fixed first: a per-frame coincidence count with a 2% cap cannot be read off a non-reproducible flight, whatever the geometry |

**A and B are the only cheap ones and NEITHER WAS USABLY MEASURED.** Each got one run against one
baseline draw, and §11.1 shows single draws range 1.74–50.79%. Distinguishing a few percentage
points of geometry needs the driver made deterministic first — which is why §11.4 puts that before
the routing, not after it.

### 11.4 What this needs before it can be routed with numbers attached

D129 asks for this to go to P13 or P16 the way D111 did. **The VERDICT is ready to route now —
9 of 10 red at a median of 15.4% against portrait's 0.00% on 5 of 5, with a deterministic cause.
What is not ready is the comparison between the fixes**, because telling option A from option B
means resolving a few percentage points inside a distribution that spans 1.74 – 50.79%. The order:

1. **Make the thumb driver deterministic** — step it on the page's own frame counter rather than on
   `sleep(1000/HZ)`, so the touch sequence is a function of the sim tick. That is `hudcdp.mjs`, not
   `js/**`, and it is the same fix D105 applied one layer up.
2. Re-measure the shipped configuration and A and B against a stable baseline.
3. *Then* route the geometry above with real deltas.

Until then the honest statement is the one §11.2 supports on its own: **landscape's climb anchor
sits inside the thumb's contact disc and portrait's clears it by 70 px** — a deterministic fact
about the layout, independent of any H11 reading.

## 12 — REQUEST-11 SWEPT. Seven more found and fixed, and one P8B finding retracted

D129 item 2: any constant derived before D123 is suspect by default. I ran a fan-out search over
`js/**` and `tools/**` for the four shapes — (A) reading `VIEW_PROFILE.portrait` by name,
(B) numeric literals duplicating a profile value, (C) absolute wu/px constants sized against one
frame, (D) assuming a field is shared — and **verified every claim against the source myself before
acting on any of it.** The full inventory is below; these six are fixed.

### 12.1 Fixed, and each was a live defect

| # | where | shape | was | what it broke |
|---|---|---|---|---|
| 1 | **`js/ui/hud.js:283`** | C | `framepip` filtered pips by a flat `CHEV_MERGE_PX` 26 px | **The only SHIPPED one.** I repaired `hudcheck.mjs`'s copy of this switch in §7.4 and left the browser's — so `hud.html?hudbug=framepip` stayed green in landscape for exactly the reason the harness's no longer did. **A break-switch that goes red in the test and green in the game.** |
| 2 | `tools/p8duelbox.mjs:63`, `tools/p8probe.mjs:92` | D | passed `view.profile.zoomLockRange` to `framingContributions` | D120/D129 split admission from lock so they could not silently re-merge, and **two of the five drivers re-merged them within the hour.** Both measured portrait's p90 box at admit 1400 against a shipped 700 — the number §4.4.1's whole table is indexed on. |
| 3 | `tools/p8probe.mjs:155` | B | `all.Z.filter(z => z <= 0.7801)` | `orient.mjs`'s bug verbatim: portrait's clamp floor as a literal **inside a comparison**. Against a 0.74 floor it reports **0.0% pinned** while the camera sits on the floor all mission — it fails silently *downward*, which is the believable-wrong shape. |
| 4 | `tools/camtrace.mjs:250` | B | `d <= P.zoomLockRange && (d < 700 \|\| closing > 120)` | Portrait's `admitWu` as a literal, in a tool that **has** a `--mode` arm. Every Z1–Z3 landscape number was taken on portrait's box population. See §12.2 — this one retracts a P8B finding. |
| 5 | `tools/p8engage.mjs:282` | B | `const W = 462.09` | Portrait's `worldW` as a literal in a tool that genuinely runs both orientations; it feeds the printed containment ceiling and the 503/585 verdicts, wrong by 2.6× in landscape. |
| 6 | `tools/p8bslots.mjs:96` | A | printed *"layout.js:157 reads VIEW_PROFILE.PORTRAIT.zoomLockRange by name, in BOTH orientations"* | True when P8B wrote it, **false since item 6**. A tool asserting a fixed bug sends the next reader hunting for something that is not there. |
| 7 | `tools/hudcdp.mjs:109-110` | B | `bboxes(0.78)` / `bboxesWide(0.78)` in both modes | H4 asks "does the HUD zoom?" over portrait's clamp band even when `mode:'landscape'` drives the page — so **the 0.74–0.78 band a landscape player actually reaches was never tested.** Now `VP[mode].zoomWide`…`zoomIntimate`; the criterion is the band, not the literal. |

**#1 is fixed by deleting one of the two copies, not by repairing both.** `framePipWindowPx(view,
tapeRect)` now lives in `js/ui/layout.js` (H1 forbids px literals anywhere else in `js/ui/`) and
**`hudcheck.mjs` imports the shipped function instead of computing its own** — DESIGN §10.8's
anti-mock rule: the harness must exercise the shipped thing. Portrait reproduces **26.00 px**
exactly; landscape gets **6.58 px**.

Verified after: **H4 now reads `zoom 0.74 and 1.22` in landscape and `0.78 and 1.22` in portrait**,
both PASS at 0.000 px — the criterion asks each profile about its own band, and portrait's line is
unchanged.

**H1 caught me doing the very thing being swept for.** My first version put the 390×844 reference
inside `alttape.js` and H1 went red on four px literals. That is the criterion working, on the
agent repairing the class.

### 12.2 Fixing #4 RETRACTS P8B REQUEST-13

P8B recorded: *"Landscape is measurably WORSE than portrait on Z1 — `patrol` 8.0 → 12.0 rev/min
with 7 oscillation windows portrait never produces; `furball` 10.0 → 13.5."* That was measured with
camtrace admitting at a hardcoded 700 wu in both orientations. With each profile's own `admitWu`:

| `shipped` arm, rev/min | portrait | landscape BEFORE (admit 700) | landscape AFTER (admit 1400) |
|---|---|---|---|
| duel | 21.0 | 18.0 | **12.5** |
| patrol | 8.0 | **12.0** | **6.0** |
| furball | 10.0 | **13.5** | **8.0** |

**Landscape is now better than portrait on every fight row, not worse.** P8B's REQUEST-13 was an
artefact of the portrait literal. Portrait's own rows are byte-identical (its `admitWu` is 700, the
value the literal held), and `control:symmetric-slew/jitter` stays 52 / 103 / 680 in both.

### 12.3 Found, verified, NOT fixed — with why

| where | shape | why not |
|---|---|---|
| `tools/camtrace.mjs:186-200` — the `scripted` programme's 17 absolute wu box widths | C | REQUEST-9 already. The `matchAhead` mapping §7.2 built applies directly, but it is a 17-entry rewrite, not the one-line class the sweep was for. |
| `tools/camtrace.mjs:392,404` — Z4's `rng.range(600,1600)` wu box | C | In a 1212 wu frame a 600 wu box demands z ≈ 1.72, above the current zoom, so the trial is counted as deadbanded and skipped — **Z4 largely empties out in landscape**. Needs the same treatment as `scripted` and the same judgement about resizing a fixture. REQUEST-12. |
| `tools/pages/sky.html:26` — `worldH: 1000` literal while `w`/`h` are query-driven | B | `skygate --w 844 --h 390` therefore renders at 0.39 px/wu instead of 0.696. **The landscape A4 failure P8B reported may be measured on a frame the game never draws.** That is P3/P16 territory (REQUEST-7) and re-opening it would change an art verdict, so it is reported, not touched. REQUEST-13. |
| `tools/hudfalsify.mjs:103,105` — `runCdp({bug:'zoom'/'input'})` never receive `mode` | D | H4's and H12's browser break-switches always run 390×844, so landscape has no falsification for either. In scope in spirit but they are CDP arms and each costs a browser run; recorded. REQUEST-14. |
| `tools/p8duelbox.mjs:36`, `tools/p8probe.mjs:33` — no `--mode` at all | C | Both are portrait-only by construction. Adding the arm is P8B's additive pattern; not this phase's list. REQUEST-15. |
| `tools/framegate.mjs:53` — `W=390,H=844` and portrait-aspect reference crops | C | The blind art critic renders to an aspect the primary orientation never shows. D64/P16 own it. REQUEST-16. |
| `js/gfx/clouds.js:37-44` — `CELL_W/H 900`, comment *"one cell ≈ two portrait screens"* | C | Sized against 462×1000. In 1212×560 the grid gives ~1.35 cells across against 0.51 and 0.62 down against 1.11 — **this is a candidate cause of skygate A4's landscape failure**, alongside the `sky.html` defect above. Shipped `js/**` art code; P16, and it wants the `sky.html` bug fixed first or it will be tuned against a wrong frame. REQUEST-17. |
| `js/core/input.js` `view:change` — refreshes `stickR` but not `axisX/axisY` or the anchor | D | **The only shape-D instance in shipped code**, and it is currently propping up a green assert: `orient.mjs`'s *"the held stick survives every rotation"* passes **because** the axis is stale. Its fixed 60 px drag is 0.74 R in portrait and > 1.0 R in landscape, so fixing input.js turns that assert red. Two changes that must land together, and neither is on this phase's list. **REQUEST-18, and it is the most consequential thing left.** |
| `js/core/camera.js:193` — framing-box lead point uses a hardcoded `0.5` s | C | A second, unnamed lead constant beside per-profile `leadSeconds` (0.27 / 0.39). It feeds `solveZoom` and no profile field controls it; in a 560 wu column it inflates `box.h` far more than in a 1000 wu one. REQUEST-19. |
| `sep = 1400` as a literal in `p8engage`, `gates_portrait`, `p8clead` | B | `zoomLockRange` copied. Identical in both profiles today; the day they diverge, "engagement" is defined by portrait's radius in both orientations and **every ENGAGED percentile in P0/P2/P4c shifts silently**. LATENT, and the highest-value latent one. REQUEST-20. |
| `js/gfx/sky.js:173,362`, `js/sim/crates.js:935`, `layout.js`'s shared px metrics, `tools/pages/harness.js:15-18` | C | Latent or art-side; `p8bslots` already prints the shared-px table. Listed for completeness. |

### 12.4 The method note, because it is the point

**Grep found the candidates; only running them found the bugs.** #3, #4 and #7 are indistinguishable
from correct code on the page — `0.7801` and `700` look like thresholds, not like one profile's
constants — and #6 is a *comment* that was true when written. The three found earlier were the same.
**The way to find the rest of this class is to move a constant and watch what goes red**, which is
what D128's `zoomWide` did for three files and D129's `admitWu` has now done for four more.

---

## R — REQUESTs (I do not edit DECISIONS / ARCHITECTURE / MANAGER_STATE / BUILD_PLAN / P8_NOTES / P8B_NOTES)

- **REQUEST-1. P3's fourth term is the VIEWPORT, and D128 calls it stable when it is not.**
  `scale = view.h / worldH`. At the blessed constants any landscape frame shorter than
  **389.84 css px** fails P3; the reference 390 clears by **0.16 px**, and a rotated iPhone SE
  (568×320) reads **27.9 px**. Every gate on this project measures at 844×390 and P8B_NOTES §13.6
  already records that nothing has been checked on a real phone. `tools/p3guard.mjs` prints the
  critical height on every run. **This wants a decision — either a minimum supported landscape
  height, or P3 re-expressed against `min(supported h)` rather than the reference device.**
- **REQUEST-2. `FRAMING.hullWu` was a second copy of the enemy hull and is now imported.** Recorded
  because it moves p90 box W 935.6 → 938.6 wu in *both* orientations and therefore moves portrait's
  P0 (−0.3602 → −0.3615, FAIL either side). If the manager wants D128's hull to be landscape-only,
  it cannot be — the hull is an ART §3.4 constant and the framing box is orientation-blind.
- **REQUEST-3. `leadSeconds` needs to be a PAIR, and one scalar provably cannot do it.** §4.2: the
  binding axis is X in portrait (0.158 s) and DIVE in landscape (0.394 s), and the x/dive budget
  ratio **inverts by 7.2×** between the profiles. Landscape now ships the smaller of its own two
  budgets, so **0.24 s of horizontal lead budget goes unspent** — measured cost, 1.9 pp of
  opponent-on-screen time (§4.5). The correct answer is `leadSecondsX 0.63 / leadSecondsY 0.39`
  in landscape and `0.15 / 0.68` in portrait. **That is a new `VIEW_PROFILE` field and §4.1 is
  declared verbatim** — `playfield` is the only prior exception and it needed D100. So it is a
  manager/DECISIONS call, not an agent's, and I have not made it. This supersedes P8B REQUEST-1
  with the arithmetic it asked for.
- **REQUEST-4. Portrait `leadSeconds` 0.27 is 1.71× its own budget and I did not touch it.** The
  same derivation gives 0.15. D111 already named the cause as the HUD (`specialSlot` owns the right
  28% of the column, leaving 53.9 px of headroom), so the camera-side fix would paper over a HUD
  constraint in a first-class orientation. **The fix is moving the special to an edge**, which is
  D111's own conclusion and is P13/P16 territory. §4.6.
- **REQUEST-5. `hudcheck --cdp` is not bit-repeatable at frame resolution.** H5 landscape read
  626/2617 here against P8B's 627/2618 on the identical build. Immaterial at 23.9% and at 0.00%,
  but a criterion quoted to two decimals should say so. Portrait H12 likewise reads 890 (P7) /
  1072 (P8B) / 1193 (here) css px/min against a 2,200 cap — a spread far larger than any constant
  in this phase moved, and P8B §8.2 already records H12 as a believable-wrong metric in landscape.
- **REQUEST-6. Landscape H11 is RED at every honest thumb rest, and the cause is HUD geometry.**
  §5.3: the landscape stick zone's centre is **31 px** from the aeroplane's resting screen x
  (portrait: 71 px) and the thumb disc is 165 px across; the vertical separation is 117 px against
  portrait's 262. The rest sweep gives 31.5 / 16.7 / **50.8** / 1.8% at rests 0.35 / 0.55 / 0.75 /
  0.90, and only 0.90 clears — the position D101 rejected by name for clamping the thumb (travel
  596 → 229). **There is no rest position that honestly clears it.** The levers are `anchorX`,
  `stickZone` and `specialSlot` — a HUD/ergonomics call, the same shape as D111's conclusion about
  portrait's lead. **I have moved none of them.**
- **REQUEST-7. Sky atlas A4 (item 8) is routed to P16 unchanged.** P8B §11: worst cutout
  multiplicity **5** against a bar of 3, **161/180** frames with a repeat against portrait's
  19/180. It is the cloud atlas's variety budget sized against portrait's screen area, it is
  `ATLAS_SKY.md`'s constant and not the camera's, and D84 says no art bar blocks a phase. **Not
  touched, and none of P8c's changes move it** — A4 is a function of screen area and atlas count,
  neither of which is in this phase.
- **REQUEST-8. H11 is not stable across RUN LENGTH, not only across rest position.** Landscape read
  **8.95%, 26.02% and 50.79% across three runs on the same seed**, every one of them red. D101 established that H11 has no single
  value across rest positions; this adds that it has none across run lengths either. Any H11 number
  quoted anywhere should carry both the rest position and the duration.
- **REQUEST-9. `camtrace`'s `scripted` programme is still portrait-sized.** `shipped/scripted`
  reads 10.5 rev/min portrait against 0.5 landscape, for the same reason `jitter` did. §7.3. The
  `matchAhead` mapping §7.2 adds would apply directly; the programme is 17 absolute box widths, so
  it is a larger edit than the one this phase was asked for.
- **REQUEST-11. Three files assumed `zoomWide` was shared, and none was found by reading.**
  `layout.js` (item 6), `orient.mjs` (§9) and `camtrace.mjs`'s isolation fixtures (§7) each held a
  portrait constant or a portrait-sized literal that was inert while both profiles agreed. All
  three are repaired. **The class is not exhausted** — anything that hardcodes 0.78, 1400, 26 px or
  150 wu is the same shape, and the way to find the rest is to move a constant and watch, not to
  grep.
- **REQUEST-10. D120's admission radius LANDED at a derived 700 wu, and it halves landscape's
  in-frame warning — the quantity the pivot was decided on.** §8. Portrait P0 goes
  **−0.3615 FAIL → +0.1583 PASS** (D120's own prediction reproduced) and portrait's never-seen rate
  goes 25.7% → 28.9%; **landscape's P2 in-frame median goes 1.23 → 0.70 s and its p05 0.35 → 0.18 s**,
  against D121's pivot table quoting 1.28 s. D120's stated cost — *"0.5 percentage points of
  on-screen time"* — is correct for portrait's on-screen time and **does not mention P2 at all**,
  and §8.3's sweep shows P0 and P2 pull in opposite directions on this radius monotonically from
  440 to 1400 wu. Bounding it: landscape P2 was FAIL before and after, and the TOTAL warning median
  is invariant at 1.75 s — only the in-frame half moves, which is exactly D121's tape-and-chevrons
  resolution arriving in the other orientation. **The sweep is on file; if the 1.28 s is to be
  protected, this radius is the lever and 935 wu keeps landscape's on-screen time while failing
  portrait's P0.**
- **REQUEST-12. camtrace's Z4 largely empties out in landscape.** `rng.range(600, 1600)` wu boxes:
  in a 1212 wu frame a 600 wu box demands z ≈ 1.72, above the current zoom, so the trial is
  deadbanded and skipped. Same class as the `jitter` fixture, same `matchAhead` remedy, not applied.
- **REQUEST-13. `tools/pages/sky.html:26` hardcodes `worldH: 1000` while `w`/`h` are query-driven**,
  so `skygate --w 844 --h 390` renders at **0.39 px/wu instead of 0.696**. P8B's landscape A4
  failure (cutout multiplicity 5) may be measured on a frame the game never draws. **Do not act on
  A4 until this is fixed** — it would tune the atlas against the wrong frame.
- **REQUEST-14. `hudfalsify`'s two BROWSER switches never receive `mode`.** `hudbug=zoom` (H4) and
  `hudbug=input` (H12) always run 390×844, so landscape has no falsification for either — including
  D99's own switch, the best catch of P7.
- **REQUEST-15. `p8duelbox.mjs` and `p8probe.mjs` have no `--mode` at all** and are portrait-only by
  construction. `p8duelbox` is the tool §4.4.1's p90-box table is indexed on.
- **REQUEST-16. `framegate.mjs` renders and crops to a portrait aspect** the primary orientation
  never shows. D64/P16.
- **REQUEST-17. `js/gfx/clouds.js`'s cell grid is sized "≈ two portrait screens".** In 1212×560 the
  density per screen roughly triples horizontally and halves vertically — a candidate cause of
  skygate A4's landscape failure. Fix REQUEST-13 first.
- **REQUEST-18. The last shape-D instance in SHIPPED code, and it is propping up a green assert.**
  `js/core/input.js` refreshes `stickR` on `view:change` but leaves `axisX/axisY` and the stick
  anchor derived from the old radius. `orient.mjs`'s *"the held stick survives every rotation"*
  passes **because** of that staleness — its fixed 60 px drag is 0.74 R in portrait and > 1.0 R in
  landscape, so repairing input.js turns the assert red. **The two must land together**, and the
  assert needs re-expressing against `stickRadius(view)` rather than a fixed px drag. Most
  consequential item left.
- **REQUEST-19. `camera.js:193`'s framing-box lead point uses a hardcoded 0.5 s** — a second,
  unnamed lead constant beside per-profile `leadSeconds` (0.27 / 0.39), feeding `solveZoom` with no
  profile field controlling it. In a 560 wu column it inflates `box.h` far more than in a 1000 wu one.
- **REQUEST-20. `sep = 1400` is `zoomLockRange` copied as a literal** in `p8engage`,
  `gates_portrait` and `p8clead`. Identical in both profiles today; the day they diverge,
  "engagement" is portrait's radius in both orientations and **every ENGAGED percentile in P0, P2
  and P4c shifts silently.** The highest-value latent item.
