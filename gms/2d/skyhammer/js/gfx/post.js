// Bloom, behind the settings' "reduce effects" toggle. The game must look correct with it OFF —
// so nothing depends on bloom for readability; it only adds glow to fire, tracers and the rim.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function makePost(renderer, scene, camera) {
  let composer = null, bloom = null, on = false, W = 1, H = 1;

  function build() {
    if (composer) composer.dispose();
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 0.75);
    composer.addPass(bloom);
    composer.setSize(W, H);
  }

  return {
    setEnabled(v) {
      on = !!v;
      if (on && !composer) build();
    },
    enabled() { return on && !!composer; },
    setPalette(p) {
      if (!bloom) return;
      bloom.strength = p.post.bloomK;
      bloom.threshold = p.post.bloomThreshold;
      bloom.radius = 0.55;
    },
    resize(w, h) {
      W = w; H = h;
      if (composer) composer.setSize(w, h);
    },
    render() { composer.render(); },
    dispose() { if (composer) composer.dispose(); composer = null; bloom = null; },
  };
}
