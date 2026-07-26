// Scenery: six biomes × seven times of day × weather, driven by one
// parametric sky shader plus per-preset lights, fog, clouds and particles.
// A mission picks { time, biome, weather } and applyEnvironment() does the rest.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LITE_MODE } from './config.js';
import { rand, mulberry32, smoothstep } from './utils.js';
import {
  scene, envRoot, sunLight, hemiLight, setBloom, renderer, camera, lowQuality,
} from './render.js';
import { buildTerrain, terrainHeight, resettleDetail } from './terrain.js';
import { emit } from './bus.js';

const C = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------------------
// Biomes — terrain shape, palette, clutter and which props belong here
// ---------------------------------------------------------------------------

export const BIOMES = {
  farmland: {
    id: 'farmland', name: 'HARVEST COUNTRY',
    relief: 1.0, rough: 1.0, dunes: 0, mountains: 1.0, grain: 0.1, roughness: 0.96,
    cLow: C(0x7d6a2e), cMid: C(0x9a8038), cHigh: C(0xb59a4a),
    cRock: C(0x5d5236), cFar: C(0x3b4230),
    detail: { kind: 'grass', count: 620, colour: 0xc4a253, scale: 1.0 },
    props: { haybale: 9, tree_oak: 11, fence: 6, silo: 2, shack: 3, drum: 6, rock: 4, wagon: 2,
      fuel_tank: 2, ammo_crate: 3, gas_bottles: 3, truck: 3, water_tower: 2, statue: 1 },
    decor: { kind: 'tree_oak', count: 26 },
  },
  desert: {
    id: 'desert', name: 'THE DUST LINE',
    relief: 0.85, rough: 0.8, dunes: 1.5, mountains: 1.15, grain: 0.08, roughness: 1.0,
    cLow: C(0x9c7f4e), cMid: C(0xbb9a62), cHigh: C(0xd4b57c),
    cRock: C(0x8a5c40), cFar: C(0x8a6c50),
    detail: { kind: 'rock', count: 300, colour: 0xb08a5e, scale: 1.0 },
    props: { cactus: 9, rock: 12, ruin: 6, drum: 6, shack: 3, pylon: 4, wreck: 4,
      fuel_tank: 3, ammo_crate: 3, gas_bottles: 3, truck: 3, water_tower: 2, billboard: 2 },
    decor: { kind: 'spire', count: 20 },
  },
  tundra: {
    id: 'tundra', name: 'WINTERREACH',
    relief: 0.95, rough: 0.7, dunes: 0.9, mountains: 1.4, grain: 0.06, roughness: 0.7,
    cLow: C(0xbfc9d2), cMid: C(0xd8e2ea), cHigh: C(0xeef4f8),
    cRock: C(0x6a7280), cFar: C(0x8e9dae),
    detail: { kind: 'rock', count: 240, colour: 0xc6d0da, scale: 0.9 },
    props: { pine: 12, rock: 8, hut: 4, fence: 4, drum: 4, wreck: 4, pylon: 3,
      fuel_tank: 2, ammo_crate: 3, gas_bottles: 2, truck: 3, transformer: 3, water_tower: 2 },
    decor: { kind: 'pine', count: 30 },
  },
  forest: {
    id: 'forest', name: 'THE GREENBELT',
    relief: 1.25, rough: 1.15, dunes: 0, mountains: 1.25, grain: 0.12, roughness: 0.95,
    cLow: C(0x39492c), cMid: C(0x4d6136), cHigh: C(0x637a42),
    cRock: C(0x4a4740), cFar: C(0x2c3a2a),
    detail: { kind: 'grass', count: 700, colour: 0x7ba04e, scale: 1.1 },
    props: { pine: 15, tree_oak: 11, rock: 7, log: 6, shack: 2, drum: 4, fence: 4,
      ammo_crate: 2, gas_bottles: 2, truck: 2, fuel_tank: 1, statue: 1 },
    decor: { kind: 'pine', count: 34 },
  },
  industrial: {
    id: 'industrial', name: 'THE ASHWORKS',
    relief: 0.7, rough: 1.3, dunes: 0, mountains: 0.95, grain: 0.1, roughness: 0.85,
    cLow: C(0x4a4a4e), cMid: C(0x5c5a58), cHigh: C(0x6e6a62),
    cRock: C(0x3e3a38), cFar: C(0x2e2c30),
    detail: { kind: 'rock', count: 260, colour: 0x76726a, scale: 0.95 },
    props: { wall: 10, container: 9, silo: 4, pylon: 5, drum: 8, ruin: 6, wreck: 4,
      fuel_tank: 5, ammo_crate: 5, gas_bottles: 4, transformer: 5, gantry: 4,
      chimney: 3, truck: 4, billboard: 2 },
    decor: { kind: 'tower', count: 16 },
  },
  volcanic: {
    id: 'volcanic', name: 'THE CINDER FLATS',
    relief: 1.35, rough: 1.5, dunes: 0, mountains: 1.5, grain: 0.14, roughness: 0.9,
    cLow: C(0x554442), cMid: C(0x685049), cHigh: C(0x7c5c4c),
    cRock: C(0x453637), cFar: C(0x342a2e), ember: true,
    detail: { kind: 'rock', count: 280, colour: 0x6a5450, scale: 1.05 },
    props: { spire: 9, dead_tree: 8, rock: 9, ruin: 5, drum: 7, wreck: 5, pylon: 3,
      fuel_tank: 4, ammo_crate: 4, gas_bottles: 3, transformer: 3, gantry: 3, chimney: 2 },
    decor: { kind: 'spire', count: 24 },
  },
};

