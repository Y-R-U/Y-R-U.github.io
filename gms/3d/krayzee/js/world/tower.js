import * as THREE from 'three';
import { Builder, col, mat } from './util.js';
import royal from '../../data/airports/royal.js';
const TOWER = royal.tower;
import { buildCrown, decalQuad } from './terminal.js';

const CONC = col('#e4ddd0'), CONC2 = col('#cfc7b8'), DARK = col('#2b2f34'), PURPLE = col('#4b1f7a'), GOLD = col('#e2ac2c');
const SIDES = 8;

function ring(r, k) { const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES; return [Math.cos(a) * r, Math.sin(a) * r]; }

export function buildTower(B, atlas, quality) {
  const { matte: M, metal: T, glass: G, decal: D, lit: L } = B;
  const [tx, , tz] = TOWER.position;
  const cabFloor = TOWER.height - 4.6, cabTop = cabFloor + 3.7;
  const bowl0 = cabFloor - 4.2, bowl1 = cabFloor - 2.0;
  const low = quality === 'low';
  const oct = (r, y, h, c, ox = 0, oz = 0, rTop = r) => M.geo(new THREE.CylinderGeometry(rTop, r, h, SIDES), mat(tx + ox, y + h / 2, tz + oz, 0, Math.PI / SIDES), c);
  const face = (k) => (k + 0.5) / SIDES * Math.PI * 2 + Math.PI / SIDES;
  const apo = Math.cos(Math.PI / SIDES);

  // ---- ops building at the foot ----
  const bx = tx + 9, bz = tz - 1, bS = bz + 6;
  M.box(bx, 3.6, bz, 16, 7.2, 12, CONC);
  M.box(bx, 0.3, bz, 16.3, 0.6, 12.3, CONC2);
  M.box(bx, 7.35, bz, 16.6, 0.3, 12.6, CONC2);
  for (const [x0, z0, x1, z1] of [[-8.3, -6.3, 8.3, -6.1], [-8.3, 6.1, 8.3, 6.3], [-8.3, -6.3, -8.1, 6.3], [8.1, -6.3, 8.3, 6.3]]) M.box(bx + (x0 + x1) / 2, 7.8, bz + (z0 + z1) / 2, x1 - x0, 0.6, z1 - z0, CONC);
  M.box(bx + 4, 8.1, bz - 2, 3.2, 1.2, 2.4, col('#b9bcbf'));
  M.box(bx + 4, 8.75, bz - 2, 3.3, 0.1, 2.5, col('#8f9397'));
  for (const dx of [-0.75, 0.75]) M.geo(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), mat(bx + 4 + dx, 8.8, bz - 2), DARK);
  M.box(bx - 3, 7.9, bz - 3, 1.6, 0.8, 1.2, col('#b9bcbf'));
  T.geo(new THREE.SphereGeometry(0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(bx + 6, 8.4, bz + 3, -1.1, 0.6), col('#e8e8e8'));
  const winRow = (y, z, dir) => {
    for (let x = bx - 6.5; x <= bx + 6.6; x += 2.6) {
      if (dir > 0 && y < 3 && Math.abs(x - (bx - 1.3)) < 2) continue;
      const q = (a, b2) => dir > 0 ? [a, b2] : [b2, a];
      const [x0, x1] = q(x - 0.9, x + 0.9);
      G.quad([x0, y, z + dir * 0.03], [x1, y, z + dir * 0.03], [x1, y + 1.5, z + dir * 0.03], [x0, y + 1.5, z + dir * 0.03], [1, 1, 1]);
      M.box(x, y - 0.06, z + dir * 0.08, 2.0, 0.12, 0.18, CONC2);
      M.box(x, y + 0.75, z + dir * 0.05, 0.08, 1.5, 0.08, DARK);
    }
  };
  for (const y of [1.4, 4.4]) { winRow(y, bS, 1); winRow(y, bz - 6, -1); }
  for (const y of [1.4, 4.4]) for (let z = bz - 4; z <= bz + 4; z += 2.6) G.quad([bx + 8.03, y, z + 0.9], [bx + 8.03, y, z - 0.9], [bx + 8.03, y + 1.5, z - 0.9], [bx + 8.03, y + 1.5, z + 0.9], [1, 1, 1]);
  // entrance: glass doors, canopy on posts, purple runner
  G.quad([bx - 2.6, 0.05, bS + 0.04], [bx, 0.05, bS + 0.04], [bx, 2.6, bS + 0.04], [bx - 2.6, 2.6, bS + 0.04], col('#ffffff'));
  L.quad([bx - 2.55, 0.05, bS - 0.25], [bx - 0.05, 0.05, bS - 0.25], [bx - 0.05, 2.55, bS - 0.25], [bx - 2.55, 2.55, bS - 0.25], col('#f3e2bd', 0.8));
  M.box(bx - 1.3, 1.3, bS + 0.06, 0.1, 2.6, 0.1, DARK);
  M.box(bx - 1.3, 3.1, bS + 1.4, 4.6, 0.25, 2.8, CONC2);
  M.box(bx - 1.3, 3.27, bS + 2.75, 4.7, 0.1, 0.1, PURPLE);
  for (const dx of [-3.4, 0.8]) T.geo(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), mat(bx + dx, 1.5, bS + 2.6), col('#d8d8d8'));
  M.box(bx - 1.3, 0.03, bS + 2.2, 1.6, 0.06, 4.4, col('#5a2490'));
  decalQuad(D, atlas.uv.ctwr, bx + 3.4, 6.2, bS + 0.05, 6.6, 1.1);
  decalQuad(D, atlas.uv.crest, bx - 1.3, 4.4, bS + 0.05, 1.6, 1.6);

  // ---- shaft: tapered octagon, corner pilasters, floor bands ----
  const sh0 = 3.6, sh1 = 3.0, shH = bowl0;
  const rAt = (y) => sh0 + (sh1 - sh0) * (y / shH);
  oct(sh0, 0, shH, CONC, 0, 0, sh1);
  for (let k = 0; k < SIDES; k++) {
    const [ax, az] = ring(sh0 + 0.12, k), [cx, cz] = ring(sh1 + 0.12, k);
    M.beam([tx + ax, 0, tz + az], [tx + cx, shH, tz + cz], 0.42, CONC2);
  }
  for (let y = 4.2; y < shH - 1; y += 4.2) oct(rAt(y) + 0.14, y - 0.12, 0.24, CONC2);
  // slot windows on the four cardinal faces, staggered like a stair
  for (let k = 0; k < SIDES; k += 2) {
    const a = face(k), cx = Math.cos(a), cz = Math.sin(a), ux = cz, uz = -cx;
    for (let y = 9 + (k % 4) * 1.05; y < shH - 2; y += 4.2) {
      const r0 = rAt(y) * apo + 0.03, r1 = rAt(y + 1.7) * apo + 0.03;
      G.quad([tx + cx * r0 - ux * 0.32, y, tz + cz * r0 - uz * 0.32], [tx + cx * r0 + ux * 0.32, y, tz + cz * r0 + uz * 0.32],
        [tx + cx * r1 + ux * 0.32, y + 1.7, tz + cz * r1 + uz * 0.32], [tx + cx * r1 - ux * 0.32, y + 1.7, tz + cz * r1 - uz * 0.32], [0.6, 0.65, 0.7]);
    }
  }
  // stair/lift core on the north-west side with a glazed stair strip
  const coreX = -3.7, coreZ = -0.6, coreH = bowl0 + 1.2;
  M.box(tx + coreX, coreH / 2, tz + coreZ, 2.6, coreH, 2.6, CONC2);
  M.box(tx + coreX, coreH + 0.9, tz + coreZ, 2.2, 1.8, 2.2, CONC);
  M.box(tx + coreX, coreH + 1.85, tz + coreZ, 2.5, 0.12, 2.5, DARK);
  M.quad([tx + coreX - 1.31, 1.0, tz + coreZ - 0.5], [tx + coreX - 1.31, 1.0, tz + coreZ + 0.5], [tx + coreX - 1.31, coreH - 0.6, tz + coreZ + 0.5], [tx + coreX - 1.31, coreH - 0.6, tz + coreZ - 0.5], col('#34414c'));
  G.quad([tx + coreX - 1.33, 1.0, tz + coreZ - 0.5], [tx + coreX - 1.32, 1.0, tz + coreZ + 0.5], [tx + coreX - 1.32, coreH - 0.6, tz + coreZ + 0.5], [tx + coreX - 1.32, coreH - 0.6, tz + coreZ - 0.5], [0.75, 0.82, 0.86]);
  for (let y = 1; y < coreH - 0.6; y += 2.1) M.box(tx + coreX - 1.36, y, tz + coreZ, 0.06, 0.1, 1.1, DARK);
  for (let y = 3; y < coreH - 1; y += 4.2) {
    M.quad([tx + coreX + 0.3, y, tz + coreZ - 1.32], [tx + coreX - 0.3, y, tz + coreZ - 1.32], [tx + coreX - 0.3, y + 1.2, tz + coreZ - 1.32], [tx + coreX + 0.3, y + 1.2, tz + coreZ - 1.32], col('#34414c'));
    M.quad([tx + coreX - 0.3, y + 2.1, tz + coreZ + 1.32], [tx + coreX + 0.3, y + 2.1, tz + coreZ + 1.32], [tx + coreX + 0.3, y + 3.3, tz + coreZ + 1.32], [tx + coreX - 0.3, y + 3.3, tz + coreZ + 1.32], col('#34414c'));
  }
  // royal banner down the runway (south) face: purple with gold edging, crest and a swallowtail
  {
    const a = face(1), cx = Math.cos(a), cz = Math.sin(a), ux = cz, uz = -cx;
    const y0 = 9.5, y1 = shH - 1.6, w = 2.5;
    const P = (lx, y, d = 0.06) => { const r = rAt(y) * apo + 0.2 + d; return [tx + cx * r + ux * lx, y, tz + cz * r + uz * lx]; };
    const PUR = col('#5a2490');
    M.quad(P(-w / 2, y0 + 1.2), P(w / 2, y0 + 1.2), P(w / 2, y1), P(-w / 2, y1), PUR);
    M.quad(P(-w / 2, y0), P(0, y0 + 1.2), P(0, y0 + 1.2), P(-w / 2, y0 + 1.2), PUR);
    M.quad(P(w / 2, y0), P(w / 2, y0 + 1.2), P(0, y0 + 1.2), P(0, y0 + 1.2), PUR);
    for (const lx of [-w / 2 - 0.06, w / 2 + 0.06]) T.beam(P(lx, y0 + 0.1, 0.02), P(lx, y1, 0.02), 0.12, GOLD);
    T.beam(P(-w / 2 - 0.25, y1 + 0.1, 0.05), P(w / 2 + 0.25, y1 + 0.1, 0.05), 0.16, GOLD);
    const quadD = (rect, yc, s) => {
      const u = [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]];
      D.quad(P(-s / 2, yc - s / 2, 0.09), P(s / 2, yc - s / 2, 0.09), P(s / 2, yc + s / 2, 0.09), P(-s / 2, yc + s / 2, 0.09), [1, 1, 1], u);
    };
    quadD(atlas.uv.crest, y1 - 2.0, 2.3);
    quadD(atlas.uv.crown, y0 + 4.2, 1.7);
  }

  // ---- equipment floor (bowl + louvred band) ----
  M.geo(new THREE.CylinderGeometry(5.2, sh1, bowl1 - bowl0, SIDES), mat(tx, (bowl0 + bowl1) / 2, tz, 0, Math.PI / SIDES), CONC);
  oct(5.2, bowl1, cabFloor - 0.15 - bowl1, CONC2);
  for (let k = 0; k < SIDES; k++) {
    const a = face(k), cx = Math.cos(a), cz = Math.sin(a), ux = cz, uz = -cx, r = 5.2 * apo + 0.02, hw = 5.2 * Math.sin(Math.PI / SIDES) - 0.25;
    const y0 = bowl1 + 0.35, y1 = cabFloor - 0.5;
    G.quad([tx + cx * r - ux * hw, y0, tz + cz * r - uz * hw], [tx + cx * r + ux * hw, y0, tz + cz * r + uz * hw], [tx + cx * r + ux * hw, y1, tz + cz * r + uz * hw], [tx + cx * r - ux * hw, y1, tz + cz * r - uz * hw], [0.45, 0.5, 0.55]);
    for (let s = -1; s <= 1; s += 0.5) M.box(tx + cx * (r + 0.03) + ux * hw * s, (y0 + y1) / 2, tz + cz * (r + 0.03) + uz * hw * s, 0.08, y1 - y0, 0.08, DARK, -a);
  }
  // catwalk deck + railing
  oct(6.5, cabFloor - 0.22, 0.3, CONC2);
  M.geo(new THREE.CylinderGeometry(6.55, 6.55, 0.1, SIDES), mat(tx, cabFloor + 0.13, tz, 0, Math.PI / SIDES), PURPLE);
  for (let k = 0; k < SIDES; k++) {
    const [ax, az] = ring(6.38, k), [bx2, bz2] = ring(6.38, k + 1);
    for (const y of [1.1, 0.6]) T.beam([tx + ax, cabFloor + y, tz + az], [tx + bx2, cabFloor + y, tz + bz2], y > 1 ? 0.07 : 0.04, col('#e6e6e6'));
    for (let s = 0; s < 4; s++) T.box(tx + ax + (bx2 - ax) * s / 4, cabFloor + 0.6, tz + az + (bz2 - az) * s / 4, 0.05, 1.1, 0.05, col('#e6e6e6'));
  }

  // ---- cab: outward-leaning glass, mullions, lit ceiling, blinds, consoles ----
  const rb = 4.9, rt = 5.6;
  for (let k = 0; k < SIDES; k++) {
    const [ax, az] = ring(rb, k), [bx2, bz2] = ring(rb, k + 1), [cx, cz] = ring(rt, k + 1), [dx, dz] = ring(rt, k);
    const y0 = cabFloor + 0.9, y1 = cabTop;
    G.quad([tx + bx2, y0, tz + bz2], [tx + ax, y0, tz + az], [tx + dx, y1, tz + dz], [tx + cx, y1, tz + cz], col('#dff3ea'));
    M.beam([tx + ax, y0 - 0.05, tz + az], [tx + dx, y1 + 0.05, tz + dz], 0.15, DARK);
    const [ex, ez] = ring(rb, k), [fx, fz] = ring(rb, k + 1);
    M.geo(new THREE.BoxGeometry(Math.hypot(fx - ex, fz - ez), 0.9, 0.14), mat(tx + (ex + fx) / 2, cabFloor + 0.45, tz + (ez + fz) / 2, 0, -Math.atan2(fz - ez, fx - ex)), CONC2);
    M.beam([tx + ex, y0, tz + ez], [tx + fx, y0, tz + fz], 0.12, DARK);
    if (k % 3 !== 1) {
      const t = 0.82, s = 0.1;
      const lp = (x0, z0, x1, z1, f) => [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
      const [px, pz] = lp(ax, az, dx, dz, t), [qx, qz] = lp(bx2, bz2, cx, cz, t);
      M.quad([tx + qx * (1 - s * 0.02), y0 + (y1 - y0) * t, tz + qz * (1 - s * 0.02)], [tx + px * (1 - s * 0.02), y0 + (y1 - y0) * t, tz + pz * (1 - s * 0.02)],
        [tx + dx * 0.98, y1 - 0.02, tz + dz * 0.98], [tx + cx * 0.98, y1 - 0.02, tz + cz * 0.98], col('#3a3f46'));
    }
  }
  M.geo(new THREE.CylinderGeometry(rb - 0.1, rb - 0.1, 0.2, SIDES), mat(tx, cabFloor + 0.1, tz, 0, Math.PI / SIDES), col('#57514a'));
  L.geo(new THREE.CircleGeometry(rt - 0.25, SIDES), mat(tx, cabTop - 0.04, tz, Math.PI / 2, Math.PI / SIDES), col('#fff2d6', 0.92));
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * 0.15 + k * Math.PI * 0.175;
    const r = 3.7, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
    M.geo(new THREE.BoxGeometry(1.7, 1.0, 0.8), mat(x, cabFloor + 0.7, z, 0, -a + Math.PI / 2), col('#3b4048'));
    M.geo(new THREE.BoxGeometry(1.5, 0.04, 0.5), mat(x, cabFloor + 1.22, z, -0.25, -a + Math.PI / 2), col('#59606a'));
    decalQuad(D, atlas.uv.screen, x - Math.cos(a) * 0.25, cabFloor + 1.6, z - Math.sin(a) * 0.25, 0.65, 0.45, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }
  M.geo(new THREE.CylinderGeometry(0.35, 0.35, cabTop - cabFloor, 8), mat(tx, (cabFloor + cabTop) / 2, tz), CONC2);

  // ---- roof: overhang, purple fascia with gold trim and lettering, drum, crown, masts ----
  oct(6.5, cabTop, 0.3, col('#3a3f46'));
  oct(6.62, cabTop + 0.3, 1.0, PURPLE);
  for (const y of [cabTop + 0.3, cabTop + 1.3]) T.geo(new THREE.CylinderGeometry(6.7, 6.7, 0.1, SIDES, 1, true), mat(tx, y, tz, 0, Math.PI / SIDES), GOLD);
  oct(6.4, cabTop + 1.3, 0.12, col('#6d7178'));
  for (let k = 0; k < SIDES; k += 2) {
    const a = face(k + 1);
    const r = 6.62 * apo + 0.03;
    decalQuad(D, atlas.uv.ctwrW, tx + Math.cos(a) * r, cabTop + 0.8, tz + Math.sin(a) * r, 4.3, 0.72, Math.atan2(Math.cos(a), Math.sin(a)));
  }
  oct(2.4, cabTop + 1.42, 1.5, CONC2);
  oct(2.6, cabTop + 2.92, 0.15, col('#3a3f46'));
  buildCrown(T, M, tx, cabTop + 3.07, tz, 1.35);
  // radar on its plinth
  M.geo(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), mat(tx - 4.0, cabTop + 2.0, tz + 1.2), col('#e2e2e2'));
  // lattice antenna mast with crossbars, obstruction light and the royal flag
  const mx = tx + 3.6, mz = tz - 2.4, mH = 9;
  for (const [ox, oz] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]) T.beam([mx + ox, cabTop + 1.4, mz + oz], [mx + ox * 0.4, cabTop + 1.4 + mH, mz + oz * 0.4], 0.07, col('#d63a2a'));
  for (let y = 1.5; y < mH; y += 1.5) {
    const f = 1 - 0.6 * y / mH, h = 0.35 * f;
    T.beam([mx - h, cabTop + 1.4 + y, mz - h], [mx + h, cabTop + 1.4 + y, mz + h], 0.04, col('#f2f2f2'));
    T.beam([mx + h, cabTop + 1.4 + y, mz - h], [mx - h, cabTop + 1.4 + y, mz + h], 0.04, col('#f2f2f2'));
  }
  T.geo(new THREE.CylinderGeometry(0.05, 0.05, 3, 5), mat(mx, cabTop + 1.4 + mH + 1.5, mz), col('#d0d0d0'));
  for (const y of [mH - 1.2, mH - 2.4]) T.geo(new THREE.BoxGeometry(1.8, 0.05, 0.05), mat(mx, cabTop + 1.4 + y, mz, 0, 0.4), col('#d0d0d0'));
  L.geo(new THREE.SphereGeometry(0.2, 8, 6), mat(mx, cabTop + 1.4 + mH + 3.1, mz), col('#ff2a1a', 1.4));
  for (let k = 0; k < SIDES; k += 2) { const [ax, az] = ring(6.62, k); L.geo(new THREE.SphereGeometry(0.13, 6, 4), mat(tx + ax, cabTop + 1.45, tz + az), col('#ff2a1a', 1.3)); }
  for (let k = 1; k < SIDES; k += 2) { const [ax, az] = ring(6.3, k); T.geo(new THREE.CylinderGeometry(0.02, 0.03, 1.6, 4), mat(tx + ax, cabTop + 2.15, tz + az), col('#c08a3a')); }
  B.flags.push({ x: tx - 0.4 + 0.1, y: cabTop + 7.4, z: tz + 3.4, w: 2.6, h: 1.7, rect: atlas.uv.flag, phase: 2.3 });
  T.geo(new THREE.CylinderGeometry(0.06, 0.08, 5.6, 6), mat(tx - 0.4, cabTop + 4.6, tz + 3.4), col('#e8e8e8'));
  T.geo(new THREE.SphereGeometry(0.16, 8, 6), mat(tx - 0.4, cabTop + 7.5, tz + 3.4), GOLD);

  const radar = new Builder();
  radar.geo(new THREE.BoxGeometry(4.2, 0.7, 0.18), mat(0, 0.45, 0.12), col('#eceef0'));
  radar.geo(new THREE.BoxGeometry(4.0, 0.12, 0.5), mat(0, 0.08, -0.05), col('#9aa0a8'));
  for (const x of [-1.5, 0, 1.5]) radar.geo(new THREE.BoxGeometry(0.08, 0.7, 0.4), mat(x, 0.45, -0.08), col('#9aa0a8'));
  radar.geo(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), mat(0, -0.2, 0), col('#5b5f66'));
  const radarMesh = new THREE.Mesh(radar.build(), B.matteMaterial);
  radarMesh.position.set(tx - 4.0, cabTop + 2.85, tz + 1.2);
  radarMesh.castShadow = !low;
  radarMesh.name = 'towerRadar';

  const crew = buildCrew(tx, cabFloor, tz);
  const group = new THREE.Group();
  group.name = 'towerCrew';
  group.add(radarMesh, ...crew.objects);

  const colliders = [
    { min: [tx - 3.9, 0, tz - 3.9], max: [tx + 3.9, cabFloor, tz + 3.9], kind: 'tower' },
    { min: [tx + coreX - 1.4, 0, tz + coreZ - 1.4], max: [tx + coreX + 1.4, coreH + 1.9, tz + coreZ + 1.4], kind: 'tower' },
    { min: [tx - 6.7, bowl0, tz - 6.7], max: [tx + 6.7, cabTop + 4.5, tz + 6.7], kind: 'tower' },
    { min: [tx + 0.8, 0, tz - 7.4], max: [tx + 17.4, 8.8, tz + 5.4], kind: 'tower' },
    { min: [tx - 0.6, 0, tz + 5.4], max: [tx + 1.6, 3.3, tz + 7.9], kind: 'tower' },
    { min: [mx - 0.5, cabTop, mz - 0.5], max: [mx + 0.5, cabTop + mH + 4.6, mz + 0.5], kind: 'mast' },
    { min: [tx - 0.6, cabTop, tz + 2.9], max: [tx + 2.4, cabTop + 7.5, tz + 3.9], kind: 'mast' },
  ];
  function update(dt, t, camera) {
    radarMesh.rotation.y = t * 2.2;
    crew.update(dt, t, camera);
  }
  return { group, colliders, update, cab: new THREE.Vector3(tx, cabFloor + 1.6, tz), crew: crew.people };
}

