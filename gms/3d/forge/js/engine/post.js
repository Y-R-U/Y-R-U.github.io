// Optional post chain. The scene renders straight to screen unless something here is enabled,
// so the no-post path stays exactly as cheap as it was.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Post {
  constructor(app) {
    this.app = app;
    this.composer = null;
    this.gtao = null;
    this.enabled = false;
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
    const { renderer, scene, camera } = this.app;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());
  }

  setAO(mode) {
    this.enabled = mode !== 'off';
    if (!this.enabled) { this.app.renderPath = null; return; }
    if (!this.composer) this.build();

    const q = this.app.quality;
    this.gtao.blendIntensity = q.get('aoStrength') ?? 1.1;
    this.gtao.updateGtaoMaterial({ radius: q.get('aoRadius') ?? 0.6, distanceExponent: 1, thickness: 1, scale: 1 });
    // GTAO renders its depth/normal prepass at full res regardless, so "half" only halves the
    // AO buffer itself — still the bulk of the cost on a phone.
    this.gtao.setSize(...this.bufferSize(mode));
    this.app.renderPath = () => this.composer.render();
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
    if (this.gtao) this.gtao.setSize(...this.bufferSize(this.app.quality.get('ao')));
  }
}
