# Idle Life 2: scaffold (P2a)

Every module in ARCH §2 (as amended by CONTRACT.md) exists with its real exported signature. Each one returns a working dummy, so the game boots end to end. A lane replaces only its own files. If the replacement keeps the exports below, the game keeps booting.

URL: http://localhost:8888/gms/3d/idle-life2/ (the site server is already running; never start another on :8888).

## Run the tests

| Command | What it checks |
|---|---|
| `node --test tools/test-economy.mjs` | Pure economy smoke tests (see list below) |
| `node tools/test-boot.mjs` | Static checks, then a Metal-GPU browser run at 390×844 (mobile, DPR 2) and 1440×900 (see list below) |
| `node tools/test-bootgate.mjs` | Falsification: blocking `js/render/host.js` must show the boot error panel with a Reload button. The control arm must boot cleanly. |
| `node tools/shot.mjs [query]` | Writes `docs/shots/portrait-390x844.png` and `desktop-1440x900.png`. The default query is `?nosave=1&demo=1`. Pass `'?nosave=1'` for a fresh-start shot. |
| `node tools/bump.mjs [BUILD]` | Rewrites every `?v=<BUILD>` in index.html and js/**, plus `core/version.js`. Run it after any change to a JS file. |

`test-economy.mjs` covers:
- the first stand needs taps
- a managed line earns
- an unknown act never throws
- serialize round-trips
- `state/` and `data/` contain no `document`, `window`, `THREE`, `Date.now` or `Math.random`

`test-boot.mjs` static checks:
- every relative import carries `?v=BUILD`
- the layer rules hold
- three is loaded locally, not from a CDN

`test-boot.mjs` browser run, at both viewports:
- `__il2.ready` becomes true
- 13 views are registered
- every visible view has presented a frame with `host.debug.sample` luminance > 0.05 and alpha 255
- the boot panel is hidden
- there is no horizontal overflow
- the bootstrap path works: 25 taps, cash in the cans, buy Lemonade
- every request is same-origin
- there are zero console errors or warnings, exceptions or failed requests

All browser tools use `tools/cdp.mjs`. It launches through `~/.claude/bin/cdp start --port 9241 -- --use-angle=metal`, sets `Network.setCacheDisabled` and `Emulation.setDeviceMetricsOverride`, captures the console, log, exceptions and network, and stops the browser in a `finally`. Change the port with `CDP_PORT=`.

Results at P2a, 2026-10-03: all of the above PASS.
- Metal (Apple M5): render ≈ 1.2 ms per frame. Headless rAF caps at about 30 fps.
- Context-loss smoke check: after `debug.loseContext()` with no restore, the views keep their last frame (luminance 0.51, alpha 255). The renderer is recreated after 2.5 s and frames resume.

## URL flags (`core/flags.js`)

| Flag | Effect |
|---|---|
| `?nosave` | No load and no write |
| `?reset` | Clear the save |
| `?debug` | Adds `loseContext` / `restoreContext` / `recreate` to `host.debug` and allows `act('cheat')` |
| `?demo` | Cheat: all districts and lines unlocked, managers hired, levels added |
| `?tier=low\|mid\|high` | Quality tier |
| `?dpr=` | DPR override |
| `?fast=N` | Sim-time multiplier |
| `?focus=<lineId>` | Pins the hero view to that line |
| `?presenter=overlay` | Overlay presenter (currently a blit clone) |
| `?break=norecover` | Turns off context-loss recovery, for falsifying tests |
| `?seed=` | RNG seed |

## What exists

### Core (manager)

| File | Contents |
|---|---|
| `index.html` | Inline classic boot guard (ARCH §6.4): capture-phase `error` + `unhandledrejection`, 15 s watchdog, Reload → `?v=Date.now()`, post-boot non-blocking `#err-chip`. Importmap points to the local three. |
| `js/main.js` | Composition root (ARCH §3.7). Exposes `window.__il2 = { game, host, ui, lifecycle, world, shipments, bus, flags, BUILD, ready }`. `ready` flips, and `__il2Boot()` is called, after the first presented frame. |
| `js/core/flags.js`, `bus.js`, `version.js` | As described above. |
| `js/core/lifecycle.js` | `on('suspend'\|'resume'\|'pagehide'\|'bfcache-restore')`, `hidden`, `simulate('hidden', ms)`. `resume` fires once per away interval with `{awaySec, reason}`. |

### L1 economy: `js/state/*`, `js/data/*`

`createGame({data, save, seed, rng, nowWall, allowCheat})` is a working minimal game. It is pure, steps on a fixed 0.1 s accumulator, and implements every ARCH §3.1 method: `tick`, `act`, `quote`, `stats`, `totals`, `on`, `advanceOffline`, `serialize`, plus the `simTime` getter.
- **Bootstrap:**
  - `tap` (or `pickCan`) adds a can.
  - `cashCans` pays $2 per can.
  - Lemonade costs $50, about 25 taps.
- **Lines:**
  - `unlock` and `level` (1, 10 or `'max'`).
  - `throughput` raises σ and gives ×1.1 price.
  - `storage` and `boost` exist.
  - `hire`: σ applies only to managed lines; unmanaged lines fill the shelf only.
  - The shelf holds 3 min of output.
  - `tapPile` sells the pile at ×1.0, or ×1.5 as the return harvest after offline.
- **Events:** spawn after the first purchase, and `claimEvent` pays the reward.
- **Other acts:** `permit`, `housing`, `partner`, `nightShift`, `setting`, `postcardTaken` and `managerLevel` work. `equip`, `unequip`, `merge`, `autoEquip`, `claimContract`, `retire`, `seasonEnter` and `seasonLeave` return `{ok:false, code:'todo'}`.
- **Scaffold-only act:** `cheat {cash, unlockAll, managers, levels}`. It works only with `allowCheat`.
- **State fields:** the CONTRACT.md fields (`life`, `family`, `bootstrap`, `nightShift`, `returnHarvest`) are present.
- **Extra `stats()` fields:** `rate` (gross production) and `unlockable`.

Other state modules:

| Module | Contents |
|---|---|
| `economy.js` | Formulas: cost, bulk, max, milestone, σ, shelf |
| `lines.js` | `stepLine`, `sellPile` |
| `events.js` | `pickEvent`, `nextGap`, `mulberry32` |
| `offline.js` | Closed form |
| `save.js` | `parse`, `MIGRATIONS`, `createSaveStore`. Quarantine on corrupt; a future version turns persistence off. |
| `format.js` | Owned by L4 |
| `managers.js`, `season.js`, `prestige.js` | Thin helpers |

Data: `data/lines.js` has the 12 lines with their ids, names, emoji, district and themed glyphs, and **placeholder numbers**. `districts.js` has the 4 districts. `managers`, `items`, `events`, `housing`, `contracts`, `seasons` (Hollow's Eve) and `achievements` are present as placeholders.

### L2 render core

**`render/host.js`**: one `WebGLRenderer` whose canvas is never in the DOM, plus the blit presenter.
- **Views:**
  - IntersectionObserver (rootMargin 50%) for visibility, ResizeObserver for size. No per-frame rect reads.
  - Offscreen size = largest view × DPR.
- **Scheduler:**
  - Hero at the tier fps.
  - Cards are due by dirty → focused → oldest, at most K per frame.
  - `forceAll` renders everything on the first frame and on resume.
- **Context loss:**
  - `preventDefault`, then a 2.5 s timer → recreate (max 3 per minute).
  - The restore path marks everything dirty.
  - On resume: check the context, then `markDirty('*')`.
  - A 1 s stall watchdog emits `host:stall`, and main restarts rAF.
- **API:** `setWorld`, `addView`, `removeView`, `setFocus`, `markDirty`, `setTier`, `onFrame`, `project`, `pick` (tapTargets first, then the ground plane → lineId), and `debug` (ARCH §8.3 plus `sample(viewId)` and `listViews()`).
- **Scaffold addition:** `host.render(now)` is called by main's rAF loop. `onFrame` hooks receive `(dt, now, visibleLineIdSet)`.

Other L2 files:

| File | Contents |
|---|---|
| `presenter-blit.js` | `attach`, `detach`, `begin(view, pw, ph)`, `present(view, renderer, pw, ph)`, `onLoss`, `onRecreate`. 2D canvases use `{alpha:true}` over a CSS poster gradient with the line emoji. |
| `quality.js` | Tier table from ARCH §4.2 and `startTier`. The governor is a no-op. |
| `cameras.js` | `createCardRig(plot)` → `{camera, fit(aspect)}` (fits plot width). `createHeroDirector` → `{camera, current, pinned, pin, unpin, cut, onChange, setAspect, update(dt, tourIds)}`. It tours owned lines every 10 s, or stays on home before the first purchase. |
| `actors.js` | Instanced vans driven by `state/shipments.js`. |
| `fx.js` | Pooled coin burst on `pileSold`. |
| `state/shipments.js` | Spawns from `produced` on managed lines; `place`, `reseed`. |

### L3a / L3b art

**Kit:** `render/kit/index.js` `createKit()` → `{materials, geo, vehicles, builder(palette), crowd(opts), pile(opts), basePlot(opts, decorate), setTime(t)}`.

| Kit file | Contents |
|---|---|
| `build.js` | Merge-builder: `box`, `cyl`, `disc`, `cone`, `ball`, `roof`, `tilt`, `awning`, `tree`, `ao`, `finish` → one vertex-coloured mesh. Palette slot names or hex. Baked AO toward y=0. |
| `materials.js` | `lambertVC`, `lambertVCInst`, `crowd`, `basicBlob`, `basicSky`. `crowd` is Lambert plus `onBeforeCompile` limb animation driven by `aAnim = (clip, phase, speed)`, `limb` and `tint`. Clips: 0 idle, 1 walk, 2 carry, 3 work, 4 cheer. |
| `crowd.js` | One `InstancedMesh` per crowd. |
| `piles.js` | Instanced stock boxes, scaled by `stockRatio`. |
| `vehicles.js` | `van`, `boat` |
| `plotbase.js` | Shared placeholder plot (see below). |

`plotbase.js` provides the pad, kerb, trees, 3 visual-tier groups, crowd paths, pile and the full buildPlot contract (`group`, `bounds`, `camera`, `exit`, `pileAnchor`, `tapTargets`, `update`).

`render/plots/<id>.js` covers all 12 lines plus `home.js`, which holds the bootstrap bench, ♻️ bin tapTarget `'bin'`, a lamp, and Bedsit/Apartment tier groups. Each plot is a crude, recognisable diorama built on `kit.basePlot`: lemon stand, truck, barber pole, café umbrellas, wash arch, pet tub, chippy by the water, ferry, boat on stocks, boutique, bistro terrace, glass tower. Tier groups appear at Lv 25 and Lv 100.

`render/world.js` `createWorld({kit, data, skin})`:
- One scene with hemisphere and sun lights, fog, the ground, the road with dashes, and backdrop trees.
- Plots are placed from `data/plots.js`: home first, then the 12 lines along the street, with gaps between districts.
- `prepare(view)` toggles plot visibility for cards.
- `update(dt, game, shipments, visibleLineIds, tier)` animates only visible plots and the hero's current plot.

Also in this lane: `render/life.js` (no-op `update`), `render/season/hollows-eve.js` (palette and outfit stub) and `data/palette.js`.

### L4 UI

`ui/app.js` `createUI` → `{mount, update, showOffline, toast}`:
- **HUD:** cash, income/s, age chip, ⚙️.
- **Sticky hero:** tap to pick up cans, the bin cashes them in, a hustle tap after the first stand, a pile tap sells. Also the hint chip, the 🗺️ map sheet and event chips.
- **Quantity selector:** x1, x10, MAX.
- **12 `.line-card[data-line]`**, each with:
  - a `.line-view` registered with `host.addView`
  - a badge
  - ⓘ (stats sheet) and 📌 (pins the hero)
  - glyphs ⬆, themed throughput, themed boost and 🕴 with cost captions
  - a locked state with an unlock button
  - the bottom-border progress via `--p`

Text updates run at 4 Hz. `--p` is written only for visible cards.

Supporting files: `sheets.js` (bottom-sheet popup, never `alert`), `toast.js` (toasts and floating text), `events.js`, `hud.js`, `linecard.js` and `dom.js`. `map.js`, `manager.js`, `season.js`, `settings.js` and `life.js` are stubs.

`style.css` is portrait-first: a sticky HUD, then a 36vh sticky hero, then the cards at 16:7. At ≥900 px it switches to a two-column grid with the hero on the left at full height.

## Known stub limitations, by lane

### L1
- All numbers are placeholders. There is no pacing and no sim. Demo cash runs to absurd values.
- No combo or crit on taps.
- Events are cash or multiplier only. There is no Rush Hour, contracts, prestige, season, items or manager traits.
- Return-harvest is credited per line after any offline gap ≥ 5 s.
- The quarantine key uses the raw length, not a timestamp, because state code has no `Date.now`.
- The `.bak` rotation isn't throttled.
- The save loop in main writes every 10 s.

### L2
- The quality governor is a no-op.
- The overlay presenter is a blit clone.
- There is no 10-canvas cap or backing-store release off-screen.
- There is no `renderer.compile` warm-up.
- `project` and `pick` allocate. ARCH §8 wants zero allocations.
- `test-lifecycle` and `test-scroll` have not been written yet.
- In-plot shipment paths are straight lines.
- Vans from every line are visible in every card, because the actor layer is not plot-filtered.
- The headless hero frame rate is capped at about 30 by headless rAF, not by the scheduler.

### L3a / L3b
- Every plot is the shared `plotbase` placeholder. The props are crude and the worker paths are simple ping-pong.
- There is no blob shadow, no sky gradient (flat background colour) and no day/night.
- `life.js` does nothing. Home has no player growth, partner or kids yet.
- `skin` is accepted but ignored. Hollow's Eve isn't wired in.
- `basicBlob` and `basicSky` are unused.
- The hero director is a plain 10 s tour: no smart highlights and no life-beat cut-ins.

### L4
- Glyph buttons are plain; they don't hold-to-buy or pick the next themed glyph.
- No 🕴 manager screen, no tabs and no compact calm lines.
- The settings sheet only switches the tier.
- No sound, no postcard and no milestone stamps.
- `tools/test-layout.mjs` has not been written yet.

## Additions beyond ARCH §3 (lanes may rely on these)

| Addition | Where |
|---|---|
| `host.render(now)` | `render/host.js` |
| `host.renderer`, `host.world`, `host.debug.listViews()` | `render/host.js` |
| `createKit()` | `render/kit/index.js` |
| `kit.basePlot` | `render/kit/plotbase.js` |
| `world.heroRig` director API | `render/cameras.js` |
| `world.update(…, tier)` | `render/world.js` |
| Act `cheat` (needs `allowCheat`) | `state/game.js` |
| `stats().rate` and `stats().unlockable` | `state/game.js` |
| `game.simTime` getter | `state/game.js` |
| Bus events `host:stall`, `graphics:paused`, `ui:unlocked` | various |
| `ui/dom.js` helper | `ui/dom.js` |
