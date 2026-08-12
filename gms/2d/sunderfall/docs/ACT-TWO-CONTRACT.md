# SUNDERFALL — Act Two contract

**The game currently has no ending.** The road stops at x=7700 against a rock face, the boss
(`enemies/units/theseam.js`) is fully written and wired to `director.spawnBoss` — and *nothing calls
it*. There is no arena, no win state, no dialogue system, and `interact` is in `core/input.js`'s
ACTIONS list with nothing consuming it.

This file is the contract for finishing it. It is to `ARCHITECTURE.md` what a work order is to a
building code: **ARCHITECTURE.md still wins on anything it covers.** Four agents build to this in
parallel on strictly disjoint file sets. If you need something from another agent's file, it is
specified below; build to the spec and do not reach into their file. If the spec is wrong, write the
objection into your handoff and work around it.

---

## 1. What act two is

Ostrick told Rook to keep the fire lit. The fire goes out. That is the whole plot.

```
  x 7440   THE STONES     cutscene 2 — Keeper Ostrick (script already written, VOICE-AND-MUSIC §8)
  x 7550   the vigil      a defence encounter at the brazier: hold the stones
  x 7550   THE FIRE       cutscene 3 — the brazier is snuffed; the rock face cracks open
  x 7900   the breach     carved through the old dead end; scorched track climbing east
  x 8700   THE GLADE      cutscene 4 — back where Vayne died. The Seam speaks in his voice.
  x 9600   the arena      the way closes behind him. Boss: the Seam.
  x 10300  ── boss ──
           AFTER          cutscene 5 — victory. Ostrick returns with the elders. Too late.
```

Five cutscenes in the finished game: **intro** (built), **stones**, **fire**, **glade**, **after**.

### The story beats, so everyone writes toward the same ending

- Vayne handed the job to whoever was standing there. Ostrick handed it over with a *plan*, which is
  worse. Both walked away. Rook has now been left twice.
- The Seam has no voice of its own. It uses **the last one it heard** — so at the glade it speaks
  with Vayne's voice, and gets it slightly wrong: too even, no tremble, and it repeats itself. It is
  not doing an impression to hurt him. It does not know that is what it is doing.
- Rook wins by **closing the seam the way Vayne did** — spending what he has. The ward is what
  survives him doing it. He lives because the old man already paid.
- The elders arrive after it is over and have nothing to say. Ostrick does the talking. The last
  line of the game belongs to Rook, and it is about the goats.

---

## 2. File ownership — nobody writes outside this list

| Agent | Owns (exclusively) |
|---|---|
| **SF-STORY** | `game/js/story/runner.js` *(new)*, `game/js/sim/npc.js` *(new)*, `game/js/core/audio.js`, `game/js/core/audio/vo.js`, `game/story-test.html` *(new)* |
| **SF-LEVEL** | `game/js/sim/level.js`, `game/js/sim/glade.js` *(new)* |
| **SF-ACT** | `game/js/sim/act.js` *(new)*, `game/js/sim/index.js`, `game/js/ui/index.js`, `game/js/ui/overlays.js`, `game/js/core/progress.js`, `game/js/main.js` |
| **SF-SCRIPT** | `docs/SCRIPTS-ACT-TWO.md` *(new)*, `game/js/story/scenes.js` *(new)*, `game/js/story/script.js`, `game/js/sim/barks.js`, `docs/VOICE-AND-MUSIC.md`, `DESIGN.md` |

Handoffs go to **`docs/handoff/<agent>.md`** — a new file per agent, not `HANDOFF.md`. Four agents
appending to one file concurrently will lose work. The orchestrator merges them.

---

## 3. The interfaces

Everything below is the contract. Build to it exactly; it is what lets four agents land at once.

### 3.1 Scene data — `story/scenes.js` (SF-SCRIPT writes, SF-STORY consumes)

Same shape as the intro's `BEATS`, because `ui.say()` already eats it.

