# VECTOR PROTOCOL — Roster

Owner: design. **Source of truth for numbers is `js/data/units.js` / `abilities.js` / `enemies.js`**; this file is regenerated from them
(`node js/data/_gen_roster.mjs` from the game folder; hand-written sections live in `js/data/_roster_tpl.md`).
Unit `id` == robots `MODELS` id == `UnitDef.model`.

## Launch set (robots builds these first — 14)
`bulwark`, `paladin`, `gunner`, `lancer`, `patch`, `scrapper`, `riot`, `barb`, `tarantula`, `jammer`, `phase`, `prism`, `oracle`, `halo`

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
| | Corporate | Rogue | Experimental |
|---|---|---|---|
| tank common | WARDEN-3 (biped) | **SCRAPPER** (biped) | HUSK (hover) |
| tank rare | **BULWARK** (biped) | **RIOT** (biped) | **PHASE** (hover) |
| tank epic | CITADEL (tracked) | JUGGERNAUT (tracked) | MONOLITH (hover) |
| tank legendary | **SOVEREIGN PALADIN** (biped) | WARLORD (biped) | LEVIATHAN (hover) |
| archer common | **GUNNER** (biped) | RATTLER (biped) | NEEDLE (hover) |
| archer rare | **LANCER** (biped) | **BARB** (biped) | **PRISM** (hover) |
| archer epic | MERIDIAN (hover) | **TARANTULA** (quad) | SPECTER (biped) |
| archer legendary | EXECUTOR (biped) | WIDOWMAKER (biped) | SERAPH (hover) |
| mage common | **PATCH** (hover) | SPARKPLUG (biped) | WISP (hover) |
| mage rare | AEGIS (biped) | **JAMMER** (tracked) | **ORACLE** (biped) |
| mage epic | ARBITER (biped) | PYRE (biped) | **HALO** (hover) |
| mage legendary | PARAGON (hover) | KINGPIN (hover) | SINGULARITY (hover) |


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

## Corporate

### Tanks

#### WARDEN-3 — *Security Patrol Frame* · `warden` · tank · corporate · common
*Mall-cop chassis bought at surplus auction. Still says PROPERTY OF HALVORSEN on the back.*

- **Visual**: size **M**, **biped**. squat, wide-stanced, boxy torso, small domed head with a single visor slit. Weapon: stun baton (right) + round riot buckler (left forearm). Signature: roof-mounted amber/cyan light bar on the shoulders. Colours: off-white panels, navy joints, cyan visor.
- **Rank tiers**: R0–1 scuffed paint, dented buckler · R2 full panels + chest number decal · R3 hardlight edge on the buckler
- **Stats L1**: HP 1250 · ATK 90 · DEF 58 · interval 1.6s · crit 5% · charge ×1.25
- Basic: **Baton Strike** — [lane] 100% ATK dmg; 15% shock 0.8s
- Passive: **Riot Protocol** — wave start: shield 10% max HP 10s (self)
- Overdrive: **Lockdown** — [lane] 180% ATK dmg; stun 2s; taunt 3s (self)
- **OD VFX**: Baton crackles, slams the floor: a cyan shock ring races down the lane; the target is boxed in a glowing hex cage for the stun.

#### BULWARK — *Siege Guard* · `bulwark` · tank · corporate · rare · **LAUNCH**
Ref: player front-near: blue shield heavy.  
*Corporate siege guard. Built to stand in a doorway and make it someone else's problem.*

- **Visual**: size **L**, **biped**. hunched gorilla-heavy, huge shoulders, short thick legs, head sunk between pauldrons. Weapon: tower shield taller than its torso (left), short piston arm (right). Signature: shield face with yellow-orange chevron stripes and a glowing cyan core slit. Colours: deep blue + gunmetal, yellow chevrons, cyan eye + chest core.
- **Rank tiers**: R1 base · R2 extra shoulder plating + vents · R3 shield edge emissive · R4 hex hardlight projector on the shield, cyan rim lights
- **Stats L1**: HP 1323 · ATK 97 · DEF 61 · interval 1.7s · crit 5% · charge ×1.3
- Basic: **Shield Bash** — [lane] 100% ATK dmg
- Passive: **Bulwark Protocol** — wave start: shield 15% max HP 10s (self)
- Overdrive: **Aegis Wall** — [all allies] shield 18% max HP 8s; taunt 4s (self); fortify 4s (self)
- **OD VFX**: Plants the shield; a wall of translucent cyan hex cells unfolds sideways across the whole front line, cells lighting in a ripple; shields snap onto every ally.

#### CITADEL — *Mobile Fortress* · `citadel` · tank · corporate · epic
*A tracked bunker with opinions. Deploys a dome and dares you.*

- **Visual**: size **XL**, **tracked**. low wide tank hull, raised turret-torso with a short twin flak cannon, two folded stabiliser legs at the back. Weapon: twin short flak barrels. Signature: dome-shaped hex emitter on the roof. Colours: white + navy, cyan track glow, hazard stripes on the plough.
- **Rank tiers**: R2 base · R3 side skirts + antenna · R4 emitter halo · R5 animated cyan track lights + hardlight skirt
- **Stats L1**: HP 1421 · ATK 94 · DEF 66 · interval 1.9s · crit 5% · charge ×1.35
- Basic: **Flak Cannon** — [lane, splash 30%] 90% ATK dmg
- Passive: **Hardpoint** — aura: dr +4% to all allies
- Overdrive: **Fortress Mode** — [all allies] shield 10% max HP 8s; fortify 4s; taunt 4s (self)
- **OD VFX**: Stabiliser legs slam down, dust; a hex dome rises over the squad, panels locking in with flashes; dome pulses then fades to a faint shimmer.

