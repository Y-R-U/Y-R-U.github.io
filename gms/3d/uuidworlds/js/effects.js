// effects.js — genome chars 18 (hero) & 19 (ambient) made visible.
// Everything is Points, a few meshes, or one small shader. No post-processing.

import * as THREE from 'three';
import { softSprite, glyphSprite, toTexture } from './canvastex.js';

function points(scene, N, fill, opts = {}) {
  const pos = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) fill(i, pos);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: opts.color ?? 0xffffff, size: opts.size ?? 1.4,
    transparent: true, opacity: opts.opacity ?? 0.8, depthWrite: false,
    map: opts.map, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    sizeAttenuation: true,
  });
  if (opts.vertexColors) { m.vertexColors = true; }
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return p;
}

const AURORA_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const AURORA_FRAG = `
uniform float uTime; uniform vec3 uColA, uColB;
varying vec2 vUv;
void main(){
  float x = vUv.x * 14.0;
  float band = sin(x + uTime * 0.5) * 0.5 + sin(x * 2.3 - uTime * 0.31) * 0.3 + sin(x * 0.7 + uTime * 0.17) * 0.4;
  float a = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  a *= 0.5 + band * 0.35;
  vec3 col = mix(uColA, uColB, vUv.y + band * 0.3);
  gl_FragColor = vec4(col, a * 0.5);
}`;

