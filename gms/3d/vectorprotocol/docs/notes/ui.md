# ui agent notes (index.html, js/main.js, js/app/*, js/ui/*, css/*, tools/ui_kit.html)

## Checkpoint (2026-10-19, ~T+100min) — phase hand-back
- DONE: everything below + **3D battle integrated** (js/battle/battle.js createBattleScene; HUD driven by its `state`; I pass `overlay: root`, `margins:{top:64,bottom:150}`;
  if `scene.ready` rejects I swap to the tactical-feed fallback). Story dialogue overlay js/ui/dialogue.js (DATA.story.scenes pre before an uncleared level, post on first clear).
  Banner/feature/buff/event gating from DATA.features + `unlock` keys (`?unlockall` URL flag bypasses). New saves are named "Nightshift Contracting".
- Screens: hub (3D compound), map (hub's story map + my level sheet), formation, battle (3D), results, barracks/workshop, unit profile (3D turntable), recruit + reveal, HQ, arena, events, settings. tools/ui_kit.html.
- Design follow-ups applied: synergy `desc` in formation tooltips, unit `title`+`fantasy` on profile. Pre-scene plays on Engage (design suggested before the squad screen — consider moving it to the level sheet Deploy tap).
- NEXT (fresh agent): results screen is sparse (add MVP/battle stats from result.stats); pause uses engine.stop() (battle has no setPaused);
  arena/event battles skip the formation screen (use current formation) — consider routing them through formation; recruit x10; HUD status icons; tutorial hints.

## How integration works
- `js/app/modules.js` AVAILABLE map: a module path is set only once it exists (D19). Loads are dynamic + try/catch → stub on failure.
- Store: `js/app/store.js` is the UI facade. Stub backend saves to `vectorprotocol.ui-stub.v0` (NOT the sim's key). `adaptSim()` will wrap js/sim/game_state.js.
- Screens: `js/app/screens.js` registry; a screen's mount() returns {scene?, topbar?, bg?, unmount?}. Scene is set on the engine; engine.stop() when no scene; old scene dispose()d.
- `window.__vp` = {ready, route, state, store, modules(), router, screens, engine, battle(tactical feed)}.
- Test driver: scratchpad ui/drive.mjs (CDP port 9406).

## Requests
- battle: (1) `setPaused(bool)` + `forfeit()` (I fall back to engine.stop()). (2) your VICTORY banner shows; I suppress mine when the 3D scene is up. (3) keep honouring `margins` so the board's near edge sits above my 150px portrait strip.
- robots: `createUnit({model:'bulwark'})` throws in PartBuilder._push (parts.js:43) at every rank — battle falls back to a placeholder (enemy m1_l2+ uses it).
- battle: `createBattleScene(engine, {playerSquad, enemyWaves, seed, arena, data, auto, speed})`. I call `scene.on('state', s)` expecting the **sim's state shape** (state.player/enemy.{integrity,units[{id,slotIndex,hp,maxHp,hpPct,chargePct,overdriveReady,alive,stunned,level,role,faction,rarity,model,abilities}]}, wave, waves, auto) and `on('end', result)` with the sim result ({win, stars, reason, ...}). Also nice: `setPaused(bool)`, `forfeit()`. I start it with `scene.start()`.
- robots: units.js currently imports a missing `./registry.js` (404 → my loader falls back to no portraits). renderPortrait(model, {rarity, faction, engine, renderer, size}) → I accept dataURL/ImageBitmap/canvas/img.
- hub: (a) locked-label hints come from your own table ("Arena: clear mission 1-6", "HQ: company level 3") but DATA.features says arena=m2_l4, hq=m1_l12, recruit_street=m1_l4, daily_ops=m2_l10 — please accept `hints:{id:text}` in createHubScene opts/setState (I'll pass them) or read DATA.features. (b) assets/maps/m1.jpg 404s in the console before your procedural fallback kicks in. createHubScene(engine, {companyLevel, unlocked, container}) — I pass my screen root as `container` for your labels. createStoryMap(container, {mapId, map, progress, isOpen(levelId)}) → on('level', id); I call dispose() on leave.
- sim: js/sim/data.js probes ../data/index.js with a dynamic import → a 404 in the console until design ships it (I don't use sim/data.js for that reason).

# ui-2 (second round)
## Checkpoint 2 (2026-10-19) — round done, all tested at 412x915 / 390x844 (touch emulation) + 1280x800, no console errors
- DONE
  - Battle: hud.margins() (real top-bar bottom / strip top) -> scene.setMargins via ResizeObserver; hud.setBanners(false) when the 3D scene is
    up (no duplicate ROUND/OD/VICTORY); pause = scene.setPaused; Retreat = scene.forfeit() then its 'end' (WITHDRAWN banner, real stats), 4 s fallback.
  - HUD status chips (up to 3, debuffs first, + shield chip) top-left of each portrait; STATUS_ICON in hud.js, new icons flame/spiral/slow/down/crack/taunt/eyeoff.
  - Results: MVP panel (portrait, dmg/support/kills; "Top performer" on defeat) + after-action rows (dmg bar vs best, heal, shield, taken, kills, DOWN, XP bar).
  - Formation routes: #/formation/<levelId> | #/formation/arena/<i> | #/formation/event/<evId>/<tierId> (target() in scr_formation.js). Arena + events go through it.
  - Story briefing (pre scene) plays on the level sheet's Deploy tap, once per session (ctx.session.preSeen).
  - #/chapters (scr_map.js mountChapters) = hub's createMapSelect under my header; map back -> chapters when >1 chapter open; locked /map/N redirects.
    Map keeps hub's title row + DEPLOY bar (it opens my level sheet: intel/rewards -> Deploy squad). Hub gets real unlocked list + features: DATA.features.
  - Recruit: x1 / x10 per banner (store.recruitMany, revealMany: pod charge to best rarity, 5x2 grid flip, NEW / +shards, tap card -> profile).
  - js/ui/tutorial.js: hint(store, key, anchor, text, {place, delay, life}) once per key (settings.hintsSeen), only while m1_l1..3 not all cleared,
    settings.hints=false disables. Hints: formation board, Overdrive (near full charge, anchored on the portrait, 7 s), hub Barracks dock (after 1st clear),
    Barracks first card, unit Level up. screens.show() closes open hints.
  - Long card names shrink (cqi) / wrap to 2 lines (components.js nameEl). Touch-target pass: sheet close, wave tabs, buffs, Skip, tabs, HUD side buttons, sm buttons.
  - store.isUnlocked also honours G.save.features (sim's own gate) — the sim refuses startArena etc. on ?unlockall alone.
- Test scripts: scratchpad ui2/drive.mjs (touch emulation), tour2.mjs (fresh save + tap/overflow audit), tour3.mjs (recruit x10, arena/event formation, pause/withdraw, chapters).
- NEXT: HUD strip with 1-2 units looks small vs the ref (5 cards); maybe scale cards up when few units. Results could show enemy MVP. Pre-scene skip button overlaps nothing now.

## Requests (ui-2)
- battle: the "UNIT — OVERDRIVE / ability" callout panel sits top-left over my squad/info buttons (hud-left, top ~58-150 px). Please place it
  below top+100 px or centre it; or accept margins.left.
- hub: .vpm-back is 38x38 (want >=44 for touch). Map CTA on a locked chapter shows "BOSS CONTRACT / DEPLOY" (I now redirect locked maps, so low priority).
- robots: unit profile turntable plate colour for rogue Scrapper looked gold/purple, not orange (check faction plate in createTurntable).

# ui-3 (third round)
## Checkpoint 1
- DONE: audio wiring (js/app/sound.js lazy wrapper via modules.js 'audio'; main.js starts the load; scr_battle passes `audio: snd.forBattle(B)`);
  settings Sound on/muted + Music/Effects sliders + Field-manual-tips toggle; recruit/unit/results sounds.
  Star goals: level-sheet checklist (goalList in scr_map.js), formation open-goal chips with live squad-rule check + "Fit goals"
  (store.goalFormation), results goals tick in (NEW + reward), chest reveal overlay (chestReveal in scr_results.js), map chest bar under the title row.
  Rift Gate banner (stone/gold/Cinzel, pool list from bannerPool('rift'), disabled while empty). Surplus shards: unit profile Convert, Barracks Convert all + card badge.
  HUD: round box turns red "OT ×1.4" in overtime; 1-3 unit squads get bigger cards (strip[data-n]); Overdrive hint compact (no dimming, 250 px).
- NEXT: 390x844 + 1280 pass, surplus-shard screenshot, notes final.
## Checkpoint 2 (ui-3 hand-back) — tested 412x915 + 390x844 (touch) + 1280x800, no console errors from ui code
- DONE since #1
  - Formation: goal chips on one scrolling line + "Fit goals" (store.goalFormation -> board); buffs on one scrolling line (`.buff-row` nowrap)
    so the roster cards keep their 74x100 size at 390x844 (they were being squashed to ~55 px tall).
  - Unit profile: rank stars = maxRank+1 (was a hard 6); surplus row fixed (replaceChildren rendered a literal "null").
  - Chest bar sits under the map title row (measured from `.vpm-head`), not at the bottom (it covered hub's DEPLOY bar).
- Where things live: goalList()/chestBar() in js/ui/scr_map.js; chestReveal() + goal ticks in js/ui/scr_results.js; rewardChips() in components.js;
  `chest` icon; snd wrapper js/app/sound.js (snd.sfx/sting/forBattle/getVolumes/setVolumes/mute, all no-op until js/audio loads);
  `btn(..., {sfx:'none'|name})` sets data-sfx; tutorial hint opts `{compact, width}`; `window.__vp.hud` (debug, battle only); `window.__vp.audio`.
- Map node stars: hub's createStoryMap already draws 0-3 stars per node from `progress[levelId]`, which I fill from save.story.levels[id].stars
  (= goals done), so goal stars show without any hub-2 change.
- Test scripts: scratchpad ui3/loop.mjs (sim-clears 8 levels, then sheet -> formation -> battle -> results+chest -> map -> recruit -> settings),
  tour.mjs (fresh save, OD hint), ot.mjs (synthetic overtime HUD), shards.mjs, rc.mjs, form.mjs; drive.mjs W/H/MOB/P env.
- NEXT / open: Rift reveal overlay still uses the sci-fi pod (could get a gate variant); results don't separate chest rewards from the payout
  (payout is the sim's aggregate); ui_kit.html not updated with goal rows / chest bar.
## Requests (ui-3)
- audio: missing music/sting files are fetched and 404 (console "Failed to load resource" for map.mp3, battle_2.mp3, sting_victory.mp3, crowd.mp3)
  until they land. Consider a manifest/`ready` flag in tracks.js so an unshipped track is skipped without a request.
- hub-2: nothing required. Optional: a `chests` slot in createStoryMap's head would let the chest bar live inside your title row.

# ui-4 (fourth round)
## Checkpoint 1
- DONE: dev mode (js/dev/dev.js + dev_css.js, main.js dynamic import only under ?dev; store.js `_dev` suffix on save + settings keys,
  store.touch(), store.dev/saveKey). Locked ENGAGE (button turns into a red LOCKED state with the reason; blocked() notices for every
  {ok:false} reason). Two-line notice toasts (toast(msg, kind, life, {sub, icon})). Fixed a literal "null" after the formation goal chips.
  router.go dispatches popstate so audio switches music immediately. hud.setSpeed(s).
- NEXT: Rift gate reveal, ui_kit goal rows + chest bar, HUD strip empty slot frames, full loop test + boss + m6.
## Checkpoint 2
- DONE since #1: HUD strip = full row of 6 (cards centred, `.pc-empty` frames for open slots, `.pc-empty.locked` for story-locked slots;
  createHud opt `slots`); big-card level label no longer hidden under the HP bar. Rift reveal = stone gate (scr_recruit revealArt(rift):
  runes light in turn, portal opens, flares in rarity colour; gold Cinzel buttons). ui_kit: notice toast, LOCKED button, star goals, chest bar, 2-unit HUD.
- Boss m1_l12 played via `?dev=1&fresh&god=1&level=m1_l12`: victory, 3/3 stars, no console errors.
- NEXT: m6 fantasy battle, full loop at 412/390/1280, notes final.
## Checkpoint 3 (ui-4 hand-back) — tested 412x915 + 390x844 (touch) + 1280x800, zero console errors
- Dev mode (HEIRFRAME D24 pattern)
  - `js/dev/dev.js` (+ `dev_css.js`) is only fetched by main.js's dynamic import when the URL has `?dev` (verified: a normal boot loads
    0 files from js/dev and shows no badge). store.js adds the `_dev` suffix to BOTH keys (`vectorprotocol.save.v1_dev`,
    `vectorprotocol.settings_dev`), so the real save is never read or written in dev.
  - URLs: `?dev=1` (badge + panel) · `&level=m1_l12` (clears every earlier level through the sim, fills the squad, opens that level's
    formation) · `&map=6` · `&fresh` (new dev save + default dev flags) · `&god=1` · `&onehit=1` · `&story=1` (story scenes play; skipped by
    default in dev) · `&panel` (open the panel at boot).
  - Panel (gold DEV tab, left edge): jump to any map/level (bosses marked red), open map/chapters/hub; clear every level; all features +
    6 slots; reset dev save; set every currency, shards for every unit, max all; grant/set any unit (scifi + fantasy) at any rank/level,
    grant every unit, max the owned roster; god mode / one-hit toggles; battle speed (live in battle via hud.setSpeed); skip all hints;
    skip story scenes. `window.__vp.dev` exposes the same actions for agents (jump, openUpTo, clearLevel, clearAll, unlockFeatures,
    setCurrency, setShardsAll, grantUnit, maxOwned, flags).
  - Level clears go through the sim (`startLevel` + `completeBattle` with a 3-star win), so slots, features, chests and first-clear cards
    unlock exactly as in play. All 120 levels clear in ~30 ms.
  - God / one-hit: the sim has no cheat flags, so dev adds `player.mods.hp += 999` / `atk += 999` to the battle config (start* wrapped).
    God mode alone can still lose on the contract timer (m6_l3 timed out), so use both for bosses.
  - Verified: m1_l12 BIG RUSTY (god) VICTORY 3/3; m6_l3 + m6_l16 ELDERBARK (god+onehit) in battle-6's fantasy ruins arena, VICTORY.
- Locked ENGAGE: a locked level's ENGAGE is a red LOCKED button; tapping it (or any start failure) shows a titled notice with the fix
  ("Contract locked / Clear Rustline Docks · Night Shift first.", "Squad empty / Drag a robot onto a hex…"). `blocked(r)` in scr_formation
  maps every sim reason. Arena formation also checks its unlock. Audit: the other {ok,reason} sites already toasted `why`;
  remaining "silent" ones are intentional (refresh()'s live setFormation, selectBuff(null)).
- HUD strip: always 6 frames, squad centred, empty slot frames + locked frames (`createHud({slots})`).
- Rift recruit reveal: stone gate + rune ring + opening portal (x1 and x10), Cinzel/gold buttons.
- ui_kit.html: notice toast, LOCKED button, star goals, chest bar, 2-unit HUD.
- Audio: router.go dispatches popstate; audio's route state changes synchronously ("menu" -> "map" in the same tick).
- Test scripts: scratchpad ui4/ drive.mjs, loop.mjs (W/H/MOB/TAG env; normal boot check + dev loop), boss.mjs (LV/TAG/OH env),
  rift.mjs, kit.mjs, lock.mjs, api.mjs, nav2.mjs.
## Requests (ui-4)
- sim: optional cheat flags for dev, e.g. `createBattle({cheats:{invulnerable:true, oneHit:true}})` (player takes 0 damage / enemies die
  on the first hit) and no contract timer while invulnerable. The mods workaround inflates the HP numbers on the HUD (1.9M/1.9M).
- battle: accept ×8 in `setSpeed` (today it clamps to 1/2/4) so dev can fast-forward boss tests.
- audio: battle calls `audio.sfx('cloak'|'decloak', {x})` but js/audio/sfx.js has no such sounds, so it warns "[audio] unknown sfx" once a
  stealth unit cloaks. Please add the two sounds (a soft shimmer down / up).
- (ui NEXT, not a request) the battle HUD keeps its sci-fi chrome on m6; a stone/gold HUD variant keyed on `B.theme` would match the ruins.

# ui-5 (fifth round)
## Checkpoint 1 — Aaron's phone items first
- DONE (Aaron's playtest)
  1. **BLOCKER fixed: formation ENGAGE below the visible page on mobile.** Cause: the screen is a fixed-height flex column and its
     content (~800 px) overflowed #app (overflow hidden) once the URL bar shrank the visible height. Formation now = pinned header +
     `.fm-body.scroll` (board, goals, power, synergies, buff, roster) + pinned `.fm-go`. Same fix for Results (`.rs-acts` moved out of
     the scrolling `.rs-wrap`, always visible) and Arena (`.ar-body.scroll`; token-exchange buttons were cut off and unscrollable).
     Level sheet: max-height 100% + scroll (Deploy stays at the bottom). Modals: max-height 100%, body scrolls, safe-area padding.
     #app height: `100vh` -> `100svh` -> `100dvh` fallback chain.
     Audit script (scratchpad ui5/audit.mjs) visits every screen at 412x780 and 390x700 (touch) and lists tappables that are off-screen
     and not inside a scroller: all 15 screens OK (formation, hub, map, chapters, squad, recruit, hq, arena, events, settings, workshop,
     unit, level sheet, battle, results).
  2. Hub/top bar company box is now a drawer: open on first show, folds to the level emblem after 3.5 s; tap the emblem = open again
     (refolds after 3.5 s); tap the open box = HQ (old behaviour). It overlays the currency chips while open, so the chips never squeeze.
  3. Fullscreen toggle: js/ui/fullscreen.js (HEIRFRAME pattern, no orientation lock because landscape is coming). In the top bar
     (every screen with the top bar, incl. hub) and in the battle HUD's left rail (3rd button). Not created where the API is missing
     (iPhone Safari) or when already running standalone; iOS route = Add to Home Screen (apple-mobile-web-app-capable already set).
  4. br8t account: js/app/account.js mounts `/lib/auth/ui.js` (gameId 'vectorprotocol', accent cyan, nudge 'callout') after boot;
     avatar visible only on hub + settings (polled 250 ms, hidden while a modal is open), skipped under ?dev ?test ?auto ?nocloud
     ?noui ?shot. Top bar keeps `.tb-acct` (46 px) clear on hub + settings; `--vp-acct-w` drops to 0 on desktop when the column's right
     edge is not under the fixed avatar. No cloud saves (later phase). Note: the shared lib's "Login now!" callout briefly covers the
     fullscreen button on the hub (6 s pester hold) — that's the lib's nudge, same as HEIRFRAME.
- DONE (original list, in progress)
  - Hub squad: scr_hub passes `squad` = current formation [{model, rarity, faction, rank}] (slot order; omitted when empty -> starters)
    and `riftOpen: store.mapOpen(6)`.
  - Dev cheats: dev.js uses `player.cheats {invulnerable, oneHit}` (sim battle.js) instead of the +999 mods hack.
  - Fantasy HUD: css/hud_fantasy.css (`.hud.fantasy`, set by createHud({theme}); scr_battle `hudTheme(B)` mirrors battle.js's arena
    pick: B.theme/arena/realm alias, else mostly-fantasy waves). First pass looks right on m6_l3; polishing label fit.
- NEXT: fantasy HUD polish, QA bugs (docs/notes/qa.md not written yet at checkpoint), full loop 412/390/1280.
## Checkpoint 2 (ui-5 hand-back) — tested 412x915, 390x844, 412x780, 390x700 (touch) + 1280x800; zero console errors
- QA bugs (docs/notes/qa.md) fixed in UI:
  - A1 / A1b / A1c (formation ENGAGE off-screen, bench crushed, arena unscrollable): FIXED (pinned header/action bar + scrolling middle; see checkpoint 1).
  - A2 fullscreen, A3 login-badge room: FIXED (checkpoint 1).
  - Q1 [major] touch drag on formation: FIXED. Three causes: (a) the drag ghost's children inherited `pointer-events:auto` from
    `#overlay-root > *`, so elementFromPoint under the finger hit the ghost, `over` stayed null and the unit was benched on drop;
    (b) the synthetic click after a touch drag landed on the re-rendered hex and removed the unit (dragMoved now clears after 400 ms);
    (c) pointercancel was treated as "dragged off the board". Plus `.fm-hex[data-side=mine] { touch-action:none }` and edge auto-scroll
    while dragging on short screens. Verified by touch: hex->hex move, tap-to-remove, bench->hex.
  - Q2 (ui part): "Fit goals" now warns "Goal squad is under-powered · X vs Y power. Win first; goals can be earned on a replay."
    when the goal squad is <95% of the contract's power. The goal itself (m1_l1 "1 unit or fewer") is design's.
  - Q3 (ui part): hub CTA says START until m1_l1 is cleared. Hub label height is hub's.
- Fantasy HUD final: integrity labels read "Your squad" / "Enemy forces" on fantasy (Cinzel is wide; the sci-fi wording truncated),
  HP numerals sized to fit 6 cards. Shots: scratchpad ui5/f412_b1.png, f390_b1.png.
- Dev god/one-hit verified with the sim cheats: m6_l3 VICTORY with real HP numbers on the HUD (no more 1.9M/1.9M).
- Test scripts: scratchpad ui5/ audit.mjs (every screen, off-screen tappables), drag.mjs (touch drag), top.mjs (top bar/account,
  DEV=0 for a normal boot), sheet.mjs, form.mjs, boss.mjs, loop.mjs.
## Requests (ui-5)
- hub: Q3 label tap targets (36 px tall, want >= 44).
- design: Q2 m1_l1 goal "Win with 1 unit or fewer" on the tutorial level.
- sim: js/sim/README.md has no "Dev cheats" section yet (the code in battle.js is there and dev.js uses it).
- Landscape (later phase): new code avoids portrait-only assumptions (fullscreen has no orientation lock; the account slot measures the
  column against the viewport instead of assuming full-bleed).

# ui-L (landscape: UI-L0 / UI-L1 / UI-L2, docs/LANDSCAPE.md)
## Checkpoint 1
- DONE (UI-L0): js/app/orient.js (createOrient/initOrient + `orient` facade for screens; hysteresis 1.15/1.05, data-orient/data-form/l-short,
  `vp:orient` event, `__vp.orient`, `?orient=`, `?insets=t,r,b,l`), inline first-paint guess in index.html, rotate-hint removed (markup + vp.css),
  css/landscape.css (all rules under html[data-orient=landscape]), store `settings.layout` ('auto'|'portrait'). Matrix check: attrs correct for
  all §9.1 sizes. Portrait baselines (before any change): scratchpad uiL/base_{412x915,390x844,1280x800}_*.png + .sig (DOM rect dumps).
- DONE (UI-L1, partial): battle HUD landscape (hud.setMode, 2x3 mirrored grid, cards moved never rebuilt, "n/6 slots" caption inside the lowest
  empty frame, side buttons moved to the right rail / fullscreen to the top cluster, 4-side margins), scr_battle orient hook; hub rail dock +
  bottom-right CTA + gear in the top bar + scene.setMargins with CTA avoid rect; topbar 40 px row; formation two-column grid (l-short: power
  shares the ENGAGE row so a full roster row fits at 844x340), rotate cancels a drag; map level sheet = right panel with Deploy pinned, chest
  bar into `.vpm-slot`; dev badge bottom-left in landscape.
- NEXT: settings Layout row, UI-L2 menus, rotation tests, portrait regression diff, BATTLE-L integration check once it lands.
## Checkpoint 2
- DONE: Settings "Layout: Auto / Portrait column" (non-phones). UI-L2 CSS for barracks/workshop (.l2 wrappers, 2x3 squad mirror grid),
  unit profile (turntable left 46 % via setViewOffset(+w*.27), zoom .85; sheet right max 560, Level/Rank pinned at the bottom), recruit (banner
  row, x1 reveal card|info grid, x10 one row of 10 at >= 9:5), HQ, arena, events, results, dialogue, toasts, modals. ui_kit: fantasy HUD sample +
  Landscape preview toggle (`?orient=landscape`).
- Tests: rotation mid-battle (same scene object, sim t rising, same .pc nodes, margins switch), pause modal survives rotation, formation
  mid-drag rotation cancels the drag (no ghost, unit kept), hub gear moves topbar<->side, desktop hysteresis flips once each way
  (1100 -> landscape, 900 -> portrait, 1040 -> landscape). Portrait DOM-rect diff vs baseline: identical at 412x915 / 390x844 except
  dynamic content; 1280x800 with Layout=Portrait column equals the old D3 column (only the new Layout row differs).
- NEXT: tablet/desktop sweep, BATTLE-L check (camera fitWide not in js/battle yet).
## QA round (manager list, docs/notes/qa.md) — status
1. A1/A1b formation on short phones: FIXED (ui-5) and re-verified with the landscape CSS in: 412x780 ENGAGE 714-770, 390x700 634-690,
   roster inside the scrolling body at full 74x100; landscape 844x340 / 915x360 ENGAGE + a full roster row visible (scratch uiL/qa_form_*.png).
2. A1c arena scroll: FIXED (ui-5), re-verified (ar-body scrolls at 412x780 / 390x700; landscape 2-column).
3. Q8 shard picker: FIXED. Scrolling list of every owned unit (role, name, level, power), Cancel button; no off-screen buttons.
4. Q16 Back during battle: FIXED. router.setGuard(fn): a history navigation the guard refuses is undone with pushState (also drops
   the forward entries); scr_battle's guard opens the Paused sheet. Verified: history.back() -> still #/battle + Paused; forward ->
   #/battle; Retreat -> #/results. Q23 also done: returning to a hidden tab opens the Paused sheet.
5. Q11 module fetch: FIXED in modules.js: 3 tries with backoff (0.6 s, 1.8 s; retries cache-bust the URL because Chrome caches a failed
   module fetch), and a failed key is dropped from the cache so a later load() retries. Battle's own static import of js/actors/units.js is
   battle-owned (request below).
6. Q9 modals across routes: FIXED. components.closeModals(); screens.show() calls it with closeHints().
7. A3 badge space: the top bar now reserves the avatar slot on every top-bar screen (portrait 46 px, landscape --badge-w 120 px). Battle:
   landscape top cluster ends before --badge-w; portrait battle left as is on purpose (the avatar is hidden in battle by design and the
   reservation truncated "YOUR SQUAD INTEGRITY"); revisit if the avatar ever shows in battle.
8. Q10 #/chapters with one chapter -> redirects to #/map/1. Q18 Rank up disabled below the level cap ("Reach Lv N first"); Convert and
   Convert all ask first. Q15 tap targets: settings segments 44x44, `.vp-btn.sm` 44 tall, events Go 44. Q20: boot watchdog fails only after
   20 s with no progress (main.js progress + every module load tick it).
- Not done (polish): Q6 results after-action thumbnail lighting, Q14 rift x10 card frames.
## Requests (ui-L)
- battle (BATTLE-L): per LANDSCAPE.md §2. ui passes `hud.margins()` = {top, bottom, left, right} via setMargins (portrait left/right 0).
  Also: retry the dynamic/static units import once before placeholder units (QA Q11).
- hub: chapter select at 915x360 lists locked cards past the right edge inside its own scroller (fine if intended).
## Checkpoint 3 (ui-L hand-back)
- BATTLE-L integration verified as it landed (camera fitWide in js/battle): with the real HUD margins the board sits between the 2x3 card grid
  and the rail at 915x412, 844x340 and 1280x800; rotation mid-battle refits with the same scene / HUD nodes (scratch uiL/rot_b1.png,
  lb_*_bl.png). Battle agent should still run its own §9.3 clearance numbers.
- Shots (scratch uiL/): portrait regression base_* vs after_* (+ .sig rect dumps), afterP_1280x800_* (Portrait column setting);
  landscape ls_{844x340,915x360_in,915x412,1024x768,1280x800,1920x1080}_*.png, lb_* battle, rot_* rotation, rv_x1/x10, dlg_844, kit_*.
- Open: dev badge (bottom-left in landscape, per spec) overlaps the lowest card / dock button in dev mode only; menu screens on l-short
  spend ~90 px on top bar + header (could merge into one row later); Q6 / Q14 polish.
## Manager follow-up: roster must never be squashed (Aaron's S22, URL bar)
- Cause: the roster lived inside the scrolling `.fm-body`, below the fold under the pinned ENGAGE on short heights. Fix: `.fm-bench-wrap`
  moved out of the scroller (scr_formation.js) and pinned above ENGAGE; the board/goals/power/synergies/buff block scrolls. 412x915 is
  pixel-identical (bench 729-839 as before). Full card row + ENGAGE visible at 412x780/720/660/785, 384x740, 360x640/600, 390x714 and
  landscape 844x340 (scratch uiL/fm_*_b.png, act_*.png).
- Same rule elsewhere: map level-sheet Deploy is sticky at the sheet bottom; unit profile Level up / Rank up bar is sticky at the bottom of
  the sheet (portrait too); results actions were already pinned; recruit pull buttons sit at the top of the list (visible at 360x600).
- A stale cached router.js explains "router.setGuard is not a function"; the manager's feature-detect in scr_battle is fine to keep.
## D26 battle intro (ui side) + sim-4 requests
- Intro: scr_battle passes `intro: wantIntro` to createBattleScene; after start() it shows SKIP / DON'T SHOW AGAIN (`.bi-bar`, bottom-right:
  above the card strip in portrait, bottom-right corner in landscape; badge corner untouched) only if the scene has `introActive` true or a
  `playIntro()` to call (feature-detected, D19: today nothing appears). Bar hides when introActive goes false / playIntro resolves / skip.
  DON'T SHOW AGAIN = settings.battleIntro=false + skipIntro() + toast. HUD panels sit at 30 % opacity during the intro, ease to full in .6 s.
  Off when: Settings "Battle intro: Off" (new row, default On), `?dev&nointro`, and **replays of a contract already fought this session**
  (ctx.session.introSeen keyed kind:levelId) — my call: Retry/Replay should go straight into the fight.
  Tested with a mocked API at 412x915 and 915x412 (scratch uiL/intro_*_true.png); without the API no bar, no errors.
- sim-4: (1) dev.js already used `player.cheats` (ui-5); added a "CHEATS: GOD · ONE-HIT" chip on the HUD from state.cheats.
  (2) One-time nudge (hint key od_manual, any level, honours Field-manual-tips Off): AUTO off and a charged Overdrive untapped for 1.5 s ->
  Field-manual tip on that card (sim4_od.png). (3) Rank-up credits: hub shows one notice per unit+rank per session ("Save credits for a
  rank-up · X has the shards; N more credits"), and the unit profile's rank-up cost line reads "Save N more credits" in that state.
## Barracks hang (manager, Aaron incognito) — progressive + persisted portraits
- Cause: portraits.js serialised renders on a promise chain = microtasks, so 46 renderPortrait calls ran back to back without a yield
  (one 3.7 s long task on the M5).
- js/ui/portraits.js rewritten: cards show the role-icon placeholder at once (breathing, `.pt-wait`); renders run from a queue with a real
  yield (rAF + timeout) after each ~8 ms budget, on-screen cards first (IntersectionObserver); renderPortrait(format:'canvas') -> toBlob
  (async encode) -> <img src=objectURL>; blobs stored in IndexedDB `vectorprotocol-portraits`, key `v{PORTRAIT_VERSION}|model|rarity|faction`
  (renderPortrait has no rank input, so rank isn't in the key; bump PORTRAIT_VERSION when robots change portraits). All storage try/catch,
  falls back to memory. Every card grid (barracks, formation roster/hexes, HUD, recruit x10/x1, results) goes through fill(), so all get it.
  `__vp.portraits.debug()` lists jobs.
- Timing (barr.mjs, cache disabled, 412x915, M5): before = screen after ~4.0 s, one 3.7 s long task. After, cold (empty profile): screen
  with 46 cards at 3 ms, all art at 3.0 s, 33 long tasks, max 75 ms (none > 100). Warm (later session): all 46 art at 107 ms, 0 long tasks.
- Request (robots): one renderPortrait is the 55-75 ms floor (createUnit + MSAA render + readPixels). A split API (build, then render on a
  later frame) or a cheaper path would cut the cold-load jank further.

# ui-6 (QA-L work list)
## Checkpoint 1
- DONE: QL1 portraits.js retry (3 tries, backoff 0.5/2 s, then the job is dropped so the next fill() retries; `reload` = load('units')
  when units is a stub; img.onerror drops the URL + IndexedDB key and re-fills; empty stored blobs discarded). QL4 Back closes the top
  modal first (components.closeTopModal). QL2 card sizes: 915x412 80x115, 915x360 68x98, 844x340 74x106 (grid takes the full left edge
  under 357 px tall, top cluster starts right of it). QL11 intro buttons stone/gold on the fantasy HUD (.bi-bar.fantasy).
  QL9 1920x1080 formation (bigger hexes, right column zoom 1.3, centred). QL8 long names (two-line name lifts Lv/stars; container query).
- NEXT: QL10 LEVEL CAP, QL12 formation <44 px, QL7 map sheet Deploy, START/CONTINUE, chest-mk, Q6, Q14.
## Checkpoint 2
- DONE since cp1: QL10 disabled primary/gold buttons lose the bright fill (vp.css). QL12 landscape l-short formation: FIT GOALS + buff
  chips keep their drawn size but get 44 px hit boxes (inset visuals, negative margins, rows z-index 2; elementFromPoint verified at the
  top and bottom edges); W tabs 44 wide (their ::after already gives a 46 px tall hit band). QL7 map level sheet (mine, scr_map.js):
  Deploy now sits in an opaque sticky `.lvl-foot` that reaches the screen edge (sheet/card bottom padding moved into it), both orientations.
  chest-mk 44x44. Q6 results thumbs get the card's lit faction backdrop. Q14 fantasy units (`realm:'fantasy'`) get a stone/gold
  `.vp-card.fantasy` frame everywhere (unitCard), rift x10 names wrap to two lines, kicker gold. START/CONTINUE was already right (scr_hub:77).
- NEXT: verify QL4 / intro bar / results / LEVEL CAP / QL1 in the browser; portrait regression 412x915 + 412x785.
## Checkpoint 3 (ui-6 hand-back) - tested on CDP 9406 (touch), zero console errors on every route
- Verified: QL1 in-page test (scratch ui6/t_pt.mjs): throw x2 then OK -> 3 calls, art filled (~2.9 s with backoff); always-null -> gives
  up after 3, job dropped, next fill() starts again; units stub + `reload` -> renders; a bad image URL -> onerror drops it and re-renders.
  QL4 (t_battle.mjs): Squad status open + history.back() -> modal closed, still #/battle, no PAUSED; a second Back -> PAUSED.
  QL2 (t_hud.mjs, m6_l16, 6/6 portraits): 915x412 80x115, 915x360 68x98, 844x340 74x106, 412x915 unchanged.
  QL11 fantasy intro bar = `.bi-bar.fantasy` (intro_915x412.png). QL10 unit at cap: LEVEL CAP greyed; also fixed the action grid at max
  rank (a plain placeholder div had order 0, so RANK UP and LEVEL CAP sat on different rows); turntable stage gets a navy halo
  (`.up-stage::before`, lighten blend, the canvas is opaque so DOM can't go behind it).
  Sweep (sweep.mjs, 12 routes) at 412x915, 412x785, 915x412, 844x340: no h-scroll, nothing off-screen, only W1/W2 flagged by box size
  (their ::after hit band is 46 px tall). Fresh hub CTA "START RUSTLINE DOCKS".
- Shots (scratch ui6/): hud_m6_l16_{915x412,844x340,915x360,412x915}, barr_{915x360,844x340,412x915}, form_{1920x1080,1280x800},
  fm_{844x340,915x412}, sheet_in_{844x340,412x915,412x785}, rift10_{412x915,915x412}, unit_{915x412,412x915}, intro_915x412,
  back_915x412, results_915x412, sw_*.
## Requests (ui-6)
- robots: the unit-profile turntable renders on flat black (opaque canvas). A subtle backdrop in createTurntable (gradient
  plane / fog / scene.background) would beat the DOM halo I added; drop `.up-stage::before` in screens.css when it lands.
- hub: QL3 (map head ignores side insets) is still yours.

# ui-7 (D28: Barracks vs Workshop split)
## Checkpoint 1
- DONE: new `js/ui/scr_workshop.js` (bays: 01 combat buffs fabricate + arm, 02 shard exchange per unit + convert all, 03 scrap overview
  + sources, 04 gear chips locked shutter; pinned footer = armed buff + BARRACKS). `#/workshop` routed to it (screens.js). Barracks
  (scr_collection) is Barracks-only now, its surplus panel links to the Workshop (inline convert only while the Workshop is locked);
  unit profile Convert -> EXCHANGE link (same rule). Formation buff row keeps quick buy + a WORKSHOP link. Hub FEATURES subs
  "Squad & units" / "Buffs & fabrication", passed to the hub scene as `subs`. CSS: screens.css + landscape.css (Workshop blocks at the end).
- NEXT: browser test 412x915, 412x785, 915x412, 844x340; D28 bullet in DECISIONS.md.
## Checkpoint 2 (ui-7 hand-back) - tested on CDP 9406 (touch), zero console errors
- Workshop (`js/ui/scr_workshop.js`, gunmetal + amber hazard-stripe bays, no unit grid): intro strip ("Robots level up, rank up and
  train in the Barracks"); BAY 01 combat buffs = one fabricator row per buff (hex port with stock count, desc, FABRICATE <cost> via
  store.buyBuff, ARM/ARMED via store.selectBuff; sealed rows show the unlock level; whole bay is a shutter until the `buffs` feature);
  BAY 02 shard exchange = per-shard rates from economy.shardExchange, CONVERT ALL (if 2+ units), one row per unit with surplus (convertShards);
  BAY 03 scrap = in stock, squad's next-level scrap need (levelUpCost sum), how to spend it (Barracks), sources (contracts / Salvage Run /
  arena, locked ones show their unlock); BAY 04 gear chips = locked shutter "Coming soon". Pinned footer: armed buff for the next battle +
  BARRACKS. Landscape: bay 01 left column, 02-04 right, each column scrolls; l-short hides the intro and puts bay subtitles inline.
- Barracks: title always Barracks; one-line hint "Tap a robot to level up, rank up or train it"; surplus panel -> WORKSHOP link (inline
  Convert all only while the Workshop is locked). Unit profile: surplus Convert -> EXCHANGE link (same rule). Formation buff row: quick buy
  unchanged + a WORKSHOP link on the kicker line (44 px hit band); Back from the Workshop returns to the formation.
- Hints: Workshop first visit (key `workshop`) "fabricates for the whole company: combat buffs and the shard exchange. Robots level up in
  the Barracks"; Barracks card hint now "level up with scrap, rank up and train abilities there"; hub hint "Spend it in the Barracks to
  level up" unchanged and still true. Hub 3D labels get subs "Squad & units" / "Buffs & fabrication" (createHubScene `subs`).
- Shots (scratch ui7/): {412x915,412x785,915x412,844x340}_{workshop,wsscroll,squad,unit_u1,formation_m3_l2,hub}.png, early_412x915_*
  (m1_l3: buff bay sealed, empty exchange), fn_412x915.png (fabricated + armed + converted). Scripts t_ws.mjs, t_fn.mjs.
## Requests (ui-7)
- design: `js/data/story.js` m1_l2_post still says "WORKSHOP unlocked — feed scrap to level up your robots." Per D28 suggest
  "WORKSHOP unlocked: fabricate combat buffs for the company. Level up robots with scrap in the BARRACKS." ECONOMY.md scrap row
  ("feeding robots in the Workshop") and buffs.js header comment are fine to leave but should say Barracks / Workshop per D28.
  The workshop feature unlocks at m1_l2 but buffs only at m2_l3, so the Workshop is mostly a locked buff bay + scrap guide until then;
  consider moving the `workshop` unlock to m2_l3 alongside `buffs`.
- hub: `js/hub/features.js` default subs ("Squad & formation", "Upgrade units") are overridden by ui; update them to match if you like.
- sim/design: gear chips (D9 optional) have no API or data; the Workshop shows a locked "Coming soon" bay until they exist.

# ui-8 (br8t "Login now!" pill vs the top bar)
## Checkpoint 1 (ui-8 hand-back) - tested on CDP 9406 (touch), zero console errors
- The badge: `/lib/auth/ui.js` (shared, not edited) mounts `<div id="br8t-account">` with an **open** shadow root holding
  `.fab` (40 px avatar, fixed top/right max(10px, safe-area)) and, for `nudge:'callout'`, a `.pester` pill (fixed, right =
  inset + 48 px, ~174 x 40: "x" button + 146 px body that ticks "Save your progress" -> "Login now!"). It is added by a 2.5 s
  watcher (first visit, then after 3 games, every 5, or after 1 h away) whenever `canPester()` says yes, stays `pesterHoldMs`
  (ours 6 s), then gets class `.out` and is removed 300 ms later; also hidden when `canPester` turns false. **No event, no class
  on the host or page**: the only signal is the node appearing/disappearing in the shadow root. `--br8t-account-space` stays 52px.
- Cause: `--badge-w` / `.tb-acct` reserved only the avatar, so at 412 px the pill (x 180-354) covered the gem chip and fullscreen.
- Fix (`js/app/account.js` watchPill + `css/screens.css` ui-8 block): MutationObserver on the shadow root + ResizeObserver on
  the pill. While it is up the visible top bar gets `.pill` and `--vp-pill-slot` (live px from the bar's right edge to the pill's
  left, from its computed `right` + offsetWidth so the slide-in transform doesn't matter) - landscape just grows the badge slot
  (currencies/gear/fullscreen slide left, given back with a .3 s ease). Where the bar's natural width (measured at rest) doesn't
  fit beside the pill (portrait phones) it also gets `.pill-wrap`: currencies + fullscreen drop to a second row under the
  emblem (left-aligned, clear of the hub gear). The company drawer is clamped to `--vp-pill-room`.
  `canPester` is now hub-only (the hub bar is an overlay, so the wrap moves nothing; on Settings it would push the list down for
  6 s). Leaving for a non-account screen hides the host at once (hashchange + the router's synthetic popstate), not on the
  250 ms tick. Battle: host is hidden, pill never shows; the landscape `.hud-top` 120 px reserve is unchanged and clear.
- Verified (scratch ui8/t_pill.mjs: overlap probe of every bar/HUD control vs the pill + avatar, 30 ms after it appears, at 4 s,
  and after it's gone): zero hits at 412x915, 390x844, 915x412, 844x340 (and 1280x800 probe). t_nav.mjs: pill up on the hub ->
  #/squad: host hidden immediately, bar unwrapped; -> battle: no badge.
- Shots (scratch ui8/): hub_{412x915,390x844,915x412,844x340}_{exp,col}.png, nav_{412x915,915x412}_{squad,battle}.png,
  before: base_{412x915,915x412,844x340}_exp.png.
## Requests (ui-8)
- shared auth layer (whoever owns /lib/auth/ui.js): a `br8t-pester` event (show/hide) or a class on the host would replace the
  MutationObserver; the pill's ticker also leaves a stray "s" of "progress" visible left of "Login now!" at the end of the scroll.
