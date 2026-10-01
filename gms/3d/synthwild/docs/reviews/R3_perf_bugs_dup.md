# R3: performance, bugs and duplication (adversarial)

Reviewer C, 2026-10-02. No game files were edited. Scope: everything except `server/*`, `js/net/api.js`, `js/net/savecheck.js`
and `js/ui/{account,store,shell}.js`, which a fixer is editing; I read those only to look for duplication. R1 (A1–A12) and R2
(B1–B16) are not repeated here.

## Method and caveats
- **Phone proxy.** Headless Chrome with Metal on an M5, using mobile emulation (915×412 at DPR 2, phone UA). The game therefore picks its
  mobile defaults: Med quality, pixel ratio 1.25, render distance 6. CPU is throttled 4× (`Emulation.setCPUThrottlingRate`).
  An M5 P-core is roughly 4–5× a Cortex-A76/A78, so 4× is, if anything, slightly optimistic.
- **Frame rate is not the metric.** Every run held 59.7–59.8 fps because frames are vsync-capped. So I report main-thread busy %,
  ms per frame per system, and the worst frames. Every run has exactly one frame of 150–167 ms, at t=0. That frame is
  `Profiler.start` plus heap sampling starting, not the game.
- **GPU.** The M5 GPU uses tile-based deferred rendering with hidden-surface removal, so draw order and overdraw cost much less on it than on
  Adreno. GPU timings (`EXT_disjoint_timer_query_webgl2`) vary by ±0.2 ms between runs. I use them only for shares, never
  for before/after claims.
- Line numbers are from the files as read on 2026-10-02.

| Script (all in `tools/`) | What it does |
|---|---|
| `review_c_perf.mjs [night,build,travel,mg:<id>] [--throttle 4] [--secs 60]` | Wraps every per-frame system with timers. Takes a CPU profile, a sampled heap profile (including collected objects, which gives the allocation rate), a DOM mutation census, DOM query and layout-read counters, and draw calls. It writes JSON plus `.cpuprofile` files to `tools/qa_out/review_c/` |
| `review_c_summ.py <json…>` | Compact summary of those results |
| `review_c_heapdiff.mjs <ids> --cycles N` | Runs title → mini-game → quit cycles, takes heap snapshots after GC, diffs constructors and prints retainer paths |
| `review_c_probe.mjs`, `review_c_scene.mjs` | Draw calls per owner, program switches per frame (`FRAMES=1200`), and meshes per scene subtree and per mob |
| `review_c_cull.mjs` | Chunk meshes that pass three's bounding-sphere frustum test versus a tight AABB test |
| `review_c_gpu.mjs` | GPU ms per frame: whole frame, per chunk part, per scene child, and sky-dome variants |
| `review_c_style.mjs [night\|mg:ctf]` | `Performance.getMetrics` style and layout counts: as is, with no-op DOM writes suppressed, without `backdrop-filter`, and with the HUD hidden |
| `review_c_bugs.mjs [T1…T11]` | Bug repros and targeted measurements (T1 to T11, listed in its header). `FIXSIM=1` runs T3 with the simulated fix |
| `review_c_border.mjs` | (node) chunk-key aliasing past ±524,288 m |
| `review_c_deadcode.mjs` | (node) static list of never-imported files and unreferenced exports. Regex-based, so verify each hit by hand |

All browser scripts use CDP port 9335 (9336 for a parallel heap diff), and every run stops its browser.

### Headline numbers (4× throttle, mobile emulation, Med quality, render distance 6)
| Scenario (40–60 s) | Main thread busy | ≈ ms/frame | Biggest systems (ms/frame) | Alloc | Draws / tris |
|---|---|---|---|---|---|
| Survival at night, auto-walker, 7 mobs | 27 % | 4.5 | three render 2.18 · player 0.22 · game 0.16 · world 0.15 · brush 0.14 · ui 0.09 · chunk render 0.09 · mobs 0.09 | 4.7 MB/s | 190 / 250 k |
| Build with big stamps every 1.5 s | 20 % | 3.4 | three render 1.35 · world 0.77 · chunk render 0.31 | **23 MB/s** | 190 / 265 k |
| Travel at 19 m/s (new chunks) | 20 % | 3.3 | three render 1.28 · chunk render 0.50 (max 7.0) · world 0.28 (max 8.2) | 7.8 MB/s | 126 / 156 k |
| Parkour | 15.5 % | 2.6 | three render 1.35 | 3.5 MB/s | 179 / 240 k |
| Treasure | 17 % | 2.8 | three render 1.36 | 4.1 MB/s | 164 / 194 k |
| CTF (5 bots) | 20 % | 3.4 | three render 1.90 · ui 0.20 | 5.6 MB/s | 205 / 261 k |
| Hide & Seek / Seek | 20 % | 3.3 | three render 1.65 / 1.89 | 4.5 MB/s | 170–217 / 220–250 k |
| Siege | 25 % | 4.1 | three render 1.80 · ui 0.22 · player 0.22 | 5.8 MB/s | 171 / 228 k |
| **Floor Fall** (first 40 s, before sudden death) | **37 %** | **6.2** | three render 2.29 · **ui (game) 1.75** · chunk render 0.65 | **35 MB/s** | 293 / 281 k |

- **GPU on M5:** 1.2–1.6 ms per frame at 1143×515. The sky dome alone is about 0.6 ms of that (C6). All chunk geometry is about 0.8 ms.
- **CPU fits a 30 fps phone budget** with room to spare everywhere except Floor Fall's late game (C1) and big Build stamps (C2).
  GPU fill and draw calls are the real phone risk (C5–C7). I could not measure that on an Adreno.
- **Heap: R2's "+7 MB per mini-game" lead is gone.** At the title after forced GC, the heap went 66.0 → 66.3 → 66.5 → 66.8 MB over three cycles of
  parkour+floorfall+ctf+siege, and 50.9 → 51.0 → 51.1 MB over cycles of treasure+hideseek+seek. That is about 0.07 MB per run. GPU geometries
  and textures stay at 15–16 across 3 worlds and 3 mini-games. The diff's only real retainer is the media leak (C13).

---

## 1. Performance (ranked by measured cost)

