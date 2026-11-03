// Volcano Forge theme — a smoky orange-red sky: charred-brown zenith, a hazy sun disc behind the player,
// drifting smoke banks, a hot glowing horizon toward the volcano (info.viewDir) and a lava sea far below
// (dark crust plates with glowing molten seams). A warm hazy key light (the one shadow caster), a lava
// up-light from below, a hemi fill, smoky fog and a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, every pow() base is clamped,
// smoothstep edges are always in order.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x1e0d0a, mid: 0x5a2316, horHot: 0xff7a34, horAway: 0x9a3a1e, below: 0x5a1a0c,
  sun: 0xffd2a0, crust: 0x1a0c08, crust2: 0x2e1610, molten: 0xff5a14, molten2: 0xffb040,
  fog: 0x6a2c1c, bg: 0x6a2c1c, smoke: 0x2a1612,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uZen, uMid, uHorHot, uHorAway, uBelow, uSunDir, uSunCol, uHotDir;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  // 0 = away from the hot direction, 1 = towards it, in the horizontal plane (NaN-safe at the poles).
  float hotSide(vec3 d) {
    float l = length(d.xz);
    vec2 hz = l > 1e-3 ? d.xz / l : vec2(1.0, 0.0);
    float sl = length(uHotDir.xz);
    vec2 sz = sl > 1e-3 ? uHotDir.xz / sl : vec2(1.0, 0.0);
    return clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0);
  }
  vec3 skyColor(vec3 d) {
    d = safeDir(d);
    float h = d.y;
    float hs = hotSide(d);
    vec3 hor = mix(uHorAway, uHorHot, pow(hs, 2.5));
    vec3 col = mix(hor, uMid, smoothstep(-0.02, 0.28, h));
    col = mix(col, uZen, smoothstep(0.22, 0.8, h));
    col = mix(col, uBelow, 1.0 - smoothstep(-0.35, -0.03, h));
    float s = clamp(dot(d, uSunDir), 0.0, 1.0);
    col += uSunCol * (pow(s, 5.0) * 0.18 + pow(s, 48.0) * 0.35);
    return col;
  }`;

function skyUniforms(sunDir, hotDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uZen: { value: c(PALETTE.zenith) }, uMid: { value: c(PALETTE.mid) },
    uHorHot: { value: c(PALETTE.horHot) }, uHorAway: { value: c(PALETTE.horAway) },
    uBelow: { value: c(PALETTE.below) }, uSunCol: { value: c(PALETTE.sun) },
    uSunDir: { value: sunDir.clone() }, uHotDir: { value: hotDir.clone() },
    uSmoke: { value: c(PALETTE.smoke) },
    uTime: { value: 0 }, uNoise: { value: null },
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
      uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSmoke;
      varying vec3 vDir;
      void main(){
        vec3 d = safeDir(vDir);
        float h = d.y;
        vec3 col = skyColor(d);
        // hazy sun disc (dimmed by smoke)
        float s = clamp(dot(d, uSunDir), 0.0, 1.0);
        col += uSunCol * smoothstep(0.9965, 0.9982, s) * 0.55;
        // smoke banks: noise projected on a high ceiling (denominator clamped > 0)
        float up = max(h + 0.32, 0.08);
        vec2 p = d.xz / up;
        float n1 = texture2D(uNoise, p * 0.11 + vec2(uTime * 0.0025, uTime * 0.001)).r;
        float n2 = texture2D(uNoise, p * 0.31 - vec2(uTime * 0.004, 0.0)).r;
        float dens = smoothstep(0.38, 0.72, n1 * 0.7 + n2 * 0.3);
        float band = smoothstep(-0.05, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h) * 0.5);
        float hs = hotSide(d);
        // smoke is dark above, lit orange from below near the hot horizon
        vec3 sm = mix(uSmoke, vec3(0.75, 0.28, 0.1), pow(hs, 3.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.8);
        col = mix(col, sm, dens * band * 0.62);
        // a glowing underbelly where smoke thins near the hot horizon
        col += vec3(0.35, 0.1, 0.02) * pow(hs, 4.0) * (1.0 - smoothstep(0.0, 0.18, abs(h))) * (1.0 - dens * 0.5);
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
      uCrust: { value: new THREE.Color(PALETTE.crust) }, uCrust2: { value: new THREE.Color(PALETTE.crust2) },
      uMolten: { value: new THREE.Color(PALETTE.molten) }, uMolten2: { value: new THREE.Color(PALETTE.molten2) },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${SKY_COMMON}
      uniform sampler2D uNoise; uniform float uTime, uR; uniform vec3 uCrust, uCrust2, uMolten, uMolten2;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n1 = texture2D(uNoise, p * 0.012 + vec2(uTime * 0.0012, 0.0)).r;
        float n2 = texture2D(uNoise, p * 0.04 - vec2(0.0, uTime * 0.0018)).r;
        float n3 = texture2D(uNoise, p * 0.11 + vec2(uTime * 0.003)).r;
        float f = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
        // molten seams where the field crosses mid-level (ridges of |f - 0.5|)
        float seam = 1.0 - smoothstep(0.0, 0.045, abs(f - 0.5));
        float pool = smoothstep(0.66, 0.78, n1);
        float hot = max(seam, pool);
        float pulse = 0.8 + 0.2 * sin(uTime * 0.7 + n2 * 12.0);
        vec3 crust = mix(uCrust, uCrust2, n3);
        vec3 molten = mix(uMolten, uMolten2, smoothstep(0.5, 1.0, hot) * n2);
        vec3 col = mix(crust, molten * pulse * 1.4, hot);
        vec3 toP = vW - cameraPosition;
        float dist = length(toP.xz);
        col = mix(col, skyColor(toP), smoothstep(uR * 0.12, uR * 0.75, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Builds the sky dome, lava sea, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'volcano.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  // hazy sun behind the player and to the left, high; the hot glow ahead (where the volcano stands)
  const sunDir = new THREE.Vector3().addScaledVector(viewRight, -0.45).addScaledVector(view, -0.55).addScaledVector(up, 0.7).normalize();
  const hotDir = new THREE.Vector3().addScaledVector(viewRight, 0.1).addScaledVector(view, 1.0).normalize();
  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const uniforms = skyUniforms(sunDir, hotDir);
  uniforms.uNoise.value = noise;
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 24, hi ? 16 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'volcano.dome';
  group.add(dome);

  const seaY = frame.minY - 14;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), seaMaterial(uniforms, noise, R));
  sea.rotation.x = -Math.PI / 2; sea.position.y = seaY; sea.frustumCulled = false; sea.renderOrder = -9; sea.name = 'volcano.lavaSea';
  group.add(sea);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.6 + 40, Math.min(R * 0.95, 400));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: warm hazy sun from behind-left of the player, high, so the moss and the ball read; the only shadow caster.
  const key = new THREE.DirectionalLight(0xffdcb8, 3.0);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, -0.45).addScaledVector(frame.fwd, -0.35).addScaledVector(up, 0.78).normalize();
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

  // Lava up-light from below and ahead: undersides and wall faces get an orange glow.
  const rim = new THREE.DirectionalLight(0xff6a28, 1.3);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3().addScaledVector(frame.fwd, 0.6).addScaledVector(frame.right, 0.3).addScaledVector(up, -0.55).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xd0a090, 0xff5a20, 0.9);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM of the sky over a glowing floor) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(sunDir, hotDir);
    envUniforms.uNoise.value = noise;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x8a2a10 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6;
    envScene.add(floor);
    const pmrem = new THREE.PMREMGenerator(info.renderer);
    envRT = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    envDome.geometry.dispose(); envDome.material.dispose(); floor.geometry.dispose(); floor.material.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.75;
  }

  scene.add(group);

  return {
    group, sunDir, hotDir, uniforms, seaY, R, key,
    update(dt, t, camera) {
      uniforms.uTime.value = t;
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
