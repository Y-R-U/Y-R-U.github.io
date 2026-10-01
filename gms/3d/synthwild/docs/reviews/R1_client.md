# R1 — Client game-logic review (adversarial)

Scope: `js/world/*`, `js/player/*`, `js/game/*`, `js/minigames/*`, `js/main.js`, `js/ui/shell.js`, `js/ui/store.js`.
Reviewer A, 2026-10-02. No game files were edited. Repros are in `tools/review_a_*.mjs`. They need the local server on :8861 and
start their own headless Chrome on port 9330.

| Script | Proves |
|---|---|
| `tools/review_a_lifecycle.mjs` | A1, A2, A4, A6, plus the ¼-cache open in A3 |
| `tools/review_a_cachedupe.mjs` | A3 |
| `tools/review_a_saverace.mjs` | A5 |
| `tools/review_a_mgsave.mjs` | A7 |
| `tools/review_a_persist_fuzz.mjs` | world persistence is sound (node, no browser) |
| `tools/review_a_stuck.mjs` | A12 (partly: entombed, but the player can still walk out) |

---

## A1 · CRITICAL · PROVEN: a save taken while dead loads as a permanent "ghost"
**Where:** `js/game/survival.js:164-173` (`dead` is serialised and restored), `js/game/index.js:150-162` (`load`) and `:204-206`
(no auto-respawn when `ui.handlesDeath`), `js/ui/ui.js:70,142` (the death screen only opens on the `player:death` *event*).

**What goes wrong:** you die, and the death screen stays up while the shell state is still `playing`. The 60 s autosave, a pause, a tab
hide or `pagehide` all save `stats.dead = true`. On the next load `survival.dead` is true, but no `player:death` event fires, so no
"Reboot suit" screen appears. `game.update` never respawns either, because the UI claims `handlesDeath`. The player walks around with
0 Integrity and:
- can't be hurt, so they can't die out of it (`survival.damage` returns early while dead);
- can't pick up drops or their own Memory Cache (`p.dead`);
- can't use stations (`stations.useBlock` returns early).

Charge never ticks. Nothing in the UI recovers the world, so every later load is a ghost too. All a kid has to do is die and then close the tab.

**Repro:** `review_a_lifecycle.mjs` section B. It dies, runs `shell.save('auto')`, reloads the page and loads the world again.
Result: `{"survDead":true,"integrity":0,"playerDead":false,"overlay":false,"hurt":0}`.

**Fix:** in `game.load`, if `d.stats.dead`, call `respawn()` (or emit `player:death`) once `start` has finished. Better still, don't persist `dead`:
save a revived state at the spawn point.

## A2 · HIGH · PROVEN: dying and then leaving freezes the player in every later world until a page reload
**Where:** `js/player/player.js:47-52` (`player.dead` is only cleared by `player:respawn`) and `:140` (`frozen` includes
`this.dead`). `js/main.js:190-231` (`engine.start`/`stop` never reset player state). `js/ui/ui.js:25,142-159` (`deathEl` is
module-level and never removed on quit).

**What goes wrong:** you die, then pause (Esc, the HUD button, or an auto-pause on tab hide) and choose Save & quit. You can also Leave a
Siege mini-game within the 2 s auto-respawn window. Either way `player.dead` stays true. In the next world `survival.reset()` clears
`survival.dead`, but `player.dead` is still true, so `player.update` treats the body as frozen: no movement, no gravity, no hand.
The stale "SUIT OFFLINE" overlay is still in the DOM over the title and over the new world. Its "Reboot suit" button calls
`game.respawn()`, which returns at once because `survival.dead` is false, so `player:respawn` never fires and the player stays frozen.

**Repro:** `review_a_lifecycle.mjs` section A. World B shows `{"survDead":false,"playerDead":true,"liftedY":40.02,"yAfter1500ms":40.02,"overlay":true}`,
meaning a player lifted 6 m doesn't fall. After clicking Reboot it's still `playerDead:true`.

