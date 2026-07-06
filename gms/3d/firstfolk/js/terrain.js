// The sculptable island. A (GRID+1)² heightfield displaces one PlaneGeometry;
// the ground texture is a single painted canvas (strata by height/slope +
// speckle grain) repainted only in the rect a sculpt touches. Leylines live in
// a second canvas wired to emissiveMap so they glow — hardest at night.

import * as THREE from 'three';
import { CELL, GRID, HALF, SEA, CFG } from './config.js';
import { clamp, lerp, hash2, fbm } from './utils.js';

const N = GRID + 1;                    // corners per side
const TEXN = 1024, LEYN = 768;
const PXW = TEXN / (GRID * CELL);      // texture px per world unit

export const cellToWorld = (cx, cz) => ({ x: (cx + 0.5) * CELL - HALF, z: (cz + 0.5) * CELL - HALF });
export const worldToCell = (wx, wz) => ({
  cx: clamp(Math.floor((wx + HALF) / CELL), 0, GRID - 1),
  cz: clamp(Math.floor((wz + HALF) / CELL), 0, GRID - 1),
});
export const cellIdx = (cx, cz) => cx + cz * GRID;
export const inIsle = (cx, cz) => cx >= 0 && cz >= 0 && cx < GRID && cz < GRID;

export function createTerrain(scene, seed = 3) {
  const H = new Float32Array(N * N);
  const ley = new Uint8Array(GRID * GRID);       // leyline cells
  const obstacle = new Uint8Array(GRID * GRID);  // 0 free · 1 tree/rock · 2 building

  // ── island generation ──────────────────────────────────────────────────────
  const crag = { x: 34, z: -34 };                // rocky NE crag (quarry country)
  const camp = { x: 0, z: 26 };                  // gentle meadow, village start
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const wx = ix * CELL - HALF, wz = iz * CELL - HALF;
      const nx = ix / N, nz = iz / N;
      const r = Math.hypot(wx, wz);
      const wobble = fbm(nx * 3.1, nz * 3.1, 3, seed + 11) - 0.5;
      const edge = HALF * (0.80 + wobble * 0.22);            // noisy coastline
      const fall = clamp(1 - (r / edge) ** 2.6, -0.6, 1);
      let h = fall * (2.0 + fbm(nx * 4.5, nz * 4.5, 4, seed) * 6.5) - 1.1;
      // the crag: a steep rocky shoulder
      const dc = Math.hypot(wx - crag.x, wz - crag.z);
      h += Math.max(0, 1 - dc / 30) ** 1.6 * 7.5 * (0.75 + fbm(nx * 7, nz * 7, 3, seed + 5) * 0.5);
      // soften a meadow for the first camp
      const dm = Math.hypot(wx - camp.x, wz - camp.z);
      const meadow = Math.max(0, 1 - dm / 22);
      h = lerp(h, 1.35, meadow * meadow * 0.9);
      H[ix + iz * N] = clamp(h, CFG.sculpt.minH, CFG.sculpt.maxH);
    }
  }

  // ── mesh ───────────────────────────────────────────────────────────────────
  const geo = new THREE.PlaneGeometry(GRID * CELL, GRID * CELL, GRID, GRID).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, H[i]);
  geo.computeVertexNormals();

  const mapC = document.createElement('canvas');
  mapC.width = mapC.height = TEXN;
  const mapG = mapC.getContext('2d', { willReadFrequently: true });
  const mapTex = new THREE.CanvasTexture(mapC);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.anisotropy = 4;

  const leyC = document.createElement('canvas');
  leyC.width = leyC.height = LEYN;
  const leyG = leyC.getContext('2d');
  const leyTex = new THREE.CanvasTexture(leyC);

  const mat = new THREE.MeshStandardMaterial({
    map: mapTex, roughness: 0.94, metalness: 0,
    emissive: new THREE.Color(0x36e2b4), emissiveMap: leyTex, emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  // ── water ──────────────────────────────────────────────────────────────────
  const wgeo = new THREE.PlaneGeometry(520, 520, 72, 72).rotateX(-Math.PI / 2);
  const wmat = new THREE.MeshStandardMaterial({
    color: 0x2a6f95, roughness: 0.28, metalness: 0.05,
    transparent: true, opacity: 0.88,
  });
  const water = new THREE.Mesh(wgeo, wmat);
  water.position.y = SEA - 0.12;
  water.receiveShadow = true;
  scene.add(water);
  const deep = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0d2b3d }));
  deep.position.y = SEA - 2.4;
  scene.add(deep);
  const wpos = wgeo.attributes.position;
  const wbase = wpos.array.slice();

  const T = {
    H, ley, obstacle, mesh, water, group: mesh, seed, camp, crag,
    mat, leyTex,
  };

  // ── queries ────────────────────────────────────────────────────────────────
  T.hAt = (ix, iz) => H[clamp(ix, 0, N - 1) + clamp(iz, 0, N - 1) * N];
  T.heightAt = (wx, wz) => {
    const fx = clamp((wx + HALF) / CELL, 0, GRID - 0.001), fz = clamp((wz + HALF) / CELL, 0, GRID - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    return lerp(lerp(T.hAt(ix, iz), T.hAt(ix + 1, iz), u), lerp(T.hAt(ix, iz + 1), T.hAt(ix + 1, iz + 1), u), v);
  };
  T.cellH = (cx, cz) => (T.hAt(cx, cz) + T.hAt(cx + 1, cz) + T.hAt(cx, cz + 1) + T.hAt(cx + 1, cz + 1)) / 4;
  T.cellSlope = (cx, cz) => {
    const a = T.hAt(cx, cz), b = T.hAt(cx + 1, cz), c = T.hAt(cx, cz + 1), d = T.hAt(cx + 1, cz + 1);
    return (Math.max(a, b, c, d) - Math.min(a, b, c, d)) / CELL;
  };
  T.isLand = (cx, cz) => T.cellH(cx, cz) > 0.22;
  T.walkable = (cx, cz) =>
    inIsle(cx, cz) && obstacle[cellIdx(cx, cz)] === 0 && T.isLand(cx, cz) && T.cellSlope(cx, cz) < 1.15;
  T.isRock = (cx, cz) => T.cellSlope(cx, cz) > 0.85 || T.cellH(cx, cz) > 8.2;
  T.moveCost = (cx, cz) => {
    let c = 1 + T.cellSlope(cx, cz) * 1.8;
    if (ley[cellIdx(cx, cz)]) c *= 0.55;
    return c;
  };
  T.onLey = (wx, wz) => { const { cx, cz } = worldToCell(wx, wz); return !!ley[cellIdx(cx, cz)]; };

  // footprint spread (max-min corner height) for build validity
  T.spread = (cx, cz, size) => {
    let mn = Infinity, mx = -Infinity;
    for (let z = cz; z <= cz + size; z++) for (let x = cx; x <= cx + size; x++) {
      const h = T.hAt(x, z);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    return { mn, mx, spread: mx - mn };
  };
  T.canBuild = (cx, cz, size, needsRock = false) => {
    if (cx < 1 || cz < 1 || cx + size >= GRID - 1 || cz + size >= GRID - 1) return false;
    for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++)
      if (obstacle[cellIdx(x, z)] !== 0) return false;
    const { mn, spread } = T.spread(cx, cz, size);
    if (mn < 0.35 || spread > 0.9) return false;
    if (needsRock) {
      let rock = false;
      for (let z = cz - 1; z <= cz + size && !rock; z++) for (let x = cx - 1; x <= cx + size && !rock; x++)
        if (inIsle(x, z) && T.isRock(x, z)) rock = true;
      if (!rock) return false;
    }
    return true;
  };
  // gently level the plot a building sits on (Settlers QoL)
  T.levelArea = (cx, cz, size) => {
    let sum = 0, n = 0;
    for (let z = cz; z <= cz + size; z++) for (let x = cx; x <= cx + size; x++) { sum += T.hAt(x, z); n++; }
    const m = sum / n;
    for (let z = cz; z <= cz + size; z++) for (let x = cx; x <= cx + size; x++) H[x + z * N] = m;
    refreshRect(cx - 1, cz - 1, cx + size + 1, cz + size + 1);
    return m;
  };
  T.blockArea = (cx, cz, size, v = 2) => {
    for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) obstacle[cellIdx(x, z)] = v;
  };
  T.freeArea = (cx, cz, size) => T.blockArea(cx, cz, size, 0);

  // spiral search for a buildable spot near a world point
  T.findSpot = (wx, wz, size, needsRock = false, maxR = 22) => {
    const { cx: c0, cz: z0 } = worldToCell(wx, wz);
    for (let r = 0; r < maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = c0 + dx - (size >> 1), cz = z0 + dz - (size >> 1);
        if (T.canBuild(cx, cz, size, needsRock)) return { cx, cz };
      }
    }
    return null;
  };

  // ── ground painting ────────────────────────────────────────────────────────
  const COLS = {
    deepSand: [188, 165, 106], sand: [216, 196, 128], loam: [122, 96, 62],
    grassA: [104, 144, 66], grassB: [88, 128, 60], dry: [142, 148, 70],
    rock: [124, 118, 108], rockB: [104, 100, 94], snow: [232, 236, 238],
  };
  function colFor(h, slope, wx, wz) {
    const d1 = hash2(Math.floor(wx * 7), Math.floor(wz * 7), 91) - 0.5;
    const d2 = hash2(Math.floor(wx * 2.3), Math.floor(wz * 2.3), 55) - 0.5;
    let c;
    if (h < 0.18) c = COLS.deepSand;
    else if (h < 0.75) c = COLS.sand;
    else if (slope > 1.35) c = COLS.rockB;
    else if (slope > 0.85 || h > 8.2) c = COLS.rock;
    else if (h > 11) c = COLS.snow;
    else if (h > 6.2) c = COLS.dry;
    else c = (d2 > 0 ? COLS.grassA : COLS.grassB);
    // loam blend on flat low fertile ground
    if (h >= 0.75 && h < 1.6 && slope < 0.25 && d2 < -0.18) c = COLS.loam;
    const k = 1 + d1 * 0.16;
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  function paintPx(img, px0, pz0, pw, ph) {
    const data = img.data;
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const wx = (px0 + px) / PXW - HALF, wz = (pz0 + py) / PXW - HALF;
        const h = T.heightAt(wx, wz);
        const e = 0.9;
        const sl = Math.max(
          Math.abs(T.heightAt(wx + e, wz) - T.heightAt(wx - e, wz)),
          Math.abs(T.heightAt(wx, wz + e) - T.heightAt(wx, wz - e))) / (e * 2) * CELL;
        const [r, g, b] = colFor(h, sl, wx, wz);
        const o = (py * pw + px) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
  }
  function refreshTexRect(px0, pz0, pw, ph) {
    px0 = clamp(px0, 0, TEXN - 1); pz0 = clamp(pz0, 0, TEXN - 1);
    pw = Math.min(pw, TEXN - px0); ph = Math.min(ph, TEXN - pz0);
    if (pw <= 0 || ph <= 0) return;
    const img = mapG.createImageData(pw, ph);
    paintPx(img, px0, pz0, pw, ph);
    mapG.putImageData(img, px0, pz0);
    mapTex.needsUpdate = true;
  }
  T.paintAll = () => refreshTexRect(0, 0, TEXN, TEXN);

  // refresh mesh verts + normals + texture for a corner rect
  function refreshRect(x0, z0, x1, z1) {
    x0 = clamp(x0, 0, GRID); z0 = clamp(z0, 0, GRID); x1 = clamp(x1, 0, GRID); z1 = clamp(z1, 0, GRID);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + z * N;
      pos.setY(i, H[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    refreshTexRect(
      Math.floor((x0 - 1) * CELL * PXW), Math.floor((z0 - 1) * CELL * PXW),
      Math.ceil((x1 - x0 + 2) * CELL * PXW), Math.ceil((z1 - z0 + 2) * CELL * PXW));
  }
  T.refreshRect = refreshRect;

  // ── sculpting ──────────────────────────────────────────────────────────────
  // mode: raise | lower | flatten | smooth. Returns metres of change (for cost)
  // and the affected cell rect. Corners under buildings are locked.
  T.sculpt = (wx, wz, r, mode, dt, anchorH = null) => {
    const rate = CFG.sculpt.rate * dt;
    const ix0 = Math.max(0, Math.floor((wx - r + HALF) / CELL)), ix1 = Math.min(GRID, Math.ceil((wx + r + HALF) / CELL));
    const iz0 = Math.max(0, Math.floor((wz - r + HALF) / CELL)), iz1 = Math.min(GRID, Math.ceil((wz + r + HALF) / CELL));
    let vol = 0;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cwx = ix * CELL - HALF, cwz = iz * CELL - HALF;
        const d = Math.hypot(cwx - wx, cwz - wz);
        if (d > r) continue;
        if (cornerLocked(ix, iz)) continue;
        const w = Math.cos((d / r) * Math.PI * 0.5) ** 2;   // gaussian-ish falloff
        const i = ix + iz * N;
        let nh = H[i];
        if (mode === 'raise') nh += rate * w;
        else if (mode === 'lower') nh -= rate * w;
        else if (mode === 'flatten') nh = lerp(nh, anchorH ?? H[i], Math.min(1, rate * w * 0.9));
        else if (mode === 'smooth') {
          const avg = (T.hAt(ix - 1, iz) + T.hAt(ix + 1, iz) + T.hAt(ix, iz - 1) + T.hAt(ix, iz + 1)) / 4;
          nh = lerp(nh, avg, Math.min(1, rate * w));
        }
        nh = clamp(nh, CFG.sculpt.minH, CFG.sculpt.maxH);
        vol += Math.abs(nh - H[i]);
        H[i] = nh;
      }
    }
    if (vol > 0.0001) {
      refreshRect(ix0, iz0, ix1, iz1);
      T.onEdit?.({ cx0: Math.max(0, ix0 - 1), cz0: Math.max(0, iz0 - 1), cx1: Math.min(GRID - 1, ix1), cz1: Math.min(GRID - 1, iz1) });
    }
    return vol;
  };
  function cornerLocked(ix, iz) {
    // a corner is locked if any adjacent cell holds a building
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const cx = ix + dx, cz = iz + dz;
      if (inIsle(cx, cz) && obstacle[cellIdx(cx, cz)] === 2) return true;
    }
    return false;
  }

  // ── leylines ───────────────────────────────────────────────────────────────
  const leyPx = LEYN / (GRID * CELL);
  T.paintLey = (wx, wz, erase = false) => {
    const r = 1.6;                                     // world radius
    const { cx: c0, cz: z0 } = worldToCell(wx, wz);
    let changed = 0;
    for (let cz = z0 - 1; cz <= z0 + 1; cz++) for (let cx = c0 - 1; cx <= c0 + 1; cx++) {
      if (!inIsle(cx, cz)) continue;
      const { x, z } = cellToWorld(cx, cz);
      if (Math.hypot(x - wx, z - wz) > r + CELL * 0.4) continue;
      const i = cellIdx(cx, cz);
      if (erase && ley[i]) { ley[i] = 0; changed++; }
      else if (!erase && !ley[i] && T.isLand(cx, cz)) { ley[i] = 1; changed++; }
    }
    if (changed) redrawLeyRect(c0 - 2, z0 - 2, c0 + 2, z0 + 2);
    return changed;
  };
  function redrawLeyRect(cx0, cz0, cx1, cz1) {
    const px0 = clamp(Math.floor((cx0 * CELL) * leyPx), 0, LEYN), pz0 = clamp(Math.floor((cz0 * CELL) * leyPx), 0, LEYN);
    const pw = Math.min(LEYN - px0, Math.ceil((cx1 - cx0 + 1) * CELL * leyPx)), ph = Math.min(LEYN - pz0, Math.ceil((cz1 - cz0 + 1) * CELL * leyPx));
    leyG.clearRect(px0, pz0, pw, ph);
    leyG.fillStyle = '#000';
    leyG.fillRect(px0, pz0, pw, ph);
    for (let cz = Math.max(0, cz0 - 1); cz <= Math.min(GRID - 1, cz1 + 1); cz++) {
      for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(GRID - 1, cx1 + 1); cx++) {
        if (!ley[cellIdx(cx, cz)]) continue;
        const { x, z } = cellToWorld(cx, cz);
        const px = (x + HALF) * leyPx, pz = (z + HALF) * leyPx;
        const rr = CELL * 0.92 * leyPx;
        const grad = leyG.createRadialGradient(px, pz, rr * 0.15, px, pz, rr);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.55, 'rgba(190,255,235,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        leyG.fillStyle = grad;
        leyG.beginPath(); leyG.arc(px, pz, rr, 0, Math.PI * 2); leyG.fill();
      }
    }
    leyTex.needsUpdate = true;
  }
  T.redrawAllLey = () => { leyG.fillStyle = '#000'; leyG.fillRect(0, 0, LEYN, LEYN); redrawLeyRect(0, 0, GRID - 1, GRID - 1); };
  T.leyCount = () => { let n = 0; for (let i = 0; i < ley.length; i++) n += ley[i]; return n; };

  // ── per-frame ──────────────────────────────────────────────────────────────
  T.tick = (dt, t, night) => {
    // gentle waves
    const a = wpos.array;
    for (let i = 0; i < wpos.count; i++) {
      const x = wbase[i * 3], z = wbase[i * 3 + 2];
      a[i * 3 + 1] = Math.sin(t * 0.9 + x * 0.06) * 0.14 + Math.cos(t * 0.7 + z * 0.05) * 0.12;
    }
    wpos.needsUpdate = true;
    // leylines pulse, brighter at night
    mat.emissiveIntensity = (night ? 0.95 : 0.4) + Math.sin(t * 1.7) * 0.12;
  };

  // ── save / load ────────────────────────────────────────────────────────────
  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return btoa(s);
  };
  T.serialize = () => ({ h: b64(new Uint8Array(H.buffer)), l: b64(ley) });
  T.load = (data) => {
    const hb = atob(data.h);
    const u8 = new Uint8Array(hb.length);
    for (let i = 0; i < hb.length; i++) u8[i] = hb.charCodeAt(i);
    H.set(new Float32Array(u8.buffer));
    const lb = atob(data.l);
    for (let i = 0; i < lb.length && i < ley.length; i++) ley[i] = lb.charCodeAt(i);
    for (let i = 0; i < pos.count; i++) pos.setY(i, H[i]);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    T.paintAll();
    T.redrawAllLey();
  };

  leyG.fillStyle = '#000';
  leyG.fillRect(0, 0, LEYN, LEYN);
  leyTex.needsUpdate = true;
  T.paintAll();
  return T;
}
