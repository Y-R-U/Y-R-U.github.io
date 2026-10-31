import * as THREE from 'three';
import { Builder, col, mat, rng, inRect } from './util.js';
import { FRAMES, HOLDS, SEGMENTS, rwPt } from './geom.js';
import royal from '../../data/airports/royal.js';
const { taxiwayWidth: TAXIWAY_WIDTH, terminal: TERMINAL, stands: STANDS } = royal;
import { decalQuad } from './terminal.js';
import { APRON_RECT, HANGAR_APRON, ROADS, CAR_PARK, TOWER_PAD } from './pavement.js';

const POST = col('#d9d9d2');

function sign(B, atlas, x, z, faceX, faceZ, panels) {
  const { matte: M, decal: D } = B;
  const ry = Math.atan2(faceX, faceZ);
  const H = 0.9, y = 0.55 + H / 2;
  const total = panels.reduce((s, p) => s + p.w, 0);
  const c = Math.cos(ry), s = Math.sin(ry);
  let off = -total / 2;
  for (const p of panels) {
    const lx = off + p.w / 2;
    const px = x + lx * c, pz = z - lx * s;
    decalQuad(D, atlas.uv[p.key], px + faceX * 0.21, y, pz + faceZ * 0.21, p.w, H, ry);
    off += p.w;
  }
  M.geo(new THREE.BoxGeometry(total + 0.1, H + 0.1, 0.4), mat(x, y, z, 0, ry), col('#1b1b1b'));
  for (const lx of [-total / 2 + 0.3, total / 2 - 0.3]) M.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), mat(x + lx * c, 0.3, z - lx * s), POST);
}

export function buildSigns(B, atlas) {
  for (const h of HOLDS) {
    const lx = h.hz, lz = -h.hx;
    const off = TAXIWAY_WIDTH / 2 + 7;
    const mand = { key: 'm' + h.text, w: 3.6 };
    const loc = { key: 'l' + h.taxiway, w: 1.8 };
    const backX = h.x - h.hx * 1.2, backZ = h.z - h.hz * 1.2;
    sign(B, atlas, backX + lx * (off + 2.2), backZ + lz * (off + 2.2), -h.hx, -h.hz, [loc, mand]);
    sign(B, atlas, backX - lx * (off + 2.2), backZ - lz * (off + 2.2), -h.hx, -h.hz, [mand, loc]);
  }
  const A = SEGMENTS.find((s) => s.id === 'A');
  sign(B, atlas, -560, A.p0[1] - TAXIWAY_WIDTH / 2 - 7, 1, 0, [{ key: 'lA', w: 1.8 }, { key: 'dA1', w: 2.7 }]);
  sign(B, atlas, 560, A.p0[1] - TAXIWAY_WIDTH / 2 - 7, -1, 0, [{ key: 'lA', w: 1.8 }, { key: 'dA4', w: 2.7 }]);
  sign(B, atlas, -330, A.p0[1] + TAXIWAY_WIDTH / 2 + 7, 1, 0, [{ key: 'lA', w: 1.8 }, { key: 'dApron', w: 3.6 }]);
}

