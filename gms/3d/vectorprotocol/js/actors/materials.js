import * as THREE from 'three';

// Faction glow + palette schemes. Every model picks a scheme ('dark' | 'light' | 'bold'); the faction decides colours.
export const FACTIONS = {
  corporate: {
    glow: 0x1fd2ff, eye: 0x8af0ff, plate: 0x22d3ff,
    dark: { paint: 0x161d2a, accent: 0x2457b8, trim: 0xd99a2b },
    light: { paint: 0xdfe7f1, accent: 0x2d6fe0, trim: 0x1a2230 },
    bold: { paint: 0x2459c4, accent: 0x161d2a, trim: 0xd8e2ee },
  },
  rogue: {
    glow: 0xff5418, eye: 0xff4a1c, plate: 0xff6a1a,
    dark: { paint: 0x17131a, accent: 0xc0181c, trim: 0xff7a1a },
    light: { paint: 0xe4ddd6, accent: 0xc41a1e, trim: 0x1c1618 },
    bold: { paint: 0xc4191d, accent: 0xe2dcd6, trim: 0x1c1618 },
  },
  experimental: {
    glow: 0xb24dff, eye: 0xe0a0ff, plate: 0xa855f7,
    dark: { paint: 0x17112a, accent: 0x6a2fd6, trim: 0xd28cff },
    light: { paint: 0xe4def4, accent: 0x7434e0, trim: 0x1d1530 },
    bold: { paint: 0x5b25c4, accent: 0x1b1430, trim: 0xd7c7ff },
  },
  legendary: {
    glow: 0xffb83a, eye: 0xfff1b8, plate: 0xffc23a,
    dark: { paint: 0x18161a, accent: 0xd9a032, trim: 0xf6e3b0 },
    light: { paint: 0xf1e7cf, accent: 0xcf9426, trim: 0x18161a },
    bold: { paint: 0xd59a2a, accent: 0x18161a, trim: 0xf6e3b0 },
  },
};
// D21 fantasy factions (organic units): paint = primary (steel plate / fur / bark / hide), accent = cloth / leather / moss,
// metal = iron, bone, claws, trim = gold / bronze, glow = magic, eye = eyes. Plates: order blue, wild green, horde red.
Object.assign(FACTIONS, {
  order: { glow: 0x5aa8ff, eye: 0xcfe6ff, plate: 0x3b82f6,
    dark: { paint: 0x7d8792, accent: 0x1f3a7a, trim: 0xd4a640 }, light: { paint: 0xc9d2dc, accent: 0x2a4ea8, trim: 0xd4a640 }, bold: { paint: 0x2a4ea8, accent: 0x7d8792, trim: 0xd4a640 } },
  wild: { glow: 0x86ff6a, eye: 0xe2ffa8, plate: 0x22c55e,
    dark: { paint: 0x5a4632, accent: 0x2e5e28, trim: 0xc9b27a }, light: { paint: 0x8a7556, accent: 0x3f7a33, trim: 0xd8c48c }, bold: { paint: 0x2e5e28, accent: 0x5a4632, trim: 0xc9b27a } },
  horde: { glow: 0xff5a1e, eye: 0xffa040, plate: 0xef4444,
    dark: { paint: 0x463a36, accent: 0x7a1d18, trim: 0xb59a6a }, light: { paint: 0x7a6a60, accent: 0x9a2a20, trim: 0xc8ae80 }, bold: { paint: 0x7a1d18, accent: 0x463a36, trim: 0xb59a6a } },
});
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
// rarity tier colours (UI frames, plate pips and the units' rim light use the same ladder)
export const RARITY_COLORS = [0x9aa4b0, 0x3d9bff, 0xb05cff, 0xffb43a];
export const rarityIndex = (r) => Math.max(0, RARITIES.indexOf(r));

