# SYNTHWILD — Design

Mobile-first voxel survival/builder. **Plays like Minecraft** (two kids already know it: break, place,
gather, craft, survive the night, build), **looks nothing like it**: a far-future wilderness where
biology and technology grew into each other. Wondrous, bright and readable, not grimdark.

## Fantasy
Not far in the future, people stopped building and started *growing*. Matter is laid down from seed
templates: a seed is planted, and the land grows into it, block by block. Forests still read as forests,
but bark is carbon-lattice, leaves are solar film and vines pulse like data cables. Deserts are mirror
sand, the ocean grows server-kelp, mountains are spun fibre, and plains are glass. The growers are gone.
You wake up in a seeded wild with a fabricator kit and a suit that runs on light.

## Core loop
Explore → gather (break) → fabricate → survive the night's **power-droop** → expand your built grid.

## Modes
- **Survival**: Integrity (health), Charge (the hunger meter), mobs at night and in the dark, fabrication.
- **Build** (creative): every block, flight (double-tap jump), no damage, mobs optional (default off), full brush.

## The Minecraft mapping (same game, new skin)
| Minecraft | Synthwild | Notes / improvement |
|---|---|---|
| Health (hearts) | **Integrity** (10 cells) | |
| Hunger | **Charge** (10 pips) | Drains slowly. Regenerates Integrity when high. Solar trickle in daylight and under lit blocks |
| Night | **Power-droop** | The solar trickle stops at night; standing in block light ≥ 8 restores it. That is why you build lit shelters |
| Crafting table | **Fabricator** | Shows only what you *can* make, one tap per item. No recipe grid to memorise (kids never learn it) |
| Furnace | **Reflow Oven** | Smelts ore and cooks food. Fuel: carbon nodules or lattice wood |
| Chest | **Cache** | |
| Bed | **Sleep Pod** | Skips the night and sets your respawn |
| Torch | **Glowbulb** | Block light 14 |
| Pickaxe / axe / shovel / sword | **Filament Cutter / Lattice Saw / Grain Scoop / Arc Blade** | Tiers: lattice → basalt → ferrite → qubit |
| Bow | **Pulse Bow** (later) | |
| Coal / iron / gold / diamond | **Carbon Nodule / Ferrite / Aurum Wire / Qubit Crystal** | |
| Slabs / stairs | *not needed* | The 0.25 fine grid replaces them, and auto-step climbs 0.5 |
| Death drops everything | **Memory Cache** | Your backpack drops as a glowing beacon that never despawns. The hotbar is kept. A "keep inventory" setting keeps everything |
| Creeper blows up your house | **Glitchfuse EMP** | Hurts players and knocks them back; block damage only with the "mob grief" setting on (default OFF) |
| Fall damage | kept | Can be turned off in settings |
| Tool durability | kept | Can be turned off in settings |

## Mobs
Vertical slice: **bin-droid ibis** (scrap chicken, passive, drops Scrap Egg + Fibre),
**glitchfuse** (creeper: approaches, then a 1.5 s hiss with a white-cyan strobe and swelling glyph ring
→ EMP bloom), **reboot** (zombie: lurching cyborg with a red visor flare 0.4 s before each swing; burns
out (despawns with sparks) in direct sunlight).
Later: wireframe archer (skeleton), swarm-leg spider, bioreactor bull (cow), void linker (enderman),
gel-cores (slime). Each needs a readable telegraph.

## Biomes
Slice: **Solar Forest** (carbon-bark trees, solar-film canopy, data vines, lumen blooms) and
**Mirror Shore** (mirror sand, chrome shingle, shallows into the kelp-server ocean, with visible
swimmers (small fish-drones) and kelp).
Later: mirror desert, kelp-server ocean (deep), fibre mountains, glass plains.

## Voxel rules
- Hidden fine grid of **0.25**. The player places at **0.25, 0.5, 1, 2, 4 or 8**.
- **Volume brush**: choose W×H×D, then **fill / hollow / shell / replace**.
- Large stamps stay merged until edited, then split only at the cut. Greedy-mesh everything.
- First- and third-person. Block outlines show the current scale before placement.
- Breaking at scale s removes an s-sized aligned box (survival: limited to ≤1 and needs tool tier;
  build mode: any scale).

## Controls (one action map)
Actions: `move(x,y) look(dx,dy) jump crouch primary(break/attack) secondary(place/use) hotbar(n)
scaleUp scaleDown wheel(radial tools) inventory pause volumeDrag(start,end) toggleView`.
- **Touch**: Bedrock-like left stick + right-half look; buttons for break/place, jump and crouch, plus a
  radial tool wheel. Pinch changes scale. Two-finger drag defines a volume.
- **Mouse/keyboard**: look, WASD, Space, Shift, 1–9 hotbar, wheel = scale, LMB break, RMB place,
  hold-drag = volume, E inventory, Q wheel, F5/V view.
- **Gamepad**: the same actions.
- No desktop-only verbs.

## Ease settings (every one can be toggled)
Auto-jump, aim assist (touch), no fall damage, keep inventory, tools never break, peaceful,
always day, bigger UI, high-contrast outline, left-handed layout, invert look.

## Art direction
Stylised PBR-lite, readable at a distance, emissive masks and cheap rim light. One shared atlas and one
opaque + one cutout + one water material (no per-block materials). Palette: warm daylight greens and
golds with teal and magenta emissive accents. Night is deep blue with the flora glowing, never black.
Water has shallow clarity, visible swimmers and kelp, light shafts, nearby caustics and refraction,
and falls back to flat colour in the distance.
Effects: filament break sparks, a hologram place commit (a wireframe box that solidifies), an EMP bloom
for the glitchfuse. Particles are capped.

## UI
Glassy low hotbar, a hologram scale readout on the tool, a slide-over inventory, threat-safe contrast,
minimal occlusion. Title screen: worlds list (local + cloud + public), New World (name, seed, mode,
difficulty), settings, login. A skippable voiced intro the first time (replayable from the title).

## Performance budget
30 fps on a mid-range phone, 60 on desktop. Chunk streaming, atlas, instancing for mobs, shader LOD, and a
render distance setting.

## Milestones
- **M1 (vertical slice)**: forest + mirror shore + water with swimmers, the scale brush and volume fill,
  three mobs, break/place, the 9-slot hotbar, day/night with emissive flora, survival and build modes,
  title/world management, settings, the voiced intro, the Go server with login and world save/public.
- **M2**: fabrication tree, tools/tiers, oven, cache, sleep pod, ores and caves, the remaining biomes.
- **M3**: the remaining mobs, polish, the hub listing.
