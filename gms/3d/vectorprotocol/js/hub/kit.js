// Geometry accumulator: primitives are added under a palette key, baked with that key's vertex colour and merged into
// one mesh per material (metal / grit / win / glass / neon), so a whole building costs ~4 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullTex, interiorTex, bayTex } from './textures.js';

const NEON = {
  cyan: 0x38e8ff, pink: 0xff3fd0, orange: 0xff8a2a, green: 0x4dffa0, yellow: 0xffd34d,
  purple: 0xa070ff, blue: 0x3f8cff, white: 0xdff6ff, red: 0xff2a3a, amber: 0xffb547, warm: 0xffc890,
};
export const NEON_KEYS = Object.keys(NEON);

// key -> [material, colour, colour gain]
const PALETTE = {
  hull: ['metal', 0xb4c0d6], light: ['metal', 0xd8dee8], dark: ['metal', 0x4a5468], steel: ['metal', 0x7d8798],
  paint: ['metal', 0x2f8a88], orangep: ['metal', 0xc8642a], mustard: ['metal', 0xc89a2a], teal: ['metal', 0x2f8a88], bluep: ['metal', 0x4a76b0], navy: ['metal', 0x2a3650], hazard: ['metal', 0xd9a300], white_p: ['metal', 0xe8ecf2], redp: ['metal', 0xa83a3a],
  rust: ['grit', 0x9a6a4a], grime: ['grit', 0x3a3e46], tarp: ['grit', 0x4f6a52], tarp2: ['grit', 0x7a6440], concrete: ['grit', 0x6a6e78],
  oxide: ['grit', 0x5a7a8a], tire: ['grit', 0x18191c],
  win: ['win', 0xffd2a0], wincool: ['win', 0x9fd0ff], winmix: ['win', 0xe0e4ff], windim: ['win', 0x6a5a48],
  glass: ['glass', 0xffffff],
  bay: ['bay', 0xffb070, 1.25], baypink: ['bay', 0xff60d0, 1.2], baycool: ['bay', 0x80c8ff, 1.2],
  facade: ['facade', 0xffffff],
};
for (const [k, c] of Object.entries(NEON)) PALETTE[k] = ['neon', c, 2.0];
export const MAT_KEYS = ['metal', 'grit', 'win', 'glass', 'neon', 'facade', 'bay'];

// window panels emit through their texture tinted by the vertex colour
function tintEmissive(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'vpwin';
  return m;
}

// Skyline curtain walls in world space: floor bands, mullions, occupied floors with runs of lit rooms, faded to an
// average glow where cells go sub-pixel so distant towers read calm instead of as confetti.
// Vertex colour: r = tower seed, g = occupancy, b = warmth.
function facadeShader(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN;
float fh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `vec3 fSeed = vColor.rgb;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 an = abs(vWN);
  float side = step(an.y, 0.5);
  float u = an.x > an.z ? vWP.z : vWP.x;
  vec2 g = vec2(u / 1.8, vWP.y / 3.2);
  vec2 cell = floor(g), f = fract(g);
  float px = max(fwidth(g.x), fwidth(g.y));
  float aa = 1.0 - smoothstep(0.12, 0.45, px);
  float seed = fSeed.r * 97.0;
  float floorOn = step(1.0 - fSeed.g, fh(vec2(cell.y, seed)));
  float run = step(0.3, fh(vec2(floor(cell.x / 4.0), cell.y + seed * 3.0)));
  float lit = floorOn * run * step(0.3, fh(cell + seed));
  float open = smoothstep(0.06, 0.1, f.x) * smoothstep(0.94, 0.9, f.x) * smoothstep(0.2, 0.26, f.y) * smoothstep(0.9, 0.84, f.y);
  float ceilg = 0.45 + 0.55 * smoothstep(0.3, 0.84, f.y);
  vec3 rc = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.72, 0.42), step(1.0 - fSeed.b, fh(cell + 5.1))) * (0.75 + 0.35 * fh(cell + 9.7));
  vec3 near = rc * lit * open * ceilg;
  vec3 far = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.72, 0.42), fSeed.b) * fSeed.g * 0.18;
  totalEmissiveRadiance += mix(far, near * 0.75, aa) * side;
  float spand = 1.0 - open;
  diffuseColor.rgb = mix(vec3(0.05, 0.06, 0.09), vec3(0.16, 0.18, 0.24), spand * aa + (1.0 - aa) * 0.4);
  metalnessFactor = mix(0.85, 0.3, spand * aa);
  roughnessFactor = mix(0.12, 0.6, spand * aa);
}`)
      ;
  };
  m.customProgramCacheKey = () => 'vpfacade';
  return m;
}

