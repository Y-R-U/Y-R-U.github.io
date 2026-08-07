// One reusable character rig. Every actor — the player, an NPC, a dummy — is a slice of a single
// merged buffer that gets pushed through a matrix per part per frame, so a whole cast costs one
// draw call. Same trick life.js uses for its villagers, and the only way a character fits here.

import * as THREE from 'three';
import { Mesh, prism, blob, loft, ringCircle, matrix, transform, mix, shade, rgb } from '../world/shape.js';

const TAU = Math.PI * 2;

export class ActorPool {
  constructor(materials, { cls = 'solid', shadow = true } = {}) {
    this.materials = materials;
    this.cls = cls;
    this.shadow = shadow;
    this.object3D = new THREE.Group();
    this.object3D.userData.own = false;
    this.parts = [];
    this.dirty = false;
    this.total = 0;
  }

  addPart(geo) {
    const a = geo.attributes;
    const part = {
      n: a.position.count,
      base: new Float32Array(a.position.array),
      baseN: new Float32Array(a.normal.array),
      baseC: new Float32Array(a.color.array),
      start: 0,
    };
    geo.dispose();
    this.parts.push(part);
    this.total += part.n;
    this.dirty = true;
    return part;
  }

  // Rebuilt rather than grown: a pool gains actors in bursts (take control, spawn a dummy) and
  // never per frame, so re-merging is cheaper than reserving headroom for a cast that never comes.
  ensure() {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.total;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    let at = 0;
    for (const p of this.parts) {
      p.start = at;
      P.set(p.base, at * 3); N.set(p.baseN, at * 3); C.set(p.baseC, at * 3);
      at += p.n;
    }
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.Float32BufferAttribute(P, 3);
    this.nor = new THREE.Float32BufferAttribute(N, 3);
    this.col = new THREE.Float32BufferAttribute(C, 3);
    for (const a of [this.pos, this.nor, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('color', this.col);
    if (this.mesh) { this.mesh.geometry.dispose(); this.object3D.remove(this.mesh); }
    this.mesh = new THREE.Mesh(g, this.materials[this.cls]);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.shadow;
    this.mesh.receiveShadow = this.shadow;
    this.object3D.add(this.mesh);
    this.pa = this.pos.array; this.na = this.nor.array; this.ca = this.col.array;
  }

  write(part, m) {
    if (!this.pa) return;
    const e = m.elements, b = part.base, bn = part.baseN, pa = this.pa, na = this.na;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i += 3) {
      const x = b[i], y = b[i + 1], z = b[i + 2];
      pa[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pa[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pa[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = bn[i], ny = bn[i + 1], nz = bn[i + 2];
      const ax = e[0] * nx + e[4] * ny + e[8] * nz;
      const ay = e[1] * nx + e[5] * ny + e[9] * nz;
      const az = e[2] * nx + e[6] * ny + e[10] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      na[o] = ax / l; na[o + 1] = ay / l; na[o + 2] = az / l;
      o += 3;
    }
  }

  // Collapsing to a point is how a part is hidden: degenerate triangles rasterise nothing and it
  // costs no state change, where a second mesh would cost a draw call.
  hide(part) {
    if (!this.pa) return;
    const pa = this.pa;
    for (let o = part.start * 3, end = (part.start + part.n) * 3; o < end; o += 3) {
      pa[o] = 0; pa[o + 1] = -9999; pa[o + 2] = 0;
    }
  }

  tint(part, col, f = 1) {
    if (!this.ca) return;
    const k = rgb(col), ca = this.ca;
    for (let o = part.start * 3, end = (part.start + part.n) * 3; o < end; o += 3) {
      ca[o] = k[0] * f; ca[o + 1] = k[1] * f; ca[o + 2] = k[2] * f;
    }
  }

  scaleColor(part, f) {
    if (!this.ca) return;
    const b = part.baseC, ca = this.ca;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i++) ca[o++] = b[i] * f;
  }

  flush(colors = false) {
    if (!this.mesh) return;
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    if (colors) this.col.needsUpdate = true;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.object3D.clear();
    this.mesh = null;
    this.pa = this.na = this.ca = null;
  }
}

// ── the rig ──────────────────────────────────────────────────────────────────────────────────

const HIP = 0.84, SHO = 0.45, NECK = 0.56, UPPER = 0.275, THIGH = 0.40;
const HEIGHT = 1.78;

// Skins open rows of points — a cape is an arc, not a tube, and loft() always wraps.
function sheet(rows, col) {
  const m = new Mesh();
  const k = typeof col === 'function' ? col : () => col;
  for (let r = 0; r < rows.length - 1; r++) {
    const lo = rows[r], hi = rows[r + 1];
    for (let i = 0; i < lo.length - 1; i++) {
      m.quad(lo[i], lo[i + 1], hi[i + 1], hi[i], k(r, i, r / (rows.length - 1)));
    }
  }
  return m.geo();
}

function arc(n, r, y, a0, a1, squash = 1, dz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / (n - 1));
    out.push([Math.cos(a) * r, y, Math.sin(a) * r * squash + dz]);
  }
  return out;
}

function skinOf(p, variant) {
  const skin = mix(p.build.wall[0], '#c98a5e', 0.66);
  const base = {
    skin,
    tunic: mix(p.build.roofAlt[0], p.water.deep, 0.44),
    tunic2: p.build.roofAlt[2],
    cloak: p.accent,
    belt: p.build.trim[0],
    legs: p.build.woodDark[1],
    boot: p.build.trim[0],
    hair: p.build.woodDark[2],
    hat: p.build.wood[2],
    metal: p.build.metal[1],
    wood: p.build.wood[0],
    cape: true, headwear: 'cap',
  };
  if (variant === 'villager') {
    return { ...base, tunic: p.build.thatch[1], tunic2: p.build.thatch[0], legs: p.build.woodDark[1], cape: false, hat: p.build.wallAlt[0] };
  }
  if (variant === 'foe') {
    return {
      ...base, skin: mix(p.flora.canopyAlt[2], '#8fae7a', 0.5),
      tunic: p.build.woodDark[1], tunic2: p.build.woodDark[0], belt: p.accent,
      legs: p.build.trim[0], boot: p.build.trim[0], hair: p.build.woodDark[2],
      cape: false, headwear: 'none',
    };
  }
  return base;
}

// Every form here is odd-sided, tapered and rotated off the axis — the art rules apply to a
// character exactly as they do to a windmill.
function buildGeo(p, variant, rng) {
  const v = skinOf(p, variant);
  const out = [];
  const push = (geo, off, role, extra) => out.push({ geo, off, role, ...extra });

  // The hem falls to mid-thigh, as the villagers' does. A short jacket on long legs reads as a
  // different, more realistic figure standing next to them.
  const torso = loft([
    ringCircle(7, 0.212, -0.24, 0.12, 0.86),
    ringCircle(7, 0.196, -0.06, 0.28, 0.85),
    ringCircle(7, 0.184, 0.06, 0.42, 0.84),
    ringCircle(7, 0.192, 0.14, 0.56, 0.85),
    ringCircle(7, 0.237, 0.32, 0.70, 0.80),
    ringCircle(7, 0.206, 0.44, 0.84, 0.78),
    ringCircle(7, 0.100, 0.56, 0.98, 0.90),
  ], {
    col: (ri, fi, t) => (ri === 2
      ? shade(v.belt, -0.02 + (fi % 3) * 0.05)
      : shade(mix(v.tunic, v.tunic2, Math.min(1, t * 1.2)), -0.16 + t * 0.32 + (fi % 3) * 0.05)),
  });
  push(torso, [0, HIP, 0], 'body');

  if (v.cape) {
    const A0 = Math.PI * 1.06, A1 = Math.PI * 1.94;
    const cloak = sheet([
      arc(5, 0.185, 0.03, A0, A1, 0.9, 0.01),
      arc(5, 0.262, -0.17, A0, A1, 0.86, -0.03),
      arc(5, 0.300, -0.40, A0, A1, 0.84, -0.055),
      arc(5, 0.286, -0.60, A0, A1, 0.86, -0.075),
    ], (r, i, t) => shade(mix(v.cloak, v.tunic2, 0.14), -0.30 + t * 0.34 + (i % 3) * 0.06));
    push(cloak, [0, 0.42, -0.03], 'cloak', { chain: 'body' });
  }

  const head = new Mesh()
    .add(blob(0.138, 0, { jitter: 0.1, stretch: 1.1, squash: 0.95, rng, col: v.skin }), matrix({ pos: [0, 0.125, 0] }))
    .add(blob(0.118, 0, { jitter: 0.13, stretch: 0.72, rng, col: v.hair }), matrix({ pos: [0, 0.163, -0.052] }))
    .geo();
  push(head, [0, NECK, 0], 'head', { chain: 'body' });

  if (v.headwear === 'cap') {
    const hat = new Mesh()
      .add(prism(7, 0.158, 0.118, 0.115, { rot: 0.4, squash: 0.95, col: (r, i) => shade(v.hat, 0.05 + (i % 3) * 0.06), capBottom: false }), null)
      .add(prism(9, 0.205, 0.188, 0.026, { rot: 0.9, squash: 0.84, col: shade(v.hat, -0.14) }), matrix({ pos: [0, 0.004, 0.032] }))
      .geo();
    push(hat, [0, 0.212, 0], 'hat', { chain: 'head' });
  }

  for (const side of [-1, 1]) {
    const arm = new Mesh()
      .add(prism(5, 0.056, 0.072, UPPER, { rot: rng() * TAU, col: (r, i) => shade(v.tunic, 0.02 - (i % 3) * 0.06) }), matrix({ pos: [0, -UPPER, 0] }))
      .geo();
    push(arm, [side * 0.222, SHO, 0], 'armU', { side, chain: 'body' });
  }
  for (const side of [-1, 1]) {
    const fore = new Mesh()
      .add(prism(5, 0.046, 0.056, 0.235, { rot: rng() * TAU, col: (r, i) => shade(v.skin, -0.03 - (i % 3) * 0.05) }), matrix({ pos: [0, -0.235, 0] }))
      .add(blob(0.058, 0, { jitter: 0.16, stretch: 1.1, rng, col: shade(v.skin, -0.06) }), matrix({ pos: [0, -0.252, 0.006] }))
      .geo();
    push(fore, [0, -UPPER, 0], 'armF', { side, chain: side < 0 ? 'armU-' : 'armU+' });
  }

  for (const side of [-1, 1]) {
    const thigh = new Mesh()
      .add(prism(5, 0.070, 0.090, THIGH, { rot: rng() * TAU, col: (r, i) => shade(v.legs, -0.02 - (i % 3) * 0.06) }), matrix({ pos: [0, -THIGH, 0] }))
      .geo();
    push(thigh, [side * 0.094, HIP, 0], 'legU', { side, chain: null });
  }
  for (const side of [-1, 1]) {
    const shin = new Mesh()
      .add(prism(5, 0.058, 0.068, 0.355, { rot: rng() * TAU, col: (r, i) => shade(v.legs, -0.06 - (i % 3) * 0.05) }), matrix({ pos: [0, -0.355, 0] }))
      .add(prism(5, 0.080, 0.062, 0.09, { rot: 0.7, squash: 0.62, col: (r, i) => shade(v.boot, 0.04 - (i % 3) * 0.07) }), matrix({ pos: [0, -0.375, 0.038] }))
      .geo();
    push(shin, [0, -THIGH, 0], 'legL', { side, chain: side < 0 ? 'legU-' : 'legU+' });
  }

  const blade = loft([
    ringCircle(5, 0.030, 0.055, 0.3, 0.34),
    ringCircle(5, 0.032, 0.42, 0.5, 0.30),
    ringCircle(5, 0.010, 0.66, 0.7, 0.30),
  ], { col: (ri, fi, t) => shade(v.metal, 0.16 - (fi % 3) * 0.13 + t * 0.1) });
  const sword = new Mesh()
    .add(blade, null)
    .add(prism(5, 0.019, 0.015, 0.115, { rot: 0.5, col: shade(v.wood, -0.1) }), matrix({ pos: [0, -0.09, 0] }))
    .add(prism(7, 0.026, 0.020, 0.035, { rot: 0.2, squash: 0.42, col: shade(v.metal, -0.1) }), matrix({ pos: [0, 0.024, 0], ry: 1.57 }))
    .geo();
  // Authored point-up so the caps wind correctly, then turned over: a blade rising out of the
  // fist toward the elbow is what you get otherwise, and it hides inside the arm.
  transform(sword, { rx: 2.86 });
  push(sword, [0.005, -0.225, 0.02], 'sword', { chain: 'armF+', hidden: true });

  const staff = new Mesh()
    .add(prism(5, 0.021, 0.026, 1.34, { rot: 0.3, col: (r, i) => shade(v.wood, 0.04 - (i % 3) * 0.09) }), matrix({ pos: [0, -0.52, 0] }))
    .add(blob(0.058, 0, { jitter: 0.24, stretch: 1.2, rng, col: shade(v.wood, -0.16) }), matrix({ pos: [0, 0.80, 0] }))
    .geo();
  push(staff, [0.02, -0.23, 0.03], 'staff', { chain: 'armF+', hidden: true });

  return out;
}

const cache = new Map();
function partsFor(p, variant, rng) {
  const key = `${p.id}:${variant}`;
  let list = cache.get(key);
  if (!list) { list = buildGeo(p, variant, rng); cache.set(key, list); }
  return list.map(q => ({ ...q, geo: q.geo.clone() }));
}

const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();

const ease = t => t * t * (3 - 2 * t);

export class Actor {
  constructor(pool, defs, scale) {
    this.pool = pool;
    this.scale = scale;
    this.height = HEIGHT * scale;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.phase = Math.random() * TAU;
    this.gait = 0;
    this.walk = 0;
    this.bob = 0;
    this.stride = 0.86 * scale;
    this.atk = -1;
    this.atkDur = 0.5;
    this.atkKind = 'melee';
    this.hurt = 0;
    this.fall = 0;
    this.weapon = 'none';
    this.visible = true;
    this._prev = new THREE.Vector3();
    this._first = true;

    this.parts = defs.map(d => ({ ...d, part: pool.addPart(d.geo), rx: 0, ry: 0, rz: 0, dy: 0 }));
    this.byRole = {};
    this.parts.forEach((q, i) => {
      const k = q.side ? q.role + (q.side > 0 ? '+' : '-') : q.role;
      q.index = i;
      this.byRole[k] = q;
    });
    for (const q of this.parts) q.up = q.chain ? this.byRole[q.chain].index : -1;
    this.mats = this.parts.map(() => new THREE.Matrix4());
  }

