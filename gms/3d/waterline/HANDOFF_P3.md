# P3 — the fleet layout editor, and the fly-out that shows it happening

Pass 1 of 2. Everything in `BRIEF_P3.md` is landed. No git command that writes was run. Nothing
outside `gms/3d/waterline/` was touched.

Files changed: `js/sim/state.js` (one guard, D33), `js/world/fleet.js` (additive), `js/cine/
sequences.js` (one appended generator), `js/ui/flow.js`, `js/ui/hud.js`, `js/ui/setup.js`,
`js/ui/overlay.js`, `js/save.js`, `js/config.js` (`UI` only), `style.css`.

**One file the brief did not list: `js/ui/layout.js` is new.** The editor is ~260 lines and
`setup.js` is already 400; putting it there would have made the file the thing Aaron's comment rule
exists to prevent. It is imported by `flow.js` and by nothing else, it registers nothing, and it
cannot collide with another agent. If you would rather it lived in `setup.js` it moves whole. That
is the only liberty taken.

**`js/main.js` needed no wiring.** `hook.cine.director` and `hook.world.sky.sunDir` were already
published, and `flow.js` builds the panel into `#ui` itself, so the frozen file is untouched.

---

## 1. D33 — the guard, and the one thing it broke on purpose

`js/sim/state.js:183` now reads

```js
if (game.phase !== 'SETUP' && game.phase !== 'PLACING' && game.phase !== 'AIM') throw …
```

The untouched-board guard on the next line is byte-for-byte unchanged. `game.phase` still resolves
to `AIM` afterwards (both sides have ships, so the existing ternary lands there), and `sideToMove`,
`turns` and the log length are untouched.

- **`node sim.mjs 2000`** — ok, every invariant held. 2000 games, 121,361 shots, 0/150 fleets
  recovered from the public seed.
- **`node tools/purity.mjs`** — ok, 12 files pure.

**`tools/adversarial_sim.mjs` G5 flips from HELD to BROKEN, and that is the ruling landing, not a
regression.** Its own text says so: *"It is legal mid-game for whichever side has not been fired on
yet."* D33 decided that trade. **G5b was already BROKEN before P3** — I verified it by restoring
`git show HEAD:js/sim/state.js` into the control tree and re-running: G5 held, G5b broke. G5b is
about `setBoard` in `PLACING` rewriting an emitted `place` event, which my change does not reach.
K4 and L1 are also pre-existing.

The real closing condition, measured rather than assumed: `sim.fire(g, 1, …)` writes your board the
instant the enemy's turn *starts*, not when its presentation ends. So the window is "until the enemy
opens fire", which in practice is your whole first turn plus the 260 ms gap. Confirmed live —
`layoutLocked()` returns the committed reason 9 s into the enemy's beat, while the shell is still in
the air.

---

## 2. The entry point

`.hud-own` is now a `<button data-fleet>` inside a `.hud-own-slot` wrapper, with an accessible label,
a focus ring and an active state. Nothing about the grid or the roster changed.

**The cue.** `hud.cue(on)` shows a callout under the box reading *"Your fleet — tap to change it"*,
with an arrow at its top edge pointing at the box. It has `pointer-events: none` and sits 9 px
*below* the box, so it cannot eat the tap it is asking for. `save.js` gains a `seen` section
(`{ fleet: true }`), validated in `sane()` like every other section.

It is written when the cue is **shown**, not when it is used — so it appears exactly once per player
— and it is also cleared the moment the box is opened, on `fire`, and on any screen change. Measured
across two matches in one session:

| | cue on screen | `save.seen` |
|---|---|---|
| match 1, 1.2 s after the board goes live | **true** | `{fleet:true}` |
| match 1, immediately after tapping the box | false | `{fleet:true}` |
| match 2, settled | **false** | `{fleet:true}` |

It only appears when the box would actually do something: `maybeCue()` refuses if `layoutLocked()`
is truthy, and re-checks at the end of its delay.

