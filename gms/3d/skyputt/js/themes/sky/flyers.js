// Sky Isles theme — airship (slow circling) and hot-air balloons (instanced, bobbing).
import * as THREE from 'three';
import { Buckets, mat, paint, merge } from './util.js';

function envelopeGeo(len, rad, segs, stripes, c1, c2) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = t * 2 - 1;
    const r = rad * Math.pow(Math.max(0, 1 - u * u), 0.55) * (u > 0 ? 1 - u * 0.12 : 1);
    pts.push(new THREE.Vector2(Math.max(r, 0.001), u * len / 2));
  }
  const g = new THREE.LatheGeometry(pts, segs);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Color(c1), b = new THREE.Color(c2);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const ang = Math.atan2(p.getZ(i), p.getX(i)) + Math.PI;
    const k = Math.floor(ang / (Math.PI * 2) * stripes + 0.0001) % 2;
    const c = k ? a : b;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const out = g.toNonIndexed(); g.dispose();
  out.computeVertexNormals();
  return out;
}

/** Steampunk airship, local forward = +X. Returns Group. */
export function buildAirship(mats, hi) {
  const b = new Buckets();
  const L = 11, R = 2.3;
  const env = envelopeGeo(L, R, hi ? 18 : 12, 12, 0xc0874a, 0x9a6634);
  env.rotateZ(-Math.PI / 2);
  b.addRaw('vcMetal', env);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    const u = x / (L / 2);
    const rr = R * Math.pow(1 - u * u, 0.55) * (u > 0 ? 1 - u * 0.12 : 1);
    b.add('gold', new THREE.TorusGeometry(rr + 0.03, 0.07, 5, hi ? 24 : 14), null, mat(x, 0, 0, 0, Math.PI / 2, 0));
  }
  b.add('gold', new THREE.CylinderGeometry(0.05, 0.05, L * 0.98, 6), null, mat(0, R * 0.98, 0, 0, 0, Math.PI / 2));
  // fins
  for (const [rx] of [[0], [Math.PI / 2], [Math.PI], [-Math.PI / 2]]) {
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([-L / 2 + 0.3, 0, 0, -L / 2 - 1.0, 0, 0, -L / 2 - 1.0, 1.7, 0, -L / 2 + 1.5, 0.7, 0], 3));
    f.setIndex([0, 1, 2, 0, 2, 3]); f.computeVertexNormals();
    b.add('vcCloth', f, 0x7a4a2a, mat(0, 0, 0, rx, 0, 0));
  }
  // gondola hull
  b.add('vc', new THREE.CylinderGeometry(0.75, 0.25, 5.2, 8, 1, false, 0, Math.PI), 0x5a3a22, mat(0, -R - 1.0, 0, 0, 0, Math.PI / 2, [1, 1, 1.1]));
  b.add('vc', new THREE.BoxGeometry(5.2, 0.12, 1.5), 0x8a6040, mat(0, -R - 1.0, 0));
  b.add('gold', new THREE.BoxGeometry(5.3, 0.1, 1.6), null, mat(0, -R - 0.92, 0));
  b.add('vc', new THREE.BoxGeometry(2.2, 0.8, 1.0), 0x6a4630, mat(0.4, -R - 0.55, 0));
  for (const x of [-0.3, 0.4, 1.1]) for (const z of [-0.51, 0.51]) b.add('glow', new THREE.BoxGeometry(0.3, 0.3, 0.02), null, mat(x, -R - 0.5, z));
  // rigging posts
  for (const x of [-2, 0, 2]) b.add('vc', new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), 0x3a2a20, mat(x, -R - 0.45, 0));
  // sails (masts on the gondola)
  for (const [x, h] of [[-1.4, 2.0], [1.8, 1.6]]) {
    b.add('vc', new THREE.CylinderGeometry(0.04, 0.05, h + 0.6, 4), 0x3a2a20, mat(x, -R - 1.0 + (h + 0.6) / 2, 0.9));
    const s = new THREE.PlaneGeometry(1.2, h, 2, 2);
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 1.2 + 0.5) * Math.PI) * 0.18);
    s.computeVertexNormals();
    b.add('vcCloth', s, 0xf2e6cc, mat(x + 0.62, -R - 0.7 + h / 2, 0.9));
    b.add('vcCloth', s.clone(), 0xf2e6cc, mat(x + 0.62, -R - 0.7 + h / 2, -0.9));
  }
  // propeller
  const prop = new THREE.Group();
  const pb = new Buckets();
  for (let i = 0; i < 3; i++) pb.add('gold', new THREE.BoxGeometry(0.08, 1.4, 0.18), null, mat(0, 0, 0, i * Math.PI * 2 / 3, 0, 0));
  pb.build(mats, prop);
  prop.position.set(-L / 2 - 1.15, 0, 0);
  const g = new THREE.Group(); g.name = 'sky.airship';
  b.build(mats, g);
  g.add(prop);
  g.userData.prop = prop;
  return g;
}

/** Hot-air balloons as two instanced meshes. Returns { group, update(t) } */
export function buildBalloons(mats, placements, hi) {
  const env = envelopeGeo(1.0, 0.5, hi ? 14 : 10, 8, 0xffffff, 0xb0b0b0);
  // reshape the ellipsoid into a teardrop: pinch the bottom
  const p = env.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) { const k = 1 + y * 1.1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  }
  env.computeVertexNormals();
  const basket = paint(new THREE.CylinderGeometry(0.1, 0.08, 0.13, 6), 0x7a5232);
  basket.translate(0, -0.78, 0);
  const ropes = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.6;
    const r = paint(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 3), 0x4a3a2a);
    r.translate(Math.cos(a) * 0.09, -0.6, Math.sin(a) * 0.09);
    ropes.push(r);
  }
  const bg = [basket, ...ropes];
  const n = placements.length;
  const envIM = new THREE.InstancedMesh(env, mats.vc, n);
  const bIM = new THREE.InstancedMesh(merge(bg), mats.vc, n);
  const flame = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), mats.windowGlow, n);
  const palette = [0xe8443a, 0xf2b23a, 0x3f8ae0, 0x9a4ad0, 0x3ab07a, 0xf27a3a];
  const c = new THREE.Color();
  placements.forEach((pl, i) => { c.set(palette[i % palette.length]); envIM.setColorAt(i, c); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const group = new THREE.Group(); group.name = 'sky.balloons';
  group.add(envIM, bIM, flame);
  for (const m of [envIM, bIM, flame]) m.frustumCulled = false;
  function update(t) {
    placements.forEach((pl, i) => {
      v.set(pl.p.x + Math.sin(t * 0.05 + i) * 0.8, pl.p.y + Math.sin(t * 0.4 + i * 1.7) * 0.35, pl.p.z + Math.cos(t * 0.04 + i * 2) * 0.8);
      q.setFromAxisAngle(_Y, t * 0.05 + i);
      s.setScalar(pl.s);
      m4.compose(v, q, s);
      envIM.setMatrixAt(i, m4); bIM.setMatrixAt(i, m4);
      v.y -= 0.62 * pl.s;
      s.setScalar(pl.s * (0.8 + 0.4 * Math.abs(Math.sin(t * 7 + i * 3))));
      m4.compose(v, q, s);
      flame.setMatrixAt(i, m4);
    });
    envIM.instanceMatrix.needsUpdate = bIM.instanceMatrix.needsUpdate = flame.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
const _Y = new THREE.Vector3(0, 1, 0);

