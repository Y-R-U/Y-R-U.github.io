// Everything that grows or erodes — the tree kit, the undergrowth, the rock, and the clustering
// that decides where any of it stands.

import * as THREE from 'three';
import {
  Mesh, blob, prism, loft, ringCircle, moveRing, gradient, speckle, jitter,
  transform, mix, shade, rgb,
} from './shape.js';
import { noise2 } from './rng.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

// shape.js's shade() moves value but holds hue. Foliage needs the other half of the rule: a
// shadow rotates toward the sky hue and gains saturation, a highlight rotates toward the sun and
// loses a little. Worth the HSL round-trip at build time; it is what stops shade going grey.
const _col = new THREE.Color();
const _hsl = {};
function tone(c, hueTo, hueAmt, sat, lum) {
  const [r, g, b] = rgb(c);
  _col.setRGB(r, g, b);
  _col.getHSL(_hsl, THREE.SRGBColorSpace);
  let d = hueTo - _hsl.h;
  if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
  const h = (_hsl.h + clamp(d, -hueAmt, hueAmt) + 1) % 1;
  _col.setHSL(h, clamp(_hsl.s * sat, 0, 1), clamp(_hsl.l * lum, 0, 1), THREE.SRGBColorSpace);
  return [_col.r, _col.g, _col.b];
}
const cool = (c, k = 1) => tone(c, 0.58, 0.055 * k, 1 + 0.24 * k, 1 - 0.34 * k);
const warm = (c, k = 1) => tone(c, 0.12, 0.045 * k, 1 - 0.10 * k, 1 + 0.22 * k);
const hueRoll = (c, amt, rng) => tone(c, (rng() < 0.5 ? 0.02 : 0.42), amt, 1 + (rng() - 0.5) * 0.16, 1 + (rng() - 0.5) * 0.14);

// Recolours whole triangles after a gradient pass — undersides of a conifer skirt, the shaded
// half of a canopy mass. gradient() overwrites, this modulates.
function faceTone(geo, pick, fn) {
  const col = geo.attributes.color.array;
  const n = col.length / 9;
  for (let f = 0; f < n; f++) {
    if (!pick(f)) continue;
    const o = f * 9;
    const c = fn([col[o], col[o + 1], col[o + 2]]);
    for (let j = 0; j < 3; j++) { col[o + j * 3] = c[0]; col[o + j * 3 + 1] = c[1]; col[o + j * 3 + 2] = c[2]; }
  }
  return geo;
}

// A vertical light ramp that modulates whatever colours are already there instead of replacing
// them, so a rock can carry strata bands AND a top-lit gradient at once.
function vtone(geo, low, high, power = 1) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const span = Math.max(1e-4, max.y - min.y);
  const col = geo.attributes.color.array;
  const pos = geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 9) {
    const t = Math.pow(clamp(((pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - min.y) / span, 0, 1), power);
    const k = low + (high - low) * t;
    const c = k < 0 ? cool([col[i], col[i + 1], col[i + 2]], -k) : warm([col[i], col[i + 1], col[i + 2]], k);
    for (let j = 0; j < 3; j++) { col[i + j * 3] = c[0]; col[i + j * 3 + 1] = c[1]; col[i + j * 3 + 2] = c[2]; }
  }
  return geo;
}

// Banded rock. The band boundary wobbles with position or it reads as a painted stripe.
function strata(geo, cols, { bands = 4, wobble = 0.5 } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const span = Math.max(1e-4, max.y - min.y);
  const pos = geo.attributes.position.array;
  const col = geo.attributes.color.array;
  const k = cols.map(c => rgb(c));
  for (let i = 0; i < pos.length; i += 9) {
    const yc = ((pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - min.y) / span;
    const xz = (pos[i] + pos[i + 2] * 1.7) * 0.6;
    const w = (Math.sin(xz) * 0.5 + Math.sin(xz * 2.3 + 1.1) * 0.5) * wobble / bands;
    const b = clamp(Math.floor((yc + w) * bands), 0, bands - 1);
    const c = k[b % k.length];
    for (let j = 0; j < 3; j++) { col[i + j * 3] = c[0]; col[i + j * 3 + 1] = c[1]; col[i + j * 3 + 2] = c[2]; }
  }
  return geo;
}

// A tapered swept stem that knows where its own tip ended up. Trunks, branches, reeds and
// mushroom stalks are all this.
function stem(sides, r0, r1, h, { lean = 0, dir = 0, rings = 2, rot = 0, col, capTop = true, capBottom = false } = {}) {
  const stack = [];
  let x = 0, y = 0, z = 0;
  const step = h / rings;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    if (i > 0) {
      const a = lean * Math.pow(t, 1.35);
      x += Math.sin(a) * Math.cos(dir) * step;
      z += Math.sin(a) * Math.sin(dir) * step;
      y += Math.cos(a) * step;
    }
    stack.push(moveRing(ringCircle(sides, r0 + (r1 - r0) * t, 0, rot + t * 0.3), x, y, z));
  }
  return { geo: loft(stack, { col, capBottom, capTop }), tip: [x, y, z] };
}

const bark = (p, rng) => {
  const [mid, light, dark] = p.flora.trunk;
  return (ri, fi, t) => {
    const u = clamp(t, 0, 1);
    const base = mix(mix(dark, mid, 0.72), mix(mid, light, 0.45 + u * 0.5), 0.5 + u * 0.42);
    return shade(base, (rng() - 0.5) * 0.18);
  };
};

// ── conifers ────────────────────────────────────────────────────────────────────────────────
// The best silhouette in the kit. Each tier is a low-segment cone with a jagged, drooping rim
// and its own shallow inverted underside, and every tier is yawed off the last by the golden
// angle so no two rims line up.

