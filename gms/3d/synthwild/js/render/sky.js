// Day/night cycle, sky dome, and the lighting uniforms every world material shares.
// time01: 0 = sunrise, 0.375 = noon, 0.75 = sunset, 0.875 = midnight. 20 min per cycle, last 5 min are night.
import { hexToLinear, smoothstep, clamp } from '../core/math.js';

export const DAY_SECONDS = 1200;
export const NIGHT_START = 0.75;

// Keyframes (sRGB hex): zenith, horizon, ambient (sky light), ground bounce, light colour, fog
const KEYS = [
  [0.000, 0x4a62c8, 0xffa07a, 0x9a8cc8, 0x5a4a6a, 0xffa868, 0xf0a890],
  [0.050, 0x3b8cf0, 0xffd3a8, 0xb4c4e8, 0x7a7060, 0xffe0b8, 0xe8d8c8],
  [0.140, 0x2a8cff, 0xa8e4ff, 0xbad8ff, 0x8a8a6a, 0xfff2dc, 0xb0e4ff],
  [0.375, 0x1f86ff, 0xa6e6ff, 0xc0dcff, 0x8c8c6c, 0xfff6e4, 0xb4e8ff],
  [0.630, 0x2a84f8, 0xaee2ff, 0xbad4f8, 0x8a8468, 0xffefd4, 0xb8e4ff],
  [0.715, 0x4060c8, 0xffa86a, 0xc09ab8, 0x6a5458, 0xffa060, 0xffb090],
  [0.750, 0x3a3aa0, 0xff6a9a, 0x9a78c0, 0x4a4060, 0xff7a6a, 0xe07aa8],
  [0.790, 0x1a2478, 0x6a3ab0, 0x6a6ac8, 0x302a58, 0x7a8ae8, 0x5a4aa8],
  [0.875, 0x0a1658, 0x2048a0, 0x3c54b4, 0x262c60, 0x8aa8ff, 0x203e90],
  [0.960, 0x16246c, 0x5a4ab0, 0x6070c8, 0x302c60, 0x9a90e8, 0x4a48a8],
  [1.000, 0x4a62c8, 0xffa07a, 0x9a8cc8, 0x5a4a6a, 0xffa868, 0xf0a890],
].map(([t, ...c]) => [t, ...c.map(hexToLinear)]);

