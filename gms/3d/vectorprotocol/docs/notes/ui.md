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