### C1 · HIGH (perf + visible bug) · PROVEN: Floor Fall re-breaks every fallen tile on every frame, and pins the particle system at its cap
`js/minigames/games/floorfall.js:135-141`. A tile that falls is set to `-999` but never deleted from `this.cracks`. Every frame the loop runs
`k.split(',').map(Number)` and `world.setBox(...air...)` again, and there is a 35 % chance of `fx.spark` per fallen tile.

`review_c_bugs.mjs T3` (unthrottled desktop, so a phone pays about 4×):

| | fallen tiles | `setBox` calls/frame | game ms/frame | live particles |
|---|---|---|---|---|
| 4 s into the round | 69 | 57 | 0.38 | **512 (cap)** |
| sudden death +8 s | 430 | 410 | 0.73 | 512 |
| sudden death +16 s | 830 | **812** | **1.17** | 512 |
| **simulated fix** (prune fallen entries), +16 s | 0 | 1.3 | 0.21 | 28 |

The cost grows with every tile that falls. Three floors hold 1,875 tiles, so a full round heads for about 1,800 `setBox` calls per frame.
Each call allocates a `Uint32Array(256)`, a `Set` and arrays. That is the 35 MB/s in the table above, and over the 40 s profile `setBox`
plus `floorfall.update` took 2.7 s. Players can also see it: phantom sparks hang over every hole for the whole round, and because the
512-particle pool is full, real hit and crack sparks are recycled away.

**Fix:** `this.cracks.delete(k)` once a tile falls. This is safe: `crackAt` already refuses air (`!m`), and `safe()` checks `isSolidSub`. Key the map numerically
(`(x*4096+y)*4096+z`) rather than with strings.

### C2 · MEDIUM · PROVEN: big Build edits stall 70–170 ms, and relighting allocates about 1 GB per minute
`js/world/light.js:76-135` (`addBfs`/`relightChannel` queues are growing JS arrays), `js/world/world.js:57-63` (each voxel access goes
through closures that do a `Map.get(secKeyNum(...))`), `:208-219` (`setBox`/`writeBox` call `finishLight()` first), `js/player/edits.js:52-62`
(`rleEncode` pushes into a JS array).

`review_c_bugs.mjs T11` at 4×:
- One 64×16×64 m fill (4.2 M subs) takes **104.5 ms** synchronously, and its deferred relight then runs for 24 more frames (worst 31.7 ms).
- A second big stamp issued before that relight ends takes 68 ms. A third right after takes **171 ms**, because `setBox → finishLight()` runs
  the rest of the previous relight synchronously.

In the 60 s Build profile, inclusive CPU was: relight 2.6 s, remesh (buildCol + dispatch + meshPayload) 1.4 s, `setBox` 0.43 s, undo snapshot 0.32 s.
Allocations from `addBfs` and `relightChannel` were **565 MB + 434 MB in 60 s**, which is most of the 23 MB/s.

**Fix:**
- Use reusable `Int32Array` queues with packed xyz (grow by doubling, reset the length per run) instead of `push`.
- Cache the last section in `_lget`/`_lset`/`_opac`. Most neighbour reads hit the same section.
- `relightChannel` pushes six neighbours for every changed cell (`:132`). For a solid fill, only the box boundary can seed light.
- Don't `finishLight()` on a new edit unless the boxes overlap. Instead, queue the new cells into the running relight.

Estimate: 2–4× less relight CPU and almost no garbage.

### C3 · MEDIUM · PROVEN: the HUDs rewrite unchanged DOM every frame, forcing a layout every frame in mini-games
- `js/minigames/hud.js:18,23-27`: `timer()` sets `textContent` every frame. The value changes once a second, but setting it replaces the text node
  each time. `paint()` reads `score.innerHTML` (a DOM serialisation) and writes two `style.display` values every frame.
- Per-frame callers: `ctf.js:145,206` (timer, and an identical objective string), `hideseek.js:114,116` (timer, and a score set through `innerHTML`),
  `siege.js:136,149`, `parkour.js:95`, `floorfall.js:120`, `treasure.js:101`.
- `js/ui/hud.js:82` calls `compass.classList.add('on')` every frame. `:176,178` toggles and removes the droop class every frame (`remove()` always mutates).
  `:79` rebuilds the arrow's `transform` string even when the yaw hasn't changed.

The mutation census shows 160–240 DOM mutations/s in every scenario. `review_c_style.mjs mg:ctf` at 4×:

| | layouts/s | layout + style ms/s | main-thread task ms/s |
|---|---|---|---|
| as is | **60** | 18.2 | 207 |
| no-op class/text/innerHTML writes suppressed | 1.4 | 0.9 | **150** (−57 ms/s ≈ 0.95 ms/frame) |

In survival the remaining 60 style recalcs/s come from real changes (compass arrow, meter cells), about 10 ms/s at 4×.

SUSPECTED, worse on phones: `js/player/touch.js:119` (`local()`) calls `getBoundingClientRect()` on every touch event. After those
per-frame text writes, each `touchmove` forces a synchronous layout.

**Fix:**
- In `createMgHud`, cache the last string and skip identical writes. Track `display` in a variable rather than reading `innerHTML` back.
- In `hud.js`, guard `classList` calls with a cached state (as `bottom._mg` already does). Write the compass `transform` only when the angle changes by more than 1°.
- In `touch.js`, cache the rect on resize.

### C4 · MEDIUM · PROVEN: Siege rebuilds the Core HP ring geometry on every frame
`js/minigames/games/siege.js:131-132`. Each frame it calls `hpRing.geometry.dispose()` and then creates a `new RingGeometry(…, 48 segments, …)`. `review_c_bugs.mjs T9` counted
120 geometry disposes in 120 frames. That means a new GPU vertex and index buffer upload every frame, plus `RingGeometry` as the **top JS allocator in
Siege** (1.2 MB/s, `mg_siege_t4.json`). `(program)` (native and GL) is 8.3 % of samples here, against about 5 % in the other games.

**Fix:** build the ring once and set `geometry.setDrawRange(0, ceil(fraction × indexCount / 6) × 6)`. Alternatively, rebuild only when `hp` changes
(it changes about 10 times per game), or use a shader uniform for the arc.

