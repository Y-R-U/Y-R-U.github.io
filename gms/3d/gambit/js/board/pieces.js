// GAMBIT piece pool. Resting pieces are drawn with one InstancedMesh per
// (piece kind × material), so the whole army costs ~12 draw calls. A piece that is
// animating gets a "live" clone (an ordinary Object3D sharing geometry/material)
// and is hidden from the instances until it lands.
import * as THREE from 'three';
import * as kit from '../themes/kit.js';

const KINDS = ['p', 'n', 'b', 'r', 'q', 'k'];
const CAP = 64;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export function defaultYaw(color) { return color === 'w' ? Math.PI / 2 : -Math.PI / 2; }

export class PieceSet {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'pieces';
    this.liveGroup = new THREE.Group(); this.liveGroup.name = 'live';
    scene.add(this.group, this.liveGroup);
    this.protos = new Map();
    // contact cue under every resting piece: soft dark AO + a faint light ring at the base edge
    const tex = kit.canvasTexture(128, 128, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.62, 'rgba(0,0,0,0.38)'); g.addColorStop(0.74, 'rgba(0,0,0,0.12)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.16)'); g.addColorStop(0.86, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    this.blobMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.blobMat, CAP);
    this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 0;
    this.group.add(this.blobs);    // 'wp' -> {obj, parts:[InstancedMesh], height, radius, yaw}
  }
  /** Build prototypes for every kind from theme (falling back to `fallback` per missing piece). */
  load(theme, fallback) {
    this.clearProtos();
    for (const color of ['w', 'b']) for (const t of KINDS) {
      let fn = theme.pieces?.[t], src = theme;
      if (typeof fn !== 'function') { fn = fallback?.pieces?.[t]; src = fallback; }
      let obj;
      try { obj = fn(THREE, kit, { color, type: t }); } catch (e) { console.error(`[board] piece ${color}${t} failed`, e); obj = fallback.pieces[t](THREE, kit, { color, type: t }); src = fallback; }
      const yaw = src.pieces?.facing?.[color] ?? defaultYaw(color);
      this.protos.set(color + t, this._bake(obj, yaw));
    }
  }
  _bake(obj, yaw) {
    obj.updateMatrixWorld(true);
    // vertexColors material on a geometry with no colour attribute renders black: patch it.
    obj.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(m => m.vertexColors)) kit.ensureColor(o.geometry);
    });
    const byMat = new Map();
    obj.traverse(o => {
      if (!o.isMesh || o.visible === false) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length > 1) { console.warn('[board] multi-material mesh baked with first material only'); }
      const m = mats[0];
      if (!byMat.has(m)) byMat.set(m, []);
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      byMat.get(m).push(g);
    });
    const parts = [];
    const box = new THREE.Box3().setFromObject(obj);
    for (const [mat, geoms] of byMat) {
      const geom = kit.merge(geoms); geoms.forEach(g => g.dispose());
      const im = new THREE.InstancedMesh(geom, mat, CAP);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.userData.ownGeom = true;
      this.group.add(im);
      parts.push(im);
    }
    const radius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    return { obj, parts, height: Math.max(0.3, box.max.y), radius: Math.min(0.48, radius), yaw };
  }
  height(color, type) { return this.protos.get(color + type)?.height ?? 0.8; }
  radius(color, type) { return this.protos.get(color + type)?.radius ?? 0.35; }
  /** Write instance matrices for every resting piece. recs: iterable of {type,color,x,z,live} */
  sync(recs) {
    const counts = new Map();
    for (const pr of this.protos.values()) for (const im of pr.parts) im.count = 0;
    let nb = 0;
    for (const r of recs) {
      if (r.live) continue;
      const prb = this.protos.get(r.color + r.type);
      if (prb && nb < CAP) { const d = prb.radius * 2.45; _m.compose(_p.set(r.x, 0.0015, r.z), _q.identity(), new THREE.Vector3(d, 1, d)); this.blobs.setMatrixAt(nb++, _m); }
      const pr = this.protos.get(r.color + r.type); if (!pr) continue;
      const i = counts.get(pr) || 0; if (i >= CAP) continue;
      counts.set(pr, i + 1);
      _p.set(r.x, 0, r.z); _q.setFromAxisAngle(UP, pr.yaw);
      _m.compose(_p, _q, _s);
      for (const im of pr.parts) { im.setMatrixAt(i, _m); im.count = i + 1; }
    }
    for (const pr of this.protos.values()) for (const im of pr.parts) im.instanceMatrix.needsUpdate = true;
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
  }
  /** A live, animatable piece: outer Group (anims drive position/rotation/scale) → inner yaw → model. */
  makeLive(color, type) {
    const pr = this.protos.get(color + type);
    const outer = new THREE.Group(), inner = new THREE.Group();
    inner.rotation.y = pr.yaw;
    const model = pr.obj.clone(true);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    inner.add(model); outer.add(inner);
    outer.userData = { type, color, model, inner, height: pr.height, radius: pr.radius };
    this.liveGroup.add(outer);
    return outer;
  }
  removeLive(obj) {
    if (!obj) return;
    kit.dispose(obj);
    obj.parent?.remove(obj);
  }
  clearProtos() {
    for (const pr of this.protos.values()) for (const im of pr.parts) { this.group.remove(im); im.geometry.dispose(); im.dispose(); }
    for (const pr of this.protos.values()) pr.obj.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    this.protos.clear();
  }
  /** Triangles per kind (for budgets/gallery). */
  report() {
    const out = {};
    for (const [k, pr] of this.protos) { const s = kit.stats(pr.obj); out[k] = { tris: s.tris, meshes: s.meshes, drawCalls: pr.parts.length, height: +pr.height.toFixed(2) }; }
    return out;
  }
  dispose() { this.clearProtos(); this.group.parent?.remove(this.group); this.liveGroup.parent?.remove(this.liveGroup); }
}
