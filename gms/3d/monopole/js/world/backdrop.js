// The backdrop: a baked nebula dome, a starfield, the local star with its flare, and the fog
// tint everything else in the frame fades into. Cheapest points in the whole game.
//
// The nebula is baked once into an equirect render target and sampled by direction, so the
// per-frame cost is one 1024-triangle dome and no noise at all. The bake writes sRGB bytes and
// the dome shader hands them straight to the framebuffer — no colour-space chunk on either side.

import * as THREE from 'three';
import { track, untrack } from '../engine/budget.js';
import { system } from './palettes.js';

const R = 1;                 // the whole backdrop lives on a unit sphere and is scaled to fit
const STAR_BASE = 18000;

const NOISE = `
float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * vnoise(p); p = p * 2.02 + 11.3; a *= 0.5; }
  return s;
}
float ridged(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 7; i++){
    if (i >= oct) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    s += a * n * n; p = p * 2.11 + 5.7; a *= 0.5;
  }
  return s;
}`;

const BAKE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uStar, uHot, uMid, uCool, uCool2, uDeep, uStarOut;
uniform float uSeed, uDensity, uDust, uGlow, uRays, uGain, uFall, uBroad, uScale, uCore, uAmbient,
              uHueBias, uWarp, uFil, uContrast, uFloor, uScatter, uReach, uCoolDim, uHalo, uDesat,
              uDLo, uDHi, uCoolAmt, uCoolGain, uCoolNear, uCoolFar, uRayOcc, uChromA, uChromB, uHaze,
              uCoolField;
${NOISE}
const float PI = 3.14159265359;

vec3 equirectDir(vec2 uv){
  float theta = (1.0 - uv.y) * PI;
  float phi = uv.x * 2.0 * PI;
  float st = sin(theta);
  return vec3(-cos(phi) * st, cos(theta), sin(phi) * st);
}
vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(0.41666)) - 0.055, step(0.0031308, c));
}