// ---------------------------------------------------------------------------
// Times of day
// ---------------------------------------------------------------------------

export const TIMES = {
  dawn: {
    id: 'dawn', name: 'DAWN',
    zenith: C(0x2a3a6a), mid: C(0x7a6a9a), horizon: C(0xffb27a),
    sunYaw: 1.9, sunPitch: 0.13, sunCol: C(0xffc89a), sunInt: 1.55,
    hemiSky: C(0xa8b6e0), hemiGround: C(0x8a7458), hemiInt: 1.28,
    fog: C(0xc9a88a), fogNear: 95, fogFar: 560, exposure: 1.1,
    bloom: 0.62, stars: 0.12, haze: 1.25, sunGlow: 1.0,
    clouds: { count: 9, tint: C(0xffb894), alt: 120, opacity: 1 },
    weather: 'mist',
  },
  morning: {
    id: 'morning', name: 'MORNING',
    zenith: C(0x2e5aa0), mid: C(0x74a8d8), horizon: C(0xd8e6f0),
    sunYaw: 2.5, sunPitch: 0.42, sunCol: C(0xfff2d8), sunInt: 2.0,
    hemiSky: C(0xa8ccf0), hemiGround: C(0x6a5c40), hemiInt: 1.05,
    fog: C(0xc4d8ea), fogNear: 100, fogFar: 620, exposure: 1.06,
    bloom: 0.42, stars: 0, haze: 0.9, sunGlow: 0.85,
    clouds: { count: 11, tint: C(0xffffff), alt: 150, opacity: 1 },
    weather: 'clear',
  },
  noon: {
    id: 'noon', name: 'HIGH NOON',
    zenith: C(0x1e56ae), mid: C(0x5c9ede), horizon: C(0xc8e0f2),
    sunYaw: 3.6, sunPitch: 1.05, sunCol: C(0xffffff), sunInt: 2.35,
    hemiSky: C(0xb0d4f4), hemiGround: C(0x7a6a4a), hemiInt: 1.15,
    fog: C(0xbcd6ec), fogNear: 130, fogFar: 720, exposure: 1.0,
    bloom: 0.34, stars: 0, haze: 0.7, sunGlow: 0.7,
    clouds: { count: 8, tint: C(0xffffff), alt: 175, opacity: 1 },
    weather: 'clear',
  },
  golden: {
    id: 'golden', name: 'GOLDEN HOUR',
    zenith: C(0x2a4a86), mid: C(0x9a7a86), horizon: C(0xffa848),
    sunYaw: 4.9, sunPitch: 0.16, sunCol: C(0xffc266), sunInt: 2.1,
    hemiSky: C(0xc0a0d0), hemiGround: C(0x96703c), hemiInt: 1.32,
    fog: C(0xdba070), fogNear: 90, fogFar: 540, exposure: 1.12,
    bloom: 0.7, stars: 0, haze: 1.6, sunGlow: 1.2,
    clouds: { count: 12, tint: C(0xffa870), alt: 130, opacity: 1 },
    weather: 'clear',
  },
  dusk: {
    id: 'dusk', name: 'LAST LIGHT',
    zenith: C(0x120e28), mid: C(0x53204e), horizon: C(0xf06a24),
    sunYaw: 5.3, sunPitch: 0.05, sunCol: C(0xff9a54), sunInt: 1.8,
    hemiSky: C(0x9a6ab0), hemiGround: C(0x6a4828), hemiInt: 1.26,
    fog: C(0x8a4a52), fogNear: 70, fogFar: 470, exposure: 1.18,
    bloom: 0.85, stars: 0.45, haze: 1.8, sunGlow: 1.35,
    clouds: { count: 12, tint: C(0xff6a4a), alt: 115, opacity: 1 },
    weather: 'fireflies',
  },
  night: {
    id: 'night', name: 'NIGHT WATCH',
    zenith: C(0x060814), mid: C(0x101a34), horizon: C(0x243a58),
    sunYaw: 2.2, sunPitch: 0.55, sunCol: C(0xcfdcff), sunInt: 0.92,
    hemiSky: C(0x5a6a9a), hemiGround: C(0x2e333c), hemiInt: 0.86,
    fog: C(0x0e1424), fogNear: 55, fogFar: 400, exposure: 1.3,
    bloom: 1.05, stars: 1.0, haze: 0.5, sunGlow: 0.45,
    clouds: { count: 7, tint: C(0x2a3450), alt: 140, opacity: 0.8 },
    weather: 'fireflies',
  },
  storm: {
    id: 'storm', name: 'STORMFRONT',
    zenith: C(0x1c2028), mid: C(0x34383e), horizon: C(0x4a4e52),
    sunYaw: 3.1, sunPitch: 0.6, sunCol: C(0x9aa4b0), sunInt: 0.95,
    hemiSky: C(0x6a7284), hemiGround: C(0x3e3e44), hemiInt: 1.22,
    fog: C(0x3a4048), fogNear: 45, fogFar: 330, exposure: 1.22,
    bloom: 0.55, stars: 0, haze: 0.9, sunGlow: 0.2,
    clouds: { count: 20, tint: C(0x2a2e36), alt: 95, opacity: 1 },
    weather: 'rain', lightning: true,
  },
};

