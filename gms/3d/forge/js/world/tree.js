// Broadleaf trees: a bole with limbs, and a crown assembled from leaf-cluster cards.
// The card's geometric normal is thrown away — every crown vertex is shaded with the ellipsoid
// normal of the crown it sits in, so twenty quads read as one soft volume rather than twenty
// flat plates catching the sun at twenty different angles.

import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './textures/noise.js';
import { track } from '../engine/budget.js';
import { trackAniso } from './textures/bake.js';

export const CROWN = { mix: 0.86, up: 0.24, mottle: 0.13, alphaTest: 0.34, warp: 0.34 };

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const span = (R, a, b) => a + R() * (b - a);

// Deliberately not a CanvasTexture: uploading the element hands the shader premultiplied rgb, so
// the mip level of a thin alpha shape arrives already multiplied down to near-black while its
// alpha still clears alphaTest. getImageData is unpremultiplied, hence the DataTexture and the
// manual row flip.
export function paint(w, h, draw, label) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) px.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  bleed(px, w, h);
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  trackAniso(t);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return track(t, { w, h, fmt: 'rgba', label });
}

// Push the opaque pixels' colour out over every transparent one, so a mip only ever fades alpha.
export function bleed(px, w, h) {
  const n = w * h;
  const known = new Uint8Array(n), q = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] > 6) { known[i] = 1; q[tail++] = i; }
  while (head < tail) {
    const k = q[head++], x = k % w, y = (k / w) | 0;
    for (let e = 0; e < 4; e++) {
      const nx = x + (e === 0 ? 1 : e === 1 ? -1 : 0), ny = y + (e === 2 ? 1 : e === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (known[j]) continue;
      px[j * 4] = px[k * 4]; px[j * 4 + 1] = px[k * 4 + 1]; px[j * 4 + 2] = px[k * 4 + 2];
      known[j] = 1; q[tail++] = j;
    }
  }
}

// Three flips the interpolated normal on back faces of a DoubleSide material. Our crown normals
// are the crown's own ellipsoid normal, not the card's, so the flip is exactly wrong: it turns
// every far-side card into a black hole. Removing it makes one DoubleSide quad behave like the
// two opposite-wound quads it replaces, at half the triangles.
export function noFlip(m) {
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/, ''));
  };
  m.customProgramCacheKey = () => 'crownNoFlip';
  return m;
}

// ── the leaf atlas ──
// Four clumps of leaves. Colour is carried by the vertex ramp and the instance tint, so the paint
// is near-greyscale; what the texture owns is the ragged perimeter and the holes light comes
// through. Every leaf is a filled shape — a stroked twig is almost all antialiased edge and
// survives the mip chain only as a smudge.

const S = 256;

function leafShape(g, x, y, a, len, wid, v, t) {
  const c = Math.cos(a), s = Math.sin(a);
  const px = -s * wid, py = c * wid;
  const l = Math.min(255, v * 255);
  g.fillStyle = `rgb(${Math.round(Math.min(255, l * (1 + t)))},${Math.round(l)},${Math.round(l * (1 - t * 1.5))})`;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + c * len * 0.34 + px, y + s * len * 0.34 + py, x + c * len, y + s * len);
  g.quadraticCurveTo(x + c * len * 0.34 - px, y + s * len * 0.34 - py, x, y);
  g.fill();
}

function twig(g, x0, y0, x1, y1, w, v) {
  g.strokeStyle = `rgb(${v},${Math.round(v * 0.94)},${Math.round(v * 0.84)})`;
  g.lineCap = 'round';
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) * 0.5 + (y1 - y0) * 0.12, (y0 + y1) * 0.5, x1, y1);
  g.stroke();
}

