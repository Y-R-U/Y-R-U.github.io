# cast2 — notes (wave 3 polish of the cast lane)
Owns js/actors/*, tools/sculpt/*, tools/{garfield,jon,odie,lyman}.html. CDP 9402. Scratch: scratchpad cast2/ (oshot.sh, fp.mjs, smile.mjs, backups *.js of pre-change Odie files).

## DONE
- Odie tail: rig now tail0..tail5 (odie_rig.js TAIL_N=6). The SDF sculpt keeps only a stub. The tail itself is a tapered
  skinned TubeGeometry in odie.js (16→6.5 mm), curving back then up; the wag is a travelling wave (whip). Rebaked odie_mesh.js.
- Odie face: bigger forward-facing eyes (scale .045/.053), bigger pupils, dopey lidU .35→.12 (no more slit eyes);
  grin line (dark tube) along the upper lip curling up into the cheeks (points projected onto the SDF via smile.mjs).
- Odie gait: stride lerp(0.46,1.0) to match ODIE.walk .85/run 2.6. gallop_goofy + walk_socked are speed-synced and survive setMove (MOVE_OK).

## IN PROGRESS
- Lyman hair/disco, Garfield seethe tail/bald, real-house checks

## NEXT
## REQUESTS
- asked game for the URL/hooks to reach the land_head/stuck_wall/flattened/launched beats
