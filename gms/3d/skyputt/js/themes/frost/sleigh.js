// Frost Fair theme — Santa's sleigh with a reindeer team (Rudolph leads, nose glowing), flying a slow
// loop that passes in front of the moon, with a twinkling trail. Static merged geometry (one mesh per
// material); the whole team bobs and banks. The trail billboards are moved in update().
import * as THREE from 'three';
import { Buckets, mat, rng } from './util.js';
import { makeBillboards } from './billboards.js';

const RED = 0xc81c28, GOLD = 0xe8b84a, FUR = 0x7a5030, FUR2 = 0x5e3c22, ANTLER = 0xd8c09a, SKIN = 0xf0c0a0, WHITE = 0xf6f6f2;
const put = (b, key, geo, color, M, local) => b.add(key, geo, color, local ? M.clone().multiply(local) : M);

/** Reindeer facing +Z, standing height ~0.75 (local), galloping pose. */
function reindeer(b, M, nose = false) {
  put(b, 'vc', new THREE.SphereGeometry(0.22, 9, 6), FUR, M, mat(0, 0.55, 0, 0, 0, 0, [0.85, 0.8, 1.6]));
  put(b, 'vc', new THREE.CylinderGeometry(0.07, 0.1, 0.36, 6), FUR, M, mat(0, 0.78, 0.32, 0.7, 0, 0));
  put(b, 'vc', new THREE.SphereGeometry(0.1, 8, 6), FUR2, M, mat(0, 0.92, 0.46, 0, 0, 0, [0.8, 0.85, 1.4]));
  put(b, 'snow', new THREE.SphereGeometry(0.06, 6, 4), WHITE, M, mat(0, 0.5, -0.34));   // tail
  if (nose) put(b, 'nose', new THREE.SphereGeometry(0.045, 6, 4), null, M, mat(0, 0.9, 0.6));
  else put(b, 'vc', new THREE.SphereGeometry(0.03, 5, 3), 0x1a1210, M, mat(0, 0.9, 0.6));
  for (const sx of [-1, 1]) {
    // antlers: beam + two tines
    const A = M.clone().multiply(mat(sx * 0.05, 1.0, 0.42, -0.3, 0, -sx * 0.45));
    put(b, 'vc', new THREE.CylinderGeometry(0.012, 0.018, 0.26, 4), ANTLER, A, mat(0, 0.13, 0));
    put(b, 'vc', new THREE.CylinderGeometry(0.008, 0.012, 0.12, 4), ANTLER, A, mat(0, 0.16, 0.05, 0.9, 0, 0));
    put(b, 'vc', new THREE.CylinderGeometry(0.008, 0.012, 0.1, 4), ANTLER, A, mat(sx * 0.03, 0.24, 0.02, 0.4, 0, -sx * 0.6));
    put(b, 'vc', new THREE.ConeGeometry(0.03, 0.07, 4), FUR2, M, mat(sx * 0.08, 0.98, 0.4, 0, 0, -sx * 1.2));   // ear
    // legs: front reach forward, back kick back (flying gallop)
    put(b, 'vc', new THREE.CylinderGeometry(0.025, 0.035, 0.42, 5), FUR2, M, mat(sx * 0.1, 0.4, 0.34, -1.0, 0, 0));
    put(b, 'vc', new THREE.CylinderGeometry(0.025, 0.035, 0.42, 5), FUR2, M, mat(sx * 0.1, 0.4, -0.3, 1.0, 0, 0));
  }
  // harness collar + a bell
  put(b, 'gloss', new THREE.TorusGeometry(0.12, 0.025, 5, 10), RED, M, mat(0, 0.72, 0.24, 0.9, 0, 0));
  put(b, 'metal', new THREE.SphereGeometry(0.03, 6, 4), GOLD, M, mat(0, 0.62, 0.3));
}

