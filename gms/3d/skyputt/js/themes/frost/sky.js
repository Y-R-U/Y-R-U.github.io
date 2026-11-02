// Frost Fair theme — blue-hour night sky dome (navy zenith, cold blue horizon, big moon, stars), aurora
// ribbons, a moonlit sea of cloud below, cool moonlight key + warm lantern rim, fog and a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, every pow() base is clamped.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x050a26, mid: 0x14286e, horMoon: 0x4a6ac0, horAway: 0x23508a, below: 0x1a2a5a,
  moon: 0xf4f2e6, seaLit: 0x6c84bc, seaShade: 0x2e3e74, seaDeep: 0x10183a,
  fog: 0x1e2e64, bg: 0x1a2c60,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uZen, uMid, uHorMoon, uHorAway, uBelow, uMoonDir, uMoonCol;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  // 0 = away from the moon, 1 = towards it, in the horizontal plane (NaN-safe at the poles).
  float moonSide(vec3 d) {
    float l = length(d.xz);
    vec2 hz = l > 1e-3 ? d.xz / l : vec2(1.0, 0.0);
    float ml = length(uMoonDir.xz);
    vec2 mz = ml > 1e-3 ? uMoonDir.xz / ml : vec2(1.0, 0.0);
    return clamp(dot(hz, mz) * 0.5 + 0.5, 0.0, 1.0);
  }
  vec3 skyColor(vec3 d) {
    d = safeDir(d);
    float h = d.y;
    float sd = moonSide(d);
    vec3 hor = mix(uHorAway, uHorMoon, pow(sd, 2.0));
    vec3 col = mix(hor, uMid, smoothstep(-0.02, 0.32, h));
    col = mix(col, uZen, smoothstep(0.28, 0.9, h));
    col = mix(col, uBelow, 1.0 - smoothstep(-0.4, -0.04, h));
    float s = clamp(dot(d, uMoonDir), 0.0, 1.0);
    col += uMoonCol * (pow(s, 6.0) * 0.16 + pow(s, 40.0) * 0.3);
    return col;
  }`;

function skyUniforms(moonDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uZen: { value: c(PALETTE.zenith) }, uMid: { value: c(PALETTE.mid) },
    uHorMoon: { value: c(PALETTE.horMoon) }, uHorAway: { value: c(PALETTE.horAway) },
    uBelow: { value: c(PALETTE.below) }, uMoonCol: { value: c(PALETTE.moon) },
    uMoonDir: { value: moonDir.clone() },
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
        if (h > 0.03 && uStars > 0.5) {
          vec3 q = floor(d * 240.0);
          float st = hash(q);
          float tw = 0.55 + 0.45 * sin(uTime * 2.3 + st * 80.0);
          float nearMoon = smoothstep(0.82, 0.97, dot(d, uMoonDir));
          col += vec3(0.85, 0.9, 1.0) * step(0.9958, st) * smoothstep(0.03, 0.3, h) * tw * (1.0 - nearMoon);
          col += vec3(1.0, 0.95, 0.8) * step(0.9993, hash(q + 7.0)) * smoothstep(0.1, 0.45, h) * 1.5 * (1.0 - nearMoon);
        }
        // big full moon with soft maria and limb darkening
        float md = dot(d, uMoonDir);
        float sinR = 0.11;
        float cosR = sqrt(1.0 - sinR * sinR);
        if (md > cosR - 0.04) {
          vec3 rel = (d - uMoonDir * md) / sinR;
          float r = length(rel);
          vec3 ax = safeDir(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec3 ay = cross(ax, uMoonDir);
          vec2 p = vec2(dot(rel, ax), dot(rel, ay));
          float n = vnoise(p * 3.0 + 4.0) * 0.6 + vnoise(p * 7.0 + 9.0) * 0.3 + vnoise(p * 17.0) * 0.1;
          float maria = smoothstep(0.48, 0.7, n);
          float limb = sqrt(clamp(1.0 - r * r, 0.0, 1.0));
          vec3 mc = uMoonCol * (0.8 + 0.2 * limb) * (1.0 - maria * 0.22);
          float edge = 1.0 - smoothstep(0.985, 1.0, r);
          col = mix(col, mc * 1.2, edge);
          col += vec3(0.75, 0.85, 1.0) * (1.0 - smoothstep(1.0, 1.9, r)) * (1.0 - edge) * 0.25;   // cold halo
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

function seaMaterial(uniforms, noise, R) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uNoise: { value: noise }, uR: { value: R },
      uLit: { value: new THREE.Color(PALETTE.seaLit) }, uShade: { value: new THREE.Color(PALETTE.seaShade) },
      uDeep: { value: new THREE.Color(PALETTE.seaDeep) },
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
        float n1 = texture2D(uNoise, p * 0.008 + vec2(uTime * 0.0015, 0.0)).r;
        float n2 = texture2D(uNoise, p * 0.025 - vec2(0.0, uTime * 0.002)).r;
        float n3 = texture2D(uNoise, p * 0.07 + vec2(uTime * 0.004)).r;
        float dens = n1 * 0.58 + n2 * 0.3 + n3 * 0.12;
        float cov = smoothstep(0.26, 0.52, dens);
        vec3 toP = vW - cameraPosition;
        float dist = length(toP.xz);
        float az = moonSide(toP);
        vec3 cl = mix(uShade, uLit, smoothstep(0.4, 0.7, dens));
        cl += uMoonCol * 0.1 * pow(az, 3.0);
        vec3 col = mix(uDeep, cl, cov);
        col = mix(col, skyColor(toP), smoothstep(uR * 0.15, uR * 0.8, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Aurora: a few tall curtain ribbons on a ring far out (they follow the camera like the dome).
 * centerDir: horizontal unit vector the curtains are centred on.
 */
function buildAurora(centerDir, R, hi) {
  const ribbons = [
    // [azimuth offset (rad), span (rad), base height, curtain height, radius factor, hue shift]
    [0.12, 1.2, 0.03, 0.24, 1.0, 0.0],
    [0.6, 0.9, 0.08, 0.2, 0.92, 0.35],
    [-0.3, 0.8, 0.12, 0.16, 0.85, 0.7],
  ];
  const base = Math.atan2(centerDir.z, centerDir.x);
  const pos = [], uv = [], extra = [], idx = [];
  const N = hi ? 64 : 32;
  let v0 = 0;
  ribbons.forEach(([off, span, by, ch, rf, hue], k) => {
    const rr = R * 0.62 * rf;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = base + off + (t - 0.5) * span;
      // the curtain folds in and out a little
      const fold = Math.sin(t * 9.0 + k * 2.0) * 0.05 + Math.sin(t * 23.0 + k) * 0.02;
      const r = rr * (1 + fold);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y0 = rr * (by + Math.sin(t * 5.0 + k) * 0.02), y1 = y0 + rr * ch * (0.75 + 0.25 * Math.sin(t * 7.0 + k * 3.0));
      pos.push(x, y0, z, x, y1, z);
      uv.push(t, 0, t, 1);
      extra.push(k * 1.7 + hue, span * 10, k * 1.7 + hue, span * 10);
      if (i < N) { const a0 = v0 + i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
    v0 += (N + 1) * 2;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aExtra', new THREE.Float32BufferAttribute(extra, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec2 aExtra; uniform float uTime;
      varying vec2 vUv; varying vec2 vEx;
      void main(){
        vUv = uv; vEx = aExtra;
        vec3 p = position;
        float sw = sin(uTime * 0.21 + uv.x * 6.0 + aExtra.x) * 0.025 + sin(uTime * 0.13 + uv.x * 13.0) * 0.012;
        p.xz *= 1.0 + sw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec2 vEx;
      float h1(float x){ return fract(sin(x * 91.7) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      void main(){
        float x = vUv.x * vEx.y + vEx.x * 3.0;
        // vertical rays drifting sideways + a slow brightness wave along the ribbon
        float rays = n1(x * 3.0 + uTime * 0.25) * 0.6 + n1(x * 9.0 - uTime * 0.4) * 0.4;
        float wave = 0.55 + 0.45 * sin(vUv.x * 7.0 + uTime * 0.35 + vEx.x);
        float y = clamp(vUv.y, 0.0, 1.0);
        float fall = smoothstep(0.0, 0.12, y) * pow(clamp(1.0 - y, 0.0, 1.0), 1.6);
        float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        vec3 green = vec3(0.25, 1.0, 0.55), teal = vec3(0.2, 0.75, 1.0), pink = vec3(0.85, 0.35, 0.95);
        vec3 c = mix(green, teal, smoothstep(0.15, 0.6, y + fract(vEx.x * 0.37) * 0.3));
        c = mix(c, pink, smoothstep(0.55, 0.95, y) * 0.8);
        float a = fall * ends * (0.35 + 0.65 * rays) * wave;
        gl_FragColor = vec4(c * a * 0.75, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -8; mesh.name = 'frost.aurora';
  return mesh;
}

/**
 * Builds the sky dome, aurora, cloud sea, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'frost.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  const moonDir = new THREE.Vector3().addScaledVector(viewRight, -0.1).addScaledVector(view, 0.95).addScaledVector(up, 0.125).normalize();
  const uniforms = skyUniforms(moonDir);
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 24, hi ? 16 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'frost.dome';
  group.add(dome);

  const auroraDir = new THREE.Vector3().addScaledVector(viewRight, 0.35).addScaledVector(view, 0.94).normalize();
  const aurora = buildAurora(auroraDir, R, hi);
  group.add(aurora);

  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const seaY = frame.minY - 14;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), seaMaterial(uniforms, noise, R));
  sea.rotation.x = -Math.PI / 2; sea.position.y = seaY; sea.frustumCulled = false; sea.renderOrder = -9; sea.name = 'frost.cloudSea';
  group.add(sea);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.2 + 18, Math.min(R * 0.95, 240));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: strong cool moonlight from behind-left of the player, high, so the green and the ball read.
  const KEY_I = 2.7;
  const key = new THREE.DirectionalLight(0xb4c8ff, KEY_I);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, -0.45).addScaledVector(frame.fwd, -0.35).addScaledVector(up, 0.75).normalize();
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

  // Warm rim from ahead (the lantern / palace side): gives walls and the ball a gold edge.
  const rim = new THREE.DirectionalLight(0xffb468, 1.2);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3().addScaledVector(frame.fwd, 0.8).addScaledVector(frame.right, 0.45).addScaledVector(up, 0.35).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0x7c94e0, 0x3a3a5a, 1.0);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM of the sky without stars or aurora) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(moonDir);
    envUniforms.uStars.value = 0;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: PALETTE.seaShade }));
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
    group, moonDir, auroraDir, uniforms, seaY, R, key,
    update(dt, t, camera) {
      uniforms.uTime.value = t;
      aurora.material.uniforms.uTime.value = t;
      if (camera) {
        dome.position.copy(camera.position);
        aurora.position.copy(camera.position);
        sea.position.x = camera.position.x; sea.position.z = camera.position.z;
      }
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); dome.material.dispose();
      aurora.geometry.dispose(); aurora.material.dispose();
      sea.geometry.dispose(); sea.material.dispose(); noise.dispose();
      key.shadow.map?.dispose(); key.dispose(); rim.dispose(); hemi.dispose();
      if (envRT) envRT.dispose();
      scene.fog = prevFog; scene.background = prevBg; scene.environment = prevEnv;
      if (prevEnvI !== undefined) scene.environmentIntensity = prevEnvI;
    },
  };
}
