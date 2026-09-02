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
haptic.js     vibration feedback — a no-op on desktop and iOS Safari
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
node tools/bootgate.mjs       # a stale/broken module set must report itself, not hang
node tools/soundtrackgate.mjs # now-playing, auditioning a track, muting one, haptics fire
node tools/hitgate.mjs        # hit windows: range, and one move hitting a line of three
node tools/crosslog.mjs       # diagnostic, not a gate — what actually causes side swaps
node tools/stuckgate.mjs      # no save state may dead-end the game
node tools/progressgate.mjs   # what a new game keeps, and what it makes you earn again
node tools/keygate.mjs        # desktop keys: punch, 1-8 specials, both movement layouts
node tools/panelgate.mjs      # every panel's X is in the corner, and taps outside dismiss
node tools/darkgate.mjs       # the DARK campaign and its whole unlock chain
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

## Two campaigns

The same 45-level frame, played twice. **LIGHT** is the dojo — bandanas, a scrap yard, a
pencil case. **DARK** is the same sheet after hours: the page inverts, ranks become gang
colours, and the specials are what people carry on those streets.

```
win the dojo            -> DARK appears on the hub, locked
win a BULLY run         -> save.darkUnlocked, DARK opens
DARK                    -> a separate run, separate records, dark moves, +5 skill levels
win the dark campaign   -> the record book offers THUG instead of BULLY
win the THUG run        -> save.thugWon; "stay a THUG?" can now be answered YES
YES                     -> the dojo, in daylight, still carrying the knife (save.carryDark)
```

The ACTIVE run lives at the top level of the save so every consumer reads `save.level` and
`save.bully` unchanged; the other theme's copy waits in `save.stash` and `setTheme` swaps
them (`RUN_KEYS` in save.js). Ink, skills and settings are deliberately NOT swapped — you
take your money and your training into the dark. Moves separate themselves for free, because
the two sets use different ids (`power` vs `d_shank`) in the same `save.moves`.

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
  This took four passes, and only the last one was measured rather than guessed:
  1. `separate()` exempted `lockMove` attacks, so PENCIL DASH streaked through a standing body.
  2. With that gone, the dash's own momentum still ploughed through the body it had just
     floored — a limp fighter is not solid. `Match.land()` brakes a charge (`def.dashV > 0`).
  3. `tools/crosslog.mjs` then showed the real bulk of it: **a knocked-down body stopped
     being solid**, so your own follow-through walked you over whoever you had just hit.
     Floored (not dead) fighters are now solid at `bodyX()` — the ragdoll's live centre,
     because `f.x` is frozen where they fell — and only the fighter on its feet is pushed.
     A CORPSE stays walk-through: it lies there for the rest of the fight and would wall you
     off from the other half of a gauntlet.
  4. A grounded strike now plants your feet (`beginAttack` damps `vx`). Movement input was
     already ignored during an attack, but the velocity you arrived with decayed slowly
     enough to carry you ~50u — out the far side of someone your own hit had launched.

  That took side swaps from 1.9 to 1.1 per fight, and what is left is ragdoll flight: bodies
  physically sliding past each other, which is the game rather than a bug. Note the caveat in
  crosslog's header — a floored fighter's `vx` is stale, so it credits a tumble to whoever is
  still standing.
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
- **A boot failure must never be silent.** ES modules load individually, so a deploy can leave
  a browser with a new `main.js` and a cached older `music.js`; the import then throws, nothing
  in main.js runs, and the boot screen sits on "sharpening pencils…" with no START button —
  indistinguishable from a hang, and reported as "broken on refresh". index.html carries an
  **inline** error handler (it has to be inline: a module that fails to parse cannot report
  itself) that shows the message and a RELOAD which busts the cache with `?v=<now>`.
- **Portrait rotates the app; it does not block.** A "turn your device" wall hides the very
  thing that tells you to turn it, so `#app` gets `translateX(100vw) rotate(90deg)` in portrait
  and the game plays sideways. `Input.localPoint` inverts that exact transform —
  `getBoundingClientRect()` is useless on a rotated element (it returns the axis-aligned box)
  and every touch lands somewhere else. The CSS rule and `PORTRAIT_Q` in input.js must stay in
  step; `tools/portraitgate.mjs` fails if they drift.
- **Every panel closes the same way.** The X is absolutely positioned in the sheet's
  top-right corner, not a flex child of the header — as a header child it landed just after
  a centred title on the narrow panels, and results and victory had none at all. Titles
  carry `padding-right` (both sides when centred) so nothing runs underneath it.