/** Builds the sleigh team as a Group (local +Z = direction of travel). Returns { group, trailLocal }. */
export function buildSleigh(mats, hi) {
  const b = new Buckets();
  const I = new THREE.Matrix4();
  // sleigh body: extruded side profile (curled front), width 0.8
  const sh = new THREE.Shape();
  const P = [[-0.8, 0.15], [-0.85, 0.8], [-0.6, 0.86], [-0.45, 0.48], [0.3, 0.46], [0.55, 0.62], [0.7, 0.92], [0.88, 0.86], [0.82, 0.56], [0.62, 0.28], [0.4, 0.12]];
  sh.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) sh.lineTo(x, y); sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: hi, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  body.translate(0, 0, -0.4); body.rotateY(-Math.PI / 2);
  put(b, 'gloss', body, RED, I);
  // gold trim along the top edges and the curl
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([[-0.85, 0.8], [-0.6, 0.86], [-0.45, 0.5], [0.3, 0.48], [0.55, 0.64], [0.7, 0.94], [0.88, 0.86]].map(([z, y]) => new THREE.Vector3(sx * 0.43, y, z)));
    put(b, 'metal', new THREE.TubeGeometry(c, 20, 0.025, 4, false), GOLD, I);
    // runners: a long curl under each side
    const rn = new THREE.CatmullRomCurve3([[-0.95, 0.12], [-0.6, 0.0], [0.4, 0.0], [0.85, 0.08], [1.05, 0.3], [0.95, 0.42]].map(([z, y]) => new THREE.Vector3(sx * 0.32, y, z)));
    put(b, 'metal', new THREE.TubeGeometry(rn, 20, 0.022, 4, false), GOLD, I);
    for (const z of [-0.5, 0.3]) put(b, 'metal', new THREE.CylinderGeometry(0.015, 0.015, 0.15, 4), GOLD, I, mat(sx * 0.32, 0.08, z));
  }
  // Santa: body, belt, beard, face, hat with pom-pom, waving arm
  put(b, 'gloss', new THREE.SphereGeometry(0.26, 10, 8), RED, I, mat(0, 0.78, -0.35, 0, 0, 0, [1, 1.1, 0.95]));
  put(b, 'vc', new THREE.CylinderGeometry(0.255, 0.255, 0.06, 10), 0x1a1a1a, I, mat(0, 0.72, -0.35));
  put(b, 'metal', new THREE.BoxGeometry(0.08, 0.07, 0.02), GOLD, I, mat(0, 0.72, -0.1));
  put(b, 'vc', new THREE.SphereGeometry(0.13, 8, 6), SKIN, I, mat(0, 1.12, -0.3));
  put(b, 'snow', new THREE.SphereGeometry(0.12, 8, 6), WHITE, I, mat(0, 1.04, -0.22, 0, 0, 0, [1.1, 1.0, 0.8]));
  put(b, 'gloss', new THREE.ConeGeometry(0.13, 0.28, 8), RED, I, mat(0, 1.32, -0.34, -0.5, 0, 0));
  put(b, 'snow', new THREE.TorusGeometry(0.12, 0.035, 5, 10), WHITE, I, mat(0, 1.2, -0.31, Math.PI / 2 - 0.3, 0, 0));
  put(b, 'snow', new THREE.SphereGeometry(0.05, 6, 4), WHITE, I, mat(0, 1.38, -0.5));
  put(b, 'gloss', new THREE.CylinderGeometry(0.05, 0.06, 0.34, 6), RED, I, mat(0.26, 1.0, -0.28, 0, 0, -0.9));
  put(b, 'snow', new THREE.SphereGeometry(0.055, 6, 4), WHITE, I, mat(0.4, 1.12, -0.28));
  // sack of toys
  put(b, 'vc', new THREE.SphereGeometry(0.32, 9, 7), 0x8a6a42, I, mat(0, 0.86, -0.72, 0, 0, 0, [1.1, 1.0, 0.9]));
  for (const [x, y, c] of [[-0.12, 1.16, 0x2a8a4a], [0.12, 1.14, 0x2a5ad0], [0, 1.22, 0xe8b84a]]) put(b, 'gloss', new THREE.BoxGeometry(0.14, 0.14, 0.14), c, I, mat(x, y, -0.72, 0.3, x * 3, 0.2));
  // reindeer team (pairs) + Rudolph in the lead, harness lines
  const pairs = hi ? 3 : 2;
  const lead = 1.35 + pairs * 1.05;
  for (let i = 0; i < pairs; i++) for (const sx of [-1, 1]) reindeer(b, mat(sx * 0.32, 0.25 + i * 0.06, 1.35 + i * 1.05, -0.06, 0, 0));
  reindeer(b, mat(0, 0.25 + pairs * 0.06, lead, -0.06, 0, 0), true);
  for (const sx of [-1, 1]) {
    const len = lead - 0.4;
    put(b, 'metal', new THREE.BoxGeometry(0.012, 0.012, len), GOLD, I, mat(sx * 0.2, 0.82, 0.55 + len / 2 - 0.15, -0.03, 0, 0));
  }
  const group = new THREE.Group(); group.name = 'frost.sleigh';
  b.build(mats, group, { castShadow: false });
  group.traverse(o => { o.frustumCulled = false; });
  return { group, length: lead + 1 };
}

