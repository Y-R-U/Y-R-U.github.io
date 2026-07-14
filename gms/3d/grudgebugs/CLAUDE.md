# GRUDGE BUGS — 3D worms-with-insects artillery

Turn-based Worms-style artillery in 3D, fought on **narrow ledges** over a
lethal drop. Four insect factions (one procedural googly-eyed model each, plus
a mantis boss), destructible planks, cinematic cameras, instant replays,
talking bugs, a 10-chapter story with an in-engine intro cutscene, and a
mobile-game meta (coins / hat shop / daily streak). Three.js 0.160 CDN
importmap, **no build step**, fully procedural art + Web Audio.
Built 2026-07-15 (Fable 5). Play: `index.html`.

## The pillars

- **The ledge IS the game.** Levels are polyline walk-paths (`js/physics.js`
  ledges); bugs live at `(ledgeIndex, s)` along them. Explosions `biteLedges()`
  — gaps merge, walkable spans shrink, planks re-mesh, bugs left standing over
  a fresh gap drop. Knockback ragdolls (`simulateRag`) either land on a lower
  ledge (fall damage past `landDmgV`) or splash: instant death.
- **Physics is pure `{x,y,z}` math** — no THREE — so node tests it:
  `node tools/test_physics.mjs` (ledge param math, wind drift, grenade
  bounce, rolling dung, explosion falloff/impulse, bites, rag landings).
  Must stay green.
- **Everything is precomputed, then performed.** A shot runs `simulate()`
  instantly → recorded path; the game *plays back* the path while the camera
  rides it. Same for ragdolls. This is what makes replays trivial: ghost
  clones re-act the recorded paths from a new angle — real state is never
  touched twice.
- **The camera is a character** (`js/cameras.js` CameraDirector). Modes:
  menu-orbit / player orbit / over-shoulder aim / turn-start flyby / follow
  (bullet cam with orbital drift + slow-mo on final approach) / impact
  pull-back beat (timeScale 0.12) / fall cam (rides screaming bugs down) /
  5 replay angles (worm's eye, drone, victim, dolly, security) / winners'
  orbit / scripted `cine` for cutscenes. `timeScale()` dictates world speed,
  longshot-style. Trauma-decay shake; letterbox bars + banners.
- **Bugs talk** (`js/voice.js`): persona line libraries (mobster / builder /
  goth / corporate / zen + shared) × situations (turn, taunt, hurt, fear,
  falling, kill, revenge, selfhit, wind, sudden, land, slap, win, lose).
  DOM bubbles projected over heads + per-faction gibberish chirps
  (`audio.speak`, per-species base freq/rate/wave).

## Files

`js/config.js` **all tuning** (physics, rules, weapons, factions, hats,
themes, AI diffs, camera params) · `js/utils.js` PRNG/vec helpers ·
`js/save.js` profile · `js/physics.js` **pure sim** · `js/bugs.js` procedural
species + outfits + hats + shared anim rig · `js/level.js` layout gen, themed
arenas, plank re-meshing, the Sandwich · `js/weapons.js` projectile/shoe/
bomber/reticle/trajectory meshes · `js/game.js` **Battle: turn engine, firing,
playback, rags, sudden death, replays** · `js/ai.js` sampling solver +
personality error · `js/cameras.js` director · `js/fx.js` particles ·
`js/voice.js` bubbles+lines · `js/audio.js` procedural sfx + 2 music beds ·
`js/input.js` touch/keys · `js/ui.js` screens/HUD/shop/daily (popups, **never**
alerts) · `js/story.js` chapters + intro cutscene + dialog · `js/main.js`
boot/modes/loop/flags.

## Design decisions

- Weapons: bazooka & grenade & loogie & slap infinite; cluster/dung ×2,
  SHOE/Bee-52 ×1 per battle. Strikes aim with a draggable reticle
  (`battle.targeting`), fired by the FIRE button.
- Wind (bazooka/loogie only) is biased low (`rng()*rng()`), labelled from
  "dead calm" to "ABSOLUTE HURRICANE".
- Sudden death: round > `suddenDeathRound` ⇒ THE JAM RISES — killY climbs
  `jamRisePerTurn × (1 + 0.18·turns)` (accelerates, so 1v1 stalemates
  between sloppy AIs always end).
- AI (`planTurn`): melee if adjacent, strikes on 2+ clusters, else 20
  simulated candidate shots through the REAL physics scored by damage/kills/
  knock-off minus friendly fire, then personality error (Mild Salsa 0.30rad →
  Nuclear 0.06). AI runs a staged script (walk → swing aim → charge) so its
  turns look alive.
- Menu is a live 3D stage (a cinematic Battle) behind translucent UI.
- Story: player faction = profile faction; a chapter enemy matching it is
  swapped. Stars: win + ≥2 bugs alive + ≤7 rounds.

## Gotchas

- **Shard chains**: `_detonate` looks the weapon up by `rec.weaponId`, so
  cluster shards re-read `shards:4` from config — shard recs carry
  `isShard`, and the spawn block is gated `w.shards && !rec.isShard`.
  Without it the picnic detonates forever (pendingShards → ∞, battle never
  ends). This happened; don't reintroduce it.
- **Replays**: `opts.replays` may be `'force'` (via `?replays=1`) which
  overrides `fast`; plain `true` is skipped in fast/auto mode.
- `_launchRag` ignores the bug's own ledge until it clears the slab
  (`ignoreUntilClear`) or every knockback re-lands where it started.
- Impact/fall cameras must clamp above `battle.killY` (rising jam!) or the
  lens dips under the abyss plane — both already clamp; keep it when adding
  camera modes.
- Ledge meshes rebuild only via `arena.refreshDirty()` after `biteLedges`.
- Voice bubbles anchor to `bug.rig.head` world position each frame; battles
  must `voice.clear()` on dispose.

## Testing

- `node tools/test_physics.mjs` — pure physics, all green.
- Headless: serve site root (`python3 -m http.server 8931`), puppeteer-core +
  Chrome `--use-angle=swiftshader --enable-unsafe-swiftshader`.
  Poll `window.__state()` → `{mode,phase,round,over,winner,proj,rags,pend,
  teams,errors}`; drive `window.__game` (`battle.addAim/startCharge/
  releaseCharge/selectWeapon`, `ui.toggleWheel`, `startQuick`, `startStory`).
- URL flags: `?auto=1` (all-AI, sets `window.__done`+`__result`), `?fast=1`
  (skip flybys/replays/dialog), `?replays=1` (force replays even in auto),
  `?lite=1`, `?nosave`, `?seed=N`, `?ch=1..10` (straight into a chapter),
  `?shot=1` (staged thumbnail, `window.__shotReady`), `?rivals=1-3&diff=id`
  (auto battles).
- Watch `pend` in `__state` — if it climbs past ~10 the shard chain is back.
- A battle between AIs lasts 2–6 rounds; teams mostly die by knock-off
  (fall = full bug), which is intended Worms chaos.