export function buildWindsocks(B) {
  const spots = [rwPt(FRAMES[0], 0, 230, 62), rwPt(FRAMES[0], 1, 230, -62), rwPt(FRAMES[1], 0, 160, 48)];
  const { matte: M } = B;
  for (const [x, z] of spots) {
    M.geo(new THREE.CylinderGeometry(0.09, 0.14, 6.5, 6), mat(x, 3.25, z), col('#e6e6e6'));
    M.geo(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 12, 1, true), mat(x, 0.05, z), col('#f2f2f2'));
    M.geo(new THREE.TorusGeometry(0.42, 0.03, 4, 12), mat(x + 0.42, 6.4, z, 0, Math.PI / 2, 0), col('#888'));
  }
  const b = new Builder();
  const segs = 5;
  for (let k = 0; k < segs; k++) {
    const r0 = 0.42 - 0.05 * k, r1 = 0.42 - 0.05 * (k + 1);
    b.geo(new THREE.CylinderGeometry(r1, r0, 0.72, 10, 1, true), mat(0, 0, 0.36 + k * 0.72, Math.PI / 2, 0, 0), k % 2 ? col('#f5f5f0') : col('#ff5a12'));
  }
  const geo = b.build();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const socks = new THREE.InstancedMesh(geo, m, spots.length);
  socks.castShadow = true;
  socks.name = 'windsocks';
  const base = spots.map(([x, z]) => new THREE.Vector3(x, 6.4, z));
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), one = new THREE.Vector3(1, 1, 1), mm = new THREE.Matrix4();
  function update(t, windFrom, kt) {
    const toward = (windFrom + 180) * Math.PI / 180;
    const lift = Math.min(1, kt / 15);
    for (let i = 0; i < spots.length; i++) {
      const flut = Math.sin(t * (6 + i) + i) * 0.06 * (0.3 + lift);
      e.set(-(1 - lift) * 1.25 + Math.sin(t * 3.1 + i) * 0.04, Math.PI - toward + flut, 0);
      q.setFromEuler(e);
      mm.compose(base[i], q, one);
      socks.setMatrixAt(i, mm);
    }
    socks.instanceMatrix.needsUpdate = true;
  }
  update(0, 240, 9);
  socks.computeBoundingSphere();
  return { mesh: socks, update };
}

function truck(M, T, x, z, ry) {
  const m = (lx, ly, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), ly, z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const box = (lx, ly, lz, sx, sy, sz, c, B = M) => { const [px, py, pz] = m(lx, ly, lz); B.geo(new THREE.BoxGeometry(sx, sy, sz), mat(px, py, pz, 0, ry), c); };
  box(0, 0.9, 3.2, 2.4, 1.0, 9.5, col('#2a2a2a'));
  box(0, 2.0, 6.6, 2.4, 2.0, 2.2, col('#e8e8e8'));
  box(0, 2.4, 7.72, 2.2, 0.9, 0.05, col('#20303c'));
  const [tx, , tz] = m(0, 2.3, 2.4);
  T.geo(new THREE.CylinderGeometry(1.25, 1.25, 6.8, 14), mat(tx, 2.3, tz, Math.PI / 2, ry, 0), col('#d8dadc'));
  box(0, 2.3, 2.4, 2.55, 0.45, 6.6, col('#c4122f'));
  for (const lz of [0.5, 4.0, 6.5]) for (const lx of [-1.15, 1.15]) {
    const [px, , pz] = m(lx, 0.5, lz);
    M.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), mat(px, 0.5, pz, 0, ry, Math.PI / 2), col('#151515'));
  }
}

function cart(M, x, z, ry, color) {
  const m = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const [px, pz] = m(0, 0);
  M.geo(new THREE.BoxGeometry(1.6, 0.25, 2.8), mat(px, 0.55, pz, 0, ry), col('#3a3a3a'));
  M.geo(new THREE.BoxGeometry(1.6, 1.2, 2.6), mat(px, 1.3, pz, 0, ry), color);
  M.geo(new THREE.BoxGeometry(1.7, 0.08, 2.9), mat(px, 1.95, pz, 0, ry), col('#e6e6e6'));
  for (const [lx, lz] of [[-0.7, -1], [0.7, -1], [-0.7, 1], [0.7, 1]]) {
    const [wx, wz] = m(lx, lz);
    M.geo(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8), mat(wx, 0.25, wz, 0, ry, Math.PI / 2), col('#111'));
  }
}

