// Enemy brain. Also drives both fighters in the menu demo matches and the player's
// opponents in bully mode. `skill` (0..1) scales reaction time, spacing and aggression.

import { moveStats } from './config.js';

const PREFER = ['power', 'rise', 'dash', 'flipF', 'slam', 'toss', 'flipB', 'bomb'];

export class Brain {
  constructor(f, skill = 0.5, moveIds = [], save = null) {
    this.f = f;
    this.skill = skill;
    this.save = save;          // when set, specials use the real purchased stats
    this.think = 0;
    this.intent = 'approach';
    this.intentT = 0;
    this.dir = 0;
    this.wantBlock = false;
    this.moves = moveIds;
    this.jumpCd = 0;
    this.hesitate = 0.34 - skill * 0.28;
  }

  /** @param world {minX,maxX,groundY} @param ctxInfo {targets, projectiles, hazards} */
  update(dt, info) {
    const f = this.f;
    if (f.dead || f.mode === 'down' || f.mode === 'dead') return;
    this.jumpCd -= dt;
    this.think -= dt;
    this.intentT -= dt;

    const t = this.pickTarget(info.targets);
    if (!t) { f.move(0, dt); return; }
    const dx = t.x - f.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || 1;

    // Dodge anything incoming.
    for (const p of info.projectiles || []) {
      if (p.owner === f) continue;
      const pd = p.x - f.x;
      if (Math.abs(pd) < 190 && Math.sign(p.vx) === -Math.sign(pd) && this.jumpCd <= 0) {
        if (Math.random() < 0.3 + this.skill * 0.6) { f.jump(); this.jumpCd = 0.8; }
      }
    }
    for (const h of info.hazards || []) {
      if (!h.threatens || !h.threatens(f.x) || this.jumpCd > 0) continue;
      if (Math.random() < 0.4 + this.skill * 0.55) { f.jump(); this.jumpCd = 0.7; }
      else {
        const hx = h.threatX ? h.threatX(f.x) : h.x;
        if (Number.isFinite(hx)) f.move(Math.sign(f.x - hx) || 1, dt);
      }
    }

    if (this.think <= 0) {
      this.think = this.hesitate * (0.6 + Math.random() * 0.8);
      this.decide(t, dist, info);
    }

    const reach = 74 * f.scale;
    if (this.intent === 'approach') {
      this.dir = dist > reach * 0.9 ? dir : 0;
      this.wantBlock = false;
    } else if (this.intent === 'retreat') {
      this.dir = -dir;
      this.wantBlock = false;
    } else if (this.intent === 'block') {
      this.dir = 0;
      this.wantBlock = true;
    } else if (this.intent === 'circle') {
      this.dir = this.circleDir || 1;
      this.wantBlock = false;
    } else {
      this.dir = 0;
      this.wantBlock = false;
    }

    if (f.canAct) f.facing = dir;
    f.setBlock(this.wantBlock);
    f.move(this.dir, dt);
  }

  pickTarget(list) {
    let best = null, bd = 1e9;
    for (const t of list) {
      if (t === this.f || t.dead) continue;
      const d = Math.abs(t.x - this.f.x);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  decide(t, dist, info) {
    const f = this.f;
    const reach = 74 * f.scale;
    const s = this.skill;
    const r = Math.random();

    // React to an incoming attack.
    if (t.attack && dist < reach * 1.5 && r < 0.25 + s * 0.6) {
      this.intent = r < (0.1 + s * 0.35) ? 'block' : 'retreat';
      this.intentT = 0.4;
      return;
    }
    if (f.hp < f.maxHp * 0.28 && r < 0.16 + s * 0.2) {
      this.intent = 'retreat'; this.intentT = 0.6; return;
    }

    if (dist < reach) {
      if (f.canAct) {
        const sp = this.trySpecial(dist);
        if (!sp && r < 0.55 + s * 0.4) f.strike();
      }
      this.intent = r < 0.25 ? 'retreat' : 'approach';
      this.intentT = 0.3;
    } else if (dist < reach * 3.2) {
      if (f.canAct && r < 0.14 + s * 0.34) this.trySpecial(dist);
      this.intent = r < 0.72 + s * 0.2 ? 'approach' : 'circle';
      this.circleDir = Math.random() < 0.5 ? -1 : 1;
      this.intentT = 0.5;
    } else {
      if (f.canAct && r < 0.10 + s * 0.22) this.trySpecial(dist);
      this.intent = 'approach';
      this.intentT = 0.5;
    }
  }

  trySpecial(dist) {
    const f = this.f;
    if (!this.moves.length) return false;
    const reach = 74 * f.scale;
    for (const id of PREFER) {
      if (!this.moves.includes(id)) continue;
      if (f.cooldown(id) > 0) continue;
      const good =
        id === 'toss' || id === 'bomb' ? dist > reach * 1.6 :
        id === 'dash' || id === 'flipF' ? dist > reach * 1.1 && dist < reach * 4 :
        id === 'flipB' ? dist < reach * 1.2 :
        dist < reach * 1.25;
      if (!good) continue;
      if (Math.random() > 0.35 + this.skill * 0.6) continue;
      if (this.save) {
        const m = moveStats(this.save, id);
        return m ? f.special(m) : false;
      }
      const m = moveStats(this.fakeSave(id), id);
      if (m) {
        m.damage = f.baseDmg * (id === 'power' ? 1.8 : id === 'bomb' ? 2.6 : 1.5);
        m.cooldown = Math.max(1.1, m.cooldown * (1.5 - this.skill * 0.5));
        m.knockback = m.kb * (1 + this.skill * 0.5);
        return f.special(m);
      }
    }
    return false;
  }

  /** Enemies do not have a save file; fabricate the minimum moveStats() needs. */
  fakeSave(id) {
    const lv = Math.round(this.skill * 3);
    return { perks: {}, moves: { [id]: { owned: true, power: lv, cd: lv } } };
  }
}

/** Choose which specials a given enemy knows, deterministic per tier so ranks feel distinct. */
export function movesForTier(tier, count, boss) {
  const pool = ['toss', 'power', 'rise', 'dash', 'flipF', 'slam', 'flipB', 'bomb'];
  const avail = pool.slice(0, Math.min(pool.length, 2 + tier));
  const out = [];
  for (let i = 0; i < count && avail.length; i++) {
    const idx = (tier * 3 + i * 5 + (boss ? 1 : 0)) % avail.length;
    const m = avail.splice(idx, 1)[0];
    out.push(m);
  }
  if (boss && !out.includes('power')) out.push('power');
  return out;
}
