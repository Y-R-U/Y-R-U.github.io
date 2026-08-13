// The creek surface: a tiling ripple normal map plus the shader graft that makes a standard
// material read as moving water. Terrain owns the geometry; this owns how it looks.

import * as THREE from 'three';
import { Field, clamp } from './textures/noise.js';
import { track } from '../engine/budget.js';
import { trackAniso } from './textures/bake.js';

const S = 128;
const MAX_OBST = 6;

// RGB is a tangent-space normal, A is a slower blob field the foam laces itself out of.
// Field.at() only wraps on integer tile multiples, so every frequency here is an integer.
let ripple = null;
export function rippleTexture() {
  if (ripple) return ripple;
  const crest = new Field({ size: S, period: 3, octaves: 3, gain: 0.5, seed: 401 });
  const chop = new Field({ size: S, period: 5, octaves: 2, gain: 0.5, seed: 733 });
  const blob = new Field({ size: S, period: 2, octaves: 3, gain: 0.6, seed: 907 });

  const h = new Float32Array(S * S);
  const a = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      // u runs along the flow: more cycles there stretches every crest across the channel
      h[y * S + x] = 0.72 * crest.at(u * 2, v) + 0.28 * chop.at(u * 4, v * 2);
      a[y * S + x] = 0.68 * blob.at(u, v) + 0.32 * chop.at(u * 2, v);
    }
  }
  // value noise piles up around 0.5, so a threshold on the raw field never opens a gap in the
  // foam — stretched to the full range it does
  let lo = 1, hi = 0;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo);

  // DataTexture, not a canvas: a 2D canvas stores premultiplied RGBA, so an alpha channel
  // carrying data would quantise the normal in the RGB next to it into mush.
  const p = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const yU = (y + S - 1) % S, yD = (y + 1) % S;
    for (let x = 0; x < S; x++) {
      const xL = (x + S - 1) % S, xR = (x + 1) % S;
      const nx = (h[y * S + xL] - h[y * S + xR]) * S * 0.5;
      const ny = (h[yD * S + x] - h[yU * S + x]) * S * 0.5;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * S + x) * 4;
      p[i] = (nx * inv * 0.5 + 0.5) * 255;
      p[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      p[i + 2] = (inv * 0.5 + 0.5) * 255;
      p[i + 3] = clamp(a[y * S + x], 0, 1) * 255;
    }
  }

  ripple = new THREE.DataTexture(p, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.colorSpace = THREE.NoColorSpace;
  ripple.generateMipmaps = true;
  ripple.minFilter = THREE.LinearMipmapLinearFilter;
  ripple.magFilter = THREE.LinearFilter;
  ripple.needsUpdate = true;
  trackAniso(ripple);
  track(ripple, { w: S, h: S, fmt: 'rgba', mips: true, label: 'water:ripple' });
  return ripple;
}

const VERT_PARS = `
attribute vec2 aChan;
attribute vec2 aFlow;
attribute float aDepth;
attribute vec4 aTint;
varying vec2 vChan;
varying vec2 vFlow;
varying float vDepth;
varying vec4 vTint;
uniform float uTime;
uniform float uSpeed;
uniform float uSwell;
`;

const VERT_BODY = `
vChan = aChan; vFlow = aFlow; vDepth = aDepth; vTint = aTint;
transformed.y += uSwell * aDepth * sin(aChan.x * 0.5 - uTime * uSpeed * 1.2 + aChan.y * 0.4);
`;

const FRAG_PARS = `
varying vec2 vChan;
varying vec2 vFlow;
varying float vDepth;
varying vec4 vTint;
uniform sampler2D uRipple;
uniform vec4 uObst[${MAX_OBST}];
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoamCol;
uniform float uTime, uSpeed, uScale, uChop, uFoam, uFoamW, uRefract;
uniform float uOpacity, uFade, uRough, uRoughVary, uRoughFar, uGlint, uGlintSharp;
`;