function clump(g, ox, oy, R, o) {
  const { n, big, rx, ry, ragged, holes, gap } = o;
  const cx = ox + S * 0.5, cy = oy + S * (0.47 - gap * 0.03);
  const root = oy + S * 0.985;
  twig(g, cx, root, cx + span(R, -0.05, 0.05) * S, cy, S * 0.030, 96);
  for (let i = 0; i < 3; i++) {
    const a = -1.571 + span(R, -1.1, 1.1);
    twig(g, cx, oy + S * span(R, 0.62, 0.86), cx + Math.cos(a) * rx * S * 0.9,
      cy + Math.sin(a) * ry * S * 0.9, S * 0.018, 108);
  }
  // an angular wobble on the outline: a clump painted inside a circle stays a circle no matter how
  // many of them a crown is made of
  const p1 = R() * 6.2832, p2 = R() * 6.2832;
  const wob = a => 1 + 0.20 * Math.sin(a * 3 + p1) + 0.13 * Math.sin(a * 5 + p2);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.2832;
    const rr = Math.pow(span(R, 0.05, 1), 0.58) * (R() < ragged ? span(R, 1.02, 1.18) : 1) * wob(a);
    if (R() < gap && rr < 0.5) continue;
    const len = S * span(R, 0.062, 0.105) * big;
    // a leaf that runs off its panel is a straight cut edge, and a straight edge on a crown card
    // is the one thing that reads instantly as a flat quad
    const m = len + S * 0.02;
    const x = clamp(cx + Math.cos(a) * rx * S * rr, ox + m, ox + S - m);
    const y = clamp(cy + Math.sin(a) * ry * S * rr, oy + m, oy + S - m);
    const out = a + span(R, -0.7, 0.7);
    const v = clamp(0.62 + 0.16 * rr + span(R, -0.09, 0.09) - 0.16 * ((y - oy) / S - 0.35), 0.34, 0.94);
    leafShape(g, x, y, out, len, len * span(R, 0.34, 0.5), v, span(R, -0.05, 0.05));
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < holes; i++) {
    const a = R() * 6.2832, rr = span(R, 0.1, 0.8);
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * rx * S * rr, cy + Math.sin(a) * ry * S * rr,
      S * span(R, 0.016, 0.040), S * span(R, 0.014, 0.032), a, 0, 6.2832);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

const STYLES = [
  { n: 250, big: 1.05, rx: 0.30, ry: 0.27, ragged: 0.30, holes: 4, gap: 0.06, seed: 0x4a1f77 },
  { n: 190, big: 1.30, rx: 0.31, ry: 0.24, ragged: 0.40, holes: 6, gap: 0.14, seed: 0x91c30b },
  { n: 280, big: 0.88, rx: 0.28, ry: 0.29, ragged: 0.26, holes: 3, gap: 0.05, seed: 0x2d7ae5 },
  { n: 165, big: 1.42, rx: 0.32, ry: 0.22, ragged: 0.46, holes: 7, gap: 0.20, seed: 0x63b912 },
];

export const LEAF_TEX = paint(S * 2, S * 2, (g) => {
  for (let i = 0; i < 4; i++) {
    const o = STYLES[i];
    clump(g, (i % 2) * S, ((i / 2) | 0) * S, rng(o.seed), o);
  }
}, 'foliage:leafclump');

// uv rect of each panel, inset so a mip never drags a neighbour's alpha in
export const PANELS = [];
for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
  const x = i * S, y = j * S, m = 5, W = S * 2;
  PANELS.push({ u0: (x + m) / W, u1: (x + S - m) / W, v0: 1 - (y + S - m) / W, v1: 1 - (y + m) / W });
}