function conifer(rng, p, { h = 8, r = 1.7, tiers = 5, sides = 7, hue = 0 } = {}) {
  const [nMid, nLight, nDark] = p.flora.needle;
  const mid = shade(hue ? hueRoll(nMid, hue, rng) : nMid, (rng() - 0.5) * 0.24);

  const tr = r * 0.115;
  const trunk = stem(5, tr * 1.35, tr * 0.5, h * (0.34 + rng() * 0.12), {
    rings: 2, rot: rng() * TAU, lean: (rng() - 0.5) * 0.1, dir: rng() * TAU, col: bark(p, rng),
  }).geo;

  const fol = new Mesh();
  const unders = [];
  let y = h * (0.13 + rng() * 0.05);
  let rot = rng() * TAU;
  let f = 0;
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const rim = r * Math.pow(1 - t, 0.66) * (0.9 + rng() * 0.2) + r * 0.07;
    const tierH = h * (0.30 - 0.115 * t) * (0.88 + rng() * 0.3);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * TAU;
      const spike = k % 2 ? 1 : 0.76;
      const rad = rim * spike * (0.84 + rng() * 0.34);
      ring.push([Math.cos(a) * rad, y - rim * 0.16 * rng(), Math.sin(a) * rad]);
    }
    const apex = [(rng() - 0.5) * rim * 0.16, y + tierH, (rng() - 0.5) * rim * 0.16];
    const under = [0, y - rim * (0.24 + rng() * 0.16), 0];
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      fol.tri(ring[k], apex, ring[j], mid); f++;
      fol.tri(ring[j], under, ring[k], mid); unders.push(f); f++;
    }
    y += tierH * (0.40 + rng() * 0.14);
    rot += 2.399963;
  }

  // The leader — a thin spike well under 15% of the mass width, which is the cheapest
  // silhouette breaker in the whole style.
  const lead = r * 0.1;
  const tipY = y + h * 0.12;
  const base = [];
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * TAU;
    base.push([Math.cos(a) * lead, y - h * 0.02, Math.sin(a) * lead]);
  }
  for (let k = 0; k < 5; k++) { fol.tri(base[k], [0, tipY, 0], base[(k + 1) % 5], mid); f++; }

  const geo = fol.geo();
  gradient(geo, cool(mid, 1.4), warm(mix(mid, nLight, 0.8), 0.28), { power: 0.75 });
  const set = new Set(unders);
  faceTone(geo, i => set.has(i), c => mix(cool(c, 0.85), cool(nDark, 0.5), 0.45));
  speckle(geo, 0.075, rng);
  return [[trunk, 'solid'], [geo, 'foliage']];
}

// ── broadleaf ───────────────────────────────────────────────────────────────────────────────
// A canopy is never one sphere. Three to six overlapping masses at different scales, each with
// its own vertical gradient so each reads as a separate volume, and the lower ones pre-darkened.

function canopyMass(rng, p, r, at, base, occ, { squash = 1, stretch = 1, light = null } = {}) {
  const c = shade(base, -occ * 0.3);
  const g = blob(r, 0, { jitter: 0.26, squash, stretch, rng, col: c });
  // The top stop blends toward the palette's own light entry rather than past it — warming a
  // highlight that the sun is already going to lift is how foliage goes chalky.
  const top = warm(mix(c, light || p.flora.canopy[1], 0.72 - occ * 0.3), 0.25);
  gradient(g, cool(c, 1.25 + occ * 0.5), top, { power: 0.9 });
  return transform(g, { pos: at, ry: rng() * TAU, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5 });
}

function broadleaf(rng, p, { h = 7, kind = 'round', hue = 0.05, alt = false, masses = 5 } = {}) {
  const src = alt ? p.flora.canopyAlt : p.flora.canopy;
  // A per-tree value roll on top of the hue roll: two overlapping canopies of the same species
  // must still separate by value or their silhouettes fuse into one green mass.
  const base = shade(hueRoll(src[0], hue, rng), (rng() - 0.5) * 0.26);
  const litSrc = src[1];
  const trunkFrac = kind === 'fork' ? 0.56 : kind === 'tall' ? 0.46 : 0.40;
  const lean = (rng() - 0.5) * (kind === 'fork' ? 0.26 : 0.17);
  const dir = rng() * TAU;
  const r0 = h * (kind === 'sapling' ? 0.028 : 0.045);

  const wood = new Mesh();
  const t = stem(5, r0 * 1.25, r0 * 0.52, h * trunkFrac, {
    rings: 2, rot: rng() * TAU, lean, dir, col: bark(p, rng),
  });
  wood.add(t.geo);

  const fol = new Mesh();
  const W = h * (kind === 'tall' ? 0.16 : kind === 'sapling' ? 0.18 : 0.235);

  if (kind === 'fork') {
    const n = masses >= 5 ? 3 : 2;
    const a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (rng() - 0.5) * 0.7;
      const bl = h * (0.22 + rng() * 0.16);
      const b = stem(5, r0 * 0.5, r0 * 0.22, bl, {
        rings: 1, lean: 0.7 + rng() * 0.5, dir: a, rot: rng() * TAU, col: bark(p, rng),
      });
      wood.add(b.geo, new THREE.Matrix4().makeTranslation(t.tip[0], t.tip[1], t.tip[2]));
      const at = [t.tip[0] + b.tip[0], t.tip[1] + b.tip[1] + W * 0.3, t.tip[2] + b.tip[2]];
      fol.add(canopyMass(rng, p, W * (0.58 + rng() * 0.22), at, base, 0.25 + rng() * 0.2, { stretch: 0.8, squash: 1.15, light: litSrc }));
    }
    fol.add(canopyMass(rng, p, W * 0.72, [t.tip[0] * 0.6, t.tip[1] + W * 0.62, t.tip[2] * 0.6], base, 0, { stretch: 0.78, squash: 1.1, light: litSrc }));
  } else if (kind === 'tall') {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const rr = W * (1.05 - Math.abs(u - 0.35) * 0.7);
      fol.add(canopyMass(rng, p, rr, [
        t.tip[0] + (rng() - 0.5) * W * 0.4,
        t.tip[1] + W * (0.5 + u * 1.9),
        t.tip[2] + (rng() - 0.5) * W * 0.4,
      ], base, (1 - u) * 0.5, { stretch: 1.25, squash: 0.95, light: litSrc }));
    }
  } else if (kind === 'sapling') {
    fol.add(canopyMass(rng, p, W, [t.tip[0], t.tip[1] + W * 0.55, t.tip[2]], base, 0.1, { stretch: 0.95, light: litSrc }));
    if (rng() < 0.6) fol.add(canopyMass(rng, p, W * 0.62, [t.tip[0] + W * 0.6, t.tip[1] + W * 0.25, t.tip[2] - W * 0.3], base, 0.4, { stretch: 0.85, light: litSrc }));
  } else {
    const n = clamp(masses - 1, 2, 5) + (rng() < 0.4 ? 1 : 0);
    const a0 = rng() * TAU;
    fol.add(canopyMass(rng, p, W * 0.94, [t.tip[0], t.tip[1] + W * 0.85, t.tip[2]], base, 0.05, { stretch: 0.9, squash: 1.05, light: litSrc }));
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (rng() - 0.5) * 0.8;
      const d = W * (0.62 + rng() * 0.48);
      const u = rng();
      fol.add(canopyMass(rng, p, W * (0.42 + rng() * 0.46), [
        t.tip[0] + Math.cos(a) * d,
        t.tip[1] + W * (0.3 + u * 0.95),
        t.tip[2] + Math.sin(a) * d,
      ], base, 0.55 - u * 0.5, { stretch: 0.86, squash: 1.12, light: litSrc }));
    }
  }

  const geo = fol.geo();
  speckle(geo, 0.07, rng);
  return [[wood.geo(), 'solid'], [geo, 'foliage']];
}

