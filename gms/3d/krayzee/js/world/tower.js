import * as THREE from 'three';
import { Builder, col, mat } from './util.js';
import { TOWER } from './layout.js';
import { buildCrown, decalQuad } from './terminal.js';

const CONC = col('#e4ddd0'), CONC2 = col('#cfc7b8'), DARK = col('#2b2f34'), PURPLE = col('#4b1f7a');
const SIDES = 8;

function ring(r, k) { const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES; return [Math.cos(a) * r, Math.sin(a) * r]; }

export function buildTower(B, atlas, quality) {
  const { matte: M, metal: T, glass: G, decal: D } = B;
  const [tx, , tz] = TOWER.position;
  const cabFloor = TOWER.height - 4.6, cabTop = cabFloor + 3.7;

  M.box(tx + 9, 3.6, tz - 1, 16, 7.2, 12, CONC);
  M.box(tx + 9, 7.4, tz - 1, 16.6, 0.4, 12.6, CONC2);
  for (let x = tx + 3; x < tx + 17; x += 2.5) G.quad([x - 0.9, 1.4, tz + 5.02], [x + 0.9, 1.4, tz + 5.02], [x + 0.9, 2.9, tz + 5.02], [x - 0.9, 2.9, tz + 5.02], [1, 1, 1]);
  for (let x = tx + 3; x < tx + 17; x += 2.5) G.quad([x - 0.9, 4.4, tz + 5.02], [x + 0.9, 4.4, tz + 5.02], [x + 0.9, 5.9, tz + 5.02], [x - 0.9, 5.9, tz + 5.02], [1, 1, 1]);
  decalQuad(D, atlas.uv.twr, tx + 9, 6.5, tz + 5.05, 5.6, 1.4);

  M.geo(new THREE.CylinderGeometry(3.0, 3.8, cabFloor - 3.2, SIDES), mat(tx, (cabFloor - 3.2) / 2, tz, 0, Math.PI / SIDES), CONC);
  for (let y = 4; y < cabFloor - 4; y += 4.2) M.geo(new THREE.CylinderGeometry(3.85 - y * 0.026, 3.85 - y * 0.026, 0.18, SIDES), mat(tx, y, tz, 0, Math.PI / SIDES), CONC2);
  for (let y = 6; y < cabFloor - 6; y += 4.2) G.quad([tx - 0.5, y, tz + 3.62 - y * 0.022], [tx + 0.5, y, tz + 3.62 - y * 0.022], [tx + 0.5, y + 1.6, tz + 3.6 - y * 0.022], [tx - 0.5, y + 1.6, tz + 3.6 - y * 0.022], [1, 1, 1]);
  M.geo(new THREE.CylinderGeometry(5.4, 3.0, 3.2, SIDES), mat(tx, cabFloor - 1.6, tz, 0, Math.PI / SIDES), CONC);
  M.geo(new THREE.CylinderGeometry(6.4, 6.4, 0.35, SIDES), mat(tx, cabFloor - 0.05, tz, 0, Math.PI / SIDES), CONC2);
  for (let k = 0; k < SIDES; k++) {
    const [ax, az] = ring(6.25, k), [bx, bz] = ring(6.25, k + 1);
    M.geo(new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az), 0.06, 0.06), mat(tx + (ax + bx) / 2, cabFloor + 1.1, tz + (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax)), DARK);
    for (let s = 0; s < 4; s++) M.box(tx + ax + (bx - ax) * s / 4, cabFloor + 0.55, tz + az + (bz - az) * s / 4, 0.05, 1.1, 0.05, DARK);
  }

  // cab: outward-leaning glass, corner mullions, consoles
  const rb = 4.9, rt = 5.6;
  for (let k = 0; k < SIDES; k++) {
    const [ax, az] = ring(rb, k), [bx, bz] = ring(rb, k + 1), [cx, cz] = ring(rt, k + 1), [dx, dz] = ring(rt, k);
    const y0 = cabFloor + 0.9, y1 = cabTop;
    G.quad([tx + bx, y0, tz + bz], [tx + ax, y0, tz + az], [tx + dx, y1, tz + dz], [tx + cx, y1, tz + cz], col('#dff3ea'));
    M.beam([tx + ax, y0 - 0.05, tz + az], [tx + dx, y1 + 0.05, tz + dz], 0.13, DARK);
    const [ex, ez] = ring(rb, k), [fx, fz] = ring(rb, k + 1);
    M.geo(new THREE.BoxGeometry(Math.hypot(fx - ex, fz - ez), 0.9, 0.12), mat(tx + (ex + fx) / 2, cabFloor + 0.45, tz + (ez + fz) / 2, 0, -Math.atan2(fz - ez, fx - ex)), CONC2);
  }
  M.geo(new THREE.CylinderGeometry(rb - 0.1, rb - 0.1, 0.2, SIDES), mat(tx, cabFloor + 0.1, tz, 0, Math.PI / SIDES), col('#57514a'));
  M.geo(new THREE.CylinderGeometry(6.5, 6.5, 0.55, SIDES), mat(tx, cabTop + 0.28, tz, 0, Math.PI / SIDES), col('#3a3f46'));
  M.geo(new THREE.CylinderGeometry(6.6, 6.6, 0.12, SIDES), mat(tx, cabTop + 0.05, tz, 0, Math.PI / SIDES), PURPLE);
  M.geo(new THREE.CylinderGeometry(rt - 0.2, rt - 0.2, 0.1, SIDES), mat(tx, cabTop - 0.05, tz, 0, Math.PI / SIDES), col('#e8e4dc', 1.1));
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * 0.15 + k * Math.PI * 0.175;
    const r = 3.7, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
    M.geo(new THREE.BoxGeometry(1.7, 1.0, 0.8), mat(x, cabFloor + 0.7, z, 0, -a + Math.PI / 2), col('#3b4048'));
    M.geo(new THREE.BoxGeometry(1.5, 0.04, 0.5), mat(x, cabFloor + 1.22, z, -0.25, -a + Math.PI / 2), col('#59606a'));
    decalQuad(D, atlas.uv.screen, x - Math.cos(a) * 0.25, cabFloor + 1.6, z - Math.sin(a) * 0.25, 0.65, 0.45, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }
  M.geo(new THREE.CylinderGeometry(0.35, 0.35, cabTop - cabFloor, 8), mat(tx, (cabFloor + cabTop) / 2, tz), CONC2);

  // roof kit: crown, beacon, mast, radar
  buildCrown(T, M, tx - 2.5, cabTop + 0.55, tz + 2.0, 0.9);
  T.geo(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), mat(tx + 1.5, cabTop + 3.5, tz - 1.5), col('#d0d0d0'));
  for (const y of [2, 3.5, 5]) T.geo(new THREE.BoxGeometry(1.4, 0.05, 0.05), mat(tx + 1.5, cabTop + y, tz - 1.5), col('#d0d0d0'));
  M.geo(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8), mat(tx - 1.5, cabTop + 0.85, tz - 2.2), col('#2a2d30'));
  B.flags.push({ x: tx + 1.6, y: cabTop + 5.6, z: tz - 1.5, w: 2.4, h: 1.6, rect: atlas.uv.flag, phase: 2.3 });

  const radar = new Builder();
  radar.geo(new THREE.BoxGeometry(3.2, 0.5, 0.25), mat(0, 0.2, 0), col('#e9eaec'));
  radar.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), mat(0, -0.25, 0), col('#5b5f66'));
  const radarMesh = new THREE.Mesh(radar.build(), B.matteMaterial);
  radarMesh.position.set(tx - 1.5, cabTop + 1.5, tz - 2.2);
  radarMesh.castShadow = true;
  radarMesh.name = 'towerRadar';

  const crew = buildCrew(tx, cabFloor, tz);
  const group = new THREE.Group();
  group.name = 'towerCrew';
  group.add(radarMesh, ...crew.objects);

  const colliders = [
    { min: [tx - 3.9, 0, tz - 3.9], max: [tx + 3.9, cabFloor, tz + 3.9], kind: 'tower' },
    { min: [tx - 6.6, cabFloor - 3.2, tz - 6.6], max: [tx + 6.6, cabTop + 1.2, tz + 6.6], kind: 'tower' },
    { min: [tx + 1, 0, tz - 7.3], max: [tx + 17.3, 7.6, tz + 5.3], kind: 'tower' },
    { min: [tx + 1, cabTop, tz - 2.2], max: [tx + 2.2, cabTop + 7.2, tz - 0.8], kind: 'mast' },
  ];
  function update(dt, t, camera) {
    radarMesh.rotation.y = t * 2.2;
    crew.update(dt, t, camera);
  }
  return { group, colliders, update, cab: new THREE.Vector3(tx, cabFloor + 1.6, tz), crew: crew.people };
}

