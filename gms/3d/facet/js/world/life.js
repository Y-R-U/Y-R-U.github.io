// Life: the villagers, animals, props, warm light and motion that make the diorama inhabited.

import * as THREE from 'three';
import {
  Mesh, prism, spire, blob, loft, ringCircle, ringRect, smooth, matrix, mix, shade, rgb,
} from './shape.js';

const TAU = Math.PI * 2;
let S = null;

// ── the mover swarm ──────────────────────────────────────────────────────────────────────────
// Everything that animates lives in one of these. A swarm is a single merged BufferGeometry with
// a per-part slice of it; each frame a part's base vertices are pushed through a matrix straight
// into the attribute. Fourteen villagers, thirty animals and a flock of birds therefore cost one
// draw call between them, which is the only way any of this fits in the budget.

class Swarm {
  constructor(cls, { shadow = true } = {}) {
    this.cls = cls; this.shadow = shadow;
    this.P = []; this.N = []; this.C = []; this.parts = [];
  }

  add(geo) {
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const c = geo.attributes.color.array;
    const part = {
      start: this.P.length / 3, n: p.length / 3, swarm: this,
      base: new Float32Array(p), baseN: new Float32Array(n), baseC: new Float32Array(c),
      flat: false,
    };
    for (let i = 0; i < p.length; i++) { this.P.push(p[i]); this.N.push(n[i]); this.C.push(c[i]); }
    geo.dispose();
    this.parts.push(part);
    return part;
  }

  build(materials) {
    if (!this.parts.length) return null;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.Float32BufferAttribute(this.P, 3);
    this.nor = new THREE.Float32BufferAttribute(this.N, 3);
    this.col = new THREE.Float32BufferAttribute(this.C, 3);
    for (const a of [this.pos, this.nor, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('color', this.col);
    this.mesh = new THREE.Mesh(g, materials[this.cls]);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.shadow;
    this.mesh.receiveShadow = this.shadow;
    this.pa = this.pos.array; this.na = this.nor.array; this.ca = this.col.array;
    this.P = this.N = this.C = null;
    return this.mesh;
  }

  write(part, m, deform) {
    if (!this.pa) return;
    const e = m.elements, b = part.base, bn = part.baseN, pa = this.pa, na = this.na;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i += 3) {
      let x = b[i], y = b[i + 1], z = b[i + 2];
      if (deform) { const d = deform(x, y, z); x = d[0]; y = d[1]; z = d[2]; }
      pa[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pa[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pa[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (!part.flat) {
        const nx = bn[i], ny = bn[i + 1], nz = bn[i + 2];
        const ax = e[0] * nx + e[4] * ny + e[8] * nz;
        const ay = e[1] * nx + e[5] * ny + e[9] * nz;
        const az = e[2] * nx + e[6] * ny + e[10] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        na[o] = ax / l; na[o + 1] = ay / l; na[o + 2] = az / l;
      }
      o += 3;
    }
    if (part.flat) this.reface(part);
  }

  // A deformed part's baked normals no longer describe it, so its faces get their normal back
  // from the cross product. Only cloth needs this, and cloth is a few hundred triangles.
  reface(part) {
    const pa = this.pa, na = this.na;
    for (let o = part.start * 3, end = (part.start + part.n) * 3; o < end; o += 9) {
      const ux = pa[o + 3] - pa[o], uy = pa[o + 4] - pa[o + 1], uz = pa[o + 5] - pa[o + 2];
      const vx = pa[o + 6] - pa[o], vy = pa[o + 7] - pa[o + 1], vz = pa[o + 8] - pa[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let j = 0; j < 9; j += 3) { na[o + j] = nx; na[o + j + 1] = ny; na[o + j + 2] = nz; }
    }
  }

  tint(part, col) {
    if (!this.ca) return;
    const k = rgb(col), ca = this.ca;
    for (let o = part.start * 3, end = (part.start + part.n) * 3; o < end; o += 3) {
      ca[o] = k[0]; ca[o + 1] = k[1]; ca[o + 2] = k[2];
    }
  }

  scaleColor(part, f) {
    if (!this.ca) return;
    const b = part.baseC, ca = this.ca;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i++) ca[o++] = b[i] * f;
  }

  flush(colors = false) {
    if (!this.mesh) return;
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    if (colors) this.col.needsUpdate = true;
  }
}

// ── local kit ────────────────────────────────────────────────────────────────────────────────
// Things shape.js has no opinion about. shape.block() is 64 triangles; a crate does not need 64.

// Chamfered, tapered, never-cubic box. 32 triangles.
function boxy(w, h, d, { cut = 0.05, taper = 0.1, col = '#ffffff', lean = 0 } = {}) {
  const k = 1 - taper;
  return loft([
    ringRect(w, d, 0, cut),
    ringRect(w * k, d * k, h, cut).map(p => [p[0] + lean * h, p[1], p[2]]),
  ], { col });
}

function barrelGeo(r, h, wood, hoop) {
  const belly = [0.84, 1.0, 1.03, 0.9];
  const rings = belly.map((s, i) => ringCircle(9, r * s, (i / (belly.length - 1)) * h, 0.2));
  return loft(rings, {
    col: (ri, fi, t) => (ri === 1 ? shade(hoop, 0.06) : shade(wood, -0.08 + t * 0.3 + (fi % 3) * 0.05)),
  });
}

// Hangs from y=0 down, runs along +X. Flags and laundry both.
function clothGeo(w, h, nx, ny, colFn) {
  const m = new Mesh();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = (i / nx) * w, x1 = ((i + 1) / nx) * w;
      const y0 = -(j / ny) * h, y1 = -((j + 1) / ny) * h;
      m.quad([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], colFn(i, j));
    }
  }
  return m.geo();
}

// Five-point stations lofted bow to stern. The taper is in the station width, so no ring is
// ever the same size as its neighbour and the hull cannot present a box.
function hullGeo(len, beam, dep, { hull, deck, rim }) {
  const m = new Mesh();
  const N = 6, secs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const b = (beam / 2) * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.max(0.04, t))), 0.5);
    const d = dep * (0.5 + 0.5 * Math.sin(Math.PI * t));
    const x = (t - 0.5) * len + Math.sin(t * Math.PI) * 0.04;
    secs.push([[x, 0, b], [x, -d * 0.5, b * 0.66], [x, -d, 0], [x, -d * 0.5, -b * 0.66], [x, 0, -b]]);
  }
  for (let i = 0; i < N; i++) {
    const a = secs[i], b = secs[i + 1];
    for (let k = 0; k < 4; k++) m.quad(a[k], a[k + 1], b[k + 1], b[k], shade(hull, -0.06 + k * 0.08));
  }
  for (let i = 0; i < N; i++) {
    const a = secs[i], b = secs[i + 1];
    const inner = i > 0 && i < N - 1;
    m.quad(a[0], b[0], b[4], a[4], shade(inner ? deck : hull, inner ? -0.3 : 0.06));
    for (const s of [0, 4]) {
      const la = [a[s][0], 0.075, a[s][2]], lb = [b[s][0], 0.075, b[s][2]];
      if (s === 0) m.quad(a[s], b[s], lb, la, shade(rim, 0.1));
      else m.quad(b[s], a[s], la, lb, shade(rim, 0.1));
    }
  }
  return m.geo();
}

// The architecture module's wall anchors come with a yaw in ctx.place()'s convention. Under it the
// local frame is +X out of the wall, +Y up, +Z along the wall — so everything that has to sit on a
// facade gets modelled once, flat, and is placed by that yaw alone.
const outX = ry => Math.cos(ry);
const outZ = ry => -Math.sin(ry);

// Corners in one rotational order so a band between two of them always winds toward +X.
function faceRect(x, y0, y1, z0, z1) {
  return [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
}

function faceBand(m, inner, outer, col) {
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.quad(inner[i], outer[i], outer[j], inner[j], col);
  }
}

// An unlit colour at a fraction of full emission. Everything in the glow class is authored
// this way, because the class skips tone mapping and so the number IS the screen value.
const emit = (c, f) => { const k = rgb(c); return [k[0] * f, k[1] * f, k[2] * f]; };

function fenceGeo(len, n, { post, rail, h = 0.95, rng }) {
  const m = new Mesh();
  const step = len / n;
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + i * step + (rng() - 0.5) * step * 0.16;
    const ph = h * (0.9 + rng() * 0.22);
    m.add(prism(5, 0.062, 0.045, ph, { rot: rng() * TAU, col: shade(post, -0.1 + rng() * 0.2) }),
      matrix({ pos: [x, 0, 0], rz: (rng() - 0.5) * 0.1 }));
  }
  for (const [y, t] of [[h * 0.72, 0.055], [h * 0.36, 0.05]]) {
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + i * step, x1 = x0 + step;
      const sag = 0.035 + rng() * 0.03;
      m.add(boxy(step * 1.02, t, t * 1.5, { cut: 0.012, taper: 0.12, col: shade(rail, -0.05 + rng() * 0.18) }),
        matrix({ pos: [(x0 + x1) / 2, y - sag, 0], rz: (rng() - 0.5) * 0.05 }));
    }
  }
  return m.geo();
}

// ── placement ────────────────────────────────────────────────────────────────────────────────

function spot(ctx, { cx, cz, rMin = 0, rMax, clear = 1.2, tries = 46, slope = 0.36, minWet = 0.4 }) {
  const { rng, terrain } = ctx;
  for (let i = 0; i < tries; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * (rMax - rMin) + rMin;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!terrain.inBounds(x, z, 4)) continue;
    if (terrain.heightAt(x, z) < terrain.waterY + minWet) continue;
    if (terrain.slopeAt(x, z) > slope) continue;
    if (!ctx.free(x, z, clear)) continue;
    return { x, z };
  }
  return null;
}

// Four seeds in a ring round the green, each one a themed knot of props. Scatter that is uniform
// over the whole square reads as litter; 60% of the objects inside 20% of the ground reads as a
// place where people keep their things.
function seedRing(ctx, C, themes) {
  const { rng, terrain } = ctx;
  const out = [];
  const spin = rng() * TAU;
  for (let i = 0; i < themes.length; i++) {
    const a = spin + (i / themes.length) * TAU + (rng() - 0.5) * 0.5;
    for (let k = 0; k < 10; k++) {
      const r = 4.0 + k * 0.85 + rng() * 1.2;
      const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
      if (!terrain.inBounds(x, z, 6)) continue;
      if (terrain.heightAt(x, z) < terrain.waterY + 0.8) continue;
      if (terrain.slopeAt(x, z) > 0.3) continue;
      if (!ctx.free(x, z, 2.4)) continue;
      out.push({ x, z, a, theme: themes[i] });
      break;
    }
  }
  return out;
}

const seedOf = (seeds, theme, fb) => seeds.find(s => s.theme === theme) || seeds[0] || fb;