**Fix:** on `game:start`/`game:stop`, set `player.dead = false` and remove `deathEl`. Alternatively, derive `frozen` from
`ctx.game.survival.dead` instead of a mirrored flag.

## A3 · HIGH · PROVEN: unlimited loot from caches (two related holes)
**Where:** `js/game/stations/index.js:128-147` (`onBreak`), `:23-33` (`get`), `:52-60` (`onPlace`).

1. **Breaking a cache a ¼ sub at a time spills a fresh world-loot roll for every sub.** On the first ¼ break the cell becomes refined, so
   `getCell` returns -1 and `typeOf(-1)` is null. The loop therefore treats the station as gone, spills it and deletes its map entry. Every
   later ¼ break hits the branch "unopened world cache broken as a single block" (`lo==hi && !map.has(k)`). That branch spills
   `newCache(..., worldGen=true)`, which is a full deterministic loot roll, and nothing is recorded, so it repeats for all 64 subs. The
   same happens on world-generated caches from the first sub onward.
2. **A ¼-size player-placed cache rolls world loot when opened.** `onPlace` only registers cells where
   `getCell(x,y,z) === ev.mat`, and a refined cell returns -1. The first `useBlock` then calls `get('cache')`, which creates
   `newCache(worldGen = !s = true)`. Survival allows scale 0.25 (`maxScale` 1), and a Cache costs 8 planks.

**Repro:** `review_a_cachedupe.mjs` places one empty player cache (registered empty: `0` slots), then breaks 6 quarter-subs.
Drops per break: `[1,7,7,7,7,7]`. Totals: `ferrite_ingot 35, pulse_charge 50, protein_gel 20, server_kelp 15` from a cache that held nothing.
`review_a_lifecycle.mjs` section E shows a ¼ cache opening with 5 loot stacks while the full one alongside it is empty.

**Fix:** key "has this cache been resolved" on a persistent set of looted positions, not on map presence. For breaks and opens, test the
cache material with `getSub` (any sub of the cell), not `getCell`. In `onPlace`, also register refined cells that contain the material.

## A4 · HIGH · PROVEN: build-mode undo history crosses worlds and overwrites another saved world
**Where:** `js/player/tools.js:21` (`createHistory()` once, at init). Nothing calls `history.clear()` on `game:start`/`game:stop`. A grep finds no caller.

**What goes wrong:** you edit in Build world A, quit, open Build world B and press Undo (Ctrl+Z or the wheel). A's snapshot is written into
world B at A's coordinates, destroying B's blocks there. Autosave then persists the damage. History also keeps up to 48 MB of A's snapshots alive.

**Repro:** `review_a_lifecycle.mjs` section C. B carries `stepsCarried:1`. B's own block at that spot (`cellBefore:23`) becomes air (`cellAfterUndo:0`).

**Fix:** `bus.on('game:start', () => { history.clear(); T.endPaste?.(); })` in `createTools`. You can keep `clip` if cross-world paste is wanted.

## A5 · MEDIUM · PROVEN (concurrency) / SUSPECTED (cloud consequence): `shell.save()` doesn't serialise when two saves wait
**Where:** `js/ui/shell.js:237-264`.

**What goes wrong:** `if (saving) await saving;` then `saving = (...)`. Two or more callers waiting on the same in-flight save all wake up and
start at once: each overwrites `saving`, and the first one's `finally` nulls it while the others are still running. This happens in real play.
An autosave is in flight; Esc gives `save('pause')`; the tab hides, giving `save('hide')` and `pagehide` gives `save('hide')`; or the
player presses Save & quit.
- **Local:** each `local.put` encodes before its IDB transaction, so an older snapshot can commit last.
- **Cloud:** each put sends the same `meta.version`. The second gets a 409, which shows the kid a "This world changed somewhere else"
  popup about their *own* save. If they dismiss it, the default is `'copy'`, which creates "(saved copy)" duplicate worlds.

