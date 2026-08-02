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

---

# ROUND 4 — the AAA low-poly visual pass (overnight, 2026-08-02)

Target: match the craft of shipped low-poly racers (reference images in
`~/Downloads/low_poly_car_examples/`). Method: fan out single-file builder
agents, then judge with a **blind** art-director agent that compares a capture
against the reference side by side without being told which is which.

**Blind score went 3 → 5 out of 10** (reference scores 8). 14 builder rounds,
8 critic rounds, ~3.8M subagent tokens.

## Nine real bugs found — none of these were art problems

1. **The road ribbon was wound backwards.** `buildRoad` pushed indices
   clockwise-from-above with up-facing normals, so the surface you drive on was
   the material *back* face. three.js flips the shading normal there, so the
   asphalt was lit with a normal pointing into the earth — `dot(N,sun) = -0.70`,
   clamped to 0. **The road received zero directional sunlight.** No car could
   ever cast a visible shadow on it.
2. **The sun direction vector was flattening every surface.** Noon ran
   `sunPos [0.62,0.50,0.40]`. Those normalised components *are* the dot products
   a flat-shaded box hands the key, so side/top/end lit at 1.55:1.25:1 — about
   12 display levels between an up-face and a lens-facing face. Now 0.80/0.57/0.19.
3. **The ACES tone curve shoulder was discarding 5/6 of the car's form.** White
   paint arrived at 0.95 (up-face) and 1.26 (side-face); log-slope up there is
   ~0.26. Replaced with a linear segment + exponential shoulder.
4. **The mobile shadow box excluded every prop.** `medium` used a 50m span while
   the roadside band sits 24–58m out. Not one tree was inside the shadow camera
   on the tier that ships to phones.
5. **Detached panels faded the whole car.** A car's 10 body meshes share one
   `bodyMat`; `debris.js` faded debris by mutating `material.opacity`. Panels now
   get cloned materials on detach.
6. **Danglers were truncated to under 0.6s** by `p.dangling = Math.min(...)` in
   `damage()` on *any* later hit — which is why nothing ever flapped.
7. **The blob-shadow fallback never once fired.** `collectBlobRoots` capped
   candidates at 40 meshes; a car is 78–86.
8. **Vertex-colour bands need bracketing columns.** The centre line (`±0.016`
   next to tyre columns at `±0.44`) and the whole verge table smeared instead of
   drawing. Same class of bug twice.
9. **The belt line sat exactly level with the tyre tops**, so there was no
   bodywork above a wheel to cut an arch into — every previous "add wheel arches"
   attempt was geometrically impossible.

## Destruction (the owner's headline ask) — delivered and measured

Panels half-off then gone; **dangling is now the default, not a 22% edge case**;
danglers drag and spark **from the real contact point**; debris **hits other
cars**; the car drives on chassis + seat + one wheel (verified at **zero**
wheels, 121–216 km/h); **5% speed per wheel**. Player's own car sheds a **median
of 13 parts per race** (owner had seen 1). Stripped cars appear in ~6 races in 13
(`CHASSIS_HP` 320, chosen from a 36-race sweep). Every panel is a separate mesh
over a **steel/rust skeleton** — rollcage, engine bay, bucket seat, stub axles —
so losing bodywork exposes a frame instead of more paint.

## Still open

- **Shadow map is offset from its caster and only applied to one vehicle**, with
  no contact term at the tyres. This is the single biggest remaining visual gap
  ("right lamp, wrong ground").
- An **AI car's rear wheel/sill intersects the road plane** (clipping).
- **HUD/UI pass never done** — clipped on three edges, LAP and taunt banners draw
  over the player's car, speech bubbles eat a third of the screen. Flagged in the
  first review, never owned by any agent.
- Boost pad reads as a sprite laid *on* the road, not *in* it.
- Horizon instancing spam; midground density thinner than the reference.

## Testing notes worth keeping (round 4)

- **Headless Chrome renders on the real GPU if you DON'T pass
  `--disable-gpu --use-angle=swiftshader`.** SwiftShader renders **no shadow map
  at all** — that flag invalidated several rounds of shadow work and produced a
  false "no shadows anywhere" critique.
- `readPixels` returns zeros unless you call `render()` in the same tick.
- Prove a shadow exists by toggling `sunLight.castShadow` and diffing frames,
  rather than arguing about screenshots.
