// Item pickups (two instanced meshes: block cubes and item gems) and Memory Cache beacons.
import { solidFn } from './env.js';

const CAP = 128;
const MAGNET = 2.4;
const GRAB = 0.75;
const LIFETIME = 300;

export class Drops {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    const T = (this.T = ctx.THREE);
    this.list = [];
    this.caches = [];
    this.group = new T.Group();
    this.group.name = 'drops';
    ctx.scene?.add(this.group);
    const mat = new T.MeshBasicMaterial({ vertexColors: false });
    this.cubes = this.makeInst(new T.BoxGeometry(0.25, 0.25, 0.25), mat);
    this.gems = this.makeInst(new T.OctahedronGeometry(0.16), new T.MeshBasicMaterial());
    this.m4 = new T.Matrix4();
    this.q = new T.Quaternion();
    this.e = new T.Euler();
    this.v = new T.Vector3();
    this.s = new T.Vector3();
    this.col = new T.Color();
    this.solid = solidFn(() => ctx.world);
  }

  makeInst(geo, mat) {
    const T = this.T;
    // Faces shaded by baking a light gradient into a vertex colour attribute, multiplied by instance colour.
    const n = geo.attributes.normal, c = [];
    for (let i = 0; i < n.count; i++) {
      const y = n.getY(i), x = n.getX(i);
      const k = y > 0.5 ? 1 : y < -0.5 ? 0.55 : x > 0.3 ? 0.85 : x < -0.3 ? 0.7 : 0.78;
      c.push(k, k, k);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    mat.vertexColors = true;
    const im = new T.InstancedMesh(geo, mat, CAP);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.setColorAt(0, new T.Color(1, 1, 1));
    this.group.add(im);
    return im;
  }

  // id: item id or key. n may be fractional (fine-grid breaks).
  spawnItem(idOrKey, n, x, y, z, vel = null) {
    const items = this.game.items;
    const it = items.get(idOrKey);
    if (!it || !(n > 0)) return null;
    if (this.list.length >= CAP * 2) this.list.shift();
    const d = {
      id: it.id, n, item: it, x, y, z,
      vx: vel ? vel.x : (Math.random() - 0.5) * 2.5, vy: vel ? vel.y : 3 + Math.random() * 1.5, vz: vel ? vel.z : (Math.random() - 0.5) * 2.5,
      age: 0, delay: 0.35, spin: Math.random() * 6, gem: it.kind !== 'block',
    };
    this.list.push(d);
    return d;
  }

  onBreak(ev) {
    if (this.game.creative) return;
    const { minSub, maxSub, removed } = ev;
    if (!removed?.length) return;
    const held = this.game.inv.held();
    const cx = (minSub[0] + maxSub[0]) / 8, cy = (minSub[1] + maxSub[1]) / 8, cz = (minSub[2] + maxSub[2]) / 8;
    for (const r of removed) {
      for (const dr of this.game.dropsFor(r.mat, r.count, ev.src === 'emp' ? null : held)) {
        if (ev.src === 'emp' && Math.random() < 0.5) continue;
        this.spawnItem(dr.key ?? dr.id, dr.n, cx, cy, cz);
      }
    }
  }

  update(dt, p, inv) {
    const solid = this.solid;
    const px = p.x, py = p.y + 0.8, pz = p.z;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      if (d.age > LIFETIME) { this.list.splice(i, 1); continue; }
      const dx = px - d.x, dy = py - d.y, dz = pz - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.age > d.delay && !p.dead && dist < MAGNET) {
        if (dist < GRAB) {
          const left = d.dur != null ? (inv.addSlot({ id: d.id, n: 1, f: 0, dur: d.dur }) ? 1 : 0) : inv.add(d.id, d.n);
          const got = d.n - left;
          if (got > 1e-6) {
            this.ctx.bus?.emit?.('item:pickup', { id: d.id, n: got });
            this.ctx.audio?.sfx?.('pickup');
          }
          if (left <= 1e-6) { this.list.splice(i, 1); continue; }
          d.n = left;
          d.delay = d.age + 2;
        } else {
          const k = (1 - dist / MAGNET) * 22 + 4;
          d.vx += (dx / dist) * k * dt; d.vy += (dy / dist) * k * dt; d.vz += (dz / dist) * k * dt;
          d.vx *= 0.9; d.vy *= 0.9; d.vz *= 0.9;
          d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
          continue;
        }
      }
      d.vy = Math.max(d.vy - 18 * dt, -20);
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt;
      const S = (x, y, z) => solid(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4));
      if (!S(nx, d.y, d.z)) d.x = nx; else d.vx *= -0.3;
      if (!S(d.x, d.y, nz)) d.z = nz; else d.vz *= -0.3;
      if (S(d.x, ny - 0.13, d.z) && d.vy < 0) {
        d.y = Math.floor((ny - 0.13) * 4 + 1) / 4 + 0.13;
        d.vy = 0;
        d.vx *= Math.exp(-8 * dt); d.vz *= Math.exp(-8 * dt);
      } else if (S(d.x, ny + 0.13, d.z) && d.vy > 0) d.vy = 0;
      else d.y = ny;
    }
    this.draw(dt);
    this.updateCaches(dt, p, inv);
  }

  draw(dt) {
    let nc = 0, ng = 0;
    const t = performance.now() / 1000;
    for (const d of this.list) {
      const im = d.gem ? this.gems : this.cubes;
      const idx = d.gem ? ng++ : nc++;
      if (idx >= CAP) continue;
      const sc = d.item.kind === 'block' ? Math.min(1.4, 0.6 + Math.cbrt(d.n) * 0.4) : 1;
      this.e.set(0.35, t * 1.6 + d.spin, 0);
      this.q.setFromEuler(this.e);
      this.v.set(d.x, d.y + 0.06 + Math.sin(t * 3 + d.spin) * 0.06, d.z);
      this.s.setScalar(sc);
      this.m4.compose(this.v, this.q, this.s);
      im.setMatrixAt(idx, this.m4);
      const c = d.item.color;
      im.setColorAt(idx, this.col.setRGB(c[0], c[1], c[2], this.T.SRGBColorSpace));
    }
    this.cubes.count = Math.min(nc, CAP);
    this.gems.count = Math.min(ng, CAP);
    for (const im of [this.cubes, this.gems]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.list.length = 0;
    for (const c of this.caches) this.group.remove(c.obj);
    this.caches.length = 0;
    this.draw(0);
  }

  // ---------- Memory Cache beacons ----------
  makeCacheObj() {
    const T = this.T;
    const g = new T.Group();
    const glow = (c, o = 1) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: T.DoubleSide });
    const core = new T.Mesh(new T.OctahedronGeometry(0.32), new T.MeshBasicMaterial({ color: 0xff7be0, toneMapped: false }));
    core.position.y = 1;
    const shell = new T.Mesh(new T.OctahedronGeometry(0.5), glow(0x5ff7ff, 0.35));
    shell.position.y = 1;
    const beam = new T.Mesh(new T.CylinderGeometry(0.12, 0.3, 40, 8, 1, true), glow(0xff7be0, 0.28));
    beam.position.y = 20;
    const ring = new T.Mesh(new T.RingGeometry(0.6, 0.75, 32), glow(0x5ff7ff, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(core, shell, beam, ring);
    g.userData = { core, shell, ring };
    return g;
  }

  addCache(pos, slots, id = null) {
    const obj = this.makeCacheObj();
    obj.position.set(pos.x, pos.y, pos.z);
    this.group.add(obj);
    const c = { id: id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      pos: { x: pos.x, y: pos.y, z: pos.z }, slots, obj, t: 0, cool: 0 };
    this.caches.push(c);
    this.ctx.bus?.emit?.('cache:drop', { id: c.id, pos: c.pos, count: slots.length });
    return c;
  }

  updateCaches(dt, p, inv) {
    for (let i = this.caches.length - 1; i >= 0; i--) {
      const c = this.caches[i];
      c.t += dt;
      const u = c.obj.userData;
      u.core.rotation.y += dt * 1.5;
      u.shell.rotation.y -= dt * 0.8;
      u.core.position.y = u.shell.position.y = 1 + Math.sin(c.t * 2) * 0.12;
      u.ring.scale.setScalar(1 + (c.t % 1.5) * 0.8);
      u.ring.material.opacity = 0.7 * (1 - (c.t % 1.5) / 1.5);
      c.cool -= dt;
      if (p.dead || c.cool > 0) continue;
      const d = Math.hypot(p.x - c.pos.x, p.y - c.pos.y, p.z - c.pos.z);
      if (d < 1.6) {
        c.slots = c.slots.map((s) => inv.addSlot(s)).filter(Boolean);
        if (!c.slots.length) {
          this.group.remove(c.obj);
          this.caches.splice(i, 1);
          this.ctx.bus?.emit?.('cache:recovered', { id: c.id });
          this.ctx.audio?.sfx?.('cache');
        } else c.cool = 2;
      }
    }
  }

  serializeCaches() {
    return this.caches.map((c) => ({ id: c.id, pos: c.pos, slots: c.slots }));
  }
  loadCaches(list) {
    for (const c of this.caches) this.group.remove(c.obj);
    this.caches.length = 0;
    for (const c of list || []) this.addCache(c.pos, c.slots, c.id);
  }
}
