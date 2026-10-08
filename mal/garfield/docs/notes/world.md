# world — notes (wave 3, Brief 2 world additions)
Owns js/world/* (props/*, food.js, exterior*, lighting, materials, nav, glow), tools/house.html, tools/props.html. CDP 9404.

## DONE
- Read briefs/decisions/notes. Harness: scratchpad world/ (run.sh shots, perf.sh → perf2.mjs, api.mjs smoke test of every Ch2 API).
- v1 (all smoke-tested, documented in js/world/README.md + props/README.md, sent to game):
  house.js Lyman room (bath band z 7.1..11), lymanDoor hole (partition colliders id 'lymanWall*', auto ids preserved),
  hollow under-stair cupboard (step 5..13 colliders keep ids, bottoms raised; cupWall* colliders), dresser anchors,
  all Ch2 anchors + cams; props/ch2.js (dresser/socks/launcher/odieBowl/soupBowl/tvBox/carpet/biscuitBox/cheese/
  mouseHoles/shedDecals/furPile/coffeeMug/suitcase/whistle), doors lymanDoor/cupboardDoor, toggle() on doors/fridge,
  frontDoor.setLocked, chair2/plate2/newTv via id param, catBowl.eaten, table.warp, vase.knock({target}), world.navPet,
  world.setChapter/swapTv, lamp focus per room.
- Perf medium 1024x768: Ch1 kitchen unchanged 133/134/122/118. Ch2 (setChapter 2) 137/139/126/120 (odie biscuits merged
  into the bowl mesh w/ drawRange, carpet fringe painted in texture, chair2 no shadow on medium; plate2 level-driven).
- Regression after v1: play.mjs 1-10 PASS, catch PASS, selfTest 14/14.
- Polish 1: cheese = extruded wedges (comic size), mouse holes proud of skirting, rounder soup splats, softer fur pile,
  L-shaped socks (10), bigger whistle, Lyman room pictures, splinter colour, sock drawer cartoon-deep (OUT 0.64).
- Garfield physically tested: cupboard (door blocks closed / enters open), Lyman door, standing in sock drawer.
  Holding W while jumping at the drawer mantles onto the dresser top — told game to hop him to standPos().

- Polish 3: Lyman room matched to refs/lyman_bedroom.png (cream plaster walls, pine knob-post bed + arched headboard, pastel striped blanket, 2-drawer pine nightstand + cream lamp, coat rack w/ grey coat, beige dog bed + plush toy, chew bone, stray socks; odieBed anchor z 10.0).
- Polish 2: tools/props.html Ch2 views, tools/props.html has Ch2 views + action buttons
  (anchors pulled from buildHouse). Final regression: play.mjs 1-10 PASS, catch PASS, selfTest 14/14.

## IN PROGRESS
- none (lane at a clean stopping point)

## NEXT (honest gaps)
- Lyman room: no attic slope (kept full height for the camera); suitcase prop is closed (ref shows it open with clothes).
- Free jumps at the open sock drawer mantle onto the dresser top; game should hop Garfield to sockDrawer.standPos().
- Fur pile is a lumpy cap + tufts (ok, not fluffy-soft); shed decals read as orange speckles.
- Carpet sits on top of the big living rug and is a bit lost against it.
- Ch2 kitchen 137/139/126 medium before Odie/Lyman; plate2 adds ~10 when active.

## REQUESTS
- none
