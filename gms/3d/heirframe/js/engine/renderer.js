import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function createRenderer(canvas, tier, toneMapping = 'aces') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(tier.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = tier.shadowMap > 0;
  renderer.shadowMap.type = tier.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}

// UnrealBloom minus its last step: the full-res additive blend back into the (multisampled) scene target is folded
// into the grade pass, which saves a full-screen MSAA reload/store and a second resolve every frame. `div` = 2 is stock.
class BloomLite extends UnrealBloomPass {
  constructor(res, strength, radius, threshold, div = 2) {
    super(res.clone().multiplyScalar(2 / div), strength, radius, threshold);
    this.div = div; this.needsSwap = false;
  }
  setSize(w, h) { super.setSize(Math.max(2, w * 2 / this.div), Math.max(2, h * 2 / this.div)); }
  get output() { return this.renderTargetsHorizontal[0].texture; }
  render(renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._oldClearColor);
    this._oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    const q = this._fsQuad;
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    q.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright); renderer.clear(); q.render(renderer);
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i];
      q.material = m;
      m.uniforms.colorTexture.value = input.texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]); renderer.clear(); q.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]); renderer.clear(); q.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    q.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]); renderer.clear(); q.render(renderer);
    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}

const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null }, tBloom: { value: null }, uBloomOn: { value: 0 }, toneMappingExposure: { value: 1 },
    uVignette: { value: 0.34 }, uSat: { value: 1.16 }, uContrast: { value: 1.14 },
    uLift: { value: new THREE.Vector3(0.01, 0.006, 0.0) }, uGain: { value: new THREE.Vector3(1.05, 1.0, 0.93) },
    uAspect: { value: 1.7 }, uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tBloom;
    uniform float uBloomOn, uVignette, uSat, uContrast, uAspect, uTime;
    uniform vec3 uLift, uGain;
    #include <tonemapping_pars_fragment>
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( uBloomOn > 0.5 ) c.rgb += texture2D( tBloom, vUv ).rgb;
      c.rgb = max( c.rgb, vec3( 0.0 ) );
      #ifdef ACES_FILMIC_TONE_MAPPING
        c.rgb = ACESFilmicToneMapping( c.rgb );
      #elif defined( AGX_TONE_MAPPING )
        c.rgb = AgXToneMapping( c.rgb );
      #endif
      float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      c.rgb = mix( vec3( l ), c.rgb, uSat );
      c.rgb = ( c.rgb - 0.18 ) * uContrast + 0.18;
      c.rgb = c.rgb * uGain + uLift * ( 1.0 - c.rgb );
      vec2 v = ( vUv - 0.5 ) * vec2( uAspect, 1.0 ) * 0.62;
      c.rgb *= 1.0 - uVignette * smoothstep( 0.18, 0.75, dot( v, v ) * 1.6 );
      c = sRGBTransferOETF( clamp( c, 0.0, 1.0 ) );
      float n = fract( sin( dot( gl_FragCoord.xy + uTime, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      c.rgb += ( n - 0.5 ) / 255.0;
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera, tier) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier.msaa || 0 });
  const composer = new EffectComposer(renderer, rt);
  // RenderPass draws into readBuffer (rt2); nothing swaps (bloom doesn't, grade draws to the screen), so rt1 needs no MSAA
  composer.renderTarget1.samples = 0;
  // nothing reads the scene depth after the resolve
  composer.renderTarget1.resolveDepthBuffer = composer.renderTarget2.resolveDepthBuffer = false;
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (tier.bloom) {
    bloom = new BloomLite(new THREE.Vector2(size.x, size.y), 0.24, 0.45, 1.6, tier.bloomDiv || 2);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  grade.material.defines = {};
  grade.material.toneMapped = false;
  if (renderer.toneMapping === THREE.ACESFilmicToneMapping) grade.material.defines.ACES_FILMIC_TONE_MAPPING = '';
  if (renderer.toneMapping === THREE.AgXToneMapping) grade.material.defines.AGX_TONE_MAPPING = '';
  grade.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
  composer.addPass(grade);
  return {
    composer, bloom, grade,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      grade.uniforms.uAspect.value = w / h;
    },
    render(dt) {
      grade.uniforms.uTime.value = (grade.uniforms.uTime.value + 1) % 1000;
      grade.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      grade.uniforms.uBloomOn.value = bloom?.enabled ? 1 : 0;
      if (bloom) grade.uniforms.tBloom.value = bloom.output;
      composer.render(dt);
    },
  };
}
