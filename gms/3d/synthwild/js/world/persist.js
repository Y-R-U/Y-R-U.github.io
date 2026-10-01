// Section codec: varint RLE of the cells (refined renumbered in order) + varint RLE of the flat subs, base64.
import { SECTION_CELLS, REFINED, packSubs, unpackSubs } from './section.js';

class Writer {
  constructor() { this.b = new Uint8Array(256); this.n = 0; }
  byte(v) {
    if (this.n >= this.b.length) { const nb = new Uint8Array(this.b.length * 2); nb.set(this.b); this.b = nb; }
    this.b[this.n++] = v;
  }
  varint(v) { while (v >= 0x80) { this.byte((v & 0x7f) | 0x80); v >>>= 7; } this.byte(v); }
  out() { return this.b.subarray(0, this.n); }
}

function rle(w, arr) {
  let i = 0;
  const n = arr.length;
  const runs = [];
  while (i < n) {
    const v = arr[i];
    let j = i + 1;
    while (j < n && arr[j] === v) j++;
    runs.push(v, j - i);
    i = j;
  }
  w.varint(runs.length / 2);
  for (let k = 0; k < runs.length; k++) w.varint(runs[k]);
}

function unrle(bytes, pos, out) {
  let p = pos.p;
  const rd = () => { let v = 0, s = 0, b; do { b = bytes[p++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return v; };
  const runs = rd();
  let o = 0;
  for (let r = 0; r < runs; r++) {
    const v = rd(), len = rd();
    out.fill(v, o, o + len);
    o += len;
  }
  pos.p = p;
  return o;
}

export function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function encodeSection(sec) {
  const { cells, subs } = packSubs(sec);
  const w = new Writer();
  w.byte(1); // format version
  rle(w, cells);
  w.varint(subs.length / 64);
  if (subs.length) rle(w, subs);
  return toBase64(w.out());
}

export function decodeSection(str) {
  const bytes = fromBase64(str);
  if (bytes[0] !== 1) throw new Error('bad section format ' + bytes[0]);
  const pos = { p: 1 };
  const cells = new Uint16Array(SECTION_CELLS);
  unrle(bytes, pos, cells);
  let p = pos.p, n = 0, s = 0, b;
  do { b = bytes[p++]; n += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
  pos.p = p;
  const flat = new Uint8Array(n * 64);
  if (n) unrle(bytes, pos, flat);
  for (let i = 0; i < SECTION_CELLS; i++) if ((cells[i] & REFINED) && (cells[i] & 0x7fff) >= n) cells[i] = 0;
  return { cells, subs: unpackSubs(flat) };
}
