# LONGSHOT — a 3D city sniper game

You are **WREN**, a contract marksman working off a debt to a fixer called
**HALCYON**, one rooftop at a time, in **Meridian City** — until the names on the
contracts start pointing back at the people handing them out. Three.js 0.160 via
CDN importmap, **no build step**. Mobile-first (drag to look, big thumb buttons),
full desktop controls too.

Built 2026-07-11 (Fable 5). Play: `index.html`.

## The pillars

- **Two views, one rifle.** Unscoped: wide 55° look-around with the rifle
  viewmodel in frame. Scoped: canvas mil-dot reticle over a magnified FOV,
  4×–28× on a live zoom slider (pinch / wheel / Q-E). Everything you aim with —
  sway, breath, recoil, zoom — lives in `js/scope.js`.
- **Real external ballistics.** `js/ballistics.js` is pure math on `{x,y,z}`
  objects (no THREE), so **node unit-tests it**: `node tools/test_ballistics.mjs`.
  Quadratic drag against air-relative velocity (so crosswind genuinely bends the
  round downwind), constant gravity, 240 Hz integration, per-step segment tests
  against head spheres, torso capsules, building AABBs, glass panes and ground.
- **The follow-bullet cam** (`js/bulletcam.js`): a chase camera rides the round
  in slow-mo (world time-scale 0.1, 0.02 on impact) with an orbital drift, a
  trail, a doppler whoosh, and a held beat on the kill. Fires on final-target
  kills and on long headshots — not on every shot, so it never gets old.
- **The city is built AROUND the shot** (see below — the single most important
  thing in this codebase).

## ⚠️ The sightline corridor (read before touching city.js or missions.js)

A rooftop at 32 m **cannot see a street 250 m away** through a grid of 40 m
buildings — the first version of this game had literally unwinnable ground
contracts, every spawn point occluded. So the city is **generated around the
contract**, not the other way round:

1. `buildCity(scene, { seed, time, vantage:{dist,height}, groundLOS })` lays out
   the block grid, places the plaza (the **kill zone**, `city.zone`, radius
   `city.zoneR`), then picks the **perch block** at the briefed range and marks
   it `kind:'vantage'` — one solid tower of the briefed height (`city.vantageB`).
2. `capAt()` then **caps the height of every building inside the sightline cone**
   between the eye and the kill zone: allowed height ≈ `eyeY·(1 − d/Dnear) − 4.5`.
   Lots where the sightline runs under 7 m are left **empty**. The result reads as
   a natural low-rise boulevard running from your window to the mark — and it
   *guarantees* the shot exists before a single person is spawned.
3. `MissionRun.setup()` consumes `city.vantageB` / `city.zone` — it does **not**
   search for a vantage any more. Ground spawns still LOS-check
   (`_visibleGroundSpot` / `_visibleBench` / `_visibleLoop`, all via `_losClear`),
   and room/rooftop/plate/counter-sniper targets pick their building with
   `_pickBuilding(want, hWant, hW, ptOf, filter)` — nearest to the briefed range
   **with a clear line**.

`city.holes` are the carved office-room volumes: the ballistics sim passes
through a facade AABB when the impact point is inside one, so rounds actually
reach a man standing in a lit room. `city.plazaPts`/`city.benches` are kill-zone
only; `city.parkBenches` is ambient seating (civilians).

### ⚠️ The firing position — three bugs that all look identical

All three make the screen (and the whole scope) a flat brown wall while the
ballistics insist the shot is clear. If you see that, check these first:

1. **The roof slab is 1.4 m thick.** The eye goes at `best.h + 1.4 + 1.62`, not
   `best.h + 1.6` — otherwise the shooter is lying on his own gravel.
2. **`perchReach(w, yaw)`, not `w/2 − 3`.** The kill zone is usually *diagonal*
   from a square perch, and a square reaches 1.41× further across its diagonal:
   a "12 m from centre" shooter still had **9 m of his own roof** in front of
   him, exactly grazing the sightline.
3. **Props at eye height.** The perch gets `noParapet` (a 1.1 m parapet 3 m ahead
   sits precisely on a downward shot) and its sandbags rest at *ankle* height —
   put them at `y + 1.25` and they are a wall across your face.

Diagnose with a per-mesh `THREE.Raycaster` from `rig.eye` to the mark: if the
first hit isn't the target's `SkinnedMesh`, the thing it names is the culprit.

## Systems

- **The world moves while the round flies.** `simulate()` displaces every person
  collider by `vel × t` at each step, so shooting *at* a walker misses and
  **leading** him hits — locked down by a node test. (People carry `p.vel`,
  tracked in `Population.update`; the convoy passes `axis × speed`.) Get this
  wrong and every moving-target mission in the game becomes unwinnable, which is
  exactly what happened the first time.
- **Objective markers** (`js/markers.js`): a diamond + range over every live
  objective, and an edge arrow pointing at whatever is off-screen. Without them
  nobody can find a man in a city of ten thousand windows — the very first
  playtest failed on precisely this. Settings → *Target markers* turns them off.
  IDENTIFY contracts deliberately withhold the mark until you confirm it.
