// Sky dome, sun, horizon haze, PMREM env — C1 owns this file.
//
// The dome is an analytic gradient + a cloud deck projected onto a flat plane at altitude, which
// is what compresses cloud into bands as they approach the horizon. `SKY_GLSL` is exported and
// grafted into the ocean shader too, so the water reflects the real sky instead of an env map —
// that is the whole reason there is no planar reflection or SSR here (BUILD_PLAN §7.2).

import * as THREE from 'three';
import { Field, clamp } from './textures/noise.js';
import { track, untrack } from '../engine/budget.js';
import { trackAniso } from './textures/bake.js';

const CS = 256;

// The three authored looks. Every scored sea shot picks one; `setTime` alone cannot get a night
// sea and a sunset to both read right, because the difference is a grade, not an elevation.
// Colours here are PRE-tone-map: ACES plus the grade's exposure sits between these and the pixel,
// so they were derived by inverting that chain against sampled values from the plate each grade
// answers to. Editing one by eye without doing that will not land where you expect.
export const GRADES = {
  noon: {
    elev: 42, azimuth: 138,
    zenith: '#1a66b2', horizon: '#909aa2', below: '#6a7176',
    sunTint: '#ffe2b4', sunDisc: '#fff8e8', glow: 0.03, glowAz: 8, glowH: 0.3, glowCore: 0.4, glowPow: 700,
    discW: 0.30, discH: 0.28,
    cloudLit: '#e8f4ff', cloudFar: '#9fb0c0', cloudDark: '#5a6874', cloudRim: 0.16, cloudProx: 1.6,
    cover: 0.34, sharp: 0.20, cloudSun: 0.055, cloudScale: 2.6, cloudH: 1900, wind: 0.9, reach: 6.5, aniso: 1.0,
    // hazeH is the e-folding height of the horizon haze in sin(elevation). At 0.02 the band was
    // barely a degree tall, so a reflected ray at 4° already saw deep zenith blue and the whole
    // mid-field sea came back navy instead of the plate's near-neutral grey.
    gradPow: 0.42, hazeH: 0.105, hazeAmt: 0.32,
    sun: { colour: '#fff8ee', intensity: 3.1 },
    amb: { sky: '#8fb2cf', ground: '#33505e', intensity: 0.85 },
    fog: { colour: '#767b7f', near: 250, far: 2400 },
    exposure: 0.94,
    sea: {
      deep: '#0a161d', shallow: '#1e4152', sss: '#2a6a6a', cap: '#b6c6cc', haze: '#6e7a88', hazeSky: 0.50,
      fogK: 0.00055, fogTint: [0.92, 1.00, 1.14], glintCol: '#eef6ff', glint: 0.04, rough: 0.09, roughFar: 0.28, ripAmp: 0.062,
      capT: 0.72, capAmt: 0.60, refl: 0.90, sparkle: 0.035, reflBlur: 0.45, state: 2,
      fade: [60, 620], rip: [70, 560], ripScale: 9, ripRef: 55, ripLod: 0.55, ripFar: 0.22,
      laceScale: 1.1, graze: [13.5, 17.0],
    },
  },
  dusk: {
    elev: 2.6, azimuth: 176,
    zenith: '#9b8296', horizon: '#d9853f', below: '#4a332e',
    sunTint: '#ffa457', sunDisc: '#ffeaad', glow: 0.45, glowAz: 4, glowH: 0.055, glowCore: 0.45, glowPow: 900,
    discW: 0.135, discH: 0.120,
    cloudLit: '#efd0a4', cloudFar: '#8e7a88', cloudDark: '#4c3f4d', cloudRim: 1.3, cloudProx: 4.2,
    cover: 0.50, sharp: 0.22, cloudSun: 0.10, cloudScale: 2.2, cloudH: 2600, wind: 0.5, reach: 10, aniso: 0.62,
    gradPow: 0.38, hazeH: 0.045, hazeAmt: 0.28,
    sun: { colour: '#ffb478', intensity: 0.9 },
    amb: { sky: '#c08464', ground: '#4a3a34', intensity: 0.9 },
    fog: { colour: '#a3603f', near: 200, far: 2600 },
    exposure: 0.95,
    sea: {
      deep: '#191419', shallow: '#2e2228', sss: '#8a5a38', cap: '#9c7c60', haze: '#463a40', hazeSky: 0.18,
      fogK: 0.0009, fogTint: [1.0, 1.0, 1.06], glint: 0.26, rough: 0.30, roughFar: 0.40, ripAmp: 0.014,
      capT: 0.94, capAmt: 0.12, refl: 0.48, sparkle: 0.26, reflBlur: 0.85, state: 1, hazePow: 3.0,
      fade: [350, 1100], rip: [250, 1300], ripScale: 22, ripRef: 380, ripLod: 0.5, ripFar: 0.06,
      laceScale: 0.5, graze: [12.4, 16.0],
    },
  },
  night: {
    // The "sun" at night is the burning hulk: a hair under the horizon on its azimuth, so the only
    // thing it can produce is the horizon glow band. sunUp gates the glint off below elev 0.
    elev: -1.4, azimuth: 187,
    zenith: '#04040a', horizon: '#0c0a0c', below: '#08080e',
    sunTint: '#e0763a', sunDisc: '#000000', glow: 0.30, glowAz: 16, glowH: 0.028, glowCore: 0.0, glowPow: 600,
    discW: 0.3, discH: 0.3,
    cloudLit: '#241a18', cloudFar: '#0b0b10', cloudDark: '#050609', cloudRim: 0.0, cloudProx: 5.0,
    cover: 0.40, sharp: 0.5, cloudSun: 0.06, cloudScale: 2.0, cloudH: 2600, wind: 0.4, reach: 4.0, aniso: 0.6,
    gradPow: 0.7, hazeH: 0.06, hazeAmt: 0.4,
    sun: { colour: '#2a3452', intensity: 0.05 },
    amb: { sky: '#0b1018', ground: '#06080c', intensity: 0.5 },
    fog: { colour: '#07080e', near: 150, far: 2200 },
    exposure: 1.2,
    sea: {
      deep: '#0b0d11', shallow: '#131619', sss: '#0a0e14', cap: '#1e2026', haze: '#080706', hazeSky: 0.45,
      fogK: 0.0011, fogTint: [1.0, 1.0, 1.0], glint: 0.02, rough: 0.105, roughFar: 0.22, ripAmp: 0.06,
      capT: 0.94, capAmt: 0.08, refl: 0.8, sparkle: 0.16, reflBlur: 0.3, state: 1,
      fade: [150, 1400], rip: [160, 1800], ripScale: 9, ripRef: 130, ripLod: 0.42, ripFar: 0.34,
      // deliberately out of reach: the fire streak running to the horizon is this shot's subject
      laceScale: 0.8, graze: [22, 26],
    },
  },
};

