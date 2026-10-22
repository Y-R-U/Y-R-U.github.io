# PLAYTEST 3: The Kingdom of Krayzee

2026-10-22, about 20:15–22:05. Lane PLAYTEST3 (read-only). Played in headless Chrome with Metal (CDP 9633), cache disabled, and an Android Pixel UA.
Sizes were 390×844 portrait and 844×390 landscape, with touch emulation. Every stick, throttle, chip, LAND, DEMAND, pause and settings action was a real `Input.dispatchTouchEvent` on the element's live rect.
`window.__game` / `__krzStory` were used only to read state. The one exception is the diagnostic in #2, which is clearly flagged.
Screenshots are in `docs/review/pt3/`.

**Build caveat.** STORY2 and ATCSEQ were editing live while I played. During the session these changed: `missions.js`, `mission1.js`, `autopilot.js` (LANDFIX2 flare), `atc/*`, `host.js`, plus new `mission2–4.js`, `picker.js` and a briefing card.
Mission 1 runs 2 and 3 were on the newer `missions.js`. The castle and DEMAND-IT step code I cite is unchanged from HEAD in the working tree.
I did not play missions 2–4 (WIP).

**Headless caveats.**
- Three other lanes' headless Chromes were running (9631, 9632 and 9634), and page eval latency spiked to 2–3 s at times. Stick holds in the Tiger and Bathtub runs therefore lasted longer than nominal, so I took those numbers from the game's own event log.
- Audio was not judged.
- FPS was not judged. The auto governor stepped low → high → low in one sortie, which is most likely contention.

---

## Top 10 (ranked by harm to a first-time phone player)