#### SOVEREIGN PALADIN — *Board-Level Asset* · `paladin` · tank · corporate · legendary · **LAUNCH**
Ref: player front-mid: gold legendary blade unit.  
*A gold-plated knight built for a CEO's honour guard. Nobody remembers which CEO.*

- **Visual**: size **L**, **biped**. heroic knight proportions, broad chest, tapered waist, swept crest helmet. Weapon: energy longsword (right), small kite shield (left). Signature: gold fin-cape of layered plates down the back; triangle emblem on chest. Colours: polished gold + black under-suit, white-gold emissive blade.
- **Rank tiers**: R3 base · R4 crest + cape gets more plates · R5 blade trails light, floating gold sigil behind the head
- **Stats L1**: HP 1406 · ATK 106 · DEF 67 · interval 1.4s · crit 10% · charge ×1.2
- Basic: **Arc Blade** — [lane, splash 30%] 100% ATK dmg
- Passive: **Oath of Steel** — once below 40% HP: shield 20% max HP 10s (self); overclock 6s (self)
- Overdrive: **Judgement Arc** — [lane_all] 210% ATK dmg; expose 4s; shield 15% max HP 8s (self)
- **OD VFX**: Blade extends into a 6 m gold greatsword; overhead slash; a gold crescent wave rolls down the whole lane, floor cracks light up gold behind it.

### Archers

#### GUNNER — *Suppression Unit* · `gunner` · archer · corporate · common · **LAUNCH** · **STARTER**
Ref: player back-near: dark heavy gunner.  
*Decommissioned riot-control gunner. Its rotary barrel has never once been cleaned.*

- **Visual**: size **M**, **biped**. bulky upper body, forward-leaning, backpack ammo drum, low helmet with twin sensor eyes. Weapon: big rotary cannon held at the hip, ammo belt to the backpack. Signature: ammo belt arc + drum. Colours: matte black/gunmetal, cyan eye lights, cyan barrel tips.
- **Rank tiers**: R0–1 base · R2 armoured belt cover + shoulder lamp · R3 glowing cyan heat rings on the barrels
- **Stats L1**: HP 945 · ATK 145 · DEF 35 · interval 1s · crit 8%
- Basic: **Rotary Burst** — [lane] 80% ATK dmg
- Passive: **Suppressive Fire** — every 5th attack: slow 2s (lane)
- Overdrive: **Suppression** — [frontline] 140% ATK dmg; slow 3s
- **OD VFX**: Barrels spin white-hot; a two-second hose of cyan tracers sweeps the enemy front line left→right, brass casings spray, sparks on every hit.

#### LANCER — *Precision Rail* · `lancer` · archer · corporate · rare · **LAUNCH**
Ref: player back-far: white sleek rifle archer.  
*Kestrel Dynamics' marksman frame. Hits what it looks at. Looks at everything.*

- **Visual**: size **M**, **biped**. slim, long-legged, digitigrade, swept-back blade fins on the shoulders/head. Weapon: long rail rifle longer than its body. Signature: swept back fins + long barrel = a clear arrow shape. Colours: gloss white + light grey, cyan accents on fins and barrel coils.
- **Rank tiers**: R1 base · R2 fins lengthen, scope added · R3 barrel coils glow · R4 hardlight fins, cyan trail on idle
- **Stats L1**: HP 972 · ATK 185 · DEF 32 · interval 1.3s · crit 12%
- Basic: **Rail Shot** — [lane] 100% ATK dmg
- Passive: **Steady Aim** — every 4th attack: crit +1 0.5s (self)
- Overdrive: **Piercing Lance** — [lane_all] 260% ATK dmg (pierce)
- **OD VFX**: Kneels; rifle unfolds side fins; cyan charge builds at the muzzle for 0.4 s; a thick rail beam punches through the whole lane with a shock ring at the muzzle and a lingering ion trail.

#### MERIDIAN — *Orbital Spotter* · `meridian` · archer · corporate · epic
*A hovering sniper platform that also has the satellite on speed-dial.*

- **Visual**: size **M**, **hover**. no legs: a floating chassis with an extremely long barrel, two vertical stabiliser rings around the body. Weapon: ultra-long sniper barrel. Signature: twin spinning rings + red-cyan laser dot. Colours: white + silver, cyan rings.
- **Rank tiers**: R2 base · R3 rings gain light segments · R4 holo scope readouts · R5 third ring + hover particle trail
- **Stats L1**: HP 992 · ATK 209 · DEF 31 · interval 1.8s · crit 15%
- Basic: **Long Shot** — [lane] 125% ATK dmg
- Passive: **Designator** — on attack (25%): marked 4s (lane)
- Overdrive: **Orbital Designator** — [highest_atk] 340% ATK dmg; marked 5s
- **OD VFX**: Rises 1 m, rings spin up; a laser dot paints the strongest enemy; its shot and a thin orbital beam from the sky hit at the same instant — white flash, scorched hex.

#### EXECUTOR — *Hostile Takeover Unit* · `executor` · archer · corporate · legendary
*Restructuring, delivered at 9 km/s.*

- **Visual**: size **L**, **biped**. tall, elegant, long coat-tail plates, shoulder-mounted railcannon on a boom. Weapon: shoulder railcannon + wrist pistol. Signature: coat-tail plates and a gold monocle sensor. Colours: gold + white + black, cyan muzzle.
- **Rank tiers**: R3 base · R4 coat plates gain emissive edges · R5 floating holo-contract panels orbit it
- **Stats L1**: HP 1125 · ATK 226 · DEF 38 · interval 1.4s · crit 15%
- Basic: **Railcannon** — [lane] 110% ATK dmg
- Passive: **Hostile Takeover** — on kill: +25 charge (self)
- Overdrive: **Termination Order** — [lowest_hp ×3] 220% ATK dmg
- **OD VFX**: Railcannon unfolds; three gold beams in quick succession at the three weakest enemies; each hit stamps a gold holographic "TERMINATED" glyph.