// Weather that suits a biome when a mission does not say otherwise.
const BIOME_WEATHER = {
  tundra: 'snow', desert: 'dust', volcanic: 'ash',
};

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------

let sky = null;
let skyUniforms = null;
let cloudGroup = null;
const clouds = [];

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SKY_FRAG = `
  uniform vec3 uZenith, uMid, uHorizon, uSunCol, uSunDir;
  uniform float uHaze, uStars, uSunGlow, uTime, uFlash;
  varying vec3 vDir;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(-0.06, 0.30, h));
    col = mix(col, uZenith, smoothstep(0.20, 0.92, h));

    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * pow(sd, 5.0) * 0.26 * uHaze;
    col += uSunCol * pow(sd, 300.0) * 1.1 * uSunGlow;
    col += uSunCol * smoothstep(0.99965, 0.99985, sd) * 2.6 * uSunGlow;
    col += uHorizon * 0.22 * exp(-abs(h) * 13.0) * uHaze;

    if (uStars > 0.001 && h > 0.0) {
      vec3 g = floor(d * 260.0);
      float s = hash13(g);
      float tw = step(0.9970, s);
      float fade = smoothstep(0.0, 0.35, h) * uStars;
      col += vec3(0.82, 0.86, 1.0) * tw * fade *
             (0.55 + 0.45 * sin(uTime * 2.5 + s * 90.0));
    }
    col += vec3(0.9, 0.93, 1.0) * uFlash;
    gl_FragColor = vec4(col, 1.0);
  }`;

