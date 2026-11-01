# Theme contract (engine ⇄ themes)

The engine owns gameplay geometry and **all colliders**. A theme only supplies looks. If a theme
is missing a material or skin, the engine falls back to the built-in `greybox` theme
(`js/themes/greybox/index.js`, owned by the engine agent).

Units: **1 unit = 1 metre**. Ball radius 0.05 (a real mini golf ball is ~0.021 m but bigger reads
better on phones; tune it in one constant, `BALL_R` in `js/engine/constants.js`). The fairway is
typically 1.2–2.0 m wide, walls 0.12 m high and 0.12 m thick. The cup radius is 0.11. Y is up.

```js
// js/themes/<id>/index.js
export default function createTheme(ctx) {   // ctx = { THREE, renderer, quality: 'low'|'high' }
  return {
    id: 'sky', name: 'Sky Isles',
    materials: {          // THREE.Material instances, shared; any may be omitted
      grass, fringe,      // putting surface; fringe = the band next to the walls
      wall, wallTop, trim,// wall body, cap, gold trim strip
      tee, cupRim, flag,
      sand, water, ice, boost, bridge, rock,
    },
    // Called once per hole after the engine built the playable meshes.
    // info = { bounds: THREE.Box3, path: THREE.Vector3[] (centre-line samples, ~0.25 m apart),
    //          widths: number[] (fairway width per sample), tee: Vector3, cup: Vector3,
    //          camera, renderer, quality }
    // The theme adds sky/background, fog, LIGHTS (one shadow-casting directional + fill),
    // the floating rock under the fairway (follow `path`/`widths`), backdrop set pieces placed
    // OUTSIDE bounds + 1 m, ambient particles. Return { update(dt, t), dispose() }.
    buildEnvironment(scene, info) {},
    skins: {              // visual-only builders; each returns an object as described
      // { object: Object3D, rotor: Object3D } — the engine spins `rotor` about its local Z.
      // opts = { towerRadius, towerHeight, hubHeight, bladeCount, bladeLength, bladeWidth,
      //          gapWidth }  The tower sits over the fairway with a tunnel of width
      //          gapWidth at ground level along local Z. The rotor sits at (0, hubHeight, towerRadius + 0.05) and faces +Z.
      windmill(opts) {},
      // Object3D. A vertical loop in the local YZ plane, entry at the origin heading +Z.
      // opts = { radius, width, sideShift }  The track surface is the inside of a ring of
      // `radius`; the exit is offset by `sideShift` along X so the track doesn't collide with itself. The engine provides the
      // track surface mesh; the skin adds rails/hoops/decoration around it.
      loop(opts) {},
      // Object3D. Glass tube along `curve` (THREE.CurvePath / CatmullRomCurve3 in hole space).
      // opts = { curve, radius }  The skin is see-through; the engine handles collision.
      tube(opts) {},
      // { object, update(dt, t) }  opts = { poleHeight }  The flag pole sits in the cup at the origin.
      flag(opts) {},
      // { object, update(dt, t) }  A collectible (crystal / coin / pumpkin) at the origin, ~0.15 m tall.
      pickup(opts) {},
      // Object3D. A round bumper post. opts = { radius, height }
      bumper(opts) {},
      // Object3D. The tee pad decoration around the start point. opts = { radius }
      teePad(opts) {},
    },
  };
}
```
Rules: keep each skin under ~3k triangles, merge static parts, and reuse materials. Animate via
`update`, not per-frame allocation. `dispose()` frees everything the theme created.
The engine agent may extend the contract (new skins, new opts); document the change here and in your notes.

## Engine extensions (engine agent, 2026-11-02)
These pin down details the physics depends on. Skins that ignore them still work, but the
visuals will drift from the colliders.
- **windmill**: new opt `gapHeight` (tunnel ceiling, default 0.24). **Blade layout at
  `rotor.rotation.z = 0`:** blade k points along local +Y rotated by `2πk / bladeCount` about Z; its
  spar is on that radial line and its sail spans local x ∈ [0.018, 0.018 + bladeWidth], radius
  0.06 → bladeLength. The physics blade box is exactly that region (±0.022 thick in Z). The engine
  sets `rotor.rotation.z = omega * t + phase` every frame (right-handed about local +Z).
- **loop**: the track centre is not a linear helix. At ring angle θ (u = θ / 2π) it sits at
  x = sideShift · (u − sin(2πu) / 2π), i.e. the shift eases in and out (zero sideways slope at
  entry and exit). The engine also tilts the track floor slightly toward the shift. Rails/hoops
  should follow that x(θ) to line up with the engine's track and walls.
- **buildEnvironment info** gains `floor: boolean[]` (parallel to `path`; false where the hole has
  a gap you can fall through — keep the rock out from under those samples if you want the gap to
  read as a drop).
- The engine draws the cup hole, its pot and a thin rim ring (material `cupRim`); the `flag` skin
  only supplies the pole + flag. The engine lifts the flag out when the ball comes within 1 m.
- `teePad` is placed at the tee with `{ radius: 0.32 }`, local +Z pointing back toward the tee end.
- Windmill / bumper / pickup / teePad objects are placed with local X = right, Y = up,
  Z = back toward the tee (so the windmill rotor faces the incoming ball). The loop keeps the base
  contract: local +Z = travel direction at the entry, +X = the shift side (the player's left).

## Engine extensions, M2 (engine agent, 2026-11-02)
- **New skin `mover(opts)`** → Object3D. A block that slides across the fairway (the engine moves
  it). opts = `{ width, height, depth }`; base centred at the origin, X across the fairway. Greybox
  provides one; a theme may override (stone block with gold trim suits Sky Isles).
- **`tube`** is now used: `opts.curve` is a centripetal `THREE.CatmullRomCurve3` through the tube
  centre line in hole space (already placed — add the skin straight to the hole group), `opts.radius`
  is the inner radius the ball rolls in (0.15). The ball must stay visible through it.
- **Surface patches**: holes can re-tag floor cells as `sand`, `ice`, `boost` or `sticky`. The
  engine draws them as decal meshes 3 mm above the grass using the theme's `sand` / `ice` / `boost`
  materials (`sticky` uses `sand`). **Boost decal UVs:** `uv.x` = metres across the pad from the
  pad's own centre line (0 = middle, ± half the pad width at its edges; pads are usually 0.4–0.6 m),
  `uv.y` = metres along the push direction. Draw the chevron tip at u = 0 (sky uses repeat.x = 2,
  offset.x = 0.5 on a 0..1 texture) and scroll along +v. Not 0..1 across.
- **buildEnvironment info** gains:
  - `voids: [[x, z][]]` — polygons (hole space, XZ) that must stay empty: no island ground, rock,
    lamps or props. Hole 7's U-bend uses one so its plank shortcut reads as a drop into the sky.
  - `viewDir: Vector3` — the camera's initial horizontal forward at the tee (unit). Backdrop set
    pieces meant to be seen should sit roughly along it (hairpin holes otherwise hide them behind you).
  - `branches: [[x, y, z][]]` — extra walkable tracks (e.g. that plank bridge), centre-line points.
    They are not in `path`; don't put rock under them if they cross a void.
