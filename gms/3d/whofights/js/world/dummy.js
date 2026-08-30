// The skinnable dummy: a low-poly humanoid with real UVs, built in code like everything else in
// here. Its shape and its unwrap both come from tools/skin/layout.mjs — one file, so a proportion
// change moves the mesh and the UV template together and they cannot disagree.
//
// This is the only textured character in the project. Everything in people.js is vertex-coloured
// faceted geometry with no UVs at all; the dummy exists to answer whether a Flux-painted skin can
// carry a character in this renderer.

import * as THREE from 'three';
import { faces, SHAPES, SHAPE_IDS, RIG_TOP, ATLAS } from '../../tools/skin/layout.mjs';
import { track, untrack } from '../engine/budget.js';

export { RIG_TOP, ATLAS, SHAPES, SHAPE_IDS };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// `shape` is 'm' | 'f' | 'n'. All three share one UV set, so one skin fits any of them.
export function dummyGeometry(shape = 'm') {
  const pos = [], nor = [], uv = [];
  for (const f of faces(shape)) {
    const e1 = sub(f.pos[1], f.pos[0]), e2 = sub(f.pos[2], f.pos[0]);
    const n = cross(e1, e2);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const N = [n[0] / len, n[1] / len, n[2] / len];
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      for (const i of [a, b, c]) {
        pos.push(f.pos[i][0], f.pos[i][1], f.pos[i][2]);
        nor.push(N[0], N[1], N[2]);
        uv.push(f.uv[i][0], f.uv[i][1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// A skin is albedo only. Nothing generated is a usable normal or roughness map, and pretending
// otherwise puts baked highlights on top of the renderer's own lighting.
export function dummyMaterial(map = null) {
  return new THREE.MeshStandardMaterial({
    map, color: map ? 0xffffff : 0x9aa2ad, roughness: 0.86, metalness: 0,
    flatShading: true, side: THREE.FrontSide,
  });
}

export function loadSkin(url, { anisotropy = 4, label = url } = {}) {
  return new Promise((res, rej) => {
    new THREE.TextureLoader().load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      // The skin is a single 1024² albedo. Untracked it is 5.6 MB the readout never mentions.
      track(tex, { w: tex.image.width, h: tex.image.height, label: `skin:${label}` });
      res(tex);
    }, undefined, e => rej(new Error(`could not load ${url}`)));
  });
}

export function disposeSkin(tex) {
  if (!tex) return;
  untrack(tex);
  tex.dispose();
}

export class Dummy extends THREE.Mesh {
  constructor({ shape = 'm', map = null } = {}) {
    super(dummyGeometry(shape), dummyMaterial(map));
    this.name = `dummy:${shape}`;
    this.shape = shape;
  }

  setSkin(tex) {
    this.material.map = tex || null;
    this.material.color.setHex(tex ? 0xffffff : 0x9aa2ad);
    this.material.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    disposeSkin(this.material.map);
    this.material.dispose();
  }
}
