// Tapping a thing in the world rather than walking up to it.
//
// It does not need the boards to be tagged, and it does not need a hotspot to carry a height: the
// ray's first hit IS the point the player meant, so `Hotspots.press(hit, ['click'])` — which
// already takes an arbitrary point — answers with whichever click hotspot's circle contains it.
// First-hit also gives occlusion for free: a board behind a pillar cannot be tapped through it.
//
// Listens on #stage only, so it never sees a tap that landed on the HUD, a choice button or an
// open board screen. js/input.js is another agent's file and is left alone.

import * as THREE from 'three';

const TAP_MS = 450, TAP_PX = 18;

export class WorldTap {
  constructor({ app, stage, blocked = () => false, onPoint = () => {} }) {
    this.app = app;
    this.blocked = blocked;
    this.onPoint = onPoint;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    if (!stage?.addEventListener) return;

    let p = null;
    stage.addEventListener('pointerdown', e => {
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    });
    stage.addEventListener('pointermove', e => {
      if (p?.id !== e.pointerId) return;
      p.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    stage.addEventListener('pointerup', e => {
      const was = p;
      p = null;
      if (was?.id !== e.pointerId) return;
      if (performance.now() - was.t > TAP_MS || was.moved > TAP_PX) return;
      if (this.blocked()) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.onPoint(hit);
    });
    stage.addEventListener('pointercancel', () => { p = null; });
  }

  pick(clientX, clientY) {
    const canvas = this.app.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    this.ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.app.camera);
    const hit = this.ray.intersectObjects(this.app.scene.children, true)
      .find(h => h.object.visible && h.object.type !== 'Points');
    return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }
}
