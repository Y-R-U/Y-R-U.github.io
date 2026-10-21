# PLAYTEST 1: The Kingdom of Krayzee

2026-10-22. Lane PLAYTEST (read-only). Played in headless Chrome with Metal (CDP port 9511), with the cache disabled.
Sizes: 390×844 portrait and 844×390 landscape, both with touch emulation and real `Input.dispatchTouchEvent` stick, throttle and chip taps, plus 1280×800 desktop with the mouse.
Screenshots are in `docs/shots/playtest/`, numbered in the order they were taken.
Teleport (`__game.teleport`) was used only to set up rule-break scenarios. The flying itself was done by touch.

**Note: the build changed while I was testing.** About halfway through, GAMEPLAY/TRAFFIC changes went live: a score pill, coach marks, opportunity prompts, the RADIO button moved bottom-right, and AI names like "Baroness Plum".
Each item below says whether it was seen on the early build, the late build, or both.

**Harness caveat (not a game bug).** After switching Emulation from desktop (`mobile:false`) back to mobile on the same page, Chrome stopped delivering CDP touch events. No `touchstart` or `pointerdown` arrived at all. Restarting Chrome fixed it.
Anyone scripting touch tests: restart the browser between desktop and mobile runs.

---

## 1. Bugs and blockers (ranked)

### B1. A crash in Rubber mode leaves the score stuck on "BANKING…" and puts you back on the runway on hold. (late build)
Repro: Free Flight (Rubber). Teleport to `{x:300,z:-60,alt:60,heading:270,speedKt:100}` and hold full forward stick into the grass.
- Log: `impact bounce` ×3, then `crash: gear collapsed`, then a respawn LINED UP on 27, then `ap.holdposition: incursion`.
- The PP pill shows **"246 PP BANKING…"** and was still showing it 6 s or more later, with `pending 246, banked 0, landed:false`. It never banks. (`37-impact-*.png`, `38-after-impact.png`, `40-after-crash-6s.png`)
- "Gear collapsed" counts as a crash even though Free Flight is "full protection" impossiRubber. Per the brief, Rubber should never destroy the plane.
- The nose-dive smash also scored **"Country Squire" grass_landing +290**, so you get paid for an uncontrolled crash.
- Right after the respawn, the chase camera was briefly parked at runway level looking at a tiny plane in the distance (`38`). It settled by `40`.
- Event log timestamps go backwards (impact/crash events use a different clock: `9.3 → 3.2 → 6.4`). This is harmless, but it makes the log useless for debugging.

### B2. The spawn itself scored an infraction, and the opening was dead air. (early build; looked fixed by mid-session, needs a recheck)
- On the first Free Flight, the player spawned LINED UP on 27 while an AI was still rolling out on it and another AI was on final. That gave an instant **"SHARED RUNWAY! +300"** (`double_occupancy`, victim ac2) at t=0, and then **"SENT ROUND! +270"** when the AI on final went around. That's 570 PP of crime for doing nothing.
- The player then sat stationary for about **40 s** before the takeoff roll (`06-ff-portrait-0..5.png`).
- On the late build, the takeoff roll starts within about 3 s and there's no spawn infraction (desktop run). **But after a crash respawn (B1) you're LINED UP again with `holdposition: incursion`**, which brings the dead time back.

### B3. The radio HUD draws on top of the pause/Settings modal and keeps transmitting while paused. (early build)
`08-pause.png`: the tower card, a new AI subtitle ("Request takeoff, Tower. Daylight's wasting!") and the RADIO button all render over the Settings sheet. The subtitle covers the Peerage card, and the RADIO button sits in the middle of the "Invert pitch" row.
The radio should hide (or at least sit under the modal) and its queue should freeze while paused. Not rechecked on the late build.

