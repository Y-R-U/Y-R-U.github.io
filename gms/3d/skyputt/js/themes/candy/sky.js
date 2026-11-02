// Candy Land theme — bright pastel day sky: soft blue zenith, pink-peach horizon, a warm sun behind the
// player and a rainbow arc ahead; a cotton-candy cloud sea (pink and sky-blue floss) below; a warm sun
// key light (the one shadow caster), a pink rim, a hemi fill, pastel fog and a PMREM env map.
// Mobile GPU rule: every direction is length-checked before dividing, every pow() base is clamped,
// and the rainbow (smoothstep edges in order) is not rendered into the env map.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const PALETTE = {
  zenith: 0x3f8ee6, mid: 0x86c2ff, horSun: 0xffe2cc, horAway: 0xffcae8, below: 0xf2c4e6,
  sun: 0xfff2d8, seaPink: 0xffc2e2, seaBlue: 0xbfe2ff, seaShade: 0xe89ccc, seaDeep: 0xc8a0e8,
  fog: 0xf0d6f2, bg: 0xf0d6f2,
};

const SKY_COMMON = /* glsl */`
  uniform vec3 uZen, uMid, uHorSun, uHorAway, uBelow, uSunDir, uSunCol;
  vec3 safeDir(vec3 d) { float l = length(d); return l > 1e-6 ? d / l : vec3(0.0, 1.0, 0.0); }
  // 0 = away from the sun, 1 = towards it, in the horizontal plane (NaN-safe at the poles).
  float sunSide(vec3 d) {
    float l = length(d.xz);
    vec2 hz = l > 1e-3 ? d.xz / l : vec2(1.0, 0.0);
    float sl = length(uSunDir.xz);
    vec2 sz = sl > 1e-3 ? uSunDir.xz / sl : vec2(1.0, 0.0);
    return clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0);
  }
  vec3 skyColor(vec3 d) {
    d = safeDir(d);
    float h = d.y;
    float sd = sunSide(d);
    vec3 hor = mix(uHorAway, uHorSun, pow(sd, 2.0));
    vec3 col = mix(hor, uMid, smoothstep(-0.02, 0.3, h));
    col = mix(col, uZen, smoothstep(0.25, 0.85, h));
    col = mix(col, uBelow, 1.0 - smoothstep(-0.4, -0.04, h));
    float s = clamp(dot(d, uSunDir), 0.0, 1.0);
    col += uSunCol * (pow(s, 6.0) * 0.22 + pow(s, 60.0) * 0.5);
    return col;
  }`;