---

## 3. The panel

Portrait-first. A square board sized `min(100%, 62vh)` with `--cols`/`--rows` from the match, ships
absolutely positioned in **percent** so the whole thing rescales, and a bottom row of thumb-sized
buttons. Verified on 10×10 and on ladder rung 8 (**12×12, seven ships**) — the grid adapts, all
seven render, and a save round-trips.

- **Shuffle** — `scatterFleet(w, h, fleet)`, lifted out of `showPlace()`'s closure to module scope in
  `setup.js` and now called from both. `showPlace`'s `auto()` is four lines and its private
  `fallback()` is gone; the packed-placement fallback moved with the scatter. There is one scatter,
  not two, and definitely not three.
- **Drag** — pointer events, `touch-action: none`, snap-to-cell with the grab offset preserved so
  the hull does not jump under the thumb. 8 px of slop separates a tap from a drag.
- **Rotate** — a 44 px round control at the ship's far end, which is the one place a thumb holding
  the ship is not already covering. A second tap on an already-selected ship also rotates, which is
  Aaron's "tap again to rotate". Turning about the anchor; if that runs her off the board she is
  clamped back onto it, and if the board is too narrow for her at all the grid flashes.
- **Conflict, live.** Overlap is red **and hatched** — the first version drew two overlapping hulls
  as one contiguous red block and you could not see there were two of them. Save is disabled and the
  status line says why. Adjacency is a **dashed amber outline** and a soft note; nothing is blocked
  and the sim's rules are untouched.
- **Undo** — a 40-deep stack, pushed before every drag, rotate and shuffle; disabled when empty.
- **Cancel** — closes without calling `setBoard`. Asserted: the sim's board is character-identical
  after a drag, an undo and a cancel.
- **Read-only** — after the enemy has fired, the same board at the same size with the reason line at
  the top, `Close` as the only action, the hulls stepped back to outlines, **the enemy's resolved
  cells drawn on your water**, and a damage line (`1 cell hit · 0 into open water · 0 lost`) in place
  of the editing advice. Reasons, all observed live:

| when | line |
|---|---|
| the enemy has resolved a shot on you | *The enemy has your range. Your fleet is committed for the rest of this battle.* |
| your shot is still being presented | *A shot is still in the air. The fleet can be moved once it lands.* |
| the opening flyover is still running (turn 0, busy) | *Wait for the bridge to settle.* |
| the enemy is to move | *The enemy is firing. Wait for your move.* |

The turn-0 case is separate on purpose: during the opening there is no shot in the air and saying
there is would be a lie, which is the whole point of having a reason line.

---

## 4. `fleet.reform()` — the escorts steam

`layout()`'s station solver is factored out to `stations(side, list)` — the rng draw order per ship
is unchanged, so every existing layout is bit-identical (proven by the scored renders below).

`reform(side, view, { ms })` takes the same argument as `layout()` and, instead of disposing and
rebuilding, **keeps every handle and tweens it**. Ships are paired by fleet slot, which is safe
because `validatePlacements` rejects any list whose `placements[i].len` differs from `fleet[i]` — so
lengths and ids are index-stable across a `setBoard`, and the flagship's slot (the longest ship)
cannot move. A mismatch falls back to `layout()`.

Each escort gets a **quadratic Bézier** whose control point is offset perpendicular to the run by
0.14 of its length, and a three-point heading blend `θ_from → θ_course → θ_to` where
`θ_course = atan2(−Δz, Δx)` — a ship points local +X, so that is the heading that has her bow along
her own track. She turns out of her berth, runs, and turns onto her new heading. A straight lerp
slides her sideways like a chess piece; you can see the difference in `p3M_M4_moving.png`.

The tween is driven from `fleet.update(dt)`, **not** from a camera beat. That is deliberate: it
means the ships re-form whether or not the cutscene is on, and skipping the cutscene only has to
call `finish()`. `handle.start()` / `finish()` / `bounds` are the whole interface. `layout()` drops
any voyage in flight, because its legs hold handles it is about to dispose.

