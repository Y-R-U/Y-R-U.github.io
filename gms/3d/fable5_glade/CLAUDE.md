# The Glade — Fable 5 ARPG graphics test area

Mobile-first Diablo/RuneScape-style test scene: a circular grass meadow with
a tap-to-move hero, villager NPC, attackable chickens, thatched cottage,
campfire, collidable props, and floating pickups. Three.js 0.160 via CDN
importmap, no build step. The scene is built **from three.js primitives in
code** with procedural `<canvas>` textures — that constraint is the point of
the test. Two deliberate exceptions let us compare against real assets: `?pp=1`
drops a couple of imported PolyPerfect GLBs into the scene (`js/external.js`),
and Hero 5 "Cass" is an imported, rigged PolyPerfect character
(`js/imported.js`, see below).

Five heroes share one player controller: **Roland** (blocky boxes, ~0.6k
tris, default), **Maeve** (rounded showcase: sphere head + sculpted face,
lathe torso, capsule limbs with elbows, swaying ponytail, ~6k), two
mid-budget rigs (~2.4k each incl. sword): **Garrick** the knight (lathe
cuirass, open-faced helm with crimson crest) and **Wren** the hooded scout
(moss hood with face window + feather pin, shoulder braid, mantle cape), and
**Cass** — an *imported* PolyPerfect `man_casual`, a real glTF **SkinnedMesh**
(exported from Unity with its 80-bone skeleton via glTFast, ~1.1k tris) whose
actual bones are driven procedurally. Benched heroes exist only in the debug
panel until you press **Play** on their row — that swaps the active rig.
`?hero=maeve|2|garrick|3|wren|4|man` spawns as that hero directly (Cass loads
async, so `?hero=man` switches as soon as the GLB arrives).

**Cass / the imported-rig pipeline** (`js/imported.js`): the man is one rigid
SkinnedMesh whose 80 bones are in arbitrary FBX local frames (a T-pose).
Rather than poke `bone.rotation`, each controlled bone (hips, knees, shoulders,
elbows, head) is driven with a rotation in clean **body space** (x=right,
y=up, z=forward). We capture each bone's rest orientation *relative to the hero
group*; the group's world rotation then cancels out, so the same body-space
rotation works at any yaw: `bone.local = parentRestRelGroup⁻¹ · W ·
boneRestRelGroup`. T-pose arms come down via a body-z rotation; the walk swings
hips/arms about body-x; weapons parent to a node under `Wrist_R` and to the
group's back. It re-implements the rig contract + combat interface the player
expects, reusing the `combat.js` weapon builders and `fx.js` projectiles, so it
drops into the roster unchanged. The GLB came from
`Airon.SkinnedExport.ExportPrefab` in the Unity AssetDL project — see
`~/cc/assets/POLYPERFECT_ASSET_HOWTO.md` for the export pipeline.

**Combat:** three attack styles picked in the bottom HUD bar — ⚔️ sword
(melee, `attackRange`), 🏹 crossbow (bolt projectile, `crossbowRange`),
🔮 staff (fireball projectile, `staffRange`). Tap a chicken (invisible
fat-finger hit proxy) → the hero draws the current weapon off their back
while closing to range (melee routes through the pen gate; ranged styles
stop at distance and shoot over the fence). Each attack rolls 1..`dmgMax`
damage — melee applies at the slash hit frame, ranged rides the projectile
and applies on arrival (`fx.bolt` / `fx.fireball`). Chickens have
`chickenHp` (40), show a health bar + red hit splats + feather bursts, flee
between hits, tip over on death and respawn after
`rand(chickenRespawnMin, chickenRespawnMax)`s (30–60s). Weapon auto-sheathes
4s after combat ends. All four rigs share the same draw/sheathe/attack
overlay (`js/combat.js`), which runs after `animate()` and overrides
arms/torso only, so locomotion blends underneath. The crossbow is
point-and-shoot (aim → fire → recoil) — the recurve bow was dropped as a
usable weapon because its string/limb layering never animated right; it
survives as decorative ground loot.

**HUD:** top-left health/mana potion counters (red/blue tinted 🧪 chips),
top-right 🎒 inventory popup (all pickup kinds + counts) and 🐞 debug,
bottom-centre style picker. Carried weapons are flagged `userData.gear` so
hero debug rows count the BODY only; the weapon rack by the house holds
display copies registered under the Gear category with their own tri counts.

This project is the demo/testing ground — if it ever becomes a real game,
this directory is the copy-paste starting template. **`TEMPLATE.md` has the
step-by-step instructions for copying it into a new game.**

The point of this scene is to evaluate object quality, so the 🐞 debug button
(top right) lists every registered object with live position, triangle count,
a build note, and a Focus button that flies the camera to it. Toggles:
Wireframe / Colliders / Pause.

## Files

- `js/config.js` — tuning, site layout (`SITES`), `?shot` / `?lite` / `?auto` URL modes
- `js/registry.js` — object registry; **everything visible must `register()`**
  so it shows in the debug panel (name, category, icon, collider, pickup, note)