// Warm bounce baked into whatever stands near a light. Free at runtime, and the reason a lantern
// at dusk looks like it is lighting something rather than being a bright dot.
function warmBake(geo, x, y, z) {
  if (S.lit < 0.03 || !S.lights.length) return geo;
  const pos = geo.attributes.position.array, col = geo.attributes.color.array;
  const w = rgb(S.p.lit.warm);
  for (let i = 0; i < pos.length; i += 9) {
    const cx = x + (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
    const cy = y + (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
    const cz = z + (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
    let f = 0;
    for (const L of S.lights) {
      const d = Math.hypot(L.x - cx, L.y - cy, L.z - cz);
      if (d < L.r) { const k = 1 - d / L.r; f += k * k * L.s; }
    }
    if (f < 0.004) continue;
    f = Math.min(0.6, f * S.lit);
    for (let j = 0; j < 9; j += 3) {
      col[i + j] += (w[0] - col[i + j]) * f;
      col[i + j + 1] += (w[1] - col[i + j + 1]) * f;
      col[i + j + 2] += (w[2] - col[i + j + 2]) * f;
    }
  }
  return geo;
}

function put(ctx, geo, o = {}) {
  const y = (o.y ?? ctx.terrain.heightAt(o.x || 0, o.z || 0)) - (o.sink || 0);
  warmBake(geo, o.x || 0, y, o.z || 0);
  ctx.place(geo, o);
  if (o.claim) ctx.occupy(o.x || 0, o.z || 0, o.claim, 'life');
}

// ── paths ────────────────────────────────────────────────────────────────────────────────────

function makePath(pts) {
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { pts, cum, len: cum[cum.length - 1] };
}

const _s = { x: 0, z: 0, yaw: 0 };
function sampleP(path, u) {
  const L = path.len;
  u = ((u % L) + L) % L;
  let i = 0;
  while (i < path.pts.length - 1 && path.cum[i + 1] < u) i++;
  const a = path.pts[i], b = path.pts[(i + 1) % path.pts.length];
  const seg = Math.max(1e-4, path.cum[i + 1] - path.cum[i]);
  const t = (u - path.cum[i]) / seg;
  _s.x = a[0] + (b[0] - a[0]) * t;
  _s.z = a[1] + (b[1] - a[1]) * t;
  _s.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return _s;
}

// Walks the radius in and out from the wanted one and keeps the driest, flattest, unclaimed
// candidate. Without this a loop of a fixed radius marches half the village into the millpond.
function ringPath(ctx, cx, cz, r, n) {
  const { rng, terrain } = ctx;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const want = r * (0.85 + 0.25 * Math.sin(a * 2.3 + 1.1) + rng() * 0.14);
    let best = null;
    for (let k = 0; k < 22; k++) {
      const rr = Math.max(2.2, want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (!terrain.inBounds(x, z, 5)) continue;
      const dry = terrain.heightAt(x, z) - terrain.waterY;
      const score = Math.min(dry, 3) * 2 - terrain.slopeAt(x, z) * 4 - Math.abs(rr - want) * 0.12
        + (ctx.free(x, z, 0.8) ? 1.5 : 0);
      if (!best || score > best.score) best = { x, z, score };
      if (dry > 1.2 && terrain.slopeAt(x, z) < 0.3 && ctx.free(x, z, 0.8) && k > 2) break;
    }
    pts.push(best ? [best.x, best.z] : [cx + Math.cos(a) * want, cz + Math.sin(a) * want]);
  }
  return makePath(pts);
}

function adoptPaths(ctx) {
  const raw = ctx.village.paths;
  if (!Array.isArray(raw) || !raw.length) return [];
  const out = [];
  for (const line of raw) {
    const src = Array.isArray(line) ? line : line?.pts || line?.points;
    if (!Array.isArray(src) || src.length < 3) continue;
    const pts = src.map(q => (Array.isArray(q) ? [q[0], q.length > 2 ? q[2] : q[1]] : [q.x, q.z]))
      .filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (pts.length >= 3) out.push(makePath(pts));
  }
  return out;
}

// ── villagers ────────────────────────────────────────────────────────────────────────────────

function villagerParts(p, rng, v) {
  const skin = mix(p.build.wall[0], '#c98a5e', 0.66);
  const parts = [];
  const hem = v.skirt ? 0.32 : 0.205;
  const shoulder = v.stout ? 0.27 : 0.235;

  const torso = loft([
    ringCircle(7, hem, 0.60, 0.25),
    ringCircle(7, hem * (v.skirt ? 0.58 : 0.86), 0.94, 0.4),
    ringCircle(7, shoulder, 1.20, 0.55),
    ringCircle(7, 0.112, 1.39, 0.7),
  ], { col: (ri, fi, t) => shade(mix(v.cloth, v.cloth2, Math.min(1, t * 1.3)), -0.16 + t * 0.3 + (fi % 3) * 0.04) });
  parts.push({ geo: torso, off: [0, 0, 0], role: 'body' });

  for (const side of [-1, 1]) {
    const leg = new Mesh()
      .add(prism(5, 0.078, 0.058, 0.60, { rot: rng() * TAU, col: shade(v.legs, -0.1) }),
        matrix({ pos: [0, -0.60, 0] }))
      .add(prism(5, 0.085, 0.062, 0.11, { rot: 0.6, squash: 0.72, col: shade(p.build.woodDark[0], 0.06) }),
        matrix({ pos: [0, -0.62, 0.035] }))
      .geo();
    parts.push({ geo: leg, off: [side * 0.098, 0.62, 0], role: 'leg', side });
  }

  for (const side of [-1, 1]) {
    const arm = new Mesh()
      .add(prism(5, 0.058, 0.042, 0.40, { rot: rng() * TAU, col: shade(v.cloth2, 0.04) }),
        matrix({ pos: [0, -0.40, 0] }))
      .add(prism(5, 0.05, 0.036, 0.09, { rot: 1.1, col: shade(skin, -0.04) }),
        matrix({ pos: [0, -0.47, 0] }))
      .geo();
    if (v.tool && side === 1) {
      const t = new Mesh()
        .add(prism(5, 0.032, 0.024, 1.15, { col: shade(p.build.wood[2], 0.05) }), matrix({ pos: [0, -0.5, 0] }));
      if (v.tool === 'rake') {
        t.add(boxy(0.34, 0.05, 0.05, { cut: 0.012, col: p.build.metal[0] }), matrix({ pos: [0, 0.62, 0] }));
      } else {
        t.add(prism(7, 0.05, 0.02, 0.13, { col: p.build.metal[1] }), matrix({ pos: [0, 0.63, 0] }));
      }
      parts.push({ geo: t.geo(), off: [side * 0.235, 1.18, 0], role: 'arm', side, tilt: -0.28 });
      continue;
    }
    parts.push({ geo: arm, off: [side * 0.235, 1.18, 0], role: 'arm', side });
  }

  const head = new Mesh()
    .add(blob(0.132, 0, { jitter: 0.1, stretch: 1.16, squash: 0.94, rng, col: skin }), null);
  if (v.hair) head.add(blob(0.128, 0, { jitter: 0.13, stretch: 0.72, rng, col: v.hair }),
    matrix({ pos: [0, 0.055, -0.012] }));
  parts.push({ geo: head.geo(), off: [0, 1.51, 0], role: 'head' });

  if (v.hat === 'brim') {
    const h = new Mesh()
      .add(prism(9, 0.255, 0.215, 0.045, { rot: 0.3, col: shade(v.hatCol, -0.14) }), null)
      .add(prism(7, 0.155, 0.085, 0.17, { rot: 0.9, col: shade(v.hatCol, 0.1) }), matrix({ pos: [0, 0.03, 0] }))
      .geo();
    parts.push({ geo: h, off: [0, 1.61, 0], role: 'head' });
  } else if (v.hat === 'hood') {
    parts.push({ geo: spire(7, 0.175, 0.30, { curve: 1.35, rings: 2, col: shade(v.hatCol, -0.02) }), off: [0, 1.47, 0], role: 'head' });
  } else if (v.hat === 'cap') {
    parts.push({
      geo: prism(7, 0.16, 0.085, 0.15, { rot: 0.4, col: shade(v.hatCol, 0.06) }),
      off: [0, 1.6, 0], role: 'head',
    });
  }
  return parts;
}

function villagerKit(p, rng) {
  const wood = p.build.wood, dark = p.build.woodDark, b = p.build;
  const kinds = [
    { cloth: b.thatch[1], cloth2: b.thatch[0], legs: dark[0], hat: 'brim', hatCol: b.thatch[0], tool: 'rake', hair: dark[2], scale: 1.0 },
    { cloth: mix(p.flora.canopyAlt[0], b.wall[1], 0.3), cloth2: p.flora.canopyAlt[2], legs: dark[1], skirt: true, hat: 'hood', hatCol: b.wall[1], hair: wood[2], scale: 0.96 },
    { cloth: b.roof[1], cloth2: b.roof[0], legs: dark[0], hat: 'cap', hatCol: p.accent, scale: 0.66, hair: dark[2] },
    { cloth: b.wallAlt[1], cloth2: b.wallAlt[0], legs: dark[2], stout: true, hat: 'brim', hatCol: b.trim[0], hair: b.stone[1], scale: 1.06 },
    { cloth: b.roofAlt[0], cloth2: b.roofAlt[2], legs: dark[1], hat: 'cap', hatCol: b.roofAlt[1], tool: 'staff', scale: 1.02, hair: dark[2] },
    { cloth: b.wall[1], cloth2: mix(b.wall[2], b.roof[0], 0.35), legs: wood[2], skirt: true, hat: null, hair: wood[0], scale: 0.93 },
    { cloth: mix(b.stone[1], p.water.deep, 0.3), cloth2: b.stone[2], legs: dark[2], hat: 'hood', hatCol: b.stone[0], scale: 0.99, hair: b.stone[1] },
    { cloth: mix(b.roof[0], b.thatch[1], 0.5), cloth2: wood[0], legs: dark[0], hat: 'brim', hatCol: b.thatch[2], hair: dark[1], scale: 0.9 },
  ];
  return kinds.map(k => ({ ...k, parts: villagerParts(p, rng, k) }));
}

// ── animals ──────────────────────────────────────────────────────────────────────────────────

function legsOf(rng, col, { n = 4, r = 0.045, h = 0.3, spanX = 0.2, spanZ = 0.12 } = {}) {
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const sx = i < 2 ? 1 : -1, sz = i % 2 ? 1 : -1;
    m.add(prism(5, r, r * 0.72, h, { rot: rng() * TAU, capTop: false, capBottom: false, col: shade(col, -0.05 + rng() * 0.16) }),
      matrix({ pos: [sx * spanX, 0, sz * spanZ], rz: sx * 0.05, rx: sz * 0.04 }));
  }
  return m.geo();
}

function animalKit(p, rng) {
  const K = {};
  const dark = p.build.woodDark;

  {
    const wool = p.build.wall[0];
    const body = smooth(blob(0.36, 0, { jitter: 0.2, stretch: 0.66, squash: 0.82, rng, col: wool }));
    K.sheep = {
      h: 0.62, scale: 1,
      parts: [
        { geo: legsOf(rng, dark[0], { h: 0.36, spanX: 0.2, spanZ: 0.11, r: 0.042 }), off: [0, 0.36, 0] },
        { geo: body, off: [0, 0.62, 0] },
        {
          geo: new Mesh()
            .add(blob(0.13, 0, { jitter: 0.14, stretch: 1.1, rng, col: shade(dark[1], 0.02) }), null)
            .add(prism(5, 0.055, 0.04, 0.1, { col: shade(dark[2], 0.05) }), matrix({ pos: [0, -0.03, 0.1], rx: 1.3 }))
            .add(prism(5, 0.035, 0.012, 0.09, { col: shade(dark[1], -0.05) }), matrix({ pos: [0.1, 0.03, 0], rz: -1.1 }))
            .add(prism(5, 0.035, 0.012, 0.09, { col: shade(dark[1], -0.05) }), matrix({ pos: [-0.1, 0.03, 0], rz: 1.1 }))
            .geo(),
          off: [0, 0.66, 0.3], role: 'head',
        },
        { geo: prism(5, 0.03, 0.012, 0.13, { col: shade(wool, -0.12) }), off: [0, 0.66, -0.32], role: 'tail', rest: [0.5, 0, 0] },
      ],
    };
  }

  {
    const hide = mix(p.build.wall[0], p.build.wood[0], 0.25);
    K.cow = {
      h: 0.82, scale: 1,
      parts: [
        { geo: legsOf(rng, dark[1], { h: 0.5, spanX: 0.3, spanZ: 0.16, r: 0.055 }), off: [0, 0.5, 0] },
        {
          geo: smooth(blob(0.46, 0, { jitter: 0.17, stretch: 0.6, squash: 0.72, rng, col: hide })),
          off: [0, 0.86, 0],
        },
        {
          geo: new Mesh()
            .add(prism(7, 0.15, 0.1, 0.26, { rot: 0.4, col: shade(hide, -0.06) }), matrix({ pos: [0, -0.13, 0], rx: 0.35 }))
            .add(prism(5, 0.09, 0.07, 0.1, { col: shade(dark[2], 0.1) }), matrix({ pos: [0, 0.03, 0.15], rx: 1.35 }))
            .add(prism(5, 0.03, 0.008, 0.13, { col: p.build.wall[1] }), matrix({ pos: [0.1, 0.12, -0.02], rz: -0.9 }))
            .add(prism(5, 0.03, 0.008, 0.13, { col: p.build.wall[1] }), matrix({ pos: [-0.1, 0.12, -0.02], rz: 0.9 }))
            .geo(),
          off: [0, 0.92, 0.42], role: 'head',
        },
        { geo: prism(5, 0.028, 0.012, 0.42, { col: shade(dark[1], 0.05) }), off: [0, 0.95, -0.44], role: 'tail', rest: [0.25, 0, 0] },
      ],
    };
  }

  const hen = b => ({
    h: 0.26, scale: 1,
    parts: [
      { geo: legsOf(rng, p.build.thatch[2], { n: 2, h: 0.14, spanX: 0.05, spanZ: 0, r: 0.018 }), off: [0, 0.14, 0] },
      {
        geo: new Mesh()
          .add(smooth(blob(0.14, 0, { jitter: 0.13, stretch: 0.86, squash: 0.82, rng, col: b })), null)
          .add(prism(5, 0.075, 0.012, 0.16, { col: shade(b, -0.18) }), matrix({ pos: [0, 0.03, -0.1], rx: -1.0 }))
          .geo(),
        off: [0, 0.25, 0],
      },
      {
        geo: new Mesh()
          .add(blob(0.065, 0, { jitter: 0.1, stretch: 1.1, rng, col: shade(b, 0.04) }), null)
          .add(prism(5, 0.022, 0.004, 0.055, { col: p.build.thatch[0] }), matrix({ pos: [0, 0, 0.05], rx: 1.5 }))
          .add(prism(5, 0.03, 0.01, 0.05, { col: p.build.roof[0] }), matrix({ pos: [0, 0.05, 0.01] }))
          .geo(),
        off: [0, 0.35, 0.09], role: 'head',
      },
    ],
  });
  K.hen = hen(mix(p.build.wall[0], p.build.thatch[1], 0.4));
  K.hen2 = hen(mix(p.build.wood[1], p.build.thatch[2], 0.45));

  {
    const fur = p.build.wood[0];
    K.dog = {
      h: 0.4, scale: 1,
      parts: [
        { geo: legsOf(rng, shade(fur, -0.16), { h: 0.24, spanX: 0.16, spanZ: 0.07, r: 0.03 }), off: [0, 0.24, 0] },
        { geo: smooth(blob(0.2, 0, { jitter: 0.16, stretch: 0.62, squash: 0.68, rng, col: fur })), off: [0, 0.4, 0] },
        {
          geo: new Mesh()
            .add(blob(0.095, 0, { jitter: 0.12, stretch: 1.0, rng, col: shade(fur, 0.06) }), null)
            .add(prism(5, 0.045, 0.028, 0.1, { col: shade(fur, -0.2) }), matrix({ pos: [0, -0.02, 0.07], rx: 1.4 }))
            .add(prism(5, 0.03, 0.008, 0.08, { col: shade(fur, -0.24) }), matrix({ pos: [0.055, 0.06, 0], rz: -0.5 }))
            .add(prism(5, 0.03, 0.008, 0.08, { col: shade(fur, -0.24) }), matrix({ pos: [-0.055, 0.06, 0], rz: 0.5 }))
            .geo(),
          off: [0, 0.46, 0.2], role: 'head',
        },
        { geo: prism(5, 0.032, 0.012, 0.22, { col: shade(fur, 0.1) }), off: [0, 0.44, -0.2], role: 'tail', rest: [-0.8, 0, 0] },
      ],
    };
  }

  {
    const coat = mix(p.build.wood[0], p.ground.dirt[0], 0.5);
    K.deer = {
      h: 0.78, scale: 1,
      parts: [
        { geo: legsOf(rng, shade(coat, -0.2), { h: 0.5, spanX: 0.18, spanZ: 0.1, r: 0.032 }), off: [0, 0.5, 0] },
        { geo: smooth(blob(0.3, 0, { jitter: 0.15, stretch: 0.6, squash: 0.66, rng, col: coat })), off: [0, 0.82, 0] },
        {
          geo: new Mesh()
            .add(prism(5, 0.075, 0.05, 0.34, { col: shade(coat, 0.03) }), matrix({ pos: [0, -0.3, -0.06], rx: 0.28 }))
            .add(blob(0.088, 0, { jitter: 0.1, stretch: 1.2, rng, col: shade(coat, 0.07) }), null)
            .add(prism(5, 0.045, 0.026, 0.11, { col: shade(coat, -0.16) }), matrix({ pos: [0, -0.02, 0.07], rx: 1.35 }))
            .add(prism(5, 0.02, 0.006, 0.2, { col: p.build.trim[0] }), matrix({ pos: [0.05, 0.06, -0.02], rz: -0.35, rx: -0.3 }))
            .add(prism(5, 0.02, 0.006, 0.16, { col: p.build.trim[0] }), matrix({ pos: [-0.05, 0.06, -0.02], rz: 0.45, rx: -0.2 }))
            .geo(),
          off: [0, 1.14, 0.24], role: 'head',
        },
        { geo: prism(5, 0.028, 0.01, 0.1, { col: p.build.wall[1] }), off: [0, 0.86, -0.28], role: 'tail', rest: [0.4, 0, 0] },
      ],
    };
  }

  {
    const feather = mix(p.build.trim[0], p.build.stone[0], 0.35);
    const wing = s => new Mesh()
      .quad([0, 0, 0], [s * 0.34, 0.02, -0.1], [s * 0.4, 0.01, 0.03], [0, 0, 0.07], shade(feather, 0.12))
      .quad([0, 0, 0.07], [s * 0.4, 0.01, 0.03], [s * 0.34, 0.02, -0.1], [0, 0, 0], shade(feather, -0.16))
      .geo();
    K.bird = {
      h: 0, scale: 1,
      parts: [
        {
          geo: new Mesh()
            .add(prism(5, 0.05, 0.016, 0.3, { col: shade(feather, -0.05) }), matrix({ pos: [0, 0, -0.14], rx: 1.5708 }))
            .geo(),
          off: [0, 0, 0],
        },
        { geo: wing(1), off: [0.03, 0.01, 0], role: 'wing', side: 1 },
        { geo: wing(-1), off: [-0.03, 0.01, 0], role: 'wing', side: -1 },
      ],
    };
  }
  return K;
}

// ── populate ─────────────────────────────────────────────────────────────────────────────────

export function populate(ctx) {
  const { p, rng, terrain } = ctx;
  const life = ctx.life ?? 1;
  if (life <= 0) { S = null; return; }

  const litI = p.lit.intensity ?? 0;
  S = {
    // `lit` says the lanterns are burning; `night` says the sun has actually gone. Autumn and
    // frost light their lamps in daylight, and an unlit warm wash painted on a sunlit wall reads
    // as soot — every wide glow below keys off `night`, every small flame off `lit`.
    t: 0, p, lit: litI, night: p.lit.night ?? Math.max(0, Math.min(1, (litI - 0.45) / 0.55)), rng,
    height: (x, z) => terrain.heightAt(x, z),
    lights: [], villagers: [], animals: [], birds: [], smoke: [], cloth: [], lamps: [], bobs: [],
    movers: new Swarm('solid'),
    drape: new Swarm('foliage'),
    // Smoke and flame share the unlit class: a lit smoke plume is driven to white by a 2.35
    // intensity sun no matter what colour you give it, and unlit is what lets it match the fog.
    glow: new Swarm('glow', { shadow: false }),
  };

  const C = ctx.village.centre || { x: 4, z: 2 };
  const shore = { x: -26, z: 30 };
  const den = n => Math.max(1, Math.round(n * life * (0.75 + (ctx.scatter ?? 1) * 0.25)));

  const seeds = seedRing(ctx, C, ['market', 'hearth', 'store', 'wash']);
  const at = t => seedOf(seeds, t, { x: C.x + 5, z: C.z + 4, a: 0 });
  S.seeds = seeds;

  // Lights are chosen before anything is placed, because every static prop bakes their bounce.
  const hearth = at('hearth');
  const fire = spot(ctx, { cx: hearth.x, cz: hearth.z, rMax: 1.6, clear: 1.0, tries: 20 })
    || { x: hearth.x, z: hearth.z };
  S.lights.push({ x: fire.x, y: terrain.heightAt(fire.x, fire.z) + 0.5, z: fire.z, r: 8.5, s: 1.15, pool: 2, fw: 3.1, fp: 0.4 });

  const lampSpots = [];
  for (let i = 0; i < den(4); i++) {
    const src = seeds.length ? seeds[i % seeds.length] : C;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 1.6, rMax: 4.4, clear: 1.5 });
    if (!s) continue;
    lampSpots.push(s);
    S.lights.push({ x: s.x, y: terrain.heightAt(s.x, s.z) + 2.05, z: s.z, r: 6.4, s: 0.9, pool: 2, fw: 0.9 + rng(), fp: rng() * 6 });
    ctx.occupy(s.x, s.z, 0.55, 'life');
  }

  const doors = plotDoors(ctx);
  for (const d of doors) {
    S.lights.push({
      x: d.x, y: d.y + 1.2, z: d.z, r: 5.4, s: 0.72,
      px: d.x + outX(d.ry) * 1.15, pz: d.z + outZ(d.ry) * 1.15,
      pool: 2, fw: 1.3 + rng(), fp: rng() * 6,
    });
  }

  const wins = planWindows(ctx);
  for (const w of wins) {
    S.lights.push({
      x: w.x + outX(w.ry) * 0.5, y: w.y, z: w.z + outZ(w.ry) * 0.5,
      r: 3.6 + w.k * 1.4, s: 0.42 * w.k * S.night,
      px: w.x + outX(w.ry) * 1.1, pz: w.z + outZ(w.ry) * 1.1,
      pool: w.sill < 2.4 ? 2 : (w.sill < 3.4 ? 1 : 0), fw: 0.6 + rng(), fp: rng() * 6,
    });
  }

  buildMarket(ctx, at('market'), den);
  buildYardProps(ctx, at('store'), at('market'), den);
  buildFire(ctx, fire);
  buildOven(ctx, at('hearth'));
  buildLamps(ctx, lampSpots);
  buildDoorLamps(ctx, doors);
  buildLaundry(ctx, at('wash'));
  buildBanners(ctx, C, seeds);
  buildPaddock(ctx, C, den);
  buildShore(ctx, shore, den);
  buildPeople(ctx, C, seeds, den);
  buildBirds(ctx, C, den);
  buildWindows(ctx, wins);
  buildSmoke(ctx, fire, doors);
  lightPools(ctx);

  for (const sw of [S.movers, S.drape, S.glow]) {
    const mesh = sw.build(ctx.materials);
    if (mesh) ctx.dynamic(mesh);
  }
  update(0, null);
}