**Repro:** `review_a_saverace.mjs` gives `{"saveCalls":4,"putCalls":4,"maxConcurrentPuts":3}`.

**Fix:** chain the saves: `saving = (saving || Promise.resolve()).catch(()=>{}).then(doSave)`. Or drop a request while one is queued and
re-run once afterwards.

## A6 · MEDIUM · PROVEN: a pending build volume leaks into the next world; `confirm()` places for free in Survival
**Where:** `js/player/brush.js:301-310` (`_startVolume` sets `input.modal = true`), `:342-358` (`confirm()` has no build-mode or cost
check). Nothing cancels the volume on `game:stop`.

**What goes wrong:** you start a volume in Build (touch drag) and then pause and quit. The tap-pause path works; Esc is turned into
`cancel` while modal. `brush.vol` and `input.modal=true` carry into the next world:
- In Survival the brush shows the stale volume and blocks all normal break and place, because `update` returns early.
- `modal` blocks eating and the bow.
- Enter or the confirm strip calls `confirm()`, which writes the whole volume with the held block and charges nothing.

**Repro:** `review_a_lifecycle.mjs` section D. In Survival with 1 plank you get `{"volLeaked":true,"modal":true,"cellsNowPlanks":121,"planksAfter":1}`.

**Fix:** call `brush.cancel()` (and `tools.endPaste()`) on `game:stop`. In `confirm()`, return unless `this.build`, or route it through
`_canAfford`/`_pay`.

## A7 · MEDIUM · PROVEN: starting a mini-game throws away the current world when its save fails, or when visiting
**Where:** `js/ui/shell.js:129-133`.

**What goes wrong:** `playMinigame` ignores the result of `await save('quit', true)` and goes on to `engine.start(minigame)`. `quit()`
asks "Saving failed — quit anyway?", and for a visited public world it asks "Leave this world?". `/play <game>` and the title's
mini-game cards ask neither. Ways to lose a world: quota full, IDB blocked, offline cloud world, or a visitor's unsaved build.

**Repro:** `review_a_mgsave.mjs` makes `local.put` throw and runs `playMinigame('parkour')` after building. No confirm appears, and the
saved blob is still `null (build lost)`.

**Fix:** reuse quit's checks: `if (!(await save('quit', true)) && !(await confirmPop(...))) return;`, and add the visiting confirm.

## A8 · LOW · SUSPECTED: undo snapshots record unloaded terrain as air
**Where:** `js/player/edits.js:12` uses `world.readBox(...).data` and drops the `unloaded` flag that `world/edit.js:234` computes.

**What goes wrong:** a Build edit whose box reaches into a chunk that isn't loaded records air for that part. The edit itself skips that
part. If that chunk is loaded when you undo, the undo carves the generated terrain to air. This needs a large volume (VOL_CAP is 64 m) near the
render-distance edge.

**Fix:** if `unloaded`, mark those subs 255 (KEEP) in the snapshot, or refuse to record.

## A9 · LOW · SUSPECTED: the drop list silently deletes the oldest drops past 256
**Where:** `js/game/drops.js:56`.

**What goes wrong:** `if (list.length >= CAP*2) list.shift()`. Tree felling (up to 64 logs and 40 leaf drops), a cache spill (27 stacks)
and Siege kills can push items out with no merge, so players lose loot. The A3 dupe makes it easy to hit.

**Fix:** merge into a nearby drop with the same id before shifting, or drop the cap for items the player is near.

## A10 · LOW · SUSPECTED: a first-run double-tap on Play runs the intro twice and starts the engine twice
**Where:** `js/ui/shell.js:92-96`. The guard only checks `loading`/`playing`, and `runIntro` sets the state to `intro` before the second
click handler runs.

**What goes wrong:** two `playIntro` overlays, then two overlapping `G.start` calls. The second `start` stops the first world mid-settle.

