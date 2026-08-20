# S2-L — the dashboard, and the controls on it

Aaron's second play-test, items **L2 and L3**, which are one job:

> ui: moving the buttons the to right creates the exact same problem on the right side of screen.
> **I wanted the buttons built into the dashboard!** … there is a big black bar if i look up, it
> doesn't look good, **have it all glass**, I almost want **the exact same view as chase but
> dashboard instead of chasing car**

One screen: an open view of the city, a dashboard along the bottom, the controls as keys on it.
Nothing floating, nothing at mid-height on either edge, no roof.

---

## What was built

**The roof is gone.** `roof_lip` and `roof_spar` are deleted from `PARTS`, the roof's edge rule is
out of `RULES`, and `roof` is out of `ROLES_ALLOWED`. Nothing was kept.

**The A-pillars are glass.** They keep their edge rule, and they stopped being made of near-black
shell metal without costing a draw call: `shellMat` is now white with **RGBA vertex colours**, so
"which parts are see-through" is a per-vertex attribute rather than a second material. `dash_lip`,
`dash_face` and the two consoles carry alpha 1 and reproduce the old `0x0c0e12` exactly (the literal
comes from `THREE.Color` so the sRGB→linear conversion matches); the pillars carry `0x63879f` at
alpha 0.26. **The merged shell geometry did not split and the cabin is still five draws.**

**The dash is two physical surfaces.**

* The **instrument top** is the existing tilted quad and its `CanvasTexture`, instruments only,
  shortened, with the portrait console bay deleted so the whole canvas is instruments.
* The **control lip** is a full-width DOM strip at the very bottom carrying every flight control.
  A flat DOM rect is physically correct there — the front lip of a real dashboard is the one part
  that faces the driver square on — and the two share a housing gradient and an edge-light colour so
  the seam reads as a moulding line rather than a mismatch.

**Every `.ctl-btn` that flies the craft is in the lip.** Collective (RISE / HOVER / SINK) and BOOST
at one end, switchgear (AUTO / HOME / RADIO, plus the reserved hidden `#btn-hire`) at the other,
blank moulding and the vent grille between. The two ends swap with `flipSides` so the collective is
always under the thumb that is not flying. **Every element id is unchanged** — `#conspad`,
`#leftpad`, `#altpad`, `#btn-up`, `#btn-down`, `#btn-boost`, `#btn-auto`, `#btn-home`,
`#btn-squelch`, `#btn-hire` — because `js/`, four gate suites and `tools/hands.mjs` bind by them.
`#btn-view` and the cog did not move: they are not flight controls.

---

## The decision the brief asked me to make and report

> drive it the other way — the lip's height is the CSS constant, and the quad is fitted above it.
> Pick whichever is more robust across portrait/landscape and say which you picked and why.

**I drove it from the lip.** `--lip-h` in `style.css` is the constant (mirrored by `HUD.LIP_H` /
`HUD.LIP_H_LAND` for a page with no control layer), `js/hud.js` measures it, and `layoutFor()` solves
for the quad that sits on top of it.

The reason is the touch target. **44 CSS px is a CSS-pixel requirement**, so the lip's height has to
be settled in CSS pixels first. Fitting the quad first and giving the lip what is left over makes the
key height a function of the field of view, the aspect ratio and the quad's canvas aspect — three
things a player can change from the settings panel — and the first value below 44 would be a
regression nothing in the layout could refuse. Driving it the other way makes the floor structural:
`--lip-key` is `clamp(44px, calc(var(--btn) * .80), 54px)` and the quad is whatever fits above it.

Concretely, in `layoutFor`, the quad's bottom edge is placed at `bottomN = -1 + 2 * lipFrac` instead
of at `-0.98`, and `DASH_W/H` and `DASH_TW/TH` are now **derived** — the canvas aspect is what puts
the quad's *top* edge at its target share of the frame once its bottom edge is pinned. The algebra is
in the comment over `bottomN`.

