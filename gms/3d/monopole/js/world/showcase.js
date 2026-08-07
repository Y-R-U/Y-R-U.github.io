// A single hull on a turntable, for the shipyard. Borrows the stage from whatever was on it and
// hands it back — the live company keeps running underneath.

import * as THREE from 'three';
import { shipClass } from './kit/ship.js';
import content from '../sim/content.js';

let group = null;
let spin = 0;

// `cam` is the camera facade, not app.camera. Writing app.camera.position directly loses the
// fight with the orbit rig, which re-places the camera from its own spherical state every frame —
// setFrom syncs that state instead, so the framing survives and the player can still turn the hull.
export function showcaseShip(app, world, cam, classId, { palette = 'ferrous' } = {}) {
  clearShowcase(world);
  const def = content.get('ship', classId);
  if (!def) return null;

  group = new THREE.Group();
  group.name = 'showcase';
  const hull = shipClass(def.mesh, { palette, lod: 0, seed: 3 });
  group.add(hull);

  world.setSubject(group);
  const len = def.hull?.len || 60;
  // 1.9 hull-lengths back reads as a broker's turntable rather than a fly-past. focus() is the
  // right entry point: setFrom's target and distance were being re-framed by whatever the rig was
  // already pointed at, and only the fov survived.
  const d = len * 1.9;
  cam.setTouchEnabled(true);
  cam.focus(group, { dist: d, phi: 1.15, theta: 0.85, ms: 0 });
  cam.markHome({ target: group.position.clone(), dist: d, phi: 1.15, theta: 0.85, fov: 40 });
  spin = 0;
  return group;
}

export function updateShowcase(dt) {
  if (!group) return;
  spin += dt * 0.22;
  group.rotation.y = spin;
}

export function clearShowcase(world) {
  if (!group) return;
  world.clear();
  group = null;
}

export const showcaseActive = () => !!group;

export default { showcaseShip, updateShowcase, clearShowcase, showcaseActive };
