import * as THREE from 'three';
import { TOWN_ROADS } from './town.js';
import { Builder, col, fbm, rng, ribbon, arc, segInRect } from './util.js';
import { asphaltTexture, skidAtlas, uvQuad } from './textures.js';
import { FRAMES, SEGMENTS, HOLDS, rwPt, rwDir, PAD_LEN } from './geom.js';
import royal from '../../data/airports/royal.js';
const { taxiwayWidth: TAXIWAY_WIDTH, stands: STANDS, terminal: TERMINAL } = royal, APRON = royal.aprons[0];

const Y_PAVE = 0.04, Y_MARK = 0.06;
const WHITE = col('#f4f4ef', 0.92), YELLOW = col('#f2c21b', 0.95), RED = col('#c0182c', 0.9), DARK = col('#1d1f22');
const GOLD = col('#d9a520');

// Paved areas other modules need (surface queries, lights, props).
export const APRON_RECT = { x0: APRON.center[0] - APRON.size[0] / 2, x1: APRON.center[0] + APRON.size[0] / 2, z0: TERMINAL.center[2] + TERMINAL.size[1] / 2, z1: -110 - TAXIWAY_WIDTH / 2 };
export const HANGAR_APRON = { x0: -415, x1: APRON_RECT.x0, z0: -262, z1: APRON_RECT.z1 };
export const TOWER_PAD = { x0: 165, x1: 222, z0: -282, z1: -238 };
export const ROADS = [
  { x0: -235, x1: 230, z0: -364, z1: -352 },
  { x0: -86, x1: -74, z0: -1240, z1: -352 },
  { x0: 184, x1: 196, z0: -352, z1: -282 },
  { x0: -3600, x1: 3600, z0: -1246, z1: -1234 },
  ...TOWN_ROADS,
];
export const CAR_PARK = { x0: -210, x1: 40, z0: -440, z1: -372 };