### B4. Letting go of the stick at low altitude sinks the plane hard during the "wait 1.5 s neutral" phase. (both builds)
- After an illegal takeoff, releasing at about 45 m AGL: within about 4 s the HUD showed **-680 fpm at 150 ft** while RESUMING/CROSSWIND (`14-after-release.png`).
- After the tower buzz, releasing at about 30 m: **-1440 fpm at 70 ft** (`19-buzz-after.png`), and later -1270 fpm at 90 ft (`21`).
- Full-right roll for 2 s at 150 m, then release: the plane went inverted, the AP waited and blended, and the "recovery" started too late. It **hit the ground** (alt went to -3.7 m; 8 rubber bounces).

The handback is the core mechanic. Today, letting go near the ground is the most dangerous thing you can do. Fixes:
- If the plane is upset (bank above 45°, or VS below -500 fpm under 100 m AGL), skip the wait and go straight to RECOVERY.
- During the wait, hold the current pitch attitude rather than neutral elevator.

### B5. During a stick-only override, the AP keeps driving throttle and flaps for the phase it thinks it's in. (both builds)
Teleport onto the 27 centreline at 15 m and hand-fly a low pass. The AP had replanned to FINAL, so it set **flaps 30 and throttle 0** while the player held the stick.
Holding -0.4 elevator, the plane still **ballooned from 15 m to 51 m** and slowed from 95 to 63 kt. The low pass (`low_pass`, Royal Flypast) never scored.
The HUD phase also stays "DOWNWIND" through a whole hand-flown approach and landing (`28-handland-flare.png`).
When the stick is overridden for more than about 2 s, freeze the AP's flaps at their current value and hold throttle for current speed. Don't keep running the old phase's schedule.

### B6. You can't stay on the throttle: lifting your finger hands it back to the AP. (both builds, design bug)
Drag THR to 100 on the hold and let go. After 1.5 s the AP blends back and brakes to a stop: `TAKEOFF ROLL → LINED UP`, with thr going `1.00 → 0.08 → 0` and brake 1 (`10-unauth-takeoff.png`).
To "take off out of turn" you have to keep one thumb on the throttle the whole time. That leaves only one thumb for the stick and none for rudder, brake or radio.
The throttle is a lever, not a spring. It should stay where it's put (latched MANUAL until the player taps an "AUTO" chip or touches AP), or at least stay latched while it's above the AP's value.
With the throttle held, the illegal takeoff did work and scored **UNAUTHORISED TAKEOFF +240** (`12`, `13`).

### B7. Cutting in on final: ATC sends **you** around, the AP obeys, and no Cut In is scored. (late build)
Hand-flew onto the 27 final about 1 km ahead of K-GUSS (on base).
- The player went `FINAL → GO AROUND` with `ap.goaround: "ATC: crossingTraffic"`. The AI behind carried on and landed.
- No `cut_in_final` PP was scored.
- The banner shows the raw reason string: **"GO AROUND · ATC: CROSSINGTRAFFIC"** (`26-cutin-final.png`).

The brief's fantasy is royals barging in. Right now the obedient autopilot undoes the crime unless you hand-fly all the way to touchdown.
Fix: if the player has overridden in the last N seconds, the AP should *refuse* ATC go-arounds. Make the tower beg instead; that's the joke. Also humanise the reason string.

### B8. The same tower line shows twice when two infractions fire together. (early build)
A tower buzz followed by a terminal buzz 1 s later stacked two identical "I can see your face! I can see your FACE!" pills (`19-buzz-after.png`).
The scolds are coalesced (RADIO says "a newer one within 4 s replaces it"), but the subtitle pill isn't.

### B9. Subtitles get truncated mid-clearance. (both builds)
"…cleared to land, runway two…" (`31-view-portrait-center.png`, `38`). The ellipsis cuts off exactly the runway number.
Also, "Professio…" is truncated in the portrait tower card on every portrait screenshot. Allow 3 lines, or shrink the font.

