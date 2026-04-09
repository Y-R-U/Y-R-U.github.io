# Crowd Rush 3D — Development Notes

## How to continue this session
Prompt Claude with:
> "Continue building the Crowd Rush 3D game at gms/3d/crowd/. Read CLAUDE.md first, then check TODO status."

---

## Architecture Overview

Files load in this order (all via `<script>` tags in index.html):

| File | Purpose | ~Lines |
|------|---------|--------|
| `index.html` | HTML skeleton, all UI screens | ~320 |
| `style.css` | Mobile-first CSS, screens, HUD, overlays, ranking, minimap, labels | ~1200 |
| `config.js` | Constants, LEVELS[], UPGRADE_DEFS[], IG_UPGRADES[], GAME_MODES, LMS_ENEMIES | ~80 |
| `save.js` | SaveSystem (localStorage, dot-path get/set) | 74 |
| `audio.js` | AudioManager — Web Audio SFX + mp3 music loader | 136 |
| `map.js` | MapBuilder — floor, buildings, trees, plaza; exposes buildings[] for collision | ~185 |
| `player.js` | Player (movement, chain-following followers, upgrades, LMS helpers) | ~210 |
| `enemy.js` | Enemy (AI state machine + chain-following formation + LMS helpers) | ~240 |
| `collectible.js` | Collectible + spawnParticles/updateParticles/clearParticles | 93 |
| `input.js` | InputController — keyboard + virtual touch joystick | 111 |
| `minimap.js` | MiniMap — DPR-aware canvas mini-map drawn every frame | ~85 |
| `ui.js` | UIManager — screens, HUD, toasts, upgrade UI, ranking, size labels, kill feed | ~260 |
| `game.js` | Game class (main loop, collision, wiring) + entry point | ~880 |
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
  ├── Play → Mode Select (shows LMS personal best)
  │     ├── Story Mode → Level Select → In-Game (5 levels)
  │     └── Last Man Standing → In-Game (8 enemies, no timer)
  ├── Upgrades → Pre-game upgrade shop (coins)
  └── Settings (⚙ in ranking panel header, or menu button)

In-Game (Story Mode)
  ├── Left HUD panel: crowd count | timer | enemy count | coins + progress bar
  ├── Ranking panel (top-right, transparent): live standings + ⚙ cog button
  ├── Mini-map (bottom-right, transparent): 130×130 canvas
  ├── Mobile: virtual joystick | Desktop: WASD / arrow keys
  ├── Mid-game upgrade prompt (10 collects, then 20, 40, 80... doubling)
  ├── Size labels floating above every entity
  └── Win: eliminate all enemies OR reach target crowd. Lose: absorbed OR timeout.

In-Game (Last Man Standing)
  ├── Left HUD panel: crowd count | LMS | enemy count | coins (no progress bar)
  ├── Real eating collision: touch smaller crowd → absorb followers one-by-one
  ├── Kill feed: centre-screen log of eliminations
  ├── Enemy aggression scales as count drops
  └── Win: last crowd standing (saves LMS personal best).
