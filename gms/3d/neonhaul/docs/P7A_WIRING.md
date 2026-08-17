# P7A_WIRING — the patch P7a could not apply itself

**STATUS: APPLIED 2026-08-18 by the integration pass.** Everything below is now in the repo. The
deviations from this note, and the identifiers that turned out to be wrong, are listed in
§5 at the bottom — read that before trusting a line above it.

P7a owns `js/zones.js`, `js/missions.js`, `js/economy.js`, `tools/gates_p7a.mjs` and
`tools/sim_p7a.mjs` and nothing else. `main.js`, `save.js`, `ui.js`, `hud.js` and `minimap.js`
belong to other agents this run, so the three modules are **written, gated and balanced but not
connected to the game**. Until this patch is applied, flying the game shows no zones, no board and
no credits, and `gates_p7a.mjs` is the only thing exercising the economy.

Everything below is stated against symbols, never line numbers — `main.js` and `hud.js` were being
edited while this was written.

---

## 1. `js/save.js` — two keys, one rename

The profile already carries `credits`, `lifetime`, `tier`, `craft`, `upgrades`, `stats`. Two
changes:

```js
// in defaults()
    upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0 },   // was {} — the four §7.4.9 lines
    cellUnits: 100,                                        // NEW. UNITS, not a fraction (§7.4.1)
    stats: { jobs: 0, delivered: 0, failed: 0, distance: 0, playtime: 0,
             spentFuel: 0, tows: 0, haggles: 0 },          // four new counters
```

`merge()` already copies unknown-but-present keys correctly, and an old save missing `cellUnits`
falls back to the default because `economy.fromSave()` treats `undefined` as "full".

**Do not add a `tier` write path.** `economy.fromSave()` *derives* the tier from `lifetime` and
ignores whatever the file says, so a hand-edited profile cannot unlock a district (gate T19).

## 2. `js/main.js`

### imports

```js
import { ZoneField, createZoneVisuals, KIND, VOLUME } from './zones.js';
import { Missions } from './missions.js';
import * as Econ from './economy.js';
```

### construction — after `city` exists, before the first `frame()`

`clients.json` is already fetched by P9's manifest loader; if it is not loaded yet, fetch it
alongside `loadCityData()`. **Read the count from `clients.length`; nothing in `js/` may contain
the literal 16** (obligation T8).

```js
const clientData = await fetch('./data/clients.json').then(r => r.json());
Game.zones    = new ZoneField({ city, clients: clientData.clients });
Game.missions = new Missions({ zones: Game.zones, city, clients: clientData.clients, seed: city.seed });
Game.economy  = Econ.fromSave(S());          // credits / lifetime / tier / craft / upgrades / cell
const zoneVis = createZoneVisuals(THREE, { Q, scene });
```

`?crd=` and `?tier=` already land in the profile through `applyFlagOverrides()`, so
`Econ.fromSave(S())` picks them up — except that `?tier=` is overridden by the derived tier. If the
flag must win for testing, set `Game.economy.lifetime = Econ.LADDER[FLAG.tier-1].lifetime` after
construction rather than forcing `.tier`.

### spawn

`data/landmarks.json`'s `spawn` block already places the craft at `(40, 92, 30)` on the HUB pad.
Starting credits are **250 CRD** (`Econ.newState()`), which `save.js` currently defaults to 0 —
`fromSave` does not override an existing profile, so change `defaults().credits` to `250`.

### per-frame, inside `update(dt)` — after the `flight.update` block, before `updateHud`

```js
if (mode === 'fly' || mode === 'auto') {
  const st = Game.economy;
  const flat = Econ.tickCell(st, dt, { speed: flight.speed, boosting: !!flight.boostOn });
  Game.player.cell = Econ.cellFrac(st);          // hud.js reads a FRACTION; economy stores UNITS
  if (flat === 'flat' && !Game.towing) startTow();   // §7.4.3, below
}
const zlist = Game.zones.zonesNear(Game.player.x, Game.player.z, 1400, {
  tier: Game.economy.tier, destKeys: Game.missions.destKeys(Game.economy),
});
minimap.setZones(zlist);                          // the injection point main.js already has
zoneVis.update(dt, camera, zlist, Game.missions.task(Game.economy, simTime));
```

`zonesNear` walks an 11×11 chunk block and is memoised; measured at **0.83 ms cold, ~0.02 ms warm**
(gate T24). Call it at the minimap's rate (`Q.minimapFps`) rather than every frame if `ms.hud`
moves — it is the only P7a call in the frame path.

### docking — `§7.2`