### Mages

#### PATCH — *Field Medic Drone* · `patch` · mage · corporate · common · **LAUNCH**
*A clinic drone that got lost on the way to the hospital and found a job.*

- **Visual**: size **S**, **hover**. round body the size of a beach ball, four thin articulated repair arms underneath, one big lens. Weapon: repair beam emitter. Signature: glowing cross/plus hologram above it. Colours: white + mint/cyan, green-cyan beam.
- **Rank tiers**: R0–1 base · R2 extra arm pair + side lamps · R3 rotating holo-cross ring
- **Stats L1**: HP 792 · ATK 124 · DEF 30 · interval 1.5s · crit 5%
- Basic: **Mend Beam** — [lowest_hp_ally] heal 90% ATK
- Passive: **Nanite Field** — every 6s: regen 3s (all allies)
- Overdrive: **Triage Field** — [all allies] heal 140% ATK; cleanse 2
- **OD VFX**: Arms spread; the holo-cross expands into a dome over the squad; green-cyan nanite sparkles rain down; debuff icons pop off as sparks.

#### AEGIS — *Hardlight Projector* · `aegis` · mage · corporate · rare
*Halvorsen's bodyguard interface. It protects the asset. You are, temporarily, the asset.*

- **Visual**: size **M**, **biped**. slender upright biped with a large disc mounted on its back like a halo. Weapon: palm emitters. Signature: back disc that detaches and spins. Colours: white + pale blue, cyan disc rim.
- **Rank tiers**: R1 base · R2 disc gains hex segments · R3 disc floats free behind it · R4 twin discs
- **Stats L1**: HP 1093 · ATK 169 · DEF 39 · interval 1.5s · crit 5%
- Basic: **Hardlight Bolt** — [lane] 90% ATK dmg
- Passive: **Projector** — wave start: shield 8% max HP 12s (all allies)
- Overdrive: **Barrier Matrix** — [all allies] shield 24% max HP 8s; fortify 3s
- **OD VFX**: The disc lifts and spins overhead; beams lance from it to every ally; hex bubbles snap on around each one.

#### ARBITER — *Command Node* · `arbiter` · mage · corporate · epic
*Middle management, perfected. Its drones make sure everyone hits quota.*

- **Visual**: size **M**, **biped**. tall thin biped, long arms, tall narrow head; four small drones orbit at shoulder height. Weapon: staff-like antenna. Signature: ring of 4 orbiting command drones. Colours: navy + white, cyan drones.
- **Rank tiers**: R2 base · R3 drones gain trails · R4 holo-org-chart panels · R5 6 drones
- **Stats L1**: HP 1123 · ATK 166 · DEF 35 · interval 1.5s · crit 5%
- Basic: **Directive Pulse** — [lane] 100% ATK dmg; 20% weaken 3s
- Passive: **Chain of Command** — aura: atk +9% to all allies
- Overdrive: **Executive Override** — [all allies] haste 5s; overclock 5s
- **OD VFX**: Drones form a ring overhead; cyan order glyphs drop onto every ally; ally plates pulse and their attack anims speed up.

#### PARAGON — *Orbital Oracle* · `paragon` · mage · corporate · legendary
*Its other half is in orbit. Both halves are disappointed in you.*

- **Visual**: size **M**, **hover**. floating robed figure, no legs, six small mirror satellites orbiting in a tilted ring. Weapon: mirror satellites. Signature: tilted ring of six mirror plates. Colours: gold + white + cyan.
- **Rank tiers**: R3 base · R4 robe plates multiply · R5 satellites leave light trails, ground halo
- **Stats L1**: HP 1210 · ATK 203 · DEF 38 · interval 1.5s · crit 5%
- Basic: **Satellite Ping** — [lane] 100% ATK dmg
- Passive: **Orbital Uplink** — battle start: +30 charge (self)
- Overdrive: **Satellite Lance** — [column] 220% ATK dmg; emp 3s; -20 charge
- **OD VFX**: Satellites shoot up out of frame; a gold-white column comes down from the sky and sweeps across the enemy column; scorched glowing line stays for 1 s.

## Rogue

### Tanks

#### SCRAPPER — *Pit Brawler* · `scrapper` · tank · rogue · common · **LAUNCH** · **STARTER**
Ref: enemy front-far: red brawler.  
*Pit-fight veteran rebuilt out of three other pit-fight veterans.*

- **Visual**: size **L**, **biped**. ape-like: oversized forearms and fists, small head low between shoulders, two exhaust stacks on the back. Weapon: piston fists. Signature: giant fists + smoking exhaust stacks. Colours: red + rust, black joints, orange eyes, chipped white numbers.
- **Rank tiers**: R0–1 mismatched plates, one arm bare · R2 matched red plating + knuckle spikes · R3 glowing orange piston cores, flames from stacks
- **Stats L1**: HP 1250 · ATK 103 · DEF 52 · interval 1.4s · crit 5% · charge ×1.2
- Basic: **Piston Punch** — [lane] 100% ATK dmg
- Passive: **Adrenal Burn** — once below 60% HP: overclock 8s (self); fortify 6s (self)
- Overdrive: **Haymaker** — [lane] 240% ATK dmg; stun 1.5s
- **OD VFX**: Fist pulls back, stacks belch orange flame; rocket-assisted punch; orange shockwave, target skids back on its plate.

#### RIOT — *Line Breaker* · `riot` · tank · rogue · rare · **LAUNCH**
Ref: enemy front-near: red shield tank.  
*Stole a riot shield from the cops. Kept the cops' shotgun too.*

