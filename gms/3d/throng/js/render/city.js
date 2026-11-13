import * as THREE from 'three';
import { GeoWriter, mulberry, C, mul, mix } from './geo.js';
import { shaderCommon, fogUniforms } from './shared.js';
import { FACADES, ROOFS } from '../world/map.js';
import { getTheme } from './themes.js';

const GOLD = C(0xe0a838);
const STONE = C(0xcfc3ad);
const STONE_D = C(0xa89c88);
const IRON = C(0x1d2226);
const AWN0 = [0xb3302c, 0x2d6b4b, 0x24427a, 0xd7ae52, 0x7a2f58, 0x2f5f6e];
const LIT0 = [0xffc77a, 0xffb05a, 0xffd9a0, 0xff9a48, 0xfff0d0];
const SIGN0 = [0x1f3a2c, 0x5a1e26, 0x1d2a4a, 0x231c1a, 0x3d2a52, 0x6a4a1c];
// theme-dependent palettes, set at the start of buildCity
let AWNINGS, LIT, GLASS, SIGNS, T;
function setPalettes(theme) {
  T = theme;
  AWNINGS = (T.awnings || AWN0).map((h) => C(h));
  LIT = (T.lit || LIT0).map((h) => C(h));
  GLASS = C(T.glass);
  SIGNS = SIGN0.map((h) => C(h));
}
setPalettes(getTheme('evening'));
const litP = (p) => Math.min(0.95, p * T.litK);

const BACK = { n: 's', s: 'n', e: 'w', w: 'e' };
const ENDS = { n: 'ew', s: 'ew', e: 'ns', w: 'ns' };
const FLOOR0 = 4.2, FH = 3.1;
const FLOWERS = [0xd8324a, 0xf2c23a, 0xe85aa0, 0xf6f2ea, 0x9a4ad8, 0xf07a2a];

function styleOf(b) {
  const r = mulberry(b.seed ^ 0x2c1b3c6d);
  const landmark = b.roof === 'dome';
  const F = C(b.facade);
  const lum = F.r * 0.3 + F.g * 0.5 + F.b * 0.2;
  return {
    landmark,
    pil: landmark || r() < 0.35,
    balc: landmark ? 'piano' : (() => { const q = r(); return q < 0.3 ? 'piano' : q < 0.5 ? 'cont' : q < 0.62 ? 'all' : 'none'; })(),
    pedi: landmark || r() < 0.35,
    arch: landmark || r() < 0.25,
    trim: lum > 0.62 ? mix(F, C(0xfffaf0), 0.6) : mix(C(0xf1e6d2), F, 0.15),
    sign: SIGNS[Math.floor(r() * SIGNS.length)],
    neon: T.signs ? C(T.signs[Math.floor(r() * T.signs.length)]) : null,
    shutters: !landmark && r() < 0.3 ? mix(C([0x3f5e4a, 0x47607e, 0x6b3a32, 0x55606a][Math.floor(r() * 4)]), F, 0.1) : null,
  };
}

function facadeSide(G, D, rnd, b, st, side, x0, z0, x1, z1) {
  const F = C(b.facade);
  const L = side === 'n' || side === 's' ? x1 - x0 : z1 - z0;
  const out = (side === 's' || side === 'e') ? 1 : -1;
  const plane = side === 'n' ? z0 : side === 's' ? z1 : side === 'w' ? x0 : x1;
  const along0 = side === 'n' || side === 's' ? x0 : z0;
  const flip = side === 'n' || side === 'e';
  const at = (u, y, o) => (side === 'n' || side === 's') ? [along0 + u, y, plane + out * o] : [plane + out * o, y, along0 + u];
  const rect = (W, u0, u1, y0, y1, o, col, emit = 0) => {
    const a = at(u0, y0, o), bb = at(u1, y0, o), c = at(u1, y1, o), d = at(u0, y1, o);
    if (flip) W.quad(bb, a, d, c, col, emit); else W.quad(a, bb, c, d, col, emit);
  };
  const boxL = (W, u0, u1, y0, y1, o0, o1, col, opts = {}) => {
    const p = at(u0, y0, o0), q = at(u1, y1, o1);
    W.box(Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), col,
      { skip: BACK[side] + 'b' + (opts.ends ? ENDS[side] : ''), top: opts.top });
  };
  const arch = (W, u, y, r, o, col, emit = 0) => {
    const n = 5, pts = [];
    for (let k = 0; k <= n; k++) { const a = Math.PI * k / n; pts.push(at(u + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, o)); }
    if (flip) W.poly(pts, col, emit); else W.poly([...pts].reverse(), col, emit);
  };
  const ext = b.ext[side];
  const trim = st.trim;
  const nb = Math.max(1, Math.floor((L - 1.2) / 2.9));
  const sp = L / nb;
  const lit = () => rnd() < litP(b.lit);

  if (!ext) {
    for (let f = 0; f < b.floors; f++) {
      const y = FLOOR0 + f * FH + 0.65;
      for (let k = 0; k < nb; k++) {
        const u = sp * (k + 0.5), on = lit();
        G.win = on ? rnd() + 0.001 : 0;
        rect(G, u - 0.5, u + 0.5, y, y + 1.6, 0.04, on ? LIT[k % LIT.length] : GLASS, on ? 1.4 : 0);
        G.win = 0;
      }
    }
    return;
  }

  // upper floors
  for (let f = 0; f < b.floors; f++) {
    const yb = FLOOR0 + f * FH;
    const y0 = yb + 0.65, y1 = y0 + (st.arch && f === 0 ? 1.75 : 1.65);
    if (f > 0) boxL(D, 0, L, yb - 0.06, yb + 0.12, 0, 0.12, trim, { ends: true });
    const balcAll = st.balc === 'all' || (st.balc === 'piano' && f === 0);
    if (st.balc === 'cont' && f === b.floors - 1 && L > 5) {
      boxL(D, 0.3, L - 0.3, y0 - 0.3, y0 - 0.12, 0, 0.8, trim);
      rect(D, 0.3, L - 0.3, y0 - 0.12, y0 + 0.72, 0.8, mix(IRON, F, 0.18));
      boxL(D, 0.3, L - 0.3, y0 + 0.72, y0 + 0.8, 0.72, 0.84, mix(IRON, trim, 0.3), { ends: true });
    }
    for (let k = 0; k < nb; k++) {
      const u = sp * (k + 0.5), on = lit();
      const gw = 0.5, fw = 0.7;
      rect(G, u - fw, u + fw, y0 - 0.16, y1 + 0.14, 0.03, trim);
      G.win = on ? rnd() + 0.001 : 0;
      const gc = on ? LIT[Math.floor(rnd() * LIT.length)] : GLASS, ge = on ? 1.3 + rnd() * 1.3 : 0;
      rect(G, u - gw, u + gw, y0, y1, 0.07, gc, ge);
      if (st.arch && f === 0) arch(G, u, y1, gw, 0.07, gc, ge);
      G.win = 0;
      if (st.arch && f === 0) arch(D, u, y1 + 0.02, fw, 0.035, trim);
      rect(D, u - 0.04, u + 0.04, y0, y1, 0.08, mul(trim, 0.85));
      boxL(D, u - 0.78, u + 0.78, y0 - 0.26, y0 - 0.12, 0, 0.2, trim);
      if (st.pedi && f === 0 && !st.arch) {
        const a = at(u - 0.9, y1 + 0.16, 0.12), c = at(u + 0.9, y1 + 0.16, 0.12), t = at(u, y1 + 0.62, 0.12);
        if (flip) D.tri(c, a, t, trim); else D.tri(a, c, t, trim);
        boxL(D, u - 0.92, u + 0.92, y1 + 0.1, y1 + 0.18, 0, 0.16, trim);
      }
      if (st.shutters && f < b.floors) {
        rect(D, u - fw - 0.5, u - fw - 0.04, y0, y1, 0.05, st.shutters);
        rect(D, u + fw + 0.04, u + fw + 0.5, y0, y1, 0.05, st.shutters);
      }
      if (balcAll && (st.balc !== 'all' || (k + f) % 2 === 0)) {
        boxL(D, u - 0.9, u + 0.9, y0 - 0.32, y0 - 0.14, 0, 0.72, trim);
        rect(D, u - 0.9, u + 0.9, y0 - 0.14, y0 + 0.7, 0.72, mix(IRON, F, 0.18));
        boxL(D, u - 0.92, u + 0.92, y0 + 0.7, y0 + 0.78, 0.66, 0.78, mix(IRON, trim, 0.3), { ends: true });
      } else if (T.decor.flowers && rnd() < 0.55) {
        boxL(D, u - 0.62, u + 0.62, y0 - 0.44, y0 - 0.2, 0, 0.32, C(0xa9583a), { ends: true });
        boxL(D, u - 0.6, u + 0.6, y0 - 0.2, y0 - 0.02, 0.02, 0.36, C(FLOWERS[(k + f + b.seed) % FLOWERS.length]), { ends: true });
      }
    }
    if (st.pil) for (let k = 0; k <= nb; k++) {
      const u = Math.min(L - 0.25, Math.max(0.25, sp * k));
      boxL(D, u - 0.2, u + 0.2, yb + 0.12, yb + FH, 0, 0.1, mix(trim, F, 0.35), { ends: true });
    }
  }
  // frieze under the cornice
  boxL(D, 0, L, b.h - 0.45, b.h, 0, 0.16, mix(trim, F, 0.4), { ends: true });
  if (st.neon) {
    rect(G, 0.1, L - 0.1, 3.97, 4.07, 0.21, st.neon, 2.6);
    if (b.floors >= 2 && rnd() < 0.55) {
      const u = rnd() < 0.5 ? 1.0 : L - 1.0, y0 = 5.0, y1 = 5.0 + Math.min(4.2, b.floors * 1.6);
      const nc = C(T.signs[(b.seed >> 3) % T.signs.length]);
      const q = [at(u, y0, 0.15), at(u, y0, 1.15), at(u, y1, 1.15), at(u, y1, 0.15)];
      G.quad(q[0], q[1], q[2], q[3], nc, 2.2); G.quad(q[3], q[2], q[1], q[0], nc, 2.2);
      const m = [at(u, y0 + 0.4, 0.3), at(u, y0 + 0.4, 1.0), at(u, y1 - 0.4, 1.0), at(u, y1 - 0.4, 0.3)].map((p, i) => [p[0] + (side === 'n' || side === 's' ? 0.03 : 0) * (i < 2 ? 1 : 1), p[1], p[2] + (side === 'e' || side === 'w' ? 0.03 : 0)]);
      G.quad(m[0], m[1], m[2], m[3], C(0xfff4ff), 2.4);
    }
  }

  // ground floor
  if (st.landmark) {
    for (let k = 0; k <= nb; k++) {
      const u = Math.min(L - 0.5, Math.max(0.5, sp * k));
      const p = at(u, 0, 0.55);
      D.cyl(p[0], p[2], 0.35, 3.75, 0.3, 0.26, 8, trim, { top: false });
      boxL(D, u - 0.42, u + 0.42, 0, 0.35, 0.1, 1.0, mix(trim, STONE_D, 0.3));
      boxL(D, u - 0.4, u + 0.4, 3.75, 4.0, 0.12, 0.98, trim);
    }
    boxL(D, 0, L, 3.75, 4.02, 0, 1.0, trim, { ends: true });
    for (let k = 0; k < nb; k++) {
      const u = sp * (k + 0.5), on = rnd() < litP(0.85);
      const col = on ? LIT[(k + b.seed) % 3] : GLASS;
      rect(G, u - 0.65, u + 0.65, 0.4, 2.7, 0.04, col, on ? 1.5 : 0);
      arch(G, u, 2.7, 0.65, 0.04, col, on ? 1.5 : 0);
    }
    return;
  }
  const ns = Math.max(1, Math.floor(L / 3.8));
  const sb = L / ns;
  const awn = b.awning || T.decor.flowers ? AWNINGS[b.seed % AWNINGS.length] : null;
  for (let k = 0; k < ns; k++) {
    const u = sb * (k + 0.5);
    const on = rnd() < litP(0.8);
    rect(G, u - 1.25, u + 1.25, 0.45, 3.0, 0.05, on ? LIT[(k + b.seed) % 3] : GLASS, on ? 1.6 : 0);
    rect(D, u - 1.4, u + 1.4, 0.3, 0.45, 0.06, mul(st.sign, 1.4));
    rect(D, u - 1.38, u - 1.25, 0.45, 3.0, 0.07, st.sign);
    rect(D, u + 1.25, u + 1.38, 0.45, 3.0, 0.07, st.sign);
    const sy0 = awn ? 3.5 : 3.1, sy1 = awn ? 3.95 : 3.6;
    boxL(D, u - 1.45, u + 1.45, sy0, sy1, 0, 0.12, st.sign, { ends: true });
    if (st.neon) {
      const nc = (k + b.seed) % 3 ? st.neon : C(T.signs[(b.seed + k) % T.signs.length]);
      rect(G, u - 1.1, u + 1.1, sy0 + 0.1, sy1 - 0.1, 0.13, nc, 2.6);
      rect(G, u - 1.45, u + 1.45, 3.02, 3.1, 0.14, nc, 2.2);
    } else rect(D, u - 0.85, u + 0.85, sy0 + 0.13, sy1 - 0.12, 0.125, C(0xf5d58a), T.lampsOn ? 0.9 : 0);
    if (awn) {
      const a = at(u - 1.45, 3.45, 0.02), bb = at(u + 1.45, 3.45, 0.02);
      const c = at(u + 1.45, 2.95, 1.5), d = at(u - 1.45, 2.95, 1.5);
      const col = k % 2 ? awn : mix(awn, C(0xf2ead8), 0.55);
      if (flip) G.quad(a, bb, c, d, col); else G.quad(bb, a, d, c, col);
      rect(G, u - 1.45, u + 1.45, 2.65, 2.95, 1.5, mul(awn, 0.8), 0);
    }
  }
}

