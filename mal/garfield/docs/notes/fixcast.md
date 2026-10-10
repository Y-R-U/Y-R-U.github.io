# fixcast — notes (wave 4, son's feedback #1)
Owns js/actors/*, js/world/* (+props), tools/sculpt/*, tools/{garfield,jon,odie,lyman,house,props}.html. CDP 9402.
Scratch harness: scratchpad fixcast/ (go.sh = start CDP → run.mjs steps file → stop; l5b.mjs swing trace + side cam,
eat1.mjs eating close-up, arm.mjs armchair, cup.mjs/cup2.mjs cupboard press tests, warp.mjs table, eatsearch.mjs pose
search, fp.mjs Jon hash with SKIP=<clip>).

## DONE
1. L5 vine pop — root cause in l05.js updateSwing (fixgame OK'd me editing swingTip/updateSwing/endSwing only): the
   "lift" block slid his paws up the strand by groundAt-jumps / max(0.3, up.y); at the fridge end the strand is near
   horizontal → shoved ~1.6 m up the vine (traced paw↔tip 1.6 m). Rewrite: a precomputed smooth root path
   (dip-and-rise arc, pushed over everything below via footprint samples, dilated, slope-limited, blurred: no cliffs),
   timed like a pendulum; F = landing spot on the fridge top so the return ends exactly where he stands (no teleport);
   vine tip = live paw midpoint every frame (garfield.gripLocal()); hang clip got setHangTuck(k) (arms bent, feet planted)
   near the fridge/ceiling; pan rides at his feet and slides to its fridge-top spot over the last stretch; vine.letGo()
   eases the tip back to its draped rest. Trace: max paw↔tip 0.02 m, max root step 0.04 m/frame. play.mjs 5 PASS.
2. Eating — 'eat' clip is now 2.5 s, head DOWN the whole time (crouched front elbows, mouth ~0.10 m off the surface),
   6 small chewing bobs + slow side tilt, outFade 0.35; seamless when looped. Every level plays it once for its 2.2–2.4 s
   bout, so no level change needed (L1 verified: head down until the plate is empty, then lifts).
3. Armchair — root cause in jonAI.js/humanAI.js ai.sulk(): root set to y=0 then 'sit' (seated clips expect the seat
   surface, SEAT.h). Sent fixgame the exact fix (seat Object3D at 'loungeChair' incl. y 0.48 + jon.sitAt). Verified the
   fix in-page on L10. FP2 'lounge' already uses sitOn→sitAt (correct).
4. Cupboard — side wall facing the living room is now 0.22 m thick (house.js CUPBOARD.wall) with colliders at
   ST_X0−0.06..+0.28 (CUPBOARD.col); cupboardDoor blocker spans the same depth (doors.js `block` option via the anchor).
   Covers Garfield's 0.17 m and Odie's 0.28 m nose overhang past their radius, from both rooms and against the shut door.
   End walls back onto solid stair volume (nothing visible behind them).
5. Table warp — roundedBox(…, nx) slices along X (util.js, opt-in); table top + long aprons + cloth top sliced; aprons ride
   with the top (k uses TOP−0.13). Wood visibly bends into the U and springs back with the cloth.
6. Newspaper bowl — fixgame found give_bowl used as a generic pickup; added prop-free `pick_up` clip (jon_clips.js,
   1.2 s, right hand to the floor at 0.6, ev grab 0.65). Jon geometry unchanged: hash without pick_up is still 28895b99…;
   full hash now 9a69d508d999ea6f726460c5577ad4a0bf721c71.
- Regression (9402): play.mjs 1-10 PASS, catch PASS, c2:1-10 PASS, selfTest 14/14.

## NEXT / honest gaps
- Swing: rope length varies ~1.1–1.6 m over the arc (low ceiling makes a true pendulum impossible); reads as a stretchy
  vine. Tail can graze the fridge edge on launch.
- Ch1 Free Play (freeplay1.js, fixgame's) has its own copy of the OLD swing → same pop. l05.js now exports
  rideVine(L, st, target) + swingTip; port recipe sent to fixgame.
- Armchair hands rest just inside the armrests ('sit' clip arms), not on them.
- pick_up's hand comes up chest-forward at 0.9 s (reads as holding the paper out).
