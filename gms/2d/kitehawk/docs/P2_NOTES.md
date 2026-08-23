# P2 — engine port B: core, camera, input, harness

Written by the P2 build agent. Every number here was measured; the command that
produces each one is in §9. Nothing was tuned to make a criterion pass, and where
a criterion could not be met the criterion is reported rather than the constant
moved (§7).

---

## 1. What landed

```
js/core/viewprofile.js    87   VIEW_PROFILE + ZOOM_BIAS, §4.1 VERBATIM, + stickRadius/slotRect
js/core/viewport.js      166   ported + fit-to-height + ONE REAL BUG FIXED (§6.1)
js/core/camera.js        402   the full §4.3 controller. DOM-free on purpose
js/core/input.js         472   ported + the kitehawk ACTIONS/keymap + onDoubleTap/onFlick
js/core/math.js          122   pure. SI<->wu helpers live here (D26)
js/core/rng.js           114   ported unchanged
js/core/events.js         73   ported + the §6.7 reserved-name list as EVENTS
js/core/bands.js          53   NEW — R-02's six-band table. See §8, REQUEST-1
js/core/loop.js           82   ported unchanged
js/core/save.js          203   §7.3 shape, §6.11 API, + ONE REAL BUG FIXED (§6.2)
js/core/quality.js        48   §6.10
js/core/debug.js         115   NEW — reads window.__state, never blocks the world
js/core/audio.js           8   the one-line re-export of js/audio/facade.js
js/main.js               205   boot, ctx, an EMPTY scene machine, __kh and __state

tools/cdp.mjs            217   shared CDP client + static server. Both §8.2 gotchas carried
tools/shot.mjs            90   capture
tools/touch.mjs          274   real touch + the 15-case input suite + --falsify
tools/orient.mjs         170   rotate 20x + --falsify
tools/camtrace.mjs       517   the zoom controller in node, with four controls
tools/corecheck.mjs       94   which core modules js/sim/ may import, enforced
tools/statecheck.mjs     150   save, quality, __state shape, no-modal, origin
tools/pages/camera.html  230   the solver, drawn, with the controls as buttons
tools/pages/input.html   127   the one-thumb layer, drawn
```

`js/gfx/**`, `js/audio/**` (except the one-line re-export), `art/`, `assets/` and
every `docs/*` other than this file were not touched. No git command was run.

**All suites green:**

```
node tools/corecheck.mjs        PASS   pure tier node-importable and clean
node tools/statecheck.mjs       PASS   15 cases
node tools/touch.mjs            PASS   15 cases
node tools/touch.mjs --falsify  PASS   4 fixes, each genuinely under test
node tools/orient.mjs           PASS   20 rotations
node tools/orient.mjs --falsify PASS   3 criteria, each genuinely under test
node tools/camtrace.mjs         see §3 — two criteria cannot be met as worded
```

---

## 2. The camera and zoom, and every constant I chose

**No constant in `VIEW_PROFILE` was changed.** §4.1 was copied verbatim, including
the comments. Everything below is either a constant §4.1 does not carry, or a
reading of §4.3 that §4.3 leaves open.

| constant | value | why |
|---|---|---|
| `BOX_CAP` | 8 | §4.3.1, verbatim. Player + lead point + the 6 nearest others |
| `PLAYER_PAD` | 1.4 hull lengths | §4.3.1, verbatim |
| `MEMBER_PAD` | 1.0 x the member's own `max(w, h)` | §4.3.1 gives three padding rows — "1.0 hull length", "1.0 canopy span", "1.0 section" — which are the same rule three times. One rule covers all three and needs no member-kind argument, so `cam.track`'s frozen signature survives |
| `TRACK_GRACE` | 1 tick | Z6 asks for "drops out within 2 ticks". A member asserted at tick T survives exactly one `cam.update` and is gone on the second. Measured: dropped at tick 2 |
| `PUNCH_HALFLIFE` | 0.35 s | §6.6's "decays in 0.35 s". The punch kicks OUT only, one direction, so a kill can jolt the frame without ever sustaining a pump |
| `HULL` | 64 wu | §3.4. Overridable per player via `player.hull` |
| camera position damping | k = 10 /s (~0.1 s) | not specified anywhere. Tunable; P4 owns how the frame feels in flight |
| anchorY easing | k = 3.0 /s (~0.33 s) | ditto. Fast enough that a dive re-anchors before the ground arrives, slow enough not to snap |
| facing-flip easing | k = 1.2 /s (~0.8 s) | see below |

