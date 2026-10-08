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
- Perf medium 1024x768: Ch1 kitchen unchanged 133/134/122/118. Ch2 (setChapter 2) ~141/144/130/123 before trimming
  odieBowl (now 1 mesh+heap) and chair2 shadows.

## IN PROGRESS
- polish pass vs refs; regression runs

## NEXT
- polish vs refs, perf check, regression (play.mjs 1-10, catch, selfTest)

## REQUESTS
- none