- `?shot=1&at=N` is not a stable test frame — `at=13` and `at=28` often catch a
  crash with the car half out of shot. Capture 3 and pick one.

---

# ROUND 5 — the crash pass (2026-08-02)

Owner's report: *"a crash either on or off track had the car vanish underground.
A crash should see multiple panels coming loose… the highlights often don't show
much… I saw a car impact another, no sparks, just two rigid bodies hitting each
other… cars also appear to go partially through the barrier."*

Five bugs, all of them real, all now measured rather than eyeballed.

## 1. The car vanished underground — two separate wrong numbers

`car.js:groundLevel()` was a guess, and it was wrong in both of its branches.

- **On the circuit** it returned `roadY - 2.2`. `updateWreck` then rested the
  car at `groundY + 0.7`, so a wrecked car settled **1.5m below the tarmac it
  had just crashed on**. Every on-track wreck sank.
- **Off the circuit** it returned one flat plane at `bounds.min.y - 3` — the
  lowest point of the whole circuit. Crash off a raised section of skyline
  (`y 0..51`) and the car fell fifty metres past the visible ground.
- `groundY` was also sampled **once**, at the moment of impact, so a car that
  crashed on a crest and slid down the run-off kept the crest's height.

Meanwhile `trackmesh.js` already had `terrainHeightFn` — the real heightfield —
and `vergeDrop`, the real apron profile. Nothing outside that file could reach
either. `attachGroundProbe` now hangs `track.groundProbe(worldPos, sHint)` off
the track: tarmac (at the banked offset, not the centreline) → apron → terrain,
blended. `groundLevel` is a call to it and the wreck re-reads it every frame.

**Measured:** clearance during a wreck now pins at `WRECK_REST` (0.45) and never
goes negative except for sub-frame transients during a bounce. On track the
probe agrees with the car's own road position to **within 0.02m across a 22m
elevation change**, and it is right on loop circuits with inverted frames.

## 2. A wrecked car was a rigid brick

`update()` returned at `if (this.mode === 'wreck')` **before reaching
`updateDanglers`**. So every panel torn half-off in the impact froze mid-pose
and never let go — the replay camera was orbiting a solid object, which is most
of why the highlights showed nothing. Wreck mode now advances `trackTime` and
runs the danglers (which already knew not to drag on the road in wreck mode).

## 3. The break-up happened on one frame

`wreck()` detached 2–5 parts in a single tick and then tumbled a shell.
`startBreakUp` replaces it: two go outright on impact, four more tear loose and
flap through the tumble, and the rest are **queued to let go at their own moment
across `CRASH.breakUpSpread` (2.4s)**, each with its own shower. Leaving the
circuit is an instant loss so it takes 78–100% of what is left; a write-off
*on* track — where you rejoin — only loses 28–45%. Anything that tears during a
wreck gets its dangle capped to ~1–2s so it visibly goes before the truck comes.
The truck also will not come while the shed queue is non-empty.

**Measured**, forced off-track wreck: 25 parts → 19 → 16 → 15 → 11 → 8 → **6**
over 2.1s, with **3–7 panels flapping simultaneously** throughout.

## 4. Car-to-car contact drew literally nothing

`contactDamage` ran the whole damage model and emitted no visual event at all —
no sparks, no mark. Hence "two rigid bodies". `race.js:impactFx` now throws a
double spark shower from the point between the cars, plus smoke and a shock ring
on a hard one, and calls `car.addScuff` **on both cars**.

`addScuff` is the owner's suggested cheat, taken literally: it scars the paint
where the hit landed and lifts a **torn flap of bodywork off that scar**. The
flap is registered as a real part, so it flaps, drags, sparks, clouts whoever is
alongside and eventually leaves — and when it goes **the scar stays**, so a car
carries a record of every hit it took. Thresholds are `contactSparkSev` /
`scuffSev` / `scuffFlapSev` in `config.js`.

**Measured:** 37 scuffs in a 2-lap 8-car auto race; both cars in a forced
side-slam get marks and live `scuffN` flap parts.

## 5. Cars sat two thirds of a metre inside the barrier

