import * as THREE from 'three';
import { makeStoneSet, makeNoiseTexture, makeInteriorTexture } from './textures.js';
import { addPlanarReflection } from '../fx/reflection.js';

// Darkens surfaces near their foot (fake contact AO) using the fog world-position varying.
export function contactAO(material, { y0 = 0, range = 1.6, min = 0.55 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_FOG
  diffuseColor.rgb *= mix( ${min.toFixed(3)}, 1.0, smoothstep( 0.0, ${range.toFixed(3)}, vFogWorldPos.y - ${y0.toFixed(3)} ) );
#endif`);
  };
  const k = material.customProgramCacheKey?.() || '';
  material.customProgramCacheKey = () => k + `ao${y0}${range}${min}`;
  return material;
}

export function createMaterials(reflection, tier) {
  const M = {};
  const cream = makeStoneSet({ tiles: 4, base: [236, 229, 216], vary: 9, vein: [168, 150, 122], veinAlpha: 0.16, grout: [196, 184, 164], rough: [0.05, 0.14], seed: 11 });
  const slate = makeStoneSet({ tiles: 4, base: [86, 92, 102], vary: 7, vein: [140, 150, 165], veinAlpha: 0.1, grout: [44, 48, 54], rough: [0.03, 0.1], seed: 5 });
  const warm = makeStoneSet({ tiles: 8, base: [214, 204, 188], vary: 12, vein: [150, 135, 110], veinAlpha: 0.1, grout: [128, 114, 94], rough: [0.14, 0.3], seed: 23 });
  const noise = makeNoiseTexture(256, 4);

  const floor = (set, color, rough, strength, base, tint, sky = 0, skySat = 0.55) => {
    const m = new THREE.MeshStandardMaterial({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6), color, roughness: rough, metalness: 0.0, envMapIntensity: 0.55 });
    if (reflection?.enabled) addPlanarReflection(m, reflection, { strength, base, blur: 2.2, distort: 0.05, tint, sky, skySat });
    return m;
  };
  M.marble = floor(cream, 0xffffff, 1.0, 1.0, 0.3, null, 1, 0.22);
  M.slate = floor(slate, 0xffffff, 1.0, 1.0, 0.42, new THREE.Color(0.95, 0.98, 1.05));
  M.terrace = new THREE.MeshStandardMaterial({ map: warm.map, roughnessMap: warm.roughnessMap, normalMap: warm.normalMap, roughness: 1, envMapIntensity: 0.8 });
  M.stoneTex = { cream, slate, warm };

  M.stone = contactAO(new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.42, metalness: 0.0, vertexColors: true, roughnessMap: noise, envMapIntensity: 0.9 }));
  M.stoneUpper = new THREE.MeshStandardMaterial({ color: 0xf2eadb, roughness: 0.38, metalness: 0.0, vertexColors: true, envMapIntensity: 0.9 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xf6cd78, roughness: 0.18, metalness: 1.0, vertexColors: true, envMapIntensity: 1.25 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.08, metalness: 1.0, vertexColors: true, envMapIntensity: 1.2 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.28, metalness: 0.85, vertexColors: true, envMapIntensity: 1.0 });
  M.glassDark = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.06, metalness: 0.9, vertexColors: true, envMapIntensity: 1.3 });
  M.glassRail = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22,
    envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  M.warmGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 3.2, vertexColors: true });
  M.shopGlow = interiorMaterial(makeInteriorTexture());
  M.blueGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.35, 0.78, 1.0), emissiveIntensity: 4.0, vertexColors: true });
  M.foliage = new THREE.MeshStandardMaterial({ color: 0x557f30, roughness: 0.85, metalness: 0, vertexColors: true, envMapIntensity: 0.9, emissive: new THREE.Color(0.012, 0.02, 0.004) });
  M.bark = new THREE.MeshStandardMaterial({ color: 0x7a6450, roughness: 0.85, vertexColors: true });
  M.soil = new THREE.MeshStandardMaterial({ color: 0x3b3024, roughness: 1, vertexColors: true });
  M.facade = facadeGlass(new THREE.MeshStandardMaterial({ color: 0x8a9aae, roughness: 0.06, metalness: 0.95, vertexColors: true, envMapIntensity: 1.35 }), 1.0);
  M.facadeWarm = facadeGlass(new THREE.MeshStandardMaterial({ color: 0xa08a68, roughness: 0.1, metalness: 0.9, vertexColors: true, envMapIntensity: 1.3 }), 0.0);
  M.facadeSky = facadeGlass(new THREE.MeshStandardMaterial({ color: 0x8098b4, roughness: 0.07, metalness: 0.9, envMapIntensity: 1.35 }), 1.0);
  M.skyStone = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.4, metalness: 0.05, envMapIntensity: 0.9 });
  M.statue = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.22, metalness: 0.75, envMapIntensity: 1.1 });
  M.canopyA = new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 0.6, side: THREE.DoubleSide, vertexColors: true });
  M.canopyB = new THREE.MeshStandardMaterial({ color: 0x2f6f9a, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true });
  M.dumpster = new THREE.MeshStandardMaterial({ color: 0x3f5a4a, roughness: 0.55, metalness: 0.5, vertexColors: true });
  M.crate = new THREE.MeshStandardMaterial({ color: 0xb98a4a, roughness: 0.5, metalness: 0.3, vertexColors: true });
  M.foliage.userData.reflect = true; M.bark.userData.reflect = false; M.soil.userData.reflect = false;
  M.gold.userData.reflectMin = 7; M.chrome.userData.reflectMin = 7; M.darkMetal.userData.reflectMin = 7; M.glassRail.userData.reflect = false;
  M.goldSolid = new THREE.MeshStandardMaterial({ color: 0xf6cd78, roughness: 0.16, metalness: 1.0, envMapIntensity: 1.3 });
  M.chromeSolid = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.06, metalness: 1.0, envMapIntensity: 1.2 });
  M.coreGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.55, 0.85, 1.0), emissiveIntensity: 6 });
  M.uber = contactAO(uberMaterial());
  for (const k of ['stone', 'stoneUpper', 'gold', 'chrome', 'darkMetal', 'glassDark', 'warmGlow', 'blueGlow', 'bark', 'soil', 'dumpster', 'crate']) M[k].userData.uber = true;
  for (const k in M) if (M[k]?.isMaterial && !M[k].name) M[k].name = k;
  return M;
}

