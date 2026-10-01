P6 PLAYABLE
(gameplay agent P6, 2026-10-01: Verdance Landfall, Overclock I–XXX, the Legacy board, Succession (Gen N, handed-down
heirlooms, Echo runs), five Voice Hunts, Settings (graphics, layout with a left-handed mirror, button size, save export and
import), a 60 h × 6-seed balance soak, the mirror at half rate on med, the coach fix. Table in "P6 acceptance" at the
bottom.)

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


# P6 "Endless" (gameplay agent P6, 2026-10-01)

## Checkpoint 1
- DONE: coach hints never show for a veteran (save past A1-M1, level ≥ 8, Gen 2+) or after a dev jump (`coach.skipAll()`
  from dev.js jumpStory/postGame).
- DONE sim: NEW js/data/voices.js (Mercy, Unity, Vigil, Renewal, Tomorrow) + 5 Voice relic POWERS (`voice:` key, never in
  the random pool); NEW js/sim/endless.js (heirRank, growItem, hunt helpers). game_state: `player.legacyEver/legacyGen`,
  Heir Core rank = legacyEver/10 (+5% heirPct each), Heir Core + handed-down heirlooms re-level with the rider,
  `successionState()` / `succession(name, heirloomUid)` (needs L60 + Legacy 20 earned by THIS heir; estate duty over 50k;
  districts re-open with the Echo story; gear the heir can't wear is unequipped), Voice Hunts (`S.voices`; the finale opens
  them, one Voice at a time, a card on the board until caught, moves district every 7 shifts, the next surfaces 7 shifts
  after a catch, a full cycle of 5 restarts +2 levels). Save v3 migration. equipBest never swaps out the Heir Core.
- test.mjs 29/29 (+2 P6: whole post-game chain incl. a Gen 2 Succession with save/reload at each stage; v2 migration +
  export/import round trip).
- NEXT: balance bot (legacy spending, succession, voice hunts, overclock), runtime/UI (Legacy tab, Succession flow, Echo
  dialogue, Voice boss, Overclock picker), Landfall district, settings, perf, Ghost boss check.

## Checkpoint 2
- GREEN (after the limit reset): boot + smoke (`auto=1&contracts=1&speed=2`, 0 console errors), test.mjs 29/29.
- DONE balance: bot plays the full P5 scope (storyActCap ∞, 18 archetypes, 12 twists; `--act1` = old P2 scope), spends
  Legacy, passes the frame at Legacy 20, hunts Voices, climbs the threat ladder at 60 (Hostile → … → Overclock n).
  NEW tools/sim/soak60.mjs (6 seeds × 66 h, every §9 target ±20%, idle-rich, grunt TTK) → scratchpad p6/soak60.txt.
- Balance changes: `BALANCE.legacyXpMult 0.5` (a Legacy point = half the L60 requirement; at full cost the soak ended at
  Legacy 12 → Succession ~80 h; now 55.7–64.2 h); all heirlooms re-level with the rider (they lagged 8+ levels behind at 60
  and the bot died at every threat above Tense); the first Pro/Elite clear from L15 carries a Relic (first Relic now
  3.3–3.7 h, was 4.5–6.4); nextGoal adds a Mk tier gated ≤ 3 levels away and, when nothing else is left, the next tune
  incl. the broker price of missing materials (idle-rich 0 in all 6 seeds, was 3); Voice boss base cut to the Act 5–6
  share per hit (hp 140→24, dmg 32→3.8).
- Soak misses (for the manager): level 8 at 1.4–1.7 h vs 1.3 h (+30% worst; it is D19's slower licence level, Act 1 itself
  meets the P2-amended 60–100 min); Brawler grunt TTK 1.17 s vs 1.5 s floor (a 3-hit combo kills a Knuckle; a fix is a
  −20% combo nerf, not done: it would slow every Brawler boss fight).
- NEXT: runtime/UI for Legacy/Succession/Echo/Voices/Overclock, Landfall district, settings, perf, Ghost boss check.

