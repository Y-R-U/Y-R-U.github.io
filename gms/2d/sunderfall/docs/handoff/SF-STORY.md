# SF-STORY — the cutscene runner, the NPCs, and multi-take voice

Four deliverables, all landed and all verified by playing them headless:

| file | what it is |
|---|---|
| `game/js/story/runner.js` *(new)* | the in-world cutscene runner — contract §3.2 and §3.3 |
| `game/js/sim/npc.js` *(new)* | Ostrick, the elders, and Vayne's staff — contract §3.4 |
| `game/js/core/audio/vo.js` | generalised from one take to six |
| `game/js/core/audio.js` | `voice(at, len, {take})`, `hasTake()`, `loadTake()`, `takes()` |
| `game/story-test.html` *(new)* | the harness: play/scrub/skip any scene, 64-assertion self-test |

Nothing outside that list was touched.

---

## 1. `story/runner.js` — public API, verbatim

```js
import { createStoryRunner } from '../story/runner.js';

const story = createStoryRunner(ctx, world, opts);   // opts.scenes overrides story/scenes.js

await story.play('stones')   // Promise<true>, resolves when the scene ends OR is skipped.
                             // Resolves to `false` immediately for an unknown scene id.
story.playing                // bool — true from the first frame to the last
story.current                // scene id, or null
story.time                   // seconds into the current scene
story.skip()                 // end now; runs every remaining cue, in order, instantly
story.update(dt)             // from the play scene, BEFORE world.update
story.render(alpha)          // letterbox, fades, the seam glow, the skip chevron
story.reset()                // level rebuild: ends any scene and restores control

story.played                 // Set of scene ids finished this session
story.fired                  // string[] of cues the current (or last) scene ran, in order
story.has(id)  story.scenes()  await story.ready()
story.scrub(t, step = 1/60)  // TEST ONLY — steps the scene, the world, the NPCs and the
                             // bubble clock to `t` with no wall clock involved
```

`createStoryRunner` creates `world.npcs` if nothing else has. It does **not** claim the NPC
tick — see §2.

## 2. `sim/npc.js` — public API, verbatim

```js
import { createNPCs } from './npc.js';
world.npcs = createNPCs(world);

const n = world.npcs.spawn('ostrick' | 'elder' | 'staff', x, y|null, { face, pose, speed, scale });
//   y === null  ⇒ stand on the ground at x

n.walkTo(x, speed)   // n.arrived goes true on arrival; nothing is awaited
n.leave(dir, speed)  // walk off and despawn once off-camera
n.setPose('stand' | 'walk' | 'kneel' | 'work')
n.placeAt(x)         // teleport + snap to ground
n.faceTo(x)  n.settle()  n.despawn()
n.anchor             // {x, y} — where a bubble points, updated every frame
n.x  n.y  n.face  n.pose  n.alive  n.hidden  n.fade

world.npcs.update(dt)      world.npcs.render(alpha)     // once per frame, from sim/index.js
world.npcs.get('ostrick')  world.npcs.all(look)         // list, count, ticks, driven
world.npcs.clear()                                      // on level rebuild
```

**The two lines SF-ACT needed are already in `sim/index.js`** — they wired it before I finished.
For the record, the wiring the runner expects is:

```js
// after createWorld(ctx), once:
const m = await import('./npc.js');            // probed, never a hard import
if (m.createNPCs && !world.npcs) world.npcs = m.createNPCs(world);

// enter():   world.npcs.clear();
// update():  story.update(dt);  world.update(dt);  world.npcs.update(dt);
// render():  world.render(alpha);  world.npcs.render(alpha);  story.render(alpha);
// updateCamera(): if (world.camLock) return;
```

Ordering matters twice: `story.update` runs **before** `world.update` (§3.2), and
`story.render`/`world.npcs.render` must be inside the `R.begin`/`R.end` pair.

### Who drives the pool

`world.npcs.update(dt, from)` takes an owner tag. `sim/index.js` calls it with no tag and
permanently claims the tick; the runner calls it with `'story'` and is ignored from then on.
The runner offers because a cutscene with a frozen Ostrick in it is a worse failure than one
extra step on the first frame, and because `story-test.html` needs the pool driven at all. If
nothing but the runner is driving it after two seconds of a scene, it logs one warning naming
this file. `world.npcs.driven` is the flag.

## 3. Voice takes

```js
audio.voice(at, len)                      // unchanged — 'barks', every old caller still works
audio.voice(at, len, { take: 'rook2' })   // 'barks'|'rook'|'vayne'|'ostrick'|'rook2'|'vayne2'
audio.hasTake('rook2')   // → bool: loaded AND decoded. Asking is what starts the (lazy) fetch.
audio.loadTake('ostrick')// → Promise<bool>, for preloading before a scene
audio.takes()            // → { barks: 'ready', ostrick: 'missing', rook2: 'loading', … }
audio.stopVoice(fade)    audio.speaking
```

