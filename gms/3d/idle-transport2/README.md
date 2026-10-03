# Idle Transport 2

A standalone Three.js transport management sequel. Public URL: https://yru.br8t.com/gms/3d/idle-transport2/. The original Idle Transport remains at `/gms/pwa/idleTransport/`.

Open through the site root server: http://localhost:8888/gms/3d/idle-transport2/

No build step or external package installation. Three.js is served from the existing `/gms/lib/three/0.160.0/` library.

Start with no cash or idle income. Tap anywhere on the main 3D scene twelve times to earn $60, then buy Golden Harvest to start your first company. Taps show floating earnings, a ripple and 3D sparkles; swipes and scene controls never earn accidentally. Dispatch a shipment for a full-fare boost, invest in route upgrades or another vehicle, then hire a manager for full automatic fares and earnings while away. Contracts reward milestones; research improves the whole network.

Expand through Meadow County, Ironworks Basin, Sapphire Coast, Alpine Frontier, and Orbital Gateway. The fifteen routes feature farms, quarries, timber yards, factories, ports, oil infrastructure, mountain supply, air cargo, and orbital freight. Use **All operations** to see the entire working network, or select a region on the world map.

Every route card and the main camera observe the same moving trucks. Auto tour highlights a different operation every twelve seconds. A route's camera button pins its main view in the stationary cockpit. The account HUD overlays this view; scrolling folds it to reveal more operations, and returning to the top restores its size. Release the pin to resume touring.

Progress saves locally. Settings provides JSON backups, import, sound, and a battery-friendly quality option. Managers earn for up to four hours away, extended to eight with Night Shift research. Prestige starts a fresh company with a permanent fare bonus.

## Resume work

Read `docs/STATE.md` first, then `docs/CONTRACT.md` and the individual `docs/SCENES.md`, `docs/ECONOMY.md`, `docs/UI.md` checkpoints. They record ownership, implementation decisions, pending work, and validation evidence. Do not overwrite unrelated changes in the site repository.

## Verification

From this folder:

```
node tools/economy-test.mjs
node tools/browser-test.mjs
node tools/capture.mjs
node tools/layout-test.mjs
node tools/tap-test.mjs
node tools/resume-test.mjs
node tools/expansion-test.mjs
node tools/district-test.mjs
```

Browser verification uses local Google Chrome, Node's built-in WebSocket, and the existing site server at port 8888. It writes review captures and a machine-readable report under `docs/verification/`. Chrome requires local socket/process access outside the restricted sandbox.

Regional review captures use an explicitly constructed progressed company to inspect later environments. The desktop and portrait starting captures show a fresh company. Pacing measurements in `docs/ECONOMY.md` use an optimistic automated investment policy, rather than human play.

Random opportunities begin after your first company opens. Rush orders, backhaul loads, and supplier bonuses offer a reward for a limited time. Claim an opportunity before its countdown ends; ignoring it has no penalty. These events do not run while away.

The Fleet planning tab lets you choose balanced Steady journeys, faster Express runs, or slower high-value Heavy haul. A policy change starts after the current delivery. Route mastery at 10, 50, 150, and 500 deliveries adds permanent fare bonuses of 10%, 20%, 30%, and 50%. Depots gain buildings and cargo as levels, fleets, and mastery grow.

Once your first company is open, quick successive taps build momentum up to 2× earnings. Loading research can double manual earnings twice more. Existing saves retain progress and default to Steady policies.


Business rows now use the full card as their live 3D view. The name, info button and camera pin float above production activity. Production, trucks, storage and manager icons sit above a thin journey-progress border. Choose ×1, ×10 or MAX underneath; bulk orders buy the affordable amount without passing track limits. Info opens detailed statistics, dispatch policies and business tool slots. The manager icon hires a manager once, then opens their office for development up to level five and one to three equipment slots.

Golden Harvest shows a combine working wheat and corn, a moving conveyor feeding a reserve bin, and trucks loading on the right before departing left. The same vehicles appear in the main view. Other businesses move their own commodities with saws, cranes, pumps and site machinery. Storage upgrades increase capacity and visibly grow/recolor the bin; its fill drains while loading and grows during the journey. Scenery remains illustrative staging linked to delivery progress, rather than a separate crop inventory simulation.

The Season tab opens **Halloween Haul**, an eight-minute side company with pumpkin, candy and ghost freight businesses. Its official window is October 15 through November 1 UTC, with practice available year-round. Six milestones award unique permanent keepsakes for character, business or manager slots. Attach/detach them in Fleet, business info or the manager office. Rewards persist through new shifts and company prestige; practice and the official season share the same one-time rewards. Seasonal coins are separate from company cash. The clock continues while away, but the shift earns no offline coins.

Mobile recovery preserves the last rendered images while WebGL is unavailable, pauses hidden rendering, and redraws on visibility, page restoration and GPU context recovery. The recovery test forces three context losses and exercises browser freeze/resume, back-forward-cache lifecycle events and portrait resizing. Chrome emulation is verified; physical Safari remains a separate device check.


The main scene is a connected transport district. Every listed business occupies a plot along a continuous one-way road around a single central depot. Overview shows the complete district; District tour and business pins move the camera within it. Business rows are closer cameras on the same physical plots, trucks and production machinery. The shared fleet loads at each business, travels to the depot, unloads, then returns empty. All operations lays out the listed network together, rather than cycling through separate miniature worlds.
