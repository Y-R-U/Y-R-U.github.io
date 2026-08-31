// Placing a speech bubble over the head of whoever is talking.
//
// It complements the bottom band rather than replacing it: a narrator has no body, and a speaker
// who is behind the camera or off the edge of a phone screen has nowhere to hang a bubble. Both
// dock back into the band dialoguebox.js already owned. `place()` is pure so the clamping — the
// part that goes wrong in landscape — is testable without a renderer.

import * as THREE from 'three';
import { place } from './place.js';

export { place };

const v = new THREE.Vector3();
const ray = new THREE.Raycaster();
const HEAD = 2.15;
const OCCLUDE_EVERY = 0.16;

export function screenOf(camera, canvas, p) {
  v.set(p.x, p.y, p.z).project(camera);
  const r = canvas.getBoundingClientRect();
  return {
    x: r.left + (v.x * 0.5 + 0.5) * r.width,
    y: r.top + (-v.y * 0.5 + 0.5) * r.height,
    behind: v.z > 1,
  };
}

export class Anchors {
  // `obstacles` are the Object3Ds a line of sight has to get through. Occlusion is sampled rather
  // than tested every frame: a raycast through a dressed hall is not free, and a bubble that
  // fades a sixth of a second late is not something anyone sees.
  constructor({ app, characters, obstacles = [] }) {
    this.app = app;
    this.characters = characters;
    this.obstacles = obstacles;
    this.age = 0;
    this.occluded = false;
  }

  worldOf(id) {
    const a = this.characters?.at?.(id);
    return a ? { x: a.x, y: (a.y || 0) + HEAD, z: a.z } : null;
  }

  screen(id) {
    const p = this.worldOf(id);
    if (!p) return null;
    return { ...screenOf(this.app.camera, this.app.renderer.domElement, p), world: p };
  }

  // True when something solid stands between the camera and the head. Cheap early-out: the tail
  // end of a conversation is three metres away and nothing can be in the way.
  sampleOcclusion(dt, world) {
    this.age += dt;
    if (this.age < OCCLUDE_EVERY) return this.occluded;
    this.age = 0;
    if (!world || !this.obstacles.length) return (this.occluded = false);
    const cam = this.app.camera.position;
    v.set(world.x - cam.x, world.y - cam.y, world.z - cam.z);
    const dist = v.length();
    if (dist < 4) return (this.occluded = false);
    ray.set(cam, v.normalize());
    ray.far = dist - 0.6;
    const hit = ray.intersectObjects(this.obstacles, true)[0];
    return (this.occluded = !!hit);
  }
}
