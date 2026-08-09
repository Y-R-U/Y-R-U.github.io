import { MATERIAL, MAT, DAMAGE, dmgType, resistOf } from './materials.js';
import { loadImage } from '../gfx/texture.js';

/**
 * Chunk-based destructible terrain.
 *
 * One byte of material + one byte of hp + one byte of flags + one byte of char
 * per 16px cell. Chunks cache a flat draw list and rebuild only when a cell in
 * them changes, so a static frame costs a walk over ~8 Float32Arrays and a
 * blast costs one chunk rebuild per chunk touched.
 *
 * The silhouette problem: a raw cell grid reads as Terraria, and this game is
 * meant to read as painted. The fix is two passes — run-merged body quads for
 * the mass, then a soft "cap" blob on every cell with an exposed face, which
 * dissolves the staircase into a lumpy edge without any marching-squares
 * machinery that destruction would then have to re-run.
 *
 * The mass itself is UV-tiled with the authored `wall_<kind>` cliff-face art
 * from `atlases.terrain`, which is what stops the sub-ground reading as a void.
 */

export const CELL = 16;
export const CHUNK = 32;              // cells per chunk side => 512 world px
export const EMPTY = 255;

export const FLAG = {
  ONEWAY: 1,
  GRASS: 2,
  NOBREAK: 4,
};

// x y w h r g b a u0 v0 u1 v1 mat
const BODY_STRIDE = 13;
const CAP_STRIDE = 9;

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const num = (k, d) => (Q.has(k) && Number.isFinite(+Q.get(k)) ? +Q.get(k) : d);

/**
 * Which authored cliff-face tile carries each terrain material. The three
 * frames exist in `atlases.terrain` and nothing used them before.
 */
const WALL_FRAME = [];
WALL_FRAME[MATERIAL.MASONRY] = 'wall_stone';
WALL_FRAME[MATERIAL.ROCK] = 'wall_rock';
WALL_FRAME[MATERIAL.EARTH] = 'wall_forest';

/**
 * World px covered by one tile repeat, per material. Under the authored 256 for
 * the natural kinds: the wall_rock motif is big angular facets, and at 256+ the
 * eye reads them as repeating shapes, while shrunk they read as fractured stone.
 * Masonry has to stay at 256 or the brick courses stop being brick-sized.
 */
const WALL_SPAN = [];
WALL_SPAN[MATERIAL.MASONRY] = 256;    // brick courses must stay at authored scale
WALL_SPAN[MATERIAL.ROCK] = num('wsr', 224);
WALL_SPAN[MATERIAL.EARTH] = num('wse', 208);

/**
 * The wall frames are sub-rects of a packed 2048x3724 page, so GL REPEAT cannot
 * be had in place. Blitting each 256px tile out into its own power-of-two
 * texture is a one-off cost of three small textures and buys UV tiling on the
 * existing run-merged quads — no extra draw data at all, which the alternative
 * (a textured quad per 16px cell) would have cost thousands of sprites a frame.
 *
 * The blit also normalises exposure. A2b baked a key light into every asset and
 * these tiles ship at ~0.06 mean albedo, five times darker than the flat colour
 * they replace; drawn as-authored they would make the void worse, not better.
 * Scaling each tile so its mean luminance matches the material's `body` colour
 * keeps every downstream number (the depth ramp, TERRAIN response, the moon
 * lights) meaning what it meant before, and derives the gain from the pixels so
 * it survives an art rebuild.
 */
/*
 * Exposure was 0.72/1.50/0.55 when the texturing first landed, and a blind critic
 * on the in-engine frame found the result had overshot: the sub-ground had become
 * the brightest, highest-contrast surface on screen and was pulling the eye down
 * off the play plane. Sub-ground is an occluder — it must read as rock without
 * competing with the lit band the player fights on. Dropped until the braziers
 * and the fence line are unambiguously the brightest thing in frame.
 */