function aaRect(b, r, y, color) {
  b.rect((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 1, 0, r.x1 - r.x0, r.z1 - r.z0, y, color);
}

function fillet(b, k, a, c, R, y, color) {
  const cx = k[0] + (a[0] + c[0]) * R, cz = k[1] + (a[1] + c[1]) * R;
  const pts = [k];
  for (let i = 0; i <= 10; i++) {
    const th = (i / 10) * Math.PI / 2;
    pts.push([cx - c[0] * R * Math.cos(th) - a[0] * R * Math.sin(th), cz - c[1] * R * Math.cos(th) - a[1] * R * Math.sin(th)]);
  }
  b.fan(pts, y, color);
}

// Subdivided runway surface with rubber build-up (also used by js/world/site.js) and paving-lane banding baked into vertex colour.
export function runwaySurface(b, F) {
  const W = F.W, L = F.L;
  const tcols = [-W / 2, -W / 2 + 1.5, -0.33 * W, -0.2 * W, -0.1 * W, -0.03 * W, 0.03 * W, 0.1 * W, 0.2 * W, 0.33 * W, W / 2 - 1.5, W / 2];
  const ds = 8;
  const ns = Math.ceil(L / ds);
  const base = b.count;
  const r = rng(F.W * 7);
  const lanes = [];
  for (let k = 0; k < 12; k++) lanes.push((r() - 0.5) * 0.08);
  for (let i = 0; i <= ns; i++) {
    const s = -L / 2 + (i / ns) * L;
    const aMin = Math.min(s + L / 2, L / 2 - s);
    for (const t of tcols) {
      const x = F.cx + F.dx * s + F.rx * t, z = F.cz + F.dz * s + F.rz * t;
      let v = 0.36 * (1 + (fbm(s / 70, t / 9 + F.W, 3) - 0.5) * 0.22);
      v *= 1 + lanes[Math.min(11, Math.floor((t + W / 2) / 3.75)) | 0];
      if (Math.abs(t) > W / 2 - 4) v *= 1.07;
      const rub = smooth(100, 190, aMin) * (1 - smooth(Math.min(380, L * 0.3), Math.min(600, L * 0.45), aMin));
      const lat = Math.exp(-Math.pow(t / (0.16 * W), 2)) * 0.85 + Math.exp(-Math.pow((Math.abs(t) - 0.09 * W) / (0.06 * W), 2)) * 0.3;
      v *= 1 - Math.min(0.42, rub * lat * (0.4 + 0.5 * fbm(s / 25, t / 3, 2)));
      v *= 1 - 0.08 * Math.exp(-Math.pow(t / (0.06 * W), 2));
      b.v(x, Y_PAVE + 0.01, z, 0, 1, 0, [v, v, v * 1.02]);
    }
  }
  const nc = tcols.length;
  for (let i = 0; i < ns; i++) for (let j = 0; j < nc - 1; j++) {
    const a = base + i * nc + j, c = a + nc;
    const cross = F.dx * F.rz - F.dz * F.rx;
    if (cross > 0) b.i.push(a, a + 1, c, a + 1, c + 1, c); else b.i.push(a, c, a + 1, a + 1, c, c + 1);
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function gridQuad(b, x0, z0, x1, z1, step, y, shadeFn) {
  const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const ax = x0 + (x1 - x0) * i / nx, bx = x0 + (x1 - x0) * (i + 1) / nx;
    const az = z0 + (z1 - z0) * j / nz, bz = z0 + (z1 - z0) * (j + 1) / nz;
    const c = shadeFn((ax + bx) / 2, (az + bz) / 2, i, j);
    b.quad([ax, y, bz], [bx, y, bz], [bx, y, az], [ax, y, az], c);
  }
}

function tone(v, warm = 0) { return [v * (1 + warm), v, v * (1 - warm)]; }

export function buildPavement(renderer, quality, atlas) {
  const P = new Builder(true);
  const M = new Builder(false);
  const D = new Builder(true);
  const K = new Builder(true);
  const r = rng(99);
  const runwayRects = FRAMES.map((F) => F.rect);

  // --- pavement, drawn in painter's order: roads, shoulders/pads, apron, taxiways, runways (main last) ---
  for (const rd of ROADS) aaRect(P, rd, Y_PAVE, tone(0.25));
  gridQuad(P, CAR_PARK.x0, CAR_PARK.z0, CAR_PARK.x1, CAR_PARK.z1, 25, Y_PAVE, () => tone(0.27 + r() * 0.02));
  aaRect(P, TOWER_PAD, Y_PAVE, tone(0.5, 0.02));

  for (const F of [...FRAMES].reverse()) {
    const sw = F.shoulder;
    for (const side of [-1, 1]) {
      const t = side * (F.W / 2 + sw / 2);
      const n = Math.ceil(F.L / 50);
      for (let i = 0; i < n; i++) {
        const s0 = -F.L / 2 + i * F.L / n;
        const sm = s0 + F.L / n / 2;
        const v = 0.42 * (1 + (fbm(sm / 90, side * 3 + F.W, 2) - 0.5) * 0.25);
        P.rect(F.cx + F.dx * sm + F.rx * t, F.cz + F.dz * sm + F.rz * t, F.dx, F.dz, F.L / n + 0.05, sw, Y_PAVE - 0.005, tone(v, 0.03));
      }
    }
    for (const e of [0, 1]) {
      const [px, pz] = rwPt(F, e, -PAD_LEN / 2, 0);
      P.rect(px, pz, F.dx, F.dz, PAD_LEN, F.W + 2 * sw, Y_PAVE - 0.005, tone(0.4, 0.03));
    }
  }

  const slab = 7.5;
  gridQuad(P, APRON_RECT.x0, APRON_RECT.z0, APRON_RECT.x1, APRON_RECT.z1, slab, Y_PAVE, (x, z) => tone(0.58 * (0.965 + r() * 0.06) * (1 - 0.1 * fbm(x / 40, z / 40, 2)), 0.02));
  gridQuad(P, HANGAR_APRON.x0, HANGAR_APRON.z0, HANGAR_APRON.x1, HANGAR_APRON.z1, slab, Y_PAVE, (x, z) => tone(0.55 * (0.965 + r() * 0.06), 0.02));

  for (const S of SEGMENTS) {
    const n = Math.ceil(S.len / 30);
    const ext = TAXIWAY_WIDTH / 2;
    for (let i = 0; i < n; i++) {
      const a0 = -ext + i * (S.len + 2 * ext) / n, a1 = -ext + (i + 1) * (S.len + 2 * ext) / n;
      const am = (a0 + a1) / 2;
      const v = 0.31 * (1 + (fbm(am / 60, S.p0[0] / 50, 2) - 0.5) * 0.25);
      P.rect(S.p0[0] + S.dx * am, S.p0[1] + S.dz * am, S.dx, S.dz, a1 - a0 + 0.05, TAXIWAY_WIDTH, Y_PAVE, tone(v));
    }
  }
  const half = TAXIWAY_WIDTH / 2;
  const A = SEGMENTS.find((s) => s.id === 'A');
  const tc = tone(0.31);
  for (const S of SEGMENTS) {
    if (S.id === 'A') continue;
    const x = S.p0[0];
    for (const sx of [-1, 1]) {
      const atEnd = (sx < 0 && x <= A.p0[0]) || (sx > 0 && x >= A.p1[0]);
      if (!atEnd) fillet(P, [x + sx * half, A.p0[1] + half], [sx, 0], [0, 1], 14, Y_PAVE, tc);
      fillet(P, [x + sx * half, -FRAMES[0].W / 2], [sx, 0], [0, -1], 22, Y_PAVE, tc);
    }
  }

  for (const F of [...FRAMES].reverse()) runwaySurface(P, F);

  // world-aligned uv for the asphalt tile
  const pp = P.p, uu = P.u;
  for (let k = 0; k < P.count; k++) { uu[k * 2] = pp[k * 3] / 9; uu[k * 2 + 1] = -pp[k * 3 + 2] / 9; }

  // --- runway markings ---
  const nums = [];
  for (const F of [...FRAMES].reverse()) {
    const main = F === FRAMES[0];
    const others = main ? [] : [FRAMES[0].rect];
    const W = F.W, L = F.L;
    const edgeW = W >= 30 ? 0.9 : 0.45;
    const clW = W >= 30 ? 0.9 : 0.45;
    const mark = (e, a0, a1, t0, t1, c = WHITE) => {
      const p0 = rwPt(F, e, a0, (t0 + t1) / 2), p1 = rwPt(F, e, a1, (t0 + t1) / 2);
      clipRibbon(M, p0, p1, Math.abs(t1 - t0), Y_MARK, c, others);
    };
    for (const side of [-1, 1]) mark(0, 0, L, side * (W / 2 - edgeW) , side * W / 2);
    const nStripes = W >= 45 ? 12 : W >= 30 ? 8 : W >= 23 ? 6 : 4;
    const per = nStripes / 2;
    for (const e of [0, 1]) {
      for (let k = 0; k < per; k++) {
        const t = 2.7 + k * 3.6;
        for (const side of [-1, 1]) mark(e, 6, 36, side * (t - 0.9), side * (t + 0.9));
      }
      const name = F.rw.ends[e];
      const p = rwPt(F, e, 48 + 4.5, 0);
      const [dx, dz] = rwDir(F, e);
      nums.push({ name, x: p[0], z: p[1], dx, dz });
      // pre-threshold chevrons on the blast pad
      for (let k = 0; k < 3; k++) {
        const a = -8 - k * 13;
        for (const side of [-1, 1]) {
          const c0 = rwPt(F, e, a, 0), c1 = rwPt(F, e, a - 0.55 * (W / 2 + F.shoulder - 1), side * (W / 2 + F.shoulder - 1));
          ribbon(M, [c0, c1], 0.9, Y_MARK, YELLOW);
        }
      }
      const aim = main ? 300 : 250, aimLen = main ? 45 : 30, aimW = main ? 4 : 3, aimIn = main ? 6 : 4.5;
      for (const side of [-1, 1]) mark(e, aim, aim + aimLen, side * aimIn, side * (aimIn + aimW));
      const tdz = main ? [[150, 3], [450, 2], [600, 1]] : [[150, 2], [330, 1]];
      for (const [a, bars] of tdz) {
        for (let k = 0; k < bars; k++) {
          const t0 = aimIn + k * 3.3;
          for (const side of [-1, 1]) mark(e, a, a + 22.5, side * t0, side * (t0 + 1.8));
        }
      }
    }
    const c0 = 48 + 9 + 12, span = L - 2 * c0;
    const nd = Math.floor((span + 20) / 50);
    const gap = (span - nd * 30) / (nd - 1);
    for (let k = 0; k < nd; k++) {
      const a = c0 + k * (30 + gap);
      mark(0, a, a + 30, -clW / 2, clW / 2);
    }
  }

  // --- taxiway markings ---
  const TW = 0.3;
  const yl = (pts, clip = true) => clipPolyline(M, pts, TW, Y_MARK, YELLOW, clip ? runwayRects : []);
  const R = 20;
  yl([[A.p0[0] + R, A.p0[1]], [A.p1[0] - R, A.p1[1]]]);
  const az = A.p0[1];
  for (const S of SEGMENTS) {
    if (S.id === 'A') continue;
    const x = S.p0[0];
    const end = x <= A.p0[0] ? -1 : x >= A.p1[0] ? 1 : 0;
    const zEdge = -FRAMES[0].W / 2 - 2;
    yl([[x, end ? az + R : az], [x, zEdge - 14]], false);
    if (end) yl(arc(x - end * R, az + R, R, end > 0 ? -Math.PI / 2 : -Math.PI / 2, end > 0 ? 0 : -Math.PI, 10), false);
    else for (const sx of [-1, 1]) yl(arc(x + sx * R, az + R, R, sx > 0 ? -Math.PI / 2 : -Math.PI / 2, sx > 0 ? -Math.PI : 0, 10), false);
    const Rl = 14.8, off = 1.4;
    for (const sx of [-1, 1]) {
      if (sx === end) continue;
      const pts = arc(x + sx * Rl, -off - Rl, Rl, sx > 0 ? Math.PI : 0, Math.PI / 2, 10);
      pts.unshift([x, zEdge - 14]);
      pts.push([x + sx * (Rl + (end ? 18 : 45)), -off]);
      yl(pts, false);
    }
  }
  for (const h of HOLDS) holdLines(M, h, TAXIWAY_WIDTH);

  // --- apron: stands, safety lines, service road, royal carpet ---
  for (const [i, st] of STANDS.entries()) {
    const [x, , z] = st.position;
    for (const sx of [-1, 1]) yl(arc(x + sx * 16, az - 16, 16, Math.PI / 2, sx > 0 ? Math.PI : 0, 8), false);
    yl([[x, az - 16], [x, z - 6]], false);
    clipPolyline(M, arc(x, z, 9, 0, Math.PI * 2, 40), TW, Y_MARK, YELLOW, []);
    ribbon(M, [[x - 2.2, z - 6], [x + 2.2, z - 6]], 0.45, Y_MARK, YELLOW);
    for (const sx of [-1, 1]) clipPolyline(M, arc(x + sx * 5.2, z + 0.6, 0.5, 0, Math.PI * 2, 10), 0.18, Y_MARK, YELLOW, []);
    nums.push({ name: 'stand' + (i + 1), x, z: z - 13, dx: 0, dz: -1, w: 4, h: 2 });
    if (i < STANDS.length - 1) dashed(M, [[x + 24, APRON_RECT.z1 - 8], [x + 24, -258]], 0.3, Y_MARK, RED, 3, 2);
  }
  const zr = -262;
  ribbon(M, [[APRON_RECT.x0 + 8, zr], [APRON_RECT.x1 - 8, zr]], 0.3, Y_MARK, RED);
  ribbon(M, [[APRON_RECT.x0 + 8, zr - 3], [APRON_RECT.x1 - 8, zr - 3]], 0.18, Y_MARK, WHITE);
  ribbon(M, [[APRON_RECT.x0 + 8, APRON_RECT.z0 + 2], [APRON_RECT.x1 - 8, APRON_RECT.z0 + 2]], 0.18, Y_MARK, WHITE);
  dashed(M, [[APRON_RECT.x0 + 8, (zr - 3 + APRON_RECT.z0 + 2) / 2], [APRON_RECT.x1 - 8, (zr - 3 + APRON_RECT.z0 + 2) / 2]], 0.18, Y_MARK, WHITE, 3, 3);
  const cx = TERMINAL.center[0];
  ribbon(M, [[cx, APRON_RECT.z0], [cx, -244]], 3.0, Y_MARK + 0.004, col('#9c0f2a', 0.8));
  for (const sx of [-1.6, 1.6]) ribbon(M, [[cx + sx, APRON_RECT.z0], [cx + sx, -244]], 0.18, Y_MARK + 0.005, GOLD);

  const JOINT = tone(0.16);
  for (const A2 of [APRON_RECT, HANGAR_APRON]) {
    for (let x = A2.x0 + slab; x < A2.x1 - 0.1; x += slab) ribbon(M, [[x, A2.z0], [x, A2.z1]], 0.07, Y_MARK - 0.005, JOINT);
    for (let z = A2.z0 + slab; z < A2.z1 - 0.1; z += slab) ribbon(M, [[A2.x0, z], [A2.x1, z]], 0.07, Y_MARK - 0.005, JOINT);
  }

  // --- roads & car park ---
  for (const rd of ROADS) {
    const horiz = rd.x1 - rd.x0 > rd.z1 - rd.z0;
    const mid = horiz ? (rd.z0 + rd.z1) / 2 : (rd.x0 + rd.x1) / 2;
    if (horiz) dashed(M, [[rd.x0 + 4, mid], [rd.x1 - 4, mid]], 0.15, Y_MARK, WHITE, 3, 6);
    else dashed(M, [[mid, rd.z0 + 4], [mid, rd.z1 - 4]], 0.15, Y_MARK, WHITE, 3, 6);
  }
  for (let x = CAR_PARK.x0 + 4; x < CAR_PARK.x1 - 2; x += 2.6) {
    for (const zz of [CAR_PARK.z0 + 4, CAR_PARK.z0 + 27, CAR_PARK.z0 + 41, CAR_PARK.z1 - 18]) ribbon(M, [[x, zz], [x, zz + 5]], 0.12, Y_MARK, WHITE);
  }

  // --- painted numbers (ground decals) ---
  for (const n of nums) {
    const rect = atlas.uv[n.name.startsWith('stand') ? n.name : 'rw' + n.name];
    const w = n.w || 7.5, h = n.h || 9;
    D.rect(n.x, n.z, n.dx, n.dz, h, w, Y_MARK + 0.002, [1, 1, 1], uvQuad(rect));
  }

  // --- rubber streaks, crack sealant, patches ---
  const sk = skidAtlas(renderer);
  const nSkid = quality === 'low' ? 18 : 40;
  for (const F of FRAMES) {
    for (const e of [0, 1]) {
      const [dx, dz] = rwDir(F, e);
      for (let k = 0; k < nSkid * (F === FRAMES[0] ? 1 : 0.6); k++) {
        const a = 130 + Math.pow(r(), 1.6) * (F === FRAMES[0] ? 300 : 170), len = 15 + r() * 45;
        const t = (r() - 0.5) * F.W * 0.22;
        const p = rwPt(F, e, a + len / 2, t);
        const ang = (r() - 0.5) * 0.015;
        const cdx = dx * Math.cos(ang) - dz * Math.sin(ang), cdz = dx * Math.sin(ang) + dz * Math.cos(ang);
        K.rect(p[0], p[1], cdx, cdz, len, 1.2 + r() * 1.4, Y_MARK + 0.004, [0.18 + r() * 0.3, 1, 1], uvQuad(sk.streak((r() * 4) | 0)));
      }
      for (let k = 0; k < 16; k++) {
        const a = 40 + r() * (F.L / 2 - 40);
        const p = rwPt(F, e, a, (r() - 0.5) * F.W * 0.9);
        const sz = 8 + r() * 10;
        K.rect(p[0], p[1], dx, dz, sz, sz, Y_MARK + 0.003, [0.35, 1, 1], uvQuad(sk.crack((r() * 2) | 0)));
      }
    }
  }
  for (const S of SEGMENTS) {
    for (let a = 10; a < S.len; a += 35 + r() * 30) {
      const sz = 6 + r() * 8;
      K.rect(S.p0[0] + S.dx * a + (r() - 0.5) * 6, S.p0[1] + S.dz * a, S.dx, S.dz, sz, sz, Y_MARK + 0.003, [0.25, 1, 1], uvQuad(r() < 0.25 ? sk.patch : sk.crack((r() * 2) | 0)));
    }
  }
  const asphalt = asphaltTexture(renderer);
  const pave = new THREE.Mesh(P.build(), new THREE.MeshStandardMaterial({
    map: asphalt, vertexColors: true, roughness: 0.92, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
  }));
  pave.receiveShadow = true; pave.renderOrder = -8; pave.name = 'pavement';
  const marks = new THREE.Mesh(M.build(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.75, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false,
  }));
  marks.receiveShadow = true; marks.renderOrder = -7; marks.name = 'markings';
  const decals = new THREE.Mesh(D.build(), new THREE.MeshStandardMaterial({
    map: atlas.texture, transparent: true, roughness: 0.75, metalness: 0, color: '#ebebe6',
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false,
  }));
  decals.receiveShadow = true; decals.renderOrder = -6; decals.name = 'groundDecals';
  const skidMat = new THREE.MeshBasicMaterial({
    map: sk.texture, transparent: true, color: '#0b0b0c', vertexColors: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
  });
  skidMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.a *= vColor.r;');
  };
  const skids = new THREE.Mesh(K.build(), skidMat);
  skids.renderOrder = -5; skids.name = 'rubber';
  return { meshes: [pave, marks, decals, skids] };
}

