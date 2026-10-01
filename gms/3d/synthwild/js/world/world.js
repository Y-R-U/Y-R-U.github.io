// World: sparse sections, streaming (gen in a module worker), light, edits, raycast, persistence.
import { BLOCK, EMIT, OPACITY, SOLID } from '../data/blocks.js';
import { makeTerrain, BIOMES, SEA } from './terrain.js';
import { buildColumn } from './column.js';
import {
  REFINED, SKY_FULL, newSection, secKeyNum, secKeyStr, chunkKeyStr, unpackSubs, isAllAir,
} from './section.js';
import { relightGen, mergeBorders, refinedEmit } from './light.js';
import { encodeSection } from './persist.js';
import { setBox as setBoxImpl, railWall } from './edit.js';
import { raycast as raycastImpl } from './raycast.js';

export const UNLOADED = 0x7fff;
export { SEA };
const COREPLATE = BLOCK.COREPLATE;

export class World {
  constructor({ seed = 'synthwild', mode = 'survival', sync, workers } = {}) {
    this.seed = seed;
    this.mode = mode;
    this.terrain = makeTerrain(seed);
    this.sections = new Map();   // "cx,sy,cz" -> Section | null
    this._sec = new Map();       // numeric key -> Section | null
    this.chunks = new Map();     // "cx,cz" -> { cx, cz, heights, waters, biomes }
    this.mods = new Map();       // "cx,cz" -> { [sy]: base64 } saved edits of chunks not in memory
    this._dirty = new Set();
    this._gone = new Set();
    this._dirtyCbs = [];
    this._chunkCbs = [];
    this._requested = new Map(); // "cx,cz" -> true while generating
    this._results = [];
    this._center = [0, 0];
    this._relight = null;        // pending time-sliced relight (huge edits)
    this.deferLightOver = 4096;  // edits changing more cells than this relight over several frames
    this._radius = 4;
    this.stats = { generated: 0, genMs: 0, workerMs: 0, applyMs: 0, lastApplyMs: 0 };
    this._sync = sync ?? (typeof Worker === 'undefined');
    this._workers = [];
    if (!this._sync) {
      const n = workers ?? Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2));
      try {
        for (let k = 0; k < n; k++) {
          const w = new Worker(new URL('./gen.worker.js', import.meta.url), { type: 'module' });
          w.busy = 0;
          w.onmessage = (e) => { w.busy--; this._results.push(e.data); };
          w.onerror = (e) => { console.error('[world] gen worker error', e.message || e); };
          this._workers.push(w);
        }
      } catch (err) {
        console.warn('[world] module worker unavailable, generating on the main thread', err);
        this._sync = true;
      }
    }
    this.spawn = this.terrain.spawnPoint();
    // light accessor used by light.js
    this._W = {
      lget: (x, y, z) => this._lget(x, y, z),
      lset: (x, y, z, v) => this._lset(x, y, z, v),
      opac: (x, y, z) => this._opac(x, y, z),
      emit: (x, y, z) => this._emit(x, y, z),
    };
  }

  // ---------- events ----------
  onSectionDirty(cb) { this._dirtyCbs.push(cb); return () => { this._dirtyCbs = this._dirtyCbs.filter((f) => f !== cb); }; }
  onChunk(cb) { this._chunkCbs.push(cb); return () => { this._chunkCbs = this._chunkCbs.filter((f) => f !== cb); }; }
  _markDirty(cx, sy, cz) { if (sy >= 0 && sy < 8) this._dirty.add(secKeyNum(cx, sy, cz)); }
  _flush() {
    if (!this._dirty.size) return;
    const keys = [];
    for (const k of this._dirty) {
      const sy = k % 8, rest = (k - sy) / 8, cz = (rest % 65536) - 32768, cx = Math.floor(rest / 65536) - 32768;
      const s = this._sec.get(k);
      if (s) s.dirty = true;
      if (s !== undefined || this._gone.has(k)) keys.push(secKeyStr(cx, sy, cz));
    }
    this._dirty.clear();
    this._gone.clear();
    for (const key of keys) for (const cb of this._dirtyCbs) cb(key);
  }

  // ---------- section access ----------
  _secAt(cx, sy, cz) { return this._sec.get(secKeyNum(cx, sy, cz)); }
  _materialize(cx, sy, cz) {
    if (sy < 0 || sy > 7) return null;
    const k = secKeyNum(cx, sy, cz);
    const s = this._sec.get(k);
    if (s) return s;
    if (s === undefined) return null; // not loaded
    const ns = newSection(cx, sy, cz);
    this._sec.set(k, ns);
    this.sections.set(ns.key, ns);
    return ns;
  }
  isChunkLoaded(cx, cz) { return this.chunks.has(chunkKeyStr(cx, cz)); }
  neighborsReady(cx, cz) {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (!this.chunks.has(chunkKeyStr(cx + i, cz + j))) return false;
    return true;
  }
  isReady(px, pz) { return this.isChunkLoaded(Math.floor(px / 16), Math.floor(pz / 16)); }

  // ---------- reads ----------
  getCell(x, y, z) {
    if (y < 0) return COREPLATE;
    if (y > 127) return 0;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (!s) return 0;
    const v = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    return (v & REFINED) ? -1 : v;
  }
  getSub(sx, sy, sz) {
    if (sy < 0) return COREPLATE;
    if (sy > 511) return 0;
    const x = sx >> 2, y = sy >> 2, z = sz >> 2;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (!s) return 0;
    const v = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    return (v & REFINED) ? s.subs[v & 0x7fff][(sx & 3) + (sz & 3) * 4 + (sy & 3) * 16] : v;
  }
  isSolidSub(sx, sy, sz) {
    if (sy < 0) return true;
    if (sy > 511) return false;
    const x = sx >> 2, y = sy >> 2, z = sz >> 2;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (s === undefined) return true; // unloaded: hold the player
    if (s === null) return false;
    const v = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    return SOLID[(v & REFINED) ? s.subs[v & 0x7fff][(sx & 3) + (sz & 3) * 4 + (sy & 3) * 16] : v] === 1;
  }
  blockAt(x, y, z) { return this.getSub(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4)); }
  // light byte (sky<<4)|block at a cell; also skyLight/blockLight at a float position
  lightAt(x, y, z) {
    const l = this._lget(Math.floor(x), Math.floor(y), Math.floor(z));
    return l < 0 ? SKY_FULL : l;
  }
  skyLight(x, y, z) { return this.lightAt(x, y, z) >> 4; }
  blockLight(x, y, z) { return this.lightAt(x, y, z) & 15; }

  // top of the highest solid sub in this column (units); falls back to the generator when unloaded
  surfaceY(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    if (!this.isChunkLoaded(fx >> 4, fz >> 4)) return this.terrain.column(fx, fz).h;
    const ssx = Math.floor(x * 4) & 3, ssz = Math.floor(z * 4) & 3;
    for (let y = 127; y >= 0; y--) {
      const s = this._sec.get(secKeyNum(fx >> 4, y >> 4, fz >> 4));
      if (!s) { y = (y & ~15); continue; }
      const v = s.cells[(fx & 15) + (fz & 15) * 16 + (y & 15) * 256];
      if (v & REFINED) {
        const sb = s.subs[v & 0x7fff];
        for (let k = 3; k >= 0; k--) if (SOLID[sb[ssx + ssz * 4 + k * 16]]) return y + (k + 1) / 4;
      } else if (SOLID[v]) return y + 1;
    }
    return 0;
  }
  biomeAt(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    const c = this.chunks.get(chunkKeyStr(fx >> 4, fz >> 4));
    const b = c ? c.biomes[(fx & 15) + (fz & 15) * 16] : this.terrain.column(fx, fz).biome;
    return BIOMES[b];
  }
  // water surface height at a column (0 = none), from generation
  waterLevelAt(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    const c = this.chunks.get(chunkKeyStr(fx >> 4, fz >> 4));
    return c ? c.waters[(fx & 15) + (fz & 15) * 16] : this.terrain.column(fx, fz).water;
  }

  // ---------- light internals ----------
  _lget(x, y, z) {
    if (y < 0) return -1;
    if (y > 127) return SKY_FULL;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (s === undefined) return -1;
    if (s === null) return SKY_FULL;
    return s.light[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
  }
  _lset(x, y, z, v) {
    const cx = x >> 4, sy = y >> 4, cz = z >> 4;
    let s = this._sec.get(secKeyNum(cx, sy, cz));
    if (s === undefined) return;
    if (s === null) { if (v === SKY_FULL) return; s = this._materialize(cx, sy, cz); }
    s.light[(x & 15) + (z & 15) * 16 + (y & 15) * 256] = v;
    s.version++;
    this._markDirty(cx, sy, cz);
    const lx = x & 15, ly = y & 15, lz = z & 15;
    if (lx === 0) this._markDirty(cx - 1, sy, cz); else if (lx === 15) this._markDirty(cx + 1, sy, cz);
    if (lz === 0) this._markDirty(cx, sy, cz - 1); else if (lz === 15) this._markDirty(cx, sy, cz + 1);
    if (ly === 0) this._markDirty(cx, sy - 1, cz); else if (ly === 15) this._markDirty(cx, sy + 1, cz);
  }
  _opac(x, y, z) {
    if (y < 0 || y > 127) return 15;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (s === undefined) return 15;
    if (s === null) return 0;
    const v = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    return (v & REFINED) ? 0 : OPACITY[v];
  }
  _emit(x, y, z) {
    if (y < 0 || y > 127) return 0;
    const s = this._sec.get(secKeyNum(x >> 4, y >> 4, z >> 4));
    if (!s) return 0;
    const v = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    return (v & REFINED) ? refinedEmit(s.subs[v & 0x7fff]) : EMIT[v];
  }

  // ---------- edits ----------
  setBox(minSub, maxSub, mat, mode = 'fill', opts = {}) {
    this.finishLight();
    const r = setBoxImpl(this, minSub, maxSub, mat, mode, opts);
    this._flush();
    return r;
  }
  lightPending() { return !!this._relight; }
  finishLight() {
    if (!this._relight) return;
    while (!this._relight.next().done);
    this._relight = null;
    this._flush();
  }
  _stepLight(budgetMs) {
    const t0 = now();
    while (this._relight && now() - t0 < budgetMs) if (this._relight.next().done) this._relight = null;
  }
  _afterEdit(cells) {
    const g = relightGen(this._W, cells);
    if (cells.length / 3 > this.deferLightOver) { this._relight = g; this._stepLight(4); }
    else while (!g.next().done);
    for (let k = 0; k < cells.length; k += 3) {
      const x = cells[k], y = cells[k + 1], z = cells[k + 2];
      const cx = x >> 4, sy = y >> 4, cz = z >> 4;
      const s = this._secAt(cx, sy, cz);
      if (s) s.version++;
      const lx = x & 15, ly = y & 15, lz = z & 15;
      const ox = lx === 0 ? -1 : lx === 15 ? 1 : 0, oy = ly === 0 ? -1 : ly === 15 ? 1 : 0, oz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
      for (let a = 0; a <= (ox ? 1 : 0); a++) for (let b = 0; b <= (oy ? 1 : 0); b++) for (let c = 0; c <= (oz ? 1 : 0); c++)
        this._markDirty(cx + a * ox, sy + b * oy, cz + c * oz);
    }
  }
  // explorable structures within r metres of (x,z), nearest first: [{ kind, pos:[x,y,z], dist }]
  // kind: 'outpost' | 'vault' | 'observatory' | 'ruin'. Pure: works for unloaded areas too.
  structuresNear(x, z, r = 256) { return this.terrain.structuresNear(Math.floor(x), Math.floor(z), r); }
  railFace(x, y, z) { return railWall(this, x, y, z); }
  raycast(origin, dir, maxDist = 8, opts) { return raycastImpl(this, origin, dir, maxDist, opts); }

  // ---------- streaming ----------
  update(px, pz, radius = this._radius) {
    this._radius = radius;
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    this._center = [pcx, pcz];
    const keep = (radius + 2) * (radius + 2);
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > keep) this._unloadChunk(c.cx, c.cz);
    }
    const t0 = now();
    if (this._relight) this._stepLight(4);
    // apply finished columns (time-boxed so a burst never hitches a frame); they wait for a pending relight
    while (!this._relight && this._results.length && now() - t0 < 6) this._applyColumn(this._results.shift());
    const offs = spiral(radius);
    if (this._sync) {
      let n = 0;
      for (let k = 0; k < offs.length && n < 2 && now() - t0 < 8 && !this._relight; k++) {
        const cx = pcx + offs[k][0], cz = pcz + offs[k][1];
        if (this.isChunkLoaded(cx, cz)) continue;
        this.genChunkSync(cx, cz); n++;
      }
    } else {
      for (let k = 0; k < offs.length; k++) {
        const cx = pcx + offs[k][0], cz = pcz + offs[k][1];
        const key = chunkKeyStr(cx, cz);
        if (this.chunks.has(key) || this._requested.has(key)) continue;
        const w = this._workers.reduce((a, b) => (b.busy < a.busy ? b : a));
        if (w.busy >= 4) break;
        w.busy++;
        this._requested.set(key, true);
        w.postMessage({ seed: this.seed, cx, cz, mods: this.mods.get(key) || null });
      }
    }
    this._flush();
  }
  // synchronous helpers (tests, spawn warm-up, no-worker fallback)
  genChunkSync(cx, cz) {
    const key = chunkKeyStr(cx, cz);
    if (this.chunks.has(key)) return;
    this.finishLight();
    const { msg } = buildColumn(this.terrain, cx, cz, this.mods.get(key) || null);
    this._applyColumn(msg, true);
    this._flush();
  }
  ensureArea(px, pz, radius) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    for (const [dx, dz] of spiral(radius)) this.genChunkSync(pcx + dx, pcz + dz);
  }
  pendingCount() { return this._requested.size + this._results.length; }

  _applyColumn(m, force) {
    const t0 = now();
    const key = chunkKeyStr(m.cx, m.cz);
    this._requested.delete(key);
    if (this.chunks.has(key)) return;
    if (!force) {
      const dx = m.cx - this._center[0], dz = m.cz - this._center[1], r = this._radius + 2;
      if (dx * dx + dz * dz > r * r) return; // walked away meanwhile
    }
    for (let sy = 0; sy < 8; sy++) {
      const d = m.secs[sy];
      let s = null;
      if (d) {
        s = newSection(m.cx, sy, m.cz, d.cells, d.light, unpackSubs(d.subs));
        s.modified = d.modified;
      }
      this._sec.set(secKeyNum(m.cx, sy, m.cz), s);
      this.sections.set(secKeyStr(m.cx, sy, m.cz), s);
    }
    this.chunks.set(key, { cx: m.cx, cz: m.cz, heights: m.heights, waters: m.waters, biomes: m.biomes });
    this.mods.delete(key);
    mergeBorders(this._W, m.cx, m.cz, (cx, cz) => this.isChunkLoaded(cx, cz));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if ((i || j) && !this.isChunkLoaded(m.cx + i, m.cz + j)) continue;
      for (let sy = 0; sy < 8; sy++) this._markDirty(m.cx + i, sy, m.cz + j);
    }
    this.stats.generated++;
    this.stats.workerMs += m.totalMs;
    this.stats.genMs += m.genMs;
    this.stats.lastApplyMs = now() - t0;
    this.stats.applyMs += this.stats.lastApplyMs;
    for (const cb of this._chunkCbs) cb('load', m.cx, m.cz);
  }

  _unloadChunk(cx, cz) {
    this.finishLight();
    const key = chunkKeyStr(cx, cz);
    let mods = null;
    for (let sy = 0; sy < 8; sy++) {
      const k = secKeyNum(cx, sy, cz), s = this._sec.get(k);
      if (s && s.modified) (mods ||= {})[sy] = encodeSection(s);
      this._sec.delete(k);
      this.sections.delete(secKeyStr(cx, sy, cz));
      this._dirty.add(k);
      this._gone.add(k);
    }
    if (mods) this.mods.set(key, mods);
    this.chunks.delete(key);
    for (const cb of this._chunkCbs) cb('unload', cx, cz);
  }

  // ---------- renderer payload ----------
  meshPayload(cx, sy, cz) {
    const self = this._secAt(cx, sy, cz);
    if (self === undefined) return null;
    const base = { key: secKeyStr(cx, sy, cz), cx, sy, cz, version: self ? self.version : 0 };
    if (self === null || isAllAir(self)) return { ...base, empty: true };
    const N = 18, cells = new Uint16Array(N * N * N), light = new Uint8Array(N * N * N);
    const subsList = [];
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x0 = dx < 0 ? 15 : 0, x1 = dx > 0 ? 0 : 15, y0 = dy < 0 ? 15 : 0, y1 = dy > 0 ? 0 : 15, z0 = dz < 0 ? 15 : 0, z1 = dz > 0 ? 0 : 15;
      const ox = dx * 16 + 1, oy = dy * 16 + 1, oz = dz * 16 + 1;
      const nsy = sy + dy;
      let s, fillV = 0, fillL = SKY_FULL;
      if (nsy < 0) { s = undefined; fillV = COREPLATE; fillL = 0; }
      else if (nsy > 7) s = null;
      else { s = this._secAt(cx + dx, nsy, cz + dz); if (s === undefined) fillV = UNLOADED; }
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        let p = (x0 + ox) + (z + oz) * N + (y + oy) * N * N;
        let i = x0 + z * 16 + y * 256;
        for (let x = x0; x <= x1; x++, p++, i++) {
          if (!s) { cells[p] = fillV; light[p] = fillL; continue; }
          const v = s.cells[i];
          if (v & REFINED) { subsList.push(s.subs[v & 0x7fff]); cells[p] = REFINED | (subsList.length - 1); }
          else cells[p] = v;
          light[p] = s.light[i];
        }
      }
    }
    const subs = new Uint8Array(subsList.length * 64);
    subsList.forEach((a, k) => subs.set(a, k * 64));
    return { ...base, empty: false, cells, subs, light };
  }

  // ---------- persistence ----------
  serialize() {
    const sections = {};
    for (const [key, m] of this.mods) {
      const [cx, cz] = key.split(',');
      for (const sy in m) sections[cx + ',' + sy + ',' + cz] = m[sy];
    }
    for (const [key, s] of this.sections) if (s && s.modified) sections[key] = encodeSection(s);
    return { v: 1, seed: this.seed, mode: this.mode, sections };
  }
  static deserialize(obj, opts = {}) {
    const w = new World({ ...opts, seed: obj.seed, mode: obj.mode });
    for (const key in obj.sections || {}) {
      const [cx, sy, cz] = key.split(',').map(Number);
      const ck = chunkKeyStr(cx, cz);
      if (!w.mods.has(ck)) w.mods.set(ck, {});
      w.mods.get(ck)[sy] = obj.sections[key];
    }
    return w;
  }

  dispose() {
    for (const w of this._workers) w.terminate();
    this._workers = [];
  }
}

const spiralCache = new Map();
function spiral(r) {
  if (spiralCache.has(r)) return spiralCache.get(r);
  const out = [];
  for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) if (x * x + z * z <= r * r + r) out.push([x, z]);
  out.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
  spiralCache.set(r, out);
  return out;
}
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