`t` is the car's **centre** and the rail's inner face stands at `width + 0.35`,
but `checkEdges` clamped the centre to `width` — parking 0.67m of a 2.05m-wide
car inside the steel, on every single barrier contact. The limit is now
`width + RAIL_FACE - carWide/2`, so the flank stops at the rail. `RAIL_FACE` is
exported from `config.js` and `trackmesh.js` builds the rail ribbon from the
same constant, so the two cannot drift apart again.

Restitution also ramps `railRestitution` (0.5) → `railRestitutionHard` (0.86)
with impact, so a real thump is thrown back off the steel instead of leaning on
it, and the sparks come off the car's **flank** rather than its centre, where
most of them were never visible.

**Measured:** worst-case penetration by a grounded car across a full race went
0.67m (by construction) → **0.02m**. The 5m readings you get without an
`h < 1.0` filter are airborne cars sailing over jumps, which is intended.

## Verified

- 15/15 circuits still report `gap 0` in `dev.html`.
- Auto races to results with zero console errors on hometown, carverpass,
  loopyard (+ the rest of the sweep in the commit message).
- Field carnage unchanged in volume (131–141 parts off per 2-lap race) — this
  round changed *when and where* pieces come off, not how many.

---

# ROUND 5b — the highlights reel

Owner: *"the highlights don't appear to show loose panels? damage etc? each
highlight can be shorter as well, e.g. 1s before the crash and the actual crash
only."*

Both were real, and the first one was a recording bug, not a playback one.

## The reel recorded one bit per panel

`recordFrame` sampled a `partMask` — present or gone — and playback rebuilt a
**fresh, full-health car** and toggled `part.visible`. So:

- **A dangling panel is still present**, so the replay drew it perfectly bolted
  on in its home position, then popped it out of existence the moment it let go.
  Every bit of flapping — the best thing in a crash — happened off camera.
- **Dents never appeared at all**; ghosts are built with `partHp: 1`.
- The car in the clip was always factory-clean apart from missing panels.

`STRIDE` goes 9 → 11: a **dangle mask** and a **damage fraction** join the part
mask. Playback runs `poseGhost`, which flaps hanging panels using the *real*
swing code and dents the survivors. To get one copy of that maths, the 60-line
style switch came out of `car.js:updateDanglers` into an exported
`danglePose(obj, p, t, flapK, loose, out)` that both callers share.

Panels also now spark **from where the panel actually was** rather than from the
car's origin, and a wreck throws real scrap in the replay — the ring buffer never
recorded debris, so a replay wreck used to shed its panels into thin air.

**Measured** on a forced wreck: recording holds 5–8 panels dangling
simultaneously through the break-up while parts go 20 → 11; the ghost swings
panels up to 0.92m open across 802 samples.

## A wreck clip took eighteen seconds to watch

`PRE` 2.3s + `POST_WRECK` 3.4s is 5.7s of footage, but the slow-motion ran at
**0.22× over half the clip**. Integrated, that is **18.5s of wall clock per
wreck** and a six-clip reel of **over two minutes** — which is most of why the
reel felt like it showed nothing. It was mostly a car driving normally, slowly.

Now `PRE` 1.0 / `POST` 0.9 / `POST_WRECK` 2.6, and the slow section is 0.38×
over a narrower window: **wreck 6.7s, normal 2.6s, a full six-clip reel 24.8s.**

## Gotcha worth keeping

**`STRIDE` is versioned into every saved memory.** A memory in localStorage
outlives the layout it was written with, so `playSaved` carries `mem.stride || 9`
onto the clip and playback uses *that*, not the constant. Without it every
memory saved before this round would have read the dangle field out of the next
car's position data.

`?dev=1` now exposes the whole highlights module as `window.__game.highlights`
(plus a `__ghosts()` accessor), because the reel is on screen for a few seconds
after a race and nothing else could see inside it.

---

# ROUND 5c — sparks, and debris that actually slows down

Owner: *"should be lots of sparks but I haven't noticed any… loose panels appear
to flap for a bit then vanish? They are going the same speed as the car — they
will slow from wind resistance, but you should see them do so over a second or
3, not just vanish."*

## Almost nothing was allowed to spark

Three separate gates, and between them they silenced most of the carnage:

1. **A flapping panel could only spark from a `drag` corner touching the road.**
   It needed `f.drag` AND that corner within 6cm of the surface AND the car on
   the track. Only sills, arches, doors, bumpers and wheels even *have* a drag
   point — so a bonnet, roof, boot, spoiler or mirror hanging off the car threw
   **no sparks at all, ever**. Measured over a race: 38 of 206 dangler-seconds
   were on panels that could never spark under any circumstances.
