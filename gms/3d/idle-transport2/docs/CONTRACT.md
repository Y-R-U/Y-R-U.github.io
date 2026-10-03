# Idle Transport 2 implementation contract
New standalone sequel. Original untouched. Vanilla modules, shared local Three 0.160 via import map. No network dependencies.

## Module contract
js/economy.mjs exports REGIONS, ROUTES, RESEARCH, createGame().
Each region: {id,name,subtitle,color,unlockCost,requireDeliveries}. Each route: {id,region,name,cargo,from,to,color,kind,unlockCost,baseCost,baseEarn,baseTime}. kinds farm, quarry, timber, factory, harbor, oil, alpine, airport, space supported procedurally.
createGame returns {state,tick(dt),action(type,id),stats(id),save(),subscribe(fn),exportSave(),importSave(text)}.
state: {cash,totalEarned,deliveries,prestige,region,unlockedRegions:[],routes:{[id]:{unlocked,level,fleet,manager,progress,deliveries}},research:[],contracts:[],settings:{quality:'high',sound:false},lastSaved}. Optional extra fields fine. stats(id): {income,payout,duration,upgradeCost,fleetCost,managerCost,progress,active}. Progress 0..1 reflects shared real journey and MUST drive both scene views.
action types: unlockRoute,upgrade,fleet,manager,unlockRegion,selectRegion,research,dispatch,claimContract,prestige. Returns {ok,message}. subscribe receives event {type,message,...} for actions/awards. tick advances simulated deliveries and persistence offline has capped earnings.

js/scenes.mjs exports createScenes({hero, getGame, onFocus}) returns {setRoutes([{id,element}]),focus(id,locked=false),setQuality(value),resize(),destroy()}. hero and row element are DOM viewport elements. getGame() returns game instance. One transparent/fixed canvas with viewport/scissor OR bounded independent renderers; prefer one renderer. Every visible row uses same state route progress; main automatically cycles active routes every ~12s; pinned focus stays. onFocus(id,locked) updates UI. Scenes own animation frame. Use route and region colors, animated trucks/wheels/loading/crane, terrain/buildings/roads/water, shadows and atmospheric lighting. Hero can show same site from distinct cinematic camera.

js/app.mjs integrates these, owns index.html/style.css. Desktop wide editorial dashboard, warm ivory text/deep navy panels, orange/lime accents; hero big cinematic full-width; responsive portrait, live route rows with 3D viewport, upgrades/managers/fleet, tabbed World/Research/Contracts, saves import/export, prestige/settings, camera pin/autotour, guide. No huge welcome modal obstructing initial visuals. All controls 44px targets. DOM hero id hero-view. expose window.transport2={game,scenes} for smoke checks.

Root owns integration, tests, registry/screenshot, docs. Agents edit only assigned modules plus own docs checkpoint.


## Business scene expansion contract (2026-10-03)

`action(type,id,quantity=1)` and `quote(type,id,quantity=1)` support production/upgrade, storage, fleet and manager tracks with quantities 1, 10 or max. Quantity selection affects production/storage/fleet UI; manager development remains a single office action. `stats` adds productionLevel, productionRate, storageLevel, capacity, stockRatio, managerLevel and managerSlots. `stockRatio` is a staged visual reserve tied to journey progress; no separate commodity inventory exists.

`ITEMS`, `SEASON_BUSINESSES` and `SEASON_MILESTONES` are exported. `seasonInfo()`, `seasonStats(id)` and actions seasonStart/seasonTap/seasonUnlock/seasonUpgrade/seasonClaim drive the separate eight-minute challenge. equip uses `itemId|character`, `itemId|business:routeId` or `itemId|manager:routeId`; detach uses itemId. Inventory/equipment/season progress survive old-save normalization and prestige. See ECONOMY.md for caps, scopes and calendar behavior.

Full-width route cards retain `.route-view[data-scene=id]` DOM targets. The renderer keeps one WebGL context and native DOM 2D presentation canvases. It retains last good snapshots during context loss, restarts once on restoration/resume and exposes debug recovery hooks for regression. App simulation handles visibility/pagehide/pageshow/freeze/resume once per away interval. Shared module imports and HTML assets use `v=20261003-business3`.
