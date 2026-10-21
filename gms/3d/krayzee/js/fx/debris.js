import * as THREE from 'three';

// Tumbling crash debris: one InstancedMesh (panels, struts and one comic runaway wheel).

export function createDebris(scene, max = 24) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.name = 'fx-debris';
  mesh.visible = false;
  scene.add(mesh);

  const f = (n) => new Float32Array(n);
  const px = f(max), py = f(max), pz = f(max), vx = f(max), vy = f(max), vz = f(max);
  const rx = f(max), ry = f(max), rz = f(max), wx = f(max), wy = f(max), wz = f(max);
  const sx = f(max), sy = f(max), sz = f(max), age = f(max), life = f(max), rest = new Uint8Array(max), smoke = f(max);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  let n = 0, cap = max;
  const D = { mesh, get n() { return n; }, setCap(c) { cap = Math.min(max, c); } };

  D.spawn = (x, y, z, ivx, ivy, ivz, w, h, d, r, g, b, smokeS = 0, lifeS = 14) => {
    if (n >= cap) return -1;
    const i = n++;
    px[i] = x; py[i] = y; pz[i] = z; vx[i] = ivx; vy[i] = ivy; vz[i] = ivz;
    rx[i] = Math.random() * 6; ry[i] = Math.random() * 6; rz[i] = Math.random() * 6;
    wx[i] = (Math.random() - 0.5) * 14; wy[i] = (Math.random() - 0.5) * 14; wz[i] = (Math.random() - 0.5) * 14;
    sx[i] = w; sy[i] = h; sz[i] = d; age[i] = 0; life[i] = lifeS; rest[i] = 0; smoke[i] = smokeS;
    mesh.setColorAt(i, col.setRGB(r, g, b));
    mesh.instanceColor.needsUpdate = true;
    return i;
  };
  const kill = (i) => {
    const j = --n;
    if (i === j) return;
    px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j]; vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
    rx[i] = rx[j]; ry[i] = ry[j]; rz[i] = rz[j]; wx[i] = wx[j]; wy[i] = wy[j]; wz[i] = wz[j];
    sx[i] = sx[j]; sy[i] = sy[j]; sz[i] = sz[j]; age[i] = age[j]; life[i] = life[j]; rest[i] = rest[j]; smoke[i] = smoke[j];
    mesh.getColorAt(j, col); mesh.setColorAt(i, col); mesh.instanceColor.needsUpdate = true;
  };
  D.clear = () => { n = 0; mesh.count = 0; mesh.visible = false; };

  // onSmoke(x, y, z, strength) lets burning bits trail smoke through the particle pool.
  D.update = (T, ground, onSmoke) => {
    const dt = T[1];
    for (let i = n - 1; i >= 0; i--) {
      age[i] += dt;
      if (age[i] > life[i]) { kill(i); continue; }
      if (!rest[i]) {
        vy[i] -= 9.81 * dt;
        const dr = Math.exp(-0.15 * dt);
        vx[i] *= dr; vz[i] *= dr;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        rx[i] += wx[i] * dt; ry[i] += wy[i] * dt; rz[i] += wz[i] * dt;
        const gy = ground(px[i], pz[i]) + sy[i] * 0.5;
        if (py[i] < gy) {
          py[i] = gy;
          if (vy[i] < -1.5) { vy[i] = -vy[i] * 0.35; vx[i] *= 0.55; vz[i] *= 0.55; wx[i] *= 0.6; wy[i] *= 0.6; wz[i] *= 0.6; }
          else { vy[i] = 0; vx[i] *= 0.8; vz[i] *= 0.8; wx[i] *= 0.7; wy[i] *= 0.7; wz[i] *= 0.7; if (vx[i] * vx[i] + vz[i] * vz[i] < 0.05) { rest[i] = 1; rx[i] = Math.round(rx[i] / Math.PI) * Math.PI; rz[i] = Math.round(rz[i] / Math.PI) * Math.PI; } }
        }
      }
      if (smoke[i] > 0 && onSmoke) onSmoke(i, px[i], py[i], pz[i], smoke[i] * (1 - age[i] / life[i]));
      const fade = Math.min(1, (life[i] - age[i]) / 1.5);
      e.set(rx[i], ry[i], rz[i]); q.setFromEuler(e);
      m4.compose(p.set(px[i], py[i], pz[i]), q, s.set(sx[i] * fade, sy[i] * fade, sz[i] * fade));
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) mesh.instanceMatrix.needsUpdate = true;
  };
  D.dispose = () => { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); };
  return D;
}
