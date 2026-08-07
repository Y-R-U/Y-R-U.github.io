// The faceted ground, and the cut slab it sits on.
//
// Two decisions do most of the work of not looking like a grid: every vertex is jittered in XZ
// before the quad is split, and the split diagonal alternates in a checker. A regular grid with a
// uniform diagonal reads as corduroy from any isometric angle, no matter how good the colours are.
//
// The slab is not decoration. A diorama has to be visibly finite — terrain running off the frame
// edge stops being a model on a table and becomes a level. Every good reference plate shows the
// soil cross-section.

import * as THREE from 'three';
import { Mesh, mix, shade } from './shape.js';
import { makeRng, noise2 } from './rng.js';
import { palette } from './palette.js';

const CELLS = [2.9, 2.15, 1.7];

// Nothing in frame may read as neutral. A near-grey patch injects an extra, colourless hue family
// into a four-hue palette and is indistinguishable from untextured placeholder.
const MIN_SAT = 0.17;
function floorSat(c) {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return c;
  const l = (mx + mn) / 2;
  const sat = l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  if (sat >= MIN_SAT) return c;
  const k = MIN_SAT / Math.max(sat, 1e-4), m = (r + g + b) / 3;
  return [m + (r - m) * k, m + (g - m) * k, m + (b - m) * k];
}

export class Terrain {
  // Deliberately not square. A square plinth presented corner-on at a 45° azimuth is mirror
  // symmetric about the screen's vertical, and a symmetric silhouette is the composition
  // equivalent of an untapered cylinder.
  constructor({ seed = 'facet', size = [150, 106], paletteId = 'meadow', detail = 1, depth = 9 } = {}) {
    const [sx, sz] = Array.isArray(size) ? size : [size, size];
    this.sizeX = sx; this.sizeZ = sz;
    this.halfX = sx / 2; this.halfZ = sz / 2;
    this.half = Math.max(this.halfX, this.halfZ);
    this.cellWanted = CELLS[detail] ?? CELLS[1];
    this.nx = Math.round(sx / this.cellWanted);
    this.nz = Math.round(sz / this.cellWanted);
    this.cellX = sx / this.nx; this.cellZ = sz / this.nz;
    this.cell = (this.cellX + this.cellZ) / 2;
    this.rng = makeRng(seed + ':terrain');
    this.noise = noise2(this.rng.int(1, 1e6));
    this.warp = noise2(this.rng.int(1, 1e6));
    this.strataNoise = noise2(this.rng.int(1, 1e6));
    this.p = palette(paletteId);
    this.waterY = 0;
    this.depth = depth;
    this.flats = [];
    this.channels = [];
    this.object3D = new THREE.Group();

    const k = (this.nx + 1) * (this.nz + 1);
    this.h = new Float32Array(k);
    this.jx = new Float32Array(k);
    this.jz = new Float32Array(k);
  }

  // Called before build(): carves a level shelf so a village has somewhere to stand.
  flatten(x, z, radius, { y = null, falloff = 1.9 } = {}) {
    this.flats.push({ x, z, radius, y, falloff });
    return this;
  }

  // A valley cut along a polyline. `floor` clamps the bed below the water line so the channel
  // actually holds water instead of being a dry ditch the water module has to guess at.
  carve(points, { width = 9, depth = 4.5, floor = null, bank = 2.2 } = {}) {
    this.channels.push({ points, width, depth, floor, bank });
    this.riverPath = this.riverPath || points;
    return this;
  }

  distToPath(x, z, points) {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }

