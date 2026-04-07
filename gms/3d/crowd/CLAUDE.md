# Crowd Rush 3D — Development Notes

## How to continue this session
Prompt Claude with:
> "Continue building the Crowd Rush 3D game at gms/3d/crowd/. Read CLAUDE.md first, then check TODO status."

---

## Architecture Overview

| File | Purpose |
|------|---------|
| `index.html` | HTML skeleton, UI screens, imports |
| `style.css` | Mobile-first CSS, screens, HUD, overlays |
| `game.js` | Full game logic (~1600 lines) |
| `music/` | Place theme1.mp3–theme9.mp3 here for music |

## Tech Stack
- **Three.js r128** (via CDN, global `THREE`)
- **Web Audio API** for synthesised SFX
- **localStorage** for save data
- Vanilla JS, no build step

---

## Game Flow

```
Main Menu
  ├── Play → Level Select → In-Game
  ├── Upgrades → Pre-game upgrade shop (coins)
  └── Settings (⚙) overlay (sound/music toggles)

In-Game
  ├── HUD: crowd count, enemy count, timer, coins
  ├── Mobile: virtual joystick (left side)
  ├── Desktop: WASD / arrow keys
  ├── Mid-game upgrade prompt every 10 collects (pick 1 of 3)
  └── End: Victory (eliminated enemies) or Defeat

Game Over / Victory → Main Menu
```

---

## Upgrade Systems

### Pre-Game (persistent, bought with coins)
| Upgrade | Levels | Effect |
|---------|--------|--------|
| Speed | 5 | +10% player speed per level |
| Magnet | 5 | +20% collect radius per level |
| Starting Squad | 5 | Start with +2 followers per level |
| Coin Bonus | 5 | +15% coins per level |

Costs: 10 → 25 → 50 → 100 → 200 coins per level

### In-Game (temp, pick 1 of 3 every 10 collects)
- Speed Surge (+30% speed this game)
- Mass Magnet (+60% magnet range this game)
- Shield (3s immunity when hit)
- Double Crew (each pickup = 2 followers for 20s)
- Crowd Burst (all followers speed boost 10s)
- Lucky Star (coin drops x2 for 30s)

---

## Enemy Types

| Type | Color | Crowd | Behaviour |
|------|-------|-------|-----------|
| Rookie | Green `#66BB6A` | 3–8 | Random wander |
| Fighter | Orange `#FFA726` | 8–15 | Seeks collectibles |
| Champion | Red `#EF5350` | 15–25 | Hunts player if bigger |
| Boss | Purple `#AB47BC` | 25–40 | Smart: collects + hunts |

Enemy AI state machine: WANDER → SEEK_COLLECT → CHASE_PLAYER → FLEE

---

## Level Progression

| Level | Enemies | Target Crowd | Time |
|-------|---------|-------------|------|
| 1 | 3× Rookie | 15 | 90s |
| 2 | 2× Rookie + 2× Fighter | 25 | 120s |
| 3 | 2× Fighter + 2× Champion | 35 | 120s |
| 4 | 2× Champion + 1× Boss | 45 | 150s |
| 5 | 3× Champion + 2× Boss | 60 | 180s |

Win: eliminate all enemies OR reach target crowd before time
Lose: your crowd is fully absorbed OR timer runs out with fewer than 3 followers

---

## Map Design
- 200×200 white/light-grey floor plane
- Procedural buildings: 20–28 boxes, pastel colours, varying heights (2–10u)
- Trees: cylinder trunk + sphere canopy, ~15 placed
- Central plaza: raised circular platform + pillar cluster
- Boundary: invisible collision walls at ±95

---

## Audio
- SFX: Web Audio API synthesised (no files needed)
  - Collect: ascending sine chirp
  - Absorb enemy: descending crunch
  - Level up: ascending arpeggio
  - Hit/lose crowd: noise burst
- Music: tries to load `music/theme1.mp3` … `music/theme9.mp3`
  - Found files shuffled and played in sequence, loops
  - Missing files silently skipped

---

## TODO / Status

- [x] Project scaffold (index.html, style.css, game.js, CLAUDE.md)
- [x] Three.js scene, camera, lighting, shadows
- [x] Map generator (floor, buildings, trees, plaza)
- [x] Trail/crowd following system
- [x] Player controller (keyboard + touch joystick)
- [x] Collectible spawning + magnet + collect logic
- [x] Enemy AI (state machine, all 4 types)
- [x] Collision: absorption (larger crowd absorbs smaller)
- [x] HUD (crowd count, enemy count, timer, coins)
- [x] Main menu screen
- [x] Level select screen (5 levels)
- [x] Upgrade shop screen
- [x] In-game upgrade prompts
- [x] Settings overlay (⚙ cog, sound/music toggles)
- [x] Game over / victory screens
- [x] Save system (localStorage)
- [x] Audio manager (SFX + music loader)
- [x] Particle effects (collect/absorb)
- [x] Mobile-first touch joystick
- [x] Desktop keyboard support
- [ ] Playtesting / balance tweaks (future)
- [ ] Add actual music files to `music/` folder

---

## Known Limitations / Future Work
- No multiplayer
- No online leaderboard (could add later)
- Music files must be provided by user (see `music/` folder)
- Buildings are convex hulls (no complex mesh collisions), balls slide around them
