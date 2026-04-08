# Crowd Rush 3D — Development Notes

## How to continue this session
Prompt Claude with:
> "Continue building the Crowd Rush 3D game at gms/3d/crowd/. Read CLAUDE.md first, then check TODO status."

---

## Architecture Overview

Files load in this order (all via `<script>` tags in index.html):

| File | Purpose | ~Lines |
|------|---------|--------|
| `index.html` | HTML skeleton, all UI screens | 320 |
| `style.css` | Mobile-first CSS, screens, HUD, overlays, ranking, minimap, labels | 1157 |
| `config.js` | Constants, LEVELS[], UPGRADE_DEFS[], IG_UPGRADES[], GAME_MODES, LMS_ENEMIES | 62 |
| `save.js` | SaveSystem (localStorage, dot-path get/set) | 74 |
| `audio.js` | AudioManager — Web Audio SFX + mp3 music loader | 136 |
| `map.js` | MapBuilder — floor, buildings, trees, plaza | 179 |
| `player.js` | Player (movement, Fibonacci spiral followers, upgrades, LMS helpers) | 215 |
| `enemy.js` | Enemy (AI state machine + Fibonacci spiral formation + LMS helpers) | 214 |
| `collectible.js` | Collectible + spawnParticles/updateParticles/clearParticles | 93 |
| `input.js` | InputController — keyboard + virtual touch joystick | 111 |
| `minimap.js` | MiniMap — canvas mini-map drawn every frame | 79 |
| `ui.js` | UIManager — screens, HUD, toasts, upgrade UI, ranking, size labels | 221 |
| `game.js` | Game class (main loop, collision, wiring) + entry point | 828 |
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
  ├── Play → Mode Select
  │     ├── Story Mode → Level Select → In-Game (5 levels)
  │     └── Last Man Standing → In-Game (LMS: 8 enemies, no timer)
  ├── Upgrades → Pre-game upgrade shop (coins)
  └── Settings (⚙) overlay (sound/music toggles)

In-Game (Story Mode)
  ├── HUD: crowd count, enemy count, timer, coins, progress bar
  ├── Mobile: virtual joystick | Desktop: WASD / arrow keys
  ├── Mid-game upgrade prompt every 10 collects (pick 1 of 3)
  ├── Size labels floating above every entity
  ├── Live ranking panel (top-right)
  ├── Mini-map (bottom-right, canvas, 130×130)
  └── Win: eliminate all enemies OR reach target crowd. Lose: absorbed OR timeout.

In-Game (Last Man Standing)
  ├── HUD: crowd count, enemy count (no timer, no progress bar — shows "LMS")
  ├── Real eating collision: touch smaller crowd → absorb their followers one-by-one
  ├── 8 enemies (2× each type); player starts with 5 followers
  ├── Size labels, ranking panel, mini-map all active
  └── Win: last crowd standing. Lose: fully absorbed by an enemy.

Game Over / Victory → Main Menu
```

---

## Crowd Formation (Fibonacci Spiral)
Both player and enemies use a sunflower/Fibonacci spiral cluster formation:
```
GOLDEN_ANGLE = 2.399963  (radians ≈ 137.5°)
cluster center = entity pos − moveDirXZ * TRAIL_BACK (1.5u behind)
follower[i]: r = PACK_R * sqrt(i+1),  angle = i * GOLDEN_ANGLE
```
Each follower lerps toward its computed slot each frame → natural packed blob.

---

## LMS Eating Mechanic
- `EAT_CD = 0.10s` per entity cooldown prevents burst-eating
- `closestBall(ex, ez, entity)` helper finds the nearest ball (leader or follower) to a point
- On contact: bigger crowd eats one follower per cooldown tick from the smaller crowd
- If smaller crowd reaches 0 followers → leader is removed (entity dies)
- Works symmetrically: player eats enemy, enemy eats player, enemy eats enemy

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

## Level Progression (Story Mode)

| Level | Enemies | Target Crowd | Time |
|-------|---------|-------------|------|
| 1 | 3× Rookie | 15 | 90s |
| 2 | 2× Rookie + 2× Fighter | 25 | 120s |
| 3 | 2× Fighter + 2× Champion | 35 | 120s |
| 4 | 2× Champion + 1× Boss | 45 | 150s |
| 5 | 3× Champion + 2× Boss | 60 | 180s |

Win: eliminate all enemies OR reach target crowd before time
Lose: your crowd is fully absorbed OR timer runs out with fewer than 3 followers

## LMS Spawn (Last Man Standing Mode)
- 2× Rookie + 2× Fighter + 2× Champion + 2× Boss
- Player starts with 5 followers
- No timer — `_timeLeft = Infinity`; HUD shows "LMS" badge instead of timer

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

## UI Elements (in-game)

| Element | ID | Location | Notes |
|---------|-----|----------|-------|
| HUD top pills | `#hud-top` | Top centre | Crowd / Timer or LMS / Enemies |
| Progress bar | `#progress-bar-wrap` | Below HUD top | Hidden in LMS mode |
| HUD bottom | `#hud-bottom` | Bottom right | Coins |
| Ranking panel | `#ranking-panel` | Top right | Live standings (0.25s update) |
| Mini-map | `#minimap-wrap` | Bottom right | 130×130 canvas, drawn each frame |
| Size labels | `#label-container` | Overlay | CSS-positioned over 3D scene |

---

## TODO / Status

- [x] Project scaffold (index.html, style.css, CLAUDE.md)
- [x] Multi-file architecture (12 JS modules, no build step)
- [x] Three.js r128 scene, camera, lighting, shadow map
- [x] MapBuilder: floor, 28 pastel buildings w/ rooftop details, 18 trees, central plaza + glowing orb
- [x] Player: move, followers (Fibonacci spiral cluster), speed/magnet/shield/temp-upgrade logic
- [x] Enemy AI: 4 types, state machine (wander/seek_collect/chase/flee), Fibonacci spiral formation
- [x] Collectible: bobbing spheres, magnet pull, particle burst on collect
- [x] **Two game modes**: Story Mode (5 levels) vs Last Man Standing (8 enemies, no timer)
- [x] **Mode select screen** wired to Play button
- [x] **Fibonacci spiral crowd formation**: followers bunch as a packed blob, not a snake trail
- [x] **LMS real eating collision**: touch smaller crowd → absorb followers one-by-one (EAT_CD 0.10s)
- [x] **Size labels**: CSS-positioned floating number above every entity (updated per frame)
- [x] **Ranking panel**: live standings sorted by crowd size (throttled 0.25s DOM update)
- [x] **Mini-map**: canvas drawn each frame showing all entities and collectibles
- [x] Collision: Story Mode soft pass-through (absorb if bigger); LMS hard eating
- [x] HUD: crowd count, timer (urgent red <15s) or "LMS" badge, enemy count, coins, progress bar
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
- No multiplayer / online leaderboard
- Music files must be provided by user (see `music/` folder)
- Buildings are convex hulls (no complex mesh collisions), balls slide around them
- LMS enemy-vs-enemy eating currently round-robins (all pairs checked per frame)
