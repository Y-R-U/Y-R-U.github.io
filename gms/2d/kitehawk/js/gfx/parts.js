import { hash2, hashStr } from './gmath.js';

/**
 * The painted world / code actor seam is the single biggest risk to this game
 * looking good: a clean-edged polygon aeroplane flying across a painted sky
 * reads instantly as a different game pasted on. Four things stop that, and all
 * four live here:
 *
 *   1. three flat tones per part with a HARD terminator — a smooth ramp reads
 *      as 3D and loses the painted read
 *   2. stable per-vertex jitter, hashed once at build — no edge is machine
 *      straight, and jitter re-rolled per frame crawls, which is worse
 *   3. a darker loaded edge on the SHADOW side only — an outline all the way
 *      round is a cartoon; a loaded edge on one side is a brush
 *   4. the shared screen-space paper grain, which the renderer puts over the
 *      whole layer (R.setGrain + the layer's grainAmt)
 *
 * Rigs emit per-vertex-coloured triangles onto the existing tri stream. No new
 * stream, no new shader, no allocation at draw time.
 */

const DEF_TONES = { lit: 1.26, mid: 1.0, shadow: 0.54 };
const DEF_TERM = { hi: 0.30, lo: -0.12 };

/** ART.md §5: the far side of the aeroplane is 0.62 value, no 3D needed. */
const FAR_VALUE = 0.62;

function flatten(poly) {
  if (typeof poly[0] === 'number') return poly.slice();
  const out = new Array(poly.length * 2);
  for (let i = 0; i < poly.length; i++) { out[i * 2] = poly[i][0]; out[i * 2 + 1] = poly[i][1]; }
  return out;
}

/**
 * def = {
 *   tones, terminator, jitter, jitterRel, edge, edgeDark, maxEdges,
 *   parts: [{
 *     id, parent, x, y, angle,
 *     poly,            flat [x,y,...] or [[x,y],...], convex, LOCAL to the part
 *     normal: [nx,ny], the direction the surface faces on screen
 *     color:  [r,g,b],
 *     side:   'near' | 'far',
 *     z, alpha, jitter, jitterRel, edge, tones, hidden
 *   }],
 *   poses: { name: { partId: radians } }
 * }
 */
