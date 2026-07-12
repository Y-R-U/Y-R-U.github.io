// LONGSHOT — rigged-character loader + procedural animation.
// Adapted from app/3d/gallery/js/charrig.js: all PolyPerfect "Animated People"
// share ONE skeleton (_MainRig, identical bone names), so this bone-name-keyed
// pose set drives every character in the pack with no retargeting. Pack is
// assets/chars.dat (XOR(gzip(glb), keystream(name)), distinct key, built by
// tools/build_chars.py) — no raw GLB/PNG in the repo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const KEY = 'longshot-chars-LS!aron-2026';   // must match tools/build_chars.py
const BASE = new URL('../assets/', import.meta.url);
const PACK = new URL('chars.dat', BASE).href;
const INDEX = new URL('chars.index.json', BASE).href;

const loader = new GLTFLoader();
let index = null;
let fullBlob = null;
const sliceCache = new Map();

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
async function entryBytes(e) {
  if (fullBlob) return new Uint8Array(fullBlob, e.off, e.len);
  const res = await fetch(PACK, { headers: { Range: `bytes=${e.off}-${e.off + e.len - 1}` } });
  const buf = new Uint8Array(await res.arrayBuffer());
  return (res.status === 206 || buf.length === e.len) ? buf : buf.subarray(e.off, e.off + e.len);
}
async function decode(name) {
  if (sliceCache.has(name)) return sliceCache.get(name);
  const e = index.entries[name];
  if (!e) throw new Error(`character not in pack: ${name}`);
  const p = entryBytes(e).then(enc => gunzip(unxor(fnv1a(`${KEY}:${name}`), enc)));
  sliceCache.set(name, p);
  return p;
}
export async function initChars() {
  index = await fetch(INDEX).then(r => r.json());
  const rangeOK = await fetch(PACK, { headers: { Range: 'bytes=0-0' } })
    .then(r => r.status === 206).catch(() => false);
  if (!rangeOK) fullBlob = await fetch(PACK).then(r => r.arrayBuffer());
  return Object.keys(index.entries);
}

// ── body-space bone control (x=right, y=up, z=forward) ──────────────────────
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const qx = a => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
const qy = a => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qz = a => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const DOWN_R = qz(Math.PI / 2);    // T-pose right arm (-x) → hangs down
const DOWN_L = qz(-Math.PI / 2);

function findBone(root, name) {
  let hit = null;
  root.traverse(o => { if (!hit && o.isBone && o.name === name) hit = o; });
  return hit;
}
function makeCtrl(group, bone) {
  if (!bone || !bone.parent) return null;
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  const target = new THREE.Quaternion();
  return {
    bone,
    apply(W) { target.copy(parentRelInv).multiply(W).multiply(restRel); },
    commit(alpha) { alpha >= 1 ? bone.quaternion.copy(target) : bone.quaternion.slerp(target, alpha); },
  };
}

