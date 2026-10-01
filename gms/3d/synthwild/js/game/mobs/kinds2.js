// M2 mobs. Every hostile action has a telegraph you can read at a glance on a phone.
import { rand, face, walkAnim, wanderTick } from './kinds.js';

// ---------------- Wireframe archer (skeleton) ----------------
export const AIM_TIME = 0.95;
export const AIM_LOCK = 0.3;   // the aim line freezes for the last 0.3 s: sidestep then
export const archer = {
  name: 'Wireframe Archer', hostile: true, hp: 18, speed: 2.3, w: 0.6, h: 1.9, eye: 1.7, knock: 1.1, step: 1,
  burns: true,
  init(m) { m.wt = 0; m.cool = rand(1, 2); m.aim = 0; m.strafe = 1; m.strafeT = 0; m.seen = 0; m.burn = 0; m.aimAt = { x: 0, y: 0, z: 0 }; },
  think(m, e) {
    m.wantX = m.wantZ = 0; m.moving = 0;
    m.cool -= e.dt;
    if (e.sunBurn(m)) return;
    const sees = e.dist < 24 && e.los();
    if (sees) m.seen = 5; else m.seen -= e.dt;
    if (m.aim > 0) {
      m.aim -= e.dt;
      face(m, e.player.x - m.pos.x, e.player.z - m.pos.z, e.dt, 10);
      if (m.aim > AIM_LOCK) { m.aimAt.x = e.player.x; m.aimAt.y = e.player.y + 1.1; m.aimAt.z = e.player.z; }
      if (m.aim <= 0) {
        const from = e.bowPos(m);
        const dx = m.aimAt.x - from.x, dy = m.aimAt.y - from.y, dz = m.aimAt.z - from.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        e.fire(m, from, { x: (dx / l) * 22, y: (dy / l) * 22, z: (dz / l) * 22 }, { dmg: 3, gravity: 0, src: 'archer' });
        e.ctx.audio?.sfx?.('archerFire', { pos: m.pos });
        m.cool = rand(1.5, 2.4);
      }
      return;
    }
    if (m.seen > 0 && e.dist < 30 && !e.player.dead) {
      if (m.cool <= 0 && sees && e.dist < 20) {
        m.aim = AIM_TIME;
        e.ctx.audio?.sfx?.('archerCharge', { pos: m.pos });
        return;
      }
      // Kite: back off when close, close in when far, strafe in between.
      if (e.dist < 7) m.moving = e.flee(m, this.speed);
      else if (e.dist > 14) m.moving = e.steer(m, this.speed);
      else {
        m.strafeT -= e.dt;
        if (m.strafeT <= 0) { m.strafe = -m.strafe; m.strafeT = rand(1.2, 2.6); }
        const dx = e.player.x - m.pos.x, dz = e.player.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        const sx = (-dz / l) * m.strafe, sz = (dx / l) * m.strafe;
        if (e.safe(m, sx, sz)) { m.wantX = sx * 1.6; m.wantZ = sz * 1.6; m.moving = 1.6; } else m.strafe = -m.strafe;
        face(m, dx, dz, e.dt, 8);
      }
    } else m.moving = wanderTick(m, e, 0.8);
  },
  drops: [{ key: 'pulse_charge', min: 0, max: 3 }, { key: 'lattice_rod', min: 0, max: 2 }],
  animate(m, dt, e) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 7 : 0);
    walkAnim(p.legs, m.phase, m.moving ? 0.5 : 0);
    const aiming = m.aim > 0;
    const w = aiming ? 1 - m.aim / AIM_TIME : 0;
    // Bow arm points at the target while aiming; the other draws the string back.
    p.arms[0].rotation.x = aiming || m.seen > 0 ? -1.45 : Math.sin(m.phase) * 0.3;
    p.arms[1].rotation.x = aiming ? -1.3 + w * 0.5 : Math.sin(m.phase + Math.PI) * 0.3;
    p.arms[1].rotation.y = aiming ? 0.5 : 0;
    p.torso.rotation.y = aiming ? 0.25 : 0;
    p.charge.scale.setScalar(aiming ? 0.15 + 0.6 * w : 0.01);
    const b = p.beam;
    b.visible = aiming;
    if (aiming) {
      const from = e.bowPos(m);
      const dx = m.aimAt.x - from.x, dy = m.aimAt.y - from.y, dz = m.aimAt.z - from.z;
      const len = Math.max(0.5, Math.hypot(dx, dy, dz) - 1.2);
      b.position.set(from.x, from.y, from.z);
      b.lookAt(m.aimAt.x, m.aimAt.y, m.aimAt.z);
      const locked = m.aim <= AIM_LOCK;
      const th = locked ? 0.07 : 0.025 + 0.02 * w;
      b.scale.set(th, th, len);
      b.material.opacity = locked ? (Math.floor(m.t * 24) % 2 ? 1 : 0.6) : 0.25 + 0.5 * w;
    }
    if (m.burn > 0 && m.flash <= 0) p.mat.userData.u.uFlash.value.set(1, 0.55, 0.15, Math.min(0.7, m.burn * 0.35));
  },
};

