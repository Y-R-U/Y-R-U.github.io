import * as THREE from 'three';

// Pooled additive VFX: tracers, bolts, spark bursts, shock rings, impact stars, baton slashes, hologram ads.
// Meshes and their materials are recycled, so a fight allocates nothing per hit. All toneMapped:false so bloom picks them up.
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
    star: starGeometry(),
    slash: new THREE.RingGeometry(0.75, 1, 24, 1, -1.1, 2.2).rotateX(-Math.PI / 2),
    holo: new THREE.CapsuleGeometry(0.33, 1.15, 4, 10).translate(0, 0.95, 0),
  };
  const pools = {};
  const recs = [];

  function take(kind) {
    const p = pools[kind] || (pools[kind] = []);
    let m = p.pop();
    if (!m) {
      m = new THREE.Mesh(geo[kind === 'boltTrail' ? 'tracer' : kind], add(0xffffff));
      m.frustumCulled = kind !== 'tracer';
      if (kind === 'bolt') { const tr = new THREE.Mesh(geo.tracer, add(0xffffff, 0.6)); tr.scale.set(1.6, 1.6, 1.2); tr.rotation.y = Math.PI; m.add(tr); m.userData.trail = tr; }
      m.userData.kind = kind;
    }
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    m.material.opacity = 1;
    scene.add(m);
    return m;
  }

  function spawn(kind, life, color) {
    const m = take(kind);
    m.material.color.setHex(color);
    if (m.userData.trail) m.userData.trail.material.color.setHex(color);
    const o = recs.pop() || { v: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
    o.mesh = m; o.kind = kind; o.life = life; o.t = 0; o.p0 = 0; o.p1 = 0; o.cb = null; o.arrived = false;
    live.push(o);
    return o;
  }
  function kill(o) {
    scene.remove(o.mesh);
    if (o.kind === 'advert') { o.mesh.material.dispose(); } else pools[o.kind].push(o.mesh);
    o.mesh = null; o.cb = null;
    recs.push(o);
  }

  let adTex = null;
  const fx = {
    tracer(from, to, color = 0x9fe8ff, life = 0.14, width = 1) {
      const o = spawn('tracer', life, color);
      o.mesh.position.copy(from); o.mesh.lookAt(to);
      o.mesh.scale.set(width, width, from.distanceTo(to));
      o.p0 = width;
    },
    // travelling bolt; onArrive(pos) when it reaches `to`
    bolt(from, to, { color = 0xffa040, speed = 24, size = 1, onArrive } = {}) {
      const o = spawn('bolt', Math.max(0.05, from.distanceTo(to) / speed), color);
      o.a.copy(from); o.b.copy(to); o.cb = onArrive || null;
      o.mesh.scale.setScalar(size); o.mesh.position.copy(from); o.mesh.lookAt(to);
      return o.mesh;
    },
    sparks(pos, color = 0xffe0a0, n = 10, speed = 5) {
      for (let i = 0; i < n; i++) {
        const o = spawn('spark', 0.25 + Math.random() * 0.25, color);
        o.mesh.position.copy(pos);
        o.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      }
    },
    ring(pos, radius = 3, color = 0x80e0ff, life = 0.45) {
      const o = spawn('ring', life, color);
      o.mesh.position.copy(pos); o.mesh.position.y += 0.06;
      o.p0 = radius;
    },
    flash(pos, radius = 0.8, color = 0xffffff, life = 0.12) {
      const o = spawn('bolt', life, color);
      o.kind = 'bolt'; o.cb = null; o.p0 = radius; o.flash = true;
      o.mesh.userData.trail.visible = false;
      o.mesh.position.copy(pos);
    },
    // camera-facing 4-point star at a hit point
    impact(pos, color = 0xffffff, size = 1, life = 0.16) {
      const o = spawn('star', life, color);
      o.mesh.position.copy(pos); o.p0 = size; o.p1 = Math.random() * Math.PI;
    },
    // flat arc swoosh in front of the attacker (yaw 0 = +Z)
    slash(pos, yaw, color = 0xffe6b0, radius = 1.6, life = 0.16) {
      const o = spawn('slash', life, color);
      o.mesh.position.copy(pos);
      o.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      o.p0 = radius;
    },
    // loot pickup: a ring and a short sparkle column
    pop(pos, color = 0xffd27a) {
      fx.ring(pos, 1.6, color, 0.35);
      for (let i = 0; i < 6; i++) {
        const o = spawn('spark', 0.35 + Math.random() * 0.2, color);
        o.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 0.4, pos.z + (Math.random() - 0.5) * 0.5);
        o.v.set((Math.random() - 0.5) * 1.2, 4 + Math.random() * 2, (Math.random() - 0.5) * 1.2);
        o.p1 = 1;
      }
    },
    // vertical light column (frame beam-in, cloak, turret deploy)
    beam(pos, color = 0x9fe8ff, life = 0.5, height = 3, width = 1) {
      const o = spawn('beam', life, color);
      o.mesh.position.copy(pos); o.p0 = height; o.p1 = width;
      o.mesh.scale.set(width, height, width);
      return o;
    },
    // flickering see-through body (Blink decoy)
    hologram(pos, color = 0x7ff6ff, life = 2) {
      const o = spawn('holo', life, color);
      o.mesh.position.copy(pos);
      return o;
    },
    // floating holo "ad" for Sponsored Content
    advert(pos, life = 2.5) {
      if (!adTex) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(20,40,70,0.6)'; g.fillRect(0, 0, 256, 128);
        g.strokeStyle = '#8fe8ff'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 120);
        g.fillStyle = '#ffe9b0'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
        g.fillText('HIREFRAME', 128, 56); g.font = 'bold 20px sans-serif'; g.fillStyle = '#8fe8ff'; g.fillText('RENT BY THE HOUR!', 128, 92);
        adTex = new THREE.CanvasTexture(c); adTex.colorSpace = THREE.SRGBColorSpace;
      }
      const m = new THREE.Mesh(geo.plane, new THREE.MeshBasicMaterial({ map: adTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.copy(pos); m.position.y += 2.6; m.scale.set(2.4, 1.2, 1);
      scene.add(m);
      const o = recs.pop() || { v: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
      o.mesh = m; o.kind = 'advert'; o.life = life; o.t = 0; o.cb = null;
      live.push(o);
    },
    update(dt, camera) {
      for (let i = live.length - 1; i >= 0; i--) {
        const o = live[i], m = o.mesh;
        o.t += dt;
        const u = Math.min(1, o.t / o.life);
        switch (o.kind) {
          case 'tracer': m.material.opacity = 1 - u; m.scale.x = m.scale.y = o.p0 * (1 - u * 0.6); break;
          case 'bolt':
            if (o.flash) { m.scale.setScalar((0.5 + u) * o.p0 / 0.13); m.material.opacity = 1 - u; break; }
            m.position.lerpVectors(o.a, o.b, u);
            if (u >= 1 && !o.arrived) { o.arrived = true; o.cb && o.cb(o.b); }
            break;
          case 'spark':
            o.v.y -= (o.p1 ? 6 : 14) * dt; m.position.addScaledVector(o.v, dt);
            m.scale.setScalar(1 - u); m.material.opacity = 1 - u; break;
          case 'ring': m.scale.setScalar(0.2 + u * o.p0); m.material.opacity = (1 - u) * 0.9; break;
          case 'star':
            if (camera) m.quaternion.copy(camera.quaternion);
            m.rotateZ(o.p1);
            m.scale.setScalar(o.p0 * (0.6 + u * 0.9)); m.material.opacity = 1 - u * u; break;
          case 'slash': m.scale.setScalar(o.p0 * (0.75 + u * 0.35)); m.material.opacity = (1 - u) * 0.85; break;
          case 'beam': m.scale.set(o.p1 * (1 - u * 0.7), o.p0 * (0.6 + u * 0.4), o.p1 * (1 - u * 0.7)); m.material.opacity = (1 - u) * 0.9; break;
          case 'holo': m.material.opacity = (u > 0.85 ? (1 - u) / 0.15 : 1) * (0.28 + 0.12 * Math.sin(o.t * 40) + (Math.random() < 0.05 ? -0.2 : 0)); break;
          case 'advert': if (camera) m.quaternion.copy(camera.quaternion); m.material.opacity = Math.min(1, (1 - u) * 4) * (0.8 + 0.2 * Math.sin(o.t * 30)); break;
        }
        if (o.t >= o.life) {
          if (o.flash) { o.flash = false; m.userData.trail.visible = true; }
          live.splice(i, 1); kill(o);
        }
      }
    },
    geo, add, count: () => live.length,
  };
  return fx;
}

function starGeometry() {
  // 4 long + 4 short spikes, flat in XY (billboarded)
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 4 === 0 ? 0.55 : i % 2 === 0 ? 0.26 : 0.09; pts.push(Math.sin(a) * r, Math.cos(a) * r); }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export const RARITY_COLOR = { scrap: 0x9a8f80, standard: 0xe8eef5, tuned: 0x5fe07a, custom: 0x4aa8ff, prototype: 0xc070ff, relic: 0xffb020, heirloom: 0xfff0a0 };
