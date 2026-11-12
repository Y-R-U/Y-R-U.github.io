import * as THREE from 'three';
import { GeoWriter, mulberry, C, mul, mix } from './geo.js';
import { shaderCommon, fogUniforms } from './shared.js';

const GOLD = C(0xe0a838);
const STONE = C(0xcfc3ad);
const STONE_D = C(0xa89c88);
const IRON = C(0x1d2226);
const AWNINGS = [0xb3302c, 0x2d6b4b, 0x24427a, 0xd7ae52, 0x7a2f58, 0x2f5f6e].map((h) => C(h));
const LIT = [C(0xffc77a), C(0xffb05a), C(0xffd9a0), C(0xff9a48), C(0xfff0d0)];
const GLASS = C(0x1a2236);

function windowsOnSide(G, rnd, b, side, x0, z0, x1, z1, lod) {
  const F = C(b.facade);
  const frame = mix(F, C(0xfff4e0), 0.35);
  const L = side === 'n' || side === 's' ? x1 - x0 : z1 - z0;
  const out = (side === 's' || side === 'e') ? 1 : -1;
  const plane = side === 'n' ? z0 : side === 's' ? z1 : side === 'w' ? x0 : x1;
  const along0 = side === 'n' || side === 's' ? x0 : z0;
  const at = (u, y, o) => (side === 'n' || side === 's') ? [along0 + u, y, plane + out * o] : [plane + out * o, y, along0 + u];
  const rect = (u0, u1, y0, y1, o, col, emit) => {
    const a = at(u0, y0, o), bb = at(u1, y0, o), c = at(u1, y1, o), d = at(u0, y1, o);
    // orient so the normal faces outward
    const flip = (side === 'n' || side === 'e');
    if (flip) G.quad(bb, a, d, c, col, emit); else G.quad(a, bb, c, d, col, emit);
  };
  if (lod === 2) {
    for (let f = 0; f < b.floors; f++) {
      const y = 4.2 + f * 3.1 + 0.8;
      const lit = rnd() < b.lit;
      rect(1, L - 1, y, y + 1.4, 0.05, lit ? mul(LIT[f % LIT.length], 0.9) : GLASS, lit ? 1.1 : 0);
    }
    return;
  }
  const n = Math.max(1, Math.floor((L - 1.2) / 2.7));
  const sp = L / n;
  for (let f = 0; f < b.floors; f++) {
    const y = 4.2 + f * 3.1 + 0.65;
    for (let k = 0; k < n; k++) {
      const u = sp * (k + 0.5);
      rect(u - 0.72, u + 0.72, y - 0.18, y + 1.95, 0.03, frame, 0);
      const lit = rnd() < b.lit;
      const col = lit ? LIT[Math.floor(rnd() * LIT.length)] : GLASS;
      rect(u - 0.52, u + 0.52, y, y + 1.65, 0.07, col, lit ? 1.3 + rnd() * 1.3 : 0.0);
    }
  }
  // shopfronts
  const nb = Math.max(1, Math.floor(L / 3.8));
  const sb = L / nb;
  const awn = b.awning ? AWNINGS[b.seed % AWNINGS.length] : null;
  for (let k = 0; k < nb; k++) {
    const u = sb * (k + 0.5);
    const lit = rnd() < 0.8;
    rect(u - 1.25, u + 1.25, 0.45, 3.0, 0.05, lit ? LIT[(k + b.seed) % 3] : GLASS, lit ? 1.6 : 0);
    if (awn) {
      const a = at(u - 1.45, 3.45, 0.02), bb = at(u + 1.45, 3.45, 0.02);
      const c = at(u + 1.45, 2.95, 1.5), d = at(u - 1.45, 2.95, 1.5);
      const flip = (side === 'n' || side === 'e');
      const col = k % 2 ? awn : mix(awn, C(0xf2ead8), 0.55);
      if (flip) G.quad(a, bb, c, d, col); else G.quad(bb, a, d, c, col);
      rect(u - 1.45, u + 1.45, 2.65, 2.95, 1.5, mul(awn, 0.8), 0);
    }
  }
}

