// C2 / D27: the Palace Lawn (C-Tower 3) inside C-Tower 1's world: a striped croquet-lawn strip at the foot of the castle
// hill, gravel walks, a box parterre, topiary, a fountain, the Orangery (terminal), the gilded folly (C-Tower 3) with
// Mr Fennimore the butler waving his flags on the terrace. Data: data/airports/palace.js. Everything is merged into
// two meshes (ground: lawn stripes + gravel + beds; garden: buildings, hedges, topiary) that cull as one away from it.
import * as THREE from 'three';
import { Builder, col, mat, inRect } from './util.js';
import palace, { LAWN } from '../../data/airports/palace.js';
import { headingToVec } from './layout.js';

const { P, ROT } = LAWN;
const RY = -ROT * Math.PI / 180;       // local +X (the lawn axis) to world, as a Y rotation of local geometry
const LH = 90 + ROT;                   // lawn heading
const STONE = col('#ece3cb'), STONE2 = col('#cdbd96'), GOLD = col('#e2ac2c'), LEAD = col('#5b6170'), GLASS = col('#9fb8c4', 0.85);
const HEDGE = col('#2b4a22'), HEDGE2 = col('#36592a'), TOPI = col('#2f5226'), GRAVEL = col('#d9cfb2', 1.38), GRAVEL2 = col('#c9bd9c', 1.38);
const WATER = col('#5d97b0'), WHITE = col('#f4f2ea'), WHITE_G = col('#f4f2ea', 1.4);

// local (x along the lawn, z across: -z toward the castle) → world, for ground quads and boxes
const W = (x, z) => P([x, z]);
const vecL = headingToVec(LH);

function rectL(b, x, z, len, wid, y, c) {
  const [wx, wz] = W(x, z);
  b.rect(wx, wz, vecL[0], vecL[1], len, wid, y, c);
}
const boxL = (b, x, y, z, sx, sy, sz, c) => { const [wx, wz] = W(x, z); b.box(wx, y, wz, sx, sy, sz, c, RY); };
const geoL = (b, g, x, y, z, c, ry = 0) => { const [wx, wz] = W(x, z); b.geo(g, mat(wx, y, wz, 0, RY + ry), c); };