### B10. Opening the response window coincides with the plane in its worst state, and it covers the middle third of the screen. (both builds)
`19`/`21`: the SCOLDED panel (about 190 px tall in portrait) sits over the plane and horizon while the plane is at 70–90 ft sinking at about 1300 fpm (see B4).
In one run, a tap on "Do you know who I am?" while the panel was still animating in didn't register. The same tap worked on the next window (`21` vs `24`).
Make the chips a compact bottom strip above the controls, and open the window only after the plane is stable, or make it non-blocking.

### B11. Smaller items
- Two AI planes shared the registration **K-DOTT** in the same session (early build).
- Early build: AIs are addressed by registration with a title ("Baroness K-DOTT", "Baron K-GUSS"). Late build has names (Plum, Fizz), but the opportunity prompt still says "Duchess K-WOBB" (`38`).
- Losing a sortie loses its PP: after Quit to Menu, the 570 pending PP was gone with no warning on the Quit button. If that's intended, say "Unbanked PP will be lost" on the button.
- **`lib/auth/localsync.js:124` (shared code, not krayzee)** assigns `localStorage.setItem = function…`. On a Storage object that creates literal keys **`setItem` / `removeItem` with value "null"** in localStorage (seen in `Object.keys(localStorage)`). It's harmless today but pollutes saves and sync. Use `Storage.prototype` or a wrapper.
- First-run creator: tapping the generic `.kz-btn.primary` hit the hidden menu's FREE FLIGHT button behind the sheet. That's my harness's fault, but it shows menu buttons stay in the DOM and focusable under the modal. Set `inert` on the menu while the creator is open.

---

## 2. Is it fun? Does it deliver the brief?

**What already lands:**
- Tower buzz is a genuinely funny moment. "TOWER BUZZ! +390 ×1.3", the tower face going Professional → Strained → Cracking with a sweat drop, and "I can see your face! I can see your FACE!" all work (`18`).
- "BOING!" on a rubber bounce (`37-impact-0`).
- "Baroness Four-Seven, that was very much not the runway."
- "Taxi to holding point… Slowly. Like a normal person."
- The Laird's "Landin' noo, tower. Mind yersel'."
- The late build's opportunity prompt ("Duchess K-WOBB is on final for 27 — cut in ahead! 300 PP") is exactly the right idea.

**What's missing in the first 5 minutes:**
1. **Nobody to be rude to.** Traffic is sparse and far away: often 1 plane in the circuit, and others "DONE" 8–10 km out. With no traffic markers (D12 isn't wired: `js/assist/markers.js` isn't referenced from main/wiring), you can't see who to cut in front of.
   The first 60 s should *guarantee* a rival on short final as you line up, another on the hold behind you, and a marker on each.
2. **The autopilot is too law-abiding to be funny** (B6, B7). The core loop should be: override, commit the crime, let go, and the AP *carries on from the crime*.
   FLIGHT.md says this is what replan does. In practice the throttle snaps back, flaps and throttle fight you, and ATC go-arounds undo the cut-in.
3. **No rival banter aimed at the player in normal flight.** AI→tower chatter is routine ("Hello, tower, love. Have you eaten?" is good). I saw no AI insulting *me*, and no Insulted window, unless I committed a crime.
   Add at least one scripted rival who heckles you in the first minute.
4. **Rewards are invisible until you land and stop.** The late build added the PP pill ("BREAK A RULE", "LAND & STOP TO BANK"), which is good.
   Add a tiny combo/outrage meter next to it, plus a one-line "what counts as a crime" list on the first sortie.
5. **The LAND assist (D13) isn't wired** (`js/assist/landbutton.js` isn't referenced). Hand-landing on a phone is hard (see controls). Without the assist, a non-pilot can't "cut in and land illegally"; they can only bounce.
6. **The start is slow** (B2): about 40 s on the runway in the early build. The attract scene on the menu shows planes only as specks (`05-menu-attract.png`). The brief wants "an airport with plane coming and going", so frame a plane close up on the menu.

---

## 3. Controls feel on touch

