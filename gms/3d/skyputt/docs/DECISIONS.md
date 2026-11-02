# SKYPUTT — Decisions

The manager owns this file; agents propose changes in their notes.

## Product (Aaron, 2026-11-02)
- D1 Mini golf, 3D, mobile-first portrait (desktop works too). Themes, special events,
  earnable helpers/power-ups (e.g. a longer guide line, stackable), story mode "nobody to pro",
  competition ladders (and event ladders with rewards for rank and goals in a time window), online
  rooms vs ghost AIs (personalities + rank) or other players, private/global rooms, helper options.
- D2 Build a few levels in one theme first; manager commits + pushes at milestones so Aaron can play
  from Pages while work continues.
- D3 Max **2 sub-agents** at a time (Pro plan). Aaron says "continue" every ~5 hours.
- D4 Refs are loose inspiration.

## Technical (manager)
- D5 Own deterministic physics, fixed 240 Hz step, no physics library (PLAN 2.1).
- D6 Holes are theme-independent data (spline + features); themes skin them (PLAN 2.2–2.3).
- D7 Theme contract: `js/themes/<id>/index.js` default-exports `createTheme(ctx)` returning
  `{ id, name, materials, buildEnvironment(scene, info), skins }`. Details are in
  `docs/THEME_CONTRACT.md`. The engine works with the built-in `greybox` theme if a skin is missing.
- D8 Controls: drag anywhere (not just on the ball) back-and-away = slingshot aim; power = drag length,
  capped; a cancel zone near the ball. The guide line has a base length and shows no bounce;
  each Long Sight adds length and one more bounce.
- D9 Out of bounds / water = +1 stroke, ball returns to its last resting spot.
- D10 Max strokes per hole = par + 4 (then "picked up" with that score).
- D11 Online is client-reported strokes with a "no cheat detection yet" warning. Server deploys need Aaron's OK.
- D12 Ladder = the more you **play** the higher you go (Aaron confirmed 2026-11-02). No real-money ranking.
- D13 (Aaron, 2026-11-02) Mobile-first portrait AND a proper desktop landscape layout (wide camera
  framing, HUD placed for landscape, mouse drag aim + wheel zoom). Fullscreen toggle shown where the
  Fullscreen API works (Android Chrome, desktop), hidden on iOS Safari.
- D14 AI skill capped at 0.9 for opponents (skill 1 finds inhuman hole-in-one lines). Early story
  rivals/fields must be tuned to beatable (e.g. Muni rival ~0.3-0.4, Muni Open field mostly < 0.5).