// Splayed buttress roots. Only worth it on the hero trees, but it is the difference between a
// trunk standing on the ground and one pushed into it.
function roots(rng, p, r) {
  const m = new Mesh();
  const n = 3 + (rng() < 0.5 ? 1 : 0);
  const a0 = rng() * TAU;
  const col = bark(p, rng);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (rng() - 0.5) * 0.9;
    const s = stem(5, r * 0.55, r * 0.16, r * (1.5 + rng()), {
      rings: 1, lean: 1.15 + rng() * 0.3, dir: a, rot: rng() * TAU, col, capTop: false,
    });
    m.add(s.geo);
  }
  return m.geo();
}

// ── shrubs ──────────────────────────────────────────────────────────────────────────────────

// `warmSrc` is the odd one out on purpose: most shrubs share the needle/bush green so the few
// that take the canopy hue read as accents rather than as a field of identical berries.
function bush(rng, p, { r = 1, dry = false, warmSrc = false } = {}) {
  const src = warmSrc ? (rng() < 0.5 ? p.flora.canopyAlt : p.flora.bush)
    : (dry ? p.flora.needle : (rng() < 0.72 ? p.flora.needle : p.flora.bush));
  // Understory sits in its own shade, so a shrub reads as a shrub only if it is clearly darker
  // than the grass it stands in — a bush at canopy value looks like a mossy rock.
  const base = shade(hueRoll(src[0], 0.05, rng), -0.16 + (rng() - 0.5) * 0.18);
  const m = new Mesh();
  const n = r < 0.8 ? 1 : 2 + (rng() < 0.6 ? 1 : 0);
  const a0 = rng() * TAU;
  m.add(canopyMass(rng, p, r * 0.92, [0, r * 0.38, 0], base, 0.12, { stretch: 0.46, squash: 1.2, light: src[1] }));
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (rng() - 0.5) * 0.9;
    const d = r * (0.5 + rng() * 0.45);
    m.add(canopyMass(rng, p, r * (0.5 + rng() * 0.3), [
      Math.cos(a) * d, r * (0.2 + rng() * 0.3), Math.sin(a) * d * 1.3,
    ], base, 0.4 + rng() * 0.3, { stretch: 0.44, squash: 1.28, light: src[1] }));
  }
  // Sprigs poking out of the mass. Without them a shrub is a smooth lump and reads as stone.
  for (let i = 0, n2 = (r < 0.8 ? 3 : 4) + rng.int(0, 3); i < n2; i++) {
    const a = rng() * TAU, d = r * (0.35 + rng() * 0.75);
    blade(m, Math.cos(a) * d, Math.sin(a) * d * 1.2, r * 0.13, r * (0.9 + rng() * 0.85),
      0.5 + rng() * 0.5, a + (rng() - 0.5), warm(mix(base, src[1], 0.4), 0.2));
  }
  const g = m.geo();
  speckle(g, 0.08, rng);
  return [[g, 'foliage']];
}

// ── rock ────────────────────────────────────────────────────────────────────────────────────

// Stone in the reference set is among the *brightest* things in frame — the value separation
// comes from the facet angles under the sun, not from a dark base colour. So the base sits at or
// above the palette's lit rock and only the underside is allowed to fall away.
function stoneBands(p, rng) {
  const g = p.ground.rock;
  const pale = warm(g[1], 0.9);
  return [mix(g[0], g[1], 0.55), pale, mix(g[1], pale, 0.55), warm(g[1], 0.45), g[1]]
    .map(c => shade(c, (rng() - 0.5) * 0.05));
}

function boulder(rng, p, { r = 1, angular = false } = {}) {
  const g = p.ground.rock;
  let geo;
  if (angular) {
    const sides = rng() < 0.5 ? 7 : 5;
    geo = prism(sides, r, r * (0.42 + rng() * 0.22), r * (1.1 + rng() * 0.6), {
      rings: 2, rot: rng() * TAU, twist: (rng() - 0.5) * 0.6, col: g[1],
    });
    jitter(geo, r * 0.15, rng);
  } else {
    geo = blob(r, 0, { jitter: 0.34, rng, col: g[1], stretch: 0.85 });
  }
  strata(geo, stoneBands(p, rng), { bands: 3 + (rng() < 0.5 ? 1 : 0), wobble: 0.7 });
  vtone(geo, -0.18, 0.42, 1.1);
  speckle(geo, 0.055, rng);
  const sy = 0.36 + rng() * 0.26;
  const sz = 1.18 + rng() * 0.34;
  transform(geo, {
    ry: rng() * TAU,
    scale: [1, angular ? 0.62 + rng() * 0.3 : sy, angular ? 1.25 + rng() * 0.3 : sz],
  });
  if (!angular) transform(geo, { pos: [0, r * sy * 0.72, 0] });
  return [[geo, 'solid']];
}