const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
function bandQuad(G, a, b, c, d, col, nb, con = 0.1) {
  for (let i = 0; i < nb; i++) {
    const t0 = i / nb, t1 = (i + 1) / nb, k = (i % 2 ? 1 - con : 1) * (0.86 + 0.14 * t1);
    G.quad(lerp3(a, d, t0), lerp3(b, c, t0), lerp3(b, c, t1), lerp3(a, d, t1), mul(col, k));
  }
}
function hipRoof(G, cx, cz, y, w, d, rh, R, nb, o, con) {
  const X0 = cx - w / 2 - o, X1 = cx + w / 2 + o, Z0 = cz - d / 2 - o, Z1 = cz + d / 2 + o;
  const dark = mul(R, 0.86), side = mul(R, 0.94);
  if (w >= d) {
    const ra = [X0 + d / 2, y + rh, cz], rb = [X1 - d / 2, y + rh, cz];
    bandQuad(G, [X0, y, Z1], [X1, y, Z1], rb, ra, R, nb, con);
    bandQuad(G, [X1, y, Z0], [X0, y, Z0], ra, rb, dark, nb, con);
    bandQuad(G, [X1, y, Z1], [X1, y, Z0], rb, rb, side, nb, con);
    bandQuad(G, [X0, y, Z0], [X0, y, Z1], ra, ra, side, nb, con);
    G.box(ra[0] - 0.1, y + rh - 0.1, cz - 0.14, rb[0] + 0.1, y + rh + 0.16, cz + 0.14, mul(R, 0.62), { skip: 'b' });
  } else {
    const ra = [cx, y + rh, Z0 + w / 2], rb = [cx, y + rh, Z1 - w / 2];
    bandQuad(G, [X1, y, Z1], [X1, y, Z0], ra, rb, R, nb, con);
    bandQuad(G, [X0, y, Z0], [X0, y, Z1], rb, ra, dark, nb, con);
    bandQuad(G, [X0, y, Z1], [X1, y, Z1], rb, rb, side, nb, con);
    bandQuad(G, [X1, y, Z0], [X0, y, Z0], ra, ra, side, nb, con);
    G.box(cx - 0.14, y + rh - 0.1, ra[2] - 0.1, cx + 0.14, y + rh + 0.16, rb[2] + 0.1, mul(R, 0.62), { skip: 'b' });
  }
}

// small gabled dormer whose front sits at (px,pz) facing `side`
function dormer(G, rnd, px, y, pz, side, wallCol, roofCol, lp) {
  const alongX = side === 'n' || side === 's';
  const hw = 0.6, dep = 1.6, h = 1.3;
  const sgn = side === 's' || side === 'e' ? 1 : -1;
  const fx = alongX ? 0 : sgn, fz = alongX ? sgn : 0;
  const bx0 = alongX ? px - hw : (sgn > 0 ? px - dep : px), bx1 = alongX ? px + hw : (sgn > 0 ? px : px + dep);
  const bz0 = alongX ? (sgn > 0 ? pz - dep : pz) : pz - hw, bz1 = alongX ? (sgn > 0 ? pz : pz + dep) : pz + hw;
  G.box(bx0, y, bz0, bx1, y + h, bz1, wallCol, { skip: 'tb' });
  const ry = y + h + 0.55;
  const P = (u, v, o) => alongX ? [px + u, v, pz - sgn * o] : [px - sgn * o, v, pz + u];
  // gable roof
  const e0 = P(-hw - 0.12, y + h - 0.05, -0.15), e1 = P(hw + 0.12, y + h - 0.05, -0.15);
  const r0 = P(0, ry, -0.15), b0 = P(-hw - 0.12, y + h - 0.05, dep), b1 = P(hw + 0.12, y + h - 0.05, dep), rb = P(0, ry, dep);
  const q = (a, b2, c, d, col) => { G.quad(a, b2, c, d, col); G.quad(d, c, b2, a, col); };
  q(e0, b0, rb, r0, roofCol); q(e1, r0, rb, b1, mul(roofCol, 0.9));
  const t0 = P(-hw, y + h, 0.01), t1 = P(hw, y + h, 0.01), tt = P(0, ry - 0.08, 0.01);
  G.tri(t0, t1, tt, wallCol); G.tri(t1, t0, tt, wallCol);
  const on = rnd() < litP(lp);
  G.win = on ? rnd() + 0.001 : 0;
  const w0 = P(-0.34, y + 0.2, -0.02), w1 = P(0.34, y + 0.2, -0.02), w2 = P(0.34, y + 1.05, -0.02), w3 = P(-0.34, y + 1.05, -0.02);
  const col = on ? LIT[Math.floor(rnd() * LIT.length)] : GLASS;
  G.quad(w0, w1, w2, w3, col, on ? 1.6 : 0); G.quad(w3, w2, w1, w0, col, on ? 1.6 : 0);
  G.win = 0;
  void fx; void fz;
}

