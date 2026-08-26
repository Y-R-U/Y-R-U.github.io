// Mesh debris: real chunks that tumble, bounce ONCE on the terrain and settle into a wreck.
// One instanced mesh, one pool, no allocation after boot. Aaron's item 8 — lots of things on the
// ground should come apart.

import * as THREE from 'three';
import { MAT } from './materials.js';
import { shade, mix } from './palette.js';

const CAP = 240;

export function makeDebris(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // a slightly irregular block reads as rubble; a perfect cube reads as a bug
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.8 + Math.random() * 0.5),
      pos.getY(i) * (0.7 + Math.random() * 0.6), pos.getZ(i) * (0.8 + Math.random() * 0.4));
  }
  geo.computeVertexNormals();

  const mat = MAT.prop();
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  root.add(mesh);

  const x = new Float32Array(CAP), y = new Float32Array(CAP), z = new Float32Array(CAP);
  const vx = new Float32Array(CAP), vy = new Float32Array(CAP);
  const rz = new Float32Array(CAP), rx = new Float32Array(CAP), wz = new Float32Array(CAP), wx = new Float32Array(CAP);
  const sx = new Float32Array(CAP), sy = new Float32Array(CAP), sz = new Float32Array(CAP);
  const cr = new Float32Array(CAP), cg = new Float32Array(CAP), cb = new Float32Array(CAP);
  const life = new Float32Array(CAP), rest = new Uint8Array(CAP), bounced = new Uint8Array(CAP);
  let head = 0;

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const E = new THREE.Euler(), C = new THREE.Color();
  let terrain = null, pal = null;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /** Break an ent into chunks. `w`,`h` are half-extents; colours come from the prop palette. */
  function shatter(ex, ey, w, h, n = 0, opts = {}) {
    if (!pal) return;
    const P0 = pal.prop;
    const cols = [mix(P0.body, P0.lit, 0.25), P0.body, P0.roof, mix(P0.metal, P0.lit, 0.2), shade(P0.dark, 0.28)];
    const count = n || Math.max(4, Math.min(22, Math.round(Math.sqrt(w * h) * 0.5)));
    for (let i = 0; i < count; i++) {
      const j = head; head = (head + 1) % CAP;
      const s = Math.max(3, Math.min(w, h) * rnd(0.18, 0.46));
      x[j] = ex + rnd(-w, w); y[j] = ey + rnd(0, h * 1.6); z[j] = rnd(-20, 40);
      const a = rnd(0.15, Math.PI - 0.15), sp = rnd(0.5, 1.6) * (opts.force || 260);
      vx[j] = Math.cos(a) * sp * rnd(0.5, 1) + (opts.dirX || 0) * 90;
      vy[j] = Math.sin(a) * sp;
      rz[j] = Math.random() * 6.28; rx[j] = Math.random() * 6.28;
      wz[j] = rnd(-9, 9); wx[j] = rnd(-7, 7);
      sx[j] = s * rnd(0.6, 1.2); sy[j] = s * rnd(0.5, 1.1); sz[j] = s * rnd(0.5, 1.0);
      C.set(cols[(Math.random() * cols.length) | 0]);
      cr[j] = C.r; cg[j] = C.g; cb[j] = C.b;
      life[j] = 14 + Math.random() * 8;
      rest[j] = 0; bounced[j] = 0;
    }
  }

  return {
    root, shatter,
    setPalette(p) { pal = p; },
    setTerrain(t) { terrain = t; },

    update(dt, camX, vw) {
      let n = 0;
      const x0 = camX - vw * 0.7, x1 = camX + vw * 0.7;
      const arr = mesh.instanceColor.array;
      for (let i = 0; i < CAP; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        if (!rest[i]) {
          vy[i] -= 1500 * dt;
          vx[i] *= Math.max(0, 1 - 0.7 * dt);
          x[i] += vx[i] * dt; y[i] += vy[i] * dt;
          rz[i] += wz[i] * dt; rx[i] += wx[i] * dt;
          const g = terrain ? terrain.heightAt(x[i]) : 0;
          if (y[i] <= g + sy[i] * 0.5) {
            y[i] = g + sy[i] * 0.5;
            if (!bounced[i] && vy[i] < -120) {
              bounced[i] = 1;
              vy[i] = -vy[i] * 0.34; vx[i] *= 0.55;
              wz[i] *= 0.5; wx[i] *= 0.4;
            } else {
              rest[i] = 1; vy[i] = 0; vx[i] = 0;
              rz[i] = Math.round(rz[i] / 1.5708) * 1.5708 + (Math.random() - 0.5) * 0.35;
              wz[i] = wx[i] = 0;
            }
          }
        }
        if (x[i] < x0 || x[i] > x1 || n >= CAP) continue;
        P.set(x[i], y[i], z[i]);
        E.set(rx[i], 0, rz[i]);
        Q.setFromEuler(E);
        S.set(sx[i], sy[i], sz[i]);
        M.compose(P, Q, S);
        mesh.setMatrixAt(n, M);
        const f = Math.min(1, life[i] / 3);
        const kk = 1.15 + f * 0.25;
        arr[n * 3] = cr[i] * kk; arr[n * 3 + 1] = cg[i] * kk; arr[n * 3 + 2] = cb[i] * kk;
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },

    count() { return mesh.count; },
    clear() { for (let i = 0; i < CAP; i++) life[i] = 0; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
