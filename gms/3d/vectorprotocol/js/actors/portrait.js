// Card portraits (cached, transparent) + the 3D profile turntable scene object.
import * as THREE from 'three';
import { createUnit, MODELS } from './units.js';
import { FACTIONS, createHoverBeam } from './materials.js';

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

// Bump when card portraits change look; ui folds it into its PORTRAIT_VERSION cache key.
export const PORTRAIT_STYLE = 2;   // 2: ARBITER re-sculpt (round 6)

// Per-renderer portrait state, reused across calls: render targets, one studio scene, and one live material per shader program.
// Disposing a unit's materials released their programs, so every portrait recompiled ~6 shaders (~30 ms of the 55 ms).
const shared = new WeakMap();
function portraitState(R, w, h) {
  let st = shared.get(R);
  if (!st) {
    const scene = new THREE.Scene();
    st = { scene, lights: studio(scene, { glow: 0xffffff }), keep: new Map(), rtA: null, rtB: null };
    shared.set(R, st);
  }
  if (!st.rtA || st.rtB.width !== w || st.rtB.height !== h) {
    st.rtA?.dispose(); st.rtB?.dispose();
    st.rtA = new THREE.WebGLRenderTarget(w * 2, h * 2, { type: THREE.HalfFloatType, samples: 4 });
    st.rtB = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  }
  return st;
}
// keep one material alive per compiled program so the next unit's identical materials reuse it
function keepPrograms(R, st, unit) {
  unit.root.traverse((m) => {
    if (!m.material) return;
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
      const prog = R.properties.get(mm).currentProgram;
      if (prog && !st.keep.has(prog)) { st.keep.set(prog, mm); mm.dispose = () => {}; }
    }
  });
}
// exact world box of a rigid-skinned unit mesh (one bone per vertex): one matrix per bone instead of three's per-vertex skinning
const _bm = [], _v3 = new THREE.Vector3();
function unitBox(mesh) {
  const box = new THREE.Box3(), sk = mesh.skeleton, g = mesh.geometry;
  const P = g.attributes.position.array, SI = g.attributes.skinIndex.array, n = g.attributes.position.count;
  for (let i = 0; i < sk.bones.length; i++) (_bm[i] ||= new THREE.Matrix4()).multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const e = _bm[SI[i * 4]].elements, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy; if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
  }
  box.set(_v3.set(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  // extra meshes a model hangs on its bones (ghosts etc.): exact, the slow way
  mesh.traverse((m) => { if (m !== mesh && m.isMesh) box.expandByObject(m, true); });
  return box;
}
const yieldTask = () => new Promise((r) => setTimeout(r, 0));

// opts: { engine | renderer, env, rarity, faction, w=256, h=320, framing 'bust'|'full', yaw, anim, t, format 'dataURL'|'bitmap'|'canvas' }
// Split across tasks: build + pose the unit, yield, then render + async readback (the GPU fence is polled, not waited on).
export async function renderPortrait(model, opts = {}) {
  const def = MODELS[model] || {};
  const o = { w: 256, h: 320, framing: 'bust', yaw: 0.55, anim: 'idle', t: 0.6, rarity: def.rarity || 'common', faction: def.faction, format: 'dataURL', ...opts };
  const key = [model, o.rarity, o.faction, o.w, o.h, o.framing, o.yaw, o.anim, o.t, o.format].join('|');
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const t0 = performance.now();
    const R = o.engine?.renderer || o.renderer || fallbackRenderer().renderer;
    const env = o.env || o.engine?.env || (R === fallback?.renderer ? fallback.env : fallbackRenderer().env);
    const unit = createUnit({ model, rarity: o.rarity, faction: o.faction, quality: 'high' });
    unit.play(o.anim);
    for (let i = 0; i < Math.round(o.t * 30); i++) unit.update(1 / 30);
    unit.root.rotation.y = o.yaw;
    unit.root.updateMatrixWorld(true);
    const H = unit.height, cam = new THREE.PerspectiveCamera(o.framing === 'bust' ? 24 : 28, o.w / o.h, 0.1, 50);
    const box = unitBox(unit.mesh);
    // frame on the bounding box: bust = upper ~60% (wide units like quads fall back to full); always fit the width too
    const bh = box.max.y - box.min.y, bw = Math.max(box.max.x - box.min.x, 0.1);
    // bust only for upright bipeds; quads, hovers and tracked units (and anything squat) frame whole
    const upright = !['quad', 'beast', 'hover', 'tracked'].includes(def.rig);
    const bust = o.framing === 'bust' && upright && bh > bw * 0.9;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const cy = bust ? box.max.y - bh * 0.3 : (box.max.y + box.min.y) / 2;
    const span = Math.max(bust ? bh * 0.62 : bh * 1.06, (bust ? bw * 0.62 : bw * 0.98) / cam.aspect);
    const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(cx, cy + H * 0.08, box.max.z + Math.max(dist, 1));
    cam.lookAt(cx, cy, cz);
    const tBuild = performance.now() - t0;
    if (o.split !== false) await yieldTask();

    const t1 = performance.now();
    const st = portraitState(R, o.w, o.h);
    const { scene, lights } = st;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    lights[1].color.set(unit.palette.glow);
    scene.add(unit.root);
    const prev = { rt: R.getRenderTarget(), cc: R.getClearColor(new THREE.Color()), ca: R.getClearAlpha() };
    R.setRenderTarget(st.rtA); R.setClearColor(0x000000, 0); R.clear();
    R.render(scene, cam);
    GRADE.uniforms.tSrc.value = st.rtA.texture;
    R.setRenderTarget(st.rtB); R.clear(); R.render(quadScene, quadCam);
    const px = new Uint8Array(o.w * o.h * 4);
    let read = null;
    if (R.readRenderTargetPixelsAsync && o.asyncRead !== false) {
      try { read = R.readRenderTargetPixelsAsync(st.rtB, 0, 0, o.w, o.h, px); } catch (e) { read = null; }
    }
    if (!read) R.readRenderTargetPixels(st.rtB, 0, 0, o.w, o.h, px);
    R.setRenderTarget(prev.rt); R.setClearColor(prev.cc, prev.ca);
    keepPrograms(R, st, unit);
    unit.dispose();
    const tRender = performance.now() - t1;
    if (read) await read.catch(() => R.readRenderTargetPixels(st.rtB, 0, 0, o.w, o.h, px));

    const t2 = performance.now();
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    const g = c.getContext('2d'), img = g.createImageData(o.w, o.h);
    for (let y = 0; y < o.h; y++) img.data.set(px.subarray((o.h - 1 - y) * o.w * 4, (o.h - y) * o.w * 4), y * o.w * 4);
    g.putImageData(img, 0, 0);
    portraitStats.last = { model, build: +tBuild.toFixed(1), render: +tRender.toFixed(1), canvas: +(performance.now() - t2).toFixed(1), wall: +(performance.now() - t0).toFixed(1) };
    if (o.format === 'canvas') return c;
    if (o.format === 'bitmap' && typeof createImageBitmap === 'function') return createImageBitmap(c);
    return c.toDataURL('image/png');
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
// main-thread ms of the last renderPortrait, per task: { build, render, canvas, wall }
export const portraitStats = { last: null };

// Real silhouette of a posed unit as height bands: [{y0, y1, r}] (r = max distance from the spin axis, so any yaw fits).
export function unitBands(unit, n = 10) {
  const v = new THREE.Vector3();
  unit.root.updateMatrixWorld(true);
  let y0 = 1e9, y1 = -1e9;
  const pts = [];
  unit.root.traverse((m) => {
    if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
    for (let o = m; o; o = o.parent) if (!o.visible) return;
    const p = m.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 3000));
    for (let i = 0; i < p.count; i += st) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      pts.push(v.y, Math.hypot(v.x, v.z));
      if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
    }
  });
  if (!pts.length) return [{ y0: 0, y1: unit.height, r: unit.radius }];
  const bh = Math.max(y1 - y0, 0.01), bands = Array.from({ length: n }, (_, i) => ({ y0: y0 + bh * i / n, y1: y0 + bh * (i + 1) / n, r: 0 }));
  for (let i = 0; i < pts.length; i += 2) bands[Math.min(n - 1, Math.floor((pts[i] - y0) / bh * n))].r = Math.max(bands[Math.min(n - 1, Math.floor((pts[i] - y0) / bh * n))].r, pts[i + 1]);
  return bands.filter((b) => b.r > 0);
}

