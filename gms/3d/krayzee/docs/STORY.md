# STORY — intro (D16), guided Mission 1 (D17), time warp (D18), Missions 2–4 (STORY2)

Lane STORY owns `js/story/**` (except `requestLand` in host.js: ATCSEQ), `data/story/**`, `data/story.js`, `audio/story/**`, `tools/story/**`, this file.
Everything is self-contained and talks to the game only through `window.__game` (+ the objects it exposes:
`S.player`, `traffic`, `wiring.{game,radio}`, `ghud`). Nothing in main.js / HUD / ATC / autopilot was edited.

## Files

| File | What |
|---|---|
| `js/story/index.js` | `createStory(opts)` facade — the only thing main.js needs |
| `js/story/intro.js` | D16 in-engine cinematic: camera shots over the live world, captions, narration, skip |
| `js/story/missions.js` | D17 mission framework: steps, coach line, target marker, LAND/DEMAND fallbacks, reward card |
| `js/story/timewarp.js` | D18 `createTimeWarp`, `warpStateFor`, `createWarpToggle` (HUD chip) |
| `js/story/host.js` | adapter onto `window.__game` (snapshot, events, place at stand, LAND, rival bark) |
| `js/story/actors.js` | `extendHost`: story planes (`spawn`/`despawn`, Rupert via `data/story.js` RIVALS), `clearTraffic`/`clearArrivals`, `placeAir`/`placeGround`, `fuel`, `throttle`/`autoThrottle`, `demandTakeoff`, `atcReport`, story radio lines (`addLines`/`say`) |
| `js/story/picker.js` | mission picker + `missionList()` (unlock rule) |
| `data/story/index.js` | `MISSIONS` 1–4 |
| `data/story/common.js` | runway-frame helpers (`at`, `rwPos`), `lineUpLegs`, `landCue`, shared `finishSteps` (land/touchdown/stop/demand) |
| `data/story/mission2.js` … `mission4.js` | Missions 2–4 |
| `data/story/lines.js` | narrator briefing lines (n21…n42) + story radio lines (g_*, i_*, t_*, r_*) |
| `js/story/devhook.js` | bench/test shim: runs story in the real game with **no** main.js changes (wraps render + traffic.update) |
| `js/story/dom.js`, `story.css` | DOM helpers, progress store (`localStorage['krayzee.story']`), styles (Instrument Serif from `js/ui/fonts`) |
| `data/story/intro.js` | intro lines (caption + TTS text) and camera shots |
| `data/story/mission1.js` | Mission 1 "Letters Patent": route builder + 11 steps |
| `data/story.js` | campaign roster (rivals, controllers, mission list from DESIGN §3) |
| `audio/story/i01–i11.mp3`, `narration.json` | narration clips + durations/ASR/LUFS; `narrator_design.mp3` = voice audition |
| `tools/story/narrate.py` | Qwen Voice Studio generator (reuses `tools/voice/vocommon.py`) |
| `tools/story/test-intro.mjs`, `test-mission.mjs`, `cdp.mjs` | CDP end-to-end tests (real touch / mouse / keys) |

## D16 — the intro (≈ 72 s, skippable)

Plays over the real world (attract traffic keeps flying): kingdom → castle → village → cathedral → airport →
tower → tower close → the Pomfrey-Smythe mauve plane (follows a live AI) → the player's own plane on a stand
with the "By Royal Warrant" name card → title card. Captions in Instrument Serif, bottom-centre, letterbox vignette.
Any tap shows **Skip intro ›** for 3.5 s; Esc/Enter/Space skip on desktop. Narration never says the player's name —
only the card shows it (D1). `markIntroSeen()` is called on finish or skip.

Narrator: designed voice "Krayzee · narrator" (Qwen Voice Studio `http://192.168.0.236:7876`, Ryan, seed 37,
saved clone `60aba718…`), warm dry British RP. Clips at ≈ −17 LUFS; ASR-checked (all WER 0 except proper-noun
spellings "Krazy"/"impossi rubber", which are pronounced right).

| id | caption |
|---|---|
| i01 | Once upon a time, last Tuesday or thereabouts, there was a kingdom called Krayzee. |
| i02 | Its royal family did not hunt, or fish, or open hospitals. They flew. |
| i03 | In 1907 the Royal Chemist, attempting a self-buttering crumpet, invented impossiRubber instead. |
| i04 | The King had a biplane made of it that afternoon, flew it into the cathedral, bounced off, and declared aviation perfectly safe. |
| i05 | Every royal aircraft since has been made of the stuff. And every rule of the air was written for other people. |
| i06 | Somebody still has to read those rules out. That is the control tower. |
| i07 | The tower remains calm. Mostly. It has a therapist, and a great deal of tea. |
| i08 | The House of Pomfrey-Smythe has won the Royal Hangar for two hundred years. They fly in mauve. They are insufferable. |
| i09 | Which brings us to you. This morning the Queen ennobled you, for reasons nobody can quite remember. |
| i10 | You have a title, an aeroplane, and absolutely no intention of waiting your turn. |
| i11 | Welcome to Krayzee. |

