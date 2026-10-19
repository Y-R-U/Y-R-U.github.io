// Card portraits (cached, transparent) + the 3D profile turntable scene object.
import * as THREE from 'three';
import { createUnit, MODELS } from './units.js';
import { FACTIONS } from './materials.js';

const cache = new Map();
let fallback = null;

function studio(scene, palette, strength = 1) {
  const key = new THREE.DirectionalLight(0xfff4e8, 3.3 * strength);
  key.position.set(2.5, 4, 3.5);
  const rimA = new THREE.DirectionalLight(palette.glow, 3.2 * strength);
  rimA.position.set(-3, 2.5, -2.5);
  const rimB = new THREE.DirectionalLight(0xcfdcff, 1.3 * strength);   // neutral cool rim: a blue rim + orange faction rim mixed to purple
  rimB.position.set(3, 1.5, -3);
  const fill = new THREE.HemisphereLight(0xb8c8ff, 0x22202a, 1.0 * strength);
  scene.add(key, rimA, rimB, fill);
  return [key, rimA, rimB, fill];
}

function fallbackRenderer() {
  if (fallback) return fallback;
  const r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
  r.setPixelRatio(1);
  const pm = new THREE.PMREMGenerator(r);
  const env = pm.fromScene(neonRoom(), 0.04).texture;
  fallback = { renderer: r, env };
  return fallback;
}
// Minimal neon room for env reflections when no engine env is passed.
export function neonRoom() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05070d);
  const add = (c, i, w, h, p, r) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(...p); m.rotation.set(...r); s.add(m);
  };
  add(0xbfd8ff, 3, 8, 3, [0, 7, 0], [Math.PI / 2, 0, 0]);
  add(0x1fd2ff, 4, 0.4, 6, [-6, 2, -4], [0, 0.6, 0]);
  add(0x1fd2ff, 4, 0.4, 6, [6, 2, -4], [0, -0.6, 0]);
  add(0xb24dff, 3, 10, 0.3, [0, 1.2, -7], [0, 0, 0]);
  add(0xff6a1a, 2, 10, 0.3, [0, 0.6, 7], [0, Math.PI, 0]);
  add(0x2a3550, 1, 30, 30, [0, -1, 0], [-Math.PI / 2, 0, 0]);
  add(0xffffff, 6, 2, 2, [4, 5, 4], [-0.8, 0.7, 0]);
  return s;
}

