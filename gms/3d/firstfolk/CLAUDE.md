# FIRSTFOLK — a god-game village sim (Populous × The Settlers)

Shape the land. Shepherd the folk. You are the unseen hand of a young island
god: sculpt terrain like Populous, and your little folk — fully autonomous like
The Settlers — forage, chop, farm, quarry, haul, build and pray. Grow the tribe
through five Ages (each adds rules, buildings, miracles and threats) and raise
the Monument to win. Three.js 0.160 importmap, **no build step**, mobile-first.
Built 2026-07-06 (Fable 5) on the Towered/Deadtown/Who-Am-I template family.

## Design pillars

1. **The Hand and the Land** (Populous) — you never control a villager. You
   sculpt the island (raise/lower/flatten/smooth), place building plots, paint
   leylines and cast miracles. Terrain IS the strategy: buildings need flat dry
   land, quarries need rock faces, farms want lowland.
2. **Little lives** (Settlers) — villagers are autonomous: they claim tasks,
   walk real A* paths, visibly carry goods (log/stone/food props), and build
   stick-by-stick. Watching is the game.
3. **Rules that grow** — Age I is just food+wood+huts. Each Age unlocks one
   layer: farming → stone+wolves → faith+raiders → the Monument.
4. **Faith is mana** — villagers pray at fires/temple **at night** (the novel
   day/night rhythm: work by day, pray+sleep by night; faith motes stream to
   the sky). Sculpting and miracles spend faith.

## The Ages (unlock ladder)

| Age | Advance when | Unlocks |
|---|---|---|
| I — Hearth | start | sculpt, Hut; villagers forage berries + chop trees |
| II — Field | pop ≥ 8 | Farm, Lodge (forester), **Leylines**, miracle Rain |
| III — Stone | pop ≥ 14 | Quarry (needs rock face), Storehouse, miracle Sprout; **wolves at night** |
| IV — Faith | pop ≥ 20 ∧ stone ≥ 10 | Temple, Watchtower, miracle Smite; **viking raids** |
| V — Wonder | pop ≥ 28 ∧ temple | Monument (3 stages + consecrations), miracle Sunburst; bigger raids |

Win: consecrate Monument stage 3 (ascension cinematic). Lose: everyone dies.

## Economy

Resources: **Food · Wood · Stone · Faith** (faith capped per Age). Goods only
count when hauled to the campfire/storehouse radius. Villagers eat at dawn
(starve → hp drain → gravestone). Births need free housing + food surplus;
children grow up in ~70 s. Buildings employ dedicated workers (farm 2, lodge 1,
quarry 2, temple 1 priest, watchtower 1 guard) — the unemployed are
generalists (forage/chop/haul/build, deficit-weighted).

## Novel bits

- **Leylines** — paint glowing paths on the land (faith cost): villagers walk
  them ×1.45 faster and shed a faith trickle; they pulse at night. Divine
  roads, drawn with the god-hand.
- **Prayer nights** — at dusk everyone walks to the fire, prays (faith motes
  rise), sleeps, eats at dawn. Guards keep the night watch. Raids and wolves
  hit the rhythm you've built.
- **Living terrain** — vertex-coloured strata (sand/loam/grass/rock) recompute
  as you sculpt; sculpting under trees uproots them into collectable logs.

## Asset protection (same scheme as towered/whoami/deadtown)

PolyPerfect packs are commercial — **no raw GLB/PNG in the repo**; everything
is in one obfuscated blob. `tools/build_pack.py` reads the local-only caches
(`app/3d/gallery/models_all/`, `~/cc/assets/3d/public/assets/chars_rigged/`)
→ `assets/pack.dat` + `pack.index.json`. Entry = `XOR(gzip(raw),
keystream(name))`, keystream = xorshift32(fnv1a(KEY+':'+name)).
KEY = `firstfolk-lpup-9Ff!aron-2026` (must match `js/assets.js`). Statics are
re-skinned onto the shared gradient+specular atlas material; RIGS load raw.
Change the model set → edit MODELS/RIGS → `python3 tools/build_pack.py`.

