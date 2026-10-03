# Idle Transport 2

A standalone Three.js transport management sequel. Public URL: https://yru.br8t.com/gms/3d/idle-transport2/. The original Idle Transport remains at `/gms/pwa/idleTransport/`.

Open through the site root server: http://localhost:8888/gms/3d/idle-transport2/

No build step or external package installation. Three.js is served from the existing `/gms/lib/three/0.160.0/` library.

Start with no cash or idle income. Load cargo twelve times to earn $60, then buy Golden Harvest to start your first company. Dispatch a shipment for a full-fare boost, invest in route upgrades or another vehicle, then hire a manager for full automatic fares and earnings while away. Contracts reward milestones; research improves the whole network.

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
```

Browser verification uses local Google Chrome, Node's built-in WebSocket, and the existing site server at port 8888. It writes review captures and a machine-readable report under `docs/verification/`. Chrome requires local socket/process access outside the restricted sandbox.

Regional review captures use an explicitly constructed progressed company to inspect later environments. The desktop and portrait starting captures show a fresh company. Pacing measurements in `docs/ECONOMY.md` use an optimistic automated investment policy, rather than human play.

Random opportunities begin after your first company opens. Rush orders, backhaul loads, and supplier bonuses offer a reward for a limited time. Claim an opportunity before its countdown ends; ignoring it has no penalty. These events do not run while away.