`bounds` is the circle containing every hull at **both** ends of the move plus the flagship at the
origin — that is what the camera has to frame, and it has to be known before a ship has moved.

---

## 5. The fly-out

One new generator, `fleet_reform`, appended to `sequences.js`. The eight existing ones are untouched
and `SEQUENCE_IDS` is unchanged (the ids are frozen; `director.has()` finds the new one).

Five beats, 7.24 s total: out through the glass (620 ms) → climb (1500) → **hold while the escorts
move** (3200, `UI.layout.reformMs`) → descend (1300) → settle on the board (820). `ctx.start` fires
`move.start()` at the top of the hold, so the ships get under way exactly when the camera arrives.

**Two things had to be solved rather than authored, and both were found by rendering.**

**(a) A fixed bird's-eye pose cannot work in both orientations.** The formation is widest *across*
the line of sight, so the binding constraint is the horizontal half-angle — and at 390×844 that is
`tan(fov/2)·0.462` against landscape's `tan(fov/2)·1.78`, nearly four times tighter. A pose framed
at 16:9 crops a third of the fleet away in portrait. So the station is solved:

```
fov  = aspect < 1 ? 70 : 54
PHI  = 30°                                     camera elevation above the fleet
d    = clamp( R·0.95 / (tan(fov/2)·min(1,aspect)·cos PHI), 260, 900 )
look = centroid + (0, 0.11·d·tan(fov/2), 0)    raising the look point puts the fleet low in
                                               frame and brings the horizon down into it
```

`R` and the centroid arrive through `ctx` from `fleet.reform().bounds`, and the aspect through `ctx`
too — nothing is read from live world state at compile time. Measured stations: **portrait
d ≈ 880 m, y 455**; **landscape d ≈ 660 m, y 339**. Both frame the whole fleet.

**(b) D32 applies to this shot too, and my first version broke it.** The first station was out over
the bow at `+Z` looking back — which is *away* from the sun, and D32's exact complaint: orange water
with no light source in frame to explain it. I have that render (`p3_c3_birdseye_portrait.png`) and
it is flat. The station now stands on the far side of the fleet **from the sun** (`ctx.sunX/sunZ`
from `sky.sunDir`) and looks back across it into the sunset, so the shot has a glitter path running
up the frame, the horizon and cloud in the top fifth, and the enemy line silhouetted 900 m out.
Compare `p3c_c3_birdseye_portrait.png`.

**Controls.** `overlay.cutscene({ label, option, checked, onSkip, onOption })` is a fourth shape
alongside `panel`/`toast`/`note`/`slate` — a strip at the bottom of the frame with **Skip** and a
**"Don't show this again"** checkbox. It never waits for a tap and it never dims what it sits on.
The checkbox writes `settings.flyout`, and `showSettings()` gains a **Fly-out** row
(`Watch the fleet re-form` / `Change the layout without it`). Read back through the UI: setting it
to `off` in the pause panel writes `{cine:'auto', place:'auto', sound:true, flyout:'off'}`, and with
it off the save is instant, the ships still take their new stations, and a toast says so.

**The HUD leaves the frame.** `body.wl-cine` fades `.hud-top` and `.hud-bar` out for the duration.
Without it the ordnance bar and the own-grid box sit over a bird's-eye of the sea — I have that
render too. It is one class, added and removed in a `finally`, plus a belt-and-braces removal in
`go()`, so the HUD's own state machine is untouched.

---

## 6. Measurements

### Skip and watch land the same board — the assertion the brief asked for

Both runs pinned `Math.random` and `crypto.getRandomValues` so the board, the layout seed and the
dramatised enemy are identical, then shuffled and saved the same proposed layout. **Watch** ran the
full 7.2 s; **skip** pressed Skip at t = 3.2 s, during the hold.