**`anchorX` is mirrored by facing, and that is a decision §4.1 does not make.**
§4.1 says "the aircraft sits 34% from the left edge", which is right when flying
right and puts you against the wrong bezel when flying left. The offset is
therefore multiplied by an eased direction sign taken from `vx`, over ~0.8 s, so a
reversal swings the frame rather than snapping it. `leadSeconds`/`leadMax` are
applied on top, as §4.1 specifies. **P4 should judge this in flight** — it is one
line and the alternative (a fixed anchor) is one word.

**`weight` is the threat weight.** `cam.track(id, x, y, w, h, weight)` keeps its
frozen signature; `weight > 0` means "this is a hostile for the purposes of
`zoomLockRange`", `weight = 0` means "frame it but do not arm the zoom lock".
Crates, scripted points and boss sections should pass 0. Default is 1, which is
the conservative reading (an untagged member holds the frame wide).

### 2.1 The zoom-in margin: §4.3.2 as written cannot reach `zoomIntimate`

§4.3.2 requires, for a zoom-in, `target > zoom * zoomInMargin` with
`zoomInMargin = 1.18`. Read literally and re-tested every tick, that caps the
reachable zoom at `zoomIntimate / 1.18 = 1.034`: from 1.034 you would need a
target above 1.22, and 1.22 is the clamp. **The controller could never reach
`zoomIntimate` at all**, and `zoomIntimate` is the frame the painted art is
supposed to be the reward for.

§4.1's own comment settles it: `zoomInRate: 0.22, // 0.78 -> 1.22 in 2.00 s`.
That sweep is a single continuous zoom-in, and it is unreachable under the literal
reading. So the margin+dwell is implemented as a **gate on starting** a zoom-in,
latched until the zoom arrives (inside the deadband) or a zoom-out cancels it.

Both readings ship. `?margin=strict` is the literal one. Measured, alone and slow,
target 1.22:

| | latch (shipped) | strict |
|---|---|---|
| settles at | **1.2005** | **1.0367** |
| bias tight / normal / wide, ~378 wu box | 1.1206 / 1.0207 / 0.9406 | 0.9670 / 0.8827 / 0.8167 |
| bias spread tight→normal / normal→wide | 0.0999 / 0.0801 (nominal 0.10 / 0.08) | 0.0843 / 0.0660 |
| reversals/min on the scripted trace | 10.5 | 10.5 |
| gap violations on the scripted trace | 6 | 6 |

The strict reading does not only lower the ceiling: it **distorts the user
preference**, because the bias offset gets swallowed by a margin the controller
can never satisfy. And it buys nothing in stability — the two are identical on
every stability number. That is the whole argument for the latch.

(`1.2005` rather than `1.2200` is `zoomDeadband`: the last 0.0195 is inside 0.02
and the controller correctly declines to chase it.)

### 2.2 The deadband is symmetric, and that qualifies Z4

§4.3.2's pseudocode ends `if (abs(target - zoom) < zoomDeadband) do nothing`,
which applies in both directions. So Z4's "given a target below current zoom, the
controller starts moving within 1 tick, **every time**" holds for every target
outside the deadband and not for one inside it. Measured over 400 randomised
trials: **0 blocked, 0 inside the deadband, max first-tick step 0.01833** (the
`zoomOutRate * dt` clamp, exactly). If the manager's gate randomises targets
including sub-deadband ones, it will see those as "blocked"; they are the deadband
doing its job, and the deadband is what kills the pump.