- **Visual**: size **L**, **biped**. tall armoured biped behind a slab shield with a gun-slot, bulky shoulders. Weapon: slab shield with a shotgun barrel through a notch. Signature: white-trimmed slab shield with a red stencil skull. Colours: red + white trim, black, orange visor.
- **Rank tiers**: R1 base · R2 spikes on shield rim · R3 shield heat-glow edges · R4 twin shotgun barrels + exhaust
- **Stats L1**: HP 1418 · ATK 97 · DEF 64 · interval 1.6s · crit 5% · charge ×1.3
- Basic: **Slug Shot** — [lane, splash 25%] 100% ATK dmg
- Passive: **Riot Line** — wave start: taunt 3s (self); fortify 3s (self)
- Overdrive: **Breach & Hold** — [frontline] 120% ATK dmg; weaken 4s; taunt 4s (self); fortify 4s (self)
- **OD VFX**: Slams the shield edge into the floor (sparks), fires a shotgun blast through the gap: wide red-orange cone across the enemy front; shield glows hot.

#### JUGGERNAUT — *Demolition Rig* · `juggernaut` · tank · rogue · epic
*A demolition rig the gangs pointed at people instead of buildings.*

- **Visual**: size **XL**, **tracked**. bulldozer hull with a raised cab-head, front plough with a spinning circular saw. Weapon: plough + saw blade. Signature: giant spinning saw + double exhaust. Colours: orange + black hazard stripes, red lamps.
- **Rank tiers**: R2 base · R3 spikes on plough + chains · R4 saw glows orange-hot · R5 flame vents along hull
- **Stats L1**: HP 1667 · ATK 104 · DEF 71 · interval 1.9s · crit 5% · charge ×1.35
- Basic: **Saw Ram** — [lane, splash 30%] 100% ATK dmg
- Passive: **Momentum** — every 4th attack: shock 0.8s (lane)
- Overdrive: **Ram Rush** — [column] 180% ATK dmg; stun 1.2s
- **OD VFX**: Engines roar (exhaust plume), lunges forward one hex and back; saw sparks; an orange impact wave hits the whole enemy column.

#### WARLORD — *Gang Sovereign* · `warlord` · tank · rogue · legendary
*Runs six gangs. Personally.*

- **Visual**: size **L**, **biped**. towering, horned helm, broad trapezoid torso, long arms. Weapon: twin chainblades. Signature: horns + twin chainblades with glowing teeth. Colours: gold + black + orange teeth glow.
- **Rank tiers**: R3 base · R4 trophy plates on shoulders · R5 burning horn tips, ember particles
- **Stats L1**: HP 1625 · ATK 140 · DEF 69 · interval 1.3s · crit 12% · charge ×1.25
- Basic: **Chainblade** — [lane, splash 30%] 100% ATK dmg
- Passive: **Blood Money** — on kill: heal 15% max HP (self); +20 charge (self)
- Overdrive: **Frenzy** — [adjacent] 110% ATK dmg; 110% ATK dmg; heal 15% max HP (self)
- **OD VFX**: Chainblades rev, teeth glow orange; spinning double cleave into the target and its neighbours; red-orange vortex of sparks and debris.

### Archers

#### RATTLER — *Street Gun* · `rattler` · archer · rogue · common
*Two SMGs, zero trigger discipline.*

- **Visual**: size **S**, **biped**. lanky, thin limbs, slouched, bandolier across chest, hood-like head cowl. Weapon: dual SMGs. Signature: hood cowl + dual guns. Colours: black + orange, graffiti tags.
- **Rank tiers**: R0–1 base · R2 extended mags + scarf cloth strip · R3 orange glowing tags
- **Stats L1**: HP 900 · ATK 155 · DEF 30 · interval 0.9s · crit 14%
- Basic: **SMG Burst** — [lane] 80% ATK dmg
- Passive: **Cheap Shots** — on crit: +5 charge (self)
- Overdrive: **Spray & Pray** — [random ×8] 65% ATK dmg
- **OD VFX**: Wild tracer fan from both SMGs, ricochet sparks everywhere, eight random hits.

#### BARB — *Needle Hunter* · `barb` · archer · rogue · rare · **LAUNCH**
Ref: enemy back-near: black-red spiky archer.  
*Fires poisoned flechettes. Looks like it's made of them.*

- **Visual**: size **M**, **biped**. thin angular biped, back covered in long red spines like a porcupine, crouched hunter stance. Weapon: long needle rifle. Signature: red back spines (fan out on Overdrive). Colours: black + blood red, orange-red eye slit.
- **Rank tiers**: R1 base · R2 more spines · R3 spines glow red at the tips · R4 spines animate/flex
- **Stats L1**: HP 972 · ATK 178 · DEF 32 · interval 1.2s · crit 15%
- Basic: **Needle Burst** — [lane] 90% ATK dmg
- Passive: **Venom Rounds** — on crit: burn 3s (lane)
- Overdrive: **Thornstorm** — [lane_all] 140% ATK dmg; burn ×2 4s
- **OD VFX**: Spines flare open; a storm of red flechettes streams down the lane; targets bristle with glowing spikes and start to burn.

#### TARANTULA — *Siege Walker* · `tarantula` · archer · rogue · epic · **LAUNCH**
Ref: enemy back-mid: black quad spider gunner.  
*An artillery spider. The Red Ledger's favourite argument.*

- **Visual**: size **L**, **quad**. low spider: four long jointed legs, flat armoured body, twin cannons on top. Weapon: twin cannons on a turret. Signature: four legs + orange eye cluster. Colours: black + gunmetal, orange eyes and vent glow.
- **Rank tiers**: R2 base · R3 leg spikes + side armour · R4 third cannon (mortar) · R5 glowing orange leg joints
- **Stats L1**: HP 1253 · ATK 194 · DEF 50 · interval 1.5s · crit 10%
- Basic: **Twin Cannon** — [lane, splash 25%] 100% ATK dmg
- Passive: **Dug In** — wave start: fortify 6s (self)
- Overdrive: **Bombard** — [all] 100% ATK dmg; expose 4s
- **OD VFX**: Legs splay and anchor; cannons tilt up; an artillery salvo arcs high and lands on every enemy slot — orange impacts, smoke columns.

