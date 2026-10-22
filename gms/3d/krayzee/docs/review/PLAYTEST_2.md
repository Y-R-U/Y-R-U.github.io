# PLAYTEST 2: The Kingdom of Krayzee

2026-10-22. Lane PLAYTEST round 2 (read-only). Headless Chrome with Metal (CDP 9511), cache disabled, touch emulation.
Most runs were 390×844 portrait (Android UA). There were also 844×390 landscape runs, plus 1280×800 desktop for the intro.
All flying, chips, radio, LAND, DEMAND IT, pause and quit were done with real `Input.dispatchTouchEvent` taps and drags.
I also used a small touch "hand" that steers the stick toward a point.
`__game.teleport` was used once, to set up the cut-in scenario, and is flagged where it was used.
Screenshots are in `docs/shots/playtest2/`.

The previous run was killed by a usage limit while it was chasing a hang. That hang is now nailed down (B1).
Other lanes (POLISH, AIRPORTS, NET) were editing while I tested. Once (about 16:2x), `index.html` loaded with `__game` undefined and the menu half-alive. A reload a minute later was fine.
Anything seen only in that window is excluded.
Background CPU was shared with two other lanes' headless Chromes (ports 9561 and 9601), so the perf figures are indicative only.

---

## 1. Bugs and blockers (ranked)

### B1. BLOCKER (iPhone UA): the first tap on the page freezes the tab (main thread pinned, about 180 % CPU, memory climbing). **Root cause found.**
`js/audio/index.js` `unlock()`: when the UA is iOS and `navigator.audioSession` is missing, it starts a looping `<audio>` whose WAV holds **zero samples**:

```js
silentEl = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');  // data chunk size 0
silentEl.loop = true; ... silentEl.play()
```

Chrome spins forever on a looped zero-length media element.

**Repro**
1. Load the game with an iPhone UA. Chrome DevTools "iPhone" device emulation does exactly this.
2. Tap once, anywhere. This was found on the intro, but any `pointerup`/`touchend`/`click` triggers it.
3. Every `Runtime.evaluate` now times out. One `Input.dispatchTouchEvent` took 66 s to return.
4. The renderer sits at 175–210 % CPU, and RSS goes 510 → 709 MB in 20 s. It never recovered in 75 s or more.

**Evidence**
| Run | Result |
|---|---|
| iPhone UA, tap | Hang |
| Android UA, same taps | No hang (eval 1–100 ms) |
| iPhone UA with `navigator.audioSession` stubbed in via `addScriptToEvaluateOnNewDocument` | No hang |
| Bare page, gesture, looped zero-sample WAV | The same freeze (eval timeouts, about 180 % CPU) |
| Same bare page, WAV with 2 samples | Fine (about 48 events/s) |

**Who is hit:** anyone testing with DevTools iPhone emulation (likely Aaron), and iOS older than 16.4 (no `audioSession`), where WebKit's behaviour is unverified.
Real iOS 16.4+ takes the `audioSession` path and is safe.

**Fix:** give the WAV at least one sample (or drop `loop`), or use a short real silent clip.

### B2. BLOCKER: the LAND assist never lands, so Mission 1 cannot be completed (3/3 runs, Easy and Medium).
Mission step 8 says "press LAND once the runway is dead ahead". I waited until the heading was within 20° of 27 and |z| was under 200 m, then tapped LAND.
- **It picks a FIELD instead of the runway** (`landAt label:'FIELD' kind:'grass'`) when the plane is about 200 m north of, and parallel to, 09/27 (3/3).
- FIELD approach → FINAL → `ap.goaround 'not lined up'` → **GO AROUND that never ends**.
  The plane climbs straight out at +690 fpm and was still going 9+ minutes later, 22 km away at 2,000 m AGL (`m1-easy-STUCK-goaround.png`).
  The mission stays on step 9 "Hands off…" for good.
