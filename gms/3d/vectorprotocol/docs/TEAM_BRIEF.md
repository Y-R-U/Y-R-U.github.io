# VECTOR PROTOCOL — Team brief (every agent reads this first)

Game folder: `/Users/aaronair/cc/yru/site/gms/3d/vectorprotocol/` (inside the shared yru GitHub Pages repo).
Read `docs/DECISIONS.md` (Aaron's brief + manager decisions) and **look at every image in `refs/`** before starting (Aaron may add more mid-run; re-check `refs/` at each checkpoint). `refs/ref_battle_01.png` is the target for the battle screen.

## Hard rules
- **Never `git commit/push/add/stash/rebase/checkout`.** Other sessions share this repo. The manager commits.
- **Only edit files you own** (table below). Need a change elsewhere? Write the request in your notes file under "Requests" and keep going with a local workaround. Never silently diverge from a contract; propose changes in your notes.
- **Syntax-check every ES module you edit** with `node --input-type=module --check < file.js` (plain `node --check` misses module errors such as a duplicate `function` declaration, which once broke every page for minutes).
- **D19: the tree must boot at every moment.** Never import a file that doesn't exist yet; stub it in a file you own instead.
- Three.js **0.180.0 vendored**: `../../lib/three/0.180.0/three.module.js`, addons under `../../lib/three/0.180.0/addons/` (only some exist; if you copy a missing addon in from the 0.180.0 release, list it in your notes). Pages need an importmap for `three` and `three/addons/`. **No CDN imports.** Google Fonts link is OK; UI must degrade gracefully without it.
- No `alert/confirm/prompt` — styled in-game popups only.
- **Portrait, mobile-first** (D3). Target phone Samsung S22 Ultra (Adreno 730) — it handles PBR, shadows, bloom and a planar mirror at ~1.5 dpr. Must also look good as a centred column on desktop.
- Comments sparse, only where genuinely confusing. Small, sensible files.
- **HEIRFRAME** (`../heirframe/`) is a gold mine: rig/IK/PartBuilder/materials (`js/actors/`), renderer/quality/atmosphere (`js/engine/`), planar mirror floor (`js/fx/reflection.js`), boot watchdog (`index.html`), CDP test patterns (its `docs/notes/*.md`). **Copy and adapt into your own files; never import across folders.** Read its notes for gotchas (e.g. alpha-to-coverage vs single-sampled mirror = white smears).
- Usage limits WILL cut you off mid-task. **Checkpoint your notes file every ~15 minutes** with DONE / IN PROGRESS (exact file + what's half done) / NEXT, so a fresh agent told "continue from docs/notes/<you>.md" can carry on cold.

## Ownership
| Agent | Owns | Notes file |
|---|---|---|
| design | `docs/DESIGN.md`, `docs/STORY.md`, `docs/MAPS.md`, `docs/ROSTER.md`, `docs/ECONOMY.md`, `js/data/*` | `docs/notes/design.md` |
| sim | `js/sim/*`, `tools/sim/*` | `docs/notes/sim.md` |
| robots | `js/actors/*`, `tools/gallery.html` | `docs/notes/robots.md` |
| battle | `js/engine/*`, `js/battle/*`, `js/fx/*`, `tools/battle_test.html` | `docs/notes/battle.md` |
| hub | `js/hub/*`, `js/map/*`, `tools/hub_test.html`, `assets/maps/*`, `assets/hub/*` | `docs/notes/hub.md` |
| ui | `index.html`, `js/main.js`, `js/app/*`, `js/ui/*`, `css/*`, `tools/ui_kit.html` | `docs/notes/ui.md` |
Manager owns `docs/DECISIONS.md`, `docs/TEAM_BRIEF.md`, `docs/MANAGER_STATE.md`, git.

## Testing
- Static server already running: **http://localhost:8888/gms/3d/vectorprotocol/** (serves `~/cc/yru/site`; also on the LAN at 192.168.0.236:8888 for Aaron's phone). Don't start other servers on 8888.
- Headless Chrome: `~/.claude/bin/cdp start --port <your port> --idle 900 -- --use-angle=metal` (without `--use-angle=metal` it is SwiftShader and fps numbers are fiction). Drive via raw CDP WebSocket from node (v24 has fetch + WebSocket). `Network.setCacheDisabled` so ES-module edits aren't stale. `cdp stop <port>` when done. Hard cap 1 h per browser — restart if needed.
- Ports: design 9401, sim 9402, robots 9403, battle 9404, hub 9405, ui 9406.
- Screenshot at **412×915** and **390×844** (portrait phone, dpr 2) and 1280×800 (desktop column). **Look at your screenshots with the Read tool** and judge honestly against the refs — self-scores run 1.5–2 points high. Keep test scripts/screens in `<scratchpad>/<agent>/`.
- Expose a `window.__vp` (or per-tool `window.__gallery`, `window.__battle`, …) debug object so tests can wait for `ready` and read state.
- The GPU is shared by up to 6 agents: keep headless browsers short-lived, don't leave render loops running, and re-measure fps when numbers look odd (contention is common).

## Shared contracts (v0 — propose changes in your notes, don't silently diverge)
- **Engine** (battle agent, `js/engine/*`): `createEngine(canvas, {quality})` → `{renderer, quality, setScene(sceneObj), resize(), onFrame(fn), env (PMREM texture), post (bloom/output), stats()}`. A *scene object* is `{scene, camera, update(dt, t), resize(w,h), dispose(), pick?(x,y)}`. Only one is active at a time (D16). Engine also exports `quality.js` tier detection.
- **Units** (robots agent, `js/actors/*`): `createUnit({model, rarity='common', faction='corporate', seed=1, quality='high'})` → `{root, update(dt), play(name,{loop,speed,fade}) → duration, setFacing(yaw), hitFlash(color?), setShield(0..1), sockets:{muzzle, muzzleL?, head, core, hand?}, height, radius, onEvent(fn), dispose()}`. Anims: `idle, advance, attack, attack_alt, cast, overdrive, hit, die, victory, deploy`. `onEvent` fires `fire` / `impact` / `cast` at the right frame of an anim so VFX sync. `MODELS` = registry of model ids with role and default faction. `renderPortrait(model, opts) → Promise<ImageBitmap|dataURL>` (cached) for cards; `createTurntable(engine, unitOpts)` scene object for the profile view.
- **Sim** (sim agent, `js/sim/*`): pure JS, **no three.js, no DOM**, node-testable, seeded RNG. `simulateBattle({player, enemy, waves, seed, inputs?})` and a stepper `createBattle(...)` → `{step(dtTicks), events[], state, fireOverdrive(unitId), done, result}`. Event stream: `{t, type:'attack'|'hit'|'ability'|'heal'|'shield'|'buff'|'debuff'|'death'|'wave'|'overdrive_ready'|'end', src, dst, amount, crit, ability, ...}`. Plus progression/economy/save modules (`js/sim/README.md` documents everything). **Data schema** lives in `js/sim/SCHEMA.md`; design writes `js/data/*` to that schema.
- **Battle** (battle agent, `js/battle/*`): `createBattleScene(engine, {playerSquad, enemyWaves, seed, arena})` → scene object + `{start(), setSpeed(1|2|4), setAuto(bool), fireOverdrive(slot), on('state'|'end', fn), state}`; it owns the sim stepper for the fight and drives `createUnit` instances + VFX from sim events. Until sim lands it uses its own mock sim with the same event shape.
- **Hub/Map** (hub agent): `createHubScene(engine, {companyLevel, unlocked})` → scene object + `on('select', id => …)` where id ∈ `story|arena|events|squad|workshop|recruit|hq`; label positions projected each frame into a DOM overlay the hub agent owns (`js/hub/labels.js`). `createStoryMap(container, {mapId, progress})` → `on('level', levelId => …)`.
- **App/UI** (ui agent): `index.html` + `js/main.js` boot, `js/app/router.js` screen routing (`#/hub`, `#/map/3`, `#/squad`, `#/battle`, …), `js/app/store.js` (state, wraps sim save/progression), `js/ui/*` screens + battle HUD (top integrity bars + round, bottom portrait strip with HP + ability icons + overdrive charge, side speed/auto) driven by battle `state` events. The UI agent is the integrator: it wires hub, map, battle and the 3D profile together.
