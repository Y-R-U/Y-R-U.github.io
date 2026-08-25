# P8b — the LANDSCAPE audit. MEASURE ONLY.

**This file is a resumable handoff, written from the first working step and updated
continuously.** At any moment it says what is measured, what the numbers are, what was in flight
and what the next concrete action is. Expect the agent writing it to be cut off.

**Scope, per D123/D124 and the brief: change no constant, fix no bug, retune nothing.** Every
control added to `tools/**` is an *additional* path. Nothing under `js/**` is touched. No git.

---

## STATUS

| | |
|---|---|
| phase | **EVERY node-side and Chrome-side gate has been run in both orientations.** Only `skygate.mjs` (P3 sky) and `framegate.mjs` (blind art critic) are unrun — see §2. |
| in flight | nothing — a clean stopping point |
| **the four landscape-only reds** | **H5** (23.95%, occluded by the banner) · **skygate A4** (cutout multiplicity 5) · **`hudfalsify framepip`** (MISS) · **`camtrace symmetric-slew/jitter`** (break-switch inert). Everything else that runs, passes. |
| **headline 1** | **H5 FAILS IN LANDSCAPE — 23.95% of frames, occluded by the objective banner.** Cause is exact: `landscape.playfield.top = 0.06` where the derivation that produced portrait's 0.05 gives **0.1164**. A shipped playability bug in the new primary orientation. §8.1. |
| **headline 2** | **`leadSeconds` is portrait-fitted on the WRONG AXIS.** Matched to portrait as a fraction of frame *width* (D108); applied to the vertical it is **4.63× larger a fraction of landscape's frame**, and clips on **25.9% of engaged ticks against portrait's 0.0%**. §4. |
| **headline 3** | **The thumb cannot reach full nose-down deflection in landscape (39.7% of it)** — `STICK_R_FRAC × view.w` uses the long edge. **H12 reads *better* for that reason**, so its landscape pass is not evidence. §8.2. |
| **headline 4** | **Z1–Z3 have no working break-switch in landscape.** `symmetric-slew/jitter` goes 52 rev/min → **0**, 680 osc windows → **0**: the fixture saturates landscape's solve. `ZOOM_BIAS` is inert in landscape at every box camtrace probes. §6. |
| tools written | `tools/p8blead.mjs`, `tools/p8bslots.mjs` (new); additive `--mode`/`mode` arms on `camtrace.mjs`, `p8stability.mjs`, `hudcheck.mjs`, `hudcdp.mjs`, `hudfalsify.mjs`; a per-tick clip recorder in `p8engage.mjs`. **Every default is unchanged and every portrait number was re-run as a regression check.** |
| next concrete action | **`anchorYThreatAbove`** — the one profile field no fixture isolates (§13). Then `hudcheck` H8/H8b, which still hardcode a 390×844 chevron screen. |

### Reproduce everything in this file
```
node tools/p8blead.mjs --geometry        # the closed-form table, instant
node tools/p8blead.mjs --runs 16         # + measured clip accounting + break-switch (~40 s)
node tools/gates_portrait.mjs            # already measures both orientations
node tools/p8bslots.mjs                  # every HUD slot, both modes, instant
node tools/camtrace.mjs --mode landscape # Z1-Z6 (was portrait-only)
node tools/p8stability.mjs --runs 16 --mode landscape
node tools/hudcheck.mjs --node --mode landscape
node tools/hudcheck.mjs --cdp --secs 40 --mode landscape   # <-- H5 goes RED here
node tools/hudfalsify.mjs --mode landscape                 # <-- framepip goes MISS here
node tools/skygate.mjs --w 844 --h 390                      # <-- A4 goes RED here
node tools/orient.mjs ; node tools/statecheck.mjs
node tools/sim.mjs --gates               # orientation-blind by construction — see §2
```

### What I changed, exhaustively
**Nothing under `js/**`. No git. No constant, in any file.** In `tools/`:
`p8engage.mjs` — five per-tick arrays recording `camera.js`'s existing clip/cap getters;
`camtrace.mjs` `p8stability.mjs` `hudcheck.mjs` `hudcdp.mjs` `hudfalsify.mjs` `skygate.mjs` — a `--mode` (or `--w`/`--h`) flag
whose default reproduces the shipped numbers exactly (verified by re-running portrait on each);
`p8blead.mjs` `p8bslots.mjs` — new, measurement-only.

---

## 1 — THE TABLE

Portrait 390×844 → `worldH 1000`, scale 0.8440 px/wu, **worldW 462.09 wu**.
Landscape 844×390 → `worldH 560`, scale 0.6964 px/wu, **worldW 1211.90 wu**.