export const BARK_TEX = (() => {
  const t = paint(128, 256, (g, w, h) => {
    g.fillStyle = 'rgb(170,166,158)';
    g.fillRect(0, 0, w, h);
    const R = rng(0x7f2b91);
    for (let i = 0; i < 110; i++) {
      const x = span(R, -0.05, 1.05) * w;
      const v = (128 + R() * 100) | 0;
      g.strokeStyle = `rgba(${v},${(v * 0.97) | 0},${(v * 0.9) | 0},${span(R, 0.12, 0.42).toFixed(2)})`;
      g.lineWidth = w * span(R, 0.012, 0.055);
      g.beginPath();
      g.moveTo(x, -2);
      for (let k = 1; k <= 5; k++) g.lineTo(x + Math.sin(k * 1.7 + i) * w * 0.035, (k / 5) * (h + 4) - 2);
      g.stroke();
    }
    // fissures fade out at the seam so the vertical tile has no hard line across it
    for (let i = 0; i < 26; i++) {
      const y = span(R, 0.08, 0.92) * h;
      g.strokeStyle = `rgba(88,84,78,${(0.35 * Math.sin(Math.PI * y / h)).toFixed(2)})`;
      g.lineWidth = h * span(R, 0.004, 0.012);
      g.beginPath();
      g.moveTo(span(R, -0.1, 0.6) * w, y);
      g.lineTo(span(R, 0.4, 1.1) * w, y + span(R, -0.02, 0.02) * h);
      g.stroke();
    }
  }, 'foliage:bark');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// ── geometry ──

export const SPECIES = [
  // rx/ry are the *core* crown radii; a cluster's own length carries the outline past them
  { id: 'oak', cy: 0.56, rx: 0.25, ry: 0.155, n: 43, size: 0.26, cross: 0.9,
    trunk: 0.050, bole: 0.20, limbs: 3, droop: 0.45, lobes: 4, amp: 0.30, lean: 0.05 },
  { id: 'birch', cy: 0.67, rx: 0.17, ry: 0.20, n: 37, size: 0.21, cross: 0.9,
    trunk: 0.031, bole: 0.36, limbs: 3, droop: 0.55, lobes: 3, amp: 0.26, lean: 0.03 },
  { id: 'elm', cy: 0.62, rx: 0.205, ry: 0.19, n: 40, size: 0.235, cross: 0.9,
    trunk: 0.042, bole: 0.27, limbs: 3, droop: 0.30, lobes: 5, amp: 0.34, lean: 0.08 },
];

function lobeSet(R, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = span(R, -0.3, 0.7);
    const a = (i / n) * 6.2832 + span(R, -0.8, 0.8);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out.push([Math.cos(a) * r, y, Math.sin(a) * r, span(R, 0.4, 1.0)]);
  }
  return out;
}

function soup() {
  return { pos: [], nrm: [], uv: [], col: [], idx: [] };
}

function build(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  return g;
}

const Vd = new THREE.Vector3(), Va = new THREE.Vector3(), Vb = new THREE.Vector3();

function tube(s, rings, sides, vScale, shade) {
  const rows = [];
  let run = 0;
  for (let i = 0; i < rings.length; i++) {
    const [x, y, z, r] = rings[i];
    const a = rings[Math.max(0, i - 1)], b = rings[Math.min(rings.length - 1, i + 1)];
    Vd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    Va.set(0, 0, 1);
    if (Math.abs(Vd.z) > 0.9) Va.set(1, 0, 0);
    Vb.crossVectors(Vd, Va).normalize();
    Va.crossVectors(Vb, Vd).normalize();
    if (i > 0) run += Math.hypot(x - rings[i - 1][0], y - rings[i - 1][1], z - rings[i - 1][2]);
    rows.push(s.pos.length / 3);
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * 6.2832, c = Math.cos(th), sn = Math.sin(th);
      const nx = Va.x * c + Vb.x * sn, ny = Va.y * c + Vb.y * sn, nz = Va.z * c + Vb.z * sn;
      s.pos.push(x + nx * r, y + ny * r, z + nz * r);
      s.nrm.push(nx, ny, nz);
      s.uv.push(k / sides, run * vScale);
      const v = shade(y);
      s.col.push(v, v, v);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a0 = rows[i] + k, a1 = a0 + 1, b0 = rows[i + 1] + k, b1 = b0 + 1;
      s.idx.push(a0, b1, b0, a0, a1, b1);
    }
  }
}

// The bole is a flare, not a cylinder: the profile widens sharply in the bottom fifth and the
// vertex ramp crushes the last handspan, so it is occluded where it enters the earth. The limbs
// exist for one reason — a trunk that stops and a crown that starts somewhere above it is the
// single most common way a cheap tree fails.
export function barkGeo(sp, seed) {
  const R = rng(seed * 3571 + 17);
  const s = soup();
  const r0 = sp.trunk, bole = sp.bole, ln = sp.lean;
  const foot = y => lerp(0.5, 1, smoothstep(0, 0.09, y));
  tube(s, [[0, 0, 0, r0 * 1.9], [ln * 0.3, bole * 0.24, 0, r0 * 1.1], [ln, bole, 0, r0 * 0.72]], 5, 3.2, foot);
  const off = R() * 6.2832;
  for (let k = 0; k < sp.limbs; k++) {
    const a = off + (k / sp.limbs) * 6.2832 + span(R, -0.35, 0.35);
    const c = Math.cos(a), z = Math.sin(a);
    const y0 = bole * span(R, 0.6, 0.9);
    const out = sp.rx * span(R, 0.45, 0.85);
    const ty = sp.cy + span(R, -0.9, -0.1) * sp.ry;
    tube(s, [
      [ln * 0.8 + c * r0 * 0.5, y0, z * r0 * 0.5, r0 * 0.68],
      [ln + c * out * 0.45, lerp(y0, ty, 0.55) + span(R, 0, 0.05), z * out * 0.45, r0 * 0.42],
      [ln + c * out, ty, z * out, r0 * 0.2],
    ], 3, 3.2, foot);
  }
  return build(s);
}