function skyUniforms(sunDir, bowDir) {
  const c = (h) => new THREE.Color(h);
  return {
    uZen: { value: c(PALETTE.zenith) }, uMid: { value: c(PALETTE.mid) },
    uHorSun: { value: c(PALETTE.horSun) }, uHorAway: { value: c(PALETTE.horAway) },
    uBelow: { value: c(PALETTE.below) }, uSunCol: { value: c(PALETTE.sun) },
    uSunDir: { value: sunDir.clone() }, uBowDir: { value: bowDir.clone() },
    uTime: { value: 0 }, uBow: { value: 1 },
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
      uniform vec3 uBowDir; uniform float uTime, uBow;
      varying vec3 vDir;
      vec3 bowCol(float x) {   // x 0 (outer, red) → 1 (inner, violet)
        vec3 c = vec3(1.0, 0.36, 0.45);
        c = mix(c, vec3(1.0, 0.66, 0.28), smoothstep(0.08, 0.24, x));
        c = mix(c, vec3(1.0, 0.92, 0.36), smoothstep(0.24, 0.4, x));
        c = mix(c, vec3(0.45, 0.9, 0.5), smoothstep(0.4, 0.56, x));
        c = mix(c, vec3(0.38, 0.72, 1.0), smoothstep(0.56, 0.74, x));
        c = mix(c, vec3(0.7, 0.5, 1.0), smoothstep(0.74, 0.9, x));
        return c;
      }
      void main(){
        vec3 d = safeDir(vDir);
        float h = d.y;
        vec3 col = skyColor(d);
        // sun disc (soft) — behind the player, mostly off screen
        float s = clamp(dot(d, uSunDir), 0.0, 1.0);
        col += uSunCol * smoothstep(0.9975, 0.9988, s) * 1.2;
        // rainbow: a band at a fixed angle from uBowDir (a point just below the horizon ahead)
        if (uBow > 0.5) {
          float a = acos(clamp(dot(d, uBowDir), -1.0, 1.0));
          float R0 = 0.34, W = 0.05;
          float x = (R0 - a) / W;                       // 0 at the outer edge → 1 at the inner
          float band = smoothstep(-0.05, 0.12, x) * (1.0 - smoothstep(0.88, 1.05, x));
          float foot = smoothstep(-0.01, 0.1, h);       // fades into the haze at the horizon
          col = mix(col, col * 0.55 + bowCol(clamp(x, 0.0, 1.0)) * 0.6, band * foot * 0.62);
          // faint secondary glow inside the bow (brighter sky)
          col += vec3(0.08, 0.07, 0.09) * (1.0 - smoothstep(0.0, 0.25, a)) * foot;
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
      uPink: { value: new THREE.Color(PALETTE.seaPink) }, uBlue: { value: new THREE.Color(PALETTE.seaBlue) },
      uShade: { value: new THREE.Color(PALETTE.seaShade) }, uDeep: { value: new THREE.Color(PALETTE.seaDeep) },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${SKY_COMMON}
      uniform sampler2D uNoise; uniform float uTime, uR; uniform vec3 uPink, uBlue, uShade, uDeep;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n1 = texture2D(uNoise, p * 0.009 + vec2(uTime * 0.0015, 0.0)).r;
        float n2 = texture2D(uNoise, p * 0.028 - vec2(0.0, uTime * 0.002)).r;
        float n3 = texture2D(uNoise, p * 0.08 + vec2(uTime * 0.004)).r;
        float hue = texture2D(uNoise, p * 0.0035 + 0.37).r;
        float dens = n1 * 0.58 + n2 * 0.3 + n3 * 0.12;
        float cov = smoothstep(0.26, 0.5, dens);
        vec3 toP = vW - cameraPosition;
        float dist = length(toP.xz);
        float az = sunSide(toP);
        vec3 floss = mix(uPink, uBlue, smoothstep(0.36, 0.56, hue));
        vec3 cl = mix(uShade, floss, smoothstep(0.38, 0.66, dens));
        cl += vec3(1.0, 0.95, 0.9) * 0.12 * smoothstep(0.6, 0.8, dens);
        cl += uSunCol * 0.06 * pow(az, 3.0);
        vec3 col = mix(uDeep, cl, cov);
        col = mix(col, skyColor(toP), smoothstep(uR * 0.15, uR * 0.8, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false, toneMapped: false, depthWrite: true,
  });
}

/**
 * Builds the sky dome, cotton-candy sea, lights, fog and env map.
 * frame = { center, fwd, right, view, viewRight, size, minY } (course frame in world space)
 */
export function buildSky(scene, info, frame, quality) {
  const hi = quality !== 'low';
  const group = new THREE.Group(); group.name = 'candy.sky';
  const up = new THREE.Vector3(0, 1, 0);
  const view = frame.view || frame.fwd, viewRight = frame.viewRight || frame.right;
  // sun behind the player and to the left, fairly high; the rainbow ahead, centred a little right
  const sunDir = new THREE.Vector3().addScaledVector(viewRight, -0.45).addScaledVector(view, -0.6).addScaledVector(up, 0.65).normalize();
  const bowDir = new THREE.Vector3().addScaledVector(viewRight, 0.22).addScaledVector(view, 1.0).addScaledVector(up, -0.06).normalize();
  const uniforms = skyUniforms(sunDir, bowDir);
  const camFar = info.camera?.far ?? 1000;
  const R = Math.min(450, camFar * 0.8);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, hi ? 32 : 24, hi ? 16 : 12), skyMaterial(uniforms));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'candy.dome';
  group.add(dome);

  const noise = noiseTexture(hi ? 256 : 128, 8, 101, hi ? 5 : 4);
  const seaY = frame.minY - 12;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), seaMaterial(uniforms, noise, R));
  sea.rotation.x = -Math.PI / 2; sea.position.y = seaY; sea.frustumCulled = false; sea.renderOrder = -9; sea.name = 'candy.cloudSea';
  group.add(sea);

  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.Fog(PALETTE.fog, frame.size * 1.6 + 45, Math.min(R * 0.95, 300));
  scene.background = new THREE.Color(PALETTE.bg);

  // ---- lights ----
  // Key: warm sun from behind-left of the player, high, so the green and the ball read; the only shadow caster.
  const key = new THREE.DirectionalLight(0xfff0e0, 2.9);
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

  // Soft pink rim from ahead: candy edges get a rosy glint.
  const rim = new THREE.DirectionalLight(0xff9ad0, 0.9);
  rim.position.copy(frame.center).addScaledVector(new THREE.Vector3().addScaledVector(frame.fwd, 0.8).addScaledVector(frame.right, 0.4).addScaledVector(up, 0.35).normalize(), 40);
  rim.target.position.copy(frame.center);
  group.add(rim, rim.target);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xf6b6d4, 0.95);
  group.add(hemi);

  if (info.renderer && !info.renderer.shadowMap.enabled) {
    info.renderer.shadowMap.enabled = true;
    info.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- environment map (one-time PMREM of the sky without the rainbow) ----
  let envRT = null;
  if (info.renderer) {
    const envScene = new THREE.Scene();
    const envUniforms = skyUniforms(sunDir, bowDir);
    envUniforms.uBow.value = 0;
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(envUniforms));
    envScene.add(envDome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: PALETTE.seaPink }));
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
    group, sunDir, bowDir, uniforms, seaY, R, key,
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
