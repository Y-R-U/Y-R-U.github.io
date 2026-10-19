# qa agent notes (bug list) — owns only this file + scratchpad/qa

Test driver: scratchpad qa/drive.mjs (CDP 9434, touch emulation via Emulation.setTouchEmulationEnabled + Input.dispatchTouchEvent), lib.mjs (btns/overflow/small audits), t*.mjs per step.
Screens: scratchpad qa/*.png. Base URL http://localhost:8888/gms/3d/vectorprotocol/

## Checkpoint 1
- DONE: fresh boot (no dev) 412x915 touch, hub label taps (all 7), map 1, level sheet, story scene, formation, battle m1_l1, results.
- DONE: Aaron's phone findings checked (A1 confirmed + 2 more of the same class). Real play m1_l1..l4 (fresh save, touch): story scenes, hints, Barracks level-up, save survives reload (slots/stars/hash #/hub).
- DONE: all 8 bosses won in dev (god+onehit) at 412x915 touch: Big Rusty, Redline, Corona, Stormcrow, The Choir, Elderbark (fantasy ruins + stone HUD), Aurelian, Vector Prime. 0 console errors, 3/3 stars, results OK. Music: map->boss->hub per route.
  Recruit x1/x10 on all 7 banners incl. Rift Gate (no errors). Arena fight + shop, Special Ops, Raid: Dreadnought won. HQ/settings/events/chapters audited.
- NEXT: unit profile every unit, perf, landscape/back-forward/background, 1280 desktop.

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
- Q1 [MAJOR, ui] **Formation drag & drop does not work on touch; dragging a placed unit REMOVES it from the board.**
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
