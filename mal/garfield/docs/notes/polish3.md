# polish3 — notes (wave 3 polish: real-input Ch2 + arena, known issues, media audio check)
Owns everything except audio/*, js/audio/*, refs/*, tools/media/*. CDP port 9409.
Harness: scratchpad pt/ (playtest's run.mjs + walker.mjs), new Ch2 scripts pt/c2_*.mjs.

## DONE
- read briefs/decisions/notes; harness pt/c2lib.mjs (boot2 skip/intro, go() = real keys along navPet waypoints, flee())
- Real-input keys 1280x720 (skip=1): L1 WIN, L2 WIN, L3 WIN, L4 WIN, L5 WIN, L6 WIN, L7 WIN 20-0 (very easy), L8 WIN, L9 WIN, L10 WIN; menu Arena (easy) WIN 20-7
- L1: 2nd plate no longer repeats "One down. One to go" (random g_win line)
- css: subtitles lift above the interact pill (they overlapped "Eat!" when Jon+Lyman both spoke)
- L2: biscuit box moved to the cupboard back wall facing the door (was hidden behind the door jamb; kid couldn't see it
  from outside or from cam_cupboard). house.js anchor biscuitBox.
- L5 mice: 1.75x size, pale body, pink ears, contact-shadow disc, slight emissive; chaos cut frames them low & close
  (pack starts bunched in shot, spreads over the house after the cut; wander() keeps current positions)

- scratch assist (core/scratch.js): a registered prop/pet target beside him (≤125° off-facing, within reach) still
  takes the swipe and he turns to it. Kid pressed against the dresser sideways missed the drawer forever. Jon zones
  unchanged.
- bestShot (game/shots.js): rejects poses with a lamp in the view cone in front of the subject, and now counts low
  furniture (≥0.3 m tall) as blockers. L6 brawl was whited out by the sofa table lamp.
- halos (world/glow.js) fade out within ~0.8–2.6 m of the lens; world.lamps exposed
- floor lamp light pulled out of the corner (0.3 m) + 8→5: it burnt the corner wall white
- L6 brawl shot raised (h 0.9) to see over the sofa

- arena: mash stun-lock fixed — after D.combo straight hits (veryEasy 4, easy 3) Odie snaps straight into a bark
  telegraph + lunge, and he can't be scratched while telegraphing/lunging. Before: 20-0 in 23 s, he never attacked.
- L7 HUD: objectives panel (clashed with the scoreboard) → 'Arena · Tutorial' tag; tips drop below the scoreboard
  (hud .arena-on class)
- L8: Jon's hair lines matched the wrong furniture (bed/sofa swapped); bald cutscene: Jon used to stand INSIDE the
  table and the 2-shot camera sat inside his trousers → shots.standSpot() clear floor spot, bestShot({avoid}),
  pair framed before he walks in
- Ch2 win card: no-food levels show a smug cat + mischief cheer instead of a steak + "Delicious!"; L4 (diet) too.
  Ch2 chapter-complete card no longer says "ate ALL the food"

- L9: Poke! prompt appears 1.3 s into Jon's song (a poke on arrival cut his line off)
- controller corner slip: a graze exactly on a jamb edge computed slip 0 → stuck forever at the bedroom door; now
  always nudges
- camera: dresser yaw hint (core/camera.js yawHint) — in front of Jon's dresser (L6 drawer, L10 sock drawer, fp2)
  the follow cam swings round to face the drawers (pitch 0.5). Fixes "camera jams into the dresser".

- humanAI: humans no longer walk through shut doors on the same floor (doorBetween() vs '<door>:blocker' colliders):
  no-path fallback is "stay" instead of a straight line through the door, and a door shut in front of them mid-walk
  makes them re-plan or stop. Probed: cupboard (ground), bedroom (shut mid-walk), Lyman's door — all stop outside.
- Lyman hair/brows/moustache: cool blue-black (warm near-black read brown under the warm key)
- shed fur: soft fluffy tufts (radiating-strand clumps revealed per tuft) + smooth orange drift colour, no speckles;
  fur pile: smooth overlapping clumps with sheen (no lumpy cap / spiky sticks); carpet runner teal+cream with a dark
  soft edge so it stands out on the red rug

- fp2.mjs robustness: goodmorning ends leftover events + sends Jon wandering first and waits 50 s for the walk-by
  (from upstairs his walk alone is ~20 s; that was the 'bad mood' flake); lymanTrap60 sends Odie out of Lyman's room
  before shutting the door (Odie shut in for a minute broke the carpet/vase checks at random). Full --nosoak 44/44.

- touch 1024x768: L2 WIN, L5 WIN, L9 WIN (hold button glare), Arena easy WIN 20-6. Found: scratch button next to
  Odie did nothing when he was beside/behind Garfield → assist is now omnidirectional for non-human targets
  (Lyman's target has noAssist; Jon was never in it).
- humans fade near the lens (fade.js actors via root.userData.fadeActor, set by humanAI.createHumans, cleared on
  dispose): mice-chasing Jon/Lyman used to fill the whole screen walking past the camera
- skip=0 intro pass L1–L6, L8–L10 (+L7): L1 intro re-staged (Lyman stood on the cat bowl and Garfield on the dog
  bowl; Garfield turns to the room for his line); Ch2 L.shot() avoids lens positions in/behind people
  (bestShot avoid + blocksView), people = Jon/Lyman/delivery/Odie

- media audio check (AUD=1 hook in pt/c2lib): every Ch2 level + L7 — 0 missing VO keys, 0 unknown sfx; arena music
  in L7/menu arena, sneak2 in all Ch2 levels, Lyman/delivery/Odie VO + aww/yap/pant loop/whistle/thwip/brawl/tvthud/
  squeak all fire at their beats. Fixed: after a chase the music went back to Ch1 'sneak' instead of 'sneak2'
  (humanAI now restores ctx.music, set by game.js).

## VERDICTS (fun / clear / fair, 1–5, kid at 1280x720 keys; honest)
- L1 Double Dinner 4/4/4 — busy and readable; two plates + dog bowl is a nice escalation.
- L2 Lights Out 4/3/4 — 7 steps is long for a kid; the two 10 s chases are fair (the catch costs nothing). Cupboard
  box now visible. Getting caught by two humans is common — fine, it's a cutscene.
- L3 Disco Inferno 4/4/5 — short; rubbing Lyman's legs with the % counter is clear and funny.
- L4 Diet Time 4/4/4 — the wall splat lands at window height (reads as "against the window") — minor.
- L5 Special Delivery 4/4/5 — mice now readable; marker leads every step.
- L6 Spit Happens 4/4/5 — the drawer is easy now (camera faces the dresser, assist turns him).
- L7 Arena tutorial 4/5/5 — very easy (20-0..20-2); Odie now lunges back after a run of hits, so there is something
  to dodge. Menu Easy: 20-6/20-7.
- L8 Shedding Week 4/4/4 — the armchair spot can be triggered from behind the chair (wide 0.95 radius), fine.
- L9 Bad Mood 5/4/5 — glare hold ring + green HOLD button on touch both clear.
- L10 Silent Whistle 4/4/4 — 6 steps; dresser camera fixed; the Jon-only chase is short.

## IN PROGRESS
- none (lane done)

- FINAL REGRESSION (port 9409): play.mjs 1-10 PASS, catch PASS, fp1 PASS, menus PASS, c2:1-10 PASS, arena PASS
  (c2:7, c2:7lose, menu arena), fp2 --nosoak 44/44, selfTest 14/14.

## NEXT (remaining / honest gaps)
- L4 wall splat reads as hitting the window (Odie's stuck_wall pose at window height).
- L2 cupboard: inside the cupboard the fixed cam_cupboard shot hides Garfield half behind the door leaf.
- Shed fur planes are flat (float a little over cushions); still hard-edged tufts (alphaTest), not true soft fur.
- Humans that find a door shut in their way now just stop at it (no rattle/"who shut this?" reaction).
- Faded humans briefly lose Lyman's fur shader (material clone drops onBeforeCompile) while the lens is inside him.
- Real iPad untested; nobody has listened to the new audio (media's NEEDS A HUMAN EAR list).
- L1–L10 + arena keys 1280x720 (skip=0 once each); touch L2/L5/L9/arena 1024x768
- known issues: humanAI shut-door walk-through, sock-drawer camera, L5 mice visibility, Lyman hair, floor lamp, fp2
  goodmorning flake, fur tufts/pile/carpet
- media audio wiring check; full regression

## REQUESTS
- none
