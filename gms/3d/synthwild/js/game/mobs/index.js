import { buildModel } from './models.js';
import './models2.js';
import { KINDS as K1, EMP_RADIUS } from './kinds.js';
import { KINDS2 } from './kinds2.js';
import { sweep, boxHitsSolid } from '../../player/physics.js';
import { lightAt, liquidAt, solidFn } from '../env.js';
import { segBox } from '../../core/math.js';
import { isMobile } from '../../core/quality.js';
import { dropsFor } from '../rules.js';
import { BLOCKS } from '../../data/blocks.js';

const KINDS = { ...K1, ...KINDS2 };
export const ALL_KINDS = KINDS;
const CAP_HOSTILE = 8;
const CAP_PASSIVE = isMobile ? 3 : 6;
const CAP_TOTAL = isMobile ? 10 : 16;
const DRAW_DIST = 56;
const LAND = ['forest', 'shore', 'desert', 'mountains', 'plains'];
// Weighted spawn tables. where: surface | cave. biomes: where on the surface it may appear.
const NIGHT_TABLE = [
  { kind: 'reboot', w: 30, biomes: LAND },
  { kind: 'glitchfuse', w: 20, biomes: LAND },
  { kind: 'archer', w: 22, biomes: LAND },
  { kind: 'spider', w: 16, biomes: ['forest', 'desert', 'mountains', 'plains'] },
  { kind: 'voidlinker', w: 5, biomes: LAND, max: 1 },
];
const CAVE_TABLE = [
  { kind: 'gelcore', w: 40 },
  { kind: 'reboot', w: 20 },
  { kind: 'archer', w: 15 },
  { kind: 'spider', w: 12 },
  { kind: 'glitchfuse', w: 10 },
];
const DAY_TABLE = [
  { kind: 'ibis', w: 5, biomes: ['forest', 'plains', 'shore'], group: [1, 3] },
  { kind: 'bull', w: 4, biomes: ['forest', 'plains'], group: [1, 3] },
];
const GRASSY = /photomoss|moss|turf|grass/;

function pick(table, ok) {
  const t = table.filter(ok);
  let r = Math.random() * t.reduce((a, b) => a + b.w, 0);
  for (const e of t) if ((r -= e.w) <= 0) return e;
  return t[t.length - 1] || null;
}
const DESPAWN = 72;
const GRAV = 24;