| constant | portrait | landscape | fitted to portrait? | evidence |
|---|---|---|---|---|
| `leadSeconds` **horizontal** | 0.27 | 0.70 | **no — landscape is the ORIGIN of the fraction** | 0.27×280 = 75.6 wu = **16.4% of frame W**; 0.70×280 = 196 wu = **16.2%**. D108 fitted *portrait to landscape*, so re-applying D108 to landscape is a no-op by construction. **The circularity is the finding.** |
| `leadSeconds` **vertical** | 0.27 | 0.70 | **YES — badly. The headline.** | Same constant drives `leadY`, but landscape's frame is **560 wu** tall against portrait's **1000**. Vertical lead as a fraction of the frame is `0.70/560` ÷ `0.27/1000` = **4.63× larger in landscape**. Measured: vertical clip **0.0% portrait / 25.9% landscape** of engaged ticks. |
| `leadMax` | 162 | 420 | **no — equivalent, and inert in both** | 162/462.09 = **35.1%** of frame; 420/1211.90 = **34.7%**. Binds at `leadMax/leadSeconds` = **600 wu/s = 90.0 m/s in BOTH** — above level top speed (F4, 61.5 m/s). Measured **0 cap ticks out of 52,078 engaged, both orientations.** D110's "it needs a Vne dive to bind" holds in landscape too. |
| `playfield.left` | 0.11 | 0.03 | not portrait-fitted, but **derived from a stale premise** | Portrait 0.11 is "the altitude tape's gutter, (6+34)/390 = 0.103". **D103 moved the tape to the RIGHT** and `playfield.left` was never re-derived; landscape's 0.03 is unexplained by any comment. |
| `playfield.right` = `specialSlot.x` | 0.72 | 0.82 | **portrait-costed, landscape uncosted** | Playfield width **0.610 of frame = 281.9 wu portrait**; **0.790 = 957.4 wu landscape**. D111 costed portrait's 28%; landscape gives up 18% of its column and nobody has measured what that costs. |
| **`playfield.top`** | 0.05 | 0.06 | **YES, and it is a live bug — H5 FAILS at 23.95%** | Portrait's is derived: *"under the objective / wind row, 40.6/844 = 0.048"* → 0.05, and the banner's bottom edge is at **40.57 px < 42.20 px**, so it clears. Landscape's banner bottom is at **45.40 px = 0.1164 of frame** against a `playfield.top` of **23.40 px = 0.06** — **the banner sits inside the playfield**, and the camera puts the aeroplane under it on **627/2618 frames**. The same derivation gives ≥ **0.1164**. §8.1. |
| `playfield.bottom` | 0.86 | 0.86 | **shared and correct** | Both are `1 − COAM_FRAC 0.14` exactly. Playfield height **0.810 → 810 wu portrait / 0.800 → 448 wu landscape**. |
| `anchorX` | 0.34 | 0.30 | no — landscape is *roomier* | Horizontal headroom before the clamp bites = `anchorX·pfW − hull/2/worldW`: portrait **0.138 of frame = 53.9 px = 63.8 wu**; landscape **0.211 = 177.7 px = 255.2 wu**. |
| `anchorY` | 0.62 | 0.55 | not directly, but see below | Rest position resolves to frame **0.552 portrait / 0.500 landscape**. |
| `anchorYClimb` | 0.78 | 0.70 | **YES, via `leadSeconds`** | Climb headroom **162 wu portrait / 118 wu landscape**; the climb lead exhausts it at vy = **90.1 m/s portrait (unreachable — best climb is 14.5 m/s) vs 25.4 m/s landscape (routine)**. |
| `anchorYDive` | 0.30 | 0.34 | **YES, via `leadSeconds`** | Dive headroom **227 wu portrait / 136 wu landscape**; dive lead exhausts at vy = **126.1 m/s portrait (above Vne 93) vs 29.2 m/s landscape**. This is the mechanism behind the 25.9% vertical clip. |
| `anchorYThreatAbove` | 0.75 | 0.66 | unmeasured — needs a threat-above fixture | not exercised by the duel fixture in a way this harness separates yet. **NOT YET DONE.** |
| `worldH` | 1000 | 560 | n/a — it is the profile's premise | scale = h/worldH. |
| `zoomLockRange` | 1400 | 1400 | **shared, and a defect in both (D120)** | unchanged; D120 stands. |
| `zoomWide` / `zoomFill` | 0.78 / 0.85 | 0.78 / 0.85 | shared; D124 already owns these | D124's verified lever is `zoomWide` 0.78 → 0.74 **plus** hull ≥ 66 wu. |
| **`STICK_R_FRAC` = 0.208** (`viewprofile.js:113`) | radius **81.12 px** | radius **175.55 px** | **YES — the worst one in the file, and it is not even in the profile table** | `stickRadius(view.w)`, and `view.w` is the LONG edge in landscape. DESIGN's 0.208 is a fraction of a **portrait** canvas whose stick zone is the full width. Landscape's zone is 0.46 of the width, so the radius is **2.16× larger inside a zone 0.84× as tall**. Full pitch deflection needs **175.55 px of a 273 px zone (64%)** against portrait's **81.12 px of a 464 px zone (17%)**. Flagged in `P2_NOTES` §R-12 and never refined. |
| `stickZone` | `{0,0.45,1.00,0.55}` → 390×464 px | `{0,0.30,0.46,0.70}` → 388×273 px | **no — the slot itself is sized for landscape** | 61.9×73.7 mm vs 61.6×43.3 mm. The *zone* is fine; what does not fit in it is the stick (above). Stick **diameter / zone width: 0.42 portrait vs 0.90 landscape**. |
| `specialSlot` | `{0.72,0.30,0.24,0.12}` → 93.6×101.3 px | `{0.82,0.62,0.14,0.22}` → 118.2×85.8 px | no — both are ~0.03 of frame area | 14.9×16.1 mm vs 18.8×13.6 mm — the same physical button, rotated. **But it is also `playfield.right`, which costs portrait 28% of its column and landscape 18%.** |
| `altTape.w` | 34 (`side:'left'`, overridden RIGHT by D103) | 30 (`side:'right'`) | no, but the tape's *length* is | 5.4 mm vs 4.8 mm wide — comparable. Usable length **530 px (0.63 of frame H) vs 240 px (0.61)** — the same fraction of a frame that is **2.16× shorter**, so landscape's tape is **38.0 mm long against portrait's 84.2 mm** for the same 0–10,000 wu column. D121 leans on the tape as portrait's compensation; in landscape it is less than half the instrument. |
| `radioCard` | `{0,0.06,1.00,0.14}` → 390×118 px | `{0.02,0.06,0.42,0.16}` → 354×62 px | no — deliberately different shapes | 61.9×18.8 mm vs 56.3×9.9 mm. `CARD_MAX_CHARS: 44` is shared and landscape's card is 9.9 mm tall. Unverified whether 44 chars fit; needs the browser. |
| `METRICS.COAM_FRAC` = 0.14 | 118.2 px = **18.8 mm** | 54.6 px = **8.7 mm** | **YES — a fraction where a physical size was meant** | ART §10's "the bottom 14% of the **portrait** frame". The coaming holds the speed arc (`ARC_R 46`, an absolute 92 px diameter) inside 54.6 px of height in landscape. `resolveLayout` splits it into two corners, but the height is unchanged. |
| `METRICS.THUMB_DISC` = 165 px | 0.42 of frame W / 0.20 of frame H | 0.20 of frame W / **0.42 of frame H** | shared px, so it is the *same thumb* — correct by construction | H11's 44 mm contact. Reported because it is the one shared absolute that *should* be shared. |
| `RANGES.PIP_RANGE_WU` | 1400 | 1400 | **latent, structural** | `layout.js:157-158` reads **`VIEW_PROFILE.portrait.zoomLockRange`** *by name*, in both orientations. Identical today; a hard portrait dependency the instant D120's derived admission radius differs per profile. The comment above it cites D72 — "imported rather than copied, because a second copy drifted" — and then names the portrait profile. |

---

## 2 — WHICH GATES RUN IN LANDSCAPE — the inventory, after running every one

**Verdict line: 4 things go RED or MISS in landscape that are green in portrait — H5 (23.95%,
occluded by the banner), `skygate` A4 (cutout multiplicity 5 against a bar of 3),
`hudfalsify`'s `framepip` switch (MISS), and `camtrace`'s `symmetric-slew/jitter` break-switch
(inert). Everything else that runs, passes.**

| gate | landscape? | result | portrait-fitted numbers inside it |
|---|---|---|---|
| `sim.mjs --gates` | **N/A — orientation-blind** | 14/14 PASS | **None, and it cannot have any.** `sim.mjs` imports no `viewprofile.js` and no `camera.js`. F6 (263 wu turn) and F7 (585 wu dive recovery) are world-space and feed the geometry gates from outside. A gate that cannot see the orientation is not evidence about it — but it is also not at risk from the pivot. |
| `sim.mjs --fixtures` | N/A | 9/9 PASS | none |
| `sim.mjs --envelope` | N/A | runs | none |
| `corecheck.mjs` | **N/A — static source check** | PASS | none |
| `statecheck.mjs` (Chrome) | N/A — shape/save/quality | **15/15 PASS** | none |
| `orient.mjs` (Chrome) | **already bi-orientational** | **6/6 PASS**, 20 rotations | none; §9a |
| `gates_portrait.mjs` | **already measures both** | P0/P2/P3c break in both; §3 | it *is* the comparison |
| `p8engage.mjs` | **YES** (`--mode`) | fixture identical in both by construction | none |
| **`camtrace.mjs`** | **was portrait-only — added `--mode`** | **Z4/Z5/Z6 PASS both. Z1–Z3 WORSE in landscape and its main break-switch is INERT.** §6 | the `jitter` and `scripted` fixtures' box amplitudes; the bias probe's 378 wu box |
| **`p8stability.mjs`** | **was portrait-only — added `--mode`** | PASS both; PUMP margin 6× thinner, gone at `--runs 8`. §10 | the arm table's sample size |
| **`hudcheck.mjs --node`** | **H6/H7 were portrait-only — added `--mode`** | **15/15 PASS both** | H6's tape rect literal; H7's 390×844; **H8/H8b still hardcode 390×844** |
| **`hudcheck.mjs --cdp`** | **H4/H5/H11/H12 were portrait-only — added `mode`** | **portrait 8/8; landscape 7/8, RED: H5 at 23.95%.** §8 | H5 depends on `playfield.top`; H11/H12 on `stickRadius(view.w)` |
| **`hudfalsify.mjs`** | **H7 arms were portrait-only — added `--mode`** | portrait 10/10 RED; **landscape 9/10, `framepip` MISS.** §9 | `framepip`'s premise that the frame gives no warning |
| **`skygate.mjs`** | **was portrait-only — added `--w`/`--h`** | **portrait 3/3; landscape 2/3, FAIL: A4.** §11 | A4's cutout-variety budget was sized against the portrait screen area |
| `framegate.mjs` | **NO** — blind art critic (D64), needs the renderer and critic agents | not run | out of scope for a measure-only pass |
| `touch.mjs` / `cdp.mjs` / `blind.mjs` / `shot.mjs` | harnesses, not gates | — | — |
| `verify_sfx.mjs` | audio | — | none |

