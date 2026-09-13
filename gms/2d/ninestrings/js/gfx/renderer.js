// WebGL2 single-atlas batch renderer (CONTRACTS 9.1, DECISIONS D1).
//
// The whole frame is one texture and one program. Rotation and scale are baked
// into the vertices CPU-side, so there are no per-entity uniforms and no
// per-entity state changes: a layer is a bucket of quads, and `end()` uploads
// every bucket into one buffer and issues one draw per non-empty bucket. Two
// blend funcs exist (normal, additive) and they only ever change BETWEEN
// buckets, never inside one.
//
// Vertex layout is 20 bytes: [x, y, u, v, rgba(u32)]. 20k quads is a 1.6MB
// upload, which a phone does not notice.

import { buildAtlas, spriteId, frameCount, spriteKeyForSpec } from './atlas.js';
import { SPRITE_VS, SPRITE_FS } from './shaders/sprite.js';
import { FULLSCREEN_VS, BRIGHT_FS, BLUR_FS, COMPOSITE_FS } from './shaders/post.js';

const LAYERS = ['ground', 'shadow', 'main', 'add', 'ui'];
const L_GROUND = 0, L_SHADOW = 1, L_MAIN = 2, L_ADD = 3, L_UI = 4;
const FLOATS = 5;             // per vertex
const QFLOATS = FLOATS * 4;   // per quad
const STRIDE = FLOATS * 4;    // bytes per vertex
const STEP = 1 / 60;
const TAU = Math.PI * 2;

// Choir colours. A stage may override via stage.palette.choir.
const CHOIR = [
  [1.00, 0.24, 0.36], [1.00, 0.82, 0.25], [0.22, 0.90, 0.69], [0.54, 0.42, 1.00],
  [1.00, 0.48, 0.18], [0.25, 0.82, 1.00], [1.00, 0.31, 0.85], [0.64, 1.00, 0.27],
  [0.95, 0.95, 1.00],
];
const PROJ_KEYS = ['proj.bullet', 'proj.blade', 'proj.saw', 'proj.bell',
                   'proj.candle', 'proj.nail', 'proj.bloom', 'proj.orb'];

// stringPoints is imported dynamically and shared with the sever hit test (D10):
// what you see is exactly what you can cut. Lane B-strings may not have landed
// yet, so the renderer carries its own sag curve until it does.
let stringPoints = null;
import('../sim/strings.js')
  .then((m) => { if (typeof m.stringPoints === 'function') stringPoints = m.stringPoints; })
  .catch(() => {});

