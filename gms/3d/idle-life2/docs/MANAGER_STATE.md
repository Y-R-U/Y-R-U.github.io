# Idle Life 2 — manager state

Read this first. Claude (Opus) is MANAGER; sub-agents design, build and review. Manager owns integration, commits and pushes.

## Brief (Aaron, 2026-10-03)
IMPORTANT (Aaron): the numbered points below are INSPIRATION, not a spec. Challenge them — keep what's great, improve or
replace what isn't, and add better ideas. The goal is the best game we can make, not box-ticking.

Make "Idle Life 2", a far superior sequel to /gms/pwa/idleLife/ (2D emoji career clicker: jobs → businesses → space mogul, prestige).
Use the same brief Aaron gave Codex ("Astra") for Idle Transport 2 (/gms/3d/idle-transport2/), and beat that game:
1. Top section: amazing Three.js main scene. Each list line is its own wide mini Three.js scene showing that business working;
   main view cycles highlights between lines (timed), a line icon can pin the main view to it. Lines and main view share the same world/actors.
2. Lots of features: progression maps — start in easy areas, unlock harder areas/lands.
3. First business is NOT free: tap the main scene to earn it before any idle income. Random events (timed opportunities, no penalty).
4. Line scenes edge-to-edge showing real activity for that business; output piles up if not collected/transported; upgrades are small
   partly-transparent floating icon buttons along the bottom of the scene (+🚚, +🌾, 🕴 manager) with a toast/floating text explaining
   what was bought; quantity selector x1 / x10 / max. Progress bar = bottom border of the scene. Minimal words: a floating badge,
   everything else behind an ⓘ popup.
5. Manager: tap opens a manager interface; managers upgrade and have equipment slots for tools/enhancements earned in mini-games.
6. Seasonal/limited side worlds (e.g. Halloween variant of the same businesses) available on certain days/weeks/months; progress to
   levels to earn permanent bonuses assignable to character (all games), main business, or a manager.
7. Mobile black-screen-on-return must never happen (WebGL context loss / visibility handling).

## Standing rules
- Vanilla JS ES modules, no build step. Three from /gms/lib/three/0.160.0/ (LOCAL — a CDN importmap hangs silently).
- Popups, never alert/confirm. No blocking modals for nudges. Mobile-first portrait; desktop must also look good.
- Few comments. Site server is :8888 (python, already running) — never start another on that port.
- Headless tests: ~/.claude/bin/cdp, pass `-- --use-angle=metal` for real GPU numbers; disable cache for module reloads.
- Agents never commit/push; manager does selective `git add` of gms/3d/idle-life2/ (+ projects.js line when registering).
- Never touch gms/3d/idle-transport2/ or gms/pwa/idleLife/ (another agent is live on transport2).

## Phases
- [x] P0 Research & design: A design proposal, B competitor teardown of Transport 2 + Idle Life 1, C tech architecture.
- [x] P0b Adversarial design challenge: an independent agent attacks the proposal AND Aaron's brief, pitches alternatives.
- [x] P1 Manager synthesises docs/DESIGN.md + docs/CONTRACT.md (module ownership/APIs).
- [ ] P2 Build: parallel builders by file ownership.
- [ ] P3 Adversarial reviews (blind critic, economy sim, mobile/lifecycle), manager triage.
- [ ] P4 Improvement rounds, screenshots, register in projects.js, commit + push, verify Pages deploy.

## Log
- 2026-10-03: folder created; P0 agents launched.
- 2026-10-03: P0 design proposal done (research/DESIGN_PROPOSAL.md). P0b challenger launched. Waiting on teardown + architecture.
- 2026-10-03: P0b challenge done (research/DESIGN_CHALLENGE.md): R1 pile/σ inversion, R2 tap dominance, R3 life beats too late, R4 education timers — all must be resolved in DESIGN.md.
- 2026-10-03: P1 done → docs/DESIGN.md (binding rulings) + docs/CONTRACT.md (lanes). Launched P2a scaffold agent and art-direction (Flux concept stills → docs/art/, docs/ART_DIRECTION.md). Teardown still running.
  P2a scaffold DONE (docs/SCAFFOLD.md, test-boot passes).