void main(){
  vec3 dir = equirectDir(vUv);
  float sd = dot(dir, uStar);
  float ang = acos(clamp(sd, -1.0, 1.0));

  vec3 q = dir * uScale + uSeed;

  // two warp levels. One long enough to shear the big shapes apart, one short enough to fray
  // their edges. A single warp leaves round lumps, which is what read as blobs in round 1.
  vec3 w1 = vec3(fbm(q * 0.30, 3), fbm(q * 0.30 + 19.7, 3), fbm(q * 0.30 + 41.3, 3)) - 0.5;
  vec3 w2 = vec3(fbm(q * 1.35 + 7.1, 2), fbm(q * 1.35 + 31.9, 2), fbm(q * 1.35 + 57.2, 2)) - 0.5;
  vec3 qw = q + w1 * (uWarp * 3.4) + w2 * (uWarp * 0.8);

  float cloud = fbm(qw, 7);
  float fil = ridged(qw * 2.4 + uSeed * 2.7, 4);
  float dust = fbm(dir * uScale * 1.1 + w1 * uWarp * 1.6 - uSeed * 1.7, 4);
  float hueF = fbm(dir * uScale * 1.7 + 61.0, 3);
  // without a low-frequency mask the noise fills the whole sky at one density and the result
  // reads as fire rather than as gas with empty space between the clumps
  float mask = 0.08 + 0.92 * smoothstep(0.10, 0.70, fbm(qw * 0.40 + 17.0, 3));

  float dens = mask * smoothstep(0.14, 0.76, cloud * 0.86 + fil * uFil) * uDensity;
  dens *= mix(1.0, smoothstep(0.70, 0.20, dust), uDust);
  dens = pow(max(dens, 0.0), uContrast);
  // the black point, taken out of the density itself and not out of the finished pixel. Crushing
  // the same amount after the colour ramp would take the wisp detail with it.
  dens = smoothstep(uDLo, uDHi, dens);

  // two separate falloffs: broad decides which half of the sky the star lights at all,
  // core is the tight blaze around it. One gaussian cannot be both.
  float broad = exp(-ang * ang * uBroad);

  // a second, colder cloud on its own field, pushed away from the star so it lands at the frame
  // edges. It is a separate density layer, not a tint on the warm one.
  vec3 qc = dir * (uScale * 0.62) + uSeed * 3.7 + 87.0;
  vec3 wc = vec3(fbm(qc * 0.34, 3), fbm(qc * 0.34 + 23.1, 3), fbm(qc * 0.34 + 47.9, 3)) - 0.5;
  vec3 qcw = qc + wc * (uWarp * 3.0);
  float coolMass = smoothstep(0.28, 0.64, fbm(qcw * 0.36 + 3.3, 3));
  float coolD = coolMass * smoothstep(0.26, 0.72, fbm(qcw, 5))
              * smoothstep(uCoolNear, uCoolFar, ang) * uCoolAmt;
  coolD = smoothstep(0.14, 0.62, coolD);

  // sampling the noise on the component of dir perpendicular to the star gives angular
  // variation that does not change with distance from it, which is what a god ray is
  vec3 perp = normalize(dir - uStar * sd + vec3(1e-4, 1e-4, 1e-4));
  float ray = fbm(perp * 3.8 + uSeed * 3.3, 3) * 0.66 + fbm(perp * 11.0 - uSeed * 1.9, 2) * 0.34;
  ray = pow(smoothstep(0.26, 0.62, ray), 2.2) * smoothstep(0.0, 0.09, ang);
  float shaft = exp(-ang * ang * uBroad * uReach);

  // transmittance from the star along the arc to here. Without it the shafts are evenly spaced
  // and read as a lens-flare pass rather than light picking its way through dust.
  float path = 0.0;
  for (int i = 0; i < 3; i++){
    vec3 sd3 = normalize(mix(dir, uStar, 0.25 + float(i) * 0.25));
    vec3 sq = sd3 * uScale + uSeed;
    vec3 sw = vec3(fbm(sq * 0.30, 2), fbm(sq * 0.30 + 19.7, 2), fbm(sq * 0.30 + 41.3, 2)) - 0.5;
    path += smoothstep(0.14, 0.76, fbm(sq + sw * (uWarp * 3.4), 4));
  }
  float trans = exp(-uRayOcc * path / 3.0);

  // dust in front of the star breaks the halo up; a clean circle reads as sun-through-fog
  float veil = 1.0 - 0.62 * smoothstep(0.15, 0.85, dust);

  float gas = dens * (0.04 + 0.96 * broad) * uGain
            + uRays * ray * shaft * (0.16 + 1.4 * dens) * veil * trans
            + uAmbient * (0.2 + 0.8 * cloud);

  // starlight scattered by the medium lifts the gas near the star and flattens its contrast.
  // That is aerial perspective inside the cloud, and it is what makes near read nearer. It is
  // added in the star's colour, not the gas's, or the lifted region goes grey.
  float scat = clamp(uScatter * exp(-ang * ang * uBroad * 2.0) * veil, 0.0, 1.0);
  float scatAdd = scat * 0.55 * (0.25 + 0.75 * dens);
  gas *= 1.0 - 0.45 * scat;

  // hue comes from its own field, so cool and warm gas coexist instead of the whole sky
  // being one temperature ramp off brightness
  float hmix = smoothstep(0.28 + uHueBias, 0.62 + uHueBias, hueF);
  // the cool gas has to be *dimmer* as well as bluer, or the patches read as blue objects
  // pasted over a red field instead of as the thin cold parts of one cloud
  gas *= uCoolDim + (1.0 - uCoolDim) * hmix;

  // the blaze is kept out of the hue field: the star must not dim because it landed in a cool patch.
  // a tight saturated core plus three progressively wider lobes, so the falloff is long instead
  // of a cliff. The wide halo is decoupled from uFall so tightening the core cannot shrink it.
  float core = exp(-ang * ang * uFall);
  float lobes = 0.40 * exp(-ang * ang * uFall * 0.090)
              + 0.15 * exp(-ang * ang * uFall * 0.018)
              + 0.05 * exp(-ang * ang * uFall * 0.0035);
  float blaze = (uGlow * (core * 3.0 + lobes * 1.6) + uHalo * exp(-ang * ang * 2.0)) * veil + scatAdd;
  float e = gas + blaze;

  vec3 starCol = mix(vec3(1.0), uHot, smoothstep(0.0, uChromA, ang));
  starCol = mix(starCol, uStarOut, smoothstep(uChromA, uChromB, ang));

  vec3 hue = mix(uMid * vec3(0.34, 0.30, 0.52), uMid, hmix);
  float warm = broad * broad; warm *= warm;
  hue = mix(hue, uHot, clamp(warm * 0.20, 0.0, 1.0));
  // lifting the two weak channels toward the strong one turns deep red into the crimson-pink
  // the plate sits at, without touching the frozen palette
  hue = mix(hue, vec3(max(hue.r, max(hue.g, hue.b)) * 0.5), uDesat);

  vec3 coolHue = mix(uCool, uCool2, smoothstep(0.34, 0.66, fbm(dir * uScale * 0.5 + 131.0, 3)));
  gas *= 1.0 - 0.55 * coolD;

  vec3 col = uDeep * uFloor + hue * gas + starCol * blaze + coolHue * coolD * uCoolGain;
  col += vec3(1.0) * uCore * smoothstep(1.7, 6.5, e);
  // The flat dust field a belt plate sits in. Everything else here is modulated by cloud density
  // and by the star's falloff, which is what makes a sky; this one is neither, because 8500_01's
  // background is an even warm grey from corner to corner and rocks lose their contrast into it.
  col += vec3(1.0, 0.94, 0.86) * (uHaze * (0.80 + 0.20 * cloud));
  // The same idea in the cool hue, but with a slow gradient toward the star instead of flat: a
  // night sky is a lit navy field that brightens where the star is, and every cloud-modulated
  // term in this shader is far too lumpy to be one.
  col += mix(uCool, uCool2, 0.15) * (uCoolField * (0.30 + 0.70 * exp(-ang * ang * 0.55)));

  col = toSRGB(aces(col));
  // 8-bit banding is visible across a falloff this smooth
  col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * (1.4 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// The bake covers the whole sky at ~11 texels per degree and the scenarios render at ~36 pixels
// per degree, so every high-frequency octave in the bake is magnified 3× and smeared. This layer
// is the fix: domain-warped ridged filaments and dust lanes evaluated *per pixel*, gated by the
// baked luminance so they carve structure into gas that already exists instead of laying grain
// over the whole frame. Judge it by shrinking the render to sheet size — grain vanishes there,
// filaments do not.
const DOME_FRAG = `
precision highp float;
varying vec3 vDir;
uniform sampler2D uMap;
uniform float uDetail, uDetScale, uLane;
const float PI = 3.14159265359;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float theta = acos(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(atan(d.z, -d.x) / (2.0 * PI), 1.0 - theta / PI);
  vec3 c = texture2D(uMap, uv).rgb;
  if (uDetail > 0.001) {
    float lum = dot(c, vec3(0.32, 0.52, 0.16));
    // full strength in the mid-density gas, off in vacuum and off inside the blown core
    float gate = smoothstep(0.015, 0.16, lum) * (1.0 - smoothstep(0.34, 0.72, lum));
    if (gate > 0.002) {
      vec3 p = d * uDetScale;
      vec3 w = vec3(fbm(p * 0.42, 3), fbm(p * 0.42 + 31.7, 3), fbm(p * 0.42 + 57.3, 3)) - 0.5;
      vec3 pw = p + w * 2.4;
      float fil = ridged(pw, 4);
      float lane = fbm(pw * 0.55 + 13.0, 3);
      // without a low-frequency mask the filaments cover the whole sky at one amplitude and the
      // result reads as fire, exactly the way the bake did before it got its own mask
      float clump = smoothstep(0.34, 0.72, fbm(d * 5.3 + 71.0, 3));
      float k = uDetail * gate * (0.18 + 0.82 * clump);
      c *= 1.0 + k * (fil - 0.52) * 2.2;
      c *= 1.0 - k * uLane * smoothstep(0.58, 0.30, lane);
    }
  }
  c += (hash(vec3(gl_FragCoord.xy, 3.0)) - 0.5) * (1.2 / 255.0);
  gl_FragColor = vec4(c, 1.0);
}`;

// Stars are drawn after the dome with no depth, so without this they sit on top of the gas and
// the sky reads as painted. Sampling the baked dome at the star's own direction lets thin gas
// pass starlight and thick gas swallow it, which is the only thing that makes it read as vacuum.
const STAR_FRAG = `
precision highp float;
varying vec3 vCol;
varying vec2 vNeb;
uniform sampler2D uMap;
uniform float uOcclude;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  vec3 gas = texture2D(uMap, vNeb).rgb;
  float lum = dot(gas, vec3(0.32, 0.52, 0.16));
  float occ = exp(-uOcclude * lum);
  gl_FragColor = vec4(vCol * a * a * occ, 1.0);
}`;

const FLARE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uCore, uHalo, uOuter;
uniform float uPower, uHaloPow, uSpikes, uStreak, uBreak, uCoreMul;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-r * r * 420.0);
  float lobes = 0.55 * exp(-r * r * 58.0) + 0.30 * exp(-r * r * 12.0) + 0.16 * exp(-r * r * 2.6);
  float halo = pow(max(0.0, 1.0 - r), uHaloPow);
  // a clean circular falloff reads as a bloom sprite pasted on; the medium in front of the star
  // eats into it at a handful of angular frequencies
  float th = atan(p.y, p.x);
  float brk = 1.0 + uBreak * (sin(th * 5.0 + 1.3) * 0.5 + sin(th * 11.0 + 4.1) * 0.32
            + sin(th * 23.0 + 2.2) * 0.18);
  lobes *= mix(1.0, brk, smoothstep(0.04, 0.45, r));
  halo *= mix(1.0, brk, smoothstep(0.10, 0.60, r));

  float s = 0.0;
  for (int i = 0; i < 3; i++){
    float a = float(i) * 1.0471976;
    vec2 rp = vec2(p.x * cos(a) + p.y * sin(a), -p.x * sin(a) + p.y * cos(a));
    s += exp(-abs(rp.y) * 150.0) * exp(-abs(rp.x) * 5.5);
  }
  float streak = exp(-abs(p.y) * 42.0) * exp(-abs(p.x) * 2.2);

  vec3 tint = mix(vec3(1.0), uCore, smoothstep(0.0, 0.09, r));
  tint = mix(tint, uHalo, smoothstep(0.07, 0.30, r));
  tint = mix(tint, uOuter, smoothstep(0.26, 0.92, r));

  vec3 c = tint * ((core * 2.4 + lobes * 1.30) * uCoreMul) + uOuter * halo * 0.42
         + uCore * s * uSpikes + uHalo * streak * uStreak;
  gl_FragColor = vec4(c * uPower, 1.0);
}`;

const rngFrom = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Backdrop {
  constructor(systemId = 'tamber') {
    this.sys = system(systemId);
    this.object3D = new THREE.Group();
    this.object3D.frustumCulled = false;
    this.dirty = true;
    this.starsDirty = true;
    this.dir = new THREE.Vector3(0, 0, -1);

    this.bakeScene = new THREE.Scene();
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uStar: { value: this.dir },
        uHot: { value: new THREE.Color(this.sys.hot).convertSRGBToLinear() },
        uMid: { value: new THREE.Color(this.sys.mid).convertSRGBToLinear() },
        uCool: { value: new THREE.Color(this.sys.cool).convertSRGBToLinear() },
        uCool2: { value: new THREE.Color(this.sys.cool2).convertSRGBToLinear() },
        uStarOut: { value: new THREE.Color(this.sys.starOut).convertSRGBToLinear() },
        uDeep: { value: new THREE.Color(this.sys.deep).convertSRGBToLinear() },
        uSeed: { value: this.sys.seed },
        uDensity: { value: 1 }, uDust: { value: 1 }, uGlow: { value: 1 },
        uRays: { value: 1 }, uGain: { value: 1 }, uFall: { value: 26 }, uBroad: { value: 1 },
        uScale: { value: 1 }, uCore: { value: 1 }, uAmbient: { value: 0.05 }, uHueBias: { value: 0 },
        uWarp: { value: 1 }, uFil: { value: 0.3 }, uContrast: { value: 1.6 }, uFloor: { value: 0.35 },
        uScatter: { value: 0.7 }, uReach: { value: 1.2 }, uCoolDim: { value: 0.14 }, uHalo: { value: 0.4 }, uDesat: { value: 0.2 },
        uDLo: { value: 0.10 }, uDHi: { value: 0.86 },
        uCoolAmt: { value: 1 }, uCoolGain: { value: 0.5 }, uCoolNear: { value: 0.10 }, uCoolFar: { value: 0.34 },
        uRayOcc: { value: 2.2 }, uChromA: { value: 0.035 }, uChromB: { value: 0.22 },
        uHaze: { value: 0 }, uCoolField: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: BAKE_FRAG,
      depthTest: false, depthWrite: false,
    });
    const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    bakeQuad.frustumCulled = false;
    this.bakeScene.add(bakeQuad);

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uDetail: { value: 0.42 },
        uDetScale: { value: 44 }, uLane: { value: 0.55 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 18), this.domeMat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.object3D.add(this.dome);

    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 2 }, uDpr: { value: 1 }, uMap: { value: null }, uOcclude: { value: 3.4 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aCol; varying vec3 vCol; varying vec2 vNeb;
        uniform float uScale, uDpr;
        const float PI = 3.14159265359;
        void main(){
          vec3 d = normalize(position);
          vNeb = vec2(atan(d.z, -d.x) / (2.0 * PI), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI);
          // a point smaller than one pixel is still drawn as one whole pixel at full brightness,
          // which is what threw the magnitude spread away and made every star the same dot.
          // Below 1 px the size becomes coverage instead.
          float s = aSize * uScale * uDpr;
          vCol = aCol * min(1.0, s * s);
          gl_PointSize = max(s, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(new THREE.BufferGeometry(), this.starMat);
    this.stars.renderOrder = -950;
    this.stars.frustumCulled = false;
    this.object3D.add(this.stars);

    this.flareMat = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color(this.sys.star).convertSRGBToLinear() },
        uHalo: { value: new THREE.Color(this.sys.starTint).convertSRGBToLinear() },
        uOuter: { value: new THREE.Color(this.sys.starOut).convertSRGBToLinear() },
        uPower: { value: 1 }, uHaloPow: { value: 3.2 }, uSpikes: { value: 0.5 }, uStreak: { value: 0.4 },
        uBreak: { value: 0.35 }, uCoreMul: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: FLARE_FRAG,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false,
    });
    this.flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flareMat);
    this.flare.renderOrder = -900;
    this.flare.frustumCulled = false;
    this.object3D.add(this.flare);

    // Standing in for the bloom pass component 5 owns. Drawn last, additively, over everything
    // including the hull, so the star's glow eats into the silhouette instead of being cut off
    // by it. Without this the star reads as a sticker behind a cutout.
    this.bloomMat = this.flareMat.clone();
    this.bloomMat.uniforms.uCore.value = new THREE.Color(this.sys.star).convertSRGBToLinear();
    this.bloomMat.uniforms.uHalo.value = new THREE.Color(this.sys.starTint).convertSRGBToLinear();
    this.bloomMat.uniforms.uSpikes.value = 0;
    this.bloomMat.transparent = true;
    this.bloom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloomMat);
    this.bloom.renderOrder = 3000;
    this.bloom.frustumCulled = false;
    this.object3D.add(this.bloom);
  }

  registerKnobs(q, app) {
    this.app = app;

    const bake = () => { this.dirty = true; };
    const G = 'Backdrop';

    q.register({ key: 'nebulaRes', label: 'Nebula resolution', type: 'select', options: [512, 768, 1024, 1536, 2048, 3072], group: G }, bake);
    q.register({ key: 'nebDensity', label: 'Nebula density', type: 'range', min: 0.2, max: 2.2, step: 0.02, default: 1.15, group: G },
      v => { this.bakeMat.uniforms.uDensity.value = v; bake(); });
    q.register({ key: 'nebScale', label: 'Nebula scale', type: 'range', min: 0.8, max: 24, step: 0.05, default: 4.2, group: G },
      v => { this.bakeMat.uniforms.uScale.value = v; bake(); });
    q.register({ key: 'nebDust', label: 'Dust lanes', type: 'range', min: 0, max: 1, step: 0.02, default: 0.55, group: G },
      v => { this.bakeMat.uniforms.uDust.value = v; bake(); });
    q.register({ key: 'nebWarp', label: 'Domain warp', type: 'range', min: 0, max: 2.5, step: 0.02, default: 1.0, group: G },
      v => { this.bakeMat.uniforms.uWarp.value = v; bake(); });
    q.register({ key: 'nebFilament', label: 'Filament edges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: G },
      v => { this.bakeMat.uniforms.uFil.value = v; bake(); });
    q.register({ key: 'nebContrast', label: 'Density contrast', type: 'range', min: 0.5, max: 4, step: 0.02, default: 1.7, group: G },
      v => { this.bakeMat.uniforms.uContrast.value = v; bake(); });
    q.register({ key: 'nebFloor', label: 'Deep colour floor', type: 'range', min: 0, max: 2, step: 0.01, default: 0.30, group: G },
      v => { this.bakeMat.uniforms.uFloor.value = v; bake(); });
    // the black point, applied to density before the colour ramp. Raise until the thinnest
    // cloud reaches zero; the corners go black without touching the wisps.
    q.register({ key: 'nebBlack', label: 'Density black point', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.22, group: G },
      v => { this.bakeMat.uniforms.uDLo.value = v; bake(); });
    q.register({ key: 'nebWhite', label: 'Density white point', type: 'range', min: 0.3, max: 1.4, step: 0.01, default: 0.86, group: G },
      v => { this.bakeMat.uniforms.uDHi.value = v; bake(); });
    q.register({ key: 'nebCoolMass', label: 'Cool cloud amount', type: 'range', min: 0, max: 2, step: 0.02, default: 1.75, group: G },
      v => { this.bakeMat.uniforms.uCoolAmt.value = v; bake(); });
    q.register({ key: 'nebCoolGain', label: 'Cool cloud brightness', type: 'range', min: 0, max: 2, step: 0.02, default: 0.44, group: G },
      v => { this.bakeMat.uniforms.uCoolGain.value = v; bake(); });
    // where the cool mass starts and where it is at full strength, in radians from the star
    q.register({ key: 'nebCoolNear', label: 'Cool cloud stand-off', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.055, group: G },
      v => { this.bakeMat.uniforms.uCoolNear.value = v; bake(); });
    q.register({ key: 'nebCoolFar', label: 'Cool cloud reach', type: 'range', min: 0.05, max: 1.2, step: 0.005, default: 0.24, group: G },
      v => { this.bakeMat.uniforms.uCoolFar.value = v; bake(); });
    q.register({ key: 'nebRayOcc', label: 'Ray occlusion by dust', type: 'range', min: 0, max: 6, step: 0.05, default: 1.35, group: G },
      v => { this.bakeMat.uniforms.uRayOcc.value = v; bake(); });
    q.register({ key: 'starChromaA', label: 'Star white→yellow (rad)', type: 'range', min: 0.005, max: 0.2, step: 0.005, default: 0.035, group: G },
      v => { this.bakeMat.uniforms.uChromA.value = v; bake(); });
    q.register({ key: 'starChromaB', label: 'Star yellow→orange (rad)', type: 'range', min: 0.03, max: 0.8, step: 0.005, default: 0.24, group: G },
      v => { this.bakeMat.uniforms.uChromB.value = v; bake(); });
    q.register({ key: 'nebScatter', label: 'In-cloud scatter', type: 'range', min: 0, max: 2, step: 0.02, default: 0.35, group: G },
      v => { this.bakeMat.uniforms.uScatter.value = v; bake(); });
    q.register({ key: 'nebDesat', label: 'Gas desaturation', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.26, group: G },
      v => { this.bakeMat.uniforms.uDesat.value = v; bake(); });
    q.register({ key: 'nebCool', label: 'Cool-gas brightness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.16, group: G },
      v => { this.bakeMat.uniforms.uCoolDim.value = v; bake(); });
    q.register({ key: 'nebGlow', label: 'Star blaze in cloud', type: 'range', min: 0, max: 3, step: 0.02, default: 1.0, group: G },
      v => { this.bakeMat.uniforms.uGlow.value = v; bake(); });
    q.register({ key: 'nebHalo', label: 'Wide halo', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.03, group: G },
      v => { this.bakeMat.uniforms.uHalo.value = v; bake(); });
    q.register({ key: 'nebRays', label: 'God rays', type: 'range', min: 0, max: 4, step: 0.02, default: 3.6, group: G },
      v => { this.bakeMat.uniforms.uRays.value = v; bake(); });
    // how far the shafts reach: smaller is longer. 5.0 kept them inside the flare in round 1.
    q.register({ key: 'nebRayReach', label: 'God-ray reach', type: 'range', min: 0.1, max: 6, step: 0.02, default: 0.28, group: G },
      v => { this.bakeMat.uniforms.uReach.value = v; bake(); });
    // the tight blaze around the star. At fov 35 the whole frame is inside 25° of it, so this
    // has to be sharp or the entire image is core.
    q.register({ key: 'nebFalloff', label: 'Core falloff', type: 'range', min: 20, max: 3000, step: 10, default: 1400, group: G },
      v => { this.bakeMat.uniforms.uFall.value = v; bake(); });
    q.register({ key: 'nebBroad', label: 'Lit hemisphere falloff', type: 'range', min: 0.1, max: 12, step: 0.02, default: 5.2, group: G },
      v => { this.bakeMat.uniforms.uBroad.value = v; bake(); });
    // the only per-pixel noise in the frame. Set it to 0 if a phone is fill-rate bound; the
    // medium preset already halves it.
    q.register({ key: 'nebDetail', label: 'Screen-scale filaments', type: 'range', min: 0, max: 1.6, step: 0.01, default: 0.42, group: G },
      v => { this.domeMat.uniforms.uDetail.value = v; });
    q.register({ key: 'nebDetailScale', label: 'Filament frequency', type: 'range', min: 10, max: 320, step: 1, default: 44, group: G },
      v => { this.domeMat.uniforms.uDetScale.value = v; });
    q.register({ key: 'nebLanes', label: 'Screen-scale dust lanes', type: 'range', min: 0, max: 2, step: 0.02, default: 0.55, group: G },
      v => { this.domeMat.uniforms.uLane.value = v; });
    q.register({ key: 'nebHue', label: 'Hue balance', type: 'range', min: -0.35, max: 0.35, step: 0.01, default: 0, group: G },
      v => { this.bakeMat.uniforms.uHueBias.value = v; bake(); });
    q.register({ key: 'nebGain', label: 'Nebula gain', type: 'range', min: 0.1, max: 3, step: 0.02, default: 1.9, group: G },
      v => { this.bakeMat.uniforms.uGain.value = v; bake(); });
    q.register({ key: 'nebCore', label: 'Core blowout', type: 'range', min: 0, max: 2, step: 0.02, default: 1.1, group: G },
      v => { this.bakeMat.uniforms.uCore.value = v; bake(); });
    q.register({ key: 'nebAmbient', label: 'Deep-space floor', type: 'range', min: 0, max: 0.4, step: 0.005, default: 0.015, group: G },
      v => { this.bakeMat.uniforms.uAmbient.value = v; bake(); });
    // the medium's own fill, unmodulated by cloud or by the star — part of the atmosphere set,
    // not of the nebula, which is why it groups with the fog and the dust cards
    q.register({ key: 'dustField', label: 'Flat dust field', type: 'range', min: 0, max: 0.5, step: 0.002, default: 0, group: 'Atmosphere' },
      v => { this.bakeMat.uniforms.uHaze.value = v; bake(); });
    q.register({ key: 'coolField', label: 'Cool sky field', type: 'range', min: 0, max: 0.5, step: 0.002, default: 0, group: 'Atmosphere' },
      v => { this.bakeMat.uniforms.uCoolField.value = v; bake(); });

    q.register({ key: 'starAz', label: 'Star azimuth', type: 'range', min: -180, max: 180, step: 1, default: -5, group: G },
      () => this.setDir(q));
    q.register({ key: 'starEl', label: 'Star elevation', type: 'range', min: -80, max: 80, step: 0.5, default: 3, group: G },
      () => this.setDir(q));

    q.register({ key: 'stars', label: 'Star count', type: 'range', min: 0, max: 2, step: 0.05, group: G },
      () => { this.starsDirty = true; });
    q.register({ key: 'starSize', label: 'Star size', type: 'range', min: 0.5, max: 5, step: 0.1, default: 1.5, group: G },
      v => { this.starMat.uniforms.uScale.value = v; });
    q.register({ key: 'starBright', label: 'Star brightness', type: 'range', min: 0, max: 6, step: 0.02, default: 4.2, group: G },
      () => { this.starsDirty = true; });
    q.register({ key: 'starOcclude', label: 'Gas occludes stars', type: 'range', min: 0, max: 20, step: 0.05, default: 13.0, group: G },
      v => { this.starMat.uniforms.uOcclude.value = v; });

    q.register({ key: 'flarePower', label: 'Flare power', type: 'range', min: 0, max: 6, step: 0.05, default: 1.5, group: G },
      v => { this.flareMat.uniforms.uPower.value = v; });
    // The palette's star is a K-type orange and the flare inherits all three of its hues, which
    // makes every backlit shot a sunset. A plate whose halo is a pale white wash needs the flare
    // pulled off the palette without unfreezing it.
    q.register({ key: 'flareTint', label: 'Flare toward white', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: G },
      v => this.setFlareTint(v));
    q.register({ key: 'flareSize', label: 'Flare size (deg)', type: 'range', min: 2, max: 90, step: 0.5, default: 26, group: G },
      v => { const s = 2 * Math.tan(v * Math.PI / 360); this.flare.scale.set(s, s, 1); });
    q.register({ key: 'flareHalo', label: 'Flare halo falloff', type: 'range', min: 1, max: 8, step: 0.05, default: 4.2, group: G },
      v => { this.flareMat.uniforms.uHaloPow.value = v; });
    q.register({ key: 'flareSpikes', label: 'Flare spikes', type: 'range', min: 0, max: 2, step: 0.02, default: 0.34, group: G },
      v => { this.flareMat.uniforms.uSpikes.value = v; });
    q.register({ key: 'flareStreak', label: 'Anamorphic streak', type: 'range', min: 0, max: 2, step: 0.02, default: 0.16, group: G },
      v => { this.flareMat.uniforms.uStreak.value = v; });
    q.register({ key: 'flareBreak', label: 'Flare break-up', type: 'range', min: 0, max: 1, step: 0.01, default: 0.42, group: G },
      v => { this.flareMat.uniforms.uBreak.value = v; this.bloomMat.uniforms.uBreak.value = v * 0.6; });

    q.register({ key: 'bloomPower', label: 'Glow over silhouette', type: 'range', min: 0, max: 2, step: 0.01, default: 0.34, group: G },
      v => { this.bloomMat.uniforms.uPower.value = v; this.bloom.visible = v > 0.001; });
    q.register({ key: 'bloomSize', label: 'Glow size (deg)', type: 'range', min: 4, max: 90, step: 0.5, default: 34, group: G },
      v => { const s = 2 * Math.tan(v * Math.PI / 360); this.bloom.scale.set(s, s, 1); });
    q.register({ key: 'bloomFalloff', label: 'Glow falloff', type: 'range', min: 1, max: 8, step: 0.05, default: 2.6, group: G },
      v => { this.bloomMat.uniforms.uHaloPow.value = v; });
    q.register({ key: 'bloomStreak', label: 'Glow streak', type: 'range', min: 0, max: 2, step: 0.02, default: 0.2, group: G },
      v => { this.bloomMat.uniforms.uStreak.value = v; });
    // the glow quad carries the flare's core and lobes as well as its halo, so raising it to get
    // a wide soft wash also clips a hard-edged white disc over the star. 0 leaves it pure halo.
    q.register({ key: 'bloomCore', label: 'Glow keeps a core', type: 'range', min: 0, max: 1, step: 0.01, default: 1, group: G },
      v => { this.bloomMat.uniforms.uCoreMul.value = v; });

    this.setDir(q);
  }

  setFlareTint(v) {
    const pale = new THREE.Color(0.92, 0.95, 1.0);
    for (const m of [this.flareMat, this.bloomMat]) {
      m.uniforms.uCore.value = new THREE.Color(this.sys.star).convertSRGBToLinear().lerp(pale, v);
      m.uniforms.uHalo.value = new THREE.Color(this.sys.starTint).convertSRGBToLinear().lerp(pale, v);
      m.uniforms.uOuter.value = new THREE.Color(this.sys.starOut).convertSRGBToLinear().lerp(pale, v * 0.92);
    }
  }

  setDir(q) {
    const az = (q.get('starAz') ?? 0) * Math.PI / 180;
    const el = (q.get('starEl') ?? 0) * Math.PI / 180;
    this.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.flare.position.copy(this.dir).multiplyScalar(R * 0.94);
    this.bloom.position.copy(this.dir).multiplyScalar(R * 0.94);
    this.dirty = true;
    this.starsDirty = true;
  }

  buildStars(q) {
    this.starsDirty = false;
    const n = Math.round(STAR_BASE * (q.get('stars') ?? 1));
    const bright = q.get('starBright') ?? 1;
    const rnd = rngFrom(90210 + Math.round(this.sys.seed * 1000));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(a), u, s * Math.sin(a));
      pos.set([d.x * R * 0.97, d.y * R * 0.97, d.z * R * 0.97], i * 3);
      // a handful of real spectral types against a mostly blue-white field. Under 4% carry a
      // colour you can name, which is what makes them read as stars rather than as noise.
      const ct = rnd();
      let r, g, b;
      if (ct < 0.005) { r = 1.0; g = 0.50; b = 0.34; }
      else if (ct < 0.016) { r = 1.0; g = 0.76; b = 0.44; }
      else if (ct < 0.038) { r = 0.52; g = 0.66; b = 1.0; }
      else { const t = rnd() ** 2.2; r = 0.80 + 0.20 * t; g = 0.85 + 0.13 * t; b = 0.99 - 0.11 * t; }
      // only the flare's own few degrees are guarded here. The rest of the fading is the gas's
      // job in the fragment shader — this scenario looks *at* the star, so a wide directional
      // fade deletes every star in shot, which is exactly what round 1 did.
      const near = Math.max(0, d.dot(this.dir));
      const fade = 1 - 0.97 * smoothstep(0.982, 0.9994, near);
      // magnitude, not brightness: a steep power gives a handful of bright stars and a long
      // faint tail. Size and magnitude come off the same draw, so a bright star is also the
      // bigger one — three critics in a row read the old uniform field as a dot screen.
      const u2 = rnd();
      const mag = u2 ** 5.5;
      const m = bright * fade * (0.002 + 0.998 * mag) * (ct < 0.038 ? 1.6 : 1);
      col.set([r * m, g * m, b * m], i * 3);
      size[i] = 0.20 + 2.4 * u2 ** 4.0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.stars.geometry.dispose();
    this.stars.geometry = g;
  }

  bake(app) {
    this.dirty = false;
    const res = +app.quality.get('nebulaRes') || 1024;
    const w = res, h = res >> 1;
    if (!this.rt || this.rt.width !== w) {
      if (this.rt) { untrack(this.rt.texture); this.rt.dispose(); }
      this.rt = new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
        stencilBuffer: false,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      });
      this.rt.texture.generateMipmaps = false;
      // the dome is always magnified, never minified, so mips would only cost memory
      track(this.rt.texture, { w, h, mips: false, label: `nebula ${w}×${h}` });
      this.domeMat.uniforms.uMap.value = this.rt.texture;
      this.starMat.uniforms.uMap.value = this.rt.texture;
    }
    const r = app.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.bakeScene, this.bakeCam);
    r.setRenderTarget(prev);
  }

  update(dt, app) {
    if (this.dirty) this.bake(app);
    if (this.starsDirty) this.buildStars(app.quality);
    this.starMat.uniforms.uDpr.value = app.renderer.getPixelRatio();
    const scale = Math.min(8000, app.camera.far * 0.35);
    this.object3D.position.copy(app.camera.position);
    this.object3D.scale.setScalar(scale);
    this.flare.quaternion.copy(app.camera.quaternion);
    this.bloom.quaternion.copy(app.camera.quaternion);
  }

  // World-space direction light travels *from* the star.
  lightDir(out = new THREE.Vector3()) { return out.copy(this.dir).multiplyScalar(-1); }
}
