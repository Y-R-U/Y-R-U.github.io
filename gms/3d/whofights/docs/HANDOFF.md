# WHO FIGHTS — scaffold handoff

What the scaffold pass built, what it deliberately left in FORGE, and what the next agent needs to
know before touching any of it. `docs/DEV_CONTRACT.md` is still the binding document; this file
records where the code is and where it diverges.

Nothing here has been committed to git.

---

## 1. Running it

```bash
open index.html                       # or serve the repo; three comes from ../../lib/three/
node tools/test.mjs                   # pure unit tests
node tools/shot.mjs --all --w=1280 --h=720 --dpr=1
node tools/shot.mjs --shot=hall --w=1280 --h=720 --dpr=1
```

`?editor=1` opens the level editor, `?shot=<id>` a named render, anything else plays.
`?level=<id>` picks a level out of `data/levels/index.json`. `window.__wf` is the debug handle
(`__wf.game`, `__wf.world`, `__wf.doors`, `__wf.characters`, `__wf.player`).

Headless renders are software-rendered: **the image is trustworthy, the timings are not.**

---

## 2. What was lifted from `../forge/`

Verbatim or near-verbatim, with only `__forge` → `__wf` and `forge.*` → `wf.*` storage keys:

| | |
|---|---|
| `js/engine/**` | `aa`, `app`, `budget`, `fov`, `post`, `quality`, `stats` |
| `js/world/` geometry | `buildings`, `climb`, `colliders`, `details`, `doors`, `figure`, `gablelid`, `interior`, `lighting`, `materials`, `people`, `props`, `propstate`, `roster`, `scatter`, `stairs`, `stream`, `terrain`, `tree`, `water`, `zones`, `textures/*` |
| `js/editor/` | `build.js`, `scene.js`, `store.js`, `editor.js`, `panel.js`, `ui.js`, `editor.css` |
| `js/game/` | `dialogue`, `dialoguebox`, `predicate`, `savestore`, `clock`, `audio`, `sounds`, `failure`, `boot`, `ui`, `fakedom`, `game.css` |
| root | `js/input.js`, `js/player.js`, `js/kv.js`, `js/scenarios.js`, `style.css`, the `index.html` shell + importmap, `tools/shot.mjs`, `audio/js/{core,sfx}.js` |

`js/world/zones.js` is **intact and unchanged** — the light/dark/neutral material sets are what
dress a white cloak and a dark cloak, and the same freeze rule applies here: additive only, ask
first. `if (zone === 'dark')` outside that file is still a bug.

The two other FORGE rules carried over unchanged: **no build step**, and **everything tunable is a
knob** (`quality.register(schema, apply)` gets panel UI for free).

## 3. What was deliberately left behind

- The whole of `js/sim/` — campaign, economy, faction, spell schools, xp, combat tables, foes.
- `js/game/`: quests, questrunner, questdef, gathering, escort, market, journal, journalscreen,
  spawner, slate, onboard, session (FORGE's 1400-line one), sheet, vitals, towns, placement,
  context, worldclock, hud.
- `js/world/`: `vermin`, `chicken`, `cast`, `nodes`, `nodestate`, `escorts`, `spell`, `bestiary`,
  `demo`, `foeshape`, **`robed`**.
- `js/editor/`: `demoScene`, `whitewall`, `longacre`, `townkit` — FORGE's three-town scene data.
- FORGE's `js/world/textures/surfaces.test.js` came across with the textures glob and was deleted:
  it is a `node --test` file, which this project's runner does not collect, and a test nothing runs
  is worse than no test. Port it as a `.test.mjs` if that module is ever touched.

**`robed.js` is the one that may surprise you.** It is FORGE's *enemy* rig (spawner-driven bodies
with `sim/foes` states), not the robed figure itself. The robed figure is `js/world/people.js`,
which is here and is what every character in Who Fights is built from. When enemies arrive, port
`robed.js` + `foeshape.js` then, and give `roster.js`'s `pinned()` back a real state enum.

Dependencies were cut, not dragged:

- `js/game/predicate.js` lost its ten campaign terms (`level`, `attunement`, `standing`,
  `campaign`, `act`, `worn`, `mk`, `truth`, `damageDealt`). What remains is `all`, `any`, `not`,
  `quest`, `flag`, `item`, `day`, `hour`. `findLevelTerms` is still there so the first term that
  gates on player strength is caught.