const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
function bandQuad(G, a, b, c, d, col, nb) {
  for (let i = 0; i < nb; i++) {
    const t0 = i / nb, t1 = (i + 1) / nb, k = (i % 2 ? 0.84 : 1) * (0.82 + 0.18 * t1);
    G.quad(lerp3(a, d, t0), lerp3(b, c, t0), lerp3(b, c, t1), lerp3(a, d, t1), mul(col, k));
  }
}
function hipRoof(G, cx, cz, y, w, d, rh, R, nb, o) {
  const X0 = cx - w / 2 - o, X1 = cx + w / 2 + o, Z0 = cz - d / 2 - o, Z1 = cz + d / 2 + o;
  const dark = mul(R, 0.84), side = mul(R, 0.93);
  if (w >= d) {
    const ra = [X0 + d / 2, y + rh, cz], rb = [X1 - d / 2, y + rh, cz];
    bandQuad(G, [X0, y, Z1], [X1, y, Z1], rb, ra, R, nb);
    bandQuad(G, [X1, y, Z0], [X0, y, Z0], ra, rb, dark, nb);
    bandQuad(G, [X1, y, Z1], [X1, y, Z0], rb, rb, side, nb);
    bandQuad(G, [X0, y, Z0], [X0, y, Z1], ra, ra, side, nb);
    G.box(ra[0] - 0.1, y + rh - 0.1, cz - 0.12, rb[0] + 0.1, y + rh + 0.14, cz + 0.12, mul(R, 0.65));
  } else {
    const ra = [cx, y + rh, Z0 + w / 2], rb = [cx, y + rh, Z1 - w / 2];
    bandQuad(G, [X1, y, Z1], [X1, y, Z0], ra, rb, R, nb);
    bandQuad(G, [X0, y, Z0], [X0, y, Z1], rb, ra, dark, nb);
    bandQuad(G, [X0, y, Z1], [X1, y, Z1], rb, rb, side, nb);
    bandQuad(G, [X1, y, Z0], [X0, y, Z0], ra, ra, side, nb);
    G.box(cx - 0.12, y + rh - 0.1, ra[2] - 0.1, cx + 0.12, y + rh + 0.14, rb[2] + 0.1, mul(R, 0.65));
  }
}

