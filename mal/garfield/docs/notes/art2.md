# art2 — notes (wave 3, continues the art lane)
Owns js/world/*, js/world/props/*, js/world/food.js, tools/house.html, tools/props.html, js/core/post.js. CDP port 9411.
Harness: scratchpad art2/ (copies of art's run.sh / shots.mjs / perf.mjs).

## DONE
- Cul-de-sac dressing (js/world/exteriorDress.js, all in the far/street builder = hidden in levels, merged per material):
  hero yard hedges + flower beds + path borders, fence-line shrubs, 2 gate lamps, porch planters/doormat/hanging
  baskets, Jon's car in the drive; per-neighbour flower bed, picket fence or hedge, mailbox, parked car (2/3 of lots);
  ~70 scattered shrubs/small trees. Front fence moved z -9 → -6.6 (was crossing the bulb sidewalk ring).
- js/world/glow.js: makeHalos (camera-facing additive InstancedMesh, 1 call) + makePools (ground light pools, 1 call).
  Exterior: halos on all street/gate/porch lamps + pools under street lamps. Interior: halos on the pendant, side-table
  lamp, floor lamp, bedroom + landing lights (1 call, added in world.js).
- Exterior grass brighter while exterior.show(true) (material('grass').color swap in world.js).
- Intro anchors (world.js addCamAnchors): cam_culdesac [1,21,-56]→[5,1,-6] fov45, cam_culdesacLow [-5.5,10,-25]→
  [5.5,2.4,2] fov42 (ref-like framing, hero centred), cam_houseFront [2,3.4,-12]→[6.2,2.4,0] fov50.
- Kitchen pendant: 1.3× dome in new 'shadeGlow' emissive cream material, brass cap, bigger bulb; lighting.js now drives
  it with a downward SpotLight (high/medium; low keeps the point) so the ceiling is no longer blown out; halo sprite.
  Same x/z (4.6, 8.45) → vine swing-line clearance unchanged (~0.78 m centre).
- cam_dining lowered/looks up a bit ([7.3,1.3,7.0]→[4.4,1.2,8.75]) so the pendant sits in the top of the frame like the ref.

- polish converted playIntro's exterior to one Catmull-Rom glide through the anchors (pos/look/fov) + dining fov.
- Lasagna: cheese base more golden (#f7c652), melt material deeper gold; slice cheese sheet now drapes over the sides in
  rounded tongues (curtain verts displaced; side UVs sample a clean molten strip at the texture's bottom edge); pan has
  5 cheese ropes spilling over the rim (+1 call on the pan, lasagna levels only). Tried sphere caps (read as coins),
  capsule pegs (read as pegs) and tube strings (read as chopsticks) — all removed.
- Spot intensity ×0.72 (table/plate was blowing out under the pendant).

## IN PROGRESS
- kitchen draw calls (target ≤140 at 1024x768 medium)

## NEXT
1. cul-de-sac dressing + closer intro framing  2. pendant glow in dining shots  3. cheesier lasagna  4. kitchen ≤140 calls medium

## REQUESTS
- none yet
