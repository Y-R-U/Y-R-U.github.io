# BUILD_PLAN.md — MONOPOLE v0.1

Read `CLAUDE.md` first. This file is the plan; `HANDOFF.md` is the running state.

## 1. The v0.1 loop

**System:** Tamber Reach. Orange K-star `Tamber`, low and mostly off-frame — a warm key against a
teal/amber nebula. Four places: **Ledger Station** (yours, orbiting), **Kestrel Belt** (the ore),
**Ossian** (gas giant, the limb backdrop), **Dray Yard** (theirs).

**You:** Ferrous Line, two haulers and a mining rig, 40k credits, 60k debt.
**Them:** Corvain Drayage Co. — the incumbent hauler, four ships, owns 71% of Reach freight.
**The chain:** `ore` → refined to `halide` → manufactured into `filament`. Filament burns out in
every lamp and drive coil in the Reach, so demand never stops. That is the hook, and it is the
Phoebus hook in v0.2.

### First fifteen minutes, beat by beat

| Beat | Weeks | What happens |
|---|---|---|
| 1 | — | Cold open: `flyBy` past Ledger Station's spine, camera settles into orbit on the belt. Ticker: *"Corvain Drayage 71%. You: 4%."* |
| 2 | 1–2 | Tap the belt → **Assign** panel. Send the rig. Ships animate out. Play at ×2. |
| 3 | 3–5 | Ore lands. Refinery panel: ore→halide. First revenue. Interest bites; cash dips. |
| 4 | 6 | **Quarterly results** panel. Share 4%→6%. Corvain undercuts freight 12%. |
| 5 | 7–9 | Your halide is worth more sold as filament. Buy the small **Coil Line** module for Ledger. Cash goes near-zero — the one real decision so far. |
| 6 | 10 | Filament ships. Margin triples. **Ryland Coil Works** — the brand every hauler wants — offers a supply agreement. |
| 7 | 11 | **Tactic unlock: Exclusive Supply Agreement.** Legal band. Ryland sells filament in the Reach through you and no one else, for 8 quarters, at a price floor. |
| 8 | 11 | **Story panel: Bunnings & Ryobi.** Bottom sheet, not a blocker. What actually happened, who did it, the outcome, whether it was legal. Dismiss → it lives in the Dossier. |
| 9 | 12–13 | Corvain is left selling the off-brand. Their share slides. Quarterly: you 19%, them 58%. |
| 10 | — | Ends on the monopoly meter with the next three tactics greyed and labelled — **Vertical Integration** (legal), **Below-Cost Pricing** (grey), **Specification Collusion** (illegal, the Phoebus one). |

Session target: 15 minutes to beat 10 at ×2 speed, ~13 ticks.

## 2. File map

Keep the given layout. `engine/world/ui/sim/showroom` is already the right cut and it is the only
split that makes the sim node-importable by construction. Three additions, each earning its place:

- `js/world/kit/` — the geometry builders get their own folder because there will be a dozen of
  them and `world/` also holds lighting, backdrop and the scene graph.
- `sim.mjs` at the project root — node entry point, matching `gms/3d/prismbreak/sim.mjs`.
- `content/*.js` are **ES modules exporting frozen plain objects**, not `.json`. Node `import`s
  them directly, the browser needs no `fetch` and no build step, and one loader serves both. This
  is the whole reason the sim can be tested headlessly.