### 1. Mission 1 soft-locks on step 6/11 "castle" if the radio step runs long (2 of 3 Easy runs)
**Repro (Easy, portrait):**
1. STORY → Mission 1. Take off and do the turn and let-go steps.
2. At step 5 ("Lord Rupert is on the radio… Answer him") the reply chips only live for **5 s** (`radio/index.js` CFG `responseWindow: 5`). Miss them, or take a while to find RADIO.
3. Meanwhile the autopilot keeps flying the route: castle → tower → POSITIONING → the landing racetrack.
4. When the bark finally lands, step 6 starts: "Follow the gold marker to the castle". Its `done` is "within 650 m of the castle", but the AP is now orbiting the runway 4–5 km away and never goes back.
   Step 6 has `resumeLeg` but no `enter` that re-routes (compare step 5's `enter`), and only relaunch uses `resumeLeg`.

**Measured:**

| Run | Radio step took | AP position when castle step began | Then |
|---|---|---|---|
| 1 | 103.8 s | "TO THE TOWER" | Castle step ran 260 s+ with no progress (`13-m1-castle-stuck.png`). Then #2 froze the game |
| 3 | 198.5 s | "PRESS LAND" racetrack | Castle step stuck **507 s**. It cleared only after I hand-flew 60 s to the marker |
| 2 (Hard) | 4.2 s (fast tap) | — | Normal |

**Side effect:** the tower buzz the AP does on Easy happened *during* the radio step (+300 at t=1091), so the crime step then needs a second buzz.

Nothing tells a first-timer that the AP has given up on the castle. Every earlier step taught them that the AP flies.

**Owner:** STORY (mission1.js `castle`/`radio` steps). Suggested fix: on entering `castle`, `setRoute(marks.castle)` if `legIndex` is outside [castle, towerIn), or auto-complete the step if the castle was already passed.

### 2. The whole simulation freezes: AP route index runs past the end of a looping route (`TypeError … reading 'kind'` every frame)
**Seen naturally once.** Mission 1 run 1 (Easy): the AP looped the PRESS LAND / GO ROUND racetrack. At t=558 the log shows `ap.extend metres 1175 end 27` (ATC extended the player's downwind).
At t=585.9 the log shows `TypeError: Cannot read properties of undefined (reading 'kind') at Autopilot.update (autopilot.js:282)`.
Every aircraft stopped dead: the player was frozen at (4001, 1000), 239 m, for 100+ s, and so was all AI. The frame keeps rendering, but nothing moves (`14-m1-frozen.png`). `ap.i = 16` with `route.legs.length = 16`, `loop = 12`.

**Reproduced deterministically (diagnostic, hook-induced, flagged).** On a fresh Mission 1 I called `ap.setRoute(ap.route, {start: 15})` and then `ap.extendDownwind(1175, '27')`, which is exactly what ATC sent.
75 s later `i = 16`, the error fired, and the world froze. Without an extend, 6+ natural racetrack loops in run 3 wrapped fine.

**Cause:** `Autopilot._fly` (autopilot.js ≈660–663) does `this.i++` on pursuit advance and never wraps to `route.loop`, unlike `_next()`.
`extendDownwind` → `_buildFlyPath(true)` rebuilds the last leg's path from the current position, and the pursuit then runs off the end.

**Player escape:** tapping LAND replaced the route and unfroze it (it then landed in a field, see #3). Nobody would guess that.

**Owner:** TRAFFIC/FLIGHT (autopilot.js wrap) + ATCSEQ (should ATC extend a story route that has no circuit at all?).

### 3. LAND always lands now, but half the time it lands you somewhere you can't finish and can't leave
FLIGHTFIX's claim holds: **6 of 6 LAND presses touched down with zero crashes.**

| Where LAND was pressed | Picked | Touchdown | Stopped | DEMAND IT |
|---|---|---|---|---|
| M1 Hard, 3.3 km out on the centreline | RWY 27 | 74 s | ~90 s | OK after taxi-in |
| M1 Easy, 3.3 km out on the centreline | RWY 27 | ~72 s | 97 s ready | OK |
| FF, 3 km east, hdg 273, 119 m | RWY 27 | 205 s (1 go-around, "runway occupied") | 221 s | OK |
| FF, downwind abeam, 1.2 km S, hdg 089 | **FIELD** | 68 s | 81 s, 2.4 km E of the field | **grey "Land nearer a runway"** (`42-land-downwind.png`) |
| M1 frozen racetrack, 6.5 km E | **FIELD** | ~57 s | 72 s | grey (`15-m1-landfield-stopped.png`) |
| Bathtub FF, 1.3 km SW, hdg 179 | **FIELD** | 118 s | 125 s | grey (`63-bathtub-land.png`) |

Once you're stranded in a field:
- **DEMAND TAKEOFF is hidden.** `main.js:566` requires `!g?.finishReady`, and `finishReady` is true once landed and stopped, even outside the finish zone.
- The AP sits at `DONE`.
- No auto-bank happened after more than 5 min stopped with **1,330 PP pending** (D19 promised a long-stop fallback in Free Flight) (`64-bathtub-stranded.png`).
- The tower says "taxi via Alpha to holding point", and a prompt says "You're #2 for departure — jump the queue! 6.0 km · Roll onto the runway first".
- The only exit is an undiscoverable manual grass takeoff (it works: throttle to 100 and drag down; airborne in about 15 s), or Quit, which loses the PP (#6).
- In Mission 1 there is no exit at all short of quitting, and the pause menu has no "Restart mission".

The LAND label does show "LANDING · FIELD", but in tiny text after the press, and pressing LAND on your own airport's downwind and getting a field is a nasty surprise.

**Owner:**
- GAMEPLAY: show DEMAND TAKEOFF whenever finish isn't allowed; restore the auto-bank fallback.
- ASSIST (landahead.js): prefer the home runway (circuit join) when one is within about 3 km, even if not dead ahead; warn before committing to a FIELD that can't finish.

### 4. Hand-flying: any bank turns into a spiral dive (no back-pressure in turns)
Drag the stick sideways, as the mission's "Drag the stick to bank" tells you, and the nose falls straight away.

| Case | Bank | Nose | Vertical speed | Height |
|---|---|---|---|---|
| C172 Easy, 30 px (~⅓ throw) for 6 s | 48° | −17° | −2,496 fpm | |
| Mission 1 turn step (Hard), 40 px, about 3 s | −63° | −22° | −4,401 fpm | 147 → **83 m AGL** in 5 s |
| C172 Easy, full stick at the 60° cap from 160 m AGL | holds 57–60° | −33° | **−6,700 fpm** after ~4 s | 47 m AGL; after release, recovery **bottomed at 6–7 m AGL** (`54-inverted-release.png`) |
| Tiger Easy, 40 px held | 58° at 3–4 m AGL, 105 kt | | | 5 wingtip strikes (Rubber bounced it) |
| Tiger Hard, full stick from 186 m | | | | "propeller hit the ground" about 4.5 s later, destroyed |

The 60° cap works on Easy, but a capped bank with no pitch help is still a dive. On Hard, with no cap and real metal, a beginner's first turn is lethal.

The AP recovery itself is good: wings level within about 1 s of release.

**Owner:** GAMEPLAY (`controls.js` `rollAssist`): add a turn-coordination elevator term (hold vertical speed in banks on Easy and Medium, partly on Hard) and/or FLIGHT.

### 5. Mission 1 can stick on 11/11 forever if DEMAND IT is pressed the instant it lights up
**Repro (Easy):**
1. LAND, roll to a stop.
2. Tap DEMAND IT within about 0.7 s of it turning gold.

Log: `stop` done 1916.9 → `banked 1060` / `finished` 1917.3 (still in step `stop`) → step `demand` entered 1917.6.
`demand.done` is `c.since('finished') > 0`, and `since()` only counts events in the current step. So it waits for a finish that already happened.

Result:
- The coach says "Now press LANDED — DEMAND IT" with no button left to press.
- The mission stays `running`, no "MISSION COMPLETE", and the +400 reward is never paid (`34-m1e-after-demandit.png`, `35-m1e-after-reel.png`).

Seen once, from a bot-fast tap; the race is confirmed in code. An eager thumb that's already hovering over the greyed button can hit it.

**Owner:** STORY (`demand` step: done if `count('finished')` or the sortie was already banked).

### 6. Quit to menu silently throws away pending PP
Mission 1 run 1 had **1,010 PP pending** when I pressed Quit to menu. There was no confirm. Lifetime afterwards was 1,360, which is only the later Hard run's 840 + 520, so the 1,010 never arrived (`16-pause.png` → `17-quit-confirm.png`, which shows the menu: there was no prompt).
`quitPlay()` → `wiring.endPlay()` just drops the game. Seen once, confirmed in code. This is PLAYTEST_1 B11, still open.

**Owner:** UI/GAMEPLAY (confirm "Abandon 1,010 PP?" or bank on quit if landed).

### 7. Mission 1 pacing: still about 2 min before the first touch, 10 min to finish on Hard
| Measure | Value |
|---|---|
| DEMAND TAKEOFF from the stand → airborne | **45 s** (run 2: pressed at 17.5, airborne 62.7) |
| Takeoff step (wait to 120 m AGL) | 41–49 s |
| First "Your turn" | **1:44** (run 2), 2:06 (run 1), 3:00 (run 3, no DEMAND TAKEOFF, natural taxi 131 s) |
| Tower buzz → PRESS LAND (the AP flies 4 km out and back) | 146 s |
| LAND → touchdown | about 72 s |
| Hard taxi-in to the stand | 96 s |
| Hard mission total | **604 s** |

The turn step needs a turn of more than 15°, or more than 3.5 s of stick. A 3 s, 35 px nudge didn't count, and the coach then repeats "Put a thumb on the left side…".

**Owner:** STORY (lower the takeoff-step gate to about 60 m AGL; shorten the out-and-back after the buzz).

### 8. Throttle under manual control: it keeps the AP's *current* setting, which may be idle, and the latch drops when you let go of the stick
**Fixed vs PLAYTEST_2 (B3/B4):**
- Grabbing the stick while the AP had full power kept thr 1.00 throughout.
- A latched throttle (dragged to 46, released) held 0.46 for 15 s with the orange lever and an AUTO button (`41-thr-latched.png`).

**Still bad:**
- Grab the stick while the AP is descending and the engine stays at **0.00**. Mission 1 Hard tower run: 50 s of hand-flying at thr 0.00. Landscape pull-up at thr 0.00 bled 94 → 74 kt in 3 s. Nothing on screen says "you're at idle" apart from the lever number.
- **Latched throttle + stick:** the throttle stayed at 0.46 while I held the stick. As soon as I let go, the latch was dropped: RESUMING 0.75 → 0.00 → 0.54 within 3 s, and the AUTO button vanished. That contradicts the AUTO button's purpose (the latch should persist until AUTO is tapped).

**Owner:** TRAFFIC (autopilot.js throttle-on-grab) + GAMEPLAY (controls.js latch lifetime).

### 9. AP handback is rough when low and slow
- After a manual grass takeoff, released at 41 m AGL / 46 kt: the AP immediately banked 29° into its circuit and sank to **13 m AGL** at −1,808 fpm.
- After an upset recovery the AP porpoises: vertical speed +1,354 ↔ −1,249 fpm and thr 0 ↔ 1 over about 10 s.

**Owner:** TRAFFIC (wings-level climb to a safe height before resuming the route).

### 10. HUD and readability (portrait unless noted)
- **Radio target names are nearly invisible:** "Insult → Baroness Hect" in dark red, and "→ Viscountess Pip" in dark magenta, both on the dark sheet (`10-m1-radio-open.png`, `65-radio-landscape.png`). The rival speaker name "ARCHDUCHESS WOBB" is green on grey-green.
- **Mission start:** the "Letters Patent" title card renders under the DEMAND TAKEOFF / SKIP TO RUNWAY buttons (`04-after-create.png`).
- **Mission 1 radio step:** the coach says answer *Lord Rupert*, but the RADIO sheet (if you miss his 5 s window) offers only "Insult → Baroness Hect". Any bark counts, but it reads as a mismatch.
- **Hard taxi-in after landing:** shows **SKIP TO RUNWAY** (`23-m1h-landed.png`).
- **Mission complete:** the Herald reel stacks on top of the complete card, with Skip all / Next over the progress bar (`25-m1h-after-demandit.png`).
- **Warp chip:** "You took the controls" stays on it for minutes afterwards (`48-view-centre-port.png`, `50-land-chase.png`).
- **Centre view, portrait:** the LAND button still covers the left gauges (`48-view-centre-port.png`).
- **Owner:** RADIO (chip colours), STORY (title card, Rupert chip), GAMEPLAY/HUD (skip button state, reel/card stacking, warp reason expiry).

---

## Smaller nits
- **No Story difficulty picker.** Story uses Settings' **"Free Flight difficulty"**, which is mislabelled for Story.
  Changing difficulty in Settings mid-flight is silently deferred (`setDifficulty(…, true)` suppresses the "applies from your next flight" flash).
- **The Easy bank detent can't be passed by "let go and push again".** Centring the stick (`|ail| < 0.15`) disarms it; only a partial ease (0.15–0.75) works. Fine if it's meant to be hard, but it's undiscoverable.
- **A held thumb survives a respawn (seen once, Tiger, Hard).** Destroyed at t=110 → respawned on the runway with my thumb still at full right → the ground roll steered 271° → 345° → "hard landing", destroyed again at t=124.8. Input should be ignored until the next touchstart after a respawn.
- **After DEMAND IT in Free Flight** the plane sits on the active runway at `AUTOPILOT DONE` until you press DEMAND TAKEOFF. The coach does now point at it (good, `45-ff-after-done.png`).
- **Callsign digits change every flight** (Five-Seven, Eight-Four, Niner-Two for the same Baron Tester).
- **New briefing card (STORY2 WIP)** says "Tower: Tobias", while the subtitle behind it is "Tower · Gerald … line up and wait" with the plane still at the stand (`71-story-again.png`).
- **Two "AUTO" labels** sit side by side: the stick status and the throttle AUTO button.
- **The latched lever's number overprints the "THR" label** mid-travel.
- **`.kz-menu` is still not `inert`** under the creator / gameplay (PLAYTEST_2 B10).
- **Landscape Settings** is two independently scrolling columns. The difficulty segment sits under the header after scrolling; it took two swipes to reach.

---

## What now feels good
- **First launch:**
  - Ready in about 1.0 s.
  - The intro castle shot is lovely; Skip appears on first tap.
  - The menu shows "New pilot · Tap to create" (the Baron Dirk placeholder is fixed).
  - The creator gives a live tail registration (K-TEST).
  - The landscape menu is gorgeous (`72-menu-landscape.png`).
- **Free Flight starts:** 3/3 rolling at once, airborne in 15.8 / 17.1 / 16.3 s. No parked starts (PLAYTEST_2 B6 not seen). Hangar and chips are consistent (Moth/Bathtub locked for a Baron).
- **LAND reliability:** 6/6 touchdowns, 0 crashes. Finals from 3.3 km are down to about 72 s (from 110–124 s in PLAYTEST_2). Go-arounds have a sane reason ("runway occupied").
- **DEMAND TAKEOFF:**
  - From the runway: airborne in 21 s, +240 "unauth_takeoff".
  - From the stand in Mission 1: airborne in 45 s.
  - The coach now points at it after DEMAND IT.
- **DEMAND IT on Hard:**
  - Greyed "Taxi to the terminal" until the AP parks at S4.
  - Then "Bank 840 PP and finish": refuel to 100%, the Krayzee Herald reel ("OWL COLLECTION SHAKEN AS BARON TESTER BUZZES TOWER / Controller found under desk with tea"), then MISSION 1 · COMPLETE +520.
- **Hand tower buzz on Hard:** passed 55 m from the cab at 77 m, +300, mission advanced.
- **Throttle:** stick override keeps full power when the AP had it. The latched throttle with its orange lever and AUTO button reads clearly.
- **Bank cap and recovery:** the 60° cap on Easy holds (57–60° at full stick, "BANK 60°" tag). Upset recovery levels the wings within about 1 s.
- **Time warp:** 1× → 2× → 5× (measured 4.87×). Stick input drops it to 1× with "You took the controls".
- **Views:** chase → centre → cockpit cycle. Disabling two views hides the toggle (`70-fixed-cockpit.png`).
- **Settings:** invert pitch flips correctly. Stick-on-right mirrors the whole cluster (`68-stick-right-portrait.png`).
- **Radio:** chips work in both orientations, and the tower replies in character ("Baron Niner-Two, noted. You're still number three.", "lovely landing. Genuinely. I'm writing it down.").
- **Mission 1 Hard** is completable end to end with real touch.
- **No duplicate AI registrations** in a 7-aircraft sample.
