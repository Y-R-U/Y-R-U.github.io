// A fighter is a platformer body that drives a ragdoll through pose muscles. When a hit
// is big enough the muscles cut, the body stops being a platformer and IS the ragdoll,
// and it hands control back on get-up.

import { Ragdoll, P, NPTS, BONE } from './ragdoll.js';
import { fk, sample, POSE } from './poses.js';
import { GRAVITY } from './config.js';

export const STRIKES = {
  jab:  { anim: 'jab',  dmg: 7.0, kb: 190, reach: 30, pt: P.HAND_R, stagger: 0.22, sfx: 'hit', p: 0.35 },
  hook: { anim: 'hook', dmg: 10,  kb: 300, reach: 32, pt: P.HAND_R, stagger: 0.34, sfx: 'hit', p: 0.6 },
  kick: { anim: 'kick', dmg: 13,  kb: 440, reach: 34, pt: P.FOOT_R, stagger: 0.55, sfx: 'heavy', p: 0.9 },
};
const COMBO_CHAIN = ['jab', 'hook', 'kick'];

let UID = 1;

export class Fighter {
  constructor(o) {
    this.id = UID++;
    this.isPlayer = !!o.isPlayer;
    this.name = o.name || 'FIGHTER';
    this.rank = o.rank;
    this.scale = o.scale || 1;
    this.seed = (Math.random() * 1e6) | 0;
    this.maxHp = o.hp || 100;
    this.hp = this.maxHp;
    this.dmgMul = o.dmg != null ? o.dmg / 8 : 1;
    this.baseDmg = o.dmg || 8;
    this.speed = o.speed || 200;
    this.jumpV = o.jump || 640;
    this.skill = o.skill ?? 0.5;
    this.mass = o.mass || 1;
    this.moveCount = o.moves || 2;
    this.boss = !!o.boss;
    this.stats = o.stats || null;      // player derive() output

    this.x = o.x || 0;
    this.y = o.y || 0;                  // pelvis height above ground handled by stand
    this.vx = 0; this.vy = 0;
    this.facing = o.facing || 1;
    this.onGround = true;

    this.rag = new Ragdoll(this.scale);
    this.anim = 'guard';
    this.animT = 0;
    this.spin = 0;
    this.mode = 'live';                 // live | stagger | down | getup | dead
    this.gain = 1;
    this.staggerT = 0;
    this.downT = 0;
    this.getupT = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.blocking = false;
    this.guardBroken = 0;
    this.duckDrop = 0;
    this.dead = false;
    this.tailPhase = Math.random() * 6;

    this.attack = null;                 // {key, def, t, fired, hitSet}
    this.comboIdx = 0;
    this.comboWindow = 0;
    this.combo = 0;                     // hits landed without being hit
    this.comboTimer = 0;
    this.cd = {};
    this.pendingSpecial = null;
    this.selfImpulse = null;
    this.launchFrom = null;
    this.stunT = 0;

    this.place(this.x);
  }

  get standY() { return this.groundY - (BONE.thigh + BONE.shin) * this.scale * 0.94; }

  place(x, groundY = this.groundY ?? 0) {
    this.groundY = groundY;
    this.x = x;
    this.y = this.standY;
    this.vx = 0; this.vy = 0;
    this.rag.place(this.x, this.y, fk(POSE.guard, this.facing, this.scale));
  }

  get busy() { return !!this.attack || this.mode === 'down' || this.mode === 'getup' || this.stunT > 0; }
  get canAct() { return this.mode === 'live' && !this.attack && this.stunT <= 0 && !this.dead; }
  get centre() { return this.rag.centre(); }

  cooldown(id) { return Math.max(0, this.cd[id] || 0); }

  // ── control ──────────────────────────────────────────────────────────────
  move(dir, dt) {
    // A non-finite dir silently turns vx, then x, then every hit test into NaN, and the
    // fighter drops out of the fight with no error. Refuse it at the door.
    if (!Number.isFinite(dir)) return;
    if (!this.canAct && this.mode !== 'live') return;
    if (this.attack && this.attack.def.lockMove) return;
    const spd = this.speed * (this.blocking ? 0.42 : 1) * (this.attack ? 0 : 1);
    const target = dir * spd;
    const accel = this.onGround ? 14 : 6;
    this.vx += (target - this.vx) * Math.min(1, accel * dt);
    // Facing is owned by Match.faceOpponents(), not by which way you are walking.
  }

