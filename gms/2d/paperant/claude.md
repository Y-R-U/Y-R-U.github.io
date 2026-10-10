# Paper Ant

A top-down puzzle game where you draw pencil lines on paper to guide ants to goals.

## Game Overview
- **Genre**: Puzzle / Drawing
- **Platform**: Mobile-first web game (HTML5 Canvas), max-width 600px for desktop
- **Theme**: Foolscap paper with pencil-drawn elements

## Core Mechanics
- Ants wander autonomously on a piece of ruled paper
- Player draws pencil lines (touch/mouse) to create temporary barriers
- **Bounce physics**: walls/obstacles mirror the ant; pencil lines send it away within ±70° of the line's normal
- Draw semi-circles to funnel ants in the desired direction
- Lines fade after ~3.5 seconds of GAME time (frozen while paused / popups)
- Ink meter limits drawing by stroke LENGTH (INK_UNIT_PX css px per unit, INK_MAX 0.8 ≈ 384 px; full refill 12.5 s); holding still is free
- Undo: double-tap a line, or the ↶ button at the left of the power-up bar; removes it and refunds 50% of its ink
- Guide ants to goals (food, nest, friend, leaf, sugar) within time limits
- Star rating (1-3) based on speed of completion
- **Power-ups** (consumables, bar at the bottom during play): Magnet 🧲 (tap
  button → tap paper; attracts ants for 6s), Thick Pencil ✏️ (2× width +
  longer fade for the rest of the level), Freeze ❄️ (ants at 35% speed for
  6s), Ink Flask 🫙 (refill ink), Extra Time ⏰ (+15s)
- **Daily reward**: 7-day streak cycle (day 7 = mega bundle), claim from the
  title screen; red badge while unclaimed; streak resets after a missed day
- **Events** (by weekday, local time): Magnet Monday / Ink Wednesday /
  Freeze Friday add bonus items; Weekend Rally (Sat+Sun) doubles all rewards
- **Daily Challenge**: date-seeded remix of a level 21+ (1.2× ant speed,
  0.9× time); first clear each day grants bonus power-ups

## Levels
100 levels with progressive difficulty:
- **1-10 (Tutorial → Intro)**: First Steps, Wrong Way, Fork in the Road, Double Treat, Two Friends, Speed Ant, Water Hazard, Triple Threat, The Maze, Grand Finale
- **11-20 (Intermediate)**: Crossroads, Zigzag, Pincer, The Detour, Narrow Gap, Three Course Meal, Scatter, Guard Duty, Race Against Time, The Chase
- **21-30 (Advanced)**: Diamond Formation, Opposite Day, Ring of Fire, Forked Maze, The Workforce, Delivery Route, Wall Break, The Grid, Pinball, Speed Maze
- **31-40 (Hard)**: Quadrant Quest, Choke Point, Double Helix, Seven Ants, Order of Operations, The Gauntlet, Congestion, Precision Drop, Ant Army, The Puzzle Box
- **41-50 (Expert → Ultimate)**: Full House, The Grand Maze, Bullet Time, Ten Tasks, Last Stand, Labyrinth Lord, Chain Reaction, The Final Test, Puzzle Master, Ant Overlord
- **51-100 ("Nightmare" expansion, js/levels-ext.js)**: introduces **moving
  obstacles** (amber-tinted; `moveX`/`moveY` amplitude + `period` seconds +
  optional `phase`, animated in game.js off `timeUsed` so they pause with the
  game). Sliding doors, pistons, sweepers, crushers; up to 8 ants, 7 ordered
  goals, speeds to 3.5. Finale: Paper Apocalypse (level 100).

## File Structure
```
paperant/
├── index.html          - Main HTML with all screen markup (incl. quit confirm popup)
├── claude.md           - This file
├── css/
│   └── style.css       - All styles (paper theme, responsive, UI, low-time warning,
│                         power-up bar, daily popup, event banner)
├── js/
│   ├── config.js       - Constants (incl. power-up tuning), goal types, levels 1-50
│   ├── levels-ext.js   - Levels 51-100 (moving obstacles), compact V/H/B builders
│   ├── powerups.js     - Power-up definitions + persistent inventory (localStorage)
│   ├── rewards.js      - Daily rewards/streak, weekday events, daily challenge
│   ├── audio.js        - GameAudio module (Web Audio API SFX; no music)
│   ├── input.js        - Unified touch/mouse input handling
│   ├── renderer.js     - Canvas: cached paper bg, goals, obstacles (moving = amber)
│   ├── ant.js          - Ant physics (reflection-based), anti-stuck, detailed drawing
│   ├── drawing.js      - Pencil lines, per-line width/fade (Thick Pencil), ink
│   ├── particles.js    - Visual particle effects
│   ├── ui.js           - Screens, popups, HUD, level grid, power-up bar, daily/challenge UI
│   ├── levels.js       - Level state, save/load progress, stars
│   ├── game.js         - Game loop, state machine, power-up effects, challenge mode
│   ├── cloud.js        - Optional br8t account layer (cloud save of the 4 keys below)
│   └── main.js         - Entry point, wiring all systems together
```

