# house notes

## DONE
- Read briefs. Agreed props registration with props: createProps({scene,quality,anchors,sfx}) → Map; updateProps(props,dt); props own table+bench+fridge+tv(no stand)+doors/window sash; house owns shell, walls/holes/casings, sill ledge, tv stand, counters, microwave, sofa, lounge chair, decor.
- Told core: world.camBlockers (meshes) provided.

- v1 world DONE (~65 draw calls without props): materials.js, houseBuild.js, house.js, lighting.js, nav.js, exterior.js, world.js, tools/house.html, js/world/README.md. Props integrated (createProps etc). Nav tested (kitchen→bedroom via stairs OK, 23 ms for 3 paths). Told core/levels/props the contract + anchors.
- Test: scratchpad shot.mjs (CDP, port 9404) + tools/house.html?shot=1&view=<name>

- Beauty pass 1: warm ceiling material (emissive bounce), longer floor planks, subtler wood/carpet, crown moulding, leafy plants, kitchen rug/back door/radiator/bin/calendar, per-storey lamp assignment (fixed light count = no shader recompiles), TV glow light, dusk sky/fog, ground colour variation, suburb ring of distant houses + backyard trees. Pendant shortened (bottom 2.2) for props' vine.
- Integrated in the real game (?level=1&skip=1) — renders fine.

- Ref pass (refs/kitchen.png, living_room.png): darker evening ambient (hemi 0.48, key 1.5) + stronger lamp points, peach kitchen walls, brown/cream checker, honey-wood shaker cabinets + cream counters, dome pendant, Persian rug, mustard sofa w/ rolled arms, softer wallpaper. Kitchen island added (x 7.05..8.35, z 7.75..8.75, solid 0.92) = chase high ground. Blob alpha bug fixed (alphaMap reads green).
- Tests always via scratchpad run.sh (starts+stops cdp — manager: never leave Chrome idling).

- Storey culling (camera-based) + shell/furniture layer split; low-poly small details; painted backdrop ring for window views; bedroom desk/chair/CRT, toy box, basket, book shelf; TV-stand drawers; under-stair cupboard door.
- core perf ask answered (street was already hidden; their counter ignored .visible).

- Bedroom ref pass: warm sage diamond-pattern walls, plank floor (tinted), twin bedside lamps, warm rug.
- Cul-de-sac ref pass: sunset now BEHIND the hero house (intro looks +z), purple→orange sky w/ painted cloud streaks, slate-blue roofs, cream siding, red-brick side wing w/ big lit window, more lit neighbour windows (front + sides), hazy tree-line horizon ring (exterior only), darker dusk lighting.
- Stair runner carpet + landing runner, entry runner/umbrella stand/sneakers.

- Props leftovers: kitchen pendant moved to (4.6, 8.45) → ~0.73 m clear of the L5 vine swing line (hook→pan); static warm TV glow light (prio 3: only on high, never toggled). Braided rug texture redone.

## IN PROGRESS
- none — lane complete

## KNOWN ROUGH / IDEAS
- Bedroom has no sloped attic ceiling (ref has one) — full-height storey kept for camera room.
- Braided kitchen rug still reads a bit 'target'-like.
- Wall above the stairwell shows GF crown moulding + landing wainscot band (realistic but busy).
- Exterior sun disc is stylised; real glow needs core's bloom (high quality only).

## Layout (summary; full in js/world/README.md)
- interior ground floor x 0..9.2, z 0..11; front wall z=0 (street -z). Living room z 0..5.5 (stairs along x 8.1..9.2, z 0.9..4.7, up toward +z). Kitchen z 5.5..11. Wall z=5.5: archway x 1.5..4.5, doorway x 6.4..7.4.
- upper floor y=3.0: bedroom x 0..6.4, z 0..7, door in wall x=6.4 at z 5.25..6.15; landing x 6.4..9.2.

## NEXT
- beauty pass vs refs/, perf tiers

## REQUESTS
- (none yet)
