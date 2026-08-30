# WATERLINE — build plan (phase 1)

Read this before touching anything. Contracts in §2 are frozen — changing a signature needs a
conversation, not a commit. Rules in §3 are decided; do not re-litigate them in code.

Prior art you are expected to have read: `../forge/CLAUDE.md`, `~/cc/yru/gms/3d/aaa_refs/naval/README.md`.
Comment style is FORGE's: only comment a formula, a Three.js quirk, or a unit you can't guess.

---

## 0. Read first — the reference plates are not clean

`refs/clean/` was triaged too fast. Verified by eye, 2026-08-05:

| Plate | Reality | Verdict |
|---|---|---|
| `1272010_01` `_02` `_04` `_06` | all four carry Destroyer's full HUD — left menu, bottom-left dials, bottom-right chat log, top bearing tape | **rect-crop or unusable** |
| `2853730_00` | full Skull&Bones HUD, minimap, damage numbers | **rect-crop** |
| `1286220_00` | "Sea Power v0.1.0.1.12884" version string + Tactical Display panel + bottom bar | **drop** |
| `1069660_14` | labelled "ship ablaze" — it is a top-down dockyard | **drop, mislabelled** |
| `1172620_08` | labelled "bright deck, sky bounce" — it is the green-lit Fort of the Damned at night | **keep, relabel** — night grade only |
| `2853730_09` `_10` | lightning waterspout / ghost ship. Fantasy VFX, not naval gunnery | **drop as an art target** |
| `552990_05` | the single best splash plate on the board, and it is in `contaminated/` | **rect-crop, promote** |

Consequence: `compare.mjs`'s `TRIM` (a bottom-fraction cut) is not enough. It needs a full
rectangle crop table. That is component **W0**'s first job and it blocks every round-1 comparison.

The curated table lives in `tools/plates.json` (already written — see §5). Every shot in §4 names
a plate from it and nothing else.

---

## 1. Architecture and file map

No build step. ES modules + importmap. `three@0.160.0` from jsdelivr — the **same pin FORGE uses**,
not the repo-wide r128 note.

```
gms/3d/waterline/
  index.html                importmap, #stage, HUD containers, boot card
  style.css
  js/main.js                boot + wiring. FROZEN after W0 — components do not edit it
  js/config.js              every tunable constant: fleet tables, ordnance sizes, cine timings, vfx scale
  js/scenarios.js           defineScenario/getScenario/allScenarios/frameCamera — the critic's contract

  js/engine/app.js          renderer, loop, resize, window.__waterline    (port of FORGE)
  js/engine/stats.js        perf HUD, BUDGETS                              (port, budgets retuned §6)
  js/engine/quality.js      presets + knob registry                        (port, presets retuned §6)
  js/engine/budget.js       texture memory accounting                      (port verbatim)
  js/engine/post.js         optional composer                              (port verbatim)
  js/engine/aa.js           AA modes                                       (port verbatim)

  js/sim/state.js           Game/Player/Ship shapes, serialize/deserialize
  js/sim/rules.js           footprint, snapTarget, fire, legal, win detection — the rulebook
  js/sim/placement.js       random legal placement + the row-pack existence proof
  js/sim/ai.js              the five tiers
  js/sim/ladder.js          tournament rungs, progression, persistence shape
  js/sim/index.js           the public sim API (§2.1). Nothing else in js/sim/ is imported outside it

  js/world/materials/index.js   getMaterial(kit, surface) dispatch. FROZEN after W0
  js/world/materials/hull.js    hull / deck / turret / rust
  js/world/materials/bridge.js  panel / glass / trim / seat / floor
  js/world/materials/table.js   tableGlass / bezel / pegLit / gridLine
  js/world/textures/{noise,bake,surfaces}.js   ports of FORGE's procedural texture kit

  js/world/ocean.js         sea surface: LOD rings, shader graft, sea state
  js/world/sky.js           sky dome, sun, horizon haze, PMREM env
  js/world/lighting.js      exterior sun/ambient/fog + time of day.  C1 ONLY
  js/world/bridgeLights.js  interior lamps + emissive budget.        C2 ONLY
  js/world/bridge.js        the room: consoles, glass, crew silhouettes, window frame
  js/world/table.js         the planning table: grid, pegs, ghost footprint, cell⇄world
  js/world/ship.js          3 hull kits, gun anchors, damage state
  js/world/shell.js         the round in flight: mesh, trail, arc solver

  js/world/vfx/index.js     the vfx façade + update pump. FROZEN after W0
  js/world/vfx/pool.js      billboard / sprite / light pooling. FROZEN after W0
  js/world/vfx/gun.js       muzzle bloom, recoil shove, barrel smoke.    C3 ONLY
  js/world/vfx/impact.js    splash column, hit flash, debris.            C4 ONLY
  js/world/vfx/fire.js      persistent hull fire + water bounce light.   C4 ONLY

  js/cine/director.js       sequence player, pacing, skip, exposure curve
  js/cine/rig.js            camera verbs: at/look/dolly/hold/shake/cut
  js/cine/sequences.js      the eight named sequences
  js/cine/caption.js        the disclaimer line

  js/ui/hud.js              turn banner, ordnance selector, fire button
  js/ui/setup.js            mode / grid / fleet builder screens
  js/ui/ladder.js           tournament screen
  js/ui/overlay.js          pause, settings, result
  js/net/multiplayer.js     dormant. Exports isAvailable() → false off games.br8t.com
  js/save.js                localStorage: ladder progress, settings

  sim.mjs                   node soak harness (prismbreak pattern)
  tools/shot.mjs            headless CDP render → PNG + perf JSON
  tools/compare.mjs         blind side-by-side sheet
  tools/plates.json         curated plate set + crop rects + shot→plate map
  tools/purity.mjs          fails if js/sim/ touches three / window / document
```