export class Mobs {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    this.T = ctx.THREE;
    this.list = [];
    this.pool = {};
    this.group = new this.T.Group();
    this.group.name = 'mobs';
    ctx.scene?.add(this.group);
    this.spawnT = 0;
    this.nextId = 1;
    this.solid = solidFn(() => ctx.world);
    this.tmpV = new this.T.Vector3();
    this.env = this.makeEnv();
    this.extra = new Set();   // minigame bots etc: { extraTarget:true, box(out), onHit(dmg, dir, src) }
  }

  get world() { return this.ctx.world; }

  count(filter) { return this.list.filter(filter).length; }

  spawn(kind, x, y, z, opts = {}) {
    const def = KINDS[kind];
    if (!def) return null;
    let parts = this.pool[kind]?.pop();
    if (!parts) parts = buildModel(this.T, kind);
    const m = {
      id: this.nextId++, kind, def, parts, pos: new this.T.Vector3(x, y, z), vel: new this.T.Vector3(),
      kx: 0, kz: 0, yaw: Math.random() * Math.PI * 2, hp: def.hp, onGround: false, inWater: false,
      invuln: 0, flash: 0, t: 0, phase: 0, wantX: 0, wantZ: 0, moving: 0, dying: 0, losT: 0, losV: false,
      tint: 1, lightT: 0, stuckT: 0, side: 0, drawY: y, w: def.w, h: def.h,
    };
    def.init(m, opts);
    this.unstick(m);
    m.drawY = m.pos.y;
    parts.root.visible = true;
    parts.root.rotation.set(0, m.yaw, 0);
    parts.root.scale.setScalar(1);
    this.group.add(parts.root);
    for (const o of parts.world || []) this.group.add(o);
    this.list.push(m);
    return m;
  }

  remove(m) {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(m.parts.root);
    for (const o of m.parts.world || []) { o.visible = false; this.group.remove(o); }
    m.parts.mat.userData.u.uFlash.value.w = 0;
    m.parts.body?.scale.setScalar(1);
    if (m.parts.ring) m.parts.ring.visible = m.parts.halo.visible = m.parts.glow.visible = false;
    (this.pool[m.kind] ||= []).push(m.parts);
    m.removed = true;
  }

  clear() { for (const m of [...this.list]) this.remove(m); }

  // After a respawn: hostiles near the respawn point vanish and the rest forget you (no death loops).
  calm(pos, r = 24) {
    for (const m of [...this.list]) {
      if (!m.def.hostile) continue;
      if (Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y, m.pos.z - pos.z) < r) { this.ctx.fx?.puff?.(m.pos.clone().setY(m.pos.y + 1), 0x9ffcff); this.remove(m); }
      else { m.seen = 0; m.provoked = 0; m.aim = 0; m.fusing = false; m.fuse = 0; }
    }
  }

  box(m, out = []) {
    const hw = m.w / 2;
    out[0] = m.pos.x - hw; out[1] = m.pos.y; out[2] = m.pos.z - hw;
    out[3] = m.pos.x + hw; out[4] = m.pos.y + m.h; out[5] = m.pos.z + hw;
    return out;
  }

  unstick(m) {
    const b = this.box(m);
    for (let i = 0; i < 32 && boxHitsSolid(this.solid, b); i++) { b[1] += 0.25; b[4] += 0.25; m.pos.y += 0.25; }
  }

  // Is walking one step in (dx,dz) safe: no drop deeper than 3 and no water (unless swimmer)?
  safe(m, dx, dz) {
    const x = m.pos.x + dx * (m.w / 2 + 0.35), z = m.pos.z + dz * (m.w / 2 + 0.35);
    const sx = Math.floor(x * 4), sz = Math.floor(z * 4);
    let sy = Math.floor((m.pos.y + 1.05) * 4);
    for (let k = 0; k < 20; k++, sy--) {
      if (!m.def.swim && liquidAt(this.world, x, sy / 4 + 0.01, z)) return false;
      if (this.solid(sx, sy, sz)) return k >= 1 || !!m.def.climb; // k = 0: a wall over 1 high
    }
    return false;
  }

  physics(m, dt) {
    const solid = this.solid;
    m.inWater = liquidAt(this.world, m.pos.x, m.pos.y + 0.3, m.pos.z);
    if (m.inWater && !m.def.swim) m.vel.y += (2.2 - m.vel.y) * Math.min(1, dt * 3);
    else if (m.def.climb && m.blocked && (m.wantX || m.wantZ)) m.vel.y = 3.2;
    else {
      m.vel.y = Math.max(m.vel.y - GRAV * dt, -40);
      if (m.def.flutter && m.vel.y < -m.def.flutter) m.vel.y = -m.def.flutter;
    }
    const k = Math.exp(-7 * dt);
    m.kx *= k; m.kz *= k;
    const dx = (m.wantX + m.kx) * dt, dz = (m.wantZ + m.kz) * dt, dy = m.vel.y * dt;
    const b = this.box(m);
    const my = sweep(solid, b, 1, dy);
    b[1] += my; b[4] += my;
    const wasGround = m.onGround;
    m.onGround = dy < 0 && my > dy + 1e-6;
    if (Math.abs(my - dy) > 1e-6) m.vel.y = 0;
    let blocked = false;
    for (const [ax, d] of [[0, dx], [2, dz]]) {
      if (!d) continue;
      const mv = sweep(solid, b, ax, d);
      if (Math.abs(mv - d) > 1e-6 && (m.onGround || wasGround)) {
        const t = b.slice();
        const up = sweep(solid, t, 1, m.def.step + 0.01);
        t[1] += up; t[4] += up;
        const mv2 = sweep(solid, t, ax, d);
        if (Math.abs(mv2) > Math.abs(mv) + 1e-4) {
          t[ax] += mv2; t[ax + 3] += mv2;
          const down = sweep(solid, t, 1, -up);
          t[1] += down; t[4] += down;
          for (let i = 0; i < 6; i++) b[i] = t[i];
          continue;
        }
      }
      if (Math.abs(mv - d) > 1e-6) blocked = true;
      b[ax] += mv; b[ax + 3] += mv;
    }
    m.pos.set((b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2);
    m.blocked = blocked;
  }

  makeEnv() {
    const self = this;
    const e = {
      dt: 0, player: { x: 0, y: 0, z: 0, eyeY: 0, dead: false }, dist: 99, dy: 0, game: this.game, ctx: this.ctx, coolMul: 1,
      m: null, daylight: 1, night: false,
      safe: (m, dx, dz) => self.safe(m, dx, dz),
      los: () => {
        const m = e.m;
        if (m.losT > 0) return m.losV;
        m.losT = 0.25 + Math.random() * 0.1;
        const w = self.world;
        const ox = m.pos.x, oy = m.pos.y + m.def.eye, oz = m.pos.z;
        const dx = e.player.x - ox, dy = e.player.eyeY - oy, dz = e.player.z - oz;
        const d = Math.hypot(dx, dy, dz);
        if (!w?.raycast || d < 0.5) return (m.losV = true);
        const hit = w.raycast([ox, oy, oz], [dx / d, dy / d, dz / d], d);
        return (m.losV = !hit || hit.dist >= d - 0.4);
      },
      // Head toward the player; sidestep around walls and drops. Returns the speed actually used.
      steer: (m, speed) => {
        let dx = e.player.x - m.pos.x, dz = e.player.z - m.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        if (m.side) {
          m.sideT -= e.dt;
          const s = m.side;
          [dx, dz] = [dx * 0.3 - dz * s, dz * 0.3 + dx * s];
          if (m.sideT <= 0) m.side = 0;
        }
        if (!self.safe(m, dx, dz)) {
          if (!m.side) { m.side = Math.random() < 0.5 ? 1 : -1; m.sideT = 0.8; }
          return 0;
        }
        if (m.blocked) {
          m.stuckT += e.dt;
          if (m.stuckT > 0.5 && !m.side) { m.side = Math.random() < 0.5 ? 1 : -1; m.sideT = 1; m.stuckT = 0; }
        } else m.stuckT = 0;
        m.wantX = dx * speed; m.wantZ = dz * speed;
        const want = Math.atan2(dx, dz);
        let a = want - m.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        m.yaw += a * Math.min(1, 8 * e.dt);
        return speed;
      },
      sunlit: (m) => {
        if (self.game.minigame || e.night || e.daylight < 0.5) return false;
        return lightAt(self.world, m.pos.x, m.pos.y + m.h - 0.1, m.pos.z).sky >= 14 && !m.inWater;
      },
      hurtPlayer: (amount, src, m) => {
        if (e.usingTarget) return m.target.hurt?.(amount, src, m);
        const dir = self.tmpV.set(e.player.x - m.pos.x, 0, e.player.z - m.pos.z).normalize();
        self.game.hurtPlayer(amount, src, { x: dir.x * 6, y: 4, z: dir.z * 6 });
      },
      explode: (m) => self.explode(m),
      // Steer straight away from the player (kiting).
      flee: (m, speed) => {
        let dx = m.pos.x - e.player.x, dz = m.pos.z - e.player.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (!self.safe(m, dx, dz)) { const t = dx; dx = -dz; dz = t; if (!self.safe(m, dx, dz)) return 0; }
        m.wantX = dx * speed; m.wantZ = dz * speed;
        let a = Math.atan2(-dx, -dz) - m.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        m.yaw += a * Math.min(1, 8 * e.dt);
        return speed;
      },
      darkAt: (m) => {
        const L = lightAt(self.world, m.pos.x, m.pos.y + 0.5, m.pos.z);
        return Math.max(L.sky * e.daylight, L.block) < 8;
      },
      // Is the player's crosshair on this mob's upper body?
      lookingAt: (m) => {
        const d = e.player.dir;
        if (!d) return false;
        const tx = m.pos.x - e.player.x, ty = m.pos.y + m.h * 0.8 - e.player.eyeY, tz = m.pos.z - e.player.z;
        const l = Math.hypot(tx, ty, tz) || 1;
        return (tx * d.x + ty * d.y + tz * d.z) / l > Math.cos(Math.max(0.05, Math.atan2(0.6, l)));
      },
      teleport: (m, c, rMin, rMax) => self.teleport(m, c, rMin, rMax),
      bowPos: (m) => ({ x: m.pos.x + Math.sin(m.yaw) * 0.45, y: m.pos.y + 1.35, z: m.pos.z + Math.cos(m.yaw) * 0.45 }),
      fire: (m, from, vel, o) => self.game.projectiles?.fire(from, vel, { owner: 'mob', mob: m, ...o, extraTarget: e.usingTarget ? m.target : null }),
      // Shared sun burn (reboot, archer). Returns true once it has burned out.
      sunBurn: (m) => {
        if (e.sunlit(m)) {
          m.burn += e.dt;
          if (Math.random() < e.dt * 14) self.ctx.fx?.spark?.(m.pos.clone().setY(m.pos.y + Math.random() * m.h), 0xffaa33, 3);
          if (m.burn > 2.2) { e.burnOut(m); return true; }
        } else m.burn = Math.max(0, m.burn - e.dt);
        return false;
      },
      burnOut: (m) => {
        const fx = self.ctx.fx;
        for (let i = 0; i < 4; i++) fx?.spark?.(m.pos.clone().setY(m.pos.y + 0.4 * i + 0.2), 0xffb347, 10);
        fx?.puff?.(m.pos.clone().setY(m.pos.y + 1), 0x555555);
        self.ctx.audio?.sfx?.('burnout', { pos: m.pos });
        self.remove(m);
      },
    };
    return e;
  }

  explode(m) {
    const ctx = this.ctx, g = this.game;
    const c = m.pos.clone().setY(m.pos.y + 0.9);
    ctx.fx?.emp?.(c, EMP_RADIUS);
    ctx.audio?.sfx?.('emp', { pos: c });
    ctx.bus?.emit?.('mob:explode', { kind: m.kind, pos: c, radius: EMP_RADIUS });
    if (m.target?.box) {
      const b = m.target.box, tx = Math.max(b[0], Math.min(b[3], c.x)), ty = Math.max(b[1], Math.min(b[4], c.y)), tz = Math.max(b[2], Math.min(b[5], c.z));
      const td = Math.hypot(tx - c.x, ty - c.y, tz - c.z);
      if (td < EMP_RADIUS) m.target.hurt?.(Math.max(1, Math.round(13 * (1 - td / EMP_RADIUS))), 'glitchfuse', m);
    }
    const p = this.env.realPlayer || this.env.player;
    const dx = p.x - c.x, dy = p.y + 0.9 - c.y, dz = p.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < EMP_RADIUS && !p.dead) {
      const f = 1 - d / EMP_RADIUS;
      const l = Math.hypot(dx, dz) || 1;
      g.hurtPlayer(Math.max(1, Math.round(13 * f)), 'glitchfuse', { x: (dx / l) * 14 * f + (dx / l) * 3, y: 5 + 5 * f, z: (dz / l) * 14 * f + (dz / l) * 3 });
    }
    for (const o of this.list) {
      if (o === m) continue;
      const od = o.pos.distanceTo(c);
      if (od < EMP_RADIUS) this.hit(o, Math.round(12 * (1 - od / EMP_RADIUS)), this.tmpV.subVectors(o.pos, c), 'emp');
    }
    if (ctx.settings?.get?.('mobGrief') && ctx.world?.setBox) {
      const x = Math.floor(c.x), y = Math.floor(m.pos.y), z = Math.floor(c.z);
      const S = 4;
      const boxes = [[[x - 1, y - 1, z - 1], [x + 2, y + 2, z + 2]], [[x - 2, y, z - 1], [x + 3, y + 2, z + 2]], [[x - 1, y, z - 2], [x + 2, y + 2, z + 3]]];
      for (const [a, b] of boxes) {
        const minSub = a.map((v) => v * S), maxSub = b.map((v) => v * S);
        const res = ctx.world.setBox(minSub, maxSub, 0, 'fill', { src: 'emp' });
        if (res?.changed) ctx.bus?.emit?.('block:break', { minSub, maxSub, removed: res.removed, pos: c, src: 'emp' });
      }
    }
    this.remove(m);
  }

  // Jump to a free standing spot rMin..rMax from c. Returns true on success.
  teleport(m, c, rMin, rMax) {
    const fx = this.ctx.fx;
    const from = m.pos.clone();
    const b = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      for (let dy = 3; dy >= -4; dy--) {
        const y = Math.floor(c.y) + dy;
        if (!this.solid(Math.floor(x * 4), y * 4 - 1, Math.floor(z * 4))) continue;
        m.pos.set(x, y, z);
        if (boxHitsSolid(this.solid, this.box(m, b)) || liquidAt(this.world, x, y + 0.2, z)) { m.pos.copy(from); continue; }
        m.drawY = y; m.vel.set(0, 0, 0); m.kx = m.kz = 0;
        fx?.puff?.(from.setY(from.y + 1.2), 0x9b5cff);
        fx?.puff?.(m.pos.clone().setY(y + 1.2), 0x9b5cff);
        this.ctx.audio?.sfx?.('voidTeleport', { pos: m.pos });
        return true;
      }
    }
    return false;
  }

  // Ray vs mob boxes (padded a little so touch players can land hits).
  raycast(origin, dir, maxDist = 3) {
    const o = Array.isArray(origin) ? origin : [origin.x, origin.y, origin.z];
    const d = Array.isArray(dir) ? dir : [dir.x, dir.y, dir.z];
    let best = null;
    const b = [];
    for (const m of this.list) {
      if (m.dying) continue;
      const t = segBox(o, d, maxDist, this.box(m, b), 0.12);
      if (t >= 0 && (!best || t < best.dist)) best = { mob: m, dist: t };
    }
    for (const x of this.extra) {
      if (x.hidden) continue;
      const t = segBox(o, d, maxDist, x.box(b), 0.15);
      if (t >= 0 && (!best || t < best.dist)) best = { mob: x, dist: t };
    }
    return best;
  }

  hit(m, dmg, dir, src = 'player') {
    if (m?.extraTarget) return m.onHit?.(dmg, dir, src) !== false;
    if (!m || m.dying || m.removed || m.invuln > 0) return false;
    m.hp -= dmg;
    m.invuln = 0.45;
    m.flash = 0.22;
    const dx = dir?.x ?? dir?.[0] ?? 0, dz = dir?.z ?? dir?.[2] ?? 0;
    const l = Math.hypot(dx, dz) || 1;
    const kb = 7 * (m.def.knock ?? 1);
    m.kx = (dx / l) * kb; m.kz = (dz / l) * kb;
    if (m.onGround) m.vel.y = 5;
    m.seen = 6;
    if (m.def.onHit) m.def.onHit(m, this.env);
    if (m.kind === 'glitchfuse' && src === 'player') { m.fuse = 0; m.fusing = false; }
    this.ctx.fx?.spark?.(m.pos.clone().setY(m.pos.y + m.h * 0.6), 0xffffff, 8);
    this.ctx.audio?.sfx?.('mobHit', { pos: m.pos, kind: m.kind });
    this.ctx.bus?.emit?.('mob:hit', { kind: m.kind, dmg, src, id: m.id });
    if (m.hp <= 0) this.kill(m, src);
    return true;
  }

  kill(m, src) {
    m.dying = 0.5;
    m.wantX = m.wantZ = 0;
    const pos = m.pos.clone().setY(m.pos.y + 0.4);
    this.ctx.fx?.puff?.(pos, m.def.hostile ? 0x9ffcff : 0xffffff);
    this.ctx.audio?.sfx?.('mobDeath', { pos, kind: m.kind });
    if (src === 'player' || src === 'emp') {
      const table = m.def.dropsFor ? m.def.dropsFor(m) : m.def.drops;
      for (const d of dropsFor([null, { key: m.kind, drops: table, hardness: 0 }], 1, 64, null)) {
        if (d.n >= 1) this.game.drops?.spawnItem(d.key ?? d.id, Math.round(d.n), pos.x, pos.y, pos.z);
      }
    }
    m.def.onDeath?.(m, this, src);
    this.ctx.bus?.emit?.('mob:death', { kind: m.kind, pos, src });
  }

  // Ambient spawning near the player: surface by night/dark, passives by day, and caves at any time.
  spawnTick(p, settings, sky) {
    const ctx = this.ctx, w = this.world;
    if (!w?.surfaceY) return;
    const build = ctx.session?.mode === 'build';
    if (build && !settings.get('buildMobs')) return;
    const D = this.game.diff || { hostiles: true, capHostile: CAP_HOSTILE, spawnRate: 0.22 };
    const peaceful = settings.get('peaceful') || build || !D.hostiles;
    const night = !settings.get('alwaysDay') && (sky?.isNight ?? false);
    const daylight = settings.get('alwaysDay') ? 1 : sky?.daylight01 ?? 1;
    const N1 = night && this.game.firstNight && D.firstNight;
    const capH = N1 ? N1.capHostile : D.capHostile;
    const rate = N1 ? N1.spawnRate : D.spawnRate;
    if (this.list.length >= CAP_TOTAL) return;
    const hostiles = this.count((m) => m.def.hostile && !m.cave);
    const caveHostiles = this.count((m) => m.def.hostile && m.cave);
    const passive = this.list.length - hostiles - caveHostiles;
    const a = Math.random() * Math.PI * 2;
    const cave = Math.random() < 0.4;
    const r = (cave ? 10 : 16) + Math.random() * 20;
    const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, z = Math.floor(p.z + Math.sin(a) * r) + 0.5;
    if (w.isReady && !w.isReady(x, z)) return;
    const top = w.surfaceY(x, z);
    if (!(top > 0)) return;
    const can = (e) => !e.max || this.count((m) => m.kind === e.kind) < e.max;

    if (cave) {
      if (peaceful || caveHostiles >= capH || Math.random() > rate * 2) return;
      const y = this.caveSpot(x, z, top, p);
      if (y == null) return;
      const e = pick(CAVE_TABLE, can);
      const m = e && this.spawn(e.kind, x, y, z);
      if (m) m.cave = true;
      if (m && m.pos.y - y > 0.6) this.remove(m);   // didn't fit in the pocket
      return;
    }
    const y = top;
    const ground = w.blockAt ? w.blockAt(x, y - 0.1, z) : 1;
    if (BLOCKS[ground]?.cutout || liquidAt(w, x, y + 0.1, z)) return;
    const biome = w.biomeAt?.(x, z) || 'forest';
    const L = lightAt(w, x, y + 0.5, z);
    if (!peaceful && hostiles < capH) {
      const dark = L.block < 7 && (night || L.sky < 5);
      if (dark && Math.random() < rate) {
        const e = pick(NIGHT_TABLE, (t) => can(t) && t.biomes.includes(biome) && (!N1?.kinds || N1.kinds.includes(t.kind)));
        if (e) this.spawn(e.kind, x, y, z);
        return;
      }
    }
    if (passive < CAP_PASSIVE && daylight > 0.4 && L.sky >= 12 && Math.random() < 0.25) {
      if (!GRASSY.test(BLOCKS[ground]?.key || '')) return;
      const e = pick(DAY_TABLE, (t) => t.biomes.includes(biome));
      if (!e) return;
      const n = e.group[0] + Math.floor(Math.random() * (e.group[1] - e.group[0] + 1));
      for (let i = 0; i < n && this.list.length < CAP_TOTAL; i++) this.spawn(e.kind, x + Math.random() - 0.5, y, z + Math.random() - 0.5);
    }
  }

  // A dark air pocket with a floor, below the surface and away from the player. Returns feet y or null.
  caveSpot(x, z, top, p) {
    const w = this.world;
    const start = Math.min(Math.floor(top) - 6, Math.floor(p.y) + 8);
    const floor = Math.max(4, Math.floor(p.y) - 16);
    const sx = Math.floor(x * 4), sz = Math.floor(z * 4);
    for (let tries = 0; tries < 3; tries++) {
      if (start <= floor) return null;
      let y = Math.floor(floor + Math.random() * (start - floor));
      for (let k = 0; k < 14 && y > 2; k++, y--) {
        if (this.solid(sx, y * 4, sz) || this.solid(sx, y * 4 + 4, sz) || !this.solid(sx, y * 4 - 1, sz)) continue;
        if (liquidAt(w, x, y + 0.2, z)) continue;
        const L = lightAt(w, x, y + 0.5, z);
        if (L.block >= 7 || L.sky >= 4) continue;
        if (Math.hypot(x - p.x, y - p.y, z - p.z) < 10) continue;
        return y;
      }
    }
    return null;
  }

  update(dt, p, settings, sky) {
    const e = this.env;
    e.dt = dt;
    e.coolMul = this.game.diff?.cooldown ?? 1;
    e.player.x = p.x; e.player.y = p.y; e.player.z = p.z; e.player.eyeY = p.y + 1.62; e.player.dead = p.dead; e.player.dir = p.dir || null;
    e.night = !settings.get('alwaysDay') && (sky?.isNight ?? false);
    e.daylight = settings.get('alwaysDay') ? 1 : sky?.daylight01 ?? 1;
    const build = this.ctx.session?.mode === 'build';
    const noHostile = !this.game.minigame && (settings.get('peaceful') || (build && !settings.get('buildMobs')) || this.game.diff?.hostiles === false);
    const noMobs = build && !settings.get('buildMobs');

    this.spawnT -= dt;
    if (this.spawnT <= 0 && !this.game.minigame) { this.spawnT = 0.5; this.spawnTick(p, settings, sky); }

    for (const m of [...this.list]) {
      if (m.removed) continue;
      const dx = m.pos.x - p.x, dz = m.pos.z - p.z;
      const far = Math.hypot(dx, dz);
      if (far > DESPAWN || (noHostile && m.def.hostile) || (noMobs)) { this.remove(m); continue; }
      if (this.world?.isReady && !this.world.isReady(m.pos.x, m.pos.z)) { m.parts.root.visible = false; continue; }
      m.parts.root.visible = far < DRAW_DIST;
      m.t += dt;
      m.invuln = Math.max(0, m.invuln - dt);
      m.losT -= dt;
      if (m.dying) {
        m.dying -= dt;
        const k = Math.max(0, m.dying / 0.5);
        m.parts.root.rotation.z = (1 - k) * 1.4;
        m.parts.root.scale.setScalar(0.4 + 0.6 * k);
        m.parts.mat.userData.u.uFlash.value.set(1, 1, 1, 0.8 * (1 - k));
        if (m.dying <= 0) this.remove(m);
        continue;
      }
      e.m = m;
      // Siege mobs go for their target (the core) unless the player is close.
      e.usingTarget = false;
      if (m.target && !(far < (m.target.aggro ?? 6) && !p.dead)) {
        const b = m.target.box;
        const tx = b ? Math.max(b[0], Math.min(b[3], m.pos.x)) : m.target.x;
        const ty = b ? Math.max(b[1], Math.min(b[4] - 1, m.pos.y)) : m.target.y;
        const tz = b ? Math.max(b[2], Math.min(b[5], m.pos.z)) : m.target.z;
        e.realPlayer = e.player;
        e.player = { x: tx, y: ty, z: tz, eyeY: ty + 1, dead: false, dir: null };
        e.usingTarget = true;
      }
      e.dist = Math.hypot(e.player.x - m.pos.x, e.player.y - m.pos.y, e.player.z - m.pos.z);
      e.dy = e.player.y - m.pos.y;
      if (far < 48 || m.target) m.def.think(m, e);
      if (e.usingTarget) { e.player = e.realPlayer; e.realPlayer = null; e.usingTarget = false; }
      if (m.removed) continue;
      this.physics(m, dt);
      if (m.pos.y < -10) { this.remove(m); continue; }
      this.draw(m, dt);
    }
  }

  draw(m, dt) {
    const parts = m.parts;
    m.lightT -= dt;
    if (m.lightT <= 0) {
      m.lightT = 0.4;
      const L = lightAt(this.world, m.pos.x, m.pos.y + m.h * 0.7, m.pos.z);
      const sky = L.sky * (0.18 + 0.82 * this.env.daylight);
      m.tint = 0.32 + 0.68 * Math.max(sky, L.block) / 15;
    }
    const u = parts.mat.userData.u;
    u.uTint.value.setScalar(m.tint);
    m.flash = Math.max(0, m.flash - dt);
    if (m.flash > 0) u.uFlash.value.set(1, 1, 1, Math.min(1, m.flash / 0.22) * 0.85);
    else u.uFlash.value.w = 0;
    m.def.animate(m, dt, this.env);
    // Smooth the visual over step-ups so a 1-block climb doesn't pop.
    m.drawY = m.pos.y > m.drawY ? m.drawY + Math.min(m.pos.y - m.drawY, dt * 6) : m.pos.y;
    parts.root.position.set(m.pos.x, m.drawY, m.pos.z);
    parts.root.rotation.y = m.yaw;
  }

  serialize() { return null; }
}
