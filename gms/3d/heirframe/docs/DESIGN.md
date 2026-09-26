# HEIRFRAME — Game Design (planner-owned)

Status: v1, 2026-09-26. The numbers here are the design targets. `js/data/*` (systems) turns them into data files, and `tools/sim/*` checks the balance. When the sim and this doc disagree, the sim wins; write the change in `docs/notes/systems.md`, and the planner copies it back here.

Related docs: STORY.md (plot, cast, codex), MISSIONS.md (contract generator), ECONOMY.md (curves and prices), VO_LINES.md, BUILD_PLAN.md.

---

## 1. One-line pitch

**A Diablo-style loot action RPG in a gleaming robot utopia. You remotely pilot rented, then owned, robot frames through an endless stream of randomised contracts, and every job pulls you further into the truth about your erased family, and in the end about the city itself.**

## 2. Premise (the fiction the game runs on)

- **Halcyon** is a gleaming megacity of gold, glass and waterfalls under a warm sun and a huge pale moon. Humans almost never walk its streets in person. They **Link** into robot **frames** through a neural rig, and the shining gold, chrome and gloss-black figures filling the plazas in the refs are mostly people riding frames from somewhere else. The rest are autonomous civic bots.
- The ruling council is **the Concord**, seven "Voices" led by **Archon Severin Dray**. The civic AI **Harmony** is the serene face on every billboard. The frame and Link monopoly is **Nexus** (its logo is on the ref boulevard). Propaganda runs everywhere: *A BRIGHTER FUTURE TOGETHER*. *HARMONY THROUGH UNITY*. *THE JOURNEY CONTINUES*. *RENEWAL DAY — 225 YEARS OF UNITY*.
- **The rot underneath:** the riders live in **the Stacks**, a buried warren of coffin-sized pod hostels under the city. They Link into cheap rented frames and do the gig work that keeps the surface beautiful.
- **You are Wren**, 22, a former *Ward of Harmony* (state orphan) who just aged out of care with a debt and no surname. You lie in **Pod 4471** of the *Lullaby Rest* hostel and ride a scuffed **HireFrame R-1** rental into the sunlit plaza to take contracts from **Mara Quill**, a fixer.
- **Why you Link, and why that is a mystery:** on your first job you deliver a parcel that turns out to be addressed to you. It is a star-shaped **heir-key**, genome-locked to your DNA, with a recording: *"Happy birthday, little star. Don't let them see this."* Who sent it, why your DNA opens it, and why the Concord sends hunters once it is opened is the main story (STORY.md).
- Wren is a **silent protagonist**. Wren speaks through dialogue choices only, with no voice acting and a gender-neutral name. The rental assistant **HIRA** talks enough for two.

## 3. Core loop

```
 ┌─ Contract Board (6 cards, refresh each shift) ─┐
 │  pick card → travel (walk / Transit Relay)     │
 ▼                                                │
 MISSION: fight · sneak · deliver · hack · escort │
 ▼                                                │
 Rewards: credits + XP + Frame Sync + LOOT beams ─┤
 ▼                                                │
 Warehouse (open anywhere): equip, tune, salvage, │
 buy frames, swap frame ──────────────────────────┘
 Every few levels a gold STORY card appears on the board.
```

- **Session shape (mobile):** one contract takes 3–8 minutes. A good session is 3–5 contracts plus one story mission.
- **Moment to moment:** Diablo-style 3/4 camera, run, auto-targeted attacks, 3 skills plus dodge, hit-flash, damage numbers, loot beams. RuneScape-style tap-to-move and tap-to-interact for NPCs, terminals and doors.
- **Loot goes straight to the Warehouse by "uplink".** There is no field inventory to manage. When a drop beats what you have equipped, the loot toast shows **▲ UPGRADE — EQUIP**, and one tap equips it without opening any screen. This is the "make upgrading easy" rule.

## 4. Controls (restating D5, with specifics)

| Input | Mobile (landscape) | Desktop |
|---|---|---|
| Move | floating left-thumb joystick; **tap ground = walk there** | WASD, or left-click ground |
| Sneak | joystick deflection < 45% = sneak walk (−30% noise) | hold Shift |
| Attack | big right button (hold = auto-repeat) | left-click enemy / J |
| Skills 1–3 | three buttons arced around Attack | 1 / 2 / 3 (or K / L / ;) |
| Dodge | small button under skills | Space |
| Interact | tap NPC / terminal / item, or context button | E, or click |
| Warehouse | HUD button (top right) | Tab / I |
| Contracts | HUD button | C |
| Codex / family tree | HUD button | O |

- **Auto-target:** Attack picks the nearest hostile inside a 70° facing cone within weapon range. If there is none, it picks the nearest hostile within 1.5× range and turns to face it. Tapping an enemy locks it as the target until it dies or you tap the ground.
- **Dodge:** 5 m dash with invulnerability frames from 0.05 to 0.35 s. The cooldown depends on the frame (table below).

