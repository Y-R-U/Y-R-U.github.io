# Idle Life 2: technical architecture (P0-C)

Status: proposal for P1 (manager turns it into `docs/CONTRACT.md`). Written 2026-10-03.
Companion to `DESIGN_PROPOSAL.md` (P0-A), whose vocabulary this uses: **district** (Old Town … Orbit),
**line** (one business, ~20 total), **shelf/stock**, **σ throughput**, **manager**, **event**, **season**.

Prototype used for the measurements below: `/private/tmp/claude-501/idle-life2-proto/`
(`proto.html`, `proto.js`, `drive.mjs`, `ctx.mjs`, `ctx2.mjs`; serve with `node serve.mjs`, port 8931).

---

## 0. Decisions in one screen

| Question | Decision |
|---|---|
| Renderers / contexts | **Exactly one `WebGLRenderer`, one WebGL context, its canvas never in the DOM.** |
| How views reach the screen | **Blit presenter**: each view (hero + every line card) owns a DOM `<canvas>` with a 2D context. Per view: render into the offscreen canvas at (0,0,w,h), then `drawImage` the bottom-left w×h region into the view's 2D canvas. |
| Scenes | **One `THREE.Scene` per world** (main town; each seasonal side town is a second world, built lazily). Every line is a district plot *inside* that scene. Card cameras look at their plot; the hero camera roams the whole town. Shared actors are literally shared objects. |
| Cross-view isolation | Before a card render, toggle `plot.group.visible` so only that plot (plus shared backdrop) draws. O(20) boolean writes, no culling cost, no bleed. |
| Frame budget | Scheduler: hero every frame (tier-dependent cap), **at most K card renders per frame** (round-robin, priority-ordered), visible-but-unfocused cards 15–30 fps, off-screen cards 0 fps. |
| Quality | Three tiers + auto governor: DPR cap 1 / 1.5 / 2, MSAA off / off / on, card fps 15 / 20 / 30, K 1 / 2 / 3. No realtime shadow maps; blob shadows + vertex-colour AO. |
| Black-screen defence | Blit canvases keep the last good frame through context loss; restore path + **recreate-renderer fallback** (verified); force-repaint on every resume; 2D-canvas loss handled; boot-error guard inline in HTML. |
| Economy | Pure ES modules under `js/state/`, no DOM/THREE, deterministic (injected `now`, `rng`), `node --test`-able. Sim time is the economy's own clock. |
| Save | `localStorage` JSON envelope with schema version + stepwise migrations + backup slot; **never overwrite a save that failed to load**. |

---

## 1. Rendering approach and why

### 1.1 Options considered

| Option | Shape | Verdict |
|---|---|---|
| A. N WebGL canvases | One renderer per card | Rejected. Browsers cap live contexts (~16 Chrome, fewer on iOS); oldest get force-lost → black cards. Geometry/programs duplicated per context. |
| B. Fixed overlay + scissor | One full-screen `position:fixed` canvas above the page; each frame set viewport/scissor to every card's `getBoundingClientRect()` | Cheapest GPU path, but **the canvas is repainted on the main thread while scrolling happens on the compositor thread**: during touch/momentum scroll the 3D lags the card frame by ≥1 frame (visible shear, worst on iOS). Needs per-frame rect reads of every card, manual clipping for rounded corners, and on context loss **the whole screen goes blank** at once. |
| C. Offscreen + blit (chosen) | One offscreen renderer; per-view 2D canvases inside the cards | Cards scroll natively with the DOM (zero drift, CSS rounding/clipping for free, sticky hero for free). Only *sizes* matter, never positions. Last frame survives context loss. Cost: one GPU→2D copy per rendered view. |
| C′. Hybrid | Renderer canvas *is* the hero; cards rendered first + blitted, hero rendered last into the same buffer | Saves the hero copy (~6% JS), but the hero goes blank on context loss (proved in prototype screenshot `b-lost.png`). Rejected: the hero is the screen Aaron looks at on return. |

The rival (Idle Transport 2) also uses C. We keep C but fix its weaknesses (§1.4).

### 1.2 Measurements (prototype, 2026-10-03)

Setup: 390×844 mobile emulation, hero 300 px sticky + 20 cards × 150 px, ~4 cards visible, each plot ≈ 15 draw calls,
12 vertex-shader-animated characters per plot, scripted scroll for 300 frames. Headless Chrome via `~/.claude/bin/cdp`.

**Metal (real GPU, M5), CPU throttled 4×** — main-thread ms per frame (avg / p95); all held 60 fps:

| Config | JS avg | JS p95 | draw calls/frame |
|---|---|---|---|
| B overlay, AA | 1.41 | 2.0 | 79 |
| C blit, AA | 2.38 | 3.3 | 79 |
| C′ hybrid, AA | 2.24 | 3.0 | 79 |
| C blit, cards 30 fps (separate scene per line) | 2.19 | 3.6 | 47 |
| **C blit, cards 30 fps, one shared world scene + plot visibility toggle** | **1.22** | **2.0** | 70* |
| C blit, all cards every frame, shared world | 1.89 | 2.8 | 104* |

