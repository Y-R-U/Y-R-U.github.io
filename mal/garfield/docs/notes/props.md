# props — notes

## DONE
- Registration agreed with house: createProps({scene, quality, anchors, sfx}) → Map; updateProps/resetProps/allColliders. House integrated it in world.js.
- v1 of every prop: table+bench, chair (breakLeg/fallBack/bounce, seat socket), plate (3 foods, fling, eaten, jolt), pan (serve/toFridge/swingCatch/eaten, merged portions), catBowl (spitBits), vase (knock→shatter, fragments), curtains (cloth strips, shred 0..3, wave), window (sash open/close + breeze), fridge (door, glow, slot), vine (ceiling-hook pendulum, setTip), doors, beds (jonBed shred, garfieldBed), CRT TV (canvas cartoon/static), newspaper (rolled + folded, throwAt).
- js/world/props/README.md documents API. tools/props.html gallery with buttons for every action.
- Draw calls cut (~120 → ~70 meshes in full-house view); removed PointLights (shader recompiles).
- Told levels/jon/house the API + timings. Jon: parents to chair.seat; fall_back_chair matches fallTiming.

- Food polish pass: plate winding fixed, gravy-capped mash, glazed meatloaf loaf+slice, layered lasagna w/ meaty ragu, pan w/ merged portions.
- Matched media refs: cream retro fridge w/ freezer door + chrome bars + vent; pothos tendrils spill over fridge; linen curtains; pink vase; wood 6-panel front door; cream bedroom door.
- chair.breakLeg(i) either back leg; pan.swingCatch holder-only (levels moves root). Levels code checked against API.

- Perf for core: quality-scaled segments (setPropQuality via createProps quality), food/plate/pan cast no shadows, pan auto-hidden unless lasagna, doors 12k→2.2k tris, fridge 7 calls. ~68 meshes / ~55k tris at medium.
- highlight(on, target?) on every prop (pulsing orange inverted-hull outline, shared shader).
- Verified in the real game (?level=6&skip=1): props render, no errors. FOOD_SCALE 1.25→1.4, pan 1.12→1.2 for readability.

- Steak plate matched to refs/food_steak.png: chunky smooth-walled steak w/ textured sides, amber gravy running down mash, bigger peas. Bite crumbs on plate.eaten().

- Meatloaf matched to refs/food_meatloaf.png (bright conforming ketchup glaze w/ drips, diced-veg interior). Lasagna matched to the _cands/food_lasagna_s101 take (overhanging pasta sheets, recessed lumpy ragu, golden blistered cheese).
- Reset audit: all actions then reset() → every prop state back to start (verified numerically). updateProps syncs colliders on an animation's final frame too.

## IN PROGRESS
- (nothing — lane is in a finished, polishable state)

## NEXT (if more time)
- Mash still a bit dome/onion-like vs ref; could be fluffier (scoop + fork ridges).
- Vine pot→ceiling-hook strand reads as a garland; fine for gameplay, could hang from a macrame planter instead.
- TV could switch to beige plastic housing per refs/living_room.png.
- Lasagna re-checked against promoted refs/food_lasagna.png (white bechamel layers, darker meatloaf glaze per media). Ooze drips tried and removed (they read as almonds).

## REQUESTS
- house: optional static TV glow light in lighting.js; pendant vs vine clearance (sent).

## Testing
- Gallery: http://localhost:8888/mal/garfield/tools/props.html  (CDP port 9405; driver script in my scratchpad: drive.mjs)
