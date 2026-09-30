P5 PLAYABLE
(gameplay agent P5, 2026-10-01: Acts 5–6 staged and bot-played mission by mission; Seraph + Dray multi-phase bosses;
Heir Core 4th skills; Walk as Yourself; both endings persist; epilogue; heirloom sets; Nightmare. Table in "P5
acceptance" at the bottom. P4/P3/P2a lines kept underneath for history.)

P4 PLAYABLE
(gameplay agent P4, 2026-09-30: Acts 3–4 staged and bot-played mission by mission; day/night + rain; heist/wetwork/T5/T11/T12;
informants; Breach set piece at 60 fps. Table in "P4 acceptance" at the bottom. P3/P2a lines kept underneath for history.)

P3 PLAYABLE
(gameplay agent P3g, 2026-09-29: Act 2 staged and bot-played in Verdant Terraces + the Arcology; P3 systems in; table in "P3
acceptance" below. P2a PLAYABLE line kept underneath for history.)

P2a PLAYABLE
(gameplay agent, 2026-09-27: acceptance table below; bot + headless checks, M5 metal, drivers in scratchpad `gameplay/`.)

## DEV MODE (D24) — for Aaron / testers only
- Add `?dev=1` to the game URL. Without it no file under `js/dev/` is fetched (verified: normal boot loads 138 js files, 0
  from js/dev) and there is no hint of it in the game. Dev play uses its own save (`heirframe.save.main_dev`).
- A gold **DEV** pill (top, next to the portrait) opens the panel: God mode (no damage, full energy, no cooldowns),
  One-hit kills, Speed ×1/×3, **Start point** (every district the world has: relays you there, player spawn), **Story
  checkpoint** (A1-M1 … A2-M5: completes everything before it through the sim, sets the level gate, a frame from L5,
  then takes the card), credits, Own all frames, Fill parts (prototype, auto-equipped), Level, Heat 0–5★.
- Straight into play, no clicks: `?dev=1&district=portside`, `?dev=1&mission=A2-M1`, both together, `&fresh` = new dev save.
  e.g. `http://192.168.0.236:8841/gms/3d/heirframe/?dev=1&mission=A2-M4`
- Code: js/dev/dev.js (UI, cheats, autostart); game.js only `import()`s it when `?dev` is present.

# gameplay notes (P2a "Own Your Frame")

Owns: js/game/*, js/main.js, js/engine/{player,camera,input,devpad}.js, js/sim/*, js/data/*, tools/sim/*, js/ui/*, css/*, js/audio/*, tools/vo/*, audio/vo/*, this file.

## DONE
- Frames: buy/swap/Mk via Warehouse → `js/game/frames.js` rebuilds the body (`createRobot({kind, tier})`) with a ~1.1 s beam-out/beam-in (player frozen, fx.beam + sparks + shake). `player.setActor()` in engine/player.js; everything reads `player.actor` now.
- Kits: `js/game/combat.js` (basic attacks: melee combos incl. Bulwark 3-hit + Wisp 2-hit backstab, Longarm auto-fire hitscan) + NEW `js/game/kits.js` (zap, overclock, sponsored, slam (+Aftershock/Magnetic), rocket charge, bulwark wall + taunt, scatter cone pellets, rail charge + pierce (+Overpenetrate/Quickcharge), drone turret (decoy/aggro), blink shadow-step behind target + decoy hologram (+Double Blink/Knife Decoy), veil cloak (see-through materials, enemies lose track), hack pulse (disable drones, convert a robot for 8 s)). Feel metrics recorded in `__game.runtime.combat.metrics[archetype]`.
- Enemies (`js/game/enemies.js` rewrite): decoy targets (addDecoy/removeDecoy), convert (ally), loseTrack (veil), taunt, telegraphed specials (stomp/crush/dash/lunge via sim chooseEnemySkill, red ground ring), multi-shot bursts, `brain` hook for boss scripts.
- UI: Warehouse tabs Skills (sync bar, skill list, sync-mod picker) + Market (6 parts, repair kits/jammer/decoy); Repair button on frame cards; repair-kit quick button in the action cluster (`ui.skills.kit(n)`, key R, event `kit`).
- `?skipintro` flag (fresh game straight to free roam; tests).

- Act 1 M2–M5: hand-built step templates in `js/data/story.js` (`steps`/`packs`/`target`, tags → sites, `at:N` reuses step N's
  site) built by `templateMission()` in js/sim/story.js; scripts in `js/data/story_a1.js` (new runner triggers `enter:N`,
  `done:N`, `shot:N`, `wave1`); new speakers tinsel/sal/thug/warden. A1-M4: discount on accept (`sim.grantFrameDiscount()`), step 0
  = Sal's lot (opens the Warehouse Frames tab), defend Mara's kiosk (3 waves), Big Kettle, Mara's "his stubbornness".
  A1-M5: hack the node under the statue → UNPERSONED card + Iris recording → forced 3★ Heat → survive 45 s → exfil at the relay.
  `sim.storyActCap = 1` (Act 2 cards hidden until P3); "Act 1 complete" sting after A1-M5.
- Big Kettle: `js/game/boss.js` (enforcer + copper KETTLE_PAINT stand-in, boss bar with 2 phases, boss music, steam venting,
  phase 2 at 50%: faster + dash + 3 Knuckles; yields and sits at 0 HP; lines a1_s10/s11 with subtitles). Story checkpoints:
  full repair before the boss and on redeploy; redeploy picks the safe point furthest from the fight.
- Runner rewrite (`js/game/runner.js` + NEW `js/game/steps.js`): hack (terminals in order, interrupt waves per terminal, pauses
  while taking damage, Ghost 2× speed), escort (NPC walks the path, stops for fights/for you, decoy target), defend (object HP,
  timed waves, synth waves for generated defends), bounty pings (search radius) + capture below 20% (+30%), sabotage machines,
  survive meter, T2 (decoy flees, real target spawns), T3 (rival riders hunt), T9 toast, fragile (3 hits), watched (Warden Eyes,
  spotted = +1 Heat), collateral/vip (breakable stalls; AoE/charge/rail break them → `sim.reportCollateral`). `ui.meter` (NEW,
  js/ui/combat.js) shows hack/defend/escort/survive progress.
- Heat 5 (`js/game/heat.js`): 1★ Warden Eye tails you, 2★ Warden pairs, 3★ hunting patrols, 4★ Enforcer squads, 5★ everything;
  hunters don't leash; stand down at 0★. Lancers from level 12. `sim.forceHeat()`; wardenKill heat 1→0.5.
- Board scope: `sim.setScope({archetypes, twists})` — P2a runs courier pest retrieve surveil bounty escort sabotage hack
  infiltrate transport defend assassinate; twists T1 T2 T3 T4 T6 T7 T8 T9 T10. `sim.makeContract()` test hook.
- Autopilot (`js/game/auto.js`): `&story=1`, `&frame=K`, `&frames=1`, `&storyat=a1_mN`, per-frame fighting (brawler skills,
  gunner kiting 9–13 m, ghost veil/shadow-step/backstab), dodges telegraphs, uses repair kits, buys the first frame when affordable.

- VO: 21 new clips (gen_vo.py, 0 QC flags): Warden radio barks (b_warden_heat3/4/5, eye, lost, clear in tools/vo/script.json)
  + Act-1 P1 lines (b_hira_ownframe, b_kettle_informant, b_mara_heat_02, b_mara_stealth, pa_renewal_80..50, rumours). PA random
  pool excludes renewal lines; `pa_renewal_N` plays as a milestone when renewalDays hits a multiple of 10. `audio.voKeys()` added.
- Heat semantics fix (sim): `heatStars = ceil(heat)` (a star lasts its full 3 min; 5★ used to vanish in one frame). HUD label
  by star count. `forceHeat(n)` sets n.
- Balance: balance.mjs runs with the P2a scope (`--all` for everything) + milestones Kettle / Act 1 / level 5. 10 seeds: Act 1
  66–96 min (target 60–100 ✓), first frame 39–66 min (median ~51, target 45–75; 2/10 seeds under 45), L5 35–55 min.
  test.mjs: 6 new P2a tests (kits, frame prices/discount/swap/mods, board scope, forced archetypes+twists+mods, Heat, pacing) → 21/21.
- P1 regression (speed 1, `?auto=1&contracts=3`, 915x412 DPR2 high): ok, A1-M1 + pest/courier/retrieve, L3, 684 cr, FR 18→45,
  0 console errors, 60.0 fps avg, p99 16.8 ms, max 17 ms, 0 hitches, max 278 calls.

- Feel metrics (real runtime, `?auto=1&frame=K&contracts=4&speed=2`, scratchpad feel.mjs): Brawler avg engagement 2.22 m
  (<3 ✓), Gunner 9.3 m (>8 ✓), Ghost backstab share 78% of melee hits / 93% of damage (>40% ✓; small sample, 18 hits).
  0 console errors in all three.
- Frames tour (`?auto=1&frames=1&contracts=1`, tour.mjs): buys Bulwark 1,500 / Longarm 12,000 / Wisp 50,000, swaps and plays a
  contract with each → ok. Swap transition measured 0.36–0.68 s wall at speed 2 (≈0.7–1.4 s game time; < 3 s ✓).
- Fixes from the bot runs: bot only counts a frame bought if it really is; clears hunters before opening the (jammed)
  Warehouse; the 1★ tail Eye no longer escalates Heat (DESIGN: it only watches); riot shields block half as much of a carbine
  burst (`frontalScale` opt in resolveHit) so Longarm isn't walled by Wardens; heat changes logged (`heat N★`).

- P2b hookups (NEW `js/game/districts.js`): Transit Relay interactable → destination picker → `world.relayTransition`; contracts
  in another district ride the relay before they start; swap cleanup (strays + loot cleared, nav rebuilt, runner site index
  reset, `sim.setSites`, player to the relay, ambience/emitters per district); save resumes in its district. A1-M3 now plays in
  the real Brightline (verified). Big Kettle uses `boss_kettle` (+ `steam()` in phase 2); A1-M4 stays at Mara's kiosk in Aurum
  (STORY canon). `world.breakables.splash` is hit by the same AoE splash as mission stalls → collateral.
- `setSupportedRobotKinds(robots.ROBOT_KINDS)` at session start: scrap rats were rendering as Warden drones (sim's default kind
  list lacked `scrap_rat`); now real rats and boss_kettle.
- Warehouse `openWarehouse(tab)` now really opens that tab (panel state kept the old tab). Title version "P2a · Own Your Frame".
- Rustkin packs gated to level 18 (they rolled into level-2 pest jobs). Warden Eyes no longer add wardenKill Heat.

## Acceptance (P2a, BUILD_PLAN §P2 minus Brightline look)
| item | result | evidence |
|---|---|---|
| Buy all 3 frames 1,500 / 12,000 / 50,000, swap in the field < 3 s | PASS | tour.mjs: bought + one contract each; swap 0.7–1.4 s game time; test.mjs prices + 30% A1-M4 discount |
| Full kits, distinct feel | PASS | feel.mjs: Brawler avg engagement 2.22 m (<3), Gunner 9.3 m (>8), Ghost backstab 78% of melee hits / 93% of damage (>40%) |
| Sync mods (sync 5), 6 slots + loot, Mk II | PASS | Skills tab mod picker; sim patches (test); 6-slot loadout existed; Mk II gate L10+sync4 (test), Mk II visuals from art |
| Act 1 M2–M5 + story beats/VO/codex | PASS | storyat runs for each; `?auto=1&story=1` path; codex Wren/parents/Mara/Vael silhouettes (ui_codex shot) |
| Big Kettle boss, bar, music | PASS | boss.mjs: boss_kettle, 2-phase bar, adds, yields; bot beats it (dies 3–4× first: it doesn't dodge well) |
| bounty/escort/sabotage/hack; fragile/watched/reinforced/collateral/vip; T2/T3/T9 | PASS | arch.mjs forced runs + test.mjs forced contracts; T3 rival riders can wreck a Mk I Brawler bot (design) |
| Heat to 5 with Wardens and Enforcers | PASS | A1-M5 run: 2★→3★→4★ squads logged; test: 5★ holds; Lancers from L12 |
| Market + repair kits; Family Tree v1 | PASS | Market tab (6 parts + supplies), kit button (R) used by the bot; codex tree shot |
| VO | PASS | all P0 Act-1 clips existed; +21 clips (warden radio, Act-1 P1 lines), 0 QC flags |
| Balance: Act 1 in 60–100 min, first frame 45–75 | PASS (median) | 10 seeds: Act 1 66–96 min; first frame 39–66 (median ~51; seeds 1 and 8 at 39/42) |
| P1 green | PASS | reg2: speed 1 `?auto=1&contracts=3` ok, 60.0 fps, p99 16.8, max 33 ms, 0 hitches, 293 calls, 0 console errors; perf 8 enemies high 1280x720 60 fps / 237 calls, med 915x412 60 fps; test.mjs 21/21 |

## Known issues / NEXT (P2c)
- Drop-pod swap not used: pod land+open is 3.7 s, over the < 3 s swap target. Option: pod lands behind the beam-in as a
  cosmetic follow-up, or art shortens `land` to ~1.5 s.
- Bot pilots are weaker than people at bosses (no kiting/dodging timing); Kettle TTK for a human Mk I ~60–75 s (estimate).
- Twists T5/T11/T12 (choice twists) and archetypes tail/repo/race/rescue/heist/wetwork are scoped off (`sim.setScope`) until P3.
- Act 2 story cards hidden (`sim.storyActCap = 1`); "Act 1 complete" sting points at the next update.
- First-frame lower tail (2/10 seeds < 45 min) comes from fast L5 seeds; levers: bounty/assassinate XP multipliers.
- The market prices look cheap next to credits at L7 (101–403 cr for Tuned/Custom); ECONOMY review.

## Requests (art / P2b world agent)
- `boss_kettle` (enforcer with a boiler-tank back, copper/brass; steam vent socket on the back would be lovely). Until then boss.js
  spawns `enforcer` with a copper paint object (KETTLE_PAINT) at scale 1.18. I'll swap the kind when it lands.
- Mk I–II visual tier differences for brawler/gunner/ghost (tier 0 vs 1): gameplay passes `tier` on Mk upgrade and rebuilds the body.
- Drop-pod courier drone: `createDropPod()` land/open/leave. Gameplay's swap (js/game/frames.js `deploy`) is a 1.1 s beam-out/in
  now; I'll call the pod when it exists (target: the whole swap < 3 s).
- `world.breakables`: gameplay has its own mission-scoped breakables (js/game/props.js `breakable()` + `splash(x,z,r,dmg)` →
  `ctx.onCollateral(value)`); if world ships permanent ones, please expose `damage(x,z,r,amount) → [{value}]` so the same
  splash can hit them.
- Relay: gameplay will call `world.relayTransition(toId)` from the relay interactable and on Brightline story cards.

## Gotchas
- `patchSkill` already applies `baseMult` to `base`; don't multiply again at runtime.
- Test driver scratchpad `gameplay/` (smoke.mjs, kits.mjs, arch.mjs <archetype> [twist] [mods] [frame], esc.mjs). CDP port 9311
  (`cdp start --port 9311 --idle 1800 -- --use-angle=metal`; the default idle-kill is 300 s).
- sim `setHeat(n)` is a float: n.0 decays to (n-1)★ within a frame. Use `forceHeat(n)` (n + 0.95).
- Enemy `e.brain(e, dt, info)` runs before the generic AI; return true only to take over movement.


# P2c + P3g (gameplay agent P3g, 2026-09-27)

## DONE (P2c)
- First-frame lower tail: `BALANCE.xpLevelMult {4: 1.5}` (the licence level 4→5 takes 1.5× XP; ECONOMY §2 formula otherwise).
  12 seeds: first frame 42–68 min (median ~58), 1/12 under 45 (seed 8, 42: its L5 lands on a story XP chunk); Act 1 73–96.
  test.mjs 21/21. **Planner/manager:** ECONOMY §2 table's xpNext(4) is now ~345, not 230.
- Market prices reviewed: they already equal ECONOMY §4 (`60 × L × {1,2,4,10}`, Sal's relic `600 × L`). Kept (D11); the
  "cheap at L7" worry is by design (~6 min of income for a Custom). Nexus rep tiers will discount them (P3 vendor pricing).
- Big Kettle: hp 55→40, dmg 9→6.5; new tell + punish window: the boiler hisses (`steam()`) when he winds up a stomp/charge,
  and after a stomp/blast he vents 1.8 s (stands still, takes +30%). Steam also on a timer, below 20% HP, phase 2 (real
  `boss_kettle.steam()`; the enforcer stand-in fakes it). Bot runs (speed 2, storyat=a1_m4): Gunner 77 game-s 0 deaths,
  Brawler ~75 s of fighting + 1 death (the bot face-tanks). Driver: scratchpad `gameplay/boss2.mjs <frame>`.
- District swap cleanup via `world.onDistrict` (js/game/districts.js `cleanup`): all enemies + decoys, loot collected,
  mission props, breakables rebound, boss ended, heat responders reset, combat reset, nav rebuilt, runner sites re-indexed,
  `sim.setSites`, ambience/emitters (names + beds for terraces/arcology/arcology_servers).
- Breakables in combat + loot (js/game/props.js): tap a crate/vending/holo to target and smash it; melee swings clip any in
  their arc; area skills as before; enemy stomps/blasts break them too (no collateral). Breaking one by the player = collateral
  on a contract + a small credit drop (value/12 × L); vending machines 15% drop a repair kit (`sim.grantConsumable`).
- First frame delivery uses the drop-pod (js/game/frames.js `podDelivery`): pod lands 3.2 m in front (1.5 s), opens (0.6 s),
  the rental beams out and the new frame beams in at the pod door; the pod leaves 0.9 s later. Later swaps: plain beam.

- Pod + breakables verified headless (pod.mjs: land→open→beam-in at the pod door, pod picked to screen-right so it's in
  frame, drone hidden once it climbs past 8 m so it never fills the camera; brk.mjs: vending smashed in Brightline, +5 cr).
  Level-up sting shows feature descriptions ("Brightline Boulevard"), not ids.

## DONE (P3 archetypes) — all 16 non-heist archetypes are in the runtime scope (`RUN_ARCH` in game.js, = balance P2A_ARCH)
- tail (steps.js): target strolls via 2 stops to the meeting site, glances back at stops; suspicion meter over its head
  (too close <5 m, or in its view while it looks back); distance band (`ui.band`), lost after 8 s beyond 22 m; made = fail.
- race: 3-2-1-GO, beacons on the next two checkpoints, 2 rival riders run the course at ~par×0.8–1.05, place shown in the
  meter; 1st = `raceFirst` (+50%) through finishContract.
- repo (capture): the deadbeat can't be wrecked (`e.noKill`), runs and blinks away when you close in, slumps below 20% →
  "Capture the frame". rescue: the hostage sits cuffed (not a target) until the hack frees it, then escort + evac defend.
- assassinate: at `fleeAt` the target runs for its car (red beacon); reaching it = "The target got away".
- Autopilot: tail (hang back ~9 m), capture interact. arch.mjs runs (Brightline, L7): tail ok, race ok (1st), repo ok,
  rescue ok, assassinate ok (FLEE=1 forces the flee). test.mjs 21/21. Runner guard: a step that fails the mission mid-update.

## DONE (Act 2 staging, first pass — being bot-verified)
- Sim: `arcology_servers` (B4) is a sim district (unlocked by A2-M2 with arcology). story.js templates now take `site:` (the
  world's named place, tags as fallback), escort `path: [{site|tags}]`, tail `end:`, `npcs:`, packs `atPath`.
- js/data/story.js A2-M1…M5 hand-built: M1 escort Fenn garden→glasshouse (vt_memorial_garden, vt_npc_fenn; 2 sweeper
  ambushes), M2 B4 infiltrate (as_archive_core, stealthy, memory-shard card + Tomas VO), M3 tail the gold frame to ax_lift
  + photo the meeting, M4 heist ax_vault_evidence → Halloran boss after the pickup → Seraph scene → exfil, M5 defend the
  glasshouse (protect Fenn, 3 waves) → R2 reveal, Dray PA, Fenn shut down. Scripts: NEW js/data/story_a2.js (merged into
  SCRIPTS/SPEAKERS by story_a1.js; speakers tomas, voice).
- game.js: storyActCap 2; story cards unlock their own district and are rebuilt with the real sites on accept; lift pads
  (`id:'lift'`) → districts.lift → world.liftTransition, player at spawnPoints.lift (not during contracts); seraphScene()
  (seraph tier 3 drops 16 m, two hits to 1 HP, hums a2_s04_seraph_02, flies off); fennDown; Act 1/Act 2 end stings.
- boss.js: SCRIPT.halloran (lines a2_s04_halloran_01/02, adds 3 Wardens at 60%, speaker halloran); only Kettle vents.
  enemies.js `halloran.robotKind = 'boss_halloran'`; winged kinds (seraph/flying) hover 1.8 m.
- sim: killing a story mission's Wardens adds no Heat (A2-M1 went to 5★ and squads killed Fenn in a loop).
- Autopilot: storyat/gates for a2_m1..a2_m5, `storyend=` (default a2_m5). Driver scratchpad `gameplay/story2.mjs <id>`.
- Not done (world-owned, noted for the manager): fewer civilians in B4 (crowd.js/tier.crowd are world files).

- Bot runs: A2-M1 ok (Fenn now elite-rank HP; he went down twice before), A2-M2 ok (ghost), A2-M3 ok (tail: 4 s grace,
  sight 11 m, a checkpoint puts the target at its next stop), A2-M4 ok (Halloran hp 90→22, dmg 18→3.5, shield 60→25,
  frontalDR 0.6→0.35: was a 450 s fight that two-shot a L15 Mk I; gunner bot now 1 death, brawler bot 2–3 face-tanking),
  Seraph scene screenshot-checked (lands on walkable ground to screen-right; Wardens scatter).

## IN PROGRESS
- D24 dev mode DONE (see top; phone 915x412 touch taps on the pill + God mode verified; start points portside/home/stacks/
  aurum; story jump a2_m4 with clues C01–C08). Title Settings panel checked on top (manager's z-index 20 kept).
- A2-M5 bot run ok (glasshouse defend, R2 beats, Fenn shut down, Act 2 sting). Act 2 VO generating (gen_vo.py --max-p P1
  with the 16 a2_* keys; log scratchpad vo_a2.log).
- P4 cheap wiring DONE: district names/ambience/emitters for portside/stacks/home; Stacks `home` door ↔ Home `door`
  (liftTransition; arrive at Home's player spawn / the Stacks' `home` spawn outside the hostel); Home bed = sleep to the next
  shift (card + full repair), codex/family_tree → codex panel, trophies → stats toast, warehouse → Warehouse; minimap skips
  `m.off` crowd. Not yet: Rook NPC, setCull (A4-M2 staging, P4).
- P3 rep + vendors DONE: `sim.vendorMul(faction)` (Hated +10%, Hostile +5%, Friendly −2%, Trusted −4%, Honored −6%) on Sal's
  market, supplies and frame licences (Nexus); repairs −25% at Concord Friendly+. Market tab shows a Standing list (tier +
  value per faction) and the discount; results card lists rep changes and tier changes. Rival pairs already in the sim.
- P3 Fabricator DONE: Recalibrate box in the Fabricator (per-affix Reroll, locks to the first affix rerolled, cost, locked
  under L8) → `warehouse:recal` → sim.recalibrate; salvage-all and tune pity (+10%/fail) already existed. Fixed duplicate
  "scrapAlloy · Scrap Alloy" cost labels. DEV pill dims while a panel is open.
- P3 relics: runtime hooks for the ones the sim couldn't do alone: Afterimage (dodge leaves a 2 s decoy), Phantom Step
  (enemies you roll through are marked 4 s; next melee hit on them is a backstab), Reactive Plating (shield break → 4 m
  knockback, 10 s cd), Stillwater (Veil drains at half speed while standing still). The other 8 were already in sim/stats.
- P3 Crackdown (sim): danger ≥ 8 after a contract → 2-shift crackdown, 3 champion bounty cards (badge Crackdown, ×1.5 pay,
  re-posted on board refresh until taken), sting; runtime keeps Heat ≥ 1★ (Eye sweeps) in that district between contracts.
- P3 Echo: clue sting "Echo found · name" (was the raw id); E04/E06 also drop in B4. Hostile threat verified (L10, +2
  levels). Custom+ caches and relic uniques 1–12 were already in the sim.
- Act 2 VO: 16 clips (a2_s01…a2_s05, Fenn/Tomas/HIRA/Halloran/Seraph/Dray) via gen_vo.py --max-p P1, 0 QC flags.
- test.mjs 25/25 (+4 P3 tests: 16 archetypes × 3 districts validate, rep vendor pricing, Crackdown, Act 2 missions).
- Balance (balance.mjs 7 h, seeds 1–3): first frame 48–58 min, L5 48–51, Act 1 1.2–1.5 h, second frame 3.3–4.2 h,
  L15 3.7–3.8 h (target 3.4), L20 5.3–5.5 h (5.5), first Relic 4.5–6.4 h (3–5; seed 3 is +28%).
- Tail robustness: grace also pauses "losing" the target; NPC walkers wedged 3 s hop to their next route point.
- Sweep 1 (bot, L12, speed 2; sweep.txt): terraces 13/16 complete (tail lost once, defend failed once, rescue timeout);
  arcology courier/pest/…/hack ok, escort failed once; the rest timed out because headless Chrome hit the cdp helper's
  1 h hard cap (not a game fault). Re-running the failures + the rest next.
- P5w/5b world requests DONE: `passage` interactables (story-gated via `it.story`: open once that story mission is done or
  current) → liftTransition to the paired spawn (spine>hullside airlock, hullside>spine firmament, hullside>meridian dock,
  meridian>hullside spur); names/ambience/emitters for spine (warehouse bed, turbines, coolant falls), hullside/meridian
  (vacuum: no bed; meridian creak), helm (choir hum at (0,-76)); movement flags: magBoots = ×0.88 speed + heavy, slower
  steps; vacuum = steps at 30% volume (no jump exists, so gravity/zeroG have nothing to drive yet); `halo_drone` enemy
  (voices, flying striker, e_zap); `?shot=` presets only teleport in Aurum. Rook stands at st_npc_rook in the Stacks
  (districts.js RESIDENTS): rumours + Clean Slate (150×L cr, wipes Heat).
  Not yet (need the Act 4–6 story staging): hide meridian core on pickup, seraph/dray setPhase, helm.setMode, setCull.
- Sweep 2 + reruns: terraces 16/16 complete (tail, defend and rescue on re-run); arcology 16/16 complete at least once
  (escort/rescue after escortees got veteran HP; repo ok; defend completes with the Brawler bot, the Gunner bot fails it
  in the arcology because it kites out of line of sight). Fixes from the sweep: escortees/hostages spawn at veteran rank,
  defend objectives have 2× HP and take half damage (two Wardens broke one in ~10 s), sentry turrets in a defend wave
  become Wardens (static turrets can't walk in from the edge).
- P1 regression (reg.mjs, speed 1, `?auto=1&contracts=3`, 915x412 DPR2 high): ok, 60 fps, p99 16.8 ms, 0 hitches, max 300
  calls, 0 console errors. test.mjs 25/25.

## P3 acceptance (BUILD_PLAN §P3)
| item | result | evidence |
|---|---|---|
| Verdant Terraces + Nexus Arcology (world P3w) wired | PASS | relay/lift travel, names/ambience, B4 as a sim district, residents |
| Act 2 A2-M1…M5, Halloran, Seraph's first appearance | PASS | story2.mjs bot runs each mission (gunner/ghost/brawler); Seraph scene screenshot; 16 VO clips |
| rep tiers, vendor pricing, rival pairs | PASS | sim vendorMul/repairMul + test; Market Standing list; results rep lines; rivals in sim |
| archetypes tail/infiltrate/transport/defend/repo/race/assassinate/rescue | PASS | runtime steps + 16×3 districts sweep (caveat: arcology defend with the Gunner bot) |
| all 16 non-heist archetypes generated + completable across 3 districts | PASS* | test.mjs (valid ×3 districts) + sweeps; *see caveat above |
| full Fabricator (recalibrate, salvage-all, pity) | PASS | Recalibrate UI + wh.mjs tap test; salvage-all/pity existed |
| Relic uniques 1–12, Custom+ quality | PASS | 8 in sim + 4 runtime hooks (afterimage, phantom_step, reactive_plating, stillwater); cache rules |
| Hostile threat, district danger + Crackdown, Echo clues | PASS | L10 unlock, +2 lvl; Crackdown test; Echo sting |
| codex fills R1–R2 | PASS | after A2-M5: Dray + Tomas complete, Iris rumoured (R4 later), C01–C10 |
| sim 1–20 within ECONOMY §9 (±20%) | PASS* | L15 3.7 h (+9%), L20 5.4 h, 2nd frame 3.3–4.2 h; first Relic 4.5–6.4 h (seed 3 +28%) |
| choice twists T5/T11/T12 | not in P3 | BUILD_PLAN puts them in P4 (wetwork) |
| P1 VO (non-Act-2 barks) | partial | Act 2 story VO done; the other VO_LINES P1 barks not generated yet |

## NEXT (P3)
- rep tiers/vendor pricing/rival UI; Fabricator (recalibrate UI, tune pity); relic hooks (afterimage, phantom_step,
  reactive_plating, stillwater, kinetic_battery); Hostile threat check; danger/Crackdown; Echo.


# P4 "The Sky Is a Screen" (gameplay agent P4, 2026-09-30)

## Checkpoint 1
- DONE: read-in; VO for Acts 3–4 generating in the background (gen_vo.py --max-p P2 + 21 new keys in tools/vo/script.json:
  Kettle/Halloran informant lines, Jun comms, PA night/dawn, Mara night, HIRA home). Log: scratchpad vo_p4.log.
- IN PROGRESS: Act 3–4 story staging (js/data/story.js steps + NEW js/data/story_a3.js / story_a4.js scripts).
- NEXT: day/night + rain, heist/wetwork/T5/T11/T12 runtime, dev jump banner fix, B4 crowd count.

## Checkpoint 2 (after the usage-limit reset)
- GREEN: boot + smoke (`auto=1&contracts=1&speed=2`: A1-M1 + pest, 0 console errors), `node tools/sim/test.mjs` 25/25.
- DONE: VO 39 clips (18 Act 3–4 lines, pa_curfew_01, pa_renewal_40..1, b_rook_open_01, 16 new barks), log vo_p4.log.
- DONE: Act 3–4 step templates (js/data/story.js), scripts js/data/story_a3.js + story_a4.js (merged in story_a1.js);
  sim/story.js template gained hackSites / snap / race checkpoints / destroy objs / pack `site:` / numeric `bossAt`,
  `m.night`, `m.story.after`; new step type `snap` (sim STEP_TYPES + validator); story runs now queue (game/story.js)
  and beats can carry `when: {maraTone}`.
- IN PROGRESS: runtime for the new beats (snap step, cull, Halloran, harmonyIris, joinJun, post-mission scenes
  home/breach), storyActCap 4, choice from the open contract.
- NEXT: day/night + rain, heist/wetwork/T5/T11/T12, dev jump quiet + ToD control, B4 crowd, informants, lattice.

## Checkpoint 3
- Bot runs (story2.mjs, gunner, speed 2): A3-M1 ok · A3-M2 ok · A3-M3 ok (choice.mjs: confession → choice → the `cold`
  line only; `maraTone` persists through save + Continue) · A3-M4 ok · A3-M5 ok (Choir Warden ~70 s, 1 death) · A4-M1 ok
  (→ Pod 4471 scene) · A4-M2 ok (Halloran stands her squad down, cull on/off, Rustmother ~90 s, 0 deaths) · A4-M3 ok
  (snap step: 4 countdown boards; the camera turns and tilts to frame each board) · A4-M4 ok. A4-M5 next.
- Boss retune (js/data/enemies.js, same share per hit as Halloran): choir_warden hp 110→28 dmg 22→3.8 shield 90→30;
  rustmother hp 160→30 dmg 24→4; spine_keeper_boss hp 120→75 dmg 26→4.5. With the listed bases the bot died 20× in 4 min.
- runner goto radius cap 10→12 (A4-M4 control room: the bot wedged on the doorway corner; its goto radius is 11).
- Dev jump + autopilot storyat: `G.quiet` mutes level-up stings/sim toasts while fast-forwarding (the stale LEVEL N queue).
- B4 crowd `count: 10` (nexus.js). night/rain modifiers: unlock 12, only in `sky: true` districts (aurum, brightline,
  terraces, portside) via rollModifiers(…, district). Runtime for them is next (day/night).

## Checkpoint 4
- A4-M5 Breach ok by bot: Spine Keeper ~75 s, then the set piece: out through the airlock onto the hull, a 9 s camera
  move from the player's face to a wide over the plating with Verdance filling the frame, HIRA/Jun lines, REVELATION card.
  **60 fps, 43–55 calls** through it (M5 metal, 915x412 DPR2 high; breach.mjs). HUD, marker and interact prompt hidden.
- NEW js/world/lattice.js: the Firmament from behind (hex sky panels back-lit, flickering/dead cells, the sun-lamp in a
  gantry ring, the moon as a scanline feed), in the Spine's north lattice. 4 draws; spine look-up 67 calls, 60 fps.
- Day/night + rain DONE: NEW js/game/daynight.js (a shift = one day, starting 06:00:00 exactly; dusk 19–20:30, night to
  05:00, dawn done at 06:00; ~1 shift in 3 has Harmony's scheduled rain 14:00–16:00; After Dark / Rain modifiers and
  A3-M3 force their sky for the job; detection ×(1−0.35 night)×(1−0.2 rain) under open sky; PA pa_night_01 / pa_dawn_01 /
  pa_weather_01 on the hour). World side: `world.setSky({night, rain})` + `world.sky` in world.js (light/fog/env
  intensity/exposure/shadow intensity + sky shader uNight/uRain: stars, city glow, the moon keeps its phase), NEW
  js/world/rain.js (1 draw, camera-following streaks). Cost: Aurum noon 143 calls → night 145 → rain 145, 60 fps; Portside
  147–148. Interiors and space ignore it. Dev panel: Time of day (Live / 06 / 12 / 18 / 19:30 / 21 / 00, Rain auto/on/off).
- NEXT: heist/wetwork + T5/T11/T12 runtime, Lethal check, informants (Kettle/Halloran residents), regressions.

## Checkpoint 5
- Heist + wetwork in the runtime scope (RUN_ARCH 18), twists T5/T11/T12 (RUN_TWISTS all 12). Heist "case the vault" =
  a photo of the vault site (runner vaultMark). T5/T12: the target can't die before its twist (noKill until fired); at
  50% (T5) / 30% (T12) HP it sits down, the runner catches up to the kill step, and the choice step follows; outcomes
  kill/finish (dies), spare (beams away, 60% pay +Unlinked), bribe (fails at 80% pay). T11 = the sim's pay/rep choice
  (switch ×1.2, −5 client rep): no objective flip. arch4.mjs (L18, gunner): heist ok, wetwork T5 kill/spare ok, T12
  finish/bribe ok, sabotage T11 switch ok, defend T11 stay ok, sabotage T6 (+2★, survive/exfil) ok. `&choice=N` makes
  the autopilot pick option N.
- Lethal threat (sim, L25): setThreat ok, board at Lethal ok; Black cards appear at 3★ (checked in node).
- Informants: Big Kettle (Aurum, npc_boulevard, after A1-M4): once per shift a free board turnover + a tip line;
  Halloran (Arcology offices, after A4-M2): once per shift −2★ Heat. inf.mjs: both ok. Residents gate on `after`.

## P4 acceptance (BUILD_PLAN §P4)
| item | result | evidence |
|---|---|---|
| Act 3 A3-M1…M5 (Freehaul, Ward Records, Quill, Signal to Noise, Harmony/Iris) | PASS | story2.mjs each ok (gunner bot, speed 2); VO for every VO_LINES line |
| Mara's choice persists `maraTone` | PASS | choice.mjs: confession → choice → only the matching line; `cold` survives save + Continue; `&choice=1` = warm |
| Act 4 A4-M1…M5 (Pod 4471, Culling Hour + Rustmother + setCull + Halloran, Stuck Clock, Waterfall's End, Breach) | PASS | story2.mjs / breach.mjs each ok |
| Breach set piece ≥ 45 fps | PASS | 60 fps, 43–55 calls through the whole scene (M5 metal, 915x412 DPR2 high) |
| Day/night (24-min shift, sun at exactly 06:00), rain, night/rain modifiers | PASS | tod.mjs Aurum/Portside 12/19:30/00/rain: 60 fps, +2 calls; modifiers roll in open-sky districts from L12 |
| Black contracts, heist, wetwork T5/T6/T11/T12, Lethal | PASS | arch4.mjs runs (both branches of T5/T12/T11); node: Lethal board + Black at 3★ |
| Kettle + Halloran as informants | PASS | inf.mjs |
| Dev checkpoints for the new missions; no stale banners | PASS | devjump.mjs: A3-M1 L18, A4-M4 L32 exact, no queued LEVEL stings |
| Normal boot fetches 0 js/dev | PASS | 147 js, 0 from js/dev |
| P1/P2/P3 regressions | PASS | test.mjs 25/25; smoke ok; reg (speed 1, contracts=3, NOSHOT): 60 fps, p99 16.8, max 17 ms, 0 hitches, 262 calls; perf 1280x720 high 8 enemies 60 fps / 204 calls; story2 A1-M4 + A2-M5 ok |
| Acts 3–4 end to end in one bot run | not done | each mission bot-played from its checkpoint; a single run needs ~16 levels of contracts between gates |

## Known / decisions to review
- A4-M3 "four districts" became four countdown boards on Brightline (Jun's archive covers the rest). The snap step turns
  and tilts the camera to frame each board (the default pitch hides anything 2 m up at 8 m).
- Act 3–4 boss bases cut hard (see Checkpoint 3) so they match Halloran's share per hit.
- A3-M2 plays in B4 (arcology_servers), not the lobby: the Wards registry is on the archive floor.
- T11 is a pay/rep choice only; the objective does not flip sides.
- Night covers ~40% of a shift (19:00–06:00 with ramps). If the S22 night look disappoints, `nightAt` in daynight.js is the knob.
- reg.mjs's screenshot every 30 polls causes 170 ms hitches every 60 s: harness, not game (NOSHOT=1 run is clean).
- Brightline Apartment not built (DESIGN sells it after Act 4). Act 5 cards stay hidden (storyActCap 4).
- Hullside has no lattice view from outside; the lattice lives in the Spine's north bulkhead (js/world/lattice.js).


# P5 "Hullside" + "Heirframe" (gameplay agent P5, 2026-09-30)

## Checkpoint 1
- GREEN: smoke (`auto=1&contracts=1&speed=2`: A1-M1 + courier, 0 console errors), `node tools/sim/test.mjs` 25/25.
- DONE: read-in; VO for the 17 VO_LINES Act 5–6 lines (gen_vo.py --max-p P2, 23 made incl. choir barks; log scratchpad
  vo_p5a.log). Act 5–6 step templates in js/data/story.js (sites from the P5w districts; pack units take an optional 4th
  name; grants.heirloom), enemy defs `jun_eva` (A5-M1 escortee) and `seraph_watch` (A5-M4 scan target).
- IN PROGRESS: scripts story_a5.js / story_a6.js, sim (choices, heirloom grants, heir core auto-equip), runtime (Seraph /
  Dray boss scripts, heir skills, set hooks, human walk, endings + epilogue), storyActCap 6.
- NEXT: bot runs per mission, VO extras, Nightmare check, regressions, perf.

## Checkpoint 2
- DONE: scripts js/data/story_a5.js + story_a6.js (merged in story_a1.js; speakers elena/choir/helm); VO +22 clips
  (tools/vo/script.json: Act 5–6 comms lines, Iris fade/frame, Mara epilogue cold/warm, Helm, Dray, `pa_renewal_today`;
  log vo_p5b.log). storyActCap 6, title "P5 · Heirframe", act 5/6 stings.
- DONE sim: completeStory stores every STORY_CHOICES key made in the contract (irisFate); family-tree node with no story
  clues is complete once revealed; grants.heirCore auto-equips on the active frame's core slot; grants.heirloom (set id or
  'frame') rolls that set's missing piece (loot.rollHeirloom `set`). test.mjs 27/27 (+2 P5: build/validate; whole story
  through the sim → Heir Core + Starfall, 3 Iris's Lens + 1 Lyra's Wake, ending/irisFate survive reload, every node
  complete, Nightmare board at L40). Falsified: removing the choices fix fails the test.
- DONE runtime: NEW js/game/finale.js (Walk as Yourself human body swap + 0.55× speed + no combat; Seraph flies off after
  the A5-M4 scan; five Voices beam out; world state re-applied on every district load: Meridian core hidden, Helm mode
  by ending, warm epilogue billboards on surface districts; epilogue scene in Aurum). boss.js multi-phase Seraph (setPhase
  1→2→3, 2 angel adds, cracked slow, spares once per phase, yields as Lyra phase 4) and Dray (Harmony strikes: gold ring
  1.4 s telegraph then 12% if still inside; 7 halo drones shield him to 20% damage while ≥3 live; Iris unlink phase;
  helm.setMode harmony/dray/iris). Heir skills in kits.js (Titanfall leap-quake, Starfall 12 lances, Eclipse slows all
  enemies in 30 m to 25%). Set hooks: Aurel's reflect, Lyra's blink reset + free veil at 0 Heat, Iris's turret copies.
  Lyra/Mara residents after A5-M5 / A6-M5. holo.js billboards gain a warm 'epilogue' key.
- Bot: A5-M1 ok, A5-M2 ok (gunner). IN PROGRESS: A5-M3…A6-M5 batch (p5batch.sh).

## Checkpoint 3
- Bot runs (story2.mjs, gunner, speed 2, gearless frame at the gate level): A5-M1 ok · A5-M2 ok · A5-M4 ok · A5-M5 ok
  (Seraph ~200 game-s incl. 2 wrecks to her angel → hp 32→24, 1 angel add) · A6-M1 ok · A6-M2 ok · A6-M3 ok · A6-M4 ok
  (walk as human, 0.35× speed now) · A6-M5 ok end to end (Dray 354 game-s with 2 wrecks → hp 38→28, drones weaker,
  voice shield 20%→30%). A5-M3 failed: defend waves spawned early as guards (pack site = next step's site); runner fix
  (packs of a defend step wait for that step; also helps A4-M2) + Choir Angel dmg 26→20, lighter waves.
- Dev: "Post-game" section (ending open/keep → all missions done through the sim), Level 40/50 buttons. Act 5–6
  checkpoints appear automatically (storyActCap 6).
- NEXT: boss re-measure (p5b3.log), reload/softlock driver (reload.mjs), epilogue screenshots, regressions, perf.

## Checkpoint 4 (after the classifier stall; coordinator pushed checkpoint 3)
- DONE: closing beat queued directly (no setTimeout, so busy stays up through Mara's line); theEnd fires once (the
  closing action); epilogue travel is soft (`via: 'dev'`), so Heat can't lock the ending out. test.mjs 27/27.
- DONE: reload.mjs (dev jump → play 6 s → save → reload into the dev save) at all 10 Act 5–6 checkpoints: 10/10 resume
  the story contract with a live objective, 0 console errors.
- IN PROGRESS: Dray re-measure + story2 regressions A1-M4 / A2-M5 / A4-M2 + Brawler boss runs (p5b5.log).
- NEXT: p5perf.mjs (Dray phase 2 + 7 drones, high), epi.mjs (both endings: shots + reload), normal boot 0 js/dev.

## Checkpoint 5
- Dray re-tune: armor 50→30, dmg 3.5, drones halve their damage and guard close (keepRange 3.5, so a Bulwark can
  reach them), the Helm strikes stop once the drones are out. Bot (gearless, speed 2): Gunner 176 s / 1 wreck,
  Brawler 181 s / 2, Ghost 386 s / 6 (the backstab bot vs a boss that turns: known weakness, like P3's Gunner defend).
  With the Heir Core the Gunner bot kills Seraph in 81 s with 0 wrecks (Brawler 220 s / 2 without it).
- Boss bar label bug fixed (js/ui/combat.js): "Phase 1 / N" showed for the first two phases (`bs.phase || 1`);
  now phase + 1. Affects every multi-phase boss.
- Story jumps (dev checkpoints, autopilot storyat, dev post-game) skipped finishContract, so no Heir Core: new
  `sim.installHeirCore()` (A5-M2's grant uses it too).
- Endings (epi.mjs, both branches): Dray down → Helm "OPEN/KEEP" → Iris fade/frame → results → Aurum Plaza epilogue
  card, warm billboards ("A BRIGHTER FUTURE — TOGETHER. FOR REAL THIS TIME."), Harmony line, Mara's closing line by
  maraTone, "HEIRFRAME" sting; save + reload + Continue keeps {ending, irisFate} and the epilogue billboards.
  Shots: scratchpad gameplay/p5_end0_*.png, p5_end1_*.png.
- Perf: Dray phase 2 + 7 drones (8 enemies), high: 1280x720 60 fps p95 16.8 ms, 153 calls, 228k tris; 915x412 DPR2
  the same (p5perf.mjs).
- smoke.mjs had vanished from the scratchpad (not by me); recreated from the same source.

## P5 acceptance (BUILD_PLAN §P5)
| item | result | evidence |
|---|---|---|
| Acts 5–6 story missions in spine / hullside (low g) / meridian (zero-g) / helm | PASS | story2.mjs: A5-M1…A6-M5 each ok from its checkpoint (gunner); test.mjs builds + validates all 10 |
| Full story playthrough by bot through dev checkpoints + each boss | PASS | per-mission bot runs above; sim test runs A1-M1 → A6-M5 end to end; Seraph and Dray with Gunner/Brawler/Ghost |
| Heir Core + 4th skill per frame | PASS | A5-M2 installs it; Titanfall / Starfall / Eclipse in kits.js; sim test: Gunner gets Starfall |
| Seraph multi-phase → freed Lyra (phase 4) | PASS | setPhase 1→2→3, spares once per phase, yields as Lyra, lullaby choice, R6 |
| Dray / Sovereign multi-phase + halo drones + Helm modes | PASS | harmony → dray (7 drones from halo sockets) → iris; helm.setMode per phase, open/calm after |
| Walk as Yourself | PASS | A6-M4: human body at 0.35× speed, no combat, comms beats, frame beams back in |
| Both endings, choice persists | PASS | epi.mjs 0/1: ending + irisFate survive reload; test.mjs reload check; falsified |
| Epilogue billboards rewritten | PASS | warm 'epilogue' billboard key, re-applied on every surface district load after the finale |
| Codex family tree complete | PASS | test.mjs: every node 'complete', every place revealed after A6-M5 |
| No softlock on reload at each checkpoint | PASS | reload.mjs: 10/10 resume the contract with a live objective, 0 console errors |
| Heirloom sets + Nightmare | PASS | story grants (A5-M4/A6-M2/A6-M5 frame set, A5-M5 Lyra's Wake) + 5 set hooks; Nightmare board at L40 (test) |
| Story hooks (Meridian core, Seraph/Dray phases, helm modes) | PASS | finale.js apply() + boss.js |
| VO Acts 5–6 | PASS | 17 VO_LINES + 22 new clips, existing voices, 0 QC flags |
| P1–P4 regressions | PASS | test.mjs 27/27; smoke ok; story2 A1-M4 (Kettle 52 s), A2-M5, A4-M2 (Rustmother) ok |
| Normal boot fetches 0 js/dev | PASS | nodev.mjs: 150 js, 0 from js/dev |
| 60 fps on high, ≤ 300 calls | PASS | Dray + 7 drones: 60 fps, 153 calls |

## Known / decisions to review
- Boss bases cut hard (P4 share per hit): Seraph 130→24 hp; Dray 180→22 hp, dmg 34→3.5, armor 50→30. Bot times are
  game-seconds with gearless frames (P4's "~90 s" was wall time at speed 2, i.e. ~180 game-s).
- Choir Angel dmg 26→20 everywhere (random choir contracts too).
- Seraph can't wreck you once per phase (she hesitates, hums): STORY canon "she always spares you".
- Heir Core is a per-frame core item (auto-equipped); Heir Protocol shows only on the frame wearing it.
- Story missions still use the selected threat: at Nightmare the bosses have ×4.5 HP.
- "Open the sky" = Helm open mode + warm billboards + the epilogue card; no city sky shader "open" mode (art gap).
- A6-M5 `unlocks: ['landfall']` has no district yet (P6).
- Ghost bot is weak vs bosses (backstab style vs a boss that faces you); a human Ghost should dodge and use Veil.
- The Helm reads very dark at gameplay pitch (black mirror floor + space); art-owned, D23 says only on Aaron's flag.
- Runner: packs of a defend step now wait for that step (they spawned early as guards when their site was the next
  step's site). Also changes A4-M2's defend (regression run ok).