// Object-space (bind pose) surface detail, no textures: panel grooves (bump-shaded), rivets, a hashed subset of glowing
// seams (rare+), per-panel tone variation, and value-noise grime / brushed-metal breakup on albedo + roughness.
const PANEL_PARS = /* glsl */`
varying vec3 vObjP;
varying vec3 vObjN;
uniform vec4 uPanel;     // x scale, y groove darkening, z seam glow, w cell variation
uniform vec4 uGrime;     // x scale, y albedo amount, z roughness amount, w y-stretch (0.05 = brushed streaks)
uniform float uBump;
uniform vec3 uSeamColor;
uniform float uSeamThr;
uniform float uTime;
uniform float uLife;
uniform vec3 uFlash;
uniform float uRim;
uniform vec3 uRimColor;
float vpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vpHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vpNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(vpHash3(i), vpHash3(i + vec3(1, 0, 0)), f.x), mix(vpHash3(i + vec3(0, 1, 0)), vpHash3(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(vpHash3(i + vec3(0, 0, 1)), vpHash3(i + vec3(1, 0, 1)), f.x), mix(vpHash3(i + vec3(0, 1, 1)), vpHash3(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
// x groove (0..1), y cell random, z seam, w rivet
vec4 vpPan2(vec2 q) {
  vec2 g = q * uPanel.x;
  g.x += floor(g.y) * 0.5;
  vec2 id = floor(g), f = fract(g), d = min(f, 1.0 - f), fw = fwidth(g);
  // screen-size fades (kills speckle on small / distant parts): grooves need a cell >= ~25 px, rivets >= ~50 px,
  // per-panel tone needs >= ~5 px; seams stay a little longer (they are the glow read)
  float m = max(fw.x, fw.y);
  float fade = 1.0 - smoothstep(0.025, 0.07, m);
  float fadeR = 1.0 - smoothstep(0.012, 0.03, m);
  float fadeS = 1.0 - smoothstep(0.05, 0.14, m);
  float fadeV = 1.0 - smoothstep(0.12, 0.35, m);
  vec2 l = 1.0 - smoothstep(vec2(0.0), vec2(0.028) + fw, d);
  float r = vpHash(id);
  float s = step(uSeamThr, r) * (1.0 - smoothstep(0.0, 0.03 + fw.y, d.y)) * (1.0 - l.x * 0.5);
  vec2 c = abs(f - 0.5);
  float rv = (1.0 - smoothstep(0.03, 0.03 + fw.x * 2.0, length(c - vec2(0.39)))) * step(0.45, r);
  return vec4(max(l.x, l.y) * fade, mix(0.5, r, fadeV), s * fadeS, rv * fadeR);
}
vec4 vpPanel() {
  vec3 p = vec3(abs(vObjP.x), vObjP.y, vObjP.z);
  vec3 w = pow(abs(normalize(vObjN)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return vpPan2(p.zy) * w.x + vpPan2(p.xz + 7.3) * w.y + vpPan2(p.xy) * w.z;
}
float vpGrime() {
  vec3 p = vec3(abs(vObjP.x), vObjP.y * uGrime.w, vObjP.z) * uGrime.x;
  float fw = length(fwidth(p));
  float hi = 1.0 - smoothstep(0.25, 0.8, fw);   // drop the fine octave when it would alias
  float lo = 1.0 - smoothstep(0.8, 2.5, fw);
  return 0.5 + (vpNoise(p) - 0.5) * 0.65 * lo + (vpNoise(p * 2.7 + 3.1) - 0.5) * 0.35 * hi;
}
#ifdef VP_DETAIL
uniform sampler2D uDetail;
uniform vec4 uDetailK;   // x scale (repeats per metre), y albedo amount, z roughness amount, w scratch-brighten amount
// triplanar object-space sample: rgb 0.5 = neutral albedo (x2 multiplier), a 0.5 = neutral roughness
vec4 vpDetail() {
  vec3 p = vec3(abs(vObjP.x), vObjP.y, vObjP.z) * uDetailK.x;
  vec3 w = pow(abs(normalize(vObjN)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return texture2D(uDetail, p.zy) * w.x + texture2D(uDetail, p.xz) * w.y + texture2D(uDetail, p.xy) * w.z;
}
#endif
vec3 vpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - grad);
}`;