function roof(G, rnd, b, x0, z0, x1, z1, h, lod) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const R = C(b.roofCol);
  const top = h + 0.5;
  if (b.roof === 'mansard' || b.roof === 'dome') {
    const mh = 3.2;
    const inset = Math.min(1.8, Math.min(w, d) * 0.2);
    const tw = w - inset * 2, td = d - inset * 2;
    const zinc = mix(R, C(0x8e8a8c), 0.3);
    G.frustum(cx, cz, top, top + mh, w + 0.1, d + 0.1, tw, td, R, { noTop: true });
    const capH = Math.min(tw, td) * 0.28;
    hipRoof(G, cx, cz, top + mh, tw, td, capH, b.roof === 'dome' ? mix(R, zinc, 0.5) : zinc, lod === 0 ? 5 : 2, 0);
    if (lod === 0) {
      const long = tw >= td, L = long ? tw : td;
      const nch = Math.max(2, Math.floor(L / 5));
      for (let k = 0; k < nch; k++) {
        const u = -L / 2 + (L / nch) * (k + 0.5);
        const side = k % 2 ? 1 : -1;
        const px = long ? cx + u : cx + side * tw * 0.3, pz = long ? cz + side * td * 0.3 : cz + u;
        G.box(px - 0.45, top + mh - 0.2, pz - 0.3, px + 0.45, top + mh + capH * 0.7 + 1.1, pz + 0.3, C(0xa8644a), { skip: 'b', top: C(0x2e2420) });
        G.box(px - 0.55, top + mh + capH * 0.7 + 1.1, pz - 0.4, px + 0.55, top + mh + capH * 0.7 + 1.3, pz + 0.4, C(0xc8a890), { skip: 'b' });
      }
    }
    if (lod === 0) {
      for (const side of ['n', 's', 'e', 'w']) {
        if (!b.ext[side]) continue;
        const L = side === 'n' || side === 's' ? w : d;
        const n = Math.floor((L - 3) / 3.4);
        for (let k = 0; k < n; k++) {
          const u = -L / 2 + (L / n) * (k + 0.5);
          const o = (side === 'n' || side === 's' ? d : w) / 2 - inset * 0.55;
          let px, pz, hw, hd;
          if (side === 'n' || side === 's') { px = cx + u; pz = cz + (side === 's' ? o : -o); hw = 0.55; hd = 0.7; }
          else { px = cx + (side === 'e' ? o : -o); pz = cz + u; hw = 0.7; hd = 0.55; }
          G.box(px - hw, top + 0.6, pz - hd, px + hw, top + 2.1, pz + hd, mix(C(b.facade), C(0xffffff), 0.2), { top: mul(R, 0.9) });
          const lit = rnd() < b.lit * 0.8;
          const ox = side === 'e' ? hw + 0.02 : side === 'w' ? -hw - 0.02 : 0;
          const oz = side === 's' ? hd + 0.02 : side === 'n' ? -hd - 0.02 : 0;
          const wc = lit ? LIT[k % LIT.length] : GLASS, we = lit ? 1.6 : 0;
          if (side === 's') G.quad([px - 0.35, top + 0.8, pz + oz], [px + 0.35, top + 0.8, pz + oz], [px + 0.35, top + 1.8, pz + oz], [px - 0.35, top + 1.8, pz + oz], wc, we);
          if (side === 'n') G.quad([px + 0.35, top + 0.8, pz + oz], [px - 0.35, top + 0.8, pz + oz], [px - 0.35, top + 1.8, pz + oz], [px + 0.35, top + 1.8, pz + oz], wc, we);
          if (side === 'e') G.quad([px + ox, top + 0.8, pz + 0.35], [px + ox, top + 0.8, pz - 0.35], [px + ox, top + 1.8, pz - 0.35], [px + ox, top + 1.8, pz + 0.35], wc, we);
          if (side === 'w') G.quad([px + ox, top + 0.8, pz - 0.35], [px + ox, top + 0.8, pz + 0.35], [px + ox, top + 1.8, pz + 0.35], [px + ox, top + 1.8, pz - 0.35], wc, we);
        }
      }
    }
    if (b.roof === 'dome') {
      const r = Math.min(w, d) * 0.3;
      const y0 = top + mh + Math.min(tw, td) * 0.28 * 0.5;
      G.cyl(cx, cz, y0, y0 + 1.6, r, r, 12, C(b.facade), { top: false });
      G.cyl(cx, cz, y0 + 1.6, y0 + 1.95, r + 0.25, r + 0.25, 12, mix(C(b.facade), C(0xffffff), 0.3), { topCol: R });
      G.dome(cx, y0 + 1.95, cz, r, 12, 4, R, { ribs: mix(R, GOLD, 0.35), ry: r * 1.15 });
      G.cyl(cx, cz, y0 + 1.9 + r * 1.15, y0 + 2.9 + r * 1.15, 0.35, 0.3, 6, mix(C(b.facade), C(0xffffff), 0.2));
      G.cyl(cx, cz, y0 + 2.9 + r * 1.15, y0 + 4.2 + r * 1.15, 0.28, 0.0, 6, GOLD, { emit: 0.25 });
    } else if (lod === 0 && rnd() < 0.7) {
      const ch = C(0x9a5a44);
      const px = cx + (rnd() - 0.5) * (w - inset * 3), pz = cz + (rnd() - 0.5) * (d - inset * 3);
      G.box(px - 0.4, top + mh - 0.5, pz - 0.6, px + 0.4, top + mh + 1.2, pz + 0.6, ch, { skip: 'b' });
    }
  } else if (b.roof === 'pitched') {
    const rh = Math.min(w, d) * 0.42;
    hipRoof(G, cx, cz, top, w, d, rh, R, lod === 0 ? 7 : 2, 0.35);
    if (lod === 0) {
      const ch = C(0x8f5240);
      const px = cx + (rnd() - 0.5) * w * 0.5, pz = cz + (rnd() - 0.5) * d * 0.5;
      G.box(px - 0.35, top + rh * 0.4, pz - 0.5, px + 0.35, top + rh + 0.9, pz + 0.5, ch, { skip: 'b' });
    }
  } else {
    const pc = mix(C(b.facade), C(0xffffff), 0.15);
    G.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 1.0, z0 + 0.3, pc, { skip: 'b' });
    G.box(x0 - 0.2, top, z1 - 0.3, x1 + 0.2, top + 1.0, z1 + 0.2, pc, { skip: 'b' });
    G.box(x0 - 0.2, top, z0 + 0.3, x0 + 0.3, top + 1.0, z1 - 0.3, pc, { skip: 'b' });
    G.box(x1 - 0.3, top, z0 + 0.3, x1 + 0.2, top + 1.0, z1 - 0.3, pc, { skip: 'b' });
    hipRoof(G, cx, cz, top + 0.3, w - 0.6, d - 0.6, Math.min(w, d) * 0.2, C(0xb25e3c), lod === 0 ? 5 : 2, 0);
    if (lod === 0) {
      const px = cx + (rnd() - 0.5) * w * 0.4, pz = cz + (rnd() - 0.5) * d * 0.4;
      G.box(px - 0.4, top, pz - 0.3, px + 0.4, top + Math.min(w, d) * 0.2 + 1.4, pz + 0.3, C(0xa8644a), { top: C(0x2e2420), skip: 'b' });
    }
  }
}