## 5. Frames

The player **owns up to 3 frames**, one of each archetype, plus the rental, which can be returned once you own a frame. **Swapping frames:** open the Warehouse anywhere while out of combat (no hostile aggroed within 20 m). A Nexus courier drone delivers the new frame in a 2.5 s drop animation. You cannot swap during a mission's *no-swap* modifier or during boss fights.

### 5.1 Base stats (rider level 1, sync 1, no parts)

| | **HireFrame R-1 (Rental)** | **Brawler — "Bulwark" G-7** | **Gunner — "Longarm" V-3** | **Ghost — "Wisp" S-9** |
|---|---|---|---|---|
| Look | scuffed grey/orange, rental decals, cracked visor, one mismatched arm | massive gloss-black and gold, piston forearms, shoulder plates | chrome, long limbs, shoulder-mounted sensor mast, carbines | slim matte black, cyan seams (the black robot in the refs), no face, a blade in the forearm |
| HP (hp) | 120 | 260 | 180 | 150 |
| Shield (regen 8%/s after 4 s without damage) | 0 | 60 | 100 | 50 |
| Energy (regen / s) | 60 (6) | 80 (5 + Rage) | 100 (10) | 120 (12) |
| Armor | 5 | 30 | 15 | 10 |
| Move speed m/s | 4.2 | 3.8 | 4.0 | 4.8 |
| Crit chance / crit dmg | 5% / 150% | 5% / 150% | 8% / 160% | 12% / 200% |
| Detection radius mult | 1.0 | 1.25 (loud) | 1.0 | 0.6 |
| Dodge cooldown | 4.0 s | 3.5 s | 2.5 s | 2.0 s |
| Part slots | **weapon, chip** only | all 6 | all 6 | all 6 |
| Price | rented, **100 cr per shift** | see ECONOMY §4: the 1st frame you buy is 1,500 cr, the 2nd 12,000, the 3rd 50,000 (frame licence), whichever archetype | | |

Damage numbers below are at rider level 1. Everything scales by the level factor `L(lvl) = 1.09^(lvl-1)` (ECONOMY §1). Skill damage is `skillBase × L(riderLvl) × (1 + weaponPower%)`.

### 5.2 HireFrame R-1 (Rental). Starter frame; it teaches the basics and feels cheap on purpose.
- **Attack: Shock Baton.** Melee, 2.2 m reach, 0.75 s swing, 9 damage (Shock).
- **Skill 1: Zap Pistol.** 16 m hitscan, 14 damage, 3 s cooldown, 10 energy.
- **Skill 2: Overclock.** +35% move and attack speed for 4 s. Costs 5% of max HP. 14 s cooldown.
- **Skill 3: Sponsored Content.** HIRA blasts an advert hologram. Enemies within 6 m are *Distracted* (stand still, looking at it) for 2.5 s. Bosses are immune. 20 s cooldown, 25 energy. It is a joke that is also useful for stealth.
- **Passive: Limited Warranty.** Repairs are free, but 10% of mission credits go to HireFrame as a "usage surcharge". A red HUD line shows the running total, which is the pressure to buy your own frame.

### 5.3 Brawler "Bulwark". Melee tank. You feel heavy: it wades in, soaks damage and makes things fly.
- **Attack: Piston Fists.** 3-hit combo, 2.4 m reach: 14 / 14 / 30 damage (Kinetic). The third hit knocks back 2 m. Combo resets after 1.2 s idle.
- **Skill 1: Ground Slam.** 4 m radius AoE, 45 damage plus 1.2 s stagger. 8 s cooldown, 30 energy.
- **Skill 2: Rocket Charge.** Dash 8 m through enemies, 25 damage and knockback to each. Ends with a 0.3 s stun at the end point. 10 s cooldown, 25 energy.
- **Skill 3: Bulwark.** A frontal energy wall for 5 s: −60% damage from the front, and it taunts enemies within 10 m. 16 s cooldown, 35 energy.
- **Passive: Momentum.** Each hit landed within 3 s of the last gives +4% damage, stacking to 5 (+20%). 15% of damage taken converts to energy ("Rage").

### 5.4 Gunner "Longarm". Ranged DPS. You kite, keep distance, reposition, and deal big damage from range.
- **Attack: Twin Carbines.** Auto-fire, 4 shots/s, 6 damage each (Kinetic), 16 m range, slight spread.
- **Skill 1: Scatter Volley.** 60° cone, 8 pellets × 9 damage, 3 m knockback. 6 s cooldown, 20 energy.
- **Skill 2: Rail Shot.** 0.8 s charge (you can move at 50% speed), then a piercing line out to 30 m for 90 damage (Ion: ×1.5 against shields). 12 s cooldown, 35 energy.
- **Skill 3: Drone Turret.** Deploys a turret for 10 s that fires 3 shots/s at 5 damage and draws aggro from grunts. 18 s cooldown, 40 energy.
- **Passive: Steady Hands.** Standing still for 1 s gives +25% crit chance until you move. While moving you get +15% evasion.

