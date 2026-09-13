// Three passes, not seven (DESIGN section 9): bright-pass + downsample, a
// separable blur at quarter resolution, then one composite that does vignette,
// chromatic aberration, flash, desaturation and grain in a single texture read
// each. Everything the design calls "flash spent on motion" lands here.
//
// NaN DISCIPLINE. One NaN pixel plus a blur is a black screen with a working
// HUD, and the classic source is pow() of a negative base in the bright-pass.
// Every value is max()'d to >= 0 before any pow(), and both the bright-pass and
// the composite run a `scrub()` that replaces NaN with black (x != x is true
// only for NaN). A firefly is also clamped, because INF poisons a blur just as
// thoroughly as NaN does.

const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID: no vertex buffer, no attribute state
  // to collide with the renderer's own.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh;
uniform float uKnee;
out vec4 frag;
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
vec3 scrub(vec3 c) { return mix(c, vec3(0.0), vec3(notEqual(c, c))); }
void main() {
  // 4-tap box while downsampling. A single tap at quarter res turns every
  // bright pixel into a firefly that crawls as the camera moves.
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c = scrub(max(c * 0.25, vec3(0.0)));
  float l = dot(c, LUM);
  vec3 b = c * (max(l - uThresh, 0.0) / max(l, 1e-4));
  b = pow(max(b, vec3(0.0)), vec3(uKnee));   // the guard that matters
  frag = vec4(min(b, vec3(6.0)), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main() {
  // 9-tap gaussian as 5 linear-filtered taps.
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  frag = vec4(max(c, vec3(0.0)), 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform vec2 uShake;
uniform float uChroma;
uniform float uVignette;
uniform float uFlash;
uniform float uDesat;
uniform float uTime;
out vec4 frag;
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
vec3 scrub(vec3 c) { return mix(c, vec3(0.0), vec3(notEqual(c, c))); }
void main() {
  vec2 uv = clamp(vUv + uShake, 0.0, 1.0);
  vec2 d = uv - 0.5;
  vec3 col;
  if (uChroma > 0.0001) {
    // uChroma is 0..1 and the offset is in UV, so these constants must be TINY.
    // The first version used (0.25 + dot*2.0), which at full strength shifted
    // red and blue by 28% of the screen and turned the HUD into unreadable
    // rainbow ghosting. Max here is ~2.6px on a 390pt phone.
    vec2 off = d * uChroma * (0.006 + dot(d, d) * 0.030);
    col.r = texture(uScene, clamp(uv + off, 0.0, 1.0)).r;
    col.g = texture(uScene, uv).g;
    col.b = texture(uScene, clamp(uv - off, 0.0, 1.0)).b;
  } else {
    col = texture(uScene, uv).rgb;
  }
  col += texture(uBloom, uv).rgb * uBloomAmt;
  col = scrub(max(col, vec3(0.0)));

  float vig = 1.0 - smoothstep(0.30, 1.05, length(d) * 1.35);
  col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));

  // Near-black backgrounds band badly on a phone panel; a sliver of grain is
  // cheaper than dithering and hides it.
  float g = fract(sin(dot(uv * 512.0 + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.016;

  col = mix(col, vec3(dot(col, LUM)), clamp(uDesat, 0.0, 1.0));
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// q: 0 = straight composite, no bloom. 1 = bloom at 1/8 and no chroma.
// 2 = bloom at 1/4, two blur iterations, chroma.
const QUAL = [
  { bloom: 0, div: 4, iters: 0, chroma: 0 },
  { bloom: 1, div: 8, iters: 1, chroma: 0 },
  { bloom: 1, div: 4, iters: 2, chroma: 1 },
];

const NOOP = {
  begin() {}, end() {}, setQuality() {}, resize() {}, destroy() {},
  get quality() { return 0; }, get ok() { return false },
};

export function makePost(gl, viewport) {
  if (!gl || typeof gl.createFramebuffer !== 'function') return NOOP;

  let q = 2;
  let ok = true;
  let w = 0, h = 0;
  let scene = null, bright = null, blurA = null, blurB = null;
  let vao = null;
  let pBright = null, pBlur = null, pComp = null;

  // Half-float scene targets let additive glow exceed 1.0 so the bright-pass
  // has something to find. Without the extension we fall back to RGBA8, where
  // the threshold simply has to sit lower.
  const hdr = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  const IFMT = hdr ? gl.RGBA16F : gl.RGBA8;
  const TYPE = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('postfx shader:', gl.getShaderInfoLog(s), '\n', src.slice(0, 80));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function program(fsSrc, names) {
    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('postfx link:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    const u = {};
    for (let i = 0; i < names.length; i++) u[names[i]] = gl.getUniformLocation(p, names[i]);
    return { p, u };
  }

  function target(tw, th, ifmt, type) {
    tw = Math.max(1, tw | 0); th = Math.max(1, th | 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, tw, th, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!complete) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return null; }
    return { fb, tex, w: tw, h: th };
  }

  function drop(t) {
    if (!t) return;
    gl.deleteFramebuffer(t.fb);
    gl.deleteTexture(t.tex);
  }

  function build() {
    drop(scene); drop(bright); drop(blurA); drop(blurB);
    scene = bright = blurA = blurB = null;

    const dw = gl.drawingBufferWidth || (viewport && viewport.bw) || 1;
    const dh = gl.drawingBufferHeight || (viewport && viewport.bh) || 1;
    w = dw; h = dh;

    scene = target(dw, dh, IFMT, TYPE);
    if (!scene && hdr) scene = target(dw, dh, gl.RGBA8, gl.UNSIGNED_BYTE);
    if (!scene) { ok = false; return; }

    const div = QUAL[q].div;
    const bw = Math.max(1, Math.floor(dw / div));
    const bh = Math.max(1, Math.floor(dh / div));
    bright = target(bw, bh, IFMT, TYPE) || target(bw, bh, gl.RGBA8, gl.UNSIGNED_BYTE);
    blurA = target(bw, bh, IFMT, TYPE) || target(bw, bh, gl.RGBA8, gl.UNSIGNED_BYTE);
    blurB = target(bw, bh, IFMT, TYPE) || target(bw, bh, gl.RGBA8, gl.UNSIGNED_BYTE);
    if (!bright || !blurA || !blurB) { q = 0; }
  }

  function init() {
    vao = gl.createVertexArray();
    pBright = program(FS_BRIGHT, ['uTex', 'uTexel', 'uThresh', 'uKnee']);
    pBlur = program(FS_BLUR, ['uTex', 'uDir']);
    pComp = program(FS_COMP, ['uScene', 'uBloom', 'uBloomAmt', 'uShake', 'uChroma',
      'uVignette', 'uFlash', 'uDesat', 'uTime']);
    if (!pComp) { ok = false; return; }
    if (!pBright || !pBlur) q = 0;
    build();
  }

  init();
  if (!ok) return NOOP;

  function ensure() {
    if (gl.isContextLost && gl.isContextLost()) return false;
    const dw = gl.drawingBufferWidth, dh = gl.drawingBufferHeight;
    if (dw && dh && (dw !== w || dh !== h)) build();
    return ok && !!scene;
  }

  function blit(prog, dst, sw, sh) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(prog.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bind(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (loc) gl.uniform1i(loc, unit);
  }

  const post = {
    // Everything drawn between begin() and end() lands in the scene FBO.
    begin() {
      if (!ensure()) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.viewport(0, 0, scene.w, scene.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    end(opts) {
      if (!ensure()) return;
      const o = opts || 0;
      const cfg = QUAL[q];

      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);

      const amt = o ? (o.bloom === undefined ? 1 : +o.bloom) : 1;
      let glowing = false;

      if (cfg.bloom && bright && blurA && blurB && amt > 0.001) {
        gl.useProgram(pBright.p);
        bind(0, scene.tex, pBright.u.uTex);
        gl.uniform2f(pBright.u.uTexel, 1 / scene.w, 1 / scene.h);
        // RGBA8 has no headroom above 1.0, so the threshold has to sit lower
        // or nothing ever qualifies as bright.
        gl.uniform1f(pBright.u.uThresh, hdr ? 0.75 : 0.55);
        gl.uniform1f(pBright.u.uKnee, 1.15);
        blit(pBright, bright, bright.w, bright.h);

        gl.useProgram(pBlur.p);
        let src = bright, dst = blurA;
        const iters = Math.max(1, cfg.iters);
        for (let i = 0; i < iters; i++) {
          bind(0, src.tex, pBlur.u.uTex);
          gl.uniform2f(pBlur.u.uDir, 1 / src.w, 0);
          blit(pBlur, dst, dst.w, dst.h);

          bind(0, dst.tex, pBlur.u.uTex);
          gl.uniform2f(pBlur.u.uDir, 0, 1 / dst.h);
          blit(pBlur, blurB, blurB.w, blurB.h);

          src = blurB; dst = blurA;
        }
        glowing = true;
      }

      gl.useProgram(pComp.p);
      bind(0, scene.tex, pComp.u.uScene);
      // The bloom sampler is always bound to something real; with uBloomAmt 0
      // it contributes nothing, and an unbound sampler is undefined behaviour
      // on some drivers rather than simply black.
      bind(1, glowing ? blurB.tex : scene.tex, pComp.u.uBloom);
      gl.uniform1f(pComp.u.uBloomAmt, glowing ? amt : 0);

      const sh = o && o.shake;
      gl.uniform2f(pComp.u.uShake, sh ? (sh.x || 0) : 0, sh ? (sh.y || 0) : 0);
      gl.uniform1f(pComp.u.uChroma, cfg.chroma && o ? (o.chroma || 0) : 0);
      gl.uniform1f(pComp.u.uVignette, o && o.vignette !== undefined ? o.vignette : 0.65);
      gl.uniform1f(pComp.u.uFlash, o ? (o.flash || 0) : 0);
      gl.uniform1f(pComp.u.uDesat, o ? (o.desat || 0) : 0);
      gl.uniform1f(pComp.u.uTime, o ? ((o.time || 0) % 1000) : 0);
      blit(pComp, null, w, h);

      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
    },

    // Switchable at runtime with no reload: adaptive quality has to be able to
    // drop bloom the instant the frame clock slips.
    setQuality(v) {
      v = v | 0;
      if (v < 0) v = 0; else if (v > 2) v = 2;
      if (v === q) return;
      const rebuild = QUAL[v].div !== QUAL[q].div;
      q = v;
      if (rebuild && ok) build();
    },

    resize() { if (ok) build(); },

    destroy() {
      drop(scene); drop(bright); drop(blurA); drop(blurB);
      scene = bright = blurA = blurB = null;
      if (vao) gl.deleteVertexArray(vao);
      for (const pr of [pBright, pBlur, pComp]) if (pr) gl.deleteProgram(pr.p);
      pBright = pBlur = pComp = null;
      ok = false;
    },

    get quality() { return q; },
    get ok() { return ok; },
    get hdr() { return hdr; },
  };

  return post;
}