// One block, injected early, because roughness is resolved before the normal is.
const FRAG_BODY = `
vec2 wDir = normalize(vFlow);
vec2 wSide = vec2(-wDir.y, wDir.x);
float wScr = uTime * uSpeed * uScale;
vec4 wT0 = texture2D(uRipple, vec2(vChan.x * uScale - wScr, vChan.y * uScale));
// layer B is sampled transposed: the same tile read along its other axis decorrelates the two
// so the pair never settles into one diagonal streak
vec4 wT1 = texture2D(uRipple, vec2(vChan.y * uScale * 2.1 + wScr * 0.4, vChan.x * uScale * 2.1 - wScr * 1.1));
vec4 wT2 = texture2D(uRipple, vec2(vChan.x * uScale * 0.7 - wScr * 0.3, vChan.y * uScale * 0.7));

float wWake = 0.0;
for (int i = 0; i < ${MAX_OBST}; i++) {
  vec4 o = uObst[i];
  float rr = max(o.z, 0.001);
  vec2 rel = vChan - o.xy;
  float lat = exp(-(rel.y * rel.y) / (rr * rr));
  float lon = rel.x > 0.0 ? exp(-rel.x / max(o.w, 0.001)) : exp(rel.x * 2.4 / rr);
  wWake = max(wWake, lat * lon * step(0.0001, o.z));
}

// past a few tens of metres one ripple is under a pixel: left alone it aliases into white
// speckle, so the normal flattens and the roughness rises with distance instead
float wNear = 1.0 - smoothstep(16.0, 85.0, length(vViewPosition));
vec2 wGrad = (wT0.xy - 0.5) * 2.0 + (wT1.yx - 0.5) * 1.05;
vec2 wD = (wGrad.x * wDir + wGrad.y * wSide) * uChop * (1.0 + wWake * 2.4) * mix(0.22, 1.0, wNear);

// foam is a threshold on noise, not a band: a band drawn along the water line is a hard vector
// edge however narrow it is
float wLace = wT2.w * 0.66 + wT0.w * 0.34;
float wEdge = 1.0 - smoothstep(0.0, uFoamW, vDepth);
wEdge *= wEdge;
float wFoam = smoothstep(0.0, 0.32, wLace - 0.45 - (1.0 - wEdge) * 0.9);
wFoam = max(wFoam, smoothstep(0.25, 0.85, wWake * (0.55 + 0.9 * wLace)));
wFoam = clamp(wFoam * uFoam * vTint.w, 0.0, 1.0);

float wDep = clamp(vDepth + wD.y * uRefract, 0.0, 1.0);
vec3 wCol = mix(uShallow, uDeep, smoothstep(0.0, 0.30, wDep)) * vTint.rgb;
diffuseColor.rgb = mix(wCol, uFoamCol, wFoam);
diffuseColor.a = clamp(max(uOpacity * smoothstep(0.0, uFade, wDep), wFoam * 0.85), 0.0, 1.0);
`;

const FRAG_NORMAL = `
normal = normalize(mat3(viewMatrix) * normalize(vec3(-wD.x, 1.0, -wD.y)));
float wGlint = 0.0;
#if NUM_DIR_LIGHTS > 0
  vec3 wH = normalize(directionalLights[0].direction + normalize(vViewPosition));
  wGlint = pow(max(dot(normal, wH), 0.0), uGlintSharp) * uGlint * (1.0 - wFoam);
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    wGlint *= getShadow( directionalShadowMap[0], directionalLightShadows[0].shadowMapSize,
      directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius,
      vDirectionalShadowCoord[0] );
  #endif
  // a sparkle you can see through is not a sparkle
  diffuseColor.a = clamp(max(diffuseColor.a, wGlint * 1.4), 0.0, 1.0);
#endif
`;

const FRAG_GLINT = `
#if NUM_DIR_LIGHTS > 0
  reflectedLight.directSpecular += directionalLights[0].color * wGlint;
#endif
`;