**Directory rule carried from FORGE:** if you find yourself writing `if (mode === 'classic')`
outside `config.js`, stop and put the difference in `config.js` instead.

---

## 2. Shared contracts

Frozen. Additive changes (a new surface name, a new event type) are fine. Renames and signature
changes are not.

### 2.1 Sim — `js/sim/index.js`

**Pure. Zero Three.js. No `window`, no `document`, no `performance`, no `Math.random`.**
Enforced by `tools/purity.mjs`, which runs in the soak harness. Randomness comes from a seeded
generator held on the game object.

```js
newGame({ w, h, fleet, seed, ordnance, tiers })   → Game
placeFleet(game, side, placements)                → Event[]   // placements null ⇒ random legal
footprint(game, shot)                             → Cell[]    // shot = {kind, r, c}
snapTarget(game, shot)                            → Cell      // clamps anchor into the legal lattice
legal(game, side, shot)                           → true | 'reason string'
fire(game, side, shot)                            → Event[]   // atomic. resolves, scores, advances turn
aiMove(game, side)                                → shot      // pure; never mutates game
view(game, side)                                  → View      // fog-of-war projection for that side
serialize(game) / deserialize(str)                → str / Game
```

- `kind` ∈ `'shell' | 'heavy' | 'salvo'` (1 / 4 / 9 cells).
- `Cell` = `{ r, c }`, row-major, `r` ∈ [0,h), `c` ∈ [0,w).
- `side` ∈ `0 | 1`. 0 is always the human in single player.
- `View` = `{ w, h, grid: Uint8Array, fleet: ShipView[], ordnance: {heavy, salvo}, turn, phase }`.
  `grid` values: `0` unknown, `1` miss, `2` hit, `3` sunk. Own-side view also exposes ship cells.

**Events** — the only thing the renderer is allowed to consume. Ordered, plain objects, no
functions, structured-clone safe.

```js
{ t:'place',  side, ships:[{id,len,r,c,dir}] }             // dir: 'h'|'v'
{ t:'shot',   by, at, kind, anchor:{r,c}, cells:[{r,c}] }
{ t:'result', by, at, r, c, hit:Boolean, shipId }          // shipId null on a miss
{ t:'sunk',   by, at, shipId, len, cells:[{r,c}] }
{ t:'turn',   side }
{ t:'over',   winner, turns }
```

`by` = firing side, `at` = the side whose grid was hit. Never overload one `side` field for both.

The sim resolves a whole shot in one call and returns the finished list. **The presenter plays the
list back over time. No sim state may ever depend on animation progress.** This is what lets a
40-turn game be fast-forwarded, skipped, or replayed headlessly at zero cost.

### 2.2 Scene builders — `js/world/*`

Every builder returns an object whose `object3D` origin sits at the **waterline (y=0), centred**.
Ship local +X is bow, +Y is up, +Z is starboard.

```js
buildOcean(quality)          → { object3D, update(dt), setSeaState(0..3), heightAt(x, z), material }
buildSky(quality)            → { object3D, setTime(hours), sunDir /*Vector3*/, env /*Texture*/ }
buildBridge(quality)         → { object3D, tableAnchor, windowAnchor, seatAnchors:[], glassPlane }
buildTable(w, h)             → { object3D, size:{x,z},
                                 cellToLocal(r, c)  → Vector3,
                                 localToCell(v3)    → {r,c} | null,
                                 pegWorld(r, c)     → Vector3,
                                 setState(view),                  // paints the whole grid from a View
                                 showGhost(cells | null),
                                 pulse(r, c, kind) }
buildShip(kitId, quality)    → { object3D, length, gunAnchors:[], deckAnchor,
                                 hullPoint(t /*0..1 bow→stern*/) → Vector3,
                                 setDamage(0..1), listAngle(rad) }
```

