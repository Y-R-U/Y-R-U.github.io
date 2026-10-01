// setBox: fill / hollow / shell / replace on the fine grid. Whole aligned cells stay uniform (never refined).
import { BLOCKS, BLOCK, SOLID } from '../data/blocks.js';
import { REFINED, refineCell, setCellUniform, tryCollapse } from './section.js';

const LIQ = new Uint8Array(256);
for (const b of BLOCKS) if (b) LIQ[b.id] = b.liquid ? 1 : 0;
const WATER = BLOCK.WATER, KELP = BLOCK.SERVER_KELP, VINE = BLOCK.DATA_VINE, BLOOM = BLOCK.LUMEN_BLOOM, RAIL = BLOCK.CLIMB_RAIL;
const GROUNDED = new Uint8Array(256); // plants that need solid ground below
for (const b of BLOCKS) if (b && b.plant && !b.hangs && !b.waterlogged && b.key !== 'glowbulb') GROUNDED[b.id] = 1;
const FLOOD_CAP = 2048;
const POUR_CAP = 512, POUR_SPREAD = 3;

// opts: { wall: subs (default 4, hollow/shell wall thickness), flow: true (water fills new holes), support: true }
export function setBox(world, min, max, mat, mode = 'fill', opts = {}) {
  let x0 = Math.min(min[0], max[0]), x1 = Math.max(min[0], max[0]);
  let y0 = Math.min(min[1], max[1]), y1 = Math.max(min[1], max[1]);
  let z0 = Math.min(min[2], max[2]), z1 = Math.max(min[2], max[2]);
  y0 = Math.max(y0, 4); // cell y=0 (coreplate floor) is immutable
  y1 = Math.min(y1, 512);
  const removed = new Uint32Array(256);
  const res = { changed: 0, removed: [] };
  if (x0 >= x1 || y0 >= y1 || z0 >= z1) return res;
  mat &= 255;
  const w = Math.max(1, opts.wall ?? 4);
  const ix0 = x0 + w, ix1 = x1 - w, iy0 = y0 + w, iy1 = y1 - w, iz0 = z0 + w, iz1 = z1 - w;
  const hasInt = ix0 < ix1 && iy0 < iy1 && iz0 < iz1;
  const changedCells = [];
  const wasWater = new Set();
  let changed = 0;

  const count = (old, nw) => { if (old !== nw) { changed++; if (old && !LIQ[old]) removed[old]++; } };

  for (let cy = y0 >> 2; cy <= (y1 - 1) >> 2; cy++)
    for (let cz = z0 >> 2; cz <= (z1 - 1) >> 2; cz++)
      for (let cx = x0 >> 2; cx <= (x1 - 1) >> 2; cx++) {
        const bx = cx * 4, by = cy * 4, bz = cz * 4;
        const ax0 = Math.max(x0, bx), ax1 = Math.min(x1, bx + 4);
        const ay0 = Math.max(y0, by), ay1 = Math.min(y1, by + 4);
        const az0 = Math.max(z0, bz), az1 = Math.min(z1, bz + 4);
        const full = ax0 === bx && ax1 === bx + 4 && ay0 === by && ay1 === by + 4 && az0 === bz && az1 === bz + 4;
        let overInt = false, inInt = false;
        if (hasInt) {
          overInt = ax0 < ix1 && ax1 > ix0 && ay0 < iy1 && ay1 > iy0 && az0 < iz1 && az1 > iz0;
          inInt = ax0 >= ix0 && ax1 <= ix1 && ay0 >= iy0 && ay1 <= iy1 && az0 >= iz0 && az1 <= iz1;
        }
        const sec = world._materialize(cx >> 4, cy >> 4, cz >> 4);
        if (!sec) continue; // unloaded
        const i = (cx & 15) + (cz & 15) * 16 + (cy & 15) * 256;
        const v = sec.cells[i];
        const before = changed;
        const wasW = v === WATER;

        // uniform target for the whole cell, or -1 = per-sub, -2 = untouched
        let target = -1;
        if (full) {
          if (mode === 'fill') target = mat;
          else if (mode === 'hollow') target = inInt ? 0 : (!overInt ? mat : -1);
          else if (mode === 'shell') target = inInt ? -2 : (!overInt ? mat : -1);
          else if (mode === 'replace') target = (v & REFINED) ? -1 : (v !== 0 ? mat : -2);
        } else if (mode === 'replace' && v === 0) target = -2;
        else if (mode === 'shell' && inInt) target = -2;
        if (target === -2) continue;

        if (target >= 0) {
          if (v & REFINED) {
            const s = sec.subs[v & 0x7fff];
            for (let k = 0; k < 64; k++) count(s[k], target);
            setCellUniform(sec, i, target);
          } else if (v !== target) {
            changed += 64;
            if (v && !LIQ[v]) removed[v] += 64;
            sec.cells[i] = target;
          }
        } else {
          for (let sy = ay0; sy < ay1; sy++) for (let sz = az0; sz < az1; sz++) for (let sx = ax0; sx < ax1; sx++) {
            const si = (sx & 3) + (sz & 3) * 4 + (sy & 3) * 16;
            const cv = sec.cells[i];
            const cur = (cv & REFINED) ? sec.subs[cv & 0x7fff][si] : cv;
            let t;
            if (mode === 'fill') t = mat;
            else if (mode === 'replace') { if (!cur) continue; t = mat; }
            else {
              const interior = hasInt && sx >= ix0 && sx < ix1 && sy >= iy0 && sy < iy1 && sz >= iz0 && sz < iz1;
              if (interior) { if (mode === 'shell') continue; t = 0; } else t = mat;
            }
            if (cur === t) continue;
            refineCell(sec, i)[si] = t;
            count(cur, t);
          }
          tryCollapse(sec, i);
        }
        if (changed !== before) {
          sec.modified = true;
          changedCells.push(cx, cy, cz);
          if (wasW) wasWater.add(cx + ',' + cy + ',' + cz);
        }
      }

  if (changedCells.length) {
    if (opts.support !== false) supportPass(world, changedCells, x0 >> 2, (x1 - 1) >> 2, (y0 >> 2), (y1 - 1) >> 2, z0 >> 2, (z1 - 1) >> 2, removed);
    if (opts.flow !== false) {
      const n0 = changedCells.length;
      floodPass(world, changedCells, wasWater);
      if (mat === WATER) placedWaterFlow(world, changedCells, n0);
    }
    world._afterEdit(changedCells);
  }
  res.changed = changed;
  for (let m = 1; m < 256; m++) if (removed[m]) res.removed.push({ mat: m, count: removed[m], blocks: removed[m] / 64 });
  res.removed.sort((a, b) => b.count - a.count);
  return res;
}