export function createRig(def) {
  const src = def.parts;
  const n = src.length;
  const index = new Map();
  for (let i = 0; i < n; i++) index.set(src[i].id, i);

  const order = topoOrder(src, index);

  const parts = new Array(n);
  let maxV = 3;
  for (let i = 0; i < n; i++) {
    const p = src[i];
    const raw = flatten(p.poly);
    const nv = raw.length >> 1;
    maxV = Math.max(maxV, nv);
    const pid = hashStr(p.id);
    const jitAbs = p.jitter === undefined ? (def.jitter === undefined ? 0 : def.jitter) : p.jitter;
    // Relative jitter is the one that actually works. An absolute wobble that
    // reads on a 30-unit wing is a deformity on a 5-unit strut, and a wobble
    // sized for the strut is sub-pixel on the wing. Scaled by the GEOMETRIC
    // MEAN of the part's extents, not the diagonal: scaling a wing's wobble by
    // its span would put a 3-unit ripple in a 5-unit chord.
    const jitRel = p.jitterRel === undefined ? (def.jitterRel === undefined ? 0.045 : def.jitterRel) : p.jitterRel;
    let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
    for (let v = 0; v < nv; v++) {
      const px0 = raw[v * 2], py0 = raw[v * 2 + 1];
      if (px0 < ex0) ex0 = px0; if (px0 > ex1) ex1 = px0;
      if (py0 < ey0) ey0 = py0; if (py0 > ey1) ey1 = py0;
    }
    const jitAmp = jitAbs + jitRel * Math.sqrt(Math.max(1e-3, (ex1 - ex0) * (ey1 - ey0)));

    // Stable, computed once. A jitter re-rolled per frame crawls, and crawling
    // is worse than machine-straight.
    const jx = new Float32Array(nv), jy = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const a = hash2(pid & 0xffff, v * 7 + 1) * Math.PI * 2;
      const r = (0.35 + 0.65 * hash2(pid & 0xffff, v * 7 + 2)) * jitAmp;
      jx[v] = raw[v * 2] + Math.cos(a) * r;
      jy[v] = raw[v * 2 + 1] + Math.sin(a) * r;
    }

    let cx = 0, cy = 0;
    for (let v = 0; v < nv; v++) { cx += jx[v]; cy += jy[v]; }
    cx /= nv; cy /= nv;

    // outward edge normals, in part-local space, from the jittered outline
    const enx = new Float32Array(nv), eny = new Float32Array(nv);
    const ejw = new Float32Array(nv), ejw2 = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const w = (v + 1) % nv;
      const dx = jx[w] - jx[v], dy = jy[w] - jy[v];
      const len = Math.hypot(dx, dy) || 1;
      let nx = dy / len, ny = -dx / len;
      const mx = (jx[v] + jx[w]) * 0.5 - cx, my = (jy[v] + jy[w]) * 0.5 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      enx[v] = nx; eny[v] = ny;
      // an even edge is a pen, not a brush
      ejw[v] = 0.62 + 0.76 * hash2(pid & 0xffff, v * 7 + 3);
      ejw2[v] = 0.45 + 0.95 * hash2(pid & 0xffff, v * 7 + 4);
    }

    const nrm = p.normal || [0, -1];
    const nl = Math.hypot(nrm[0], nrm[1]) || 1;

    parts[i] = {
      id: p.id,
      pid,
      parent: p.parent === undefined || p.parent === null ? -1 : index.get(p.parent),
      x: p.x || 0, y: p.y || 0,
      rest: p.angle || 0,
      angle: p.angle || 0,
      nv, raw, jx, jy, cx, cy, enx, eny, ejw, ejw2,
      nx: nrm[0] / nl, ny: nrm[1] / nl,
      color: p.color || [0.72, 0.68, 0.60],
      alpha: p.alpha === undefined ? 1 : p.alpha,
      far: p.side === 'far',
      z: p.z === undefined ? i : p.z,
      hidden: !!p.hidden,
      edge: p.edge === undefined ? (def.edge === undefined ? 1.4 : def.edge) : p.edge,
      tones: p.tones || def.tones || DEF_TONES,
    };
  }

  // draw order is fixed at build: sorting a part tree every frame is both a
  // per-frame allocation and a source of z-fighting flicker when two parts tie
  const draw = parts.map((_, i) => i).sort((a, b) => (parts[a].z - parts[b].z) || (a - b));

  const rig = {
    parts, index, order, draw,
    poses: def.poses || {},
    terminator: def.terminator || DEF_TERM,
    edgeDark: def.edgeDark === undefined ? 0.58 : def.edgeDark,
    maxEdges: def.maxEdges === undefined ? 2 : def.maxEdges,
    // scratch, allocated once
    m: new Float32Array(n * 6),
    wx: new Float32Array(maxV),
    wy: new Float32Array(maxV),

    setAngle(id, radians) {
      const i = index.get(id);
      if (i !== undefined) parts[i].angle = radians;
      return rig;
    },
    getAngle(id) { const i = index.get(id); return i === undefined ? 0 : parts[i].angle; },

    /** Blend from every part's rest angle toward a named pose. t = 0..1. */
    pose(name, t) {
      const p = rig.poses[name];
      if (!p) return rig;
      const k = t < 0 ? 0 : t > 1 ? 1 : t;
      for (let i = 0; i < n; i++) {
        const target = p[parts[i].id];
        if (target === undefined) continue;
        parts[i].angle = parts[i].rest + (target - parts[i].rest) * k;
      }
      return rig;
    },

    setHidden(id, v) { const i = index.get(id); if (i !== undefined) parts[i].hidden = !!v; return rig; },
    setColor(id, rgb) { const i = index.get(id); if (i !== undefined) parts[i].color = rgb; return rig; },
    setSide(id, side) { const i = index.get(id); if (i !== undefined) parts[i].far = side === 'far'; return rig; },
    get(id) { const i = index.get(id); return i === undefined ? null : parts[i]; },

    /** Worst case: every part fans plus its capped shadow edges. */
    triBudget() {
      let t = 0;
      for (let i = 0; i < n; i++) t += (parts[i].nv - 2) + rig.maxEdges * 2;
      return t;
    },
  };
  return rig;
}