Measured with real touch drags (stick zone 187×250 px portrait, 260×240 landscape; floating origin):
- **The stick throw is very short: about 54 px from centre to full.** 20 px gives aileron 0.37, 25 px gives elevator 0.47, 50 px gives 0.93. On a phone, that means a twitch of the thumb is half-stick.
- **Roll rate (rate-command, no bank limit):** 0.37 gives about 17°/s and keeps going (46° after 2.7 s). Full gives about 90°/s: **inverted in 2 s**. There's no auto-level or bank cap while you hold.
  This is far too twitchy for "cruise the circuit and cut in". Recommendations:
  - Increase the throw to 80–90 px.
  - Use an expo curve.
  - Make the stick bank-*angle*-command (stick = target bank, capped at 60°), with a "sport" toggle for rate mode.
- **Pitch:** ±0.47 gives about 10–13°/s at 95 kt; ±0.93 gives about 20°/s. Nose-down is a bit weaker than nose-up. Fine at altitude, sluggish near the ground with AP flaps out (B5).
- **Axis signs are correct per D9/D10:** drag down = nose up, drag right = roll right, stick on the left. I found no reversed axes. Keyboard ArrowDown = nose up is consistent.
- **Throttle** is a springy override (B6). That's the single biggest feel problem.
- **Override and handback:** going to MANUAL is instant and clearly shown (the orange stick ring, the chips, "MANUAL" under the stick). The handback is too slow (3.5 s) and unsafe near the ground (B4).
  Suggestions: make handback "hold attitude for 1 s, then blend 1.5 s", and add a big **AP** button to hand back instantly.
- **Rudder:** the ◀RUD / RUD▶ buttons sit under the throttle thumb in portrait (`06`). You can't use rudder while holding the throttle (B6).
- **Visual feedback:** the knob does follow the finger (verified: knob moved 38 px for a 42 px drag). The "AUTO/MANUAL/RESUMING" tag under the stick is a nice touch.

## 4. HUD, radio and marker readability on a phone

- **Portrait, early build:** the RADIO button (64 px) sat dead centre, **over the player's own aircraft in chase view** and **over the attitude indicator in cockpit view** (`06`, `31-view-portrait-cockpit.png`). The late build moved it bottom-right (`38`). Keep it there.
- **Landscape chase:** at altitude, the subtitle stack, the "AUTOPILOT · LANDING RUNWAY 27" banner and the "DIDN'T ASK! +200" popup all overlap the plane in the centre band (`33-land-air-chase.png`). You can't see your own aircraft.
  Move subtitles to a left column under the PP pill in landscape, and limit the stack to one line.