// The door anchor carries its own facing yaw; the plot's is the building's, which is only the same
// thing when the door happens to be on face 2.
function plotDoors(ctx) {
  const out = [];
  for (const plot of ctx.village.plots || []) {
    const d = plot.door || plot.entrance;
    const q = Array.isArray(d)
      ? { x: d[0], y: d[1], z: d[2], ry: d[3] }
      : d && { ...d, ry: d.ry ?? d.rot };
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.z)) continue;
    out.push({
      x: q.x, z: q.z,
      ry: Number.isFinite(q.ry) ? q.ry : (plot.ry ?? plot.rot ?? 0),
      y: Number.isFinite(q.y) ? q.y : ctx.terrain.heightAt(q.x, q.z),
    });
  }
  return out;
}

// A ring of ground that the light lands on. Unlit, because a lit one cannot be brighter than the
// light reaching it and at dusk that is almost nothing — the same reason the flames are unlit.
// Follows the terrain per vertex so it creases over a slope instead of shearing through it.
function poolGeo(ctx, x, z, r, k) {
  const { terrain, p, rng } = ctx;
  const m = new Mesh();
  const N = 11, rot = rng() * TAU;
  const y = (px, pz) => terrain.heightAt(px, pz) + 0.1;
  const ring = rr => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = rot + (i / N) * TAU;
      const d = rr * (0.82 + rng() * 0.36);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      out.push([px, y(px, pz), pz]);
    }
    return out;
  };
  const hue = mix(p.lit.warm, p.ground.path[0], 0.36);
  const c = [x, y(x, z), z];
  let prev = null;
  for (const [g, f] of POOL) {
    const rg = ring(r * g);
    const col = emit(hue, k * f);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (prev) m.quad(prev[i], prev[j], rg[j], rg[i], col);
      else m.tri(c, rg[j], rg[i], col);
    }
    prev = rg;
  }
  return m.geo();
}

const POOL = [[0.24, 0.048], [0.45, 0.034], [0.66, 0.021], [0.83, 0.0105], [1.0, 0.003]];