// M, T: the town's matte and metal builders (the palace merges into them: no draw calls of its own but the ground)
export function buildPalace(flags, atlas, quality, gravelMap, M, T) {
  const G = new Builder();
  const colliders = [], trees = [];
  const hi = quality !== 'low';

  // ---- ground: the striped croquet lawn (the strip runs down its middle), gravel walks, forecourt, drive, beds ----
  // (the lawn itself is the terrain's mown grass with croquet stripes: js/world/terrain.js, PALACE_LAWN_GLSL)
  for (const s of [-1, 1]) rectL(G, s * 120, 0, 0.6, 24, 0.05, WHITE_G);   // painted thresholds
  for (let k = 0; k < 12; k++) for (const s of [-1, 1]) rectL(G, -110 + k * 20, s * 12.5, 1.2, 0.3, 0.05, WHITE_G);   // edge marks
  for (const t of palace.taxiways) {
    const [a, b] = t.points, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    G.rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (b[0] - a[0]) / L, (b[1] - a[1]) / L, L + 8, 8, 0.05, GRAVEL);
  }
  rectL(G, 0, -141, 196, 16, 0.045, GRAVEL);                               // ...the gravel sweep past the steps
  for (const x of [-60, 0, 60]) rectL(G, x, -117, 12, 34, 0.045, GRAVEL);   // ...and a lane from each stand to the walk
  for (const x of [-60, 0, 60]) rectL(G, x, -147, 3, 14, 0.09, col('#9e1b24'));   // red carpets at the stands
  rectL(G, 0, -183, 96, 22, 0.05, GRAVEL);                                // terrace in front of the Orangery
  rectL(G, 0, -341, 14, 260, 0.05, GRAVEL2);                              // the drive up to the castle road
  for (const s of [-1, 1]) {                                              // parterres: muted beds inside box hedges
    rectL(G, s * 165, -161, 70, 60, 0.04, col('#4b7330'));
    for (let k = 0; k < 6; k++) rectL(G, s * 165 - 28 + k * 11.2, -161, 5, 44, 0.05, [col('#8e2a3c'), col('#cfc6b0'), col('#5e3a7a')][k % 3]);
  }
  // ---- box hedges (low, 0.8 m) edging the parterres and the gravel walk ----
  const hedgeL = (x0, z0, x1, z1, h = 0.8, w = 1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), [wx, wz] = W((x0 + x1) / 2, (z0 + z1) / 2);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    M.box(wx, h / 2, wz, L, h, w, HEDGE, RY - ang);
  };
  for (const s of [-1, 1]) {
    const cx = s * 165;
    hedgeL(cx - 35, -191, cx + 35, -191); hedgeL(cx - 35, -131, cx + 35, -131);
    hedgeL(cx - 35, -191, cx - 35, -131); hedgeL(cx + 35, -191, cx + 35, -131);
    hedgeL(cx - 25, -161, cx + 25, -161, 0.6, 0.8);
  }
  hedgeL(-100, -171, -50, -171, 1.1); hedgeL(50, -171, 100, -171, 1.1);


  // ---- topiary, fountain, flagpoles, yew walls, the ha-ha, trees and the butler: data/airports/palace.js props ----
  const cone = (x, z, h) => M.geo(new THREE.ConeGeometry(h * 0.32, h, hi ? 10 : 7), mat(x, h / 2, z), TOPI);
  const ball = (x, z, r, y = r) => M.geo(new THREE.SphereGeometry(r, hi ? 10 : 7, hi ? 7 : 5), mat(x, y, z), HEDGE2);
  const wall = (a, b, h, c, w = 2) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); M.box((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2, L, h, w, c, -Math.atan2(b[1] - a[1], b[0] - a[0])); };
  for (const p of palace.props) {
    const [x, , z] = p.center || [];
    if (p.kind === 'topiary' && p.shape === 'cone') cone(x, z, p.h);
    else if (p.kind === 'topiary' && p.shape === 'ball') ball(x, z, p.h / 2);
    else if (p.kind === 'topiary') {   // the peacock: body, neck, head and a fanned tail
      const q = (dx) => [x + Math.cos(RY) * dx, z - Math.sin(RY) * dx];
      ball(...q(0), 1.2, 1.2); ball(...q(0), 0.8, 2.6); ball(...q(1.4), 0.45, 3.5);
      const [tx, tz] = q(-2.2); M.geo(new THREE.ConeGeometry(1.6, 2.4, 7), mat(tx, 1.7, tz, 0, RY, Math.PI / 2), HEDGE2);
    } else if (p.kind === 'hedge') wall(p.pts[0], p.pts[1], p.h, p.wall ? STONE2 : HEDGE, p.wall ? 0.8 : 2);
    else if (p.kind === 'flagpole') {
      T.geo(new THREE.CylinderGeometry(0.07, 0.1, p.h, 6), mat(x, p.h / 2, z), col('#e8e8e8'));
      T.geo(new THREE.SphereGeometry(0.18, 8, 6), mat(x, p.h + 0.1, z), GOLD);
      flags.push({ x: x + 0.07, y: p.h - 0.5, z, w: 2.4, h: 1.6, rect: atlas.uv[p.flag], phase: x * 0.03 });
    } else if (p.kind === 'tree') trees.push([x, z, p.sp, p.h]);
  }
  { const [hx, hz] = W(0, 80.4); G.rect(hx, hz, vecL[0], vecL[1], 420, 3, 0.05, col('#4a5a2c', 1.2)); }   // the ha-ha's ditch

  // ---- fountain on the terrace axis ----
  {
    const [fx, , fz] = palace.props.find((p) => p.kind === 'fountain').center;
    M.geo(new THREE.CylinderGeometry(7, 7.3, 0.8, hi ? 28 : 16), mat(fx, 0.4, fz), STONE2);
    M.geo(new THREE.CircleGeometry(6.4, hi ? 28 : 16).rotateX(-Math.PI / 2), mat(fx, 0.75, fz), WATER);
    M.geo(new THREE.CylinderGeometry(0.6, 0.9, 3.2, 10), mat(fx, 1.6, fz), STONE);
    M.geo(new THREE.CylinderGeometry(2.4, 1.2, 0.5, 14), mat(fx, 3.2, fz), STONE);
    T.geo(new THREE.SphereGeometry(0.55, 10, 7), mat(fx, 4.1, fz), GOLD);
    M.geo(new THREE.ConeGeometry(0.9, 2.2, 8, 1, true), mat(fx, 5.0, fz), col('#eaf4f8'));
    colliders.push({ min: [fx - 7, 0, fz - 7], max: [fx + 7, 4.6, fz + 7], kind: 'house' });
  }

  // ---- croquet: hoops (white wire), a striped peg, mallets left on the lawn margin ----
  for (const [x, z] of [[-90, 28], [-50, 32], [-10, 28], [30, 32], [70, 28], [100, 32]]) {
    const [hx, hz] = W(x, z);
    for (const s of [-1, 1]) G.box(hx + Math.cos(RY) * s * 0.25, 0.16, hz - Math.sin(RY) * s * 0.25, 0.04, 0.32, 0.04, WHITE, RY);
    G.box(hx, 0.32, hz, 0.54, 0.04, 0.04, WHITE, RY);
  }
  { const [px, pz] = W(10, 31); G.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), mat(px, 0.45, pz), col('#2a5bd7')); }

  // ---- the Orangery (terminal): stone end pavilions, tall glazed bays with white glazing bars, a balustrade with urns,
  //      a pedimented centre under a gilded dome ----
  {
    const t = palace.terminal, [w, d] = t.size, h = t.height, tz = -201, fz = tz + d / 2;
    boxL(M, 0, 0.5, tz, w + 3, 1.0, d + 3, STONE2);
    boxL(M, 0, h / 2, tz, w - 2, h, d - 1, col('#3c4a52'));                    // dark glass behind the bays
    for (let k = 0; k <= 12; k++) {
      const x = -w / 2 + 1 + k * (w - 2) / 12;
      boxL(M, x, h / 2, fz + 0.3, 1.4, h, 1.0, STONE);                         // pilasters
      if (k < 12) for (const yy of [h * 0.36, h * 0.68]) boxL(M, x + (w - 2) / 24, yy, fz - 0.1, (w - 2) / 12 - 1.4, 0.18, 0.2, WHITE);
      if (k < 12) boxL(M, x + (w - 2) / 24, h * 0.52, fz - 0.1, 0.16, h - 2, 0.2, WHITE);
    }
    boxL(M, 0, h + 0.45, tz, w + 1.6, 0.9, d + 1.6, STONE);                   // cornice
    boxL(M, 0, h + 1.3, tz, w - 2, 0.9, d - 2, GLASS);                       // lantern roof
    for (let k = 0; k <= 16; k++) boxL(M, -w / 2 + k * w / 16, h + 1.5, fz + 0.4, 0.5, 1.2, 0.5, STONE2);   // balustrade
    boxL(M, 0, h + 2.05, fz + 0.4, w, 0.3, 0.7, STONE);
    for (let k = 0; k <= 4; k++) geoL(T, new THREE.SphereGeometry(0.45, 8, 6), -w / 2 + k * w / 4, h + 2.6, fz + 0.4, GOLD);
    for (const sx of [-1, 1]) boxL(M, sx * (w / 2 + 2), (h + 2) / 2, tz, 8, h + 2, d + 2, STONE);   // end pavilions
    boxL(M, 0, (h + 4) / 2, tz + 1, 16, h + 4, d + 2, STONE);                 // centre pavilion
    for (let k = -1; k <= 1; k += 2) boxL(M, k * 5.5, (h + 2) / 2, fz + 2.2, 1.6, h + 2, 1.6, STONE2);   // columns
    boxL(M, 0, h / 2 - 0.5, fz + 1.05, 5, h - 1, 0.2, col('#2c3140'));        // doors
    const [cx, cz] = W(0, tz + 1);
    { const sh = new THREE.Shape([new THREE.Vector2(-9, 0), new THREE.Vector2(9, 0), new THREE.Vector2(0, 3.4)]);
      geoL(M, new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false }), 0, h + 4, fz + 0.4, STONE2); }   // pediment
    T.geo(new THREE.SphereGeometry(5, hi ? 16 : 10, hi ? 8 : 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(cx, h + 4, cz), GOLD);
    T.geo(new THREE.ConeGeometry(0.4, 2.2, 8), mat(cx, h + 10, cz), GOLD);
    colliders.push(aabb(0, tz, w + 12, d + 4, h + 9, 'house'));
  }

  // ---- the gilded folly: C-Tower 3, a little octagonal tower with a glazed cab and a golden onion ----
  {
    const tp = palace.tower.position, [x, z] = [tp[0], tp[2]], h = palace.tower.height;
    M.geo(new THREE.CylinderGeometry(3.2, 3.6, h - 4, 8), mat(x, (h - 4) / 2, z), STONE);
    M.geo(new THREE.CylinderGeometry(3.8, 3.8, 0.6, 8), mat(x, h - 4, z), STONE2);
    M.geo(new THREE.CylinderGeometry(3.0, 3.0, 2.6, 8), mat(x, h - 2.4, z), col('#2a3644'));
    M.geo(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 8), mat(x, h - 0.9, z), STONE2);
    T.geo(new THREE.SphereGeometry(2.8, hi ? 14 : 8, hi ? 10 : 6), mat(x, h + 1.3, z, 0, 0, 0, 1, 1.25, 1), GOLD);
    T.geo(new THREE.ConeGeometry(0.6, 3.2, 8), mat(x, h + 5.2, z), GOLD);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4;
      M.box(x + Math.cos(a) * 3.3, h * 0.35, z + Math.sin(a) * 3.3, 0.6, 1.8, 0.6, col('#3b3530'), -a);
    }
    T.geo(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), mat(x, h + 7.5, z), col('#e8e8e8'));
    flags.push({ x: x + 0.06, y: h + 10.2, z, w: 2.6, h: 1.7, rect: atlas.uv.flag, phase: 1.3 });
    colliders.push({ min: [x - 4, 0, z - 4], max: [x + 4, h + 7, z + 4], kind: 'house' });
  }

  // ---- Mr Fennimore on the terrace: tailcoat, white shirt front, a semaphore flag in each hand ----
  const butler = new Builder();
  {
    const B = butler, k = 1.0;
    B.box(0, 0.45 * k, 0, 0.34, 0.9 * k, 0.24, col('#15161a'));                     // legs
    B.box(0, 1.25 * k, 0, 0.5, 0.75 * k, 0.3, col('#15161a'));                     // tailcoat
    B.box(0, 1.3 * k, -0.16, 0.18, 0.5 * k, 0.04, WHITE);                           // shirt front
    B.geo(new THREE.SphereGeometry(0.15, 8, 6), mat(0, 1.8 * k, 0), col('#e6b897'));  // head
    B.box(0, 1.93 * k, 0, 0.26, 0.06, 0.26, col('#3a3a3a'));                         // a neat parting
    for (const s of [-1, 1]) {
      B.beam([s * 0.27, 1.55, 0], [s * 0.72, 2.2, -0.05], 0.09, col('#15161a'));     // arms up
      B.beam([s * 0.72, 2.2, -0.05], [s * 0.78, 2.9, -0.05], 0.03, col('#8a6a3a'));  // flag sticks
      B.box(s * 0.98, 2.72, -0.05, 0.42, 0.34, 0.02, s < 0 ? col('#c4122f') : col('#f2c21b'));
    }
  }
  { const [bx, , bz] = palace.props.find((p) => p.kind === 'butler').center;
    M.geo(butler.build(), mat(bx, 0, bz, 0, RY + Math.PI * 0.75, 0, 1.25, 1.25, 1.25)); }   // a butler of some stature
  const gg = G.build(), gp = gg.attributes.position, uv = new Float32Array(gp.count * 2);
  for (let k = 0; k < gp.count; k++) { uv[k * 2] = gp.getX(k) / 3; uv[k * 2 + 1] = gp.getZ(k) / 3; }
  gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, map: gravelMap, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ground.receiveShadow = true; ground.name = 'palaceGround'; ground.renderOrder = -8;
  return { ground, colliders, trees };
}