function building(G, b) {
  const rnd = mulberry(b.seed);
  const lod = b.outer ? 2 : 0;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, h = b.h;
  const F = C(b.facade);
  const base = mix(mul(F, 0.78), C(0x8a7f74), 0.25);
  const light = mix(F, C(0xfff6e6), 0.3);
  if (lod === 2) {
    G.box(x0, 0, z0, x1, h, z1, F, { skip: 'tb' });
    G.box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.5, z1 + 0.3, light, { skip: 'b' });
  } else {
    G.box(x0, 0, z0, x1, 4.0, z1, base, { skip: 'tb' });
    G.box(x0 - 0.18, 4.0, z0 - 0.18, x1 + 0.18, 4.45, z1 + 0.18, light, { skip: 'b' });
    G.box(x0, 4.45, z0, x1, h, z1, F, { skip: 'tb' });
    G.box(x0 - 0.35, h, z0 - 0.35, x1 + 0.35, h + 0.5, z1 + 0.35, light, { skip: 'b' });
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      G.box(px - 0.3, 4.45, pz - 0.3, px + 0.3, h, pz + 0.3, light, { skip: 'tb' });
    }
  }
  const sides = ['n', 's', 'e', 'w'];
  for (const s of sides) windowsOnSide(G, rnd, b, s, x0, z0, x1, z1, lod);
  roof(G, rnd, b, x0, z0, x1, z1, h, lod);
}

function lamp(G, l, rnd, halos) {
  const { x, z } = l;
  G.cyl(x, z, 0, 0.55, 0.2, 0.16, 6, IRON);
  G.cyl(x, z, 0.55, 4.3, 0.08, 0.07, 5, IRON, { top: false });
  const lantern = (lx, lz, y) => {
    G.cyl(lx, lz, y - 0.1, y, 0.12, 0.2, 6, IRON, { top: false });
    G.cyl(lx, lz, y, y + 0.55, 0.2, 0.24, 6, C(0xffd08a), { emit: 3.2, top: false });
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
    G.poly(pts, blue); G.poly([...pts].reverse(), blue);
    const cy = (y0 + y1) / 2 + 0.15, cxx = x + o + bw / 2;
    const em = [[cxx - 0.22, cy - 0.1, z + 0.01], [cxx + 0.22, cy - 0.1, z + 0.01], [cxx + 0.26, cy + 0.2, z + 0.01], [cxx + 0.1, cy + 0.06, z + 0.01], [cxx, cy + 0.24, z + 0.01], [cxx - 0.1, cy + 0.06, z + 0.01], [cxx - 0.26, cy + 0.2, z + 0.01]];
    G.poly(em, gold, 0.4);
    const em2 = em.map((p) => [p[0], p[1], z - 0.01]).reverse();
    G.poly(em2, gold, 0.4);
    G.box(x + o - 0.02, y1, z - 0.03, x + o + bw + 0.02, y1 + 0.06, z + 0.03, gold);
  }
}

function tree(G, t, rnd) {
  const s = t.s;
  G.cyl(t.x, t.z, 0, 2.3 * s, 0.2 * s, 0.13 * s, 5, C(0x4a3424));
  const greens = [0x3f6e2c, 0x4d7f2f, 0x36632a, 0x5a8a34];
  const g = C(greens[Math.floor(rnd() * greens.length)]);
  G.blob(t.x, 3.3 * s, t.z, 1.55 * s, g, rnd, 0.85);
  G.blob(t.x + 0.8 * s, 2.9 * s, t.z + 0.3 * s, 1.1 * s, mul(g, 0.95), rnd, 0.85);
  G.blob(t.x - 0.6 * s, 3.0 * s, t.z - 0.6 * s, 1.15 * s, mul(g, 1.05), rnd, 0.85);
  G.blob(t.x + 0.1 * s, 4.2 * s, t.z - 0.1 * s, 0.95 * s, mul(g, 1.12), rnd, 0.9);
}