```
index.html              importmap (three r0.160.0 jsDelivr, copied from FORGE), HUD, panel roots, boot
style.css               shell + HUD; UI panels bring their own
sim.mjs                 node: soak + balance runs against js/sim/, no DOM, no three

js/main.js              boot + wiring; ?shot= / ?showroom= / ?preset= / knob query params
js/scenarios.js         defineScenario/getScenario/allScenarios/frameCamera — port from FORGE unchanged

js/engine/app.js        renderer, loop, resize, systems, window.__mono          port
js/engine/quality.js    presets + knob registry                                  port
js/engine/budget.js     texture memory accounting                                port
js/engine/stats.js      perf HUD + verdict against the gate                      port
js/engine/aa.js         AA modes + output-space target                           port
js/engine/post.js       threshold bloom at quarter res + FXAA. GTAO deleted.

js/world/scene.js       owns the live star system: what is loaded, what is visible, LOD swap
js/world/backdrop.js    nebula dome, starfield, star billboard + flare, fog. The two cheapest points.
js/world/lighting.js    the one key light, the coloured fill, env intensity. No meaningful ambient.
js/world/materials.js   getMaterial(paletteId, surface) + the emissive-window atlas
js/world/palettes.js    per-faction / per-system two-hue palettes. Frozen — additive only.
js/world/kit/ship.js    shipClass() — hull kit, greeble spans, decals, running lights
js/world/kit/station.js stationModule() / station() — modular bays, one hero break
js/world/kit/belt.js    belt() / asteroid() — instanced rocks, ore veins, dust cards
js/world/kit/planet.js  planet() — limb, rim scatter, terminator
js/world/fx.js          beams, engine trails, motes, debris. All additive, all budgeted.
js/world/fleet.js       fleet() formations + the per-tick ship movement animator
js/world/camera.js      touch orbit/pinch rig, moveCamera(), flyBy(), focus()

js/sim/state.js         newGame(seed, systemId) → state; clone, serialise, migrate
js/sim/step.js          step(state, input) → { state, events }. Pure. THE contract.
js/sim/market.js        price clearing, demand curves, elasticity
js/sim/rival.js         competitor scoring + execution
js/sim/tactics.js       tactic effects, heat accrual, investigation rolls
js/sim/content.js       content.get/all/load. Imports content/*.js. No DOM, no three.
js/sim/rng.js           seeded RNG. Nothing in js/sim/ may call Math.random.

js/ui/hud.js            cash, week, share meter, speed control. Always visible, thumb-reachable.
js/ui/panels.js         definePanel/open/close. Bottom sheets. Never a blocking modal.
js/ui/story.js          the story panel + the Dossier it collects into
js/ui/knobs.js          quality panel built from the knob schemas          port from FORGE panel.js
js/ui/format.js         credits, percentages, week→quarter

js/showroom/index.js    showroom.register/run/list; the overlay; the sweep
js/showroom/entries.js  the hand-written entries that are not scenarios or panels

content/system.tamber.js  content/ships.js  content/stations.js  content/commodities.js
content/tactics.js  content/stories.js  content/rival.js  content/balance.js

tools/shot.mjs  tools/compare.mjs  tools/ratio.mjs    port; compare.mjs REFS → aaa_refs/space/refs/clean
```

**Hard rule:** nothing under `js/sim/` or `content/` may import `three`, touch `document`, or call
`Math.random`. `node sim.mjs` failing to import is the test.

## 3. Shared contracts

Do not change these without asking. Additive is fine; renames are not.

```js
getMaterial(paletteId, surface)
// 'hull' 'hullDark' 'panel' 'trim' 'window' 'strip' 'glass'
// 'rock' 'ore' 'ice' 'beam' 'engine' 'decal'

shipClass(classId, { palette, lod = 0, seed = 0 })
stationModule(moduleId, { palette, seed = 0 })
station(stationId, { palette, seed = 0 })
belt(beltId, { seed = 0, density = 1 })
asteroid(sizeClass, { seed = 0, ore = 0 })
planet(planetId, { seed = 0 })
fleet(formationId, entries, { spacing = 1 })
```

Every builder returns an `Object3D`. **Units are metres. Forward is −Z**, so `lookAt` aims a ship
with no wrapper. Ship origin is the hull centroid; station-module origin is its dock face; station
origin is the hub centre; belt and planet origins are their centres.

