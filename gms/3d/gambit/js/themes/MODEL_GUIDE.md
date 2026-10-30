# GAMBIT — Model & animation guide for theme sculptors

Read this, then copy `js/themes/classic/` (the exemplar). Your helpers are in `js/themes/kit.js`.
Test everything in the gallery: `/gms/3d/gambit/tools/board_gallery.html?theme=<id>`.

## 1. Registering a theme
1. Make `js/themes/<id>/index.js` exporting a default object (see the shape below).
2. Add ONE line to `js/themes/index.js`: `<id>: () => import('./<id>/index.js'),`
3. Open the gallery with `?theme=<id>`. Missing pieces, anims or board fall back to Classic,
   so you can ship two pieces at a time.

```js
export default {
  id: 'fantasy', name: 'Fantasy', tags: ['figurines'],
  board: {
    build(THREE, kit, { orientation, coordinates }) -> Object3D,   // playing surface top at y = 0
    environment?(THREE, kit) -> { object?, minPhi?, background?, fog?, lights?, envScene?, envIntensity?, roomEnvironment? },
    lightRig?(THREE, kit) -> Group,                                 // ignored if environment returns lights
    overlayStyle?: { lastMove, select, hint, hover, dot },          // highlight colours
  },
  pieces: { p, n, b, r, q, k: (THREE, kit, { color, type }) -> Object3D,
            facing?: { w: yaw, b: yaw } },                           // default: knights face the player's left
  moveAnims: [ fn, ... ],        // ctx => Promise, picked at random
  battleAnims: [ fn, ... ],      // ctx => Promise, picked at random
  promoteAnim?: ctx => Promise,  // optional; ctx.piece is the NEW piece at scale 0.01
};
```

## 2. Scale and orientation
- **1 square = 1 unit.** Board spans x, z in [-4, 4]; a1 is at (-3.5, 0, 3.5), white at +z.
- **Base at y = 0, Y up**, centred on the origin. Footprint radius ≤ 0.40 (0.42 hard max),
  so neighbours never touch.
- Heights (Classic): pawn 0.63, rook 0.73, knight 1.0, bishop 0.95, queen 1.04, king 1.24.
  Keep the same order (king tallest, pawn shortest); a figurine theme may scale all up ≤ 1.4.
- **Author the knight (and any piece with a face) looking toward -z.** The board rotates
  white pieces +90° (face screen-left) and black -90°. Bake no yaw into the model itself.

## 3. Budgets (mid-range phone, 60 fps)
| | per piece | notes |
|---|---|---|
| triangles | ≤ 6k (knight/king ≤ 8k) | Classic: p 3.3k, r 2.8k, b 6.8k, q 5.2k, k 4k, n 6.2k |
| materials | 1–2 | each material = one more draw call per piece **kind** |
| meshes | any | the board merges them per material (`kit.piece` does it for you) |
| textures | avoid on pieces | use vertex colours (`kit.tint`, `kit.paint`) |

How it renders: resting pieces are **instanced** — one InstancedMesh per (kind × material),
so a full army in Classic is 12 draw calls (+12 in the shadow pass). An animating piece is a
cheap clone that shares geometry and material. Lights and shadows: one directional shadow map,
updated only when something moves.

## 4. Reading from straight overhead (the default camera is ~13° from vertical)
The top silhouette is what players see 95% of the time. Each type must be obvious from above:
- **King**: a "+" cross. Use a 3D cross (post + two crossing arms) so it reads as + from above.
- **Queen**: a ring of coronet points/beads around a centre finial (a dotted circle).
- **Bishop**: the mitre with a dark **slot line** across it (`kit.carve` with `darken`) + small ball.
- **Rook**: a ring of battlements around a **dark well** (`kit.paint` the hollow dark).
- **Knight**: a long head pointing sideways (muzzle length ≥ 0.5 of the footprint), ears.
- **Pawn**: a small round head, clearly the smallest footprint.
Check the gallery Lineup at Top view: every piece sits on a light AND a dark square.