const col = hex => new THREE.Color(hex);

let U = null;
export function skyUniforms() {
  if (U) return U;
  U = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: col('#2e6ea8') },
    uHorizon: { value: col('#c2d0d8') },
    uBelow: { value: col('#9fb0ba') },
    uSunTint: { value: col('#ffdca8') },
    uSunDisc: { value: col('#fff8e8') },
    uGlow: { value: 0.1 },
    uGlowAz: { value: 6 },
    uGlowH: { value: 0.1 },
    uGlowCore: { value: 0.3 },
    uGlowPow: { value: 600 },
    uDiscW: { value: 0.01 },
    uDiscH: { value: 0.01 },
    uHazeH: { value: 0.1 },
    uHazeAmt: { value: 0.55 },
    uCloudLit: { value: col('#fbf9f4') },
    uCloudFar: { value: col('#9fb0c0') },
    uCloudDark: { value: col('#8794a3') },
    uCloudRim: { value: 0.35 },
    uCloudProx: { value: 2 },
    uCloudSun: { value: 0.05 },
    uCover: { value: 0.5 },
    uCloudSharp: { value: 0.26 },
    uCloudScale: { value: 0.001 },
    uCloudReach: { value: 5 },
    uCloudAniso: { value: 1 },
    uGradPow: { value: 0.8 },
    uCloudH: { value: 2000 },
    uCloudTex: { value: null },
    uWind: { value: new THREE.Vector2(0, 0) },
    uSkyTime: { value: 0 },
  };
  return U;
}

