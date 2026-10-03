# Idle Life 2: render core (L2)

Owner: L2. Files: `js/render/{host,presenter-blit,presenter-overlay,quality,post,cameras,actors,eventart,fx}.js`, `js/state/shipments.js`, `js/core/lifecycle.js`, `tools/{test-lifecycle,test-scroll}.mjs`. The API additions are recorded in CONTRACT.md under "L2 render core".

## Shape

There is one `WebGLRenderer` and one context, and its canvas is never in the DOM. Every view (the hero and each line card) owns a 2D canvas. The host renders a view into the bottom-left of the offscreen buffer and the presenter copies that region into the view's canvas. A lost GPU therefore leaves the last good frame on screen, never black.

### Frame (`host.render(now)`, called once per rAF by main)
1. Return early if the page is hidden, there is no world, or the context is lost or paused.
2. The auto governor samples the rAF interval and the host's own work (see Quality).
3. Views come from two IntersectionObservers. `visible` uses rootMargin 0. `near` uses rootMargin 100% vertically.
   - Cards that leave `near` release their 2D backing store and the CSS poster shows instead.
   - At most `max(10, visible + 2)` 2D canvases are live.
   - There are no per-frame rect reads (blit presenter).
4. Due list:
   - The hero is due at the tier `heroFps`.
   - Cards are due at the tier card fps: the focused card (`setFocus`, else the pinned or current hero line) runs at full rate, the others at half. `setViewFps(id, fps)` overrides a view.
   - Order is dirty first, then focused, then oldest. At most K cards are rendered per frame.
   - After those, near-but-offscreen dirty cards get one pre-paint each, so scrolling never reveals a blank.
5. Frame budget: a card only starts while the frame is under 5 ms of host work, using a learned per-card cost. A card that is starved past 3× its interval may overrun once. Frames that block a starving card build `pressure`. When pressure stays above 50% the governor steps down, which takes the hero to 30 fps and gives cards alternate frames.
6. Resume, restore and recreate set `forceAll`, which renders every visible view in the first frame and ignores K and the budget once.
7. Frame hooks get `(dt, now, visibleLineIds, quality)`. `visibleLineIds` also includes the lines being pre-painted this frame.

### Presenters (`?presenter=overlay`)
| | blit (default) | overlay |
|---|---|---|
| Surface | 2D canvas per view (`{alpha:true}` over the CSS poster) | the WebGL canvas, fixed full-screen at z-index −1, scissored per view rect |
| Per-frame cost | one GPU copy per rendered view | rect reads per view per frame; every visible view is redrawn every frame |
| On GPU loss | last frame stays | posters come back (the canvas is hidden while lost) |
| Scrolling | native, no drift | lags compositor scroll by about 1 frame, and rounded corners are lost |

The overlay is an escape hatch for an iOS case where `drawImage(webgl)` proves too slow. It is smoke-tested in test-lifecycle (k).

## Quality (`quality.js`)
| | low | mid | high |
|---|---|---|---|
| DPR cap (desktop / phone) | 1 / 1 | 1.5 / 1.25 | 2 / 1.5 |
| Card DPR cap (phone) | 1 | 1.5 | 2 |
| Card AA (phone) | none | sharpen 0.45 | 4× MSAA target + sharpen 0.45 |
| Card pixel budget (phone) | — | 0.35 Mpx | 0.5 Mpx |
| Context MSAA | per device: desktop on, phone off (never changed by the governor) | | |
| Hero post target MSAA | 0 | 0 | 4× |
| Hero fps / cards (focused, other) / K | 30 / 15, 8 / 1 | 30 / 20, 10 / 2 | 60 / 30, 15 / 3 |
| Shadow map | none (blob shadows) | hero 5 Hz; cards cached @ 512 | hero 12 Hz; cards cached @ 1024 (512 on phones) |
| Post (bloom + tilt-shift) | off | hero, from ¼ res | hero + cards on desktop (hero only on phones), from ½ res |
| FX particle scale | 0.5 | 0.75 | 1 |

