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
