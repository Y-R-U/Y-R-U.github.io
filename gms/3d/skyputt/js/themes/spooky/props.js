// Spooky Hollow theme — small props built into Buckets: jack-o'-lanterns, gravestones, iron fences,
// gargoyles on pillars, candles, a cauldron, dead trees, skulls. Every builder takes a Buckets `b` and a
// placement Matrix4 `M` (local Y up). Bucket keys: vc, gloss, metal, face, ember, green, candle, rock.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  pumpkin: 0xe8701c, pumpkin2: 0xd85a14, stem: 0x4a5a26, stone: 0x77708a, stoneDark: 0x4e4860,
  iron: 0x2c2834, wood: 0x3a2c26, bone: 0xe6dcc4, cauldron: 0x1e1c22, wax: 0xeee2c4, bark: 0x2e2630,
};

const put = (b, key, geo, color, M, local) => b.add(key, geo, color, local ? M.clone().multiply(local) : M);

/** Ribbed pumpkin body geometry (radius 1, squashed later via the matrix). */
function pumpkinBody(seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.6 | 0));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const rib = 1 - 0.09 * Math.pow(Math.abs(Math.sin(a * 4)), 0.6) * (1 - y * y);
    const dimple = 1 - 0.25 * Math.pow(Math.max(0, Math.abs(y) - 0.75) / 0.25, 2);
    p.setXYZ(i, x * rib, y * dimple, z * rib);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Jack-o'-lantern of radius r sitting on y = 0, face toward local +Z.
 * opts: { face = true, color, seg }
 */
export function pumpkin(b, M, r, opts = {}) {
  const sy = 0.78;
  const seg = opts.seg ?? (r > 0.2 ? 18 : 12);
  put(b, 'gloss', pumpkinBody(seg), opts.color ?? COLORS.pumpkin, M, mat(0, r * sy, 0, 0, 0, 0, [r, r * sy, r]));
  put(b, 'vc', new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.35, 5), COLORS.stem, M, mat(r * 0.03, r * sy * 2 + r * 0.08, 0, 0.1, 0, -0.25));
  if (opts.face === false) return;
  const cy = r * sy;   // centre height
  const surf = (x, y) => Math.sqrt(Math.max(0.05, 1 - x * x - (y / sy) * (y / sy)));   // unit-sphere z on the squashed body
  const d = r * 0.16;
  const feat = (geo, x, y, rz = 0) => {
    const z = surf(x, y);
    const nx = x, ny = y / (sy * sy), nz = z;
    const yaw = Math.atan2(nx, nz), pitch = -Math.atan2(ny, Math.hypot(nx, nz));
    put(b, 'face', geo, null, M, mat(x * r, cy + y * r, z * r - d * 0.25, pitch, yaw, rz));
  };
  // triangular eyes (pointing up) and nose
  for (const sx of [-1, 1]) {
    const e = new THREE.CylinderGeometry(r * 0.17, r * 0.17, d, 3); e.rotateX(Math.PI / 2); e.rotateZ(Math.PI);
    feat(e, sx * 0.36, 0.16, sx * 0.15);
  }
  const n = new THREE.CylinderGeometry(r * 0.08, r * 0.08, d, 3); n.rotateX(Math.PI / 2); n.rotateZ(Math.PI);
  feat(n, 0, -0.04);
  // grin: three angled slabs
  for (const [x, y, w, rz] of [[-0.3, -0.24, 0.3, 0.35], [0, -0.33, 0.34, 0], [0.3, -0.24, 0.3, -0.35]]) {
    feat(new THREE.BoxGeometry(r * w, r * 0.15, d), x, y, rz);
  }
}

/** Rounded gravestone (top at ~h), facing +Z. kind 0 = round top, 1 = cross, 2 = pointed. */
export function gravestone(b, M, h, kind = 0, color = COLORS.stone) {
  const w = h * 0.62, t = h * 0.16;
  if (kind === 1) {
    put(b, 'vc', new THREE.BoxGeometry(t * 1.1, h, t), color, M, mat(0, h / 2, 0));
    put(b, 'vc', new THREE.BoxGeometry(w * 0.9, t * 1.1, t), color, M, mat(0, h * 0.7, 0));
  } else {
    const body = h - w / 2;
    put(b, 'vc', new THREE.BoxGeometry(w, body, t), color, M, mat(0, body / 2, 0));
    if (kind === 0) put(b, 'vc', new THREE.CylinderGeometry(w / 2, w / 2, t, 10, 1, false, -Math.PI / 2, Math.PI), color, M, mat(0, body, 0, Math.PI / 2, 0, 0));
    else put(b, 'vc', new THREE.ConeGeometry(w * 0.72, w * 0.6, 4), color, M, mat(0, body + w * 0.28, 0, 0, Math.PI / 4, 0, [1, 1, t / w * 1.4]));
    put(b, 'vc', new THREE.BoxGeometry(w * 0.6, h * 0.04, t * 1.05), COLORS.stoneDark, M, mat(0, body * 0.62, 0.002));
  }
  put(b, 'vc', new THREE.BoxGeometry(w * 1.25, h * 0.08, t * 2.2), COLORS.stoneDark, M, mat(0, h * 0.04, 0));
}