// Fit a camera (fixed pitch, looking along -z) so every band circle projects inside the target box. Units are fractions of the
// frame HEIGHT at zoom 1 (aspect-independent): halfH / halfW = allowed half extents, cy = vertical centre, cx = horizontal centre.
export function fitCamera(camera, bands, { halfH = 0.3, halfW = 0.34, cy = 0, cx = 0, pitch = 0.1, margin = 1.05 } = {}) {
  const k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ring = [];
  for (const b of bands) for (const y of [b.y0, b.y1]) for (let a = 0; a < 24; a++) {
    const t = a / 24 * Math.PI * 2;
    ring.push(Math.cos(t) * b.r * margin, y, Math.sin(t) * b.r * margin);
  }
  let ymin = 1e9, ymax = -1e9; for (const b of bands) { ymin = Math.min(ymin, b.y0); ymax = Math.max(ymax, b.y1); }
  let D = 6, tY = (ymin + ymax) / 2, tX = 0;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let it = 0; it < 40; it++) {
    // camera at target + D*(0, sp, cp); camera-space: right = +x, up = (0, cp, -sp), forward = (0, -sp, -cp)
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < ring.length; i += 3) {
      const dx = ring[i] - tX, dy = ring[i + 1] - (tY + D * sp), dz = ring[i + 2] - D * cp;
      const z = -sp * dy - cp * dz, xr = dx, yr = dy * cp - dz * sp;
      const u = xr / (Math.max(z, 0.05) * k), vv = yr / (Math.max(z, 0.05) * k);
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (vv < v0) v0 = vv; if (vv > v1) v1 = vv;
    }
    const s = D * k;
    tY += ((v0 + v1) / 2 - cy) * s;
    tX += ((u0 + u1) / 2 - cx) * s;
    const need = Math.max((v1 - v0) / 2 / halfH, (u1 - u0) / 2 / halfW);
    D = Math.max(0.5, D * (1 + (need - 1) * 0.8));
  }
  camera.position.set(tX, tY + D * sp, D * cp);
  camera.lookAt(tX, tY, 0);
  return { D, tX, tY };
}