// Sampled by the dome and by the ocean's reflection. `disc` is 0 from the water: a sun disc in a
// mirror reflection is a single blazing pixel, and the specular lobe already draws the glitter.
export const SKY_GLSL = `
uniform vec3 uSunDir, uZenith, uHorizon, uBelow, uSunTint, uSunDisc, uCloudLit, uCloudFar, uCloudDark;
uniform float uGlow, uGlowAz, uGlowH, uGlowCore, uGlowPow, uDiscW, uDiscH, uHazeH, uHazeAmt, uCloudRim, uGradPow;
uniform float uCover, uCloudSharp, uCloudScale, uCloudH, uSkyTime, uCloudReach, uCloudAniso, uCloudProx, uCloudSun;
uniform vec2 uWind;
uniform sampler2D uCloudTex;

vec3 skyBase(vec3 d) {
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), uGradPow));
  c = mix(c, uBelow, clamp(-h * 9.0, 0.0, 1.0));
  c = mix(c, uHorizon, uHazeAmt * exp(-max(h, 0.0) / uHazeH));
  // Two terms, because a sunset glow is not circular: a band that hugs the horizon around the
  // sun's azimuth, plus a tight core. One isotropic pow() wide enough to cover the band blows
  // the whole frame out.
  vec2 dh = normalize(d.xz + vec2(1e-5, 0.0));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  // faded out just under the horizon as well: the ocean's aerial perspective samples this
  // function downward, and a glow that survives below h=0 washes the near water flat
  float band = pow(max(dot(dh, sh), 0.0), uGlowAz) * exp(-max(h, 0.0) / uGlowH)
             * smoothstep(-0.03, 0.002, h);
  float mu = max(dot(d, uSunDir), 0.0);
  c += uSunTint * (uGlow * band + uGlowCore * pow(mu, uGlowPow));
  return c;
}

// An ellipse in angle, not a threshold on dot(d, sun). The threshold form needs a feather in
// cosine, and near mu=1 a feather of 1e-4 in cosine is over a degree of arc — wider than the disc
// itself, so the disc never reached full brightness and read as a soft shaft. Half-widths are in
// radians: azimuth wider than elevation, which is how a low sun sits in every sunset plate.
float sunDisc(vec3 d) {
  vec2 sn = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  vec2 dn = normalize(d.xz + vec2(1e-5, 0.0));
  float ax = dn.x * sn.y - dn.y * sn.x;
  float ey = d.y - uSunDir.y;
  float q = ax * ax / (uDiscW * uDiscW) + ey * ey / (uDiscH * uDiscH);
  return (1.0 - smoothstep(0.10, 1.0, q)) * step(0.0, dot(dn, sn));
}

vec3 skyColour(vec3 d, float disc) {
  vec3 c = skyBase(d);
  float y = d.y;
  if (y > 0.0015) {
    // A flat deck at 1/y runs to infinity at the horizon, where the texture gradient explodes and
    // the mip chain turns it into radial streaks. Saturating the projection stands in for the
    // earth's curvature: the deck ends at a finite distance and compresses into a band.
    // Saturating at uCloudReach tiles stands in for the earth's curvature: a true 1/y plane runs
    // to infinity at the horizon, where the texture repeats hundreds of times and the gradient
    // explodes into radial streaks.
    vec2 q = d.xz / y * uCloudH * uCloudScale;
    q /= 1.0 + length(q) / uCloudReach;
    q.x *= uCloudAniso;
    vec2 p = q + uWind * uSkyTime;
    // two scales of the same tile: one fetch alone gives a single-frequency corrugation once the
    // projection compresses it, which reads as corrugated iron rather than as weather
    vec4 t0 = texture2D(uCloudTex, p * 0.32);
    vec4 t1 = texture2D(uCloudTex, p + vec2(0.37, 0.11));
    float base = t0.r * 0.55 + t1.r * 0.25 + t1.g * 0.10 + t0.b * 0.10;
    float dens = smoothstep(1.0 - uCover, 1.0 - uCover + uCloudSharp, base);
    dens *= smoothstep(0.0015, 0.020, y);
    if (dens > 0.001) {
      // Two samples along the sun's azimuth, one short and one 2.6x further: one alone shades only
      // the pixel behind a cloud edge, which gives every mass the same softness and no sense of
      // where the light is. The pair reads as depth of cloud between here and the sun, so a mass
      // lights on its sun side and stays dark on the other — and the difference of the two is a
      // signed edge term, bright where the deck thins toward the sun.
      vec2 sd = normalize(uSunDir.xz + vec2(1e-4, 0.0)) * uCloudSun;
      float a1 = texture2D(uCloudTex, p * 0.32 + sd).r;
      float a2 = texture2D(uCloudTex, p * 0.32 + sd * 2.6).r;
      float ahead = max(a1, a2 * 0.85);
      float trans = exp(-4.6 * max(0.0, ahead - (1.0 - uCover)));
      trans *= 1.0 + clamp((a2 - a1) * 3.0, -0.45, 0.55);
      float mu = max(dot(d, uSunDir), 0.0);
      // The lit side is graded by how close this patch of sky is to the sun. Without it every
      // cloud in the dome gets the same lit colour and the field reads as procedural on sight —
      // a sunset's clouds run cream at the sun and grey-mauve at the far side of the sky.
      float prox = pow(0.5 + 0.5 * dot(d, uSunDir), uCloudProx);
      vec3 cc = mix(uCloudDark, mix(uCloudFar, uCloudLit, prox), trans);
      cc += uSunTint * uCloudRim * pow(mu, 40.0) * (0.2 + 0.8 * trans);
      cc = mix(cc, uHorizon, (1.0 - smoothstep(0.0, 0.07, y)) * uHazeAmt);
      c = mix(c, cc, dens);
    }
  }
  if (disc > 0.0) c += uSunDisc * disc * sunDisc(d);
  return c;
}
`;