2. **`grounded` excludes wreck mode**, so during the one moment the whole
   feature exists for — a car cartwheeling down the road shedding panels —
   nothing sparked.
3. **The field-wide budget was 170 bursts/sec.** One car on its floorpan wants
   ~45/s, so two or three cars grinding ate the entire allowance and every
   flapping panel in the race went dry.

Fixes: a new `hingeSparkRate` throws sparks off *any* loose panel the whole time
it is hanging (metal working at the hinge, whatever it is bolted to, wreck or
not); loose debris sparks while it skids (`debrisSparkRate`); and the ceiling
went 170 → **420**, moved out of `car.js` into `particles.js:SPARK_BUDGET` so
that `debris.js` can draw on the same bucket without importing `car.js` (which
would be a cycle — `car.js` imports `debris.js`).

**Measured**, same track, same 2-lap auto race, identical dangler counts on
field: live spark particles **median 124 → 276, p90 176 → 322**. Only 5% of
frames now have no sparks at all.

## Debris had no air drag, and frame-rate-dependent friction

`updateDebris` applied gravity and nothing else horizontally. A panel left the
car at the car's exact velocity and held it in a **dead straight line** until it
faded out. Then, the instant it touched down, `vel.x *= 0.9` **per frame** — at
60Hz that is a factor of 500 per second, so it stopped dead in about a fifth of
a second (and behaved differently on a 30fps phone).

So the life of a panel was: keeps pace with the car → nailed to the road →
fades. Which is exactly "goes the same speed as the car, then vanishes".

Now: exponential air drag divided by mass (`debrisDrag`, so a mirror washes off
almost at once and a roof carries), spin settles as it slows
(`debrisSpinDrag`), and ground friction is dt-based (`debrisSlide`).

**Measured**, speed of a loose panel after it leaves the car:

| | 0.2s | 1s | 2s | 3s |
|---|---|---|---|---|
| before | 38–52 m/s | 28–35 m/s | 0 | 0 |
| after | 7–29 m/s | 2–15 m/s | 0–12 | ~0 |

## The reel was silent too

Replay ghosts flap but the live spark calls are not recorded, so the one place
you watch a crash in slow motion with nothing else to look at had no sparks in
it. `poseGhost` now throws them per hanging panel at `REPLAY_SPARK_RATE` (14/s,
deliberately generous — a shower that reads at 1× disappears at 0.38×).

---

# ROUND 5d — surviving a trip to the home screen

Owner: *"I minimised screen on my phone, came back to an in-progress background
and most of screen black."*

**There was no WebGL context-loss handling anywhere in the game.** No
`webglcontextlost`, no `webglcontextrestored`, no `visibilitychange`.

A phone browser drops the GL context whenever it feels like it, and
backgrounding the tab is the usual trigger — a game holding a shadow map, a sky
shader and eight cars of geometry is exactly what it drops first. The important
part is that **the default behaviour of the lost event is that the context is
never restorable**; you have to call `preventDefault()` to opt into a restore.
Nobody had. So minimising and coming back left three.js issuing GL calls at a
dead context forever: the HUD is DOM so it kept drawing, and everything behind
it was black. That is precisely the reported picture.

Now:

- `render.js:watchContext` preventDefaults the loss, flags it, and on restore
  re-runs `onResize` and forces a shadow-map redraw. Both fire `render:*` events
  on the bus in case anything else ever needs to know.
- `render()` and the frame loop both **bail while the context is down**, rather
  than spending a frame issuing GL at a dead context.
- `refreshAfterResume()` re-measures the canvas, because a phone hands it back
  at a different size once the address bar has been in and out — on its own that
  leaves a black band down the side of an otherwise live picture.
- A race no longer runs while you are not looking. `flow.js:pauseForBlur` puts
  the ordinary PAUSE screen up, so you come back to a paused race and choose
  when to go again instead of being dropped into a corner at 250km/h.

## What could and could not be tested

**Verified headlessly:** both handlers fire with no errors and the scene renders
perfectly after a full `WEBGL_lose_context` lose→restore cycle; the frame loop
survives; `visibilitychange` pauses the race and puts PAUSE up; it stays paused
on return; the canvas matches the window after resume; auto races still run to
results on hometown and circus.

