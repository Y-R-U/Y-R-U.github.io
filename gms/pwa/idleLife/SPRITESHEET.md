# Life Idle — Spritesheet Specification

Place the finished file at: `assets/spritesheet.png`

Once it exists, set `SPRITE.exists = true` in `js/config.js`.

---

## Canvas Dimensions

| Property | Value |
|----------|-------|
| Tile size | 128 × 128 px |
| Columns | 8 |
| Total width | 1024 px |
| Total rows | 5 |
| Total height | 640 px |
| Background | Transparent (PNG-32) |
| Scale | 2× pixel art (64px artwork, rendered at 128px) |

---

## Row 0 — Character Stages  (y = 0)

Full-body character illustrations, portrait orientation.
Each stage represents the player's wealth tier.

| Col | Index | Character | Style notes |
|-----|-------|-----------|-------------|
| 0 | 0 | Street Sweeper | Ragged clothes, broom, hunched posture |
| 1 | 1 | Sign Holder | Worker vest, holding arrow sign |
| 2 | 2 | Employee | Clean shirt, name badge, slightly confident |
| 3 | 3 | Professional | Suit, briefcase, upright posture |
| 4 | 4 | Small Business Owner | Smart-casual, coffee cup, keys |
| 5 | 5 | Entrepreneur | Sharp suit, phone, smiling |
| 6 | 6 | Corporation Head | Dark suit, power stance |
| 7 | 7 | Global Mogul | Expensive suit, gold watch, globe behind |

---

## Row 1 — Job Icons  (y = 128)

Square icon badges for jobs in the Work tab.

| Col | Job ID | Icon description |
|-----|--------|-----------------|
| 0 | sweeper | Broom / dustpan silhouette |
| 1 | sign_holder | Arrow sign with stick figure |
| 2 | paper_delivery | Rolled newspaper + bike |
| 3 | fast_food | Burger + fries bag |
| 4 | office_assist | Monitor + coffee mug |
| 5 | security | Shield + flashlight |
| 6 | *(reserved)* | |
| 7 | *(reserved)* | |

---

## Row 2 — Business Icons A  (y = 256)

| Col | Business ID | Icon description |
|-----|-------------|-----------------|
| 0 | food_truck | Side view of colourful food truck |
| 1 | barber | Barber pole + scissors |
| 2 | cafe | Cup with steam swirl + coffee bean |
| 3 | restaurant | Knife + fork inside plate dome |
| 4 | boutique | Dress on a hanger |
| 5 | carwash | Car silhouette with bubbles |
| 6 | hotel | Multi-storey building, star on top |
| 7 | mall | Double-storey mall facade |

---

## Row 3 — Business Icons B  (y = 384)

| Col | Business ID | Icon description |
|-----|-------------|-----------------|
| 0 | techco | Laptop + code brackets `</>` |
| 1 | chain | Row of three identical restaurant signs |
| 2 | logistics | Semi-truck on a map route |
| 3 | realestate | City skyline silhouette |
| 4 | intlcorp | Globe with HQ pin |
| 5 | techgiant | Satellite dish + orbital ring |
| 6 | megacorp | Crown over a globe |
| 7 | *(reserved)* | |

---

## Row 4 — UI Elements  (y = 512)

| Col | Element | Usage |
|-----|---------|-------|
| 0 | Gold coin (face) | Coin particle effect |
| 1 | Gold coin (spin mid) | Coin particle animation frame |
| 2 | Gold coin (edge) | Coin particle animation frame |
| 3 | Star burst | Milestone / upgrade flash |
| 4 | Lightning bolt | Event banner icon |
| 5 | Up arrow (upgrade) | Upgrade card background icon |
| 6 | Briefcase | Stats panel icon |
| 7 | *(reserved)* | |

---

## Art Style Guidelines

- **Palette**: Deep navy backgrounds (#0f1130), gold highlights (#FFD700), muted neon accents
- **Outlines**: 2px dark outline (#050820) for all characters and icons
- **Shading**: Simple cel-shading with 2–3 tones per colour
- **Legibility**: Each icon must read clearly at 44×44 CSS pixels (the card icon display size)
- **Characters**: Must read at 128×128 CSS pixels (the character circle)
- **Background**: Transparent — sprites sit on the game's dark card/circle backgrounds

---

## Enabling the Spritesheet

After placing `assets/spritesheet.png`, open `js/config.js` and change:

```js
// Line: exists: false
exists: true
```

The game will automatically use sprite tiles instead of emoji fallbacks everywhere.
