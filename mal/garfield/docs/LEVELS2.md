# Garfield: Hungry Heist — Wave 3 level design (owner: game)

docs/BRIEF2.md is the design. This file only fills gaps: triggers, timings, fail-safes, re-arming, hints and the
VO keys. Lines in **"quotes marked (verbatim)"** come straight from the child's brief and must stay exact.
Everything in docs/LEVELS.md §0 (catch cutscene, hints after 20 s, the golden goal marker, out-of-order steps only
give a hint, nothing bad ever happens to Garfield) still applies unless stated here.

VO key prefixes: `g_` Garfield (thought), `j_` Jon, `l_` Lyman, `o_` Odie (dog noises only: the text is the
onomatopoeia for the subtitle, the audio is a dog sound), `d_` delivery man. Chapter Two keys start `c2_`, free play
`fp1_` / `fp2_`, arena `ar_`. **[N]** = speaks a character name → a `_nn` name-free alternate exists (D2).

## 0. Code map

| file | what |
|---|---|
| `js/core/save.js` | `garfield_hh_v1`, migrated additively (§8) |
| `js/core/game.js` | level ids: `1`..`10` (Ch1, unchanged), `c2:1`..`c2:10`, `fp1`, `fp2`, `arena`. `?level=` takes any of them |
| `js/levels/ch2/*.js` | `story.js` (Ch2 opening), `c2_01.js`..`c2_10.js`, `common2.js` (defineLevel2: no food guard; multi-human) |
| `js/levels/freeplay1.js`, `freeplay2.js` | free play sessions (§6, §7) |
| `js/game/humanAI.js` | Jon + Lyman (generalised jonAI; Ch1 keeps using jonAI.js untouched, so Ch1 can't regress) |
| `js/game/odieAI.js` | Odie: idle/pant/sit/follow/flee-to/launched/flattened/arena |
| `js/game/arena.js` | the arena match (L7 tutorial + menu mode) |

Missing art degrades gracefully (core's stub pattern): no Odie/Lyman actor yet → a simple placeholder body with the same
API; a missing clip → `idle`; a missing prop → a placeholder box (or the step is skipped with the same lines).

## 1. Chapter One Free Play (`fp1`)

Unlocks per D14 when all 10 Ch1 levels are done. No objectives; the HUD shows a small "Free Play" tag instead of the
checklist and the goal marker is off. Food on the table = random of steak / lasagna / meatloaf each session.

**Jon's day** (repeats, random order, never the same activity twice running):
- *Wander* (`wander` route, 40–70 s) with `j_wander_*` and new `fp1_j_wander_*` lines.
- *Sit at the table, NOT eating* (30–50 s): sits in his chair, `sit` clip (reads the paper / taps the table),
  `fp1_j_sit_*` lines ("Just going to sit here. Not eating. Totally relaxed."). He doesn't guard; the food is fair game
  only while he's away from the table (see eating).
- *Sulk in the lounge chair* (20–30 s, `j_l10_sulk_*`).
- *Look out of the window* / *check the fridge* (short idles).

**Everything from Chapter One works, with no objective and no win:**
| trick | result in free play | recovery |
|---|---|---|
| scratch leg / butt | hop / cover → 10 s chase → catch cutscene or give up (exactly Ch1) | — |
| scratch face | cover_face → newspaper throw → fetch (Ch1) | — |
| scratch a back chair leg (Jon seated) | breakLeg → fall_back_chair (L2) | **knocked out 10 s**, rights the chair |
| **vine swing over seated Jon** | climb to the fridge top, grab the vine (L5); while the tip is over Jon's head a "SCRATCH!" prompt shows; Scratch/Space → face hit → **fall_back_chair** (same as the chair-leg fall) | knocked out 10 s |
| knock the vase (sill) | crash; Jon comes to look (L3) | spare vase after he leaves |
| scratch Jon next to the shards | hop → slip → faceplant (L10) | **knocked out 10 s** |
| shred the curtains (4 scratches) | Jon comes to look (L4) | curtains mended after 60 s |
| open the window (sill) | breeze; Jon closes it (L7) | — |
| shred Jon's bed (3) → Jon goes up → close the door | trapped (L8): pounds the door | **escapes after 60 s or when Garfield opens the door** |
| bump the table ×3 + walk under the seated chair | bounce → stunned (L9) | **recovers after 10 s** |
| bedroom door | Garfield can open / close it any time (interact) | — |
| fridge | Garfield can open / close it (interact). Nothing else happens (D21) | — |
| eat the food | allowed whenever Jon is not seated at the table or is knocked out / trapped / distracted; belly +0.1, `g_win_*` | the plate refills the next time Jon sits ("Good thing I made extra." `fp1_j_refill`) |

Knockout = any of: chair fall, faceplant, stunned. Every knockout lasts exactly 10 s, then Jon gets up
(`fp1_j_recover_*`), and goes back to his day. Trapped = 60 s or the door opens (`fp1_j_free_*`).
Exit via ⏸ → Exit (back to the Ch1 level select). Start Over restarts the session.

## 2. Chapter Two opening cutscene ("story", D15)

Plays automatically the first time Ch2 is opened; ▶ Story on the Ch2 screen replays it. ~60 s, skippable.
1. Dining shot. Jon sits at the table (no food), Garfield sits on the table (`sit_table`). Jon, chin on hand:
   `c2_j_story_1` **"My cat may be a naughty rascal, but I will always love him, as he is still an amazing cat. I just
   can't help but think a dog might have been better..."** (verbatim)
2. Both bored: Garfield `idle_bored` yawn, Jon `sigh` (2 s). `g_c2_story_bored` "A dog. Hilarious. Wake me when it's
   lunch."
3. `doorbell` sfx. Jon gets up, walks to `frontDoor`, opens it (frontDoor `open()` if the prop supports it, else the
   camera hides it). Lyman stands on the `doorStep` with a suitcase.
   `c2_j_story_lyman` **"Lyman!"** (verbatim) · `c2_l_story_jon` **"Jon."** (verbatim) ·
   `c2_l_story_cold` **"I'm cold. I'm hungry. I'm weak. Take me in!"** (verbatim, Lyman `dramatic`) ·
   `c2_j_story_home` **"Sure, Lyman. You know my home is your home."** (verbatim) ·
   `c2_g_story_sandbox` **"And my sandbox is off limits."** (verbatim, thought; cut to Garfield on the table) ·
   `c2_j_story_suitcase` **"Is that all you have, the one suitcase?"** (verbatim) ·
   `c2_l_story_hereboy` **"Not exactly. HERE BOY!"** (verbatim)
4. Odie gallops in (`gallop_goofy`, `o_bark_happy`), runs circles round Jon's legs.
5. Garfield hops off the table, walks to a room corner (`head_in_corner`):
   `c2_g_story_lawsey` **"Oh, Lawsey, Lawsey, Lawsey."** (verbatim)
6. `c2_l_story_odie` **"This is Odie."** (verbatim)
7. Odie jumps on the table, runs across it (`run`) and straight off the far edge, falls and lands head-first
   (`land_head`, `boing`, dazed tongue-out). Garfield turns to look:
   `c2_g_story_tweedledee` **"Ten billion dogs in this world, and I get Tweedledee the wonder dummy."** (verbatim)
8. Fade → Ch2 level select (10 levels, L1 unlocking with the usual animation, Free Play locked on the side).

## 3. Chapter Two shared rules

- **Controls** identical to Ch1. **Two humans**: Jon and Lyman (D18). Scratching either one → that person reacts
  exactly like Ch1 Jon (leg/face/butt); a chase is **both** of them for 10 s ("Naughty Garfield!" when it's a level
  trigger). Lyman can't climb either. The catch cutscene is whichever human reaches him (`c2_l_catch_*` for Lyman).
- **Odie** never hurts Garfield outside the arena. He pants (`idle_pant`), wanders near his spot, sniffs. Scratching
  Odie outside a level's step: `yip_flee` 2 m away, comes back after 4 s, `g_c2_odie_scratch_*` bark. No progress.
- No food guard rule in Ch2 except L1's (and only before its trick).
- Win = a "Level Complete!" (belly +0.15 only on eating levels L1; others +0). Ch2 L10 → Chapter Two complete card.
- Hints: 3 per level (`c2_l0N_hint_1..3`), same timing as Ch1. The goal marker is on.
- Every level re-arms: a step done "too early" or interrupted resets that step, never earlier ones.

Food per level: L1 steak ×2 + Odie's bowl · L3 chicken soup (Jon) · L4 meatloaf (Jon, diet cutscene) · L6 coffee
(Lyman) · the rest: no food.

## 4. Chapter Two levels

### C2 L1 — "Double Dinner" (steak ×2)
Intro cutscene (like Ch1's opening): Jon gives Garfield his biscuits (`j_open_bowl_*`); Garfield sniffs:
`c2_g_l1_hungry` "I'm extra, extra hungry today. Even biscuits look good." Lyman puts Odie's bowl of plain dog
biscuits at `odieBowl` (`c2_l_l1_bowl` "Dinner, Odie! Plain dog biscuits, your favourite!"), Odie eats (`eat`).
Jon and Lyman sit at the table (`jonSeat`, `lymanSeat`), steak/peas/mash on both plates
(`c2_j_l1_steak` "Steak for two! Dig in, Lyman." · `c2_l_l1_steak` "Don't mind if I do. And if I do again.").
Objectives: ☐ Eat your biscuits · ☐ Jump on Jon and Lyman's food · ☐ Eat both dinners (0/2) · ☐ Scratch Odie ·
☐ Eat Odie's food
- Eat biscuits: interact at `catBowl` → Garfield `eat` (bowl `eaten(t)`), `c2_g_l1_biscuits` "Crunchy. Bland. Gone."
- Jump on food: land on the table within 0.6 m of either plate (after the biscuits). Both humans: `shock`,
  `c2_j_l1_ew` **"Ew!"** + `c2_l_l1_ew` **"Ew!"**, stand up: `c2_j_l1_nomore` "Cat feet in my peas. I don't want it
  anymore." · `c2_l_l1_nomore` "I've lost my appetite. And I never lose my appetite." They leave the plates and sit on
  the sofa (`sofaSeatL`/`sofaSeatR`) with `watch_tv` for the rest of the level.
  Before the biscuits: Ch1 guard rule (warn `c2_j_offtable` / `c2_l_offtable`, catch after 5 s) and the hint "biscuits
  first".
- Eat both: each plate is its own "Eat!" (2.4 s), counter 1/2 → 2/2.
- Scratch Odie (by his bowl): `yip_flee`, `o_yip`, he runs upstairs into Lyman's room (`lymanRoom`) and stays.
  Before both plates are eaten, an Odie scratch is the generic flee-and-return.
- Eat Odie's food: interact at `odieBowl` (after he's fled) → `c2_g_l1_dogfood` "Dog food. Don't tell anyone." → win.
- Humans chase if scratched (both, 10 s), then back to the sofa.
- Hints: `c2_l01_hint_1` "My bowl first. A cat needs fuel to cause trouble." · `_2` "If I step in their dinners, they
  won't want them." · `_3` "Biscuits, table, both plates, scratch the dog, eat his food."

### C2 L2 — "Lights Out" (no food)
Intro: Jon + Lyman on the sofa watching TV; Odie runs laps on the table panting (`gallop_goofy` on the tabletop).
`c2_g_l2_intro` **"I think I'll put this dog's lights out."** (verbatim). Cut: Odie now sits at the table edge
(`sit_pant`, anchor `odieTableEdge`).
Objectives: ☐ Scratch Odie off the table · ☐ Run from Jon and Lyman · ☐ Knock the vase onto Odie ·
☐ Run from them again · ☐ Open the cupboard under the stairs · ☐ Scratch open the dog biscuits · ☐ Shut Odie in
- Scratch Odie while Garfield is on the table → Odie flies off (`launched` short arc), `land_head`, `o_yip`, runs to the
  sofa. Both humans: `c2_j_naughty` **"Naughty Garfield!"** + `c2_l_naughty` **"Naughty Garfield!"** (verbatim; **[N]**)
  → both chase 10 s. Survive (or get caught: the catch cutscene also ticks it — nothing bad happens) → tick.
  They go back to the telly (`c2_j_l2_telly` "Back to the telly.").
- Odie trots to below the windowsill (`odieSill`, `sit_pant`). Garfield on the sill scratches the vase → it falls on
  Odie (`hit`/`dizzy` 1 s), `o_yip`, he runs to the sofa → both say "Naughty Garfield!" again and chase 10 s → tick.
  Vase knocked while Odie isn't under it yet: crash, no yip; spare vase after 8 s (`c2_g_l2_vase_miss` "Missed. Need a
  dog under it.").
- Odie goes back to sitting by the stairs. The under-stair cupboard: interact `cupboardDoor` → opens (tick). Inside:
  the `biscuitBox`; scratch it → `burst()`, biscuits spill (tick), `c2_g_l2_biscuits` "Here, doggy doggy."
- Odie hears it: `o_bark_happy`, runs into the cupboard (`cupboardInside`) and eats (`eat`, panting).
  Garfield (outside the cupboard) interacts with the door → closes it → tick → win (`o_whine_muffled`,
  `c2_g_l2_win` "Lights out, dog. Enjoy the snack.").
  Closing while Garfield is inside is disabled (prompt hidden). If the door is closed before Odie's inside, he waits
  outside and barks; re-open it.
- Hints: "That dog's on the edge of the table. Literally.", "Vase plus dog, from the windowsill.", "Open the cupboard
  under the stairs, scratch the biscuit box, shut him in."

### C2 L3 — "Disco Inferno" (Jon: chicken soup)
Intro: Garfield eats biscuits at his bowl; Odie creeps up behind and barks (`o_bark`); Garfield `startled_jump`,
then `meow_loud` at Odie (`yowl`); Odie `yip_flee` up to Lyman's room. `c2_g_l3_intro` "Next time, I bite."
Cut: Jon at the table with a bowl of chicken soup (`eat_soup`). Lyman is upstairs (door shut).
Objectives: ☐ Splash Jon's soup · ☐ Shed all over Lyman's disco suit
- Interact with the soup (on the table within 0.6 m of `soupBowl`): Garfield paw-taps (`interact`), `soupBowl.splash()`
  → splatter + Jon `spilled_on`: `c2_j_l3_splash` "AAH! Hot soup! Hot soup!" → tick. Jon goes to the bench to dab
  himself with a towel (12 s), then sits back (no chase).
- Then Lyman comes out of his room in the white disco suit (`outfit:'disco'`), struts down the stairs to the
  living room (`c2_l_l3_disco` "Make way! Lyman's got his dancing pants on!"), and dances (`dramatic` / strut loop) by
  the TV. `c2_g_l3_suit` "A white suit. On a man who lives with a cat. Bold."
- Shed: Garfield walks against Lyman's legs (within 0.45 m of his feet while moving or rubbing) → a shed meter on the
  objective fills 0 → 100% over ~3 s of contact (`shed` puffs, fur on the suit via `lyman.setFur(t)`).
  At 100%: `c2_l_l3_furry` "My SUIT! I look like a yeti in a disco!" → win.
- Hints: "Jon's soup looks splashable.", "Lyman's dressed in white. And I'm made of orange.", "Rub against Lyman's legs
  till his suit's covered in fur."

### C2 L4 — "Diet Time" (Jon: meatloaf)
Intro: Jon at the table eating; Garfield walks along the table; at the middle `table.warp(1)` sags it to the floor
(creak, `boing`). Jon `eyes_widen`: `c2_j_l4_diet` **"Diet time,"** (verbatim; subtitle "Diet time,"). Garfield
`seethe` light: `c2_g_l4_cranky` "Diet. The ugliest four-letter word. I need to take it out on someone." The table
springs back. Jon + Lyman leave by the front door for work (`c2_j_l4_work` "Off to work! Be good, you two!") and are
hidden for the level. Odie stands beside the table (`odieTableSide`).
Objectives: ☐ Jump onto the windowsill · ☐ Open the window · ☐ Scratch Odie towards the window · ☐ Scratch Odie from
higher up
- Sill + open the window (Ch1 L7 interaction, but nobody comes to close it).
- Scratch Odie on the floor (from any side; he's turned so the window is in front of him): `launched` arc toward the
  window, `stuck_wall` splat on the wall BELOW the window, slides down (`boing`). `c2_g_l4_drat` **"Drat. He usually
  lands in the neighbour's lawn. This diet has got me weak."** (verbatim) → tick. Odie `o_yip`, jumps onto the table
  and stands there.
  Before the window is open: the scratch gives the same splat but no tick (`c2_g_l4_shut` "Window's shut. Even I know
  that.").
- Garfield on the table: `c2_g_l4_higher` **"Maybe if I scratch him from higher he will go higher."** (verbatim, when he
  first lands on the table with Odie on it). Scratch Odie → he flies out of the open window, yipping
  (`o_yip_long`), → tick → win (`c2_g_l4_win` "And stay out. Or come back. Whatever. Bye.").
- Hints: "That window is a perfect dog-shaped exit.", "Open the window first. Then aim the dog.", "Scratch Odie from the
  table so he flies higher."

### C2 L5 — "Special Delivery" (no food)
Intro: knock (`knock`/`doorbell`). Jon opens the door; delivery man (`createHuman({kind:'delivery'})`) hands him a box
(`hand_over`): `d_l5_sign` "Delivery for Arbuckle! Sign here." · `c2_j_l5_tv` **"Oh, goodie, the new TV!"** (verbatim).
Jon carries the box in, kneels (`unbox`), lifts out the new TV (identical CRT), swaps it with the old one, and leaves
the old TV on the floor on the carpet (`carpet` + `tvFloorSpot`). Odie runs over and stands next to the old TV.
`c2_g_l5_intro` "A new TV and an old one. And a dog. I sense an opportunity."
Objectives: ☐ Find a mouse hole · ☐ Grab cheese from the fridge · ☐ Put cheese around the house (0/3) · ☐ Grip the
carpet behind the new TV
- Mouse hole: walk within 0.8 m of any `mouseHoles` anchor (peeking mouse + `squeak`) → tick
  (`c2_g_l5_hole` "A mouse hole. Mice love cheese. Humans hate mice.").
- Cheese: interact the fridge → opens, Garfield takes cheese (`c2_g_l5_cheese` "Cheese. For the mice. Mostly.") → tick.
- Place: 4–6 `cheeseSpots` glow; interact at any 3 → a wedge appears (counter 1/3..3/3).
- At 3/3: cutscene (~8 s): mice scurry from the holes all over the house (`createMice`); Jon + Lyman see them
  (`c2_j_l5_mice` "MICE! Lyman, get the broom!" · `c2_l_l5_mice` "I don't do mice! …Fine, I do mice!") and chase them
  (`catch_mouse` lunges that miss). After the cutscene they keep chasing mice around the ground floor (distraction).
- Grip: behind the TV stand (`carpetEdge`), interact "Grip the carpet!" → Garfield `pull` → `carpet.pull()` → the old TV
  launches in an arc and lands on Odie → `flattened` (pancake, legs out). `c2_g_l5_win` "TV dinner." → win.
  Before the mice: the carpet prompt is "Too many eyes. I need a distraction." (Jon and Lyman are sitting by the TV).
- Hints: "Mice. I need mice. Where do mice live?", "Cheese from the fridge, then leave it lying about.", "Grip the carpet
  behind the new TV and PULL."

### C2 L6 — "Spit Happens" (no food)
Intro: Garfield lies on the floor: `c2_g_l6_intro` **"Well, aren't I bored today."** (verbatim). Jon and Lyman sit next
to each other on the couch (Lyman holds a coffee mug); Odie sits at the foot of the couch (`sofaFoot`).
Objectives: ☐ Go to Jon's room · ☐ Scratch Jon's drawer open · ☐ Pull out the spit-ball launcher · ☐ Spit-ball Odie
- Jon's room: enter the bedroom (upstairs, past the door) → tick.
- `breakDrawer`: 3 scratches → `break()` → reveals the `spitballLauncher` → tick (`c2_g_l6_found` "Ooh. Contraband.").
- Interact → Garfield pulls it out (`pull`), carries it (socket `back`/mouth) → tick.
- Downstairs, within 5 m of Odie with a clear line → interact "Fire!" → cutscene (~14 s):
  `thwip` → Odie hit (`o_yip`), Lyman jolts (`spill`) → coffee over Jon (`spilled_on`): `c2_j_l6_coffee` "HOT COFFEE!
  Lyman!" · Jon bops Lyman (`brawl_slap`), Lyman's flailing foot sends Odie skidding (`brawl_kick` → Odie `hit`, cartoon,
  no pain), Odie nips Lyman's trouser leg (`o_growl_play`), Lyman bonks Jon back → the big dust-cloud brawl
  (`brawl_*` loop, stars, `brawl` sfx): `c2_l_l6_brawl` "Your cat started it!" · `c2_j_l6_brawl` "My cat is UPSTAIRS!".
  Cut to Garfield on the stairs: `c2_g_l6_win` **"Much better."** (verbatim) → win.
- Firing too far/no line: `c2_g_l6_far` "Out of range. Get closer."
- Hints: "Jon keeps all sorts of junk in his bedroom drawers.", "Scratch the drawer in Jon's room open.", "Take the
  launcher downstairs and fire it at Odie."

### C2 L7 — "Arena Unlocked" (arena tutorial)
Intro: Jon's bedroom. Garfield and Odie face off (`seethe` vs `bark`), camera between them; the notification
**'Arena Unlocked'** pops at the top of the screen (big toast). `c2_g_l7_intro` "You. Me. The bedroom. Now."
Then the arena match (§5) with the tutorial on and Odie on **Very Easy**. Either result completes L7, unlocks the
main-menu Arena button (D14/D19) and plays `c2_g_l7_win` "Champion. Obviously." or `c2_g_l7_lose` "I let him win. For
his self-esteem."

### C2 L8 — "Shedding Week" (no food)
Intro: Garfield shakes (`shed`) and a heap of hair (`furPile`) drops: `c2_g_l8_intro` **"Oh goody, its shedding week.
Time for some fun."** (verbatim). Jon wanders the house; Lyman is out; Odie naps by his bowl.
Objectives: ☐ Shed on Jon's bed · ☐ Shed on the sofa · ☐ Shed on the armchair · ☐ Shed on the table
- Shed = interact in the glowing area (on/at the furniture, radius 0.9): Garfield `shed` (2 s), `poof`, the surface
  gets hair (`shedDecals(surface, 1)`). In order (the marker leads), but any order is accepted except the table, which
  is always last (it triggers the end).
- Jon reacts to finished surfaces as he wanders past (`c2_j_l8_hair_*` "Who shed on the sofa? …Oh. Right.").
- Table → cutscene: Garfield shakes hard, his whole coat comes off in a fur cloud (`setBald(true)`, pink skin), a big
  hair heap on the table. Jon walks in and looks: `c2_j_l8_bald` **"It was bound to happen, Garfield."** (verbatim,
  **[N]**) · `c2_g_l8_bald` "I feel… breezy." → win. (D20: bald for this level only.)
- Hints: "Shedding week. Jon's bed first.", "Next: the sofa. Then the armchair.", "Save the table for last. It's the big
  finish."

### C2 L9 — "Bad Mood" (no food)
Intro: `c2_g_l9_intro` **"Boy, am I in a bad mood."** (verbatim).
Objectives: ☐ Sit on the table · ☐ Poke Jon in the face · ☐ Hold Interact to glare
- Sit: on the table, interact "Sit" (or stand still 1.5 s) → `sit_table` → tick. Jon then walks down past the table:
  `c2_j_l9_morning` **"Goooood moooorrrning Garfield!"** (verbatim, **[N]**, `sing_morning`). He pauses beside the table
  for 4 s; prompt "Poke!" → `poke` → Jon `poked`: tick. Missed: he walks on, comes back 8 s later.
- Jon walks away to Lyman (at the kitchen bench): `c2_j_l9_nasty` **"Garfield's sure been in a nasty mood lately."**
  (verbatim) · `c2_l_l9_treat` **"We'll see about that. Do you know how to treat a mad cat?"** (verbatim). They walk over
  to Garfield on the table.
- Prompt "Hold to glare!" → hold Interact (Space/E/touch button) for 1.5 s, a ring fills; Garfield `seethe` with the
  intensity ramping 0 → 1 (release early = it drains). Full: Jon `frightened`: `c2_j_l9_respect` **"With great, great
  respect."** (verbatim) → tick.
- End cutscene: they back off; later Odie, Jon and Lyman sneak up behind Garfield, jump out and hug him:
  `c2_jl_l9_love` **"WE LOVE YOU GARFIELD!"** (verbatim; Jon + Lyman lines together, Odie `o_bark_happy`) → Garfield
  `hug_squeezed` → `loved` (hearts): `c2_g_l9_loved` "Okay. Bad mood cancelled. For now." → win.
- If Garfield leaves the table before the poke, the humans wait; "Sit" again resumes.
- Hints: "Sit on the table and wait for someone to annoy me.", "Poke him. Right in the face.", "Hold Interact and give
  them the full glare."

### C2 L10 — "Silent Whistle" (no food; no opening cutscene)
Objectives: ☐ Open Jon's sock drawer · ☐ Jump in and play · ☐ Sock Odie (0/3) · ☐ Run from Jon · ☐ Pick up the
whistle · ☐ Blow the whistle
- Jon's room: interact `sockDrawer` → `open()` → tick. Jump in (lands on its surface) → interact "Play" →
  `play_socks` 2.5 s, socks fly (`c2_g_l10_socks` "Socks. Warm, smelly, wonderful.") → tick.
- Odie wanders in (`sniff`). `c2_g_l10_idea` "I have an idea. A beautiful, terrible idea." Interact Odie three times
  (within 0.8 m): sock on the ears, tail, mouth (`odie.setSocks({ears, tail, mouth})`) → counter → tick.
- Odie walks out (`walk_socked`) down to the living room where Jon is: `c2_j_l10_socks` **"Garfield!"** (verbatim,
  **[N]**) → Jon chases Garfield for 10 s (Jon only) → tick when it ends (or after the catch cutscene).
- The whistle on the floor of Jon's room (`whistleSpot`) glows. Approach → `c2_g_l10_whistle` **"Hmm, a whistle."**
  (verbatim). Interact → picks it up → tick. Interact "Blow!" → `blow_whistle` (cheeks puff, a faint airy `whistle`
  puff only) → `c2_g_l10_broken` **"Must be broken."** (verbatim) → tick.
- End cutscene: Garfield tosses it over his shoulder (`throw_behind`) and saunters out; at the bottom of the stairs Odie
  is trembling terribly (`shake_scared`, `o_whimper`) with the socks still on. `c2_g_l10_end` "…Huh." → win → Chapter
  Two complete.
- Hints: "Jon's sock drawer. A cat's paradise.", "Socks… on the dog. Obviously.", "There's a whistle on Jon's floor.
  Blow it as hard as you can."

## 5. Arena (`js/game/arena.js`) — Jon's bedroom, first to 20 (D19)

- The bedroom door is shut; play area = `arenaBounds` (fallback: the bedroom box inset 0.4 m). Garfield moves/jumps as
  normal (can hop on the bed); Odie can hop onto the bed too.
- **Garfield scores** when a scratch hits Odie (cone check vs Odie's body, radius 0.45). Odie plays `hit` (knockback
  1.2 m) and is invulnerable 0.9 s.
- **Odie scores** when his `tackle` lunge connects (within 0.55 m during the lunge, Garfield not in the air above
  0.35 m). Garfield gets a comic `knockback`, invulnerable 1.2 s. Nothing else bad.
- Odie AI (difficulty table): `veryEasy` (L7): approach 1.6 m/s, tackle every 4–6 s, telegraph 1.1 s (crouch + `bark`),
  lunge 2.2 m, 45% trip (`land_head`, 2 s dizzy = free hits), dumb wander 30% of the time. `easy` (menu default):
  2.0 m/s, every 3–4.5 s, telegraph 0.85 s, 25% trip. `medium`/`hard`: shown locked "Coming soon".
- HUD: a big scoreboard top-centre `Garfield N – N Odie` (names from settings), +1 pops. First to 20 → ending card
  (`ui.popup`): win / lose, `Rematch` / `Menu` (menu mode) or `Continue` (L7).
- Tutorial (L7 only, non-blocking cards): "Scratch Odie to score!" → after the first point "Odie lunges when he crouches
  and barks. Jump or run sideways to dodge!" → after Odie's first point "First to 20 wins. Get him!". Barks:
  `ar_g_hit_*`, `ar_g_hurt_*`, `ar_g_lead_*`, `ar_g_behind_*`, Odie `o_bark`, `o_yip`, `o_pant`.
- Menu mode: Arena button → difficulty popup (Very Easy / Easy; Medium, Hard locked "Coming soon") → match → rematch.

## 6. Chapter Two Free Play (`fp2`) — event table

Unlocks when all 10 Ch2 levels are done. No objectives; only Ch2 content (Ch1 tricks only if they're also in Ch2:
the vase, the window, the bedroom door, the chase/catch). Every session rolls its **session variants**, then a director
rolls an **event** every 40–70 s (one at a time; an event ends before the next starts).

**Session variants (mutually exclusive groups; rolled once per session):**
| group | variants (chance) |
|---|---|
| Lyman's outfit | normal 70% · disco suit 30% (shedding on his legs only works in disco) |
| Garfield's coat | furry 85% · bald 15% (bald → no shedding events; `fp2_g_bald` "Still breezy.") |
| mealtime | steak dinner for two 40% · Jon's chicken soup 35% · no meal 25% |

**Events (weights; ✕ = excludes while active / mutually exclusive):**
| event | w | what | ✕ |
|---|---|---|---|
| TV time | 3 | Jon + Lyman on the sofa (`watch_tv`), Lyman with coffee; Odie at `sofaFoot`. Spit-ball launcher in Jon's drawer works → the brawl (10 s), then they make up | mice |
| dinner | 2 | (if mealtime ≠ none) both eat at the table; jump on a plate → "Ew!", they leave it → eat it (belly +0.1) | soup, TV time |
| soup | 2 | (soup mealtime) Jon eats soup → interact to splash it → he dabs off | dinner |
| delivery | 1 | doorbell, delivery man, new TV; old TV on the carpet; Odie by it → carpet pull flattens Odie | mice |
| mice | 1 | (needs cheese placed) mice run riot, both humans chase them 20 s | delivery, TV time |
| disco | 1 | (disco variant) Lyman dances by the TV; shed on his legs | — |
| good morning | 1 | if Garfield sits on the table: Jon's walk-by → poke → glare → (40%) the love hug | — |
| Odie zoomies | 2 | Odie runs laps on the table, then sits on the edge; scratch him off → land_head → yip; both "Naughty Garfield!" and chase | Odie window |
| Odie window | 1 | (window open) scratch Odie from the table → out of the window; he comes back through the front door after 20 s | zoomies |
| cupboard | 1 | biscuit box refilled; Odie can be shut in; he gets out after 60 s or when the door opens | — |
| socks + whistle | always available | sock drawer + whistle in Jon's room (Odie shakes 10 s) | — |
| table warp | 1 | if Garfield walks the length of the table while Jon eats: warp + `c2_j_l4_diet` | — |

Odie knockouts (land_head, flattened, vase, whistle shake) all recover after 10 s (`o_shake_off`). Humans' knockouts
(if any) recover after 10 s. Anything trapped/locked frees itself after 60 s or when Garfield opens the door.

## 7. Unlock ladder + save (D14)

save (`garfield_hh_v1`) gains, additively (an old save just reads the defaults):
`ch1FreeSeen` (the Free Play unlock anim was shown), `ch2MenuSeen` (Ch2 main-menu unlock anim shown), `ch2IntroSeen`,
`ch2: {levelsUnlocked:1, levelsDone:[], levelUnlockSeen:0}`, `ch2FreeSeen`, `arenaUnlocked`, `arenaSeen`,
`arenaBest: {veryEasy, easy}`.

- Ch1 all 10 done → next visit to the Ch1 screen: the side 'Coming Soon' unlock-animates and types **'Free Play'**.
- Ch1 all 10 done → next visit to the main menu: the 'Coming Soon' next to Chapter One unlock-animates into **'Chapter
  Two: Odie and Lyman'**, and a new locked **'Coming Soon'** pops in beside it.
- Opening Ch2 the first time → the story cutscene → the Ch2 select (10 levels; L1 unlock-animates; 'Free Play' locked
  on the side; ▶ Story replays the cutscene).
- Ch2 L7 complete → 'Arena Unlocked' toast (in L7's intro) and the main-menu **'Arena'** button unlock-animates on the
  next menu visit.
- Ch2 all 10 → Ch2's 'Free Play' unlocks (same animation, next visit to the Ch2 screen).
- Existing saves with Ch1 done get the animations on their next visit (nothing is pre-marked as seen).
- Settings → Reset progress clears all of it (settings kept).

## 8. Barks added in wave 3 (summary)

Lyman (`l_*`): reactions (leg/face/butt), chase, glare, give-up, catch, idle on the sofa, eating, moochy one-liners.
Jon: Ch2 idles (`c2_j_idle_*`: Lyman/Odie complaints), free play idles. Garfield: Odie barks (`g_c2_odie_*`), Lyman
barks (`g_c2_lyman_*`), free play barks (`fp_g_*`), arena barks (`ar_g_*`). Odie: `o_*` (dog noises only). The full
list lives in `js/game/lines.js` (section "WAVE 3").

## 9. As built (2026-10-09)

- Code: js/levels/ch2/{common2,story,c2_01..c2_10,index}.js, js/levels/{freeplay1,arena}.js, js/game/{humanAI,odieAI,
  arena,cast2}.js. Ch1 levels/jonAI are unchanged apart from added `export`s of helper functions.
- Ch2 levels start Garfield at `livingCentre` (open floor, so close-ups aren't blocked).
- Mid-level beats the kid must SEE (L4 wall splat / out-of-window, L5 TV, L6 brawl, L8 bald, L9 glare/hug, L10 end)
  are short skippable cuts (`L.cut`).
- Interact labels defined as getters stay live (core interact.js `labelFn`); `isHint()` shows "not yet" prompts as a
  muted pill (Space still jumps).
- Testing: `node tools/sim/play.mjs c2:1-10 | arena | fp1 | menus --port=9407` (+ Ch1 `1-10`, `catch`).