export function createRenderer(canvas, viewport) {
  const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    // The headless capture path reads the canvas back after the frame, which is
    // only legal with a preserved drawing buffer (tools/cdp.mjs header).
    preserveDrawingBuffer: Q.has('preserve'),
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  if (!gl) throw new Error('WebGL2 unavailable - NINE STRINGS requires WebGL2 (DECISIONS D1: no Canvas2D fallback)');

  const atlas = buildAtlas();
  const FD = atlas.data;                       // [u0,v0,u1,v1,w,h,ox,oy] per id
  const WHITE = spriteId('white');
  const LINE = spriteId('linegrad');
  const wu0 = (FD[WHITE * 8] + FD[WHITE * 8 + 2]) * 0.5;
  const wv0 = (FD[WHITE * 8 + 1] + FD[WHITE * 8 + 3]) * 0.5;

  // ---- CPU buckets ---------------------------------------------------
  const buckets = LAYERS.map(() => newBucket(2048));
  let cur = buckets[L_MAIN];

  function newBucket(cap) {
    const buf = new ArrayBuffer(cap * QFLOATS * 4);
    return { buf, f: new Float32Array(buf), u: new Uint32Array(buf), n: 0, cap };
  }
  function grow(b, need) {
    let cap = b.cap;
    while (cap < need) cap *= 2;
    const buf = new ArrayBuffer(cap * QFLOATS * 4);
    const f = new Float32Array(buf);
    f.set(b.f.subarray(0, b.n * QFLOATS));
    b.buf = buf; b.f = f; b.u = new Uint32Array(buf); b.cap = cap;
  }

  // ---- GL resources (all rebuilt on context restore) ------------------
  const R = {
    prog: null, vao: null, vbo: null, ibo: null, tex: null, uProj: null,
    vboQuads: 0, iboQuads: 0,
    scene: null, sceneTex: null, bloomA: null, bloomB: null, bloomTexA: null, bloomTexB: null,
    bright: null, blur: null, comp: null, u: {},
    fbw: 0, fbh: 0, bw: 0, bh: 0,
  };

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.bindAttribLocation(p, 1, 'a_uv');
    gl.bindAttribLocation(p, 2, 'a_col');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  function ensureIndices(quads) {
    if (R.iboQuads >= quads) return;
    let n = Math.max(4096, R.iboQuads || 0);
    while (n < quads) n *= 2;
    const idx = new Uint32Array(n * 6);
    for (let i = 0, o = 0, v = 0; i < n; i++, v += 4) {
      idx[o++] = v; idx[o++] = v + 1; idx[o++] = v + 2;
      idx[o++] = v; idx[o++] = v + 2; idx[o++] = v + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    R.iboQuads = n;
  }

  function ensureVbo(quads) {
    if (R.vboQuads >= quads) return;
    let n = Math.max(4096, R.vboQuads || 0);
    while (n < quads) n *= 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, R.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, n * QFLOATS * 4, gl.DYNAMIC_DRAW);
    R.vboQuads = n;
  }

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  function buildTargets() {
    const bw = Math.max(1, viewport.bw | 0), bh = Math.max(1, viewport.bh | 0);
    if (R.bw === bw && R.bh === bh && R.scene) return;
    for (const k of ['scene', 'bloomA', 'bloomB']) if (R[k]) gl.deleteFramebuffer(R[k]);
    for (const k of ['sceneTex', 'bloomTexA', 'bloomTexB']) if (R[k]) gl.deleteTexture(R[k]);
    const s = makeTarget(bw, bh);
    R.scene = s.fb; R.sceneTex = s.tex;
    const fw = Math.max(1, bw >> 2), fh = Math.max(1, bh >> 2);
    const a = makeTarget(fw, fh), b = makeTarget(fw, fh);
    R.bloomA = a.fb; R.bloomTexA = a.tex;
    R.bloomB = b.fb; R.bloomTexB = b.tex;
    R.bw = bw; R.bh = bh; R.fbw = fw; R.fbh = fh;
  }

  function buildGL() {
    R.prog = compile(SPRITE_VS, SPRITE_FS);
    R.uProj = gl.getUniformLocation(R.prog, 'u_proj');
    gl.useProgram(R.prog);
    gl.uniform1i(gl.getUniformLocation(R.prog, 'u_tex'), 0);

    R.vbo = gl.createBuffer();
    R.ibo = gl.createBuffer();
    R.vao = gl.createVertexArray();
    gl.bindVertexArray(R.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    R.vboQuads = 0; R.iboQuads = 0;
    ensureVbo(4096);
    ensureIndices(4096);
    gl.bindVertexArray(null);

    R.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, R.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.texCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    R.bright = compile(FULLSCREEN_VS, BRIGHT_FS);
    R.blur = compile(FULLSCREEN_VS, BLUR_FS);
    R.comp = compile(FULLSCREEN_VS, COMPOSITE_FS);
    R.u = {
      brTex: gl.getUniformLocation(R.bright, 'u_tex'),
      brTexel: gl.getUniformLocation(R.bright, 'u_texel'),
      brThr: gl.getUniformLocation(R.bright, 'u_threshold'),
      blTex: gl.getUniformLocation(R.blur, 'u_tex'),
      blDir: gl.getUniformLocation(R.blur, 'u_dir'),
      cScene: gl.getUniformLocation(R.comp, 'u_scene'),
      cBloom: gl.getUniformLocation(R.comp, 'u_bloom'),
      cAmt: gl.getUniformLocation(R.comp, 'u_bloomAmt'),
      cVig: gl.getUniformLocation(R.comp, 'u_vignette'),
      cChroma: gl.getUniformLocation(R.comp, 'u_chroma'),
      cDesat: gl.getUniformLocation(R.comp, 'u_desat'),
      cFlash: gl.getUniformLocation(R.comp, 'u_flash'),
      cShake: gl.getUniformLocation(R.comp, 'u_shake'),
    };

    R.bw = R.bh = 0;
    buildTargets();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
  }

  buildGL();

  // ---- context loss --------------------------------------------------
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      R.scene = R.bloomA = R.bloomB = null;
      buildGL();
      renderer.lost = false;
    } catch (err) {
      console.error('[renderer] restore failed', err);
    }
  });

  // ---- quad emitters -------------------------------------------------
  let camX = 0, camY = 0, zoom = 1;

  function push(b, x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, c) {
    if (b.n >= b.cap) grow(b, b.n + 1);
    const o = b.n * QFLOATS, f = b.f, u = b.u;
    f[o] = x0; f[o + 1] = y0; f[o + 2] = u0; f[o + 3] = v0; u[o + 4] = c;
    f[o + 5] = x1; f[o + 6] = y1; f[o + 7] = u1; f[o + 8] = v0; u[o + 9] = c;
    f[o + 10] = x2; f[o + 11] = y2; f[o + 12] = u1; f[o + 13] = v1; u[o + 14] = c;
    f[o + 15] = x3; f[o + 16] = y3; f[o + 17] = u0; f[o + 18] = v1; u[o + 19] = c;
    b.n++;
    stats.sprites++;
  }

  const packed = (r, g, b, a) => (
    (Math.min(255, Math.max(0, r * 255)) | 0) |
    ((Math.min(255, Math.max(0, g * 255)) | 0) << 8) |
    ((Math.min(255, Math.max(0, b * 255)) | 0) << 16) |
    ((Math.min(255, Math.max(0, a * 255)) | 0) << 24)
  ) >>> 0;

  function sprite(id, x, y, rot, scale, r, g, b, a) {
    if (a <= 0 || id < 0 || id >= atlas.count) return;
    const o = id * 8;
    const w = FD[o + 4] * scale, h = FD[o + 5] * scale;
    const ox = FD[o + 6] * scale, oy = FD[o + 7] * scale;
    const lx = -ox, ty = -oy, rx = w - ox, by = h - oy;
    const c = packed(r, g, b, a);
    const bk = cur;
    if (rot) {
      const co = Math.cos(rot), si = Math.sin(rot);
      push(bk,
        x + lx * co - ty * si, y + lx * si + ty * co,
        x + rx * co - ty * si, y + rx * si + ty * co,
        x + rx * co - by * si, y + rx * si + by * co,
        x + lx * co - by * si, y + lx * si + by * co,
        FD[o], FD[o + 1], FD[o + 2], FD[o + 3], c);
    } else {
      push(bk, x + lx, y + ty, x + rx, y + ty, x + rx, y + by, x + lx, y + by,
        FD[o], FD[o + 1], FD[o + 2], FD[o + 3], c);
    }
  }

  function quad(x, y, w, h, rot, r, g, b, a) {
    if (a <= 0) return;
    const hw = w * 0.5, hh = h * 0.5, c = packed(r, g, b, a);
    if (rot) {
      const co = Math.cos(rot), si = Math.sin(rot);
      push(cur,
        x - hw * co + hh * si, y - hw * si - hh * co,
        x + hw * co + hh * si, y + hw * si - hh * co,
        x + hw * co - hh * si, y + hw * si + hh * co,
        x - hw * co - hh * si, y - hw * si + hh * co,
        wu0, wv0, wu0, wv0, c);
    } else {
      push(cur, x - hw, y - hh, x + hw, y - hh, x + hw, y + hh, x - hw, y + hh,
        wu0, wv0, wu0, wv0, c);
    }
  }

  // A segment with soft edges: the band texture is sampled ACROSS the width, so
  // a 1px line still reads on a phone because it glows instead of aliasing.
  function seg(x0, y0, x1, y1, w0, w1, c, soft) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (L < 1e-5) return;
    const nx = -dy / L, ny = dx / L;
    const o = (soft ? LINE : WHITE) * 8;
    const u0 = soft ? FD[o] : wu0, u1 = soft ? FD[o + 2] : wu0;
    const v0 = soft ? FD[o + 1] : wv0, v1 = soft ? FD[o + 3] : wv0;
    push(cur,
      x0 + nx * w0, y0 + ny * w0,
      x1 + nx * w1, y1 + ny * w1,
      x1 - nx * w1, y1 - ny * w1,
      x0 - nx * w0, y0 - ny * w0,
      u0, v0, u1, v1, c);
  }

  function line(x0, y0, x1, y1, w, r, g, b, a) {
    if (a <= 0) return;
    const c = packed(r, g, b, a);
    if (cur === buckets[L_ADD]) {
      seg(x0, y0, x1, y1, w * 2.6, w * 2.6, packed(r, g, b, a * 0.22), true);
      seg(x0, y0, x1, y1, w * 1.1, w * 1.1, packed(r, g, b, a * 0.55), true);
    }
    seg(x0, y0, x1, y1, w * 0.5, w * 0.5, c, !(cur === buckets[L_ADD]));
  }

  // The strings. Drawn as a tapered ribbon: a soft wide glow, a mid body and a
  // bright near-white core, so the thread reads as light rather than as a line.
  const PROFILE = (t) => 0.34 + 0.66 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55);

  function curve(pts, n, w, r, g, b, a) {
    if (n < 2 || a <= 0) return;
    const additive = cur === buckets[L_ADD];
    const passes = additive
      ? [[5.0, 0.13, true], [2.1, 0.30, true], [0.85, 1.0, false]]
      : [[1.0, 1.0, true]];
    for (let p = 0; p < passes.length; p++) {
      const [kw, ka, soft] = passes[p];
      const alpha = a * ka;
      if (alpha <= 0.004) continue;
      const col = packed(p === passes.length - 1 && additive ? Math.min(1, r * 0.4 + 0.72) : r,
                         p === passes.length - 1 && additive ? Math.min(1, g * 0.4 + 0.72) : g,
                         p === passes.length - 1 && additive ? Math.min(1, b * 0.4 + 0.72) : b,
                         alpha);
      let px = pts[0], py = pts[1];
      for (let i = 1; i < n; i++) {
        const qx = pts[i * 2], qy = pts[i * 2 + 1];
        const t0 = (i - 1) / (n - 1), t1 = i / (n - 1);
        seg(px, py, qx, qy, w * kw * PROFILE(t0) * 0.5, w * kw * PROFILE(t1) * 0.5, col, soft);
        px = qx; py = qy;
      }
    }
  }

  // ---- text ----------------------------------------------------------
  const FONT = atlas.font;
  const glyphIds = new Int32Array(128);
  for (let c = 32; c <= 126; c++) glyphIds[c] = spriteId('font.' + c);

  function measure(str, size) {
    const k = size / FONT.size;
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      w += (c >= 32 && c <= 126 ? FONT.adv[c] : FONT.adv[32]) * k;
    }
    return w;
  }

  function text(str, x, y, size, r, g, b, a, align) {
    if (a <= 0 || !str) return;
    str = '' + str;
    const k = size / FONT.size;
    let pen = x;
    if (align === 'center') pen -= measure(str, size) * 0.5;
    else if (align === 'right') pen -= measure(str, size);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 32 || c > 126) { pen += FONT.adv[32] * k; continue; }
      if (c !== 32) {
        const id = glyphIds[c], o = id * 8;
        const w = FD[o + 4] * k, h = FD[o + 5] * k;
        const gx = pen - FD[o + 6] * k, gy = y - FD[o + 7] * k;
        push(cur, gx, gy, gx + w, gy, gx + w, gy + h, gx, gy + h,
          FD[o], FD[o + 1], FD[o + 2], FD[o + 3], packed(r, g, b, a));
      }
      pen += FONT.adv[c] * k;
    }
  }

  // ---- frame ---------------------------------------------------------
  const stats = { draws: 0, sprites: 0, ms: 0 };
  let quality = Q.has('quality') ? (+Q.get('quality') | 0) : 2;
  let post = null;                 // js/gfx/postfx.js, if a lane attaches one

  // Mutable post state. camera.js / scenefx.js poke this; the renderer only
  // reads it. Kept on the renderer so there is one obvious owner.
  const fx = { shake: { x: 0, y: 0 }, chroma: 0, desat: 0, bloom: 1, vignette: 0.55, flash: 0, time: 0 };

  // Lane A-fx owns the real post chain. Attach it the moment it exists - the
  // renderer's own composite is only a fallback so the game is never unlit
  // while that lane is mid-build.
  import('./postfx.js')
    .then((m) => { if (typeof m.makePost === 'function') renderer.attachPost(m.makePost(gl, viewport)); })
    .catch(() => {});

  function begin(cx, cy, z) {
    camX = cx || 0; camY = cy || 0; zoom = z || 1;
    for (let i = 0; i < buckets.length; i++) buckets[i].n = 0;
    cur = buckets[L_MAIN];
    stats.draws = 0; stats.sprites = 0;
  }

  function layer(name) {
    const i = LAYERS.indexOf(name);
    cur = buckets[i < 0 ? L_MAIN : i];
  }

  function setProj(ui) {
    const w = Math.max(1, viewport.w), h = Math.max(1, viewport.h);
    if (ui) gl.uniform4f(R.uProj, 2 / w, -2 / h, -w / 2, -h / 2);
    else gl.uniform4f(R.uProj, 2 * zoom / w, -2 * zoom / h, -camX, -camY);
  }

  function end(dt) {
    if (renderer.lost) return;
    const t0 = performance.now();
    fx.time += dt || STEP;
    buildTargets();

    let total = 0;
    for (let i = 0; i < buckets.length; i++) total += buckets[i].n;

    const usePost = quality > 0 || post;
    if (post) {
      post.begin();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? R.scene : null);
      gl.viewport(0, 0, R.bw, R.bh);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (total) {
      ensureVbo(total);
      ensureIndices(total);
      gl.useProgram(R.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R.tex);
      gl.bindVertexArray(R.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.vbo);
      gl.enable(gl.BLEND);

      let q = 0, lastAdd = null, lastUi = null;
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (!b.n) continue;
        gl.bufferSubData(gl.ARRAY_BUFFER, q * QFLOATS * 4, b.f, 0, b.n * QFLOATS);
        const isAdd = i === L_ADD;
        const isUi = i === L_UI;
        if (isAdd !== lastAdd) {
          // premultiplied output, so additive is (ONE, ONE) and normal is over
          if (isAdd) gl.blendFunc(gl.ONE, gl.ONE);
          else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          lastAdd = isAdd;
        }
        if (isUi !== lastUi) { setProj(isUi); lastUi = isUi; }
        gl.drawElements(gl.TRIANGLES, b.n * 6, gl.UNSIGNED_INT, q * 6 * 4);
        stats.draws++;
        q += b.n;
      }
      gl.bindVertexArray(null);
    }

    if (post) {
      try {
        post.end(renderer.postOpts || fx);
      } catch (e) {
        console.error('[renderer] postfx failed, falling back', e);
        post = null;
      }
    } else if (usePost) {
      composite();
    }

    stats.ms = performance.now() - t0;
  }

  function fullscreen() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function composite() {
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    // scenefx mutates ONE opts object in place and hands the renderer the
    // reference (see main.js). `flash` arrives there as a scalar, not a colour.
    const o = renderer.postOpts || fx;
    const bloomAmt = o.bloom === undefined ? 1 : o.bloom;
    const shake = o.shake || fx.shake;
    const chroma = o.chroma || 0;
    const desat = o.desat || 0;
    const vig = o.vignette === undefined ? fx.vignette : o.vignette;
    const fl = o.flash;
    const flA = typeof fl === 'number' ? fl : (fl && fl.length > 3 ? fl[3] : 0);
    const flR = typeof fl === 'number' || !fl ? 1 : fl[0];
    const flG = typeof fl === 'number' || !fl ? 1 : fl[1];
    const flB = typeof fl === 'number' || !fl ? 1 : fl[2];

    const bloomOn = quality > 0 && bloomAmt > 0.01;
    if (bloomOn) {
      gl.useProgram(R.bright);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomA);
      gl.viewport(0, 0, R.fbw, R.fbh);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
      gl.uniform1i(R.u.brTex, 0);
      gl.uniform2f(R.u.brTexel, 1 / R.bw, 1 / R.bh);
      gl.uniform1f(R.u.brThr, quality > 1 ? 0.42 : 0.58);
      fullscreen();

      gl.useProgram(R.blur);
      gl.uniform1i(R.u.blTex, 0);
      const passes = quality > 1 ? 2 : 1;
      for (let p = 0; p < passes; p++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomB);
        gl.bindTexture(gl.TEXTURE_2D, R.bloomTexA);
        gl.uniform2f(R.u.blDir, (1 + p) / R.fbw, 0);
        fullscreen();
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomA);
        gl.bindTexture(gl.TEXTURE_2D, R.bloomTexB);
        gl.uniform2f(R.u.blDir, 0, (1 + p) / R.fbh);
        fullscreen();
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, R.bw, R.bh);
    gl.useProgram(R.comp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
    gl.uniform1i(R.u.cScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomOn ? R.bloomTexA : R.sceneTex);
    gl.uniform1i(R.u.cBloom, 1);
    gl.uniform1f(R.u.cAmt, bloomOn ? (quality > 1 ? 1.15 : 0.8) * bloomAmt : 0);
    gl.uniform1f(R.u.cVig, vig);
    gl.uniform1f(R.u.cChroma, chroma);
    gl.uniform1f(R.u.cDesat, desat);
    gl.uniform4f(R.u.cFlash, flR, flG, flB, flA);
    gl.uniform2f(R.u.cShake, (shake.x || 0) / Math.max(1, viewport.w), -(shake.y || 0) / Math.max(1, viewport.h));
    fullscreen();
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
  }

  // ---- world ---------------------------------------------------------
  const ids = {
    ground: [0, 1, 2, 3].map((i) => spriteId('ground', i)),
    decal: spriteId('decal'), shadow: spriteId('shadow'),
    glow: spriteId('glow'), glowWide: spriteId('glow.wide'), glowTight: spriteId('glow.tight'),
    spark: spriteId('spark'), smoke: spriteId('smoke'), ring: spriteId('ring'),
    cut: spriteId('cut'), trail: spriteId('trail'),
    shard: [spriteId('shard', 0), spriteId('shard', 1), spriteId('shard', 2)],
    heart: spriteId('heart'), chest: spriteId('chest'), coin: spriteId('coin'),
    magnet: spriteId('magnet'), bomb: spriteId('bomb'),
    proj: PROJ_KEYS.map((k) => spriteId(k)),
    projN: PROJ_KEYS.map((k) => frameCount(k)),
  };

  const rigCache = new Map();       // EnemyDef -> { id, n, scale }
  function rigFor(def) {
    let e = rigCache.get(def);
    if (e) return e;
    let key = null;
    if (def) {
      if (frameCount(def.id)) key = def.id;
      else key = spriteKeyForSpec(def.sprite, def.id);
    }
    if (!key || !frameCount(key)) key = 'humanoid.0';
    e = { id: spriteId(key), n: Math.max(1, frameCount(key)) };
    rigCache.set(def, e);
    return e;
  }

  const tmpPts = new Float32Array(32);
  const idmap = new Map();
  const rgb = [1, 1, 1];

  function choirRGB(w, i) {
    const pal = w && w.stage && w.stage.palette && w.stage.palette.choir;
    if (pal && pal.length) {
      const c = pal[((i | 0) % pal.length + pal.length) % pal.length];
      if (c) { rgb[0] = c[0]; rgb[1] = c[1]; rgb[2] = c[2]; return rgb; }
    }
    const c = CHOIR[((i | 0) % CHOIR.length + CHOIR.length) % CHOIR.length];
    rgb[0] = c[0]; rgb[1] = c[1]; rgb[2] = c[2];
    return rgb;
  }

  const ix = (e, a) => e.x - (e.vx || 0) * STEP * (1 - a);
  const iy = (e, a) => e.y - (e.vy || 0) * STEP * (1 - a);

  function drawWorld(w, alpha) {
    if (!w) return;
    const a = alpha === undefined ? 1 : alpha;
    const t = w.time || w.tick / 60;
    const p = w.player;
    const halfW = viewport.w / (2 * zoom), halfH = viewport.h / (2 * zoom);
    const l = camX - halfW, r = camX + halfW, top = camY - halfH, bot = camY + halfH;
    const stage = w.stage;
    const gp = stage && stage.palette ? stage.palette : null;
    const gc = toRGB(gp && gp.ground, 0.075, 0.082, 0.105);
    // Floor the street: a stage palette that says near-black leaves the player
    // standing in a void with no read on distance or speed.
    if (gc[0] + gc[1] + gc[2] < 0.24) { gc[0] = Math.max(gc[0], 0.072); gc[1] = Math.max(gc[1], 0.078); gc[2] = Math.max(gc[2], 0.10); }

    // ---- ground: wet black street, tiled, never repeating at a visible pitch
    layer('ground');
    const T = 64;
    const x0 = Math.floor(l / T), x1 = Math.floor(r / T);
    const y0 = Math.floor(top / T), y1 = Math.floor(bot / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const v = h & 3;
        // Per-tile brightness has to stay inside a few percent. Anything wider
        // and the eye reads the 64-unit grid as a chessboard instead of a street.
        const k = 0.96 + ((h >>> 4) & 15) / 340 + Math.sin(tx * 0.31 + ty * 0.21) * 0.03;
        sprite(ids.ground[v], tx * T + T / 2, ty * T + T / 2, 0, 1.02,
          gc[0] * k, gc[1] * k, gc[2] * k, 1);
        if ((h >>> 9 & 7) === 0) {
          sprite(ids.decal, tx * T + T / 2, ty * T + T / 2, (h >>> 12 & 7) * 0.8, 1.3,
            gc[0] * 1.7, gc[1] * 1.8, gc[2] * 2.1, 0.3);
        }
      }
    }

    // ---- shadows: one flat pass, so bodies sit ON the street
    layer('shadow');
    w.enemies.each((e) => {
      const rr = (e.def && e.def.radius) || 7;
      sprite(ids.shadow, ix(e, a), iy(e, a) + rr * 0.75, 0, rr * 0.065, 0, 0, 0, 0.55);
    });
    w.allies.each((e) => sprite(ids.shadow, ix(e, a), iy(e, a) + 5, 0, 0.55, 0, 0, 0, 0.5));
    w.conductors.each((c) => {
      // a conductor's shadow is far below it and small: that gap IS the hover
      sprite(ids.shadow, c.x, c.y + 6, 0, 0.55, 0, 0, 0, 0.62);
    });
    if (p && p.alive) sprite(ids.shadow, ix(p, a), iy(p, a) + 7, 0, 0.62, 0, 0, 0, 0.6);

    // ---- main: bodies
    layer('main');

    w.pickups.each((k) => {
      const x = ix(k, a), y = iy(k, a) + Math.sin(t * 3 + k.id) * 1.2;
      const kind = k.kind || 'shard';
      if (kind === 'shard') {
        const tier = k.value >= 12 ? 2 : k.value >= 4 ? 1 : 0;
        const cc = tier === 2 ? [0.72, 0.55, 1] : tier === 1 ? [0.35, 0.85, 1] : [0.45, 1, 0.72];
        sprite(ids.shard[tier], x, y, 0, 0.5, cc[0], cc[1], cc[2], 1);
      } else if (kind === 'heart') sprite(ids.heart, x, y, 0, 0.5, 1, 0.3, 0.42, 1);
      else if (kind === 'chest') sprite(ids.chest, x, y, 0, 0.62, 1, 0.85, 0.45, 1);
      else if (kind === 'coin') sprite(ids.coin, x, y, 0, 0.5, 1, 0.82, 0.3, 1);
      else if (kind === 'magnet') sprite(ids.magnet, x, y, 0, 0.5, 0.5, 0.8, 1, 1);
      else if (kind === 'bomb') sprite(ids.bomb, x, y, 0, 0.5, 1, 0.5, 0.3, 1);
    });

    w.enemies.each((e) => {
      const rig = rigFor(e.def);
      const rr = (e.def && e.def.radius) || 7;
      const sc = (rr / 7) * 0.78;
      const x = ix(e, a), y = iy(e, a);
      const limp = (e.limpUntil || 0) > w.tick;
      let fr = 0;
      if (!limp) fr = ((e.anim || 0) | 0) % rig.n;
      let cr = 1, cg = 1, cb = 1;
      if (e.stringId) {
        const c = choirRGB(w, e.choir);
        cr = 0.62 + c[0] * 0.42; cg = 0.62 + c[1] * 0.42; cb = 0.62 + c[2] * 0.42;
      }
      if (limp) { cr = cg = cb = 0.45; }
      sprite(rig.id + fr, x, y - 2 * sc, limp ? (e.id & 1 ? 1.3 : -1.3) : 0, sc, cr, cg, cb, 1);
    });

    w.allies.each((e) => {
      const id = spriteId('player.3');
      sprite(id + (((t * 9) | 0) % 6), ix(e, a), iy(e, a) - 2, 0, 0.72, 0.55, 0.95, 1, 1);
    });

    if (p && p.alive) {
      const key = (w.character && w.character.id && frameCount(w.character.id)) ? w.character.id : 'player.0';
      const base = spriteId(key);
      const n = Math.max(1, frameCount(key));
      const moving = Math.abs(p.vx || 0) + Math.abs(p.vy || 0) > 1;
      const fr = moving ? ((t * 10) | 0) % n : 0;
      const hurt = (p.iframes || 0) > 0 && (w.tick & 2);
      const px = ix(p, a), py = iy(p, a) - 2;

      // A ring of standing light under the player. In a 200-body horde the
      // player's own sprite is one bone-white figure among two hundred
      // bone-white figures, and losing track of yourself is the worst thing
      // that can happen in this genre. The pool sits UNDER the sprite on the
      // additive layer, so it reads as the lamp rather than as a UI marker.
      layer('add');
      const pulse = 0.9 + Math.sin(t * 3.1) * 0.06;
      sprite(ids.glowWide, px, py + 3, 0, 0.62 * pulse, 1, 0.74, 0.34, 0.36);
      sprite(ids.glowTight, px, py + 3, 0, 0.40 * pulse, 1, 0.86, 0.52, 0.5);
      layer('main');

      sprite(base + fr, px, py, 0, 0.88,
        hurt ? 2 : 1.12, hurt ? 0.6 : 1.08, hurt ? 0.6 : 1.02, 1);
    }

    w.projectiles.each((q) => {
      const kind = q.kind;
      let i = 0;
      if (typeof kind === 'number') i = kind % PROJ_KEYS.length;
      else if (typeof kind === 'string') {
        const k = PROJ_KEYS.indexOf('proj.' + kind);
        i = k < 0 ? 0 : k;
      }
      const c = projColour(q);
      const rot = q.rot !== undefined ? q.rot : Math.atan2(q.vy || 0, q.vx || 1);
      const n = ids.projN[i] || 1;
      const fr = n > 1 ? (((t * 24) | 0) % n) : 0;
      sprite(ids.proj[i] + fr, ix(q, a), iy(q, a), rot, (q.scale || 1) * ((q.radius || 4) / 8),
        c[0], c[1], c[2], 1);
    });

    w.conductors.each((c) => {
      const hover = 24 + (c.hover || 0) + Math.sin(t * 1.6 + c.id) * 3;
      const col = choirRGB(w, c.choirColour);
      const base = spriteId('demon.' + (c.id % 4));
      sprite(base + (((t * 5) | 0) % 4), c.x, c.y - hover, 0, 0.8,
        0.7 + col[0] * 0.35, 0.7 + col[1] * 0.35, 0.7 + col[2] * 0.35, 1);
    });

    // ---- add: everything that glows. One bucket, one blend state.
    layer('add');

    // the lamp the player carries - the only warm light in the game
    if (p && p.alive) {
      sprite(ids.glowWide, ix(p, a), iy(p, a), 0, 1.2, 1, 0.72, 0.38, 0.13);
      sprite(ids.glow, ix(p, a), iy(p, a), 0, 0.62, 1, 0.8, 0.5, 0.11);
    }

    w.hazards.each((h) => {
      const col = h.colour || null;
      const cr = col ? col[0] : 1, cg = col ? col[1] : 0.4, cb = col ? col[2] : 0.25;
      const rr = h.r || 10;
      sprite(ids.glow, h.x, h.y, 0, rr / 34, cr, cg, cb, 0.22);
      sprite(ids.ring, h.x, h.y, 0, rr / 58, cr, cg, cb, 0.3 + Math.sin(t * 6 + h.id) * 0.08);
    });

    w.pickups.each((k) => {
      if ((k.kind || 'shard') !== 'shard') return;
      const tier = k.value >= 12 ? 2 : k.value >= 4 ? 1 : 0;
      const cc = tier === 2 ? [0.72, 0.55, 1] : tier === 1 ? [0.35, 0.85, 1] : [0.45, 1, 0.72];
      sprite(ids.glowTight, ix(k, a), iy(k, a), 0, 0.22 + tier * 0.06, cc[0], cc[1], cc[2], 0.5);
    });

    // elite rim: a bright outline is cheaper to read at 40px than any detail
    w.enemies.each((e) => {
      if (!e.elite) return;
      const rig = rigFor(e.def);
      const rr = (e.def && e.def.radius) || 7;
      const sc = (rr / 7) * 0.78;
      const c = choirRGB(w, e.choir);
      const fr = ((e.anim || 0) | 0) % rig.n;
      sprite(rig.id + fr, ix(e, a), iy(e, a) - 2 * sc, 0, sc * 1.1, c[0], c[1], c[2], 0.35);
      sprite(ids.glow, ix(e, a), iy(e, a), 0, rr / 26, c[0], c[1], c[2], 0.16);
    });

    w.projectiles.each((q) => {
      const c = projColour(q);
      sprite(ids.glowTight, ix(q, a), iy(q, a), 0, (q.radius || 4) / 22, c[0], c[1], c[2], 0.45);
    });

    // ---- the strings. The signature visual: drawn from the same curve the
    // sever test uses (D10), so what you can see is what you can cut.
    if (w.strings && w.strings.count) drawStrings(w, a);

    w.conductors.each((c) => {
      const hover = 24 + (c.hover || 0) + Math.sin(t * 1.6 + c.id) * 3;
      const col = choirRGB(w, c.choirColour);
      sprite(ids.glowWide, c.x, c.y - hover, 0, 1.1, col[0], col[1], col[2], 0.22);
      sprite(ids.ring, c.x, c.y - hover, 0, 0.5 + Math.sin(t * 2 + c.id) * 0.04, col[0], col[1], col[2], 0.3);
    });

    if (p && p.alive && (p.iframes || 0) > 0) {
      sprite(ids.ring, ix(p, a), iy(p, a), 0, 0.26, 1, 0.55, 0.5, 0.3);
    }
  }

  const pcol = [1, 0.9, 0.6];
  function projColour(q) {
    const c = q.colour || (q.ownerWeapon && (q.ownerWeapon.colour ||
      (q.ownerWeapon.def && q.ownerWeapon.def.colour)));
    if (c && c.length >= 3) { pcol[0] = c[0]; pcol[1] = c[1]; pcol[2] = c[2]; }
    else { pcol[0] = 1; pcol[1] = 0.92; pcol[2] = 0.66; }
    return pcol;
  }

  function drawStrings(w, a) {
    let built = false;
    w.strings.each((s) => {
      if (!s.alive || s.cut) return;
      let n = 0;
      if (stringPoints) {
        n = stringPoints(s, w, tmpPts) | 0;
      } else {
        if (!built) { buildIdMap(w); built = true; }
        n = sagCurve(s, w, tmpPts, a);
      }
      if (n < 2) return;
      const c = choirRGB(w, s.colour);
      const taut = s.taut || 0;
      curve(tmpPts, n, 1.5 + taut * 1.2, c[0], c[1], c[2], 0.72 + taut * 0.28);
    });
  }

  function buildIdMap(w) {
    idmap.clear();
    w.enemies.each((e) => idmap.set(e.id, e));
    w.conductors.each((c) => idmap.set(c.id, c));
  }

  // Fallback only: a hanging thread with sway, for while Lane B-strings is still
  // building the real (and authoritative) catenary.
  function sagCurve(s, w, out, a) {
    const e = idmap.get(s.enemyId), c = idmap.get(s.conductorId);
    if (!e || !c) return 0;
    const x0 = ix(e, a), y0 = iy(e, a) - 8;
    const x1 = c.x, y1 = c.y - 26;
    const N = 10;
    const sag = 14 * (1 - (s.taut || 0));
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      out[i * 2] = x0 + (x1 - x0) * t + Math.sin(t * 3 + (w.time || 0) * 2 + s.id) * 2.2 * (1 - Math.abs(t * 2 - 1));
      out[i * 2 + 1] = y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * sag;
    }
    return N;
  }

  const tmpc = [0, 0, 0];
  function toRGB(c, dr, dg, db) {
    if (Array.isArray(c) && c.length >= 3) { tmpc[0] = c[0]; tmpc[1] = c[1]; tmpc[2] = c[2]; return tmpc; }
    if (typeof c === 'string' && c[0] === '#' && c.length >= 7) {
      tmpc[0] = parseInt(c.slice(1, 3), 16) / 255;
      tmpc[1] = parseInt(c.slice(3, 5), 16) / 255;
      tmpc[2] = parseInt(c.slice(5, 7), 16) / 255;
      return tmpc;
    }
    tmpc[0] = dr; tmpc[1] = dg; tmpc[2] = db;
    return tmpc;
  }

  // ---- public --------------------------------------------------------
  const renderer = {
    lost: false,
    stats,
    fx,
    atlas,
    ids,
    gl,
    begin, layer, sprite, quad, line, curve, text, end, drawWorld,
    measure,
    spriteId,
    frameCount,
    setQuality(q) {
      quality = Math.max(0, Math.min(2, q | 0));
      if (post && post.setQuality) post.setQuality(quality);
    },
    get quality() { return quality; },
    // Lane A-fx: hand the composite over by calling this with makePost(gl, viewport).
    attachPost(p) { post = p || null; if (post && post.setQuality) post.setQuality(quality); },
    resize() {
      if (renderer.lost) return;
      buildTargets();
      gl.viewport(0, 0, R.bw, R.bh);
      if (post && post.resize) post.resize();
    },
    destroy() {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };

  return renderer;
}
