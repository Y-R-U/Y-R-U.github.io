// Bots that know what the mode is for. Brain (ai.js) only knows how to fight the nearest
// body; this decides WHERE to be and WHO is worth fighting, and hands the fighting to Brain.

import { Brain } from '../ai.js';
import { SHEET_W, WALL_PAD } from '../config.js';

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

const hp = (o) => o.hp / (o.maxHp || 1);
const hurt = (o) => hp(o) < 0.55;
const busy = (m, o, f) => m.all.some((x) => x !== o && x !== f && !x.dead && !x.gone && Math.abs(x.x - o.x) < 120);

/**
 * A lurker (SNEAK) does not walk into a fair fight: it lets the others wear each other down and
 * then goes for whoever is hurt or busy. Returns the objective to follow instead, or null.
 */
function lurk(m, f, g, foes, angry) {
  // Prey: someone hurt, or someone a fight has already worn down a little. The weakest first.
  const prey = foes.filter((o) => hurt(o) || (busy(m, o, f) && hp(o) < 0.8)).sort((a, b) => hp(a) - hp(b))[0];
  if (m.modeId === 'bandana' && m.obj?.holder >= 0 && m.obj.holder !== f.slot) {
    const h = m.all[m.obj.holder];
    if (hurt(h) || busy(m, h, f)) return g;
    return { goX: h.x + Math.sign(f.x - h.x || 1) * 200, targets: foes.filter((o) => Math.abs(o.x - f.x) < 60) };
  }
  if (m.modeId === 'hill' && m.obj) {
    const z = m.obj;
    // Camp where the hill is going next, before anyone else gets there.
    if (z.next != null) return { goX: z.next, targets: foes.filter((o) => Math.abs(o.x - f.x) < 70) };
    const rivals = foes.filter((o) => Math.abs(o.x - z.x) <= z.w / 2 + 40);
    if (g?.hold === undefined && rivals.length >= 2 && !rivals.some(hurt)) return { goX: z.x + Math.sign(f.x - z.x || 1) * (z.w / 2 + 90), targets: foes.filter((o) => Math.abs(o.x - f.x) < 60) };
    return g;
  }
  if (g) return g;
  if (prey) return { goX: prey.x, targets: [prey] };
  const near = foes.reduce((a, b) => (Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a));
  const d = Math.abs(near.x - f.x);
  // It never walks into a fair fight, but it does not run from one either: whoever comes close gets fought.
  if (d < 170 || angry) return null;
  // Otherwise wait where the nearest body is farthest away.
  let best = f.x, room = -1;
  for (let x = WALL_PAD + 100; x <= SHEET_W - WALL_PAD - 100; x += 40) {
    const r = Math.min(...foes.map((o) => Math.abs(o.x - x))) - Math.abs(x - f.x) * 0.15;
    if (r > room) { room = r; best = x; }
  }
  return { goX: best, targets: [] };
}

/** Brain plus the objective. Used by local practice bots, quick-fight ghosts and the balance sim. */
export class ObjectiveBrain {
  constructor(f, skill, moveIds, save, opts = {}) {
    this.f = f;
    this.skill = skill;
    this.brain = new Brain(f, skill, moveIds, save, opts);
    this.jumpCd = 0;
  }

  setStyle(style) { this.brain.setStyle(style); }

  update(dt, m) {
    const f = this.f;
    if (f.dead || f.gone || f.mode === 'down' || f.mode === 'dead') return;
    this.jumpCd -= dt;
    const info = { targets: m.all.filter((o) => o !== f && !o.dead && !o.gone), projectiles: m.projectiles, hazards: [] };
    let g = objectiveFor(m, f);
    if (this.brain.style?.lurk) {
      if (f.hp < (this.lastHp ?? f.hp)) this.angry = 1.6;
      this.angry = (this.angry || 0) - dt;
      this.lastHp = f.hp;
      if (info.targets.length && !(g && g.flee)) g = lurk(m, f, g, info.targets, this.angry > 0);
    }
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
