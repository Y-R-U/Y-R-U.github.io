# LASTWALL — rogue-lite ragdoll wall-runner (Three.js)

**READ `BUILD_PLAN.md` FIRST** — it is the living project manager (phases, state,
session log). This file is the stable architecture reference.

A very-hard rogue-lite on top of a great wall through a viral apocalypse. Maze
branches, collapsing crack spans, knockback-scaled verlet ragdolls, unlimited
starter weapons + temp pickups + slow-recharge superweapons, per-run powerup
drafts vs permanent Serum upgrades, 100-level Story mode + Endless.

Three.js 0.160 via CDN importmap, **no build step**, vanilla ES modules, mobile +
desktop. All models are **hand-built from primitives in `js/models.js`** — never
import external character assets; ragdoll/dismemberment requires part-separable
meshes, and this keeps the repo fully committable.

## Architecture (one line per module)

- `js/config.js` — ALL tuning numbers + URL modes (`?lvl=N ?endless ?nosave ?lite ?shot ?auto`)
- `js/utils.js` — math, seeded RNG (mulberry32), helpers
- `js/world.js` — sky/fog/dusk sun/lights/bloom, ground + infected sea far below
- `js/wallgen.js` — seeded level graph → wall spans/towers/gates meshes + parapet
  instancing + props + **rect-union colliders** + crack/collapse rigs + pickups.
  Exports `buildLevel(seed, n)` → `{group, rects, spawnPts, gates, cracks, pickups…}`
- `js/models.js` — humanoid part factory (`makeHumanoid(kind)`) → `{group, parts,
  animate(t, speed)}`; parts named (head/chest/pelvis/armL…) for ragdoll mapping
- `js/ragdoll.js` — verlet particles+constraints; `fromHumanoid(h, impulse)`;
  parapet slam damage, edge falls, get-up, gib/dismember helpers
- `js/controls.js` — WASD + mouse-orbit / floating touch joystick + 2-finger orbit;
  chase camera
- `js/player.js` — movement/HP/boosts/auto-aim combat/player-ragdoll-on-big-hit
- `js/weapons.js` — WEAPONS table (starters/temp/super) + fire/swing + knockback calc
- `js/enemies.js` — types table + AI (chase/attack/climb ambush) + spawn director
- `js/powerups.js` — per-run draft pool + pick-3 UI + reroll logic + cadence rule
- `js/meta.js` — Serum, permanent upgrades, gates, best-level, save/load v1
- `js/story.js` — BEATS map (level → transmissions), intro + WARDEN popups
- `js/levels.js` — level defs: seed, length, director budget, boss flags, theme
- `js/fx.js` — hitstop, shake, blood, tracers, debris, ash
- `js/audio.js` — procedural WebAudio (shots/thuds/squelch/wind/moans), no files
- `js/ui.js` — HUD + all popups/menus (NEVER alert())
- `js/main.js` — boot, loop, mode/level flow, save orchestration

## Key contracts

1. **Rect-union walkable space**: `wallgen` returns axis-aligned rects (spans +
   tower plazas). `clampToWall(pos)` keeps actors on; ragdoll particles ignore the
   clamp and fall if outside all rects (that's how things fly off the wall).
   A collapsed crack span REMOVES its rect at runtime.
2. **Hit pipeline**: `damage(target, dmg, dir, kbFactor)` → hp; impulse = dmg ×
   kbFactor × boostMult. impulse > `cfg.ragdollThresh` (or death) → convert to
   ragdoll with that impulse. All knockback comedy flows from ONE multiplier path.
3. **Humanoid parts contract**: `models.makeHumanoid()` returns named parts whose
   meshes can be re-parented to ragdoll particles at conversion, and reattached on
   get-up. Never merge these geometries.
4. **Level flow**: `main.js` owns a tiny state machine: title → intro → level(n) →
   (draft?) → level(n+1) … death → bank → meta. Story/Endless share it (Endless
   just has no beats and infinite n with scaling).

## Testing

Serve from site root: `python3 -m http.server 8810`, load
`http://localhost:8810/gms/3d/lastwall/?nosave&lvl=1`. Headless: puppeteer-core +
`--use-angle=swiftshader --enable-unsafe-swiftshader`. Poll `window.__state`
(fps/hp/level/enemies/kills/errors), drive `window.__game`. `?auto` = soak-drive
bot. Headless rAF ~20fps → use real waits, not virtual time.

## Conventions (repo)

In-game styled popups only (no alert/confirm). localStorage key `lastwall_v1`.
Commit WIP to main is fine; DON'T register in `/projects.js` until shipped; when
committing, stage ONLY this folder (other sessions leave dirty files in the repo).