export function createMaterials(env) {
  const hull = hullTex(), it = interiorTex();
  const m = {
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, map: hull, metalness: 0.3, roughness: 0.45, envMap: env, envMapIntensity: 1.3 }),
    grit: new THREE.MeshStandardMaterial({ vertexColors: true, map: hull, metalness: 0.1, roughness: 0.75, envMap: env, envMapIntensity: 0.8 }),
    win: tintEmissive(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x303030, map: it, emissiveMap: it, emissive: 0xffffff, emissiveIntensity: 1.5, metalness: 0.7, roughness: 0.15, envMap: env, envMapIntensity: 1.2 })),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x1a4a70, metalness: 0.9, roughness: 0.08, envMap: env, envMapIntensity: 2, transparent: true, opacity: 0.5, depthWrite: false }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
    bay: new THREE.MeshBasicMaterial({ vertexColors: true, map: bayTex(), fog: true }),
    facade: facadeShader(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.3, envMap: env, envMapIntensity: 1.1, emissive: 0x000000 })),
  };
  // dimmed copies for locked features (neon keeps a hint of its hue)
  const locked = {};
  for (const [k, mat] of Object.entries(m)) {
    const d = mat.clone();
    d.onBeforeCompile = mat.onBeforeCompile; d.customProgramCacheKey = mat.customProgramCacheKey;
    if (d.isMeshBasicMaterial) d.color.setScalar(k === 'bay' ? 0.3 : 0.32);
    else { d.color.multiplyScalar(0.72); if (d.emissiveIntensity) d.emissiveIntensity *= 0.3; }
    locked[k] = d;
  }
  return { normal: m, locked };
}

// world-scale UVs on a BoxGeometry so tiled textures keep a constant texel size
function scaleBoxUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const j = f * 4 + i;
    uv.setXY(j, uv.getX(j) * dims[f][0] / s, uv.getY(j) * dims[f][1] / s);
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