- `js/world.js` — sky shader + sun glow, polar-grid meadow disc (`groundHeight(x,z)`
  is THE height function — props/characters all sit on it), cliff skirt, water,
  instanced grass tufts + flowers, clouds, lighting
- `js/props.js` — house, trees, rocks, well, fence pen, barrels, crates,
  campfire, stone path, pickups. One `makeX()` builder per object returning a
  `THREE.Group` with origin at ground level; placed + registered in `buildProps()`
- `js/entities.js` — `makeHumanoid(opts)` factory (Roland + villager), player
  controller (movement, chase + gate routing, attack loop, hero switching),
  chickens (wander/peck/flee/dying/dead/respawn state machine), butterflies
- `js/heroine.js` — `makeHeroine()`: Maeve's model, same rig contract as
  `makeHumanoid` ({ group, parts, animate(t, walk) })
- `js/heroes.js` — `makeKnight()` (Garrick) + `makeScout()` (Wren): mid-budget
  rigs sharing addArms/addLegs/addFace helpers with Maeve's joint spacing, so
  attachCombat's hand offset works unchanged on all capsule-limb heroes
- `js/imported.js` — `loadImportedHero()`: Hero 5 "Cass", the imported rigged
  PolyPerfect `man_casual` GLB. Drives the real SkinnedMesh bones in body space
  (see the pipeline note up top), re-implements the rig + combat interface.
  Loaded async from `models/man-casual-rigged.glb`
- `js/external.js` — `loadExternal()`: the `?pp=1` showcase — loads a couple of
  static PolyPerfect GLBs (tree + person) next to the hand-built equivalents,
  registered under an "Imported" debug category for side-by-side tri counts
- `models/` — the only binary assets in the project: the rigged hero GLB plus
  the two `?pp=1` showcase GLBs (all exported from the PolyPerfect Unity pack)
- `js/combat.js` — `makeHeroSword()` / `makeCrossbow()` / `makeStaff()`
  (+ `makeBow()`, decorative only), `attachCombat(rig, opts)`: back-carried +
  in-hand weapons per style, swing trail, draw/sheathe + per-style attack
  state machine, `rig.setStyle()`, `rig.muzzle()` (projectile spawn point
  from the weapon's `userData.tip`)
- `js/fx.js` — hit splats, feather bursts, health bars, `bolt()` / `arrow()` /
  `fireball()` projectiles (glow sprites, trail puffs, impact burst)
- `js/controls.js` — tap raycast (chicken proxies first, then ground), drag
  orbit, pinch/wheel zoom, WASD, camera follow + debug focus
- `js/ui.js` — potion chips, style picker, 🎒 inventory popup, toasts
  (styled popups only, never `alert()`)
- `js/debug.js` — the debug panel; entries may set `focusLabel` + `onFocus()`
  (used for the hero Play buttons), `object.userData.status` shows live in rows
- `js/main.js` — boot, loop, circle collision (`collider: {r}` dynamic or
  `{points:[{x,z,r}]}` static), pickup collection, `?shot` staging, `?auto` driver

## Improving / adding objects (focused sessions)

This scene is designed so a session can polish ONE OR TWO objects in isolation:

1. Find the builder in `js/props.js` (or `makeHumanoid`/`makeChickenMesh` in
   `js/entities.js`). Builders are self-contained — they take no scene refs and
   return a Group with origin at ground level, +z facing "forward".
2. Rebuild it with more love: more primitives, `LatheGeometry`/`ExtrudeGeometry`
   profiles, canvas textures, vertex colours, flat shading, small emissive
   accents. Keep it one Group so placement/registration code doesn't change.
3. Update the registry `note` to describe the techniques used.
4. Budget guide: hero-tier objects ≤ ~3k tris, props ≤ ~1.5k. Check the debug
   panel's per-object count. Whole scene currently ~23k tris / ~240 draw calls.
5. New object kinds: add a builder + `place()` + `register()` in `buildProps()`,
   pick a debug icon, give it a collider circle if solid.

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); scripts from previous runs live in `/tmp/pup/`
(`test_glade.mjs` view/shot/soak, `test_debug.mjs` panel interactions,
`mob.mjs` mobile touch). Serve with `python3 -m http.server 8765` from the
site root.

- `?shot=1` stages the thumbnail frame, sets `window.__shotReady` after 8 frames
- `?lite=1` disables shadows/fire-light, halves grass instances
- `?auto=1` AI-drives the hero (wander + collect + attack chickens); poll
  `window.__state` ({fps, pos, picked, pickupsLeft, hero, chickens, errors})
  — note Chrome's `--virtual-time-budget` does NOT advance the sim, use real
  waits, and at low headless fps the dt clamp (0.05s) dilates sim time
- `window.__game` ({player, chickens, controls, setHero}) + `window.__camera`
  for scripted tests; `controls._raycastTap(x, y)` probes the tap path
- After visual changes re-stage the thumbnail: `assets/screenshots/fable5-glade.jpg`
  (1280×800 jpg via `sips`)
