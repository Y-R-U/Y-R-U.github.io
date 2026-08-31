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
- Enemy-on-enemy hits deal 25% damage. At full damage the enemies finish gauntlets for you.
- `?autoplay=1` is a real fight with an AI player; `demo` is the menu background match. They
  are different flags.

## Music

Seven Suno v5.5 instrumental tracks in `assets/audio/`, wired through `js/music.js`.
See `docs/MUSIC.md` for the prompts and the regeneration recipe. Missing files are tolerated —
`audio.js` stays silent for any id whose mp3 is absent, so the game runs fine without them.