  setWeapon(kind) { this.weapon = kind || 'none'; }

  swing(kind = 'melee', dur = 0.5) {
    this.atk = 0;
    this.atkDur = dur;
    this.atkKind = kind;
  }

  flinch() { this.hurt = 1; }

  get attacking() { return this.atk >= 0; }

  update(dt) {
    this.t += dt;
    if (this._first) { this._prev.copy(this.pos); this._first = false; }
    let d = Math.hypot(this.pos.x - this._prev.x, this.pos.z - this._prev.z);
    this._prev.copy(this.pos);
    if (d > 1.5) d = 0;
    const speed = dt > 0 ? d / dt : 0;

    this.gait += (d / this.stride) * TAU;
    const want = speed > 0.45 ? 1 : 0;
    const rate = dt * 7;
    this.walk += THREE.MathUtils.clamp(want - this.walk, -rate, rate);
    if (this.atk >= 0) { this.atk += dt / this.atkDur; if (this.atk > 1) this.atk = -1; }
    this.hurt = Math.max(0, this.hurt - dt * 4);
    const dead = this.state === 'dead';
    this.fall += THREE.MathUtils.clamp((dead ? 1 : 0) - this.fall, -dt * 3, dt * 2.4);

    this.setPose(this.state, this.t);
  }

