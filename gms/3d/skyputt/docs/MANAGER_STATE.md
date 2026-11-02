# SKYPUTT — Manager state (read on resume)

Manager = the Claude session that also managed GAMBIT. Agent cap **2 at once** (Aaron, Pro plan).
Aaron says "continue" roughly every 5 hours. Commit+push at milestones (stage only
`gms/3d/skyputt/` and later `projects.js` + screenshot; never `git add -A`). Commit trailer as usual.

Docs: PLAN.md (full plan + milestones), DECISIONS.md, TEAM_BRIEF.md, THEME_CONTRACT.md, notes/.

## Log
- 2026-11-02: Plan written. Refs converted to JPG in refs/. M1 started with 2 agents:
  `engine` (physics, builder, aim, camera, hole flow, greybox, 3 holes) and
  `sky` (Sky Isles theme per THEME_CONTRACT, preview page).

- 2026-11-02: `sky` done (v2 aligned to engine extensions; notes/sky.md, shots in notes/sky_shots/).
  Started `sound` agent (js/audio/, tools/sound_preview.html). Engine still running.
- 2026-11-02: Aaron's phone (Adreno 730) showed black land; ?env=0 fixed it → NaN in sky shader
  (`normalize(d.xz+1e-5)` at the poles) poisoned PMREM. Fixed with `sunSide()` in sky.js; preview has
  ?env=0 / ?shadow=0 debug switches and shows the GPU name. Rule added to TEAM_BRIEF.
- 2026-11-02: M1 committed+pushed dadf6ea4 (screenshot dirs gitignored). Aaron confirmed fix on phone
  (60 fps Adreno 730). Engine agent resumed for M2 (holes 4-9, stars, save, flyover, Long Sight +
  Mulligan, settings, camera occlusion). Sound agent still running.

## Next
- When sound finishes: engine wires it in (or a wiring task). Then commit M2, phone-check.
- Then M3 (story ch.1 + ghost AI). Candidate parallel work: Spooky Hollow theme (theme-only agent).
- 2026-11-02: sound done (js/audio/, tools/sound_preview.html; needs Aaron to listen). Engine told to
  wire it in M2. Started `spooky` agent (js/themes/spooky/, Spooky Hollow theme, tested in-game).
- 2026-11-02: spooky done (all 9 holes, notes/spooky.md); its engine issues (sprite raycast crash,
  mover skin doc, boost UVs, info.viewDir, landscape pitch) passed to engine for M2.
  Started `ai` agent (js/ai/: planner, golfers, worker, ghost, ai_test, ai_demo).
- 2026-11-02: M2 committed+pushed 1658df29 (front nine, helpers, save, flyover, audio wired, spooky).
  js/ai/ excluded (ai agent in progress). Engine agent now: theme picker, sky fixes (hole 7 voids,
  lamps, mover skin), M3 story scaffolding in js/story/ (Old Mags, chapter 1 Muni, lessons, rival hooks).
- 2026-11-02: 89fea4b1 pushed (theme picker, sky fixes, story ch1 Muni with AI stand-in). Note
  tools/ai_test.mjs slipped into that commit (harmless; js/ai still uncommitted). AI agent given
  `simulateRound` interface. Engine agent: verify Muni in browser, then M4 events framework
  (Spooky Hollow Open live to 2026-11-08, Frost Fair Festival Dec), coin-farming fix.
- Next free slot: Frost Fair theme agent (js/themes/frost/).
- 2026-11-02: ai done (js/ai/, notes/ai.md, simulateRound live). Not yet committed: engine agent to
  verify story↔AI integration + tune rosters (D14) first. Next slot: Frost Fair theme agent.
- 2026-11-02: 9074625c pushed (js/ai, story real AI + rival ghost, events framework, crystals once).
  Engine agent retired (context ~600k; handoff in notes/engine.md). New `meta` agent: M5 weekly
  ladder/tiers, shop + cosmetics, chests, 6 more helpers (notes/meta.md). `frost` still running.
- Remaining after M5: frost registration + Frost Fair event switch to theme 'frost'; M6 online
  (server — deploy needs Aaron OK); story chapters 2-6; more holes per theme; projects.js entry.
