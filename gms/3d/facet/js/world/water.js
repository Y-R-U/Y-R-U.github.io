// The sea, its shoreline, the stream that feeds it, and the clouds over the lot.
//
// Four dynamic meshes, one draw call each: sea, flow, foam, clouds. The stream's banks are static
// and go into the shared batch.
//
// One fact everything here depends on: a polygon wound clockwise in (x, z) comes out with a +Y
// normal. Getting it backwards gives an invisible surface, not a dark one.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mesh, blob, gradient, mix, ribbon, shade, smooth, transform } from './shape.js';
import { makeRng } from './rng.js';

const clamp = THREE.MathUtils.clamp;
const smoothstep = t => t * t * (3 - 2 * t);

const S = { t: 0, f: 0, sea: null, foam: null, flow: null, clouds: null };

export function populate(ctx) {
  S.t = 0; S.f = 0;
  S.sea = S.foam = S.flow = S.clouds = null;

  const foam = new Mesh();
  const shore = buildSea(ctx);
  if (shore) buildShoreline(ctx, foam, shore);
  buildStream(ctx, foam);
  if (foam.tris) S.foam = dynamic(ctx, foam.geo(), 'solid');
  buildClouds(ctx);
}

export function update(dt) {
  S.t += dt;
  S.f++;
  const t = S.t;
  if (S.sea) animSea(t);
  if (S.foam) animFoam(t);
  if (S.flow) animFlow(t);
  if (S.clouds) animClouds(t);
}

function dynamic(ctx, geo, cls) {
  const mesh = new THREE.Mesh(geo, ctx.materials[cls]);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = cls === 'solid';
  ctx.dynamic(mesh);
  const pos = geo.attributes.position.array;
  return { mesh, geo, pos, base: Float32Array.from(pos) };
}

// ── the sea ──────────────────────────────────────────────────────────────────────────────────
// A jittered grid clipped against the terrain at the high-water mark. Vertices that land on dry
// ground keep the terrain's own height, which is what makes the last half-metre of the sheet lie
// over the sand as a wet sheen instead of ending in a hard z-fighting line.

const WET = 0.30;   // how far above the waterline the sheet creeps up the beach
const LIFT = 0.12;  // clearance over the terrain for that wet fringe

