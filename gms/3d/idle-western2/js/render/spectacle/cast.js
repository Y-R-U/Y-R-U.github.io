import * as THREE from 'three';
import { CHARACTERS, HAT, HAT_COLORS, HAT_SEAT, CROWD_K, CLIP, hatGeometry } from '../kit/crowd.js?v=20261004e';

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
const _sq = new THREE.Matrix4(), _t = new THREE.Matrix4();
// R5: a hat drawn tilted (front down, back brim up) and narrower than the rig's own, so a foreground figure seen from
// behind and above reads as a body under a hat rather than a hat. Not while tipping it.
const tilted = (h, a) => h.tilt && h.type >= 0 && !h.off && !h.gone && !(h.lift > 0) && a.clip !== CLIP.tiphat;

export const hatIndex = (t) => (t == null || t === -1 ? -1 : typeof t === 'string' ? HAT[t] ?? -1 : t);
export const hatColor = (c) => HAT_COLORS[c] || c || '#c9a06a';
export const dressScale = (name) => CHARACTERS[name]?.s ?? 1.15;

function mergedHats() {
  const parts = Object.values(HAT).map((t) => [t, hatGeometry(t)]);
  let n = 0;
  for (const [, g] of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPbr', 3]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const [, g] of parts) { const a = g.attributes[k]; if (a) arr.set(a.array, o); o += g.attributes.position.count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  const ht = new Float32Array(n);
  let o = 0;
  for (const [t, g] of parts) { ht.fill(t, o, o + g.attributes.position.count); o += g.attributes.position.count; }
  out.setAttribute('aHat', new THREE.BufferAttribute(ht, 1));
  out.computeBoundingSphere();
  return out;
}

export function createCast(kit, scene, cap = 48) {
  const crowd = kit.crowd({ count: cap, blobs: true, scale: RIG_SCALE, radius: 1e5, hats: false, rig: 'full', pool: false });
  const mesh = crowd.mesh, blobs = crowd.blobMesh;
  mesh.name = 'spectacle:cast';
  mesh.frustumCulled = false;
  if (blobs) blobs.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  // Every hat type merged into one geometry; each instance picks its type (iHat) and the shader collapses the rest
  // (PERF P#9: one draw for all tossed / shot-off / dropping hats instead of one mesh per type).
  const HATS_N = 16;
  const hatGeo = mergedHats();
  const iHat = new THREE.InstancedBufferAttribute(new Float32Array(HATS_N), 1);
  hatGeo.setAttribute('iHat', iHat);
  const hatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.3 });
  const uber = kit.materials.uber;
  hatMat.onBeforeCompile = (sh, r) => {
    uber.onBeforeCompile?.(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHat;\nattribute float iHat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= float(abs(aHat - iHat) < 0.5);');
  };
  hatMat.customProgramCacheKey = () => 'iw2-spectacle-hats';
  const hats = new THREE.InstancedMesh(hatGeo, hatMat, HATS_N);
  for (let k = 0; k < HATS_N; k++) hats.setColorAt(k, _c.set(0xffffff));
  hats.frustumCulled = false; hats.count = 0; hats.visible = false; hats.name = 'spectacle:hats';
  scene.add(hats);
  let nHats = 0;
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
    const h = a.hat, onHead = h.type >= 0 && !h.off && !h.gone && !(h.lift > 0) && !tilted(h, a);
    const hk = onHead ? h.type + ':' + h.scale.toFixed(3) + ':' + h.color : 'none';
    if (hatKeys[i] !== hk) { hatKeys[i] = hk; if (onHead) crowd.hat(i, h.type, h.scale, hatColor(h.color)); else crowd.look(i, { hat: -1 }); }
  }

  const api = {
    mesh, cap, bodyS,
    // pool: every actor slot (index = instance); show(a) says whether this camera sees it.
    write(pool, show) {
      nHats = 0;
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
          // Squash/stretch (a.sq: world-vertical scale about the ground point, volume kept).
          if (a.sq && a.sq !== 1) {
            const k = 1 / Math.sqrt(a.sq);
            mesh.getMatrixAt(i, _m);
            _sq.makeTranslation(a.x, 0, a.z).multiply(_t.makeScale(k, a.sq, k)).multiply(_r.makeTranslation(-a.x, 0, -a.z));
            mesh.setMatrixAt(i, _m.premultiply(_sq));
          }
        }
        const h = a.hat, tl = tilted(h, a);
        if (tl || (h.type >= 0 && !h.gone && (h.off || h.lift > 0))) {
          const j = nHats;
          if (j < HATS_N) {
            if (h.off) {
              _e.set(h.off.rx || 0, h.off.ry || 0, h.off.rz || 0, 'YXZ');
              _q.setFromEuler(_e);
              _m.compose(_v.set(h.off.x, h.off.y, h.off.z), _q, _s.setScalar(h.scale * bodyS(a)));
            } else if (tl) {
              // Seat it where the rig's shader would (head scaled about the neck, legs lengthened).
              const L = a.look || {}, hk = (L.head ?? 1.24) * 1.14, seat = 0.76 + (HAT_SEAT - 0.76) * hk + 0.4 * ((L.legs ?? 0.95) - 1);
              bodyMatrix(a, _m);
              _e.set(h.tilt, 0, 0);
              _r.makeRotationFromEuler(_e).setPosition(0, seat, 0);
              _m.multiply(_r).multiply(_r.makeScale(h.scale * hk * (h.brim || 1), h.scale * hk, h.scale * hk * (h.brim || 1)));
              if (a.sq && a.sq !== 1) { const k = 1 / Math.sqrt(a.sq); _m.premultiply(_sq.makeTranslation(a.x, 0, a.z).multiply(_t.makeScale(k, a.sq, k)).multiply(_r.makeTranslation(-a.x, 0, -a.z))); }
            } else {
              bodyMatrix(a, _m);
              _r.makeScale(h.scale, h.scale, h.scale).setPosition(0, HAT_SEAT + h.lift, 0);
              _m.multiply(_r);
            }
            hats.setMatrixAt(j, _m);
            hats.setColorAt(j, _c.set(hatColor(h.color)));
            iHat.setX(j, h.type);
            nHats = j + 1;
          }
        }
      }
      mesh.count = hi;
      mesh.visible = hi > 0;
      if (blobs) { blobs.count = hi; blobs.visible = hi > 0; }
      if (hi) crowd.commit();
      hats.count = nHats;
      hats.visible = nHats > 0;
      if (nHats) { hats.instanceMatrix.needsUpdate = true; hats.instanceColor.needsUpdate = true; iHat.needsUpdate = true; }
      return hi;
    },
    // Height of a hat lying crown-down (upturned) on the ground, so its brim sits at the surface.
    hatRest(a) {
      const g = hatGeometry(a.hat.type);
      if (!g.boundingBox) g.computeBoundingBox();
      return g.boundingBox.max.y * a.hat.scale * bodyS(a) + 0.02;
    },
    // Brim radius of the hat on a's head (0 without one): spectacle cameras keep big hats out of the lens.
    hatRadius(a) {
      if (a.hat.type < 0) return 0;
      const g = hatGeometry(a.hat.type);
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      return Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z) * a.hat.scale * bodyS(a);
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
      if (on) { hats.setMatrixAt(0, _m.makeTranslation(0, -40, 0)); iHat.setX(0, 0); hats.count = 1; hats.visible = true; iHat.needsUpdate = true; hats.instanceMatrix.needsUpdate = true; }
      else { hats.count = 0; hats.visible = false; }
    },
    get calls() { return (mesh.visible ? 2 : 0) + (hats.visible ? 1 : 0); },
  };
  return api;
}