// R main deck, G detail, B a slow cover modulation so the sky is not uniformly cloudy. The v axis
// is sampled at a higher frequency than u, which is what makes the deck read as bands rather than
// as blobs once it compresses toward the horizon.
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const a = new Field({ size: CS, period: 3, octaves: 4, gain: 0.55, seed: 1301 });
  const b = new Field({ size: CS, period: 6, octaves: 4, gain: 0.5, seed: 4409 });
  const c = new Field({ size: CS, period: 2, octaves: 2, gain: 0.6, seed: 7717 });

  const px = new Uint8Array(CS * CS * 4);
  const ch = [new Float32Array(CS * CS), new Float32Array(CS * CS), new Float32Array(CS * CS)];
  for (let y = 0; y < CS; y++) {
    const v = y / CS;
    for (let x = 0; x < CS; x++) {
      const u = x / CS, i = y * CS + x;
      ch[0][i] = 0.64 * a.at(u, v) + 0.36 * b.at(u * 2, v * 2);
      ch[1][i] = 0.55 * b.at(u * 3, v * 3) + 0.45 * a.at(u * 5, v * 5);
      ch[2][i] = c.at(u, v);
    }
  }
  // value noise piles up around 0.5, so a cover threshold on the raw field either covers the whole
  // sky or none of it. Stretched to the full range, `cover` behaves like a fraction.
  for (const f of ch) {
    let lo = 1, hi = 0;
    for (const v of f) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const s = 1 / (hi - lo || 1);
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
  }
  for (let i = 0; i < CS * CS; i++) {
    px[i * 4] = clamp(ch[0][i], 0, 1) * 255;
    px[i * 4 + 1] = clamp(ch[1][i], 0, 1) * 255;
    px[i * 4 + 2] = clamp(ch[2][i], 0, 1) * 255;
    px[i * 4 + 3] = 255;
  }

  cloudTex = new THREE.DataTexture(px, CS, CS, THREE.RGBAFormat, THREE.UnsignedByteType);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.colorSpace = THREE.NoColorSpace;
  cloudTex.generateMipmaps = true;
  cloudTex.minFilter = THREE.LinearMipmapLinearFilter;
  cloudTex.magFilter = THREE.LinearFilter;
  cloudTex.needsUpdate = true;
  trackAniso(cloudTex);
  track(cloudTex, { w: CS, h: CS, fmt: 'rgba', mips: true, label: 'sky:cloud' });
  return cloudTex;
}

const listeners = new Set();
let gradeName = 'noon';
let tune = { cover: 1, haze: 1, cloud: 1 };

export function grade() { return GRADES[gradeName]; }

// lighting.js and ocean.js both need the palette and neither may depend on construction order.
export function onGrade(fn) { listeners.add(fn); fn(GRADES[gradeName], gradeName); return () => listeners.delete(fn); }

