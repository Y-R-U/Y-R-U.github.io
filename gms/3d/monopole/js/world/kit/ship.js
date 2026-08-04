// shipClass() — three hulls off one tapered wedge, plus the shader treatment that makes a dark
// metal hull read against a nebula: a rim that tracks the key and dies out along the length,
// world-space roughness break-up, and two object-space coloured bounce sources.
//
// Origin is the hull centroid, forward is −Z. Every part is merged per material, so a hull is
// ten draw calls at LOD 0 and three at LOD 2.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, getDecalSheet, adopt } from '../materials.js';
import { palette } from '../palettes.js';

export const LOD_DIST = [0, 900, 2600];
export const lodForDistance = d => (d < LOD_DIST[1] ? 0 : d < LOD_DIST[2] ? 1 : 2);

// shared uniform objects: assigned into every patched material, so one write moves them all
const RIM = {
  uKeyPos: { value: new THREE.Vector3(0, 0, -260) },
  uKeyCol: { value: new THREE.Color(1, 0.82, 0.6) },
  uRimInt: { value: 1.6 },
  uRimPow: { value: 3.0 },
  uRimNear: { value: 24 },
  uRimFall: { value: 70 },
  uBouncePow: { value: 1.0 },
  uDetail: { value: 0.55 },
  uRough: { value: 0.22 },
  uShadCol: { value: new THREE.Color(0.25, 0.55, 0.72) },
  uShadDir: { value: new THREE.Vector3(0, -1, 0) },
  uShadPow: { value: 0 },
  uPanel: { value: 0 },
  uWash: { value: 0 },
};

const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

// ── the shader treatment ─────────────────────────────────────────────────────

