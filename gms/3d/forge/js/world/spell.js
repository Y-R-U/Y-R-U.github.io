// The cast on the fire button. Motes gather at the staff, a bolt goes out, something blooms where
// it lands. Every particle of every cast lives in one Points cloud, so the whole system is one
// draw call and no texture — the grain is a falloff computed in the shader.
//
// One effect, coloured per zone. A second spell should be a new entry in SHAPES rather than a new
// file: what changes between a combat spell and a farming one is timing, spread and where it lands.

import * as THREE from 'three';
import { zone } from './zones.js';
import { groundAt } from './colliders.js';

const MAX = 760;
const TIP = new THREE.Vector3(-0.24, 2.0, 0.05);   // the staff head, in the figure's own frame

// Fired at the peak of the staff swing rather than on the press, so the bolt leaves the tip when
// the tip is furthest forward. `swing` runs 1 → 0, so the peak is halfway down.
const RELEASE = 0.5;

const SHAPES = {
  bolt: { charge: 0.20, speed: 22, range: 18, trail: 5, burst: 110, spread: 3.4, rise: 0.9 },
};

export class Spells {
  constructor(player, terrain) {
    this.player = player;
    this.terrain = terrain;
    this.casts = [];
    this.alive = 0;
    this.cursor = 0;
    this.enabled = true;
    this.gain = 1;
    this.scale = 1;

    this.px = new Float32Array(MAX * 3);
    this.pc = new Float32Array(MAX * 3);
    this.ps = new Float32Array(MAX);
    this.pa = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.full = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.px, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pa, 1));
    g.setDrawRange(0, MAX);
    // Never culled: the bounding sphere would have to be rebuilt every frame to stay honest, and
    // the cloud is one call whether it is on screen or not.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = { uScale: { value: 600 }, uGain: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        uniform float uScale;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vCol = color;
          vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.05, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uGain;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          float f = 1.0 - r;
          gl_FragColor = vec4(vCol * uGain, vA * f * f);
        }`,
    });

    this.points = new THREE.Points(g, mat);
    this.points.name = 'spells';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.object3D = this.points;
    this.geo = g;
  }

  registerKnobs(q) {
    q.register({ key: 'spells', label: 'Spell on fire button', type: 'toggle', default: true, group: 'Spells' },
      v => { this.enabled = !!v; if (!v) this.clear(); });
    q.register({ key: 'spellGain', label: 'Spell brightness', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, group: 'Spells' },
      v => { this.gain = v; });
    q.register({ key: 'spellSize', label: 'Spell particle size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, group: 'Spells' },
      v => { this.scale = v; });
    q.register({ key: 'spellSpeed', label: 'Bolt speed (m/s)', type: 'range', min: 6, max: 45, step: 1, default: 22, group: 'Spells' },
      v => { SHAPES.bolt.speed = v; });
    q.register({ key: 'spellRange', label: 'Bolt range (m)', type: 'range', min: 4, max: 40, step: 1, default: 18, group: 'Spells' },
      v => { SHAPES.bolt.range = v; });
  }

  clear() {
    this.casts.length = 0;
    this.life.fill(0);
    this.pa.fill(0);
    this.alive = 0;
    this.points.visible = false;
  }

  colours() {
    const z = zone(this.player.zoneId);
    const s = z.spell || zone('neutral').spell;
    return {
      core: new THREE.Color(s.core), edge: new THREE.Color(s.edge), bloom: new THREE.Color(s.bloom),
    };
  }

  // Where the staff head is this frame, in world space. Taken off the figure's own matrix so the
  // swing carries it — the bolt leaves the tip, not a point floating near the player.
  tip(out) {
    const P = this.player;
    P.object3D.updateMatrixWorld();
    return out.copy(TIP).applyMatrix4(P.object3D.matrixWorld);
  }

  cast(shape = 'bolt') {
    const S = SHAPES[shape];
    if (!S || !this.enabled) return false;
    const P = this.player;
    const from = this.tip(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    // Aim from the chest rather than the tip, or a staff held out to one side throws the bolt on a
    // line that misses everything the player is looking at.
    const eye = new THREE.Vector3(P.pos.x, P.pos.y + 1.35, P.pos.z);
    this.casts.push({
      S, t: 0, phase: 'charge', col: this.colours(),
      from, dir, eye, pos: from.clone(),
      dist: this.reach(eye, dir, S.range),
      gone: 0,
    });
    return true;
  }

  // How far the bolt gets before it meets something. The camera's own collider set answers this,
  // which means indoors it is the room's walls and outdoors it is the world.
  reach(eye, dir, range) {
    const c = this.player.colliders;
    let d = range;
    if (c) d = Math.min(d, c.hit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, 0.12));
    return Math.max(1.2, d);
  }

  update(dt, app) {
    const P = this.player;
    if (P.castEdge) {
      P.castEdge = false;
      if (this.enabled && P.enabled && !P.free) this.pending = true;
    }
    // The press arms it; the swing releases it.
    if (this.pending && P.swing > 0 && P.swing <= RELEASE) {
      this.pending = false;
      this.cast('bolt');
    }
    if (P.swing <= 0) this.pending = false;

    for (let i = this.casts.length - 1; i >= 0; i--) {
      if (!this.step(this.casts[i], dt)) this.casts.splice(i, 1);
    }
    this.integrate(dt);

    const h = app.renderer.getDrawingBufferSize(_sz).y;
    this.uniforms.uScale.value = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(app.camera.fov) * 0.5);
    this.uniforms.uGain.value = this.gain;
  }

  step(c, dt) {
    const S = c.S;
    c.t += dt;
    if (c.phase === 'charge') {
      this.tip(c.from);
      const n = Math.min(6, Math.ceil(dt * 220));
      for (let i = 0; i < n; i++) {
        // Motes appear on a shell and fall inward, so the gather reads as pulled in rather than
        // as a puff that happens to be near the staff.
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
        const r = 0.55 + Math.random() * 0.5, s = Math.sqrt(1 - u * u);
        const ox = Math.cos(a) * s * r, oy = u * r * 0.7, oz = Math.sin(a) * s * r;
        const life = 0.1 + Math.random() * 0.12;
        this.add(c.from.x + ox, c.from.y + oy, c.from.z + oz,
          -ox / life, -oy / life, -oz / life,
          0.10 + Math.random() * 0.10, life, c.col.edge, 0.4, 0);
      }
      if (c.t < S.charge) return true;
      c.phase = 'fly';
      c.t = 0;
      this.flash(c);
      return true;
    }

    if (c.phase === 'fly') {
      const adv = S.speed * dt;
      c.gone += adv;
      c.pos.copy(c.from).addScaledVector(c.dir, Math.min(c.gone, c.dist));
      // A cast that starts at the staff but is aimed from the chest has to converge on the aim
      // line, or the bolt flies parallel to where you are looking and a pace to the left of it.
      const k = Math.min(1, c.gone / 2.2);
      const aim = _v.copy(c.eye).addScaledVector(c.dir, Math.min(c.gone, c.dist));
      c.pos.lerp(aim, k);
      for (let i = 0; i < S.trail; i++) {
        this.add(c.pos.x + rnd(0.07), c.pos.y + rnd(0.07), c.pos.z + rnd(0.07),
          rnd(0.5), rnd(0.5) + 0.25, rnd(0.5),
          0.24 + Math.random() * 0.16, 0.26 + Math.random() * 0.22,
          Math.random() < 0.45 ? c.col.core : c.col.edge, 1.9, -0.25);
      }
      this.add(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, 0.62, 0.09, c.col.core, 0, 0);
      if (c.gone < c.dist) return true;
      this.burst(c);
      return false;
    }
    return false;
  }

  // The moment of release: a hard flash at the tip so the bolt looks thrown rather than spawned.
  flash(c) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = 1.6 + Math.random() * 2.4;
      this.add(c.from.x, c.from.y, c.from.z,
        Math.cos(a) * s * sp + c.dir.x * 2, u * sp * 0.7 + 0.6, Math.sin(a) * s * sp + c.dir.z * 2,
        0.16 + Math.random() * 0.14, 0.18 + Math.random() * 0.18, c.col.core, 3.2, -1.2);
    }
    this.add(c.from.x, c.from.y, c.from.z, 0, 0, 0, 0.9, 0.12, c.col.core, 0, 0);
  }

  burst(c) {
    const S = c.S;
    const p = c.pos;
    const gy = this.terrain ? groundAt(p.x, p.z, p.y) : p.y - 1;
    for (let i = 0; i < S.burst; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = S.spread * (0.35 + Math.random() * 0.9);
      this.add(p.x, p.y, p.z,
        Math.cos(a) * s * sp, u * sp * 0.55 + S.rise, Math.sin(a) * s * sp,
        0.16 + Math.random() * 0.24, 0.38 + Math.random() * 0.6,
        Math.random() < 0.3 ? c.col.core : (Math.random() < 0.6 ? c.col.edge : c.col.bloom),
        1.25, 2.6);
    }
    // a ring on the floor under the hit, which is what actually sells where it landed
    if (p.y - gy < 3) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i + Math.random() * 0.6) / n * Math.PI * 2;
        this.add(p.x, gy + 0.06, p.z, Math.cos(a) * 4.2, 0.35, Math.sin(a) * 4.2,
          0.24, 0.46, c.col.bloom, 3.4, 0.6);
      }
    }
    this.add(p.x, p.y, p.z, 0, 0, 0, 1.5, 0.16, c.col.core, 0, 0);
  }

  add(x, y, z, vx, vy, vz, size, life, col, drag, grav) {
    let i = -1;
    for (let n = 0; n < MAX; n++) {
      const k = (this.cursor + n) % MAX;
      if (this.life[k] <= 0) { i = k; this.cursor = (k + 1) % MAX; break; }
    }
    if (i < 0) return;
    const j = i * 3;
    this.px[j] = x; this.px[j + 1] = y; this.px[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.pc[j] = col.r; this.pc[j + 1] = col.g; this.pc[j + 2] = col.b;
    this.life[i] = life;
    this.full[i] = life;
    this.size0[i] = size;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.alive++;
  }

  integrate(dt) {
    if (!this.alive) {
      if (this.points.visible) { this.points.visible = false; this.pa.fill(0); this.geo.attributes.alpha.needsUpdate = true; }
      return;
    }
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.pa[i] = 0; this.ps[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pa[i] = 0; this.ps[i] = 0; continue; }
      const j = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[j] *= d;
      this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt;
      this.vel[j + 2] *= d;
      this.px[j] += this.vel[j] * dt;
      this.px[j + 1] += this.vel[j + 1] * dt;
      this.px[j + 2] += this.vel[j + 2] * dt;
      const u = this.life[i] / this.full[i];
      this.pa[i] = u * u;
      this.ps[i] = this.size0[i] * this.scale * (0.45 + 0.55 * u);
      live++;
    }
    this.alive = live;
    this.points.visible = live > 0;
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  report() {
    return { casts: this.casts.length, particles: this.alive, zone: this.player.zoneId };
  }
}

const rnd = a => (Math.random() * 2 - 1) * a;
const _v = new THREE.Vector3();
const _sz = new THREE.Vector2();