function applyGrade() {
  const g = GRADES[gradeName];
  const u = skyUniforms();
  const az = g.azimuth * Math.PI / 180, el = g.elev * Math.PI / 180;
  u.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  u.uZenith.value.set(g.zenith); u.uHorizon.value.set(g.horizon); u.uBelow.value.set(g.below);
  u.uSunTint.value.set(g.sunTint); u.uSunDisc.value.set(g.sunDisc);
  u.uCloudLit.value.set(g.cloudLit); u.uCloudDark.value.set(g.cloudDark);
  u.uCloudFar.value.set(g.cloudFar ?? g.cloudDark);
  u.uCloudProx.value = g.cloudProx ?? 2;
  u.uCloudSun.value = g.cloudSun ?? 0.05;
  u.uGlow.value = g.glow; u.uGlowAz.value = g.glowAz; u.uGlowH.value = g.glowH;
  u.uGlowCore.value = g.glowCore; u.uGlowPow.value = g.glowPow; u.uCloudRim.value = g.cloudRim;
  u.uDiscW.value = (g.discW ?? 0.3) * Math.PI / 180;
  u.uDiscH.value = (g.discH ?? 0.3) * Math.PI / 180;
  u.uHazeH.value = g.hazeH; u.uHazeAmt.value = Math.min(0.95, g.hazeAmt * tune.haze);
  u.uCover.value = clamp(g.cover * tune.cover, 0, 0.98);
  u.uCloudSharp.value = g.sharp;
  u.uCloudH.value = g.cloudH;
  u.uCloudReach.value = g.reach;
  u.uCloudAniso.value = g.aniso;
  u.uGradPow.value = g.gradPow;
  // metres of cloud plane per texture tile, folded into one uniform so the shader stays a multiply
  u.uCloudScale.value = 0.001 / (g.cloudScale * tune.cloud);
  u.uWind.value.set(g.wind * 0.0005, g.wind * 0.00018);
  for (const fn of listeners) fn(g, gradeName);
}

export function buildSky(quality, renderer) {
  const u = skyUniforms();
  u.uCloudTex.value = cloudTexture();

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    // z forced to the far plane so the dome's radius can never collide with a scenario's near or
    // far clip — at radius 1 a camera with near:1 clipped it away entirely and the sky went black.
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }
    `,
    fragmentShader: `
      ${SKY_GLSL}
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColour(normalize(vDir), 1.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const geo = new THREE.SphereGeometry(1, 40, 24);
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;

  const object3D = new THREE.Group();
  object3D.name = 'sky';
  object3D.add(dome);

  // PMREM needs the dome in a scene of its own, at the origin, with no ocean in front of it.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, mat));
  const pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;
  let env = null, envDirty = true;
  const bg = new THREE.Color();

  const sky = {
    object3D,
    material: mat,
    uniforms: u,
    sunDir: u.uSunDir.value,
    get env() {
      if (pmrem && envDirty) {
        if (env) { untrack(env); env.dispose(); }
        env = pmrem.fromScene(envScene, 0, 0.1, 20).texture;
        // PMREM output is a 256-wide cube chain; nothing else in the game is close to this size
        track(env, { w: 256, h: 256 * 6, fmt: 'half', mips: true, label: 'sky:env' });
        envDirty = false;
      }
      return env;
    },
    get background() { return bg.copy(u.uHorizon.value); },
    get time() { return hoursFor(GRADES[gradeName].elev); },
    get grade() { return gradeName; },

    setGrade(name) {
      if (!GRADES[name]) throw new Error(`unknown sky grade: ${name}`);
      gradeName = name;
      applyGrade();
      envDirty = true;
      return sky;
    },

    // Kept because §2.2 declares it. Elevation drives the palette by picking the nearest authored
    // grade — a continuous physical sky would not land on any of the three plates.
    setTime(h) {
      const t = ((h % 24) + 24) % 24;
      return sky.setGrade(t < 5 || t >= 20 ? 'night' : t < 8 || t >= 17.2 ? 'dusk' : 'noon');
    },

    // Azimuth in degrees, elevation in degrees. Sea shots are authored, not simulated.
    setSun(azimuth, elev) {
      const g = GRADES[gradeName];
      if (azimuth !== undefined) g.azimuth = azimuth;
      if (elev !== undefined) g.elev = elev;
      applyGrade();
      envDirty = true;
      return sky;
    },

    update(dt, app) {
      u.uSkyTime.value += dt;
      if (app) object3D.position.copy(app.camera.position);
    },

    registerKnobs(q) {
      q.register({ key: 'skyCover', label: 'Cloud cover', type: 'range', min: 0, max: 2, step: 0.02, default: 1, group: 'Sky' },
        v => { tune.cover = v; applyGrade(); });
      q.register({ key: 'skyHaze', label: 'Horizon haze', type: 'range', min: 0, max: 2, step: 0.02, default: 1, group: 'Sky' },
        v => { tune.haze = v; applyGrade(); });
      q.register({ key: 'skyCloudSize', label: 'Cloud size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, group: 'Sky' },
        v => { tune.cloud = v; applyGrade(); });
      q.register({ key: 'skyGrade', label: 'Sky grade', type: 'select', options: Object.keys(GRADES), default: 'noon', group: 'Sky' },
        v => sky.setGrade(v));
    },
  };

  applyGrade();
  return sky;
}

const hoursFor = elev => (elev < -5 ? 1.5 : elev < 8 ? 19.4 : 13);
