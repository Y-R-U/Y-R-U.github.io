import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };

function carGeometry() {
  const body = new THREE.SphereGeometry(1, 14, 7); body.scale(2.6, 0.5, 1.15);
  const canopy = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2); canopy.scale(1.2, 0.55, 0.8); canopy.translate(0.3, 0.2, 0);
  const podL = new THREE.CylinderGeometry(0.42, 0.42, 1.6, 8); podL.rotateZ(Math.PI / 2); podL.translate(-1.4, -0.15, 1.25);
  const podR = podL.clone(); podR.translate(0, 0, -2.5);
  const glow = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8); glow.rotateZ(Math.PI / 2);
  const g1 = glow.clone(); g1.translate(-2.22, -0.15, 1.25); const g2 = glow.clone(); g2.translate(-2.22, -0.15, -1.25);
  const strip = new THREE.BoxGeometry(3.6, 0.06, 1.9); strip.translate(0, -0.42, 0);
  return {
    body: mergeGeometries([body, podL, podR].map(clean)),
    glass: clean(canopy),
    glow: mergeGeometries([g1, g2, strip].map(clean)),
  };
}

// Flying cars on looping sky lanes + a monorail loop with a train.
export function buildTraffic(ctx) {
  const R = rng(31);
  const lanes = [];
  // big loops around the district
  for (const [r, y, sp, dir] of [[120, 34, 16, 1], [150, 48, 20, -1], [210, 70, 24, 1], [260, 95, 26, -1], [340, 130, 30, 1], [180, 58, 18, -1]]) lanes.push({ type: 'loop', cx: 0, cz: -60, r, y, sp: sp * dir });
  // straight corridors crossing the north vista
  for (const [x0, z0, x1, z1, y, sp] of [[-600, -150, 600, -170, 42, 28], [600, -230, -600, -200, 64, 30], [-600, -300, 600, -330, 90, 34], [-80, 400, 60, -700, 55, 30], [120, -700, -100, 400, 38, 26]]) lanes.push({ type: 'line', x0, z0, x1, z1, y, sp });
  const { paint, glow } = addFlyingCars(ctx, lanes, ctx.tier.traffic, R);
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * 165 + Math.sin(a * 3) * 12, 27 + Math.sin(a * 2) * 5, -45 + Math.cos(a) * 140));
  }
  addMonorail(ctx, new THREE.CatmullRomCurve3(pts, true), { paint, glow });
}