```js
export const SCENES = {
  stones: {
    id: 'stones',
    duration: 44,                 // seconds; the runner ends here even if a beat overruns
    letterbox: 0.10,              // fraction of screen height, top and bottom. 0 = none
    cast: [                       // NPCs the runner spawns for the scene
      { who: 'ostrick', x: 7570, face: -1, enter: 'stand' },
    ],
    cam: { x: 7530, y: -180, zoom: 1.15, ease: 1.2 },   // where the camera goes, and how fast
    beats: [
      { t: 0.6, dur: 2.6, who: 'ostrick', text: "Don't touch the stones.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: null },
      // ...
    ],
    cues: [                       // one-shot stage directions, fired when time crosses t
      { t: 0.0,  fx: 'cam.hold' },
      { t: 32.0, fx: 'ostrick.leave' },
    ],
  },
  fire: { ... }, glade: { ... }, after: { ... },
};
```

- `who` — a key in `SPEAKER` (`rook` | `vayne` | `ostrick` | `seam`).
- `anchor` — `'rook'` | `'ostrick'` | `'seam'` | `'world'`. With `'world'`, `ax`/`ay` are absolute
  world coordinates; otherwise they are an offset from that actor.
- `take` — which recording the line lives in: `'rook'` | `'vayne'` | `'ostrick'` | `'rook2'` |
  `'vayne2'`. `vo: [offset, length]` is seconds into **that file**.
- **`vo` is `null` for every new line until the mp3s exist.** The scene must play, correctly timed,
  with no audio at all. Timings are pasted in later and nothing else changes.
- `cues` a scene declares are listed per scene in §3.3.

### 3.2 The cutscene runner — `story/runner.js` (SF-STORY)

```js
import { createStoryRunner } from '../story/runner.js';

const story = createStoryRunner(ctx, world);

story.play('stones')       // → Promise, resolves when the scene ends or is skipped
story.playing              // bool — true from the first frame to the last
story.current              // scene id or null
story.skip()               // end it now, run every remaining cue instantly
story.update(dt)           // called by the play scene BEFORE world.update
story.render(alpha)        // letterbox + anything the runner draws itself
story.reset()              // wipe state on a level rebuild
```

**What `play()` must do**

1. `world.playerControl = false`, and `ctx.input.releaseAll()` — a held stick during a cutscene is
   the input trap that has already cost this project two sessions (`ARCHITECTURE` aside; see
   `HANDOFF.md` playtest-fixes-14).
2. Spawn the scene's `cast` as NPCs (§3.4) and let them play their entrances.
3. Take the camera. The play scene's own `updateCamera` must not fight it — the contract is that
   **`world.camLock = true` means `sim/index.js` leaves `cam.x`/`cam.y` alone**, and the runner
   damps the camera to `scene.cam` itself. SF-ACT wires the check in `sim/index.js`.
4. Run beats: at each `t`, `ctx.ui.say({who, text, dur, x, y})` and, if `vo` is set,
   `ctx.audio.voice(vo[0], vo[1], { take })`.
5. Fire cues as time crosses them.
6. On finish or skip: despawn cast that left, `world.camLock = false`, `world.playerControl = true`,
   `bus.emit('story:done', { id })`. **Restoring control is not optional and not conditional** — an
   early return that skips it soft-locks the game.

**Skipping.** Any tap, any key, at any time. Show the same "tap to skip" affordance the intro uses.
Skipping must leave the world in exactly the state a full play would have: run every remaining cue
in order, immediately, then finish. A player who skips the fire scene still gets the gate open.

**Pausing.** If `ctx.ui.blocked` is true the runner does not advance — `main.js` already stops the
sim there and a cutscene running under a pause menu would talk to itself.

### 3.3 The cues each scene fires

The runner implements these. Anything not listed is a no-op with a `console.warn` — a typo in a
script must never throw inside a cutscene.

| cue | what it does |
|---|---|
| `cam.hold` | stop following, sit on `scene.cam` |
| `cam.to` | pan to `cue.x`, `cue.y` over `cue.dur` |
| `cam.shake` | `R.fx.shake(cue.a, cue.d)` |
| `ostrick.leave` | NPC walks west at speed and despawns off-screen |
| `ostrick.arrive` | NPC walks in from the west and stops beside Rook |
| `elders.arrive` | three NPCs walk in from the west behind Ostrick and stand there |
| `rook.walk` | Rook's sprite walks to `cue.x` under the runner's control |
| `rook.kneel` | held pose, used at the staff |
| `fire.snuff` | the brazier at `world.marks.stones.brazier` goes out — see §3.5 |
| `gate.crack` | dust and a shake off the rock face; no geometry change yet |
| `gate.open` | `world.openGate()` — see §3.5 |
| `seam.speak` | the tear's glow pulses under a line; drives the `seam` bubble style |
| `seam.reveal` | the arena's light shifts violet, the tear becomes visible on the horizon |
| `boss.start` | `bus.emit('act:boss')` — SF-ACT spawns it |
| `staff.take` | Vayne's staff prop at the glade is picked up and vanishes |
| `fade.out` / `fade.in` | a full-screen wash the runner draws itself |
| `audio.cue` | `ctx.audio.music(cue.key)` |