  shape(x, z) {
    const s = 1 / 46;
    const wx = this.warp.fbm(x * 0.012, z * 0.012, 2) * 9;
    const wz = this.warp.fbm(x * 0.012 + 41, z * 0.012 - 17, 2) * 9;
    let h = this.noise.fbm((x + wx) * s, (z + wz) * s, 5, 2.05, 0.48) * 15.5;
    h += this.noise.fbm(x * s * 3.4, z * s * 3.4, 3) * 2.2;

    // Ridges read better than smooth domes at this triangle size — the fold catches the sun.
    const r = 1 - Math.abs(this.noise.fbm(x * s * 0.8 + 100, z * s * 0.8, 3));
    h += Math.pow(Math.max(0, r), 3) * 6.5;

    // The slab's edge is a cut, not a coastline — but the land still has to fall away far enough
    // and wide enough to leave real sea inside the cut, or the water module gets a 1 m rim band
    // and nowhere for its depth gradient to read. The start of the falloff is noise-modulated so
    // the shoreline is not a perfect square ring inset from the slab.
    const d = Math.max(Math.abs(x) / this.halfX, Math.abs(z) / this.halfZ);
    const coast = 0.57 + this.warp.fbm(x * 0.022 + 90, z * 0.022 - 40, 3) * 0.15;
    h -= Math.pow(THREE.MathUtils.smoothstep(d, coast, 0.94), 1.7) * 17;
    return h;
  }

  height(x, z) {
    let h = this.shape(x, z);
    for (const f of this.flats) {
      const d = Math.hypot(x - f.x, z - f.z) / f.radius;
      if (d >= 1) continue;
      const w = Math.pow(1 - THREE.MathUtils.smoothstep(d, 0, 1), f.falloff);
      const target = f.y ?? (f.resolved ?? (f.resolved = this.shape(f.x, f.z)));
      h = h * (1 - w) + target * w;
    }
    for (const c of this.channels) {
      // The bank noise is what stops the valley reading as an extruded groove — a channel of
      // constant width is the terrain equivalent of an untapered cylinder.
      const wob = this.warp.fbm(x * 0.035 + 7, z * 0.035 - 3, 2) * c.bank;
      const d = this.distToPath(x, z, c.points) + wob;
      if (d > c.width) continue;
      const w = Math.pow(1 - THREE.MathUtils.smoothstep(d, 0, c.width), 1.5);
      h -= c.depth * w;
      if (c.floor !== null) h = Math.min(h, h * (1 - w) + c.floor * w);
    }
    return h;
  }

  idx(i, j) { return j * (this.nx + 1) + i; }
  gx(i) { return -this.halfX + i * this.cellX; }
  gz(j) { return -this.halfZ + j * this.cellZ; }

  // Heights only. The mesh is built later, once the world knows what is standing on it.
  build() {
    for (let j = 0; j <= this.nz; j++) {
      for (let i = 0; i <= this.nx; i++) {
        const k = this.idx(i, j);
        const edge = i === 0 || j === 0 || i === this.nx || j === this.nz;
        this.jx[k] = edge ? 0 : (this.rng() - 0.5) * 0.68 * this.cellX;
        this.jz[k] = edge ? 0 : (this.rng() - 0.5) * 0.68 * this.cellZ;
        this.h[k] = this.height(this.gx(i) + this.jx[k], this.gz(j) + this.jz[k]);
      }
    }
    return this;
  }

  vert(i, j) {
    const k = this.idx(i, j);
    return [this.gx(i) + this.jx[k], this.h[k], this.gz(j) + this.jz[k]];
  }

  get baseY() { return this.minH - this.depth; }

