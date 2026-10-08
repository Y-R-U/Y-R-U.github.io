# cast2 — notes (wave 3 polish of the cast lane)
Owns js/actors/*, tools/sculpt/*, tools/{garfield,jon,odie,lyman}.html. CDP 9402. Scratch: scratchpad cast2/
(oshot.sh turntable shots; house.mjs + s1/s2/s3.mjs = real-house CDP scenes; fp.mjs Jon hash; smile.mjs SDF projector;
pre-change backups odie*.js, garfield*.js, lyman.orig.js).

## DONE
- Odie tail: rig now tail0..tail5 (odie_rig.js TAIL_N=6). The SDF sculpt keeps only a stub. The tail itself is a tapered
  skinned TubeGeometry in odie.js (16→6.5 mm), curving back then up; the wag is a travelling wave (whip). Rebaked
  odie_mesh.js. From behind it reads as a thin tail, not a third ear.
- Odie face: bigger forward-facing eyes, bigger pupils, dopey lidU .35→.12 (no more slit eyes); grin line (dark tube)
  along the upper lip curling up into the cheeks (points projected onto the SDF via smile.mjs). Front reads as Odie.
- Odie gait: stride lerp(0.46,1.0) to match ODIE.walk .85/run 2.6. gallop_goofy + walk_socked are speed-synced to
  setMove and survive it (MOVE_OK); before this, setMove kicked gallop back to idle/run on the next frame.
- Lyman: back of hair = tapered shell to the nape + combed strands (layeredBack in lyman.js; no more backTufts mop).
  Disco: V interior is skin, with separate shirt-front panels → crisp edges (was a smeared purple vertex blend).
- Garfield: puff scales tail1 uniformly (per-bone scales compounded into a bulb at the tip). setBald: pinker skin
  (f4a3b0/e2858f) + orange crown tuft and tail-tip tuft (baldTufts, hidden unless bald).
- Garfield head_in_corner: head now pushes forward ~10 cm into the corner (it used to just hang down); story.js
  cornerSpot already puts the root 0.22 m from both walls.
- Real house checked (level 1 + Ch2 story): Odie front/back/walk, stuck_wall, flattened, launched, land_head; Lyman
  both outfits; bald Garfield. Placement notes sent to game (stuck_wall root z≈0.73 at the cabinet; head_in_corner
  0.22 m from the walls; Lyman hidden behind the front door in the story).
- Regression: Jon FP 28895b99… unchanged; play.mjs 1-10 PASS, catch PASS (one earlier run died on a browser crash;
  rerun passed).

## NEXT / remaining
- Check the c2 level beats once game registers c2:N (L2 vase/land_head, L4 stuck_wall/launched, L5 flattened under TV).
- Odie's mouth-paint pink smear at the tongue root is a bit lipstick-like close up.
- Bald ears have no inner-ear contrast.

## REQUESTS
- game: placement items above.
