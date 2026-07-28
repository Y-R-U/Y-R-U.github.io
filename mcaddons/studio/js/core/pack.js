// Zip read/write with zero dependencies — uses the browser's native deflate.
// This is the "NanaZip" replacement: it builds .mcaddon/.mcpack files and opens them again.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const HAS_CS = typeof CompressionStream !== 'undefined';
const HAS_DS = typeof DecompressionStream !== 'undefined';

async function deflateRaw(bytes) {
  if (!HAS_CS) return null;
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function inflateRaw(bytes) {
  if (!HAS_DS) throw new Error('This browser cannot open zip files. Try Chrome or Edge.');
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function dosTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

class Writer {
  constructor() { this.parts = []; this.len = 0; }
  push(u8) { this.parts.push(u8); this.len += u8.length; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
  blob(type) { return new Blob(this.parts, { type }); }
}

/**
 * @param {Object<string, Uint8Array>} files  path -> bytes
 * @returns {Promise<Blob>}
 */
export async function zip(files) {
  const w = new Writer();
  const central = [];
  const { time, date } = dosTime();
  const enc = new TextEncoder();

  for (const [path, raw] of Object.entries(files)) {
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const name = enc.encode(path);
    const crc = crc32(data);
    let comp = data, method = 0;
    if (data.length > 64) {
      const def = await deflateRaw(data);
      if (def && def.length < data.length) { comp = def; method = 8; }
    }
    const offset = w.len;

    w.u32(0x04034b50); w.u16(20); w.u16(0x800); w.u16(method);
    w.u16(time); w.u16(date); w.u32(crc); w.u32(comp.length); w.u32(data.length);
    w.u16(name.length); w.u16(0); w.push(name); w.push(comp);

    central.push({ name, method, crc, csize: comp.length, usize: data.length, offset });
  }

  const cdStart = w.len;
  for (const c of central) {
    w.u32(0x02014b50); w.u16(0x031E); w.u16(20); w.u16(0x800); w.u16(c.method);
    w.u16(time); w.u16(date); w.u32(c.crc); w.u32(c.csize); w.u32(c.usize);
    // external attributes: we claim a Unix host above, so spell out 0644 or extractors
    // produce unreadable files.
    w.u16(c.name.length); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.u32(0x81A40000); w.u32(c.offset);
    w.push(c.name);
  }
  const cdSize = w.len - cdStart;
  w.u32(0x06054b50); w.u16(0); w.u16(0); w.u16(central.length); w.u16(central.length);
  w.u32(cdSize); w.u32(cdStart); w.u16(0);

  return w.blob('application/zip');
}

/**
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @returns {Promise<Object<string, Uint8Array>>}
 */
export async function unzip(input) {
  let buf;
  if (input instanceof Blob) buf = new Uint8Array(await input.arrayBuffer());
  else if (input instanceof ArrayBuffer) buf = new Uint8Array(input);
  else buf = input;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // find End Of Central Directory (scan back over the max 64k comment)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That doesn't look like a .mcaddon/.zip file.");

  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};

  for (let n = 0; n < count; n++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const csize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const cmtLen = dv.getUint16(ptr + 32, true);
    const lho = dv.getUint32(ptr + 42, true);
    const name = dec.decode(buf.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + cmtLen;

    if (name.endsWith('/')) continue;
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lNameLen + lExtraLen;
    const chunk = buf.subarray(start, start + csize);
    out[name] = method === 0 ? new Uint8Array(chunk) : await inflateRaw(chunk);
  }
  return out;
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export const zipSupport = { compress: HAS_CS, decompress: HAS_DS };
