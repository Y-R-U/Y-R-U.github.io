# SYNTHWILD — Mini-games spec (D10)

Single-player vs bots. Each game runs in its own temporary arena world (fixed seed + generated arena, mode `'minigame'`),
never touching the player's saved worlds. A results screen (stars/medals + personal best saved in localStorage
`synthwild.mg`) returns to the title or replays.

## Framework (js/minigames/, owner: lane 5 agent)
- `registry.js`: `{ id, name, icon, blurb, minutes, build(arenaCtx), start(ctx), update(dt), end() }` per game.
- `arena.js`: builds the arena via `world.setBox` on a flat superflat-ish seed (`World` with `{ seed:'mg-<id>', flat:true }`,
  or carve a flat pad if `flat` isn't supported), with borders that can't be broken; brush/break rules per game.
- `hud.js`: timer, score, objective text, a countdown 3-2-1, the results panel. Glassy, matching the HUD.
- `command.js`: an in-game command bar (keyboard `/` or `T`; a touch chip in the pause menu) with `/play <id>`, `/quit`,
  `/help`, plus a few handy build-mode commands (`/time day|night`, `/tp spawn`, `/clear weather` is n/a). It must never be a
  text field that steals WASD while closed.
- Title: a "Mini-games" tab or card grid. Settings: a `minigamesBots` difficulty (easy/normal/hard).

## Bots (js/minigames/bots/, owner: lane 4 agent)
- Humanoid "Rival" bots reuse lane 3's `avatar.js` model (tinted per team) with lane 4-style voxel movement:
  A* on the walkable grid (step 1, jump gaps ≤ 2, drop ≤ 3), stuck recovery, line of sight, tag/attack.
- Personality knobs: speed, reaction time, aim/accuracy, caution; scaled by `minigamesBots`.

## Games
1. **Capture the Flag** (lane 4): 2 bases on a symmetric arena, you + 2 bot allies vs 3 bot rivals. Tap a rival to tag (sends
   it back to base). First to 3 captures or the most in 6 min. Flag carriers glow and leave a trail.
2. **Hide & Seek** (lane 4): Hide: you have 30 s to hide (you may place up to 16 blocks) in a themed village arena; a Seeker
   drone with a visible sweeping scan cone searches for 2 min. Seek: 4 bots hide, and you have 3 min; a "ping" every 30 s shows a
   faint direction.
3. **Parkour Dash** (lane 5): a generated course of floating platforms (seeded, 3 lengths), checkpoints, a timer, ghost of the best run.
4. **Floor Fall** (lane 5): spleef on 3 stacked glass floors; blocks you or bots step on crack and vanish after 0.6 s; last one up wins.
   Bots are lane 4's.
5. **Glitch Siege** (lane 4): defend a core in a small walled arena for 5 waves of reboots/glitchfuses/archers; build walls
   between waves with a block budget.
6. **Treasure Hunt** (lane 5): 5 caches hidden around a small island, with riddle-style hints and a hot/cold pulse; beat the clock.
