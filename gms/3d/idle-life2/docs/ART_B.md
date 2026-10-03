# Idle Life 2: Harbour, Downtown and Hollow's Eve art (lane L3b)

This lane builds six plots and one season skin. Every plot follows the `kit.plot` contract in `docs/ART.md` and uses `lemonade.js` as its structural template.

| Plot | District | File |
|---|---|---|
| Fish & Chips | Harbour | `js/render/plots/fishchips.js` |
| Ferry | Harbour | `js/render/plots/ferry.js` |
| Boatyard | Harbour | `js/render/plots/boatyard.js` |
| Boutique | Downtown | `js/render/plots/boutique.js` |
| Bistro | Downtown | `js/render/plots/bistro.js` |
| App Studio | Downtown | `js/render/plots/appstudio.js` |

The season skin is `js/render/season/hollows-eve.js`, and its test page is `js/render/season/lab.html`.

## Plots

Every plot has the following:
- **Live loops:** a queue or walkers, plus its staff.
- **Tiers:** three additive visual tiers (`b`/`t1`/`t2`), and a `lot` for the for-sale state.
- **Stock:** a themed pile driven by `stockRatio`.
- **Purchases you can see:** every throughput and boost purchase adds a visible prop.
- **The teen:** a teen worker appears when `stats.kid` is set.
- **Hero framing hint:** a `focus` field in local coordinates `[x, z]`.

| Plot | Live activity | Stock | L25 / L100 |
|---|---|---|---|
| 🐟 Fish & Chips | Chef at an open serving hatch. A trawler bobs alongside the quay while its derrick swings a fish crate ashore. A fisherman carries crates. Gulls dive at leavers, and one perches. | Chip cones on the counter, then fish boxes on the quay | Annex with a neon fish, picnic tables, string lights / seafood hall with a gilded fish vane |
| ⛴️ Ferry | Passengers buy at the booth, pass the turnstile (which spins per passenger) and board by the gangway. The ferry sails a closed loop out across the bay and back. It is a plot part, so the hero sees the same boat. The second-ferry purchase runs a twin half a cycle apart. Wake lines appear while it sails. | Waiting passengers on the benches (crowd density) | Blue canopy shelter, flags, timetable board / pastel terminal with a clock tower, and a bigger two-deck ferry |
| ⛵ Boatyard | A hull is built on the berth in stages: ribs with welding sparks, then planks, then paint, then rigged. It slides down the slipway and sails out. A tower crane slews a crate between the stack and the hull. | Finished yachts on trailers | Steel gantry with floodlights and signal flags / superyacht hangar on piles |
| 👗 Boutique | Mannequins on gold pedestals spin, and their outfit changes colour every turn (instanced). Shoppers queue at the door and leave carrying bags. A mansard roof with dormers. | Gold bags on a table, then pink bags in the window | Second storey with balcony and spotlights / catwalk with velvet ropes, stage lights and a walking model |
| 🍝 Bistro | Open pass-through kitchen: a chef tosses a flaming pan, plates sit under heat lamps on the pass, a waiter carries plates to tables with candles and checked cloths, and diners sip. String lights hang overhead. | Plates on the pass | Terrace planter boxes, heater, parasol / rooftop pergola dining |
| 💻 App Studio | Garage startup with the doors rolled up. Devs type at raised glowing screens, and the whiteboard has sticky notes. The server-rack LEDs blink (geometry swap). App-icon cubes float up from the desks into a cloud and pop (instanced). | App cubes in the outbox | Glass office block with a logo cube / campus tower with a spiral tube slide and a rooftop garden |

**Downtown night.** A neon blade sign on each building is lit at night (`g < 0`). Separately, `stats.nightActive` shows a small moon-and-stripes night-shift sign (`nightSign()` in `boutique.js`).

