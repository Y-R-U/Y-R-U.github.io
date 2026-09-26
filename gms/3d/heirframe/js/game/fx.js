import * as THREE from 'three';

// Pooled additive VFX: tracers, bolts, spark bursts, shock rings, hologram ads. All toneMapped:false so bloom picks them up.
const add = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

export function createFx(scene) {
  const live = [];
  const geo = {
    tracer: new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    bolt: new THREE.SphereGeometry(0.13, 10, 8),
    spark: new THREE.OctahedronGeometry(0.07, 0),
    ring: new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
    disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
    beam: new THREE.CylinderGeometry(0.12, 0.3, 1, 12, 1, true).translate(0, 0.5, 0),
    gem: new THREE.OctahedronGeometry(0.22, 0),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  const tmp = new THREE.Vector3();

  function spawn(mesh, life, update) {
    scene.add(mesh);
    const o = { mesh, life, t: 0, update };
    live.push(o);
    return o;
  }
  function kill(o) {
    scene.remove(o.mesh);
    o.mesh.traverse((m) => { if (m.material && !m.material.shared) m.material.dispose(); });
    o.dead = true;
  }

  const fx = {
    tracer(from, to, color = 0x9fe8ff, life = 0.14, width = 1) {
      const m = new THREE.Mesh(geo.tracer, add(color));
      m.position.copy(from); m.lookAt(to);
      m.scale.set(width, width, from.distanceTo(to));
      spawn(m, life, (o, u) => { m.material.opacity = 1 - u; m.scale.x = m.scale.y = width * (1 - u * 0.6); });
    },
    // travelling bolt; onArrive(pos) when it reaches `to`
    bolt(from, to, { color = 0xffa040, speed = 24, size = 1, onArrive } = {}) {
      const m = new THREE.Mesh(geo.bolt, add(color));
      m.scale.setScalar(size);
      const trail = new THREE.Mesh(geo.tracer, add(color, 0.6));
      m.add(trail); trail.scale.set(1.6, 1.6, 1.2); trail.rotation.y = Math.PI;
      m.position.copy(from); m.lookAt(to);
      const dist = from.distanceTo(to), life = Math.max(0.05, dist / speed);
      const a = from.clone(), b = to.clone();
      spawn(m, life, (o, u) => { m.position.lerpVectors(a, b, u); if (u >= 1 && !o.arrived) { o.arrived = true; onArrive && onArrive(b); } });
      return m;
    },
    sparks(pos, color = 0xffe0a0, n = 10, speed = 5) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo.spark, add(color));
        m.position.copy(pos);
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        spawn(m, 0.25 + Math.random() * 0.25, (o, u, dt) => { v.y -= 14 * dt; m.position.addScaledVector(v, dt); m.scale.setScalar(1 - u); m.material.opacity = 1 - u; });
      }
    },
    ring(pos, radius = 3, color = 0x80e0ff, life = 0.45) {
      const m = new THREE.Mesh(geo.ring, add(color));
      m.position.copy(pos); m.position.y += 0.06;
      spawn(m, life, (o, u) => { m.scale.setScalar(0.2 + u * radius); m.material.opacity = (1 - u) * 0.9; });
    },
    flash(pos, radius = 0.8, color = 0xffffff, life = 0.12) {
      const m = new THREE.Mesh(geo.bolt, add(color));
      m.position.copy(pos);
      spawn(m, life, (o, u) => { m.scale.setScalar((0.5 + u) * radius / 0.13); m.material.opacity = 1 - u; });
    },
    // floating holo "ad" for Sponsored Content
    advert(pos, life = 2.5) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(20,40,70,0.6)'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = '#8fe8ff'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 120);
      g.fillStyle = '#ffe9b0'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
      g.fillText('HIREFRAME', 128, 56); g.font = 'bold 20px sans-serif'; g.fillStyle = '#8fe8ff'; g.fillText('RENT BY THE HOUR!', 128, 92);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(geo.plane, mat);
      m.position.copy(pos); m.position.y += 2.6; m.scale.set(2.4, 1.2, 1);
      spawn(m, life, (o, u, dt, cam) => { if (cam) m.quaternion.copy(cam.quaternion); m.material.opacity = Math.min(1, (1 - u) * 4) * (0.8 + 0.2 * Math.sin(o.t * 30)); });
      o_tex.push(tex);
    },
    update(dt, camera) {
      for (let i = live.length - 1; i >= 0; i--) {
        const o = live[i];
        o.t += dt;
        const u = Math.min(1, o.t / o.life);
        o.update && o.update(o, u, dt, camera);
        if (o.t >= o.life) { kill(o); live.splice(i, 1); }
      }
      while (o_tex.length > 8) o_tex.shift().dispose();
    },
    geo, add, count: () => live.length,
  };
  const o_tex = [];
  return fx;
}

export const RARITY_COLOR = { scrap: 0x9a8f80, standard: 0xe8eef5, tuned: 0x5fe07a, custom: 0x4aa8ff, prototype: 0xc070ff, relic: 0xffb020, heirloom: 0xfff0a0 };