- `js/game/save.js` is **new**, not FORGE's: `{version, created, played, level, at, flags, items,
  quests, settings}`. `savestore.js` (autosave, slots, corruption quarantine) is FORGE's, unchanged.
- `js/game/menu.js` is **new**: Pause and Settings only, no character sheet, no journal, no wait,
  no chapter select.
- `js/engine/quality.js` carries FORGE's **fixed** `usePreset()`: it used to OR `schema.rebuild`
  across every registered knob and fire a full world rebuild on every preset change, which is a
  multi-second freeze on the one control a struggling player reaches for. It now rebuilds only if
  the preset actually moves a rebuild-flagged value — which no preset does, so switching is free.
  A preset switch still costs ~0.5–1 s re-baking textures for `aniso` and `texCap`.

## 4. What is new

| file | what it owns |
|---|---|
| `js/game/actions.js` | the action executor (§10). Pure over a context object. `say`/`goto`/`flag`/`event` implemented; `music`/`bark` registered as no-ops with the owning agent named in a comment. |
| `js/game/hotspots.js` | the hotspot runtime (§5). Pure geometry + state; honours `trigger`, `once`, `cooldown`, `if`, and `attach`. |
| `js/game/characters.js` | `data/characters.json` → placed robed figures on the crowd rig; `at(id)` is the hotspot runtime's `characterAt`. |
| `js/game/level.js` | `data/levels/index.json` + `<id>.json`, normalised through `editor/scene.js`. |
| `js/game/session.js` | the play session: save doc, settings, pause menu, hotspots, dialogue bubble, HUD. |
| `js/game/graphics.js` | lifted from FORGE unchanged — the pure preset / custom-dial / auto-detect logic the settings sheet is a thin view over. |
| `js/world/world.js` | terrain + foliage + the level document (replaces FORGE's `demo.js`). |
| `js/world/boards.js` | the road sign and the hall billboards. |
| `js/world/textures/text.js` | canvas lettering, cached per string, tracked through `engine/budget.js`. |
| `tools/test.mjs`, `tools/harness.mjs` | the runner and its assertions. |

`js/world/field.js` keeps its name and its exported API but is **rewritten**: Who Fights is one
600 × 600 m meadow with one flat academy pad and one road, not FORGE's 1440 m valley. It exports
`HAS_WATER = false` and flat channel functions, which is what lets `terrain.js` stay lifted
unchanged — `build()` simply skips the bank ribbon, the water surface and the reflections.
`terrain.js`'s only other edits are the chunk seams `CHX`/`CHZ` (they have to be axis nodes inside
the new bounds) and two `this.waterMat` guards.

---

## 5. The level document, as built

`data/levels/academy.json`. Version 1 — FORGE's v1→v3 migrations were dropped, this schema starts
clean.

```jsonc
{
  "version": 1,
  "id": "academy",
  "name": "Adventurer Academy",
  "music": null,                                   // a set id in data/music.json
  "start": { "x": -9, "z": 21, "yaw": 3.14159 },   // where the player spawns; yaw π faces −z
  "districts": [ { "zone": "neutral", "cx": 0, "seed": 0, "dressSeed": 0,
                   "road": null, "roadWidth": 9, "kerbs": [], "bridge": null } ],
  "objects": [ … ],                                // §5.1
  "hotspots": [ … ],                               // DEV_CONTRACT §5, verbatim
  "shots": [ … ]                                   // §5.2
}
```

`normalise(raw)` in `js/editor/scene.js` returns `{doc, dropped, warnings}` and **never throws**.
An object of an unknown type or zone is dropped and counted; a hotspot with no usable shape and no
`attach` is dropped; every missing parameter falls back to its type default.

### 5.1 Objects

```jsonc
{ "id": 1, "dist": 0, "zone": "light", "type": "house", "lod": "full",
  "x": 0, "z": -16, "ry": 0, "seed": 811001,
  "p": { "w": 36, "d": 30, "h": 12, "hall": 1 },
  "inside": 1 }                                     // optional — see below