// Turntable stage backdrop: a camera-independent sky dome (lit gradient + a soft glow behind the subject + vignette) and a
// floor disc (faction glow pooled under the plate, hex lines for sci-fi, flagstones for fantasy) that fades into the dome.
// Dim on purpose (stays under the bloom threshold). 2 draw calls.
const BD_VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const BD_COMMON = /* glsl */`
  uniform vec3 uTint, uTop, uLow, uFocus; uniform float uSize, uFantasy;
  varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;
const DOME_FRAG = BD_COMMON + /* glsl */`
  void main() {
    vec3 d = normalize(vW - cameraPosition), c = normalize(uFocus - cameraPosition);
    float ang = acos(clamp(dot(d, c), -1.0, 1.0)) / uSize;          // 1 = the subject's angular half-height
    vec3 col = mix(uLow, uTop, smoothstep(-0.25, 0.55, d.y));
    col += uTint * (0.075 * exp(-ang * ang * 0.7) + 0.018 * exp(-ang * 0.45));   // halo behind the unit + wide wash
    // fantasy: faint drifting canopy / dusk mottling up high; sci-fi: faint horizontal scan bands
    float n = hash(floor(d.xz / max(d.y + 1.2, 0.2) * 9.0));
    col *= mix(1.0 + 0.05 * sin(d.y * 140.0) * smoothstep(0.0, 0.4, d.y), 0.92 + 0.12 * n * smoothstep(0.05, 0.6, d.y), uFantasy);
    col *= 1.0 - 0.45 * smoothstep(1.2, 4.0, ang);                    // vignette
    gl_FragColor = vec4(col, 1.0);
  }`;
const FLOOR_FRAG = BD_COMMON + /* glsl */`
  uniform float uPed;
  void main() {
    vec2 p = vW.xz; float r = length(p) / uPed;
    // pattern: hex lines (sci-fi) or offset flagstones with mortar (fantasy)
    vec2 h = p * 1.6; h.y *= 1.1547; h.x += 0.5 * mod(floor(h.y), 2.0);
    vec2 f = abs(fract(h) - 0.5);
    float hex = smoothstep(0.035, 0.0, abs(max(f.x * 1.5 + f.y * 0.5, f.y) - 0.5) * 0.5);
    vec2 s = p * vec2(1.4, 2.0); s.x += 0.5 * mod(floor(s.y), 2.0);
    vec2 fs = abs(fract(s) - 0.5); float mortar = smoothstep(0.43, 0.48, max(fs.x * 0.92, fs.y));
    float stone = 0.85 + 0.3 * hash(floor(s));
    vec3 base = uLow * mix(1.0, stone, uFantasy) * 1.25;
    vec3 col = base + uTint * mix(hex * 0.045, 0.0, uFantasy) - base * mortar * 0.7 * uFantasy;
    col += uTint * 0.16 * exp(-r * r * 1.6);                         // glow pooled under the plate
    float a = 1.0 - smoothstep(1.4, 4.2, r);                          // fades into the dome
    gl_FragColor = vec4(col, a);
  }`;
function createBackdrop() {
  const uniforms = {
    uTint: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
    uFocus: { value: new THREE.Vector3(0, 1, 0) }, uSize: { value: 0.2 }, uFantasy: { value: 0 }, uPed: { value: 1 },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: BD_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }));
  dome.renderOrder = -2; dome.frustumCulled = false;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShaderMaterial({ uniforms, vertexShader: BD_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.121; floor.renderOrder = -1;
  const g = new THREE.Group(); g.add(dome, floor); g.name = 'tt-backdrop';
  return {
    group: g,
    // tint = plate colour; fantasy = stone / forest tones
    set({ tint, fantasy, focus, size, ped }) {
      const T = new THREE.Color(tint);
      if (fantasy) {
        uniforms.uTint.value.copy(T).lerp(new THREE.Color(0xd8b878), 0.6).multiplyScalar(0.75);   // torch-warm, faction-leaning
        uniforms.uTop.value.setRGB(0.03, 0.036, 0.028); uniforms.uLow.value.setRGB(0.03, 0.028, 0.024);   // mossy dusk / grey stone
      } else {
        uniforms.uTint.value.copy(T).lerp(new THREE.Color(0xffe0b0), 0.18);   // a little warm white keeps orange from going red at low light
        uniforms.uTop.value.copy(T).multiplyScalar(0.012).add(new THREE.Color(0.01, 0.014, 0.03)); uniforms.uLow.value.setRGB(0.008, 0.01, 0.018);
      }
      uniforms.uFantasy.value = fantasy ? 1 : 0;
      uniforms.uFocus.value.copy(focus); uniforms.uSize.value = size; uniforms.uPed.value = ped;
      floor.scale.setScalar(ped * 4.4);
    },
    dispose() { dome.geometry.dispose(); dome.material.dispose(); floor.geometry.dispose(); floor.material.dispose(); },
  };
}

// Scene object for the 3D profile view (engine.setScene(tt)). Drag with tt.rotate(dxPixels).
// view (optional): fitCamera options. Defaults suit scr_unit's portrait layout (zoom 0.6 + setViewOffset: subject in the top stage);
// view.offsetX shifts the subject sideways (frame-height units). view.backdrop (default true): built-in lit stage backdrop; false =
// the old plain clear colour. view.hoverMax (default 0.24 m): high hover units are lowered to this gap above the plate on the
// turntable only, and get a hover beam (the battle look is unchanged).
export function createTurntable(engine, unitOpts = {}, view = {}) {
  const scene = new THREE.Scene();
  scene.environment = engine?.env || null;
  scene.environmentIntensity = 0.85;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  let unit = null, lights = [], yaw = 0.5, spin = 0.35, idleFor = 0, pedestal = null, pedR = 1.2;
  const group = new THREE.Group(); scene.add(group);
  const backdrop = view.backdrop === false ? null : createBackdrop();
  if (backdrop) scene.add(backdrop.group);
  let beam = null, fit = null;

  function buildPedestal(color, R) {
    if (pedestal) { group.remove(pedestal); pedestal.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); }
    pedestal = new THREE.Group();
    // neutral dark pedestal (low metalness so it doesn't mirror the coloured env/rims) + the faction plate colour at a
    // brightness that survives tone mapping without hue-shifting (orange x3 went gold). Sized to the unit's footprint.
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.92, R, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.25, roughness: 0.55 }));
    top.position.y = -0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.025, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.35) }));
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.18), transparent: true, opacity: 0.8, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2; glowDisc.rotation.z = Math.PI / 6; glowDisc.position.y = 0.004;
    pedestal.add(glowDisc);
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 0.005;
    pedestal.add(top, ring);
    group.add(pedestal);
  }
  function frame() {
    // measure the idle pose (a few frames in, so bobbing hovers and fur settle), then fit unit + plate
    unit.play('idle');
    for (let i = 0; i < 12; i++) unit.update(1 / 30);
    group.rotation.y = 0; group.updateMatrixWorld(true);
    let bands = unitBands(unit);
    // hover units: lower the mesh (not the root, so aura ring / motes stay put) to a modest gap and add a beam under it
    const gap = unitBox(unit.mesh).min.y, hmax = view.hoverMax ?? 0.24;
    obj.hoverDrop = 0;
    if (unit.def.rig === 'hover' && gap > hmax + 0.04) {
      obj.hoverDrop = gap - hmax;
      unit.mesh.position.y = -obj.hoverDrop / (unit.body.scale.y || 1);
      group.updateMatrixWorld(true);
      bands = unitBands(unit);
    }
    const gapNow = gap - obj.hoverDrop;
    if (unit.def.rig === 'hover' && !unit.def.hoverBeam && gapNow > 0.12 && view.hoverBeam !== false) {
      beam = createHoverBeam(unit.palette.glow, { height: gapNow + 0.12, radius: Math.min(unit.radius * 0.6, 0.4) });
      unit.root.add(beam);
    }
    const ground = bands.filter((b) => b.y0 < 0.3).reduce((m, b) => Math.max(m, b.r), 0);
    pedR = Math.min(Math.max(unit.radius * 1.45, Math.min(ground * 1.08, unit.radius * 1.6), 0.7), 1.6);
    bands.push({ y0: -0.12, y1: 0, r: pedR });
    fit = fitCamera(camera, bands, { halfH: 0.29, halfW: 0.37, cy: -0.045, pitch: 0.1, margin: 1.03, ...view, cx: view.cx ?? view.offsetX ?? 0 });
    fit.bands = bands;
  }
  function disposeBeam() { if (beam) { beam.removeFromParent(); beam.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); beam = null; } }
  function setUnit(opts) {
    disposeBeam();
    if (unit) unit.dispose();
    for (const l of lights) scene.remove(l);
    unit = createUnit({ quality: engine?.quality?.name === 'low' ? 'med' : 'high', ...opts });
    lights = studio(scene, unit.palette, 0.9);
    group.add(unit.root);
    frame();
    const plateC = unit.rarity === 'legendary' || unit.faction === 'legendary' ? 0xffc23a : unit.palette.plate;
    buildPedestal(plateC, pedR);
    if (backdrop) {
      let y0 = 1e9, y1 = -1e9; for (const b of fit.bands) { y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); }
      const focus = new THREE.Vector3(fit.tX, (y0 + y1) / 2, 0);
      backdrop.set({ tint: plateC, fantasy: unit.realm === 'fantasy', focus, size: Math.atan((y1 - y0) / 2 / fit.D), ped: pedR });
    }
    unit.play('deploy');
    obj.unit = unit;
    return unit;
  }
  const obj = {
    scene, camera, unit: null, spinPaused: false,
    setUnit,
    play(name, o) { return unit?.play(name, o); },
    rotate(dx) { yaw += dx * 0.01; idleFor = 0; },
    update(dt) {
      idleFor = obj.spinPaused ? 0 : idleFor + dt;
      if (idleFor > 2) yaw += dt * spin;
      group.rotation.y = yaw;
      unit?.update(dt);
      if (beam) { const cu = beam.userData.cone.material.uniforms; cu.uTime.value += dt; cu.uLife.value = unit.state.dead ? 0 : 1; beam.visible = unit.body.position.y < 0.5; }
      if (unit && !unit.state.action && unit.state.loop !== 'idle') unit.play('idle');
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() { disposeBeam(); backdrop?.dispose(); unit?.dispose(); if (pedestal) pedestal.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); },
  };
  setUnit(unitOpts);
  return obj;
}
