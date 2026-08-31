# RAGDOJO

Mobile-first stick-fighting game on a sheet of notebook paper. 45 fights across 9 bandana
ranks, gesture-driven special moves, and a verlet ragdoll that does all the animation.

Live: `/gms/2d/ragdojo/` · vanilla ES modules, Canvas 2D, no build step.

## Run it

Open `index.html` from any static server. Useful URL params:

| param | what |
|---|---|
| `?level=N` | jump straight into fight N (0–44) |
| `?autoplay=1` | the player is AI-driven — the soak/balance mode |
| `?unlock=1` | grant every special move (dev only) |
| `?dpr=1` | force devicePixelRatio 1 (headless capture) |
| `?auto=1` | click START automatically |

## Architecture

The one idea worth knowing: **a fighter is a platformer body that drives a ragdoll through
pose muscles.** `poses.js` computes target point positions by forward kinematics from joint
angles; `ragdoll.js` pulls the verlet points toward those targets with a `gain`. Gain 1 is a
crisp animated fighter, gain 0 is a limp body, and everything in between is a stagger. There
is no separate "ragdoll mode" in the solver — the same 11 points and constraints run always.

```
config.js     ranks, the 45-level campaign table, move + perk definitions, derive()
ink.js        wobbly multi-pass pencil strokes — everything visible goes through here
paper.js      bakes the sheet: fibre noise, ruled lines, red margin, punch holes
arena.js      per-level sheet: paper + hand-written heading + spectator doodles
ragdoll.js    verlet points, bone links, JOINT RANGES, ground collision
poses.js      joint-angle poses + FK + the animation table
draw.js       draws a fighter from live ragdoll points (bandana, face, damage scribbles)
fighter.js    movement, attack timeline, damage, the down/getup handoff
ai.js         Brain — enemies, menu demo fighters, and the autoplay soak player
match.js      one fight: hit resolution, projectiles, hazards, camera, score
hazards.js    the seven page events (pencil, eraser, coffee, wind, tear, rain, scribble)
fx.js         particles, shake, hitstop, floating text, and the ink baked onto the page
gestures.js   stroke -> gesture classifier + the glyph paths the shop animates
input.js      static 4-way stick + tap/draw on the other half
ui.js         HUD: health bars, move strip, stick, finger trail
shop.js       upgrades, with each special's gesture animated as you look at it
main.js       boot, loop, screens, progression
```

## Testing

Everything here is a real gate — each one has been watched go red.

```
node tools/gesturetest.mjs    # 10 synthetic gestures through the classifier, with jitter
node tools/nangate.mjs        # no hazard level may produce a non-finite fighter position
node tools/crossgate.mjs      # solid bodies: walk = blocked, jump = crosses, floored = step over
node tools/uigate.mjs         # first-run coaching, the duck crouch, shop tab highlight
node tools/musicrota.mjs      # the roster must not repeat, within a run or across refreshes
node tools/portraitgate.mjs   # portrait renders sideways and touch still maps correctly
node tools/sim.mjs            # whole campaign in node, with its economy. Balance lives here.
node tools/sim.mjs --bully    # maxed player vs white belts
node tools/touch.mjs          # REAL touch events -> every gesture, tap, and stick direction
node tools/flow.mjs           # hub -> shop -> fight -> results -> victory
node tools/shot.mjs           # dev/gfx.html art scenes
node tools/projshot.mjs 18    # thumbnail candidates
```

`tools/sim.mjs` is the important one. The engine is pure JS apart from FX's offscreen canvas,
so the sim stubs `document` and runs fights with no renderer and no clock — a 45-level
campaign with its full economy takes seconds. Every balance number in `config.js` was set
from its output, not by feel.

## Gotchas

- **Joint ranges are what make the ragdoll read as a body.** Without `RANGES` in `ragdoll.js`
  a limp fighter flattens into a straight line on the floor: elbows and knees hyperextend and
  every limb ends up colinear with the ground. Do not remove them to "simplify" the solver.
- **The sim's AI player must use the real save.** `Brain` takes an optional `save`; when set it
  calls `moveStats(save, id)` so purchased upgrades actually apply. Without it the harness
  tests a player whose power never grows and every balance number it produces is a lie.
- **Guard break is load-bearing.** A high-skill AI blocks constantly, and blocked damage is
  22%, so before guard break the final boss simply stalemated past the time limit. Heavy and
  special hits (`stagger >= 0.8`) break a guard.