/** Iron fence from a to b (Vector3, ground y), spear-topped posts every `step` m, height h. */
export function fence(b, a, c, h = 0.42, step = 0.13) {
  const d = new THREE.Vector3().subVectors(c, a);
  const len = Math.hypot(d.x, d.z);
  if (len < 0.05) return;
  const yaw = Math.atan2(d.x, d.z);
  const M = new THREE.Matrix4().makeTranslation(a.x, a.y, a.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const z = (i / n) * len, y = (i / n) * (c.y - a.y);
    const big = i === 0 || i === n;
    const pr = big ? 0.018 : 0.008;
    put(b, 'metal', new THREE.BoxGeometry(pr * 1.6, h, pr * 1.6), COLORS.iron, M, mat(0, y + h / 2, z));
    put(b, 'metal', new THREE.ConeGeometry(pr * 2.2, big ? 0.07 : 0.05, 4), COLORS.iron, M, mat(0, y + h + (big ? 0.035 : 0.025), z));
  }
  const pitch = Math.atan2(c.y - a.y, len);
  for (const ry of [0.12, h * 0.82]) put(b, 'metal', new THREE.BoxGeometry(0.01, 0.014, Math.hypot(len, c.y - a.y)), COLORS.iron, M, mat(0, ry + (c.y - a.y) / 2, len / 2, -pitch, 0, 0));
}

/** Stone pillar (height h) with a crouching gargoyle on top, facing +Z, glowing eyes. */
export function gargoylePillar(b, M, h = 0.5, s = 0.22) {
  const pw = s * 0.95;
  put(b, 'vc', new THREE.BoxGeometry(pw * 1.25, h * 0.12, pw * 1.25), COLORS.stoneDark, M, mat(0, h * 0.06, 0));
  put(b, 'vc', new THREE.BoxGeometry(pw, h * 0.78, pw), COLORS.stone, M, mat(0, h * 0.51, 0));
  put(b, 'vc', new THREE.BoxGeometry(pw * 1.2, h * 0.1, pw * 1.2), COLORS.stoneDark, M, mat(0, h * 0.95, 0));
  // small glowing window slit in the pillar
  put(b, 'ember', new THREE.BoxGeometry(pw * 0.22, h * 0.24, 0.01), null, M, mat(0, h * 0.5, pw / 2 + 0.002));
  const G = M.clone().multiply(mat(0, h, 0));
  const c = 0x4a4458;
  // haunches + body
  put(b, 'vc', new THREE.SphereGeometry(s * 0.42, 8, 6), c, G, mat(0, s * 0.42, -s * 0.05, 0, 0, 0, [1, 0.9, 1.1]));
  put(b, 'vc', new THREE.SphereGeometry(s * 0.32, 8, 6), c, G, mat(0, s * 0.82, s * 0.08, -0.4, 0, 0, [1, 1.2, 0.9]));
  // head, snout, horns
  put(b, 'vc', new THREE.SphereGeometry(s * 0.22, 8, 6), c, G, mat(0, s * 1.12, s * 0.22));
  put(b, 'vc', new THREE.BoxGeometry(s * 0.2, s * 0.13, s * 0.18), c, G, mat(0, s * 1.06, s * 0.38));
  for (const sx of [-1, 1]) {
    put(b, 'vc', new THREE.ConeGeometry(s * 0.05, s * 0.26, 5), c, G, mat(sx * s * 0.13, s * 1.3, s * 0.16, -0.5, 0, -sx * 0.5));
    put(b, 'ember', new THREE.SphereGeometry(s * 0.035, 6, 4), null, G, mat(sx * s * 0.08, s * 1.15, s * 0.4));
    // front legs + claws
    put(b, 'vc', new THREE.CylinderGeometry(s * 0.06, s * 0.08, s * 0.5, 6), c, G, mat(sx * s * 0.18, s * 0.28, s * 0.3, 0.15, 0, 0));
    // wings: thin bat-wing triangles swept back and up
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 0.9, s * 0.55, -s * 0.2, s * 0.7, -s * 0.1, -s * 0.25, s * 0.35, -s * 0.15, -s * 0.15], 3));
    w.setIndex([0, 1, 2, 0, 2, 3]);
    w.computeVertexNormals();
    b.add('cloth', w, 0x3a3448, G.clone().multiply(mat(sx * s * 0.18, s * 0.85, -s * 0.1, 0, 0, 0, [sx, 1, 1])));
  }
}

