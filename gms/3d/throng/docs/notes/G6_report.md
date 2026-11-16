# G6 report: fixes from the phone test (2026-11-17)

All six items done. Nothing committed. The sim did not change: `sim_test` passes, including the pinned Classic stub hash.

## Suites (run on the final tree)
- `node tools/sim_test.mjs`: PASS (73 s). `node tools/meta_test.mjs`: PASS. `node tools/render_map_test.mjs 100`: ALL PASS. `node tools/net_test.mjs` (classic): PASS, 0 failed. `server/` was not touched, so `server/test.sh` was not run.
- New tests: `tools/threat_test.mjs` (node), plus three CDP tests: `tools/hud_nearby_test.mjs`, `tools/layout_test.mjs` and `tools/quality_test.mjs`. Each CDP test needs `~/.claude/bin/cdp start --port N -- --use-angle=metal` and a `python3 -m http.server` run from the site root (`--base` defaults to `http://127.0.0.1:8761/gms/3d/throng/`).

## 1. Nearby-crowd indicators
**Files:** `js/ui/hud.js` (badge and arrow layout rewritten), new `js/ui/threat.js`, `css/ui.css` (threat styles, real `<s>` pointer element), `docs/CONTRACT.md` (hooks).
- **Labels.** Every crowd whose centre is on screen gets a count label. Each label has a threat chip on its left: red ▲ means it can absorb you, green ▼ means you can absorb it, grey = means neither can, and a blue shield means a friend. Danger, prey and friend labels also get a ring in the threat colour. Your own label has no chip.
- **Edge arrows.** A crowd that is off screen (centre off screen, including one that only pokes into view) gets an edge arrow if it is in range. The arrow is filled with the threat colour, shows the threat glyph and the count, and has a crowd-colour stripe on its left. Range = 1.3 × the screen half-diagonal in metres at your crowd, so it grows as the camera zooms out. Arrows are capped at the 4 nearest by edge-to-edge distance.
- **Leader.** The leader keeps its arrow at any range and wears a crown on it. One pool of 5 arrow elements holds the leader and the 4 nearest, so the same crowd never gets two indicators. The old leader-only arrow is gone.
- **Threat rule.** `threatOf` copies `stepSteals` in sim.js:
  - friends never trade: teammates, or two hordes;
  - nothing happens when the counts are equal, the ratio is under 1 + `stealDeadzone` (0.06), or either crowd has spawn protection;
  - otherwise the bigger crowd absorbs the smaller.
- **What this means per mode.** In Infection, survivor vs survivor and survivor vs horde both follow the count rule; horde vs horde is friendly. In Teams, teammates are friendly.
- **Placement.** Nothing may cover the HUD rectangles: timer, pause, kills, mode pill, leaderboard, minimap, power-ups, team bar, net pill, zone warning, the account badge (`.fab` read from its shadow root) and the joystick while it is up.
  - A label that would cover one is nudged out of it (two levels of search). If it cannot be placed, it falls back to an edge arrow. A label that still collides is dropped, nearest crowd first wins.
  - Arrows slide along the screen-edge perimeter until they clear the HUD and every indicator already placed. The rectangles include the rotated pointer.
  - The King zone arrow and the LCS "SAFE" arrow use the same placement and are placed first.
- **Kick-off crown (item 6b) lives here too.** The leaderboard crown, the leader arrow crown and the 3D crown all use `outrightLeader`.
- **Cost.** No DOM is created per frame. Labels and arrows are pooled; transforms, classes and text are written only when they change. HUD rects are measured every 500 ms, and immediately when the board height, the power-ups or the joystick change.
  - Mean `hud.update` time on the M5 in headless Chrome, measured by wrapping `__game.hud.update` over 24 samples:

    | Viewport, mode | Before G6 | After G6 |
    |---|---|---|
    | 384x692 Classic | 0.350 ms | 0.381 ms |
    | 384x692 Teams | 0.435 ms | 0.469 ms |
    | 1440x900 Classic | 0.160 ms | 0.196 ms |
    | 1440x900 Teams | 0.183 ms | 0.241 ms |

    That is about +0.03 to +0.06 ms a frame. p95 stays at or under 1.2 ms. Not measured on a phone.
- **Verified, part 1: `tools/threat_test.mjs`.** It parks two crowds on top of each other in the real sim (neutrals and pickups off) and checks that the HUD's tint predicts the steal the sim actually makes.
  - 23 cases across all five modes, including teammates, horde/horde, horde/survivor, the 1.04 / 1.05 / 1.07 ratio edges and spawn protection. 13 of them steal. PASS.
  - Break arm `--break=rule` (dead zone 0) fails 4 cases. `--break=lead` (crown on ties) fails 4 crown cases.