export function buildVehicles(B) {
  const { matte: M, metal: T } = B;
  truck(M, T, -205, -270, Math.PI / 2);
  const tugX = -20, tugZ = -268;
  M.box(tugX, 0.8, tugZ, 1.8, 1.0, 2.6, col('#f2c21b'), Math.PI / 2);
  M.box(tugX - 0.4, 1.7, tugZ, 0.9, 0.9, 1.6, col('#2a2a2a'), Math.PI / 2);
  for (let k = 0; k < 4; k++) cart(M, tugX - 4 - k * 3.4, tugZ, Math.PI / 2, col(['#2a4f8a', '#4b1f7a', '#2a4f8a', '#4b1f7a'][k]));
  for (const st of [STANDS[1], STANDS[6]]) {
    const [x, , z] = st.position;
    M.box(x + 8, 0.7, z - 8, 1.4, 1.2, 2.2, col('#e8e8e8'));
    M.box(x + 8, 1.35, z - 8, 1.45, 0.1, 2.25, col('#c4122f'));
  }
  const rr = rng(4);
  for (let k = 0; k < 30; k++) {
    const st = STANDS[(rr() * STANDS.length) | 0];
    if (rr() < 0.5) continue;
    const x = st.position[0] + 14 + rr() * 3, z = st.position[2] - 12 + rr() * 6;
    M.geo(new THREE.ConeGeometry(0.17, 0.6, 8), mat(x, 0.3, z), col('#ff6a10'));
  }
  const cx = TERMINAL.center[0];
  for (let z = APRON_RECT.z0 + 2; z < -244; z += 4) {
    for (const sx of [-2.6, 2.6]) {
      T.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), mat(cx + sx, 0.48, z), col('#e2ac2c'));
      T.geo(new THREE.SphereGeometry(0.08, 6, 4), mat(cx + sx, 0.98, z), col('#e2ac2c'));
    }
  }
  const z0 = APRON_RECT.z0 + 2;
  for (const sx of [-2.6, 2.6]) M.beam([cx + sx, 0.85, z0], [cx + sx, 0.85, -244], 0.05, col('#8a1030'));
}

export function buildFlagpoles(B, atlas) {
  const { metal: T } = B;
  const z = TERMINAL.center[2] - TERMINAL.size[1] / 2 - 26;
  for (let k = -3; k <= 3; k++) {
    const x = TERMINAL.center[0] + k * 9;
    T.geo(new THREE.CylinderGeometry(0.08, 0.12, 12, 6), mat(x, 6, z), col('#e8e8e8'));
    T.geo(new THREE.SphereGeometry(0.2, 8, 6), mat(x, 12.1, z), col('#e2ac2c'));
    B.flags.push({ x: x + 0.08, y: 11.3, z, w: 3.0, h: 2.0, rect: k % 2 ? atlas.uv.flag2 : atlas.uv.flag, phase: k * 0.7 });
  }
}

export function buildFlags(flags, atlasTex) {
  const b = new Builder(true);
  const seg = 8;
  for (const f of flags) {
    const base = b.count;
    const [u0, v0, u1, v1] = f.rect;
    for (let i = 0; i <= seg; i++) for (const j of [0, 1]) {
      const s = i / seg;
      b.v(f.x + s * f.w, f.y - j * f.h, f.z, 0, 0, 1, [s, f.phase, f.w], u0 + (u1 - u0) * s, v1 - (v1 - v0) * j);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      b.i.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geo = b.build();
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, map: atlasTex });
  const uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; attribute vec3 color;')
      .replace('#include <begin_vertex>', `
        float s = color.x, ph = color.y, w = color.z;
        float L = s * w;
        vec3 transformed = vec3(position);
        vec3 root = transformed - vec3(L, 0.0, 0.0);
        float wave = sin(L * 2.2 - uTime * 7.0 + ph * 3.0) * 0.18 * s * w / 3.0;
        vec2 dir = normalize(uWind);
        transformed.x = root.x + dir.x * L - dir.y * wave;
        transformed.z = root.z + dir.y * L + dir.x * wave;
        transformed.y -= s * s * 0.25;
      `);
  };
  m.map = atlasTex;
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.name = 'flags';
  return { mesh, uniforms };
}