const WALL_EXPOSURE = num('wexp', 0.40);
const WALL_CONTRAST = num('wcon', 1.20);
const RAMP_FLOOR = num('wfloor', 0.30);
const RAMP_LIP = num('wlip', 1.30);
const RAMP_DEPTH = 24;                // cells the depth-darkening ramp spans

/**
 * Tiles per tile of depth that the sampling window slides sideways. Without it
 * the tile's brightest facet lands at the same screen height on every repeat
 * and the mass reads as wallpaper; shearing the lookup is one add per quad,
 * stays seamless because the tile is seamless in x, and the leaning strata it
 * produces read as bedding.
 */
const WALL_SHEAR = num('wshear', 0.35);

let wallPromise = null;

function buildWallTextures(assets) {
  if (Q.has('flatground')) return null;   // A/B against the untextured mass
  if (wallPromise) return wallPromise;
  const man = assets && assets.manifest;
  const page = man && man.atlases && man.atlases.terrain;
  if (!page) return null;

  wallPromise = loadImage('assets/' + page.image).then((img) => {
    const out = [];
    for (let m = 0; m < WALL_FRAME.length; m++) {
      const name = WALL_FRAME[m];
      if (!name) continue;
      const f = page.frames[name];
      if (!f) continue;
      // The mass must sit below the misty backdrop in value or it stops reading
      // as ground; matching MAT.body outright made it the brightest thing in
      // frame, so aim at a fraction of it.
      const target = (MAT[m].body[0] * 0.3 + MAT[m].body[1] * 0.6 + MAT[m].body[2] * 0.1) * WALL_EXPOSURE;
      out[m] = assets.fromCanvas('wallrep:' + name, f.w, f.h, (c2d, w, h) => {
        c2d.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, w, h);
        const d = c2d.getImageData(0, 0, w, h);
        const p = d.data;
        let lum = 0;
        for (let i = 0; i < p.length; i += 4) lum += p[i] * 0.3 + p[i + 1] * 0.6 + p[i + 2] * 0.1;
        lum /= (p.length / 4) * 255;
        const gain = lum > 0.002 ? Math.min(9, target / lum) : 1;
        // Expand contrast about the new mean. Scaling a 0.06-albedo tile up by
        // 4x lifts its crevices as much as its highlights and the result is a
        // flat wash; the crack and course detail is the entire point.
        const pivot = target * 255;
        for (let i = 0; i < 3; i++) {
          for (let j = i; j < p.length; j += 4) {
            p[j] = Math.max(0, Math.min(255, pivot + (p[j] * gain - pivot) * WALL_CONTRAST));
          }
        }
        for (let i = 3; i < p.length; i += 4) p[i] = 255;
        c2d.putImageData(d, 0, 0);
      }, { repeat: true, mips: true });
    }
    return out;
  }).catch((e) => {
    console.warn('[terrain] wall tiles unavailable —', e.message);
    return [];
  });
  return wallPromise;
}

