# SF-ACT — the act-two state machine, the boss bar, and the ending

The game has an ending now. This is the file that runs it, plus the two pieces of UI that had
been written months ago and never called once.

| file | what changed |
|---|---|
| `game/js/sim/act.js` | **new** — the nine-state machine, contract §3.6 |
| `game/js/sim/index.js` | wires the runner, the NPCs, the act machine, `camLock`, `?act=` |
| `game/js/ui/index.js` | `boss:spawn` / `boss:phase` / `boss:dead` → the boss bar; `ui.victory()` |
| `game/js/ui/overlays.js` | the victory screen |
| `game/js/ui/world.js` | `style: 'none'` — the Seam's bubble, which is the absence of one |
| `game/js/core/progress.js` | the act state, the seen-cutscene set and the win count now persist |
| `game/js/main.js` | `?act=` implies `?nointro`; the take methods on `stubAudio()` |

Nothing outside that list was touched.

The run this was built for — **walk east from the road → the stones scene → the vigil's waves →
the fire scene opens the gate → through the breach → the glade scene → the arena seals → the boss
with a working health bar → the after scene → the victory screen → Again and Stay** — has been
played end to end headless, in both orientations, with the cutscenes played and again with every
one of them skipped, plus a refresh in the middle of the boss fight. §10 has the transcripts.

---

## 1. The state machine — `sim/act.js`

```js
import { createAct, ACT_STATES } from './act.js';
const act = createAct(ctx, world, { story, level: levelMod });

act.update(dt)                 // from the play scene, after world.update
act.state                      // 'road'|'stones'|'vigil'|'fire'|'approach'|'glade'|'arena'|'boss'|'won'
act.set(state)                 // jump to a state COLD — this is what ?act= calls
act.rebuild({ marks, director, story, level, state })   // from the play scene's enter()
act.marks   act.stubbedLevel   act.destroy()
ACT_STATES                     // the nine, in order
```

Published as `window.__sunderfall.act`, and the runner as **`window.__sunderfall.storyRunner`**,
so a person retiming scenes once the mp3s land can drive both from the console:

```js
__sunderfall.act.set('glade')          // jump, cold, with the world caught up
__sunderfall.storyRunner.skip()        // end the scene now, running its remaining cues
__sunderfall.storyRunner.scrub(28)     // step to 28s deterministically (SF-STORY's test hook)
```

`storyRunner`, **not** `story` — `ctx.story` is already `story/script.js`, the `SPEAKER` table
`ui/index.js` resolves bubble styles from. Overwriting it (which this file did for an hour) leaves
every speaker falling back to the default bubble, including the Seam's.

### Transitions as built

| state | entered by | what it does on entry | leaves when |
|---|---|---|---|
| `road` | boot | director → `sunderwood`, pressure on | `player.x > marks.stones.a − 60` (7440) |
| `stones` | ← road | pressure off, `story.play('stones')` | the scene's promise resolves |
| `vigil` | ← stones | pressure off, director → `ruinreach`, three growing waves | all three waves dead, **or** 90s |
| `fire` | ← vigil | `director.clear()`, `story.play('fire')` — snuffs the brazier, opens the gate | scene resolves |
| `approach` | ← fire | `openGate()`, director → `glyphglade` at 0.8 intensity, pressure on | `player.x > marks.glade.x − 60` (8700) |
| `glade` | ← approach | `director.clear()`, `story.play('glade')` | scene resolves |
| `arena` | ← glade | pressure on at full intensity | `player.x > marks.seal.x` (9620) |
| `boss` | ← arena, or `act:boss` | `sealArena()`, pressure off, `director.spawnBoss(marks.arena.bossX, bossY, marks.arena)` | `boss:dead` |
| `won` | ← boss | `director.clear()`, `story.play('after')`, then the victory screen | — |

Three things drive transitions and nothing else does: the exit predicate in `update()`, the
scene promise from `story.play()`, and two bus events (`boss:dead`, `act:boss`).

**`act:boss`** is the runner's `boss.start` cue. No scene in `story/scenes.js` currently fires
it — the arena's own `x > 9620` trigger is the live path — but the handler is wired and guarded
(`idx(state) < idx('boss')`), so a future script can start the fight from a cue without the two
paths fighting.

