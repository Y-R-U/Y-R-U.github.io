# THRONG: 15-minute real-phone playtest

This list covers only what no agent can check: ears, hands, a real GPU, real accounts and real mobile networks.
The URL is `https://yru.br8t.com/gms/3d/throng/` (add the `?` params shown). Each step says what good looks like.
If a step goes wrong, note the step number and what you saw.

**Before you start:** have your iPhone and a second phone (or a laptop) to hand. Turn the iPhone's silent switch
**off**, and turn its volume to about half.

## A. First run, sound and feel (iPhone, about 6 min)

1. **First load.** Open the URL in a private tab, then count from tap to menu.
   - Good: the title and the city behind it show within about 3 s on wi-fi. Crowds are already moving behind
     the title, and there is no white flash.
2. **Music and sound, silent switch off.** Tap PLAY.
   - Good: the lobby fills with names.
   - During the 3-2-1: you hear beeps, then music when it says GO.
   - When you sweep people up: you hear small pops.
   - When you absorb a crowd: you hear a bigger thump.
   - In the last 10 seconds: you hear a tick each second.
3. **Silent switch on.** Flip the silent switch on mid-match.
   - Good: the game keeps playing sound.
   - The game asks iOS for "playback" audio, so it plays like a video does. If it goes quiet, say so: that is
     the known iOS Web Audio trap.
4. **Volume.** Open Settings (pause → menu → Settings, or from the menu) and slide Music and Sounds down and up.
   - Good: each one changes at once, and Music at 0 is silent.
5. **Touch feel.** Drag anywhere with one thumb and steer in circles, then let go.
   - Good: the crowd turns within a blink and does not drift off at an angle.
   - With "Keep moving" on (the default), it keeps going after you let go.
   - Nothing on screen gets in the way of your thumb.
6. **The three hints.** These show on the first match only.
   - Good: you see "Drag anywhere to move", then "Sweep up the grey people", then "Bigger crowds absorb
     smaller ones".
   - Each hint goes away by itself and never blocks a tap.
7. **Haptics (Android only, iPhone ignores web vibration).** On the second phone, absorb a small crowd, then get
   absorbed.
   - Good: a short buzz when you absorb a crowd, and a double buzz when you are absorbed.
   - Settings → Vibration off stops both.
8. **Frame rate.** Reload with `?fps=1`. A strip at the bottom shows fps, "5% low", quality, draws and triangles.
   - Play until your crowd is 500 or more.
   - Good: about 60 fps and a "5% low" of 45 or more, with the strip mostly green.
   - Quality says `medium` on a phone. It may drop to `lite` by itself if the phone struggles.
   - Note the fps you see at the biggest moment, and whether the phone gets hot.
9. **Results and rewards.**
   - Good: results appear about 2 s after the whistle (3 s on a festival weekend, for the fireworks).
   - Coins count up.
   - "PLAY AGAIN" is easy to hit with a thumb.
   - On the menu, the Daily button has a red dot, and tapping it claims the day-1 reward.

9b. **Fullscreen (Android, or any browser that offers it).** Open Settings and switch Fullscreen on.
   - Good: the browser bars disappear, and back or a swipe leaves fullscreen with the switch turning itself off.
   - On iPhone the switch is not there. Settings shows "Share → Add to Home Screen" instead, and the home-screen
     icon opens the game with no bars and nothing under the notch.
9c. **Desktop mouse (laptop).** Play one match without pressing the mouse button.
   - Good: the crowd heads for the pointer. With the pointer resting on your crowd, it stands still without
     twitching, and WASD still takes over while held.
   - Settings → Mouse → Drag joystick brings back press-and-drag.

## B. Account and save (2 min)

10. **Sign in.** On the menu, or on results, tap the round account button at the top right and sign in with
    Google.
    - Good: there is no reload loop. Your name or level is kept, and the account avatar shows.
11. **Cross-device.** Open the same URL on the second phone or laptop and sign in to the same account.
    - Good: the same level, coins and locker items appear within a few seconds, possibly after one automatic
      reload.
12. **Share.** On a results screen, tap "Share result".
    - Good: the iPhone share sheet opens with a picture of the results.
    - On a laptop, the PNG downloads instead.

## C. Two phones online, on mobile data (5 min)

13. **Room.** Turn wi-fi off on both phones.
    - On phone 1: ONLINE → CREATE ROOM, pick **King** in the mode strip, then tap Share or Copy link.
    - On phone 2: open the link.
    - Good: phone 2 joins the lobby and sees "King of the Plaza" as the host's pick (that is new this wave).
    - The ping pill shows under about 250 ms.
14. **Play.** Phone 1 taps START.
    - Good: both phones play the same match.
    - The other phone's crowd moves smoothly, with no teleporting.
    - Steering on phone 2 feels as direct as offline.
15. **Host walks away.** Mid-match, press the home button on phone 1 (the host) and wait 30 s.
    - Good: phone 2 keeps playing with no freeze longer than about 1 s. It may say "YOU ARE THE HOST".
    - When you come back to phone 1, it shows the pause sheet and follows the match again.
16. **Reload.** Pull to refresh on phone 2 mid-match.
    - Good: after it loads, it goes straight back into the same match on the same crowd, without any tapping.
17. **Board.** After the match, go to Ladder → Online.
    - Good: the mode chips (All modes / Classic / Teams / King / Last Standing / Infection) filter the board.
    - The King match shows under King.
    - This needs the wave-5 server deployed.

## D. Each mode once, each look once (about 4 min; use Practice so nothing is at stake)

18. **Modes.** From the menu mode strip, play 30–60 s of each mode with Practice:
    - **Teams:** everyone is blue or red, and the score bar moves.
    - **King:** the gold zone glows in the colour of whoever holds it, and the next zone shows as a dashed ring
      6 s early.
    - **Last Standing:** outside the circle the city turns red-grey, the screen edge pulses, and your count
      drops.
    - **Infection:** caught crowds turn lime in a wave from where they were bitten.
    - Good: each mode makes sense within 10 seconds, without reading anything.
19. **Looks.** Open each of these once and check the city looks right at a glance:
    - `?theme=night-neon`
    - `?theme=snow` (snow should fall)
    - `?theme=sunny-day`
    - `?theme=festival` (fireworks at the whistle)
    - `?weather=rain`
    - Good: no black screen, team colours read on every ground, and fps stays near what you saw in step 8.
20. **Landscape.** Turn the phone sideways in a match and on the menu.
    - Good: nothing is cut off, and the minimap does not sit on your crowd.

When you are done, send the step numbers that failed, the fps from step 8, and anything that felt slow, confusing
or cramped.