## Checkpoint 3
- DONE runtime/UI: Warehouse ▸ **Legacy** tab (NEW js/ui/panel_legacy.js; shows from L50 / Gen 2 / after the finale):
  12-node board (tap to spend), Legacy XP bar, Heir Core rank, Succession card (family chain, rules, heirloom picker,
  heir name input, two-tap "Pass the Frame" → "Confirm", no browser dialogs), the five Voices (hiding / hunting in X /
  silenced + relic). Contract board: **Overclock stepper** (− OFF/I…XXX +, max unlocked) beside the threat row.
  NEW js/game/endless.js: stings/toasts for legacy, heir rank, Overclock, Voice surfaced/moved/silenced; `pass()` =
  sim.succession → redeploy frame, relay to Aurum, "Generation N" sting, estate-duty toast, save. Echo runs: Mara/Lyra/
  Iris/Tomas lines show as "<name> · Echo — Recorded for <heir>" (js/game/story.js). Voice Hunt targets spawn through
  boss.js `spawnVoice` (boss bar, gilded livery per Voice, 2 Gilded Guard at 50%). Title "P6 · Endless".
- Dev panel "Endless (P6)": L60, +20 Legacy, Overclock +1, Voice Hunt now; dev post-game opens the hunts.
- Verified (scratchpad p6/p6ui.mjs, 915x412 touch): post-game → L60 + 21 Legacy → Voice card on the board → Legacy tab
  (shot p6/legacy_915.png) → 3 taps = dmg rank 3 → name "Robin" → Pass → Confirm → Gen 2 Robin L1, Echo A1-M1, Aurum,
  coach stays off; reload keeps Gen 2. 0 console errors.
- NEXT: Verdance Landfall district, settings (graphics/auto, save export/import, left-handed), perf low/med, Ghost boss,
  30-min soak, regressions.

## Checkpoint 4 — Verdance Landfall
- NEW js/world/landfall.js (registered in world.js `landfall`, aliases `verdance`, `verdance_landfall`): a colony clearing
  on the real planet. Own sky dome + PMREM (teal-gold atmosphere, cloud banks, pale moon; `interior: true` so the city
  sky/rain/night are off), a two-level terrain (1 m walkable patch with ochre trails + gravel aprons, 6 m outer rolling
  downs and blue ridges), 5 prefab domes, market stalls, supply lockers, survey tower, crop plots with Earth trees, solar
  array, fence beacons, lamps, landing pad + shuttle, containers, breakables, the colony holo sign; alien flora (bulb
  stalks with glowing caps, frond fans, crystal spires) inside the meadow edges and ~260 out on the hills; **the ark**
  hangs in the northern sky (unfogged, haze painted in). 34 sites (`lf_*`: park ×3, plaza ×2, market, pad, warehouse ×2,
  garden ×2, locker ×2, interior ×2, vault, lobby, rooftop, relay, spawn_edge ×4, vantage ×2, hide ×4, npc ×3,
  terminal, link_pad), crowd 12, build ~95 ms.
- Perf (M5 metal, 915x412 DPR2): high 65–78 calls / 180–250k tris, med 64–82, low 27–46; vista 1280x720 high 62–132
  calls. 60 fps everywhere. Shots: scratchpad p6/lfv_*.png, lf_*_915_*.png.
- Sim: landfall tags widened (market, locker, interior, vault, lobby, rooftop), danger 9→6, pools scrap/unlinked/voices/
  choir 4/3/2/1 (was voices/choir heavy: every generated defend there broke in < 10 s).
- Voice Hunt cards: level = rider + 1 (+2 per full cycle), faction voices, a small gilded court (1 veteran + 1 Gilded
  Guard + 2 Voice Drones) instead of the district packs, checkpoints on (a wreck redeploys). Bot (voice.mjs): geared
  Brawler kills the Voice in 26 s, gearless Gunner in 126 game-s with 0 wrecks → relic granted, hunt cleared.
- Landfall contracts (voice.mjs <frame> <sec> <arch>): bounty ok, escort ok (1 of 2), defend fails for the Prototype+5 L52
  bot at mission level 55–56 — the same defend fails in the Helm at L55 and passes in Hullside at L50, so it is the
  +3/+4 level gap vs the bot, not the district. Left as is (humans kite and use kits).

