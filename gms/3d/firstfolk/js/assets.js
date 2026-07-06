// Protected-asset loader (same scheme as towered/deadtown/whoami — CLAUDE.md).
//
// tools/build_pack.py packs every model + the shared atlas into one obfuscated
// blob (assets/pack.dat):  entry = XOR(gzip(raw), keystream(name)).
// Here we reverse it: slice → un-XOR (xorshift32 seeded by fnv1a(KEY+':'+name))
// → DecompressionStream('gzip') → GLTFLoader/TextureLoader via Blob.
// Obfuscation, not encryption — keeps usable assets out of the public repo.
//
// Statics are re-skinned onto ONE shared material (gradient atlas .map +
// specular atlas .metalnessMap, metalness 1 / roughness 0.62 — the recipe that
// makes the low-poly pack read correctly). RIGS keep their own baked skin.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KEY = 'firstfolk-lpup-9Ff!aron-2026';   // must match tools/build_pack.py
const PACK = 'assets/pack.dat';
const INDEX = 'assets/pack.index.json';

const loader = new GLTFLoader();
let blob = null;
let index = null;
let RIGS = new Set();
export const isRig = (name) => RIGS.has(name);
const rawCache = new Map();
const tmplCache = new Map();

export let sharedMat = null;
export let atlasTex = null, specTex = null;

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

export async function initAssets(onProgress) {
  onProgress?.('waking the island…');
  const [idx, dat] = await Promise.all([
    fetch(INDEX).then(r => r.json()),
    fetch(PACK).then(r => r.arrayBuffer()),
  ]);
  index = idx; blob = dat;
  if (Array.isArray(idx.rigs)) RIGS = new Set(idx.rigs);

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

// Parse a GLB once; re-origin so the base centre sits at (0,0,0) and apply the
// shared material (statics only). Returns a reusable template.
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

  if (!ownTexture) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    root.position.set(-cx, -box.min.y, -cz);
    const g = new THREE.Group();
    g.add(root);
    g.userData.size = size;
    return g;
  }
  return root;
}

function template(name, ownTexture = false) {
  if (tmplCache.has(name)) return tmplCache.get(name);
  const p = decode(name).then(bytes => new Promise((res, rej) => {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    loader.parse(ab, '', g => res(prepare(name, g, ownTexture)), rej);
  }));
  tmplCache.set(name, p);
  return p;
}

// Fresh clone of a static model. ownMaterial=true clones the shared material
// per instance (for tinting / emissive flashes).
export async function model(name, { ownMaterial = false } = {}) {
  const tmpl = await template(name, isRig(name));
  const inst = tmpl.clone(true);
  if (ownMaterial) {
    inst.traverse(o => { if (o.isMesh && o.material === sharedMat) o.material = sharedMat.clone(); });
  }
  inst.userData.size = tmpl.userData.size;
  return inst;
}

// A rigged SkinnedMesh GLB + its gltf (caller drives the skeleton in body
// space via js/rig.js). Loaded raw so the skeleton survives cloning.
const rigCache = new Map();
export function loadRigGltf(name) {
  if (rigCache.has(name)) return rigCache.get(name);
  const p = decode(name).then(bytes => {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Promise((res, rej) => loader.parse(ab, '', res, rej));
  });
  rigCache.set(name, p);
  return p;
}

export const hasAsset = (name) => !!(index && index.entries[name]);