```js
moveCamera(app, { pos, look, fov, ms = 0, ease = 'inout' })   // Promise, resolves on arrival
flyBy(app, { keys, ms, loop = false })                        // keys: [{ pos, look, fov, t }]
camera.focus(object3D, { dist, phi, theta, ms = 700 })
camera.setTouchEnabled(bool)

definePanel({ id, title, group, render(props, api) })   // api: { close, sim, open, content }
panels.open(id, props)
panels.close(id)
panels.isOpen(id)

step(state, { actions = [], rng })   // → { state, events }; MUST NOT mutate the input state

content.get(kind, id)    // kind: 'system' 'ship' 'station' 'module' 'commodity'
content.all(kind)        //       'tactic' 'story' 'palette' 'formation'
content.load(pack)

showroom.register({ id, group, label, run(ctx) })  // group: 'scene' 'camera' 'panel' 'story' 'fx' 'fleet'
```

## 4. Scenario list — the critic's contract

Every one registers via `defineScenario` and carries its `ref`. The first eight are the gate; the
last four are stretch and are not scored in v0.1 if time runs out.

| id | ref plate | Camera | Scene |
|---|---|---|---|
| `hero_hull` | `1840080_01` | 3/4 from ~6 m above the deck plane, 32 m out, fov 46, hull runs off the right edge | One hauler. **The star is in frame upper-left and it *is* the key** — 10° elevation on the hull's far bow quarter, so it lights the deck and every forward-facing step and leaves the camera-side flank as the shadow mass. Cool fill at ~8 % of the key for planet bounce, ambient and hemi at nothing. Value runs blown deck chine → black flank → black underside. Escorts read as dark cut-outs against the star. |
| `station_night` | `8500_06` | High 3/4 looking down the dock spine, fov 50, camera tucked *inside* the structure | Ledger Station: 14 identical bays, one orange hero spine. Emissive window atlas at full density. No point lights. |
| `belt_work` | `8500_01` | Behind-and-above the rig, fov 55, beams on the frame diagonal | Two beams converging on one ore rock. Motes drifting toward the ship. Sharp rocks near, fogged rocks far. |
| `fleet_line` | `1840080_02` | Long lens, fov 28, horizon on the lower third | Nine hulls, three classes at four scales, ranks receding into the backdrop colour. Star on the centre line. |
| `planet_limb` | `244160_15c` | Wide, fov 60, subject in the lower-left eighth, 70% empty | Two haulers drifting past Ossian's limb. Rim scatter, nothing else lit. |
| `dock_night` | `8500_08` | Close 3/4, fov 45, ship parked against a lit deck | Ship lit *by* the station. Violet strip emissives are the key; no directional at all. |
| `nebula_back` | `244160_17c` | Broadside, fov 35, subject centred low | Hauler as a black cutout against the brightest nebula band. Value separation only. |
| `belt_fog` | `8500_02` | Along the belt axis, fov 50, ship in the left third | Three rocks sharp, forty suggested. Fog tinted to the nebula. |
| `station_haze` | `1840080_04` | Through a near module toward a far one, fov 45 | Dray Yard. A haze slab between the two module layers doing all the depth work. |
| `fleet_scale` | `1840080_05` | Low, looking up, fov 34 | One rig against Ledger's spine, spine running off three edges. |
| `hull_close` | `244160_11c` | 6 m out, fov 30, grazing | Panel breaks, wear, a painted company name. Nothing but surface. |
| `star_flare` | `244160_02c` | Limb as a leading diagonal, fov 55, Tamber just off frame | Planet limb + flare doing the exposure story. |

```bash
node tools/shot.mjs --shot=belt_work --w=1280 --h=720 --dpr=1
node tools/compare.mjs --shot=belt_work --round=1 --ref=8500_01
```

Always open the PNG with the Read tool. Same camera, same everything, every round.