// ---------------- Swarm-leg spider ----------------
export const POUNCE_WINDUP = 0.35;
export const spider = {
  name: 'Swarm-leg Spider', hostile: true, hp: 14, speed: 3.1, w: 1.1, h: 0.85, eye: 0.6, knock: 1.2, step: 1,
  climb: true,
  init(m) { m.wt = 0; m.provoked = 0; m.crouch = 0; m.leap = 0; m.cool = 0; m.seen = 0; m.angry = false; },
  think(m, e) {
    m.wantX = m.wantZ = 0; m.moving = 0;
    m.provoked -= e.dt; m.cool -= e.dt;
    // Neutral in daylight unless you hit it; hostile at night and in the dark.
    m.angry = m.provoked > 0 || e.night || e.darkAt(m);
    if (m.crouch > 0) {
      m.crouch -= e.dt;
      face(m, e.player.x - m.pos.x, e.player.z - m.pos.z, e.dt, 12);
      if (m.crouch <= 0) {
        const dx = e.player.x - m.pos.x, dz = e.player.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        m.leapDir = { x: dx / l, z: dz / l };
        m.vel.y = 6;
        m.leap = 0.6; m.leapHit = false;
        e.ctx.audio?.sfx?.('spiderLeap', { pos: m.pos });
      }
      return;
    }
    if (m.leap > 0) {
      m.leap -= e.dt;
      m.wantX = m.leapDir.x * 6.5; m.wantZ = m.leapDir.z * 6.5; m.moving = 6;
      if (!m.leapHit && e.dist < 1.5) { m.leapHit = true; e.hurtPlayer(2, 'spider', m); }
      return;
    }
    const sees = e.dist < 18 && e.los();
    if (sees) m.seen = 4; else m.seen -= e.dt;
    if (m.angry && m.seen > 0 && !e.player.dead) {
      if (e.dist < 3.2 && m.onGround && m.cool <= 0) {
        m.crouch = POUNCE_WINDUP; m.cool = 1.5;
        e.ctx.audio?.sfx?.('spiderHiss', { pos: m.pos });
        return;
      }
      m.moving = e.steer(m, this.speed);
    } else m.moving = wanderTick(m, e, 1.1);
  },
  onHit(m) { m.provoked = 15; },
  drops: [{ key: 'silk_strand', min: 0, max: 2 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 14 : 0);
    p.legs.forEach((l, i) => { l.rotation.z = m.moving ? Math.sin(m.phase + (i % 2) * Math.PI + (i < 4 ? 0 : Math.PI / 2)) * 0.3 : 0; });
    const c = m.crouch > 0 ? 1 - m.crouch / POUNCE_WINDUP : 0;
    p.body.position.y = 0.5 - 0.2 * c + (m.moving ? Math.sin(m.phase * 2) * 0.02 : 0);
    p.body.rotation.x = -0.25 * c;
    // Eyes: dim amber when neutral, red when hunting, white-hot while crouched to pounce.
    if (c > 0) p.eyes.material.color.setRGB(1, 0.6 + 0.4 * c, 0.6 + 0.4 * c);
    else if (m.angry) p.eyes.material.color.setRGB(1, 0.08, 0.15);
    else p.eyes.material.color.setRGB(0.9, 0.55, 0.15);
    p.glow.material.color.copy(p.eyes.material.color);
    p.glow.scale.setScalar(c > 0 ? 0.6 + 1.4 * c : m.angry ? 0.55 : 0.25);
    if (c > 0 && m.flash <= 0) p.mat.userData.u.uFlash.value.set(1, 0.1, 0.15, 0.3 * c);
  },
};