```

---

## UI Layout (in-game)

```
┌─────────────────────────────────────────────────────┐
│ [Left panel]  👥23 ⏱1:30 ⚔5 🪙120      [Rankings⚙] │
│ [Progress bar]                          [#1 You  23] │
│                                         [#2 Boss 18] │
│                   3D SCENE                           │
│                 [Kill feed msgs]                     │
│                                                      │
│                                           [Mini-map] │
│         [Joystick]                                   │
└─────────────────────────────────────────────────────┘
```

| Element | ID | Location |
|---------|-----|----------|
| Left HUD panel | `#hud-left` | Top-left, rounded bottom-right corner |
| Ranking panel | `#ranking-panel` | Top-right, 0-radius top-right, contains cog |
| Cog button | `#cog-btn` | Inside ranking-panel header |
| Mini-map | `#minimap-wrap` | Bottom-right, 75% opacity |
| Kill feed | `#kill-feed` | Center screen, LMS only |
| Hit flash | `#hit-flash` | Fullscreen red vignette on hit |
| Size labels | `#label-container` | CSS overlay, above 3D scene |

---

## Crowd Formation (Chain-Following)
Both player and enemies use a chain-following system where each follower chases the one ahead:
```
follower[0] → chases player leader
follower[i] → chases follower[i-1]
GAP = 1.0 (desired trailing distance behind target)
```
- Per-follower random `followSpeed` (player: 5–10, enemy: 6–11) creates natural bunching:
  fast followers catch up to slow ones ahead → crowd clumps organically
- Per-follower random `latOff` (lateral offset ±0.9) prevents single-file lines
- Result: trailing crowd that spreads out when moving and bunches when stopping

---

## LMS Eating Mechanic
- `EAT_CD = 0.10s` per entity cooldown prevents burst-eating
- `closestBall(entity, qx, qz)` helper finds the nearest ball (leader or follower) to a point
- On contact: bigger crowd eats one follower per cooldown tick from the smaller crowd
- If smaller crowd reaches 0 followers → leader is removed (entity dies)

---

## Upgrade Systems

### Pre-Game (persistent, bought with coins)
| Upgrade | Levels | Effect |
|---------|--------|--------|
| Speed | 5 | +8% player speed per level (capped at 22 u/s total) |
| Magnet | 5 | +15% collect radius per level (capped at 20u total) |
| Starting Squad | 5 | Start with +2 followers per level |
| Coin Bonus | 5 | +15% coins earned per level |
| Steal Followers | 5 | Steal N followers from enemy on contact (N = upgrade level) |

### In-Game (temp, offered at 10 collects → 20 → 40 → 80… doubling each time)
Pick 1 of 3 randomly presented from:
- Speed Surge (+25% speed this run, capped)
- Mass Magnet (+40% magnet range this run, capped)
- Shield (3s immunity next hit)
- Double Crew (each pickup = 2 followers for 20s)
- Curse Top Player (rank-1 enemy earns followers at ½ speed for 30s)
- Lucky Star (coin drops ×2 for 30s)

---

## Enemy Types

| Type | Color | Crowd | Behaviour |
|------|-------|-------|-----------|
| Rookie | Green `#66BB6A` | 3–8 | Random wander; hunts if ≥10 crowd |
| Fighter | Orange `#FFA726` | 6–12 | Seeks collectibles |
| Champion | Red `#EF5350` | 12–20 | Hunts player if bigger |
| Boss | Purple `#AB47BC` | 22–35 | Smart: collects + hunts |

Enemy AI: WANDER → SEEK_COLLECT → CHASE_PLAYER → FLEE
- **Flee**: ALL enemy types flee when player is clearly bigger (crowdSize > enemy + 4)
- **LMS aggression scaling**: as enemies are eliminated, survivors get +10 huntRange each

---

## Level Progression (Story Mode)

| Level | Enemies | Target Crowd | Time |
|-------|---------|-------------|------|
| 1 | 3× Rookie | 15 | 90s |
| 2 | 2× Rookie + 2× Fighter | 25 | 120s |
| 3 | 2× Fighter + 2× Champion | 35 | 120s |
| 4 | 2× Champion + 1× Boss | 45 | 150s |
| 5 | 3× Champion + 2× Boss | 60 | 180s |

## LMS Spawn (Last Man Standing)
- 2× Rookie + 2× Fighter + 2× Champion + 2× Boss
- Player starts with 5 + (squad upgrade × 2) followers
- No timer — `_timeLeft = Infinity`; HUD shows "LMS" badge

---

## Key Constants (config.js)
```js
SPEED_CAP  = 22   // max player speed in units/s
MAGNET_CAP = 20   // max magnet radius in units
```

---

## Building Collision (DISABLED)
`MapBuilder` exposes `this.buildings = [{x, z, hw, hd}, ...]` for all placed buildings.
`Game._resolveBuildings(ex, ez, r)` method exists but is NOT called — disabled because enemies
were getting stuck behind buildings. All entities pass through buildings for now.

## Camera & Zoom
- Default zoom level: `_zoomLevel = 0.33` (0 = closest, 1 = furthest)
- Camera height: `22 + zl * 22`, Z offset: `18 + zl * 18`
- Mobile: pinch-to-zoom on canvas (two-touch gesture)
- Desktop: scroll wheel zoom
- Camera lerps smoothly to target position each frame

---

## LMS Personal Best
Saved in `SaveSystem` under key `lmsBest`:
```js
{ crowd: 0, enemies: 0, time: 0 }
```
Displayed on the LMS mode card in the mode-select screen.

---

## TODO / Status

### Session 3 — Completed
- [x] config.js: add steal upgrade, replace crowdBurst→curse, add caps (SPEED_CAP, MAGNET_CAP)
- [x] player.js: chain-following crowd, stealCount, curseTimer, speed/magnet cap
- [x] enemy.js: chain-following crowd, B2 flee clamp, B4 wander normalize, curseTimer,
              huntRangeBoost, all-types flee when player clearly bigger
- [x] map.js: expose buildings[] for collision
- [x] minimap.js: DPR scaling
- [x] ui.js: LMS star fix, ranking in-place, label cache, showKillFeed, showHitFlash, updateLmsBest
- [x] index.html: left HUD panel, cog in ranking header, kill feed, hit flash, LMS best line
- [x] style.css: left panel, transparent ranking/minimap, kill feed, hit flash
- [x] game.js: IG doubling intervals, steal mechanic, curse mechanic, pinch-to-zoom,
              scroll-wheel zoom, zoomed-out default camera, building collision disabled,
              kill feed (E4), LMS best (E5), hit flash (E6), enemy aggression (E8),
              B1/B3/B5 bugs, P1/P3/P4 perf, balance fixes
- [x] save.js: steal upgrade + lmsBest defaults

### Previously Completed (Sessions 1-2)
- [x] Project scaffold (index.html, style.css, CLAUDE.md)
- [x] Multi-file architecture (12 JS modules, no build step)
- [x] Three.js r128 scene, camera, lighting, shadow map
- [x] MapBuilder: floor, 28 pastel buildings w/ rooftop details, 18 trees, central plaza
- [x] Player: move, followers (Fibonacci spiral cluster), speed/magnet/shield/temp-upgrade logic
- [x] Enemy AI: 4 types, state machine (wander/seek_collect/chase/flee), Fibonacci spiral
- [x] Collectible: bobbing spheres, magnet pull, particle burst on collect
- [x] Two game modes: Story Mode (5 levels) vs Last Man Standing (8 enemies, no timer)
- [x] Mode select screen wired to Play button
- [x] Fibonacci spiral crowd formation (followers bunch as packed blob)
- [x] LMS real eating collision (EAT_CD 0.10s)
- [x] Size labels (CSS-positioned floating count above every entity)
- [x] Ranking panel (live standings, throttled 0.25s DOM update)
- [x] Mini-map (canvas drawn each frame)
- [x] HUD: crowd count, timer or LMS badge, enemy count, coins, progress bar
- [x] Main menu + level select (5 levels, star ratings, lock/unlock)
- [x] Upgrade shop (4 upgrades × 5 levels)
- [x] In-game upgrade prompts (every 10 collects, pick 1 of 3)
- [x] Settings panel: SFX/Music/Vibration toggles, data reset
- [x] Game over / victory screens with stats + coins earned
- [x] Save system (localStorage, dot-path API)
- [x] AudioManager: synth SFX, mp3 music auto-loader
- [x] Particle system: burst on collect/absorb
- [x] Mobile: touch joystick | Desktop: WASD + arrow keys

### Deferred / Future
- [ ] Playtesting / balance tweaks (ongoing)
- [ ] Ba1: Add starting-squad to persistent upgrades (done via existing squad upgrade)
- [ ] Multiplayer / online leaderboard
- [ ] Add music files to music/theme1.mp3–theme9.mp3 (user task)
- [ ] Custom confirmation modal instead of confirm()
- [ ] InstancedMesh for followers (performance)

---

## Known Limitations
- Building collision disabled (enemies got stuck); entities pass through buildings
- Music files must be provided by user
- LMS enemy-vs-enemy eating round-robins all pairs per frame
- E9 crowd LOD not yet implemented (deferred to future session)