// A cliff outcrop is a boulder that got a budget: three leaning masses with visible strata,
// standing where the ground is too steep for anything to grow.
function outcrop(rng, p, { r = 2.4, h = 3 } = {}) {
  const g = p.ground.rock;
  const cols = stoneBands(p, rng);
  const m = new Mesh();
  const n = 2 + (rng() < 0.65 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const rr = r * (i ? 0.42 + rng() * 0.34 : 1);
    const hh = h * (i ? 0.35 + rng() * 0.4 : 1);
    const geo = prism(i ? 5 : 9, rr, rr * (0.36 + rng() * 0.2), hh, {
      rings: i ? 2 : 3, rot: rng() * TAU, twist: (rng() - 0.5) * 0.5, col: g[1], capBottom: false,
    });
    jitter(geo, rr * 0.26, rng);
    strata(geo, cols, { bands: 5, wobble: 0.85 });
    vtone(geo, -0.1, 0.4, 1.2);
    const a = i ? rng() * TAU : 0;
    const d = i ? r * (0.7 + rng() * 0.5) : 0;
    transform(geo, {
      pos: [Math.cos(a) * d, -hh * (i ? 0.18 : 0.06), Math.sin(a) * d * 1.2],
      ry: rng() * TAU, rx: (rng() - 0.5) * 0.62, rz: (rng() - 0.5) * 0.62,
      scale: [1, 0.8, 1.3],
    });
    m.add(geo);
  }
  const geo = m.geo();
  speckle(geo, 0.07, rng);
  return [[geo, 'solid']];
}

function scree(rng, p, { r = 1.6, n = 7 } = {}) {
  const g = p.ground.rock;
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const s = r * (0.1 + rng() * 0.16);
    const geo = prism(5, s, s * (0.4 + rng() * 0.25), s * (0.6 + rng() * 0.5), {
      rings: 1, rot: rng() * TAU, capBottom: false,
      col: shade(rng() < 0.45 ? warm(g[1], 0.75) : mix(g[1], g[0], rng() * 0.85), (rng() - 0.5) * 0.14),
    });
    jitter(geo, s * 0.22, rng);
    const a = rng() * TAU, d = r * Math.sqrt(rng());
    transform(geo, {
      pos: [Math.cos(a) * d, -s * 0.2, Math.sin(a) * d * 1.3],
      ry: rng() * TAU, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5, scale: [1, 0.55, 1.3],
    });
    m.add(geo);
  }
  return [[m.geo(), 'solid']];
}

// ── deadwood ────────────────────────────────────────────────────────────────────────────────

function log(rng, p, { r = 0.3, len = 3 } = {}) {
  const m = new Mesh();
  const col = bark(p, rng);
  const s = stem(7, r, r * 0.68, len, { rings: 2, rot: rng() * TAU, lean: 0.12 + rng() * 0.2, dir: rng() * TAU, col });
  const g = s.geo;
  transform(g, { rz: Math.PI * 0.5, ry: rng() * TAU });
  m.add(g);
  const n = rng() < 0.6 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const b = stem(5, r * 0.34, r * 0.12, r * (1.6 + rng() * 1.6), {
      rings: 1, lean: 1.1 + rng() * 0.5, dir: rng() * TAU, rot: rng() * TAU, col, capTop: false,
    });
    transform(b.geo, { pos: [(rng() - 0.5) * len * 0.7, r * 0.6, (rng() - 0.5) * len * 0.5], rx: (rng() - 0.5) * 1.2 });
    m.add(b.geo);
  }
  const geo = m.geo();
  transform(geo, { pos: [0, r * 0.82, 0] });
  speckle(geo, 0.09, rng);
  return [[geo, 'solid']];
}

function stump(rng, p, { r = 0.5, h = 0.7 } = {}) {
  const col = bark(p, rng);
  const g = prism(7, r * 1.15, r * 0.86, h, { rings: 1, rot: rng() * TAU, col, capTop: false });
  jitter(g, r * 0.12, rng, { axis: [1, 0.6, 1] });
  const m = new Mesh().add(g);
  const heart = warm(mix(p.flora.trunk[0], p.flora.trunk[1], 0.5), 0.3);
  const rim = ringCircle(7, r * 0.8, h * 0.86, rng() * TAU);
  const c = [0, h * 0.7, 0];
  for (let i = 0; i < 7; i++) m.tri(c, rim[i], rim[(i + 1) % 7], shade(heart, (rng() - 0.5) * 0.16));
  const geo = m.geo();
  speckle(geo, 0.08, rng);
  return [[geo, 'solid']];
}

// ── undergrowth ─────────────────────────────────────────────────────────────────────────────

function blade(m, x, z, w, h, lean, dir, col) {
  const c = Math.cos(dir), s = Math.sin(dir);
  const px = -s * w * 0.5, pz = c * w * 0.5;
  const sl = Math.sin(lean) * h;
  const tx = x + sl * c, tz = z + sl * s, ty = Math.cos(lean) * h;
  m.quad(
    [x - px, 0, z - pz], [x + px, 0, z + pz],
    [tx + px * 0.13, ty, tz + pz * 0.13], [tx - px * 0.13, ty, tz - pz * 0.13], col,
  );
}

function tuft(rng, p, { h = 0.55, n = 5, src = null, spread = 0.3 } = {}) {
  const t = src || p.ground.grass;
  const base = hueRoll(t[0], 0.04, rng);
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = spread * Math.sqrt(rng());
    blade(m, Math.cos(a) * d, Math.sin(a) * d, h * (0.23 + rng() * 0.13), h * (0.6 + rng() * 0.75),
      0.16 + rng() * 0.42, rng() * TAU, base);
  }
  const g = m.geo();
  gradient(g, cool(base, 0.7), warm(t[1], 0.5), { power: 0.7 });
  speckle(g, 0.09, rng);
  return [[g, 'foliage']];
}

function reeds(rng, p, { h = 1.5, n = 7 } = {}) {
  const t = p.flora.reed;
  const base = hueRoll(t[0], 0.04, rng);
  const m = new Mesh();
  const heads = [];
  let f = 0;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = 0.34 * Math.sqrt(rng());
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const hh = h * (0.55 + rng() * 0.8);
    const lean = 0.1 + rng() * 0.34, dir = rng() * TAU;
    blade(m, x, z, h * 0.055, hh, lean, dir, base); f += 2;
    if (rng() < 0.45) {
      const sl = Math.sin(lean) * hh;
      const hx = x + sl * Math.cos(dir), hz = z + sl * Math.sin(dir), hy = Math.cos(lean) * hh;
      const hr = h * 0.05;
      const ring = ringCircle(5, hr, 0, rng() * TAU);
      for (let k = 0; k < 5; k++) {
        const j = (k + 1) % 5;
        m.tri([hx + ring[k][0], hy, hz + ring[k][2]], [hx, hy + h * 0.22, hz], [hx + ring[j][0], hy, hz + ring[j][2]], base);
        heads.push(f++);
      }
    }
  }
  const g = m.geo();
  gradient(g, cool(base, 1.15), warm(t[1], 0.6), { power: 0.65 });
  const set = new Set(heads);
  const seed = warm(p.flora.trunk[1], 0.55);
  faceTone(g, i => set.has(i), c => mix(c, seed, 0.72));
  speckle(g, 0.09, rng);
  return [[g, 'foliage']];
}

