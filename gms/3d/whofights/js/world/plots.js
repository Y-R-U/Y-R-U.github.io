// Laid floor patches. The proving room is half flagstone and half bare earth and the elemental
// mends off the earth, so what the ground is made of is a rule the game reads — js/game/ground.js
// answers "is it standing on dirt?" from the same objects this draws.
//
// It does NOT go through getMaterial(). That applies the outdoor triplanar projection, whose
// ground skirt darkens whatever is near the ground — which for a floor is all of it, and the
// first arena came out four black rectangles. This is the same trade interior.js makes and the
// reason materials.js exports `textureSet` at all: the baked texture, without the projection.

import * as THREE from 'three';
import { textureSet, flagSet, getEnvIntensity, onEnvIntensity } from './materials.js';
import { zone } from './zones.js';

// What each authored surface is cut from. The outdoor kit's names are not the game's: `ground` is
// the meadow, which is grass, and `road` is a beaten track, which is the closest thing it has to
// bare earth. Reading them literally gave the proving room a lawn where the dirt should be and a
// sandy path where the flagstones should be, so the mapping is written down rather than assumed.
//
// `tint` is a multiplier on the baked texture, and it is what makes the two halves of the proving
// floor read as two halves from across the yard rather than as one floor with a seam.
const KIT = {
  stone: { tex: z => flagSet(z, 1.15, 4.6), tile: 4.6, rough: 0.9, tint: [1.02, 1.0, 0.96] },
  dirt: { tex: z => textureSet(z, 'road'), tile: 4.0, rough: 0.99, tint: [0.74, 0.56, 0.40] },
  sand: { tex: z => textureSet(z, 'road'), tile: 3.0, rough: 0.99, tint: [1.24, 1.12, 0.86] },
  grass: { tex: z => textureSet(z, 'ground'), tile: 5.0, rough: 0.97, tint: [1, 1, 1] },
};

const cache = new Map();

function surfaceMat(zoneId, name) {
  const key = `${zoneId}:plot:${name}`;
  if (cache.has(key)) return cache.get(key);
  const cfg = KIT[name] || KIT.stone;
  const t = cfg.tex(zoneId);
  // Cloned, because the tile is per surface and the shared texture is not ours to re-wrap.
  const map = t.map.clone();
  const nrm = t.normalMap ? t.normalMap.clone() : null;
  for (const tex of [map, nrm]) {
    if (!tex) continue;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({
    map, normalMap: nrm, roughness: cfg.rough, metalness: 0,
    color: new THREE.Color(...cfg.tint),
  });
  m.normalScale.set(0.85, 0.85);
  m.envMapIntensity = getEnvIntensity() * 0.5;
  m.name = key;
  m.userData.tile = cfg.tile;
  cache.set(key, m);
  onEnvIntensity(v => { m.envMapIntensity = v * 0.5; });
  return m;
}

// UVs in metres over the slab's own top face, so a 40 m floor is 12 tiles and not one stretched
// one. The sides get the same scale, which at 0.16 m of thickness is a sliver either way.
function slabGeo(w, d, th, tile) {
  const g = new THREE.BoxGeometry(w, th, d);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ny = Math.abs(nrm.getY(i));
    // Top and bottom take x/z; the four sides take whichever horizontal axis they face along.
    const u = ny > 0.5 ? pos.getX(i) : (Math.abs(nrm.getX(i)) > 0.5 ? pos.getZ(i) : pos.getX(i));
    const v = ny > 0.5 ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  g.translate(0, th / 2, 0);
  return g;
}

// Origin at the ground at the patch's centre, exactly as every other scene object is placed.
export function floorPatch(zoneId, { w = 8, d = 8, th = 0.14, surface = 'stone' } = {}) {
  const g = new THREE.Group();
  const mat = surfaceMat(zoneId, KIT[surface] ? surface : 'stone');
  const slab = new THREE.Mesh(slabGeo(w, d, th, mat.userData.tile), mat);
  slab.receiveShadow = true;
  // A floor casts nothing worth a shadow-map draw: it is 0.14 m proud of the ground it sits on.
  slab.castShadow = false;
  g.add(slab);

  // A kerb, so the edge reads as a course of stone set into the ground rather than as the edge of
  // a texture. It takes the zone's own trim colour rather than a surface of its own.
  const z = zone(zoneId);
  const kerbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(z.stone.base).multiplyScalar(0.82), roughness: 0.9, metalness: 0,
  });
  kerbMat.envMapIntensity = getEnvIntensity() * 0.5;
  kerbMat.name = `${zoneId}:plot:kerb`;
  const k = 0.24, ky = th + 0.05;
  const parts = [];
  for (const [kw, kd, x, zz] of [[w + k * 2, k, 0, d / 2 + k / 2], [w + k * 2, k, 0, -(d / 2 + k / 2)],
    [k, d, w / 2 + k / 2, 0], [k, d, -(w / 2 + k / 2), 0]]) {
    const b = new THREE.BoxGeometry(kw, ky, kd);
    b.translate(x, ky / 2, zz);
    parts.push(b);
  }
  const kerb = new THREE.Mesh(mergeAll(parts), kerbMat);
  kerb.castShadow = kerb.receiveShadow = true;
  g.add(kerb);

  g.userData = { kind: 'plot', zoneId, surface };
  return g;
}

function mergeAll(list) {
  const out = list[0];
  for (let i = 1; i < list.length; i++) {
    const src = list[i];
    const base = out.attributes.position.count;
    for (const name of ['position', 'normal', 'uv']) {
      const a = out.attributes[name], b = src.attributes[name];
      const arr = new Float32Array(a.array.length + b.array.length);
      arr.set(a.array);
      arr.set(b.array, a.array.length);
      out.setAttribute(name, new THREE.Float32BufferAttribute(arr, a.itemSize));
    }
    const idx = [...out.index.array, ...[...src.index.array].map(v => v + base)];
    out.setIndex(idx);
    src.dispose();
  }
  return out;
}