- 2026-10-03: teardown done (research/TEARDOWN.md); DESIGN §6 added from it.
- 2026-10-03: P2b launched L1 economy, L2 render core, L4 UI (in parallel). L3a/L3b wait on ART_DIRECTION.md from the art-direction agent. If session dies: re-launch any lane whose docs/<LANE>.md is missing/incomplete with the same brief (lane briefs = CONTRACT.md ownership + DESIGN.md).
- 2026-10-03: Aaron: placeholder art unacceptable → DESIGN §4 now mandates FACET kit + CRAFT.md + blind critic ≥8/10. L3a launched (kit port, world, OldTown/Suburbs plots, home/life). L3b launches once docs/ART.md exists (kit API).
- 2026-10-03: Aaron: follow HEIRFRAME's image-direction workflow (refs/ target + artgate.py + blind critic sheets). Sent to L3a + art director; DESIGN §4 updated.
- 2026-10-03: Aaron: low-poly not required; target = great look + runs well on S22 Ultra portrait. DESIGN §4 updated.
- 2026-10-03: Aaron APPROVED the draft concept style (soft warm toy-diorama; scratchpad/art sh_town_port + sh_cards).
- 2026-10-03: L4 UI DONE (docs/UI.md, test-layout passes). L1 economy DONE (docs/ECONOMY.md; sim meets all DESIGN §3 targets; active/idle ≤2.02×; 36/36 tests; R1 plant falsified). Manager wired main.js: persistOff, wireRenderCore, save chips, 1s-debounced save on retire/life beats; test-boot purity regex fixed; cdp VIEWPORTS has s22 412x915.
  Ruling: gen-2 Downtown at 11:22 (fast edge of band) accepted — don't weaken persisted managers.
  NEXT P3: UI ↔ real-economy integration pass (L4 wrote defensively before L1 landed) once L2 + L3a finish.