### The wave table

Three waves at the brazier, spawned relative to `marks.stones`, each only after the last is dead:

1. 3 husk + 2 sporeling
2. 3 husk + 2 thornhound + 1 gloamarcher
3. 3 thornhound + 2 gloamarcher + 2 wispmaw + 1 stonewarden

Pressure is **off** for the whole vigil — the waves are the encounter, and trickle spawns on top
of them made "are they all dead yet?" unanswerable for the player and for the exit predicate.
90s is a hard ceiling either way (§3.6), so a wave that gets stuck behind geometry cannot strand
the run.

---

## 2. Cold entry — the one code path for "arrive here"

`?act=<state>`, a refresh, and a death all go through `act.set(name)`:

1. `catchUp(name)` — everything the earlier states did to the *world*: `openGate()` at
   `approach` and beyond, `sealArena()` at `boss` and beyond.
2. `placePlayer(ENTRY_X[name])` — moves the boy, sets his respawn point, snaps the camera.
3. `onEnter(name, cold = true)`.

One path, not three, is the point: if `?act=boss` works then a refresh mid-boss works, because
they are the same three lines.

`ENTRY_X` is read against `REGION` in `sim/glade.js` — breach 7600–7970, track 7960–8520,
plateau 8520–9100, drop 9100–9500, plug 9300–9540, seal trigger 9620, boss 10300:

```
road 470   stones 7380   vigil/fire 7470   approach 7990
glade 8600   arena 9160   boss 9760   won 10100
```

Move any of those and check it against `REGION` first. `arena` in particular must land **west**
of 9620 or the seal trips before the player has walked into the bowl.

---

## 3. Persistence and death

`core/progress.js` gained one field inside the existing v1 blob (no version bump — old saves
just have no `act` and start on the road):

```js
progress.act = { state: 'road', seen: {}, wins: 0 }
progress.setAct(state, seenId)   // either may be null; `seen` is merged, never replaced
progress.recordWin()             // ++wins, state = 'won', flushes immediately
progress.actOnBoot               // what was on disk, or null
```

- **A cutscene is `seen` only when `story.play()` resolves.** Dying under one leaves it unseen,
  so it replays; watching it to the end retires it. That is the "seen to the end" vs "was on
  screen when I died" distinction from the brief, and it falls out of *where* `setAct(null, id)`
  is called rather than needing any death-time bookkeeping.
- **Death rewinds to the start of the current state.** `player:died` re-writes the act state as
  it stands and bumps `epoch` so any in-flight scene promise is ignored. The restart's
  `enter()` → `rebuild()` re-enters that same state cold, which places him at its `ENTRY_X`.
  Dying to the boss puts him back in the arena, not at the stones.
- **`rebuild()` trusts `progress.act.state`, not its own local copy.** This is load-bearing:
  "Start over" and the victory screen's **Again** both call `progress.clear()` and nothing else,
  so a machine reading its own memory restarted a brand-new run in `won`, on a victory screen, in
  an arena it had never walked to.

### Resuming a finished save — the decision, and why

A save that has closed the seam comes back into `won` **cold**: no `after` scene, no victory
screen (§3.6 says a finished player does not sit through the ending again, and the victory
screen is part of the ending), control returned, and one line of toast — *"You already closed it.
Nothing left out here."*

The alternative was to restore the wreckage and hold the last frame. That is not possible and
pretending otherwise would be the dishonest option: `progress.js` has never saved the world, by
design, so the arena rebuilds intact with the Seam gone and the stonework standing. Saying so and
letting him walk is the simplest thing that is true. The way out is "Start over" in the pause
menu, which already works. `progress.act.wins` counts them, for whatever wants it later.

---

## 4. The boss bar

`ui.boss()` / `ui.bossDamage()` and the whole of `hud.js`'s `drawBoss` — phase pips, ghost
damage trail, hit flash, wings — had never been called by any line of code in the repo. Four
handlers in `ui/index.js` are the entire wiring:

- `boss:spawn` → `ui.boss({name, subtitle: phaseName, hp, maxHp, phases?, entity})`
- damage → **polled**, not evented. There is no `enemy:damage` on the bus (ARCHITECTURE §4.6
  never reserved one) and adding one would mean a bus event per hit on every enemy in the game.
  `ui.update` compares `st.boss.entity.hp` against the mirror once a frame.
