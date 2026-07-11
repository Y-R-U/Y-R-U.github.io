# Paper Ant

A top-down puzzle game where you draw pencil lines on paper to guide ants to goals.

## Game Overview
- **Genre**: Puzzle / Drawing
- **Platform**: Mobile-first web game (HTML5 Canvas), max-width 600px for desktop
- **Theme**: Foolscap paper with pencil-drawn elements

## Core Mechanics
- Ants wander autonomously on a piece of ruled paper
- Player draws pencil lines (touch/mouse) to create temporary barriers
- **Reflection physics**: ants bounce off lines like light off a mirror (not random), allowing skill-based play
- Draw semi-circles to funnel ants in the desired direction
- Lines fade after ~3.5 seconds, requiring timing and strategy
- Ink meter limits drawing (regenerates when not drawing)
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
│   ├── audio.js        - GameAudio module (Web Audio API SFX + music player)
│   ├── input.js        - Unified touch/mouse input handling
│   ├── renderer.js     - Canvas: cached paper bg, goals, obstacles (moving = amber)
│   ├── ant.js          - Ant physics (reflection-based), anti-stuck, detailed drawing
│   ├── drawing.js      - Pencil lines, per-line width/fade (Thick Pencil), ink
│   ├── particles.js    - Visual particle effects
│   ├── ui.js           - Screens, popups, HUD, level grid, power-up bar, daily/challenge UI
│   ├── levels.js       - Level state, save/load progress, stars
│   ├── game.js         - Game loop, state machine, power-up effects, challenge mode
│   └── main.js         - Entry point, wiring all systems together
└── music/              - Optional: theme1.mp3 through theme9.mp3
```

## Save Data (localStorage)
- `paperant_progress` — per-level unlocked/completed/stars/bestTime
- `paperant_powerups` — power-up inventory (starter pack granted on first run)
- `paperant_rewards` — `{ lastClaim, streak, lastChallenge }` (local YYYY-MM-DD)

## Architecture
- Module pattern (IIFE singletons) for each system
- **GameAudio** (not `Audio` — avoids shadowing `window.Audio`)
- Game loop uses `requestAnimationFrame` for smooth rendering
- Paper background cached to offscreen canvas (no per-frame flickering)
- Pencil line texture uses deterministic noise (no shimmer)
- `roundRect` polyfill included for older browsers
- All positions stored as fractions (0-1) of play area, converted to canvas coords
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
- Music: auto-detects theme1-9.mp3 files in music/ folder via HEAD requests
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