### 5.5 Ghost "Wisp". Stealth, hacking and precision. You feel invisible and lethal, but fragile. It rewards planning and backstabs.
- **Attack: Mono-blade.** Fast 2-hit combo, 2.0 m reach, 11 / 11 damage (Kinetic). **Backstab:** hitting an enemy from behind (±60°) or one that is not alerted deals ×3.
- **Skill 1: Veil.** Cloak for 6 s or until you attack. Moving while cloaked costs no noise. The first attack out of Veil is a guaranteed crit. 14 s cooldown, 30 energy.
- **Skill 2: Blink.** Teleport 7 m in the move direction, leaving a decoy hologram that draws fire for 2 s. 7 s cooldown, 20 energy.
- **Skill 3: Hack Pulse.** 6 m radius: disables drones, turrets and cameras for 5 s, and **converts** one robot enemy of tier ≤ yours to fight for you for 8 s. 20 s cooldown, 45 energy.
- **Passive: Silent Running.** Detection radius ×0.6 (already in the table) and terminals hack 2× faster.

### 5.6 Frame Sync (per-frame level, 1–20)
- Each frame earns **Sync XP** equal to the rider XP earned while it is deployed. It needs `syncNext(s) = 400 × 1.25^(s-1)`. Sync 20 lands at roughly rider level 30 if you mostly play that one frame.
- Each sync rank gives **+2% to all that frame's base stats**.
- At **sync 5, 10, 15 and 20** you choose one of two **skill mods** for one skill. The choice can be changed free at the Warehouse. Example mods:
  - Brawler Ground Slam: *Aftershock* (a second slam 1 s later for 50%), or *Magnetic* (pulls enemies in 3 m first).
  - Gunner Rail Shot: *Overpenetrate* (+1 bounce), or *Quickcharge* (0.4 s charge, −25% damage).
  - Ghost Blink: *Double Blink* (2 charges), or *Knife Decoy* (the decoy explodes for 40 damage).
  - Rental (max sync 5): only one mod, *Premium Tier*: Sponsored Content lasts 4 s.
- Systems puts 8 mods per frame (4 ranks × 2) in `js/data/frames.js`.

### 5.7 Frame Mk tiers (visual and base-stat upgrades bought with credits)
- Every owned frame upgrades **Mk I → Mk VI** at the Warehouse Frames tab. Each tier multiplies the frame's base stats and **changes its look**: `createRobot({tier})` adds plating, trim, glow and, at Mk V+, gold filigree. It is the visible "my robot got better" moment.
- Multipliers: ×1, 1.18, 1.40, 1.66, 1.97, 2.35. Costs: 0, 9,000, 45,000, 180,000, 650,000, 2,200,000 cr. **Gates:** rider level 1/10/20/32/45/60 **and** Frame Sync 1/4/8/12/16/20. These numbers already exist in systems' `js/data/frames.js`, and the planner adopts them.
- The rental has no tiers (Mk 0, "Rental").

### 5.8 Heir Core (story, Act 5)
A unique **core-slot** item. It adds a **4th button: Heir Protocol**, an ultimate on a 60 s cooldown, different for each frame:
- Brawler: *Titanfall*, a 6 m leap with a 150-damage AoE.
- Gunner: *Starfall*, 12 orbital lances.
- Ghost: *Eclipse*, 4 s of time-slow while you move at full speed.

It levels with the Legacy system. See §11.

## 6. Parts (upgrade slots) and loot

### 6.1 Slots

| Slot | Primary stat (always present) | Typical affixes |
|---|---|---|
| **Chassis** | +Armor, +HP | resistances, thorns, HP regen |
| **Core** | +Energy, +Shield | energy regen, shield regen, skill damage |
| **Weapon** | Weapon Damage (sets attack and skill scaling) and an **element** | attack speed, crit, element damage, on-hit effects |
| **Optics** | +Crit chance | crit damage, range, detection reduction, weak-point bonus |
| **Mobility** | +Move speed | dodge cooldown, dodge distance, sneak speed |
| **Chip** | none (the affixes are the point) | skill modifiers, cooldown reduction, and on Relic/Heirloom tiers a **unique power** |

**Elements:** Kinetic (plain), Thermal (3 s burn for 30% extra over time), Shock (chains to 1 extra target for 50%; builds stun), Ion (×1.5 against shields, ×0.8 against HP). Enemies can carry element resistances.

### 6.2 Rarity tiers

