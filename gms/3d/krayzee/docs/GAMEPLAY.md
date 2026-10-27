# GAMEPLAY lane

Owns `js/main.js`, `js/core/**`, `js/flight/{hud,controls,cameras}.js`, `js/hud/**`, `css/game.css`, `index.html`, this file
(+ granted: `css/radio.css`, `js/radio/hud.js`, `js/audio/**`, small additions to `js/ui/settings.js`, banking in `js/game/{score,index}.js`).
Test: `~/.claude/bin/cdp start --port 9491 -- --use-angle=metal` then `node tools/test-gameplay.mjs [--only=portrait,landscape,desktop,finish,ground] [--falsify]`
(real CDP touch at 390×844 / 844×390, mouse at 1280×800; shots in `docs/shots/gameplay/`). Keep `node tools/test-flight.mjs --port=9491` green.

## What is where
| thing | file | notes |
|---|---|---|
| score widget, PP popups, combo, banked toast, rank-up ceremony (+ `fx.celebrate` via `rankUp` game event), scandal frozen state | `js/hud/score.js` | hint line: TAKE OFF & LAND / LAND & STOP / DEMAND IT TO BANK |
| D24 headlines: newspaper counter on the score widget + "That'll hit the papers!" toast; reel after landing (Next / Skip all) | `js/hud/headlines.js` | big rule-breaks (one per rule per flight) + scandals; reel opens 1.6 s after `finished` or a ground `banked`, waits for the ceremony; reel is fixed z 29 (above STORY's card z 28, below js/ui popups z 30) |
| opportunity prompts from ATC state (rate-limited, dismissible, settings `hints`) | `js/hud/prompts.js` | |
| first-run coach marks (goal / stick / release / radio / bank), non-blocking | `js/hud/coach.js` | `krayzee.coach` in localStorage; `?coach=1` forces |
| D19 LANDED — DEMAND IT (ready / greyed + reason) | `js/hud/finish.js`, zone rules `js/game/finish.js` | Easy ≤300 m of any runway incl. grass; Medium runway or apron; Hard apron stands or the designated spot (gold ground ring + beam + FINISH HERE target marker). Free Flight keeps a 15 s stop auto-bank fallback |
| D21 DEMAND TAKEOFF, D22 Skip to runway, D19 difficulty chips | `js/hud/ground.js` | chips show on the ground in Free Flight until the first lift-off (pending 0); choosing rebuilds the game object and saves `settings.difficulty`. Settings "Free Flight difficulty" does the same |
| D20 fuel cell + low-fuel flash (≤15 %), out-of-fuel flash; DEMAND IT calls `ac.refuel()` | `js/flight/hud.js`, `js/main.js` | reads `ac.fuelFraction` |
| D22 next flight starts where the last DEMAND IT stopped | `main.js` `S.lastStop` | |
| controls: stick travel ~94 px phone / 110 desktop, expo, bank soft-limit ~60° (Easy/Medium), roll damping; ground: stick X steers the nosewheel | `js/flight/controls.js` | |
| cameras: inside views use `rig.viewEye(view, aspect)` (ART3 portrait framing); landscape 92° h-fov; chase frames the plane in the band clear of subtitles and the action slot | `js/flight/cameras.js` | |
| radio: button just above BRAKE (mirrors with stickRight), chip tray beside it, transparent pills, 3-line subtitles, dedupe of identical consecutive lines, tower label wraps, paused → radio stopped and hidden | `css/radio.css`, `js/radio/hud.js`, `main.js` pause() | |
| friendly ATC reasons (`CROSSINGTRAFFIC` → TRAFFIC ON THE CROSSING RUNWAY) | `main.js` `friendlyReason` | |
| D23/D25 stall horn | `js/audio/index.js` (soft 440/554 Hz pulsing hum, very quiet), `settings.stallHorn` default off (Settings → Sound → Stall warning), only within ~3 kt of the stall | all other sounds untouched |
| ASSIST markers + LAND button | `main.js` updateMarkers / onLandPress | target = mission target > opportunity > Hard spot > active runway |
| FX | `main.js` per docs/FX.md | player + AI tracked; AI events forwarded; `setQuality` through the R.setQuality wrapper (also world.setQuality) |
| STORY | `main.js` per docs/STORY.md | Story menu button is taken over in capture phase (UI's SOON badge removed at runtime), `?mission=1`, `?intro=1`; warp chip (D18) placed under the tower badge (portrait) / beside it (landscape); sim scale = TIMESCALE × story.simScale (held at 1× while paused or the reel is open) |

## STORY follow-ups
Intro plays by itself on the very first launch (no saved pilot, intro unseen; skipped headless and with `?intro=0`), then the menu
(and the creator). A "▶ Watch the intro" link is injected under the menu grid. Scandal grace: Easy/Medium story and careers under
1,500 PP get a HUD warning and −35 tower outrage instead of a Royal Scandal (Hard story and seasoned careers get the real thing).
LAND assist final is now 600–1200 m (dist × 0.3; was 600–1400 m, dist × 0.4); 500 m minimum failed ASSIST's terrain-clearance test.
Coach marks decide touch vs keyboard when shown (touch seen, `maxTouchPoints`, coarse pointer), not once at boot.

## Aircraft types + Online
Free Flight aircraft: `?plane=c172|tiger|bathtub`, else `settings.aircraft`, picked with the AIRCRAFT chips (Runabout / Moth /
Bathtub) parked before the first lift-off (rebuilds the player). The type goes to `createPlane`, `new Aircraft({type})`,
`circuitRoute(E, {type})`; attract flies `['c172','c172','tiger','bathtub']`. Story always flies the C172. A proper Hangar picker
(unlock ranks: Moth = Earl, Bathtub = story) belongs to the UI lane.
Online: `ui.setOnlineAvailable(!!?net=)`; `onOnline` lazy-loads `createNet` + `createLobby` and ticks `net` every frame; a started
room enters an 'online' session (no warp). Plane sync (`sendPlane`/`applyRemote`, remote rigs) and the account token are not wired yet.

## TRAFFIC wiring (docs/FLIGHT.md table)
`linkTraffic(atc, traffic, { playerId, mischief })` with `settings.aiMischief` ('off'|'low'|'high', default 'low'; `wiring.setMischief(s)` on change);
`traffic.setAIProtection` follows the difficulty's protection (rubber in the menu); `atc.on('runwayChange')` flashes the HUD and the
runway target marker shows `RWY 27 → 09 SOON` while `atc.pendingRunway` is set; DEMAND TAKEOFF / Skip use `link.demandTakeoff(P)` /
`link.skipToRunway(P)`; `link.placed(P, 8)` after every place/respawn/teleport; `attract.seedRivals()` on play start + respawn;
radio context runway = `ap.status().end` (an id, also during landAt).

## PERF items done (docs/PERF.md)
#3 controls cache the viewport on resize and write DOM only on change; markers read the viewport only after a resize and skip
clears when empty. #5 `checkShaderErrors` off unless `?debug=1`, `compileAsync` (4 s cap), boot yields between build steps.
#6 audio ramps skip while the context is suspended and skip ≤0.5 % re-sends; `updateAudio` returns until unlocked, no per-frame
Vector3s. #7 phones always build low content. #8 medium DPR 1.5, markers canvas DPR ≤1.5. Governor: frame CPU fed in; steps up at
≥50 fps when frame CPU < 60 % of the interval, steps down after ~10 s under 52 fps. Importmap → `three.module.min.js`.
Not done: deferring the radio's barks/script JSON (needs an option in js/radio/index.js, RADIO-owned).

## Settings keys used
`hints` (default true), `trafficMarkers` (true), `difficulty` ('easy'), `stallHorn` (false), `aiMischief` ('low'), `invertPitch`, `stickRight`, `views`, `view`, `units`.
main.js caches settings (`settings()`), refreshed by `onSettings`; it no longer parses localStorage every frame.
js/ui/** belongs to UI round 3 now: the Settings rows for `stallHorn` (added here before the hand-over) and `aiMischief` are theirs.

## Test notes
Headless Chrome intermittently swallows the first touchStart after the LAND tap (no DOM event at all); the ground test lands the thumbs 30 ms apart and retries up to 4×. The ground override itself passes in both orientations. The Hard finish test clears AI off the stand first (real metal: a stand collision crashes and respawns you).

## Test hooks
`window.__game`: `state()`, `S`, `hud` (score/prompts/coach state), `ghud` (`headlines.state`, `ground.state`, `finish`), `wiring`,
`teleport`, `setControls`, `release`, `log()`.

## Open / for other lanes
- UI lane: the Story button still says SOON in `js/ui/menu.js`; main.js strips it at runtime. Proper fix: route `story` through `hooks.onPlay`.
- Difficulty in Free Flight comes from `settings.difficulty`, mapped to protection (Easy=Rubber, Medium=Partial, Hard=Realistic) in `core/wiring.js`.
- Headlines only come from big infractions + scandals (HUD-side table in `headlines.js`); SCORE/DESIGN may want to own the copy.

## Last test runs (2026-10-22)
- `tools/test-gameplay.mjs` (portrait, landscape, desktop, finish ×2, ground ×2): 136/139 — the 3 misses are the ground-landscape
  multi-touch harness flake above (passes when run alone); everything else green incl. D19/D20/D24/aircraft picker by real input.
- `--falsify`: the overlap check catches the score widget dragged over pause (score×pause).
- `tools/test-flight.mjs`: 33/33 earlier today; latest 32/33 — "override: AP still landed" timed out without a touchdown
  (AP/ATC side, intermittent; seeded rivals + mischief make the circuit busier — for TRAFFIC to look at).
- Story smoke (scratchpad script): menu Story by real touch → intro → Mission 1 running, warp chip, `?mission=1`, no errors.

## Online HUD (UI round 4, `js/hud/online.js`)
`createGameHUD` now also makes `ghud.online`. It polls, so GAMEPLAY only needs one line.

**main.js wiring (one line, GAMEPLAY to apply):** in the frame loop, right after
`if (session) try { session.update(dt); } catch (e) { console.warn('[net]', e); }`, add:
```js
try { ghud.online.sync(session, net); } catch (e) { /* */ }
```
- `sync(session, net)` shows the HUD only while `session?.attached`. Otherwise it hides and resets. It reads
  `session.standings()` at about 5 Hz, plus `net.linkSummary()` and `net.connected` at about 1 Hz. You are `p:${net.id}`.
  `ghud.setVisible(false)` hides it too, so quit and the menu need nothing extra.
- Crown changes are detected from the standings (`crown` flag). This means the host's `crownChange` and a follower's
  `court` restore both animate. Joining a room that already has a monarch is silent.
- For a bench, `ghud.online.set({ standings, me, link, connected })` replaces `sync`. `state` is the test snapshot.

Layout (all of it is checked by `tools/onlinehud_flow.mjs` against the live HUD and controls):
| piece | portrait | landscape / desktop |
|---|---|---|
| connection pill: bars + DIRECT / RELAY / MIXED / SOLO / OFFLINE; tap shows "Relayed · 84 ms" for 3 s | under the pause button (top 66) | same. With the stick on the right it moves beside the tower badge, because the subtitles take the left column |
| Court ladder: header (crown, COURT, your place or YOURS, chevron) + top 3–5 rows (place or crown, D4 title, name, PP) | the right column under the tower badge (`--krz-tr-w`, which the subtitles already keep clear; no warp chip online). Two-line rows (name / title), no PP | left column under the score (top 100), 196 px (220 desktop). Stick right: right column under the tower |
- Row count = whatever fits above the next thing in the same column (radio, stick base, LAND, chips, coach), clamped 3–5.
  It is re-measured every 2 s and after a resize. If you are outside the top rows, the last row is yours, after a dashed gap.
- Only the header is tappable. The rows are `pointer-events: none`, so a thumb on the stick zone below goes through. The
  header tap collapses or expands the ladder (`krayzee.courtCollapsed`). A crown change while collapsed peeks it open for 4 s.
- Crown change: the crown drops onto the new leader's row, the row glows gold, the panel flashes and a serif news line says
  "You take the Crown!" or "Mo takes the Crown" (3.2 s). Rows slide to their new places (FLIP). Reduced motion turns this off.
- Locked AIRCRAFT chips (padlock, requirement on tap) never call `onAircraft`. `setAircraft`'s LOCKED flash is now only a
  safety net.
- **For GAMEPLAY's `tools/test-gameplay.mjs`**: `finishFlow` taps the Tiger Moth with a fresh career (0 PP), and the Moth
  needs Earl (6,000 PP). Seed `krayzee.career` with `lifetimePP ≥ 6000` in its `freshStorage`, or that check stays red. It
  was already refused by `setAircraft` before this round.

### PLAYTEST_2 B9 items fixed in js/hud (UI round 4)
- The "That'll hit the papers!" toast is portrait-only: it now sits on the score widget's hint line (bottom-left, wraps at
  140 px) instead of below the widget over the KT/FT strip.
- PP popups in portrait moved from 40 % to 54 %, below the plane band and above the action slot. Checked against the stick.
- Coach marks: if the plane goes unstable while a mark is showing (the "Points stay pending…" mid-dive case), the mark is hidden
  and its timer paused until the plane is stable again. Starting a mark was already gated on `stable`.
- Not js/hud, for other lanes: LAND over the prompt card (ASSIST's `css/assist.css`), the target label prefix (ASSIST),
  the Mission 1 coach card and the Letters Patent card (STORY's `.krz-st-*`), "AUTOPILOT · RECOVERING" through the subtitles
  (flight hud.js / radio.css), marker label overprint (ASSIST), and the response-window size (RADIO).
- js/hud styles from UI round 4 are injected from `js/hud/style.js`, not css/game.css.

## HUDFIX (PLAYTEST_2, 2026-10-22)
- **Bank / roll (B5)** `controls.js rollAssist`: full-stick roll rate capped per type (C172 45°/s, Moth 50, Bathtub 35); Easy/Medium
  soft-limit 60° as a rate command (`2.6 × (60° − bank)`), stick tag shows `BANK 60°`. Detent: at the limit ease off (< 0.75) and push full
  again within 1 s to roll past; it re-arms below 40° or on release. Hard: no limit. Difficulty = `wiring.difficulty` (room protection online).
  Small deflections unchanged (40 px ≈ 7–15°/s).
- **Throttle (B3/B4)**: the lever paints the player's axis value while `manual`/`latched`; an **AUTO** detent above the lever (and key T)
  hands it back. main `autoThrottle()` calls FLIGHTFIX's `traffic.autoThrottle(entry)` (or `releaseThrottle`) when present, else blends the
  axis. Until `traffic.autoThrottle` exists, main keeps an airborne latch from timing out (shim in `frame`).
- **DEMAND TAKEOFF coach (B6)** `js/core/takeoffcoach.js`: on the ground, stopped ≥ 4 s with DEMAND TAKEOFF offered → a coach mark rings it
  (the generic coach is held back meanwhile; `goal` goes first). Once per device (`krayzee.coachTakeoff`), not in Story.
- **Overlaps (B9)**: landscape `html.krz-land-on` + `--krz-land-w` move the action slot clear of LAND; portrait inside views drop LAND onto
  the stick band; the banner (`hud.flash`) takes the AP pill/axes row (`#krz-hud.krz-flash`) instead of growing into the subtitles; coach
  marks need |bank| < 45°, sink < 1500 fpm and AGL ≥ 150 m (`stable`); the target marker label is re-set when it changes (markers copy
  labels in `set()`), and markers also avoid the prompt/finish/ground buttons. Story: Mission title card sits at 67 % in portrait; the
  coach re-places on resize so the subtitles never start under it.
- **Chase camera vs trees**: `env.treeTop(x, z, pad)` (grid over `world.debug.trees`) — the camera climbs over canopies, also along the
  line of sight to the plane.
- **Online**: `wiring.startPlay('online', ent, { room })` with the room's normalised settings → game mode = room type (Strict Tower −500),
  protection + partial start, AI protection, `wiring.difficulty` from protection.
- Test: `node tools/test-gameplay.mjs --only=hudfix` (bank cap ×3 types + Hard + detent, latched lever + AUTO by touch, banner vs subtitles,
  coach not in a dive, DEMAND TAKEOFF coach, camera over trees, room protection, LAND vs prompt in landscape, centre-view LAND).

## GAMEFIX (2026-10-25)
- **Hard finish (D19).** Free Flight / online on Hard: once the AP has stopped on the airfield (DONE, within 300 m of a
  runway) outside the finish zone, main.js `updateTaxiIn` taxis it to the terminal spot by itself: `ap.taxiIn({stand})`
  when FLIGHTFIX's API exists, else a `taxi → park` route to `DEFAULT_SPOT`. DEMAND IT shows greyed "Taxiing to the
  terminal…" on the way and lights gold at the stand. Not in story (missions script their own taxi-in), not after a field
  landing (DEMAND TAKEOFF is the way out). The 15 s auto-bank only fires inside the finish zone (SCORE.md).
- **DEMAND TAKEOFF taxi (`departing()`).** While the AP taxis for a live DEMAND TAKEOFF, DEMAND IT stays hidden and
  DEMAND TAKEOFF stays offered, even when the taxi slows below 5 kt inside an Easy/Medium finish zone.
- **SKIP TO RUNWAY** only on the way out (taxi to a hold/runway), never on a taxi-in to a stand or while parked.
- **Action slot is never covered.** main.js sets `html[data-krz-act]` = rows in the bottom slot (0–2); css/radio.css lifts
  the radio sheet above them (landscape: wider 2-column sheet), css/game.css stops the Herald reel above them. A late reel
  (after a rank-up ceremony) is dropped if the plane is already rolling; the headlines wait for the next stop. Tapping
  DEMAND TAKEOFF while a reel is open closes it.
- **Prompt card vs AP pill.** While a prompt card shows, the AP pill and axes row under it are hidden; a flash banner
  ("LANDING · RWY 27") hides the card for its 2.5 s.
- Tests: `node tools/test-hud4.mjs --only=gamefix` (radio sheet / reel vs buttons both orientations, Hard taxi-in →
  DEMAND IT → refuel, taxi-out through the zone). Shots in docs/shots/gamefix/.

## MSGFIX (2026-10-27): less message clutter on a phone, measured
Aaron (D32): "sometimes messages still block the screen too much on phone". Measured with the screen-cover sampler
(docs/TESTING.md "Screen cover"); numbers there. What changed:
- **Busy flag.** main.js `msgFocus()` sets `html.krz-msg-busy` while the player's hands and eyes are busy: any axis in
  `manual`, a radio sheet open, airborne below 120 m AGL, or rolling faster than 15 kt. Busy means: radio cards one line
  and fade 0.6 s after the line ends (else 2.2 s; was 3.2 s), prompt cards lose their sub line, PP popups lose the
  multiplier chips and the italic line, and the story coach drops its goal row and clamps to two lines.
- **Radio cards** (`js/radio/hud.js`, `css/radio.css`): only the newest card shows; older ones fold away at once and the
  new card carries a "+n" transcript badge (lines in the last 12 s). Tapping a card still opens the full log. Phones get
  two-line cards (13.5 px) with slimmer padding; in portrait under a story coach card (`html.krz-coach-on`) one line.
- Radio chip target names mix 35 % pilot colour into white (was 45 %): a dark rival colour measured 0.31 luminance, under
  test-hud4's 0.35 floor.
- **Radio sheet** (portrait phones): one header line (title + subtitle + seconds, 36 px ✕), 44 px chips with one-line
  labels, and three chips sit in one row (icons dropped). Chips stay above the action slot (GAMEFIX) and keep their 5 s
  response window.
- **Story coach** (`js/story/missions.js` display code, `story.css`): after 6 s real time (not warped time) the card
  folds to one line with no goal row; a tap on the folded card opens it again for another 6 s. Mission logic untouched.
- **No opportunity prompt cards during a story mission** (main.js `ghud.prompts.update(... blocked ... || story.mission)`):
  the coach card already says what to do, and the two used to stack. test-hud4's story check now expects them held.
- **Prompt cards**: shown 6 s (was 8); in portrait at most `100vw − 110 px` wide, 12 px title, one-line sub.
- **PP popups**: slimmer on phones (both orientations, `max-width: 600px` or `max-height: 500px`). In portrait, while the
  action slot holds DEMAND IT / DEMAND TAKEOFF (`html[data-krz-act]`), they sit just above it instead of under it (the
  "FLIGHT COMPLETE" popup used to slide under DEMAND TAKEOFF after a mission).
- **One budget for everything** (`js/hud/msgcap.js`, made by `createGameHUD` as `ghud.msgcap`, ticked from
  `updateGameHUD`): at most 3 message elements on a phone (4 on a big screen). Priority: radio sheet, Herald reel /
  rank-up ceremony / TASKS set celebration, banner, story coach, coach mark, PP popup, TASKS tick toast, radio card,
  prompt card, "That'll hit the papers!" toast. The TASKS toast (`js/ui/tasks.js`) also steers clear of the story coach
  now (`.krz-st-coach` added to its `AVOID` list); its queue and timing are unchanged.
  Extras are shed lowest first (`html[data-krz-shed]` → `visibility: hidden`, rules in `js/hud/style.js`) and come back
  when room frees. The radio sheet, the reel/ceremony/set celebration and coach marks are never shed.
- The Herald reel already opened only when stopped on the ground (`S.reelT` → `ac.gs < 2.6`); unchanged.
- **AIRCRAFT chips** (`js/hud/ground.js`): built from `HANGAR`/`SHORT` in `js/ui/aircraft.js` (now six planes); with more
  than three, chips are slimmer and the landscape row scrolls sideways inside the top-left corner (`js/hud/style.js`).
- The JETCORE `boundary` / `refused` quips go through `hud.flash`, so they are banners: one at a time, in the budget.
- **main.js edits (all message plumbing):** the `msgFocus()` function and its call, `ghud.msgcap.update(dt)`, the prompts `blocked` term, and `krz-msg-busy` cleared in
  `quitPlay()`.