// ---------------- Bioreactor bull (cow) ----------------
export const bull = {
  name: 'Bioreactor Bull', hostile: false, hp: 10, speed: 1.0, w: 0.9, h: 1.45, eye: 1.2, knock: 0.7, step: 1,
  init(m) { m.wt = rand(0, 2); m.panic = 0; m.graze = 0; },
  think(m, e) {
    m.wantX = m.wantZ = 0;
    if (m.panic > 0) {
      m.panic -= e.dt;
      let dx = m.pos.x - e.player.x, dz = m.pos.z - e.player.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (!e.safe(m, dx, dz)) { const t = dx; dx = -dz; dz = t; }
      if (e.safe(m, dx, dz)) { m.wantX = dx * 3; m.wantZ = dz * 3; face(m, dx, dz, e.dt, 8); }
      m.moving = 3;
    } else {
      m.moving = wanderTick(m, e, this.speed);
      if (!m.walking && m.graze <= 0 && Math.random() < e.dt * 0.3) m.graze = 2.5;
    }
    if (m.graze > 0) m.graze -= e.dt;
  },
  onHit(m) { m.panic = 3.5; m.graze = 0; },
  drops: [{ key: 'protein_gel', min: 1, max: 3 }, { key: 'fibre_mesh', min: 0, max: 2 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 4 + m.moving * 2 : 0);
    walkAnim(p.legs, m.phase, m.moving ? 0.45 : 0, 4);
    p.head.rotation.x = m.graze > 0 ? 0.7 + Math.sin(m.t * 8) * 0.05 : Math.sin(m.t * 0.7) * 0.05;
  },
};

