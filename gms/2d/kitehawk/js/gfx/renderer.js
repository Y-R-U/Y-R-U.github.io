import { makeProgram, makeUnitQuad, bindTarget } from './shaders/gl.js';
import { SPRITE_VS, SPRITE_FS, TRI_VS, TRI_FS } from './shaders/sprite.js';
import { createLights } from './lights.js';
import { createPostFX } from './postfx.js';
import { makeWhite, makeBlob, makeDisc, makeStreak, createTexture } from './texture.js';
import { drawRigInto } from './parts.js';

/**
 * RENDER layers are depth, not altitude. CLOUD_FAR / CLOUD_MID / CLOUD_NEAR say
 * how far from the camera a sprite sits; Mud / Belt / Floor / Deck / Lane / Blue
 * say where in the world column it is. The Deck band is drawn with all three
 * cloud layers, and a wisp in CLOUD_NEAR may belong to any band.
 */
export const LAYER = {
  SKY: 0,
  CLOUD_FAR: 1,
  CLOUD_MID: 2,
  HORIZON: 3,
  GROUND_FAR: 4,
  GROUND_MID: 5,
  GROUND: 6,
  ACTORS_BACK: 7,
  TRAILS: 8,
  ACTORS: 9,
  FX: 10,
  CLOUD_NEAR: 11,
  FG_OCCLUDE: 12,
  UI_WORLD: 13,
};
export const LAYER_COUNT = 14;
export const LAYER_NAMES = [
  'SKY', 'CLOUD_FAR', 'CLOUD_MID', 'HORIZON', 'GROUND_FAR', 'GROUND_MID', 'GROUND',
  'ACTORS_BACK', 'TRAILS', 'ACTORS', 'FX', 'CLOUD_NEAR', 'FG_OCCLUDE', 'UI_WORLD',
];

const STRIDE = 16;        // floats per sprite instance
const TRI_STRIDE = 8;     // floats per triangle vertex
const MAX_TEX_PER_CHUNK = 8;

/**
 * Per-layer light response. This table is most of the art direction: distant
 * bands take a fraction of the light and a lot of haze so they read as air,
 * foreground occluders take almost none so they crush toward black.
 *
 * parallaxY > parallax on the cloud and ground bands is the whole point of the
 * two-factor parallax: a band must barely slide sideways (it is far away) but
 * must track altitude almost exactly, or the altitude it claims to occupy is a
 * lie and the six-band ladder stops reading.
 *
 * rampAmt starts at 0 everywhere — a gradient map with no LUT bound would map
 * the world to white. The art phase turns it on per layer with setLayer().
 */
function defaultLayerConfig() {
  const c = [];
  const set = (i, shade, response, haze, parallax, parallaxY, grainAmt, mul) =>
    (c[i] = { shade, response, haze, parallax, parallaxY, rampAmt: 0, grainAmt, mul: mul || [1, 1, 1] });
  //                        shade  resp  haze  px    py    grain
  set(LAYER.SKY, 0.10, 0.06, 0.70, 0.00, 0.06, 0.20);
  set(LAYER.CLOUD_FAR, 0.34, 0.18, 0.52, 0.06, 0.30, 0.25);
  set(LAYER.CLOUD_MID, 0.58, 0.34, 0.38, 0.22, 0.78, 0.25);
  set(LAYER.HORIZON, 0.55, 0.22, 0.48, 0.10, 0.14, 0.25);
  set(LAYER.GROUND_FAR, 0.72, 0.34, 0.32, 0.26, 0.55, 0.25);
  set(LAYER.GROUND_MID, 0.88, 0.62, 0.16, 0.58, 0.82, 0.35);
  set(LAYER.GROUND, 1.00, 0.95, 0.04, 1.00, 1.00, 0.50);
  set(LAYER.ACTORS_BACK, 1.00, 0.95, 0.06, 0.94, 0.94, 1.00);
  set(LAYER.TRAILS, 0.30, 0.90, 0.00, 1.00, 1.00, 0.40);
  set(LAYER.ACTORS, 1.00, 1.10, 0.00, 1.00, 1.00, 1.00);
  set(LAYER.FX, 0.18, 1.00, 0.00, 1.00, 1.00, 0.55);
  set(LAYER.CLOUD_NEAR, 0.44, 0.30, 0.10, 1.35, 1.15, 0.25);
  set(LAYER.FG_OCCLUDE, 1.00, 0.22, 0.00, 1.55, 1.25, 0.60, [0.55, 0.58, 0.68]);
  set(LAYER.UI_WORLD, 0.00, 0.00, 0.00, 1.00, 1.00, 0.00);
  return c;
}