`lipFrac` is **measured, not assumed**: `#lipsize` is a zero-width probe carrying the lip's own height
expression. It lives outside `#controls` deliberately — that layer is `display: none` for the whole of
boot and for every `?nohud` shot, and a probe inside a `display: none` subtree measures 0, which reads
exactly like "there is no lip" and would drop the dashboard back onto the floor of the frame. Measuring
rather than computing also means a device's safe-area inset is included for free.

---

## The thing that was not in the brief and had to be fixed anyway

**The cabin's pitch is now the camera's, not the craft's.** (`js/hud.js` `update()`, and `main.js`
passes `pitch: camera.rotation.x`.)

The cabin pitched with the craft while the camera pitched with the LOOK, so the whole dashboard
walked up and down the frame: at the resting 3.4° look-down it sat **57 CSS px** up the screen, and
looking down walked it further. That was survivable while the dash floated — it is why the shipped
build's dash never touched the bottom of the screen either — but it is fatal to this design, because
the control lip is a screen-space surface and "one moulding" would have been true at exactly one look
angle.

**The yaw already worked this way.** `main.js` clamps the cabin's heading to the camera's
± `CABIN_YAW_LAG` because an unbounded lag once slid the dash bodily off the left edge mid-turn. The
vertical axis had the identical defect and nothing bounded it. The craft's nose attitude is not lost:
`js/camera.js` already folds it into the camera as `flight.pitch + vpitch * pitchMul`, so the pilot's
whole head tips with the craft and the cabin comes with it.

This is also closer to what Aaron asked for — *"the exact same view as chase but dashboard instead of
chasing car"* is a dashboard that stays where a dashboard is.

---

## Measured numbers, each with the command that produced it

### The dashboard's share of the frame — `node tools/gates_s2l.mjs` / `--land`, check D6

| | 390×844 portrait | 844×390 landscape |
|---|---|---|
| control lip | **60.77 px** (7.20 %) | **45.98 px** (11.79 %) |
| instrument top | **87.29 px** | **34.13 px** |
| **whole dashboard** | **148.06 px — 17.54 %** | **80.11 px — 20.54 %** |
| cap asserted | 150 | 96 |
| seam (quad bottom vs lip top) | **0.05 px** | **0.02 px** |

`cabinExtent().frac` is the honest total, not a proxy: nothing in the 3D cabin reaches higher than the
quad does (`plane === frac` to 4 dp), and the quad's bottom edge *is* the lip's top edge, so one number
covers both surfaces. The manager's ≤150 px portrait target is met with 1.94 px to spare.

### Touch targets — `node tools/gates_s2l.mjs` / `--land`, check D3

Every key in the lip, smaller dimension, **raw float, and the number compared is the number printed**
(`gates_s2d` once passed a 35.99 px tab while printing "36 px tall"):

* portrait: RISE / SINK / BOOST **44.80 px**, AUTO / HOME / RADIO **44.00 px** — worst **44.00**
* landscape: worst **44.00 px**

Falsified by forcing AUTO to 43.4 px: the same comparison reads 43.39 and rejects it.

### Draw calls — `node tools/gates_s2l.mjs`, check D4

**5** — `shell · rules · glass · dash · holo`, 5 meshes. Deleting the roof did not split the merged
shell geometry; the pillars became glass inside it.

### No bar overhead — `node tools/gates_s2l.mjs` / `--land`, check D5

A real thumb drags the look to **+62°**, and the check asserts the drag worked before it asserts
anything else (setting `flight.pitch` directly reads back as −0.06 while docked; a version that
trusted the assignment would have measured a level view and called it a clear sky). Two independent
statements:

| | portrait | landscape |
|---|---|---|
| highest normalised screen y of any **opaque** shell vertex | **−0.7175** | **−0.7181** |
| …against the top-quarter line | 0.5 | 0.5 |
| the see-through pillars reach | 1.1056 | 1.1056 |
| top-centre cell luminance | **0.8909** | **0.6702** |
| …with the roof put back | 0.5133 | 0.3582 |

"Opaque" is read off the geometry's own RGBA vertex colour, so it is not a name list: a part is exempt
from *nothing solid overhead* exactly when it is see-through, and a future part that goes back to alpha 1
lands in the test automatically.