## Checkpoint 5 — Settings
- Settings panel (js/ui/panel_settings.js): **Graphics** Auto / Low / Med / High (stored with `qualityPicked`; main.js
  applies it at boot, `?q=` still wins; pre-P6 settings that only stored the old 'high' default count as Auto) +
  "running: X" and a **Restart to apply** button (saves, reloads). **Layout** Standard / Left-handed (mirrors the
  stick zone and the action cluster; camera drag takes the other side). **Button size** S/M/L (scales the HUD `--hs`).
  Subtitles, haptics, the five volume sliders as before. **Save**: Export (summary + the checksummed text, Copy, Download
  .txt) and Import (paste or Load file → Check → summary or "Not a valid save: …" → two-tap Replace → reload to the
  title). No alert/confirm/prompt; game.js handles `save:export|check|import`, `game:restart`.
- settings.mjs (915x412 touch taps): mirror on, Low → restart → boots `low` + mirror kept; export 14.7 kB; garbage →
  "not JSON"; the exported text → found → replace → reload → Continue restores level/credits. 0 console errors.

## Checkpoint 6 — perf (low/med) + Ghost vs bosses
- Perf, med: the planar mirror re-renders every other frame (`tier.reflectSkip = 1`, `reflection.skip`; `?rskip=0` to A/B).
  The texture keeps its own world→texture matrix, so the floor stays registered while the camera moves; only moving
  reflections update at 30 Hz. Uncapped M5 (`--disable-gpu-vsync --disable-frame-rate-limit`, 915x412 DPR2):
  Aurum avg calls 133→110, 387→423 fps; Brightline 153→122, 420→444 fps; the peak frame is unchanged (134/155).
  Per-pass breakdown on med (passes.mjs): the mirror is 47–63 calls and ~150–185k tris of a 134–154-call frame, shadows
  ~30 calls. Low was already cheap (67 calls with 8 enemies, 593 fps uncapped): left as is.
- Ghost vs bosses (story2m.mjs a6_m5 ghost, gearless, speed 2): 283 hits, **backstabs 26% of hits but 52% of the damage**
  (Blink's 2 s decoy turns the boss away, so the frame's boss tool works), 6 wrecks: 4 to Dray's melee, 1 Helm strike,
  1 drone. Verdict: it is the bot's style (it stays in melee after the decoy window) plus the Ghost's low HP, not a missing
  tool. I tried a "back off until Blink is ready" bot style: backstab share rose to 92% of damage, but the bot then stood
  still in Helm strikes and wrecked 8×, so it is reverted. No frame change; a human Ghost should Blink → stab → Veil/dodge.

## Checkpoint 7
- 60 h soak re-run after the Landfall / Voice changes (6 seeds × 66 h, scratchpad p6/soak60.txt): all §9 targets ±20%
  except level 8 (1.4–1.7 h vs 1.3 h; D19) and the Brawler grunt TTK (1.17 s vs the 1.5 s floor). Level 60 36.5–39.2 h,
  first Succession 49.4–54.7 h, first Relic 3.3–3.7 h, idle-rich windows 0, 3–4 Voices caught per seed, Gen 2 in all six.
- Autopilot: an emptied board (all cards taken or failed) is rerolled instead of idling until the next shift (found by
  the memory soak: the bot sat on an empty board for 8 real minutes).
- IN PROGRESS: 30-min memory soak (soak.mjs, `auto=1&story=1&contracts=9999&speed=3`, heap after forced GC each minute).

## Checkpoint 8 — memory soak + regressions (after the limit reset)
- 30-min memory soak (soak.mjs, story autopilot, speed 3, forced GC before each sample; log p6/soak30.log survived):
  heap 79.3 MB at min 5 → 83.2 MB at min 30 (**+4.9%**), geometries 244→280 and textures 77→80 (they grow over the first
  district swaps, then stay flat from min 11), programs flat at 98–99, 0 console errors. Caveat: the bot stopped completing
  contracts at min 7 (L8, Brightline); the page kept running fights and redeploys to the end. A1-M3 and A1-M4 replay fine
  on their own, so the cause is not found. It is noted here, not fixed.