// mansard cap with a courtyard light well: four slopes up to a ridge ring, then lit walls down into the well
function wellCap(G, rnd, cx, cz, y, tw, td, capH, zinc, facade) {
  const s = Math.min(3.0, Math.min(tw, td) * 0.33);
  const X0 = cx - tw / 2, X1 = cx + tw / 2, Z0 = cz - td / 2, Z1 = cz + td / 2;
  const x0 = X0 + s, x1 = X1 - s, z0 = Z0 + s, z1 = Z1 - s, yr = y + capH;
  G.win = -2;
  G.quad([X0, y, Z1], [X1, y, Z1], [x1, yr, z1], [x0, yr, z1], zinc);
  G.quad([X1, y, Z0], [X0, y, Z0], [x0, yr, z0], [x1, yr, z0], mul(zinc, 0.86));
  G.quad([X1, y, Z1], [X1, y, Z0], [x1, yr, z0], [x1, yr, z1], mul(zinc, 0.94));
  G.quad([X0, y, Z0], [X0, y, Z1], [x0, yr, z1], [x0, yr, z0], mul(zinc, 0.94));
  G.win = 0;
  const yb = yr - 3.0, wall = mul(facade, 0.78), floor = mix(C(0x9a8a74), facade, 0.25);
  const walls = [
    [[x0, yb, z0], [x1, yb, z0], [x1, yr, z0], [x0, yr, z0]],
    [[x1, yb, z1], [x0, yb, z1], [x0, yr, z1], [x1, yr, z1]],
    [[x0, yb, z1], [x0, yb, z0], [x0, yr, z0], [x0, yr, z1]],
    [[x1, yb, z0], [x1, yb, z1], [x1, yr, z1], [x1, yr, z0]],
  ];
  for (const [a, b2, c, d] of walls) {
    G.quad(a, b2, c, d, wall);
    const L = Math.hypot(b2[0] - a[0], b2[2] - a[2]), n = Math.max(1, Math.floor(L / 2.2));
    const nx = -(b2[2] - a[2]), nz = b2[0] - a[0];
    const nl = Math.hypot(nx, nz) || 1, ox = nx / nl * 0.03, oz = nz / nl * 0.03;
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.3) / n, t1 = (k + 0.7) / n, on = rnd() < litP(0.6);
      const P = (t, yy) => [a[0] + (b2[0] - a[0]) * t + ox, yy, a[2] + (b2[2] - a[2]) * t + oz];
      G.win = on ? rnd() + 0.001 : 0;
      G.quad(P(t0, yr - 2.2), P(t1, yr - 2.2), P(t1, yr - 0.7), P(t0, yr - 0.7), on ? LIT[k % LIT.length] : GLASS, on ? 1.5 : 0);
      G.win = 0;
    }
  }
  G.quad([x0, yb, z0], [x0, yb, z1], [x1, yb, z1], [x1, yb, z0], floor);
  if ((x1 - x0) * (z1 - z0) > 9) { G.win = -8; G.blob((x0 + x1) / 2, yb + 1.3, (z0 + z1) / 2, 1.0, C(0x4d7f2f), rnd, 0.9, true); G.win = 0; }
  G.box(x0 - 0.12, yr, z0 - 0.12, x1 + 0.12, yr + 0.14, z0 + 0.04, mix(zinc, C(0xffffff), 0.2), { skip: 'b' });
  G.box(x0 - 0.12, yr, z1 - 0.04, x1 + 0.12, yr + 0.14, z1 + 0.12, mix(zinc, C(0xffffff), 0.2), { skip: 'b' });
  G.box(x0 - 0.12, yr, z0, x0 + 0.04, yr + 0.14, z1, mix(zinc, C(0xffffff), 0.2), { skip: 'b' });
  G.box(x1 - 0.04, yr, z0, x1 + 0.12, yr + 0.14, z1, mix(zinc, C(0xffffff), 0.2), { skip: 'b' });
}

