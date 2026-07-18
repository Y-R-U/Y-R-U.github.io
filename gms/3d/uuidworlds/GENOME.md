# UUID Worlds — The Genome

Every world is fully determined by a 32-character base-62 UUID. The UUID is not
hidden — it *is* the artifact. Same UUID = same world, always, on any device.

```
alphabet  0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
          (char value = index 0–61: '0'=0 … '9'=9, 'a'=10 … 'z'=35, 'A'=36 … 'Z'=61)
length    32 characters  →  62³² ≈ 2.27 × 10⁵⁷ possible worlds
```

## Character map (locked — changing a position changes every world)

| pos | trait | table (62 entries each) |
|----:|-------|-------------------------|
| 0 | **Sky palette** | 14 authored archetypes (Clear Noon, Ember Dusk, Deep Night, Blood Sky, Ink & Gold…). First pass is canonical; repeat slots are *gentle* variants of the pretty archetypes only, with deliberate DRAMA surprises (Neon Violet, Acid Dawn, Blood Sky II…) in ~20% of slots. Genesis (index 2, Ember Dusk) is always pretty. |
| 1 | **Time of day** | a 62-step day wheel (midnight → noon → night). Controls sun position, light intensity, "dayness". Independent of pos 0 — a dark palette at noon is a legitimate mood. |
| 2 | **Weather / fog** | 8 fog bands (crystal clear → pea soup); indices 44–53 add rain, 54–61 add snow. |
| 3 | **Water hue** | greens → blues walk (120°→250°), shallow/deep/foam triplets. |
| 4 | **Terrain / water layout** | 13 families: inland, coast N/E/S/W, bay, island, lake, twin lakes, river, archipelago, flooded basin, ridge valley. |
| 5 | **Building count** | 8 + value → 8–70 buildings. |
| 6 | **Max floors** | 2 + round(value × 48/61) → 2–50 floors. |
| 7 | **Building palette** | 10 archetypes (Concrete, Noir & Gold, Glass Blue, Pastel Town…) × hue drift. |
| 8 | **Architecture style** | 9 families: blocks, setback, slab & podium, cylinders, ziggurats, spired, mixed, brutalist, glass. |
| 9 | **Vehicle count** | round(value × 20/61) → 0–20. Worlds with zero vehicles exist. |
| 10 | **Vehicle palette** | 8 fleet kinds (Taxi Fleet, Blackout, Candy…) × golden-angle hue walk. |
| 11 | **Featured AI person** | 62 names, modern + historic — the terminal's logged-in user. |
| 12 | **Wall quote** | 62 quotes. Framed in the room AND painted on exactly one billboard in the world. |
| 13 | **Poster set** | 10 math-art families (lissajous, moiré, voronoi, phyllotaxis spiral, rays, grid, noise, glyphs, circles, ridge) × palette variants. The glyph posters embed this world's UUID. |
| 14 | **Book on the desk** | 62 titles + fictional authors. Tap it for its seeded first line. |
| 15 | **Flythrough style** | 7 families (drone sweep, low chase, balcony pan, spiral descent, high orbit, skyfall, shoreline run) × height/speed variants. |
| 16 | **UUID-fact** | which "how big is 62³²?" comparison this world tells you (double-tap the code). |
| 17 | **Billboard content set** | 8 ad families (fictional AI companies, civic sim notices, seed travel, retro computing, latent goods, math poetry, jobs, glitch whispers) × accent hue. |
| 18 | **HERO effect** | the world's full-scene visual signature. 16 families incl. 4 "none" slots: aurora, orbital rings, meteors, giant planet, wireframe pulse terrain, mote fields, lightning storm, sky beams, glyph rain, floating monoliths, tower lasers, eclipse, overhead galaxy, lissajous swarm, sky helix. |
| 19 | **Packed ambient effect** | flat (family, variation) table from 13 families: dust, birds, leaves, bubbles, blimp, drones, mist, water sparkle, shooting stars, butterflies, smoke, sky lanterns, confetti. |
| 20 | **Street-sign theme** | 6 families (tensor streets, warnings, tiny poems, binary, civic, wayfinder) — theme picks palette + typography + message family; the PRNG stream assigns which message lands on which sign. |
| 21 | **Shopfront theme** | 4 name families × hue, neon or painted. |
| 22 | **Room palette** | 8 archetypes (Warm Study, Cool Loft, Midnight, Rose Quartz…) × hue drift — walls, floor, rug, desk. |
| 23 | **Soundscape** | ambient pad: root note, detune beat, filter cutoff, LFO rate, wind amount. |
| 24 | **Nature theme** | tree shape (pine, broadleaf, palm, bare, crystal) + foliage/grass colours. |
| 25 | **Window lights** | density band (dark town → full blaze) + warm/cool mix + flicker flag. |
| 26 | **Landmark** | 13 families incl. none: obelisk, comm mast, ferris wheel*, wind farm*, water tower, colossus, arch, dome, harbour crane*, radio dish*, lighthouse*, holo pyramid* (*animated). |
| 27–31 | **Entropy** | no direct trait. These chars only alter the whole-string hash feeding every micro-variation stream (window-light placement, clutter, sign jitter, paths) — so two UUIDs equal in 0–26 still feel different. |