- **Capture must not round-trip a big PNG through CDP.** `Runtime.evaluate` wedges silently on
  a ~5 MB data URL. `tools/shot.mjs` has the page POST the blob to its own server instead.
  `cdp.shot()` (Page.captureScreenshot) is fine here and is the only way to capture DOM menus,
  which canvas-only capture misses entirely.
- **A non-finite position is the worst failure mode this engine has.** It throws nothing and
  crashes nothing: the fighter simply drops out of every hit test and the fight can never end,
  which reads as "this level times out". It shipped once — `Brain`'s hazard dodge steered by
  `h.x`, and `ScribbleStorm` has no `x`, so levels 36, 42 and 44 quietly broke. Hazards now
  answer `threatX(x)` and `Fighter.move` refuses a non-finite `dir`. `tools/nangate.mjs` covers
  every hazard type. It also poisoned a whole A/B run before it was found — see below.
- **Bodies are solid on the ground; jumping is the only way to cross sides** (`Match.separate`).
  `BODY_R` is capped by attack reach, not by how the figures look: a jab puts the hand ~61u in
  front of the pelvis and separation is `BODY_R * (scaleA + scaleB)`, so at 26 the 1.3x-scale
  final boss sat 60u away and the player's basic attack could not reach him at all.
- **Do not A/B a gameplay change against a noisy sim.** The solid-body rule looked like it cost
  the final boss two thirds of its win rate. It cost nothing — the levels it "broke" were the
  scribble levels, and the real culprit was the NaN above. Small-sample sim runs and a swing
  counter that double-counted `multi` attacks both pointed the wrong way. Isolate the variable,
  check the instrument, then tune.
- **The player always spawns on the left, under the YOU panel** (world x 560; enemies at
  1680-560). That was already true when it was first reported as a bug — the real problem was
  that you cannot tell which identical white stick figure is yours once you cross over. Hence
  the blue triangle over the player's head, the matching triangle on the YOU panel, the
  fight-start name tags (`match.introT`), and enemies being drawn in lighter ink. If that
  association ever needs revisiting, fix identification; do not move the spawn.
- **A crouch must not move the collision floor.** `duckDrop` is a pose offset applied to the
  ragdoll target origin only. Folding it into `standY` made `onGround` false, which cleared
  `blocking`, which cancelled the crouch — a deadlock that left the fighter hovering.
- **The fight-music roster unlocks** (`js/music.js`): 4 tracks, then +2 at levels 10, 20 and 30.
  **Track choice must never be a pure function of the level.** Any index-based rotation makes
  level 1 always play roster slot 0, so replaying or refreshing an early level gives the same
  song forever and the rest of the roster is unreachable from a fresh save — measured at 60/60
  identical starts. `pickFightTrack` avoids the recent history instead, persisted in
  `save.musicRecent`. Rotating by the ordinal of roster-using fights (the version before that)
  had its own bug: champions ate slots and the last-unlocked track never played at all. Selecting on tier alone (the version before this)
  put `fight1` on 12 of the first 15 fights and never reached `fight2` before level 15, which
  reads as "there is only one song" no matter how many files ship.
- **Facing is owned by `Match.faceOpponents()`, not by the movement stick.** Fighters always
  turn to the nearest opponent; following the stick left you swinging at empty page after a
  crossover. Attacks also root you (`spd * 0` while attacking) — creeping forward mid-power-hit
  walked you over the body you had just floored, which is how a power hit put you on the wrong
  side even with solid bodies.
- **Portrait rotates the app; it does not block.** A "turn your device" wall hides the very
  thing that tells you to turn it, so `#app` gets `translateX(100vw) rotate(90deg)` in portrait
  and the game plays sideways. `Input.localPoint` inverts that exact transform —
  `getBoundingClientRect()` is useless on a rotated element (it returns the axis-aligned box)
  and every touch lands somewhere else. The CSS rule and `PORTRAIT_Q` in input.js must stay in
  step; `tools/portraitgate.mjs` fails if they drift.
- **Panels scroll internally, not as a whole** (`.sheet` is a flex column; only `.rows`/`.list`
  scroll). Scrolling the whole panel pushed the CONTINUE button off the bottom of a landscape
  phone. There is a `max-height: 470px` media query for the same reason.
- Enemy-on-enemy hits deal 25% damage. At full damage the enemies finish gauntlets for you.
- `?autoplay=1` is a real fight with an AI player; `demo` is the menu background match. They
  are different flags.

## Music

Seven Suno v5.5 instrumental tracks in `assets/audio/`, wired through `js/music.js`.
See `docs/MUSIC.md` for the prompts and the regeneration recipe. Missing files are tolerated —
`audio.js` stays silent for any id whose mp3 is absent, so the game runs fine without them.
