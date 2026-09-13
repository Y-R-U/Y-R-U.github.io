/* Bloom, a gentle always-on depth of field, and a filmic grade. The DoF is
   what makes a render read as a photograph of a tank rather than a diagram
   of one, so it is on by default at a low strength. */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 8.0 }, uAperture: { value: 0.16 }, uExposure: { value: 0.95 },
    uNear: { value: 0.08 }, uFar: { value: 160 }, uLook: { value: 0 },
    uVig: { value: 0.30 }, uGrain: { value: 0.022 }, uChroma: { value: 0.0014 },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth;
    uniform vec2 uRes;
    uniform float uFocus, uAperture, uExposure, uNear, uFar, uLook, uVig, uGrain, uChroma, uTime;
    varying vec2 vUv;
    float linDepth(float z){ float n = 2.0*z - 1.0; return (2.0*uNear*uFar)/(uFar+uNear-n*(uFar-uNear)); }
    void main(){
      vec2 off = (vUv - 0.5) * uChroma;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b);

      if (uAperture > 0.004){
        float d = linDepth(texture2D(tDepth, vUv).r);
        float coc = clamp(abs(d - uFocus) / max(0.6, uFocus * 0.55), 0.0, 1.0) * uAperture;
        float r = coc * 26.0;
        if (r > 0.45){
          vec3 sum = vec3(0.0); float wsum = 0.0;
          for (int i = 0; i < 14; i++){
            float a = float(i) * 2.39996323;
            float rad = sqrt(float(i)/14.0) * r;
            vec2 o = vec2(cos(a), sin(a)) * rad / uRes;
            vec3 s = texture2D(tDiffuse, vUv + o).rgb;
            float w = 1.0 + dot(s, vec3(0.3,0.6,0.1));
            sum += s * w; wsum += w;
          }
          col = mix(col, sum/wsum, clamp(coc * 2.4, 0.0, 1.0));
        }
      }

      col *= uExposure;
      if (uLook > 0.5 && uLook < 1.5){            /* warm reef */
        col = vec3(col.r*1.10 + col.g*0.03, col.g*1.03, col.b*0.86);
      } else if (uLook > 1.5 && uLook < 2.5){     /* cold deep */
        col = vec3(col.r*0.80, col.g*0.97, col.b*1.18);
        col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))), 0.12);
      } else if (uLook > 2.5 && uLook < 3.5){     /* silver */
        float l = dot(col, vec3(0.299,0.587,0.114));
        col = mix(vec3(l), col, 0.14) * vec3(0.96,0.99,1.06);
      } else if (uLook > 3.5){                    /* vivid */
        float l = dot(col, vec3(0.299,0.587,0.114));
        col = mix(vec3(l), col, 1.5);
      }

      /* a soft filmic shoulder so the lamp does not clip to flat white */
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
      col = (col - 0.5) * 1.05 + 0.5;

      float v = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.32, 0.98, v) * uVig;

      float g = fract(sin(dot(vUv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;

      col = max(col, vec3(0.0));
      vec3 lo = col * 12.92;
      vec3 hi = 1.055 * pow(col, vec3(1.0/2.4)) - 0.055;
      col = mix(hi, lo, step(col, vec3(0.0031308)));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/* Mobile GPUs refuse combinations desktop drivers wave through — a 16-bit
   float colour buffer, and especially a multisampled one. A refused
   attachment does not throw: the framebuffer is simply incomplete and every
   frame draws nothing, which looks exactly like the game being broken. So ask
   the driver whether the target really got made, and step down until one
   does. Anything the phone accepts beats a black screen. */
function tryTarget(renderer, w, h, type, samples, depth) {
  const gl = renderer.getContext();
  while (gl.getError() !== gl.NO_ERROR) { /* drain anything earlier left behind */ }
  let rt = null;
  try {
    rt = new THREE.WebGLRenderTarget(w, h, { type, samples, depthBuffer: depth });
    if (depth) rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);            /* forces the real GL allocation */
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE &&
               gl.getError() === gl.NO_ERROR;
    renderer.setRenderTarget(prev);
    if (ok) return rt;
  } catch (e) { /* fall through to the next rung */ }
  if (rt) rt.dispose();
  return null;
}

export function buildPost(renderer, scene, camera, { lite = false, dpr = 1 } = {}) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const w = Math.max(2, Math.round(size.x * dpr)), h = Math.max(2, Math.round(size.y * dpr));

  const floatOk = renderer.extensions.has('EXT_color_buffer_float') ||
                  renderer.extensions.has('EXT_color_buffer_half_float');
  const maxS = lite ? 0 : Math.min(4, renderer.capabilities.maxSamples || 0);
  const rungs = [];
  if (floatOk && maxS) rungs.push([THREE.HalfFloatType, maxS]);
  if (floatOk)         rungs.push([THREE.HalfFloatType, 0]);
  if (maxS)            rungs.push([THREE.UnsignedByteType, maxS]);
  rungs.push([THREE.UnsignedByteType, 0]);

  let rtScene = null, mode = null;
  for (const [type, samples] of rungs) {
    rtScene = tryTarget(renderer, w, h, type, samples, true);
    if (rtScene) { mode = { type: type === THREE.HalfFloatType ? 'half' : 'byte', samples }; break; }
  }
  if (!rtScene) {                        /* every rung refused; take what three gives */
    rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, samples: 0 });
    rtScene.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    mode = { type: 'byte', samples: 0, forced: true };
  }
  const composer = new EffectComposer(renderer, rtScene);
  /* both ping-pong buffers share one depth attachment so the grade pass can
     read the depth the render pass just wrote, whichever way round it went */
  composer.renderTarget2.depthTexture = rtScene.depthTexture;
  composer.setPixelRatio(dpr);
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!lite) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.72, 0.86);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.set(w, h);
  grade.uniforms.tDepth.value = rtScene.depthTexture;
  grade.uniforms.uNear.value = camera.near;
  grade.uniforms.uFar.value = camera.far;
  grade.renderToScreen = true;
  composer.addPass(grade);

  return {
    composer, bloom, grade, rt: rtScene, mode,
    render() { composer.render(); },
    setSize(w2, h2) {
      composer.setSize(w2, h2);        /* resizes both targets and every pass */
      grade.uniforms.uRes.value.set(w2 * dpr, h2 * dpr);
    },
  };
}