function fern(rng, p, { r = 0.7 } = {}) {
  const src = p.flora.bush;
  const base = hueRoll(src[0], 0.05, rng);
  const m = new Mesh();
  const n = 5 + (rng() < 0.5 ? 1 : 0);
  const a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const dir = a0 + (i / n) * TAU + (rng() - 0.5) * 0.6;
    const c = Math.cos(dir), s = Math.sin(dir);
    const L = r * (0.85 + rng() * 0.5);
    const w = r * (0.2 + rng() * 0.1);
    const my = r * (0.62 + rng() * 0.25), mx = c * L * 0.5, mz = s * L * 0.5;
    const ty = my * (0.55 + rng() * 0.2), tx = c * L, tz = s * L;
    const px = -s * w * 0.5, pz = c * w * 0.5;
    m.quad([-px * 0.35, 0, -pz * 0.35], [px * 0.35, 0, pz * 0.35],
      [mx + px, my, mz + pz], [mx - px, my, mz - pz], base);
    m.tri([mx - px, my, mz - pz], [mx + px, my, mz + pz], [tx, ty, tz], base);
  }
  const g = m.geo();
  gradient(g, cool(base, 1.15), warm(src[1], 0.5), { power: 0.6 });
  speckle(g, 0.09, rng);
  return [[g, 'foliage']];
}

function flowers(rng, p, { n = 4, h = 0.34 } = {}) {
  const stemCol = cool(p.flora.reed[0], 0.5);
  const petal = p.flora.bloom[rng() < 0.55 ? 0 : (rng() < 0.5 ? 1 : 3)];
  const m = new Mesh();
  const heads = [];
  let f = 0;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = 0.26 * Math.sqrt(rng());
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const hh = h * (0.7 + rng() * 0.7);
    const lean = 0.12 + rng() * 0.3, dir = rng() * TAU;
    blade(m, x, z, h * 0.07, hh, lean, dir, stemCol); f += 2;
    const sl = Math.sin(lean) * hh;
    const hx = x + sl * Math.cos(dir), hy = Math.cos(lean) * hh, hz = z + sl * Math.sin(dir);
    const rr = h * (0.16 + rng() * 0.08);
    const ring = ringCircle(5, rr, 0, rng() * TAU);
    for (let k = 0; k < 5; k++) {
      const j = (k + 1) % 5;
      m.tri([hx, hy + rr * 0.28, hz], [hx + ring[k][0], hy, hz + ring[k][2]], [hx + ring[j][0], hy, hz + ring[j][2]], petal);
      heads.push(f++);
    }
  }
  const g = m.geo();
  gradient(g, cool(stemCol, 1.0), warm(p.flora.reed[1], 0.4), { power: 0.7 });
  const set = new Set(heads);
  faceTone(g, i => set.has(i), () => shade(petal, (rng() - 0.5) * 0.16));
  return [[g, 'foliage']];
}

function shrooms(rng, p, { n = 3, r = 0.14 } = {}) {
  const capCol = rng() < 0.4 ? p.accent : p.flora.bloom[0];
  const stalk = warm(p.build.wall[0], 0.2);
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = r * (1.2 + rng() * 2.4);
    const s = r * (0.6 + rng() * 0.8);
    const hh = s * (2.2 + rng() * 1.4);
    const g = prism(5, s * 0.42, s * 0.3, hh, { rings: 1, rot: rng() * TAU, capBottom: false, capTop: false, col: cool(stalk, 0.5) });
    transform(g, { pos: [Math.cos(a) * d, 0, Math.sin(a) * d] });
    m.add(g);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const ring = ringCircle(5, s, 0, rng() * TAU);
    const top = [cx, hh + s * 0.72, cz];
    const und = [cx, hh - s * 0.16, cz];
    for (let k = 0; k < 5; k++) {
      const j = (k + 1) % 5;
      const a1 = [cx + ring[k][0], hh, cz + ring[k][2]], b1 = [cx + ring[j][0], hh, cz + ring[j][2]];
      m.tri(a1, top, b1, shade(capCol, (rng() - 0.5) * 0.18));
      m.tri(b1, und, a1, cool(capCol, 1.3));
    }
  }
  return [[m.geo(), 'solid']];
}

// ── placement ───────────────────────────────────────────────────────────────────────────────

