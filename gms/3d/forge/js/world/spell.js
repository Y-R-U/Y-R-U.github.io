// The cast on the fire button. Motes gather at the staff, a bolt goes out, something blooms where
// it lands. Particles live in two clouds — one additive for anything that glows, one normally
// blended for anything that has to go darker than the sky — so a cast is two draw calls, no
// textures, and nothing at all while idle.
//
// One effect, coloured per zone. A second spell should be a new entry in SHAPES rather than a new
// file: what changes between a combat spell and a farming one is timing, spread and where it lands.

import * as THREE from 'three';
import { zone } from './zones.js';
import { groundAt } from './colliders.js';

const TIP = new THREE.Vector3(-0.24, 2.0, 0.05);   // the staff head, in the figure's own frame

// Fired at the peak of the staff swing rather than on the press, so the bolt leaves the tip when
// the tip is furthest forward. `swing` runs 1 → 0, so the peak is halfway down.
const RELEASE = 0.5;

const SHAPES = {
  bolt: { charge: 0.20, speed: 22, range: 18, trail: 5, burst: 110, spread: 3.4, rise: 0.9 },
};

// One pool, one geometry, one draw call. `dark` swaps additive for normal blending, which is the
// whole difference between a glow and a hole.
class Cloud {
  constructor(max, dark) {
    this.max = max;
    this.alive = 0;
    this.cursor = 0;
    this.scale = 1;
    this.px = new Float32Array(max * 3);
    this.pc = new Float32Array(max * 3);
    this.ps = new Float32Array(max);
    this.pa = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.full = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.px, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pa, 1));
    // Never culled: an honest bounding sphere would have to be rebuilt every frame, and the cloud
    // is one call whether it is on screen or not.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;

    this.uniforms = { uScale: { value: 600 }, uGain: { value: 1 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
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
          gl_FragColor = vec4(vCol * uGain, vA * ${dark ? 'smoothstep(0.0, 0.9, f) * 0.85' : 'f * f'});
        }`,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    // The hole is punched after the glow, or the bloom draws over the thing it is meant to ring.
    this.points.renderOrder = dark ? 2 : 1;
  }

  add(x, y, z, vx, vy, vz, size, life, col, drag, grav, grow = 0) {
    let i = -1;
    for (let n = 0; n < this.max; n++) {
      const k = (this.cursor + n) % this.max;
      if (this.life[k] <= 0) { i = k; this.cursor = (k + 1) % this.max; break; }
    }
    if (i < 0) return;
    const j = i * 3;
    this.px[j] = x; this.px[j + 1] = y; this.px[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.pc[j] = col.r; this.pc[j + 1] = col.g; this.pc[j + 2] = col.b;
    this.life[i] = life;
    this.full[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.alive++;
  }

  clear() {
    this.life.fill(0);
    this.pa.fill(0);
    this.ps.fill(0);
    this.alive = 0;
    this.points.visible = false;
  }

  integrate(dt) {
    if (!this.alive) {
      if (this.points.visible) { this.points.visible = false; this.pa.fill(0); this.geo.attributes.alpha.needsUpdate = true; }
      return;
    }
    let live = 0;
    for (let i = 0; i < this.max; i++) {
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
      // `grow` runs the size the other way — open from nothing and shut again, which is what makes
      // a collapsing core read as collapsing rather than as a dot that fades.
      const swell = this.grow[i] ? Math.sin((1 - u) * Math.PI) ** 0.6 : 0.45 + 0.55 * u;
      this.pa[i] = this.grow[i] ? Math.min(1, swell * 1.5) : u * u;
      this.ps[i] = this.size0[i] * this.scale * swell;
      live++;
    }
    this.alive = live;
    this.points.visible = live > 0;
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Spells {
  constructor(player, terrain) {
    this.player = player;
    this.terrain = terrain;
    this.casts = [];
    this.enabled = true;
    this.gain = 1;
    this.voidScale = 1;
    this.glow = new Cloud(760, false);
    this.dark = new Cloud(120, true);
    this.object3D = new THREE.Group();
    this.object3D.name = 'spells';
    this.object3D.add(this.glow.points, this.dark.points);
  }

  registerKnobs(q) {
    q.register({ key: 'spells', label: 'Spell on fire button', type: 'toggle', default: true, group: 'Spells' },
      v => { this.enabled = !!v; if (!v) this.clear(); });
    q.register({ key: 'spellGain', label: 'Spell brightness', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, group: 'Spells' },
      v => { this.gain = v; });
    q.register({ key: 'spellSize', label: 'Spell particle size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, group: 'Spells' },
      v => { this.glow.scale = v; });
    q.register({ key: 'spellVoid', label: 'Collapsing core size', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Spells' },
      v => { this.voidScale = v; this.dark.scale = v; });
    q.register({ key: 'spellSpeed', label: 'Bolt speed (m/s)', type: 'range', min: 6, max: 45, step: 1, default: 22, group: 'Spells' },
      v => { SHAPES.bolt.speed = v; });
    q.register({ key: 'spellRange', label: 'Bolt range (m)', type: 'range', min: 4, max: 40, step: 1, default: 18, group: 'Spells' },
      v => { SHAPES.bolt.range = v; });
  }

  clear() {
    this.casts.length = 0;
    this.glow.clear();
    this.dark.clear();
  }

  colours() {
    const s = zone(this.player.zoneId).spell || zone('neutral').spell;
    return {
      core: new THREE.Color(s.core), edge: new THREE.Color(s.edge), bloom: new THREE.Color(s.bloom),
      hole: s.void ? new THREE.Color(s.void) : null, flare: s.flare ?? 1,
    };
  }

  // Where the staff head is this frame, in world space. Taken off the figure's own matrix so the
  // swing carries it — the bolt leaves the tip, not a point floating near the player.
  tip(out) {
    this.player.object3D.updateMatrixWorld();
    return out.copy(TIP).applyMatrix4(this.player.object3D.matrixWorld);
  }

  cast(shape = 'bolt') {
    const S = SHAPES[shape];
    if (!S || !this.enabled) return false;
    const P = this.player;
    const from = this.tip(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    // Aimed from the chest rather than the tip, or a staff held out to one side throws the bolt on
    // a line that misses everything the player is looking at.
    const eye = new THREE.Vector3(P.pos.x, P.pos.y + 1.35, P.pos.z);
    this.casts.push({
      S, t: 0, phase: 'charge', col: this.colours(),
      from, dir, eye, pos: from.clone(), dist: this.reach(eye, dir, S.range), gone: 0,
    });
    return true;
  }

  // How far the bolt gets before it meets something. The camera's own collider set answers this,
  // which means indoors it is the room's walls and outdoors it is the world.
  reach(eye, dir, range) {
    const c = this.player.colliders;
    const d = c ? Math.min(range, c.hit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, 0.12)) : range;
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
    const h = app.renderer.getDrawingBufferSize(_sz).y;
    const scale = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(app.camera.fov) * 0.5);
    for (const c of [this.glow, this.dark]) {
      c.integrate(dt);
      c.uniforms.uScale.value = scale;
    }
    this.glow.uniforms.uGain.value = this.gain;
  }

  step(c, dt) {
    const S = c.S;
    c.t += dt;
    if (c.phase === 'charge') {
      this.tip(c.from);
      for (let i = 0, n = Math.min(6, Math.ceil(dt * 220)); i < n; i++) {
        // Motes appear on a shell and fall inward, so the gather reads as pulled in rather than as
        // a puff that happens to be near the staff.
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
        const r = 0.55 + Math.random() * 0.5, s = Math.sqrt(1 - u * u);
        const ox = Math.cos(a) * s * r, oy = u * r * 0.7, oz = Math.sin(a) * s * r;
        const life = 0.1 + Math.random() * 0.12;
        this.glow.add(c.from.x + ox, c.from.y + oy, c.from.z + oz,
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
      c.gone += S.speed * dt;
      const reached = Math.min(c.gone, c.dist);
      c.pos.copy(c.from).addScaledVector(c.dir, reached);
      // A cast that starts at the staff but is aimed from the chest has to converge on the aim
      // line, or the bolt flies parallel to where you are looking and a pace to the left of it.
      c.pos.lerp(_v.copy(c.eye).addScaledVector(c.dir, reached), Math.min(1, c.gone / 2.2));
      for (let i = 0; i < S.trail; i++) {
        this.glow.add(c.pos.x + rnd(0.07), c.pos.y + rnd(0.07), c.pos.z + rnd(0.07),
          rnd(0.5), rnd(0.5) + 0.25, rnd(0.5),
          0.24 + Math.random() * 0.16, 0.26 + Math.random() * 0.22,
          Math.random() < 0.45 ? c.col.core : c.col.edge, 1.9, -0.25);
      }
      this.glow.add(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, 0.62, 0.09, c.col.core, 0, 0);
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
      this.glow.add(c.from.x, c.from.y, c.from.z,
        Math.cos(a) * s * sp + c.dir.x * 2, u * sp * 0.7 + 0.6, Math.sin(a) * s * sp + c.dir.z * 2,
        0.16 + Math.random() * 0.14, 0.18 + Math.random() * 0.18, c.col.core, 3.2, -1.2);
    }
    this.glow.add(c.from.x, c.from.y, c.from.z, 0, 0, 0, 0.9, 0.12, c.col.core, 0, 0);
  }

  burst(c) {
    const S = c.S, p = c.pos, col = c.col;
    const gy = this.terrain ? groundAt(p.x, p.z, p.y) : p.y - 1;
    for (let i = 0; i < S.burst; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = S.spread * (0.35 + Math.random() * 0.9);
      this.glow.add(p.x, p.y, p.z,
        Math.cos(a) * s * sp, u * sp * 0.55 + S.rise, Math.sin(a) * s * sp,
        0.16 + Math.random() * 0.24, 0.38 + Math.random() * 0.6,
        Math.random() < 0.3 ? col.core : (Math.random() < 0.6 ? col.edge : col.bloom), 1.25, 2.6);
    }
    // a ring on the floor under the hit, which is what actually sells where it landed
    if (p.y - gy < 3) {
      for (let i = 0; i < 26; i++) {
        const a = (i + Math.random() * 0.6) / 26 * Math.PI * 2;
        this.glow.add(p.x, gy + 0.06, p.z, Math.cos(a) * 4.2, 0.35, Math.sin(a) * 4.2,
          0.24, 0.46, col.bloom, 3.4, 0.6);
      }
    }
    this.glow.add(p.x, p.y, p.z, 0, 0, 0, 1.5 * col.flare, 0.30, col.core, 0, 0);
    // A rim of light at the radius the hole opens to, so the core reads as something the blast is
    // collapsing into rather than as a black sticker laid over it.
    if (col.hole) {
      for (let i = 0; i < 30; i++) {
        const a = i / 30 * Math.PI * 2, w = 0.35 + Math.random() * 0.5;
        this.glow.add(p.x + Math.cos(a) * 0.5, p.y + Math.sin(a) * 0.5, p.z + rnd(0.25),
          Math.cos(a) * 1.5, Math.sin(a) * 1.5, rnd(0.6), 0.34, 0.30 + w * 0.2, col.core, 2.2, 0);
      }
    }

    // The core: a hole that swells open and shuts again, lasting longer than the flash so the
    // bloom is already spreading when it appears. A zone with no `void` answers with a bigger
    // flash instead — see `flare`.
    if (!col.hole || this.voidScale <= 0) return;
    this.dark.add(p.x, p.y, p.z, 0, 0, 0, 0.85, 0.30, col.hole, 0, 0, 1);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const r = 0.9 + Math.random() * 1.2, life = 0.14 + Math.random() * 0.14;
      this.dark.add(p.x + Math.cos(a) * s * r, p.y + u * r * 0.7, p.z + Math.sin(a) * s * r,
        -Math.cos(a) * s * r / life, -u * r * 0.7 / life, -Math.sin(a) * s * r / life,
        0.10 + Math.random() * 0.16, life, col.hole, 0.3, 0, 1);
    }
  }

  report() {
    return { casts: this.casts.length, glow: this.glow.alive, dark: this.dark.alive, zone: this.player.zoneId };
  }
}

const rnd = a => (Math.random() * 2 - 1) * a;
const _v = new THREE.Vector3();
const _sz = new THREE.Vector2();