/** Candle stack: 1–3 candles of height ~h with flames. Returns flame tip positions (local). */
export function candles(b, M, h = 0.14, n = 3, seed = 1) {
  const tips = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + seed, rr = i ? 0.035 : 0;
    const hh = h * (1 - i * 0.25), r = 0.018 - i * 0.003;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    put(b, 'vc', new THREE.CylinderGeometry(r, r * 1.05, hh, 8), COLORS.wax, M, mat(x, hh / 2, z));
    put(b, 'vc', new THREE.SphereGeometry(r * 1.1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.wax, M, mat(x, hh - r * 0.2, z, Math.PI, 0, 0, [1, 0.5, 1]));
    put(b, 'candle', new THREE.ConeGeometry(r * 0.55, r * 2.2, 6), null, M, mat(x, hh + r * 1.4, z));
    tips.push(new THREE.Vector3(x, hh + r * 1.4, z));
  }
  return tips;
}

/** Iron cauldron of rim radius R on three legs, green brew top. Returns the brew centre (local). */
export function cauldron(b, M, R = 0.2) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = -Math.PI / 2 + t * Math.PI * 0.92;
    pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * R * 1.12), Math.sin(a) * R * 0.85 + R * 0.85));
  }
  put(b, 'metal', new THREE.LatheGeometry(pts, 16), COLORS.cauldron, M, mat(0, R * 0.12, 0));
  const top = R * 0.12 + Math.sin(-Math.PI / 2 + Math.PI * 0.92) * R * 0.85 + R * 0.85;
  put(b, 'metal', new THREE.TorusGeometry(R * 0.97, R * 0.07, 6, 18), COLORS.cauldron, M, mat(0, top, 0, Math.PI / 2, 0, 0));
  put(b, 'green', new THREE.CircleGeometry(R * 0.93, 18), null, M, mat(0, top - R * 0.06, 0, -Math.PI / 2, 0, 0));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    put(b, 'metal', new THREE.CylinderGeometry(R * 0.05, R * 0.03, R * 0.5, 5), COLORS.cauldron, M, mat(Math.cos(a) * R * 0.75, R * 0.2, Math.sin(a) * R * 0.75, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3));
  }
  // embers + logs underneath
  for (let i = 0; i < 4; i++) put(b, 'vc', new THREE.CylinderGeometry(R * 0.07, R * 0.07, R * 1.2, 5), COLORS.wood, M, mat(0, R * 0.06, 0, Math.PI / 2, i * 0.8, 0));
  put(b, 'ember', new THREE.SphereGeometry(R * 0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), null, M, mat(0, 0.0, 0, 0, 0, 0, [1, 0.5, 1]));
  return new THREE.Vector3(0, top - R * 0.04, 0);
}

/** Bare dead tree with forked branches, height ~h. */
export function deadTree(b, M, h, r, color = COLORS.bark, maxDepth = 3) {
  const rec = (Mx, len, rad, depth) => {
    put(b, 'vc', new THREE.CylinderGeometry(rad * 0.6, rad, len, depth ? 4 : 5, 1, true), color, Mx, mat(0, len / 2, 0));
    if (depth >= maxDepth) return;
    const k = depth === 0 ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const yaw = r() * Math.PI * 2, tilt = 0.45 + r() * 0.5;
      const at = len * (depth === 0 ? 0.55 + i * 0.18 : 0.85 + r() * 0.15);
      const Mc = Mx.clone().multiply(mat(0, at, 0, 0, yaw, 0)).multiply(mat(0, 0, 0, tilt, 0, 0));
      rec(Mc, len * (0.5 + r() * 0.2), rad * 0.6, depth + 1);
    }
  };
  rec(M, h * 0.5, h * 0.06, 0);
}

/** Skull of radius s (cranium), facing +Z; eyes glow with `eyeKey` ('ember' or 'green'). */
export function skull(b, M, s, eyeKey = 'ember', key = 'vc', color = COLORS.bone) {
  put(b, key, new THREE.SphereGeometry(s, 12, 9), color, M, mat(0, s * 1.05, 0, 0, 0, 0, [0.9, 1, 1]));
  put(b, key, new THREE.BoxGeometry(s * 1.15, s * 0.6, s * 0.95), color, M, mat(0, s * 0.42, s * 0.25));
  put(b, key, new THREE.BoxGeometry(s * 0.9, s * 0.22, s * 0.7), color, M, mat(0, s * 0.05, s * 0.34));
  for (const sx of [-1, 1]) {
    put(b, 'vc', new THREE.SphereGeometry(s * 0.26, 8, 6), 0x0a0608, M, mat(sx * s * 0.36, s * 0.86, s * 0.74, 0, 0, 0, [1, 1, 0.5]));
    if (eyeKey) put(b, eyeKey, new THREE.SphereGeometry(s * 0.12, 6, 4), null, M, mat(sx * s * 0.36, s * 0.86, s * 0.82));
  }
  put(b, 'vc', new THREE.ConeGeometry(s * 0.12, s * 0.22, 3), 0x0a0608, M, mat(0, s * 0.56, s * 0.8, Math.PI, 0, 0));
  for (let i = -2; i <= 2; i++) put(b, key, new THREE.BoxGeometry(s * 0.12, s * 0.16, s * 0.06), 0xd8ceb4, M, mat(i * s * 0.15, s * 0.22, s * 0.72));
}