// ── hero effects ─────────────────────────────────────────────────────────────
const HERO = {
  none: () => ({ update() {} }),

  aurora(scene, world, rand, v) {
    const hues = [[0.38, 0.30], [0.93, 0.80], [0.5, 0.55], [0.75, 0.63], [0.12, 0.07]][v] ?? [0.38, 0.3];
    const colA = new THREE.Color().setHSL(hues[0], 0.9, 0.55);
    const colB = new THREE.Color().setHSL(hues[1], 0.9, 0.65);
    const ribbons = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: rand.float() * 40 }, uColA: { value: colA }, uColB: { value: colB } },
        vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
      });
      const geo = new THREE.PlaneGeometry(900, 90 + i * 40, 48, 1);
      const p = geo.attributes.position; // gentle S-curve across the sky
      for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 0.004 + i * 2) * 90);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rand.range(-100, 100), 250 + i * 45, rand.range(-150, 150));
      mesh.rotation.x = -0.15;
      mesh.rotation.y = rand.float() * Math.PI;
      scene.add(mesh);
      ribbons.push(mat);
    }
    return { update(t) { for (const m of ribbons) m.uniforms.uTime.value = t; } };
  },

  rings(scene, world, rand, v) {
    const group = new THREE.Group();
    const n = v === 1 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(330 + i * 60, 2.4, 6, 80),
        new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0.5, fog: false }),
      );
      ring.rotation.x = Math.PI / 2 - 0.35 - i * 0.2;
      group.add(ring);
    }
    const debris = v >= 2 ? 46 : 18;
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xbcd0ee, transparent: true, opacity: 0.8, fog: false }), debris);
    const angles = [];
    for (let i = 0; i < debris; i++) angles.push([rand.float() * Math.PI * 2, rand.range(0.7, 1.6)]);
    group.add(cubes);
    group.position.y = 200;
    scene.add(group);
    const m4 = new THREE.Matrix4();
    return { update(t) {
      group.rotation.z = t * 0.008;
      for (let i = 0; i < debris; i++) {
        const a = angles[i][0] + t * 0.02 * angles[i][1];
        m4.makeRotationY(a * 2);
        m4.setPosition(Math.cos(a) * 335, Math.sin(a) * 335 * Math.cos(Math.PI / 2 - 0.35), Math.sin(a) * 335 * 0.35);
        cubes.setMatrixAt(i, m4);
      }
      cubes.instanceMatrix.needsUpdate = true;
    } };
  },

  meteors(scene, world, rand, v) {
    const n = v === 1 ? 34 : 16;
    const col = [0xfff0d0, 0xfff0d0, 0xd0e8ff, 0xa8ffc0][v] ?? 0xfff0d0;
    const speed = v === 2 ? 22 : 85;
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 14), mat, n);
    const ms = [];
    for (let i = 0; i < n; i++) {
      ms.push({ x: rand.range(-400, 400), y: rand.range(80, 480), z: rand.range(-400, 400), ph: rand.float() });
    }
    const dir = new THREE.Vector3(0.5, -1, 0.22).normalize();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    scene.add(mesh);
    return { update(t, dt) {
      for (let i = 0; i < n; i++) {
        const m = ms[i];
        m.x += dir.x * speed * dt; m.y += dir.y * speed * dt; m.z += dir.z * speed * dt;
        if (m.y < 30) { m.y = rand.range(300, 480); m.x = rand.range(-400, 400); m.z = rand.range(-400, 400); }
        m4.compose(new THREE.Vector3(m.x, m.y, m.z), q, new THREE.Vector3(1, 1, 1 + speed * 0.06));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },

  planet(scene, world, rand, v) {
    const cfg = [
      { r: 90, col: 0xd8d4c8, emiss: 0x222220, ring: false },  // giant moon
      { r: 130, col: 0xd8a050, emiss: 0x331803, ring: false }, // amber giant
      { r: 110, col: 0x6890d8, emiss: 0x101c38, ring: false }, // blue companion
      { r: 100, col: 0xc8b890, emiss: 0x221c08, ring: true },  // ringed
      { r: 70, col: 0xff5030, emiss: 0x661505, ring: false },  // red dwarf
    ][v] ?? { r: 90, col: 0xd8d4c8, emiss: 0x222220, ring: false };
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(cfg.r, 24, 18),
      new THREE.MeshLambertMaterial({ color: cfg.col, emissive: cfg.emiss, fog: false }));
    g.add(m);
    if (cfg.ring) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.7, cfg.r * 0.16, 2, 48),
        new THREE.MeshBasicMaterial({ color: 0xbfae88, transparent: true, opacity: 0.7, fog: false }));
      ring.scale.z = 0.1; ring.rotation.x = Math.PI / 2 - 0.4;
      g.add(ring);
    }
    if (v === 4) { // red dwarf glows
      const tex = toTexture(softSprite(128, 'rgba(255,90,40,0.8)', 'rgba(255,90,40,0)'));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(cfg.r * 5, cfg.r * 5, 1);
      g.add(s);
    }
    const az = rand.float() * Math.PI * 2;
    g.position.set(Math.cos(az) * 520, 260 + rand.float() * 120, Math.sin(az) * 520);
    scene.add(g);
    return { update(t) { m.rotation.y = t * 0.01; } };
  },

  wire(scene, world, rand, v) {
    const col = [new THREE.Color(0x40e0ff), new THREE.Color(0xff40c0), new THREE.Color(0xffd040), new THREE.Color(0xc8f0ff)][v];
    const geo = new THREE.PlaneGeometry(1300, 1300, 44, 44);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, world.terrainH(p.getX(i), p.getZ(i)) + 0.4);
    const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.3 });
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat);
    scene.add(wire);
    return { update(t) { mat.opacity = 0.16 + (Math.sin(t * 1.1) * 0.5 + 0.5) * 0.26; } };
  },

  motes(scene, world, rand, v) {
    const col = [0xc8ff70, 0xff9840, 0xfff0b0, 0xb0c8ff][v];
    const tex = toTexture(softSprite());
    const N = 700;
    const base = new Float32Array(N * 3);
    const pts = points(scene, N, (i, pos) => {
      const a = rand.float() * Math.PI * 2, rr = Math.sqrt(rand.float()) * 260;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = rand.range(2, 55); pos[i * 3 + 2] = Math.sin(a) * rr;
      base[i * 3] = pos[i * 3]; base[i * 3 + 1] = pos[i * 3 + 1]; base[i * 3 + 2] = pos[i * 3 + 2];
    }, { color: col, size: 1.6, map: tex, additive: true, opacity: 0.75 });
    return { update(t) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        pos.setX(i, base[i * 3] + Math.sin(t * 0.4 + i) * 3);
        pos.setY(i, base[i * 3 + 1] + Math.sin(t * 0.6 + i * 1.7) * 2);
        pos.setZ(i, base[i * 3 + 2] + Math.cos(t * 0.5 + i * 0.9) * 3);
      }
      pos.needsUpdate = true;
    } };
  },

  storm(scene, world, rand, v) {
    const tint = v === 2 ? 0xc8a8ff : 0xd8e8ff;
    const flashLight = new THREE.AmbientLight(tint, 0);
    scene.add(flashLight);
    const boltMat = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0 });
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    const bolt = new THREE.Line(boltGeo, boltMat);
    bolt.frustumCulled = false;
    scene.add(bolt);
    let next = 2 + rand.float() * 4, flash = 0;
    return { update(t, dt) {
      next -= dt;
      if (next <= 0) {
        next = (v === 1 ? 6 : 3) + rand.float() * 6;
        flash = 1;
        const x = rand.range(-300, 300), z = rand.range(-300, 300);
        const pos = boltGeo.attributes.position;
        let y = 260;
        let bx = x, bz = z;
        for (let i = 0; i < 12; i++) {
          pos.setXYZ(i, bx, y, bz);
          y -= 260 / 11;
          bx += rand.range(-14, 14); bz += rand.range(-14, 14);
        }
        pos.needsUpdate = true;
      }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * (v === 1 ? 2.2 : 5));
        flashLight.intensity = flash * 1.6;
        boltMat.opacity = v === 1 ? 0 : flash;
      }
    } };
  },

  beams(scene, world, rand, v) {
    const cols = [0xfff2c0, 0xf8f8ff, 0xc0e8ff, 0xffd8a0][v];
    const c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 128);
    const tex = toTexture(c);
    const beams = [];
    const n = v === 2 ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 340),
        new THREE.MeshBasicMaterial({ map: tex, color: cols, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
      m.position.set(rand.range(-200, 200), 170, rand.range(-200, 200));
      m.rotation.z = rand.range(-0.35, 0.35);
      scene.add(m);
      beams.push(m);
    }
    return { update(t) {
      for (let i = 0; i < beams.length; i++) {
        beams[i].rotation.y = t * 0.06 + i;
        if (v === 2) beams[i].rotation.z = Math.sin(t * 0.3 + i * 2) * 0.5; // searchlights sweep
      }
    } };
  },

  matrix(scene, world, rand, v) {
    const col = ['#40ff80', '#ffd040', '#f0f0ff'][v];
    const systems = [];
    for (const ch of ['0', '1', 'x', '7']) {
      const tex = toTexture(glyphSprite(ch, col));
      const N = 160;
      const p = points(scene, N, (i, pos) => {
        const a = rand.float() * Math.PI * 2, rr = Math.sqrt(rand.float()) * 220;
        pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = rand.range(5, 220); pos[i * 3 + 2] = Math.sin(a) * rr;
      }, { size: 4, map: tex, additive: true, opacity: 0.85 });
      systems.push({ p, speed: rand.range(14, 30) });
    }
    return { update(t, dt) {
      for (const s of systems) {
        const pos = s.p.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - s.speed * dt;
          if (y < 2) y = 220;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    } };
  },

  monolith(scene, world, rand, v) {
    const n = [9, 22, 14, 5][v];
    const geo = v === 1 ? new THREE.TetrahedronGeometry(5) : new THREE.BoxGeometry(6, 16, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a1c22, emissive: 0x0a0c14 });
    const ms = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / n) * Math.PI * 2 + rand.float();
      const rr = v === 3 ? 60 : rand.range(60, 240);
      m.position.set(Math.cos(a) * rr, rand.range(35, 110), Math.sin(a) * rr);
      m.userData = { ph: rand.float() * 9, spin: rand.range(0.05, v === 2 ? 0.8 : 0.2), y: m.position.y };
      scene.add(m);
      ms.push(m);
    }
    return { update(t) {
      for (const m of ms) {
        m.position.y = m.userData.y + Math.sin(t * 0.4 + m.userData.ph) * 4;
        m.rotation.y = t * m.userData.spin;
        if (v === 2) m.rotation.x = t * m.userData.spin * 0.7;
      }
    } };
  },

  lasers(scene, world, rand, v) {
    const col = [0x40ff80, 0x40e0ff, 0xff4060, 0xffb040][v];
    const T = world.tallest;
    const g = new THREE.Group();
    const n = v === 3 ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 260),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      beam.position.z = 130;
      const holder = new THREE.Group();
      holder.rotation.y = (i / n) * Math.PI * 2;
      holder.rotation.x = -0.12 - (i % 3) * 0.1;
      holder.add(beam);
      g.add(holder);
    }
    g.position.set(T.x, world.plateauY + T.h + 2, T.z);
    scene.add(g);
    const speed = v === 3 ? 0.06 : 0.3;
    return { update(t) { g.rotation.y = t * speed; g.children.forEach((h, i) => { h.rotation.x = -0.15 + Math.sin(t * 0.4 + i) * 0.12; }); } };
  },

  eclipse(scene, world, rand, v) {
    const sd = world.sunDir.clone().multiplyScalar(700);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(64, 40),
      new THREE.MeshBasicMaterial({ color: 0x050508, fog: false }));
    disc.position.copy(sd);
    disc.lookAt(0, 0, 0);
    const ringCol = [0xffd890, 0xff8040, 0xc0d8ff][v];
    const ring = new THREE.Mesh(new THREE.RingGeometry(64, 82, 40),
      new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    ring.position.copy(sd).multiplyScalar(0.99);
    ring.lookAt(0, 0, 0);
    scene.add(disc, ring);
    return { update(t) { ring.material.opacity = 0.6 + Math.sin(t * 0.8) * 0.25; } };
  },

  galaxy(scene, world, rand, v) {
    const N = 2600;
    const cols = [[0.6, 0.75], [0.08, 0.6], [0.55, 0.9], [0.85, 0.7]][v];
    const colors = new Float32Array(N * 3);
    const c = new THREE.Color();
    const pts = points(scene, N, (i, pos) => {
      const arm = i % (v === 3 ? 4 : 2);
      const t = Math.pow(rand.float(), 0.6);
      const a = t * 4.2 + arm * Math.PI * (v === 3 ? 0.5 : 1);
      const rr = 30 + t * 330;
      const sp = rand.range(-16, 16) * (1 - t * 0.6);
      pos[i * 3] = Math.cos(a) * rr + sp;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = Math.sin(a) * rr + sp;
      c.setHSL(cols[0] + rand.float() * 0.1, cols[1], 0.55 + rand.float() * 0.35);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }, { size: 2.6, additive: true, opacity: 0.8, map: toTexture(softSprite()), vertexColors: true });
    pts.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pts.position.y = 330;
    pts.rotation.x = 0.15;
    return { update(t) { pts.rotation.y = t * 0.015; } };
  },

  lissa(scene, world, rand, v) {
    const N = 260;
    const params = [];
    for (let i = 0; i < N; i++) params.push([1 + (i % 3), 2 + (i % 4), 1 + (i % 5), rand.float() * 9, rand.float() * 9, rand.float() * 9]);
    const col = [0x80f0ff, 0xffa8e8, 0xd0ffa0][v];
    const pts = points(scene, N, (i, pos) => { pos[i * 3 + 1] = 150; }, { color: col, size: 3, additive: true, opacity: 0.9, map: toTexture(softSprite()) });
    return { update(t) {
      const pos = pts.geometry.attributes.position;
      const T = t * 0.22;
      for (let i = 0; i < N; i++) {
        const [a, b, cc, p1, p2, p3] = params[i];
        pos.setXYZ(i,
          Math.sin(a * T + p1) * 200,
          160 + Math.sin(b * T + p2) * 70,
          Math.sin(cc * T + p3) * 200);
      }
      pos.needsUpdate = true;
    } };
  },

  helix(scene, world, rand, v) {
    const N = 340;
    const col = [0x70d8ff, 0xff70a8, 0xffd070, 0xa8ff70][v];
    const double = v === 1;
    const pts = points(scene, N, () => {}, { color: col, size: 2.6, additive: true, opacity: 0.85, map: toTexture(softSprite()) });
    const T0 = world.tallest;
    return { update(t) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        const f = i / N;
        const strand = double && i % 2 ? Math.PI : 0;
        const a = f * Math.PI * 8 + t * 0.35 + strand;
        pos.setXYZ(i, T0.x + Math.cos(a) * (30 + f * 20), 10 + f * 320, T0.z + Math.sin(a) * (30 + f * 20));
      }
      pos.needsUpdate = true;
    } };
  },
};