`kitId` ∈ `'destroyer' | 'cruiser' | 'battleship'`. Ship length 1–2 → destroyer, 3–4 → cruiser,
5+ → battleship, scaled along X. Three kits, not five silhouettes — decided.

Materials:

```js
getMaterial(kit, surface)    // kit: 'hull'|'bridge'|'table'
                             // hull:   'plate' 'deck' 'turret' 'rail' 'rust' 'boot'
                             // bridge: 'panel' 'glass' 'trim' 'seat' 'floor' 'screen'
                             // table:  'glass' 'bezel' 'peg' 'pegHit' 'pegMiss' 'gridline'
```

Additive only. A component fills in entries in **its own** `materials/<kit>.js`; nobody edits
`materials/index.js` after W0.

### 2.3 Camera / sequences — `js/cine/`

```js
director.registerSequence(id, gen)      // gen(rig, ctx) — a generator function
director.play(id, ctx)                  → Promise<void>
director.skip()                         // run the current generator to completion, apply final state
director.setPace('full' | 'short' | 'instant')
director.seek(id, t /*0..1*/)           // deterministic pose, nothing animating. Harness uses this.

rig.at(v3)                    rig.look(v3)
rig.cut(pos, look)            rig.dolly(fromPos, toPos, ms, ease)
rig.orbit(centre, radius, fromDeg, toDeg, ms)
rig.hold(ms)                  rig.shake(amp, ms)
rig.exposure(from, to, ms)    // drives renderer.toneMappingExposure — see §7.1
rig.fov(deg, ms)
```

A sequence is a generator that yields `{ until: ms }` beats. `skip()` drains it synchronously,
which is why no beat may have a side effect that only fires halfway through a tween.

Eight named sequences, ids frozen:
`open_flyover`, `bridge_settle`, `fire_out`, `shell_chase`, `impact_miss`, `impact_hit`,
`enemy_volley`, `bridge_return`.

### 2.4 VFX — `js/world/vfx/index.js`

```js
vfx.muzzle(anchor /*Object3D*/, size)      → handle
vfx.tracer(from /*V3*/, to /*V3*/, ms, size) → { object3D, at(t /*0..1*/) → Vector3 }
vfx.splash(pos, size)                      → handle
vfx.hit(pos, size)                         → handle
vfx.fire(host /*Object3D*/, localPos, seconds) → handle
vfx.smoke(pos, drift /*V3*/, size)         → handle
vfx.update(dt)
vfx.clear()
vfx.alive()                                → int
```

`size` ∈ `1 | 4 | 9`, mapped to scale/intensity/lifetime through `config.js` — never a literal in
a vfx module. **Everything is pooled. A beat must not allocate.** `vfx.alive()` is asserted against
the quality preset's particle cap in the perf harness.

---

## 3. Rules — decided

### 3.1 Board and fleet

| Knob | Value |
|---|---|
| Grid | `w`, `h` each ∈ [6, 16]. Rectangular allowed, aspect capped at 2:1 |
| Ship length | 1 … `min(w, h)` |
| Ship count | ≤ 12 |
| Occupancy cap | total ship cells ≤ 35% of `w×h` |
| Adjacency | ships **may** touch. No no-touch variant in phase 1 |
| Classic | 10×10, lengths [5,4,3,3,2] — 17% occupancy |

**Legality of a fleet is a constructive proof, not a heuristic.** A fleet is legal for a grid iff
`packRows(lengths, w, h)` succeeds: first-fit-decreasing of ship lengths into `h` bins of capacity
`w`, ships laid horizontally, allowed to touch end to end. The packing *is* a legal placement, so
if it succeeds a legal random placement provably exists. The occupancy cap and the count cap are
separate and exist for playability (search time, match length, deck model count) — not legality.

**Random placement never fails.** Rejection sampling, 400 tries per ship, longest first. On
exhaustion, fall back to the `packRows` solution, then randomise it: shuffle row assignment,
apply a random 90° rotation (only when `w === h`) and a random horizontal/vertical reflection.

### 3.2 Ordnance and footprints

| Kind | Size | Anchor the tap resolves to | Footprint |
|---|---|---|---|
| `shell` | 1 | cell `(r,c)` | `{(r,c)}` |
| `heavy` | 4 | **lattice point** `(r,c)`, `r ∈ [0,h-2]`, `c ∈ [0,w-2]` | `(r,c) (r,c+1) (r+1,c) (r+1,c+1)` |
| `salvo` | 9 | **centre cell** `(r,c)`, `r ∈ [1,h-2]`, `c ∈ [1,w-2]` | the 3×3 around it |

