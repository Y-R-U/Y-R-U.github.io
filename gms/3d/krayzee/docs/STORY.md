# STORY — intro (D16), guided Mission 1 (D17), time warp (D18)

Lane STORY owns `js/story/**`, `data/story/**`, `data/story.js`, `audio/story/**`, `tools/story/**`, this file.
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
