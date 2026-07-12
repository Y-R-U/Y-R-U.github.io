// Protected-asset loader.
//
// PolyPerfect "Low Poly Ultimate Pack" is a commercial pack — its raw GLB/PNG
// files are never stored in the repo. Instead tools/build_pack.py packs every
// model + the shared atlas into one obfuscated blob (assets/pack.dat):
//
//     entry bytes  =  XOR( gzip(raw) , keystream(name) )
//
// Here we reverse it: slice the entry, un-XOR with the same xorshift32 stream
// (seed = fnv1a(KEY + ':' + name)), gunzip with DecompressionStream, then hand
// the bytes to GLTFLoader / TextureLoader via a Blob. This is obfuscation, not
// encryption (the key is in client JS) — enough to keep usable assets out of
// the repo and stop casual scraping, which is what the licence needs here.
//
// Every model (except the rigged hero, which carries its own baked texture)
// is re-skinned onto ONE shared material: the gradient atlas as .map +
// the specular atlas as .metalnessMap (metalness 1, roughness 0.62) — the
// recipe that makes the low-poly pack read correctly (steel, foliage, skin).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KEY = 'runedale-lpup-9Rn!aron-2026';   // must match tools/build_pack.py
const PACK = 'assets/pack.dat';
const INDEX = 'assets/pack.index.json';

const loader = new GLTFLoader();
let blob = null;          // ArrayBuffer of the whole pack
let index = null;         // { entries: { name: {off,len,kind} } }
const rawCache = new Map();   // name -> Uint8Array (decoded glb/png bytes)
const tmplCache = new Map();  // name -> Promise<Object3D> (prepared template)

export let sharedMat = null;  // gradient+specular material (set by initAssets)
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

async function decode(name) {
  if (rawCache.has(name)) return rawCache.get(name);
  const e = index.entries[name];
  if (!e) throw new Error(`asset not in pack: ${name}`);
  const slice = new Uint8Array(blob, e.off, e.len);
  const plain = await gunzip(unxor(fnv1a(`${KEY}:${name}`), slice));
  rawCache.set(name, plain);
  return plain;
}

// ── boot: fetch the pack + build the shared material ────────────────────────
export async function initAssets(renderer, onProgress) {
  onProgress?.('decoding asset pack…');
  const [idx, dat] = await Promise.all([
    fetch(INDEX).then(r => r.json()),
    fetch(PACK).then(r => r.arrayBuffer()),
  ]);
  index = idx; blob = dat;

  atlasTex = await loadTexture('atlas_gradient', THREE.SRGBColorSpace);
  specTex = await loadTexture('atlas_specular', THREE.NoColorSpace);
  sharedMat = new THREE.MeshStandardMaterial({
    map: atlasTex, metalnessMap: specTex, metalness: 1.0, roughness: 0.62,
    envMapIntensity: 1.0,
  });
  return { entries: Object.keys(index.entries) };
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

// Parse a GLB from the pack once; normalise it so the origin sits at the base
// centre (min.y -> 0, x/z centred) and apply the shared material (unless it's
// the hero, which keeps its own baked skin). Returns a reusable template.
function prepare(name, gltf, ownTexture) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  if (!ownTexture) {
    root.traverse(o => { if (o.isMesh) o.material = sharedMat; });
  } else {
    root.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    });
  }
  root.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // measure + re-origin (skip for skinned/hero — keep its rig frame intact)
  if (!ownTexture) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    root.position.set(-cx, -box.min.y, -cz);
    const g = new THREE.Group();
    g.add(root);
    g.userData.size = size;     // natural bbox size (for scaling decisions)
    return g;
  }
  return root;
}

function template(name, ownTexture = false) {
  if (tmplCache.has(name)) return tmplCache.get(name);
  const p = decode(name).then(bytes => new Promise((res, rej) => {
    // copy into a standalone ArrayBuffer for the parser
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    loader.parse(ab, '', g => res(prepare(name, g, ownTexture)), rej);
  }));
  tmplCache.set(name, p);
  return p;
}

// Public: get a fresh clone of a model. ownMaterial=true clones the shared
// material per instance (needed for per-creature hit-flash emissive).
export async function model(name, { ownMaterial = false } = {}) {
  const tmpl = await template(name, name === 'hero');
  const inst = tmpl.clone(true);
  if (ownMaterial) {
    inst.traverse(o => { if (o.isMesh && o.material === sharedMat) o.material = sharedMat.clone(); });
  }
  inst.userData.size = tmpl.userData.size;
  return inst;
}

// The rigged hero GLB + its gltf (caller drives the skeleton). Loaded raw so
// the SkinnedMesh/skeleton survive cloning.
export async function loadHeroGltf() {
  const bytes = await decode('hero');
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return await new Promise((res, rej) => loader.parse(ab, '', res, rej));
}

export const hasAsset = (name) => !!(index && index.entries[name]);