**Footprints are never clipped at the edges.** The anchor domain is restricted instead, and
`snapTarget()` clamps a tap to the nearest legal anchor. A player who taps a corner with `salvo`
armed gets a full 9 cells, pulled one cell inward. Reason: a clipped footprint reads as a bug, and
it makes the AI's density model asymmetric at the edges for nothing in return.

**Table affordance.** With `heavy` armed the table draws the interior lattice as small dots at cell
corners and the tap snaps to the nearest dot — you are visibly picking a corner, not a cell. With
`salvo` armed the table draws a 3×3 reticle. Both modes light the ghost footprint amber.

**Commit is two-stage.** Tap 1 arms the ghost (amber cells + a floating "4 CELLS" count, already
resolved cells inside the ghost drawn dimmed so an overlap is an informed choice). Tap 2 on the same
footprint fires. Tap elsewhere moves the ghost. The HUD FIRE button also commits. Desktop hover
shows the ghost without arming.

**Ordnance is limited, not free.** Otherwise every match is twelve `salvo` turns.

| | Charges at start | Recharge |
|---|---|---|
| `heavy` | `ceil(shipCells / 6)` | +1 every 8 of your turns, capped at start value |
| `salvo` | `ceil(shipCells / 12)` | none |

Classic 10×10 ⇒ 3 heavy, 2 salvo. Firing any kind ends the turn.

### 3.3 State machine

```
SETUP ─▶ PLACING ─▶ ┌─▶ AIM(side) ─▶ RESOLVE(side) ─┐ ─▶ OVER
                    └───────────────────────────────┘
```

The sim owns exactly these five phases. `RESOLVE` is atomic — it returns the whole event list and
lands in `AIM` for the other side, or `OVER`. Cinematic states (`FIRE_OUT`, `CHASE`, `IMPACT`,
`RETURN`) live **only** in the director and are driven off the event list. The sim is never told a
camera exists.

- A hit does **not** grant a bonus turn. Classic rule; also keeps the cinematic cadence even.
- Firing at an already-resolved cell is legal and wasted. The AI never does it.
- `sunk` fires the moment a ship's last cell is hit. `over` when a side has no unsunk ships.
- Turn counter increments on every `RESOLVE`, both sides — pacing tiers in §7.4 key off it.

### 3.4 AI tiers

No tier ever sees the opponent's board. `aiMove` is given a `View`, nothing else.

| Tier | Name | Behaviour |
|---|---|---|
| 0 | Lookout | uniform random over unresolved cells |
| 1 | Gunner | hunt/target with parity: hunt on the lattice `(r+c) % L === k` where `L` = smallest surviving ship length; on a hit, queue the four orthogonal neighbours; after two collinear hits, extend that line only |
| 2 | Fire Control | probability density: for every surviving ship length, count legal placements through every cell, shoot the argmax; while a hit run is open, restrict to placements covering it |
| 3 | Admiralty | tier 2, plus ordnance — fires `heavy`/`salvo` at the highest summed-density 2×2 / 3×3 block while charges remain, and avoids the outer ring on turns 1–3 |
| 4 | Ghost | tier 3 with 1.5× ordnance charges and density recomputed against the exact surviving fleet each turn |

Soak gate: over 2,000 games per pairing, win rate must be monotone up the ladder and tier 4 must
beat tier 0 at ≥ 92%. Tier 2 vs tier 1 ≥ 65%. If it isn't monotone the tiers are wrong, not the test.

### 3.5 Tournament ladder

Eight rungs, a **ladder not a bracket**: win climbs one rung, loss drops one (never back to zero),
rung 8 win = campaign complete. Progress in `localStorage` under `waterline.ladder`.

| Rung | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| AI tier | 0 | 0 | 1 | 1 | 2 | 2 | 3 | 4 |
| Grid | 8×8 | 8×8 | 8×8 | 10×10 | 10×10 | 10×10 | 12×12 | 12×12 |
| Fleet | 4,3,3,2 | 4,3,3,2 | 5,4,3,3,2 | 5,4,3,3,2 | 5,4,3,3,2 | 5,4,4,3,3,2 | 6,5,4,3,3,2 | 6,5,4,4,3,3,2 |

Opponents are named ships, not faces. No character models.

---

## 4. Phase 1 work breakdown

Eight components. Up to four coders at once. Each is 2–4 hours of agent work and each visual one
carries at least one named shot with a specific plate.

### W0 — Scaffold (blocking, one coder, ~1.5 h, no visual score)

Owns: `index.html`, `style.css`, `js/main.js`, `js/config.js`, `js/scenarios.js`, all of
`js/engine/*`, `js/world/materials/index.js`, `js/world/vfx/{index,pool}.js`, `js/sim/index.js`
(signatures + throw-stubs), `tools/*`.