```

Types are FORGE's (`house`, `tower`, `wallRun`, `mass`, `mill`, `barn`, `pen`, `cross`, `arcade`,
`retaining`) plus two new ones. **Three schema additions:**

1. **`TYPES[t].strings`** — a type may declare string parameters alongside its numeric ones.
   `sign` and `billboard` each declare `text`. `normalise` keeps a string (capped at 120 chars)
   and falls back to the default for anything else, so the level editor can retitle a contract
   board without touching code. This is what "make the text a data-driven field" cost.
2. **`p.hall` on `house`** (0 or 1) — one over-sized room instead of a cottage with a loft, and a
   doorway to match (4.2 → 5.4 m wide, 6 m tall, with two leaves standing permanently open).
3. **`o.inside: <houseId>`** — this object is furniture for that house's *interior*, not for the
   world. `SceneBuilder.objectsIn()` leaves it out; `Doors.boardsFor()` transforms it into the
   house's own frame and hands it to `interior.js`. The four contract boards use it.

`lod` is `full` | `proxy` | `auto`. **Signs and billboards must be `"lod": "full"`** — the distant
proxy set has no stand-in for them and would drop them entirely past `lodDetail` metres.

### 5.2 Shots

```jsonc
{ "id": "hall", "label": "…", "zone": "light", "time": 11,
  "pos": [0, 2.6, -3], "look": [0, 3.4, -29], "fov": 62,
  "inside": 0 }        // optional: a door index to look through, for interior renders