| Tier | Colour | Affixes | Stat mult | Beam | Drops from |
|---|---|---|---|---|---|
| Scrap | grey #8a8f98 | 0 | 0.7 | none | lvl 1+ |
| Standard | white #e8ecf2 | 0 | 1.0 | faint | lvl 1+ |
| Tuned | green #4be08a | 1 | 1.1 | yes | lvl 1+ |
| Custom | blue #3fa9ff | 2 | 1.2 | yes | lvl 3+ |
| Prototype | purple #b46cff | 3 | 1.35 | yes, with chime | lvl 8+ |
| Relic | orange #ff9a2e | 3 + **unique power** | 1.5 | tall pillar and sound | lvl 15+ |
| Heirloom | gold #ffd36b with cyan core | 4 + **set bonus** | 1.6 | star-burst | story bosses; 0.15% from lvl 40+ |

Drop weights by level live in ECONOMY §6.

### 6.3 Affix pool (value ranges at iLvl 1; flat values scale by L(iLvl), % values do not)

| id | text | range | slots |
|---|---|---|---|
| hp | +N HP | 10–25 | chassis, core |
| armor | +N Armor | 4–10 | chassis, mobility |
| shield | +N Shield | 10–20 | core, chassis |
| energy | +N Energy | 8–16 | core, chip |
| enRegen | +N% energy regen | 8–20% | core, chip |
| dmgPct | +N% damage | 4–10% | weapon, chip, core |
| atkSpd | +N% attack speed | 4–10% | weapon, mobility |
| critCh | +N% crit chance | 2–5% | optics, weapon, chip |
| critDmg | +N% crit damage | 10–30% | optics, weapon |
| cdr | −N% skill cooldowns | 4–10% | chip, core |
| moveSpd | +N% move speed | 3–8% | mobility |
| dodgeCd | −N% dodge cooldown | 8–15% | mobility, chip |
| elemDmg | +N% [element] damage | 8–18% | weapon, chip |
| vsElite | +N% damage to elites and bosses | 6–15% | optics, weapon |
| backstab | +N% backstab damage | 15–40% | optics, chip (Ghost-leaning) |
| aoe | +N% area radius | 8–20% | chip, core |
| thorns | reflect N% melee damage | 8–20% | chassis |
| lifeSteal | N% of damage repairs HP | 1–3% | weapon, chip |
| stealth | −N% detection radius | 8–18% | optics, mobility |
| hackSpd | +N% hack speed | 20–50% | optics, chip |
| credits | +N% credits found | 5–12% | chip, optics |
| lootLuck | +N% better rarity chance | 4–10% | chip, optics |
| resist | +N% resist [element] | 8–20% | chassis |
| shieldRegen | +N% shield regen | 10–25% | core |

Rules: no duplicate affix ids on one item, and each item draws only from its slot's list.

### 6.4 Relic unique powers (first 12; systems can add more)
1. **Magnetar** (chip): Ground Slam pulls in all enemies within 8 m.
2. **Ricochet Protocol** (weapon): carbine shots bounce once.
3. **Afterimage** (mobility): every dodge leaves a decoy.
4. **Stillwater** (optics): Veil lasts twice as long when you stand still.
5. **Overdrive Core** (core): at full energy, deal +30% damage.
6. **Scavenger's Eye** (optics): +1 loot roll from elites.
7. **Kinetic Battery** (chassis): taking damage charges your next attack by up to +100%.
8. **Brighter Future** (chip): kills restore 3% HP. A Nexus prototype with *HARMONY THROUGH UNITY* etched on it.
9. **Chainlightning Coil** (weapon): Shock chains to 3 targets.
10. **Reactive Plating** (chassis): shield breaking releases a 4 m knockback pulse (10 s cooldown).
11. **Phantom Step** (mobility): dodge through enemies to backstab-mark them.
12. **Coldstart** (core): the first skill used after 5 s idle costs 0 energy.

### 6.5 Heirloom sets (story-flavoured, 3 sets of 3 pieces)
- **Aurel's Oath** (Brawler): 2 pieces = +20% armor; 3 pieces = Bulwark reflects projectiles.
- **Lyra's Wake** (Ghost): 2 pieces = Blink resets on a backstab kill; 3 pieces = Veil has no cooldown while Heat is 0.
- **Iris's Lens** (Gunner): 2 pieces = Rail Shot marks the target (+25% damage taken); 3 pieces = Drone Turret copies your skills at 30%.