- A take is fetched on first use, never at boot except `barks` (which `resume()` still kicks off).
- Missing files cost **one** `console.warn` each, ever. `ostrick.mp3`, `rook2.mp3` and
  `vayne2.mp3` do not exist; the game boots, plays all four cutscenes and runs every bark with
  all three absent. That is tested.
- One line at a time **across all takes** — a new line cuts the old one short, with the existing
  fades, because the takes have a music bed and a hard cut clicks.
- Routing is unchanged: voice is its own bus past the duck stage (`core/audio/mix.js`), because
  `duck()` exists to pull the score out from under a line.
- `hasTake` answers **false while the AudioContext has never started** (no user gesture). That is
  honest — the line genuinely cannot be heard — but it means a headless run with no gesture
  selects no voiced barks at all. Deliberate; do not "fix" it by lying.

### One REQUEST, for whoever owns `main.js`

`stubAudio()` in `main.js` does not have the new methods, so a boot where `core/audio.js` failed
to import gives `audio.hasTake === undefined`. Callers currently guard (`audio.hasTake && …`), but
the tidy fix is three lines in the stub:

```js
hasTake: () => false, loadTake: () => Promise.resolve(false), takes: () => ({}),
```

## 4. Cues implemented (contract §3.3)

All of them. `cam.hold`, `cam.to`, `cam.shake`, `ostrick.leave`, `ostrick.arrive`,
`elders.arrive`, `rook.walk`, `rook.kneel`, `fire.snuff`, `gate.crack`, `gate.open`,
`seam.speak`, `seam.reveal`, `boss.start`, `staff.take`, `fade.out`, `fade.in`, `audio.cue`.
An unknown `fx` is one `console.warn` and a no-op; a cue that throws is caught, logged and the
scene carries on. A cue is added to `story.fired` *before* it runs, so the ledger is about intent.

Notes on the ones with opinions in them:

- **`rook.walk`** drives the real player controller (`world.playerControl = true` +
  `input.axisX` for those frames, with `jump`/`dash`/`cast` consumed so a skip tap cannot also
  cast). That buys the acceleration, the footsteps, the facing and the leg IK for free. In skip
  mode he is **marched**, not teleported: the runner steps him 10px at a time and stops at the
  first terrain or prop a walk would have hit, so skipping is not a way through scenery.
- **`rook.kneel`** is a stub in the sense that `sim/player.js` has no kneel pose and is not mine.
  It holds him still and pins `data.squash` to 0.8, which reads as a crouch. A real pose is
  ~20 lines in `renderPlayer` for whoever owns that file next.
- **`fire.snuff`** replaces the brazier's `def` with a **per-instance copy** that has
  `light: null` — the def object is shared by every prop of that type, so mutating it would blow
  out the brazier back in the village. It also kills `burn`, tints the prop cold, and emits smoke
  plus a last gulp of embers moving *inward*, which is the read the scene is written for.
- **`gate.open`** calls `world.openGate()` if it exists, warns once if not, and always emits
  `act:gate-open`.
- **`seam.reveal`** ramps the ambient toward violet over two seconds and **does not put it back**
  — the arena stays changed. `story.reset()` restores the ambient the runner saw at construction.
- **`boss.start`** emits `act:boss` and nothing else. What `sim/act.js` does with it (it moves
  the player to the arena) is outside the runner, and is the one thing a skip and a full play can
  legitimately disagree about — the self-test reports it instead of asserting it.

## 5. Gotchas — every one of these cost real time

1. **`ui.bubbles` are aged inside `ui.render()` off the wall clock**, not by `ui.update(dt)`. Any
   deterministic scrub has to age them itself or the whole scene's dialogue ends up stacked on
   screen at once. `runner.scrub` does.
2. **A scrub must step the world too.** `rook.walk` drives the real controller, so a scrub that
   only ticks the runner leaves the boy standing still — and then the skip path, which moves him,
   looks like the only one that works. `scrub` calls `world.update(dt)` in the sim's order.
3. **`world.camLock` is not enough on its own if `cam.zoom` moves.** `world.halfW`/`halfH` are
   derived from zoom in `sim/index.js`'s `sizeView()`, which only runs on a view change — so the
   runner recomputes them itself whenever it touches zoom, and restores the entry zoom in
   `finish()`. Culling and the rubble query read those.
4. **Scene `cam.y` is absolute and the road climbs.** At the stones the terrain sits near
   `y = -2000` while `scenes.js` asks for `-180`: left alone that frames 1800px of empty sky with
   the entire cast off the top of it, and the scene "plays" perfectly, invisibly. The runner
   clamps `cam.y` to a window around the actual ground at `cam.x` and warns once naming the
   scene. **The data is still wrong — `story/scenes.js` cam.y values want fixing** once
   `sim/level.js` is final. The clamp is written so a corrected value is never shifted twice.