  jump() {
    if (!this.canAct || !this.onGround || this.blocking) return false;
    this.vy = -this.jumpV;
    this.onGround = false;
    this.setAnim('jump');
    return true;
  }

  setBlock(on) {
    if (this.mode !== 'live' || this.attack || this.guardBroken > 0) { this.blocking = false; return; }
    this.blocking = on && this.onGround;
  }

  setAnim(name, spin = 0) {
    if (this.anim !== name) { this.anim = name; this.animT = 0; }
    this.spin = spin;
  }

  /** Standard tap attack — chains jab -> hook -> kick if you keep tapping. */
  strike() {
    if (!this.canAct) return null;
    const key = this.comboWindow > 0 ? COMBO_CHAIN[this.comboIdx % COMBO_CHAIN.length] : COMBO_CHAIN[0];
    if (this.comboWindow > 0) this.comboIdx++;
    else this.comboIdx = 1;
    this.comboWindow = 0.55;
    const def = { ...STRIKES[key] };
    this.beginAttack(key, def);
    return key;
  }

  beginAttack(key, def) {
    this.attack = { key, def, t: 0, fired: false, hitSet: new Set() };
    this.blocking = false;
    // A committed strike plants your feet. Movement input is already ignored during an
    // attack, but the velocity you arrived with decayed slowly enough to carry you ~50u
    // forward — enough to walk out the far side of someone your own hit had just launched,
    // which is what "the power hit switched my side" actually was. Carry-forward specials
    // set their own velocity immediately after this.
    if (this.onGround) this.vx *= 0.15;
    this.setAnim(def.anim || key, def.spin || 0);
  }

  /** @param m moveStats() output for a special the player owns. */
  special(m) {
    if (!this.canAct || !m) return false;
    if (this.cooldown(m.id) > 0) return false;
    this.cd[m.id] = m.cooldown;
    const D = {
      power: { anim: 'power', dmg: m.damage, kb: m.knockback, reach: 40, pt: P.HAND_R, stagger: 1.0, sfx: 'heavy', p: 1.4 },
      rise:  { anim: 'rise',  dmg: m.damage, kb: m.knockback, reach: 36, pt: P.HAND_R, stagger: 1.0, sfx: 'heavy', p: 1.2, launch: -1 },
      // multi = the hitbox stays live to the end of the animation, so a somersault or a
      // shockwave catches everyone it reaches rather than only whoever stood in the one
      // frame it fired on. A.hitSet still caps each target at one hit per attack.
      slam:  { anim: 'slam',  dmg: m.damage, kb: m.knockback, reach: 30, pt: P.HAND_R, stagger: 1.0, sfx: 'boom', p: 1.6, aoe: 185, multi: true },
      dash:  { anim: 'dash',  dmg: m.damage, kb: m.knockback, reach: 44, pt: P.NECK,   stagger: 0.9, sfx: 'heavy', p: 1.3, dashV: 1150, sweep: 160, multi: true, lockMove: true },
      flipF: { anim: 'flip',  dmg: m.damage, kb: m.knockback, reach: 46, pt: P.FOOT_R, stagger: 1.0, sfx: 'heavy', p: 1.5, spin: 1, hopV: 560, dashV: 420, multi: true, lockMove: true },
      flipB: { anim: 'flip',  dmg: m.damage, kb: m.knockback, reach: 44, pt: P.FOOT_R, stagger: 0.9, sfx: 'heavy', p: 1.3, spin: -1, hopV: 600, dashV: -520, multi: true, lockMove: true },
      toss:  { anim: 'toss',  dmg: m.damage, kb: m.knockback, reach: 0,  pt: P.HAND_R, stagger: 0.7, sfx: 'twang', p: 0.6, projectile: 'band' },
      bomb:  { anim: 'toss',  dmg: m.damage, kb: m.knockback, reach: 0,  pt: P.HAND_R, stagger: 1.0, sfx: 'twang', p: 1.0, projectile: 'bomb' },
      // Dark-only. Knives replace the charge: two of them, flat and fast, so the slot still
      // covers ground without walking you through anybody. The sawn-off is the one move in
      // either set that reaches all the way down the page.
      knives:{ anim: 'toss',  dmg: m.damage, kb: m.knockback, reach: 0,  pt: P.HAND_R, stagger: 0.8, sfx: 'twang', p: 0.9, projectile: 'knife', volley: 2 },
      gun:   { anim: 'toss',  dmg: m.damage, kb: m.knockback, reach: 0,  pt: P.HAND_R, stagger: 1.0, sfx: 'boom',  p: 1.6, projectile: 'slug' },
    }[m.kind || m.id];
    if (!D) return false;
    D.id = m.id;
    D.kind = m.kind || m.id;
    this.beginAttack(m.id, D);
    if (D.hopV) { this.vy = -D.hopV; this.onGround = false; }
    if (D.dashV) this.vx = D.dashV * this.facing * (m.id === 'flipB' ? 1 : 1);
    return true;
  }

