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

## Follow-up: tap rewards and visible growth
Status: scene expansion implemented; syntax checked. Parent owns game economy/DOM particles and final capture validation.

- New `scenes.celebrateTap(nx=.5, ny=.5)` receives hero-relative normalized coordinates. It raycasts onto the ground and emits eight gold world sparkles from a reusable pool of 24 instanced spheres lasting .85s; repeated taps reuse slots. A brief dispatch lighting pulse reinforces the action. No tap creates meshes, lights, materials or textures.
- Three prebuilt, initially hidden batched upgrade groups grow dispatch from cargo annex to Fleet Operations and Regional HQ; destination cargo piles grow too. Tiers appear at route level 5/15/30 OR fleet 3/6/12 OR stats masteryLevel 1/2/4 (10/50/500 delivery milestones in current economy). These are visible scene consequences, not additional purchases.
- Trucks now visually carry timber/aggregate/pods outbound and return with empty racks/beds; cargo lifts briefly near dispatch. Vehicles continue sharing exact economy journey progress across perspectives. Oil tanker hardware stays intact.
- Fourteen pooled subtle dust puffs trail active fleets. No per-frame geometry creation; new progression details are batched once when the world is created.
- Tall hero (240px+) smoothly leans toward the working site for six seconds during each 24-second orbit; it returns to wide framing before the twelve-second route switch. Compact hero heights keep the whole network wide. Pinning never changes the shared simulation.
- Debug snapshot adds `visualTier`, `particles`, `tapUntil`; all DOM-canvas, rendererCount, sourceSize, focus and vehicle diagnostics preserved.

Resume: parent invokes `celebrateTap` after successful tap income, owns DOM feedback and real browser validation. Scenery work is complete; do not reset the presentation canvas architecture.

## Follow-up: mobile resume recovery and business production views
Status: implemented, syntax checked. Parent forced-loss/lifecycle browser suite passed; fresh expanded-scene captures and release remain parent-owned.

### Recovery
Switched WebGL power preference to `default` to reduce mobile high-power context eviction. Context loss prevents default and stops the sole RAF; 2D presentation canvases keep their last complete image. Rendering checks `isContextLost` before entering and again before blitting, so a lost source cannot replace the retained view with black. Restoration, visibility return, pageshow/BFCache, document freeze/resume and window focus trigger a fresh buffer sizing pass, instance upload invalidation, shadow invalidation and exactly one RAF restart. Hidden/frozen pages stop painting. All listeners are removed on destroy.

`debug.loseContext()/restoreContext()` retain the WEBGL_lose_context extension across loss; `debug.suspend()/resume()`, `contextLost`, `suspended`, `recoveries`, `frames` support reproducible checks. Parent `tools/resume-test.mjs` verified three GPU losses with retained pixels/restored colored views, true browser freeze+foreground return, BFCache events and portrait resize. CDP active alone leaves a tab hidden; bringToFront correctly models real user return.

### Business activity
New `productionSite` creates a batched loading conveyor, visible open reserve bin, stock meter and six pooled loading grains/drops plus eight pooled moving commodities. Farm gets an actual combine with rotating header, distinct corn stalks alongside wheat, visible grain hopper on the truck, grain moving from harvested fields into the bin and chute into the waiting truck. Other sites retain their distinctive saw/crane/pump/excavator/ship/etc plus timber/rock/parcels/fuel movement through staging. No per-frame/per-tap meshes are created.

The shared visual economic journey now starts with loading at the business on the RIGHT for progress 0–.18; trucks depart LEFT on the front road, traverse the arterial loop and return .92–1. The same world/groups render in both hero and business cameras. Row cameras face the production/loading yard rather than duplicating the hero overview. Cargo appearance fills while loading, carries outbound and is empty returning.

Production state consumes exact economy stats: `storageLevel`, `capacity`, `stockRatio`, `productionRate`, `productionLevel`. Capacity upgrades grow and recolor storage; stock fill/meter follow the authoritative ratio (drains during loading, refills while away). Production upgrades speed the conveyor/combine. Debug snapshot exposes `production: {capacity,stockRatio,storageLevel,productionRate}` and `loading` alongside exact truck positions/progress.

Performance: directional shadow `autoUpdate=false`, with needsUpdate once per world simulation update, prevents rendering duplicate shadow maps for hero and row cameras of the same world. Resume explicitly invalidates all shadows. Portrait below600px runs at30fps, desktop highquality60fps.

### Independent mobile review
At320px, no horizontal overflow; every visible button meets44px and all first-route button centers correctly hit their own control; zero browser errors. Review capture `/tmp/transport-review-320.png` showed production yard obscured by two-row upgrade/bulk overlays on204px cards, and three stacked action toasts covering lower views. Parent informed: increase mobile scene height or reserve a narrow controls strip; reduce stacked notifications. No UI files edited by scenery agent.

### Final business-view refinements
Parent adopted compact single-line name badges, smaller bulk pills with unchanged44px hit areas and single action toast. Row camera now looks forward toz8; loading reserve bins, conveyor endpoints and meters moved behind the road toz3 on a small apron, placing the business activity above purchase overlays. At maxstorage50, bin physical growth is intentionally capped at18%width/24%height; material color and fill level communicate stronger upgrades without overwhelming the diorama.