function roof(G, D, rnd, b, st, x0, z0, x1, z1, h, lod) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const R = C(b.roofCol);
  const top = h + 0.5;
  if (b.roof === 'mansard' || b.roof === 'dome') {
    const mh = 3.2;
    const inset = Math.min(1.8, Math.min(w, d) * 0.2);
    const tw = w - inset * 2, td = d - inset * 2;
    const zinc = mix(R, C(0x8e8a8c), 0.3);
    G.win = -2;
    G.frustum(cx, cz, top, top + mh, w + 0.1, d + 0.1, tw, td, R, { noTop: true });
    const capH = Math.min(Math.min(tw, td) * 0.22, 1.8);
    const well = b.roof === 'mansard' && lod === 0 && tw >= 8 && td >= 7.5;
    if (well) wellCap(G, rnd, cx, cz, top + mh, tw, td, capH, zinc, C(b.facade));
    else hipRoof(G, cx, cz, top + mh, tw, td, capH, b.roof === 'dome' ? mix(R, zinc, 0.5) : zinc, 1, 0, 0);
    G.win = 0;
    if (lod === 0) {
      // balustrade on the cornice of landmarks
      if (st.landmark) {
        const bc = st.trim;
        for (const [ax0, az0, ax1, az1] of [[x0 - 0.3, z0 - 0.3, x1 + 0.3, z0 - 0.1], [x0 - 0.3, z1 + 0.1, x1 + 0.3, z1 + 0.3], [x0 - 0.3, z0 - 0.1, x0 - 0.1, z1 + 0.1], [x1 + 0.1, z0 - 0.1, x1 + 0.3, z1 + 0.1]]) {
          D.box(ax0, top, az0, ax1, top + 0.9, az1, mul(bc, 0.92), { skip: 'b', top: bc });
        }
        for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
          D.cyl(px, pz, top + 0.9, top + 1.6, 0.25, 0.25, 6, bc);
          D.cyl(px, pz, top + 1.6, top + 2.3, 0.22, 0.0, 6, GOLD, { emit: 0.15 });
        }
      }
      const yc = top + mh;
      // party-wall chimney stacks and skylights on the zinc cap
      const brick = C(0xa0583e), pot = C(0xc07a52);
      for (const side of ['n', 's', 'e', 'w']) {
        if (b.ext[side]) continue;
        const alongX = side === 'n' || side === 's';
        const L2 = alongX ? tw : td;
        const o = (alongX ? td : tw) / 2 - 0.4;
        const px = alongX ? cx : cx + (side === 'e' ? o : -o), pz = alongX ? cz + (side === 's' ? o : -o) : cz;
        const hx = alongX ? L2 * 0.32 : 0.35, hz = alongX ? 0.35 : L2 * 0.32;
        D.box(px - hx, yc - 0.3, pz - hz, px + hx, yc + 1.5, pz + hz, brick, { skip: 'b', top: C(0x5a3a30) });
        const n = Math.max(2, Math.round(L2 * 0.64 / 0.7));
        for (let k = 0; k < n; k++) {
          const t = -1 + (2 * (k + 0.5)) / n;
          const qx = alongX ? px + t * hx * 0.9 : px, qz = alongX ? pz : pz + t * hz * 0.9;
          D.cyl(qx, qz, yc + 1.5, yc + 1.95, 0.13, 0.11, 5, pot, { topCol: C(0x2a1d18) });
        }
      }
      if (tw * td > 40 && !well) {
        const nsk = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < nsk; k++) {
          const sx = cx + (rnd() - 0.5) * tw * 0.45, sz = cz + (rnd() - 0.5) * td * 0.45;
          const lit = rnd() < 0.5;
          D.box(sx - 0.8, yc, sz - 0.6, sx + 0.8, yc + capH * 0.6 + 0.4, sz + 0.6, mix(zinc, C(0xffffff), 0.15), { skip: 'b', top: lit ? C(0xffc77a) : C(0x5a6a80) });
        }
      }
      const long = tw >= td, L = long ? tw : td;
      const nch = Math.max(2, Math.floor(L / 5));
      for (let k = 0; k < nch; k++) {
        const u = -L / 2 + (L / nch) * (k + 0.5);
        const side = k % 2 ? 1 : -1;
        const off = well ? 0.5 - 1.1 / (long ? td : tw) : 0.3;
        const px = long ? cx + u : cx + side * tw * off, pz = long ? cz + side * td * off : cz + u;
        D.box(px - 0.45, top + mh - 0.2, pz - 0.3, px + 0.45, top + mh + capH * 0.7 + 1.1, pz + 0.3, C(0xa8644a), { skip: 'b', top: C(0x2e2420) });
        D.box(px - 0.55, top + mh + capH * 0.7 + 1.1, pz - 0.4, px + 0.55, top + mh + capH * 0.7 + 1.3, pz + 0.4, C(0xc8a890), { skip: 'b' });
        for (const s2 of [-0.22, 0.0, 0.22]) D.box(px + s2 - 0.06, top + mh + capH * 0.7 + 1.3, pz - 0.06, px + s2 + 0.06, top + mh + capH * 0.7 + 1.55, pz + 0.06, C(0x9a5a44), { skip: 'b' });
      }
      for (const side of ['n', 's', 'e', 'w']) {
        if (!b.ext[side]) continue;
        const L2 = side === 'n' || side === 's' ? w : d;
        const n = Math.floor((L2 - 3) / 3.4);
        for (let k = 0; k < n; k++) {
          const u = -L2 / 2 + (L2 / n) * (k + 0.5);
          const o = (side === 'n' || side === 's' ? d : w) / 2 - inset * 0.55;
          let px, pz;
          if (side === 'n' || side === 's') { px = cx + u; pz = cz + (side === 's' ? o : -o); } else { px = cx + (side === 'e' ? o : -o); pz = cz + u; }
          dormer(G, rnd, px, pz === pz ? top + 0.45 : 0, pz, side, mix(C(b.facade), C(0xffffff), 0.25), mul(R, 0.85), b.lit * 0.8);
        }
      }
    }
    if (b.roof === 'dome') {
      const r = Math.min(w, d) * 0.3;
      const y0 = top + mh + capH * 0.5;
      G.cyl(cx, cz, y0, y0 + 2.2, r, r, 16, C(b.facade), { top: false });
      if (lod === 0) for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) / 8 * Math.PI * 2;
        const px = cx + Math.cos(a) * (r + 0.02), pz = cz + Math.sin(a) * (r + 0.02);
        G.win = rnd() + 0.001;
        G.quad([px - Math.sin(a) * 0.35, y0 + 0.5, pz + Math.cos(a) * 0.35], [px + Math.sin(a) * 0.35, y0 + 0.5, pz - Math.cos(a) * 0.35], [px + Math.sin(a) * 0.35, y0 + 1.8, pz - Math.cos(a) * 0.35], [px - Math.sin(a) * 0.35, y0 + 1.8, pz + Math.cos(a) * 0.35], LIT[k % 3], 1.8);
        G.win = 0;
      }
      G.cyl(cx, cz, y0 + 2.2, y0 + 2.55, r + 0.3, r + 0.3, 16, st.trim, { topCol: R });
      G.dome(cx, y0 + 2.55, cz, r, 16, 5, R, { ribs: mix(R, GOLD, 0.3), ry: r * 1.15 });
      const yt = y0 + 2.5 + r * 1.15;
      G.cyl(cx, cz, yt, yt + 1.1, 0.5, 0.45, 8, st.trim);
      G.cyl(cx, cz, yt + 1.1, yt + 1.4, 0.65, 0.0, 8, R);
      G.cyl(cx, cz, yt + 1.3, yt + 3.0, 0.16, 0.0, 6, GOLD, { emit: 0.3 });
    }
  } else if (b.roof === 'pitched') {
    const rh = Math.min(w, d) * 0.3;
    G.win = -1;
    hipRoof(G, cx, cz, top, w, d, rh, R, 1, 0.4, 0);
    G.win = 0;
    if (lod === 0) {
      const ch = C(0x8f5240);
      for (let k = 0; k < 2; k++) {
        const px = cx + (rnd() - 0.5) * w * 0.5, pz = cz + (rnd() - 0.5) * d * 0.5;
        D.box(px - 0.35, top + rh * 0.4, pz - 0.5, px + 0.35, top + rh + 0.9, pz + 0.5, ch, { skip: 'b', top: C(0x2e2420) });
        D.box(px - 0.45, top + rh + 0.9, pz - 0.6, px + 0.45, top + rh + 1.05, pz + 0.6, C(0xc8a890), { skip: 'b' });
      }
      // dormers on the long exterior slopes
      for (const side of ['n', 's', 'e', 'w']) {
        if (!b.ext[side]) continue;
        const alongX = side === 'n' || side === 's';
        const L = alongX ? w : d, D2 = alongX ? d : w;
        if ((alongX && w < d) || (!alongX && d < w)) continue;
        const n = Math.floor((L - D2 * 0.9) / 3.6);
        const t = 1.6;
        const yy = top + rh * (t / (D2 / 2 + 0.4)) - 0.35;
        for (let k = 0; k < n; k++) {
          const u = -L / 2 + D2 * 0.45 + ((L - D2 * 0.9) / n) * (k + 0.5);
          const o = D2 / 2 + 0.4 - t;
          const px = alongX ? cx + u : cx + (side === 'e' ? o : -o), pz = alongX ? cz + (side === 's' ? o : -o) : cz + u;
          dormer(D, rnd, px, yy, pz, side, mix(C(b.facade), C(0xffffff), 0.2), mul(R, 0.8), b.lit * 0.7);
        }
      }
    }
  } else {
    const pc = mix(C(b.facade), C(0xffffff), 0.15);
    G.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 1.0, z0 + 0.3, pc, { skip: 'b' });
    G.box(x0 - 0.2, top, z1 - 0.3, x1 + 0.2, top + 1.0, z1 + 0.2, pc, { skip: 'b' });
    G.box(x0 - 0.2, top, z0 + 0.3, x0 + 0.3, top + 1.0, z1 - 0.3, pc, { skip: 'b' });
    G.box(x1 - 0.3, top, z0 + 0.3, x1 + 0.2, top + 1.0, z1 - 0.3, pc, { skip: 'b' });
    G.quad([x0 + 0.3, top + 0.2, z0 + 0.3], [x0 + 0.3, top + 0.2, z1 - 0.3], [x1 - 0.3, top + 0.2, z1 - 0.3], [x1 - 0.3, top + 0.2, z0 + 0.3], C(0x7a6e66));
    if (lod === 0) {
      // roof garden: planters round the edge, a few shrubs, a pergola and a skylight
      const soil = C(0x3e5a2a), box = C(0x8a6a50);
      const ins = 0.9;
      for (const [ax0, az0, ax1, az1] of [[x0 + ins, z0 + ins, x1 - ins, z0 + ins + 0.9], [x0 + ins, z1 - ins - 0.9, x1 - ins, z1 - ins]]) {
        D.box(ax0, top + 0.2, az0, ax1, top + 0.75, az1, box, { skip: 'b', top: soil });
        const n = Math.max(2, Math.floor((ax1 - ax0) / 1.6));
        for (let k = 0; k < n; k++) D.blob(ax0 + (ax1 - ax0) * (k + 0.5) / n, top + 1.05, (az0 + az1) / 2, 0.55, C([0x4d7f2f, 0x5a8a34, 0x3f6e2c][k % 3]), rnd, 0.8, true);
      }
      if (rnd() < 0.6) {
        const tx = cx + (rnd() - 0.5) * w * 0.3, tz = cz + (rnd() - 0.5) * d * 0.2;
        D.cyl(tx, tz, top + 0.2, top + 1.6, 0.1, 0.08, 5, C(0x4a3424));
        D.blob(tx, top + 2.3, tz, 1.1, C(0x4d7f2f), rnd, 0.85, true);
      }
      const sx = cx + w * 0.18, sz = cz;
      D.box(sx - 1.0, top + 0.2, sz - 0.7, sx + 1.0, top + 0.7, sz + 0.7, C(0xd8d0c4), { skip: 'b', top: C(0x9fc0d8) });
      if (T.decor.neon) {
        const bw2 = Math.min(w - 2, 7) / 2, by0 = top + 1.4, by1 = top + 4.4, bz = cz - d * 0.15;
        for (const px of [cx - bw2 + 0.4, cx + bw2 - 0.4]) G.box(px - 0.1, top, bz - 0.1, px + 0.1, by0, bz + 0.1, IRON);
        const c1 = C(T.signs[b.seed % T.signs.length]), c2 = C(T.signs[(b.seed + 2) % T.signs.length]);
        G.box(cx - bw2 - 0.1, by0 - 0.1, bz - 0.12, cx + bw2 + 0.1, by1 + 0.1, bz - 0.02, C(0x12121a), { skip: 's' });
        const ym = (by0 + by1) / 2;
        for (const [zz, flip] of [[bz + 0.0, false], [bz - 0.14, true]]) {
          const q = (ya, yb2, col, e) => { const p = [[cx - bw2, ya, zz], [cx + bw2, ya, zz], [cx + bw2, yb2, zz], [cx - bw2, yb2, zz]]; if (flip) G.quad(p[1], p[0], p[3], p[2], col, e); else G.quad(p[0], p[1], p[2], p[3], col, e); };
          q(ym, by1, c1, 1.9); q(by0, ym, c2, 1.9);
          const t = (ya, yb2, u0, u1) => { const p = [[cx - bw2 + u0, ya, zz + (flip ? -0.01 : 0.01)], [cx - bw2 + u1, ya, zz + (flip ? -0.01 : 0.01)], [cx - bw2 + u1, yb2, zz + (flip ? -0.01 : 0.01)], [cx - bw2 + u0, yb2, zz + (flip ? -0.01 : 0.01)]]; if (flip) G.quad(p[1], p[0], p[3], p[2], C(0xffffff), 2.6); else G.quad(p[0], p[1], p[2], p[3], C(0xffffff), 2.6); };
          t(ym + 0.35, ym + 0.95, 0.6, bw2 * 1.3); t(by0 + 0.4, by0 + 0.7, 0.6, bw2 * 0.9);
        }
      }
    }
  }
}

