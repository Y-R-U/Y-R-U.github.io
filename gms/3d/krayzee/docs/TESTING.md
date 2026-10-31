# Testing: the core-loop suite (`tools/test-loop.mjs`)

D31 says the core loop is hardened before anything new is built. This suite is the yardstick for that. It plays the loop
in the real game the way a phone player does. Every action is a real `Input.dispatchTouchEvent` on the live rect of the
element a thumb would hit, and a tap on a covered button fails. `window.__game` is only **read**: state, the sim clock,
the event log, and timeouts or diagnostics. Nothing in the flow is driven through a hook.

Owner: lane LOOPTEST. Files: `tools/test-loop.mjs`, `tools/loop/driver.mjs` (CDP, touch, the read-only `SNAP` observer), this doc.
Output: `docs/review/loop/results-<stamp>[-soak|-falsify].json`, plus a screenshot of every failed step in `docs/review/loop/`.

## How to run

```sh
~/.claude/bin/cdp start --port 9636 -- --use-angle=metal      # Metal, or every fps number is fiction
node tools/test-loop.mjs --quick                                 # every commit: C172 Easy portrait + Bathtub Hard landscape (~5 min)
node tools/test-loop.mjs                                         # full matrix, 18 cases (~40 min at 4x)
node tools/test-loop.mjs --cases=tiger:medium:landscape,c172:hard:portrait
node tools/test-loop.mjs --soak[=30]                             # 30 sim-minute Free Flight soak (C172 Easy portrait)
node tools/test-loop.mjs --falsify=freeze,error,cover,deadbutton    # prove the detectors fire (one fresh run per fault)
node tools/test-loop.mjs --falsify=stuck --stuck=40                 # STUCK separately: a short --stuck would trip the long AP legs in the others
```

| flag | default | meaning |
|---|---|---|
| `--port` | 9636 | CDP port. Other lanes use 9632/9634/9635, so never stop those |
| `--url` | `http://127.0.0.1:8888/gms/3d/krayzee/` | game URL (loaded with `?noaccount=1&intro=0&plane=<p>&timescale=<k>`) |
| `--timescale` | 4 | `?timescale=` sim speed-up (max 8). Physics runs at a fixed step, so 4× is safe. Stick and throttle holds are scaled so the *sim* duration stays the same |
| `--stuck` | 300 | STUCK = this many sim seconds with no AP phase change while a step waits for progress (not counted while parked) |
| `--quick` | | the two-case subset |
| `--cases` | | `plane:difficulty:orientation`, comma-separated |
| `--soak[=min]` | 30 | soak mode (sim minutes) |
| `--falsify=` | | `freeze`, `stuck`, `error`, `cover`, `deadbutton`, `msgcover` or `all` |
| `--main-landnow` | off | also tap LAND NOW in the main loop (see "LAND NOW" below) |
| `--shots` | off | also screenshot passing steps and each view |
| `--cover-gate=m,p` | off | fail a portrait case whose airborne screen cover is over mean m % or p90 p % (see "Screen cover") |
| `--cover-shots[=tag]` | off | save heavy message-cover frames to `docs/shots/msgfix/` |
| `--cover-raw` | off | keep every cover sample in the results JSON |
| `--log=N` | 14 | game log lines kept with a failing step |

The exit code is 0 only when every case is green (or, with `--falsify`, when every injected fault was caught).
Each case starts from fresh storage: a seeded pilot (Baron Loop, K-LOOP), coach marks marked as seen, and a career at 0 PP.
Use `?plane=` because a 0 PP Baron cannot pick the Moth or the Bathtub on the chips.

## Matrix

C172 / Tiger / Bathtub × Easy / Medium / Hard × portrait 390×844 / landscape 844×390, with an Android touch UA and DPR 2.
`--quick` covers C172 Easy portrait and Bathtub Hard landscape.

## The loop (per case) and its budgets

All budgets are **sim seconds** (the `traffic.time` clock) unless they say "real". Each step records sim time, real time,
pending PP before and after, new page errors, the longest phase stall and any freeze. On failure it also records a
screenshot and the plane's state.
Steps marked *independent* run even when an earlier step failed. A failed blocking step skips the steps after it.