function topoOrder(src, index) {
  const n = src.length;
  const out = [];
  const state = new Uint8Array(n);
  const visit = (i) => {
    if (state[i] === 2) return;
    if (state[i] === 1) throw new Error('rig: parent cycle at ' + src[i].id);
    state[i] = 1;
    const p = src[i].parent;
    if (p !== undefined && p !== null) {
      const pi = index.get(p);
      if (pi === undefined) throw new Error('rig: unknown parent ' + p + ' on ' + src[i].id);
      visit(pi);
    }
    state[i] = 2;
    out.push(i);
  };
  for (let i = 0; i < n; i++) visit(i);
  return out;
}

/* ---- draw ------------------------------------------------------------- */

const _c = [0, 0, 0, 1];
const _lit = { x: 0, y: 0, r: 1, g: 1, b: 1 };
const _defFeatures = { tones: true, jitter: true, edge: true };

/**
 * Called through R.drawRig(). `lights` is a list of
 *   { dx, dy, intensity, r, g, b }        direction pointing TOWARD the light
 *   { x, y, radius, intensity, r, g, b }  world-space point light
 * Both are pure shading input for the tone choice — they are NOT the renderer's
 * light buffer, which is added on top by the layer's own response.
 */
export function drawRigInto(R, rig, x, y, rot, scale, lights, layer, o) {
  const f = (o && o.features) || _defFeatures;
  const useJitter = f.jitter !== false;
  const useTones = f.tones !== false;
  const useEdge = f.edge !== false;
  const tintAmt = o && o.tint !== undefined ? o.tint : 0.22;
  const alphaMul = o && o.alpha !== undefined ? o.alpha : 1;
  const flip = o && o.flipX ? -1 : 1;
  const parts = rig.parts, order = rig.order, m = rig.m;
  const term = rig.terminator;
  const opt = o && o.add ? _addOpt : null;

  const cr = Math.cos(rot), sr = Math.sin(rot);
  const sx = scale * flip, sy = scale;

  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const p = parts[i];
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    let a, b, c, d, e, g;
    if (p.parent < 0) {
      // root: rig transform composed with the part's own offset and angle
      const ra = sx * cr, rb = sx * sr, rc = -sy * sr, rd = sy * cr;
      a = ra * ca + rc * sa;
      b = rb * ca + rd * sa;
      c = ra * -sa + rc * ca;
      d = rb * -sa + rd * ca;
      e = ra * p.x + rc * p.y + x;
      g = rb * p.x + rd * p.y + y;
    } else {
      const j = p.parent * 6;
      const pa = m[j], pb = m[j + 1], pc = m[j + 2], pd = m[j + 3], pe = m[j + 4], pf = m[j + 5];
      a = pa * ca + pc * sa;
      b = pb * ca + pd * sa;
      c = pa * -sa + pc * ca;
      d = pb * -sa + pd * ca;
      e = pa * p.x + pc * p.y + pe;
      g = pb * p.x + pd * p.y + pf;
    }
    const j = i * 6;
    m[j] = a; m[j + 1] = b; m[j + 2] = c; m[j + 3] = d; m[j + 4] = e; m[j + 5] = g;
  }

  for (let k = 0; k < rig.draw.length; k++) {
    const i = rig.draw[k];
    const p = parts[i];
    if (p.hidden) continue;
    const j = i * 6;
    const a = m[j], b = m[j + 1], c = m[j + 2], d = m[j + 3], e = m[j + 4], g = m[j + 5];

    const px = p.jx, py = p.jy, raw = p.raw;
    const wx = rig.wx, wy = rig.wy;
    for (let v = 0; v < p.nv; v++) {
      const lx = useJitter ? px[v] : raw[v * 2];
      const ly = useJitter ? py[v] : raw[v * 2 + 1];
      wx[v] = a * lx + c * ly + e;
      wy[v] = b * lx + d * ly + g;
    }

    const wcx = a * p.cx + c * p.cy + e;
    const wcy = b * p.cx + d * p.cy + g;
    const lit = gatherLight(lights, wcx, wcy, o);

    // rotate the part normal into world space (direction only, so no translate)
    let nx = a * p.nx + c * p.ny;
    let ny = b * p.nx + d * p.ny;
    const nlen = Math.hypot(nx, ny) || 1;
    nx /= nlen; ny /= nlen;

    const nl = nx * lit.x + ny * lit.y;
    const t = p.tones;
    // HARD terminator: three flat tones, no smoothstep. A ramp here reads as a
    // 3D render and the painted quality goes with it.
    let tone = t.mid;
    if (useTones) tone = nl > term.hi ? t.lit : (nl > term.lo ? t.mid : t.shadow);

    const far = p.far ? FAR_VALUE : 1;
    const base = p.color;
    const kk = useTones ? Math.max(0, nl) * tintAmt : 0;
    _c[0] = base[0] * tone * far * (1 - kk) + lit.r * base[0] * tone * far * kk * 1.35;
    _c[1] = base[1] * tone * far * (1 - kk) + lit.g * base[1] * tone * far * kk * 1.35;
    _c[2] = base[2] * tone * far * (1 - kk) + lit.b * base[2] * tone * far * kk * 1.35;
    _c[3] = p.alpha * alphaMul;

    for (let v = 1; v < p.nv - 1; v++) {
      R.tri(wx[0], wy[0], _c, wx[v], wy[v], _c, wx[v + 1], wy[v + 1], _c, layer, opt);
    }

    if (!useEdge || p.edge <= 0) continue;

    // The loaded edge: the shadow side only, thickened inward, uneven in width.
    let used = 0;
    for (let v = 0; v < p.nv && used < rig.maxEdges; v++) {
      let ex = a * p.enx[v] + c * p.eny[v];
      let ey = b * p.enx[v] + d * p.eny[v];
      const el = Math.hypot(ex, ey) || 1;
      ex /= el; ey /= el;
      if (ex * lit.x + ey * lit.y > -0.08) continue;
      used++;
      const w = (v + 1) % p.nv;
      // different width at each end: a uniform-width stroke is a pen, and the
      // whole point of this edge is that it looks loaded by hand
      const w0 = p.edge * p.ejw[v] * scale, w1 = p.edge * p.ejw2[v] * scale;
      const ix0 = -ex * w0, iy0 = -ey * w0;
      const ix1 = -ex * w1, iy1 = -ey * w1;
      const dk = rig.edgeDark;
      _c[0] = base[0] * t.shadow * far * dk;
      _c[1] = base[1] * t.shadow * far * dk;
      _c[2] = base[2] * t.shadow * far * dk;
      R.tri(wx[v], wy[v], _c, wx[w], wy[w], _c, wx[w] + ix1, wy[w] + iy1, _c, layer, opt);
      R.tri(wx[v], wy[v], _c, wx[w] + ix1, wy[w] + iy1, _c, wx[v] + ix0, wy[v] + iy0, _c, layer, opt);
    }
  }
}

