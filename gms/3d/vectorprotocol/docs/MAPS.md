# VECTOR PROTOCOL — Story maps

Owner: design. **Generated** from `js/data/maps.js` (`node js/data/_gen_maps.mjs`; prose lives in `js/data/_maps_tpl.md`).
To retune: edit `MAP_SPEC` (`lv`, `size`, `waves`, `rankBonus`, `pool`, `elites`) and regenerate. The levels are built deterministically, with no runtime RNG.

## How a map works
- **Map screen**: a road running left→right with numbered nodes (`level.x`, `level.y` in 0..1 give node positions; hub agent styles the road per backdrop). Boss nodes are bigger and use the boss's portrait. Elite nodes get a red-gold ring.
- **8 maps / 120 levels**: 12 + 14 + 14 + 15 + 16 + 16 + 18 + 15. Strictly linear (sim `isUnlocked`).
- **Waves**: early levels have 1 wave and later ones up to 3 (`ROUND n/3`). Each wave's units are placed tanks-front, others-back, mid lane first. Boss levels always have 3 waves, and the boss stands at **F-mid**.
- **Enemy level** ramps per map (`lv`). Enemy rank = the minimum its level needs + `rankBonus` (currently 0 everywhere except map 8 where level 51+ already forces rank 5; runs 3–4 showed +1 made maps 5–7 cliffs). Ability levels = 1 + ⌊level/12⌋.
- **Stars = 3 goals per level** (sim-2): ★ win, plus two replay challenges (no unit lost · win in ≤ N s · win with ≤ K units · win without a role · 3+ units of a faction · finish with ≥ X% integrity). Each goal is earned once, independently, on any winning run. First completions pay goal 2: chips 4 (elite 8, boss 15) + 50% of the level's credits; goal 3: chips 6 (10, 20) + the level's scrap. Bosses: no losses + time; elites: no losses + integrity. Time limits are measured by `node js/data/_gen_star_times.mjs` (a mirror squad at 1.3× the level's power, median win time × 0.95).
- **Star chests**: 3 per map at 50% / 75% / 100% of its stars; granted automatically by the winning run that reaches them.
- **Rewards**: credits `(80+30·L)`, scrap `(15+6·L)`, unit xp `(30+10·L)` each; ×1.6 elite, ×2.5 boss (xp ×1.5). Shards every level: 2 (elite 4, boss 8). Maps 1–2 rotate through the units you probably own; later maps use units from that level's waves. Replays pay 60% (`replay.rewardMult`).
- **Recommended power** = strongest wave's power × 1.05 (sim `unitPower`). The harness shows a squad at roughly that power wins normal nodes; elites and bosses want +15–25%.

## Unlock milestones
Squad slots: slot 3 → `m1_l5` · slot 4 → `m2_l7` · slot 5 → `m3_l14` · slot 6 → `m5_l8` (you start with 2).
Features (first clear): `m1_l2`: workshop · `m1_l4`: recruit_street · `m1_l8`: rank_up · `m1_l12`: hq · `m2_l3`: ability_upgrades, buffs · `m2_l4`: arena · `m2_l10`: daily_ops · `m3_l1`: recruit_contract · `m3_l8`: faction_trials · `m4_l1`: weekly_raid · `m4_l8`: recruit_arena · `m6_l16`: recruit_rift.
Story units (first clear): m1_l3 patch · m1_l12 bulwark · m2_l14 jammer · m3_l14 lancer · m4_l15 prism · m5_l8 oracle · m5_l16 phase · m7_l18 paladin.

## Difficulty intent (D10)
- **Maps 1–2**: a straight-through player clears them, with at most a replay or two before the bosses. Arena unlocks at m2_l4 so the habit forms early.
- **Map 3 on**: the curve outruns story-only income, so arena, daily ops and trials supply the XP, scrap and shards. Target: **25–40% of play time in arena/events from map 3**, whole story **15–25 h**. These numbers are measured by `tools/sim/balance.mjs`; current results are in docs/ECONOMY.md § Balance status.
- **Map 6 (fantasy)** introduces a new enemy mix: wolves pounce the back row, treants heal, and minotaurs hit columns. It's a composition check, not just a stat check.


## 1. Rustline Docks (`m1`, theme `docks`, realm scifi) — 12 levels
*Two robots, one leaking hangar, every job nobody else wants.*

**Backdrop (hub/map agent):** Night docks on stilts over black water: stacked shipping containers, gantry cranes with red beacons, sodium-orange floodlights, rain, a lit ferry in the distance. Road = a rusted catwalk over the water.  
Palette: #0b1220 #ff6a1a #22d3ff. Enemy levels 1→5, wave size 1→3, rank bonus +0. Enemy pool: `docks`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Night Shift |  | scrapper1 | 174 | 110c 21s 40xp · 2×scrapper | 10 chips | Win with 1 unit or fewer / Win with 65% squad integrity |
| 2 | Container Rats |  | dock_thug1 | 123 | 110c 21s 40xp · 2×gunner | 10 chips · unlock: **workshop** | Win in 15 s or less / Win with 75% squad integrity |
| 3 | House Call |  | scrapper2 | 190 | 140c 27s 50xp · 2×patch | 10 chips · unit: **patch** | Win without losing a unit / Win with 1 unit or fewer |
| 4 | Crane Job |  | dock_thug2 rattler2 | 377 | 140c 27s 50xp · 2×scrapper | 10 chips · unlock: **recruit_street** | Win in 10 s or less / Win with 1 unit or fewer |
| 5 | Third Pair of Hands |  | scrapper2 scrap_drone2 | 286 | 140c 27s 50xp · 2×gunner | 10 chips · **SLOT 3** | Win without losing a unit / Win in 15 s or less |
| 6 | Fish Market Fracas |  | scrapper3 scrap_drone3 | 309 | 170c 33s 60xp · 2×patch | 10 chips | Win with 2 units or fewer / Win with 65% squad integrity |
| 7 | Customs Office |  | dock_thug3 / warden3 rattler3 | 446 | 170c 33s 60xp · 2×scrapper | 10 chips | Win in 15 s or less / Win with 75% squad integrity |
| 8 | Krell's Collectors | elite | dock_thug4 / dock_thug4 rattler★4 | 509 | 320c 62s 70xp · 4×gunner | 25 chips · unlock: **rank_up** | Win without losing a unit / Win with 60% squad integrity |
| 9 | Low Tide |  | dock_thug4 / scrapper4 scrap_drone4 | 333 | 200c 39s 70xp · 2×patch | 10 chips | Win in 20 s or less / Win with 2 units or fewer |
| 10 | Dry Dock |  | warden4 scrap_drone4 / dock_thug4 gunner4 sparkplug4 | 652 | 200c 39s 70xp · 2×scrapper | 10 chips | Win without losing a unit / Win in 15 s or less |
| 11 | The Gantry |  | warden5 rattler5 / warden5 scrap_drone5 patch5 | 522 | 230c 45s 80xp · 2×gunner | 10 chips | Win with 2 units or fewer / Win with 65% squad integrity |
| 12 | Big Rusty | BOSS | dock_thug5 / scrapper5 scrap_drone5 / **BIG RUSTY**6 gunner5 | 812 | 575c 113s 120xp · 8×patch | 60 chips · unit: **bulwark** · unlock: **hq** | Win without losing a unit / Win in 30 s or less |

**Star chests:** 18★ → 20 chips · 800c · 800s · 27★ → 35 chips · 1× overclock_core · 36★ → 50 chips · unit **riot**

## 2. Neon Undercity (`m2`, theme `slums`, realm scifi) — 14 levels
*Red Ledger turf. Somebody paid them to want you dead.*

**Backdrop (hub/map agent):** Undercity market under the megacity platforms: layers of neon signage (pink/orange), steam vents, cable bundles, stalls with holo-adverts, the platform underside dripping far above. Road = a market street.  
Palette: #120a1a #ff3d81 #ff6a1a. Enemy levels 8→15, wave size 3→4, rank bonus +0. Enemy pool: `undercity`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Down the Shaft |  | dock_thug8 barb8r1 pyre8r2 | 1021 | 320c 63s 110xp · 2×scrapper | 10 chips | Win with 2 units or fewer / Win with 65% squad integrity |
| 2 | Noodle Row |  | riot9r1 scrap_drone9 sparkplug9 | 813 | 350c 69s 120xp · 2×gunner | 10 chips | Win in 10 s or less / Win with 75% squad integrity |
| 3 | Back-Alley Clinic |  | riot9r1 rattler9 sparkplug9 | 1048 | 350c 69s 120xp · 2×patch | 10 chips · unlock: **ability_upgrades, buffs** | Win without losing a unit / Win with 2 units or fewer |
| 4 | Pit Night |  | scrapper10 barb10r1 jammer10r1 | 1169 | 380c 75s 130xp · 2×bulwark | 10 chips · unlock: **arena** | Win in 15 s or less / Win with 2 units or fewer |
| 5 | Ledger Collectors | elite | riot10r1 rattler10 / dock_thug10 rattler★10 sparkplug10 | 1057 | 608c 120s 130xp · 4×barb | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Signal Thieves |  | scrapper11r1 barb11r1 / riot11r1 rattler11r1 sparkplug11r1 | 1288 | 410c 81s 140xp · 2×riot | 10 chips | Win with 2 units or fewer / Win with 65% squad integrity |
| 7 | Safehouse |  | scrapper11r1 scrap_drone11r1 / dock_thug11r1 rattler11r1 jammer11r1 | 1181 | 410c 81s 140xp · 2×rattler | 10 chips · **SLOT 4** | Win in 20 s or less / Win with 75% squad integrity |
| 8 | Neon Tithe |  | dock_thug12r1 rattler12r1 sparkplug12r1 / dock_thug12r1 barb12r1 sparkplug12r1 scrap_drone12r1 | 1584 | 440c 87s 150xp · 2×scrapper | 10 chips | Win without losing a unit / Win with 3 units or fewer |
| 9 | Burned Bridges |  | scrapper12r1 scrap_drone12r1 jammer12r1 / dock_thug12r1 rattler12r1 sparkplug12r1 barb12r1 | 1941 | 440c 87s 150xp · 2×gunner | 10 chips | Win in 15 s or less / Win with 3 units or fewer |
| 10 | Red Market | elite | dock_thug13r1 barb13r1 sparkplug13r1 / scrapper★13r1 barb13r1 jammer13r1 rattler13r1 | 2308 | 752c 149s 160xp · 4×patch | 25 chips · unlock: **daily_ops** | Win without losing a unit / Win with 60% squad integrity |
| 11 | Who Paid |  | scrapper13r1 barb13r1 / scrapper13r1 scrap_drone13r1 jammer13r1 / dock_thug13r1 rattler13r1 jammer13r1 barb13r1 | 2044 | 470c 93s 160xp · 2×bulwark | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 12 | Varro's Lieutenants |  | dock_thug14r1 barb14r1 / scrapper14r1 barb14r1 pyre14r2 / dock_thug14r1 barb14r1 sparkplug14r1 scrap_drone14r1 | 1744 | 500c 99s 170xp · 2×barb | 10 chips | Win without Archers / Win without losing a unit |
| 13 | Ledger Tower Lobby |  | riot14r1 scrap_drone14r1 / dock_thug14r1 barb14r1 jammer14r1 / dock_thug14r1 rattler14r1 sparkplug14r1 barb14r1 | 2128 | 500c 99s 170xp · 2×riot | 10 chips | Win without losing a unit / Win with 3 units or fewer |
| 14 | Redline | BOSS | riot15r1 rattler15r1 / riot15r1 scrap_drone15r1 pyre15r2 / **REDLINE**16r1 scrap_drone15r1 pyre15r2 | 2460 | 1325c 263s 270xp · 8×rattler | 60 chips · unit: **jammer** | Win without losing a unit / Win with 75% squad integrity |

**Star chests:** 21★ → 30 chips · 1600c · 1600s · 32★ → 50 chips · 1× overclock_core · 42★ → 70 chips · unit **barb**

## 3. Protocol League (`m3`, theme `league`, realm scifi) — 14 levels
*Qualifiers for the Vector Protocol league. Cameras, sponsors, champions.*

**Backdrop (hub/map agent):** The Vector Protocol league stadium district: giant VP logo pylons, spectator stands, holo-banners, searchlights sweeping a cloudy sky. Road = a lit league bracket line between arenas.  
Palette: #06122a #22d3ff #a855f7. Enemy levels 18→27, wave size 3→4, rank bonus +0. Enemy pool: `league`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Wildcard Entry |  | riot18r1 prism18r1 / phase18r1 barb18r1 oracle18r1 | 2017 | 620c 123s 210xp · 2×riot | 10 chips · unlock: **recruit_contract** | Win with 3 units or fewer / Win with 65% squad integrity |
| 2 | First Broadcast |  | riot19r1 lancer19r1 / husk19r1 lancer19r1 patch19r1 | 1827 | 650c 129s 220xp · 2×lancer | 10 chips | Win without Archers / Win without losing a unit |
| 3 | Sponsor Showcase |  | bulwark19r1 barb19r1 / riot19r1 lancer19r1 jammer19r1 | 2006 | 650c 129s 220xp · 2×riot | 10 chips | Win without losing a unit / Win with 3 units or fewer |
| 4 | Contract 3-4 |  | warden20r1 prism20r1 / phase20r1 gunner20r1 jammer20r1 | 2116 | 680c 135s 230xp · 2×gunner | 10 chips | Win in 25 s or less / Win with 3 units or fewer |
| 5 | Contract 3-5 | elite | riot21r2 prism21r2 / bulwark★21r2 needle21r2 patch21r2 | 2490 | 1136c 226s 240xp · 4×patch | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Contract 3-6 |  | riot21r2 lancer21r2 / bulwark21r2 barb21r2 aegis21r2 | 2552 | 710c 141s 240xp · 2×riot | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 7 | Underdog Story |  | bulwark22r2 barb22r2 / phase22r2 barb22r2 oracle22r2 | 2727 | 740c 147s 250xp · 2×phase | 10 chips | Win without Mages / Win without losing a unit |
| 8 | Contract 3-8 |  | warden23r2 prism23r2 / phase23r2 gunner23r2 jammer23r2 / husk23r2 gunner23r2 patch23r2 barb23r2 | 3456 | 770c 153s 260xp · 2×barb | 10 chips · unlock: **faction_trials** | Win without losing a unit / Win with 3 units or fewer |
| 9 | Contract 3-9 |  | riot24r2 prism24r2 / phase24r2 barb24r2 jammer24r2 / phase24r2 gunner24r2 oracle24r2 prism24r2 | 4341 | 800c 159s 270xp · 2×prism | 10 chips | Win in 25 s or less / Win with 3 units or fewer |
| 10 | Semifinal Blackout | elite | phase24r2 gunner24r2 / husk24r2 gunner24r2 patch24r2 / husk★24r2 lancer24r2 halo24r2 barb24r2 | 4541 | 1280c 254s 270xp · 4×husk | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 11 | Contract 3-11 |  | warden25r2 prism25r2 / bulwark25r2 barb25r2 aegis25r2 / phase25r2 barb25r2 jammer25r2 needle25r2 | 4494 | 830c 165s 280xp · 2×bulwark | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 12 | Contract 3-12 |  | bulwark26r2 barb26r2 / riot26r2 lancer26r2 aegis26r2 / bulwark26r2 barb26r2 aegis26r2 gunner26r2 | 4524 | 860c 171s 290xp · 2×gunner | 10 chips | Win without Tanks / Win without losing a unit |
| 13 | Final Four |  | riot26r2 lancer26r2 / bulwark26r2 barb26r2 patch26r2 / warden26r2 prism26r2 halo26r2 barb26r2 | 4542 | 860c 171s 290xp · 2×patch | 10 chips | Win without losing a unit / Win with 3 units or fewer |
| 14 | Corona | BOSS | husk27r2 lancer27r2 / riot27r2 lancer27r2 jammer27r2 / **CORONA**28r2 needle27r2 oracle27r2 | 5282 | 2225c 443s 450xp · 8×lancer | 60 chips · **SLOT 5** · unit: **lancer** | Win without losing a unit / Win in 30 s or less |

**Star chests:** 21★ → 40 chips · 2400c · 2400s · 32★ → 65 chips · 2× overclock_core · 42★ → 90 chips · unit **tarantula**

## 4. Kestrel Skyport (`m4`, theme `skyport`, realm scifi) — 15 levels
*Corporate contracts in the clouds. The clients are worse than the targets.*

**Backdrop (hub/map agent):** Skyport above the clouds: landing pads, VTOLs, white corporate towers, a sunset-to-night gradient, Kestrel bird logos. Road = sky-bridges between pads.  
Palette: #0a1830 #9fd8ff #ffffff. Enemy levels 27→35, wave size 4→5, rank bonus +0. Enemy pool: `skyport`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Boarding Pass |  | bulwark27r2 gunner27r2 patch27r2 / citadel27r2 lancer27r2 aegis27r2 meridian27r2 | 4540 | 890c 177s 300xp · 2×bulwark | 10 chips · unlock: **weekly_raid** | Win with 3 units or fewer / Win with 65% squad integrity |
| 2 | Contract 4-2 |  | warden28r2 sec_drone28r2 aegis28r2 / warden28r2 meridian28r2 aegis28r2 sec_drone28r2 | 3893 | 920c 183s 310xp · 2×aegis | 10 chips | Win without Mages / Win without losing a unit |
| 3 | Contract 4-3 |  | bulwark28r2 meridian28r2 arbiter28r2 / citadel28r2 sec_drone28r2 patch28r2 lancer28r2 | 3652 | 920c 183s 310xp · 2×arbiter | 10 chips | Win with 3+ Corporate units / Win in 35 s or less |
| 4 | Contract 4-4 |  | bulwark29r2 lancer29r2 patch29r2 / citadel29r2 gunner29r2 aegis29r2 sec_drone29r2 | 4120 | 950c 189s 320xp · 2×citadel | 10 chips | Win in 35 s or less / Win with 3 units or fewer |
| 5 | Pad Nine | elite | bulwark29r2 gunner29r2 patch29r2 / bulwark★29r2 lancer29r2 patch29r2 gunner29r2 | 4810 | 1520c 302s 320xp · 4×bulwark | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Contract 4-6 |  | bulwark30r2 sec_drone30r2 arbiter30r2 / warden30r2 meridian30r2 aegis30r2 sec_drone30r2 | 4123 | 980c 195s 330xp · 2×bulwark | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 7 | Contract 4-7 |  | warden30r2 meridian30r2 aegis30r2 / warden30r2 sec_drone30r2 aegis30r2 meridian30r2 | 4123 | 980c 195s 330xp · 2×warden | 10 chips | Win without Mages / Win without losing a unit |
| 8 | Contract 4-8 |  | bulwark31r3 lancer31r3 patch31r3 / citadel31r3 gunner31r3 aegis31r3 sec_drone31r3 / warden31r3 citadel31r3 sec_drone31r3 aegis31r3 meridian31r3 | 6309 | 1010c 201s 340xp · 2×meridian | 10 chips · unlock: **recruit_arena** | Win with 3+ Experimental units / Win in 50 s or less |
| 9 | Contract 4-9 |  | bulwark32r3 gunner32r3 patch32r3 / warden32r3 lancer32r3 arbiter32r3 sec_drone32r3 / warden32r3 bulwark32r3 meridian32r3 aegis32r3 sec_drone32r3 | 6509 | 1040c 207s 350xp · 2×bulwark | 10 chips | Win in 50 s or less / Win with 3 units or fewer |
| 10 | Cargo Manifest | elite | bulwark32r3 gunner32r3 patch32r3 / bulwark32r3 lancer32r3 patch32r3 gunner32r3 / citadel★32r3 warden32r3 meridian32r3 patch32r3 lancer32r3 | 7333 | 1664c 331s 350xp · 4×patch | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 11 | Contract 4-11 |  | citadel33r3 lancer33r3 aegis33r3 / warden33r3 gunner33r3 arbiter33r3 lancer33r3 / warden33r3 citadel33r3 sec_drone33r3 aegis33r3 meridian33r3 | 6663 | 1070c 213s 360xp · 2×warden | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 12 | Contract 4-12 |  | bulwark33r3 meridian33r3 arbiter33r3 / bulwark33r3 sec_drone33r3 arbiter33r3 gunner33r3 / warden33r3 bulwark33r3 gunner33r3 arbiter33r3 lancer33r3 | 7802 | 1070c 213s 360xp · 2×lancer | 10 chips | Win without Tanks / Win without losing a unit |
| 13 | Contract 4-13 |  | citadel34r3 sec_drone34r3 patch34r3 / bulwark34r3 meridian34r3 arbiter34r3 gunner34r3 / warden34r3 citadel34r3 lancer34r3 arbiter34r3 sec_drone34r3 | 6946 | 1100c 219s 370xp · 2×arbiter | 10 chips | Win with 3+ Experimental units / Win in 45 s or less |
| 14 | Contract 4-14 |  | citadel34r3 gunner34r3 aegis34r3 / warden34r3 lancer34r3 arbiter34r3 sec_drone34r3 / citadel34r3 warden34r3 meridian34r3 patch34r3 lancer34r3 | 7386 | 1100c 219s 370xp · 2×arbiter | 10 chips | Win in 45 s or less / Win with 3 units or fewer |
| 15 | Stormcrow | BOSS | bulwark35r3 lancer35r3 patch35r3 / citadel35r3 gunner35r3 aegis35r3 sec_drone35r3 / **STORMCROW**36r3 bulwark35r3 sec_drone35r3 patch35r3 | 7740 | 2825c 563s 570xp · 8×patch | 60 chips · unit: **prism** | Win without losing a unit / Win with 75% squad integrity |

**Star chests:** 23★ → 50 chips · 3200c · 3200s · 34★ → 80 chips · 2× overclock_core · 45★ → 110 chips · unit **meridian**

## 5. The Lattice (`m5`, theme `lab`, realm scifi) — 16 levels
*Novaline Lab 9, quarantined. The robots inside are not malfunctioning.*

**Backdrop (hub/map agent):** Quarantined lab campus: sealed domes, violet light leaking from cracks, floating debris, crystal growths on walls, hazard tape. Road = a cracked service corridor glowing violet; the Rift glimmers at the end.  
Palette: #0c0616 #a855f7 #e879f9. Enemy levels 33→40, wave size 5→6, rank bonus +0. Enemy pool: `lattice`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Quarantine Line |  | phase33r3 lab_drone33r3 halo33r3 needle33r3 / monolith33r3 husk33r3 specter33r3 wisp33r3 prism33r3 | 7957 | 1070c 213s 360xp | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 2 | Contract 5-2 |  | phase33r3 needle33r3 wisp33r3 specter33r3 / husk33r3 monolith33r3 prism33r3 halo33r3 lab_drone33r3 | 7086 | 1070c 213s 360xp | 10 chips | Win without Mages / Win without losing a unit |
| 3 | Contract 5-3 |  | phase34r3 prism34r3 wisp34r3 needle34r3 / monolith34r3 husk34r3 needle34r3 oracle34r3 lab_drone34r3 | 7185 | 1100c 219s 370xp | 10 chips | Win with 3+ Corporate units / Win in 30 s or less |
| 4 | Contract 5-4 |  | phase34r3 specter34r3 halo34r3 needle34r3 / phase34r3 monolith34r3 lab_drone34r3 halo34r3 needle34r3 | 7514 | 1100c 219s 370xp | 10 chips | Win in 55 s or less / Win with 3 units or fewer |
| 5 | Clean Room | elite | husk35r3 lab_drone35r3 oracle35r3 specter35r3 / monolith★35r3 husk35r3 specter35r3 wisp35r3 prism35r3 | 8804 | 1808c 360s 380xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Contract 5-6 |  | monolith35r3 needle35r3 oracle35r3 lab_drone35r3 / husk35r3 monolith35r3 prism35r3 halo35r3 lab_drone35r3 | 7471 | 1130c 225s 380xp | 10 chips | Win with 3 units or fewer / Win with 65% squad integrity |
| 7 | Contract 5-7 |  | phase36r3 prism36r3 wisp36r3 needle36r3 / monolith36r3 husk36r3 needle36r3 oracle36r3 lab_drone36r3 | 8293 | 1160c 231s 390xp | 10 chips | Win without Tanks / Win without losing a unit |
| 8 | The Oracle Waits |  | phase36r3 specter36r3 halo36r3 needle36r3 / monolith36r3 phase36r3 lab_drone36r3 wisp36r3 prism36r3 | 8280 | 1160c 231s 390xp | 10 chips · **SLOT 6** · unit: **oracle** | Win with 3+ Corporate units / Win in 25 s or less |
| 9 | Contract 5-9 |  | husk37r3 lab_drone37r3 oracle37r3 specter37r3 / husk37r3 phase37r3 specter37r3 oracle37r3 lab_drone37r3 / monolith37r3 phase37r3 prism37r3 oracle37r3 specter37r3 wisp37r3 | 11823 | 1190c 237s 400xp | 10 chips | Win in 25 s or less / Win with 4 units or fewer |
| 10 | Contract 5-10 |  | monolith37r3 prism37r3 oracle37r3 specter37r3 / husk37r3 phase37r3 needle37r3 halo37r3 prism37r3 / phase37r3 monolith37r3 lab_drone37r3 halo37r3 needle37r3 wisp37r3 | 10591 | 1190c 237s 400xp | 10 chips | Win without losing a unit / Win in 55 s or less |
| 11 | Glass Garden | elite | husk38r3 needle38r3 halo38r3 prism38r3 / monolith38r3 phase38r3 prism38r3 oracle38r3 specter38r3 / husk★38r3 phase38r3 specter38r3 oracle38r3 lab_drone38r3 halo38r3 | 11342 | 1952c 389s 410xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 12 | Contract 5-12 |  | monolith38r3 lab_drone38r3 wisp38r3 prism38r3 / monolith38r3 husk38r3 specter38r3 wisp38r3 prism38r3 / husk38r3 monolith38r3 prism38r3 halo38r3 lab_drone38r3 wisp38r3 | 10565 | 1220c 243s 410xp | 10 chips | Win without Mages / Win without losing a unit |
| 13 | Contract 5-13 |  | husk39r3 specter39r3 oracle39r3 lab_drone39r3 / phase39r3 monolith39r3 lab_drone39r3 halo39r3 needle39r3 / husk39r3 phase39r3 needle39r3 halo39r3 prism39r3 oracle39r3 | 12582 | 1250c 249s 420xp | 10 chips | Win with 3+ Rogue units / Win in 35 s or less |
| 14 | Contract 5-14 |  | husk39r3 prism39r3 halo39r3 lab_drone39r3 / phase39r3 husk39r3 needle39r3 wisp39r3 specter39r3 / phase39r3 monolith39r3 lab_drone39r3 halo39r3 needle39r3 wisp39r3 | 11118 | 1250c 249s 420xp | 10 chips | Win in 45 s or less / Win with 4 units or fewer |
| 15 | Contract 5-15 |  | husk40r3 needle40r3 halo40r3 prism40r3 / husk40r3 monolith40r3 prism40r3 halo40r3 lab_drone40r3 / phase40r3 husk40r3 specter40r3 halo40r3 needle40r3 oracle40r3 | 12947 | 1280c 255s 430xp | 10 chips | Win without losing a unit / Win in 35 s or less |
| 16 | The Choir | BOSS | phase40r3 lab_drone40r3 halo40r3 needle40r3 / monolith40r3 husk40r3 specter40r3 wisp40r3 prism40r3 / **THE CHOIR**41r4 phase40r3 prism40r3 oracle40r3 specter40r3 | 15350 | 3200c 638s 645xp | 60 chips · unit: **phase** | Win without losing a unit / Win in 35 s or less |

**Star chests:** 24★ → 60 chips · 4000c · 4000s · 36★ → 95 chips · 2× overclock_core · 48★ → 130 chips · unit **specter**

## 6. The Verdance (`m6`, theme `forest`, realm fantasy) — 16 levels
*Through the Rift: a living realm of knights and elves who think you are the invasion.*

**Backdrop (hub/map agent):** Ancient forest ruins (refs/ref_fantasy_01.jpg): mossy stone walls, giant trees, god-rays, fireflies, a torn violet Rift hanging in the sky where Novaline harvest drones come through. Road = a cobbled path through ruins.  
Palette: #0d1a0f #22c55e #fbbf24. Enemy levels 41→47, wave size 5→6, rank bonus +1. Enemy pool: `verdance`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | First Light |  | minotaur41r5 elf_ranger41r5 elf_sage41r5 frost_wolf41r5 / minotaur41r5 treant41r5 frost_wolf41r5 horde_shaman41r5 elf_ranger41r5 | 13425 | 1310c 261s 440xp · 2×dire_wolf | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 2 | Contract 6-2 |  | treant41r5 elf_ranger41r5 horde_shaman41r5 dire_wolf41r5 / rift_knight41r5 minotaur41r5 frost_wolf41r5 elf_sage41r5 dire_wolf41r5 | 13712 | 1310c 261s 440xp · 2×elf_ranger | 10 chips | Win without Archers / Win without losing a unit |
| 3 | Contract 6-3 |  | treant42r5 dire_wolf42r5 elf_sage42r5 frost_wolf42r5 / treant42r5 minotaur42r5 elf_ranger42r5 horde_shaman42r5 dire_wolf42r5 | 13638 | 1340c 267s 450xp · 2×frost_wolf | 10 chips | Win without losing a unit / Win with 4 units or fewer |
| 4 | Contract 6-4 |  | minotaur42r5 frost_wolf42r5 horde_shaman42r5 elf_ranger42r5 / minotaur42r5 rift_knight42r5 elf_ranger42r5 elf_sage42r5 frost_wolf42r5 | 13956 | 1340c 267s 450xp · 2×horde_shaman | 10 chips | Win in 35 s or less / Win with 4 units or fewer |
| 5 | Knight's Bridge | elite | rift_knight43r5 frost_wolf43r5 elf_sage43r5 dire_wolf43r5 / minotaur43r5 treant43r5 frost_wolf43r5 horde_shaman43r5 elf_ranger43r5 | 14061 | 2192c 437s 460xp · 4×rift_knight | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Contract 6-6 |  | rift_knight43r5 dire_wolf43r5 horde_shaman43r5 elf_ranger43r5 / rift_knight43r5 minotaur43r5 frost_wolf43r5 elf_sage43r5 dire_wolf43r5 | 14364 | 1370c 273s 460xp · 2×elf_sage | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 7 | Contract 6-7 |  | rift_knight43r5 frost_wolf43r5 elf_sage43r5 dire_wolf43r5 / treant43r5 minotaur43r5 elf_ranger43r5 horde_shaman43r5 dire_wolf43r5 | 13955 | 1370c 273s 460xp · 2×dire_wolf | 10 chips | Win without Mages / Win without losing a unit |
| 8 | Ysolde |  | rift_knight44r5 dire_wolf44r5 horde_shaman44r5 elf_ranger44r5 / rift_knight44r5 minotaur44r5 frost_wolf44r5 elf_sage44r5 dire_wolf44r5 | 14695 | 1400c 279s 470xp · 2×elf_ranger | 10 chips | Win without losing a unit / Win with 4 units or fewer |
| 9 | Contract 6-9 |  | rift_knight44r5 frost_wolf44r5 elf_sage44r5 dire_wolf44r5 / treant44r5 minotaur44r5 elf_ranger44r5 horde_shaman44r5 dire_wolf44r5 / minotaur44r5 rift_knight44r5 elf_ranger44r5 elf_sage44r5 frost_wolf44r5 horde_shaman44r5 | 16800 | 1400c 279s 470xp · 2×frost_wolf | 10 chips | Win in 45 s or less / Win with 4 units or fewer |
| 10 | Contract 6-10 |  | treant45r5 dire_wolf45r5 elf_sage45r5 frost_wolf45r5 / rift_knight45r5 treant45r5 dire_wolf45r5 horde_shaman45r5 elf_ranger45r5 / minotaur45r5 rift_knight45r5 elf_ranger45r5 elf_sage45r5 frost_wolf45r5 horde_shaman45r5 | 17179 | 1430c 285s 480xp · 2×horde_shaman | 10 chips | Win without losing a unit / Win in 50 s or less |
| 11 | Labyrinth Gate | elite | minotaur45r5 frost_wolf45r5 horde_shaman45r5 elf_ranger45r5 / rift_knight45r5 minotaur45r5 frost_wolf45r5 elf_sage45r5 dire_wolf45r5 / treant45r5 minotaur45r5 elf_ranger45r5 horde_shaman45r5 dire_wolf45r5 elf_sage45r5 | 16878 | 2288c 456s 480xp · 4×rift_knight | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 12 | The Rime Pack |  | minotaur45r5 elf_ranger45r5 elf_sage45r5 frost_wolf45r5 / treant45r5 minotaur45r5 elf_ranger45r5 horde_shaman45r5 dire_wolf45r5 / minotaur45r5 rift_knight45r5 elf_ranger45r5 elf_sage45r5 frost_wolf45r5 horde_shaman45r5 | 17179 | 1430c 285s 480xp · 2×elf_sage | 10 chips | Win without Archers / Win without losing a unit |
| 13 | Contract 6-13 |  | rift_knight46r5 dire_wolf46r5 horde_shaman46r5 elf_ranger46r5 / minotaur46r5 rift_knight46r5 elf_ranger46r5 elf_sage46r5 frost_wolf46r5 / treant46r5 minotaur46r5 elf_ranger46r5 horde_shaman46r5 dire_wolf46r5 elf_sage46r5 | 17252 | 1460c 291s 490xp · 2×dire_wolf | 10 chips | Win without losing a unit / Win with 4 units or fewer |
| 14 | Contract 6-14 |  | treant46r5 dire_wolf46r5 elf_sage46r5 frost_wolf46r5 / treant46r5 minotaur46r5 elf_ranger46r5 horde_shaman46r5 dire_wolf46r5 / treant46r5 rift_knight46r5 dire_wolf46r5 elf_sage46r5 frost_wolf46r5 horde_shaman46r5 | 17492 | 1460c 291s 490xp · 2×elf_ranger | 10 chips | Win in 55 s or less / Win with 4 units or fewer |
| 15 | Contract 6-15 |  | treant47r5 elf_ranger47r5 horde_shaman47r5 dire_wolf47r5 / rift_knight47r5 minotaur47r5 frost_wolf47r5 elf_sage47r5 dire_wolf47r5 / minotaur47r5 treant47r5 frost_wolf47r5 horde_shaman47r5 elf_ranger47r5 elf_sage47r5 | 17748 | 1490c 297s 500xp · 2×frost_wolf | 10 chips | Win without losing a unit / Win in 50 s or less |
| 16 | Elderbark | BOSS | rift_knight47r5 frost_wolf47r5 elf_sage47r5 dire_wolf47r5 / treant47r5 minotaur47r5 elf_ranger47r5 horde_shaman47r5 dire_wolf47r5 / **ELDERBARK**48r5 rift_knight47r5 dire_wolf47r5 elf_sage47r5 frost_wolf47r5 | 21000 | 3725c 743s 750xp · 8×horde_shaman | 60 chips · unlock: **recruit_rift** | Win without losing a unit / Win with 75% squad integrity |

**Star chests:** 24★ → 70 chips · 4800c · 4800s · 36★ → 110 chips · 3× overclock_core · 48★ → 150 chips · unit **treant**

## 7. Spire War (`m7`, theme `spirewar`, realm scifi) — 18 levels
*Open corporate war over Halcyon Reach, fought with stolen monsters.*

**Backdrop (hub/map agent):** Halcyon Reach at war: corporate towers with shield domes, burning skybridges, a vine-overgrown Novaline Spire with the Rift above its tip, searchlights and tracers. Road = a broken elevated highway.  
Palette: #0a0f1f #22d3ff #ef4444. Enemy levels 45→49, wave size 6→6, rank bonus +0. Enemy pool: `spire`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Homecoming |  | treant45r4 minotaur45r4 specter45r4 aegis45r4 lancer45r4 / juggernaut45r4 citadel45r4 tarantula45r4 horde_shaman45r4 specter45r4 arbiter45r4 | 16610 | 1430c 285s 480xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 2 | Contract 7-2 |  | juggernaut45r4 bulwark45r4 tarantula45r4 arbiter45r4 frost_wolf45r4 / citadel45r4 juggernaut45r4 tarantula45r4 aegis45r4 meridian45r4 horde_shaman45r4 | 16314 | 1430c 285s 480xp | 10 chips | Win without Mages / Win without losing a unit |
| 3 | Contract 7-3 |  | treant45r4 juggernaut45r4 specter45r4 horde_shaman45r4 meridian45r4 / bulwark45r4 minotaur45r4 specter45r4 pyre45r4 frost_wolf45r4 halo45r4 | 16556 | 1430c 285s 480xp | 10 chips | Win with 3+ Corporate units / Win in 30 s or less |
| 4 | Contract 7-4 |  | citadel46r4 treant46r4 frost_wolf46r4 halo46r4 specter46r4 / treant46r4 minotaur46r4 specter46r4 aegis46r4 lancer46r4 pyre46r4 | 17621 | 1460c 291s 490xp | 10 chips | Win in 30 s or less / Win with 4 units or fewer |
| 5 | Contract 7-5 |  | treant46r4 minotaur46r4 specter46r4 aegis46r4 lancer46r4 / juggernaut46r4 citadel46r4 tarantula46r4 horde_shaman46r4 specter46r4 arbiter46r4 | 16980 | 1460c 291s 490xp | 10 chips | Win without losing a unit / Win in 30 s or less |
| 6 | Shield Dome | elite | citadel46r4 bulwark46r4 frost_wolf46r4 aegis46r4 meridian46r4 / treant46r4 juggernaut46r4 specter★46r4 horde_shaman46r4 meridian46r4 aegis46r4 | 17370 | 2336c 466s 490xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 7 | Contract 7-7 |  | bulwark46r4 juggernaut46r4 frost_wolf46r4 pyre46r4 tarantula46r4 / treant46r4 bulwark46r4 meridian46r4 horde_shaman46r4 frost_wolf46r4 halo46r4 | 15692 | 1460c 291s 490xp | 10 chips | Win without Tanks / Win without losing a unit |
| 8 | Contract 7-8 |  | bulwark47r4 treant47r4 specter47r4 arbiter47r4 tarantula47r4 / minotaur47r4 citadel47r4 meridian47r4 pyre47r4 lancer47r4 arbiter47r4 | 17222 | 1490c 297s 500xp | 10 chips | Win with 3+ Experimental units / Win in 25 s or less |
| 9 | Ione's Choice |  | juggernaut47r4 minotaur47r4 lancer47r4 horde_shaman47r4 frost_wolf47r4 / bulwark47r4 treant47r4 specter47r4 arbiter47r4 tarantula47r4 horde_shaman47r4 | 17311 | 1490c 297s 500xp | 10 chips | Win in 30 s or less / Win with 4 units or fewer |
| 10 | Contract 7-10 |  | treant47r4 specter47r4 horde_shaman47r4 meridian47r4 / minotaur47r4 bulwark47r4 lancer47r4 halo47r4 meridian47r4 / treant47r4 minotaur47r4 specter47r4 aegis47r4 lancer47r4 pyre47r4 | 18004 | 1490c 297s 500xp | 10 chips | Win without losing a unit / Win in 35 s or less |
| 11 | Contract 7-11 |  | bulwark47r4 specter47r4 pyre47r4 frost_wolf47r4 / citadel47r4 juggernaut47r4 tarantula47r4 aegis47r4 meridian47r4 / citadel47r4 treant47r4 frost_wolf47r4 halo47r4 specter47r4 horde_shaman47r4 | 16361 | 1490c 297s 500xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 12 | Bound Beasts | elite | minotaur48r4 meridian48r4 pyre48r4 lancer48r4 / juggernaut48r4 citadel48r4 tarantula48r4 horde_shaman48r4 specter48r4 / bulwark★48r4 juggernaut48r4 frost_wolf48r4 pyre48r4 tarantula48r4 aegis48r4 | 20217 | 2432c 485s 510xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 13 | Contract 7-13 |  | juggernaut48r4 tarantula48r4 horde_shaman48r4 specter48r4 / treant48r4 minotaur48r4 specter48r4 aegis48r4 lancer48r4 / citadel48r4 bulwark48r4 frost_wolf48r4 aegis48r4 meridian48r4 halo48r4 | 18500 | 1520c 303s 510xp | 10 chips | Win with 3+ Experimental units / Win with 75% squad integrity |
| 14 | Contract 7-14 |  | citadel48r4 tarantula48r4 aegis48r4 meridian48r4 / treant48r4 bulwark48r4 meridian48r4 horde_shaman48r4 frost_wolf48r4 / treant48r4 minotaur48r4 specter48r4 aegis48r4 lancer48r4 pyre48r4 | 20011 | 1520c 303s 510xp | 10 chips | Win in 40 s or less / Win with 4 units or fewer |
| 15 | Contract 7-15 |  | treant48r4 meridian48r4 horde_shaman48r4 frost_wolf48r4 / juggernaut48r4 treant48r4 lancer48r4 arbiter48r4 tarantula48r4 / minotaur48r4 treant48r4 lancer48r4 pyre48r4 specter48r4 horde_shaman48r4 | 18925 | 1520c 303s 510xp | 10 chips | Win without losing a unit / Win in 30 s or less |
| 16 | Contract 7-16 |  | juggernaut49r4 lancer49r4 horde_shaman49r4 frost_wolf49r4 / bulwark49r4 treant49r4 specter49r4 arbiter49r4 tarantula49r4 / bulwark49r4 juggernaut49r4 frost_wolf49r4 pyre49r4 tarantula49r4 aegis49r4 | 19910 | 1550c 309s 520xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 17 | Contract 7-17 |  | bulwark49r4 specter49r4 arbiter49r4 tarantula49r4 / bulwark49r4 citadel49r4 frost_wolf49r4 arbiter49r4 lancer49r4 / citadel49r4 bulwark49r4 frost_wolf49r4 aegis49r4 meridian49r4 halo49r4 | 18885 | 1550c 309s 520xp | 10 chips | Win without Tanks / Win without losing a unit |
| 18 | Aurelian | BOSS | treant49r4 specter49r4 horde_shaman49r4 meridian49r4 / bulwark49r4 minotaur49r4 specter49r4 pyre49r4 frost_wolf49r4 / **AURELIAN**50r4 minotaur49r4 lancer49r4 horde_shaman49r4 frost_wolf49r4 | 21201 | 3875c 773s 780xp | 60 chips · unit: **paladin** | Win without losing a unit / Win in 40 s or less |

**Star chests:** 27★ → 80 chips · 5600c · 5600s · 41★ → 125 chips · 3× overclock_core · 54★ → 170 chips · unit **juggernaut**

## 8. Protocol Core (`m8`, theme `core`, realm scifi) — 15 levels
*Inside the standard every robot runs. Rewrite it, or be rewritten.*

**Backdrop (hub/map agent):** Inside the Protocol: an abstract data-space, a vast circuit-trace floor stretching to infinity, glowing gold code pillars, floating hex plates, a black sun with a gold ring (Vector Prime) on the horizon. Road = a single bright circuit trace.  
Palette: #05030a #ffc23a #a855f7. Enemy levels 48→50, wave size 6→6, rank bonus +0. Enemy pool: `core`.

| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |
|---|---|---|---|---|---|---|---|
| 1 | Upload |  | warlord48r4 executor48r4 halo48r4 specter48r4 / citadel48r4 monolith48r4 tarantula48r4 paragon48r4 seraph48r4 / juggernaut48r4 monolith48r4 meridian48r4 halo48r4 tarantula48r4 singularity48r4 | 20969 | 1520c 303s 510xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 2 | Contract 8-2 |  | leviathan48r4 specter48r4 paragon48r4 widowmaker48r4 / warlord48r4 citadel48r4 executor48r4 pyre48r4 seraph48r4 / paladin48r4 leviathan48r4 widowmaker48r4 singularity48r4 meridian48r4 halo48r4 | 21990 | 1520c 303s 510xp | 10 chips | Win without Mages / Win without losing a unit |
| 3 | Contract 8-3 |  | monolith48r4 seraph48r4 kingpin48r4 tarantula48r4 / paladin48r4 monolith48r4 widowmaker48r4 arbiter48r4 specter48r4 / monolith48r4 leviathan48r4 seraph48r4 pyre48r4 widowmaker48r4 kingpin48r4 | 22335 | 1520c 303s 510xp | 10 chips | Win with 3+ Corporate units / Win in 30 s or less |
| 4 | Contract 8-4 |  | paladin48r4 widowmaker48r4 singularity48r4 seraph48r4 / warlord48r4 paladin48r4 executor48r4 halo48r4 widowmaker48r4 / leviathan48r4 citadel48r4 specter48r4 paragon48r4 tarantula48r4 pyre48r4 | 21361 | 1520c 303s 510xp | 10 chips | Win in 35 s or less / Win with 4 units or fewer |
| 5 | Root Directory | elite | juggernaut49r4 meridian49r4 kingpin49r4 seraph49r4 / paladin49r4 monolith49r4 widowmaker49r4 singularity49r4 tarantula49r4 / warlord★49r4 leviathan49r4 executor49r4 pyre49r4 tarantula49r4 kingpin49r4 | 25277 | 2480c 494s 520xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 6 | Contract 8-6 |  | paladin49r4 widowmaker49r4 arbiter49r4 meridian49r4 / monolith49r4 paladin49r4 seraph49r4 kingpin49r4 executor49r4 / leviathan49r4 citadel49r4 specter49r4 arbiter49r4 meridian49r4 paragon49r4 | 21096 | 1550c 309s 520xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 7 | Contract 8-7 |  | warlord49r4 executor49r4 pyre49r4 specter49r4 / leviathan49r4 citadel49r4 specter49r4 paragon49r4 seraph49r4 / juggernaut49r4 monolith49r4 meridian49r4 kingpin49r4 executor49r4 singularity49r4 | 21741 | 1550c 309s 520xp | 10 chips | Win without Archers / Win without losing a unit |
| 8 | Contract 8-8 |  | citadel49r4 tarantula49r4 paragon49r4 widowmaker49r4 / juggernaut49r4 monolith49r4 meridian49r4 kingpin49r4 executor49r4 / paladin49r4 warlord49r4 widowmaker49r4 arbiter49r4 meridian49r4 singularity49r4 | 22895 | 1550c 309s 520xp | 10 chips | Win with 3+ Rogue units / Win in 30 s or less |
| 9 | Contract 8-9 |  | juggernaut49r4 meridian49r4 kingpin49r4 specter49r4 / paladin49r4 leviathan49r4 widowmaker49r4 singularity49r4 executor49r4 / juggernaut49r4 paladin49r4 meridian49r4 halo49r4 widowmaker49r4 pyre49r4 | 21048 | 1550c 309s 520xp | 10 chips | Win in 40 s or less / Win with 4 units or fewer |
| 10 | Mags' Old Code | elite | juggernaut49r4 meridian49r4 kingpin49r4 widowmaker49r4 / citadel49r4 paladin49r4 tarantula49r4 paragon49r4 seraph49r4 / warlord★49r4 paladin49r4 executor49r4 pyre49r4 meridian49r4 paragon49r4 | 23983 | 2480c 494s 520xp | 25 chips | Win without losing a unit / Win with 60% squad integrity |
| 11 | Contract 8-11 |  | leviathan49r4 specter49r4 arbiter49r4 executor49r4 / monolith49r4 juggernaut49r4 seraph49r4 pyre49r4 meridian49r4 / citadel49r4 juggernaut49r4 tarantula49r4 singularity49r4 meridian49r4 pyre49r4 | 20578 | 1550c 309s 520xp | 10 chips | Win with 4 units or fewer / Win with 65% squad integrity |
| 12 | Contract 8-12 |  | warlord50r4 executor50r4 pyre50r4 meridian50r4 / paladin50r4 leviathan50r4 widowmaker50r4 arbiter50r4 tarantula50r4 / warlord50r4 monolith50r4 executor50r4 halo50r4 tarantula50r4 singularity50r4 | 24245 | 1580c 315s 530xp | 10 chips | Win without Mages / Win without losing a unit |
| 13 | Contract 8-13 |  | paladin50r4 widowmaker50r4 arbiter50r4 specter50r4 / warlord50r4 leviathan50r4 executor50r4 pyre50r4 specter50r4 / leviathan50r4 monolith50r4 specter50r4 arbiter50r4 seraph50r4 pyre50r4 | 22275 | 1580c 315s 530xp | 10 chips | Win with 3+ Experimental units / Win in 30 s or less |
| 14 | Last Patch |  | warlord50r4 executor50r4 halo50r4 seraph50r4 / citadel50r4 leviathan50r4 tarantula50r4 paragon50r4 widowmaker50r4 / juggernaut50r4 leviathan50r4 meridian50r4 halo50r4 specter50r4 kingpin50r4 | 22094 | 1580c 315s 530xp | 10 chips | Win in 40 s or less / Win with 4 units or fewer |
| 15 | Vector Prime | BOSS | citadel50r4 tarantula50r4 paragon50r4 specter50r4 / juggernaut50r4 paladin50r4 meridian50r4 kingpin50r4 seraph50r4 / **VECTOR PRIME**51r5 leviathan50r4 widowmaker50r4 arbiter50r4 tarantula50r4 | 28769 | 3950c 788s 795xp | 60 chips | Win without losing a unit / Win in 40 s or less |

**Star chests:** 23★ → 90 chips · 6400c · 6400s · 34★ → 140 chips · 3× overclock_core · 45★ → 190 chips · unit **seraph**