#### WIDOWMAKER — *Ghost Contract* · `widowmaker` · archer · rogue · legendary
*If you see it, it was hired to be seen.*

- **Visual**: size **M**, **biped**. tall, thin, long legs, tattered cloak of panels, long rifle. Weapon: anti-materiel rifle. Signature: panel cloak + single gold eye. Colours: black + gold, orange muzzle.
- **Rank tiers**: R3 base · R4 cloak shimmer shader · R5 gold eye leaves a trail, cloak edges glow
- **Stats L1**: HP 1125 · ATK 242 · DEF 38 · interval 1.6s · crit 20%
- Basic: **Long Rifle** — [lane] 115% ATK dmg
- Passive: **Ghost Net** — wave start: stealth 4s (self)
- Overdrive: **Last Light** — [lowest_hp] 400% ATK dmg (pierce)
- **OD VFX**: Cloak shimmers to invisible; battle dims 0.3 s; a single gold-orange shot leaves a lingering line; target's HP bar shatters.

### Mages

#### SPARKPLUG — *Back-Alley Tesla* · `sparkplug` · mage · rogue · common
*Wired itself to a stolen substation. Still plugged in, somehow.*

- **Visual**: size **M**, **biped**. hunched, two tall tesla coils on the back, cables trailing to the ground. Weapon: hand electrodes. Signature: twin coils with arcing between them. Colours: rust + orange, blue-white electricity.
- **Rank tiers**: R0–1 base · R2 third coil · R3 constant idle arcs
- **Stats L1**: HP 924 · ATK 150 · DEF 30 · interval 1.3s · crit 5%
- Basic: **Arc Zap** — [lane, splash 30%] 90% ATK dmg
- Passive: **Live Wire** — on attack (15%): shock 0.8s (lane)
- Overdrive: **Arc Surge** — [random ×5] 115% ATK dmg; 50% shock 1s
- **OD VFX**: Coils glow; lightning jumps between five enemies in a chain; crackling arcs, blue-white flashes.

#### JAMMER — *Signal Pirate* · `jammer` · mage · rogue · rare · **LAUNCH**
*Pirate radio on treads. Its broadcast is: nothing works.*

- **Visual**: size **M**, **tracked**. small tracked chassis, tall telescoping antenna mast with a dish, two stubby arms. Weapon: dish emitter. Signature: tall mast + dish (the tallest thin silhouette in the roster). Colours: orange + black, white-blue static glow.
- **Rank tiers**: R1 base · R2 second dish · R3 holo static rings around the mast · R4 mast extends higher with blinking beacons
- **Stats L1**: HP 1064 · ATK 155 · DEF 32 · interval 1.5s · crit 5%
- Basic: **Static Burst** — [lane] 80% ATK dmg; -6 charge
- Passive: **Signal Jam** — every 8s: emp 2s (random)
- Overdrive: **Blackout** — [all] 60% ATK dmg; emp 3s; -25 charge
- **OD VFX**: Mast extends, dish spins; a white-blue ring-shaped EMP shockwave rolls over the enemy side; enemy lights flicker off; brief HUD glitch.

#### PYRE — *Napalm Artist* · `pyre` · mage · rogue · epic
*Calls itself an artist. Its medium is everything you own.*

- **Visual**: size **M**, **biped**. stocky biped with big fuel tanks on its back and a flamer arm. Weapon: mortar-flamer arm. Signature: back fuel tanks + pilot flame. Colours: black + orange, flame glow.
- **Rank tiers**: R2 base · R3 extra tanks · R4 heat-haze aura · R5 molten seams
- **Stats L1**: HP 1072 · ATK 163 · DEF 35 · interval 1.6s · crit 5%
- Basic: **Pyre Orb** — [lane] 70% ATK dmg; burn 3s
- Passive: **Kindling** — aura: dmg +6% to all allies
- Overdrive: **Inferno** — [all] 55% ATK dmg; burn ×2 4s
- **OD VFX**: Canisters launch from the back, burst into a carpet of fire across the enemy board; heat haze; flame columns rise.

#### KINGPIN — *Swarm Boss* · `kingpin` · mage · rogue · legendary
*Never fights. Has people for that. Small, buzzing people.*

- **Visual**: size **L**, **hover**. hovering throne-pod with a seated torso, hive racks on both sides. Weapon: scrap drone swarm. Signature: throne + drone hive racks. Colours: gold + black + orange.
- **Rank tiers**: R3 base · R4 bigger hive racks · R5 drones constantly orbit
- **Stats L1**: HP 1188 · ATK 195 · DEF 38 · interval 1.5s · crit 5%
- Basic: **Drone Sting** — [random] 110% ATK dmg
- Passive: **Protection Racket** — aura: crit +8%, atk +4% to all allies
- Overdrive: **Swarm Contract** — [random ×10] 70% ATK dmg; overclock 4s (all allies)
- **OD VFX**: Hive racks open; ~20 scrap drones pour out like hornets, zip across the enemy side with tracers, then return.

## Experimental

### Tanks

#### HUSK — *Prototype Shell* · `husk` · tank · experimental · common
*A lab prototype that keeps reassembling itself. Nobody told it to.*

- **Visual**: size **M**, **hover**. legless floating torso, arms made of separated floating segments, gaps glowing violet. Weapon: gravity fists. Signature: visible gaps between floating body parts. Colours: black glass + violet seams.
- **Rank tiers**: R0–1 base · R2 more segments, tighter gaps · R3 crystal shoulder growths
- **Stats L1**: HP 1375 · ATK 94 · DEF 58 · interval 1.6s · crit 5% · charge ×1.25
- Basic: **Grav Slam** — [lane, splash 30%] 90% ATK dmg
- Passive: **Reconstitute** — every 6s: heal 7% max HP (self)
- Overdrive: **Fold In** — [self] heal 30% max HP; taunt 4s; fortify 3s
- **OD VFX**: Segments collapse inward into a sphere, purple glow, then burst back out restored.