function building(G, D, b) {
  const rnd = mulberry(b.seed);
  const lod = b.outer ? 2 : 0;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, h = b.h;
  const F = C(b.facade);
  const st = styleOf(b);
  const base = mix(mul(F, 0.8), C(0x8a7f74), 0.3);
  const light = st.trim;
  if (lod === 2) {
    G.win = -3;
    G.box(x0, 0, z0, x1, h, z1, F, { skip: 'tb' });
    G.win = 0;
    G.box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.5, z1 + 0.3, light, { skip: 'b' });
    for (const s of ['n', 's', 'e', 'w']) {
      const facing = s === 'n' ? b.z : s === 's' ? -b.z : s === 'w' ? b.x : -b.x;
      if (facing < 0) continue;
      const L = s === 'n' || s === 's' ? x1 - x0 : z1 - z0;
      const out = (s === 's' || s === 'e') ? 1 : -1;
      const plane = s === 'n' ? z0 : s === 's' ? z1 : s === 'w' ? x0 : x1;
      const a0 = s === 'n' || s === 's' ? x0 : z0;
      const at = (u, y) => (s === 'n' || s === 's') ? [a0 + u, y, plane + out * 0.05] : [plane + out * 0.05, y, a0 + u];
      const nb = Math.max(1, Math.floor((L - 1.2) / 2.9)), sp = L / nb;
      for (let f = -1; f < b.floors; f++) {
        const y = f < 0 ? 0.5 : FLOOR0 + f * FH + 0.7, hh = f < 0 ? 2.4 : 1.6;
        for (let k = 0; k < nb; k++) {
          const u = sp * (k + 0.5), on = rnd() < litP(f < 0 ? 0.8 : b.lit), hw = f < 0 ? 1.1 : 0.5;
          const p = [at(u - hw, y), at(u + hw, y), at(u + hw, y + hh), at(u - hw, y + hh)];
          const col = on ? LIT[(k + f + 1) % LIT.length] : GLASS;
          if (s === 'n' || s === 'e') G.quad(p[1], p[0], p[3], p[2], col, on ? 1.3 : 0); else G.quad(p[0], p[1], p[2], p[3], col, on ? 1.3 : 0);
        }
      }
    }
  } else {
    G.win = -4;
    G.box(x0, 0, z0, x1, 4.0, z1, base, { skip: 'tb' });
    G.win = 0;
    G.box(x0 - 0.18, 4.0, z0 - 0.18, x1 + 0.18, 4.45, z1 + 0.18, light, { skip: 'b' });
    G.win = -3;
    G.box(x0, 4.45, z0, x1, h, z1, F, { skip: 'tb' });
    G.win = 0;
    G.box(x0 - 0.38, h, z0 - 0.38, x1 + 0.38, h + 0.5, z1 + 0.38, light, { skip: 'b' });
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      G.box(px - 0.3, 4.45, pz - 0.3, px + 0.3, h, pz + 0.3, mix(light, F, 0.2), { skip: 'tb' });
    }
    for (const s of ['n', 's', 'e', 'w']) facadeSide(G, D, rnd, b, st, s, x0, z0, x1, z1);
    // cutaway cap: hidden until the building sinks, then a tidy flat lid with a light outline of the footprint
    G.win = -6;
    const X0 = x0 - 0.2, X1 = x1 + 0.2, Z0 = z0 - 0.2, Z1 = z1 + 0.2, y = 4.5, bw = 0.5;
    const rim = mix(light, C(0xffffff), 0.35), lid = mix(mul(F, 0.42), C(0x262430), 0.45);
    const flat = (ax0, az0, ax1, az1, col) => G.quad([ax0, y, az0], [ax0, y, az1], [ax1, y, az1], [ax1, y, az0], col);
    flat(X0, Z0, X1, Z0 + bw, rim); flat(X0, Z1 - bw, X1, Z1, rim);
    flat(X0, Z0 + bw, X0 + bw, Z1 - bw, rim); flat(X1 - bw, Z0 + bw, X1, Z1 - bw, rim);
    flat(X0 + bw, Z0 + bw, X1 - bw, Z1 - bw, lid);
    G.win = 0;
  }
  roof(G, D, rnd, b, st, x0, z0, x1, z1, h, lod);
}

function lamp(G, l, rnd, halos) {
  const { x, z } = l;
  G.cyl(x, z, 0, 0.55, 0.2, 0.16, 6, IRON);
  G.cyl(x, z, 0.55, 4.3, 0.08, 0.07, 5, IRON, { top: false });
  const lantern = (lx, lz, y) => {
    G.cyl(lx, lz, y - 0.1, y, 0.12, 0.2, 6, IRON, { top: false });
    G.cyl(lx, lz, y, y + 0.55, 0.2, 0.24, 6, T.lampsOn ? C(0xffd08a) : C(0xd8d2c4), { emit: T.lampsOn ? 3.2 : 0, top: false });
    G.cyl(lx, lz, y + 0.55, y + 0.8, 0.3, 0.0, 6, IRON);
    halos.push(lx, y + 0.3, lz, l.grand ? 1.7 : 1.9);
  };
  if (l.grand) {
    G.cyl(x, z, 0.0, 0.9, 0.42, 0.32, 8, STONE_D);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      const lx = x + Math.cos(a) * 0.7, lz = z + Math.sin(a) * 0.7;
      G.box(Math.min(x, lx) - 0.04, 4.2, Math.min(z, lz) - 0.04, Math.max(x, lx) + 0.04, 4.3, Math.max(z, lz) + 0.04, IRON);
      lantern(lx, lz, 4.3);
    }
    lantern(x, z, 4.6);
  } else {
    lantern(x, z, 4.3);
  }
  if (l.banner) {
    const blue = C(0x1d3a9a), gold = GOLD;
    const o = 0.12, y0 = 2.0, y1 = 3.7, bw = 0.78;
    const pts = [[x + o, y1, z], [x + o + bw, y1, z], [x + o + bw, y0 + 0.25, z], [x + o + bw / 2, y0, z], [x + o, y0 + 0.25, z]];
    G.win = -7;
    G.poly(pts, blue); G.poly([...pts].reverse(), blue);
    const cy = (y0 + y1) / 2 + 0.15, cxx = x + o + bw / 2;
    const em = [[cxx - 0.22, cy - 0.1, z + 0.01], [cxx + 0.22, cy - 0.1, z + 0.01], [cxx + 0.26, cy + 0.2, z + 0.01], [cxx + 0.1, cy + 0.06, z + 0.01], [cxx, cy + 0.24, z + 0.01], [cxx - 0.1, cy + 0.06, z + 0.01], [cxx - 0.26, cy + 0.2, z + 0.01]];
    G.poly(em, gold, 0.4);
    const em2 = em.map((p) => [p[0], p[1], z - 0.01]).reverse();
    G.poly(em2, gold, 0.4);
    G.win = 0;
    G.box(x + o - 0.02, y1, z - 0.03, x + o + bw + 0.02, y1 + 0.06, z + 0.03, gold);
  }
}

function tree(G, t, rnd) {
  const s = t.s;
  const bark = C(0x4a3424);
  G.cyl(t.x, t.z, 0, 2.4 * s, 0.2 * s, 0.12 * s, 6, bark);
  G.cyl(t.x, t.z, 2.0 * s, 3.2 * s, 0.1 * s, 0.05 * s, 5, bark, { a0: 0.4 });
  const greens = [0x3f6e2c, 0x4d7f2f, 0x36632a, 0x5a8a34, 0x47783a];
  const g = C(greens[Math.floor(rnd() * greens.length)]);
  const parts = [[0, 3.4, 0, 1.5, 1], [0.85, 3.0, 0.35, 1.1, 0.92], [-0.7, 3.1, -0.55, 1.15, 1.02], [-0.3, 3.0, 0.8, 1.0, 0.96], [0.55, 3.2, -0.75, 1.0, 1.0], [0.1, 4.3, -0.05, 1.05, 1.12]];
  G.win = -8;
  for (const [dx, dy, dz, r, k] of parts) G.blob(t.x + dx * s, dy * s, t.z + dz * s, r * s, mul(g, k), rnd, 0.82, true);
  G.win = 0;
}

