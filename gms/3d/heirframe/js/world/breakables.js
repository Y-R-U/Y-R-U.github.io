import * as THREE from 'three';
import { REFLECT_LAYER } from '../fx/reflection.js';
import { HOLO_ART } from './holo.js';
import { canvasTexture } from './textures.js';

// Breakable street props (crates, vending units, holo stands), instanced per part so the whole set costs ~7 draws.
// world.breakables: { list, near(x,z,r), hit(prop|id, dmg), splash(x,z,r,dmg), onBreak(fn), reset() }.
// A prop: { id, kind, x, y, z, r, hp, maxHp, value, broken }. Breaking hides it, drops its collision and throws debris.
const KINDS = {
  crate: { hp: 20, value: 30, r: 0.62, parts: ['crateBody', 'crateBand'] },
  vending: { hp: 45, value: 90, r: 0.7, parts: ['vendBody', 'vendScreen'] },
  holo: { hp: 12, value: 60, r: 0.5, parts: ['holoBase', 'holoPanel'] },
};

function geoms() {
  const G = {};
  G.crateBody = new THREE.BoxGeometry(1.0, 0.85, 1.0).translate(0, 0.425, 0);
  const band = [new THREE.BoxGeometry(1.04, 0.08, 1.04).translate(0, 0.12, 0), new THREE.BoxGeometry(1.04, 0.08, 1.04).translate(0, 0.73, 0),
    new THREE.BoxGeometry(0.08, 0.85, 1.05).translate(0.3, 0.425, 0), new THREE.BoxGeometry(0.08, 0.85, 1.05).translate(-0.3, 0.425, 0)];
  G.crateBand = merge(band);
  const body = [new THREE.BoxGeometry(1.1, 2.0, 0.78).translate(0, 1.0, 0), new THREE.BoxGeometry(1.16, 0.12, 0.84).translate(0, 2.06, 0),
    new THREE.BoxGeometry(0.5, 0.18, 0.1).translate(0.18, 0.32, 0.4)];
  G.vendBody = merge(body);
  G.vendScreen = merge([new THREE.PlaneGeometry(0.86, 1.2).translate(0, 1.25, 0.395), new THREE.BoxGeometry(1.12, 0.05, 0.05).translate(0, 1.93, 0.4)]);
  G.holoBase = merge([new THREE.CylinderGeometry(0.34, 0.42, 0.22, 16).translate(0, 0.11, 0), new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8).translate(0, 0.85, 0),
    new THREE.TorusGeometry(0.34, 0.03, 6, 24).rotateX(Math.PI / 2).translate(0, 0.23, 0)]);
  G.holoPanel = new THREE.PlaneGeometry(1.0, 1.5).translate(0, 1.6, 0.03);
  return G;
}
function merge(list) {
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of list) {
    const n = pos.length / 3, p = g.attributes.position, q = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(q.getX(i), q.getY(i), q.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + n);
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// specs: [{kind, x, z, rot, y=0, stack}] (stack: crates only, extra crates on top, same prop)
export function createBreakables(ctx, specs) {
  const { scene, col } = ctx;
  if (!specs.length) return { list: [], alive: [], near: () => [], hit: () => false, splash: () => [], onBreak: () => () => {}, reset() {} };
  const G = geoms();
  const posters = HOLO_ART.posters();
  const pTex = canvasTexture(posters.canvas);
  const M = {
    crateBody: new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.45, metalness: 0.55, envMapIntensity: 1.1 }),
    crateBand: new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.35, metalness: 0.8 }),
    vendBody: new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.2 }),
    vendScreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.1, 1.9) }),
    holoBase: new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.3, metalness: 0.85 }),
    holoPanel: new THREE.MeshBasicMaterial({ map: pTex, color: new THREE.Color(1.6, 1.9, 2.3), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  };
  // posters atlas: pick one column per holo stand via uv offset baked per instance is not available on MeshBasic, so
  // the panel samples the first poster; three stands in a row still read as a set.
  pTex.repeat.set(1 / posters.count, 1);
  const byPart = {};
  for (const k of Object.keys(G)) byPart[k] = [];
  const list = [];
  specs.forEach((s, i) => {
    const K = KINDS[s.kind];
    const y = s.y ?? col.groundAt(s.x, s.z);
    const b = { id: s.id || `${s.kind}_${i}`, kind: s.kind, x: s.x, y, z: s.z, rot: s.rot || 0, r: K.r, hp: K.hp, maxHp: K.hp, value: K.value,
      broken: false, stack: s.stack || 0, slots: [], colShape: null };
    for (const part of K.parts) {
      for (let k = 0; k <= (s.kind === 'crate' ? b.stack : 0); k++) { b.slots.push([part, byPart[part].length, k]); byPart[part].push(b); }
    }
    list.push(b);
  });
  const meshes = {};
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (b, visible) => {
    for (const [part, idx, k] of b.slots) {
      const ss = k ? 0.82 : 1;
      q.setFromAxisAngle(up, b.rot + k * 0.45);
      p.set(b.x, b.y + k * 0.85, b.z);
      m4.compose(p, q, sc.setScalar(visible ? ss : 0));
      meshes[part].setMatrixAt(idx, m4);
      meshes[part].instanceMatrix.needsUpdate = true;
    }
  };
  for (const [part, arr] of Object.entries(byPart)) {
    if (!arr.length) { G[part].dispose(); continue; }
    const im = new THREE.InstancedMesh(G[part], M[part], arr.length);
    im.name = 'brk:' + part;
    im.castShadow = !part.startsWith('holoPanel') && part !== 'vendScreen';
    im.receiveShadow = true;
    im.layers.enable(REFLECT_LAYER);
    meshes[part] = im;
    scene.add(im);
  }
  for (const b of list) { place(b, true); b.colShape = col.circle(b.x, b.z, b.r, 'breakable'); }
  for (const im of Object.values(meshes)) im.computeBoundingSphere();

  // debris: a pool of small instanced shards
  const N = 48;
  const shardG = new THREE.BoxGeometry(0.16, 0.1, 0.22);
  const shard = new THREE.InstancedMesh(shardG, new THREE.MeshStandardMaterial({ color: 0x8a939e, roughness: 0.4, metalness: 0.7 }), N);
  shard.frustumCulled = false; shard.castShadow = false;
  shard.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
  scene.add(shard);
  const bits = Array.from({ length: N }, () => ({ t: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3() }));
  let head = 0, live = 0;
  const e = new THREE.Euler(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) shard.setMatrixAt(i, zero);
  const tint = { crate: new THREE.Color(0x9aa4b0), vending: new THREE.Color(0xe8ecf2), holo: new THREE.Color(0.6, 1.2, 2.0) };
  const burst = (b) => {
    const n = b.kind === 'vending' ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const s = bits[head]; shard.setColorAt(head, tint[b.kind]); head = (head + 1) % N;
      s.t = 1.3 + Math.random() * 0.5;
      s.p.set(b.x + (Math.random() - 0.5) * 0.6, b.y + 0.4 + Math.random() * (b.kind === 'vending' ? 1.4 : 0.6), b.z + (Math.random() - 0.5) * 0.6);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3.5;
      s.v.set(Math.sin(a) * sp, 2.5 + Math.random() * 3, Math.cos(a) * sp);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); s.w.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
    }
    shard.instanceColor.needsUpdate = true;
    live = 2;
  };
  ctx.updaters.push((dt) => {
    if (!live) return;
    let any = false;
    bits.forEach((s, i) => {
      if (s.t <= 0) return;
      s.t -= dt; any = true;
      s.v.y -= 14 * dt; s.p.addScaledVector(s.v, dt);
      const g = col.groundAt(s.p.x, s.p.z) + 0.05;
      if (s.p.y < g) { s.p.y = g; s.v.multiplyScalar(0.4); s.v.y = Math.abs(s.v.y) * 0.3; s.w.multiplyScalar(0.5); }
      s.r.addScaledVector(s.w, dt);
      m4.compose(s.p, q.setFromEuler(e.set(s.r.x, s.r.y, s.r.z)), sc.setScalar(s.t <= 0 ? 0 : Math.min(1, s.t * 2)));
      shard.setMatrixAt(i, m4);
    });
    shard.instanceMatrix.needsUpdate = true;
    if (!any) live = 0;
  });

  const listeners = [];
  const api = {
    list,
    get alive() { return list.filter((b) => !b.broken); },
    near(x, z, r) { return list.filter((b) => !b.broken && Math.hypot(b.x - x, b.z - z) < r + b.r); },
    // dmg to one prop; returns true when this hit broke it
    hit(target, dmg = 999) {
      const b = typeof target === 'string' ? list.find((q) => q.id === target) : target;
      if (!b || b.broken) return false;
      b.hp -= dmg;
      if (b.hp > 0) return false;
      b.broken = true; b.hp = 0;
      place(b, false);
      if (b.colShape) { col.remove(b.colShape); b.colShape = null; }
      burst(b);
      for (const f of listeners) f(b);
      return true;
    },
    splash(x, z, r, dmg) { return api.near(x, z, r).filter((b) => api.hit(b, dmg)); },
    onBreak(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    reset() { for (const b of list) if (b.broken) { b.broken = false; b.hp = b.maxHp; place(b, true); b.colShape = col.circle(b.x, b.z, b.r, 'breakable'); } },
  };
  return api;
}
