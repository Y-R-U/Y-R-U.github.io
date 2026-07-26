# FOUL PLAY — handoff / next session

**Status: shipped and pushed to `main`.** Registered in `/projects.js` with a
screenshot at `/assets/screenshots/foulplay.jpg`, so it is live on Pages.

Read `CLAUDE.md` in this folder first — it explains the architecture and the
gotchas. This file is only "what happened, and what to do next".

- Live: https://y-r-u.github.io/gms/3d/foulplay/
- Local: `python3 -m http.server 8977` from `~/cc/yru/site`, then
  http://127.0.0.1:8977/gms/3d/foulplay/

---

## Feedback rounds so far

### 1. "I am looking backward"
The chase camera sat *ahead* of the car looking back down the road you had
already driven. `camera.js:frameChase` — `dir` was the wrong sign. Verified: the
car now sits 17m ahead of the camera, facing track-forward. Hold-buttons also
release on a global `pointerup` so the look-back button cannot stick.

### 2. "Too easy to fly off track"
Rebalanced around one rule: **you only leave the circuit if somebody put you
there.** A barrier hit bounces you back whatever your speed or angle; going
*through* one is gated on `car.slammed`, a 0.9s window set only by an attack or
a car-to-car closing speed over `CRASH.slamSpeed`. Field wrecks per 2-lap auto
race went 18 → 0 at circus and 3–9 → 1 at skyline.

### 3. The big one — economy, menus, carnage
Everything below was built in one pass and is verified. See the sections after
this for what is worth checking by hand.

---

## What round 3 changed

**Economy.** Crates come from the flag by position (4th+ = 1, podium = 2/3/4,
only a winner gets the good one); roadside crates pay cash and nitro. A crate is
mostly money now — high tiers are far rarer and a scrap crate cannot produce a
legendary at all. Nine dry crates in a row arms a pity roll. Almost everything is
buyable and expensive; two parts per slot are not for sale at any price (one
crate-only, the best one a prize). Everything you own takes four marks, cheap at
first and then steep. The team is a facility you buy for a prize share, cheaper
repairs, better crates and circuits your licence would not cover.

**Cars.** Eight chassis. The starter is white and plain on purpose. Four are
bought, three are prizes.

**What is open to you.** One circuit at the start; the rest come from the season,
the team, or a cash licence. Every padlock explains itself when tapped.

**Events.** Sorted available-first, with countdowns when they are calendar-gated.
Four new ones including a Baron who only holds his derby on Saturdays.

**Titles.** Three single-elimination brackets with a visible tree. Each round is
one named rival in the field and beating *them* is the only thing that counts.
Krieg is seeded into the world final.

**Menus.** Header no longer scrolls, back button is a proper target, lists keep
their scroll position. A real race runs behind the browsing screens and the
title screen puts its buttons on the two edges so you can see it. Modelled 3D
rooms for the garage, showroom and career cabinet.

**Carnage.** Barriers fade when the camera is jammed against them and throw a
proper shower. Panels tear loose and hang there for a few seconds, dragging on
the tarmac and clouting whoever is alongside. Wrecks in the replay get a
slow-motion orbit while the car comes apart. Replays have next/previous and a
KEEP button; kept clips live in CAREER → MEMORIES.

**Driving.** No nitro while leading, so the reliable way to win is to stay in the
pack. Haptics scaled so a barrier scrape feels smaller than being rammed.

**Extras I added on top** (Aaron asked for ranked ideas, best implemented):
grudges that persist between races and put somebody you have wrecked back on
your grid angrier; a wind-up warning before a rival uses equipment on you; a
bookmaker who takes stakes on your own result.

---

## TODO — next session, in priority order

### 1. The play checks only Aaron can do

- **Does a well-aimed SIDE SLAM beside a barrier still put a rival out?**
  `CRASH.railVault` is 34 m/s once shunted. The auto-race harness does not
  attack hard enough to prove it either way. Lower it if slams do not finish
  people; raise it if it feels twitchy. Still the number most likely to need a
  thumb rather than telemetry.
