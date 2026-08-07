# P4 — three defects Aaron found on his phone, all three already diagnosed

You are the only coder agent running. P1, P2 and P3 have landed — skim `HANDOFF_P1.md`,
`HANDOFF_P2.md`, `HANDOFF_P3.md` for what they changed.

Read `DECISIONS.md` **D40, D41 and D42** first. They are the rulings this brief implements and they
carry the measurements — I reproduced all three before writing this, so you are not diagnosing, you
are fixing. Then the standing rules at the bottom of that file, and `MANAGER.md` for the traps.

---

## 1. The game still comes back dark — D40

> Returning to the website again after a while looked dark!? a refresh still needed?

P2 added `webglcontextlost` / `webglcontextrestored` handlers and proved them by calling
`ext.loseContext()` **and then `ext.restoreContext()`**. A phone does not call `restoreContext()`.
Nothing does. So the handler is correct and never runs.

Reproduced at 390×844, no manual restore:

```
after loseContext()                 lost: true,  frames 2072
after a full hidden → visible trip  lost: true,  frames 2732
```

Still lost. The rAF loop rendered 660 more frames into a dead context; the canvas is black with the
HUD sitting on top of it. I have the screenshot; it is exactly what Aaron describes.

**Build the recovery the page drives itself.** On returning to visible, ask `gl.isContextLost()`. If
it is lost: call `restoreContext()` where `WEBGL_lose_context` is available, wait a short bounded
window for `webglcontextrestored`, and if it does not arrive — or the extension is not there —
**reload the page**. The match is saved on `visibilitychange` (`flow.js`) and resume works, so a
reload costs a load screen and nothing else. Do not reload on a plain backgrounded tab; only on a
context that is actually lost.

Consider also parking the render loop while the context is lost — 660 frames of drawing into a dead
context is wasted battery on the device that just told you it was short of memory.

**Test it the way it actually happens: `loseContext()` and never restore.** If your test calls
`restoreContext()` you have rebuilt P2's mistake. Prove both paths — restore-succeeds and
restore-never-arrives — and show a screenshot of the game alive again on each.

## 2. The miss marker cannot be seen — D41

> On the Game board — I think it is meant to show a dark square where you have fired a shot? But I
> think that is a bit buggy? as that stopped working during a game, and i started a new game and i've
> tried shell, heavy and salvo and none of them show a dark square on the game board. the hits are
> showing though.

Nothing is broken. Measured after five deliberate misses: `table:pegMiss` count 3, `visible: true`,
drawn every frame. It is invisible, for three compounding reasons:

- the material is **`AdditiveBlending`** (`js/world/materials/table.js`, `pegMiss`), so it can only
  add light. A dark square is not reachable from it at any colour.
- it is a thin ring at `[0.20, 0.32, 0.44]` — about a quarter the brightness of the hit mark's
  `[0.85, 0.24, 0.09]`.
- **the chart is already covered in thin cyan rings** — compass roses and depth contours. A ring is
  the one shape that cannot read as a marker on this chart. Look at the chart before you choose a
  shape.

**Make a resolved-miss cell read as a filled cell darker than the chart around it**, per D41. That
means non-additive blending. Aaron's instinct is the right design and it is also what a real plot
looks like: something laid *on* the chart rather than glowing *through* it.

While you are here, check the same question for the hit and sunk marks and for the transient
`pulse()` — the pulse is `[0.5, 0.8, 1.1]`, brighter than the permanent mark it announces, which is
very likely what Aaron saw "working" before it "stopped". A marker that is dimmer than its own
announcement is a bug of the same family.

`js/world/materials/table.js` and `js/world/table.js` are C2's files. You own them for this.
**`bridge_table` is a scored shot and the chart is most of it** — expect it to move, render it, and
report the number honestly rather than trying to hold it still. Moving it is acceptable here; not
knowing by how much is not.

## 3. The firing camera is too close in portrait — D42

