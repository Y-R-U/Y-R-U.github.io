// Optional post chain. The scene renders straight to screen unless something here is enabled,
// so the no-post path stays exactly as cheap as it was. When it is enabled it also carries the
// aa knob's settings, so the two never fight over app.renderPath.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { outputSpaceTarget } from './aa.js';
import { track, untrack } from './budget.js';

export class Post {
  constructor(app) {
    this.app = app;
    this.composer = null;
    this.gtao = null;
    this.enabled = false;
    this.samples = 0;
    this.tracked = [];
    this.depthKey = {};
    this.gtaoDepthKey = {};
  }

  registerKnobs(q) {
    q.register({ key: 'ao', label: 'Ambient occlusion', type: 'select', options: ['off', 'half', 'full'], default: 'off', group: 'Renderer' },
      v => this.setAO(v));
    q.register({ key: 'aoRadius', label: 'AO radius', type: 'range', min: 0.1, max: 3, step: 0.05, default: 0.6, group: 'Renderer' },
      v => { if (this.gtao) this.gtao.updateGtaoMaterial({ radius: v }); });
    q.register({ key: 'aoStrength', label: 'AO strength', type: 'range', min: 0, max: 3, step: 0.05, default: 1.1, group: 'Renderer' },
      v => { if (this.gtao) this.gtao.blendIntensity = v; });
  }

  build() {
    const { renderer, scene, camera, aa } = this.app;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.samples = aa.samples;
    // Same output-space target the aa path uses, so turning AO on does not also move the fog.
    // That leaves no OutputPass in the chain: the pixels are already tone-mapped and encoded.
    const rt = outputSpaceTarget(size.x, size.y, this.samples);
    this.composer = new EffectComposer(renderer, rt);
    this.composer.renderTarget2.isXRRenderTarget = true;
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.composer.addPass(this.gtao);
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    this.fxaa.enabled = aa.wantsFXAA;
    this.composer.addPass(this.fxaa);
  }

  // Five full-resolution targets plus their depth attachments. Untracked, enabling AO made the
  // memory readout fall — the aa target it replaces is freed — while real memory climbed.
  account() {
    this.release();
    if (!this.composer) return;
    const n = this.samples ? this.samples + 1 : 1;
    const keep = (key, o) => { track(key, { mips: false, ...o }); this.tracked.push(key); };

    const c = this.composer.renderTarget1;
    for (const rt of [c, this.composer.renderTarget2]) {
      keep(rt.texture, { w: rt.width, h: rt.height, mult: n, label: `post composer ${this.samples ? 'msaa' + this.samples : '1×'}` });
    }
    keep(this.depthKey, { w: c.width, h: c.height, mult: 2 * (this.samples || 1), label: 'post composer depth' });

    const g = this.gtao;
    if (!g) return;
    // GTAO's three buffers are RGBA half-float — 8 bytes a pixel, so mult 2 over rgba.
    for (const [rt, label] of [[g.gtaoRenderTarget, 'ao'], [g.pdRenderTarget, 'denoise'], [g.normalRenderTarget, 'normal']]) {
      if (rt) keep(rt.texture, { w: rt.width, h: rt.height, mult: 2, label: `post gtao ${label}` });
    }
    const d = g.normalRenderTarget;
    if (d) keep(this.gtaoDepthKey, { w: d.width, h: d.height, label: 'post gtao depth' });
  }

  release() {
    for (const k of this.tracked) untrack(k);
    this.tracked.length = 0;
  }

  dispose() {
    this.release();
    if (!this.composer) return;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    for (const p of this.composer.passes) p.dispose?.();
    this.composer = null;
    this.gtao = null;
  }

  // Called by the aa knob. Sample count is baked into the composer's targets, so it rebuilds.
  setAA(samples, fxaa) {
    if (!this.composer) return;
    if (samples !== this.samples) { this.dispose(); this.setAO(this.app.quality.get('ao')); return; }
    this.fxaa.enabled = fxaa;
  }

  setAO(mode) {
    this.enabled = mode !== 'off';
    if (this.enabled) {
      if (!this.composer) this.build();
      const q = this.app.quality;
      this.gtao.blendIntensity = q.get('aoStrength') ?? 1.1;
      this.gtao.updateGtaoMaterial({ radius: q.get('aoRadius') ?? 0.6, distanceExponent: 1, thickness: 1, scale: 1 });
      // GTAO renders the scene into its normal buffer whatever that buffer's size, so "half"
      // halves the fill and not the geometry — still the bulk of the cost on a phone.
      this.gtao.setSize(...this.bufferSize(mode));
      this.account();
    } else {
      this.dispose();
    }
    this.app.aa.apply();
  }

  bufferSize(mode) {
    const s = this.app.renderer.getDrawingBufferSize(new THREE.Vector2());
    const f = mode === 'half' ? 0.5 : 1;
    return [Math.round(s.x * f), Math.round(s.y * f)];
  }

  resize() {
    if (!this.composer) return;
    const s = this.app.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(s.x, s.y);
    this.fxaa.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
    if (this.gtao) this.gtao.setSize(...this.bufferSize(this.app.quality.get('ao')));
    this.account();
  }
}