// prism of n sides between two points
function limb(G, a, b, r0, r1, n, col) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax = d.map((v) => v / L);
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
  const ul = Math.hypot(...u); u = u.map((v) => v / ul);
  const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const P = (c, r, t) => [c[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, c[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, c[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r];
  for (let k = 0; k < n; k++) {
    const t0 = k / n * Math.PI * 2, t1 = (k + 1) / n * Math.PI * 2;
    G.quad(P(a, r0, t0), P(a, r0, t1), P(b, r1, t1), P(b, r1, t0), col);
  }
}

function statueFigure(G, x, y, z, s, col) {
  const S = (dx, dy, dz) => [x + dx * s, y + dy * s, z + dz * s];
  const fold = mul(col, 0.86);
  G.cyl(x, z, y, y + 1.55 * s, 0.5 * s, 0.25 * s, 12, col, { top: false, colFn: (k) => (k % 2 ? fold : col) });
  G.cyl(x, z, y + 1.55 * s, y + 2.05 * s, 0.25 * s, 0.3 * s, 10, col, { top: false });
  G.cyl(x, z, y + 2.05 * s, y + 2.14 * s, 0.3 * s, 0.1 * s, 10, col);
  G.cyl(x, z, y + 2.1 * s, y + 2.2 * s, 0.08 * s, 0.08 * s, 6, col, { top: false });
  G.blob(x, y + 2.36 * s, z, 0.17 * s, col, mulberry(5), 1.1, true);
  // raised arm with a laurel wreath, other arm forward
  limb(G, S(0.26, 2.0, 0), S(0.42, 2.55, 0.05), 0.08 * s, 0.07 * s, 5, col);
  limb(G, S(0.42, 2.55, 0.05), S(0.48, 3.15, 0.1), 0.07 * s, 0.055 * s, 5, col);
  limb(G, S(-0.26, 2.0, 0), S(-0.4, 1.55, 0.3), 0.08 * s, 0.07 * s, 5, col);
  limb(G, S(-0.4, 1.55, 0.3), S(-0.42, 1.6, 0.7), 0.07 * s, 0.055 * s, 5, col);
  for (let k = 0; k < 10; k++) {
    const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2, R = 0.24;
    limb(G, S(0.48 + Math.cos(a0) * R, 3.4 + Math.sin(a0) * R, 0.1), S(0.48 + Math.cos(a1) * R, 3.4 + Math.sin(a1) * R, 0.1), 0.045 * s, 0.045 * s, 4, mul(col, 1.08));
  }
  // wings: three feather layers with a scalloped trailing edge
  for (const sd of [-1, 1]) {
    const W = (u, v, dz) => S(sd * u, v, -0.22 - dz);
    const layers = [
      { pts: [[0.12, 2.0], [0.7, 2.7], [1.35, 3.5], [1.7, 3.95]], n: 7, len: 0.95, col: mul(col, 0.92), dz: 0.0 },
      { pts: [[0.12, 2.05], [0.6, 2.6], [1.1, 3.15], [1.4, 3.5]], n: 6, len: 0.6, col: mul(col, 1.0), dz: 0.04 },
      { pts: [[0.12, 2.1], [0.45, 2.45], [0.8, 2.85], [1.0, 3.1]], n: 5, len: 0.35, col: mul(col, 1.08), dz: 0.08 },
    ];
    for (const Lr of layers) {
      const lead = Lr.pts;
      for (let k = 0; k < Lr.n; k++) {
        const t0 = k / Lr.n, t1 = (k + 1) / Lr.n, tm = (t0 + t1) / 2;
        const at = (t) => { const f = t * 3, i = Math.min(2, Math.floor(f)), r = f - i; return [lead[i][0] + (lead[i + 1][0] - lead[i][0]) * r, lead[i][1] + (lead[i + 1][1] - lead[i][1]) * r]; };
        const p0 = at(t0), p1 = at(t1), pm = at(tm);
        const len = Lr.len * (0.55 + 0.6 * tm);
        const tA = W(p0[0] + 0.22 * len, p0[1] - len * 0.92, Lr.dz + 0.05), tB = W(p1[0] + 0.3 * len, p1[1] - len, Lr.dz + 0.06);
        const tM = W(pm[0] + 0.3 * len, pm[1] - len * 1.08, Lr.dz + 0.06);
        const A = W(p0[0], p0[1], Lr.dz), B = W(p1[0], p1[1], Lr.dz);
        G.quad(A, B, tB, tA, Lr.col, 0.15); G.quad(tA, tB, B, A, mul(Lr.col, 0.9), 0.15);
        G.tri(tA, tB, tM, Lr.col, 0.15); G.tri(tB, tA, tM, mul(Lr.col, 0.9), 0.15);
        void pm;
      }
      const base = [W(lead[0][0], lead[0][1], Lr.dz), W(lead[3][0], lead[3][1], Lr.dz), W(lead[1][0] + 0.2, lead[1][1] - Lr.len * 0.6, Lr.dz)];
      G.tri(base[0], base[1], base[2], Lr.col, 0.15); G.tri(base[1], base[0], base[2], mul(Lr.col, 0.9), 0.15);
    }
  }
}

function fountainGeo(G, f, water, jets) {
  const { x, z, r } = f;
  if (f.kind === 'grand') {
    G.cyl(x, z, 0, 0.25, r + 1.2, r + 1.2, 24, STONE_D, { topCol: mix(STONE, STONE_D, 0.5) });
    G.basin(x, z, 0.25, 0.95, r - 0.6, r, 24, STONE, mix(STONE, C(0xffffff), 0.25));
    water.push({ x, z, r: r - 0.6, y: 0.7 });
    G.cyl(x, z, 0.25, 2.5, 1.7, 1.1, 10, STONE, { top: false });
    G.cyl(x, z, 2.3, 2.9, 1.0, 3.1, 14, STONE, { topCol: STONE });
    water.push({ x, z, r: 2.85, y: 2.92 });
    G.cyl(x, z, 2.9, 4.6, 0.75, 0.6, 8, STONE_D);
    G.cyl(x, z, 4.6, 4.8, 0.9, 0.9, 8, STONE);
    statueFigure(G, x, 4.8, z, 1.35, GOLD);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      jets.push({ x: x + Math.cos(a) * (r - 2.2), z: z + Math.sin(a) * (r - 2.2), y: 0.7, h: 2.2, r: 0.18 });
    }
    jets.push({ x, z, y: 2.9, h: 1.2, r: 1.4, ring: true });
  } else {
    G.basin(x, z, 0, 0.7, r - 0.5, r, 18, STONE, mix(STONE, C(0xffffff), 0.25));
    water.push({ x, z, r: r - 0.5, y: 0.5 });
    G.cyl(x, z, 0, 1.6, 0.5, 0.35, 8, STONE, { top: false });
    G.cyl(x, z, 1.5, 1.85, 0.35, 1.4, 10, STONE);
    water.push({ x, z, r: 1.3, y: 1.86 });
    jets.push({ x, z, y: 1.85, h: 1.9, r: 0.22 });
  }
}

function statueGeo(G, s, rnd) {
  const { x, z } = s;
  if (s.kind === 'obelisk') {
    G.box(x - 2.4, 0, z - 2.4, x + 2.4, 0.5, z + 2.4, STONE_D);
    G.box(x - 1.6, 0.5, z - 1.6, x + 1.6, 2.6, z + 1.6, STONE, { top: mul(STONE, 1.05) });
    G.frustum(x, z, 2.6, 13, 1.5, 1.5, 0.9, 0.9, C(0xe4d6b8), { noTop: true });
    G.frustum(x, z, 13, 14.2, 0.9, 0.9, 0.01, 0.01, GOLD, { emit: 0.35 });
  } else if (s.kind === 'bandstand') {
    G.cyl(x, z, 0, 0.8, 3.6, 3.6, 8, STONE, { topCol: C(0xb9a888) });
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      G.cyl(x + Math.cos(a) * 3.1, z + Math.sin(a) * 3.1, 0.8, 4.0, 0.12, 0.12, 5, C(0xf0ead8), { top: false });
    }
    G.cyl(x, z, 4.0, 4.4, 3.9, 3.9, 8, C(0xf0ead8));
    G.dome(x, 4.4, z, 3.9, 8, 3, C(0x4f8f80), { ribs: C(0x447d70), ry: 2.0 });
    G.cyl(x, z, 6.3, 7.3, 0.2, 0.0, 6, GOLD, { emit: 0.3 });
  }
}

function themed(b) {
  if (!T.facades && !T.roofs) return b;
  const fi = FACADES.indexOf(b.facade), ri = ROOFS[b.roof] ? ROOFS[b.roof].indexOf(b.roofCol) : -1;
  return { ...b, facade: T.facades && fi >= 0 ? T.facades[fi] : b.facade, roofCol: T.roofs && ri >= 0 ? T.roofs[b.roof][ri] : b.roofCol };
}

// bulbs (and festival pennants / lanterns) strung across every street between facing sidewalk lamps
function streetLights(G, map, rnd) {
  const out = [];
  const H = map.size / 2, E = map.edge;
  const bulbCols = T.decor.bunting ? [0xff4a4a, 0xffd23a, 0x4ad2ff, 0x6aff7a, 0xff7ae0, 0xffa030] : [0xffd890, 0xffc060, 0xfff0c8];
  const flagCols = [0xe0302c, 0xf2b31f, 0x2a7ae8, 0x2fb85a, 0xe85aa8, 0xffffff];
  const string = (ax, az, bx, bz, ya = 6.4, yb = 6.4) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(6, Math.round(L / 1.3));
    const sag = Math.min(1.3, L * 0.06);
    const P = (t) => [ax + (bx - ax) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
    const px = -(bz - az) / L, pz = (bx - ax) / L;
    for (let k = 0; k < n; k++) {
      const a = P(k / n), b = P((k + 1) / n);
      G.quad([a[0] - px * 0.015, a[1], a[2] - pz * 0.015], [b[0] - px * 0.015, b[1], b[2] - pz * 0.015], [b[0] + px * 0.015, b[1] + 0.03, b[2] + pz * 0.015], [a[0] + px * 0.015, a[1] + 0.03, a[2] + pz * 0.015], IRON);
      const m = P((k + 0.5) / n);
      if (T.decor.bunting) {
        G.win = -7;
        const fc = C(flagCols[k % flagCols.length]);
        const tri = [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [m[0], m[1] - 1.0, m[2]]];
        G.tri(tri[0], tri[1], tri[2], fc, 0.45); G.tri(tri[1], tri[0], tri[2], mul(fc, 0.85), 0.45);
        G.win = 0;
      }
      if (T.decor.lanterns && k % 3 === 1) {
        const lc = C([0xff4020, 0xff8a1a, 0xffc030][k % 3]);
        G.cyl(m[0], m[2], m[1] - 1.05, m[1] - 0.15, 0.3, 0.34, 6, lc, { emit: 2.4, topCol: mul(lc, 0.4) });
        continue;
      }
      if (k % 2 === 0) {
        const c = C(bulbCols[(k >> 1) % bulbCols.length]), r = 0.17;
        const y = m[1] - 0.08;
        G.tri([m[0] - r, y, m[2]], [m[0], y, m[2] + r], [m[0], y + r * 1.4, m[2]], c, 3);
        G.tri([m[0], y, m[2] + r], [m[0] + r, y, m[2]], [m[0], y + r * 1.4, m[2]], c, 3);
        G.tri([m[0] + r, y, m[2]], [m[0], y, m[2] - r], [m[0], y + r * 1.4, m[2]], c, 3);
        G.tri([m[0], y, m[2] - r], [m[0] - r, y, m[2]], [m[0], y + r * 1.4, m[2]], c, 3);
        G.tri([m[0], y, m[2] + r], [m[0] - r, y, m[2]], [m[0], y - r * 1.4, m[2]], c, 3);
        G.tri([m[0] + r, y, m[2]], [m[0], y, m[2] + r], [m[0], y - r * 1.4, m[2]], c, 3);
        out.push(m[0], y, m[2]);
      }
    }
  };
  for (const r of map.roadsX) for (const bz of map.blocksZ) {
    if (r.a < -H + E + 1 || r.b > H - E - 1) continue;
    string(r.a - 1.2, bz.c, r.b + 1.2, bz.c);
  }
  for (const r of map.roadsZ) for (const bx of map.blocksX) {
    if (r.a < -H + E + 1 || r.b > H - E - 1) continue;
    string(bx.c, r.a - 1.2, bx.c, r.b + 1.2);
  }
  // festival: a canopy of strings from a mast over the grand fountain out to the plaza edge
  const pz = map.plazas.find((p) => p.central);
  if (T.decor.bunting && pz) {
    G.cyl(pz.x, pz.z, 9.5, 12.5, 0.12, 0.08, 6, IRON, { top: false });
    for (let i = 0; i < 10; i++) {
      const a = (i + 0.5) / 10 * Math.PI * 2, rr = pz.r - 4;
      string(pz.x + Math.cos(a) * 0.4, pz.z + Math.sin(a) * 0.4, pz.x + Math.cos(a) * rr, pz.z + Math.sin(a) * rr, 12.2, 5.8);
    }
  }
  void rnd;
  return out;
}

