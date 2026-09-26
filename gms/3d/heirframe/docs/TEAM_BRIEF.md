# HEIRFRAME — Team brief (all agents read this first)

Game folder: `/Users/aaronair/cc/yru/site/gms/3d/heirframe/` (inside the yru GitHub Pages repo).
Read `docs/DECISIONS.md` (Aaron's brief + manager decisions) and look at BOTH images in `refs/` before starting.

## Hard rules
- **Never `git commit`, `git push`, `git add`, stash, rebase or checkout.** Other sessions share this repo. The manager commits.
- **Only edit files you own** (your brief lists them). If you need a change in someone else's file, write the request in your notes file and message the manager; do not edit it.
- Three.js **0.180.0 vendored**: `../../lib/three/0.180.0/three.module.js`, addons under `../../lib/three/0.180.0/addons/` (check what exists there; if an addon you need is missing, copy it from the matching three release into that vendored folder and note it). **No CDN imports of anything.** Fonts: Google Fonts link is OK but UI must degrade gracefully without it.
- No `alert/confirm/prompt` — styled in-game popups only. Aaron hates blocking modals for nags.
- Landscape, mobile-first. Target phone Samsung S22 Ultra (Adreno 730) — it can take real PBR, shadows and light bloom at ~1.5 dpr. Must also look good on desktop.
- Comments: sparse, only where genuinely confusing. Small sensible files.
- Write progress + findings + requests to `docs/notes/<your-agent-name>.md` as you go (short; this is how the manager and next agents pick up your work).

## Testing
- Local server already running: `http://localhost:8841/gms/3d/heirframe/` (site root served; python http.server).
- Headless Chrome: `~/.claude/bin/cdp start --port <unique port> -- --use-angle=metal` (the helper defaults to SwiftShader; without `--use-angle=metal` fps numbers are fiction). Drive via raw CDP WebSocket from node (v24 has fetch + WebSocket). `cdp stop <port>` when done. Use `Network.setCacheDisabled` so ES module edits aren't served stale.
- Pick your port: planner 9301, world 9302, robots 9303, ui 9304, systems 9305, audio 9306.
- Screenshot at 1280x720 (landscape phone-ish) AND 915x412 (S22 CSS viewport landscape). Look at your screenshots with the Read tool — judge honestly against the refs; self-scores run 1.5–2 points high.
- Every page needs `window.__game`-style debug state for tests where relevant.

## Pause protocol
If the manager messages **PAUSE N** (minutes): reach a safe point, update your notes file, then wait N minutes using `python3 -c "import time;time.sleep(S)"` with S ≤ 540 per call (bash timeout 600000), repeated until N minutes have passed, then continue.

## Shared contracts (v0 — propose changes in your notes, don't silently diverge)
- **World** (`js/engine/*`, `js/world/*`): `createWorld(canvas, {quality})` → `{renderer, scene, camera, update(dt), groundAt(x,z), blocked(x,z,r), spawnPoints, district}`; `scene.environment` is set (PMREM) so all PBR materials reflect it.
- **Robots** (`js/actors/*`): `createRobot({kind, tier=0, seed=1, quality='high'})` → `{root:Object3D, update(dt), play(name,{loop=true,speed=1,fade=0.15}), setMove(speed01), setAim(yawOrNull), hitFlash(), sockets:{head,handL,handR,muzzle,back}, height, radius, dispose()}`. Anim names: idle, walk, run, attack_melee, attack_heavy, shoot, cast, dodge, hit, die, talk, sit. kinds: `rental` (player start), `brawler`, `gunner`, `ghost`, `civ_gold`, `civ_chrome`, `civ_black`, `civ_worker`, `drone_scout`, `security`, `enforcer`, `boss_*` (later). Pure procedural geometry (no external model files), instancing-friendly.
- **UI** (`js/ui/*`, `css/*`): `import { ui } from './ui/ui.js'` — `ui.mount(el)`, `ui.hud.set(partialState)`, `ui.controls.move` → {x,y} in [-1,1], `ui.on(evt, fn)` for `attack|skill(id)|dodge|warehouse|contracts|codex|pause|interact`, `ui.skills.set([{id,icon,label,cd,cdMax,ready}])`, `ui.toast(text,kind)`, `ui.loot(items)`, `ui.damage(x,y,amount,kind)`, `ui.dialogue.show({speaker,portrait,text,voiceUrl,choices})→Promise<choiceIndex>`, `ui.panel.open(name,data)`/`close()`, `ui.marker.set(screenX,screenY,onScreen,label)`, `ui.interact.show(label)/hide()`, `ui.screen(name)` for title/rotate/loading. Full spec: `js/ui/README.md`.
- **Sim** (`js/sim/*`, `js/data/*`): pure JS, **no three.js imports**, node-testable: stats, combat math, loot roller, mission generator, economy, save/load, story progression flags. Deterministic with seeded RNG.
- **Audio** (`js/audio/*`): `audio.music(name)`, `audio.sfx(name,{x,z,vol})`, `audio.vo(key)→Promise`, `audio.setVolumes({...})`, `audio.unlock()` on first gesture.
