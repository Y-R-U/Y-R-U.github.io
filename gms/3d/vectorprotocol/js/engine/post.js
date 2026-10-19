import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// Scene pass with an optional backdrop camera: draws the scene through `bgCamera` (its own layers), clears depth,
// then draws it again through `camera`. Shadows update only once (on the main draw).
class DualRenderPass extends Pass {
  constructor() { super(); this.scene = null; this.camera = null; this.bgCamera = null; this.needsSwap = false; this.clear = true; }
  render(renderer, writeBuffer, readBuffer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    if (this.bgCamera) {
      const su = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(this.scene, this.bgCamera);
      renderer.shadowMap.autoUpdate = su;
      renderer.clearDepth();
    }
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

// UnrealBloom minus its last step (adapted from HEIRFRAME): the full-res additive blend back into the scene target is
// folded into the grade pass, saving a full-screen MSAA reload/store + second resolve every frame.
class BloomLite extends UnrealBloomPass {
  constructor(res, strength, radius, threshold, div = 2) {
    super(res.clone().multiplyScalar(2 / div), strength, radius, threshold);
    this.div = div; this.needsSwap = false;
    // a mirror-smooth glint can overflow half-float to Inf; Inf through blur/ACES = a black frame
    const hp = this.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = min( max( texel.rgb, vec3( 0.0 ) ), vec3( 64.0 ) );');
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

// tone map + grade + vignette + dither in one pass, plus two battle effects:
// uPulse = radial zoom blur / chromatic split (Overdrive), uFlash = full-screen tint flash (rgb * a).
const GradeShader = {
  name: 'VPGrade',
  uniforms: {
    tDiffuse: { value: null }, tBloom: { value: null }, uBloomOn: { value: 0 }, toneMappingExposure: { value: 1 },
    uVignette: { value: 0.42 }, uVigAspect: { value: 99 }, uSat: { value: 1.12 }, uContrast: { value: 1.1 },
    uLift: { value: new THREE.Vector3(0.0, 0.004, 0.012) }, uGain: { value: new THREE.Vector3(0.98, 1.0, 1.04) },
    uAspect: { value: 0.45 }, uTime: { value: 0 }, uPulse: { value: 0 }, uPulseC: { value: new THREE.Vector2(0.5, 0.5) },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uTint: { value: new THREE.Vector4(1, 1, 1, 0) }, // multiplicative grade tint (rgb, amount), e.g. OVERTIME red
    uFocus: { value: new THREE.Vector4(0.5, 0.5, 0.2, 0) }, // x, y (uv), radius (screen heights), dim 0..1
    uMaskDbg: { value: 0 }, // 1 = show the bloom mask (scene alpha) instead of the image
    uDim: { value: 0 }, // scene-wide dim + desaturate 0..1 (fx.dim); bloom is added after it, so glowing VFX stay vivid
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tBloom;
    uniform float uBloomOn, uVignette, uVigAspect, uSat, uContrast, uAspect, uTime, uPulse;
    uniform vec2 uPulseC;
    uniform vec3 uLift, uGain;
    uniform vec4 uFlash;
    uniform vec4 uTint;
    uniform vec4 uFocus;
    uniform float uDim;
    uniform float uMaskDbg;
    #include <tonemapping_pars_fragment>
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( uPulse > 0.001 ) {
        vec2 zd = vUv - uPulseC;
        vec3 acc = c.rgb;
        for ( int i = 1; i < 6; i++ ) acc += texture2D( tDiffuse, uPulseC + zd * ( 1.0 - uPulse * 0.007 * float( i ) ) ).rgb;
        c.rgb = acc / 6.0;
        float ca = uPulse * 0.004;
        c.r = mix( c.r, texture2D( tDiffuse, vUv + zd * ca ).r, 0.7 );
        c.b = mix( c.b, texture2D( tDiffuse, vUv - zd * ca ).b, 0.7 );
      }
      if ( uDim > 0.001 ) {
        float dl = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        // the lit scene drops to a cold, near-grey ~30%; HDR emitters (> ~1.5) fade far less so beams and muzzle flashes cut through
        float keep = smoothstep( 1.2, 4.0, dl );
        vec3 dimmed = mix( vec3( dl ) * vec3( 0.55, 0.62, 0.8 ), c.rgb, 0.25 ) * 0.3;
        c.rgb = mix( c.rgb, mix( dimmed, c.rgb, keep ), uDim );
      }
      // bloom mask: the scene alpha is 1 everywhere except under markNoBloom() materials (void cores), which multiply it down
      float bm = smoothstep( 0.02, 0.45, clamp( c.a, 0.0, 1.0 ) );
      if ( uBloomOn > 0.5 ) c.rgb += texture2D( tBloom, vUv ).rgb * bm;
      if ( uMaskDbg > 0.5 ) { gl_FragColor = vec4( vec3( clamp( c.a, 0.0, 1.0 ) ), 1.0 ); return; }
      c.rgb = min( max( c.rgb, vec3( 0.0 ) ), vec3( 64.0 ) );
      c.rgb = mix( c.rgb, uFlash.rgb * 2.0, uFlash.a * bm ); // masked void cores stay black through screen flashes too
      #ifdef ACES_FILMIC_TONE_MAPPING
        c.rgb = ACESFilmicToneMapping( c.rgb );
      #elif defined( AGX_TONE_MAPPING )
        c.rgb = AgXToneMapping( c.rgb );
      #endif
      float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      c.rgb = mix( vec3( l ), c.rgb, uSat );
      c.rgb = ( c.rgb - 0.18 ) * uContrast + 0.18;
      if ( uFocus.w > 0.001 ) {
        // spotlight: everything outside the focus circle desaturates and darkens (Overdrive caster stays sharp)
        vec2 fd = ( vUv - uFocus.xy ) * vec2( uAspect, 1.0 );
        float k = smoothstep( uFocus.z, uFocus.z * 2.2, length( fd ) ) * uFocus.w;
        float fl = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        c.rgb = mix( c.rgb, vec3( fl ) * vec3( 0.3, 0.36, 0.5 ), k );
      }
      c.rgb = mix( c.rgb, c.rgb * uTint.rgb, uTint.a );
      c.rgb = c.rgb * uGain + uLift * ( 1.0 - c.rgb ) * bm;
      vec2 v = ( vUv - 0.5 ) * vec2( min( uAspect, uVigAspect ), 1.0 ) * 0.9; // vignetteAspect caps how far a wide frame's sides darken
      c.rgb *= 1.0 - uVignette * smoothstep( 0.12, 0.7, dot( v, v ) * 1.6 );
      c.a = 1.0;
      c = sRGBTransferOETF( clamp( c, 0.0, 1.0 ) );
      float n = fract( sin( dot( gl_FragCoord.xy + uTime, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      c.rgb += ( n - 0.5 ) / 255.0;
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, tier) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier.msaa || 0 });
  const composer = new EffectComposer(renderer, rt);
  // RenderPass draws into readBuffer; nothing swaps afterwards, so rt1 needs no MSAA and nothing reads depth
  composer.renderTarget1.samples = 0;
  composer.renderTarget1.resolveDepthBuffer = composer.renderTarget2.resolveDepthBuffer = false;
  composer.setPixelRatio(renderer.getPixelRatio());
  const renderPass = new DualRenderPass();
  composer.addPass(renderPass);
  let bloom = null;
  if (tier.bloom) {
    bloom = new BloomLite(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 0.92, tier.bloomDiv || 2);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  grade.material.defines = {};
  grade.material.toneMapped = false;
  if (renderer.toneMapping === THREE.ACESFilmicToneMapping) grade.material.defines.ACES_FILMIC_TONE_MAPPING = '';
  if (renderer.toneMapping === THREE.AgXToneMapping) grade.material.defines.AGX_TONE_MAPPING = '';
  composer.addPass(grade);
  const post = {
    composer, bloom, grade, renderPass,
    // per-scene look: post.set({ strength, radius, threshold, factors?, vignette, vignetteAspect?, sat, contrast, exposure })
    defaults: { strength: 0.55, radius: 0.5, threshold: 0.92, vignette: 0.42, sat: 1.12, contrast: 1.1 },
    set(o = {}) {
      const d = { ...post.defaults, ...o };
      if (bloom) {
        bloom.strength = d.strength; bloom.radius = d.radius; bloom.threshold = d.threshold;
        // per-mip weights (UnrealBloom default 1,.8,.6,.4,.2); low wide-mip weights keep a bright scene crisp instead of milky
        const f = d.factors || [1, 0.8, 0.6, 0.4, 0.2], bf = bloom.compositeMaterial.uniforms.bloomFactors.value;
        for (let i = 0; i < bf.length; i++) bf[i] = f[i] ?? 0;
      }
      grade.uniforms.uVignette.value = d.vignette; grade.uniforms.uVigAspect.value = d.vignetteAspect ?? 99; grade.uniforms.uSat.value = d.sat; grade.uniforms.uContrast.value = d.contrast;
      if (o.exposure) renderer.toneMappingExposure = o.exposure;
    },
    tint(r, g, b, a) { grade.uniforms.uTint.value.set(r, g, b, a); },
    dim(k) { grade.uniforms.uDim.value = Math.max(0, Math.min(1, k)); },
    focus(x, y, r, dim) { grade.uniforms.uFocus.value.set(x, y, r, dim); },
    pulse(v, cx = 0.5, cy = 0.5) { grade.uniforms.uPulse.value = v; grade.uniforms.uPulseC.value.set(cx, cy); },
    flash(color, a) { const f = grade.uniforms.uFlash.value; if (color) { f.x = color.r; f.y = color.g; f.z = color.b; } f.w = a; },
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      grade.uniforms.uAspect.value = w / h;
    },
    render(scene, camera, dt, bgCamera = null) {
      renderPass.scene = scene; renderPass.camera = camera; renderPass.bgCamera = bgCamera;
      grade.uniforms.uTime.value = (grade.uniforms.uTime.value + 1) % 1000;
      grade.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      grade.uniforms.uBloomOn.value = bloom?.enabled ? 1 : 0;
      if (bloom) grade.uniforms.tBloom.value = bloom.output;
      composer.render(dt);
    },
  };
  return post;
}