### 6.6 Tuning, salvage and reroll (all at the Warehouse, all one tap)
- **Salvage** turns an item into materials: Scrap Alloy (all tiers), Circuitry (Custom and up), Flux Cells (Prototype and up), Heir Shards (Relic and Heirloom). There is a **Salvage all ≤ [tier]** button.
- **Tune +1…+10:** each level gives +6% to the item's primary stat. The cost and success chance are in ECONOMY §5. It never breaks the item. A failure costs only the materials.
- **Recalibrate:** reroll one affix. Once you pick an affix, it is the only one that item can ever reroll (Diablo's enchant rule).
- **Frame Rating (FR):** one item-power number per item and per frame. It is the sum of weighted stats and drives the "▲ Upgrade" arrows.

## 7. Rider level (player)
- **Levels 1–50** carry the story. **Hard cap 60.** After 60, XP feeds **Legacy** levels, which are unlimited (§11).
- Rider level raises base stats through `L(lvl)`, unlocks contract tiers, gates story missions, and caps item level at rider level + 2.
- Level-ups heal fully and show a big UI moment. **Every 5 levels** adds one contract slot to the board (from 6 to 8 at level 10) or unlocks a feature (see ECONOMY §2).

## 8. Districts

Every district is a **self-contained scene** about 180 × 180 m that loads on travel (world agent). **Transit Relays** (Nexus kiosks) move you between unlocked districts, with a 1 s tube-transit transition. Danger level runs from 1 to 10 (§10).

| # | District | Look | Rider level | Act | Unlock |
|---|---|---|---|---|---|
| 1 | **Aurum Plaza** | the gold ref: curved gold terraces, cascading waterfalls, giant statue, polished stone, crowds of gold/chrome/black frames, flying cars | 1–12 | 1 | start (**the P1 district**) |
| 2 | **Brightline Boulevard** | the blue ref: glass canyon, curved holo billboards (*A BRIGHTER FUTURE TOGETHER*), monorail overhead, wet reflective paving, café terraces | 3–15 | 1 | level 3 |
| 3 | **Verdant Terraces** | cliff parks, hanging gardens, waterfalls into pools, the memorial garden with blank name plaques | 7–20 | 2 | level 8 (story) |
| 4 | **Nexus Arcology** | interiors: lobby atriums, office floors, server halls, labs; floor-by-floor instanced | 10–24 | 2 | level 10 (story) |
| 5 | **Portside** | the spaceport and docks: landing pads, cargo cranes, container stacks, shuttle gantries, sunset water | 15–30 | 3 | level 18 (story) |
| 6 | **The Stacks** | the undercity: pod hostels stacked 20 high, cables, steam, neon ads in Harmony blue, rust, rain from leaking pipes | 18–34 | 4 | level 26 (story) |
| 7 | **The Spine** | the ship's inner machinery: turbine halls, coolant rivers, maintenance catwalks over a drop | 28–40 | 4–6 | level 32 (story) |
| 8 | **Hullside** | outside the ark: EVA on hull plates, stars, the planet filling the sky, magnetic boots (low-grav jumps) | 34–45 | 5 | level 34 (story) |
| 9 | **Meridian Wreck** | the blasted station of the Sundering: dark, zero-g debris, frozen memorials | 36–48 | 5 | level 36 (story) |
| 10 | **The Helm** | the ark bridge: a cathedral of dark glass and starlight, the Concord's hidden sanctum | 45–50 | 6 | level 45 (story) |
| 11 | **Verdance Landfall** | post-game: planet surface, alien green, the ark in the sky; the colony frontier | 50+ | endgame | finish Act 6 |

- **Key sites inside a district:** world exposes these as tagged sites for the mission generator (tag list in MISSIONS §3): plaza, boulevard, park, rooftop, interior, warehouse, dock, alley, landing pad, catwalk, hull.
- **Out-of-level play:** districts are open once unlocked. The generator levels contracts to you with a district floor and ceiling, so an early district still pays but tops out at its max level + 5.

## 9. Factions (not everyone is an enemy)

Reputation runs from −100 to +100 per faction. Tiers: Hated ≤ −60 · Hostile −59…−25 · Wary −24…−1 · Neutral 0…24 · Friendly 25…49 · Trusted 50…79 · Honored ≥ 80.

| Faction | Who | Default | Hostile when | Gives you |
|---|---|---|---|---|
| **Civilians** | humans in frames and civic bots (civ_gold, civ_chrome, civ_black, civ_worker) | never hostile | never. They are *Harmony-Aegis protected* and cannot be damaged (a story clue); they flee combat | ambient life, rumours (clue barks), photo targets |
| **Concord / Wardens** | civic security: drone_scout, security, enforcer | Neutral | Heat ≥ 2, or your contract targets them | Concord contracts (bounties on the Syndicate); cheap repairs when Friendly |
| **Nexus** | the frame corp; vendors, HireFrame, Transit Relays | Neutral | only on heists against Nexus | frame and part vendors; price −2% per rep tier above Neutral |
| **Silverhand Syndicate** | chrome-plated organised crime: docks, clubs, protection rackets | Wary | on their turf at Wary or worse; always during contracts against them | black-market parts, high-pay dirty contracts |
| **The Unlinked** | undercity resistance, hackers, pod-born riders | Neutral (Friendly after Act 3) | only if you take Concord contracts against them at Wary or worse | hacking chips, Ghost parts, story allies |
| **Freehaul Union** | dockers and shuttle crews; big friendly worker frames | Neutral | never at Neutral or better; only if you sabotage their jobs | transport contracts, Portside vendor, a later shuttle to Hullside |
| **Scrap / Rustkin** | feral maintenance bots and their hives | always hostile | always | loot pinatas, pest-control contracts |
| **The Choir** | Seraph's gold hunter-angels (Act 2 onward) | always hostile | always | late-game danger |

- **Rep changes:** a contract *for* a faction gives +3 to +8. A contract *against* one gives −4 to −10. Killing its members gives −0.5 each, capped at −5 per mission. Rival pairs gain half of what the other loses: Concord ↔ Syndicate and Concord ↔ Unlinked.
- **Vendors and quest-givers are always robots or people standing at kiosks.** They have names, and some of them ask you to do things.

## 10. Enemies

### 10.1 Stat bases (level 1; multiply by L(lvl) and the threat multipliers)

| Rank | HP × | Damage × | XP | Loot rolls |
|---|---|---|---|---|
| Grunt | 1 | 1 | 1 | 12% item |
| Veteran (blue name) | 2.5 | 1.3 | 3 | 35% item |
| Elite (gold name, 2 elite mods) | 6 | 1.6 | 8 | 1 guaranteed, 1 at 50% |
| Champion (story mini-boss) | 20 | 2 | 25 | 2 guaranteed, Custom+ |
| Boss | 60 | 2.5 | 80 | 4 guaranteed, 1 Prototype+ |

### 10.2 Roster
The kind column gives the `createRobot` kind. "(new)" means the robots agent should add that kind later. Tints are faction paint over the same mesh via `seed` or a paint param.

| Tier | Name | kind | Faction | Behaviour | Base HP / dmg |
|---|---|---|---|---|---|
| T1 (1–10) | **Scrap Rat** | scrap_rat (new, small, quadruped) | Scrap | swarms of 4–8; bites; flees at low HP | 18 / 4 |
| T1 | **Knuckle** (street thug frame) | brawler, Syndicate tint | Syndicate | melee rush | 50 / 7 |
| T1 | **Popper** (thug gunner) | gunner, Syndicate tint | Syndicate | pistol at 10 m, strafes | 40 / 6 |
| T1 | **Warden Eye** | drone_scout | Concord | hovers; spots you (+Heat); calls security | 30 / 3 |
| T2 (8–20) | **Warden** | security | Concord | baton plus riot shield; blocks frontal hits (−70%) | 90 / 10 |
| T2 | **Enforcer** | enforcer | Concord | heavy; stomp AoE; slow | 220 / 18 |
| T2 | **Chromehead** | brawler, chrome tint | Syndicate | elite-flavoured melee with a dash | 110 / 12 |
| T2 | **Sentry Turret** | turret (new, static) | any | 4-shot bursts; hackable | 80 / 8 |
| T3 (18–32) | **Rustkin** | rustkin (new; asymmetric, patched from junk) | Scrap | shamble; merge 3 into a Rust Hulk | 120 / 14 |
| T3 | **Unlinked Saboteur** | ghost, rebel tint | Unlinked (contract-dependent) | cloak, ambush, EMP mine | 90 / 16 |
| T3 | **Concord Lancer** | security tier 2 (gold trim) | Concord | spear lunges; appears at Heat 3+ | 160 / 20 |
| T4 (30–45) | **Hull Wight** | spider (new, 6-legged maintenance crawler) | Scrap (ship swarm) | skitters on walls; welding beam | 140 / 18 |
| T4 | **Spine Keeper** | spider tier 2 (large) | Scrap | slow; laser sweep; spawns wights | 600 / 30 |
| T4 | **Choir Angel** | seraph tier 0 (new; gold, halo ring, blade wings) | Choir | fast flying dives, in formations of 3 | 200 / 26 |
| T5 (40+) | **Gilded Guard** | civ_gold tier 2, armed | Concord Voices | elegant duelists; parry | 300 / 30 |
| T5 | **Sovereign Construct** | enforcer tier 3 (gold) | Concord Voices | shield-drone escorts | 900 / 40 |

**Bosses (Champion or Boss rank):** Act 1 *Big Kettle* (Syndicate captain, enforcer with a boiler-tank back) · Act 2 *Warden-Captain Halloran* (security tier 3, shield and shock lance) · Act 3 *Choir Warden* (seraph tier 1) · Act 4 *Rustmother* (huge rustkin hive, spawns rats) · Act 5 *Seraph* (seraph tier 3, gold; she is your mother) · Act 6 *Archon Dray, Sovereign Frame* (boss_sovereign: a three-phase fight, a gold colossus with seven halo-voice drones).

### 10.3 Elite mods (enemies at Elite rank roll 2; Champions roll 1)
Shielded (+100% shield) · Overcharged (+25% damage, sparks) · Blinker (teleports behind you) · Volatile (explodes 2 s after death) · Linked (packmates share damage) · Mirror (reflects 20% ranged damage) · Cloaked (invisible until 6 m away) · Jammer (your skills cost +50% energy nearby) · Swarmcaller (summons 3 Scrap Rats every 10 s).

### 10.4 AI states
`idle/patrol → suspicious (detection meter 1–99) → alert (hunt, call group within 15 m) → combat → flee (Scrap at < 20% HP) → search (8 s at last-seen position) → return`.
- **Detection:** a 100° vision cone, 12 m by day and 8 m by night, times your frame's detection multiplier. The meter fills at `(1 − d/range) × 120%/s`, or ×0.5 while sneaking. Reaching 100% raises an alarm, which can call Wardens (+1 Heat) if the district has cameras.

## 11. Endless structure

### 11.1 Contract board
- **6 cards** at the start, 7 at level 10, 8 at level 20. The board **refreshes every shift**: 24 minutes of **active** play. Offline time never ticks, so mobile play is never punished for putting the phone down. A manual reroll costs `25 × L(lvl)` cr.
- Card grades, which are payout and loot tiers: **Street** (always), **Pro** (level 5+), **Elite** (level 15+, champion target), **Black** (only while Heat ≥ 3, ×2 pay; the Syndicate and Unlinked post them).
- A gold **STORY** card pins to the top whenever the next story mission's level gate is met.
- A **Threat** selector (Diablo difficulty) sits on the board:

| Threat | Unlock | Enemy level | Enemy HP × / dmg × | Credits × | XP × | Loot-quality bonus |
|---|---|---|---|---|---|---|
| Calm | start | player −1 | 0.8 / 0.8 | 0.8 | 0.8 | 0 |
| Tense | start | player | 1 / 1 | 1 | 1 | 0 |
| Hostile | level 10 | +2 | 1.6 / 1.3 | 1.5 | 1.5 | +10% |
| Lethal | level 25 | +4 | 2.6 / 1.7 | 2.3 | 2.2 | +25% |
| Nightmare | level 40 | +6 | 4.5 / 2.2 | 3.5 | 3.2 | +45% |
| Overclock I–XXX | level 60 | +6 + n/3 | (4.5 × 1.12ⁿ) / (2.2 × 1.08ⁿ) | 3.5 × 1.10ⁿ | 3.2 × 1.08ⁿ | +45% + 2%·n |

### 11.2 Heat (notoriety, 0–5 stars)
- **Gained:** alarm raised +1 · Warden killed +1 (at most +1 per 10 s) · Black contract accepted +1 · property collateral ≥ 500 cr in one mission +1.
- **Decay:** −1 star per 3 minutes with no new incident. A *Ghost Protocol* chip or the Unlinked "Clean Slate" vendor (500 × L cr) removes all Heat.
- **Effects:** 1 = Warden Eyes watch you (nothing happens yet). 2 = Wardens are hostile on sight. 3 = patrols hunt you and Black contracts unlock. 4 = Lancers and Enforcer squads, Transit Relays locked. 5 = a Choir Angel squad spawns every 90 s (Act 2+) and rewards are ×1.5.

### 11.3 District danger (1–10)
- Each district tracks **danger**. Completing a contract that hurts a faction's operations there raises it by 0.3. It decays 0.5 per shift toward the district's floor (its unlock tier).
- Effects: enemy level +floor(danger / 2), +3% loot quality per point, more elites (elite chance = 4% + 1.5% × danger), and the district's HUD tint shifts warmer and redder. At danger ≥ 8 a **Crackdown** event starts: the district's controlling faction runs patrol sweeps and pays a bounty board of 3 champion targets.

### 11.4 After the finale
- **Verdance Landfall** unlocks: a planet-surface district that keeps generating contracts at every Overclock level.
- **Voice Hunts:** five of the seven Voices escape the Helm (STORY Act 6). Each week of play (every 7 shifts) one Voice hides in a random district as a roaming boss with a unique Relic.
- **Legacy levels** (after level 60): every level-worth of XP (fixed at the level-60 requirement) is one **Legacy point** for the Legacy board: +1% damage, +1% credits, +0.5% crit, +1% HP, +1% loot luck, and so on, uncapped with diminishing returns (ECONOMY §8). The Heir Core gains +1 rank per 10 Legacy.
- **Succession (prestige, the family-saga loop):** at Legacy 20+ you can "Pass the Frame". A new heir (your child, named by you) inherits the family. Rider level resets to 1 and frame syncs reset. You keep your frames, parts stash, codex, Legacy board and Heir Core, and pick **one Heirloom** to hand down. Each Generation gives a permanent +15% XP and +10% loot quality (cap Gen 10), and **adds a node to the family tree**. The story acts become *Echo* versions: the same content, with Mara's and Lyra's lines as recorded advice to the new heir (VO later phase).

## 12. Rewards (kills and missions scale with level and difficulty)
- **Kill rewards:** XP, credits (40% chance per grunt of `3 × L(lvl)` cr ±30%) and loot rolls per rank (§10.1), with rarity by level band (ECONOMY §6).
- **Mission rewards:** the payout formula in MISSIONS §7, a **mission cache** at the end (1 guaranteed item: Street Tuned+, Pro Custom+, Elite Prototype 25%, Black Prototype 40% or Relic 5%), rep and Sync XP.
- **Bonuses:** Stealth bonus (+25% if no alarm), Flawless (+15% if no HP lost), Speed (+10% under par time), Clean (+10% with zero collateral). They stack additively and are shown on the results card with animated counters.

## 13. Warehouse (openable anywhere) and Home

**Warehouse** (`ui.panel.open('warehouse')`). In the fiction it is a remote link to your Nexus storage unit. The tabs are:
1. **Frames:** a 3D turntable of the current frame; swap between owned frames; buy a frame (garage licence); paint (preset palettes gold, chrome, gloss black, rental orange, plus unlockable faction colours).
2. **Loadout:** 6 slots around the frame model. Tap a slot to see candidates sorted by FR with ▲ / ▼ arrows. There is a **Best FR** auto-equip button.
3. **Stash:** a grid with filters and sort. It starts at 60 slots and expands to 240. When it is full, new loot auto-salvages Scrap and Standard, and HIRA says so.
4. **Fabricator:** tune, recalibrate, salvage and "salvage all ≤ tier".
5. **Market:** a rotating stock of 6 parts at your level (refreshes each shift), plus consumables: Repair Kit (heal 40%, carry 3), Signal Jammer (−1 Heat), Decoy Drone.
6. **Skills:** view skills and choose sync mods.

**Home.** In P4 **Pod 4471** becomes a walkable scene: a coffin-pod room in the Stacks, the rig, a cracked window onto the pipe canyon, and your family tree pinned to the wall with string. After Act 4 you can buy the **Brightline Apartment** (25,000 cr), and after the finale the **Vael Estate** on the Terraces unlocks. Home has a frame display rack, the codex wall, a trophy shelf for boss drops, and a bed that forces a shift refresh (once per real hour).

## 14. Codex and family tree
- The **Codex** (`ui.panel.open('codex')`) has four tabs: **Family Tree**, **People**, **Places**, **Clues**.
- The **Family Tree** is a node graph. Unknown people are silhouettes marked "?". A node fills in when its reveal happens, and dotted lines turn solid. Clues (STORY §6) attach to nodes. Collecting all the clues for a node gives a small reward (a Relic or a cosmetic) and a line from HIRA.
- **Clue sources:** story missions (guaranteed), rare "Echo" drops from contracts (a 3% chance in story-relevant districts, each unique once), talking to specific civilians (rumour barks), and scanning objects (the Ghost's optics can scan memorial plaques and paint beneath paint).

## 15. Death, repair and failure
- **Frame wrecked** (HP reaches 0): the mission fails unless it has checkpoints (Heists and Defends do). You re-Link at the nearest Transit Relay. The wrecked frame costs a **recovery fee** of `150 × L(lvl)` cr (the rental pays nothing, because of its warranty) and returns at 50% HP.
- **Repairs** (owned frames): HP does not regenerate outside a mission beyond 50%. A full repair at the Warehouse or any Nexus kiosk costs `missingHPfrac × 60 × L(lvl)` cr. Repair Kits heal in the field.
- **Mission failure** keeps the kill loot and XP, pays nothing, and costs −3 rep with the client faction.

## 16. Tone and presentation rules
- The surface is **beautiful and warm** (the refs). The rot shows as *details*: a billboard stuttering to show a blank plaque, a civic bot scrubbing a name off a wall, riders' frames slumping when their pods lose power, a Warden escorting a "rehoming" citizen. It stays subtle until Act 4, then the Stacks show the rot openly.
- **Propaganda PA** from Harmony every ~90 s in the surface districts. These are barks (VO_LINES §4); some of them are clues.
- **Humour:** HIRA's upsells, absurd client names, contracts where "the client lied".
- **No blocking modals, ever.** Dialogue is a bottom-third panel with choices. Pause is a slide-in panel.

## 17. Save
- One save slot per heir generation, autosaved to localStorage after every contract, level-up, purchase and story beat. There is an export/import code under Settings.
- The save shape is owned by systems (`js/sim/save.js`), versioned from `v: 1`.
