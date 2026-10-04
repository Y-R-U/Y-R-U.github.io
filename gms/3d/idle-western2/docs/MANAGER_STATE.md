# Idle Western 2 — manager state

Read this first. Claude (Opus) is MANAGER; sub-agents design, build and review. Manager owns integration, commits and pushes.

## Brief (Aaron, 2026-10-04)
Same treatment as Idle Life 2 (gms/3d/idle-life2 — read its docs/DESIGN.md + MANAGER_STATE.md), but for /gms/pwa/idleWestern/ → "Idle Western 2".
Aaron's words, condensed (inspiration, not a spec — improve on it):
- THIS ONE IS FUNNY. Cheeky, rude, risky, M15+. Wild west: gun fights, people kicked out of bars (thrown through the doors into the street),
  bar fights, 10-pace duels in the main view. Exaggerated hats. A brothel is allowed as a business ("nothing too rude but we can be risky").
- Use the LOCAL Qwen TTS (Qwen Voice Studio :7876) for voices; LOCAL music model (ACE-Step :8001) for western background music.
- A piano you can tap that plays a short (random?) piano bit.
- Main zone at the top like Idle Life 2; hold finger down to look around (Idle Life 2 hold-to-look).
- It's a TOWN — you may end up owning half of it. New businesses may be BUILT not just bought, and you watch them being built.
- Play hard on the western theme. "Really have fun with this one."
- Must run well on Aaron's S22 Ultra in portrait (Idle Life 2 perf lessons apply: per-view scheduling, warm-up, pixel budget, scrolling hero).
- Graphics must look great (follow an image direction like HEIRFRAME / Idle Life 2 refs workflow; show Aaron the refs in chat).

## Standing rules
- Vanilla JS ES modules, no build step. Three from /gms/lib/three/0.160.0/ (LOCAL). `?v=BUILD` on relative imports.
- Popups, never alert/confirm. Mobile-first portrait. Few comments. :8888 site server already running — never start another.
- Headless tests: ~/.claude/bin/cdp with `-- --use-angle=metal`; EVERY agent uses its own CDP_PORT (assigned in brief).
- GPU media: Flux (:7867), Qwen TTS (:7876), ACE-Step (:8001) — never run two heavy gens at once (24 GB). One media agent at a time.
- Agents never commit/push; manager selective `git add gms/3d/idle-western2/` (+ projects.js line). Other sessions share the tree.
- Never touch gms/3d/idle-transport2/, gms/pwa/idleWestern/, gms/3d/idle-life2/ (read-only reference).
- Bulk evidence (shots/critic) is gitignored; ship audio as compressed mp3/ogg (watch repo size).

## Phases
- [ ] P0 A design proposal (comedy, economy, town building), B art direction + Flux refs, C engine fork from Idle Life 2.
- [ ] P0b Adversarial challenge of design. Show Aaron refs.
- [ ] P1 DESIGN.md + CONTRACT.md.
- [ ] P2 Build (parallel lanes) + audio lane (voices, music, piano).
- [ ] P3 Adversarial reviews (blind critic, sim, mobile perf), triage.
- [ ] P4 Polish, register in projects.js, commit + push.

## Log
- 2026-10-04 Project started. P0 agents launched.
- 2026-10-04 Aaron: Codex image model is allowed as an option (`codex exec --skip-git-repo-check -s workspace-write "Use your image generation tool..."`, cloud, no local GPU). Smoke test was excellent.
- 2026-10-04 P0A done: research/DESIGN_PROPOSAL.md ("Big Hat Energy", Dribble Creek, 12 businesses in 4 blocks, built by the Mulligan Bros, hats = status, Fake Your Death prestige, Ghost Town season). P0b challenge launched.
- 2026-10-04 P0b done (research/DESIGN_CHALLENGE.md). P1: manager wrote DESIGN.md rulings W1–W17 (v1 = 9 businesses/3 blocks, ownership visible, fling, Leone duel, perf contract, piano phrases, Ghost Town overlay gated on 20 Oct). Audio lane launched (phase 1 script, phase 2 GPU after Flux idle).
- 2026-10-04 P0C engine fork done (ENGINE.md; all tests green). Committed bfe257fa (not pushed). CONTRACT.md written (lanes E/A/P/S/U/AU). Lane E (economy/state, CDP 9321) launched. Lanes A/P/S/U wait for art direction refs (+ show Aaron).
  Ports: engine 9311, E 9321; next: A 9331, P 9341, S 9351, U 9361.