  // `claims` come from the world's occupancy registry: everything standing on the ground gets
  // its contact darkened into the terrain's own vertex colours. Baked AO is the best quality per
  // millisecond in the whole style, and this is the version of it that costs nothing at runtime.
  surface(claims = []) {
    this.minH = Infinity;
    for (let i = 0; i < this.h.length; i++) this.minH = Math.min(this.minH, this.h[i]);

    const m = new Mesh();
    const g = this.p.ground;
    const rng = makeRng('tess');
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const a = this.vert(i, j), b = this.vert(i + 1, j), c = this.vert(i + 1, j + 1), d = this.vert(i, j + 1);
        const flip = ((i ^ j) & 1) === 0;
        // Wound so the normal comes out +Y: a→d→c is counter-clockwise seen from above, a→b→c
        // is not, and the difference is the whole ground being backface-culled.
        const t1 = flip ? [c, b, a] : [d, b, a];
        const t2 = flip ? [d, c, a] : [d, c, b];
        m.tri(t1[0], t1[1], t1[2], this.faceColor(t1, g, rng, claims));
        m.tri(t2[0], t2[1], t2[2], this.faceColor(t2, g, rng, claims));
      }
    }
    this.skirt(m);
    return m.geo();
  }

  faceColor(t, g, rng, claims) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
    const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
    const slope = this.slopeOf(t);
    const wet = cy - this.waterY;

    // The shoreline contour is a level set, so without this it comes out as a perfectly even
    // band all the way round the slab, which is the most mechanical thing in the frame.
    const shoreWidth = 0.9 + this.noise.fbm(cx * 0.05 - 30, cz * 0.05, 3) * 2.4;

    let base;
    if (wet < shoreWidth) base = mix(g.sand[0], g.sand[2], THREE.MathUtils.clamp(0.4 - wet * 0.5, 0, 1));
    else if (slope > 0.62) base = g.rock[((cx * 7.3 + cz * 3.1) | 0) % 2 ? 0 : 2];
    else if (slope > 0.42) base = mix(g.rock[0], g.grass[2], 0.45);
    else {
      // Two scales of patchiness: broad meadow/dry-grass drift, then a tighter break-up so no two
      // neighbouring facets land on the same green.
      const broad = this.noise.fbm(cx * 0.026 + 60, cz * 0.026, 3);
      const fine = this.noise.fbm(cx * 0.09 - 12, cz * 0.09 + 4, 2);
      base = mix(g.grass[0], broad > 0.06 ? g.grassDry[0] : g.grass[2], Math.abs(broad) * 1.9);
      base = mix(base, fine > 0 ? g.grass[1] : g.grass[2], Math.abs(fine) * 0.55);
      if (broad > 0.3 && fine > 0.22) base = mix(base, g.dirt[0], 0.4);
      if (cy > 12) base = mix(base, g.rock[1], THREE.MathUtils.clamp((cy - 12) / 9, 0, 0.55));
    }

    base = floorSat(base);

    // Concave ground occludes itself. Comparing the face against the local average is a one-line
    // stand-in for a bake and catches every gully and terrace edge.
    const local = (this.heightAt(cx - 3, cz) + this.heightAt(cx + 3, cz)
      + this.heightAt(cx, cz - 3) + this.heightAt(cx, cz + 3)) / 4;
    let ao = THREE.MathUtils.clamp((cy - local) * 0.12, -0.22, 0.1);

    for (const c of claims) {
      if (c.ao === false) continue;
      const d = Math.hypot(c.x - cx, c.z - cz);
      const r = c.r * 1.75;
      if (d < r) ao -= (1 - d / r) * (1 - d / r) * (c.aoStrength ?? 0.42);
    }

    const nx = t[1][1] - t[0][1], nz = t[2][1] - t[0][1];
    const lean = THREE.MathUtils.clamp((nx * 0.6 - nz * 0.5) * 0.3, -0.14, 0.14);
    return shade(base, THREE.MathUtils.clamp(lean + ao, -0.55, 0.38) + (rng() - 0.5) * 0.07);
  }

  // The cut face. Strata boundaries wobble per column, which is the whole reason it reads as
  // soil rather than as a painted band.
  skirt(m) {
    const g = this.p.ground;
    const base = this.baseY;
    // The deepest band mixes toward the palette's own shadow hue, not toward black. Bedrock that
    // goes black kills the cross-section; every good plate has a saturated cool bottom stratum.
    const bands = [
      { t: 0.00, c: mix(g.grass[2], g.dirt[2], 0.55) },
      { t: 0.10, c: mix(g.dirt[0], g.dirt[1], 0.35) },
      { t: 0.32, c: mix(g.dirt[2], g.rock[0], 0.45) },
      { t: 0.60, c: mix(g.rock[2], this.p.shadow, 0.5) },
      { t: 1.00, c: null },
    ];

    const ring = [];
    const { nx, nz } = this;
    for (let i = 0; i < nx; i++) ring.push([i, 0]);
    for (let j = 0; j < nz; j++) ring.push([nx, j]);
    for (let i = nx; i > 0; i--) ring.push([i, nz]);
    for (let j = nz; j > 0; j--) ring.push([0, j]);

    // The cut face is a graphic — a cross-section diagram — and it has to read the same on all four
    // sides. Two of them face away from both the sun and the rim and would otherwise crush to
    // black, so the vertex colour is lifted by exactly as much light as the side is missing.
    const sa = this.p.sun.azimuth * Math.PI / 180, se = this.p.sun.elevation * Math.PI / 180;
    const sun = [Math.cos(sa) * Math.cos(se), Math.sin(sa) * Math.cos(se)];

    for (let s = 0; s < ring.length; s++) {
      const [i0, j0] = ring[s], [i1, j1] = ring[(s + 1) % ring.length];
      const a = this.vert(i0, j0), b = this.vert(i1, j1);
      const ex = b[0] - a[0], ez = b[2] - a[2];
      const el = Math.hypot(ex, ez) || 1;
      const lift = (1 - Math.max(0, (ez / el) * sun[0] - (ex / el) * sun[1])) * 0.36;
      const w0 = this.strataNoise.fbm(a[0] * 0.05, a[2] * 0.05, 3) * 0.075;
      const w1 = this.strataNoise.fbm(b[0] * 0.05, b[2] * 0.05, 3) * 0.075;
      const yA = t => a[1] + (base - a[1]) * THREE.MathUtils.clamp(t + (t > 0 && t < 1 ? w0 : 0), 0, 1);
      const yB = t => b[1] + (base - b[1]) * THREE.MathUtils.clamp(t + (t > 0 && t < 1 ? w1 : 0), 0, 1);

      // Where the coast is below the water line the strata start underwater, and without this the
      // sea sheet ends in mid-air at the slab edge. The column of water gets its own band in the
      // cross-section — opaque, because a diorama's cut face is a diagram, not a window.
      if (a[1] < this.waterY || b[1] < this.waterY) {
        m.quad(
          [a[0], Math.max(a[1], this.waterY), a[2]], [b[0], Math.max(b[1], this.waterY), b[2]],
          [b[0], b[1], b[2]], [a[0], a[1], a[2]],
          shade(mix(this.p.water.deep, this.p.water.shallow, 0.3), lift * 0.5 - 0.06),
        );
      }

      for (let k = 0; k < bands.length - 1; k++) {
        const t0 = bands[k].t, t1 = bands[k + 1].t;
        m.quad(
          [a[0], yA(t0), a[2]], [b[0], yB(t0), b[2]],
          [b[0], yB(t1), b[2]], [a[0], yA(t1), a[2]],
          shade(bands[k].c, lift + 0.06 - k * 0.035),
        );
      }
    }

    const hx = this.halfX, hz = this.halfZ;
    m.quad([-hx, base, -hz], [hx, base, -hz], [hx, base, hz], [-hx, base, hz], shade(mix(g.rock[2], this.p.shadow, 0.5), -0.35));
  }

  slopeOf(t) {
    const ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2];
    const vx = t[2][0] - t[0][0], vy = t[2][1] - t[0][1], vz = t[2][2] - t[0][2];
    const ny = ux * vz - uz * vx;
    const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return 1 - Math.abs(ny / l);
  }

  // ── queries the rest of the world uses ──────────────────────────────────────────────────────

  heightAt(x, z) {
    const fi = (x + this.halfX) / this.cellX, fj = (z + this.halfZ) / this.cellZ;
    const i = THREE.MathUtils.clamp(Math.floor(fi), 0, this.nx - 1);
    const j = THREE.MathUtils.clamp(Math.floor(fj), 0, this.nz - 1);
    const tx = THREE.MathUtils.clamp(fi - i, 0, 1), tz = THREE.MathUtils.clamp(fj - j, 0, 1);
    const h00 = this.h[this.idx(i, j)], h10 = this.h[this.idx(i + 1, j)];
    const h01 = this.h[this.idx(i, j + 1)], h11 = this.h[this.idx(i + 1, j + 1)];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  normalAt(x, z, e = 1.2) {
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return new THREE.Vector3(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }
  isWater(x, z) { return this.heightAt(x, z) < this.waterY; }
  inBounds(x, z, pad = 3) { return Math.abs(x) < this.halfX - pad && Math.abs(z) < this.halfZ - pad; }

  biomeAt(x, z) {
    const h = this.heightAt(x, z), s = this.slopeAt(x, z);
    if (h < this.waterY) return 'water';
    if (h < this.waterY + 0.9) return 'sand';
    if (s > 0.62) return 'rock';
    if (h > 13) return 'alpine';
    return 'grass';
  }
}
