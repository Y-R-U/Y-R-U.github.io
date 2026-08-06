// Sea surface — C1 owns this file. Radial LOD, analytic sky reflection, sea state.
//
// This is new code. FORGE's water.js is a creek shader keyed off shoreline-depth attributes an
// open ocean has no source for (REVIEW.md S1); only the technique is borrowed — a tiling ripple
// normal sampled twice decorrelated, the normal flattening and roughness rising with distance,
// and a glint lobe. No SSR, no refraction, no planar reflection: the reflection is skyColour()
// evaluated along the reflected ray, which is exact, free, and follows the sky grade for nothing.
//
// The grid is one polar mesh centred on the camera whose rings grow geometrically, so triangle
// density falls off the way screen-space error does. Water ends at ~1.4 km; past that the dome's
// below-horizon haze is the horizon (BUILD_PLAN §7.2).

import * as THREE from 'three';
import { Field, clamp } from './textures/noise.js';
import { track } from '../engine/budget.js';
import { trackAniso } from './textures/bake.js';
import { SEA_STATES } from '../config.js';
import { SKY_GLSL, skyUniforms, onGrade, GRADES } from './sky.js';
import { defineScenario, frameCamera } from '../scenarios.js';

const RS = 256;
const NW = 5;
const R_MIN = 3;
const R_MAX = 1500;

// direction (unit), wavelength in metres, amplitude fraction of the sea state's `amp`
const WAVES = [
  { dir: [0.94, 0.34], len: 74, amp: 1.00 },
  { dir: [0.72, -0.69], len: 41, amp: 0.52 },
  { dir: [0.99, -0.14], len: 23, amp: 0.26 },
  { dir: [0.42, 0.91], len: 13, amp: 0.13 },
  { dir: [0.85, 0.53], len: 7, amp: 0.06 },
];

let ripple = null;
function rippleTexture() {
  if (ripple) return ripple;
  const crest = new Field({ size: RS, period: 4, octaves: 3, gain: 0.52, seed: 211 });
  const chop = new Field({ size: RS, period: 7, octaves: 3, gain: 0.5, seed: 617 });
  const lace = new Field({ size: RS, period: 3, octaves: 3, gain: 0.6, seed: 929 });

  const h = new Float32Array(RS * RS);
  const a = new Float32Array(RS * RS);
  for (let y = 0; y < RS; y++) {
    const v = y / RS;
    for (let x = 0; x < RS; x++) {
      const u = x / RS;
      h[y * RS + x] = 0.62 * crest.at(u, v * 2) + 0.38 * chop.at(u * 3, v * 2);
      // chop is period 7 over 3 octaves — 4.6 texels per lattice cell at 1:1. Sampling it at 2x
      // halved that, and Field.at is bilinear on a value-noise lattice, so the axis-aligned box
      // artefact got baked into the alpha where no filter can reach it.
      a[y * RS + x] = 0.7 * lace.at(u, v) + 0.3 * chop.at(u, v);
    }
  }
  let lo = 1, hi = 0;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo || 1);

  // DataTexture, not a canvas: a 2D canvas premultiplies alpha and would quantise the normal
  // stored in the RGB next to it.
  const px = new Uint8Array(RS * RS * 4);
  for (let y = 0; y < RS; y++) {
    const yU = (y + RS - 1) % RS, yD = (y + 1) % RS;
    for (let x = 0; x < RS; x++) {
      const xL = (x + RS - 1) % RS, xR = (x + 1) % RS;
      const nx = (h[y * RS + xL] - h[y * RS + xR]) * RS * 0.5;
      const ny = (h[yD * RS + x] - h[yU * RS + x]) * RS * 0.5;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * RS + x) * 4;
      px[i] = (nx * inv * 0.5 + 0.5) * 255;
      px[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      px[i + 2] = (inv * 0.5 + 0.5) * 255;
      px[i + 3] = clamp(a[y * RS + x], 0, 1) * 255;
    }
  }

  ripple = new THREE.DataTexture(px, RS, RS, THREE.RGBAFormat, THREE.UnsignedByteType);
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.colorSpace = THREE.NoColorSpace;
  ripple.generateMipmaps = true;
  ripple.minFilter = THREE.LinearMipmapLinearFilter;
  ripple.magFilter = THREE.LinearFilter;
  ripple.needsUpdate = true;
  trackAniso(ripple);
  track(ripple, { w: RS, h: RS, fmt: 'rgba', mips: true, label: 'sea:ripple' });
  return ripple;
}