// ── animation set — LONGSHOT's street life ──────────────────────────────────
const ANIMS = {
  idle(C, t, S) {
    const b = Math.sin(t * 1.6), s = Math.sin(t * 0.5);
    C.rArm && C.rArm.apply(qx(0.05 * b).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(-0.05 * b).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.12 + 0.04 * b));
    C.lElb && C.lElb.apply(qx(0.12 - 0.04 * b));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qx(-0.03 - 0.025 * b));
    C.head && C.head.apply(qy(s * 0.12).multiply(qx(0.04 * b)));
    S.bob = Math.sin(t * 1.6) * 0.006;
  },
  walk(C, t, S) {
    const sw = Math.sin(t * 7.6) * 0.5;
    C.rLeg && C.rLeg.apply(qx(sw)); C.lLeg && C.lLeg.apply(qx(-sw));
    C.rKnee && C.rKnee.apply(qx(Math.max(0, -sw) * 1.0));
    C.lKnee && C.lKnee.apply(qx(Math.max(0, sw) * 1.0));
    C.rArm && C.rArm.apply(qx(-sw * 0.8).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(sw * 0.8).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.25)); C.lElb && C.lElb.apply(qx(0.25));
    C.spine && C.spine.apply(qx(-0.05));
    C.head && C.head.apply(qy(0));
    S.bob = Math.abs(Math.sin(t * 7.6)) * 0.04;
  },
  run(C, t, S) {
    const sw = Math.sin(t * 11.5) * 0.85;
    C.rLeg && C.rLeg.apply(qx(sw)); C.lLeg && C.lLeg.apply(qx(-sw));
    C.rKnee && C.rKnee.apply(qx(Math.max(0.15, -sw) * 1.4));
    C.lKnee && C.lKnee.apply(qx(Math.max(0.15, sw) * 1.4));
    C.rArm && C.rArm.apply(qx(-sw * 1.1).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(sw * 1.1).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(1.0)); C.lElb && C.lElb.apply(qx(1.0));
    C.spine && C.spine.apply(qx(-0.22));
    C.head && C.head.apply(qx(0.1));
    S.bob = Math.abs(Math.sin(t * 11.5)) * 0.07;
  },
  panic(C, t, S) {
    // flat-out flee, arms half-raised and flailing
    const sw = Math.sin(t * 12.5) * 0.9;
    C.rLeg && C.rLeg.apply(qx(sw)); C.lLeg && C.lLeg.apply(qx(-sw));
    C.rKnee && C.rKnee.apply(qx(Math.max(0.15, -sw) * 1.4));
    C.lKnee && C.lKnee.apply(qx(Math.max(0.15, sw) * 1.4));
    C.rArm && C.rArm.apply(qz(-1.05 + Math.sin(t * 12.5) * 0.25).multiply(qx(0.4)));
    C.lArm && C.lArm.apply(qz(1.05 - Math.sin(t * 12.5 + 1.7) * 0.25).multiply(qx(0.4)));
    C.rElb && C.rElb.apply(qx(-0.6)); C.lElb && C.lElb.apply(qx(-0.6));
    C.spine && C.spine.apply(qx(-0.3));
    C.head && C.head.apply(qx(0.12));
    S.bob = Math.abs(Math.sin(t * 12.5)) * 0.08;
  },
  phone(C, t, S) {
    // right hand to ear, weight shifts, occasional nod
    const b = Math.sin(t * 1.3);
    C.rArm && C.rArm.apply(qz(0.95).multiply(qx(0.55)));
    C.rElb && C.rElb.apply(qx(2.35 + 0.05 * b));
    C.lArm && C.lArm.apply(qx(-0.04 * b).multiply(DOWN_L));
    C.lElb && C.lElb.apply(qx(0.14));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qy(0.08 * b).multiply(qx(-0.03)));
    C.head && C.head.apply(qy(-0.18).multiply(qx(0.12 + 0.06 * Math.sin(t * 2.7))));
    S.bob = 0;
  },
  talk(C, t, S) {
    // animated conversation — right hand gesturing
    const g = Math.sin(t * 3.1), b = Math.sin(t * 1.5);
    C.rArm && C.rArm.apply(qx(0.5 + 0.15 * g).multiply(qz(0.9)));
    C.rElb && C.rElb.apply(qx(1.3 + 0.35 * g));
    C.lArm && C.lArm.apply(qx(-0.03 * b).multiply(DOWN_L));
    C.lElb && C.lElb.apply(qx(0.25));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qx(-0.04).multiply(qy(0.05 * b)));
    C.head && C.head.apply(qx(0.05 * g).multiply(qy(0.08 * b)));
    S.bob = 0;
  },
  watch(C, t, S) {
    // hands clasped behind, surveying — window/balcony targets
    const b = Math.sin(t * 0.7);
    C.rArm && C.rArm.apply(qx(-0.5).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(-0.5).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.85)); C.lElb && C.lElb.apply(qx(0.85));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qx(-0.06));
    C.head && C.head.apply(qy(b * 0.3).multiply(qx(0.02)));
    S.bob = 0;
  },
  guard(C, t, S) {
    // sentry: arms folded low in front, slow head scan
    const s = Math.sin(t * 0.55);
    C.rArm && C.rArm.apply(qx(0.35).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(0.35).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(1.15).multiply(qy(0.5)));
    C.lElb && C.lElb.apply(qx(1.15).multiply(qy(-0.5)));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qx(-0.05));
    C.head && C.head.apply(qy(s * 0.55).multiply(qx(0.02)));
    S.bob = 0;
  },
  sit(C, t, S) {
    // park bench — thighs forward, shins down (group is raised by people.js)
    const b = Math.sin(t * 1.4);
    C.rLeg && C.rLeg.apply(qx(-1.45)); C.lLeg && C.lLeg.apply(qx(-1.45));
    C.rKnee && C.rKnee.apply(qx(1.5)); C.lKnee && C.lKnee.apply(qx(1.5));
    C.rArm && C.rArm.apply(qx(0.35).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(0.35).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.9 + 0.03 * b)); C.lElb && C.lElb.apply(qx(0.9 - 0.03 * b));
    C.spine && C.spine.apply(qx(-0.12));
    C.head && C.head.apply(qy(Math.sin(t * 0.4) * 0.2).multiply(qx(0.04 * b)));
    S.bob = 0;
  },
  dead(C, t, S) {
    // limp sprawl — people.js rotates the whole group to the ground
    C.rArm && C.rArm.apply(qx(0.35).multiply(qz(1.1)));
    C.lArm && C.lArm.apply(qx(-0.2).multiply(qz(-1.2)));
    C.rElb && C.rElb.apply(qx(0.35)); C.lElb && C.lElb.apply(qx(0.2));
    C.rLeg && C.rLeg.apply(qx(0.25).multiply(qy(0.1)));
    C.lLeg && C.lLeg.apply(qx(-0.15));
    C.rKnee && C.rKnee.apply(qx(0.4)); C.lKnee && C.lKnee.apply(qx(0.15));
    C.spine && C.spine.apply(qx(0.12));
    C.head && C.head.apply(qx(0.3).multiply(qy(0.4)));
    S.bob = 0;
  },
};
export const ANIM_NAMES = Object.keys(ANIMS);