/* ---- streams --------------------------------------------------------- */

function makeQuadStream(gl, quadBuf) {
  const s = {
    data: new Float32Array(STRIDE * 512),
    count: 0,
    chunks: [],
    nchunks: 0,
    buf: gl.createBuffer(),
    vao: gl.createVertexArray(),
    cap: 0,
    pointerBase: -1,
  };
  gl.bindVertexArray(s.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
  const B = STRIDE * 4;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, B, 24); gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, B, 40); gl.vertexAttribDivisor(4, 1);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, B, 56); gl.vertexAttribDivisor(5, 1);
  gl.bindVertexArray(null);
  s.pointerBase = 0;
  return s;
}

/**
 * Instanced draws always start at instance 0, so a chunk that begins partway
 * into the stream has to be reached by re-basing the attribute pointers.
 */
function pointQuadStream(gl, s, base) {
  if (s.pointerBase === base) return;
  const B = STRIDE * 4;
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, base);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, base + 16);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, B, base + 24);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, B, base + 40);
  gl.vertexAttribPointer(5, 2, gl.FLOAT, false, B, base + 56);
  s.pointerBase = base;
}

function makeTriStream(gl) {
  const s = {
    data: new Float32Array(TRI_STRIDE * 512),
    count: 0,
    buf: gl.createBuffer(),
    vao: gl.createVertexArray(),
    cap: 0,
  };
  gl.bindVertexArray(s.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
  const B = TRI_STRIDE * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, 24);
  gl.bindVertexArray(null);
  return s;
}

/* ---------------------------------------------------------------------- */

