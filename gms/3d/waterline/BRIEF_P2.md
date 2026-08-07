# P2 — the match opens at noon and turns to dusk, and it survives the tab going to sleep

You are the only coder agent running. P1 has just landed (`HANDOFF_P1.md`): the fleets are now the
right way round, the bridge stands on a real flagship, and the resting camera is under the deckhead.
Read that handoff before you start — it changed `fleet.js`, `sequences.js`, `bridge.js`, `ship.js`
and one line of `flow.js`.

Then read `DECISIONS.md` **D32**, which is the ruling this brief implements, plus the standing rules
at the bottom of that file. `MANAGER.md` has the traps.

## 1. Time of day — D32

Aaron, after playing on a phone:

> When game first starts it starts at dusk? or early morning? It makes the water look orange/red,
> without seeing the sun to show sunset it looks strange... When we land in the bridge though — the
> sunset looks amazing! but that is because of the angle difference i think.
> So to fix. always start at day-time, and once in bridge, show time-of day for game being set to:
> 18-hundred or whatever and then shift over a few seconds to that 'scenario'.

He has diagnosed it correctly. The flyover looks *down* at the water, where a dusk sea has colour
but nothing in frame to explain it. From inside the bridge you are level with the sun and it reads.

**What to build**

- `js/ui/flow.js` `playScene()` currently opens at `dusk`. Open at **`noon`** instead.
- Once the camera has settled on the bridge — after `present.open()` resolves in `opening()` — put a
  short slate on screen stating the hour, then **ease the grade from `noon` to `dusk` over a few
  seconds**. Aaron's phrasing is "18-hundred or whatever": pick a time that matches the dusk grade's
  own sun elevation (`GRADES.dusk.elev` is 2.6°) and state it the way a ship's log would.
- The slate is not the dramatisation caption. `js/cine/caption.js` is C6's and is gated by
  `shouldShow()`; do not reuse it. Build a small element of your own, or use C7's `overlay`. Aaron
  dislikes anything modal — this must not block a tap.
- A resumed match (`opening(false)`) skips the flyover. It should also skip the slate and land
  **already at dusk** — you are coming back to a match, not starting one.

**The mechanism, and its two traps**

`js/world/sky.js` `GRADES` holds three **authored end states**, not samples of a sun path — the
comment at `sky.js:15` says so, and the colours were derived by inverting ACES against the plates.
So the transition is a blend between two authored grades. Nothing about it is physical, and
`setTime()` (which snaps to the nearest grade) is not the tool.

- `applyGrade()` fires the grade listeners, which is how `lighting.js` and `ocean.js` repaint. You
  want that every frame of the blend.
- `get env()` regenerates the **PMREM** whenever `envDirty` is set. Running that per frame for four
  seconds is a stall. Do not.

**Hard constraint: the end state must be pixel-identical to today's `playScene()`.** That is what
Aaron already likes and signed off. In particular, `main.js:65` assigns `app.scene.environment =
sky.env` **once at boot** — it is a getter, evaluated then and never re-read during a match. So the
bridge is currently lit by a *noon* env map under a *dusk* sky, and that is the look he called
"amazing". **Do not reassign `scene.environment`.** Note it in your handoff; it is a real oddity and
may be worth a phase-2 experiment, but not here.

Prove the end state: render the settled bridge pose before and after your change and diff. Per D13 a
pixel difference means nothing until you have a same-code control, so take one.

## 2. Coming back from sleep — Aaron's fourth item

> Make sure after the mobile browser (probably desktop as well) returns from sleep/minimization etc.
> resets itself, I just noticed returning and parts looked bad/dark, i needed to refresh page and
> return to game for it to look good again.

The likely cause is **WebGL context loss**. Mobile browsers drop the GL context on a backgrounded
tab and the page gets it back empty; three.js re-uploads what it can, but anything living in a
render target does not survive — and that includes the sky's PMREM env map, which is precisely the
thing whose absence would make the scene "look bad/dark". There is **no `webglcontextlost` handler
anywhere in the project**; I checked.

Do not guess. **Reproduce it first**, then fix it, then prove the fix on the same reproduction:

```js
const gl = renderer.getContext();
const ext = gl.getExtension('WEBGL_lose_context');
ext.loseContext();              // wait a beat
ext.restoreContext();
```

`js/engine/app.js` is yours for this (it is not frozen; `main.js` is). Handle `webglcontextlost`
with `preventDefault()` and `webglcontextrestored` by rebuilding what cannot re-upload itself: the
env map, the shadow map, the AA/post render targets, and any material that needs a recompile.
`app.resize()` and `renderer.shadowMap.needsUpdate` are part of it. If some resource genuinely
cannot be rebuilt in place, a **one-line reload is an acceptable last resort** — the match is
already saved on `visibilitychange` (`flow.js:116`) and resume works — but only for that resource,
only after you have shown the in-place path fails, and never as the first response to a
backgrounded tab.

Also check the plain case with no context loss: `visibilitychange` back to visible after a long
pause. `dt` is clamped to 0.1 s in the loop so accumulators should be safe, but confirm rather than
assume, and say which of the two you actually reproduced. If you could only reproduce one, say so
plainly — "I could not reproduce the other" is a result.

## What you own

`js/world/sky.js`, `js/engine/app.js`, `js/ui/flow.js`, `js/ui/overlay.js`, `style.css`, and the
`CINE`/`UI` blocks of `js/config.js` if the timing wants a constant.

**Do not touch:** `js/sim/`, `js/world/fleet.js`, `js/world/ship.js`, `js/world/bridge.js`,
`js/cine/sequences.js` — P1 has just rewritten those and a third agent follows you into
`js/ui/hud.js` and `js/ui/setup.js`. `js/main.js` is frozen; if you need wiring there, ask.

Every scored scenario picks its own grade explicitly through `sea()` / `sceneSetup()` / `shots.js`.
None of them may move. Prove it on at least `sea_dusk`, `sea_noon`, `bridge_table` and `guns_fire`:
`tools/shot.mjs --shot=<id> --dpr=1 --w=1600 --h=900` (never `--dpr=2 --w=1280 --h=720`; it has hung
for three independent parties).

## How to prove it

Drive the real game headless over CDP. Working harnesses, both in the scratchpad at
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`:
`wl_soak.mjs` (boots, plays ten turns, portrait, resume) and `wl_probe2.mjs`. Copy, do not edit in
place. Both set `Network.setCacheDisabled` and a fresh `--user-data-dir`, and both are load-bearing
(D28). Note the trap in D36: `awaitPromise: true` on `flow.fire()` waits for the entire turn.

Deliver:

1. a frame from the opening flyover under the noon sky, and the same flyover's last frame
2. the slate on screen, legible
3. a sampled trace of the grade blend — some scalar that moves, at ≥5 points across it — and the
   frame count over which the PMREM regenerated (it must not be every frame)
4. the settled bridge pose after the blend, diffed against today's, with a same-code control
5. a resumed match landing at dusk with no slate
6. the context-loss reproduction: a frame showing the damage, and the same frame after your fix
7. the four scenario renders unchanged
8. draw calls and texture MB from a live match, before and after. Ceiling is 120 main.

## Budget

Two passes, then I review. A crash or an API error does not consume a pass. Write `HANDOFF_P2.md`:
what changed, what you measured, **what your tests could not have caught**, and anything that
belongs in `DECISIONS.md`.