- **Verified, part 2: `tools/hud_nearby_test.mjs`.** Sizes 384x692, 844x390 and 1440x900 × all 5 modes, 24 sampled frames each, practice on autopilot with `?seed=7`. The account badge is loaded, so it is checked too.
  - In each sampled frame the page re-derives everything from the state and the DOM:
    - every alive crowd on screen has a label, with the right count and tint;
    - every in-range off-screen crowd, and the outright leader, has an arrow with the right count and tint, except where the 4-arrow cap applies (checked to apply only when 4 arrows are already shown);
    - arrows point at their crowd within 20°;
    - no indicator rectangle (label + tail + chip; arrow box + pointer + crown; zone arrow) hits a HUD rectangle, another indicator or the screen edge;
    - no crowd has both a label and the leader arrow.
  - Result: 15/15 runs PASS; 0 drops, 0 problems. 940 of the 948 required indicators were present; the other 8 crowds were beyond the 4-arrow cap.
  - Break arms all fail. `--break avoid` (no HUD avoidance) reports labels under `lb` and `mm-wrap`. `--break threat` reports wrong tints. `--break arrows` (leader only) reports "crowd N in range, off screen, no arrow".
  - I looked at the screenshots: classic, teams, koth and infection at 384x692; teams and lcs at 844x390; lcs at 384x314. Arrows hug the edges and stay clear of the timer, board, minimap and badge. Friendly shields read in Teams. The leader arrow carries its crown. The zone arrow sits beside them.
- **Not verified.**
  - Online guest and host were not run in a browser with the indicators. The code path is the same `hud.update` on `match.net.state`, which carries `count / alive / protect / team / horde`, and `net_test` passes.
  - Left-handed HUD was not tested.
  - The interpolated-versus-current position test skips crowds within 8 px of the screen edge.
  - The label size is estimated rather than measured; the test checks the real rectangles.

## 2. LCS knock-out banner
**Files:** `js/ui/hud.js`, `css/ui.css`, `js/config.js` (`UI.outBanner: 3`, a UI constant the sim does not read).
- **Text.** "OUT!" / "Knocked out by <name>" (or "The circle got you") / "No respawns in Last Crowd Standing". The " — respawning…" suffix is suppressed (`.dead-veil.final`).
- **Name.** The name comes from the `elim` event's `by`. If that event was missed (catch-up after a hidden tab), it falls back to whoever stole from you in the last 2 s, or the circle if you were bleeding.
- **Collapse.** After 3 s the banner shrinks to a small "SPECTATING <leader>" chip at the bottom centre, above where the net pill sits.
- **End of match.** In every mode, the banner and the chip hide as soon as the phase is `over`, so nothing sits under "X takes it".
- **Verified with `tools/layout_test.mjs` (lcs).** At 5 sizes, the player is knocked out on top of the biggest crowd:
  - the title is OUT!;
  - no "respawning" text, including the `::after` content;
  - the banner names that crowd;
  - the banner does not overlap the HUD;
  - after 3.4 s there is no banner and the chip is visible, inside the viewport and clear of the HUD;
  - at the real-time finish the winner toast shows with no banner or chip.
- **Classic still works.** The `absorb` check: "ABSORBED!" / "by <name>" plus " — respawning…", and it clears on respawn. PASS.
- **Baseline.** The same checks on the committed pre-G6 build (served from a `git archive HEAD` copy) fail: respawning text, name, banner over the board, no collapse, banner still shown at the end.

## 3. Mouse setting
**Files:** `js/ui/panels.js`, `css/ui.css` (the old `@media (hover: none)` rule is removed).
- The row shows when `(any-pointer: fine)` matches and either the device is not touch-first (`pointer: coarse`), or a real `pointerType: 'mouse'` move has been seen.
- **Why the extra condition:** the S22 Ultra's S Pen is a fine, hover-capable pointer, which would explain why the old `hover: none` rule kept the row visible on Aaron's phone. With this rule a phone with a mouse attached shows the row once the mouse moves, and a stylus alone does not. This is my reading, not confirmed on the device.
- **Verified with layout_test (mouse):**
  - touch-emulated phone: hidden;
  - stylus phone (matchMedia stubbed to any-pointer fine + pointer coarse, because CDP ignores pointer media emulation): hidden;
  - the same phone after a synthetic mouse `pointermove`: shown;
  - desktop: shown.
  - Baseline fails both "hidden" cases.
- **Not verified on the S22 itself.**

