import * as THREE from 'three';
import { Builder, srgb, sweepRings, circle, lerp } from './geom.js';
import { SEAT_S } from './cockpit.js';

// Royal pilot (left seat) and, at high quality, a royal corgi on a stack of cushions (rear bench, right).
// One dynamic mesh: every part is a static vertex block re-posed on the CPU by its own matrix.

const SKIN = { light: '#ecc4a2', fair: '#e2b48f', tan: '#c68e62', brown: '#8d5a3b', dark: '#5e3a26' };
const HAIR = { m: '#4a3222', f: '#4e2414' };
const P = {
  jacket: '#1f2b4a', jacketDark: '#172038', sash: '#b3202e', gold: '#d9ad3c', scarf: '#f3efe6', trousers: '#e6dcc6',
  boot: '#3b2416', glove: '#a8774a', headset: '#59614e', black: '#141516', lens: '#0d1116', velvet: '#8c1020',
  ruby: '#c3102a', sapphire: '#1f45c9', lip: '#b02a3a', cushion: '#6d1426', tassel: '#d9ad3c',
  corgi: '#c9762e', corgiWhite: '#f2ece2', pink: '#e38d96', nose: '#111111',
};
const RM = { cloth: [0.85, 0], skin: [0.6, 0], leather: [0.5, 0], gold: [0.28, 1], lens: [0.08, 0.3], plastic: [0.45, 0], velvet: [0.95, 0], chrome: [0.25, 1] };