### C5 · MEDIUM · PROVEN (draw and triangle counts) / SUSPECTED (phone ms): chunk columns are culled by a loose bounding sphere
`js/render/chunks.js:118-119`. Each column mesh (16 × up to 128 m) is culled with the sphere around its box, so most of the frustum's side
planes never reject a column. `review_c_cull.mjs` (mobile, render distance 6, five views):

| view | in range | pass sphere | pass AABB | tris sphere | tris AABB |
|---|---|---|---|---|---|
| level | 356 | 160 | 132 | 242 k | 192 k |
| side | 356 | 158 | 129 | 232 k | 190 k |
| behind, down | 356 | 187 | 161 | 272 k | 222 k |
| down | 356 | 197 | 174 | 293 k | 258 k |
| up | 356 | 147 | 131 | 244 k | 220 k |

An AABB test cuts chunk draws by **11–18 %** and triangles by **10–21 %**, for free.

**Fix:** set `frustumCulled = false` on chunk meshes. Then, in `render.update`, test `frustum.intersectsBox(col.box)` once per column (about 140 boxes, under 0.05 ms)
and set `visible`. Possible later step: split very tall columns into two y-halves.

### C6 · MEDIUM · PROVEN (GPU share on M5) / SUSPECTED (cost on Adreno): the sky dome is drawn first and runs its full procedural path on Med quality
`js/render/sky.js:126-133`.
- `renderOrder = -10` puts the dome first in the opaque pass. It is drawn over the whole screen before any terrain exists in the depth buffer.
- `lowQ()` turns on `LOW` only at quality `low`. So Med, the phone default, runs stars, two aurora noise lookups and three octaves of cloud
  value-noise on every sky pixel.

On the M5 (whose hidden-surface removal shades only the sky pixels that end up visible), `review_c_gpu.mjs` measured **0.72 → 0.095 ms** with chunks
hidden when the dome is removed. With chunks on, the dome is about 40 % of the 1.5 ms GPU frame.

Adreno uses early-Z and LRZ, so draw order matters there. Drawing the dome first means shading every pixel, including all the ones terrain covers
afterwards. The order is free to change: the vertex shader already pushes the dome to depth 0.99999·w.

**Fix:**
- Set `dome.renderOrder` to just after the cutout pass (for example 1.5, before water at 2). It then shades only pixels that are still sky.
- Enable `LOW` (or a cheaper MED variant: one cloud octave, no aurora) when `quality !== 'high'`.

I couldn't show a gain on the M5, because draw order doesn't matter on its GPU and the timer varies by ±0.2 ms.

### C7 · MEDIUM · PROVEN (counts): multi-mesh rigid models multiply draw calls
`review_c_scene.mjs` and `review_c_probe.mjs`:
- Each **rival bot is 29 meshes** (the full `createAvatar()` from `js/minigames/bots/view.js:36`, plus a ring and a name sprite).
- Mobs are 3–11 meshes each (reboot 9, archer 11, spider 11, bull 9, voidlinker 8, gelcore 3).
- The first-person hand is 8 draws every frame. The brush outline is 13 meshes.

Each CTF bot adds about 30 draws when on screen, so CTF's three render cost is 1.90 ms/frame against 1.35 in Parkour (4×). With the mobile cap of 10 mobs, about 90 draws are mobs.

**Fix:**
- Merge the static parts of each rigid sub-assembly (`mergeFlat` already exists in `models.js`). Better still, give each model one skinned or bone-indexed geometry with a uniform
  matrix array, which makes each mob one draw.
- Merge the hand (8 → 1–2 meshes).
- Use one `LineSegments` for the outline.
- For bots, use a low-detail avatar (merged, about 3 draws) beyond about 8 m.

### C8 · LOW · PROVEN: `world.update` rescans the whole request spiral every frame
`js/world/world.js:274-306`. Every frame it sets `_center = [pcx, pcz]` and walks `spiral(radius)` (about 150 offsets at radius 7), building a `chunkKeyStr` string for each one,
even when every chunk is already loaded or requested. This is **the largest steady-state JS allocator in every scenario** (29–50 MB per 40–60 s,
about 0.8 MB/s) and costs 0.15–0.28 ms per frame at 4×.

Related: `chunks.js:134-162`. `dispatch()` iterates the whole `stale` set every frame and allocates `cand`/`order` arrays. Sections in
chunks outside `lim` but inside the world's keep radius stay in `stale` forever: `stats.pending` sat at 224 in a settled night world and at 112 after travel.

**Fix:**
- Rescan only when the centre chunk changes, a chunk loads or unloads, or a worker frees up. Use numeric keys.
- In `dispatch`, skip when nothing in range is stale. Keep out-of-range stale keys in a separate set that the cull pass revisits when the camera moves.

### C9 · LOW · PROVEN: other per-frame garbage (3.5–6 MB/s in total, GC 0.2–0.4 % of samples)
Small, steady churn. Worth fixing only alongside C8:
- `game/index.js:186`: `game.last = {x,y,z}` and the `alwaysDay ? {…}` object.
- `env.lightAt` returns a new object per call, per mob per frame.
- `player.js:111-118`: literal offset arrays in `_touching`.
- `bus.emit` spreads a copy of the handler set on every emit.
- `ctf.ents()` builds a new array each frame.
- `[ta, tb] = [tb, ta]` swaps in the slab tests.

Three's own sort and uniform paths add about 1.5 MB/s more.

### C10 · LOW · PROVEN: thumbnail capture on the main thread
`js/ui/shell.js:238-251`. On a pause save, or every 5th autosave, the thumbnail re-renders the scene and runs `toDataURL('image/jpeg')`. `review_c_bugs.mjs T10` (96 modified
sections, 4×): `engine.save` 10.2 ms, `toDataURL` 8.9 ms, whole save 69.5 ms async. The longest frame was **33 ms** (one dropped frame). That is acceptable.
If it matters, use `canvas.convertToBlob` on an `OffscreenCanvas`, or `createImageBitmap` plus a worker.

---

## 2. Bugs (ranked)