| # | step | what the thumb does | pass when | budget |
|---|---|---|---|---|
| 1 | boot | — | `__krayzeeReady`, menu Free Flight visible | 40 s real |
| 1 | menu→free | taps **Free Flight** | in play, right plane type | 15 s real |
| 1 | difficulty chip | taps Easy/Medium/Hard on the ground chips (the difficulty is also seeded in `krayzee.settings`, because at 4× the Bathtub lifts off about 2 s real after spawn and the chips go with it; if the chips are already gone, it is a WARN) | `wiring.difficulty` matches; the chip set fades | 2.5 s real/try |
| 2 | takeoff | — (the AP rolls at once) | lift-off, then 60 m AGL | 60 + 90 |
| — | time warp *(independent)* | taps the warp chip 1×→2×→5×, measures, then taps back to 1× | sim rate at 5× ≥ 3× the 1× rate. If D18 drops the warp straight back to 1× ("Traffic nearby"), it waits and retries, as a player would, and that is a WARN; still refused after 90 s sim is a FAIL | — |
| 3 | stick+release | holds the stick base dragged 32 px right, 10 px down, until 3 s of SIM manual flight have passed (HUDPOLISH: the old wall-clock hold became 5–14 s sim under load), then lifts | aileron goes `manual` during the hold; AP back (`AUTOPILOT`, all axes auto) after release; back inside an AP bank (≤ 35°) and sink < 1500 fpm | AP back ≤ 10, recovered ≤ 12 |
| 4 | throttle latch+AUTO | drags the lever to ~50 % and lifts; then taps **AUTO** | `latched` within 3 s and still latched 6 s later, value ≈ 0.5; AUTO → `auto` | 40 overall |
| — | view toggle *(independent)* | taps the view button 3× | chase → center → cockpit → chase | — |
| — | LAND probe downwind *(independent)* | taps **LAND** on the home downwind; if **LAND NOW** shows, taps it; then cancels with a stick touch | a runway is picked (PLAYTEST_3 #3); LAND NOW makes a new plan: `straight`, or the designed fallback when nothing straight works (FLIGHTFIX3 field, or a jet's runway with a quip), which retires the button; LAND stays active (WARN if not); the stick touch (lifted as soon as LAND cancels) cancels LAND; AP takes back | 30 on the game's own waits (downwind + cancel + AP back); harness round trips reported, not budgeted |
| 5 | LAND | taps **LAND** once the active runway is < 3.5 km ahead (±25°, aligned ±30°, as D13 expects). If **LAND NOW** shows, its rect is checked (tapped only with `--main-landnow`) | LAND goes active; touchdown with no crash | reach final ≤ 400 (circuit pacing, reported separately); touchdown ≤ 300 after the tap |
| 6 | stop | — | on the ground and < 1 kt, **or** DEMAND IT already lit (< 5 kt): a player taps it as soon as it turns gold | 90 |
| 7 | DEMAND IT | waits for the gold button (Hard: for the AP to reach the terminal), then taps it | pending → 0, banked += pending, fuel back to 100 %. Fails early if the AP is DONE and sits still for 40 s with the button not ready | 240 + 5 |
| — | (reel) | taps **Skip all**, or **Done** for a single headline, whenever the Herald reel opens | | |
| 8–9 | DEMAND TAKEOFF | waits for the button (skips the Herald reel, which hides it), then taps it | the button is offered; airborne (> 10 m AGL) again | 30 + 120 |
| — | route after takeoff *(non-blocking)* | — | the player's AP route does not end in an AI `despawn` leg | — |
| F1 | field: LAND | in the climb-out (runway behind, ≥ 80 m AGL) taps **LAND**, then **LAND NOW** if shown | touchdown (usually a field), stop | 240 + 90 |
| F2 | field: DEMAND TAKEOFF | taps **DEMAND TAKEOFF** where it stopped | offered within 20 s of stopping; airborne | 20 + 60 |
| Q | quit confirm *(independent)* | pause → **Quit to menu** → **Keep flying** → **Quit to menu** → **Quit and lose them** | the confirm shows exactly the pending PP; Keep flying stays in play; Quit returns to the menu | — |

**LAND NOW.** LAND NOW (LANDFIX2) shows only while LAND flies a circuit or join. It lands straight ahead, so tapping it
in the main loop turns the main loop into the field branch. The main loop records whether LAND NOW is shown. On final it never is, because the plan is already straight. The downwind probe taps it, and so does the field branch when it shows. `--main-landnow` taps it in the main loop too.

### HUDPOLISH (2026-10-28): the four flakes and what they were

- **quit confirm: `.krz-quitc-stay` not visible.** The confirm opened and was shut at once by a second click on its backdrop.
  Under load the first tap's click came late, `tapUntil` tapped QUIT TO MENU again, and that click landed on the confirm's
  backdrop (a backdrop tap closes it). A player double-tapping did the same. A 0.6 s guard was not enough: under load the
  second click arrived later than that. Fix in the game (`js/hud/quit.js`): the backdrop no longer closes the card; Keep
  flying / Quit and lose them are the only ways out. test-hud4: "a double tap on QUIT TO MENU leaves the confirm open".
- **"LAND NOW not visible".** The probe waited for the plan to turn `straight`. When nothing straight works, LAND NOW makes
  the designed fallback plan (FLIGHTFIX3 field `FIELD/base`, or a jet's runway with a quip) and retires the button, so the
  harness read a working tap as swallowed and tapped a button that had gone. The effect is now "straight, or the button
  retired"; the result says `(nothing straight: fallback)`.
- **LAND probe over 30 s sim under load.** It was sim time, but most of it was harness: at 4× every real second of CDP round
  trip is 4 s sim, and under load each `Input.dispatchTouchEvent` waits for a slow frame (a 0.5 s stick touch took ~5 s
  real = 20 s sim). Load does not change the physics (fixed step; a frame over 0.1 s only slows the sim), but it does change
  what a wall-clock thumb does to the sim: a "3 s" stick hold became 12–14 s sim of hand-flying. So holds now end on sim
  time (`D.hold(..., stop)`), and the probe's 30 s budget is on the game's own waits; `[game x s sim, harness y; parts]` is printed.
- **f35 stick+release "not recovered within 12 s".** Same cause: 12–14 s of sim hand-flying at 247 kt instead of 3 s. With
  the sim-time hold it holds 3 s sim.
- **(found on the way) DEMAND TAKEOFF fired by a tap on DEMAND IT.** When DEMAND TAKEOFF appears, DEMAND IT slides up and
  DEMAND TAKEOFF takes its place; the click that ends a tap is aimed by where things are at touchend, so a thumb that went
  down on DEMAND IT launched the plane (the loop's "DEMAND TAKEOFF offered: not within 30 s" — it had already left). Fix
  (`js/hud/place.js startedOn`, `ground.js`, `finish.js`): a tap counts only on the button it went down on, and DEMAND
  TAKEOFF / SKIP ignore taps for 0.5 s after they appear or move. test-hud4 stages the slide.

## Detectors (they run on every sample, in every step)

- **Page errors**: `Runtime.exceptionThrown` and `console.error`. Any new one fails the step.
- **FREEZE** (PLAYTEST_3 #2): over a window of at least 6 sim seconds, the sim clock advanced but either the
  player's own physics clock (`ac.time`) stood still, or the player stayed within 0.3 m while airborne in **every**
  sample of the window, or every airborne AI moved < 0.3 m. Not a freeze (FLIGHTFIX6, `tools/loop/freeze.mjs`,
  `node tools/loop/freeze-test.mjs`): a wreck (crashes are reported as crashes), a jet-borne hover (`ac.vtol` > 0.5),
  and a plane that was on the ground in an older sample (an F-35 VTO 0.2 m up, compared with a sample 18 s older on
  the grass, read as "static in the air").
- **STUCK**: no change of AP phase/leg/sub/ground for `--stuck` sim seconds while not parked.
- **Budget**: a step over its sim budget fails. A real-time cap (budget ÷ timescale × 2.5 + 20 s) catches a stopped clock.
- **Covered**: every tap checks `elementFromPoint` at the button centre. A button under another element is retried for up
  to 8 s real, because a player waits for a transient sheet such as radio chips; that is a WARN naming the covering
  element. If the button is still covered, the step fails.
- **PLAYER_GONE**: the player's AP reached a `despawn` leg (phase GONE). This fails the step it happens in.
- **Crash**: a crash during a manual bit, a LAND approach or a rollout fails that step.
- **Swallowed taps**: a tap whose effect does not show is retried up to 3×, and the retries are recorded (headless
  Chrome sometimes drops a touchStart).

A step shows **WARN** when it passed but something a player would notice happened: a covered button, a refused warp, or
chips that were already gone. Warnings do not fail the case.

## Falsification

`--falsify=<fault>` injects a fault from the harness (a page-side monkey-patch, never game code) at a fixed step. The
fault must then be reported by its own detector:

| fault | injected before | what it does | must be reported as |
|---|---|---|---|
| freeze | stick | `Aircraft.prototype.step` → no-op: the clock runs, nothing moves (the PLAYTEST_3 #2 shape) | FREEZE |
| stuck | LAND | the player AP's `phase` is pinned (the plane still flies) | STUCK |
| error | throttle | throws an uncaught Error | page errors |
| cover | DEMAND IT | an invisible full-width sheet over the lower 60 % of the screen | covered |
| deadbutton | DEMAND IT | DEMAND TAKEOFF accepts the tap and does nothing | airborne again (budget) |
| msgcover | stick | a giant radio card pinned over the middle of the view (gate 12 / 25) | screen cover |

Run `stuck` on its own with `--stuck=40`, so it fires before the touchdown budget does. Do not pass `--stuck=40` to the other faults: the C172's own downwind leg lasts about 156 s sim, so it would trip first and block the steps where those faults are injected.

Last run (2026-10-23, current tree): **5/5 caught.** freeze → FREEZE (player and airborne AI static over 8.8 s sim); stuck → STUCK at 40.5 s; error → page errors; cover → `.krz-finish` covered for 8 s; deadbutton → "airborne again: not within 120 s sim".

## Screen cover (MSGFIX, D32)

How much of the flight view is under message UI, sampled in the page about twice a second (real time) by
`tools/loop/cover.mjs`. Every `test-loop` case runs it (step **screen cover**, informational unless gated), and
`tools/story/test-mission.mjs --cover[=<tag>]` runs it through a mission.

- **View** = the viewport minus the fixed control and HUD zones (`CONTROLS`: stick zone, throttle column, pad, RADIO,
  LAND, DEMAND IT, ground buttons, top-left/top-right buttons, warp chip, tower badge, HUD strip, score widget, parked
  chips), on a 10 px grid.
- **Covered** = inside a visible message element (`MESSAGES`, by category): radio cards (`radio`), the bark/response
  sheet (`chips`), the radio log (`log`), prompt cards (`prompt`), flash banners (`banner`), the Herald reel and the
  papers toast (`herald`), PP popups and the rank-up ceremony (`score`), coach marks and the story coach (`coach`), the
  briefing / mission-complete cards (`story`), toasts (`toast`), the TASKS tick toast and set celebration (`tasks`). Visible = not hidden and effective opacity ≥ 0.15.
- **Reported** for airborne samples (in play, not paused, no briefing/complete card up) and for all in-play samples:
  mean %, p90 %, max %, the share of samples over 25 %, the **longest continuous stretch over 25 %** (real seconds), the
  most message elements at once, and the mean % per category.
- Flags: `--cover-gate=<mean>,<p90>` fails a portrait case over the gate (airborne); `--cover-shots[=tag]` saves heavy
  frames to `docs/shots/msgfix/<tag>-<case>-cover-NN-<pct>pct-<categories>.png` (a new peak, or anything over 18 % after
  24 s; at most 8 per case); `--cover-raw` keeps every sample in the results JSON. test-mission `--cover=<tag>` saves
  `docs/review/loop/cover-<tag>-m<N>_<view>_<diff>-<stamp>.json` (summary + samples) and shots under the same tag.
- Cover shots never overlap a harness tap, drag or screenshot (`guard`): a capture during a touch swallowed the briefing's
  "Fly" tap, and a capture racing the harness's own screenshot is the suspect for taps landing at half scale.
- **Falsify:** `node tools/test-loop.mjs --falsify=msgcover` pins a giant radio card (`[data-cover-test]`, 80 % × 40 % of
  the screen) before the stick step and gates the case at 12 / 25: it must fail with "screen cover".
  2026-10-27: **CAUGHT**, airborne mean 47.4 %, p90 56.6 % (`results-2026-10-27T04-27-13-falsify.json`).

### Before / after (2026-10-27, C172 Easy, timescale 1, airborne samples)

Free Flight = the real-tap loop (`--cases=c172:easy:portrait,c172:easy:landscape --timescale=1`); M1/M2 = test-mission
`--mission=1|2 --cover`. Before = HEAD 8a685d57; after = MSGFIX on HEAD 4ecf580e (TASKS toast included). Files in
`docs/review/loop/` (`results-2026-10-26T14-31-35` before, `results-2026-10-27T04-11-55` after, `cover-before-*` / `cover-after-*`). Shots in `docs/shots/msgfix/before-*` and
`after-*` (the tool writes PNG; the kept ones, the three heaviest per run, were converted to JPEG). Target (portrait, in
flight): mean < 12 %, p90 < 25 %.

| run | portrait mean / p90 / longest > 25 % | landscape mean / p90 / longest > 25 % |
|---|---|---|
| Free Flight loop, before | 6.5 % / 13.5 % / 4 s | 6.2 % / 18.3 % / 3 s |
| Free Flight loop, after | **3.6 % / 8.8 % / 0 s** | **4.4 % / 10.9 % / 0 s** |
| Mission 1, before | 15.9 % / 24.2 % / 7 s | 11.6 % / 15.8 % / 5.5 s |
| Mission 1, after | **8.1 % / 13.4 % / 1 s** | **9.5 % / 15.8 % / 5.5 s** |
| Mission 2, before | 20.9 % / 28.8 % / 8.5 s | 15.5 % / 36.4 % / 10.5 s |
| Mission 2, after | **11.7 % / 21.3 % / 5 s** | **13.9 % / 29.1 % / 5.5 s** |

Most message elements at once: 5 → 4 (3 plus a never-shed one). Run-to-run spread is about ±1.5 points (Mission 2
portrait measured 10.5–13.0 % over four runs while tuning). The story coach was the biggest single cover in missions
(9.5–10.3 % portrait before, 5.9–6.4 % after); radio cards next (3.5–5.8 % → 1.7–3.5 %). Landscape Mission 2 is still the
heaviest (coach 7.1, radio 4.3, sheet 2.2): the landscape view is smaller once the side controls are taken out, so the same card is a bigger
share. The machine was heavily loaded during these runs (other lanes' Chrome, load average 30–90), so step timings were
slow; the cover numbers are per real second and do not depend on fps.

### HUDPOLISH E1 before / after (2026-10-28, C172 Easy, airborne samples)

Before = the tree with MSGFIX (M2 measured by HUDPOLISH on 2026-10-28; M1 and Free Flight are MSGFIX's 2026-10-27 "after"
numbers). After = HUDPOLISH: a folded story coach is one line in landscape too (story.css let `.side` and the busy
two-line clamp unfold it), a radio card that has finished speaking folds to one line on a landscape phone and lingers
1.2 s instead of 2.2 s, the landscape sheet has one header row and 40 px chips, and chips that all go to the same target
say it once in the header. Machine load was very high (load average 90-200) during most after runs.

| run | portrait mean / p90 | landscape mean / p90 |
|---|---|---|
| Free Flight loop, before | 3.6 % / 8.8 % | 4.4 % / 10.9 % |
| Free Flight loop, after | 3.7 % / 8.8 % | 4.5 % / 11.0 % |
| Mission 1, before | 8.1 % / 13.4 % | 9.5 % / 15.8 % |
| Mission 1, after | 7.7 % / 13.4 % | 7.2 % / 11.7 % (mission cut short at the stop step) |
| Mission 2, before | 11.0 % / 21.3 % | 13.4 % / 28.6 % |
| Mission 2, after | 11.2 % / 24.0 % | 10.0-10.9 % / 17-24 % (three runs) |

## Soak (`--soak`)

Free Flight (C172 Easy portrait by default) runs for N sim minutes with the AP flying. Every ~3 sim minutes a thumb takes
the stick for 2 s sim, and every third time LAND is also tapped. Whenever the plane sits stopped for 8 s, DEMAND IT is
tapped (or DEMAND TAKEOFF if that is all there is). Every sample feeds the FREEZE detector; STUCK uses 2 × `--stuck`.
A 30 s timeline records phase, AGL, speed, PP, AI count (and how many are airborne), fps, quality tier and JS heap.
The soak passes when there are no freezes, no stuck phases and no page errors.

## Results — current tree, 2026-10-23 (`results-2026-10-22T23-51-10.json`, timescale 4)

The tree was a work in progress: LANDFIX2 and STORY2 were editing `landahead.js`, `landbutton.js`, `autopilot.js`,
`controls.js` and `story/*` while the suite ran. Real time was 39 min for 18 cases (2.2 min each). A C172 Easy portrait
rerun at 1× gave the same outcome as 4×: the same failures, touchdown 100.7 vs 94–96 s sim, airborne 25.1 vs 25.3 s sim
after DEMAND TAKEOFF. The timescale is therefore not changing what the suite sees.

| step | pass | sim s (min / median / max) |
|---|---|---|
| boot → menu → Free Flight → difficulty chip | 18/18 | ready ≤ 1.1 s real |
| takeoff (lift-off; to 60 m AGL) | 18/18 | lift-off C172 14.2, Tiger 9.1, Bathtub 8.1 |
| time warp 5× | 18/18 (9 WARN: "Traffic nearby" refused it for 7–21 s sim) | measured ×4.7–5.0 |
| stick + release, AP takes back | 18/18 | AP back 0.1–4.1 |
| throttle latch (held 6 s) + AUTO | 18/18 | 11–14 |
| view toggle chase→center→cockpit→chase | 18/18 | |
| LAND probe on the home downwind | **0/18** (picks FIELD every time) | |
| LAND on final ≤ 3.5 km → touchdown | 18/18, all RWY 27 straight, 0 crashes | reach final 60–209; touchdown 46–120 |
| stop / DEMAND IT lit | 18/18 | 9–27 |
| DEMAND IT (bank + refuel) | 12/12 Easy+Medium; **0/6 Hard** | fuel 0.98 → 1.00 |
| DEMAND TAKEOFF from the runway → airborne | 18/18 | 15–25 after the tap |
| route after takeoff | **0/18** (departure route ending in `despawn`) | |
| field: LAND (+ LAND NOW) | 17/18 (Tiger Hard: wingtip strike, destroyed) | 59–101 |
| field: DEMAND TAKEOFF | 11/17 (Bathtub 0/6: a ~62 s grass taxi, budget 60) | C172/Tiger 0–2 (field hop) |
| quit confirm with pending PP | 17/17 (exact PP shown) | |
| page errors / FREEZE / STUCK | none | |

Soak, 30 sim min (C172 Easy portrait, 7.5 min real): no freeze, no stuck phase, no page errors, no crashes. fps held 57–60,
heap 220–540 MB with no growth. 10 stick grabs, 3 LAND taps, 1 DEMAND TAKEOFF. The PLAYTEST_3 #2 freeze needs a story
route plus `extendDownwind`, and Free Flight did not reach it in 30 min.

The findings with repro steps and owners are in the LOOPTEST report to the manager (MANAGER_STATE).