export function populate(ctx) {
  const { p, rng, terrain: T } = ctx;
  const scatter = ctx.scatter ?? 1;
  const detail = ctx.detail ?? 1;
  if (scatter <= 0) return;

  const density = noise2(rng.int(1, 1e6));
  const species = noise2(rng.int(1, 1e6));
  const yawGrid = new Map();

  const key = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  // Rule 4 of the checklist is literal: adjacent props must not share a yaw within ±10°.
  function yaw(x, z) {
    const cells = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cells.push(yawGrid.get(key(x + i * 8, z + j * 8)));
    for (let k = 0; k < 8; k++) {
      const y = rng() * TAU;
      let bad = false;
      for (const c of cells) {
        if (!c) continue;
        for (const q of c) {
          if (Math.abs(q[0] - x) > 6 || Math.abs(q[1] - z) > 6) continue;
          const d = Math.abs(((q[2] - y) % TAU + TAU + Math.PI) % TAU - Math.PI);
          if (d < 0.185) { bad = true; break; }
        }
        if (bad) break;
      }
      if (!bad || k === 7) {
        const kk = key(x, z);
        let c = yawGrid.get(kk);
        if (!c) yawGrid.set(kk, c = []);
        c.push([x, z, y]);
        return y;
      }
    }
    return rng() * TAU;
  }

  // Slerping the up-vector 60% toward the terrain normal, expressed as the rx/rz that place()
  // takes. The yaw is applied last in a 'YXZ' euler, so the tilt has to be counter-rotated
  // into the prop's own frame or the lean points the wrong way.
  function tilt(x, z, ry, k = 0.6, extra = 0) {
    const n = T.normalAt(x, z);
    const ax = Math.asin(clamp(n.x, -1, 1)) * k;
    const az = Math.asin(clamp(n.z, -1, 1)) * k;
    const c = Math.cos(ry), s = Math.sin(ry);
    return {
      rx: ax * s + az * c + (rng() - 0.5) * extra,
      rz: -(ax * c - az * s) + (rng() - 0.5) * extra,
    };
  }

  function inVillage(x, z, pad = 0) {
    const v = ctx.village;
    if (!v) return false;
    for (const pl of v.plots || []) {
      if (!pl) continue;
      const px = pl.x ?? (Array.isArray(pl) ? pl[0] : undefined);
      const pz = pl.z ?? (Array.isArray(pl) ? pl[pl.length - 1] : undefined);
      if (px === undefined || pz === undefined) continue;
      const r = pl.r ?? Math.hypot(pl.w ?? 5, pl.d ?? 5) * 0.55;
      if (Math.hypot(px - x, pz - z) < r + pad) return true;
    }
    for (const path of v.paths || []) {
      if (!path) continue;
      const pts = path.pts || path.points || (Array.isArray(path) ? path : null);
      if (!Array.isArray(pts)) continue;
      const w = (path.width ?? 3) * 0.6 + pad;
      for (const q of pts) {
        if (!q) continue;
        const qx = Array.isArray(q) ? q[0] : q.x;
        const qz = Array.isArray(q) ? (q.length > 2 ? q[2] : q[1]) : q.z;
        if (qx === undefined || qz === undefined) continue;
        if (Math.hypot(qx - x, qz - z) < w) return true;
      }
    }
    return false;
  }

  // The channel bed belongs to the water module. Anything with a trunk stays out of it; reeds
  // and willows are the only things allowed near the lip.
  const river = Array.isArray(T.riverPath) && T.riverPath.length > 1 ? T.riverPath : null;
  const toRiver = (x, z) => (river ? T.distToPath(x, z, river) : Infinity);

  function land(x, z, { minY = 0.35, maxSlope = 1, pad = 1.5, bank = 5 } = {}) {
    if (!T.inBounds(x, z, 4)) return false;
    if (T.heightAt(x, z) < T.waterY + minY) return false;
    if (T.slopeAt(x, z) > maxSlope) return false;
    if (toRiver(x, z) < bank) return false;
    return !inVillage(x, z, pad);
  }

  function drop(parts, x, z, { r = 0, scale = 1, sinkFrac = 0.03, k = 0.6, extra = 0.07, tag = 'nature' } = {}) {
    const ry = yaw(x, z);
    const t = tilt(x, z, ry, k, extra);
    const sink = Math.max(0.04, scale * sinkFrac);
    for (const [geo, cls] of parts) ctx.place(geo, { x, z, ry, rx: t.rx, rz: t.rz, scale, sink, cls });
    if (r > 0.6) ctx.occupy(x, z, r, tag);
  }

  // ── forest structure ──────────────────────────────────────────────────────────────────────
  // Copses, not a uniform sprinkle: a handful of seeds, each with its own yaw, radius, species
  // mix and density falloff, so the wood has grain and there is genuine empty ground between.

  const copses = [];
  const wanted = Math.round(18 * scatter);
  for (let guard = 0; guard < 600 && copses.length < wanted; guard++) {
    const x = rng.range(-58, 58), z = rng.range(-58, 58);
    if (!land(x, z, { minY: 0.9, maxSlope: 0.55, pad: 9, bank: 8 })) continue;
    let clash = false;
    for (const c of copses) if (Math.hypot(c.x - x, c.z - z) < c.R * 0.7) { clash = true; break; }
    if (clash) continue;
    const hgt = T.heightAt(x, z);
    copses.push({
      x, z,
      R: rng.range(8, 17),
      rot: rng() * TAU,
      squash: rng.range(0.5, 1),
      planted: 0,
      pine: clamp((hgt - 1) / 12 + species.fbm(x * 0.02, z * 0.02, 2) * 0.9 + 0.12, 0.05, 0.95),
      alt: rng.chance(0.4),
    });
  }

  const bigTrees = [];

  function treeAt(x, z, copse, u) {
    const slope = T.slopeAt(x, z);
    const hgt = T.heightAt(x, z);
    // Steep ground and altitude are both conifer country — a broadleaf on a 40° face reads wrong.
    const pine = clamp((copse ? copse.pine : 0.3) + slope * 1.1 + (hgt - 4) * 0.035, 0, 1);
    const hero = u < 0.16;
    const s = hero ? rng.range(0.92, 1.15) : u < 0.45 ? rng.range(0.62, 0.86) : rng.range(0.33, 0.6);

    if (rng() < pine) {
      // Clamped so a hero roll on a tall variant can never produce the one tree that dwarfs
      // the terrain — the standing height, not the raw height, is what has to stay in range.
      const h = Math.min(rng.range(8, 13.5), 13.5 / Math.max(s, 0.6));
      const r = h * rng.range(0.135, 0.175);
      const tiers = detail >= 2 ? 6 : detail >= 1 ? (rng() < 0.5 ? 5 : 6) : 4;
      const sides = detail >= 1 ? (rng() < 0.3 ? 9 : 7) : 5;
      const parts = conifer(rng, p, { h, r, tiers, sides, hue: 0.035 });
      const foot = r * s * 0.72;
      drop(parts, x, z, { r: foot, scale: s, k: 0.5, extra: 0.06 });
      return { foot, s, hero, kind: 'pine' };
    }
    const kind = hero ? (rng() < 0.6 ? 'fork' : 'round')
      : u < 0.7 ? rng.pick(['round', 'fork', 'tall', 'fork']) : 'sapling';
    const h = kind === 'sapling' ? rng.range(2.8, 4.4)
      : Math.min(rng.range(6.5, 10.5), 11 / Math.max(s, 0.6));
    const parts = broadleaf(rng, p, {
      h, kind, hue: 0.06,
      masses: hero ? 5 : u < 0.5 ? 4 : 3,
      alt: copse ? copse.alt && rng.chance(0.5) : rng.chance(0.25),
    });
    if (hero && detail >= 1 && kind !== 'sapling') parts.push([roots(rng, p, h * 0.05), 'solid']);
    const foot = h * s * (kind === 'sapling' ? 0.11 : 0.16);
    drop(parts, x, z, { r: foot, scale: s, k: 0.55, extra: 0.05 });
    return { foot, s, hero, kind };
  }

  let trees = 0;
  const treeCap = Math.round(300 * scatter);

  for (const c of copses) {
    const n = Math.round(c.R * c.R * 0.23 * scatter);
    for (let i = 0; i < n && trees < treeCap; i++) {
      // Density falls off from the seed, and the whole copse is squashed and yawed off the
      // world grid so no row of trunks lands on a screen diagonal.
      const u = Math.pow(rng(), 0.62);
      const a = rng() * TAU;
      const lx = Math.cos(a) * u * c.R, lz = Math.sin(a) * u * c.R * c.squash;
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const x = c.x + lx * cs - lz * sn, z = c.z + lx * sn + lz * cs;
      if (!land(x, z, { minY: 0.7, maxSlope: 0.74, pad: 3 })) continue;
      if (density.fbm(x * 0.035, z * 0.035, 3) < -0.28 + u * 0.1) continue;
      const guess = 1.4;
      if (!ctx.free(x, z, guess)) continue;
      const t = treeAt(x, z, c, u);
      trees++; c.planted++;
      if (t.hero) bigTrees.push({ x, z, r: t.foot });
    }
  }

  // Loners. A wood with a hard edge is a hedge; a few singles outside it read as spread.
  for (let i = 0; i < Math.round(120 * scatter) && trees < treeCap; i++) {
    const x = rng.range(-60, 60), z = rng.range(-60, 60);
    if (!land(x, z, { minY: 0.9, maxSlope: 0.6, pad: 4, bank: 6 })) continue;
    if (density.fbm(x * 0.03 + 30, z * 0.03, 3) < 0.04) continue;
    if (!ctx.free(x, z, 2.4)) continue;
    treeAt(x, z, null, rng() < 0.12 ? 0.14 : 0.78);
    trees++;
  }

  // The banks. A carved channel with bare shoulders looks like a trench, so the strip just
  // outside the bed gets its own thicket, denser than the open ground either side of it.
  if (river) {
    for (let i = 0; i < Math.round(150 * scatter); i++) {
      const seg = rng.int(0, river.length - 2);
      const t = rng();
      const [ax, az] = river[seg], [bx, bz] = river[seg + 1];
      const dx = bx - ax, dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      const side = rng() < 0.5 ? 1 : -1;
      const off = rng.range(5.5, 13);
      const x = ax + dx * t + (-dz / l) * off * side + (rng() - 0.5) * 3;
      const z = az + dz * t + (dx / l) * off * side + (rng() - 0.5) * 3;
      if (!land(x, z, { minY: 0.4, maxSlope: 0.7, pad: 3, bank: 4.5 })) continue;
      if (rng() < 0.34 && trees < treeCap && ctx.free(x, z, 2)) {
        treeAt(x, z, null, 0.55);
        trees++;
      } else if (ctx.free(x, z, 0.9, { ignore: 'nature' })) {
        const r = rng.range(0.6, 1.5);
        drop(bush(rng, p, { r }), x, z, { r: r * 0.95, sinkFrac: 0.06, k: 0.7, extra: 0.1 });
      }
    }
  }

  // ── rock ──────────────────────────────────────────────────────────────────────────────────

  for (let i = 0; i < Math.round(20 * scatter); i++) {
    const x = rng.range(-60, 60), z = rng.range(-60, 60);
    if (!T.inBounds(x, z, 5) || inVillage(x, z, 5)) continue;
    if (T.heightAt(x, z) < T.waterY + 0.4) continue;
    if (T.slopeAt(x, z) < 0.42) continue;
    if (!ctx.free(x, z, 3.2)) continue;
    const r = rng.range(1.7, 3.4);
    drop(outcrop(rng, p, { r, h: r * rng.range(0.85, 1.45) }), x, z,
      { r: r * 1.15, sinkFrac: 0.12, k: 0.35, extra: 0.12 });
  }

  for (let i = 0; i < Math.round(150 * scatter); i++) {
    const x = rng.range(-62, 62), z = rng.range(-62, 62);
    if (!T.inBounds(x, z, 4) || inVillage(x, z, 2.5)) continue;
    const h = T.heightAt(x, z);
    if (h < T.waterY - 0.5) continue;
    const slope = T.slopeAt(x, z);
    const bias = slope * 1.5 + (h < T.waterY + 1.2 ? 0.5 : 0) + (h > 12 ? 0.4 : 0);
    if (rng() > 0.16 + bias) continue;
    const r = rng() < 0.22 ? rng.range(1.1, 2.1) : rng.range(0.35, 0.95);
    if (!ctx.free(x, z, r * 0.9)) continue;
    drop(boulder(rng, p, { r, angular: rng.chance(0.45) }), x, z,
      { r: r * 1.25, sinkFrac: 0.1, k: 0.45, extra: 0.16 });
  }

  for (let i = 0; i < Math.round(46 * scatter); i++) {
    const x = rng.range(-62, 62), z = rng.range(-62, 62);
    if (!T.inBounds(x, z, 4) || inVillage(x, z, 2)) continue;
    const h = T.heightAt(x, z);
    if (h < T.waterY - 0.3) continue;
    const b = T.biomeAt(x, z);
    if (b !== 'rock' && b !== 'alpine' && b !== 'sand' && rng() > 0.15) continue;
    const r = rng.range(1.1, 2.3);
    drop(scree(rng, p, { r, n: detail >= 1 ? rng.int(5, 9) : 4 }), x, z,
      { r: 0, sinkFrac: 0.02, k: 0.85, extra: 0.05 });
  }

  // ── deadwood, under and around the copses ─────────────────────────────────────────────────

  for (let i = 0; i < Math.round(26 * scatter); i++) {
    const c = copses.length ? rng.pick(copses) : null;
    const a = rng() * TAU, d = (c ? c.R : 20) * (0.35 + rng() * 0.85);
    const x = (c ? c.x : 0) + Math.cos(a) * d, z = (c ? c.z : 0) + Math.sin(a) * d;
    if (!land(x, z, { minY: 0.6, maxSlope: 0.5, pad: 3 })) continue;
    if (!ctx.free(x, z, 1.4)) continue;
    if (rng() < 0.55) {
      const len = rng.range(2.4, 4.6);
      drop(log(rng, p, { r: rng.range(0.22, 0.38), len }), x, z, { r: len * 0.34, sinkFrac: 0.14, k: 0.8, extra: 0.1 });
    } else {
      const r = rng.range(0.34, 0.62);
      drop(stump(rng, p, { r, h: rng.range(0.5, 1.1) }), x, z, { r: r * 1.4, sinkFrac: 0.1, k: 0.8, extra: 0.08 });
    }
  }

  // ── shrubs ────────────────────────────────────────────────────────────────────────────────

  // Only copses that actually grew trees get an understory. A shrub layer on ground the trees
  // rejected is the thing that reads as a rash of identical lumps across open hillside.
  const wooded = copses.filter(c => c.planted >= 5);
  for (let i = 0; i < Math.round(170 * scatter); i++) {
    let x, z, near = false;
    if (wooded.length && rng() < 0.94) {
      const c = rng.pick(wooded);
      const a = rng() * TAU, d = c.R * (0.15 + Math.pow(rng(), 0.8) * 1.05);
      x = c.x + Math.cos(a) * d; z = c.z + Math.sin(a) * d * c.squash;
      near = true;
    } else {
      x = rng.range(-61, 61); z = rng.range(-61, 61);
    }
    if (!land(x, z, { minY: 0.5, maxSlope: 0.62, pad: 2.5, bank: 4 })) continue;
    // Shrubs read from the same density field as the trees, so the understory thickens with the
    // wood instead of spreading evenly over the open ground as a rash.
    if (density.fbm(x * 0.035, z * 0.035, 3) < (near ? -0.3 : 0.06)) continue;
    if (!ctx.free(x, z, 0.9, { ignore: 'nature' })) continue;
    // One hero, two mid, several small — the descending run that stops a shrub layer reading
    // as one repeated module.
    const u = rng();
    const r = u < 0.12 ? rng.range(1.5, 2.3) : u < 0.4 ? rng.range(0.85, 1.4) : rng.range(0.4, 0.8);
    drop(bush(rng, p, { r, dry: T.heightAt(x, z) > 11, warmSrc: near && rng() < 0.22 }), x, z,
      { r: r * 0.95, sinkFrac: 0.06, k: 0.7, extra: 0.1 });
  }

  // ── waterline ─────────────────────────────────────────────────────────────────────────────

  for (let i = 0; i < Math.round(360 * scatter); i++) {
    const x = rng.range(-62, 62), z = rng.range(-62, 62);
    if (!T.inBounds(x, z, 3) || inVillage(x, z, 2)) continue;
    const d = T.heightAt(x, z) - T.waterY;
    if (d < -0.45 || d > 1.05) continue;
    if (T.slopeAt(x, z) > 0.5) continue;
    if (!ctx.free(x, z, 0.5, { ignore: 'nature' })) continue;
    drop(reeds(rng, p, { h: rng.range(1.1, 2.2), n: detail >= 1 ? rng.int(5, 8) : 4 }), x, z,
      { r: 0, sinkFrac: 0.05, k: 0.35, extra: 0.09 });
  }

  // ── undergrowth ───────────────────────────────────────────────────────────────────────────
  // Grass is the cheapest thing in the file and does the most for the ground plane, so it gets
  // the largest instance count and the tightest per-instance triangle count.

  const grassTries = Math.round(1500 * scatter);
  for (let i = 0; i < grassTries; i++) {
    const x = rng.range(-62, 62), z = rng.range(-62, 62);
    if (!T.inBounds(x, z, 3) || inVillage(x, z, 1.6)) continue;
    const b = T.biomeAt(x, z);
    if (b === 'water' || b === 'rock') continue;
    const f = density.fbm(x * 0.05 + 11, z * 0.05 - 4, 3);
    if (rng() > 0.12 + f * 1.5 + (b === 'sand' ? -0.15 : 0)) continue;
    if (!ctx.free(x, z, 0.35, { ignore: 'nature' })) continue;
    const dry = T.heightAt(x, z) > 10 || b === 'sand';
    drop(tuft(rng, p, {
      h: rng.range(0.55, 1.25), n: detail >= 1 ? rng.int(4, 6) : 3,
      src: dry ? p.ground.grassDry : (rng() < 0.25 ? p.flora.reed : p.ground.grass),
      spread: rng.range(0.2, 0.45),
    }), x, z, { r: 0, sinkFrac: 0.04, k: 0.8, extra: 0.06 });
  }

  for (let i = 0; i < Math.round(120 * scatter); i++) {
    const c = copses.length ? rng.pick(copses) : null;
    if (!c) break;
    const a = rng() * TAU, d = c.R * Math.pow(rng(), 0.55);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d * c.squash;
    if (!land(x, z, { minY: 0.6, maxSlope: 0.6, pad: 2 })) continue;
    if (!ctx.free(x, z, 0.4, { ignore: 'nature' })) continue;
    drop(fern(rng, p, { r: rng.range(0.5, 1.0) }), x, z, { r: 0, sinkFrac: 0.05, k: 0.7, extra: 0.1 });
  }

  for (let i = 0; i < Math.round(90 * scatter); i++) {
    const x = rng.range(-58, 58), z = rng.range(-58, 58);
    if (!land(x, z, { minY: 1.0, maxSlope: 0.4, pad: 2 })) continue;
    if (T.biomeAt(x, z) !== 'grass') continue;
    if (density.fbm(x * 0.06 - 20, z * 0.06 + 7, 2) < 0.05) continue;
    if (!ctx.free(x, z, 0.4, { ignore: 'nature' })) continue;
    drop(flowers(rng, p, { n: rng.int(3, 5), h: rng.range(0.3, 0.5) }), x, z,
      { r: 0, sinkFrac: 0.04, k: 0.8, extra: 0.08 });
  }

  for (const b of bigTrees) {
    if (rng() > 0.5) continue;
    const a = rng() * TAU, d = b.r * rng.range(1.1, 2.2);
    const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
    if (!land(x, z, { minY: 0.6, maxSlope: 0.5, pad: 2 })) continue;
    drop(shrooms(rng, p, { n: rng.int(2, 4), r: rng.range(0.1, 0.2) }), x, z,
      { r: 0, sinkFrac: 0.04, k: 0.9, extra: 0.12 });
  }
}
