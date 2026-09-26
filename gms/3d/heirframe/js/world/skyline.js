import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';
import { lathe } from './geo.js';

const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
const merge = (list) => mergeGeometries(list.map(clean), false);
const C = (rt, rb, h, y, seg = 12) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(0, y + h / 2, 0); return g; };
const B = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
const Tor = (r, t, y) => { const g = new THREE.TorusGeometry(r, t, 4, 28); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };

// Each archetype: { glass, stone, gold } unit geometries (instanced separately).
export function archetypes() {
  const A = [];
  { // needle spire
    const glass = [], stone = [], gold = [];
    let r = 14, y = 0;
    for (let i = 0; i < 5; i++) { const h = 48 - i * 4; glass.push(C(r * 0.92, r, h, y, 8)); stone.push(C(r + 0.8, r + 0.8, 2.2, y + h - 1, 8)); y += h; r *= 0.8; }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; const g = B(1.4, y * 0.96, 2.2, Math.sin(a) * 14.2, 0, Math.cos(a) * 14.2); stone.push(g); }
    gold.push(C(0.3, r, 70, y, 8), Tor(r + 1, 0.6, y + 2), Tor(r * 0.7, 0.4, y + 18));
    A.push({ glass, stone, gold, height: y + 70 });
  }
  { // megatower with ring walkways
    const glass = [], stone = [], gold = [];
    glass.push(C(20, 22, 130, 0, 16), C(16, 18, 110, 130, 16), C(11, 13, 70, 240, 16));
    for (const [y, rr] of [[118, 36], [205, 30]]) {
      stone.push(Tor(rr, 1.6, y));
      stone.push(C(rr + 0.5, rr + 0.5, 1.2, y - 1.6, 20));
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const g = B(1.6, 1.2, rr - 12, 0, y - 1.2, (rr + 12) / 2); g.rotateY(a); stone.push(g); }
    }
    stone.push(C(24, 24, 3, 128, 16), C(19, 19, 3, 238, 16));
    gold.push(C(0.4, 3, 60, 310, 6), Tor(12, 0.8, 300));
    A.push({ glass, stone, gold, height: 370 });
  }
  { // slab tower with fins
    const glass = [B(40, 210, 22, 0, 0, 0), B(30, 30, 16, 0, 210, 0)];
    const stone = [B(2.5, 245, 3, -20.5, 0, 11.5), B(2.5, 245, 3, 20.5, 0, 11.5), B(2.5, 245, 3, -20.5, 0, -11.5), B(2.5, 245, 3, 20.5, 0, -11.5)];
    for (let y = 30; y < 210; y += 45) stone.push(B(41.5, 2, 23.5, 0, y, 0));
    const gold = [B(18, 6, 10, 0, 240, 0), C(0.3, 1.2, 40, 246, 6)];
    A.push({ glass, stone, gold, height: 286 });
  }
  { // saucer tower
    const glass = [C(7, 9, 150, 0, 12), C(14, 22, 10, 158, 24)];
    const stone = [lathe([[0, 150], [34, 154], [36, 156], [34, 158], [0, 160]], 20), C(3, 7, 30, 168, 12)];
    const gold = [Tor(35.5, 0.8, 156), C(0.2, 1, 30, 198, 6)];
    A.push({ glass, stone, gold, height: 228 });
  }
  return A.map((a) => ({ glass: merge(a.glass), stone: merge(a.stone), gold: merge(a.gold), height: a.height }));
}

function statue() {
  // Serene standing figure, stylised: legs, hips, torso, arms, head, halo.
  const parts = [];
  const cap = (r, len, x, y, z, rz = 0, rx = 0) => { const g = new THREE.CapsuleGeometry(r, len, 6, 12); g.rotateZ(rz); g.rotateX(rx); g.translate(x, y, z); parts.push(g); };
  cap(4.2, 34, -4.5, 26, 0, 0.04); cap(4.2, 34, 4.5, 26, 0, -0.04);
  cap(3.2, 30, -5.2, 64, 0.5, 0.02); cap(3.2, 30, 5.2, 64, 0.5, -0.02);
  const torso = lathe([[0, 0], [9.5, 2], [11, 10], [9, 20], [10.5, 30], [12.5, 36], [6, 40], [3, 42], [0, 42]], 24);
  torso.translate(0, 80, 0); parts.push(torso);
  cap(2.6, 26, -14, 104, 0, 0.18); cap(2.6, 26, 14, 104, 0, -0.18);
  cap(2.2, 22, -17.5, 80, 3, 0.08, -0.25); cap(2.2, 22, 17.5, 80, 3, -0.08, -0.25);
  cap(2.2, 6, 0, 124, 0);
  const head = new THREE.SphereGeometry(5.5, 24, 16); head.scale(0.85, 1.1, 0.95); head.translate(0, 133, 0.5); parts.push(head);
  const halo = new THREE.TorusGeometry(10, 0.7, 8, 48); halo.translate(0, 135, -5); parts.push(halo);
  const g = merge(parts);
  const ped = merge([C(34, 38, 10, 0, 24), C(24, 28, 56, 10, 24), C(30, 30, 4, 66, 24)]);
  return { figure: g, ped };
}