// ---------------- Void linker (enderman) ----------------
export const SHIMMER = 0.6;
export const voidlinker = {
  name: 'Void Linker', hostile: true, hp: 28, speed: 3.0, w: 0.6, h: 2.9, eye: 2.6, knock: 0.6, step: 1,
  init(m) { m.wt = 0; m.stare = 0; m.shimmer = 0; m.act = null; m.provoked = 0; m.cool = 0; m.hopT = rand(8, 18); },
  think(m, e) {
    m.wantX = m.wantZ = 0; m.moving = 0;
    m.cool -= e.dt;
    if (m.shimmer > 0) {
      m.shimmer -= e.dt;
      if (m.shimmer <= 0) {
        const act = m.act; m.act = null;
        if (act === 'near') e.teleport(m, e.player, 2.2, 3.4);
        else if (act === 'away') e.teleport(m, m.pos, 8, 16);
        else if (act === 'hop') e.teleport(m, m.pos, 4, 9);
        else if (act === 'strike' && e.dist < 2.8 && Math.abs(e.dy) < 2.5) e.hurtPlayer(4, 'voidlinker', m);
      }
      return;
    }
    if (m.provoked <= 0) {
      m.moving = wanderTick(m, e, 0.8);
      m.hopT -= e.dt;
      if (m.hopT <= 0) { m.hopT = rand(10, 22); this.start(m, 'hop', e); return; }
      if (!e.player.dead && e.dist < 40 && e.lookingAt(m) && e.los()) {
        m.stare += e.dt;
        if (m.stare > 0.25) { m.provoked = 30; m.stare = 0; this.start(m, 'near', e); e.ctx.bus?.emit?.('mob:provoked', { kind: m.kind }); }
      } else m.stare = Math.max(0, m.stare - e.dt);
      return;
    }
    m.provoked -= e.dt;
    if (e.player.dead) { m.provoked = 0; return; }
    if (e.dist < 2.3 && m.cool <= 0) { m.cool = 1.4; this.start(m, 'strike', e, 0.4); return; }
    if (e.dist > 10 && Math.random() < e.dt * 0.7) { this.start(m, 'near', e); return; }
    m.moving = e.steer(m, this.speed);
  },
  start(m, act, e, t = SHIMMER) {
    m.act = act; m.shimmer = t; m.shimmerMax = t;
    e.ctx.audio?.sfx?.('voidShimmer', { pos: m.pos });
  },
  onHit(m, e) { m.provoked = 30; if (Math.random() < 0.45 && !m.act) { m.act = 'away'; m.shimmer = m.shimmerMax = 0.25; } },
  drops: [{ key: 'void_pearl', min: 0, max: 1 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 5 : 0);
    walkAnim(p.legs, m.phase, m.moving ? 0.4 : 0);
    p.arms[0].rotation.x = m.moving ? Math.sin(m.phase + Math.PI) * 0.25 : 0;
    p.arms[1].rotation.x = m.act === 'strike' ? -1.2 * (1 - m.shimmer / (m.shimmerMax || 1)) : m.moving ? Math.sin(m.phase) * 0.25 : 0;
    const angry = m.provoked > 0;
    p.eyeMat.color.setRGB(angry ? 1 : 0.78, angry ? 0.3 : 0.44, 1);
    p.head.rotation.x = m.stare > 0 ? -0.15 : 0;
    // Telegraph: static shimmer — jitter, flicker, a violet aura — before every teleport or strike.
    const s = m.shimmer > 0 ? 1 - m.shimmer / (m.shimmerMax || 1) : 0;
    const on = m.shimmer > 0 || m.stare > 0.05;
    if (on) {
      const j = 0.04 + 0.1 * s;
      p.torso.position.set((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j);
      p.root.scale.x = 1 + (Math.random() - 0.5) * 0.25 * (0.3 + s);
      if (m.flash <= 0) {
        const r = Math.random();
        p.mat.userData.u.uFlash.value.set(r < 0.5 ? 0.75 : 1, r < 0.5 ? 0.45 : 1, 1, (r < 0.3 ? 0.1 : 0.55) * (0.4 + s));
      }
      p.aura.scale.setScalar(1 + 2.4 * s + Math.random() * 0.3);
      p.aura.material.opacity = 0.5 + 0.5 * Math.random();
    } else {
      p.torso.position.set(0, 0, 0);
      p.root.scale.x = 1;
      p.aura.scale.setScalar(angry ? 0.7 : 0.01);
    }
  },
};

// ---------------- Gel-core (slime) ----------------
export const SQUASH = 0.4;
const GEL_W = [0, 0.5, 0.95, 1.5];
const GEL_HP = [0, 2, 8, 16];
const GEL_DMG = [0, 0, 2, 4];
export const gelcore = {
  name: 'Gel-core', hostile: true, hp: 16, speed: 2, w: 1.5, h: 1.5, eye: 0.6, knock: 1, step: 0.5,
  init(m, o = {}) {
    m.size = o.size ?? (Math.random() < 0.4 ? 3 : Math.random() < 0.6 ? 2 : 1);
    m.w = m.h = GEL_W[m.size];
    m.hp = GEL_HP[m.size];
    m.jumpT = rand(0.4, 1.4); m.squash = 0; m.hop = null; m.cool = 0; m.seen = 0;
    m.parts.body.scale.setScalar(m.w);
  },
  think(m, e) {
    m.wantX = m.wantZ = 0; m.moving = 0;
    m.cool -= e.dt;
    const sees = e.dist < 16 && e.los();
    if (sees) m.seen = 4; else m.seen -= e.dt;
    const aggro = m.seen > 0 && !e.player.dead;
    if (aggro && m.size > 1 && m.cool <= 0 && e.dist < m.w * 0.5 + 0.7 && e.dy > -m.h && e.dy < 1) {
      m.cool = 1;
      e.hurtPlayer(GEL_DMG[m.size], 'gelcore', m);
    }
    if (m.hop && !m.onGround) { m.wantX = m.hop.x; m.wantZ = m.hop.z; m.moving = 1; return; }
    m.hop = null;
    if (m.squash > 0) {
      m.squash -= e.dt;
      if (m.squash <= 0) {
        let dx, dz;
        if (aggro) { dx = e.player.x - m.pos.x; dz = e.player.z - m.pos.z; } else { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); }
        const l = Math.hypot(dx, dz) || 1;
        const sp = (aggro ? 2.6 : 1.4) + m.size * 0.4;
        if (!e.safe(m, dx / l, dz / l)) return;
        m.hop = { x: (dx / l) * sp, z: (dz / l) * sp };
        m.vel.y = 5 + m.size * 0.8;
        face(m, dx, dz, 1, 1);
        e.ctx.audio?.sfx?.('gelHop', { pos: m.pos, size: m.size });
      }
      return;
    }
    if (m.onGround) {
      m.jumpT -= e.dt * (aggro ? 1.6 : 1);
      if (m.jumpT <= 0) { m.jumpT = rand(0.9, 1.8); m.squash = SQUASH; }
    }
  },
  dropsFor(m) { return m.size === 1 ? [{ key: 'gel_bead', min: 0, max: 2 }] : []; },
  onDeath(m, mobs) {
    if (m.size <= 1) return;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const c = mobs.spawn('gelcore', m.pos.x + (Math.random() - 0.5) * m.w, m.pos.y + 0.2, m.pos.z + (Math.random() - 0.5) * m.w, { size: m.size - 1 });
      if (c) { c.vel.y = 4; c.kx = (Math.random() - 0.5) * 6; c.kz = (Math.random() - 0.5) * 6; c.seen = 4; }
    }
  },
  animate(m, dt) {
    const p = m.parts;
    const k = m.squash > 0 ? Math.sin((1 - m.squash / SQUASH) * Math.PI * 0.5) : 0;
    const air = !m.onGround ? Math.min(1, Math.abs(m.vel.y) / 6) : 0;
    const w = m.w;
    p.body.scale.set(w * (1 + 0.3 * k - 0.12 * air), w * (1 - 0.4 * k + 0.22 * air), w * (1 + 0.3 * k - 0.12 * air));
    p.nucleus.scale.setScalar(1 + 0.6 * k + Math.sin(m.t * 4) * 0.08);
    if (k > 0 && m.flash <= 0) p.mat.userData.u.uFlash.value.set(0.7, 1, 0.8, 0.35 * k);
  },
};

export const KINDS2 = { archer, spider, bull, voidlinker, gelcore };