function hash2i(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createTerrain(world, opts = {}) {
  const x0 = opts.x0 === undefined ? -1024 : opts.x0;
  const y0 = opts.y0 === undefined ? -2560 : opts.y0;
  const cols = opts.cols || 768;
  const rows = opts.rows || 224;
  const n = cols * rows;

  const mat = new Uint8Array(n).fill(EMPTY);
  const hp = new Uint8Array(n);
  const flag = new Uint8Array(n);
  const char = new Uint8Array(n);

  // resolved once the wall tiles finish blitting; until then the mass draws
  // exactly as it did before, so a slow load degrades rather than flashing
  let wallTex = null;

  const cCols = Math.ceil(cols / CHUNK);
  const cRows = Math.ceil(rows / CHUNK);
  const chunks = new Array(cCols * cRows);
  for (let i = 0; i < chunks.length; i++) {
    chunks[i] = { dirty: true, body: new Float32Array(256 * BODY_STRIDE), bn: 0, cap: new Float32Array(128 * CAP_STRIDE), cn: 0, any: false };
  }

  const idx = (cx, cy) => cy * cols + cx;
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;

  function baseHp(m) { return Math.max(6, Math.min(250, Math.round(MAT[m].hardness * 42))); }

  function dirtyAround(cx, cy) {
    const c0 = ((cx - 1) / CHUNK) | 0, c1 = ((cx + 1) / CHUNK) | 0;
    const r0 = ((cy - 1) / CHUNK) | 0, r1 = ((cy + 1) / CHUNK) | 0;
    for (let r = Math.max(0, r0); r <= Math.min(cRows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(cCols - 1, c1); c++) chunks[r * cCols + c].dirty = true;
    }
  }

  const T = {
    cell: CELL, cols, rows, x0, y0,
    minX: x0, minY: y0, maxX: x0 + cols * CELL, maxY: y0 + rows * CELL,
    mat, hp, flag, char,

    toCellX(wx) { return Math.floor((wx - x0) / CELL); },
    toCellY(wy) { return Math.floor((wy - y0) / CELL); },
    cellLeft(cx) { return x0 + cx * CELL; },
    cellTop(cy) { return y0 + cy * CELL; },
    cellCX(cx) { return x0 + cx * CELL + CELL * 0.5; },
    cellCY(cy) { return y0 + cy * CELL + CELL * 0.5; },
    inside,

    /** Full solid: blocks in every direction. One-way platforms are excluded. */
    solid(cx, cy) {
      if (!inside(cx, cy)) return cy >= rows;      // below the grid is bedrock
      const i = cy * cols + cx;
      return mat[i] !== EMPTY && (flag[i] & FLAG.ONEWAY) === 0;
    },
    /** Anything at all, including one-way platforms — what particles want. */
    filled(cx, cy) {
      if (!inside(cx, cy)) return cy >= rows;
      return mat[cy * cols + cx] !== EMPTY;
    },
    oneWay(cx, cy) {
      if (!inside(cx, cy)) return false;
      const i = cy * cols + cx;
      return mat[i] !== EMPTY && (flag[i] & FLAG.ONEWAY) !== 0;
    },
    matAt(cx, cy) {
      if (!inside(cx, cy)) return MATERIAL.ROCK;
      const m = mat[cy * cols + cx];
      return m === EMPTY ? -1 : m;
    },

    solidAtWorld(wx, wy) { return T.solid(T.toCellX(wx), T.toCellY(wy)); },
    materialAtWorld(wx, wy) { return T.matAt(T.toCellX(wx), T.toCellY(wy)); },

    /* ------------------------------------------------------------ *
     * Authoring
     * ------------------------------------------------------------ */

    set(cx, cy, m, fl) {
      if (!inside(cx, cy)) return;
      const i = cy * cols + cx;
      mat[i] = m;
      hp[i] = m === EMPTY ? 0 : baseHp(m);
      flag[i] = fl || 0;
      char[i] = 0;
      dirtyAround(cx, cy);
    },

    /** top-left anchored world rect */
    box(x, y, w, h, m, fl) {
      const a = T.toCellX(x), b = T.toCellY(y);
      const c = T.toCellX(x + w - 0.001), d = T.toCellY(y + h - 0.001);
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) T.set(cx, cy, m, fl);
    },

    platform(x, y, w, h, m, o) {
      T.box(x, y, w, h, m, (o && o.oneWay) ? FLAG.ONEWAY : 0);
    },

    circle(x, y, r, m) {
      const a = T.toCellX(x - r), c = T.toCellX(x + r);
      const b = T.toCellY(y - r), d = T.toCellY(y + r);
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) {
        const dx = T.cellCX(cx) - x, dy = T.cellCY(cy) - y;
        if (dx * dx + dy * dy <= r * r) T.set(cx, cy, m);
      }
    },

    /** fn(worldX) -> surface Y. Fills from the surface down to `depth` below it. */
    hill(xa, xb, fn, m, depth = 900, crust = MATERIAL.EARTH, crustDepth = 34) {
      const a = T.toCellX(xa), b = T.toCellX(xb);
      for (let cx = a; cx <= b; cx++) {
        const sx = T.cellCX(cx);
        const sy = fn(sx);
        const top = T.toCellY(sy), bot = T.toCellY(sy + depth);
        // Jitter the crust/bedrock interface. Dead flat it draws a ruled line
        // right across the frame once the two materials carry different tiles.
        const cd = crustDepth * (0.70 + hash2i(cx >> 2, 91) * 0.32 + hash2i(cx >> 4, 37) * 0.32);
        for (let cy = top; cy <= bot; cy++) {
          const dep = (T.cellCY(cy) - sy);
          const mm = dep < cd ? crust : m;
          T.set(cx, cy, mm, dep < CELL ? FLAG.GRASS : 0);
        }
      }
    },

    /* ------------------------------------------------------------ *
     * Destruction
     * ------------------------------------------------------------ */

    /** Unconditional hole. No hp check, no debris. */
    carve(x, y, r) {
      const a = T.toCellX(x - r), c = T.toCellX(x + r);
      const b = T.toCellY(y - r), d = T.toCellY(y + r);
      let killed = 0;
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) {
        if (!inside(cx, cy)) continue;
        const i = cy * cols + cx;
        if (mat[i] === EMPTY || (flag[i] & FLAG.NOBREAK)) continue;
        const dx = T.cellCX(cx) - x, dy = T.cellCY(cy) - y;
        if (dx * dx + dy * dy > r * r) continue;
        mat[i] = EMPTY; hp[i] = 0; flag[i] = 0; char[i] = 0;
        killed++;
      }
      if (killed) { markRegion(a, b, c, d); world.onTerrainChanged(x, y, r); }
      return killed;
    },

    fill(x, y, r, m) {
      const a = T.toCellX(x - r), c = T.toCellX(x + r);
      const b = T.toCellY(y - r), d = T.toCellY(y + r);
      let added = 0;
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) {
        if (!inside(cx, cy)) continue;
        const i = cy * cols + cx;
        if (mat[i] !== EMPTY) continue;
        const dx = T.cellCX(cx) - x, dy = T.cellCY(cy) - y;
        if (dx * dx + dy * dy > r * r) continue;
        mat[i] = m; hp[i] = baseHp(m); flag[i] = 0; char[i] = 0;
        added++;
      }
      if (added) { markRegion(a, b, c, d); world.onTerrainChanged(x, y, r); }
      return added;
    },

    /**
     * The real one. Chews an irregular hole, spawns material-correct debris and
     * dust, and tells the world so the support graph can be re-solved.
     */
    damage(x, y, r, amount, type, o) {
      const dt2 = dmgType(type);
      const jitter = o && o.jitter !== undefined ? o.jitter : 1;
      const wantDebris = o && o.debris !== undefined ? o.debris : 1;
      const wantDust = o && o.dust !== undefined ? o.dust : 1;
      const a = T.toCellX(x - r - CELL), c = T.toCellX(x + r + CELL);
      const b = T.toCellY(y - r - CELL), d = T.toCellY(y + r + CELL);
      let killed = 0, hitMat = -1, cracked = 0;
      const r2 = r * r;

      for (let cy = b; cy <= d; cy++) {
        for (let cx = a; cx <= c; cx++) {
          if (!inside(cx, cy)) continue;
          const i = cy * cols + cx;
          const m = mat[i];
          if (m === EMPTY || (flag[i] & FLAG.NOBREAK)) continue;
          const ccx = T.cellCX(cx), ccy = T.cellCY(cy);
          const dx = ccx - x, dy = ccy - y;
          const d2 = dx * dx + dy * dy;
          const wobble = 1 + (hash2i(cx, cy) - 0.5) * 0.55 * jitter;
          if (d2 > r2 * wobble) continue;

          const res = resistOf(m, dt2);
          if (res <= 0) continue;
          const fall = 1 - Math.sqrt(d2) / (r * 1.35);
          let dmg = amount * res * Math.max(0.15, fall);
          if (dt2 === DAMAGE.IMPACT && amount < MAT[m].minDamage) continue;
          if (dt2 === DAMAGE.FIRE) char[i] = Math.min(255, char[i] + dmg * 3);

          if (hp[i] > dmg) { hp[i] -= dmg; cracked++; hitMat = m; continue; }
          hitMat = m;
          mat[i] = EMPTY; hp[i] = 0; flag[i] = 0; char[i] = 0;
          killed++;
          if (wantDebris && killed % 3 === 1 && world.debris) {
            const sp = 40 + Math.sqrt(d2) * 0.6;
            const ang = Math.atan2(dy, dx) + (hash2i(cy, cx) - 0.5) * 1.2;
            world.debris.spawn({
              x: ccx, y: ccy, material: m,
              vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120,
              scale: 0.5 + hash2i(cx, cy + 7) * 0.45,
              spin: (hash2i(cx + 3, cy) - 0.5) * 14,
            });
          }
        }
      }

      if (killed || cracked) markRegion(a, b, c, d);
      if (killed) {
        if (wantDust) world.materialFx(hitMat, x, y, 0, -1, Math.min(2.2, 0.5 + killed * 0.05));
        world.onTerrainChanged(x, y, r);
        world.bus.emit('terrain:break', { x, y, radius: r, material: hitMat, cells: killed, type: dt2 });
        world.sfx(MAT[hitMat].sfx.break, x, y);
      } else if (cracked && hitMat >= 0) {
        world.sfx(MAT[hitMat].sfx.crack, x, y);
      }
      return killed;
    },

    scorch(x, y, r, amount) {
      const a = T.toCellX(x - r), c = T.toCellX(x + r);
      const b = T.toCellY(y - r), d = T.toCellY(y + r);
      let any = 0;
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) {
        if (!inside(cx, cy)) continue;
        const i = cy * cols + cx;
        if (mat[i] === EMPTY) continue;
        const dx = T.cellCX(cx) - x, dy = T.cellCY(cy) - y;
        if (dx * dx + dy * dy > r * r) continue;
        const nv = Math.min(255, char[i] + amount * 255);
        if (nv !== char[i]) { char[i] = nv; any = 1; }
      }
      if (any) markRegion(a, b, c, d);
    },

    /** Fuel burn-down: fire eats cell hp, and when it runs out the cell goes. */
    burnCell(cx, cy, amount) {
      if (!inside(cx, cy)) return false;
      const i = cy * cols + cx;
      const m = mat[i];
      if (m === EMPTY || !MAT[m].flammable) return false;
      char[i] = Math.min(255, char[i] + amount * 60);
      hp[i] -= amount * MAT[m].flammable * 6;
      if (hp[i] <= 0) {
        mat[i] = EMPTY; hp[i] = 0; flag[i] = 0; char[i] = 0;
        dirtyAround(cx, cy);
        world.onTerrainChanged(T.cellCX(cx), T.cellCY(cy), CELL);
        return true;
      }
      dirtyAround(cx, cy);
      return false;
    },

    /* ------------------------------------------------------------ *
     * Sampling helpers used by physics and AI
     * ------------------------------------------------------------ */

    solidBox(x, y, w, h) {
      const a = T.toCellX(x - w * 0.5), c = T.toCellX(x + w * 0.5 - 0.001);
      const b = T.toCellY(y - h * 0.5), d = T.toCellY(y + h * 0.5 - 0.001);
      for (let cy = b; cy <= d; cy++) for (let cx = a; cx <= c; cx++) if (T.solid(cx, cy)) return true;
      return false;
    },

    groundY(x, fromY, maxDist = 4000) {
      const cx = T.toCellX(x);
      let cy = T.toCellY(fromY);
      const end = T.toCellY(fromY + maxDist);
      for (; cy <= end; cy++) {
        if (T.solid(cx, cy) || T.oneWay(cx, cy)) return T.cellTop(cy);
        if (cy > rows) break;
      }
      return NaN;
    },

    ceilingY(x, fromY, maxDist = 4000) {
      const cx = T.toCellX(x);
      let cy = T.toCellY(fromY);
      const end = T.toCellY(fromY - maxDist);
      for (; cy >= end; cy--) if (T.solid(cx, cy)) return T.cellTop(cy) + CELL;
      return NaN;
    },

    /** DDA-ish stepped ray. `step` px. Returns t (0..1) or -1. */
    ray(x0, y0, x1, y1, step = 6) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) return T.solidAtWorld(x0, y0) ? 0 : -1;
      const steps = Math.max(1, Math.ceil(len / step));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (T.solidAtWorld(x0 + dx * t, y0 + dy * t)) return t;
      }
      return -1;
    },

    /* ------------------------------------------------------------ *
     * Rendering
     * ------------------------------------------------------------ */

    buildChunk(ci) {
      const ch = chunks[ci];
      const cx0 = (ci % cCols) * CHUNK, cy0 = ((ci / cCols) | 0) * CHUNK;
      const cx1 = Math.min(cols, cx0 + CHUNK), cy1 = Math.min(rows, cy0 + CHUNK);
      let bn = 0, cn = 0;
      let body = ch.body, cap = ch.cap;

      /**
       * UVs come from the *drawn* rect, not the cell rect: the quads are 1.5px
       * oversized to hide seams, and mapping 0..1 across the cell instead would
       * shear the tile by 9% on every row.
       */
      const pushBody = (x, y, w, h, r, g, b, a, m) => {
        if ((bn + 1) * BODY_STRIDE > body.length) {
          const nb = new Float32Array(body.length * 2); nb.set(body); body = ch.body = nb;
        }
        const o = bn * BODY_STRIDE;
        body[o] = x; body[o + 1] = y; body[o + 2] = w; body[o + 3] = h;
        body[o + 4] = r; body[o + 5] = g; body[o + 6] = b; body[o + 7] = a;
        const span = WALL_SPAN[m];
        if (span) {
          const iw = 1 / span;
          const sh = y * iw * WALL_SHEAR;
          body[o + 8] = (x - w * 0.5) * iw + sh; body[o + 9] = (y - h * 0.5) * iw;
          body[o + 10] = (x + w * 0.5) * iw + sh; body[o + 11] = (y + h * 0.5) * iw;
          body[o + 12] = m;
        } else {
          body[o + 8] = 0; body[o + 9] = 0; body[o + 10] = 1; body[o + 11] = 1;
          body[o + 12] = -1;
        }
        bn++;
      };
      const pushCap = (x, y, w, h, rot, r, g, b, a) => {
        if ((cn + 1) * CAP_STRIDE > cap.length) {
          const nb = new Float32Array(cap.length * 2); nb.set(cap); cap = ch.cap = nb;
        }
        const o = cn * CAP_STRIDE;
        cap[o] = x; cap[o + 1] = y; cap[o + 2] = w; cap[o + 3] = h; cap[o + 4] = rot;
        cap[o + 5] = r; cap[o + 6] = g; cap[o + 7] = b; cap[o + 8] = a;
        cn++;
      };

      for (let cy = cy0; cy < cy1; cy++) {
        let run = -1, runMat = -1, runShade = -1;
        for (let cx = cx0; cx <= cx1; cx++) {
          const has = cx < cx1 && T.filled(cx, cy);
          let m = -1, shadeBucket = -1, dep = 0;
          if (has) {
            const i = cy * cols + cx;
            m = mat[i];
            // depth below the surface, capped — drives the vertical darkening.
            // 24 cells, not 12: portrait shows ~570px of sub-ground and a ramp
            // that bottomed out after 192px left the lower half of it flat.
            dep = 0;
            for (let k = 1; k <= RAMP_DEPTH; k++) { if (T.filled(cx, cy - k)) dep = k; else break; }
            shadeBucket = dep | (char[i] > 40 ? 32 : 0);
          }
          if (has && run >= 0 && m === runMat && shadeBucket === runShade) continue;
          if (run >= 0) {
            // close the run
            const w = (cx - run) * CELL;
            const mm = MAT[runMat];
            const depth = runShade & 31;
            const charred = (runShade & 32) !== 0;
            const tiled = wallTex ? wallTex[runMat] : null;
            // Darken with depth so the ground reads as MASS. Untextured, that
            // ramp had to run almost to black or the mass was a flat slab; with
            // the cliff-face tile carrying the detail it can hold a floor high
            // enough to stay legible, which is the whole point of the exercise.
            const t = (1 - depth / RAMP_DEPTH) * (1 - depth / RAMP_DEPTH);
            let r, g, b;
            if (tiled) {
              const k = (RAMP_FLOOR + (1 - RAMP_FLOOR) * t) * (depth === 0 ? RAMP_LIP : 1);
              r = k; g = k; b = k;
            } else {
              let k = 0.26 + 0.74 * t;
              if (depth === 0) k *= 1.45;   // the lit lip is most of what sells a ledge
              r = mm.body[0] * k; g = mm.body[1] * k; b = mm.body[2] * k;
            }
            if (charred) { r *= 0.28; g *= 0.26; b *= 0.28; }
            // the tile supplies its own variation; the hash is only needed to
            // stop an untextured run reading as a poster-flat slab
            const nz = tiled ? 1 : 0.955 + hash2i(run, cy) * 0.09;
            const bm = tiled ? runMat : -1;
            pushBody(T.cellLeft(run) + w * 0.5, T.cellCY(cy), w + 1.5, CELL + 1.5, r * nz, g * nz, b * nz, 1, bm);
            if (runMat === MATERIAL.MASONRY && !tiled && (cy & 1) === 0) {
              pushBody(T.cellLeft(run) + w * 0.5, T.cellTop(cy) + 1.5, w + 1.5, 3, r * 0.55, g * 0.55, b * 0.58, 1, -1);
            }
            run = -1;
          }
          if (has) { run = cx; runMat = m; runShade = shadeBucket; }
        }
      }

      // exposed faces get a soft cap so the silhouette is not a staircase
      for (let cy = cy0; cy < cy1; cy++) {
        for (let cx = cx0; cx < cx1; cx++) {
          const i = cy * cols + cx;
          const m = mat[i];
          if (m === EMPTY) continue;
          const up = T.filled(cx, cy - 1), dn = T.filled(cx, cy + 1);
          const lf = T.filled(cx - 1, cy), rt = T.filled(cx + 1, cy);
          if (up && dn && lf && rt) continue;
          const mm = MAT[m];
          const ch2 = char[i] / 255;
          const grass = (flag[i] & FLAG.GRASS) !== 0 && !up;
          const nz = 0.85 + hash2i(cx * 3, cy * 5) * 0.3;
          let r = mm.body[0] * 1.85 * nz, g = mm.body[1] * 1.80 * nz, b = mm.body[2] * 1.75 * nz;
          if (grass) { r = 0.20 * nz; g = 0.34 * nz; b = 0.17 * nz; }
          if (ch2 > 0.15) { const t = Math.min(1, ch2); r = r * (1 - t) + 0.05 * t; g = g * (1 - t) + 0.045 * t; b = b * (1 - t) + 0.05 * t; }
          const jx = (hash2i(cx, cy + 11) - 0.5) * CELL * 0.5;
          if (!up) pushCap(T.cellCX(cx) + jx, T.cellTop(cy) + CELL * 0.30, CELL * 2.35, CELL * 1.7, 0, r, g, b, 1);
          if (!dn) pushCap(T.cellCX(cx) + jx, T.cellTop(cy) + CELL * 0.72, CELL * 2.1, CELL * 1.4, 0, r * 0.5, g * 0.5, b * 0.55, 1);
          if (!lf) pushCap(T.cellLeft(cx) + CELL * 0.30, T.cellCY(cy), CELL * 1.6, CELL * 2.1, 0, r * 0.72, g * 0.72, b * 0.76, 1);
          if (!rt) pushCap(T.cellLeft(cx) + CELL * 0.70, T.cellCY(cy), CELL * 1.6, CELL * 2.1, 0, r * 0.72, g * 0.72, b * 0.76, 1);
        }
      }

      ch.bn = bn; ch.cn = cn; ch.dirty = false; ch.any = bn > 0 || cn > 0;
    },

    render(R, LAYER, camX, camY, halfW, halfH) {
      const white = R.white, blob = R.blob;
      if (!wallTex) {
        const p = buildWallTextures(world.assets);
        if (p) { wallTex = []; p.then((tx) => { wallTex = tx; T.markAllDirty(); }); }
      }
      const cA = Math.max(0, Math.floor((camX - halfW - x0) / (CHUNK * CELL)));
      const cB = Math.min(cCols - 1, Math.floor((camX + halfW - x0) / (CHUNK * CELL)));
      const rA = Math.max(0, Math.floor((camY - halfH - y0) / (CHUNK * CELL)));
      const rB = Math.min(cRows - 1, Math.floor((camY + halfH - y0) / (CHUNK * CELL)));
      let drawn = 0;
      for (let r = rA; r <= rB; r++) {
        for (let c = cA; c <= cB; c++) {
          const ci = r * cCols + c;
          const ch = chunks[ci];
          if (ch.dirty) T.buildChunk(ci);
          if (!ch.any) continue;
          drawn++;
          const body = ch.body, cap = ch.cap;
          for (let i = 0, o = 0; i < ch.bn; i++, o += BODY_STRIDE) {
            const m = body[o + 12];
            const tex = m < 0 ? white : (wallTex[m] || white);
            R.spriteRaw(tex, body[o + 8], body[o + 9], body[o + 10], body[o + 11],
              body[o], body[o + 1], body[o + 2], body[o + 3], 0,
              body[o + 4], body[o + 5], body[o + 6], body[o + 7], LAYER.TERRAIN, false, 1);
          }
          for (let i = 0, o = 0; i < ch.cn; i++, o += CAP_STRIDE) {
            R.spriteRaw(blob, 0, 0, 1, 1, cap[o], cap[o + 1], cap[o + 2], cap[o + 3], cap[o + 4],
              cap[o + 5], cap[o + 6], cap[o + 7], cap[o + 8], LAYER.TERRAIN, false, 1);
          }
        }
      }
      return drawn;
    },

    markAllDirty() { for (let i = 0; i < chunks.length; i++) chunks[i].dirty = true; },
    clear() { mat.fill(EMPTY); hp.fill(0); flag.fill(0); char.fill(0); T.markAllDirty(); },
  };

  function markRegion(a, b, c, d) {
    const c0 = Math.max(0, ((a - 1) / CHUNK) | 0), c1 = Math.min(cCols - 1, ((c + 1) / CHUNK) | 0);
    const r0 = Math.max(0, ((b - 1) / CHUNK) | 0), r1 = Math.min(cRows - 1, ((d + 1) / CHUNK) | 0);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) chunks[r * cCols + c].dirty = true;
  }

  return T;
}
