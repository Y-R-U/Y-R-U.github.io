/* ═══════════════════════════════════════════════════════════════════════════
   BUILDING A FISH OUT OF NOTHING
   No models, no textures. A species is a silhouette function plus a pattern
   function. Geometry carries extra attributes the shader swims it with:
     aSeg    0 at the snout, 1 at the tail tip  → body wave envelope
     aFin    which moving part this vertex is   → per-fin animation
     aPivot  the hinge that part rotates about
     aGlow   bioluminescence, added to emissive at night
     color   RGBA — alpha under 1 makes a fin translucent, which is most of
             the difference between this and a plastic toy
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp, smooth, vnoise, TAU } from '../util.js';

export const FIN = {
  BODY: 0, PECT_L: 1, PECT_R: 2, CAUDAL: 3, DORSAL: 4,
  RIGID: 5, TENT: 6, PELV_L: 7, PELV_R: 8, BARBEL: 9,
};

/* ── silhouette ──────────────────────────────────────────────────────────── */
function fullness(prof, t) {
  switch (prof) {
    case 'disc': { const c = clamp((t - 0.42) / 0.54, -1.5, 1.5); return Math.sqrt(Math.max(0, 1 - c * c)); }
    case 'round': { const c = clamp((t - 0.44) / 0.56, -1.5, 1.5); return Math.pow(Math.max(0, 1 - c * c), 0.46); }
    case 'tall': { const c = clamp((t - 0.38) / 0.60, -1.5, 1.5); return Math.pow(Math.max(0, 1 - c * c), 0.62); }
    case 'boxy': return Math.pow(Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), 0.66)), 0.46);
    case 'eel':  return Math.pow(Math.sin(Math.PI * clamp(t * 0.9 + 0.06, 0, 1)), 0.22);
    default: { const c = clamp((t - 0.34) / 0.64, -1.5, 1.5); return Math.pow(Math.max(0, 1 - c * c), 0.55); }
  }
}
/** Half-height and half-width at body fraction t (0 snout → 1 tail base). */
export function profile(B, t) {
  t = clamp(t, 0, 1);
  const snoutR = lerp(0.40, 0.05, B.snout);
  const head = smooth(0, 0.24, t);
  const ped = 1 - smooth(0.70, 1.0, t) * (B.prof === 'eel' ? 0.35 : 0.90);
  const base = fullness(B.prof, t);
  const r = lerp(snoutR, 1, head) * base * ped;
  const y = Math.max(r * B.h * 0.5, 0.006);
  let z = Math.max(Math.pow(r, B.prof === 'disc' ? 1.5 : 0.98) * B.w * 0.43, 0.005);
  return [y, z];
}
/** Where the body centreline sits, so a fish is not a tube. */
export function centreline(B, t) {
  const belly = (B.belly ?? 0.5) - 0.5;
  return -Math.sin(Math.PI * clamp(t, 0, 1)) * B.h * (0.05 + belly * 0.22);
}

/* ── colour patterns ─────────────────────────────────────────────────────── */
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
/** Returns [r, g, b, a, glow] for a point on the fish.
    t along the body, ny 0 (belly) → 1 (back), nz -1..1 across, isFin flag. */
