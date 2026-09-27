P2a PLAYABLE
(gameplay agent, 2026-09-27: acceptance table below; bot + headless checks, M5 metal, drivers in scratchpad `gameplay/`.)

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
