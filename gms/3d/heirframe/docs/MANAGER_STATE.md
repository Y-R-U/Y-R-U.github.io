# HEIRFRAME — Manager State

Read this first when resuming. Then DECISIONS.md, then docs/BUILD_PLAN.md (once the planner writes it).

## Run protocol (Aaron's rules)
- Aaron may send a **number N** → let running agents finish until only N remain; don't launch replacements beyond N.
- **"pause for X mins"** → SendMessage every running agent: PAUSE X minutes. Agents checkpoint notes and sleep.
- Manager makes most game decisions; ask Aaron only for true preferences. Push to Pages at playable milestones.
- Live: https://yru.br8t.com/gms/3d/heirframe/ · Local: http://192.168.0.236:8841/gms/3d/heirframe/ (python http.server on site root, port 8841)

## Phase 0 (started 2026-09-26) — 6 agents in parallel (Aaron: up to 6)
Agents: planner, world, robots, ui, systems, audio — briefs in TEAM_BRIEF.md + the launch prompts; notes in docs/notes/<name>.md
| Agent | Owns |
|---|---|
| planner | docs/DESIGN, STORY, MISSIONS, ECONOMY, VO_LINES, BUILD_PLAN |
| world | index.html, js/main.js, js/engine/*, js/world/*, js/fx/* |
| robots | js/actors/*, tools/robot_gallery.html |
| ui | js/ui/*, css/*, tools/ui_kit.html |
| systems | js/sim/*, js/data/*, tools/sim/* |
| audio | js/audio/*, audio/*, tools/vo/*, tools/audio_test.html |

Contracts: see TEAM_BRIEF.md "Shared contracts".

## UI ⇄ engine contract (v0)
`import { ui } from './ui/ui.js'` — `ui.mount(el)`, `ui.hud.set({...})`, `ui.controls.move` {x,y}, `ui.on(evt, fn)` for 'attack'|'skill'|'dodge'|'warehouse'|'contracts'|'pause', `ui.toast`, `ui.loot`, `ui.damage(x,y,n,kind)`, `ui.dialogue.show({...})→Promise`, `ui.panel.open(name,data)`, `ui.marker` (off-screen objective arrow). Full spec in js/ui/README.md (ui agent writes).

## Agent cap / cutoff plan
- 2026-09-26: Aaron said **"2"**. The 6 Phase-0 agents finish their current work; after that, **at most 2 agents run at once**.
- A usage limit is expected at some point in the next 5-hour window. Every agent was told to checkpoint `docs/notes/<name>.md` (DONE / IN PROGRESS / NEXT) about every 15 minutes.
- **When an agent dies mid-task:** read its notes file, check its files still work (index.html boots, `node tools/sim/test.mjs` passes, robots.js and ui.js import), then launch a fresh agent with "continue from docs/notes/<name>.md".
- **When Aaron types after a limit:** the limit has reset. Relaunch the next batch in that same turn; don't ask.
- Agent IDs, for SendMessage while they're alive: planner ac84f603…, world ad12d866…, robots abb8f1ae…, ui a97d1aef…, systems a160b945…, audio ad71b039….

## Log
- 2026-09-26: folder scaffolded, refs copied to refs/, NEONHAUL music copied to audio/music (menu, cruise_a/b, cruise_day, docked, boss 49s, net 24s).
- 2026-09-26: planner DONE (DESIGN, STORY, MISSIONS, ECONOMY, VO_LINES, BUILD_PLAN; ~26k words). Decisions D11–D15 recorded; systems/audio/robots/ui/world messaged to align. 5 agents still running.
- 2026-09-26: Aaron said **"1"**, with a usage limit expected within minutes. Cap is now **1 agent**. Launch nothing new until the limit resets.
  **RESUME CHECKLIST (after the limit):** (1) Each running agent (world, robots, ui, systems, audio) may have died mid-task. Read each docs/notes/<name>.md and check its deliverable works. (2) Relaunch unfinished agents one at a time, up to the cap Aaron gives, each told to "continue from docs/notes/<name>.md". (3) Then run the P1 integration agent (owns js/game/*, per BUILD_PLAN P1). (4) Commit only gms/3d/heirframe/ and push once P1 is playable.
- 2026-09-26 (after reset): all 5 remaining Phase-0 agents died at the limit. Manager audit: game boots at 60 fps (285 calls / 607k tris); VO 133/133 P0 clips done; sim smoke tests pass; UI not screenshot-verified; systems balance/tests/README unfinished. Gameplay view looks washed out and the robot reads small (art pass later).
## Phase 1 (2 agents)
- **integrator**: js/game/* + js/main.js + js/engine/player.js (world agent is gone) → BUILD_PLAN P1 first playable. Notes: docs/notes/integrator.md
- **finisher**: systems leftovers (balance.mjs, test.mjs, js/sim/README.md) then UI verification (ui_kit, screenshots, rarity 7-tier, dialogue→audio.vo). Owns js/sim, js/data, tools/sim, js/ui, css, tools/ui_kit.html. Notes: docs/notes/finisher.md
- 2026-09-26: checkpoint commit 42eff3c3 pushed (heirframe folder only; walk-around, not in projects.js). integrator + finisher running.
- 2026-09-26: **live checkpoint hung on the boot watchdog** (Aaron reported it). Cause: the world agent vendored 4 three addons into shared `gms/lib/three/0.180.0/addons/` (outside the game folder), and my folder-only commit left them untracked, so they 404'd live. Local testing hid it because http.server serves the working tree. Fixed in 40d18a4e; the live load verified in a fresh profile (ready 4.5 s, only the optional js/game/game.js 404s).
  **PRE-PUSH CHECK from now on:** `git status --short gms/lib` for new vendored files, then after deploy run `scratchpad/mgr/live.mjs` (fresh profile, port 9313) against the LIVE url and read its list of failed requests.
- 2026-09-26: Aaron asked for a fullscreen toggle. Manager added js/ui/fullscreen.js + buttons in the HUD menu row and the title corner (locks landscape). Pushed 3155c878 (snapshot incl. finisher's work + integrator's partial P1: title, intro dialogue, HUD). Live verified in a fresh profile: ready 7.3 s, zero failed requests. finisher DONE; running: integrator, art.
- 2026-09-26: both agents died at the limit again; resumed as integrator(2) + art(2). Pushed 3a98127c (A1-M1 + contracts + combat + loot + marble floor). Live check below.
  live verified: fresh profile, ready, zero failed requests
- Aaron: right-side look/zoom/reset view → sent to integrator as priority (D16).
