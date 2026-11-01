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
