import * as THREE from 'three';
import { propMaterial } from '../eventart.js?v=20261004a';

// Every spectacle prop shape in ONE instanced mesh (the eventart trick: each instance picks its variant, the vertex
// shader collapses the rest). Facing +z, origin on the ground unless noted. Flap parts (wings) swing in the shader.
export const PV = {
  barrel: 0, chicken: 1, goat: 2, coffin: 3, piano: 4, table: 5, sign: 6, bag: 7, horse: 8, coach: 9, haycart: 10,
  wagon: 11, trough: 12, tape: 13, gun: 14, pin: 15, vulture: 16, bottle: 17, tumbleweed: 18, fly: 19, door: 20,
  chair: 21, legs: 22, wheel: 23, star: 24, plank: 25,
};
const WOOD = { c: '#a8714a', r: 0.8 }, WOOD2 = { c: '#7a5236', r: 0.85 }, DARK = { c: '#3b2a24', r: 0.7 },
  IRON = { c: '#55565e', r: 0.4, m: 0.6 }, GOLDC = { c: '#ffd27a', r: 0.3, m: 0.4, g: 0.25 }, PURPLE = { c: '#6a3d8a', r: 0.6 };

function makers() {
  const M = [];
  const add = (v, build, flap) => M.push([v, build, flap]);
  add(PV.barrel, (b) => {
    b.cyl(WOOD, 0, 0, 0, 0.42, 0.95, 0, { sides: 11, taper: 1 });
    b.ball(WOOD, 0, 0.47, 0, 0.47, { sy: 0.9, sx: 1, sz: 1, smooth: true });
    for (const y of [0.12, 0.8]) b.cyl(IRON, 0, y, 0, 0.45, 0.06, 0, { sides: 11, taper: 1 });
  });
  add(PV.chicken, (b) => {
    b.ball({ c: '#f6f1e6', r: 0.7 }, 0, 0.32, 0, 0.2, { sx: 0.85, sz: 1.2, smooth: true });
    b.ball({ c: '#f6f1e6', r: 0.7 }, 0, 0.55, 0.16, 0.11, { smooth: true });
    b.ball({ c: '#d9545e', r: 0.6 }, 0, 0.68, 0.16, 0.05, { sy: 1.4 });
    b.cone({ c: '#f2b84b', r: 0.5 }, 0, 0.53, 0.27, 0.035, 0.08, 0, { rx: Math.PI / 2 });
    for (const s of [-1, 1]) b.cyl({ c: '#f2b84b', r: 0.6 }, s * 0.07, 0, 0, 0.02, 0.18, 0, { sides: 5 });
    b.ball('#2b2230', 0.05, 0.58, 0.24, 0.018).ball('#2b2230', -0.05, 0.58, 0.24, 0.018);
  }, (w) => { for (const s of [-1, 1]) w.ball({ c: '#efe6d6', r: 0.7 }, s * 0.2, 0.06, 0, 0.12, { sx: 1.0, sy: 0.35, sz: 1.2 }); });
  add(PV.goat, (b) => {
    const fur = { c: '#e9e4da', r: 0.85 };
    b.ball(fur, 0, 0.62, 0, 0.32, { sx: 0.8, sz: 1.4, smooth: true });
    b.ball(fur, 0, 0.95, 0.45, 0.17, { sz: 1.3, smooth: true });
    for (const s of [-1, 1]) b.cone({ c: '#8a6a52', r: 0.5 }, s * 0.08, 1.06, 0.38, 0.04, 0.22, 0, { rx: -0.6 });
    b.ball({ c: '#e9e4da', r: 0.8 }, 0, 0.8, 0.62, 0.06, { sy: 1.8 });
    for (const [x, z] of [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.3], [0.14, -0.3]]) b.cyl({ c: '#5b5f66', r: 0.7 }, x, 0, z, 0.05, 0.45, 0, { sides: 5 });
    b.ball('#2b2230', 0.08, 1.0, 0.6, 0.025).ball('#2b2230', -0.08, 1.0, 0.6, 0.025);
  });
  add(PV.coffin, (b) => {
    b.slab(DARK, 0, 0, 0, 0.62, 0.42, 1.9, { round: 0.05, taper: 0.1 });
    b.slab(WOOD2, 0, 0.42, 0, 0.66, 0.08, 1.94, { round: 0.03 });
    b.slab({ c: '#c9b08a', r: 0.5, m: 0.3 }, 0, 0.5, 0.35, 0.08, 0.02, 0.36).slab({ c: '#c9b08a', r: 0.5, m: 0.3 }, 0, 0.5, 0.45, 0.24, 0.02, 0.08);
  });
  add(PV.piano, (b) => {
    b.slab(WOOD2, 0, 0, 0, 1.6, 1.25, 0.6, { round: 0.06 });
    b.slab(DARK, 0, 0.72, 0.28, 1.5, 0.08, 0.32, { round: 0.02 });
    b.slab({ c: '#f6f1e6', r: 0.4 }, 0, 0.8, 0.36, 1.4, 0.04, 0.2, { round: 0.01 });
    for (let i = 0; i < 9; i++) b.slab('#2b2230', -0.6 + i * 0.15, 0.84, 0.32, 0.05, 0.03, 0.1);
    for (const s of [-1, 1]) b.cyl(WOOD2, s * 0.68, 0, 0.3, 0.06, 0.72, 0, { sides: 6 });
    b.slab({ c: '#fff4c2', r: 0.4, g: 0.6 }, 0.55, 1.25, 0, 0.12, 0.22, 0.12);
  });
  add(PV.table, (b) => {
    b.cyl(WOOD, 0, 0.72, 0, 0.7, 0.07, 0, { sides: 14, taper: 1 });
    b.cyl(WOOD2, 0, 0, 0, 0.09, 0.72, 0, { sides: 7, taper: 1 });
    b.cyl(WOOD2, 0, 0, 0, 0.35, 0.05, 0, { sides: 9, taper: 1 });
    for (let i = 0; i < 5; i++) b.slab({ c: '#f6f1e6', r: 0.6 }, Math.sin(i * 1.3) * 0.35, 0.8, Math.cos(i * 1.3) * 0.35, 0.12, 0.01, 0.18, { ry: i });
    b.cyl({ c: '#c98b4a', r: 0.3, g: 0.1 }, 0.2, 0.79, -0.1, 0.06, 0.16, 0, { sides: 7 });
  });
  add(PV.sign, (b) => {
    b.slab(PURPLE, 0, 0, 0, 3.4, 1.1, 0.14, { round: 0.05 });
    b.slab(GOLDC, 0, -0.06, -0.02, 3.6, 0.12, 0.2, { round: 0.03 }).slab(GOLDC, 0, 1.04, -0.02, 3.6, 0.12, 0.2, { round: 0.03 });
    b.ball(GOLDC, 0, 0.55, 0.1, 0.3, { sz: 0.3 });
    b.ball({ c: '#2b2230', r: 0.7 }, 0, 0.62, 0.17, 0.16, { sy: 0.7, sz: 0.3 });
  });
  add(PV.bag, (b) => {
    b.ball({ c: '#c9b08a', r: 0.9 }, 0, 0.3, 0, 0.3, { sy: 1.05, smooth: true });
    b.cone({ c: '#c9b08a', r: 0.9 }, 0, 0.55, 0, 0.13, 0.18, 0);
    b.cyl({ c: '#7a4f2c', r: 0.8 }, 0, 0.58, 0, 0.1, 0.05, 0, { sides: 8, taper: 1 });
    b.ball({ c: '#2b9a4a', r: 0.6 }, 0, 0.33, 0.27, 0.11, { sz: 0.2 });
  });
  add(PV.horse, (b) => {
    const coat = { c: '#a0603a', r: 0.75 }, mane = { c: '#4a2f22', r: 0.8 };
    b.ball(coat, 0, 1.15, 0, 0.5, { sx: 0.75, sz: 1.55, smooth: true });
    b.slab(coat, 0, 1.25, 0.62, 0.36, 0.75, 0.32, { rx: -0.6, round: 0.12 });
    b.ball(coat, 0, 1.9, 1.0, 0.25, { sz: 1.6, sy: 0.9, smooth: true });
    b.ball({ c: '#e9d8c0', r: 0.7 }, 0, 1.82, 1.32, 0.15, { sy: 0.85 });
    for (const s of [-1, 1]) b.cone(mane, s * 0.1, 2.05, 0.9, 0.06, 0.16, 0);
    b.slab(mane, 0, 1.45, 0.45, 0.08, 0.7, 0.4, { rx: -0.6, round: 0.04 });
    b.ball(mane, 0, 1.15, -0.8, 0.12, { sy: 2.8, rx: 0.6 });
    for (const [x, z] of [[-0.22, 0.48], [0.22, 0.48], [-0.22, -0.5], [0.22, -0.5]]) {
      b.cyl(coat, x, 0.12, z, 0.1, 0.95, 0, { sides: 6, taper: 1.15 });
      b.cyl(DARK, x, 0, z, 0.12, 0.13, 0, { sides: 6, taper: 1 });
    }
    b.slab({ c: '#7a3a2a', r: 0.6 }, 0, 1.55, -0.05, 0.86, 0.12, 0.8, { round: 0.05 });
    b.ball('#2b2230', 0.17, 1.98, 1.15, 0.035).ball('#2b2230', -0.17, 1.98, 1.15, 0.035);
  });
  add(PV.coach, (b) => {
    const red = { c: '#b5483a', r: 0.55 };
    b.slab(red, 0, 0.75, 0, 1.6, 1.5, 2.6, { round: 0.18, taper: -0.06 });
    b.slab({ c: '#d9a441', r: 0.5 }, 0, 2.25, 0, 1.7, 0.1, 2.7, { round: 0.04 });
    b.slab({ c: '#27303c', r: 0.1 }, 0, 1.3, 0, 1.62, 0.55, 1.2, { round: 0.04 });
    b.slab(WOOD2, 0, 1.15, 1.6, 1.4, 0.12, 0.7, { round: 0.03 });
    b.slab({ c: '#8a6a52', r: 0.8 }, -0.2, 2.35, -0.3, 0.8, 0.45, 0.7, { round: 0.08 }).slab({ c: '#5e8f8c', r: 0.8 }, 0.35, 2.35, 0.4, 0.5, 0.35, 0.5, { round: 0.08 });
    for (const z of [-1.0, 1.0]) for (const s of [-1, 1]) {
      b.cyl(WOOD2, s * 0.85, 0.55, z, 0.55, 0.1, 0, { rz: Math.PI / 2, sides: 12, taper: 1 });
      b.cyl(IRON, s * 0.85, 0.55, z, 0.12, 0.14, 0, { rz: Math.PI / 2, sides: 8, taper: 1 });
    }
    b.slab(WOOD2, 0, 0.5, 2.6, 0.08, 0.08, 2.2);
  });
  add(PV.haycart, (b) => {
    b.slab(WOOD, 0, 0.45, 0, 1.6, 0.35, 2.4, { round: 0.04 });
    b.ball({ c: '#e8c66a', r: 0.95 }, 0, 0.95, 0, 0.9, { sx: 0.95, sy: 0.55, sz: 1.35, smooth: true });
    for (const s of [-1, 1]) b.cyl(WOOD2, s * 0.85, 0.5, 0.2, 0.5, 0.1, 0, { rz: Math.PI / 2, sides: 12, taper: 1 });
    b.slab(WOOD2, 0, 0.45, 1.6, 0.08, 0.08, 1.4, { rx: 0.15 });
  });
  add(PV.wagon, (b) => {
    b.slab({ c: '#5e6a7a', r: 0.5 }, 0, 0.55, 0, 1.6, 1.6, 2.5, { round: 0.06 });
    for (let i = 0; i < 5; i++) b.cyl(IRON, -0.5 + i * 0.25, 1.1, 1.27, 0.03, 0.9, 0, { sides: 5 });
    b.slab({ c: '#2b2230', r: 0.2 }, 0, 1.1, 1.26, 1.2, 0.9, 0.02);
    b.slab({ c: '#ffd27a', r: 0.3, m: 0.5, g: 0.2 }, 0, 2.05, 1.0, 0.3, 0.3, 0.06, { rz: 0.785 });
    for (const z of [-0.85, 0.85]) for (const s of [-1, 1]) b.cyl(WOOD2, s * 0.85, 0.5, z, 0.48, 0.1, 0, { rz: Math.PI / 2, sides: 12, taper: 1 });
  });
  add(PV.trough, (b) => {
    b.slab(WOOD, 0, 0, 0, 2.4, 0.7, 0.8, { round: 0.05, taper: -0.08 });
    b.slab({ c: '#5e9bb0', r: 0.1, g: 0.08 }, 0, 0.52, 0, 2.2, 0.06, 0.62, { round: 0.02 });
  });
  add(PV.tape, (b) => {
    b.slab({ c: '#f4d06f', r: 0.6, g: 0.15 }, 0, 0, 0, 0.06, 0.01, 1.2, { round: 0.004 });
    b.cyl({ c: '#c9b08a', r: 0.5, m: 0.4 }, 0, -0.04, -0.62, 0.1, 0.08, 0, { sides: 9, taper: 1 });
  });
  add(PV.gun, (b) => {
    b.slab(IRON, 0, 0, 0.08, 0.06, 0.07, 0.38, { round: 0.02 });
    b.slab(DARK, 0, -0.18, -0.08, 0.06, 0.2, 0.1, { rx: 0.35, round: 0.02 });
    b.cyl(IRON, 0, -0.03, -0.02, 0.05, 0.08, 0, { rx: Math.PI / 2, sides: 7, taper: 1 });
  });
  add(PV.pin, (b) => {
    b.cyl({ c: '#d9b07a', r: 0.6 }, 0, 0, -0.25, 0.07, 0.5, 0, { rx: Math.PI / 2, sides: 9, taper: 1 });
    for (const z of [-0.36, 0.36]) b.cyl(WOOD2, 0, 0, z, 0.03, 0.16, 0, { rx: Math.PI / 2, sides: 6, taper: 1 });
  });
  add(PV.vulture, (b) => {
    b.ball({ c: '#3b2a34', r: 0.8 }, 0, 0, 0, 0.3, { sx: 0.8, sy: 0.6, sz: 1.3, smooth: true });
    b.ball({ c: '#d9a08a', r: 0.6 }, 0, 0.15, 0.4, 0.13, { smooth: true });
    b.cone({ c: '#e9d8c0', r: 0.5 }, 0, 0.13, 0.52, 0.05, 0.13, 0, { rx: Math.PI / 2 });
    b.ball({ c: '#f6f1e6', r: 0.8 }, 0, 0.08, 0.27, 0.14, { sy: 0.6 });
  }, (w) => { for (const s of [-1, 1]) w.ball({ c: '#2b2230', r: 0.8 }, s * 0.75, 0.08, 0, 0.26, { sx: 2.7, sy: 0.18, sz: 1.1, smooth: true }); });
  add(PV.bottle, (b) => {
    b.cyl({ c: '#4f7a3a', r: 0.15, m: 0.1 }, 0, 0, 0, 0.09, 0.26, 0, { sides: 9, taper: 1 });
    b.cyl({ c: '#4f7a3a', r: 0.15, m: 0.1 }, 0, 0.26, 0, 0.035, 0.14, 0, { sides: 7, taper: 1 });
  });
  add(PV.tumbleweed, (b) => {
    const dry = { c: '#d9b06a', r: 0.95 }, gold = { c: '#ffd27a', r: 0.35, m: 0.3, g: 0.55 };
    for (let i = 0; i < 7; i++) b.ball(i % 2 ? gold : dry, 0, 0, 0, 0.55, { sx: 1, sy: 0.18, sz: 1, rx: i * 0.9, ry: i * 1.7, rz: i * 0.6 });
    b.ball({ c: '#c9984f', r: 0.9 }, 0, 0, 0, 0.32, { smooth: true });
  });
  add(PV.fly, (b) => b.ball('#1b1820', 0, 0, 0, 0.05, { sz: 1.3 }),
    (w) => { for (const s of [-1, 1]) w.ball({ c: '#dfe8f0', r: 0.3, g: 0.3 }, s * 0.07, 0.04, 0, 0.05, { sx: 1.4, sy: 0.2 }); });
  add(PV.door, (b) => {
    b.slab(WOOD, 0, 0, 0, 0.62, 1.0, 0.06, { round: 0.02 });
    for (let i = 0; i < 4; i++) b.slab(WOOD2, -0.22 + i * 0.15, 0.1, 0.04, 0.06, 0.8, 0.02);
  });
  add(PV.chair, (b) => {
    b.slab(WOOD, 0, 0.45, 0, 0.45, 0.06, 0.45, { round: 0.02 });
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.cyl(WOOD2, x, 0, z, 0.03, 0.45, 0, { sides: 5 });
    b.slab(WOOD, 0, 0.5, -0.2, 0.45, 0.5, 0.05, { round: 0.02 });
  });
  add(PV.legs, (b) => {
    for (const s of [-1, 1]) {
      b.cyl({ c: '#4a5878', r: 0.7 }, s * 0.12, 0.05, 0, 0.07, 0.32, 0, { sides: 6 });
      b.slab({ c: '#3b2a24', r: 0.6 }, s * 0.12, 0, 0.04, 0.12, 0.08, 0.2, { round: 0.03 });
    }
  });
  add(PV.wheel, (b) => {
    b.cyl(WOOD2, 0, 0, 0, 0.5, 0.08, 0, { rz: Math.PI / 2, sides: 12, taper: 1 });
    b.cyl(IRON, 0, 0, 0, 0.12, 0.12, 0, { rz: Math.PI / 2, sides: 8, taper: 1 });
  });
  add(PV.star, (b) => {
    const y = { c: '#ffe45c', r: 0.3, g: 1.1 };
    for (let i = 0; i < 5; i++) b.slab(y, 0, 0, 0, 0.09, 0.28, 0.05, { rz: i * 1.2566, round: 0.02 });
  });
  add(PV.plank, (b) => b.slab(WOOD, 0, 0, 0, 0.25, 0.08, 2.2, { round: 0.02 }));
  return M;
}