- `boss:phase` → new subtitle + a hit flash
- `boss:dead` → `ui.boss(null)`, which plays the bar's own close animation

**The bar collides with the toasts in portrait.** `ui/layout.js` puts the toast column at
`focus + 22` and the boss bar at `focus + 34`, so the stack grows straight down through the bar.
Nobody had seen it because nothing had ever spawned a boss. `ui/index.js` now translates the toast
stack below the bar while one is up, scaled by the bar's own reveal so it slides rather than jumps.

> **REQUEST → whoever owns `ui/layout.js`:** give `L.toast` a portrait `y` that accounts for
> `L.boss`, and delete the translate in `ui/index.js`'s `render()`. Landscape is unaffected — the
> bar is top-centre there and the toasts are bottom-left.
>
> While you are in there: portrait's `L.boss.y = L.focus.y + L.focus.h + 34` leaves 34px for a
> title stack that `drawBoss` renders at `y − 24` and `y − 10`, so "THE SEAM" sits right on the
> focus bar's bottom edge. Cramped rather than broken, and I did not want to add a second
> translate hack on top of the first — 46px would clear it.

**Phase thresholds.** `enemies/units/theseam.js` keeps `PHASES` module-local and does not export
it, and its `boss:spawn` payload does not carry the thresholds. So `ui/index.js` takes them from
the event when the spawner supplies them and falls back to the generic two-pip bar otherwise, and
`sim/act.js` sets `[0.72, 0.44, 0.16]` on the live bar in its own `boss:spawn` handler. One copy
on this side of the fence, not two.

