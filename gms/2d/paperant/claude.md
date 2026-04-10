# Paper Ant

A top-down puzzle game where you draw pencil lines on paper to guide ants to goals.

## Game Overview
- **Genre**: Puzzle / Drawing
- **Platform**: Mobile-first web game (HTML5 Canvas)
- **Theme**: Foolscap paper with pencil-drawn elements

## Core Mechanics
- Ants wander autonomously on a piece of ruled paper
- Player draws pencil lines (touch/mouse) to create temporary barriers
- Lines fade after ~3.5 seconds, requiring timing and strategy
- Ink meter limits drawing (regenerates when not drawing)
- Guide ants to goals (food, nest, friend, leaf, sugar) within time limits
- Star rating (1-3) based on speed of completion

## Levels
10 levels with progressive difficulty:
1. First Steps - single ant, single food
2. Wrong Way - redirect ant
3. Fork in the Road - obstacles create paths
4. Double Treat - ordered goals (food then nest)
5. Two Friends - multiple ants
6. Speed Ant - fast ant with obstacles
7. Water Hazard - many puddle obstacles
8. Triple Threat - three ants, three goals
9. The Maze - corridor navigation
10. Grand Finale - multiple ants, ordered goals, obstacles

## File Structure
```
paperant/
├── index.html          - Main HTML with all screen markup
├── claude.md           - This file
├── css/
│   └── style.css       - All styles (paper theme, responsive, UI)
├── js/
│   ├── config.js       - Constants, goal types, level definitions
│   ├── audio.js        - Web Audio API SFX + music player
│   ├── input.js        - Unified touch/mouse input handling
│   ├── renderer.js     - Canvas: paper background, goals, obstacles
│   ├── ant.js          - Ant AI, movement, collision, detailed drawing
│   ├── drawing.js      - Pencil lines, fading, ink management
│   ├── particles.js    - Visual particle effects
│   ├── ui.js           - Screen management, popups, HUD, level grid
│   ├── levels.js       - Level state, save/load progress, stars
│   ├── game.js         - Game loop (setInterval), state machine
│   └── main.js         - Entry point, wiring all systems together
└── music/              - Optional: theme1.mp3 through theme9.mp3
```

## Architecture
- Module pattern (IIFE singletons) for each system
- Game loop uses `setInterval` (reliable in background tabs)
- All positions stored as fractions (0-1) of play area, converted to canvas coords for rendering
- DPR-aware rendering for crisp display on high-DPI screens
- Progress saved to localStorage

## Key Design Decisions
- No external dependencies (vanilla JS, Web Audio API for sounds)
- Synthesized sound effects (no audio files needed for SFX)
- Music: auto-detects theme1-9.mp3 files in music/ folder via HEAD requests
- Paper texture: ruled lines, red margin, hole punches, subtle noise
- Ant rendered procedurally with animated legs, antennae, mandibles

## Known Areas for Enhancement
- More levels beyond the initial 10
- Ant trail pheromone visual effect
- Power-ups (longer lasting lines, speed slow)
- Achievement system
- More obstacle types (tape, eraser marks)
