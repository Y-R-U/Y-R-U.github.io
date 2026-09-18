# BREACHPOINT II — what to look for

## If you test in an incognito window — read this first

Incognito means **no saved profile, every time**: level 0, 0 SP, rifle only, the instruction screen every
run. That is the right way to test the opening, but it means you never see the campaign, the armoury, the
threat readout or levels 2–8 unless you ask for them. Open the console and paste any of these:

```js
__game.grantSP(30000)                       // enough SP for most of the shop
__game.loadLevel(4)                         // jump straight into any level 0-9 (9 = endless)
BP2.Profile.unlock('pistol')                // also 'shotgun', 'sniper' — skips the cost AND the level gate
['pistol','shotgun','sniper'].forEach(id=>BP2.Profile.unlock(id))
BP2.Profile.setRank('plating',5)            // tracks: vitality plating marksman steady logistics mobility
BP2.Profile.clearLevel(3)                   // mark 0-8 cleared, which opens the next one in the hub
[0,1,2,3,4,5].forEach(n=>BP2.Profile.clearLevel(n))   // open the campaign hub right up
BP2.Campaign.openHub()                      // the hub screen · BP2.Armoury.open() for the armoury
__game.S.touchMode='doubletap'              // 'twofinger' (default) · 'doubletap' · 'tapfire'
__game.god(1)                               // stop dying while you look around (so does the GOD button, top right)
```

The **stuck-player debrief** only escalates on *consecutive* losses on one level, so to see all three tiers:

```js
BP2.Profile.noteFail(4); BP2.Profile.noteFail(4)   // now lose level 4 once for the tier-3 debrief
```

Settings → CAREER → RESET PROGRESS wipes it all again. Everything above is the game's own code, not a
cheat layer — `__game` is the same handle the test suites drive.

Everything in this project is headless evidence about *correctness*. None of it is evidence about whether
the game is any good. This is the short list of things only you can answer, roughly in the order you will
hit them. **Play it once without reading past the first section, then come back.**

---

## Opening it

On the phone, over the local network or from a copy of the folder:

```
gms/3d/breachpoint2/index.html
```

It also opens straight off disk — double-click `index.html`, no server, no build step. That is deliberate
(the whole file layout exists to keep `file://` working), so if the easiest thing is to AirDrop the folder,
that works.

It is **not** on the site and **not** in `projects.js`. That is on purpose until you have played it.

Portrait or landscape both work. Landscape gives you more yard; portrait gives you more sky.

---

## The six questions

**1. Does the instruction screen make sense before you have played?**
It is the first thing you see and the game is paused behind it. You have not touched anything yet, so it is
being asked to explain a control scheme in the abstract. Does it? Or does it only make sense *afterwards*,
which is the same as not making sense.

**2. Does the two-finger scheme read clearly from the instruction screen alone?**
The default is the one from the first Breachpoint: **hold a finger on the look side to look, put a second
finger down beside it to fire, and hold it to keep firing.** Both fingers work at the same time, so the view
keeps turning while you shoot — that is the whole point of it. The question is not whether it works (it
does); it is whether the instruction screen *tells you* that, before you have played. It now draws the real
touch zones over the paused yard with the second finger pulsing in the look zone. Settings still has
**DOUBLE-TAP** and **TAP-FIRE** under CONTROLS, plus a HOLD/SWIPE choice for the look thumb and a left/right
stick swap. Say which combination you ended up on and why.

**3. Does the war beat land?**
Near the end of the paintball drill the PA cuts out mid-sentence and you get conscripted. It plays as six
lines of radio across the bottom of the screen **while you are still standing in the paintball park**, and
it does not stop you playing. Is it a moment, or is it just text going past? It is the only piece of story
in the game, so if it does not land there is nothing else carrying it.

**4. Does the yard read as different places, or still feel like one car park?**
There are nine levels and **one** shipping yard. Each level moves the containers into a different layout,
re-lights it, and drops you in somewhere different. On paper that is a big change — the sniper parapet
overlooks 72% of the map on one layout and 1% on another. The question is whether you *feel* that, or
whether by level 5 it reads as the same car park with a different filter on it. If it does, say which levels
felt distinct and which blurred together.

**5. Is the gate motivating or a chore?**
The whole design is one mechanic: each enemy type carries an armour-penetration value that eats into what
your plating absorbs, so upgrades are worth an order of magnitude more on level 1 than on level 8. The
intended feeling is "I need to come back to this with better kit", and the honest failure mode is "I need to
grind". Replaying a cleared level pays 40%, which always works and is deliberately the slow road. **Did you
ever replay a level, and did it feel like a choice or a tax?**

**6. Does the threat readout help you decide, or just add numbers?**
Before each mission the hub and the armoury tell you **how many seconds of open ground this level gives your
current build**, and the upgrade rows tell you what the next rank buys — including, when it is true, that
the *other* track buys more seconds for the same points. It is accurate to within 4% of what the game really
does to you. But accurate is not the same as useful. Did you read it? Did it change what you bought? Or is
it another wall of numbers on a screen you skip?

---

## Things that would be good to notice

- **Your paint is still on the containers** when you get to mission 1 — at full strength, then fainter in
  2 and 3, gone by 4. It is even reseated onto the yard when the next layout moves the container you sprayed
  it on. Did you spot it?
- **Bosses announce themselves by name** whether or not you happen to be looking at them — which matters on
  the night and fog levels.
- **Fog shortens their sight as well as yours.** Level 7 is night + fog; you can genuinely walk past people.
- **Lose the same mission twice** and the end screen starts telling you things: what to buy, then how high
  the wall actually is in points, then how long it would take to earn. Losing three or four times on purpose
  is worth doing — it is a whole feature you will otherwise never see.
- **RECRUIT mode** is in Settings under DIFFICULTY. It takes 40% off incoming damage, it is never suggested
  to you after a loss, and clears made on it are labelled in the hub. It is there if the gate is too hard;
  the point is that you choose it rather than the game quietly helping.

---

## If you want to poke at it

Open the browser console (or just use the pause screen for the ordinary stuff):

- **Jump to any level:** `__game.loadLevel(n)` — `0` is the paintball drill, `1`–`8` are the campaign,
  `9` is ENDLESS. It drops you straight in at that level's own insertion point.
- **Give yourself points:** `__game.grantSP(20000)`, then open the armoury and buy whatever you like. This
  is the quickest way to find out whether the upgrades feel worth having.
- **Stop dying:** `__game.god(1)`.
- **Reset progress:** Settings → **Reset progress** → RESET. It asks first, on a screen — there are no
  browser popups anywhere in this game. Or clear `bp2_profile` from local storage.
- **Settings** live in `bp2_settings` in local storage, if you want to throw those away too.

---

## One known bug, so it does not waste your time

About **one load in fifty** of **M5 SUPPLY LINE**, the random crate-and-barrel scatter seals the strip of
quay you start on, and the enemies spawn somewhere they cannot walk to you from. If the level ever opens
with you boxed into a narrow lane along the water and nothing comes, that is it — **reload the page and
start the mission again** and it will be gone. It is measured, understood and written up in
`docs/HANDOFF.md` §9.6; it was left alone rather than changing world geometry the day everything else was
verified.