### C11 · HIGH · PROVEN: in Survival, placing a block can overwrite solid blocks and unbreakable Coreplate, with no drop
`js/player/brush.js:262-279` (`_doPlace` → `tools.edit(…, 'fill')`), `js/player/brushmath.js:13-27` (`placeBox` is flush to the hit
face but snapped to the scale grid only in-plane), `js/world/edit.js:52-60` (`fill` writes every sub).

When the hit face is not on the cell grid, a scale-1 place box straddles two cells. That happens on the top of a ½ slab, the side of a ¼ block, and similar faces, all of
which Survival allows (scales ¼, ½, 1). `fill` then replaces whatever is in the second cell. `review_c_bugs.mjs T1`: a ½ loam slab with a full
block above it, then place one Polymer Brick on the slab's top face:
- Basalt above: `subAbove 3 → 27`. Half the basalt cell became brick, **0 drops**, and 1 brick was paid.
- Coreplate above: `5 → 27`. **Coreplate (hardness −1, `drops: 'none'`) was replaced.** Mining the brick afterwards leaves a hole in an
  "unbreakable" surface.

The same path can carve into station cells (a Cache or Sleep Pod) and into other players' builds in a visited world, and the overwritten material is simply
deleted. Placing into water and plants is meant to work. It does (T2), and it must keep working.

**Fix:** add a `place` mode to `setBox` that writes only subs that are air, liquid or plant (or `!SOLID`). Use it for Survival single
places and for the Survival volume-confirm path (A6). Charge `r.changed`, which is already the case. Build-mode `fill` can stay destructive by design.

### C12 · MEDIUM · PROVEN: rotating a phone to portrait mid-game shows "Turn your device" but doesn't pause
`index.html:26-31,44` is a CSS-only overlay (`@media (orientation: portrait) and (pointer: coarse)`), and no script reacts to it. `review_c_bugs.mjs T4`
(mobile, night, three Reboots near the player, then rotated to portrait for 6 s): `paused: false`, `#rotate: flex`, and **Integrity 20 → 10** while the
child can't see or control anything. A kid who turns the phone to show someone comes back dead.

**Fix:** have `matchMedia('(orientation: portrait) and (pointer: coarse)')` call `shell.pause()` on a change to portrait (and release touches). Don't
auto-resume. The pause card is already there.

### C13 · LOW–MEDIUM · PROVEN (retention) / SUSPECTED (consequence): every music track change and VO line leaks an `<audio>` element and its audio graph
`js/audio/audio.js:49-60` (`makeTrack` calls `new Audio` and `createMediaElementSource` per track), `:64-70` (`fadeOut` pauses, disconnects and clears `src`),
`:161-181` (`vo()` does the same per line).

`MediaElementAudioSourceNode` holds a "pending activity" in Blink, so the element, its `blink::MediaPlayer` and the track `GainNode` are never
collected. Evidence:
- The heap diff retainer path is `Pending activities → MediaElementAudioSourceNode → <audio>`, with +16 elements, +16 MediaPlayers and +8 GainNodes over 8 mini-game runs.
- `T7` counts `audioEls`/`mediaSources` going 0 → 2 → 4 → 6 → 8 → 10 → 12 across 3 worlds and 3 mini-games: two per title↔game round trip, plus one for each day/night flip and each VO line.

The JS bytes are tiny. The native media players are not, and mobile Chrome limits how many it allows.

**Fix:** create two persistent music slots (an element, a source and a gain each, for the crossfade) and one VO slot at `ensure()`. Then swap `el.src`
instead of making new elements.

