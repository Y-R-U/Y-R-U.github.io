import * as THREE from 'three';
import { REFLECT_LAYER } from '../fx/reflection.js';

export function enableReflect(obj) { obj.traverse((o) => { if (o.isMesh) { o.layers.enable(REFLECT_LAYER); o.castShadow = true; } }); }

// Stand-in until js/actors/robots.js provides a real frame.
export function placeholderBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.0, 6, 16), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }));
  body.position.y = 0.95; g.add(body);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff8a2a, emissiveIntensity: 3 }));
  visor.position.set(0, 1.55, 0.3); g.add(visor);
  enableReflect(g);
  return { root: g, update() {}, play() {}, setMove() {}, setAim() {}, hitFlash() {}, setAlert() {}, height: 1.9, radius: 0.4, placeholder: true, sockets: {} };
}

// Moves an actor with joystick / keys / tap-target, colliding against the world.
// Extras for the runtime: faceYaw (attack facing), dodge roll, speedMult, frozen, footstep callback.
export function createPlayerController(world, actor, { speed = 4.6 } = {}) {
  const tmpBefore = new THREE.Vector3();
  const p = {
    actor, pos: new THREE.Vector3(), yaw: 0, speed, moveTarget: null, stopAt: 0.25, radius: actor.radius || 0.45,
    velocity: new THREE.Vector3(), moving: false, stuck: 0, frozen: false, speedMult: 1, stickActive: false,
    face: null, faceT: 0, dodging: null, stride: 0, onStep: null, onArrive: null,
    teleport(x, z, yaw = p.yaw) { p.pos.set(x, world.groundAt(x, z), z); p.yaw = yaw; p.moveTarget = null; p.sync(); },
    path: null,
    setTarget(v, { stopAt = 0.25 } = {}) { p.moveTarget = v ? new THREE.Vector3(v.x, 0, v.z) : null; p.stopAt = stopAt; p.stuck = 0; p.path = null; },
    // follow waypoints [{x,z}...]; stopAt applies to the last one
    setPath(pts, { stopAt = 0.25 } = {}) {
      if (!pts || !pts.length) { p.setTarget(null); return; }
      p.setTarget(pts[0], { stopAt }); p.path = pts.slice(1);
    },
    faceYaw(yaw, t = 0.3) { p.face = yaw; p.faceT = t; },
    dodge(dx, dz, dist = 3.2, dur = 0.45) {
      const l = Math.hypot(dx, dz) || 1;
      p.dodging = { dx: dx / l, dz: dz / l, v: dist / dur, t: dur };
      p.yaw = Math.atan2(dx, dz);
      p.moveTarget = null; p.path = null;
    },
    sync() { actor.root.position.copy(p.pos); actor.root.rotation.y = p.yaw; },
    // stick: {x, y} with y = forward (up the screen)
    update(dt, stick) {
      let dx = 0, dz = 0, mag = 0;
      p.stickActive = !!stick && Math.hypot(stick.x, stick.y) > 0.12;
      const turnK = 1 - Math.exp(-dt * 16);
      if (p.dodging) {
        const d = p.dodging;
        tmpBefore.copy(p.pos);
        world.collision.move(p.pos, d.dx * d.v * dt, d.dz * d.v * dt, p.radius);
        const moved = p.pos.distanceTo(tmpBefore);
        actor.setMove(0.6, moved / Math.max(dt, 1e-4) * 0.3);
        if ((d.t -= dt) <= 0) p.dodging = null;
        p.moving = true;
      } else if (p.frozen) {
        p.moving = false; p.velocity.set(0, 0, 0); actor.setMove(0, 0);
      } else {
        if (p.stickActive) {
          mag = Math.min(1, Math.hypot(stick.x, stick.y));
          dx = stick.x / Math.hypot(stick.x, stick.y); dz = -stick.y / Math.hypot(stick.x, stick.y);
          mag = mag < 0.5 ? 0.45 : mag;   // half-press = walk
          p.moveTarget = null;
        } else if (p.moveTarget) {
          const tx = p.moveTarget.x - p.pos.x, tz = p.moveTarget.z - p.pos.z, d = Math.hypot(tx, tz);
          const last = !p.path?.length;
          if (d < (last ? p.stopAt : 0.7)) {
            if (last) { p.moveTarget = null; p.onArrive && p.onArrive(); }
            else { const n = p.path.shift(); p.moveTarget.set(n.x, 0, n.z); p.stuck = 0; }
          } else { dx = tx / d; dz = tz / d; mag = last ? Math.min(1, d / 0.6) : 1; }
        }
        const v = p.speed * p.speedMult * mag;
        p.moving = v > 0.05;
        if (p.moving) {
          const want = Math.atan2(dx, dz);
          if (p.faceT <= 0) p.yaw += Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)) * turnK;
          tmpBefore.copy(p.pos);
          world.collision.move(p.pos, dx * v * dt, dz * v * dt, p.radius);
          const moved = p.pos.distanceTo(tmpBefore);
          p.velocity.subVectors(p.pos, tmpBefore).divideScalar(Math.max(dt, 1e-4));
          if (p.moveTarget && moved < v * dt * 0.2) { if ((p.stuck += dt) > 0.6) { p.moveTarget = null; p.path = null; } } else p.stuck = 0;
          actor.setMove(Math.min(1, v / (actor.runSpeed || 4.5)), moved / Math.max(dt, 1e-4));
          p.stride += moved;
          const strideLen = v > 3 ? 1.35 : 0.95;
          if (p.stride > strideLen) { p.stride -= strideLen; p.onStep && p.onStep(v); }
        } else {
          p.velocity.set(0, 0, 0);
          actor.setMove(0, 0);
        }
      }
      if (p.faceT > 0) {
        p.faceT -= dt;
        p.yaw += Math.atan2(Math.sin(p.face - p.yaw), Math.cos(p.face - p.yaw)) * (1 - Math.exp(-dt * 26));
      }
      const gy = world.groundAt(p.pos.x, p.pos.z);
      p.pos.y += (gy - p.pos.y) * (1 - Math.exp(-dt * 18));
      p.sync();
      actor.update(dt);
    },
  };
  return p;
}
