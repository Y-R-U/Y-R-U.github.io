// C3: traffic on C-Tower 1's roads. One InstancedMesh (one draw call, one small matrix upload a frame): cars keep left,
// both ways along the long road, the south road and the village high street, up and over the river bridges.
import * as THREE from 'three';
import { Builder, col, rng } from './util.js';
import { addCar } from './props.js';

const PAINT = ['#f2f2f0', '#a9aeb3', '#55595e', '#16181b', '#1f3f78', '#9e1b24', '#2f5a3a', '#c9b48a', '#d9661e', '#4b1f7a', '#f2c21b', '#6ea7d8'];

function route(pts) {
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, s, L: s[s.length - 1] };
}
function at(R, d, out) {
  let lo = 0, hi = R.s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s[m] <= d) lo = m; else hi = m; }
  const a = R.pts[lo], b = R.pts[hi], t = (d - R.s[lo]) / ((R.s[hi] - R.s[lo]) || 1);
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = b[0] - a[0]; out[3] = b[1] - a[1];
  return out;
}

// roads: [{ pts, w }]; heightAt(x, z); bridges from river.js buildBridges ({ x, z, span, rise })
export function buildCars(roads, heightAt, bridges, quality) {
  const b = new Builder();
  addCar(b, 'saloon', 0, 0, 0, col('#ffffff'), true, false);
  const n = quality === 'low' ? 14 : 26;
  const mesh = new THREE.InstancedMesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }), n);
  mesh.name = 'traffic';
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const R = roads.map((r) => ({ ...route(r.pts), w: r.w }));
  const r = rng(77), cars = [], c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const k = i % R.length, dir = r() < 0.5 ? 1 : -1;
    cars.push({ R: R[k], d: r() * R[k].L, v: (12 + r() * 9) * dir, side: R[k].w / 4 });
    mesh.setColorAt(i, c.set(PAINT[(r() * PAINT.length) | 0]));
  }
  const bump = (x, z) => {
    for (const q of bridges) {
      const e = Math.hypot(x - q.x, z - q.z), h = q.span / 2;
      if (e < h) return q.rise + 0.12;
      if (e < h + 14) return (q.rise + 0.12) * (1 - (e - h) / 14);
    }
    return 0;
  };
  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), p = [0, 0, 0, 0];
  function update(dt) {
    for (let i = 0; i < n; i++) {
      const car = cars[i];
      car.d += car.v * dt;
      if (car.d > car.R.L) car.d -= car.R.L; else if (car.d < 0) car.d += car.R.L;
      at(car.R, car.d, p);
      const l = Math.hypot(p[2], p[3]) || 1, fx = p[2] / l * Math.sign(car.v), fz = p[3] / l * Math.sign(car.v);
      const x = p[0] - fz * car.side, z = p[1] + fx * car.side;   // keep left
      pos.set(x, heightAt(x, z) + 0.08 + bump(x, z), z);
      qt.setFromAxisAngle(up, Math.atan2(-fx, -fz));
      mesh.setMatrixAt(i, m.compose(pos, qt, one));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  mesh.instanceColor.needsUpdate = true;
  return { mesh, update };
}