// sunny-day market: striped stalls along the edges of the open squares, parasols with café tables
function market(G, map, rnd, props) {
  const stripes = AWNINGS;
  const stall = (x, z, rot, k) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (u, y, v) => [x + u * c - v * s, y, z + u * s + v * c];
    const box = (u0, v0, u1, v1, y0, y1, col) => {
      const p = [P(u0, 0, v0), P(u1, 0, v0), P(u1, 0, v1), P(u0, 0, v1)];
      const up = (q, y) => [q[0], y, q[2]];
      G.quad(up(p[0], y1), up(p[3], y1), up(p[2], y1), up(p[1], y1), col);
      for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; G.quad(up(b, y0), up(a, y0), up(a, y1), up(b, y1), mul(col, 0.82)); }
    };
    box(-1.2, -0.5, 1.2, 0.5, 0, 0.95, C(0x8a5a36));
    for (const [u, v] of [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.45], [1.15, 0.45]]) box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0.95, 2.3, C(0x5a3a24));
    const goods = [0xe8402a, 0xf2a020, 0x6ab03a, 0xf4e0a0, 0xc0306a];
    for (let i = 0; i < 4; i++) box(-1.0 + i * 0.52, -0.35, -0.62 + i * 0.52, 0.3, 0.95, 1.12 + (i % 2) * 0.06, C(goods[(i + k) % goods.length]));
    const sc = stripes[k % stripes.length], n = 6;
    for (let i = 0; i < n; i++) {
      const u0 = -1.35 + 2.7 * i / n, u1 = -1.35 + 2.7 * (i + 1) / n, col = i % 2 ? sc : C(0xf4ecdc);
      G.quad(P(u0, 2.3, -0.75), P(u0, 2.75, 0.0), P(u1, 2.75, 0.0), P(u1, 2.3, -0.75), mul(col, 0.92));
      G.quad(P(u1, 2.3, 0.75), P(u1, 2.75, 0.0), P(u0, 2.75, 0.0), P(u0, 2.3, 0.75), col);
    }
    props.push(x, z, 1.4);
  };
  const parasol = (x, z, k) => {
    const col = k % 2 ? AWNINGS[(k >> 1) % AWNINGS.length] : C(0xf4ecdc);
    G.cyl(x, z, 0, 2.3, 0.04, 0.04, 4, C(0x6a6a6a), { top: false });
    G.cyl(x, z, 1.9, 2.55, 1.45, 0.05, 8, col, { top: false, colFn: (i) => (i % 2 ? col : mix(col, C(0xffffff), 0.55)) });
    G.cyl(x, z, 0, 0.74, 0.5, 0.5, 6, C(0xe8e2d4), { topCol: C(0xf0ece2) });
    props.push(x, z, 0.8);
  };
  let k = 0;
  for (const p of map.plazas) {
    if (p.central) {
      const r = p.r - 9;
      for (let i = 0; i < 12; i++) {
        const a = (i + 0.5) / 12 * Math.PI * 2;
        if (Math.abs(Math.sin(2 * a)) > 0.95) continue;
        stall(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, a + Math.PI / 2, k++);
      }
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; parasol(p.x + Math.cos(a) * 21, p.z + Math.sin(a) * 21, k++); }
    } else {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, rr = p.r - 7;
        parasol(p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr, k++);
        parasol(p.x + Math.cos(a + 0.18) * (rr - 2.6), p.z + Math.sin(a + 0.18) * (rr - 2.6), k++);
      }
    }
  }
  void rnd;
}

export function buildCity(map, quality, themeObj) {
  setPalettes(themeObj || getTheme('evening'));
  const G = new GeoWriter(), D = new GeoWriter();
  const rnd = mulberry(map.seed * 31 + 7);
  const blds = [];
  let innerVerts = -1;
  for (const b of map.buildings) {
    if (b.outer && innerVerts < 0) innerVerts = G.verts;
    G.bld = D.bld = b.outer ? -1 : blds.length;
    if (!b.outer) blds.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2, top: b.h + 2, cut: 0, want: 0 });
    building(G, D, themed(b));
  }
  G.bld = D.bld = -1;
  const props = [];
  const bulbs = T.decor.lights ? streetLights(G, map, rnd) : [];
  if (T.decor.market) market(G, map, rnd, props);
  const halos = [];
  for (const l of map.lamps) lamp(G, l, rnd, halos);
  for (const t of map.trees) tree(G, t, rnd);
  const water = [], jets = [];
  for (const f of map.fountains) fountainGeo(G, f, water, jets);
  for (const s of map.statues) statueGeo(G, s, rnd);
  const FLOWERS = [0xd83a4a, 0xf0c040, 0xe86aa0, 0xf4f0e8, 0x9a5ad8].map((h) => C(h));
  for (const p of map.planters) {
    G.cyl(p.x, p.z, 0, 0.75, p.r, p.r * 0.95, 12, STONE, { topCol: C(0x3a5a26) });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, rr = p.r * 0.72;
      G.blob(p.x + Math.cos(a) * rr, 0.85, p.z + Math.sin(a) * rr, 0.32, FLOWERS[k % FLOWERS.length], rnd, 0.7);
    }
  }
  const bench = (x, z, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (u, v) => [x + u * c - v * s, z + u * s + v * c];
    const wood = C(0x7a4a2c), iron = IRON;
    const slab = (u0, v0, u1, v1, y0, y1, col) => {
      const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1);
      G.quad([a[0], y1, a[1]], [d[0], y1, d[1]], [cc[0], y1, cc[1]], [b[0], y1, b[1]], col);
      G.quad([d[0], y0, d[1]], [cc[0], y0, cc[1]], [cc[0], y1, cc[1]], [d[0], y1, d[1]], mul(col, 0.8));
      G.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], mul(col, 0.8));
    };
    slab(-0.9, -0.25, 0.9, 0.25, 0.42, 0.5, wood);
    slab(-0.9, 0.22, 0.9, 0.3, 0.5, 0.95, wood);
    slab(-0.85, -0.2, -0.75, 0.25, 0, 0.42, iron);
    slab(0.75, -0.2, 0.85, 0.25, 0, 0.42, iron);
  };
  for (const t of map.trees) {
    if (!t.street || t.s < 0.78) continue;
    const ang = Math.atan2(t.z - map.plazas[0].z, t.x - map.plazas[0].x);
    if (Math.hypot(t.x - map.plazas[0].x, t.z - map.plazas[0].z) > map.plazas[0].r * 1.2) continue;
    bench(t.x - Math.cos(ang) * 1.6, t.z - Math.sin(ang) * 1.6, ang + Math.PI / 2);
  }
  // kerbs
  const kerb = C(0xc9bda8);
  const kerbRect = (x0, z0, x1, z1) => {
    const t = 0.3, h = 0.14;
    G.box(x0, 0, z0, x1, h, z0 + t, kerb, { skip: 'b' });
    G.box(x0, 0, z1 - t, x1, h, z1, kerb, { skip: 'b' });
    G.box(x0, 0, z0 + t, x0 + t, h, z1 - t, kerb, { skip: 'b' });
    G.box(x1 - t, 0, z0 + t, x1, h, z1 - t, kerb, { skip: 'b' });
  };
  for (const b of map.blocks) if (b.kind !== 'central') kerbRect(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2);
  const bx = map.blocksX, bz = map.blocksZ;
  kerbRect(bx[1].a, bz[1].a, bx[2].b, bz[2].b);
  const H = map.size / 2, E = map.edge;
  kerbRect(-H + E - 0.3, -H + E - 0.3, H - E + 0.3, H - E + 0.3);
  const baseVerts = G.verts;
  G.append(D);
  for (let i = 0; i < blds.length; i++) if (G.tops[i] > 0) blds[i].top = G.tops[i];
  const geometry = G.build();
  // reflections draw only the base geometry, without facade/roof detail
  const reflGeometry = new THREE.BufferGeometry();
  for (const k of Object.keys(geometry.attributes)) reflGeometry.setAttribute(k, geometry.getAttribute(k));
  reflGeometry.setDrawRange(0, baseVerts);
  // lite draws the city without the facade/roof detail pass; medium reflects only the in-map buildings
  const range = (n) => { const g = new THREE.BufferGeometry(); for (const k of Object.keys(geometry.attributes)) g.setAttribute(k, geometry.getAttribute(k)); g.setDrawRange(0, n); return g; };
  const liteGeometry = range(baseVerts), reflCheap = range(innerVerts < 0 ? baseVerts : innerVerts);
  return { geometry, reflGeometry, liteGeometry, reflCheap, halos: new Float32Array(halos), water, jets, verts: G.verts, baseVerts, blds, props, bulbs };
}