- Regressions: test.mjs 29/29; smoke ok; story2 A1-M3, A1-M4 (Kettle), A2-M5, A4-M2 (Rustmother) complete; reload.mjs
  A2-M1 / A4-M4 / A6-M5 resume with a live objective; normal boot fetches 155 js, **0 from js/dev**; after a dev jump
  to A4-M4 (L32) no coach hint shows and every lesson is marked done. 0 console errors throughout.
- Perf (perf.mjs, 8 enemies, M5 metal, vsync on): high 1280x720 60 fps p95 16.8 ms, **237 calls** max, 0 hitches; med
  915x412 60 fps, 223 max (the peak frame; the average fell 20% with the half-rate mirror); low 60 fps, 62 calls.
  Landfall: high 65–78 calls, vistas ≤ 136.

## P6 acceptance (BUILD_PLAN §P6)
| item | result | evidence |
|---|---|---|
| Verdance Landfall district | PASS | js/world/landfall.js; 34 sites; bot bounty/escort/Voice Hunt there; 60 fps on high/med/low (27–82 calls) |
| Overclock I–XXX | PASS | sim: unlocks at 60, an Elite clear unlocks n+1, cards at level 66+n/3; contract-board stepper; test.mjs |
| Legacy board + Heir Core ranks | PASS | Warehouse ▸ Legacy (tap to spend; p6ui.mjs); +5% Heir Protocol per 10 Legacy; test.mjs |
| Gen 2 Succession end to end | PASS | test.mjs (save/reload at each stage); in-game p6ui.mjs: name → Pass → Confirm → Gen 2 Robin L1, Echo A1-M1, reload keeps it; soak: Gen 2 in 6/6 seeds |
| Voice Hunts (5 roaming bosses, unique Relics) | PASS | sim + runtime boss bar and livery; voice.mjs: Voice killed, relic granted; relics never in the random pool (test) |
| 60 h sim meets ECONOMY §9 ±20% | PASS* | soak60.mjs 6 seeds × 66 h: all milestones pass except level 8 (1.4–1.7 h vs 1.3 h, from D19) and Brawler grunt TTK (1.17 s vs 1.5 s); first Relic 3.3–3.7 h (was 4.5–6.4) |
| credits never idle > 3× next want for 2 h | PASS | 0 windows in 6 seeds |
| Settings: graphics, audio, controls layout + left-handed mirror, save export/import | PASS | settings.mjs (touch): mirror, Low applies after restart, export → bad/good check → replace → reload |
| 30-min soak, memory growth ≤ 15% | PASS | +4.9% heap (min 5 → 30), geometries/textures flat after the first swaps (see the caveat in checkpoint 8) |
| low/med perf pass | PASS | med mirror at half rate: −20% average calls, +6–9% uncapped fps, same look |
| Coach after dev jumps / veteran saves | PASS | coach.mjs: 0 hints at L32 after a jump |
| Ghost vs bosses | checked | the frame's tool works (backstabs = 52% of the damage vs Dray); the wrecks come from the bot staying in melee |
| P1–P5 regressions, reload, 0 js/dev | PASS | checkpoint 8 |
| 60 fps on high, ≤ 300 calls | PASS | 237 calls with 8 enemies at 1280x720 |

## Known / decisions to review (P6)
- `BALANCE.legacyXpMult 0.5`: a Legacy point costs half the L60 requirement (ECONOMY §8 says the whole one); otherwise the
  first Succession lands near 80 h instead of ~55 h.
- Every heirloom re-levels with the rider; handed-down pieces also grow (+2 levels) and gain +1 tune cap per hand-down (up
  to 5). The Heir Core re-levels too and auto-equip never swaps it out.
- Succession resets unlocked districts to Aurum (the Echo story re-opens them); the Voice Hunts stay open across generations.
- The first Pro/Elite clear from L15 always carries a Relic.
- nextGoal also lists a Mk tier gated ≤ 3 levels away and, in the endgame, the next tune (materials priced in).
- Voice Hunt cards: rider level + 1 (+2 per cycle of five), 3× pay, 2× XP, checkpoints, a gilded court escort; Voice
  base cut to the Act 5–6 share (hp 24, dmg 3.8).
