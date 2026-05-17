# Codex Guide: Crowd Rush 3D

Crowd Rush 3D is a vanilla JS Three.js game in `/Users/aaronair/cc/yru/site/gms/3d/crowd/`.

## Stack

- Three.js r128 from CDN, global `THREE`.
- Web Audio API for SFX and optional MP3 music.
- `localStorage` for save data.
- No build step.

## File Loading Order

Files are loaded by `index.html` script tags in this order:

```text
index.html
style.css
config.js
save.js
audio.js
map.js
player.js
enemy.js
collectible.js
input.js
minimap.js
ui.js
game.js
music/
```

When changing behavior, check both the owning module and `game.js`, since `game.js` wires most systems together.

## Game Modes

- Story Mode: level select, timer, target crowd, enemies.
- Last Man Standing: no timer, eight enemies, real eating collision, kill feed, personal best.

## Important Systems

- Player and enemies use chain-following crowd formations.
- LMS eating removes one follower per cooldown tick before killing the leader.
- Pre-game upgrades are persistent and bought with coins.
- In-game upgrades are temporary and offered at collection thresholds that double.
- Building collision data exists, but collision is disabled because enemies could get stuck.
- Camera supports wheel zoom on desktop and pinch zoom on mobile.

## Working Rules

- Preserve mobile controls and HUD behavior when changing gameplay.
- Keep DPR-aware canvas handling for minimap and rendering overlays.
- Be cautious with save keys in `save.js`; changing them can break existing local saves.
- If adding music, expected optional files are `music/theme1.mp3` through `music/theme9.mp3`.
- Avoid introducing a build step or external package manager.

## Core Constants

- `SPEED_CAP = 22`
- `MAGNET_CAP = 20`
- LMS best is saved under `lmsBest`.
