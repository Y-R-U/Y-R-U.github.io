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

const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null }, toneMappingExposure: { value: 1 },
    uVignette: { value: 0.34 }, uSat: { value: 1.16 }, uContrast: { value: 1.14 },
    uLift: { value: new THREE.Vector3(0.01, 0.006, 0.0) }, uGain: { value: new THREE.Vector3(1.05, 1.0, 0.93) },
    uAspect: { value: 1.7 }, uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSat, uContrast, uAspect, uTime;
    uniform vec3 uLift, uGain;
    #include <tonemapping_pars_fragment>
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
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
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (tier.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.24, 0.45, 1.6);
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
      composer.render(dt);
    },
  };
}
