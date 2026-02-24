# Idle Western - Game Design Document

## Overview
**Idle Western** is a mobile-first portrait PWA idle/clicker game set in the American Wild West.
Players start as a penniless drifter arriving in a frontier town and work their way up from
shoveling horse manure to owning railroads and oil fields.

## Core Loop
1. **TAP** - Click/tap to earn coins doing manual labor
2. **HIRE** - Spend coins to hire workers who automate jobs
3. **UPGRADE** - Improve workers and unlock new businesses
4. **EXPAND** - Unlock higher-tier businesses
5. **PRESTIGE** - "Move West" to a new town with permanent multipliers

## Progression: Jobs & Businesses (10 Tiers)

| Tier | Name | Base Cost | Base Income/s | Unlock At | Flavor |
|------|------|-----------|--------------|-----------|--------|
| 1 | Stable Hand | 15 | 0.5 | Start | Mucking out horse stalls |
| 2 | Prospector | 100 | 3 | 50 coins | Panning for gold in the creek |
| 3 | General Store | 500 | 12 | 500 coins | Selling supplies to settlers |
| 4 | Saloon | 3,000 | 50 | 3K coins | Whiskey and card games |
| 5 | Ranch | 12,000 | 150 | 15K coins | Cattle herding and sales |
| 6 | Sheriff's Office | 50,000 | 500 | 75K coins | Collecting bounties |
| 7 | Bank | 250,000 | 2,000 | 400K coins | Loans and interest |
| 8 | Mining Company | 1,500,000 | 10,000 | 2.5M coins | Deep mine gold extraction |
| 9 | Railroad | 10,000,000 | 55,000 | 20M coins | Freight and passenger lines |
| 10 | Oil Derrick | 75,000,000 | 300,000 | 150M coins | Black gold! |

**Cost scaling:** `cost = baseCost * 1.12^owned`

## Upgrades System
Each business gets milestone upgrades at 10, 25, 50, 100, 200, 300, 500 owned:
- **10 owned:** 2x production for that business
- **25 owned:** 2x production
- **50 owned:** 3x production
- **100 owned:** 4x production
- **200 owned:** 4x production
- **300 owned:** 5x production
- **500 owned:** 10x production

## Tap Mechanics
- Base tap value: 1 coin
- Tap upgrades purchasable (2x, 5x, 10x etc.)
- Visual feedback: coin icon flies up from tap point, fades out
- Tap counter displayed

## Random Events (appear on screen, tap to activate)

| Event | Visual | Duration | Effect | Frequency |
|-------|--------|----------|--------|-----------|
| Tumbleweed | Rolling weed sprite/icon | 5s on screen | 2x all income for 5 min (stacks) | Every 30-90s |
| Gold Nugget | Glinting nugget | 3s on screen | Instant 10x tap value coins | Every 60-180s |
| Wanted Poster | Poster flies in | 4s on screen | 3x tap value for 3 min | Every 90-240s |
| Dust Devil | Swirling dust | 6s on screen | 5x income for 1 min | Every 120-300s |
| Snake Oil Salesman | Walking figure | 5s on screen | Random: 2x-10x income for 2 min | Every 180-600s |

## Prestige System: "Move West"
- Available after earning 1M total coins
- Prestige currency: "Pioneer Stars"
- Formula: `stars = floor(sqrt(totalEarned / 1,000,000))`
- Each star = +5% all income (multiplicative)
- Resets: all businesses, coins, upgrades
- Keeps: pioneer stars, achievements, total stats

## Offline Earnings
- Earn up to 8 hours of idle income while away
- Welcome back screen shows earnings
- Capped at 50% of active rate (incentivize active play)

## UI Layout (Portrait Mobile)

```
+----------------------------------+
| [*] IDLE WESTERN        [coins]  |  <- Header: settings + currency
|     [coins/sec]                  |
+----------------------------------+
|                                  |
|  [   WESTERN SCENE AREA    ]    |  <- Visual area with town scene
|  [   Tap target / events   ]    |  <- Tumbleweed crosses here
|  [   Coin animations here  ]    |
|                                  |
+----------------------------------+
|  [Business List - scrollable]    |  <- Main gameplay
|  +-----------+--------+------+  |
|  | Stable x3 | 0.5/s  | $22  |  |
|  | Prospect. | locked  | $100 |  |
|  | Store     | locked  | $500 |  |
|  +-----------+--------+------+  |
+----------------------------------+
| [Jobs] [Upgrades] [Prestige] [!] |  <- Bottom nav tabs
+----------------------------------+
```

## Tabs
1. **Jobs** - Main business list, buy/upgrade
2. **Upgrades** - Per-business milestone upgrades + tap upgrades
3. **Prestige** - Move West panel, star bonuses
4. **Achievements** - Milestone tracker

## Visual Style
- Warm desert palette: sandy yellows, burnt orange, deep brown, dusty red
- Aged paper/wood textures via CSS
- Western serif-style font
- Icon-based graphics with optional spritesheet override
- Simple CSS animations for coin fly-up, tumbleweed roll

## Spritesheet Plan
A single spritesheet (512x512) with 64x64 cells:
- Row 0: Business icons (10 slots)
- Row 1: UI icons (coin, star, settings, etc.)
- Row 2: Random event sprites (tumbleweed, nugget, poster, etc.)
- Row 3: Tap effects, coin animation frames
- Row 4-7: Reserved for future

## Technical Stack
- Pure HTML5 + CSS3 + Vanilla JS (no frameworks)
- PWA: manifest.json + service worker
- LocalStorage for save/load
- RequestAnimationFrame for game loop
- CSS custom properties for theming
- Responsive portrait layout with CSS Grid/Flexbox

## File Structure
```
idleWestern/
├── index.html              # Main HTML shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── style.css           # All styles
├── js/
│   ├── app.js              # Entry point, game loop
│   ├── gameState.js        # State management, save/load
│   ├── gameData.js         # Business/upgrade definitions
│   ├── ui.js               # DOM rendering
│   ├── events.js           # Random events system
│   ├── effects.js          # Visual effects (coins, taps)
│   └── utils.js            # Number formatting, helpers
├── img/
│   ├── icon-192.png        # PWA icon
│   ├── icon-512.png        # PWA icon
│   └── spritesheet.png     # Optional spritesheet (if exists)
└── SPRITESHEET_GUIDE.md    # How to create the spritesheet
```