> When we shoot, i can now see the ship/gun (on mobile) but it is very close, the guns barely show on
> the screen, so we don't see most of explosion? maybe zoom out just a little more?

`fire_out` in `js/cine/sequences.js` stations at `d = clamp(len × 0.45, 30, 60)` with **no aspect
term**. At `len` 115 that is ~52 m. Portrait's horizontal half-angle is `atan(tan(fov/2) · 0.46)` ≈
12.6°, so the frame is about **23 m wide** at that distance against a 115 m ship. Landscape gets
~89 m — nearly four times as much.

D38 already ruled exactly this and P3 applied it to `fleet_reform` but did not back-fit `fire_out`,
which was written first. **Apply it.** Solve the station from the ship's own extent and the live
viewport aspect so the hull, the trained turrets and the muzzle blast are all in frame in portrait,
and landscape does not lose the intimacy it currently has.

Aaron's "we don't see most of explosion" is about the muzzle blast at the gun, not the impact 900 m
away. The flash is emitted by `ctx.flash` inside the kick beat (P1 §4) — check it is fully in frame,
not cropped at an edge.

Portrait is the orientation that matters. Render it at **390×844** and look at it before and after.

---

## What you own

`js/engine/app.js`, `js/ui/flow.js`, `js/world/table.js`, `js/world/materials/table.js`,
`js/cine/sequences.js`, and the relevant blocks of `js/config.js`.

**Do not touch:** `js/sim/`, `js/ui/layout.js`, `js/ui/hud.js`, `js/ui/setup.js`, `js/world/ship.js`,
`js/world/fleet.js`, `js/world/bridge.js`, `js/world/sky.js`. `js/main.js` is frozen — if you need
wiring there, say so and I will rule on it.

Scenario renders: `tools/shot.mjs --shot=<id> --dpr=1 --w=1600 --h=900` (never
`--dpr=2 --w=1280 --h=720`; it has hung for three independent parties). Per D13 a pixel diff means
nothing without a same-code control, and per P2's finding that control must be rendered **next to**
what it controls for, because the harness settles a fixed number of frames rather than a fixed
amount of simulated time.

## How to prove it

Drive the real game headless over CDP. Working harnesses in the scratchpad at
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`:
`wl_soak.mjs` (ten turns, portrait, save, resume), `wl_ctx2.mjs` (**the loss-with-no-restore
reproduction — start from this one for item 1**), `wl_miss.mjs` (fires five deliberate misses by
reading the true enemy board, for item 2), `wl_p3check.mjs` (real touch events). Copy, do not edit in
place. All set `Network.setCacheDisabled` and a fresh `--user-data-dir` (D28).

Two harness traps that have already cost this project time: `awaitPromise: true` on `flow.fire()`
waits for the entire turn (D36); and `document.querySelectorAll('button')` finds the **hidden** HUD,
so identify a screen by `document.body.dataset.screen` and prove a reload with a marker on `window`
(D39).

Deliver, as images read back with the Read tool and as measurements:

1. context lost with **no** manual restore, then recovered — screenshots of the black canvas and of
   the game alive again, on both the restore-succeeds and restore-never-arrives paths
2. the miss marker on the chart at 390×844 and 1280×800, before and after, with several misses down;
   and a statement of how it reads against the chart's own rings
3. `bridge_table` re-rendered, with the size of the change stated and its same-code control
4. `fire_out` at the muzzle flash, portrait 390×844, before and after, plus landscape unchanged in
   feel
5. a full soak after your changes — ten turns, portrait, save, reload, resume — **zero console
   errors**
6. draw calls and texture MB in a live match. Ceiling is 120 main; a recent match reads 77–85 main
   and 39 MB against 45.

## Budget

Two passes, then I review. A crash or an API error does not consume a pass. Write `HANDOFF_P4.md`:
what changed, what you measured, **what your tests could not have caught**, and anything that
belongs in `DECISIONS.md`.
