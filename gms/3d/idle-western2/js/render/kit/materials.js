import * as THREE from 'three';
import { createSurfaces, SURF_HEAD, SURF_COLOR, SURF_NORMAL } from './surface.js?v=20261004d';

// One PBR material for every merged static mesh. Per-vertex `aPbr` = (roughness, metalness, glow, sway+1):
// glow > 0 always emits (neon, bulbs), glow < 0 emits only at night (windows); w = 1 means rigid.
const PBR_VERT_HEAD = `#include <common>
attribute vec4 aPbr;
varying vec3 vPbr;
varying float vSurf;
varying vec3 vWP;
varying vec3 vWN;
uniform float uTime;
uniform float uWind;`;
const PBR_SWAY = `#include <begin_vertex>
{
  float sw = aPbr.w - 1.0;
  if (sw > 0.001) {
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    #endif
    float ph = wp.x * 0.21 + wp.z * 0.17;
    transformed.x += sw * uWind * (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25);
    transformed.z += sw * uWind * sin(uTime * 1.1 + ph * 1.3) * 0.4;
  }
}`;

// Soft toy sheen: a fresnel lift tinted by the sky/sun so silhouettes glow a little, like lit vinyl.
export const RIM_FRAG = `{
  float fr = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
  outgoingLight += uRim * fr * (0.35 + 0.65 * diffuseColor.rgb);
}`;

// World-space light the three.js rig can't give cheaply: warm bounce off the paving onto low walls, and the nearest
// street lamps as real warm pools at night (one uniform loop, skipped by day).
export const WORLD_LIGHT_HEAD = `uniform vec3 uBounce;
uniform vec4 uLamps[8];
uniform vec3 uLampCol;
uniform float uLampK;`;
export const WORLD_LIGHT_FRAG = `{
  vec3 wn = normalize(vWN);
  float low = 1.0 - smoothstep(0.0, 3.2, vWP.y);
  outgoingLight += uBounce * diffuseColor.rgb * low * (0.35 + 0.65 * (1.0 - abs(wn.y)));
  if (uLampK > 0.001) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec3 d = uLamps[i].xyz - vWP;
      float r2 = dot(d, d), h2 = dot(d.xz, d.xz);
      float fall = uLamps[i].w * uLamps[i].w * 0.8 * exp(-h2 / 7.0) * max(0.0, 1.0 - r2 / 70.0);
      float ndl = 0.35 + 0.65 * max(dot(wn, d * inversesqrt(r2 + 1e-4)), 0.0);
      acc += fall * ndl * (0.28 + 0.72 * max(wn.y, 0.0));
    }
    outgoingLight += diffuseColor.rgb * uLampCol * acc * uLampK;
  }
}`;
export const WORLD_POS_VERT = `#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  vec3 wn3 = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    wn3 = mat3(instanceMatrix) * wn3;
  #endif
  vWP = (modelMatrix * wp4).xyz;
  vWN = mat3(modelMatrix) * wn3;
}`;

function pbrPatch(mat, uniforms, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', PBR_VERT_HEAD)
      .replace('#include <begin_vertex>', PBR_SWAY)
      .replace('#include <color_vertex>', '#include <color_vertex>\nvPbr = aPbr.xyz;\nvSurf = aPbr.w;')
      .replace('#include <project_vertex>', WORLD_POS_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;\nvarying vec3 vWP;\nvarying vec3 vWN;\nuniform float uNight;\nuniform float uGlow;\nuniform vec3 uRim;\n' + WORLD_LIGHT_HEAD + SURF_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SURF_NORMAL)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vPbr.x, 0.04, 1.0);\nif (sfR >= 0.0) roughnessFactor = sfR;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * (max(vPbr.z, 0.0) * uGlow + max(-vPbr.z, 0.0) * uNight * 2.2);`)
      .replace('#include <opaque_fragment>', `${RIM_FRAG}
${WORLD_LIGHT_FRAG}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function createMaterials() {
  const uTime = { value: 0 }, uNight = { value: 0 }, uWind = { value: 0.5 }, uGlow = { value: 1 };
  const uRim = { value: new THREE.Color(0.12, 0.1, 0.1) }, uRimCrowd = { value: new THREE.Color(0.5, 0.4, 0.35) };
  const uBounce = { value: new THREE.Color(0, 0, 0) }, uLampCol = { value: new THREE.Color('#ff7418') }, uLampK = { value: 0 };
  const uLamps = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) };
  const shared = { ...createSurfaces(), uTime, uNight, uWind, uGlow, uRim, uRimCrowd, uBounce, uLamps, uLampCol, uLampK };
  const makeUber = () => pbrPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.2 }), shared, 'iw2-uber');
  const uber = makeUber();
  uber.userData.uber = true;
  // three recompiles the program key whenever one material alternates between instanced / non-instanced / receiveShadow
  // meshes (~20 getProgram calls per frame here), so each mesh flavour gets its own identical copy of the uber material.
  const flavours = new Map([['rs', uber]]), uberAll = [uber];
  const flavour = (o) => (o.receiveShadow ? 'rs' : '') + (o.isInstancedMesh ? 'i' : '') + (o.instanceColor ? 'c' : '') + (o.geometry?.attributes.color?.itemSize === 4 ? 'a' : '');
  const depths = new Map();
  function splitUber(root) {
    root.traverse((o) => {
      if (o.isMesh && o.material && !o.customDepthMaterial && !o.material.map && !o.material.alphaTest && !o.material.displacementMap) {
        const k = (o.receiveShadow ? 'r' : '') + (o.isInstancedMesh ? 'i' : '') + (o.isSkinnedMesh ? 's' : '');
        if (!depths.has(k)) depths.set(k, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
        o.customDepthMaterial = depths.get(k);
      }
      if (!o.material?.userData?.uber) return;
      const k = flavour(o);
      let m = flavours.get(k);
      if (!m) { m = makeUber(); m.userData.uber = true; m.envMapIntensity = uber.envMapIntensity; flavours.set(k, m); uberAll.push(m); }
      if (o.material !== m) o.material = m;
    });
  }
  const water = pbrPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, envMapIntensity: 0.4, transparent: true, opacity: 0.92 }), shared, 'iw2-water');
  const blobTex = radialTexture();
  const basicBlob = new THREE.MeshBasicMaterial({ color: 0x34243f, map: blobTex, transparent: true, opacity: 0.58, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const boxTex = softBoxTexture();
  const contact = new THREE.MeshBasicMaterial({ color: 0x34263f, map: boxTex, vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowSprite = new THREE.MeshBasicMaterial({ map: blobTex, color: 0xffd28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const basicSky = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  return {
    uber, uberAll, splitUber, water, basicBlob, contact, contactInst: new THREE.MeshBasicMaterial({ color: 0x3b2c4a, map: boxTex, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), glowSprite, basicSky, uTime, uNight, uWind, uGlow, uRim, uRimCrowd, uBounce, uLamps, uLampCol, uLampK, shared,
    lambertVC: uber, lambertVCInst: uber,
    crowd: null,
  };
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft rounded-rectangle falloff: contact shadows under stalls, walls, wheels and planters.
function softBoxTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = Math.abs((x + 0.5) / 32 - 1), v = Math.abs((y + 0.5) / 32 - 1);
    const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
    const a = Math.max(0, Math.min(1, (1 - d) / 0.5));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