function supports(world, x, y, z) {
  const v = world.getCell(x, y, z);
  return v === -1 || SOLID[v] === 1;
}

// plants on top of the box lose their ground; vines under it lose their anchor
function supportPass(world, changedCells, cx0, cx1, cy0, cy1, cz0, cz1, removed) {
  const kill = (x, y, z, v) => {
    const sec = world._materialize(x >> 4, y >> 4, z >> 4);
    if (!sec) return;
    sec.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256] = v === KELP ? WATER : 0;
    sec.modified = true;
    removed[v] += 64;
    changedCells.push(x, y, z);
  };
  for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
    for (let y = cy1 + 1; y < 128; y++) {
      const v = world.getCell(x, y, z);
      if (GROUNDED[v] && !supports(world, x, y - 1, z)) kill(x, y, z, v);
      else if (v === KELP && !supports(world, x, y - 1, z) && world.getCell(x, y - 1, z) !== KELP) kill(x, y, z, v);
      else break;
    }
    for (let y = cy0 - 1; y > 0; y--) {
      const v = world.getCell(x, y, z);
      if (v !== VINE && v !== BLOCK.FILAMENT_MOSS) break;
      const up = world.getCell(x, y + 1, z);
      if (up === v || up === -1 || (up > 0 && SOLID[up])) break;
      kill(x, y, z, v);
    }
  }
  // climb rails on the ring around the box lose their wall
  for (let y = cy0; y <= cy1; y++) for (let z = cz0 - 1; z <= cz1 + 1; z++) for (let x = cx0 - 1; x <= cx1 + 1; x++) {
    if (x >= cx0 && x <= cx1 && z >= cz0 && z <= cz1) continue;
    if (world.getCell(x, y, z) === RAIL && !railWall(world, x, y, z)) kill(x, y, z, RAIL);
  }
}

// the wall a climb rail hangs on: first solid horizontal neighbour in -x, +x, -z, +z order; returns the face
// normal pointing away from that wall, or null
export function railWall(world, x, y, z) {
  if (supports(world, x - 1, y, z)) return [1, 0, 0];
  if (supports(world, x + 1, y, z)) return [-1, 0, 0];
  if (supports(world, x, y, z - 1)) return [0, 0, 1];
  if (supports(world, x, y, z + 1)) return [0, 0, -1];
  return null;
}

