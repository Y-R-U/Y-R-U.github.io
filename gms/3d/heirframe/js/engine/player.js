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
  return { root: g, update() {}, play() {}, setMove() {}, setAim() {}, height: 1.9, radius: 0.4, placeholder: true };
}

// Moves an actor with joystick / keys / tap-target, colliding against the world.
export function createPlayerController(world, actor, { speed = 4.6 } = {}) {
  const p = {
    actor, pos: new THREE.Vector3(), yaw: 0, speed, moveTarget: null, radius: actor.radius || 0.45,
    velocity: new THREE.Vector3(), moving: false, stuck: 0,
    teleport(x, z, yaw = p.yaw) { p.pos.set(x, world.groundAt(x, z), z); p.yaw = yaw; p.sync(); },
    setTarget(v) { p.moveTarget = v ? new THREE.Vector3(v.x, 0, v.z) : null; p.stuck = 0; },
    sync() { actor.root.position.copy(p.pos); actor.root.rotation.y = p.yaw; },
    // stick: {x, y} with y = forward (up the screen)
    update(dt, stick) {
      let dx = 0, dz = 0, mag = 0;
      if (stick && Math.hypot(stick.x, stick.y) > 0.12) {
        mag = Math.min(1, Math.hypot(stick.x, stick.y));
        dx = stick.x / mag; dz = -stick.y / mag;
        p.moveTarget = null;
      } else if (p.moveTarget) {
        const tx = p.moveTarget.x - p.pos.x, tz = p.moveTarget.z - p.pos.z, d = Math.hypot(tx, tz);
        if (d < 0.25) p.moveTarget = null;
        else { dx = tx / d; dz = tz / d; mag = Math.min(1, d / 0.8); }
      }
      const v = p.speed * mag;
      p.moving = v > 0.05;
      if (p.moving) {
        const want = Math.atan2(dx, dz);
        let dy = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
        p.yaw += dy * (1 - Math.exp(-dt * 14));
        const before = p.pos.clone();
        world.collision.move(p.pos, dx * v * dt, dz * v * dt, p.radius);
        const moved = p.pos.distanceTo(before);
        p.velocity.subVectors(p.pos, before).divideScalar(Math.max(dt, 1e-4));
        if (p.moveTarget && moved < v * dt * 0.2) { if ((p.stuck += dt) > 0.6) p.moveTarget = null; } else p.stuck = 0;
        actor.setMove(Math.min(1, v / (actor.runSpeed || 4.5)), moved / Math.max(dt, 1e-4));
      } else {
        p.velocity.set(0, 0, 0);
        actor.setMove(0, 0);
      }
      const gy = world.groundAt(p.pos.x, p.pos.z);
      p.pos.y += (gy - p.pos.y) * (1 - Math.exp(-dt * 18));
      p.sync();
      actor.update(dt);
    },
  };
  return p;
}