// lanes: {type:'loop', cx, cz, r, y, sp} | {type:'line', x0, z0, x1, z1, y, sp}; n instanced cars spread over them.
export function addFlyingCars(ctx, lanes, n, R = rng(31), { spread = 8, scale = 1.4 } = {}) {
  const { scene, updaters } = ctx;
  const cars = [];
  for (let i = 0; i < n; i++) {
    const lane = lanes[i % lanes.length];
    cars.push({ lane, t: R(), off: (R() - 0.5) * spread, dy: (R() - 0.5) * 6, bob: R() * 6 });
  }
  const geo = carGeometry();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.18, metalness: 0.6, envMapIntensity: 1.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1520, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.5 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.85, 1.0).multiplyScalar(5) });
  const meshes = [new THREE.InstancedMesh(geo.body, paint, n), new THREE.InstancedMesh(geo.glass, glass, n), new THREE.InstancedMesh(geo.glow, glow, n)];
  for (const m of meshes) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  // car paint variety: a few gold, a few dark
  const cols = [new THREE.Color(0xf4f5f7), new THREE.Color(0xf4f5f7), new THREE.Color(0xe0b060), new THREE.Color(0x2a2e36)];
  for (let i = 0; i < n; i++) meshes[0].setColorAt(i, cols[(R() * cols.length) | 0]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(scale, scale, scale), e = new THREE.Euler();
  const place = (dt, time) => {
    for (let i = 0; i < n; i++) {
      const c = cars[i], L = c.lane;
      let yaw, bank = 0;
      if (L.type === 'loop') {
        c.t = (c.t + dt * L.sp / (2 * Math.PI * L.r) + 1) % 1;
        const a = c.t * Math.PI * 2, rr = L.r + c.off;
        p.set(L.cx + Math.sin(a) * rr, L.y + c.dy, L.cz + Math.cos(a) * rr);
        yaw = a + (L.sp > 0 ? 0 : Math.PI);
        bank = 0.12 * Math.sign(L.sp);
      } else {
        const len = Math.hypot(L.x1 - L.x0, L.z1 - L.z0);
        c.t = (c.t + dt * L.sp / len) % 1;
        p.set(L.x0 + (L.x1 - L.x0) * c.t, L.y + c.dy, L.z0 + (L.z1 - L.z0) * c.t);
        p.x += c.off; yaw = Math.atan2(L.x1 - L.x0, L.z1 - L.z0) - Math.PI / 2;
      }
      p.y += Math.sin(time * 1.3 + c.bob) * 0.3;
      e.set(bank, yaw, 0, 'YXZ');
      m4.compose(p, q.setFromEuler(e), s);
      for (const m of meshes) m.setMatrixAt(i, m4);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };
  place(0, 0);
  updaters.push(place);
  ctx.farSky.push(...meshes);
  ctx.stats.cars = (ctx.stats.cars || 0) + n;
  return { paint, glow, meshes };
}

// Elevated monorail along `curve`: extruded beam + glow strip + pylons down to pylonY0 + an instanced train.
export function addMonorail(ctx, curve, { paint, glow, pylons = 36, pylonY0 = -10, cars = 5, speed = 22, trains = 1, far = true, beamMat = null, steps = 300 } = {}) {
  const { scene, M, updaters } = ctx;
  paint ||= new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.18, metalness: 0.6, envMapIntensity: 1.2 });
  glow ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.85, 1.0).multiplyScalar(5) });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const beamShape = new THREE.Shape(); beamShape.moveTo(-0.9, -0.7); beamShape.lineTo(0.9, -0.7); beamShape.lineTo(0.7, 0.6); beamShape.lineTo(-0.7, 0.6); beamShape.closePath();
  const beam = new THREE.Mesh(new THREE.ExtrudeGeometry(beamShape, { steps, extrudePath: curve, bevelEnabled: false }), beamMat || M.skyStone);
  beam.layers.enable(REFLECT_LAYER); beam.castShadow = false;
  scene.add(beam);
  const glowTube = new THREE.Mesh(new THREE.TubeGeometry(curve, steps, 0.12, 4, curve.closed), glow);
  glowTube.position.y = -0.75; glowTube.layers.enable(REFLECT_LAYER);
  scene.add(glowTube);
  const pylonGeo = new THREE.CylinderGeometry(0.9, 1.4, 1, 10); pylonGeo.translate(0, 0.5, 0);
  const NP = pylons;
  const pyl = new THREE.InstancedMesh(pylonGeo, beamMat || M.skyStone, NP);
  for (let i = 0; i < NP; i++) {
    const pt = curve.getPointAt(curve.closed ? i / NP : (i + 0.5) / NP);
    m4.compose(new THREE.Vector3(pt.x, pylonY0, pt.z), q.identity(), new THREE.Vector3(1, pt.y - pylonY0 - 0.7, 1));
    pyl.setMatrixAt(i, m4);
  }
  pyl.layers.enable(REFLECT_LAYER);
  scene.add(pyl);
  const carG = new THREE.CapsuleGeometry(1.5, 9, 4, 12); carG.rotateZ(Math.PI / 2);
  const winG = new THREE.BoxGeometry(10.5, 0.5, 3.1); winG.translate(0, 0.35, 0);
  const NC = cars * trains;
  const train = new THREE.InstancedMesh(carG, paint, NC);
  const wins = new THREE.InstancedMesh(winG, glow, NC);
  for (const m of [train, wins]) { m.frustumCulled = false; m.layers.enable(REFLECT_LAYER); scene.add(m); }
  if (far) ctx.farSky.push(beam, glowTube, pyl, train, wins);
  const len = curve.getLength();
  let tt = 0;
  const up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), look = new THREE.Matrix4(), zero = new THREE.Vector3(), turn = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2);
  updaters.push((dt) => {
    tt = (tt + dt * speed / len) % 1;
    for (let k = 0; k < trains; k++) for (let i = 0; i < cars; i++) {
      let u = tt + k / trains - i * 12.2 / len;
      u = curve.closed ? ((u % 1) + 1) % 1 : Math.min(1, Math.max(0, (((u % 1) + 1) % 1) * 1.3 - 0.15));
      curve.getPointAt(u, p); curve.getTangentAt(u, tan);
      p.y += 2.3;
      look.lookAt(zero, tan, up);
      q.setFromRotationMatrix(look).multiply(turn);
      m4.compose(p, q, s);
      train.setMatrixAt(k * cars + i, m4); wins.setMatrixAt(k * cars + i, m4);
    }
    train.instanceMatrix.needsUpdate = true; wins.instanceMatrix.needsUpdate = true;
  });
  return { beam, train };
}