export async function createRenderer(canvas, opts = {}) {
  // Headless Chrome's Page.captureScreenshot hangs on an animating WebGL canvas,
  // so the capture path is canvas.toDataURL — which needs the drawing buffer kept.
  const preserve = opts.preserveDrawingBuffer ||
    new URLSearchParams(location.search).has('preserve');
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve,
    desynchronized: false,
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.error('[gfx] context lost'); });

  const canFloat = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  gl.getExtension('OES_texture_float_linear');

  const quadBuf = makeUnitQuad(gl);
  const spriteProg = makeProgram(gl, SPRITE_VS, SPRITE_FS, 'sprite');
  const triProg = makeProgram(gl, TRI_VS, TRI_FS, 'tri');

  const white = makeWhite(gl);
  const blob = makeBlob(gl);
  const disc = makeDisc(gl);
  const streak = makeStreak(gl);

  // Sampler units are fixed for the lifetime of the program.
  // 0-7 sprite chunk slots, 8 light buffer, 9 ramp LUT, 10 paper grain.
  spriteProg.use();
  for (let i = 0; i < MAX_TEX_PER_CHUNK; i++) {
    spriteProg.u1i('u_tex' + i, i);
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, white.tex);
  }
  spriteProg.u1i('u_light', 8);
  spriteProg.u1i('u_ramp', 9);
  spriteProg.u1i('u_grain', 10);
  triProg.use();
  triProg.u1i('u_light', 8);
  triProg.u1i('u_ramp', 9);
  triProg.u1i('u_grain', 10);

  const lights = createLights(gl, quadBuf, { float: canFloat, scale: opts.lightScale || 2 });
  const post = createPostFX(gl, quadBuf, { float: canFloat });

  const quadStreams = [];   // [layer][blend]
  const triStreams = [];
  for (let l = 0; l < LAYER_COUNT; l++) {
    quadStreams.push([makeQuadStream(gl, quadBuf), makeQuadStream(gl, quadBuf)]);
    triStreams.push([makeTriStream(gl), makeTriStream(gl)]);
  }

  const layerCfg = defaultLayerConfig();
  const ambient = [0.20, 0.24, 0.34];
  const haze = [0.36, 0.44, 0.58];
  const clearCol = [0.045, 0.055, 0.085];

  let pw = 1, ph = 1, cssW = 1, cssH = 1, dpr = 1;
  let worldH = 1000;
  let camX = 0, camY = 0, zoom = 1, scale = 1;
  let lastNow = performance.now() / 1000;
  let ticked = false;
  let frameTime = 0;

  let rampTex = null;
  let grainTex = null, grainScale = 1 / 256, grainAmount = 0.15;

  const stats = { drawCalls: 0, sprites: 0, tris: 0, lights: 0, streams: 0, frame: 0 };

  /* ---- stream writes -------------------------------------------------- */

  function growQuad(s) {
    const nd = new Float32Array(s.data.length * 2);
    nd.set(s.data);
    s.data = nd;
  }

  function chunkFor(s, texHandle) {
    let c = s.nchunks > 0 ? s.chunks[s.nchunks - 1] : null;
    if (c) {
      for (let i = 0; i < c.ntex; i++) if (c.texs[i] === texHandle) return c.slot = i, c;
      if (c.ntex < MAX_TEX_PER_CHUNK) {
        c.texs[c.ntex] = texHandle;
        c.slot = c.ntex++;
        return c;
      }
    }
    if (s.nchunks >= s.chunks.length) s.chunks.push({ start: 0, count: 0, texs: new Array(MAX_TEX_PER_CHUNK), ntex: 0, slot: 0 });
    c = s.chunks[s.nchunks++];
    c.start = s.count;
    c.count = 0;
    c.ntex = 1;
    c.texs[0] = texHandle;
    c.slot = 0;
    return c;
  }

  function pushSprite(layer, add, tex, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, parallax, parallaxY) {
    const s = quadStreams[layer][add ? 1 : 0];
    if ((s.count + 1) * STRIDE > s.data.length) growQuad(s);
    const c = chunkFor(s, tex);
    const o = s.count * STRIDE;
    const d = s.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot; d[o + 5] = parallax;
    d[o + 6] = u0; d[o + 7] = v0; d[o + 8] = u1; d[o + 9] = v1;
    d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = a;
    d[o + 14] = c.slot; d[o + 15] = parallaxY;
    s.count++;
    c.count++;
    stats.sprites++;
  }

  function pushTriVert(s, x, y, r, g, b, a, px, py) {
    if ((s.count + 1) * TRI_STRIDE > s.data.length) {
      const nd = new Float32Array(s.data.length * 2);
      nd.set(s.data);
      s.data = nd;
    }
    const o = s.count * TRI_STRIDE;
    const d = s.data;
    d[o] = x; d[o + 1] = y;
    d[o + 2] = r; d[o + 3] = g; d[o + 4] = b; d[o + 5] = a;
    d[o + 6] = px; d[o + 7] = py;
    s.count++;
  }

  /* ---- culling -------------------------------------------------------- */

  function visible(x, y, w, h, rot, parallax, parallaxY) {
    const ex = rot !== 0 ? (Math.abs(w) + Math.abs(h)) * 0.5 : Math.abs(w) * 0.5;
    const ey = rot !== 0 ? (Math.abs(w) + Math.abs(h)) * 0.5 : Math.abs(h) * 0.5;
    const dx = (x - camX * parallax) * scale;
    if (dx > pw * 0.5 + ex * scale || dx < -pw * 0.5 - ex * scale) return false;
    const dy = (y - camY * parallaxY) * scale;
    if (dy > ph * 0.5 + ey * scale || dy < -ph * 0.5 - ey * scale) return false;
    return true;
  }

  /* ---- public --------------------------------------------------------- */

  const _uv = { x: 0, y: 0 };
  function screenOf(wx, wy) {
    _uv.x = ((wx - camX) * scale + pw * 0.5) / pw;
    _uv.y = ((wy - camY) * scale + ph * 0.5) / ph;
    return _uv;
  }
  screenOf.scale = 1;

  const pxOf = (layer, o, key) => {
    const cfg = layerCfg[layer];
    if (o && o[key] !== undefined) return o[key];
    return key === 'parallax' ? cfg.parallax : cfg.parallaxY;
  };

  const R = {
    gl, canvas, LAYER, LAYER_NAMES, LAYER_COUNT, stats,
    fx: post.fx,
    lights,
    white, blob, disc, streak,
    hasFloat: canFloat,
    createTexture: (src, o) => createTexture(gl, src, o),

    // LIVE at draw time — art systems may size strokes and cloud detail off zoom.
    get zoom() { return zoom; },
    get scale() { return scale; },
    get worldW() { return pw / scale; },
    get worldH() { return worldH / zoom; },
    get worldHBase() { return worldH; },
    get cam() { return { x: camX, y: camY, zoom }; },
    get pixelW() { return pw; },
    get pixelH() { return ph; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get dpr() { return dpr; },

    /** Fit to HEIGHT. A width fit gives a landscape phone a 23 px aeroplane. */
    resize(w, h, ratio, wH) {
      cssW = w; cssH = h; dpr = ratio || 1;
      if (wH) worldH = wH;
      pw = Math.max(1, Math.round(w * dpr));
      ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      lights.resize(pw, ph);
      post.resize(pw, ph);
    },

    setWorldHeight(h) { worldH = h; },
    setAmbient(r, g, b) { ambient[0] = r; ambient[1] = g; ambient[2] = b; },
    getAmbient() { return ambient; },
    setHaze(r, g, b) { haze[0] = r; haze[1] = g; haze[2] = b; },
    setClearColor(r, g, b) { clearCol[0] = r; clearCol[1] = g; clearCol[2] = b; },
    setLayer(layer, cfg) { Object.assign(layerCfg[layer], cfg); },
    getLayer(layer) { return layerCfg[layer]; },
    setLayerParallax(layer, p, py) {
      layerCfg[layer].parallax = p;
      layerCfg[layer].parallaxY = py === undefined ? p : py;
    },

    /** Per-act 256x1 gradient-map LUT, texture unit 9. Per-layer rampAmt opts in. */
    setRamp(tex) { rampTex = tex || null; },
    getRamp() { return rampTex; },

    /**
     * Screen-space paper tooth, texture unit 10. `scale` is grain texels per
     * DEVICE pixel — screen space, never world space: a grain that tracks the
     * world swims and reads as dirt on the lens.
     */
    setGrain(tex, sc, amount) {
      grainTex = tex || null;
      if (sc !== undefined) grainScale = sc;
      if (amount !== undefined) grainAmount = amount;
    },
    get grainAmount() { return grainAmount; },

    /** Advance real-time effect timers. Call once per rendered frame. */
    tick(dtReal) {
      post.tick(dtReal);
      frameTime += dtReal;
      ticked = true;
    },

    begin(cam) {
      if (!ticked) {
        const now = performance.now() / 1000;
        let dt = now - lastNow;
        if (dt > 0.25) dt = 0.25;
        lastNow = now;
        post.tick(dt);
        frameTime += dt;
      } else {
        lastNow = performance.now() / 1000;
      }

      zoom = (cam && cam.zoom) || 1;
      camX = ((cam && cam.x) || 0) + post.fx.shakeX;
      camY = ((cam && cam.y) || 0) + post.fx.shakeY;
      scale = (ph / worldH) * zoom;
      screenOf.scale = scale;

      for (let l = 0; l < LAYER_COUNT; l++) {
        quadStreams[l][0].count = 0; quadStreams[l][0].nchunks = 0;
        quadStreams[l][1].count = 0; quadStreams[l][1].nchunks = 0;
        triStreams[l][0].count = 0;
        triStreams[l][1].count = 0;
      }
      lights.begin(frameTime);
      stats.drawCalls = 0; stats.sprites = 0; stats.tris = 0; stats.lights = 0; stats.streams = 0;
    },

    /** Positional fast path — no object literal, for particles and swarms. */
    spriteRaw(tex, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, layer, add, parallax, parallaxY) {
      const py = parallaxY === undefined ? parallax : parallaxY;
      if (!visible(x, y, w, h, rot, parallax, py)) return;
      pushSprite(layer, add, tex || white, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, parallax, py);
    },

    sprite(o) {
      const layer = o.layer === undefined ? LAYER.ACTORS : o.layer;
      const tex = o.tex || white;
      const parallax = pxOf(layer, o, 'parallax');
      const parallaxY = pxOf(layer, o, 'parallaxY');
      const rot = o.rot || 0;
      const w = o.w === undefined ? (o.sw || tex.w) : o.w;
      const h = o.h === undefined ? (o.sh || tex.h) : o.h;
      if (!visible(o.x, o.y, w, h, rot, parallax, parallaxY)) return;
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (o.sw !== undefined) {
        const iw = 1 / tex.w, ih = 1 / tex.h;
        u0 = (o.sx || 0) * iw; v0 = (o.sy || 0) * ih;
        u1 = ((o.sx || 0) + o.sw) * iw; v1 = ((o.sy || 0) + o.sh) * ih;
      }
      if (o.flipX) { const t = u0; u0 = u1; u1 = t; }
      if (o.flipY) { const t = v0; v0 = v1; v1 = t; }
      pushSprite(layer, !!o.add, tex, u0, v0, u1, v1, o.x, o.y, w, h, rot,
        o.r === undefined ? 1 : o.r, o.g === undefined ? 1 : o.g,
        o.b === undefined ? 1 : o.b, o.a === undefined ? 1 : o.a, parallax, parallaxY);
    },

    quad(o) {
      const layer = o.layer === undefined ? LAYER.ACTORS : o.layer;
      const parallax = pxOf(layer, o, 'parallax');
      const parallaxY = pxOf(layer, o, 'parallaxY');
      const rot = o.rot || 0;
      if (!visible(o.x, o.y, o.w, o.h, rot, parallax, parallaxY)) return;
      pushSprite(layer, !!o.add, white, 0, 0, 1, 1, o.x, o.y, o.w, o.h, rot,
        o.r === undefined ? 1 : o.r, o.g === undefined ? 1 : o.g,
        o.b === undefined ? 1 : o.b, o.a === undefined ? 1 : o.a, parallax, parallaxY);
    },

    line(x1, y1, x2, y2, thickness, col, layer = LAYER.FX, o) {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-5) return;
      const parallax = pxOf(layer, o, 'parallax');
      const parallaxY = pxOf(layer, o, 'parallaxY');
      const cx = (x1 + x2) * 0.5, cy = (y1 + y2) * 0.5;
      const rot = Math.atan2(dy, dx);
      if (!visible(cx, cy, len, thickness, rot, parallax, parallaxY)) return;
      pushSprite(layer, !!(o && o.add), (o && o.tex) || white, 0, 0, 1, 1,
        cx, cy, len, thickness, rot,
        col.r === undefined ? 1 : col.r, col.g === undefined ? 1 : col.g,
        col.b === undefined ? 1 : col.b, col.a === undefined ? 1 : col.a, parallax, parallaxY);
    },

    /**
     * Polyline of textured quads — smoke trails, prop wash, tracer. A loop over
     * the line path: no new stream, no new shader, batches into the same chunk.
     * `widths` is a number or a per-point array; `taper` fades alpha along the
     * ribbon (1 = fully faded at the tail).
     */
    ribbon(points, widths, col, layer = LAYER.TRAILS, o) {
      const flat = typeof points[0] === 'number';
      const n = flat ? points.length >> 1 : points.length;
      if (n < 2) return;
      const gx = (i) => (flat ? points[i * 2] : points[i].x);
      const gy = (i) => (flat ? points[i * 2 + 1] : points[i].y);
      const wAt = (i) => (typeof widths === 'number' ? widths : widths[Math.min(i, widths.length - 1)]);
      const taper = o && o.taper !== undefined ? o.taper : 0;
      const a0 = col.a === undefined ? 1 : col.a;
      const seg = { r: col.r, g: col.g, b: col.b, a: a0 };
      const tex = (o && o.tex) || streak;
      const opt = _ribbonOpt;
      opt.tex = tex; opt.add = !!(o && o.add);
      opt.parallax = pxOf(layer, o, 'parallax');
      opt.parallaxY = pxOf(layer, o, 'parallaxY');
      for (let i = 0; i < n - 1; i++) {
        const t = n > 2 ? i / (n - 2) : 0;
        seg.a = a0 * (1 - taper * t);
        if (seg.a <= 0.004) continue;
        R.line(gx(i), gy(i), gx(i + 1), gy(i + 1), (wAt(i) + wAt(i + 1)) * 0.5, seg, layer, opt);
      }
    },

    rect(x, y, w, h, thickness, col, layer = LAYER.UI_WORLD) {
      const hw = w * 0.5, hh = h * 0.5;
      R.line(x - hw, y - hh, x + hw, y - hh, thickness, col, layer);
      R.line(x - hw, y + hh, x + hw, y + hh, thickness, col, layer);
      R.line(x - hw, y - hh, x - hw, y + hh, thickness, col, layer);
      R.line(x + hw, y - hh, x + hw, y + hh, thickness, col, layer);
    },

    /** points: flat [x,y,...] or [{x,y},...]. Convex, wound either way. */
    poly(points, col, layer = LAYER.GROUND, o) {
      const flat = typeof points[0] === 'number';
      const n = flat ? points.length >> 1 : points.length;
      if (n < 3) return;
      const add = !!(o && o.add);
      const px = pxOf(layer, o, 'parallax');
      const py = pxOf(layer, o, 'parallaxY');
      const s = triStreams[layer][add ? 1 : 0];
      const r = col.r === undefined ? 1 : col.r, g = col.g === undefined ? 1 : col.g;
      const b = col.b === undefined ? 1 : col.b, a = col.a === undefined ? 1 : col.a;
      const gx = (i) => (flat ? points[i * 2] : points[i].x);
      const gy = (i) => (flat ? points[i * 2 + 1] : points[i].y);
      for (let i = 1; i < n - 1; i++) {
        pushTriVert(s, gx(0), gy(0), r, g, b, a, px, py);
        pushTriVert(s, gx(i), gy(i), r, g, b, a, px, py);
        pushTriVert(s, gx(i + 1), gy(i + 1), r, g, b, a, px, py);
        stats.tris++;
      }
    },

    /** Per-vertex coloured triangle — gradients without a texture. */
    tri(x1, y1, c1, x2, y2, c2, x3, y3, c3, layer = LAYER.GROUND, o) {
      const add = !!(o && o.add);
      const px = pxOf(layer, o, 'parallax');
      const py = pxOf(layer, o, 'parallaxY');
      const s = triStreams[layer][add ? 1 : 0];
      pushTriVert(s, x1, y1, c1[0], c1[1], c1[2], c1[3], px, py);
      pushTriVert(s, x2, y2, c2[0], c2[1], c2[2], c2[3], px, py);
      pushTriVert(s, x3, y3, c3[0], c3[1], c3[2], c3[3], px, py);
      stats.tris++;
    },

    /**
     * Two-stop vertical fill on the tri stream. LOCAL fills only — the sky is
     * skyRamp(), which is evaluated per fragment from world Y.
     */
    gradient(y0, y1, colTop, colBottom, layer = LAYER.SKY, o) {
      const px = pxOf(layer, o, 'parallax');
      const py = pxOf(layer, o, 'parallaxY');
      const half = (pw * 0.5) / scale;
      const x0 = o && o.x0 !== undefined ? o.x0 : camX * px - half - 4;
      const x1 = o && o.x1 !== undefined ? o.x1 : camX * px + half + 4;
      const opt = _gradOpt;
      opt.add = !!(o && o.add); opt.parallax = px; opt.parallaxY = py;
      R.tri(x0, y0, colTop, x1, y0, colTop, x1, y1, colBottom, layer, opt);
      R.tri(x0, y0, colTop, x1, y1, colBottom, x0, y1, colBottom, layer, opt);
    },

    /**
     * The sky gradient: ONE quad spanning the whole column in world space, with
     * the LUT's u coordinate mapped to world Y. Because u is a vertex attribute
     * the ramp is evaluated per fragment from world Y, so it is zoom-proof for
     * free. The forbidden alternative is computing the gradient once per frame
     * from camera Y — that flattens the sky the moment the camera pulls out.
     *
     * The 90-degree rotation is what lets the same 256x1 LUT serve both this and
     * the gradient-map sampler: the quad's local x axis (which carries u) is
     * rotated onto world -Y, so u = 0 lands at y0 and u = 1 at y1.
     */
    skyRamp(y0, y1, rampTexture, layer = LAYER.SKY, o) {
      const tex = rampTexture || rampTex;
      if (!tex) return;
      const px = pxOf(layer, o, 'parallax');
      const py = pxOf(layer, o, 'parallaxY');
      const spanY = y0 - y1;
      if (Math.abs(spanY) < 1e-4) return;
      const half = (pw * 0.5) / scale;
      const wide = (o && o.worldW) || (half * 2 + 8);
      const cx = o && o.x !== undefined ? o.x : camX * px;
      const cy = (y0 + y1) * 0.5;
      const r = o && o.r !== undefined ? o.r : 1;
      const g = o && o.g !== undefined ? o.g : 1;
      const b = o && o.b !== undefined ? o.b : 1;
      const a = o && o.a !== undefined ? o.a : 1;
      pushSprite(layer, !!(o && o.add), tex, 0, 0.5, 1, 0.5,
        cx, cy, spanY, wide, -Math.PI * 0.5, r, g, b, a, px, py);
    },

    /**
     * Horizontally tiling ground band.
     * band = {tex, layer, parallax, parallaxY, worldW, worldH, anchorY, tile, mirror}
     * anchorY is the band's TOP edge in world units.
     */
    backdrop(band, o) {
      const tex = (o && o.tex) || band.tex;
      if (!tex) return;
      const layer = typeof band.layer === 'string' ? LAYER[band.layer] : band.layer;
      const cfg = layerCfg[layer];
      const p = band.parallax === undefined ? cfg.parallax : band.parallax;
      const pY = band.parallaxY === undefined ? cfg.parallaxY : band.parallaxY;
      const W = band.worldW || tex.w;
      const H = band.worldH || tex.h;
      const cy = (band.anchorY === undefined ? -H : band.anchorY) + H * 0.5;
      const r = o && o.r !== undefined ? o.r : 1;
      const g = o && o.g !== undefined ? o.g : 1;
      const b = o && o.b !== undefined ? o.b : 1;
      const a = o && o.a !== undefined ? o.a : 1;
      const half = (pw * 0.5) / scale;
      const left = camX * p - half, right = camX * p + half;
      if (band.tile === false) {
        pushSprite(layer, false, tex, 0, 0, 1, 1, (o && o.x) || 0, cy, W, H, 0, r, g, b, a, p, pY);
        return;
      }
      const i0 = Math.floor(left / W), i1 = Math.floor(right / W);
      for (let i = i0; i <= i1; i++) {
        // `mirror` flips alternate copies, so a tile always meets its neighbour
        // on the edge it already matches and the join cannot show. Only for art
        // with no silhouette in it — do this to a treeline or a ridge and you
        // get a Rorschach axis, which in a tall viewport is instantly visible.
        const flip = band.mirror && ((((i % 2) + 2) % 2) === 1);
        pushSprite(layer, false, tex, flip ? 1 : 0, 0, flip ? 0 : 1, 1, (i + 0.5) * W, cy, W, H, 0, r, g, b, a, p, pY);
      }
    },

    /**
     * Tiles in X and STRETCHES vertically to [y0, y1], with its own parallaxY.
     * This is the sky-column equivalent of backdrop(): a band placed at an
     * altitude rather than anchored to the ground.
     */
    skyBand(band, o) {
      const tex = (o && o.tex) || band.tex;
      if (!tex) return;
      const layer = typeof band.layer === 'string' ? LAYER[band.layer] : band.layer;
      const cfg = layerCfg[layer];
      const p = band.parallax === undefined ? cfg.parallax : band.parallax;
      const pY = band.parallaxY === undefined ? cfg.parallaxY : band.parallaxY;
      const y0 = band.y0, y1 = band.y1;
      const H = Math.abs(y1 - y0);
      const cy = (y0 + y1) * 0.5;
      const W = band.worldW || tex.w;
      const r = o && o.r !== undefined ? o.r : 1;
      const g = o && o.g !== undefined ? o.g : 1;
      const b = o && o.b !== undefined ? o.b : 1;
      const a = o && o.a !== undefined ? o.a : 1;
      if (a <= 0.004 || H < 1e-4) return;
      if (band.tile === false) {
        pushSprite(layer, false, tex, 0, 0, 1, 1, (o && o.x) || 0, cy, W, H, 0, r, g, b, a, p, pY);
        return;
      }
      const half = (pw * 0.5) / scale;
      const left = camX * p - half, right = camX * p + half;
      const i0 = Math.floor(left / W), i1 = Math.floor(right / W);
      for (let i = i0; i <= i1; i++) {
        const flip = band.mirror && ((((i % 2) + 2) % 2) === 1);
        pushSprite(layer, false, tex, flip ? 1 : 0, 0, flip ? 0 : 1, 1, (i + 0.5) * W, cy, W, H, 0, r, g, b, a, p, pY);
      }
    },

    /** Painterly actor part-tree — see gfx/parts.js. */
    drawRig(rig, x, y, rot, sc, lightList, layer, o) {
      drawRigInto(R, rig, x, y, rot, sc, lightList, layer === undefined ? LAYER.ACTORS : layer, o);
    },

    light(o) {
      const p = o.parallax === undefined ? 1 : o.parallax;
      lights.add(o.x, o.y, o.radius,
        o.r === undefined ? 1 : o.r, o.g === undefined ? 1 : o.g, o.b === undefined ? 1 : o.b,
        o.intensity === undefined ? 1 : o.intensity,
        o.flicker || 0, o.squash, o.angle, p,
        o.soft === undefined ? 0 : o.soft,
        o.parallaxY === undefined ? p : o.parallaxY);
      stats.lights = lights.count;
    },

    lightRaw(x, y, radius, r, g, b, intensity, flicker) {
      lights.add(x, y, radius, r, g, b, intensity, flicker || 0, 1, 0, 1, 0, 1);
      stats.lights = lights.count;
    },

    end() {
      const lightTex = lights.render(camX, camY, scale, pw * 0.5, ph * 0.5);
      stats.lights = lights.count;

      bindTarget(gl, post.scene);
      gl.clearColor(clearCol[0] * clearCol[0], clearCol[1] * clearCol[1], clearCol[2] * clearCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);

      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, lightTex);
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, (rampTex || white).tex);
      gl.activeTexture(gl.TEXTURE10);
      gl.bindTexture(gl.TEXTURE_2D, (grainTex || white).tex);

      const halfW = pw * 0.5, halfH = ph * 0.5;
      const gs = grainTex ? grainScale : 0;

      spriteProg.use();
      spriteProg.u2f('u_cam', camX, camY);
      spriteProg.u1f('u_scale', scale);
      spriteProg.u2f('u_halfRes', halfW, halfH);
      spriteProg.u2f('u_invRes', 1 / pw, 1 / ph);
      spriteProg.u3f('u_ambient', ambient[0] * ambient[0], ambient[1] * ambient[1], ambient[2] * ambient[2]);
      spriteProg.u3f('u_haze', haze[0] * haze[0], haze[1] * haze[1], haze[2] * haze[2]);
      spriteProg.u2f('u_grainScale', gs, gs);

      triProg.use();
      triProg.u2f('u_cam', camX, camY);
      triProg.u1f('u_scale', scale);
      triProg.u2f('u_halfRes', halfW, halfH);
      triProg.u2f('u_invRes', 1 / pw, 1 / ph);
      triProg.u3f('u_ambient', ambient[0] * ambient[0], ambient[1] * ambient[1], ambient[2] * ambient[2]);
      triProg.u3f('u_haze', haze[0] * haze[0], haze[1] * haze[1], haze[2] * haze[2]);
      triProg.u2f('u_grainScale', gs, gs);

      for (let l = 0; l < LAYER_COUNT; l++) {
        const cfg = layerCfg[l];
        const rampAmt = rampTex ? cfg.rampAmt : 0;
        for (let blend = 0; blend < 2; blend++) {
          const qs = quadStreams[l][blend];
          const ts = triStreams[l][blend];
          if (qs.count === 0 && ts.count === 0) continue;

          // an additive glow with a full paper tooth chewed out of it reads as
          // dirt, so the additive pass takes a third of the grain
          const grainAmt = grainTex ? cfg.grainAmt * grainAmount * (blend === 1 ? 0.35 : 1) : 0;

          if (blend === 1) gl.blendFunc(gl.ONE, gl.ONE);
          else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

          if (qs.count > 0) {
            spriteProg.use();
            spriteProg.u1f('u_shade', blend === 1 ? Math.min(cfg.shade, 0.25) : cfg.shade);
            spriteProg.u1f('u_response', cfg.response);
            spriteProg.u1f('u_hazeAmt', cfg.haze);
            spriteProg.u3f('u_mul', cfg.mul[0], cfg.mul[1], cfg.mul[2]);
            spriteProg.u1f('u_rampAmt', rampAmt);
            spriteProg.u1f('u_grainAmt', grainAmt);
            gl.bindVertexArray(qs.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, qs.buf);
            const need = qs.count * STRIDE * 4;
            if (need > qs.cap) {
              qs.cap = Math.max(need, 4096);
              gl.bufferData(gl.ARRAY_BUFFER, qs.cap, gl.DYNAMIC_DRAW);
            }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, qs.data, 0, qs.count * STRIDE);
            for (let ci = 0; ci < qs.nchunks; ci++) {
              const c = qs.chunks[ci];
              if (c.count === 0) continue;
              for (let ti = 0; ti < c.ntex; ti++) {
                gl.activeTexture(gl.TEXTURE0 + ti);
                gl.bindTexture(gl.TEXTURE_2D, c.texs[ti].tex);
              }
              pointQuadStream(gl, qs, c.start * STRIDE * 4);
              gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, c.count);
              stats.drawCalls++;
            }
            stats.streams++;
          }

          if (ts.count > 0) {
            triProg.use();
            triProg.u1f('u_shade', blend === 1 ? Math.min(cfg.shade, 0.25) : cfg.shade);
            triProg.u1f('u_response', cfg.response);
            triProg.u1f('u_hazeAmt', cfg.haze);
            triProg.u3f('u_mul', cfg.mul[0], cfg.mul[1], cfg.mul[2]);
            triProg.u1f('u_rampAmt', rampAmt);
            triProg.u1f('u_grainAmt', grainAmt);
            gl.bindVertexArray(ts.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, ts.buf);
            const need = ts.count * TRI_STRIDE * 4;
            if (need > ts.cap) {
              ts.cap = Math.max(need, 4096);
              gl.bufferData(gl.ARRAY_BUFFER, ts.cap, gl.DYNAMIC_DRAW);
            }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, ts.data, 0, ts.count * TRI_STRIDE);
            gl.drawArrays(gl.TRIANGLES, 0, ts.count);
            stats.drawCalls++;
            stats.streams++;
          }
        }
      }

      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      post.run(lightTex, screenOf);
      stats.frame++;
      ticked = false;
    },

    screenOf,
    worldToUV: screenOf,
  };

  // reused option objects — R.line and R.tri are called per ribbon segment and
  // per rig triangle, and the hot loop allocates nothing
  const _ribbonOpt = { tex: null, add: false, parallax: 1, parallaxY: 1 };
  const _gradOpt = { add: false, parallax: 1, parallaxY: 1 };

  return R;
}
