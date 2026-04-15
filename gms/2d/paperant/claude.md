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

## Levels
50 levels with progressive difficulty:
- **1-10 (Tutorial → Intro)**: First Steps, Wrong Way, Fork in the Road, Double Treat, Two Friends, Speed Ant, Water Hazard, Triple Threat, The Maze, Grand Finale
- **11-20 (Intermediate)**: Crossroads, Zigzag, Pincer, The Detour, Narrow Gap, Three Course Meal, Scatter, Guard Duty, Race Against Time, The Chase
- **21-30 (Advanced)**: Diamond Formation, Opposite Day, Ring of Fire, Forked Maze, The Workforce, Delivery Route, Wall Break, The Grid, Pinball, Speed Maze
- **31-40 (Hard)**: Quadrant Quest, Choke Point, Double Helix, Seven Ants, Order of Operations, The Gauntlet, Congestion, Precision Drop, Ant Army, The Puzzle Box
- **41-50 (Expert → Ultimate)**: Full House, The Grand Maze, Bullet Time, Ten Tasks, Last Stand, Labyrinth Lord, Chain Reaction, The Final Test, Puzzle Master, Ant Overlord

## File Structure
```
paperant/
├── index.html          - Main HTML with all screen markup (incl. quit confirm popup)
├── claude.md           - This file
├── css/
│   └── style.css       - All styles (paper theme, responsive, UI, low-time warning)
├── js/
│   ├── config.js       - Constants, goal types, GOAL_ICONS, level definitions
│   ├── audio.js        - GameAudio module (Web Audio API SFX + music player)
│   ├── input.js        - Unified touch/mouse input handling
│   ├── renderer.js     - Canvas: cached paper bg, goals, obstacles, roundRect polyfill
│   ├── ant.js          - Ant physics (reflection-based), anti-stuck, detailed drawing
│   ├── drawing.js      - Pencil lines, deterministic texture, fading, ink management
│   ├── particles.js    - Visual particle effects
│   ├── ui.js           - Screen management, popups, HUD, level grid, cog visibility
│   ├── levels.js       - Level state, save/load progress, stars
│   ├── game.js         - Game loop (requestAnimationFrame), state machine
│   └── main.js         - Entry point, wiring all systems together
└── music/              - Optional: theme1.mp3 through theme9.mp3
```

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
- More levels beyond the initial 10
- Ant trail pheromone visual effect
- Power-ups (longer lasting lines, speed slow)
- Achievement system
- More obstacle types (tape, eraser marks)