- Landfall danger 6 with frontier pools (scrap/unlinked first); `interior: true`, so no day/night or rain there.
- Soak misses: level 8 (D19) and Brawler TTK (left for feel).
- Generated defends 3–4 levels above the bot fail anywhere (Helm and Landfall alike).
- Pre-P6 settings that stored 'high' without anyone choosing it now boot on Auto.


# P7 "Polish" (gameplay agent P7, 2026-10-01)

## Checkpoint 1 — the dialogue speaker portrait (Aaron's flag, D23)
- What read as strange (scratchpad p7/before_*.png): flat clip-art SVG heads with a line mouth, the same "ear-muff"
  robot for every speaker (Kettle, Dray, Halloran, Harmony all one generic bust in different paint), none of them the
  robot you actually meet; a tall narrow tab poking 58 px out of the letterbox with a flat cyan wash; at 1280x720 a thin
  138 px strip. It looked like a web avatar next to a PBR game.
- NEW js/game/bust.js: a **live 3D bust of the speaker's real model** (createRobot, the district's PMREM env, a key +
  accent rim light). The main renderer draws it into a scissored corner of the canvas *before* the world frame (which
  then overwrites it) and `drawImage` copies it into the portrait's 2D canvas, so there is no second GL context and no
  readPixels stall. Only while a dialogue is open; framed once per speaker (head + shoulders) so the `talk` sway reads;
  `talk` while the line types, `idle` after. Programs compile through `renderer.compile` + a poll of `isReady()`
  (KHR_parallel_shader_compile), so no hitch: the SVG shows until the bust is linked (11–22 ms high, 125 ms low).
  three's own `compileAsync` throws if a material is disposed while it polls (hit it on fast speaker swaps), hence the poll.
- Humans call in over the Link, so they render as a **hologram** of the human body (one override material: fresnel
  edges, scanlines, flicker, in the speaker's hue). Unknown voices (Iris's recordings, the Helm) get a 2D **waveform
  emblem**. Voice reactive: NEW `audio.voLevel()` (a 256-sample analyser on the VO bus) drives the eye/glow emissive
  and the portrait's outer glow (`--vl`).
- Speakers now name their model: `portrait.model` (Kettle boss_kettle, Halloran boss_halloran, Dray boss_dray, Seraph
  seraph tier 3, Choir seraph, Rook/Tinsel civ_worker, thug enforcer); others map by kind (rental, ghost, civ_gold…).
- Frame (css/dialogue.css): a chamfered holo-glass window (gradient edge white→accent→gold, gold tick on the cut corner,
  glass sheen, fades into the letterbox), sized 0.8 × height so it scales with the letterbox (118x148 at 915x412,
  ~160x200 at 1280x720); it no longer pushes the choices down.
- Cost: 6–9 draw calls, 0.2–0.8 ms CPU per frame, only during dialogue; 60 fps held at high 1280x720, high 915x412 and
  low (bperf.mjs). 0 console errors.
- Shots: p7/before_after.png (left before, right after), p7/grid_v3_915.png / grid_v3_1280.png (9 speakers), v4_*.png.
- Framing tightened after review (head + shoulders, headroom for the bosses' hats/halos): p7/grid_v5.png.

## Checkpoint 2 — the soak contract stall (root cause: a Heat death spiral, human-reachable)
- Reproduced (p7/stall.mjs, same flags as the P6 soak): A1-M5 "Unperson" ends at 3★ (story `setHeat 3`) at L7. Hunting
  squads arrive every 40 s; the Brawler fights back, each Warden kill adds +½★ (10 s cooldown), so it climbs to 4★:
  Enforcer squads at L+2 wreck it, a wreck fails the contract, the redeploy only calms enemies within 30 m, the hunters
  re-acquire after the 4 s shield, and at 4★ the relays are locked so the next story card (A2-M1, Terraces) can't be
  taken. Heat only decays 1★ per 3 min, so the loop ran for the rest of the soak (77 redeploys, 1 contract in 5 min).
  A human who fights back at L7–8 walks into exactly this, so it is fixed in the game, not just the bot.
- Fix: a wreck drops Heat one star (game_state `playerWrecked` → `heatDrop`), the remaining
  responders stand down and the next squad waits a full interval (heat.js `afterWreck`), toast "Heat down a star · The
  Wardens logged you as dealt with". (First version skipped story contracts; the re-run soak then looped the same way
  inside A2-M1 on Heat left over from free roam, so it applies on and off the story.) Bot: at 4★ it skips a story card in
  another district (relays locked) and takes a local card. test.mjs 30/30 (+1 P7 test; it fails with the fix reverted).