### 3.4 NPCs — `sim/npc.js` (SF-STORY)

There is no NPC in this game. There needs to be exactly one kind: a person who stands, walks, and
has a speech anchor. Not an entity in `world.entities` — nothing should be able to shoot Ostrick.

```js
const npc = world.npcs.spawn('ostrick', x, y, { face: -1 });
npc.walkTo(x, speed)       // returns a promise-ish: npc.arrived is true when done
npc.setPose('stand'|'walk'|'kneel'|'work')
npc.anchor                 // {x, y} — where a bubble points, updated per frame
npc.despawn()
world.npcs.update(dt)  /  world.npcs.render(alpha)   // called from sim/index.js
world.npcs.clear()                                    // on level rebuild
```

Three looks, drawn procedurally in the style of `sim/player.js`'s `renderPlayer` — that file is the
reference for silhouette, limb drawing and lighting response. Do not import from it; it is not yours.

- **`ostrick`** — sixties, stooped, heavy robe, a short staff he uses as a walking stick, a satchel.
  He must read as *a different silhouette from Vayne* at 25% size: Vayne is tall and ragged, Ostrick
  is square and tidy. He is a functionary.
- **`elder`** — taller, hooded, faceless, identical to each other on purpose. Three of them arrive
  at the end and are scenery.
- **`staff`** — not a person: Vayne's staff, standing in the ground at the glade, with a weak ember
  light on it. It is the thing Rook kneels at.