// water runs into fresh holes: sideways and down from any adjacent water cell
function floodPass(world, changedCells, wasWater) {
  const q = [];
  const n = changedCells.length;
  const isAir = (x, y, z) => y > 0 && y < 128 && world.getCell(x, y, z) === 0 && !wasWater.has(x + ',' + y + ',' + z);
  const touchesWater = (x, y, z) =>
    world.getCell(x + 1, y, z) === WATER || world.getCell(x - 1, y, z) === WATER ||
    world.getCell(x, y, z + 1) === WATER || world.getCell(x, y, z - 1) === WATER || world.getCell(x, y + 1, z) === WATER;
  for (let k = 0; k < n; k += 3) {
    const x = changedCells[k], y = changedCells[k + 1], z = changedCells[k + 2];
    if (isAir(x, y, z) && touchesWater(x, y, z)) q.push(x, y, z);
  }
  let filled = 0;
  for (let h = 0; h < q.length && filled < FLOOD_CAP; h += 3) {
    const x = q[h], y = q[h + 1], z = q[h + 2];
    if (!isAir(x, y, z)) continue;
    const sec = world._materialize(x >> 4, y >> 4, z >> 4);
    if (!sec) continue;
    sec.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256] = WATER;
    sec.modified = true;
    changedCells.push(x, y, z);
    filled++;
    if (isAir(x + 1, y, z)) q.push(x + 1, y, z);
    if (isAir(x - 1, y, z)) q.push(x - 1, y, z);
    if (isAir(x, y, z + 1)) q.push(x, y, z + 1);
    if (isAir(x, y, z - 1)) q.push(x, y, z - 1);
    if (isAir(x, y - 1, z)) q.push(x, y - 1, z);
  }
}

// player-placed water: falls straight down, then spreads up to POUR_SPREAD cells over whatever it lands on.
// Full-cell water only (no flow levels), capped, so one pour can never flood the map.
function placedWaterFlow(world, changedCells, n) {
  const q = [];
  for (let k = 0; k < n; k += 3) {
    const x = changedCells[k], y = changedCells[k + 1], z = changedCells[k + 2];
    if (world.getCell(x, y, z) === WATER) q.push(x, y, z, 0);
  }
  const air = (x, y, z) => y > 0 && y < 128 && world.getCell(x, y, z) === 0;
  let placed = 0;
  const fill = (x, y, z, d) => {
    const sec = world._materialize(x >> 4, y >> 4, z >> 4);
    if (!sec) return;
    sec.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256] = WATER;
    sec.modified = true;
    changedCells.push(x, y, z);
    q.push(x, y, z, d);
    placed++;
  };
  for (let h = 0; h < q.length && placed < POUR_CAP; h += 4) {
    const x = q[h], y = q[h + 1], z = q[h + 2], d = q[h + 3];
    if (air(x, y - 1, z)) { fill(x, y - 1, z, 0); continue; }
    if (world.getCell(x, y - 1, z) === WATER || d >= POUR_SPREAD) continue;
    if (air(x + 1, y, z)) fill(x + 1, y, z, d + 1);
    if (air(x - 1, y, z)) fill(x - 1, y, z, d + 1);
    if (air(x, y, z + 1)) fill(x, y, z + 1, d + 1);
    if (air(x, y, z - 1)) fill(x, y, z - 1, d + 1);
  }
}

// ---------- copy / paste (lane 3 undo + paste) ----------
// data layout: Uint8Array(w*h*d), index (x-x0) + (z-z0)*w + (y-y0)*w*d over subs, x fastest. 255 = "leave as is".
export const KEEP = 255;

export function readBox(world, min, max) {
  const x0 = Math.min(min[0], max[0]), x1 = Math.max(min[0], max[0]);
  const y0 = Math.min(min[1], max[1]), y1 = Math.max(min[1], max[1]);
  const z0 = Math.min(min[2], max[2]), z1 = Math.max(min[2], max[2]);
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const data = new Uint8Array(Math.max(0, w * h * d));
  let unloaded = false;
  for (let cy = y0 >> 2; cy <= (y1 - 1) >> 2; cy++) for (let cz = z0 >> 2; cz <= (z1 - 1) >> 2; cz++) for (let cx = x0 >> 2; cx <= (x1 - 1) >> 2; cx++) {
    const v = world.getCell(cx, cy, cz);
    if (v === 0 && !world.isChunkLoaded(cx >> 4, cz >> 4)) unloaded = true;
    const sec = v === -1 ? world._secAt(cx >> 4, cy >> 4, cz >> 4) : null;
    const sub = sec ? sec.subs[sec.cells[(cx & 15) + (cz & 15) * 16 + (cy & 15) * 256] & 0x7fff] : null;
    for (let sy = Math.max(y0, cy * 4); sy < Math.min(y1, cy * 4 + 4); sy++)
      for (let sz = Math.max(z0, cz * 4); sz < Math.min(z1, cz * 4 + 4); sz++) {
        let o = (Math.max(x0, cx * 4) - x0) + (sz - z0) * w + (sy - y0) * w * d;
        for (let sx = Math.max(x0, cx * 4); sx < Math.min(x1, cx * 4 + 4); sx++, o++)
          data[o] = sub ? sub[(sx & 3) + (sz & 3) * 4 + (sy & 3) * 16] : v;
      }
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1], size: [w, h, d], data, unloaded };
}

