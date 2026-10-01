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
- 2026-09-26: art round 1 DONE (4 blind critic rounds, 3–4/10, crowd/cafés/totems/trees/fountain/skyline ring/billboard hook; see notes/art.md). Pushed 57adccfa. Live check: 1st run "ready false 96 s" was host GPU contention (3 headless Chromes); the retry was ready in 9 s with 0 failed requests. The title screen draw load (495 calls / 860k tris) is on art round 2's list.
- Running: integrator (P1 polish + D16 camera look; pitch amended to ~12–70° per art finding), art round 2 (phone perf, floor clutter, chrome contrast, low-pitch vistas).
- 2026-09-26 22:34: pushed 767f8114 (camera look controls, touch fix, uber batching). Terminal was restarted; agents resumed via SendMessage (art round 2 ae37ea26…, integrator #3 a07ab74e…).
- 2026-09-26 22:47: Aaron wants to look up → manager added D17 look-up + debug readout (297b4c75, camera.js only). Tested at 0/+20/+45° up: 60 fps, 151–229 calls. Waiting for his angle report.
- 2026-09-26 22:58: Aaron on S22 (tier high): look-up approved, readout removed (a7f16938). fps: look-up ~70, crowd view 44–52, idle ~56 (60 Hz adaptive cap), dragging 70–100 (120 Hz touch boost). Civilians get stuck on planters. Both sent to art round 2.
- 2026-09-26 23:10: Aaron: HIRA sounded like a little girl → manager redesigned the voice (young woman, f0 ~211–242 Hz, lighter FX) and regenerated 26 lines; pushed 9a741c4a. Aaron: the lake could look better → sent to art round 2 (depth colour, fresnel, layered normals, sun glitter, falls foam).
- 2026-09-26 23:21: art round 2 DONE (lake, floor, crowd pathing 0 stuck, vistas ≤253 calls, title 268/619k, fade any yaw). Pushed c45b5e05; live verified. Launched art round 3 (phone fill-rate, haze, falls mist, floor grounding). integrator #3 still running (told about the ?noui bug).
- 2026-09-26 23:45: **P1 PLAYABLE** (integrator #3; table in notes/integrator.md). Decisions D19–D21. Pushed f786c40a; live verified (ready 5 s, 0 bad). Launched **P2a gameplay** agent (notes/gameplay.md). Running: art round 3 + gameplay P2a. P2b (Brightline district) after art round 3.
- 2026-09-27 00:15: art round 3 DONE (dpr-3 frame 12–19→6–8 ms, same look; aerial haze, falls mist, contact AO; black-frame half-float overflow fixed). Exposure test (?exp=0.65/0.5) only darkens the foreground; the milky distance is the haze colour, so the grade is kept (D18). Pushed ee1aaada; live verified. Launched **P2b world** (Brightline district, district API, relay, boss_kettle, drop-pod). Running: gameplay P2a + world P2b.

## CURRENT STATE SNAPSHOT (2026-09-27, before manager compaction)
- Live = ee1aaada (art r3) on top of P1 PLAYABLE (f786c40a). Cap: **2 agents**.
- Running: **gameplay P2a** (ae99e6a3…, notes/gameplay.md) and **world P2b Brightline** (ae783c5a…, notes/art.md "P2b"). Either may die at the usage limit, so resume via SendMessage to its id (the transcript survives) or relaunch "continue from notes".
- On each agent report: verify the boot + `?auto=1&speed=3&fresh` 40 s smoke (scratchpad/world/shot.mjs, port 9310) + `node tools/sim/test.mjs --quick`, `git status --short gms/lib`, commit `-- gms/3d/heirframe` only, push, then run scratchpad/mgr/live.mjs (fresh profile, port 9313).
- Next after P2a+P2b: integrate the district switch (gameplay), then P3 (Act 2: Verdant Terraces + Nexus Arcology). 11 districts are planned (DESIGN §8); only Aurum is built, Brightline is in progress.
- Open look items: gameplay-floor critic score 3/10, distant haze colour (not exposure), falls curl and foam ring. Aaron is happy with the look (D18).
- Aaron's queue: a **NEONHAUL graphics/game pass** (manager-run sub-agents) AFTER HEIRFRAME, which has priority. Start by reading neonhaul docs/MANAGER_STATE.md, ART_PASS.md and SCORES.md and the original prompts.
- Size (tracked, 2026-09-27): runtime ≈ 20.2 MB = music 15.2 MB (15 tracks) + VO 3.2 MB (134 clips) + js 1.2 MB + css 0.15 MB + shared three 0.180 (2 MB folder, ~1.3 MB used). Not needed at runtime: refs 5.4 MB (ui_kit only), docs 0.3 MB, tools 0.25 MB.
- 2026-09-27 04:53: both agents (P2a gameplay, P2b world) died at the limit (P2a starting the heat responder module, P2b after the Mk II visuals with the relay end-to-end test next). Both resumed via SendMessage after the reset. Nothing new pushed since ee1aaada.
- 2026-09-27 05:10: **P2b DONE** (Brightline district + API, relay, breakables, Kettle, drop-pod, Mk II; critic 5/10 vs refs 8; perf in budget). Pushed ef931a2f (includes P2a in progress; the auto smoke passes); live verified (ready 9 s, 0 bad). Launched **art round 4** (Brightline/Aurum look: window-dimming re-judge, far crowds, billboards, Aurum milky distance). Told gameplay P2a about the district API; the integration is P2c if it runs out of room. Running: gameplay P2a + art r4.
- 2026-09-27 09:50+: both agents (gameplay P2a, art r4 a5204b2a…) died at the limit; resumed via SendMessage after the reset.
- 2026-09-27: **art r4 DONE** (interior-lit windows, far-crowd sprites 1 call, sky swarm, billboard reels + tower ads; critic flat at 4.2–4.3, +0.1 ms). Pushed 1e952941. Open ideas: ?grade=gold (ask Aaron), a lower default camera/zoom for the gameplay frame (Aaron likes the current one, so ask first), far-tower spires. Launched **P3w world** (a576a0f9…: verdant + nexus districts, Halloran boss). Running: gameplay P2a + P3w.
- 2026-09-27: **P2a PLAYABLE** (gameplay notes). Push held: P3w's world.js imported missing verdant/nexus (boot broken); asked it to stub them. Launched **P3g gameplay** (a27cc35e…: P2c then P3 systems then Act 2 staging). Running: P3w + P3g. D22.
- 2026-09-27: pushed e6d210b8 (P2a PLAYABLE + P3w verdant WIP) after P3w reported boot green; live check below.
  live verified e6d210b8: 0 bad; ready 21 s and 31 s under agent GPU contention, then 7.2 s (143 reqs, 0.95 MB before ready; scratchpad/mgr/live_net.mjs lists the slowest requests).
- 2026-09-27 14:50+: P3w (a576a0f9…) and P3g (a27cc35e…) died at the limit; resumed via SendMessage.
- 2026-09-27: **P3w DONE** (terraces/arcology/arcology_servers, lifts, halloran/seraph/turret; critic 3.9→5.0; no leaks). Pushed 2ff86b9c. Forwarded its requests to P3g. Launched **art r5** (a6ac34c7…: crowd variety, gameplay-frame richness). Running: P3g + art r5.
- 2026-09-27: Aaron → D23. Art r5 redirected from crowd variety to lake motion and then the P4 districts (portside, stacks, home pod). Parked: the dialogue speaker-portrait UI, to revisit after the main game is built.
- 2026-09-27 23:40+: P3g + art r5 died at the limit; resumed via SendMessage.
- 2026-09-28: **art r5/5b DONE** (lake motion ?lake=old A/B; portside/stacks/home; unwired civ anims in anims.js). Pushed 6629232b. Launched **P5w world** (a1d2a52e…: spine/hullside/meridian/helm, spider/sovereign/human body). Running: P3g + P5w.
- 2026-09-28 04:40+: P3g + P5w died at the limit; resumed. Aaron: ?district links only change the title backdrop (Continue/New go to Aurum), so he asked for a debug path with god mode + start point → D24, given to P3g as top priority.
- 2026-09-28: Aaron: title Settings rendered under the title → manager fix (.hf-panel z-index 20), pushed 5e219a57. **D24 dev mode DONE** (P3g), verified (straight-in to portside, 0 js/dev fetches on a normal boot); pushed a3cdd733, live verified. Running: P3g (A2-M5, VO) + P5w.
- 2026-09-28: Aaron: cap **1 agent**; both 5-hour and weekly usage are nearly out (resets tomorrow). Let P3g + P5w finish; launch nothing new while both run, and afterwards at most 1. Verify and push what finishes. On Aaron's next message after the reset: resume or relaunch 1 agent (P3g first; gameplay leads, world is ahead).
- 2026-09-28: **P5w DONE** (12 districts, Act 5–6 kinds; requests for gameplay in the art.md P5w section). Pushed; live check done. Aaron confirmed cap = 1 ('only a single sub'). Running: P3g only.
- 2026-09-29: P3g died at the weekly limit (UI for rep standing and Fabricator recalibrate); resumed after the reset. Cap 1.
- 2026-09-30: **P3 PLAYABLE** (P3g). Pushed 4189c931; live verified (4.5 s, 0 bad). D25. Next: one P4 gameplay agent (Acts 3–4).
- 2026-09-30: launched **P4 agent** (a4930957…, sole agent: Acts 3–4, day/night, rain, heist/wetwork, VO, dev leftovers). Notes: gameplay.md 'P4'.
- 2026-10-01 00:30+: P4 died at the limit; resumed via SendMessage.
- 2026-10-01: **P4 PLAYABLE**, pushed 7ac30106, live verified (4.6 s, 0 bad). D26. Launched **P5 agent** (a242d597…, sole agent: Acts 5–6, bosses, endings, Heirlooms, Nightmare, VO).
- 2026-10-01: Aaron: 98% of the 5-hour window is used, so P5 will be cut off soon. On his next message: resume the P5 agent (a242d597…) by SendMessage, or relaunch 'continue from the gameplay.md P5 section'.
- 2026-10-01 05:30+: P5 died at the limit (early, still reading); resumed via SendMessage.
- 2026-10-01: P5 agent handed back PARTIAL (the auto-mode classifier returned 'no verdict' ×9). Tree verified green; pushed checkpoint b9d25424. Resumed P5 for its unverified items (closing/theEnd/epilogue travel, Dray re-measure, reload check, regressions).
- 2026-10-01: **P5 PLAYABLE**, pushed; live check above. D27. Scratchpad world/ and mgr/live.mjs were wiped (shot.mjs recreated; live_net.mjs survives). Next: P6.
- 2026-10-01: launched **P6 agent** (af05d504…, sole agent: Landfall, Overclock, Legacy, Succession, Voice Hunts, settings, 60 h soak, low/med perf, coach-after-dev-jump bug). After P6: the manager registers projects.js + a screenshot.
- 2026-10-02 03:50+: P6 died at the limit (voice relics); resumed via SendMessage.
- 2026-10-02 08:50+: P6 died at the limit during the 30-min memory soak (checkpoint 7: 60 h soak passed except level 8 pacing + Brawler grunt TTK); resumed.
- 2026-10-01: **P6 PLAYABLE**, pushed dcea3fde; registered in projects.js + assets/screenshots/heirframe.jpg (3e908283), live verified. Launched **P7 polish** (a3cc7f94…: speaker portrait, soak stall, Gunner defend). After P7: HEIRFRAME only (NEONHAUL removed from our queue per D29).
- 2026-10-01: Aaron: don't start NEONHAUL (another agent owns it). D29.
- 2026-10-01 13:50+: P7 died at the limit (before capturing portraits); resumed.
- 2026-10-01: **P7 DONE** (3D speaker busts; heat spiral, escortee and autopilot fixes; soak 1→34 contracts in 30 min). Pushed; live check done. No agent running. Open: human speakers are a faceless hologram mannequin; codex/board portraits are still SVG.
- 2026-10-01: Aaron proposed anonymous avatars for humans → D30 Veils. Launched the P8 veils agent (sole).
- 2026-10-01: **P8 Veils DONE** (D30, Mara Flux+LTX ping-pong; start=end loop rejected: near-still and snaps at frame 89). Pushed 64e97b23; live check done. No agent running; waiting for Aaron's playtest.
