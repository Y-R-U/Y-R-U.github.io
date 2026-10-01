# Lane 4 (GAMEPLAY / MOBS / SURVIVAL) notes

Owner of `js/game/*`, `js/data/items.js`, `js/data/recipes.js`, `tools/game_*`.

Status (2026-10-02): **M1, M2 and the journal/farming wave done.** `node tools/game_test.mjs` → 620 passed (also runs `tools/game_test_m2.mjs` and `game_test_m3.mjs`).
Verified in the real game (`?noshell=1&q=low`, station panels with `?shot=1&q=low` so lane 5's CSS loads).
Also owned: `js/game/stations/*`, `css/stations.css`, `js/data/loot.js`, `js/game/journal/*`, `css/journal.css`, `js/game/farm.js`.

## Files
| File | What |
|---|---|
| `js/game/index.js` | `init(ctx)` builds `ctx.game`; per-frame `update(dt)`; player adapter; death → Memory Cache; mode switch |
| `js/game/inventory.js` | `Inventory` (pure). Amounts are stored in **64ths** (`slot = {id, n, f, dur?}`), so a 0.25 sub placement costs exactly 1/64 |
| `js/game/survival.js` | `Survival` (pure): Integrity/Charge/air, power-droop, regen, starvation, drowning, fall maths, eating. `TUNING` holds every number |
| `js/game/rules.js` | pure `breakTime`, `canHarvest`, `requiredLevel`, `dropsFor`, `meleeDamage` |
| `js/game/drops.js` | pickups (2 InstancedMeshes: block cubes + item gems, cap 128 each) + Memory Cache beacons |
| `js/game/env.js` | world queries: `lightAt` → `{sky, block}`, `liquidAt` (water **and** kelp), `solidFn(() => ctx.world)` |
| `js/game/mobs/index.js` | `Mobs`: spawn/despawn/caps, voxel physics + step-up 1, drop/water avoidance, LOS, raycast, hit, EMP |
| `js/game/mobs/kinds.js` | ibis / glitchfuse / reboot behaviour + animation (telegraphs live here) |
| `js/game/mobs/models.js` | procedural models: merged boxes, baked face shading in vertex colours, geometry cached per kind |
| `js/data/items.js` | `createItems(BLOCKS)`: block items reuse block ids (1..255), others ≥256. 5 food, 5 materials, 16 tools |
| `js/data/recipes.js` | M2 prep: fabricator `RECIPES`, `OVEN`, `available(items, inv, stations)`, `make(items, inv, recipe)` |
| `tools/game_test.mjs` | node tests: items, inventory, fractional cost, a simulated day+night, break times/drops, recipes, mob AI on a stub world |
| `tools/game_mobview.html` | standalone mob viewer: `?mob=<kind>|all|m2&t=day|night&fuse=0..1&atk=0..1` (atk freezes each kind's telegraph)`&size=&walk=1&live=1&d=` |

## ctx.game API
```js
game.items                     // registry: get(id|key), id(key), palette(), list, KEY
game.inv                       // Inventory (below)
game.survival                  // integrity, charge, air (0..10), dead, invuln, trickle, droop, underwater, eatProgress
game.mobs                      // list, spawn(kind,x,y,z), raycast(origin, dir, maxDist) -> {mob, dist} | null,
                               // hit(mob, dmg, dir, src='player') -> bool, box(mob, out), clear()
game.drops                     // spawnItem(idOrKey, n, x, y, z), caches[], clear()
game.update(dt)  game.start(saveData|null)  game.save()  game.load(data)
game.breakTime(mat, held = inv.held(), scale = 1)   // seconds; 0 in build mode; Infinity for hardness -1
game.canHarvest(mat, held)  game.dropsFor(mat, countSubs, held)  game.meleeDamage(held)
game.attack(mob, dir)          // melee: damage from held tool, wear, Charge cost. Lane 3 already calls this
game.hurtPlayer(amount, src, knock{x,y,z})
game.respawn()  game.setSpawn({x,y,z})  game.sleep(pos)   // sleep = set spawn + skip night (sky.setTime(0.27))
game.spawnMob(kind, dist = 4)  // test hook: spawns in front of the player
game.creative                  // session.mode === 'build'
```
Inventory: `slots[36]` (0..8 hotbar, 9..35 backpack), `sel`, `select(i)`, `held()`/`view(i)` →
`{slot, id, n, count, frac, dur, maxDur, item, block, infinite}`, `consume(n)` (fractional ok, held slot first then other
stacks of the same item), `canAfford(n)`, `count(id)`, `add(id, n)` → overflow, `removeId(id, n)`, `move/swap/split`,
`setSlot(i, id, n)`, `wear(slot, amount, neverBreak)`, `takeBackpack()`, `addSlot(slot)`, `fillCreativeHotbar(ids)`.
Build mode: `inv.creative = true`, consume never decrements, the hotbar is filled from `items.palette()`; the survival
inventory is stashed and restored if the mode flips back.

Bus events emitted: `inv:change {slots}`, `inv:select {slot}`, `inv:break {slot,id}`, `player:damage {amount,src,dir}`,
`player:heal`, `player:death {src}`, `player:respawn {pos}`, `player:eatStart {id,dur}`, `player:eat {id,charge}`,
`player:eatStop`, `player:spawnSet`, `player:sleep`, `item:pickup {id,n}`, `mob:hit {kind,dmg,src,id}`,
`mob:death {kind,pos,src}`, `mob:fuse {mob}`, `mob:explode {kind,pos,radius}`, `cache:drop {id,pos,count}`, `cache:recovered {id}`.
Listened: `block:break` (drops, Charge cost, tool wear), `player:death` (Memory Cache), `game:stop` (clear mobs/drops).
Audio cues called via `ctx.audio.sfx(name, {pos})`: `fuse`, `fuseCancel`, `emp`, `visor`, `whiff`, `mobHit`, `mobDeath`,
`burnout`, `pickup`, `cache`.

## Rules and numbers (all in `TUNING` / kinds.js)
- Charge drain: 0.008/s idle, +0.008 walking, +0.03 sprinting, +0.012 swimming; jump 0.05, break 0.02, attack 0.06.
- Solar trickle 0.012/s × daylight when sky light at the head ≥ 13 (open sky). Block light ≥ 8 gives 0.02/s at any time
  (D4: at night only lit shelters recharge). Net result: idle in sun = full; walking all day ≈ −1.6; a 5-min night walking ≈ −4.8.
- Regen: Charge > 18 → +1 Integrity per 2.5 s, costs 0.25 Charge. Starvation: 1 dmg / 4 s, stops at 1 Integrity (never kills).
- Air 15 s, then 2 dmg/s. Fall: 1 dmg per metre beyond 3 (lane 3 suppresses its own fall damage when `ctx.game.survival` exists).
- Eating: hold secondary with food (Sun Fruit 1.0 s/+4, Scrap Egg +2, Ibis Fibre +2, cooked versions later). Not when Charge is full.
- Peaceful: Charge pinned full, no hostiles. Build mode: stats full, no damage, no drops, no mobs unless `buildMobs` setting.
- Tools: speed hand 1 / lattice 2 / basalt 4 / ferrite 6 / qubit 9; durability 60/132/251/1562. Break time =
  hardness × (1.5 if harvestable else 5) / speed (if the tool type matches), × clamp(scale, 0.2, 1) for fine-grid breaks.
  Cutter blocks with hardness ≥ 1.5 need a cutter of level `tier + 1` to drop (stone → lattice, ferrite ore → basalt,
  aurum/qubit → ferrite). Arc Blade damage 4/5/6/8, other tools 2–6, hand 1.
- Drops: `removed[].count` (subs) / 64 = fractional block amount; Solar Film Leaves also roll Sun Fruit at 12% per block.
  Pickups pop, bob, magnet within 2.4, grab within 0.75, despawn after 5 min.
- Memory Cache: on death (unless keepInventory) the backpack goes into a beacon (magenta core, tall beam, pulsing ring)
  that never despawns and is saved; walk within 1.6 to reclaim. Hotbar always kept.

## Mobs
Caps: 8 hostile, 6 passive, 14 total. Spawn attempt every 0.5 s, 16–36 units from the player, on the surface
(`world.surfaceY` = top of solid, so feet = surfaceY), never on leaves/in water. Hostiles: block light < 7 and
(night or sky < 5), 22% per attempt; 40% glitchfuse / 60% reboot. Ibis: day, sky ≥ 12, ground is photomoss, flocks of 1–3.
Despawn beyond 72; AI sleeps beyond 48; mobs in unloaded chunks are hidden and frozen.
- **Ibis** (6 HP): wanders, pecks, panics 3 s when hit, wings flap and it flutters down (vy ≥ −2.2), lays a Scrap Egg
  every 5–10 min; drops Ibis Fibre 1–2 + 50% Scrap Egg.
- **Glitchfuse** (20 HP): chases with LOS (memory 4 s). Within 3 → 1.5 s fuse: body strobes white ↔ saturated cyan,
  faster as it burns, swells, a glyph halo spins around it, a **ground ring marks the 4.5 blast radius** (draws through
  terrain like a hologram projection; flickers magenta in the last third). Walk beyond 4.5 → cancels (fuse drains back).
  Hitting it resets the fuse. EMP: `fx.emp`, up to 13 dmg with strong knockback, hurts other mobs; crater only with mobGrief.
- **Reboot** (20 HP): lurching gait (dragging leg, rolling torso, head twitch). Telegraph: 0.4 s windup where the red visor
  flare swells with a white-hot core, the body tints red and the arms rear back; then the swing (3 dmg if still within 2.2).
  Burns out in direct sunlight (sky ≥ 14 at the head, daylight) after ~2.2 s of sparks unless it reaches shade.
Screenshots judged at 915×412 in the viewer and in-game (day on mirror sand and night): the reboot windup and the
glitchfuse ring both read at a glance; the glitchfuse body alone washes out on white sand by day, which is why the
ring uses normal blending and saturated cyan/magenta.

## M2 additions
| File | What |
|---|---|
| `js/game/stations/index.js` | `Stations`: state keyed `"x,y,z"`, `useBlock(hit)`, `open/openHand/close/isOpen`, `mountFab(container)`, `sleep`, `onPlace`, `onBreak` (spill), `serialize/load` |
| `js/game/stations/oven.js` | pure `newOven()` / `ovenTick(o, dt, items)`; ovens tick every frame whether or not a panel is open |
| `js/game/stations/ui.js` | DOM panels (Fabricator/hand list with an "Almost" section, Oven, Cache) using lane 5's `.sw-inv` glass + `css/stations.css` (injected at runtime) |
| `js/game/projectiles.js` | pulse bolts (player bow + archer), pooled, cap 48 |
| `js/game/mobs/kinds2.js`, `models2.js` | archer, spider, bull, void linker, gel-core |
| `js/data/loot.js` | `LOOT_TABLES` (ruin / wreck / outpost / cache), `lootTheme(biome)`, `rollLoot(items, seed, x, y, z, biome)` |
| `tools/game_test_m2.mjs` | tech-tree walk, recipe reachability, oven, stations, loot, M2 mob sims |

### Stations
- Use = secondary on the block → `game.useBlock(hit)` (true = handled, don't place). Fabricator, Reflow Oven, Cache open
  panels; the Sleep Pod sets spawn and, at night with no hostile within 8, skips to morning (`sky.setTime(0.01)`).
- Panels close at > 6.5 m or when the block changes. Input is disabled while open (`input.enabled = false`), Esc/E closes.
- Hand fabrication (no station): planks, rods, Fabricator, glowbulbs. Everything else needs a Fabricator.
- Oven: 5 s per item; fuel carbon nodule 8 items, gel bead 4, log/planks 1.5, rod 0.5. Smelts ferrite/aurum ore, mirror
  sand → clearglass, carbon log → carbon nodule (charcoal), and cooks egg/fibre/protein gel.
- Breaking a station spills its contents. Station state is in `game.save().stations`.
- **Loot**: a Cache with no saved state is world-generated: on first open it rolls deterministic loot from
  `(world.seed, x, y, z)` themed by biome (desert → ruin: aurum/qubit chance, food, worn tools). Player-placed caches get
  an empty state on `block:place`, so they never roll. Breaking an unopened world cache (single block) spills its loot.

### Tech tree (all tested from an empty inventory)
punch logs → planks/rods → Fabricator → lattice cutter → basalt (fractured matrix) + carbon → basalt cutter →
ferrite ore → Reflow Oven (8 fractured matrix) → ferrite ingots → ferrite cutter → qubit crystal + aurum ore →
qubit tools. Bow: 3 rods + 3 silk (spiders); charges ×8: carbon + rod. Every recipe and tool is checked reachable.

### Pulse Bow
Hold secondary with the bow: charges over 1 s (`game.bow.charge` 0..1 for the HUD), release to fire (min 0.15).
Speed 14–40, damage 1–9 (∝ charge²), slight gravity. Uses 1 Pulse Charge (none in build mode), wears the bow.

### M2 mobs (caps: 8 hostile, 8 passive, 16 total)
Night/dark surface table by biome (reboot, glitchfuse, archer, spider, void linker max 1); cave table (40% of spawn
attempts, dark air pocket with a floor below the surface): gel-core heavy plus reboot/archer/spider/glitchfuse;
day passives on grassy tops (photomoss/crystal turf): ibis (forest/plains/shore) and bull (forest/plains).
- **Wireframe archer** (18 HP, burns in sun): kites (backs off < 7, closes > 14, strafes between). Telegraph: a magenta
  aim line from its bow to you for 0.95 s that tracks you, then **locks for the last 0.3 s** (thicker, flickering), then a
  straight pulse bolt (3 dmg). Sidestep after the lock and it misses (tested).
- **Swarm-leg spider** (14 HP): climbs walls. Neutral in daylight (eyes dim amber) unless hit; hostile at night or in the
  dark (eyes red). Telegraph: 0.35 s crouch, body flashes, eyes go white-hot, then a pounce (2 dmg). Drops silk.
- **Bioreactor bull** (10 HP, passive): grazes, panics when hit. Drops Protein Gel 1–3 + Fibre Mesh 0–2.
- **Void linker** (28 HP): neutral until your crosshair stays on it 0.25 s. Telegraph: static shimmer (jitter, violet
  flicker, aura) before every teleport and strike; teleports next to you, strikes for 4, sometimes blinks away when hit.
- **Gel-core** (sizes 3/2/1: 16/8/2 HP, contact dmg 4/2/0): caves. Telegraph: squash + brightening nucleus before every
  hop. Splits into 2–3 smaller cores on death; the smallest drop gel beads.

## Growth Journal (`js/game/journal/*`, `css/journal.css`)
- `goals.js` holds the goal lists: `SURVIVAL_GOALS` (log → hand Fabricator → Lattice Cutter → Glowbulb at night → Sleep Pod →
  till → Sun Grain → Sun Bread → ferrite → smelt → Grower Outpost → shelter → qubit crystal → qubit tool) and `BUILD_GOALS`
  (place, fill, hollow, shell, replace, ¼ block, scale-8 stamp, copy, paste, undo, eyedropper). Each goal completes from a
  bus event matcher or a 1 s poll; out-of-order completions count. Add goals by editing the list only.
- Shelter = sky light ≤ 3 at the eye, block light ≥ 8, and within 8 of the surface (so a dark cave doesn't count).
  Outpost = `world.structuresNear(x, z, 14)` has `kind: 'outpost'`.
- The chip is top-left (below lane 5's FPS slot), shows the current goal and n/total, and tapping it shows the hint. It hides in
  combat (a hostile within 14 that has seen you, or you were hit in the last 6 s), while panels are open, and when the
  `guide` setting is false (undefined = on). On completion: `goal:done {id,title,done,total}`, `sfx('goal')`, a toast and
  the chip glows gold for 1.6 s. Progress is in `game.save().journal`.

## Farming (`js/game/farm.js`)
- Seed Scoop (hoe tool, Fabricator: 2 planks + 2 rods) on photomoss/loam/crystal turf with air above → `grow_bed`
  (`farm:till`). Sun Seeds (photomoss drops them 10%) on a grow bed → `sun_crop_0` above (`farm:plant`). Both go through
  `game.useBlock(hit)` (farming is checked before stations).
- Crops gain one stage per 60 lit seconds (block light ≥ 9, or sky light × daylight ≥ 9) up to `sun_crop_3`, which drops
  Sun Grain 1–3 + seeds 1–2; unripe crops return their seed. 3 Sun Grain hand-fabricate Sun Bread (+9 Charge).
- Bio Saplings (solar leaves, 5%) placed on soil grow a tree after 150 lit seconds via `world.growTree` (retries if
  there is no room). Crops and saplings placed with the brush are tracked too.
- Growth uses a play-time clock saved in `game.save().farm`. Entries in unloaded chunks don't tick. When the chunk loads,
  or when a save loads, the gap is credited at once (capped at 30 min; sky-lit plants get 60% to allow for nights).
- Block ids are looked up by key (`grow_bed`, `sun_crop_0..3`, `bio_sapling`); nothing is hardcoded.

## Follow-ups (manager round)
- Fall tracking also resets while `ctx.player.climbing` (climb rails / vines).
- Bow: no Pulse Charges in survival → it does not draw and `game.bow.noAmmo` is true (this was the "charge 0 after 0.4 s"
  report). With ammo, a 0.4 s hold reads `charge ≈ 0.4` while held; after release `charge` resets to 0 and
  `game.bow.lastCharge` keeps the fired value. Covered in game_test_m3 through the real `game.update`.
- Starter outpost: `LOOT_TABLES.starter` (guaranteed new lattice cutter, 8 glowbulbs, 3 Sun Bread + food/planks/seeds).
  The cache picks it when the nearest structure from `structuresNear` has `starter: true` (or `kind: 'starter'`).
  **Lane 1: please flag the starter outpost that way.** The journal goal "Find a Grower Outpost" is now third
  (after the Fabricator) and matches both outposts and the starter.
- Eyedropper `inv.setSlot(sel, blockId, 64)` is fine in build mode (infinite counts).

## Difficulty and the first hour (this wave)
`js/data/difficulty.js` is the one table: per difficulty `mobDmg`, `capHostile`, `spawnRate`, `cooldown` (mob attack
cooldowns), `drain` (Charge), `starveFloor`, `regenEvery`, and a gentler `firstNight` block. Difficulty comes from
`ctx.session.meta.difficulty` (lane 5's New World form, stored by `js/ui/store.js`); missing → normal. Peaceful = no
hostiles, no drain. Mob damage = max(1, round(base × mobDmg)); fall/drown/starve are never scaled.
| | mob dmg | hostile cap (night 1) | spawn rate | cooldowns | drain | starve stops at |
|---|---|---|---|---|---|---|
| easy | ×0.5 | 4 (2, reboots/spiders only) | 0.08 | ×1.8 | ×0.6 | 10 |
| normal | ×1 | 7 (4) | 0.16 | ×1 | ×1 | 1 |
| hard | ×1.5 | 10 | 0.26 | ×0.8 | ×1.3 | 0 (can starve) |
Cave hostiles have their own cap (same number) and only spawn within −16..+8 of the player's height, so cave mobs no longer
use up the surface night. Mobile (coarse pointer): total mob cap 10, passives 3; mobs beyond 56 m aren't drawn.

**First-hour playthrough** (`tools/game_playthrough.mjs` + `tools/game_playthrough_bot.js`, real game, CDP port 9314,
`q=low`). The bot plays like a careful kid at modelled walking/break/UI time while the game logic runs at full speed:
starter outpost → logs → Fabricator → tools → glowbulbs → wait for dusk → 26-block dirt hut + lamp → night 1 → hunt
for fibre → Sleep Pod → sleep. It runs each difficulty with a hut and again standing in the open.
Final results on seed `synthwild` (starter outpost 80 m away):
- Easy, hut: 0 deaths, 0 hits, Charge never below 16, slept at 35 min. Easy, in the open: 0–1 deaths (a reboot, only
  when the bot stands still and never fights back).
- Normal, hut: 0 hits all night (the hut blocks line of sight, spiders can't get in). Normal, open: 0–1 deaths, 5 hits.
- Night 1 hostiles: easy spawned 2 (reboots/spiders), normal 4–7. At most 1 within 16 m of a hut.
- fps: 60 with 15–27 mobs at night (desktop, metal); about 10 draw calls per mob.

**Friction found → fixed in my lane**
1. A crash: the first-night difficulty code read `night` before it was declared (only on a real night spawn). Fixed. The
   playthrough is what found it; the unit tests didn't.
2. Death loop: respawning next to the mobs that killed you (10 deaths in 4 min on easy in the open). Now hostiles within
   24 m of the respawn point vanish and the rest forget you (`mobs.calm`), plus the 2 s spawn shield.
3. Easy archers picked off a kid standing in the open every 3 s. No archers on easy night 1, and all mob cooldowns ×1.8 on easy.
4. Cave mobs filled the hostile cap, so surface nights were empty, then suddenly not. Caps are now separate.
5. The suit kit already has a Fabricator, so "Hand-fabricate a Fabricator" could never complete. Now "Set up your
   Fabricator" (place it or make one).
6. "Light your first night" only counted placing a lamp at full night; kids light up at dusk. It counts from dusk now.
7. Day 1 had nothing to do between "Lattice Cutter" (about 2 min) and dusk (about 13 min). Farming goals (till, Sun Grain) now
   come right after the cutter. Bread moved after the Sleep Pod and now needs actual fabrication (starter loot was completing it).
8. No carbon near the surface = no glowbulbs = no lit shelter. Added a hand recipe: lumen bloom (the glowing pink forest
   flower) + rod → 2 glowbulbs.
9. A slightly leaky dirt hut didn't count as a shelter (sky ≤ 3 was too strict). Now sky ≤ 10 + own light ≥ 8.

**For other lanes**
- Lane 5: the death screen should say where you'll respawn and that nearby monsters were scared off. A night-is-coming
  warning about 60 s before dusk ("Build a shelter and light it!") would help day-1 kids. Show the compass to the
  starter outpost only until it's found (it already exists, nice).
- Lane 3: auto-jump onto a 1-block step works, but kids won't know to pillar up to reach the top logs. A short hint, or
  letting the saw break 2 logs above the target, would make trees quicker.
- Lane 1: the starter outpost works (80 m on the default seed). Please guarantee a lumen bloom or an exposed carbon
  outcrop within ~30 m of spawn on every seed.

## Tree felling (`js/game/felling.js`)
- Breaking one full carbon-bark log cell (scale 1) while holding any Saw, or by hand when the `treeFelling` setting is on
  (default on), also breaks the connected logs above and beside it. The flood goes up or level (26-neighbour, never down)
  and is capped at 64 logs.
- If any of those logs touches a player-only block (planks, bricks, neon, glass, glowbulbs, devices, rails...), nothing
  is felled, so log houses are safe.
- Each log is re-emitted as `block:break {src:'fell'}`, so drops, Charge cost and saw wear (1 per log) go through the
  normal path. Leaves within 3 of the trunk come down too (cap 160); the first 40 roll the usual Sun Fruit / Bio Sapling drops.
- Effects: sparks along the trunk, a leaf puff, `sfx('treeFall')`, and a `tree:fell {pos, logs, leaves}` event.
- **Lane 5:** please add the `treeFelling` toggle (default **true**, "Tree felling: chop the bottom log, the tree comes down")
  and a `treeFall` SFX (a creaking whoosh).

## How to test
- `node tools/game_test.mjs`
- Viewer: `http://localhost:8861/gms/3d/synthwild/tools/game_mobview.html?mob=glitchfuse&fuse=0.8`
- In game (use `&q=low` until the post pipeline renders headless):
  `http://localhost:8861/gms/3d/synthwild/?noshell=1&seed=test&t=0.85&q=low`, then in the console
  `__game.ctx.game.spawnMob('glitchfuse', 5)`.

## Open issues / later
- Pickup merge (many tiny fine-grid drops make many pickups; capped at 256 entities, oldest culled).
- Mobs path straight at the player with sidestep-on-stuck; no A*. Good enough for open terrain, poor in mazes.
- Hostiles only spawn on the surface (no cave spawns until M2 caves).
- Swimmers (fish-drones) are lane 2's `render/swimmers.js`, not mobs.

## Requests to other lanes (journal/farming)
- **Lane 5:** add the `guide` setting (default **true**) to settings and the panel ("Growth Journal hints"). Add a `goal` SFX
  (a short bright chime), plus `till`, `plant` and `treeGrow`.
- **Lane 3:** farming also needs the `game.useBlock(hit)` call on secondary (same request as for stations): seeds and the
  scoop have `block: 0`, so the brush should do nothing else with them.
- **Lane 1:** `world.growTree` and `structuresNear` are in use, thanks. Loot now also themes by the nearest structure kind
  (ruin/outpost/vault/observatory tables in `js/data/loot.js`).

## Requests to other lanes (M2)
- **Lane 3 (needed for stations to work in play):** on a fresh `secondary` press with a block target, call
  `ctx.game.useBlock(target)` first; if it returns true, don't place. Don't place/use while holding the Pulse Bow either
  (it has `block: 0`; I read `input.held.secondary` for the draw).
- **Lane 5:** mount hand fabrication in the inventory "Fabricate" tab: `ctx.game.stations.mountFab(container)` (returns
  `{refresh, destroy}`). Treat `ctx.game.stations.isOpen` as a blocking panel (pause/Esc), and show a bow charge ring from
  `game.bow.charge`. New SFX names: `bowDraw`, `bowFire`, `pulseHit`, `archerCharge`, `archerFire`, `spiderHiss`,
  `spiderLeap`, `voidShimmer`, `voidTeleport`, `gelHop`. Events: `item:fabricate`, `player:sleep`, `player:fire`,
  `player:noAmmo`, `mob:provoked`, `ui:open/ui:close {panel:'station:<type>'}`.
- **Lane 1:** world caches roll loot automatically (no state needed from you). `world.seed` and `biomeAt` are used.

## Requests to other lanes (M1)
- **Lane 2:** with the default quality (post enabled) the headless frame is pure black (calls = 1) even with my groups
  hidden; `q=low` renders fine. Possibly the NaN-bloom trap. Please check `render/post.js`.
- **Lane 2:** `fx.emp(pos, radius)` is called with radius 4.5 (the glitchfuse ring matches it).
- **Lane 3:** `game.attack()` is wired already, thanks. While `game.survival.eat` is set (holding secondary with food)
  please don't treat secondary as place/use (food has `block: 0`, so it should already be a no-op).
- **Lane 5:** add a `buildMobs` setting (default off) for "mobs optional in build mode". HUD can use
  `survival.droop`, `survival.underwater`, `survival.trickle > 0` (charging glow), `survival.eatProgress` (eat ring).
  With `ctx.ui` present, respawn waits for your "Reboot suit" button (`game.respawn()`); set `ui.handlesDeath = false`
  to get the 3 s auto-respawn instead. SFX names are listed above (`fuse` should be a ~1.5 s rising hiss).
- **Manager:** `game.save()` = `{v, stats, inv, stash, caches, spawn}`; main.js already stores it as `save.game`.