### 2.3 `allowOutsideClamp` is refused in code

Measured (`camtrace.mjs`, Z5):

| | shipped | `?enforce=0` |
|---|---|---|
| `refused` flag on the returned framing | true | false |
| cinematic + allowOutsideClamp, **player has control** | **0.7800** (the floor) | **0.6200** (escaped) |
| cinematic + allowOutsideClamp, no player control | 0.6200 (`zoomEstablish`) | 0.6200 |
| `priority: 'beat'` + allowOutsideClamp, no control | **0.7800** (never leaves) | 0.7800 |

Refusal logs once per tag:
`[cam] framing "x" asked for allowOutsideClamp while the player has combat
control — refused, clamping to [0.78, 1.22]`.
`cam.setPlayerControl(bool)` is an **addition to §6.6** — the camera cannot enforce
a rule about player control without being told. Default is `true`, so a scene that
forgets to call it gets the safe answer.

### 2.4 The §4.3.1 solve, checked against §4.4.1's own table

Portrait 390x844: `worldW` **462.09 wu**, `worldH` 1000 wu, `scale` 0.8440 —
matching §3.2's 462 / 1000 / 0.844. `zoomFill` 0.85.

| framing box | zoom needed | clamped | §4.4.1 says |
|---|---|---|---|
| 273 wu (the combat turn) | 1.4387 | 1.22 | fits with room |
| 320 wu | 1.2274 | 1.22 | "z ≤ 1.227" ✓ |
| 460 wu | 0.8539 | 0.8539 | "z ≤ 0.854" ✓ |
| **503 wu** | **0.7809** | 0.7809 | "z ≤ 0.781, the clamp floor is reached" ✓ |
| 585 wu | 0.6714 | 0.78 (clamped) | "no zoom satisfies both — PIVOT SIGNAL" ✓ |
| height 1053 wu (Vne recovery) | 0.8072 | 0.8072 | "z ≤ 0.855" — we are stricter, see below |

**`zoomFill 0.85` and `zoomLockRange 1400` behave exactly as §4.3.1 predicts**, to
four decimal places, on a synthetic box. One note for P8: §4.4.1's dive-recovery
ceiling is derived at **90% fill** (`0.90 x 1000 / 1053 = 0.855`) while the solver
uses `zoomFill = 0.85` for everything, which gives **0.8072**. Both are inside the
clamp so nothing breaks, but the gate and the controller are using two different
fill fractions for the same manoeuvre and the gate should say which it means.

Landscape phone 844x390 measures `worldW` **1211.90** (doc: 1212), scale 0.6964
(0.696); desktop 1440x810 measures 995.56 (995), scale 1.4464 (1.446).

---

## 3. Zoom stability — Z1, Z2, Z3, and why two of them cannot be met as worded

`tools/camtrace.mjs` imports the real `js/core/camera.js` into node and drives it
at 60 Hz. Full output: `shots/p2/camtrace.txt` / `.json`.

### 3.1 The isolation runs — the controller does not pump

Before asking whether the controller pumps in a fight, ask whether it pumps at
all. Two runs hold the framing-box **membership** constant:

| 120 s run | reversals/min | gap violations | oscillation windows | worst amplitude |
|---|---|---|---|---|
| `static` — one member at a fixed offset | **0** | 0 | 0 | 0 |
| `jitter` — one member, offset wobbling ±30% at 0.43 Hz, solved zoom swinging across mid-range | **0** | 0 | 0 | 0 |
| `jitter`, **`?slew=symmetric`** (no asymmetry, no margin, no dwell, no deadband) | **52** | **103** | **680** | **0.2559** |

Same input, same module, one switch: 0 against 52 reversals per minute. **That is
the hysteresis proven rather than asserted**, and it is the only number in this
section that belongs to the controller rather than to the scenario.