// Per-vertex metal/rough/glow/env (see batch.js `uber`); colour comes from the vertex colour.
function uberMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: 1 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 pbr;\nvarying vec4 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPbr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 glowC = diffuseColor.rgb * vPbr.z; diffuseColor.rgb *= 1.0 - vPbr.z;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.x;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowC;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= vPbr.w; iblIrradiance *= vPbr.w;');
  };
  m.customProgramCacheKey = () => 'uber';
  return m;
}

// Curtain-wall glass: floor spandrels + mullions + a scatter of warm lit windows, from world position.
function facadeGlass(m, cool = 1) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
float fh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
#ifdef USE_FOG
{
  vec3 wp = vFogWorldPos;
  vec3 an = abs(inverseTransformDirection(normalize(vNormal), viewMatrix));
  float u = an.x > an.z ? wp.z : wp.x;
  float fy = fract(wp.y / 4.2);
  float aa = 1.0 - smoothstep(0.08, 0.3, max(fwidth(wp.y / 4.2), fwidth(u / 1.6)));
  float spandrel = smoothstep(0.86, 0.88, fy) * smoothstep(0.99, 0.97, fy) * aa;
  float mull = smoothstep(0.95, 0.97, fract(u / 1.6));
  vec2 cell = vec2(floor(u / 1.6), floor(wp.y / 4.2));
  float lit = step(0.975, fh(cell)) * (1.0 - spandrel) * step(0.3, an.y < 0.5 ? 1.0 : 0.0) * (0.3 + 0.7 * aa);
  mull *= aa;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.62), spandrel * 0.8);
  diffuseColor.rgb *= 0.9 + 0.2 * fh(cell + 3.1) * aa;
  metalnessFactor = mix(metalnessFactor, 0.1, spandrel);
  roughnessFactor = mix(roughnessFactor, 0.45, spandrel);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.8, 0.85), mull * 0.35);
  totalEmissiveRadiance += vec3(1.0, 0.75, 0.45) * lit * 0.35 + vec3(0.3, 0.6, 1.0) * ${cool.toFixed(2)} * step(0.985, fh(cell + 7.0)) * 1.5;
}
#endif`);
  };
  m.customProgramCacheKey = () => 'facade' + cool;
  return m;
}

// Lit interiors behind glass, mapped in world space so every shopfront gets the same scale.
function interiorMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0x14100c, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.6, emissiveMap: tex, vertexColors: true, roughness: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `
#ifdef USE_FOG
{
  vec3 an = abs(inverseTransformDirection(normalize(vNormal), viewMatrix));
  float u = (an.x > an.z ? vFogWorldPos.z : vFogWorldPos.x) / 14.0;
  float v = fract(vFogWorldPos.y / 5.6 + 0.02);
  totalEmissiveRadiance *= texture2D(emissiveMap, vec2(u, v)).rgb;
}
#endif`);
  };
  m.customProgramCacheKey = () => 'interior';
  return m;
}