## 5. Side colours
Convention (Aaron's refs): **white = ivory/gold + blue accents, black = black/chrome + red accents.**
- Use `kit.sideMaterial(color)` (ivory vs ebony, with a fresnel rim) or `kit.material(kit.metalLooks[color])`
  (polished gold vs black chrome, as Classic does). The rim matters: white gets a darkened edge
  (outline on light squares), black a faint warm glow (outline on dark squares).
- Accents (cloth, gems, banners): `kit.accentMaterial(color, {glow})`, or tint vertex colours with
  `kit.palette[color].accent`. Accents should be visible from above (shoulders, hat brims, crests).
- White vs black must be obvious at a glance at 360 px wide. If unsure, screenshot the gallery
  in portrait and squint.

## 6. Kit cheat-sheet (geometry)
`kit.profile().pt(r,y).arc(cx,cy,R,a0,a1,n).bez(cr,cy,r,y,n).points()` → `kit.lathe(points,{segments})`;
`kit.latheSegment(section, phiStart, phiLength)` (capped wedge: battlements, crown points);
`kit.bevelBox(w,h,d,bevel)`, `kit.extrude(shape,{depth,bevel})`, `kit.roundedRect`, `kit.sphere/cylinder/torus`;
`kit.place(g,{x,y,z,rx,ry,rz,s,sx,sy,sz})`; `kit.tint(g,color)`, `kit.paint(g,(x,y,z)=>mult)`,
`kit.carve(g,{normal,offset,width,depth,darken,where})`; `kit.merge([...])`; `kit.piece([{geom,mat}...])`;
`kit.stats(obj)` → {tris, meshes}. Materials: `kit.material({...})` is cached — call it freely.
All kit materials use vertex colours; geometries without a colour attribute get white automatically.
Board textures: `kit.canvasTexture(w,h,draw)`, `kit.drawWood`, `kit.drawMarble`.

## 7. Animations
Rules:
- Animate **only** with `ctx.tween(ms, (eased, raw) => ..., easing)` and `ctx.wait(ms)`. Never
  `setTimeout`/`requestAnimationFrame`: battle speed (1×/2×/5×) and tap-to-skip work by
  speeding up or instantly finishing the timeline, which only works for tweens.
- Animate the object you are given (`ctx.piece`, `ctx.attacker`, `ctx.victim`): position,
  quaternion/rotation and scale. Rotation 0 / scale 1 / y 0 = its resting pose (the side's
  yaw lives on an inner group). Leave it close to rest at the end; the board snaps it home.
- Changing a material (fade, flash) must go through `kit.fadeOut` / `kit.flashObject` /
  `kit.ownMaterials(obj)` first — materials are shared by every piece of that kind.

**Move anims** (≤ ~350 ms, always 1×). `ctx = {piece, from, to (Vector3), path, dist, dir, type,
color, fromSq, toSq, move, tween, wait, fx, camera, kit, THREE}`. End with the piece at `ctx.to`.
Optional props: `fn.only = ['n']`, `fn.weight = 3`, `fn.label = 'leap'`.
Helpers: `kit.hopTo`, `kit.slideTo`, `kit.squash`, `kit.arc`, `kit.setLean`, `kit.ease.*`.

**Battle anims** (captures; ~1.2–2.5 s at 1×, can be over the top). ctx adds
`{attacker, victim, victimPos, victimSq, victimType, victimColor, speed, scene}`. `victimPos`
differs from `to` for en passant. Start from `attacker.position` (it may already be on the
square after a drag-drop). End with the attacker at `ctx.to`; the board removes the victim.
A battle that throws or runs past ~9 s is cut off and finalised by the board.
Helpers: `kit.focusFight(ctx, async () => {...}, {zoom, tilt})` (camera moves in and back; skipped at 5×),
`kit.shake(ctx, amp, ms)`, `kit.tipOver`, `kit.sinkOut`, `kit.fadeOut`, `kit.flashObject`.

**FX** (`ctx.fx`, world positions, all obey battle speed):
`sparks(pos,{dir,count,colors})`, `smoke(pos,{count,colors,alpha})`, `sparkles(pos)`, `dust(pos,{colors})`,
`fire(pos,{scale})`, `embers(pos)`, `debris(pos,{count,colors})`, `explosion(pos,{scale,debrisColors,scorch,boardFlash})`,
`lightning(from,to,{color,width,branches,ms})`, `flash(pos,{color,radius})`, `ring(pos,{radius,color})`,
`boardFlash(color,ms,strength)` (tints board + scene light), `scorch(pos,{radius,ms})` (fading decal),
`screenFlash(color,ms,alpha)`, generic `burst({...})`. Particles are 2 draw calls total.

## 8. Board and environment
- `board.build` returns the board with its playing surface top at **y = 0** and squares exactly
  1 unit. Draw coordinates inside the a-file / first-rank squares for `orientation` (rotate text 180°
  for 'b'); honour `coordinates: false`. Keep it to a few draw calls (one canvas texture for squares).
- `board.environment` (optional) is the diorama around the board (islands, braziers, banners, sky).
  `object` is hidden while the camera tilt is below `minPhi` radians (default 0.12, i.e. nearly overhead),
  so the overhead view pays nothing for it. Budget: ≤ 30 draw calls, ≤ 60k triangles. `background`
  (Color or Texture) and `fog` apply to the scene; leave background unset for a transparent canvas.
  `envScene` is a THREE.Scene baked into reflections once (default `kit.studioEnvironment()`; set
  `roomEnvironment: true` for three's RoomEnvironment). Keep its zenith dim or glossy boards glare.

## 9. Testing
Gallery: `?theme=<id>&mode=lineup|turntable|play&view=all|top|default|angle`. Lineup shows every piece
on both square colours; Turntable spins it; Playground plays random legal moves with speed Off/1/2/5
and demo buttons for castling, en passant and promotion. Stats under the board show draw calls,
triangles and tris per piece. Screenshot at 360×740 and 1440×900 and look at Top view first.
