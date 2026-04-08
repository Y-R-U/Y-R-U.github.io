# Crowd Rush 3D — Development Notes

## How to continue this session
Prompt Claude with:
> "Continue building the Crowd Rush 3D game at gms/3d/crowd/. Read CLAUDE.md first, then check TODO status."

---

## Architecture Overview

Files load in this order (all via `<script>` tags in index.html):

| File | Purpose | ~Lines |
|------|---------|--------|
| `index.html` | HTML skeleton, all UI screens | 275 |
| `style.css` | Mobile-first CSS, screens, HUD, overlays | 620 |
| `config.js` | Constants, LEVELS[], UPGRADE_DEFS[], IG_UPGRADES[], COLORS | 50 |
| `save.js` | SaveSystem (localStorage, dot-path get/set) | 70 |
| `audio.js` | AudioManager — Web Audio SFX + mp3 music loader | 130 |
| `map.js` | MapBuilder — floor, buildings, trees, plaza | 175 |
| `player.js` | TrailSystem + Player (movement, followers, upgrades) | 170 |
| `enemy.js` | Enemy (AI state machine: wander/seek/chase/flee) | 180 |
| `collectible.js` | Collectible + spawnParticles/updateParticles/clearParticles | 90 |
| `input.js` | InputController — keyboard + virtual touch joystick | 110 |
| `ui.js` | UIManager — screens, HUD, toasts, upgrade UI | 165 |
| `game.js` | Game class (main loop, collision, wiring) + entry point | 310 |
| `music/` | Drop theme1.mp3–theme9.mp3 here for background music | — |

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

- [x] Project scaffold (index.html, style.css, CLAUDE.md)
- [x] Multi-file architecture (10 JS modules, no build step)
- [x] Three.js r128 scene, camera, lighting, shadow map
- [x] MapBuilder: floor, 28 pastel buildings w/ rooftop details, 18 trees, central plaza + glowing orb
- [x] TrailSystem: position-history crowd-following mechanic
- [x] Player: move, followers, speed/magnet/shield/temp-upgrade logic
- [x] Enemy AI: 4 types, state machine (wander/seek_collect/chase/flee)
- [x] Collectible: bobbing spheres, magnet pull, particle burst on collect
- [x] Collision: player absorbs enemy (if bigger +1), loses followers (if smaller), enemy-enemy
- [x] HUD: crowd count, timer (urgent red <15s), enemy count, coins, progress bar
- [x] Main menu + level select (5 levels, star ratings, lock/unlock)
- [x] Upgrade shop (4 upgrades × 5 levels, coin cost, live feedback)
- [x] In-game upgrade prompts (every 10 collects, pick 1 of 3)
- [x] Settings panel: SFX/Music/Vibration toggles, data reset
- [x] Game over / victory screens with stats + coins earned
- [x] Save system (localStorage, dot-path API)
- [x] AudioManager: synth SFX via Web Audio API, mp3 music auto-loader
- [x] Particle system: burst on collect/absorb, gravity, fade
- [x] Mobile: touch joystick (dynamic origin where user touches)
- [x] Desktop: WASD + arrow keys
- [ ] Playtesting / balance tweaks
- [ ] Add music files to `music/theme1.mp3` … `music/theme9.mp3`

---

## Known Limitations / Future Work
- No multiplayer
- No online leaderboard (could add later)
- Music files must be provided by user (see `music/` folder)
- Buildings are convex hulls (no complex mesh collisions), balls slide around them