They light like everything else (they are drawn into `LAYER.ACTORS`, they get the scene's ambient),
they cast the small ground shadow the player does, and they do not collide with anything.

### 3.5 Level marks — `sim/level.js` (SF-LEVEL)

`buildLevel` already returns `{marks, statics}`. It must now also produce:

```js
marks.stones  = { x: 7550, brazier: <prop>, a: 7500, b: 7600 }
marks.gate    = { x: 7770, y: <ground>, w: 240 }     // the rock face, before it is opened
marks.glade   = { x: 8760, staffX: 8790, ring: [<props>] }
marks.arena   = { x: 10300, y: -240, w: 1900, h: 1000, bossX: 10300, bossY: <ground - 330> }
marks.seal    = { x: 9620 }                          // where the way closes behind him
```

and export two functions:

```js
export function openGate(world, marks)   // carve the breach + rubble ramp + debris + shake
export function sealArena(world, marks)  // bring the entrance down behind him; must be walk-proof
```

`openGate` uses `world.terrain.carve(x, y, r)` in a chain and drops real debris. The result must be
**walkable without wall-jumping** — a breach at ground level with a rubble ramp, not a hole at head
height. Verify it by walking a headless player through, not by looking at it.

`sealArena` must leave the player unable to walk back out, and must not be escapable by the wall
climb (which is a shipped feature — see the memory note and `HANDOFF.md` playtest-fixes-15). An
overhang, not a wall.

**Geometry, and the reasons for the numbers**

- `world.bounds.x1` → **11400**. `groundAt(x)` must be extended past 7700; today it just ramps at
  `+0.18` forever from 7100.
- The rock face at 7660 stays exactly where it is and stays impassable until `openGate`.
- **7900–8600 the approach** — a climbing scorched track. Broken ward posts, burnt trunks, no
  foliage. This is the section that says the land is already lost.
- **8600–9400 the Glyphglade** — the clearing from the intro, and it has to be *recognisable*: the
  ring of standing glyph stones, the scorched ward circle burnt into the ground, and Vayne's staff
  where he fell. Look at `intro/stage.js`'s `clearing` scene and match its shapes.
- **9400–11400 the arena** — flat-ish and wide, with two raised ledges for ranged enemies and a
  great deal of *supported* stonework: arches on buttresses, wall courses on arches, a gallery.
  The boss's `tearArena` walks `supportedBy` chains and brings the place down in four stages —
  **it needs at least 30 props inside the arena rect with real support chains**, or the signature
  moment of the whole game is four rocks falling over. This is the most important thing in the file.

### 3.6 Act sequencing — `sim/act.js` (SF-ACT)

One state machine, one file, owns the whole of act two's flow.

```js
const act = createAct(ctx, world, { marks, story, director });
act.update(dt)
act.state           // 'road' | 'stones' | 'vigil' | 'fire' | 'approach' | 'glade' | 'arena' | 'boss' | 'won'
act.set(state)      // for testing — jump straight to a state
```

| state | entered when | what runs | exits on |
|---|---|---|---|
| `road` | start | nothing | `player.x > 7440` |
| `stones` | — | `story.play('stones')` | `story:done` |
| `vigil` | — | a director encounter at the stones: three waves, growing. The brazier is lit and the player is holding ground. | all waves dead, **or** 90s |
| `fire` | — | `story.play('fire')`, which snuffs the brazier and opens the gate | `story:done` |
| `approach` | — | director movement → `glyphglade` | `player.x > 8700` |
| `glade` | — | `story.play('glade')` | `story:done` |
| `arena` | — | pressure only | `player.x > 9620` → `sealArena`, then `story` cue `boss.start` |
| `boss` | — | `director.spawnBoss(marks.arena.bossX, marks.arena.bossY, marks.arena)` | `boss:dead` |
| `won` | — | `story.play('after')`, then the victory screen | — |

**State must survive a refresh.** `core/progress.js` records the act state and the game comes back
into it — a player who reloads during the boss does not get put back on the road, and one who has
finished does not replay the ending. A cutscene already seen is not replayed on a reload; a cutscene
interrupted by a death **is**.

**Death during act two** rewinds to the start of the current state, not to the road. Vayne's ward
already handles the character; this is only about where the story is.

### 3.7 Boss HUD and the victory screen (SF-ACT)

`ui/index.js` already exposes `ui.boss(b)` / `ui.bossDamage(hp)` and `ui/hud.js` already draws a
full boss bar with phase pips. **Nothing has ever called them.** Wire:

- `boss:spawn` → `ui.boss({ name: 'THE SEAM', subtitle: <phase name>, hp, maxHp, phases: [0.72, 0.44, 0.16] })`
- the boss taking damage → `ui.bossDamage(hp)` (`enemy:damage` on the bus, or poll the entity)
- `boss:phase` → update the subtitle
- `boss:dead` → `ui.boss(null)`

The victory screen is a new overlay beside the death screen in `ui/overlays.js`. It is not a death
screen with green text: it holds on the last frame, it says what he did, and its buttons are
**Again** (a fresh run, keeping nothing) and **Stay** (dismiss it and keep walking around the
wreckage — the world is still there and it is the best-looking it ever gets).

---

## 4. Rules for this job

1. **The game must run at every commit, with no mp3s.** Every new line is silent until Aaron
   generates the takes. Silent must look deliberate: bubbles play on their written timings.
2. **Every headless test passes `&nosave`** or a run inherits the last one's progress.
   `?nointro&nosave&autostart&scene=play` is the standard harness URL. `?act=<state>` is a new one
   SF-ACT must add so a tester can jump straight to the glade or the boss.
3. **Verify by playing, not by reading.** Raw-CDP headless Chrome, drive real input through
   `input.setAction(a, on)`, and screenshot it. The recipe is in the memory note and
   `tools/shot.mjs`; `--enable-unsafe-swiftshader --use-gl=angle` are the flags that work here.
   A route you have not walked a headless player down is not a route.
4. **Test both orientations** — 390×844 portrait and 1440×900 landscape. Portrait is first-class.
5. **No new art dependencies.** No Flux generation in this job. Everything new is drawn in code or
   assembled from props that already exist in the atlas.
6. Comments sparse, and about *why*. Match the surrounding code — this codebase's comments explain
   the trap that was hit, not what the line does.
7. Write `docs/handoff/<your-agent-name>.md` before you stop: what you built, the public API, what
   is stubbed, what you would do next, and every gotcha. Assume the reader has none of your context.
