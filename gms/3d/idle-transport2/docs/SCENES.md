# Scenery checkpoint

Status: complete; root reviewed final fresh desktop/portrait/regional captures and verified synchronized motion, timed tours, pins, and zero browser errors. Owned files: `js/scenes.mjs`, this checkpoint.

## Implemented
- API `createScenes({hero,getGame,onFocus})` returns `setRoutes`, `focus`, `setQuality`, `resize`, `destroy`, plus `debug`.
- One offscreen WebGL renderer blits into DOM-owned presentation canvases. Native CSS scrolling, sizing, border rounding, and clipping keep each scene attached to its viewport; no fixed overlay remains.
- Main and row cameras literally render the same cached scene/vehicle transforms. Route progress comes directly from `game.stats(id).progress` / state. Real fleet number controls number of vehicles (visual cap seven).
- Automatic twelve-second cycle of current region's unlocked routes; `focus(id,true)` pins. `focus(null,false)` releases pin. `onFocus(id,pinned)` updates on focus and tours.
- Sunset lighting, PCF shadows, three-layer island geology, river with light streaks/rocks, two guarded stone bridges, curved arterial road, lane paint, warehouse dispatch terminal and containers, lit windows/street lamps, rolling hill silhouettes, varied pines/orchard trees, scattered rocks/clouds.
- Nine sites: wheat fields/barn/silos/windmill/tractor; layered quarry/excavator/conveyor; sawmill/log piles/crane; factory/animated steam; port/container ship/crane; tanks/pumpjacks/flare; snowy summit/gondola; runway/aircraft/tower; rocket pad/satellite dish.
- Batched static instancing keeps draw count independent of wheat/tree/detail count. Worlds lazy created only for visible rows/focus. Quality controls DPR/shadows/30fps mode. Viewport clipping handles partial cards while preserving their camera projection.
- `?dpr=1&preserve=1` supports reproducible captures. `scenes.debug` exposes views/worlds/focus/pinned/drawCalls/frames/dpr and `snapshot(id)` with exact route progress and current truck positions for shared progress checks.

## Validation
`node --check js/scenes.mjs` passed. Root verified desktop/portrait/regional captures, shared progress, camera pins and tours, and zero console/network errors. No external textures or network dependencies.

## Resume
Inspect parent screenshots then adjust framing/color/detail in owned module as needed. Road journey helper is deterministic rounded stadium loop; truck 0 position maps exact economic progress. Interface initial render invokes `setRoutes` and focus via user camera controls. No additional work blocked on external assets.

## Visual refinement pass
Parent first capture showed overly pale ambient lighting and oversized close mountains. Refined: ambient reduced from 2.1 to .9, lower golden sun with longer contact shadows, cooler restrained rim, slate-to-peach canvas gradient sky, receding three-depth ridge layers with small foothills. Main frame remains wide while row camera now closes on the working destination. Instanced animated water glints and lead-truck headlight spill added. Syntax passes after changes; parent refreshing captures.

## Final handoff
Status: implemented, final syntax check passed. Parent browser captures after first refinement showed stronger directional shadows, warm/cool gradient atmosphere, and close site row view. Parent then requested a final fresh capture following final owned changes: reduced warm-region mountains much further (5–9 far / 3–6 middle / 1.7–3.7 foothills, lower bases); Alpine keeps higher remote snowy ranges. Farm, timber and alpine buildings now have true extruded pitched roofs, layered trim. Physical lead-truck progress is exposed via `debug.snapshot(id)`; all loaded cameras observe exactly the same vehicle Group transforms. Vehicle suspension has subtle motion and the river's animated specular glints use one draw pass.

No scenery work remains planned. Parent owns final browser validation, user status, registry/screenshot. To resume after interruption, first read parent checkpoint/CONTRACT; this module is complete and ready for review. There are no downloads, outstanding jobs, external textures or services. All owned changes are on disk, uncommitted.

## Follow-up: compositor-safe scrolling / sticky hero
Status: implemented, syntax checked; parent owns UI/CSS and browser/deployment verification.

The previous fixed screen scissor canvas architecture above is superseded. `createScenes` now creates exactly ONE unattached WebGL renderer. Every hero/route viewport gets its own absolutely inset DOM-owned 2D presentation canvas (`.transport-scene-canvas`, `data-scene-view`). The browser handles sticky positioning, smooth scrolling, card clipping and stacking natively; JavaScript never repositions these canvases against the screen.

Each visible camera renders into the bottom-left viewport of the shared source, then immediately blits its exact pixel crop to that view's presentation canvas before reusing the source for another camera. The WebGL drawing buffer retains the largest required viewport capacity and grows at most once per animation frame; window resize/quality updates reset capacity. It never calls `renderer.setSize` separately for each camera. Presentation buffers resize only when their pixel dimensions/DPR change; invisible cards retain their last image while skipping render work. Hero and row cameras still read the same cached worlds and vehicle transforms/progress. Old region presentation canvases are removed by `setRoutes`; destroy removes all presentation canvases.

Debug APIs preserved, now add `rendererCount: 1`, `presentationCount` and `sourceSize`. DOM canvas count intentionally equals the hero plus current-region rows; these additional canvases have 2D contexts and do not add WebGL renderers. Existing tests asserting one DOM canvas must assert `scenes.debug.rendererCount === 1` instead. Parent should inspect compact hero at desktop 300–360px and mobile 220/170/125px sticky states, fast row scroll and region replacements, then smoke-test public deployment.
