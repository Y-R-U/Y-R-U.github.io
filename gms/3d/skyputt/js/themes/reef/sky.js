// Sunken Reef theme — the water around the reef: a blue-green dome that brightens toward the surface
// overhead (a rippling bright "Snell's window" around the sun, slanting god-ray streaks fanning down from
// it), deepening to an abyssal blue below the horizon, and a sandy seabed far below with moving caustics
// that fades into the water. A cool sun-through-water key (the one shadow caster), a soft teal up-light
// off the sand, a hemi fill, blue water fog and a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, every pow() base is clamped,
// smoothstep edges are always in order.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  surface: 0x9ef0f0, top: 0x3cb8c8, mid: 0x1c88a4, hor: 0x16708e, deep: 0x0c4466, abyss: 0x06263e,
  sun: 0xe8fff4, sand: 0xc8bc8a, sand2: 0xa89c70, fog: 0x1a7896, bg: 0x1a7896,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uSurf, uTop, uMid, uHor, uDeep, uAbyss, uSunDir, uSunCol;
  uniform float uTime;
  uniform sampler2D uNoise;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  vec3 waterColor(vec3 d) {
    d = safeDir(d);
    float h = d.y;
    vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.3, h));
    col = mix(col, uTop, smoothstep(0.25, 0.75, h));
    col = mix(col, uDeep, 1.0 - smoothstep(-0.22, 0.02, h));
    col = mix(col, uAbyss, 1.0 - smoothstep(-0.7, -0.2, h));
    float s = clamp(dot(d, uSunDir), 0.0, 1.0);
    col += uSunCol * (pow(s, 6.0) * 0.16 + pow(s, 40.0) * 0.22);
    return col;
  }`;

function skyUniforms(sunDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uSurf: { value: c(PALETTE.surface) }, uTop: { value: c(PALETTE.top) }, uMid: { value: c(PALETTE.mid) },
    uHor: { value: c(PALETTE.hor) }, uDeep: { value: c(PALETTE.deep) }, uAbyss: { value: c(PALETTE.abyss) },
    uSunCol: { value: c(PALETTE.sun) }, uSunDir: { value: sunDir.clone() },
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
      varying vec3 vDir;
      void main(){
        vec3 d = safeDir(vDir);
        float h = d.y;
        vec3 col = waterColor(d);
        // the surface overhead: rippling light projected on a plane above (denominator clamped > 0)
        float up = max(h, 0.06);
        vec2 p = d.xz / up;
        float n1 = texture2D(uNoise, p * 0.06 + vec2(uTime * 0.012, uTime * 0.007)).r;
        float n2 = texture2D(uNoise, p * 0.13 - vec2(uTime * 0.01, -uTime * 0.014)).r;
        float rip = smoothstep(0.42, 0.7, n1 * 0.6 + n2 * 0.4);
        float win = smoothstep(0.45, 0.95, h);
        col = mix(col, uSurf, win * (0.25 + rip * 0.45));
        // god rays: soft streaks fanning down from the sun direction (angle around it), drifting slowly
        vec3 sd = safeDir(uSunDir);
        vec3 ax = safeDir(cross(sd, vec3(0.0, 0.0, 1.0)) + vec3(1e-3, 0.0, 0.0));
        vec3 ay = cross(sd, ax);
        float axv = dot(d, ax), ayv = dot(d, ay);
        float ang = atan(ayv, abs(axv) < 1e-5 ? 1e-5 : axv) * 0.15915;   // -0.5..0.5 turns
        float r1 = texture2D(uNoise, vec2(ang * 6.0 + uTime * 0.004, 0.31)).r;
        float r2 = texture2D(uNoise, vec2(ang * 14.0 - uTime * 0.006, 0.71)).r;
        float ray = smoothstep(0.5, 0.78, r1 * 0.6 + r2 * 0.4);
        float near = clamp(dot(d, sd), 0.0, 1.0);
        float rayBand = smoothstep(-0.1, 0.35, h) * (0.35 + 0.65 * near * near);
        col += vec3(0.5, 0.85, 0.8) * ray * rayBand * 0.22;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

function seabedMaterial(uniforms, noise, caustic, R) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uNoise: { value: noise }, uCaustic: { value: caustic }, uR: { value: R },
      uSand: { value: new THREE.Color(PALETTE.sand) }, uSand2: { value: new THREE.Color(PALETTE.sand2) },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${SKY_COMMON}
      uniform float uR; uniform vec3 uSand, uSand2; uniform sampler2D uCaustic;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n1 = texture2D(uNoise, p * 0.01).r;
        float n2 = texture2D(uNoise, p * 0.05).r;
        float dune = 0.5 + 0.5 * sin(p.x * 0.35 + p.y * 0.2 + n1 * 9.0);
        vec3 col = mix(uSand2, uSand, n2 * 0.6 + dune * 0.4);
        // darker weed / rock patches
        col *= 1.0 - smoothstep(0.6, 0.75, n1) * 0.35;
        float c1 = texture2D(uCaustic, p * 0.11 + vec2(uTime * 0.02, uTime * 0.011)).r;
        float c2 = texture2D(uCaustic, p * 0.15 - vec2(uTime * 0.015, -uTime * 0.018)).r;
        float ca = min(c1, c2);
        col += vec3(0.7, 1.0, 0.95) * ca * ca * 0.9;
        // the water between the camera and the seabed
        vec3 toP = vW - cameraPosition;
        float dist = length(toP);
        col = mix(col * vec3(0.55, 0.8, 0.85), waterColor(toP), smoothstep(6.0, uR * 0.55, dist) * 0.92 + 0.08);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Builds the water dome, seabed, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality, caustic) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'reef.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  // the sun overhead, a little ahead and to the right, so the god rays fan down into view
  const sunDir = new THREE.Vector3().addScaledVector(viewRight, 0.25).addScaledVector(view, 0.45).addScaledVector(up, 0.85).normalize();
  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const uniforms = skyUniforms(sunDir);
  uniforms.uNoise.value = noise;
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 24, hi ? 16 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'reef.dome';
  group.add(dome);

  const seaY = frame.minY - 7;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), seabedMaterial(uniforms, noise, caustic, R));
  bed.rotation.x = -Math.PI / 2; bed.position.y = seaY; bed.frustumCulled = false; bed.renderOrder = -9; bed.name = 'reef.seabed';
  group.add(bed);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  // water fog: clear over the course, the backdrop melts into blue
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.1 + 14, Math.min(R * 0.6, 150));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: sun through the water, high and from behind-left of the player so the ball reads; slightly cool.
  const key = new THREE.DirectionalLight(0xf0fff8, 2.7);
  const keyDir = new THREE.Vector3().addScaledVector(frame.right, -0.35).addScaledVector(frame.fwd, -0.3).addScaledVector(up, 0.88).normalize();
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

  // Up-light bounced off the sand: undersides and wall faces get a soft teal.
  const rim = new THREE.DirectionalLight(0x5ad8c8, 0.8);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3().addScaledVector(frame.fwd, 0.6).addScaledVector(frame.right, 0.3).addScaledVector(up, -0.55).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xb0f0f0, 0x2a6a70, 0.85);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM of the water over a sandy floor) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(sunDir);
    envUniforms.uNoise.value = noise;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x3a7a78 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6;
    envScene.add(floor);
    const pmrem = new THREE.PMREMGenerator(info.renderer);
    envRT = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    envDome.geometry.dispose(); envDome.material.dispose(); floor.geometry.dispose(); floor.material.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.7;
  }

  scene.add(group);

  return {
    group, sunDir, uniforms, seaY, R, key,
    update(dt, t, camera) {
      uniforms.uTime.value = t;
      if (camera) {
        dome.position.copy(camera.position);
        bed.position.x = camera.position.x; bed.position.z = camera.position.z;
      }
    },
    dispose() {
      scene.remove(group);
      dome.geometry.dispose(); dome.material.dispose();
      bed.geometry.dispose(); bed.material.dispose(); noise.dispose();
      key.shadow.map?.dispose(); key.dispose(); rim.dispose(); hemi.dispose();
      if (envRT) envRT.dispose();
      scene.fog = prevFog; scene.background = prevBg; scene.environment = prevEnv;
      if (prevEnvI !== undefined) scene.environmentIntensity = prevEnvI;
    },
  };
}
