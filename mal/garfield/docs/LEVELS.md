# Garfield: Hungry Heist — Level design (owner: levels)

The child's brief (docs/BRIEF.md) is the design. This file fills gaps and pins down triggers, timings, fail-safes
and every line of dialogue. Names in VO keys: `g_*` = Garfield thought bubble (voiced, Jon can't hear),
`j_*` = Jon speaks aloud. Lines marked **[N]** speak a character name and have a name-free `_nn` alternate (D2).

## 0. Rules shared by every level

- **Guard rule.** While Jon is seated and *alert* (not distracted), the food can't be eaten. Standing at the food
  shows the prompt "Jon's watching!" and pressing Space gives a hint thought (`g_guarded_*`) instead of eating.
  If Garfield stands on the table near Jon's plate while Jon is alert, Jon warns once (`j_offtable_*`), and after
  4 s more he grabs Garfield → **catch cutscene**. (L6 is the exception: it's the "scratch the food" level, so Jon
  only warns there, with a 6 s grab timer.)
- **Distraction window.** Each level's trick sets `distracted = true` until Jon is back in his chair. Starting to
  eat inside the window always finishes (2.5 s chew, plate shrinks 1 → 0); Jon never interrupts an eat in progress.
- **Eat = win**: Garfield plays `eat` → `chew` → `celebrate`, says a `g_win_*`, and Jon (if able) says a `j_lost_*`.
  The core then shows Level Complete, adds belly +0.15 and unlocks the next level.
- **Scratch zones** (forgiving and predictable, not purely geometric). If Garfield is elevated (feet > 0.45 m) or
  in the top half of a jump → **face**. On the floor behind standing Jon (Garfield in Jon's back 120° cone) →
  **butt**. Otherwise → **leg**. While Jon is seated, a floor scratch hits a **leg**.
- **Jon reactions** (the brief): leg → `hop_leg` 2.5 s → chase. Face → `cover_face` 2 s → `throw_newspaper` at
  Garfield (an arcing projectile; on hit, a knockback of ~1.5 m with a comic `knockback` clip, no penalty) → he walks
  to pick the newspaper up (~5 s) → back to his chair. Butt → `cover_butt` 1.5 s → chase.
- **Chase**: 10 s, or until he catches Garfield (within 0.7 m). Jon's run speed is 3.0 m/s; Garfield's run is 4.0
  (±10% belly). Jon can't climb, so if Garfield is on any surface higher than 0.4 m (table, chair, sofa, sill, bed,
  bench, fridge), Jon stops below, glares (`j_glare_*`) and gives up after 4 s (`j_giveup_*`). After a chase or
  give-up, Jon returns to what he was doing (usually his chair). The HUD shows a chase timer.
- **Catch cutscene** (~4 s, skippable): the camera cuts to a side 2-shot. Jon pulls out a newspaper (`j_catch_*`),
  does a `whack` swing, and Garfield plays `whacked` (squashes flat comic-style, spring back, with stars and a
  `boing`), then a `g_caught_*` thought. Jon walks off back to his task. Garfield is placed back on the floor
  a safe 2 m from Jon. **No other penalty**: objectives done so far stay done and props stay changed.
- **Hints**: if there's no objective progress and no meaningful input for 20 s, Garfield thinks the level's next
  hint (`l0N_hint_1`, then `_2` 20 s later, then `_3`, which is the most explicit). The current target always has a
  soft glow ring. Plus general idle barks after 8 s of no input (see §5).
- **Re-arming**: every distraction can be re-done. If the window closes without the food being eaten, the level
  resets that step and leaves the earlier objectives ticked (details per level).
- **Out-of-order steps**: the interaction just gives a hint thought, and nothing breaks.

## 1. Intro cutscene (first launch only; also Settings → Replay intro) — ~22 s, skippable

1. Exterior visible (`world.exterior.show(true)`), dusk sky. A high, slow crane shot over the cul-de-sac (`cam_intro1`
   → `cam_intro2`), 5 s. Music: `cutscene`.
2. Push in toward the house's front window (`cam_intro3`), 4 s, then fade through the window/door to black (0.4 s).
3. Inside: the exterior is hidden. A dining shot (`cam_dinner`) of Jon seated at the table, eating steak, peas and mash
   (`sit_eat`). `j_intro_1` "Ahh. A quiet evening, a perfect steak, and absolutely no interruptions."
4. Cut to Garfield peeking over the bench edge (`cam_peek`), smug: `g_intro_1` "Interruptions are my specialty."
5. Garfield runs, jumps and pounces (`pounce`) onto the table and lands on the plate area. Slow-mo 0.4 s, then
   Jon plays `shock`/`fall_back_chair`-lite (he leans back, arms up). `j_intro_2` **[N]** "GARFIELD!" / `_nn` "HEY! MY STEAK!"
6. Garfield munches (`eat`); the camera holds 1.5 s, then the title card "Garfield: Hungry Heist" fades up, then →
   menu screen (the Chapter One unlock animation plays there; UI-owned).

## 2. Chapter One opening cutscene (every level; skippable) — ~14 s

1. A kitchen shot. Jon walks from `jonSpawn` to `catBowl` carrying the bowl, plays `give_bowl`.
   `j_open_bowl_1..3` (random): "Here you go, buddy! Crunchy cat biscuits, your favourite!" etc.
2. Food line, by level food:
   - steak (L1, L2, L7): Jon walks to the table, sits. `j_open_steak` "And for me: steak, peas and mashed potatoes!"
   - lasagna (L3, L5, L6, L10): Jon stands at the table with the pan, plays `serve` (`pan.serveScoop()`, a slice lands on
     the plate), sits. `j_open_lasagna` "And for me: a big slice of lasagna, fresh from the pan!"
   - meatloaf (L4, L8, L9): Jon sits. `j_open_meatloaf` "And for me: meatloaf. Plain, simple, honest meatloaf."
3. Garfield at the bowl: `eat` (bite), then `disgust` expression + `spit` (`catBowl.spitBits()`), sfx spit.
   `g_open_spit_1..4` random ("Blech. Crunchy disappointment.").
4. Then Garfield looks at Jon's plate: `g_open_plan_<food>` (e.g. "Lasagna. My true love. My destiny.").
   End: the camera blends to the follow cam and control starts.
   **L1 differs only by Jon's timing**: in the tutorial, Jon places the bowl and then *wanders* (doesn't sit) for 30 s,
   with the food already on the table.

