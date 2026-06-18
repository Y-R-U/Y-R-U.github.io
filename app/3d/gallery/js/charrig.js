// Rigged-character loader + procedural animation for the PolyPerfect
// "Low Poly Animated People". All 118 characters are skinned to ONE shared
// skeleton (_MainRig — identical bone names), so a single bone-name-keyed
// animation set drives every one of them with no per-character work and no
// retargeting. This generalises the Glade's imported-hero rig driver
// (gms/3d/fable5_glade/js/imported.js) into a standalone, reusable module.
//
// The rigged GLBs live in a protected pack (assets/chars.dat), built by
// tools/build_chars.py with the same obfuscation + HTTP-Range scheme as the
// gallery: entry = XOR(gzip(glb), keystream(name)); we reverse it here and
// range-fetch only the characters actually loaded. Textures stay embedded
// (all 118 share one tiny ~33 KB atlas), so each GLB is correct on its own.
//
// Bones come in arbitrary FBX local frames (a T-pose). Rather than poke
// bone.rotation we drive each controlled bone with a rotation expressed in
// clean BODY space (x=right, y=up, z=forward): we capture each bone's rest
// orientation relative to the character group, so the group's world rotation
// cancels and the same body-space pose works at any yaw —
//     bone.local = parentRestRelGroup⁻¹ · W · boneRestRelGroup
// Poses set a TARGET; update() slerps toward it, so switching animations
// crossfades smoothly instead of popping.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KEY = 'lpup-chars-3Dz!aron-2026';   // must match tools/build_chars.py
const PACK = 'assets/chars.dat';
const INDEX = 'assets/chars.index.json';

const loader = new GLTFLoader();
let index = null;
let rangeOK = false;
let fullBlob = null;
const sliceCache = new Map();

// ── cipher (mirrors build_chars.py / assets.js) ─────────────────────────────
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

// Load the index once; probe Range support (GitHub Pages CDN → 206 lazy slices;
// a server that ignores it → fetch the blob once and slice in memory).
export async function initChars() {
  index = await fetch(INDEX).then(r => r.json());
  rangeOK = await fetch(PACK, { headers: { Range: 'bytes=0-0' } })
    .then(r => r.status === 206).catch(() => false);
  if (!rangeOK) fullBlob = await fetch(PACK).then(r => r.arrayBuffer());
  return { entries: Object.keys(index.entries), rangeOK };
}
export const hasChar = (file) => !!(index && index.entries[file]);

// ── body-space bone control ─────────────────────────────────────────────────
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const qx = a => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
const qy = a => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qz = a => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const DOWN_R = qz(Math.PI / 2);    // T-pose right arm (-x) → hangs down (-y)
const DOWN_L = qz(-Math.PI / 2);   // left mirrored

function findBone(root, name) {
  let hit = null;
  root.traverse(o => { if (!hit && o.isBone && o.name === name) hit = o; });
  return hit;
}
// One controlled bone. apply(W) records the target so the bone's orientation,
// measured in body space, becomes W·rest. commit(alpha) slerps toward it.
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

