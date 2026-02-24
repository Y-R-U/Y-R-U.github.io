# Spritesheet Guide - Idle Western

## Overview
The game uses emoji/text icons by default but supports an optional spritesheet
at `img/spritesheet.png` for polished pixel art or illustrated graphics.

## Spritesheet Specifications

- **File:** `img/spritesheet.png`
- **Total Size:** 512 x 512 pixels
- **Cell Size:** 64 x 64 pixels
- **Grid:** 8 columns x 8 rows
- **Format:** PNG with transparency

## Cell Layout

### Row 0 (y=0): Business Icons
| Col | x   | Content          | Description                      |
|-----|-----|------------------|----------------------------------|
| 0   | 0   | Stable Hand      | Pitchfork, hay bale, horse stall |
| 1   | 64  | Prospector       | Gold pan, creek, miner           |
| 2   | 128 | General Store    | Storefront with goods            |
| 3   | 192 | Saloon           | Swinging doors, beer sign        |
| 4   | 256 | Ranch            | Cow, fence, cowboy               |
| 5   | 320 | Sheriff's Office | Star badge, jail cell            |
| 6   | 384 | Bank             | Vault door, money bags           |
| 7   | 448 | Mining Company   | Mine shaft, cart, pickaxe        |

### Row 1 (y=64): More Businesses + UI Icons
| Col | x   | Content     | Description                 |
|-----|-----|-------------|-----------------------------|
| 0   | 0   | Railroad    | Locomotive, tracks          |
| 1   | 64  | Oil Derrick | Oil tower, black gold       |
| 2   | 128 | Coin        | Gold coin, dollar sign      |
| 3   | 192 | Star        | Pioneer star (prestige)     |
| 4   | 256 | Settings    | Gear icon                   |
| 5   | 320 | Lock        | Padlock (locked business)   |
| 6   | 384 | Arrow Up    | Upgrade arrow               |
| 7   | 448 | Trophy      | Achievement trophy          |

### Row 2 (y=128): Random Event Sprites
| Col | x   | Content             | Description                       |
|-----|-----|---------------------|-----------------------------------|
| 0   | 0   | Tumbleweed          | Brown rolling weed ball           |
| 1   | 64  | Gold Nugget         | Glinting gold nugget              |
| 2   | 128 | Wanted Poster       | Paper with "WANTED" text          |
| 3   | 192 | Dust Devil          | Swirling sand/dust                |
| 4   | 256 | Snake Oil Salesman  | Character with bottles            |
| 5   | 320 | (Reserved)          | Future event                      |
| 6   | 384 | (Reserved)          | Future event                      |
| 7   | 448 | (Reserved)          | Future event                      |

### Row 3 (y=192): Tap Effects & Coin Animation
| Col | x   | Content        | Description                |
|-----|-----|----------------|----------------------------|
| 0   | 0   | Coin frame 1   | Coin spinning animation    |
| 1   | 64  | Coin frame 2   | Coin spinning animation    |
| 2   | 128 | Coin frame 3   | Coin spinning animation    |
| 3   | 192 | Coin frame 4   | Coin spinning animation    |
| 4   | 256 | Tap effect 1   | Click/tap burst frame 1    |
| 5   | 320 | Tap effect 2   | Click/tap burst frame 2    |
| 6   | 384 | Tap dust 1     | Dust puff frame 1          |
| 7   | 448 | Tap dust 2     | Dust puff frame 2          |

### Row 4 (y=256): Tap Upgrade Icons
| Col | x   | Content        | Description             |
|-----|-----|----------------|-------------------------|
| 0   | 0   | Sturdy Gloves  | Work gloves             |
| 1   | 64  | Iron Shovel    | Shovel tool             |
| 2   | 128 | Horse & Cart   | Horse pulling cart      |
| 3   | 192 | Dynamite       | TNT bundle              |
| 4   | 256 | Steam Engine   | Steam-powered machine   |
| 5   | 320 | Golden Pickaxe | Ornate golden pick      |
| 6   | 384 | (Reserved)     |                         |
| 7   | 448 | (Reserved)     |                         |

### Rows 5-7 (y=320-448): Reserved for Future Use
- Additional businesses, characters, scenery, seasonal events, etc.

## Art Style Recommendations

1. **Palette:** Warm desert tones
   - Sand: #d2b48c, #a0835a
   - Wood: #8B5E3C, #5c3a1e
   - Sky: #d4764e, #e8a060
   - Gold: #FFD700, #B8860B
   - Accent red: #a02020
   - Night sky: #1a0a2e

2. **Style:** Pixel art (16x16 or 32x32 scaled up to 64x64) works great
   for this genre. Clean outlines, limited palette per sprite (8-12 colors).

3. **Consistency:** All icons should:
   - Have a consistent outline weight (1-2px)
   - Use the same shadow direction (bottom-right)
   - Have a slight bottom shadow for grounding
   - Be centered in their 64x64 cell with ~4px padding

4. **Background:** Transparent (PNG alpha). The game composites sprites
   over the Western-themed UI.

## How to Use

1. Create a 512x512 PNG following the cell layout above
2. Save it as `img/spritesheet.png`
3. The game auto-detects the spritesheet and uses it instead of emojis
   (when spritesheet support is implemented in a future update)

## Tools for Creating

- **Aseprite** - Best for pixel art, supports grid/cell mode
- **Piskel** - Free browser-based pixel art tool
- **LibreSprite** - Free open-source alternative to Aseprite
- **Photoshop/GIMP** - Set up 64px grid overlay, draw in each cell

## Template

A blank grid template can be created with:
```
Create a 512x512 canvas
Enable grid: 64x64 pixel spacing
Draw content in each cell per the layout above
Export as PNG with transparency
```
