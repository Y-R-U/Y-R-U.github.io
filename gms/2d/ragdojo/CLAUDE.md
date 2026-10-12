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
node tools/worldgate.mjs      # CYBORG/GOD, world-scaled skill caps, INK WELL, WHITE BELT restart
node tools/slamgate.mjs       # a slam cast in the air lands before its shockwave fires
node tools/flipknees.mjs --check  # no pose may bend a knee backwards
node tools/glyphgate.mjs      # the gesture hints, measured in PIXELS at the sizes drawn
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
win the THUG run        -> save.thugWon; "stay a THUG?" can now be answered YES; CYBORG opens
YES                     -> the dojo, in daylight, still carrying the knife (save.carryDark)
WHITE BELT (victory)    -> after any won replay run past LIGHT: the light run restarts at
                           fight 1, keeping perks, moves, ink and every open world
win a SIMULANT run      -> save.simulantWon (CYBORG's replay run); GOD opens
GOD's replay run        -> DEMON, and the page goes to hell with it (#app.demon)
```

**From CYBER on, enemies have double HP and damage** (`WORLD_TOUGHNESS` in config.js; enemy
specials scale off `baseDmg`, so they double too). Measured 2026-10-08 with the node harness:
a player at perks 10 / moves 6 wins 100% of DARK but ~25-35% of CYBER fights 40 and 45; at
perks 13 / moves 8 (the levels CYBER unlocks) it is 100% again. That gap is the point.

World display names: LIGHT (light/bully), DARK (dark/thug), CYBER (cyborg/simulant), DEITIES
(god/demon). The save ids stay `cyborg` and `god` — only `WORLDS[].name` is shown.
Past DARK the hub's DARK toggle becomes a WORLDS list (`openWorlds`). `WORLDS` and
`BULLY_WIN_FLAG` in config.js are the ladder; every later world reuses the eight move
`kind`s under new names, and borrows a soundtrack (`MUSIC_OF` in music.js).

**The later worlds are louder** (`js/flair.js`, purely visual — sim balance is untouched).
CYBORG specials spark, ring and arc; GOD's throw lightning from the hands to the page edge,
strike impacts from the sky and run the slam along the whole floor, with screen flashes.
Colours are picked BEFORE the page filter: on a night page a dark `multiply` stroke is what
glows. Victory rewards: a CYBORG win finished with a special (`match.finisher`, projectiles
carry `special: true`) fires eye lasers; any GOD/DEMON win tears the losers apart
(`Match.tearApart` -> `Ragdoll.sever`, `f.severed` in draw.js) unless `settings.gore` is off.
Only the visuals scale with `flair.mul` — hitstop does not, or every special would freeze.

**Skill caps follow the worlds you have opened, not the page you stand on.** `perkMax(p, save,
premium)` adds DARK's five levels once `darkUnlocked`, then one more per world after it, in
every world. `PERK_CAP` stops STIFF JOINTS and INK SKIN where `derive()`'s floors make further
levels dead; `moveMaxLv` does the same for a cooldown already at `MIN_CD`. INK WELL (`needs:
'everWon'`) compounds ×1.12 per level on every fight's payout.

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
- **A gesture hint is the stroke you draw, and nothing else.** The glyphs used to carry
  arrowheads so up could be told from down; a playtester read the slash and concluded they
  were meant to draw an arrow, which is exactly what the picture said. Direction now comes from
  `glyphStart` — a dot where the finger goes down, drawn by both the move strip and the shop —
  and from the shop's stroke animating itself out of that dot. Do not put anything in
  `GLYPH_PATH` that is not part of the swipe.
- **`drawCoach` was written and never called.** The first-run prompt was built correctly every
  frame in `Match.updateCoach`, `uigate` asserted `match.coach.text`, the gate passed, and the
  screen was blank — in every build that ever shipped. A prompt is a pixel fact, not a state
  fact: `glyphgate` counts prompt-blue pixels on the half of the screen the prompt belongs to,
  and checks they disappear once you have done the move.
- **`ink.jitterPath` walks distance along the WHOLE path, not per segment.** The old
  `carry = (carry - len) % step + step` looks like it carries the remainder and does not: once
  the carry exceeds a segment's length it adds a whole extra step instead of subtracting the
  segment, so on a finely sampled path the carry runs away. A 46px arch of 24 short segments
  emitted ONE sample and `stroke` drew a straight line from its first point to its last — which
  is why the arch glyph rendered as a dash and both circle glyphs as flecks, at every size the
  game actually draws them. **It only bites when segments are shorter than `step`, so a big
  test render hides it completely**: `glyphgate` renders at the real strip (24u) and shop (26u)
  scales and measures the ink's deviation from the chord as a fraction of the glyph's own size.
  Verified by putting the old arithmetic back — 6 checks go red, arch 0.60 -> 0.05.
- **A first-run prompt demonstrates; it does not name a shape.** `coach.demo` carries a gesture
  id and `drawCoachDemo` traces it on a loop with a fingertip. The wording follows the device:
  `SWIPE DIAGONALLY UP` on a phone, `DRAG / FOR A POWER HIT · or press 1` with a keyboard.
  `hasKeyboard()` therefore runs inside `Match`, which means it has to survive the node
  harnesses — they set `globalThis.window = globalThis`, so guarding on `typeof window` is not
  enough and it must check `typeof window.matchMedia === 'function'` too.
- **Knees bend FORWARD, so every `kl`/`kr` in poses.js is NEGATIVE.** The knee value rotates
  the shin relative to the thigh, so a positive one bows the knee backwards — a bird's leg —
  and the entire library was written that way. It is the single thing that most made the legs
  look wrong, and it is invisible in isolation: on a nearly straight leg the knee is only a few
  units off the hip->ankle line, so it reads as "something about the legs" rather than as a
  backwards joint. Do not fix it by negating the numbers, which moves every foot: take the
  OTHER branch of the two-link solve (`hip = phi + alpha`, `knee = -(PI - beta)`), which keeps
  the foot exactly where it was and only moves the knee across the line. `tools/flipknees.mjs`
  does that and is idempotent; `--check` is the gate.
- **Limb length and `RANGES` move together.** The joint limits in ragdoll.js sit a fraction
  under full extension; a limb that outgrows its range silently locks straight, and the crumple
  that makes a floored body read as a body goes with it.
- **A crouch pose and `duckDrop` have to agree.** The duck is a pose whose lowest foot sits
  ~21u above the standing pose's, and `duckDrop` drops the pelvis by exactly that, so the feet
  land on the ground they were already on. The old crouch put all the weight on one leg and
  stuck the other straight out — and with a 23u drop the solver spent every frame shoving the
  feet back out of the floor. Measure the pose (`fk` is pure and importable in node) rather
  than eyeballing the number.
- **Every change to the FIGURE is a balance change, and it lands on the big fighters.** Hits
  test all 11 ragdoll points, so anything that spreads the body out makes it easier to hit —
  and champions are scale 1.14 and the final boss 1.3, so they grow most. Longer limbs
  (arms 51->57, legs 54->59) left levels 4-39 untouched and took level 44 from 7% to 18%;
  flipping the knees forward then moved them closer to whoever is in front and took the two
  hard champions from 51%/22% to 63%/31%. Both were corrected at the source — champion `hp`
  1.58 -> 1.74 and `dmg` 1.2 -> 1.26, final `hp` 1.9 -> 2.3 and `dmg` 1.4 -> 1.5 — rather than
  by touching the AI, and re-measured to 56%/19%/6% against a baseline of 51%/22%/7%. Note the instrument: at n=60 the same sweep read
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

## Online arena (phase 1, 2026-10-13; local only, NOT deployed)

Design: `docs/ONLINE.md`. Browser-hosted like Snake-eee: `server/` (Go, `ragdojo-arena`, planned
`127.0.0.1:8017` behind Caddy at `/gms/2d/ragdojo/arena/*`) only introduces players, relays
signalling and (as a fallback) game traffic, picks masters and keeps agreed stats.

```
js/net/client.js  ArenaClient (WebSocket, resume) + NetLink (WebRTC 'u'/'r' lanes, relay fallback)
js/net/wire.js    binary input/act/snapshot (int16 at 1/8 unit), verdict()
js/net/fight.js   PvpMatch (a Match subclass), NetFight (master/guest), RULES, keyframes
js/net/panel.js   the ARENA panel; arenaBase() decides which server (prod / 192.* LAN / dev)
server/           hub.go (one goroutine owns all state), store.go (SQLite), ice.go, allowance.go,
                  idtoken.go (copied from the payment service), names.go (copied from Clued)
```

- **The master runs the real Match; guests draw it.** Guest stick (unreliable, 30/s, newest wins)
  and taps/jumps/gestures (reliable `ACT`) go to the master; the master's OWN input is delayed by
  RTT/2 (cap 100 ms). Snapshots 30/s carry the 11 points per fighter; every fx/sfx/`say` call the
  master makes is recorded and replayed on guests (`record()`/`replay()`), so hits look the same.
- **Guests interpolate opponents and predict themselves.** The buffer is sized from a decaying
  PEAK of late arrivals, not mean jitter (mean-sized buffers ran dry 3%). Own fighter is simulated
  locally and corrected against our position ONE RTT AGO; any non-`live` master mode hands the
  body back to the snapshots until it is standing again (`authority`).
- **Results**: both sides run `verdict()` on the same quantised HP/dead flags; HP freezes when the
  round ends (`invuln = 1e9`) so the slow-mo cannot change what is reported. Disagree = void.
  A dropped socket gets 10 s (`away`/`back`, resume token); not back = **forfeit loss, never void**.
  QUIT mid-fight is a forfeit too (`arena.quit()` from `toMenu`).
- **Keyframes** (`matchState`/`applyState`, 1/s on the reliable lane) rebuild a Match exactly —
  the base for host migration. `tools/arenastate.mjs` compares rebuild vs original EVERY tick.
- Free allowance: the server calls `claimArenaBattle` (POST `/api/br8t/allowance` on 8016 with the
  player's own fresh token from `accept`) once per best of 3; fails open; anonymous not counted.
  The panel shows `GET allowance` as "remaining of perDay" (silent if the API is absent).
- **LAN** (`server/lan.sh`): a literal `192.*` page host (same test as `family-access.js`, but no
  acceptance needed: it is a payment waiver and online LAN play involves no payment) uses the arena
  on that machine, same origin. `ARENA_LAN=1`: typed name + per-device id, no limit, no STUN/TURN,
  own DB, `lan_results` with `uploaded` for a later sync. Never serves dot-paths (the root is a repo).

Gates (each watched go red): `cd server && go test ./...` · `node tools/arenaserver.mjs` (binary +
two simulated clients: lobby, master rule, agreement, void, forfeit, TURN only to matched,
internal stats) · `node tools/arenastate.mjs` · `node tools/arenagate.mjs` (two Chromes, real 1v1
over WebRTC, feel numbers) with `--lan` (this Mac's 192.168.* address) and `LAG=140` (dev-only
`?arenalag=` on links). Test hooks: `?arena=` `?arenauid=` `?arenabot=1` `?arenahp=` `?arenasecs=`.

Gotchas hit:
- `PvpMatch` replaces `Match.build()`, which is where `camX/camY` were set: a NaN camera draws an
  empty page while every network number looks perfect. The gate checks the camera and screenshots.
- Snapshot time must be the master's WALL clock, not `match.time` (slow-mo/hitstop stretch it).
- "time since last send >= 33 ms" at 60 fps fires every THIRD frame (20/s): pace on an accumulator.
- `wait` sent before the server finished checking the token is refused as anonymous: wait for `me`.
- Keyframe timers must be full precision; 1 ms rounding moved the frame an attack ends on.

Hostile-review hardening (F1, 2026-10-13; rules in docs/ONLINE.md "Server rules added"):
`server/abuse_test.go` ports every R1/R2/R3 exploit inverted (each FAILS while the exploit works);
a revert harness (57 mutants, one per fix, all red) lives in the F1 scratchpad. Gotchas:
- **Verify every seat's token before charging anyone**, or a bad seat spends its opponent's battle.
- **Several defences stack** (inbound bucket + name limit + lobby coalescing + skip-when-half-full):
  one integration test cannot prove any single one. Each layer has its own test.
- `push` bounds each socket's queue in BYTES (`queued`, shared with its writer); a full queue is
  `disconnect` (away + resume), never an instant forfeit.
- The pong reaper now also reaps sockets that never said hello, so `TestIdleSocketsAreReaped`
  raises `pongLate` to prove the hello rule on its own.
- A rival is keyed by `rid` (salted hash, salt in the DB `meta` table); `friend` comes from the
  `friends` table (finished non-forfeit friend links), never from names the client sends.
- LAN (`lan.sh`) binds the 192.* address only and serves just `/gms/2d/ragdojo/` (minus server/,
  tools/, docs/) and `/lib/auth/`; `arenagate --lan` runs lan.sh itself.
- Test-only env: `ARENA_EARLY_FF_MS` (gates), `ARENA_PER_IP`; `arenamulti` takes `ARENA_TEST_PORT`.

Deploy (needs Aaron's approval; nothing has been run): 1) `server/deploy.sh` (tests, build on box,
`/srv/apps/ragdojo-arena`, unit, health + rollback, data in `/srv/data/ragdojo-arena`); 2) merge
`server/Caddyfile.fragment` into the games.br8t.com block, `caddy validate`, reload; 3) ship the
client with `games/deploy.sh`; 4) `curl https://games.br8t.com/gms/2d/ragdojo/arena/health`. The
payment service must be deployed for the allowance to apply (it fails open without it).

## Ghosts + leaderboards (phase 2 agent D, 2026-10-13; local only, NOT deployed)

```
js/net/ghost.js   ghostSnap/ghostSave (snapshot <-> clamped save), ghostPower/ghostSkill/pickGhosts,
                  GhostMatch (a normal offline Match whose one enemy is the ghost), ghostBattle
js/net/boards.js  the BOARDS tab: your stats card + today/battles/wins/streak/KOs/losses, per arena type
js/net/panel.js   PLAY / GHOSTS / BOARDS tabs (built in JS above #arenaBody); MODES table
server/ghosts.go  GET leaderboard, GET me, GET ghosts, POST ghost (+ OPTIONS preflight for dev ports)
```

- **A ghost is the uploader's real loadout.** Every arena match (`go`, once per match id) POSTs
  `{name, snap}` to `/ghost` with the player's token; `snap` is `{v, t: theme, cd: carryDark, p: perks,
  m: {id: [power, cd]}}` for the ACTIVE move set only — no ink, records or anything else. The server
  re-validates it (`cleanSnap`), keeps one per player, 10 s apart, 90 days. Anonymous players leave none.
- **The ghost fights through `moveStats(itsSave, id)`** (`Brain(f, skill, ids, save, {byKind: true})`),
  with `derive(itsSave)` as its body (HP incl. SECOND WIND, speed, jump, `stats` for armour/crit/drain)
  and its HEAVIER HAND on punches (`GhostMatch.land`: campaign enemies punch at a flat rate; projectile
  hits carry `special: true` and are NOT rescaled — the gate caught that double-count). Skill comes
  from its ranked record (`ghostSkill`). `ghostSave` clamps to what any real save could reach.
- **`Brain` byKind is opt-in.** `PREFER` lists LIGHT ids, so a DARK/CYBER/GOD move set never threw a
  special. Ghosts range moves by `kind`; the campaign and `sim.mjs` keep the old path, so their
  balance numbers stand. (The sim's autoplay player in a non-light world is still special-less —
  worth knowing before trusting a DARK sim number.)
- **Never ranked, never counted.** The fight is a local `GhostMatch` (`match.ghost = true`; main.js's
  `endNetFight` accepts it); nothing is sent during or after it and the server has no endpoint that
  takes a ghost result. The result goes to `window` as a `ragdojo:battle` CustomEvent (and
  `arena.lastGhost`) shaped for js/events: `src: 'campaign', kind: 'ghost', ranked: false`, so only
  "any battle" events will take it, under the campaign cap. Events are NOT wired to it yet.
- **The list** (`pickGhosts`): friends first (names from friend-link offers, `ragdojo.arena.friends`),
  then the nearest in `ghostPower`, then up to 3 stronger; each row says why. Your own ghost is
  excluded server-side when the request carries your token.
- **Boards** read only agreed results. `today` = most battles today (any type); `battles|wins|losses`
  take `&type=` (`boardTypes` in ghosts.go: duel/lms/bandana/hill; the lobby's `gameTypes` in
  store.go is separate and is agent C's to widen); `streak|kos` are all-time. A valid token marks
  your row `you: true`; no uid ever leaves. `/me` is the card: totals, `rank` on wins, per type, `ghost`.
  On a 192.* page the base is the LAN server, so the boards are that server's own.
- **Mode switch for agent C**: `MODES` at the top of panel.js — set `live: true` and the PLAY tab gets
  FIND A FIGHT (`client.wait(id)`) + FRIEND LINK (`client.friend(id)`), and BOARDS gets a type tab.
  `arena.tab('play'|'ghosts'|'boards')` switches tab from outside.

Gates (each watched go red): `cd server && go test ./...` (`ghosts_test.go`: every board's order incl.
per type and today, you-mark, no uids, card, ghost upload auth/clean/rate/exclude-self/age-out, no result
endpoint, LAN identity) · `node tools/ghostgate.mjs` (29 checks: snapshot holds only the loadout,
moveStats parity, clamp, body/brain/punch damage, dark kinds, unranked event shape) and
`--falsify` (11 mutants incl. Brain ignoring its save, all red) · `node tools/boardsgate.mjs` (45, REAL
touch at 844x390 and rotated 390x844: ghost list, a ghost fight sends no WS frame and no POST and changes
no stats, board orders, card, internal touch-drag scroll, X + backdrop, 0 console errors, hidden with no
server) · `arenagate` now also checks both players' ghosts exist after a real match. All three arena
tools take `ARENA_TEST_PORT` (and `ARENA_BIN`, a prebuilt server) so parallel agents don't collide.

## Room modes + host migration (phase 2 agent C, 2026-10-13; local only, NOT deployed)

Last Man Standing, Steal the Bandana and King of the Hill, 2-8 players, plus host migration.
Practice vs bots works with no server: `?mode=bandana&bots=3` (also `lms`, `hill`; bots 1-7) or the
PRACTICE button on each room mode in the ARENA panel.

```
js/net/modes.js      the rules: setup/update/onLand/eliminate on the master, verdict(view) everywhere,
                     ModeLayer (hill ledge, bandana, crowd name tags — drawn via Match.hazards so
                     main.js layers it), drawModeHUD (scoreboard down the right edge)
js/net/objective.js  objectiveFor(m, f) + ObjectiveBrain: where a bot should be, wrapping Brain (ai.js)
js/net/fight.js      PvpMatch (mode, seeded spawns), NetFight (rooms, onOut, migrate/takeOver,
                     patchFromSnap), LocalFight (practice)
server/rooms.go      gathering, countdown, master by measured ping, eliminations, migration, results
```

- **Rooms** gather in `mLobby`: the 20 s countdown starts at 4 players (45 s from 2 in a public room;
  a friend room's host presses START instead), joins stay open until it ends or 8 are in (8 = start
  now). Every seat links to every other seat WHILE it waits (client.js `_roomPing` pings and sends
  `rtts`), so the master is the seat whose WORST measured ping is lowest (`bestMaster`; unmeasured
  pairs fall back to the server estimate + 100 ms). Joining is the "yes"; the panel auto-sends
  `accept` (it carries the token that spends the allowance); a seat with no accept is not dealt in.
  One room = one battle = one allowance. Results: every seat still in reports winner + placings;
  all must agree, else void. Placings are stored in `matches.score` as `place 2,3,1` (seat order).
- **Nobody ends a room by leaving.** A leaver / a guest past the 10 s grace is `out` (eliminated,
  their fighter `gone`, placed by when they left); the last seat in wins by forfeit. A master
  whose socket is down for 1.5 s (`migrateAfter`) is out and `master` names the best-ping seat
  left. That seat runs `takeOver()`: `applyState(last keyframe)` then `patchFromSnap(newest
  snapshot)` — positions, ragdoll + verlet velocity from the last two snapshots, HP, modes,
  scores, objective — then carries on as master. Guests reset their clock sync. 1v1 keeps the
  phase-1 forfeit rule. A resumed socket gets its `go` again: the panel calls `fight.resync(g)`
  instead of rebuilding the fight (rebuilding a running master's Match was a phase-1 bug).
- **The snapshot carries a mode block** (wire.js, after the projectiles): holder, bandana x/y or
  zone x/w/next/t, overtime, and per fighter score (1/10 s), out order, gone, respawn timer.
  The master's `viewOf` and a guest's `viewOfSnap` quantise identically, so `verdict` agrees.
- Free-for-all needed two Match fixes: `match.ffa` turns off the gauntlet's 25% damage between
  two non-player fighters (on the master, guest-on-guest hits were quartered) and makes everyone
  face their nearest fighter, not the master's. `match.fitAll` fits the camera to the spread at
  the screen aspect (cap 1250 high), so 8 fighters wall to wall fit a phone or a tablet.
- Bandana: knocked loose by `def.stagger >= 0.8` (the guard-break line: specials and bombs, not
  jab/hook/kick or thrown bands), flies the way the hit went; the loser can't re-grab for 1 s.
  The holder's own bandana turns gold (`ModeLayer.drawBack` swaps `f.rank`), so no slot gets
  yellow in this mode. Hill: alone in the zone scores, contested scores nothing, moves every
  20 s with a 4 s dashed warning, at least 380u away. Ties at time-up play 30 s of sudden-death
  overtime. KOs respawn after 3 s (farthest spot from the living) with 1.5 s spawn protection.

- **Agreed damage → event points.** Every round report also carries each fighter's damage taken
  (`dmg`, whole percent from the quantised HP everyone sees; `dmgOf` in fight.js) and it is part of
  the agreement. The server keeps the deciding round's and puts `seatRow.OppDmg` (most-damaged
  opponent) on each seat, so `ev_arena.close` (a 2-point loss) is decided server-side, not claimed.

Gates (each watched go red): `cd server && go test ./...` (rooms_test.go: countdown at 4, fill to
8, ping master, not-ready, migration, leavers + forfeit, disagreement, guest grace, agreed damage;
10 mutants red) · `node tools/modegate.mjs` (61 rule checks incl. wire agreement, the mid-tick
final KO, keyframe+snapshot migration; `--falsify` 26/26 red) · `node tools/modesim.mjs --check`
(balance) · `node tools/arenamulti.mjs` (lms x4, bandana x4, hill x3 real Chromes through the panel,
plus kill-the-master x3: 54 checks; `--falsify` 6/6 red, each for its own reason). Under heavy CPU
load (several agents' Chromes) one run showed a guest at 32% underruns; not reproduced in 3 reruns.
Measured: guests 30 snapshots/s, 0% underruns at 3-4 players; hand-over gap ~1.7 s
(1.5 s detection + rebuild). modesim, 100 runs each, equal bots: LMS 14/20/23 s at 2/4/8, no
draws; bandana (first to 20, 100 s) 74/91/103 s, held 47-59% of the time; hill 100 s, top score
42/24/14 s; overtime ~1%; seat win spread within noise (max skew 7%).

Gotchas hit:
- A finished room must be closed at once (results go out, `c.match = nil`): leaving an mDone room
  sends `left` to the others, which the panel shows as "Your opponent left."
- Snapshot-time placings: LMS placing is elimination ORDER (`f.out`), stamped by the master and sent
  on the wire; guests could not reconstruct ties from dead flags alone.
- The deciding LMS knockout lands mid-tick, AFTER that tick's out-numbering: unnumbered, it placed
  LAST instead of second. `Modes.stampOuts` now also runs right before every verdict.
- The migration test's "killed master places last" was wrong: it places by when it left, below
  everyone standing then but above anyone already down.

## Online client fixes (F2, 2026-10-13; local only, NOT deployed)

R2's netcode review and R3's payment findings, client side. `node tools/netfixgate.mjs` (node, 35 checks,
`--falsify` 21 mutants) and `node tools/arenafix.mjs` (real Chromes + server, 20 checks, `--falsify` 7) are
the gates; `ARENA_BIN` / `ARENA_TEST_PORT` as for the other arena tools.

- **Online hit-stop is a picture, not a pause** (`PvpMatch.update`): the sim runs through it and
  main.js holds the drawn frame until the stop runs out. A guest predicting its own swing cannot see
  the master's freeze coming; with the sim paused a third of taps played differently on the two
  screens. The campaign `Match` still freezes. Taps also buffer 150 ms on both sides (`strikeQ` on the
  master, `strikeAt` in prediction), and the guest reconciles against the input the master acked
  (`F.ack` -> `sentAt`), not "now minus ping".
- **A hidden master hangs up** (`ArenaClient.hide()`, code 4001, no resume until visible): the server
  hands a room over at once and starts a 1v1's grace. A master that freezes without a visibility
  change is reported by its guests: `{t:'stall', match, ms}` after 3 s, every 2 s, `ms: 0` when it
  ends. After 13 s quiet the guest's HUD says QUIT counts as THEIR forfeit (F1's rule, `why: 'stall'`).
- **The slow-mo is frozen for real**: `PvpMatch.eliminate` is a no-op once `over`, guests keep the
  FIRST end-of-round snapshot. A quitter in the slow-mo used to flip the verdict and void the room.
- **The arena panel only opens over a fight it owns**: `msg`/`result` open it only if it was showing
  or an online fight was running; otherwise they hang up (`closeIdle`). Every handler is bound to the
  client it came from (`wire` ignores a closed or replaced client).
- **The objective stays in shot**: `match.focusPoints()` (modes.js) adds a loose bandana and the
  current + next hill to the camera fit, and `drawEdgeArrows` points at anything still off screen.
  A loose bandana rolls out to `REST_LO`/`REST_HI` (330u from the walls) — at the walls it sat under
  the thumb-stick.
- Hill scores only a grounded fighter whose pelvis is over the ledge. Time-up ties share first place.
- **Payments**: `Purchases.refresh()` changes state only on a definitive answer; a failed check keeps
  the session's verified state (`unknown`) and announces nothing. main.js never parks or `toMenu`s
  mid-fight: a definitive "not entitled" parks at the next hub visit (`parkOwed`). Live and test mode
  count the same; "(TEST)" labels only in test mode. Pass events and the arena allowance open the
  upgrade panel Pass-first (`openUpgrade(null, 'pass')`).

Gotchas hit: `?mode=` practice races `?auto=1`'s START (the hub demo replaces the practice match) —
the gate starts practice through `arena.practise()` instead. A "per act" prediction metric misreads
the strike buffer (a buffered swing lands in the NEXT act's window); compare the two sides' attack
SEQUENCES (LCS) instead. Practice used `match.net` and so never paused: online-ness is `net.client`.

## R4 review fixes (F4, 2026-10-13; local only, NOT deployed)

Rules in docs/ONLINE.md "Server rules added". Tests: the R4 section of `server/abuse_test.go`, netfixgate
`demote`/`stallnote`/`poll`, arenafix `roomhide` (comes back as a guest) and `stall` (socket alive = void;
JS paused via CDP `Debugger.pause` = the master's forfeit).
- **A stall report is a claim, not evidence.** The server times it on its own clock and only blames a 1v1
  master it saw go quiet itself (`masterSilent`: away, or no pong for `pingEvery + pongDue`). It tells the
  guest which (`{t:'stall', silent}`) so the HUD never promises a forfeit the server will not give.
- **The fix for a forgeable rule is to stop trusting it, not to flag it.** The dispute share was diluted by
  the cheater's own honest losses; `flagged()` is an absolute count now.
- **A demoted master must stop recording.** `record()` wraps fx/sfx/say for broadcast; a master that becomes
  a guest (`migrate` with `was`) calls `unrecord()` or its replayed fx pile up in `rec` for ever.
- A suspended (hidden) room master steps nothing until its resumed socket's `go`: a stale Match running
  on for a few frames could report a verdict nobody else saw.
- **The menu demo's restart timer could replace a running online match** (main.js `onEnd` -> `setTimeout(startDemo,
  700)` checked `mode` only when it was set). A room master whose demo ended just before `go` drew a campaign
  sheet and stopped stepping; the room stalled. It re-checks `mode` when it fires. Found as a ~1 in 5 arenafix
  `roomhide` flake: look at `window.__ragdojo.match === window.__net.match` before blaming the network.
- `eventsecretgate` reads the answers from Aaron's data and prints only pass/fail; its history check uses
  `git log --all -i -S` and excludes `assets/events/manifest.json` (the choices are public by design).

## Music

Fourteen Suno v5.5 instrumental tracks in `assets/audio/`, wired through `js/music.js`.
See `docs/MUSIC.md` for the prompts and the regeneration recipe. Missing files are tolerated —
`audio.js` stays silent for any id whose mp3 is absent, so the game runs fine without them.

## Monetisation (model 2026-10-11, payments 2026-10-12; TEST mode, NOT deployed)

Read `docs/MONETISATION.md` and `docs/VERIFICATION.md` before payment/release work.

- **LIGHT and DARK are free.** DARK shows a dismissible "support the developer" note in the
  hub (`#nudge`, `maybeNudge()`): on entering DARK or returning to the hub after a DARK
  win, at most once per 48 h (`ragdojo.nudge.v1`), never mid-fight, never for supporters.
- **CYBER and DEITIES are paid**, opened by EITHER entitlement: `ragdojo_supporter`
  (A$1.99 one-off, "Support the developer") or an active `br8t_pass` (A$1.49/mo or
  A$4.99/yr, everything on br8t). `js/purchases.js` reads `entitlements` from the server
  (never the legacy `owned` flag); `paintOffers()` / `ownedMessage()` in main.js drive the
  panel (Support, Pass, Or yearly, Manage subscription → Stripe portal, Restore). Gating: `PAID_WORLDS` / `isPaid` / `worldOpen` / `parkPaid()` in main.js.
  World prerequisites still apply. Unpaid paid-world runs are parked (to DARK if you have a
  DARK run, else LIGHT), never deleted. `perkMax`/`moveMaxLv(..., premium)`: DARK's +5 levels
  are free; each paid world's +1 needs `premium`.
- The purchase API is probed once (`probePayments()` → `/api/br8t/offer`; server keeps
  `/api/ragdojo/*` as an alias). Unavailable =
  "coming soon" copy, disabled checkout, hidden Restore, **no entitlement requests**. Only
  games.br8t.com (or localhost under /gms/2d/ragdojo/) talks to accounts/payments at all.
- `192.*` family skip stands in for the purchase; it walks into the world it was opened from.
- Refunds: 14 days, no questions (also the first Pass payment); `terms.html` names BR8T.COM.
- Release builds (`npm ci && npm run build`, `dist/` gitignored) minify, drop dev hooks;
  itch now ships DARK (and its music) too. Never store entitlement flags in a save.
- Payment service: `~/cc/ionos/ragdojo-payments` (br8t-payments; own local git, no remote;
  Stripe Managed Payments; read its README).
- Gates for the model: `releasegate`, `accountgate`, `familygate` (built output), plus
  `darkgate` for free-DARK skill caps. Localhost source is DEV: everything is open there.

Do not deploy/publish or enable live payments without Aaron's approval.
Aaron confirmed commercial-use rights for the Suno soundtrack.

## Special events engine (phase 1, 2026-10-13; wired into the game in phase 3 — see below)

Read `docs/EVENTS.md` (engine + server contract) after `docs/ONLINE.md` (design).
`js/events/` is pure and node-importable — no DOM, no `Math.random`, no clock except `today()`.
`dev/events.html` is the standalone preview (Vines & Ladders board with a walking stick man,
fake rivals, picture-reveal grid, buttons that simulate finished battles; `?now=<ISO>` pins the
date, `?peek=1` shows the whole picture, `?img=<url>&pic=<id>` swaps in real art).

```
node tools/eventsgate.mjs            # points, UTC windows in 5 timezones, dice + board golden vectors,
                                     # THE REPLAY RULE (Aaron's 1,3,2 example; a turn is a battle), rivals, reveal, save
node tools/eventsgate.mjs --falsify  # 22 mutants of js/events, each must turn its own section red
node tools/eventsshot.mjs [dir]      # the preview in Chrome: real touches, rivals move only at turn ends, 0 errors
```

- **A turn is a BATTLE, not a roll.** Each battle banks a batch of rolls equal to its points;
  a turn is consuming one batch. The first build read "turn" as one roll and needed an invented
  free starting roll to make Aaron's example add up — that was the tell. Dice are indexed by
  ROLL, so re-ordering battles moves turn boundaries without changing any roll.
- **A position is never stored.** The save holds the ordered battle points (`ev.b`, play order)
  and a roll count; position and turns are recomputed, so a server can verify a player from
  their battles and one integer.
- **The replay rule is one `Math.min` over turns** (`shownTurns`), and a rival's turn k is the
  end of THEIR k-th batch (`positionAtTurn`). Everything that draws or ranks rivals must go
  through `rivalView`/`selectRivals`, never through a rival's raw rolls.
- Campaign fights count at most 10 per UTC day, 60 s apart (`CAMPAIGN_CAP`); the guess bonus is ink.
- **Week keys are ISO weeks** — 2027-01-01 is `2026-W53`. Use `windowOf`/`parseEventId`, never
  build keys by hand. The gate runs the windows under five TZs because a `getDate()` slip passes
  in UTC.
- **Board links are 8+ squares and drift at most 3 columns.** Unconstrained long diagonals made
  the first board an unreadable lattice; a "different row" rule is implied by the drift cap.
- Changing `hash32`, `die`, `makeBoard` or the choice shuffle changes every board and every die
  ever rolled — the golden vectors in the gate and `docs/EVENTS.md` are the server's contract.

## Events in the game + event art (phase 3 agent E, 2026-10-13; local only, NOT deployed)

```
js/events/ui.js       the EVENTS button + panel: tabs per running event, Vines & Ladders, picture reveal,
                      PRIZES; listens for `ragdojo:battle`, banks into save.events, syncs with the server
js/events/render.js   VinesView / RevealView — the preview's drawing, now shared by the game and dev/events.html
js/events/net.js      the arena server's /events calls; same base rule as net/panel.js arenaBase
server/events.go      Go port of hash32/die/makeBoard/windows/counted + claims, rivals, guess, arena hook
tools/eventart/       Aaron's LAN review page for Flux candidates (server.mjs + index.html)
```

- **Battles in**: main.js `finishFight` dispatches `ragdojo:battle {src:'campaign'}` (oppDmg = the
  most-damaged enemy); net/panel.js dispatches `{id:'arena:<match>', src:'arena'}` on an agreed
  `result` (oppDmg from the deciding round's match) and ghosts already did. The listener records
  it with `recordBattle` and writes `detail.award = {pts}` back onto the event object, which is how
  the results card, the ghost card and the arena card print "+3 event points" without importing
  the events module (main.js and panel.js load modules under different `?v=` URLs — a second
  import would be a second module instance with its own state).
- **The save is the run save** (`S.events`, `S.eventPrizes`), so cloud sync carries it and no new
  key needs syncing. Only finished battles are recorded; NEW GAME keeps both; `applyCloud` merges.
- **Offline is a full mode**: no server (or signed out) = local dice with `uid` `local:<device>`
  and the drawn practice picture (no guessing). Online, the server's recomputed state wins
  (`adopt`), keeping anything recorded while the request was out. Only approved art can be
  guessed, only online (no answer ships — see "Event secrets" below).
- **Pass events** show with 🔒, a dimmed board and a "SUPPORT / PASS" button that opens the
  existing support panel — no modal. `hasPass` = DEV / family / `purchases.passActive`;
  `?evpass=0` forces it off in dev. The server checks the entitlement itself.
- **The canvas sits inside the rotated app in portrait**: `getBoundingClientRect` is the rotated
  box, so a tap is mapped with `isRotated()` (x = clientY - top, y = right - clientX).
- **The manifest path is page-relative** (`document.baseURI`), not `import.meta.url`: the release
  build bundles ui.js into js/main.js and a module-relative `../../assets` would point outside the
  game. `tools/build.mjs` copies `assets/events/manifest.json` only; pictures come from the server.
- **Backgrounds**: a finished picture is a prize; USE IT sets `S.eventPrizes.bg` and
  `drawEventBackdrop` paints it faintly (multiply, 30%) behind the menu demo, arena and ghost
  fights — never the campaign.

Server (see docs/EVENTS.md "Server contract"): agreed arena results count automatically through
`store.afterMatch`; claims are capped/clamped/recomputed; rivals get the replay rule with the
caller's STORED turns and leave as `{name, pos, turns, friend, home}`; the guess is checked against
`ARENA_EVENT_ANSWERS` (default next to the DB). Arena `oppDmg` comes only from the agreed reports
(the old client "close loss" claim is gone, 2026-10-13 F1).

**Event art review (Aaron)**: `node gms/2d/ragdojo/tools/eventart/server.mjs` from the site root,
then open the printed `http://192.168.0.236:8023/?k=<key>` on the phone. Data lives in
`~/.ragdojo/eventart/` (candidates, state, key, answers.json, approved/), seeded with the 12 phase-1
candidates; approving writes the picture to `approved/` (server-only), a choices-only entry to
`assets/events/manifest.json` (commit that) and the answer to answers.json (`server/deploy.sh` copies
both to the box; a LAN server reads them in place). `--republish` rewrites every approved picture. Regenerate queues on
mflux-queue :7867 (waits for LTX to go idle first; no lock). Aaron approves live from his phone.

**The player's name in the art** (`js/events/overlay.js`, Aaron's idea for the blank dojo
scroll): a manifest entry may carry `overlay: {x, y, w, h (image fractions), rot (deg ±20), text
("{NAME}" = the arena name, else YOU; "\n" breaks), layout: "stack" | "lines"}`. The panel bakes it
into the picture once per name (ui.js `imageOf`, clipped to the squares opened) in Caveat via ink.js's jitter, so the squares over the
scroll reveal the name as they open; the backdrop prize gets it too. Stacked letters read best on a
hanging scroll; long names shrink to 1/9 of the box, then get cut ("lines" shrinks to fit, then
"…"). Generic: any blank sign or banner can use it. It never touches choices or answers, and the
review tool refuses a box whose text contains a word of the answer. The review page edits it per
candidate (NAME ON IT…: numbers or drag a box on the picture, live preview with a sample name,
drawn by the game's own overlay.js served at `/game/js/`); on an approved picture the manifest
entry updates at once. dojo_2's box is set in Aaron's data (x .607 y .215 w .19 h .44, stack).

Gates (each watched go red):
```
cd server && go test ./...           # events_test.go: doc + ~1,300 JS golden vectors, replay rule never leaks,
                                     # rival selection, campaign cap, arena auto-count, pass/windows, reveal + guess
node tools/eventsvectors.mjs --check # the vectors file still matches js/events
node tools/eventsgofalsify.mjs       # 18 mutants of events.go, eventart.go and the JS board, all red
node tools/eventsgame.mjs            # 76 checks, REAL touch, 844x390 + rotated 390x844, offline and online, art tiles
node tools/eventsgame.mjs --falsify  # 9 mutants (+ device clock, no refresh after a guess, short buttons, practice guess, any tile)
node tools/eventartgate.mjs [--seed <dir>] [--no-flux]   # list, a REAL Flux regeneration, approve into temp
node tools/eventartgate.mjs --falsify                    # 6 mutants (answer/image in manifest, picture in public folder, no answers file, no key, box spells answer)
node tools/overlaygate.mjs [--falsify]                   # name box: inside only, long names, lines fit, opened square shows it, Hindi (5 mutants)
```
### Event secrets (F3 fixes, 2026-10-13; local only, NOT deployed)

The pictures and their answers never reach the public site (the repo is public AND is GitHub Pages).
- **Art is server-only.** `server/eventart.go`: `GET /events/art/tile?event=&cell=` cuts one square
  from `ARENA_EVENT_ART/<event-id>.jpg` (default: the review tool's `approved/` next to the answers
  on a LAN Mac, `/srv/data/ragdojo-arena/event_art/` on the box) only if the CALLER's stored state
  has it open; `/full` only at 25 open — a right guess is not enough, so solved pictures stay
  buyable square by square (events.go hook). The panel draws tiles into a canvas (`arts`), the
  overlay clipped to opened squares. The public manifest is `{w, h, choices, overlay?}` only.
  The full images were removed from assets/events (history keeps them, accepted).
- **No answer in the bundle.** reveal.js has no `PICTURES`; the practice picture offers no guess
  (and `server` pays it 0); `canGuess(st, art)` needs real art + one battle in the event; offline
  there is no guess bonus (a salted hash of one of four public choices is four tries). Decoys live
  in Aaron's tool data. Halloween is "SPOOKY WEEK" (the title used to name the answer).
- **Banking vs the Pass**: every battle banks into every event incl. Pass ones; the Pass gates
  display, rewards, sync and the "+N event points" line. Battles are stamped `+ net.skew` (the
  listener converts the dispatcher's device-clock `at`). `merge` re-runs `counted()`;
  `adoptMerge` drops a `bonus` claim the adopted cloud save never paid, so the ink is paid again.
- Rivals are keyed by the server's `rid` (hops, ★ is server-side); names are NFC with `\p{M}` kept
  and stacked by grapheme (`Intl.Segmenter`); guess buttons are >= 40 px.
- **Restart Aaron's review tool** after pulling: an instance started before this change still
  writes approved pictures into assets/events.

```
node tools/build.mjs && node tools/eventsecretgate.mjs   # no answer in dist/js/dev, no picture in assets or dist,
                                                         # manifest has no image; --falsify 3/3; red on the pre-fix tree
cd server && go test -run TestEventsArt ./...            # tiles only for the caller's opened squares, cut from the right
                                                         # square; whole picture only at 25 (eventsgofalsify +5 mutants, 18/18)
```
eventsgate 142 (+M1/M2/L1/L7 checks, --falsify 27/27), eventsgame 76 (tiles, guess >= 40 px, Solved/PRIZES
refresh, "fight once", a clock a day behind; --falsify 9 mutants), overlaygate 15 (Hindi; --falsify 5/5),
eventartgate 29 (--falsify 6/6). Ports used by F3: 9900-9949.

Test hooks: `window.__events` (DEV), `?arena=` `?arenauid=` `?evpass=0`; ports `EVENTS_TEST_PORT`
(9500-9502), `EVENTART_TEST_PORT` (9510-9511), `OVERLAY_TEST_PORT` (9540). Never `pkill` the review
tool by name: Aaron's own instance runs on 8023 from `~/.ragdojo/eventart` (one was killed that way).

