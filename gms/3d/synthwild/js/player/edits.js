// Build-mode edit history (undo/redo) and copy/paste stamps. Works on any world exposing
// getCell/getSub/setBox; uses world.readBox/writeBox when lane 1 provides them.
// Dense box data is x-fastest: i = x + z*sx + y*sx*sz.

export const MAX_UNDO = 50;
export const UNDO_BYTES = 48 << 20;      // RLE bytes kept across all undo + redo entries
export const MAX_BOX_SUBS = 8 << 20;     // larger edits are applied but not undoable / copyable

export const sizeOf = (min, max) => [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

export const KEEP = 255;

// Marks every sub inside a chunk that isn't loaded as KEEP, so a restore never writes air over terrain it never saw.
function keepUnloaded(world, min, max, data) {
  const [sx, , sz] = sizeOf(min, max), sxz = sx * sz;
  for (let cz = min[2] >> 6; cz <= (max[2] - 1) >> 6; cz++) for (let cx = min[0] >> 6; cx <= (max[0] - 1) >> 6; cx++) {
    if (world.isChunkLoaded(cx, cz)) continue;
    const x0 = Math.max(min[0], cx * 64), x1 = Math.min(max[0], cx * 64 + 64);
    const z0 = Math.max(min[2], cz * 64), z1 = Math.min(max[2], cz * 64 + 64);
    for (let y = min[1]; y < max[1]; y++) for (let z = z0; z < z1; z++) {
      const i = (x0 - min[0]) + (z - min[2]) * sx + (y - min[1]) * sxz;
      data.fill(KEEP, i, i + (x1 - x0));
    }
  }
  return data;
}

export function readBox(world, min, max, { snapshot = false } = {}) {
  if (world.readBox) {   // lane 1: { size, data, unloaded }, same index order
    const r = world.readBox(min, max);
    return snapshot && r.unloaded && world.isChunkLoaded ? keepUnloaded(world, min, max, r.data) : r.data;
  }
  const [sx, sy, sz] = sizeOf(min, max);
  const out = new Uint8Array(sx * sy * sz);
  const sxz = sx * sz;
  for (let cy = min[1] >> 2; cy <= (max[1] - 1) >> 2; cy++)
    for (let cz = min[2] >> 2; cz <= (max[2] - 1) >> 2; cz++)
      for (let cx = min[0] >> 2; cx <= (max[0] - 1) >> 2; cx++) {
        const x0 = Math.max(min[0], cx * 4), x1 = Math.min(max[0], cx * 4 + 4);
        const y0 = Math.max(min[1], cy * 4), y1 = Math.min(max[1], cy * 4 + 4);
        const z0 = Math.max(min[2], cz * 4), z1 = Math.min(max[2], cz * 4 + 4);
        const v = world.getCell(cx, cy, cz);
        for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
          let i = (x0 - min[0]) + (z - min[2]) * sx + (y - min[1]) * sxz;
          if (v >= 0) { out.fill(v, i, i + (x1 - x0)); continue; }
          for (let x = x0; x < x1; x++) out[i++] = world.getSub(x, y, z);
        }
      }
  return out;
}

