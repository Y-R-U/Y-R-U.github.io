# robots agent notes

Owns: `js/actors/*`, `tools/robot_gallery.html`, this file.

## API (TEAM_BRIEF v0 + extras)
```js
import { createRobot, ROBOT_KINDS, ANIMS, PAINTS, robotStats } from './actors/robots.js';
const r = createRobot({ kind, tier = 0, seed = 1, quality = 'high'|'med'|'low', lod = 'near'|'far', paint = null });
scene.add(r.root); r.update(dt) every frame;
r.setMove(speed01, metersPerSec?)   // pass the real m/s the root moves at → exact foot plant; else speed01 * r.runSpeed
r.play(name, { loop, speed, fade })  // returns duration (s) for one-shots; they auto-return to locomotion
r.setAim(yaw | null)   // yaw in the root's parent space, same convention as root.rotation.y; spine/head twist ±1.35 rad
r.setAlert(0 | 1 | 2)  // unaware / suspicious (amber pulse) / hostile (red pulse) on eye + glow
r.hitFlash(); r.dispose();
r.sockets.{head, handL, handR, muzzle, back}; r.height; r.radius
```
- Extras: `r.onEvent = (ev, anim) => {}` fires `impact` (attack_melee/attack_heavy), `fire` (shoot), `cast`, `down` (die), `end` (one-shot finished). `r.runSpeed`, `r.seatHeight` (sit: seat top above root; put the root at the bench's foot position), `r.state` {base, action, dead, speed}, `r.drawCalls`, `r.tris`, `r.mesh`, `r.alert`.
- Facing: +Z at `root.rotation.y = 0` → `root.rotation.y = Math.atan2(dx, dz)`.
- `play('idle'|'walk'|'run')` only matter if you never call setMove (gallery treadmill); the game should just call `setMove` every frame.
- Upper-body actions (attack_melee, shoot, cast) keep the legs running when moving (> 0.3 m/s). attack_heavy / dodge / hit / die are full body.
- `dodge` is in place (roll, or shoulder-dash for brawler/enforcer); the game translates the root ~3 m over 0.6 s.
- `die` holds the final pose, fades eyes/glow with flicker; any `play()` revives.
- `paint`: preset name from `PAINTS` (gold, chrome, black, rental, syndicate, concord, rebel, rust) or `{ body, trim, mech: hex | {color, metal, rough, coat}, glow, eye: hex }`. Roster tints: Knuckle/Popper = brawler/gunner + 'syndicate', Chromehead = brawler + 'chrome', Saboteur = ghost + 'rebel', Gilded Guard = civ_gold tier 2.
- `boss_*` and unknown kinds fall back via `kindOf()` (boss_* → enforcer) so nothing throws.

## Kinds (high quality; draw calls = material slots)
| kind | look | dc | tris high / med / far | height | runSpeed |
|---|---|---|---|---|---|
| civ_gold / civ_chrome / civ_black / civ_worker | elegant ref humanoids; 4 seed variants (bust/pecs, round/layered shoulders, crest) × 3 tones, ±4% scale | 4–5 | ~18k / ~12k / ~5.6k | 1.9 | 4.2 (worker 3.8) |
| rental (HireFrame R-1) | boxy scuffed grey + safety orange, canvas decals (HIREFRAME R-1, RENT BY THE HOUR, 17, barcode, hazard), cracked amber visor, blue-primer mismatched left arm with duct tape, janky limp gait + stuck head tilt | 7 | ~7.7k / – / 2.8k | 1.8 | 4.2 |
| brawler (Bulwark) | massive gloss black + gold, dome pauldrons, piston forearms, fists, back exhausts | 4 | ~12k / – / 4.7k | 2.05 | 3.8 |
| gunner (Longarm) | chrome, long limbs, visor helmet, carbine at low-ready, shoulder sensor mast | 4 | ~19k / – / 6k | 2.0 | 4.0 |
| ghost (Wisp) | matte black, cyan seams, faceless with eye slit, forearm mono-blade, slash melee | 5 | ~17k / – / 5.4k | 1.95 | 4.8 |
| security (Warden) | white ceramic, visor, riot shield + baton; t2+ gold trim + lance; t3 bigger shield | 5 | ~19k / – / 6.2k | 1.95 | 4.2 |
| enforcer | 2.4 m black/red heavy, block pauldrons, arm shield, reactor backpack; t3+ gold | 5 | ~12.7k / – / 4.7k | 2.4 | 3.4 |
| drone_scout (Warden Eye) | hover rig: white hull, red eye turret, ducted spinning rotors, gun pods | 5 | ~2.8k / – / 1k | 1.75 | 5 |
| scrap_rat | quad rig: junk battery-can body, rust/primer, mandible jaw, cable tail, LED eyes; tones vary | 5 | ~3.5k / – / 1.4k | 0.3 | 3.6 |
Tiers 0–4 (brawler/gunner/ghost): t1 trim bands + polish, t2 glow strips/core, t3 extra plates/fins, t4 crest/halo/colour accent.

## Architecture
- One **SkinnedMesh per robot**, rigid skinning (each vertex weight 1 to one bone); all parts merged per material slot → draw calls = slot count.
- `rig.js` 21 bones (pelvis…feet + aux0/aux1; quad/hover kinds override offsets), `parts.js` PartBuilder (`sym()` mirrors L→R with winding fix — only for limb bones or centre bones on x = 0; `scope()` pre-transform), `shapes.js` helpers, `kinds_civ.js` (elegant builder, also used by gunner/ghost/security via face/chestPlate options), `kinds_frames.js` (rental, heavy builder for brawler/enforcer, gunner/ghost/security add-ons + palettes), `kinds_enemy.js` (scrap_rat, drone), `kinds.js` registry, `anims.js` (poses, IK, gait, actions, hover + quad sets), `materials.js` (cache, canvas textures, PAINTS).
- Geometry cached per (kind, tier, variant, quality, lod). Materials shared; only `eye`/`glow` are cloned per instance (death fade, alert colour).
- Legs: analytic two-bone IK every frame; stance travel = v·duty/f and a Hermite swing whose end tangents match ground speed → **verified zero stance slide** (foot world z constant through stance at 4.2 m/s run; heel peels at the end).
- Crossfade = freeze-and-blend of the whole pose (default 0.15 s; 0.2 s back to locomotion).

## DONE
- All 12 kinds; all 12 anims on biped (verified by contact sheets: walk/run, punch/slash, heavy slam, shoot, cast, roll/dash, hit, die sag→kneel→prone, talk, sit); hover (drone) and quad (rat) sets.
- Manager requests: `scrap_rat`, `paint`, `setAlert`.
- Gallery: `tools/robot_gallery.html?view=lineup|iso|hero|tiers|seeds|crowd` + `anim, t (fixed time), rot (relative to camera), kinds, kind, tier, seed, dist, pitch, yaw, ty, sp, env=mine|0, post=game, bloom=0, q, lod, clean`. Uses the world agent's `atmosphere.js` sky/env (falls back to its own), own bloom + OutputPass. `window.__gallery` {ready, robots, stats(), step(dt), setAnim}.

## NEXT (ordered)
1. More civ sculpting vs refs (arms still slim/straight; front abdominal plate subtle).
2. Optional: an instanced/impostor path for very large crowds (current far LOD ~5.6k tris, 4–5 draw calls).
3. New roster kinds from DESIGN §10.2 when scheduled: turret, rustkin, spider, seraph, boss_*.

## Requests / findings for others
- **world**: the PMREM env is hazy and uniform, so chrome reads as white plastic in-game. Please add a darker ground/under-horizon band and a few dark building cards to `buildEnvironment()` so chrome and gold get contrast (compare gallery `?env=mine` vs default).
- **world**: `createPost()` Grade shader failed to compile when I tried it in the gallery (redefinition of `toneMappingExposure` / tonemapping functions — ShaderMaterial already gets `tonemapping_pars_fragment` when renderer.toneMapping ≠ NoToneMapping). May have been mid-edit; the gallery uses its own OutputPass unless `?post=game`.

## Gotchas
- Vendored addons import bare `three` → pages need an importmap with `three` and `three/addons/`.
- Pure metal with no `scene.environment` renders black — expected.
- The session scratchpad root is shared with other agents (my first `shot.mjs` got overwritten) — use `scratchpad/robots/`.
- `cdp` hard cap is 1 h; restart with `~/.claude/bin/cdp start --port 9303 --idle 900 -- --use-angle=metal`.

## Screenshots (scratchpad, not committed)
`/private/tmp/claude-501/-Users-aaronair-cc/1d6547c7-2740-4d63-ae18-29731d9d22a2/scratchpad/robots/shots/` — lineup2.png (all kinds), g5.png (brawler/gunner/enforcer), civ2.png (civ close-up), rental1.png, tiers.png, act1.png + act2.png (action sheets), sheet_walk.png / sheet_run.png, hq.png / hq2.png (rat/drone), iso1.png + crowd1.png (game camera at 915×412).
Driver: `node scratchpad/robots/rshot.mjs out.png "query" w h waitMs evalExpr`; `sheet.sh out.png kinds rot "anim:t ..."`.