## 3. L10 extra cutscene (after the opening) — ~12 s

1. Jon stands up from the table, picks up the pan, turns to Garfield (2-shot). Says verbatim:
   `j_l10_1` "You won't let me eat my food; I won't let you eat my food. Fine, I just won't eat."
2. Jon walks to the fridge, `open_fridge`, `put_in_fridge` (`pan.toFridge()`), closes it.
   `j_l10_2` "There. Safe and sound. Nobody's eating tonight."
3. `g_l10_1` "Nobody? Challenge accepted."
4. Jon walks to the living room and sits on the sofa/lounge chair sulking (`sit`) → control.

## 4. Levels

Food: L1 steak · L2 steak · L3 lasagna · L4 meatloaf · L5 lasagna · L6 lasagna · L7 steak · L8 meatloaf ·
L9 meatloaf · L10 lasagna.

### L1 — "Face First" (steak) — tutorial
Objectives: ☐ Scratch Jon's face · ☐ Eat Jon's steak
- Jon wanders the house (`wander`: tv → sofa → window → stairsBottom → kitchenBench → fridgeFront), with idle
  lines `j_wander_*` every ~8 s, for **30 s**, then `j_dinner_time` "Dinner time! Finally!", walks to his chair and
  sits (`sitEat`). If a chase is running at 30 s, he sits after it ends.
- Tutorial cards (`ui.tutorial.show`, non-blocking; each ticks when done, auto-advances after 14 s otherwise):
  1. **Move**: "WASD / arrow keys (or the stick) to walk" (done after moving 2 m).
  2. **Camera**: "Drag with the right mouse button (or swipe the right side) to look around" (done after 40° of yaw).
  3. **Jump**: "Space (or the Jump button) to jump. Try the sofa!" (done after a landing on any surface > 0.3 m).
  4. **Scratch**: "J / left-click (or the claw button) to Scratch. Scratch Jon's leg → he hops then chases!
     Face → he throws a newspaper! Butt → he chases!" (done after any scratch).
  5. **Escape**: shown only during the first chase: "Jon can't jump! Hop onto furniture to escape."
  6. **Pause**: "Esc (or ⏸) pauses" (shown 5 s after the scratch card, auto-hides).
  7. When Jon sits: **Face + eat**: "Jump onto the table or a chair next to Jon and Scratch his face!" and after the
     face hit, "Quick! Stand on the plate and press Space (or tap the food) to eat!"
- Face scratch → cover_face → newspaper → Jon walks to fetch the paper (distraction ~7 s; extended until he's
  seated again, ~10 s total). Eat → win.
- Fail-safe: a face scratch during the wander phase also ticks objective 1, but the window then closes when Jon sits.
  The objective stays ticked, and any later face scratch re-opens a window. An eat attempt while guarded → `g_guarded_*`.
- Hints: `l01_hint_1` "Jon's face is up high. I need to be up high too.", `_2` "If I jump on the table next to him,
  I can reach his face.", `_3` "Table. Scratch face. Eat. Simple."