- **Coach marks** pop up mid-manoeuvre. The "Goal: earn Royal Privilege…" card covered the speed/alt strip during a nose-dive at -4700 fpm (`37-impact-0`). Show coach marks only when the plane is stable or on the ground.
- **Low contrast:** the "→ Baron K-GUSS" target line on the Insult chip is dark green on navy (`23`). The STICK/THR/RUD/BRK/FLP chips are about 9 px text, readable only because they're colour-coded.
- **The HUD strip** (KT/FT/HDG/FPM) is clear and well sized. The VS sign is correct.
- **The tower mood card** is excellent: the face plus the meter read instantly. Fix the truncation (B9).
- **No traffic or target markers** (D12 isn't wired). That's essential on a 390 px-wide screen where other C172s are sub-pixel at 1 km.

## 5. Visual quality vs a polished mobile flight game

**Strong:**
- The player C172 exterior with livery: the name on the tail and the registration under the wing look good from chase (`12`, `14`, `36`).
- The creator turntable (`03`).
- The runway markings and piano keys.
- The patchwork fields and tree rows from 400+ ft (`24`, `33`). That's genuinely pretty.
- The menu title art and crest.

**Looks cheap:**
- **Tower:** a plain grey cylinder on a grey slab, with only a crown and a flag as character (`18`). For the star of the banter it needs windows with a lit cab, an antenna, railings, and ideally a visible controller silhouette. Buzzing it should be the money shot.
- **Car park:** cars are single-colour boxes (`18`, `19`).
- **Terminal:** reads OK from afar, but up close it's flat panels with no glazing depth.
- **Centre/cockpit view:**
  - The glareshield is a huge featureless near-black slab taking about 15% of the screen (`31-*-center/cockpit`, `33-land-air-center`).
  - The black disc at top-centre in Centre view (known nit) is still there.
  - In portrait Centre view the panel is cropped on both sides: the ASI and the left gauges are cut off.
  - The pilot's hands are untextured low-poly blobs.
- **Grass landing:** a hard black band (hedge/ditch?) cuts across the field like a terrain seam (`28-handland-flare.png`). The ploughed field on landing is a flat stripe texture (`29`).
- **Menu attract** (B11/§2): the planes are invisible specks.
- **Desktop** shows the touch controls with no keyboard hint. That's fine for now.

## 6. Performance (headless Metal; frame times are indicative only)

- **Boot:** first-run creator at about 1 s. `__krayzeeReady` was 4.1 s on desktop and 8.1 s for `?start=free` in landscape. No console errors in any run (only `favicon.ico` 404).
- **Auto-quality governor works:**
  - Portrait (phone content) stayed `low` at about 55–58 fps.
  - Landscape stepped `low → medium`.
  - Desktop stepped `medium → high` (`history: up:medium@60, up:high@60`).
- **renderer.info (`autoReset` off over two rAFs):**
  - Desktop high: 92 calls / 688k tris over about 2 frames, so **~46 calls / ~344k tris per frame**, 40 programs.
  - Portrait low (single-frame read, last pass only): 74 calls / 215k tris in chase; 35–39 calls / 173–176k tris in cockpit and centre.
  - **Tris are high for a phone** at low tier: about 215k in chase, mostly trees and fields. Check the tree LOD and instancing at low tier.
- **Hitching:** 300-frame rAF sample on desktop high: p50 16.7 ms, p95 16.8 ms, **max 50 ms, 8 frames > 33 ms (2.7 %)**. These are periodic spikes worth profiling. Likely suspects: subtitle and pill DOM churn, radio clip decode, or shadow-box refocus.

---

## Top 10 (summary)

1. **B6: the throttle snaps back to AP when you lift your finger.** You can't commit the headline crime (take off out of turn) without pinning a thumb on it. Latch the throttle.
2. **B7: cutting in on final gets the player sent around by ATC, and the AP obeys.** No Cut In PP, and the raw "CROSSINGTRAFFIC" string is shown. A recently-overriding royal's AP should ignore go-arounds.
3. **B4: the handback sinks the plane** (-680 to -1440 fpm near the ground), and recovery from an upset comes too late. Skip the wait when upset; hold attitude instead of neutral stick.
4. **B1: a crash in Rubber mode** ("gear collapsed") leaves the PP pill stuck on "BANKING…", pays grass_landing for a nose-dive, and respawns you on hold for "incursion".
5. **Stick is too twitchy:** 54 px full throw and 90°/s unlimited roll (inverted in 2 s). Lengthen the throw, add expo, and use bank-angle-command by default.
6. **Not enough traffic or markers to be rude to** in the first minute. D12 markers and the D13 LAND assist aren't wired. Guarantee a rival on final and one on the hold at spawn.
7. **B5: during a stick override, the AP keeps running flaps 30 / throttle 0 from its old phase.** It fights the player's low pass, and the HUD phase label lies.
8. **B3/B10/§4: clutter.** Radio over the pause modal; subtitles, banners and popups over the plane in landscape chase; the response window over the plane at its worst moment; coach marks mid-dive.
9. **B2: slow, guilt-free start** (early build: 40 s parked, plus 570 PP of spawn "crimes"). Mostly fixed by late build, but it comes back after a respawn.
10. **Visual weak spots:** the cylinder tower and box cars at the place you buzz most; the black glareshield slab and black disc in centre view; the cropped portrait panel; the hedge seam band; the menu attract planes as specks. Also about 215k tris at low tier on phones.