Deliverables:
- FORGE's engine ported and booting to a grey scene at 60 fps with the perf HUD live.
- `window.__waterline` complete per §5, `ready` flipping true.
- `main.js` constructs **every** system from §1, all with stub implementations. Frozen afterwards.
- `materials/index.js` returns a grey PBR for every `(kit, surface)` pair in §2.2.
- `vfx/index.js` + `pool.js` real, with `gun.js` / `impact.js` / `fire.js` registering into them.
- `tools/plates.json` verified against the actual files; `compare.mjs` rect-cropping.
- `tools/purity.mjs` and `sim.mjs` runnable and passing on the stubs.

Nothing else starts until W0 lands. This is the whole anti-merge-conflict strategy: every shared
file exists, is complete, and is frozen before four coders open their editors.

### Wave A — four in parallel

| # | Component | Owns | Contracts | Shots → plate |
|---|---|---|---|---|
| **C1** | Ocean, sky, exterior light | `world/ocean.js` `world/sky.js` `world/lighting.js` | `buildOcean` `buildSky` | `sea_dusk` → `1172620_05` · `sea_night` → `1272010_01`(crop) · `sea_noon` → `2853730_01` |
| **C2** | Bridge interior + planning table | `world/bridge.js` `world/table.js` `world/bridgeLights.js` `materials/bridge.js` `materials/table.js` | `buildBridge` `buildTable` | `bridge_table` → `1489630_00` · `bridge_night` → `1489630_15` · `bridge_lamp` → `494840_09` |
| **C3** | Ship kit + gunfire | `world/ship.js` `materials/hull.js` `vfx/gun.js` | `buildShip` `vfx.muzzle/smoke` | `guns_fire` → `1172620_12` · `guns_broadside` → `1172620_07` · `fleet_wide` → `2853730_01` |
| **C5** | Sim + AI + ladder | all of `js/sim/` , `sim.mjs` | §2.1 in full | none — gated on the soak harness (§4.4) |

### Wave B — four in parallel, after Wave A

| # | Component | Owns | Contracts | Shots → plate |
|---|---|---|---|---|
| **C4** | Impact VFX | `vfx/impact.js` `vfx/fire.js` | `vfx.splash/hit/fire` | `splash_miss` → `552990_05`(crop) · `hit_explode` → `1272010_06`(crop) · `night_burn` → `1272010_01`(crop) |
| **C6** | Director, sequences, shell | all of `js/cine/`, `world/shell.js` | §2.3, `vfx.tracer` | `shell_flight` → `1172620_05` · `window_out` → **pair**, see below · `match_cut` → **no plate**, see below |
| **C7** | UI, flow, dormant multiplayer | all of `js/ui/`, `js/net/`, `js/save.js` | `__waterline.ui.*` | none — legibility checklist, and must be absent from every scored shot |
| **C1b/C2b/C3b** | rework rounds 2–3 for whichever Wave A component missed | as above | as above | as above |

### Wave C — integration (serial, one coder)

Wire the director to real sim events, the table to real `View`s, pacing tiers, hold-to-fast-forward,
portrait rig, then a single perf pass against §6. Only now does anyone touch `quality.js`'s presets.

### 4.1 Conflicts — must be serialised

| Conflict | Rule |
|---|---|
| `js/main.js` | written once in W0, **frozen**. A component needing new wiring asks; it does not edit |
| `js/engine/quality.js` PRESETS | W0 sets all keys with placeholder values. Only Wave C retunes them. Components add knobs via `quality.register()` from their own module — never by editing this file |
| `js/world/materials/index.js` | frozen after W0. Components fill `materials/<kit>.js` only |
| `js/world/vfx/{index,pool}.js` | frozen after W0. C3 owns `gun.js`, C4 owns `impact.js` + `fire.js`. They never meet |
| `lighting.js` vs bridge lights | C1 owns `lighting.js` (exterior only). C2 uses `bridgeLights.js`. C2 must not import or edit `lighting.js` |
| `index.html` | W0 places every container div. C7 only writes *inside* them from JS |
| `js/scenarios.js` | append-only via `defineScenario` from each component's own module. Nobody edits the registry file |

C6 reads from C1/C2/C3 and must not land before all three have passed at least round 1 — its shots
are framed *through* their work and would score their bugs.

### 4.2 Integration order

`W0 → {C1, C2, C3, C5} → {C4, C6, C7} → Wave C`

### 4.3 The two shots with no clean single plate

**`window_out`** — the interior-to-exterior transition. Scored as a **pair**: `window_out@0.0`
against `1489630_00` and `window_out@1.0` against `1172620_05`, each on its own sheet, each on the
standard 2.0-point gate. Plus a *measured* (not critiqued) continuity check: mean frame luma across
`t = 0, 0.25, 0.5, 0.75, 1.0` must be monotone and the 0→1 ratio must land in [3.0, 6.0].