### L2 — "Timber!" (steak)
Objectives: ☐ Scratch a back leg of Jon's chair · ☐ Eat Jon's steak
- Jon is seated. Scratch targets: the two back chair legs (a scratch target at the chair's back-left and back-right
  feet, radius 0.45 m, floor height). Scratching a leg once → `chair.breakLeg()` → crack sfx + `j_chair_crack` "Huh?
  What's that crunchy noise?" (0.8 s) → `chair.fallBack()` + Jon `fall_back_chair` → `j_chair_fall` "Whoa-whoa-WHOA!"
  → Jon lies dazed on the floor (`lie_still`, stars) for 10 s → `j_chair_floor` "Ow. Hello, floor." → gets up, rights a
  new chair (`chair.reset()`), sits.
- Window = Jon on the floor (~12 s). Jump onto the table, stand at the plate, Space → eat.
- Out of order: a Jon leg scratch → normal hop/chase (the chair leg is the target, so the hint says so). A front
  leg scratch → wobble + `g_l02_frontleg` "Wrong leg. The back ones hold up the Jon."
- Re-arm: after he sits on the reset chair, the back legs are scratchable again.
- Hints: "That chair looks wobbly…", "If a back leg of Jon's chair broke… timber!", "Scratch the BACK leg of Jon's chair."

### L3 — "Oops, Vase" (lasagna)
Objectives: ☐ Jump onto the windowsill · ☐ Knock the vase off · ☐ Eat Jon's lasagna
- The vase sits on the living-room sill. Land on the sill → tick 1. Scratch near the vase (radius 0.6) → `vase.knock()`
  → shatter → tick 2. `j_vase_hear` "What was THAT?!" Jon stands (`stand_up`), walks to `vase`, plays `investigate`
  then `scratch_head`. `j_vase_see` "My good vase! In a million pieces!" Then `j_vase_sweep` "Where did I put that
  broom…", 8 s of looking, then back to his chair.
- Window = from stand_up until seated again (~16 s with walking).
- Re-arm: if he gets back without the food eaten, he says `j_vase_spare` "Good thing I keep a spare vase." The
  vase is reset (`vase.reset()`) and objective 2 is un-ticked (1 stays).
- Out of order: knocking the vase without first landing on the sill is impossible, as the vase is reachable only
  from the sill.
- Hints: "That vase on the windowsill looks… breakable.", "Jump on the windowsill and give that vase a little
  nudge.", "Scratch the vase off the sill, then run for the food while Jon looks."

### L4 — "Curtain Call" (meatloaf)
Objectives: ☐ Shred the curtains (0/4) · ☐ Eat Jon's meatloaf
- Curtains in the living room. Scratch within 0.8 m: each scratch → `curtains.shred(stage)` (4 scratches; stages 1, 2, 3, 3),
  rip sfx, counter shown in the objective. After scratch 2, Jon (seated): `j_curtain_hear` "Is something ripping?"
  (but stays put). On the 4th: tick 1, `j_curtain_see` "My CURTAINS! They were on sale!" Jon gets up, walks to the
  curtains, investigates 10 s (`j_curtain_fix` "Maybe if I hold this bit up… nope.") → back to his chair.
- Window ≈ 15 s. Re-arm: after he returns, 2 more scratches re-trigger him (the counter shows 2/4 → 4/4 again).
- Hints: "Those curtains look very scratchable.", "If I really shred those curtains, Jon will have to come and look.",
  "Scratch the curtains a few times. Then eat while he's busy."

### L5 — "Jungle Cat" (lasagna)
Objectives: ☐ Climb up to the top of the fridge · ☐ Grab the vine · ☐ Catch the lasagna pan · ☐ Eat it
- **The vine** = a trailing hanging pot plant on top of the fridge. Its long leafy strand is long enough to swing over
  the table.
