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
    this.quality = new Quality(pickDefaultPreset());

    // `antialias` can only be set when the context is created, so the aa knob reloads the page for
    // this one option and every other mode runs off a render target instead.
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
    // A post chain renders several passes per frame; autoReset would leave the readout showing
    // only the last fullscreen quad.
    this.renderer.info.autoReset = false;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.camera.position.set(18, 9, 26);
    this.camera.lookAt(0, 3, 0);

    this.stats = new Stats(this.renderer, document.getElementById('perf'));
    // three offers no hook between the shadow pass and the main one, and info.render sums both.
    // First call only: a fullscreen AA/post quad is its own renderer.render() and runs the shadow
    // pass again, which would push the mark past the whole main pass.
    const sm = this.renderer.shadowMap, smRender = sm.render.bind(sm);
    sm.render = (...a) => { smRender(...a); if (!this.marked) { this.marked = true; this.stats.markShadow(); } };

    this.aa = new AA(this);

    this.registerCoreKnobs();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  registerCoreKnobs() {
    const q = this.quality;

    q.register({ key: 'renderScale', label: 'Render scale', type: 'range', min: 0.5, max: 1.5, step: 0.05, group: 'Renderer' },
      () => this.resize());

    q.register({ key: 'shadows', label: 'Shadows', type: 'select', options: ['off', 'hard', 'soft', 'softhigh'], group: 'Renderer' },
      v => {
        this.renderer.shadowMap.enabled = v !== 'off';
        this.renderer.shadowMap.type = SHADOW_TYPE[v] || THREE.PCFShadowMap;
        // The shadow type is a #define, so every program has to be rebuilt. Without this the three
        // soft modes were indistinguishable after boot and only `off` did anything.
        this.scene.traverse(o => {
          // directional only: every PointLight has a .shadow, and switching 18 window lights to
          // cube shadows is 2185 draw calls
          if (o.isDirectionalLight) o.castShadow = v !== 'off';
          if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
        });
        this.renderer.shadowMap.needsUpdate = true;
      });

    q.register({ key: 'exposure', label: 'Exposure', type: 'range', min: 0.4, max: 2.0, step: 0.02, default: 1.0, group: 'Renderer' },
      v => { this.renderer.toneMappingExposure = v; });

    this.aa.registerKnobs(q);
  }

  add(system) {
    this.systems.push(system);
    if (system.object3D) this.scene.add(system.object3D);
    if (system.registerKnobs) system.registerKnobs(this.quality, this);
    // the knob applied before this system's materials existed
    this.aa.syncMaterials();
    return system;
  }

  resize() {
    const scale = this.quality.get('renderScale') ?? 1;
    const capped = Math.min(devicePixelRatio || 1, this.dprCap ?? 2);
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
      // after the updates, so a PMREM refresh's internal renders don't claim the mark
      this.marked = false;
      if (this.renderPath) this.renderPath(); else this.renderer.render(this.scene, this.camera);
      this.stats.endFrame(dt);
      this.frames = (this.frames || 0) + 1;
      if (this.frames === bootFrames) { this.bootMs = this.stats.frame.max; this.stats.reset(); }
    };
    loop();
  }

  // Consumed by tools/shot.mjs — must stay stable.
  expose() {
    window.__forge = {
      app: this,
      three: THREE,
      stats: () => ({ ...this.stats.read(), texMB: totalMB() }),
      texBreakdown: breakdown,
      quality: this.quality,
      setPreset: n => this.quality.usePreset(n),
      setDprCap: n => { this.dprCap = n; this.resize(); },
      frames: () => this.frames || 0,
      ready: false,
    };
    this.stats.texMB = 0;
    setInterval(() => { this.stats.texMB = totalMB(); }, 500);
  }
}

function pickDefaultPreset() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth < 820;
  return mobile ? 'medium' : 'high';
}