function buildSea(ctx) {
  const { p, terrain } = ctx;
  const W = terrain.waterY, L = W + WET;
  // The slab is rectangular, so the sheet has to be too — a square grid sized on the long axis
  // spills sea past the short edges, where heightAt clamps to the (submerged) rim row.
  const hx = terrain.halfX, hz = terrain.halfZ;
  const want = [3.1, 2.35, 1.95][ctx.detail] ?? 2.35;
  const nX = Math.round(terrain.sizeX / want), nZ = Math.round(terrain.sizeZ / want);
  const cellX = terrain.sizeX / nX, cellZ = terrain.sizeZ / nZ;
  const jr = makeRng('facet:water:grid');
  const cr = makeRng('facet:water:colour');

  const NX = nX + 1, NZ = nZ + 1;
  const gx = new Float32Array(NX * NZ), gz = new Float32Array(NX * NZ), gh = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const edge = i === 0 || j === 0 || i === nX || j === nZ;
      gx[k] = -hx + i * cellX + (edge ? 0 : (jr() - 0.5) * 0.72 * cellX);
      gz[k] = -hz + j * cellZ + (edge ? 0 : (jr() - 0.5) * 0.72 * cellZ);
      gh[k] = terrain.heightAt(gx[k], gz[k]);
    }
  }

  const vx = [], vy = [], vz = [], va = [], idx = [], shore = [];
  const seen = new Map();

  const corner = k => {
    let v = seen.get(k);
    if (v !== undefined) return v;
    v = vx.length;
    const h = gh[k];
    const a = h < W ? clamp((W - h) / 2.4, 0, 1) : 0;
    vx.push(gx[k]); vz.push(gz[k]);
    // Static per-vertex offset on top of the swell: without it the surface is a plane and the
    // whole sheet takes one shading value, which is exactly the plastic look to avoid.
    vy.push((h < W ? W : h + LIFT) + (jr() - 0.5) * 0.28 * a);
    va.push(a);
    seen.set(k, v);
    return v;
  };
  const crossing = (ka, kb) => {
    const key = ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`;
    let v = seen.get(key);
    if (v !== undefined) return v;
    const t = clamp((L - gh[ka]) / (gh[kb] - gh[ka] || 1e-6), 0, 1);
    v = vx.length;
    vx.push(gx[ka] + (gx[kb] - gx[ka]) * t);
    vz.push(gz[ka] + (gz[kb] - gz[ka]) * t);
    vy.push(L + LIFT);
    va.push(0);
    seen.set(key, v);
    return v;
  };

  const ring = [[0, 0], [0, 1], [1, 1], [1, 0]];   // clockwise in (x, z)
  for (let j = 0; j < nZ; j++) {
    for (let i = 0; i < nX; i++) {
      const poly = [];
      for (let e = 0; e < 4; e++) {
        const A = ring[e], B = ring[(e + 1) % 4];
        const ka = (j + A[1]) * NX + (i + A[0]), kb = (j + B[1]) * NX + (i + B[0]);
        const inA = gh[ka] < L, inB = gh[kb] < L;
        if (inA) poly.push({ v: corner(ka), cut: false });
        if (inA !== inB) poly.push({ v: crossing(ka, kb), cut: true });
      }
      if (poly.length < 3) continue;

      for (let e = 0; e < poly.length; e++) {
        const a = poly[e], b = poly[(e + 1) % poly.length];
        if (a.cut && b.cut) shore.push([a.v, b.v]);
      }

      if (poly.length === 4 && !poly[0].cut && !poly[1].cut && !poly[2].cut && !poly[3].cut) {
        // Alternating diagonal, same reason the terrain does it: one fixed diagonal is corduroy.
        const v = poly.map(q => q.v);
        if ((i ^ j) & 1) idx.push(v[0], v[1], v[2], v[0], v[2], v[3]);
        else idx.push(v[1], v[2], v[3], v[1], v[3], v[0]);
      } else {
        let cx = 0, cy = 0, cz = 0, ca = 0;
        for (const q of poly) { cx += vx[q.v]; cy += vy[q.v]; cz += vz[q.v]; ca += va[q.v]; }
        const c = vx.length;
        vx.push(cx / poly.length); vy.push(cy / poly.length);
        vz.push(cz / poly.length); va.push(ca / poly.length);
        for (let e = 0; e < poly.length; e++) idx.push(c, poly[e].v, poly[(e + 1) % poly.length].v);
      }
    }
  }
  if (!idx.length) return null;

  const tris = idx.length / 3;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  const src = new Int32Array(tris * 3);
  for (let f = 0; f < tris; f++) {
    let mx = 0, mz = 0;
    for (let m = 0; m < 3; m++) {
      const v = idx[f * 3 + m], o = (f * 3 + m) * 3;
      src[f * 3 + m] = v;
      pos[o] = vx[v]; pos[o + 1] = vy[v]; pos[o + 2] = vz[v];
      mx += vx[v] / 3; mz += vz[v] / 3;
    }
    const c = seaColour(p, terrain.heightAt(mx, mz), W, cr);
    for (let m = 0; m < 3; m++) {
      const o = (f * 3 + m) * 3;
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const d = dynamic(ctx, geo, 'water');
  // Swell is evaluated once per unique position and scattered out to the duplicated corners —
  // the mesh has ~3 copies of every vertex and sine is the only real cost in the loop.
  d.ux = Float32Array.from(vx);
  d.uz = Float32Array.from(vz);
  d.uy0 = Float32Array.from(vy);
  d.uy = Float32Array.from(vy);
  d.amp = Float32Array.from(va);
  d.src = src;
  S.sea = d;

  return { shore, vx, vy, vz, W, L };
}

function seaColour(p, bed, W, rng) {
  let c;
  if (bed >= W) {
    c = shade(mix(p.ground.sand[2], p.water.shallow, 0.62), -0.10);
  } else {
    const e = smoothstep(clamp((W - bed - 0.1) / 3.0, 0, 1));
    c = mix(shade(p.water.shallow, 0.06), shade(p.water.deep, -0.10), e);
    if (e > 0.15 && e < 0.8 && rng() < 0.03) c = mix(c, p.water.spec, 0.26);
  }
  const k = 1 + (rng() - 0.5) * 0.13;
  return [c[0] * k, c[1] * k, c[2] * k];
}

function animSea(t) {
  const d = S.sea, n = d.ux.length;
  for (let i = 0; i < n; i++) {
    const a = d.amp[i];
    if (a === 0) { d.uy[i] = d.uy0[i]; continue; }
    const x = d.ux[i], z = d.uz[i];
    d.uy[i] = d.uy0[i] + a * (
      Math.sin(x * 0.185 + t * 0.55) * 0.20 +
      Math.sin(z * 0.132 - t * 0.37 + 1.7) * 0.15 +
      Math.sin((x + z) * 0.34 + t * 0.91) * 0.08 +
      Math.sin((x - z * 0.6) * 0.78 - t * 1.43) * 0.09);
  }
  const { pos, src } = d;
  for (let i = 0, m = src.length; i < m; i++) pos[i * 3 + 1] = d.uy[src[i]];
  d.geo.attributes.position.needsUpdate = true;
  // The whole point of the swell is the specular glint moving across the facets, so the normals
  // have to follow it — but not on every frame.
  if ((S.f & 1) === 0) d.geo.computeVertexNormals();
}

// ── the shoreline ────────────────────────────────────────────────────────────────────────────
// Two strips per shore segment: a crisp bright lip on the sand and a wash fading into the
// shallows. Soft foam is what amateur water looks like; the plates all sell it with a hard rim.

function buildShoreline(ctx, m, shore) {
  const { p, terrain } = ctx;
  const rng = makeRng('facet:water:foam');
  const lip = shade(p.water.foam, -0.12);
  const wash = shade(mix(p.water.foam, p.water.shallow, 0.86), -0.05);
  const W = shore.W, L = shore.L;
  // Band width has to vary along the shore or it reads as a printed outline — but per-segment
  // randomness makes a sawtooth, because neighbouring quads then disagree about where the edge is.
  const swell = (x, z) => Math.sin(x * 0.108 + z * 0.077) * 0.5 + Math.sin(x * 0.041 - z * 0.063 + 2.1) * 0.5;

  for (const [ia, ib] of shore.shore) {
    let ax = shore.vx[ia], az = shore.vz[ia];
    let bx = shore.vx[ib], bz = shore.vz[ib];
    let dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    dx /= len; dz /= len;
    let nx = dz, nz = -dx;

    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (terrain.heightAt(mx + nx * 1.1, mz + nz * 1.1) < terrain.heightAt(mx - nx * 1.1, mz - nz * 1.1)) {
      [ax, bx] = [bx, ax]; [az, bz] = [bz, az];
      dx = -dx; dz = -dz; nx = -nx; nz = -nz;
    }

    const s = swell(mx, mz);
    const wo = 0.30 + s * 0.12;
    const wi = 1.05 + s * 0.50;
    // Capped, because on a steep bank the sample a third of a metre inland is a metre higher and
    // the strip shoots up into a spike instead of lying along the water's edge.
    const out = (x, z) => {
      const ox = x + nx * wo, oz = z + nz * wo;
      return [ox, clamp(terrain.heightAt(ox, oz), L, L + 0.4) + LIFT + 0.07, oz];
    };
    const outA = out(ax, az), outB = out(bx, bz);
    const midA = [ax, L + LIFT + 0.07, az];
    const midB = [bx, L + LIFT + 0.07, bz];
    const inA = [ax - nx * wi, W + 0.10, az - nz * wi];
    const inB = [bx - nx * wi, W + 0.10, bz - nz * wi];

    m.quad(outA, midA, midB, outB, shade(lip, rng.range(-0.04, 0.05)));
    m.quad(midA, inA, inB, midB, shade(wash, rng.range(-0.07, 0.04)));
  }
}

function animFoam(t) {
  const { pos, base } = S.foam;
  for (let i = 1; i < pos.length; i += 3) {
    pos[i] = base[i] + 0.055 * Math.sin(t * 1.07 + base[i - 1] * 0.19 + base[i + 1] * 0.15);
  }
  S.foam.geo.attributes.position.needsUpdate = true;
}

// ── the stream ───────────────────────────────────────────────────────────────────────────────
// The terrain is not this module's to carve, and anything laid below its surface is simply
// invisible — so the channel is faked. The sheet rides a hand above the ground, dark banks close
// the gap to the grass, and the valley itself is AO claims the terrain bakes into its own colours.

function buildStream(ctx, foam) {
  const { p, terrain, rng } = ctx;
  const W = terrain.waterY;
  const path = tracePath(ctx);
  if (!path || path.length < 10) return;

  const n = path.length;
  const nor = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    nor.push([dz / l, -dx / l]);
  }

  const width = path.map((_, i) => 3.6 + 3.0 * (i / (n - 1)));
  const edge = (i, s, d = 0) => {
    const [nx, nz] = nor[i], w = width[i] / 2 + d;
    return [path[i][0] + nx * s * w, path[i][1] + nz * s * w];
  };
  const top = path.map((q, i) => {
    const l = edge(i, 1), r = edge(i, -1);
    return Math.max(terrain.heightAt(q[0], q[1]), terrain.heightAt(l[0], l[1]), terrain.heightAt(r[0], r[1]));
  });
  const wy = path.map(q => terrain.heightAt(q[0], q[1]) + 0.15);

  // The cascade is a stair of three flat treads with a sheet between them, not one long ramp.
  // Every six-point window is tested rather than only the steepest, because the steepest run is
  // often a single cliff whose treads cannot be made to descend in readable steps.
  const drops = [], tread = new Set();
  let cut = null;
  for (let i = 1; i <= n - 8; i++) {
    const steps = [[i, i + 1], [i + 2, i + 3], [i + 4, i + 5]];
    const lv = steps.map(([a, b]) => Math.max(top[a], top[b]) + 0.22);
    if (lv[0] - lv[1] < 0.4 || lv[1] - lv[2] < 0.4 || lv[2] - wy[i + 6] < 0.4) continue;
    if (!cut || lv[0] - lv[2] > cut.score) cut = { i, lv, steps, score: lv[0] - lv[2] };
  }
  if (cut) {
    cut.steps.forEach(([a, b], s) => { wy[a] = wy[b] = cut.lv[s]; tread.add(a); tread.add(b); });
    drops.push(cut.i + 1, cut.i + 3, cut.i + 5);
  }

  // Per-side heights, because a level cross-section laid across a side slope floats clear of its
  // downhill bank. Only the cascade's pools are flat; a running reach follows the ground it is on.
  const ey = [[], []];
  for (let i = 0; i < n; i++) {
    for (const [j, s] of [[0, 1], [1, -1]]) {
      const e = edge(i, s);
      ey[j].push(tread.has(i) ? wy[i] : Math.max(terrain.heightAt(e[0], e[1]) + 0.13, wy[i] - 0.35));
    }
  }

  const m = new Mesh();
  const banks = new Mesh();
  const lit = mix(p.water.shallow, '#ffffff', 0.16);
  const isDrop = new Set(drops);

  const flowCol = i => shade(mix(lit, p.water.deep, 0.30 + (i % 3) * 0.11), rng.range(-0.08, 0.08));
  for (let i = 0; i < n - 1; i++) {
    if (isDrop.has(i)) continue;
    const j = i + 1;
    if (tread.has(i) && tread.has(j)) {
      m.add(ribbon([[path[i][0], wy[i], path[i][1]], [path[j][0], wy[j], path[j][1]]],
        [width[i], width[j]], { lift: 0, col: () => flowCol(i) }));
      continue;
    }
    const a = edge(i, -1), b = edge(j, -1), c = edge(j, 1), d = edge(i, 1);
    m.quad(
      [a[0], ey[1][i], a[1]], [b[0], ey[1][j], b[1]],
      [c[0], ey[0][j], c[1]], [d[0], ey[0][i], d[1]], flowCol(i));
  }

  for (const i of drops) {
    const a = [path[i][0], wy[i], path[i][1]];
    const b = [path[i + 1][0], wy[i + 1], path[i + 1][1]];
    cascade(m, a, b, width[i], width[i + 1], p, lit, rng);
    foamDisc(foam, b[0], wy[i + 1] + 0.13, b[2], width[i + 1] * 0.46, p.water.foam, rng);
    foamDisc(foam, a[0], wy[i] + 0.12, a[2], width[i] * 0.28, shade(p.water.foam, 0.05), rng, 5);
  }

  // A bright lip just inside each bank is what turns a flat blue sticker into moving water.
  const rip = shade(p.water.foam, -0.08);
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    for (const [q, s] of [[0, 1], [1, -1]]) {
      const oa = edge(i, s), ob = edge(j, s);
      const ia = edge(i, s, -0.28), ib = edge(j, s, -0.28);
      const ya = ey[q][i] + 0.05, yb = ey[q][j] + 0.05;
      const A = [ia[0], ya, ia[1]], B = [ib[0], yb, ib[1]];
      const C = [ob[0], yb, ob[1]], D = [oa[0], ya, oa[1]];
      if (s > 0) foam.quad(A, B, C, D, shade(rip, rng.range(-0.10, 0.04)));
      else foam.quad(D, C, B, A, shade(rip, rng.range(-0.10, 0.04)));
    }
  }

  for (let i = 0; i < n - 1; i++) channel(banks, ctx, path, nor, ey, wy, width, tread, i);
  ctx.raw(banks.geo(), null, 'solid');

  for (let i = 0; i < n; i += 2) {
    if (top[i] > W) ctx.claims.push({ x: path[i][0], z: path[i][1], r: width[i] * 0.60, tag: 'river', aoStrength: 0.62 });
  }

  S.flow = dynamic(ctx, m.geo(), 'water');
}

function tracePath(ctx) {
  const { terrain } = ctx;
  const W = terrain.waterY;
  const seeds = [];
  for (let x = -54; x <= 54; x += 6) {
    for (let z = -54; z <= 54; z += 6) {
      const h = terrain.heightAt(x, z);
      if (h < W + 5 || Math.hypot(x - 4, z - 2) < 13) continue;
      seeds.push([x, z, h]);
    }
  }
  seeds.sort((a, b) => b[2] - a[2]);

  // The top dozen samples all sit on the same summit, so tracing them gives twelve copies of one
  // river. Spread the candidates out and the seeds actually describe different watersheds.
  const picked = [];
  for (const s of seeds) {
    if (picked.length >= 8) break;
    if (picked.every(q => Math.hypot(q[0] - s[0], q[1] - s[1]) > 18)) picked.push(s);
  }

  let best = null;
  for (const s of picked) {
    const r = flowFrom(ctx, s[0], s[1]);
    if (!r) continue;
    const score = (r.reached ? 600 : 0) + r.drop * 7 + r.pts.length * 3;
    if (!best || score > best.score) best = { score, pts: r.pts };
  }
  if (!best) return null;

  const pts = best.pts;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i][0] = pts[i - 1][0] * 0.25 + pts[i][0] * 0.5 + pts[i + 1][0] * 0.25;
      pts[i][1] = pts[i - 1][1] * 0.25 + pts[i][1] * 0.5 + pts[i + 1][1] * 0.25;
    }
  }
  const out = [pts[0]];
  for (const q of pts.slice(1)) {
    const l = out[out.length - 1];
    if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 1.2) out.push(q);
  }
  return out.length >= 9 ? out : null;
}

// Steepest descent over a cone of candidate headings with a turn penalty. A momentum-blended
// gradient walk hairpins on a noisy heightfield, and once the path folds back on itself every
// downstream quad self-intersects — which is what a shattered river looks like.
function flowFrom(ctx, sx, sz) {
  const { terrain } = ctx;
  const W = terrain.waterY;
  const r = makeRng(`facet:water:flow:${sx}:${sz}`);
  const wob = r.range(0, Math.PI * 2);
  const STEP = 2.6;

  let x = sx, z = sz;
  const g0 = terrain.normalAt(x, z, 2.4);
  const gl = Math.hypot(g0.x, g0.z) || 1;
  let hx = g0.x / gl, hz = g0.z / gl;

  const pts = [[x, z]];
  const h0 = terrain.heightAt(x, z);
  let reached = false, stuck = 0;

  for (let i = 0; i < 130; i++) {
    const h = terrain.heightAt(x, z);
    const lean = Math.sin(i * 0.19 + wob) * 0.55;
    let best = null, low = null;
    for (let a = -1.4; a < 1.41; a += 0.14) {
      const c = Math.cos(a), s = Math.sin(a);
      const dx = hx * c - hz * s, dz = hx * s + hz * c;
      const nx = x + dx * STEP, nz = z + dz * STEP;
      if (!terrain.inBounds(nx, nz, 3)) continue;
      let loop = false;
      for (let q = 0; q < pts.length - 4 && !loop; q++) {
        loop = Math.hypot(pts[q][0] - nx, pts[q][1] - nz) < 3.2;
      }
      if (loop) continue;
      const nh = terrain.heightAt(nx, nz);
      const rl = Math.hypot(nx - 4, nz - 2);
      const cand = { dx, dz, nx, nz, nh };
      let score = nh + Math.abs(a) * 0.10 - a * lean * 1.4;
      if (rl < 24) score += (1 - rl / 24) * 3.5;
      if (!best || score < best.score) best = { score, ...cand };
      if (!low || nh < low.nh) low = cand;
    }
    // Meander is a preference, never a reason to stop: if the scored pick would climb, fall back
    // to the steepest candidate, and allow a few uphill steps so a shallow saddle does not end
    // the river fifteen metres from its source.
    if (!low) break;
    let go;
    if (low.nh < h) { go = best && best.nh < h ? best : low; stuck = 0; }
    else if (low.nh < h + 0.3 && stuck < 4) { go = low; stuck++; }
    else break;
    hx = go.dx; hz = go.dz;
    x = go.nx; z = go.nz;
    pts.push([x, z]);
    if (go.nh < W + 0.05) { reached = true; break; }
  }
  if (pts.length < 12) return null;
  return { pts, reached, drop: h0 - terrain.heightAt(x, z) };
}

// Two skirts that fall from the water's edge to the grass. On a flat reach they are a thin dark
// rim; where a tread is held above a steep slope they become the wall of the pool.
function channel(m, ctx, path, nor, ey, wy, width, tread, i) {
  const { p, terrain } = ctx;
  const j = i + 1;
  const [nx, nz] = nor[i];
  const wet = shade(mix(p.ground.rock[2], p.ground.dirt[2], 0.5), -0.06);

  const inner = (idx, s) => {
    const w = width[idx] / 2;
    return [path[idx][0] + nx * s * w, ey[s > 0 ? 0 : 1][idx], path[idx][1] + nz * s * w];
  };
  // A running reach only needs a dark rim at the waterline; a cascade pool held above the slope
  // needs a real wall, and that is the same quad with the ground further down.
  const outer = (idx, s) => {
    const w = width[idx] / 2 + (tread.has(idx) ? 0.75 : 0.45);
    const x = path[idx][0] + nx * s * w, z = path[idx][1] + nz * s * w;
    return [x, clamp(terrain.heightAt(x, z) + 0.06, wy[idx] - 1.4, ey[s > 0 ? 0 : 1][idx] - 0.02), z];
  };

  for (const s of [1, -1]) {
    const a0 = inner(i, s), b0 = inner(j, s);
    const a1 = outer(i, s), b1 = outer(j, s);
    if (s > 0) m.quad(a0, b0, b1, a1, wet);
    else m.quad(a1, b1, b0, a0, wet);
  }
}

// A short faceted sheet, emitted with both windings — a near-vertical single-sided sheet that
// happens to face upstream is invisible, and which way it faces depends on the traced path.
function cascade(m, a, b, wa, wb, p, lit, rng) {
  let dx = b[0] - a[0], dz = b[2] - a[2];
  const l = Math.hypot(dx, dz);
  if (l < 0.5) return;
  dx /= l; dz /= l;
  const nx = dz, nz = -dx;
  const cols = 5;

  const rows = [
    { push: 0.00, y: a[1] + 0.03, w: wa * 0.94, c: mix(lit, p.water.foam, 0.34) },
    { push: 0.34, y: a[1] - (a[1] - b[1]) * 0.58, w: (wa + wb) * 0.50, c: mix(p.water.foam, lit, 0.30) },
    { push: 1.00, y: b[1] + 0.05, w: wb * 1.14, c: p.water.foam },
  ].map(r => {
    const pts = [];
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols - 0.5) * r.w + rng.range(-0.16, 0.16);
      pts.push([
        a[0] + dx * l * r.push + nx * s,
        r.y + rng.range(-0.05, 0.05),
        a[2] + dz * l * r.push + nz * s,
      ]);
    }
    return { pts, c: r.c };
  });

  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const A = rows[r].pts[c], B = rows[r].pts[c + 1];
      const C = rows[r + 1].pts[c + 1], D = rows[r + 1].pts[c];
      const col = shade(mix(rows[r].c, rows[r + 1].c, 0.5), rng.range(-0.07, 0.07));
      m.quad(A, B, C, D, col);
      m.quad(D, C, B, A, col);
    }
  }
}

function foamDisc(m, x, y, z, r, col, rng, sides = 7) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const rr = r * rng.range(0.68, 1.28);
    pts.push([x + Math.cos(a) * rr, y + rng.range(-0.02, 0.02), z + Math.sin(a) * rr]);
  }
  const c = [x, y + 0.03, z];
  for (let i = 0; i < sides; i++) m.tri(c, pts[(i + 1) % sides], pts[i], shade(col, rng.range(-0.06, 0.05)));
}

function animFlow(t) {
  const { pos, base, geo } = S.flow;
  for (let i = 1; i < pos.length; i += 3) {
    pos[i] = base[i] + 0.045 * Math.sin(t * 2.35 + base[i - 1] * 0.85 + base[i + 1] * 0.7);
  }
  geo.attributes.position.needsUpdate = true;
  if ((S.f & 1) === 1) geo.computeVertexNormals();
}

// ── clouds ───────────────────────────────────────────────────────────────────────────────────
// Real geometry inside the diorama's bounds, not a skybox: an orthographic camera has no
// horizon to paint a dome onto, and the fog has to reach them for them to sit in the same air.

function buildClouds(ctx) {
  const { p, rng } = ctx;
  const top = shade(mix('#e9f0f6', p.sun.color, 0.14), -0.06);
  const bot = shade(mix(p.sky.haze, p.fill.sky, 0.66), -0.36);

  const parts = [];
  const spans = [];
  let vcount = 0;

  const clusters = 7;
  for (let c = 0; c < clusters; c++) {
    const start = vcount;
    const ang = (c / clusters) * Math.PI * 2 + rng.range(-0.5, 0.5);
    const rad = rng.range(26, 80);
    const cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad;
    const cy = rng.range(58, 88);
    const spine = rng.range(0, Math.PI * 2);
    const sx = Math.cos(spine), sz = Math.sin(spine);
    const bulk = rng.range(0.6, 1.25);
    const lobes = rng.int(3, 5);

    for (let i = 0; i < lobes; i++) {
      const lead = i === 0;
      const r = rng.range(3.2, 5.8) * bulk * (lead ? 1.3 : rng.range(0.62, 0.95));
      const g = blob(r, 1, {
        jitter: 0.13, rng,
        squash: rng.range(0.80, 1.06),
        stretch: rng.range(0.24, 0.36),
        col: '#ffffff',
      });
      gradient(g, bot, top, { power: 1.2 });
      const along = (i - (lobes - 1) * 0.5) * bulk * rng.range(3.0, 5.2);
      const off = rng.range(-2.8, 2.8);
      transform(g, {
        pos: [cx + sx * along - sz * off, cy + rng.range(-0.5, 0.5), cz + sz * along + sx * off],
        ry: spine + rng.range(-0.7, 0.7),
        rz: rng.range(-0.10, 0.10),
        scale: [rng.range(1.2, 1.6), rng.range(0.50, 0.72), rng.range(0.85, 1.2)],
      });
      smooth(g);
      parts.push(g);
      vcount += g.attributes.position.count;
    }
    spans.push({
      start, end: vcount,
      vx: Math.cos(ang + Math.PI * 0.5) * rng.range(0.20, 0.46) * rng.pick([1, -1]),
      vz: Math.sin(ang + Math.PI * 0.5) * rng.range(0.20, 0.46) * rng.pick([1, -1]),
      bob: rng.range(0.35, 0.9),
      ph: rng.range(0, Math.PI * 2),
      per: rng.range(11, 27),
    });
  }
  if (!parts.length) return;

  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const d = dynamic(ctx, geo, 'solid');
  // Under an orthographic camera a cloud 60 units up and 80 units behind projects onto the same
  // screen pixels as the hillside, so it lands *on* the terrain in any low-elevation framing. There
  // is no placement that fixes it for a camera that can orbit. Drawing them first with depth
  // testing off makes them unconditionally sky: they paint over the background and everything else
  // paints over them. They need their own material to do it without dragging the batch along.
  d.mesh.material = ctx.materials.solid.clone();
  d.mesh.material.depthTest = false;
  d.mesh.material.depthWrite = false;
  d.mesh.renderOrder = -1;
  d.mesh.castShadow = false;
  d.mesh.receiveShadow = false;
  d.spans = spans;
  S.clouds = d;
}

function animClouds(t) {
  const { pos, base, spans, geo } = S.clouds;
  for (const s of spans) {
    // Wrapping at 220 units with a ~0.3 u/s drift means the reset lands well past ten minutes.
    const dx = ((s.vx * t + 110) % 220) - 110;
    const dz = ((s.vz * t + 110) % 220) - 110;
    const dy = Math.sin(t * (Math.PI * 2 / s.per) + s.ph) * s.bob;
    for (let v = s.start; v < s.end; v++) {
      const o = v * 3;
      pos[o] = base[o] + dx;
      pos[o + 1] = base[o + 1] + dy;
      pos[o + 2] = base[o + 2] + dz;
    }
  }
  geo.attributes.position.needsUpdate = true;
}
