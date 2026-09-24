import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { globalU, damp } from './util.js';

export const PALETTES = {
  garden: { top: 0x070b26, mid: 0x1b2a66, bot: 0x3a4a8a, fog: 0x1c2658, fogNear: 25, fogFar: 150, hemiS: 0x4a60b0, hemiG: 0x141a24, hemiI: 0.75,
    key: 0xa8c0ff, keyI: 0.9, keyDir: [-0.4, 0.7, -0.6], rim: 0x7fa0ff, sun: 0xe8f0ff, sunSize: 0.035, sunGlow: 0.5, stars: 1, aurora: 0.15, mote: 0xd8ff9a, exposure: 1.05 },
  river: { top: 0x0a0a2a, mid: 0x2a2a70, bot: 0x6a4a8a, fog: 0x2a2c66, fogNear: 25, fogFar: 170, hemiS: 0x6070c0, hemiG: 0x1a1a30, hemiI: 0.8,
    key: 0xc0b0ff, keyI: 0.8, keyDir: [0.5, 0.5, -0.7], rim: 0xa090ff, sun: 0xfff0e0, sunSize: 0.03, sunGlow: 0.6, stars: 1, aurora: 0.35, mote: 0xffd080, exposure: 1.1 },
  sky: { top: 0x1a1450, mid: 0xa04a78, bot: 0xf08a5a, fog: 0xa85a78, fogNear: 50, fogFar: 300, hemiS: 0xffa0a0, hemiG: 0x4a2a60, hemiI: 0.9,
    key: 0xffc090, keyI: 1.5, keyDir: [0.2, 0.12, -1], rim: 0xffa070, sun: 0xffd090, sunSize: 0.06, sunGlow: 1.0, stars: 0.35, aurora: 0.5, mote: 0xfff0b0, exposure: 0.85 },
  hush: { top: 0x04030f, mid: 0x160b34, bot: 0x2c1650, fog: 0x150b2c, fogNear: 10, fogFar: 85, hemiS: 0x4a3a90, hemiG: 0x0a0814, hemiI: 0.55,
    key: 0x8a70d0, keyI: 0.5, keyDir: [0.3, 0.8, -0.4], rim: 0x9a70ff, sun: 0xd0c0ff, sunSize: 0.0, sunGlow: 0.0, stars: 0.35, aurora: 0.7, mote: 0xb090ff, exposure: 1.15 },
  dawn: { top: 0x2f58b0, mid: 0xe8987a, bot: 0xffc890, fog: 0xd89a88, fogNear: 60, fogFar: 420, hemiS: 0xffe0d0, hemiG: 0x6a5070, hemiI: 0.9,
    key: 0xffd8a0, keyI: 2.0, keyDir: [0, 0.1, -1], rim: 0xffb070, sun: 0xffe8b0, sunSize: 0.08, sunGlow: 1.1, stars: 0, aurora: 0, mote: 0xffffff, exposure: 0.8 },
};

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
const skyFrag = `
uniform vec3 top, mid, bot, sunCol, sunDir; uniform float sunSize, sunGlow, stars, aurora, time;
varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(bot, mid, smoothstep(-0.15, 0.18, y));
  c = mix(c, top, smoothstep(0.12, 0.75, y));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.12) * sunGlow;
  c += sunCol * smoothstep(1.0 - sunSize * 0.02, 1.0 - sunSize * 0.017, sd) * 3.0;
  if (stars > 0.0 && y > 0.0) {
    vec3 g = floor(d * 260.0);
    float s = h(g);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 60.0);
    c += vec3(1.0, 0.95, 0.85) * step(0.9965, s) * tw * stars * smoothstep(0.0, 0.3, y) * 1.4;
  }
  if (aurora > 0.0 && y > 0.05) {
    float a = sin(d.x * 5.0 + time * 0.12 + sin(d.z * 3.0 + time * 0.2) * 1.5) * 0.5 + 0.5;
    float band = smoothstep(0.08, 0.3, y) * smoothstep(0.75, 0.35, y);
    float streak = pow(a, 4.0) * (0.6 + 0.4 * sin(d.x * 60.0 + d.z * 40.0 + time));
    c += mix(vec3(0.2, 1.0, 0.7), vec3(0.7, 0.3, 1.0), smoothstep(0.2, 0.6, y)) * streak * band * aurora * 0.35;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const gradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.35 }, time: { value: 0 }, flash: { value: 0 }, dark: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, time, flash, dark; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * vig * 3.2;
      c.rgb *= mix(1.0, v, 1.0);
      c.rgb *= 1.0 - dark * smoothstep(0.1, 0.7, length(q * vec2(1.0, 0.8)));
      c.rgb += flash * vec3(1.0, 0.85, 0.6);
      float g = fract(sin(dot(vUv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * 0.018;
      gl_FragColor = c;
    }`,
};