(The `jitter` probe had to be sized twice. My first version wobbled a box whose
solved zoom was pinned on the clamp floor the entire time, so the wobble never
moved the target and both the shipped and the broken controller read 0 reversals.
A test that cannot fail is worse than no test — same shape as the audio agent's
mean-RMS finding.)

### 3.2 In a fight, the reversal count is the AI's, not the camera's

| 120 s run | rev/min | min gap | gap violations | osc windows | zoom range |
|---|---|---|---|---|---|
| `scripted` — 17 scripted box changes | 10.5 | 0.95 s | 6 | 0 | 0.797–1.031 |
| `duel` — 1 hostile | 21.0 | 0.33 s | 7 | 0 | 0.798–1.201 |
| `patrol` — up to 3 | 8.0 | 0.50 s | 3 | 0 | 0.798–1.201 |
| `furball` — up to 14 | 10.0 | 0.38 s | 4 | 0 | 0.798–1.200 |

Across three seeds the same `duel` scenario reads **7.5, 17.0 and 21.0** reversals
per minute. Nothing about the controller changed between those runs; what changed
is how often a hostile crossed `zoomLockRange`. **Reversals per box-membership
change is 0.29–1.78**, i.e. close to the theoretical floor of one out and one in
per change.

**Z1's "≤ 6 direction reversals per minute" is therefore a budget on how often the
framing box may change, not a property of the zoom controller.** With 17 box
changes in 120 s you cannot get below ~8.5/min without a controller that ignores
the box. I have not touched a constant to bring it down. Recommendation: either
Z1 is measured on a *scripted framing-box* trace whose change count is stated (my
`scripted` scenario is exactly that shape and gives 10.5 for 17 changes), or the
threshold is restated per box change.

### 3.3 Z2 and Z4 are asking for opposite things

Z2: no reversal pair inside 1.2 s. Z4: a zoom-out starts within 1 tick, every
time. **Every gap violation on the shipped controller, in every scenario, at every
seed, is `in -> out`** — never `out -> in`:

```
shipped/scripted   in->out 6   out->in 0
shipped/duel       in->out 7   out->in 0
shipped/patrol     in->out 3   out->in 0
shipped/furball    in->out 4   out->in 0
```

A threat that enters the box 0.6 s after a zoom-in began must be framed
immediately (Z4) and that is a reversal 0.6 s after the last one (Z2). The
hysteresis fully protects the other direction — 0 `out -> in` violations, because
`zoomInDwell` is enforced.

There is a second, harder problem: **`zoomInDwell` is 0.90 s and Z2 demands
1.2 s.** Even the protected direction is only protected to 0.9 s. §4.1's constant
and §4.4's criterion are numerically incompatible; one of them has to move, and
neither is mine to move.

Related, and worth the manager's eye: on the `scripted` trace the **broken**
`?slew=symmetric` controller scores **0 gap violations against the shipped
controller's 6**, because a controller with no hysteresis follows a step smoothly
instead of waiting and then moving. On a step programme the gap criterion prefers
the thing it exists to forbid. The `jitter` run (§3.1) separates them 0 against
103. **Measure "does it pump" against a continuously moving target, not a step
programme.**

### 3.4 A reversal metric that counts sub-visible motion

The raw count treats a 0.0035-unit twitch and a 0.44 sweep alike. `camtrace`
reports both: the raw sign-change count, and a count that only admits a reversal
where the runs on both sides moved at least one `zoomDeadband` (0.02) — a number
already in `VIEW_PROFILE`, so no new constant is invented. On `shipped/furball`
that is 10.0 raw against 9.5 visible; on `control:symmetric-slew/furball`,
16.5 against 14.0, with a smallest raw reversal of **0.00101** zoom units.

### 3.5 Z6 — a stale member cannot pin the floor

A whole 1400 x 260 wu zeppelin tracked once and never re-asserted:

| | shipped | `?track=sticky` |
|---|---|---|
| member count, ticks 1..8 | 1, **0**, 0, 0, 0, 0, 0, 0 | 1, 1, 1, 1, 1, 1, 1, 1 |
| box width, ticks 1..8 | 4200 wu → **243.2 wu** | 4200 wu, forever |
| zoom after 6 s | **1.2017** | **0.7984** — pinned on the floor |

And the trap: on Z1/Z2/Z3 the sticky (broken) controller scores **0.5 reversals per
minute, 0 gap violations, 0 oscillation windows** — the best numbers in the whole
table, because a camera pinned to the floor never moves. **Z6 is the only criterion
that catches it.** Z1–Z3 alone would have rewarded the bug.

---

## 4. Input — the API, and the numbers

```js
import { createInput, ACTIONS } from './core/input.js';
const input = createInput(canvas, view, bus, { invertPitch, holdToFly, bug });

ACTIONS = ['pitchUp','pitchDown','slipLeft','slipRight','special','brake','pause']

input.axisY            // -1..1. NEGATIVE (thumb UP) = nose up  (§6.4)
input.axisX            // -1..1. rudder / the §2.3 drag-override. RAW; the
                       //   "behind/ahead relative to facing" mapping is P4's
input.axisRaw          // {x,y} before the deadzone and the 1.35 exponent
input.stick            // {active, ox, oy, x, y, r} — origin, thumb, radius, css px
input.stickRadius()    // max(36, view.w * 0.208)      (R-12)
input.held/pressed/released/consume/setAction
input.registerZone(id, rectFn, action, kind)   input.clearZones()
input.installDefaultZones()    // the profile's stickZone and nothing else. P7 replaces
input.getZones()
input.onTap(fn) onDoubleTap(fn) onFlick(fn)    // each returns an unsubscribe
input.pointerDown  pointerScreen  pointerWorld  lastSource  touchActive
input.releaseAll()     // main.js calls this on EVERY scene change
input.update()         // once per tick, before the sim. Uses DT, never the clock
input.destroy()
```

Event payloads: tap/doubleTap give `{x, y, worldX, worldY, id, inStick}`; flick
gives `{dx, dy, speed, x, y, inStick}`. `inStick` is there so P4/P7 can implement
"double-tap **in the stick zone** = hard reversal" and "tap **outside** = special"
without re-deriving the rect.

**Measured `stickR`**, `max(36, view.w * 0.208)` (R-12):

| viewport | stickR | note |
|---|---|---|
| 390 wide (portrait phone) | **81.12 css px** | DESIGN §2.2's intended ~81 |
| 844 wide (landscape phone) | **175.55 css px** | |
| 1440 wide (desktop) | **299.52 css px** | see below |

**A 300 px stick radius on desktop is wrong and R-12 predicts it.** DESIGN's
0.208 was a fraction of a 432-wide *portrait* canvas whose stick zone is the full
width; landscape's `stickZone` is only 0.46 of the width. R-12 says to ship
DESIGN's figure as the initial value and let P7's thumb-travel harness refine it
(T8), so that is what shipped, unchanged, and this is the note saying it will need
refining for landscape — most likely as a fraction of `min(zone.w, zone.h)` rather
than of `view.w`.

Shaping, from DESIGN §2.2, per axis: deadzone 0.067, exponent 1.35, release ease
`easeOutCubic` over 0.18 s, anchor slides when the thumb passes R. **No input is
produced on touchdown.** `settings.holdToFly` latches instead of centring
(DESIGN §9.3); `settings.invertPitch` flips `axisY` (default off).

Kitehawk keymap: arrows/WASD, `Space`/`F`/`J` special, `Shift`/`B` brake,
`Esc`/`P` pause. Pad: A/RT special, B/RB brake, start pause, left stick = axes,
d-pad = the four action bits.

### 4.1 The 15-case suite, and its falsification

`node tools/touch.mjs` drives `Input.dispatchTouchEvent` with real touchPoint
arrays. All 15 pass. Selected measurements:

```
touchdown produces no input                axis 0,0
slide up -> axisY < 0 (nose up)            axisY -0.858
anchor slides so |axis| stays 1            axisY 1.000
anchor moved with the thumb                |y-oy| 81.1 vs R 81.1
release eases, does not snap               axisY 2 frames after up = 0.541
release reaches zero                       axisY 0
flick up detected                          dy -170 speed 1260 px/s
                                           [driver delivered 135 ms, 1259 px/s]
lost pointer capture releases the stick    during true after false
```

`node tools/touch.mjs --falsify` reverts each of the four pointer fixes via
`?inputbug=` and requires the matching case to go red. All four do, and each
breaks **only** its own case:

```
baseline (no bug)          GREEN
?inputbug=nocapture        RED as required  (lost pointer capture releases the stick)
?inputbug=noblur           RED as required  (blur zeroes every action)
?inputbug=norelease        RED as required  (scene change releases the stick)
?inputbug=twitch           RED as required  (touchdown produces no input)
```

The flick case is worth a line for whoever writes the next CDP suite: it failed
first time because the *driver* was too slow, not the detector. A flick is defined
against real time (>900 css px/s inside 160 ms) and every CDP round trip costs
several ms, so `sleep()` calls between touch moves push the gesture past the
window. `Touch.flick()` now issues no sleeps and the suite prints what it actually
delivered alongside what the detector needs.

---

## 5. Orientation

`node tools/orient.mjs` rotates 390x844 ↔ 844x390 twenty times mid-flight, with a
thumb held on the stick throughout, against a scripted constant-velocity entity
list on `ctx`.

```
sim tick counter is continuous                 213 ticks, 0 discontinuities
no entity position changed on a rotation frame worst deviation from constant
                                               velocity on a rotation tick
                                               1.52e-13 wu; on any other tick
                                               1.52e-13 wu; 20 view:change events
the held stick survives every rotation         axisY -0.643 before, -0.643 after
no input latched after release                 axisY 0, held []
view:change fired once per rotation            20 events for 20 rotations
zoom stayed inside the clamp                   0.7984 .. 1.0000
```

Constant velocity is the instrument: any disturbance is a step in a straight line,
which is far sharper than "did it look wrong". `--falsify` breaks each of the
three and requires red — all three do.

---

## 6. Two real bugs found and fixed

### 6.1 `viewport.js` measured the canvas, which is its own output

The ported version read `canvas.getBoundingClientRect()` and then wrote
`canvas.style.width/height` in px. From the second call onward it was reading back
its own last answer. **`innerWidth`/`innerHeight` changed on rotation and the
canvas rect did not, so `view:change` never fired and the layout stayed portrait
forever.** A screenshot at either orientation looks perfectly correct on its own;
only counting `view:change` events caught it.

Fixed: measure the canvas's **container** (`#stage`, `position: fixed; inset: 0`),
falling back to `innerWidth`/`innerHeight`. `createViewport(canvas, bus, {measure})`
takes an override for a page that pins the canvas size itself
(`tools/pages/camera.html` does). `?viewbug=canvas` restores the broken version so
the orientation criterion can be shown going red.

This bug is present in `gms/2d/sunderfall/game/js/core/viewport.js`. Not mine to
fix, but worth knowing if anyone ports it again.

### 6.2 `save.load()` reported a reset it had not performed

On corrupt JSON / a failed checksum / a future version, `load()` warned, raised
`corrupt`, showed the callout — and returned `save.data` **unchanged**. At boot
that object is freshly constructed so the difference is invisible, which is
exactly why it survived: any *later* `load()` would keep serving stale data while
reporting a fresh start. Now `save.data` is explicitly replaced.

All three corruption paths are checked in `tools/statecheck.mjs`, and each costs
exactly **one console warning plus one in-page callout** — never an alert. A grep
across the nine shipped core files confirms no `alert`/`confirm`/`prompt`.

---

## 7. What I could not do, and what I refused to do

