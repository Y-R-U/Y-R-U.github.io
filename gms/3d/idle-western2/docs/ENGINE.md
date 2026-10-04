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
| `node tools/test-cards.mjs` | Blank-card gate (round 3): S22 CPU 4×, all 9 businesses building, then all open; scrolls every card (jumps + sweep). Fails if any card ≥ 40% on screen (DOM rect, not the host's observers) has an empty/uniform canvas for > 1 s, or if a `cardShot` capture taken while builds open (and yank the page) is the flat poster. Falsified both ways: a host that skips one card → `tubs 4079 ms` FAIL; the old camshot clip → 9/9 flat FAIL. |
| `node tools/test-look.mjs` | Hold-to-look on the hero and a card (touch plus mouse), the edge clamp, tap and swipe still working. |
| `node tools/test-quality.mjs [--only=normal,gov,bench,falsify]` | Adaptive quality (below): `classifyGpu` table; Metal no-load stays High (no steps, a 3 s freeze is ignored) and the `host.quality` API; slow laptop (CPU 6× + `?gpuload=900`) reaches dt p95 ≤ 34 ms over 10–25 s with no up/down reversals, both governor-only (`?bench=0`) and bench + governor; falsified with `?gov=0` (p95 50–67 ms must fail the gate). |

URL flags (`core/flags.js`): `?nosave ?reset ?debug ?demo ?tier= ?dpr= ?fast= ?focus=<id> ?presenter=overlay ?break=norecover ?seed=`. Quality flags (read by host/quality): `?tier=high|medium|low` (fixed preset), `?qstart=<level>` (auto, starting and capped at that rung, no bench), `?bench=0`, `?gov=0` (auto never moves), `?gpu=<renderer string>` (spoof the GPU probe), `?gputimer=0`, `?gpuload=<n>` (test-only slow-GPU stand-in). The art params `?tod= ?tm= ?expo=` are read by world.js.

## Phone frame scheduling (round 2, lane M — PERF P#3, P#5, P#10)
Phones are `device.mobile` (Android/iOS UA or `pointer:coarse`). Desktop scheduling is unchanged.

- **Hero 30/60 (P#3).** `quality.js` gives phones `heroFpsIdle` 30; the hero runs at `heroFps` (60 on high) only while **hot**:
  - `host.setHeroHot(fn)` — main.js wires `heroRig.orbit.busy` (hold-to-look) `|| heroRig.shooting || heroRig.mode === 'cutin' || spectacle.hot` (fallback until S exposes `hot`: any spectacle scene other than an ambient `gag`);
  - the director camera is moving (> 4 m/s or > 8°/s, measured by the host after the frame hooks; the between-shot drift is ~0.35 m/s, glides peak ~65 m/s);
  - the hero became visible less than 0.8 s ago (scroll-in);
  - `host.heat(ms)` (for the UI, e.g. on a hero tap).
  `host.hot` and `debug.hot` report it.
- **Solo frames (P#3).** On phones the hero and a card never render in the same frame (`q.solo`). A frame where the hero is due renders only the hero; cards and pre-paints take the next frame. The hero yields a frame (never two in a row) when a visible card is starving past 2× its interval (3× while hot). At 30 fps idle they simply alternate. `forceAll` (resume/restore) and the overlay presenter ignore solo. Counters: `debug.perf.bothFrames` (must stay 0 on phones), `heroYields`, `hotFrames`.
- **Shadows (P#5).** Phone hero shadow map refreshes at `shadowHz` 4 (mid and high), `shadowHzHot` 12 (8 on mid) while the camera is moving so the map's coverage keeps up with a glide; desktop stays 12. Cards are unchanged (cache miss / `markShadow` only).
- **Movers never cast.** A shadow map refreshed at 4 Hz (or, on cards, only on a miss) would leave stepping or frozen shadows under anything that moves. The host checks shadow casters at 4 Hz; one whose world matrix (or instance matrices) changed on 3 consecutive checks is a mover, and its `castShadow` is forced off for good. Blob shadows stand in (crowds, walkers and actors already cast nothing). Seen in the demo: `town:rotor` (windmill), `ambient:tumbleweed`, the livery's and the dentist's moving parts. `debug.movers`, `debug.listMovers()`. A short pop (`fx.pop`, ≤ 0.5 s) or a pile changing stock doesn't qualify.
- **Hero-direct presenter (P#10, `?presenter=hero`, opt-in).** The WebGL canvas sits bottom-left inside the hero element (clipped, so it scrolls natively with no lag) and the hero is never copied; cards still blit. After a card frame (or a resize) the host replays the hero's final post pass (`post.replay`) so the hero comes back; the hero's 2D canvas is a 1 Hz snapshot shown while the context is lost. See the measurements below for why it is not the default.
- **A/B flags:** `?solo=0` (old scheduling: hero always at heroFps, hero+card frames allowed), `?shz=<hz>` (force the hero shadow rate), `?movershadow=1` (movers keep casting). `tools/perf-audit.mjs` takes `PA_QS='&solo=0&shz=12&movershadow=1'` to audit the old behaviour, and prints `hero+card frames %`.
- **Card culling hook with lane A (P#2):** the existing `world.prepare(view)` is called before every view render; A hides the far town/ambient crowd in its `line` branch and restores in the hero branch (CONTRACT.md).

### Measurements (2026-10-04, `perf-audit --only=frame --reps=3`, S22 profile CPU 4×, medians of 3 windows)
The machine was heavily shared (load 5–26 from four other lanes' Chromes; Flux/LTX/TTS/ACE idle), so p95s are noisy; the A/B pairs were interleaved back to back and the structural counters are exact.

| | old (`PA_QS='&solo=0&shz=12&movershadow=1'`) | new |
|---|---|---|
| hero+card in one frame, top / storm / scroll | 13.3–9.2% / 8.5–11.1% / 3.3–5.3% | **0% / 0% / 0%** |
| hero renders per frame, top (idle) | 1.00 | 0.58–0.64 (idle 30 + hot glides/ejects) |
| shadow bucket mean, top / storm | 0.13–0.16 / 0.22–0.24 ms | 0.03–0.06 / 0.07 ms |
| rAF work p95, top (pairs) | 12.0, 10.5 | 5.7, 7.5 |
| rAF work p95, storm / scroll (pairs) | 13.2, 13.3 / 11.5, 8.0 | 15.3, 12.6 / 10.4, 8.0 |

Storm runs at 60 fps by design (hot), so it gains only the shadow cut and the solo split. Final run on the finished code (load 11–23): top 7.1, storm 5.0, scroll 4.1 ms p95, all with 0% shared frames. test-scroll S22: dt p95 16.7, rAF work p95 7.4 ms (load ~10).

**P#10 hero-direct verdict: kept opt-in, not the default.** Interleaved: `present` 0.04 vs 0.17 ms mean (top) and 0.07 vs 0.11–0.16 (scroll), so about −0.1 ms CPU per frame including the replays; host.render differences were inside the load noise. On the GPU it removes one 0.48 Mpx copy per hero frame but adds a 0.48 Mpx composite replay per card frame while the hero is near, which is close to neutral at the idle 30/30 alternation and cannot be measured on the M5. The cost is a weaker never-black layer (on loss the hero shows a ≤ 1 s old snapshot instead of its last frame). Worth a Perfetto check on the S22 before switching: `?presenter=hero`. test-lifecycle (default presenter) passes; a manual loss/recreate under `?presenter=hero` showed the snapshot, then recreated with no errors.

## Blank build cards (round 3, lane M)
Not a scheduler bug. The UI scrolls the page to every business that opens (`app.js celebrateOpen → scrollToCard(id, true)`), so with all 9 sites building the page jumps to each one as it finishes. `camshot` centred a card, waited 6 s, then clipped the card's document rect; by then the page was often a screen away, and a CDP clip outside the viewport captures the flat beige poster (the 2D canvas is never painted there). Single-site runs have no other opening to jump to, so they looked fine. Measured in the page, no on-screen card was blank for more than one 60 ms sample in any run (S22, CPU 4×, building and open). Fix: `tools/cdp.mjs cardShot(page, id, path)` re-centres instantly, waits for two fresh host presents of that view, checks the card is fully on screen, and retries if it moved during the capture; `camshot` uses it. Use `cardShot` for any card screenshot.

## Adaptive quality (lane M, 2026-10-04)
Aaron: "a slow-ish laptop was a bit jerky". Before this, the governor stepped on a 2 s **mean** only, dropped every
frame > 250 ms (so a really slow device never stepped at all), read a GPU-bound steady 33 ms as a refresh cap (never
stepped), and on a 1× desktop its DPR rungs were no-ops (floored at 1). It already ran on desktops as well as phones.

**One ladder for every device** (`quality.js LADDER`, cumulative, ordered by cost saved per visual loss):

| level | adds | label |
|---|---|---|
| 0 | full: desktop DPR ≤ 2 (+ hero pixel budget 3.2 Mpx), phone 1.5 / cards 2 @ 0.5 Mpx, post ½-res + 4× RT MSAA, shadows 2048 | high |
| 1, 2 | DPR × 0.85, × 0.7 (screens ≤ 1.25 DPR may go to 0.8; others never below 1) | high |
| 3 | post from ¼ res, no RT/card MSAA, no hero sharpen | medium |
| 4 | shadow map 1024 (world tier `mid`), hero shadow rate ½ | medium (**preset Medium**) |
| 5 | cards 20/10 fps, K 2, fx 0.75 | medium |
| 6 | hero 30 fps | medium |
| 7 | post (bloom + tilt) off | low |
| 8 | no shadow maps (the one renderer recreate), cards 15/8, K 1, fx 0.5 | low (**preset Low**) |
| 9, 10 | DPR × 0.6 / × 0.5 (floor 0.75 / 0.6), crowd 0.6 / 0.35 | low |

Context MSAA stays fixed per device. `q.crowd` is sent to `world.setCrowdDensity(f)` if the world has it (requested from A).

**Start (auto).** `probeDevice()` → `classifyGpu(renderer string)`: software (SwiftShader, llvmpipe, Basic Render) low;
old Intel HD (≤ 4xx/HD 4000 class) low; other Intel/AMD integrated, GeForce MX/GT mid; Iris Xe/Arc, Apple, discrete
high; phones as before (Adreno/Mali numbers, PowerVR/Mali-T low). Then ≤ 2 cores or ≤ 2 GB → low, ≤ 4 cores or ≤ 4 GB
(desktop) → at most mid; a > 6 Mpx screen on a mid GPU starts one rung lower. high/mid/low = level 0/4/8, and that is
also the auto **ceiling**. `host.debug.device.reasons` lists why.
**Boot bench** (auto only, once): 2.5 s after the first present, 8 hero renders are each fenced by a 1×1 readPixels
(CPU submit + GPU), minus an empty-sync round trip; the 2nd-fastest of the last 5 is projected down the ladder by
`cost` until it fits 14 ms (phone 16 ms). It only ever lowers the start, at most to level 7 (no recreate).
Measured: M5 headless 1440×900 @1 ≈ 6–11 ms (stays High), @2 ≈ 21–23 ms (→ level 2, which then holds 60 fps); the
slow-laptop stand-in 44–62 ms (→ 6–7). `host.debug.bench`.

**Governor** (`createGovernor`, auto only; same code on phones and desktops). Fed every rendered rAF with the interval,
the host's CPU work and the GPU time (`EXT_disjoint_timer_query_webgl2` around each frame's GL work, `debug.gpuMs`,
−1 where unavailable). Decides every 250 ms over a 3 s window; no sampling for 4.5 s after boot/bench, 2.5 s after a
visibility return (lifecycle resume resets it; hidden tabs don't render), 1.5 s after a step.
- Down: mean > 1.25 × target (16.7 ms) or > 5 % hitches (> 2.5 × target). Size: ≤ 3 rungs, picked by `cost` from
  mean/target (a 200 ms boot on the stand-in goes 0→3→6 in two steps). Card-budget pressure is still one rung.
- Not ours: slow, but GPU (when known) and CPU both light → hold. Steady 2× with no GPU timer → one **trial** step;
  if the next window isn't 12 % faster it is a 30 Hz refresh cap (iOS Low Power Mode): revert and target 33.3 ms.
- Up: mean at target, < 1 % hitches, CPU < ½ target, GPU × next-rung cost < 0.8 × target; held 12 s × 2^(times that
  rung already failed, max 16×), so a rung that can't hold is retried at 24, 48 … 192 s: no oscillation.
- `debug.governor` (meanDt, p95, slow, gpu, reason, downs, ups, trials, capped), `debug.qlog` ([t, from, to, why]).

**Settings API (for lane U).** `host.quality.set('auto'|'high'|'medium'|'low')` → bool (also `'mid'`, `'battery'`);
`host.quality.current()` → `{ mode, level, label ('high'|'medium'|'low'), tier (world shadow tier), auto, ceiling,
levels, dpr, bench, reason, device }`; `host.quality.on(fn)` → unsubscribe, `fn(current())` on every mode or level
change (auto steps included, so "Auto (Medium)" can update live). `host.quality.knobs` is the live knob object (the
frame hooks get it too). Fixed presets never move. `host.setTier(name)` is the old alias. U persists the choice and
calls `set()` at boot; `?tier=` beats the saved setting. `bus graphics:tier` still fires.

**Test stand-in.** Swiftshader can't model this (300–600 ms frames even at low), and CDP CPU throttling doesn't slow the
GPU process, so `?gpuload=N` adds an additive full-view pass after every view render whose fragment loop runs N times
(alpha 1 × ~0 colour: with alpha 0 Metal's pipeline compiler dead-strips it). Cost scales with pixels × frames, like a
fill-bound iGPU. N = 900 at 1440×900 + CPU 6×: High = dt p95 50–67 ms, GPU 27–46 ms.