---

## 3 — `gates_portrait.mjs`, re-run 2026-08-25, 32 duels / 121 engagements

Reproduced from the shipped tool, unmodified. Matches `shots/portrait/gate.json` in kind.

| # | portrait | landscape |
|---|---|---|
| P0 @0.85 fill | **FAIL** −0.2124 | **NEITHER** in-clamp 0.0337 |
| P0 @0.90 fill | **FAIL** (width binds) | **PASS** 0.0815 |
| P1 | NEITHER (263 wu in the bar gap) | NEITHER (same) |
| P1b | PASS, never binds (z ≤ 1.4530) | PASS, binds but clears `zoomWide` (z ≤ 0.8137) |
| P2 | **FAIL** in-frame median **0.03 s**, 25.7% never seen | **FAIL** in-frame median **1.28 s** ✓, **p05 0.28 s** ✗, 2.6% never seen |
| P3 | PASS 42.1 px @`zoomWide` | PASS **34.8 px @`zoomWide` — 2.4% over the 34 px bar** |
| P3b | PASS but **VACUOUS in both** | PASS but VACUOUS |
| P3c | **FAIL** 0/121 | **FAIL** 1/121 |
| P4c | PASS 2.19 unexpl/min, 0.00% PUMP | PASS **3.36** unexpl/min, 0.00% PUMP |
| P6 | PASS 8.4% | PASS 11.1% |
| P9 | PASS (delegated F14) | PASS |

**Landscape breaks that are landscape's own, not carried:** P3's 2.4% margin (D124's hull ≥ 66 wu
lever eats it — worth flagging, the two levers interact), and P2's p05.

---

## 4 — THE LEAD, MEASURED (`tools/p8blead.mjs`)

### 4.1 The closed form, validated against an independently recorded number

`camera.js:428-429` places the aeroplane at `pf.left + anchorX·pfW − leadX/visW` and then clamps its
own box inside the playfield. So the room the lead has before the clamp bites is

> `headroomX = anchorX·(playfield.right − playfield.left) − hull/2/worldW`  (frame fractions)

**Portrait: 0.34×0.610 − 0.0692 = 0.1382 of frame = 53.9 px.** D111 recorded **54 px** independently,
and D111's "used up above ~35 m/s" against this formula's **35.5 m/s**. The formula reproduces two
numbers it was not fitted to, which is why the landscape column below is trustworthy.

| | PORTRAIT | LANDSCAPE |
|---|---|---|
| playfield x | [0.11, 0.72] = 0.610 of frame = **281.9 wu** | [0.03, 0.82] = 0.790 = **957.4 wu** |
| playfield y | [0.05, 0.86] = 0.810 = **810 wu** | [0.06, 0.86] = 0.800 = **448 wu** |
| horizontal headroom | **0.138 frac / 53.9 px / 63.8 wu** | **0.211 / 177.7 px / 255.2 wu** |
| lead at 280 wu/s cruise | 75.6 wu = **0.164 of frame**, 0.268 of playfield, **1.184 of headroom** | 196 wu = **0.162 of frame**, 0.205 of playfield, **0.768 of headroom** |
| speed where lead = headroom | **236 wu/s = 35.5 m/s** | **365 wu/s = 54.7 m/s** |
| `leadMax` frac of frame | 162/462 = **0.351** | 420/1212 = **0.347** |
| speed where `leadMax` binds | **600 wu/s = 90.0 m/s** | **600 wu/s = 90.0 m/s** |
| CLIMB headroom | 0.162 frac = **162 wu** | 0.211 = **118 wu** |
| DIVE headroom | 0.227 = **227 wu** | 0.243 = **136 wu** |
| vy where climb lead exhausts | **90.1 m/s** — unreachable (best climb 14.5 m/s, F3) | **25.4 m/s** — routine |
| vy where dive lead exhausts | **126.1 m/s** — above Vne 93 (F5) | **29.2 m/s** — routine |

### 4.2 Measured — 16 duels, 62 engagements, 52,078 engaged ticks of 130,774 (39.8%)

The sample is **identical in both orientations by construction** (the sim is orientation-blind and
segmentation depends only on separation), so every difference below is the profile and nothing else.

| | PORTRAIT | LANDSCAPE |
|---|---|---|
| speed p50 / p90 | 46.1 / 63.2 m/s | same |
| clip ticks (clamp discarded lead) | 44.9% | **47.8%** |
| ...**horizontal** | **44.9%** | **23.5%** |
| ...**vertical** | **0.0%** | **25.9%** |
| `leadMax` cap ticks | **0** | **0** |
| lead discarded, mean px/tick x | 14.95 | 11.42 |
| lead discarded, mean px/tick y | **0.00** | **10.72** |
| x discard p90 on clipped ticks | 62.8 px | 77.8 px |

**Portrait's vertical lead never clips once in 52,078 ticks — it is exactly 0.00 px — and
landscape's clips on a quarter of them.** That is `leadSeconds` being fitted on the width axis while
being applied to both, against a frame that is 0.56× as tall and 2.62× as wide.

### 4.3 Break-switch — the clip counter is falsified in both directions

`leadSeconds` forced via a **cloned** profile (`VIEW_PROFILE` is never mutated), same 16 duels:

| `leadSeconds` | portrait clipX% / clipY% | landscape clipX% / clipY% |
|---|---|---|
| 0 (no lead) | **0.0% / 0.0%** | **0.0% / 0.0%** |
| 0.27 (shipped portrait) | 44.9% / **0.0%** | **0.0% / 0.3%** |
| 0.70 (shipped landscape) | **81.8%** / 0.9% | 23.5% / **25.9%** |
| 2.0 | 92.9% / 7.5% | 74.4% / 53.9% |