// The ground half of the bounce, done twice over. The terrain bake — `occupy` with a negative `ao`
// runs its contact-darkening pass backwards — is free and lands on the real triangulation, but the
// architecture module paves a yard apron over the ground it matters most on, so anything standing
// on that gets a pool of geometry as well. Last thing in the module, because a claim is a claim and
// would otherwise push props away from every lit doorway.
function lightPools(ctx) {
  if (S.night < 0.12) return;
  for (const L of S.lights) {
    if (!L.pool) continue;
    const x = L.px ?? L.x, z = L.pz ?? L.z;
    const drop = L.y - ctx.terrain.heightAt(x, z);
    if (drop > 4.2) continue;
    const r = Math.min(L.r * 0.5, 1.9 + Math.max(0, drop) * 0.5);
    ctx.occupy(x, z, r * 0.7, 'pool', { ao: -2.1 * Math.min(1.1, L.s + 0.3) * S.night });
    if (L.pool < 2) continue;
    S.lamps.push({
      part: S.glow.add(poolGeo(ctx, x, z, r, Math.min(1.1, (L.s + 0.25) * 1.4) * S.night)),
      kind: 'lamp', x: 0, y: 0, z: 0, w: L.fw ?? 1.1, phase: L.fp ?? 0, amp: 0.09,
    });
  }
}

// Which windows are burning, decided before a single prop is placed because every static thing in
// the module bakes the bounce off whatever is registered in S.lights.
//
// A uniformly lit village reads as a switch rather than as people, so: two houses stay dark all
// evening, every other house gets its own brightness, and roughly a third of the remaining windows
// stay dark inside a lit house.
function planWindows(ctx) {
  const { rng, terrain } = ctx;
  if (S.night < 0.12) return [];
  const plots = (ctx.village.plots || []).filter(q => Array.isArray(q.windows) && q.windows.length);
  const order = plots.map((plot, i) => ({ plot, k: rng() + i * 1e-6 })).sort((a, b) => a.k - b.k);
  const out = [];

  order.forEach(({ plot }, i) => {
    if (i < 2) return;
    const bright = 0.5 + rng() * 0.5;
    const wins = plot.windows.filter(w => Array.isArray(w) && w.length >= 3 && Number.isFinite(w[0]));
    if (!wins.length) return;
    const keep = wins.filter(() => rng() < 0.78);
    if (!keep.length) keep.push(rng.pick(wins));
    for (const w of keep) {
      const ry = Number.isFinite(w[3]) ? w[3] : (plot.ry || 0);
      const k = bright * (0.82 + rng() * 0.36);
      out.push({
        x: w[0], y: w[1], z: w[2], ry, k: Math.min(1.15, k),
        sill: w[1] - terrain.heightAt(w[0], w[2]),
        w: 0.45 + rng() * 0.75, phase: rng() * 10,
      });
    }
  });
  return out;
}

// One merged part per window: the pane, a lit sill, and two falloff bands of spill on the plaster
// round it. The bands are what sell it — a bright rectangle on an unlit wall reads as a sticker,
// and the two value steps out from it are the same faceted falloff the rest of the style uses.
function buildWindows(ctx, wins) {
  const { p, rng } = ctx;
  if (!wins.length || S.night < 0.12) return;
  const core = mix(p.lit.warm, '#fff1d2', 0.32);
  const warm = p.lit.warm;

  for (const w of wins) {
    const k = w.k * S.night;
    const m = new Mesh();
    const hw = 0.185 + rng() * 0.05, hh = 0.27 + rng() * 0.05;
    const x = -0.075;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const y0 = -hh + (r / 3) * 2 * hh, y1 = -hh + ((r + 1) / 3) * 2 * hh;
        const z0 = -hw + c * hw, z1 = z0 + hw;
        m.quad(...faceRect(x, y0, y1, z0, z1), emit(shade(core, -0.06 + r * 0.05 + c * 0.03), k));
      }
    }

    // Light on plaster does not stop at an edge, so the spill is four value steps rather than one
    // patch: fewer than three and the outermost step reads as a decal pasted on the wall.
    const sx = x + 0.012;
    const ring = g => [
      [sx, -hh - 0.26 * g - 0.09 * g * g, -hw - 0.26 * g],
      [sx, hh + 0.2 * g, -hw - 0.16 * g],
      [sx, hh + 0.2 * g, hw + 0.16 * g],
      [sx, -hh - 0.26 * g - 0.09 * g * g, hw + 0.26 * g],
    ];
    let prev = faceRect(sx, -hh, hh, -hw, hw);
    for (const [g, f] of SPILL) {
      const next = ring(g);
      faceBand(m, prev, next, emit(mix(warm, p.build.wall[1], 0.18 * g), k * f));
      prev = next;
    }

    const sy = -hh - 0.30;
    m.quad([sx, sy, -hw - 0.18], [sx, sy, hw + 0.18], [x + 0.10, sy, hw + 0.18], [x + 0.10, sy, -hw - 0.18],
      emit(shade(warm, 0.12), k * 0.6));

    S.lamps.push({
      part: S.glow.add(m.geo()), kind: 'lamp', x: w.x, y: w.y, z: w.z, yaw: w.ry,
      w: w.w, phase: w.phase, amp: 0.055,
    });
  }
}

// [how far out, how bright] per spill step. Unlit geometry skips tone mapping, so the second number
// is an absolute screen value rather than a fraction of the wall behind it — tuned by eye against
// the dusk palette and nothing else.
const SPILL = [[0.5, 0.30], [1.0, 0.135], [1.7, 0.058], [2.7, 0.022]];

// ── the market ───────────────────────────────────────────────────────────────────────────────

function buildMarket(ctx, seed, den) {
  const { p, rng } = ctx;
  const stripes = [
    [p.build.wall[1], p.build.roof[0]],
    [p.build.wall[1], p.accent],
    [p.build.wall[1], p.build.roofAlt[0]],
  ];
  const face = seed.a + Math.PI;

  for (let i = 0; i < 3; i++) {
    const s = spot(ctx, { cx: seed.x, cz: seed.z, rMax: 3.4, clear: 1.7, tries: 40 });
    if (!s) break;
    const ry = face + (i - 1) * 0.62 + (rng() - 0.5) * 0.3;
    const w = 2.1 + rng() * 0.5, d = 1.25 + rng() * 0.25;
    const m = new Mesh();

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        m.add(prism(5, 0.055, 0.04, 1.5 + sz * 0.19, { rot: rng() * TAU, col: shade(p.build.wood[2], -0.05 + rng() * 0.2) }),
          matrix({ pos: [sx * w / 2, 0, sz * d / 2], rz: sx * 0.02 }));
      }
    }
    m.add(boxy(w * 1.04, 0.16, d * 0.62, { cut: 0.03, taper: 0.05, col: shade(p.build.wood[0], 0.04) }),
      matrix({ pos: [0, 0.78, d * 0.16] }));
    for (let k = 0; k < 3; k++) {
      m.add(boxy(w * 0.98, 0.5, 0.055, { cut: 0.015, taper: 0.04, col: shade(p.build.woodDark[0], -0.05 + k * 0.06) }),
        matrix({ pos: [0, 0.26, d * 0.16 - 0.26 + k * 0.03], rz: (rng() - 0.5) * 0.03 }));
    }

    const [a, b] = stripes[i % 3];
    const n = 7, back = -d / 2 - 0.18, front = d / 2 + 0.34;
    for (let k = 0; k < n; k++) {
      const x0 = -w / 2 - 0.12 + (k / n) * (w + 0.24), x1 = -w / 2 - 0.12 + ((k + 1) / n) * (w + 0.24);
      const col = k % 2 ? b : a;
      const A = [x0, 1.76, back], B = [x1, 1.76, back], Cq = [x1, 1.34, front], D = [x0, 1.34, front];
      m.quad(D, Cq, B, A, shade(col, 0.05));
      m.quad(A, B, Cq, D, shade(p.build.woodDark[2], -0.1));
      const E = [x0, 1.12, front + 0.05], F = [x1, 1.12, front + 0.05];
      m.quad(E, F, Cq, D, shade(col, -0.14));
      m.quad(D, Cq, F, E, shade(p.build.woodDark[2], -0.05));
    }

    const produce = [p.flora.bloom[0], p.build.roof[0], p.flora.canopy[1], p.flora.bloom[3], p.build.thatch[1]];
    for (let k = 0; k < 4; k++) {
      const cx = -w / 2 + 0.32 + rng() * (w - 0.64);
      m.add(boxy(0.42, 0.18, 0.34, { cut: 0.02, taper: 0.14, col: shade(p.build.thatch[2], -0.05) }),
        matrix({ pos: [cx, 0.86, d * 0.16 + (rng() - 0.5) * 0.2], ry: rng() * 0.5 }));
      for (let q = 0; q < 3; q++) {
        m.add(blob(0.062, 0, { jitter: 0.24, rng, col: shade(produce[(i * 3 + k + q) % produce.length], -0.02 + q * 0.05) }),
          matrix({ pos: [cx + (q - 1) * 0.11, 1.02, d * 0.16 + (rng() - 0.5) * 0.14] }));
      }
    }

    put(ctx, m.geo(), { x: s.x, z: s.z, ry, sink: 0.06, claim: 1.5 });
  }

  buildWagon(ctx, seed, face);

  for (let i = 0; i < den(5); i++) {
    const s = spot(ctx, { cx: seed.x, cz: seed.z, rMin: 1.2, rMax: 4.6, clear: 0.7, tries: 30 });
    if (!s) continue;
    const m = new Mesh();
    if (i % 2) {
      for (let k = 0; k < 3; k++) {
        m.add(blob(0.27, 0, { jitter: 0.2, stretch: 1.25, squash: 0.9, rng, col: shade(p.build.thatch[k % 2 ? 0 : 2], -0.06 + rng() * 0.16) }),
          matrix({ pos: [(rng() - 0.5) * 0.5, 0.3, (rng() - 0.5) * 0.45], ry: rng() * TAU, rz: (rng() - 0.5) * 0.3 }));
      }
    } else {
      m.add(boxy(0.66, 0.42, 0.5, { cut: 0.03, taper: 0.1, col: shade(p.build.thatch[2], -0.04) }), null);
      for (let k = 0; k < 5; k++) {
        m.add(blob(0.085, 0, { jitter: 0.26, rng, col: shade(p.flora.bloom[k % 4], -0.02 + k * 0.03) }),
          matrix({ pos: [(rng() - 0.5) * 0.38, 0.44, (rng() - 0.5) * 0.28] }));
      }
    }
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, rx: (rng() - 0.5) * 0.06, sink: 0.05, claim: 0.55 });
  }
}

// The one big silhouette in the square. Everything else is knee height, and a frame of nothing but
// knee-height props has no hero to read first.
function buildWagon(ctx, seed, face) {
  const { p, rng } = ctx;
  const s = spot(ctx, { cx: seed.x, cz: seed.z, rMin: 2.4, rMax: 5, clear: 1.9, tries: 40 });
  if (!s) return;
  const m = new Mesh();
  const bedY = 0.72, L = 2.7, W = 1.32;

  m.add(boxy(L, 0.16, W, { cut: 0.04, taper: 0.03, col: shade(p.build.wood[0], 0.03) }), matrix({ pos: [0, bedY, 0] }));
  for (const sz of [-1, 1]) {
    m.add(boxy(L * 0.96, 0.42, 0.07, { cut: 0.02, taper: 0.05, col: shade(p.build.woodDark[1], 0.03) }),
      matrix({ pos: [0, bedY + 0.14, sz * W * 0.46], rx: sz * -0.1 }));
  }
  m.add(boxy(0.07, 0.5, W * 0.9, { cut: 0.02, taper: 0.06, col: shade(p.build.woodDark[1], -0.02) }), matrix({ pos: [-L * 0.47, bedY + 0.14, 0] }));

  for (const sz of [-1, 1]) {
    for (const sx of [-0.72, 0.78]) {
      const r = sx > 0 ? 0.46 : 0.34;
      m.add(prism(9, r, r * 0.97, 0.12, { rot: rng() * TAU, col: shade(p.build.woodDark[0], -0.03) }),
        matrix({ pos: [sx * L * 0.5, r + 0.04, sz * (W * 0.5 + 0.09)], rx: 1.5708 }));
      m.add(prism(7, 0.09, 0.08, 0.16, { rot: 0.4, col: shade(p.build.metal[0], 0.06) }),
        matrix({ pos: [sx * L * 0.5, r + 0.04, sz * (W * 0.5 + 0.08)], rx: 1.5708 }));
    }
  }

  const hoops = 5;
  const canvas = mix(p.build.wall[1], p.build.thatch[1], 0.25);
  for (let i = 0; i < hoops; i++) {
    const t0 = i / hoops, t1 = (i + 1) / hoops;
    const px = a => -L * 0.42 + a * L * 0.84;
    const arch = a => 0.62 + 0.1 * Math.sin(a * Math.PI);
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      const q = (x, ang, sc) => [px(x), bedY + 0.14 + Math.sin(ang) * arch(x) * sc, Math.cos(ang) * W * 0.52 * sc];
      m.quad(q(t0, a0, 1), q(t1, a0, 1), q(t1, a1, 1), q(t0, a1, 1), shade(i % 2 ? canvas : shade(canvas, -0.07), -0.1 + k * 0.07));
      m.quad(q(t0, a1, 1), q(t1, a1, 1), q(t1, a0, 1), q(t0, a0, 1), shade(p.build.woodDark[2], -0.2));
    }
  }
  m.add(prism(5, 0.055, 0.04, 1.5, { col: shade(p.build.wood[2], 0.06) }), matrix({ pos: [L * 0.5, bedY - 0.1, 0.25], rz: 1.42 }));
  m.add(prism(5, 0.055, 0.04, 1.5, { col: shade(p.build.wood[2], 0.06) }), matrix({ pos: [L * 0.5, bedY - 0.1, -0.25], rz: 1.42 }));

  put(ctx, m.geo(), { x: s.x, z: s.z, ry: face + Math.PI / 2 + (rng() - 0.5) * 0.5, sink: 0.06, claim: 1.7 });
  ctx.occupy(s.x, s.z, 1.7, 'life');
}