const GRADE = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uExp: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc; uniform float uExp; varying vec2 vUv;
    vec3 aces(vec3 c) {
      const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = i * c; vec3 a = c * (c + 0.0245786) - 0.000090537; vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
      return clamp(o * (a / b), 0.0, 1.0);
    }
    vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec4 s = texture2D(tSrc, vUv);
      // cheap glow: a few taps around for emissive halos
      vec3 g = vec3(0.0);
      for (int k = 0; k < 8; k++) { float a = float(k) * 0.785; g += max(texture2D(tSrc, vUv + vec2(cos(a), sin(a)) * 0.012).rgb - 1.0, 0.0); }
      vec3 c = aces((s.rgb + g * 0.12) * uExp / 0.6);
      float al = clamp(s.a + dot(g, vec3(0.1)), 0.0, 1.0);
      gl_FragColor = vec4(srgb(c), al);
    }`,
  depthTest: false, depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), GRADE);
const quadScene = new THREE.Scene(); quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// opts: { engine | renderer, env, rarity, faction, w=256, h=320, framing 'bust'|'full', yaw, anim, t, format 'dataURL'|'bitmap'|'canvas' }
export async function renderPortrait(model, opts = {}) {
  const def = MODELS[model] || {};
  const o = { w: 256, h: 320, framing: 'bust', yaw: 0.55, anim: 'idle', t: 0.6, rarity: def.rarity || 'common', faction: def.faction, format: 'dataURL', ...opts };
  const key = [model, o.rarity, o.faction, o.w, o.h, o.framing, o.yaw, o.anim, o.t, o.format].join('|');
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const R = o.engine?.renderer || o.renderer || fallbackRenderer().renderer;
    const env = o.env || o.engine?.env || (R === fallback?.renderer ? fallback.env : fallbackRenderer().env);
    const unit = createUnit({ model, rarity: o.rarity, faction: o.faction, quality: 'high' });
    const scene = new THREE.Scene();
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    studio(scene, unit.palette);
    scene.add(unit.root);
    unit.play(o.anim);
    for (let i = 0; i < Math.round(o.t * 30); i++) unit.update(1 / 30);
    unit.root.rotation.y = o.yaw;
    unit.root.updateMatrixWorld(true);
    const H = unit.height, cam = new THREE.PerspectiveCamera(o.framing === 'bust' ? 24 : 28, o.w / o.h, 0.1, 50);
    const box = new THREE.Box3().setFromObject(unit.mesh, true);
    // frame on the bounding box: bust = upper ~60% (wide units like quads fall back to full); always fit the width too
    const bh = box.max.y - box.min.y, bw = Math.max(box.max.x - box.min.x, 0.1);
    const bust = o.framing === 'bust' && bh > bw * 0.7;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const cy = bust ? box.max.y - bh * 0.3 : (box.max.y + box.min.y) / 2;
    const span = Math.max(bust ? bh * 0.62 : bh * 1.08, (bust ? bw * 0.5 : bw * 0.9) / cam.aspect);
    const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(cx, cy + H * 0.08, box.max.z + Math.max(dist, 1));
    cam.lookAt(cx, cy, cz);
    const rtA = new THREE.WebGLRenderTarget(o.w * 2, o.h * 2, { type: THREE.HalfFloatType, samples: 4 });
    const rtB = new THREE.WebGLRenderTarget(o.w, o.h, { type: THREE.UnsignedByteType });
    const prev = { rt: R.getRenderTarget(), cc: R.getClearColor(new THREE.Color()), ca: R.getClearAlpha() };
    R.setRenderTarget(rtA); R.setClearColor(0x000000, 0); R.clear();
    R.render(scene, cam);
    GRADE.uniforms.tSrc.value = rtA.texture;
    R.setRenderTarget(rtB); R.clear(); R.render(quadScene, quadCam);
    const px = new Uint8Array(o.w * o.h * 4);
    R.readRenderTargetPixels(rtB, 0, 0, o.w, o.h, px);
    R.setRenderTarget(prev.rt); R.setClearColor(prev.cc, prev.ca);
    rtA.dispose(); rtB.dispose(); unit.dispose();
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    const g = c.getContext('2d'), img = g.createImageData(o.w, o.h);
    for (let y = 0; y < o.h; y++) img.data.set(px.subarray((o.h - 1 - y) * o.w * 4, (o.h - y) * o.w * 4), y * o.w * 4);
    g.putImageData(img, 0, 0);
    if (o.format === 'canvas') return c;
    if (o.format === 'bitmap' && typeof createImageBitmap === 'function') return createImageBitmap(c);
    return c.toDataURL('image/png');
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}

// Scene object for the 3D profile view (engine.setScene(tt)). Drag with tt.rotate(dxPixels).
export function createTurntable(engine, unitOpts = {}) {
  const scene = new THREE.Scene();
  scene.environment = engine?.env || null;
  scene.environmentIntensity = 0.85;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  let unit = null, lights = [], yaw = 0.5, spin = 0.35, idleFor = 0, pedestal = null;
  const group = new THREE.Group(); scene.add(group);

  function buildPedestal(color) {
    if (pedestal) { group.remove(pedestal); pedestal.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); }
    pedestal = new THREE.Group();
    // neutral dark pedestal (low metalness so it doesn't mirror the coloured env/rims) + the faction plate colour at a
    // brightness that survives tone mapping without hue-shifting (orange x3 went gold)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.25, roughness: 0.55 }));
    top.position.y = -0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.025, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.35) }));
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.18), transparent: true, opacity: 0.8, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2; glowDisc.rotation.z = Math.PI / 6; glowDisc.position.y = 0.004;
    pedestal.add(glowDisc);
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 0.005;
    pedestal.add(top, ring);
    group.add(pedestal);
  }
  function setUnit(opts) {
    if (unit) unit.dispose();
    for (const l of lights) scene.remove(l);
    unit = createUnit({ quality: engine?.quality?.name === 'low' ? 'med' : 'high', ...opts });
    lights = studio(scene, unit.palette, 0.9);
    group.add(unit.root);
    buildPedestal(unit.rarity === 'legendary' || unit.faction === 'legendary' ? 0xffc23a : unit.palette.plate);
    unit.play('deploy');
    const h = unit.height;
    camera.position.set(0, h * 0.8, h * 2.9 + 1.6);
    camera.lookAt(0, h * 0.48, 0);
    obj.unit = unit;
    return unit;
  }
  const obj = {
    scene, camera, unit: null,
    setUnit,
    play(name, o) { return unit?.play(name, o); },
    rotate(dx) { yaw += dx * 0.01; idleFor = 0; },
    update(dt) {
      idleFor += dt;
      if (idleFor > 2) yaw += dt * spin;
      group.rotation.y = yaw;
      unit?.update(dt);
      if (unit && !unit.state.action && unit.state.loop !== 'idle') unit.play('idle');
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() { unit?.dispose(); if (pedestal) pedestal.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); },
  };
  setUnit(unitOpts);
  return obj;
}