- **A backdrop tap dismisses a panel, but only if the press AND the release land on it.**
  Otherwise dragging a list and letting go past the edge of the sheet closes the panel you
  were reading, because `click` fires on the common ancestor. The results card is
  deliberately excluded: after a fight your thumb is already moving and a stray tap should
  not skip the report.
- **Panels scroll internally, not as a whole** (`.sheet` is a flex column; only `.rows`/`.list`
  scroll). Scrolling the whole panel pushed the CONTINUE button off the bottom of a landscape
  phone. There is a `max-height: 470px` media query for the same reason.
- **Pause is the only way out of a fight, so the way out lives in the settings panel**
  (`#btnQuit`, shown only when `mode === 'fight'`), and a loss gets its own `MENU` button
  beside TRY AGAIN. Without them a fight you could not win was a dead end.
- **The soundtrack list is interactive**: it names what is playing, a row auditions that
  track, and the ON/OFF beside it drops the track from the fight rotation (`save.musicOff`).
  `fightPool()` falls back to the full unlocked list if every track is switched off, and the
  last track still standing has its toggle disabled — silence is not a preference.
- **Haptics are hooked where the player is involved, not on every hit.** `Match.land()` buzzes
  only when the player is the attacker or the target; a gauntlet's enemies clobbering each
  other would otherwise rattle the phone continuously. The Vibration toggle is hidden
  entirely when `navigator.vibrate` is absent rather than shown as a dead switch.
- **A hitbox is live for its whole frame, not for the instant the frame starts**
  (`Fighter.update`). A one-tick hitbox reads as "it went straight through them" — the flip
  kick only connected point-blank. `multi` moves (dash, both flips, the slam shockwave) stay
  live to the end of the animation, so a somersault threatens everyone it travels over;
  `A.hitSet` caps each target at one hit, so a longer window never means a bigger hit.
  `resolveHit` is therefore called every live frame and guards its one-shot parts with
  `first`. The dash also carries a `sweep`, because a charge that stops at the first body
  would otherwise be single-target.
- **Retuning had to follow.** Reliable hitboxes are a bigger buff to whoever throws more
  specials, and that is the enemy: level 44 fell from 20% to 2% in `tools/sim.mjs`. Cutting
  enemy special DAMAGE barely moved it (halving it bought 3 points) — the damage was being
  done by the FREQUENCY of being floored, so the correction is in `Brain.trySpecial`'s
  cooldown (`max(2.5, cd * (2.8 - skill * 0.5))`), not the damage. Bisect before tuning:
  five changes shipped together here and only two of them mattered.
- **The last two levels of every track are the long haul** (`DEEP_LEVELS` in config.js): they
  cost 4x and 8x the old top price, so `MOVE_MAX_LV` is 7 and every perk `max` grew by 2
  without the early curve changing at all. `derive()` floors `dr`, `kbResist` and `getUp` so
  a fully maxed player is tough rather than invulnerable.
- **A level index must be clamped everywhere it is used, not just where it is displayed.**
  Finishing a bully run stored `bullyLevel = 45` of 45. `refreshHub` clamped that for the
  label, but FIGHT passed the raw value, `LEVELS[45]` was undefined, and the click handler
  threw inside `ensureSheet` — a button that silently did nothing, on every refresh, with no
  way out but wiping the save. `hubLevel()` is now the single source for both, `startFight`
  clamps defensively, and `save.load()` heals an already-broken save instead of demanding a
  reset. `tools/stuckgate.mjs` walks every save state that could park you out of range.
- **`completed` and `everWon` are different questions.** `completed` means THIS run is
  finished and resets with a new game; `everWon` never resets, and is what keeps the music
  roster and the record book. Conflating them let a fresh white belt open the trophy and
  press BULLY MODE — which sets `save.bully`, and the hub and shop both read that as black
  belt standing. Bullying is a reward for finishing the run you are on: `btnBully` is hidden
  unless `save.completed`.
- **The record book is the reason to start again.** `save.records` is all-time and survives
  a new game; everything else does not. The victory screen shows both sections so the
  difference is visible before you press NEW GAME, and NEW GAME is a two-step button rather
  than a modal (Aaron dislikes modals) — first press asks, second press wipes.
- **Anything only reachable by winning is unreachable once you have won.** The victory screen
  held BULLY MODE and NEW GAME, so a finished save that could not start a fight had no way
  to reach them. The hub carries a 🏆 button whenever `save.completed` is set.
- **Bully mode keeps your progress; it does not hand you a maxed save.** Maxing everything
  ended the game twice over — nothing left to buy, and no reason to earn ink. Finishing a
  bully run reaches the victory screen too (`won && wasFinal`, no bully check), or the hub
  hands you the same final fight for ever.