const CITY_VERT = /* glsl */`
attribute vec3 color;
attribute float aEmit;
attribute float aWin;
attribute float aBld;
uniform float uFlip;
uniform float uTime;
uniform sampler2D uCut;
uniform float uCutN;
uniform float uSnow;
uniform float uWind;
varying vec3 vCol;
varying vec3 vW;
varying vec3 vN;
varying float vTag;
${shaderCommon.lightPars}
#include <fog_pars_vertex>
void main() {
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normal;
  vW = w; vN = n; vTag = min(aWin, 0.0);
  // buildings between the camera and the player's crowd sink to their ground floor under a flat lid
  bool isCap = aWin < -5.5 && aWin > -6.5;
  if (aBld > -0.5 && (w.y > 4.45 || isCap)) {
    float cut = texture2D(uCut, vec2((aBld + 0.5) / uCutN, 0.5)).r;
    if (isCap) { if (cut < 0.02) w = vec3(0.0, -500.0, 0.0); }
    else w.y = mix(w.y, 4.45, cut);
  }
  if (aWin < -6.5) {
    float sway = aWin < -7.5 ? max(w.y - 2.2, 0.0) * 0.06 : 1.0;
    float a = (0.03 + 0.2 * uWind) * sway;
    w.x += sin(uTime * (1.6 + 2.5 * uWind) + w.x * 0.35 + w.z * 0.2) * a;
    w.z += cos(uTime * (1.3 + 2.1 * uWind) + w.z * 0.31) * a * 0.6;
  }
  w.y *= uFlip;
  vec3 info = w.y < 7.0 ? sampleInfo(w.xz) : vec3(1.0, 0.0, 0.0);
  float hy = abs(w.y);
  info.b *= 1.0 - smoothstep(1.0, 7.0, hy);
  float sunVis = mix(1.0, info.r, 1.0 - smoothstep(0.0, 3.5, hy));
  vec3 L = lightAt(n, vec3(sunVis, info.g, info.b));
  float ao = n.y > 0.5 ? 1.0 : mix(0.55, 1.0, smoothstep(0.0, 6.0, hy));
  float h = clamp(hy / 22.0, 0.0, 1.0);
  vec3 base = color;
  float em = aEmit;
  if (aWin > 0.86) {
    float on = step(0.3, fract(uTime / (18.0 + aWin * 40.0) + aWin * 13.7));
    em *= on; base = mix(base * 0.1, base, on);
  } else if (aWin > 0.8) em *= 0.8 + 0.2 * sin(uTime * 7.0 + aWin * 90.0) * sin(uTime * 2.3 + aWin * 40.0);
  if (uSnow > 0.0 && em < 0.05) {
    float cover = smoothstep(0.32, 0.8, n.y) * uSnow * (aWin < -7.5 ? 0.9 : 1.0);
    base = mix(base, vec3(0.86, 0.89, 0.97), cover);
  }
  vec3 col = base * L * ao * (0.92 + 0.16 * h) + base * em;
  if (uFlip < 0.0) col = mix(col * 0.75, uReflSky, smoothstep(0.0, 9.0, hy) * 0.9);
  vCol = col;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const CITY_FRAG = /* glsl */`
uniform float uFlip;
${shaderCommon.safe}
varying vec3 vCol;
varying vec3 vW;
varying vec3 vN;
varying float vTag;
#include <fog_pars_fragment>
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// procedural tiles / slate / ashlar; returns a brightness factor, faded to its mean below pixel size
float surface(float tag, vec3 p, vec3 n) {
  vec2 hz = n.xz;
  if (dot(hz, hz) < 0.01) return 1.0;
  vec3 t = normalize(vec3(-n.z, 0.0, n.x));
  float u = dot(p, t);
  float rows = tag > -1.5 ? 3.3 : tag > -2.5 ? 4.0 : tag > -3.5 ? 2.2 : 1.8;
  float cols = tag > -1.5 ? 2.6 : tag > -2.5 ? 3.0 : 1.1;
  float v = p.y * rows;
  float row = floor(v), fv = fract(v);
  float uu = u * cols + row * 0.5, fu = fract(uu);
  float fwv = fwidth(v), fwu = fwidth(uu);
  float fade = 1.0 - smoothstep(0.2, 0.55, max(fwv, fwu * 0.6));
  float lineV = 1.0 - smoothstep(0.0, max(fwv * 1.2, 0.08), min(fv, 1.0 - fv));
  float lineU = 1.0 - smoothstep(0.0, max(fwu * 1.2, 0.03), min(fu, 1.0 - fu));
  float h = hsh(vec2(row, floor(uu)));
  float f, mean;
  if (tag > -1.5) { f = (0.74 + 0.26 * smoothstep(0.0, 0.7, fv)) * (1.0 - 0.18 * lineU) * (0.9 + 0.2 * h); mean = 0.86; }
  else if (tag > -2.5) { f = (1.0 - 0.22 * lineV) * (1.0 - 0.12 * lineU) * (0.93 + 0.14 * h); mean = 0.95; }
  else if (tag > -3.5) { f = (1.0 - 0.1 * lineV) * (1.0 - 0.06 * lineU) * (0.97 + 0.06 * h); mean = 0.98; }
  else { f = (1.0 - 0.3 * lineV) * (1.0 - 0.15 * lineU) * (0.95 + 0.1 * h); mean = 0.93; }
  return mix(mean, f, fade);
}
void main() {
  float a = 1.0;
  vec3 colIn = vCol;
  if (vTag < -0.5 && vTag > -4.5 && uFlip > 0.0) colIn *= surface(vTag, vW, normalize(vN));
  else if (vTag < -5.5 && vTag > -6.5) {
    float hv = (vW.x + vW.z) * 1.4, fw = fwidth(hv);
    float hl = 1.0 - smoothstep(0.0, max(fw, 0.05), abs(fract(hv) - 0.5) - 0.38);
    colIn *= 1.0 - 0.28 * hl * (1.0 - smoothstep(0.3, 0.7, fw));
  }
  colIn = safeTint(colIn, vW.xz);
  gl_FragColor = vec4(colIn, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createCutaway(blds) {
  const n = Math.max(1, blds.length);
  const data = new Uint8Array(n * 4);
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const uniforms = { uCut: { value: tex }, uCutN: { value: n } };
  // sample points of the crowd disc at body height; a building occludes if any ray from a point to the camera crosses its box
  const PTS = [];
  for (let k = 0; k < 20; k++) PTS.push([Math.cos(k * 0.31416), Math.sin(k * 0.31416)]);
  for (let k = 0; k < 8; k++) PTS.push([0.55 * Math.cos(k * 0.785 + 0.4), 0.55 * Math.sin(k * 0.785 + 0.4)]);
  PTS.push([0, 0]);
  const rayHits = (b, px, py, pz, dx, dy, dz) => {
    let t0 = 0, t1 = 1;
    const sl = (o, d, lo, hi) => {
      if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      return t0 <= t1;
    };
    return sl(px, dx, b.x0, b.x1) && sl(pz, dz, b.z0, b.z1) && sl(py, dy, 0, b.top);
  };
  const occludes = (b, cam, f, grow) => {
    const R = f.r * grow + (grow > 1 ? 1 : 0);
    const minX = Math.min(f.x - R, cam.x), maxX = Math.max(f.x + R, cam.x), minZ = Math.min(f.z - R, cam.z), maxZ = Math.max(f.z + R, cam.z);
    if (b.x1 < minX || b.x0 > maxX || b.z1 < minZ || b.z0 > maxZ) return false;
    for (const [u, v] of PTS) {
      const px = f.x + u * R, pz = f.z + v * R;
      if (px > b.x0 - 0.3 && px < b.x1 + 0.3 && pz > b.z0 - 0.3 && pz < b.z1 + 0.3) continue;
      if (rayHits(b, px, 1.3, pz, cam.x - px, cam.y - 1.3, cam.z - pz)) return true;
    }
    return false;
  };
  return {
    uniforms,
    update(dt, cam, focus, on) {
      let dirty = false;
      for (let i = 0; i < blds.length; i++) {
        const b = blds[i];
        b.want = on && occludes(b, cam, focus, b.want ? 1.15 : 1) ? 1 : 0;
        const c = b.cut + Math.max(-dt * 2.2, Math.min(dt * 3.2, b.want - b.cut));
        if (c !== b.cut) {
          b.cut = c;
          const s = c * c * (3 - 2 * c);
          data[i * 4] = Math.round(s * 255);
          dirty = true;
        }
      }
      if (dirty) tex.needsUpdate = true;
    },
    // is any in-map building between the camera and this disc? (ghost rings for hidden rivals)
    hidden(cam, f) {
      for (let i = 0; i < blds.length; i++) if (occludes(blds[i], cam, f, 0.8)) return true;
      return false;
    },
    snap() { for (let i = 0; i < blds.length; i++) { blds[i].cut = blds[i].want; data[i * 4] = blds[i].cut * 255; } tex.needsUpdate = true; },
  };
}

export function cityMaterial(shared, flip, cut) {
  return new THREE.ShaderMaterial({
    vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, fog: true,
    side: flip < 0 ? THREE.BackSide : THREE.FrontSide,
    uniforms: { ...fogUniforms(), ...shared, ...cut.uniforms, uFlip: { value: flip } },
  });
}