**NOT reproducible headlessly, be honest about it:** the actual phone failure.
`WEBGL_lose_context.restoreContext()` is a *forced* restore that bypasses the
`preventDefault` requirement, so the OLD build also recovers in that test. The
thing `preventDefault` buys is the browser's own *automatic* restore after a
real backgrounding, and there is no way to trigger that from CDP. The fix is
spec-correct and the handlers demonstrably run — but **only a real phone can
confirm the original symptom is gone.**

## Gotchas

- **Do not listen on window `blur`.** It fires for devtools, for another window
  taking focus, and in a headless run that never had focus at all — which would
  silently pause every soak test. `visibilitychange` + `pagehide` are the
  reliable mobile signals; `pauseForBlur` also no-ops under `?auto=1`/`?shot=1`.
- **A WebGL canvas cannot be sampled with `drawImage` into a 2D canvas** to
  check whether anything is being drawn — `preserveDrawingBuffer` is false, so
  it comes back blank even when the scene is fine. Use a CDP screenshot.

---

# ROUND 6 — the car is now the size it looks (2026-08-02)

Four reports: cars still ending up underground after an off-track crash; rivals
passing straight through you on track; a very damaged car should catch fire and
smoke; and losing wheels should be a ladder that ends with a car you cannot
drive. Then a fifth, on the UI: the results buttons are below the fold.

## 1. Underground, again — and this time it was the car, not the ground

Round 5 fixed the ground probe and the numbers said the wrecks were clearing the
surface. They were: the probe reports where the surface is and the ORIGIN was
above it. The origin is not the bottom of the car, though — it is on the floor
of the car, between the wheels, and a wreck tumbles about it. Roll the body
ninety degrees and half its width is now below that point; roll it onto its roof
and the whole height is. Holding the origin a flat `WRECK_REST = 0.45` above the
ground therefore buried anything not sitting flat.

Measured over a race, **every wreck frame had the shell under the tarmac — 111
of 153 frames deeper than 15cm, worst 1.97m.** A whole car swallowed at the
exact moment the replay camera cuts to it.

`Car.wreckRest()` now asks the box: world-up expressed in car space, dotted
against the body half-extents, gives the lowest corner at the current attitude.
Upright it returns ~0, on its side half the width, on its roof the full height.

Second, smaller cause, on the ground side: the probe handed the floor over to
the terrain heightfield at 24m beyond the road edge and took `min(apron, terra)`
while doing it — but **the verge MESH runs out to 46m**. So across twenty-two
metres of drawn green the floor was being pulled down to the terrain plane,
which on a raised section is several metres lower. Hand-over now happens at the
verge's own outer edge, blended over the last few metres, and takes the terrain
straight rather than the min, so a hill you slide up stops you.

## 2. "They pass right through you" — the collision box was never the car

`CRASH.carLen/carWide` was one pair of numbers, 4.3 x 2.05, for all five body
styles — and it was the *style table's nominal size*, not what the factory
builds. Measured off the meshes:

| style | nominal | built |
|---|---|---|
| muscle | 4.5 x 2.00 | 5.16 x 2.55 |
| wedge | 4.4 x 2.05 | 5.06 x 2.60 |
| stock | 4.3 x 1.95 | 4.96 x 2.50 |
| van | 4.7 x 2.15 | 5.07 x 2.70 |
| buggy | 4.0 x 2.10 | 4.37 x 2.65 |

Every car in the game is about a quarter wider than the box the solver used and
up to 0.86m longer. A rival could put a wheel inside your door or a bumper
through your boot with **no push, no damage, no sparks** — there was no contact
to resolve. `carfactory:measureHull` now measures the built mesh once and every
collision reads it: car-to-car, the barrier clamp, impact scuffs, debris strikes.

`CRASH.separate` (0.55 → 0.72) went with it, because two cars leaning on each
other at 55% of overlap per step stay visibly inside one another for as long as
the lean lasts.

## 3. Fire and soot

`updateBurn` reads `hp` and nothing else: past `CRASH.smokeAt` (50% gone) black
smoke off the tail, past `fireAt` (78%) a fire in the engine bay. Both carry
through the wreck. **Cosmetic on purpose** — a fire that ate hp would kill cars
for reasons the player never saw coming. `particles.js:engineFire/sootPlume`.