### Frame budget — `node tools/budget.mjs --headed` and `--headed --lite`

**All gates pass on both presets.** Worst of the seven scenarios:

| preset | draws | tris | mean frame | worst frame |
|---|---|---|---|---|
| HIGH | 58 (`auto`) | 180.0 k | 1.55–2.44 ms | 8.90 ms (`auto`) |
| LOW | 44 (`auto`) | 71.8 k | 0.71–1.82 ms | 8.40 ms (`auto`) |

Thresholds are draws ≤ 90, tris ≤ 260 k, mean frame ≤ 6 ms. The `cockpit` scenario is 57 draws /
167.2 k tris HIGH and 43 / 60.4 k LOW.

**Those milliseconds are CPU wall time** (`CLAUDE.md`): they measure draw-call submission, not
fragment cost, and none of them is a GPU statement. What this phase changed that a CPU clock cannot
see is that the shell is now `transparent`, so `dash_lip` and the two consoles no longer early-z the
city behind them. The A-pillars were always a thin sliver; the mouldings are behind the DOM lip and
the instrument quad for almost all of their area. **Nobody has measured that on a phone.**

### `node tools/shot.mjs --all`

6/6, 60 fps, 0 errors, 52–57 draws, 154.7–167.8 k tris.

### `node tools/determinism.mjs`

9/9 — golden **`f29beaf9`, 25,039 buildings**, unchanged.

---

## The board

`for f in tools/gates_*.mjs; do node $f; done` plus the `--land` / `--lite` arms and
`node tools/determinism.mjs`, 40 runs in all. **Green: 37. Red: 3, and all three are dealt with
above.**

```
green  boot p11 p1a p3a p3b p4 p5 p6 p7a p7b p8 s2c s2d s2e s2f s2g s2h s2i s2j s2k s2l wire
green  p3a/p4/p5/p11 --lite · s2c/s2g/s2h --lite · s2d/s2e/s2f/s2i/s2j/s2k/s2l --land
green  determinism 9/9 — golden f29beaf9, 25,039 buildings, unchanged
RED    p2                      ms.gen 2.100 against 1.4 — a stall, A/B'd; 8/8 on a quiet machine
RED    s2a  and  s2a --land    the planeBottom bound; assertion updated, both arms 13/13 since
```

New suite: **`gates_s2l` 15/15 portrait, 15/15 landscape.** Re-run after the last edit in the tree,
together with `gates_p6` (19/19).

## Gates

New: **`tools/gates_s2l.mjs`**, 15/15 portrait and 15/15 landscape. Every check has a falsification
arm that has been seen red:

| | asserts | falsified by |
|---|---|---|
| D1 | the controls that mirror with the flip are exactly the flight controls | — (it is the derivation the other checks stand on) |
| D1 | nothing that flies the craft is above the lip, both flip states | HOME forced to the left edge at mid-height → 1 offender |
| D2 | every visible control hit-tests to itself, both flip states, panel closed | a sheet dropped over BOOST → 1 covered |
| D3 | every key in the lip ≥ 44 px in its smaller dimension | AUTO shaved to 43.4 px → 43.39, rejected |
| D4 | ≤5 draws, no `roof` in the live part list | `testRoof(true)` → a sixth mesh with role `roof` |
| D5 | looking up: no opaque shell in the top quarter, top-centre lit like sky | `testRoof(true)` → geometry 1.235, pixels 1.7–1.9× darker |
| D6 | the dashboard's share of the frame, and the seam | `--lip-h` forced to 128 px under a stale layout → the seam opens to 67 px |

### The two gates I changed, and why

Both were red against this build, and in both cases **the assertion was what was wrong**, not the
build being made to fit it.

#### `tools/gates_s2a.mjs` check 7a — `planeBottom`

It asserted `ext.planeBottom > -1 && ext.planeBottom < -0.9` — the instrument plane's near edge
within a hair of the **floor of the frame**, which was true because the quad used to be
bottom-anchored to the frame. It is now bottom-anchored to the **top of the control lip**, so
−0.856 portrait / −0.764 landscape is the design rather than a drift.

