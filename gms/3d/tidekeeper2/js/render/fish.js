/* ═══════════════════════════════════════════════════════════════════════════
   MAKING THEM SWIM
   One InstancedMesh per species. The body wave, the fin beat and the jelly
   pulse all happen on the GPU from per-instance attributes, so forty tetras
   are one draw call and every one of them is out of phase with its
   neighbours. The fragment shader adds the two things that stop a procedural
   fish looking like a plastic toy: a fresnel sheen that shifts hue across the
   flank, and a rim light along the silhouette.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { buildFish } from './fishbuild.js';

export const FISH_U = {
  uTime:  { value: 0 },
  uNight: { value: 0 },
  uAbsorb:{ value: new THREE.Vector3(0.36, 0.09, 0.055) },
  uFogCol:{ value: new THREE.Color(0x1a6b80) },
  uFogLo: { value: 0.0 },
};

/** Per-channel Beer–Lambert absorption, injected in place of three's fog.
    Red goes first, which is why everything deep looks blue. It is the single
    cheapest thing that makes a tank read as water rather than as air. */
export const WATER_FOG_PARS = `
  uniform vec3 uAbsorb; uniform vec3 uFogCol; uniform float uFogLo;
  vec3 tkWater(vec3 col, float dist){
    vec3 t = exp(-uAbsorb * max(0.0, dist - uFogLo));
    return mix(uFogCol, col, clamp(t, 0.0, 1.0));
  }`;
export const WATER_FOG_APPLY = `gl_FragColor.rgb = tkWater(gl_FragColor.rgb, vFogDepth);`;

/** Wire a standard material up to the water instead of three's fog. */
export function useWaterFog(sh) {
  sh.uniforms.uAbsorb = FISH_U.uAbsorb;
  sh.uniforms.uFogCol = FISH_U.uFogCol;
  sh.uniforms.uFogLo  = FISH_U.uFogLo;
  sh.vertexShader = 'varying float vFogDepth;\n' + sh.vertexShader.replace(
    '#include <fog_vertex>', '#include <fog_vertex>\n vFogDepth = -mvPosition.z;');
  sh.fragmentShader = 'varying float vFogDepth;\n' + WATER_FOG_PARS + '\n' + sh.fragmentShader;
  sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', WATER_FOG_APPLY);
}