- 2026-10-03: Art direction DONE: docs/ART_DIRECTION.md + docs/art/*.jpg; refs/ = 5 named key stills + 9 approved raw seeds. Sent finals to Aaron.
- 2026-10-03: L3a published ART.md (kit + lemonade reference plot looks good). L3b launched (Harbour/Downtown plots + Hollow's Eve skin). L3a + L2 still running.
- 2026-10-03: L3a DONE (self-score 6–7/10; 6 OldTown/Suburbs plots + home/family/landmarks; ART.md). Blind critic r1 launched on docs/art/critic sheets (copied to /private/tmp/claude-501/il2-critic-r1, no KEY). Sent L2 the post-pass/bloom/tilt-shift + configureRenderer + fog requests. NEXT: art round 2 agent from critic report.
- 2026-10-03: critic r1: render 3–4.5 vs ref 8–9 (REPORT_r1.md). Top: oversized peach paving grid, flat lighting/no visible sun shadows, heavy haze + ghost background, hollow see-through hero buildings, no bevels/soft material, camera too far/high. → art round 2.
- 2026-10-03: L2 render core DONE (RENDER.md; lifecycle tests pass incl. falsification; post.js bloom+tilt-shift; per-view shadow cache; S22 portrait 60fps but rAF p95 8.5ms due to ui.update). P3 integration agent launched (owns UI files): wire UI to real L1/L2 APIs, fix ui.update perf, play-through via CDP. Running: art round 2 (L3a files), L3b, integration.
- 2026-10-03: L3b DONE (ART_B.md; self 5–6.5; bistro best, appstudio weakest; season hero too monochrome purple + ground-heavy framing). Manager installed hollowsEve in main.js; kit requests + cameras.js handed to art round 2. NEXT: after art r2 → blind critic on ALL 12 + season (r2 + rb1 sheets), then art round 3 on the weakest incl. L3b plots.
- 2026-10-03: P3 integration DONE (UI wired to real APIs; all 4 suites pass; S22 rAF p95 5.7ms; full playthrough to gen 2 with zero console errors; shots docs/shots/integ-*.png). Render-fix agent launched for line-less event placement + courier MAX=64 starvation. Waiting: art round 2.
- 2026-10-03: Manager review of integ shots: real game at night (local time) = flat purple wash; cards look blurry/low-res. Sent to art round 2 (judge at tod 9/18/22; night sheet in critic set).
- 2026-10-03: Art r2 DONE: found kit shape.loft winding inside-out (root cause of 'hollow/no sun'); new cobbles, lighting, night pools, rebuilt barber/petsalon/carwash/foodtruck; cards ~30 calls. Open: card blur = host DPR/no-AA on phones (request in CONTRACT). Critic r2 launched on 15 sheets (all 12 plots + hero + night + dusk) at /private/tmp/claude-501/il2-critic-r2.
- 2026-10-03: critic r2: renders 4–6.5 (was 3–4.5). Rank best→worst: foodtruck, lemonade, cafe, boutique, barber, carwash, bistro, fishchips, petsalon, appstudio, ferry, boatyard; hero 6.5 night 6 dusk 5.5. REPORT_r2.md. → art round 3 split: R3A kit/world/lighting/paving/chars/night + OldTown/Suburbs plots; R3B Harbour/Downtown plots + season.
- 2026-10-03: launched R3A (kit/light/paving/chars + OldTown/Suburbs), R3B (Harbour/Downtown + season), fresh-eyes playtester (report only → /private/tmp/claude-501/il2-playtest/REPORT.md). Render-fix (events/couriers) still running. Card-blur host fix pending (after render-fix finishes).
- 2026-10-03: render-fix DONE (line-less events placed in hero shot; tip courier reserve). Launched event-art + card-sharpness agent (owns host/presenter/quality/post/actors/fx + new render/eventart.js).
- 2026-10-04: R3A, R3B, event-art+card-sharpness DONE. Fresh-eyes playtest DONE → docs/review/PLAYTEST_1.md (2 critical bugs: card .flash collision, age soft-lock blocking retire). Rule: every agent using CDP must set its own CDP_PORT (artshot default 9251 collisions killed other agents' browsers).
- 2026-10-04: launched P4 economy/life fix agent + P4 UI/onboarding fix agent (from PLAYTEST_1) + critic r3 (16 sheets, /private/tmp/claude-501/il2-critic-r3). Sent Aaron r3 S22 game shot + event art.
- 2026-10-04: critic r3: 4.5–6.5 (plateauing; ground = #1 complaint 3 rounds running). Plan: ONE more art round (R4A/R4B), allowing small procedural textures for the ground, then ship to Pages for Aaron to judge on his S22 (HEIRFRAME D23 precedent: owner's eye beats critic vs clay renders).
- 2026-10-04: P4 UI fixes DONE (card-flash, coach hints, gate card buys, text toasts, faces-first choices, truncation, outlined floats, hero label, minis at anchors). Launched render bugfix agent for WebGL 'object does not belong to this context' after restore (test-lifecycle flaky).
- 2026-10-04: R4A DONE (procedural cobble/grass textures via kit/surface.js ~2.4MB, roof tiles in shader, chars 1.22×, night mist; self 7–7.5). Sheets *_r4.png. Waiting R4B, P4 economy, render bugfix.
- 2026-10-04: P4 economy DONE: typical profile partner 12:28, kid 30:38, retire 57:57; soft-lock fixed (life XP + apprentice heir); homes age-gated + cheap; walk-in σ 0.35; permit auto-claims finished contracts. Ruling: ~1h life at any speed accepted (gen2 retire ~58m). UI follow-up agent launched. Before ship: run tools/bump.mjs (imports still ?v=20261003a).
- 2026-10-04: R4B DONE (harbour water planes+foam+wakes, new ferry, chunky string lights; self 6.5–7.5). Critic r4 launched.
- 2026-10-04: added idle-life2/.gitignore (docs/shots, docs/art/critic, docs/art/shots, docs/research/shots — 200MB+ local evidence). Commit = ~158 files / 4.6MB. Ship checklist: wait UI follow-up + render bugfix → bump.mjs → all tests → screenshot assets/screenshots/idle-life2.jpg → projects.js entry → selective add → push → check Pages deployment + live URL no ≥400s.
- 2026-10-04: critic r4: mean 6.6 (r1 ~3.6, r2 ~5, r3 ~5.8); best 7–7.5 (boutique, cafe, petsalon, lemonade, hero, dusk, night); appstudio 5.5 worst. #1 now: cobble too contrasty/noisy (-60%). Launching quick pre-ship polish (cobble contrast, black-blob chars in Hollow's Eve, foreground char crops).
- 2026-10-04: UI follow-up DONE (gate card claimed toasts, 🔒 age N, heir toast + apprentices, walk-in copy). Remaining before ship: render bugfix (context-restore warnings) + pre-ship art polish.
- 2026-10-04: render bugfix DONE (restore now builds a fresh renderer; stale-handle rule; test-lifecycle 5/5 with churn step, falsified). Only pre-ship art polish remains.