export function patternAt(sp, t, ny, nz, isFin, fu = 0, fv = 0) {
  const p = sp.pal;
  const body = _c1.setHex(p.body), belly = _c2.setHex(p.belly);
  let r = body.r, g = body.g, b = body.b, a = 1, glow = 0;
  const blend = (hex, k) => { if (k <= 0) return; const q = _c2.setHex(hex); r = lerp(r, q.r, k); g = lerp(g, q.g, k); b = lerp(b, q.b, k); };

  /* countershading — dark back, pale belly. Every fish alive has this. */
  const bk = clamp((0.55 - ny) * 1.15, 0, 1);
  r = lerp(r, belly.r, bk * 0.82); g = lerp(g, belly.g, bk * 0.82); b = lerp(b, belly.b, bk * 0.82);
  const top = clamp((ny - 0.38) * 1.35, 0, 1);
  r *= 1 - top * 0.32; g *= 1 - top * 0.30; b *= 1 - top * 0.24;

  if (isFin) {
    /* the ray and membrane detail is done per pixel in fish.js; here we only
       set the base tint and how see-through the fin is to begin with */
    blend(p.fin, 0.82);
    a = sp.finAlpha ?? 0.62;
  }

  switch (p.pattern) {
    case 'neon': {
      if (!isFin) {
        const band = Math.exp(-Math.pow((ny - 0.62) / 0.13, 2)) * smooth(0.05, 0.28, t);
        blend(p.accent, band * 0.97); glow += band * 0.6;
        const red = Math.exp(-Math.pow((ny - 0.34) / 0.15, 2)) * smooth(0.42, 0.62, t) * (1 - smooth(0.93, 1, t));
        blend(p.accent2, red * 0.96); glow += red * 0.28;
      }
      break;
    }
    case 'bars': {
      const n = sp.id === 'barb' ? 4 : 5;
      let bar = 0;
      for (let i = 0; i < n; i++) bar = Math.max(bar, Math.exp(-Math.pow((t - (0.12 + i * (0.74 / (n - 1)))) / 0.052, 2)));
      blend(p.accent, bar * (isFin ? 0.5 : 0.9));
      if (sp.id === 'barb' && !isFin) blend(p.accent2, clamp((ny - 0.62) * 1.7, 0, 1) * 0.4);
      break;
    }
    case 'stripes': {
      const s = Math.abs(Math.sin((ny - 0.1) * Math.PI * 4.2));
      blend(p.accent, clamp(s - 0.35, 0, 1) * 1.4 * (isFin ? 0.35 : 1));
      blend(p.accent2, clamp((ny - 0.82) * 4, 0, 1) * 0.35);
      break;
    }
    case 'bands': {
      let bar = 0;
      for (let i = 0; i < 11; i++) bar = Math.max(bar, Math.exp(-Math.pow((t - (0.05 + i * 0.088)) / 0.026, 2)));
      blend(p.accent, bar * 0.92);
      break;
    }
    case 'clown': {
      let band = 0;
      band = Math.max(band, Math.exp(-Math.pow((t - 0.19) / 0.052, 2)));
      band = Math.max(band, Math.exp(-Math.pow((t - 0.48) / 0.072, 2)));
      band = Math.max(band, Math.exp(-Math.pow((t - 0.81) / 0.048, 2)));
      blend(p.accent2, clamp((band - 0.05) * 1.7, 0, 1) * 0.88);
      blend(p.accent, clamp((band - 0.26) * 3.4, 0, 1) * 0.98);
      if (isFin) blend(p.accent2, clamp((fu - 0.62) * 2.8, 0, 1) * 0.8);
      break;
    }
    case 'lionbars': {
      let bar = 0;
      for (let i = 0; i < 9; i++) bar = Math.max(bar, Math.exp(-Math.pow((t - (0.05 + i * 0.104)) / 0.029, 2)));
      blend(p.accent, bar * 0.92);
      if (isFin) {
        const strip = Math.abs(Math.sin((fu * 5.5 + fv * 7.5) * 3.1));
        blend(p.accent, clamp(strip - 0.28, 0, 1) * 1.5);
        blend(p.accent2, clamp(0.25 - strip, 0, 1) * 1.1);
      }
      break;
    }
    case 'speckle': {
      const s = vnoise(t * 30, ny * 24 + nz * 9);
      blend(p.accent, clamp((s - 0.60) * 3.2, 0, 1) * 0.85);
      blend(p.accent2, clamp((0.30 - s) * 2.0, 0, 1) * 0.3);
      break;
    }
    case 'mottle': {
      const s = vnoise(t * 7 + 3, ny * 6);
      blend(p.accent, clamp((s - 0.5) * 2.4, 0, 1) * 0.82);
      blend(p.accent2, clamp((0.46 - s) * 2.6, 0, 1) * 0.72);
      if (isFin) blend(p.accent, clamp((vnoise(fu * 8, fv * 8) - 0.4) * 2, 0, 1) * 0.6);
      break;
    }
    case 'gradient': {
      blend(p.accent, clamp((t - 0.32) * 1.5, 0, 1) * 0.72);
      blend(p.accent2, clamp((0.40 - t) * 1.5, 0, 1) * 0.5);
      break;
    }
    case 'rainbow': {
      /* electric blue over the head and shoulders, burnt orange behind the
         midpoint, and a hard-edged join that moves as the light does */
      const k = smooth(0.46, 0.68, t);
      blend(p.fin, k * 0.88);
      blend(p.accent, clamp((t - 0.72) * 3.0, 0, 1) * 0.8);
      blend(p.accent2, clamp((0.34 - t) * 2.6, 0, 1) * 0.75);
      const scale = Math.abs(Math.sin(t * 52 + ny * 18));
      blend(0xffffff, clamp(scale - 0.84, 0, 1) * 0.7);
      break;
    }
    case 'gramma': {
      const k = smooth(0.40, 0.56, t);
      blend(p.fin, k * 0.95);
      blend(p.accent, clamp((t - 0.62) * 2.0, 0, 1) * 0.5);
      if (!isFin) { const spot = Math.exp(-Math.pow((t - 0.30) / 0.05, 2)) * Math.exp(-Math.pow((ny - 0.86) / 0.09, 2));
        blend(0x120a1e, spot); }
      break;
    }
    case 'mandarin': {
      const w = vnoise(t * 9 + ny * 3, ny * 7 + t * 2);
      blend(p.fin, clamp((w - 0.46) * 3.4, 0, 1) * 0.95);
      blend(p.accent, clamp((0.40 - w) * 3.0, 0, 1) * 0.85);
      const swirl = Math.sin(t * 22 + ny * 12 + Math.sin(t * 8) * 3);
      blend(p.accent2, clamp(swirl - 0.55, 0, 1) * 0.9);
      blend(0x0a2438, clamp(Math.abs(swirl) - 0.92, 0, 1) * 2);
      break;
    }
    case 'discus': {
      let bar = 0;
      for (let i = 0; i < 8; i++) bar = Math.max(bar, Math.exp(-Math.pow((t - (0.06 + i * 0.115)) / 0.026, 2)));
      blend(p.accent2, bar * 0.55);
      const wave = Math.sin(ny * 24 + t * 9) * 0.5 + 0.5;
      blend(p.accent, clamp(wave - 0.55, 0, 1) * (isFin ? 1.4 : 0.72));
      blend(p.belly, clamp((0.34 - ny) * 2.0, 0, 1) * 0.5);
      break;
    }
    case 'rings': {
      const ring = Math.abs(Math.sin(t * 30));
      blend(p.accent, clamp(ring - 0.62, 0, 1) * 1.8);
      blend(p.accent2, clamp((vnoise(t * 14, ny * 10) - 0.55) * 3, 0, 1) * 0.5);
      break;
    }
    case 'lamp': {
      blend(p.accent2, 0.42);
      const lamp = Math.exp(-Math.pow((t - 0.135) / 0.085, 2)) * Math.exp(-Math.pow((ny - 0.56) / 0.17, 2));
      blend(p.accent, Math.min(1, lamp * 1.4));
      glow += lamp * 3.2;
      const line = Math.exp(-Math.pow((ny - 0.5) / 0.05, 2)) * smooth(0.22, 0.5, t);
      blend(p.accent, line * 0.3); glow += line * 0.3;
      break;
    }
    case 'spiral': {
      const s = Math.sin(t * 26 + ny * 4);
      blend(p.accent, clamp(s - 0.3, 0, 1) * 1.1);
      blend(p.accent2, clamp(-s - 0.5, 0, 1) * 0.6);
      break;
    }
    case 'stripe': {
      blend(p.accent, Math.exp(-Math.pow((ny - 0.88) / 0.09, 2)) * 0.95);
      blend(p.accent2, Math.exp(-Math.pow((ny - 0.2) / 0.12, 2)) * 0.5);
      break;
    }
    case 'jelly': {
      blend(p.accent, clamp((0.5 - ny) * 1.2, 0, 1) * 0.7);
      glow += 0.55 + 0.5 * clamp(1 - ny, 0, 1);
      blend(p.accent2, clamp(vnoise(t * 8, ny * 8) - 0.45, 0, 1) * 0.9);
      a = 0.52;
      break;
    }
  }
  glow += (sp.glow || 0) * 0.2;
  return [r, g, b, a, glow];
}