// A polar fan whose radii grow geometrically: one draw call, triangle area roughly tracking
// screen-space area, and no LOD seam to stitch. `steps` is capped so the ultra tier cannot walk
// past the 40k sub-budget.
function radialGrid(segs, rings) {
  const steps = Math.min(Math.round(segs * 0.72) + rings * 4, Math.floor(17500 / segs));
  const growth = Math.pow(R_MAX / R_MIN, 1 / steps);
  const radii = [0];
  for (let i = 0; i <= steps; i++) radii.push(R_MIN * Math.pow(growth, i));
  // Three flat skirt rings past R_MAX. Without them the polygonal outer boundary sits a degree
  // below the horizon and shows as notches along the skyline.
  radii.push(R_MAX * 2.4, R_MAX * 7, R_MAX * 26);

  const pos = new Float32Array(radii.length * segs * 3);
  for (let r = 0; r < radii.length; r++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const i = (r * segs + s) * 3;
      pos[i] = Math.cos(a) * radii[r];
      pos[i + 1] = 0;
      pos[i + 2] = Math.sin(a) * radii[r];
    }
  }

  const quads = (radii.length - 1) * segs;
  const idx = new Uint32Array(quads * 6);
  let k = 0;
  for (let r = 0; r < radii.length - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      const a = r * segs + s, b = r * segs + s1, c = (r + 1) * segs + s, d = (r + 1) * segs + s1;
      // wound so the face normal is +Y — the other way round the whole sea is back-facing and
      // culled, which shows up as the sky dome simply carrying on below the horizon
      idx[k++] = a; idx[k++] = d; idx[k++] = c;
      idx[k++] = a; idx[k++] = b; idx[k++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R_MAX * 27);
  return geo;
}

const WAVE_GLSL = `
// s01 sharpened by one lerp toward its square rather than by pow(): five pow() calls per fragment
// is a real cost on a phone, and this is differentiable in closed form, which heightAt() needs.
#define WSHAPE(s) ((s) + uSharp * ((s) * (s) - (s)))
#define WSLOPE(s) (1.0 + uSharp * (2.0 * (s) - 1.0))
`;

const VERT = `
${WAVE_GLSL}
uniform float uTime, uAmp, uChop, uSharp, uFadeNear, uFadeFar, uWaveSum;
uniform vec4 uWave[${NW}];
varying vec3 vWorld;
varying float vDist;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float d = length(wp.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);

  float h = 0.0;
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uWave[i];
    float s01 = 0.5 + 0.5 * sin(dot(w.xy, wp.xz) * w.z - uTime * sqrt(9.81 * w.z));
    h += w.w * (2.0 * WSHAPE(s01) - 1.0);
  }

  wp.y += h * uAmp * fade;
  vWorld = wp.xyz;
  vDist = d;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = `
${SKY_GLSL}
${WAVE_GLSL}
uniform float uAmp, uChop, uSharp, uWaveSum, uLodA, uLodB;
uniform vec4 uWave[${NW}];
uniform sampler2D uRipple;
uniform vec3 uDeep, uShallow, uSSS, uCapCol, uSunCol, uHaze;
uniform float uTime, uRipScale, uRipSpeed, uRipAmp, uRipFar, uRipN, uRipF, uRipRef, uRipLod, uLaceScale;
uniform float uRough, uRoughFar, uGlint, uGlintMax, uF0, uCapT, uCapAmt, uSSSAmt, uRefl, uSparkle, uHazeSky, uReflBlur;
uniform float uCapAmb, uCapSun;
uniform float uFlatA, uFlatB, uHazePow;
uniform vec3 uFogK;
uniform float uSeaLightDiff, uDebug;
uniform vec4 uSeaLight[2];
uniform vec3 uSeaLightCol[2];
varying vec3 vWorld;
varying float vDist;

float lobe(float ndh, float r) {
  float a = max(r * r, 1e-5);
  float d = ndh * ndh * (a - 1.0) + 1.0;
  return a / (d * d);
}

// Per fragment, not per vertex. Interpolating the swell normal across the polar grid's long
// radial triangles draws the spokes as corduroy on the water at grazing angles — the single
// worst artefact this shader had. Each component fades out on its own wavelength, which is the
// LOD that stops the short waves aliasing into speckle at distance.
void waveField(vec2 p, float dist, out vec3 n, out float crest) {
  vec2 g = vec2(0.0);
  float peak = 0.0;
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uWave[i];
    float len = 6.2831853 / w.z;
    float lod = 1.0 - smoothstep(len * uLodA, len * uLodB, dist);
    float s01 = 0.5 + 0.5 * sin(dot(w.xy, p) * w.z - uTime * sqrt(9.81 * w.z));
    peak += w.w * WSHAPE(s01) * lod;
    g += w.xy * (w.w * w.z * WSLOPE(s01) * cos(dot(w.xy, p) * w.z - uTime * sqrt(9.81 * w.z)) * lod);
  }
  g *= uAmp * uChop;
  n = normalize(vec3(-g.x, 1.0, -g.y));
  crest = peak / uWaveSum;
}

// Two octaves of the one ripple tile, crossfaded on log2(distance). uRipLod < 1 so the detail
// still shrinks with distance — that is the size cue — but slower than 1/d, so it never falls
// under the mip floor and aliases into a weave.
// 26 deg and 59 deg. Not 90 apart: two layers at right angles still weave, they just weave on a
// rotated grid, and that grid was the lattice a critic saw in the near band.
const mat2 RIP_A = mat2(0.8988, 0.4384, -0.4384, 0.8988);
const mat2 RIP_B = mat2(0.5150, 0.8572, -0.8572, 0.5150);

