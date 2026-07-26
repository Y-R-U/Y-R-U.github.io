# FOUL PLAY — handoff / next session

**Status: v1 is built, tested, committed and pushed to `main` (commit `3fa8290`).**
It is registered in `/projects.js` with a screenshot at
`/assets/screenshots/foulplay.jpg`, so it is live on Pages.

Read `CLAUDE.md` in this folder first — it explains the architecture and the
gotchas. This file is only "what to do next".

---

## Play it

- Live: https://y-r-u.github.io/gms/3d/foulplay/
- Local: `python3 -m http.server 8977` from `~/cc/yru/site`, then
  http://127.0.0.1:8977/gms/3d/foulplay/

---

## Fixed on Aaron's first mobile report

**The chase camera was inverted** — it sat *ahead* of the car looking back down
the road you had already driven. Fixed in `camera.js:frameChase` (`dir` was the
wrong sign) and verified programmatically: the car now sits 17m ahead of the
camera with the camera facing track-forward. Also made hold-buttons release on a
global `pointerup` so the look-back button cannot stick.

---

## Second feedback round: "too easy to fly off track" (done, needs a play check)

Aaron: *"if I slam into the side via fast driving it should bump me back into
play with very little damage. Most damage should only come from attacks or
slamming into other cars — driving should be the easy/fun part that allows you
to concentrate on attacking."*

Rebalanced around one rule: **you only leave the circuit if somebody put you
there.** A barrier hit now bounces you back in whatever your speed or angle;
going *through* one is gated on `car.slammed`, a 0.9s window set only by an
attack impulse or a car-to-car closing speed over `CRASH.slamSpeed` (12 m/s).
Also: rail damage only starts above a `railScuff` of 9 m/s and is ~4× lighter,
rail spin and speed-scrub roughly halved, post-hit straightening assist stronger,
car-to-car damage raised (1.9 → 2.5), and airborne cars get 9m of latitude past
the rail line so a jump lands them back on the road instead of deleting them.

Measured on 2-lap auto races, field wrecks per race:

| | before | after |
|---|---|---|
| circus | 18 (all "through the barrier") | **0** |
| skyline | 3–9 | **1** |
| grinder | — | 0 |

**Open question for the play check:** with driving made safe, wrecks now depend
entirely on attacks and deliberate slams, and the auto-race harness does not
attack hard enough to prove they still land. `CRASH.railVault` is 34 m/s once
shunted — if a well-aimed SIDE SLAM beside a barrier does *not* put rivals out,
lower it; if it feels twitchy, raise it. This is the one number most likely to
need your thumb rather than my telemetry.

Rivals already escalate to real tricks late in the season (`story.js:rivalSkillSet`
gives chapters 8–10 the EMP / shockwave / ramjet / scattergun pool, and bosses
get the wrecking ball from chapter 9). That now announces itself with a toast as
well as a feed line, so it reads as "they cheated at me" rather than as an
unexplained loss of control.

---

## TODO — next session, in priority order

### 1. Playtest on a real phone (highest value, needs Aaron)
Everything below was verified in headless Chrome. These need a human thumb:
- **Steering feel.** Drag-to-steer sensitivity is `DRAG_FULL = 78` px in
  `input.js`. If it feels twitchy, raise it; if unresponsive, lower it.
- **Brake-by-dragging-down.** `DRAG_BRAKE` 34px deadzone → full at 120px. This
  is the least-proven control; it may want to be a separate button.
- **Tilt steering** (Settings → TILT). The iOS permission prompt path
  (`input.js:enableTilt`) has never run on a real device.
- **Audio on iOS.** It arms on first touch; unverified on hardware.
- **Whether the LOOK (👁) button earns its place.** It sits at the top of the
  right-hand cluster in portrait. If it keeps getting mis-tapped, delete it from
  `index.html` — the brief only ever asked for two buttons.

