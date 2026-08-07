# P4 — the three defects Aaron found on his phone

All three landed. Every claim below is a measurement or an image I looked at; the last section is
the honest list of what the tests could **not** have caught, which is the part worth reading.

Files changed: `js/engine/app.js`, `js/ui/flow.js`, `js/world/table.js`,
`js/world/materials/table.js`, `js/cine/sequences.js`, `shots/bridge_table.{png,json}`.
`js/main.js` untouched; no `js/config.js` change was needed; nothing outside `gms/3d/waterline/`;
no git command that writes.

---

## 1. The game comes back dark — D40

### What was actually wrong, and it was not what the brief assumed

The brief said "call `restoreContext()` where the extension is available". I wrote exactly that,
tested it the way D40 demands — `loseContext()` while hidden, nobody ever calls restore — and it
**reloaded every single time instead of restoring**. The restore request was being made and doing
nothing.

Two Chrome behaviours, both invisible to a test that only asserts "the game came back":

1. **`getExtension()` returns null on a lost context.** Fetching `WEBGL_lose_context` at recovery
   time — the obvious place — always yields null, so `ext?.restoreContext()` is a no-op and the
   only path left is the reload. The extension has to be taken at construction, while the context
   is alive. Measured: a probe that held the extension from before the loss restored in **5 ms**;
   the same call through a freshly-fetched extension never restored at all.
2. **`restoreContext()` called synchronously from inside the `webglcontextlost` listener is a
   silent no-op.** Chrome sets its "restore allowed" flag from `event.defaultPrevented` *after*
   every listener has run, so a restore requested from in there is refused. The request is now
   deferred 400 ms.

Both are in `app.js` as comments where they bite.

### What the page now does

`js/engine/app.js`

- `this.loseExt` is captured in the constructor, while the context is alive.
- `webglcontextlost` → park, then `setTimeout(recoverContext, 400)`.
- `visibilitychange → visible` → `checkContext()`, which asks `gl.isContextLost()` itself. This is
  the path that matters: on a phone the context dies while the tab is away and no event arrives
  while anyone is watching.
- A 500 ms poll (piggybacked on the existing `texMB` interval) as a backstop for a missed event.
- `recoverContext()` refuses to run while hidden — a restore request is ignored there and a reload
  would be spent on a page nobody is looking at. `visibilitychange` comes back to it.
- `restoreContext()`, then a **2.5 s** window. If `webglcontextrestored` has not arrived, or the
  extension is not there at all, `reload()`.
- **The render loop is parked while the context is lost** (`if (this.contextLost) return`).
- `onTeardown(fn)` — flushed before a recovery reload, because that exit must not depend on the
  browser firing `pagehide`/`beforeunload` in time.
- One automatic reload per 30 s (sessionStorage). A device that is genuinely out of memory would
  otherwise reload in a loop, which never settles and is worse than the black canvas. Each return
  to visible still retries the restore, which costs nothing.
- `restored()` is wrapped: if the rebuild throws, reload rather than sit on a half-restored context.

`js/ui/flow.js`

- `app.onTeardown(...)` saves the match and leaves a sessionStorage note.
- `boot()` reads that note and **resumes straight into the match** instead of landing on the title
  screen. D40 says a reload costs a load screen; without this it also costs a tap and the player's
  place.

### Measured, 390×844, `loseContext()` and **no** manual restore, tab hidden then visible

| | frames while lost | at +2 s visible | after | `window.__mark` |
|---|---|---|---|---|
| restore succeeds | 2697 → 2697 (**parked**) | `lost:false`, climbing | play, turn 2 | **42 — no reload** |
| restore never takes (`loseExt.restoreContext` stubbed) | 2701 → 2701 | still lost | play, turn 2 | **0 — genuine reload** (D39) |
| no extension at all (`loseExt = null`) | 2696 → 2696 | still lost | play, turn 2 | **0 — genuine reload** |

Page luma across the restore-succeeds run: **58.20 → 12.80 → 57.15**. The 12.80 frame is Aaron's
bug exactly — black canvas, HUD intact, "SHOT AWAY" still on screen.
Screenshots: `p4ctx_{live,stub,noext}_{pre,lost,back}.png` in the scratchpad. I looked at all three
`back` frames; the room is fully lit and the match is playable.