## 4. Wheels are a ladder now

`CRASH.wheelSpeed` indexed by wheels lost: `[1, 0.9, 0.74, 0.5, 0]`. The fourth
is zero, and zero means it: no throttle, no steering authority, `beachedDrag`
scrubbing speed off the floorpan, and once it is under `beachedStop` a *gentle*
wreck (`wreck(reason, null, {gentle: true})` — no fireball, no launch) hands it
to the truck.

`wheelResist` and `wheelPickBias` make each successive wheel harder in both the
roll that picks a panel and the damage that panel then soaks. **Every route to
losing a wheel has to respect the ladder or the ladder does nothing** — the one
that nearly defeated the whole change was `stripDown()`, which picked uniformly
at random from the living parts, so roughly one strip in six took a wheel and a
stripped car strips constantly. It rolls through `pickPanel` now.

Share of sampled car-frames by wheels missing, hometown, 3 laps, 8 cars:

| | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| flat 5%/wheel (before) | 29% | 39% | 28% | 3.6% | 0.9%¹ |
| after | 34-58% | 31-46% | 11-18% | 0-1.2% | 0-1.9% |

¹ and in an earlier sample **85% of frames** had somebody in the field on zero
wheels, because the old model let them keep racing at 85% pace indefinitely.

## 5. The results screen buttons were below the fold

Measured on a real race at a 412x740 viewport: **all three buttons offscreen,
153px of scroll to reach them**, every single race. They sat under the finishing
position, the objective, the prize list, seven money rows, two stat cards and an
eight-row classification table.

They are in `opts.head` now — pinned, with the position, the event and the net
alongside them. The stats are all still there, they are just the thing you
scroll to rather than the thing between you and the next race.

`paint()` also grew `opts.foot`, the mirror of `opts.head`: a band pinned to the
bottom of the shell for the one button a screen exists to get you to. The world
ladder and the title bracket use it — a bracket tree is taller than a phone, so
the button that plays the next round cannot live underneath it.

**Title tiles are bigger on a phone.** Every clamp on them sits on its LOWER
bound at phone width (`1.8vmin` of a 412px viewport is 7px), so the floors are
what render and the floors are what changed. Desktop is untouched. 157x57 →
177x89 at 412px wide, name 11px → 15px, icon 15px → 20px.

## Verified

| | before | after |
|---|---|---|
| wreck frames with the shell under the ground | 111/153, 128/178 | 0/148, 1/118, 1/166 (all at t=0) |
| worst depth, wrecks during a race | 1.97m | 0.18m |
| worst depth, wrecks forced 8-70m off the road (skyline) | 0.64-2.07m at **every** distance | **0.00m** at every distance, 280 frames |
| car-pair frames overlapping by >12cm | 138, 556 | 0-4 |
| frames with any hull overlap at all | 160, 578 | 3-30 |
| contact events per race | 30, 34 | 29-44 |
| engine fires per race | 0 | 2-11 |
| results buttons offscreen (412x740, real race) | 3 of 3 | 0 of 3 |

## Gotchas

- **Disable the CDP cache when testing, or you test the old build.** ES modules
  and the stylesheet are cached per URL and `Page.navigate` will happily reuse
  them. A whole round of measurements said the new collision hull had done
  nothing, because the page was still running the previous `carfactory.js`.
  `Network.enable` + `Network.setCacheDisabled` before navigating.
- **One CDP port drives ONE tab.** Two probe processes against the same port
  fight over the same page — the second one's `Page.navigate` yanks the first
  out from under itself. Run a second Chrome on another port instead.
- **`Box3.setFromObject` on a live car includes its dangling panels**, which
  swing below the body, so it is useless for asking "is the car underground".
  Measure `mesh.userData.chassis`.
- **Measuring a hull off a car that is in the scene inflates it.** Taking a
  geometry AABB to world space and back expands it on each trip — that is where
  a 2.7m-wide van came back as 5.0m. Measure a freshly built car whose only
  transforms are local ones, which is what `measureHull` does at build time.

---

# ROUND 7 — a wreck is an obstacle, not a hole in the world (2026-08-02)

