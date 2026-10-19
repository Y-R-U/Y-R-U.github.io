# qa agent notes (bug list) — owns only this file + scratchpad/qa

Test driver: scratchpad qa/drive.mjs (CDP 9434, touch emulation via Emulation.setTouchEmulationEnabled + Input.dispatchTouchEvent), lib.mjs (btns/overflow/small audits), t*.mjs per step.
Screens: scratchpad qa/*.png. Base URL http://localhost:8888/gms/3d/vectorprotocol/

## Checkpoint 1
- DONE: fresh boot (no dev) 412x915 touch, hub label taps (all 7), map 1, level sheet, story scene, formation, battle m1_l1, results.
- DONE: Aaron's phone findings checked (A1 confirmed + 2 more of the same class). Real play m1_l1..l4 (fresh save, touch): story scenes, hints, Barracks level-up, save survives reload (slots/stars/hash #/hub).
- DONE: all 8 bosses won in dev (god+onehit) at 412x915 touch: Big Rusty, Redline, Corona, Stormcrow, The Choir, Elderbark (fantasy ruins + stone HUD), Aurelian, Vector Prime. 0 console errors, 3/3 stars, results OK. Music: map->boss->hub per route.
  Recruit x1/x10 on all 7 banners incl. Rift Gate (no errors). Arena fight + shop, Special Ops, Raid: Dreadnought won. HQ/settings/events/chapters audited.
- DONE: all 44 unit profiles (spin, Level up, Rank up, Convert; contact sheets sheet0.png/sheet1.png), perf (battle_test q=high/med/low + real m8_l15),
  back/forward mid-battle, background (frozen + hidden) mid-battle, landscape phone, 1280x800 desktop, 390x844 spot check.
- Pass complete (hand-back). Counts: 0 blocker · 7 major open (+1 major fixed during the pass) · 15 minor · 7 polish.
- Env note: the :8888 python static server intermittently times out under multi-agent load (ERR_CONNECTION_TIMED_OUT on single module files);
  that is the trigger for Q11, not a game bug by itself. Also: `Page.setWebLifecycleState frozen` wedged my headless tab so later boots hit the
  20 s "Uplink failed" watchdog - a test artefact, ignore; fresh browser booted in 9.4 s (cache off) / 0.8 s (cached).

## Bugs

### From Aaron's phone playtest (ui-5 fixing)
- A1 [major, ui] Formation/Deploy screen: bottom ENGAGE button sits below the bottom of the page on a real phone (browser chrome eats height). Test 412x780 / 390x700.
- A2 [minor, ui] No fullscreen toggle.
- A3 [minor, ui] No reserved space for the login badge at the top right.
  QA check of A1-A3 (touch, dev save at m3_l2, every route audited for buttons below the fold with no scroll container):
  - A1 confirmed: 412x780 `#/formation/m3_l2`: ENGAGE at y 746-802 (viewport 780) -> half off-screen; the buff row's last chip also clipped right. Screen v412x780___formation_m3_l2.png.
  - A1b [major, ui] 390x700 formation: ENGAGE fits, but the roster bench is crushed to a ~20 px sliver (cards invisible, nothing to drag/tap). v390x700___formation_m3_l2.png.
    The formation column needs one scroll region (or the board shrinks) rather than flex-squashing the bench.
  - A1c [major, ui] SAME CLASS: Arena screen does not scroll. `.scr-arena` is overflow:visible inside overflow:hidden parents, content 804 px tall.
    At 390x700 the token-shop rows at y 666-706 and 754-794 (Capacitor / 45 / 80 items) are unreachable; at 412x780 the last row (45, 80) is unreachable.
    Repro: `?dev=1#/arena` at 390x700, touch-drag up: nothing moves. v390x700___arena.png, v390_arena_scrolled.png.
  - Clean at both sizes: hub, map, level sheet, squad, unit profile, recruit, HQ, events, settings, chapters, battle HUD (v390x700_battle.png).
  - A3 note: top-right is occupied by currencies (hub/topbar) and the ENEMY SQUAD INTEGRITY bar (battle) - both need to shift for a badge.

### QA findings
- Q1 [MAJOR, ui] **FIXED - re-verified 20:55: `.fm-hex` now computes `touch-action: none`; board->board and roster->board touch drags both work.** Original: **Formation drag & drop does not work on touch; dragging a placed unit REMOVES it from the board.**
  Repro: 412x915 touch, `#/formation/m1_l1`, touch-drag the Gunner from back-mid hex to back-near hex.
  Expected: unit moves. Actual: browser fires `pointercancel` straight after pointerdown+move (html/body are `touch-action: manipulation`, hexes compute `auto`, so the browser claims the pan);
  `up()` in scr_formation.js dragSource runs on pointercancel with `ghost` set and `over` null -> "dragged off the board = bench it" -> unit is benched.
  Same with a mouse it works. Roster -> board drag also does nothing on touch. Fix: `touch-action: none` on `.fm-hex` (and the bench card needs a non-pan gesture or long-press), and don't treat pointercancel as a drop-off.
  Consequence seen in play: my first m1_l1 attempt went in with 1 unit and was a DEFEAT. Screens: f_form2.png, f_res.png. No console errors.
- Q2 [minor, design/ui] m1_l1 (the tutorial level) star goal 2 is "Win with 1 unit or fewer"; "Fit goals" strips the squad to 1 unit and a 1v1 Scrapper mirror (166 vs 166) can lose. A first-time player chasing stars loses level 1. Owner: design (js/data) for the goal; ui for Fit goals warning when power drops below the enemy.
- Q3 [polish, hub] Hub labels are 36 px tall (tap target < 44). Fresh save CTA says "CONTINUE" rather than "START". f_boot.png.
- Q4 [minor, sim/design] Mutual KO = DEFEAT. m1_l1 with 1 Scrapper vs 1 Scrapper: results show my Scrapper "1 kill" and DOWN, banner DEFEAT "Squad integrity lost". Expected a win (or at least a draw) when the last enemy dies in the same tick. f_res.png.
- Q5 [minor, design] m1_l4 Crane Job: rec. power 410; with 413 power (Gunner Lv2 + Scrapper Lv3, after spending all scrap) it lost 2 of 3 tries; with 398 it lost. Only 2 slots, Recruitment and Arena are still locked, so the only lever is replaying 1-3. MAPS.md says maps 1-2 should clear straight through with "a replay or two" - this is the first wall at level 4 and feels early. Owner: design (js/data/maps.js) / sim harness.
- Q6 [polish, ui] Results after-action row portrait is an unlit black thumbnail while the MVP panel portrait above it is lit (f_res.png, Scrapper).
- Q7 [polish, robots] Patch portrait/model reads as a white dome with a huge floating green cross (s_squad.png) - weakest silhouette in the starting roster.
- Note: fullscreen button (`.tb-fs`) has landed in the topbar (ui-5) - A2 in progress.
- Q8 [major, ui] Shard picker ("5 shards (any owned unit)" in the Arena token shop) offers only 4 units, and its button row (`.acts`, 324 px wide, overflow visible) pushes the first button off the left edge: GUNNER at x=-94 is unreachable. With a full roster the player cannot pick most units. Repro: `?dev=1#/arena`, tap the 120-token "5 shards" buy. pick.png / event_form.png.
- Q9 [minor, ui] Modals survive navigation: the shard picker opened in the Arena stayed on top after the route changed to `#/formation/event/salvage_run/t1`, silently blocking ENGAGE (tap did nothing, no toast). On Android the system back button does exactly this. Close open popups in screens.show() like the tutorial hints. event_form.png.
- Q10 [minor, ui] `#/chapters` on a save with only chapter 1 open renders an empty screen with no header and no back button (dead end except browser back). Reach it via history/deep link. ch_real.png. (Also saw it blank once on a full dev save; not reproducible 5 min later - probably a transient hub-3 edit.)
- Q11 [transient/robustness, ui+battle] During the m3_l14 run the static server timed out on `js/actors/archetypes/index.js` and `js/app/account.js` (ERR_CONNECTION_TIMED_OUT); modules.js then used the units STUB for the rest of the session and the whole battle rendered placeholder units. One failed fetch = placeholders until reload. Consider a single retry in modules.js load() before falling back. Console: `[modules] units unavailable, using stub` / `[battle] js/actors/units.js failed, using placeholder units`.
- Q12 [minor, battle] Boss levels with XL units clump: m8_l15 wave 2 enemy Kingpin/Leviathan/Widowmaker visibly overlap each other on the enemy side (b_m8_l15_2.png). m3_l14 wave-2 entrance: an enemy Lancer is drawn outside the board above the back wall next to the speed button for a moment (b2_m3_l14_1.png).
- Q13 [polish, audio] Elderbark (m6 fantasy boss) plays the sci-fi `boss` track; m6 normal levels get `rift`. Intentional per audio.js (boss wins) but the ruins boss would suit a fantasy boss cue.
- Q14 [polish, ui] Rift Gate x10 reveal uses the sci-fi cyan card frames under the stone/gold header; "HORDE SHAM..." name truncates. r_pull7.png.
- Q15 [polish, ui] Tap targets under 44 px: Settings segmented buttons 40x36 (Low/Med/High, x1/x2/x4, On/Off), Events GO buttons 41x40, Arena/Formation sm buttons 40 tall, hub labels 36 tall. Fullscreen button sits at x=362 on most screens but x=316 on hub/settings (ui-5 in flight).
- Q16 [major, ui] Android back / browser back during a battle silently leaves it: `#/battle` -> `#/formation/m2_l3`, no "Retreat?" confirm, the fight is just gone. Then Forward goes to `#/map/2` (not back to the battle), so history is inconsistent. Repro: hub -> map 2 -> node -> Deploy -> Engage, then `history.back()` 3 s in. nav_back_battle.png. Expected: back opens the pause/retreat sheet (same as the menu button) and the route stays on #/battle until confirmed.
- Q17 [major, battle+ui, D24 landscape in flight] Landscape phone 915x412 touch, mid-battle rotate: no rotate hint, HUD moves into side columns but the battle camera shows only the stands - the board and all units are below the frame (land_battle.png). 1280x800 desktop is now a full-width landscape layout: battle camera is far too close, units fill the middle and a near unit covers the bottom centre (d1280_battle.png - that run also had placeholder units from Q11). LANDSCAPE.md BATTLE-L work has not landed; rotating mid-battle should at least re-fit.
- Q18 [minor, ui] Unit profile: RANK UP button is gold/enabled before the unit reaches its level cap; tapping gives "Reach the level cap first". CONVERT spends all surplus shards immediately with no confirm (e.g. "+690 chips from 230 shards" on a legendary). Disable Rank up below cap; confirm Convert. All 44 units, no console errors.
- Q19 [minor, robots] Profile turntable framing (createTurntable): Tarantula overflows the stage on both sides and its plate is hidden (units/u19_tarantula.png); Rattler, Needle and Wisp plates are cut at the frame edge; hovering units (Needle, Prism, Wisp, Specter) float far above an oversized plate. Every one of the 44 models renders (no placeholders) - sheet0.png / sheet1.png.
- Q20 [minor, perf, ui] Cold boot loads 124 JS modules / ~4 MB unbundled; locally with cache off it took 9.4 s, and model files (paragon/seraph/arbiter/...) each waited ~5 s in the request queue. On a phone over LAN/4G that can cross the 20 s boot watchdog, which fails on wall-clock even while modules are still arriving. Consider: watchdog fails only when progress stalls, and lazy-load unit model files.
- Q21 [minor, perf, battle] Real m8_l15 battle on high: 60 fps, 153 calls, 302k tris, but **cpu 9.2 ms/frame** vs 4.8 ms for a heavier 6v6 in tools/battle_test (?perf=1: high 162 calls/389k tris/4.8 ms; med 163/320k/4.7 ms; low 126/110k/4.5 ms; real low 114/92k/3.8 ms). The in-game extra ~4 ms (DOM HUD/overlay?) is the thing to watch on the S22. M5 numbers, GPU shared with other agents.
- Q22 [polish] tools/battle_test.html requests /favicon.ico -> 404 in the console.
- Q23 [minor, ui] Background mid-battle: the fight correctly stops (frozen 5 s / hidden 4 s, integrity unchanged, audio ctx suspended) but no pause sheet is shown on return - the battle resumes instantly. Opening the pause menu on visibility return would be kinder on phones.
- Checked OK: save survives reload; slot 3 at m1_l5 / slot 5 at m3_l14 per MAPS.md (dev clears); Patch joins on m1_l3 first clear (NEW RECRUIT on results); workshop unlocks after m1_l2 (store.isUnlocked); fantasy arena + stone HUD on m6; boss music; recruit x1/x10 all 7 banners; arena win (+15 rating, tokens); raid win; settings sliders/toggles render; every unit card in Barracks has a 256 px portrait.

---
# QA-L (landscape + D26 intro + portrait loader round, 2026-10-19, CDP 9434, M5 metal, touch emulation for phones)
Scripts/shots: scratchpad/qaL/. drive.mjs (driver), audit.js + sweep.mjs (per route: data-orient/form/l-short, horizontal page
scroll, buttons off-screen outside a scroller, interactive elements inside the ?insets zones), t_rot.mjs (9.2.1), t_rot2.mjs (9.2.2),
t_rot3.mjs / t_hyst.mjs (9.2.3/9.2.4), t_intro.mjs, t_misc.mjs, t_modal.mjs, t_barr.mjs, t_loop.mjs (full loops), t_lv.mjs, t_bin.mjs,
t_rev.mjs (old list), t_hudp*.mjs (HUD portraits). Contact sheets cs_*.png.

## Status: pass complete. Counts: 0 blocker · 0 major · 6 minor · 7 polish (new). Old list: every major fixed.

## Matrix results (§9)
- **Portrait regression** 412x915, 390x844, 360x780 and URL-bar heights 412x785, 390x714 (+ 412x780, 390x700, 360x640 formation):
  12 routes each, zero console errors, no h-scroll, no action off-screen. Formation roster row (74x100) + ENGAGE visible at every
  height (ENGAGE 412x780 y714-770, 390x700 y634-690, 360x640 y574-630). cs_390x714.png, cs_412x785.png, rv_form_*.png.
  1280x800 with Layout = Portrait column: #app 450x800 centred (D3 column); switching back to Auto mid-battle re-lays out live (col_battle_auto.png).
- **Landscape phones** 915x412, 915x360, 844x390, 844x340, 960x412, 740x360 (12 routes each) + 915x360 / 844x340 / 915x412 with
  `?insets=0,47,21,47`: all `landscape/phone/l-short`, zero console errors, no h-scroll, no primary action off-screen. Only inset hit:
  the story map head (QL3). Battle with insets: HUD, grid, rail all inside the safe area (bin_915x360.png).
- **Tablet** 1024x768, 1180x820, 1366x1024 (landscape/tablet), 768x1024 (portrait/tablet column); **desktop** 1280x800, 1440x900,
  1920x1080, 2560x1080 (landscape/desktop), 1000x900 starts portrait: all clean (cs_1024.png, cs_1920.png). Note: shots above ~3 Mpx
  needed jpeg capture (CDP png hung) - test artefact.
- **9.2.1** 412x915 -> 915x412 -> 412x915 mid-fight: same scene object, same 4 `.pc` nodes, sim tick strictly rising [26,41,57,74,90],
  lane profile tall->wide->tall and margins switch within 60 ms, 60 fps in both, no errors. PASS.
- **9.2.2** rotate during drop-in, right after an Overdrive fire, while paused (modal kept, tick frozen), and on the VICTORY banner; then
  rotate on results: all PASS, no errors (r2_*.png). Overtime plate not provoked.
- **9.2.3** formation mid-drag rotate: ghost removed, unit kept (squad still 4). Recruit x10 mid-reveal rotate: finishes, 10/10 portraits.
  Unit profile reframed (r3_unit_L.png).
- **9.2.4** desktop width drag at h 900: 1300 -> 900 -> 1300 flips exactly once each way (portrait at 940, landscape at 1040). See QL13.
- **9.3 / QA-L loops**: full loop hub -> map -> sheet -> formation -> battle -> results -> map -> recruit -> reveal -> unit -> settings by
  real taps at 915x360 and at 412x785: zero console errors, every tapped action fully on screen (cs_loop_915x360.png, cs_loop_412x785.png).
  HUD card size: 915x412 78x112 and 844x340 62x88 (QL2). Fantasy m6_l16 at 915x412 / 844x340: stone HUD, 6/6 portraits, 122 calls.
- **D26 intro**: bar (DON'T SHOW AGAIN + SKIP) appears ~250 ms into the intro, bottom-right above the strip in portrait / corner in
  landscape; sim tick stays 0 during it. SKIP lands in ~490 ms. DON'T SHOW AGAIN -> toast "Battle intro off · turn it back on in
  Settings", setting false, next load no intro. Settings "Battle intro: On" brings it back. `&nointro` off. Retry from results -> no intro
  (session rule). Rotate 1 s into the intro: intro continues, bar re-anchors to the landscape corner, lands correctly (mi_intro_rot*.png).
- **Barracks loader** (cache off, 46+ cards): cold (IndexedDB deleted, fresh save) cards at 9 ms, all art 1.84 s (412x915) / 1.90 s
  (915x360), 13-14 long tasks, max 72-84 ms, none > 100 ms. Warm reload: all art 60 ms, 0 long tasks.
- **Back during battle**: history.back() -> stays #/battle, PAUSED sheet, sim frozen; Forward stays; Retreat -> results. PASS (QL4 aside).
- **Modals across routes**: arena shard picker + route change -> closed (Q9 fixed).

## Specific check: battle HUD portraits (manager's landscape shots)
- **Not reproducible on the current tree.** 8 runs: portrait + landscape, cold (IndexedDB deleted) and warm, ENGAGE tapped the instant
  it appears (12 formation renders still queued), 1600x900 desktop like promo.mjs, fantasy m6_l16 6-unit squad, both full loops:
  every run has all cards filled (6/6 within ~1.5 s of the battle start, 4/4 immediately when the formation rendered them).
- Cause of the shots: the role-icon-only HUD is battleL/g_m6_l16_915x412.png (BATTLE-L's game.mjs, 21:31-21:32). ui-L was rewriting
  js/ui/portraits.js at that moment (file saved 21:33:22). The manager's promo_m1/m3.jpg at 21:39 already show portraits.
- QL1 [minor, ui] **Latent cause that can still produce exactly this:** portraits.js never retries a failed portrait. `render()` ->
  `done(j, null)` resolves the job but leaves it in `jobs`; every later `fill()` for that key adds its art to the already-resolved job,
  so that card keeps its role icon for the whole session (HUD, roster, barracks alike). `put()` also has no `img.onerror`. Triggers:
  `units.renderPortrait` missing (units stub after a failed module fetch at boot), a throw (context loss), a bad IndexedDB blob.
  Fix: on a null/failed render delete the job (retry on the next fill, with a cap), and onerror -> drop the cached URL / IDB key.

## New findings (QA-L)
- QL1 [minor, ui] see above (portrait failures are cached for the session).
- QL2 [minor, ui] Landscape HUD cards under the §9.3 sizes: 844x340 = 62x88 (target >= 68x97), 915x412 = 78x112 (target >= 80x114).
  Repro: `?dev=1&fresh&god=1&level=m6_l16`, Engage, measure `.pc`. lv_m6_l16_844x340.png. Readable, but the spec floor is missed.
- QL3 [minor, hub] Story map head ignores side insets in landscape: `.vpm-back` sits at x=16 with `--sal` 47 (under a notch), and the
  stars / "1/14 CLEARED" reach the right edge under `--sar`. Repro: `?dev=1&fresh&insets=0,47,21,47&level=m3_l2`, `#/map/3` at
  844x340 / 915x360 / 915x412. sw_844x340_in_sheet.png. (Every other route honours the insets.)
- QL4 [minor, ui] Back with a battle modal open (Squad status or Info) stacks PAUSED on top of it (two modals). Android Back should close
  the top modal first (and only then open Paused). Repro: battle, tap the squad icon, history.back(). mo_battle_back.png.
- QL5 [minor, battle] Old Q12 still open in landscape: m8_l15 wave 2 XL enemies (Kingpin / Leviathan / Widowmaker) overlap into one
  mass. Repro: `?dev=1&fresh&god=1&onehit=1&level=m8_l15` at 915x412, wait for round 2. lv_m8_l15_915x412_w2.png.
- QL6 [minor, battle] The Overdrive callout sits on the CHEATS chip / far-lane HP bars and damage numbers draw through it ("SUPPRESS201")
  in landscape. r2_od.png. (BATTLE-L lists it as open.)
- QL7 [polish, ui] Map level sheet with `--sab` 21: the sticky DEPLOY SQUAD floats mid-sheet with a goal row visible under it.
  sw_844x340_in_sheet.png.
- QL8 [polish, ui] Barracks in landscape: SOVEREIGN PALADIN wraps into the Lv / stars on the squad mini-card and the grid card.
  barr_cold_915x360.png.
- QL9 [polish, ui] 1920x1080 formation: small field and type, right column top-anchored with ~600 px of empty space above POWER /
  ENGAGE. sw_1920x1080_formation_m3_l2.png.
- QL10 [polish, ui] Unit profile at the level cap: the disabled LEVEL CAP button keeps the bright primary fill with a faint label (reads
  as broken); landscape turntable stage is flat black. sw_915x412_unit.png.
- QL11 [polish, battle+ui] Fantasy intro start pose shows the flat ground and a hard backdrop edge above the ruins wall (battle: known
  open); SKIP / DON'T SHOW AGAIN use the cyan sci-fi buttons over the stone HUD (ui). lv_m6_l16_915x412_intro.png.
- QL12 [polish, ui] Remaining sub-44 px targets (landscape formation): W1/W2 tabs 40x30, FIT GOALS 32 tall, buff chips 34 tall.
- QL13 [polish, manager/docs] LANDSCAPE.md §9.2.4 says drag 1300 -> 1000 -> 1300 at h 900 flips once each way, but 1000/900 = 1.11 is
  inside the 1.05-1.15 band, so it never flips (correct behaviour). Use 900 in the spec.
- Dev-only: the landscape DEV badge covers the lowest HUD card / dock button (known, ui).

## Previous list re-verified
- FIXED: A1 / A1b (roster + ENGAGE at 412x780, 390x700, 360x640, 412x785, 390x714), A1c (arena touch-scroll: last shop button
  763 -> 636 at 390x700), A2 (fullscreen toggle everywhere), A3 (badge reservation; portrait battle intentionally none), Q1, Q2 (m1_l1
  goals now win / no losses / time - code), Q3 (hub-4 44 px hit bands; fresh save says START), Q4 (sim: mutual KO = win), Q5 (D27 eased
  m1), Q8 (picker lists every owned unit, Cancel, nothing off-screen), Q9, Q10 (#/chapters -> #/map/1), Q11 (modules.js + battle retry,
  code), Q16, Q17, Q18 (RANK UP disabled below cap), Q20 (watchdog = 20 s without progress), Q21 (not reproduced: in-game cpu 1.8-2.0
  ms here), Q22 (battle_test favicon data:), Q23 (hidden -> visible opens PAUSED).
- MOSTLY FIXED: Q15 (settings / events / sm buttons 44; landscape formation leftovers = QL12). Q19 (robots-5 fit; spot-checked only).
- STILL OPEN: Q12 (= QL5), Q6 (results thumbnail lighting, polish), Q14 (rift x10 frames, polish), Q13 (fantasy boss cue, polish),
  Q7 (Patch silhouette, not re-checked).
- REGRESSED: none.