### 2. Balance passes (use the telemetry, do not guess)
`?dev=1` exposes `window.__game.tel` — speed samples, position, suspicion, hype,
and **wreck counts by cause**. Current readings on a 2-lap auto race:

| circuit | avg km/h | top | wrecks (field) | notes |
|---|---|---|---|---|
| hometown (grade 1) | 166 | 290 | 5 | good |
| twinrings (grade 5) | 177 | 395 | 9 | 6% of the race inverted |
| circus (grade 5) | 173 | 331 | 18 | **may be too much carnage** |
| skyline (grade 4) | 163 | 296 | 3 | 8% airborne, 21m peak air |

- Circus at 18 wrecks per 2 laps is the outlier. If it feels chaotic rather than
  dramatic, soften the corkscrew (`trackgen.js`, `corkscrew(90, 58)`) or raise
  `CRASH.railVault`.
- 21m of air on Skyline is enormous. Fun, but check it does not read as a bug.

### 3. Unverified by eye (works programmatically, never watched)
- **The highlights reel.** Confirmed to produce clips, rebuild ghost cars, apply
  recorded part-visibility and run the slow-motion beat. Never actually watched.
- **Special events and the daily** — smoke-tested only. Knockout was verified
  properly (5 eliminations, correct classification).
- **Chapter cutscenes 2–10.** The intro and the finale were both watched; the
  middle nine are the same code path with different data.

### 4. Ideas not yet built
- Rivals should *telegraph* an incoming attack (a HUD warning before the hit).
  There is already an `ai:attackedPlayer` event to hang it on.
- Panel dents are subtle — parts offset and rotate slightly as HP drops
  (`car.js:dentPart`). Could scorch or crumple more visibly.
- No pit stop / repair mechanic. Damage carries only within a race.

---

## Testing recipe (works, no installs)

```bash
SCRATCH=<scratchpad>
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9333 --user-data-dir="$SCRATCH/chrome" about:blank &
node cdp.mjs "<url>" --wait="<expr>" --evalFile=script.js --shot=out.png
```

`cdp.mjs` lives in the session scratchpad; it is ~90 lines of raw CDP over the
built-in `WebSocket`. **Three hard-won rules:**

1. **Always `--evalFile`, never inline `--eval`** for anything with backticks or
   `${}` — bash expands them before node sees them and you get silent nonsense.
2. **Restart Chrome between debugging runs.** A frozen page blocks
   `Page.navigate`, so one hang poisons every later test on that tab.
3. **`--wait` on a real condition**, e.g.
   `window.__game && window.__game.state.screen==='results'`. Chrome's
   `--virtual-time-budget` does not advance a WebGL sim.

Useful URLs:
- `?dev=1&auto=1&start=race&track=circus&speed=3` — soak a race at 3× speed
- `?dev=1&wipe=1&level=1` — story from scratch, intro cutscene first
- `?shot=1&track=circus&at=13` — clean frame for a thumbnail
- `dev.html` — builds all 15 circuits and reports geometry. **Every circuit must
  report `gap 0`** after any `trackgen.js` change.

---

## Task state

Everything in the original brief is built:

- [x] Variety of tracks, some curved/banked, some with loops — 15 circuits
- [x] Very good AI competitors that also slam you off the road
- [x] Cheat-but-don't-get-caught: distance-scaled suspicion, sweeping cameras
- [x] Fines, and a crowd that talks the stewards out of them
- [x] Guardrail bounce-back + auto-steer recovery; fly off and you roll
- [x] Cars shed parts and keep driving; scared-face speech bubbles
- [x] Boost pads on track + collectible boosts on a button
- [x] Two buttons only (boost, attack); attack fires a random equipped trick
- [x] Chests upgrading the car (6 slots, 36 parts, 15 tricks, 4 crate tiers)
- [x] End-of-race highlights reel of the best wrecks and flips
- [x] One-off ranked mode starting at #250,000
- [x] Special events + knockout events
- [x] 100-level story with cutscenes at the intro, every 10 levels, and the end