function buildSky() {
  skyUniforms = {
    uZenith: { value: C(0x101828) },
    uMid: { value: C(0x304a70) },
    uHorizon: { value: C(0xffa060) },
    uSunCol: { value: C(0xffd0a0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.3, -0.8).normalize() },
    uHaze: { value: 1.2 },
    uStars: { value: 0 },
    uSunGlow: { value: 1 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  };
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
  sky.frustumCulled = false;
  envRoot.add(sky);
}

function buildClouds(preset, seed) {
  if (cloudGroup) {
    envRoot.remove(cloudGroup);
    cloudGroup.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    cloudGroup = null;
  }
  clouds.length = 0;
  const cfg = preset.clouds;
  if (!cfg || cfg.count === 0) return;

  const rng = mulberry32(seed ^ 0x1b3f7e);
  cloudGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.tint, emissive: cfg.tint, emissiveIntensity: 0.28,
    flatShading: true, roughness: 1, fog: false,
    transparent: cfg.opacity < 1, opacity: cfg.opacity,
  });
  // each cloud's lumps are merged so a full sky costs a dozen draw calls
  const geo = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  for (let i = 0; i < cfg.count; i++) {
    const lumps = 2 + Math.floor(rng() * 3);
    const parts = [];
    for (let j = 0; j < lumps; j++) {
      const c = geo.clone();
      const s = 12 + rng() * 22;
      c.scale(s * (3.0 + rng() * 2.6), s * (0.11 + rng() * 0.1), s * (1.0 + rng() * 0.8));
      c.translate((rng() - 0.5) * 60, (rng() - 0.5) * 8, (rng() - 0.5) * 24);
      parts.push(c);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const g = new THREE.Mesh(merged, mat);
    const a = rng() * Math.PI * 2;
    const r = 340 + rng() * 460;
    g.position.set(Math.cos(a) * r, cfg.alt * 1.5 + (rng() - 0.5) * 60, Math.sin(a) * r);
    g.rotation.y = rng() * Math.PI;
    g.frustumCulled = true;
    cloudGroup.add(g);
    clouds.push({ g, baseX: g.position.x, speed: 0.5 + rng() * 1.6 });
  }
  geo.dispose();
  envRoot.add(cloudGroup);
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

let weatherKind = 'clear';
let rainMesh = null;
let flakes = null;
let flakeSeeds = [];
let mistGroup = null;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

const WEATHER_CFG = {
  rain:      { count: 680, colour: 0xbcd4ec, size: 0, fall: 68, sway: 2.0, additive: false },
  snow:      { count: 760, colour: 0xffffff, size: 0.42, fall: 5.5, sway: 3.2, additive: false },
  ash:       { count: 480, colour: 0xff8a3c, size: 0.34, fall: -1.8, sway: 3.0, additive: true },
  dust:      { count: 420, colour: 0xd8b888, size: 0.4, fall: 1.2, sway: 6.0, additive: false },
  fireflies: { count: 180, colour: 0xc8ff7a, size: 0.3, fall: 0.2, sway: 2.4, additive: true },
  mist:      { count: 0 },
  clear:     { count: 0 },
};

function clearWeather() {
  if (rainMesh) { envRoot.remove(rainMesh); rainMesh.geometry.dispose(); rainMesh.material.dispose(); rainMesh = null; }
  if (flakes) { envRoot.remove(flakes); flakes.geometry.dispose(); flakes.material.dispose(); flakes = null; }
  if (mistGroup) {
    envRoot.remove(mistGroup);
    mistGroup.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
    mistGroup = null;
  }
  flakeSeeds = [];
}

const WEATHER_BOX = 110;   // particles are recycled inside this box around the camera

// A soft round dot, generated once. Without it every snowflake and firefly is
// a hard square.
let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

function buildWeather(kind, seed) {
  clearWeather();
  weatherKind = kind || 'clear';
  const cfg = WEATHER_CFG[weatherKind] || WEATHER_CFG.clear;
  const rng = mulberry32(seed ^ 0x77aa33);

  if (weatherKind === 'mist' || weatherKind === 'rain') buildMist(weatherKind === 'rain' ? 0.35 : 1);

  if (!cfg.count) return;

  if (weatherKind === 'rain') {
    const geo = new THREE.BoxGeometry(0.05, 4.0, 0.05);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.colour, transparent: true, opacity: 0.5, fog: false, depthWrite: false,
    });
    const n = lowQuality ? Math.round(cfg.count * 0.5) : cfg.count;
    rainMesh = new THREE.InstancedMesh(geo, mat, n);
    rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rainMesh.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      flakeSeeds.push({
        x: (rng() - 0.5) * WEATHER_BOX * 2, y: rng() * 70,
        z: (rng() - 0.5) * WEATHER_BOX * 2,
        s: 0.7 + rng() * 0.9, p: rng() * Math.PI * 2,
      });
    }
    envRoot.add(rainMesh);
    return;
  }

  const n = lowQuality ? Math.round(cfg.count * 0.55) : cfg.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = {
      x: (rng() - 0.5) * WEATHER_BOX * 2,
      y: rng() * (weatherKind === 'fireflies' ? 8 : 60),
      z: (rng() - 0.5) * WEATHER_BOX * 2,
      s: 0.6 + rng() * 1.1, p: rng() * Math.PI * 2,
    };
    flakeSeeds.push(f);
    arr[i * 3] = f.x; arr[i * 3 + 1] = f.y; arr[i * 3 + 2] = f.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  flakes = new THREE.Points(geo, new THREE.PointsMaterial({
    color: cfg.additive ? new THREE.Color(cfg.colour).multiplyScalar(1.6) : cfg.colour,
    size: cfg.size * 1.6, transparent: true, map: dotTexture(),
    opacity: weatherKind === 'fireflies' ? 0.95 : 0.8,
    depthWrite: false, fog: weatherKind !== 'fireflies',
    blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  flakes.frustumCulled = false;
  envRoot.add(flakes);
}

// Ground mist. Kept thin on purpose: stacked layers seen edge-on from inside
// wash the whole battlefield out to grey.
function buildMist(strength) {
  mistGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd8d0c8, transparent: true, opacity: 0.03 * strength,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 3.2 + i * 3.8;
    mistGroup.add(m);
  }
  envRoot.add(mistGroup);
}

// ---------------------------------------------------------------------------
// Apply a preset
// ---------------------------------------------------------------------------

let active = null;
let lightningTimer = 8;
let flash = 0;
let baseSunInt = 1;
let baseHemiInt = 1;

export function applyEnvironment({ time = 'golden', biome = 'farmland', weather = null, seed = 1 }) {
  const t = TIMES[time] || TIMES.golden;
  const b = BIOMES[biome] || BIOMES.farmland;
  if (!sky) buildSky();

  const sunDir = new THREE.Vector3(
    Math.cos(t.sunPitch) * Math.sin(t.sunYaw),
    Math.sin(t.sunPitch),
    Math.cos(t.sunPitch) * Math.cos(t.sunYaw)).normalize();

  skyUniforms.uZenith.value.copy(t.zenith);
  skyUniforms.uMid.value.copy(t.mid);
  skyUniforms.uHorizon.value.copy(t.horizon);
  skyUniforms.uSunCol.value.copy(t.sunCol);
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uHaze.value = t.haze;
  skyUniforms.uStars.value = t.stars;
  skyUniforms.uSunGlow.value = t.sunGlow;
  skyUniforms.uFlash.value = 0;

  sunLight.position.copy(sunDir).multiplyScalar(230);
  sunLight.target.position.set(0, 0, 0);
  sunLight.color.copy(t.sunCol);
  sunLight.intensity = t.sunInt;
  baseSunInt = t.sunInt;
  hemiLight.color.copy(t.hemiSky);
  hemiLight.groundColor.copy(t.hemiGround);
  hemiLight.intensity = t.hemiInt;
  // the cinder flats glow from below, which is also what keeps the night
  // boss fight readable
  if (b.ember) {
    hemiLight.groundColor.lerp(C(0xff5a1e), 0.68);
    hemiLight.intensity += 0.9;
  }
  baseHemiInt = hemiLight.intensity;

  scene.fog.color.copy(t.fog);
  scene.fog.near = t.fogNear;
  scene.fog.far = t.fogFar;
  renderer.toneMappingExposure = t.exposure;
  setBloom(LITE_MODE ? 0 : t.bloom);

  buildTerrain(seed, b);
  buildClouds(t, seed);
  const w = weather || BIOME_WEATHER[b.id] || t.weather || 'clear';
  buildWeather(w, seed);
  lightningTimer = rand(4, 10);
  flash = 0;

  active = {
    time: t, biome: b, weather: w, seed,
    label: t.name + ' · ' + b.name,
    lightning: !!t.lightning,
  };
  resettleDetail();
  return active;
}

export function activeEnv() { return active; }

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------

export function updateEnvironment(dt, time) {
  if (!sky) return;
  sky.position.copy(camera.position);
  skyUniforms.uTime.value = time;

  for (const c of clouds) {
    c.g.position.x = c.baseX + Math.sin(time * 0.009 * c.speed) * 70;
  }

  if (active && active.lightning) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = rand(5, 14);
      flash = 1;
      emit('lightning');
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 3.4);
      const f = Math.pow(flash, 2) * (0.6 + 0.4 * Math.sin(time * 60));
      skyUniforms.uFlash.value = f * 0.75;
      sunLight.intensity = baseSunInt + f * 3.2;
      hemiLight.intensity = baseHemiInt + f * 1.6;
    }
  }

  updateWeatherParticles(dt, time);
  if (mistGroup) mistGroup.position.set(camera.position.x, 0, camera.position.z);
}