## 4. Adaptive quality both ways
**File:** `js/render/renderer.js` (plus `docs/CONTRACT.md`).
- **Ladder.** lite@1 → medium@1.5 → medium@2 → high@2. Touch Auto starts at medium@1.5 and may climb to medium@2. Desktop Auto starts and tops out at high@2. Manual picks pin, as before.
- **Down.** 3 windows of 0.5 s under 45 fps, as before.
- **Up.** 16 windows (8 s) at 55 fps or more.
- **Hysteresis.**
  - The 45 / 55 band.
  - A 6 s probation after each climb: 3 windows under 55 count as a failed climb and step straight back.
  - Each failed climb doubles that level's wait (×2 up to ×16). A climb that does not hold costs about 1.5–3 s of sub-55 frames, then backs off.
- `stats().adapt` reports `{ level, max, on, ups, downs, fails }`.
- **Verified with `tools/quality_test.mjs`** (384x692, dpr 2.81, touch, CDP CPU throttle 60×; 10× does not slow the M5 at all). PASS:
  1. Throttled, it steps down to lite@1 in about 3 s.
  2. Un-throttled, it climbs lite → medium@1.5 → medium@2: 9 s, then 15 s, at dpr 2.00.
  3. Throttled inside the probation window, `fails[2]` increments, and the next climb took 17 s against 9 s before.
  4. Held 20 s at 60 fps with no level change.
- **Break arms.** `--break up` (`_dbg.adapt.noUp`) fails stage 2 (it stays at lite). `--break down` (adaptive off) fails stage 1 (it stays at level 1 at 9.6 fps).
- **Not verified.**
  - Real phone GPU behaviour. Throttling is CPU-only, so a fill-rate-bound phone at dpr 2 is untested.
  - Whether the S22 holds 55+ at medium@2 with 950+ figures. If it does not, probation steps it back and the waits grow.

## 5. Tiny and near-square viewports
**Files:** `css/ui.css`, `js/ui/hud.js` (board rows).
- **Narrow landscape (≤ 560 px wide).**
  - Results become a single column with vertical scroll. Left padding drops to 10 px; the right padding keeps the account badge space.
  - The buttons wrap.
  - The board is 11.5em wide.
- **Board rows.** The board shows 3 rows when the viewport is under 420 px tall and under 600 px wide. 844x390 keeps 5.
- **Short screens (≤ 420 px tall).**
  - The knock-out banner sits low and smaller.
  - Toasts move to 36% when the screen is also narrow; at 314 px tall a toast was covering the board.
- **Verified with layout_test at 384x314, 384x360, 360x300, 384x692 and 844x390. PASS:**
  - menu: no sideways scroll, every menu control inside the viewport;
  - HUD: no overlaps between timer, pause, kills, mode pill, board, minimap and account badge. The gap between the left HUD and the board is now 76 / 49 / 52 px; on the baseline it was 42 / 11 / 18 px. 12 px is the pass line. This is how I explain the phone overlap at 384x360: larger fonts on the phone than headless;
  - results: no horizontal scroll in the card or the page, Play Again and Menu inside the card, the card clear of the badge, Play Again reachable by scrolling.
  - Baseline at 384x314 and 360x300: the card scrolls sideways (492 px of content in 256 / 232 px), Play Again and Menu are clipped, and OUT! overlaps the board.
  - I looked at the menu, results and LCS screenshots at 384x314 and 360x300.
- **Not fixed.** At 360x300 the menu's top-right coin pill is cramped: the coin icon touches the digits. It was cramped before G6 and is not clipped.

## 6. Small display oddities
- **(a) Leaving early.** `js/ui/results.js`: when you leave, your row moves to the bottom and everyone below you moves up one rank. Verified with layout_test (leave): rank 1 at the time of leaving → row 8 of 8, "Counted as last place". Baseline: row 1 of 8.
- **(b) Kick-off crown.**
  - `outrightLeader` in `js/ui/threat.js`: the leader must beat every other crowd on the mode's ranking keys (Classic count; Teams team score then count; LCS standing then count; King and Infection score then count). It is used by the leaderboard crown, the arrow crown, the label lift and the renderer's 3D crown (`renderer.js` `updateCrown`, also hidden during the countdown).
  - Verified with layout_test (crown) and threat_test.
    - All 8 crowds on 4, countdown and kick-off: 0 board crowns and the 3D crown hidden.
    - After 15 s with an outright leader: crown on the board.
  - Baseline shows a board crown on the tie.
  - The 3D-crown assertion uses a `userData.isCrown` tag that the baseline lacks, so it is only shown to pass, not shown to fail.

## Scratch
- Screenshots: `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g6/shots/` (nearby) and `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g6/lay/` (layout).
- Pre-edit copies of the touched files: `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g6/orig/`.
- All Chrome instances and HTTP servers I started have been stopped.