function statueFigure(G, x, y, z, s, col) {
  G.box(x - 0.28 * s, y, z - 0.18 * s, x + 0.28 * s, y + 1.0 * s, z + 0.18 * s, col);
  G.cyl(x, z, y, y + 0.9 * s, 0.55 * s, 0.3 * s, 8, col, { top: false });
  G.box(x - 0.34 * s, y + 1.0 * s, z - 0.2 * s, x + 0.34 * s, y + 1.75 * s, z + 0.2 * s, col);
  G.cyl(x, z, y + 1.75 * s, y + 2.15 * s, 0.17 * s, 0.17 * s, 8, col);
  G.box(x - 0.5 * s, y + 1.6 * s, z - 0.08 * s, x - 0.34 * s, y + 2.6 * s, z + 0.08 * s, col);
  G.box(x + 0.34 * s, y + 1.6 * s, z - 0.08 * s, x + 0.5 * s, y + 2.6 * s, z + 0.08 * s, col);
  G.cyl(x + 0.42 * s, z, y + 2.6 * s, y + 2.75 * s, 0.25 * s, 0.0, 5, col);
  for (const sd of [-1, 1]) {
    const w = (u, v, dz) => [x + sd * (0.2 + u) * s, y + v * s, z - (0.25 + dz) * s];
    const pts = [w(0, 1.7, 0), w(0.9, 2.9, 0.3), w(1.5, 2.4, 0.5), w(1.3, 1.6, 0.45), w(0.9, 1.1, 0.35), w(0.3, 1.2, 0.1)];
    G.poly(pts, mul(col, 1.05), 0.2); G.poly([...pts].reverse(), mul(col, 0.9), 0.2);
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

export function buildCity(map, quality) {
  const G = new GeoWriter();
  const rnd = mulberry(map.seed * 31 + 7);
  for (const b of map.buildings) building(G, b);
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
  return { geometry: G.build(), halos: new Float32Array(halos), water, jets, verts: G.verts };
}

const CITY_VERT = /* glsl */`
attribute vec3 color;
attribute float aEmit;
uniform float uFlip;
varying vec3 vCol;
varying vec3 vW;
${shaderCommon.lightPars}
#include <fog_pars_vertex>
void main() {
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normal;
  vW = w;
  w.y *= uFlip;
  vec3 info = w.y < 7.0 ? sampleInfo(w.xz) : vec3(1.0, 0.0, 0.0);
  float hy = abs(w.y);
  info.b *= 1.0 - smoothstep(1.0, 7.0, hy);
  float sunVis = mix(1.0, info.r, 1.0 - smoothstep(0.0, 3.5, hy));
  vec3 L = lightAt(n, vec3(sunVis, info.g, info.b));
  float ao = n.y > 0.5 ? 1.0 : mix(0.55, 1.0, smoothstep(0.0, 6.0, hy));
  float h = clamp(hy / 22.0, 0.0, 1.0);
  vec3 col = color * L * ao * (0.92 + 0.16 * h) + color * aEmit;
  if (uFlip < 0.0) col = mix(col * 0.75, uReflSky, smoothstep(0.0, 9.0, hy) * 0.9);
  vCol = col;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const CITY_FRAG = /* glsl */`
uniform vec4 uFocus;
uniform float uFlip;
varying vec3 vCol;
varying vec3 vW;
${shaderCommon.bayer}
#include <fog_pars_fragment>
void main() {
  if (uFocus.w > 0.5 && uFlip > 0.0 && vW.y > 5.5 && vW.y < cameraPosition.y - 0.5) {
    vec3 d = vW - cameraPosition;
    vec3 g = cameraPosition + d * (cameraPosition.y / max(cameraPosition.y - vW.y, 0.001));
    float dist = length(g.xz - uFocus.xy);
    float keep = mix(0.22, 1.0, smoothstep(uFocus.z * 0.8, uFocus.z * 1.05, dist));
    if (bayer4(gl_FragCoord.xy) > keep) discard;
  }
  gl_FragColor = vec4(vCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function cityMaterial(shared, flip) {
  return new THREE.ShaderMaterial({
    vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, fog: true,
    side: flip < 0 ? THREE.BackSide : THREE.FrontSide,
    uniforms: { ...fogUniforms(), ...shared, uFlip: { value: flip } },
  });
}