export class Kit {
  constructor() { this.parts = {}; this.origin = new THREE.Vector3(); this.rot = 0; this.tint = null; }
  // local frame for the next adds (building origin + yaw)
  at(x, z, ry = 0, y = 0) { this.origin.set(x, y, z); this.rot = ry; return this; }
  // run fn with the frame moved by a local offset/yaw, then restore
  sub(x, z, ry, fn, y = 0) {
    const o = this.origin.clone(), r = this.rot, c = Math.cos(r), s = Math.sin(r);
    this.at(o.x + x * c + z * s, o.z - x * s + z * c, r + ry, o.y + y); fn(this); this.origin.copy(o); this.rot = r;
  }
  add(key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    _p.set(this.origin.x + x * c + z * s, this.origin.y + y, this.origin.z - x * s + z * c);
    _q.setFromEuler(_e.set(rx, ry + this.rot, rz, 'YXZ'));
    _m.compose(_p, _q, _s);
    if (geo.index) { const g2 = geo.toNonIndexed(); geo.dispose(); geo = g2; }
    geo.applyMatrix4(_m);
    const [mat, col, gain = 1] = PALETTE[key] || PALETTE.hull;
    if (this.tint && mat === 'facade') _c.setRGB(this.tint[0], this.tint[1], this.tint[2], THREE.LinearSRGBColorSpace);
    else _c.set(col).multiplyScalar(gain);
    const n = geo.attributes.position.count, ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { ca[i * 3] = _c.r; ca[i * 3 + 1] = _c.g; ca[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    (this.parts[mat] ||= []).push(geo);
    return geo;
  }
  // box sitting on y (bottom at y)
  box(key, w, h, d, x, y, z, ry = 0, uvs = 4) {
    const g = new THREE.BoxGeometry(w, h, d); scaleBoxUV(g, w, h, d, uvs);
    return this.add(key, g, x, y + h / 2, z, 0, ry, 0);
  }
  boxR(key, w, h, d, x, y, z, rx, ry, rz) { const g = new THREE.BoxGeometry(w, h, d); scaleBoxUV(g, w, h, d, 4); return this.add(key, g, x, y, z, rx, ry, rz); }
  cyl(key, rt, rb, h, x, y, z, seg = 12, open = false) { return this.add(key, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), x, y + h / 2, z); }
  cylR(key, r, h, x, y, z, rx, ry, rz, seg = 10) { return this.add(key, new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz); }
  sphere(key, r, x, y, z, seg = 12, phiLen = Math.PI) { return this.add(key, new THREE.SphereGeometry(r, seg * 2, seg, 0, Math.PI * 2, 0, phiLen), x, y, z); }
  torus(key, r, t, x, y, z, rx = Math.PI / 2, seg = 32, arc = Math.PI * 2, ry = 0) { return this.add(key, new THREE.TorusGeometry(r, t, 4, seg, arc), x, y, z, rx, ry, 0); }
  // flat window panel facing local +z (ry turns it), one texture repeat = one pane across and one floor up
  panel(key, w, h, x, y, z, ry = 0, pane = 1.3, floor = 2.4) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv; if (pane) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / (pane * 4), uv.getY(i) * Math.max(1, Math.round(h / floor)));
    return this.add(key, g, x, y + h / 2, z, 0, ry, 0);
  }
  // window bands on all four faces of a box footprint (w x d), floors from y0 to y1
  bands(key, w, d, y0, y1, floor = 2.4, inset = 0.04) {
    const h = y1 - y0;
    this.panel(key, w * 0.92, h, 0, y0, d / 2 + inset, 0, 1.3, floor); this.panel(key, w * 0.92, h, 0, y0, -d / 2 - inset, Math.PI, 1.3, floor);
    this.panel(key, d * 0.92, h, w / 2 + inset, y0, 0, Math.PI / 2, 1.3, floor); this.panel(key, d * 0.92, h, -w / 2 - inset, y0, 0, -Math.PI / 2, 1.3, floor);
  }
  // gable roof prism: ridge along x, rise above y
  gable(key, w, d, rise, x, y, z) {
    const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    return this.add(key, g, x, y, z);
  }
  // neon strip around the top edge of a box footprint
  rim(key, w, d, x, y, z, t = 0.12) {
    this.box(key, w + t, t, t, x, y, z - d / 2); this.box(key, w + t, t, t, x, y, z + d / 2);
    this.box(key, t, t, d, x - w / 2, y, z); this.box(key, t, t, d, x + w / 2, y, z);
  }
  // lit vertical corner edges
  edges(key, w, d, y, h, t = 0.14, front = false) {
    for (const sx of [-1, 1]) for (const sz of front ? [1] : [-1, 1]) this.box(key, t, h, t, sx * w / 2, y, sz * d / 2);
  }
  build(mats) {
    const group = new THREE.Group();
    for (const [key, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const norm = list.map((g) => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a); return g; });
      const geo = mergeGeometries(norm, false);
      list.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[key] || mats.metal);
      mesh.userData.matKey = key;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (key === 'glass') mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.parts = {};
    return group;
  }
}
