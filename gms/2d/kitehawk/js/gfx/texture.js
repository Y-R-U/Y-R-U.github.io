/**
 * Texture handles. A handle is `{tex, w, h, id, name}` — pass the handle itself
 * to R.sprite({tex}). Sub-rects are given in source pixels via sx/sy/sw/sh.
 */

let nextId = 1;

export function createTexture(gl, source, opts = {}) {
  const {
    smooth = true,
    repeat = false,
    mips = false,
    premultiply = false,
    flipY = false,
    name = '',
  } = opts;

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);

  let w, h;
  if (source instanceof Uint8Array || source instanceof Uint8ClampedArray) {
    w = opts.width; h = opts.height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      source instanceof Uint8ClampedArray ? new Uint8Array(source.buffer) : source);
  } else {
    w = source.naturalWidth || source.width;
    h = source.naturalHeight || source.height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
  if (mips) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { tex, w, h, id: nextId++, name, gl };
}

export function updateTexture(handle, source) {
  const gl = handle.gl;
  gl.bindTexture(gl.TEXTURE_2D, handle.tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function destroyTexture(handle) {
  if (handle && handle.tex) handle.gl.deleteTexture(handle.tex);
}

/* ---- built-ins ------------------------------------------------------- */

export function makeWhite(gl) {
  const px = new Uint8Array([255, 255, 255, 255]);
  return createTexture(gl, px, { width: 1, height: 1, smooth: false, name: '__white' });
}

/** Soft round blob — the default particle sprite and the workhorse for glows. */
export function makeBlob(gl, size = 64, power = 2.1) {
  const d = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c, dy = (y - c) / c;
      const r = Math.min(1, Math.hypot(dx, dy));
      let a = Math.pow(1 - r, power);
      a += 0.55 * Math.pow(1 - r, 9);
      a = Math.min(1, a);
      const i = (y * size + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  return createTexture(gl, d, { width: size, height: size, name: '__blob' });
}

/** Hard-edged disc with a soft rim — sparks, embers, bullet cores. */
export function makeDisc(gl, size = 64) {
  const d = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot((x - c) / c, (y - c) / c));
      const a = 1 - smooth01(0.62, 1.0, r);
      const i = (y * size + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  return createTexture(gl, d, { width: size, height: size, name: '__disc' });
}

/** Vertical soft streak — smoke wisps, motion trails. */
export function makeStreak(gl, w = 32, h = 96) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ty = y / (h - 1);
    const along = Math.sin(Math.PI * ty);
    for (let x = 0; x < w; x++) {
      const tx = Math.abs((x / (w - 1)) * 2 - 1);
      const a = Math.pow(1 - tx, 1.8) * Math.pow(along, 1.3);
      const i = (y * w + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  return createTexture(gl, d, { width: w, height: h, name: '__streak' });
}

/**
 * Tileable paper tooth, centred on 0.5 so the shader's (g - 0.5) term is
 * unbiased. Two octaves of value noise plus a faint laid-paper streak. This is
 * the runtime stand-in for the painted grain plate; setGrain() takes whichever.
 */
export function makePaper(gl, size = 256, seed = 7) {
  const n = size * size;
  const lo = new Float32Array(n), hi = new Float32Array(n);
  const cellL = 8, cellH = 2;
  const grid = (cell, s) => {
    const g = size / cell;
    const v = new Float32Array((g + 1) * (g + 1));
    for (let j = 0; j <= g; j++) {
      for (let i = 0; i <= g; i++) {
        // wrap the last row/column onto the first so the plate tiles
        v[j * (g + 1) + i] = hash2v((i % g) + s * 131, (j % g) + s * 977);
      }
    }
    return { v, g, cell };
  };
  const samp = (G, x, y) => {
    const fx = x / G.cell, fy = y / G.cell;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const w = G.g + 1;
    const a = G.v[j * w + i], b = G.v[j * w + i + 1];
    const c = G.v[(j + 1) * w + i], d = G.v[(j + 1) * w + i + 1];
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
  };
  const GL = grid(cellL, seed), GH = grid(cellH, seed + 5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      lo[y * size + x] = samp(GL, x, y);
      hi[y * size + x] = samp(GH, x, y);
    }
  }
  const d = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const laid = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 24);
      let v = 0.5 + (lo[i] - 0.5) * 1.05 + (hi[i] - 0.5) * 0.62 + (laid - 0.5) * 0.14;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const o = i * 4;
      const b = Math.round(v * 255);
      d[o] = b; d[o + 1] = b; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  return createTexture(gl, d, { width: size, height: size, repeat: true, name: '__paper' });
}

function hash2v(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/** 256x1 gradient-map LUT from a list of [stop, r, g, b] control points. */
export function makeRamp(gl, stops, name = '__ramp') {
  const d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) { a = stops[k]; b = stops[k + 1]; break; }
    }
    const span = Math.max(1e-6, b[0] - a[0]);
    const u = Math.max(0, Math.min(1, (t - a[0]) / span));
    const o = i * 4;
    d[o] = Math.round((a[1] + (b[1] - a[1]) * u) * 255);
    d[o + 1] = Math.round((a[2] + (b[2] - a[2]) * u) * 255);
    d[o + 2] = Math.round((a[3] + (b[3] - a[3]) * u) * 255);
    d[o + 3] = 255;
  }
  return createTexture(gl, d, { width: 256, height: 1, name });
}

function smooth01(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* ---- loading --------------------------------------------------------- */

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed: ' + url));
    img.src = url;
  });
}