// Low-poly cars: [length, width, sill, hood-front, belt-front, belt-rear, windscreen base z, roof front z, roof rear z,
// rear-window base z, roof height, greenhouse width factor]. z runs front (-) to rear (+), metres from the car's centre.
const CAR_TYPES = {
  hatch: [3.9, 1.72, 0.3, 0.72, 0.86, 0.9, -0.62, -0.05, 1.3, 1.88, 1.46, 0.86],
  saloon: [4.6, 1.8, 0.28, 0.7, 0.82, 0.95, -0.8, -0.15, 0.95, 1.6, 1.42, 0.86],
  estate: [4.7, 1.88, 0.38, 0.86, 1.02, 1.05, -0.95, -0.4, 2.05, 2.3, 1.74, 0.9],
  van: [5.0, 1.95, 0.34, 0.9, 1.02, 1.02, -1.95, -1.4, 2.45, 2.5, 2.1, 0.96],
  limo: [5.9, 1.86, 0.26, 0.68, 0.8, 0.9, -1.2, -0.55, 1.85, 2.4, 1.42, 0.86],
};
const CAR_PAINT = [['#f2f2f0', 4], ['#a9aeb3', 4], ['#55595e', 3], ['#16181b', 3], ['#1f3f78', 2], ['#9e1b24', 2], ['#2f5a3a', 1], ['#c9b48a', 1], ['#d9661e', 1], ['#4b1f7a', 1], ['#f2c21b', 0.5], ['#6ea7d8', 1]];
const GLASS = col('#1c242c'), TYRE = col('#151515'), LAMP = col('#f4f1e4', 1.2), TAIL = col('#b0161c', 1.1), TRIMC = col('#2a2c2f');

// Extrudes a convex side profile [[z, y]...] (CCW seen from +x) across width w; colour(i) per edge quad, capCol for the sides.
function prism(b, T, pts, w, capCol, edgeCol, skipEdge = -1) {
  const hw = w / 2, n = pts.length, nm = new THREE.Vector3(), v = new THREE.Vector3();
  const P = (x, z, y) => v.set(x, y, z).applyMatrix4(T).toArray();
  const N = (x, y, z) => nm.set(x, y, z).transformDirection(T).toArray();
  for (const sx of [-1, 1]) {
    const nn = N(sx, 0, 0), base = b.count;
    for (const [z, y] of pts) b.v(...P(sx * hw, z, y), ...nn, capCol);
    for (let k = 1; k < n - 1; k++) sx > 0 ? b.tri(base, base + k + 1, base + k) : b.tri(base, base + k, base + k + 1);
  }
  for (let k = 0; k < n; k++) {
    if (k === skipEdge) continue;
    const [z0, y0] = pts[k], [z1, y1] = pts[(k + 1) % n];
    const ez = z1 - z0, ey = y1 - y0, l = Math.hypot(ez, ey) || 1;
    const nn = N(0, -ez / l, ey / l), c = edgeCol(k), base = b.count;
    b.v(...P(-hw, z0, y0), ...nn, c); b.v(...P(hw, z0, y0), ...nn, c); b.v(...P(hw, z1, y1), ...nn, c); b.v(...P(-hw, z1, y1), ...nn, c);
    b.tri(base, base + 1, base + 2); b.tri(base, base + 2, base + 3);
  }
}

export function addCar(b, type, x, z, ry, paint, hi, trim = true) {
  const [L, W, sill, hoodF, beltF, beltR, zWs, zRf, zRr, zRw, roof, gw] = CAR_TYPES[type];
  const T = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const h = L / 2;
  const body = hi ? [[-h, sill], [h, sill], [h, beltR - 0.12], [h - 0.12, beltR], [zWs, beltF], [-h + 0.35, hoodF + 0.06], [-h, hoodF - 0.08]]
    : [[-h, sill], [h, sill], [h, beltR], [zWs, beltF], [-h, hoodF]];
  prism(b, T, body, W, paint, (k) => (k === 0 ? TRIMC : paint), 0);
  const top = [[zWs, beltF], [Math.min(zRw, h - 0.1), beltR], [zRr, roof], [zRf, roof]];
  prism(b, T, top, W * gw, GLASS, (k) => (k === 2 ? paint : GLASS), 0);
  if (!hi) return;
  for (const az of [-h + 0.78, h - 0.8]) prism(b, T.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, az)), [[-0.3, 0.02], [0.3, 0.02], [0.3, sill + 0.02], [-0.3, sill + 0.02]], W * 0.97, TYRE, () => TYRE, 0);
  if (!trim) return;
  const lamp = (lx, lz, y, c, dir) => {
    const m = new THREE.Matrix4().makeRotationY(dir < 0 ? Math.PI : 0).setPosition(lx, y, lz).premultiply(T);
    b.geo(new THREE.PlaneGeometry(0.34, 0.12), m, c);
  };
  for (const sx of [-1, 1]) {
    lamp(sx * (W / 2 - 0.25), -h - 0.012, hoodF - 0.12, LAMP, -1);
    lamp(sx * (W / 2 - 0.25), h + 0.012, beltR - 0.2, TAIL, 1);
  }
  b.geo(new THREE.BoxGeometry(W + 0.02, 0.1, 0.1), new THREE.Matrix4().makeTranslation(0, sill + 0.08, -h - 0.02).premultiply(T), TRIMC);
}

