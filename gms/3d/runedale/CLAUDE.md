# Runedale — a pocket RuneScape

A mobile-first RuneScape-basics clone built on the whoami/Glade template
(`gms/3d/whoami`, `gms/3d/fable5_glade`): the classic skilling loop — chop →
burn, mine → smelt → smith, fish → cook — plus melee combat, a shared bank,
a general store and a guided Tutorial-Island-style intro, across three small
towns. Three.js 0.160 via CDN importmap, no build step. Tap ground to move,
tap things to use them, drag to look, pinch to zoom, WASD + Shift on desktop.

## Asset protection (the important bit)

Art is the PolyPerfect "Low Poly Ultimate Pack" — a **commercial Unity Asset
Store pack whose raw GLB/PNG files must never be committed**. Everything ships
as one obfuscated blob, same scheme as whoami:

- `tools/build_pack.py` reads models from the local-only gallery cache
  (`app/3d/gallery/models_all/`) + the rigged hero, writes `assets/pack.dat`
  (+ plaintext `pack.index.json`). Entry = `XOR(gzip(raw), keystream(name))`,
  keystream = xorshift32 seeded by `fnv1a(KEY + ':' + name)`. KEY lives in
  both `build_pack.py` and `js/assets.js` (`runedale-lpup-…`).
- `js/assets.js` reverses it at runtime. Obfuscation, not encryption — but the
  repo holds no directly-usable asset. **Never copy raw .glb/.png here.**
- 49 entries, ~0.84 MB blob. Edit `MODELS`/`TEX` + re-run
  `python3 tools/build_pack.py` to change the set.

## The world (js/config.js has all coordinates)

One 108-radius disc, river west→east with a **walkable ford** at (0,36) — the
only crossing; `world.riverBlock` blocks everywhere else. Dirt roads are
painted into terrain vertex colours (`roadDist`), town pads flatten the hills
(`TOWNS` blend in `groundHeight`).

- **Bramblewick** (0,64) — tutorial hamlet: Elder Wick, 3 trees, campfire,
  copper/tin rocks, furnace+anvil, bank chest, net fishing spot, rat pen.
- **Ashford** (0,-26) — main town: bank building (door proxy on +x face),
  general store + shopkeeper, smithy (furnace+anvil+barn), well, houses, cow
  pasture, windmill/wheat, sheep field.
- **Milbrook** (60,30) — fishing village: dock + bobbing boat, bank chest,
  cooking fire, net + rod fishing spots, fisherman.
- **Stonefell Mine** (38,-62) — copper/tin/iron rocks. **Goblin camp**
  (-48,-60) — totem, war tents, 5 aggressive goblins. **Oakwood** (-52,12) —
  normal + oak trees.

## Systems

- **Skills** (`js/skills.js`): the REAL RS XP table (level 99 = 13,034,431 xp).
  attack/strength/defence/hitpoints (HP pool = hitpoints level, starts 10) +
  woodcutting/firemaking/fishing/cooking/mining/smithing. RS combat-level
  formula. Max-hit/accuracy are RS-shaped but tuned brisk (`maxHit`,
  `hitChance`). Combat XP: 4/dmg split 40/40/20 + 1.33 HP.
- **Gathering** (`js/interact.js`): level-gated + tool-gated channels with
  auto-repeat. Oak needs WC 15, iron needs Mining 15, trout needs Fishing 20
  + rod. Trees fall to stumps (oaks persist a while), rocks hide their ore
  studs (`worldobj.js` node builders), fish spots never move. Better tools
  (iron tier) work 1.35× faster.
- **Processing**: tinderbox+logs → fire (90 s TTL, cookable, firemaking xp);
  cooking burn chance `0.35 - 0.03·(lvl-req)`; furnace panel smelts bronze
  (copper+tin) / iron (35% crumble, RS-style); anvil panel + hammer smiths
  bronze/iron sword/axe/pickaxe.
- **Inventory/bank** (`js/player.js`, `js/ui.js`): 28 slots, one stack = one
  slot; coins are a counter. ONE shared vault behind every bank; qty ×1/×5/All
  + deposit-pack. Store buys anything at 50%, sells basics.
- **Combat** (`js/player.js`, `js/creatures.js`): melee only. Bestiary: rat,
  chicken (feathers), cow (beef+hide), sheep, goblin (aggro, coins, rare
  bronze sword). Bones from everything. Auto-retaliate, drops straight to
  pack, respawns. Death keeps everything, respawn at Bramblewick.
- **Run energy**: run toggle orb (default ON), drains 6/s runs 7.2, walks 4.4.
- **Tutorial** (`js/tutorial.js`): 12 steps — talk → chop → fire → fish →
  cook → eat → mine(cu+sn) → smelt → smith → wield → kill rat → bank; hands
  out the needed tools per step, aims a cyan beacon (main.js) at the target,
  Elder re-explains on tap, skippable from the Journal (or `?skiptut`).
  Then achievements: visit towns, 5 goblins, trout, iron smith, total 50.
- **Save**: localStorage `runedale_save_v1` (player + bank + tutorial) every
  8 s. `?nosave` fresh, `?shot` thumbnail staging, `?lite` low fx, `?auto`
  soak-drives.

## Files

`js/config.js` tuning + world coordinates (TOWNS/SITES/RIVER/FORD/ROADS) ·
`js/skills.js` RS xp table + combat maths + xp rates ·
`js/items.js` items + store stock + SMELT/SMITH recipes ·
`js/world.js` terrain/river/ford/roads/sky/grass (`groundHeight` is THE height
source) · `js/worldobj.js` towns + resource nodes (returns `poi` for the
beacon) · `js/tutorial.js` steps + achievements · `js/interact.js` channelled
actions · `js/player.js` stats/inventory/combat/run-energy ·
`js/creatures.js` bestiary · `js/ui.js` HUD + all panels (popups, never
alert()) · `js/main.js` boot/bus/bank/fires/beacon/loop. Reused from whoami
unchanged: `hero.js` (rigged humanoid, body-space bones), `combat.js`,
`fx.js`, `controls.js`, `utils.js`, `registry.js`, `assets.js` (new KEY).

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); serve `python3 -m http.server 8899` from the
site root, load `/gms/3d/runedale/?nosave`. Poll `window.__state` (fps/pos/hp/
gold/energy/levels/items/bank/step/creatures/errors), drive `window.__game`
(player, controls, tutorial, interaction, creatures, worldObjs.poi, bank,
lightFire). Teleport pattern: `player.pos.set(poi.x,0,poi.z)` → `interaction.
trigger()` → poll items. Headless runs ~20 fps; channels are 2-4 s real time —
use real waits. Screenshot: `assets/screenshots/runedale.jpg` (1280×800,
`?shot` + `sips`).

## Ideas for later sessions

Minimap · attack-style selector (accurate/aggressive/defensive) · buryable
bones (Prayer) · crafting (cowhide → leather) · quests proper · a dungeon
under Stonefell · willow trees + fly fishing · gem drops + cutting · player
ghost on death drop.