  // ── damage ───────────────────────────────────────────────────────────────
  /**
   * @param opts {kb, stagger, from:[x,y], power, launch, noStagger}
   * @returns {number} damage actually dealt
   */
  hurt(dmg, opts = {}) {
    if (this.dead || this.invuln > 0) return 0;
    const [fx, fy] = opts.from || [this.x, this.y];
    const facingSrc = Math.sign(fx - this.x) === this.facing;
    let stagger = opts.stagger ?? 0.4;
    let broke = false;
    if (this.blocking && facingSrc && this.mode === 'live') {
      if (stagger >= 0.8) {
        // Heavy and special hits break a guard. Without this a high-skill AI can simply
        // hold block forever and the fight stalemates.
        this.blocking = false;
        this.guardBroken = 0.85;
        broke = true;
        dmg *= 0.7;
        stagger = 1;
      } else {
        dmg *= 0.22;
        stagger *= 0.2;
        opts.kb = (opts.kb || 0) * 0.35;
      }
    }
    const dr = this.stats ? this.stats.dr : 1;
    dmg = Math.max(1, dmg * dr);
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlash = 0.22;
    this.invuln = 0.06;
    this.brokeGuard = broke;
    this.combo = 0;
    this.comboTimer = 0;

    const kbResist = (this.stats ? this.stats.kbResist : 1) / this.mass;
    const kb = (opts.kb || 200) * kbResist * 0.016;
    let dx = this.x - fx, dy = (this.y - 30) - fy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (opts.launch) { dx *= 0.35; dy = -1.5; }

    const dying = this.hp <= 0;
    const bigHit = stagger >= 0.85 || dying || (kb * this.mass) > 7;

    if (bigHit) {
      this.goDown(dx * kb, dy * kb - kb * 0.45, dying);
    } else {
      this.mode = 'stagger';
      this.staggerT = Math.max(this.staggerT, 0.10 + stagger * 0.34);
      this.stunT = Math.max(this.stunT, 0.06 + stagger * 0.22);
      this.setAnim('hurt');
      this.vx += dx * kb * 26;
      this.rag.blast(fx, fy, 120 * this.scale, kb * 9);
    }
    if (dying && !this.dead) {
      this.dead = true;
      this.mode = 'dead';
    }
    return dmg;
  }

  goDown(ix, iy, dying) {
    this.mode = dying ? 'dead' : 'down';
    this.attack = null;
    this.blocking = false;
    this.gain = 0;
    const [cx] = this.rag.centre();
    this.launchFrom = cx;
    this.downT = dying ? 999 : 0.45;
    const power = 1;
    for (let i = 0; i < NPTS; i++) {
      const w = i === P.HEAD || i === P.NECK ? 1.25 : 1;
      this.rag.impulse(i, -ix * power * w, -iy * power * w);
    }
  }