#### PHASE — *Blink Guard* · `phase` · tank · experimental · rare · **LAUNCH**
*It is in three places. Two of them are lying.*

- **Visual**: size **L**, **hover**. heavy hovering wedge torso with two big arms, no legs, a thruster skirt underneath. Weapon: phase fists. Signature: afterimage shimmer + thruster skirt glow. Colours: dark violet + black, magenta seams.
- **Rank tiers**: R1 base · R2 arm blades · R3 constant faint afterimage · R4 floating crystal shards orbit
- **Stats L1**: HP 1512 · ATK 102 · DEF 68 · interval 1.6s · crit 5% · charge ×1.3
- Basic: **Phase Strike** — [lane] 100% ATK dmg
- Passive: **Phase Skin** — when hit (15%): fortify 1.5s (self)
- Overdrive: **Phase Shift** — [frontline] 140% ATK dmg; slow 3s; taunt 4s (self); fortify 4s (self)
- **OD VFX**: Body splits into three offset afterimages, blinks through the enemy front line and back; purple phase-scar lines on every target.

#### MONOLITH — *Gravity Obelisk* · `monolith` · tank · experimental · epic
*Found at the bottom of a lab elevator shaft. Hums in a key that makes glass nervous.*

- **Visual**: size **XL**, **hover**. tall floating black obelisk with a glowing eye, four slab "arms" orbiting it. Weapon: orbiting slabs. Signature: the tallest monolithic shape on the board. Colours: black + violet + faint gold glyphs.
- **Rank tiers**: R2 base · R3 glyphs animate · R4 six slabs · R5 gravity-lens distortion around it
- **Stats L1**: HP 1667 · ATK 92 · DEF 77 · interval 1.8s · crit 5% · charge ×1.35
- Basic: **Gravity Maul** — [lane, splash 30%] 90% ATK dmg
- Passive: **Mass Anchor** — once below 40% HP: fortify 6s (self)
- Overdrive: **Event Horizon** — [all] 80% ATK dmg; slow 4s; taunt 4s (self)
- **OD VFX**: Obelisk lifts; slabs spin fast; a gravity-lens distortion sphere settles over the enemy side; debris pulled inward; enemies lean towards it.

#### LEVIATHAN — *Abyssal Hull* · `leviathan` · tank · experimental · legendary
*A deep-sea salvage frame that came back up different.*

- **Visual**: size **XL**, **hover**. huge hovering squid-like hull, many cable tentacles hanging below. Weapon: cable tentacles. Signature: tentacle cables + bioluminescent spots. Colours: gold + deep violet, cyan-violet spots.
- **Rank tiers**: R3 base · R4 more cables · R5 cables glow and ripple constantly
- **Stats L1**: HP 1750 · ATK 118 · DEF 76 · interval 1.6s · crit 5% · charge ×1.25
- Basic: **Cable Lash** — [lane, splash 40%] 100% ATK dmg
- Passive: **Abyssal Hull** — wave start: shield 20% max HP 12s (self)
- Overdrive: **Abyssal Grip** — [frontline] 160% ATK dmg; stun 2s
- **OD VFX**: Cables shoot across the board, wrap enemy front-liners in purple glowing coils and crush (flash) — they stay bound for the stun.

### Archers

#### NEEDLE — *Prism Drone* · `needle` · archer · experimental · common
*A lab targeting drone with a crush on whatever it targets.*

- **Visual**: size **S**, **hover**. small diamond-shaped drone with a single big lens and two little fin wings. Weapon: prism lens. Signature: diamond body + lens. Colours: black + violet lens.
- **Rank tiers**: R0–1 base · R2 extra fins · R3 orbiting mini-prisms
- **Stats L1**: HP 900 · ATK 168 · DEF 30 · interval 1s · crit 14%
- Basic: **Prism Dart** — [lane] 85% ATK dmg
- Passive: **Overcharge** — battle start: +20 charge (self)
- Overdrive: **Prism Volley** — [random ×4] 100% ATK dmg
- **OD VFX**: Drone spins; lens fires four thin violet darts in a fan at random enemies.

#### PRISM — *Spectrum Lancer* · `prism` · archer · experimental · rare · **LAUNCH**
*Splits light. Splits armour. Splits opinions.*

- **Visual**: size **M**, **hover**. floating triangular prism body with two slim arms and no legs, point-down. Weapon: core prism beam. Signature: inverted triangle body with a glowing crystal core. Colours: black glass + violet, spectrum (violet→cyan) beam.
- **Rank tiers**: R1 base · R2 prism splits into 3 floating facets · R3 rainbow caustics · R4 floating halo of shards
- **Stats L1**: HP 972 · ATK 205 · DEF 32 · interval 1.4s · crit 10%
- Basic: **Prism Bolt** — [lane] 100% ATK dmg
- Passive: **Refraction** — aura: crit +8% to all allies
- Overdrive: **Refraction Beam** — [random ×4] 160% ATK dmg
- **OD VFX**: Body rotates; the beam splits into a spectrum and bounces between four targets; each hit leaves a crystal shard that fades.

#### SPECTER — *Null Sniper* · `specter` · archer · experimental · epic
*Only exists in the instant it fires.*