`zones.canDock(pad, { x, z, y, speed, held })` is the whole entry test (inside the cylinder, speed
< 3.5 m/s, held 0.6 s). `main.js` owns the hold timer, the control lock, `camera.js:dockEase` and
the 1.2 s re-dock grace. On dock:

```js
Game.missions.lock(pad.key);                       // the board must not refresh under the player
const jobs = Game.missions.board(pad, Game.economy, simTime);
// -> P7b's panel. ACCEPT calls Game.missions.accept(job, Game.economy, simTime)
// -> a delivery calls Game.missions.deliver(pad, Game.economy, simTime)
```

On undock: `Game.missions.lock(null)` and `save()`.

`deliver()` returns `{ receipts, credits, promoted, tier }` — one toast per receipt and a second
toast on `promoted`:

```js
for (const r of res.receipts) toast(`+${r.credits} CRD · ${r.client.name}`, 'good');
if (res.promoted) toast(`LICENCE TIER ${res.tier}`, 'good', 5200);
S().credits = Game.economy.credits; S().lifetime = Game.economy.lifetime;
S().tier = Game.economy.tier; S().cellUnits = Game.economy.cellUnits;
S().stats = Game.economy.stats; save();
```

### the tow — `§7.4.3`

```js
function startTow() {
  Game.towing = true;
  toast('CELL FLAT — free tow to the nearest charge pad', 'warn', 5200);
  const near = Game.zones.nearestCharge(Game.player.x, Game.player.z);
  // limp at Econ.CELL.TOW_SPEED (12 m/s) toward near.pad, then:
  Econ.tow(Game.economy);                 // +15 units, 0 CRD
  Game.towing = false;
}
```
The limp is a flight-model clamp (`flight.maxFwd = 12`), not a teleport. **There is no fail state
here** — the tow is free and always available (gate T9, falsified by F4).

### `__state` (§2.7)

```js
zone: nearestZone ? { key, type, name, dist } : null,
dock: docked ? { pad: pad.key, type } : null,
job: Game.missions.task(Game.economy, simTime),
credits: Game.economy.credits,
tier: Game.economy.tier,
lifetime: Game.economy.lifetime,
cargo: Game.economy.cargo.length,
cell: Econ.cellFrac(Game.economy),
```
`__state` currently reads `S().credits` / `S().tier` / `S().lifetime` directly. Once the economy
object exists it is the source of truth and the profile is the mirror, not the other way round.

### `__game` hooks the soak needs