// ── yard props ───────────────────────────────────────────────────────────────────────────────

function buildYardProps(ctx, store, market, den) {
  const { p, rng } = ctx;

  for (let i = 0; i < den(7); i++) {
    const src = i % 3 === 2 ? market : store;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 0.8, rMax: 3.2, clear: 0.85, tries: 34 });
    if (!s) continue;
    const m = new Mesh();
    const kind = rng();
    if (kind < 0.32) {
      const n = 1 + (rng() < 0.55 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        m.add(barrelGeo(0.29, 0.86, p.build.wood[0], p.build.metal[0]),
          matrix({ pos: [(rng() - 0.5) * 0.55, k * 0.84, (rng() - 0.5) * 0.55], ry: rng() * TAU, rz: (rng() - 0.5) * 0.08 }));
      }
      if (rng() < 0.5) {
        m.add(barrelGeo(0.26, 0.74, p.build.woodDark[1], p.build.metal[2]),
          matrix({ pos: [0.62, 0.26, 0.2], ry: rng() * TAU, rz: 1.5708 + 0.1, rx: 0.1 }));
      }
    } else if (kind < 0.64) {
      const n = 2 + (rng() < 0.55 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        m.add(boxy(0.62 + rng() * 0.16, 0.4, 0.46, { cut: 0.028, taper: 0.13, col: shade(p.build.wood[k % 2 ? 0 : 2], -0.04 + rng() * 0.2) }),
          matrix({ pos: [(rng() - 0.5) * 0.8, k * 0.39, (rng() - 0.5) * 0.7], ry: rng() * TAU, rz: (rng() - 0.5) * 0.1 }));
      }
    } else if (kind < 0.82) {
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 4 - row; k++) {
          m.add(prism(7, 0.1, 0.086, 1.1, { rot: rng() * TAU, col: shade(p.build.woodDark[row % 2], -0.06 + rng() * 0.26) }),
            matrix({ pos: [(k - (3 - row) / 2) * 0.23 + row * 0.11, 0.1 + row * 0.2, 0], rx: 1.5708, ry: (rng() - 0.5) * 0.06 }));
        }
      }
    } else {
      for (let k = 0; k < 3; k++) {
        m.add(prism(7, 0.46, 0.42, 0.66, { rot: rng() * TAU, col: shade(p.build.thatch[0], -0.08 + rng() * 0.22) }),
          matrix({
            pos: [(k - 1) * 0.44 + (rng() - 0.5) * 0.2, 0.44 + (k === 2 ? 0.8 : 0), (rng() - 0.5) * 0.3],
            rz: 1.5708 + (rng() - 0.5) * 0.14, ry: rng() * TAU,
          }));
      }
    }
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, rx: (rng() - 0.5) * 0.06, sink: 0.05, claim: 0.75 });
  }

  for (let i = 0; i < den(2); i++) {
    const src = i ? market : store;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 1.6, rMax: 5, clear: 1.4 });
    if (!s) continue;
    const m = new Mesh();
    const bedY = 0.5;
    m.add(boxy(1.5, 0.13, 0.86, { cut: 0.03, taper: 0.04, col: shade(p.build.wood[0], 0.03) }), matrix({ pos: [0, bedY, 0] }));
    for (const sz of [-1, 1]) {
      m.add(boxy(1.44, 0.36, 0.06, { cut: 0.015, taper: 0.06, col: shade(p.build.woodDark[1], 0.02) }),
        matrix({ pos: [0, bedY + 0.12, sz * 0.42], rx: sz * -0.12 }));
    }
    for (const sz of [-1, 1]) {
      m.add(prism(9, 0.33, 0.31, 0.1, { rot: 0.3, col: shade(p.build.woodDark[0], -0.02) }),
        matrix({ pos: [-0.25, 0.34, sz * 0.5], rx: 1.5708 }));
      m.add(prism(9, 0.11, 0.1, 0.09, { rot: 0.3, col: shade(p.build.metal[0], 0.04) }),
        matrix({ pos: [0.62, 0.16, sz * 0.44], rx: 1.5708 }));
    }
    m.add(prism(5, 0.05, 0.038, 1.0, { col: shade(p.build.wood[2], 0.06) }), matrix({ pos: [0.7, bedY, 0.2], rz: 1.32 }));
    m.add(prism(5, 0.05, 0.038, 1.0, { col: shade(p.build.wood[2], 0.06) }), matrix({ pos: [0.7, bedY, -0.2], rz: 1.32 }));
    if (rng() < 0.7) {
      for (let k = 0; k < 4; k++) {
        m.add(blob(0.15, 0, { jitter: 0.26, stretch: 0.8, rng, col: shade(p.build.thatch[k % 2], -0.05 + k * 0.05) }),
          matrix({ pos: [(rng() - 0.5) * 1.0, bedY + 0.19, (rng() - 0.5) * 0.5] }));
      }
    }
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, sink: 0.05, claim: 1.1 });
  }

  for (let i = 0; i < den(3); i++) {
    const src = i % 2 ? market : store;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 3, rMax: 6.5, clear: 2.6, slope: 0.3 });
    if (!s) continue;
    const len = 4.5 + rng() * 3;
    const ry = Math.atan2(s.z - src.z, s.x - src.x) + Math.PI / 2 + (rng() - 0.5) * 0.5;
    put(ctx, fenceGeo(len, 4, { post: p.build.woodDark[0], rail: p.build.wood[0], rng }),
      { x: s.x, z: s.z, ry, sink: 0.12, claim: 0.7 });
    ctx.occupy(s.x, s.z, 1.2, 'life');
  }
}

function buildFire(ctx, fire) {
  const { p, rng, terrain } = ctx;
  const m = new Mesh();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng() * 0.3;
    m.add(blob(0.24, 0, { jitter: 0.3, stretch: 0.66, rng, col: shade(p.ground.rock[i % 2 ? 0 : 2], -0.05 + rng() * 0.2) }),
      matrix({ pos: [Math.cos(a) * 0.82, 0.09, Math.sin(a) * 0.82], ry: rng() * TAU }));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    m.add(prism(5, 0.08, 0.055, 0.92, { rot: rng() * TAU, col: shade(p.build.woodDark[2], -0.1 + rng() * 0.2) }),
      matrix({ pos: [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], rx: Math.sin(a) * 0.55, rz: -Math.cos(a) * 0.55 }));
  }
  m.add(blob(0.28, 0, { jitter: 0.35, stretch: 0.4, rng, col: shade(p.build.trim[2], -0.3) }), matrix({ pos: [0, 0.06, 0] }));
  put(ctx, m.geo(), { x: fire.x, z: fire.z, ry: rng() * TAU, sink: 0.08, claim: 1.2 });

  const base = terrain.heightAt(fire.x, fire.z);
  const hot = [
    { r: 0.5, h: 0.66, c: mix(p.lit.warm, p.build.roof[0], 0.55) },
    { r: 0.34, h: 0.94, c: p.lit.warm },
    { r: 0.19, h: 1.15, c: mix(p.lit.warm, '#ffffff', 0.14) },
  ];
  hot.forEach((f, i) => {
    const g = spire(5, f.r, f.h, { curve: 0.85, rings: 3, rot: i * 0.8, col: (ri, fi, t) => shade(f.c, -0.16 + t * 0.14) });
    S.lamps.push({
      part: S.glow.add(g), kind: 'flame', x: fire.x, y: base + 0.02 + i * 0.06, z: fire.z,
      w: 3.1 + i * 1.9, phase: i * 2.1, amp: 0.16 + i * 0.05,
    });
  });
  S.fire = { x: fire.x, y: base, z: fire.z };
}

function buildOven(ctx, seed) {
  const { p, rng, terrain } = ctx;
  const s = spot(ctx, { cx: seed.x, cz: seed.z, rMin: 1.8, rMax: 4.2, clear: 1.8 });
  if (!s) return;
  const brick = mix(p.build.stone[0], p.build.roof[0], 0.35);
  const ry = rng() * TAU;
  const m = new Mesh();
  m.add(boxy(1.6, 0.66, 1.3, { cut: 0.08, taper: 0.1, col: shade(p.ground.rock[2], -0.02) }), null);
  m.add(smooth(blob(0.72, 1, { jitter: 0.07, stretch: 0.62, squash: 0.84, rng, col: shade(brick, 0.04) })),
    matrix({ pos: [0, 0.7, 0] }));
  m.add(prism(7, 0.32, 0.28, 0.36, { rot: 0.35, col: shade(brick, 0.1) }), matrix({ pos: [0, 0.52, 0.56], rx: 1.5708 }));
  m.add(prism(7, 0.23, 0.2, 0.2, { rot: 0.35, col: shade(p.build.trim[2], -0.35) }), matrix({ pos: [0, 0.52, 0.5], rx: 1.5708 }));
  m.add(prism(7, 0.2, 0.16, 1.0, { rot: 0.5, col: shade(p.build.stone[2], 0.02) }), matrix({ pos: [-0.36, 0.98, -0.32], rz: 0.05 }));
  m.add(prism(7, 0.24, 0.21, 0.14, { rot: 0.5, col: shade(p.build.trim[0], 0.04) }), matrix({ pos: [-0.36, 1.96, -0.32] }));
  m.add(prism(5, 0.06, 0.045, 1.15, { col: shade(p.build.wood[2], 0.05) }), matrix({ pos: [0.7, 0.42, 0.5], rz: -0.35 }));
  for (let k = 0; k < 3; k++) {
    m.add(prism(7, 0.09, 0.078, 0.7, { rot: rng() * TAU, col: shade(p.build.woodDark[k % 2], -0.05 + rng() * 0.2) }),
      matrix({ pos: [-0.55 + k * 0.05, 0.75 + k * 0.17, 0.42], rx: 1.5708, ry: (rng() - 0.5) * 0.2 }));
  }
  put(ctx, m.geo(), { x: s.x, z: s.z, ry, sink: 0.1, claim: 1.3 });
  ctx.occupy(s.x, s.z, 1.3, 'life');

  const y = terrain.heightAt(s.x, s.z);
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const world = (lx, lz) => [s.x + lx * cs + lz * sn, s.z - lx * sn + lz * cs];
  const [mx, mz] = world(0, 0.5);
  const mouth = S.glow.add(smooth(blob(0.15, 0, { jitter: 0.14, stretch: 0.9, rng, col: mix(p.lit.warm, p.build.roof[0], 0.3) })));
  S.lamps.push({ part: mouth, kind: 'ember', w: 1.7, phase: 0.9, amp: 0.24, x: mx, y: y + 0.44, z: mz });
  S.lights.push({ x: s.x, y: y + 0.5, z: s.z, r: 5.5, s: 0.8, pool: 2, fw: 1.7, fp: 0.9 });
  const [ox, oz] = world(-0.36, -0.32);
  S.oven = { x: ox, y: y + 2.08, z: oz };
}