What the bound protected is intact and is now stated exactly instead of approximately: the near edge
must be on screen (`> -1` — the S2-A defect where the bottom third of the dashboard was below the
floor and a portrait capture showed nothing wrong) **and it must land on the lip line within 0.01 of
normalised screen y**. A seam, not a gap. The old bound would have accepted a 40 px gap; the new one
will not. `gates_s2a` is 13/13 portrait and 13/13 landscape, ratio 0.57 / 0.61.

#### `tools/gates_s2k.mjs` D2 — the half rule

Three checks were red.

D2 shipped asking *"is this key out of the FLYING HALF"*. That was the right question for a console
standing on one edge of the screen. It is the wrong one now: the controls are a lip that runs **edge
to edge**, so half of it is in the flying half by construction, in either flip state, and that is
correct — the floating stick only ever needs the frame **above** it.

So `offenders()` is now a vertical rule: a control that belongs to a thumb must lie entirely at or
below the top of the lip. **Everything the old rule protected is still protected** — its falsification
moves a key back to the left edge at mid-height and is still caught, `before 0 → after 1 → restored 0` —
and the property Aaron has now reported twice is the thing being measured. `gates_s2l` D1 is the same
assertion run in both orientations, and the two suites derive `mirrors` the same way on purpose so they
cannot disagree about which controls belong to a thumb. The stale header paragraph describing the
`TOP_BAND` exemption went with it.

`gates_s2k` is 20/20 again.

---

## Findings worth keeping

**1. `ROLES_ALLOWED` was never read by anything.** `js/hud.js`'s header says *"gates_p6 asserts the set
of roles present is exactly ROLES_ALLOWED"*. It does not — `gates_p6` asserts the **mesh** roles
(`frame · rule · glass · dash · holo`), which is a different list, and `ROLES_ALLOWED` (`pillar · roof ·
dash · console`) had no reader in `js/` or `tools/`. An exported constant with a comment claiming a gate
enforces it, and no gate enforcing it: the twenty-second instance of this project's one failure mode,
found by going to update it. `gates_s2l` D4 now reads it through a new `Cockpit.roles()`.

**2. Hiding the shell is not an isolation of "the cabin overhead".** D5's first version differenced the
frame with and without `cockpit.shell`. It reported the shell darkening the top of the frame by 0.055 —
and the real cause was that `dash_lip` is an **occluder** for the docking pad's fog glow, so hiding it
floods the entire frame with haze: **+0.85 of luminance at the bottom**, against the 0.05 the check was
reading at the top. An isolation that changed more than the thing under test, producing a number that was
believable and about something else. The check is now geometric plus photometric, and neither arm hides
anything.

**3. A top-row mean would have priced the pillars as the bar.** D5's second version averaged the whole top
row of the frame. In landscape the A-pillars sit in the outer cells by construction — the design keeps
them — so the average moved by only 1.3× when the roof was put back. The centre cell is the roof's own
ground and moves by 1.74–1.87×.

**4. The first A/B of the top band was pure drift.** Flown under `?auto`, the "cabin on minus cabin off"
number was 0.0048 and the same arm re-measured 0.042 seconds later, because the craft had moved between
the two samples. `freezeTime(true)` at the dock takes the same-arm noise floor to **0.00000**.

**5. `flight.pitch = x` does not stick while docked.** It reads back as −0.06 on the next frame. Anything
that needs a look angle has to dispatch a real touch drag and then assert the angle it got.

**6. `gates_p2`'s `ms.gen` is not measuring this build, and an A/B says so.** The full-board run came
back **2.100 ms against the 1.4 gate**, so I ran the suite five more times — `0.700 · 0.700 · 1.100 ·
2.000 · 1.100`, four of six under the gate — and then A/B'd the thing I had changed. Six 20-second
`?auto=1` flights alternating cabin ON / cabin OFF:

```
ON  0.7 · 0.0 · 0.1   mean 0.267    within-arm spread 0.700
OFF 2.3 · 4.0 · 1.0   mean 2.433    within-arm spread 3.000
```

**The arm with LESS work in it measured nine times worse, and its own spread is larger than the whole
between-arm difference.** That is not a cost, it is the stall S2-K already characterised — and the
suite's own detail line says the same thing from the other side: every single work unit on the failing
run was 0.1–0.9 ms against a 1.2 ms cap. Two of those six runs also reported worst FRAMES of 171.5 and
20.3 ms with `ms.gen` passing, which no per-chunk cost can produce. The machine was carrying a load
average of 2.6 and another Chrome. **Recorded rather than chased; `gates_p2` is 8/8 on the runs where
the machine was quiet.**

---

## Left undone, and things to know

* **Nobody has flown this on a phone.** Every number here is Mac-measured at dpr 1 and 2.
* **`gates_p2` failed the full-board run at `ms.gen` 2.1 and I did not fix it**, because finding 6
  above says there is nothing there to fix. If it goes red again, run the A/B before touching code.
* **On a squarish frame the instrument top is narrower than the lip.** `layoutFor`'s portrait arm caps
  the quad at 0.52 m so a wide desktop window is not handed the whole viewport, and the cap binds from
  about aspect 0.63 upward — at 1.09 (`shots/cockpit.png`) the quad is 59 % of the frame width while
  the lip runs edge to edge. Both phone orientations are clear of the cap (portrait 0.371 m against
  0.52) so no gate sees it, and the cap cannot simply be raised because the quad's HEIGHT is
  proportional to its width and the dashboard's share of the frame would go with it. Cosmetic, desktop
  only, and it is the one place the "one moulding" claim does not hold.
* **A device safe-area inset grows the lip.** `#conspad` is `--lip-h + --safe-b` tall, so an iPhone's
  34 px home-indicator strip makes the portrait dashboard ~181 px rather than 148. The keys stay above
  the inset and the band it adds is not usable screen, but the number Aaron sees will not be the number
  in the table above.
* **The landscape instrument strip is thin** — 34 CSS px tall against the shipped 48.5. It got 37 %
  wider at the same time (844 px against 616), so the strip's *area* is slightly larger than before, but
  the speed dial at the far left is small and the top bar's type is at the edge of readable on a 390 px
  frame. This is the cost of a 46 px lip in a 390 px viewport and it is a real trade, not an oversight.
* **D5's photometric arm has a 1.74× margin against a 1.5× threshold** in portrait and 1.87× in
  landscape. That is thinner headroom than I would like; the geometric arm (−0.72 against 0.5) is the
  robust half and the pixel arm is the corroboration.
* **`?nohud` shots leave a 60 px band of nothing at the bottom of the frame**, because the DOM lip is
  suppressed while the 3D quad is still seated where the lip would be. That band is honest — it belongs
  to the lip — but a reviewer comparing `shots/*.png` against older renders will see it. `shots/cockpit`
  is `hud: true` and is unaffected.
* **The "Alt buttons" size setting now moves key WIDTH in landscape and key HEIGHT in portrait**,
  capped at 54 px. Uncapped, an L-size key would push the landscape dashboard past the share of the
  frame `gates_s2a` measures.
* **`hudData().flip` is deleted.** It existed only to put the dash's console bay under the control
  cluster, and the bay is gone. `dashSlots()` no longer takes an argument.
* **A pre-existing overlap, not a regression:** in chase view the `#btn-view` switch sits on top of the
  `.ch-top` cash frame at the top-left. It does that in the before-shots too.
* **The lip swallows touches on its moulding.** `js/controls.js`'s `isBtn` now matches
  `.ctl-btn, #conspad`, so a finger landing between two keys does nothing instead of starting a stick at
  the very bottom of the screen. `#btn-settings`' binding was not touched.
* `tools/hands.mjs` gained two moments: **`flip`** (the other move-side state) and **`stick`** (a thumb
  held on the floating stick, which is the picture that says whether the flying half is clear).