function variantGeometry(kit, list) {
  const out = [];
  for (const [variant, build, flap] of list) {
    for (const [fn, f] of [[build, 0], [flap, 1]]) {
      if (!fn) continue;
      const b = kit.builder({});
      b.ao(f ? 0 : 0.15);
      fn(b);
      const g = b.geometry(), n = g.attributes.position.count, ev = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { ev[i * 2] = variant; ev[i * 2 + 1] = f; }
      g.setAttribute('aEv', new THREE.BufferAttribute(ev, 2));
      out.push(g);
    }
  }
  let n = 0;
  for (const g of out) n += g.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPbr', 4], ['aEv', 2]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of out) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    merged.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  merged.computeBoundingSphere();
  return merged;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export function createProps(kit, scene, cap = 160) {
  const geo = variantGeometry(kit, makers());
  const iVar = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  geo.setAttribute('iVar', iVar);
  const mesh = new THREE.InstancedMesh(geo, propMaterial(kit), cap);
  mesh.name = 'spectacle:props';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh, cap,
    // list items: {v, x, y, z, ry, rx, rz, s, sx, sy, sz, ph}
    write(list, n) {
      let k = 0;
      for (let i = 0; i < n && k < cap; i++) {
        const p = list[i];
        _e.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ');
        _q.setFromEuler(_e);
        const s = p.s || 1;
        _m.compose(_p.set(p.x, p.y || 0, p.z), _q, _s.set(s * (p.sx || 1), s * (p.sy || 1), s * (p.sz || 1)));
        mesh.setMatrixAt(k, _m);
        iVar.setXY(k++, p.v, p.ph || 0);
      }
      mesh.count = k;
      mesh.visible = k > 0;
      if (k) { mesh.instanceMatrix.needsUpdate = true; iVar.needsUpdate = true; }
      return k;
    },
  };
}