function sample(t, idx, out) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = smoothstep(0, 1, (t - a[0]) / Math.max(1e-6, b[0] - a[0]));
  const ca = a[idx], cb = b[idx];
  out[0] = ca[0] + (cb[0] - ca[0]) * k; out[1] = ca[1] + (cb[1] - ca[1]) * k; out[2] = ca[2] + (cb[2] - ca[2]) * k;
  return out;
}

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FS = /* glsl */`
uniform vec3 uZenith, uHorizon, uSunDir, uMoonDir, uSunTint;
uniform float uTime, uNight, uDaylight, uUnderwater;
uniform vec3 uFogColor;
varying vec3 vDir;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hz = pow(1.0 - clamp(y, 0.0, 1.0), 3.0);
  vec3 col = mix(uZenith, uHorizon, hz);
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-y * 3.0, 0.0, 1.0));
  // warm halo toward the sun near the horizon
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunTint * pow(sd, 8.0) * 0.6 * (1.0 - uNight);
  col += uSunTint * pow(sd, 64.0) * 0.8 * (1.0 - uNight);
  // sun disc
  col += vec3(1.6, 1.45, 1.2) * smoothstep(0.9993, 0.9996, sd) * (1.0 - uNight * 0.9);
  // moon with a soft crescent
  float md = dot(d, uMoonDir);
  float moon = smoothstep(0.9990, 0.9993, md);
  float cres = smoothstep(0.9990, 0.9993, dot(d, normalize(uMoonDir + vec3(0.012, 0.006, 0.0))));
  col = mix(col, vec3(0.9, 0.95, 1.1), moon * (1.0 - cres * 0.85) * (0.4 + uNight * 0.6));
  col += vec3(0.25, 0.35, 0.8) * pow(max(md, 0.0), 120.0) * 0.4 * uNight;
  // orbital ring arc: a thin luminous band tilted across the sky
  vec3 ringN = normalize(vec3(0.12, 0.8, 0.58));
  float rd = dot(d, ringN);
  float band = (smoothstep(0.014, 0.003, abs(rd - 0.03)) + 0.5 * smoothstep(0.006, 0.0, abs(rd - 0.052)))
    * smoothstep(-0.01, 0.015, y) * (0.55 + 0.45 * smoothstep(0.0, 0.5, y));
  float stripes = 0.8 + 0.2 * sin(rd * 900.0);
  float lit = mix(0.35, 1.0, uNight);
  col += band * stripes * mix(vec3(0.9, 0.95, 1.0) * 0.16, vec3(0.6, 0.7, 1.2) * 0.32, uNight) * lit;
#ifndef LOW
  // stars
  if (uNight > 0.01 && y > 0.0) {
    vec3 sp = d * 220.0;
    vec2 cell = floor(sp.xz / (1.0 + y) + sp.y);
    float s = h21(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
    float star = step(0.985, s) * smoothstep(0.35, 0.05, length(fract(sp.xz / (1.0 + y) + sp.y) - 0.5));
    col += vec3(0.8, 0.9, 1.0) * star * tw * uNight * smoothstep(0.0, 0.3, y);
#ifndef MED
    // aurora ribbons
    vec2 ap = d.xz / max(y, 0.08);
    float ribbon = vn(vec2(ap.x * 0.6 + uTime * 0.02, ap.y * 0.15));
    float a = smoothstep(0.55, 0.75, ribbon) * smoothstep(0.05, 0.35, y) * smoothstep(0.9, 0.4, y);
    a *= 0.6 + 0.4 * sin(ap.x * 6.0 + uTime * 0.7);
    col += mix(vec3(0.1, 0.9, 0.7), vec3(0.8, 0.2, 0.9), vn(ap * 0.4)) * a * 0.35 * uNight;
#endif
  }
  // soft high clouds
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 2.0 + vec2(uTime * 0.01, 0.0);
#ifdef MED
    float c = vn(cp) * 0.75 + 0.12;
#else
    float c = vn(cp) * 0.6 + vn(cp * 2.3) * 0.3 + vn(cp * 5.1) * 0.1;
#endif
    c = smoothstep(0.55, 0.85, c) * smoothstep(0.0, 0.25, y);
    vec3 cc = mix(vec3(1.0, 0.98, 0.95), uHorizon * 1.2 + uSunTint * 0.3 * (1.0 - uNight), 0.35) * (0.12 + uDaylight * 0.95);
    cc = mix(cc, uZenith * 1.6 + vec3(0.02, 0.03, 0.06), uNight * 0.85);
    col = mix(col, cc, c * 0.65);
  }
#endif
  if (uUnderwater > 0.5) col = mix(uFogColor * 1.3, col, 0.3 * smoothstep(0.5, 0.9, y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky(ctx) {
  const { THREE, scene, bus } = ctx;
  const u = {
    uTime: { value: 0 }, uDaylight: { value: 1 }, uNight: { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uAmbient: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogSunColor: { value: new THREE.Color() },
    uFogNear: { value: 60 }, uFogFar: { value: 120 },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunTint: { value: new THREE.Color() },
    uBlockColor: { value: new THREE.Color().setRGB(...hexToLinear(0xa8e4ff)) },
    uRimColor: { value: new THREE.Color().setRGB(...hexToLinear(0x9ff0ff)) },
    uWaterTint: { value: new THREE.Color().setRGB(...hexToLinear(0xb0e8f0)) },
    uShallow: { value: new THREE.Color().setRGB(...hexToLinear(0x3fe6d8)) },
    uDeep: { value: new THREE.Color().setRGB(...hexToLinear(0x0f6cb8)) },
    uSeaLevel: { value: 31.875 },
    uUnderwater: { value: 0 },
  };

  // sky shader tiers: high = everything; med = stars + one cloud octave; low = gradient, sun, moon, ring only
  const skyDefines = (q) => (q === 'low' ? { LOW: '' } : q === 'med' ? { MED: '' } : {});
  const domeMat = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, defines: skyDefines(ctx.quality ? ctx.quality() : 'high'),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), domeMat);
  dome.frustumCulled = false;
  // after opaque + cutout terrain (0, 1) and before water (2): only pixels that are still sky get shaded (early-Z on phones)
  dome.renderOrder = 1.5;
  scene.add(dome);

  // Lights so lane 3/4's standard materials (avatar, mobs) match the world lighting.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(hemi, sunLight, sunLight.target);
  scene.fog = new THREE.Fog(0xffffff, 60, 120);

  const tmp = [0, 0, 0], tmpC = new THREE.Color();
  const sky = {
    uniforms: u,
    time01: 0.3,
    isNight: false,
    daylight01: 1,
    sunDir: u.uSunDir.value,
    moonDir: u.uMoonDir.value,
    speed: 1,
    frozen: false,
    setTime(t) { this.time01 = ((t % 1) + 1) % 1; this.apply(true); },
    setQuality(q) { domeMat.defines = skyDefines(q); domeMat.needsUpdate = true; },
    fogNear: 60, fogFar: 120,
    setFog(near, far) { this.fogNear = near; this.fogFar = far; },
    update(dt) {
      u.uTime.value += dt;
      const always = ctx.settings?.get?.('alwaysDay');
      if (always) this.time01 = 0.33;
      else if (!this.frozen && !ctx.session?.paused) this.time01 = (this.time01 + (dt * this.speed) / DAY_SECONDS) % 1;
      this.apply(false);
      const cam = ctx.camera;
      if (cam) dome.position.copy(cam.position);
    },
    apply(force) {
      const t = this.time01;
      const dayPh = clamp(t / NIGHT_START, 0, 1);
      const sa = dayPh * Math.PI;
      u.uSunDir.value.set(Math.cos(sa), Math.sin(sa), 0.35).normalize();
      if (t >= NIGHT_START) u.uSunDir.value.y = -Math.abs(Math.sin(((t - NIGHT_START) / (1 - NIGHT_START)) * Math.PI)) - 0.05;
      const ma = (t < NIGHT_START ? 1 : (t - NIGHT_START) / (1 - NIGHT_START)) * Math.PI;
      u.uMoonDir.value.set(Math.cos(ma), Math.max(Math.sin(ma), t < NIGHT_START ? -0.5 : 0.08), -0.3).normalize();
      const sunElev = t < NIGHT_START ? Math.sin(sa) : -0.3;
      const dl = smoothstep(-0.05, 0.22, sunElev);
      this.daylight01 = dl;
      u.uDaylight.value = dl;
      u.uNight.value = 1 - smoothstep(-0.02, 0.15, sunElev);
      // light comes from the sun by day and the moon by night
      u.uLightDir.value.copy(dl > 0.12 ? u.uSunDir.value : u.uMoonDir.value);
      if (u.uLightDir.value.y < 0.08) { u.uLightDir.value.y = 0.08; u.uLightDir.value.normalize(); }
      sample(t, 1, tmp); u.uZenith.value.setRGB(tmp[0], tmp[1], tmp[2]);
      sample(t, 2, tmp); u.uHorizon.value.setRGB(tmp[0], tmp[1], tmp[2]);
      sample(t, 3, tmp); u.uAmbient.value.setRGB(tmp[0], tmp[1], tmp[2]);
      sample(t, 4, tmp); u.uGround.value.setRGB(tmp[0], tmp[1], tmp[2]);
      sample(t, 5, tmp);
      const li = dl > 0.12 ? 0.75 + 0.5 * dl : 0.28;
      u.uLightColor.value.setRGB(tmp[0] * li, tmp[1] * li, tmp[2] * li);
      u.uSunTint.value.setRGB(tmp[0], tmp[1] * 0.75, tmp[2] * 0.6);
      sample(t, 6, tmp); u.uFogColor.value.setRGB(tmp[0], tmp[1], tmp[2]);
      u.uFogSunColor.value.copy(u.uFogColor.value).lerp(u.uSunTint.value, 0.5 * (1 - u.uNight.value));
      if (u.uUnderwater.value > 0.5) {
        u.uFogColor.value.setRGB(...hexToLinear(0x0e6a8a)).multiplyScalar(0.25 + 0.75 * dl);
        u.uFogSunColor.value.copy(u.uFogColor.value);
        u.uFogNear.value = 1; u.uFogFar.value = 24;
      } else { u.uFogNear.value = this.fogNear; u.uFogFar.value = this.fogFar; }
      // standard-material lights
      hemi.color.copy(u.uAmbient.value); hemi.groundColor.copy(u.uGround.value);
      hemi.intensity = 1.5;
      sunLight.color.copy(u.uLightColor.value);
      sunLight.intensity = 2.2;
      sunLight.position.copy(u.uLightDir.value).multiplyScalar(50);
      if (ctx.camera) { sunLight.position.add(ctx.camera.position); sunLight.target.position.copy(ctx.camera.position); }
      scene.fog.color.copy(u.uFogColor.value);
      scene.fog.near = u.uFogNear.value; scene.fog.far = u.uFogFar.value;
      tmpC.copy(u.uFogColor.value);

      const night = t >= NIGHT_START + 0.005 && t < 0.995;
      if (night !== this.isNight || force) {
        const changed = night !== this.isNight;
        this.isNight = night;
        if (changed) bus?.emit(night ? 'time:night' : 'time:day', { time01: t });
      }
    },
    dispose() { scene.remove(dome, hemi, sunLight, sunLight.target); dome.geometry.dispose(); domeMat.dispose(); },
  };
  sky.apply(true);
  return sky;
}
