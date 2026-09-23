// Billboard / sprite / light pooling. FROZEN after W0.
//
// The rule the whole VFX budget rests on: a cinematic beat must not allocate. Everything is
// acquired from a fixed-size pool and released back. When full, optional lights are
// omitted; a live resource must never be stolen from an effect that still owns it.

import * as THREE from 'three';

export class Pool {
  // make() builds one item, reset(item) puts it back to a neutral state.
  constructor({ label, cap, make, reset }) {
    this.label = label;
    this.cap = cap;
    this.make = make;
    this.reset = reset;
    this.free = [];
    this.live = [];
    this.built = 0;
  }

  setCap(n) {
    this.cap = n | 0;
    while (this.live.length > this.cap) this.release(this.live[0]);
  }

  acquire(reserve = 0) {
    if (this.live.length >= this.cap - reserve) return null;
    if (this.free.length) return this.track(this.free.pop());
    if (this.built < this.cap) { this.built++; return this.track(this.make()); }
    return null;
  }

  // Keep the renderer's light count constant before combat starts. Stealing a live
  // light lets its previous owner move or release another explosion's light.
  warm() {
    while (this.built < this.cap) { this.free.push(this.make()); this.built++; }
  }

  track(item) { this.live.push(item); return item; }

  release(item) {
    const i = this.live.indexOf(item);
    if (i < 0) return;
    this.live.splice(i, 1);
    this.reset(item);
    this.free.push(item);
  }

  clear() { while (this.live.length) this.release(this.live[0]); }
  get alive() { return this.live.length; }
}

// One shared InstancedMesh of camera-facing quads. Every smoke/spray/flash card in the game is a
// slot in here, so the whole particle system is one draw call.
export class CardField {
  constructor(cap, material) {
    this.cap = cap;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(this.geo, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.slots = [];
    this.active = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    for (let i = 0; i < cap; i++) this.slots.push({ i, live: false, pos: new THREE.Vector3(), scale: 1, rot: 0, colour: new THREE.Color(), alpha: 0 });
  }

  take() {
    for (const s of this.slots) if (!s.live) { s.live = true; this.active++; return s; }
    return null;
  }

  give(s) { if (s?.live) { s.live = false; s.alpha = 0; this.active--; } }

  // Billboards to the camera every frame. Writing count = cap and hiding dead slots with a zero
  // scale is cheaper than compacting, and keeps a slot's index stable for its owner.
  update(camera) {
    if (!this.active) { this.mesh.count = 0; return 0; }
    camera.getWorldQuaternion(this.q);
    let n = 0;
    for (const s of this.slots) {
      const live = s.live && s.alpha > 0.001;
      this.s.setScalar(live ? s.scale : 0);
      this.m.compose(s.pos, this.q, this.s);
      this.mesh.setMatrixAt(s.i, this.m);
      this.mesh.setColorAt(s.i, s.colour);
      if (live) n++;
    }
    this.mesh.count = n ? this.cap : 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return n;
  }

  clear() { for (const s of this.slots) this.give(s); }
}