function wrap(v, half) {
  if (v > half) return v - half * 2;
  if (v < -half) return v + half * 2;
  return v;
}

function updateWeatherParticles(dt, time) {
  const cfg = WEATHER_CFG[weatherKind];
  if (!cfg || !cfg.count) return;
  const cx = camera.position.x, cz = camera.position.z;
  const H = WEATHER_BOX;

  if (rainMesh) {
    for (let i = 0; i < flakeSeeds.length; i++) {
      const f = flakeSeeds[i];
      f.y -= cfg.fall * f.s * dt;
      f.x += 6 * dt;
      if (f.y < -4) { f.y = 66; f.x = (Math.random() - 0.5) * H * 2; f.z = (Math.random() - 0.5) * H * 2; }
      const x = cx + wrap(f.x - cx, H);
      const z = cz + wrap(f.z - cz, H);
      _e.set(0.12, 0, 0.09);
      _q.setFromEuler(_e);
      _m4.compose(_p.set(x, f.y, z), _q, _s.set(1, f.s * 1.6, 1));
      rainMesh.setMatrixAt(i, _m4);
    }
    rainMesh.instanceMatrix.needsUpdate = true;
    return;
  }

  if (!flakes) return;
  const pos = flakes.geometry.attributes.position;
  const arr = pos.array;
  const ff = weatherKind === 'fireflies';
  for (let i = 0; i < flakeSeeds.length; i++) {
    const f = flakeSeeds[i];
    f.y -= cfg.fall * f.s * dt;
    if (ff) {
      const gy = terrainHeight(cx + wrap(f.x - cx, H), cz + wrap(f.z - cz, H));
      arr[i * 3] = cx + wrap(f.x - cx, H) + Math.sin(time * 0.6 * f.s + f.p) * 2.4;
      arr[i * 3 + 1] = gy + 1.2 + Math.sin(time * 0.9 * f.s + f.p * 2) * 1.1 + (f.y % 5);
      arr[i * 3 + 2] = cz + wrap(f.z - cz, H) + Math.cos(time * 0.5 * f.s + f.p) * 2.4;
      continue;
    }
    if (cfg.fall > 0 && f.y < -3) { f.y = 58; f.x = (Math.random() - 0.5) * H * 2; f.z = (Math.random() - 0.5) * H * 2; }
    if (cfg.fall < 0 && f.y > 70) { f.y = -2; f.x = (Math.random() - 0.5) * H * 2; f.z = (Math.random() - 0.5) * H * 2; }
    f.x += Math.sin(time * 0.4 * f.s + f.p) * cfg.sway * dt + cfg.sway * 0.35 * dt;
    arr[i * 3] = cx + wrap(f.x - cx, H);
    arr[i * 3 + 1] = f.y;
    arr[i * 3 + 2] = cz + wrap(f.z - cz, H);
  }
  pos.needsUpdate = true;
  if (ff) {
    flakes.material.opacity = 0.55 + Math.sin(time * 2.1) * 0.3;
  }
}

// Wind: shared by shells, weather feel and the HUD readout.
export function rollWind(seed, strengthMul = 1) {
  const rng = mulberry32(seed ^ 0x2b7a1f);
  const dir = rng() * Math.PI * 2;
  const speed = (1.5 + rng() * 8.5) * strengthMul;
  return { dir, speed, x: Math.cos(dir) * speed, z: Math.sin(dir) * speed };
}

export function biomeOf(id) { return BIOMES[id] || BIOMES.farmland; }
export function timeOf(id) { return TIMES[id] || TIMES.golden; }