Cargo stays empty for the entire return(.64–1) and fills only during loading(0–.18); parked loading vehicles stop wheels, suspension and dust. Loading chute checks every fleet-offset phase, so any waiting fleet truck receives cargo. Debug exposes loadingCount plus leaderLoading separately. Owned material/texture disposal is deduplicated and preserves shared module primitives. Economy cache import agrees with final`v=20261003-business3`.

Independent live Chrome320 review after camera/overlay/bin changes: viewport scrollWidth320, no undersized visible targets, all first-row button centers hit their own buttons, current economy production values match snapshot, no browser errors. Final local capture `/tmp/transport-review-320.png`; parent owns enduring final captures. Scenery task complete, all edits on disk and uncommitted. No seasonal mini-scene API added; main business staging and robust recovery took priority.

## District correction: ONE physical world (current architecture)
Status: coherent district implementation on disk, syntax checked; parent physical traffic/scene-identity/browser review active. This supersedes per-business worlds described above.

`setRoutes` now creates ONE active THREE.Scene containing every supplied business: three for a selected region, all fifteen in All operations. Cached business models are reparented into district plots, never copied into separate islands. Region/list membership changes rebuild the district geography; camera focus/tour/overview never rebuild the scene or move vehicles. The old district's road geometry, headquarters resources, batched vehicle buffers and shadow buffers are released; inactive models are detached and hold no old scene references.

One continuous broad arterial stadium loop surrounds ONE named CentralDepot group. Three one-way lanes (-1.8/0/+1.8 world-unit offsets, width7.2) reduce overlap between independently clocked routes. Region plots use balanced northwest/northeast/south positions; full-network plots follow the same expanded arterial perimeter. Site buildings, production/bin equipment, fields, cranes and terrain details remain in the same world observed by every camera. A single headquarters serves every route; business growth groups add production assets rather than extra depot copies.

Routes use composite arc-length paths: business loading bay → tangent-guided outside connector → exact analytic forward arterial lane → inside depot connector → unique central unload bay, then a forward return arc and connector back to their own business. Phase0–.18 loads, .18–.55 travels laden, .55–.64 unloads stationary at the central depot, .64–1 returns empty. Loading and depot parking stop wheels/dust. Fleet slots have unique business/depot bays; central rows use pitch1.7 fromz=-1 throughmax9.2, clear of inner arterial traffic. No economy/save changes.

ALL truck component geometry is batched across the entire district by geometry/material. The original vehicle objects and cargo/wheel hierarchy remain the source of transforms and visibility; one shared instanced pass renders those exact source transforms from hero and rows. This avoids 105 trucks producing thousands of separate draw calls. District shares ambient/rim/sun/pulse lights and one shadow pass, plus the existing single offscreen renderer and DOM-owned2D views. Mobile recovery lifecycle retained.

`overview()` is explicit district-wide view. `focus(id,true)` smoothly blends to a close business view with the arterial/neighborhood context; `focus(null,false)` starts gentle district tour. `debug.mode` and third `onFocus(id,pinned,mode)` argument distinguish overview/tour/focus.

Verification API: `debug.district` reports actual active sceneUuid, sceneCount, CentralDepot children count/UUID, allsiteIds, road length/width/laneOffsets/oneWay. `audit()` includes hero and row scene IDs, site IDs and actual vehicle IDs. `snapshot(id)` includes sceneUuid/rowSceneUuid, siteOrigin/siteBounds/loadingBay/depotBay and vehicles with uuid/worldPosition/phase/stage/onRoad/roadDistance/roadPhase/lane. `debug.pose(id,phase,index)` samples the actual production traffic path deterministically. Default snapshot/tap works in overview with no selected business. Cache query is`v=20261003-district4`.

Independent320capture confirmed exact shared scene UUIDs, nooverflow, all44px targets hit correctly, zero errors. Parent/secondary agents are reviewing traffic physical tangents, shared scene identity, all15 overview/pin framing and GPU cleanup. Final checkpoint will record review outcomes.

### District final handoff
Status: complete and ready for parent final regression/deployment. No further source edits planned.

Parent `tools/district-test.mjs` passed12 checks with zero browser errors: actual3site/1depot/1scene startup; overview default; every row same physical scene; pin/overview preserve scene identity; distinct loading/queue positions; physical phase/wrap continuity; loading/unloading at correct bays; independently measured forward road travel; identical site/vehicle object IDs in hero/rows; all15 sites in one district/depot/renderer; closeups preserve network identity. Report is `docs/verification/district-report.json`; parent extends stress sampling and repeats recovery/regressions.

Visual review of `district-overview-mobile.png` and `district-network-desktop.png` confirmed clear connected suburb, shared headquarters, arterial loop and business neighbors in closeups. Main three-site composition uses balanced rearleft/rearright/front lots; closer overview frames business/road extents. Pinning blends to a near35up/49front business camera rather than keeping a full-network zoom. Three-lane chevrons/paint and physical bay parking make flow readable. Distant hills are grounded within the rear terrain edge; production commodity instances have updated frustum bounds and inactive commodity/dust pools stop drawing.

GPU lifecycle review fixes: CentralDepot private sign texture/material/geometry and instanced buffers dispose on district replacement; all truck batch instance buffers and shadow maps release; cached business models detach from obsolete scenes. Destroy additionally disposes private dust/particle/bin/sign materials once. No additional renderer or fixed canvas introduced. All owned changes on disk, uncommitted. Root owns final test results, registry/release and user report.