// Three controllers: seated duo and a standing supervisor; heads follow the camera, the supervisor flaps.
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
  const objects = [];
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
    const bodyMesh = new THREE.Mesh(body.build(), mat0);
    bodyMesh.position.set(x, floor + 0.2, z);
    bodyMesh.rotation.y = yaw;
    objects.push(bodyMesh);

    const head = new Builder();
    head.geo(new THREE.SphereGeometry(0.13, 10, 8), mat(0, 0.12, 0, 0, 0, 0, 0.95, 1.08, 1), sk);
    head.geo(new THREE.SphereGeometry(0.138, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0, 0.15, -0.012), col(hairs[i]));
    head.geo(new THREE.TorusGeometry(0.145, 0.018, 4, 12, Math.PI), mat(0, 0.14, 0, 0, Math.PI / 2, 0), col('#111'));
    head.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), mat(0.14, 0.11, 0, 0, 0, Math.PI / 2), col('#111'));
    head.geo(new THREE.BoxGeometry(0.02, 0.02, 0.12), mat(0.12, 0.06, 0.08, 0, 0.5, 0), col('#111'));
    head.geo(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat(0, 0.1, 0.13), sk);
    if (i === 0) head.geo(new THREE.BoxGeometry(0.26, 0.05, 0.02), mat(0, 0.15, 0.13), col('#111'));
    const headMesh = new THREE.Mesh(head.build(), mat0);
    headMesh.position.set(0, hip + 0.7, 0);
    bodyMesh.add(headMesh);

    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new Builder();
      arm.geo(new THREE.CylinderGeometry(0.055, 0.05, 0.55, 6), mat(0, -0.27, 0), sh);
      arm.geo(new THREE.SphereGeometry(0.055, 6, 4), mat(0, -0.57, 0), sk);
      if (s.stand && side > 0) {
        arm.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), mat(0.0, -0.62, 0.07, Math.PI / 2, 0, 0), col('#1a1a1a'));
      }
      if (i === 1 && side < 0) arm.geo(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), mat(0, -0.64, 0.05), col('#d61f45'));
      const am = new THREE.Mesh(arm.build(), mat0);
      am.position.set(side * 0.25, hip + 0.58, 0);
      bodyMesh.add(am);
      arms.push(am);
    }
    people.push({ body: bodyMesh, head: headMesh, arms, stand: s.stand, yaw, phase: i * 2.1 });
  });

  const tmp = new THREE.Vector3();
  function update(dt, t, camera) {
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