function buildLamps(ctx, spots) {
  const { p, rng, terrain } = ctx;
  for (const s of spots) {
    const m = new Mesh();
    m.add(prism(7, 0.15, 0.11, 0.3, { rot: 0.4, col: shade(p.ground.rock[2], -0.05) }), null);
    m.add(prism(7, 0.085, 0.055, 1.72, { rot: 0.4, twist: 0.2, col: shade(p.build.wood[2], -0.06 + rng() * 0.14) }), matrix({ pos: [0, 0.24, 0] }));
    m.add(prism(7, 0.055, 0.15, 0.13, { rot: 0.3, col: shade(p.build.metal[2], 0.05) }), matrix({ pos: [0, 1.9, 0] }));
    m.add(prism(7, 0.15, 0.125, 0.32, { rot: 0.3, col: shade(p.build.metal[2], -0.08) }), matrix({ pos: [0, 2.03, 0] }));
    m.add(spire(7, 0.21, 0.26, { curve: 1.3, rings: 2, rot: 0.3, col: shade(p.build.metal[2], 0.1) }), matrix({ pos: [0, 2.35, 0] }));
    m.add(prism(5, 0.022, 0.012, 0.18, { col: shade(p.build.metal[1], 0.12) }), matrix({ pos: [0, 2.61, 0] }));
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, rz: (rng() - 0.5) * 0.05, sink: 0.06 });

    const y = terrain.heightAt(s.x, s.z);
    const pane = S.glow.add(prism(7, 0.13, 0.11, 0.28, { rot: 0.3, col: glassCol(p) }));
    S.lamps.push({ part: pane, kind: 'lamp', x: s.x, y: y + 2.05, z: s.z, w: 0.9 + rng() * 1.1, phase: rng() * 6, amp: 0.14 });
  }
}

function buildDoorLamps(ctx, doors) {
  const { p, rng } = ctx;
  for (const d of doors) {
    const side = rng.chance(0.5) ? 1 : -1;
    const m = new Mesh();
    m.add(prism(5, 0.03, 0.022, 0.44, { col: shade(p.build.metal[2], 0.06) }), matrix({ pos: [0, 0.28, 0], rz: -0.55 }));
    m.add(prism(7, 0.115, 0.098, 0.24, { rot: 0.3, col: shade(p.build.metal[2], -0.05) }), matrix({ pos: [0.22, 0.02, 0] }));
    m.add(spire(7, 0.155, 0.18, { curve: 1.3, rings: 2, col: shade(p.build.metal[2], 0.12) }), matrix({ pos: [0.22, 0.26, 0] }));
    const bx = d.x + outX(d.ry) * 0.02, bz = d.z + outZ(d.ry) * 0.02;
    const along = [Math.sin(d.ry), Math.cos(d.ry)];
    const ax = bx + along[0] * side * 0.62, az = bz + along[1] * side * 0.62;
    put(ctx, m.geo(), { x: ax, y: d.y + 1.5, z: az, ry: d.ry });

    const lx = ax + outX(d.ry) * 0.22, lz = az + outZ(d.ry) * 0.22, ly = d.y + 1.62;
    const pane = S.glow.add(prism(7, 0.095, 0.082, 0.2, { rot: 0.3, col: glassCol(p) }));
    S.lamps.push({ part: pane, kind: 'lamp', x: lx, y: ly, z: lz, w: 1.3 + rng(), phase: rng() * 6, amp: 0.14 });

    // the light the lantern throws back onto the doorway it is bolted to
    if (S.night > 0.12) {
      const w = new Mesh();
      const sx = -0.10;
      const off = side * 0.62;
      const step = (g, wz, up, dn) => [
        [sx, -dn, off - wz * 1.22], [sx, up, off - wz * 0.8],
        [sx, up, off + wz * 0.8], [sx, -dn, off + wz * 1.22],
      ];
      const rings = [step(0, 0.14, 0.16, 0.2), step(1, 0.34, 0.34, 0.52),
        step(2, 0.6, 0.56, 0.94), step(3, 0.95, 0.78, 1.5)];
      const vals = [0.16, 0.07, 0.026];
      for (let i = 0; i < 3; i++) faceBand(w, rings[i], rings[i + 1], emit(p.lit.warm, S.night * vals[i]));
      S.lamps.push({
        part: S.glow.add(w.geo()), kind: 'lamp', yaw: d.ry,
        x: d.x, y: d.y + 1.5, z: d.z, w: 1.3 + rng(), phase: rng() * 6, amp: 0.09,
      });
    }
  }
}

function glassCol(p) {
  const off = mix(p.build.stone[1], p.sky.haze, 0.45);
  return mix(off, p.lit.warm, Math.min(1, (p.lit.intensity ?? 0) * 1.15));
}

// ── cloth ────────────────────────────────────────────────────────────────────────────────────

function buildLaundry(ctx, seed) {
  const { p, rng, terrain } = ctx;
  const s = spot(ctx, { cx: seed.x, cz: seed.z, rMax: 3.2, clear: 1.7, tries: 60 })
    || spot(ctx, { cx: seed.x, cz: seed.z, rMax: 5, clear: 0.9, tries: 60 })
    || { x: seed.x, z: seed.z };
  const ry = seed.a + Math.PI / 2 + (rng() - 0.5) * 0.6;
  const span = 4.4;
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    m.add(prism(5, 0.075, 0.05, 2.2, { rot: rng() * TAU, col: shade(p.build.wood[2], -0.05) }),
      matrix({ pos: [sx * span / 2, 0, 0], rz: sx * 0.045 }));
    m.add(prism(5, 0.055, 0.035, 0.5, { col: shade(p.build.wood[2], 0.05) }),
      matrix({ pos: [sx * span / 2, 1.95, 0], rz: -sx * 0.9 }));
  }
  for (let k = 0; k < 6; k++) {
    const x0 = -span / 2 + (k / 6) * span, x1 = -span / 2 + ((k + 1) / 6) * span;
    const sag = t => 2.1 - 0.11 * Math.sin(Math.PI * ((t + span / 2) / span));
    m.quad([x0, sag(x0), 0.014], [x1, sag(x1), 0.014], [x1, sag(x1) - 0.024, -0.014], [x0, sag(x0) - 0.024, -0.014], shade(p.build.trim[1], 0.16));
  }
  put(ctx, m.geo(), { x: s.x, z: s.z, ry, sink: 0.1, claim: 1.2 });
  ctx.occupy(s.x, s.z, 1.6, 'life');

  const base = terrain.heightAt(s.x, s.z);
  const tints = [p.build.wall[1], p.build.roofAlt[1], p.build.wallAlt[1], p.build.roof[1], p.build.wall[0]];
  for (let k = 0; k < 5; k++) {
    const w = 0.62 + rng() * 0.26, h = 0.78 + rng() * 0.38;
    const col = tints[k % tints.length];
    const g = clothGeo(w, h, 3, 3, (i, j) => shade(col, 0.04 - j * 0.07 + (i % 2) * 0.05));
    const part = S.drape.add(g);
    part.flat = true;
    const lx = -span / 2 + 0.5 + k * (span - 1.0) / 4;
    S.cloth.push({
      part, kind: 'hang', h,
      x: s.x + Math.cos(ry) * lx, y: base + 2.06 - 0.09 * Math.sin(Math.PI * ((lx + span / 2) / span)),
      z: s.z + Math.sin(ry) * lx, ry: ry + Math.PI / 2,
      w: 1.9 + k * 0.43, phase: k * 1.7, amp: 0.16 + rng() * 0.1,
    });
  }
}

function buildBanners(ctx, C, seeds) {
  const { p, rng, terrain } = ctx;
  for (let i = 0; i < 2; i++) {
    const src = seeds[(i * 2) % Math.max(1, seeds.length)] || C;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 1.4, rMax: 4.6, clear: 1.3, tries: 60 })
      || spot(ctx, { cx: src.x, cz: src.z, rMin: 1.4, rMax: 6.5, clear: 0.8, tries: 60 });
    if (!s) continue;
    const h = 3.5 + rng() * 1.1;
    const m = new Mesh();
    m.add(prism(7, 0.12, 0.1, 0.24, { rot: 0.4, col: shade(p.ground.rock[0], -0.08) }), null);
    m.add(prism(7, 0.085, 0.045, h, { rot: 0.4, twist: 0.3, col: shade(p.build.wood[2], 0.04) }), matrix({ pos: [0, 0.2, 0] }));
    m.add(spire(5, 0.075, 0.22, { curve: 1.2, rings: 2, col: shade(p.build.metal[1], 0.14) }), matrix({ pos: [0, h + 0.2, 0] }));
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, rz: (rng() - 0.5) * 0.04, sink: 0.06 });

    const w = 1.15, ch = 0.72;
    const col = i === 0 ? p.accent : p.build.roof[0];
    const g = clothGeo(w, ch, 4, 2, (ix, j) => shade(j ? mix(col, p.build.wall[1], 0.4) : col, -0.06 + ix * 0.05));
    const part = S.drape.add(g);
    part.flat = true;
    S.cloth.push({
      part, kind: 'flag', w,
      x: s.x, y: terrain.heightAt(s.x, s.z) + h + 0.06, z: s.z, ry: rng() * TAU,
      wv: 2.35 + i * 0.9, phase: i * 2.2, amp: 0.2 + i * 0.05,
    });
  }
}

// ── animals ──────────────────────────────────────────────────────────────────────────────────

function buildPaddock(ctx, C, den) {
  const { p, rng, terrain } = ctx;
  const K = animalKit(p, rng);
  S.kit = K;

  const a = rng() * TAU;
  const pd = { x: C.x + Math.cos(a) * 21, z: C.z + Math.sin(a) * 21 };
  const ok = terrain.inBounds(pd.x, pd.z, 8) && terrain.heightAt(pd.x, pd.z) > terrain.waterY + 1
    && terrain.slopeAt(pd.x, pd.z) < 0.3;
  const anchor = ok ? pd : { x: C.x + 16, z: C.z + 10 };

  const side = 9;
  for (let e = 0; e < 4; e++) {
    const ang = (e / 4) * TAU + 0.4;
    const fx = anchor.x + Math.cos(ang + 0.78) * side * 0.7;
    const fz = anchor.z + Math.sin(ang + 0.78) * side * 0.7;
    if (!ctx.terrain.inBounds(fx, fz, 4) || ctx.terrain.heightAt(fx, fz) < ctx.terrain.waterY + 0.5) continue;
    put(ctx, fenceGeo(side, 5, { post: p.build.woodDark[1], rail: p.build.wood[2], h: 0.9, rng }),
      { x: fx, z: fz, ry: ang + 0.78 + Math.PI / 2, sink: 0.14 });
  }

  addAnimals(ctx, K.sheep, den(6), anchor, 3.6, { graze: true });
  addAnimals(ctx, K.cow, den(2), anchor, 4.2, { graze: true });
  for (let i = 0; i < den(8); i++) {
    const src = (S.seeds && S.seeds.length) ? S.seeds[i % S.seeds.length] : C;
    addAnimals(ctx, i % 3 ? K.hen : K.hen2, 1, src, 3.2, { peck: true, rMin: 0.6 });
  }

  const dogPath = ringPath(ctx, C.x, C.z, 6.5, 9);
  const dog = spawnAnimal(ctx, K.dog, C.x, C.z);
  dog.path = dogPath; dog.u = rng() * dogPath.len; dog.speed = 2.35; dog.stride = 0.42;

  const treeA = rng() * TAU;
  const deerAt = { x: C.x + Math.cos(treeA) * 34, z: C.z + Math.sin(treeA) * 34 };
  if (terrain.inBounds(deerAt.x, deerAt.z, 8) && terrain.heightAt(deerAt.x, deerAt.z) > terrain.waterY + 1) {
    addAnimals(ctx, K.deer, den(3), deerAt, 4.5, { graze: true });
  }
}

function spawnAnimal(ctx, kind, x, z, opt = {}) {
  const { rng, terrain } = ctx;
  const parts = kind.parts.map(q => ({ ...q, part: S.movers.add(q.geo.clone()) }));
  const a = {
    parts, kind, x, z, y: terrain.heightAt(x, z),
    yaw: rng() * TAU, scale: (opt.scale ?? 1) * (0.88 + rng() * 0.24),
    tilt: (rng() - 0.5) * 0.1, phase: rng() * 10,
    w1: 0.5 + rng() * 0.5, w2: 1.1 + rng() * 1.6,
    graze: !!opt.graze, peck: !!opt.peck, u: 0, speed: 0, stride: 0.6, path: null,
  };
  S.animals.push(a);
  return a;
}

