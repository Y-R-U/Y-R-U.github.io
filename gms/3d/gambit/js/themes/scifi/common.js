// Sci-fi theme shared bits: faction palettes, the ONE piece material per side, and a
// hard-surface lathe that keeps creases crisp (panel lines, chamfers, light channels).
//
// One material per side (= 1 draw call per piece kind), same trick as fantasy/common.js:
//   color = albedo, uv.x = glow (emissive = colour * glow * GLOW), uv.y = metal amount
//   (metalness = uv.y, roughness lerps toward the metal roughness).
// Every geometry going into a piece must carry color + uv set by this file (prep / hsLathe),
// because Three's primitives ship real UVs that would read as glow/metal.

export const GLOW = 1.5;

/**
 * Faction palettes (sRGB hex). Each entry is a "finish": c = colour, glow, metal.
 *   w = "Aegis": pearl-white ceramic, satin silver trim, CYAN light-lines.
 *   b = "Nova":  gunmetal, bright steel edges, MAGENTA light-lines (red family = black side).
 * From straight overhead: warm-white disc + cyan rings vs. grey-steel disc + magenta rings.
 */
export const PAL = {
  w: {
    body:  { c: '#eef1f5' },                     // pearl ceramic
    shade: { c: '#cfd7e1' },                     // secondary panels
    deck:  { c: '#aab5c3' },                     // recessed decks between parts
    trim:  { c: '#c9d2dd', metal: 1 },           // satin silver edges / hubs
    dark:  { c: '#1d232c' },                     // panel-line grooves, wells, undersides
    well:  { c: '#10141a' },
    glass: { c: '#0b1119', metal: 0.55 },        // visor glass
    line:  { c: '#12c6ff', glow: 1 },            // the signature light-line
    lineHi:{ c: '#6fe6ff', glow: 1.2 },         // eyes, emitter cores
    lineLo:{ c: '#12c6ff', glow: 0.5 },         // dim glows (reactor in the well)
    roughness: 0.3, metalRough: 0.26,
    rim: { mode: 'darken', color: '#16202c', strength: 0.5, power: 2.4 },
    spark: ['#ffffff', '#9af0ff', '#2fd2ff', '#1a8cff'],
    trail: ['#12c6ff', '#1a8cff', '#6fe6ff'],
  },
  b: {
    body:  { c: '#4b515d' },                     // gunmetal (mid value: reads on slate squares)
    shade: { c: '#3a3f49' },
    deck:  { c: '#2b2f37' },
    trim:  { c: '#a7b0bf', metal: 1 },           // bright steel edges (catch light from above)
    dark:  { c: '#0c0e13' },
    well:  { c: '#07080b' },
    glass: { c: '#050608', metal: 0.55 },
    line:  { c: '#ff1a6c', glow: 1 },
    lineHi:{ c: '#ff6aa6', glow: 1.2 },
    lineLo:{ c: '#ff1a6c', glow: 0.5 },
    roughness: 0.34, metalRough: 0.24,
    rim: { mode: 'glow', color: '#c7cdf2', strength: 0.22, power: 3.0, top: { color: '#dfe5ff', strength: 0.2, power: 14 } },
    spark: ['#ffffff', '#ff8ab8', '#ff2f7e', '#ff9a3a'],
    trail: ['#ff1a6c', '#d0105a', '#ff6aa6'],
  },
};

const rgbCache = new Map();
/** sRGB hex -> linear [r,g,b]. */
export function rgb(THREE, hex) {
  if (!rgbCache.has(hex)) { const c = new THREE.Color(hex); rgbCache.set(hex, [c.r, c.g, c.b]); }
  return rgbCache.get(hex);
}
/** Resolve a finish key ('body', 'line' ...) for a side -> {c:[r,g,b], glow, metal}. */
export function fin(THREE, color, key) {
  const f = typeof key === 'string' ? PAL[color][key] : key;
  return { c: rgb(THREE, f.c), glow: f.glow || 0, metal: f.metal || 0 };
}

function patch(m, metalRough) {
  if (m.userData.scifi) return m;
  m.userData.scifi = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFX = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      // light-lines are mostly emission: dim their lit albedo so they stay saturated neon
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.8 * clamp(vFX.x, 0.0, 1.0);')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${metalRough.toFixed(3)}, vFX.y);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vFX.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFX.x * ${GLOW.toFixed(2)};`)
      // the kit's overhead "top sheen" would light up wells and grooves too: scale it by albedo
      .replace('totalEmissiveRadiance += uTopColor *', 'totalEmissiveRadiance += clamp(dot(vColor.rgb, vec3(0.3, 0.59, 0.11)) * 12.0, 0.0, 1.0) * (1.0 - vFX.x) * uTopColor *');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '_scifi' + metalRough;
  return m;
}

/** The single sci-fi piece material for a side (cached by the kit). */
export function pieceMat(kit, color) {
  const p = PAL[color];
  return patch(kit.material({ color: '#ffffff', roughness: p.roughness, metalness: 1, rim: p.rim, scifi: 1 }), p.metalRough);
}

/** Flat finish on a whole geometry (sets color + uv attributes). */
export function prep(THREE, g, color, key) {
  const f = fin(THREE, color, key);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), u = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { c.set(f.c, i * 3); u[i * 2] = f.glow; u[i * 2 + 1] = f.metal; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return g;
}

