// The dirty tricks. One button fires whichever equipped skill is off cooldown
// and has something to hit — the player never picks, they only choose *when*,
// and when is the entire game.

import * as THREE from 'three';
import { scene } from './render.js';
import { skillById } from './arsenal.js';
import { reportFoul, addHype, estimateRisk } from './stewards.js';
import { state } from './state.js';
import { emit } from './bus.js';
import * as fx from './particles.js';
import { showBubble } from './bubbles.js';
import { HYPE } from './config.js';
import { clamp, clamp01, pick, rand, sign, shuffled } from './utils.js';

let track = null;
const hazards = [];

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function initAttacks(tr) {
  track = tr;
  clearHazards();
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------
export function findTargets(car, cars, range, opts = {}) {
  const out = [];
  for (const o of cars) {
    if (o === car || !o.alive || o.mode === 'wreck' || o.respawnTimer > 0) continue;
    const ds = track.delta(car.s, o.s);      // positive: they are ahead
    const dt = o.t - car.t;
    const dh = (o.h || 0) - (car.h || 0);
    const dist = Math.hypot(ds, dt, dh);
    if (dist > range) continue;
    if (!opts.radial) {
      if (opts.rear) { if (ds > 2.5) continue; }
      else if (ds < -7) continue;
    }
    out.push({ car: o, ds, dt, dist });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

// Which skill would fire right now, and at whom — the HUD needs this to show
// the risk before you commit.
export function previewAttack(car, cars) {
  const ready = readySkills(car);
  if (!ready.length) return null;
  for (const sk of ready) {
    if (sk.band === 'drop') return { skill: sk, target: null, dist: 0 };
    const ts = findTargets(car, cars, sk.range, { rear: sk.rear, radial: sk.radial });
    if (ts.length) return { skill: sk, target: ts[0].car, dist: ts[0].dist };
  }
  return { skill: ready[0], target: null, dist: ready[0].range };
}

export function readySkills(car) {
  return (car.skills || [])
    .map(skillById)
    .filter((s) => s && (car.cooldowns[s.id] || 0) <= 0);
}

export function cooldownFrac(car) {
  const ids = car.skills || [];
  if (!ids.length) return 1;
  let best = 1;
  for (const id of ids) {
    const sk = skillById(id);
    if (!sk) continue;
    const cd = car.cooldowns[id] || 0;
    best = Math.min(best, cd <= 0 ? 0 : cd / sk.cd);
  }
  return 1 - best;
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------
export function fireAttack(car, cars) {
  const ready = readySkills(car);
  if (!ready.length) {
    if (car.isPlayer) emit('attack:notReady', { car });
    return null;
  }

  // "It just triggers randomly from your selected skills" — but a skill with
  // nobody in range would be a wasted press, so anything with a target wins.
  const withTarget = [];
  const without = [];
  for (const sk of shuffled(ready)) {
    if (sk.band === 'drop') { withTarget.push({ sk, ts: [] }); continue; }
    const ts = findTargets(car, cars, sk.range, { rear: sk.rear, radial: sk.radial });
    (ts.length ? withTarget : without).push({ sk, ts });
  }
  // Firing at nobody would burn a cooldown and hand the stewards a clip of you
  // brandishing something for no reason. Refuse the press instead.
  if (!withTarget.length) {
    if (car.isPlayer) emit('attack:noTarget', { car });
    return null;
  }
  const choice = pick(withTarget);

  const sk = choice.sk;
  car.cooldowns[sk.id] = sk.cd * (car.stats.cd || 1);
  car.attackCount = (car.attackCount || 0) + 1;

  const targets = choice.ts;
  const primary = targets[0];
  const dist = primary ? primary.dist : (sk.band === 'drop' ? 0 : sk.range);

  const result = { skill: sk, target: primary ? primary.car : null, dist, hits: 0 };

  switch (true) {
    case !!sk.drop: dropHazard(car, sk); break;
    case !!sk.radial: {
      for (const t of targets) { applyHit(car, t, sk); result.hits++; }
      fx.ring(car.worldPos, 0x8fd4ff, sk.range * 0.9, 0.45);
      state.shake = Math.min(1.2, state.shake + (car.isPlayer ? 0.5 : 0));
      break;
    }
    case !!sk.pull: {
      if (primary) { applyPull(car, primary, sk); result.hits = 1; }
      break;
    }
    case !!sk.lunge: {
      car.va += sk.lunge;
      car.lungeUntil = state.raceTime + 0.9;
      car.lungeSkill = sk;
      fx.boostFlame(car.worldPos, _v1.set(0, 0, 0), 2);
      if (primary && primary.dist < 12) { applyHit(car, primary, sk); result.hits = 1; }
      break;
    }
    case !!sk.dur: {
      // A weapon that stays out for a while: hook saw, wrecking ball.
      car.trick = { id: sk.id, skill: sk, time: sk.dur, hitCd: 0, hits: 0 };
      if (primary && primary.dist < sk.range) { applyHit(car, primary, sk); result.hits = 1; }
      break;
    }
    default: {
      if (primary) { applyHit(car, primary, sk); result.hits = 1; }
      break;
    }
  }

  emit('attack:fired', { car, skill: sk, target: result.target, dist, hits: result.hits });

  if (car.isPlayer) {
    state.attacksUsed++;
    const info = reportFoul(car, { skill: sk, dist, victim: result.target });
    result.foul = info;
    addHype(sk.hype * 0.4 + (result.hits ? sk.hype * 0.35 : 0), sk.name);
  } else if (result.hits && Math.random() < 0.04) {
    // Rivals get pulled in front of the stewards too, just often enough that
    // the system reads as real rather than as a mechanic aimed at the player.
    emit('steward:rivalPenalty', { car });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function applyHit(attacker, info, sk) {
  const target = info.car;
  const ram = attacker.stats.ram || 1;

  // Shove them toward the barrier they are already closest to. Half the fun of
  // a side slam is choosing the moment when the wall is on their side.
  let dir = Math.abs(info.dt) > 0.8 ? sign(info.dt) : (Math.abs(target.t) > 1 ? sign(target.t) : (Math.random() < 0.5 ? -1 : 1));
  const push = (sk.push || 0) * ram;

  target.shove(dir * push, sk.band === 'contact' && info.ds > 1 ? push * 0.35 : 0, {
    spin: sk.spin || (push > 20 ? 0.35 : 0.12),
    spinSign: dir,
    stun: sk.stun || 0,
    by: attacker,
  });

  if (sk.slow) {
    target.slowMul = Math.min(target.slowMul, sk.slow);
    target.slowT = Math.max(target.slowT, sk.dur || 2.5);
  }
  if (sk.stun) target.stun = Math.max(target.stun, sk.stun);

  const region = info.ds > 1.2 ? 'rear' : info.ds < -1.2 ? 'front' : (info.dt > 0 ? 'left' : 'right');
  const dealt = target.damage((sk.dmg || 0) * ram, region, {
    by: attacker, source: sk.id, shear: sk.shear,
  });

  if (sk.shear) {
    const alive = Object.keys(target.parts).filter((k) => target.parts[k]);
    const n = Math.min(sk.shear, alive.length);
    for (let i = 0; i < n; i++) {
      if (Math.random() > 0.55) continue;
      const id = alive.splice(Math.floor(Math.random() * alive.length), 1)[0];
      target.detachPart(id, { by: attacker, dir: _v1.set(dir, 0.5, 0).normalize() });
    }
  }

  if (sk.selfDmg) attacker.damage(sk.selfDmg, 'front', { source: 'selfharm', force: true });

  fx.sparkBurst(target.worldPos, _v1.set(dir * 0.6, 0.6, 0), 14, 0xffd27a, 14);
  if (attacker.isPlayer) {
    state.damageDealt += dealt;
    state.shake = Math.min(1.2, state.shake + 0.28);
  }
  if (target.isPlayer) {
    state.damageTaken += dealt;
    state.shake = Math.min(1.3, state.shake + 0.4);
    showBubble(target, 'angry');
  } else if (Math.random() < 0.5) {
    showBubble(target, Math.random() < 0.5 ? 'angry' : 'scared');
  }

  emit('attack:hit', { attacker, target, skill: sk, dealt, dist: info.dist });
  return dealt;
}

function applyPull(attacker, info, sk) {
  const target = info.car;
  attacker.va += sk.pull * 0.9;
  target.va -= sk.pull * 0.55 / (target.stats.mass || 1);
  target.shove(sign(info.dt || 1) * 8, 0, { spin: 0.2, by: attacker });
  target.damage(sk.dmg || 0, 'rear', { by: attacker, source: sk.id });
  // A visible line between the two cars for the moment it is attached.
  spawnTether(attacker, target, 0.5);
  emit('attack:hit', { attacker, target, skill: sk, dealt: sk.dmg || 0, dist: info.dist });
}

// ---------------------------------------------------------------------------
// Hazards dropped on the road
// ---------------------------------------------------------------------------
function dropHazard(car, sk) {
  const s = car.track.delta(0, car.s) - 6;
  const h = {
    kind: sk.drop,
    s: car.s - 7,
    t: car.t,
    r: sk.drop === 'smoke' ? 9 : 5.2,
    life: sk.dur || 10,
    age: 0,
    owner: car,
    mesh: null,
  };
  h.mesh = hazardMesh(h);
  if (h.mesh) scene.add(h.mesh);
  hazards.push(h);
  if (hazards.length > 22) {
    const old = hazards.shift();
    killHazard(old);
  }
  emit('attack:hazard', { car, kind: h.kind });
}

function hazardMesh(h) {
  if (!track) return null;
  if (h.kind === 'smoke') {
    const g = new THREE.Group();
    g.position.copy(track.worldAt(h.s, h.t, 1.2));
    return g;
  }
  const geo = new THREE.CircleGeometry(h.r, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: h.kind === 'oil' ? 0x14161c : 0x7c8896,
    transparent: true, opacity: h.kind === 'oil' ? 0.82 : 0.6,
    depthWrite: false,
  });
  mat.__owned = true;
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(track.worldAt(h.s, h.t, 0.05));
  m.quaternion.copy(track.quatAt(h.s, 0));
  m.rotateX(-Math.PI / 2);
  m.renderOrder = 3;
  return m;
}

function killHazard(h) {
  if (h.mesh) {
    scene.remove(h.mesh);
    if (h.mesh.geometry) h.mesh.geometry.dispose();
    if (h.mesh.material && h.mesh.material.__owned) h.mesh.material.dispose();
  }
  h.dead = true;
}

export function clearHazards() {
  for (const h of hazards) killHazard(h);
  hazards.length = 0;
  tethers.length = 0;
}

// ---------------------------------------------------------------------------
// Tethers (grapple line)
// ---------------------------------------------------------------------------
const tethers = [];
function spawnTether(a, b, life) {
  const geo = new THREE.BufferGeometry().setFromPoints([a.worldPos.clone(), b.worldPos.clone()]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffd166 });
  mat.__owned = true;
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tethers.push({ line, a, b, age: 0, life });
}

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------
export function updateAttacks(dt, cars) {
  // hazards
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.age += dt;
    if (h.kind === 'smoke') {
      fx.smokePuff(track.worldAt(h.s, h.t, 0.8, _v1), 2, 0xd8dde3, 4.4, 1.2);
    }
    if (h.mesh && h.mesh.material) {
      h.mesh.material.opacity = (h.kind === 'oil' ? 0.82 : 0.6) * clamp01((h.life - h.age) / 1.5);
    }
    if (h.age >= h.life) { killHazard(h); hazards.splice(i, 1); continue; }

    for (const c of cars) {
      if (!c.alive || c.mode === 'wreck' || c.h > 1) continue;
      if (c === h.owner && h.age < 1.2) continue;
      const ds = track.delta(h.s, c.s);
      if (Math.abs(ds) > h.r) continue;
      if (Math.abs(c.t - h.t) > h.r) continue;
      hitHazard(c, h);
    }
  }

  // ongoing weapons (hook saw, wrecking ball)
  for (const c of cars) {
    if (!c.trick) continue;
    c.trick.time -= dt;
    c.trick.hitCd -= dt;
    const sk = c.trick.skill;
    if (c.trick.time <= 0) { c.trick = null; continue; }
    if (c.trick.hitCd > 0) continue;
    const ts = findTargets(c, cars, sk.range, { radial: true });
    for (const t of ts) {
      applyHit(c, t, sk);
      c.trick.hitCd = 0.45;
      c.trick.hits++;
      break;
    }
    if (sk.id === 'wreckingball') {
      const a = state.raceTime * 7;
      _v1.copy(c.worldPos).add(_v2.set(Math.cos(a) * 6, 0.6, Math.sin(a) * 6));
      fx.sparkBurst(_v1, _v2.set(0, 1, 0), 2, 0xff9944, 4);
    }
  }

  // lunge contact window (ram jet)
  for (const c of cars) {
    if (!c.lungeUntil || state.raceTime > c.lungeUntil) continue;
    const ts = findTargets(c, cars, 8);
    if (ts.length) {
      applyHit(c, ts[0], c.lungeSkill);
      c.lungeUntil = 0;
    }
  }

  // tethers
  for (let i = tethers.length - 1; i >= 0; i--) {
    const t = tethers[i];
    t.age += dt;
    if (t.age >= t.life) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tethers.splice(i, 1);
      continue;
    }
    t.line.geometry.setFromPoints([t.a.worldPos, t.b.worldPos]);
    t.line.material.opacity = 1 - t.age / t.life;
  }
}

function hitHazard(car, h) {
  if (car.hazardCd && car.hazardCd > 0) return;
  car.hazardCd = 0.8;
  if (h.kind === 'oil') {
    car.oil = Math.max(car.oil, 2.6);
    car.psi += rand(-0.5, 0.5);
    car.recover = Math.max(car.recover, 0.4);
    if (car.isPlayer) state.shake = Math.min(1, state.shake + 0.3);
    showBubble(car, 'dazed');
  } else if (h.kind === 'tacks') {
    car.shred = Math.max(car.shred, 6);
    car.damage(12, 'bottom', { source: 'tacks' });
    if (Math.random() < 0.4) {
      const wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].filter((w) => car.parts[w]);
      if (wheels.length) car.detachPart(pick(wheels), {});
    }
    fx.sparkBurst(car.worldPos, _v1.set(0, 1, 0), 10, 0xffcc66, 8);
  } else if (h.kind === 'smoke') {
    car.blinded = 1.2;
  }
  emit('hazard:hit', { car, kind: h.kind, owner: h.owner });
}

export function tickHazardCooldowns(dt, cars) {
  for (const c of cars) {
    if (c.hazardCd > 0) c.hazardCd -= dt;
    if (c.blinded > 0) c.blinded -= dt;
  }
}

export const hazardList = () => hazards;
