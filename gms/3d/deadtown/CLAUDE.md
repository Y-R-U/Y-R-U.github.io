# Deadtown — a mobile-first 3D zombie shooter

A Diablo/RuneScape-camera zombie shooter built on the Glade/Who-Am-I template
(`gms/3d/whoami`). You wake in your bedroom to a TV hissing a broken emergency
broadcast, walk out into an apocalyptic town, and survive the horde. Three.js
0.160 via CDN importmap, **no build step**. Mobile-first: **hold & drag anywhere
to move** (a floating joystick), **two fingers** to orbit/zoom, the **weapon
laser auto-aims and the gun auto-fires**.

Built fresh 2026-06-27 (Opus 4.8). This is a foundation/vertical slice designed
to grow over multiple sessions — see **ROADMAP** at the bottom.

## The core loop

joystick → move → `aim.js` locks the nearest zombie in the cone → the body turns
onto it → the weapon auto-fires (guns, consuming ammo) or auto-swings (melee) →
zombies chase + bite → the spawner refills the town → loot drops from kills.

## Asset protection (the important bit)

The art is the PolyPerfect "Low Poly Ultimate Pack" — a **commercial Unity Asset
Store pack whose raw GLB/PNG files must never be committed**. So this project
ships **no usable asset file**. Every model + the shared atlas is packed into one
obfuscated blob:

- `tools/build_pack.py` reads the needed models from the local-only gallery
  cache (`../../../app/3d/gallery/models_all/`) + the rigged hero, and writes
  `assets/pack.dat` (+ plaintext `assets/pack.index.json`). Each entry is
  `XOR(gzip(raw), keystream(name))`, keystream = xorshift32 seeded by
  `fnv1a(KEY + ':' + name)`. KEY = `deadtown-lpup-9Xv!aron-2026` (also in
  `js/assets.js` — they must match).
- `js/assets.js` reverses it at runtime: slice → un-XOR → `DecompressionStream
  ('gzip')` → Blob → `GLTFLoader.parse` / `TextureLoader`.

Obfuscation, not encryption (the key is in client JS) — enough to keep usable
assets out of the repo. **To change the model set, edit `MODELS` in
`build_pack.py` and re-run `python3 tools/build_pack.py`.** Logical names map to
the in-game role (`zombie_m`, `pistol`, `bld_cafe`, `int_wall`), not the
PolyPerfect asset name. **Do not** copy raw `.glb`/`.png` into this folder.

## Characters — the rigging pipeline

The player AND the zombies are now **real rigged SkinnedMeshes** driven through
`buildRig` (`js/hero.js`) in **body space**, all sharing the same bone family
(`Root_M / Hip_R / Knee_R / Shoulder_R / Elbow_R / Wrist_R / Head_M …`):
- **hero** = `man-casual-rigged.glb` (80 bones, from `fable5_glade/models`).
- **zombie_m / zombie_w / skeleton** = freshly **skinned-exported** from Unity
  into `~/cc/assets/3d/rigged/` (67–69 bones). `js/zombies.js` drives them with
  an articulated shamble (legs shuffle + arms-forward reach + lunge bite).

**Gotcha that bit us:** the gallery cache `*-rig` GLBs
(`app/3d/gallery/models_all/man-zombie-rig-*.glb`) are exported by the *static*
`PolyPerfectGlbExporter` and come out with **0 bones**. The articulated ones
come from the **SKINNED** exporter `Airon.SkinnedExport.ExportList`
(`~/unity/AssetDL/Assets/Editor/AironExport/SkinnedExport.cs`):

```sh
# list one Unity prefab path per line; outputs <name>.glb to PP_OUT_DIR
PP_PREFAB_LIST=/tmp/list.txt PP_OUT_DIR=/Users/aaronair/cc/assets/3d/rigged \
  "/Applications/Unity/Hub/Editor/6000.4.11f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -projectPath /Users/aaronair/unity/AssetDL \
  -executeMethod Airon.SkinnedExport.ExportList -logFile /tmp/exp.log   # NO -quit
```
The rigged people prefabs live under `Assets/polyperfect/Low Poly Animated
People/- Prefabs/` (e.g. `man_zombie.prefab`, `woman_zombie.prefab`,
`man_skeleton.prefab` — plus dozens more to mine for NPCs). Rigs are listed in
`RIGS` in `build_pack.py` so `js/assets.js` loads them raw (own skin + skeleton)
instead of re-skinning onto the shared atlas. Static props still use the shared
atlas material.

## The four contracts (keep these; swap everything else)

1. **The rig** (`js/hero.js`): `buildRig(gltfScene, opts)` → `{ group, parts,
   animate(t,walk), handAttach, muzzleNode }`. The player adds the arsenal on
   top (`makeHumanoid`). Bones driven in body space so the same pose works at
   any yaw.
2. **The arsenal** (`js/weapons.js`): `WEAPONS` defs (melee/gun, dmg, range, cd,
   ammo, spread, pellets, twoHand). `attachArsenal(rig)` gives the rig
   `setWeapon / setAiming / fire / swing / muzzle / tickCombat`. Weapons are real
   GLBs parented to the wrist; **the laser/tracer come from a stable `muzzleNode`
   on the body**, not the GLB barrel, so aiming reads right regardless of model
   pivot. Add a weapon = one row in `WEAPONS` + pack the GLB.