function clipRibbon(b, p0, p1, width, y, color, rects) {
  let pieces = [[0, 1]];
  for (const R of rects) {
    const cut = segInRect(p0, p1, { ...R, wid: R.wid });
    if (!cut) continue;
    const next = [];
    for (const [a, c] of pieces) {
      if (cut[1] <= a || cut[0] >= c) { next.push([a, c]); continue; }
      if (cut[0] > a) next.push([a, cut[0]]);
      if (cut[1] < c) next.push([cut[1], c]);
    }
    pieces = next;
  }
  for (const [a, c] of pieces) {
    if (c - a < 1e-3) continue;
    ribbon(b, [lerp2(p0, p1, a), lerp2(p0, p1, c)], width, y, color);
  }
}

export function clipPolyline(b, pts, width, y, color, rects) {
  if (!rects.length) { ribbon(b, pts, width, y, color); return; }
  const grown = rects.map((R) => ({ ...R, wid: R.wid + 2 }));
  for (let k = 0; k < pts.length - 1; k++) clipRibbon(b, pts[k], pts[k + 1], width, y, color, grown);
}

function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

export function dashed(b, [p0, p1], width, y, color, on, off) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  for (let s = 0; s < L; s += on + off) ribbon(b, [lerp2(p0, p1, s / L), lerp2(p0, p1, Math.min(L, s + on) / L)], width, y, color);
}

// ICAO pattern A: two solid lines on the holding side, two dashed toward the runway.
export function holdLines(b, h, tw) {
  const lx = h.hz, lz = -h.hx;
  const w = tw / 2 + 0.5;
  const lw = 0.3, gap = 0.3;
  for (let k = 0; k < 4; k++) {
    const back = (1.5 - k) * (lw + gap);
    const cx = h.x - h.hx * back, cz = h.z - h.hz * back;
    const a = [cx - lx * w, cz - lz * w], c = [cx + lx * w, cz + lz * w];
    if (k < 2) ribbon(b, [a, c], lw, Y_MARK, YELLOW);
    else dashed(b, [a, c], lw, Y_MARK, YELLOW, 1, 1);
  }
}