  setPose(state, t) {
    const w = this.walk;
    const g = this.gait;
    const P = this.byRole;
    for (const q of this.parts) { q.rx = q.ry = q.rz = 0; q.dy = 0; }

    const breathe = Math.sin(t * 1.35 + this.phase) * 0.012;
    const shift = Math.sin(t * 0.52 + this.phase) * 0.035;

    // Idle and walk are authored as one expression each and cross-faded on `w`; a hard swap is the
    // single most obvious thing about a cheap character.
    const body = P.body;
    body.rx = (1 - w) * (0.018 + Math.sin(t * 1.1 + this.phase) * 0.02) + w * (-0.075 + Math.sin(g * 2) * 0.02);
    body.ry = (1 - w) * shift * 0.6 + w * -Math.sin(g) * 0.11;
    body.rz = (1 - w) * shift + w * Math.sin(g) * 0.035;
    this.bob = (1 - w) * breathe + w * (Math.abs(Math.sin(g)) * 0.05 - 0.018);

    if (P.head) {
      P.head.ry = (1 - w) * Math.sin(t * 0.63 + this.phase * 1.7) * 0.22 + w * Math.sin(g) * 0.07;
      P.head.rx = (1 - w) * Math.sin(t * 0.9 + this.phase) * 0.03 + w * 0.05;
    }
    if (P.cloak) {
      P.cloak.rx = (1 - w) * (0.03 + Math.sin(t * 0.8 + this.phase) * 0.03) + w * (0.20 + Math.sin(g * 2 + 0.6) * 0.09);
      P.cloak.rz = Math.sin(t * 0.7 + this.phase) * 0.04 + w * Math.sin(g) * 0.06;
    }

    for (const side of [-1, 1]) {
      const s = side > 0 ? '+' : '-';
      const ph = side > 0 ? 0 : Math.PI;
      const up = P['armU' + s], fo = P['armF' + s];
      up.rx = (1 - w) * (0.04 + Math.sin(t * 0.85 + this.phase + ph) * 0.045)
        + w * (Math.sin(g + ph) * 0.46);
      up.rz = side * ((1 - w) * 0.055 + w * 0.10);
      fo.rx = (1 - w) * -0.22 + w * (-0.30 - Math.max(0, Math.sin(g + ph + 0.9)) * 0.42);

      const lu = P['legU' + s], ll = P['legL' + s];
      lu.rx = w * -Math.sin(g + ph) * 0.55;
      lu.rz = side * 0.03;
      ll.rx = w * Math.max(0, Math.sin(g + ph + 1.15)) * 0.86;
    }

    if (this.atk >= 0) {
      const a = this.atk;
      const arm = P['armU+'], fore = P['armF+'];
      if (this.atkKind === 'magic') {
        // A staff cast holds the pose: raise, hold at full extension, then drop.
        const k = a < 0.35 ? ease(a / 0.35) : a < 0.7 ? 1 : 1 - ease((a - 0.7) / 0.3);
        arm.rx = THREE.MathUtils.lerp(arm.rx, -1.45, k);
        arm.rz += 0.30 * k;
        fore.rx = THREE.MathUtils.lerp(fore.rx, -0.55, k);
        // The staff rides the forearm, so raising the arm alone lays it flat over the shoulder.
        // Counter-rotating by most of the chain keeps it upright as the arm reaches out.
        if (P.staff) P.staff.rx = 1.72 * k;
        body.ry += -0.16 * k;
        if (P.head) P.head.rx -= 0.1 * k;
      } else {
        const wind = a < 0.34 ? ease(a / 0.34) : 1;
        const hit = a < 0.34 ? 0 : a < 0.58 ? ease((a - 0.34) / 0.24) : 1;
        const back = a < 0.58 ? 0 : ease((a - 0.58) / 0.42);
        const raise = wind * (1 - hit);
        const strike = hit * (1 - back);
        arm.rx = THREE.MathUtils.lerp(arm.rx, 1.75, raise);
        arm.rx = THREE.MathUtils.lerp(arm.rx, -1.15, strike);
        arm.rz += 0.42 * raise - 0.30 * strike;
        fore.rx = THREE.MathUtils.lerp(fore.rx, -1.5, raise);
        fore.rx = THREE.MathUtils.lerp(fore.rx, -0.22, strike);
        body.ry += 0.40 * raise - 0.52 * strike;
        body.rx += -0.10 * strike;
        if (P.head) P.head.ry -= 0.3 * raise - 0.2 * strike;
      }
    }

    if (this.hurt > 0) {
      const h = this.hurt * this.hurt;
      body.rx -= 0.22 * h;
      if (P.head) P.head.rx -= 0.3 * h;
    }

    // Going down slackens everything toward a heap; the root tips over on `fall` in write().
    if (state === 'dead' || this.fall > 0.005) {
      const f = this.fall;
      for (const q of this.parts) { q.rx *= 1 - f; q.ry *= 1 - f; q.rz *= 1 - f; }
      for (const side of [-1, 1]) {
        const s = side > 0 ? '+' : '-';
        P['armU' + s].rz = side * 0.62 * f;
        P['armF' + s].rx = -0.5 * f;
        P['legU' + s].rx = 0.45 * f;
        P['legL' + s].rx = 0.7 * f;
      }
      if (P.head) P.head.rx = 0.4 * f;
    }

    this.write();
  }

