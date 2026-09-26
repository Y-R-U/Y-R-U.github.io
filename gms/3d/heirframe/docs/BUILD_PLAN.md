# HEIRFRAME — Build Plan (planner-owned)

Status: v1, 2026-09-26. Six phases after P0. Each phase lists its **goals**, the **work per agent role** (file ownership as in MANAGER_STATE, plus one proposed addition marked ⚑) and its **acceptance tests**. The manager integrates, commits and pushes at the end of each phase.

**Order of truth:** DECISIONS.md → this plan → DESIGN / STORY / MISSIONS / ECONOMY → agent notes.

---

## Ownership (standing)

| role | owns | never touches |
|---|---|---|
| planner | docs/DESIGN, STORY, MISSIONS, ECONOMY, VO_LINES, BUILD_PLAN, notes/planner.md | code |
| world | index.html, js/main.js, js/engine/* (renderer, quality, **camera**, post), js/world/* (districts, sites, collision), js/fx/* | js/game, js/sim |
| robots | js/actors/*, tools/robot_gallery.html | |
| ui | js/ui/*, css/*, tools/ui_kit.html | |
| systems | js/sim/*, js/data/*, tools/sim/*, **⚑ js/game/*** (the gameplay runtime) | js/world |
| audio | js/audio/*, audio/*, tools/vo/*, tools/audio_test.html | |

**⚑ Manager decision needed: who owns the gameplay runtime.** Nobody owns the code that *runs* the game: the player controller, enemy AI and detection, the mission step runner, applying combat hits, spawning, auto-target, and triggering loot drops. **Proposal:** systems owns a new **`js/game/*`** folder. It may import three.js for vector math and scene placement but holds no rendering code. It consumes `sim` (pure rules) and exposes:

```js
createGame({ world, robots:{createRobot}, ui, audio, save }) → {
  update(dt), state /* 'title'|'intro'|'free'|'mission'|'dialogue'|'warehouse' */,
  player, enemies, civilians, mission, board, debug /* mirrors to window.__game */
}
```
world's `main.js` stays the boot and frame loop: create world, create the game, then call `game.update(dt)` and `world.update(dt)`. If the manager prefers world to own `js/game`, the split still works. The rule is only that exactly one agent owns it.

**Proposed contract additions** (each agent confirms in their notes):
- world: `world.sites = [{id, tag, x, z, r, indoor}]` using the MISSIONS §3 tags; `world.props.breakables` (collateral); `world.setCameraTarget(obj)`; `world.billboards.show(textKey)` for propaganda and glitches.
- robots: `createRobot({... paint})` where paint is `'default'|'syndicate'|'concord'|'unlinked'|'rental'|{primary, secondary, glow}`, plus `setAlert(level0to1)` (the eye-glow colour for detection).
- ui: panels `contracts`, `warehouse`, `codex`, `results`, `settings`; `ui.detect.set(id, x, y, amount)` (the detection meter over an enemy's head); `ui.lens.show()/hide()/progress(p)` for photo steps; `ui.boss.set({name, hp, max})`.
- audio: `audio.vo(key)` resolves immediately (and returns `false`) when the file is missing, so text-only dialogue never hangs.

---

## P0 — Foundations (running now)
- **planner:** these six docs.
- **world:** the Aurum Plaza look test that matches `refs/ref_plaza_gold.png` (PBR, PMREM env, bloom, water and waterfalls, holo billboards, skyline, flying cars).
- **robots:** procedural kinds with the anim set, and a gallery page.
- **ui:** the UI kit page with every component.
- **systems:** rng, stats, loot, save, and data files that follow DESIGN and ECONOMY.
- **audio:** music router, SFX, and the VO pipeline with voices designed from STORY §1.
- **Exit:** every agent's notes file lists its public API and the manager has read them.

---

## P1 — First playable slice ("One Good Shift")

**The experience, end to end:**
Title → **Start** → intro beat (pod text card, HIRA boot, Harmony PA, Mara's call) → you stand in the **rental** in sunlit **Aurum Plaza** among gold, chrome and black civilians → walk to Mara's kiosk → the **contract board** shows the gold STORY card *First Shift* plus 6 random cards → play **A1-M1** (courier, Scrap Rat fight, heir-key twist) → **results card** (credits, XP, level 2) → **loot beam** → **▲ UPGRADE — EQUIP** → open the **Warehouse** (loadout, stash, tune +1, salvage) → take a **random contract** (courier / pest / retrieve / surveil) → complete it → loot and credits → next contract. The shift fee ticks after 24 active minutes.

**Scope in P1:** one district (Aurum Plaza) · the rental only (the Brawler preview shows in the Warehouse as "locked: 1,500 cr", buying it is P2) · rental skills (baton, Zap Pistol, Overclock, Sponsored Content) and dodge · enemies Scrap Rat, Knuckle, Popper, Warden Eye (Heat only) · 4 archetypes · 3 modifiers (timed, noAlarm, elitePack) · twists T1, T4, T10 · rarities scrap to prototype · Heat 0–3 · save and continue · VO P0 for the opening, A1-M1, the core barks and PA (text fallback allowed).

| role | P1 deliverables |
|---|---|
| world | Aurum Plaza district at ~180 × 180 m: gold terraces, 2+ waterfalls, a central statue, reflective paving, skyline towers, a moon and planet, flying-car lanes, 3+ propaganda billboards; **sites** (P1 minimum in MISSIONS §3); Mara's kiosk; a contract-board holo; Nexus lockers; a Transit Relay prop; collision (`blocked`, `groundAt`); the D4 camera with pinch zoom; quality tiers; `main.js` boot with the watchdog, the title backdrop (a slow camera drift over the plaza) and the frame loop; perf budget (below) |
| robots | kinds `rental`, `civ_gold`, `civ_chrome`, `civ_black`, `civ_worker`, `drone_scout`, `security`; **`scrap_rat`** (new, needed in P1); `brawler` and `gunner` with `paint:'syndicate'` (Knuckle and Popper); `brawler`, `gunner` and `ghost` in default paint for Warehouse previews; all anims; crowd-friendly (≥ 40 civilians on screen at high quality); `hitFlash`, `setAlert` |
| ui | title screen; rotate overlay; HUD (HP, shield and energy bars, level and XP, credits, Heat stars, rental surcharge line, next-goal chip); controls (joystick plus tap-to-move, attack, 3 skills, dodge, interact); contract board panel (cards, STORY card, accept); dialogue panel (portrait, choices, VO sync); loot toasts with **▲ EQUIP**; damage numbers; objective marker and off-screen arrow; detection meter; photo lens; results card with counting animations; **Warehouse** (Frames tab preview, Loadout, Stash, Fabricator: tune and salvage); non-blocking toasts |
| systems | sim: stats assembly (ECONOMY §1), combat math, loot roller (§6), mission generator (the P1 subset of MISSIONS, full formulas), economy (payout, XP, shift fee, surcharge), story flags (a1_m1 and the intro), save v1. **js/game** ⚑: player controller (joystick, tap-move, dodge i-frames, auto-target), rental skills, enemy AI (patrol, detection cone, alert, combat, flee, search), civilian wander and flee, mission runner (steps goto, pickup, deliver, kill, destroy, photo, exfil, survive), spawn packs at sites, loot beams (drop, auto-pickup, uplink), Heat, the A1-M1 scripted sequence, `window.__game` debug, test hooks `?auto=1` (a bot takes and completes contracts) and `?seed=` |
| audio | music: `menu` on the title, `cruise_day` in the plaza, a combat layer or crossfade to `cruise_a` in fights, a results sting; SFX: footsteps (metal on stone), baton, zap, dodge whoosh, hits, rat skitter, loot drop by rarity, UI tick and confirm, level-up; VO: every P0 line in VO_LINES §1 (a1_s00–a1_s04), §4 (P0) and §5 (P0); a PA scheduler every ~90 s (at low volume, ducking under dialogue) |
| planner | answer questions; review the P1 build against DESIGN; write the P2 content (the Act 1 dialogue scripts as data tables for systems) |

**P1 acceptance tests** (the manager runs these headless over CDP with `--use-angle=metal`, at 1280 × 720 and 915 × 412):
1. **Boot:** the title is visible in < 6 s on localhost, with no console errors or warnings from our code. `__game.state === 'title'`.
2. **Intro:** Start plays the a1_s00 beats (VO or text). `__game.state === 'free'`, the player kind is `rental`, and the player stands in Aurum Plaza.
3. **Movement:** the joystick and tap-to-move both move the player. The player cannot walk through walls or into water (`blocked`). The camera follows.
4. **Board:** the contract panel shows the STORY card plus 6 valid cards (title, district, level, payout, grade), with no NaN and no empty fields.
5. **A1-M1:** accepting it gives a marker. Pickup works. At least 3 Scrap Rats spawn and die to baton hits. Delivery triggers the heir-key dialogue (a1_s03). The results card shows 120 XP and level 2. At least 1 item drops. The codex has the Wren node and C01.
6. **Random contract:** with `?auto=1`, the bot takes and completes 3 random contracts (at least 2 distinct archetypes). Credits increase each time, and the rental surcharge shows.
7. **Upgrade:** a better weapon drop shows ▲. Tapping EQUIP changes `__game.player.loadout.weapon` and raises FR. The Warehouse opens out of combat, is refused (as a toast) in combat, and tune +1 and salvage both work.
8. **Loop:** after a contract, the board still has cards (the completed card is removed, and a new one appears on the next shift or reroll). The shift fee deducts 100 cr after 24 active minutes (the test uses `?shift=60` for a 60 s shift).
9. **Save:** reloading and pressing Continue restores level, credits, stash, equipped items and story flags.
10. **Performance:** high quality at 1280 × 720 on the M5 with Metal averages ≥ 55 fps with ≥ 40 civilians, 8 enemies, bloom and shadows. `?q=med` gets ≥ 60 fps at 915 × 412. There are no frame hitches > 100 ms after the first 10 s.
11. **Look:** a blind critic compares a P1 screenshot with `refs/ref_plaza_gold.png` and scores it ≥ 6.5/10 for "sunlit gold utopia, premium" (the goal is 7.5 by P2). The UI screenshot scores ≥ 7/10 for "looks amazing, readable on a phone".
12. **Rules:** there are no `alert`, `confirm` or `prompt` calls. Portrait mode shows the rotate overlay. There are no CDN imports (grep).
13. **Sim:** `node tools/sim/p1.mjs` generates 10,000 P1 contracts that are all valid (MISSIONS §10). The pacing bot reaches level 5 in 25–45 simulated minutes and can afford 1,050 cr by level 5.

---

## P2 — "Own Your Frame" (Act 1 complete)
**Goals:** buy and swap frames; Brawler, Gunner and Ghost with full kits and sync mods (sync 5 only); all 6 part slots; Brightline Boulevard; the rest of Act 1 (A1-M2 to A1-M5), Big Kettle boss; archetypes bounty, escort, sabotage and hack; modifiers fragile, watched, reinforced, collateral and vip; twists T2, T3 and T9; Heat to 5; Wardens and Enforcers; the Transit Relay; the frame drop-pod swap animation; Mk II tier; the market; repair kits; the codex with the Family Tree tab (nodes for Wren, the two parents, Mara and the Vael family).
- **world:** the Brightline district (the blue ref, with the monorail and billboards); the relay transition; breakable props.
- **robots:** frame Mk tiers 0–1 visuals; `enforcer`; `boss_kettle` (enforcer with a boiler); drop-pod courier drone.
- **ui:** frame swap UI; loadout for 6 slots; skill-mod picker; boss bar; the Heat HUD at 5 stars; family tree v1.
- **systems:** the frame kits; the sync system; archetypes and twists; the Act 1 story runner; the boss AI script for Kettle.
- **audio:** the remaining P0 VO (a1_s05–s15); `boss` music on bosses; Warden radio barks.
- **Acceptance:** a fresh save completes Act 1 in 60–100 minutes of bot play at Tense; all 3 frames can be bought and swapped in the field in < 3 s; each frame's skills show distinct feel metrics (the Brawler's average engagement distance < 3 m, the Gunner's > 8 m, the Ghost's backstab share > 40% in bot tests); Brightline passes the blind-critic look test against `ref_boulevard_blue.png` at ≥ 7/10.

## P3 — "Harmony Through Unity" (Act 2)
**Goals:** Verdant Terraces and the Nexus Arcology (floor-instanced interiors); Act 2 (A2-M1 to A2-M5), Halloran boss, Seraph's first appearance; faction rep with the tiers, vendor pricing and rival pairs; archetypes tail, infiltrate, transport, defend, repo, race, assassinate and rescue; the full Fabricator (recalibrate, salvage-all, pity); Relic uniques 1–12; Custom+ loot quality; threat Hostile; district danger and Crackdown; Echo clues; P1 VO.
- **Acceptance:** all 16 non-heist archetypes are generated and completable by bot across 3 districts; rep changes reach the vendors; the codex fills R1–R2 correctly; a sim run of 1–20 stays within the ECONOMY §9 targets.

## P4 — "The Sky Is a Screen" (Acts 3–4)
**Goals:** Portside and the Stacks; the Home scene (Pod 4471) and the Brightline Apartment; day and night (24-min shifts; the sun always rises at exactly 06:00, a deliberate clue), rain; night and rain modifiers; Black contracts; the heist archetype; wetwork with T5, T6, T11 and T12; Acts 3–4 with Mara's choice, Harmony/Iris, Rustmother and the Breach sequence (the sky lattice, stepping onto the hull as a set piece); Kettle and Halloran as informants; P2 VO for Acts 3–4; the Lethal threat.
- **Acceptance:** the Breach set piece runs at ≥ 45 fps; the Stacks look test uses a mood-board ref that the manager generates with Flux (the undercity rot); the story runner handles the dialogue branch and persists `maraTone`.

## P5 — "Hullside" and "Heirframe" (Acts 5–6)
**Goals:** the Spine, Hullside (EVA low gravity, star field, Verdance filling the sky), Meridian Wreck and the Helm; enemy kinds `spider`, `seraph` (Choir), `boss_sovereign`; the Heir Core with a 4th skill per frame; Seraph and Dray as multi-phase bosses; the *Walk as Yourself* human-body sequence (a simple stylised human; robots can derive it from the `civ_worker` rig without the helmet); both endings, and the epilogue billboards rewritten; Heirloom sets; Nightmare.
- **Acceptance:** a full story playthrough by bot plus manual boss checks; the ending choice persists; the codex family tree is complete; no softlock at any story step when replaying after a reload at each checkpoint.

## P6 — "Endless" (post-game and polish)
**Goals:** Verdance Landfall (planet surface); Overclock I–XXX; Legacy board; Succession (Gen N, handed-down Heirlooms, family tree growth, Echo story runs); Voice Hunts (5 roaming Voice bosses with unique Relics); a balance soak over 60 simulated hours; a perf pass on low and medium tiers; settings (graphics, audio, controls layout, left-handed mirror); save export and import; the manager does the projects.js registration and screenshot.
- **Acceptance:** the 60-hour sim meets every ECONOMY §9 target ±20%; credits never sit idle above 3× the next want for 2 h; a Gen 2 Succession works end to end; a 30-minute headless soak has no memory growth > 15%.

---

## Perf budget (all phases)
- **High (S22 Ultra class, the default):** dpr 1.5, shadows (one 2048 cascade near the player), bloom, PMREM env, ≤ 250 draw calls, ≤ 600k tris on screen, ≤ 40 animated robots (instanced parts where possible) plus 10 enemies.
- **Medium:** dpr 1.25, 1024 shadows, bloom at half res, ≤ 25 animated civilians.
- **Low:** dpr 1.0, blob shadows, no bloom, ≤ 12 civilians.
- Every agent reports draw calls and tris for their content in their notes.

## Content handoffs from the planner (next)
- P1: the A1-M1 script as a data table (speaker, VO key, text, trigger) goes to systems' `js/data/story_a1.js` via notes; systems writes the file.
- P2: the Act 1 scripts for M2–M5 and the Kettle boss phase design.
- P3+: each act's scripts one phase ahead of the build.
