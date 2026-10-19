# VECTOR PROTOCOL — Roster

Owner: design. **Source of truth for numbers is `js/data/units.js` / `abilities.js` / `enemies.js`**; this file is regenerated from them
(`node js/data/_gen_roster.mjs` from the game folder; hand-written sections live in `js/data/_roster_tpl.md`).
Unit `id` == robots `MODELS` id == `UnitDef.model`.

## Launch set (robots builds these first — 14)
{{LAUNCH}}

The 10 units in `refs/ref_battle_01.png` / `ref_battle_02.png`:
| ref position | unit |
|---|---|
| player front-near, blue shield heavy | `bulwark` |
| player front-far (behind shield heavy), white sleek rifle archer | `lancer` |
| player mid, gold legendary blade | `paladin` |
| player mid-back, purple orb mage | `oracle` |
| player near, dark heavy gunner (cyan plate) | `gunner` |
| enemy, red shield tank | `riot` |
| enemy, black-red spiky archer | `barb` |
| enemy, red brawler | `scrapper` |
| enemy, purple bubble-shield mage | `halo` |
| enemy, black quad spider gunner | `tarantula` |
Plus four for coverage (every faction has all three roles at launch, and every locomotion type is represented): `patch` (hover medic, corporate mage), `jammer` (tracked EMP, rogue mage), `phase` (hover tank, experimental), `prism` (hover beam archer, experimental).
Starters (the two battered robots the company owns at the start): **`scrapper`** ("DENT") and **`gunner`** ("HUM"). Both render at rank 0 with the battered tier.

## Grid (36 recruitable = 3 factions × 3 roles × 4 rarities)
{{GRID}}

## Visual rules for the robots agent
- **Readability first**: every unit must be identifiable by silhouette alone at ~90 px tall on a phone. Role reads at a glance:
  **Tanks** = wide, heavy, low centre of gravity, shields/plating/fists, sizes L–XL. **Archers** = long weapon on a clear horizontal line, slim or low-slung, sizes S–M (Tarantula L). **Mages** = something floating near them (orbs, drones, discs, coils, a halo, a bubble), upright or hovering, size S–M.
- **Size classes** (height in board units, a hex ≈ 1.0 wide): S 0.8–1.0 · M 1.2–1.5 · L 1.6–1.9 · XL 2.0–2.4 (footprint can spill over the hex edge).
- **Locomotion mix** across 36: biped 18, hover 14, tracked 3, quad 1 (+ fantasy quadruped wolves, brutes).
- **Faction language**: Corporate = clean white/navy panels, bevelled hard-surface, cyan emissive lines, hex hardlight. Rogue = red/black/rust, mismatched scrap plates, spikes, exhaust stacks, hazard stripes, orange emissive. Experimental = black glass + violet seams, *separated floating segments*, crystals, orbiting parts.
- **Legendaries**: gold primary material (polished, PBR high metalness, low roughness) with the faction's emissive colour as the secondary; always one floating or glowing "crown" element (sigil, halo, crest, satellites). Gold plate under them.
- **Rarity / rank visual tiers (D8)**: `createUnit({rarity})` drives the *ceiling*; rank drives detail within it. Shared language:
  - Common (R0–1): base plating, a few emissive dots, some scuffs on starters.
  - Rare (R1–2): + extra plating pieces, emissive panel lines.
  - Epic (R2–3): + secondary moving parts (rings, drones, coils), brighter emissive, idle particles.
  - Legendary (R3–5): gold, crown element, constant subtle particles / light trails.
  Each unit lists its own concrete tier steps under **Rank tiers**.
- **Base plates**: corporate cyan `#22d3ff`, rogue orange `#ff6a1a`, experimental purple `#a855f7`, legendary gold `#ffc23a` (overrides faction). Fantasy factions (D21): order blue `#3b82f6`, wild green `#22c55e`, horde red `#ef4444`; fantasy legend/heroes gold.
- **Elites** (`*_elite`): same model, red-gold ring around the plate + 1.1× scale. **Bosses**: model listed in the boss table at `scale`.

{{UNITS}}

## Enemy-only (sci-fi)
- Grunts: `scrap_drone` (rogue), `sec_drone` (corporate), `lab_drone` (experimental) — **model `drone`**: a small generic hover drone (S, ~0.7), faction tint; falls back to `needle`/`wisp`. `dock_thug` reuses `scrapper`.
- Elites: `<unit>_elite` for every unit above.

### Bosses (one per story map)
{{BOSSES}}

## Fantasy realm units (D21) — story enemies in maps 6–7, and **Rift recruits** from the Rift Gate banner (chips, opens on m6_l16). Each joins the banner pool when its level is cleared: dire_wolf m6_l5 · elf_ranger m6_l8 · horde_shaman m6_l11 · frost_wolf m6_l12 · rift_knight + elf_sage m6_l16 · minotaur m7_l6 · treant m7_l12. They never appear in `pool:'all'` banners or arena rivals, and have no faction synergies (fantasy factions).
`realm: 'fantasy'`, `body: 'humanoid' | 'quadruped' | 'brute'` (rig hint for robots). Look: `refs/ref_fantasy_01.jpg` — painterly-real organic creatures on stone plates, mossy ruins.
Factions: **Order** (blue-steel knights, frost), **Wild** (green, elves + treants), **Horde** (red, minotaurs, ember wolves). Fantasy synergies are defined in `js/data/synergies.js` for symmetry; a sister fantasy game can reuse this whole block.

#### Visual briefs (fantasy)
- `rift_knight` — L humanoid, plate armour with blue cloth tabard, longsword + kite shield; at rank up: gold trim, cape. VFX blue-steel sword arcs.
- `minotaur` — L brute (bull-headed, digitigrade legs), dark grey hide, curved horns, **twin scythe-blades**; red war-paint glow on rank up.
- `treant` — XL brute, bark body, mossy shoulders, leaf crown, root-feet; green spore particles; Overdrive = vines erupt from the floor.
- `elf_ranger` — M humanoid, green hooded cloak, longbow; white hair; Overdrive = arrows arc up and rain.
- `dire_wolf` / `frost_wolf` — M quadruped, shaggy, same rig; ember variant has orange glowing fur cracks + spark trail, frost variant blue-white fur + frost slash arcs. **Wolves `pounce` the back row** (basic picks `backline`) — the only basic attack that ignores the front screen.
- `elf_sage` — M humanoid, green robe, staff with a floating blue crystal; Overdrive = a ring of glowing trees/grass grows under allies.
- `horde_shaman` — M brute, hunched minotaur-kin with bone drum and skull totem; red smoke.

{{FANTASY}}