**The render loop.** D40 measured 660 frames drawn into a dead context. Now: 45 frames between the
loss and the park — Chrome dispatches `webglcontextlost` on a deferred timer, so a few frames are
unavoidable — and **zero** thereafter, for the whole hidden period and the whole recovery window.

## 2. The miss marker cannot be seen — D41

### The mark

`js/world/materials/table.js` — `pegMiss` is now `NormalBlending` (was `AdditiveBlending`),
`toneMapped: false`, drawing a filled rounded square. The map's RGB is a two-level stencil, not a
colour: body at 0.42 of the instance colour, rim at full, so one instance colour drives both.
`toneMapped: false` matters because `flow.js` moves the exposure between aiming and a cinematic,
and a marker whose job is to be *darker than the paper* must not brighten with it.

`js/world/table.js` — instance colour `MISS.ink` = `[0.010, 0.017, 0.024]` linear; quad
`pitch × 0.62 → 0.88`; **`renderOrder` 3 → 5**. That last one is load-bearing: the lamp's sheen is
an additive quad at renderOrder 4, and under it the dark square gets light put straight back into
it.

### The transient — and a second dead handler, same family as D40

`table.pulse()` was a **no-op for every newly resolved cell, hit as well as miss**. The presenter
calls `resolve()` — which queues the pulse — up to 2.6 s before `flow.js` calls `refresh()` and the
table is repainted. So the pulse looked up an instance that did not exist yet, found nothing, and
expired before the mark arrived. (The miss branch was doubly dead: it looked in `pegCell`, and a
miss has never had a peg. Its `[0.5, 0.8, 1.1]` colour was unreachable code.)

Pulses now **wait for the mark they are announcing**, with a 5 s budget. A miss lands at 1.55× size
and 4.5× the ink and settles into place over 0.7 s; both curves end at exactly 1, so the last frame
of the pulse *is* the resting mark and nothing has to repaint it afterwards.

### Measured — 1280×800, 14 misses / 4 hits / a 3-cell sunk ship

The board is painted from a **fixed grid** in both trees rather than played, so the control and the
change draw the same cells in the same places and the only thing that differs in frame is the
marker. Control tree = `HEAD` of the five files, served from a copy.