// Both octaves must be the SAME mapping at different scales, or octave n's fine layer and octave
// n+1's coarse layer are different fields at the same size and the crossfade lands as a horizontal
// seam under the horizon. The time offset divides by s with the position for the same reason.
vec2 ripGrad(vec2 p, float s, float t) {
  return texture2D(uRipple, (RIP_A * p + t * vec2(0.031, 0.017)) / s).xy - 0.5;
}

void detail(vec2 p, float dist, out vec2 grad) {
  float o = max(uRipLod * log2(max(dist, 1.0) / uRipRef), 0.0);
  float f = fract(o);
  float sA = exp2(floor(o));
  float t = uTime * uRipSpeed;
  // sqrt weights, not linear: two uncorrelated layers at 0.5/0.5 sum to 0.71 of one layer's RMS
  // and the surface visibly flattens halfway through every octave
  grad = ripGrad(p, sA, t) * (2.0 * sqrt(1.0 - f)) + ripGrad(p, sA * 2.0, t) * (2.0 * sqrt(f));
}

void main() {
  vec3 V = normalize(vWorld - cameraPosition);
  // A distance LOD alone cannot flatten a sea, because what a pixel covers at the waterline is set
  // by grazing angle, not by range: a metre of world spans dist/(-V.y) times more screen at 1 km
  // than at 100 m. Every slope term is faded on log2 of that ratio, so surface detail, sparkle and
  // foam all die into the horizon together and Fresnel is free to reach 1 — which is what makes
  // the waterline a convergence instead of an edge.
  // not named flat: that is GLSL ES 3.0's interpolation qualifier and will not compile.
  float flatten = smoothstep(uFlatA, uFlatB, log2(vDist / max(-V.y, 0.0015)));
  float sharpness = 1.0 - flatten;
  vec3 vSwellN; float vCrest;
  waveField(vWorld.xz, vDist, vSwellN, vCrest);
  vSwellN = normalize(vec3(vSwellN.x * sharpness, vSwellN.y, vSwellN.z * sharpness));
  float near = 1.0 - smoothstep(uRipN, uRipF, vDist);
  vec2 uv = vWorld.xz * uRipScale;
  vec2 rg;
  detail(uv, vDist, rg);
  vec2 rgRaw = rg;
  rg *= uRipAmp * mix(uRipFar, 1.0, near) * sharpness;
  vec3 N = normalize(vSwellN + vec3(rg.x, 0.0, rg.y));

  float rough = mix(uRough, uRoughFar, smoothstep(uRipN * 0.4, uRipF * 1.6, vDist));
  float ndv = max(dot(N, -V), 0.0);
  // uRefl is the geometric masking a microfacet model would give, as one authored number per grade
  float F = clamp(uF0 + (1.0 - uF0) * pow(1.0 - ndv, 5.0), 0.0, 1.0) * uRefl;

  vec3 R = reflect(V, N);
  // Roughness lifts the reflected ray. A rough sea at 3 deg grazing cannot mirror the horizon
  // line — it averages a cone a few degrees wide, and the half of that cone aimed higher sees a
  // darker sky. That single term is what puts a far-bright / near-dark gradient on the water,
  // which is the thing the sunset plate has and a flat sheet of horizon colour never will.
  vec3 sky = skyColour(normalize(vec3(R.x, max(R.y, 0.002) + rough * uReflBlur, R.z)), 0.0);
  // A ray aimed under the horizon is a wave looking at the next wave — but that wave is itself
  // mostly reflecting the sky just above the horizon, so the fallback is a dimmed horizon sky and
  // not the deep-water colour, and the ramp is tight around R.y = 0. The old -0.10..0.30 ramp put
  // the far field, where Fresnel is near 1 and the reflection carries the whole image, at
  // open ≈ 0.17: the sky term was wired correctly and then multiplied out.
  // Off the swell normal, not off N — feeding the ripple in makes every ripple facet flip across
  // the ramp independently, which comes out as salt-and-pepper.
  float open = smoothstep(-0.05, 0.02, reflect(V, vSwellN).y);
  vec3 refl = mix(sky * 0.42 + uDeep * 0.6, sky, open);

  vec3 body = mix(uDeep, uShallow, smoothstep(0.35, 0.95, vCrest));
  // light bleeding through the back of a crest toward the camera
  float through = pow(max(0.0, dot(-V, normalize(vec3(uSunDir.x, -0.25, uSunDir.z)))), 4.0);
  body += uSSS * uSSSAmt * through * smoothstep(0.45, 0.95, vCrest);

  vec3 col = mix(body, refl, F);

  // seaDebug: 1 = what the sky reflection actually contributes, 2 = Fresnel, 3 = the open ramp,
  // 4 = the detail-normal deflection. Isolating a term is the only way to tell "wired wrong" from
  // "wired right and multiplied out".
  if (uDebug > 0.5) {
    if (uDebug < 1.5) col = refl * F;
    else if (uDebug < 2.5) col = vec3(F);
    else if (uDebug < 3.5) col = vec3(open);
    else col = vec3(abs(rg.x), 0.0, abs(rg.y)) * 3.0;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // Sparkle rides the detail octave at its raw amplitude rather than a fetch of its own. The old
  // separate, deliberately un-mipped sample drew a regular diamond lattice down the glitter path —
  // a periodic tile at grazing incidence beats against the pixel grid — and being outside the LOD
  // it stayed the same size at 300 m and at 3 km.
  vec3 Ng = normalize(N + vec3(rgRaw.x, 0.0, rgRaw.y) * uSparkle * sharpness);
  float sunUp = smoothstep(-0.03, 0.09, uSunDir.y);
  vec3 H = normalize(uSunDir - V);
  col += uSunCol * uGlint * min(lobe(max(dot(Ng, H), 0.0), rough), uGlintMax) * sunUp;

  for (int i = 0; i < 2; i++) {
    vec3 rel = uSeaLight[i].xyz - vWorld;
    float dist = length(rel) + 1e-3;
    vec3 L = rel / dist;
    // 1/(r+d) not 1/d^2: the reflected streak has to survive out to the horizon, which is the
    // whole subject of a night sea
    float att = uSeaLight[i].w / (uSeaLight[i].w + dist);
    vec3 c = uSeaLightCol[i];
    col += c * att * att * max(dot(N, L), 0.0) * uSeaLightDiff;
    vec3 Hl = normalize(L - V);
    col += c * min(lobe(max(dot(N, Hl), 0.0), rough * 1.35), uGlintMax) * att * 0.045;
  }

  // Foam laces off its own world-locked field, deliberately NOT the LOD'd one: a whitecap is a
  // physical patch a few metres across, so it has to shrink on screen with distance. The old
  // lace tile was 45 m and produced the same blob size at 30 m and at 600 m.
  vec4 rl = texture2D(uRipple, RIP_B * uv * uLaceScale + uTime * uRipSpeed * vec2(0.011, 0.006));
  float lace = rl.w;
  // the threshold widens with distance so a crest edge never resolves onto one pixel and steps
  float cw = 0.20 + vDist * 0.0022;
  float cap = smoothstep(uCapT, uCapT + cw, vCrest * (0.30 + 1.05 * lace)) * uCapAmt;
  cap *= smoothstep(0.35, 0.65, vCrest);
  cap *= mix(0.16, 1.0, near) * sharpness;
  // uCapCol is the foam's ALBEDO, not its pixel value. A whitecap is air in water — a rough white
  // lambertian surface lit by the sun and the whole upper sky — so under a noon sun it is the
  // brightest thing in frame and it has to survive the grade's exposure. Held as a constant it
  // tone-mapped to one triplet (measured: 157,173,179 over 2.20% of a foreground, 19 byte-identical
  // rows) and no sea pixel anywhere reached luma 200.
  vec3 capLit = uCapCol * (uCapAmb + uCapSun * smoothstep(-0.02, 0.22, uSunDir.y));
  // capped under 1: foam that reaches full opacity is a decal, not water with air in it
  col = mix(col, capLit, clamp(cap, 0.0, 0.90));

  // Airlight: an authored tint blended with the sky's own colour just above the horizon in the
  // same azimuth. Pure authored colour leaves a hard step at the skyline; skyColour() would cost
  // a second full evaluation with its cloud fetches, and skyBase() is texture-free.
  // Extinction is per channel — one scalar makes distance a pure desaturation, and the difference
  // between a noon horizon and a sunset horizon is mostly which channel survives the trip.
  vec3 fg = 1.0 - exp(-vDist * uFogK);
  // Airlight integrated over a long enough path IS the sky radiance in that direction, so the
  // authored tint has to give way to the sky as the path runs out — otherwise the waterline is a
  // hard value step, which is the one edge in these shots a viewer's eye lands on first.
  float pathT = max(fg.r, max(fg.g, fg.b));
  vec3 hz = mix(uHaze, skyBase(normalize(vec3(V.x, 0.010, V.z))),
                uHazeSky + (1.0 - uHazeSky) * pow(pathT, uHazePow));
  col = mix(col, hz, fg);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildOcean(quality) {
  const object3D = new THREE.Group();
  object3D.name = 'ocean';

  const u = {
    uTime: { value: 0 },
    uRipple: { value: rippleTexture() },
    uWave: { value: Array.from({ length: NW }, () => new THREE.Vector4()) },
    uWaveSum: { value: 1 },
    uAmp: { value: 1 },
    uChop: { value: 1 },
    uSharp: { value: 0.45 },
    uLodA: { value: 14 },
    uLodB: { value: 46 },
    uFadeNear: { value: 55 },
    uFadeFar: { value: 300 },
    uRipScale: { value: 1 / 11 },
    uRipSpeed: { value: 0.9 },
    uRipAmp: { value: 0.1 },
    uRipFar: { value: 0.34 },
    uRipN: { value: 60 },
    uRipF: { value: 420 },
    // metres at which the base detail octave is the right size; the LOD walks from here
    uRipRef: { value: 55 },
    uRipLod: { value: 0.55 },
    uLaceScale: { value: 1.1 },
    uRough: { value: 0.075 },
    uRoughFar: { value: 0.3 },
    uGlint: { value: 0.055 },
    uGlintMax: { value: 900 },
    uF0: { value: 0.021 },
    uFogK: { value: new THREE.Vector3(0.00135, 0.00135, 0.00135) },
    uCapT: { value: 0.62 },
    uCapAmt: { value: 1 },
    // foam irradiance: sky-only floor, plus the sun's share once it is above the horizon
    uCapAmb: { value: 1.0 },
    uCapSun: { value: 2.0 },
    uSSSAmt: { value: 1 },
    uRefl: { value: 0.7 },
    uSparkle: { value: 0.12 },
    uReflBlur: { value: 0.55 },
    // log2(dist / -V.y) at which surface slope starts and finishes flattening into the horizon
    uFlatA: { value: 13.5 },
    uFlatB: { value: 17 },
    uHazePow: { value: 2 },
    uSeaLightDiff: { value: 1.5 },
    uDebug: { value: 0 },
    uDeep: { value: new THREE.Color('#0a2231') },
    uShallow: { value: new THREE.Color('#20495c') },
    uSSS: { value: new THREE.Color('#2f6f74') },
    uCapCol: { value: new THREE.Color('#dbe6ea') },
    uSunCol: { value: new THREE.Color('#fff0d6') },
    uHaze: { value: new THREE.Color('#767b7f') },
    uHazeSky: { value: 0.5 },
    uSeaLight: { value: [new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1)] },
    uSeaLightCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
  };
  Object.assign(u, skyUniforms());

  const material = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG, fog: false,
  });

  let mesh = null;
  const rebuild = () => {
    const segs = Math.max(24, Math.round(quality.get('oceanSegs') ?? 96));
    const rings = Math.max(1, Math.round(quality.get('oceanRings') ?? 3));
    mesh?.geometry.dispose();
    const geo = radialGrid(segs, rings);
    if (mesh) mesh.geometry = geo;
    else { mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; object3D.add(mesh); }
  };
  rebuild();

  // -1 means 'whatever the grade asked for'. A knob that applies its default at registration
  // would otherwise pin the sea state and the grade could never set it.
  let stateIdx = 2, stateOverride = -1, chopTune = 1, glintTune = 1, hazeTune = 1, ripTune = 1;

  const applyWaves = () => {
    const s = SEA_STATES[stateIdx];
    let sum = 0;
    for (let i = 0; i < NW; i++) {
      const w = WAVES[i];
      const k = (Math.PI * 2) / w.len;
      u.uWave.value[i].set(w.dir[0], w.dir[1], k, w.amp * s.amp);
      sum += w.amp * s.amp;
    }
    u.uWaveSum.value = sum;
    u.uAmp.value = 1;
    u.uChop.value = s.chop * chopTune;
    u.uSharp.value = clamp(0.15 + s.chop * 0.55, 0, 1);
  };

  const setFog = p => {
    const t = p.fogTint ?? [1, 1, 1];
    u.uFogK.value.set(p.fogK * t[0], p.fogK * t[1], p.fogK * t[2]).multiplyScalar(hazeTune);
  };

  let flattenOverride = null;
  let lastGrade = null;

  const applyGrade = g => {
    lastGrade = g;
    const p = g.sea;
    u.uDeep.value.set(p.deep); u.uShallow.value.set(p.shallow);
    u.uSSS.value.set(p.sss); u.uCapCol.value.set(p.cap);
    u.uSunCol.value.set(p.glintCol ?? g.sun.colour);
    u.uHaze.value.set(p.haze);
    u.uHazeSky.value = p.hazeSky ?? 0.5;
    u.uHazePow.value = p.hazePow ?? 2;
    // survives applyGrade, or this is D15 again: a scenario sets it, a sky knob re-fires the
    // grade listeners, and the grade quietly wins
    u.uFlatA.value = flattenOverride ? flattenOverride[0] : p.graze?.[0] ?? 13.5;
    u.uFlatB.value = flattenOverride ? flattenOverride[1] : p.graze?.[1] ?? 17;
    u.uRefl.value = p.refl;
    u.uSparkle.value = p.sparkle ?? 0.12;
    u.uReflBlur.value = p.reflBlur ?? 0.55;
    setFog(p);
    u.uGlint.value = p.glint * glintTune;
    u.uRough.value = p.rough;
    u.uRoughFar.value = p.roughFar;
    u.uRipAmp.value = p.ripAmp;
    u.uCapT.value = p.capT;
    u.uCapAmt.value = p.capAmt;
    u.uCapAmb.value = p.capAmb ?? 1.0;
    u.uCapSun.value = p.capSun ?? 2.0;
    u.uFadeNear.value = p.fade[0]; u.uFadeFar.value = p.fade[1];
    u.uRipN.value = p.rip[0]; u.uRipF.value = p.rip[1];
    u.uRipScale.value = 1 / (p.ripScale * ripTune);
    u.uRipRef.value = p.ripRef ?? 55;
    u.uRipLod.value = p.ripLod ?? 0.55;
    u.uRipFar.value = p.ripFar ?? 0.3;
    u.uLaceScale.value = p.laceScale ?? 1.1;
    u.uSSSAmt.value = g.elev > 4 ? 1 : 0.3;
    stateIdx = stateOverride >= 0 ? stateOverride : p.state;
    applyWaves();
  };
  onGrade(applyGrade);

  const tmp = new THREE.Vector3();

  const ocean = {
    object3D,
    material,
    uniforms: u,
    get seaState() { return SEA_STATES[stateIdx]; },

    update(dt, app) {
      u.uTime.value += dt;
      if (app) { object3D.position.x = app.camera.position.x; object3D.position.z = app.camera.position.z; }
    },

    // Writes the override, not just stateIdx: applyGrade() resets stateIdx from the grade, and any
    // sky knob re-fires it, so setting stateIdx alone was silently undone. setSeaState(null) follows
    // the grade again.
    setSeaState(n) {
      stateOverride = n == null ? -1 : clamp(n | 0, 0, SEA_STATES.length - 1);
      applyGrade(GRADES[skyGradeName()]);
      return ocean;
    },

    // Widens the detail fade without editing the grade table — an interior shot sees the water at a
    // grazing angle the sea grades were never tuned for, and gets a hard horizontal LOD line.
    // applyGrade() rewrites all four, so call this AFTER the grade is set.
    // `graze` is where surface slope starts and finishes flattening into the horizon, in
    // log2(dist / −V.y) — C6's E5. It rides on the same override as the rest so a scenario with a
    // level camera can widen it, and so it survives applyGrade the way fog and sea state do.
    setDetailFade({ fade, rip, lod, graze } = {}) {
      if (fade) { u.uFadeNear.value = fade[0]; u.uFadeFar.value = fade[1]; }
      if (rip) { u.uRipN.value = rip[0]; u.uRipF.value = rip[1]; }
      if (lod != null) u.uRipLod.value = lod;
      if (graze !== undefined) {
        flattenOverride = graze == null ? null : [graze[0], graze[1]];
        if (flattenOverride) { u.uFlatA.value = graze[0]; u.uFlatB.value = graze[1]; }
        else if (lastGrade) applyGrade(lastGrade);
      }
      return ocean;
    },

    // Warm point sources sitting on the water — a burning hull, later a shell impact. Two slots;
    // the shader unrolls them, so this is the cap.
    setSeaLights(list = []) {
      for (let i = 0; i < 2; i++) {
        const l = list[i];
        u.uSeaLight.value[i].set(l ? l.pos.x : 0, l ? l.pos.y : 0, l ? l.pos.z : 0, l ? (l.radius ?? 60) : 1);
        if (l) u.uSeaLightCol.value[i].set(l.colour ?? '#ff9a45').multiplyScalar(l.intensity ?? 1);
        else u.uSeaLightCol.value[i].setRGB(0, 0, 0);
      }
      return ocean;
    },

    // Mirrors the vertex shader's sum with fade = 1. Beyond uFadeFar the GPU surface is flat and
    // this still returns swell, which is correct for anything that floats and irrelevant to it.
    heightAt(x, z) {
      const m = u.uSharp.value;
      let h = 0;
      for (let i = 0; i < NW; i++) {
        const w = u.uWave.value[i];
        const ph = (w.x * x + w.y * z) * w.z - u.uTime.value * Math.sqrt(9.81 * w.z);
        const s = 0.5 + 0.5 * Math.sin(ph);
        h += w.w * (2 * (s + m * (s * s - s)) - 1);
      }
      return h * u.uAmp.value;
    },

    normalAt(x, z, out = new THREE.Vector3()) {
      const e = 0.6;
      return out.set(
        ocean.heightAt(x - e, z) - ocean.heightAt(x + e, z), 2 * e,
        ocean.heightAt(x, z - e) - ocean.heightAt(x, z + e),
      ).normalize();
    },

    registerKnobs(q) {
      q.register({ key: 'seaState', label: 'Sea state (-1 = grade)', type: 'range', min: -1, max: 3, step: 1, default: -1, group: 'Ocean' },
        v => { stateOverride = v; applyGrade(GRADES[skyGradeName()]); });
      q.register({ key: 'seaChop', label: 'Sea chop', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1, group: 'Ocean' },
        v => { chopTune = v; applyWaves(); });
      q.register({ key: 'seaGlint', label: 'Sun glint', type: 'range', min: 0, max: 4, step: 0.05, default: 1, group: 'Ocean' },
        v => { glintTune = v; u.uGlint.value = GRADES[skyGradeName()].sea.glint * v; });
      q.register({ key: 'seaHaze', label: 'Sea haze', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, group: 'Ocean' },
        v => { hazeTune = v; setFog(GRADES[skyGradeName()].sea); });
      q.register({ key: 'seaRipple', label: 'Ripple size', type: 'range', min: 0.25, max: 4, step: 0.05, default: 1, group: 'Ocean' },
        v => { ripTune = v; u.uRipScale.value = 1 / (GRADES[skyGradeName()].sea.ripScale * v); });
      q.register({ key: 'seaDebug', label: 'Isolate term', type: 'range', min: 0, max: 4, step: 1, default: 0, group: 'Ocean' },
        v => { u.uDebug.value = v; });
      quality.onChange(k => { if (k === 'oceanSegs' || k === 'oceanRings' || k === '*') rebuild(); });
    },
  };

  return ocean;
}