// ── animation set — each pose fn is keyed purely by bone name, so it drives
//    any of the 118 characters. S.bob lets a clip add a vertical body bounce.
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
  wave(C, t, S) {
    // left arm rests at the side; right arm raised on ITS OWN side, forearm waving.
    // The right arm rests pointing -x; qz(-π/2) is straight up, so we stop short of
    // that (-1.35) to keep the hand up-and-out to the RIGHT — NOT across the head.
    C.lArm && C.lArm.apply(qx(0.04).multiply(DOWN_L));
    C.lElb && C.lElb.apply(qx(0.12));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.rArm && C.rArm.apply(qz(-1.35).multiply(qx(0.12)));
    C.rElb && C.rElb.apply(qx(-0.35 + Math.sin(t * 7.5) * 0.5));
    C.spine && C.spine.apply(qx(-0.02));
    C.head && C.head.apply(qy(0.1).multiply(qx(0.04)));
    S.bob = 0;
  },
  look(C, t, S) {
    const s = Math.sin(t * 0.9);
    C.rArm && C.rArm.apply(qx(0.03).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(-0.03).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.14)); C.lElb && C.lElb.apply(qx(0.14));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(0)); C.lKnee && C.lKnee.apply(qx(0));
    C.spine && C.spine.apply(qy(s * 0.14).multiply(qx(-0.02)));
    C.head && C.head.apply(qy(s * 0.5).multiply(qx(Math.sin(t * 0.45) * 0.12)));
    S.bob = 0;
  },
  cheer(C, t, S) {
    const p = Math.sin(t * 4.2);
    // both arms up on their OWN sides (right ~-90°, left ~+90°), pumping toward vertical
    C.rArm && C.rArm.apply(qz(-1.35 - 0.18 * p));
    C.lArm && C.lArm.apply(qz(1.35 + 0.18 * p));
    C.rElb && C.rElb.apply(qx(-0.3)); C.lElb && C.lElb.apply(qx(-0.3));
    C.rLeg && C.rLeg.apply(qx(0)); C.lLeg && C.lLeg.apply(qx(0));
    C.rKnee && C.rKnee.apply(qx(Math.max(0, p) * 0.25));
    C.lKnee && C.lKnee.apply(qx(Math.max(0, p) * 0.25));
    C.spine && C.spine.apply(qx(-0.06));
    C.head && C.head.apply(qx(-0.08));
    S.bob = Math.max(0, p) * 0.06;
  },
  jump(C, t, S) {
    // periodic standing hop: wind-up crouch → spring up (the WHOLE body lifts off
    // the ground via S.bob, feet and all) → land and absorb. S.bob is continuous
    // across the three phases so the arc is smooth; the bone targets slerp.
    const P = 1.25;                      // seconds per hop
    const u = (t % P) / P;               // cycle phase 0..1
    let h, knee, hip, arm, lean;
    if (u < 0.20) {                      // crouch / wind-up
      const k = Math.sin((u / 0.20) * Math.PI / 2);
      h = -0.12 * k; knee = 1.0 * k; hip = 0.45 * k; arm = 0.5 * k; lean = 0.18 * k;
    } else if (u < 0.64) {               // launch + airborne
      const k = (u - 0.20) / 0.44;
      const arc = Math.sin(k * Math.PI); // 0 → 1 (apex) → 0
      h = -0.12 + 0.72 * arc;            // legs straighten at the apex, bend at both ends
      knee = 0.9 * (1 - arc); hip = 0.4 * (1 - arc);
      arm = -1.6 * Math.min(1, k * 1.6); lean = -0.05;   // arms throw forward-up
    } else {                             // land + absorb
      const k = (u - 0.64) / 0.36;
      const dip = Math.sin(k * Math.PI);
      h = -0.12 * (1 - k) - 0.05 * dip;
      knee = 0.9 * (1 - k) + 0.3 * dip; hip = 0.4 * (1 - k);
      arm = -1.6 * (1 - k); lean = 0.1 * dip;
    }
    C.rLeg && C.rLeg.apply(qx(hip)); C.lLeg && C.lLeg.apply(qx(hip));
    C.rKnee && C.rKnee.apply(qx(knee)); C.lKnee && C.lKnee.apply(qx(knee));
    C.rArm && C.rArm.apply(qx(arm).multiply(DOWN_R));
    C.lArm && C.lArm.apply(qx(arm).multiply(DOWN_L));
    C.rElb && C.rElb.apply(qx(0.2)); C.lElb && C.lElb.apply(qx(0.2));
    C.spine && C.spine.apply(qx(lean));
    C.head && C.head.apply(qx(-lean * 0.4));
    S.bob = h;
  },
};
export const ANIM_NAMES = Object.keys(ANIMS);

// ── load + drive one character ──────────────────────────────────────────────
// Returns { group, update(dt), setAnim(name), anim, file }. The group's origin
// is at the character's feet; place/scale/rotate it freely.
export async function loadCharacter(file, opts = {}) {
  const bytes = await decode(file);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  const model = gltf.scene;
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true;
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

  const order = ANIM_NAMES.slice();
  const cycle = opts.cycle !== false;            // auto-cycle through the set
  const cycleEvery = opts.cycleEvery ?? (7 + Math.random() * 5);
  const phase = opts.phase ?? Math.random() * 100;

  const char = {
    group, ctl, file,
    anim: opts.anim || order[Math.floor(Math.random() * order.length)],
    _i: 0, _t: 0, _cyc: 0, _first: true, _baseY: group.position.y,
    setAnim(name) { if (ANIMS[name]) { this.anim = name; } },
    update(dt) {
      this._t += dt;
      if (cycle) {
        this._cyc += dt;
        if (this._cyc >= cycleEvery) {
          this._cyc = 0;
          this._i = (this._i + 1) % order.length;
          this.anim = order[this._i];
        }
      }
      const S = { bob: 0 };
      (ANIMS[this.anim] || ANIMS.idle)(ctl, this._t + phase, S);
      const alpha = this._first ? 1 : 1 - Math.exp(-dt * 8.5);
      for (const k in ctl) ctl[k] && ctl[k].commit(alpha);
      group.position.y = this._baseY + S.bob;
      this._first = false;
    },
  };
  if (opts.anim) { char.anim = opts.anim; char._i = Math.max(0, order.indexOf(opts.anim)); }
  return char;
}
