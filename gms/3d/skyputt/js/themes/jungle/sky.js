// Jungle Temple theme — a misty rainforest sky: one dome shader draws a warm humid haze (pale gold at the
// horizon, soft teal-blue overhead), a hazy sun, drifting cloud wisps, three layers of rainforest ridge
// silhouettes with bumpy tree-crown tops (far ones bleached by haze), and below the horizon a canopy
// sea sinking into mist (what you see through a void). Lights: a warm sun key (the one shadow caster),
// a green-gold hemi fill, a soft cool rim; warm haze fog; a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, atan only when the XZ length is
// > 1e-4, every pow base clamped to [0, 1], smoothstep edges ascending.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x7fb0bc, horizon: 0xf0dcae, sun: 0xfff0c8, cloud: 0xfff8ec,
  ridgeFar: 0x8eac84, ridgeMid: 0x4e7a4a, ridgeNear: 0x2a4e2c, canopy: 0x2e5a2a, mist: 0xe2e6cc,
  fog: 0xd8d8b8, bg: 0xd8d8b8,
};

const SKY = /* glsl */`
  uniform vec3 uSun, uSunCol, uZen, uHor, uCloud, uR1, uR2, uR3, uCan, uMist;
  uniform float uTime;
  uniform sampler2D uNoise;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  // ridge height (radians-ish of elevation) at azimuth a for a layer
  float ridge(float a, float k, float base, float amp, float crown) {
    float n = texture2D(uNoise, vec2(a * k, base * 7.0)).r;
    float n2 = texture2D(uNoise, vec2(a * k * 4.0, base * 3.0 + 0.5)).r;
    float bumps = abs(sin(a * crown + n2 * 3.0)) * 0.012 * (0.4 + n2 * 1.2);
    return base + (n - 0.5) * amp + bumps;
  }
  vec3 jungleSky(vec3 d, float detail) {
    d = safeDir(d);
    float y = d.y;
    float hz = 1.0 - clamp(abs(y) * 2.2, 0.0, 1.0);
    vec3 col = mix(uZen, uHor, pow(clamp(1.0 - max(y, 0.0), 0.0, 1.0), 3.0));
    float sd = clamp(dot(d, uSun), 0.0, 1.0);
    col += uSunCol * (pow(sd, 200.0) * 1.6 + pow(sd, 12.0) * 0.25 + pow(sd, 3.0) * 0.08);
    // cloud wisps (planar projection, denominator >= 0.25)
    if (y > 0.0) {
      vec2 q = d.xz / (0.25 + y);
      float c1 = texture2D(uNoise, q * 0.18 + vec2(uTime * 0.002, 0.13)).r;
      float c2 = texture2D(uNoise, q * 0.5 + vec2(0.4, uTime * 0.003)).r;
      float cl = smoothstep(0.5, 0.8, c1 * 0.7 + c2 * 0.3) * smoothstep(0.02, 0.25, y);
      col = mix(col, uCloud * (0.9 + 0.2 * sd), cl * 0.55);
    }
    // ridge silhouettes, far to near
    float lxz = length(d.xz);
    if (lxz > 1e-4 && y < 0.22) {
      float a = atan(d.z, d.x);
      float h1 = ridge(a, 0.35, 0.06, 0.1, 40.0);
      float h2 = ridge(a + 1.7, 0.5, 0.025, 0.08, 70.0);
      float h3 = ridge(a + 3.1, 0.8, -0.01, 0.06, 110.0);
      if (y < h1) col = mix(col, uR1, 0.55 * (1.0 - smoothstep(h1 - 0.02, h1 - 0.002, y)) + 0.2);
      if (y < h2) col = mix(col, uR2, 0.7 * (1.0 - smoothstep(h2 - 0.03, h2 - 0.002, y)) + 0.15);
      if (y < h3) col = mix(col, uR3, 0.85);
      // a band of mist between the layers
      col = mix(col, uMist, smoothstep(0.0, 1.0, hz) * 0.28 * (detail > 0.5 ? 1.0 : 0.5));
    }
    // below the horizon: the canopy sea far below, sinking into mist toward the horizon
    if (y < 0.0) {
      vec2 q = d.xz / (0.3 - y);
      float cn = texture2D(uNoise, q * 0.9 + vec2(0.21, 0.67)).r;
      float crown = texture2D(uNoise, q * 3.5 + vec2(0.71, 0.11)).r;
      vec3 can = uCan * (0.65 + 0.5 * cn) * (0.8 + 0.4 * crown);
      float mist = smoothstep(-0.25, -0.01, y) * 0.75 + 0.25 * smoothstep(0.5, 0.75, cn);
      col = mix(col, mix(can, uMist, clamp(mist, 0.0, 1.0)), (1.0 - smoothstep(-0.06, 0.0, y)));
    }
    return col;
  }`;

function skyUniforms(dirs) {
  const c = (h) => new THREE.Color(h);
  return {
    uSun: { value: dirs.sun.clone() }, uSunCol: { value: c(PALETTE.sun) },
    uZen: { value: c(PALETTE.zenith) }, uHor: { value: c(PALETTE.horizon) }, uCloud: { value: c(PALETTE.cloud) },
    uR1: { value: c(PALETTE.ridgeFar) }, uR2: { value: c(PALETTE.ridgeMid) }, uR3: { value: c(PALETTE.ridgeNear) },
    uCan: { value: c(PALETTE.canopy) }, uMist: { value: c(PALETTE.mist) },
    uTime: { value: 0 }, uNoise: { value: null },
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
        gl_FragColor = vec4(jungleSky(vDir, ${detail.toFixed(1)}), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

/**
 * Builds the sky dome, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'jungle.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  // the sun ahead-right, fairly low, so it hazes the backdrop and backlights the canopy
  const dirs = {
    sun: new THREE.Vector3().addScaledVector(view, 0.7).addScaledVector(viewRight, 0.55).addScaledVector(up, 0.42).normalize(),
  };
  const noise = noiseTexture(hi ? 256 : 128, 8, 311, hi ? 5 : 4);
  const uniforms = skyUniforms(dirs);
  uniforms.uNoise.value = noise;
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 20, hi ? 16 : 10), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'jungle.dome';
  group.add(dome);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  // warm humid haze: clear over the course, the backdrop softens into it
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.1 + 16, Math.min(R * 0.6, 170));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: a warm sun, high behind-right of the player so the ball's shadow falls ahead and to the left.
  const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, 0.4).addScaledVector(frame.fwd, -0.3).addScaledVector(up, 0.86).normalize();
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

  // a soft cool rim from the far side (skylight through the canopy)
  const rim = new THREE.DirectionalLight(0xa8d8e0, 0.5);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3(-dirs.sun.x, 0.3, -dirs.sun.z).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xe4ecd0, 0x4a5a30, 1.15);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM: the sky + a green forest floor) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(dirs);
    envUniforms.uNoise.value = noise;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms, 0));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x3a5230 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6;
    envScene.add(floor);
    const pmrem = new THREE.PMREMGenerator(info.renderer);
    envRT = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    for (const m of [envDome, floor]) { m.geometry.dispose(); m.material.dispose(); }
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.7;
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