- Re-tapping LAND after 90 s put the story into PRESS LAND on the centreline 2.6 km out, which gave `landAt 'RWY 27'`. Even then:
  - `LAND · DESCEND` is an **orbit that doesn't descend**: it holds 150–160 m for a full 360°, about 60 s.
  - The orbit is followed by FINAL at -1000 fpm with 23° of bank, then `goaround 'not lined up'`.
  - After that the loop repeats: orbit → `goaround 'too high'` → orbit → `'too high'`… That was 4 go-arounds in 6 min, with no touchdown.
- PLAYTEST round 2 run 1 (before the limit) saw the same thing in Free Flight. LAND chose a field next to a forest and the plane ended up in the trees at -40 ft, with "Land nearer a runway" greyed 2.5 nm out (`28-land-approach.png`, `29-land-stopped.png`).

**Code pointers:**
- `js/assist/landahead.js:474`: the orbit legs labelled `LAND · DESCEND` carry an altitude the AP doesn't follow.
- `js/flight/autopilot.js:693–694`: the go-around triggers.
- The go-around after a FIELD `landAt` never replans.

### B3. Grabbing the stick idles the engine, and the throttle lever lies (both builds; new form of P1 B5/B6).
`autopilot.js:240–244`: while the stick is manual, the AP holds the airspeed from the moment of the grab and ignores the player's lever.
- Any bank or nose-down raises speed, so the throttle goes to **0.00 within 2–3 s**. Measured:
  - 40 px roll: thr 0.85 → 0.00 at 2.8 s, -729 fpm.
  - -15 px push: 0.96 → 0.00 at 3 s, -1117 fpm.
- The THR lever then **displays 0** even though the player had dragged it to 100 a few seconds earlier (`41-c172-fullbank.png` shows THR 7).
- In the tower-buzz run, I set the lever to 100, let go, then flew at the tower. The engine sat at 0.00–0.35 for 50 s and the plane sank to 3 m AGL with "THR 100" on screen before that.

Net effect: you can't hand-fly a level turn or a low pass without also riding the throttle with your other thumb.

### B4. The throttle still springs back to the autopilot (P1 B6 not fixed).
Drag THR to 50 in flight and let go. It holds 50 for about 3 s, then `RESUMING` blends it to 77 and then 100 by +5 s (`50-thr-released.png`).
On the ground the same "lever isn't a lever" problem means an illegal takeoff still needs a pinned thumb. DEMAND TAKEOFF now covers the use case.

### B5. There is no bank limit at full stick: inverted in 3 s, even on Easy (P1 top-10 #5 partly fixed).
The stick throw is now about 94 px, and 40 px gives aileron 0.25 at about 10°/s. That is nice and gentle.
But at full deflection the "~60° soft-limit" doesn't hold:
| Aircraft | Bank at full stick |
|---|---|
| C172 | 143° at 3.1 s |
| Tiger | 135° at 2.8 s |
| Bathtub | 97° at 3.0 s |

The C172 released at 147 m inverted still hit the ground at **-7,937 fpm / 132 kt**. Rubber saved it, then the AP showed `TAXI` while it was airborne at 26 m and climbing 2,700 fpm.
The Bathtub bottomed out at 36 m. Recovery itself now starts immediately (good: P1 B4 is partly fixed).

