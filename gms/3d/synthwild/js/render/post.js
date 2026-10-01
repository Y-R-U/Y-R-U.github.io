// Optional bloom on high quality only. Everything else renders straight to the canvas.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createPost(ctx) {
  const { THREE, renderer, scene, camera } = ctx;
  let composer = null, bloom = null;
  const build = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };
  return {
    enabled: false,
    get composer() { return composer; },
    get bloom() { return bloom; },
    setEnabled(on) {
      this.enabled = !!on;
      if (on && !composer) build();
    },
    setSize(w, h) {
      if (!composer) return;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    render() {
      const n = ctx.sky.uniforms.uNight.value;
      bloom.strength = 0.18 + n * 0.45;
      bloom.threshold = 0.97 - n * 0.3;
      composer.render();
    },
  };
}
