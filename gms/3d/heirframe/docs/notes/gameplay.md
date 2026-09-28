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
- NEXT: A2-M5 run, Act 2 VO, P4 cheap wiring (Home door loop), P3 systems.

## NEXT (P3)
- rep tiers/vendor pricing/rival UI; Fabricator (recalibrate UI, tune pity); relic hooks (afterimage, phantom_step,
  reactive_plating, stillwater, kinetic_battery); Hostile threat check; danger/Crackdown; Echo.
