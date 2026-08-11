import { makeProgram, makeUnitQuad, bindTarget } from './shaders/gl.js';
import { SPRITE_VS, SPRITE_FS, TRI_VS, TRI_FS } from './shaders/sprite.js';
import { createLights } from './lights.js';
import { createPostFX } from './postfx.js';
import { makeWhite, makeBlob, makeDisc, makeStreak, createTexture } from './texture.js';

export const LAYER = {
  SKY: 0,
  BG_FAR: 1,
  BG_MID: 2,
  BG_NEAR: 3,
  TERRAIN_BACK: 4,
  ACTORS_BACK: 5,
  TERRAIN: 6,
  ACTORS: 7,
  FX: 8,
  TERRAIN_FRONT: 9,
  FG_OCCLUDE: 10,
  UI_WORLD: 11,
};
export const LAYER_COUNT = 12;
export const LAYER_NAMES = [
  'SKY', 'BG_FAR', 'BG_MID', 'BG_NEAR', 'TERRAIN_BACK', 'ACTORS_BACK',
  'TERRAIN', 'ACTORS', 'FX', 'TERRAIN_FRONT', 'FG_OCCLUDE', 'UI_WORLD',
];

const STRIDE = 16;        // floats per sprite instance
const TRI_STRIDE = 7;     // floats per triangle vertex
const MAX_TEX_PER_CHUNK = 8;

/**
 * Per-layer light response. This table is most of the art direction:
 * distant bands take a fraction of the light and a lot of haze so they read as
 * air, foreground occluders take almost none so they crush toward black.
 */