export function buildSkyline(ctx) {
  const { scene, M, tier } = ctx;
  const R = rng(77);
  const arch = archetypes();
  const tooClose = (x, z) => {
    if (Math.hypot(x, z + 45) < 215) return true;                       // district, monorail ring
    if (Math.abs(x) < 26 && z < -120 && z > -300) return true;         // statue vista down the boulevard
    return false;
  };
  const spots = [];
  // hand-placed hero towers north (they dominate the floor reflections)
  spots.push([-140, -250, 0, 1.15], [115, -270, 1, 1.1], [-60, -380, 2, 1.0], [205, -190, 3, 1.0], [-235, -140, 1, 0.95], [70, -450, 0, 1.3]);
  // free look (D16): heroes on the other three sides too
  spots.push([-60, 290, 1, 1.15], [150, 330, 0, 1.2], [330, 60, 2, 1.05], [300, -60, 1, 1.1], [-330, 90, 0, 1.2], [-290, -30, 3, 1.0], [-210, 260, 2, 1.0]);
  for (let i = 0; i < 70; i++) {
    const a = (R() * 1.5 - 0.75) * Math.PI + Math.PI; // bias north
    const d = 170 + R() * 520;
    const x = Math.sin(a) * d, z = Math.cos(a) * d - 40;
    if (tooClose(x, z) || spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 60)) continue;
    spots.push([x, z, (R() * 4) | 0, 0.55 + R() * 0.65]);
  }
  for (let i = 0; i < 60; i++) { // south, east and west ring
    const a = (R() - 0.5) * Math.PI * 1.5;
    const d = 220 + R() * 400;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (tooClose(x, z) || spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 60)) continue;
    spots.push([x, z, (R() * 4) | 0, 0.5 + R() * 0.5]);
  }
  for (const s of spots) s.push(R() * Math.PI, 0.85 + R() * 0.4);
  const { far, tris } = addTowerField(ctx, spots, { arch });
  const st = statue();
  const fig = new THREE.Mesh(st.figure, M.statue);
  const ped = new THREE.Mesh(st.ped, M.skyStone);
  for (const m of [fig, ped]) { m.position.set(0, 60, -360); m.layers.enable(REFLECT_LAYER); scene.add(m); far.push(m); }
  fig.position.y = 70;
  ped.position.y = 0;
  ctx.stats.skylineTris = tris;
  ctx.stats.towers = spots.length;
  (ctx.farSky ||= []).push(...far);
  return { spots };
}

// Instanced far towers: spots = [x, z, archetype 0..3, scale, rotY, yScale]; 3 draws per archetype used.
export function addTowerField(ctx, spots, { arch = archetypes(), y = -8, mats = null } = {}) {
  const { scene, M } = ctx;
  const placements = arch.map(() => []);
  for (const s of spots) placements[s[2]].push(s);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const skyMats = mats || { glass: M.facadeSky, stone: M.skyStone, gold: M.goldSolid };
  let tris = 0;
  const far = [];
  arch.forEach((a, i) => {
    const list = placements[i];
    if (!list.length) return;
    for (const part of ['glass', 'stone', 'gold']) {
      const im = new THREE.InstancedMesh(a[part], skyMats[part], list.length);
      list.forEach(([x, z, , s, rot, ys], k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        m4.compose(new THREE.Vector3(x, y, z), q, sc.set(s, s * ys, s));
        im.setMatrixAt(k, m4);
      });
      im.computeBoundingSphere();
      im.layers.enable(REFLECT_LAYER);
      scene.add(im); far.push(im);
      tris += a[part].attributes.position.count / 3 * list.length;
    }
  });
  return { far, tris };
}