  write() {
    const pool = this.pool;
    if (!pool.pa) return;
    if (!this.visible) { for (const q of this.parts) pool.hide(q.part); return; }

    _v.set(this.pos.x, this.pos.y + this.bob * this.scale, this.pos.z);
    _e.set(-this.fall * 1.35, this.yaw, 0);
    _q.setFromEuler(_e);
    _s.setScalar(this.scale);
    _m.compose(_v, _q, _s);

    for (let i = 0; i < this.parts.length; i++) {
      const q = this.parts[i];
      _e.set(q.rx, q.ry, q.rz);
      _q.setFromEuler(_e);
      _v.set(q.off[0], q.off[1] + q.dy, q.off[2]);
      _s.setScalar(1);
      _l.compose(_v, _q, _s);
      this.mats[i].multiplyMatrices(q.up < 0 ? _m : this.mats[q.up], _l);
      if (q.hidden && q.role !== this.weapon) pool.hide(q.part);
      else pool.write(q.part, this.mats[i]);
    }
  }

  // Where a bolt should leave from, or a swing should land. Valid after the first write().
  handPos(out = new THREE.Vector3()) {
    const q = this.byRole['armF+'];
    const i = this.parts.indexOf(q);
    return out.setFromMatrixPosition(this.mats[i]).add(_v.set(0, -0.2 * this.scale, 0));
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.82, this.pos.z);
  }
}

export function makeActor({ palette, variant = 'hero', scale = 1, pool = null, materials = null, rng = Math.random } = {}) {
  const p = pool || new ActorPool(materials);
  const actor = new Actor(p, partsFor(palette, variant, rng), scale);
  actor.object3D = p.object3D;
  actor.ownPool = !pool ? p : null;
  return actor;
}

export function makeActorPool(materials, opts) { return new ActorPool(materials, opts); }