| sample | control | P4 |
|---|---|---|
| a marked cell | 146.5 | **24.8** |
| another marked cell | 160.9 | **27.1** |
| chart 2 cells away | 159.7 | 58.6 (mark's edge in box) |
| **a box with no mark in it** | **116.19** | **116.17** |

The last row is the same-code control *next to* the measurement (D13, P2's refinement): the rest of
the frame is untouched to two decimal places.

**How it reads against the chart's own rings.** The chart is dark navy paper covered in bright cyan
compass roses, contours and soundings. A ring cannot compete with that and did not — in the control
image I cannot pick out a single one of the 14. A filled square wins for the opposite reason to the
one D41 states: it is not just darker than the paper, it **occludes the bright ink**, so it punches
a hole in the busiest part of the artwork. All 14 read instantly, at 1280×800 and at 390×844.

Images: `p4miss_{before,after}_board.png`, `p4miss_{pbefore,pafter}_board.png`,
`p4miss_after_pulse.png` (the pulsing mark is visibly larger and paler than the settled ones),
`p4miss_hp_hitpulse.png` (a hit peg mid-announcement — stretched and white-hot, reads as intended).

### The hit and sunk marks, as asked

Left alone, deliberately: they are **bright marks on a dark chart**, which is the one case additive
blending actually serves, and they are legible in every render above.

One thing I did not change and think needs a ruling rather than a coder's opinion: **a sunk cell is
dimmer than a hit cell.** Mark `[0.30, 0.08, 0.05]` against hit's `[0.85, 0.24, 0.09]`, peg
`[0.80, 0.11, 0.07]` against hit's `[2.10, 0.34, 0.12]`. It may well be intentional — a sunk ship
also gets a hulk token laid over it — but the escalation of the board reads backwards.

## 3. The firing camera is too close in portrait — D42

`fire_out` now solves its station from the ship's extent and the live viewport aspect, per D38.

```
fov     = aspect < 1 ? 62 : 52
halfW   = max(20, len × 0.24)            half of what must be contained: turrets, blast, hull
fit     = halfW / (tan(fov/2) × aspect) / 0.888      0.888 = |0.78, 0.30, 0.30|, the station offset
d       = clamp(fit, old landscape clamp, 240)       never closer than the pose landscape had
half    = d × 0.888 × tan(fov/2) × aspect            one half-frame at the subject, in metres
```

`hold` and `away` are now written in `half` rather than in `d`, so the muzzle sits at the same
fraction across the frame in both orientations instead of walking off the edge as the station moves.
The presenter passes `aspect: W().app.camera.aspect` — the `fleet_reform` pattern; the generator
still reads nothing live.

### Measured at the kick beat — flagship, len 115.2, gun `[0, 20, 36.5]`, pace `full`

| | portrait 390×844 | | landscape 1280×800 | |
|---|---|---|---|---|
| | before | after | before | after |
| fov | 52 | **62** | 52 | 52 |
| camera → muzzle | 48.3 m | **101.8 m** | 48.3 m | **48.3 m** |
| frame width at the muzzle | 21.8 m | **56.5 m** | 84.7 m | **84.7 m** |
| muzzle NDC.x at u = 0.80 (the frame the flash fires on) | **1.93** | **0.49** | 0.50 | 0.44 |
| muzzle NDC.x at u = 0.86 | 1.00 | 0.24 | 0.26 | 0.21 |

**NDC 1.93 is off the screen.** In portrait the muzzle was outside the frame for the first third of
the kick beat — the flash went off where you could not see it, which is precisely "we don't see most
of explosion". It is now at 0.49 and inside the frame for the whole beat.

**Landscape is untouched**: same fov, same distance to a tenth of a metre, same frame width. The
only difference is the look point, 24.7 m back down the bore instead of 28.5 m — a 0.06 NDC shift.
Intimacy preserved.

Images, all read back: `p4fire_pbefore_u086.png` (guns running off the right edge, blast off frame),
`p4fire_pafter_u086.png` and `_u094.png` (hull, trained turrets and the whole muzzle blast in
frame), `p4fire_lafter_u094.png` (landscape, unchanged in feel).

The harness poses the beat with `director.seek()` from a ctx built the way the presenter builds it,
from the **flagship** — which `firingShip()` always returns and which stands at a fixed position —
plus a fixed aim point, so both trees pose the identical shot.

---

## 4. `bridge_table`, with its control

`--shot=bridge_table --dpr=1 --w=1600 --h=900`, rendered three times: twice from P4 and once from
the control tree.

```
same code, twice     meanAbsDiff 0.0159   pixels>8  0.00%      ← the noise floor
control → P4         meanAbsDiff 0.5198   pixels>8  0.57%      luma 42.27 → 41.83
```

**It moved 33× the floor**, and the whole of it is the ~15 miss cells on the chart, which were
invisible rings and are now dark squares. Nothing else in the frame is touched — draw calls are
**identical in both trees: 71 (60 main), 47k tris**. `shots/bridge_table.png` and `.json` are
re-rendered (the manager had them flagged as broken captures anyway).

## 5. Soak — ten turns, portrait, save, reload, resume

390×844 dpr 2, mobile UA, fresh profile, cache disabled. Shell / heavy / salvo rotated over ten of
my turns, each followed by the enemy's.

```
10/10 turns fired, phase AIM throughout, reached turn 12
genuine reload proved with a boot counter: boots 1 → 2, screen 'title', resumed to turn 12
zero console errors, zero warnings, zero exceptions
```

The resumed portrait frame shows the misses from real play still on the chart —
`p4soak_resumed.png`. That is Aaron's exact use case end to end.

## 6. Budget in a live match

| | draw calls | main | texture MB |
|---|---|---|---|
| live match, portrait 390×844 dpr 2 | 63 | 46 | 39.65 |
| live match, landscape 1280×800 | 76–79 | 59–62 | 39.03 |
| `bridge_table` scenario, control **and** P4 | 71 | 60 | — |
| ceiling | — | 120 | 45 |

P4 adds no draw call: the miss marks were already one instanced mesh and still are, and `pegMiss` is
`FrontSide`, so the r160 transparent+DoubleSide double-draw quirk does not apply to it.

---

## What these tests could NOT have caught

The brief's most important instruction, so this is the longest section on purpose.

1. **No real device, and the loss is simulated.** Every context loss was
   `WEBGL_lose_context.loseContext()` in headless Chrome on a Mac. iOS Safari is a different code
   path: it may kill the tab's whole process rather than the context, may restore without ever
   dispatching `webglcontextrestored`, and may not expose `WEBGL_lose_context` at all. The `stub`
   and `noext` runs simulate the *outcome* I care about — restore does not take — not Safari's
   behaviour. **This is the same class of gap that let D40 ship.** I have narrowed it (the trigger
   now exists in the test) but not closed it.
2. **The backgrounded tab was faked** with `Object.defineProperty(document, 'visibilityState')`.
   The page never actually lost focus, was never frozen, never entered the bfcache. If iOS freezes
   timers on a backgrounded tab, my `setTimeout` windows behave differently from what I measured.
   The `visibilitychange` path is designed to carry it regardless, and it is the path all three runs
   exercised — but under a fake hidden state.
3. **The 30-second reload-loop guard is untested.** I proved a *first* reload still happens with the
   guard in place; I never proved a *second* one is suppressed.
4. **`beforeunload` on a real reload** is untested — I added `onTeardown` because I could not rely
   on it. Both firing is harmless; the save is idempotent.
5. **`fire_out` was posed, not played.** `seek()` suppresses side effects, so I re-emitted the flash
   by hand at four fixed points on the timeline. The flash's timing relative to the kick is taken
   from the code, not observed, and the **motion** of the beat at the new distance — the transit out
   through the glass, the drift as the guns go — is unverified. I looked at four stills.
6. **`fire_out` was only ever tested with the flagship**, because `firingShip()` returns it. The
   `max(20, …)` floor exists for a 36 m destroyer and has never been rendered. Nor has size 4 or 9
   ordnance, whose blast is 1.7× and 2.6× larger against the frame I sized for size 1.
7. **The miss marker was proved on two chart looks** (`holo`, which a match is played on, and
   `bridge_table`'s), in a PNG, on a desktop display. A luma-25 square on luma-58 paper separates
   cleanly in a file; on a phone in daylight it may not, and I cannot test that.
8. **Nothing was touched by a finger.** Still true from P3. Every input in every run was a
   synthesised CDP call, and the miss and fire work involved no input at all.
9. **The 500 ms `checkContext` poll** adds one `isContextLost()` per half-second for the life of the
   session. In Chrome that is a JS-side flag read; its cost in Safari is unmeasured.
10. **A restore that succeeds but comes back wrong** — a context restored with a corrupt or partial
    env map — would pass every assertion here, because I check `isContextLost()` and page luma, not
    the correctness of what was re-uploaded.

## For `DECISIONS.md`

1. **An extension fetched from a lost context is null.** `getExtension('WEBGL_lose_context')` after
   the loss returns null, so the recovery must hold the extension from before it. This is what made
   a *correct-looking* first version of the D40 fix reload every time instead of restoring — and a
   test that only asserted "the game came back" would have passed it, because reloading also brings
   the game back. Measured both ways: cached extension restores in 5 ms, freshly fetched never does.
2. **`restoreContext()` from inside the `webglcontextlost` listener is a silent no-op** in Chrome —
   the "restore allowed" flag is set from `event.defaultPrevented` after every listener has run.
   Defer it.
3. **A `pulse()` announces a result the table has not been told about yet.** The presenter resolves
   1–2.6 s before `flow.js` repaints, so every pulse for a newly resolved cell — hit as well as
   miss — looked up an instance that did not exist and expired. D40's shape again: correct code, a
   situation that never occurred. Anything that announces a change must either wait for it or be
   driven by it.
4. **A marker must draw above the lighting overlays, not just above the artwork.** The miss square
   had to move to renderOrder 5 to clear the lamp's additive sheen at 4, or the pool put light back
   into the one mark whose job is to be dark.

## Still open, not mine to close

- The sunk-vs-hit brightness inversion above.
- Portrait's play composition is unchanged and still what `MANAGER.md` calls a product call: in the
  soak frames the board sits in the bottom third under a lot of deckhead.
- `fire_out`'s new portrait framing leaves the bottom ~25% of the frame as empty sea. Defensible
  (horizon high, ship on the lower third) but a critic should look at it before it is called done.