const XP = -0.27, XC = 0.27;
// corgi rides on the rear bench (right side) so it doesn't fill the right-hand view from the front seats
const CS = SEAT_S + 1.06, CDY = 0.03;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const UPY = new THREE.Vector3(0, 1, 0);
const M = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export function createPilot({ quality, opts = {} }) {
  const high = quality !== 'low';
  const seg = high ? 1 : 0.5;
  const n = (k) => Math.max(4, Math.round(k * seg));
  const parts = [];
  let cfg = { gender: 'm', skin: 'fair', hair: null, ...opts };

  function build() {
    parts.length = 0;
    const skin = srgb(SKIN[cfg.skin] || cfg.skin || SKIN.fair);
    const hair = srgb(cfg.hair || HAIR[cfg.gender === 'f' ? 'f' : 'm']);
    const c = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, srgb(v)]));
    const part = (name, fn, frame = 'static') => { const b = new Builder(); fn(b); parts.push({ name, b, frame }); };
    const ell = (b, x, y, z, rx, ry, rz, col, rm, ws = 12, hs = 8, rot = [0, 0, 0]) =>
      b.addGeo(new THREE.SphereGeometry(1, n(ws), n(hs)), M(x, y, z, rx, ry, rz, ...rot), rm, col);
    const cyl = (b, x, y, z, r0, r1, h, col, rm, rot = [0, 0, 0], sides = 10) =>
      b.addGeo(new THREE.CylinderGeometry(r0, r1, h, n(sides)), M(x, y, z, 1, 1, 1, ...rot), rm, col);
    const tube = (b, pts, r, col, rm, sides = 8) => b.loft(sweepRings(pts, circle(n(sides), r)), { color: col, capStart: true, capEnd: true, uv: () => rm, capUV: () => rm });

    // ---- torso: superellipse loft, navy tunic ----
    const T = [[0.98, 0.16, 0.12, 2.68], [1.08, 0.165, 0.115, 2.67], [1.2, 0.155, 0.105, 2.655], [1.32, 0.17, 0.11, 2.64], [1.42, 0.195, 0.105, 2.625], [1.48, 0.185, 0.085, 2.62], [1.52, 0.11, 0.06, 2.625]];
    const torsoAt = (y) => { let i = 0; while (i < T.length - 2 && y > T[i + 1][0]) i++; const a = T[i], b2 = T[i + 1], t = Math.min(1, Math.max(0, (y - a[0]) / (b2[0] - a[0]))); return [lerp(a[1], b2[1], t), lerp(a[2], b2[2], t), lerp(a[3], b2[3], t)]; };
    part('torso', (b) => {
      const N = n(16);
      const R = T.map(([y, wx, dz, s]) => circle(N, 1).map(([cx, cy]) => {
        const ex = Math.sign(cx) * Math.abs(cx) ** 0.75, ez = Math.sign(cy) * Math.abs(cy) ** 0.8;
        return [XP + ex * wx, y, s + ez * dz];
      }));
      b.loft(R, { color: (p) => (p[1] < 1.03 ? c.jacketDark : c.jacket), capStart: true, capEnd: true, uv: () => RM.cloth, capUV: () => RM.cloth });
      // sash from left shoulder to right hip
      const ring = (off) => {
        const r = [];
        const K = n(20);
        for (let k = 0; k < K; k++) {
          const a = (k / K) * Math.PI * 2;
          let y = 1.26;
          for (let it = 0; it < 4; it++) { const [wx] = torsoAt(y); y = 1.25 + off + 1.1 * Math.sin(a) * wx * -1; }
          const [wx, dz, s] = torsoAt(y);
          const sn = Math.sin(a), cs = Math.cos(a);
          r.push([XP + Math.sign(sn) * Math.abs(sn) ** 0.75 * wx * 1.05, y, s + Math.sign(cs) * Math.abs(cs) ** 0.8 * dz * 1.07]);
        }
        return r;
      };
      b.loft([ring(-0.04), ring(0.04)], { color: c.sash, uv: () => RM.velvet });
      // medals, epaulettes, buttons
      if (high) for (const [dx, col] of [[0.06, c.gold], [0.09, c.gold]]) cyl(b, XP + dx, 1.36, 2.522, 0.014, 0.014, 0.006, col, RM.gold, [Math.PI / 2, 0, 0], 10);
      for (const sg of [-1, 1]) ell(b, XP + sg * 0.165, 1.485, 2.625, 0.045, 0.012, 0.05, c.gold, RM.gold, 10, 5);
      if (high) for (let i = 0; i < 3; i++) ell(b, XP - 0.03, 1.13 + i * 0.07, 2.552, 0.008, 0.008, 0.005, c.gold, RM.gold, 6, 4);
      // scarf: collar wrap + a tail down the front
      b.addGeo(new THREE.TorusGeometry(0.06, 0.028, n(6), n(14)), M(XP, 1.53, 2.625, 1, 1, 1, Math.PI / 2 + 0.15, 0, 0), RM.cloth, c.scarf);
      tube(b, [[XP + 0.03, 1.52, 2.57], [XP + 0.05, 1.45, 2.53], [XP + 0.06, 1.35, 2.525], [XP + 0.05, 1.27, 2.53]], 0.025, c.scarf, RM.cloth, 6);
      cyl(b, XP, 1.55, 2.63, 0.045, 0.05, 0.08, skin, RM.skin, [0, 0, 0], 10);
    });
    // ---- legs + boots (left seat, feet on the pedals) ----
    part('legs', (b) => {
      for (const sg of [-1, 1]) {
        const x = XP + sg * 0.09;
        tube(b, [[x, 1.04, 2.68], [x + sg * 0.005, 1.08, 2.4], [x + sg * 0.01, 1.1, 2.2]], 0.07, c.trousers, RM.cloth, 10);
        ell(b, x + sg * 0.01, 1.1, 2.2, 0.062, 0.062, 0.062, c.trousers, RM.cloth, 10, 6);
        tube(b, [[x + sg * 0.01, 1.08, 2.19], [x, 0.98, 2.06], [x, 0.88, 1.94]], 0.05, c.boot, RM.leather, 10);
        ell(b, x, 0.88, 1.89, 0.045, 0.045, 0.11, c.boot, RM.leather, 10, 6, [-0.55, 0, 0]);
      }
    });
    // ---- head (pivot at the top of the neck) ----
    const f = cfg.gender === 'f';
    part('head', (b) => {
      ell(b, 0, 0.09, -0.015, 0.082, 0.105, 0.098, skin, RM.skin, 16, 12);
      ell(b, 0, 0.055, -0.11, 0.014, 0.022, 0.02, skin, RM.skin, 8, 6);
      ell(b, 0, 0.012, -0.05, 0.055, 0.04, 0.052, skin, RM.skin, 10, 6);
      if (high) for (const sg of [-1, 1]) ell(b, sg * 0.045, 0.04, -0.075, 0.025, 0.02, 0.02, skin.map((v, i) => Math.min(1, v * [1.06, 0.9, 0.9][i])), RM.skin, 6, 4);
      // hair: back of the head; longer and fuller for 'f'
      // hair: an offset shell, so the face pokes out in front of it (hairline for free)
      if (f) ell(b, 0, 0.09, 0.006, 0.095, 0.132, 0.104, hair, RM.cloth, 14, 10);
      else ell(b, 0, 0.118, -0.002, 0.086, 0.098, 0.098, hair, RM.cloth, 14, 10);
      if (f) {
        for (const sg of [-1, 1]) ell(b, sg * 0.075, 0.02, -0.0, 0.03, 0.07, 0.06, hair, RM.cloth, 8, 6);
        ell(b, 0, 0.012, -0.093, 0.022, 0.008, 0.008, c.lip, RM.skin, 8, 4);
        ell(b, 0, 0.04, 0.1, 0.045, 0.04, 0.035, hair, RM.cloth, 8, 6);
      } else {
        // handlebar moustache
        for (const sg of [-1, 1]) tube(b, [[0, 0.028, -0.104], [sg * 0.03, 0.024, -0.1], [sg * 0.055, 0.03, -0.09], [sg * 0.063, 0.045, -0.085]], 0.009, hair, RM.cloth, 6);
      }
      // aviator sunglasses
      for (const sg of [-1, 1]) {
        const lm = M(sg * 0.033, 0.07, -0.105, 1, 1, 1, 0.1, sg * 0.3, sg * 0.12);
        b.addGeo(new THREE.SphereGeometry(1, n(10), n(6)), lm.clone().multiply(M(0, -0.002, 0, 0.025, 0.019, 0.006)), RM.lens, srgb('#1d2733'));
        if (high) b.addGeo(new THREE.TorusGeometry(1, 0.1, 4, n(14)), lm.clone().multiply(M(0, -0.002, -0.002, 0.026, 0.02, 0.02)), RM.gold, c.gold);
        b.addGeo(new THREE.BoxGeometry(0.03, 0.007, 0.008), M(sg * 0.035, 0.1, -0.1, 1, 1, 1, 0, sg * 0.3, -sg * 0.12), RM.cloth, hair);
        b.addGeo(new THREE.BoxGeometry(0.004, 0.004, 0.09), M(sg * 0.077, 0.08, -0.055, 1, 1, 1, 0, -sg * 0.18, 0), RM.chrome, c.gold);
      }
      b.addGeo(new THREE.BoxGeometry(0.02, 0.004, 0.004), M(0, 0.088, -0.109), RM.chrome, c.gold);
      // headset: cups, band, boom mic
      for (const sg of [-1, 1]) {
        cyl(b, sg * 0.088, 0.075, 0.0, 0.042, 0.042, 0.04, c.headset, RM.plastic, [0, 0, Math.PI / 2], 14);
        cyl(b, sg * 0.068, 0.075, 0.0, 0.04, 0.04, 0.012, c.black, RM.cloth, [0, 0, Math.PI / 2], 14);
      }
      b.addGeo(new THREE.TorusGeometry(0.1, 0.009, n(5), n(14), Math.PI), M(0, 0.085, 0.0, 1, 1.25, 1), RM.plastic, c.black);
      tube(b, [[-0.095, 0.06, -0.02], [-0.085, 0.02, -0.07], [-0.045, 0.0, -0.105], [-0.02, 0.005, -0.11]], 0.0045, c.black, RM.plastic, 5);
      ell(b, -0.02, 0.006, -0.112, 0.012, 0.012, 0.012, c.black, RM.velvet, 8, 6);
      // crown, worn at a jaunty angle over the headset
      const crown = (b2, mat) => {
        b2.addGeo(new THREE.CylinderGeometry(0.05, 0.046, 0.032, n(16), 1, true), mat(0, 0, 0), RM.gold, c.gold);
        b2.addGeo(new THREE.SphereGeometry(0.047, n(12), n(6), 0, Math.PI * 2, 0, Math.PI / 2), mat(0, 0.0, 0, 1, 0.8, 1), RM.velvet, c.velvet);
        const K = 5;
        for (let i = 0; i < K; i++) {
          const a = (i / K) * Math.PI * 2;
          b2.addGeo(new THREE.ConeGeometry(0.011, 0.034, n(6)), mat(Math.sin(a) * 0.048, 0.032, Math.cos(a) * 0.048), RM.gold, c.gold);
          if (high) b2.addGeo(new THREE.SphereGeometry(0.0055, 6, 4), mat(Math.sin(a) * 0.048, 0.052, Math.cos(a) * 0.048), RM.gold, c.gold);
        }
        b2.addGeo(new THREE.SphereGeometry(0.009, 8, 6), mat(0, 0.0, -0.051), RM.lens, c.ruby);
        if (!high) return;
        b2.addGeo(new THREE.SphereGeometry(0.007, 8, 6), mat(0.036, 0.0, -0.036), RM.lens, c.sapphire);
        b2.addGeo(new THREE.SphereGeometry(0.007, 8, 6), mat(-0.036, 0.0, -0.036), RM.lens, c.sapphire);
      };
      const base = M(0.012, 0.215, -0.01, 1, 1, 1, -0.08, 0, -0.16);
      crown(b, (x, y, z, sx = 1, sy = 1, sz = 1) => base.clone().multiply(M(x, y, z, sx, sy, sz)));
    }, 'head');

    // ---- arms: unit tubes along +Y, posed by IK each frame ----
    const armTube = (b, r0, r1, cuff) => {
      const N = n(9), R = [];
      const rows = cuff ? [[0, r0, c.jacket], [0.7, r1, c.jacket], [0.74, r1 * 1.18, c.glove], [1, r1 * 1.05, c.glove]] : [[0, r0, c.jacket], [1, r1, c.jacket]];
      const cols = [];
      for (const [y, r, col] of rows) { R.push(circle(N, r).map(([x, z]) => [x, y, z])); cols.push(col); }
      b.loft(R, { color: (p, i) => cols[Math.max(0, i)] || cols[cols.length - 1], capStart: true, capEnd: true, uv: () => RM.cloth, capUV: () => RM.cloth });
    };
    for (const side of ['L', 'R']) {
      part('upper' + side, (b) => { armTube(b, 0.05, 0.042, false); ell(b, 0, 0, 0, 0.055, 0.055, 0.055, c.jacket, RM.cloth, 8, 6); }, 'upper' + side);
      part('fore' + side, (b) => { armTube(b, 0.043, 0.036, true); ell(b, 0, 0, 0, 0.044, 0.044, 0.044, c.jacket, RM.cloth, 8, 6); }, 'fore' + side);
      // fist around the yoke horn grip (yoke-local frame)
      const sg = side === 'L' ? -1 : 1;
      part('glove' + side, (b) => {
        ell(b, sg * 0.14, 0.05, 0.285, 0.036, 0.05, 0.04, c.glove, RM.leather, 10, 8, [0.15, 0, sg * -0.2]);
        ell(b, sg * 0.122, 0.09, 0.27, 0.015, 0.03, 0.015, c.glove, RM.leather, 8, 6, [0.5, 0, sg * 0.5]);
        ell(b, sg * 0.15, 0.025, 0.31, 0.03, 0.036, 0.03, c.glove, RM.leather, 8, 6);
      }, 'yoke');
    }

    if (high && cfg.passenger !== false) {
      // royal corgi on two velvet cushions
      part('corgiBody', (b) => {
        for (const [y, sc] of [[1.025, 1], [1.105, 0.88]]) {
          ell(b, XC, y + CDY, CS + 0.02, 0.19 * sc, 0.045, 0.2 * sc, c.cushion, RM.velvet, 14, 6);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ell(b, XC + dx * 0.16 * sc, y + CDY, CS + 0.02 + dz * 0.17 * sc, 0.012, 0.022, 0.012, c.tassel, RM.gold, 6, 4);
        }
        ell(b, XC, 1.22 + CDY, CS + 0.08, 0.1, 0.075, 0.12, c.corgi, RM.cloth, 12, 8);
        ell(b, XC, 1.33 + CDY, CS + 0.02, 0.085, 0.13, 0.085, c.corgi, RM.cloth, 12, 8, [-0.25, 0, 0]);
        ell(b, XC, 1.33 + CDY, CS - 0.045, 0.06, 0.1, 0.04, c.corgiWhite, RM.cloth, 10, 6, [-0.2, 0, 0]);
        for (const sg of [-1, 1]) {
          tube(b, [[XC + sg * 0.04, 1.29 + CDY, CS - 0.04], [XC + sg * 0.042, 1.17 + CDY, CS - 0.06]], 0.024, c.corgiWhite, RM.cloth, 6);
          ell(b, XC + sg * 0.042, 1.165 + CDY, CS - 0.08, 0.026, 0.016, 0.034, c.corgiWhite, RM.cloth, 6, 4);
        }
        ell(b, XC + 0.08, 1.19 + CDY, CS + 0.17, 0.03, 0.025, 0.05, c.corgi, RM.cloth, 6, 4);
      });
      part('corgiHead', (b) => {
        ell(b, 0, 0.05, -0.01, 0.075, 0.068, 0.078, c.corgi, RM.cloth, 12, 8);
        ell(b, 0, 0.022, -0.08, 0.036, 0.03, 0.058, c.corgiWhite, RM.cloth, 10, 6);
        ell(b, 0, 0.075, -0.06, 0.016, 0.03, 0.03, c.corgiWhite, RM.cloth, 6, 4);
        ell(b, 0, 0.038, -0.137, 0.014, 0.011, 0.01, c.nose, RM.lens, 6, 4);
        ell(b, 0, -0.005, -0.1, 0.014, 0.004, 0.022, c.pink, RM.skin, 6, 4);
        for (const sg of [-1, 1]) {
          b.addGeo(new THREE.ConeGeometry(0.036, 0.09, n(6)), M(sg * 0.048, 0.13, 0.0, 1, 1, 0.45, 0, 0, -sg * 0.32), RM.cloth, c.corgi);
          b.addGeo(new THREE.ConeGeometry(0.024, 0.06, n(5)), M(sg * 0.046, 0.122, -0.008, 1, 1, 0.3, 0, 0, -sg * 0.32), RM.skin, c.pink);
          ell(b, sg * 0.03, 0.068, -0.068, 0.009, 0.009, 0.006, c.nose, RM.lens, 6, 4);
          // goggles pushed up on the forehead
          cyl(b, sg * 0.03, 0.105, -0.05, 0.019, 0.019, 0.016, c.gold, RM.gold, [Math.PI / 2 - 0.6, 0, 0], 10);
          cyl(b, sg * 0.03, 0.106, -0.059, 0.015, 0.015, 0.004, c.lens, RM.lens, [Math.PI / 2 - 0.6, 0, 0], 10);
        }
        b.addGeo(new THREE.TorusGeometry(0.073, 0.006, 4, n(16)), M(0, 0.09, -0.01, 1, 1, 1, Math.PI / 2 + 0.35, 0, 0), RM.leather, c.boot);
      }, 'corgiHead');
    }
  }

  // ---- assemble the dynamic mesh ----
  let mesh = null, base = null, ranges = null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  mat.customProgramCacheKey = () => 'krayzee-pilot';

  function assemble() {
    build();
    const all = new Builder();
    ranges = {};
    for (const p of parts) {
      const start = all.count;
      all.append(p.b);
      ranges[p.name] = { start, count: all.count - start, frame: p.frame };
    }
    const geo = all.build();
    geo.setAttribute('rm', geo.attributes.uv);
    geo.deleteAttribute('uv');
    base = { pos: geo.attributes.position.array.slice(), nrm: geo.attributes.normal.array.slice() };
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 2.4), 1.2);
    if (!mesh) {
      mesh = new THREE.Mesh(geo, mat); mesh.name = 'pilot'; mesh.castShadow = high; mesh.receiveShadow = true;
      if (!high) Object.defineProperty(mesh, 'castShadow', { get: () => false, set() {} });
    }
    else { mesh.geometry.dispose(); mesh.geometry = geo; }
    for (const k in ranges) ranges[k].dirty = true;
  }

  const nm = new THREE.Matrix3();
  const mats = {};
  function pose(name, m) {
    const r = ranges[name];
    if (!r) return;
    const pos = mesh.geometry.attributes.position.array, nr = mesh.geometry.attributes.normal.array;
    const e = m.elements;
    nm.getNormalMatrix(m);
    const ne = nm.elements;
    for (let i = r.start * 3, end = (r.start + r.count) * 3; i < end; i += 3) {
      const x = base.pos[i], y = base.pos[i + 1], z = base.pos[i + 2];
      pos[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = base.nrm[i], b = base.nrm[i + 1], c = base.nrm[i + 2];
      const nx = ne[0] * a + ne[3] * b + ne[6] * c, ny = ne[1] * a + ne[4] * b + ne[7] * c, nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      nr[i] = nx / l; nr[i + 1] = ny / l; nr[i + 2] = nz / l;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
  }

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), ID = new THREE.Matrix4();
  const HEAD = new THREE.Vector3(XP, 1.575, 2.625), CHEAD = new THREE.Vector3(XC, 1.43 + CDY, CS);
  const SH = { L: new THREE.Vector3(XP - 0.185, 1.45, 2.61), R: new THREE.Vector3(XP + 0.185, 1.45, 2.61) };
  const WRIST = { L: new THREE.Vector3(-0.15, 0.02, 0.335), R: new THREE.Vector3(0.15, 0.02, 0.335) };
  const L1 = 0.33, L2 = 0.31;
  const st = { yaw: 0, pitch: 0, cyaw: 0, t: 0, hideBody: false, visible: true, staticDone: false };
  const segM = (a, b) => {
    _v.subVectors(b, a); const len = _v.length();
    _q.setFromUnitVectors(UPY, _v.divideScalar(len));
    return _m.compose(a, _q, _s.set(1, len, 1));
  };
  const _w = new THREE.Vector3(), _el = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();

  function update(dt, cur, yoke) {
    if (!mesh || !st.visible) return;
    st.t += dt;
    const t = st.t;
    const k = 1 - Math.exp(-dt * 3);
    const wantYaw = -(cur.rudder * 0.28 + cur.aileron * 0.32) + 0.1 * Math.sin(t * 0.23) + 0.06 * Math.sin(t * 0.71);
    st.yaw += (wantYaw - st.yaw) * k;
    st.pitch += (-cur.elevator * 0.08 + 0.03 * Math.sin(t * 0.4) - st.pitch) * k;
    if (!st.staticDone) {
      for (const [name, r] of Object.entries(ranges)) if (r.frame === 'static') pose(name, name === 'torso' && st.hideBody ? ZERO : ID);
      st.staticDone = true;
    }
    pose('head', st.hideBody ? ZERO : _m.compose(HEAD, _q.setFromEuler(_e.set(st.pitch, st.yaw, 0, 'YXZ')), _s.set(1, 1, 1)));
    if (ranges.corgiHead) {
      const cy = 0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 1.13 + 1) - cur.aileron * 0.4;
      st.cyaw += (cy - st.cyaw) * k;
      pose('corgiHead', _m.compose(CHEAD, _q.setFromEuler(_e.set(0.1 * Math.sin(t * 0.9), st.cyaw, 0.08 * Math.sin(t * 0.6), 'YXZ')), _s.set(1, 1, 1)));
    }
    yoke.updateMatrix();
    for (const side of ['L', 'R']) {
      pose('glove' + side, yoke.matrix);
      const S = SH[side];
      _w.copy(WRIST[side]).applyMatrix4(yoke.matrix);
      _d.subVectors(_w, S);
      let d = _d.length();
      const reach = (L1 + L2) * 0.985;
      const sc = d > reach ? d / reach : 1;
      const l1 = L1 * sc, l2 = L2 * sc;
      d = Math.min(d, (l1 + l2) * 0.985);
      _d.normalize();
      const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      _p.set(side === 'L' ? -0.7 : 0.5, -1, 0.35).addScaledVector(_d, -_p.dot(_d)).normalize();
      _el.copy(S).addScaledVector(_d, a).addScaledVector(_p, h);
      pose('upper' + side, segM(S, _el));
      pose('fore' + side, segM(_el, _w));
    }
  }

  assemble();
  return {
    get mesh() { return mesh; },
    update,
    setHideBody(v) { if (st.hideBody !== !!v) { st.hideBody = !!v; st.staticDone = false; } },
    setVisible(v) { st.visible = !!v; mesh.visible = !!v; },
    setConfig(o = {}) { cfg = { ...cfg, ...o }; assemble(); st.staticDone = false; },
    get config() { return { ...cfg }; },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