Regenerate: `python3 tools/story/narrate.py [ids…]` (one GPU take at a time; it scores takes by ASR WER + pitch).

## D17 — Mission 1 "Letters Patent" (tower: Toby)

Starts on stand S6. Steps (one short coach line each, top-centre, auto-placed below any HUD strip it would cover):

1. **taxi** — autopilot taxis + holds. Coach teaches **DEMAND TAKEOFF** (D21) as the cheeky way out, else the warp chip.
   After 45 s it suggests **SKIP TO RUNWAY** (D22).
2. **takeoff** — autopilot takes off.
3. **turn** — hand-fly: drag the stick (touch) / arrows-WASD; done after ≥1.2 s on the stick and ≥20° of turn. Hint at 14 s.
4. **letgo** — release; autopilot resumes from wherever you are.
5. **radio** — Lord Rupert barks an insult (RADIO's response window); answer once. The radio drops a window that
   opens < 8 s after another one, so the bark is retried every 9 s (max 3); then the coach says tap RADIO.
   Also re-joins the castle leg (the autopilot's resume can pick a later leg after hand-flying).
6. **castle** — follow the gold target marker to the castle (< 650 m).
7. **crime** — one gentle rule-break: tower buzz. Easy: the route itself passes low over the cab. Medium/Hard: the route
   passes wide/high and *you* have to go low. The legs descend early (clearance 40/25 m) because the autopilot's
   descent is capped at 5 m/s; on Easy it crosses ~17 m from the cab at ~62 m AGL (buzz needs < 80 m, < 78 m AGL). Missed → loops back round with "lower, and right at the tower".
8. **land** — route lines up on the active runway; LAND button appears (host's own if present, else ours) → `ap.landAt`.
9. **touchdown** — hands off; autopilot flies approach, flare, stop.
10. **stop** — Easy: anywhere near the runway; Medium: runway/apron; Hard: autopilot taxis to the marked stand (D19).
11. **demand** — press **LANDED — DEMAND IT** (host's `.krz-finish`, else our fallback calling `game.demand`).

Crash: Easy/Medium bounce; if the plane is respawned on the runway the autopilot takes off again and rejoins the
leg the current step needs (`resumeLeg`), the step itself is kept (`noRelaunch` for touchdown/stop/demand).
Complete → reward card: sortie PP + mission bonus (400 × difficulty `targetMult`), rules broken, rank title, PP to next
rank, progress bar; career `addPP`; progress saved. Continue → `onExit`, Fly it again → restart. Hard: a crash fails. Scandal fails only where `DIFFICULTY[diff].scandalFails === 'always'`.

Mission defs are plain data (`steps: [{ id, coach, target?, enter?, update?, done, hint?, warpHold? }]`), so more
missions = more files in `data/story/` added to `MISSIONS`.

## D18 — time warp

`createTimeWarp()` → `{ level, scale, reason, set(1|2|5), cycle(), reset(), update(state) → scale }`.
State from `warpStateFor({ traffic, player, extra })`. Rules:
- warps only while `traffic.modeOf(player) === 'AUTOPILOT'` and not online;
- **stick input**, **final approach** (approach leg/landing below 220 m AGL or FINAL/FLARE), **conflict** (traffic
  < 300 m or < 25 s closing; ground traffic < 40 m ahead), **crash** → level reset to 1× (chip shows why);
- **radio response window**, mission hold moments (`mission.warpHold`), pause → held at 1×, resumes after.

`createWarpToggle({ container, warp })` → small chip (1× / 2× / 5×, tap cycles), shows the hold reason under the number.

## Wiring (main.js — GAMEPLAY)

Already wired by GAMEPLAY (2026-10-22): `createStory(...)` in `boot()`, `story.simScale()` folded into the sim dt,
`story.update(dt)` every frame, attract camera skipped while `story.cameraOwned`, the menu's **Story** button
(intro first if unseen, then Mission 1), `?mission=N`, `?intro=1`, `showWarp` for Free Flight / Story (never online),
`setTarget` → GAMEPLAY's own markers, `placeWarp()` positioning the chip by the tower badge.
`createStory` also sets `window.__krzStory` (tests and `devhook.install()` reuse that instance).

Still to wire (GAMEPLAY):
1. **Replay the intro from the menu** (D16). Add a "Watch the intro" row (Story submenu or Settings):
   `ui.enterGameplay(); story.playIntro({ onDone: () => ui.showMenu() });` — guard with `!S.player && !story.intro`.
2. Optional **first launch**: at the end of `boot()`, instead of a bare `ui.showMenu()`,
   `if (story && !story.introSeen()) { ui.enterGameplay(); story.playIntro({ onDone: () => ui.showMenu() }); } else ui.showMenu();`
   (today it first plays when Story is pressed, which also satisfies D16).

Behaviour the host can rely on:
- The mission reuses the host's LAND button (`.krz-land`) and finish button (`.krz-finish`) when present; fallbacks only otherwise.
  It calls `ghud.coach.complete()` so the generic coach doesn't talk over it.
- The reward card waits for the Krayzee Herald reel (`.krz-herald`) to close before it appears (≤ 30 s).
- The warp chip hides itself while a `.krz-finish` button is visible and while online.
- Coach layout reads happen only on step change, resize and every ~90 frames; `top` is written only when it changes (PERF #3).

## Tests

```
~/.claude/bin/cdp start --port 9531 -- --use-angle=metal
node tools/story/test-intro.mjs [--only=portrait,landscape,desktop]
node tools/story/test-mission.mjs --view=portrait|landscape|desktop --diff=easy|medium|hard
```
`test-mission` drives the real `?mission=1` path (difficulty via `krayzee.settings`); `diag-tower.mjs` checks the
Mission 1 tower-pass geometry and that `tower_buzz` fires. Shots land in `docs/shots/story/` (`intro_<view>_<line>.png`, `m1_<view>_<diff>_<nn>_<step>.png`).

Last results (2026-10-22, real `?mission=1`, CDP touch on mobile / keys+mouse on desktop):
portrait Easy 13/13, landscape Easy 13/13, desktop Medium 14/14 (scripted low tower pass only), intro 27/27 in all
three views; crash-recovery check (crash mid-mission → bounce line → relaunch → castle leg) OK; no console errors.
A full Mission 1 run takes ≈ 7 min of game time; ~2.5 min of that is ASSIST's long final after LAND (warp is held
at 1× on final by design).

## STORY2 — Missions 2–4, briefings, picker (2026-10-22)

All at C-Tower 1. Each mission teaches **one more rule-break + one more system**:

| # | title | tower | start | rule-break | system | ≈ length (Easy, headless) |
|---|---|---|---|---|---|---|
| 1 | Letters Patent | Toby | **at the hold** (was stand S6) | tower buzz | override/let go, radio, LAND, DEMAND IT | ~6 min |
| 2 | The Pomfrey-Smythe Welcome | Gerald | airborne, downwind, Lord Rupert (C172) on a long final | cut-in on final (`cut_in_final`, often `forced_goaround`) | LAND *with traffic* (press it when the runway is dead ahead: `landCue`) | ~2.5 min |
| 3 | Queue Is a Commoner's Word | Imogen | 5th in the departure queue (3 story planes + hold), tanks at 14/12/10 % | out of turn (`queue_jump` / `unauth_takeoff`) via **DEMAND TAKEOFF** | **fuel** (burn ×5/×7/×8, low-fuel warning, DEMAND IT refuels; Easy/Medium bowser top-up at 2 %, Hard: dry = fail) | ~4 min |
| 4 | The Castle Cup | Toby | at the hold, Rupert's mauve **Tiger Moth** lined up and rolling | onto his runway while he rolls (`double_occupancy` / `runway_steal` / `unauth_takeoff`) | **THROTTLE lever** by hand while the AP steers (lever sets the race pace: legs fly 92 + 40 × lever kt) | ~5 min |

M4 race: gates church → castle → back over runway (any crossing of the runway strip). First through all three wins; Rupert first =
mission failed (retry). Rupert's pace/head start by difficulty (`RUPERT` in mission4.js): Easy 70 kt / 6 s, Medium 86 / 3, Hard 94 / 1.

**Briefing card** (`.krz-st-brief`, every mission incl. M1): title, controller, one-line brief, **Your orders** (numbered objectives),
a difficulty note, **Fly ›**. The world is frozen while it is up (`story.simScale()` returns 0 while `mission.holdSim`); the narrator
reads the brief (n21–n42). **Goal line**: the coach card shows `GOAL · <first unticked objective>` above the step text; objectives tick
as they are earned (`step.tick`, or mission `onEvent`), flash green, and are listed ✓/– on the reward card.

**Unlock / picker**: completing mission n saves `krayzee.story.missions[n].done`; n + 1 unlocks. The menu's Story button (no `?mission=`)
shows the picker once more than Mission 1 is unlocked (LOCKED rows say which to finish; next one highlighted). `?mission=N` skips it.
The reward card offers **Next mission ›** (runs it in the same session), **Menu**, **Fly it again**.

**Robustness (PLAYTEST_3)**: every step completes when the AP doesn't cooperate — M1 radio step times out at 40 s; castle step re-routes
the AP back to the castle (or completes once the castle legs are flown); M3 bless re-routes to the church; M4 re-routes to a gate the AP
flew past; M2 has an ATC fallback for the cut-in and a "too polite, round again" loop; a LAND that picks the wrong field auto-DEMAND-TAKEOFFs
back up for the runway. DEMAND IT is latched (`count('finished')`, not `since`) so tapping it inside the stop step can't stick at 11/11.
The reward card waits while headlines are still queued for the Herald reel (and while the reel / rank ceremony is visible).
Arrivals that would land on top of the player are sent round / off-stage, departures held short (a plane parked on the runway is
cleared) at the land and touchdown steps (`clearArrivals`, repeated every ~10 s); an approach still going round after 200 s, and still above 150 m, is set up
again. Landed in the wrong field: towed to the runway if far off (D22 skip) and DEMAND TAKEOFF back up (`relaunch` in common.js).
M2: landed without the cut-in → relaunch; Rupert respawns when you are back on the downwind. M1 pacing (PLAYTEST_3 #7): starts at the
hold, "your turn" at 80 m AGL (first stick ≈ 50 s in), tighter landing setup (≈ 5.5 min on Easy, was ~7). Warp chip "dropped" reason
clears after 6 s. Landscape: coach widens up to the AP pill and drops the goal line / shrinks if it would reach the stick zone; the
reward card goes two-column; the reward card hides itself while a Herald reel or rank ceremony is on screen.

**Story radio lines** (`data/story/lines.js`, injected into RADIO's bank at mission start; tower lines get the spliced callsign):
Gerald `g_cut`, `g_land`; Imogen `i_jump`, `i_fuel`, `i_bowser`; Toby `t_race`, `t_win`; Rupert (toff) `r_cut`, `r_race`, `r_win`, `r_lose`.
Rendered with `python3 tools/story/narrate.py lines [ids] [--redo]` (narrator clone for n*, the bark voices' manifest clones for radio, 48 kbps).

Tests (port 9632, server 8790):
```
node tools/story/test-mission.mjs --mission=1..4 [--view=…] [--diff=…] [--force=castle|radio|demandfast|church|gate|polite] [--falsify=freeze|overlap|unlock|crime|orders]
node tools/story/test-picker.mjs [--falsify=unlock]
```

Last results (2026-10-23, real `?mission=N`, 390×844 touch unless noted, Easy, port 9632, server 8790):
M1 17/17 (mission time 312 s), M2 16/16 (119 s), M3 16/16 (254 s), M4 16/16 (299 s); landscape 844×390: M1 17/17, M2–M4 16/16;
desktop M2 16/16. Forced: M1 castle 17/17, M1 radio 17/17, M2 demandfast 16/16, M2 polite 16/16 (320 s), M3 church 16/16,
M3 demandfast 16/16, M4 gate 16/16. Picker 8/8. Falsified (each makes its own check fail): freeze, overlap, unlock, orders, crime
(test-mission), unlock (test-picker). Medium/Hard of M2–M4 are not covered by the harness yet.

### Follow-up (2026-10-25, against HEAD 8369b0f1 + working tree)
- M4 Easy: Rupert rubber-bands (dawdles at the Moth's minimum while he is ahead of or level with you), so Easy can't be lost by
  a slow start; Medium/Hard keep his pace. Near line-up legs (M3/M4 `lineUpLegs(…, near)`) are lower (160/110 m) so LAND goes
  straight in under the new LAND; the touchdown "set it up again" only fires above 150 m after 200 s (pulling a low approach
  caused a RECOVERY loop).
- Objectives are only ticked when earned (no auto-tick at completion); `--falsify=crime` re-patches the game every 200 ms, and the
  "earned in flight" check ignores anything logged after `complete`.
- Warp chip: a tap refused by a cancelling condition (traffic, final, hands on, crash) stays at 1×, shakes, and says
  "Not now · traffic" for 2.5 s (`warp.refused`). `node tools/story/test-warp.mjs [--falsify]` (6/6; falsified 2/6) and
  `node tools/story/test-warp-chip.mjs` (real tap, traffic parked off the wing).
- Results: M1 17/17, M2 16/16, M3 16/16 (+ landscape 16/16), M4 16/16 (+ landscape 16/16), M2 Medium 16/16 (scripted turn-in);
  `--falsify=crime`: M2 6/10, M3 15/16, M4 15/16 (each red).
