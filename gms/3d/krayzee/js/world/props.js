import * as THREE from 'three';
import { Builder, col, mat, rng, inRect } from './util.js';
import { FRAMES, HOLDS, SEGMENTS, rwPt } from './geom.js';
import { TAXIWAY_WIDTH, TERMINAL, STANDS } from './layout.js';
import { decalQuad } from './terminal.js';
import { APRON_RECT, HANGAR_APRON, ROADS, CAR_PARK, TOWER_PAD } from './pavement.js';
import { LAKE } from './terrain.js';

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

// Low-poly instanced vegetation, a basic town and parked cars.
export function buildScenery(quality, noGo) {
  const r = rng(2024);
  const low = quality === 'low';
  const objs = [];
  const colliders = [];

  const decid = new Builder();
  decid.geo(new THREE.CylinderGeometry(0.18, 0.28, 3, 5), mat(0, 1.5, 0), col('#5a4030'));
  decid.geo(new THREE.IcosahedronGeometry(2.4, 0), mat(0, 4.6, 0, 0, 0, 0, 1, 0.9, 1), col('#4d7a34'));
  decid.geo(new THREE.IcosahedronGeometry(1.7, 0), mat(0.9, 5.8, 0.4, 0.4, 0.3, 0), col('#5a8a3a'));
  decid.geo(new THREE.IcosahedronGeometry(1.5, 0), mat(-1.0, 5.2, -0.6, 0.2, 0.9, 0), col('#44702e'));
  const conif = new Builder();
  conif.geo(new THREE.CylinderGeometry(0.15, 0.22, 2, 5), mat(0, 1, 0), col('#4a3428'));
  conif.geo(new THREE.ConeGeometry(2.0, 4.5, 7), mat(0, 3.6, 0), col('#2f5a32'));
  conif.geo(new THREE.ConeGeometry(1.5, 3.6, 7), mat(0, 5.6, 0), col('#386838'));
  const placeTrees = [];
  const ok = (x, z) => !noGo(x, z, 18);
  const clusters = low ? 55 : 120;
  for (let c = 0; c < clusters; c++) {
    const ang = r() * Math.PI * 2, d = 650 + Math.pow(r(), 0.7) * 3200;
    const cx = Math.cos(ang) * d * 1.2, cz = Math.sin(ang) * d;
    const n = 6 + ((r() * (low ? 10 : 22)) | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 90, z = cz + (r() - 0.5) * 90;
      if (ok(x, z)) placeTrees.push([x, z, r() < 0.35]);
    }
  }
  for (let x = -1100; x < 1100; x += low ? 34 : 17) {
    for (const z of [-560, 470]) if (r() < 0.8 && ok(x, z)) placeTrees.push([x + (r() - 0.5) * 8, z + (r() - 0.5) * 6, r() < 0.2]);
  }
  for (let k = 0; k < (low ? 60 : 140); k++) {
    const a = r() * Math.PI * 2, rr = 1.15 + r() * 0.35;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * rr, z = LAKE.z + Math.sin(a) * LAKE.rz * rr;
    if (ok(x, z)) placeTrees.push([x, z, r() < 0.5]);
  }
  for (const [geoB, conifer] of [[decid, false], [conif, true]]) {
    const list = placeTrees.filter((t) => t[2] === conifer);
    const im = new THREE.InstancedMesh(geoB.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), list.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach(([x, z], i) => {
      const s = 0.8 + r() * 0.7;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(s, s * (0.85 + r() * 0.4), s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setRGB(0.85 + r() * 0.3, 0.85 + r() * 0.25, 0.8 + r() * 0.2));
    });
    im.castShadow = !low;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    im.name = conifer ? 'conifers' : 'trees';
    objs.push(im);
  }

  // town north of the field
  const houses = [];
  for (let gx = -560; gx <= 260; gx += 64) {
    for (let gz = -1300; gz >= -1760; gz -= 46) {
      if (Math.abs(gx + 80) < 22) continue;
      for (const off of [-14, 14]) {
        if (r() < 0.15) continue;
        const tall = Math.hypot(gx + 140, gz + 1520) < 200 && r() < 0.5;
        const w = tall ? 14 + r() * 8 : 8 + r() * 4, d = tall ? 12 + r() * 6 : 7 + r() * 3, h = tall ? 10 + r() * 12 : 4.5 + r() * 2;
        houses.push({ x: gx + off, z: gz, w, d, h, tall, ry: (r() < 0.5 ? 0 : Math.PI / 2) });
      }
    }
  }
  const walls = new Builder(), roofs = new Builder();
  walls.geo(new THREE.BoxGeometry(1, 1, 1), mat(0, 0.5, 0), [1, 1, 1], 3);
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.56, 0), new THREE.Vector2(0.56, 0), new THREE.Vector2(0, 0.5)]);
  roofs.geo(new THREE.ExtrudeGeometry(roofShape, { depth: 1.04, bevelEnabled: false }), mat(0, 0, -0.52), [1, 1, 1]);
  const wallM = new THREE.InstancedMesh(walls.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), houses.length);
  const roofM = new THREE.InstancedMesh(roofs.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), houses.length);
  const wallCols = ['#efe6d6', '#e8d9c0', '#f4f1ea', '#d9c7a8', '#c9d3d8', '#e6d0c8'], roofCols = ['#8a3b2a', '#6b3a2c', '#4f4f55', '#7a4a32', '#5c6370'];
  const m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  houses.forEach((h, i) => {
    q.setFromAxisAngle(up, h.ry);
    m4.compose(new THREE.Vector3(h.x, 0, h.z), q, new THREE.Vector3(h.w, h.h, h.d));
    wallM.setMatrixAt(i, m4);
    const rh = h.tall ? 0.6 : Math.min(h.w, h.d) * 0.45;
    roofM.setMatrixAt(i, m4.compose(new THREE.Vector3(h.x, h.h, h.z), q, new THREE.Vector3(h.w, rh * 2, h.d)));
    wallM.setColorAt(i, c.set(wallCols[(r() * wallCols.length) | 0]));
    roofM.setColorAt(i, c.set(roofCols[(r() * roofCols.length) | 0]));
    const ex = h.ry ? h.d : h.w, ez = h.ry ? h.w : h.d;
    colliders.push({ min: [h.x - ex / 2, 0, h.z - ez / 2], max: [h.x + ex / 2, h.h + (h.tall ? 0 : Math.min(h.w, h.d) * 0.45), h.z + ez / 2], kind: 'house' });
  });
  for (const im of [wallM, roofM]) { im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere(); objs.push(im); }
  wallM.name = 'houses'; roofM.name = 'roofs';

  const cars = [];
  for (let x = CAR_PARK.x0 + 5.3; x < CAR_PARK.x1 - 2; x += 2.6) {
    for (const zz of [CAR_PARK.z0 + 6.5, CAR_PARK.z0 + 25, CAR_PARK.z0 + 43.5, CAR_PARK.z1 - 15.5]) if (r() < 0.6) cars.push([x, zz, Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI)]);
  }
  for (const rd of ROADS) {
    const horiz = rd.x1 - rd.x0 > rd.z1 - rd.z0;
    const n = (horiz ? rd.x1 - rd.x0 : rd.z1 - rd.z0) / 70;
    for (let k = 0; k < n; k++) {
      if (r() < 0.5) continue;
      const lane = r() < 0.5 ? -1 : 1;
      const mx = (rd.x0 + rd.x1) / 2, mz = (rd.z0 + rd.z1) / 2;
      cars.push(horiz ? [rd.x0 + r() * (rd.x1 - rd.x0), mz + lane * 2.6, lane > 0 ? Math.PI / 2 : -Math.PI / 2] : [mx + lane * 2.6, rd.z0 + r() * (rd.z1 - rd.z0), lane > 0 ? Math.PI : 0]);
    }
  }
  const carB = new Builder();
  carB.geo(new THREE.BoxGeometry(1.8, 0.75, 4.3), mat(0, 0.6, 0), [1, 1, 1]);
  carB.geo(new THREE.BoxGeometry(1.6, 0.6, 2.2), mat(0, 1.25, -0.2), [0.35, 0.4, 0.45]);
  const carM = new THREE.InstancedMesh(carB.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), cars.length);
  const carCols = ['#c4122f', '#1f4f8f', '#e8e8e8', '#202020', '#9aa0a6', '#4b1f7a', '#f2c21b', '#2f6b3a'];
  cars.forEach(([x, z, ry], i) => {
    q.setFromAxisAngle(up, ry);
    carM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)));
    carM.setColorAt(i, c.set(carCols[(r() * carCols.length) | 0]));
  });
  carM.computeBoundingSphere();
  carM.name = 'cars';
  objs.push(carM);
  return { objects: objs, colliders };
}

export { TOWER_PAD, HANGAR_APRON };