> **REQUEST → whoever next owns `enemies/units/theseam.js`:** export `PHASES` (or put
> `phaseAt: [0.72, 0.44, 0.16]` on the entity's data in `onSpawn`). `ui/index.js` already reads
> `d.phaseAt` if it exists; the day it does, delete `SEAM_PHASES` from `sim/act.js`.

---

## 5. The victory screen

`ui/overlays.js`, beside the death screen and deliberately not shaped like it.

The death screen is a slab: full scrim, 7px backdrop blur, a blood-red title centred in the void.
The frame behind it does not matter because the frame behind it is where you died. The victory
screen inverts every one of those choices — the panel sits **low**, the scrim is a vignette with
**no blur**, the title is gold, and the last frame of the wreckage is the thing you are looking
at. `ui.blocked` stops the sim (`main.js`), so it genuinely is held, not merely paused-looking.

Two buttons and deliberately no third:

- **Again** — *"A clean run — nothing kept"*. Calls `api.quit()`, i.e. the existing `ui:quit`:
  hard-reset the spells, `progress.clear()`, re-enter `play`. A fresh run keeping nothing,
  the save included.
- **Stay** — dismiss, hand the controls back, keep walking the wreckage. Entirely local; it
  emits nothing.

`ui:restart` and `ui:quit` were emitted for months with nothing listening, and the only way out
of a dead run was a page reload. A third event name would have repeated that exactly, so there
isn't one. **Stay** is focused rather than **Again**, because Enter must never wipe a save.

The extra CSS lives in a `<style id="sf-victory-css">` injected by `overlays.js`, because
`ui/ui.css` belongs to another agent. Fold it into that file whenever its owner next opens it;
the victory node already carries `sf-death` so it inherits the panel/grid/row layout.

---

## 6. `ui/world.js` — the Seam has no bubble

`style: 'none'` (SF-SCRIPT request 1). No panel, no fill, no edge, no tail, no name tag: the
letters hang in the air where a voice would be, and the missing panel *is* the effect — a tail
points at the body that is speaking and there is no body.

Drawn a glyph at a time so each character drifts on its own slow cycle. That is the whole trick
and it is worth the per-glyph `measureText`: a block of text that moves as one is a caption;
letters that move independently are not coming from a mouth. Centred rather than left-ragged,
because without a panel a ragged left edge reads as a missing box. Vayne's serif at Vayne's pace
with none of his tremble, which is what is wrong with it.

The pop-in easing is skipped too — `easeOutBack` is a panel *arriving*, and nothing arrives.

---

## 7. URL parameters

| param | effect |
|---|---|
| `?act=<state>` | boot straight into any of the nine, cold and playable. **Shipped, not a test hook.** Implies `?nointro` unless the state is `road`. One-shot: after the first build the machine's own state governs, so a death during an `?act=boss` session still rewinds rather than re-arriving. An unknown value warns and lists the nine. |
| `?nosave` | (existing) disables persistence. Every headless URL needs it or the run inherits the last one's save — **except** the reload test, which is the one thing that needs the save. |
| `?nointro` `?scene=play` `?autostart` | (existing) tested with each; `?act=` composes with all three. |
| `?noenemies` | (existing) the act still runs: the vigil warns and skips to `fire`, the boss warns and `boss` never exits. Do not use it to test the ending. |

Standard harness URL: `?nointro&nosave&autostart&scene=play&dpr=1&preserve=1&act=<state>`

---

## 8. Integration notes for the neighbouring modules

- **`world.camLock`** — `updateCamera()` in `sim/index.js` returns immediately while it is true.
  Contract §3.2 step 3. Get this wrong and the play scene damps toward the player while the runner
  damps toward the shot; the camera creeps off its mark and it reads as a bug in the runner.
- **Tick order** in `sim/index.js`'s `update`: `world.npcs.update(dt)` → `story.update(dt)` →
  `world.update(dt)` → `barks` → `director` → `act.update(dt)` → camera. NPCs go **first**,
  before the runner, because `npcs.update(dt)` with no source tag is what *claims* the tick; the
  runner calls `update(dt, 'story')` as a fallback and defers once claimed. Ticking them after the
  runner double-steps them on the first frame of the first scene.
- **Render order**: `world.render(alpha)` → `world.npcs.render(alpha)` → lights →
  `story.render(alpha)` → debug, all inside `R.begin`/`R.end`.
- **`world.marks`** is set by `act.rebuild()`; the runner's `fire.snuff` reads
  `world.marks.stones.brazier` from it.
- **`world.openGate` / `world.sealArena`** are re-bound by `act.rebuild()` to the act's own
  guarded wrappers (`buildLevel` binds them directly first; the act's binding wins because
  `rebuild` runs last in `enter()`). So the runner's `gate.open` cue and the `approach`
  transition go through one door. Both underlying functions in `sim/glade.js` are already
  idempotent on `marks.gate.open` / `marks.seal.closed`; the act's booleans exist so `catchUp`
  knows what it has already done to a world it did not build.
- **`barks.setFlag`** — `sim/index.js` replays `progress.act.seen` into it on every `enter()`, so
  a reloaded run keeps the Ostrick callbacks that `barks.js` gates on the `stones` flag
  (SF-SCRIPT request 4).

### Where the code on disk diverges from `ACT-TWO-CONTRACT.md`

1. **`openGate` / `sealArena` live in `sim/glade.js`**, not `sim/level.js` (§3.5). `level.js`
   re-exports both, so the contract's import path still works and `sim/act.js` uses it.
2. **Scene durations are not 44s** (§3.1's example): stones 67, fire 29, glade 63.5, after 54.
   Any harness timeout has to be built from those, not from the contract.
3. **No scene fires `boss.start`** (§3.3, §3.6). The arena's positional trigger is the live path.
4. **`world.bounds.x1` is 11400** as the contract asks, but the terrain grid is 768 cells from
   x = −1024 and therefore ends at **11264**. There are no cells between 11264 and 11400.
   `REGION.wallX` (11160) is what actually stops the player, so this is currently harmless — but
   anything that lets him past that cliff walks off the end of the world. Raise `cols` in
   `createTerrain` if the arena ever grows east.

---

## 9. Gotchas

1. **`groundY` scans downward from where you tell it, and this level is full of overhangs.**
   `placePlayer` originally scanned from y = −1400 and the rock face's brow is a solid slab from
   x 7380–7900 at y −2000..−1300 (it is there to stop the wall climb), so the scan started
   *inside* it, reported the brow as the ground, and the physics ejected Rook upward. `?act=stones`
   put him on the roof of the level, from where he walked east over a closed gate into the glade.
   It now scans from `groundAt(x) − 400`, which is under every brow and over every prop. Any new
   code that places anything by `groundY` in movement four has the same trap waiting.
2. **`enter()` runs again on every restart.** `createAct` is called once, at scene construction;
   `act.rebuild()` runs per enter. Every bus subscription is in `createAct`, so there is exactly
   one of each for the life of the page — the leak `sim/index.js` already guards `view:change`
   against.
3. **`ui.blocked` stops `scenes.update`**, so the act machine, the runner and the world all
   freeze under any overlay. That is what makes the victory screen hold on the last frame. It also
   means nothing you add to the act machine can be relied on to tick under a modal.
4. **Stale scene promises.** `story.play()` returns a promise that can resolve long after a death
   or a state jump. Every `playScene` captures `epoch` and drops the result if it has moved.
   Without it, dying during the stones scene advanced you to the vigil 40 seconds into the
   restarted run.
5. **A runner that never resolves would soft-lock the whole game**, since `busy` gates every
   transition. `SCENE_WATCHDOG` (150s of sim time, ~2.2× the longest scene) clears it and logs.
6. **`toDataURL()` on the WebGL canvas hangs forever during the boss fight** under
   `--headless=new` + SwiftShader — the failure `tools/shot.mjs` documents, and it does not error,
   it just never returns. Screenshot the 2D HUD canvas (`#sf-canvas`) instead during the fight, or
   put a timeout on the CDP eval. This cost two dead test runs before it was recognised.
7. **`hasTake()` answers false with no user gesture** (SF-STORY), so a headless run selects no
   voiced barks. Deliberate. Don't "fix" it.
8. **The scene `cam.y` values in `story/scenes.js` are wrong against the built level** — the
   stones sit near y = −2000 and the scenes ask for −180. The runner clamps and warns, so scenes
   play correctly; the data is being corrected separately. **Do not compensate for it anywhere
   else** or it will be corrected twice.

---

## 10. How it was verified

Headless Chrome over raw CDP, driving real input through `input.setAction(a, on)` — the recipe in
`tools/shot.mjs`, with `--enable-unsafe-swiftshader --use-gl=angle`. Every URL carries `&nosave`
except the persistence test, which is the one thing that needs the save.

The harness is an in-page autopilot rather than a script of timed key presses: it holds east,
taps jump when it stops making progress, backs off west when a jump wedges it under a ledge,
answers the spell offer by clicking the first card, **presses Again on the death screen**, and
keeps Rook's HP topped up. That is what makes a 7-minute unattended playthrough possible; the
alternative is a script that dies at the first thornhound and tells you nothing about the act flow.

The death-screen click is not optional and cost a whole dead test run to learn: the death screen
blocks the sim, nothing else dismisses it, so a run that dies without handling it does not fail —
it *stops*, silently, wherever it fell, and every subsequent step reports the same frozen state
until the budgets run out. If an automated run ever reports a state that never advances, look for
an open modal before you look at the act machine.

The whole autopilot is one `Runtime.evaluate` and worth keeping — paste it into any CDP session
against the game and it will walk itself to the boss:

```js
window.__auto = { walk: 1, kill: false, immortal: true, lastX: -1, stuck: 0, longStuck: 0,
  tick() { const A = window.__auto, c = window.__sunderfall, w = c.world, p = w && w.player;
    const card = document.querySelector('#sf-ui .sf-choice:not([hidden]) .sf-card'); if (card) card.click();
    const again = document.querySelector('#sf-ui .sf-death:not([hidden]) .sf-btn'); if (again) again.click();
    if (!p) return;
    if (A.immortal && p.alive) { p.hp = p.maxHp; p.invuln = Math.max(p.invuln, 1.2); }
    if (A.kill) for (const e of w.ents.live.slice())
      if (e.alive && e.kind === 'enemy' && e.tag !== 'theseam') w.damage(e, 99999, 0, { ignoreInvuln: true, src: p });
    if (!A.walk || !p.alive || c.ui.blocked) { c.input.setAction('right', false); c.input.setAction('left', false); return; }
    c.input.setAction(A.walk > 0 ? 'right' : 'left', true);
    c.input.setAction(A.walk > 0 ? 'left' : 'right', false);
    if (Math.abs(p.x - A.lastX) < 8) { A.stuck++; A.longStuck++; } else { A.stuck = 0; A.longStuck = 0; }
    A.lastX = p.x;
    if (A.stuck >= 2) { A.stuck = 0; c.input.setAction('jump', true); setTimeout(() => c.input.setAction('jump', false), 140); }
    // jumping onto a ledge can wedge him under the next one — reverse out
    if (A.longStuck > 7) { A.longStuck = 0; A.walk = -1; setTimeout(() => { A.walk = 1; }, 1600); }
  } };
setInterval(() => { try { window.__auto.tick(); } catch (e) {} }, 260);
```

**The full run, played (1440×900), zero page errors:**

```
boot            road    x=470
at the stones   stones  x=7499  ctl=false camLock=true
vigil begins    vigil   x=7499  ctl=true            seen=stones
fire scene      fire    x=7499  ctl=false camLock=true
gate open       approach x=7641 gateOpen=true       seen=fire,stones
at the glade    glade   x=8706  ctl=false camLock=true
arena           arena   x=8880                      seen=fire,glade,stones
boss up         boss    x=9705  sealed=true   bar: 2600/2600 "widening"
hit 0/8         2380/2600 phase 1 → 604/2600 phase 3
boss dead       won     ctl=false camLock=true      wins=1
VICTORY         won     victory=true blocked=true   seen=after,fire,glade,stones
victory DOM     "The seam is closed" / Level=6 Took=5:55 Slain=30 Broken=152
                buttons ["Again — A clean run, nothing kept", "Stay — Walk the wreckage"]
                backdrop-filter: none        (the death screen's is blur(7px) saturate(0.7))
press Stay      victory=false blocked=false ctl=true
walking again   x=11129
```

**The same run with every cutscene skipped** (`storyRunner.skip()` the frame each scene starts —
the same path a tap takes), 1440×900, zero errors and zero warnings:

```
at the stones   stones  x=7515            skips=1  seen=stones
vigil begins    vigil   x=7516            skips=1
gate open       approach x=7656 gateOpen=true      seen=fire,stones
at the glade    glade   x=8716            skips=2
arena           arena   x=8892            skips=3  seen=fire,glade,stones
boss up         boss    x=9678 sealed=true  bar: 2600/2600 "widening"
boss dead       won     victory=true      skips=4  seen=after,fire,glade,stones  wins=1
victory DOM     identical text, identical buttons, backdrop-filter: none
press Stay      victory=false blocked=false, walked on to x=10802
```

**The world ends up in the same state.** Checkpoint by checkpoint, played vs skipped: stones
7499/7515, vigil 7499/7516, approach 7641/7656 (gate open in both), glade 8706/8716, arena
8880/8892, boss 9705/9678 (sealed in both, same bar), and the same `seen` set in the same order.
The number that differs is the clock: **5:55 played, 1:19 skipped** — the cutscene time and
nothing else. Skipping the fire scene still opens the gate, which is the assertion that matters,
and it is true twice over: the runner runs the cue on skip, *and* `approach`'s `onEnter` calls
`openGate()` unconditionally.

Skipping also marks a scene **seen**, deliberately: the runner has run every remaining cue, so the
world is in the state a full play would have left it, and replaying it on the next reload would be
punishing someone for skipping.

**Portrait, 390×844, same run** — a straight pass, zero errors, zero warnings, and the numbers
land within a few pixels of landscape at every checkpoint (stones 7470, vigil 7511, approach 7651
gate open, glade 8721, arena 8933, boss 9714 sealed, victory, Stay, walked on to 10683). Portrait
is not a squeezed landscape here: the camera zooms in and the glade cutscene composes properly
inside the letterbox.

**All nine states cold-booted** via `?act=<state>`: each lands on ground, in the right control
state, with the world caught up — gate open from `approach`, arena sealed from `boss`, the Seam
spawned with `pips=[0.72,0.44,0.16]` from `boss`, and a quiet arena with control returned from
`won`.

**Persistence, death and wipe** (`run-reload`, no `&nosave`):

```
1 at boss        act=boss  saved=boss  gateOpen sealed  bar 2600/2600
2 after reload   act=boss  ← reloaded with NO ?act= at all: came back to the boss
3-4 die          act=boss  saved=boss
5-6 press Again  act=boss  x=10704 lvl=2   ← the ward rewound the run, not the story
7-8 Start over   act=road  x=470  save cleared and re-written as 'road'
```

**The victory screen in both orientations** (measured, not eyeballed — see gotcha 6):

| | panel | fits | sits low | bottom gap | blur | focus |
|---|---|---|---|---|---|---|
| 1440×900 | 620×471 @ (410,413) | yes | yes | 16px | none | Stay |
| 390×844 | 376×495 @ (16,333) | yes | yes | 16px | none | Stay |

No horizontal page scroll in either. **Stay** closes it, unblocks the sim and runs its callback.

**Two portrait HUD checks that needed real scene time** (`?act=<state>&dpr=1`, capturing
`#sf-canvas` — the 2D HUD layer, which `toDataURL` is safe on):

- `?act=boss` — `catchUp`'s `openGate()` fires the BREACH toast at the same moment the bar opens,
  which is the collision case. With the push in place the stack sits cleanly *below* the bar; a
  spell-learn and a no-free-circle toast landed underneath it and stayed clear too.
- `?act=glade` — the Seam speaks at t = 19.4. `ui.bubbles.live` reports `seam:Rook.`, and the
  capture shows the line hanging as bare glowing letters with a visibly uneven baseline: no panel,
  no edge, no tail, no name. `style: 'none'` is doing what SF-SCRIPT asked for.

---

## 11. Things I saw that are not mine

Filed rather than fixed — none of these are in my file list.

- **The rock face renders as a flat black slab.** `/tmp/sf-full/play-1440x900/f4-breach.png`: after
  the gate opens, the `NOBREAK` `cliff()` mass at x 7660–7900 fills a third of the frame as pure
  black with no wall texture and no lit edge, so it reads as a hole in the world rather than as
  stone. The same mass is what the brow is made of, so it shows up again either side of the
  breach. `sim/glade.js` / terrain lighting.
- **`story/scenes.js` `cam.y`** — already known, already clamped by the runner, already being
  corrected. Listed only so the next reader does not re-diagnose the warning in the console.
- **The wreckage is very dark.** `/tmp/sf-full/skip-1440x900/f9-stay.png` is Rook walking the
  arena after **Stay**, and the collapse itself is exactly right — arches down, columns broken,
  rubble everywhere. But the Seam *was* the arena's key light (`R.light` at intensity 1.5 + 0.25
  per phase) and it dies with the boss, so the frame the victory screen is supposed to be held on
  loses most of its illumination at the moment it matters. The contract calls this "the best the
  game ever looks"; it currently is not. Whoever owns the arena's lighting should leave something
  burning — the braziers `buildGlyphglade` places would do it — or ramp ambient up as the Seam
  closes.
- **A head-height slab at x 6980** (`T.box(6980, -470, 220, 40)` in `sim/level.js`) wedges anyone
  who jumps onto the 6560 platform: its underside is ~6px above a standing player's head, so you
  can neither walk under it nor jump onto it. It is the exact defect the Sunderwood ledges have a
  comment about. A ground-route player never meets it; my autopilot did, twice, and had to learn
  to reverse out.

---

## 12. What I would do next

1. **The vigil is untuned.** Three waves and a 90s cap were picked to be *provable*, not to be
   good. Nobody has played it at a real level with real spells; the wave sizes want a pass with a
   human, and wave 3's stonewarden may be a wall rather than a climax.
2. **`fire.snuff` should be idempotent across a resume.** Reloading into `approach` or later
   rebuilds the level with the brazier lit, because catch-up only replays gate and seal — the
   brazier is a prop, not geometry. Two lines in `catchUp` once someone exposes a snuff that can
   be called without the runner.
3. **A phase-change beat for the boss.** `boss:phase` currently only moves the subtitle. The Seam
   speaks in Vayne's voice and the phase shifts are the obvious place for it; `SPEAKER.seam` and
   `style: 'none'` are both already there.
4. **The pause menu should say where you are.** It has "The wood waits" hard-coded as a subtitle;
   `act.state` would make it "The stones. Hold them." and cost one line.
5. **Delete `SEAM_PHASES`** the moment `theseam.js` exports its thresholds (§4).
