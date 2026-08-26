// The only place hit points are removed and the only place a blast is resolved (CONTRACTS §6).

import { COMBAT, ECON } from '../data/tuning.js';

function nearestOnAabb(x, y, e) {
  const dx = Math.max(Math.abs(x - e.x) - e.w, 0);
  const dy = Math.max(Math.abs(y - e.y) - e.h, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Multi-part bosses take damage per part; the body itself is never hit. */
export function damagePart(world, boss, part, dmg, srcTeam) {
  if (part.dead || dmg <= 0) return 0;
  part.hp -= dmg;
  part.hitFlash = 0.12;
  world.push({ e: 'hit', x: part.x, y: part.y, team: 1, dmg });
  if (srcTeam === 0) world.stats.hits++;
  if (part.hp <= 0) {
    part.dead = true;
    world.push({ e: 'explode', x: part.x, y: part.y, r: Math.max(part.w, part.h) * 2.4, big: true, kind: 'bosspart' });
    world.push({ e: 'shake', mag: 0.6 });
    world.push({ e: 'haptic', pattern: 'boom' });
    part.shoots = null;                       // §15.1: destroying a part disables its gun
    part.wreck = true;
    const share = Math.round(((boss.def.money || 0) * (part.hpMax / (boss.hpMax || 1))) * (world.moneyMult || 1));
    world.stats.money += share;
    if (boss.parts.every((q) => !q.weak || q.dead)) killEnt(world, boss, srcTeam);
  }
  boss.hp = boss.parts.reduce((acc, q) => acc + Math.max(0, q.hp), 0);
  return dmg;
}

export function applyDamage(world, ent, dmg, srcTeam, srcKind) {
  if (ent.dead || dmg <= 0) return 0;
  if (ent.kind === 'pad' || ent.kind === 'pickup' || ent.kind === 'balloon') return 0;
  if (ent.kind === 'player' && ent.invuln > 0) return 0;
  const before = ent.hp;
  ent.hp -= dmg;
  ent.hitFlash = 0.12;
  ent.lean = (ent.lean || 0) + dmg / (ent.hpMax || 1) * 0.35;
  world.push({ e: 'hit', x: ent.x, y: ent.y, team: ent.team, dmg });
  if (ent.team !== 0 && srcTeam === 0) world.stats.hits++;
  if (ent.kind === 'player') {
    const k = srcKind || 'unknown';
    world.stats.hurtBy[k] = (world.stats.hurtBy[k] || 0) + dmg;
    world.stats.damageTaken += dmg;
  }
  if (ent.hp <= 0) killEnt(world, ent, srcTeam);
  return before - Math.max(ent.hp, 0);
}

export function killEnt(world, ent, srcTeam = 0) {
  if (ent.dead) return;
  if (ent.kind === 'player') { world.crashPlayer(); return; }   // must run before ent.dead is set
  ent.dead = true;
  ent.hp = 0;
  const kind = ent.kind;

  const big = kind === 'boss' || (ent.def && ent.def.hp >= 300);
  world.push({ e: 'explode', x: ent.x, y: ent.y, r: Math.max(ent.w, ent.h) * 2.2, big, kind });
  world.push({ e: 'kill', x: ent.x, y: ent.y, kind, def: ent.def });
  world.push({ e: 'shake', mag: big ? 0.55 : 0.22 });
  world.push({ e: 'haptic', pattern: 'kill' });

  // §15.2: a death counts however it happened, and money follows the same rule.
  const money = Math.round(((ent.def && ent.def.money) || ECON.moneyPerKill[kind] || 10) * (world.moneyMult || 1));
  world.stats.money += money;
  world.stats.kills[kind] = (world.stats.kills[kind] || 0) + 1;
  world.push({ e: 'pickup', x: ent.x, y: ent.y, what: 'money', amount: money });

  spawnDebris(world, ent);
  world.mission.onKill(world, ent);

  // A fuel depot takes its neighbours with it.
  if (ent.def && ent.def.chain) {
    applyBlast(world, ent.x, ent.y, { blastR: 220, dmg: 120, shake: 0.4 }, srcTeam, ent);
  }
}

function spawnDebris(world, ent) {
  const n = 4 + world.rng.i(7);
  for (let i = 0; i < n; i++) {
    world.debris.push({
      x: ent.x + world.rng.range(-ent.w, ent.w),
      y: ent.y + world.rng.range(-ent.h, ent.h),
      vx: world.rng.range(-160, 200), vy: world.rng.range(40, 320),
      ang: world.rng.range(0, 6.283), av: world.rng.range(-6, 6),
      s: world.rng.range(5, 14), ttl: world.rng.range(2.2, 5), rest: false,
    });
  }
  if (world.debris.length > 260) world.debris.splice(0, world.debris.length - 260);
}

/**
 * `def` needs { blastR, dmg } and may carry { shake, whiteout, burn }.
 * `src` is the ent that owned the projectile, excluded from its own blast.
 */
export function applyBlast(world, x, y, def, srcTeam = 0, src = null) {
  const R = def.blastR || 0;
  const D = def.dmg || 0;
  const prevMult = world.moneyMult || 1;
  world.moneyMult = def.moneyMult || 1;              // §15.3 moneyMult
  if (def.stunR) stun(world, x, y, def.stunR, def.stunTime || 2);
  try { blastInner(world, x, y, def, srcTeam, src, R, D); }
  finally { world.moneyMult = prevMult; }
}

function stun(world, x, y, r, secs) {
  for (const e of world.ents) {
    if (e.dead || e.team === 0) continue;
    if (Math.hypot(e.x - x, e.y - y) > r) continue;
    e.stun = Math.max(e.stun || 0, secs);
    world.push({ e: 'hit', x: e.x, y: e.y, team: e.team, dmg: 0, stun: 1 });
  }
}

function blastInner(world, x, y, def, srcTeam, src, R, D) {
  world.push({ e: 'explode', x, y, r: R, big: R > 260, kind: 'blast', whiteout: def.whiteout | 0 });
  if (def.shake) world.push({ e: 'shake', mag: def.shake });

  if (R <= 0) return;
  const list = world.ents;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e === src) continue;
    if (e.kind === 'pad' || e.kind === 'pickup') continue;
    if (e.parts) {
      for (const pt of e.parts) {
        if (pt.dead) continue;
        const dp = nearestOnAabb(x, y, pt);
        if (dp > R) continue;
        damagePart(world, e, pt, D * Math.pow(1 - dp / R, 0.65), srcTeam);
      }
      continue;
    }
    const d = nearestOnAabb(x, y, e);
    if (d > R) continue;
    let dmg = D * Math.pow(1 - d / R, 0.65);
    if (e.team === srcTeam) dmg *= COMBAT.friendlyBlast;
    if (dmg <= 0) continue;
    applyDamage(world, e, dmg, srcTeam, def.srcKind || 'blast');
  }

  const p = world.player;
  if (p && !p.dead) {
    const d = nearestOnAabb(x, y, p);
    if (d < R) {
      world.push({ e: 'shake', mag: (def.shake || 0.3) * COMBAT.selfShakeFromBlast * (1 - d / R) });
    }
  }
}