export function rleEncode(data) {
  const out = [];
  for (let i = 0; i < data.length;) {
    const v = data[i];
    let n = 1;
    while (n < 255 && i + n < data.length && data[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return Uint8Array.from(out);
}

export function rleDecode(rle, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) { out.fill(rle[i], o, o + rle[i + 1]); o += rle[i + 1]; }
  return out;
}

// Greedy decomposition of dense data into same-material boxes: [x0,y0,z0,x1,y1,z1,mat] (local, max exclusive).
export function greedyBoxes(data, size, skip = -1) {
  const [sx, sy, sz] = size, sxz = sx * sz;
  const done = new Uint8Array(data.length);
  const boxes = [];
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + z * sx + y * sxz;
    if (done[i]) continue;
    const m = data[i];
    if (m === skip) { done[i] = 1; continue; }
    let w = 1;
    while (x + w < sx && !done[i + w] && data[i + w] === m) w++;
    const rowOk = (zz, yy) => {
      const b = x + zz * sx + yy * sxz;
      for (let k = 0; k < w; k++) if (done[b + k] || data[b + k] !== m) return false;
      return true;
    };
    let d = 1;
    while (z + d < sz && rowOk(z + d, y)) d++;
    let h = 1;
    outer: while (y + h < sy) { for (let zz = z; zz < z + d; zz++) if (!rowOk(zz, y + h)) break outer; h++; }
    for (let yy = y; yy < y + h; yy++) for (let zz = z; zz < z + d; zz++) done.fill(1, x + zz * sx + yy * sxz, x + zz * sx + yy * sxz + w);
    boxes.push([x, y, z, x + w, y + h, z + d, m]);
  }
  return boxes;
}

// Write dense data back. keepAir: air in the data leaves the world untouched (stamps); otherwise exact restore.
export function writeBox(world, min, max, data, { keepAir = false } = {}) {
  if (world.writeBox) return world.writeBox(min, max, data, { skipAir: keepAir });
  const opts = { flow: false, support: false };
  let changed = 0;
  if (!keepAir) changed += world.setBox(min, max, 0, 'fill', opts)?.changed || 0;
  for (const b of greedyBoxes(data, sizeOf(min, max), 0)) {
    const a = [min[0] + b[0], min[1] + b[1], min[2] + b[2]], z = [min[0] + b[3], min[1] + b[4], min[2] + b[5]];
    changed += world.setBox(a, z, b[6], 'fill', opts)?.changed || 0;
  }
  return { changed };
}

export function rotateY(data, size) {
  const [sx, sy, sz] = size, out = new Uint8Array(data.length);
  const nx = sz, nz = sx;
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++)
    out[(sz - 1 - z) + x * nx + y * nx * nz] = data[x + z * sx + y * sx * sz];
  return { data: out, size: [nx, sy, nz] };
}

export function mirrorX(data, size) {
  const [sx, sy, sz] = size, out = new Uint8Array(data.length);
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    const b = z * sx + y * sx * sz;
    for (let x = 0; x < sx; x++) out[b + sx - 1 - x] = data[b + x];
  }
  return { data: out, size };
}

// Where a stamp of `size` subs goes for a hit: flush to the face, bottom on the hit level for side faces,
// centred on the other axes, aligned to the brush scale grid n (subs).
export function stampBox(hit, normal, size, n = 1) {
  const a = normal[0] ? 0 : normal[1] ? 1 : 2, dir = normal[a] || 1;
  const min = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (i === a) min[i] = dir > 0 ? hit[i] + 1 : hit[i] - size[i];
    else if (i === 1) min[i] = Math.floor(hit[1] / n) * n;
    else min[i] = Math.floor((hit[i] - Math.floor(size[i] / 2)) / n) * n;
  }
  return { min, max: min.map((v, i) => v + size[i]) };
}

export function createHistory({ maxSteps = MAX_UNDO, maxBytes = UNDO_BYTES } = {}) {
  const undo = [], redo = [];
  let bytes = 0;
  const trim = () => {
    while (undo.length && (undo.length + redo.length > maxSteps || bytes > maxBytes)) bytes -= undo.shift().rle.length;
    while (redo.length && bytes > maxBytes) bytes -= redo.shift().rle.length;
  };
  const snap = (world, min, max) => {
    const [sx, sy, sz] = sizeOf(min, max);
    if (sx * sy * sz > MAX_BOX_SUBS || sx <= 0 || sy <= 0 || sz <= 0) return null;
    const rle = rleEncode(readBox(world, min, max, { snapshot: true }));
    return { min: min.slice(), max: max.slice(), rle };
  };
  const swap = (world, from, to) => {
    const e = from.pop();
    if (!e) return null;
    bytes -= e.rle.length;
    const cur = snap(world, e.min, e.max);
    const [sx, sy, sz] = sizeOf(e.min, e.max);
    writeBox(world, e.min, e.max, rleDecode(e.rle, sx * sy * sz));
    if (cur) { to.push(cur); bytes += cur.rle.length; trim(); }
    return e;
  };
  return {
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
    get bytes() { return bytes; },
    get steps() { return undo.length; },
    // Call BEFORE the edit. Returns false when the box is too big to record.
    record(world, min, max) {
      const e = snap(world, min, max);
      if (!e) return false;
      for (const r of redo) bytes -= r.rle.length;
      redo.length = 0;
      undo.push(e); bytes += e.rle.length;
      trim();
      return true;
    },
    undo(world) { return swap(world, undo, redo); },
    redo(world) { return swap(world, redo, undo); },
    clear() { undo.length = redo.length = 0; bytes = 0; },
  };
}