5. **`enter: 'west'` is load-bearing** (SF-SCRIPT filed this and it is now honoured). Such a cast
   member is parked a screen and a half outside the frame *at the scene's own zoom*, faces the
   stage, and is not drawn until an arrive cue lets him in. The arrive cue re-parks him just
   outside the current frame edge, clamped to `world.bounds`, so the entrance takes about the
   same time in portrait (820 world px wide) as in landscape (1920) instead of being a pop-in in
   one and a forty-second stroll in the other.
6. **The elders are spawned by `elders.arrive`, not by `cast`** — deliberately, so they cannot be
   on screen before Ostrick is.
7. **NPC ground placement searches down from near the player's altitude**, not from the top of
   the world. Searching from the sky lands an NPC on the first roof, ledge or bridge deck above
   where he was meant to stand; that is how Ostrick first ended up in the tree line at x=1690.
8. **Letterbox and fades are drawn at `parallax: 0` on `LAYER.UI_WORLD`.** In that space the
   screen is exactly ±halfW/±halfH about the origin, and — this is the point — camera shake is
   folded into `cam` before the multiply, so a shaking scene does not shake its own letterbox.
9. `input.releaseAll()` on entry **and** exit. Both. `play()` also stops any voice line still
   running from a bark.
10. `finish()` is the only exit and its restoring half is a `finally`: `playerControl = true`,
    `camLock = false`, zoom restored, `halfW/halfH` recomputed, input released, `story:done`
    emitted, promise resolved. `A = null` happens first so a cue cannot re-enter it.

## 6. The harness — `game/story-test.html`

```
?scene=<id>            play a scene on load
?at=<t>  ?skipat=<t>   scrub to t / scrub then skip
?self[=a,b,c]          run the self-test over those scenes and console.log the results
?cast=1                spawn all three looks beside Rook
?goto=<x>  ?zoom=<z>   teleport Rook / force a camera zoom, for looking at the art
?here=0                play a scene at its authored world x instead of moving it to Rook
?shot=1                composite the GL canvas + the UI 2D canvas into #shot every frame
```

The `here` default matters: half of act two's level was still being built while this was written,
so a copy of the scene is rewritten around wherever Rook is standing (camera, cast, cue `x`, and
`anchor: 'world'` beat coordinates all shift together). `?here=0` plays it where it really lives.

`?shot=1` exists because `Page.captureScreenshot` hangs forever on an animating WebGL canvas
under `--headless=new` + SwiftShader. Compositing both canvases into a 2D one lets
`tools/shot.mjs --canvas '#shot'` capture the bubbles and the HUD as well as the world, with no
`?preserve` needed — the composite happens inside the frame, before the buffer is cleared.

The harness also carries a `demo` fixture scene which is the only scene that fires **every** cue
in §3.3, including an unknown one. Keep it.

### The self-test

`node tools/shot.mjs --url '…/story-test.html?shot=1&dpr=1&nosave&self=demo,stones,fire,glade,after' --console`

64 assertions, all passing at **1440×900 and 390×844**. Per scene it checks: control and camLock
are taken; a full play returns them; every cue fires; the same scene skipped at 0.5s fires the
same cues in the same order; both paths leave the same world fingerprint (control, camLock, zoom,
NPC count, lit props, whether the gate is still solid) and Rook within 40px of the same place;
playing it twice leaks no NPC and no letterbox. Then: a real `keydown` skips an armed scene and
does nothing in the first half second; the listener is unhooked on finish; held input is released
on entry and exit; an unknown scene id is a no-op; the runner does not advance while
`ui.blocked`; `reset()` restores control; and `hasTake`/`voice` are honest about a missing mp3.

**Both runs of a scene start from a freshly built level** (`scene.enter()` + Rook back on the
road). Rewinding the player is not enough: `gate.open` carves terrain, and carving the same hole
twice is not the same as carving it once, so a second play in the same world can never match the
first no matter what the runner does. That took a while to see.

## 7. What I would do next

- **Fix `cam.y` in `story/scenes.js`** against the finished terrain and delete the reliance on the
  clamp (keep the clamp).
- **A real kneel pose in `sim/player.js`**, replacing the squash hack.
- Ostrick's walk is a bob and a hem sway; he has no legs on screen by design, but a proper
  weight-shift on the stick plant would sell the age.
- `seam.speak`/`seam.reveal` draw their own glow at `cue.x/cue.y` or a guess near the camera.
  Once `sim/glade.js` publishes a real tear position, point them at it.
- The four scenes are silent. When the mp3s land, the only edit is the `vo:` column in
  `scenes.js` — nothing in the runner changes.