```js
forceDock(padKey), grantCredits(n)  -> Econ.earn(Game.economy, n),
completeJob()                       -> Game.missions.deliver(currentDestPad, Game.economy, simTime),
setZonesVisible(v)                  -> zoneVis.setVisible(v),     // T7's isolation rule
board()                             -> Game.missions.board(currentPad, Game.economy, simTime),
```
`setZonesVisible` is **required**, not optional: additive `DoubleSide` cylinders ride the same
frame the §3.2.2 dither gate measures, and obligation T7 says every layer that can contaminate that
gate must be hideable. Write it as an assertion-style hook (`tools/shot.mjs`'s `hook()`), never as
`X && X(...)` (T10).

### `hudData()` — three fields become real

```js
cargoMax: Econ.cargoSlots(Game.economy),                       // was hard-coded 3
cellMinutes: Econ.secondsLeft(Game.economy, { speed: flight.speed }) / 60,
chargeInRange: (() => {
  const n = Game.zones.nearestCharge(Game.player.x, Game.player.z);
  return n ? n.dist < Econ.secondsLeft(Game.economy, { speed: flight.maxFwd }) * flight.maxFwd : false;
})(),
```
**`HUD.CELL_PER_MIN` in `config.js` can then be deleted.** Its own comment says it is a placeholder
"before P7a lands", and it is wrong by 5×: it models 28 minutes from full where §7.4.1's cruise
curve gives **5.2**. Leaving both in place would give the dash and the holo panel two different
answers to the same question.

## 3. `js/ui.js` — the job board and the shop

§13 puts "the job board and shop in `ui.js`" in P7a's scope; `ui.js` is P6's file, so this is a
description rather than a patch. Both are pure renderers over data P7a already returns:

- **board** — `missions.board(pad, state, simTime)` → an array of jobs. Each carries
  `client{name,faction,line,tint}`, `parcel{icon,name,slots,type}`, `dest{name,districtName}`,
  `km`, `riskLabel`, `base`, `limit`, `rush`, and `bonus{maxTime,saturateAt,chain}` — which is
  every field §7.3's mock prints. 3 rows at the HUB, 2 elsewhere.
- **shop** — `Econ.CRAFT` (price, slots), `Econ.UPGRADES` (four lines, three levels),
  `Econ.upgradePrice(state, line)`, `Econ.canBuyCraft`, `Econ.buyCraft`, `Econ.buyUpgrade`,
  `Econ.buyRepair`. `canBuyCraft` returns `{ok:false, why:'licence'|'credits', short}` so the row
  can grey out with a reason instead of failing silently.
- **No `alert`/`confirm`/`prompt`** anywhere — gate T14 scans `js/` for them with comments and
  string literals stripped, and F5 proves the scan catches an injected one.

## 4. What is still untested after this patch lands

- `createZoneVisuals()` **has never run in a browser.** It is written against three.js r1xx's
  `InstancedMesh` + `CanvasTexture` API and it parses and imports cleanly in node, but no frame has
  ever drawn it. Expect to debug it. Budget: 2 instanced draws for every drawn volume plus one
  glyph plane each (≤ `Q.zonesDrawn`, 3 on HIGH) plus 2 for the world marker — **7 draws worst
  case**, against a scene currently at 43 of a 65 gate.
- §13's two browser done-criteria — a CDP script completing three deliveries, and `?auto=1`
  reaching tier 2 in under 9 minutes of sim time — are **not run**. Their node equivalents are
  gates T15/T17 and they pass with margin (tier 2 at a median of 3.0 min, p95 3.5, max 3.6 across
  240 careers), but the analytic flight model cannot see a wall the autopilot gets stuck on. Run
  them after wiring.
- The autopilot (§2.6) needs its `REFUEL` state pointed at `zones.nearestCharge()` and its `IDLE`
  state at `missions.board()`.


---

## 5. What actually landed — deviations from this note

Applied in `save.js`, `main.js`, `missions.js`, `ui.js`, `config.js`, `settings.js`, `autopilot.js`.
Everything in §1 and §2 went in as written **except**:

1. **`main.js` had no `Game.dock` / `Game.towing` slots** — only `job: null` and `radio: null` were
   reserved. Both added.
2. **`hud.js`'s job shape is not `missions.task()`'s shape.** `hud.js` reads
   `job.{client,parcel,dest,pay,timeLeft,timeTotal}` and `task.{name,km,eta}`; `task()` returns
   `{name,district,x,y,z,timeLeft,limit,overdue,parcel,client,held}` — no `base`, no `km`, no
   `rush`. `task()` now returns those three and `main.js` translates the shape, which keeps
   `hud.js` free of `missions.js`.
3. **`zonesNear` is called at `Q.minimapFps`, not per frame**, as this note's own aside suggested.
   The list, the nearest CHARGE, the active task and the minimap target all refresh together.
4. **`nearestCharge()` is NOT called from `hudData()`.** It walks an expanding radius and `hudData`
   runs every frame; `chargeInRange` reads the cached nearest charge zone out of the same list.
5. **The `?tier=` note here is right but incomplete** — setting `Game.economy.lifetime` is not
   enough, because `tier` is only recomputed inside `fromSave`. Both are set.
6. **`createZoneVisuals()` works.** It had never drawn a frame. Measured in a browser at 390×844:
   **6 draws / 462 tris** for the whole layer (budget 7), verified by difference with the layer
   hidden and restored, and the `setZonesVisible` hook is asserted through `hook()` so a missing
   one aborts rather than reporting clean numbers.
7. **Docking needed an ARM rule that is not in §7.2.** §3.1.1 spawns the craft *on* the HUB deck,
   i.e. already inside a cylinder at zero speed, so the 0.6 s hold fires on the first second of
   every session. `?auto=1` would have docked at boot and never flown — taking `gates_p2`,
   `gates_p4`, `gates_p5`, `budget.mjs` and `soak.mjs` with it. Automatic docking now arms on
   leaving a cylinder, and §7.2's own **DOCK button** covers "I am already standing on one".
8. **The board and shop render into `#ui`, not `#dock`.** `#dock` is left free for P7b's §7.3
   panel so the two can be developed without unpicking each other.
9. **The autopilot could not do this.** §2.6's `?auto=1` is a fixed 120 s route with no navigation.
   A `Courier` class was added to `autopilot.js` and a `?courier=1` flag to `config.js`; `?auto=1`
   is untouched. See `docs/BUILD_PLAN.md` §13's amended P7a line.
10. **D1 is resolved.** `PAY.LIMIT_BASE` 60 → **20** and `PAY.LIMIT_PER_KM` 77.78 → **26**, swept
    against a target distribution rather than hand-picked; `RUSH_LIMIT_MUL` 0.6 → **0.85** for the
    same reason in the opposite direction. See the block comment in `economy.js`.