const _addOpt = { add: true };

/**
 * Sums the light list into one direction and colour. Falls back to a key from
 * above-left, which is P1's warm key against a cool shadow.
 */
function gatherLight(lights, cx, cy, o) {
  let lx = 0, ly = 0, r = 0, g = 0, b = 0, wsum = 0;
  if (lights) {
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const inten = L.intensity === undefined ? 1 : L.intensity;
      if (inten <= 0) continue;
      let dx, dy, w = inten;
      if (L.dx !== undefined) {
        dx = L.dx; dy = L.dy;
      } else {
        dx = L.x - cx; dy = L.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist; dy /= dist;
        const rad = L.radius || 1;
        const f = rad / (rad + dist);
        w = inten * f * f;
      }
      const dl = Math.hypot(dx, dy) || 1;
      lx += (dx / dl) * w; ly += (dy / dl) * w;
      r += (L.r === undefined ? 1 : L.r) * w;
      g += (L.g === undefined ? 1 : L.g) * w;
      b += (L.b === undefined ? 1 : L.b) * w;
      wsum += w;
    }
  }
  const len = Math.hypot(lx, ly);
  if (len < 1e-4 || wsum <= 0) {
    const k = (o && o.keyDir) || null;
    _lit.x = k ? k[0] : -0.55;
    _lit.y = k ? k[1] : -0.84;
    _lit.r = _lit.g = _lit.b = 1;
    return _lit;
  }
  _lit.x = lx / len; _lit.y = ly / len;
  _lit.r = r / wsum; _lit.g = g / wsum; _lit.b = b / wsum;
  return _lit;
}
