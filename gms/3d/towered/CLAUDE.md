# Towered — a medieval-fantasy 3D tower defence

20 handcrafted levels across four realms (Meadow → Autumn → Winter → Ashlands),
plus a full in-browser **level editor**. Three.js 0.160 via CDN importmap, **no
build step**, mobile-first. Built 2026-07-03 (Fable 5) on the Deadtown/Who-Am-I
template family.

The Hollow King's horde marches the old roads toward the last castle; you build
and upgrade towers on the grid beside the path to stop them.

## The core loop

wave horn → enemies (rigged PolyPerfect characters) march the path curve →
towers auto-target the frontmost enemy in range and fire → kills pay bounty →
build/upgrade between (or during) waves → castle loses hearts per leak →
clear every wave to win 1–3 stars (stars = hearts kept).

## Asset protection (same scheme as deadtown/whoami)

PolyPerfect packs are commercial — **no raw GLB/PNG in the repo**. Everything is
packed into one obfuscated blob:

- `tools/build_pack.py` reads models from the local-only caches
  (`app/3d/gallery/models_all/`, `~/cc/assets/3d/rigged/`,
  `~/cc/assets/3d/public/assets/chars_rigged/`) and writes `assets/pack.dat` +
  `assets/pack.index.json`. Entry = `XOR(gzip(raw), keystream(name))`,
  keystream = xorshift32 seeded by `fnv1a(KEY+':'+name)`.
  KEY = `towered-lpup-7Tw!aron-2026` (must match `js/assets.js`).
- `js/assets.js` reverses it at runtime. Statics are re-skinned onto the shared
  gradient+specular atlas material; RIGS (skinned characters) load raw with
  their own baked skin + skeleton.
- To change the model set: edit `MODELS`/`RIGS` in `build_pack.py`, re-run
  `python3 tools/build_pack.py`.

## Enemies — rigged characters

All enemy models are **real skinned PolyPerfect characters** sharing the one
80-bone family (`Hip_R / Knee_R / Shoulder_R / Elbow_R / Head_M …`), driven
procedurally in body space through `buildRig` (`js/rig.js`, the deadtown
driver). `js/enemies.js` gives each type a pose style: `shamble` (zombies,
mummy), `march` (viking, knight), `sneak` (ninja), `float` (wizard/lich).
Bosses are scaled/tinted variants with crown + glow. NOTE the cross-project
gotcha: gallery `*-rig` GLBs are STATIC (0 bones) — rigged sources are the
skinned exports in `~/cc/assets/3d/rigged/` + `chars_rigged/`.

## Level format (`levels/levelNN.json`)

```json
{ "id":"level01", "name":"The Green Road", "theme":"meadow",
  "grid":{"w":20,"h":14},
  "paths":[ [[0,7],[6,7],[6,3],[13,3],[13,10],[19,10]] ],
  "blocked":[[3,3]], "decor":0.5,
  "gold":220, "lives":20,
  "waves":[ {"groups":[{"type":"shambler","n":8,"gap":0.9,"path":0,"delay":0}]} ],
  "tip":"Ballistas are cheap and fast — line the first bend." }
```

- Cell size = 2 world units; grid is centred on the origin.
- `paths` = waypoint polylines in cell coords; a Catmull-Rom curve is threaded
  through them (`js/levels.js` `buildCurve`), the ground canvas paints the road
  under it, and path cells are rasterised to block building.
- Spawn gate at each path's first waypoint, the castle past the last one.
- Built-in list lives in `levels/index.json` (array of ids).

## How editor levels reach the game

GitHub Pages is static, so the editor can't write into `levels/`. Instead:

1. **Save** in the editor → localStorage (`towered-custom`) → the level appears
   immediately under the game's **Custom** tab in level select.
2. **Export** downloads `<id>.json` — drop it into `levels/` and add its id to
   `levels/index.json` to promote it to a built-in (this is the "saves back to
   a levels directory" path — a manual copy because Pages can't accept writes).
3. **▶ Test** stores the working level in sessionStorage and opens
   `index.html?test=1`; the game shows a "Back to editor" button. The editor
   auto-saves its working copy (`towered-editor-wip`) so nothing is lost.

## Files

`js/config.js` TOWERS + ENEMIES + THEMES + econ/cam tuning · `js/levels.js`
level loading (builtin/custom/test), validation, curve + rasterise, progress
stars · `js/world.js` painted ground + road, decor, castle, spawn gates, sky/
fog/light per theme · `js/rig.js` buildRig bone driver · `js/enemies.js` enemy
factory + path walking + poses + armor/regen/heal-pulse + bosses ·
`js/towers.js` 5 towers × 3 levels (ballista/cannon/catapult/frost/arcane),
targeting, upgrades, sell · `js/projectiles.js` bolts/cannonballs/boulders/
chain lightning/frost pulse · `js/fx.js` splats, bars, explosions, coins,
ambient embers/snow · `js/waves.js` scheduler + early-call bonus ·
`js/input.js` pan/orbit/pinch camera + cell/tower picking · `js/ui.js` HUD,
build/tower sheets, wave preview, toasts, one-time tips, help ·
`js/menus.js` title/level-select/win/lose · `js/intro.js` cinematic fly-through
story · `js/audio.js` procedural music per realm + all sfx · `js/main.js` boot,
state machine, loop, speeds, saves · `js/editor.js` the editor app ·
`js/assets.js` pack loader · `js/utils.js` helpers.

## URL modes & testing

`?level=N` jump into built-in level N · `?custom=<id>` custom level ·
`?test=1` editor test level · `?nosave` don't touch saves · `?shot` thumbnail
staging (HUD hidden) · `?lite` no shadows / low decor · `?auto` AI soak-driver
(auto-builds towers, calls waves; pair with `?level=`) · `?speed=3` force speed.

Headless: `python3 -m http.server 8815` from the site root + puppeteer-core
(`--use-angle=swiftshader --enable-unsafe-swiftshader`), load
`/gms/3d/towered/?level=1&auto=1&nosave`. Poll `window.__state` (fps, gold,
lives, wave, enemies, towers, phase, errors[]), drive `window.__game`
(game/world/waves/towers/enemies/ui). Headless rAF is throttled — use real
waits, and `window.__game.step(dt)` to hand-step. Editor exposes
`window.__editor`.

## Design notes

- Realms: 1–5 Meadow, 6–10 Autumn, 11–15 Winter, 16–20 Ashlands; bosses at
  5/10/15/20; dual paths from level 8.
- Damage = `max(1, dmg - armor)`; frost slows ×0.55 for 1.6 s (no stack);
  arcane chains with 0.7 falloff; catapult has a min range.
- Early wave call bonus = 2 gold / remaining second.
- Stars: 3★ ≥ 90 % hearts, 2★ ≥ 50 %, 1★ win.