- 2026-10-04 P0B art direction done: Look A "Clay Caricature" (ART_DIRECTION.md, refs/a_clay_*). Shown to Aaron (5 refs), proceeding unless he objects. Note: avoid sombrero+moustache stereotypes from build ref.
- 2026-10-04 P2 build launched: E (9321), A (9331), P (9341), S (9351), U (9361), AU (audio, GPU after Flux idle). Contract in CONTRACT.md.
- 2026-10-04 Lane E done (41/41 econ tests; FYD recommended 59:33; active/idle 2.31×, thin margin). Committed. Decision: keep FYD unlock at Bank Block+Undertaker (~18 min).
- 2026-10-04 Lane P round 1 done, committed. Manager review: card cameras far too steep (roof dominates, saloon doors/piano/people not readable), construction card framed off-centre with empty dirt; faces illegible. P round 2 after lane A's rig lands: ref-like ~30–35° facade-facing cameras, clutter + window glow. test-scroll unverified (machine loaded).
- 2026-10-04 Lane A round 1 done, committed 241131cb. Perf: hero 93–113 draws, ~20k verts/person, rAF p95 10.9 ms (gate 8) under load → dedicated perf pass needed. Manager review: hero cam too high/steep, no sky/mesas, empty foreground (ref has low ~35° cam, sky + mesas, duel in frame). Cast lineup decent (cute > caricature; could push noses/brows).
- 2026-10-04 Lane S done, committed. W10 gate passes + falsified. Open: P anchors (hay cart, jail wagon, dentist chair, Garter window, mud spot), acquisition cutscenes, Ghost Town scenes, FYD moustache swap.
- 2026-10-04 Lanes A/P/S/U round 1 all committed (af69a9f2). USAGE LIMIT hit: stopped AU (audio, mid-run — read docs/AUDIO.md progress, audio/ + tools/audio/ uncommitted), perf audit, playtest.
## RESUME (on "continue")
1. Relaunch AU from docs/AUDIO.md progress (GPU: TTS/ACE one at a time). Commit audio/ once sizes checked (≤12 MB).
2. Relaunch perf audit (tools/perf-audit.mjs, docs/PERF.md, CDP 9381) + adversarial playtest (docs/review/PLAYTEST_1.md, CDP 9391).
3. Round 2 visual: hero cam low ~35° with sky + mesas + duel in frame (S cameras + A HERO_VIEW); card cams facade-facing ~30–35° (P); night currently lilac/muddy (UI shots at 4am local) → ruling pending W18: compressed in-game day cycle (~20 min: mostly golden/day, short warm lantern night) instead of local time (world.js:41/173, economy.js:62, app.js:484). Push faces/caricature.
4. Then blind critics vs refs, perf fixes, P anchors (hay cart, jail wagon, dentist chair, Garter window, mud spot), acquisition cutscenes, FYD moustache swap, Ghost Town scenes (cut if not integrated by 20 Oct).
5. Not pushed yet; not in projects.js. UI contact sheet: scratchpad ui_sheet.jpg (regen: CDP_PORT=9371 node tools/ui-shots.mjs docs/shots/ui/ s22).
- 2026-10-04 Resumed after limit. W18 time-of-day ruling added (compressed ~20 min cycle, golden boot). Relaunched AU (resume), perf audit (9381), playtest (9391). Next: round 2 visual+perf lanes from PERF.md + PLAYTEST_1.md.
- 2026-10-04 Perf audit: CPU fine on quiet machine (p95 4–5 ms); GPU vertex-bound: hero 2–2.8M verts, 89 townsfolk × 18k verts (budget said ≤24 crowd!). Top fixes in PERF.md (light crowd rig, cards hide town, no hero+card same frame, shadows 4 Hz).
- 2026-10-04 Playtest 1 done (PLAYTEST_1.md: stuck hurry hint, fling/stagecoach off camera, pacing slow for real play, Android audio unlock). Round 2 assignments in docs/ROUND2.md; launching A,S,P,U,E,M.
- 2026-10-04 AU done, committed 2ebaa6de: 151 lines + 58 wordless (2.8 MB), 12 music cues (5.2 MB), 19 synth piano phrases + 11 ACE riffs (not in tap pool yet). Sample reel sent to Aaron. Weak: fakedeath cue, stinger tails, night/ghost loop seams.
- 2026-10-04 R2 A done (hero verts −51%, cards −60–70%, lite rig, day cycle, sky/mesas, ghost) + R2 E done (casual Tubs 1:03, Livery 2:26, Deed 4:19, special 4:20; typical doesn't hit FYD-recommended in 75 min — revisit). Both committed.
- 2026-10-04 R2 M done, committed: no hero+card same frame, idle hero 30 fps, 4 Hz shadows; idle top p95 12→~6 ms. Direct hero presenter opt-in only (?presenter=hero). test-look desktop mouse orbit failing after S's cameras edits — check after S.
- 2026-10-04 R2 P done, committed 88b87664. Cards now facade-facing + readable (big improvement). R3 notes: signs mostly blank/icon-only — need painted names (THIRSTY GIZZARD, PULL & PRAY…) via kit.signs; bulb-string wire crosses saloon/garter cards; no sky in cards; build card one-storey; foreground passers-by large.
- 2026-10-04 R2 S done, committed 0dd033d2. Full suite green on quiet machine (S22 rAF p95 3.2 ms). BUILD 20261004b pushed (unlisted) — live yru.br8t.com/gms/3d/idle-western2/. Found: in-game hero tour shots look across desert + in-game shine card is sign close-up (artlab framing differs) → integration camera fixer launched (CDP 9301).
- 2026-10-04 Camera integration fix committed+pushed (BUILD 20261004c): hero stands in the street looking down it, build-state card cam. Big visual jump. Sent Aaron 3 in-game shots. Blind critic r2 running (sheets docs/art/critic/r2, KEY.md).
- 2026-10-04 Blind critic r2: game ~3.4 vs refs 8.6 (REPORT.md). Round 3 (ROUND3.md) launched: A lighting/night/characters/signs (9331), P card framing/gags/vignettes (9341), S near-plane + hero staging (9351), M blank-card bug + test-cards (9301).
- 2026-10-04 R3 A committed 8631fabd. R3 M: blank cards were capture artefact from auto-scroll on open (no engine bug); cardShot + test-cards (falsified) committed. Manager fix: auto-scroll to opened business only if no touch/scroll for 3 s and ≥8 s since last auto-scroll.
- 2026-10-04 Round 3 complete + pushed (BUILD d). Blind critic r3 still ~3.9 avg. Round 4 (ROUND4.md) launched: A/P/S/U.
- 2026-10-04 Round 4 complete, all suites green, pushed BUILD 20261004e. Hero now matches ref layout (Stranger from behind + vignette). Draw calls borderline 246/250 desktop (hero 154) → needs trim. Blind critic r4 running.
- 2026-10-04 Blind critic r4 avg ~4.25 (trend 3.4→3.9→4.25). Round 5 (ROUND5.md) launched: A light/faces/wood/night/draw-trim, P build/saloon cards, S gag scale.
- 2026-10-04 Round 5 complete, pushed BUILD 20261004f (hero draws ~100, all green; lifecycle actor-sum check relaxed for hero near-cut). Blind critic r5 + playtest 2 (9391) running.
- 2026-10-04 Blind critic r5 ~4.25 (plateau). Concrete blockers in critic/r5/REPORT.md (opaque dust balls, blob ejectee, orange skin, translucent night char, huge fg cactus, hex tiling, red rocks). Waiting on playtest 2 before round 6.
- 2026-10-04 Playtest 2 done (PLAYTEST_2.md). Round 6 (ROUND6.md) launched: A/P/S/U/E. Rulings R6a ambient ejections from minute 1, R6b drop 'Colonel', R6c ghosts gated.