- **Start tier:** `probeDevice()` reads the GPU string from a throwaway context.
  - Phones: Adreno ≥ 700, Mali-G ≥ 710, Apple, Xclipse or Immortalis → high. On a phone, high renders at DPR 1.5, which covers the S22 Ultra target.
  - Adreno 618+ → mid.
  - SwiftShader or no WebGL → low.
- **Governor ladder:** high → high ×0.8 DPR → high with hero 30 fps → mid → mid ×0.8 DPR → low.
  - It steps down when the 2 s mean frame interval is over 20 ms, but not when the interval is a steady ~33 ms with light work. That pattern is a refresh-rate cap (iOS Low Power Mode, headless), not overload.
  - It also steps down on card-budget pressure.
  - It steps up after 10 s under 14 ms, at most once every 30 s, and never above the detected tier.
- Only shadow on/off (mid↔low) goes through the renderer recreate path; an MSAA toggle used to cost a 544 ms recompile stall at CPU 4×, so MSAA is now fixed per device. That path is the same code as the context-loss fallback, so it gets exercised.
- `setTier('auto'|'battery'|'low'|'mid'|'high')`.
- **Card sharpness (phones):** cards are small and render at ≤ 30 fps, so they get their own DPR (`cardDprCap`, × the ladder's `dprMul`) and, on high, a 4× MSAA half-float target that `post.js` resolves with a light unsharp mask plus tone mapping (no blur chain). Before, a 1.5-DPR card with no AA was stretched ~2× on a 2.6–3 DPR screen (staircased edges). Shots: `docs/shots/sharp-before-card.png`, `sharp-after-card.png`, zoomed `sharp-compare-zoom.png`. The blit presenter sizes the offscreen buffer per view (`v.d`). The hero composite gets the same sharpen (0.3). `?cardsharp=0` turns the card path off for A/B. `host.debug.cardDpr` reports it.
  - Cost (interleaved A/B, S22 profile, CPU 4×, 3 runs each): card render 2.68 → 2.36 ms CPU, present 0.16 → 0.21 ms. That is noise-level, because the extra cost is GPU fill, which headless Metal doesn't show. **Still unmeasured on a real Adreno 730.** If the governor steps down, the card DPR drops with it (2 → 1.6).

- **Card pixel budget (phones, `MOBILE_CARD_PX`):** a card gets at most 0.5 Mpx on high (0.35 on mid, × the ladder's
  `dprMul²`), never below the hero DPR. The tall portrait cards (~388×521 CSS) therefore render at DPR 1.55 instead of 2
  (0.48 vs 0.81 Mpx, still 4× MSAA + sharpen), about 40% less GPU fill per card; small cards still reach the cap.
  `?cardpx=0` turns it off for A/B. Zoomed A/B (left DPR 2, right 1.55): `docs/shots/cardpx-compare-zoom.png`.

## CPU per frame (perf pass, 2026-10-04)
After art rounds 3–4 the phone profile (S22, CPU 4×) went to rAF work p95 ~18–21 ms. The causes, in order of cost:
1. **Program thrash.** One `uber` material was shared by plain, instanced, instance-coloured and non-shadow-receiving
   meshes. three rebuilds the program parameters and key whenever consecutive objects differ in those flags, which came to
   about 20 `getProgram` calls per frame (`setProgram` was 15% of all CPU). The shadow pass had the same problem with its
   single shared depth material. Fix: `materials.splitUber(root)` gives each mesh flavour its own identical copy of the uber
   material (`materials.uberAll`, which `setLight` keeps in sync; test for an uber with `material.userData.uber`, never
   `=== materials.uber`) and a per-flavour `customDepthMaterial`. World sweeps the scene on its first update and then every
   4 s; `plotbase.setTier` sweeps its new mesh straight away. The result is zero per-frame program lookups.
2. **Late shader compiles.** `warm()` compiled with the wrong tone mapping (direct rather than through the post target), and
   it ran before the flavour split, so a card or flavour seen for the first time mid-scroll linked a program then (22–56 ms
   at 4×, and far worse on Adreno). It now calls `world.warmup()`, which splits flavours, shows every plot and fits the sun
   over the whole town. It compiles for the paths the tier really uses (the post RT and/or direct), and runs one tiny
   top-down render with a shadow pass to cover the depth programs. Programs at boot fell from 36 to 25, with none compiled
   during the scroll.
3. **Lazy plot builds.** A plot's first `update()` (`setTier` → `mergeGeometries`) used to happen when it first scrolled
   into view. World now primes every plot on its first update.
4. **Off-screen work.** Frame hooks get `visibleLines.hero` (the hero is visible or within the near margin). When it's
   false, world skips the plots near the hero's look-at, so an off-screen hero costs nothing. The hero now pre-paints when
   it is near and dirty, like the cards do. Hollow's Eve variant updates and bats only run while the season is drawn (or in
   the last 1 s). Lamp selection (`ambient.nearest`, the season's lamp mix) is allocation-free.

The numbers below are interleaved runs on a loaded machine (other agents running, load 3–8). Runs where the desktop
profile was also ~2× its normal cost were contended and are excluded.

| | rAF work p50 / p95 | host work avg |
|---|---|---|
| before (HEAD) | 11.1 / 18.5–21 ms | 9.6 ms, governor stepped down |
| after, old layout | 4.0 / 5.5–8.0 ms | 3.2–4.7 ms |
| after, new layout (hero scrolls away, tall cards) | 2.3–3.1 / 4.1–6.1 ms | 1.6–2.5 ms |

- Idle, as laid out: p95 3.8 ms. With the hero off and 2 cards: p95 3.1 ms, hooks 0.3 ms. With everything off: 0.2 ms.
- Desktop: p95 2.2–2.6 ms.
- `node tools/prof-scroll.mjs` prints the self and total CPU profile of the phone scroll.

## Lighting hooks (with L3a)
- **Tone mapping and exposure:** the world's `configureRenderer` sets them on the renderer. Alternatively it can expose `world.renderConfig`, which the host applies every frame. The hero bloom composite does its own tone mapping plus sRGB, so cards (rendered direct) and the bloomed hero match.
- **Shadows** (`autoUpdate` off):
  - The world places the sun per view in `prepare`. The host keeps a small LRU cache of shadow maps keyed by view: `hero`, `line:<id>`, or `world.shadowFocus(view, cam)` when defined.
  - Each entry is a map plus its matrix. The hero refreshes its map at `shadowHz`. Cards never refresh on a timer: only on a cache miss (first view) or `markShadow(lineId)` (bought, unlocked, milestone). A single town-wide card map was rejected because three's shadow pass only runs inside `render()`, which would cost an extra full-scene render.
  - A shadow pass therefore never runs per view per frame, and cards don't clobber the hero's map.
  - A key of `'world'` means one town-wide map that only refreshes on hero renders.
  - The cache is dropped on restore, recreate and tier change.
- **Environment:** a CanvasTexture `scene.environment` (L3a's) survives loss on its own. If the world gives `renderConfig.envScene`, the host builds the PMREM map and rebuilds it after restore or recreate. Render-target env maps don't survive loss.
- **Post** (`post.js`): `render(..., {bloom, tilt, samples, div, sharpen})`. Without bloom and tilt it is a 2-pass resolve: scene → (MSAA) target → sharpen + tone map into the viewport. With either, it is the full chain: scene → half-float target → down-sample (clamped to 64, so an Inf can't black the frame) → blur → down → blur → composite into the view's viewport. That is 6 full-screen triangles.
  - The composite blends toward the blurred levels away from a horizontal focus band (tilt-shift), adds their bright part (gentle bloom), then applies tone mapping and sRGB.
  - It is on by default per tier, with `POST_DEFAULTS` values. `world.renderConfig.bloom` / `.tilt` override them or set them to `false`. Cards get a wider, weaker band.
- **Renderer config:** the host calls `world.configureRenderer(renderer, tier)` every frame (the world caches the result).
- **Fog:** the director no longer touches fog; `world.prepare` sets distance-based fog per view, which already covers town mode.

## Never a black screen
These are the layers of defence, covered by test-lifecycle.

| Layer | Behaviour |
|---|---|
| 1. 2D presentation | The last frame survives GPU loss. |
| 2. 2D context loss | `contextlost` on a view canvas marks it dirty, and it repaints on the next frame. |
| 3. Restore path | `preventDefault` on loss. On `webglcontextrestored` the host swaps in a fresh renderer (the recreate code, counted in `restores`, not capped) instead of using three's in-place restore. See the note below. |
| 4. Recreate path | If no restore arrives within 1 s, or the context is still lost on resume: build a new renderer against the same scene, force the old context lost, then dispose the old renderer, post targets, shadow cache and PMREM env. At most 3 per minute. After that, `graphics:paused` is emitted (L4 shows a "tap to restart" chip) and `host.restart()` tries again. |
| 5. Resume repaint | Each `resume` re-measures, checks the context and forces every visible view. |
| 6. Watchdog | A 1 s interval. If rAF is wedged it emits `host:stall {kind:'raf'}` and main restarts the loop. If nothing has presented for 3 s it runs the resume path. |
| 7. Boot guard | Inline in index.html (manager-owned). |

**Stale-handle rule.** Every geometry, texture and render target three has uploaded carries a `dispose` listener bound to the renderer that uploaded it, holding that context's GL handles. If that context is live again (three's in-place restore, or a browser auto-restore of an abandoned canvas), any later `dispose()` from any module warns "object does not belong to this context". Before this fix it was post.js re-keying its targets after a restore, which made test-lifecycle (a) flaky. So an abandoned canvas is always kept lost: the old context is lost before anything is disposed, and a late `webglcontextrestored` on a non-current canvas is answered with `loseContext()` again. Stale listeners then only ever talk to a dead context, where deletes are silent no-ops. A new renderer has its own property maps, so CanvasTextures, DataTextures and geometry re-upload on first use; nothing needs `needsUpdate`. Art code may dispose or rebuild freely after a loss.

`core/lifecycle.js` is the single owner of `visibilitychange`, `pagehide`, `pageshow` (with `persisted` → `bfcache-restore`), `freeze`, `resume` and `focus`.
- It emits one `suspend` and one `resume {awaySec, reason, from, persisted?}` per away interval.
- `resume` and `focus` while still hidden are ignored.
- It has no unload listeners.
- `stats` exposes `{suspends, resumes, freezes, bfcache}`.
- `simulate('hidden'|'freeze'|'bfcache', ms)` is the test hook.

## Shared actors
- **`state/shipments.js`** (pure):
  - Spawns:
    - Managed lines spawn on `produced`, rate-limited per line to at least `max(kind gap, 0.9 × cycleSec)`. Units accumulate in between.
    - `pileSold` spawns a small group (3 walkers, or 1 vehicle).
  - Kinds per line:
    - walkers: Old Town lines, boutique and bistro
    - couriers: café and pet salon, plus one tip courier per L1 `courier:spawn` (the Suburbs delivery verb; only tip couriers are pickable)
    - vans: car wash; plus the harbour supply-link van, drawn straight from L1's `stats(to).supply.phase` (from → to and back)
    - boats: ferry and boatyard
    - drone: app studio
  - Each shipment carries `x0/x1/roadSec`, derived from `data/plots.js`.
  - `place(s, t, out)` → `{stage: plot|road|arrived, u}`.
  - `reseed(t)` builds a staggered in-flight set after offline time.
  - `tip(id)` runs on `courierTap`.
- **`render/actors.js`** maps `(shipment, simTime)` to a world position, which is a pure function:
  - `plot` stage: along the plot's `exit` polyline. Boats use `exitWater`.
  - `road` stage: turn onto the lane for the kind and direction (walkers on the pavement edge, vehicles in the two lanes), run to the destination gate, then shrink out.
  - Drones climb to 7 m, fly, then descend.
  - Instanced meshes, one per kind, plus blob shadows and tip-coin markers: at most 7 draw calls. Event art adds at most 4 more, and only while something is showing.
  - A chained `scene.onBeforeRender` refills the instance buffers per camera. The hero gets everything. A card camera (`camera.userData.il2Line`) gets only its own line's actors. This fixes the scaffold bug where every van showed in every card.
- **Courier picking:** `host.addPicker(actors.pick)`. Only couriers carrying a waiting L1 tip (one spawned per `courier:spawn`, marked by a spinning coin) are pickable: `{kind:'courier', id, shipmentId, lineId}`; active events get a kind-specific actor (see Event art). Line-less events (pigeon, wallet, parade, lucky) are placed in the hero's current frustum instead: the pigeon flies a path across the frame, the parade crosses the visible street with trailing walkers, and wallet/lucky take a free ground spot. They never share a spot, and they re-place into the new shot after a cut once the camera settles. Every event is pickable as `{kind:'event', id, lineId}`, and `host.anchor(event)` gives DOM bubbles a world point. The UI then calls `act('courierTap', {lineId, shipmentId})` (requested from L1 and L4).

## Event art (`render/eventart.js`)
Events are diegetic 3D actors, filled per camera from `actors.fill` (hero: all, card: that line's events).

| Event | Actor | Where |
|---|---|---|
| 🕊️ pigeon | golden glowing bird with flapping wings (vertex shader) and a sparkle trail | flies its ping-pong path across the hero frame |
| ⭐ limo | white stretch limo drives in (2.6 s ease-out), parks; red carpet + brass posts; celebrity cheers; 2 paparazzi with flashing cameras | the line's plot front (local −1.8, 4.3) |
| 🎺 parade | drum major with a flag + 6 band members (red/white jackets, caps) with drums and horns | marches the visible street stretch |
| 👛 wallet | half-open wallet with a note and coins, a pulsing glint star and an occasional sparkle | free ground spot |
| 📦 bulk | customer holding a clipboard next to a hand truck stacked with boxes | line plot front |
| 🎁 lucky | pink gift parcel with a gold ribbon, hopping with squash and stretch | free ground spot |
| ⏰ rush | 3 customers on glowing gold discs, with glints over them | line plot front |
| tip courier | scooter courier (orange scooter, rider in a helmet, delivery box) with a spinning coin, halo and glints | its shipment path |

- **Draw calls:** every prop shape is merged into ONE instanced mesh. The per-instance `iVar` picks the shape and the vertex shader collapses the rest. Townsfolk share one 24-person crowd (+ blobs). One additive billboard **halo** per tappable actor: a soft glow, a rim and a **claim-timer arc** (time left, clockwise from 12 o'clock; tip couriers have no timer). The halo ignores depth, so it stays discoverable behind buildings. Total ≤ 4 calls, 0 when idle.
- **Picking:** pick at the actor's centre, radius `max(1.5 × halo r, 2.4 m, 6.5% of distance)`. Couriers use `max(2.1 m, 5% of distance)`. `host.anchor(event)` returns the live actor centre, so the limo's DOM bubble follows it in.
- Props are built through `kit.builder`. They don't cast shadow-map shadows (the collapsed shapes would leak into the depth pass); people get crowd blobs.

## Director (`cameras.js`)
- **Shots** are about 10 s, chosen by score:
  - staleness (up to +3)
  - a full or ≥80% pile (+3)
  - a near milestone (+2)
  - an active event on the line (+6)
  - deliveries on the road (up to +2)
  - a recent purchase (+3)
  - the current shot (−5)
  - jitter
  - Home is in the mix with a low ceiling.
- **Interrupts:** `unlocked`, `milestone` and `event:spawn` cut to the line when the current shot is at least 2.5 s old (immediately when the current shot is home).
- **Pin** holds a line with a slow ±5° orbit.
- **Life-beat cut-ins:** `life:beat` overrides pin and town for 7 s (retire: 9 s), going to `e.lineId` or home, then returns.
- **Moves:** `cut(id, sec)`, `cutIn(id, sec)` and `flyTo(id)` are eased cubic glides of 1.1–2.6 s, with a height arc proportional to the travel distance. During a hold the camera drifts in azimuth (±3.5°) and pushes in 5%. Under reduced motion it cuts instead and has no drift.
- **Framing:**
  - Shot poses fit the plot's bounding box at an aspect-dependent elevation (27° wide, 33° portrait).
  - `keepInWorld` then steepens the elevation, or slides toward the town centre, until seven frame probes land on ground inside `world.bounds`. So no frame shows sky or the world edge.
  - Card rigs fit the plot width to the card aspect and get the same clamp.
- **Town mode** (`town(true)`, alias `establish(on)`): an establishing shot of every plot. It searches 6 azimuths × 4 elevations for the pose with the fewest out-of-bounds probes, then the closest. A tap uses `host.pick`; when no plot contains the ground point, `pick` falls back to `nearestPlot`. `flyTo(id)` leaves town mode.

## FX (`fx.js`)
All effects are pooled and instanced, at most 3 draw calls.
- **Coins:** 96 lit gold discs that arc, spin and bounce once.
- **Sparkles:** 96 additive octahedra that twinkle.
- **Rings:** 8 additive expanding milestone flashes.
- **`pop(lineId, 'small'|'big')`:** squash & stretch on `plot.group.scale`.

Triggers, wired by `wireRenderCore`:

| Event | Effect |
|---|---|
| bought | pop + sparkle |
| unlocked | big pop + ring + coins |
| milestone | `flash` |
| harvest | big coin burst |
| courierTap | coins at the courier |
| event:claim | sparkles |
| life:beat | sparkles at home |

`pileSold` keeps main's burst. Particle counts drop to 40% under `prefers-reduced-motion` or `settings.reducedMotion`, with no pops, and they scale with the tier `fx` value.

## Tests
- **`node tools/test-lifecycle.mjs`** (Metal):
  - (a) loss → frozen frames → restore, then CHURN: dispose every pre-loss geometry, material, texture and shadow map (three re-uploads them), still rendering, and no console warnings. CHURN makes the stale-handle bug fail every run; it was intermittent before.
  - (b) loss without restore → recreate ≤ 3.5 s (page clock), frames advance, nothing black, CHURN without warnings
  - **(f) falsification:** (b) under `?break=norecover` must fail, and it does
  - (g) four losses → `graphics:paused`, `restart()` recovers
  - (c) CDP freeze → active: the save is written on freeze, exactly one resume, every visible view repainted within 2 frames
  - (d) `simulate('hidden', 60 s)` plus duplicate focus/pageshow/resume signals: one resume, one offline credit, cash within 1% of income × 60, and resume repaints every visible view in one frame
  - (e) navigate away and back: bfcache restore repaints within 2 frames (or a cold boot credits offline time)
  - (h) 2D canvas loss repaint
  - (i) wedged rAF → watchdog → loop restarted
  - (k) overlay presenter smoke
  - (l) per-card actors add up to the hero set (no bleed), and a tip courier is pickable. It waits until the courier is 10–30% along its plot exit, so the courier is still in frame; the old ≥ 35% gate went off the edge of the tighter card framing.
- **`node tools/test-scroll.mjs [query]`** runs two profiles, each with a 5 s down-and-up scroll of the `?demo=1` world:
  - S22 Ultra portrait 412×915 (DSF 2.625, Android UA → high tier at DPR 1.5, CPU 4×)
  - desktop 1440×900
  - Budgets: frame dt p95 ≤ 20 ms, rAF work p95 ≤ 8 ms, no visible view blank > 250 ms, ≤ 250 draw calls.
  - It waits up to `GPU_WAIT` (900 s) for the local Flux/LTX queues to go idle, and labels any run where they were busy as unreliable. They share the GPU, and a busy queue turns 60 fps into 4.

## Known limits
- The bloom and shadow-cache numbers on a real Adreno 730 are unmeasured. P3 needs a phone pass with `?debug=1`.
- Boats leave along local z = −2.6 unless a harbour plot exports `exitWater`.
- Town mode quality depends on `world.bounds` and the ground or fog covering it.
- `pop()` owns `plot.group.scale`.
- Shipments are visual only; the supply-link ×1.5 is L1's and the van only shows it.