/**
 * Hard-surface lathe. pts = [[r, y, key, smooth?], ...] in order; `key` is the finish of the
 * segment ENDING at that point (the first point's key is used by the closing segment when
 * closed). Creases stay crisp unless the point is marked smooth (normals averaged there).
 * Normals follow the profile direction: walk the outer surface bottom -> top (or a closed
 * section counter-clockwise in r-right / y-up) and they face outward.
 * opts: seg, phiStart, phiLength, flat (faceted around: octagons etc.), closed, caps.
 * Returns a non-indexed BufferGeometry with position, normal, color, uv.
 */
export function hsLathe(THREE, color, pts, { seg = 40, phiStart = 0, phiLength = Math.PI * 2, flat = false, closed = false, caps = false } = {}) {
  const P = pts.map(p => ({ r: p[0], y: p[1], f: fin(THREE, color, p[2] || 'body'), s: !!p[3] }));
  const n = P.length, nSeg = closed ? n : n - 1;
  const segN = [];
  const cf = flat ? Math.cos(phiLength / seg / 2) : 1;     // facet plane sits inside the vertex ring
  for (let i = 0; i < nSeg; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const dr = (b.r - a.r) * cf, dy = b.y - a.y, L = Math.hypot(dr, dy) || 1;
    segN.push([dy / L, -dr / L]);
  }
  const nrmAt = (i, j) => {             // normal at point j as seen from segment i
    const p = P[j];
    if (!p.s) return segN[i];
    const other = j === i ? i - 1 : i + 1;
    const o = closed ? segN[(other + nSeg) % nSeg] : segN[other];
    if (!o) return segN[i];
    const x = segN[i][0] + o[0], y = segN[i][1] + o[1], L = Math.hypot(x, y) || 1;
    return [x / L, y / L];
  };
  const pos = [], nor = [], col = [], uv = [];
  const push = (r, y, phi, nr, ny, f, phiN = phi) => {
    pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
    nor.push(nr * Math.sin(phiN), ny, nr * Math.cos(phiN));
    col.push(f.c[0], f.c[1], f.c[2]); uv.push(f.glow, f.metal);
  };
  for (let i = 0; i < nSeg; i++) {
    const j0 = i, j1 = (i + 1) % n, A = P[j0], B = P[j1];
    if (Math.hypot(B.r - A.r, B.y - A.y) < 1e-7) continue;
    const nA = nrmAt(i, j0), nB = nrmAt(i, j1), f = B.f;
    for (let k = 0; k < seg; k++) {
      const p0 = phiStart + (k / seg) * phiLength, p1 = phiStart + ((k + 1) / seg) * phiLength, pc = (p0 + p1) / 2;
      const q0 = flat ? pc : p0, q1 = flat ? pc : p1;
      // quad A0 A1 B1 B0 (A = lower point of the profile segment)
      const tri = (v) => { for (const [r, y, ph, nn, phN] of v) push(r, y, ph, nn[0], nn[1], f, phN); };
      tri([[A.r, A.y, p0, nA, q0], [B.r, B.y, p1, nB, q1], [B.r, B.y, p0, nB, q0]]);
      tri([[A.r, A.y, p0, nA, q0], [A.r, A.y, p1, nA, q1], [B.r, B.y, p1, nB, q1]]);
    }
  }
  if (caps && phiLength < Math.PI * 2 - 1e-6) {
    const contour = P.map(p => new THREE.Vector2(p.r, p.y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [phi, sgn] of [[phiStart, -1], [phiStart + phiLength, 1]]) {
      const nx = Math.cos(phi) * sgn, nz = -Math.sin(phi) * sgn;
      for (const t of tris) for (const j of t) {
        const p = P[j], f = P[0].f;
        pos.push(p.r * Math.sin(phi), p.y, p.r * Math.cos(phi)); nor.push(nx, 0, nz);
        col.push(f.c[0], f.c[1], f.c[2]); uv.push(f.glow, f.metal);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return fixWinding(THREE, g);
}

/** Make every triangle's winding agree with its vertex normals (so front faces face out). */
export function fixWinding(THREE, g) {
  const p = g.attributes.position.array, nrm = g.attributes.normal.array;
  const attrs = Object.values(g.attributes);
  for (let t = 0; t < p.length / 9; t++) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * (nrm[o] + nrm[o + 3] + nrm[o + 6]) + cy * (nrm[o + 1] + nrm[o + 4] + nrm[o + 7]) + cz * (nrm[o + 2] + nrm[o + 5] + nrm[o + 8]);
    if (d < 0) for (const a of attrs) {           // swap vertex 1 and 2
      const s = a.itemSize, arr = a.array, i1 = (t * 3 + 1) * s, i2 = (t * 3 + 2) * s;
      for (let k = 0; k < s; k++) { const tmp = arr[i1 + k]; arr[i1 + k] = arr[i2 + k]; arr[i2 + k] = tmp; }
    }
  }
  return g;
}

/** Re-finish vertices: fn(x,y,z) -> finish key | null. */
export function refinish(THREE, g, color, fn) {
  const p = g.attributes.position, c = g.attributes.color, u = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (!k) continue;
    const f = fin(THREE, color, k);
    c.setXYZ(i, f.c[0], f.c[1], f.c[2]); u.setXY(i, f.glow, f.metal);
  }
  return g;
}

/** Build the final piece Group (one mesh, one material). */
export function assemble(kit, color, geoms) {
  return kit.piece(geoms, pieceMat(kit, color));
}