// Parked and road cars (trees: trees.js, town: town.js). Static merged meshes: the car park has a near (wheels, lamps)
// and a far version swapped by camera distance; road cars are always the far version.
export function buildScenery(quality) {
  const r = rng(2024);
  const objs = [];
  const colliders = [];
  const pick = () => {
    const tot = CAR_PAINT.reduce((s, c) => s + c[1], 0);
    let k = r() * tot;
    for (const [c, w] of CAR_PAINT) if ((k -= w) <= 0) return col(c);
    return col('#ffffff');
  };
  const kind = () => { const k = r(); return k < 0.3 ? 'hatch' : k < 0.62 ? 'saloon' : k < 0.86 ? 'estate' : k < 0.97 ? 'van' : 'limo'; };
  const park = [], road = [];
  for (let x = CAR_PARK.x0 + 5.3; x < CAR_PARK.x1 - 2; x += 2.6) {
    for (const zz of [CAR_PARK.z0 + 6.5, CAR_PARK.z0 + 25, CAR_PARK.z0 + 43.5, CAR_PARK.z1 - 15.5]) {
      if (r() < 0.6) park.push([x + (r() - 0.5) * 0.25, zz + (r() - 0.5) * 0.5 + (r() < 0.5 ? 0.4 : -0.4), Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.06]);
    }
  }
  for (const rd of ROADS) {
    const horiz = rd.x1 - rd.x0 > rd.z1 - rd.z0;
    const n = (horiz ? rd.x1 - rd.x0 : rd.z1 - rd.z0) / 70;
    for (let k = 0; k < n; k++) {
      if (r() < 0.5) continue;
      const lane = r() < 0.5 ? -1 : 1;
      const mx = (rd.x0 + rd.x1) / 2, mz = (rd.z0 + rd.z1) / 2;
      road.push(horiz ? [rd.x0 + r() * (rd.x1 - rd.x0), mz + lane * 2.6, lane > 0 ? Math.PI / 2 : -Math.PI / 2] : [mx + lane * 2.6, rd.z0 + r() * (rd.z1 - rd.z0), lane > 0 ? Math.PI : 0]);
    }
  }
  // car park stores x along the rows, so ry = ±π/2 points the bonnet at the aisle
  const parkSpec = park.map((p) => { const t = kind(); return [...p, t, t === 'limo' ? col('#101114') : pick()]; });
  const roadSpec = road.map((p) => [...p, kind(), pick()]);
  const mtl = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = (list, hi, name) => {
    const b = new Builder();
    for (const [x, z, ry, t, c] of list) addCar(b, t, x, z, ry, c, hi, quality !== 'low');
    const m = new THREE.Mesh(b.build(), mtl);
    m.name = name;
    m.receiveShadow = true;
    return m;
  };
  const parkHi = mesh(parkSpec, true, 'cars'), parkLo = mesh(parkSpec, false, 'carsFar'), roadM = mesh(roadSpec, false, 'roadCars');
  parkLo.visible = false;
  objs.push(parkHi, parkLo, roadM);
  const cx = (CAR_PARK.x0 + CAR_PARK.x1) / 2, cz = (CAR_PARK.z0 + CAR_PARK.z1) / 2;
  let nearR = quality === 'low' ? 200 : 520, farR = quality === 'low' ? 2400 : 1e9;
  function update(camera) {
    const d = Math.hypot(camera.position.x - cx, camera.position.y, camera.position.z - cz);
    parkHi.visible = d < nearR;
    parkLo.visible = !parkHi.visible && d < farR;
  }
  function setQuality(q) { nearR = q === 'low' ? 200 : 520; farR = q === 'low' ? 2400 : 1e9; }
  return { objects: objs, colliders, update, setQuality };
}

export { TOWER_PAD, HANGAR_APRON };
