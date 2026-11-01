# SKYPUTT — Manager state (read on resume)

Manager = the Claude session that also managed GAMBIT. Agent cap **2 at once** (Aaron, Pro plan).
Aaron says "continue" roughly every 5 hours. Commit+push at milestones (stage only
`gms/3d/skyputt/` and later `projects.js` + screenshot; never `git add -A`). Commit trailer as usual.

Docs: PLAN.md (full plan + milestones), DECISIONS.md, TEAM_BRIEF.md, THEME_CONTRACT.md, notes/.

## Log
- 2026-11-02: Plan written. Refs converted to JPG in refs/. M1 started with 2 agents:
  `engine` (physics, builder, aim, camera, hole flow, greybox, 3 holes) and
  `sky` (Sky Isles theme per THEME_CONTRACT, preview page).

## Next
- When both finish: integrate, phone-check, commit+push M1, tell Aaron the Pages URL.
- Then M2 (9 holes, stars, coins, sound, flyover, menus, Long Sight + Mulligan, save).
- 2026-11-02: `sky` done (v2 aligned to engine extensions; notes/sky.md, shots in notes/sky_shots/).
  Started `sound` agent (js/audio/, tools/sound_preview.html). Engine still running.
- 2026-11-02: Aaron's phone (Adreno 730) showed black land; ?env=0 fixed it → NaN in sky shader
  (`normalize(d.xz+1e-5)` at the poles) poisoned PMREM. Fixed with `sunSide()` in sky.js; preview has
  ?env=0 / ?shadow=0 debug switches and shows the GPU name. Rule added to TEAM_BRIEF.
