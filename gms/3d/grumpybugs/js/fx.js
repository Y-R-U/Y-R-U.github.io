// GRUMPY BUGS — particles and payoff. Explosions, jam splashes, confetti,
// shockwaves, DOM damage floaters. One pooled system, updated per frame.
//
// An explosion is five things fired at once, and it is the layering that makes
// it read as a bang rather than a pop:
//   1. a white core that expands and dies in three frames
//   2. a POINT LIGHT — one flash of real light on the surrounding dirt does
//      more than any number of particles
//   3. a ground-hugging shock ring and a vertical halo
//   4. a fireball of tumbling puffs, embers that arc, clods that spin
//   5. smoke that outlives all of it, rising and going grey
// The FX group hangs off the scene, never off the Battle group, so it survives
// ledge re-meshing.

import * as THREE from 'three';
import { mat } from './bugs.js';
import { $ } from './utils.js';

const T = THREE;

// soft round sprite, used for every glow and puff
function softTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export class FX {
  constructor(scene, camera, dom) {
    this.scene = scene; this.camera = camera; this.dom = dom;
    this.parts = [];         // mesh debris  {mesh, vel, life, life0, grav, spin, shrink, fade}
    this.rings = [];         // flat/torus shocks {mesh, life, life0, grow, fadeOnly}
    this.sprites = [];       // glows and smoke {sp, vel, life, life0, grav, grow, o0, drag}
    this.flashes = [];       // pooled point lights {light, life, life0, i0}
    this.group = new T.Group();
    scene.add(this.group);
    this._sphereGeo = new T.SphereGeometry(1, 7, 6);
    this._chunkGeo = new T.DodecahedronGeometry(1, 0);   // clods, not marbles
    this._quadGeo = new T.PlaneGeometry(1, 1);
    this._glowTex = softTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,236,170,0.85)'], [1, 'rgba(255,140,40,0)']]);
    this._smokeTex = softTex([[0, 'rgba(255,255,255,0.85)'], [0.55, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this._lightPool = [];
  }

  // ---------------- primitives ----------------
  _spawn(meshMat, scale, pos, vel, { life = 1, grav = -9, spin = 3, shrink = true, fade = true, geo = null } = {}) {
    const m = new T.Mesh(geo || this._sphereGeo, meshMat);
    m.scale.setScalar(scale);
    m.position.copy(pos);
    if (spin) m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.group.add(m);
    this.parts.push({ mesh: m, vel, life, life0: life, grav, spin, shrink, fade });
    return m;
  }

  _sprite(tex, color, size, pos, vel, { life = 1, grav = 0, grow = 0, opacity = 1, drag = 0, blend = T.AdditiveBlending, spin = 0 } = {}) {
    const sp = new T.Sprite(new T.SpriteMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending: blend, rotation: Math.random() * 6.3,
    }));
    sp.scale.setScalar(size);
    sp.position.copy(pos);
    this.group.add(sp);
    this.sprites.push({ sp, vel, life, life0: life, grav, grow, o0: opacity, drag, spin });
    return sp;
  }

  // A real light for two tenths of a second. Pooled — allocating a fresh
  // PointLight per blast recompiles every material in range.
  _flash(pos, color, intensity, dist, life) {
    let light = this._lightPool.pop();
    if (!light) { light = new T.PointLight(0xffffff, 0, 10); this.group.add(light); }
    light.color.setHex(color);
    light.intensity = intensity;
    light.distance = dist;
    light.position.copy(pos);
    light.visible = true;
    this.flashes.push({ light, life, life0: life, i0: intensity });
  }

  // ---------------- explosion ----------------
  explosion(p, radius = 1.6, terra = null) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    const R = radius;

    // 1. core flash — very bright, very brief
    this._sprite(this._glowTex, 0xfff6d8, R * 2.4, pos, new T.Vector3(), { life: 0.12, grow: R * 7, opacity: 1 });
    this._sprite(this._glowTex, 0xffb44a, R * 4.0, pos, new T.Vector3(), { life: 0.26, grow: R * 4.2, opacity: 0.6 });

    // 2. one flash of real light on the dirt
    this._flash(pos, 0xffb060, 9 * R, R * 9, 0.28);

    // 3a. ground shock ring, flat and fast
    const ring = new T.Mesh(new T.RingGeometry(0.55, 1, 28),
      new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false }));
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(R * 0.5);
    this.group.add(ring);
    this.rings.push({ mesh: ring, life: 0.45, life0: 0.45, grow: R * 7 });

    // 3b. vertical halo, so the blast reads in the air too
    const halo = new T.Mesh(new T.TorusGeometry(1, 0.07, 8, 28),
      new T.MeshBasicMaterial({ color: 0xffbe70, transparent: true, opacity: 0.6, depthWrite: false }));
    halo.position.copy(pos);
    halo.rotation.set(Math.PI / 2, 0, 0);
    halo.scale.setScalar(R * 0.3);
    this.group.add(halo);
    this.rings.push({ mesh: halo, life: 0.55, life0: 0.55, grow: R * 3.2 });

    // 4. fireball: tumbling lit puffs that climb and cool
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = 2.2 + Math.random() * 3.6;
      this._sprite(this._glowTex, [0xffc257, 0xff8a2a, 0xffe28a][i % 3],
        R * (0.6 + Math.random() * 0.5),
        pos.clone().add(new T.Vector3((Math.random() - 0.5) * R * 0.5, (Math.random() - 0.3) * R * 0.4, (Math.random() - 0.5) * R * 0.5)),
        new T.Vector3(Math.cos(a) * sp * (1 - up * 0.6), 1.6 + up * 4.2, Math.sin(a) * sp * (1 - up * 0.6)),
        { life: 0.34 + Math.random() * 0.24, grav: -2.5, grow: R * 1.6, opacity: 0.9, drag: 2.4 });
    }

    // embers — small, hot, gravity-bound
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
      this._spawn(mat(0xffb347, { emissive: 0xff7a1a, emissiveIntensity: 2.4, flat: true }),
        0.035 + Math.random() * 0.045, pos,
        new T.Vector3(Math.cos(a) * sp, 3 + Math.random() * 5.5, Math.sin(a) * sp),
        { life: 0.6 + Math.random() * 0.5, grav: -11, spin: 8 });
    }

    // 5. dirt clods and torn grass, tumbling
    const clods = terra ? [terra.dirt, terra.dirt2, terra.deep, terra.grass, terra.grass2]
      : [0x8a6a3a, 0x6e4a2b, 0x54371f];
    for (let i = 0; i < 11; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(mat(clods[i % clods.length], { flat: true, rough: 1 }),
        0.06 + Math.random() * 0.09, pos,
        new T.Vector3(Math.cos(a) * (3 + Math.random() * 3), 3.5 + Math.random() * 4.5, Math.sin(a) * (3 + Math.random() * 3)),
        { life: 1.3, grav: -13, spin: 9, shrink: false, geo: this._chunkGeo });
    }

    // Smoke, outliving everything. Spawned already spread out and starting
    // small — stacking six full-size puffs on the impact point makes one milky
    // disc that reads as a bug, not a blast.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random(), r = R * (0.35 + Math.random() * 0.75);
      this._sprite(this._smokeTex, i < 3 ? 0x6a625a : 0x45423e,
        R * (0.35 + Math.random() * 0.4),
        pos.clone().add(new T.Vector3(Math.cos(a) * r, 0.1 + Math.random() * R * 0.5, Math.sin(a) * r)),
        new T.Vector3(Math.cos(a) * 1.1, 1.1 + Math.random() * 1.1, Math.sin(a) * 1.1),
        { life: 1.1 + Math.random() * 0.9, grav: 0.5, grow: R * 1.35, opacity: 0.32, drag: 1.1, blend: T.NormalBlending });
    }

    // a scorch mark left behind on the ground
    const scorch = new T.Mesh(new T.CircleGeometry(R * 0.85, 18),
      new T.MeshBasicMaterial({ color: terra ? terra.char : 0x241a10, transparent: true, opacity: 0.5, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(pos.x, pos.y - 0.02, pos.z);
    this.group.add(scorch);
    this.rings.push({ mesh: scorch, life: 2.2, life0: 2.2, grow: 0, fadeOnly: true });
  }

  // ---------------- splash ----------------
  // Jam/pond/sink. A crown of droplets, a column and two ripples, so a bug
  // going in makes a proper mess.
  splash(p, color = 0x6fb3c9) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    const wet = { opacity: 0.9, rough: 0.15, metal: 0.1 };

    const col = this._spawn(mat(color, wet), 0.3, pos, new T.Vector3(0, 6.5, 0),
      { life: 0.7, grav: -14, spin: 0, shrink: false });
    col.scale.set(0.34, 0.75, 0.34);

    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, r = 0.6 + Math.random() * 0.9;
      const d = this._spawn(mat(color, wet), 0.07 + Math.random() * 0.11,
        new T.Vector3(pos.x + Math.cos(a) * 0.25, pos.y + 0.1, pos.z + Math.sin(a) * 0.25),
        new T.Vector3(Math.cos(a) * r * 2.6, 4.2 + Math.random() * 4.5, Math.sin(a) * r * 2.6),
        { life: 1.0, grav: -12, spin: 0, shrink: false });
      d.scale.y *= 1.5;
    }
    for (let i = 0; i < 5; i++) {          // aerated mist over the top
      const a = Math.random() * Math.PI * 2;
      this._sprite(this._smokeTex, color, 0.9 + Math.random() * 0.5,
        pos.clone().add(new T.Vector3(Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4)),
        new T.Vector3(Math.cos(a) * 0.8, 1.4, Math.sin(a) * 0.8),
        { life: 0.8, grav: -1.2, grow: 1.6, opacity: 0.35, blend: T.NormalBlending, drag: 1.5 });
    }
    for (let k = 0; k < 2; k++) {          // two ripples, offset by start radius
      const ring = new T.Mesh(new T.RingGeometry(0.7, 1, 26),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
      ring.position.set(pos.x, pos.y + 0.06, pos.z);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(0.25 + k * 0.5);
      this.group.add(ring);
      this.rings.push({ mesh: ring, life: 0.9 + k * 0.3, life0: 0.9 + k * 0.3, grow: 3.4 - k });
    }
  }

  poof(p, color = 0xd8d2c4, n = 6) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this._sprite(this._smokeTex, color, 0.5 + Math.random() * 0.3,
        pos.clone().add(new T.Vector3(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15)),
        new T.Vector3(Math.cos(a) * 1.4, 0.9 + Math.random(), Math.sin(a) * 1.4),
        { life: 0.55, grav: 0.4, grow: 1.1, opacity: 0.6, blend: T.NormalBlending, drag: 2.2 });
    }
  }

  // a kick of dust under a walking bug
  dust(p, color = 0xc9bfa8) {
    this._sprite(this._smokeTex, color, 0.22,
      new T.Vector3(p.x, p.y + 0.04, p.z),
      new T.Vector3((Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5),
      { life: 0.42, grav: 0.2, grow: 0.7, opacity: 0.22, blend: T.NormalBlending, drag: 2.6 });
  }

  // exhaust trail behind a flying projectile
  trail(p, color = 0x8d8b85, size = 0.16, opacity = 0.3) {
    this._sprite(this._smokeTex, color, size,
      new T.Vector3(p.x, p.y, p.z),
      new T.Vector3((Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3),
      { life: 0.6, grav: 0.15, grow: 0.55, opacity, blend: T.NormalBlending, drag: 1.4 });
  }

  confetti(center, n = 60) {
    const pos = new T.Vector3(center.x, center.y, center.z);
    const cols = [0xff5a5a, 0xffd94a, 0x8be24a, 0x5ab8ff, 0xd97fff];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(this._quadGeo,
        new T.MeshBasicMaterial({ color: cols[i % cols.length], side: T.DoubleSide, transparent: true }));
      m.scale.set(0.06 + Math.random() * 0.05, 0.1 + Math.random() * 0.06, 1);
      m.position.copy(pos).add(new T.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.group.add(m);
      this.parts.push({
        mesh: m, vel: new T.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3),
        life: 2.6 + Math.random(), life0: 3, grav: -2.2, spin: 6, shrink: false, fade: true, flutter: true,
      });
    }
  }

  // DOM damage number over a world point
  floater(worldPos, text, cls = '') {
    const v = new T.Vector3(worldPos.x, worldPos.y + 0.5, worldPos.z).project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg-float ' + cls;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * this.dom.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * this.dom.clientHeight}px`;
    $('bubbles').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.group.remove(p.mesh); this.parts.splice(i, 1); continue; }
      p.vel.y += p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * 0.7 * dt; }
      // confetti wafts sideways as it falls instead of dropping like gravel
      if (p.flutter) p.mesh.position.x += Math.sin(p.life * 7 + p.mesh.id) * dt * 0.7;
      const f = p.life / p.life0;
      if (p.shrink) p.mesh.scale.setScalar(Math.max(0.001, p.mesh.scale.x * (1 - dt * 1.2)));
      if (p.fade && p.mesh.material.transparent) p.mesh.material.opacity = f;
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.life -= dt;
      if (s.life <= 0) { this.group.remove(s.sp); s.sp.material.dispose(); this.sprites.splice(i, 1); continue; }
      s.vel.y += s.grav * dt;
      if (s.drag) s.vel.multiplyScalar(Math.max(0, 1 - s.drag * dt));
      s.sp.position.addScaledVector(s.vel, dt);
      if (s.grow) s.sp.scale.setScalar(s.sp.scale.x + s.grow * dt);
      if (s.spin) s.sp.material.rotation += s.spin * dt;
      const f = s.life / s.life0;
      s.sp.material.opacity = s.o0 * f * f;     // quadratic: no lingering ghosts
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.group.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.rings.splice(i, 1); continue; }
      const f = 1 - r.life / r.life0;
      if (!r.fadeOnly) r.mesh.scale.setScalar(r.mesh.scale.x + r.grow * dt);
      r.mesh.material.opacity = (1 - f) * (r.fadeOnly ? 0.5 : 0.85);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.life -= dt;
      const f = Math.max(0, fl.life / fl.life0);
      fl.light.intensity = fl.i0 * f * f;
      if (fl.life <= 0) {
        fl.light.visible = false; fl.light.intensity = 0;
        this._lightPool.push(fl.light);
        this.flashes.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.parts) this.group.remove(p.mesh);
    for (const s of this.sprites) { this.group.remove(s.sp); s.sp.material.dispose(); }
    for (const r of this.rings) { this.group.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
    for (const fl of this.flashes) { fl.light.visible = false; fl.light.intensity = 0; this._lightPool.push(fl.light); }
    this.parts.length = 0; this.sprites.length = 0; this.rings.length = 0; this.flashes.length = 0;
  }
}