The brief: a wrecked car should still be hittable; it should say the frame is
repairing itself rather than reading as game over; you should be driving again
sooner, with each further hit costing you a little more; **leaving the circuit
should be the only thing that genuinely costs you**, and cars should limp home
rather than be removed. Plus: three full laps as standard, a LAST LAP that stays
up, and the position called at the flag with a few seconds of driving after it.

## A wreck was intangible

`resolveContacts` skips anything in wreck mode on both sides, so a two-tonne car
lying across the racing line was something the whole field drove straight
through. It is skipped there for a real reason — **a wreck is simulated in world
space and everything else lives in track space**, so there is no shared frame to
resolve in.

`race.js:resolveWreckHits` builds one per hit: the test is a world-space circle,
and the separation normal is then decomposed onto the RUNNING car's own track
frame — its `right` gives the sideways shove and its `tan` the fore/aft one — so
the racer is pushed in the coordinates it drives in while the wreck takes a
plain world-space punt.

**Clamp the closing speed before it touches the physics.** A wreck lying still
and a boosting car arriving at 345 km/h close at over 90 m/s, and unclamped that
punted the wreck **nine metres into the air** and took a quarter of the runner's
chassis in one touch. `CRASH.wreckHitMax` caps what the physics sees; the spark
count still scales with the real number, because the spectacle is allowed to be
as big as the hit was and the physics is not.

| forced hits, before/after the clamp | before | after |
|---|---|---|
| wreck flung upward | 8.4-9.1m | 1.0-1.6m |
| runner's chassis lost in one hit | 78.8 of 320 | 20.1 of 320 |
| wreck shoved along | 7.3-24.9m | 3.5-6.3m |

5 of 5 forced trials connected, both before and after.

## Two recovery profiles, and only one of them hurts

`wreckOffTrack()` is now a list of what stayed ON the tarmac — written off, out
of wheels, landed sideways — rather than an exclusion, so the next reason
somebody adds has to declare which kind it is. (`landed sideways` moved: it
happens on the road and was being treated as though you had left the circuit,
which cost it 78-100% of the car.)

| | before | after |
|---|---|---|
| on-track wreck, down for | 3.55-6.35s | **1.8-3.6s** |
| off-track wreck, down for | 3.55-6.35s | 2.8-4.9s |
| HUD says | `WIPEOUT` | `FRAME AUTO-REPAIR` on track, `WIPEOUT` only off it |

Each further hit while you are down adds `wreckHitDelay` (0.28s), capped at
`wreckHitDelayMax` (1.3s) — being repeatedly punted down the road is meant to be
the funniest thing on the circuit, not a way to be removed from the race.
**Nobody was retired in any of the measured races**; the only elimination in the
game remains the knockout event type.

## Laps and the flag

`speedbowl` (4) and `saltflats` (2) were the only circuits not running the
standard three; both are 3 now, which puts saltflats at ~105s, in line with
skyline. The `saltflats ? 2` special case came out of `story.js` too.

- **LAST LAP** gets its own banner at 3.4s instead of a 1.7s `LAP 3`.
- The lap banner is suppressed on the crossing that finishes the race — two
  banners fighting over the same instant is how you read neither.
- `race:playerFinish` now says `FINISHED 3RD` at the moment you cross.
- `RACE.finishHold` 2.4 → **5s** of continued driving while the rest come in.
  Measured: 4.95-5.0s on every circuit.

## Verified

Full auto races on circus, skyline, saltflats, hometown and grinder: 3 laps
each, ~5s of driving after the flag, **zero cars retired, zero errors, zero
warnings**. On-track recoveries 1.8-3.6s, off-track 2.8-4.9s.

## Gotcha

- **A probe that reads `car.wreckDelay` on `car:rejoin` always reads zero**,
  because `rejoin()` clears it before it emits. Sample it during the wreck.

## Still open (unchanged from round 4)

- Shadow map offset from its caster, applied to one vehicle only.
- **HUD/UI pass still never done** — and it is now the most visible problem
  left: in the wreck captures the speech bubble, the WIPEOUT banner and the
  attack-status pill all stack directly over the crashing car, which is exactly
  the moment you want to see it.
- Boost pad reads as a sprite on the road rather than in it.
- **Replay ghosts do not show impact scuffs.** The scuff parts are created at
  runtime and are not in `PART_IDS`, so the mask cannot address them. Would need
  a couple of reserved slots in the part table.
