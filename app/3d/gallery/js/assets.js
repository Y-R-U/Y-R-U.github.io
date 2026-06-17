// Protected-asset loader for the gallery + fly-through.
//
// PolyPerfect "Low Poly Ultimate Pack" is a commercial pack — its raw GLB/PNG
// files are never stored in the repo. tools/build_pack.py packs every model +
// the two shared atlas textures into one obfuscated blob (assets/pack.dat):
//
//     entry bytes  =  XOR( gzip(raw) , keystream(name) )
//
// Here we reverse it: un-XOR with the same xorshift32 stream (seed =
// fnv1a(KEY + ':' + name)) then gunzip with DecompressionStream. Obfuscation,
// not encryption (the key is in client JS) — enough to keep usable assets out
// of the repo and stop casual scraping, which is what the licence needs.
//
// The blob is ~45 MB, so we do NOT fetch it whole. pack.index.json gives each
// entry's byte range; every model is pulled with an HTTP Range request and only
// that slice is downloaded. GitHub Pages' CDN and Python's http.server both
// honour Range (206 Partial Content); if a server ignores it and returns the
// whole file (200), we slice the entry out ourselves.
//
// Every model is re-skinned onto ONE shared material: the gradient atlas as
// .map + the specular atlas as .metalnessMap (metalness 1, roughness 0.62) —
// the recipe that makes the low-poly pack read correctly.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const KEY = 'lpup-gallery-3Dz!aron-2026';   // must match tools/build_pack.py
const PACK = 'assets/pack.dat';
const INDEX = 'assets/pack.index.json';

const loader = new GLTFLoader();
let index = null;                 // { entries: { name: {off,len,kind,raw} } }
let rangeOK = false;              // server honours Range? (probed in initAssets)
let fullBlob = null;              // ArrayBuffer of the whole pack (fallback path)
const sliceCache = new Map();     // name -> Promise<Uint8Array> (decoded bytes)

export let sharedMat = null;      // gradient+specular material (set by initAssets)
export let atlasTex = null, specTex = null;

// ── cipher (mirrors build_pack.py exactly) ──────────────────────────────────
function fnv1a(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
function unxor(seed, data) {
  let x = (seed >>> 0) || 0x1234567;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    out[i] = data[i] ^ (x & 0xff);
  }
  return out;
}
async function gunzip(u8) {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Get one entry's encoded bytes. On a Range-honouring server (206) only that
// slice is downloaded; otherwise we fall back to the whole-blob copy fetched
// once at boot and slice it in memory.
async function entryBytes(e) {
  if (fullBlob) return new Uint8Array(fullBlob, e.off, e.len);
  const res = await fetch(PACK, { headers: { Range: `bytes=${e.off}-${e.off + e.len - 1}` } });
  const buf = new Uint8Array(await res.arrayBuffer());
  return (res.status === 206 || buf.length === e.len) ? buf : buf.subarray(e.off, e.off + e.len);
}

// Decode one entry: fetch its encoded bytes, un-XOR, gunzip to the raw asset.
async function decode(name) {
  if (sliceCache.has(name)) return sliceCache.get(name);
  const e = index.entries[name];
  if (!e) throw new Error(`asset not in pack: ${name}`);
  const p = entryBytes(e).then(enc => gunzip(unxor(fnv1a(`${KEY}:${name}`), enc)));
  sliceCache.set(name, p);
  return p;
}

// ── boot: load the index + shared atlas material ────────────────────────────
export async function initAssets(renderer) {
  index = await fetch(INDEX).then(r => r.json());
  // Probe once: does this host return 206 for a byte range? GitHub Pages' CDN
  // does (lazy per-model slices); a plain dev server may not — then we download
  // the whole pack once and slice from memory (correct everywhere, never a
  // 45 MB re-download per model).
  rangeOK = await fetch(PACK, { headers: { Range: 'bytes=0-0' } })
    .then(r => r.status === 206).catch(() => false);
  if (!rangeOK) fullBlob = await fetch(PACK).then(r => r.arrayBuffer());

  atlasTex = await loadTexture('lpup_gradient.png', THREE.SRGBColorSpace);
  specTex = await loadTexture('lpup_specular.png', THREE.NoColorSpace);
  sharedMat = new THREE.MeshStandardMaterial({
    map: atlasTex, metalnessMap: specTex, metalness: 1.0, roughness: 0.62,
    envMapIntensity: 1.0,
  });
  return { entries: Object.keys(index.entries) };
}

// RoomEnvironment PMREM — the reflections the metal swatch needs.
export function envFor(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

async function loadTexture(name, colorSpace) {
  const bytes = await decode(name);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  return await new Promise((res, rej) => {
    new THREE.TextureLoader().load(url, t => {
      t.flipY = true;                  // matches the offline V-flip correction
      t.colorSpace = colorSpace;
      t.anisotropy = 4;
      URL.revokeObjectURL(url);
      res(t);
    }, undefined, rej);
  });
}

// Parse a GLB from the pack → its THREE.Scene. Cached per file so repeated
// placements / thumbnails clone one master. Materials are left untouched here;
// callers swap in sharedMat (the gallery's enhanceMaterials / the scene loader).
const gltfCache = new Map();          // file -> Promise<THREE.Object3D>
export function loadGLB(file) {
  if (gltfCache.has(file)) return gltfCache.get(file);
  const p = decode(file).then(bytes => new Promise((res, rej) => {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    loader.parse(ab, '', g => res(g.scene), rej);
  }));
  gltfCache.set(file, p);
  return p;
}

export const hasAsset = (name) => !!(index && index.entries[name]);