function inject(m, { panel = true, grime = panel } = {}) {
  const u = m.userData.u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PANEL_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 vpP = ${panel ? 'vpPanel()' : 'vec4(0.0, 0.5, 0.0, 0.0)'};
  float vpG = ${grime ? 'vpGrime()' : '0.5'};
  float vpH = -vpP.x + vpP.w * 0.8;
  diffuseColor.rgb *= (1.0 - vpP.x * uPanel.y) * (1.0 + (vpP.y - 0.5) * uPanel.w) * (1.0 - (vpG - 0.5) * uGrime.y * 2.0);
  #ifdef VP_DETAIL
  vec4 vpD = vpDetail();
  diffuseColor.rgb *= mix(vec3(1.0), vpD.rgb * 2.0, uDetailK.y);
  diffuseColor.rgb += max(vpD.rgb - 0.62, 0.0) * uDetailK.w;
  #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + vpP.x * uPanel.y * 0.3 + (vpP.y - 0.5) * uPanel.w * 0.5 + (vpG - 0.5) * uGrime.z * 2.0, 0.04, 1.0);
  #ifdef VP_DETAIL
  roughnessFactor = clamp(roughnessFactor + (vpD.a - 0.5) * uDetailK.z, 0.04, 1.0);
  #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  ${panel ? 'normal = vpPerturb(-vViewPosition, normal, vec2(dFdx(vpH), dFdy(vpH)) * uBump, faceDirection);' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance *= uLife;
  // seams pulse with travelling energy at high ranks (uPanel.z > 1.2)
  float vpPulse = mix(1.0, 0.6 + 0.55 * sin(uTime * 2.4 - vObjP.y * 7.0), smoothstep(1.2, 1.6, uPanel.z));
  totalEmissiveRadiance += uSeamColor * vpP.z * uPanel.z * uLife * vpPulse;
  {
    float rimV = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += (diffuseColor.rgb * 0.4 * pow(rimV, 3.0) + uRimColor * pow(rimV, 2.2)) * uRim;
  }
  totalEmissiveRadiance += uFlash;`);
  };
  m.customProgramCacheKey = () => 'vpMech3' + (panel ? 'P' : 'N') + (grime ? 'G' : '') + (m.defines?.VP_DETAIL !== undefined ? 'D' : '');
  return m;
}

function uniforms(o) {
  return {
    uPanel: { value: new THREE.Vector4(o.scale ?? 5.5, o.groove ?? 0.5, o.seam ?? 0, o.vary ?? 0.12) },
    uGrime: { value: new THREE.Vector4(o.grimeScale ?? 9, o.grime ?? 0.08, o.grimeRough ?? 0.1, o.stretch ?? 1) },
    uBump: { value: o.bump ?? 0.55 }, uRimColor: { value: new THREE.Color(o.rimColor ?? 0x0c0e12) },
    uSeamColor: { value: new THREE.Color(o.seamColor ?? 0x000000) }, uSeamThr: { value: o.seamThr ?? 0.86 }, uTime: { value: 0 },
    uLife: { value: 1 }, uFlash: { value: new THREE.Color(0) }, uRim: { value: o.rim ?? 0.25 },
  };
}

// o: {color, metal, rough, coat, emissive, ei, panel:{...}}  — fresh material each call (per-instance uniforms).
export function mechMat(o, quality = 'high') {
  const phys = quality === 'high' && o.coat;
  const M = phys ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({ color: o.color, metalness: o.metal ?? 0.3, roughness: o.rough ?? 0.4, envMapIntensity: o.env ?? 1 });
  if (phys) { m.clearcoat = o.coat; m.clearcoatRoughness = o.coatRough ?? 0.08; }
  if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  m.userData.u = uniforms(o.panel || {});
  // per-slot detail texture hook: o.detail = { map: Texture | 'scuff' | 'grime' | 'scratch', scale, albedo, rough, scratch }
  if (o.detail) {
    const d = o.detail, tex = d.map?.isTexture ? d.map : detailTexture(d.map || 'scuff');
    if (tex) {
      m.defines = { ...(m.defines || {}), VP_DETAIL: '' };
      m.userData.u.uDetail = { value: tex };
      m.userData.u.uDetailK = { value: new THREE.Vector4(d.scale ?? 2, d.albedo ?? 0.6, d.rough ?? 0.5, d.scratch ?? 0.4) };
    }
  }
  return inject(m, { panel: o.panel !== false && o.panel?.groove !== 0, grime: o.panel !== false });
}

// ---- generated detail textures (cached, tileable-ish): rgb 0.5 neutral albedo, a 0.5 neutral roughness.
const texCache = new Map();
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const DETAIL = {
  // chips + scratches (bright bare metal, smoother) and dents (dark, rougher)
  scuff(g, w, h, r) {
    g.fillStyle = 'rgba(128,128,128,1)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, L = 8 + r() * 60, a = r() * 6.28;
      g.strokeStyle = r() < 0.7 ? `rgba(225,225,225,${0.5 + r() * 0.5})` : `rgba(40,40,40,${0.4 + r() * 0.4})`;
      g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, R = 2 + r() * 7;
      g.fillStyle = r() < 0.5 ? 'rgba(230,230,230,0.8)' : 'rgba(30,30,30,0.6)';
      g.beginPath(); for (let k = 0; k < 7; k++) { const aa = k / 7 * 6.28; g.lineTo(x + Math.cos(aa) * R * (0.6 + r() * 0.6), y + Math.sin(aa) * R * (0.6 + r() * 0.6)); } g.fill();
    }
  },
  // stains, streaks running down, soot
  grime(g, w, h, r) {
    g.fillStyle = 'rgba(128,128,128,1)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const x = r() * w, y = r() * h, R = 20 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(50,46,40,${0.3 + r() * 0.35})`); gr.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    for (let i = 0; i < 50; i++) {
      const x = r() * w, y = r() * h, L = 30 + r() * 120;
      const gr = g.createLinearGradient(x, y, x, y + L);
      gr.addColorStop(0, `rgba(60,55,50,${0.25 + r() * 0.3})`); gr.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 4, L);
    }
  },
  // fur strands + soft clumps (lifted from sculptor-17's wolf.js): map: 'fur'
  fur(g, w, h, r) {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, R = 20 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, R);
      const v = r() < 0.5 ? 90 : 170;
      gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 3200; i++) {
      const x = r() * w, y = r() * h, L = 6 + r() * 16, a = Math.PI / 2 + (r() - 0.5) * 0.9, light = r() < 0.45;
      const v = light ? 175 + r() * 60 : 40 + r() * 50;
      g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.25 + r() * 0.35})`;
      g.lineWidth = 0.7 + r() * 1.3;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.stroke();
    }
  },
  // fine directional scratches only (brushed / worn metal)
  scratch(g, w, h, r) {
    g.fillStyle = 'rgba(128,128,128,1)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const x = r() * w, y = r() * h, L = 5 + r() * 40;
      g.strokeStyle = `rgba(${r() < 0.6 ? 200 : 70},${r() < 0.6 ? 200 : 70},${r() < 0.6 ? 200 : 70},${0.15 + r() * 0.3})`;
      g.lineWidth = 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + L, y + (r() - 0.5) * 4); g.stroke();
    }
  },
};
// detailTexture('scuff'|'grime'|'scratch' | (ctx2d, w, h, rand) => void, size = 512) -> CanvasTexture (alpha channel = roughness)
export function detailTexture(name, size = 512) {
  if (typeof document === 'undefined') return null;
  const key = typeof name === 'function' ? name : name + size;
  if (texCache.has(key)) return texCache.get(key);
  const draw = typeof name === 'function' ? name : DETAIL[name];
  if (!draw) return null;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, size, rng(name.length * 977 + size));
  // roughness channel: bright chips are smoother (low a), dark stains rougher (high a)
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = Math.max(0, Math.min(255, 255 - d[i]));
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = false;
  texCache.set(key, t);
  return t;
}

export function glowMat(color, ei = 3) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: ei, roughness: 0.35, metalness: 0 });
  m.userData.u = uniforms({ groove: 0, rim: 0 });
  return inject(m, { panel: false });
}

// Visor / lens: dark glossy glass with a bright emissive core.
export function eyeMat(color, ei = 4) {
  const m = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: color, emissiveIntensity: ei, roughness: 0.08, metalness: 0.4 });
  m.userData.u = uniforms({ groove: 0, rim: 0 });
  return inject(m, { panel: false });
}

// Full material set for one unit. Slots: paint, accent, metal, trim, glow, eye.
// over = palette colour overrides { paint, accent, trim, glow, eye }; slots = per-slot material option overrides
// (mechMat options: { color, metal, rough, coat, emissive, ei, env, panel: { scale, groove, seam, vary } }).
// Per-model rim override (def.rim): { color: hex | false (no tint, keep the neutral rim), tint: 0..1 (scale the tint),
// strength: k (scale the whole rim) }. For warm/dark units the rarity tint can wash them violet/gold; dial it here.
function applyRim(R, o) {
  if (!o) return R;
  const out = { ...R, rimColor: R.rimColor.clone() };
  const mag = Math.max(R.rimColor.r, R.rimColor.g, R.rimColor.b);
  if (o.color === false) out.rimColor.setRGB(0, 0, 0);
  else if (o.color !== undefined) out.rimColor.set(o.color).multiplyScalar(mag / Math.max(1e-3, Math.max(...new THREE.Color(o.color).toArray())));
  if (o.tint !== undefined) out.rimColor.multiplyScalar(o.tint);
  if (o.strength !== undefined) out.rim = R.rim * o.strength;
  return out;
}

export function makeMaterials(opts) {
  return opts.realm === 'fantasy' ? makeOrganicMaterials(opts) : makeMechMaterials(opts);
}

// Organic set (D21): no panel grooves / rivets / seams; value-noise breakup reads as fabric, fur, bark, hide. Rank ladder =
// finish + emissive (magic) + trim; the kit's motes / aura ring still apply.
function makeOrganicMaterials({ faction = 'order', scheme = 'dark', rarity = 'common', rank = 1, quality = 'high', over = {}, slots = {}, rimOpt = null }) {
  const F = FACTIONS[faction] || FACTIONS.order;
  const P = { ...(F[scheme] || F.dark), ...over };
  const glowC = over.glow ?? F.glow, eyeC = over.eye ?? F.eye;
  const ri = rarityIndex(rarity), rk = Math.max(0, Math.min(5, rank | 0));
  const R = applyRim({ rim: [0.14, 0.18, 0.24, 0.3, 0.38, 0.46][rk], rimColor: new THREE.Color(ri >= 3 ? 0xffb43a : glowC).multiplyScalar([0, 0.02, 0.05, 0.08, 0.12, 0.16][rk]), groove: 0 }, rimOpt);
  const O = {
    paint: { color: P.paint, metal: 0.15, rough: 0.62, panel: { ...R, grime: 0.12, grimeScale: 14, grimeRough: 0.12, stretch: 0.35 } },
    accent: { color: P.accent, metal: 0.0, rough: 0.82, panel: { ...R, grime: 0.1, grimeScale: 22, grimeRough: 0.08, stretch: 1 } },
    metal: { color: 0x9aa0a8, metal: 0.85, rough: 0.34, panel: { ...R, grime: 0.08, grimeScale: 30, grimeRough: 0.18, stretch: 0.08 } },
    trim: { color: ri >= 3 ? 0xf0b040 : P.trim, metal: 0.85, rough: 0.3, panel: { ...R } },
    skin: { color: over.skin ?? 0xe2bea2, metal: 0, rough: 0.55, panel: { ...R, grime: 0.04, grimeScale: 30, grimeRough: 0.05 } },
  };
  for (const k of Object.keys(slots)) if (O[k]) O[k] = { ...O[k], ...slots[k], panel: { ...O[k].panel, ...(slots[k].panel || {}) } };
  const mats = {
    paint: mechMat(O.paint, quality), accent: mechMat(O.accent, quality), metal: mechMat(O.metal, quality), trim: mechMat(O.trim, quality),
    skin: mechMat(O.skin, quality),
    glow: glowMat(slots.glow?.color ?? glowC, slots.glow?.ei ?? [1.4, 2.0, 2.8, 3.4, 4.2, 5.0][rk]),
    glow2: glowMat(slots.glow2?.color ?? over.glow2 ?? eyeC, slots.glow2?.ei ?? [1.4, 2.0, 2.8, 3.4, 4.2, 5.0][rk]),
    eye: eyeMat(slots.eye?.color ?? eyeC, slots.eye?.ei ?? [2.5, 3, 3.5, 4, 4.5, 5][rk]),
  };
  for (const k in mats) mats[k].name = 'vp:' + k;
  return { mats, palette: { ...P, glow: glowC, eye: eyeC, plate: F.plate } };
}

function makeMechMaterials({ faction = 'corporate', scheme = 'dark', rarity = 'common', rank = 1, quality = 'high', over = {}, slots = {}, rimOpt = null }) {
  const F = FACTIONS[faction] || FACTIONS.corporate;
  const P = { ...(F[scheme] || F.dark), ...over };
  const glowC = over.glow ?? F.glow, eyeC = over.eye ?? F.eye;
  const ri = rarityIndex(rarity);
  const rk = Math.max(0, Math.min(5, rank | 0));
  // emissive ladder follows the visual rank (seams appear at R1 and brighten every rank)
  const seam = [0, 0.45, 1.0, 1.5, 2.0, 2.5][rk];
  const seamThr = [0.95, 0.9, 0.84, 0.78, 0.72, 0.66][rk];   // more of the panel seams light up every rank
  const goldPaint = faction === 'legendary';   // legendaries are always gold primary (ROSTER visual rules)
  const coat = [0.5, 0.8, 1, 1][ri];
  // gold under a blue arena env turns olive: keep some diffuse (metal < 1) and a faint warm self-light
  const GOLD = { color: 0xf5b440, metal: 0.78, rough: 0.24, coat: 0.7, coatRough: 0.05, env: 1.1, emissive: 0x3a2000, ei: 1 };
  // rarity ladder in the shading: rim light gets stronger and takes the glow (legendary: gold) colour
  // tier cue that reads at ~120 px: the rim light takes the RARITY colour (common steel, rare blue, epic violet, legendary gold)
  // with a strength floor per rarity; rank adds on top
  const rim = Math.max([0.18, 0.22, 0.28, 0.36, 0.44, 0.52][rk], [0.16, 0.42, 0.55, 0.62][ri]);
  const rimC = new THREE.Color(RARITY_COLORS[ri]).multiplyScalar(Math.max([0, 0.03, 0.06, 0.1, 0.14, 0.18][rk], [0, 0.45, 0.65, 0.75][ri]));
  const R = applyRim({ rim, rimColor: rimC, seamThr }, rimOpt);
  const O = {
    paint: goldPaint ? { ...GOLD, panel: { scale: 3.6, groove: 0.45, seam, seamColor: glowC, vary: 0.08, grime: 0.05, ...R } }
      : { color: P.paint, metal: 0.3, rough: [0.4, 0.34, 0.3, 0.26][ri], coat, panel: { scale: 3.6, groove: 0.5, seam, seamColor: glowC, vary: 0.12, grime: 0.07, ...R } },
    accent: faction === 'legendary' ? { color: 0x17151a, metal: 0.5, rough: 0.3, coat: 1, panel: { scale: 7, groove: 0.35, vary: 0.08, ...R } }
      : { color: P.accent, metal: 0.35, rough: 0.34, env: 0.75, coat: coat * 0.8, panel: { scale: 4.5, groove: 0.45, seam: seam * 0.5, seamColor: glowC, vary: 0.1, grime: 0.08, ...R } },
    // brushed gunmetal: streaky roughness (stretched noise), dense small panels
    metal: { color: 0x5c636e, metal: 0.75, rough: 0.4, env: 0.8, panel: { scale: 9, groove: 0.35, vary: 0.2, grime: 0.12, grimeScale: 38, grimeRough: 0.22, stretch: 0.06, ...R } },
    trim: ri >= 3 || faction === 'legendary' ? { ...GOLD, panel: { groove: 0, ...R } } : { color: P.trim, metal: 0.6, rough: 0.28, coat: 0.6, panel: { groove: 0, ...R } },
  };
  // finish ladder: R0 matte primer (desaturated, rough, no clearcoat) -> R1 satin -> R2+ gloss -> R4+ showroom
  const finish = [{ sat: 0.78, val: 0.88, rough: 0.18, coat: 0 }, { sat: 0.88, val: 0.96, rough: 0.07, coat: 0.55 }, { sat: 1, val: 1, rough: 0, coat: 1 },
    { sat: 1.04, val: 1.02, rough: -0.03, coat: 1 }, { sat: 1.08, val: 1.04, rough: -0.05, coat: 1 }, { sat: 1.1, val: 1.05, rough: -0.06, coat: 1 }][rk];
  for (const k of ['paint', 'accent']) {
    const o = O[k];
    if (o === O.paint && goldPaint) continue;
    const c = new THREE.Color(o.color), hsl = {};
    c.getHSL(hsl); c.setHSL(hsl.h, Math.min(1, hsl.s * finish.sat), Math.min(1, hsl.l * finish.val));
    o.color = c.getHex(); o.rough = Math.max(0.08, (o.rough ?? 0.4) + finish.rough); o.coat = (o.coat ?? 0.5) * finish.coat;
  }
  // R0 battered: scuffed detail texture on the armour unless the model brings its own
  if (rk === 0) for (const k of ['paint', 'accent']) O[k].detail = O[k].detail || { map: 'scuff', scale: 2.2, albedo: 0.55, rough: 0.6, scratch: 0.35 };
  for (const k of Object.keys(slots)) if (O[k]) O[k] = { ...O[k], ...slots[k], panel: { ...O[k].panel, ...(slots[k].panel || {}) } };
  // rank 0 = battered (heavy grime, rougher), high ranks = factory clean
  const gk = [2.6, 1, 0.8, 0.6, 0.45, 0.35][Math.max(0, Math.min(5, rank))];
  for (const k of ['paint', 'accent', 'metal']) { const p = O[k].panel; if (p) { p.grime = (p.grime ?? 0.08) * gk; p.grimeRough = (p.grimeRough ?? 0.1) * gk; } }
  const mats = {
    paint: mechMat(O.paint, quality), accent: mechMat(O.accent, quality), metal: mechMat(O.metal, quality), trim: mechMat(O.trim, quality),
    glow: glowMat(slots.glow?.color ?? glowC, slots.glow?.ei ?? [1.5, 2.3, 3.1, 3.8, 4.6, 5.4][rk] * [0.85, 1, 1.15, 1.3][ri]),
    // second emissive colour (strobes, orbs, warning lights): def.glow2 / paint.<faction>.glow2 / mats.<f>.glow2 { color, ei }
    glow2: glowMat(slots.glow2?.color ?? over.glow2 ?? eyeC, slots.glow2?.ei ?? [1.5, 2.3, 3.1, 3.8, 4.6, 5.4][rk]),
    eye: eyeMat(slots.eye?.color ?? eyeC, slots.eye?.ei ?? [3.6, 4, 4.5, 5, 5.6, 6.2][rk]),
  };
  for (const k in mats) mats[k].name = 'vp:' + k;
  return { mats, palette: { ...P, glow: glowC, eye: eyeC, plate: F.plate } };
}

// Energy-shield bubble, same look as the battle's pooled bubble (js/fx/vfx.js): rim-only fresnel, hex lines only toward
// the rim, a slow scan wave, hit ripple, faded where it meets the plate. uStrength 0..1, uHit flashes.
export function shieldMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 1 }, uTime: { value: 0 }, uHit: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main() {
        vL = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime, uHit;
      varying vec3 vN; varying vec3 vV; varying vec3 vL;
      float hexEdge(vec2 p) {
        vec2 r = vec2(1.0, 1.732), h = r * 0.5;
        vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
        vec2 g = abs(dot(a, a) < dot(b, b) ? a : b);
        return max(dot(g, vec2(0.5, 0.866)), g.x);
      }
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), vV));
        float rim = pow(f, 4.0) * 0.45 + pow(f, 14.0) * 0.6;
        vec2 q = vec2(atan(vL.z, vL.x) * (14.0 / 6.2832), asin(clamp(vL.y, -1.0, 1.0)) * (7.0 / 3.1416));
        float line = smoothstep(0.43, 0.5, hexEdge(q));
        float wave = smoothstep(0.25, 0.0, abs(fract(vL.y * 0.5 + 0.5 - uTime * 0.35) - 0.5)) * 0.25;
        float ripple = uHit * smoothstep(0.35, 0.0, abs((1.0 - vL.y) * 0.5 - (1.0 - uHit) * 1.2));
        float hex = line * (f * f * f * 0.3 + wave * f * 0.2 + ripple * 0.9 + uHit * 0.15);
        float foot = smoothstep(-0.75, -0.2, vL.y);
        float a = (rim * (1.0 + uHit * 2.0) + hex + uHit * 0.04) * foot * uStrength;
        gl_FragColor = vec4(uColor * a * 2.2, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}

// Rarity motes: GPU-animated rising sparks around the unit (epic: sparse, legendary: denser + gold). One draw call.
export function createMotes(color, { count = 24, radius = 0.6, height = 2, size = 0.11, speed = 0.35 } = {}) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), height);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uR: { value: radius }, uH: { value: height }, uSize: { value: size }, uSpeed: { value: speed }, uLife: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec4 seed; uniform float uTime, uR, uH, uSize, uSpeed; varying float vA;
      void main() {
        float ph = fract(seed.x + uTime * uSpeed * (0.6 + seed.y));
        float a = seed.z * 6.2832 + uTime * (0.4 + seed.w);
        float r = uR * (0.55 + 0.45 * seed.w);
        vec3 p = vec3(cos(a) * r, ph * uH, sin(a) * r);
        vA = sin(ph * 3.14159);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.6 + seed.y) * 300.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uLife; varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float k = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uColor * 3.0 * k * vA * uLife, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = true;
  pts.renderOrder = 6;
  return pts;
}

// Rank aura (R4+): additive ground ring under the unit with rotating hex ticks; R5 doubles it. One draw call.
export function createAura(color, { radius = 0.9, rank = 4 } = {}) {
  const g = new THREE.PlaneGeometry(radius * 2.6, radius * 2.6);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uLife: { value: 1 }, uK: { value: rank >= 5 ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uLife, uK; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float r = length(vUv) * 1.3, a = atan(vUv.y, vUv.x);
        float ring = smoothstep(0.035, 0.0, abs(r - 0.78)) * 1.2 + smoothstep(0.22, 0.0, abs(r - 0.78)) * 0.25;
        float ticks = step(0.5, fract(a / 6.2832 * 12.0 + uTime * 0.15)) * smoothstep(0.03, 0.0, abs(r - 0.9));
        float ring2 = uK * (smoothstep(0.025, 0.0, abs(r - 1.0)) + smoothstep(0.6, 0.0, r) * 0.12);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.2);
        float k = (ring * pulse + ticks * 0.8 + ring2 * (0.7 + 0.3 * sin(uTime * 1.3 + 1.0))) * uLife;
        gl_FragColor = vec4(uColor * k * 1.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0.02; mesh.renderOrder = 4;
  return mesh;
}

// Hover beam (def.hoverBeam): a soft additive light cone from the plate up to a high-hovering unit + a dark contact blob on the
// plate, so the plate never looks empty under it. 2 draw calls. { height, radius, color }
export function createHoverBeam(color, { height = 1, radius = 0.45 } = {}) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius, height, 24, 1, true), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uLife: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uLife, uTime; varying vec2 vUv;
      void main() { float k = (1.0 - vUv.y) * 0.55 + 0.12 * sin(vUv.y * 30.0 - uTime * 6.0) * (1.0 - vUv.y);
        float edge = 1.0 - abs(vUv.x - 0.5) * 0.0; gl_FragColor = vec4(uColor * k * edge * uLife * 0.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  cone.position.y = height / 2;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015;
  g.add(blob, cone);
  g.userData.cone = cone;
  return g;
}
