// Build-mode edit history (undo/redo) and copy/paste stamps, on top of world.readBox/writeBox.
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
  const r = world.readBox(min, max);   // { size, data, unloaded }, same index order
  return snapshot && r.unloaded ? keepUnloaded(world, min, max, r.data) : r.data;
}

export function rleEncode(data) {
  let out = new Uint8Array(Math.min(2 * data.length, 1 << 16) || 2), o = 0;
  for (let i = 0; i < data.length;) {
    const v = data[i];
    let n = 1;
    while (n < 255 && i + n < data.length && data[i + n] === v) n++;
    if (o + 2 > out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g; }
    out[o++] = v; out[o++] = n;
    i += n;
  }
  return out.slice(0, o);
}

export function rleDecode(rle, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) { out.fill(rle[i], o, o + rle[i + 1]); o += rle[i + 1]; }
  return out;
}

// Write dense data back. keepAir: air in the data leaves the world untouched (stamps); otherwise exact restore.
export function writeBox(world, min, max, data, { keepAir = false } = {}) {
  return world.writeBox(min, max, data, { skipAir: keepAir });
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

// Snapshots are kept raw at first (a 64 m stamp's snapshot is one readBox, no encode on the stamp frame) and
// RLE-compressed later, one entry per idle slot.
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));

export function createHistory({ maxSteps = MAX_UNDO, maxBytes = UNDO_BYTES } = {}) {
  const undo = [], redo = [];
  let bytes = 0, packing = false;
  const size = (e) => (e.raw ? e.raw.length : e.rle.length);
  const trim = () => {
    while (undo.length && (undo.length + redo.length > maxSteps || bytes > maxBytes)) bytes -= size(undo.shift());
    while (redo.length && bytes > maxBytes) bytes -= size(redo.shift());
  };
  const pack = () => {
    packing = false;
    const e = undo.find((x) => x.raw) || redo.find((x) => x.raw);
    if (!e) return;
    const rle = rleEncode(e.raw);
    bytes += rle.length - e.raw.length;
    e.rle = rle; e.raw = null;
    later();
  };
  const later = () => { if (!packing && (undo.some((x) => x.raw) || redo.some((x) => x.raw))) { packing = true; idle(pack); } };
  const snap = (world, min, max) => {
    const [sx, sy, sz] = sizeOf(min, max);
    if (sx * sy * sz > MAX_BOX_SUBS || sx <= 0 || sy <= 0 || sz <= 0) return null;
    return { min: min.slice(), max: max.slice(), raw: readBox(world, min, max, { snapshot: true }), rle: null };
  };
  const swap = (world, from, to) => {
    const e = from.pop();
    if (!e) return null;
    bytes -= size(e);
    const cur = snap(world, e.min, e.max);
    const [sx, sy, sz] = sizeOf(e.min, e.max);
    writeBox(world, e.min, e.max, e.raw || rleDecode(e.rle, sx * sy * sz));
    if (cur) { to.push(cur); bytes += size(cur); trim(); later(); }
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
      for (const r of redo) bytes -= size(r);
      redo.length = 0;
      undo.push(e); bytes += size(e);
      trim();
      later();
      return true;
    },
    undo(world) { return swap(world, undo, redo); },
    redo(world) { return swap(world, redo, undo); },
    clear() { undo.length = redo.length = 0; bytes = 0; },
  };
}