## Characters

All villagers/raiders are **rigged PolyPerfect people** (one shared 80-bone
skeleton), driven procedurally in body space via `buildRig` (`js/rig.js`, the
proven deadtown driver). Poses in `js/villagers.js`: idle/walk/chop/carry/
build/sow/pray/sit/flee/fight. Job → model: generalist = casual/farm mix,
forester = lumberjack, farmer = farm, builder = carpenter, priest = wizard,
guard = knight, raiders = vikings, children = boy/girl (scaled, grow up).
Carried goods are props parented to the group; tools attach to the elbow bone.

## Files

`js/config.js` all tuning (ages, buildings, jobs, miracles, cam, econ) ·
`js/utils.js` helpers · `js/assets.js` pack loader (port) · `js/rig.js` bone
driver (port) · `js/terrain.js` sculptable heightfield island: gaussian
brushes, vertex colours, walkability/flatness/slope queries, water + shore,
serialize · `js/world.js` day/night sky + sun/moon/stars, lights, decor
scatter (trees/bushes/rocks — choppable), leyline canvas + speed field,
ambient sheep/deer · `js/villagers.js` FSM + poses + needs + combat ·
`js/jobs.js` task selection (claims, priorities, deficits) · `js/pathfind.js`
A* over the cell grid (slope + leyline costs, LoS smoothing, repath on
sculpt) · `js/buildings.js` ghost placement validity, construction (fetch +
hammer), production ticks, monument stages · `js/powers.js` sculpt/leyline
tools + miracles (Rain/Sprout/Smite/Sunburst) + faith economy · `js/raiders.js`
wolves + longboat raids + theft/torching · `js/fx.js` smoke, motes, rain,
lightning, fireflies, leaves, floaters, dust · `js/ui.js` HUD chips, faith
bar, clock dial, toolbar modes, build sheet, miracle bar, info cards, toasts,
tips, help · `js/menus.js` title/win/lose · `js/audio.js` synth sfx + ambient
day/night + generative music per Age · `js/main.js` boot, loop, saves, URL
modes, `?auto` god-driver, `window.__state`/`__game`.

## URL modes & testing

`?nosave` don't touch saves · `?shot` staged thumbnail (HUD hidden) · `?lite`
no shadows/low decor · `?auto` god-AI soak driver (sculpts, builds, advances
ages, defends) · `?speed=N` force speed · `?age=N` start at Age N with a
staged village · `?day=0.5` set time of day.

Headless: `python3 -m http.server 8815` from site root + puppeteer-core
(`--use-angle=swiftshader --enable-unsafe-swiftshader`), load
`/gms/3d/firstfolk/?auto=1&nosave&speed=3`. Poll `window.__state` (fps, pop,
stocks, faith, age, day, jobs, buildings, tasks, errors[]) and drive
`window.__game` (game/terrain/world/villagers/buildings/powers/raiders/ui).
Headless rAF is throttled — use real waits + `window.__game.step(dt)`.

## Design numbers (see config.js for the source of truth)

- Grid 96×96 cells, CELL=2 (192 m island, sea y=0, land ≤ ~13 m).
- Day = 120 s at 1×. Dusk 0.60→prayers; sleep 0.78→dawn 0.05; eat at dawn.
- Costs: hut 12w (houses 4) · farm 20w · lodge 16w · storehouse 24w6s ·
  quarry 20w · temple 30w20s · watchtower 14w10s · monument 3×(25w35s+60 faith).
- Tree→4 wood, bush→5 food (regrows), plot→10 food, quarry chip→4 stone.
- Faith: pray 0.4/s (temple ×2), leyline trickle, caps 30/60/100/160/240.
- Sculpt 0.05 faith per corner-metre (~3/s full brush); Rain 20 · Sprout 30 · Smite 15 · Sunburst 60.
- Combat: villager 20 hp · guard 40 (bow 8 rng 14) · wolf 25 · raider 35;
  watchtower arrows 6 dmg rng 16; smite kills.