function aabb(lx, lz, w, d, h, kind) {
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => P([lx + a, lz + b]));
  return { min: [Math.min(...pts.map((p) => p[0])), 0, Math.min(...pts.map((p) => p[1]))], max: [Math.max(...pts.map((p) => p[0])), h, Math.max(...pts.map((p) => p[1]))], kind };
}

// Surface rects of the lawn layout in C-Tower 1's world: the lawn strip rolls as a runway, the gravel walks are
// taxiways and the forecourt an apron. Same shape as js/world/geom.js FRAMES / SEGMENTS.
const rw = palace.runways[0], [rdx, rdz] = headingToVec(rw.heading);
export const PALACE_FRAME = { id: rw.id, cx: rw.center[0], cz: rw.center[2], dx: rdx, dz: rdz, L: rw.length,
  rect: { cx: rw.center[0], cz: rw.center[2], dx: rdx, dz: rdz, len: rw.length, wid: rw.width } };
const SEGS = palace.taxiways.map((t) => {
  const [a, b] = t.points, len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  return { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, dx, dz, len: len + 8, wid: 8 };
});
const APRON = (() => { const a = palace.aprons[0], [dx, dz] = headingToVec(90 + a.heading); return { cx: a.center[0], cz: a.center[2], dx, dz, len: a.size[0], wid: a.size[1] }; })();
export function palaceSurface(x, z) {
  if (Math.abs(x - rw.center[0]) > 400 || Math.abs(z - rw.center[2]) > 400) return null;
  if (inRect(x, z, PALACE_FRAME.rect)) return 'runway';
  for (const S of SEGS) if (inRect(x, z, S)) return 'taxiway';
  if (inRect(x, z, APRON)) return 'apron';
  return null;
}
// the lawn's grounds (mown, no field patchwork, no woods): 0..1
// croquet stripes for the terrain shader's mown grass, inside the lawn (294 × 74 m) around the strip
export function palaceLawnGLSL() {
  return `{ vec2 r = w - vec2(${rw.center[0].toFixed(1)}, ${rw.center[2].toFixed(1)});
    float a = dot(r, vec2(${rdx.toFixed(4)}, ${rdz.toFixed(4)})), b = dot(r, vec2(${(-rdz).toFixed(4)}, ${rdx.toFixed(4)}));
    float inL = (1.0 - smoothstep(145.0, 147.0, abs(a))) * (1.0 - smoothstep(35.0, 37.0, abs(b)));
    float edge = (1.0 - smoothstep(147.0, 148.5, abs(a))) * (1.0 - smoothstep(37.0, 38.5, abs(b))) - inL;
    gr = mix(gr, gr * vec3(1.02, 1.12, 0.92) * (1.0 + 0.17 * stripes(a, 5.0)), inL);
    gr = mix(gr, gr * vec3(1.25, 1.1, 0.8), edge * 0.6); }`;
}
export function palaceGrounds(x, z) {
  const rx = x - rw.center[0], rz = z - rw.center[2], a = rx * rdx + rz * rdz, b = -rx * rdz + rz * rdx;
  const d = Math.max(Math.abs(a) - 240, b < 0 ? -b - 320 : b - 90, 0);
  return 1 - Math.min(1, d / 25);
}