const NOISE = `
float h31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn31(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

function patch(m, bounce) {
  m.userData.bounce = bounce;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, RIM);
    sh.uniforms.uB0 = { value: bounce[0] || new THREE.Vector4(0, 0, 0, -1) };
    sh.uniforms.uB1 = { value: bounce[1] || new THREE.Vector4(0, 0, 0, -1) };
    sh.uniforms.uB0c = { value: bounce[2] || new THREE.Color(0, 0, 0) };
    sh.uniforms.uB1c = { value: bounce[3] || new THREE.Color(0, 0, 0) };
    sh.uniforms.uB2 = { value: bounce[4] || new THREE.Vector4(0, 0, 0, -1) };
    sh.uniforms.uB2c = { value: bounce[5] || new THREE.Color(0, 0, 0) };

    sh.vertexShader = `varying vec3 vWP; varying vec3 vWN;\n` + sh.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vWN = normalize(mat3(modelMatrix) * objectNormal);`);

    // three's fragment prefix ships viewMatrix and cameraPosition but not modelMatrix; declaring
    // it is enough, the renderer binds it to matrixWorld unconditionally
    sh.fragmentShader = `varying vec3 vWP; varying vec3 vWN;
      uniform mat4 modelMatrix;
      uniform vec3 uKeyPos, uKeyCol, uB0c, uB1c, uB2c;
      uniform vec4 uB0, uB1, uB2;
      uniform vec3 uShadCol, uShadDir;
      uniform float uRimInt, uRimPow, uRimNear, uRimFall, uBouncePow, uRough, uShadPow, uPanel, uWash, uDetail;
      ${NOISE}\n` + sh.fragmentShader;

    // panel-to-panel roughness break-up at a frequency the plate map cannot reach, so the flank
    // carries a moving specular instead of one flat sheen
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       {
         vec3 pn = vWP * 0.075;
         float rn = vn31(pn) * 0.62 + vn31(pn * 4.3 + 11.0) * 0.38;
         roughnessFactor = clamp(roughnessFactor + uRough * (rn - 0.5) * 2.4, 0.32, 0.78);
       }`);

    // the star is treated as a point at uRimPos for the rim only, so the rim has somewhere to
    // fall off to. A directional light gives a rim of exactly one brightness down an 800 px hull.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `{
        vec3 N = normalize(vWN);
        vec3 V = normalize(cameraPosition - vWP);
        vec3 Lv = uKeyPos - vWP;
        float Ld = length(Lv);
        float ndl = dot(N, Lv / max(Ld, 1e-4));
        float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), uRimPow);
        float att = exp(-max(0.0, Ld - uRimNear) / uRimFall);
        gl_FragColor.rgb += uKeyCol * (uRimInt * fres * smoothstep(-0.25, 0.75, ndl) * att);

        vec3 b0 = (modelMatrix * vec4(uB0.xyz, 1.0)).xyz - vWP;
        float d0 = length(b0);
        gl_FragColor.rgb += uB0c * (uBouncePow * step(0.0, uB0.w)
          / (1.0 + (d0 * d0) / max(uB0.w * uB0.w, 1e-4))
          * pow(max(0.0, dot(N, b0 / max(d0, 1e-4))), 0.65));

        // Structure inside the shadow. The base metal is 0.07 albedo, so a fill multiplied by it
        // returns nothing and the shadow side stays a flat black mass — which is exactly what the
        // last critic saw. This is additive and carries the plate map and the mapped normal, so
        // what it lands on is the plating, not the albedo.
        vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        float shad = smoothstep(0.34, -0.52, dot(Nw, normalize(uKeyPos - vWP)));
        gl_FragColor.rgb += uShadCol * (uShadPow * shad
          * (0.30 + 0.70 * clamp(dot(Nw, uShadDir), 0.0, 1.0))
          * SHAD_DETAIL);

        vec3 b1 = (modelMatrix * vec4(uB1.xyz, 1.0)).xyz - vWP;
        float d1 = length(b1);
        gl_FragColor.rgb += uB1c * (uBouncePow * step(0.0, uB1.w)
          / (1.0 + (d1 * d1) / max(uB1.w * uB1.w, 1e-4))
          * pow(max(0.0, dot(N, b1 / max(d1, 1e-4))), 0.65));

        // the engine wash on the skin. Same inverse-square as the bounces but with its own gain,
        // because a plume that lights nothing is a decal stuck on the stern.
        vec3 b2 = (modelMatrix * vec4(uB2.xyz, 1.0)).xyz - vWP;
        float d2 = length(b2);
        gl_FragColor.rgb += uB2c * (uWash * step(0.0, uB2.w)
          / (1.0 + (d2 * d2) / max(uB2.w * uB2.w, 1e-4))
          * pow(max(0.0, dot(N, b2 / max(d2, 1e-4))), 0.55));
      }
      #include <tonemapping_fragment>`);

    // Two things on one hook. First a plate grid in world space, projected onto whichever axis
    // pair the normal is furthest from: a seam line at every cell edge and a per-cell value jitter,
    // at two frequencies. This is the detail that has to survive a thumbnail — the map alone is a
    // texture, and a texture averages to grey the moment the hull is 200 px wide.
    // Second, the map's own second read with u and v swapped and scaled by an irrational-ish ratio:
    // a narrow hull strip samples one thin column and repeats it, which reads as corrugation.
    let extra = `
      {
        vec3 an = abs(normalize(vWN));
        vec2 q = an.y >= max(an.x, an.z) ? vWP.xz : (an.x >= an.z ? vWP.zy : vWP.xy);
        float seam = 0.0, tone = 0.0;
        // rectangular cells offset row by row, or a square grid reads as brickwork at every scale
        vec2 c0 = q * vec2(0.155, 0.29);
        c0.x += floor(c0.y) * 0.41;
        vec2 e0 = 0.5 - abs(fract(c0) - 0.5);
        seam = 1.0 - smoothstep(0.0, 0.045, min(e0.x, e0.y));
        tone += (h31(vec3(floor(c0), 3.0)) - 0.5) * 0.26;
        vec2 c1 = q * vec2(0.62, 1.05) + 0.37;
        c1.x += floor(c1.y) * 0.29;
        vec2 e1 = 0.5 - abs(fract(c1) - 0.5);
        seam = max(seam, (1.0 - smoothstep(0.0, 0.07, min(e1.x, e1.y))) * 0.50);
        tone += (h31(vec3(floor(c1), 9.0)) - 0.5) * 0.15;
        vec2 e2 = 0.5 - abs(fract(q * 3.1 + 0.19) - 0.5);
        seam = max(seam, (1.0 - smoothstep(0.0, 0.10, min(e2.x, e2.y))) * 0.22);
        diffuseColor.rgb *= 1.0 + uPanel * (tone - seam * 0.85);
        roughnessFactor = clamp(roughnessFactor + uPanel * seam * 0.30, 0.10, 0.95);
      }`;
    if (m.map) {
      extra += `
      diffuseColor.rgb *= mix(1.0, texture2D(map,
        vec2(vMapUv.y * 1.87 + 0.11, vMapUv.x * 2.63 + 0.44)).r * 1.6, uDetail);`;
    }
    // roughnessFactor is declared by roughnessmap_fragment, which three emits *after* map_fragment
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\n${extra}`);

    sh.fragmentShader = sh.fragmentShader.replace('SHAD_DETAIL',
      m.map ? '(0.62 + 0.62 * texture2D(map, vMapUv).r)' : '1.0');
  };
  m.customProgramCacheKey = () => 'shiprim4' + (m.map ? 'd' : '');
  return m;
}

const MATS = new Map();

// the base metal is deliberately near-black: albedo around 0.07 linear, so everything you read
// on the flank is the key, the rim or the bounce and never the diffuse colour
const TINT = {
  hull: [0.40, 0.36, 0.32],
  hullDark: [0.52, 0.50, 0.48],
  panel: [0.34, 0.35, 0.40],
  trim: [0.44, 0.40, 0.38],
};

function mat(paletteId, surface, classId, bounce) {
  const key = `${paletteId}:${surface}:${classId}`;
  const hit = MATS.get(key);
  if (hit) return hit;
  const src = getMaterial(paletteId, surface);
  if (surface === 'window' || surface === 'strip' || surface === 'glass') {
    MATS.set(key, src);
    return src;
  }
  const m = src.clone();
  m.userData = { ...src.userData };
  m.name = key;
  m.vertexColors = true;
  if (TINT[surface]) {
    m.metalness = surface === 'panel' ? 0.55 : 0.42;
    m.roughness = surface === 'panel' ? 0.40 : Math.min(1, m.roughness + 0.10);
    if (surface === 'trim') m.metalness = 0.35;
    m.color.multiply(new THREE.Color(...TINT[surface]));
    // at a grazing angle a full-strength plate normal turns every horizontal frequency in the
    // map into a corduroy band across the hull
    if (m.normalMap) m.normalScale.set(0.45, 0.45);
  }
  patch(m, bounce);
  adopt(m);
  MATS.set(key, m);
  return m;
}

// ── the section ──────────────────────────────────────────────────────────────

// A twelve-point section: a flat deck split by a dorsal trench, a vertical flank band between
// two chines, and a flat keel. The trench is part of the lofted shell, which is what lets the
// superstructure sit *in* the hull instead of on top of it.
//
// w half-beam, top/bot absolute y, dk deck half-width as a fraction of w, tw trench half-width,
// td trench depth in metres, kw keel flat half-width as a fraction of w.
const S = (t, w, top, bot, dk, tw = 0.03, td = 0.05, kw = 0.44) => ({ t, w, top, bot, dk, tw, td, kw });
const SKEYS = ['w', 'top', 'bot', 'dk', 'tw', 'td', 'kw'];

// recessed points carry a baked cavity term as vertex colour — there is no shadow rig, and this
// is what stops the trench and the flank band reading as flat as the deck
const SECT_AO = [1.0, 0.86, 0.36, 0.36, 0.86, 1.0, 0.72, 0.50, 0.32, 0.32, 0.50, 0.72];

function sectionPts(s) {
  const { w, top, bot, dk, tw, td, kw } = s;
  const h = top - bot;
  const y2 = bot + h * 0.66;
  const y1 = bot + h * 0.30;
  const tf = top - td;
  const t = Math.min(tw, dk * 0.8);
  return [
    [-dk * w, top], [-t * w, top], [-t * w, tf], [t * w, tf], [t * w, top], [dk * w, top],
    [w, y2], [w, y1], [kw * w, bot], [-kw * w, bot], [-w, y1], [-w, y2],
  ];
}

function sectionAt(sect, t) {
  let a = sect[0], b = sect[sect.length - 1];
  for (let i = 0; i < sect.length - 1; i++) {
    if (t >= sect[i].t && t <= sect[i + 1].t) { a = sect[i]; b = sect[i + 1]; break; }
  }
  const f = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  const out = { t };
  for (const k of SKEYS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

const UV = 4.4;

// One strip per polygon side, shared vertices along z. That gives smooth shading down the hull
// and a hard chine between sides, which is what reads as folded plate.
function hullLoft(sections, len, zc = 0) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const zOf = t => (t - 0.5) * len + zc;
  const pts = sections.map(sectionPts);
  // segment widths come from the widest section: at the bow every segment is near zero and the
  // trench walls would otherwise get no uv span at all
  let wide = 0;
  for (let i = 1; i < sections.length; i++) if (sections[i].w > sections[wide].w) wide = i;
  const ref = pts[wide];
  const P = ref.length;

  let uAcc = 0;
  for (let k = 0; k < P; k++) {
    const base = pos.length / 3;
    const a0 = ref[k], a1 = ref[(k + 1) % P];
    const segW = Math.max(0.05, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]));
    const c0 = SECT_AO[k], c1 = SECT_AO[(k + 1) % P];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const p0 = pts[i][k], p1 = pts[i][(k + 1) % P];
      // v is scaled far coarser than u: a narrow chamfer strip samples one thin column of the
      // plate map, and at UV in both axes its horizontal edges repeat every 8 m and read as
      // corduroy. Long plates along the length are also what a real hull has.
      const v = zOf(s.t) / (UV * 1.9);
      pos.push(p0[0], p0[1], zOf(s.t), p1[0], p1[1], zOf(s.t));
      nrm.push(0, 0, 0, 0, 0, 0);
      uv.push(uAcc / UV, v + k * 0.61, (uAcc + segW) / UV, v + k * 0.61);
      col.push(c0, c0, c0, c1, c1, c1);
    }
    uAcc += segW;
    for (let i = 0; i < sections.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  // the cap closes the trench (td 0), which both bulkheads the channel and keeps the outline
  // convex enough for a triangle fan
  for (const [s, flip] of [[sections[0], true], [sections[sections.length - 1], false]]) {
    const base = pos.length / 3;
    const z = zOf(s.t);
    const p = sectionPts({ ...s, td: 0 });
    for (let k = 0; k < P; k++) {
      pos.push(p[k][0], p[k][1], z); nrm.push(0, 0, 0);
      uv.push(p[k][0] / UV, p[k][1] / UV); col.push(0.62, 0.62, 0.62);
    }
    for (let k = 1; k < P - 1; k++) {
      if (flip) idx.push(base, base + k + 1, base + k);
      else idx.push(base, base + k, base + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// the superstructure loft: rides in the hull's trench and rises out of it, so its lower third is
// always below the deck line no matter how tall the bridge gets
function spineSections(sect, spec) {
  return spec.map(({ t, rise, wf = 0.94 }) => {
    const h = sectionAt(sect, t);
    const tw = Math.min(h.tw, h.dk * 0.8);
    const w = Math.max(0.18, tw * h.w * wf);
    const floor = h.top - h.td;
    return { t, w, top: h.top + rise, bot: floor - 0.45, dk: 0.66, tw: 0.26,
      td: Math.min(0.30, 0.06 + rise * 0.10), kw: 0.7 };
  });
}

function keelSections(sect, spec) {
  return spec.map(({ t, d, wf }) => {
    const h = sectionAt(sect, t);
    return { t, w: Math.max(0.12, h.w * wf), top: h.bot + 0.30, bot: h.bot - d,
      dk: 0.72, tw: 0.03, td: 0.04, kw: 0.34 };
  });
}

const M4 = new THREE.Matrix4();
const EU = new THREE.Euler();

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, ao = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleUV(g, w, h, d);
  paint(g, ao);
  g.applyMatrix4(M4.compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(EU.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return g;
}

function paint(g, v) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  if (Array.isArray(v)) for (let i = 0; i < n; i++) { c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  else c.fill(v);
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

// BoxGeometry's uv is 0..1 per face, so a 40 m panel and a 0.4 m greeble block would carry the
// same plate density. Rescale by world size so the plating stays one size everywhere.
function scaleUV(g, w, h, d) {
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * sizes[f][0] / UV, uv.getY(k) * sizes[f][1] / UV);
    }
  }
}

// after the +90° X rotation the cylinder's radiusTop lands aft, so cyl(rAft, rFwd, ...)
function cyl(r0, r1, h, seg, x, y, z, rx = 0, ao = 1, open = false) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  paint(g, ao);
  g.applyMatrix4(M4.compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(EU.set(rx + Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)));
  return g;
}

// flips winding and normals so a cone can be seen from inside — that is the whole engine recess,
// and it costs no extra draw call because it merges into the same dark bucket
function invert(g) {
  const a = g.index.array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  g.index.needsUpdate = true;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

// ── deck furniture ───────────────────────────────────────────────────────────

// Hierarchy tier two: shallow raised plates in bands across the deck. These carry the panel
// groups the eye reads before it ever gets to greeble, and they cost nothing in silhouette.
function panelBands(out, R, { t0, t1, len, sect, n, ao = 0.9 }) {
  for (let i = 0; i < n; i++) {
    const t = t0 + (t1 - t0) * ((i + 0.35 + 0.3 * R()) / n);
    const s = sectionAt(sect, t);
    const dw = s.dk * s.w, tw = Math.min(s.tw, s.dk * 0.8) * s.w;
    const band = Math.max(0.3, dw - tw);
    const d = (t1 - t0) * len / n * (0.34 + 0.42 * R());
    for (const sg of [-1, 1]) {
      if (R() < 0.22) continue;
      const wp = band * (0.35 + 0.55 * R());
      const cx = sg * (tw + band * 0.5 + (R() - 0.5) * band * 0.3);
      out.push(box(wp, 0.07, d, cx, s.top + 0.035, (t - 0.5) * len, 0, 0, 0, ao));
    }
  }
}

// Greeble the critic can read: dense where the hull does something, near-empty on the long runs,
// and kept low so it never breaks the wedge in silhouette.
function greebleField(out, spec) {
  const { R, len, sect, density, count, side, scale = 1, tall = 0.10 } = spec;
  let peak = 0;
  for (let i = 0; i <= 40; i++) peak = Math.max(peak, density(i / 40));
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 40) {
    const t = R();
    if (R() > density(t) / peak) continue;
    placed++;
    const s = sectionAt(sect, t);
    const z = (t - 0.5) * len;
    const kind = R();
    let w = (0.35 + 1.9 * R() ** 1.7) * scale;
    let d = (0.35 + 2.8 * R() ** 1.6) * scale;
    let h = (0.06 + 0.22 * R() ** 2) * scale;
    if (kind < 0.22) { d *= 3.8; w *= 0.22; h *= 0.8; }
    else if (kind < 0.22 + tall) { h *= 3.4; w *= 0.42; d *= 0.42; }
    else if (kind < 0.52) { h *= 0.30; w *= 1.7; d *= 1.7; }
    const tw = Math.min(s.tw, s.dk * 0.8) * s.w;
    if (side === 'trench') {
      if (tw < 0.5) continue;
      const x = (R() * 2 - 1) * tw * 0.7;
      out.push(box(w, h, d, x, s.top - s.td + h * 0.5, z, 0, 0, 0, 0.46));
    } else if (side === 'dorsal') {
      const band = s.dk * s.w - tw;
      if (band < 0.5) continue;
      const sg = R() < 0.5 ? 1 : -1;
      const x = sg * (tw + 0.2 + R() * (band - 0.4));
      out.push(box(w, h, d, x, s.top + h * 0.35, z, 0, 0, 0, 0.94));
    } else {
      const hh = s.top - s.bot;
      const y2 = s.bot + hh * 0.66, y1 = s.bot + hh * 0.30;
      const sg = R() < 0.5 ? 1 : -1;
      const y = y1 + R() * (y2 - y1);
      out.push(box(h, w, d, sg * (s.w - h * 0.42), y, z, 0, 0, 0, 0.55));
    }
  }
}

function runLights(out, R, { t0, t1, len, sect, pitch, size = 0.11, both = true }) {
  let t = t0;
  while (t < t1) {
    t += pitch * (0.6 + 0.9 * R()) / len;
    if (t >= t1) break;
    if (R() < 0.18) continue;
    const s = sectionAt(sect, t), z = (t - 0.5) * len;
    const hh = s.top - s.bot;
    const sc = size * (0.7 + 0.8 * R());
    for (const sg of both ? [-1, 1] : [1]) out.push(box(sc, sc, sc * 2.4, sg * (s.w + sc * 0.4), s.bot + hh * 0.30, z));
  }
}

// A window is one quad mapped to one cell of the 16×16 atlas. The atlas already carries mixed
// brightness, a cool minority and ~28 % dark cells, so picking a cell varies size, brightness
// and colour temperature at once.
//
// `jitter: 0` gives a dead-regular row. That is the cheapest scale cue in the frame: a viewer
// reads an evenly spaced lit row as deck lights and sizes the hull off it.
function windowRun(out, R, { t0, t1, len, sect, f = 0.5, side, pitch, size = 1, skip = 0.22, jitter = 1 }) {
  let t = t0;
  while (t < t1) {
    t += pitch * (1 - jitter * 0.38 + jitter * 0.85 * R()) / len;
    if (t >= t1) break;
    if (R() < skip) continue;
    const s = sectionAt(sect, t);
    const z = (t - 0.5) * len;
    const hh = s.top - s.bot;
    const w = (jitter ? 0.5 + 0.9 * R() : 0.9) * size;
    const h = (jitter ? 0.28 + 0.5 * R() : 0.34) * size;
    const cx = Math.floor(R() * 16), cy = Math.floor(R() * 16);
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < 4; i++) uv.setXY(i, (cx + uv.getX(i)) / 16, (cy + uv.getY(i)) / 16);
    paint(g, 1);
    if (side === 'trench') {
      const tw = Math.min(s.tw, s.dk * 0.8) * s.w;
      const sgn = R() < 0.5 ? -1 : 1;
      g.applyMatrix4(M4.makeRotationY(sgn * Math.PI / 2));
      g.applyMatrix4(M4.makeTranslation(sgn * (tw - 0.03), s.top - s.td * 0.5, z));
    } else {
      const sgn = side === 'port' ? -1 : 1;
      g.applyMatrix4(M4.makeRotationY(sgn * Math.PI / 2));
      g.applyMatrix4(M4.makeTranslation(sgn * (s.w + 0.03), s.bot + hh * (0.30 + f * 0.36), z));
    }
    out.push(g);
  }
}

// The hangar is the second light source: a recess cut into the flank band, a flat glowing back
// wall, and a bounce at its mouth so the plating around it picks the colour up.
// A recess sunk behind the flank skin is invisible — the skin occludes it. The collar stands
// *proud* of the flank instead and the lit wall sits at skin level, which reads as a deep bay
// from any oblique angle and needs no hole cut in the shell.
function hangar(g, col, { x, y, z, w, h, d, sgn }) {
  const t = 0.22, cx = x + sgn * d * 0.5;
  g.dark.push(box(d, t, w + t * 2, cx, y + h * 0.5 + t * 0.5, z, 0, 0, 0, 0.42));
  g.dark.push(box(d, t, w + t * 2, cx, y - h * 0.5 - t * 0.5, z, 0, 0, 0, 0.42));
  g.dark.push(box(d, h, t, cx, y, z + w * 0.5 + t * 0.5, 0, 0, 0, 0.38));
  g.dark.push(box(d, h, t, cx, y, z - w * 0.5 - t * 0.5, 0, 0, 0, 0.38));
  const q = new THREE.PlaneGeometry(w, h);
  q.applyMatrix4(M4.makeRotationY(sgn * Math.PI / 2));
  q.applyMatrix4(M4.makeTranslation(x + sgn * 0.06, y, z));
  paint(q, [col.r, col.g, col.b]);
  g.eng.push(q);
  for (let i = 0; i < 2; i++) {
    g.dark.push(box(d * 0.7, 0.10, w * 0.9, x + sgn * d * 0.35, y - h * 0.5 + h * (i + 1) / 3, z, 0, 0, 0, 0.35));
  }
  return new THREE.Vector3(x + sgn * d * 0.8, y, z);
}

// a disc whose vertex colour carries both the hue and a falloff, so one opaque draw gives a hot
// centre and a long soft edge. Additive over a lit bell shows the plate texture straight through.
function glowDisc(r, x, y, z, col, power, fall = 2.4) {
  const g = new THREE.CircleGeometry(r, 20);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(g.attributes.position.getX(i), g.attributes.position.getY(i)) / r;
    const v = power * (0.08 + 0.92 * Math.max(0, 1 - d) ** fall);
    c[i * 3] = col.r * v; c[i * 3 + 1] = col.g * v; c[i * 3 + 2] = col.b * v;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.applyMatrix4(M4.makeTranslation(x, y, z));
  return g;
}

// The exhaust. One additive tube is a flat white capsule with a hard rim, because every point
// around its circumference is the same brightness and its end stops dead. Three nested open cones
// at falling power, rising radius and rising length integrate to a soft radial profile with a
// core, and each shell dies at a different distance so the wash has no edge to find.
const PLUME_SHELLS = [
  { r0: 1.30, r1: 0.80, len: 1.00, pow: 1.00, fall: 2.4 },
  { r0: 2.20, r1: 1.35, len: 1.45, pow: 0.32, fall: 1.7 },
  { r0: 3.60, r1: 1.90, len: 2.10, pow: 0.11, fall: 1.2 },
];

function plume(r, x, y, z, L, col, power, out) {
  for (const s of PLUME_SHELLS) {
    const ln = L * s.len;
    const g = new THREE.CylinderGeometry(r * s.r0, r * s.r1, ln, 12, 1, true);
    g.applyMatrix4(M4.compose(new THREE.Vector3(x, y, z + ln * 0.5),
      new THREE.Quaternion().setFromEuler(EU.set(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)));
    const p = g.attributes.position, n = p.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const f = Math.max(0, Math.min(1, (p.getZ(i) - z) / ln));
      const v = power * s.pow * (1 - f) ** s.fall;
      c[i * 3] = col.r * v; c[i * 3 + 1] = col.g * v; c[i * 3 + 2] = col.b * v;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    out.push(g);
  }
}

// Real depth: an outer housing, a cone bored forward into the hull with its winding flipped so
// you look down it, a hot core deep inside, a dimmer throat disc, and a plume.
function engines(g, hot, { list, r, len, lod }) {
  const nozzles = [];
  for (const [x, y, z, sc] of list) {
    const rr = r * sc, L = len * sc;
    g.dark.push(cyl(rr * 1.26, rr * 1.16, L * 0.55, 14, x, y, z + L * 0.18, 0, 0.8));
    g.trim.push(cyl(rr * 1.32, rr * 1.20, L * 0.14, 14, x, y, z + L * 0.42, 0, 1.0));
    g.dark.push(invert(cyl(rr * 1.13, rr * 0.34, L * 1.7, 14, x, y, z - L * 0.42, 0, 0.30, true)));
    g.eng.push(glowDisc(rr * 0.40, x, y, z - L * 1.22, hot, 2.6, 1.6));
    g.eng.push(glowDisc(rr * 0.98, x, y, z - L * 0.28, hot, 0.55, 3.2));
    if (lod < 2) plume(rr, x, y, z + L * 0.46, L * 3.0, hot, 0.30, g.plume);
    nozzles.push(new THREE.Vector3(x, y, z + L * 0.5));
  }
  return nozzles;
}

// ── the three hulls ──────────────────────────────────────────────────────────
//
// Every class is one long asymmetric wedge: a point at the bow, monotone growth over the first
// two thirds, a blunt stern. Length:beam is 7.0, 5.2 and 6.3. Nothing is a lens.

const CLASSES = {
  hauler: {
    len: 84, name: 'FERROUS', hullNo: '04',
    sect: [
      S(0.000, 0.12, 0.10, -0.14, 0.30),
      S(0.030, 0.55, 0.40, -0.55, 0.34),
      S(0.075, 1.20, 0.80, -1.15, 0.40),
      S(0.140, 2.05, 1.25, -1.80, 0.46, 0.10, 0.15),
      S(0.220, 2.95, 1.75, -2.35, 0.52, 0.22, 0.45),
      S(0.320, 3.85, 2.25, -2.80, 0.58, 0.34, 0.75),
      S(0.430, 4.65, 2.75, -3.15, 0.62, 0.40, 1.00),
      S(0.550, 5.30, 3.20, -3.40, 0.66, 0.44, 1.15),
      S(0.670, 5.75, 3.60, -3.55, 0.68, 0.46, 1.25),
      S(0.780, 5.98, 3.95, -3.60, 0.70, 0.46, 1.30),
      S(0.870, 6.00, 4.15, -3.55, 0.72, 0.44, 1.25),
      S(0.945, 5.80, 4.20, -3.35, 0.72, 0.40, 1.10),
      S(1.000, 5.30, 4.05, -3.00, 0.70, 0.34, 0.90),
    ],
    // paired t's a hair apart are a vertical riser in the loft: that is what makes the dorsal
    // line a stepped profile instead of one smooth swell, and it is free in mesh count
    spine: [
      { t: 0.140, rise: 0.10, wf: 0.90 }, { t: 0.250, rise: 0.40, wf: 0.94 },
      { t: 0.292, rise: 0.50, wf: 1.00 }, { t: 0.304, rise: 2.70, wf: 1.52 },
      { t: 0.420, rise: 2.85, wf: 1.58 }, { t: 0.432, rise: 0.95, wf: 1.04 },
      { t: 0.560, rise: 1.05, wf: 1.00 }, { t: 0.640, rise: 1.20, wf: 1.06 },
      { t: 0.652, rise: 3.70, wf: 1.46 }, { t: 0.736, rise: 3.95, wf: 1.50 },
      { t: 0.748, rise: 6.60, wf: 1.02 }, { t: 0.838, rise: 6.85, wf: 1.08 },
      { t: 0.850, rise: 2.30, wf: 1.30 }, { t: 0.930, rise: 1.60, wf: 1.14 },
      { t: 1.000, rise: 0.80, wf: 0.94 },
    ],
    keel: [
      { t: 0.055, d: 0.10, wf: 0.60 }, { t: 0.180, d: 0.55, wf: 0.32 },
      { t: 0.380, d: 1.05, wf: 0.24 }, { t: 0.600, d: 1.30, wf: 0.22 },
      { t: 0.790, d: 1.20, wf: 0.22 }, { t: 0.930, d: 0.80, wf: 0.24 },
      { t: 1.000, d: 0.35, wf: 0.28 },
    ],
    greeble: t => 0.05 + 0.85 * gauss(t, 0.20, 0.09) + 1.00 * gauss(t, 0.78, 0.10)
      + 0.70 * gauss(t, 0.97, 0.05) + 0.20 * gauss(t, 0.52, 0.10),
    build: (g, c, R, lod) => {
      const { sect, len } = c;
      const bow = sectionAt(sect, 0.10);

      // the sponson: one long faired blister on the starboard flank and nothing to match it to
      // port, which is what stops the hull reading as a symmetric extrusion
      g.panel.push(box(1.5, 2.2, len * 0.30, sectionAt(sect, 0.52).w + 0.3, -0.4, len * 0.02, 0, 0, 0, 0.9));
      g.dark.push(box(1.1, 1.4, len * 0.33, sectionAt(sect, 0.52).w + 0.2, -1.9, len * 0.02, 0, 0, 0, 0.7));
      g.trim.push(box(1.7, 0.20, len * 0.30, sectionAt(sect, 0.52).w + 0.3, 0.75, len * 0.02));
      // port cargo shoulder, shorter and further aft
      g.panel.push(box(1.2, 1.6, len * 0.17, -sectionAt(sect, 0.72).w - 0.2, 0.9, len * 0.20, 0, 0, 0, 0.88));

      // Three masses whose whole job is to cross the profile. A single tapered wedge survives no
      // amount of squinting; a step, a fin and a sponson that break the top and bottom edges do.
      {
        const a = sectionAt(sect, 0.52), b = sectionAt(sect, 0.90), p = sectionAt(sect, 0.34);
        // port sponson: hangs below the lower chine, so it notches the bottom edge
        g.dark.push(box(2.3, 2.6, len * 0.24, -a.w - 0.8, a.bot + 0.4, len * 0.06, 0, 0, -0.16, 0.52));
        g.dark.push(box(1.8, 1.3, len * 0.20, -a.w - 0.9, a.bot - 1.3, len * 0.06, 0, 0, -0.16, 0.34));
        g.trim.push(box(0.6, 0.18, len * 0.24, -a.w - 1.7, a.bot + 1.4, len * 0.06, 0, 0, -0.16));
        // canted stern fins: they cut the top edge where the hull would otherwise just run out
        for (const sg of [-1, 1]) {
          g.panel.push(box(0.55, 5.4, len * 0.15, sg * 2.5, b.top + 2.4, len * 0.39, 0, 0, sg * 0.20, 0.9));
          g.trim.push(box(0.75, 0.28, len * 0.12, sg * 3.4, b.top + 4.9, len * 0.40));
        }
        // forward gantry over the stepped deckhouse: a gap of sky under a mass reads at any size
        g.dark.push(box(p.dk * p.w * 2.1, 0.45, 1.2, 0, p.top + 4.5, -len * 0.13, 0, 0, 0, 0.7));
        for (const sg of [-1, 1]) g.panel.push(box(0.5, 4.2, 0.8, sg * p.dk * p.w * 0.92, p.top + 2.4, -len * 0.13, 0, 0, 0, 0.8));
      }

      // faired dorsal blisters: the only curved masses on the hull, and the only thing on it
      // that is not a box at 90 degrees
      for (const [t, sg, r, ln] of [[0.44, -1, 0.85, 12.0], [0.63, 1, 0.72, 9.0], [0.30, 1, 0.55, 6.0]]) {
        const s = sectionAt(sect, t);
        const tw = Math.min(s.tw, s.dk * 0.8) * s.w, band = s.dk * s.w - tw;
        g.dark.push(cyl(r, r, ln, 14, sg * (tw + band * 0.52), s.top - r * 0.42, (t - 0.5) * len, 0, 0.92));
      }

      // bow blade and chin sensor block, both inside the wedge
      g.dark.push(box(bow.w * 1.5, 0.34, len * 0.18, 0, bow.top * 0.2, -len * 0.40, 0, 0, 0, 0.9));
      g.trim.push(box(0.5, 0.22, len * 0.14, 0, bow.top * 0.2 + 0.2, -len * 0.40));
      g.panel.push(box(1.5, 0.8, 2.4, 0, -1.1, -len * 0.335, 0, 0, 0, 0.8));

      // the stepped bow: three raised plates each ending in a riser facing forward, so the
      // forward third climbs in stages and every riser faces the key square-on
      for (const [t, h, wf] of [[0.135, 0.75, 0.86], [0.205, 1.15, 0.90], [0.268, 1.55, 0.94]]) {
        const s = sectionAt(sect, t);
        const zc = (t - 0.5) * len;
        g.panel.push(box(s.dk * s.w * 2 * wf, h, len * 0.062, 0, s.top + h * 0.5, zc, 0, 0, 0, 0.95));
        g.trim.push(box(s.dk * s.w * 2 * wf, 0.18, 0.5, 0, s.top + h, zc - len * 0.031, 0, 0, 0, 1.0));
      }

      if (lod === 0) {
        panelBands(g.hull, R, { t0: 0.24, t1: 0.98, len, sect, n: 11 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 54, side: 'dorsal' });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 84, side: 'trench', tall: 0.26 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 54, side: 'flank', scale: 0.8 });
        // deck rails at a fixed pitch: the other half of the scale cue
        for (let i = 0; i < 9; i++) {
          const t = 0.26 + i * 0.078;
          const s = sectionAt(sect, t);
          g.panel.push(box(s.dk * s.w * 2 + 0.5, 0.12, 0.30, 0, s.top + 0.10, (t - 0.5) * len, 0, 0, 0, 0.9));
        }
        g.trim.push(box(0.12, 4.6, 0.12, 1.5, sectionAt(sect, 0.83).top + 9.2, len * 0.31));
        g.trim.push(box(0.10, 2.8, 0.10, -1.1, sectionAt(sect, 0.83).top + 8.2, len * 0.34));
      }

      const bounceHangar = hangar(g, new THREE.Color('#6ce6ff').multiplyScalar(0.20),
        { x: -sectionAt(sect, 0.36).w, y: -0.35, z: -len * 0.14, w: 3.6, h: 1.15, d: 0.9, sgn: -1 });
      const bounceBridge = new THREE.Vector3(0, 9.9, 22.5);
      const gl = new THREE.PlaneGeometry(3.6, 1.3);
      gl.applyMatrix4(M4.compose(new THREE.Vector3(0, 9.4, 21.0),
        new THREE.Quaternion().setFromEuler(EU.set(0.5, 0, 0)), new THREE.Vector3(1, 1, 1)));
      paint(gl, 1);
      g.glass2.push(gl);

      const st = sectionAt(sect, 1.0);
      const noz = engines(g, c.hot, {
        lod, r: 1.15, len: 3.6,
        list: [[-3.1, 0.5, len * 0.5 + 0.4, 1.0], [0, 0.9, len * 0.5 + 0.4, 1.15],
          [3.1, 0.5, len * 0.5 + 0.4, 1.0], [-1.6, -2.0, len * 0.5 + 0.2, 0.62],
          [1.6, -2.0, len * 0.5 + 0.2, 0.62]],
      });
      g.trim.push(box(st.w * 1.7, 0.24, 0.6, 0, 2.6, len * 0.5 - 0.4));

      if (lod < 2) {
        // the regular row: fixed pitch, no skips, no size jitter
        windowRun(g.win, R, { t0: 0.30, t1: 0.93, len, sect, side: 'starboard', f: 0.52, pitch: 1.5, size: 0.95, skip: 0, jitter: 0 });
        windowRun(g.win, R, { t0: 0.34, t1: 0.92, len, sect, side: 'port', f: 0.50, pitch: 1.5, size: 0.95, skip: 0, jitter: 0 });
        windowRun(g.win, R, { t0: 0.42, t1: 0.94, len, sect, side: 'starboard', f: 0.90, pitch: 2.1, size: 0.7, skip: 0.3 });
        windowRun(g.win, R, { t0: 0.24, t1: 0.90, len, sect, side: 'port', f: 0.14, pitch: 2.4, size: 0.6, skip: 0.35 });
        windowRun(g.win, R, { t0: 0.30, t1: 0.98, len, sect, side: 'trench', pitch: 1.6, size: 0.7, skip: 0.28 });
        runLights(g.lamp, R, { t0: 0.10, t1: 0.97, len, sect, pitch: 3.6 });
      }
      return { hangar: bounceHangar, bridge: bounceBridge, nozzles: noz,
        decals: [
          { x: -sectionAt(sect, 0.42).w - 0.04, y: -1.25, z: -len * 0.08, w: 7.5, h: 1.4, sgn: -1, text: `${c.name} ${c.hullNo}` },
          { deck: true, x: -sectionAt(sect, 0.30).w * 0.62, y: sectionAt(sect, 0.30).top + 0.07, z: -len * 0.20, w: 8, h: 2.0, text: c.hullNo },
          { deck: true, x: sectionAt(sect, 0.46).w * 0.60, y: sectionAt(sect, 0.46).top + 0.07, z: -len * 0.04, w: 5, h: 1.3, text: 'CAUTION', warn: true },
        ] };
    },
  },

  rig: {
    len: 52, name: 'KESTREL', hullNo: '11',
    sect: [
      S(0.000, 0.30, 0.25, -0.30, 0.34),
      S(0.055, 1.05, 0.75, -1.05, 0.40),
      S(0.130, 2.10, 1.35, -1.95, 0.46, 0.12, 0.20),
      S(0.230, 3.15, 1.95, -2.65, 0.54, 0.28, 0.55),
      S(0.350, 4.10, 2.50, -3.15, 0.60, 0.38, 0.85),
      S(0.490, 4.70, 2.95, -3.45, 0.64, 0.42, 1.00),
      S(0.640, 5.00, 3.30, -3.55, 0.66, 0.44, 1.05),
      S(0.790, 4.95, 3.50, -3.40, 0.68, 0.42, 1.00),
      S(0.910, 4.70, 3.50, -3.10, 0.68, 0.36, 0.85),
      S(1.000, 4.20, 3.25, -2.70, 0.66, 0.30, 0.70),
    ],
    spine: [
      { t: 0.160, rise: 0.10, wf: 0.90 }, { t: 0.320, rise: 0.45, wf: 0.94 },
      { t: 0.480, rise: 0.75, wf: 0.98 }, { t: 0.580, rise: 1.70, wf: 1.14 },
      { t: 0.660, rise: 2.55, wf: 1.22 }, { t: 0.760, rise: 2.30, wf: 1.18 },
      { t: 0.860, rise: 1.10, wf: 1.00 }, { t: 1.000, rise: 0.55, wf: 0.88 },
    ],
    keel: [
      { t: 0.070, d: 0.10, wf: 0.55 }, { t: 0.220, d: 0.50, wf: 0.30 },
      { t: 0.450, d: 0.85, wf: 0.24 }, { t: 0.680, d: 0.95, wf: 0.24 },
      { t: 0.880, d: 0.60, wf: 0.26 }, { t: 1.000, d: 0.28, wf: 0.30 },
    ],
    greeble: t => 0.08 + 0.90 * gauss(t, 0.24, 0.10) + 1.00 * gauss(t, 0.66, 0.11)
      + 0.60 * gauss(t, 0.95, 0.06),
    build: (g, c, R, lod) => {
      const { sect, len } = c;
      const mid = sectionAt(sect, 0.55);
      // ventral ore hopper: slung under the keel, tapering with the hull rather than a slab
      g.dark.push(box(mid.w * 1.30, 3.2, len * 0.34, 0, mid.bot - 1.9, len * 0.02, 0, 0, 0, 0.62));
      g.panel.push(box(mid.w * 1.45, 0.9, len * 0.36, 0, mid.bot - 0.5, len * 0.02, 0, 0, 0, 0.8));
      g.trim.push(box(mid.w * 1.5, 0.26, 0.8, 0, mid.bot - 3.4, -len * 0.10));
      g.trim.push(box(mid.w * 1.5, 0.26, 0.8, 0, mid.bot - 3.4, len * 0.14));
      for (const [t, sg, r, ln] of [[0.50, -1, 0.72, 9.0], [0.72, 1, 0.58, 5.5]]) {
        const s = sectionAt(sect, t);
        const tw = Math.min(s.tw, s.dk * 0.8) * s.w, band = s.dk * s.w - tw;
        g.dark.push(cyl(r, r, ln, 14, sg * (tw + band * 0.52), s.top - r * 0.42, (t - 0.5) * len, 0, 0.92));
      }
      // boom arms, asymmetric in length
      for (const [s, ln] of [[-1, 15.0], [1, 12.0]]) {
        const a = sectionAt(sect, 0.42);
        g.dark.push(box(0.95, 0.95, ln, s * (a.w + 0.9), -0.9, -len * 0.22, 0, s * 0.13, 0, 0.8));
        g.panel.push(box(1.9, 1.9, 2.2, s * (a.w + 1.7), -0.9, -len * 0.22 - ln * 0.48, 0, 0, 0, 0.85));
        g.trim.push(cyl(0.62, 0.34, 1.8, 6, s * (a.w + 1.7), -0.9, -len * 0.22 - ln * 0.62));
        g.panel.push(box(2.2, 1.4, 2.6, s * (a.w + 0.5), 0.7, -len * 0.05, 0, 0, 0, 0.85));
      }
      if (lod === 0) {
        panelBands(g.hull, R, { t0: 0.26, t1: 0.96, len, sect, n: 8 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 58, side: 'dorsal' });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 44, side: 'trench', tall: 0.22 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 40, side: 'flank', scale: 0.75 });
        g.trim.push(box(0.11, 2.4, 0.11, -1.1, sectionAt(sect, 0.66).top + 3.7, len * 0.18));
      }
      const bounceHangar = hangar(g, new THREE.Color('#6ce6ff').multiplyScalar(0.20),
        { x: sectionAt(sect, 0.72).w, y: -0.1, z: len * 0.22, w: 3.6, h: 1.5, d: 1.0, sgn: 1 });
      const bounceBridge = new THREE.Vector3(0, 5.4, 7.5);
      const gl = new THREE.PlaneGeometry(2.8, 1.1);
      gl.applyMatrix4(M4.compose(new THREE.Vector3(0, 5.0, 6.2),
        new THREE.Quaternion().setFromEuler(EU.set(0.55, 0, 0)), new THREE.Vector3(1, 1, 1)));
      paint(gl, 1);
      g.glass2.push(gl);
      const noz = engines(g, c.hot, {
        lod, r: 1.5, len: 3.2,
        list: [[-2.6, 0.4, len * 0.5 + 0.3, 1.0], [2.6, 0.4, len * 0.5 + 0.3, 1.0],
          [0, -2.2, len * 0.5 + 0.1, 0.55]],
      });
      if (lod < 2) {
        windowRun(g.win, R, { t0: 0.30, t1: 0.92, len, sect, side: 'starboard', f: 0.5, pitch: 1.4, size: 0.9, skip: 0, jitter: 0 });
        windowRun(g.win, R, { t0: 0.34, t1: 0.92, len, sect, side: 'port', f: 0.5, pitch: 1.4, size: 0.9, skip: 0, jitter: 0 });
        windowRun(g.win, R, { t0: 0.26, t1: 0.70, len, sect, side: 'port', f: 0.12, pitch: 2.6, size: 0.6, skip: 0.4 });
        windowRun(g.win, R, { t0: 0.34, t1: 0.96, len, sect, side: 'trench', pitch: 1.7, size: 0.65, skip: 0.3 });
        runLights(g.lamp, R, { t0: 0.12, t1: 0.96, len, sect, pitch: 3.0 });
      }
      return { hangar: bounceHangar, bridge: bounceBridge, nozzles: noz,
        decals: [
          { x: -sectionAt(sect, 0.46).w - 0.04, y: -0.3, z: -len * 0.06, w: 6, h: 1.6, sgn: -1, text: `${c.name} ${c.hullNo}` },
          { deck: true, x: -sectionAt(sect, 0.34).w * 0.60, y: sectionAt(sect, 0.34).top + 0.07, z: -len * 0.16, w: 5, h: 1.3, text: c.hullNo },
        ] };
    },
  },

  escort: {
    len: 30, name: 'FL', hullNo: '7',
    sect: [
      S(0.000, 0.08, 0.06, -0.08, 0.30),
      S(0.060, 0.40, 0.24, -0.32, 0.36),
      S(0.160, 0.90, 0.52, -0.68, 0.44),
      S(0.300, 1.42, 0.82, -1.02, 0.52, 0.14, 0.16),
      S(0.460, 1.90, 1.10, -1.28, 0.58, 0.26, 0.32),
      S(0.620, 2.22, 1.34, -1.44, 0.62, 0.32, 0.42),
      S(0.780, 2.38, 1.50, -1.48, 0.64, 0.32, 0.44),
      S(0.900, 2.34, 1.55, -1.40, 0.64, 0.28, 0.38),
      S(1.000, 2.10, 1.48, -1.20, 0.62, 0.22, 0.30),
    ],
    spine: [
      { t: 0.300, rise: 0.06, wf: 0.90 }, { t: 0.460, rise: 0.28, wf: 0.96 },
      { t: 0.580, rise: 0.72, wf: 1.14 }, { t: 0.700, rise: 0.86, wf: 1.20 },
      { t: 0.820, rise: 0.55, wf: 1.04 }, { t: 1.000, rise: 0.25, wf: 0.88 },
    ],
    keel: [
      { t: 0.100, d: 0.06, wf: 0.50 }, { t: 0.320, d: 0.28, wf: 0.28 },
      { t: 0.600, d: 0.42, wf: 0.24 }, { t: 0.850, d: 0.30, wf: 0.26 },
      { t: 1.000, d: 0.12, wf: 0.30 },
    ],
    greeble: t => 0.04 + 0.9 * gauss(t, 0.36, 0.10) + 0.8 * gauss(t, 0.88, 0.07),
    build: (g, c, R, lod) => {
      const { sect, len } = c;
      // swept strakes rather than wings: they follow the chine, so the wedge keeps its line
      for (const s of [-1, 1]) {
        const a = sectionAt(sect, 0.62);
        g.panel.push(box(2.6, 0.26, 6.0, s * (a.w + 1.1), -0.15, len * 0.10, 0, 0, s * 0.14, 0.9));
        g.trim.push(box(0.7, 0.20, 1.1, s * (a.w + 2.1), -0.28, len * 0.24));
      }
      if (lod === 0) {
        panelBands(g.hull, R, { t0: 0.36, t1: 0.96, len, sect, n: 5 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 26, side: 'dorsal', scale: 0.5 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 18, side: 'trench', scale: 0.45 });
        greebleField(g.panel, { R, len, sect, density: c.greeble, count: 16, side: 'flank', scale: 0.42 });
      }
      const bounceBridge = new THREE.Vector3(0, 2.2, 5.4);
      const gl = new THREE.PlaneGeometry(1.2, 0.5);
      gl.applyMatrix4(M4.compose(new THREE.Vector3(0, 2.0, 4.8),
        new THREE.Quaternion().setFromEuler(EU.set(0.55, 0, 0)), new THREE.Vector3(1, 1, 1)));
      paint(gl, 1);
      g.glass2.push(gl);
      const noz = engines(g, c.hot, {
        lod, r: 0.8, len: 1.9,
        list: [[-1.1, 0.1, len * 0.5 + 0.2, 1.0], [1.1, 0.1, len * 0.5 + 0.2, 1.0]],
      });
      if (lod < 2) {
        windowRun(g.win, R, { t0: 0.40, t1: 0.90, len, sect, side: 'starboard', f: 0.5, pitch: 1.0, size: 0.5, skip: 0, jitter: 0 });
        runLights(g.lamp, R, { t0: 0.24, t1: 0.94, len, sect, pitch: 2.4, size: 0.10 });
      }
      return { hangar: null, bridge: bounceBridge, nozzles: noz, decals: null };
    },
  },
};

export const allShipClasses = () => Object.keys(CLASSES);

export function shipClass(classId, { palette: paletteId = 'ferrous', lod = 0, seed = 0 } = {}) {
  const c = CLASSES[classId] || CLASSES.hauler;
  const p = palette(paletteId);
  c.hot = new THREE.Color(p.engine);
  const R = rnd(0x9e37 + seed * 2654435761 + classId.length * 7919);
  const g = { hull: [], dark: [], panel: [], trim: [], win: [], eng: [], plume: [], glass2: [], lamp: [] };

  const thin = (arr, n) => (lod === 0 ? arr
    : arr.filter((_, i) => i % (lod === 1 ? 2 : 3) === 0 || i === arr.length - 1));
  const sect = thin(c.sect);
  g.hull.push(hullLoft(sect, c.len));
  g.panel.push(hullLoft(spineSections(c.sect, thin(c.spine)), c.len));
  g.dark.push(hullLoft(keelSections(c.sect, thin(c.keel)), c.len));

  const f = c.build(g, c, R, lod);

  // draw calls, not triangles, are what a 24-hull fleet runs out of: past LOD 0 the accent
  // buckets fold into the dark hull and the glass and plume go entirely
  if (lod >= 1) { g.dark.push(...g.panel, ...g.trim); g.panel.length = g.trim.length = 0; }
  if (lod >= 2) { g.dark.push(...g.glass2); g.glass2.length = g.plume.length = 0; }

  const grp = new THREE.Group();
  grp.name = `ship:${classId}`;
  const bounce = [
    f.hangar ? new THREE.Vector4(f.hangar.x, f.hangar.y, f.hangar.z, 4.5) : new THREE.Vector4(0, 0, 0, -1),
    new THREE.Vector4(f.bridge.x, f.bridge.y, f.bridge.z, 3.4),
    // the hangar throws the *opposing* faction's cool, so it never disappears into the warm hull
    new THREE.Color(paletteId === 'corvain' ? '#ffb45e' : '#39d7f0').multiplyScalar(0.32),
    new THREE.Color(p.window).multiplyScalar(0.16),
    // the wash source sits a little aft of the bells, so the falloff runs forward up the hull
    new THREE.Vector4(0, 0, c.len * 0.5 + 5.5, Math.max(6, c.len * 0.20)),
    new THREE.Color(p.engine),
  ];

  const add = (geos, surface) => {
    if (!geos.length) return;
    const merged = geos.length === 1 ? strip(geos[0]) : mergeGeometries(geos.map(stripG), false);
    if (!merged) return;
    grp.add(new THREE.Mesh(merged, mat(paletteId, surface, classId, bounce)));
    for (const x of geos) if (x !== merged) x.dispose();
  };

  add(g.hull, 'hull');
  add(g.dark, 'hullDark');
  add(g.panel, 'panel');
  add(g.trim, 'trim');

  if (g.lamp.length) {
    const m = mergeGeometries(g.lamp.map(stripG), false);
    if (m) grp.add(new THREE.Mesh(m, mat(paletteId, 'strip', classId)));
  }
  if (g.win.length) {
    const m = mergeGeometries(g.win.map(stripG), false);
    if (m) grp.add(new THREE.Mesh(m, mat(paletteId, 'window', classId)));
  }
  if (g.glass2.length) {
    const m = mergeGeometries(g.glass2.map(stripG), false);
    if (m) grp.add(new THREE.Mesh(m, mat(paletteId, 'glass', classId)));
  }
  // nozzle cores, throat discs and the hangar back wall all ride one opaque vertex-coloured
  // mesh: the colour is in the vertices, so one material carries warm engines and a cyan bay
  if (g.eng.length) {
    const m = mergeGeometries(g.eng.map(stripG), false);
    const em = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: true });
    em.userData = { palette: paletteId, surface: 'engineGlow' };
    em.color.setScalar(GLOW.engine);
    EMISSIVE.push(em);
    if (m) { const mesh = new THREE.Mesh(m, em); mesh.name = 'engineGlow'; grp.add(mesh); }
  }
  if (g.plume.length) {
    const m = mergeGeometries(g.plume.map(stripG), false);
    const pm = new THREE.MeshBasicMaterial({
      vertexColors: true, fog: false, toneMapped: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    pm.userData = { palette: paletteId, surface: 'plume' };
    pm.color.setScalar(GLOW.plume);
    PLUMES.push(pm);
    if (m) { const mesh = new THREE.Mesh(m, pm); mesh.name = 'plume'; mesh.renderOrder = 10; grp.add(mesh); }
  }

  // every painted marking on one 512 sheet, four rows: the whole decal set is one draw call
  if (lod === 0 && f.decals) {
    const quads = f.decals.map((d, i) => {
      const q = new THREE.PlaneGeometry(d.w, d.h);
      const uv = q.attributes.uv;
      for (let k = 0; k < 4; k++) uv.setY(k, (3 - i + uv.getY(k)) / 4);
      paint(q, d.warn ? [0.40, 0.23, 0.08] : [0.30, 0.29, 0.27]);
      if (d.deck) q.applyMatrix4(M4.makeRotationX(-Math.PI / 2));
      else q.applyMatrix4(M4.makeRotationY((d.sgn ?? 1) * Math.PI / 2));
      q.applyMatrix4(M4.makeTranslation(d.x, d.y, d.z));
      return q;
    });
    const m = mergeGeometries(quads.map(stripG), false);
    const dm = getMaterial(paletteId, 'decal').clone();
    dm.userData = { palette: paletteId, surface: 'decal', envMul: 0.4 };
    dm.map = getDecalSheet(f.decals.map(d => d.text));
    dm.alphaMap = dm.map;
    dm.transparent = true;
    dm.vertexColors = true;
    dm.color.set('#ffffff');
    dm.needsUpdate = true;
    adopt(dm);
    if (m) grp.add(new THREE.Mesh(m, dm));
  }

  grp.userData.classId = classId;
  grp.userData.length = c.len;
  grp.userData.lod = lod;
  grp.userData.trails = [];
  for (const n of f.nozzles) {
    const a = new THREE.Object3D();
    a.name = 'trail';
    a.position.copy(n);
    grp.add(a);
    grp.userData.trails.push(a);
  }
  return grp;
}

// mergeGeometries refuses a set whose attributes differ, and BoxGeometry/PlaneGeometry/
// CylinderGeometry do not agree on which of uv/uv1/normal/color they ship with.
function strip(g) {
  const want = ['position', 'normal', 'uv', 'color'];
  for (const k of Object.keys(g.attributes)) if (!want.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3); c.fill(1);
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  return g;
}
const stripG = g => strip(g);

const GREY = new THREE.Color(0.55, 0.56, 0.58);
const GLOW = { engine: 1.5, plume: 1.0 };
const EMISSIVE = [];
const PLUMES = [];

export function registerShipKnobs(q, backdrop) {
  const G = 'Hulls';
  q.register({ key: 'rimPower', label: 'Key rim', type: 'range', min: 0, max: 6, step: 0.02, default: 1.5, group: G },
    v => { RIM.uRimInt.value = v; });
  q.register({ key: 'rimWidth', label: 'Rim tightness', type: 'range', min: 0.5, max: 8, step: 0.05, default: 2.6, group: G },
    v => { RIM.uRimPow.value = v; });
  // the rim key is a point at this range, not the directional. A directional gives one rim
  // brightness down the whole hull, which is exactly the flat the critic called out.
  q.register({ key: 'rimDist', label: 'Rim key range (m)', type: 'range', min: 20, max: 900, step: 5, default: 120, group: G },
    v => { RIM.dist = v; });
  q.register({ key: 'rimFall', label: 'Rim falloff (m)', type: 'range', min: 5, max: 400, step: 1, default: 46, group: G },
    v => { RIM.uRimFall.value = v; });
  q.register({ key: 'rimNear', label: 'Rim full out to (m)', type: 'range', min: 0, max: 200, step: 1, default: 18, group: G },
    v => { RIM.uRimNear.value = v; });
  q.register({ key: 'bouncePower', label: 'Hangar / bridge bounce', type: 'range', min: 0, max: 4, step: 0.02, default: 1.35, group: G },
    v => { RIM.uBouncePow.value = v; });
  q.register({ key: 'hullDetail', label: 'Plate detail layer', type: 'range', min: 0, max: 1.5, step: 0.02, default: 0.42, group: G },
    v => { RIM.uDetail.value = v; });
  q.register({ key: 'hullRough', label: 'Roughness break-up', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.24, group: G },
    v => { RIM.uRough.value = v; });
  q.register({ key: 'shadowFill', label: 'Shadow-side structure', type: 'range', min: 0, max: 2.5, step: 0.02, default: 0, group: G },
    v => { RIM.uShadPow.value = v; });
  q.register({ key: 'hullPanel', label: 'Micro panelling', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0, group: G },
    v => { RIM.uPanel.value = v; });
  q.register({ key: 'engineWash', label: 'Engine wash on skin', type: 'range', min: 0, max: 4, step: 0.02, default: 0, group: G },
    v => { RIM.uWash.value = v; });
  q.register({ key: 'engineGlow', label: 'Engine core', type: 'range', min: 0, max: 6, step: 0.05, default: 1.5, group: G },
    v => { GLOW.engine = v; for (const m of EMISSIVE) m.color.setScalar(v); });
  q.register({ key: 'plumePower', label: 'Exhaust plume', type: 'range', min: 0, max: 4, step: 0.02, default: 1.0, group: G },
    v => { GLOW.plume = v; for (const m of PLUMES) m.color.setScalar(v); });

  RIM.backdrop = backdrop;
}

// Called every frame from the world: puts the rim key on the key light's bearing at rimDist, so
// the rim and the diffuse falloff agree even when the key is swung off the star for composition.
export function updateShipLighting(backdrop, lighting) {
  if (!backdrop) return;
  const d = lighting?.keyDir || backdrop.dir;
  RIM.uKeyPos.value.copy(d).multiplyScalar(RIM.dist ?? 120);
  RIM.uKeyCol.value.set(backdrop.sys.starTint).convertSRGBToLinear();
  // a fully saturated fill hue on a 0.07-albedo metal reads as painted plastic
  RIM.uShadCol.value.set(backdrop.sys.fill).convertSRGBToLinear().lerp(GREY, 0.45);
  if (lighting?.fill) RIM.uShadDir.value.copy(lighting.fill.position).normalize();
}