**Supply link.** `stats.supply = {on, from, to, phase}`:
- The fish van drives between Fish & Chips and the `from` plot along the north road lane.
- The `from` plot draws the parked van during phase 0.45–0.6. Only one van is ever drawn in the hero.
- The loading bays are `LINK_BAY` in `fishchips.js`, and all of them are inside the card frames.

**`exitWater`.** All three harbour plots export it, so L2 boats leave by water.

### Shared helpers
Shared helpers are named exports from my plot files, which need no kit changes.

From `fishchips.js`:

| Helper | What it does |
|---|---|
| `hullGeo` | Lofted boat hull |
| `extras` | Revealed purchase props: all sections merged into one mesh and revealed by `drawRange`, so it costs 1 draw |
| `flock` | Instanced gulls or bats |
| `lights` | String lights |
| `post` | Mooring post |
| `swag` | Rope swag |
| `ripple` | The refs' white water swirls |
| `linkVan` | The supply-link van |
| `LINK_BAY` | The loading-bay positions |

From `boutique.js`:

| Helper | What it does |
|---|---|
| `blade` | Neon blade sign |
| `nightSign` | Night-shift sign |

### Gotchas found
- **Negative AO.** Kit vertex AO goes negative below local y = 0. `k = 1 − ao·(1 − y/aoH)` drops below 0, and the part renders black.
  - Any hanging or underwater part needs either `b.ao(0)` on its builder or `aoBase` near the waterline.
  - A kit clamp would be safer (see the requests).
- **`roofGeo` under rotation.** Under `ry: π/2`, `roofGeo(w, d)` puts its width along world z. For a ridge along x, call `roofGeo(depth, width)` with `ry: π/2`.
- **`cyl` and `cone` overwrite options.** `cyl` and `cone` overwrite `ry` and `sx`/`sy`/`sz` from the options object. Pass `ry` as the positional argument. For flat cones, `b.add(S.spire(…))` with your own scale.
- **Usable card depth.** At about 30° elevation a 16:7 card shows only about 4–5 m of ground in front of the hero asset. Keep the action between z −1 and the back of the plot.

## Hollow's Eve (`season/hollows-eve.js`)
Setup: `install(world, {kit, game})`. It wraps `world.prepare` and `world.update`, so `world.js` needs no edits.

**Which views get the skin.**
- Every view whose `view.id` starts with `season:` gets it. These are L4's `season:<lineId>` views registered with `{kind: 'line', lineId: basePlot}`.
- The hero also gets it while `state.seasons['hollows-eve'].inside` is true.
- `install(..., {always: true})` skins every view, which suits a dedicated side world.