- **The economy pace.** Roughly $3k a race early, and a tier 2 part is $3,500.
  If the grind bites, the dials are `TIER_PRICE` and `CHEST_TIERS[*].cash` in
  `arsenal.js`, and `PRIZE_SHARE` in `config.js`.
- **Does the menu backdrop cost frames on the phone?** It self-disables after
  six seconds under 20fps and there is a settings toggle, but the threshold is
  a guess (`flow.js:watchAttract`).
- **Steering feel.** `DRAG_FULL = 78` px in `input.js`. Brake-by-dragging-down
  (`DRAG_BRAKE`) is still the least-proven control.
- **Tilt steering and iOS audio arming** have never run on real hardware.

### 2. Unverified by eye
- Chapter cutscenes 2–9 (the intro and finale were both watched).
- The wreck showcase camera — confirmed to fire with the right shot and slow
  motion, never actually watched.
- The trophy-tap raycast works; the popup it opens has not been seen on a phone.

### 3. Ideas ranked but not built
Kept here rather than guessed at:
- **Sponsors** (★★★★) — contracts taken in the garage that pay a bonus for a
  specific thing over several races. Good structure between races, good cash
  faucet. The biggest one left.
- **Damage carrying between races** (★★★) — a repair bill you can decline.
  Real decisions, but it cuts against "driving should be the relaxing part".
- **A team-mate car** (★★★) — a second car on your team that can block for you.
  Fits the fiction; a lot of new AI.
- **Stewards who remember you between races** (★★★) — a season-long heat level.
  Overlaps suspicion; might just be noise.
- **Photo mode** (★★) and **best-lap ghost** (★★) — nice, not important.

---

## Testing recipe (works, no installs)

```bash
SCRATCH=<scratchpad>
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9333 --user-data-dir="$SCRATCH/chrome" about:blank &
node cdp.mjs "<url>" --wait="<expr>" --evalFile=script.js --await --shot=out.png
```

`cdp.mjs` lives in the session scratchpad; ~90 lines of raw CDP over the built-in
`WebSocket`. **Four hard-won rules:**

1. **Always `--evalFile`, never inline `--eval`** for anything with backticks or
   `${}` — bash expands them before node sees them and you get silent nonsense.
2. **Restart Chrome between debugging runs.** A frozen page blocks
   `Page.navigate`, so one hang poisons every later test on that tab.
3. **`--wait` on a real condition**, e.g.
   `window.__game && window.__game.state.screen==='results'`. Chrome's
   `--virtual-time-budget` does not advance a WebGL sim.
4. **To count events during a race, arm the listeners inside an async eval that
   then polls for `state.results`.** There is no way to attach to a page the
   harness has already navigated.

Useful URLs:
- `?dev=1&auto=1&start=race&track=circus&speed=3` — soak a race at 3× speed
- `?dev=1&wipe=1&level=1` — story from scratch, intro cutscene first
- `?shot=1&track=circus&at=13` — clean frame for a thumbnail
- `dev.html` — builds all 15 circuits and reports geometry. **Every circuit must
  report `gap 0`** after any `trackgen.js` change. (Checked after round 3: all
  15 still exact.)

---

## What is verified

- Boots clean; every menu screen renders with no console errors.
- All 100 story levels generate: 15 tracks, 9 objective kinds, 13 knockouts,
  10 bosses, 40 crate rewards, purse $2,200–$51,150, 11 cutscenes.
- A full race runs to results with the new money rows, crate awards by position
  and prize granting.
- Crate rates simulated over 3,000 openings per tier.
- All three title brackets run to champion with the right number of rounds;
  losing knocks you out; Krieg is in the world final.
- A memory saves (30KB), survives a reload and replays from cold on a rebuilt
  stage.
- Leader boost lockout: nitro and boost pads both dead in P1, both live in P4.
- Dangling panels, flail hits on rivals, rail scrape sparks and grudge grids all
  fire in a live race.