**Fix:** guard `play()` on `st.state === 'intro'` too, or set a `starting` flag synchronously.

## A11 · LOW · SUSPECTED: a conflict "Save as copy" and the deleted-world path lose world metadata
**Where:** `js/ui/store.js:54-55` and `js/net/api.js:291-310`.

**What goes wrong:**
- The conflict-copy branch never calls `setExtra`, so the copy loses its difficulty (back to Normal) and its commands flag.
- `local.put({id})` on a record deleted from another tab creates a new record named "New world", with seed `''` and mode `survival`,
  even if the world was a Build world.

**Fix:** call `setExtra(copy.id, {difficulty, cheats})`. In `local.put`, refuse a save to a missing id, or carry name, seed and mode from `meta`.

## A12 · LOW · PARTLY PROVEN: respawn and growth can put the player inside blocks; the sleep-pod spawn is never cleared
**Where:**
- `js/game/index.js:90-99` respawns at `spawnPoint` with no check that the pod still exists or the spot is clear.
- `js/player/physics.js:120-127` (`unstick`) searches only 4 m upward.
- `js/player/brush.js:109`: with the eye inside a block, the aim target is null, so you can't break your way out.
- `js/world/features.js:159` (`growTree`) writes logs into the player's cells.

**What goes wrong:** a sapling that grows while you stand on it entombs you. `review_a_stuck.mjs` shows `bodyInSolid:true`,
`canUnstick:false`, `brushTarget:null`. A 1×1 trunk still lets you walk out sideways, because the sweep ignores the overlap you start in.
The same can happen at a pod covered by a ≥4 m build. The death screen still says "at your Sleep Pod" after the pod is broken.

**Fix:** clear `spawnPoint` in `stations.onBreak` when a pod cell goes. Make `growTree` skip trunk cells that overlap the player's AABB. Let
`unstick` search sideways as well, or teleport to `surfaceY`.

---

## Checked and believed SOUND
- **Section persistence.** `encodeSection`/`decodeSection`, `serialize`/`deserialize`, and `mods` for unloaded chunks across
  unload/reload. `review_a_persist_fuzz.mjs` ran 120 random fill/hollow/shell/replace edits with water flow per world, across chunk
  edges, with an unload/reload mid-run. JSON round trip: 0 sub differences in 6/6 worlds, and re-serialising gives identical output.
- **Terrain and structure determinism.** No `Math.random`/`Date` in `js/world/*` or `loot.js`. Loot is seeded by (seed, x, y, z).
- **Unloaded-chunk reads.** `isSolidSub` returns solid for unloaded cells, which holds the player. `getSub`/`getCell` return air, and
  callers that care (`surfaceY`, mob spawn, farm) check `isChunkLoaded`/`isReady` first. `y<0` reads COREPLATE, and cell y=0 is immutable.
- **World worker lifecycle.** `dispose()` terminates the gen workers. Results are per-World, so a stale world's columns can't land in a new one.
- **Inventory 64ths maths.** `toQ`/`setQ`/`removeId`/`add`/`move`/`split` keep integer quarters with no overflow. `canAfford` and `_pay`
  agree. Item ids are append-only, as documented.
- **Mini-game isolation.** These games use a temp `meta`, so `save()` returns early. Real worlds are saved before a mini-game starts (see
  A7 for the failure case). `minigames.stop()` resets `mgSurvival`/`mgBreak`, and every game's `end()` restores `input.enabled`.
  Parkour respawns on falls and the others are timed, so I found no unending game. Leave/Title always tears down.
- **`game.start`** clears drops, mobs, stations, projectiles, farm, journal, survival, inventory, spawn and stash per world.
  `game:stop` clears the scene objects. Bus subscriptions are registered once at init, not per world.
