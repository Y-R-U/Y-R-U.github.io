# Idle Western 2 — engine

Forked 2026-10-04 from Idle Life 2 (`gms/3d/idle-life2/`, BUILD 20261004c, read-only reference). The generic engine is kept as-is. The Idle Life content (lines, plots, life layer, Hollow's Eve, crew gear, goals) is gone. What remains boots on a **placeholder 3-business western dataset**: Stable, Saloon and General Store, built from boxes on a dusty main street.

URL: http://localhost:8888/gms/3d/idle-western2/ (the site server is already running, so never start one on :8888). Vanilla ES modules, no build step, three r160 from `/gms/lib/three/0.160.0/`.

For the full reasoning behind the render core, the IL2 docs are still the reference: `idle-life2/docs/RENDER.md` (scheduler, quality tiers, never-black-screen layers, director, hold-to-look), `UI.md` (job slicing, scrolling layout, jump dock) and `SCAFFOLD.md`.

## What was kept (unchanged except for renames)
- **Boot:** the `index.html` shell, which has the inline boot guard (error panel with Reload, 15 s watchdog, post-boot `#err-chip`) and the importmap to the local three.
- **Core:** `js/core/*`: flags, bus, version and lifecycle. Lifecycle is the single owner of visibility, pagehide, freeze and bfcache.
- **Render core:**
  - `host.js`: one WebGL context and a 2D canvas per view. Views are scheduled through IntersectionObservers (visible plus near/pre-paint), with K cards per frame and a 5 ms budget. It also handles boot warm-up, context-loss restore/recreate, the watchdog and the governor.
  - Presenters: `presenter-blit.js` and `presenter-overlay.js`.
  - `quality.js`: tiers, the 0.5 Mpx phone card pixel budget, and card MSAA plus sharpen.
  - `post.js`: bloom, tilt-shift and the card resolve.
  - `cameras.js`: the hero director, card rigs, town mode and the hold-to-look orbit.
  - `fx.js`.
  - `actors.js` and `eventart.js`: the shared shipment actors, tip couriers and diegetic event actors.
  - `kit/*`: materials with per-mesh-flavour uber splitting, the merge builder, crowd, piles, the plot framework, props, shape, lighting, terrain and surface textures.
- **UI:**
  - The scrolling hero on phones and tall cards (`--view-h`).
  - The jump dock (⤒ ⤓ ×qty), `look.js` (hold-to-look on the hero and on every full card) and the toasts, sheets, coach and reveal flags.
  - The line card (ghost, glyphs, hold-to-buy, `.prog` leaf), the ⓘ line sheet, the manager sheet (trimmed), the town tab, the gate card, the offline "while you were away" card, settings with save export/import/reset, and the graphics-paused chip.
- **State:**
  - `save.js`: envelope, migrations, quarantine, `.bak` rotation and future-version lock.
  - `economy.js`, `lines.js`, `offline.js` (closed form), `events.js` (seeded rng), `format.js` and `shipments.js`.
- **Tools:**
  - `cdp.mjs`: S22 viewport 412×915@3, Metal, cache off. The default `CDP_PORT` is **9311**.
  - Tests: `test-boot`, `test-bootgate`, `test-lifecycle`, `test-scroll`, `test-look` and `test-economy`.
  - Scripts: `sim.mjs`, `prof-scroll`, `bump.mjs`, `shot.mjs`, `gameshot.mjs`, `artshot.mjs`, `artsheet.mjs`, `artgate.py` and `artlab.html`.

### Renamed
| What | Idle Life 2 | Idle Western 2 |
|---|---|---|
| Debug global | `window.__il2` | `window.__iw2` |
| UI debug global | `__il2ui` | `__iw2ui` |
| Boot hook | `__il2Boot` | `__iw2Boot` |
| Save envelope `game` id | `il2` | `iw2` |
| Save keys | `il2.save`, `il2.save.bak` | `iw2.save`, `iw2.save.bak` |
| Save version | v2 | v1, fresh (`MIGRATIONS = {}`) |
| Card camera tag | `camera.userData.il2Line` | `camera.userData.iw2Line` |
| Overlay CSS classes | `il2-*` | `iw2-*` |
| Hub plot id | `'home'` | `'hub'` (`data/plots.js` `HUB`) |
| Director cut-in event | `life:beat` | generic `beat {lineId?, sec?}`; any future game event can trigger a cut-in |

The title and the boot text read "Idle Western 2". The BUILD is `20261004a`.

### Dropped (Idle-Life specific)
- **Life layer:** `render/life.js`, `state/life.js` and `ui/life.js` (aging, partner, kids, homes, retire and prestige, `state/prestige.js`). `ui/face.js` went with it.
- **Hollow's Eve:** `render/season/*`, `state/season.js`, `ui/season.js` and `data/seasons.js`.
- **Crew gear:** tickets, items, crates, merge, manager levels and slots (`data/items.js`, plus most of `ui/manager.js` and `ui/crew.js`).
- **Goals:** contracts, dailies, the 7-day gift and achievements (`state/goals.js`, `ui/goals.js`, `data/contracts.js`, `data/achievements.js`).
- **Events and extras:** the Rush Hour and Lucky Delivery mini-games (`ui/minigames.js`), bulk orders, postcards, the supply link and the night shift.
- **Bootstrap cans:** the bin and cans are gone. Before the first business, a tap pays `ECON.bootTap` ($2), so the $50 Stable takes 25 taps.
- **Content:** all 12 IL2 plots and `refs/`.
- **Tooling:** `test-layout.mjs`, which asserted IL2's layout. Port it if the UI lane needs it.

## Module map
```
index.html            boot guard + importmap (manager-owned)
style.css             IL2 base styles (portrait-first, scrolling hero, docked desktop ≥900px)
js/main.js            composition root → window.__iw2 = { game, host, ui, lifecycle, world, shipments, bus, flags, BUILD, ready }
js/core/              flags · bus · lifecycle · version (BUILD)
js/data/              PURE data (no DOM/THREE/Date.now/Math.random — enforced)
  lines.js            ECON, CURVE, BUSINESSES (one row per business) → LINES
  managers.js         MANAGERS derived from BUSINESSES[].manager
  districts.js        DISTRICTS (progression areas, permits), COURIER (tip riders)
  events.js           EVENTS (+ art key), EVENT_GAP, SPECIAL_GAP
  plots.js            street layout: HUB + one plot per business, STREET, WORLD_BOUNDS
  palette.js          builder colour slots (placeholder western), LIGHTS / DAY_KEYS
js/state/             PURE economy (node-testable)
  game.js             createGame → { state, simTime, data, tick, act, quote, stats, totals, on, advanceOffline, serialize }
  economy.js lines.js offline.js events.js managers.js save.js format.js shipments.js
js/render/
  host.js presenter-*.js quality.js post.js     render core (generic)
  cameras.js actors.js eventart.js fx.js        director, shared actors, event actors, particles
  world.js            scene: terrain + kit/town.js + plots from plots/index.js + ambient
  kit/                art kit; kit/town.js = PLACEHOLDER western street (replace freely)
  plots/index.js      plot registry  { hub, stable, saloon, store } + FALLBACK_PLOT
  plots/<id>.js       one file per plot (placeholder.js has shopPlot() used by all three)
js/ui/                app.js (composition) · model.js (read adapter) · linecard · lineinfo · manager · hud · tabs ·
                      gate · town · events · offline · look · juice · audio · toast · sheets · kit · reveal · dom · settings
tools/                cdp.mjs + tests + sim/profiling/art tools (see "Tests")
tests/fixtures/       save-v1.json (valid), save-corrupt.txt, save-future.json, save-foreign.json
```
Layer rules (test-boot checks them): `state/` and `data/` import neither `render/`, `ui/` nor `core/`, and touch no DOM, THREE, `Date.now` or `Math.random`. The UI writes only through `game.act`. Render reads `game.stats` and `game.state`.

## Extension points

### Add a business (no engine edits)
1. **Data:** append a row to `BUSINESSES` in `js/data/lines.js`.
   - Row: `{ id, name, emoji, district, cycleSec, unit, actor, tint, throughput: [[glyph, name]×5], boosts: [[glyph, name]×4], manager: { name, emoji, trait, kind, value, text } }`.
   - Row order is the street order and the unlock order.
   - The numbers come from `CURVE`, by row index; extend the `CURVE` arrays or tune them.
   - `actor` is what leaves the plot on each sale: `walker | courier | van | drone | boat`.
   - The manager `kind` is one of `speed | sigma | shelf | offline | cost | events | autopile | harvest | star`. To add a new trait, handle it in `game.js` `derive()`.
2. **Plot:** add `js/render/plots/<id>.js` exporting `default function buildPlot(kit, { line, palette, rng, district })`, and register it in `plots/index.js`. Without a plot file, the business renders with the generic `placeholder.js` shop.
3. **Done.** The card, its view, the scheduler, look-around, the director tour, shipments, the manager, the save and the test-economy data contract all pick it up. `test-boot` expects `1 + LINES.length` views.

**Plot contract** (`kit.plot()`, see `kit/plotbase.js`):
- Builders:
  - `P.b`, `P.t1` and `P.t2` are the visual tiers, shown at Lv 1, 25 and 100.
  - `P.lot` is the unowned look.
- Moving parts:
  - `P.crowd()`, `P.queue()` and `P.walkers()` for people.
  - `P.pile({at})` for stock, which follows `stats.stockRatio`.
  - `P.dynamic()` and `P.instances()` for moving parts (one draw call each).
  - `P.blobs()` for soft shadows.
  - `P.tick(fn)` for per-frame logic.
- Finish with `P.done({ w, d, h, camera, pileAnchor, exit, focus, lamps, tapTargets, update(dt, stats, time, tier, ctx) })`.
- Never set `plot.group.scale`, because fx `pop()` owns it.
- Draw-call budget: keep each card at about 30 calls or fewer.

### Add a district (progression area)
Append to `DISTRICTS` with `{ id, name, emoji, permitCost, verbText }`, then point business rows at it. The gate card under the list and the Town tab pins handle the permit. The previous district must be open first. Plot placement in `data/plots.js` is a single straight street; gaps or bends between districts are a layout change there.

### Add an event
Append to `EVENTS`.
- `frequent: true` events run on `EVENT_GAP`. The rest are weighted on `SPECIAL_GAP`.
- `lineless: true` events are placed in the current hero shot; the others go to a random owned business.
- `reward` is one of `cashSec {sec, jackpot, jackpotMult}`, `lineMult {mult, sec}` or `allMult {mult, sec}`. New reward kinds go in `game.js` `claim()`.
- `art` names the 3D actor in `render/eventart.js`. Current actors are pigeon, limo, parade, wallet, bulk, rush and lucky. A new western actor means a new `make(V.x)` prop plus a `case` in `eventart.js` `place()`.
- `actors.js` placement special-cases the art keys `pigeon` (flight path), `parade` (marches the street) and `limo` (parks).
- The UI (`ui/events.js`) handles claims, edge chips and the off-hero float chip. A mini-game event would add a `game` field and route it in `events.js` `claim()`. IL2's `minigames.js` is the pattern.

### Hero / director
- `world.heroRig` exposes `pin`, `unpin`, `cut(id)`, `cutIn(id, sec)`, `flyTo(id)`, `town(on)` and `orbit` (hold-to-look).
- The tour cycles owned businesses, and the hub before the first purchase.
- Game events `unlocked`, `milestone` and `event:spawn` cut to their business.
- Emit **`beat {lineId?, sec?}`** from the economy for a story cut-in, such as a duel, a bar brawl or a building finishing. It overrides pin and tour for `sec` (default 7 s); with no `lineId` it cuts to the hub. main.js also persists the save on `beat`.

### Actors
- `state/shipments.js` spawns per-sale actors by business `actor` kind; the speed and gap per kind are in `SPEC`.
- `render/actors.js` maps them to world positions and to instanced meshes, one per kind. Cards only see their own business's actors.
- Western actors (wagons, riders) replace the van/courier templates in `actors.js` `templates()`. Keep it to one instanced mesh per kind.
- Ambient town life (birds, circling buzzards, boardwalk walkers, lamp glow) is `kit/ambient.js`. The static street is `kit/town.js`.

### Tabs / sheets
- Add the tab to `ui/tabs.js` `TABS`.
- Add a reveal flag in `app.js` `computeReveals()`, using the same id as the tab.
- Add a sheet spec in `app.js` `openTab()` `specs`.
- Toasts and popups only: never `alert` or `confirm`.

## BUILD / version bump
- Every relative import carries `?v=BUILD`, and test-boot fails otherwise.
- After any JS change that must reach a phone, run `node tools/bump.mjs`. It rewrites every `?v=` in `index.html` and `js/**` plus `core/version.js`. The next letter is used on the same day, otherwise `<yyyymmdd>a`.
- Tools and `artlab.html` carry their own `?v=`; update those by hand if needed.

## Tests (all `CDP_PORT=9311` by default, Metal)
| Command | Checks |
|---|---|
| `node --test tools/test-economy.mjs` | 27 pure tests. They are business-agnostic (they read `LINES[0]` and `LINES[1]`) and cover the data contract, bootstrap, formulas, events, couriers, offline, districts, managers, the pacing bot, junk acts, save and purity. |
| `node tools/sim.mjs [--minutes=120]` | Active and idle greedy bots: time each business opens, and income. |
| `node tools/test-boot.mjs` | Static import, layer and local-three rules. At S22, 390×844 and desktop it checks: ready, `1+N` views, non-black frames, no overflow, the tap bootstrap, zero errors. |
| `node tools/test-bootgate.mjs` | Falsification: blocking `host.js` shows the boot error panel. |
| `node tools/test-lifecycle.mjs` | Context loss with restore and with recreate (plus the `?break=norecover` falsification), the recreate cap, freeze, hidden/offline once, bfcache, 2D loss, the watchdog, the overlay presenter, and per-card actors with a pickable tip courier. |
| `node tools/test-scroll.mjs` | S22 at CPU 4× plus desktop scroll budgets. It waits up to `GPU_WAIT` s for the Flux and LTX queues; a busy GPU makes its numbers unreliable. |
| `node tools/test-look.mjs` | Hold-to-look on the hero and a card (touch plus mouse), the edge clamp, tap and swipe still working. |

URL flags (`core/flags.js`): `?nosave ?reset ?debug ?demo ?tier= ?dpr= ?fast= ?focus=<id> ?presenter=overlay ?break=norecover ?seed=`. The art params `?tod= ?tm= ?expo=` are read by world.js.