3. **Areas** (`js/interiors.js` + `main.js`): the town and every interior are
   "areas". An area swaps the player's `heightAt`/`clampPos`/colliders/
   interactables and toggles visibility. Interiors sit far offset on their own
   platforms (like the old dungeon), built **roofless with LOW walls** so the
   close, steep interior camera always sees in. `controls.snap()` recentres the
   camera on the swap so it doesn't swoop across the void.
4. **Town layout data** (`js/townobj.js` `BUILDINGS`, `js/world.js` `ROADS`,
   `js/interiors.js` `INTERIORS`, `js/config.js` `SITES`): authoring tables.
   Grow the map by adding rows — the ground texture, prop placement, minimap and
   collisions all read `ROADS`; doors point at interior ids.

## Controls & camera

`js/controls.js`: one finger anywhere = a **floating joystick** (camera-relative
move, magnitude = speed). Two fingers = orbit + pinch-zoom. Desktop: WASD+Shift,
wheel zoom, right-drag orbit. Camera presets in `CFG.cam` (`town` = pulled-out +
tilted; `interior` = close + steep). Yaw is fixed RS-style but rotatable.

## Auto-aim

`js/aim.js`: a beam from `muzzleNode` along facing; the nearest zombie inside
`CFG.aimRange`/`aimCone` locks (sticky — wider keep-cone so it doesn't flicker),
the beam turns **red** and `player.combat()` turns the body onto it and fires.
Melee uses a short engage range (5 m) and swings within weapon range.

## Files

`js/config.js` tuning + `SITES` + URL modes · `js/world.js` flat town ground
(drawn street texture) + `ROADS` + sky/sun · `js/townobj.js` buildings/wrecks/
lamps/props + door interactables + colliders + minimap building list ·
`js/interiors.js` bedroom + lootable interiors (area-swap) · `js/hero.js`
`buildRig` + player `makeHumanoid` · `js/weapons.js` arsenal + combat poses ·
`js/aim.js` laser + targeting · `js/player.js` HP/ammo/movement/combat ·
`js/zombies.js` the horde · `js/controls.js` joystick + camera · `js/minimap.js`
top-down canvas · `js/intro.js` bedroom cold-open (TV static + broadcast) ·
`js/ui.js` HUD · `js/main.js` boot + loop + area-swap + spawner + pickups + save.
Reused from the template: `js/fx.js` (splats/bars/tracers/blood/muzzle flash),
`js/utils.js`, `js/assets.js`.

## URL modes & testing

`?town` skip the bedroom intro (straight into the street) · `?nosave` fresh ·
`?shot` thumbnail stage (HUD hidden) · `?lite` drop shadows/density · `?auto`
soak-drive · `?wpose` weapon-pose tuner (`js/wpose.js`): freezes the sim +
hides the horde, sliders for each weapon's in-hand model (pos/rot/scale) AND
firing stance (`aim`: R/L shoulder xyz + elbows), "Copy all" emits a
paste-ready `hand:`+`aim:` block per weapon. This is how the grips in
`WEAPONS` were dialled in.

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); serve `python3 -m http.server 8810` from the site
root, load `/gms/3d/deadtown/?town&nosave`. Poll `window.__state`
(fps/pos/hp/ammo/weapon/area/zombies/kills/target/errors) and drive
`window.__game` (player, zombies, controls, aim, enterInterior, exitToStreet).
Headless rAF is throttled (~20 fps) and the 0.05 s dt clamp dilates sim time, so
use real waits. After visual changes re-stage `assets/screenshots/deadtown.jpg`
(1280×800; load `?town&nosave`, compose, screenshot, `sips` to jpg).

## ROADMAP (next sessions)

The slice is complete + runnable. **Done since launch:** articulated rigged
zombies (skinned export) + skeleton type; all weapons obtainable (world spawns +
drops + minimap loot dots); **in-hand weapon holding + firing stance tuned per
weapon** (`hand` grip + `aim` arm pose in `WEAPONS`, dialled in via `?wpose`);
interior floor + pickup visibility (single tinted plane,
floating spinning glowing pickups); **objective/mission chain** (`objectives.js`,
HUD banner + rewards); **police armory + café** interiors; **escalating threat
ramp** (horde grows + tougher with kills); **synthesized audio** (`audio.js` —
gunshots/melee/hits/groans/pickups/reload, no asset files); **kill-streak
combos** + score multiplier; **day→night cycle** (`world.tickSky`); **line of
sight** (no shooting through buildings — `losBlocked`); **reload + magazines**
(per-weapon mag/reserve, auto-reload, `R`/tap to reload); **survivor NPCs**
(`survivors.js` — rigged civilians you find cowering, Use to rescue → reward +
flee, two rescue objectives). Good follow-ups:

1. **More open interiors**: burger joint, apartments, cabin, car wash are still
   `locked:true` in `BUILDINGS` — add `INTERIORS` specs + flip them.
2. **Zombie variety/feel**: crawlers, a screamer that summons, pathing around
   buildings (grid A* — none today; they walk straight + get pushed off walls).
3. **Save the full state** (area, zombie/pickup/survivor positions) — currently
   only the player + objective index serialize; you always resume in town.
4. **Escort survivors**: instead of fleeing, have a rescued survivor follow you
   to a safe point (the police armory) for a bigger reward.
5. **Two-hand grip polish**: grips + stance are now tuned per weapon via
   `?wpose`, but the left hand still floats near (not locked onto) the foregrip
   — an IK-ish offset or second hand-attach bone would nail it.
6. **Boss / special zombies**, weather, a real soundtrack (ACE-Step), a proper
   start menu + difficulty select.