/**
 * Asset registry. Handles textures, atlases (a texture plus a frames map) and
 * plain JSON. Tolerates missing files: a failed entry resolves to null and is
 * reported in `assets.failed`, so a half-finished art pass never hard-crashes
 * the game.
 */
export function createAssets(gl, baseUrl = '') {
  const tex = new Map();
  const json = new Map();
  const atlas = new Map();
  const frameIndex = new Map();   // frame name -> atlas id
  const bandSets = new Map();     // scene id -> band list
  const failed = [];

  const A = {
    failed,
    progress: 1,

    async loadTexture(id, url, opts) {
      try {
        const img = await loadImage(baseUrl + url);
        const t = createTexture(gl, img, { name: id, ...opts });
        tex.set(id, t);
        return t;
      } catch (e) {
        failed.push(id);
        console.warn('[assets]', e.message);
        return null;
      }
    },

    async loadJSON(id, url) {
      try {
        const r = await fetch(baseUrl + url);
        if (!r.ok) throw new Error(r.status + ' ' + url);
        const j = await r.json();
        json.set(id, j);
        return j;
      } catch (e) {
        failed.push(id);
        console.warn('[assets]', e.message);
        return null;
      }
    },

    /** atlas json: {frames: {name: {x,y,w,h}}} — the shape the art tools emit. */
    async loadAtlas(id, pngUrl, jsonUrl, opts) {
      const [t, j] = await Promise.all([
        A.loadTexture(id, pngUrl, opts),
        A.loadJSON(id + ':json', jsonUrl),
      ]);
      if (!t || !j) return null;
      const a = { tex: t, frames: j.frames || j, meta: j.meta || null };
      atlas.set(id, a);
      return a;
    },

    /** list = [{id, type:'texture'|'json'|'atlas', url, json, opts}] */
    async loadAll(list, onProgress) {
      let done = 0;
      A.progress = 0;
      const step = () => { done++; A.progress = done / list.length; if (onProgress) onProgress(A.progress); };
      await Promise.all(list.map(async (e) => {
        if (e.type === 'json') await A.loadJSON(e.id, e.url);
        else if (e.type === 'atlas') await A.loadAtlas(e.id, e.url, e.json, e.opts);
        else await A.loadTexture(e.id, e.url, e.opts);
        step();
      }));
      A.progress = 1;
      return A;
    },

    /**
     * Load the art pipeline's `assets/atlas.json`: {atlases:{id:{image,w,h,frames}},
     * backgrounds:{scene:{bands:[...]}}} and pull in every image it references.
     * Frame names are also indexed globally, so `assets.f('deadtree')` works.
     */
    async loadManifest(url = 'assets/atlas.json', onProgress) {
      const man = await A.loadJSON('__manifest', url);
      if (!man) return null;
      const dir = url.slice(0, url.lastIndexOf('/') + 1);
      const jobs = [];

      for (const id in (man.atlases || {})) {
        const a = man.atlases[id];
        jobs.push(A.loadTexture('atlas:' + id, dir + a.image).then((t) => {
          if (!t) return;
          atlas.set(id, { tex: t, frames: a.frames, meta: a });
          for (const fname in a.frames) {
            if (!frameIndex.has(fname)) frameIndex.set(fname, id);
          }
        }));
      }

      for (const scene in (man.backgrounds || {})) {
        const bands = man.backgrounds[scene].bands || [];
        for (const band of bands) {
          jobs.push(A.loadTexture('bg:' + band.id, dir + band.image, {
            repeat: !!band.tile, mips: true,
          }).then((t) => { band.tex = t; }));
        }
        bandSets.set(scene, bands);
      }

      let done = 0;
      await Promise.all(jobs.map((p) => p.then(() => {
        done++; A.progress = done / jobs.length;
        if (onProgress) onProgress(A.progress);
      })));
      A.manifest = man;
      return man;
    },

    manifest: null,
    /** Parallax bands for a scene id, in back-to-front order, each with `.tex`. */
    bands(scene) { return bandSets.get(scene) || []; },
    scenes() { return [...bandSets.keys()]; },

    get(id) { return tex.get(id) || null; },
    getJSON(id) { return json.get(id) || null; },
    getAtlas(id) { return atlas.get(id) || null; },
    has(id) { return tex.has(id) || json.has(id) || atlas.has(id); },

    /**
     * {tex, sx, sy, sw, sh, ax, ay} ready to spread into R.sprite.
     * `ax/ay` are the art tool's anchor in source pixels (ay is usually the
     * sprite's foot), so world placement is x - (ax - sw/2), y - (ay - sh/2).
     */
    frame(atlasId, frameName) {
      if (frameName === undefined) { frameName = atlasId; atlasId = frameIndex.get(frameName); }
      const a = atlas.get(atlasId);
      if (!a) return null;
      const f = a.frames[frameName];
      if (!f) return null;
      return { tex: a.tex, sx: f.x, sy: f.y, sw: f.w, sh: f.h, ax: f.ax, ay: f.ay };
    },
    /** Shorthand: look a frame up by name across every loaded atlas. */
    f(frameName) { return A.frame(frameName); },
    frameNames(atlasId) {
      const a = atlas.get(atlasId);
      return a ? Object.keys(a.frames) : [];
    },

    /** Register a texture you built yourself (canvas draws, generated art). */
    add(id, handle) { tex.set(id, handle); return handle; },

    /** Rasterise a 2D-canvas draw callback into a texture. */
    fromCanvas(id, w, h, draw, opts) {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const c2d = cv.getContext('2d');
      draw(c2d, w, h);
      const t = createTexture(gl, cv, { name: id, ...opts });
      tex.set(id, t);
      return t;
    },
  };

  return A;
}
