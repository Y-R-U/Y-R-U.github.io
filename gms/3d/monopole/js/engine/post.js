// Threshold bloom off the main buffer. Three extra draws — threshold-and-downsample, then two
// separable blur taps — plus the composite that any render-target path already pays for. Not a
// mip chain: the emissives are the brightest thing in the frame, so one threshold isolates them.
//
// The main buffer is in *output* space (tone-mapped, sRGB-encoded bytes), so the threshold and
// the blur both work on encoded values and nothing in this file converts colour.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { outputSpaceTarget } from './aa.js';
import { track, untrack } from './budget.js';

const QUAD_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const THRESH_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold, uKnee;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float w = clamp((l - uThreshold) / max(1e-4, uKnee), 0.0, 1.0);
  gl_FragColor = vec4(c * w * w, 1.0);
}`;

// five taps at the linear-filter positions of a nine-tap gaussian
const BLUR_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += (texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb
      + texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb
      + texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMP_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse, tBloom;
uniform float uStrength;
void main(){
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * uStrength, 1.0);
}`;

const quadMat = (frag, uniforms) => new THREE.ShaderMaterial({
  uniforms, vertexShader: QUAD_VERT, fragmentShader: frag,
  depthTest: false, depthWrite: false, blending: THREE.NoBlending,
});

export class Post {
  constructor(app) {
    this.app = app;
    this.enabled = false;
    this.samples = 0;
    this.scale = 0.25;
    this.size = new THREE.Vector2();
    this.depthKey = {};

    this.thresh = new FullScreenQuad(quadMat(THRESH_FRAG, {
      tDiffuse: { value: null }, uThreshold: { value: 0.74 }, uKnee: { value: 0.22 },
    }));
    this.blur = new FullScreenQuad(quadMat(BLUR_FRAG, {
      tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() },
    }));
    this.comp = new FullScreenQuad(quadMat(COMP_FRAG, {
      tDiffuse: { value: null }, tBloom: { value: null }, uStrength: { value: 0.62 },
    }));
    this.fxaaQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader, fragmentShader: FXAAShader.fragmentShader,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    }));

    this.radius = 1.0;
    this.wantsFXAA = false;
    // aa.js drives the render path through this handle
    this.composer = { render: () => this.render() };
  }

  registerKnobs(q) {
    const G = 'Bloom';
    q.register({ key: 'bloom', label: 'Bloom', type: 'toggle', default: true, group: G },
      v => this.setEnabled(!!v));
    q.register({ key: 'bloomThreshold', label: 'Bloom threshold', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.74, group: G },
      v => { this.thresh.material.uniforms.uThreshold.value = v; });
    q.register({ key: 'bloomKnee', label: 'Bloom knee', type: 'range', min: 0.02, max: 0.6, step: 0.01, default: 0.22, group: G },
      v => { this.thresh.material.uniforms.uKnee.value = v; });
    q.register({ key: 'bloomStrength', label: 'Bloom strength', type: 'range', min: 0, max: 2, step: 0.01, default: 0.62, group: G },
      v => { this.comp.material.uniforms.uStrength.value = v; });
    q.register({ key: 'bloomRadius', label: 'Bloom radius', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1.0, group: G },
      v => { this.radius = v; });
    q.register({ key: 'bloomScale', label: 'Bloom buffer', type: 'select', options: [0.5, 0.25, 0.125], default: 0.25, group: G },
      v => { const s = +v; if (s === this.scale) return; this.scale = s; this.free(); this.app.aa?.apply(); });
  }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.free();
    this.app.aa?.apply();
  }

  // called by the aa knob; the sample count is baked into the scene target
  setAA(samples, fxaa) {
    this.wantsFXAA = fxaa;
    if (samples !== this.samples) { this.samples = samples; this.free(); }
  }

  build() {
    const s = this.app.renderer.getDrawingBufferSize(this.size);
    if (this.rt && this.rt.width === s.x && this.rt.height === s.y) return;
    this.free();
    const bw = Math.max(2, Math.round(s.x * this.scale)), bh = Math.max(2, Math.round(s.y * this.scale));

    this.rt = outputSpaceTarget(s.x, s.y, this.samples);
    this.rt.texture.name = 'post.scene';
    track(this.rt.texture, { w: s.x, h: s.y, mips: false, mult: this.samples ? this.samples + 1 : 1, label: 'post scene' });
    track(this.depthKey, { w: s.x, h: s.y, mips: false, mult: this.samples || 1, label: 'post depth' });

    const half = () => {
      const t = new THREE.WebGLRenderTarget(bw, bh, {
        depthBuffer: false, stencilBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      });
      // the source bytes are already encoded; flagging the buffer linear stops three converting
      t.texture.colorSpace = THREE.LinearSRGBColorSpace;
      return t;
    };
    this.a = half(); this.b = half();
    track(this.a.texture, { w: bw, h: bh, mips: false, label: 'bloom a' });
    track(this.b.texture, { w: bw, h: bh, mips: false, label: 'bloom b' });

    this.out = null;
    this.bw = bw; this.bh = bh;
    this.fxaaQuad.material.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  }

  free() {
    if (!this.rt) return;
    untrack(this.rt.texture); untrack(this.depthKey);
    untrack(this.a.texture); untrack(this.b.texture);
    this.rt.dispose(); this.a.dispose(); this.b.dispose();
    if (this.out) { untrack(this.out.texture); this.out.dispose(); }
    this.rt = this.a = this.b = this.out = null;
  }

  render() {
    const { renderer, scene, camera } = this.app;
    this.build();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);

    this.thresh.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.a);
    this.thresh.render(renderer);

    const u = this.blur.material.uniforms;
    u.tDiffuse.value = this.a.texture;
    u.uDir.value.set(this.radius / this.bw, 0);
    renderer.setRenderTarget(this.b);
    this.blur.render(renderer);

    u.tDiffuse.value = this.b.texture;
    u.uDir.value.set(0, this.radius / this.bh);
    renderer.setRenderTarget(this.a);
    this.blur.render(renderer);

    this.comp.material.uniforms.tDiffuse.value = this.rt.texture;
    this.comp.material.uniforms.tBloom.value = this.a.texture;

    if (this.wantsFXAA) {
      if (!this.out) {
        this.out = outputSpaceTarget(this.rt.width, this.rt.height, 0);
        track(this.out.texture, { w: this.rt.width, h: this.rt.height, mips: false, label: 'post fxaa src' });
      }
      renderer.setRenderTarget(this.out);
      this.comp.render(renderer);
      this.fxaaQuad.material.uniforms.tDiffuse.value = this.out.texture;
      renderer.setRenderTarget(null);
      this.fxaaQuad.render(renderer);
    } else {
      renderer.setRenderTarget(null);
      this.comp.render(renderer);
    }
  }

  resize() { if (this.enabled) { this.free(); } }
}