- Second stall found by the re-run (p7/soak30_run1.log, min 9–30): A2-M1's escortee (Fenn) wedged on a prop 4 m from
  its first waypoint for 20 min. The nav grid is coarser than the colliders, so the route said "straight line" and
  `collision.move` slid nowhere. Human-reachable (a contract that can't finish), so fixed in the step: escort now has the
  same 3 s wedge rescue the tail/race walkers already had (hop to the next route point; log "escort unwedged").
- Soak re-run 2 (p7/soak30.log, both fixes in): contracts kept completing to the end, 13 at min 11 → 26 at min 30,
  story A1-M5 → A2-M4 start, L7 → L12, five districts; heap +3.4% (min 5 → 30), 0 console errors. The one dry spell
  (min 11–16, Heat 3.9) was bot-only: at 4★ it kept clicking cards in other districts and the relay refused each one (a
  human gets the "Transit Relays locked · Lose some Heat first" toast). The bot now takes only local cards while the
  relays are locked, rerolls at most once per 30 s, and otherwise waits out the Heat.
- Regressions: test.mjs 30/30; smoke `auto=1&contracts=1&speed=2` ok, 0 errors; normal boot 156 js, 0 from js/dev.
- Final soak (p7/soak30.log, all fixes): contracts 1 → 34 over 30 min, never more than ~4 min without one (the gap is
  the A2-M4 Halloran heist); story A1-M1 → A2-M4, L14, 6 districts; heap +8.6% (min 5 → 30, limit 15%); 0 console
  errors. Geometries 260 → 418 because this run visited more districts (they settle per district, as in P6).
- Story replays (story2m.mjs, Brawler): A1-M3, A1-M4 (Kettle), A4-M2 (Rustmother) complete; A2-M5 complete in 76 s on
  the re-run (the first run of the batch printed no result before 420 s, cause not found).

## Checkpoint 3 — Arcology defend with the Gunner (P3 known issue)
- Not changed. Ranged enemies only fire at the objective with the same `losClear` the player's shots need
  (enemies.js), so whoever is damaging the objective can be seen from beside it; a Gunner who holds near the objective
  isn't blocked for a non-skill reason. The P3 failure is the bot kiting 7 m away behind cover. The quick re-check
  (voice.mjs D=arcology defend) isn't valid evidence: it sets the bot to L52 against an L29 card, so it passes in 10 s.

## P7 acceptance
| item | result | evidence |
|---|---|---|
| Dialogue portrait redesign (Aaron's flag) | DONE | live 3D bust of each speaker's real model, holo humans, waveform for unknown voices, VO-reactive glow; p7/before_after.png, grid_v3_*.png, grid_v5.png |
| Contract stall from the P6 soak | FIXED | root causes: Heat death spiral (game), escortee wedge (game), 4★ relay-lock board loop (bot); final soak 34 contracts / 30 min |
| Arcology defend with the Gunner | checked | no non-skill failure found (LOS is symmetric) |
| sim tests | PASS | test.mjs 30/30 (+1 P7) |
| smoke + story replays | PASS | smoke ok; A1-M3, A1-M4, A2-M5, A4-M2 complete |
| normal boot fetches 0 js/dev | PASS | 156 js, 0 dev |
| 60 fps on high | PASS | perf.mjs 1280x720 high: avg 60, p95 16.7 ms, 205 calls max, 8 enemies; with a dialogue open: 60 fps, +6–9 calls |

## Known / decisions to review (P7)
- Every wreck drops Heat one star, story contracts included (A1-M5's scripted 3★ too, once you're wrecked).
- Humans speak as a hologram of the generic human body (the Walk as Yourself mannequin), tinted by speaker hue; they
  have no individual faces. Codex and contract-board portraits are still the SVG busts.
- Speaker data now carries `portrait.model` (Kettle, Halloran, Dray, Seraph, Choir, Rook, Tinsel, thug).