### C14 · LOW · PROVEN: no world border, and section keys alias beyond ±524,288 m
`js/world/section.js:16` packs `(cx+32768)*65536 + (cz+32768)`, so `cz = 32768` collides with `cx+1, cz = −32768`. `review_c_border.mjs` showed that reading
z = +524,293 returns the chunk at z = −524,283, and an edit there writes into that far chunk. Walking that far is not realistic (7.7 h of sprint-flying),
but `js/net/savecheck.js:4` allows `XZ_LIMIT = 1e6`, so a crafted public world puts a visitor there (B6's attack class).

**Fix:** a border at ±500,000 (clamp the player, and skip generation past it), with `XZ_LIMIT` ≤ 500,000. Section keys in a save should be range-checked too.
This is a note for the server/net fixer, who owns `savecheck.js`.

### C15 · LOW · SUSPECTED: a mini-game's results timer fires into the next session
`js/minigames/index.js:36`. `setTimeout(() => hud.results(...), 700)` is never cancelled. If the player quits or starts another game within 0.7 s of `finish`, it
appends a card to the disposed HUD (harmless) and calls `ctx.input.releasePointer()` on the new session, dropping a fresh pointer lock on desktop.
**Fix:** keep the handle and clear it in `stop()`, or check `run?.mg === mg` first.

### C16 · LOW · SUSPECTED: two fingers on one hold button
`js/player/touch.js:210-223` (`end`). Lifting either finger clears `.on` and calls `setHeld(L.hold, …, false)` while the other finger is still down, for
attack, place and the stick sprint. **Fix:** count touches per button.

---

## 3. Code duplication and dead code (ranked by lines saved and risk removed)

### C17 · Leftover stubs and fallbacks from parallel lanes (about 95 lines)
| Where | What | Keep / change |
|---|---|---|
| `minigames/games/floorfall.js:15-33,80-89` | `StubBot` class plus the `try { import bots } catch { squad = null }` fallback. Bots ship now | Delete. Use `BotSquad` directly (~25 lines) |
| `player/edits.js:33-49,71-93,103-110` | `readBox` per-cell fallback, `greedyBoxes`, and the `writeBox` greedy fallback. Only `tools/player_stubworld.js` (test-only) lacks `world.readBox`/`writeBox` | Point `player_test.mjs` at the real `World` (R1 did this for other tests), then delete (~45 lines) |
| `player/player.js:268-280` + `player/physics.js:130-132` | Second fall-damage path with a **different curve** (½ per m over 3.2, versus survival's 1 per m over 3). It's dead whenever `ctx.game.survival` exists (`noFall` at :276) | Keep `game/index.js:190-197` + `survival.fallDamage`. Delete the player path and `physics.fallDamage`, and update `player_test.mjs:78` (~14 lines) |
| `main.js:284` + `player/player.js:168` | `brush.update` is called twice a frame and de-duplicated with an `input.frame` guard (`brush.js:97-98`) | Keep main's call (documented frame order). Drop player's call and the guard (~4 lines) |
| `game/env.js:9-14` | `lightAt` fallback that reads `world.sections` by string key | World always has `lightAt`. Delete (~6 lines) |
| `audio/audio.js:99,195-198` | `blocks = ctx?.world?.blocks || ctx?.blocks || blocks` plus `attachBlocks()` dynamic import | Import `BLOCKS` statically (~8 lines) |

`tools/player_stubworld.js` is **not** imported at runtime: only `tools/player_*` use it.

### C18 · Dead code (about 70 lines)
- `main.js:239-250`: `engine.thumbnail()` has no callers. `shell.js:238-251` has its own `thumb()`. Keep one: move `thumb()` into the engine and call it from the shell, or delete the engine one.
- `main.js:4,49`: `ctx.rng = createRng(...)` is never read (grep `ctx.rng`/`.rng.`: none). That makes `core/rng.js` `createRng` and `hash3` dead too. Only `hashString` and
  `mulberry32` are used, by `atlas.js` and `loot.js`.
- `core/math.js`: `lerp`, `invLerp`, `damp`, `lerp3`, `mod` and `TAU` are unused. Only `sky.js` imports this file (`clamp`, `smoothstep`, `hexToLinear`).
- `world/section.js`: `CS`, `WORLD_H`, `SECTIONS_Y`, `SUB`, `cellIndex`, `getSubLocal`, `isAllSky` and `refinedCount` are unused (~20 lines).
- `player/brushmath.js:98-102` `subsToBlocks`, `game/stations/oven.js:35` `ovenActive` and `data/blocks.js:201` `MAX_ID` are unused.
- `review_c_deadcode.mjs` also lists about 60 exports that are only used inside their own file. That is harmless and not worth churn.

### C19 · Block-property lookup tables rebuilt in six places, with two meanings of "liquid" (about 15 lines, plus consistency)
- `world/raycast.js:4-5` (`LIQ` = `liquid`, plus `PLANT`)
- `world/edit.js:5-6` (`LIQ` = `liquid`)
- `main.js:99-101` (`waterIds` = `liquid || waterlogged`)
- `game/env.js:29` (`isLiquid` = `liquid || waterlogged`)
- `player/player.js:121-125` (`_liquidAt` = `liquid || waterlogged`)
- `player/player.js:11` (`CLIMB`, `KELP`)

**Canonical:** export `LIQUID`, `WET` (liquid or waterlogged), `PLANT` and `CLIMB` `Uint8Array`s from `data/blocks.js` next to `SOLID`, `OPACITY` and `EMIT`. Then change
those five files and `tools.js:44,162`.

### C20 · Ray-vs-AABB slab test written three times (about 18 lines)
`game/mobs/index.js:349-358` and `:364-372` (two copies in one function, with pads 0.12 and 0.15), and `game/projectiles.js:4-14` (`segBox`).
**Canonical:** export `segBox(o, d, len, box, pad = 0)` from `core/math.js` (no destructuring swap) and call it from all three.

### C21 · Quality and "is mobile" decided in 3–4 places with different rules (about 10 lines, plus a small bug)
- Quality: `main.js:59-63` `quality()`, `render/chunks.js:14` `quality()`, and `render/sky.js:126` `lowQ()`. **`lowQ` ignores `?q=low`**, so
  with `?q=low` the terrain is Low but the sky runs its full shader.
- Mobile: `main.js:25` (coarse pointer **or** UA), `ui/settings.js:3` (coarse pointer only, which drives the Med and render-distance-6 defaults), `game/mobs/index.js:13`
  (coarse pointer only, which drives mob caps), and `player/brush.js:201` (screen size).

**Canonical:** `ctx.quality()` and `ctx.isMobile` from `main.js`. Pass them into `createSky`/`createChunkRenderer`, and have settings defaults and
mob caps read `ctx.isMobile`.

### C22 · Toast and notification paths (about 15 lines)
`ui/dom.js:61` `toast()` is the canonical one. Three thin wrappers each dynamic-`import()` it on every call: `game/stations/index.js:130-132` `say`,
`game/journal/ui.js:34-36`, and `game/stations/ui.js:187`. Mini-games add a separate toast element (`minigames/hud.js:14,31`, `.mg-toast`), and
`ui/ui.js:130` has a narrator subtitle. In a mini-game, a goal toast and an `mg-toast` can show at the same time in two places.
**Change:** import `toast` statically (or emit `ui:toast` on the bus), and render `mg.hud.toast` through `dom.toast` with a `kind:'mg'` style.

### C23 · RNG and hash: three mulberry32 copies, and two `seedToInt`/`hash3` pairs with the same names but different algorithms
- `core/rng.js:17-24` (`mulberry32`, plus the murmur-style `hashString`/`seedToInt`) versus `minigames/arena.js:17-27` (its own string hash plus an inlined mulberry32).
- `world/noise.js:3-20` has an FNV `seedToInt` and its own `hash3`. **World generation depends on the `noise.js` versions, so they must stay byte-for-byte.**
  Rename the `core/rng.js` ones (or delete the dead `hash3`) so a future import can't pick the wrong one.
- `arena.js` `rng` sets the Parkour and Treasure layouts, and saved Parkour ghosts and bests depend on those layouts. Replacing it with
  `createRng` would silently change every course. Keep its hash and call `mulberry32` from `core/rng.js` (~8 lines).

### C24 · Mini-game arena helpers split across two modules (about 5 lines, plus clarity)
`minigames/arena.js:3` re-exports `minigames/bots/arena.js`. `ctf.js:5`, `hideseek.js:7` and `siege.js:3` import from `bots/arena.js`, while
`parkour.js:2`, `floorfall.js:3` and `treasure.js:2` import from `arena.js`. Move the building helpers into `minigames/arena.js` and import only from there.

### C25 · Copied shader and styling code (about 20 lines, LOW)
- The suit material (`player/avatar.js:18-46`) and the mob `bodyMaterial` (`game/mobs/models.js:55-82`) carry near-identical "panel seam + top gradient + rim" GLSL.
  Share one GLSL chunk string.
- `player/brushview.js:79` and `player/touch.js:68` inject CSS strings and build DOM with `createElement`/`innerHTML`. The UI lane uses `ui/dom.js` `h()`
  and `css/*.css`. Moving that CSS into `css/hud.css` removes about 40 lines of CSS-in-JS and puts it with the rest of the theming. This is an idiom split, not copied logic.

**Estimated total for section 3: about 260 lines removed**, with the six liquid tables and three quality resolvers collapsed so they can't drift
apart again.

---

## Checked and found SOUND
- **R2's mini-game heap lead:** resolved. The heap is flat (≈0.07 MB per mini-game run) and GPU geometries and textures stay at 15–16 across worlds and mini-games.
  Bot and flag disposal (B3) now works.
- **Timers and listeners across cycles (T7):** 0 intervals. `window`/`document` listener counts are constant except one `pointerdown {once}` per
  title visit (`shell.js:63`), which goes away on the first tap. UI node count and scene object count (106) return to baseline. Bus subscriptions are made at init only.
- **WebAudio one-shot SFX:** each voice's nodes are disconnected after 2.2 s and collected. Only the media-element path leaks (C13). Voices are capped (`MAX_VOICES`).
- **Workers:** 3 gen + 3 mesher at `hardwareConcurrency − 2` (capped at 3 each), so 6 on an 8-core phone. Mesh payloads (18³ cells/light, about 29 KB)
  and results are **transferred**, not copied, and the block table is posted once. Gen workers are terminated per world.
- **Chunk arrival:** at 19 m/s in fresh terrain (4×), streaming kept up. `world.update` max was 8.2 ms and the renderer max 7.0 ms (both time-boxed), with no frame
  over 50 ms after the first.
- **Program switches:** with the counter on every material (including instance-level `customProgramCacheKey`), there were 0 per frame over 1,200 frames.
  The `getParameters` time in the profiles is first-use compiles when a new mob kind or effect appears.
- **Instancing:** drops and gems are two `InstancedMesh`es, swimmers are instanced, particles are one `Points`, and plants are in the chunk cutout mesh. Holograms and EMP
  spheres are pooled.
- **Saves:** `engine.save` is 10 ms and the whole save 70 ms async on a 96-section build at 4×. IndexedDB never blocked a frame. JSON in hot paths: none.
  `querySelector` in loops: none (DOM query counters were 0/s in play).
- **Long session (T8):** 30 in-game minutes of survival simulated, with two night cycles. Mobs held at the 16 cap, the model pool stayed bounded (8), drops,
  projectiles and particles returned to 0, and the heap was 80 MB. No growth.
- **Settings mid-game (T5):** quality low/med/high/low/high, render distance 2/12/6, FOV, and narrator mid-line produced no exceptions. Post toggles with quality
  and geometries follow render distance. Program count grows once per quality variant and then stabilises (cached, bounded).
- **Felling (T6):** 45–46 break events per tree, 4–17 ms at 4×, and lighting is not left pending.
- **Water (T2, the QA flake lead):** the aim ray passes through water to the seabed, and placing into a water cell works. Breaking a shoreline cell floods
  it on purpose (`edit.js` `floodPass`), so QA's break target should avoid water-adjacent cells. That is not a game bug.
- **Height limits:** placing above y=127 is a clean no-op (`setBox` clamps `y1` to 512), cell y=0 is immutable, light above 127 reads as full sky, and the raycast
  stops at both bounds.
- **Assets:** all 36 files in `audio/` and `assets/` are referenced (music ×4, VO ×11 per narrator plus manifests, and 8 intro stills).
- **Fullscreen exit, resize and visibility:** fullscreen state syncs on `fullscreenchange`, resize updates the renderer, camera, post and touch layout, and
  a hide during a save joins the queued save (A5 fix).

## Fix log: engine lane (C2, C5, C6, C7, C13, C21)

| ID | Status | Change | Before → after |
|---|---|---|---|
| C2 | FIXED (relight); PARTIAL (back-to-back, brush) | `js/world/light.js`: relight/merge queues are reusable growable `Int32Array` queues (per world, reset per run, no `push` garbage); a cached light view remembers the last section so neighbour reads skip the `Map.get(secKeyNum)` hash; writes keep `_lset` semantics (version++, dirty marks incl. border neighbours, null sections via `W.lset`); the cache resets after every yield. `world.js` `_W` gains `sec()`/`markDirty()` (two lines) | `tools/engine_light_bench.mjs` (node, 64×16×64 m, sync relight): relight 65/116/53/44/100 ms → **37/45/24/20/41 ms**; heap growth per stamp **~70 MB → ~6 MB**; GC time 27 → 9 ms. Browser 4×: `world.setBox` of the stamp **35.6 ms** (<40). T11 (through the brush): first 104.5 → 98.7 ms, deferred relight 24 → 16 frames, third back-to-back 171 → 125 ms. Brute-force light test still green (world_test 491/0) |
| C5 | FIXED | `js/render/chunks.js`: chunk meshes `frustumCulled = false`; each column keeps a tight world `Box3` (real y range) and is tested against the camera frustum once per frame | forest view, mobile, rd 6: calls 152 → **132**, tris 264 k → **224 k** |
| C6 | FIXED | `js/render/sky.js`: three shader tiers from `ctx.quality()` (high = all; **med = stars + one cloud octave, no aurora**; low = gradient/sun/moon/ring); `setQuality` swaps them; `?q=low` now reaches the sky. Dome `renderOrder` −10 → **1.5** (after opaque and cutout terrain, before water) so early-Z phones only shade visible sky | M5 GPU (med, 1144×515 forest): 1.2–1.6 → 1.0 ms min / 1.6–1.9 median (M5 hides draw-order gains, as the review noted) |
| C7 | FIXED (bots, hand); OPEN (mobs, brush outline) | `js/player/avatar.js`: avatar boxes merged per animated pivot into one palette material (per-vertex slot → colour/emissive/pulse uniforms, re-tintable via `avatar.setPalette`) → **6 meshes** per avatar; hand arm merged to one mesh. `bots/view.js` uses `setPalette` | bot 29 → **8** draws (6 body + ring + tag); hand 8 → **3**; CTF `gl.render` 1.90 → **1.67 ms/frame** (4×), calls 205 → ~180 |
| C13 | FIXED | `js/audio/audio.js`: two persistent music slots (element + source + gain each, crossfade alternates) and one persistent VO slot; only `el.src` changes; fade-out pause is token-guarded so a reused slot is never paused by a stale timer | T7 `audioEls`: 0→2→4→…→12 → **0→2→2→2→2→2→2** |
| C21 | FIXED (render/main/sky) | `js/core/quality.js`: `isMobile`, `defaultQuality()`, `resolveQuality(settings)` (query `?q=`/`?lite=1` > setting > device default). `main.js` (`ctx.quality()`), `chunks.js` and `sky.js` use it. **For the UI/gameplay fixer:** `ui/settings.js` defaults and `game/mobs/index.js` caps can import `isMobile`/`defaultQuality` from `js/core/quality.js` | `?q=low` sky now low |

Also from the art pass this session (R2 B3/B14) — see `docs/notes/engine.md`.
Not done (outside this lane's files): `setBox → finishLight()` still completes a pending relight before the next edit (world.js setBox; suggested: chain the new relight instead of finishing, the queues allow it); the brush undo snapshot + `rleEncode` (player/edits.js) is most of the remaining ~60 ms of T11's first stamp at 4×; mobs are still 3–11 meshes each.

### C7 (mobs) — FIXED
`js/game/mobs/models.js`: each mob's body-material parts **and** its shared glow parts (eyes, visor, face glyphs, nucleus, tank) are merged once per kind into a single bone-indexed geometry (`aBone`, `aGlow` attributes; ≤16 parts). The original part meshes stay in the graph as invisible transforms (layers disabled), so the kinds' animation, scale and `.visible` toggles keep working; `onBeforeRender` writes their root-relative matrices into `uBones` (hidden parts get a zero matrix). One material per mob instance keeps per-instance `uTint`/`uFlash`. Telegraph meshes with their own materials (glitchfuse ring/halo/strobe sprite, reboot flare/core sprites, archer beam/charge, void-linker eyes + aura, spider eyes, gel-core shell) are untouched.
Night survival with all 8 kinds on screen: mob draws **44 → 12** (scene 234 → 202 calls). Per mob: ibis 8→1, glitchfuse 7→1 (+ring/halo/strobe when fusing), reboot 9→3, archer 11→2, spider 11→3, bull 9→1, voidlinker 8→3, gelcore 3→2. Day/night screenshots match the pre-merge look. game_test 722/0, qa_unit 9/9. qa_smoke: the only failures are mobile "break → target becomes 14 (water)" in the world-edit flood path (other fixer's files, unrelated to rendering).

## Fix log: gameplay/UI fixer (C1, C3, C4, C11, C12, C14, C17–C25, plus the engine remainders for C2, C7 and C21)

Every bug fix has a regression test that I ran against the unfixed code first and saw FAIL:
- `tools/r3_test.mjs` (node): 10/12 FAIL before (C11 and C14). Later added: C2a FAIL (`forced 1`).
- `tools/mg_floorfall_test.mjs` C1 checks: 2 FAIL before (fallen entries piling up into the millions, 757 `setBox` calls per frame).
- `tools/r3_regress.mjs` (browser, :9331): 6/7 FAIL before (C11, C12, both C3 checks, C4, C14).

| ID | Status | Change | Files | Test (before → after) |
|---|---|---|---|---|
| C1 | FIXED | A fallen tile is deleted from `cracks` instead of being set to −999, so it is never re-broken or re-sparked. `crackAt` already refuses air. String keys are kept: the cost was the never-pruned entries. | `minigames/games/floorfall.js` | `mg_floorfall_test`: lingering fallen entries 0, `setBox`/frame < 3 (was 757) |
| C3 | FIXED | Added `setText`/`setHtml`/`setCls`/`setStyle` in `ui/dom.js`: each skips a write when the value is unchanged. The mini-game HUD uses them, and `paint()` no longer reads `innerHTML` back. The main HUD guards the compass `on` class, the droop and flash classes, and air/water visibility. The compass arrow is written only when the rounded angle changes. Meter cells move in 5 % steps, so a draining meter isn't a style write every frame. `touch.js` caches the zone rect on layout/resize, so there is no `getBoundingClientRect` per touch. | `ui/dom.js`, `ui/hud.js`, `minigames/hud.js`, `player/touch.js` | `r3_regress` C3, DOM mutations/s: survival 122 → **2**, CTF 242 → **1** |
| C4 | FIXED | The HP ring is built once. HP only sets `geometry.setDrawRange(0, ceil(f·48)·6)`, and the colour is set only when HP changes. | `minigames/games/siege.js` | `r3_regress` C4: 90 disposes in 90 frames → 0. The arc still follows HP (50 % HP → 0.5 of the ring) |
| C11 | FIXED | New `setBox` mode `'place'`. It is a separate function (`placeBox` at the end of `world/edit.js`, plus one dispatch line at the top of `setBox`). It writes only into air, liquid and plant subs (`REPLACEABLE` in `blocks.js`), through `readBox`/`writeBox`. Survival single places and the survival volume confirm use it. Build stays destructive. | `world/edit.js`, `data/blocks.js`, `player/brush.js` | `r3_test` (real World): basalt and coreplate above a ½ slab survive, only the 32 air subs fill, placing into water and over a plant still works. `r3_regress` C11 through `brush._doPlace` |
| C12 | FIXED | `matchMedia('(orientation: portrait) and (pointer: coarse)')` plus `orientationchange`: rotating to portrait while playing closes panels and pauses. Turning back to landscape resumes, but only if the rotation was what paused it. | `ui/ui.js` | `r3_regress` C12: portrait → paused, landscape → playing (before: never paused) |
| C14 | FIXED | `WORLD_BORDER = 30000` and `clampToBorder()` in `world.js`. The player is clamped every physics step, horizontal velocity is zeroed, and a toast "You reached the edge of the world" shows at most every 4 s. `savecheck.js`: `XZ_LIMIT` 1e6 → 30,000, and sections whose chunk is past the border are dropped. | `world/world.js`, `player/player.js`, `net/savecheck.js` | `r3_test` (save clamp, sections dropped, helper). `r3_regress` C14: walking east from x=29,997.5 stops at ≤ 30,000 with the toast (before: 30,022, no toast) |
| C2 (remainder) | FIXED | (a) `world.setBox`/`writeBox` no longer call `finishLight()`. A new edit's relight is chained after the pending one (`chainGen`), since the shared light queues only allow one relight at a time. (b) Undo snapshots keep the raw `readBox` array and are RLE-packed later, one entry per idle callback. `rleEncode` writes into a growing `Uint8Array` instead of `push`. `world.readBox` fills uniform rows and skips air writes. | `world/world.js`, `player/edits.js`, `world/edit.js` (readBox inner loop) | `r3_test`: back-to-back edits trigger 0 forced finishes (was 1), and the chained relights equal a full recompute (0 diffs). T11 at 4×: first stamp 98.7 → **65 ms**, back-to-back 125 → **37 / 33 ms** (target < 50) |
| C7 (remainder) | FIXED | The brush outline's 12 edge bars are now one indexed geometry, rewritten only when the box or thickness changes. With the face, that is **2 meshes (was 13)**. | `player/brushview.js` | `r3_regress` C7: 2 meshes, and the bars' bounds still wrap the box |
| C21 | FIXED (my part) | `ui/settings.js` defaults (`renderDistance`, `quality: defaultQuality()`) and the mob caps in `game/mobs/index.js` now use `core/quality.js` `isMobile`. The portrait check in `ui.js` deliberately uses the same media query as the CSS overlay. `brush.js`'s small-screen cone is an aim heuristic, not a device test, so it stays. | `ui/settings.js`, `game/mobs/index.js` | unit and smoke suites |

### Duplication and dead code (C17–C25)
| ID | Status | What changed | Lines removed (≈) |
|---|---|---|---|
| C17 | FIXED, except audio | `StubBot` and the bot-import fallback deleted; Floor Fall uses `BotSquad` directly. The `edits.js` `readBox`/`writeBox` fallbacks and `greedyBoxes` deleted; `player_test`'s edit tests now run on the real `World`. The player's second fall-damage path and `physics.fallDamage` deleted, so survival's is the only one. The player's extra `brush.update` call and brush's `input.frame` guard dropped. `env.lightAt`'s string-key fallback deleted. **Not done:** the `audio.js` `blocks` fallback, because that file is in the engine lane's C13 work. | ~120 |
| C18 | FIXED | Deleted `engine.thumbnail`, `ctx.rng` + `createRng`/`seedToInt`/`hash3` (`core/rng.js` keeps `hashString` and `mulberry32`), `core/math` `lerp`/`invLerp`/`damp`/`lerp3`/`mod`/`TAU`, and `section.js` `CS`/`WORLD_H`/`SECTIONS_Y`/`SUB`/`cellIndex`/`getSubLocal`/`isAllSky`. `refinedCount` is kept because `world_test` uses it. Also deleted `subsToBlocks` (and its test), `ovenActive` and `MAX_ID`. `ARCHITECTURE.md`'s ctx line was updated. | ~75 |
| C19 | FIXED | `blocks.js` now exports `LIQUID` (true liquid), `WET` (liquid or waterlogged: swimming, "underwater", swimmers), `PLANT`, `CLIMB` and `REPLACEABLE`. Both old meanings were right for their own use: raycast and edit (whether kelp counts as "removed" and drops) need LIQUID, while physics and env need WET. They are now two named tables instead of six local copies. `raycast.js`, `edit.js`, `main.js`, `env.js`, `player.js` and `tools.js` use them. | ~15 |
| C20 | FIXED | One `segBox(o, d, len, box, pad)` in `core/math.js`, with no destructuring swap. Mobs (both loops) and projectiles use it. | ~22 |
| C21 | see above | | |
| C22 | FIXED | The station, journal and station-UI toasts import `toast` statically; there are no more dynamic `import()` calls per toast. `mg.hud.toast` goes through `dom.toast`. The separate `.mg-toast` element and its CSS are gone, so there is one toast stack. | ~12 |
| C23 | FIXED | `arena.js` `rng` keeps its string hash and calls `core/rng` `mulberry32`. The output is byte-identical (checked: the same 5 values for `rng('parkour-abc')` before and after), so Parkour and Treasure layouts and saved ghosts are unchanged. `world/noise.js` was not touched. The dead `core/rng` `hash3` and `seedToInt` are deleted, so nothing can import the wrong one. | ~8 |
| C24 | FIXED | The building helpers moved into `minigames/arena.js` and `bots/arena.js` was deleted. `ctf`, `hideseek` and `siege` import from `../arena.js`. | ~10 net |
| C25 | PARTIAL | The two identical suit-plating GLSL blocks in `avatar.js` are now one `PLATING_GLSL` function. **Not done:** the mob `bodyMaterial` uses different constants (0.47 vs 0.46, a different gradient, and a uniform rim colour), so sharing it would change how the mobs look. Moving the CSS-in-JS from `brushview.js` and `touch.js` into `css/hud.css` was also skipped: the brush HUD must be styled even when the UI lane's CSS isn't loaded (`noshell`, shots). It is an idiom split, not duplicated logic. | ~12 |

### QA harness
- `qa_smoke`'s break/place aim now rejects a break target whose cell, or any face neighbour, is liquid or waterlogged. That was the flake: breaking a shoreline cell floods it, which is by design.
- New check **"place into water"**. A hook builds a 3×3 pool, the place goes through `brush._doPlace`, and the check passes if the water cell becomes brick and exactly one brick was paid.

Not assigned to me and not done: C8–C10, C15, C16.

### Final runs (fixer)
| Suite | Result |
|---|---|
| `qa_unit` | 9/9 files pass, including `r3_test` 15/0 and `mg_floorfall_test` 6/0 |
| `r3_regress` | 9/0 |
| `r1_regress` | 22/0 |
| `qa_smoke --quick --port 9331` | PASS 40, FAIL 0, SKIP 2. "place into water" passes on mobile and desktop |
| `qa_minigames --games floorfall,siege --port 9331` | PASS 45, FAIL 0, WARN 0. Floor Fall rounds lasted 77 s and 81 s; Siege 163 s |