\*draw count includes the hero showing all 20 plots (the real hero frustum-culls most of them).

**SwiftShader (software GPU, used as a "weak phone GPU" proxy for relative fill/copy cost), DPR 1:**

| Config | fps | frame dt p95 |
|---|---|---|
| B overlay, AA | 51.4 | 16.8 |
| C blit, AA, all cards every frame | 31.0 | 50 |
| C blit, no AA | 38.7 | 50 |
| C blit, AA, cards 30 fps | 52.6 | 33 |
| **C blit, no AA, cards 20 fps** | **60.0** | **16.7** |
| C blit, no AA, cards 20 fps, 60 chars/plot | 59.2 | 16.7 |
| C blit, no AA, cards 30 fps, **DPR 2** | 5.9 | 400 |

Conclusions:
1. Blit costs real GPU (copies + MSAA resolves per copy) — **but the card throttle recovers all of it**; blit with a
   per-frame card budget matches overlay. AA is the second biggest lever (MSAA resolve per blit) → AA only on high tier.
2. DPR is the cliff (pixels scale with DPR²). Tiering DPR is mandatory; never render at device DPR 3.
3. One shared world scene is *cheaper* than one scene per line (fewer light/state/program switches): 1.22 vs 2.19 ms.
4. Characters animated in the vertex shader are ~free: 60 vs 12 per plot made no measurable difference.
5. Context loss, **restore path**: three r160 re-initialises itself on `webglcontextrestored` (shaders incl.
   `onBeforeCompile`, buffers re-upload). Blitted cards kept their last image throughout (`c-restored.png`).
6. Context loss, **no restore ever fires** (iOS does this): `renderer.dispose()` + `new WebGLRenderer()` against the
   *same* scene/geometry/material objects renders correctly and frames resume (`d-recreated.png`). This is the
   fallback the rival lacks.

What the prototype could **not** measure (must be checked on a real phone in P3): iOS Safari cost of
`drawImage(webglCanvas)` into a 2D canvas, and real compositor-scroll drift of option B. The presenter is therefore
behind an interface (`?presenter=overlay` escape hatch, §3.3) so a switch costs one module, not a rewrite.

### 1.3 The world model: "a delivery leaving a line appears in the main scene"

Single scene per world, laid out per DESIGN §4 as one continuous town. Each line owns a **plot** (≈ 24 m × 9 m,
1 unit = 1 m) placed along the district's street, with an **exit path** (local spline) that joins the **town road
graph**. Actors that leave a plot (vans, customers, couriers) are *the same instanced objects* in both views:

```
shipment.u ∈ [0, uExit)   → on plot exit path   (visible in that line's card)
shipment.u ∈ [uExit, 1]   → on town road to destination (house, docks, market) (visible in hero)
```

Positions are a pure function of `(shipment, simTime)`, so any camera that sees the actor sees it in the same place.
Card renders hide *other* plots but never hide the shared road layer near their own exit, so a van visibly drives
out of the card frame onto the road.

### 1.4 Rival (Idle Transport 2) teardown: weaknesses we must not copy

Read-only review of `gms/3d/idle-transport2/js/scenes.mjs`, `app.mjs`, `economy.mjs`, `index.html`.