// ── ambient effects ──────────────────────────────────────────────────────────
const AMBIENT = {
  dust(scene, world, rand, v) {
    return HERO.motes(scene, world, rand, 3);
  },

  birds(scene, world, rand, v) {
    const flocks = 1 + (v % 3);
    const per = 7 + v;
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 2.2, 3),
      new THREE.MeshLambertMaterial({ color: 0x2a2c30 }), flocks * per);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const fl = [];
    for (let f = 0; f < flocks; f++) fl.push({ cx: rand.range(-150, 150), cz: rand.range(-150, 150), h: rand.range(45, 95), r: rand.range(25, 60), sp: rand.range(0.1, 0.25) * (rand.chance(0.5) ? 1 : -1), ph: rand.float() * 9 });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    return { update(t) {
      let k = 0;
      for (const f of fl) {
        for (let i = 0; i < per; i++) {
          const a = t * f.sp + f.ph + i * 0.24;
          const x = f.cx + Math.cos(a) * f.r + Math.sin(i * 3.7) * 4;
          const z = f.cz + Math.sin(a) * f.r + Math.cos(i * 2.9) * 4;
          const y = f.h + Math.sin(t * 2.4 + i) * 1.6;
          e.set(Math.PI / 2, 0, -a - Math.PI / 2, 'YXZ');
          q.setFromEuler(e);
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1 + Math.abs(Math.sin(t * 6 + i)) * 0.6));
          mesh.setMatrixAt(k++, m4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },

  leaves(scene, world, rand, v) {
    const N = 240;
    const col = new THREE.Color().setHSL(0.08 + v * 0.05, 0.7, 0.5);
    const pts = points(scene, N, (i, pos) => {
      pos[i * 3] = rand.range(-260, 260); pos[i * 3 + 1] = rand.range(2, 60); pos[i * 3 + 2] = rand.range(-260, 260);
    }, { color: col.getHex(), size: 1.1, opacity: 0.85 });
    return { update(t, dt) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) - dt * (2 + (i % 5) * 0.5);
        if (y < 0) y = 60;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 1.4 + i) * dt * 4);
      }
      pos.needsUpdate = true;
    } };
  },

  bubbles(scene, world, rand, v) {
    if (!world.hasWater) return AMBIENT.dust(scene, world, rand, v);
    const N = 150;
    const pts = points(scene, N, (i, pos) => {
      const a = rand.float() * Math.PI * 2, rr = rand.range(160, 300);
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = world.waterY + rand.range(0, 16); pos[i * 3 + 2] = Math.sin(a) * rr;
    }, { color: 0xd8f4ff, size: 1, additive: true, opacity: 0.7, map: toTexture(softSprite()) });
    return { update(t, dt) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) + dt * (1.5 + (i % 4) * 0.6);
        if (y > world.waterY + 18) y = world.waterY;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    } };
  },

  blimp(scene, world, rand, v) {
    const g = new THREE.Group();
    const hue = (v * 90 + 20) % 360;
    const body = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10),
      new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.5, 0.55) }));
    body.scale.set(1, 0.42, 0.42);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.4), body.material);
    fin.position.x = -8;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 1.6), new THREE.MeshLambertMaterial({ color: 0x33363c }));
    cab.position.y = -4.2;
    g.add(body, fin, cab);
    scene.add(g);
    const R = 200 + v * 30, H = 120 + v * 20, sp = 0.03;
    return { update(t) {
      const a = t * sp;
      g.position.set(Math.cos(a) * R, H + Math.sin(t * 0.2) * 6, Math.sin(a) * R);
      g.rotation.y = -a - Math.PI / 2;
    } };
  },

  drones(scene, world, rand, v) {
    const n = 4 + v;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.5, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x44484e }), n);
    const lights = points(scene, n, (i, pos) => { pos[i * 3 + 1] = -10; },
      { color: 0xff4040, size: 2.4, additive: true, opacity: 0.9, map: toTexture(softSprite()) });
    scene.add(mesh);
    const ds = [];
    for (let i = 0; i < n; i++) ds.push({ x: rand.range(-120, 120), z: rand.range(-120, 120), h: rand.range(25, 70), ph: rand.float() * 9, r: rand.range(8, 30), sp: rand.range(0.2, 0.6) });
    const m4 = new THREE.Matrix4();
    return { update(t) {
      const lp = lights.geometry.attributes.position;
      for (let i = 0; i < n; i++) {
        const d = ds[i];
        const x = d.x + Math.cos(t * d.sp + d.ph) * d.r;
        const z = d.z + Math.sin(t * d.sp * 1.3 + d.ph) * d.r;
        const y = d.h + Math.sin(t * 1.7 + d.ph) * 2;
        m4.makeRotationY(t + d.ph);
        m4.setPosition(x, y, z);
        mesh.setMatrixAt(i, m4);
        lp.setXYZ(i, x, y - 0.5, z);
      }
      mesh.instanceMatrix.needsUpdate = true;
      lp.needsUpdate = true;
      lights.material.opacity = Math.sin(t * 4) > 0 ? 0.9 : 0.15;
    } };
  },

  mist(scene, world, rand, v) {
    const tex = toTexture(softSprite(128, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)'));
    const sprites = [];
    for (let i = 0; i < 12 + v * 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 }));
      const a = rand.float() * Math.PI * 2, rr = rand.range(30, 300);
      s.position.set(Math.cos(a) * rr, world.terrainH(Math.cos(a) * rr, Math.sin(a) * rr) + 4, Math.sin(a) * rr);
      s.scale.set(rand.range(40, 90), rand.range(10, 22), 1);
      s.userData.ph = rand.float() * 9;
      scene.add(s);
      sprites.push(s);
    }
    return { update(t) { for (const s of sprites) s.position.x += Math.sin(t * 0.1 + s.userData.ph) * 0.02; } };
  },

  sparkle(scene, world, rand, v) {
    if (!world.hasWater) return AMBIENT.dust(scene, world, rand, v);
    const N = 260;
    const pts = points(scene, N, (i, pos) => {
      const a = rand.float() * Math.PI * 2, rr = rand.range(150, 380);
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = world.waterY + 0.3; pos[i * 3 + 2] = Math.sin(a) * rr;
    }, { color: 0xfff8d8, size: 1.6, additive: true, opacity: 0.8, map: toTexture(softSprite()) });
    return { update(t) { pts.material.opacity = 0.4 + (Math.sin(t * 2.7) * 0.5 + 0.5) * 0.5; } };
  },

  shooting(scene, world, rand, v) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 40), mat);
    streak.frustumCulled = false;
    scene.add(streak);
    let next = 3, life = 0;
    const from = new THREE.Vector3(), dir = new THREE.Vector3();
    return { update(t, dt) {
      next -= dt;
      if (next <= 0) {
        next = 4 + rand.float() * (9 - v);
        life = 1;
        from.set(rand.range(-400, 400), rand.range(250, 420), rand.range(-400, 400));
        dir.set(rand.range(-1, 1), -0.4, rand.range(-1, 1)).normalize();
        streak.position.copy(from);
        streak.lookAt(from.clone().add(dir));
      }
      if (life > 0) {
        life -= dt * 1.4;
        streak.position.addScaledVector(dir, dt * 300);
        mat.opacity = Math.max(0, life) * 0.9;
      }
    } };
  },

  butterfly(scene, world, rand, v) {
    const n = 24;
    const hue = (v * 77 + 10) % 360;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.85, 0.6), side: THREE.DoubleSide }), n);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const bs = [];
    for (let i = 0; i < n; i++) bs.push({ x: rand.range(-160, 160), z: rand.range(-160, 160), h: rand.range(2, 8), ph: rand.float() * 9 });
    const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
    return { update(t) {
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        const x = b.x + Math.sin(t * 0.5 + b.ph) * 18;
        const z = b.z + Math.cos(t * 0.4 + b.ph * 2) * 18;
        const y = world.terrainH(x, z) + b.h + Math.sin(t * 2 + b.ph) * 1;
        e.set(0, t * 0.5 + b.ph, Math.sin(t * 14 + b.ph) * 0.9);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },

  smoke(scene, world, rand, v) {
    const tex = toTexture(softSprite(64, 'rgba(220,220,225,0.25)', 'rgba(220,220,225,0)'));
    const emitters = [];
    const blds = world.buildings.slice(0, 5);
    for (const b of blds) {
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.position.set(b.x, world.plateauY + b.h + i * 2, b.z);
        s.scale.set(3, 3, 1);
        s.userData = { b, f: i / 8, ph: rand.float() };
        scene.add(s);
        emitters.push(s);
      }
    }
    return { update(t, dt) {
      for (const s of emitters) {
        s.userData.f = (s.userData.f + dt * 0.1) % 1;
        const f = s.userData.f;
        s.position.y = world.plateauY + s.userData.b.h + f * 26;
        s.position.x = s.userData.b.x + Math.sin(t * 0.5 + s.userData.ph * 9) * (2 + f * 6);
        const sc = 2 + f * 9;
        s.scale.set(sc, sc, 1);
        s.material.opacity = (1 - f) * 0.5;
      }
    } };
  },

  lanterns(scene, world, rand, v) {
    const N = 46;
    const pts = points(scene, N, (i, pos) => {
      pos[i * 3] = rand.range(-140, 140); pos[i * 3 + 1] = rand.range(5, 180); pos[i * 3 + 2] = rand.range(-140, 140);
    }, { color: 0xffc060, size: 3, additive: true, opacity: 0.9, map: toTexture(softSprite()) });
    return { update(t, dt) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) + dt * (2.5 + (i % 5) * 0.7);
        if (y > 190) y = 4;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.4 + i) * dt * 2);
      }
      pos.needsUpdate = true;
    } };
  },

  confetti(scene, world, rand, v) {
    const N = 240;
    const colors = new Float32Array(N * 3);
    const c = new THREE.Color();
    const pts = points(scene, N, (i, pos) => {
      pos[i * 3] = rand.range(-90, 90); pos[i * 3 + 1] = rand.range(2, 70); pos[i * 3 + 2] = rand.range(-90, 90);
      c.setHSL(rand.float(), 0.85, 0.6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }, { size: 1, opacity: 0.95, vertexColors: true });
    pts.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { update(t, dt) {
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) - dt * (1.5 + (i % 6) * 0.4);
        if (y < 0) y = 70;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 2 + i * 2) * dt * 3);
      }
      pos.needsUpdate = true;
    } };
  },
};

export function buildEffects(world, spec) {
  const fns = [];
  const heroDef = spec.hero;
  const ambDef = spec.ambient;
  const hr = spec.rand('hero-fx');
  const ar = spec.rand('ambient-fx');
  const hero = (HERO[heroDef.fam] ?? HERO.none)(world.scene, world, hr, heroDef.v);
  const amb = (AMBIENT[ambDef.fam] ?? AMBIENT.dust)(world.scene, world, ar, ambDef.v);
  if (hero) fns.push(hero);
  if (amb) fns.push(amb);
  return {
    update(t, dt) { for (const f of fns) f.update && f.update(t, dt); },
  };
}
