import * as THREE from '../../vendor/three/three.module.js';

// Jon's thrown newspaper: ballistic arc at Garfield's predicted position, knockback on hit, lies on the floor after.
let factory = null;
import('../world/props/newspaper.js').then((m) => { factory = m.createNewspaper || m.default || null; }).catch(() => {});

let fallbackGeo = null, fallbackMat = null;
function fallbackMesh() {
  if (!fallbackGeo) {
    fallbackGeo = new THREE.BoxGeometry(0.3, 0.035, 0.22);
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#efe9da'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#3a3a3a'; g.fillRect(8, 8, 112, 14);
    g.fillStyle = '#8a8a8a';
    for (let y = 30; y < 90; y += 7) { g.fillRect(8, y, 52, 3); g.fillRect(68, y, 52, 3); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    fallbackMat = [new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.9 }), null, null, null, null, null];
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    fallbackMat = [fallbackMat[0], fallbackMat[0], top, fallbackMat[0], fallbackMat[0], fallbackMat[0]];
  }
  const m = new THREE.Mesh(fallbackGeo, fallbackMat);
  m.castShadow = true;
  return m;
}

export function createNewspaper(ctx, given = null) {
  let mesh = given;
  if (!mesh) { try { mesh = factory ? factory() : null; } catch { mesh = null; } }
  if (mesh && mesh.root) mesh = mesh.root;
  if (!mesh) mesh = fallbackMesh();
  const vel = new THREE.Vector3(), spin = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const p = {
    mesh, pos: new THREE.Vector3(), flying: false, landed: false, hit: false, cb: null, t: 0,
    launch(from, controller, cb) {
      if (mesh.parent) ctx.world.scene.attach(mesh); else ctx.world.scene.add(mesh);
      mesh.position.copy(from);
      p.flying = true; p.cb = cb; p.t = 0;
      const T = 0.7;
      const target = controller.pos.clone();
      if (controller.vel) target.addScaledVector(new THREE.Vector3(controller.vel.x, 0, controller.vel.z), T * 0.6);
      target.y += 0.25;
      vel.subVectors(target, from).divideScalar(T);
      vel.y += 0.5 * 9.8 * T;
      spin.set(Math.random() * 4 - 2, 9 + Math.random() * 4, Math.random() * 2 - 1);
      ctx.audio?.sfx?.('swipe', { rate: 0.7 });
    },
    update(dt) {
      if (!p.flying) return;
      p.t += dt;
      vel.y -= 9.8 * dt;
      mesh.position.addScaledVector(vel, dt);
      mesh.rotation.x += spin.x * dt; mesh.rotation.y += spin.y * dt; mesh.rotation.z += spin.z * dt;
      const c = ctx.controller;
      if (!p.hit && c?.pos) {
        tmp.copy(c.pos); tmp.y += 0.25;
        if (tmp.distanceTo(mesh.position) < 0.5) {
          p.hit = true;
          const dir = new THREE.Vector3(vel.x, 0, vel.z).normalize();
          try { c.knockback?.(dir, 3.6); } catch (e) { console.warn(e); }
          ctx.audio?.sfx?.('hit');
          vel.multiplyScalar(-0.25); vel.y = 1.5;
          p.cb?.(true); p.cb = null;
        }
      }
      let gy = 0;
      try { gy = ctx.world.groundAt ? ctx.world.groundAt(mesh.position.x, mesh.position.z, mesh.position.y + 0.05) : 0; } catch { gy = 0; }
      if (!Number.isFinite(gy)) gy = 0;
      if (mesh.position.y <= gy + 0.02 && vel.y < 0) {
        mesh.position.y = gy + 0.02;
        mesh.rotation.set(0, mesh.rotation.y, 0);
        p.flying = false; p.landed = true;
        // Jon can only pick it up from the floor: snap the pickup point to floor level
        p.pos.copy(mesh.position); p.pos.y = gy > 2 ? gy : 0;
        ctx.audio?.sfx?.('pop', { vol: 0.4 });
        if (!p.hit) { p.cb?.(false); p.cb = null; }
      }
      if (p.t > 4 && p.flying) { p.flying = false; p.landed = true; p.pos.copy(mesh.position); p.pos.y = 0; }
    },
    dispose() { mesh.parent?.remove(mesh); p.flying = false; },
  };
  return p;
}