### B6. The Free Flight start still sometimes parks you on the runway for 2–2.5 min, and pays you for it (P1 B2 not fixed; intermittent).
Seen in 3 of about 12 starts (both previous-run first launches, plus Tiger):
- **LINED UP for 141–157 s.**
- While you sit there doing nothing you score **SHARED RUNWAY +330** (an AI taxiing in on the runway at spawn) and then **SENT ROUND +270/+380** (the AI on final goes around because you're on the runway).

The other starts roll within 1–9 s. Log for the Tiger run: `play 3.3 → LINED UP 3.5 → SENT ROUND 75.6 → takeoffroll 144.7`.
The DEMAND TAKEOFF button (D21) is the escape hatch and it works (airborne 11 s after the tap). But a new player doesn't know to press it, and the first-run coach mark points at RADIO, not at it (`09-ff-wait-1.png`).

### B7. Pacing: every AP landing spends about 2 min on "FINAL" with time warp locked.
- In five Free Flight circuits, FINAL started at 2.3 nm / about 4 km out and lasted **109–124 s** to the flare.
- The warp chip says "Final approach" and stays at 1×.
- A full sortie (takeoff → circuit → DEMAND IT) is about 3.5 min, of which 2 min is a straight-in final with nothing to do.
- On Hard, after landing the AP holds short of 04/22 for about 75 s, then taxis to the stand. That took more than 2.5 min after touchdown and still wasn't there.

Shorten the AP final, or allow warp on final until about 1 km out.

### B8. Mission 1 pacing before the first interaction.
Taxi from the stand took 54–71 s, *even after tapping DEMAND TAKEOFF at 3–4 s*. DEMAND TAKEOFF from a stand still taxis the whole way, and the coach line doesn't change to acknowledge it.
The takeoff step took another 50 s. **The first time the player touches the stick is at 2:00–2:30.**
Then turn, let go, radio and castle all happen within 25 s. The pacing is front-loaded with waiting.

### B9. HUD overlaps (clutter: P1 #8 partly fixed).
- **Landscape:** the LAND button sits on top of the opportunity-prompt card. The prompt title and first words are hidden ("…he terminal windows", "…e tower!") (`71-land-downwind.png`, `71-land-final.png`, `80-view-cockpit-land.png`).
- **Landscape:** the target-marker label loses its "RWY 27" prefix and shows "· 1.0 nm · 045°".
- **Portrait:** the "That'll hit the papers!" toast covers the KT/FT/HDG strip, and the TOWER BUZZ popup covers the plane (`m1-easy-08-land.png`).
- **Portrait Mission 1 taxi:** the coach card covers the first line of the tower subtitle, and the "Letters Patent" title card sits on the RWY target label (`m1-easy-01-taxi.png`).
- **Upset:** the "AUTOPILOT · RECOVERING" banner renders *through* the tower subtitle (both texts visible), and the "Points stay pending…" coach mark pops up mid-dive at -4,300 fpm (`41-c172-fullbank.png`).
- **Portrait centre view:** the LAND button covers the ASI/AI gauges (`80-view-center-port.png`).
- **Marker labels:** "1800 ft" and "1500 ft" labels overprint each other when two aircraft are close (`09-ff-wait-1.png`).
- **Response window:** still about 300 px tall in the middle-lower third, over your own plane (`m1-easy-05b-radio-window.png`). The chips truncate the target ("→ Lord Rupert Pomfr…").

### B10. Smaller items
- **Duplicate registrations persist (P1 B11):** K-BIFF ×2 and K-TOFF ×2 in the same session's AI list.
- **The menu isn't `inert` under the first-run creator (P1 B11):** `document.querySelector('.kz-menu').inert === false`.
- **A placeholder pilot is shown at first launch:** with empty storage the menu shows "Baron Dirk · DIRK AIR · K-DIRK · 2,000 PP to Viscount" before any profile exists. Tapping it opens a creator that says "Baron Nobody" (`30-menu-first-launch.png`).
- **Warp chip:** after DEMAND IT it still says "Final approach" while parked.
- **Hangar vs chips:** the Hangar gates Moth behind "Reach Earl · 6,000 PP", but the in-flight AIRCRAFT chips let a Baron pick Moth and Bathtub freely. POLISH is mid-work on this; flagging the inconsistency.
- **Event-log clocks:** `impact`/`touchdown` events still use a different clock (156.7 appears after 160.5). This is P1 B1's minor point.
- **Silent swallowed tap:** after typing with `Input.insertText`, the first creator tap focused the wrong input. That's my harness, not the game.

---

## 2. PLAYTEST_1 regression table

| P1 item | Status | Evidence |
|---|---|---|
| B1 Rubber crash → stuck "BANKING…", gear-collapse crash, grass_landing for a nose-dive | **Not reproduced**: hard ground hits now bounce ("DIGNITY LOST −57", no crash, no stuck pill). Didn't retest the exact teleport dive | Tiger/C172 upset runs |
| B2 Spawn infraction + dead air | **Not fixed** (intermittent, 3 of ~12 starts; DEMAND TAKEOFF is the escape) | B6 |
| B3 Radio over pause, transmitting while paused | **Fixed**: only the sheet is visible and the sim is frozen (`64-pause-portrait.png`) | |
| B4 Handback sinks the plane / late upset recovery | **Partly**: mild releases recover cleanly. Recovery starts at once, but an inverted release at 150 m still hits the ground (C172) | B5 |
| B5 AP flaps/throttle schedule under stick override; phase label lies | **Partly**: flaps frozen, label now MANUAL. Throttle is now a speed-hold that idles the engine and overrides the lever | B3 |
| B6 Throttle springs back | **Not fixed** | B4 |
| B7 Cut-in: ATC sends *you* round, raw reason string | **Partly**: placed 700 m ahead of an AI on final (teleport setup), the AP carried on and landed with no go-around. The cut-in PP is untested (it needs a real overtake). The friendly reason strings are in | `63-cutin.png` |
| B8 Duplicate tower pill | **Fixed** (not seen) | |
| B9 Subtitles cut mid-clearance | **Fixed**: three lines wrap the whole clearance. The name header still truncates ("Baroness M…") | |
| B10 Response window covers the plane at its worst moment | **Partly**: it now opens when stable, but it's still large and central | B9 |
| B11 Duplicate regs / registration names / quit loses PP / menu not inert | Duplicate regs: **not fixed**. AI names: **fixed**. Quit warning: not retested with pending PP. Inert: **not fixed** | B10 |
| #5 Twitchy stick | **Partly**: throw, expo and low-deflection rates are good; no bank cap at full stick | B5 |
| #6 Nobody to be rude to; markers and LAND not wired | **Fixed**: markers and LAND wired, rivals seeded, Lord Rupert heckles in Mission 1, AI traffic on final at most spawns. LAND itself is broken (B2) | |
| #8 Clutter | **Partly** | B9 |
| #9 Slow start | **Not fixed** (intermittent) | B6 |
| #10 Visual weak spots | **Partly**: menu attract now frames a biplane close up (fixed). Portrait centre panel now fits. The black compass blob top-centre and the dark glareshield band remain (`80-view-center-port.png`). Low-tier tris down from 215k to about 120k per frame | §7 |

---

## 3. First launch and first 5 minutes vs the brief

**First launch:**
- Boot to intro takes about 1.5 s (fast).
- The 72-s intro auto-plays on first launch. It's beautiful: the castle shot over the patchwork fields (`03-intro-skipchip.png`), and the narration lines are funny.
- A tap shows "Skip intro ›". The skip goes to the menu in about 1 s (Android UA; iPhone UA hangs, see B1).
- The menu over the live airport looks premium. The account nudge "Save your progress" is a non-blocking callout (good).
- The first-run creator is lovely: the turntable, the name on the tail, and the K-AARO registration suggested from the name.

**Minutes 0–5 (Free Flight, Easy, C172):**
- Usually rolling within 1–9 s, airborne at 16 s and at 130 m by about 60 s. Sometimes 2.5 min parked (B6).
- Tower chatter is constant and funny:
  - "cleared for take-off. Mind the cows."
  - "Taxi to holding point… Slowly. Like a normal person."
  - "please stop buzzing the tower. My owls are falling over."
  - "lovely landing. Genuinely. I'm writing it down."
- Opportunity prompts appear ("Buzz the tower! Pass within 80 m below 78 m", "Rattle the terminal windows", "Feeling naughty? Land on the taxiway…"). These are exactly the brief.
- Radio works: four chips including "Do you know who I am?" Picking "Request landing" made Baron Aaron say "Tower, landing shortly. Clear the riff-raff, would you?", and the tower answered with a real clearance. The tower mood face went to "Cracking" after crimes.
- Tower buzz by hand: +340 to +440 PP ×1.15–1.48, with the owl line. Still the best moment in the game.
- Time warp: 5× really is 4.8×, and any stick input drops it to 1× with "You took the controls".
- DEMAND IT banks, refuels and shows the Krayzee Herald reel ("COMMONERS SENT ROUND BY BARON AARON / Fuel bills mount across the shire") with Next / Skip all (`22-reel-1.png`).

**What hurts the first 5 minutes:**
1. **Hand-flying feels bad** because the engine idles the moment you touch the stick (B3), and full stick rolls you inverted (B5). The core fantasy ("override, do a crime, let go") works best when you *don't* touch the stick.
2. **LAND doesn't land** (B2), and an AP landing has a 2-minute final (B7). The "land and DEMAND IT" payoff comes about 3.5 min in at best.
3. **DEMAND TAKEOFF** is the funniest button and the cure for a parked start, but the first-run coach points at RADIO instead.

**Story Mission 1:**
- Intro text, coach lines, and Lord Rupert's "You fly like a startled pheasant, old boy" all land well.
- On Medium the tower-buzz step works by hand-flying (28 m from the cab, +340).
- But it takes about 2:15 before the first stick input (B8), and it **cannot be finished** (B2).

## 4. Per-aircraft feel (real touch, Easy, chase)

| | Takeoff → 130 m | 40 px roll (≈ail 0.25) | Full stick 3 s | Release from upset | Notes |
|---|---|---|---|---|---|
| **Runabout (C172)** | 16 s airborne, 60 s to 130 m | 29° in 2.8 s, smooth | 143°, nose -28°, -4,000 fpm | Recovery starts at once but hits the ground from 147 m | The most "normal" plane. The engine idles under stick (B3) |
| **Moth (Tiger)** | Sat LINED UP 141 s (B6), then fine; 57–60 kt climb | 23° in 2.5 s; a wingtip touched the runway right after rotate when I banked at 1 m (Rubber bounce, −57 PP "DIGNITY LOST") | 135° at 2.8 s | Low-level: AP levelled cleanly from 2 m | Slow and floaty, feels right for a Moth. Wingtip strikes on the ground roll are easy |
| **Bathtub** | DEMAND TAKEOFF → airborne 11 s; 93 s to 130 m at 55 kt | 27° in 2.6 s, sluggish start | 97° at 3 s (slowest roll) | Bottomed at 36 m, recovered | AP climbs at 47–50 kt, close to its stall. Charming and slow. The pitch response is fine |

All three: on the ground the stick X steers the nosewheel on rollout (270° → 236° in 2 s at 50 kt). **Aaron's "can't override on the ground" bug is fixed.**

## 5. Phone HUD readability (portrait 390×844 / landscape 844×390)

- **Strong:**
  - The KT/FT/HDG/FPM/FUEL strip.
  - The PP pill with its "BREAK A RULE / LAND & STOP TO BANK / DEMAND IT TO BANK" hint.
  - The tower mood card (Professional → Cracking, with the face).
  - The AUTO/MANUAL/RESUMING tag under the stick.
  - The warp chip with its reason.
  - The radio button above BRAKE (D15).
- Subtitles now wrap to three lines and are translucent (D15). The edge-of-screen traffic arrows are clear.
- **Problems:** B9 overlaps. The axis chips (STICK/THR/RUD/BRK/FLP) are still tiny and only readable by colour.
  In landscape the stick zone takes the left third and the buttons/throttle the right, which leaves a clean centre band for the plane. Good, apart from the bottom prompt card / LAND overlap.

## 6. Visuals

- **Very good:**
  - Intro and menu framing (castle, fields, hedgerows).
  - Chase view of the livery.
  - The landscape from circuit height.
  - The Krayzee Herald card.
  - The creator.
- **Still weak:**
  - In centre view, the top quarter of the portrait screen is red headliner plus the black wet-compass blob, and the glareshield is a dark band (`80-view-center-port.png`).
  - When LAND put the plane into a forest, the camera sat inside a tree canopy (huge dark cones filling the screen) (`29-land-stopped.png`).
  - I didn't get close-up tower shots this round.

## 7. Performance (headless Metal; other lanes' Chromes were running too)

- **Boot:** menu ready in 1.1–1.8 s. `?start=free` has a player in 2.4–5.5 s (once 11.8 s under contention).
- **Starting a flight from the menu:** one 532–539 ms frame and a few 100 ms frames in the first 15 s (world/shader warm-up).
- **Forced low tier, portrait and landscape, in flight:**
  - 300-frame sample: p50 16.4–16.7 ms, p95 17.8–19.1 ms, max 18.5–20.3 ms, **0 frames over 33 ms**.
  - About 46 calls and about 120k tris per frame (92 calls / 240k tris over 2 frames).
  - 48–54 programs, JS heap about 215–220 MB.
  - Centre and cockpit views cost about the same as chase.
- **Auto quality** stepped up to `high` in phone emulation on this Mac, as designed (D6).
- **B1** is the only real perf problem found: the iPhone-UA silent-audio spin.

---

## Top 10 (with owners)

1. **B1: the iPhone-UA tab freeze** from the zero-sample looping `<audio>` in `js/audio/index.js` `unlock()`. It freezes on the first tap and hits DevTools iPhone emulation and iOS < 16.4. Give the WAV at least one sample, or drop the loop. **Owner: GAMEPLAY (holds js/audio) / AUDIO.**
2. **B2: the LAND assist never lands.** It picks FIELD next to the runway, the orbit doesn't descend, and the go-around after a FIELD approach never ends (flies away 20+ km). Mission 1 can't be completed on Easy or Medium. **Owner: ASSIST (landahead.js) + TRAFFIC (autopilot go-around/replan); STORY to add a mission-side fallback.**
3. **B3: stick override idles the engine** (speed-hold) and the THR lever shows the AP's value, not the player's. Hand-flown turns and low passes sink. **Owner: TRAFFIC (autopilot.js:240) + GAMEPLAY (controls/lever display).**
4. **B5: no bank cap at full stick** (inverted in about 3 s on Easy in all three aircraft), and an inverted release at 150 m still crashes the C172. **Owner: GAMEPLAY (controls.js soft-limit) + TRAFFIC (recovery).**
5. **B6: random 2–2.5 min parked starts** that score SHARED RUNWAY / SENT ROUND for doing nothing. Point the first-run coach at DEMAND TAKEOFF. **Owner: AIRPORTS/TRAFFIC (ATC spawn clearance) + GAMEPLAY (coach).**
6. **B4: the throttle still springs back to the AP** about 3 s after release. **Owner: TRAFFIC + GAMEPLAY.**
7. **B7/B8: pacing.** A 110–125 s AP final with warp locked; Hard taxi-in of 2.5+ min; Mission 1's first stick input at about 2:15 (DEMAND TAKEOFF from the stand still taxis the full route). **Owner: STORY + TRAFFIC.**
8. **B9: HUD overlaps.** In landscape, LAND sits over the prompt card and the marker label loses its prefix. The "hit the papers" toast covers the instrument strip; the RECOVERING banner overprints subtitles; a coach mark appears mid-dive; LAND covers the gauges in portrait centre view. **Owner: GAMEPLAY/POLISH.**
9. **B10: duplicate AI registrations; menu not inert under the creator; "Baron Dirk" placeholder on first launch; Hangar gating vs the in-flight aircraft chips.** **Owner: TRAFFIC (regs), UI (inert, placeholder, Hangar), POLISH (chips).**
10. **Visual nits:** the centre-view compass blob and glareshield band, and the camera inside a tree canopy after a field landing. **Owner: PLANE/ART + GAMEPLAY (camera collision).**
