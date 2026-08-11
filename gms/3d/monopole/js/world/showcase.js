// A single hull on a turntable, for the shipyard. Borrows the stage from whatever was on it and
// hands it back — the live company keeps running underneath.

import * as THREE from 'three';
import { shipClass } from './kit/ship.js';
import { reachLighting } from './scene.js';
import content from '../sim/content.js';

// This is the hero_hull rig, which is the one round of lighting the ship kit actually won on: a
// hard key well off the star bearing, an additive fill that puts plating back into the dark half,
// and a rim placed at the hull rather than out where the station is. The Reach's own rig is tuned
// for hulls half a kilometre away and renders one at arm's length as a flat orange plank.
export function showcaseLighting(app) {
  const q = app.quality;
  reachLighting(q);
  q.set('starAz', -24);
  q.set('starEl', 10);
  q.set('keySwing', 0);
  q.set('keyLift', 28);
  q.set('keyPower', 30);
  q.set('fillPower', 3.4);
  q.set('shadowFill', 0.13);
  q.set('fillAngle', 168);
  q.set('fillLift', -24);
  q.set('ambient', 0.004);
  q.set('envPower', 0.16);
  q.set('envFloor', 0.06);
  q.set('rimDist', 110);
  q.set('rimNear', 40);
  q.set('rimFall', 70);
  q.set('rimPower', 3.0);
  q.set('rimWidth', 3.0);
  q.set('bouncePower', 0.10);
  q.set('hullRough', 0.30);
  q.set('hullDetail', 0.34);
  q.set('hullPanel', 0.68);
  q.set('engineWash', 0.2);
  q.set('fogDensity', 0.0006);
  q.set('fogTint', 0.6);
  q.set('nebGain', 1.05);
  q.set('nebCore', 0.55);
  q.set('bloomThreshold', 0.86);
  q.set('bloomKnee', 0.16);
  q.set('bloomStrength', 0.44);
  q.set('bloomPower', 0.34);
}

let group = null;
let spin = 0;
let box = null;
let hullLen = 60;
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();

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
  // A hull on the yard's stand is parked. The kit builds it under thrust, and a plume the length
  // of the ship is the brightest thing in the frame and the first thing a buyer looks at.
  hull.traverse(n => { if (n.name === 'plume' || n.name === 'engineGlow') n.visible = false; });
  group.add(hull);

  world.setSubject(group);
  box = new THREE.Box3().setFromObject(group);
  hullLen = def.hull?.len || 60;
  frameShowcase(cam);
  // start it broadside: the kit lofts every hull down its own Z, so a quarter turn off the
  // camera's bearing is the angle that shows the whole silhouette on the first frame
  spin = TH + Math.PI / 2;
  group.rotation.y = spin;
  return group;
}

const TH = 0.85, PH = 1.16;

// Re-taken rather than interpolated whenever the frame it has to fit into changes, because a
// phone turned on its side changes both the fov and the distance and there is nothing sensible in
// between the two framings.
export function frameShowcase(cam) {
  if (!group || !box) return;
  cam.setTouchEnabled(true);
  // The turntable is opened from inside the quarters, which leashes the orbit to ten degrees
  // either side of the desk. Turning a hull is the one thing in the game that wants a full
  // rotation, so the leash comes off here and goes back on when the room does.
  cam.setLimit(null);
  // The hull is broadside for half of every turn, so the distance has to come from the width of
  // the frame, not from the hull length alone — a fov chosen for landscape leaves a phone held
  // upright showing the middle third of a Kite and nothing else. Sideways the chrome takes the
  // right of the frame, so only the rest of the width counts.
  const wide = innerWidth > innerHeight;
  const fov = wide ? 34 : 46;
  const halfW = Math.tan(fov * Math.PI / 360) * (innerWidth / innerHeight) * (wide ? 0.48 : 1);
  // A turntable turns about the group's origin, not about the middle of the hull, so the framing
  // has to be the radius that sweep needs — aiming at the bounding box centre swings the nose off
  // the edge every time the ship comes round broadside.
  const r = Math.max(
    Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z),
    Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z), hullLen * 0.5);
  const d = r / (0.94 * Math.max(0.05, halfW));
  const cy = box.getCenter(_c).y;
  const look = new THREE.Vector3(0, cy - d * (wide ? 0.06 : 0.16), 0);
  const sp = Math.sin(PH) * d;
  cam.moveTo({
    pos: [look.x + sp * Math.sin(TH), look.y + Math.cos(PH) * d, look.z + sp * Math.cos(TH)],
    look: [look.x, look.y, look.z], fov, ms: 0,
  });
  cam.markHome({ target: look.clone(), dist: d, phi: PH, theta: TH, fov });
}

export function updateShowcase(dt) {
  if (!group) return;
  spin += dt * 0.22;
  group.rotation.y = spin;
}

export function turnShowcase(rad) { if (group) { spin += rad; group.rotation.y = spin; } }

// Where a label's leader line starts, in screen pixels. `along` runs 0 at the drive bells to 1 at
// the nose — the kit lofts every class down −Z — and `up`/`side` are fractions of the half extent,
// so ±1 lands on the skin. `front` is false once the spin has carried the point round the back,
// which is the cue for the label to fade rather than draw a line through the hull.
export function showcasePoint(cam, at, w = innerWidth, h = innerHeight) {
  if (!group || !box) return null;
  box.getCenter(_c);
  box.getSize(_s);
  _p.set(_c.x + (at.side || 0) * _s.x * 0.5, _c.y + (at.up || 0) * _s.y * 0.5,
    box.max.z + (box.min.z - box.max.z) * (at.along ?? 0.5));
  group.updateMatrixWorld();
  _p.applyMatrix4(group.matrixWorld);
  const front = _d.subVectors(_p, cam.position).dot(cam.getWorldDirection(_w)) > 0;
  _p.project(cam);
  return { x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h, front: front && _p.z < 1 };
}

// setSubject rather than world.clear(): clear() drops the hull out of the graph without disposing
// it, so every swipe on the rail leaked a merged hull geometry.
export function clearShowcase(world) {
  if (!group) return;
  world.setSubject(null);
  group = null;
  box = null;
}

export const showcaseActive = () => !!group;

export default { showcaseShip, frameShowcase, updateShowcase, clearShowcase, showcaseActive, showcasePoint, turnShowcase };
