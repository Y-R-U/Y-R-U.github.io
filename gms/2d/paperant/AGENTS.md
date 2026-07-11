# Codex Guide: Paper Ant

Paper Ant is a mobile-first top-down puzzle game where players draw pencil lines on paper to guide ants to goals.

## Stack

- Vanilla JS, HTML5 Canvas, CSS.
- No external dependencies.
- Web Audio API for synthesized SFX and optional music.
- `localStorage` for progress.
- Mobile-first layout, max-width around 600px on desktop.

## File Structure

```text
paperant/
├── index.html
├── css/style.css
├── js/config.js
├── js/levels-ext.js
├── js/powerups.js
├── js/rewards.js
├── js/audio.js
├── js/input.js
├── js/renderer.js
├── js/ant.js
├── js/drawing.js
├── js/particles.js
├── js/ui.js
├── js/levels.js
├── js/game.js
├── js/main.js
└── music/
```

## Architecture

- Modules use IIFE singletons.
- `GameAudio` is used instead of `Audio` to avoid shadowing `window.Audio`.
- Game loop uses `requestAnimationFrame`.
- Canvas rendering is DPR-aware.
- Paper background is cached to an offscreen canvas.
- Pencil texture uses deterministic noise to avoid shimmer.
- Positions are stored as fractions of the play area and converted to canvas coordinates.

## Core Mechanics

- Ants wander autonomously.
- Drawn pencil lines are temporary barriers.
- Ants reflect off lines using surface-normal reflection, not random bounces.
- Lines fade after about 3.5 seconds.
- Ink meter limits drawing and regenerates while not drawing.
- Goals include food, nest, friend, leaf, and sugar.
- Star rating is based on completion speed.
- 100 levels; 51+ use moving obstacles (`moveX`/`moveY` + `period` + `phase`).
- Consumable power-ups (magnet, thick pencil, freeze, ink, extra time) in
  `js/powerups.js`; daily rewards, weekday events, and the seeded daily
  challenge in `js/rewards.js`.

## Working Rules

- Preserve the foolscap paper and pencil-drawn visual language.
- Keep touch and mouse input unified.
- Maintain framerate-independent movement and anti-stuck behavior in ant physics.
- Do not add dependencies or a build step.
- Optional music is detected as `music/theme1.mp3` through `music/theme9.mp3`.