// A crown is `n` leaf clusters, each a card (often a crossed pair) whose root sits somewhere in
// the crown volume and whose tip carries the outline. Roughly one in five sits deep inside, so the
// thing has an interior instead of being a hollow paper lantern.
export function crownGeo(sp, seed, ramp) {
  const R = rng(seed * 7919 + 101);
  const s = soup();
  const L = lobeSet(R, sp.lobes);
  const c = new THREE.Color();
  const dir = new THREE.Vector3(), up = new THREE.Vector3(), rt = new THREE.Vector3(), fw = new THREE.Vector3();
  const root = new THREE.Vector3(), mid = new THREE.Vector3();
  const p = new THREE.Vector3(), sn = new THREE.Vector3(), cn = new THREE.Vector3();
  // rx/ry are where cluster *roots* sit; the shading ellipsoid has to be the crown a viewer sees,
  // or normals at the top of a tall card come out near-vertical and that band blows out white.
  const ex = sp.rx + sp.size * 0.55, ey = sp.ry + sp.size * 0.5;
  const yTop = sp.cy + ey, yBot = sp.cy - ey;

  // The quad is deliberately warped into a saddle. A flat card seen edge-on collapses to a bright
  // sliver; giving its two triangles different planes means one of them always has some width.
  const quad = (o, ax, ay, w, h, y0, pn, mir, tint) => {
    const P = PANELS[pn];
    const base = s.pos.length / 3;
    Vd.crossVectors(ax, ay).normalize();
    for (let e = 0; e < 4; e++) {
      const sx = (e === 0 || e === 3) ? -0.5 : 0.5;
      const ly = e < 2 ? 0 : 1;
      p.copy(o).addScaledVector(ax, sx * w).addScaledVector(ay, (y0 + ly) * h)
        .addScaledVector(Vd, sx * (ly * 2 - 1) * w * CROWN.warp);
      s.pos.push(p.x, p.y, p.z);
      sn.set(p.x / ex, (p.y - sp.cy) / ey, p.z / ex).normalize();
      cn.copy(ax).cross(ay).normalize().lerp(sn, CROWN.mix);
      cn.y += CROWN.up;
      cn.normalize();
      s.nrm.push(cn.x, cn.y, cn.z);
      const u = (sx < 0) === !mir ? P.u0 : P.u1;
      s.uv.push(u, ly ? P.v1 : P.v0);
      const d = Math.hypot(p.x / ex, (p.y - sp.cy) / ey, p.z / ex);
      const k = clamp(0.36 * smoothstep(yBot, yTop, p.y) + 0.40 * clamp(d, 0, 1) + 0.24 * ly, 0, 1);
      ramp(k, c);
      s.col.push(c.r * tint, c.g * tint, c.b * tint);
    }
    s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < sp.n; i++) {
    const t = (i + 0.5) / sp.n;
    const dy = (1 - 2 * t) * 0.9 + 0.08;
    const rr = Math.sqrt(Math.max(0, 1 - dy * dy));
    const a = i * 2.39996 + span(R, -0.45, 0.45);
    dir.set(Math.cos(a) * rr, dy, Math.sin(a) * rr).normalize();
    let lob = 1;
    for (const [lx, ly, lz, la] of L) {
      const d = dir.x * lx + dir.y * ly + dir.z * lz;
      if (d > 0) lob += sp.amp * la * d * d;
    }
    const inner = i % 4 === 2;
    const reach = inner ? span(R, 0.0, 0.55) : span(R, 0.5, 1.18) * lob;
    root.set(dir.x * sp.rx, dir.y * sp.ry, dir.z * sp.rx).multiplyScalar(reach);
    root.y += sp.cy;
    up.copy(dir);
    up.y -= sp.droop * (0.4 + dir.y);
    up.x += span(R, -0.30, 0.30); up.y += span(R, -0.2, 0.2); up.z += span(R, -0.30, 0.30);
    up.normalize();
    rt.set(0, 1, 0);
    if (Math.abs(up.y) > 0.92) rt.set(1, 0, 0);
    fw.crossVectors(up, rt).normalize();
    rt.crossVectors(fw, up).normalize();
    const roll = span(R, 0, 6.2832);
    Va.copy(rt).multiplyScalar(Math.cos(roll)).addScaledVector(fw, Math.sin(roll)).normalize();
    Vb.crossVectors(up, Va).normalize();
    // The card standing along the cluster axis is kept short and wide: it is the one that goes
    // edge-on when the cluster points at the camera, and its height is the length of the bright
    // sliver you get when it does. The mass lives on the cross card, which is perpendicular to
    // that axis and so is broadside exactly when the other one is not.
    // clusters shrink toward the rim: a fine ragged edge over a coarse core is what makes the
    // outline read as foliage rather than as a row of equal blobs
    const sc = inner ? 0.9 : lerp(1.25, 0.78, clamp((reach - 0.55) / 0.6, 0, 1));
    const h = sp.size * span(R, 0.60, 0.92) * sc;
    const w = sp.size * span(R, 0.95, 1.35) * sc;
    const tint = 1 + CROWN.mottle * span(R, -1, 1);
    const pn = (i * 3 + (R() < 0.5 ? 1 : 0)) % 4;
    quad(root, Va, up, w, h, 0, pn, R() < 0.5, tint);
    if (!inner && R() < sp.cross) {
      mid.copy(root).addScaledVector(up, h * 0.6);
      quad(mid, Va, Vb, w * span(R, 0.95, 1.15), w * span(R, 0.95, 1.15), -0.5, (pn + 2) % 4, R() < 0.5, tint);
    }
  }
  return build(s);
}
