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

export function buildPost(renderer, scene, camera, { lite = false, dpr = 1 } = {}) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
    type: THREE.HalfFloatType, samples: lite ? 0 : 4,
  });
  rt.depthTexture = new THREE.DepthTexture(size.x * dpr, size.y * dpr);
  rt.depthTexture.type = THREE.UnsignedIntType;

  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(size.x, size.y);
  /* both ping-pong buffers share one depth attachment so the grade pass can
     read the depth the render pass just wrote, whichever way round it went */
  composer.renderTarget2.depthTexture = rt.depthTexture;

  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!lite) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.72, 0.86);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.set(size.x * dpr, size.y * dpr);
  grade.uniforms.tDepth.value = rt.depthTexture;
  grade.uniforms.uNear.value = camera.near;
  grade.uniforms.uFar.value = camera.far;
  grade.renderToScreen = true;
  composer.addPass(grade);

  return {
    composer, bloom, grade, rt,
    setSize(w, h) {
      composer.setSize(w, h);
      /* setSize already resizes the attached depth texture; doing it again by
         hand makes the driver attempt a partial upload and complain */
      rt.setSize(w * dpr, h * dpr);
      composer.renderTarget2.depthTexture = rt.depthTexture;
      grade.uniforms.uRes.value.set(w * dpr, h * dpr);
      if (bloom) bloom.setSize(w, h);
    },
  };
}
