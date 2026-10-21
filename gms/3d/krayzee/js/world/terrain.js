import * as THREE from 'three';
import { fbm } from './util.js';
import { maskTexture, detailTexture, waterNormalTexture } from './textures.js';
import { RUNWAYS, headingToVec } from './layout.js';
import { SUN_DIR } from './env.js';
import { BLOCK, FIELD_SEED, TOWN_SEED, WOOD_T, FIELD_GLSL } from './fields.js';

export const EXTENT = 14000;
export const MAP_EXTENT = 4200;
export const SHADE_EXTENT = 4608;
export const FLAT_R = 3800;
export const LAKE = { x: -1700, z: -700, rx: 380, rz: 230 };
export const TOWN = { x0: -660, x1: 400, z0: -1900, z1: -1170 };
export const CASTLE = { x: 780, z: -2300, top: 70, r0: 125, r1: 640 };
const AIRFIELD_FLAT = { x0: -1050, x1: 1050, z0: -640, z1: 620 };
export const LONG_ROAD_Z = -1240;

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rectDist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

export function lakeR(a) { return 1 + 0.16 * Math.sin(2 * a + 1.1) + 0.09 * Math.sin(3 * a + 0.4) + 0.05 * Math.sin(5 * a + 2.3); }
export function lakeDist(x, z) {
  const u = (x - LAKE.x) / LAKE.rx, v = (z - LAKE.z) / LAKE.rz;
  return Math.hypot(u, v) / lakeR(Math.atan2(v, u));
}
export function inLake(x, z) { return lakeDist(x, z) < 1; }

export function castleMound(x, z) {
  const d = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  return CASTLE.top * (1 - sstep(CASTLE.r0, CASTLE.r1, d));
}

// 0 where the ground must be dead flat (airfield, town, lake, the long road), 1 in open country.
function openness(x, z) {
  let d = Math.min(rectDist(AIRFIELD_FLAT, x, z), rectDist(TOWN, x, z) + 40, Math.max(0, (lakeDist(x, z) - 1.35) * 300));
  if (Math.abs(x) < 3700) d = Math.min(d, Math.max(0, Math.abs(z - LONG_ROAD_Z) - 25));
  return sstep(0, 650, d);
}

export function terrainHeight(x, z) {
  const k = openness(x, z);
  let h = 0;
  if (k > 0) h = k * ((fbm(x / 1900 + 3.7, z / 1900 - 1.2, 3) - 0.45) * 46 + (fbm(x / 520 - 8, z / 520 + 5, 2) - 0.5) * 9);
  const d = Math.hypot(x, z);
  if (d > FLAT_R) {
    const t = Math.min(1, (d - FLAT_R) / 3500);
    const ramp = t * t * (3 - 2 * t);
    const n = fbm(x / 2600 + 11, z / 2600 - 3, 4);
    const ridge = 1 - Math.abs(fbm(x / 5200 - 7, z / 5200 + 2, 3) * 2 - 1);
    h += ramp * (30 + n * 220 + ridge * 160);
  }
  return h + castleMound(x, z);
}

export function airfieldMask(x, z) {
  const ex = Math.max(Math.abs(x) - 820, 0), ez = Math.max(Math.abs(z + 5) - 455, 0);
  const d = Math.hypot(ex, ez) - 40;
  return 1 - Math.min(1, Math.max(0, d / 10));
}

const RWV = new Map(RUNWAYS.map((rw) => [rw, headingToVec(rw.heading)]));
export function stripMaskFor(rw, x, z) {
  const [dx, dz] = RWV.get(rw);
  const rx = x - rw.center[0], rz = z - rw.center[2];
  const a = Math.abs(rx * dx + rz * dz) - rw.length / 2 - 60;
  const b = Math.abs(-rx * dz + rz * dx) - (rw.width >= 30 ? 75 : 40);
  return 1 - Math.min(1, Math.max(a, b, 0) / 6);
}
export const stripMask = (x, z) => Math.max(...RUNWAYS.map((rw) => stripMaskFor(rw, x, z)));

// Grid lines: power-law spacing (fine near the field) plus a refined band around the castle hill.
function gridLines(N, c0, c1, step) {
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const x = Math.sign(t) * Math.pow(Math.abs(t), 1.6) * EXTENT;
    if (x > c0 && x < c1) continue;
    out.push(x);
  }
  for (let x = c0; x <= c1; x += step) out.push(x);
  return Float32Array.from(out.sort((a, b) => a - b));
}