function addAnimals(ctx, kind, n, at, spread, opt) {
  for (let i = 0; i < n; i++) {
    const s = spot(ctx, { cx: at.x, cz: at.z, rMin: opt.rMin ?? 0.8, rMax: spread, clear: 0.7, tries: 30 });
    if (!s) continue;
    spawnAnimal(ctx, kind, s.x, s.z, opt);
    ctx.occupy(s.x, s.z, 0.5, 'life');
  }
}

function buildBirds(ctx, C, den) {
  const { rng, terrain } = ctx;
  const K = S.kit;
  const baseY = terrain.heightAt(C.x, C.z);
  for (let i = 0; i < den(7); i++) {
    const parts = K.bird.parts.map(q => ({ ...q, part: S.movers.add(q.geo.clone()) }));
    S.birds.push({
      parts, cx: C.x + (rng() - 0.5) * 12, cz: C.z + (rng() - 0.5) * 12, cy: baseY + 9 + rng() * 7,
      rx: 6 + rng() * 9, rz: 5 + rng() * 8, ry: 0.7 + rng() * 1.4,
      w: 0.16 + rng() * 0.12, wy: 0.09 + rng() * 0.07,
      flap: 5.5 + rng() * 3.5, phase: rng() * 10, scale: 0.8 + rng() * 0.5,
    });
  }
}

// ── smoke ────────────────────────────────────────────────────────────────────────────────────

function buildSmoke(ctx, fire, doors) {
  const { p, rng, terrain } = ctx;
  const cols = [];
  if (S.fire) cols.push({ x: S.fire.x, y: S.fire.y + 0.5, z: S.fire.z, h: 2.9, r: 0.15, warm: 0.5 });
  if (S.oven) cols.push({ x: S.oven.x, y: S.oven.y, z: S.oven.z, h: 2.2, r: 0.13, warm: 0.3 });
  if (S.brazier) cols.push({ x: S.brazier.x, y: S.brazier.y, z: S.brazier.z, h: 2.0, r: 0.12, warm: 0.55 });

  for (const plot of ctx.village.plots || []) {
    const c = plot.chimney;
    const q = Array.isArray(c) ? { x: c[0], y: c[1], z: c[2] } : c;
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.z)) continue;
    cols.push({
      x: q.x, z: q.z, h: 1.9 + rng() * 1.1, r: 0.11 + rng() * 0.05, warm: 0.25,
      y: Number.isFinite(q.y) ? q.y : terrain.heightAt(q.x, q.z) + 4,
    });
  }

  // A stack of separate puffs reads as a string of beads at this scale however you tune it; one
  // lofted plume with a travelling bulge in its radius reads as smoke, and the wave IS the motion.
  // It is unlit, so it skips ACES while the rest of the scene is crushed by it — hence the
  // palette-driven dim, without which a dusk plume glows off a black hillside like a lamp.
  const dim = -0.5 - 0.6 * S.lit;
  const base = mix(p.fog.color, p.build.wall[1], 0.22);
  for (const c of cols) {
    const start = shade(mix(base, p.lit.warm, c.warm * S.lit * 0.6), dim);
    const end = shade(p.fog.color, dim - 0.12);
    const N = 7;
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      rings.push(ringCircle(5, c.r * (0.5 + t * 1.25), t * c.h, 0.4 + t * 1.1, 1));
    }
    const g = loft(rings, {
      capBottom: false,
      col: (ri, fi, t) => shade(mix(start, end, Math.pow(t, 0.55)), -0.04 + (fi % 3) * 0.035),
    });
    const part = S.glow.add(g);
    part.flat = true;
    S.smoke.push({
      ...c, part, h: c.h, speed: 1.5 + rng() * 0.9, phase: rng() * 10,
      lean: 0.26 + rng() * 0.24, dir: rng() * TAU,
    });
  }
}

// ── shore ────────────────────────────────────────────────────────────────────────────────────

function buildShore(ctx, shore, den) {
  const { p, rng, terrain } = ctx;
  const wl = terrain.waterY;

  // The nearest point on the waterline is not a beach — on this coast it is usually the toe of a
  // cliff. Score candidates on how much flat strand AND open water surrounds them instead, so the
  // boats end up in a cove rather than halfway up a hillside whenever the coastline moves.
  let best = null;
  for (let i = 0; i < 1600; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 17;
    const x = shore.x + Math.cos(a) * r, z = shore.z + Math.sin(a) * r;
    if (!terrain.inBounds(x, z, 6)) continue;
    const h = terrain.heightAt(x, z);
    if (h < wl + 0.05 || h > wl + 1.2) continue;
    if (terrain.slopeAt(x, z) > 0.26) continue;
    let strand = 0, open = 0;
    for (let k = 0; k < 12; k++) {
      const b = (k / 12) * TAU;
      for (const rr of [2.4, 4.8]) {
        const px = x + Math.cos(b) * rr, pz = z + Math.sin(b) * rr;
        const ph = terrain.heightAt(px, pz);
        if (ph < wl - 0.5) open++;
        else if (ph < wl + 2.0 && terrain.slopeAt(px, pz) < 0.3) strand++;
      }
    }
    const score = strand + open * 0.55 - r * 0.42;
    if (!best || score > best.score) best = { x, z, score };
  }
  const anchor = best || { x: shore.x, z: shore.z };
  const afloat = () => {
    for (let i = 0; i < 90; i++) {
      const a = rng() * TAU, r = 1.2 + rng() * 5;
      const x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r;
      if (terrain.inBounds(x, z, 5) && terrain.heightAt(x, z) < wl - 0.25) return { x, z };
    }
    return null;
  };

  // The shore needs its own light or it is just a dark corner, and everything on it has to hug
  // the waterline rather than wander up the hillside behind it. Lights first, so the nets, posts
  // and hulls placed below pick their bounce up.
  const beach = (clear, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      const a = rng() * TAU, r = 0.8 + rng() * 5.5;
      const x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (!terrain.inBounds(x, z, 5) || h < wl + 0.05 || h > wl + 1.4) continue;
      if (!ctx.free(x, z, clear)) continue;
      return { x, z };
    }
    return null;
  };

  const lampPosts = [];
  for (let i = 0; i < 2; i++) {
    const s = beach(1.1);
    if (!s) continue;
    lampPosts.push(s);
    ctx.occupy(s.x, s.z, 0.5, 'life');
    S.lights.push({ x: s.x, y: terrain.heightAt(s.x, s.z) + 1.7, z: s.z, r: 6, s: 0.95, pool: 2, fw: 1.1 + rng(), fp: rng() * 6 });
  }
  const brazier = beach(1.1);
  if (brazier) {
    ctx.occupy(brazier.x, brazier.z, 0.5, 'life');
    S.lights.push({ x: brazier.x, y: terrain.heightAt(brazier.x, brazier.z) + 0.8, z: brazier.z, r: 6.5, s: 1.0, pool: 2, fw: 3.4, fp: 1.3 });
  }

  const boatCols = {
    hull: p.build.wood[0], deck: p.build.woodDark[0], rim: p.build.wall[0],
  };
  for (let i = 0; i < 2; i++) {
    const w = afloat();
    if (!w) break;
    const { x, z } = w;
    const m = new Mesh();
    const cols = i === 1 ? { ...boatCols, hull: p.build.roofAlt[2], rim: p.accent } : boatCols;
    m.add(hullGeo(2.9 + rng() * 0.7, 1.02, 0.52, cols), null);
    m.add(boxy(0.3, 0.06, 0.82, { cut: 0.02, taper: 0.06, col: shade(p.build.wood[2], 0.06) }), matrix({ pos: [0.35, -0.12, 0] }));
    m.add(prism(5, 0.05, 0.03, 1.9, { col: shade(p.build.wood[2], 0.05) }), matrix({ pos: [-0.55, -0.1, 0.2], rz: 0.25, rx: 0.4 }));
    if (i === 0) m.add(prism(7, 0.055, 0.035, 1.9, { rot: 0.4, col: shade(p.build.wood[2], 0.02) }), matrix({ pos: [0.25, -0.05, 0], rz: 0.06 }));
    const part = S.movers.add(m.geo());
    S.bobs.push({
      part, x, z, y: wl + 0.16, yaw: rng() * TAU,
      w: 0.94 + i * 0.31, w2: 1.42 + i * 0.24, phase: rng() * 6, amp: 0.07, roll: 0.075,
    });
    ctx.occupy(x, z, 1.4, 'life');
  }

  {
    const s = beach(1.2) || spot(ctx, { cx: anchor.x, cz: anchor.z, rMin: 1.5, rMax: 7, clear: 1.2, minWet: 0.1, slope: 0.5 });
    if (s) {
      const m = new Mesh();
      m.add(hullGeo(2.6, 0.92, 0.46, { hull: p.build.woodDark[1], deck: p.build.woodDark[2], rim: p.build.wood[1] }),
        matrix({ pos: [0, 0.46, 0] }));
      put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, rx: 0.1, rz: (rng() - 0.5) * 0.2, sink: 0.22, claim: 1.2 });
    }
  }

  for (let i = 0; i < den(4); i++) {
    const s = beach(0.8) || spot(ctx, { cx: anchor.x, cz: anchor.z, rMin: 1.5, rMax: 8, clear: 0.8, minWet: 0.05 });
    if (!s) continue;
    const m = new Mesh();
    if (i % 2 === 0) {
      for (const sx of [-1, 1]) {
        m.add(prism(5, 0.07, 0.05, 1.5, { rot: rng() * TAU, col: shade(p.build.wood[2], -0.05) }),
          matrix({ pos: [sx * 0.8, 0, 0], rz: sx * 0.16 }));
      }
      m.add(boxy(1.9, 0.05, 0.05, { cut: 0.012, taper: 0.03, col: shade(p.build.wood[2], 0.08) }), matrix({ pos: [0, 1.4, 0] }));
      for (let k = 0; k < 4; k++) {
        m.add(prism(5, 0.035, 0.012, 0.34, { col: shade(p.build.stone[1], 0.05 + k * 0.03) }),
          matrix({ pos: [-0.6 + k * 0.4, 1.02, 0.02], rz: (rng() - 0.5) * 0.2 }));
      }
    } else {
      for (let k = 0; k < 3; k++) {
        m.add(prism(7, 0.19, 0.15, 0.24, { rot: rng() * TAU, col: shade(p.build.woodDark[k % 2], -0.04 + rng() * 0.2) }),
          matrix({ pos: [(rng() - 0.5) * 0.6, k * 0.22, (rng() - 0.5) * 0.5], ry: rng() * TAU, rz: (rng() - 0.5) * 0.14 }));
      }
    }
    put(ctx, m.geo(), { x: s.x, z: s.z, ry: rng() * TAU, sink: 0.08, claim: 0.7 });
  }

  for (let i = 0; i < 5; i++) {
    const s = beach(0.5, 40);
    if (!s) continue;
    put(ctx, prism(5, 0.11, 0.085, 0.85 + rng() * 0.3, { rot: rng() * TAU, col: shade(p.build.woodDark[0], -0.05 + rng() * 0.2) }),
      { x: s.x, z: s.z, ry: rng() * TAU, rz: (rng() - 0.5) * 0.14, sink: 0.05 });
  }

  for (const s of lampPosts) {
    const m = new Mesh();
    m.add(prism(7, 0.13, 0.09, 1.5, { rot: 0.4, col: shade(p.build.woodDark[0], 0.02) }), null);
    m.add(prism(5, 0.045, 0.03, 0.44, { col: shade(p.build.metal[2], 0.06) }), matrix({ pos: [0, 1.46, 0], rz: -0.7 }));
    m.add(prism(7, 0.155, 0.13, 0.3, { rot: 0.3, col: shade(p.build.metal[2], -0.06) }), matrix({ pos: [0.3, 1.22, 0] }));
    m.add(spire(7, 0.21, 0.22, { curve: 1.3, rings: 2, col: shade(p.build.metal[2], 0.14) }), matrix({ pos: [0.3, 1.52, 0] }));
    const ry = rng() * TAU;
    put(ctx, m.geo(), { x: s.x, z: s.z, ry, rz: (rng() - 0.5) * 0.1, sink: 0.08, claim: 0.6 });
    const y = terrain.heightAt(s.x, s.z);
    const pane = S.glow.add(prism(7, 0.135, 0.115, 0.28, { rot: 0.3, col: glassCol(p) }));
    S.lamps.push({
      part: pane, kind: 'lamp', w: 1.1 + rng() * 1.3, phase: rng() * 6, amp: 0.16,
      x: s.x + Math.cos(ry) * 0.3, y: y + 1.24, z: s.z - Math.sin(ry) * 0.3,
    });
  }

  if (brazier) {
    const m = new Mesh();
    m.add(prism(7, 0.2, 0.11, 0.66, { rot: 0.4, col: shade(p.build.metal[2], -0.05) }), null);
    m.add(prism(7, 0.3, 0.36, 0.3, { rot: 0.4, col: shade(p.build.metal[0], 0.04) }), matrix({ pos: [0, 0.62, 0] }));
    m.add(blob(0.24, 0, { jitter: 0.3, stretch: 0.4, rng, col: shade(p.build.trim[2], -0.3) }), matrix({ pos: [0, 0.8, 0] }));
    put(ctx, m.geo(), { x: brazier.x, z: brazier.z, ry: rng() * TAU, sink: 0.06, claim: 0.6 });
    const y = terrain.heightAt(brazier.x, brazier.z);
    [[0.32, 0.4], [0.19, 0.6]].forEach((f, i) => {
      const c = i ? mix(p.lit.warm, '#ffffff', 0.12) : mix(p.lit.warm, p.build.roof[0], 0.5);
      const g = spire(5, f[0], f[1], { curve: 0.85, rings: 3, rot: i, col: (ri, fi, tt) => shade(c, -0.16 + tt * 0.14) });
      S.lamps.push({
        part: S.glow.add(g), kind: 'flame', x: brazier.x, y: y + 0.78, z: brazier.z,
        w: 3.4 + i * 2.1, phase: 1.3 + i * 2.4, amp: 0.17 + i * 0.05,
      });
    });
    S.brazier = { x: brazier.x, y: y + 1.6, z: brazier.z };
  }

  S.shore = anchor;
}