- **NaN guards** in mob knockback, LOS and explode (`|| 1` divisors), drop magnet (`dist > GRAB > 0`) and player speed (`max(dt, 1e-4)`).
- **Oven and cache transfers** (`stations/ui.js`): whole-item moves through `removeId`/`addSlot`. I found no split/merge rounding dupe.

---

## Fix log (fixer, 2026-10-02)

A9 was skipped on the manager's call. Every other ID has a regression test, and every test was run against the unfixed code
first and seen to FAIL: browser 0/19 before the R1 fixes, `game_test` 7 FAIL, `player_test` 1 FAIL, `ui_test` an assertion
error, `mg_floorfall_test` 0/4, and M1/M4 0/1 each. Browser tests are in `tools/r1_regress.mjs`
(`node tools/r1_regress.mjs [A1,A3,…]`, Chrome on :9331).

| ID | Status | Fix | Files | Test |
|---|---|---|---|---|
| A1 | FIXED | `game.start` reboots at once when the loaded save is dead. Survival stays the only owner of death. | `js/game/index.js` | r1_regress A1 (reload a dead save → alive, can be hurt) |
| A2 | FIXED | `player.dead` is now a getter over `game.survival.dead`, so no mirrored flag can drift between worlds or mini-games. The death overlay is torn down on `game:stop` and `game:start`, and it never opens unless survival is dead. | `js/player/player.js`, `js/ui/ui.js` | r1_regress A2 (quit while dead → title clean, next world falls; Siege left inside the 2 s window → clean) |
| A3 | FIXED | Rule: **a station is one whole cell.** The first break that removes any sub of it removes all of it. The rest drops as items, and its contents spill once: a player cache's slots, or a world cache's single deterministic roll. The anchor is the cell key. `onPlace` registers a cache at any scale by scanning subs (`subsOf`), not `getCell`. | `js/game/stations/index.js` | `game_test` "R1 A3/A12" (real World): 0 loot from an empty placed cache broken ¼ at a time, 63 subs come back, a world cache spills exactly once, a ¼ cache registers empty. r1_regress A3 |
| A4 | FIXED | `brush.reset()` on `game:stop` and `game:start` clears undo/redo, the paste stamp, the pending volume, `input.modal`, targets, mining progress and the credit ledger. The clipboard is kept on purpose, so a kid can copy a build into another Build world. | `js/player/brush.js` | r1_regress A4A6 (world B: 0 undo steps, B's block survives Undo) |
| A5 | FIXED | One save in flight, plus at most one queued save that later requests join. It runs after the first and captures fresh data then. Writes are never parallel. | `js/ui/shell.js` | r1_regress A5 (4 overlapping saves → 2 puts, then 1 more for a later save; max concurrency 1, all resolve true; before: 3 at once) |
| A6 | FIXED | Same reset as A4. `confirm()` re-checks the mode: outside Build, a clear volume is refused and a place volume is charged through `_canAfford`/`_pay`. | `js/player/brush.js` | r1_regress A4A6 (no leaked volume or modal; a forced Survival confirm with 1 plank places 0 cells) |
| A7 | FIXED | Quit and starting a mini-game share `canLeave()`: the visitor "Leave this world?" check, then save, then "Saving failed… anyway?". Cancel keeps the world open and unpauses it if it was playing. | `js/ui/shell.js` | r1_regress A7 (put throws → "Saving failed" popup, still in the Build world; Cancel keeps it) |
| A8 | FIXED | Undo/redo snapshots mark every sub in an unloaded chunk as 255 (KEEP), so a restore skips them. Copy/paste data is unchanged. | `js/player/edits.js` | `player_test` "undo leaves terrain that was unloaded at record time" (real World) |
| A9 | WONTFIX (skipped by manager) | — | — | — |
| A10 | FIXED | `play()`/`playMinigame()` set a synchronous `starting` flag and refuse while `intro`. `runIntro()` refuses while an intro is already playing. | `js/ui/shell.js` | r1_regress A10 (double Play → 1 intro, 1 `engine.start`; double intro replay → 1 overlay) |
| A11 | FIXED | Conflict and visitor copies go through one `copyOf()` that keeps seed, mode, difficulty and commands. `local.put({mustExist})` throws 404 for a world deleted elsewhere. The store then asks (`onConflict(null, 'missing')`), and the shell shows "This world was deleted somewhere else" with Save as copy / Don’t save. Declining fails the save, so Quit still offers "Quit anyway". | `js/ui/store.js`, `js/net/api.js`, `js/ui/shell.js` | `ui_test` (store, mock API) + r1_regress A11 (real IDB: popup, no "New world", copy keeps seed + mode) |
| A12 | FIXED | Respawn checks that the pod is still under the spawn point. If it is gone, the player falls back to the landing site with a toast ("Your Sleep Pod is gone…"). Unloaded cells can't be checked, so they are trusted. Breaking a pod also clears `spawnPoint`. `growTree` takes an `avoid` AABB, and the farm passes the player's, so a sapling defers (retries later) rather than grow into the player. `unstick` was not widened. | `js/game/index.js`, `js/game/stations/index.js`, `js/world/features.js`, `js/world/world.js`, `js/game/farm.js` | `game_test` (pod break clears spawn; sapling defers then grows, real World) + r1_regress A12 (missing pod → landing site + toast; sapling defers, grows after stepping away) |

### QA mini-game findings fixed in the same pass (docs/notes/qa.md, M1–M4)
| ID | Status | Fix | Files | Test |
|---|---|---|---|---|
| M1 | FIXED | Only a pointer lock that was actually held, and then lost more than 1 s after it was requested, pauses. A `pointerlockerror`, a change with no lock held, or any unlock during a mini-game countdown (`session.mgCountdown`) is silent. Esc, P and the pause button are unchanged. | `js/player/input.js`, `js/minigames/index.js` | r1_regress M1 + `qa_minigames --only desktop --games parkour --no-cmd`: launch WARN "opened PAUSED" → PASS, play again PASS |
| M2 | FIXED | Floor Fall bots retarget the moment their goal tile cracks, vanishes, or sits on a floor they fell from. They step off a cracking tile after their reaction time. `Bot.goTo` resets `noPathT`, and an empty path ("already at the closest cell") no longer counts as a failed search. | `js/minigames/games/floorfall.js`, `js/minigames/bots/bot.js` | `tools/mg_floorfall_test.mjs` (real World, seeded): unstick hops per round, median 8 / max 22 → median 0–1 / max 2 |
| M3 | FIXED | Floors are 25×25 (were 17×17). Crack-to-vanish is 0.9 / 0.7 / 0.55 s (easy / normal / hard). Bots take short careful steps for the first 40 s, then roam. After 100 s the floors crumble ("Sudden death"), so a round never stalls to the 180 s cap. The card now says 1.5 min. | `js/minigames/games/floorfall.js` | `mg_floorfall_test`: median round 17.5 s → ~85 s (range ~58–118 s) |
| M4 | FIXED | The command bar's `toastin` keyframe animated `transform` against its `translateX(-50%)`, so the chips slid about 280 px sideways. It now fades in with opacity only. | `css/minigames.css` | r1_regress M4 (chip x at frame 1 = settled x; an instant tap lands on /help) |

### Final runs
- `node tools/qa_unit.mjs`: 8/8 files pass, including the new `mg_floorfall_test.mjs`.
- `node tools/r1_regress.mjs`: 22 passed, 0 failed.
- `node tools/qa_smoke.mjs --quick --port 9331`: PASS 38, FAIL 0, SKIP 2. Run on :9331 because QA owns :9317.
- `node tools/qa_minigames.mjs --port 9331 --games parkour,floorfall` (both viewports): PASS 45, FAIL 0, WARN 0. Floor Fall rounds took 65 s and 74 s, with 0 unstick hops.