## Save Data (localStorage)
- `paperant_progress` — per-level unlocked/completed/stars/bestTime
- `paperant_powerups` — power-up inventory (starter pack granted on first run)
- `paperant_rewards` — `{ lastClaim, streak, lastChallenge }` (local YYYY-MM-DD)
- `paperant_audio` — `{ sfx, vibrate }` prefs
- `paperant_ghost` — '0' when the Path Hint setting is off (local only, not synced)

All four are mirrored to the player's br8t account by `js/cloud.js` (see
`/games/CLAUDE.md`). `main.js` imports it dynamically and skips it entirely
under `?auto` / `?test`, so automated runs stay hermetic.

## Architecture
- Module pattern (IIFE singletons) for each system
- **GameAudio** (not `Audio` — avoids shadowing `window.Audio`)
- Game loop uses `requestAnimationFrame` for smooth rendering
- Paper background cached to offscreen canvas (no per-frame flickering)
- Pencil line texture uses deterministic noise (no shimmer)
- `roundRect` polyfill included for older browsers
- Level data (goals/obstacles) are fractions of the play area; live ants, lines and the magnet
  are canvas px and get remapped via `Renderer.onAreaChange` on resize/rotation
- DPR-aware rendering for crisp display on high-DPI screens
- Progress saved to localStorage

## Ant Physics (v2 — reflection-based)
- Ants reflect off drawn lines using proper surface normal calculation
- Small ±0.15 radian jitter on reflections (enough variation, still predictable)
- Anti-stuck detection: if ant hasn't moved for several frames, forced nudge
- Bounce cooldown prevents multiple SFX per frame
- Gentle wander is framerate-independent (dt-scaled)
- Drawing semi-circles around ant creates a funnel effect

## Key Design Decisions
- No external dependencies (vanilla JS, Web Audio API for sounds)
- Synthesized sound effects (no audio files needed for SFX)
- Paper texture: ruled lines, red margin, hole punches, deterministic noise
- Ant rendered procedurally with animated legs, antennae, mandibles
- Settings cog hidden on overlay screens (title, level-select, etc.)
- Quit confirmation popup when pressing back during gameplay
- Timer flashes red when ≤10 seconds remain

## Known Areas for Enhancement
- Ant trail pheromone visual effect
- Achievement system
- More obstacle types (tape, eraser marks)
- Rotating/diagonal moving obstacles (current movement is axis-aligned sine)

## Hub review pass (2026-10-11)
- Play area reserves 64 px at the bottom for the power-up bar, and the top pad is 88 px under 430 px
  wide, where the HUD becomes two rows (level / goals / timer, then the ink bar). It's checked with the account avatar loaded.
- Input: contacts wider or taller than 44 css px are rejected as palms; a newer finger takes over a stroke that
  has moved <8 px or has <3 points; otherwise a second finger is ignored mid-stroke. Short still
  contacts are reported as taps (and tap-length strokes are discarded and refunded).
- Path Hint (Settings, default ON): a faint dotted ~1 s preview of each ant during "Ready..." and while
  the finger is down. Lines are drawn bending along the normal, which is the mean of the random bounce.
- Levels 1–3: ghost pencil traces a funnel arc until the first real stroke.
- Landscape: a non-blocking "Turn upright" pill shows once per landscape episode (no letterbox).
- Pencil tip dot shrinks and turns amber, then red, as ink runs low.
- Audio: unlock on pointerdown/touchend/click/keydown, audioSession=playback, suspend when hidden;
  one cached noise buffer.
- Balance harness lives outside the repo (scratchpad `paperant-impl/sim.mjs`): node vm, a geometry check plus a BFS-
  waypoint bot comparing the old time-ink against the new length-ink. Result: parity (951 vs 943 of 1000 portrait runs).
  L42 (The Grand Maze) is very hard for the bot under every ink rule.
