// Volcano Forge theme — backdrop set pieces: a distant erupting volcano rising out of the lava sea (glowing
// crater, molten streams down its flanks), a dwarven forge on its own basalt island (a stone hall with an
// iron gable roof, a glowing furnace mouth under a brass gear, two smoking chimneys, a giant anvil and
// hammer, a molten channel pouring off the edge) and small basalt islands with crystals, columns,
// braziers, anvils, ember vents or charred trees. Merged into buckets by the caller.
import * as THREE from 'three';
import { rng, mat, fbm3, noise3 } from './util.js';
import { roundIsland, spikes, ROCK } from './island.js';
import { brazier, lanternPost, anvil, crystals, columns, emberVent, hammer, gear, ingots, chimney, COLORS } from './props.js';

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key, geo, color, local ? M.clone().multiply(local) : M, keepUv);
const STONE = 0x4e4846, STONE2 = 0x3c3735, STONE3 = 0x5a5350;

/**
 * The volcano at local origin (base at y = 0), height H, base radius RB. Returns
 * { rock (vcRock geometry, local), lava (lava strips geometry with uv, local), crater (local point), streams }.
 */
export function volcanoGeometry(H, RB, hi, seed = 5) {
  const NA = hi ? 56 : 36, NJ = hi ? 18 : 12;
  const RC = RB * 0.13, crD = RC * 0.55;
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const streams = [0.15, 1.05, -0.75, 2.3].slice(0, hi ? 4 : 3);   // angles (0 = facing +z)
  const streamW = (a, h) => {   // 0..1 proximity to a stream at angle a, height fraction h
    let best = 0;
    for (const s of streams) {
      let d = Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s)));
      const w = 0.05 + (1 - h) * 0.06;
      best = Math.max(best, 1 - Math.min(1, d / w));
    }
    return best;
  };
  const radiusAt = (a, h) => {
    const n = fbm3(Math.cos(a) * 1.6 + seed, h * 2.5, Math.sin(a) * 1.6, hi ? 4 : 3);
    const gully = 1 - streamW(a, h) * 0.06;
    return (RC + (RB - RC) * Math.pow(1 - h, 1.7)) * (0.82 + n * 0.36) * gully * (1 + 0.03 * Math.cos(a * 9 + h * 4));
  };
  // rows: outer flank from base (h=0) to rim (h=1), then two rows inside the crater
  const rows = [];
  for (let j = 0; j <= NJ; j++) rows.push({ h: j / NJ, inner: 0 });
  rows.push({ h: 1, inner: 1 }, { h: 1, inner: 2 });
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * Math.PI * 2;
    const ca = Math.sin(a), sa = Math.cos(a);   // a = 0 faces +z
    rows.forEach((row, k) => {
      let rad, y;
      if (!row.inner) { rad = radiusAt(a, row.h); y = row.h * H + (row.h > 0.9 ? (noise3(ca * 3, sa * 3, seed) - 0.5) * H * 0.04 : 0); }
      else if (row.inner === 1) { rad = RC * 0.85; y = H - crD * 0.5; }
      else { rad = RC * 0.6; y = H - crD; }
      if (i === NA) { const b = k * 3; pos.push(pos[b], pos[b + 1], pos[b + 2]); }
      else pos.push(ca * rad, y, sa * rad);
      uv.push(a * RB * 0.04, y * 0.05);
      const sw = row.inner ? 1 : streamW(a, row.h) * (row.h > 0.35 ? 1 : row.h / 0.35);
      const top = row.inner ? 1 : Math.max(0, (row.h - 0.9) / 0.1);
      const heat = Math.max(sw, top * 0.6, row.h < 0.06 ? 0.7 : 0);
      c.set(STONE2).lerp(c.clone().set(0x2a2624), noise3(ca * 4, row.h * 6, sa * 4)).lerp(new THREE.Color(ROCK.hot), heat);
      col.push(c.r, c.g, c.b);
    });
  }
  const R = rows.length;
  for (let i = 0; i < NA; i++) for (let k = 0; k < R - 1; k++) {
    const a0 = i * R + k, a1 = a0 + 1, b0 = a0 + R, b1 = b0 + 1;
    idx.push(a0, b0, a1, b0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const rock = g.toNonIndexed(); g.dispose();

  // molten streams: ribbons hugging the flank from the rim down, plus the crater floor disc
  const lp = [], luv = [], lidx = [];
  let base = 0;
  for (const s of streams) {
    const NS = hi ? 14 : 9, hEnd = 0.12 + noise3(s * 3, 1, seed) * 0.25;
    for (let j = 0; j <= NS; j++) {
      const h = 1 - (j / NS) * (1 - hEnd);
      const wob = Math.sin(j * 0.9 + s * 5) * 0.02;
      const w = (0.04 + (1 - h) * 0.05) * 0.6;
      for (const e of [-1, 1]) {
        const a = s + wob + e * w;
        const rad = radiusAt(a, h) + 0.4;
        lp.push(Math.sin(a) * rad, h * H + 0.2, Math.cos(a) * rad);
        luv.push((e + 1) / 2, (1 - h) * H * 0.08);
      }
      if (j < NS) { const k = base + j * 2; lidx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    base += (NS + 1) * 2;
  }
  const disc = 16;
  const cBase = base;
  lp.push(0, H - crD + 0.3, 0); luv.push(0.5, 0.5);
  for (let i = 0; i <= disc; i++) {
    const a = i / disc * Math.PI * 2;
    lp.push(Math.sin(a) * RC * 0.62, H - crD + 0.3, Math.cos(a) * RC * 0.62);
    luv.push(0.5 + Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.5);
    if (i < disc) lidx.push(cBase, cBase + 1 + i, cBase + 2 + i);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
  lg.setIndex(lidx);
  lg.computeVertexNormals();
  const lava = lg.toNonIndexed(); lg.dispose();
  return { rock, lava, crater: new THREE.Vector3(0, H - crD * 0.3, 0), RC, streams: streams.map(s => new THREE.Vector3(Math.sin(s) * radiusAt(s, 0.6), H * 0.6, Math.cos(s) * radiusAt(s, 0.6))) };
}

/**
 * Dwarven forge at local origin facing +z (~20 m wide, chimneys to ~15 m), standing on y = 0.
 * Returns { glows: [{p (world), w, color}], smoke: [Vector3 (world)], lavaStrip: geometry (world) | null, pourP, pourDir }.
 */
export function buildForge(b, M, hi) {
  const r = rng(808);
  const glows = [], smoke = [];
  const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  // plinth + steps
  put(b, 'stone', new THREE.BoxGeometry(17, 1.0, 12), STONE2, M, mat(0, 0.5, -1));
  put(b, 'stone', new THREE.BoxGeometry(7, 0.5, 1.5), STONE, M, mat(0, 0.25, 5.6));
  // hall
  put(b, 'stone', new THREE.BoxGeometry(12, 6.5, 8.5), STONE, M, mat(0, 1 + 3.25, -1.5));
  // stone courses (bands)
  for (const y of [2.6, 4.6, 6.6]) put(b, 'stone', new THREE.BoxGeometry(12.3, 0.3, 8.8), STONE3, M, mat(0, y, -1.5));
  // buttresses on the front
  for (const x of [-5.6, -2.4, 2.4, 5.6]) {
    put(b, 'stone', new THREE.BoxGeometry(1.0, 6.8, 1.4), STONE2, M, mat(x, 1 + 3.4, 2.9));
    put(b, 'metal', new THREE.BoxGeometry(1.1, 0.25, 1.5), COLORS.brass, M, mat(x, 1 + 6.9, 2.9));
  }
  // iron gable roof along x, brass ridge
  const roofW = 5.0, pitch = 0.62;
  for (const s of [-1, 1]) put(b, 'metal', new THREE.BoxGeometry(13.2, 0.35, roofW), COLORS.iron2, M, mat(0, 7.5 + Math.sin(pitch) * roofW / 2 - 0.2, -1.5 + s * Math.cos(pitch) * roofW / 2, s * pitch, 0, 0));
  put(b, 'metal', new THREE.CylinderGeometry(0.22, 0.22, 13.4, 6), COLORS.brass, M, mat(0, 7.5 + Math.sin(pitch) * roofW - 0.1, -1.5, 0, 0, Math.PI / 2));
  // gable end walls (triangles) - two thin prisms
  {
    const sh = new THREE.Shape();
    const gw = Math.cos(pitch) * roofW, gh = Math.sin(pitch) * roofW - 0.25;
    sh.moveTo(-gw, 0); sh.lineTo(gw, 0); sh.lineTo(0, gh); sh.closePath();
    for (const x of [-6, 6]) {
      const tri = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
      tri.translate(0, 0, -0.15);
      put(b, 'stone', tri, STONE, M, mat(x, 7.5, -1.5, 0, Math.PI / 2, 0));
    }
  }
  // furnace mouth: an arched glowing door with an iron frame, a brass gear above it
  put(b, 'ember', new THREE.BoxGeometry(3.2, 2.6, 0.1), COLORS.ember, M, mat(0, 1 + 1.3, 2.72));
  put(b, 'ember', new THREE.CylinderGeometry(1.6, 1.6, 0.1, 14, 1, false, -Math.PI / 2, Math.PI), COLORS.ember2, M, mat(0, 1 + 2.6, 2.72, Math.PI / 2, 0, 0));
  put(b, 'metal', new THREE.TorusGeometry(1.75, 0.18, 4, 14, Math.PI), COLORS.iron2, M, mat(0, 1 + 2.6, 2.8));
  for (const x of [-1.75, 1.75]) put(b, 'metal', new THREE.BoxGeometry(0.36, 2.6, 0.36), COLORS.iron2, M, mat(x, 1 + 1.3, 2.8));
  glows.push({ p: W(0, 2.6, 3.4), w: 7, color: [1, 0.5, 0.15], a: 0.4 });
  gear(b, M.clone().multiply(mat(0, 5.0, 2.85)), 0.95, 12);
  // windows: glowing slits
  for (const x of [-4.0, -1.2, 1.2, 4.0]) for (const y of [5.5]) {
    if (Math.abs(x) < 2) continue;
    put(b, 'win', new THREE.BoxGeometry(0.55, 1.3, 0.1), null, M, mat(x, y, 2.76));
  }
  for (const z of [-4.5, -1.5, 1.0]) for (const s of [-1, 1]) put(b, 'win', new THREE.BoxGeometry(0.1, 1.2, 0.5), null, M, mat(s * 6.03, 4.4, z));
  // chimneys at the back corners
  for (const [x, z, h, rr] of [[-4.2, -4.6, 15, 1.15], [4.6, -4.2, 12, 0.95]]) {
    const top = chimney(b, M.clone().multiply(mat(x, 1, z)), h, rr, !hi);
    smoke.push(W(x, 1 + top.y + 0.5, z));
    glows.push({ p: W(x, 1 + top.y + 0.3, z), w: rr * 3.6, color: [1, 0.45, 0.12], a: 0.35 });
  }
  // a side smithy lean-to with a brazier
  put(b, 'stone', new THREE.BoxGeometry(4, 3.4, 4), STONE2, M, mat(-8.2, 1 + 1.7, 0.5));
  put(b, 'metal', new THREE.BoxGeometry(4.6, 0.25, 4.6), COLORS.iron2, M, mat(-8.2, 1 + 3.6, 0.5, 0.25, 0, 0));
  put(b, 'win', new THREE.BoxGeometry(1.6, 1.4, 0.1), null, M, mat(-8.2, 1 + 1.3, 2.52));
  // giant anvil and hammer statues out front, braziers on the plinth corners
  anvil(b, M.clone().multiply(mat(4.6, 1, 4.6, 0, -0.35, 0)), 3.2, true);
  hammer(b, M.clone().multiply(mat(-4.4, 1, 4.6, 0, 0.4, 0)), 3.4);
  ingots(b, M.clone().multiply(mat(6.8, 1, 2.6, 0, 0.3, 0)), 2.2);
  for (const [x, z] of [[-7.8, 4.4], [7.8, 4.4]]) {
    const f = brazier(b, M.clone().multiply(mat(x, 1, z)), 1.6, !hi);
    glows.push({ p: W(x, 1 + f.y + 0.2, z), w: 2.4, color: [1, 0.55, 0.18], a: 0.45 });
  }
  // molten channel from the furnace to the island lip (a lava strip, world space)
  const lp = [], luv = [], li = [];
  const N = 8;
  for (let j = 0; j <= N; j++) {
    const t = j / N, z = 2.8 + t * 8.0, x = Math.sin(t * 2.4) * 0.8;
    const y = t < 0.33 ? 1.03 : 0.04;
    for (const e of [-1, 1]) { const p = W(x + e * 0.55, y, z); lp.push(p.x, p.y, p.z); luv.push((e + 1) / 2, z * 0.25); }
    if (j < N) { const k = j * 2; li.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
  lg.setIndex(li); lg.computeVertexNormals();
  const lavaStrip = lg.toNonIndexed(); lg.dispose();
  // the channel's step down off the plinth: a short glowing chute
  put(b, 'ember', new THREE.BoxGeometry(1.0, 1.0, 0.2), COLORS.ember, M, mat(Math.sin(0.33 * 2.4) * 0.8, 0.5, 2.8 + 0.33 * 8 + 0.05, -0.2, 0, 0));
  for (const s of [-1, 1]) put(b, 'stone', new THREE.BoxGeometry(0.3, 0.35, 8.2), STONE3, M, mat(s * 0.9, 0.17, 7.0));
  const end = W(Math.sin(2.4) * 0.8, 0, 10.8);
  const pourDir = new THREE.Vector3(0, 0, 1).transformDirection(M);
  pourDir.y = 0; pourDir.normalize();
  r();
  return { glows, smoke, lavaStrip, pourP: end, pourDir };
}

/** Small basalt island. kind: 'crystals' | 'columns' | 'braziers' | 'anvil' | 'vent' | 'trees'. Returns glows. */
export function buildIsle(b, rocks, M0, lp, R, D, kind, seed, hi) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const { geometry, L } = roundIsland(R, D, seed, hi);
  geometry.applyMatrix4(M);
  rocks.push(geometry);
  const sp = []; spikes(sp, 0, -L * 1.5, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  const glows = [];
  const W = (v) => v.clone().applyMatrix4(M);
  const at = (rad, ry = null) => { const a = r() * Math.PI * 2, d = R * rad * (0.3 + r() * 0.7); return mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, ry ?? r() * 6.28, 0); };
  const add = (L2) => M.clone().multiply(L2);
  if (kind === 'crystals') for (let i = 0; i < (hi ? 4 : 2); i++) crystals(b, add(at(0.6)), R * (0.3 + r() * 0.3), r, hi ? 4 : 3);
  if (kind === 'columns') for (let i = 0; i < (hi ? 3 : 2); i++) columns(b, add(at(0.55)), R * (0.4 + r() * 0.5), r, hi ? 5 : 3);
  if (kind === 'braziers') for (let i = 0; i < 2; i++) {
    const Lx = at(0.5); const f = brazier(b, add(Lx), R * 0.3, true);
    glows.push({ p: W(f.applyMatrix4(Lx)), w: R * 0.6, color: [1, 0.55, 0.18], a: 0.5 });
  }
  if (kind === 'anvil') { anvil(b, add(mat(0, 0, 0, 0, r() * 6, 0)), R * 0.45, true); hammer(b, add(at(0.6)), R * 0.4); }
  if (kind === 'vent') for (let i = 0; i < 2; i++) { const Lx = at(0.5); const v = emberVent(b, add(Lx), R * 0.5); glows.push({ p: W(v.applyMatrix4(Lx)), w: R * 0.5, color: [1, 0.45, 0.12], a: 0.5 }); }
  if (kind === 'trees') { for (let i = 0; i < 2; i++) { const Lx = at(0.5); const g = lanternPost(b, add(Lx), R * 0.5, true); glows.push({ p: W(g.applyMatrix4(Lx)), w: R * 0.25, color: [1, 0.7, 0.3], a: 0.6 }); } }
  if (kind !== 'columns') columns(b, add(at(0.85)), R * (0.25 + r() * 0.2), r, 3);
  if (kind !== 'crystals' && hi) crystals(b, add(at(0.8)), R * 0.2, r, 3);
  return glows;
}
