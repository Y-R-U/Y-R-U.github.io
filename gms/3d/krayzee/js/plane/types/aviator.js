import * as THREE from 'three';
import { Builder, srgb, sweepRings, circle, lerp } from '../geom.js';
import { pbrMaterial, RM, M4 } from './kit.js';

// Seated royal for open cockpits / the bathtub. One dynamic mesh, parts re-posed on the CPU (head look, arm IK,
// a streaming scarf, passenger heads). Built in the cockpit (build) frame: x right, y up, z = station (aft).
// seat = { x, y, s } is the hip centre; grips come from ctx: right hand -> ctx.stick (Object3D, grip at gripLocal),
// left hand -> leftHand(cur, ctx) -> [x, y, s].

const SKIN = { light: '#ecc4a2', fair: '#e2b48f', tan: '#c68e62', brown: '#8d5a3b', dark: '#5e3a26' };
const HAIR = { m: '#4a3222', f: '#4e2414' };
const C = {
  coat: '#4b2e1c', coatDark: '#3a2315', fleece: '#e9dcc4', sash: '#b3202e', gold: '#d9ad3c', scarf: '#5b2a86', silk: '#f5f1e8',
  helmet: '#5b3820', helmetDark: '#3c2414', strap: '#2e1c10', brass: '#c49a4a', lens: '#2a3a46', glove: '#6b4428',
  breeches: '#d9cdb2', boot: '#2b1a10', velvet: '#8c1020', ruby: '#c3102a', sapphire: '#1f45c9', lip: '#b02a3a',
  stripeA: '#b5192b', stripeB: '#f4efe6', cap: '#f2a7bf', capDark: '#d9809c',
  corgi: '#c9762e', corgiWhite: '#f2ece2', pink: '#e38d96', nose: '#111111', cushion: '#6d1426',
  duck: '#ffd21f', duckShade: '#f0b400', beak: '#ff7a10', eye: '#111111', duckCap: '#5b3820',
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const UPY = new THREE.Vector3(0, 1, 0);

export function createAviator({ quality, cfg: cfg0 = {}, seat, outfit = 'flyer', gripLocal = [0, 0.3, 0], leftHand, legs = true, passengers = [], crownTilt = -0.16, elbowOut = 0.8 }) {
  const high = quality !== 'low';
  const seg = high ? 1 : 0.55;
  const n = (k) => Math.max(4, Math.round(k * seg));
  const parts = [];
  let cfg = { gender: 'm', skin: 'fair', hair: null, ...cfg0 };
  const X = seat.x, Y = seat.y, S = seat.s;
  const HEAD = new THREE.Vector3(X, Y + 0.62, S + 0.03);
  const SH = { L: new THREE.Vector3(X - 0.185, Y + 0.5, S + 0.02), R: new THREE.Vector3(X + 0.185, Y + 0.5, S + 0.02) };
  const L1 = 0.31, L2 = 0.3;
  const scarf = { segs: high ? 14 : 8, w: 0.075, len: 0.78 };

  function build() {
    parts.length = 0;
    const skin = srgb(SKIN[cfg.skin] || cfg.skin || SKIN.fair);
    const hair = srgb(cfg.hair || HAIR[cfg.gender === 'f' ? 'f' : 'm']);
    const c = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, srgb(v)]));
    const part = (name, fn, frame = 'static') => { const b = new Builder(); fn(b); parts.push({ name, b, frame }); };
    const ell = (b, x, y, z, rx, ry, rz, col, rm, ws = 12, hs = 8, rot = [0, 0, 0]) =>
      b.addGeo(new THREE.SphereGeometry(1, n(ws), n(hs)), M4(x, y, z, rx, ry, rz, ...rot), rm, col);
    const cyl = (b, x, y, z, r0, r1, h, col, rm, rot = [0, 0, 0], sides = 10) =>
      b.addGeo(new THREE.CylinderGeometry(r0, r1, h, n(sides)), M4(x, y, z, 1, 1, 1, ...rot), rm, col);
    const tube = (b, pts, r, col, rm, sides = 8) => b.loft(sweepRings(pts, circle(n(sides), r)), { color: col, capStart: true, capEnd: true, uv: () => rm, capUV: () => rm });
    const bather = outfit === 'bather';

    // ---- torso (superellipse loft) ----
    const T = [[-0.04, 0.16, 0.12, 0.05], [0.06, 0.165, 0.115, 0.04], [0.18, 0.155, 0.105, 0.025], [0.3, 0.17, 0.11, 0.01], [0.4, 0.195, 0.105, 0.0], [0.46, 0.185, 0.085, 0.0], [0.5, 0.11, 0.06, 0.0]];
    part('torso', (b) => {
      const N = n(16);
      const R = T.map(([y, wx, dz, ds]) => circle(N, 1).map(([cx, cy]) => {
        const ex = Math.sign(cx) * Math.abs(cx) ** 0.75, ez = Math.sign(cy) * Math.abs(cy) ** 0.8;
        return [X + ex * wx, Y + y, S + ds + ez * dz];
      }));
      const stripe = (p) => (Math.floor((p[1] - Y) / 0.055) % 2 ? c.stripeA : c.stripeB);
      b.loft(R, { color: bather ? stripe : (p) => (p[1] < Y + 0.02 ? c.coatDark : c.coat), capStart: true, capEnd: true, uv: () => (bather ? RM.cloth : RM.leather), capUV: () => RM.cloth });
      if (!bather) {
        // royal sash, shoulder to hip
        const ring = (off) => {
          const r = [], K = n(20);
          for (let k = 0; k < K; k++) {
            const a = (k / K) * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
            const y = 0.23 + off - 0.95 * sn * 0.17;
            let i = 0; while (i < T.length - 2 && y > T[i + 1][0]) i++;
            const A = T[i], B2 = T[i + 1], t = Math.min(1, Math.max(0, (y - A[0]) / (B2[0] - A[0])));
            const wx = lerp(A[1], B2[1], t), dz = lerp(A[2], B2[2], t), ds = lerp(A[3], B2[3], t);
            r.push([X + Math.sign(sn) * Math.abs(sn) ** 0.75 * wx * 1.06, Y + y, S + ds + Math.sign(cs) * Math.abs(cs) ** 0.8 * dz * 1.08]);
          }
          return r;
        };
        b.loft([ring(-0.035), ring(0.035)], { color: c.sash, uv: () => RM.cloth });
        for (const sg of [-1, 1]) ell(b, X + sg * 0.165, Y + 0.465, S + 0.02, 0.046, 0.013, 0.05, c.gold, RM.gold, 10, 5);
        // sheepskin collar
        b.addGeo(new THREE.TorusGeometry(0.095, 0.026, n(7), n(16)), M4(X, Y + 0.495, S + 0.02, 1.05, 1, 0.85, Math.PI / 2 + 0.12, 0, 0), RM.cloth, c.fleece);
        if (high) for (let i = 0; i < 3; i++) ell(b, X + 0.035, Y + 0.12 + i * 0.08, S - 0.112, 0.012, 0.012, 0.006, c.gold, RM.gold, 6, 4);
        // scarf wrap at the throat
        b.addGeo(new THREE.TorusGeometry(0.062, 0.026, n(6), n(14)), M4(X, Y + 0.52, S + 0.015, 1, 1, 1, Math.PI / 2 + 0.15, 0, 0), RM.cloth, c.scarf);
        tube(b, [[X + 0.03, Y + 0.51, S - 0.04], [X + 0.05, Y + 0.44, S - 0.085], [X + 0.055, Y + 0.36, S - 0.1]], 0.024, c.scarf, RM.cloth, 6);
      } else {
        for (const sg of [-1, 1]) tube(b, [[X + sg * 0.1, Y + 0.44, S - 0.07], [X + sg * 0.12, Y + 0.5, S + 0.0], [X + sg * 0.1, Y + 0.44, S + 0.08]], 0.02, c.stripeA, RM.cloth, 6);
        // bare shoulders + chest top
        ell(b, X, Y + 0.47, S + 0.01, 0.17, 0.06, 0.09, skin, RM.leather, 14, 8);
      }
      cyl(b, X, Y + 0.54, S + 0.02, 0.045, 0.05, 0.08, skin, RM.leather, [0, 0, 0], 10);
    });

    if (legs) part('legs', (b) => {
      for (const sg of [-1, 1]) {
        const x = X + sg * 0.09;
        tube(b, [[x, Y + 0.0, S + 0.02], [x + sg * 0.005, Y + 0.05, S - 0.25], [x + sg * 0.01, Y + 0.07, S - 0.45]], 0.068, bather ? skin : c.breeches, RM.cloth, 10);
        ell(b, x + sg * 0.01, Y + 0.07, S - 0.45, 0.06, 0.06, 0.06, bather ? skin : c.breeches, RM.cloth, 10, 6);
        tube(b, [[x + sg * 0.01, Y + 0.05, S - 0.46], [x, Y - 0.08, S - 0.62], [x, Y - 0.2, S - 0.76]], 0.05, bather ? skin : c.boot, RM.leather, 10);
        ell(b, x, Y - 0.2, S - 0.8, 0.045, 0.045, 0.11, bather ? skin : c.boot, RM.leather, 10, 6, [-0.5, 0, 0]);
      }
    });

    // ---- head (pivot at the top of the neck) ----
    const f = cfg.gender === 'f';
    part('head', (b) => {
      ell(b, 0, 0.09, -0.015, 0.082, 0.105, 0.098, skin, RM.leather, 16, 12);
      ell(b, 0, 0.055, -0.11, 0.014, 0.022, 0.02, skin, RM.leather, 8, 6);
      ell(b, 0, 0.012, -0.05, 0.055, 0.04, 0.052, skin, RM.leather, 10, 6);
      if (high) for (const sg of [-1, 1]) ell(b, sg * 0.045, 0.04, -0.075, 0.025, 0.02, 0.02, skin.map((v, i) => Math.min(1, v * [1.06, 0.9, 0.9][i])), RM.leather, 6, 4);
      if (f) ell(b, 0, 0.012, -0.093, 0.022, 0.008, 0.008, c.lip, RM.leather, 8, 4);
      else for (const sg of [-1, 1]) tube(b, [[0, 0.028, -0.104], [sg * 0.03, 0.024, -0.1], [sg * 0.055, 0.03, -0.09], [sg * 0.063, 0.045, -0.085]], 0.009, hair, RM.cloth, 6);
      let crownY = 0.205;
      if (!bather) {
        // leather helmet: an offset shell so the face shows, ear flaps, chin strap, brow roll
        ell(b, 0, 0.112, 0.006, 0.093, 0.104, 0.104, c.helmet, RM.leatherWorn, 16, 12);
        b.addGeo(new THREE.TorusGeometry(0.084, 0.012, n(6), n(18), Math.PI * 1.15), M4(0, 0.118, -0.016, 1.04, 1, 1.08, Math.PI / 2 + 0.25, 0, Math.PI * 0.925), RM.leatherWorn, c.helmetDark);
        for (const sg of [-1, 1]) {
          ell(b, sg * 0.084, 0.05, 0.005, 0.022, 0.06, 0.05, c.helmet, RM.leatherWorn, 10, 8);
          cyl(b, sg * 0.1, 0.06, 0.005, 0.024, 0.024, 0.014, c.helmetDark, RM.leatherWorn, [0, 0, Math.PI / 2], 12);
        }
        b.addGeo(new THREE.TorusGeometry(0.075, 0.006, 4, n(14), Math.PI), M4(0, 0.03, -0.025, 1.1, 1, 1, 0.35, 0, Math.PI), RM.leather, c.strap);
        if (f) { ell(b, 0, 0.0, 0.085, 0.06, 0.06, 0.04, hair, RM.cloth, 8, 6); for (const sg of [-1, 1]) ell(b, sg * 0.07, -0.01, 0.05, 0.028, 0.06, 0.035, hair, RM.cloth, 8, 6); }
        // goggles over the eyes: brass rims, glass, strap round the helmet
        for (const sg of [-1, 1]) {
          const gm = M4(sg * 0.034, 0.072, -0.1, 1, 1, 1, Math.PI / 2 + 0.12, 0, 0).multiply(M4(0, 0, 0, 1, 1, 1, 0, 0, 0));
          b.addGeo(new THREE.CylinderGeometry(0.027, 0.03, 0.02, n(14)), gm, RM.brass, c.brass);
          b.addGeo(new THREE.SphereGeometry(1, n(12), n(6), 0, Math.PI * 2, 0, Math.PI / 2), M4(sg * 0.034, 0.073, -0.111, 0.024, 0.009, 0.024, -Math.PI / 2 + 0.12, 0, 0), RM.glass, c.lens);
        }
        b.addGeo(new THREE.BoxGeometry(0.018, 0.01, 0.012), M4(0, 0.074, -0.108), RM.brass, c.brass);
        b.addGeo(new THREE.TorusGeometry(0.097, 0.007, 4, n(18)), M4(0, 0.08, 0.004, 1, 1, 1.07, Math.PI / 2 - 0.12, 0, 0), RM.leather, c.strap);
        crownY = 0.222;
      } else {
        // frilly shower cap, gold swimming goggles pushed up
        ell(b, 0, 0.13, 0.0, 0.1, 0.085, 0.108, c.cap, RM.cloth, 14, 10);
        b.addGeo(new THREE.TorusGeometry(0.096, 0.016, n(6), n(22)), M4(0, 0.1, 0.005, 1, 1, 1.07, Math.PI / 2 - 0.1, 0, 0), RM.cloth, c.capDark);
        if (high) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ell(b, Math.sin(a) * 0.104, 0.098 + Math.cos(a) * 0.006, 0.005 + Math.cos(a) * 0.112, 0.016, 0.012, 0.016, c.cap, RM.cloth, 6, 4); }
        for (const sg of [-1, 1]) b.addGeo(new THREE.TorusGeometry(0.02, 0.005, 4, n(12)), M4(sg * 0.03, 0.158, -0.088, 1, 1, 1, -0.9, 0, 0), RM.gold, c.gold);
        crownY = 0.218;
      }
      const crown = (b2, mat) => {
        b2.addGeo(new THREE.CylinderGeometry(0.05, 0.046, 0.032, n(16), 1, true), mat(0, 0, 0), RM.gold, c.gold);
        b2.addGeo(new THREE.SphereGeometry(0.047, n(12), n(6), 0, Math.PI * 2, 0, Math.PI / 2), mat(0, 0.0, 0, 1, 0.8, 1), RM.cloth, c.velvet);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          b2.addGeo(new THREE.ConeGeometry(0.011, 0.034, n(6)), mat(Math.sin(a) * 0.048, 0.032, Math.cos(a) * 0.048), RM.gold, c.gold);
          if (high) b2.addGeo(new THREE.SphereGeometry(0.0055, 6, 4), mat(Math.sin(a) * 0.048, 0.052, Math.cos(a) * 0.048), RM.gold, c.gold);
        }
        b2.addGeo(new THREE.SphereGeometry(0.009, 8, 6), mat(0, 0.0, -0.051), RM.glass, c.ruby);
        if (!high) return;
        b2.addGeo(new THREE.SphereGeometry(0.007, 8, 6), mat(0.036, 0.0, -0.036), RM.glass, c.sapphire);
        b2.addGeo(new THREE.SphereGeometry(0.007, 8, 6), mat(-0.036, 0.0, -0.036), RM.glass, c.sapphire);
      };
      const base = M4(0.012, crownY, -0.0, 1, 1, 1, -0.06, 0, crownTilt);
      crown(b, (x, y, z, sx = 1, sy = 1, sz = 1) => base.clone().multiply(M4(x, y, z, sx, sy, sz)));
    }, 'head');

    // ---- arms ----
    const armTube = (b, r0, r1, cuff) => {
      const N = n(9), R = [], cols = [];
      const sleeve = bather ? skin : c.coat, cuffC = bather ? skin : c.glove;
      const rows = cuff ? [[0, r0, sleeve], [0.72, r1, sleeve], [0.76, r1 * 1.2, cuffC], [1, r1 * 1.05, cuffC]] : [[0, r0, bather ? c.stripeA : sleeve], [bather ? 0.3 : 1, r1, bather ? skin : sleeve], ...(bather ? [[1, r1, skin]] : [])];
      for (const [y, r, col] of rows) { R.push(circle(N, r).map(([x, z]) => [x, y, z])); cols.push(col); }
      b.loft(R, { color: (p, i) => cols[Math.max(0, i)] || cols[cols.length - 1], capStart: true, capEnd: true, uv: () => RM.leather, capUV: () => RM.leather });
    };
    for (const side of ['L', 'R']) {
      part('upper' + side, (b) => { armTube(b, bather ? 0.042 : 0.052, bather ? 0.036 : 0.044, false); ell(b, 0, 0, 0, 0.055, 0.055, 0.055, bather ? c.stripeA : c.coat, RM.cloth, 8, 6); }, 'upper' + side);
      part('fore' + side, (b) => { armTube(b, bather ? 0.035 : 0.045, bather ? 0.03 : 0.037, true); ell(b, 0, 0, 0, 0.044, 0.044, 0.044, bather ? skin : c.coat, RM.cloth, 8, 6); }, 'fore' + side);
      // fist: local +Y along the forearm, origin at the knuckles
      part('hand' + side, (b) => {
        const g = bather ? skin : c.glove;
        ell(b, 0, -0.035, 0, 0.04, 0.05, 0.034, g, RM.leather, 10, 8);
        ell(b, (side === 'L' ? 1 : -1) * 0.03, -0.02, -0.02, 0.014, 0.03, 0.014, g, RM.leather, 8, 6, [0.4, 0, 0]);
        if (!bather) cyl(b, 0, -0.09, 0, 0.046, 0.05, 0.05, g, RM.leather, [0, 0, 0], 10);
      }, 'hand' + side);
    }

    // scarf tail: a ribbon rebuilt every frame (vertices only; this block is its rest layout)
    if (!bather) part('scarfTail', (b) => {
      const K = scarf.segs;
      for (let i = 0; i <= K; i++) for (let j = 0; j < 2; j++) b.v([0, 0, 0], [0, 1, 0], RM.cloth, c.scarf);
      for (let i = 0; i < K; i++) { const a = i * 2; b.t(a, a + 2, a + 3); b.t(a, a + 3, a + 1); b.t(a, a + 3, a + 2); b.t(a, a + 1, a + 3); }
    }, 'scarf');

    for (const p of passengers) {
      if (p.kind === 'corgi' && high) {
        const [x, y, s] = p.at;
        part('corgiBody', (b) => {
          ell(b, x, y + 0.025, s + 0.02, 0.19, 0.045, 0.2, c.cushion, RM.cloth, 14, 6);
          ell(b, x, y + 0.14, s + 0.08, 0.1, 0.075, 0.12, c.corgi, RM.cloth, 12, 8);
          ell(b, x, y + 0.25, s + 0.02, 0.085, 0.13, 0.085, c.corgi, RM.cloth, 12, 8, [-0.25, 0, 0]);
          ell(b, x, y + 0.25, s - 0.045, 0.06, 0.1, 0.04, c.corgiWhite, RM.cloth, 10, 6, [-0.2, 0, 0]);
          b.addGeo(new THREE.TorusGeometry(0.06, 0.02, 6, 12), M4(x, y + 0.33, s + 0.0, 1, 1, 1, Math.PI / 2 + 0.2, 0, 0), RM.cloth, c.sash);
          for (const sg of [-1, 1]) {
            tube(b, [[x + sg * 0.04, y + 0.21, s - 0.04], [x + sg * 0.042, y + 0.09, s - 0.06]], 0.024, c.corgiWhite, RM.cloth, 6);
            ell(b, x + sg * 0.042, y + 0.085, s - 0.08, 0.026, 0.016, 0.034, c.corgiWhite, RM.cloth, 6, 4);
          }
        });
        part('corgiHead', (b) => {
          ell(b, 0, 0.05, -0.01, 0.075, 0.068, 0.078, c.corgi, RM.cloth, 12, 8);
          ell(b, 0, 0.022, -0.08, 0.036, 0.03, 0.058, c.corgiWhite, RM.cloth, 10, 6);
          ell(b, 0, 0.075, -0.06, 0.016, 0.03, 0.03, c.corgiWhite, RM.cloth, 6, 4);
          ell(b, 0, 0.038, -0.137, 0.014, 0.011, 0.01, c.nose, RM.glass, 6, 4);
          ell(b, 0, -0.005, -0.1, 0.014, 0.004, 0.022, c.pink, RM.leather, 6, 4);
          for (const sg of [-1, 1]) {
            b.addGeo(new THREE.ConeGeometry(0.036, 0.09, n(6)), M4(sg * 0.048, 0.13, 0.0, 1, 1, 0.45, 0, 0, -sg * 0.32), RM.cloth, c.corgi);
            b.addGeo(new THREE.ConeGeometry(0.024, 0.06, n(5)), M4(sg * 0.046, 0.122, -0.008, 1, 1, 0.3, 0, 0, -sg * 0.32), RM.leather, c.pink);
            cyl(b, sg * 0.03, 0.075, -0.07, 0.02, 0.02, 0.018, c.brass, RM.brass, [Math.PI / 2 - 0.2, 0, 0], 10);
            cyl(b, sg * 0.03, 0.076, -0.08, 0.016, 0.016, 0.004, c.lens, RM.glass, [Math.PI / 2 - 0.2, 0, 0], 10);
          }
          b.addGeo(new THREE.TorusGeometry(0.073, 0.006, 4, n(16)), M4(0, 0.075, -0.01, 1, 1, 1, Math.PI / 2 - 0.1, 0, 0), RM.leather, c.strap);
        }, 'corgiHead');
        p.head = new THREE.Vector3(x, y + 0.35, s);
      }
      if (p.kind === 'duck') {
        const [x, y, s] = p.at, k = p.scale || 1;
        part('duckBody', (b) => {
          ell(b, x, y + 0.13 * k, s + 0.02 * k, 0.2 * k, 0.15 * k, 0.25 * k, c.duck, RM.plastic, 16, 12);
          ell(b, x, y + 0.2 * k, s + 0.2 * k, 0.09 * k, 0.07 * k, 0.1 * k, c.duck, RM.plastic, 10, 8, [-0.7, 0, 0]);
          for (const sg of [-1, 1]) ell(b, x + sg * 0.17 * k, y + 0.16 * k, s + 0.05 * k, 0.05 * k, 0.09 * k, 0.16 * k, c.duckShade, RM.plastic, 10, 8, [0.3, 0, sg * 0.2]);
          b.addGeo(new THREE.TorusGeometry(0.085 * k, 0.022 * k, 6, n(14)), M4(x, y + 0.27 * k, s - 0.07 * k, 1, 1, 1, Math.PI / 2 - 0.15, 0, 0), RM.cloth, c.silk);
        });
        part('duckHead', (b) => {
          ell(b, 0, 0.1 * k, 0, 0.12 * k, 0.12 * k, 0.12 * k, c.duck, RM.plastic, 16, 12);
          ell(b, 0, 0.065 * k, -0.135 * k, 0.07 * k, 0.026 * k, 0.07 * k, c.beak, RM.plastic, 12, 6);
          ell(b, 0, 0.045 * k, -0.125 * k, 0.06 * k, 0.018 * k, 0.06 * k, c.beak, RM.plastic, 10, 6);
          for (const sg of [-1, 1]) {
            ell(b, sg * 0.065 * k, 0.135 * k, -0.08 * k, 0.026 * k, 0.03 * k, 0.02 * k, c.stripeB, RM.plastic, 8, 6);
            ell(b, sg * 0.072 * k, 0.137 * k, -0.096 * k, 0.012 * k, 0.015 * k, 0.008 * k, c.eye, RM.glass, 8, 6);
          }
          // co-pilot's leather cap and goggles
          b.addGeo(new THREE.SphereGeometry(1, n(14), n(8), 0, Math.PI * 2, 0, Math.PI * 0.42), M4(0, 0.135 * k, 0.025 * k, 0.118 * k, 0.11 * k, 0.118 * k, 0.25, 0, 0), RM.leatherWorn, c.helmet);
          for (const sg of [-1, 1]) ell(b, sg * 0.1 * k, 0.17 * k, 0.04 * k, 0.012 * k, 0.04 * k, 0.03 * k, c.helmet, RM.leatherWorn, 6, 4, [0, 0, sg * 0.5]);
          for (const sg of [-1, 1]) {
            cyl(b, sg * 0.05 * k, 0.22 * k, -0.06 * k, 0.03 * k, 0.03 * k, 0.022 * k, c.brass, RM.brass, [Math.PI / 2 - 0.9, 0, 0], 12);
            cyl(b, sg * 0.05 * k, 0.226 * k, -0.069 * k, 0.024 * k, 0.024 * k, 0.004 * k, c.lens, RM.glass, [Math.PI / 2 - 0.9, 0, 0], 12);
          }
        }, 'duckHead');
        p.head = new THREE.Vector3(x, y + 0.26 * k, s - 0.1 * k);
      }
    }
  }

  let mesh = null, base = null, ranges = null;
  const mat = pbrMaterial('aviator');
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
    base = { pos: geo.attributes.position.array.slice(), nrm: geo.attributes.normal.array.slice() };
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(X, Y + 0.4, S - 0.2), 2.2);
    if (!mesh) {
      mesh = new THREE.Mesh(geo, mat); mesh.name = 'pilot'; mesh.castShadow = high; mesh.receiveShadow = true;
      if (!high) Object.defineProperty(mesh, 'castShadow', { get: () => false, set() {} });
    } else { mesh.geometry.dispose(); mesh.geometry = geo; }
    st.staticDone = false;
  }

  const nm = new THREE.Matrix3();
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
      const a = base.nrm[i], b = base.nrm[i + 1], cc = base.nrm[i + 2];
      const nx = ne[0] * a + ne[3] * b + ne[6] * cc, ny = ne[1] * a + ne[4] * b + ne[7] * cc, nz = ne[2] * a + ne[5] * b + ne[8] * cc;
      const l = Math.hypot(nx, ny, nz) || 1;
      nr[i] = nx / l; nr[i + 1] = ny / l; nr[i + 2] = nz / l;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
  }

  // scarf: streams aft and a little left from the throat, flapping harder with airspeed
  function poseScarf(hide, t, speed) {
    const r = ranges.scarfTail;
    if (!r) return;
    const pos = mesh.geometry.attributes.position.array, nr = mesh.geometry.attributes.normal.array;
    const K = scarf.segs, amp = 0.03 + Math.min(1, speed / 60) * 0.07, droop = Math.max(0, 1 - speed / 25);
    const o = [X - 0.05, Y + 0.55, S + 0.07];
    let px = o[0], py = o[1], pz = o[2];
    for (let i = 0; i <= K; i++) {
      const u = i / K, L = scarf.len * u;
      const ph = t * (6 + speed * 0.12) - u * 7;
      const cx = o[0] - 0.2 * u - Math.sin(ph) * amp * u * 1.3;
      const cy = o[1] + 0.12 * u * (1 - droop) - droop * 0.55 * u * u + Math.cos(ph * 0.7) * amp * 0.6 * u;
      const cz = o[2] + L * (1 - droop * 0.5);
      const tw = 0.7 + Math.sin(ph * 0.9) * 0.8 * u;
      const hw = scarf.w * (1 - 0.25 * u);
      const ax = Math.cos(tw) * hw, ay = Math.sin(tw) * hw;
      for (let j = 0; j < 2; j++) {
        const k = (r.start + i * 2 + j) * 3, sgn = j ? 1 : -1;
        if (hide) { pos[k] = pos[k + 1] = pos[k + 2] = 0; continue; }
        pos[k] = cx + sgn * ax; pos[k + 1] = cy + sgn * ay; pos[k + 2] = cz;
        nr[k] = -Math.sin(tw); nr[k + 1] = Math.cos(tw); nr[k + 2] = 0;
      }
      px = cx; py = cy; pz = cz;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
  }

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), ID = new THREE.Matrix4();
  const st = { yaw: 0, pitch: 0, cyaw: 0, t: 0, hideBody: false, staticDone: false };
  const segM = (a, b) => {
    _v.subVectors(b, a); const len = _v.length();
    _q.setFromUnitVectors(UPY, _v.divideScalar(len));
    return _m.compose(a, _q, _s.set(1, len, 1));
  };
  const _w = new THREE.Vector3(), _el = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _g = new THREE.Vector3();
  const _grip = new THREE.Vector3(...gripLocal);

  function arm(side, target) {
    const Sx = SH[side];
    _w.copy(target);
    _d.subVectors(_w, Sx);
    const handBack = _d.clone().normalize().multiplyScalar(0.07);
    _w.sub(handBack);
    _d.subVectors(_w, Sx);
    let d = _d.length();
    const reach = (L1 + L2) * 0.985, sc = d > reach ? d / reach : 1, l1 = L1 * sc, l2 = L2 * sc;
    d = Math.min(d, (l1 + l2) * 0.985);
    _d.normalize();
    const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _p.set(side === 'L' ? -elbowOut : elbowOut, -1, 0.35).addScaledVector(_d, -_p.dot(_d)).normalize();
    _el.copy(Sx).addScaledVector(_d, a).addScaledVector(_p, h);
    pose('upper' + side, segM(Sx, _el));
    pose('fore' + side, segM(_el, _w));
    _g.subVectors(target, _w).normalize();
    _q.setFromUnitVectors(UPY, _g);
    pose('hand' + side, _m.compose(target, _q, _s.set(1, 1, 1)));
  }

  function update(dt, cur, ctx) {
    if (!mesh) return;
    st.t += dt;
    const t = st.t, k = 1 - Math.exp(-dt * 3);
    const wantYaw = -(cur.rudder * 0.3 + cur.aileron * 0.32) + 0.12 * Math.sin(t * 0.23) + 0.07 * Math.sin(t * 0.71);
    st.yaw += (wantYaw - st.yaw) * k;
    st.pitch += (-cur.elevator * 0.08 + 0.03 * Math.sin(t * 0.4) - st.pitch) * k;
    if (!st.staticDone) {
      for (const [name, r] of Object.entries(ranges)) if (r.frame === 'static') pose(name, name === 'torso' && st.hideBody ? ZERO : ID);
      st.staticDone = true;
    }
    pose('head', st.hideBody ? ZERO : _m.compose(HEAD, _q.setFromEuler(_e.set(st.pitch, st.yaw, 0, 'YXZ')), _s.set(1, 1, 1)));
    const speed = Math.max(ctx.airspeed || 0, (ctx.rpm || 0) > 900 ? (ctx.rpm - 900) / 40 : 0);
    poseScarf(st.hideBody, t, speed);
    for (const p of passengers) {
      if (p.kind === 'corgi' && ranges.corgiHead) {
        const cy = 0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 1.13 + 1) - cur.aileron * 0.4;
        st.cyaw += (cy - st.cyaw) * k;
        pose('corgiHead', _m.compose(p.head, _q.setFromEuler(_e.set(0.1 * Math.sin(t * 0.9), st.cyaw, 0.08 * Math.sin(t * 0.6), 'YXZ')), _s.set(1, 1, 1)));
      }
      if (p.kind === 'duck' && ranges.duckHead) {
        const bob = Math.sin(t * 2.1) * 0.012 + Math.sin(t * 0.7) * 0.01;
        pose('duckHead', _m.compose(_v.copy(p.head).setY(p.head.y + bob), _q.setFromEuler(_e.set(0.08 * Math.sin(t * 1.3), 0.35 * Math.sin(t * 0.33) - cur.aileron * 0.3, 0.12 * Math.sin(t * 0.9), 'YXZ')), _s.set(1, 1, 1)));
      }
    }
    if (ctx.stick) { ctx.stick.updateMatrix(); arm('R', _v.copy(_grip).applyMatrix4(ctx.stick.matrix).clone()); }
    if (leftHand) arm('L', new THREE.Vector3(...leftHand(cur, ctx)));
  }

  assemble();
  return {
    get mesh() { return mesh; },
    update,
    setHideBody(v) { if (st.hideBody !== !!v) { st.hideBody = !!v; st.staticDone = false; } },
    setConfig(o = {}) { cfg = { ...cfg, ...o }; assemble(); },
    get config() { return { ...cfg }; },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