let currentGrade = 'noon';
onGrade((_g, name) => { currentGrade = name; });
const skyGradeName = () => currentGrade;

// ── D10 placeholders ────────────────────────────────────────────────────────────────────────
// Cheap blocked-in hulls so the sea shots have a subject to hold the frame, exactly as the plates
// do. Not C1's work and explicitly not scored — C3/C4 replace them and the same shots re-run.

function placeholderHull(len, colour, dark = false) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.05 });
  const beam = len * 0.13, height = len * 0.075;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(len, height, beam), mat);
  hull.position.y = height * 0.35;
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0, beam * 0.5, len * 0.18, 4, 1), mat);
  bow.rotation.set(0, Math.PI / 4, -Math.PI / 2);
  bow.position.set(len * 0.56, height * 0.35, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len * 0.30, height * 1.5, beam * 0.62), mat);
  deck.position.set(-len * 0.02, height * 1.55, 0);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(len * 0.07, height * 2.2, beam * 0.34), mat);
  tower.position.set(len * 0.04, height * 3.0, 0);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.13, beam * 0.15, height * 1.7, 8), mat);
  stack.position.set(-len * 0.14, height * 3.1, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.012, beam * 0.02, height * 4.2, 4), mat);
  mast.position.set(len * 0.09, height * 5.2, 0);
  for (const m of [hull, bow, deck, tower, stack, mast]) { m.castShadow = !dark; g.add(m); }
  return g;
}