export function createWorld(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.bloom, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.hq ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = opts.hq;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  scene.fog = new THREE.Fog(0x1c2658, 25, 150);

  const skyU = {
    top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 0.3, -1) }, sunSize: { value: 0.03 }, sunGlow: { value: 0.5 }, stars: { value: 1 }, aurora: { value: 0 }, time: globalU.uTime,
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0x4a60b0, 0x141a24, 0.7);
  const key = new THREE.DirectionalLight(0xa8c0ff, 0.9);
  key.castShadow = opts.hq;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  key.shadow.bias = -0.0015; key.shadow.normalBias = 0.03;
  scene.add(hemi, key, key.target);

  const moteCount = 260;
  const mp = new Float32Array(moteCount * 3), ms = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) { mp[i * 3] = (Math.random() - 0.5) * 40; mp[i * 3 + 1] = Math.random() * 10; mp[i * 3 + 2] = (Math.random() - 0.5) * 60; ms[i] = Math.random(); }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  moteGeo.setAttribute('seed', new THREE.BufferAttribute(ms, 1));
  const moteU = { time: globalU.uTime, color: { value: new THREE.Color(0xd8ff9a) }, origin: { value: new THREE.Vector3() }, px: { value: renderer.getPixelRatio() } };
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float time, px; uniform vec3 origin; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(time * 0.5 + seed * 20.0) * 1.5; p.y += sin(time * 0.7 + seed * 11.0) * 0.8;
        p = mod(p - origin + vec3(20.0, 0.0, 30.0), vec3(40.0, 10.0, 60.0)) - vec3(20.0, 0.0, 30.0) + origin;
        p.y = position.y + origin.y - 1.5 + sin(time * 0.7 + seed * 11.0) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.5 + 0.5 * sin(time * (1.5 + seed * 2.0) + seed * 40.0)) * smoothstep(60.0, 20.0, -mv.z);
        gl_PointSize = (40.0 + seed * 40.0) * px / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 color; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(color * 1.6, a * vA); }`,
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  let composer = null, bloom = null, grade = null;
  if (opts.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.86);
    composer.addPass(bloom);
    grade = new ShaderPass(gradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  }

  const cur = {};
  const target = {};
  const colorKeys = ['top', 'mid', 'bot', 'fog', 'hemiS', 'hemiG', 'key', 'rim', 'sun', 'mote'];
  const numKeys = ['fogNear', 'fogFar', 'hemiI', 'keyI', 'sunSize', 'sunGlow', 'stars', 'aurora', 'exposure'];
  function setPalette(name, instant = false) {
    const p = PALETTES[name];
    colorKeys.forEach((k) => { target[k] = new THREE.Color(p[k]); if (instant || !cur[k]) cur[k] = target[k].clone(); });
    numKeys.forEach((k) => { target[k] = p[k]; if (instant || cur[k] === undefined) cur[k] = p[k]; });
    target.keyDir = new THREE.Vector3(...p.keyDir).normalize();
    if (instant || !cur.keyDir) cur.keyDir = target.keyDir.clone();
  }
  setPalette('garden', true);

  const state = { flash: 0, dark: 0, bloomBoost: 0 };
  function update(dt, focus) {
    const k = 1 - Math.exp(-dt * 0.8);
    colorKeys.forEach((c) => cur[c].lerp(target[c], k));
    numKeys.forEach((n) => (cur[n] += (target[n] - cur[n]) * k));
    cur.keyDir.lerp(target.keyDir, k).normalize();
    skyU.top.value.copy(cur.top); skyU.mid.value.copy(cur.mid); skyU.bot.value.copy(cur.bot); skyU.sunCol.value.copy(cur.sun);
    skyU.sunDir.value.copy(cur.keyDir); skyU.sunSize.value = cur.sunSize; skyU.sunGlow.value = cur.sunGlow; skyU.stars.value = cur.stars; skyU.aurora.value = cur.aurora;
    scene.fog.color.copy(cur.fog); scene.fog.near = cur.fogNear; scene.fog.far = cur.fogFar;
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    key.color.copy(cur.key); key.intensity = cur.keyI;
    globalU.uRim.value.copy(cur.rim);
    moteU.color.value.copy(cur.mote);
    renderer.toneMappingExposure = cur.exposure;
    sky.position.copy(camera.position);
    key.position.copy(focus).addScaledVector(cur.keyDir, 40);
    key.target.position.copy(focus);
    moteU.origin.value.copy(focus);
    state.flash = damp(state.flash, 0, 3.5, dt);
    if (grade) { grade.uniforms.time.value = globalU.uTime.value % 10; grade.uniforms.flash.value = state.flash; grade.uniforms.dark.value = state.dark; }
    if (bloom) bloom.strength = 0.7 + state.bloomBoost + state.flash * 2;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.75 ? 68 : 55;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); }
    moteU.px.value = renderer.getPixelRatio();
  }
  resize();
  window.addEventListener('resize', resize);

  const render = () => (composer ? composer.render() : renderer.render(scene, camera));
  return { renderer, scene, camera, setPalette, update, render, state, key, hemi };
}