Driven to zero and to saturation, monotone in between, and it moves when the *other* profile's value
is substituted. This counter is evidence. (Contrast D109, where "is the aeroplane touching the
bound" read 0.0% while the clamp did two-thirds of the work.)

**Read the second row across:** landscape at portrait's `leadSeconds` clips essentially never
(0.0% / 0.3%) — so landscape's 0.70 is not merely unmeasured, it is the *only* reason landscape's
camera fights its own clamp at all.

---

## 5 — THE HUD SLOTS, MEASURED (`tools/p8bslots.mjs`)

Resolved through the shipped `resolveLayout()` — nothing re-derived from the profile table — at
390×844 and 844×390 with no safe insets. mm at a nominal 160 css-px/inch.

### 5.1 The stick is the finding

| | PORTRAIT | LANDSCAPE |
|---|---|---|
| `stickRadius(view.w)` = `max(36, w×0.208)` | **81.12 px = 12.9 mm** | **175.55 px = 27.9 mm** |
| stick **diameter** / `stickZone` width | 162.2 / 390.0 = **0.42** | 351.1 / 388.2 = **0.90** |
| stick **radius** / `stickZone` height | 81.1 / 464.2 = **0.17** | 175.6 / 273.0 = **0.64** |
| radius as a fraction of frame height | 0.10 | **0.45** |
| `THUMB_DISC` (H11's 44 mm contact) | 165 px | 165 px |

**`STICK_R_FRAC` is not in `VIEW_PROFILE` at all** — it is a single module-level constant in
`viewprofile.js:113` multiplied by `view.w`, which is the *short* edge in portrait and the *long*
edge in landscape. `input.js:189` divides raw thumb displacement by that radius, so the axis gain is
**2.16× lower in landscape**: full pitch deflection costs **175.55 px of thumb travel inside a
273 px-tall zone (64% of it)**, against portrait's **81.12 px inside 464 px (17%)**. The whole
thumb contact disc H11 models (165 px) is **smaller than landscape's stick radius**.

**This was already known and is still shipped.** `docs/P2_NOTES.md` §R-12: *"DESIGN's 0.208 was a
fraction of a 432-wide portrait canvas whose stick zone is the full width; landscape's `stickZone`
is only 0.46 of the width … this is the note saying it will need refining for landscape — most
likely as a fraction of `min(zone.w, zone.h)` rather than of `view.w`."* P7's T8 was to refine it and
did not. Under D123 it is no longer a desktop curiosity; it is the primary control law.

### 5.2 Every other slot, resolved

| slot | portrait px (mm) | landscape px (mm) | reading |
|---|---|---|---|
| `stickZone` | 390×464 (61.9 × 73.7) | 388×273 (61.6 × 43.3) | zone itself is sensibly re-proportioned |
| `special` | 93.6×101.3 (14.9 × 16.1) | 118.2×85.8 (18.8 × 13.6) | same physical button rotated; both 0.03 of frame area |
| `radioCard` | 390×118 (61.9 × 18.8) | 354×62 (**56.3 × 9.9**) | `CARD_MAX_CHARS: 44` is shared against a card **half as tall** |
| `tape` | 34×530 (5.4 × **84.2**) | 30×240 (4.8 × **38.0**) | same 0–10,000 wu column in **45% of the length** |
| `coaming` | 390×118 (61.9 × **18.8**) | 2 × 287×55 (45.6 × **8.7**) | `COAM_FRAC 0.14` is ART §10's fraction of the **portrait** frame |
| `banner` | 327×22 | 407×22 | `BANNER_H 22` absolute; the derived-row branch in `resolveLayout` handles the difference correctly |
| `wind` | 60×22 | 60×22 | absolute in both; 0.15 vs 0.07 of frame width |

**Legality is clean in both**: every element is inside the safe playfield and the only overlapping
pairs are `coaming/arc`, `coaming/belt`, `coaming/engine`, `coaming/stress` (portrait) and the
`coaming2` equivalents (landscape) — those are elements drawn *inside* the coaming, which is what
they are supposed to be. **No landscape layout is illegal.** What differs is physical size.

### 5.3 Shared absolute metrics, as a fraction of their own frame

| metric | portrait | landscape |
|---|---|---|
| `COAM_FRAC` 0.14 of frame H | 118.2 px = **18.8 mm** | 54.6 px = **8.7 mm** |
| `ARC_R` 46 px (speed arc) | 0.24 of frame W, fits 118 px coaming | 0.11 of frame W, **92 px diameter inside a 54.6 px coaming** |
| `TAPE_TOP_FRAC` 0.22 of frame H | 185.7 px | 85.8 px |
| `FONT_MIN` 15 px | 0.02 of frame H | 0.04 of frame H |
| `PREDICT_MAX` 190 px | 0.49 of frame W | 0.23 of frame W |
| `CHEV_INSET` 12 px | 0.03 of frame W | 0.01 of frame W |

`ARC_R` is the sharpest of these: the speed arc is a 92 px-diameter absolute object and landscape's
coaming is 54.6 px tall. `resolveLayout` places it at `coaming.y + coamH − COAM_PAD` so the arc's
top half is **above the coaming, over the playfield** — legal (the arc's element box is
`arcBox`, half-height) but it means the coaming's contents are sized for portrait's 118 px band.

### 5.4 The one hard portrait dependency in `js/ui/`

```
layout.js:157   PIP_RANGE_WU:  VIEW_PROFILE.portrait.zoomLockRange,
layout.js:158   CHEV_RANGE_WU: VIEW_PROFILE.portrait.zoomLockRange * 2,
```

Read by name, in both orientations. Numerically harmless today (both profiles are 1400), and the
comment directly above it warns about exactly this class of bug (D72). **D120 is about to derive a
new admission radius**; if it becomes per-profile, the altitude-tape pips and the edge chevrons keep
portrait's. The same radius is already **6.06 half-frame-widths in portrait and 2.31 in landscape**.

---

## 6 — `camtrace.mjs` IN LANDSCAPE (Z1–Z6) — added a `--mode` arm

`makeView` already took a `mode`, but all six call sites passed no argument and there was no flag,
so **Z1–Z6 had only ever been measured in portrait.** Added additively: `--mode`, `--w`, `--h`,
defaults unchanged, so every prior number reproduces byte-for-byte.

```
node tools/camtrace.mjs                       # portrait, exactly as before
node tools/camtrace.mjs --mode landscape
```

### 6.1 Z1–Z3, both profiles, identical fixtures (bar ≤ 6 reversals/min)

| arm / scenario | rev/min P → L | gapViol P → L | oscWindows P → L |
|---|---|---|---|
| shipped/static | 0 → 0 | 0 → 0 | 0 → 0 |
| shipped/jitter | 0 → 0 | 0 → 0 | 0 → 0 |
| shipped/scripted | **10.5 → 0.5** | 6 → 0 | 0 → 0 |
| shipped/duel | **21.0 → 18.0** | 7 → 1 | 0 → 0 |
| shipped/patrol | **8.0 → 12.0** | 3 → 4 | **0 → 7 @ amp 0.15** |
| shipped/furball | **10.0 → 13.5** | 4 → 4 | 0 → 0 |
| **control:symmetric-slew / jitter** | **52.0 → 0.0** | **103 → 0** | **680 → 0** |
| control:symmetric-slew / furball | 16.5 → 21.5 | 11 → 13 | 55 → **92** |
| control:strict-margin / scripted | 10.5 → 0.5 | 6 → 0 | 0 → 0 |
| control:sticky-members / scripted | 10.5 → 0.5 | 6 → 0 | 0 → 0 |
| control:no-enforcement / scripted | 10.5 → 0.5 | 6 → 0 | 0 → 0 |
| control:track-everything / furball | 0 → 1.0 | 0 → 0 | 0 → 0 |

**Two things, and the second is the important one.**

1. **On the fight scenarios landscape is WORSE, not better.** `patrol` 8.0 → 12.0 rev/min and it
   produces **7 oscillation windows at amplitude 0.15 that portrait never produces at all**;
   `furball` 10.0 → 13.5. Every one of these was already over the ≤ 6 bar in portrait (D114/D119's
   whole subject) and landscape does not rescue them.

2. **The break-switch that produces camtrace's largest signal is INERT in landscape.**
   `control:symmetric-slew/jitter` — the arm that genuinely pumps — reads **52 rev/min, 103 gap
   violations and 680 oscillation windows in portrait, and 0 / 0 / 0 in landscape.** Its zoom trace
   in landscape runs 1.02 → 1.22 and sticks (`zoomMean` 1.22); in portrait it swings 0.96–1.21
   around a mean of 1.08.

   The cause is in the tool's own comment on that fixture: *"sized so the SOLVED zoom sits mid-range
   rather than pinned on the clamp: a wobble that never moves the clamped target proves nothing,
   which is how a test quietly becomes vacuous."* The `jitter` box is a member 150 wu ahead wobbling
   ±30%. Against portrait's 462 wu frame that lands mid-range; against landscape's 1212 wu frame the
   solve saturates at `zoomIntimate` and the wobble moves nothing. **The fixture was sized to
   portrait, and in landscape it is vacuous by the criterion its author wrote down.** The same
   collapse hits `scripted` on three separate control arms (10.5 → 0.5 rev/min).

   This is D118's finding in a new place: **a control that cannot go red is not evidence.** Under
   D123 that means Z1–Z3's falsification does not currently exist for the tuning target.

### 6.2 `ZOOM_BIAS` is completely inert in landscape

`solveCheck()`'s bias probe, all twelve rows (`{tight,normal,wide} × {latch,strict} × {with member,
alone}`), settled zoom:

| bias | portrait latch | portrait strict | landscape latch | landscape strict |
|---|---|---|---|---|
| `tight` +0.10 | 1.1206 | 0.9670 | **1.2005** | **1.0367** |
| `normal` 0.00 | 1.0207 | 0.8827 | **1.2005** | **1.0367** |
| `wide` −0.08 | 0.9406 | 0.8167 | **1.2005** | **1.0367** |

**Portrait separates the three biases cleanly; landscape returns the same two numbers for all
three — and they are the same numbers as the `alone:` rows**, i.e. the framing member makes no
difference either. The probe's comment says it went looking for a box "where bias is visible" and
settled on a member 160 wu ahead giving a ~378 wu box. In landscape that box solves to
`zoomNeeded = 1211.9 / (378/0.85) = 2.72`, saturates at `zoomIntimate 1.22`, and the bias is added
and then clamped away. **The box size at which landscape's bias would be visible is ~990 wu**
(2.62× portrait's, exactly the `worldW` ratio).

Whether the *shipped game* honours zoom bias in landscape is a separate question this fixture cannot
answer — the solver's width term is saturated for every box up to 700 wu in landscape (§6.3), so
the honest statement is: **at every box width camtrace probes, the player's persistent zoom
preference has no effect in landscape.**

### 6.3 The §4.3.1 solve table — landscape's width term never binds

`solveCheck()` prints `zoomNeeded = worldW / (boxW / zoomFill)` for a sweep of box widths:

| `boxW` | portrait zoomNeeded → clamped | landscape zoomNeeded → clamped |
|---|---|---|
| 200 | 1.9639 → 1.22 | 5.1506 → 1.22 |
| 273 (F6 turn) | 1.4387 → 1.22 | 3.7733 → 1.22 |
| 320 | 1.2274 → 1.22 | 3.2191 → 1.22 |
| 460 | 0.8539 → **0.8539** | 2.2394 → 1.22 |
| 503 (auto-clamp limit) | 0.7809 → **0.7809** | 2.0479 → 1.22 |
| 585 (pivot signal) | 0.6714 → 0.78 | 1.7609 → 1.22 |
| 700 | 0.5611 → 0.78 | 1.4716 → 1.22 |

**Portrait's width term is live from 320 wu up. Landscape's is pinned at `zoomIntimate` for every
box in the sweep, including 700 wu.** That is D124's "landscape is height-bound" shown at the
solver rather than inferred from the gate: in landscape only the height term ever moves the zoom.

### 6.4 Z4, Z5, Z6 — orientation-neutral, and they run clean in landscape

- **Z4** (zoom-out never blocked): 400 trials, 0 blocked, max first-tick step 0.01833 — **identical
  in both**, both arms.
- **Z5** (`allowOutsideClamp` refused under combat control): PASS in both. The only difference is
  `zoomEstablish`, which is legitimately per-profile (**0.62 portrait / 0.42 landscape**), and Z5
  reads it from the profile rather than assuming.
- **Z6** (a stale member drops in ≤ 2 ticks): **byte-identical in both** — dropped at tick 2, zoom
  after 6 s 1.2017. Per D118 this tests a code path the game never executes, in either orientation.
- `boxWp90` is identical in every row of §6.1 because the box is world-space — the same property
  `gates_portrait.mjs` relies on for its comparison.

---

## 7 — `hudcheck.mjs --node` IN LANDSCAPE — added a `--mode` arm

**H6 and H7 hardcoded portrait** (`h6()` used the literal rect `{6, 185.68, 34, 530.16}` — which is
exactly `resolveLayout(portrait).tape` — and `h7()` had `const mode = 'portrait', W = 390, H = 844`).
H1, H13, H3, H9, H9b, H10, H10b are source/colour/text checks and are orientation-free. H8/H8b use a
hardcoded 390×844 screen for the chevron model and are **not** converted here.

Added additively (`--mode`, default `portrait`, portrait output byte-identical):
```
node tools/hudcheck.mjs --node                     # 15/15 pass, unchanged
node tools/hudcheck.mjs --node --mode landscape    # 15/15 pass
```

| | portrait | landscape |
|---|---|---|
| **H6** tape spans the column | PASS — 0 → −10,000 wu in **530 px** | PASS — in **240 px** |
| **H7** tape warns before the frame | PASS — 200/200, median lead **6.49 s** (p10 2.60, min 1.95) | PASS — 200/200, median **5.49 s** (p10 **3.27**, min **2.68**) |
| **H7b** attackers inside the cylinder | PASS 159/159, median 7.55 s | PASS 164/164, median 7.47 s |

**H7 is better in landscape at the tail and worse at the median**, which is the expected shape: the
shorter frame sees a diving attacker later, so the tape's *lead over the frame* tightens at the
median but its worst case improves. Both pass comfortably. **This is the one criterion D121 leaned
on as portrait's compensation, and it survives the pivot.**

### 7.1 What H6 does NOT test, and it is a real landscape defect

H6 checks that the tape spans 0 → −10,000 wu, has six named bands, and draws the Concord Line above
the top. It says nothing about whether a band is tall enough to label. Measured through the shipped
`tapeModel`:

| band | portrait px | landscape px |
|---|---|---|
| Mud | **37.1** | **16.8** |
| Belt | 53.0 | 24.0 |
| Floor | 68.9 | 31.1 |
| Deck | 106.0 | 47.9 |
| Lane | 132.5 | 59.9 |
| Blue | 132.5 | 59.9 |
| tape resolution | **53.0 px per 1,000 wu** | **24.0 px per 1,000 wu** |

`METRICS.FONT_MIN` and `FONT_SMALL` are both **15 px**. **Landscape's Mud band is 16.8 px tall —
1.12 lines of minimum-size type** — against portrait's 37.1 px (2.47 lines). The band name, the
numeral and the 1 px boundary rule all have to live in that. Portrait has room; landscape does not,
and **no gate currently asks.**

---

## 8 — THE BROWSER GATES IN LANDSCAPE — **H5 FAILS**

`hudcdp.mjs`'s H2 already looped all three sizes, but **H4, H5, H11 and H12 hardcoded
`cdp.viewport(390, 844)`**. Added additively (`mode`, default `'portrait'`; `hudcheck --mode` plumbs
it through). Portrait re-run first as a regression check and is unchanged.

```
node tools/hudcheck.mjs --cdp --secs 40                     # 8/8 pass
node tools/hudcheck.mjs --cdp --secs 40 --mode landscape    # 7/8 — RED: H5
```

| | portrait 390×844 | landscape 844×390 |
|---|---|---|
| H2 element-in-slot (all 3 sizes) | PASS | PASS |
| H2b no HUD/HUD overlap | PASS | PASS |
| H4 the HUD does not zoom | PASS, 0.000 px | PASS, 0.000 px |
| **H5 nothing occludes the aeroplane** | **PASS — 0/3858 = 0.00%** | **FAIL — 627/2618 = 23.95%, occluded by `{"banner": 627}`** |
| H11 thumb occlusion | PASS — swept 12.51%, disc overlap **0.00%** (cap 2%) | PASS — swept 14.51%, disc overlap **1.83%** (cap 2%) |
| H12 thumb travel/min | PASS — 1072 px/min at stickR 81.1 | PASS — **519 px/min** at stickR **175.6** |
| Hcdn same-origin | PASS | PASS |

### 8.1 H5's cause is exact, and it is `playfield.top`

`viewprofile.js` derives portrait's `playfield.top` from the objective row:
> `top 0.05 = under the objective / wind row, 40.6 / 844 = 0.048`

| | portrait | landscape |
|---|---|---|
| banner rect | y **18.57 → 40.57** px | y **23.40 → 45.40** px |
| banner bottom as a fraction of frame | **0.0481** | **0.1164** |
| `playfield.top` | **0.05** = 42.20 px | **0.06** = 23.40 px |
| is the banner inside the playfield? | **no** (40.57 < 42.20) | **YES** (45.40 > 23.40) |

**Portrait's 0.05 is 0.0481 rounded up — the derivation is exact and it works.** Landscape's 0.06
was carried and is **half the value the same derivation gives**: by the portrait rule landscape's
`playfield.top` would be ≥ **0.1164**. The banner therefore sits *inside* the region the camera is
free to place the aeroplane in, and it does, on **23.95% of frames**.

`resolveLayout` puts the banner in its second branch in landscape — beside the radio card rather
than above it, because the card starts 23 px down and leaves no 17 px gap — and the comment in
`layout.js` records that this branch was added for landscape and caught by H2b. **It was never fed
back into `playfield.top`.** This is D100's defect exactly, in the orientation D100 did not measure:
*"nothing stopped the anchors and the chrome from being the same pixels — and they were."*

**No constant touched.** The retune's job.

### 8.2 The stick cannot reach full nose-down deflection in landscape

The thumb driver bounds its offset to ±0.95 R and clamps the touch point to the stick zone. With the
shipped rest position (`thumbRest 0.75`):

| | portrait | landscape |
|---|---|---|
| `stickRadius(view.w)` | 81.12 px | **175.55 px** |
| offset needed for full deflection (0.95 R) | 77.06 px | **166.77 px** |
| stick zone | y 379.8, h 464.2 | y 117.0, h **273.0** |
| rest point (0.75 of zone) | y 727.95 | y 321.75 |
| **room DOWN to the zone edge** | 114.05 px = **148% of full deflection** | **66.25 px = 39.7%** |
| room UP | 346.15 px = 449% | 202.75 px = 122% |

**In landscape the thumb reaches at most ~40% of full nose-down deflection before it runs out of
stick zone.** Portrait has 1.48× the room it needs. This is the direct consequence of
`STICK_R_FRAC × view.w` using the long edge (§5.1) inside a zone that is 0.46 of the width and 0.70
of a *shorter* height.

**H12 reads BETTER in landscape (519 vs 1072 px/min) and that is the metric being wrong.** Travel
is lower because the thumb is clamped, not because the control is cheaper: the driver's step is
`GAIN × (want − have) × R`, so px-per-unit-axis is 2.16× *larger* in landscape and travel should
rise, not halve. A cap on thumb travel cannot distinguish "an efficient stick" from "a stick that
cannot be pushed any further" — the fifth believable-wrong metric shape on this project (D99, D105,
D109, D115). **H12's landscape pass is not evidence.**

H11's disc overlap also moves 0.00% → **1.83% against a 2% cap** — D101/D112 recorded H11 as having
no single value and being rest-position dependent; landscape's shipped rest position is 0.17
percentage points from red.

---

## 9 — FALSIFICATION IN LANDSCAPE — one switch that is RED in portrait goes MISS

`hudfalsify.mjs`'s H7 arms hardcoded portrait through `h7()`. Added the same additive `--mode`.

```
node tools/hudfalsify.mjs                     # 10/10 caught
node tools/hudfalsify.mjs --mode landscape    # 9/10 — UNCAUGHT: framepip
```

| switch | caught by | portrait | landscape |
|---|---|---|---|
| `notape` | H7 | **RED** — warned 0/60 | **RED** — warned 0/60 |
| **`framepip`** | H7 | **RED** — warned 0/60, median n/a | **MISS — warned 60/60, median lead 1.72 s** (baseline 6.12 s) |
| `nobracket` | H14 | RED | RED |
| bracket cone = fire cone | H14 | RED | RED |
| `nooutline` / `pxliteral` / `modal` / `nomerge` / audio-derived duration / no 44-char cap | H3 H1 H13 H8 H10 H9 | RED | RED (orientation-free) |

**`framepip` replaces the tape's pips with a pip derived from the frame, and H7 exists to prove the
tape warns *before the frame does*.** In portrait the frame gives so little warning that the
substitute produces zero warnings and H7 catches it. **In landscape the frame gives 1.72 s of
warning on its own, so the substitute still passes and H7 cannot tell the tape from the frame.**

This is not a bug — it is D121's finding arriving from the falsification side (landscape's in-frame
warning is 1.28 s against portrait's 0.03 s). But the consequence is the project's own rule:
**H7's falsification does not exist in landscape.** H7 still *passes* there (§7), but a passing
criterion whose break-switch stays green is not evidence, and under D123 that is the orientation
that matters. Recorded, not fixed.

## 9a — `orient.mjs` — PASS, and it is the one gate that was already bi-orientational

`node tools/orient.mjs` rotates 20× mid-flight between 390×844 and 844×390 and asserts the sim did
not notice. **6/6 PASS**: 0 tick discontinuities, worst deviation from constant velocity on a
rotation tick **1.52e-13 wu**, the held stick survives (`axisY −0.643` before and after 20
rotations), 20 `view:change` events for 20 rotations, and the zoom stayed inside the clamp
(0.7984 … 1.0000) across every rotation. **§4.1's "rotation must not disturb the sim" holds, so the
pivot costs nothing here.**

## 9b — `statecheck.mjs` — PASS, orientation-neutral

15/15. `__state`'s shape, the save round trip and its three corruption fallbacks, the quality
switch, no off-origin requests, no console errors. Nothing in it reads a profile field.

---

## 10 — `p8stability.mjs` IN LANDSCAPE — D119's PUMP criterion is 6× weaker and vanishes at half the sample

`p8stability.mjs` hardcoded `makeView('portrait')`. Added the same additive `--mode`.
16 duels, 14.5 engaged minutes per arm, controller live at `zoomBias: 'normal'`.

| arm | rev/min P → L | UNEXPL/min P → L | osc% P → L | **PUMP% P → L** | travel Z/T P → L |
|---|---|---|---|---|---|
| **SHIPPED** | 6.84 → **6.64** | 2.28 → **3.59** | 0.09 → 0.13 | **0.00 → 0.00** | **0.891 → 1.044** |
| `?slew=symmetric` | 11.68 → 9.89 | 0.55 → 0.97 | 4.74 → 3.15 | **0.19 → 0.03** | 1.253 → 1.258 |
| `?margin=strict` | 6.22 → 6.50 | 1.80 → 2.77 | 0.12 → 0.13 | 0.00 → 0.00 | 0.549 → 0.625 |
| `?track=sticky` | 6.84 → 6.64 | — | — | 0.00 → 0.00 | bit-identical to SHIPPED in both (D118 confirmed in landscape) |
| noclear + sticky | 6.22 → 8.57 | 0.97 → 3.32 | 0.66 → 0.10 | 0.00 → 0.00 | 0.344 → 0.424 |

Portrait figures for the first four columns are P8_NOTES §2's table, same tool, same sample size.

**Three things.**

1. **D119's PUMP criterion still separates in landscape, but its margin is 6× thinner** — SHIPPED
   0.00% vs `symmetric` **0.03%**, against portrait's 0.00% vs **0.19%**. **At `--runs 8` it does not
   separate at all** (0.00% vs 0.00%). D119 adopted PUMP precisely because it "falsifies in both
   directions"; in landscape that property is sample-size dependent and was not there at half the
   sample. **Not a defect yet — a margin that needs watching, and a reason not to shrink the run.**
2. **The shipped controller's travel ratio crosses 1.0 in landscape: 0.891 → 1.044.** In portrait
   the shipped controller *filters* its target (moves less than asked); in landscape it *amplifies*
   (moves more), which is the direction `?slew=symmetric` sits in (1.258). It does not trip PUMP —
   the excess is not concentrated in any 3 s window — but it is the first time a shipped arm has
   read above 1.0 on this project.
3. **D114's UNEXPL/min is worse in landscape and still won by the break-switch** (SHIPPED 3.59 vs
   `symmetric` 0.97). D119 already superseded it; recorded so nobody re-adopts it for landscape.

---

## 11 — `skygate.mjs` IN LANDSCAPE — **A4 FAILS**

`skygate.mjs` hardcoded `cdp.viewport(390, 844)` and `sky.html?w=390&h=844`. Added additive
`--w` / `--h`; defaults unchanged and portrait re-runs 3/3.

```
node tools/skygate.mjs                  # 3/3 pass
node tools/skygate.mjs --w 844 --h 390  # 2/3 — A4 FAIL
```

| | portrait 390×844 | landscape 844×390 |
|---|---|---|
| **A4** nothing repeats on screen (FAIL at multiplicity 3+) | **PASS** — worst multiplicity **2**, **19/180** frames contain any repeat, worst frame 8 cutouts from 7 distinct ids | **FAIL** — worst multiplicity **5**, **161/180** frames contain a repeat, worst frame **27 cutouts from 15 distinct ids** |
| A5 the ramp does the work | PASS — worst pair 0.26 (line 0.25) | PASS — 0.26, identical |
| A7 band crossfade timing | PASS — 1.66 s on all five edges | PASS — identical |

**A4 is a screen-AREA criterion and landscape's screen holds 2.16× more world.** Portrait draws at
most 8 cutouts at once from 7 distinct atlas ids; landscape draws **27 from 15**, so the same cloud
cutout appears **five times on one screen**. A5 and A7 are unaffected because they are a ramp
sampling and a climb-rate quantity respectively — neither is a function of screen width.

The atlas variety count was sized against the portrait screen. **No constant touched**; this is P3's
territory (the cloud atlas) rather than the camera's, and it lands on P16's art pass or on whoever
owns `ATLAS_SKY.md`.

---

## 12 — REQUESTs (I do not edit DECISIONS / ARCHITECTURE / MANAGER_STATE / BUILD_PLAN / P8_NOTES)

- **REQUEST-1.** **`leadSeconds` needs a VERTICAL derivation, and D108's is horizontal-only.** D106
  and D108 both index on frame *width*; `camera.js:395` applies the same scalar to `leadY` against a
  frame whose height differs by 1.79× between profiles. The retune phase should treat the vertical
  lead as its own term (or index `leadSeconds` on `worldH` for the y component), not re-apply D108.
- **REQUEST-2.** **D108's derivation is circular and cannot be re-applied to landscape.** Portrait's
  0.27 was set to match landscape's 16% of frame width; landscape's 0.70 was never itself measured.
  Whatever fixes landscape must come from a measurement, and §4.1/§4.2 above is the only one on file.
- **REQUEST-3.** **`leadMax` is inert in both orientations and should be recorded as such**, not
  retuned. It binds at 600 wu/s = 90.0 m/s in *both* (an algebraic consequence of both being ~35% of
  their own frame at ~16%-per-cruise lead), against a level top speed of 61.5 m/s, and measures **0
  cap ticks in 52,078**. D110 said this for portrait; it is now measured for landscape.
- **REQUEST-4.** **`playfield.left = 0.11` is derived from the altitude tape being on the LEFT, and
  D103 moved the tape to the RIGHT.** The comment in `viewprofile.js` still says "the altitude tape's
  gutter, (6 + 34) / 390 = 0.103". Portrait now reserves 43 px on the side the tape left. Landscape's
  0.03 has no stated derivation at all. Both want re-deriving in the retune; neither is touched here.
- **REQUEST-5.** **`camtrace.mjs` cannot run in landscape.** `makeView` takes a `mode`, but all six
  call sites pass nothing and there is no CLI flag, so Z1–Z6 have only ever been measured in
  portrait. Per D118's lesson — a control that cannot go red is not evidence — **Z1–Z6 are currently
  not evidence about landscape at all.** A `--mode` arm is a two-line additive change; I have not
  made it yet.
- **REQUEST-20. `skygate.mjs` A4 FAILS in landscape** — worst cutout multiplicity **5** against a
  FAIL bar of 3, and **161/180 frames contain a repeat against portrait's 19/180**. The cloud
  atlas's variety count was sized against the portrait screen; landscape shows 27 cutouts from 15
  distinct ids at once. This is P3/`ATLAS_SKY.md` territory, not the camera's. Not touched.
- **REQUEST-19. D119's PUMP criterion has a 6× thinner margin in landscape and does not separate at
  `--runs 8`** (0.00% vs 0.03% at 16 duels; 0.00% vs 0.00% at 8). And the **shipped controller's
  travel ratio crosses 1.0 in landscape (0.891 → 1.044)** — it amplifies its target where portrait
  filters it. Neither is a failure; both are the kind of thing that should be on the record before
  the retune moves a slew constant.
- **REQUEST-18. H7's break-switch `framepip` does not go red in landscape**, so H7's landscape PASS
  is unfalsified. The mechanism is D121's own finding — landscape's frame gives 1.72 s of warning by
  itself — so the fix is a *different* switch (e.g. shrink the tape rather than replace its source),
  not a changed criterion.
- **REQUEST-16. `landscape.playfield.top = 0.06` is wrong by the derivation that produced
  portrait's 0.05, and H5 fails at 23.95% because of it.** Portrait's comment reads *"under the
  objective / wind row, 40.6 / 844 = 0.048"*; landscape's banner bottom is at **0.1164** of its
  frame. The same rule gives ≥ 0.1164, not 0.06. **This is the single highest-value item in this
  audit** — it is a shipped playability bug in the new primary orientation, it is one number, and
  D104 already established the mechanism. Not touched.
- **REQUEST-17. The thumb cannot reach full nose-down deflection in landscape (39.7% of it), and
  H12 reads BETTER for that reason.** See §8.2. H12's cap measures travel, and a clamped stick
  travels less. A landscape H12 needs a *reachability* criterion — "does the driver attain
  `|axisY| = 1`" — before its travel number means anything.
- **REQUEST-14. H6 passes in landscape while the Mud band is 16.8 px tall against a 15 px minimum
  font.** H6 gates spans / count / names / Concord placement and never asks whether a band can carry
  its own label. Landscape's tape resolution is **24.0 px per 1,000 wu against portrait's 53.0**.
  A band-height-vs-`FONT_MIN` criterion is missing from H6 in both orientations; only landscape
  fails it.
- **REQUEST-15. H8/H8b (chevron merge) still hardcode a 390×844 screen** and `CHEV_MERGE_PX 26` /
  `CHEV_INSET 12` are absolute px, which are 0.03 of the frame width in portrait and 0.01 in
  landscape. Not converted here — H8's `toScreen` is a synthetic centre-of-screen projection and
  making it orientation-aware is more than an additive flag.
- **REQUEST-11. Z1–Z3 have NO working break-switch in landscape.** `control:symmetric-slew/jitter`
  is camtrace's largest signal — 52 rev/min, 103 gap violations, 680 oscillation windows in
  portrait — and it reads **0 / 0 / 0 in landscape**, because the `jitter` fixture's ±30% wobble on
  a 150 wu offset saturates landscape's solve at `zoomIntimate`. The tool's own comment names this
  failure mode. Under D123 the tuning target has an unfalsified stability criterion. **The fixture,
  not the criterion, is what needs re-sizing — landscape needs a ~2.6× larger box for the same
  probe.** I have added only the `--mode` arm; I have not resized any fixture.
- **REQUEST-12. `ZOOM_BIAS` does not move the delivered zoom in landscape at any box width camtrace
  probes.** All twelve bias rows return 1.2005 / 1.0367. `ZOOM_BIAS` is a persistent user setting
  (`save.settings.zoomBias`), so this is a shipped feature that may be inert in the new primary
  orientation. Needs a landscape-sized probe before anyone concludes either way.
- **REQUEST-13. Landscape is measurably WORSE than portrait on Z1.** `patrol` 8.0 → 12.0 rev/min
  with **7 oscillation windows at amplitude 0.15 that portrait never produces**; `furball`
  10.0 → 13.5. D114/D119 re-specified P4c to PUMP windows and both orientations pass that; the raw
  Z1 bar is over in both and *further* over in landscape. Recorded, not retuned.
- **REQUEST-7. `STICK_R_FRAC` 0.208 × `view.w` is the single most consequential carried constant,
  and P2 already wrote the fix.** Under D123 it stops being a desktop curiosity: landscape's stick
  radius is **175.55 px against portrait's 81.12**, 64% of its own zone's height, and the axis gain
  is 2.16× lower. `P2_NOTES` §R-12 proposes `min(zone.w, zone.h)`; P7's T8 was to refine it and did
  not. **Not touched here.** It also means **H12 (thumb travel) has only ever been green at
  portrait's radius** — see REQUEST-9.
- **REQUEST-8. `layout.js:157-158` reads `VIEW_PROFILE.portrait.zoomLockRange` by name in both
  orientations.** Harmless today; a silent portrait dependency the moment D120's derived admission
  radius is per-profile. One line, and it is `js/**`, so I have not touched it.
- **REQUEST-9. `METRICS.COAM_FRAC 0.14` is ART §10's fraction of the PORTRAIT frame, and it is also
  `playfield.bottom` in both profiles.** It resolves to **18.8 mm in portrait and 8.7 mm in
  landscape** and it has to hold a 92 px-diameter speed arc (`ARC_R 46`, absolute). Retuning it moves
  the camera's playfield as well as the HUD, so it needs costing on both at once.
- **REQUEST-10. The altitude tape is 84.2 mm long in portrait and 38.0 mm in landscape** for the
  same 0–10,000 wu column. D121 accepted portrait on the grounds that the tape and the chevrons
  deliver the 1.75 s of warning the picture does not. Landscape needs the warning less, but the tape
  is also the ladder-as-journey instrument (P4/P4b) and 45% of the length has never been assessed.
- **REQUEST-6. D124's two sanctioned levers land P3 on 34.01 px against a 34 px bar — a 0.03%
  margin — and D124 verified them against P0 only.** P3 is `hullWu × scale × zoom` and nothing
  else, so this is exact, not a projection. Landscape at scale 0.6964 px/wu:

  | hull | `zoomWide` | px at the floor (bar 34) |
  |---|---|---|
  | 64 (shipped) | 0.78 (shipped) | **34.77** — 2.3% margin |
  | 64 | **0.74** (D124) | **32.98 — FAIL** |
  | **66** (D124) | 0.78 | 35.85 |
  | **66** | **0.74** | **34.01 — PASS by 0.01 px** |

  The floor drop *alone* fails P3; the pair passes it by a hundredth of a pixel. D124 already says
  "both are needed" for P0 — the P3 arithmetic says the same thing far more tightly, and it means
  **the hull is not a free parameter above 66 wu either way round: it is pinned within ~0.03 wu of
  66 by P3 at the 0.74 floor.** Portrait has room to spare on this criterion (41.22 px at both
  levers), which is a second sense in which these constants were fitted where the slack was.

---

## 13 — NOT YET DONE

1. **`anchorYThreatAbove`** (portrait 0.75 / landscape 0.66) — the one profile field no existing
   fixture isolates. `camera.js:383` selects it when a committed diving attacker is present; the
   duel trace produces the condition but nothing separates those ticks. A `--threatabove` arm on
   `p8blead.mjs` that segments on `cam`'s threat state would give it the same treatment §4 gave the
   climb and dive anchors. **This is the next concrete action.**
2. **`hudcheck.mjs` H8 / H8b still hardcode a 390×844 screen** for the chevron model, and
   `CHEV_MERGE_PX 26` / `CHEV_INSET 12` are absolute px (0.03 vs 0.01 of frame width). Converting
   H8 is more than an additive flag because its `toScreen` is a synthetic centre-of-screen
   projection — see REQUEST-15.
3. **`framegate.mjs`** — the blind art critic (D64). Needs the renderer and three critic agents;
   out of scope for a measure-only pass, and it would be a *new* judgement rather than a re-run.
4. **P4 / P4b** — still the largest gap, unchanged from `P8_NOTES`. A scripted 0 → 10,000 wu climb
   through `js/core/bands.js` plus the ramp/haze crossfade. §7.1's tape-band measurement is the
   nearest thing this pass produced to it.
5. **A landscape/portrait still pair for P8's blind critique** — needs the renderer.
6. **Nothing here was verified against a real phone.** Every number is at 390×844 / 844×390 with
   `safe: {0,0,0,0}`. `slotRect` applies safe-area insets and a notched phone in landscape puts them
   on the *long* edges, which is the case portrait never exercises. Untested.

## 14 — THE ONE-LINE SUMMARY FOR WHOEVER PICKS THIS UP

The pivot's cost is **not** distributed evenly across the constants. Three of them carry almost all
of it, and each has an exact arithmetic cause rather than a judgement:

1. **`landscape.playfield.top = 0.06`** should be **≥ 0.1164** by the derivation that produced
   portrait's 0.05. H5 fails at 23.95%. *One number.*
2. **`leadSeconds`** is a single scalar applied to both axes and was only ever fitted on the width
   axis. On the height axis landscape's is **4.63× portrait's fraction** and clips a quarter of all
   engaged ticks. *Needs a second term, not a retune.*
3. **`STICK_R_FRAC × view.w`** uses the long edge, so landscape's stick is **2.16× too big** and the
   thumb reaches **39.7%** of full nose-down deflection. `P2_NOTES` §R-12 already wrote the fix
   (`min(zone.w, zone.h)`). *Known since P2, still shipped.*

Everything else in §1's table is either shared and correct, equivalent by construction
(`leadMax`), or a measured-but-tolerable difference. **And three gates cannot currently prove
anything about landscape** — Z1–Z3's break-switch, H7's `framepip`, and H12 — which by this
project's own rule (D47, D118, and the resume's "falsify the instrument") matters as much as the
failures.