- **Ballistics & aiming**: drop + wind drift are real. Scopes with a rangefinder
  show `430m ▼2.1 ◀0.8` (mils of drop/drift); the OWL T5 "smart" optic draws a
  **predicted-impact dot**. Holdover tables come from `buildTable()`.
- **Breath & sway**: sway is a two-frequency wobble scaled by rifle stability;
  hold breath (🫁 / Shift) → ×0.16 sway for ~3.4 s, then you're **winded** (×2.3
  sway, heartbeat audio). `APNEA TRAINING` gear ×1.6 hold, `STEADY SLING` −25% sway.
- **Noise, panic & exposure**: an unsuppressed shot panics everyone within 70 m
  (16 m suppressed) — civilians scatter, **targets flee to the city edge and the
  contract voids**. On guarded contracts every loud shot fills an **EXPOSURE**
  bar; full = position compromised = fail. Ghillie −45%.
- **Armour**: vested targets shrug off match rounds — take the head, or bring
  **AP** (also punches glass without deflecting) or the **.50**. Glass shatters
  and deflects FMJ by 6–12 mrad.
- **Marking** (◈): a diamond over the mark. On IDENTIFY contracts you must pick
  the right suit from the decoys using the intel clues — wrong marks cost 500 and
  three burns the job.
- **Economy**: cash = pay + score×0.1 + first-clear bonus. **Armory**: 7 rifles
  (R700 → Meridian rail prototype), 4 scopes, 3 ammo types, 6 gear items.
- **Score & medals**: kill + headshot + distance (past 150 m) + moving + streak +
  no-miss + "ghost" (nobody panicked); civilian kill −2500 (two = fail). Gold at
  100% of the mission par, silver at 70%.

## Content

- **21-mission story** (`js/story.js`, 4 acts) — tutorial range → first blood →
  glass office → two brothers on a 25 s window → wind → IDENTIFY the buyer →
  moving target → convoy tyre shot + courier → night lab → **protect** the
  informant → 8-second window man → 520 m → armoured director → 3 marks in 20 s →
  exposure gauntlet → auction identify (guards) → decapitation → bodyguard pair →
  gusting rainstorm → **counter-sniper duel** (find his glint) → Aurelius Vane at
  650 m. Mission kinds: `plaza|walk|bench|room|rooftop|pair|sniper`; specials:
  `range|convoy|protect|appear|countersniper|endless`.
- **Contracts** (`js/events.js`): seeded **daily** mark (7 weekday flavours,
  streak), **weekly** 5-target gauntlet, and **THE NEST** — endless escalating
  marks, three escapes and you're out.
- **The Range**: free practice, three steel plates, no stakes.

## Art

All humans are the rigged PolyPerfect "Animated People" (28 of them: suits,
guards, street civilians) driven procedurally by `js/charrig.js` — one shared
80-bone skeleton, so ONE pose set (`idle/walk/run/panic/phone/talk/watch/guard/
sit/dead`) drives every character. **Commercial pack: no raw GLB/PNG in the
repo.** `tools/build_chars.py` packs them into `assets/chars.dat`
(`XOR(gzip(glb), keystream(name))`, key `longshot-chars-LS!aron-2026`, mirrored in
charrig.js); range-fetched per character at runtime. Everything else — city,
facades (generated window atlases, albedo + emissive), neon, sky, rain, traffic,
birds, the rifle viewmodel, the scope reticle — is procedural.

## Testing

- **Ballistics**: `node tools/test_ballistics.mjs` (drop, drift, solver accuracy,
  head/torso/building/glass hits, subsonic). Must stay green.
- **Headless**: serve the site root (`python3 -m http.server 8823`), Chrome via
  puppeteer-core with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
  Poll `window.__state` (fps/mode/mission{state,score,shots,hits,targets,plates,
  exposure}/scoped/errors); drive `window.__game` (`startMission`, `setAuto`,
  `mission`, `city`, `pop`, `rig`, `solve`).
- **URL flags**: `?nosave` `?lite` `?shot` (thumbnail stage) `?auto` (the bot
  plays: it leads movers by iterating the flight solution against their velocity
  and takes the head on armour) `?m=<id|range|daily|weekly|endless>` `?cash=N`
  `?seed=X` `?time=day|dusk|night|rain` `?nobcam`.
- Headless rAF is ~20 fps — use real waits, and **disable the page cache**
  (`page.setCacheEnabled(false)`) or you'll test stale modules for an hour.

## Files

`js/config.js` all tuning · `js/utils.js` seeded PRNG/helpers · `js/save.js`
profile · `js/audio.js` procedural Web Audio (crack + city echo, suppressed
thud, bolt, glass, ricochet, wind/city ambience, heartbeat, bullet whoosh, two
music beds) · `js/charrig.js` rigged people · `js/city.js` **the generator + the
corridor** · `js/people.js` population, routines, panic, death falls, analytic
colliders · `js/ballistics.js` **pure sim + solver + tables** · `js/scope.js` the
two views · `js/controls.js` input · `js/bulletcam.js` follow-bullet · `js/fx.js`
particles/tracers/glint · `js/missions.js` the engine · `js/story.js` 21 missions
· `js/events.js` daily/weekly/endless · `js/shop.js` armory · `js/ui.js` screens
+ HUD (popups, **never** alerts) · `js/main.js` boot/state machine/loop/bot.
