// Sky Isles theme — painted sky dome, cloud sea, golden-hour lights, fog, environment map.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x101a58, mid: 0x3f62d6, horSun: 0xffc285, horAway: 0xb6b4ee, below: 0x8f86c6,
  sun: 0xffcf8a, cloudLit: 0xfff1e2, cloudShade: 0x9c8fc8, cloudDeep: 0x6f6aae,
  fog: 0xc6bfe6,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uZen, uHorSun, uHorAway, uBelow, uSunDir;
  uniform vec3 uMid, uSunCol;
  // 0 = away from the sun, 1 = towards it, in the horizontal plane. Safe at the poles: some mobile
  // GPUs flush the old 1e-5 nudge to zero, normalize(0) gives NaN, and PMREM spread the NaN over
  // the whole environment map (all lit surfaces went black on Aaron's phone).
  float sunSide(vec3 d) {
    float l = length(d.xz);
    vec2 hz = l > 1e-3 ? d.xz / l : vec2(1.0, 0.0);
    return clamp(dot(hz, normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
  }
  vec3 skyHorizon(vec3 d) {
    float sd = sunSide(d);
    return mix(uHorAway, uHorSun, pow(sd, 2.2));
  }
  // The sky colour in direction d (no stars/planet). Shared by the dome and the cloud sea's far fade,
  // so the two meet without a seam at any aspect ratio.
  vec3 skyColor(vec3 d) {
    d = normalize(d);
    float h = d.y;
    float sd = sunSide(d);
    vec3 col = mix(skyHorizon(d), uMid, smoothstep(-0.02, 0.22, h));
    col = mix(col, uZen, smoothstep(0.16, 0.7, h));
    col = mix(col, uHorSun, pow(sd, 4.0) * (1.0 - smoothstep(0.0, 0.5, abs(h))) * 0.55);
    col = mix(col, uBelow, smoothstep(-0.06, -0.4, h));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(s, 5.0) * 0.32 + pow(s, 40.0) * 0.55);
    return col;
  }`;

function skyUniforms(sunDir, planetDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uZen: { value: c(PALETTE.zenith) }, uMid: { value: c(PALETTE.mid) },
    uHorSun: { value: c(PALETTE.horSun) }, uHorAway: { value: c(PALETTE.horAway) },
    uBelow: { value: c(PALETTE.below) }, uSunCol: { value: c(PALETTE.sun) },
    uSunDir: { value: sunDir.clone() }, uPlanetDir: { value: planetDir.clone() },
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
      uniform vec3 uPlanetDir; uniform float uTime, uStars;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float sd = sunSide(d);
        vec3 col = skyColor(d);
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunCol * smoothstep(0.9990, 0.9994, s) * 2.5;
        // stars on the side away from the sun
        if (h > 0.08 && uStars > 0.5) {
          vec3 q = floor(d * 220.0);
          float st = hash(q);
          float tw = 0.55 + 0.45 * sin(uTime * 2.3 + st * 80.0);
          col += vec3(0.95, 0.95, 1.0) * step(0.9965, st) * smoothstep(0.08, 0.4, h) * (1.0 - sd * 0.9) * tw;
          col += vec3(0.6, 0.65, 1.0) * step(0.9993, hash(q + 7.0)) * smoothstep(0.2, 0.6, h) * 1.5;
        }
        // big pale planet
        float pd = dot(d, uPlanetDir);
        float sinR = 0.19;
        float cosR = sqrt(1.0 - sinR * sinR);
        if (pd > cosR - 0.02) {
          vec3 rel = (d - uPlanetDir * pd) / sinR;
          float r = length(rel);
          vec3 N = normalize(rel - uPlanetDir * sqrt(max(0.0, 1.0 - r * r)));
          float lit = clamp(dot(N, uSunDir) * 0.9 + 0.25, 0.0, 1.0);
          float bands = 0.5 + 0.5 * sin(rel.y * 22.0 + sin(rel.x * 6.0) * 1.5);
          vec3 pc = mix(vec3(0.42, 0.45, 0.78), vec3(0.85, 0.82, 0.98), bands * 0.35 + 0.45) * (0.25 + lit * 0.95);
          float edge = 1.0 - smoothstep(0.985, 1.0, r);
          col = mix(col, pc, edge * 0.78);
          col += vec3(0.55, 0.6, 1.0) * smoothstep(1.12, 0.98, r) * (1.0 - edge) * 0.35;  // atmosphere rim
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

function cloudSeaMaterial(uniforms, noise, R) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uNoise: { value: noise }, uR: { value: R },
      uLit: { value: new THREE.Color(PALETTE.cloudLit) }, uShade: { value: new THREE.Color(PALETTE.cloudShade) },
      uDeep: { value: new THREE.Color(PALETTE.cloudDeep) },
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
        float n1 = texture2D(uNoise, p * 0.010 + vec2(uTime * 0.0015, 0.0)).r;
        float n2 = texture2D(uNoise, p * 0.031 - vec2(0.0, uTime * 0.0025)).r;
        float n3 = texture2D(uNoise, p * 0.093 + vec2(uTime * 0.004)).r;
        float dens = n1 * 0.58 + n2 * 0.30 + n3 * 0.12;
        float cov = smoothstep(0.30, 0.52, dens);
        vec3 toP = vW - cameraPosition;
        float dist = length(toP.xz);
        float az = sunSide(toP);
        vec3 cloud = mix(uShade, uLit, smoothstep(0.42, 0.72, dens));
        cloud = mix(cloud, cloud * vec3(1.08, 0.94, 0.82) + uSunCol * 0.12, pow(az, 3.0));
        vec3 col = mix(uDeep, cloud, cov);
        col = mix(col, skyColor(toP), smoothstep(uR * 0.15, uR * 0.8, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Builds the sky dome, cloud sea, lights, fog and env map.
 * frame = { center, fwd, right, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'sky.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const sunDir = new THREE.Vector3().addScaledVector(frame.right, -0.78).addScaledVector(frame.fwd, 0.62).addScaledVector(up, 0.16).normalize();
  const planetDir = new THREE.Vector3().addScaledVector(frame.right, 0.55).addScaledVector(frame.fwd, 0.75).addScaledVector(up, 0.62).normalize();
  const uniforms = skyUniforms(sunDir, planetDir);
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 48 : 24, hi ? 24 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'sky.dome';
  group.add(dome);

  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const seaY = frame.minY - 16;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), cloudSeaMaterial(uniforms, noise, R));
  sea.rotation.x = -Math.PI / 2; sea.position.y = seaY; sea.frustumCulled = false; sea.renderOrder = -9; sea.name = 'sky.cloudSea';
  group.add(sea);

  // ---- fog: warm lavender haze, starts past the course ----
  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.4 + 18, Math.min(R * 0.95, 260));
  scene.background = new THREE.Color(PALETTE.horAway);

  // ---- lights ----
  // Key light: cheated higher and more from behind-left than the visible sun so the fairway reads clearly.
  const key = new THREE.DirectionalLight(0xffd8a8, 3.0);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, -0.55).addScaledVector(frame.fwd, -0.3).addScaledVector(up, 0.68).normalize();
  key.position.copy(frame.center).addScaledVector(keyDir, 40);
  key.target.position.copy(frame.center);
  key.castShadow = true;
  const sm = hi ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.012;
  // fit the ortho shadow camera to bounds in light space
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

  const rim = new THREE.DirectionalLight(0xffa25e, 1.1);   // warm rim from the visible sun
  rim.position.copy(frame.center).addScaledVector(sunDir, 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xbcc8ff, 0x86705e, 0.9);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map for gold/glass reflections (one-time PMREM of the sky) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(sunDir, planetDir);
    envUniforms.uStars.value = 0;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    // a cloud floor so reflections below the horizon are soft lavender rather than black
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: PALETTE.cloudShade }));
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
    group, sunDir, uniforms, seaY, R,
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