**A key that rakes the camera-facing side has to come from behind the camera.** That is geometry,
not tuning, and it means "star in frame" and "flank lit" cannot both be specified for the same
shot. Every scenario above resolves it the same way: the star lights the surfaces turned *away*
from the camera plus whatever faces forward, and the camera-facing mass is the shadow. Swinging a
key off the star to fake it (`keySwing`) only removes the value structure — measured twice.

## 5. Showroom

`js/showroom/index.js` owns one registry:

```js
showroom.register({ id, group, label, run(ctx) })
```

- Every `defineScenario` **auto-registers** into group `scene`. No scenario can be forgotten.
- Every `definePanel` **auto-registers** into group `panel`, run with a canned props fixture from
  `content/`.
- Every story in `content/stories.js` auto-registers into group `story`.
- `camera`, `fleet` and `fx` entries are hand-written in `entries.js`: fly-bys, fleet sizes
  (1 / 4 / 9 / 24 hulls), beam density, bloom on/off A-B, quality preset sweep.

Reached three ways: `?showroom=1`, a persistent corner button in-game, and
`tools/shot.mjs --all` which renders every `scene` entry.

UI is a single full-height thumb list, grouped, tap to run, with **← →** to sweep the whole set
without going back to the list. Current entry id is written to the URL so any state is linkable
and re-renderable.

**How it stays first class:** a component is not done until it has a showroom entry, and
`showroom.list()` reports any registered scenario or panel with no entry — that count goes in
`HANDOFF.md` every round. It is also the fastest way to reproduce a bug, which is what keeps it
alive.

## 6. Tick sim

One tick = one week. Thirteen weeks = a quarter.

**Resolution order — deterministic, do not reorder.** Each stage is a pure function in its own
module.

1. Advance ETAs; arrivals dock, unload, take on the next leg
2. Production: refineries convert to capacity
3. Contract deliveries; shortfall penalties
4. Market clear: `price → clamp(base × (demand / supply) ^ elasticity)`, per commodity, per site
5. Rival decides and executes (one action)
6. Tactic effects apply; heat accrues on grey and illegal tactics
7. Investigation roll if `heat > threshold`
8. Costs: wages, fuel, upkeep, loan interest
9. Recompute share; if `week % 13 === 0` emit `quarter`
10. Win/lose: `share >= 0.50` monopoly, `>= 0.35` duopoly, `cash < -debtLimit` bust

**State** — one plain serialisable object, no classes, no references into three:

```js
{ seed, week, cash, debt, rep, heat,
  ships: [{ id, class, at, leg, eta, cargo }],
  sites: { ledger: { modules, stock }, kestrel: { yield, worked }, drayyard: {...} },
  market: { ore: { price, demand, supply }, halide: {...}, filament: {...} },
  contracts: [{ id, with, commodity, units, price, weeksLeft, exclusive }],
  tactics: { unlocked: [], active: [] },
  rival: { cash, ships, mood, lastAction },
  share: { player, rival, other },
  log: [] }
```

**Events** the world and UI consume: `depart` `arrive` `mine` `refine` `deliver` `price` `unlock`
`quarter` `investigate` `win` `lose`. The 3D never reads state — it only replays events. That is
what lets `sim.mjs` run 500 games with no renderer.

**Between ticks:** ships lerp along their route arc, mining beams hold while a rig is `worked`,
station lights breathe, motes drift. Purely visual, resolution-independent.

**Speed:** `tickSeconds` knob, default 6. Controls are pause / ×1 / ×2 / ×4 only. Speed changes the
wall-clock gap between whole ticks and nothing else, so results are identical at every speed and a
fast-forward can never desync.

**Rival:** a scored greedy over six options in `content/rival.js` — expand capacity, undercut
freight, sign its own supply deal, buy out a brand, cut costs, hold. Each has a linear score over
state terms with weights **in content, not code**. Highest score plus seeded noise wins; one action
per tick. Balance is then a data edit and a `node sim.mjs 500` re-run.

## 7. Content data shapes

