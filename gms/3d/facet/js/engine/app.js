import * as THREE from 'three';
import { Stats } from './stats.js';
import { Quality } from './quality.js';
import { IsoCam } from './isocam.js';
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

    // Flat-shaded geometry is nothing but hard edges, so MSAA earns its cost here far more than
    // it does on a textured scene. It can only be asked for at context creation.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.rig = new IsoCam(this.renderer.domElement);
    this.camera = this.rig.camera;

    this.stats = new Stats(this.renderer, document.getElementById('perf'));
    const sm = this.renderer.shadowMap, smRender = sm.render.bind(sm);
    sm.render = (...a) => { smRender(...a); if (!this.marked) { this.marked = true; this.stats.markShadow(); } };

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
        this.scene.traverse(o => {
          if (o.isDirectionalLight) o.castShadow = v !== 'off' && o.userData.caster !== false;
          if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
        });
        this.renderer.shadowMap.needsUpdate = true;
      });

    q.register({ key: 'exposure', label: 'Exposure', type: 'range', min: 0.4, max: 2.0, step: 0.02, default: 0.82, group: 'Renderer' },
      v => { this.renderer.toneMappingExposure = v; });

    q.register({ key: 'tonemap', label: 'Tone map', type: 'select', options: ['aces', 'linear', 'none'], default: 'aces', group: 'Renderer' },
      v => {
        // ACES pulls saturation out of exactly the punchy mid-tones this style is built from.
        // Worth a knob, because which one wins depends on the palette.
        this.renderer.toneMapping = v === 'aces' ? THREE.ACESFilmicToneMapping
          : v === 'linear' ? THREE.LinearToneMapping : THREE.NoToneMapping;
        this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      });

    q.register({ key: 'vignette', label: 'Vignette', type: 'toggle', default: true, group: 'Renderer' },
      v => document.body.classList.toggle('novignette', !v));

    this.rig.registerKnobs(q, this);
  }

  add(system) {
    this.systems.push(system);
    if (system.object3D) this.scene.add(system.object3D);
    if (system.registerKnobs) system.registerKnobs(this.quality, this);
    return system;
  }

  resize() {
    const scale = this.quality.get('renderScale') ?? 1;
    const capped = Math.min(devicePixelRatio || 1, this.dprCap ?? 2);
    const w = this.mount.clientWidth || innerWidth;
    const h = this.mount.clientHeight || innerHeight;
    this.renderer.setPixelRatio(capped * scale);
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.camera = this.rig.camera;
  }

  start() {
    const bootFrames = 20;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.stats.beginFrame();
      this.renderer.info.reset();
      for (const s of this.systems) if (s.update) s.update(dt, this);
      this.marked = false;
      this.renderer.render(this.scene, this.camera);
      this.stats.endFrame(dt);
      this.frames = (this.frames || 0) + 1;
      if (this.frames === bootFrames) { this.bootMs = this.stats.frame.max; this.stats.reset(); }
    };
    loop();
  }

  // Consumed by tools/shot.mjs — must stay stable.
  expose() {
    window.__facet = {
      app: this,
      three: THREE,
      rig: this.rig,
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