| # | Rival behaviour | Problem | Our answer |
|---|---|---|---|
| 1 | A separate `THREE.Scene` per route (own island, sun, sky, 1024² shadow map each); hero just re-frames the focused route's scene | No shared town; nothing "leaves a line and appears in the main scene"; N× lights/shadow maps | One world scene, plots inside it, shared actors (§1.3) |
| 2 | `webglcontextrestored` is the only way back | If restore never fires, every view is frozen on its last snapshot forever | Restore timeout → recreate renderer (verified) + watchdog (§6) |
| 3 | Per-view 2D canvases created `{alpha:false}` | If Chrome evicts a 2D canvas backing store (2D `contextlost`), it comes back **opaque black** | 2D contexts `{alpha:true}` over a CSS poster gradient; listen for 2D `contextlost`/`contextrestored` → mark dirty |
| 4 | Every visible view renders at the same rate (30 fps on phones) | GPU load scales with visible-card count; spikes when 5 cards are on screen | Per-frame card budget K + priorities + per-view fps |
| 5 | `antialias:true` on the offscreen source | An MSAA resolve per blit; measured ~25% fps cost on the weak-GPU proxy | AA only on high tier |
| 6 | PCF soft shadows per scene | Fill + memory heavy on phones | No realtime shadow maps; blob shadows + baked vertex AO |
| 7 | No inline boot handler or watchdog in `index.html` | A stale/failed module hangs silently on a blank page | Inline classic boot guard + cache-busting reload (§6.4) |
| 8 | `normalize()` throws on `version!==1`; the catch starts a fresh game, and the next autosave **overwrites the unreadable save** | Silent permanent progress loss (e.g. a stale cached module meeting a newer save) | Migrations; failed load → quarantine raw + persistence read-only until resolved (§5) |
| 9 | `getBoundingClientRect()` of every row every frame | Wasted layout reads with 20 rows | IntersectionObserver for visibility, ResizeObserver for size; no per-frame rect reads |
| 10 | Each route's "stock" is a visual staged off journey progress | Pile isn't real (DESIGN §0.5 #3) | Shelf stock is economy state; pile count derives from it |

Things the rival does well and we keep: one renderer; offscreen + DOM 2D presentation; `preventDefault()` on
`webglcontextlost`; suspend/resume on `visibilitychange`/`pagehide`/`pageshow`/`freeze`/`resume`; offline capped by
real elapsed time since last save; `?v=` on every import; `window.<game>.debug` hooks for tests; `?dpr=` override.

---

## 2. File / module layout

```
gms/3d/idle-life2/
  index.html            shell, inline boot guard, importmap (three → ../../lib/three/0.160.0/three.module.js)
  style.css             all CSS (tokens at top; portrait-first, desktop ≥ 900 px two-column)
  favicon.svg
  js/
    main.js             composition root: boot sequence, frame loop, wiring (manager-owned)
    core/
      flags.js          URL flags (?seed ?dpr ?tier ?fast ?reset ?nosave ?debug ?presenter ?break)
      bus.js            tiny pub/sub used across UI/render (not by state/)
      lifecycle.js      the ONE owner of visibility/pagehide/pageshow/freeze/resume/focus → 'suspend'/'resume'
      version.js        export const BUILD = '20261003a' (bumped by tools/bump.mjs)
    data/               pure data, no logic, no imports except other data/*
      districts.js      DISTRICTS[]
      lines.js          LINES[]  (20 businesses, DESIGN §5.1 numbers)
      managers.js  items.js  events.js  housing.js  education.js  contracts.js  seasons.js
      palette.js        shared colour tokens + per-district palettes
      plots.js          world layout: plot origin/rotation per line, road graph, hub/home anchors
    state/              PURE: no DOM, no THREE, no Date.now/Math.random (injected) → node --test
      economy.js        formulas only (costs, bulk/max, income, milestones, offline maths)
      game.js           createGame(): state container, tick, act, quote, stats, events
      lines.js          per-line step: production → shelf → σ sales; pile tap
      events.js         random-event scheduler (seeded)
      managers.js       hire/level/equip/merge
      season.js         calendar windows + side-world state
      prestige.js       retire/heir/legacy
      shipments.js      visual actor model derived from economy events (§3.4)
      save.js           serialize/parse/migrate/backup, storage adapter
      offline.js        advanceOffline(state, seconds) closed form
      format.js         number formatting (shared by UI; pure, so testable)
    render/
      host.js           createRenderHost(): renderer, context loss, recreate, quality, scheduler, presenter
      presenter-blit.js default presenter (2D canvases per view)
      presenter-overlay.js  escape hatch (fixed canvas + scissor) — same interface
      quality.js        tiers + auto governor
      world.js          createWorld({kit, data, skin}) → scene, plots, road, hub, cameras
      cameras.js        hero director (tour/pin/highlight moments), card camera rigs
      actors.js         shipments/customers/vans driven from state/shipments.js
      fx.js             3D pops, coin bursts (pooled)
      kit/
        geo.js          shared base geometries (unit box, cyl8, cone6, ico0, plane)
        build.js        merge-builder: kit.box/cyl/cone/roof/tree/rock → one vertex-coloured mesh per plot
        materials.js    the ~5 shared materials (§7.2)
        crowd.js        the tiny character rig: InstancedMesh + vertex-shader limb animation
        vehicles.js     van/cart/boat/drone templates
        piles.js        instanced stock piles
      plots/            ONE FILE PER BUSINESS: lemonade.js, foodtruck.js, barber.js … asteroid.js
      season/           skin overrides per season (hollows-eve.js …)
    ui/
      app.js            builds the DOM: hud, hero overlay, list, sheets; owns qty selector
      hud.js            cash / income / tickets / age chip
      linecard.js       one card: glyph buttons, badge, bottom-border progress, ⓘ, 📌
      sheets.js         popups/bottom sheets (manager, ⓘ, map, settings, season) — never alert/confirm
      toast.js          toasts + floating text (DOM, pooled)
      map.js  manager.js  season.js  settings.js  life.js  events.js (HUD edge chips)
  tools/
    cdp.mjs             shared CDP client (cache disabled, metrics override, eval, screenshot)
    test-economy.mjs    node --test unit tests for js/state
    sim.mjs             pacing bot (hours of play in seconds)
    test-boot.mjs       boot, zero errors, own-origin only, ready flag, screenshots
    test-bootgate.mjs   falsification: blocked/stale module must show the boot error panel
    test-lifecycle.mjs  context loss / no-restore / freeze / hidden / bfcache + black-frame detector
    test-scroll.mjs     scroll perf budget
    test-layout.mjs     5 viewports, overflow, tap-target sizes
    shot.mjs            390×844 portrait + 1440×900 desktop captures → docs/shots/
    bump.mjs            rewrites ?v=BUILD across index.html + js/**
  tests/fixtures/       save-v1.json, save-corrupt.txt, save-future.json …
```

Import rule (enforced by a grep in `test-boot.mjs`): `state/` and `data/` import only `state/`/`data/`;
`render/` imports `three`, `data/`, `state/format.js`, `core/`; `ui/` imports `data/`, `state/format.js`, `core/`;
only `main.js` imports all three layers. Every relative import carries `?v=<BUILD>`.

---

## 3. Module API contracts

Builders implement against these signatures. The manager should commit **stubs** of every exported function
(returning plausible dummies) before P2 so all lanes run end-to-end from day one.

### 3.1 `js/state/game.js`

```js
export function createGame({ data, save = null, now, rng, nowWall }) → Game
// now(): sim seconds source is internal; nowWall(): Date.now injectable; rng(): [0,1)

Game = {
  state,                        // plain JSON-able object (see §5); UI/render READ ONLY
  tick(dt),                     // dt seconds, clamped to [0, 1]; advances sim time, lines, events, timers
  act(type, payload) → { ok, msg?, code?, delta? }   // the ONLY mutator
  quote(type, payload) → { cost, qty, affordable, after? }
  stats(lineId) → LineStats     // derived, cached per tick, reused object (do not hold across ticks)
  totals() → { incomePerSec, tapValue, offlineCapSec }
  on(type, fn) → unsubscribe    // events below
  advanceOffline(seconds) → OfflineReport
  serialize() → string
}
```

`act` types (payloads): `tap {x?,y?}`, `tapPile {lineId}`, `unlock {lineId}`, `level {lineId, qty:1|10|'max'}`,
`throughput {lineId}`, `storage {lineId}`, `boost {lineId, slot}`, `hire {lineId, managerId}`, `managerLevel {managerId}`,
`equip {itemId, target:{kind:'character'|'line'|'manager', id}}`, `unequip {itemId}`, `merge {itemId}`,
`claimEvent {eventId, score?}`, `permit {districtId}`, `housing {tier}`, `study {courseId}`, `claimContract {id}`,
`retire {heirId, heirloomItemId}`, `seasonEnter {seasonId}`, `seasonLeave`, `setting {key, value}`.
Unknown type → `{ok:false, code:'unknown'}`, never throws.

`LineStats = { owned, level, perSec, sigma, shelfCap, stock, stockRatio, cycle01, cycleSec, managed, managerId,
boostMult, nextMilestone, visualTier /*0|1|2*/, full }`.

Events (`on`): `tap`, `bought`, `unlocked`, `milestone`, `produced {lineId, units}`,
`dispatched {lineId, shipmentId, units, travelSec, dest}`, `sold {lineId, cash}`, `pileSold {lineId, cash}`,
`full {lineId}`, `event:spawn|claim|expire {event}`, `offline {report}`, `season {…}`, `retired`, `saveError {code}`.
Render and UI react to events; **neither ever writes `state`**.

### 3.2 `js/state/shipments.js` (shared actors, pure)

```js
export function createShipments(game, data) → {
  list,                         // Shipment[] (pooled objects, ≤ 64 live), sorted by tDepart
  update(simTime),              // drops arrived, spawns from 'dispatched' / steady-state for managed lines
  reseed(simTime),              // after offline/resume: rebuild a plausible in-flight set from rates (no history replay)
  place(shipment, simTime) → { stage:'plot'|'road'|'arrived', u }   // pure
}
Shipment = { id, lineId, units, kind:'van'|'walker'|'boat'|'drone', tDepart, tExit, tArrive, dest }
```

Render's `actors.js` maps `{stage,u}` to a world position via `data/plots.js` exit paths and road graph.

### 3.3 `js/render/host.js`

```js
export function createRenderHost({ lifecycle, flags, bus }) → Host
Host = {
  setWorld(world),                              // world from render/world.js; host owns no game logic
  addView(id, element, { kind:'hero'|'line', lineId?, priority? }),   // element = sized DOM box; host inserts its canvas
  removeView(id),
  setFocus(lineId|null),                        // focused card renders at full card fps
  markDirty(viewId|'*'),                        // force next-frame render (resize, data change while idle)
  setTier('auto'|'low'|'mid'|'high'),
  onFrame(fn(dt, now)),                         // world/actors update hook, called once per rendered frame
  project(viewId, vec3) → { x, y, visible },    // CSS px inside the view element (for DOM floating text)
  pick(viewId, clientX, clientY) → { kind:'pile'|'event'|'ground'|'actor', lineId?, id?, point } | null,
  debug                                          // §8.3
}
```

Presenter interface (both presenters implement it; host picks via `?presenter=`):
`attach(view)`, `detach(view)`, `begin(frameSizes)`, `present(view, renderer)`, `onLoss()`, `onRecreate(renderer)`.

### 3.4 `js/render/world.js` and plot modules

```js
export function createWorld({ kit, data, skin = null }) → World
World = {
  scene, roads, hub,
  plots: Map<lineId, Plot>,
  heroRig, cardRig(lineId) → { camera, fit(aspect) },
  prepare(view),               // toggles plot visibility, sets background/fog, updates that plot's instances once per sim step
  update(dt, game, shipments, visibleLineIds),   // only visible plots + hero-visible actors animate
  dispose()
}

// js/render/plots/<business>.js — the unit of parallel art work
export default function buildPlot(kit, { line, palette, skin, rng }) → {
  group,                      // local space, origin = plot centre, +x = street direction, exit at +x edge
  bounds: { w, d, h },
  camera: { pos:[x,y,z], look:[x,y,z], fov },    // local; card rig converts to world
  exit: [[x,z], …],           // local spline to the plot gate (joins road)
  pileAnchor: [x,y,z], tapTargets: [{id, pos, r}],
  update(dt, lineStats, time, tier)   // move workers, scale pile, swap visual tier
}
```

Plot builders may only use `kit.*` (no `new THREE.*Material`, no textures) so draw calls/programs stay bounded.

### 3.5 `js/ui/*`

```js
// ui/app.js
export function createUI({ game, host, bus, data }) → { mount(root), update(now), showOffline(report), toast(text, opts) }
```

UI builds `.line-card[data-line]` once per structure change and calls `host.addView('line:'+id, card.querySelector('.line-view'), {kind:'line', lineId:id})`.
UI text updates are throttled to 4 Hz and only touch `textContent` / CSS custom properties; the progress border is a
CSS `transform: scaleX(var(--p))` updated each frame for visible cards only. No `innerHTML` after initial build.

### 3.6 `js/core/lifecycle.js`

```js
export const lifecycle = { on('suspend'|'resume'|'pagehide'|'bfcache-restore', fn), hidden, simulate(kind, ms) }
// 'resume' fires once per away interval with { awaySec, reason } no matter how many of
// visibilitychange/pageshow/focus/resume fire. simulate() is for tests.
```

### 3.7 `js/main.js` (composition, manager-owned)

Boot order: flags → load save (state/save) → createGame → advanceOffline → createRenderHost → createWorld (hero plot
and visible plots first, rest built in idle slices) → createUI → first frame → `window.__il2Boot()` (clears boot guard).
Frame loop: `game.tick(min(dt, 1))` at most once per rAF (fixed-step accumulator 0.1 s inside game), shipments.update,
host renders, ui.update. Exposes `window.__il2 = { game, host, ui, lifecycle, ready:true }`.

---

## 4. Rendering details

### 4.1 Scheduler (per rAF)

1. If `lifecycle.hidden || host.lost` → return (rAF keeps running only while visible; browsers stop it anyway).
2. Gather the view set from IntersectionObserver state (no layout reads). Sizes come from ResizeObserver.
3. Offscreen renderer size = max(view w) × max(view h) at current DPR; set **only** when that changes.
4. Hero: render if `now - hero.last ≥ 1000/heroFps` (60 high, 30 mid/low).
5. Cards: build a due list among visible cards, ordered: **dirty** (never painted, resized, restored, scrolled in) →
   focused/pinned → oldest. Render at most **K** per frame. Focused card target = tier card fps; others = half that.
   Cards within one viewport below/above (IO rootMargin 100%) get one paint on entry so scrolling never reveals a blank.
6. For each view: `world.prepare(view)`, camera aspect, `renderer.setViewport/setScissor(0,0,w,h)`, `render`,
   then `ctx2d.drawImage(src, 0, src.height - H, W, H, 0, 0, W, H)` — skipped if `gl.isContextLost()`.
7. `renderer.info.autoReset = false`; reset once per frame to count totals for debug.

### 4.2 Quality tiers and governor

| | low | mid | high |
|---|---|---|---|
| DPR cap | 1 | 1.5 | 2 |
| MSAA | off | off | on |
| hero fps | 30 | 30 | 60 |
| card fps (focused / others) | 15 / 8 | 20 / 10 | 30 / 15 |
| K cards per frame | 1 | 2 | 3 |
| plot detail | tier-0 props only | full | full + ambient extras (birds, steam) |

Start tier: `high` if desktop pointer:fine & DPR ≤ 2, else `mid`. Governor: rolling 2 s mean of rAF dt; > 20 ms →
step down (DPR first, then fps, then tier); < 14 ms for 10 s → step up one notch, max once per 30 s.
Changing MSAA needs a new context, so MSAA changes apply **only through the recreate path** (same code as context-loss
fallback, exercised regularly — good). Settings expose Auto / Battery saver / High.

### 4.3 Canvas memory

2D backing stores: views outside IO margin release theirs (`width = height = 0`) and show the CSS poster
(district gradient + line emoji). Cap 10 live 2D canvases. At mid tier a card is ≈ 585×225 px → ~0.5 MB each.

---

## 5. Save format, versioning, offline

### 5.1 Envelope

```json
{ "game": "il2", "v": 1, "build": "20261003a", "savedAt": 1791000000000,
  "simTime": 12345.6, "seed": 918273,
  "s": { "cash": 0, "tickets": 0, "legacy": 0, "lifetime": 0, "age": 18, "gen": 1,
         "lines": { "lemonade": { "lv": 0, "thr": 0, "sto": 0, "boost": [0,0], "stock": 0, "mgr": null } },
         "districts": ["oldtown"], "managers": {}, "items": [], "equip": {},
         "housing": 0, "study": null, "learned": [], "contracts": {}, "events": { "next": 120 },
         "seasons": { "hollows-eve-2026": { "rank": 0, "tokens": 0, "lines": {} } },
         "family": [], "settings": { "tier": "auto", "sound": true, "reducedMotion": false },
         "stats": { "taps": 0, "plays": 1 }, "hints": {} } }
```

Keys: `il2.save` (current), `il2.save.bak` (previous good, rotated at most every 5 min), `il2.quarantine.<ts>`.
Fields are short but readable; numbers are plain doubles (enough to 1e308; DESIGN tops out ~1e20 pre-prestige).

### 5.2 Rules

- `save.parse(text)` → `{ok, state, migratedFrom?}` or `{ok:false, reason:'corrupt'|'future'|'foreign'}`.
- `MIGRATIONS = { 1: s => …v2, 2: s => …v3 }` applied stepwise; each has a fixture test.
- **Load failure never leads to overwrite.** Corrupt → copy raw to `il2.quarantine.<ts>`, try `.bak`; if that also
  fails, start fresh *with persistence armed only after the player acts* and show a non-blocking chip
  ("Old save couldn't be read — kept a copy"). `future` (v > CURRENT, i.e. stale cached code) → persistence
  **disabled**, chip offers the cache-busting reload. Never write while `persistence !== 'ok'`.
- Write triggers: every 10 s if dirty; 1 s debounce after a purchase/unlock/prestige; synchronously on
  `suspend`/`pagehide`/`freeze`. Quota errors → `saveError` event → chip + Export button in Settings.
- Export/import: base64 of the envelope JSON in Settings (text field + copy), import goes through `parse`.
- Optional later: `/lib/auth/cloud.js` slot `idle-life2` (lazy import only after sign-in; never on the boot path).

### 5.3 Offline earnings

- Gap = `clamp((nowWall - savedAt)/1000, 0, offlineCapSec)`. Negative gap (clock moved back) → 0 and reset `savedAt`.
- Same function for cold load and for in-session resume (`lifecycle 'resume' {awaySec}`), counted **once per away
  interval** (lifecycle de-duplicates). Gaps < 5 s fold into normal ticking; nothing is reported.
- `advanceOffline` is closed-form per line (DESIGN §2.2): managed lines earn `σ·P·t`, shelf fills with `(1−σ)·P·t`
  up to cap; unmanaged lines fill shelf only. Timers (education, events cooldowns, season) advance by the gap.
  Events never fire offline. Season worlds use their own 50% / 4 h rule.
- After the report: `shipments.reseed(simTime)` so the town looks busy immediately rather than empty.
- UI: a non-blocking "While you were away" card under the HUD (never a modal).

---

## 6. Lifecycle and context-loss recovery ("never a black screen")

### 6.1 Layers of defence

1. **Presentation survives the GPU**: views are 2D canvases holding the last good frame; the WebGL canvas is never
   on screen, so a lost context shows a frozen image, not black.
2. **2D canvases can't go black either**: `getContext('2d', {alpha:true})` over a CSS poster background; on the 2D
   canvas `contextlost` → mark view dirty; `contextrestored` → repaint.
3. **Restore path**: `webglcontextlost` → `preventDefault()`, `host.lost = true`, stop scheduler, start a 2.5 s timer.
   `webglcontextrestored` → three re-inits itself; host warms programs (`renderer.compile(scene, heroCam)`), sets
   `markDirty('*')`, resumes.
4. **Recreate path** (restore never fires, or `isContextLost()` still true on resume, or quality needs new MSAA):
   `renderer.dispose()`, `forceContextLoss()` guarded, new `WebGLRenderer` with the same options, `presenter.onRecreate`,
   `markDirty('*')`. Scenes/geometries/materials are reused as-is (verified in prototype). Max 3 recreations per
   minute; after that a small chip "Graphics paused — tap to restart" which saves then performs the cache-busting reload.
5. **Resume repaint**: on every `resume` (visibilitychange visible, `pageshow` incl. `persisted`, `resume`, `focus`):
   check context, re-run resize, `markDirty('*')`, render all visible views in the first frame (ignoring K once).
6. **Watchdog** (setInterval 1 s, so it runs even if rAF is wedged): if visible, not lost, and no presented frame for
   3 s → log `debug.stalls++` and run the resume path; if rAF itself isn't firing, restart it.

### 6.2 Event wiring (one owner: `core/lifecycle.js`)

`visibilitychange`, `pagehide` (save; `persisted` noted), `pageshow` (`persisted` → bfcache-restore: treat as
resume with full repaint and offline gap), `freeze` (save) / `resume`, window `focus`. No `beforeunload`/`unload`
listeners (they disable bfcache). Audio context is suspended on `suspend` and resumed on the next user gesture.

### 6.3 Simulation while away

rAF stops when hidden, so the sim stops; the resume handler computes `awaySec` from wall clock once and calls
`advanceOffline`. In-foreground `tick` clamps dt ≤ 1 s, so a janky frame can't double-count.

### 6.4 Boot guard (inline, classic script, first thing in `<body>`)

Adapted from SUNWAKE / RAGDOJO: listens to `error` (capture phase, catches failed `<script>`/module fetches) and
`unhandledrejection`; shows a boot panel with the message and a **Reload** button that navigates to
`location.pathname + '?v=' + Date.now()` (plain reload re-serves the same stale module pair). 15 s watchdog if
`window.__il2Boot()` hasn't been called. After boot it hands errors to an on-screen error chip instead (non-blocking).
Three is local (`/gms/lib/three/0.160.0/`), never a CDN.

---

## 7. Low-poly art kit

### 7.1 Style

Flat-shaded, chunky, 1 unit = 1 m, pastel ambient + warm key light per district (DESIGN §5.2). No textures at all
(except one tiny canvas gradient per district sky, shared). Colour lives in **vertex colours**.

### 7.2 Materials (the whole game uses ≤ 6 programs)

| Material | Use |
|---|---|
| `lambertVC` — `MeshLambertMaterial({vertexColors:true, flatShading:true})` | all static merged plot geometry, roads, hub |
| `lambertVCInst` — same + instancing | piles, trees, props scattered with InstancedMesh |
| `crowd` — `lambertVC` + `onBeforeCompile` limb animation | characters |
| `basicBlob` — `MeshBasicMaterial` transparent, depthWrite off | blob shadows, coin pops, highlight rings |
| `basicSky` | backdrop gradient |

Plot modules never create materials. Programs are warmed at boot with `renderer.compile`.

### 7.3 Merge builder (`kit/build.js`)

```js
const b = kit.builder(palette);
b.box('wall', x,y,z, sx,sy,sz, ry?)   b.cyl(...)  b.cone(...)  b.roof(...)  b.awning(...)  b.tree(kind, x,z, s)
b.ao(strength)        // darkens vertex colours toward y=0 (cheap baked contact shadow)
const mesh = b.finish()   // ONE BufferGeometry, ONE draw call for all static parts of the plot
```

Colours are palette **slot names** (`'wall'`, `'roof'`, `'trim'`, `'ground'`, `'accent'`), so a season skin (§7.5)
recolours a whole plot by swapping the palette, no geometry changes. Target per plot: static ≤ 3 draw calls,
animated ≤ 8, ≤ 6k triangles.

### 7.4 Tiny character rig (`kit/crowd.js`) — prototyped

One merged geometry (~150 tris: torso, head, 2 legs, 2 arms, optional hat/apron/item) with two extra vertex attributes:
`limb` (−1/+1 legs, ±0.6 arms, 0 rigid) and `tint` (1 on clothing verts). One `InstancedMesh` per crowd →
**1 draw call for every person in a plot**. Per-instance attribute `aAnim = (clip, phase, speed)` drives the vertex
shader: clip 0 idle sway, 1 walk, 2 carry (arms forward, box child), 3 work (arm chop / pour), 4 cheer.
`instanceColor` × `tint` gives outfit variety. CPU per frame = one `setMatrixAt` per visible person (position/heading).
Age/life-stage for the player character = a separate small set (cane, grey hair colour slot), same rig.
PolyPerfect rigged people are an option for the *hero's* player character only, high tier, after P2.

### 7.5 Seasons / visual tiers

`render/season/<id>.js` exports `{ palette overrides, propAdds(plotId, b), sky, crowdOutfits }`. Visual tiers
(DESIGN L1/L25/L100) are three prebuilt sub-groups per plot toggled by `lineStats.visualTier`.

---

## 8. Performance budget

Targets for a mid phone (iPhone 12 / Pixel 6a class) at mid tier; enforced on desktop Metal with CPU 4× throttle.

| Item | Budget |
|---|---|
| Main-thread per frame (sim + render CPU + UI) | ≤ 4 ms avg, ≤ 8 ms p95 |
| Draw calls per frame | ≤ 160 (hero ≤ 90, card ≤ 20 each) |
| Triangles: hero / card | ≤ 150k / ≤ 25k |
| Pixels rendered per frame | ≤ 1.2 M at mid |
| Shader programs | ≤ 6 |
| Textures | ≤ 2 MB total |
| Live 2D canvases | ≤ 10 |
| Allocations in frame loop | 0 (pooled vectors/objects) |
| JS shipped (excl. three) | ≤ 300 KB uncompressed |
| Boot to first rendered hero | ≤ 1.5 s on desktop, ≤ 3 s on phone wifi |
| DOM writes | text 4 Hz; per-frame only `--p` on visible cards |

### 8.3 Debug surface (`host.debug`, read by tests)

`{ frames, presented, lastPresentAt, views, visibleViews, renderedThisFrame, calls, tris, dpr, tier, lost,
restores, recreations, stalls, programs, sample(viewId) → {lum, alpha} }` — `sample` draws the view's 2D canvas
into an 8×8 scratch canvas and returns mean luminance and alpha (the black-frame detector).
Test-only hooks behind `?debug=1`: `host.debug.loseContext()`, `.restoreContext()`, `.recreate()`,
`lifecycle.simulate('hidden', ms)`. `?break=norecover` disables recovery so tests can be falsified.

---

## 9. Test plan

All browser tests use `tools/cdp.mjs`: launches via `~/.claude/bin/cdp start --port <p> -- --use-angle=metal`
(SwiftShader numbers are fiction for perf), `Network.setCacheDisabled`, `Emulation.setDeviceMetricsOverride`
(never `--window-size`; headless clamps width ≥ 500), stops the browser at the end. Served by the existing python
server on :8888 (never start another there).

### 9.1 Node (no browser) — `node --test tools/test-economy.mjs`, `node tools/sim.mjs`

- Cost formulas: bulk x10 = sum of 10 singles; MAX is the largest affordable n and n+1 is not.
- Milestone multipliers apply exactly at thresholds; σ/shelf behaviour (full shelf throttles, never loses).
- `tapPile` sells stock at +25%; first business cannot be bought without taps from $0.
- Events: seeded schedule deterministic; claim gives reward; expire costs nothing.
- Offline: closed form equals ticking 0.1 s steps for the same gap (±0.1%); cap respected; negative gap → 0;
  resume twice within one away interval credits once.
- Save: round-trip identical; each fixture migrates; corrupt → quarantine, **storage key untouched**;
  future version → persistence disabled. (Per the "tests that mock the fix" rule: revert the guard and see it fail.)
- `sim.mjs`: bot that buys greedily + taps at a human rate; prints time to each line and district vs DESIGN §11
  bands; exit code ≠ 0 when outside ±30%.
- Import-rule lint: `state/` and `data/` files contain no `document`, `window`, `THREE`, `Date.now`, `Math.random`.

### 9.2 Browser

| Test | Asserts |
|---|---|
| `test-boot` | `__il2.ready` < 5 s; zero console errors/warnings from our origin; every request same-origin; ≥ 1 frame presented per view on screen |
| `test-bootgate` | `Network.setBlockedURLs` on `js/render/host.js` → boot panel visible with Reload within 15 s. Control arm (unblocked) must NOT show it. |
| `test-lifecycle` | (a) `loseContext()` → hero + visible cards `sample().lum > 0.05 && alpha == 255`; `restoreContext()` → `presented` advances and `restores == 1`. (b) `loseContext()` with no restore → within 3.5 s `recreations == 1`, frames advance, samples non-black. (c) `Page.setWebLifecycleState frozen → active` → save written on freeze, repaint on resume. (d) `lifecycle.simulate('hidden', 60000)` → offline credited once, cash grows by expected amount ±1%. (e) navigate away + `Page.navigateToHistoryEntry` back → if `pageshow.persisted`, repaint within 2 frames; else cold boot with offline report. (f) Falsify: rerun (b) with `?break=norecover`; the test MUST fail. |
| `test-scroll` | 5 s scripted scroll at CPU 4×, Metal: frame dt p95 ≤ 20 ms, main-thread p95 ≤ 8 ms, no view unpainted for > 250 ms while visible |
| `test-layout` | 390×844, 360×740, 430×932, 820×1180, 1440×900: no horizontal overflow; glyph buttons ≥ 40 px; each `.line-view` canvas size == element size × DPR |
| `shot` | `docs/shots/portrait-390x844.png`, `desktop-1440x900.png` + one per district via `?debug=1&focus=<line>`; screenshots via `Page.captureScreenshot` (Metal) — the 2D presentation canvases also allow `toDataURL` without `preserveDrawingBuffer` |

### 9.3 Manual phone checklist (P3, Aaron or manager)

iOS Safari + Android Chrome: lock screen 10 min → return; switch to a heavy WebGL tab then back; rotate; Low Power
Mode; fast flick-scroll the list (watch for drift/blank cards); airplane mode reload (boot guard path).
Record `host.debug` via the `?debug=1` panel after each.

---

## 10. Lanes for parallel builders (P2)

| Lane | Owns | Depends on (stubs ok) |
|---|---|---|
| L1 Economy | `js/state/*` (except shipments), `js/data/{lines,districts,managers,items,events,housing,education,contracts,seasons}.js`, `tools/test-economy.mjs`, `tools/sim.mjs`, `tests/fixtures/*` | none |
| L2 Render core | `js/render/{host,presenter-*,quality,cameras,actors,fx}.js`, `js/render/kit/*`, `js/state/shipments.js`, `js/core/lifecycle.js`, `tools/test-lifecycle.mjs`, `tools/test-scroll.mjs` | data/plots.js shape |
| L3 World art | `js/render/world.js`, `js/render/plots/*`, `js/render/season/*`, `js/data/{palette,plots}.js` | kit API (§7.3) |
| L4 UI | `index.html` (except boot guard block), `style.css`, `js/ui/*`, `js/state/format.js`, `tools/test-layout.mjs` | Game/Host contracts |
| Manager | `js/main.js`, `js/core/{flags,bus,version}.js`, boot guard, `tools/{cdp,test-boot,test-bootgate,shot,bump}.mjs`, docs | — |

L3 can split further by district (one agent per 3–6 plot files) because each plot is a self-contained module.
