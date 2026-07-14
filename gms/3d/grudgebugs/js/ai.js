// GRUDGE BUGS — AI turns. Sampling solver: try candidate yaw/pitch/power
// combos through the REAL physics sim, score the carnage, add personality
// error. Mild Salsa misses charmingly; Nuclear does not.

import { WEAPONS, PHYS } from './config.js';
import { clamp, v3 } from './utils.js';
import * as phys from './physics.js';

const W = (id) => WEAPONS.find(w => w.id === id);

function gauss(rng) { return (rng() + rng() + rng() - 1.5) * 1.15; }

// score an impact position against all bugs
function scoreImpact(at, w, battle, me) {
  let score = 0;
  for (const b of battle.allBugs) {
    if (!b.alive) continue;
    const p = battle.bugPos(b);
    const c = { x: p.x, y: p.y + PHYS.bugHeight * 0.5, z: p.z };
    const d = Math.hypot(at.x - c.x, at.y - c.y, at.z - c.z);
    const R = w.radius * 1.15;
    if (d > R) continue;
    const f = clamp(1 - d / R, 0, 1);
    const dmg = w.dmg * Math.pow(f, 0.7);
    if (b.team === me.team) score -= dmg * (b === me ? 3 : 2);
    else {
      score += dmg;
      if (dmg >= b.hp) score += 45;                       // kill!
      // knock-off potential: near the impact and near a walkable edge
      const L = battle.ledges[b.li];
      const span = phys.spanAt(L, b.s);
      if (span && f > 0.35) {
        const edgeDist = Math.min(b.s - span[0], span[1] - b.s);
        if (edgeDist < 1.6) score += 22;
      }
    }
  }
  return score;
}

export function planTurn(battle, bug, team) {
  const rng = battle.rng;
  const diff = team.diff;
  const myPos = battle.bugPos(bug);

  // ------- pick a target -------
  const enemies = battle.allBugs.filter(b => b.alive && b.team !== bug.team);
  if (!enemies.length) return { moveTo: null, weapon: 'bazooka', yaw: 0, pitch: 0.7, power: 0.5 };
  let target = enemies[0], bestT = -1e9;
  for (const e of enemies) {
    const p = battle.bugPos(e);
    const d = Math.hypot(p.x - myPos.x, p.y - myPos.y, p.z - myPos.z);
    const sc = (e.maxhp - e.hp) * 0.4 - d * 1.2 + rng() * 10;
    if (sc > bestT) { bestT = sc; target = e; }
  }
  const tPos = battle.bugPos(target);

  // ------- melee? same ledge and close -------
  const sameLedge = target.li === bug.li;
  const walkDist = Math.abs(target.s - bug.s);
  if (sameLedge && walkDist < battle.moveLeft + 1.0 && rng() < diff.weaponSmart) {
    const span = phys.spanAt(battle.ledges[bug.li], bug.s);
    const wantS = target.s + (target.s > bug.s ? -0.9 : 0.9);
    if (span && wantS > span[0] && wantS < span[1] && Math.abs(target.s - wantS) < 1.3) {
      const dir = phys.posAt(battle.ledges[bug.li], bug.s).dir;
      const sgn = Math.sign(target.s - bug.s) || 1;
      return {
        moveTo: wantS, weapon: 'slap',
        yaw: Math.atan2(dir.x * sgn, dir.z * sgn), pitch: 0.1, power: 1,
      };
    }
  }

  // ------- strikes on clusters -------
  if (rng() < diff.weaponSmart * 0.8) {
    const cluster = enemies.filter(e => {
      const p = battle.bugPos(e);
      return Math.hypot(p.x - tPos.x, p.z - tPos.z) < 2.6;
    });
    for (const sid of ['shoe', 'bee52']) {
      if (cluster.length >= 2 && (team.ammo.get(sid) ?? 0) > 0) {
        const c = cluster.reduce((a, e) => { const p = battle.bugPos(e); a.x += p.x; a.y += p.y; a.z += p.z; return a; }, { x: 0, y: 0, z: 0 });
        return {
          moveTo: null, weapon: sid, yaw: 0, pitch: 0.5, power: 1,
          targetPoint: { x: c.x / cluster.length, y: c.y / cluster.length, z: c.z / cluster.length },
        };
      }
    }
  }

  // ------- reposition (from where we'll actually shoot) -------
  let moveTo = null;
  let shootFrom = myPos;
  if (rng() < diff.moveSmart) {
    const L = battle.ledges[bug.li];
    const span = phys.spanAt(L, bug.s);
    if (span) {
      const toward = clamp(bug.s + Math.sign(
        (tPos.x - myPos.x) * phys.posAt(L, bug.s).dir.x + (tPos.z - myPos.z) * phys.posAt(L, bug.s).dir.z || 1)
        * Math.min(battle.moveLeft * 0.8, 3), span[0] + 0.3, span[1] - 0.3);
      if (Math.abs(toward - bug.s) > 0.6) {
        moveTo = toward;
        shootFrom = phys.posAt(L, toward).pos;
      }
    }
  }

  // ------- sample ballistic shots -------
  const dx = tPos.x - shootFrom.x, dz = tPos.z - shootFrom.z;
  const bearing = Math.atan2(dx, dz);
  const dist = Math.hypot(dx, dz);
  const candidates = ['bazooka'];
  if (rng() < diff.weaponSmart && (team.ammo.get('grenade') ?? -1) !== 0) candidates.push('grenade');
  if (dist < 7 && rng() < 0.5) candidates.push('loogie');
  if ((team.ammo.get('dungball') ?? 0) > 0 && sameLedge && rng() < diff.weaponSmart) candidates.push('dungball');
  if ((team.ammo.get('cluster') ?? 0) > 0 && rng() < diff.weaponSmart * 0.5) candidates.push('cluster');

  const world = battle.physWorld();
  let best = { score: -1e9, yaw: bearing, pitch: 0.7, power: 0.6, weapon: 'bazooka' };
  const muzzle = v3(shootFrom.x, shootFrom.y + 0.55, shootFrom.z);
  const samples = 20;
  for (const wid of candidates) {
    const w = W(wid);
    for (let i = 0; i < samples; i++) {
      const yaw = bearing + gauss(rng) * 0.18;
      const pitch = wid === 'loogie'
        ? clamp(Math.atan2(tPos.y - shootFrom.y, dist) + gauss(rng) * 0.08, -0.4, 0.9)
        : clamp(0.5 + rng() * 0.75, 0.3, 1.25);
      const power = wid === 'dungball' ? 0.5 + rng() * 0.3 : clamp(0.35 + rng() * 0.65, 0.3, 1);
      const vel = phys.muzzleVel(yaw, pitch, power, w.speed);
      const start = v3(muzzle.x + Math.sin(yaw) * 0.4, muzzle.y, muzzle.z + Math.cos(yaw) * 0.4);
      const res = phys.simulate({ pos: start, vel, w, shooterId: bug.id }, world);
      let sc = scoreImpact(res.impact.pos, w, battle, bug);
      if (res.impact.type === 'splash') sc -= 8;          // wasted shot
      if (res.impact.hitBugId === bug.id) sc -= 100;
      if (sc > best.score) best = { score: sc, yaw, pitch, power, weapon: wid };
    }
  }

  // ------- personality error on the winning shot -------
  const err = diff.err;
  return {
    moveTo,
    weapon: best.weapon,
    yaw: best.yaw + gauss(rng) * err * 0.55,
    pitch: clamp(best.pitch + gauss(rng) * err * 0.5, -0.4, 1.35),
    power: clamp(best.power + gauss(rng) * err * 0.5, 0.25, 1),
  };
}