```js
// content/commodities.js
{ id: 'filament', name: 'Filament', unit: 't', base: 940, elasticity: 0.7,
  volume: 1, decay: 0.04, from: { halide: 2 }, tint: '#ffb347' }

// content/ships.js
{ id: 'kite', name: 'Kite-class Hauler', role: 'haul', hold: 120, speed: 1.0,
  upkeep: 260, cost: 18000, hull: { len: 44, kit: 'boxspine', greeble: 0.6 },
  palette: 'ferrous', lights: 14, lod: [0, 900, 2600] }

// content/stations.js  (a module)
{ id: 'coilline', name: 'Coil Line', cost: 22000, upkeep: 900,
  converts: { halide: 2, into: 'filament', rate: 1 },
  mesh: { kit: 'bay', bays: 4, hero: false, windows: 220 } }

// content/tactics.js
{ id: 'exclusive_supply', name: 'Exclusive Supply Agreement', band: 'legal',
  unlock: { share: 0.12, cash: 30000 }, cost: 26000, heat: 0, duration: 8,
  effect: [{ op: 'lockBrand', brand: 'ryland', commodity: 'filament' },
           { op: 'rivalPrice', commodity: 'filament', mult: 1.18 }],
  story: 'bunnings_ryobi' }

// content/stories.js
{ id: 'bunnings_ryobi', title: 'Exclusive shelves', band: 'legal', year: '2010s',
  who: 'Bunnings & Ryobi', where: 'Australia',
  body: ['…', '…'],                 // 2–3 short paragraphs, no markdown
  outcome: 'Legal. Competitors were left with weaker brands.',
  image: 'assets/story/bunnings.jpg', credit: 'CC0',
  links: [{ label: 'ACCC on exclusive dealing', url: '…' }] }
```

Every file default-exports a frozen array. `content.load()` freezes on import so no runtime edit
can silently drift.

## 8. Build order

One agent, one component, one sitting. Each ends in something visible or a number.

| # | Component | Ends in | Critic |
|---|---|---|---|
| 0 | **Skeleton** — index.html, style.css, port `engine/*`, `scenarios.js`, `tools/*`, showroom shell | Black frame, perf HUD, empty showroom list, `--all` runs and finds zero scenarios | — |
| 1 | **Backdrop** — nebula dome, stars, star + flare, fog, `js/world/lighting.js` | `nebula_back` renders | **yes** vs `244160_17c` |
| 2 | **Materials & palettes** — `getMaterial`, emissive-window atlas, two palettes | Sphere/box lineup in showroom, `texMB` under 20 | — |
| 3 | **Ship kit** — `shipClass()`, three hulls, greeble spans, decals, running lights | `hero_hull` + `hull_close` render | **yes** vs `1840080_01` |
| 4 | **Belt kit** — instanced rocks, ore veins, dust cards, depth fog | `belt_fog` renders | **yes** vs `8500_02` |
| 5 | **FX** — beams, engine trails, motes, bloom in `post.js` | `belt_work` renders; `fxDensity` knob; perf still passes | **yes** vs `8500_01` |
| 6 | **Station kit** — modules, bays, hero break, window atlas at density | `station_night` + `station_haze` render | **yes** vs `8500_06` |
| 7 | **Planet** — limb, rim scatter, terminator | `planet_limb` + `star_flare` render | **yes** vs `244160_15c` |
| 8 | **Camera** — touch orbit/pinch/one-thumb, `moveCamera`, `flyBy`, `focus` | Fly-by entries in showroom; **hands-on on Aaron's phone** | — |
| 9 | **Sim core** — `js/sim/*`, `sim.mjs` | `node sim.mjs 500` runs 500 seeded games, no throws, prints share/cash distributions | — |
| 10 | **Content pack** — system, 3 ships, 3 commodities, 4 modules, 6 tactics, 6 stories | `content.all()` for every kind; `sim.mjs` runs on the real numbers | — |
| 11 | **UI shell** — HUD, `panels.js`, `story.js`, Dossier, knob panel | Every panel openable from showroom against fixtures, thumb-reachable | — |
| 12 | **Wiring** — tick clock, event→world replay, ship movement, beams from `mine` events | Beats 1–10 of §1 playable end to end | — |
| 13 | **Fleet** — `fleet()` formations, LOD swap, instancing | `fleet_line` + `fleet_scale` render at 1/4/9/24 hulls | **yes** vs `1840080_02`, `1840080_05` |
| 14 | **Gate pass** — showroom completeness, `--all` sweep, headed perf run, balance pass on `sim.mjs` | Scores table + perf table in `HANDOFF.md` | full sweep |