export function fishMaterial(geo, sp) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.54, metalness: 0.0,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
    emissive: new THREE.Color(0x000000),
  });
  m.defines = {};
  if (geo.userData.jelly) { m.defines.TK_JELLY = 1; m.roughness = 0.12; m.depthWrite = false; }
  if (geo.userData.seahorse) m.defines.TK_SEAHORSE = 1;

  m.onBeforeCompile = sh => {
    sh.uniforms.uTime  = FISH_U.uTime;
    sh.uniforms.uNight = FISH_U.uNight;
    sh.uniforms.uWave  = { value: geo.userData.wave ?? 1 };
    sh.uniforms.uSheen = { value: sp.sheen ?? 0.5 };
    sh.uniforms.uRim   = { value: new THREE.Color(sp.pal.accent ?? 0x9fd8ff) };
    sh.uniforms.uScales = { value: (sp.shape || geo.userData.jelly) ? 0 : 1 };
    useWaterFog(sh);

    sh.vertexShader = `
      attribute float aSeg; attribute float aFin; attribute float aGlow; attribute vec3 aPivot;
      attribute vec2 aFinUV;
      attribute vec4 aAnim;   /* phase, tailBeat, waveAmp, finBeat */
      attribute vec4 aState;  /* glowMul, finDamage, sick, flash */
      uniform float uTime, uNight, uWave;
      varying float vGlow, vFlash, vSick, vFin; varying vec3 vObj; varying vec2 vFinUV;

      vec3 tkRotY(vec3 p, vec3 pivot, float a){
        vec3 d = p - pivot; float s = sin(a), c = cos(a);
        return pivot + vec3(d.x*c - d.z*s, d.y, d.x*s + d.z*c);
      }
      float tkBody(float seg){
        float env = smoothstep(0.08, 1.05, seg);
        return sin(seg * 5.4 - uTime * aAnim.y) * aAnim.z * uWave * env;
      }
    ` + sh.vertexShader;

    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      { float d = (tkBody(aSeg + 0.06) - tkBody(aSeg - 0.06)) / 0.12;
        float a = atan(d), s = sin(a), c = cos(a);
        objectNormal = vec3(objectNormal.x*c - objectNormal.z*s, objectNormal.y, objectNormal.x*s + objectNormal.z*c); }
    `);

    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vGlow = aGlow * aState.x; vFlash = aState.w; vSick = aState.z;
      vObj = position; vFin = aFin; vFinUV = aFinUV;
      #ifdef TK_JELLY
        float pulse = sin(uTime * aAnim.y * 0.55 + aAnim.x);
        float k = 0.17 * pulse * smoothstep(0.05, 1.0, min(aSeg, 1.0));
        transformed.yz *= (1.0 - k);
        transformed.x  -= k * 0.30;
        if (aFin > 5.5 && aFin < 6.5) {
          float lag = sin(uTime * aAnim.y * 0.55 + aAnim.x - (aSeg - 0.7) * 2.4);
          transformed.yz *= (1.0 - 0.10 * lag);
          transformed.z  += lag * 0.035 * (aSeg - 0.7);
          transformed.y  += cos(uTime * 0.6 + aAnim.x + aSeg * 3.0) * 0.020 * (aSeg - 0.7);
        }
      #else
        /* the body wave — everything but the eyes rides it */
        if (aFin < 4.5 || aFin > 5.5) transformed.z += tkBody(aSeg);
        /* pectorals row, out of phase with each other */
        if (aFin > 0.5 && aFin < 2.5) {
          float side = (aFin < 1.5) ? 1.0 : -1.0;
          float a = sin(uTime * aAnim.w + aAnim.x) * 0.40 * side;
          transformed = tkRotY(transformed, aPivot, a);
          transformed.y += sin(uTime * aAnim.w + aAnim.x + 1.6) * 0.018;
        }
        /* pelvics trail and sway */
        if (aFin > 6.5 && aFin < 8.5) {
          float side = (aFin < 7.5) ? 1.0 : -1.0;
          float a = sin(uTime * aAnim.w * 0.6 + aAnim.x + 0.8) * 0.22 * side;
          transformed = tkRotY(transformed, aPivot, a);
        }
        /* the median fins flutter on top of the wave */
        if (aFin > 3.5 && aFin < 4.5)
          transformed.z += sin(uTime * aAnim.w * 0.7 + aSeg * 9.0 + aAnim.x) * 0.015 * (1.0 + aState.y);
        /* barbels and tentacles lag behind the head */
        if (aFin > 5.5 && aFin < 6.5) {
          float lag = sin(uTime * aAnim.y * 0.8 + aAnim.x - aSeg * 3.2);
          transformed.z += lag * 0.045 * (aSeg - 0.2);
          transformed.y += cos(uTime * 0.9 + aAnim.x + aSeg * 2.0) * 0.018;
        }
        if (aFin > 8.5) {
          float w = sin(uTime * 2.2 + aAnim.x + aSeg * 6.0);
          transformed.y += w * 0.012; transformed.z += cos(uTime * 1.7 + aAnim.x) * 0.010;
        }
        #ifdef TK_SEAHORSE
          transformed = tkRotY(transformed, vec3(0.0), sin(uTime * 0.35 + aAnim.x) * 0.06);
        #endif
        /* a nipped fish visibly loses the tips of its finnage */
        if (aState.y > 0.02 && aFin > 2.5 && aFin < 5.5) {
          float ragged = fract(sin(aSeg * 91.7 + transformed.y * 57.3) * 43758.5453);
          float bite = step(1.0 - aState.y * 0.9, ragged);
          transformed.xyz = mix(transformed.xyz, aPivot + (transformed.xyz - aPivot) * 0.55, bite);
        }
      #endif
    `);

    sh.fragmentShader = `
      uniform float uNight, uSheen, uScales; uniform vec3 uRim;
      varying float vGlow, vFlash, vSick, vFin; varying vec3 vObj; varying vec2 vFinUV;
    ` + sh.fragmentShader;

    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewPosition);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
      bool onFin = vFin > 0.5 && vFin < 9.5 && abs(vFin - 5.0) > 0.5;
      if (!onFin) {
        /* a fine diamond lattice of scales, fading out toward the snout */
        float lat = sin(vObj.x * 176.0 + vObj.y * 62.0) * sin(vObj.x * 52.0 - (vObj.y + vObj.z) * 150.0);
        float scaled = uScales * smoothstep(0.44, 0.26, vObj.x);
        gl_FragColor.rgb *= 1.0 + clamp(lat, -1.0, 1.0) * 0.030 * scaled;
      } else {
        /* fin rays: stiff spines with thin membrane stretched between them.
           Dorsal and anal fins run along the body; the rest fan from a root. */
        float along = (vFin > 3.5 && vFin < 4.5) ? vFinUV.x : vFinUV.y;
        float ray = pow(abs(sin(along * 3.14159 * 13.0)), 0.55);
        gl_FragColor.rgb *= 0.72 + 0.36 * ray;
        gl_FragColor.a *= (0.55 + 0.45 * ray) * (1.0 - pow(vFinUV.x, 1.15) * 0.78);
        gl_FragColor.rgb += vec3(0.90, 0.95, 1.0) * fres * 0.13;
      }
      /* iridescence: a hue that walks across the flank as the fish turns */
      vec3 irid = 0.5 + 0.5 * cos(6.28318 * (fres * 1.7 + vec3(0.0, 0.33, 0.67)));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * (0.72 + 0.55 * irid), uSheen * fres * 0.45);
      gl_FragColor.rgb += uRim * fres * uSheen * 0.10;
      /* bioluminescence: almost invisible by day, the whole show at night */
      gl_FragColor.rgb += diffuseColor.rgb * vGlow * (0.12 + 1.75 * uNight);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), vFlash * 0.7);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.95, 0.97), vSick * 0.28);
    `);
  };
  return m;
}

/** One species → one instanced mesh plus its per-instance attribute buffers. */
export class SpeciesBatch {
  constructor(sp, cap = 80) {
    this.sp = sp; this.cap = cap;
    this.geo = buildFish(sp);
    this.mat = fishMaterial(this.geo, sp);
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.state.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aAnim', this.anim);
    this.geo.setAttribute('aState', this.state);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = sp.shape === 'jelly' ? 6 : 4;
    this.mesh.userData.species = sp.id;
    this.at = [];
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