```

`pos[1]` and `look[1]` are **heights above the ground at that point**, not absolute y, so a shot
survives the terrain being retuned. `time` is the hour of day. `keep` is the foliage keep-out
radius `terrain.mark()` clears around the camera.

---

## 6. Engine changes a later agent will trip over

- **`buildings.js house()` takes `hall`.** When set: the doorway scales with the building, the
  `dressed` hood over the door is suppressed (it collided with the upper window row), and two
  leaves are drawn standing open at 1.9 rad as static geometry. `userData.hall` and
  `userData.door.open` carry it out.
- **`interior.js` takes `opts.hall` and `opts.boards`.** `hall` forces one storey, raises the
  ceiling clamp from 4.70 m to 14 m, drops the dado and rail (six metres up they read as nothing),
  drops the cottage furniture (table, bed, chest, stool), and swaps the fill point light for a
  **HemisphereLight**. That light's ground colour is `0xd8cdb8` — nearly as bright as its sky
  colour — because a hemisphere light gives a *vertical* face the mean of the two, and with a dark
  ground colour every wall and every board on one came out slate grey while the floor was in full
  light. That was two wasted debugging rounds; do not "correct" it back to a dark ground.
- **`doors.js` has standing interiors.** A `hall` house's room is built once at `refresh()` and
  kept (`this.standing`), because its doors stand open and you can see into it from the road. The
  world is **not** hidden while inside a hall, for the same reason. `close()` does not dispose a
  standing room.
- **`doors.js` dedupes by `sceneId`.** Every building is built twice — once into its block's
  detail set and once into its proxy set — so a plain traverse found each front door twice. Two
  door records meant two standing interiors in the same room: z-fighting on the boards and doubled
  light. This looked exactly like a lighting bug for a while.
- **`people.js` has no ambient crowd.** `spawn()` returns an empty list; every figure in the world
  comes from `data/characters.json` through `People.place()`. Two new agent fields: `fixY` pins a
  body to an interior floor instead of the terrain, and `indoor` skips `walkStep` (an indoor body
  stands inside a collider box the whole time and would be shoved out through the wall).
- **`doors.js peek(i)`** stands a room up with no player involved, so a `?shot=` scenario can look
  inside one. It is a render hook, not a game path.

## 7. Data seeded

`data/characters.json` — `player` (dark robe, `am_echo`, `body: "none"`: the player's body is
`js/player.js`, not a crowd agent), `greeter` = **Instructor Vail** (light robe, placed in the
hall with a wander box), `narrator` (`body: "none"`).
`data/conversations.json` — one real three-node conversation for Vail, wired to the greeter
hotspot, with `sets` written as §10 actions.
`data/barks.json` — all fourteen contract categories with an empty `shared` set.
`data/music.json` — a valid empty document.

## 8. Divergences from DEV_CONTRACT.md

1. **`tools/test.mjs` has a sibling, `tools/harness.mjs`.** A test file importing the runner
   directly deadlocks the module graph against the runner's top-level `await import`. Test files
   import `tools/harness.mjs`; the runner is still `node tools/test.mjs`.
   The runner also runs any `*.test.mjs` that does *not* import the harness in a **child process**
   and scores it on its exit code — `js/dev/`'s tests are self-running scripts that call
   `process.exit`, which would otherwise kill the runner before it reported.
2. **The scene schema grew three fields** (`strings` params, `p.hall`, `o.inside`) — §5.1 above.
   The contract does not describe the scene document beyond "scene doc + hotspots", so this is an
   extension rather than a contradiction, but the level editor's object inspector will need to
   render a text input for a `strings` param.
3. **The level document also carries `shots`.** The alternative was a second file naming camera
   positions in the same world, which would go stale the moment anything moved.

`js/main.js` does import `bootDev` from `./dev/boot.js` as a plain top-level import, as §10 asks.
It was dynamic-and-caught for part of this pass, while `js/dev/` was still half-written and a
static import of a module that could not resolve took the whole game down with it.

## 8b. Settings, and the thing FORGE got wrong

`js/game/graphics.js` (FORGE's, unchanged) is the whole model: a preset name plus two optional
overrides, `renderScale` and `shadows`. Override either and the label becomes **Custom**; put it
back on the preset's own value and it stops being an override. Picking a preset clears both.

The sheet (`js/game/menu.js` → `drawSettings`) puts **Graphics, Shadows and Render scale at the
very top**, above the accessibility rows. This is the point of the whole exercise: FORGE shipped
with the quality knobs only in the developer panel behind a ⚙, and a slow laptop had no way back
from `high`. It is a player-facing setting, it lives in the save, and it is the first thing in the
sheet.

`Session.autoDetect` measures six seconds of play on a save that has **never** chosen and steps the
preset down one notch if the machine cannot hold 40 fps, saying so in a toast. Touching any of the
three controls counts as choosing, so it never fights a player who has already decided.

## 9. Known rough edges

- **Portrait crops the hall shot.** `js/engine/fov.js` holds 55° on the *shorter* viewport axis, so
  in portrait the horizontal field is narrower and the outer two boards fall outside the `hall`
  scenario's framing (`shots/portrait/hall.png`). All four are legible; you just have to step back
  in-game. If that matters, widen the room's board spacing or author a second portrait shot.
- **The hall is flat-lit.** One hemisphere plus a hearth over a 35 × 29 m room gives even but
  low-contrast light. It wants a few wall sconces as `inside` objects once a light-emitting object
  type exists.
- **The interior's beams and its stained-glass window barely read** at hall scale — both are sized
  off cottage constants in `interior.js`.
- **`js/game/audio.js` and `sounds.js` are lifted but unwired.** Nothing imports them yet; the
  sound table is still FORGE's.
- **`Props` is instantiated with an empty list.** The system is wired so the next agent only has to
  supply `data/props.json`.
- **`Session.gotoLevel` reloads the page** with `?level=`. Fine while there is one level; it will
  want an in-place teardown when there are two.
- **Scenarios are registered before the shot is looked up** in `main.js`. Anything that registers
  a scenario later than `world.registerScenarios(doors)` will not be renderable by `--shot=`.

## 10. Renders

`shots/spawn.png`, `shots/road.png`, `shots/doorway.png`, `shots/hall.png`,
`shots/portrait/hall.png`, plus `shots/_play_mobile.png`, `shots/_play_desktop.png`,
`shots/_play_settings.png` and `shots/_editor.png` from the play/editor smoke tests.
`shots/` is gitignored. Nothing else is — in particular `audio/music/` holds another agent's
generated tracks and is deliberately left tracked.

---

## 11. Notes for other agents in this tree

- **`data/conversations.json` was clobbered once** by a dev-tools UI test saving through the Data
  tab into the real file. It has been re-seeded as a six-node branching example — a narrator line,
  three branches, `sets` actions on both nodes and choices, and one choice gated on a `flag`
  predicate. `js/game/conversations.test.mjs` walks the real file and fails if a speaker, a `goto`
  or a `sets` action stops being valid, so the next clobber is caught by `node tools/test.mjs`.
- **Every class in `style.css` is `wf-` prefixed** (`.wf-row`, `.wf-grp`, `.wf-presets`,
  `.wf-shots`, `.wf-adv`; `.pad` is scoped to `#touch`). A bare `.row` in there silently reshaped a
  dev-hub toolbar — this stylesheet shares a document with that overlay. Keep new names prefixed.
- **`tools/shot.mjs` is the corrected version**, rooted two levels up with the page path in `base`,
  so the `../../lib/three/` importmap resolves. Every render in `shots/` was opened and checked;
  they contain real geometry, not blank frames.
- The level layout the dev store was built against is `data/levels/<id>.json` + `index.json`
  (`data.get('levels', '<id>')`). Do not change that shape without saying so.