Components 1–7 are art and are ordered by value per triangle. 9–10 have no visual dependency and
can be done by a second agent in parallel with 3–7 if that is ever wanted.

## 9. Risks

**Additive transparency plus bloom on a phone.** Beams, trails, motes and dust all overdraw, and a
mip-chain bloom on top pushes fill rate past the gate — this is the failure most likely to eat a
whole round.
*Mitigation:* bloom is a **threshold pass off the main buffer at quarter res with two separable
blur taps** — three extra draw calls, not a five-level mip chain, and the emissives are already the
brightest thing so the threshold isolates them for free. Every additive material is
`depthWrite: false` with no sorting. One knob, `fxDensity`, scales mote and dust counts together,
and `showroom` carries a bloom-on/off A-B so the cost is one tap to measure. Hard rule: total
additive coverage stays under 1.5× the screen — measure it in component 5, not at the gate.

**Touch camera on a phone, one thumb.** Orbit, pinch-zoom and tap-to-select on one canvas conflict;
a pinch that starts as a drag ruins the framing, and the 3D is explicitly *not* a control surface.
*Mitigation:* the 3D takes exactly three gestures — one-finger drag orbits, two-finger pinch
dollies, tap selects — and nothing else. Every decision is a 2D panel, so the camera can never be
in a bad state that blocks play, and `camera.focus()` gets the player back to a known framing from
any panel. Test on the real phone at component 8, not at 14; if it is wrong there, one agent can
still fix it.

**Sim balance.** Thirteen ticks is a short window to make the first exclusivity deal feel earned
rather than handed over or unreachable.
*Mitigation:* `node sim.mjs 500` over seeded games, asserting the distribution: exclusivity offered
between weeks 9 and 13 in ≥80% of runs, bust rate under 10%, player share at week 13 between 12%
and 25%. All weights live in `content/balance.js` and `content/rival.js`, so a balance pass is a
data edit and a re-run, never a code change. If the numbers refuse to converge, cut the loop to one
commodity (drop `halide` as a separate step) rather than adding systems.

## 10. Amendments (manager)

Three changes to the plan above. Everything else stands as written.

**A. Components 0, 1 and 2 are one sitting.** Skeleton, backdrop and materials are small and
interlocked — the backdrop needs the renderer and the materials need the backdrop's palette to be
worth looking at. One agent does all three, then the backdrop goes to the critic.

**B. Story images may never look like a real photograph of a real company or event.** The stories
are about real, named organisations, so:

- Historical public-domain material (a 1920s bulb advertisement, a period factory photograph out
  of copyright) may be used as-is, with the source named in `credit`.
- Where no PD image exists, generate an **illustrative** image with local Flux — a stylised
  emblematic object or diagram, never a fabricated photo, never a real logo, never a recognisable
  real person or a real storefront.
- `credit` is mandatory on every story image and must say which of the two it is: `PD: <source>`
  or `illustration`. A story panel with no honest credit does not ship.

This is not legal caution for its own sake — a fabricated photo of a real company is exactly the
kind of thing that would discredit the educational layer the game is built around.

**C. No separate plan-review agent.** Reviewed by the manager against `CLAUDE.md`, the reference
board and FORGE's prior art. The agent budget goes to building instead. The review found one gap
(story image sourcing, now amendment B) and one sequencing win (amendment A).
