// Spooky Hollow theme — night sky dome (purple zenith, teal horizon, huge full moon, stars, lightning
// flashes), a sea of mist below, cool moonlight key + warm rim lights, fog and a PMREM env map.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x0d0622, mid: 0x24134c, horMoon: 0x4a3c86, horAway: 0x1d4f5c, below: 0x14243a,
  moon: 0xffe9c0, mistLit: 0x3f6e78, mistShade: 0x221f45, mistDeep: 0x0e0a1e,
  fog: 0x2a2850, bg: 0x1d3a4c,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uZen, uMid, uHorMoon, uHorAway, uBelow, uMoonDir, uMoonCol, uFlashDir;
  uniform float uFlash;
  // 0 = away from the moon, 1 = towards it, in the horizontal plane. NaN-safe at the poles
  // (mobile GPU rule: never normalize a possibly-zero vector).
  float moonSide(vec3 d) {
    float l = length(d.xz);
    vec2 hz = l > 1e-3 ? d.xz / l : vec2(1.0, 0.0);
    float ml = length(uMoonDir.xz);
    vec2 mz = ml > 1e-3 ? uMoonDir.xz / ml : vec2(1.0, 0.0);
    return clamp(dot(hz, mz) * 0.5 + 0.5, 0.0, 1.0);
  }
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  vec3 skyColor(vec3 d) {
    d = safeDir(d);
    float h = d.y;
    float sd = moonSide(d);
    vec3 hor = mix(uHorAway, uHorMoon, pow(sd, 2.0));
    vec3 col = mix(hor, uMid, smoothstep(-0.02, 0.3, h));
    col = mix(col, uZen, smoothstep(0.25, 0.85, h));
    col = mix(col, uBelow, smoothstep(-0.04, -0.4, h));
    float s = clamp(dot(d, uMoonDir), 0.0, 1.0);
    col += uMoonCol * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35);
    float f = clamp(dot(d, uFlashDir), 0.0, 1.0);
    col += vec3(0.55, 0.45, 1.0) * uFlash * (pow(f, 4.0) * 0.9 + 0.12);
    return col;
  }`;

function skyUniforms(moonDir, flashDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uZen: { value: c(PALETTE.zenith) }, uMid: { value: c(PALETTE.mid) },
    uHorMoon: { value: c(PALETTE.horMoon) }, uHorAway: { value: c(PALETTE.horAway) },
    uBelow: { value: c(PALETTE.below) }, uMoonCol: { value: c(PALETTE.moon) },
    uMoonDir: { value: moonDir.clone() }, uFlashDir: { value: flashDir.clone() }, uFlash: { value: 0 },
    uTime: { value: 0 }, uStars: { value: 1 },
  };
}

function skyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      ${SKY_COMMON}
      uniform float uTime, uStars;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){
        vec3 d = safeDir(vDir);
        float h = d.y;
        vec3 col = skyColor(d);
        // stars, fewer near the moon
        if (h > 0.05 && uStars > 0.5) {
          vec3 q = floor(d * 230.0);
          float st = hash(q);
          float tw = 0.55 + 0.45 * sin(uTime * 2.1 + st * 80.0);
          float nearMoon = smoothstep(0.8, 0.96, dot(d, uMoonDir));
          col += vec3(0.9, 0.9, 1.0) * step(0.9962, st) * smoothstep(0.05, 0.35, h) * tw * (1.0 - nearMoon);
          col += vec3(0.75, 0.6, 1.0) * step(0.9993, hash(q + 7.0)) * smoothstep(0.15, 0.5, h) * 1.4 * (1.0 - nearMoon);
        }
        // huge full moon with maria and limb darkening
        float md = dot(d, uMoonDir);
        float sinR = 0.2;
        float cosR = sqrt(1.0 - sinR * sinR);
        if (md > cosR - 0.03) {
          vec3 rel = (d - uMoonDir * md) / sinR;
          float r = length(rel);
          // stable 2D coords on the disc (uMoonDir is never vertical here)
          vec3 ax = safeDir(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec3 ay = cross(ax, uMoonDir);
          vec2 p = vec2(dot(rel, ax), dot(rel, ay));
          float n = vnoise(p * 3.0 + 4.0) * 0.6 + vnoise(p * 7.0 + 9.0) * 0.3 + vnoise(p * 17.0) * 0.1;
          float maria = smoothstep(0.45, 0.68, n);
          float crater = smoothstep(0.78, 0.86, vnoise(p * 11.0 + 2.0));
          float limb = sqrt(clamp(1.0 - r * r, 0.0, 1.0));
          vec3 mc = uMoonCol * (0.78 + 0.22 * limb) * (1.0 - maria * 0.28 - crater * 0.12);
          float edge = 1.0 - smoothstep(0.985, 1.0, r);
          col = mix(col, mc * 1.15, edge);
          col += uMoonCol * smoothstep(1.6, 1.0, r) * (1.0 - edge) * 0.22;   // halo
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

function mistSeaMaterial(uniforms, noise, R) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uNoise: { value: noise }, uR: { value: R },
      uLit: { value: new THREE.Color(PALETTE.mistLit) }, uShade: { value: new THREE.Color(PALETTE.mistShade) },
      uDeep: { value: new THREE.Color(PALETTE.mistDeep) },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${SKY_COMMON}
      uniform sampler2D uNoise; uniform float uTime, uR; uniform vec3 uLit, uShade, uDeep;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n1 = texture2D(uNoise, p * 0.009 + vec2(uTime * 0.002, 0.0)).r;
        float n2 = texture2D(uNoise, p * 0.027 - vec2(0.0, uTime * 0.003)).r;
        float n3 = texture2D(uNoise, p * 0.08 + vec2(uTime * 0.005)).r;
        float dens = n1 * 0.58 + n2 * 0.30 + n3 * 0.12;
        float cov = smoothstep(0.28, 0.55, dens);
        vec3 toP = vW - cameraPosition;
        float dist = length(toP.xz);
        float az = moonSide(toP);
        vec3 mist = mix(uShade, uLit, smoothstep(0.42, 0.72, dens));
        mist += vec3(0.1, 0.35, 0.18) * smoothstep(0.6, 0.75, n2) * 0.5;       // eerie green pockets
        mist = mix(mist, mist + uMoonCol * 0.08, pow(az, 3.0));
        vec3 col = mix(uDeep, mist, cov);
        col += vec3(0.4, 0.3, 0.8) * uFlash * 0.12;
        col = mix(col, skyColor(toP), smoothstep(uR * 0.15, uR * 0.8, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Builds the sky dome, mist sea, lights, fog and env map.
 * frame = { center, fwd, right, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'spooky.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3().addScaledVector(frame.viewRight || frame.right, -0.2).addScaledVector(frame.view || frame.fwd, 0.93).addScaledVector(up, 0.13).normalize();
  const flashDir = new THREE.Vector3().addScaledVector(frame.right, 0.75).addScaledVector(frame.fwd, 0.6).addScaledVector(up, 0.22).normalize();
  const uniforms = skyUniforms(moonDir, flashDir);
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 48 : 24, hi ? 24 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'spooky.dome';
  group.add(dome);

  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const seaY = frame.minY - 14;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), mistSeaMaterial(uniforms, noise, R));
  sea.rotation.x = -Math.PI / 2; sea.position.y = seaY; sea.frustumCulled = false; sea.renderOrder = -9; sea.name = 'spooky.mistSea';
  group.add(sea);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.2 + 16, Math.min(R * 0.95, 230));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: cool moonlight, cheated from behind-left of the player and high so the fairway reads clearly.
  const KEY_I = 2.5;
  const key = new THREE.DirectionalLight(0xb4c4ff, KEY_I);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, -0.5).addScaledVector(frame.fwd, -0.3).addScaledVector(up, 0.72).normalize();
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

  // Warm rim from ahead (the pumpkins / ember glow side), so walls and the ball get an orange edge.
  const rim = new THREE.DirectionalLight(0xff8a3c, 1.5);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3().addScaledVector(frame.fwd, 0.8).addScaledVector(frame.right, 0.4).addScaledVector(up, 0.35).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0x8a80d0, 0x3a2c2a, 1.0);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM of the sky, no stars, no flash) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(moonDir, flashDir);
    envUniforms.uStars.value = 0;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: PALETTE.mistShade }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6;
    envScene.add(floor);
    const pmrem = new THREE.PMREMGenerator(info.renderer);
    envRT = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    envDome.geometry.dispose(); envDome.material.dispose(); floor.geometry.dispose(); floor.material.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.9;
  }

  scene.add(group);

  return {
    group, moonDir, flashDir, uniforms, seaY, R, key, KEY_I,
    /** flash: 0..1 lightning brightness for this frame */
    update(dt, t, camera, flash = 0) {
      uniforms.uTime.value = t;
      uniforms.uFlash.value = flash;
      key.intensity = KEY_I + flash * 1.6;
      if (camera) {
        dome.position.copy(camera.position);
        sea.position.x = camera.position.x; sea.position.z = camera.position.z;
      }
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); dome.material.dispose();
      sea.geometry.dispose(); sea.material.dispose(); noise.dispose();
      key.shadow.map?.dispose(); key.dispose(); rim.dispose(); hemi.dispose();
      if (envRT) envRT.dispose();
      scene.fog = prevFog; scene.background = prevBg; scene.environment = prevEnv;
      if (prevEnvI !== undefined) scene.environmentIntensity = prevEnvI;
    },
  };
}