export function waterMaterial() {
  const u = {
    uTime: { value: 0 },
    uRipple: { value: rippleTexture() },
    uObst: { value: Array.from({ length: MAX_OBST }, () => new THREE.Vector4()) },
    uShallow: { value: new THREE.Color(0x767d55) },
    uDeep: { value: new THREE.Color(0x22403a) },
    uFoamCol: { value: new THREE.Color(0xa4b0ab) },
    uSpeed: { value: 0.7 },
    uScale: { value: 0.25 },
    uChop: { value: 0.2 },
    uFoam: { value: 1 },
    uFoamW: { value: 0.3 },
    uRefract: { value: 0.35 },
    uOpacity: { value: 0.9 },
    uFade: { value: 0.22 },
    uRough: { value: 0.14 },
    uRoughVary: { value: 0.5 },
    uRoughFar: { value: 0.34 },
    uGlint: { value: 0.35 },
    uGlintSharp: { value: 512 },
    uSwell: { value: 0.05 },
  };

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.14, metalness: 0,
  });
  // there is no planar reflection here, so the env map is only ever the sky: turn it down or
  // grazing Fresnel paints the whole creek the colour of the brightest thing in the scene
  mat.envMapIntensity = 0.6;
  mat.uniforms = u;

  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = VERT_PARS + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    shader.fragmentShader = FRAG_PARS + shader.fragmentShader
      .replace('#include <color_fragment>', FRAG_BODY)
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(uRough + length(wD) * uRoughVary + wFoam * 0.6 + (1.0 - wNear) * uRoughFar, 0.03, 1.0);')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + FRAG_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_GLINT);
  };

  return mat;
}

// s and n are channel coords (metres along the creek, metres across it).
export function setObstacles(mat, list) {
  const v = mat.uniforms.uObst.value;
  for (let i = 0; i < MAX_OBST; i++) {
    const o = list[i];
    v[i].set(o ? o.s : 0, o ? o.n : 0, o ? o.r : 0, o ? o.tail : 0);
  }
}

const SHALLOW = [0x99a479, 0x767d55, 0x4e5949];
const DEEP = [0x33505c, 0x22403a, 0x152524];

export function registerWaterKnobs(q, mat) {
  const u = mat.uniforms;
  const R = (key, label, min, max, step, def, apply) =>
    q.register({ key, label, type: 'range', min, max, step, default: def, group: 'Water' }, apply);

  R('waterFlow', 'Flow speed', 0, 3, 0.05, 0.7, v => { u.uSpeed.value = v; });
  R('waterScale', 'Wave size', 1, 12, 0.25, 4, v => { u.uScale.value = 1 / v; });
  R('waterChop', 'Wave depth', 0, 1.2, 0.02, 0.2, v => { u.uChop.value = v; });
  R('waterSwell', 'Surface swell', 0, 0.2, 0.005, 0.05, v => { u.uSwell.value = v; });
  R('waterFoam', 'Foam', 0, 2, 0.05, 1, v => { u.uFoam.value = v; });
  R('waterFoamWidth', 'Foam width', 0.02, 1, 0.02, 0.3, v => { u.uFoamW.value = v; });
  R('waterGlint', 'Sun glint', 0, 4, 0.05, 0.35, v => { u.uGlint.value = v; });
  R('waterGlintSize', 'Glint size', 0, 1, 0.02, 0.5, v => { u.uGlintSharp.value = Math.pow(2, 13 - v * 8); });
  R('waterRefract', 'Refraction', 0, 1, 0.02, 0.35, v => { u.uRefract.value = v; });
  R('waterSky', 'Water sky', 0, 1.5, 0.05, 0.6, v => { mat.envMapIntensity = v; });
  R('waterGloss', 'Water gloss', 0.02, 0.6, 0.01, 0.14, v => { u.uRough.value = v; });
  R('waterClarity', 'Clarity', 0, 1, 0.02, 0.45, v => {
    u.uFade.value = 0.10 + v * 0.42;
    u.uOpacity.value = 0.98 - v * 0.24;
  });
  // one slider walks the whole ramp so shallow and deep can never disagree about the palette
  R('waterTint', 'Water tint', 0, 2, 0.02, 1, v => {
    const i = Math.min(1, Math.floor(v)), t = Math.min(1, v - i);
    u.uShallow.value.setHex(SHALLOW[i]).lerp(new THREE.Color(SHALLOW[i + 1] ?? SHALLOW[i]), t);
    u.uDeep.value.setHex(DEEP[i]).lerp(new THREE.Color(DEEP[i + 1] ?? DEEP[i]), t);
  });
}