// ── load + drive one character ──────────────────────────────────────────────
// Templates parse once per file; every spawn is a SkeletonUtils clone.
const tplCache = new Map();
export async function loadTemplate(file) {
  if (tplCache.has(file)) return tplCache.get(file);
  const p = (async () => {
    const bytes = await decode(file);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
    return gltf.scene;
  })();
  tplCache.set(file, p);
  return p;
}

export async function loadCharacter(file, opts = {}) {
  const tpl = await loadTemplate(file);
  return driveModel(skClone(tpl), file, opts);
}

export function driveModel(model, file, opts = {}) {
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = false;
      o.frustumCulled = false;            // skinned bounds drift; never cull
    }
  });

  const group = new THREE.Group();
  group.add(model);
  group.updateMatrixWorld(true);

  const B = n => findBone(model, n);
  const ctl = {
    rLeg: makeCtrl(group, B('Hip_R')), lLeg: makeCtrl(group, B('Hip_L')),
    rKnee: makeCtrl(group, B('Knee_R')), lKnee: makeCtrl(group, B('Knee_L')),
    rArm: makeCtrl(group, B('Shoulder_R')), lArm: makeCtrl(group, B('Shoulder_L')),
    rElb: makeCtrl(group, B('Elbow_R')), lElb: makeCtrl(group, B('Elbow_L')),
    spine: makeCtrl(group, B('Spine1_M')) || makeCtrl(group, B('Chest_M')),
    head: makeCtrl(group, B('Head_M')),
  };

  const char = {
    group, ctl, file, model,
    anim: opts.anim || 'idle',
    _t: Math.random() * 100, _first: true, _baseY: 0,
    setAnim(name) { if (ANIMS[name]) this.anim = name; },
    update(dt) {
      this._t += dt;
      const S = { bob: 0 };
      (ANIMS[this.anim] || ANIMS.idle)(ctl, this._t, S);
      const alpha = this._first ? 1 : 1 - Math.exp(-dt * 8.5);
      for (const k in ctl) ctl[k] && ctl[k].commit(alpha);
      model.position.y = this._baseY + S.bob;
      this._first = false;
    },
  };
  return char;
}
