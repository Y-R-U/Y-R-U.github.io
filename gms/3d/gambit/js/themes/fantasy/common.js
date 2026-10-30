// Fantasy theme shared bits: side palettes, the ONE piece material per side, and the round
// figurine plinth every fantasy piece stands on.
//
// One material per side (= 1 draw call per piece kind). Everything is vertex data:
//   color  = albedo (ivory / blue cloth / gold ... for white; ebony / red / dark iron for black)
//   uv.x   = glow amount   -> emissive = color * glow * GLOW   (gems, eyes, rune inlays)
//   uv.y   = metal amount  -> metalness = uv.y, roughness lerps toward the metal roughness
// Because metal is per vertex, gold trim blends into ivory across one triangle instead of
// stair-stepping along a material split. Injected with onBeforeCompile on top of the kit's
// fresnel rim, so kit.ownMaterials() clones keep it.

export const GLOW = 2.4;

/** Side palettes (sRGB hex). w = ivory/gold + blue, b = ebony/dark iron + red (refs). */
export const PAL = {
  w: {
    body: '#efe4cf', bodyShade: '#cdbb98', cloth: '#2a5fd2', clothDeep: '#183c96', plume: '#2f6be0', plumeTip: '#9cc2ff',
    metal: '#ffcf73', trim: '#ffcc6a', gem: '#2f8cff', rune: '#5aa8ff', dais: '#e2c27e', hair: '#f8f5ee', hairShade: '#cfc6b6', dark: '#3a2c1c',
    roughness: 0.38, metalRough: 0.24, rim: { mode: 'darken', color: '#2a1d0c', strength: 0.5, power: 2.3 },
  },
  b: {
    body: '#1b1a20', bodyShade: '#101014', cloth: '#a3121c', clothDeep: '#55070d', plume: '#9a0f19', plumeTip: '#2a0a0e',
    metal: '#50535e', trim: '#b08840', gem: '#ff2a1a', rune: '#ff4a32', dais: '#8a8f9c', hair: '#9a9590', hairShade: '#5d5956', dark: '#070606',
    roughness: 0.3, metalRough: 0.2, rim: { mode: 'glow', color: '#ff5a3c', strength: 0.11, power: 2.8 },
  },
};

const rgbCache = new Map();
/** sRGB hex -> linear [r,g,b] (what vertex colours want). */
export function rgb(THREE, hex) {
  if (!rgbCache.has(hex)) { const c = new THREE.Color(hex); rgbCache.set(hex, [c.r, c.g, c.b]); }
  return rgbCache.get(hex);
}
export const scaleRGB = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function patch(m, metalRough) {
  if (m.userData.fantasy) return m;
  m.userData.fantasy = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFX = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${metalRough.toFixed(3)}, vFX.y);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vFX.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFX.x * ${GLOW.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '_fantasy' + metalRough;
  return m;
}

/** The single fantasy piece material for a side (cached by the kit). */
export function pieceMat(kit, color) {
  const p = PAL[color];
  return patch(kit.material({ color: '#ffffff', roughness: p.roughness, metalness: 1, rim: p.rim, fantasy: 1 }), p.metalRough);
}

/**
 * Prepare a primitive/lathe geometry for merging: flat vertex colour, glow (uv.x), metal (uv.y).
 * (Three's primitives ship real UVs, which would read as glow/metal, so every part goes through this.)
 */
export function prep(THREE, g, col, { glow = 0, metal = 0 } = {}) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), u = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; u[i * 2] = glow; u[i * 2 + 1] = metal; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return g;
}
/** Re-paint per vertex: fn(x,y,z) -> [r,g,b] | {c:[r,g,b], glow?, metal?} | null. */
export function paintAbs(g, fn) {
  const p = g.attributes.position, c = g.attributes.color, u = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (!v) continue;
    const col = Array.isArray(v) ? v : v.c;
    if (col) c.setXYZ(i, col[0], col[1], col[2]);
    if (!Array.isArray(v)) { if (v.glow != null) u.setX(i, v.glow); if (v.metal != null) u.setY(i, v.metal); }
  }
  return g;
}

/**
 * Round figurine plinth (lathe) with a gold band and a thin glowing rune ring on the top step.
 * R = outer radius, H = top height. Returns an array of geometries; top surface at y = H.
 */
export function plinth(THREE, kit, color, { R = 0.36, H = 0.13, seg = 32 } = {}) {
  const p = PAL[color];
  const body = rgb(THREE, p.body), trim = rgb(THREE, p.trim);
  const prof = kit.profile()
    .pt(0, 0).pt(R - 0.018, 0).arc(R - 0.018, 0.018, 0.018, -90, 0, 2)
    .pt(R, 0.03).pt(R - 0.004, 0.036)
    .arc(R - 0.006, 0.054, 0.016, -80, 80, 3)            // gold torus band (painted metal)
    .pt(R - 0.012, 0.074).pt(R - 0.03, 0.08)
    .bez(R - 0.032, 0.1, R - 0.056, 0.104, 2)
    .pt(R - 0.07, 0.108).arc(R - 0.07, H - 0.012, 0.012, -90, 90, 3)
    .pt(R - 0.09, H).pt(0, H);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: seg }), body);
  paintAbs(g, (x, y, z) => {
    if (y > 0.035 && y < 0.073 && Math.hypot(x, z) > R - 0.025) return { c: trim, metal: 1 };
    if (y < 0.03) return scaleRGB(body, 0.7);
    // top dais in metal (gold / steel) so the figure's silhouette stands out from straight above
    if (y > H - 0.002 && Math.hypot(x, z) < R - 0.085) return { c: rgb(THREE, p.dais), metal: 0.55 };
    return null;
  });
  // rune ring: a thin glowing inlay on the top step (side colour visible from above)
  const rune = prep(THREE, kit.place(new THREE.TorusGeometry(R - 0.051, 0.0055, 3, seg), { y: 0.106, rx: Math.PI / 2 }), rgb(THREE, p.rune), { glow: 0.55 });
  return [g, rune];
}

/** Build the final piece Group (one mesh, one material) from a list of prepared geometries. */
export function assemble(kit, color, geoms) {
  // sculpting aid: ?FANTASY_PARTS in the viewer logs triangles per part (largest first)
  if (globalThis.FANTASY_PARTS) globalThis.FANTASY_PARTS.push(geoms.map((g, i) => [i, (g.index ? g.index.count : g.attributes.position.count) / 3]).sort((a, b) => b[1] - a[1]));
  return kit.piece(geoms, pieceMat(kit, color));
}