- **Desktop keys mirror the thumbs, in two layouts.** WASD or arrows to move; punch on
  space, J, R or 0; specials on 1-8 in MOVES order. R and 0 exist so the punch is under a
  finger whichever layout you pick — arrows plus the number row, or WASD plus the num pad.
  The move strip draws the key number on each circle when `hasKeyboard()` is true; it must
  stay off on a phone, where the badge would be a lie. `tools/keygate.mjs` checks both.
- **The dark theme is one CSS filter, not a second palette.** `#app.dark` gets
  `invert(1) hue-rotate(180deg)`: invert flips the luminance, hue-rotate puts the hues back,
  so ink-on-paper becomes chalk-on-slate while the blue marker stays blue and the health bar
  stays green. Measured at 16.68 ms/frame against 16.65 without it — free. A hand-maintained
  dark palette across ink.js, paper.js, arena.js, draw.js, fx.js, ui.js and hazards.js would
  have been ~80 literals to keep in step, and every `globalCompositeOperation = 'multiply'`
  would have had to become `screen`.
- **The word for a bully run follows the MOVES you are holding, not the page you are on.**
  `bullyWord()` says THUG whenever `theme === 'dark' || carryDark` — a THUG who walks back
  into the daylight is still a THUG, and the FIGHT button, the hub's mode line and the record
  book all have to agree with the trophy screen.
- **Everyone in the dark is carrying** (`Fighter.armed`, set in `Match.build`). You are armed
  in the dark or if you carried the knife back out (`carryDark`); the people opposite you only
  in the dark campaign — the dojo does not arm its students because you turned up with a blade.
  The blade points AWAY FROM THE BODY (two parts neck->hand to one part elbow->hand), not along
  the forearm: along the forearm is right for a thrust and wrong for a guard, where the arm
  folds back and the knife ends up buried in the fighter's own head.
- **The soundtrack panel has to list the set pieces too.** It listed the fight rotation only,
  so four of the fourteen tracks you actually hear — menu, champion, final, victory — had no
  name anywhere in the game, which reads as "there is more music here than the settings admit
  to". They are listed without an ON/OFF: they are not in the rotation, so there is nothing to
  drop them out of, and a fight has to sound like something.
- **Fading toward the ground is not symmetric.** A disabled control at 40% opacity still reads
  on cream paper and vanishes into an inverted one, so `#app.dark` gives everything disabled,
  locked, muted or unaffordable more of itself back (.72). The invert filter does not care
  which direction "faded" means.
- **Limb length and `RANGES` move together.** The joint limits in ragdoll.js sit a fraction
  under full extension; a limb that outgrows its range silently locks straight, and the crumple
  that makes a floored body read as a body goes with it.
- **A crouch pose and `duckDrop` have to agree.** The duck is a pose whose lowest foot sits
  ~21u above the standing pose's, and `duckDrop` drops the pelvis by exactly that, so the feet
  land on the ground they were already on. The old crouch put all the weight on one leg and
  stuck the other straight out — and with a 23u drop the solver spent every frame shoving the
  feet back out of the floor. Measure the pose (`fk` is pure and importable in node) rather
  than eyeballing the number.
- **Longer limbs are a balance change, and only for the big fighters.** Arms 51->57 and legs
  54->59 made every fighter a bigger target, but the final boss is scale 1.3, so it grew most:
  measured per level at n=1000, levels 4 through 39 did not move at all and level 44 went
  7% -> 18%. Corrected at the source (final `hp` 1.9 -> 2.3, `dmg` 1.4 -> 1.5) rather than by
  touching the AI, and re-measured back to 7%. Note the instrument: at n=60 the same sweep read
  11% / 6% / 0% across monotonically increasing boss HP — the harness's random shopping is the
  variance, so late-game win rates need n in the hundreds or the `dealt/s` / `taken/s` columns
  (`sim.mjs --level=N`), which have far less spread and say WHICH side a change helped.
- **A move's `kind` is the mechanic; its `id` is what the save records.** Both sets fill the
  same eight gesture slots at the same eight prices, so `fighter.js` switches on `kind` and
  the two sets are bought and upgraded entirely separately. Dark adds two kinds of its own:
  `knives` (a volley — two projectiles, fanned) and `gun` (flat, fast, the length of the page).
- Enemy-on-enemy hits deal 25% damage. At full damage the enemies finish gauntlets for you.
- `?autoplay=1` is a real fight with an AI player; `demo` is the menu background match. They
  are different flags.

## Music

Fourteen Suno v5.5 instrumental tracks in `assets/audio/`, wired through `js/music.js`.
See `docs/MUSIC.md` for the prompts and the regeneration recipe. Missing files are tolerated —
`audio.js` stays silent for any id whose mp3 is absent, so the game runs fine without them.