function defaultLayerConfig() {
  const c = [];
  const set = (i, shade, response, haze, mul) =>
    (c[i] = { shade, response, haze, mul: mul || [1, 1, 1], parallax: 1 });
  set(LAYER.SKY, 0.30, 0.10, 0.55);
  set(LAYER.BG_FAR, 0.62, 0.26, 0.42);
  set(LAYER.BG_MID, 0.80, 0.48, 0.25);
  set(LAYER.BG_NEAR, 0.92, 0.72, 0.12);
  set(LAYER.TERRAIN_BACK, 1.00, 0.88, 0.05);
  set(LAYER.ACTORS_BACK, 1.00, 0.95, 0.03);
  set(LAYER.TERRAIN, 1.00, 1.00, 0.00);
  set(LAYER.ACTORS, 1.00, 1.10, 0.00);
  set(LAYER.FX, 0.18, 1.00, 0.00);
  set(LAYER.TERRAIN_FRONT, 1.00, 0.85, 0.00);
  set(LAYER.FG_OCCLUDE, 1.00, 0.22, 0.00, [0.55, 0.58, 0.68]);
  set(LAYER.UI_WORLD, 0.00, 0.00, 0.00);
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
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, B, 24);
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
  spriteProg.use();
  for (let i = 0; i < MAX_TEX_PER_CHUNK; i++) {
    spriteProg.u1i('u_tex' + i, i);
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, white.tex);
  }
  spriteProg.u1i('u_light', 8);
  triProg.use();
  triProg.u1i('u_light', 8);

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
  let worldW = 1920;
  let camX = 0, camY = 0, zoom = 1, scale = 1;
  let lastNow = performance.now() / 1000;
  let ticked = false;
  let frameTime = 0;

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

  function pushSprite(layer, add, tex, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, parallax) {
    const s = quadStreams[layer][add ? 1 : 0];
    if ((s.count + 1) * STRIDE > s.data.length) growQuad(s);
    const c = chunkFor(s, tex);
    const o = s.count * STRIDE;
    const d = s.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot; d[o + 5] = parallax;
    d[o + 6] = u0; d[o + 7] = v0; d[o + 8] = u1; d[o + 9] = v1;
    d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = a;
    d[o + 14] = c.slot; d[o + 15] = 0;
    s.count++;
    c.count++;
    stats.sprites++;
  }

  function pushTriVert(s, x, y, r, g, b, a, p) {
    if ((s.count + 1) * TRI_STRIDE > s.data.length) {
      const nd = new Float32Array(s.data.length * 2);
      nd.set(s.data);
      s.data = nd;
    }
    const o = s.count * TRI_STRIDE;
    const d = s.data;
    d[o] = x; d[o + 1] = y;
    d[o + 2] = r; d[o + 3] = g; d[o + 4] = b; d[o + 5] = a;
    d[o + 6] = p;
    s.count++;
  }

  /* ---- culling -------------------------------------------------------- */

  function visible(x, y, w, h, rot, parallax) {
    const ex = rot !== 0 ? (Math.abs(w) + Math.abs(h)) * 0.5 : Math.abs(w) * 0.5;
    const ey = rot !== 0 ? (Math.abs(w) + Math.abs(h)) * 0.5 : Math.abs(h) * 0.5;
    const dx = (x - camX * parallax) * scale;
    if (dx > pw * 0.5 + ex * scale || dx < -pw * 0.5 - ex * scale) return false;
    const dy = (y - camY * parallax) * scale;
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

  const R = {
    gl, canvas, LAYER, stats,
    fx: post.fx,
    lights,
    white, blob, disc, streak,
    hasFloat: canFloat,
    createTexture: (src, o) => createTexture(gl, src, o),

    get worldW() { return worldW; },
    get scale() { return scale; },
    get cam() { return { x: camX, y: camY, zoom }; },
    get pixelW() { return pw; },
    get pixelH() { return ph; },

    resize(w, h, ratio, wW) {
      cssW = w; cssH = h; dpr = ratio || 1;
      if (wW) worldW = wW;
      pw = Math.max(1, Math.round(w * dpr));
      ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      lights.resize(pw, ph);
      post.resize(pw, ph);
    },

    setWorldWidth(w) { worldW = w; },
    setAmbient(r, g, b) { ambient[0] = r; ambient[1] = g; ambient[2] = b; },
    getAmbient() { return ambient; },
    setHaze(r, g, b) { haze[0] = r; haze[1] = g; haze[2] = b; },
    setClearColor(r, g, b) { clearCol[0] = r; clearCol[1] = g; clearCol[2] = b; },
    setLayer(layer, cfg) { Object.assign(layerCfg[layer], cfg); },
    getLayer(layer) { return layerCfg[layer]; },
    setLayerParallax(layer, p) { layerCfg[layer].parallax = p; },

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
      scale = (pw / worldW) * zoom;
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
    spriteRaw(tex, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, layer, add, parallax) {
      if (!visible(x, y, w, h, rot, parallax)) return;
      pushSprite(layer, add, tex || white, u0, v0, u1, v1, x, y, w, h, rot, r, g, b, a, parallax);
    },

    sprite(o) {
      const layer = o.layer === undefined ? LAYER.ACTORS : o.layer;
      const tex = o.tex || white;
      const parallax = o.parallax === undefined ? layerCfg[layer].parallax : o.parallax;
      const rot = o.rot || 0;
      const w = o.w === undefined ? (o.sw || tex.w) : o.w;
      const h = o.h === undefined ? (o.sh || tex.h) : o.h;
      if (!visible(o.x, o.y, w, h, rot, parallax)) return;
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
        o.b === undefined ? 1 : o.b, o.a === undefined ? 1 : o.a, parallax);
    },

    quad(o) {
      const layer = o.layer === undefined ? LAYER.ACTORS : o.layer;
      const parallax = o.parallax === undefined ? layerCfg[layer].parallax : o.parallax;
      const rot = o.rot || 0;
      if (!visible(o.x, o.y, o.w, o.h, rot, parallax)) return;
      pushSprite(layer, !!o.add, white, 0, 0, 1, 1, o.x, o.y, o.w, o.h, rot,
        o.r === undefined ? 1 : o.r, o.g === undefined ? 1 : o.g,
        o.b === undefined ? 1 : o.b, o.a === undefined ? 1 : o.a, parallax);
    },

    line(x1, y1, x2, y2, thickness, col, layer = LAYER.FX, o) {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-5) return;
      const parallax = o && o.parallax !== undefined ? o.parallax : layerCfg[layer].parallax;
      const cx = (x1 + x2) * 0.5, cy = (y1 + y2) * 0.5;
      const rot = Math.atan2(dy, dx);
      if (!visible(cx, cy, len, thickness, rot, parallax)) return;
      pushSprite(layer, !!(o && o.add), (o && o.tex) || white, 0, 0, 1, 1,
        cx, cy, len, thickness, rot,
        col.r === undefined ? 1 : col.r, col.g === undefined ? 1 : col.g,
        col.b === undefined ? 1 : col.b, col.a === undefined ? 1 : col.a, parallax);
    },

    rect(x, y, w, h, thickness, col, layer = LAYER.UI_WORLD) {
      const hw = w * 0.5, hh = h * 0.5;
      R.line(x - hw, y - hh, x + hw, y - hh, thickness, col, layer);
      R.line(x - hw, y + hh, x + hw, y + hh, thickness, col, layer);
      R.line(x - hw, y - hh, x - hw, y + hh, thickness, col, layer);
      R.line(x + hw, y - hh, x + hw, y + hh, thickness, col, layer);
    },

    /** points: flat [x,y,...] or [{x,y},...]. Convex, wound either way. */
    poly(points, col, layer = LAYER.TERRAIN, o) {
      const flat = typeof points[0] === 'number';
      const n = flat ? points.length >> 1 : points.length;
      if (n < 3) return;
      const add = !!(o && o.add);
      const parallax = o && o.parallax !== undefined ? o.parallax : layerCfg[layer].parallax;
      const s = triStreams[layer][add ? 1 : 0];
      const r = col.r === undefined ? 1 : col.r, g = col.g === undefined ? 1 : col.g;
      const b = col.b === undefined ? 1 : col.b, a = col.a === undefined ? 1 : col.a;
      const gx = (i) => (flat ? points[i * 2] : points[i].x);
      const gy = (i) => (flat ? points[i * 2 + 1] : points[i].y);
      for (let i = 1; i < n - 1; i++) {
        pushTriVert(s, gx(0), gy(0), r, g, b, a, parallax);
        pushTriVert(s, gx(i), gy(i), r, g, b, a, parallax);
        pushTriVert(s, gx(i + 1), gy(i + 1), r, g, b, a, parallax);
        stats.tris++;
      }
    },

    /** Per-vertex coloured triangle — gradients without a texture. */
    tri(x1, y1, c1, x2, y2, c2, x3, y3, c3, layer = LAYER.TERRAIN, o) {
      const add = !!(o && o.add);
      const parallax = o && o.parallax !== undefined ? o.parallax : layerCfg[layer].parallax;
      const s = triStreams[layer][add ? 1 : 0];
      pushTriVert(s, x1, y1, c1[0], c1[1], c1[2], c1[3], parallax);
      pushTriVert(s, x2, y2, c2[0], c2[1], c2[2], c2[3], parallax);
      pushTriVert(s, x3, y3, c3[0], c3[1], c3[2], c3[3], parallax);
      stats.tris++;
    },

    /**
     * Draw one tiling parallax band from the art manifest.
     * band = {tex, layer:'BG_MID'|number, parallax, worldW, worldH, anchorY, tile}
     * anchorY is the band's TOP edge in world units.
     */
    backdrop(band, o) {
      const tex = (o && o.tex) || band.tex;
      if (!tex) return;
      const layer = typeof band.layer === 'string' ? LAYER[band.layer] : band.layer;
      const p = band.parallax === undefined ? layerCfg[layer].parallax : band.parallax;
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
        pushSprite(layer, false, tex, 0, 0, 1, 1, (o && o.x) || 0, cy, W, H, 0, r, g, b, a, p);
        return;
      }
      const i0 = Math.floor(left / W), i1 = Math.floor(right / W);
      for (let i = i0; i <= i1; i++) {
        // `mirror` flips alternate copies, so a tile always meets its neighbour
        // on the edge it already matches and the join cannot show. Only for art
        // with no silhouette in it — do this to a treeline and you get a
        // Rorschach axis. See the seam covers in sim/index.js for the rest.
        const flip = band.mirror && ((((i % 2) + 2) % 2) === 1);
        pushSprite(layer, false, tex, flip ? 1 : 0, 0, flip ? 0 : 1, 1, (i + 0.5) * W, cy, W, H, 0, r, g, b, a, p);
      }
    },

    light(o) {
      lights.add(o.x, o.y, o.radius,
        o.r === undefined ? 1 : o.r, o.g === undefined ? 1 : o.g, o.b === undefined ? 1 : o.b,
        o.intensity === undefined ? 1 : o.intensity,
        o.flicker || 0, o.squash, o.angle,
        o.parallax === undefined ? 1 : o.parallax,
        o.soft === undefined ? 0 : o.soft);
      stats.lights = lights.count;
    },

    lightRaw(x, y, radius, r, g, b, intensity, flicker) {
      lights.add(x, y, radius, r, g, b, intensity, flicker || 0, 1, 0, 1, 0);
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

      const halfW = pw * 0.5, halfH = ph * 0.5;

      spriteProg.use();
      spriteProg.u2f('u_cam', camX, camY);
      spriteProg.u1f('u_scale', scale);
      spriteProg.u2f('u_halfRes', halfW, halfH);
      spriteProg.u2f('u_invRes', 1 / pw, 1 / ph);
      spriteProg.u3f('u_ambient', ambient[0] * ambient[0], ambient[1] * ambient[1], ambient[2] * ambient[2]);
      spriteProg.u3f('u_haze', haze[0] * haze[0], haze[1] * haze[1], haze[2] * haze[2]);

      triProg.use();
      triProg.u2f('u_cam', camX, camY);
      triProg.u1f('u_scale', scale);
      triProg.u2f('u_halfRes', halfW, halfH);
      triProg.u2f('u_invRes', 1 / pw, 1 / ph);
      triProg.u3f('u_ambient', ambient[0] * ambient[0], ambient[1] * ambient[1], ambient[2] * ambient[2]);
      triProg.u3f('u_haze', haze[0] * haze[0], haze[1] * haze[1], haze[2] * haze[2]);

      for (let l = 0; l < LAYER_COUNT; l++) {
        const cfg = layerCfg[l];
        for (let blend = 0; blend < 2; blend++) {
          const qs = quadStreams[l][blend];
          const ts = triStreams[l][blend];
          if (qs.count === 0 && ts.count === 0) continue;

          if (blend === 1) gl.blendFunc(gl.ONE, gl.ONE);
          else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

          if (qs.count > 0) {
            spriteProg.use();
            spriteProg.u1f('u_shade', blend === 1 ? Math.min(cfg.shade, 0.25) : cfg.shade);
            spriteProg.u1f('u_response', cfg.response);
            spriteProg.u1f('u_hazeAmt', cfg.haze);
            spriteProg.u3f('u_mul', cfg.mul[0], cfg.mul[1], cfg.mul[2]);
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

  return R;
}
