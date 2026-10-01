// Section storage: Uint16 cells (uniform id or 0x8000|subIndex), subs = Uint8Array(64) per refined cell.

export const SECTION_CELLS = 4096;
export const REFINED = 0x8000;
export const SKY_FULL = 0xf0;

export const subIndex = (sx, sy, sz) => sx + sz * 4 + sy * 16;
export const secKeyStr = (cx, sy, cz) => cx + ',' + sy + ',' + cz;
export const chunkKeyStr = (cx, cz) => cx + ',' + cz;
// numeric key for hot paths; fits easily in a double
export const secKeyNum = (cx, sy, cz) => ((cx + 32768) * 65536 + (cz + 32768)) * 8 + sy;

export function newSection(cx, sy, cz, cells, light, subs) {
  return {
    key: secKeyStr(cx, sy, cz), cx, sy, cz,
    cells: cells || new Uint16Array(SECTION_CELLS),
    subs: subs || [],
    free: [],
    light: light || new Uint8Array(SECTION_CELLS).fill(SKY_FULL),
    version: 0, dirty: true, modified: false,
  };
}

function allocSub(sec, fill) {
  const arr = new Uint8Array(64);
  if (fill) arr.fill(fill);
  let ix;
  if (sec.free.length) { ix = sec.free.pop(); sec.subs[ix] = arr; }
  else { ix = sec.subs.length; sec.subs.push(arr); }
  return ix;
}

export function refineCell(sec, i) {
  const v = sec.cells[i];
  if (v & REFINED) return sec.subs[v & 0x7fff];
  const ix = allocSub(sec, v);
  sec.cells[i] = REFINED | ix;
  return sec.subs[ix];
}

export function setCellUniform(sec, i, mat) {
  const v = sec.cells[i];
  if (v & REFINED) { const ix = v & 0x7fff; sec.subs[ix] = null; sec.free.push(ix); }
  sec.cells[i] = mat;
}

// collapses a refined cell whose 64 subs agree; returns true if it is (now) uniform
export function tryCollapse(sec, i) {
  const v = sec.cells[i];
  if (!(v & REFINED)) return true;
  const s = sec.subs[v & 0x7fff];
  const m = s[0];
  for (let k = 1; k < 64; k++) if (s[k] !== m) return false;
  setCellUniform(sec, i, m);
  return true;
}

export function isAllAir(sec) {
  const c = sec.cells;
  for (let i = 0; i < SECTION_CELLS; i++) if (c[i] !== 0) return false;
  return true;
}

// renumber refined indices to 0..n-1 and drop holes; returns { cells copy, flat subs }
export function packSubs(sec) {
  const cells = new Uint16Array(sec.cells);
  const out = [];
  for (let i = 0; i < SECTION_CELLS; i++) {
    const v = cells[i];
    if (v & REFINED) { out.push(sec.subs[v & 0x7fff]); cells[i] = REFINED | (out.length - 1); }
  }
  const flat = new Uint8Array(out.length * 64);
  out.forEach((s, k) => flat.set(s, k * 64));
  return { cells, subs: flat };
}

export function unpackSubs(flat) {
  const subs = [];
  for (let k = 0; k * 64 < flat.length; k++) subs.push(flat.subarray(k * 64, k * 64 + 64));
  return subs;
}

export function refinedCount(sec) {
  let n = 0;
  for (let i = 0; i < SECTION_CELLS; i++) if (sec.cells[i] & REFINED) n++;
  return n;
}
