import * as THREE from 'three';
import { FRAMES, SEGMENTS, rwPt, rwDir } from './geom.js';
import { TAXIWAY_WIDTH } from './layout.js';
import { Builder, col, mat, inRect } from './util.js';

const PAPI_ANGLES = [3.5, 3.17, 2.83, 2.5];

function fixtureGeometry() {
  const b = new Builder();
  b.geo(new THREE.CylinderGeometry(0.06, 0.08, 0.32, 6), mat(0, 0.16, 0), [0.75, 0.75, 0.72]);
  b.geo(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 8), mat(0, 0.34, 0), [0.6, 0.6, 0.58]);
  b.geo(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0, 0.36, 0), [1, 1, 1]);
  return b.build();
}

export function buildLights(quality) {
  const fx = [];
  const add = (x, z, c) => fx.push([x, z, c]);
  const WH = col('#fffbe8'), YE = col('#ffc23a'), GR = col('#38e070'), RD = col('#ff3030'), BL = col('#3a6cff');
  for (const F of FRAMES) {
    const off = F.W / 2 + 1.5;
    const n = Math.round(F.L / 60);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * F.L;
      for (const side of [-1, 1]) {
        const p = rwPt(F, 0, a, side * off);
        const skip = FRAMES.some((G) => G !== F && inRect(p[0], p[1], G.rect, 1));
        if (!skip) add(p[0], p[1], a > F.L - 600 ? YE : WH);
      }
    }
    for (const e of [0, 1]) {
      for (let t = -F.W / 2; t <= F.W / 2 + 0.01; t += 3) {
        const p = rwPt(F, e, -0.8, t);
        add(p[0], p[1], GR);
        const q = rwPt(F, e, -1.6, t);
        add(q[0], q[1], RD);
      }
    }
  }
  const hw = TAXIWAY_WIDTH / 2 + 1.2;
  for (const S of SEGMENTS) {
    for (let a = 0; a <= S.len; a += 30) {
      for (const side of [-1, 1]) {
        const x = S.p0[0] + S.dx * a - S.dz * side * hw, z = S.p0[1] + S.dz * a + S.dx * side * hw;
        const inside = FRAMES.some((F) => inRect(x, z, F.strip, 4)) || SEGMENTS.some((T) => T !== S && inRect(x, z, T.rect, 0.5));
        if (!inside && z > -118) add(x, z, BL);
      }
    }
  }

  const geo = fixtureGeometry();
  const lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 });
  const fixtures = new THREE.InstancedMesh(geo, lampMat, fx.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  fx.forEach(([x, z, cc], i) => {
    m.makeTranslation(x, 0, z);
    fixtures.setMatrixAt(i, m);
    fixtures.setColorAt(i, c.setRGB(0.55 + cc[0] * 0.45, 0.55 + cc[1] * 0.45, 0.55 + cc[2] * 0.45));
  });
  fixtures.name = 'edgeLights';
  fixtures.computeBoundingSphere();

  // PAPI: four boxes left of each runway end, lens colour from the viewer's elevation angle.
  const papi = [];
  const box = new Builder();
  for (const F of FRAMES) {
    for (const e of [0, 1]) {
      const aim = F === FRAMES[0] ? 322 : 265;
      const [dx, dz] = rwDir(F, e);
      for (let k = 0; k < 4; k++) {
        const tp = -(F.W / 2 + 15 + k * 9);
        const [x, z] = rwPt(F, e, aim, tp);
        const ry = Math.atan2(-dx, -dz);
        box.geo(new THREE.BoxGeometry(1.4, 0.75, 0.9), mat(x, 0.75, z, 0, ry), col('#3c4046'));
        box.geo(new THREE.BoxGeometry(1.5, 0.08, 1.0), mat(x, 1.16, z, 0, ry), col('#ff7a1a'));
        for (const lx of [-0.55, 0.55]) for (const lz of [-0.3, 0.3]) {
          box.geo(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 5), mat(x + Math.cos(ry) * lx + Math.sin(ry) * lz, 0.2, z - Math.sin(ry) * lx + Math.cos(ry) * lz), col('#c9c9c4'));
        }
        papi.push({ x, y: 0.8, z, dx, dz, ry, angle: PAPI_ANGLES[k] });
      }
    }
  }
  const housing = new THREE.Mesh(box.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  housing.castShadow = quality !== 'low';
  housing.name = 'papiHousing';

  const lensGeo = new THREE.PlaneGeometry(1.1, 0.42);
  const lensMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const lenses = new THREE.InstancedMesh(lensGeo, lensMat, papi.length);
  papi.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x - p.dx * 0.46, p.y, p.z - p.dz * 0.46), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1, 1, 1));
    lenses.setMatrixAt(i, m);
    lenses.setColorAt(i, c.set('#000'));
  });
  lenses.name = 'papiLens';

  const gpos = new Float32Array(papi.length * 3), gcol = new Float32Array(papi.length * 4);
  papi.forEach((p, i) => { gpos[i * 3] = p.x - p.dx * 0.6; gpos[i * 3 + 1] = p.y; gpos[i * 3 + 2] = p.z - p.dz * 0.6; });
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  gg.setAttribute('color', new THREE.BufferAttribute(gcol, 4));
  const glowTex = makeGlow();
  const glowMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const glow = new THREE.Points(gg, glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  glow.name = 'papiGlow';

  const WHITE = new THREE.Color(3, 2.9, 2.6), REDC = new THREE.Color(3, 0.15, 0.1), OFF = new THREE.Color(0, 0, 0), tmp = new THREE.Color();
  function update(camera, pixelRatio = 1) {
    const cp = camera.position;
    glowMat.size = 4.5 * pixelRatio;
    for (let i = 0; i < papi.length; i++) {
      const p = papi[i];
      const vx = cp.x - p.x, vz = cp.z - p.z;
      const along = -(vx * p.dx + vz * p.dz);
      const lat = Math.abs(vx * p.dz - vz * p.dx);
      if (along < 2 || lat > along * 0.35 + 20) { tmp.copy(OFF); }
      else {
        const ang = Math.atan2(cp.y - p.y, Math.hypot(vx, vz)) * 180 / Math.PI;
        const w = Math.min(1, Math.max(0, (ang - p.angle) / 0.06 + 0.5));
        tmp.copy(REDC).lerp(WHITE, w);
        const fall = Math.min(1, along / 40);
        tmp.multiplyScalar(fall);
      }
      lenses.setColorAt(i, tmp);
      const g = Math.min(1, Math.max(0, (along - 60) / 400));
      gcol[i * 4] = Math.min(1, tmp.r / 2.6); gcol[i * 4 + 1] = Math.min(1, tmp.g / 2.6); gcol[i * 4 + 2] = Math.min(1, tmp.b / 2.6); gcol[i * 4 + 3] = tmp.r > 0 ? g : 0;
    }
    lenses.instanceColor.needsUpdate = true;
    gg.attributes.color.needsUpdate = true;
  }
  return { objects: [fixtures, housing, lenses, glow], update, papi };
}

function makeGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
