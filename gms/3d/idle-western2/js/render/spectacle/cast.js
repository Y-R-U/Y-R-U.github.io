import * as THREE from 'three';
import { CHARACTERS, HAT, HAT_COLORS, HAT_SEAT, CROWD_K, hatGeometry } from '../kit/crowd.js?v=20261004a';

// Spectacle cast on lane A's caricature rig (kit/crowd.js): one InstancedMesh + one blob draw for every hero actor,
// hats/moustaches/accessories inside the rig. Instance index = pool index, so a look is uploaded once per actor and
// each camera only rewrites matrices. A hat that leaves the head (tossed, shot off, dropping on) is drawn by a small
// InstancedMesh per hat type, created on first use.
const RIG_SCALE = 1.25;
const BODY_C = 0.62;
const HEAD_TOP = 1.25;
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
  _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export const hatIndex = (t) => (t == null || t === -1 ? -1 : typeof t === 'string' ? HAT[t] ?? -1 : t);
export const hatColor = (c) => HAT_COLORS[c] || c || '#c9a06a';
export const dressScale = (name) => CHARACTERS[name]?.s ?? 1.15;

export function createCast(kit, scene, cap = 48) {
  const crowd = kit.crowd({ count: cap, blobs: true, scale: RIG_SCALE, radius: 1e5, hats: false });
  const mesh = crowd.mesh, blobs = crowd.blobMesh;
  mesh.name = 'spectacle:cast';
  mesh.frustumCulled = false;
  if (blobs) blobs.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const flying = new Map();
  function hatMesh(t) {
    let m = flying.get(t);
    if (m) return m;
    m = new THREE.InstancedMesh(hatGeometry(t), kit.materials.lambertVCInst, 12);
    for (let k = 0; k < 12; k++) m.setColorAt(k, _c.set(0xffffff));
    m.frustumCulled = false; m.count = 0; m.visible = false; m.name = 'spectacle:hat' + t;
    m.userData.n = 0;
    scene.add(m);
    flying.set(t, m);
    return m;
  }
  const keys = new Array(cap).fill(null), hatKeys = new Array(cap).fill(null);
  const bodyS = (a) => RIG_SCALE * CROWD_K * (a.bodyS || 1) * (a.s || 1);
  function bodyMatrix(a, out) {
    const S0 = bodyS(a), c = BODY_C * S0;
    _e.set(a.pitch || 0, a.h || 0, a.roll || 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(0, -c, 0).applyQuaternion(_q);
    _p.x += a.x; _p.y += (a.y || 0) + c; _p.z += a.z;
    return out.compose(_p, _q, _s.setScalar(S0));
  }
  function dressSlot(i, a) {
    if (keys[i] !== a.lookKey) {
      keys[i] = a.lookKey;
      if (a.dress && CHARACTERS[a.dress]) crowd.dress(i, a.dress);
      else if (a.look) {
        const L = a.look;
        crowd.look(i, { top: L.top, bot: L.bot, skin: L.skin ?? 1, hair: L.hair ?? 0, style: L.style ?? 0, acc: L.acc || [], stache: L.stache ?? -1 });
        crowd.body(i, L.head ?? 1.24, L.legs ?? 0.95, a.bodyS || 1, L.girth ?? 1);
      }
      hatKeys[i] = null;
    }
    const h = a.hat, onHead = h.type >= 0 && !h.off && !h.gone && !(h.lift > 0);
    const hk = onHead ? h.type + ':' + h.scale.toFixed(3) + ':' + h.color : 'none';
    if (hatKeys[i] !== hk) { hatKeys[i] = hk; if (onHead) crowd.hat(i, h.type, h.scale, hatColor(h.color)); else crowd.look(i, { hat: -1 }); }
  }

  const api = {
    mesh, cap, bodyS,
    // pool: every actor slot (index = instance); show(a) says whether this camera sees it.
    write(pool, show) {
      for (const m of flying.values()) m.userData.n = 0;
      let hi = 0;
      for (let i = 0; i < pool.length; i++) {
        const a = pool[i];
        const on = a.used && !a.hidden && show(a);
        if (!on || a.bodyless) { if (i < mesh.count) { mesh.setMatrixAt(i, ZERO); blobs?.setMatrixAt(i, ZERO); } }
        if (!on) continue;
        if (!a.bodyless) {
          hi = i + 1;
          dressSlot(i, a);
          crowd.place(i, { x: a.x, y: a.y || 0, z: a.z, heading: a.h || 0, pitch: a.pitch || 0, roll: a.roll || 0, clip: a.clip || 0, phase: a.phase, speed: a.speed, s: a.s || 1 });
        }
        const h = a.hat;
        if (h.type >= 0 && !h.gone && (h.off || h.lift > 0)) {
          const m = hatMesh(h.type), j = m.userData.n;
          if (j < 12) {
            if (h.off) {
              _e.set(h.off.rx || 0, h.off.ry || 0, h.off.rz || 0, 'YXZ');
              _q.setFromEuler(_e);
              _m.compose(_v.set(h.off.x, h.off.y, h.off.z), _q, _s.setScalar(h.scale * bodyS(a)));
            } else {
              bodyMatrix(a, _m);
              _r.makeScale(h.scale, h.scale, h.scale).setPosition(0, HAT_SEAT + h.lift, 0);
              _m.multiply(_r);
            }
            m.setMatrixAt(j, _m);
            m.setColorAt(j, _c.set(hatColor(h.color)));
            m.userData.n = j + 1;
          }
        }
      }
      mesh.count = hi;
      mesh.visible = hi > 0;
      if (blobs) { blobs.count = hi; blobs.visible = hi > 0; }
      if (hi) crowd.commit();
      for (const m of flying.values()) {
        m.count = m.userData.n;
        m.visible = m.count > 0;
        if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      }
      return hi;
    },
    head(a, out = []) { return api.local(a, 0, HEAD_TOP + 0.1, 0, out); },
    local(a, lx, ly, lz, out = []) {
      bodyMatrix(a, _m);
      _v.set(lx, ly, lz).applyMatrix4(_m);
      out[0] = _v.x; out[1] = _v.y; out[2] = _v.z;
      return out;
    },
    centre(a, out = []) { return api.local(a, 0, BODY_C, 0, out); },
    // Every flying-hat mesh exists (and is visible once) for the boot shader warm-up.
    warm(on) {
      for (const t of Object.values(HAT)) {
        const m = hatMesh(t);
        if (on) { m.setMatrixAt(0, _m.makeTranslation(0, -40, 0)); m.count = 1; m.visible = true; }
        else { m.count = 0; m.visible = false; }
      }
    },
    get calls() { let n = mesh.visible ? 2 : 0; for (const m of flying.values()) if (m.visible) n++; return n; },
  };
  return api;
}