**`match_cut`** — peg becomes shell. No shipped game does it, so there is no plate and the 2.0-point
gate does not apply. It is scored on the rubric alone with the gate **median ≥ 7.0, no criterion
under 5**, on a 6-frame motion sheet (`--at=0,0.2,0.4,0.6,0.8,1.0` tiled 3×2). It also carries one
hard assertion, which is what actually makes the trick work: the peg's projected screen position on
the last interior frame and the shell's on the first exterior frame must be within **4% of frame
width**. That number is checked by the harness, not by a critic.

### 4.4 C5's gate (no plates, so it gets a harder one)

```
node tools/purity.mjs                 # zero three / window / document under js/sim
node sim.mjs 5000                     # 5000 games, invariants after every shot
```

Invariants: no cell resolves twice to a different value; `sunk` fires exactly once per ship;
ship cell count is conserved; `over` fires exactly once and the winner has ≥ 1 unsunk ship;
`view(game, side)` never leaks an unhit enemy ship cell; every `fire()` returns ≥ 1 `result`;
`deserialize(serialize(g))` is deep-equal to `g`; a fixed seed replays identically.

---

## 5. Test harness

Near-drop-in from FORGE. Exact changes:

### `tools/shot.mjs`

| Change | Detail |
|---|---|
| Hook name | `window.__forge` → `window.__waterline`, 4 call sites (`waitFor`, `settle`, `stats`, `listScenarios`) |
| Profile dir | `/tmp/forge-cdp-${pid}` → `/tmp/waterline-cdp-${pid}`, 3 sites incl. the `pkill -f` cleanup |
| Default shot | `wall_day` → `bridge_table` |
| **New** `--at=` | comma list of `t` values 0..1. For each, calls `__waterline.seek(shot, t)`, settles 4 frames, writes `<shot>@<t>.png`. This is how sequence shots are captured without a timing race |
| **New** `--seed=` | passed through to `?seed=`, so the sim is deterministic across rounds |
| **New** `--turn=` | passed through to `?turn=` — drives `__waterline.sim.autoplay(n)` before capture, so a turn-30 board can be shot |
| Keep | `--mobile`, `--perf`, `--headed`, `--preset`, `--dpr`, `--all`, `--pre`, `--eval`, the leaked-Chrome cleanup, the shadow-pass split in the readout |

### `tools/compare.mjs`