// writes `data` (same layout as readBox) into the box. opts: { skipAir: false } treats 0 like KEEP (paste without
// carving). Same bookkeeping as setBox: whole uniform cells stay uniform, removed counts, support pass, relight.
export function writeBox(world, min, max, data, opts = {}) {
  const x0 = Math.min(min[0], max[0]), x1 = Math.max(min[0], max[0]);
  const y0 = Math.min(min[1], max[1]), y1 = Math.max(min[1], max[1]);
  const z0 = Math.min(min[2], max[2]), z1 = Math.max(min[2], max[2]);
  const w = x1 - x0, d = z1 - z0;
  const res = { changed: 0, removed: [] };
  if (data.length !== w * (y1 - y0) * d) throw new Error('writeBox: data size does not match the box');
  const removed = new Uint32Array(256), changedCells = [];
  const skipAir = !!opts.skipAir;
  let changed = 0;
  const at = (sx, sy, sz) => {
    if (sy < 4) return KEEP;
    const m = data[(sx - x0) + (sz - z0) * w + (sy - y0) * w * d];
    return skipAir && m === 0 ? KEEP : m;
  };
  for (let cy = Math.max(1, y0 >> 2); cy <= Math.min(127, (y1 - 1) >> 2); cy++)
    for (let cz = z0 >> 2; cz <= (z1 - 1) >> 2; cz++) for (let cx = x0 >> 2; cx <= (x1 - 1) >> 2; cx++) {
      const sec = world._materialize(cx >> 4, cy >> 4, cz >> 4);
      if (!sec) continue;
      const i = (cx & 15) + (cz & 15) * 16 + (cy & 15) * 256;
      const ax0 = Math.max(x0, cx * 4), ax1 = Math.min(x1, cx * 4 + 4), ay0 = Math.max(y0, cy * 4), ay1 = Math.min(y1, cy * 4 + 4);
      const az0 = Math.max(z0, cz * 4), az1 = Math.min(z1, cz * 4 + 4);
      const full = ax1 - ax0 === 4 && ay1 - ay0 === 4 && az1 - az0 === 4;
      const before = changed;
      let uni = -1;
      if (full) {
        uni = at(ax0, ay0, az0);
        for (let sy = ay0; sy < ay1 && uni >= 0; sy++) for (let sz = az0; sz < az1 && uni >= 0; sz++)
          for (let sx = ax0; sx < ax1; sx++) if (at(sx, sy, sz) !== uni) { uni = -1; break; }
        if (uni === KEEP) continue;
      }
      const v = sec.cells[i];
      if (uni >= 0) {
        if (v & REFINED) {
          const s = sec.subs[v & 0x7fff];
          for (let k = 0; k < 64; k++) if (s[k] !== uni) { changed++; if (s[k] && !LIQ[s[k]]) removed[s[k]]++; }
          setCellUniform(sec, i, uni);
        } else if (v !== uni) {
          changed += 64;
          if (v && !LIQ[v]) removed[v] += 64;
          sec.cells[i] = uni;
        }
      } else {
        for (let sy = ay0; sy < ay1; sy++) for (let sz = az0; sz < az1; sz++) for (let sx = ax0; sx < ax1; sx++) {
          const t = at(sx, sy, sz);
          if (t === KEEP) continue;
          const si = (sx & 3) + (sz & 3) * 4 + (sy & 3) * 16, cv = sec.cells[i];
          const cur = (cv & REFINED) ? sec.subs[cv & 0x7fff][si] : cv;
          if (cur === t) continue;
          refineCell(sec, i)[si] = t;
          changed++;
          if (cur && !LIQ[cur]) removed[cur]++;
        }
        tryCollapse(sec, i);
      }
      if (changed !== before) { sec.modified = true; changedCells.push(cx, cy, cz); }
    }
  if (changedCells.length) {
    if (opts.support !== false) supportPass(world, changedCells, x0 >> 2, (x1 - 1) >> 2, y0 >> 2, (y1 - 1) >> 2, z0 >> 2, (z1 - 1) >> 2, removed);
    world._afterEdit(changedCells);
  }
  res.changed = changed;
  for (let m = 1; m < 256; m++) if (removed[m]) res.removed.push({ mat: m, count: removed[m], blocks: removed[m] / 64 });
  res.removed.sort((a, b) => b.count - a.count);
  return res;
}