- Climb route (the controller's max jump is ~0.95 m): a kitchen chair (0.45) → the bench/counter (0.9) → a stack on the
  counter (bread bin/microwave, ~1.25) → the fridge top (1.85). Each step gets a soft glow when Garfield is near the
  previous one. Landing on the fridge top → tick 1.
- Interact with the vine within 0.6 m (Space/click) → `vine.grab()`, tick 2. Garfield hangs from the strand's tip,
  controls are locked (the camera pulls out to `cam_swing` framing the fridge + table), and he swings as a pendulum
  between the fridge edge and a point past the pan (period ~3 s, `vine.swing(t)` for visuals). When the tip is within
  0.55 m (horizontal) of the pan, a big "SPACE!" prompt flashes on the pan (the swing slows 30% near it). Press Space
  → `pan.swingCatch()` → Garfield holds the pan and swings back to the fridge top, landing with it → tick 3.
- Eat on top of the fridge (Jon can't climb): Space → eat → win. Jon notices the pan is gone after the catch:
  `j_pan_gone` "Wait… where's my pan?" He stands under the fridge glaring (`j_glare_*`), and can't reach.
- Misses: Space off-target → `g_l05_miss` "Too early. Or too late. Timing is hard." After 4 passes with no catch, the
  swing ends on the fridge top and the vine can be grabbed again.
- Jon is seated throughout, so if Garfield falls off the route there's no penalty. The guard rule still applies to the
  table.
- Hints: "The fridge top looks like a good view. How do I get up there?", "Chair, counter, bread bin, fridge.
  Step by step.", "Grab the vine on the fridge, swing over the table and press Space over the pan!"

### L6 — "Food Fling" (lasagna)
Objectives: ☐ Scratch Jon's food off the table · ☐ Eat it off the floor
- Jump onto the table (Jon warns `j_offtable_*`; in this level the grab timer is 6 s). Scratch within 0.7 m of the
  plate → `plate.fling(floorSpot)` (arcs across the table away from Jon, splat), tick 1. Jon: `j_fling_1` "HEY! My
  dinner!" `shock` 1.5 s, `stand_up`, `j_fling_2` "Five-second rule! Five-second rule!" and he walks slowly
  (1.2 m/s, by design) round the table toward the plate.
- Eat at the floor plate (radius 0.7) → win. If Jon reaches the plate first (~8+ s): he picks it up, `j_fling_save`
  "Saved it! Ha!", puts it back on the table and sits. Re-arm (tick 1 cleared).
- Eating on the table is not possible in this level (always guarded), so the hint repeats the brief: "the only way is to scratch it".
- Hints: "He's guarding that plate like a dragon.", "What if the food… fell off the table?", "Jump on the table and
  Scratch the plate! Then eat it off the floor."

### L7 — "Cold Snap" (steak)
Objectives: ☐ Jump onto the windowsill · ☐ Open the window · ☐ Eat Jon's steak
- Land on the sill → tick 1. Interact with the window while on the sill (radius 0.8) → `window.open()`, breeze
  particles, curtains `wave()`, wind sfx, tick 2. After 1.5 s: `j_cold_1` "Brrr! Why is it suddenly freezing?!"
  `j_cold_2` "Who opened the window?" Jon walks to the window, `close_window` (`window.close()`), `j_cold_3` "Much better.
  Brrr." He shivers for 3 s (`stunned_shake` light), then back to his chair.
- If Garfield is still on the sill when Jon arrives, Jon shoos: `j_shoo` "Shoo, off the sill!", and Garfield is nudged
  to the floor (a small knockback, no catch).
- Window ≈ 14 s. Re-arm: the window can be reopened (objective 2 un-ticks).
- Hints: "It's a bit stuffy in here. Some fresh air would be nice.", "If I open that window, Jon will have to close
  it.", "Jump on the windowsill, press Space to open the window, then go eat."

### L8 — "Bedroom Lock-In" (meatloaf)
Objectives: ☐ Scratch up Jon's bed (0/3) · ☐ Shut Jon in the bedroom · ☐ Eat Jon's meatloaf
- Go upstairs to the bedroom (door open). Jump on/next to Jon's bed and scratch it 3× → `jonBed.shred(1..3)`. After the 3rd:
  tick 1, `j_bed_hear` "What's going on up there?" Jon walks upstairs into the bedroom, to the bed: `j_bed_see` "My
  BED! My comfy, cosy bed!", `investigate` for 14 s.
- While Jon is inside the bedroom (past the door threshold), the bedroom door is interactable from either side
  (radius 1.0): "Close door". Closing it with Jon inside → `bedroomDoor.close()`, tick 2, Jon `trapped`:
  `pound_door` + `bedroomDoor.rattle()`, `j_trapped_1..3` ("Hey! The door's stuck!", **[N]** "Garfield, open this
  door!", "Hello? Anybody? …Anybody with thumbs?"). He stays trapped until the win.
- If Garfield is inside the bedroom when he closes it, he's trapped with Jon → Jon just lets him out ("Out you go,
  mister") and opens the door; re-arm. Simple rule: the door only "traps" when Garfield is outside it.
- Re-arm: if the 14 s of investigating ends with the door open, Jon goes back down to his chair; 1 more bed scratch
  re-triggers him.
- Hints: "Jon loves his bed. Almost as much as I love his dinner.", "If I scratch up his bed, he'll come running
  upstairs…", "Shred the bed, wait for Jon to go in, then close the door on him!"

### L9 — "Belly Quake" (meatloaf)
Objectives: ☐ Bump the table from underneath (0/3) · ☐ Walk under Jon's chair · ☐ Eat Jon's meatloaf
- Under the table (xz inside the table footprint): each jump → Garfield `belly_bounce`, `table.bump(0.6)`, plates
  rattle, Jon `j_bump_1..3` ("Earthquake?!", "Did the table just… hop?", "I'm sure it's nothing."). Garfield can't rise
  above 0.55 m there (a ceiling clamp). 3 bumps → tick 1.
- Then walk under Jon's chair (xz within 0.4 m of the seat centre) → `chair.bounce()`: Jon is launched up, lands
  back, then `stunned_shake` + dizzy for 18 s (`j_stunned` "Wobble… wobble… is the room spinning?"). Tick 2.
- Jump onto the table (Jon doesn't guard while stunned), eat → win.
- Out of order: under-chair before 3 bumps → the chair creaks, `g_l09_early` "Not loose enough yet. More belly power
  needed."
- Re-arm: after the stun, the chair works again (one more walk under it; the bumps stay done).
- Hints: "This table is wobbly. And I am… substantial.", "If I jump under the table enough, things will start
  shaking.", "Bump the table 3 times from below, then walk under Jon's chair!"

### L10 — "The Fridge Job" (lasagna) — chapter finale
Objectives: ☐ Knock the vase off the windowsill · ☐ Scratch Jon by the broken vase · ☐ Open the fridge · ☐ Eat the lasagna
- After the L10 extra cutscene, the pan is in the fridge and Jon sulks on the lounge chair (`sit`, an arms-folded idle
  line every 12 s: "I'm fine. Totally fine. Not hungry at all.").
- Sill → scratch the vase → shatter, tick 1. Jon gets up, walks over: `j_vase_see2` "Not my OTHER good vase!",
  investigates by the fragments (20 s).
- Scratch Jon while he's within 2.5 m of the fragments (any zone; it's forced to `leg`) → `hop_leg` → he hops onto the
  fragments → `slip_faceplant` (`j_slip` "Whoa—whoa—WHOAAA!") → `lie_still` face-down (`j_faceplant` "Mmmph."). Tick 2.
  He stays down (motionless, with a small comic "zzz"/stars) until the win.
- Fridge front: interact → `fridge.open()` + light, tick 3. Pan visible → interact "Eat" → eat → win, and the chapter
  is complete (core shows the chapter-complete celebration).
- Out of order: opening the fridge before Jon is down → `j_fridge_hey` "Hey! I can SEE you!" and Jon chases (10 s),
  and the fridge auto-closes. Scratching Jon far from the fragments → a normal reaction/chase.
- Re-arm: if he finishes investigating, `j_vase_spare2` "Second spare vase. I buy them in bulk." The vase resets.
- Hints: "That vase is back. Jon never learns.", "If Jon's busy by the broken vase… a little scratch might trip him
  up.", "Knock the vase off, scratch Jon next to the pieces, then raid the fridge!"

## 5. Barks (js/game/barks.js)

- **Idle**: no input for 8 s → a random `g_idle_*` (then the next idle bark ≥14 s later). While Jon is seated, also
  a random `j_eat_*` every 15–25 s; while wandering, `j_wander_*`.
- **Context** (priority over idle): `g_near_<food>` (within 1.5 m of the food the first time and every 30 s),
  `g_jumpfail_*` (jumped at a surface and fell back), `g_scratch_hit_*`, `g_scratch_miss_*`, `g_chased_*` (chase
  start, then every 4 s), `g_escape_*` (reaching high ground mid-chase), `g_jon_gaveup_*`, `g_paper_hit_*`
  (knocked back), `g_paper_dodge_*`, `g_caught_*`, `g_win_*`, `g_guarded_*`.
- Rate limits: a global 3.5 s gap between barks; the same key is never repeated back-to-back; each category picks
  from a shuffled bag (no repeats until it empties); voice is via `audio.vo(key)`, and the bubble is via `ui.say`
  (Garfield `thought:true`).
- **[N]** lines: when a custom Jon/Garfield name is set, play the `_nn` key; subtitles substitute the name.

## 6. Full VO / bark list

Format: `key` — who — text. (who: G = Garfield thought, deadpan/lazy; J = Jon aloud, cheerful/nerdy/flustered)

### Cutscenes
- `j_intro_1` J "Ahh. A quiet evening, a perfect steak, and absolutely no interruptions."
- `g_intro_1` G "Interruptions are my specialty."
- `j_intro_2` J [N] "GARFIELD!" — `j_intro_2_nn` "HEY! MY STEAK!"
- `j_open_bowl_1` J "Here you go, buddy! Crunchy cat biscuits, your favourite!"
- `j_open_bowl_2` J "Dinner is served! One bowl of healthy, nutritious biscuits!"
- `j_open_bowl_3` J "Biscuits for you, and something special for me!"
- `j_open_steak` J "And for me: steak, peas and mashed potatoes!"
- `j_open_lasagna` J "And for me: a big slice of lasagna, fresh from the pan!"
- `j_open_meatloaf` J "And for me: meatloaf. Plain, simple, honest meatloaf."
- `g_open_spit_1` G "Blech. Crunchy disappointment."
- `g_open_spit_2` G "These taste like a cardboard box had a sad day."
- `g_open_spit_3` G "Healthy. Ugh. My least favourite flavour."
- `g_open_spit_4` G "Nope. My tongue has filed a complaint."
- `g_open_plan_steak` G "Steak, peas and mash. Well, the steak and mash, anyway."
- `g_open_plan_lasagna` G "Lasagna. My true love. My destiny."
- `g_open_plan_meatloaf` G "Meatloaf. Not fancy. Still mine."
- `j_l10_1` J "You won't let me eat my food; I won't let you eat my food. Fine, I just won't eat."
- `j_l10_2` J "There. Safe and sound. Nobody's eating tonight."
- `g_l10_1` G "Nobody? Challenge accepted."
- `j_l10_sulk_1` J "I'm fine. Totally fine. Not hungry at all."
- `j_l10_sulk_2` J "My tummy is rumbling. I'm ignoring it."
- `j_l10_sulk_3` J "This is a very nice chair. I love sitting here. Not eating."

### Catch cutscene
- `j_catch_1` J "Gotcha!" · `j_catch_2` J "Bad kitty!" · `j_catch_3` J "Not my dinner, mister!"
- `j_catch_4` J "Back to your biscuits!" · `j_catch_5` J "Newspaper of justice!"
- `g_caught_1` G "Ow. My dignity." · `g_caught_2` G "Worth it." · `g_caught_3` G "I'm flat. Still hungry, though."
- `g_caught_4` G "I'll allow it. This time." · `g_caught_5` G "That was the sports section. Rude."

### Jon reactions
- Leg: `j_leg_1` "Ow ow ow! My leg!" · `j_leg_2` "Yeowch! That was my good leg!" · `j_leg_3` "Hop… hop… OUCH!"
- Face: `j_face_1` "Aah! My face!" · `j_face_2` "Not the face! Anything but the face!" · `j_face_3` "I can't see! …Okay, I can see."
- Newspaper: `j_paper_1` "Newspaper time!" · `j_paper_2` "Special delivery!" · `j_paper_3` "Incoming!"
- Paper fetch: `j_paper_fetch_1` "Now where did my paper go…" · `j_paper_fetch_2` "I hadn't even read the comics yet."
- Butt: `j_butt_1` "Yow! My behind!" · `j_butt_2` "Hey! That's private property!" · `j_butt_3` "Not the pants! These are my good pants!"
- Chase: `j_chase_1` "Come back here!" · `j_chase_2` "You can't outrun me! …Can you?" · `j_chase_3` "Slow down, you fuzzball!"
  · `j_chase_4` "I just want to talk! With a newspaper!" · `j_chase_5` [N] "Garfield, stop!" (`_nn` "Kitty, stop!")
  · `j_chase_6` "I'm faster than I look! …Wheeze."
- Glare (Garfield up high): `j_glare_1` "Get down from there!" · `j_glare_2` "I can wait. …I can't wait." · `j_glare_3` "No fair! I can't jump that high!"
- Give up: `j_giveup_1` "Fine. Stay up there." · `j_giveup_2` "I'll get you next time." · `j_giveup_3` "I'm too tired for this." · `j_giveup_4` "Phew. Cardio."
- Off the table: `j_offtable_1` [N] "Garfield! Off the table!" (`_nn` "Hey! Off the table!") · `j_offtable_2` "Paws off my plate!" · `j_offtable_3` "Shoo! This is people food!"
- Back to dinner: `j_back_1` "Now, where was I? Oh right. Dinner." · `j_back_2` "Peace and quiet at last."
- Lost food: `j_lost_1` "My dinner! Again!" · `j_lost_2` "Why does this always happen to me?" · `j_lost_3` "I guess it's cereal for dinner. Again."
- Investigate: `j_huh_1` "Hmm?" · `j_huh_2` "What was that noise?" · `j_huh_3` "Hello? Who's there?"

### Jon idle (eating / wandering)
- `j_eat_1` "Mmm, delicious." · `j_eat_2` "Best. Dinner. Ever." · `j_eat_3` "Nom nom nom." · `j_eat_4` "Now THIS is living."
- `j_eat_5` "I should cook this more often." · `j_eat_6` "Don't even think about it, buddy."
- `j_wander_1` "La la la, dinner time soon!" · `j_wander_2` "Where did I put my glasses? …Oh, they're on my face."
- `j_wander_3` "Should I vacuum? …Nah." · `j_wander_4` "What a lovely evening." · `j_wander_5` "Note to self: hide the lasagna better."
- `j_wander_6` "I wonder if the TV has anything good on." · `j_wander_7` "Who left cat hair on the sofa? …Oh. Right."
- `j_dinner_time` "Dinner time! Finally!"

### Level specific (Jon)
- L2: `j_chair_crack` "Huh? What's that crunchy noise?" · `j_chair_fall` "Whoa-whoa-WHOA!" · `j_chair_floor` "Ow. Hello, floor."
- L3/L10: `j_vase_hear` "What was THAT?!" · `j_vase_see` "My good vase! In a million pieces!" · `j_vase_sweep` "Where did I put that broom…"
  · `j_vase_spare` "Good thing I keep a spare vase." · `j_vase_see2` "Not my OTHER good vase!" · `j_vase_spare2` "Second spare vase. I buy them in bulk."
- L4: `j_curtain_hear` "Is something ripping?" · `j_curtain_see` "My CURTAINS! They were on sale!" · `j_curtain_fix` "Maybe if I hold this bit up… nope."
- L5: `j_pan_gone` "Wait… where's my pan?"
- L6: `j_fling_1` "HEY! My dinner!" · `j_fling_2` "Five-second rule! Five-second rule!" · `j_fling_save` "Saved it! Ha!"
- L7: `j_cold_1` "Brrr! Why is it suddenly freezing?!" · `j_cold_2` "Who opened the window?" · `j_cold_3` "Much better. Brrr." · `j_shoo` "Shoo, off the sill!"
- L8: `j_bed_hear` "What's going on up there?" · `j_bed_see` "My BED! My comfy, cosy bed!" · `j_trapped_1` "Hey! The door's stuck!"
  · `j_trapped_2` [N] "Garfield, open this door!" (`_nn` "Kitty, open this door!") · `j_trapped_3` "Hello? Anybody? …Anybody with thumbs?" · `j_letout` "Out you go, mister."
- L9: `j_bump_1` "Earthquake?!" · `j_bump_2` "Did the table just… hop?" · `j_bump_3` "I'm sure it's nothing." · `j_stunned` "Wobble… wobble… is the room spinning?"
- L10: `j_slip` "Whoa—whoa—WHOAAA!" · `j_faceplant` "Mmmph." · `j_fridge_hey` "Hey! I can SEE you!"

### Garfield barks (thoughts)
- Idle: `g_idle_01` "I'm not lazy. I'm in energy-saving mode." · `g_idle_02` "If I sit still long enough, maybe dinner comes to me."
  · `g_idle_03` "Is it nap time? It feels like nap time." · `g_idle_04` "I could do something. Or… not."
  · `g_idle_05` "My tummy is talking. It says 'more'." · `g_idle_06` "I need a snack, to give me strength to find a snack."
  · `g_idle_07` "A diet is just a sad word for 'less food'." · `g_idle_08` "Exercise? I thought you said extra pies."
  · `g_idle_09` "I'll get up in five minutes. Or fifty." · `g_idle_10` "Time is just the gap between meals."
  · `g_idle_11` "I'm not fat. I'm fluffy with ambition." · `g_idle_12` "This floor is comfy. I live here now."
  · `g_idle_13` "Somebody should do something. Not me, though." · `g_idle_14` "Waiting is hungry work."
  · `g_idle_15` "Yawn. Being this adorable is exhausting." · `g_idle_16` "Jon's dinner won't eat itself. That's my job."
  · `g_idle_17` "A cat's gotta do what a cat's gotta eat." · `g_idle_18` "Hello? Food? Where are you hiding?"
  · `g_idle_19` "I could chase my tail. But then I'd have to catch it." · `g_idle_20` "Cat biscuits. The saddest two words."
  · `g_idle_21` "Is it Monday? It feels like a Monday." · `g_idle_22` "Hmm. Thinking about lasagna. As usual."
- Near food: `g_near_steak` "Steak? Don't mind if I do." · `g_near_lasagna` "Lasagna. Hello, gorgeous." · `g_near_meatloaf` "Meatloaf. Plain. Boring. MINE."
  · `g_near_1` "So close I can taste it. Because I'm about to." · `g_near_2` "Come to papa."
- Guarded: `g_guarded_1` "He's watching. I need a distraction." · `g_guarded_2` "Not while he's looking. Too risky." · `g_guarded_3` "First, a little chaos. Then dinner."
- Jump fail: `g_jumpfail_1` "Gravity. My oldest enemy." · `g_jumpfail_2` "That was a warm-up." · `g_jumpfail_3` "I meant to do that." · `g_jumpfail_4` "Too much cat, not enough jump."
- Scratch hit: `g_scratch_hit_1` "Sorry. Not sorry." · `g_scratch_hit_2` "Claws: one. Jon: zero." · `g_scratch_hit_3` "That's for the cat biscuits." · `g_scratch_hit_4` "Oops. My paw slipped. On purpose."
- Scratch miss: `g_scratch_miss_1` "Swing and a miss." · `g_scratch_miss_2` "Just stretching." · `g_scratch_miss_3` "Practising. Obviously."
- Chased: `g_chased_1` "Run away! Slowly!" · `g_chased_2` "Cats don't run. We relocate. Quickly." · `g_chased_3` "I regret nothing! Except the running."
  · `g_chased_4` "He'll never catch me. Probably." · `g_chased_5` "Legs! Do your thing!" · `g_chased_6` "Up high! Jon can't jump!"
- Escape: `g_escape_1` "Ha. Jons can't jump." · `g_escape_2` "Up here, I'm untouchable." · `g_escape_3` "Enjoy the view, Jon."
- Jon gave up: `g_gaveup_1` "And the cat wins again." · `g_gaveup_2` "Too easy." · `g_gaveup_3` "Better luck next time, pal."
- Newspaper hit: `g_paper_hit_1` "Ow. Read all about it." · `g_paper_hit_2` "That was a strongly worded newspaper." · `g_paper_hit_3` "Hit by the comics section. Ironic."
- Newspaper dodge: `g_paper_dodge_1` "Missed me!" · `g_paper_dodge_2` "Too slow, paperboy."
- Win: `g_win_1` "Mmm. Worth every second." · `g_win_2` "Delicious. Are there seconds?" · `g_win_3` "Victory tastes like gravy."
  · `g_win_4` "Belly: fuller. Life: better." · `g_win_5` "Burp. Pardon me." · `g_win_6` "Now THAT is what I call a heist."
- Tutorial: `g_tut_1` "Okay. Sneaking lesson. It's like napping, but with walking." · `g_tut_2` "Jon's wandering around. Let's practise on him."
  · `g_tut_3` "He's sitting down to eat. Showtime."
- Level-specific: `g_l02_frontleg` "Wrong leg. The back ones hold up the Jon." · `g_l05_miss` "Too early. Or too late. Timing is hard."
  · `g_l09_early` "Not loose enough yet. More belly power needed." · `g_l05_grab` "Me Tarzan. You lasagna."
- Hints (3 per level): `l01_hint_1..3`, …, `l10_hint_1..3` (G), with the text listed in §4.

## 7. Implementation notes (as built — these supersede the numbers above where they differ)

- Code: `js/game/jonAI.js` (Jon), `js/game/barks.js`, `js/game/lines.js` (every line; media's manifest extends the
  families), `js/game/newspaper.js`, `js/game/marker.js` (golden paw goal marker), `js/game/shots.js` (unblocked
  cutscene cameras), `js/levels/common.js` (`defineLevel` runtime + opening/intro cutscenes), `js/levels/shared.js`
  (sill, vase + spare-vase re-arm), `js/levels/lNN.js`.
- **The goal marker is always on** (not only after the first hint). It points at the next step and fades out when
  the camera is close to it. It's hidden during cutscenes.
- Each level's `canEat` needs that level's own trick: a random chase is NOT an eating window (otherwise
  "scratch his leg, eat while he chases" would skip every level's design). L8 needs Jon actually shut in.
- Jon's newspaper: the distraction lasts ≥ 8 s from the throw (he picks the paper up and smooths it out), then he
  walks back to his chair.
- Chase: a 0.7 s wind-up ("Come back here!") before Jon runs, so a cat standing right next to him gets a head
  start. Jon runs at 2.55 m/s vs Garfield's 3.3 (±10% belly).
- L5 swing: it uses the vine prop's own pendulum (ceiling hook) at 80% speed. Time runs at 40% while Garfield is
  over the pan (catch radius 0.65 m), and a press up to 0.3 s late still counts. There are 6 passes before he lands
  back on the fridge to retry. The climb route is computed from the colliders (counter → microwave → fridge top).
  If a layout ever breaks it, the level adds a bread bin step.
- L2/L9: Jon is parented to `chair.seat` while seated (the jon lane's convention), so `chair.fallBack()` and
  `chair.bounce()` carry him. L9's head-bumps come from core's `bonk` event (plus a jump-under-table fallback).
- Opening cutscene cameras use the house's `cam_dining`/`cam_bowl` and blocker-aware `bestShot`. The intro uses
  `cam_culdesac` → `cam_culdesacLow` → `cam_houseFront` → `cam_porch` → `cam_frontDoor` → fade → `cam_dining`.
- Testing: `node tools/sim/play.mjs 1-10 --shots=DIR` (all 10 PASS), `node tools/sim/play.mjs catch` (leg→hop→
  chase→catch cutscene, butt→chase→escape onto the sofa→glare→give up, face→newspaper knockback: PASS), and
  `node tools/sim/cutscenes.mjs <intro|N> --shots=DIR` for cutscene frames. The scripts start and stop their own
  headless Chrome on :9408.