/**
 * The flight: a slow loop centred ahead of the course so the front half crosses the player's view
 * (near the moon) and the back half passes high over the course. Returns { group, trail, update(t), dispose }.
 */
export function buildFlight(frame, mats, glowTex, fog, uniforms, hi) {
  const { group } = buildSleigh(mats, hi);
  const S = 2.6;
  group.scale.setScalar(S);
  const view = frame.view, vr = frame.viewRight;
  const C = frame.center.clone().addScaledVector(view, 42);
  const Rr = 56, H = frame.center.y + 4;
  const a0 = -0.42, w = 0.04;
  const at = (t, out) => {
    const a = a0 + w * t;
    out.copy(C).addScaledVector(vr, Math.sin(a) * Rr).addScaledVector(view, Math.cos(a) * Rr);
    out.y = H + (1 - Math.cos(a)) * 9 + Math.sin(t * 0.35) * 1.2;
    return out;
  };
  // trail of twinkling sparkles: each item is the sleigh's position some seconds ago (plus a fixed jitter)
  const r = rng(25);
  const N = hi ? 60 : 28;
  const items = [], lags = [], jit = [];
  for (let i = 0; i < N; i++) {
    const lag = 0.6 + i * (hi ? 0.13 : 0.26);
    lags.push(lag);
    jit.push([(r() - 0.5) * 1.2, (r() - 0.5) * 0.8 - 0.4, (r() - 0.5) * 1.2]);
    const k = 1 - i / N;
    items.push({ p: [0, 0, 0], w: (0.5 + r() * 0.6) * (0.4 + k * 0.6), a: 0.35 + k * 0.6, color: r() < 0.7 ? [1, 0.85, 0.5] : [0.7, 0.85, 1], phase: r(), drift: 0.0 });
  }
  const trail = makeBillboards(items, { map: glowTex, additive: true, mode: 'sparkle', fog: null, uniforms });
  trail.name = 'frost.sleighTrail';
  const tp = trail.geometry.attributes.position;
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  function update(t) {
    at(t, p);
    at(t + 0.5, q);
    group.position.copy(p);
    const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y;
    const yaw = Math.atan2(dx, dz);
    group.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)) * 0.6, yaw, 0, 'YXZ');
    group.rotation.z = -0.12 + Math.sin(t * 0.8) * 0.03;   // gentle bank into the turn
    for (let i = 0; i < N; i++) {
      at(t - lags[i], q);
      const j = jit[i], x = q.x + j[0], y = q.y + j[1], z = q.z + j[2];
      for (let k = 0; k < 4; k++) tp.setXYZ(i * 4 + k, x, y, z);
    }
    tp.needsUpdate = true;
  }
  update(0);
  return { group, trail, update };
}