// ── people ───────────────────────────────────────────────────────────────────────────────────

function buildPeople(ctx, C, seeds, den) {
  const { rng, terrain } = ctx;
  const kit = villagerKit(ctx.p, rng);
  const adopted = adoptPaths(ctx);
  const loops = adopted.length ? adopted : [ringPath(ctx, C.x, C.z, 10.5, 14), ringPath(ctx, C.x, C.z, 6.2, 11)];

  const walkers = den(7);
  for (let i = 0; i < walkers; i++) {
    const v = kit[i % kit.length];
    const path = loops[i % loops.length];
    S.villagers.push(mkVillager(v, {
      path, u: rng() * path.len, speed: 0.72 + rng() * 0.55,
      stride: 0.72 * (v.scale || 1), sway: 0, phase: rng() * 10, rng,
    }));
  }

  const idlers = den(6);
  for (let i = 0; i < idlers; i++) {
    const src = seeds.length ? seeds[i % seeds.length] : C;
    const s = spot(ctx, { cx: src.x, cz: src.z, rMin: 0.9, rMax: 3.6, clear: 0.6, tries: 30 });
    if (!s) continue;
    const v = kit[(i + 3) % kit.length];
    S.villagers.push(mkVillager(v, {
      x: s.x, z: s.z, y: terrain.heightAt(s.x, s.z),
      yaw: Math.atan2(src.x - s.x, src.z - s.z) + (rng() - 0.5) * 1.2,
      speed: 0, phase: rng() * 10, sway: 0.9 + rng() * 1.3, rng,
    }));
    ctx.occupy(s.x, s.z, 0.45, 'life');
  }

  if (S.shore) {
    const s = spot(ctx, { cx: S.shore.x, cz: S.shore.z, rMin: 1, rMax: 6, clear: 0.6, minWet: 0.05, tries: 30 });
    if (s) {
      S.villagers.push(mkVillager(kit[4], {
        x: s.x, z: s.z, y: terrain.heightAt(s.x, s.z), yaw: rng() * TAU,
        speed: 0, phase: rng() * 10, sway: 1.6, rng,
      }));
    }
  }
}

function mkVillager(v, o) {
  const parts = v.parts.map(q => ({ ...q, part: S.movers.add(q.geo.clone()) }));
  return {
    parts, scale: v.scale || 1, stride: o.stride || 0.75,
    path: o.path || null, u: o.u || 0, speed: o.speed || 0,
    x: o.x || 0, y: o.y || 0, z: o.z || 0, yaw: o.yaw || 0,
    sway: o.sway || 0, phase: o.phase || 0,
    lean: (o.rng() - 0.5) * 0.11,
  };
}

// ── update ───────────────────────────────────────────────────────────────────────────────────

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _q = new THREE.Matrix4();
const _d = [0, 0, 0];
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _qt = new THREE.Quaternion();
const pose = (x, y, z, rx, ry, rz, s) => {
  _v.set(x, y, z);
  _e.set(rx, ry, rz);
  _qt.setFromEuler(_e);
  _sc.set(s ?? 1, s ?? 1, s ?? 1);
  return _m.compose(_v, _qt, _sc);
};

export function update(dt, app) {
  if (!S) return;
  S.t += dt;
  const t = S.t;

  for (const v of S.villagers) {
    let x = v.x, z = v.z, yaw = v.yaw, moving = 0;
    if (v.path) {
      v.u += v.speed * dt;
      const s = sampleP(v.path, v.u);
      x = s.x; z = s.z; yaw = s.yaw; moving = 1;
      v.x = x; v.z = z; v.yaw = yaw;
      v.y = S.height(x, z);
    }
    const gait = moving ? (v.u / v.stride) * TAU : 0;
    const bob = moving ? Math.abs(Math.sin(gait)) * 0.035 : Math.sin(t * v.sway * 0.6 + v.phase) * 0.012;
    const idle = moving ? 0 : Math.sin(t * v.sway + v.phase) * 0.09;

    pose(x, v.y + bob, z, v.lean, yaw + idle * 0.3, 0, v.scale);
    for (const q of v.parts) {
      let ang = 0;
      if (q.role === 'leg') ang = moving ? Math.sin(gait + (q.side > 0 ? 0 : Math.PI)) * 0.5 : 0;
      else if (q.role === 'arm') ang = moving ? Math.sin(gait + (q.side > 0 ? Math.PI : 0)) * 0.38 : idle * (q.side || 1) * 0.5;
      if (q.tilt) ang += q.tilt;
      _r.makeTranslation(q.off[0], q.off[1], q.off[2]);
      if (ang) _r.multiply(_q.makeRotationX(ang));
      if (q.role === 'head') _r.multiply(_q.makeRotationY(Math.sin(t * 0.63 + v.phase) * 0.22));
      S.movers.write(q.part, _q.multiplyMatrices(_m, _r));
    }
  }

  for (const a of S.animals) {
    let moving = 0;
    if (a.path) {
      a.u += a.speed * dt;
      const s = sampleP(a.path, a.u);
      a.x = s.x; a.z = s.z; a.yaw = s.yaw; a.y = S.height(a.x, a.z);
      moving = 1;
    }
    const gait = moving ? (a.u / a.stride) * TAU : 0;
    const bob = moving ? Math.abs(Math.sin(gait)) * 0.03 : 0;
    const shift = moving ? 0 : Math.sin(t * a.w1 * 0.5 + a.phase) * 0.06;
    pose(a.x, a.y + bob, a.z, a.tilt, a.yaw + shift, 0, a.scale);
    const graze = a.graze ? (Math.sin(t * a.w1 * 0.62 + a.phase) * 0.5 + 0.5) : 0;
    const peck = a.peck ? Math.max(0, Math.sin(t * a.w2 + a.phase)) ** 3 : 0;
    for (const q of a.parts) {
      _r.makeTranslation(q.off[0], q.off[1], q.off[2]);
      if (q.role === 'head') {
        const drop = moving ? Math.sin(gait * 0.5) * 0.08 : graze * 0.62 + peck * 0.9;
        _r.multiply(_q.makeRotationX(drop));
        _r.multiply(_q.makeRotationY(Math.sin(t * a.w1 * 0.9 + a.phase * 1.7) * 0.18));
        _r.multiply(_q.makeTranslation(0, -drop * 0.16, 0));
      } else if (q.role === 'tail') {
        if (q.rest) _r.multiply(_q.makeRotationX(q.rest[0]));
        _r.multiply(_q.makeRotationZ(Math.sin(t * a.w2 * 1.6 + a.phase) * (moving ? 0.55 : 0.3)));
      }
      S.movers.write(q.part, _q.multiplyMatrices(_m, _r));
    }
  }

  for (const b of S.birds) {
    const u = t * b.w + b.phase;
    const x = b.cx + Math.cos(u) * b.rx;
    const z = b.cz + Math.sin(u * 1.37 + 0.6) * b.rz;
    const y = b.cy + Math.sin(t * b.wy * 3.1 + b.phase) * b.ry;
    const nx = b.cx + Math.cos(u + 0.05) * b.rx - x;
    const nz = b.cz + Math.sin((u + 0.05) * 1.37 + 0.6) * b.rz - z;
    const yaw = Math.atan2(nx, nz);
    const flap = Math.sin(t * b.flap + b.phase);
    pose(x, y, z, 0, yaw, Math.cos(u) * 0.25, b.scale);
    for (const q of b.parts) {
      _r.makeTranslation(q.off[0], q.off[1], q.off[2]);
      if (q.role === 'wing') _r.multiply(_q.makeRotationZ(-q.side * (flap * 0.7 + 0.1)));
      S.movers.write(q.part, _q.multiplyMatrices(_m, _r));
    }
  }

  for (const b of S.bobs) {
    S.movers.write(b.part, pose(
      b.x, b.y + Math.sin(t * b.w + b.phase) * b.amp, b.z,
      Math.sin(t * b.w2 + b.phase * 1.3) * b.roll, b.yaw, Math.cos(t * b.w * 0.83 + b.phase) * b.roll * 0.7, 1));
  }

  for (const c of S.cloth) {
    if (c.kind === 'flag') {
      const k = c.wv;
      pose(c.x, c.y, c.z, 0, c.ry + Math.sin(t * 0.21) * 0.25, 0, 1);
      S.drape.write(c.part, _m, (x, y, z) => {
        const u = x / c.w;
        _d[0] = x; _d[1] = y + Math.sin(u * 5.0 - t * k * 1.3) * 0.05 * u;
        _d[2] = z + Math.sin(u * 5.6 - t * k) * c.amp * u * u;
        return _d;
      });
    } else {
      const sway = Math.sin(t * c.w + c.phase) * c.amp;
      pose(c.x, c.y, c.z, 0, c.ry, 0, 1);
      S.drape.write(c.part, _m, (x, y, z) => {
        const s = -y / c.h;
        _d[0] = x + sway * 0.35 * s;
        _d[1] = y * (1 - 0.04 * s * Math.abs(sway) * 4);
        _d[2] = z + sway * s * s + Math.sin(t * c.w * 1.9 + x * 3 + c.phase) * 0.02 * s;
        return _d;
      });
    }
  }

  for (const L of S.lamps) {
    const f = 1 + Math.sin(t * L.w + L.phase) * L.amp + Math.sin(t * L.w * 2.7 + L.phase * 2) * L.amp * 0.4;
    if (L.kind === 'flame') {
      const w = 0.92 + (f - 1) * 0.7;
      _v.set(L.x, L.y, L.z);
      _e.set(0, t * 0.7 + L.phase, Math.sin(t * L.w * 1.7 + L.phase) * 0.14);
      _qt.setFromEuler(_e);
      _sc.set(w, 0.96 + (f - 1) * 0.9, w);
      S.glow.write(L.part, _m.compose(_v, _qt, _sc));
    } else if (!L.placed) {
      S.glow.write(L.part, pose(L.x, L.y, L.z, L.rx || 0, L.yaw || 0, 0, 1));
      L.placed = true;
    }
    S.glow.scaleColor(L.part, f);
  }

  for (const c of S.smoke) {
    const ph = t * c.speed + c.phase;
    const dx = Math.cos(c.dir) * c.lean, dz = Math.sin(c.dir) * c.lean;
    pose(c.x, c.y, c.z, 0, 0, 0, 1);
    S.glow.write(c.part, _m, (x, y, z) => {
      const u = y / c.h;
      const k = 1 + 0.28 * Math.sin(u * 6.2 - ph * 2.1);
      const s = Math.sin(u * 3.1 - ph) * 0.24 * u;
      _d[0] = x * k + dx * u * u * c.h + s;
      _d[1] = y;
      _d[2] = z * k + dz * u * u * c.h + Math.cos(u * 2.4 - ph * 0.8) * 0.2 * u;
      return _d;
    });
  }

  S.movers.flush();
  S.drape.flush();
  S.glow.flush(true);
}
