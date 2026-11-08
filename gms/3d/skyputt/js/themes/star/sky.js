// Star Station theme — space around the station: one dome shader draws the star field (hashed cells,
// twinkling), a violet / teal nebula (two noise fetches on a planar projection that never divides by
// less than 0.2), a big banded ringed planet (analytic ray-sphere + ring plane, lit by the sun, shading
// its own rings) and a cratered moon, plus the sun's glare. Lights: a white sun key (the one shadow
// caster), a warm planet-shine rim, a cool hemi fill; deep navy fog for the far backdrop; a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, every sqrt / pow argument is
// clamped >= 0, smoothstep edges are always ascending.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  space: 0x04060e, deep: 0x070b1c, neb1: 0x6a3aa8, neb2: 0x1a8aa0, neb3: 0xc04a8a,
  sun: 0xfff4e0, planet1: 0xd8a070, planet2: 0x9a5a3a, planet3: 0xf0d8b0, ring: 0xd8c8a8, moon: 0xb8b8c0,
  fog: 0x0a1030, bg: 0x04060e,
};

const SKY = /* glsl */`
  uniform vec3 uSun, uSunCol, uPlanet, uRingN, uMoon, uP1, uP2, uP3, uRing, uMoonCol, uNeb1, uNeb2, uNeb3, uSpace, uDeep;
  uniform float uPR, uMR, uTime, uStars;
  uniform sampler2D uNoise;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  // ray from the origin along d against a sphere at centre c (|c| = 1) of radius r: distance or -1
  float hitSphere(vec3 d, vec3 c, float r) {
    float b = dot(d, c);
    float disc = b * b - (1.0 - r * r);
    if (disc < 0.0 || b <= 0.0) return -1.0;
    return b - sqrt(max(disc, 0.0));
  }
  vec3 space(vec3 d, float detail) {
    d = safeDir(d);
    vec3 col = mix(uSpace, uDeep, 0.5 + 0.5 * d.y);
    // nebula: planar projection, denominator >= 0.2
    vec2 q = d.xz / (1.2 + d.y);
    float n1 = texture2D(uNoise, q * 0.35 + vec2(0.11, 0.37)).r;
    float n2 = texture2D(uNoise, q * 0.9 + vec2(0.53, 0.17)).r;
    float neb = smoothstep(0.42, 0.78, n1 * 0.7 + n2 * 0.3);
    float band = 1.0 - smoothstep(0.0, 0.6, abs(dot(d, normalize(vec3(0.35, 0.8, -0.48)))));
    vec3 nc = mix(uNeb1, uNeb2, smoothstep(0.3, 0.7, n2));
    nc = mix(nc, uNeb3, smoothstep(0.62, 0.8, n1) * 0.6);
    col += nc * neb * (0.18 + 0.4 * band);
    // stars: one candidate per cell of a 3D grid on the direction
    if (detail > 0.5) {
      vec3 p = d * uStars;
      vec3 cell = floor(p);
      float h = hash13(cell);
      if (h > 0.86) {
        vec3 sp = cell + 0.5 + (vec3(hash13(cell + 7.1), hash13(cell + 3.7), hash13(cell + 1.3)) - 0.5) * 0.7;
        float dd = length(p - sp);
        float br = (h - 0.86) / 0.14;
        float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h * 3.0) + h * 80.0);
        float s = exp(-dd * dd * 40.0) * br * br * tw;
        vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash13(cell + 11.0));
        col += sc * s * 2.2;
      }
    }
    // sun glare
    float sd = clamp(dot(d, uSun), 0.0, 1.0);
    col += uSunCol * (pow(sd, 400.0) * 3.0 + pow(sd, 24.0) * 0.12 + pow(sd, 4.0) * 0.03);
    // the moon (behind the planet if they overlap)
    float tm = hitSphere(d, uMoon, uMR);
    if (tm > 0.0) {
      vec3 nm = safeDir(d * tm - uMoon);
      float cr = texture2D(uNoise, nm.xy * 1.7 + nm.z * 0.5).r;
      float lit = clamp(dot(nm, uSun), 0.0, 1.0);
      col = uMoonCol * (0.25 + 0.75 * smoothstep(0.3, 0.7, cr)) * (lit * 1.1 + 0.03);
    }
    // the planet: banded, lit by the sun, with an atmosphere rim; its rings in front / behind
    float tp = hitSphere(d, uPlanet, uPR);
    float denom = dot(d, uRingN);
    float tr = abs(denom) > 1e-4 ? dot(uPlanet, uRingN) / denom : -1.0;
    vec3 rp = d * tr - uPlanet;
    float rho = length(rp) / uPR;
    float ringA = 0.0;
    vec3 ringC = vec3(0.0);
    if (tr > 0.0 && rho > 1.35 && rho < 2.4) {
      float rb = texture2D(uNoise, vec2(rho * 0.9, 0.5)).r;
      float gaps = smoothstep(0.35, 0.55, rb) * (1.0 - smoothstep(1.92, 1.97, rho) * (1.0 - smoothstep(2.02, 2.07, rho)));
      ringA = gaps * smoothstep(1.35, 1.45, rho) * (1.0 - smoothstep(2.25, 2.4, rho)) * 0.85;
      // planet shadow on the rings (ray from the ring point toward the sun hits the planet?)
      vec3 toS = uSun;
      float bb = dot(rp, toS);
      float cc = dot(rp, rp) - uPR * uPR;
      float shadow = (bb < 0.0 && bb * bb - cc > 0.0) ? 0.25 : 1.0;
      ringC = uRing * (0.55 + 0.45 * rb) * shadow * (0.5 + 0.5 * abs(dot(uRingN, uSun)));
    }
    if (tp > 0.0) {
      vec3 np = safeDir(d * tp - uPlanet);
      float lat = dot(np, uRingN);
      float tb = texture2D(uNoise, vec2(lat * 1.6 + 0.3, np.x * 0.08 + uTime * 0.002)).r;
      vec3 pc = mix(uP2, uP1, smoothstep(0.3, 0.7, tb));
      pc = mix(pc, uP3, smoothstep(0.62, 0.78, texture2D(uNoise, vec2(lat * 4.0, 0.7)).r) * 0.6);
      float lit = clamp(dot(np, uSun) * 1.1 + 0.05, 0.0, 1.0);
      float rim = pow(clamp(1.0 + dot(np, d), 0.0, 1.0), 3.0);
      vec3 pcol = pc * (lit * 1.05 + 0.02) + vec3(1.0, 0.75, 0.55) * rim * lit * 0.5;
      // rings in front of the planet cover it; behind it they are hidden
      if (tr > 0.0 && tr < tp) col = mix(pcol, ringC, ringA); else col = pcol;
    } else if (ringA > 0.0) {
      col = mix(col, ringC, ringA);
    }
    return col;
  }`;