| | watch | skip |
|---|---|---|
| `sim.view().ships` | `[[5,2,1,h],[4,6,3,v],[3,1,8,v],[3,8,4,h],[2,7,5,h]]` | **identical** |
| flagship world pose | `x 0, z −16.1, ry −1.571` | **identical** |
| escort 1 | `x −116.8, z 116.8, ry 1.518` | **identical** |
| escort 2 | `x 196.6, z −190.5, ry 1.433` | **identical** |
| escort 3 | `x −54.7, z 188.7, ry 0.043` | **identical** |
| escort 4 | `x 36.1, z 161.0, ry 0.176` | **identical** |
| screen · phase · side · turns · busy | `play · AIM · 0 · 0 · false` | **identical** |

**What that assertion could not have caught**, stated because D24 requires it:

- It compares the sim board and each hull's **x, z and heading**. It says nothing about a ship's
  damage, list, roll phase, wake vertex buffer or plume — a skip that left one of those mid-tween
  would pass this.
- It samples the **end state only**. A skip that flashed a wrong frame, dropped the exposure at the
  wrong moment, or left the camera somewhere odd for 200 ms before `aim.take()` caught it would pass.
- Skip was pressed **once, during the hold**. Skipping during the climb or the descent is untested,
  and those are the beats where `move.start()` has not fired yet (climb) or the ships are already
  home (descent).
- It is one board, one seed, one fleet composition.

### Draw calls, live match, both orientations