- **Visual**: size **M**, **biped**. very thin stilt-legged biped, long neck, long rifle; hovering-feet (toes don't touch the plate). Weapon: null rifle. Signature: stilt legs + wavering cloak shimmer. Colours: black + pale violet, translucent at the edges.
- **Rank tiers**: R2 base · R3 cloak shimmer shader · R4 ghost trail on idle · R5 orbiting null orbs
- **Stats L1**: HP 1044 · ATK 209 · DEF 35 · interval 1.6s · crit 18%
- Basic: **Ghost Round** — [lane] 115% ATK dmg
- Passive: **Null Shell** — wave start: stealth 3s (self)
- Overdrive: **Spectrum Snipe** — [backline] 320% ATK dmg; expose 4s
- **OD VFX**: Fully cloaks (shimmer), reappears with a purple muzzle flash; the ghost-trail round curves over the front line into the back row.

#### SERAPH — *Choir Engine* · `seraph` · archer · experimental · legendary
*The lab called it a weapons platform. It calls itself a choir.*

- **Visual**: size **L**, **hover**. floating angelic figure, four large blade-wings, halo ring behind the head. Weapon: light lances. Signature: four blade wings + halo. Colours: gold + white + violet light.
- **Rank tiers**: R3 base · R4 wings gain light edges · R5 six wings, feather-particle trail
- **Stats L1**: HP 1125 · ATK 222 · DEF 38 · interval 1.3s · crit 15%
- Basic: **Light Lance** — [lane] 100% ATK dmg
- Passive: **Halo Choir** — on kill: haste 4s (self); +15 charge (self)
- Overdrive: **Choir of Lances** — [all] 115% ATK dmg; marked 4s
- **OD VFX**: Wings spread; a dozen light lances materialise in a halo above, rain diagonally onto every enemy; gold-violet pillars of light.

### Mages

#### WISP — *Mote Core* · `wisp` · mage · experimental · common
*A loose reactor core that decided it liked people.*

- **Visual**: size **S**, **hover**. glowing orb inside two crossed gyroscope rings, small and bobbing. Weapon: sparks. Signature: orb + gyro rings. Colours: violet + white core.
- **Rank tiers**: R0–1 base · R2 third ring · R3 mote particle cloud
- **Stats L1**: HP 950 · ATK 143 · DEF 30 · interval 1.4s · crit 5%
- Basic: **Wisp Spark** — [lane] 90% ATK dmg
- Passive: **Tether** — every 7s: heal 100% ATK (lowest_hp_ally)
- Overdrive: **Flicker** — [all allies] +35 charge; haste 5s
- **OD VFX**: Orb splits into a cloud of motes that streak into each ally's core; their plates flare purple.

#### ORACLE — *Null Orb Weaver* · `oracle` · mage · experimental · rare · **LAUNCH**
Ref: player back-mid: purple orb mage.  
*Runs the battle a thousand times before it starts. Hates all but one of them.*

- **Visual**: size **M**, **biped**. slender feminine-cut biped, horn-like head crest, arms raised, two orbs floating at its hands. Weapon: twin null orbs. Signature: two big glowing violet orbs + crest. Colours: dark violet + black, bright violet orbs and seams.
- **Rank tiers**: R1 base · R2 crest grows, orbs get rings · R3 orbs orbit when idle · R4 third orb + glowing runes on the floor plate
- **Stats L1**: HP 998 · ATK 169 · DEF 32 · interval 1.4s · crit 5%
- Basic: **Null Orb** — [lane] 90% ATK dmg; 25% slow 2s
- Passive: **Foresight** — aura: charge +8% to all allies
- Overdrive: **Orb Cascade** — [all] 115% ATK dmg; slow 3s; -15 charge
- **OD VFX**: Orbs swell to 2× and fly over the enemy side, spiral, and detonate into violet implosion bursts; floor tiles under enemies crack with violet light.

#### HALO — *Stasis Mother* · `halo` · mage · experimental · epic · **LAUNCH**
Ref: enemy back-far: purple bubble-shield mage.  
*Wraps its friends in time-stopped bubbles. Sometimes forgets to let them out.*

- **Visual**: size **M**, **hover**. tall floating mantis-like figure with long thin arms, sits inside a permanent translucent bubble. Weapon: palm emitters. Signature: its own violet bubble shield always visible. Colours: violet + black, translucent bubble with hex moiré.
- **Rank tiers**: R2 base · R3 bubble gets hex pattern · R4 orbiting stasis motes · R5 double bubble layers
- **Stats L1**: HP 1174 · ATK 166 · DEF 40 · interval 1.5s · crit 5%
- Basic: **Null Pulse** — [lane] 85% ATK dmg
- Passive: **Bubble Ward** — every 7s: shield 18% max HP 8s (lowest_hp_ally)
- Overdrive: **Stasis Bubble** — [all allies] shield 24% max HP 8s; cleanse 2; regen 6s
- **OD VFX**: Huge translucent violet bubbles inflate over every ally, surfaces ripple with hex moiré; cleansed debuffs pop out as sparks.

#### SINGULARITY — *Collapse Engine* · `singularity` · mage · experimental · legendary
*Its core is a very small, very angry black hole.*

- **Visual**: size **M**, **hover**. floating ring-shaped body with a black sphere core, two crescent "arms". Weapon: void core. Signature: black sphere + gold accretion ring. Colours: gold + violet + black.
- **Rank tiers**: R3 base · R4 accretion ring particles · R5 light-bending distortion around the core
- **Stats L1**: HP 1144 · ATK 205 · DEF 38 · interval 1.5s · crit 5%
- Basic: **Void Bolt** — [lane] 100% ATK dmg
- Passive: **Event Well** — every 3th attack: weaken 3s (lane)
- Overdrive: **Collapse** — [all] 160% ATK dmg; slow 4s; -30 charge
- **OD VFX**: A black sphere with a gold accretion ring appears mid-enemy board; light bends; enemies lean in; implodes with a gold-white ring flash.



## Enemy-only (sci-fi)
- Grunts: `scrap_drone` (rogue), `sec_drone` (corporate), `lab_drone` (experimental) — **model `drone`**: a small generic hover drone (S, ~0.7), faction tint; falls back to `needle`/`wisp`. `dock_thug` reuses `scrapper`.
- Elites: `<unit>_elite` for every unit above.

### Bosses (one per story map)
| id | name | model | role | faction | notes |
|---|---|---|---|---|---|
| `boss_big_rusty` | BIG RUSTY | `juggernaut` ×1.35 | tank | rogue | Dockmaster Krell's pride; Enrage Protocol at 50%; OD Ram Rush |
| `boss_redline` | REDLINE | `warlord` ×1.35 | tank | rogue | Jax Varro's rig; Call Reinforcements at 50%; OD Frenzy |
| `boss_corona` | CORONA | `widowmaker` ×1.35 | archer | corporate | Ione Vale, league champion; Enrage Protocol at 50%; OD Last Light |
| `boss_stormcrow` | STORMCROW | `meridian` ×1.35 | archer | corporate | Kestrel's orbital gunship; Enrage Protocol at 50%; OD Orbital Designator |
| `boss_the_choir` | THE CHOIR | `seraph` ×1.35 | archer | experimental | voice of the Lattice; Call Reinforcements at 50%; OD Choir of Lances |
| `boss_elderbark` | ELDERBARK | `treant` ×1.5 | tank | wild | Warden of the Verdance; Enrage Protocol at 50%; OD Grasp of Ages |
| `boss_aurelian` | AURELIAN | `paragon` ×1.35 | mage | corporate | Novaline's answer to everything; Call Reinforcements at 50%; OD Satellite Lance |
| `raid_dreadnought` | DREADNOUGHT | `citadel` ×1.9 | tank | corporate | weekly raid: a Halvorsen siege platform gone rogue; Call Reinforcements at 50%; OD Cataclysm |
| `boss_vector_prime` | VECTOR PRIME | `singularity` ×1.6 | mage | experimental | Cassius Vane, uploaded; Enrage Protocol at 50%; OD Cataclysm |


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

#### RIFT KNIGHT — *Sworn of the Hollow Crown* · `rift_knight` · tank · order · rare
- **Stats L1**: HP 1480 · ATK 96 · DEF 74 · interval 1.5s · crit 6% · charge ×1.25
- Basic: **Longsword Cut** — [lane] 100% ATK dmg
- Passive: **Oathbound** — wave start: fortify 4s (self); taunt 3s (self)
- Overdrive: **Shieldwall Charge** — [frontline] 140% ATK dmg; stun 1s; fortify 4s (self)

#### MINOTAUR — *Labyrinth Brute* · `minotaur` · tank · horde · epic
- **Stats L1**: HP 1600 · ATK 105 · DEF 60 · interval 1.6s · crit 8% · charge ×1.25
- Basic: **Scythe Sweep** — [lane, splash 40%] 100% ATK dmg
- Passive: **Bloodrage** — once below 50% HP: overclock 10s (self)
- Overdrive: **Gore Charge** — [column] 190% ATK dmg; stun 1.5s

#### TREANT — *Old Growth* · `treant` · tank · wild · epic
- **Stats L1**: HP 1900 · ATK 84 · DEF 82 · interval 2s · crit 5% · charge ×1.35
- Basic: **Root Slam** — [lane, splash 30%] 90% ATK dmg; 30% slow 2s
- Passive: **Deep Roots** — every 6s: heal 4% max HP (self)
- Overdrive: **Grasp of Ages** — [frontline] 120% ATK dmg; stun 2s; heal 15% max HP (self)

#### ELF RANGER — *Verdance Watch* · `elf_ranger` · archer · wild · rare
- **Stats L1**: HP 780 · ATK 140 · DEF 26 · interval 1.2s · crit 14%
- Basic: **Longbow** — [lane] 105% ATK dmg
- Passive: **Keen Eye** — every 3th attack: crit +1 0.5s (self)
- Overdrive: **Arrow Rain** — [all] 110% ATK dmg

#### DIRE WOLF — *Ember Pack* · `dire_wolf` · archer · horde · common
- **Stats L1**: HP 860 · ATK 109 · DEF 30 · interval 1s · crit 12%
- Basic: **Pounce** — [backline] 75% ATK dmg
- Passive: **Pack Hunter** — aura: crit +5% to all allies
- Overdrive: **Ember Howl** — [adjacent] 160% ATK dmg; burn ×2 4s

#### FROST WOLF — *Rime Pack* · `frost_wolf` · archer · order · rare
- **Stats L1**: HP 880 · ATK 112 · DEF 32 · interval 1s · crit 12%
- Basic: **Pounce** — [backline] 75% ATK dmg
- Passive: **Pack Hunter** — aura: crit +5% to all allies
- Overdrive: **Frost Lunge** — [backline] 220% ATK dmg; slow 4s

#### ELF SAGE — *Keeper of the Lumen Staff* · `elf_sage` · mage · wild · epic
- **Stats L1**: HP 780 · ATK 127 · DEF 28 · interval 1.5s · crit 5%
- Basic: **Lumen Bolt** — [lane] 85% ATK dmg
- Passive: **Verdant Bloom** — every 7s: regen 3s (all allies)
- Overdrive: **Sanctuary Grove** — [all allies] heal 120% ATK; regen 6s; cleanse 2

#### HORDE SHAMAN — *Bone-Drum Caller* · `horde_shaman` · mage · horde · rare
- **Stats L1**: HP 820 · ATK 121 · DEF 30 · interval 1.6s · crit 5%
- Basic: **Hex Bolt** — [lane] 90% ATK dmg; 25% weaken 3s
- Passive: **War Drums** — aura: atk +6% to all allies
- Overdrive: **Blood Totem** — [all allies] overclock 5s; haste 3s