- **Z1 (≤ 6 reversals/min) does not pass** on any fight trace, or on a scripted
  17-change box trace. §3.2 shows the number is set by the framing box's change
  rate, not by the controller, and that the same scenario reads 7.5–21 across
  three seeds. I did not raise `zoomDeadband`, lower `zoomInRate` or lengthen
  `zoomInDwell` to bring it down; those are §4.1's frozen constants and the
  criterion is measuring the wrong quantity.
- **Z2 (no reversal pair inside 1.2 s) cannot be satisfied together with Z4**,
  and separately `zoomInDwell = 0.90 s < 1.2 s` makes even the protected direction
  incompatible with it. §3.3. Not mine to reconcile.
- **`js/audio/facade.js` does not warn when `assets/audio/manifest.json` is
  absent** — see REQUEST-2. Gate B3 wants exactly one console warning and there
  are currently zero. Not my file.
- The `zoomEstablish` crane, the altitude tape, edge chevrons, `sim.mjs` and every
  gate file belong to later phases and were not started.
- Deliverables 6–9 of the P2 brief (the DSP engine, the sustained layer, the lab
  page, `verify_sfx.mjs`) were already delivered by the audio agent under D45/D43.
  I added only the `js/core/audio.js` re-export, verified in the browser:
  `createAudio` and `default` are functions and `KEYS` has 45 entries.

---

## 8. REQUESTs and one new file

**REQUEST-1 — `js/core/bands.js` is a new file in `core/`, and P4 or P9 may want
it.** `window.__state` must report band occupancy (§8.2) and the altitude tape
(§4.2) needs the ladder, both before `js/sim/` exists. It carries R-02's canonical
six-band table, `bandAt(y)`, `bandT(y)`, `altitudeFeet(y)`, `CEILING_WU`,
`CONCORD_LINE_WU`. It is pure and node-importable. If the world phase would rather
own the table, move it and re-export from here; nothing else changes.

**REQUEST-2 — the missing-manifest warning, for the manager to route to P15.**
`js/audio/facade.js` line 69 reads `.then(r => r.ok ? r.json() : null)`, so a 404
resolves rather than rejects and the `.catch` that carries
`warnOnce('no assets/audio/manifest.json …')` never runs. Measured with
`assets/audio/` entirely absent: `audio.available true`, `audio.ready true`,
`report().manifest === 'absent'`, and **zero console warnings**. The game is
correct; only the §6.8 / gate-B3 "one console warning" contract is unmet. One
line, in a file I do not own.

**REQUEST-3 — two API additions to §6.6, both needed to implement §4.3.4 and
§4.3.3 at all.** `cam.setPlayerControl(on)` (the camera cannot enforce a rule
about player control without being told) and `cam.setBias(name)` (the preference
lives in `save.settings.zoomBias` and has to reach the camera). Also read-only:
`cam.zoomBase`, `cam.dwell`, `cam.granted`, `cam.nearestHostile`, `cam.memberCount`,
`cam.tick`, `cam.framingTags()`, `cam.clearTracked()`, `cam.reset(x, y, z)`.

**REQUEST-4 — `zoomFill` vs the gate's 0.90.** §4.4.1 derives the dive-recovery
ceiling at 90% fill (0.855) while the solver fills to `zoomFill = 0.85` (0.8072).
Both are inside the clamp, but P8 should say which fraction P1b is measured at.

**OBJECTION — none.** Nothing in the P2 brief turned out to be wrong or
impossible. §2.1's margin reading and §7's two criteria are reported, not worked
around.

---

## 9. What P4 (flight) must know

1. **`input.axisY` is negative for nose-up.** Thumb up gives `axisY < 0`, which is
   §6.4's convention (DESIGN §2.2 writes the same gesture with the opposite sign;
   ARCHITECTURE wins). `axisRaw` is the unshaped value if you want your own curve.
2. **`input.axisX` is raw.** DESIGN §2.3's drag-override is *relative to the
   aircraft's screen facing* and past a 0.25 deadzone; input does not know which
   way you are pointing, so that mapping is yours. `brake` on touch is the `axisX`
   extreme, again yours; the action bit is keyboard/pad only.