/* ── geometry buffer ─────────────────────────────────────────────────────── */
export class Buf {
  constructor() { this.p = []; this.c = []; this.s = []; this.f = []; this.pv = []; this.gl = []; this.uv = []; this.i = []; }
  vert(x, y, z, col, seg, fin, pv, fu = 0, fv = 0) {
    this.p.push(x, y, z);
    this.c.push(col[0], col[1], col[2], col[3] ?? 1);
    this.s.push(seg); this.f.push(fin); this.gl.push(col[4] || 0);
    this.pv.push(pv[0], pv[1], pv[2]);
    this.uv.push(fu, fv);
    return this.p.length / 3 - 1;
  }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  tri(a, b, c) { this.i.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(this.c, 4));
    g.setAttribute('aSeg',     new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aFin',     new THREE.Float32BufferAttribute(this.f, 1));
    g.setAttribute('aGlow',    new THREE.Float32BufferAttribute(this.gl, 1));
    g.setAttribute('aPivot',   new THREE.Float32BufferAttribute(this.pv, 3));
    g.setAttribute('aFinUV',   new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
export const Z3 = [0, 0, 0];

export function ball(G, cx, cy, cz, r, col, seg, fin, rings = 7, segs = 9) {
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI, row = [];
    for (let j = 0; j < segs; j++) {
      const b = (j / segs) * TAU;
      row.push(G.vert(cx + r * Math.sin(a) * Math.cos(b), cy + r * Math.cos(a),
                      cz + r * Math.sin(a) * Math.sin(b), col, seg, fin, Z3));
    }
    idx.push(row);
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      G.quad(idx[i][j], idx[i][j2], idx[i + 1][j2], idx[i + 1][j]);
    }
}

/** A flat ribbon of fin. fn(u,v) returns a point plus pattern coordinates. */
export function ribbon(G, sp, nu, nv, fn, finId, pivot, segFn) {
  const grid = [];
  for (let iu = 0; iu <= nu; iu++) {
    const u = iu / nu, row = [];
    for (let iv = 0; iv <= nv; iv++) {
      const v = iv / nv;
      const q = fn(u, v);
      const col = patternAt(sp, q.t ?? 0.8, q.ny ?? 0.7, q.nz ?? 0, true, u, v);
      row.push(G.vert(q.x, q.y, q.z, col, segFn ? segFn(u, v) : (q.t ?? 0.8), finId, pivot, u, v));
    }
    grid.push(row);
  }
  for (let iu = 0; iu < nu; iu++)
    for (let iv = 0; iv < nv; iv++)
      G.quad(grid[iu][iv], grid[iu][iv + 1], grid[iu + 1][iv + 1], grid[iu + 1][iv]);
}
