// Runtime-switchable anti-aliasing. MSAA goes through a multisampled render target rather than
// the renderer's `antialias` flag, which is a context-creation flag and cannot be changed live.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { track, untrack } from './budget.js';

export const AA_MODES = ['off', 'blit', 'msaa2', 'msaa4', 'msaa8', 'fxaa', 'msaa4_fxaa', 'native'];

const SAMPLES = { msaa2: 2, msaa4: 4, msaa8: 8, msaa4_fxaa: 4 };
const STORE = 'waterline.aa';

export function wantsNativeAA() {
  const p = new URLSearchParams(location.search).get('aa');
  if (p) return p === 'native';
  try { return localStorage.getItem(STORE) === 'native'; } catch { return false; }
}

// A target that holds what the screen would have held. Three normally renders into a target in
// linear space with tone mapping off, but it mixes fog *after* the encode, so a linear buffer
// washes the whole distance out. isXRRenderTarget makes three treat the target like the screen.
// internalFormat then stops the hardware encoding those bytes a second time, and keeps the
// multisample renderbuffer blit-compatible with the resolve texture — mismatched, it resolves black.
export function outputSpaceTarget(w, h, samples = 0) {
  const rt = new THREE.WebGLRenderTarget(w, h, { samples, stencilBuffer: false });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.internalFormat = 'RGBA8';
  rt.isXRRenderTarget = true;
  return rt;
}

export class AA {
  constructor(app) {
    this.app = app;
    this.mode = app.nativeAA ? 'native' : 'off';
    this.rt = null;
    this.depthKey = {};
    this.booted = false;

    this.fogSave = new THREE.Color();
    this.fogEnc = new THREE.Color();

    this.copy = new ShaderPass(CopyShader);
    this.copy.material.blending = THREE.NoBlending;
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.material.blending = THREE.NoBlending;
  }

  registerKnobs(q) {
    this.q = q;
    q.register({ key: 'aa', label: 'Anti-aliasing', type: 'select', options: AA_MODES, group: 'Renderer',
      default: this.app.nativeAA ? 'native' : 'off' }, v => this.setMode(v));
    q.register({ key: 'a2c', label: 'Leaf + grass edges', type: 'toggle', default: false, group: 'Renderer' },
      v => this.setA2C(v));
  }

  get samples() { return SAMPLES[this.mode] || 0; }
  get wantsFXAA() { return this.mode === 'fxaa' || this.mode === 'msaa4_fxaa'; }
  get wantsTarget() { return this.mode !== 'off' && this.mode !== 'native'; }

  setMode(v) {
    if (!AA_MODES.includes(v)) return;
    this.mode = v;
    if (this.booted && (v === 'native') !== this.app.nativeAA) {
      try { localStorage.setItem(STORE, v); } catch { /* private mode */ }
      const u = new URL(location.href);
      u.searchParams.set('aa', v);
      location.replace(u);
      return;
    }
    this.booted = true;
    this.apply();
  }

  setA2C(v) {
    this.a2c = !!v;
    // The coverage mask is one bit at one sample, so on its own this toggle did nothing at all.
    if (this.a2c && !this.samples) this.q?.set('aa', 'msaa4');
    this.syncMaterials();
  }

  // Only bites on a multisampled target; at one sample the coverage mask is one bit.
  // The blending swap is not cosmetic: r160 defines OPAQUE — which pins alpha to 1 — for every
  // NormalBlending opaque material, and alphaToCoverage does nothing without the card's real alpha.
  syncMaterials() {
    const want = !!this.a2c;
    this.app.scene.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        if (!(m.alphaTest > 0) || m.alphaToCoverage === want) continue;
        m.alphaToCoverage = want;
        m.blending = want ? THREE.NoBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    });
  }

  // The other half of the target/screen mismatch: three converts the fog colour to working space
  // the moment any target is bound, yet its shaders mix fog after the sRGB encode, so the whole
  // distance darkens. Hand the shader the encoded numbers for the length of the pass.
  fogPatch(run) {
    const fog = this.app.scene.fog;
    if (!fog) return run();
    this.fogSave.copy(fog.color);
    fog.color.getRGB(this.fogEnc, THREE.SRGBColorSpace);
    fog.color.setRGB(this.fogEnc.r, this.fogEnc.g, this.fogEnc.b, THREE.LinearSRGBColorSpace);
    try { run(); } finally { fog.color.copy(this.fogSave); }
  }

  apply() {
    const app = this.app;
    const post = app.post;
    if (post?.enabled) {
      post.setAA(this.samples, this.wantsFXAA);
      app.renderPath = () => this.fogPatch(() => post.composer.render());
      this.free();
      return;
    }
    if (!this.wantsTarget) { this.free(); app.renderPath = null; return; }

    this.build();
    const r = app.renderer;
    app.renderPath = () => {
      this.fogPatch(() => {
        r.setRenderTarget(this.rt);
        r.render(app.scene, app.camera);
      });
      const pass = this.wantsFXAA ? this.fxaa : this.copy;
      pass.renderToScreen = true;
      pass.render(r, null, this.rt);
    };
  }

  build() {
    const s = this.app.renderer.getDrawingBufferSize(new THREE.Vector2());
    const n = this.samples;
    if (this.rt && this.rt.width === s.x && this.rt.height === s.y && this.rt.samples === n) return;
    this.free();

    this.rt = outputSpaceTarget(s.x, s.y, n);
    this.rt.texture.name = 'aa.scene';
    // a multisampled target holds n sample copies plus the resolved texture
    track(this.rt.texture, { w: s.x, h: s.y, mips: false, mult: n ? n + 1 : 1,
      label: `aa scene ${n ? 'msaa' + n : '1×'}` });
    track(this.depthKey, { w: s.x, h: s.y, mips: false, mult: n || 1, label: 'aa depth' });
    this.fxaa.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  }

  free() {
    if (!this.rt) return;
    untrack(this.rt.texture);
    untrack(this.depthKey);
    this.rt.dispose();
    this.rt = null;
  }

  resize() {
    if (this.wantsTarget && !this.app.post?.enabled) this.build();
  }
}
