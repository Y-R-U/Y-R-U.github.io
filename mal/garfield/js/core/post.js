import * as THREE from '../../vendor/three/three.module.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './quality.js';

// Evening grade folded into tone mapping (ACES, then warm split-tone + saturation + soft S-curve):
// costs nothing extra per tier because every material / OutputPass already runs the tone-map function.
const GRADE = /* glsl */`
vec3 CustomToneMapping( vec3 color ) {
  vec3 g = pow( max( ACESFilmicToneMapping( color ), 0.0 ), vec3( 1.0 / 2.2 ) );
  float l = dot( g, vec3( 0.299, 0.587, 0.114 ) );
  g = mix( vec3( l ), g, 1.03 );
  g = g * vec3( 1.03, 0.99, 0.925 ) + vec3( 0.022, 0.010, 0.0 ) * ( 1.0 - l );
  g = clamp( g, 0.0, 1.0 );
  g = mix( g, g * g * ( 3.0 - 2.0 * g ), 0.18 );
  return pow( g, vec3( 2.2 ) );
}`;
let graded = false;
function installGrade(renderer) {
  if (!graded) {
    graded = true;
    THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment
      .replace('vec3 CustomToneMapping( vec3 color ) { return color; }', GRADE);
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1.0;
}

// Static CSS vignette between the canvas and the UI: free on the GPU.
function installVignette(canvas) {
  if (!canvas?.parentNode || document.getElementById('vignette')) return;
  const v = document.createElement('div');
  v.id = 'vignette';
  v.style.cssText = 'position:fixed;inset:0;pointer-events:none;' +
    'background:radial-gradient(ellipse 75% 70% at 50% 46%, rgba(40,16,4,0) 50%, rgba(40,16,4,.2) 78%, rgba(30,10,2,.5) 100%)';
  canvas.after(v);
}

// Gentle bloom for lamps/windows. Low quality renders straight to the canvas.
export function createPost(R) {
  const { renderer } = R;
  if (new URLSearchParams(location.search).get('grade') !== '0') {
    installGrade(renderer);
    installVignette(renderer.domElement);
  }
  let composer = null, renderPass = null, bloom = null;
  let scene = null, camera = null;

  function build() {
    composer?.dispose?.();
    composer = null;
    const q = QUALITY[R.quality];
    if (!q.bloom) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    composer = new EffectComposer(renderer, rt);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    resize();
  }
  function resize() {
    if (!composer) return;
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(R.width, R.height);
    bloom.resolution.set(R.width / 2, R.height / 2);
  }
  R.onResize(() => resize());

  return {
    setScene(s, c) {
      const changed = !composer || scene !== s;
      scene = s; camera = c;
      if (changed) build();
      if (renderPass) { renderPass.scene = s; renderPass.camera = c; }
    },
    rebuild() { build(); },
    get bloom() { return bloom; },
    render() {
      if (!scene) return;
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