function skyUniforms(dirs) {
  const c = (h) => new THREE.Color(h);
  return {
    uSun: { value: dirs.sun.clone() }, uSunCol: { value: c(PALETTE.sun) },
    uPlanet: { value: dirs.planet.clone() }, uRingN: { value: dirs.ringN.clone() }, uMoon: { value: dirs.moon.clone() },
    uPR: { value: 0.2 }, uMR: { value: 0.035 },
    uP1: { value: c(PALETTE.planet1) }, uP2: { value: c(PALETTE.planet2) }, uP3: { value: c(PALETTE.planet3) },
    uRing: { value: c(PALETTE.ring) }, uMoonCol: { value: c(PALETTE.moon) },
    uNeb1: { value: c(PALETTE.neb1) }, uNeb2: { value: c(PALETTE.neb2) }, uNeb3: { value: c(PALETTE.neb3) },
    uSpace: { value: c(PALETTE.space) }, uDeep: { value: c(PALETTE.deep) },
    uTime: { value: 0 }, uStars: { value: 220 }, uNoise: { value: null },
  };
}

function skyMaterial(uniforms, detail = 1) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      ${SKY}
      varying vec3 vDir;
      void main(){
        gl_FragColor = vec4(space(vDir, ${detail.toFixed(1)}), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

/**
 * Builds the space dome, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'star.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  // the planet ahead-left, low; the moon ahead-right, higher; the sun high behind-right of the player
  const dirs = {
    planet: new THREE.Vector3().addScaledVector(view, 0.9).addScaledVector(viewRight, -0.3).addScaledVector(up, 0.04).normalize(),
    moon: new THREE.Vector3().addScaledVector(view, 0.9).addScaledVector(viewRight, 0.38).addScaledVector(up, 0.16).normalize(),
    sun: new THREE.Vector3().addScaledVector(view, -0.2).addScaledVector(viewRight, 0.75).addScaledVector(up, 0.62).normalize(),
    ringN: new THREE.Vector3().addScaledVector(up, 1).addScaledVector(viewRight, 0.32).addScaledVector(view, 0.22).normalize(),
  };
  const noise = noiseTexture(hi ? 256 : 128, 8, 211, hi ? 5 : 4);
  const uniforms = skyUniforms(dirs);
  uniforms.uNoise.value = noise;
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 20, hi ? 16 : 10), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'star.dome';
  group.add(dome);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  // a faint navy haze: clear over the course, the far backdrop sinks into deep space
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.2 + 24, Math.min(R * 0.7, 230));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: the sun, high, behind-right of the player so the ball's shadow falls ahead and to the left.
  const key = new THREE.DirectionalLight(0xfff6ea, 3.0);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, 0.4).addScaledVector(frame.fwd, -0.35).addScaledVector(up, 0.85).normalize();
  key.position.copy(frame.center).addScaledVector(keyDir, 40);
  key.target.position.copy(frame.center);
  key.castShadow = true;
  const sm = hi ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.012;
  key.updateMatrixWorld(); key.target.updateMatrixWorld();
  const lm = new THREE.Matrix4().lookAt(key.position, key.target.position, up);
  const inv = lm.clone().invert();
  const b = info.bounds.clone().expandByScalar(0.6);
  const lb = new THREE.Box3();
  for (let i = 0; i < 8; i++) {
    const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y + 2 : b.min.y, i & 4 ? b.max.z : b.min.z);
    v.sub(key.position).applyMatrix4(inv);
    lb.expandByPoint(v);
  }
  const sc = key.shadow.camera;
  sc.left = lb.min.x; sc.right = lb.max.x; sc.bottom = lb.min.y; sc.top = lb.max.y;
  sc.near = Math.max(0.1, -lb.max.z - 1); sc.far = -lb.min.z + 1;
  sc.updateProjectionMatrix();
  group.add(key, key.target);

  // planet-shine: a warm rim from the planet's side, low
  const rim = new THREE.DirectionalLight(0xffb880, 0.7);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3(dirs.planet.x, 0.15, dirs.planet.z).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xa8c0f0, 0x2a2a48, 1.0);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM: space + a soft station-light floor and a bright panel) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(dirs);
    envUniforms.uNoise.value = noise;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms, 0));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x3a4660 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -8;
    envScene.add(floor);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshBasicMaterial({ color: 0x9ab0d0, side: THREE.DoubleSide }));
    panel.position.set(0, 18, -30); panel.lookAt(0, 0, 0);
    envScene.add(panel);
    const pmrem = new THREE.PMREMGenerator(info.renderer);
    envRT = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    for (const m of [envDome, floor, panel]) { m.geometry.dispose(); m.material.dispose(); }
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.8;
  }

  scene.add(group);

  return {
    group, dirs, uniforms, R, key,
    update(dt, t, camera) {
      uniforms.uTime.value = t;
      if (camera) dome.position.copy(camera.position);
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); dome.material.dispose(); noise.dispose();
      key.shadow.map?.dispose(); key.dispose(); rim.dispose(); hemi.dispose();
      if (envRT) envRT.dispose();
      scene.fog = prevFog; scene.background = prevBg; scene.environment = prevEnv;
      if (prevEnvI !== undefined) scene.environmentIntensity = prevEnvI;
    },
  };
}
