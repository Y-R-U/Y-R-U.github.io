# World (house lane)

```js
import { createWorld } from './world/world.js'
const world = await createWorld({ renderer, quality })   // 'high' | 'medium' | 'low'
```

| member | |
|---|---|
| `scene` | THREE.Scene (sky dome, house, yard, cul-de-sac, lights, props) |
| `update(dt, camera)` | updates props; from the camera position picks the active storey: only that storey's furniture casts shadows, and the other storey's furniture + props are hidden (shell walls/floors stay; near the stairwell both storeys show). Props hidden this way get their previous `.visible` restored |
| `colliders` | `{id, min, max, kind:'solid'|'surface', enabled}` AABBs. Flags: `wall`, `floor`, `stairs`, `counter`, `decor`, `noWalk` (pictures). Prop colliders are the same objects props mutate in place |
| `addCollider(c)` / `removeCollider(id)` / `getCollider(id)` | |
| `camBlockers` | `[Mesh]` merged box mesh of walls/floors/ceilings, NOT in the scene — raycast it for camera collision |
| `anchors` | `Map name → {pos: Vector3, rotY, ...extra}`; `rotY` = facing direction (local +Z) |
| `nav.path(from, to)` | `Vector3[]` for Jon (or `null` if unreachable). Snaps both ends to the nearest free node; last point = `to`. Prop colliders (doors) re-tested per call |
| `groundAt(x, z, fromY)` | highest enabled collider top under (x,z) that is ≤ fromY + 0.3 (0 if none) |
| `exterior.show(bool)` | cul-de-sac + hero-house shell + fog + dusk lighting. Hidden by default (createWorld ends with `show(false)`). Sky, garden, fence, porch are always visible (seen through windows); while hidden, a painted 360° backdrop ring of houses/trees stands in for the street |
| `props` | Map id → prop (from `props/index.js`; magenta placeholder boxes if that import fails) |
| `setFood(kind)` | plate food; the lasagna pan is visible only for `'lasagna'` |
| `setSfx(fn)` | routes prop sfx calls `(name, opts)` to audio |
| `reset()` | props back to initial state |
| `lighting` | `{hemi, key, fill, points, setMode('interior'|'exterior', floor)}` |
| `floor` | 0 ground / 1 upstairs (active storey) |

## Coordinates
1 unit = 1 m, Y up. Interior of the ground floor spans **x 0..9.2, z 0..11**; the front wall is the plane z=0 (outside face z=-0.2) and the street is toward **-z**. Exterior walls are 0.2 thick, outside the interior box. Outdoor ground is y = -0.3.

- Ground floor y=0, ceiling 2.7. Upper floor y=3.0, ceiling 5.6.
- **Living room** z 0..5.4 (whole width). Front window x 2.4..3.6 (sill 0.9, top 2.1) with a deep window seat x 2.17..3.83, z 0..0.51. Front door x 6.65..7.55 (locked: invisible blocker `frontDoorBlock`). Stairs x 8.1..9.2, z 0.9..4.68, rising toward +z (14 steps × 0.214).
- **Wall z 5.4..5.6** between living and kitchen: archway x 1.5..4.5 (h 2.3) and doorway x 6.4..7.4 (h 2.1) — gives Jon/Garfield a chase loop.
- **Kitchen** z 5.6..11. Island (solid, top 0.92) x 7.05..8.35, z 7.75..8.75. Back counter x 0..5.3 (z 10.35..11, top 0.92), left counter x 0..0.65 (z 7.6..10.38) with stove. Fridge (prop) x 5.3..6.05, z 10.3..11. Microwave (solid) x 4.62..5.25, z 10.5..10.98, top 1.27. Table (prop) 1.5×0.9 centred (4.4, 8.8), bench behind it (z 9.62), Jon's chair in front (z 7.98) facing +z. Hutch on the right wall.
- **Upstairs**: bedroom x 0..6.3, z 0..6.9, door in wall x 6.3..6.5 at z 5.25..6.15. Landing x 6.5..9.2, z 0..6.9 with the stairwell hole x 8.1..9.2, z 0.9..4.68 (railings). Bathroom z 7.1..11 is closed (decor door).

### Climb routes (cat jump apex ≈ 0.98)
- Fridge (level 5): floor → bench 0.45 → counter 0.92 (gap 0.58 from bench) → microwave 1.27 → fridge top 1.85.
- Window seat (levels 3/4/7): floor → sill 0.9 directly, or lounge chair seat 0.48 → sill.
- Table 0.76 from the bench/chair. Under the table is clear (cat 0.44 < 0.72).

## Anchors
Gameplay: `jonChair, jonSeat, tableTop, plateSpot, panSpot, underTable, kitchenBench, catBowl, fridgeFront, fridgeTop, microwaveTop, counter, ceiling, windowsill, vase, curtains{w,h}, window{w,h}, frontDoor{w,h}, tv, sofa, loungeChair, stairsBottom, stairsTop, landing, bedroomDoor{w,h}, bedroomInside, bedroomCentre, jonBed{w,l}, garfieldBed, livingCentre, kitchenCentre, playerSpawn, jonSpawn`.

Cameras (`{pos, look, fov, rotY}`): `cam_culdesac, cam_culdesacLow, cam_houseFront, cam_porch, cam_frontDoor, cam_livingWide, cam_dining, cam_diningSide, cam_plate, cam_bowl, cam_windowsill, cam_fridgeTop, cam_bedroomDoor, cam_bedroom`. The exterior ones need `exterior.show(true)`.

## Files
- `world.js` contract assembly, props integration, groundAt, floor switching, camBlockers
- `house.js` layout, walls/holes/trim, furniture, colliders, anchors, baked room AO (`roomAO`)
- `houseBuild.js` Builder: bakes world UVs + vertex colour (tint × AO) and merges by material (few draw calls); rounded boxes
- `materials.js` procedural canvas textures + shared materials
- `exterior.js` sky dome, yard/porch (always on), cul-de-sac (toggled)
- `lighting.js` hemi + warm shadow key + lamp points (count per quality) + RoomEnvironment PMREM
- `nav.js` 0.2 m grid per floor + stair chain, A* + string pulling
- Viewer: `tools/house.html` (`?view=kitchen|living|...|cam_*`, `?q=`, `?ext=1`, `?props=0`, `?shot=1`)