  /** Extra shove on an already-limp body — used by blasts and hazards. */
  shove(cx, cy, radius, power) {
    this.rag.blast(cx, cy, radius, power);
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

  // ── update ───────────────────────────────────────────────────────────────
  update(dt, world, onHit) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.guardBroken = Math.max(0, (this.guardBroken || 0) - dt);
    this.tailPhase += dt * (6 + Math.abs(this.vx) * 0.02);
    const wantDrop = (this.blocking && this.onGround) ? 23 * this.scale : 0;
    this.duckDrop += (wantDrop - this.duckDrop) * Math.min(1, dt * 16);
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    if (this.mode === 'dead') { this.gain = 0; this.rag.step(dt, 0, world); return; }

    if (this.mode === 'down') {
      this.gain = 0;
      this.rag.step(dt, 0, world);
      const settled = this.rag.speed() < 1.6 && this.rag.grounded;
      this.downT -= dt;
      if (settled && this.downT <= 0) {
        this.mode = 'getup';
        this.getupT = 0.42 * (this.stats ? this.stats.getUp : 1);
        const [cx] = this.rag.centre();
        this.x = Math.max(world.minX + 20, Math.min(world.maxX - 20, cx));
        this.y = this.standY;
        this.vx = 0; this.vy = 0;
        this.onGround = true;
        this.setAnim('land');
      }
      return;
    }

    if (this.mode === 'getup') {
      this.getupT -= dt;
      this.gain = Math.min(1, 1 - this.getupT / 0.42);
      this.animT += dt;
      const s = sample('land', this.animT);
      this.rag.setTargets(this.x, this.y, fk(s.p, this.facing, this.scale));
      this.rag.step(dt, this.gain, world);
      if (this.getupT <= 0) { this.mode = 'live'; this.gain = 1; this.setAnim('guard'); }
      return;
    }

    if (this.mode === 'stagger') {
      this.staggerT -= dt;
      this.gain = 0.30;
      if (this.staggerT <= 0) { this.mode = 'live'; this.gain = 1; this.setAnim('guard'); }
    } else {
      this.gain = 1;
    }

    // Attack timeline.
    if (this.attack) {
      const A = this.attack;
      A.t += dt;
      const s = sample(A.def.anim, A.t, A.def.spin ? A.def.spin * Math.min(1, A.t / 0.5) * Math.PI * 2 : 0);
      const anim = { guard: 1 }[A.def.anim] ? null : A.def.anim;
      this.animT = A.t;
      this.anim = A.def.anim;
      const hitFrame = (({ jab: 1, hook: 1, kick: 1, power: 1, rise: 1, slam: 1, toss: 1, dash: 0, flip: 1 })[A.def.anim]) ?? 1;
      // The hitbox is live for the WHOLE of its frame, not for the single instant the frame
      // starts — a swing that only connects on one tick reads as "it went straight through
      // them". `multi` moves (the dash, the flips, the slam's shockwave) stay live to the
      // end of the animation, so a somersault threatens everyone it travels over. Repeat
      // targets are rejected by A.hitSet, so a longer window never means a bigger hit.
      const live = A.def.multi ? s.frame >= hitFrame : s.frame === hitFrame;
      if (live) { onHit && onHit(this, A); A.fired = true; }
      if (s.done) this.attack = null;
    }

    // Body physics.
    if (!this.attack || !this.attack.def.lockMove) {
      if (!this.onGround) this.vy += GRAVITY * dt * (this.vy < 0 ? 0.9 : 1.05);
    } else {
      this.vy += GRAVITY * dt * 0.85;
    }
    if (this.onGround && !this.attack) this.vx *= Math.pow(0.0008, dt);
    else if (this.onGround) this.vx *= Math.pow(0.02, dt);
    else this.vx *= Math.pow(0.35, dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const floor = this.standY;
    if (this.y >= floor) {
      if (!this.onGround && this.vy > 220) this.setAnim('land');
      this.y = floor; this.vy = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.x = Math.max(world.minX + 24, Math.min(world.maxX - 24, this.x));

    if (!this.attack && !this.poseLock) {
      if (!this.onGround) this.setAnim(this.vy < 0 ? 'jump' : 'fall');
      else if (this.blocking) this.setAnim('block');
      else if (Math.abs(this.vx) > this.speed * 0.62) this.setAnim('run');
      else if (Math.abs(this.vx) > 18) this.setAnim('walk');
      else if (this.anim !== 'land' || this.animT > 0.23) this.setAnim('guard');
      this.animT += dt;
    }

    const s = sample(this.anim, this.animT, this.spin ? this.spin * Math.min(1, this.animT / 0.5) * Math.PI * 2 : 0);
    this.rag.setTargets(this.x, this.y + this.duckDrop, fk(s.p, this.facing, this.scale));
    this.rag.step(dt, this.gain, world);
  }

  /** World position of the point an attack strikes from. */
  strikePoint(def) {
    const i = def.pt ?? P.HAND_R;
    return [this.rag.x[i], this.rag.y[i]];
  }

  landedHit() {
    this.combo++;
    this.comboTimer = 2.2;
  }
}