## Theme grouping

Characters select **themes**, not individual items — the theme cascades. The
sign char picks {palette, typography, message family}; the seeded PRNG stream
then distributes the family's ~10 messages across the actual signs. Same
pattern for billboards, posters and shopfronts. One char buys a whole coherent
family; entropy chars make each placement unique.

## Streams

All randomness beyond the 27 trait chars comes from labelled streams:
`sfc32(xmur3(uuid + '·' + label))` — e.g. `windows`, `billboards`, `flypath`,
`book-line`. Every stream hashes the *entire* UUID, so equal prefixes diverge.

## Stream-only content (no genome chars consumed)

Later content rides existing trait chars through NEW streams — the char map
above never grows or renumbers:

- **Person lore** (`PERSON_LINES`, aligned 1:1 with PEOPLE): what they did,
  a story, real famous quotes. Streams `person-line`. Papers/mug/plant/shelf
  in the room each tell a piece of the world (`mug` stream).
- **Poster lore** (`POSTER_LORE`): the real mathematics & history behind each
  poster style — tapping a poster teaches it.
- **Inspirational posters** (`INSPO`): one in every room (stream `inspo`),
  one in every city (`wall-signs`).
- **Wall signs & banners** (stream `wall-signs`): facade-mounted sign quads,
  vertical neon banners, plus ONE live data board per city showing real
  date/time and the world's seeded temperature (weather + time of day).
- **Animated math displays** (stream `displays`): 2–3 shader screens on
  facades — plasma / interference / lissajous / polar rose / tunnel /
  digital rain. Tapping one cycles its pattern. The first is a POI.
- **Billboard lore** (`BILLBOARD_LORE`): tapping a billboard in free-fly
  opens its ad + family lore; the quote billboard opens the quote's story.

## The chain

The next world is a pure function of the current one:

```
next = base62(sfc32(xmur3(uuid + '·next-world')))   // 32 draws
```

**Connect** follows the chain (arrival mode `CHAINED`); the faded **Random**
button jumps anywhere (`RANDOM`). Arrival mode + timestamps are logged per
world in localStorage (`uw-journey`) for future journey visualisation.

## Two tiers of generative effects

- **Hero (pos 18):** one dramatic full-scene effect — the world's signature.
  "None" is a legitimate signature and occupies 4 of the 62 slots.
- **Packed (pos 19):** one (effect, variation) pair from a flat table packing
  13 ambient families into 62 slots.

All effects are shader- or instanced-particle based, deterministic from the
seed, and cheap on mobile. No post-processing chains.

## The room

Every flythrough ends by descending to a glowing doorway and arriving in the
room — same archetype, contents seeded by the *current* world: wall/floor
palette (22), posters (13), framed quote (12), book (14), window view painted
from the sky/lights genome, clutter from entropy streams. The PC screen shows
the *next* UUID. The loop is infinite.

You can look all the way around the room, and the door is not locked: it
re-materialises the current world (deterministically — it is the same world)
outside the arrival building. Out there the glowing doorway, or the glowing
button, leads back. Nearly everything in the room answers a tap: the person,
the book, the posters, the quote, the window, the mug, the papers, the plant,
the shelf, the keyboard (field notes).
