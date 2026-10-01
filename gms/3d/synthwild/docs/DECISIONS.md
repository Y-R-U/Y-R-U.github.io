# SYNTHWILD — Decisions

## Aaron's brief (2026-10-02, verbatim essentials)
- Mobile-first voxel survival called Synthwild: a full Minecraft clone with all the main elements, but different
  names, look and theme. Parts people hate or never use can be cut or improved.
- An intro screen to create new worlds; survival mode and build mode.
- A server side in Go + SQLite; deploy to br8t.com every time it's checked into git. The client is three.js.
- Only dante@br8t.com, malaki@br8t.com and aaron@br8t.com are allowed. They can add usernames; anyone with a valid
  username logs in without a password and can see any world a player made public.
- Settings: music/sound on/off and volume, fullscreen, other standard settings. Anything that makes the game easier is
  OK as a toggle.
- A skippable voiced intro: far-future biotech grown into each other; blocks "grow" from a seed template; a future not
  too far away.
- Fantasy, loop, voxel rules, controls, art direction, UI and perf budget are in DESIGN.md (from his brief).
- Main aim: plays and feels like what two children already know, but looks very different and futuristic.

## Manager decisions
- D1: Hosting = `games.br8t.com/gms/3d/synthwild/` (same origin as the hub) + Caddy path route for `api/*` to Go on
  :8011. No new DNS record needed. GitHub Pages copy runs offline/local-only.
- D2: Admin sign-in = Google via the existing Firebase project, verified server-side, plus a CLI one-time link fallback.
- D3: World storage is sparse cells with 4×4×4 refinement (see ARCHITECTURE). Light is Minecraft-style flood fill at
  cell resolution.
- D4: Night "power-droop": the solar Charge trickle stops at night unless you stand in block light ≥ 8. Mobs spawn in darkness.
- D5: Improvements over Minecraft: no recipe grid (the fabricator lists what you can make), Memory Cache on death
  (hotbar kept), glitchfuse doesn't grief by default, slabs and stairs replaced by the fine grid + 0.5 auto-step.
- D6: M1 = the vertical slice + shell + server + intro (the brief's "no story / no crafting tree" applies to the slice
  only; full survival elements follow in M2).
- D7: Landscape only (first-person, so the threat arrives on the horizontal axis).