// One soft radial card, reused additively for the fire and normally for the smoke. Sprites are
// used rather than the vfx pool because these are scenery for a placeholder, not a beat.
function radialTex(rgb, pow, label) {
  const S = 128;
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r * r * (3 - 2 * r), pow);
      const i = (y * S + x) * 4;
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = a * 255;
    }
  }
  const tex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  track(tex, { w: S, h: S, fmt: 'rgba', mips: false, label });
  return tex;
}

function fireGlow(spread, scale) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: radialTex([255, 150, 55], 2.4, 'sea:fireglow'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const core = new THREE.SpriteMaterial({
    map: radialTex([255, 232, 190], 3.2, 'sea:firecore'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const halo = new THREE.Sprite(mat);
  halo.scale.setScalar(spread * 0.8);
  halo.position.y = scale * 0.7;
  g.add(halo);
  for (let i = 0; i < 11; i++) {
    const t = i / 10 - 0.5;
    const s = new THREE.Sprite(i % 3 === 0 ? core : mat);
    s.position.set(t * spread, scale * (0.25 + 0.55 * Math.abs(Math.sin(i * 2.7))), 0);
    s.scale.setScalar(scale * (0.8 + 0.9 * Math.abs(Math.sin(i * 1.9))));
    g.add(s);
  }
  return g;
}

// The puff carries its own noise. A smooth radial gradient repeated 40 times integrates into a
// hard-edged cone, which is what a smoke column must not look like.
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const S = 128;
  const f = new Field({ size: S, period: 4, octaves: 4, gain: 0.55, seed: 3391 });
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const n = f.at(x / S, y / S);
      const a = Math.pow(1 - r * r * (3 - 2 * r), 1.5) * clamp(n * 2.1 - 0.45, 0, 1);
      const lit = 0.55 + 0.75 * n;
      const i = (y * S + x) * 4;
      px[i] = clamp(160 * lit, 0, 255); px[i + 1] = clamp(92 * lit, 0, 255); px[i + 2] = clamp(60 * lit, 0, 255);
      px[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  puffTex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  puffTex.minFilter = puffTex.magFilter = THREE.LinearFilter;
  puffTex.needsUpdate = true;
  track(puffTex, { w: S, h: S, fmt: 'rgba', mips: false, label: 'sea:puff' });
  return puffTex;
}

function smokeColumn(scale) {
  const g = new THREE.Group();
  const tex = puffTexture();
  const mats = [0, 1.1, 2.4, 3.7].map((rot, i) => new THREE.SpriteMaterial({
    map: tex, depthWrite: false, transparent: true, fog: false,
    opacity: i < 2 ? 0.42 : 0.2, rotation: rot,
  }));
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const s = new THREE.Sprite(mats[i & 3]);
    s.position.set(
      -t * scale * 2.6 + Math.sin(i * 2.13) * scale * (0.5 + t * 1.4),
      scale * (0.5 + t * 7.6),
      Math.cos(i * 1.7) * scale * (0.3 + t),
    );
    s.scale.setScalar(scale * (1.5 + t * 4.6));
    g.add(s);
  }
  return g;
}

// ── Scored scenarios ────────────────────────────────────────────────────────────────────────
// Pitch is applied by aiming a point 1 km out: for a plane that runs to infinity the horizon sits
// at eye level whatever the camera height, so screen fraction f from the top means
// tan(pitch) = (1 - 2f) * -tan(fov/2).

// `horizon` is where the waterline sits as a fraction of frame height, which is the only way to
// frame a sea shot that stays put when the fov changes.
export function seaCamera(app, { y, fov, horizon, yaw = 0 }) {
  const pitch = Math.atan((2 * horizon - 1) * Math.tan(fov * Math.PI / 360));
  const dx = Math.sin(yaw) * Math.cos(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
  frameCamera(app, {
    pos: [0, y, 0],
    look: [dx * 1000, y + Math.sin(pitch) * 1000, dz * 1000],
    fov, near: 1, far: 9000,
  });
}

const SEA_ROOTS = new Set(['lighting', 'ocean', 'vfx']);

// `extra` names further scene roots to keep visible — C3's sea shots need 'fleet'. Empty by
// default, so C1's three scenarios take exactly the path they always did.
export function sea(app, gradeName, extra = []) {
  const { sky, lighting, ocean } = window.__waterline.world;
  sky.setGrade(gradeName);
  lighting.setGrade(gradeName);
  app.scene.background = null;
  app.scene.environment = sky.env;
  app.quality.set('exposure', GRADES[gradeName].exposure);
  // An open-sea shot is ocean, sky, light and VFX and nothing else. This used to un-hide every
  // root object instead, which worked only because the camera happened to sit above the bridge
  // stub — drop the camera 8 m and the interior box fills the frame as a flat brown sky.
  for (const o of app.scene.children) o.visible = SEA_ROOTS.has(o.name) || extra.includes(o.name);
  ocean.setSeaLights([]);
  for (const o of [...app.scene.children]) if (o.name.startsWith('_ph')) app.scene.remove(o);
  return { sky, lighting, ocean };
}

function prop(app, name, obj) {
  obj.name = name;
  app.scene.add(obj);
  return obj;
}

defineScenario({
  id: 'sea_dusk',
  label: 'Open sea at sunset — sky, water and grade only',
  ref: '552990_08',
  setup(app) {
    sea(app, 'dusk');
    seaCamera(app, { y: 18, fov: 14, horizon: 0.775, yaw: 0.06 });
  },
});

defineScenario({
  id: 'sea_night',
  label: 'Night sea lit by a burning hulk on the horizon',
  ref: '494840_10',
  setup(app) {
    const { ocean } = sea(app, 'night');
    seaCamera(app, { y: 15, fov: 18, horizon: 0.575, yaw: 0 });

    const D = 850, X = -112;
    const hulk = prop(app, '_ph1', placeholderHull(200, 0x181310, true));
    hulk.position.set(X, 0, -D);
    hulk.rotation.y = 0.12;
    hulk.add(fireGlow(200, 28));
    const smoke = smokeColumn(46);
    smoke.position.set(-14, 10, 4);
    hulk.add(smoke);

    const lamp = prop(app, '_ph2', new THREE.PointLight(0xff8b33, 900, 700, 1.6));
    lamp.position.set(X, 14, -D + 20);

    // radius is the r in r/(r+d), so it sets where the falloff bites, and intensity has to leave
    // the far end under 1.0 or both ends clip and the streak reads as a flat orange multiplier
    ocean.setSeaLights([{ pos: new THREE.Vector3(X, 9, -D), colour: '#ff8422', intensity: 2.4, radius: 300 }]);
  },
});

// BUILD_PLAN §6 asserts the ocean sub-budget on this one: same camera as sea_noon with the sky
// dome and the placeholder hidden, so `calls` and `tris` are the water alone.
defineScenario({
  id: 'sea_only',
  label: 'Ocean alone — the §6 sub-budget shot',
  ref: null,
  setup(app) {
    const { ocean } = sea(app, 'noon');
    seaCamera(app, { y: 17, fov: 33, horizon: 0.50 });
    for (const o of app.scene.children) o.visible = o === ocean.object3D;
    app.scene.background = new THREE.Color(0x101418);
  },
});

defineScenario({
  id: 'sea_noon',
  label: 'Open sea at midday with a distant hull',
  ref: '236390_14',
  setup(app) {
    sea(app, 'noon');
    seaCamera(app, { y: 17, fov: 33, horizon: 0.50, yaw: 0 });
    const hull = prop(app, '_ph1', placeholderHull(190, 0x7c8288));
    hull.position.set(-120, 0, -640);
    hull.rotation.y = 0.42;
  },
});
