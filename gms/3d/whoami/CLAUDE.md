# Who Am I — a mini open-world RPG

A small Diablo/RuneScape-flavoured RPG built on the Glade template
(`gms/3d/fable5_glade`). You wake with no memory in a grass valley with a
village, a river, a forest/orchard and a dungeon. Three.js 0.160 via CDN
importmap, no build step. Mobile-first: tap ground to move, tap a creature to
attack, drag to look, WASD + Shift to run, **E / Space** (or the **Use** button)
to interact.

## Asset protection (the important bit)

The art is the PolyPerfect "Low Poly Ultimate Pack" — a **commercial Unity
Asset Store pack whose raw GLB/PNG files must never be committed**. So this
project ships **no usable asset file**. Every model + the shared atlas is packed
into one obfuscated blob:

- `tools/build_pack.py` reads the needed models from the local-only gallery
  cache (`../../../app/3d/gallery/models_all/`) plus the rigged hero, and writes
  `assets/pack.dat` (+ plaintext `assets/pack.index.json`). Each entry is
  `XOR(gzip(raw), keystream(name))`, keystream = xorshift32 seeded by
  `fnv1a(KEY + ':' + name)`.
- `js/assets.js` reverses it at runtime: slice → un-XOR → `DecompressionStream
  ('gzip')` → Blob → `GLTFLoader.parse` / `TextureLoader`.

This is **obfuscation, not encryption** — the key is in client JS — but it keeps
the repo free of directly-usable assets and stops casual scraping, which is what
the licence needs here. To change the model set, edit `MODELS`/`TEX` in
`build_pack.py` and re-run `python3 tools/build_pack.py`. **Do not** copy raw
`.glb`/`.png` into this folder.

## Characters

Every humanoid (player + NPCs) is ONE rigged GLB (the imported PolyPerfect
`man_casual`, a real glTF SkinnedMesh) cloned with `SkeletonUtils` and driven
procedurally in **body space** — the "same animations for all characters" goal
(`js/hero.js`, ported from the Glade's `imported.js`). Animals and monsters are
static pack models animated procedurally (hop/sway/lunge), like the Glade
chickens (`js/creatures.js`). Non-hero models are re-skinned onto ONE shared
atlas material (gradient `.map` + specular `.metalnessMap`, metalness 1).

## Systems

- **Skills / XP** (`js/skills.js`): health, attack, strength, defence, dexterity
  (archery), magic, fishing. Brisk RS-style curve; combat level + max-hit +
  accuracy derived from levels. Health level sets the HP pool.
- **Survival** (`js/player.js` + `config.js`): food and water bars drain very
  slowly (one in-game day = 2 real hours → ~7 days food, ~3 days water from
  full). Water **auto-refills near any river or the well** with a toast. Empty
  bars chip HP (death in "weeks"); fed + watered + out of combat regenerates HP.
  Health potions also bump food.
- **Inventory / items** (`js/items.js`, `js/ui.js`): stacks, equip weapons
  (sets the combat style), eat/use, sell. Gold currency.
- **Gathering** (`js/interact.js`): fishing IS a skill (rod → raw fish → cook for
  more food). Woodcutting/firemaking are NOT skills — an **axe** chops trees for
  logs, a **tinderbox** + a log lights a fire you can cook on. Pick fruit from
  apple trees, pick mushrooms.
- **Combat / loot** (`js/player.js`, `js/creatures.js`): melee / archery (bolt)
  / magic (fireball) via the shared rig; creatures have HP bars, hit-flash,
  randomized loot, and respawn. Passive animals flee; dungeon monsters chase and
  hit back.
- **Store** (`js/ui.js`): buy basics / sell anything at the market stall.
- **Quests** (`js/quests.js`): an intro guide (kill critters → fish → cook →
  eat) then Pest Control, A Woodsman's Lot, and the dungeon delve. HUD tracker +
  quest log.
- **Dungeon** (`js/dungeon.js`): a torch-lit stone crypt on its own platform;
  entering swaps the player's ground/bounds/colliders and creature set, plus a
  treasure chest. `main.js` orchestrates the area switch.
- **Save** (`js/main.js`): autosaves to `localStorage` every 8 s. `?nosave`
  starts fresh, `?shot` stages a thumbnail, `?lite` drops shadows/density,
  `?auto` soak-drives.

## Files

`js/assets.js` pack loader + shared material · `js/world.js` terrain/river/sky/
grass (`groundHeight` is the height source) · `js/worldobj.js` props +
interactables · `js/hero.js` rigged humanoid · `js/player.js` state/skills/
survival/movement/combat · `js/creatures.js` enemies · `js/interact.js`
interaction + gathering · `js/quests.js` · `js/dungeon.js` · `js/ui.js` HUD/
panels · `js/controls.js` camera/tap/WASD · `js/main.js` boot + loop. Reused
from the Glade unchanged: `combat.js` (weapon builders), `fx.js` (splats/bars/
projectiles), `utils.js`, `registry.js`.

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); serve `python3 -m http.server 8899` from the site
root, load `/gms/3d/whoami/?nosave`. Poll `window.__state` (fps/pos/hp/food/
water/gold/area/levels/items/creatures/errors) and drive `window.__game`
(player, controls, quests, interaction, overCreatures, dungCreatures,
toggleDungeon). Headless rAF is throttled (~2 fps) and the 0.05 s dt clamp
dilates sim time, so combat/fishing channels advance slowly — use real waits.
After visual changes re-stage `assets/screenshots/whoami.jpg` (1280×800).