const hex = (h) => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

export function createTerrain(renderer, quality) {
  const low = quality === 'low';
  const N = low ? 120 : 176;
  const xs = gridLines(N, CASTLE.x - 560, CASTLE.x + 560, low ? 50 : 35);
  const zs = gridLines(N, CASTLE.z - 560, CASTLE.z + 560, low ? 50 : 35);
  const NX = xs.length, NZ = zs.length;
  const H = new Float32Array(NX * NZ);
  const pos = new Float32Array(NX * NZ * 3);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, y = terrainHeight(xs[i], zs[j]);
    H[k] = y;
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = y; pos[k * 3 + 2] = zs[j];
  }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
  let q = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mask = maskTexture(MAP_EXTENT, low ? 512 : 1024, (x, z) => [
    airfieldMask(x, z), Math.max(0, Math.min(1, (1.3 - lakeDist(x, z)) / 0.3)), stripMaskFor(RUNWAYS[0], x, z), stripMaskFor(RUNWAYS[1], x, z),
  ]);
  const detail = detailTexture(renderer);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = { uDetail: { value: detail }, uMask: { value: mask }, uShade: { value: blank }, uBump: { value: low ? 0 : 1 } };
  const r22 = RUNWAYS[1], [d22x, d22z] = headingToVec(r22.heading);

  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDetail, uMask, uShade; uniform float uBump;
        varying vec3 vW;
        float gH = 0.0, gBumpK = 0.0;
        ${FIELD_GLSL}
        float lineAA(float d, float hw) { float fw = max(fwidth(d), 1e-4); return clamp((hw - d) / fw + 0.5, 0.0, 1.0) * min(1.0, 2.0 * hw / fw); }
        float noWood(vec2 w) {
          float k = 0.0;
          ${RUNWAYS.map((rw) => { const [dx, dz] = headingToVec(rw.heading); return `{ vec2 r = w - vec2(${rw.center[0].toFixed(1)}, ${rw.center[2].toFixed(1)}); float a = abs(dot(r, vec2(${dx.toFixed(4)}, ${dz.toFixed(4)}))) - ${(rw.length / 2).toFixed(1)}; float b = abs(dot(r, vec2(${(-dz).toFixed(4)}, ${dx.toFixed(4)}))); k = max(k, step(0.0, a) * step(a, 3200.0) * step(b, 160.0 + a * 0.15)); }`; }).join('\n          ')}
          return k;
        }
        float stripes(float s, float period) { float fw = fwidth(s / period); return sign(sin(s / period * 3.14159)) * clamp(1.0 - fw * 1.6, 0.0, 1.0); }`)
      .replace('#include <map_fragment>', `
        vec2 w = vW.xz;
        float camD = length(vViewPosition);
        vec4 mk = texture(uMask, (w + ${MAP_EXTENT.toFixed(1)}) / ${(2 * MAP_EXTENT).toFixed(1)});
        vec4 dA = texture(uDetail, w / 2.3), dB = texture(uDetail, w / 9.7 + 0.31);
        float mac1 = texture(uDetail, w / 61.0 + 0.7).g, mac2 = texture(uDetail, w / 290.0 + 0.2).g, mac3 = texture(uDetail, w / 1530.0 + 0.5).b;
        float blade = mix(dA.r, dB.r, 0.4);
        vec3 col;

        // --- open country: field patchwork ---
        {
          vec2 q = w + warpOff(w);
          uint leaf, side; vec2 lp;
          float e = leafAt(q, ${BLOCK.toFixed(1)}, ${FIELD_SEED}u, 120.0, leaf, side, lp);
          int kind = leafKind(leaf);
          uint t2 = hsh(leaf ^ 0x9e3779b9u);
          float rv = float(t2 & 0xffffu) / 65535.0;
          float across = ((t2 >> 24) & 1u) == 1u ? lp.x : lp.y;
          vec3 c;
          if (kind == 0) c = mix(${hex('#557531')}, ${hex('#6a873a')}, rv);
          else if (kind == 1) c = mix(${hex('#7a8c44')}, ${hex('#949e56')}, rv);
          else if (kind == 2) c = mix(${hex('#b39a58')}, ${hex('#c7aa66')}, rv);
          else if (kind == 3) c = mix(${hex('#bfae76')}, ${hex('#cfbd86')}, rv);
          else if (kind == 4) c = mix(${hex('#6a523c')}, ${hex('#836448')}, rv);
          else if (kind == 5) c = mix(${hex('#c8b62e')}, ${hex('#d6c23a')}, rv);
          else if (kind == 6) c = mix(${hex('#4c7a28')}, ${hex('#5b882e')}, rv);
          else c = ${hex('#2e4423')};
          float wk = 0.86 + 0.28 * mac1;
          if (kind == 7) {
            c *= (0.75 + 0.5 * texture(uDetail, w / 55.0).b) * (1.0 + 0.15 * stripes(across, 3.5));
          } else {
            float mac4 = texture(uDetail, w / 700.0 + vec2(rv)).g;
            c *= wk * (0.82 + 0.36 * mac2) * (0.9 + 0.2 * mac4);
            c = mix(c, c * vec3(1.1, 1.05, 0.8), smoothstep(0.55, 0.8, mac4) * 0.4);
            if (kind >= 2 && kind <= 5) {
              c *= 1.0 + stripes(across, kind == 4 ? 1.4 : 0.9) * (kind == 4 ? 0.09 : 0.05);
              float tl = abs(mod(across + rv * 24.0, 24.0) - 12.0);
              c *= 1.0 - lineAA(abs(tl - 0.9), 0.22) * (kind == 4 ? 0.0 : 0.22);
              c = mix(c, c * vec3(0.9, 1.02, 0.8), smoothstep(0.35, 0.75, mac1) * 0.5);
              c = mix(c, ${hex('#6c8a3a')} * (0.9 + 0.2 * mac1), lineAA(e, 3.0 + 3.0 * rv) * 0.4);
            } else if (kind == 1 && rv > 0.5) {
              c *= 1.0 + 0.07 * stripes(across, 5.0);
            } else {
              c = mix(c, c * vec3(1.18, 1.12, 0.88), smoothstep(0.6, 0.85, texture(uDetail, w / 23.0).g) * 0.55);
              c = mix(c, c * 0.82, smoothstep(0.62, 0.8, texture(uDetail, w / 7.3 + 0.2).b) * 0.35);
            }
          }
          bool hedge = (side & 0xffu) < 210u;
          float hw = 1.5 + 1.5 * float((side >> 16) & 0xffu) / 255.0;
          float hedgeN = texture(uDetail, w / 33.0).b;
          vec3 hc = mix(${hex('#1f3018')}, ${hex('#3a5224')}, hedgeN);
          if (hedge) c = mix(c, hc, lineAA(e, hw * (0.7 + 0.6 * hedgeN)));
          else c = mix(c, c * 0.72, lineAA(e, 0.3));
          float wn = woodsN(w);
          float wood = smoothstep(${(WOOD_T - 0.012).toFixed(4)}, ${(WOOD_T + 0.004).toFixed(4)}, wn) * (1.0 - noWood(w)) * (1.0 - step(0.01, mk.g));
          if (kind == 7) c = mix(c, mix(${hex('#56732f')}, ${hex('#7f9046')}, rv) * wk, noWood(w));
          float cr1 = texture(uDetail, w / 70.0).b, cr2 = texture(uDetail, w / 190.0 + 0.4).b;
          vec3 canopy = mix(${hex('#25391b')}, ${hex('#52742f')}, smoothstep(0.15, 0.85, cr1 * 0.7 + cr2 * 0.5)) * (0.8 + 0.4 * mac2) * (0.85 + 0.3 * mac3);
          const vec2 SUNXZ = vec2(${(-SUN_DIR.x / SUN_DIR.y).toFixed(4)}, ${(-SUN_DIR.z / SUN_DIR.y).toFixed(4)});
          float lit = 1.0 - smoothstep(${(WOOD_T - 0.01).toFixed(4)}, ${(WOOD_T + 0.004).toFixed(4)}, woodsN(w - SUNXZ * 9.0));
          canopy *= 1.0 + 0.45 * lit;
          float wsh = smoothstep(${(WOOD_T - 0.008).toFixed(4)}, ${(WOOD_T + 0.004).toFixed(4)}, woodsN(w - SUNXZ * 14.0)) * (1.0 - noWood(w - SUNXZ * 14.0));
          c *= 1.0 - 0.5 * wsh;
          canopy = mix(canopy, ${hex('#3d4f2a')}, smoothstep(0.5, 0.8, mac1) * 0.35);
          c = mix(c, canopy, wood);
          col = c;
        }

        // --- village gardens ---
        vec4 shadeT = texture(uShade, (w + ${SHADE_EXTENT.toFixed(1)}) / ${(2 * SHADE_EXTENT).toFixed(1)});
        float town = smoothstep(0.25, 0.7, shadeT.g);
        if (town > 0.0) {
          uint gl, gs; vec2 glp;
          float e = leafAt(w + vec2(13.0, 7.0), 72.0, ${TOWN_SEED}u, 13.0, gl, gs, glp);
          float rg = float(hsh(gl) & 0xffffu) / 65535.0;
          vec3 g = mix(${hex('#5e8636')}, ${hex('#76984a')}, rg);
          if (rg > 0.84) g = mix(${hex('#5d4a36')}, ${hex('#6f8040')}, 0.5 + 0.5 * stripes(glp.x, 0.6));
          else if (rg < 0.05) g = ${hex('#8f8b80')};
          else if (rg < 0.18) g = mix(${hex('#7f8c48')}, ${hex('#93995a')}, mac1);
          g *= 0.9 + 0.2 * mac1;
          g = mix(g, ${hex('#2b4220')}, lineAA(e, (gs & 3u) == 0u ? 0.2 : 0.75));
          col = mix(col, g, town);
        }

        // --- airfield grass: fine mown, stripes along each runway ---
        if (mk.r > 0.0) {
          float am = texture(uDetail, w / 170.0 + 0.3).g;
          vec3 gr = mix(${hex('#476628')}, ${hex('#5f7d36')}, smoothstep(0.25, 0.75, mac1 * 0.6 + am * 0.6)) * (0.86 + 0.24 * mac2);
          gr = mix(gr, gr * vec3(1.18, 1.1, 0.78), smoothstep(0.55, 0.8, texture(uDetail, w / 37.0 + 0.1).g) * 0.55);
          gr = mix(gr, gr * vec3(0.82, 0.9, 0.85), smoothstep(0.6, 0.85, texture(uDetail, w / 97.0 + 0.6).b) * 0.4);
          float strip = max(mk.b, mk.a);
          gr = mix(gr * vec3(0.9, 0.93, 0.85) * (0.9 + 0.2 * texture(uDetail, w / 29.0 + 0.4).b), gr * vec3(1.06, 1.08, 1.0), strip);
          gr *= 1.0 + 0.03 * stripes(w.x, 9.0) * (1.0 - strip);
          gr *= 1.0 + 0.065 * stripes(w.y, 6.0) * mk.b;
          gr *= 1.0 + 0.065 * stripes(dot(w - vec2(${r22.center[0].toFixed(1)}, ${r22.center[2].toFixed(1)}), vec2(${(-d22z).toFixed(4)}, ${d22x.toFixed(4)})), 5.0) * mk.a * (1.0 - mk.b);
          col = mix(col, gr, mk.r);
        }

        // lake shore: wet mud and reeds
        col = mix(col, mix(${hex('#4a4a2c')}, ${hex('#5b6a30')}, texture(uDetail, w / 5.0).b), smoothstep(0.55, 0.95, mk.g) * 0.85);

        // fine grass/soil grain, strongest close up
        float near = 1.0 - smoothstep(60.0, 900.0, camD);
        float close = 1.0 - smoothstep(4.0, 45.0, camD);
        col *= mix(1.0, 0.72 + 0.56 * blade, 0.35 + 0.65 * near);
        float tuft = texture(uDetail, w / 0.9 + 0.13).r, clump = texture(uDetail, w / 5.3 + 0.5).b, patchy = texture(uDetail, w / 17.0 + 0.27).g;
        col *= mix(1.0, (0.62 + 0.76 * tuft) * (0.84 + 0.32 * clump), close * (0.5 + 0.5 * mk.r));
        col = mix(col, col * vec3(1.2, 1.08, 0.72), smoothstep(0.55, 0.8, patchy) * (0.25 + 0.35 * near) * mk.r);
        col = mix(col, col * vec3(0.8, 0.92, 0.86), smoothstep(0.6, 0.85, texture(uDetail, w / 23.0 + 0.71).b) * near * 0.25 * mk.r);
        vec3 vdir = normalize(vW - cameraPosition);
        float graze = pow(1.0 - abs(vdir.y), 4.0) * (1.0 - smoothstep(800.0, 4000.0, camD));
        col = mix(col, vec3(0.32, 0.36, 0.2) * (0.9 + 0.2 * mac1), graze * 0.35);
        col *= 0.9 + 0.2 * mac3;
        col *= 1.0 - 0.6 * shadeT.r;
        gH = blade * 0.5 + tuft * 0.5 + clump * 0.4;
        gBumpK = uBump * (1.0 - smoothstep(15.0, 90.0, camD));
        diffuseColor.rgb = col;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gBumpK > 0.0) {
          vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
          float hx = dFdx(gH) * gBumpK * 0.1, hy = dFdy(gH) * gBumpK * 0.1;
          vec3 r1 = cross(py, normal), r2 = cross(normal, px);
          float det = dot(px, r1);
          normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2));
        }`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = -10;
  mesh.name = 'terrain';

  function heightAt(x, z) {
    if (x <= xs[0] || x >= xs[NX - 1] || z <= zs[0] || z >= zs[NZ - 1]) return terrainHeight(x, z);
    const fi = gridIndex(xs, x), fj = gridIndex(zs, z);
    const i = fi | 0, j = fj | 0;
    const u = fi - i, v = fj - j;
    const h00 = H[j * NX + i], h10 = H[j * NX + i + 1], h01 = H[(j + 1) * NX + i], h11 = H[(j + 1) * NX + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  return { mesh, heightAt, uniforms };
}

function gridIndex(xs, x) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return lo + (x - xs[lo]) / (xs[hi] - xs[lo]);
}

// Lake: PBR water (sky reflection from the env map, fresnel from the BRDF), two scrolling ripple normals,
// shallow-water tint toward the shore.
export function createLake(renderer, env) {
  const n = 96, rings = 6;
  const pos = [LAKE.x, 0.12, LAKE.z], nor = [0, 1, 0], shore = [0], idx = [];
  for (let r = 1; r <= rings; r++) {
    const f = Math.pow(r / rings, 0.7);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, u = Math.cos(a), v = Math.sin(a), R = lakeR(a);
      pos.push(LAKE.x + u * LAKE.rx * R * f, 0.12, LAKE.z + v * LAKE.rz * R * f);
      nor.push(0, 1, 0);
      shore.push(r / rings);
    }
  }
  for (let k = 0; k < n; k++) idx.push(0, 1 + (k + 1) % n, 1 + k);
  for (let r = 1; r < rings; r++) for (let k = 0; k < n; k++) {
    const a = 1 + (r - 1) * n + k, b = 1 + (r - 1) * n + (k + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('shore', new THREE.Float32BufferAttribute(shore, 1));
  g.setIndex(idx);
  const uniforms = { uTime: { value: 0 }, uRipple: { value: waterNormalTexture(renderer) } };
  const m = new THREE.MeshStandardMaterial({
    color: '#16303a', roughness: 0.05, metalness: 0, envMap: env, envMapIntensity: 1.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shore; varying float vShore; varying vec2 vWXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvShore = shore; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D uRipple; varying float vShore; varying vec2 vWXZ;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.15, 0.08), smoothstep(0.7, 1.0, vShore) * 0.8);`)
      .replace('#include <normal_fragment_maps>', `
        vec2 r1 = texture2D(uRipple, vWXZ / 19.0 + vec2(uTime * 0.013, uTime * 0.005)).xy * 2.0 - 1.0;
        vec2 r2 = texture2D(uRipple, mat2(0.8, 0.6, -0.6, 0.8) * vWXZ / 53.0 - vec2(uTime * 0.007, -uTime * 0.009)).xy * 2.0 - 1.0;
        vec2 rp = (r1 + r2) * 0.16 * (1.0 - 0.75 * smoothstep(200.0, 2500.0, length(vViewPosition)));
        normal = normalize((viewMatrix * vec4(normalize(vec3(rp.x, 1.0, rp.y)), 0.0)).xyz);`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = -9;
  mesh.name = 'lake';
  return { mesh, uniforms };
}
