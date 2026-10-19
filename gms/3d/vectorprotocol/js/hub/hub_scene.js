// Landing page (D15): the merc company's compound on a megacity platform at night.
// createHubScene(engine, {companyLevel, unlocked, stage?, names?, subs?, badges?, highlight?, overlay?, squad?, riftOpen?}) -> scene object
//   squad: [{model, rarity, faction, rank}] (first 2-4 shown in the yard; default gunner + scrapper)
//   + on('select', id => ...), setState({...}), pick(x, y)
import * as THREE from 'three';
import { FEATURES, FEATURE_IDS, stageForLevel, hintsFromFeatures } from './features.js';
import { createMaterials } from './kit.js';
import { buildCompound, PLAT } from './compound.js';
import { createAmbient } from './ambient.js';
import { createLabels } from './labels.js';
import { createSquad } from './squad.js';
import { createFlagship } from './flagship.js';
import { createRift } from './rift.js';
import { createPlanarReflection, addPlanarReflection, REFLECT_LAYER } from '../fx/reflection.js';

function nightEnv(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x03050c);
  const strip = (color, w, h, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  strip(0x0c1838, 40, 10, 0, 12, 0, 0, Math.PI / 2);          // dim blue sky
  strip(0x30e0ff, 18, 0.6, 0, 3, -9);                           // cyan strip
  strip(0xff40c8, 0.6, 8, 9, 3, 0, Math.PI / 2);                // magenta
  strip(0x8060ff, 14, 0.5, -9, 5, 2, Math.PI / 2);
  strip(0xffa040, 6, 0.4, 3, 1.5, 9);                           // warm
  strip(0x1a2a50, 30, 6, 0, -0.5, 0, 0, Math.PI / 2);           // ground bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt;
}

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){ float y = vP.y;
        vec3 top = vec3(0.01,0.015,0.05), mid = vec3(0.06,0.05,0.2), hor = vec3(0.55,0.18,0.6), low = vec3(0.1,0.07,0.25);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.7, y)); c = mix(c, low, smoothstep(0.0, -0.25, y));
        c += vec3(0.15,0.55,0.9) * 0.45 * exp(-abs(y - 0.03) * 22.0);
        vec2 g = floor(vec2(atan(vP.z, vP.x) * 300.0, y * 300.0)); float s = step(0.997, h(g)) * smoothstep(0.1, 0.5, y);
        gl_FragColor = vec4(c + s * 0.8, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

export function createHubScene(engine, opts = {}) {
  const renderer = engine.renderer;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x24164a, 170, 560);
  const camera = new THREE.PerspectiveCamera(46, 0.5, 1, 2000);
  camera.layers.enable(REFLECT_LAYER);
  const reflScale = engine.quality?.reflect ?? 0.5;
  const mirror = reflScale > 0 ? createPlanarReflection(renderer, { scale: Math.min(0.5, reflScale) }) : null;
  // the hub camera only drifts, so a mirror refreshed every other frame is indistinguishable and halves its cost
  if (mirror) mirror.skip = 1;
  const listeners = { select: [] };
  const quality = engine.quality?.name || 'high';

  const envRT = nightEnv(renderer);
  const env = engine.env || envRT.texture;
  scene.add(skyDome());
  scene.add(new THREE.HemisphereLight(0x8a7cc8, 0x4a3434, 1.8));
  const moon = new THREE.DirectionalLight(0x9fb4ff, 1.6); moon.position.set(-40, 80, 30); scene.add(moon);
  const fill = new THREE.DirectionalLight(0xff60c0, 1.1); fill.position.set(50, 30, -40); scene.add(fill);
  const warm = new THREE.DirectionalLight(0xffa060, 2.6); warm.position.set(-30, 22, 60); scene.add(warm);
  const padLight = new THREE.PointLight(0xa070ff, 60, 30, 1.6); scene.add(padLight);
  const shopLight = new THREE.PointLight(0xff8a30, 70, 26, 1.6); scene.add(shopLight);

  let rift = null;
  function setRift(on) {
    if (on && !rift) { rift = createRift(); scene.add(rift); }
    if (rift) rift.visible = !!on;
  }
  setRift(opts.riftOpen);
  const mats = createMaterials(env);
  const state = {
    level: opts.companyLevel ?? 1,
    stage: opts.stage ?? stageForLevel(opts.companyLevel ?? 1),
    unlocked: new Set(opts.unlocked ?? ['story', 'squad']),
    names: opts.names || {}, subs: opts.subs || {}, hints: opts.hints || (opts.features ? hintsFromFeatures(opts.features) : {}), badges: opts.badges || {}, highlight: opts.highlight ?? null,
  };
  let compound = null, ambient = null, squad = null, flagship = null;
  let squadList = opts.squad ?? null;

  const overlayHost = opts.overlay || opts.container || renderer.domElement.parentElement || document.body;
  const labels = createLabels(overlayHost, FEATURES, { onSelect: (id) => emitSelect(id), margins: opts.margins });


  function emitSelect(id) {
    if (!state.unlocked.has(id)) { labels.hot(null); flashLocked(id); return; }
    labels.hot(id); setTimeout(() => labels.hot(null), 250);
    for (const fn of listeners.select) fn(id);
  }
  function flashLocked(id) {
    const it = labels.items.find((i) => i.f.id === id);
    if (!it) return;
    it.el.animate([{ transform: it.el.style.transform + ' translateX(0)' }, { transform: it.el.style.transform + ' translateX(-4px)' }, { transform: it.el.style.transform + ' translateX(4px)' }, { transform: it.el.style.transform }], { duration: 260 });
    for (const fn of listeners.locked || []) fn(id);
  }

  function applyLocks() {
    for (const [id, f] of Object.entries(compound.features)) {
      const locked = !state.unlocked.has(id);
      f.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.matKey) o.material = (locked ? mats.locked : mats.normal)[o.userData.matKey] || o.material;
        if (o.userData.holo !== undefined) o.material.opacity = locked ? o.userData.holo * 0.3 : o.userData.holo;
      });
    }
    labels.render(state);
  }

  function build() {
    if (compound) { scene.remove(compound.root); compound.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); const gm = compound.ground.material; gm.map?.dispose(); gm.emissiveMap?.dispose(); gm.dispose(); }
    ambient?.dispose(); squad?.dispose(); squad = null; flagship?.dispose();
    compound = buildCompound({ stage: state.stage, mats, env, liveBays: true });
    compound.env = env;
    scene.add(compound.root);
    ambient = createAmbient(scene, compound, { stage: state.stage, quality, mats: mats.normal });
    flagship = createFlagship(scene, compound, { stage: state.stage });
    if (mirror) {
      addPlanarReflection(compound.ground.material, mirror, { strength: 0.6, base: 0.18, blur: 2.2, distort: 0.03 });
      const reflect = (o) => o.traverse((c) => { if (!c.userData.noReflect) c.layers.enable(REFLECT_LAYER); });
      // features: only the merged building shells + the big signs go into the mirror; the small moving dyn parts
      // (dishes, rotors, rings, holo tables) are invisible in a blurred floor and cost ~40 draw calls there
      for (const f of Object.values(compound.features)) for (const c of f.group.children) if (c.isMesh && (c.material.isMeshStandardMaterial || c.userData.reflect) && !c.userData.noReflect) c.layers.enable(REFLECT_LAYER);
      reflect(compound.skyline); reflect(ambient.group); ambient.noReflect?.forEach((o) => o.layers.disable(REFLECT_LAYER));
      reflect(flagship.group); flagship.noReflect.forEach((o) => o.layers.disable(REFLECT_LAYER));
    }
    squad = createSquad(scene, compound, { squad: squadList, stage: state.stage, quality, env });
    padLight.position.copy(compound.features.recruit.anchor).setY(4);
    shopLight.position.copy(compound.features.workshop.anchor).setY(3).add(new THREE.Vector3(6, 0, 0));
    applyLocks();
  }
  build();
  // unlock hints from the design data unless the caller passed them
  if (!opts.hints && !opts.features) import('../data/maps.js').then((m) => { if (m.FEATURE_UNLOCKS) { state.hints = hintsFromFeatures(m.FEATURE_UNLOCKS); labels.render(state); } }).catch(() => {});

  // ---- camera: framed to the platform width, slow drift, one-finger pan with momentum + soft clamp
  const cam = { W: 1, H: 1, dist: 150, pitch: 0.74, shift: 0.08, yaw: 0, pan: new THREE.Vector2(), vel: new THREE.Vector2(), drag: null, half: 27, depthHalf: 54, tz: 2, k: 1, fx: 0,
    wide: false, pitchWide: null, nearCrop: 0, maxFrac: 0.55, offX: 0, offY: 0, ...(opts.cam || {}) };
  const pitchTall = cam.pitch;
  const target = new THREE.Vector3(0, 0, -10);
  // HUD chrome to keep clear (CSS px). Portrait callers pass {top, bottom, side}; landscape callers {top, bottom, left, right, avoid}.
  let margins = { ...(opts.margins || {}) };
  const WIDE_DEF = { top: 52, bottom: 16, left: 84, right: 12 };
  const wideM = () => {
    const m = 'left' in margins || 'right' in margins ? margins : { ...margins, ...WIDE_DEF };
    return { top: m.top ?? WIDE_DEF.top, bottom: m.bottom ?? WIDE_DEF.bottom, left: m.left ?? 0, right: m.right ?? 0 };
  };
  function frame() {
    const a = cam.W / cam.H, half = cam.half;
    cam.wide = a >= 1;
    if (cam.wide) { fitWide(); return; }
    cam.pitch = pitchTall;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // fit by aspect: the platform width must fit horizontally AND its oblique depth vertically (wide/landscape frames
    // are depth-limited, tall portrait ones width-limited)
    const fitW = half / (t * a), fitH = cam.depthHalf / t;
    cam.dist = THREE.MathUtils.clamp(Math.max(fitW, fitH), 95, 185) * (1 + state.stage * 0.04) * cam.k;
    target.set(cam.fx, 0, cam.tz - (a > 0.6 ? 2 : 0));
  }
  // landscape: a lower aerial view; the distance is searched so the compound (near slab edge .. tallest anchor + its label)
  // fills the free band between the chrome, then a lens shift centres it in the band on both axes
  const fitPts = [], fv = new THREE.Vector3();
  function fitWide() {
    const W = cam.W, H = cam.H, m = wideM();
    // lower aerial view the wider the frame: 0.5 rad on phones (>= 2:1), 0.66 on tablets / 16:10 (<= 1.45:1)
    cam.pitch = cam.pitchWide ?? 0.66 - 0.16 * THREE.MathUtils.clamp((W / H - 1.45) / 0.55, 0, 1);
    target.set(cam.fx, 0, cam.tz - 2);
    fitPts.length = 0;
    for (const x of [PLAT.x0, PLAT.x1]) for (const z of [PLAT.z0, PLAT.z1 - cam.nearCrop]) fitPts.push([x, 0, z, 0]);
    // anchors carry the label above them: reserve ~34 px for it
    for (const f of Object.values(compound.features)) fitPts.push([f.anchor.x, f.anchor.y, f.anchor.z, 34]);
    camera.clearViewOffset(); camera.aspect = W / H; camera.updateProjectionMatrix();
    const bounds = (d) => {
      camera.position.set(target.x, Math.sin(cam.pitch) * d, target.z + Math.cos(cam.pitch) * d);
      camera.lookAt(target); camera.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y, z, lab] of fitPts) {
        fv.set(x, y, z).project(camera);
        const px = (fv.x * 0.5 + 0.5) * W, py = (-fv.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py - lab); y1 = Math.max(y1, py);
      }
      return { x0, x1, y0, y1 };
    };
    // breathing (+-1.5% dist) and the drift wobble need a little slack
    // the slab never takes more than maxFrac of the width, so the flank skyline still frames it on tablets/desktops
    const availH = (H - m.top - m.bottom) * 0.95, availW = Math.min((W - m.left - m.right) * 0.97, W * cam.maxFrac);
    let lo = 30, hi = 600;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2, b = bounds(d);
      if (b.y1 - b.y0 > availH || b.x1 - b.x0 > availW) lo = d; else hi = d;
    }
    cam.dist = hi * cam.k;
    const b = bounds(cam.dist);
    cam.offX = (b.x0 + b.x1) / 2 - (m.left + W - m.right) / 2;
    cam.offY = (b.y0 + b.y1) / 2 - (m.top + H - m.bottom) / 2;
    camera.setViewOffset(W, H, cam.offX, cam.offY, W, H); camera.updateProjectionMatrix();
  }
  const PAN = { x: 9, z: 16 }, PAN_X = { tall: 9, wide: 14 };
  const dom = renderer.domElement;
  const ptr = { id: null, x0: 0, y0: 0, x: 0, y: 0, moved: 0, t0: 0 };
  function onDown(e) { if (ptr.id !== null) return; ptr.id = e.pointerId; ptr.x0 = ptr.x = e.clientX; ptr.y0 = ptr.y = e.clientY; ptr.moved = 0; ptr.t0 = performance.now(); cam.vel.set(0, 0); }
  function onMove(e) {
    if (e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.moved < 8) return;
    const k = cam.dist / cam.H * 0.9;
    cam.pan.x -= dx * k; cam.pan.y -= dy * k * 1.25;
    cam.vel.set(-dx * k * 60, -dy * k * 1.25 * 60);
  }
  function onUp(e) {
    if (e.pointerId !== ptr.id) return;
    ptr.id = null;
    if (ptr.moved < 8 && performance.now() - ptr.t0 < 600) {
      const rect = dom.getBoundingClientRect();
      const id = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (id) emitSelect(id);
    }
  }
  dom.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  dom.style.touchAction = 'none';

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  function pick(x, y) {
    ndc.set(x / cam.W * 2 - 1, -(y / cam.H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null, bd = Infinity;
    for (const [id, f] of Object.entries(compound.features)) {
      if (ray.ray.intersectBox(f.box, hit)) { const d = hit.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = id; } }
    }
    return best;
  }

  const anchors = {};
  let time = 0, frames = 0;
  const so = {
    scene, camera, look: { strength: 0.65, radius: 0.5, threshold: 0.8, vignette: 0.38, sat: 1.15, contrast: 1.08 },
    update(dt, t) {
      time += dt; frames++;
      if (ptr.id === null) {
        cam.pan.addScaledVector(cam.vel, dt); cam.vel.multiplyScalar(Math.pow(0.04, dt));
        // soft clamp: spring back past the limits
        const ox = cam.pan.x - THREE.MathUtils.clamp(cam.pan.x, -PAN.x, PAN.x), oz = cam.pan.y - THREE.MathUtils.clamp(cam.pan.y, -PAN.z, PAN.z);
        cam.pan.x -= ox * Math.min(1, dt * 6); cam.pan.y -= oz * Math.min(1, dt * 6);
      } else {
        cam.pan.x = THREE.MathUtils.clamp(cam.pan.x, -PAN.x * 1.25, PAN.x * 1.25); cam.pan.y = THREE.MathUtils.clamp(cam.pan.y, -PAN.z * 1.25, PAN.z * 1.25);
      }
      const yaw = Math.sin(time * 0.05) * 0.07, pitch = cam.pitch + Math.sin(time * 0.037) * 0.02;
      const d = cam.dist * (1 + Math.sin(time * 0.043) * 0.015);
      const tx = target.x + cam.pan.x + Math.sin(time * 0.031) * 1.2, tz = target.z + cam.pan.y;
      camera.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, tz + Math.cos(yaw) * Math.cos(pitch) * d);
      camera.lookAt(tx, 0, tz);
      camera.updateMatrixWorld();
      for (const f of Object.values(compound.features)) f.update?.(time, dt);
      const pxScale = cam.H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      ambient.update(time, dt, camera, pxScale);
      squad?.update(time, dt);
      flagship?.update(time, dt, pxScale);
      if (rift?.visible) { rift.userData.update(time); rift.userData.place(camera); }
      for (const [id, f] of Object.entries(compound.features)) anchors[id] = f.anchor;
      labels.update(camera, anchors, cam.W, cam.H);
    },
    preRender() { mirror?.update(scene, camera); },
    resize(w, h) {
      if (mirror) { const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); mirror.setSize(sz.x, sz.y); }
      const wasWide = cam.wide;
      cam.W = w; cam.H = h; camera.aspect = w / h;
      // lens shift: keep the oblique view of the compound but raise the frame so the skyline + sky glow fill the top
      camera.setViewOffset(w, h, 0, -cam.shift * h, w, h); camera.updateProjectionMatrix(); frame();
      PAN.x = cam.wide ? PAN_X.wide : PAN_X.tall;
      if (wasWide !== cam.wide) { cam.vel.set(0, 0); ptr.id = null; }
      labels.setMargins?.(cam.wide ? { ...wideM(), avoid: margins.avoid || [], wide: true } : { ...margins, wide: false });
      labels.render(state);
    },
    // HUD chrome changed (rotation, dock/CTA moved): re-fit the camera and the labels, no rebuild
    setMargins(m = {}) {
      margins = { ...m };
      if (cam.W > 1) so.resize(cam.W, cam.H);
    },
    pick,
    debug: { cam, target, frame, get margins() { return margins; } },
    on(evt, fn) { (listeners[evt] ||= []).push(fn); return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); }; },
    setState(next = {}) {
      let rebuild = false;
      if (next.companyLevel !== undefined) { state.level = next.companyLevel; const s = next.stage ?? stageForLevel(state.level); if (s !== state.stage) { state.stage = s; rebuild = true; } }
      else if (next.stage !== undefined && next.stage !== state.stage) { state.stage = next.stage; rebuild = true; }
      if ('riftOpen' in next) setRift(next.riftOpen);
      if (next.unlocked) state.unlocked = new Set(next.unlocked);
      for (const k of ['names', 'subs', 'badges', 'hints']) if (next[k]) state[k] = next[k];
      if (next.features) state.hints = hintsFromFeatures(next.features);
      if ('highlight' in next) state.highlight = next.highlight;
      if (rebuild) { if (next.squad) squadList = next.squad; build(); if (cam.wide) so.resize(cam.W, cam.H); else frame(); }
      else {
        if (next.squad) { squadList = next.squad; squad?.dispose(); squad = createSquad(scene, compound, { squad: squadList, stage: state.stage, quality, env }); }
        applyLocks();
      }
    },
    get state() { return { ...state, unlocked: [...state.unlocked] }; },
    stats() { return { stage: state.stage, frames, squad: squad?.count || 0, drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
    dispose() {
      dom.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
      labels.dispose(); ambient?.dispose(); squad?.dispose(); squad = null; flagship?.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); });
      for (const set of [mats.normal, mats.locked]) for (const m of Object.values(set)) m.dispose();
      envRT.dispose(); if (rift) { rift.geometry.dispose(); rift.material.dispose(); }
    },
  };
  void FEATURE_IDS;
  return so;
}
export { FEATURES, stageForLevel };
