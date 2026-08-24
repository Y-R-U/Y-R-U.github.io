# P7 — the HUD, the one-thumb loop, and the two gate mitigations

```bash
cd gms/2d/kitehawk

# everything: 200 seeded dives + a 60 s auto-flown mission in headless Chrome
node tools/hudcheck.mjs --dives 200 --secs 60 --json shots/p7_hudcheck.json

node tools/hudcheck.mjs --node          # H1 H3 H6 H7 H8 H9 H10 H13 H14, no browser, ~2 s
node tools/hudcheck.mjs --cdp --secs 60 # H2 H4 H5 H11 H12
node tools/hudfalsify.mjs --cdp         # revert each feature, REQUIRE red

# by hand, for eyeballs
python3 -m http.server 8731
#   /tools/pages/hud.html                     the HUD over a real fight
#   /tools/pages/hud.html?mode=landscape      the other profile, no code branch
#   /tools/pages/hud.html?zoom=0.78           pinned at the auto floor
#   /tools/pages/hud.html?tapeside=right      the ART / ARCHITECTURE conflict
#   /tools/pages/hud.html?hudbug=zoom         the forbidden version, for comparison
```

`tools/hudcheck.mjs` is P7's instrument, not the manager's gate. `tools/gates_hud.mjs`
is §8.4's and this is what it should wrap or lift.

---

## 1. What landed

```
js/ui/layout.js    the numbers.  THE ONLY FILE IN js/ui/ THAT MAY CONTAIN ONE
js/ui/colour.js    sRGB / luminance / WCAG contrast. a codec, not a widget
js/ui/theme.js     the ink, and ART §10's draw-twice rule as one primitive
js/ui/alttape.js   the altitude tape — gate mitigation 1
js/ui/overlay.js   edge chevrons (mitigation 2), threat brackets, glyphs, pips
js/ui/stick.js     the visible half of the one-thumb stick, and the special
js/ui/cards.js     the radio card widget (P12 fills it)
js/ui/hud.js       assembly, the coaming, STRESS, the screen-locked 2D layer
tools/pages/hud.html  + rigdef.json   the HUD over a real fight
tools/hudcheck.mjs  tools/hudcdp.mjs  tools/hudfalsify.mjs
```

**The HUD is a second canvas, in css pixels, mounted in `#ui`.** ART §10 says `GLASS`
is "not a world layer — screen-locked UI, drawn by `js/ui/`", and drawing in css px
makes gate H4 true by *construction*: there is no code path by which `cam.zoom` can
reach a HUD coordinate. `?hudbug=zoom` ships the forbidden version — the whole layer
scaled about its centre by the live zoom — so the gate can be shown to catch it. It
moves the chrome 504 px.

**`js/sim/` was not touched.** Two REQUESTs in §10; both are one line and neither
blocks P8.

---

## 2. The element inventory, at 390×844 css, safe insets 0

Every rect below comes out of `layout.resolveLayout(view)` and is what
`window.__hud.layout()` prints.

| id | x | y | w | h | where it comes from |
|---|---|---|---|---|---|
| `tape` | 6.0 | 185.7 | **34.0** | 530.2 | `profile.altTape` (w and side), `TAPE_TOP_FRAC` |
| `card` | 0.0 | 50.6 | 390.0 | 118.2 | `profile.radioCard`, verbatim |
| `special` | 283.8 | 260.0 | 87.6 | 87.6 | the drawn ring; the touch slot is `profile.specialSlot` |
| `banner` | 0.0 | 18.6 | 327.0 | 22.0 | derived from the card's slot (below) |
| `wind` | 330.0 | 18.6 | 60.0 | 22.0 | the right end of the same row |
| `coaming` | 0.0 | 725.8 | 390.0 | 118.2 | `COAM_FRAC 0.14` (ART §10) |
| `arc` | 10.0 | 788.0 | 92.0 | 46.0 | speed arc, r 46, centre (56, 834) |
| `belt` | 112.0 | 735.8 | 212.0 | 12.0 | 24 ammo ticks |
| `stress` | 334.0 | 810.0 | 46.0 | 6.0 | STRESS, never G (R-07 / D77) |
| `engine` | 346.0 | 826.0 | 34.0 | 8.0 | the only damage instrument there is |
| `stickZone` | 0.0 | 379.8 | 390.0 | 464.2 | `profile.stickZone`, the lower 55% |

