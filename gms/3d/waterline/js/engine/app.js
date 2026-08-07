import * as THREE from 'three';
import { Stats } from './stats.js';
import { Quality } from './quality.js';
import { AA, wantsNativeAA } from './aa.js';
import { totalMB, breakdown } from './budget.js';

const SHADOW_TYPE = {
  hard: THREE.BasicShadowMap,
  soft: THREE.PCFShadowMap,
  softhigh: THREE.PCFSoftShadowMap,
};

export class App {
  constructor(mount) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.systems = [];
    this.frames = 0;
    this.pending = new Set();
    this.parked = new Set();
    this.restorers = new Set();
    this.contextLost = false;
    this.quality = new Quality(pickDefaultPreset());

    // `antialias` is a context-creation flag, so the aa knob reloads the page for this one option
    // and every other mode runs off a render target instead.
    this.nativeAA = wantsNativeAA();
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.nativeAA,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    // A post chain would render several passes per frame; autoReset leaves the readout showing
    // only the last one.
    this.renderer.info.autoReset = false;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 8000);
    this.camera.position.set(24, 12, 34);
    this.camera.lookAt(0, 2, 0);

    this.stats = new Stats(this.renderer, document.getElementById('perf'));
    // three offers no hook between the shadow pass and the main one, and info.render sums both.
    // First call only: a fullscreen post quad is its own renderer.render() and reruns the shadow
    // pass, which would push the mark past the whole main pass.
    const sm = this.renderer.shadowMap, smRender = sm.render.bind(sm);
    sm.render = (...a) => { smRender(...a); if (!this.marked) { this.marked = true; this.stats.markShadow(); } };

    this.aa = new AA(this);

    this.registerCoreKnobs();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    // A backgrounded tab on a phone loses the GL context and gets it back empty. three re-uploads
    // anything whose pixels still exist in JS; nothing that lived in a render target survives, and
    // the sky's PMREM env map is exactly that — its absence is what makes the scene come back dark.
    // three's own listeners are already on this canvas and already preventDefault; ours were added
    // second, so `restored()` runs after initGLContext() has rebuilt the renderer's internals.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => this.restored());
  }

  // Anything holding a GPU resource three cannot rebuild for it registers here.
  onRestore(fn) { this.restorers.add(fn); return () => this.restorers.delete(fn); }

  restored() {
    this.contextLost = false;
    // initGLContext() builds a NEW WebGLShadowMap, so the hook that splits the shadow pass from
    // the main one is gone with the old object and the readout would merge the two passes.
    const sm = this.renderer.shadowMap, smRender = sm.render.bind(sm);
    sm.render = (...a) => { smRender(...a); if (!this.marked) { this.marked = true; this.stats.markShadow(); } };
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.needsUpdate = true;
    // The timer-query extension object and every query in flight belonged to the dead context;
    // a stale query never reports available and the drain loop then wedges.
    this.stats.ext = this.stats.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.stats.pending.length = 0;
    this.stats.activeQuery = null;
    this.stats.reset();
    this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    this.resize();
    for (const fn of this.restorers) {
      try { fn(this); } catch (e) { console.warn('[waterline] context restore', e); }
    }
  }

  registerCoreKnobs() {
    const q = this.quality;

    q.register({ key: 'renderScale', label: 'Render scale', type: 'range', min: 0.4, max: 1.5, step: 0.05, group: 'Renderer' },
      () => this.resize());

    q.register({ key: 'dprCap', label: 'Max pixel ratio', type: 'range', min: 1, max: 3, step: 0.5, group: 'Renderer' },
      () => this.resize());

    q.register({ key: 'shadows', label: 'Shadows', type: 'select', options: ['off', 'hard', 'soft', 'softhigh'], group: 'Renderer' },
      v => {
        this.renderer.shadowMap.enabled = v !== 'off';
        // ?? not ||: THREE.BasicShadowMap is 0, so `|| PCFShadowMap` silently turned every
        // 'hard' into 'soft' and the cheapest shadow tier never existed.
        this.renderer.shadowMap.type = SHADOW_TYPE[v] ?? THREE.PCFShadowMap;
        // The shadow type is a #define, so every program has to be rebuilt or the soft modes are
        // indistinguishable after boot and only `off` does anything.
        this.scene.traverse(o => {
          // directional only: every PointLight has a .shadow, and cube shadows on a dozen deck
          // lights costs hundreds of draw calls
          if (o.isDirectionalLight) o.castShadow = v !== 'off';
          if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
        });
        this.renderer.shadowMap.needsUpdate = true;
      });

    q.register({ key: 'exposure', label: 'Exposure', type: 'range', min: 0.4, max: 2.0, step: 0.02, default: 1.0, group: 'Renderer' },
      v => { this.renderer.toneMappingExposure = v; });

    this.aa.registerKnobs(q);
  }

  // A system is any object with some of {object3D, update(dt, app), registerKnobs(quality, app)}.
  add(system) {
    this.systems.push(system);
    if (system.object3D) this.scene.add(system.object3D);
    if (system.registerKnobs) system.registerKnobs(this.quality, this);
    // the a2c knob applied before this system's materials existed
    this.aa.syncMaterials();
    return system;
  }

  // Hold `ready` until this settles. Anything the first frame must not be missing — a GLTF, a
  // font, a baked texture — goes through here or the harness screenshots a half-built scene.
  loading(p) {
    this.pending.add(p);
    Promise.resolve(p).catch(() => {}).then(() => this.pending.delete(p));
    return p;
  }

  resize() {
    const scale = this.quality.get('renderScale') ?? 1;
    const cap = this.dprCap ?? this.quality.get('dprCap') ?? 2;
    const capped = Math.min(devicePixelRatio || 1, cap);
    const w = this.mount.clientWidth || innerWidth;
    const h = this.mount.clientHeight || innerHeight;
    this.renderer.setPixelRatio(capped * scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aa?.resize();
    this.post?.resize();
  }

  start() {
    const bootFrames = 20;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.stats.beginFrame();
      this.renderer.info.reset();
      for (const s of this.systems) if (s.update) s.update(dt, this);
      this.parkEmpty();
      // after the updates, so a PMREM refresh's internal renders don't claim the mark
      this.marked = false;
      if (this.renderPath) this.renderPath(); else this.renderer.render(this.scene, this.camera);
      this.stats.endFrame(dt);
      this.frames++;
      if (this.frames === bootFrames) { this.bootMs = this.stats.frame.max; this.stats.reset(); }
      if (!this.hook.ready && this.frames >= 2 && !this.pending.size) this.hook.ready = true;
    };
    loop();
  }

  // An InstancedMesh at count 0 still costs a full draw call. The table's overlays and the fleet's
  // plumes spend most of a match empty, so hide them — and only ever un-hide what we hid, or this
  // would fight anything that sets `visible` for its own reasons.
  parkEmpty() {
    for (const o of this.parked) if (o.count > 0) { o.visible = true; this.parked.delete(o); }
    this.scene.traverse(o => {
      if (o.isInstancedMesh && o.count === 0 && o.visible) { o.visible = false; this.parked.add(o); }
    });
  }

  // The test-hook surface. tools/shot.mjs and every future harness depend on these staying put:
  // `ready`, `frames()`, `stats()`, `scenarios`, `app`. Extend it by ASSIGNING new properties
  // (window.__waterline.fleet = …) from your own module — never rename or remove what is here.
  expose() {
    this.hook = window.__waterline = {
      app: this,
      three: THREE,
      stats: () => ({ ...this.stats.read(), texMB: totalMB() }),
      texBreakdown: breakdown,
      quality: this.quality,
      setPreset: n => this.quality.usePreset(n),
      setDprCap: n => { this.dprCap = n; this.resize(); },
      frames: () => this.frames,
      scenarios: [],
      ready: false,
    };
    setInterval(() => { this.stats.texMB = totalMB(); }, 500);
    return this.hook;
  }
}

function pickDefaultPreset() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth < 820;
  return mobile ? 'medium' : 'high';
}