Headless, `--headless=new`, cache disabled, fresh profile, pinned entropy. Sampled inside
`stats.endFrame` (P2's note: a sampler on `app.add()` reads zero). **Ceiling is 120 main.**

| | portrait 390×844 | landscape 1280×800 |
|---|---|---|
| settled, board | 93 / **77 main** / 16 shadow / 94.7k tris | 75 / **59** / 16 / 78.1k |
| opening peak | 93 / 77 / 16 | 96 / 80 / 16 / 106.4k |
| editor panel open | 93 / 77 / 16 | 75 / 59 / 16 |
| **fly-out peak** | **105 / 98 / 16 / 107.6k** | **114 / 98 / 16 / 127.3k** |
| settled after the fly-out | 88 / 72 / 16 / 88.1k | 82 / 66 / 16 / 86.0k |
| shell turn peak | 98 / 82 / 16 | 113 / 97 / 16 |
| salvo turn peak | 108 / 91 / 17 | 123 / **106** / 17 |
| heavy turn peak | 108 / 91 / 17 | 123 / **106** / 17 |
| texture MB | 39.03 settled · **39.61** after ordnance | identical |

**The fly-out peaks at 98 main in both orientations, against 120.** It costs +21 main over the
settled board in portrait and +39 in landscape, because at 300–450 m the whole own fleet, the enemy
line and the far ocean rings are all in frustum at once — but it is still below the salvo transient,
which is the pre-existing 106 `MANAGER.md` already tracks (125 at its worst seed). Textures and
programs do not move: the fly-out loads nothing.

### The three scored scenarios have not moved

`tools/shot.mjs --dpr=1 --w=1600 --h=900`, against a **pre-P3** control tree built by
`scratchpad/wl_p3_revert.py` — which reverts `config.js`, `sequences.js` and `fleet.js` (the only
three files a `?shot=` capture can reach; `flow.js` returns before it does anything under `?shot=`
and `style.css`'s additions are all inside `#ui`, which `body.shotmode` hides) and **refuses to run
unless every replacement matches exactly once**.

Rendered **interleaved** B,A,B,A so that every pairing has a control taken adjacent in time — P2's
D-next(e) says a same-code control is only valid next to what it controls for.

| | before↔after (pass 1) | before↔after (pass 2) | same-code controls | verdict |
|---|---|---|---|---|
| `bridge_table` | 0.0189 | 0.0100 | 0.0161 · 0.0131 | within |
| `guns_fire` | 0.5539 | 2.8610 | 2.0199 · 0.6355 | within the family's spread |
| `sea_dusk` | 0.0187 | 0.0725 | 0.0273 · 0.0660 | within |

`guns_fire`'s two cross values (0.55, 2.86) bracket its two same-code values (0.64, 2.02) — the
diff tracks elapsed wall-clock, not which tree, exactly as D-next(e) describes. And the counters
settle it: **rendered from both trees, every counter is identical.**

| | calls | main | shadow | tris | mainTris | programs | textures | geometries | texMB |
|---|---|---|---|---|---|---|---|---|---|
| `bridge_table` | 71 | 60 | 11 | 47,152 | 41,868 | 29 | 26 | 66 | 33.67 |
| `guns_fire` | 28 | 22 | 6 | 55,044 | 47,124 | 23 | 24 | 31 | 36.51 |
| `sea_dusk` | 3 | 3 | 0 | 30,288 | 30,288 | 5 | 7 | 13 | 33.67 |

### Soak — ten turns, portrait, save, reload, resume

`scratchpad/wl_p3soak.mjs`, a copy of P2's `wl_soak.mjs` with the editor and the full fly-out run
**before** the first shot and ten of my turns instead of eight (shell · heavy · shell · salvo ·
shell · shell · heavy · shell · salvo · shell). Result: every turn fired and resolved, turns 0→12,
phase `AIM` throughout, portrait camera **y 20.26 against a 20.68 deckhead**, and **zero console
errors and zero exceptions** — `Runtime.exceptionThrown` and error/warning console events were
captured on every probe and all were empty.

**A harness correction worth recording.** That soak's resume check reads
`document.querySelectorAll('button')`, which finds the **hidden HUD's** buttons — `.hud[hidden]` is
`display:none` but `querySelectorAll` returns it anyway. A reload that never happened therefore
looks like a pass. I re-ran resume properly (`scratchpad/wl_p3resume.mjs`): a `window.__RELOAD_MARK`
set before navigating, a cache-busting query, and the title read from `.screen-setup` rather than
from the document:

| | observed |
|---|---|
| marker after the reload | `undefined` — the page really did reload |
| screen | `title`, offering `Carry on` / `Discard` |
| after Carry on | `play`, turn 2 |
| **the edited layout** | `[[5,4,4],[4,4,6],[3,2,3],[3,0,6],[2,8,2]]` — **identical before and after** |
| panel after resume | correctly locked, with the committed reason |
| console errors | none |

### Awkward moments, all observed live

| | result |
|---|---|
| box tapped 2.5 s into the opening flyover | read-only, honest reason, `Close` only; cancelling does not disturb the opening |
| box tapped while it is already open | no-op |
| Save with nothing moved | no cutscene, toast *"Fleet unchanged"*, turn untouched |
| a shot armed, then panel opened and cancelled | still armed — `F6 · 1 cell`, FIRE still enabled |
| Cancel after a drag and an undo | sim board character-identical |
| fly-out `off` in settings | instant save, ships still re-form, toast |
| ladder rung 8 (12×12, 7 ships) | grid adapts, save and fly-out both work |

---

## 7. What my tests could not have caught

- **All of it is headless SwiftShader** at DPR 1–2. No fps, GPU-time or thermal claim is made; D4
  says only Aaron's device can gate that. The fly-out is the heaviest thing in the game by triangle
  count (127k landscape) and it is 7 s long.
- **Every drag was a CDP mouse event, not a finger.** `setPointerCapture`, `touch-action: none` and
  the pointer maths are exercised; multi-touch, a system gesture cancelling mid-drag, iOS's
  long-press magnifier, rubber-band scroll, and Safari's own pointer quirks are **not**. This is the
  single biggest hole in this pass and it is exactly the part Aaron cares about.
- **Portrait was emulated, not held.** Safe-area insets, the iOS URL bar collapsing mid-drag, and a
  rotation *during* the fly-out are all untested.
- **The reform's mismatch fallback never fired.** `reform()` falls back to `layout()` when the
  lengths do not line up; no test produces that, so the branch is reasoned, not observed.
- **Two escorts can pass through each other** during the move. The Bézier paths are not
  deconflicted — only their endpoints are, by `standOff()`. I saw one near-miss in
  `p3_f_3600.png` and it read as a close manoeuvre rather than a bug, but a worse pair would not.
- **Draw calls are one board per orientation.** The fly-out's count depends on how many hulls fall
  in frustum, which depends on the layout it is showing. I did not sweep seeds.
- **The read-only damage line counts a ship lost only when every one of its cells reads `sunk`.** I
  saw it at 0 hit / 1 miss / 0 lost and at 1 hit / 0 lost. A partly-hit ship, and a sunk ship whose
  cells the sim marks differently, are untested.
- **No blind critic has looked at the fly-out.** I judged the framing myself against D32, which is
  the failure mode D24 warns about — the critic looks at the artefact, the author looks at a number
  he chose.
- **Accessibility was read out of the DOM, never heard.** The aria-labels and the Enter/Space rotate
  path exist and the labels are correct (`Ship of 5, D4, down`); no screen reader was run.
- **Boards of 6×6 and 16×16 were never opened in the editor.** 10×10 and 12×12 were.
- **The fly-out was never interrupted** by a context loss, a resize or a backgrounded tab. P2's
  restore path is registered and would fire, but a loss *during* `fleet_reform` is untested — and
  the ships' tween is driven by `fleet.update(dt)`, which uses the app's clamped `dt`, so a long
  stall stretches the move rather than jumping it.
- **No console errors in any run.** That is not the same as no bugs.

---

## 8. What I did not do, and what is still open

1. **The fly-out ignores `PACE`.** It is always 7.24 s, where a turn-13 shot is 1.4 s. In practice
   the editor is only reachable on turn 0, so pace never applies — but if D33 is ever widened, this
   wants scaling.
2. **`cine: 'off'` also suppresses the fly-out**, on top of the `flyout` setting. I read "off — stay
   on the table" as covering it. One line if that is wrong.
3. **The panel is a full-screen overlay over a dimmed board.** It is an editor with an explicit
   Cancel and it is dismissable, so it is not the modal-interruption shape Aaron dislikes — but it
   is the closest thing in the game to one, and it is worth him seeing before it is called done.
4. **The rotate control can overlap a neighbouring ship** when the selected ship is against the far
   edge; it is clamped 0.3 of a cell inside the board and floats above everything, so it is always
   reachable, but it can sit on top of another hull.
5. **The landscape fly-out has only a sliver of sky.** The look-point lift is one constant (0.11) for
   both orientations; portrait gets a fifth of the frame as sky and landscape gets about 3%. Making
   it aspect-aware is one line, but it pushes the near escorts toward the bottom edge and I would
   want a render before doing it.
6. **The fleet's bounding circle is conservative.** `bounds` is a circle, so a formation strung out
   along one axis is framed as if it were square and ends up smaller than it needs to be. An
   oriented box would fill the frame better.

---

## 9. For `DECISIONS.md`

- **D-next(a) — D33 deliberately breaks `adversarial_sim`'s G5, and G5b was already broken.**
  Verified against a control tree with the pre-P3 `state.js`: G5 held, G5b broke. Anyone reading a
  future adversarial run should not treat G5 as a regression. G5b (rewriting an emitted `place`
  event in `PLACING` rather than appending a corrective one) is a real, older, unaddressed finding
  that D33 now makes reachable more often.
- **D-next(b) — a framing camera cannot be an authored pose on a mobile-first game.** Portrait's
  horizontal half-angle is `tan(fov/2)·0.46` against landscape's `tan(fov/2)·1.78`. A bird's-eye
  authored at 16:9 crops a third of the subject away at 390×844. `fleet_reform` solves its station
  from the subject's bounding radius and the viewport aspect, arriving through `ctx` — the same
  shape as `aim.js`'s `solve()`, and for the same reason.
- **D-next(c) — D32 is a rule about the camera, not about the opening.** "A dusk sea seen from above
  with no sun in frame reads as broken" applies to *any* beat that looks down at water, and my first
  fly-out reproduced the fault exactly. The fix is compositional: stand on the far side of the
  subject **from the sun** and look back across it. `sky.sunDir` is the only input that needs.
- **D-next(d) — pointer capture belongs on a container that survives the repaint.** The editor
  repaints its ship elements on every cell a drag crosses. Capturing on the dragged element loses
  the gesture the first time it moves; capturing on the grid, which is never rebuilt, does not.
- **D-next(e) — two overlapping hulls drawn in one colour read as one hull.** The conflict state had
  to become a hatch, not just a fill, before a player could see that there were two ships in the
  same water. Found by rendering, not by reasoning.

One harness note worth not paying for twice, in the same family as P2's two:

- **`document.querySelectorAll('button')` finds the hidden HUD.** `.hud[hidden] { display: none }`
  does not remove it from the DOM, so a probe that identifies a screen by its buttons will report
  the *title* screen as present when the page is on `play`, and — worse — will report a reload that
  never happened as a successful resume. Identify a screen by `document.body.dataset.screen`, or
  query inside `.screen-setup`, and prove a reload with a marker on `window`.

---

## 10. Images, all read back with the Read tool

All under the scratchpad
(`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`).

| what | file |
|---|---|
| **the cue on the own-grid box, portrait 390×844** | `p3_b0_cue_portrait.png` |
| **the cue, landscape 1280×800** | `p3_a0_play.png`, `p3L_L0_cue.png` |
| **the editor mid-drag with an overlap conflict, portrait** | `p3_b2_conflict_portrait.png` |
| the same, landscape | `p3_a2_dragged.png`, `p3L_L1_conflict.png` |
| **the rotate control on a selected ship** | `p3_b3_rotate_portrait.png`, `p3L_L2_rotate.png` |
| **fly-out — leaving the bridge** | `p3c_c1_leave_portrait.png`, `p3M_M1_leave.png` |
| **fly-out — the bird's-eye, escorts moving** | `p3c_c3_birdseye_portrait.png`, `p3w_f_3600.png`, `p3M_M4_moving.png` |
| fly-out — over the flagship on the way down | `p3c_c4_moving_portrait.png` |
| **fly-out — back on the board** | `p3M_M6_board.png`, `p3w_g_settled.png` |
| the first, D32-breaking version of the shot (kept for comparison) | `p3_c3_birdseye_portrait.png` |
| **the read-only panel with its reason line and the enemy's marks** | `p3ro_h_readonly.png`, `p3L_L4_readonly.png` |
| the panel during the opening flyover | `p3O_O1_during_opening.png` |
| a 12×12 ladder rung in the editor | `p3M_N1_rung8.png` |
| pause → Settings with the Fly-out row | `p3P_P1_settings.png` |
| the scored trio, before/after/controls | `p3_shots/B1/`, `A1/`, `B2/`, `A2/`, `p3_cnt/` |

Harnesses, all copies and none of them an edit of the originals: `wl_p3.mjs` (shared),
`wl_p3a.mjs` (smoke), `wl_p3b.mjs` (portrait editor + fly-out strip), `wl_p3c.mjs` (skip vs watch,
read-only), `wl_p3d.mjs` (landscape, refusals, fly-out off), `wl_p3e.mjs` (landscape frames, ladder
rung 8), `wl_p3f.mjs` (awkward moments), `wl_p3g.mjs` (the cue once per player, settings),
`wl_p3calls2.mjs` (draw calls), `wl_p3soak.mjs` (the soak), `wl_p3resume.mjs` (resume, properly),
`wl_p3_revert.py` (the control tree). Nothing in the repo was written by any of them.
