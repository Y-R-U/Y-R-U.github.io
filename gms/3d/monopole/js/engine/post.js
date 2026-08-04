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

// The shoulder is the only thing standing between a bright nebula and a white hole where the
// subject's silhouette should be: below uShoulder nothing moves, above it the excess is rolled
// into the last stop instead of clipping. uShoulder = 1 is the old hard clamp.
const SHOULDER = `
vec3 shoulder(vec3 c, float k){
  vec3 e = max(c - k, 0.0);
  return min(c, vec3(k)) + e / (1.0 + e / max(1e-3, 1.0 - k));
}`;

const COMP_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse, tBloom;
uniform float uStrength, uShoulder;
${SHOULDER}
void main(){
  gl_FragColor = vec4(shoulder(texture2D(tDiffuse, vUv).rgb
    + texture2D(tBloom, vUv).rgb * uStrength, uShoulder), 1.0);
}`;

// A tilt band, not a depth blur: the sharp strip is a line across the frame and everything either
// side of it defocuses. On a composition whose subject runs on one diagonal that is what a real
// shallow depth of field looks like, and it costs no depth buffer and no per-pixel CoC.
const DOF_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse, tBloom, tBlur;
uniform float uStrength, uShoulder, uCenter, uIn, uOut, uMax, uNear;
uniform vec2 uAxis;
${SHOULDER}
void main(){
  vec2 p = vUv - 0.5;
  // asymmetric on purpose: a subject that runs from 200 m to 600 m across the frame occupies most
  // of the band's own axis, so a symmetric band defocuses the subject along with the background
  float s = dot(p, uAxis) - uCenter;
  float d = s > 0.0 ? s : -s * uNear;
  float coc = smoothstep(uIn, uOut, d) * uMax;
  vec3 c = mix(texture2D(tDiffuse, vUv).rgb, texture2D(tBlur, vUv).rgb, coc);
  gl_FragColor = vec4(shoulder(c + texture2D(tBloom, vUv).rgb * uStrength, uShoulder), 1.0);
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
      tDiffuse: { value: null }, tBloom: { value: null },
      uStrength: { value: 0.62 }, uShoulder: { value: 1.0 },
    }));
    this.dofComp = new FullScreenQuad(quadMat(DOF_FRAG, {
      tDiffuse: { value: null }, tBloom: { value: null }, tBlur: { value: null },
      uStrength: { value: 0.62 }, uShoulder: { value: 1.0 },
      uAxis: { value: new THREE.Vector2(0, 1) },
      uCenter: { value: 0 }, uIn: { value: 0.06 }, uOut: { value: 0.30 },
      uMax: { value: 0.9 }, uNear: { value: 1 },
    }));
    this.dof = false;
    this.dofRadius = 1.6;
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
      v => { this.comp.material.uniforms.uStrength.value = v; this.dofComp.material.uniforms.uStrength.value = v; });
    q.register({ key: 'bloomShoulder', label: 'Highlight shoulder', type: 'range', min: 0.4, max: 1, step: 0.01, default: 1.0, group: G },
      v => { this.comp.material.uniforms.uShoulder.value = v; this.dofComp.material.uniforms.uShoulder.value = v; });
    q.register({ key: 'bloomRadius', label: 'Bloom radius', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1.0, group: G },
      v => { this.radius = v; });
    q.register({ key: 'bloomScale', label: 'Bloom buffer', type: 'select', options: [0.5, 0.25, 0.125], default: 0.25, group: G },
      v => { const s = +v; if (s === this.scale) return; this.scale = s; this.free(); this.app.aa?.apply(); });

    const D = 'Depth of field';
    const u = this.dofComp.material.uniforms;
    q.register({ key: 'dof', label: 'Depth of field', type: 'toggle', default: false, group: D },
      v => { const on = !!v; if (on === this.dof) return; this.dof = on; this.free(); });
    q.register({ key: 'dofAngle', label: 'Sharp band angle', type: 'range', min: -90, max: 90, step: 1, default: 0, group: D },
      v => { const a = (v + 90) * Math.PI / 180; u.uAxis.value.set(Math.cos(a), Math.sin(a)); });
    q.register({ key: 'dofCenter', label: 'Band offset', type: 'range', min: -0.5, max: 0.5, step: 0.005, default: 0, group: D },
      v => { u.uCenter.value = v; });
    q.register({ key: 'dofSharp', label: 'Band half-width', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.06, group: D },
      v => { u.uIn.value = v; });
    q.register({ key: 'dofFalloff', label: 'Defocus reach', type: 'range', min: 0.02, max: 0.8, step: 0.005, default: 0.30, group: D },
      v => { u.uOut.value = Math.max(u.uIn.value + 0.01, v); });
    q.register({ key: 'dofPower', label: 'Defocus amount', type: 'range', min: 0, max: 1, step: 0.02, default: 0.9, group: D },
      v => { u.uMax.value = v; });
    q.register({ key: 'dofNearSide', label: 'Near-side defocus', type: 'range', min: 0, max: 2, step: 0.02, default: 1, group: D },
      v => { u.uNear.value = v; });
    q.register({ key: 'dofBlur', label: 'Defocus radius', type: 'range', min: 0.4, max: 6, step: 0.05, default: 1.6, group: D },
      v => { this.dofRadius = v; });
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

    if (this.dof) {
      const dw = Math.max(2, s.x >> 1), dh = Math.max(2, s.y >> 1);
      this.c = half(); this.d = half();
      this.c.setSize(dw, dh); this.d.setSize(dw, dh);
      track(this.c.texture, { w: dw, h: dh, mips: false, label: 'dof a' });
      track(this.d.texture, { w: dw, h: dh, mips: false, label: 'dof b' });
      this.dw = dw; this.dh = dh;
    }

    this.out = null;
    this.bw = bw; this.bh = bh;
    this.fxaaQuad.material.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  }

  free() {
    if (!this.rt) return;
    untrack(this.rt.texture); untrack(this.depthKey);
    untrack(this.a.texture); untrack(this.b.texture);
    this.rt.dispose(); this.a.dispose(); this.b.dispose();
    if (this.c) { untrack(this.c.texture); untrack(this.d.texture); this.c.dispose(); this.d.dispose(); }
    if (this.out) { untrack(this.out.texture); this.out.dispose(); }
    this.rt = this.a = this.b = this.c = this.d = this.out = null;
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

    let comp = this.comp;
    if (this.dof && this.c) {
      u.tDiffuse.value = this.rt.texture;
      u.uDir.value.set(this.dofRadius / this.dw, 0);
      renderer.setRenderTarget(this.c);
      this.blur.render(renderer);

      u.tDiffuse.value = this.c.texture;
      u.uDir.value.set(0, this.dofRadius / this.dh);
      renderer.setRenderTarget(this.d);
      this.blur.render(renderer);

      comp = this.dofComp;
      comp.material.uniforms.tBlur.value = this.d.texture;
    }
    comp.material.uniforms.tDiffuse.value = this.rt.texture;
    comp.material.uniforms.tBloom.value = this.a.texture;

    if (this.wantsFXAA) {
      if (!this.out) {
        this.out = outputSpaceTarget(this.rt.width, this.rt.height, 0);
        track(this.out.texture, { w: this.rt.width, h: this.rt.height, mips: false, label: 'post fxaa src' });
      }
      renderer.setRenderTarget(this.out);
      comp.render(renderer);
      this.fxaaQuad.material.uniforms.tDiffuse.value = this.out.texture;
      renderer.setRenderTarget(null);
      this.fxaaQuad.render(renderer);
    } else {
      renderer.setRenderTarget(null);
      comp.render(renderer);
    }
  }

  resize() { if (this.enabled) { this.free(); } }
}