**On enter it applies:**
- **Light and fog:** the moonlit `LIGHT` (sky `#2a1e4a`→`#6c4a8e`, so the fog is the horizon colour) and `uNight` 1.3, so windows glow. Card fog is pulled in for a purple haze.
- **Dressing:** the town dressing (jack-o'-lanterns along the kerbs and doorsteps, string-light swags, hay bales, candles, cobwebs) and instanced ground mist.
- **Moon and bats:** a fog-free moon far out in the sky. It is depth-tested, so it only appears where a frame actually shows sky; current cameras show none. Bats circle the focused plot.
- **Costumes:** the base plots' crowd tops are recoloured into costume colours and restored on leave.
- **Piles:** the base plots' stock piles are hidden while the skin is on.

**Variant overlays.** These are children of the base plots, and each one's stock comes from `game.seasonStats(variantId).stockRatio`.

| Variant | Base plot | Overlay |
|---|---|---|
| **Witch's Brew** | lemonade | Purple and orange awning over the stall, an iron cauldron on a fire with instanced brew bubbles, a stirring ladle, a witch, a broom, potion bottles (the stock). |
| **Pumpkin Pie Wagon** | foodtruck | A giant lattice pie on the truck roof, a purple-glowing hatch, a carving table whose jack-o'-lantern face changes (geometry swap), pies (the stock). |
| **Haunted Haircuts** | barber | A bobbing ghost customer in the chair, floating scissors snipping, hair wisps that cycle spooky colours (instanced tint), candles, a skull sign, cobwebs. |

Measured against `refs/hollows_eve_portrait.jpg` with artgate:

| Image | Mean luma | Warm |
|---|---|---|
| Our hero | 0.38 | 3% |
| Witch's Brew card | 0.35 | 10% |
| The ref | 0.34 | 13% |

Warmth is capped by the shared window colour (see the requests).

**Two materials.** The skin creates two materials, both scoped to the skin and disposed on `dispose()`:
- one `MeshBasicMaterial` for the mist;
- one for the moon (fog-free).

## Budgets (artlab, Metal)

| Measure | Result |
|---|---|
| Cards | 37–42 calls including the shadow pass (lemonade reference: 38) |
| Heroes | 69–80 calls (≤ 90) |
| Season cards | 44–53 calls |
| Season hero | 69 calls |
| Plot statics | ≤ 14.6k triangles each (fishchips largest). Crowds dominate the remainder. |

Dynamic parts per plot:
- Fish & Chips has 4: trawler, derrick, load and supply van. The van is only visible while the link runs.
- Every other plot has 3 or fewer, plus two `extras` meshes.

## Screens and critic sheets
- Shots: `docs/art/critic/b_shots/`. These are 1560×682 cards at L25 with 3 throughput and 2 boosts, `night_*` at 22:00 with the night shift on, `season_*`, and `season_hero` at 768×1344.
- Blind sheets: `docs/art/critic/*_rb1.png`. The answer key is appended to `docs/art/critic/KEY.md`.
- Re-render one shot:
  - `node tools/artshot.mjs out.png "view=card&plot=ferry&tod=9&frames=300&vt=1&thr=3&boosts=2" 1560 682`
  - For season, supply and night views, use `js/render/season/lab.html`. It takes the artlab params plus `variant=witchbrew|pumpkinpie|hauntedcuts`, `inside=0|1`, `season=0`, `night=1` and `supply=ferry|boatyard&sph=0..1`.

### Honest self-scores vs the refs
Self-scores run 1.5–2 points high, so read these with that in mind.

| Plot or view | Score |
|---|---|
| Fish & Chips | 6 |
| Ferry | 5.5–6 |
| Boatyard | 5.5 |
| Boutique | 6 |
| Bistro | 6.5 |
| App Studio | 5 |
| Hollow's Eve cards | 6 |
| Season hero | 5.5 |

What still separates us from the refs:
1. The water is pale grey in cards; the refs' water is turquoise.
2. The global soft bounce and bloom are missing.
3. The hero frames these set-back plots high in the frame, behind the street.
4. App Studio's identity is still weak (garage box).
5. The Ferry's upper deck reads flat from 30°.

## Art round 3B (2026-10-03): critic r2 fixes

Critic r2 ranked these plots worst (boatyard 4, ferry 4.5, appstudio 4, fishchips 5, bistro 5, boutique 5.5). This round fixes composition first, then the hero prop.

**Kit-level bug found and fixed in my file.** `hullGeo` (fishchips.js) was inside-out after art round 2's `shape.loft` winding fix: every hull showed its far inner wall, with the near side see-through. The ring order is now reversed. This fixes every hull, including the trawler, yachts, dinghies and the ferry. Hull decks now render, because the closing quad faces up. `kit.vehicles.boat` lofts the same way and should be checked (see the request in CONTRACT.md).

**New shared helper: `fq(m, a, b, c, d, col)`** (fishchips.js). It draws a flat water quad that always faces up. Half of the old foam and wake quads faced down and were culled, including one side of every wake.

**Card camera gotcha.** The card distance is `max(|pos − look|, fit(cardW))`. On these plots `|pos − look|` usually wins, so `cardW` alone does not move the camera: change `pos`.

| Plot | What changed |
|---|---|
| Ferry | Chunky 10.6 m boat. Hull, two-deck cabin, wheelhouse and funnel read as one form. It docks bow-west (camera-left, like card_ferry.jpg), clear of the quay wall so the red hull side shows. Ramped gangway, quay foam strip, a foam collar on the hull, and a breakwater with a red and white beacon for horizon context. The foreground is cleared: shelter, bunting and clock moved off the boat. Ticket windows face east, so the queue shows 3/4 faces. Benches face the camera. Luggage trolley and a painted ferry sign. |
| Boatyard | Tower crane, jib, hook and gantry removed. The hull is scaled 1.32 with red topsides and a navy bottom: one focal point on the slipway. Floodlight masts moved behind the berth. Quay foam, slipway foam and wake. Elevated 3/4 camera. Drums, rope coil and an upturned dinghy fill the empty quay. |
| App Studio | Warm apricot garage, not cold green, with a two-bay cream-framed front. Devs sit at laptops facing the camera. Pendant lamps and plank floor. Roof clutter (solar, dish, cloud, hammock, gems) replaced by one big app-icon sign and two planters. App icons now arc from the laptops into an outbox (the stock). Contact shadow, tree and bench. |
| Fish & Chips | Camera centred on the shopfront, which now fills the card. Bigger chip cones. Fish-and-chips meals on the picnic tables. The neon fish is mounted on the annex front instead of on stilts. Lighter roof. The L25 picnic moved out of the foreground. |
| Bistro | Elevated 3/4 camera. Softer pastel brick, rose and check colours. Terrace moved back so no heads are cropped. Heater moved off the kitchen. Street walkers moved to the far pavement. |
| Boutique | The base building is now two storeys with real depth: pilasters, string course, window reveals with pediments, cornice, and a mansard roof with dormers. The old L1 roof poked dormers through the L25 storey (tiers are additive), so L25 is now a balcony with window awnings. Legible sign: a cream board in a gold frame with a hanger and dress mark. Bigger two-ball topiary. Bench moved out of the foreground. |
| Hollow's Eve | **Bug:** the skin called `rig.apply` but never `kit.setLight`, so the shader lamp pools (`uLampK`) were off inside the season. Now `LIGHT.lamps = 1`, and the 8 lamp slots are fed with the nearest world lamps plus season lanterns and pumpkins. New one-draw additive warm glow pools under every lit pumpkin. Bluer, richer purple. Paper-lantern strings at ±6.6 m around each Old Town plot and across the road. Pumpkin clusters at plot fronts and on the far kerb. Warmer, dimmer string bulbs. The kerb string that crossed card foregrounds is removed. |

Night windows on the ferry and the boutique's upper floor use a half-height warm pane in front of the glass, so they glow at 22:00.

**Budgets (artlab, Metal, 1560×682, L25):** cards 32–36 calls (boutique 36; the wider frame shows more town chunks), season hero 70–77, season card 70. `test-boot` passes, and the real game (`?demo=1`, 412×915) shows no exceptions.

**Measured.** Season hero: luma 0.31 (ref 0.34), warm 10.5% (was 3%), violet and blue 62% (ref 65%). It is still more saturated than the ref (0.55 vs 0.44).

**Blind sheets:** `docs/art/critic/*_rb3.png` (6 plots + `hollows_hero`), key `KEY_rb3.md`. Shots are in `docs/art/critic/b_shots/rb3_*.png`, plus `rb3_hollows_portrait.png` and `rb3_witchbrew.png`.

**Honest self-score** (runs 1.5–2 high): ferry 7, boatyard 6.5, fish & chips 6.5, bistro 6.5, boutique 6.5, App Studio 6.5, Hollow's Eve hero 6.5.

Remaining gaps:
- The world sea is one flat tone (request filed).
- The boatyard deck still reads as a large flat tan plane.
- The ferry card has no true horizon, because a 16:7 card at 27° cannot reach it.
- The Hollow's Eve cobbles stay pink-lilac, because the town palette is R3A's.

## Art round 4B (2026-10-04): critic r3 fixes

**Water.** New shared `seaPlane(kit, P, opts)` in fishchips.js, used by all three harbour plots: one transparent draw per plot over the world sea, irregular triangle grid, per-triangle (flat-varying) wave normals so facets shimmer and catch sun/env, depth gradient from the quay wall (turquoise shallows → teal → far), animated broken foam along the wall, foam collars and soft AO round hulls, V-wakes plus churn behind sailing hulls, desaturated at night. Hulls register with `sea.hull(i, x, z, ry, halfLen, halfBeam, k, wake)` / `sea.off(i)`; the registry is shared, so overlapping planes in the hero draw identical pixels (no seams). Card views hide other plots, so every plane has a fading skirt (±16 m, 28 m on the outer harbour ends). Old geometric quay foam/ferry collars removed; static swirl ripples kept. `hullGeo` is now smoothed (`soft`, n 15).

**Shared `lights()`** rewritten: chunky warm teardrop bulbs with dark caps on a 14-segment catenary wire (min radius 0.075). Affects every plot and Hollow's Eve.

| Plot | Changes |
|---|---|
| Ferry | New smoothed hull (white sheer band, black rubbing strake, red topsides, white boot stripe, navy bottom, sheer + flare), portholes, framed cabin windows with warm interior strip (glows at night), navy door, striped life rings (real tori), rails, wheelhouse with nav lights and mast/flags, banded funnel, lifeboats on davits, deck benches, winch/bollards, bow and stern flags. Route narrowed to stay over the plot water. Benches moved back, camera pulled out: no cropped passengers. Waiting room (L25) removed (was cut at the edge). |
| Fish & Chips | Front-on lower camera on the shopfront; annex roof now mustard and ridge along x (no blue-on-navy overlap); trawler moved east, out from behind the annex. |
| Boatyard | Yachts get stanchions, lifelines, portholes, pulpit, stays; floodlight masts rebuilt at sensible scale (grey poles, hooded heads); street lamp moved off the berth; shed moved in so it isn't cut. |
| App Studio | Apricot walls with darker pilasters/plinth, cream cornice with dentils, glowing bright interior; roof terrace (parasol, beanbags, planter, bush, string lights) and the app sign on the front parapet; L25 office now a lilac block with cream mullions behind-right (no grey/yellow tower); L100 tower moved back; tree/bench off the edges; walkers moved back. |
| Boutique | Fresh mint facade, lilac-slate mansard, teal window reveals; queue runs along the shop, leavers walk away from the frame bottom. |
| Bistro | Chunkier lights, lamp post removed, umbrella over a table, left table beside the building, tables cleared off the pass, camera pulled back. |
| Hollow's Eve | Brighter violet fill + sun (facades readable), warm orange rim light and crowd rim (characters rim-lit, no near-black costumes), lamp pools at 0.4 with a yellower lamp colour (restored on leave), pumpkin glow pools smaller/fainter, chunkier string lights. |

**Budgets (artlab, Metal, 1560×682, L25, tod 9):** fishchips 36, ferry 33, boatyard 33, boutique 36, bistro 35, appstudio 32; ferry night 35; ferry hero 77; season hero 72. `test-boot` PASS; real game `?demo=1` S22 412×915 pinned to ferry: zero exceptions/console errors.

**Blind sheets:** `docs/art/critic/*_rb4.png` (6 plots + `hollows_hero`), key `KEY_rb4.md`, shots `docs/art/critic/b_shots/rb4_*.png`.

**Honest self-score** (subtract 1.5–2): ferry 7.5, fishchips 7, boatyard 7, boutique 7, bistro 7, appstudio 6.5, Hollow's Eve hero 6.5.

Open: Hollow's Eve hero still shows no sky/moon (hero cameras never frame sky) and the town's blue roofs read electric under violet light (R4A palette); cards' lower third is still plaza paving; world sea outside the harbour is flat (request in CONTRACT).
