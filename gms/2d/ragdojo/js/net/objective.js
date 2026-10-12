// Bots that know what the mode is for. Brain (ai.js) only knows how to fight the nearest
// body; this decides WHERE to be and WHO is worth fighting, and hands the fighting to Brain.

import { Brain } from '../ai.js';

const NEAR = 95;

/**
 * What a fighter should be doing in this mode: {goX, targets} — walk to goX unless one of
 * `targets` is in the way — or null to just fight whoever is closest.
 */
export function objectiveFor(m, f) {
  const foes = m.all.filter((o) => o !== f && !o.dead && !o.gone);
  const ob = m.obj;
  if (!ob || !foes.length) return null;
  if (m.modeId === 'bandana') {
    if (ob.holder === f.slot) {
      // Run for the side with more room, away from the nearest chaser; swing only when cornered.
      const near = foes.reduce((a, b) => (Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a));
      const away = Math.sign(f.x - near.x) || 1;
      const room = away > 0 ? 1560 - f.x : f.x - 120;
      const dir = room > 160 ? away : -away;
      return { goX: f.x + dir * 400, targets: foes.filter((o) => Math.abs(o.x - f.x) < 80), flee: true };
    }
    if (ob.holder >= 0) return { goX: m.all[ob.holder].x, targets: [m.all[ob.holder]] };
    return { goX: ob.x, targets: foes.filter((o) => Math.abs(o.x - f.x) < 70), loose: true };
  }
  if (m.modeId === 'hill') {
    const zx = ob.next != null && ob.t < 1.5 ? ob.next : ob.x;
    const inZone = Math.abs(f.x - zx) <= ob.w / 2 - 20;
    const rivals = foes.filter((o) => Math.abs(o.x - zx) <= ob.w / 2 + 70);
    if (!inZone) return { goX: zx, targets: foes.filter((o) => Math.abs(o.x - f.x) < 70) };
    return { goX: zx, targets: rivals, hold: true };
  }
  return null;
}

/** Brain plus the objective. Used by local practice bots and the balance sim. */
export class ObjectiveBrain {
  constructor(f, skill, moveIds, save) {
    this.f = f;
    this.skill = skill;
    this.brain = new Brain(f, skill, moveIds, save);
    this.jumpCd = 0;
  }

  update(dt, m) {
    const f = this.f;
    if (f.dead || f.gone || f.mode === 'down' || f.mode === 'dead') return;
    this.jumpCd -= dt;
    const info = { targets: m.all.filter((o) => o !== f && !o.dead && !o.gone), projectiles: m.projectiles, hazards: [] };
    const g = objectiveFor(m, f);
    if (!g) { this.brain.update(dt, info); return; }
    const close = g.targets.filter((o) => Math.abs(o.x - f.x) < NEAR * 2.2);
    if (close.length && !g.flee) { this.brain.update(dt, { ...info, targets: close }); return; }
    if (g.flee && close.length && f.canAct && Math.random() < dt * 3 * this.skill) f.strike();
    const dx = g.goX - f.x;
    const dir = Math.abs(dx) < 18 ? 0 : Math.sign(dx);
    f.setBlock(false);
    f.move(dir, dt);
    // Jump over a body standing between us and where we are going, or up at a bandana in the air.
    if (this.jumpCd <= 0 && f.onGround && f.canAct) {
      const blocker = info.targets.some((o) => Math.sign(o.x - f.x) === dir && Math.abs(o.x - f.x) < 60 && o.onGround);
      const high = g.loose && m.obj && Math.abs(m.obj.x - f.x) < 50 && m.obj.y < f.y - 110;
      if ((blocker || high) && Math.random() < 0.35 + this.skill * 0.5) { f.jump(); this.jumpCd = 0.7; }
      else if (blocker || high) this.jumpCd = 0.3;
    }
  }
}