Landscape (844×390) resolves 11: the coaming splits into two bottom corners at
`x 0` and `x 557` (ART §10), the tape moves to `x 808` on the right edge, and the
banner/wind row moves from *above* the card to *beside* it at `x 374.4`. All three
come out of `profile.hud` / `profile.altTape` / `profile.radioCard`. **No widget
reads `view.mode`.** H2 green at 390×844, 844×390 and 1440×810.

**The top row is derived, not authored.** The objective banner and the wind share one
row; if the card's slot leaves a tall enough gap above it the row sits in that gap
(portrait: 32 px, so it does), and if not the row sits beside the card in the width
the card is not using (landscape: the card starts 23 px down, so a 17 px banner above
it overlapped). That overlap was found by **H2b**, a criterion the brief does not
have — see §8.

Type is 15 px minimum throughout (DESIGN §9.3). Numerals appear in exactly four
places: altitude in feet on the tape, the special's ammo, the wind, and STRESS.

### What the screen tells you in the first two seconds of a fight

Left edge, top to bottom: **where you are in a 1,500 m column**, as a brass chevron on
a six-band ladder with the band you are in named — and above your chevron, a second
ghost chevron showing **the altitude you could trade your current speed for**. A
bracket on the tape shows how much of that column the frame is currently holding, so
"off screen" is a thing you can see rather than infer. Outside the tape, pips for
every threat and crate that is above or below the frame.

Screen edges: **arrows for what you cannot see**, at most three, nearest first,
longer when nearer, hot when closing, with a tick saying above or below.

Over the enemy about to shoot you: **a converging red bracket, 0.567 s before his
first round leaves the gun.**

Bottom 14%: a painted coaming with the speed arc, a second **ghost energy needle**
beside the first, the ammo belt emptying left to right, the engine gauge, and STRESS.

