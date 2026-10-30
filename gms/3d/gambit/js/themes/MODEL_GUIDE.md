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
    environment?(THREE, kit) -> { object?, minPhi?, background?, fog?, lights?, envScene?, envIntensity?, roomEnvironment?, update?(dt, t) },
    lightRig?(THREE, kit) -> Group,                                 // ignored if environment returns lights
    overlayStyle?: { lastMove, select, hint, hover, dot },          // highlight colours
  },
  pieces: { p, n, b, r, q, k: (THREE, kit, { color, type }) -> Object3D,
            facing?: { w?: yaw, b?: yaw,                             // theme-wide (default: sideways, the knight look)
                       byType?: { p: 'player', b: 'player', q: 0.55, ... } } },   // per type, see §2
  names?: { p, n, b, r, q, k },  // optional piece names for the tap/hover name tag, e.g. {b: 'Wizard'}
                                 // shown as "Wizard" with "Bishop" underneath; omit for plain chess names
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
- **Per-type facing** (board-2): `pieces.facing.byType[type]` overrides that yaw for one type.
  (It is a separate `byType` key because `facing.b` already means "black".) Values:
  - `'side'` — the theme-wide yaw (default; the knight's sideways look),
  - `'player'` — face the piece's own player (white toward +z, black toward -z); good for faces,
  - `'opponent'` — face the other side (the classic "marching forward" look),
  - a number — extra yaw added to the side yaw; **positive turns toward the owner** (0.55 ≈ a 3/4 view),
  - `{ w, b }` — absolute yaws per side.
  Example (Halloween): `facing: { byType: { p: 'player', b: 'player', q: 'player', k: 'player' } }`.
  Anims are unaffected: they move the outer group; the yaw lives on the inner group.
- **Switching over a baked yaw** (e.g. sci-fi `pawn.js` turns its head/arms by `YAW = 0.55`): delete the
  `rotateY(YAW)` on the parts and add `facing: { byType: { p: 0.55 } }` to the theme's `pieces`. The
  result is identical except the WHOLE figure turns (plinth included, invisible on a round plinth);
  turning only the head stays a modelling choice, so keep the bake if that is what you want.

## 3. Budgets (mid-range phone, 60 fps)
| | per piece | notes |
|---|---|---|
| triangles | ≤ 6k (knight/king ≤ 8k) | Classic: p 3.3k, r 2.9k, b 6.8k, q 5.4k, k 4.1k, n 5.7k |
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
**The black side must read on dark squares from overhead.** (Aaron, on his phone: black pawns on
dark squares were the hardest thing to see.) Check the gallery with
`?mode=lineup&fen=1n1k3r/p1p1p1p1/1p1p4/8/8/8/P1P1P1P1/1N1Q1K2%20w%20-%20-%200%201` at Top view, 360 px wide.
Tune in ONE place: `kit.metalLooks` / `kit.palette` (piece looks, incl. rim + `rim.top` sheen) and
`kit.boardLooks` (square colours). The board also draws a soft contact blob with a faint light
base ring under every resting piece, so you don't need to fake one.
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
More shared helpers (board-2, adopted from the sculptors' local copies — those copies may stay):
`kit.colorize(g, (x,y,z) => rgb|hex|null)` (absolute colour, unlike `paint`'s multiply), `kit.noise3(x,y,z)`
(smooth value noise 0..1), `kit.rgb(hex)` → linear [r,g,b], `kit.deform(g, (x,y,z) => [x,y,z])` (welds
non-indexed input first so it shades smooth — fixes the "faceted after merge" gotcha),
`kit.loft(spine, sec, {rings, segs, color})` (elliptical tube along a y-z spine: necks, tails, skulls),
`kit.flameTongue({len, rad, curl, flat, wob, colors:[base, mid, tip]})`, `kit.refine(g, maxEdge)` +
`kit.wrapDecal(g, {theta, y0, R(theta,y), lift, d})` (carved faces/windows on curved surfaces),
`kit.hsLathe(pts, {seg, flat, closed, caps, phiStart, phiLength, finish})` (hard-surface lathe with crisp
creases; pts `[r, y, finish, smooth?]`, finish `{c, glow, metal}` or a key resolved by `finish(key)`),
`kit.fixWinding(g)`.
All kit materials use vertex colours; geometries without a colour attribute get white automatically.
Board textures: `kit.canvasTexture(w,h,draw)`, `kit.drawWood`, `kit.drawMarble`.

## 6b. Glow, per-vertex finishes and idle flicker (board-2)
**One material per side with per-vertex metal/glow** (the fantasy/sci-fi trick, now shared):
`kit.vertexMaterial({roughness, metalRough, rim, glow = 2, dimGlow = 0.8, sheenMask = true, flicker})`
(or `kit.vertexMaterial('w'|'b')` for palette defaults). Vertex data drives it: `color` = albedo,
`uv.x` = glow amount (emissive = colour × glow × `glow` gain), `uv.y` = metal amount. Fill it with
`kit.vertexFinish(g, colour, {glow, metal})` and `kit.paintFinish(g, (x,y,z) => rgb | {c, glow, metal})`
(three's primitives ship real UVs that would read as glow/metal, so run every part through one of them;
`kit.hsLathe` does it for you). `dimGlow` darkens the lit albedo of glowing parts so neon stays
saturated; `sheenMask` limits the rim's overhead "top sheen" to bright non-glowing surfaces (wells and
grooves stay dark from above). A whole piece is then 1 draw call per kind.

**Idle flicker** — one shared clock (`kit.ambient.time`), so it never breaks instancing:
- emissive materials: `kit.material({..., emissive, flicker: 'candle' | 'pulse' | 'slow' | {mode, amount, speed, spread}})`,
  or `kit.addFlicker(myMaterial, opts)` for one you built yourself;
- vertex materials: `kit.vertexMaterial({..., flicker: 'pulse'})` animates only the glow channel.
`candle` = irregular flicker, `pulse` = smooth breathing (sci-fi light-lines), `slow` = a slow pulse.
Each piece/object gets its own phase from its position (no lockstep rows of lanterns); `spread: 1` also
varies it per vertex, for many flames merged into ONE mesh (board candles). Your own ShaderMaterials
can use the clock too: put `uAmbT: kit.ambient.time` in their uniforms and set `material.userData.ambient = true`.
Cost: while anything visible uses it, the board re-renders at a capped **~20 fps** when nothing else
moves (no shadow updates); never while the setting **Ambient animation** (`ambientAnim`) is off or the
tab is hidden. Static boards with no flicker stay at 0 fps at rest. Keep glow sparing: it is a
full-scene re-render, not a free effect.

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
- `update(dt, t)` (optional, board-2): called once per rendered frame **only while the environment is
  visible** (camera tilted past `minPhi`), only while `ambientAnim` is on, never in a hidden tab. It runs
  at the ambient cap (~20 fps) when nothing else moves, at full rate during animations; `dt` is ms since
  its previous call (≤ 100), `t` seconds. Use it for brazier flames, waterfalls, drifting clouds. Prefer
  shader-driven motion on `kit.ambient.time` (zero JS per frame) for anything that can be expressed that
  way; keep `update` to a few matrix/uniform writes (no allocation, no geometry rebuilds).
- Square colours live in `kit.boardLooks.<name>` (`marble` = Classic, `graveyard` = Halloween) so D28
  contrast is tuned in one place.
- The views look steeply down: even "3D" shows only a 2–5° strip above the board, so a literal sky is
  never seen. Halloween's trick (board.js `skyBackdrop`): a full-screen pass drawn after the opaque scene
  at the far plane (only uncovered pixels pay), whose painted horizon is pinned each frame to the
  projected far rim of the ground plot, and whose moon/skyline scale with the visible strip. The ground
  shader cuts its far edge as a straight line across the screen so the two meet seamlessly.

## 9. Testing
Gallery: `?theme=<id>&mode=lineup|turntable|play&view=all|top|default|angle`; in the playground
`&anim=<label or function name>` forces that move/battle anim whenever it fits the piece (the labels are
listed under the board) and `&ambient=0` turns idle flicker off. Lineup shows every piece
on both square colours; Turntable spins it; Playground plays random legal moves with speed Off/1/2/5
and demo buttons for castling, en passant and promotion. Stats under the board show draw calls,
triangles and tris per piece. Screenshot at 360×740 and 1440×900 and look at Top view first.

## 10. Name tags
Tapping a piece (or hovering it with a mouse) shows a small name tag over its head. By default it
says the chess name; give your theme `names: {p:'Squire', n:'Dragon Knight', b:'Wizard', …}` and the
tag shows your name with the chess name underneath. Keep names short (≤ 14 characters).

## 11. Sounds (audio agent — details in docs/notes/audio.md)
**Battle anims**: `import { sfx } from '../../audio/index.js';` then, at the moment it happens in
your timeline (after the `await ctx.wait()/tween()` that leads there, never setTimeout):
`sfx('clash', { ctx, at: ctx.victimPos })`. Passing `ctx` gives battle-speed scaling (1×/2×/5×,
online cap) and skip handling (a tapped-through battle stops its sounds instead of dumping
them). `at` (Vector3 / 'e4') pans subtly. Optional `delay` (s), `gain`.
Names every theme can use: swing clash hit thud knock stone topple slide stomp poof · zap
sparkle thunder fire explosion laser roar · bats wail creak pop hex · whoosh
(aliases: sword, magic, flame, boom, bat, ghost, grave, pumpkin, fall, shove…). If a battle
plays any sfx the default capture clack is skipped; if it plays none, the clack plays at the end.
**Theme sounds**: add `js/themes/<id>/sounds.js` and ONE line in index.js:
`sounds: () => import('./sounds.js'),`. It exports recipes `{dur, lvl, variants?, punch?, build(s, v)}`
built with `js/audio/dsp.js` helpers (copy `classic/sounds.js`), overriding any core or battle
name (move, capture, castle, check, promote, clash…), plus optional
`music: {file, loop, xfade}` for `assets/audio/music/<file>.{ogg,m4a}`. Levels are normalised for you.