3. **Nothing under `js/sim/` may import `js/core/camera.js` or read `cam.zoom`**
   (§4.3.5, §10 rule 17). `tools/corecheck.mjs` names which core modules are safe
   to import from a sim module: **`math.js`, `rng.js`, `events.js`, `bands.js`,
   `viewprofile.js`** — node-importable, no DOM, no wall clock, no `Math.random`.
   `viewport/input/loop/save/quality/debug/audio` are the host tier and must never
   appear in a sim import. `camera.js` is in the pure tier so `camtrace.mjs` can
   drive it; **being pure is not permission to import it from sim**.
4. **The camera is a consumer, never an input.** `main.js` calls
   `cam.update(ctx.player, DT)` *after* the scene update and before render. Set
   `ctx.player = {x, y, vx, vy, angle, hull}` and push to `ctx.entities`; the
   camera, `__state` and the debug overlay all read those two fields. When P10
   lands a play scene it owns them.
5. **`view.worldW`/`view.worldH` are the extents at zoom 1. `R.worldW`/`R.worldH`
   are the extents at the CURRENT zoom** (P1_NOTES §5.2). Same names, different
   quantities. The solver needs the zoom-1 pair; drawing usually wants the other.
6. `DT = 1/60` is exported from `core/loop.js`. `input.update()` uses it
   internally for the release ease — it never reads the clock.
7. **SI in, wu out.** `core/math.js` exports `M_PER_WU = 0.15`, `wu(metres)`,
   `metres(wu)`, `feet(wu)`. Author the SI number, derive the wu one (D26).
8. **`R.sprite` takes `r, g, b, a`, not a `col` array** — only `R.line`, `R.poly`
   and `R.ribbon` take one. A `col:` on a sprite is silently ignored and everything
   comes out white. Cost me two screenshots.
9. **Auto quality is off under a harness run** (`?nosave` or `?quality=` present),
   because a preset that flips mid-gate makes two runs incomparable.
10. `?seed=` sets the run's root RNG stream. Fork it per system
    (`rng.fork('spawner')`); never reseed the root.

---

## 10. Running everything

```bash
cd gms/2d/kitehawk

# node only, no browser, deterministic
node tools/corecheck.mjs                 # which core modules sim/ may import
node tools/camtrace.mjs                  # the zoom controller, 120 s, + 4 controls
node tools/camtrace.mjs --json out.json --secs 120 --seed anything

# headless Chrome (spawns its own static server; nothing to start)
node tools/statecheck.mjs                # save, quality, __state shape, origin
node tools/touch.mjs                     # 15 real-touch cases
node tools/touch.mjs --falsify           # revert each fix, require red
node tools/orient.mjs                    # 20 rotations mid-flight
node tools/orient.mjs --falsify
node tools/shot.mjs --url /index.html --out shots/p2 --size 390x844 --state --console
node tools/shot.mjs --url /tools/pages/camera.html --out shots/p2 --size 900x900 --gpu

# by hand, for eyeballs
python3 -m http.server 8731
#   /index.html?debug              the game shell + the debug panel (backquote toggles)
#   /tools/pages/camera.html       the solver, drawn. Every control is a button
#   /tools/pages/input.html        the one-thumb layer, drawn
```

Query flags the engine honours: `?debug` `?dpr=` `?preserve=1` `?nosave` `?seed=`
`?scene=` `?quality=low` `?mode=portrait|landscape` `?noaudio`, and the
falsification switches `?slew=symmetric` `?margin=strict` `?track=sticky`
`?enforce=0` `?inputbug=…` `?viewbug=canvas`. **No shipped build ever sets one of
the last six.**

Artefacts: `shots/p2/camtrace.txt`, `shots/p2/camtrace.json`,
`shots/p2/boot_390x844_t0.png`, `shots/p2/camera_900x900_t0.png`,
`shots/p2/input_390x844_t0.png`.