// Three controllers: seated duo and a standing supervisor; heads follow the camera, the supervisor flaps.
// One skinned mesh: every part is rigidly bound to its own bone, so animating costs a 1 KB bone texture, not a draw call.
function buildCrew(tx, floor, tz) {
  const mat0 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const skinTones = ['#e8b894', '#8d5a3b', '#c99470'];
  const shirts = ['#f2f2f2', '#1f4f8f', '#4b1f7a'];
  const hairs = ['#3a2a1c', '#151312', '#b0a69a'];
  const spots = [
    { a: Math.PI * 0.32, r: 2.75, stand: false },
    { a: Math.PI * 0.62, r: 2.75, stand: false },
    { a: Math.PI * 0.47, r: 1.6, stand: true },
  ];
  const people = [];
  const rootBone = new THREE.Bone();
  const bones = [rootBone], parts = [];
  const bone = (parent, x, y, z, yaw = 0) => { const b = new THREE.Bone(); b.position.set(x, y, z); b.rotation.y = yaw; parent.add(b); bones.push(b); return b; };
  spots.forEach((s, i) => {
    const x = tx + Math.cos(s.a) * s.r, z = tz + Math.sin(s.a) * s.r;
    const yaw = -s.a + Math.PI / 2;
    const body = new Builder();
    const sk = col(skinTones[i]), sh = col(shirts[i]), tr = col('#2c2f38');
    const hip = s.stand ? 1.0 : 0.55;
    if (!s.stand) {
      body.geo(new THREE.BoxGeometry(0.55, 0.08, 0.55), mat(0, 0.5, 0.05), col('#222'));
      body.geo(new THREE.BoxGeometry(0.55, 0.6, 0.08), mat(0, 0.85, -0.25), col('#222'));
      body.geo(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 5), mat(0, 0.25, 0), col('#555'));
      body.geo(new THREE.BoxGeometry(0.36, 0.16, 0.55), mat(0, 0.6, 0.2), tr);
      body.geo(new THREE.BoxGeometry(0.34, 0.5, 0.14), mat(0, 0.3, 0.45), tr);
    } else {
      for (const lx of [-0.1, 0.1]) body.geo(new THREE.BoxGeometry(0.15, 1.0, 0.18), mat(lx, 0.5, 0), tr);
    }
    body.geo(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8), mat(0, hip + 0.31, 0, 0, 0, 0, 1.15, 1, 0.75), sh);
    body.geo(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), mat(0, hip + 0.66, 0), sk);
    const bodyBone = bone(rootBone, x, floor + 0.2, z, yaw);
    parts.push([body, bodyBone]);

    const head = new Builder();
    head.geo(new THREE.SphereGeometry(0.13, 10, 8), mat(0, 0.12, 0, 0, 0, 0, 0.95, 1.08, 1), sk);
    head.geo(new THREE.SphereGeometry(0.138, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0, 0.15, -0.012), col(hairs[i]));
    head.geo(new THREE.TorusGeometry(0.145, 0.018, 4, 12, Math.PI), mat(0, 0.14, 0, 0, Math.PI / 2, 0), col('#111'));
    head.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), mat(0.14, 0.11, 0, 0, 0, Math.PI / 2), col('#111'));
    head.geo(new THREE.BoxGeometry(0.02, 0.02, 0.12), mat(0.12, 0.06, 0.08, 0, 0.5, 0), col('#111'));
    head.geo(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat(0, 0.1, 0.13), sk);
    if (i === 0) head.geo(new THREE.BoxGeometry(0.26, 0.05, 0.02), mat(0, 0.15, 0.13), col('#111'));
    const headBone = bone(bodyBone, 0, hip + 0.7, 0);
    parts.push([head, headBone]);

    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new Builder();
      arm.geo(new THREE.CylinderGeometry(0.055, 0.05, 0.55, 6), mat(0, -0.27, 0), sh);
      arm.geo(new THREE.SphereGeometry(0.055, 6, 4), mat(0, -0.57, 0), sk);
      if (s.stand && side > 0) {
        arm.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), mat(0.0, -0.62, 0.07, Math.PI / 2, 0, 0), col('#1a1a1a'));
      }
      if (i === 1 && side < 0) arm.geo(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), mat(0, -0.64, 0.05), col('#d61f45'));
      const armBone = bone(bodyBone, side * 0.25, hip + 0.58, 0);
      parts.push([arm, armBone]);
      arms.push(armBone);
    }
    people.push({ body: bodyBone, head: headBone, arms, stand: s.stand, yaw, phase: i * 2.1 });
  });

  rootBone.updateMatrixWorld(true);
  const P = [], N = [], C = [], I = [], SI = [];
  for (const [b, bn] of parts) {
    const g = b.build(), k = bones.indexOf(bn), base = P.length / 3;
    g.applyMatrix4(bn.matrixWorld);
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); C.push(...g.attributes.color.array);
    for (const v of g.index.array) I.push(base + v);
    for (let v = 0; v < g.attributes.position.count; v++) SI.push(k, 0, 0, 0);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SI.map((_, n) => (n % 4 ? 0 : 1)), 4));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(geo, mat0);
  mesh.name = 'towerCrewMesh';
  mesh.add(rootBone);
  mesh.bind(new THREE.Skeleton(bones));
  const objects = [mesh];

  const tmp = new THREE.Vector3();
  const cab = new THREE.Vector3(tx, floor, tz);
  function update(dt, t, camera) {
    mesh.visible = !camera || camera.position.distanceToSquared(cab) < 400 * 400;
    if (!mesh.visible) return;
    for (const p of people) {
      p.body.getWorldPosition(tmp);
      let target = 0;
      if (camera) {
        const dx = camera.position.x - tmp.x, dz = camera.position.z - tmp.z;
        target = Math.atan2(dx, dz) - p.yaw;
        target = Math.atan2(Math.sin(target), Math.cos(target));
        target = Math.max(-1.3, Math.min(1.3, target));
      }
      p.head.rotation.y += (target - p.head.rotation.y) * Math.min(1, dt * 3);
      const cyc = (t + p.phase) % 9;
      if (p.stand) {
        const panic = cyc > 6 ? Math.sin((cyc - 6) * 9) : 0;
        const bino = cyc < 5 ? 1 : 0;
        p.arms[0].rotation.x = cyc > 6 ? -2.6 + panic * 0.4 : (bino ? -1.45 : 0.1);
        p.arms[1].rotation.x = cyc > 6 ? -2.6 - panic * 0.4 : (bino ? -1.5 : 0.1);
        p.arms[0].rotation.z = cyc > 6 ? -0.3 : (bino ? -0.45 : 0);
        p.arms[1].rotation.z = cyc > 6 ? 0.3 : (bino ? 0.45 : 0);
        p.head.rotation.x = bino ? -0.15 : 0;
      } else {
        const sip = p.phase > 1 && cyc > 3 && cyc < 4.5;
        p.arms[0].rotation.x = sip ? -2.2 : -0.9 + Math.sin(t * 3 + p.phase) * 0.06;
        p.arms[1].rotation.x = -0.9 + Math.sin(t * 2.6 + p.phase) * 0.08;
        p.arms[0].rotation.z = sip ? 0.5 : 0;
      }
    }
  }
  return { objects, people, update };
}
