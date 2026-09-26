# planner notes

## DONE (v1, 2026-09-26). All six docs are saved and usable.
- **DESIGN.md:** premise (Halcyon, the Link, Wren in Pod 4471, the heir-key), core loop, controls, frames (rental, Brawler "Bulwark", Gunner "Longarm", Ghost "Wisp", each with stats, 3 skills and a passive), Frame Sync plus mods, **Mk tiers (adopted from systems' frames.js)**, Heir Core, 6 part slots, rarity tiers, 24 affixes, 12 Relic uniques, Heirloom sets, tune/salvage/recalibrate, rider level, 11 districts, 8 factions plus rep tiers, the enemy roster by tier with robot kinds, elite mods, AI states and detection, board, threat levels, Heat, district danger, post-game, rewards, Warehouse tabs, Home, codex, death and repair, tone, save.
- **STORY.md:** §1 CAST with Qwen voice prompts (audio already uses it in tools/vo/cast_story.json); §2 the whole backstory; §3 the 7-reveal ladder with planted clues; §4 six acts, each mission with a level gate; §5 story and endless play; §6 clues C01–C18 plus Echo clues and the family tree layout; §7 story flags and the gate table; **§8 scripts: the intro and A1-M1 as trigger tables (P1-ready)**.
- **MISSIONS.md:** the mission object; step vocabulary; site tags; 18 archetypes (P1 = courier, pest, retrieve, surveil); name tables; title and blurb templates; modifiers; formulas; twists T1–T12; district enemy pools; board algorithm; sim acceptance.
- **ECONOMY.md:** L(lvl)=1.09^(lvl−1); stat assembly; XP curve table; income per hour; sinks (rental 100 per shift, frame licences 1.5k/12k/50k, Mk tiers, tuning table, repair, stash); materials; loot rarity weights by band; loot quality; Legacy, Overclock and Succession; pacing targets.
- **VO_LINES.md:** P0 = all of Act 1 (a1_s00–s15), Harmony PA core, barks for Mara, HIRA, civilians, thugs, Wardens and vendors. Acts 2–6 at P1/P2.
- **BUILD_PLAN.md:** ownership, a proposed `js/game/*` runtime owned by systems (⚑ manager decides), contract additions, the P1 slice definition plus 13 acceptance tests, and P2–P6.

## IN PROGRESS
- Nothing. The v1 docs are complete.

## NEXT (in order)
1. Once the manager rules on ⚑ js/game ownership, update BUILD_PLAN.
2. (done: STORY §8.1–8.2 intro and A1-M1)
3. Write the A1-M2 to A1-M5 scripts and the Kettle boss phase design (P2).

## Divergences found in other agents' files (the owners should fix these; I did not edit them)
- **systems `js/data/frames.js`:** slots are `head, core, arms, legs, weapon, module`. The design and the manager brief say **chassis, core, weapon, optics, mobility, chip**, and the rental has **weapon and chip only**. The frame names are Bastion and Longwatch; the design uses **Bulwark** (Brawler) and **Longarm** (Gunner), and the Ghost is **Wisp**. Base stats differ a little (for example rental hull 110 vs design HP 120, and speeds of 4.6–5 vs 3.8–4.8). Systems may keep the sim-tuned numbers, but should put the slot names in line with the design. The Mk tiers in frames.js were adopted into the design (DESIGN §5.7).
- **audio tools/vo/cast.json:** has placeholder ids (dispatcher, broker, narrator, pa, …). The canonical ids are in STORY §1: mara, hira, harmony (= the iris clone plus FX), iris, dray, lyra, seraph (= the lyra clone plus FX), tomas, fenn, kettle, jun, halloran, rook, elena, helm, sal, ottoline, plus the bark pools civ_f1, civ_m1, civ_f2, civ_m2, warden_m, warden_f, thug_m, thug_f, unlinked, choir. There is no narrator; Wren is silent.

## Requests to other agents
- **robots:** P1 needs `scrap_rat` (small quadruped) now. Later kinds: `turret`, `rustkin`, `spider` (tiers 0 and 2), `seraph`, `boss_kettle`, `boss_sovereign`. Please add a `paint` param (`'syndicate'|'concord'|'unlinked'|'rental'|{primary,secondary,glow}`) and `setAlert(0..1)`.
- **world:** `world.sites = [{id, tag, x, z, r, indoor}]` using the MISSIONS §3 tags. The P1 plaza minimum is 3 lockers, 2 alleys, 2 rooftops, 1 warehouse, 1 park, 2 fountains, 1 market, 1 relay and 4 spawn_edges. Also Mara's kiosk and the billboard text hooks.
- **ui:** the panels contracts, warehouse, codex, results and settings; `ui.detect`, `ui.lens`, `ui.boss`; the ▲ EQUIP button on loot toasts (DESIGN §3).
- **audio:** `audio.vo(key)` must resolve immediately (returning false) when the file is missing.

## Gotchas and design decisions made
- Wren is gender-neutral and silent. Never gender Wren in lines. ("You're his child", not "niece".)
- Civilians cannot be damaged (the Harmony Aegis). This is a deliberate story clue and also simplifies the engine. Collateral is about breakable props.
- Shifts count **active** play only (24 min). Offline time never charges the rental fee.
- Renewal-day countdown = −1 per completed contract (not time), floored at 1 until A6-M1.
- The ark arrived 61 years ago; Landfall deferred 22,269 times (61 × 365 + 4). Keep these numbers consistent.