**What it deliberately does not tell you:** your health. There is no damage bar, no
damage diagram and no HP number anywhere — R11 accepted in full (DESIGN §2.7). You
read your condition off the aeroplane. It also does not tell you enemy damage state,
enemy type except for the three worth naming, or crate contents beyond one glyph
(§2.9a's promotion list). And it never puts anything on top of your own aeroplane.

---

## 3. The altitude tape — mitigation 1

`tapeModel(rect, st, out)` is **pure and node-importable**, and `hudcheck.mjs` measures
H6 and H7 by driving that exact function against the shipping flight model. It does
not re-derive the mapping — D72's lesson is that a harness which re-declares a value
the code under test also declares is testing itself.

| | |
|---|---|
| span | `0 → −10,000 wu` (D28's playable ceiling), the whole column, always |
| height at 390×844 | 530.16 px → **0.0530 px/wu**, 18.9 wu/px, **9.28 ft/px** |
| band segments | six, drawn from the **act's own ramp LUT** (`shadow → fill → key`), so it cannot clash in any act by construction |
| band names | Mud / Belt / Floor / Deck / Lane / Blue — D19, frozen |
| band pixel spans | Mud 678.7–715.8 · Belt 625.7–678.7 · Floor 556.8–625.7 · Deck 450.8–556.8 · Lane 318.2–450.8 · Blue 185.7–318.2 |
| player | a brass chevron, filled, plus altitude in feet |
| energy chevron | at `alt + v²/2g` — DESIGN §2.7's "the height you could zoom to" |
| viewport bracket | on the tape's inner edge, spanning what the frame holds |
| **Concord Line** | drawn **12 px above the top of the strip, detached and dashed**, not to scale |
| pips | contacts off-screen **vertically** AND within `zoomLockRange` (1,400 wu) horizontally |

**The Concord Line is at −26,667 wu against a −10,000 ceiling.** Drawn to scale it
would either be off the strip or squash the playable column into the bottom third. It
is drawn detached above the top, which is what D28 made mechanical fact: seen, never
reached.

### Why the pip has two conditions, and why that matters to H7

A pip needs the contact to be **off-screen vertically** *and* **inside 1,400 wu
horizontally**. Without the first the tape duplicates the frame; without the second
every contact in a two-kilometre arena is a pip and the tape stops meaning "something
is above you". It is also the difference between H7 measuring a warning and H7
measuring the spawn table.

`RANGES.PIP_RANGE_WU` **is** `VIEW_PROFILE.portrait.zoomLockRange`, imported. It is not
a second copy of 1400.

---

## 4. Edge threat-chevrons — mitigation 2

`chevronModel(contacts, screen, toScreen, out)`, pure, takes a `toScreen` callback so
it is measurable without a renderer.

- A contact **outside the viewport horizontally** gets an arrow on the edge it left by.
- Length **10–22 px**, by distance against `CHEV_RANGE_WU` (2,800 wu).
- Colour by **closure rate** (closing → `hostileHot`), shape by **allegiance**
  (hostile chevron tab, friendly roundel, crate gold) — colour is never the only
  channel.
- An **above/below tick** above or below the arrow.
- **At most three**, nearest first. Two survivors closer than 26 px on the same edge
  merge into one carrying a count.

H8: eight off-screen contacts → **exactly 3 chevrons**. H8b: two contacts 4 px apart
on the same edge → **2 marks, counts 2+1**.

Chevrons are on the fixed-screen-**size** layer: their size is a function of world
distance and never of zoom, but their vertical position follows the contact, which is
the entire feature. That is DESIGN §2.9a's rule and it is why H4 measures them
separately (§7).

---

## 5. The threat bracket, and a criterion the brief does not have

**The P7 brief specifies the bracket as deliverable 3 and gates it nowhere.** H1–H13
do not measure it, and DESIGN §3.6 rule 1 calls it the single most important
readability feature in the game. A feature with no criterion is a feature nobody has
checked, so P7 added one:

> **H14** — over N seeded engagements, how long had a bracket been **continuously up**
> on that enemy when its first round left the gun? Target 0.5 s.

**Measured: 0.567 s median, 40/40 engagements warned, 0 unwarned, bracket up on 2.6%
of frames.** It took four wrong answers to get there and all four are worth recording,
because three of them are the same failure mode:

1. **The instrument measured the first bracket *ever*, not the warning before the
   shot.** It reported a 0.917 s median lead on a 0.9 s lookahead — impossible, and
   that impossibility was the tell. A bracket that flickered once seconds earlier was
   being scored as seconds of warning.
2. **Lengthening the lookahead did nothing.** 0.5 s, 0.7, 0.9, 1.2 → 0.283, 0.283,
   0.300, 0.300 s delivered.
3. **Replacing the predictor did nothing.** A constant-heading extrapolation and a
   proper bearing-error linearisation gave *bit-identical* results. Identical output
   means the experiment failed, not the hypothesis.
4. **Adding hysteresis did nothing to the median** (0.300 s at holds of 0, 0.25, 0.45,
   0.7 s), though it did take `unwarned` from 1 to 0.

Pinning one term at a time found it. With the range gate removed the warning is 2.03 s;
with the cone gate removed, 0.55 s; with both, 0.283 s. Then the direct measurement:
**at fire minus 0.5 s the attacker is 105 m away with an aim error of 11.0°, against a
66 m gun range and an 11° fire cone.** He is already tracking you and simply not in
range yet, and the error oscillates across the boundary.

**A warning gated on the same threshold as the trigger arrives with the trigger by
construction.** The warning cone is now `BRACKET_CONE_K = 1.6 ×` the firing cone. That
is not a threshold moved to make a gate pass — it is the recognition that a warning
threshold must be looser than the event it warns about, and `--falsify` puts it back
to 1.0 and requires H14 to go red (it reads 0.300 s).

Worth flagging for P8 and P11: **R-09 cut the gun range from 140 m to 66 m and nobody
re-checked the bracket.** At 66 m and a p50 closure of ~90 m/s, the physical window
between "he can shoot you" and "he is shooting you" is about 0.7 s. The 0.5 s promise
fits inside it, but not with much room.

---

## 6. The one-thumb loop

`js/core/input.js` already owns the gesture and P2 falsified all of it. `stick.js` adds
nothing to it — it draws it, and wires the two things that are UI:

- **A tap outside the stick zone fires the loaded special** (§6.4). The flying thumb
  never moves.
- **A long press on the special slot toggles CUT / DENY**, which is P6_NOTES §13.3's
  open question ("how a one-thumb player expresses it is P7's"). Long-press never
  fires (§2.4), so the gesture was free, and the current policy is drawn under the
  special ring so DENY is never a mode you are in without knowing. **It collides with
  §2.4's "long-press cycles owned specials" from Act 4 onward**; that collision is
  P13's, and the alternative is one field either way.

`stickR` is unchanged at **`max(36, view.w × 0.208)` = 81.12 px** at 390 wide (R-12).
T8 is **not** refined here and §10 says why.

---

## 7. The gates

Run: `node tools/hudcheck.mjs --dives 200 --secs 60`.

| # | criterion | result |
|---|---|---|
| H1 | no pixel literals outside `layout.js` | **PASS** — 0 numeric literals ≥ 3 across 6 widget files |
| H2 | orientation, 390×844 / 844×390 / 1440×810 | **PASS** — every element inside its slot and the safe area, 10/11/11 elements |
| H2b | elements do not overlap each other *(added)* | **PASS** — after fixing two landscape collisions it found |
| H3 | contrast against `#FFFFFF` and `#080B12` | **PASS** — worst tone-vs-ground **5.87:1** over 20 ink × ground pairs |
| H4 | the HUD does not zoom | **PASS** — worst chrome bbox delta between zoom 0.78 and 1.22 = **0.000 px** |
| H5 | nothing occludes the aeroplane | **FAIL** — 977/5659 frames (**17.26%**) over 94 s. See §8 |
| H6 | tape shows the whole column | **PASS** — 0 → −10,000 wu, six bands named, Concord 12 px above the top |
| H7 | tape warns before the frame does | **PASS** — **196/196** dives warned first, **median lead 7.72 s** (p10 2.40, min 1.73) |
| H8 | chevron merge | **PASS** — 8 contacts → exactly 3 |
| H9 | radio card 44-char cap | **PASS** — fails the load in console; the same text as `kind:"card"` is allowed |
| H10 | card duration is text-derived | **PASS** — audio layer entirely absent, 0 zero-length cards |
| H11 | thumb occlusion | **FAIL** — swept union **12.51%** (cap 18% ✓), overlaps the player rect on **7.78%** of frames (cap 2%, fail 6%). See §8 |
| H12 | thumb travel | **PASS** — **890 css px/min** over 94 s at stickR 81.12 px (cap 2200, fail 3000) |
| H13 | no modals | **PASS** — zero `alert`/`confirm`/`prompt` in the tree |
| H14 | threat bracket precedes the first round *(added)* | **PASS** — **0.567 s** median continuous warning, 40/40, bracket up on 2.6% of frames |

### H7 in detail, because P8's P2 depends on it

200 seeded dives, run in node against `createWorld` + the shipping flight model + the
shipping camera + the shipping `tapeModel`. Half the seeds fly the player **west**,
because every symmetry defect P5 found (D79) surfaced first as a result that depended
on which way an aeroplane was pointing.

```
far arm  (attacker starts OUTSIDE the pip cylinder, above, converging)
  196/196 warned first     median lead 7.72 s   p10 2.40   min 1.73   max 14.08
  4 of 200 unusable (the dive never framed inside 30 s)

near arm (attacker starts inside the cylinder)
  156/156 warned first     median lead 11.46 s  — a spawn-table artefact, reported not gated
```

**The lead is set by the pip cylinder's radius, not by luck.** 1,400 wu against a
462 wu frame is three screen-widths of warning, and that is the design. `--falsify`
narrows the pip rule to near-frame contacts only and the median collapses from 7.80 s
to 1.03 s with only 3 of 59 dives still warned first.

Two scenario choices that had to be made and are worth knowing:

- **The attacker is flown by the shipping pilot on a `point` intent, not by
  `ai.js`.** With `createAI` driving it, the attacker merges head-on at 3 s, EXTENDs,
  and never comes back — over twenty seconds it never dives at all. The run would have
  measured the AI's engagement logic and reported it as tape warning time. H7 is a test
  of the tape; `ai.js`'s engagement is P5's gate.
- **The attacker starts ahead of the player, not behind.** A stern chase is not a
  dive: started behind, the diver settles 600–850 wu astern and never frames at all —
  **26 of 40 runs timed out**, and the 14 that happened to work would have been
  reported as a clean median.

---

## 8. Three criteria that are mis-specified, and one real defect

Nothing below had its threshold moved.

### H3 as worded is arithmetically unsatisfiable

> "every element sampled against `#FFFFFF` and against `#080B12`: **minimum luminance
> contrast ratio 4.5:1** in both"

4.5:1 against `#FFFFFF` requires relative luminance ≤ **0.1833**. 4.5:1 against
`#080B12` requires ≥ **0.1953**. There is no colour in between. **10 of 20 single-colour
readings are below 4.5 and no palette choice can fix that** — which is exactly *why*
ART §10 specifies that every element is drawn twice.

The implementable criterion is about the **mark**, not one of its two tones: on each
ground, at least one tone must clear 4.5:1. The dark outline does it on snow (5.87:1),
the light fill does it on night (6.17:1 worst). `--falsify` removes the outline and
the worst reading collapses to **1.00:1**.

Reported and **not** gated: the fill against its own outline, worst **1.89:1**
(`hostileHot` on snow). Requiring a saturated fill to clear 4.5:1 against a near-black
outline is the same impossibility one level down — it would force every warm red to
near-white and delete DESIGN §2.7's colour law.

The shipped outline is `#04060a` at **alpha 0.62**, not ART's `0.55`: at 0.55 over
white it reads 4.41:1, just under the line. That is a colour changed to meet a
criterion, not a criterion changed to meet a colour.

### H1 as worded is not mechanically checkable

"numeric px constants" cannot be distinguished from radices and byte masks by grep, and
ART §10 specifies two stroke weights *by number*, so a literal reading fails on the
contrast rule itself. Operationalised **more strictly**: outside `layout.js`, no
numeric literal of magnitude ≥ 3 may appear at all, in any context. Two files are
exempt and both exemptions are asserted rather than assumed — `layout.js` is the
numbers, and `colour.js` is a codec that is checked to import nothing from `layout.js`
and to be incapable of drawing.

### H11 does not have a single value, and H12's first two instruments were wrong

Both are "over a 60 s auto-flown mission" numbers and both turn on choices the
criterion does not make. The mission is driven end to end through the real stack —
`ai.js` → `pilot.js` → a thumb position → `Input.dispatchTouchEvent` → `input.js` →
`flight.js` — so the aeroplane is genuinely flown with a thumb, not with an axis
written into the sim. The driver is a proportional controller on `input.axisY` and
contains no copy of `input.js`'s deadzone or its 1.35 exponent, so it cannot drift
away from them.

**H11 depends on where the thumb rests.** The stick is a *floating relative* stick, so
the first contact sets the anchor and biases every frame after it. Measured, 60 s runs:

| thumb rest | y (css px) | overlaps the player rect | swept union | travel |
|---|---|---|---|---|
| 0.35 of the stick zone | 542 | **3.9%** | 13.7% | 1216 px/min |
| 0.55 | 635 | **14.3%** | 13.7% | 834 px/min |
| **0.75 (shipped default)** | **728** | **6.5%** | 12.5% | 583 px/min |
| 0.90 | 798 | **0.8%** | 9.1% | 174 px/min |

**0.75 is the default for a reason that is not "it passes" — it is the only rest
height at which the thumb has the stick's full ±R of travel without hitting the
bottom bezel.** At 0.90 the thumb clamps against the screen edge about 45% of the
time, which flatters *both* numbers by simply not letting it move: 0.8% instead of
6.5%, and 174 css px/min instead of 583. Choosing 0.90 would have turned two red rows
green by picking a control that cannot exercise the thing being measured — D82's
believable-wrong control, on the input side.

The canonical run reads **7.78% overlap** (the sweep's 6.5% plus run-to-run variance),
against a 2% cap and a 6% fail line. **H11 FAILS**, and §8's last part is why.

The 165 px disc is **6.50% of a 390×844 screen** statically, so the "≤ 18% of screen
area" half of H11 is unreachable as a static reading and is measured as the **swept
union over the run** instead: **12.51%**, comfortably inside 18%.

**H12 reads 890 css px/min against a 2,200 cap.** It is gain-insensitive once the
controller is right — 337/347/393/405 px/min at gains 0.15/0.3/0.45/0.7 — but getting
there took two wrong instruments, and both looked like results:

- **Integrating the thumb position and clamping it to the stick zone** let the pair
  walk to the bottom of the screen and stick: median thumb y **842 of 844**, **209 css
  px/min**. A pinned stick reported as a flown mission, and a *passing* H12.
- **Bounding the offset to exactly ±R** re-triggered `input.js`'s anchor slide every
  frame and the pair walked again, this time with the driver lifting and re-placing
  the thumb **582 times in 60 s** and reporting **14,295 px/min**. A thrashing
  controller, and a *failing* H12. `±0.95R` stays inside the slide threshold and keeps
  the anchor put.

A third dilution defect sat under all of it: **with the hostiles dead by ~25 s, the
last 35 s of a 60 s run is a bot flying level with a still thumb.** That does not fail
any gate, it *dilutes* every one of them — H12 fell 1017 → 193 css px/min and H5 fell
35% → 7.7% purely because the tail was quiet. `hud.html` now tops the fight up;
`?respawn=0` turns that off. A per-minute number measured over a mission that stops
being a mission is the wrong quantity measured well.

### H5 is a real defect, and it is not the HUD's

**FAIL. 977/5659 frames (17.26%) on the canonical 94 s run.** Broken down:

| element | frames | why |
|---|---|---|
| `coaming` + `belt` | 533 + 252 | the aeroplane is *inside the bottom 14%* |
| `tape` | 284 | the aeroplane is at the left edge |
| `banner` + `wind` | 90 + 78 | the aeroplane is at the top of the frame |
| `special` | 33 | it crosses the slot |

The cause is measured, not inferred. Over the run the player's own screen position is:

```
screen y   p5 133   p25 204   p50 457   p75 526   p95 707      (screen is 844 tall)
screen x   p5 293   p50 448   p95 479                          (screen is 390 wide)
```

`profile.anchorY` is 0.62, `anchorYClimb` 0.78, `anchorYDive` 0.30, and the velocity
lead is up to 240 wu. Together they sweep the aeroplane across essentially the whole
frame: **p5 133 px is inside the radio card's band and p95 707 px is 19 px short of
the coaming, with the tail of the distribution inside it.** A climbing aeroplane is
*deliberately* pushed low so the sky it is climbing into is visible — and the coaming
is the bottom 14% of the same screen. Both facts are in ARCHITECTURE §4.1 and they are
incompatible.

**Moving the tape does not fix it.** With `?tapeside=right` the tape's own count goes
*up* (59 → 74 on a matched run), because the aeroplane crosses both edges. The
dominant term is the coaming, and the fix is a camera clamp, not a HUD change —
REQUEST-2. Nothing in `js/ui/` can satisfy H5 while the camera is free to put the
aeroplane anywhere on the screen.

## 8b. Two criteria the brief does not have, and what they caught

The brief gates the tape, the chevrons, the card, contrast, zoom, occlusion and the
thumb. It does not gate the threat bracket (deliverable 3) or ask whether two HUD
elements sit on top of each other. Both gaps were real:

- **H14** (§5) found that the bracket delivered **0.283 s** of warning against a
  specified 0.5 s, and that four plausible fixes changed nothing.
- **H2b** found two landscape collisions on its first run — `card/banner` and
  `tape/special` — one of which is plainly visible in `shots/p7/hud_landscape.png`
  and neither of which any H1–H13 reading touches.

Two further defects came from *looking at the render*, which no criterion here does
(D64's lesson, fourth occurrence on this project):

- **The crate's dashed predicted-impact line was a chord right across the painting.**
  The crate is a kilometre up and its impact point is off the bottom of the screen, so
  the "hint" was the loudest thing in the frame. Now capped at 190 px: same direction,
  same prediction from `field.predict`, out of the way.
- **Band labels collided with the player's own altitude readout and, in landscape,
  with the special ring.** A band label is the lowest-priority ink on the screen and is
  now suppressed when it collides; the band is still named by its position, its colour
  and its icon, and the one the player is *in* is the one their own marker is on.

`shots/p7/hud_portrait.png` and `shots/p7/hud_landscape.png` are the HUD over P3's
real painted sky, which `tools/pages/hud.html` now loads.

---

## 9. Falsification — 12 of 12 switches caught

`node tools/hudfalsify.mjs --cdp`. Every phase on this project has shipped checks that
could not catch their own bug, so the assumption was that mine were the same.

| switch | what it reverts | caught by | reading |
|---|---|---|---|
| `notape` | the tape's pips | H7 | 0/59 warned (baseline 59/59) |
| `framepip` | pips only for near-frame contacts | H7 | median 1.03 s, 3/59 warned (baseline 7.80 s) |
| `nobracket` | the threat bracket | H14 | 26/26 unwarned |
| cone K → 1.0 | the warning cone equals the firing cone | H14 | 0.300 s median warning |
| `nooutline` | ART §10's dark outline | H3 | worst tone-vs-ground **1.00:1** |
| `pxliteral` | a literal px offset in a widget | H1 | flagged 4 literals |
| `modal` | an `alert()` | H13 | flagged |
| `nomerge` | the three-chevron cap | H8 | draws 8 |
| audio-derived duration | §7.5's text rule | H10 | 2/2 cards would show for 0 ms |
| no 44-char cap | §7.5's cap | H9 | an 80-char radio line passes |
| `hudbug=zoom` | the HUD scaled by the live zoom | H4 | chrome moves **504 px** |
| `hudbug=input` | `pointer-events: none` on the HUD canvas | H12 | **0 thumb samples, 0 px/min** |

**`hudbug=input` is a bug that actually happened.** `css/game.css` sets
`#ui > * { pointer-events: auto }`, so the HUD canvas mounted in `#ui` sat on top of
`#gl` and ate every touch. The stick never activated and the aeroplane could not be
flown at all. H12 read 0 css px of travel and H11's swept union read 0.00% — both of
which look like *good* numbers. **A screenshot of that build is perfect.** It is now a
regression guard.

---

## 10. Two REQUESTs, and what I could not do

**REQUEST-1 — `VIEW_PROFILE.portrait.altTape.side` contradicts ART §10 and DESIGN
§2.7, which both put the ribbon on the RIGHT.** ARCHITECTURE §4.1 says `'left'`. The
profile wins by default and that is what ships; `layout.resolveLayout(view, out, {side})`
takes a caller override so P7 and P8 can measure both without a widget reading
`view.mode`. **Measuring both settles it: it makes no difference to H5** (left 59
frames, right 74), so this is a taste call, not a numbers call. One field either way.

**REQUEST-2 — the camera's vertical anchors do not know about the coaming, and H5
fails because of it.** `anchorY 0.62` / `anchorYClimb 0.78` are fractions of the
*frame*; the coaming is the bottom 14% of the same frame. Measured p95 player screen y
is **745** against a coaming top of **725.8**. The fix is one clamp in `camera.js` or
one field in `viewprofile.js` — anchors expressed against the playfield above the
coaming, i.e. an effective `anchorY` ceiling of about **0.845** — and it is not mine.
Until then H5 cannot be green and ART §10's "no element on top of the aeroplane, at
any time" is not met.

**T8 (stick radius) is NOT refined here, and it cannot be from `js/ui/`.**
`stickRadius()` lives in `js/core/viewprofile.js` and `input.js` calls its own internal
copy, so reassigning `input.stickRadius` changes nothing. What P2 predicted stands and
is confirmed: 81.12 px at 390 wide is right, **299.52 px at 1440 wide is wrong**, and
the fix is `min(zone.w, zone.h)`-based rather than `view.w`-based. It needs a one-line
change in a file P7 does not own. **Nothing at phone sizes depends on it.**

**Deferred, with reasons (D84 — playable beats exhaustive):**

- **`js/ui/map.js`** — not written. A mission map is P10's story shell and P13's
  hangar; a playable mission does not have one, and a stub file is worse than an
  absent one.
- **The vendored stencil WOFF2.** ART §10 asks for one; the font stack is
  `"Kitehawk Stencil"` first and then **local system faces only** — no CDN, ever (D6),
  and no network request is made (`Hcdn` green: everything same-origin). Generating a
  real stencil face is ~50 glyph outlines of work that changes no gate and no
  mechanic. **P16.**
- **The coaming is a flat value, not a painted asset.** ART §10 wants one generated
  strip of doped canvas, brass and worn leather. P16.
- **Reloading animation on the ammo belt, the crate-pulse at 0.7 Hz, and the
  `damageDiagram` accessibility option** (DESIGN §9.3) — none is needed to fly a
  mission. P13/P16.
- **`settings.reducedMotion` and handedness mirroring** are read by the profile, not by
  the HUD; nothing here needs changing when they land.

---

## 11. What P8's gate needs from me

**Both preconditions are ready.**

| P8 needs | state | number |
|---|---|---|
| P7 H6 green — the tape is live | **YES** | six bands, 0 → −10,000 wu, Concord above the top |
| P7 H7 green — it warns before the frame | **YES** | **196/196 dives, median lead 7.72 s**, p10 2.40 s, min 1.73 s |
| P7 H8 green — edge chevrons are live | **YES** | 8 contacts → exactly 3, merge at 26 px |

`tools/pages/hud.html` is the fixture. It is a real fight — `createWorld` + `createAI`
+ `createCrateField` + the shipping camera + the shipping HUD — and it is deliberately
close to what P10's play scene will be. P8 should drive it rather than `index.html`,
which still has no play scene.

Query flags P8 will want: `?mode=`, `?zoom=`, `?seed=`, `?foes=`, `?secs=`,
`?respawn=0`, `?auto=bot|thumb`. `window.__hud` exposes `playerRect()`, `tape()`,
`chevrons()`, `threats()`, `bboxes(z)`, `traceStart()` / `traceStats()`.

**Three things P8 should carry into its own measurements:**

1. **The aeroplane is not where §4.1 implies it is.** Over a 94 s mission its own
   screen position is `x p5 293 / p50 448 / p95 479` and `y p5 133 / p50 457 /
   p95 707` on a 390×844 screen — **the p50 x of 448 is off the right-hand edge**,
   and the p5/p95 y span nearly the whole frame. P8's P1 (sprite length) and P3c (on
   screen *and* ≥ 40 px) must be measured against that distribution, not against
   `anchorX 0.34, anchorY 0.62`. If P3c comes out low, this is where to look first.
2. **A 60 s fixture that lets the fight end measures a quiet tail.** With the hostiles
   dead by ~25 s, H12 fell from 1017 to 193 css px/min and H5 from 35% to 7.7% —
   purely dilution. `hud.html` tops the fight up by default; `?respawn=0` turns that
   off. A per-minute number measured over a mission that stops being a mission is the
   wrong quantity measured well.
3. **H11 depends on where the thumb rests and H12 on whether the driver can move it.**
   State the thumb rest before quoting either; the sweep is in §8. H12 is
   gain-insensitive (337–405 px/min across gains 0.15–0.7) *once the controller is
   right*, and read 209 and 14,295 px/min with two earlier ones that both looked
   plausible.

---

## 12. Register (DESIGN §12)

| id | value | note |
|---|---|---|
| T8 | `stickR = max(36, view.w × 0.208)` = **81.12 px** at 390 | unchanged; see §10 |
| — | `PREDICT_MAX` | **190 px**. The crate hint line, capped. §8b |
| — | thumb rest, for measurement | **0.75 of the stick zone**. §8 says why it is not 0.90 |
| — | `BRACKET_CONE_K` | **1.6 ×** the firing cone. New. Derived in §5 |
| — | `BRACKET_HOLD` | **0.45 s**. Costs 1.2% duty, buys no median — kept for flicker |
| — | outline alpha | **0.62**, not ART's 0.55. Derived in §8 |
| — | `CHEV_MERGE_PX` | 26 px |
| — | `PIP_RANGE_WU` | `= profile.zoomLockRange` (1,400). Imported, not copied |
