// What is drawn this frame. Everything static in the world registers here and gets a distance
// cull; the scene's 60 m blocks additionally get a detail/proxy swap, and the foliage gets
// re-packed around the camera. Nothing is rebuilt — a level change is a `.visible` flip.
//
// The reason it exists: before A7 a district merged into five district-spanning meshes and the
// contact-AO decals into one map-spanning mesh, so every bounding sphere caught every frustum
// and 301 k of 301.8 k resident triangles were drawn wherever the camera looked (WORLD.md §6.5).

import * as THREE from 'three';

export class Stream {
  constructor(demo) {
    this.demo = demo;
    this.on = true;
    this.detail = 70;
    this.cullK = 1.45;
    this.groundK = 1.6;
    this.foliageK = 1.15;
    this.step = 20;
    this.at = new THREE.Vector3(NaN, 0, NaN);
    this.counts = { blocks: 0, detail: 0, proxy: 0, culled: 0 };
  }

  // After a world rebuild: the meshes are new, so neither the frustum flags nor the foliage focus
  // can be assumed to match what was last applied.
  reset() { this.wasOn = null; this.at.set(NaN, 0, NaN); }

  update(dt, app) {
    const T = this.demo.terrain;
    const eye = app.camera.position;
    const view = app.quality.get('viewDist') || 180;

    // Off is not just "cull nothing": it also turns three's own frustum test off, so it
    // reproduces what the world cost before A7, when every batch spanned a district or the whole
    // map and no bounding sphere ever missed. That makes it a usable A/B rather than a debug flag.
    if (!this.on) {
      if (this.wasOn !== false) {
        this.wasOn = false;
        this.demo.object3D.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      }
      for (const m of all(T)) m.visible = true;
      for (const b of this.demo.builder.blocks) { b.detail.visible = true; b.proxy.visible = false; }
      if (this.demo.scatter.focusAt) { this.demo.scatter.focusAt = null; this.demo.scatter.repack(); }
      return;
    }
    if (this.wasOn === false) {
      this.wasOn = true;
      this.demo.object3D.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    }

    const near = (s, r) => eye.distanceTo(s.center) < r + s.radius;
    for (const m of T.chunks || []) m.visible = near(m.geometry.boundingSphere, view * this.groundK);
    for (const m of T.roadSegs || []) m.visible = near(m.geometry.boundingSphere, view * this.cullK);
    for (const m of T.decalChunks || []) m.visible = near(m.geometry.boundingSphere, view * this.cullK);

    const cull = view * this.cullK;
    const c = this.counts;
    c.blocks = c.detail = c.proxy = c.culled = 0;
    for (const b of this.demo.builder.blocks) {
      c.blocks++;
      const d = eye.distanceTo(b.c) - b.r;
      const live = d < cull;
      const fine = d < this.detail;
      b.detail.visible = live && fine;
      b.proxy.visible = live && !fine;
      if (!live) c.culled++; else if (fine) c.detail++; else c.proxy++;
    }

    // Foliage is repacked on a movement threshold, not per frame: it is a pass over every source
    // instance. A shot camera never moves, so a `?shot=` render packs once and stays put.
    const r = view * this.foliageK;
    if (r !== this.lastR || this.at.distanceToSquared(eye) > this.step * this.step) {
      this.lastR = r;
      this.at.copy(eye);
      this.demo.scatter.focus(eye.x, eye.z, r);
    }
  }

  registerKnobs(q) {
    q.register({ key: 'streaming', label: 'LOD + culling', type: 'toggle', default: true, group: 'World' },
      v => { this.on = !!v; });
    q.register({ key: 'lodDetail', label: 'Detail radius (m)', type: 'range', min: 25, max: 200, step: 5, default: 70, group: 'World' },
      v => { this.detail = v; });
    q.register({ key: 'lodCull', label: 'World cull × view distance', type: 'range', min: 0.6, max: 3, step: 0.05, default: 1.45, group: 'World' },
      v => { this.cullK = v; });
    q.register({ key: 'groundCull', label: 'Ground cull × view distance', type: 'range', min: 0.8, max: 4, step: 0.1, default: 1.6, group: 'World' },
      v => { this.groundK = v; });
    q.register({ key: 'foliageCull', label: 'Foliage radius × view distance', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1.15, group: 'World' },
      v => { this.foliageK = v; });
    q.register({ key: 'foliageStep', label: 'Foliage repack step (m)', type: 'range', min: 5, max: 80, step: 1, default: 20, group: 'World' },
      v => { this.step = v; });
  }
}

const all = T => [...(T.chunks || []), ...(T.roadSegs || []), ...(T.decalChunks || [])];
