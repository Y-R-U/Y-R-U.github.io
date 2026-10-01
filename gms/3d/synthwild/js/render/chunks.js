// Chunk renderer (ctx.render): sections are meshed in workers, then merged per chunk column
// (one opaque, one cutout, one water mesh per column) to keep draw calls low on phones.
import { buildAtlas } from './atlas.js';
import { buildBlockTable } from './blocktable.js';
import { createMaterials } from './materials.js';
import { createMesherPool } from './mesherpool.js';

const PARTS = ['opaque', 'cutout', 'water'];

export function createChunkRenderer(ctx, { BLOCKS, TILES }) {
  const { THREE, scene } = ctx;
  const atlas = buildAtlas(THREE, TILES);
  const table = buildBlockTable(BLOCKS, TILES);
  const quality = () => ctx.flags?.quality || (ctx.flags?.lite ? 'low' : ctx.settings?.get?.('quality') || (ctx.isMobile ? 'med' : 'high'));
  const materials = createMaterials(THREE, atlas, ctx.sky.uniforms, quality());
  const mats = [materials.opaque, materials.cutout, materials.water];
  const results = [];
  const retries = new Map();
  // a worker failure must not leave a permanent hole: retry the section a few times
  const pool = createMesherPool(table, (msg) => { retries.delete(msg.key); results.push(msg); }, (key) => {
    const n = (retries.get(key) || 0) + 1;
    retries.set(key, n);
    if (n <= 3) stale.add(key);
  });

  const group = new THREE.Group();
  group.name = 'chunks';
  scene.add(group);

  const secs = new Map();     // section key -> { res, version }
  const cols = new Map();     // "cx,cz" -> { cx, cz, parts:[mesh|null x3], dirty, quads }
  const dirtyCols = new Set();
  const stale = new Set();    // section keys needing a (re)mesh
  const keyCache = new Map();
  let world = null, unsub = null;
  let rd = 6, camCX = 0, camCZ = 0, camSY = 4;
  const stats = { sections: 0, columns: 0, quads: 0, pending: 0, inflight: 0, uploads: 0 };

  const parseKey = (key) => {
    let v = keyCache.get(key);
    if (!v) {
      if (keyCache.size > 20000) keyCache.clear(); // bounded: long walks visit endless keys
      const p = key.split(','); v = [+p[0], +p[1], +p[2]]; keyCache.set(key, v); }
    return v;
  };
  const inRange = (cx, cz, pad = 0.5) => {
    const dx = cx - camCX, dz = cz - camCZ;
    return dx * dx + dz * dz <= (rd + pad) * (rd + pad);
  };

  function setWorld(w) {
    clear();
    if (unsub) { try { unsub(); } catch { /* ignore */ } unsub = null; }
    world = w;
    if (!w) return;
    const r = w.onSectionDirty?.((key) => { if (world === w) stale.add(key); });
    if (typeof r === 'function') unsub = r;
    for (const key of w.sections?.keys?.() ?? []) stale.add(key);
  }

  function clear() {
    for (const c of cols.values()) disposeCol(c);
    cols.clear(); secs.clear(); dirtyCols.clear(); stale.clear(); keyCache.clear(); retries.clear();
    results.length = 0;
    pool.cancelAll();
  }

  function disposeCol(c) {
    for (let i = 0; i < 3; i++) if (c.parts[i]) { group.remove(c.parts[i]); c.parts[i].geometry.dispose(); c.parts[i] = null; }
  }

  function setSection(key, res) {
    const [cx, , cz] = parseKey(key);
    if (res) secs.set(key, res); else if (!secs.delete(key)) return;
    const ck = cx + ',' + cz;
    if (!cols.has(ck)) cols.set(ck, { cx, cz, parts: [null, null, null], quads: 0 });
    dirtyCols.add(ck);
  }

  function buildCol(ck) {
    const c = cols.get(ck);
    if (!c) return;
    disposeCol(c);
    c.quads = 0;
    let any = false;
    for (let p = 0; p < 3; p++) {
      const list = [];
      let verts = 0, idx = 0, minY = 99, maxY = -1;
      for (let sy = 0; sy < 8; sy++) {
        const r = secs.get(c.cx + ',' + sy + ',' + c.cz);
        const g = r && r[PARTS[p]];
        if (!g) continue;
        list.push([sy, g]);
        verts += g.pos.length / 3; idx += g.index.length;
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      if (!list.length) continue;
      const pos = new Int16Array(verts * 3), uv = new Int16Array(verts * 2), data = new Uint8Array(verts * 4);
      const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
      let vo = 0, io = 0;
      for (const [sy, g] of list) {
        const n = g.pos.length / 3, yo = sy * 1024;
        pos.set(g.pos, vo * 3);
        if (yo) for (let i = vo * 3 + 1, e = (vo + n) * 3; i < e; i += 3) pos[i] += yo;
        uv.set(g.uv, vo * 2);
        data.set(g.data, vo * 4);
        const gi = g.index;
        for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
        vo += n; io += gi.length;
        c.quads += g.quads;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      const y0 = minY * 1024, y1 = (maxY + 1) * 1024;
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, y0, 0), new THREE.Vector3(1024, y1, 1024));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(geo, mats[p]);
      m.position.set(c.cx * 16, 0, c.cz * 16);
      m.scale.setScalar(1 / 64);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = p;
      m.visible = inRange(c.cx, c.cz);
      group.add(m);
      c.parts[p] = m;
      any = true;
    }
    if (!any) cols.delete(ck);
  }

  function dispatch() {
    if (!world || !stale.size) return;
    const slots = pool.free();
    if (slots <= 0) return;
    const cand = [];
    const lim = (rd + 1) * (rd + 1);
    for (const key of stale) {
      const [cx, sy, cz] = parseKey(key);
      if (!world.sections.has(key)) { stale.delete(key); setSection(key, null); continue; }
      const dx = cx - camCX, dz = cz - camCZ, d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      cand.push(d2 + Math.abs(sy - camSY) * 0.5, key);
    }
    const order = [];
    for (let i = 0; i < cand.length; i += 2) order.push(i);
    order.sort((a, b) => cand[a] - cand[b]);
    let n = 0;
    for (const i of order) {
      if (n >= slots) break;
      const key = cand[i + 1];
      if (pool.busy(key)) continue;
      stale.delete(key);
      const [cx, sy, cz] = parseKey(key);
      const pl = world.meshPayload(cx, sy, cz);
      if (!pl || pl.empty) { setSection(key, null); continue; }
      pool.submit(key, pl);
      n++;
    }
  }

  let cullTimer = 0, lastRD = -1;
  const render = {
    atlas, materials, table, group, stats,
    setWorld,
    get world() { return world; },
    setRenderDistance(n) { rd = Math.max(2, Math.min(12, n | 0)); },
    get renderDistance() { return rd; },
    setQuality(q) { materials.setQuality(q); },
    remeshAll() { if (world) for (const key of world.sections.keys()) stale.add(key); },
    markDirty(key) { stale.add(key); },
    update(arg) {
      const cam = arg && arg.isCamera ? arg : ctx.camera;
      if (!cam || !world) return;
      camCX = Math.floor(cam.position.x / 16); camCZ = Math.floor(cam.position.z / 16);
      camSY = Math.floor(cam.position.y / 16);
      dispatch();
      const t0 = performance.now();
      let up = 0;
      while (results.length && (up < 4 || performance.now() - t0 < 3)) {
        const msg = results.shift();
        if (world.sections.has(msg.key)) setSection(msg.key, msg.res);
        else setSection(msg.key, null);
        if (++up >= 32) break;
      }
      stats.uploads = up;
      // rebuild changed columns, nearest first, within a small time budget
      if (dirtyCols.size) {
        const list = [...dirtyCols].map((ck) => { const c = cols.get(ck); return [c ? (c.cx - camCX) ** 2 + (c.cz - camCZ) ** 2 : 0, ck]; });
        list.sort((a, b) => a[0] - b[0]);
        const t1 = performance.now();
        for (const [, ck] of list) {
          buildCol(ck); dirtyCols.delete(ck);
          if (performance.now() - t1 > 4) break;
        }
      }
      if (--cullTimer <= 0 || lastRD !== rd) {
        cullTimer = 15; lastRD = rd;
        let quads = 0, n = 0;
        for (const [ck, c] of cols) {
          const dx = c.cx - camCX, dz = c.cz - camCZ;
          if (dx * dx + dz * dz > (rd + 3) * (rd + 3)) {
            // far away: free GPU memory, forget the section meshes and remesh when we come back
            disposeCol(c); cols.delete(ck);
            for (let sy = 0; sy < 8; sy++) { const k = c.cx + ',' + sy + ',' + c.cz; if (secs.delete(k) && world.sections.has(k)) stale.add(k); }
            continue;
          }
          const vis = inRange(c.cx, c.cz);
          for (const m of c.parts) if (m) m.visible = vis;
          if (vis) { quads += c.quads; n++; }
        }
        stats.columns = n; stats.sections = secs.size; stats.quads = quads;
      }
      stats.pending = stale.size; stats.inflight = pool.inflight();
      let under = 0;
      try {
        const m = world.getCell?.(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
        if (m > 0 && m < 256 && table.kind[m] === 4) under = 1;
      } catch { /* ignore */ }
      ctx.sky.uniforms.uUnderwater.value = under;
    },
    isSettled(r = 2) {
      for (const key of stale) {
        const [cx, , cz] = parseKey(key);
        if ((cx - camCX) ** 2 + (cz - camCZ) ** 2 <= r * r && world?.sections.has(key)) return false;
      }
      return pool.inflight() === 0 && results.length === 0 && dirtyCols.size === 0;
    },
    dispose() { clear(); pool.terminate(); scene.remove(group); },
  };
  return render;
}