| Change | Detail |
|---|---|
| `REFS` | → `resolve(ROOT, '../../../../gms/3d/aaa_refs/naval/refs/clean')`. From `site/gms/3d/waterline` that is `yru/gms/3d/aaa_refs/naval/refs/clean` — correct, verified |
| **Rect crop** | replace the `TRIM` bottom-fraction hack with `tools/plates.json`. Each plate may carry `crop: [x, y, w, h]` as fractions of the source, and `both: true\|false` |
| Crop semantics | `both: true` ⇒ a UI trim, applied to **both** images (FORGE's old behaviour). `both: false` (the default for the HUD-bordered plates) ⇒ a **reframe**, applied to the plate only, and the scenario's camera is authored to match that framing. Get this wrong and the crop becomes the next tell |
| Sheet size | keep `900×506` per side, keep the `0x151719` gutter |
| `.keys/` | unchanged — answer key stays outside the critic's reading path |
| **New** `--sheet=motion` | tiles `<shot>@*.png` 3×2 for the `match_cut` and `window_out` rounds |

### `tools/plates.json`

Written in W0. Shape:

```json
{
  "plates": {
    "1489630_00": { "use": "bridge, holo-table, emissive treatment", "crop": null },
    "1272010_06": { "use": "hit + fire + orange water", "crop": [0.16, 0.12, 0.46, 0.72], "both": false },
    "552990_05":  { "use": "splash columns", "from": "contaminated",
                    "crop": [0.04, 0.46, 0.42, 0.28], "both": false }
  },
  "shots": { "bridge_table": "1489630_00", "hit_explode": "1272010_06", "splash_miss": "552990_05" },
  "dropped": { "1286220_00": "version string + tactical panel",
               "1069660_14": "mislabelled — dockyard top-down, not a burning ship" }
}
```

`compare.mjs` reads `shots` first, falls back to the scenario's `ref`, then to `--ref=`.

### `window.__waterline`

```js
window.__waterline = {
  ready: false,
  app, three,
  frames(), stats(), texBreakdown(),
  quality, setPreset(name), setDprCap(n),

  scenarios: [{ id, label, ref, time, pace }],
  setScenario(id),
  seek(sequenceId, t),            // deterministic pose at t∈[0,1]; nothing animating
  pace(mode),                     // 'full' | 'short' | 'instant'

  sim: {
    game(), view(side),
    newGame(opts), place(side, list), fire(side, shot), ai(side),
    autoplay(turns, { seed, tiers }),   // headless, no cinematics, no rAF dependency
    events(),                            // full ordered log since newGame
    setBoard(side, ships)                // force an exact layout — needed to frame a hit shot
  },

  ui: { screen(), go(name), tap(r, c), arm(kind), confirm() },
  vfx: { alive(), clear() },
};
```

`sim.setBoard` and `sim.autoplay` are what let a coder frame `hit_explode` on the *same* cell every
round. Without them, "same camera, same time of day every round" is not achievable and score
movement stops being the art alone.

`tools/purity.mjs`: walks `js/sim/**`, fails on `from 'three'`, `window.`, `document.`,
`performance.`, `Math.random`, or `Date.now`.

---

## 6. Mobile performance budget

Measured the same way FORGE measures: `--preset=medium --dpr=1 --w=844 --h=390 --mobile --headed --perf`.
Counts are **totals** (shadow pass + main pass), because that is what the GPU drew. `shot.mjs`
prints the main-pass split so a total blown by the shadow map is not mistaken for one blown by the
visible frame.

| Metric | Bridge shots | Sea / cine shots | Why |
|---|---|---|---|
| GPU p95 | **< 11 ms** | **< 11 ms** | FORGE's gate, unchanged |
| CPU p95 | **< 6 ms** | **< 5 ms** | sim cost ≈ 0; the budget is VFX bookkeeping, and it must not allocate |
| Draw calls | **< 120** | **< 90** | bridge consoles are instanced; at sea there are ≤ 4 ships |
| Triangles | **< 260k** | **< 300k** | ocean LOD rings are the bulk at sea |
| Texture MB | **< 45** | **< 45** | tighter than FORGE's 60 — we have no terrain or foliage atlas |
| Worst frame after boot | **< 50 ms** | **< 50 ms** | a hitch mid-cinematic is worse than a low average |
| `vfx.alive()` peak | — | **≤ preset cap** | asserted, not eyeballed |

Sub-budget, asserted separately with `--shot=sea_only`: **the ocean alone ≤ 3.0 ms GPU and ≤ 40k
triangles.** If it blows, drop `oceanSegs` before touching anything else.

Carry FORGE's warning verbatim: **do not trust the GPU ms readout across runs.** fps and the counts
(calls, triangles, texture MB) came back bit-identical across runs that reported 7.8 / 174 / 51 ms.
Attribute cost with counts. For a genuine timing comparison, measure both configurations inside one
page load, interleaved.

### Quality ladder

| Key | potato | low | medium | high | ultra |
|---|---|---|---|---|---|
| `renderScale` | 0.6 | 0.75 | 1.0 | 1.0 | 1.25 |
| `shadows` | off | hard | soft | soft | softhigh |
| `shadowMap` | 512 | 1024 | 1024 | 2048 | 4096 |
| `oceanSegs` (near patch, per side) | 48 | 64 | 96 | 128 | 192 |
| `oceanRings` (LOD skirts) | 2 | 2 | 3 | 3 | 4 |
| `bridgeLights` (point lights) | 2 | 3 | 5 | 7 | 9 |
| `vfxCap` (live particles) | 60 | 120 | 220 | 400 | 700 |
| `smokeCards` per muzzle | 2 | 3 | 5 | 8 | 12 |
| `texCap` | 512 | 512 | 1024 | 1024 | 2048 |
| `aniso` | 1 | 2 | 4 | 8 | 16 |

Default preset is picked off the user agent exactly as FORGE does: mobile or `innerWidth < 820` →
`medium`, else `high`.

---

## 7. Risks

### 7.1 The bridge-to-ocean exposure transition — highest risk, and it is a grading problem

The interior sits maybe 1/20th of the exterior luminance. With a fixed `toneMappingExposure` and
ACES, either the bridge is a black hole or the sea blows out. There is no free lunch.

**Decision: script the exposure. Do not auto-expose.** A luminance readback costs a GPU stall on
mobile and is the classic way this ends up looking like a bug. `rig.exposure(from, to, ms)` drives
`renderer.toneMappingExposure` on a curve authored into the sequence: 1.55 interior → 0.85 exterior
over 600 ms, with the curve **lagging the camera by 120 ms** so the eye reads it as adaptation
rather than as a fade.

Assertable gate, not an opinion: `--shot=window_out --at=0,0.25,0.5,0.75,1.0`, mean frame luma
monotone, 0→1 ratio in [3.0, 6.0].

Fallback if it still reads cheap after round 2: motivate the cut — put the window frame's dark
silhouette across the transition so the bright band arrives *behind* something — and shorten the
move to 400 ms. A fast wrong grade reads far better than a slow one.

### 7.2 Ocean cost on a phone

A full-screen water shader at dpr 1 is 1–2 ms of pure fill before any geometry, and a naive 256²
grid is 130k triangles on its own. Decided up front, not discovered later:

- **No SSR, no refraction, no planar reflection.** Sky env map plus one directional glint —
  exactly FORGE's `water.js` model, which already survives the mobile gate.
- **Radial LOD**, not a uniform grid: a 96×96 near patch plus 3 skirt rings, ≤ 40k triangles total.
- **The horizon is sky, not water.** Water ends at 900 m; a fog band hides the seam. Rendering
  water to the true horizon buys nothing at 390px tall and costs the whole budget.
- One 128² tiling ripple normal map, tracked through `budget.js` like everything else.
- Hard sub-budget in §6, measured alone.

The board's own warning applies: **do not let a critic score us against Skull and Bones on water
detail.** `plates.json` records what each plate is *for* — grade the splash shape, not the fluid.

### 7.3 The match cut has no prior art

The design, decided so C6 is not inventing it under time pressure:

1. On commit, the targeted peg's emissive ramps to white and stretches 8× on Y over 160 ms.
2. Camera pushes in until the peg fills ~30% of frame height.
3. A 90° whip-pan over 140 ms, with a radial-streak card standing in for motion blur.
4. Cut to the shell **already in flight**, at the same screen position, same apparent size, same
   emissive colour, still stretched — then it relaxes to its real proportions over 200 ms.

What makes it read is screen-space continuity, and that is measurable: peg screen position on the
last interior frame vs shell screen position on the first exterior frame, within 4% of frame width.
Harness assertion. If the assertion passes and the critic still hates it, the problem is the
timing, not the geometry — shorten the whip to 100 ms before touching anything else.

Scored on the rubric only (§4.3) because there is nothing honest to compare it to.

### 7.4 Cinematic fatigue by turn 40

This is the risk that kills the game, and "add a skip button" does not solve it — a player will not
find it, and a skip loses the result read.

**Decided: pacing auto-degrades, and the player can override upward.**
**Superseded by D49 — it does not auto-degrade at all.** The table below shipped, Aaron played a
long match on it, and the turn-13 tier read as the game breaking. There are two paces now and one
button. Kept here because the *risk* it names is real and the next person to feel it will reach for
this section.

| Turns | Pace | Runtime | Beats kept |
|---|---|---|---|
| 1–3 | `full` | ≈ 9 s | flyover out, guns, chase, impact, return |
| 4–12 | `short` | ≈ 4.5 s | guns (0.6 s), chase (1.8 s), impact, hard cut back |
| 13+ | `instant` | ≈ 1.4 s | impact only, camera never leaves the table, impact plays in a corner inset |

Plus: **hold anywhere = 4× fast-forward**, not skip. The result still lands, it just lands quickly.
Settings can pin `full` forever for the player who wants it.

And the caption: the brief wants a dramatisation disclaimer above the shell. Showing it 40 times is
half the fatigue on its own. **Decided: caption shows on turn 1, and on the first shot of each new
ordnance kind. Not otherwise.** It is a few words over the shell, not a sentence.

### 7.5 The reference plate set (§0)

Eight of twenty "clean" plates carry a HUD or a version string and two are mislabelled. Every blind
round run before this is fixed is unreliable — FORGE already learned this the expensive way in its
round 4, where the critic named a toolbar as its evidence on both sheets. W0 fixes it or nothing
downstream means anything.

### 7.6 Sim/renderer coupling drift

The pressure to reach into the scene from the sim ("just this once, to get the ship position") will
show up around C6. `tools/purity.mjs` runs in the soak harness and fails the build. Keep it that way.

### 7.7 Portrait

A bridge framed for 16:9 is unusable at 9:16 — the table falls off the bottom. **Decided:** portrait
gets a *different camera rig* (wider FOV, table filling the lower 55%, window as a band across the
top), registered as its own `*_portrait` scenarios, and it is **not blind-scored in phase 1**.
Landscape is the hero, per the brief. Portrait must be playable and must not look broken; it does
not have to hit the plate.

---

## Needs Aaron

1. **Plate re-fetch.** The splash and sunset-grade plates we most need are all World of Warships and
   all HUD-covered. I have crop rects that rescue `552990_05`, but a clean plate would be better —
   worth re-running `fetch.py` against a couple more appids (Sea Power's gunnery shots, HighFleet)?
2. **Disclaimer wording.** Is there a specific form of words you want for the dramatisation caption,
   or is "positions shown are dramatised" mine to write?
3. **Ladder progress storage.** localStorage only in phase 1, or should it go through the
   `/lib/auth/` br8t account layer from the start?
