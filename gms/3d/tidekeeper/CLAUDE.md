# Tidekeeper — aquarium management, one HTML file

`gms/3d/tidekeeper/index.html` is the entire game: styles, markup, shaders,
simulation, UI. The only external thing is three.js, and it is **vendored**
at `../../lib/three/0.180.0/` via an importmap, not fetched from a CDN. A bare
CDN `import 'three'` takes the whole module graph hostage to one network fetch,
and when it stalls the page shows a loading screen forever with no console
error. Do not "simplify" that back to a CDN.

An inline classic `<script>` boot gate sits before the module and reports a
failed import on the loading screen, with a reload that busts the cache. A
module that fails to parse cannot report itself, which is why the handler
cannot be a module.

## Where things are

The file is sectioned with numbered banner comments; search for them:

| § | What |
|---|---|
| 1 | `SPECIES` — 18 rows. `body` drives the mesh, `care` fields drive chemistry, `traits` drive interactions. `RELATIONS`, `PLANTS`, `DECOR`, `UPGRADES`, `FOODS`, `TANKS` follow. |
| 2 | Water: `stepChem` (nitrogen cycle, O₂, pH, algae), `stepBiology` (hunger, growth, disease, breeding, death), `stressOf`, `ecosystemHealth`, `crowdAppeal`, `evaluatePlacement` |
| 3 | Procedural fish geometry: `profile`, `patternAt`, `buildFishGeometry`, plus `buildJelly` / `buildSnail` / `buildShrimp` / `buildSeahorse` |
| 4 | `fishMaterial` (the swimming shader) and `SpeciesBatch` |
| 5 | `World` — tank, sand + caustics, god rays, water surface, glass, plants, decor, bubbles, crowd, lighting |
| 6 | `updateAI` — boids plus a steering brain per `behaviour`; `canEat` / `findPrey` are the single source of truth on predation |
| 7 | `Audio` — everything synthesised |
| 8–9 | `Orbit` camera, bloom and the photo-mode DoF/grade pass |
| 10–11 | `Game` (modes, economy, events, objectives) and `UI` |
| 12 | `boot()` |

## Units

**One world unit is ten centimetres.** Tank dimensions, fish length (`len/10`
is the model scale), plant heights and the people in the gallery all obey it.
Breaking this is what made the first build look like a doll's house with
whale-sized tetras.

## Test hooks

- `?shot=1` — a dressed 300 gallon reef with the HUD hidden, for thumbnails
- `?lite=1` — no bloom, fewer particles, DPR capped
- `?auto=1` — plays Survival badly on purpose, to exercise the sim
- `window.__TK` is the `Game`; `window.__TK.api` exposes the pure functions

## The Node harness — use it

Browser soak-testing cannot cover weeks of chemistry: one in-game day is 90
real seconds, so a 30-day cycle is 45 minutes of wall clock at 1×. Extract the
module and run the simulation in Node instead — that is how the original
balance was set, and it found four real bugs a screenshot never would (food
with no nutrition in it, ich with no recovery path, corpses producing 60 ppm
of ammonia, and a bacteria model that could never drive ammonia to zero).

```js
// pull the <script type="module"> body out of index.html, drop the three
// imports and the trailing boot(), prepend a Vector3 stub + DOM stubs,
// append an export list, then step it:
//   T.hour += 24*STEP; stepChem(T, STEP); stepBiology(T, STEP, G);
// with STEP = 1/96 (quarter-hour ticks) and a stub G whose onDeath logs
// deathReason(T, f).
```

Things the harness should keep proving:

- Six neons in a new 20 gal with a 30% change every two days: **all six live**,
  ammonia humps around day 1–2, nitrite humps around day 3–5, cycled by day 8.
- The same tank with no water changes: **they die around day 5**, of nitrite.
  That difference is the whole tutorial.
- Six adult goldfish in a 20 gal: dead inside a day. In a 125 with a canister:
  fine, with nitrate climbing about 1 mg/L per day.
- Bright light, high nitrate, no plants → algae past 0.2 in three weeks.
  The same tank heavily planted → nitrate 0, algae 0.

## Balance gotchas

- `bactA` / `bactN` are **colony maturity 0–1**, not concentrations. They grow
  whenever their substrate is being processed and fade slowly when it is not.
  Processing is a flat rate (`capA * bactA`), deliberately *not* Monod — that
  is what lets a mature filter hold both toxins at exactly zero and stops an
  overstocked one from ever catching up.
- Per-litre scaling is load-bearing. Waste, oxygen demand and plant uptake are
  all scaled by tank volume; drop one of those and big tanks stop being more
  forgiving than small ones, which is the whole reason to buy a big tank.
- `stressOf` should read about 1.5–2.5 on "bad but survivable" water and only
  pass 3 when it is genuinely lethal. The health curve is tuned against that.
- Additive `ShaderMaterial`s must **not** premultiply: three's AdditiveBlending
  is `(SrcAlpha, One)`, so writing `vec4(rgb * a, a)` squares the contribution
  and the god rays vanish.
- The global `canvas { position: fixed }` rule is scoped to `#gl`. Unscope it
  and every shop-card icon stacks in the corner of the viewport.

## Still open

- Species icons on the shop cards are 2D traces of the same `profile()`
  function the meshes use, so they stay honest if a silhouette changes.
- No cloud save; `localStorage` under `tidekeeper.save.v1` holds the Aquapedia,
  career progress, star ratings and best scores.
