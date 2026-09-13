// Weapons fire themselves. This file interprets the `kind` archetypes so that
// adding a weapon of an existing kind is a data change and nothing more
// (CONTRACTS 8.1).
//
// Ten kinds: arc, orbit, shot, aura, zone, chain, summon, strike, trail,
// boomerang. Each reads the SAME stat block, so a designer moves numbers rather
// than writing code.
//
// Field meanings that are not obvious and have bitten people:
//   orbit.speed  is rad/s, not units/s
//   chain.count  is the number of JUMPS, not projectiles
//   knock        may be NEGATIVE, which pulls instead of shoving

import { DT } from './world.js';
import { applyDamage } from './damage.js';
import { severSweep } from './strings.js';
import { applyBurn, applySlow, applyShock } from './status.js';

const SCR = [];
const TAU = Math.PI * 2;

export function initWeapon(world, inst) {
  inst.cd = 0.25 + world.rng.next() * 0.2;   // stagger the first volley
  inst.phase = world.rng.next() * TAU;
  inst.data = inst.data || {};
  if (inst.def.kind === 'orbit') inst.data.orbs = [];
}

export function onWeaponLevel(world, inst) {
  // Orbit counts are rebuilt from stats each frame, so nothing to do; the hook
  // exists so a future kind can react without world.js changing.
}

export function stepWeapons(world) {
  const p = world.player;
  if (!p.alive) return;
  const S = p.stats;

  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    const st = w.stats;
    const def = w.def;

    // Persistent kinds run every tick; the rest are on a cooldown.
    if (def.kind === 'orbit') { stepOrbit(world, w, st, S); continue; }
    if (def.kind === 'aura')  { stepAura(world, w, st, S); continue; }
    if (def.kind === 'trail') { stepTrail(world, w, st, S); continue; }

    w.cd -= DT;
    if (w.cd > 0) continue;
    w.cd += Math.max(0.08, (st.cooldown || 1) / (S.haste || 1));
    fire(world, w, st, S);
  }
}

function fire(world, w, st, S) {
  switch (w.def.kind) {
    case 'arc':       return fireArc(world, w, st, S);
    case 'shot':      return fireShot(world, w, st, S);
    case 'zone':      return fireZone(world, w, st, S);
    case 'chain':     return fireChain(world, w, st, S);
    case 'strike':    return fireStrike(world, w, st, S);
    case 'summon':    return fireSummon(world, w, st, S);
    case 'boomerang': return fireBoomerang(world, w, st, S);
  }
}

// ---------------------------------------------------------------------------
// Targeting. A weapon's target is DATA (CONTRACTS 8.1 `target`), because for
// four of them it is the entire identity.
// ---------------------------------------------------------------------------
function acquire(world, w, range) {
  const p = world.player;
  const mode = w.def.target || 'nearest';
  const near = world.spatialQuery(p.x, p.y, range, SCR);

  if (mode === 'conductor') {
    let best = null, bd = 1e9;
    world.conductors.each((c) => {
      if (!c.alive || c.dying) return;
      const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
      if (d < bd) { bd = d; best = c; }
    });
    if (best) return best;
  }

  if (mode === 'moststrung' || mode === 'thread') {
    let best = null, bd = 1e9;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive || e.dying) continue;
      if (!e.stringId) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
  }

  if (mode === 'random' && near.length) {
    const pick = near[(world.rng.next() * near.length) | 0];
    if (pick && pick.alive) return pick;
  }

  let best = null, bd = 1e9;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (!e.alive || e.dying) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function aimAt(world, w, range) {
  const p = world.player;
  const t = acquire(world, w, range);
  if (t) {
    const dx = t.x - p.x, dy = t.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d, target: t };
  }
  return { x: p.facing || 1, y: 0, target: null };
}

// ---------------------------------------------------------------------------
// The archetypes
// ---------------------------------------------------------------------------

/**
 * A swept melee arc. Sweeps a CONE around the player's aim direction, not a
 * left/right box: on a portrait phone most of the threat arrives above and
 * below, and a horizontal-only starting weapon is unplayable.
 *
 * With count > 1 the extra arcs alternate to the opposite side, which is what
 * makes "+1 arc, on the other side" a real upgrade rather than a number.
 */
function fireArc(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  const reach = (st.area || 40) * S.area;
  const dmg = (st.damage || 1) * S.might;
  const HALF = 1.15;                       // ~66 degrees either side of aim

  // Arcs SEEK. The player controls position, not aim - that is the whole
  // premise of the genre and the reason it works one-thumbed. Aiming the cone
  // along movement instead meant a retreating player swung at empty street
  // forever: 418 swings, zero hits, in the first balance run.
  let ax = p.aimX || 1, ay = p.aimY || 0;
  const t = acquire(world, w, reach * 2.2);
  if (t) {
    const dx = t.x - p.x, dy = t.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    ax = dx / d; ay = dy / d;
  }
  const al = Math.hypot(ax, ay) || 1;
  ax /= al; ay /= al;

  for (let k = 0; k < n; k++) {
    // 0 -> forward, 1 -> behind, 2 -> forward again, ...
    const flip = k % 2 === 0 ? 1 : -1;
    const dx = ax * flip, dy = ay * flip;
    const cx = p.x + dx * reach * 0.5, cy = p.y + dy * reach * 0.5;

    const hits = world.spatialQuery(cx, cy, reach * 0.8, SCR);
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      if (!e.alive) continue;
      const ex = e.x - p.x, ey = e.y - p.y;
      const d = Math.hypot(ex, ey);
      if (d > reach + (e.radius || 6)) continue;
      // inside the cone?
      if (d > 1 && (ex * dx + ey * dy) / d < Math.cos(HALF)) continue;
      applyDamage(world, e, dmg, { weaponId: w.id, knock: st.knock, kx: dx, ky: dy });
    }
    if (w.def.cuts) {
      // sweep the arc itself, so threads in the swing path are severed
      const a0 = Math.atan2(dy, dx) - HALF, a1 = Math.atan2(dy, dx) + HALF;
      const steps = 3;
      for (let sIx = 0; sIx < steps; sIx++) {
        const b0 = a0 + (a1 - a0) * (sIx / steps);
        const b1 = a0 + (a1 - a0) * ((sIx + 1) / steps);
        severSweep(world, p.x + Math.cos(b0) * reach * 0.85, p.y + Math.sin(b0) * reach * 0.85,
                          p.x + Math.cos(b1) * reach * 0.85, p.y + Math.sin(b1) * reach * 0.85,
                          reach * 0.3);
      }
    }
    world.events.push({ t: 'swing', x: p.x, y: p.y, ax: dx, ay: dy, r: reach,
                        half: HALF, weaponId: w.id, colour: w.def.colour });
  }
  w.phase++;
}

/** Projectiles toward the acquired target. */
function fireShot(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  const aim = aimAt(world, w, 420);
  const spread = n > 1 ? 0.34 : 0;

  for (let k = 0; k < n; k++) {
    const off = n > 1 ? (k / (n - 1) - 0.5) * spread * n : 0;
    const a = Math.atan2(aim.y, aim.x) + off;
    spawnProjectile(world, w, st, S, p.x, p.y, Math.cos(a), Math.sin(a));
  }
}

/** A thrown blade that comes back. Implemented as a projectile with a return flag. */
function fireBoomerang(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  const aim = aimAt(world, w, 420);
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(aim.y, aim.x) + (k - (n - 1) / 2) * 0.5;
    const pr = spawnProjectile(world, w, st, S, p.x, p.y, Math.cos(a), Math.sin(a));
    if (pr) { pr.data = { boomerang: true, t: 0, turn: (st.duration || 0.9) * S.duration }; }
  }
}

/** Orbiting bodies. `speed` is rad/s. */
function stepOrbit(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  const r = (st.area || 40) * S.area;
  const dmg = (st.damage || 1) * S.might;
  w.t += DT * (st.speed || 2.2) * (S.haste || 1);

  for (let k = 0; k < n; k++) {
    const a = w.t + (k / n) * TAU;
    const ox = p.x + Math.cos(a) * r, oy = p.y + Math.sin(a) * r;
    const hits = world.spatialQuery(ox, oy, 11 + r * 0.06, SCR);
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      if (!e.alive) continue;
      // Orbits would otherwise hit 60 times a second; gate per enemy.
      if (e.orbHit && world.tick - e.orbHit < 26) continue;
      e.orbHit = world.tick;
      applyDamage(world, e, dmg, { weaponId: w.id, knock: st.knock,
                                   kx: Math.cos(a), ky: Math.sin(a) });
    }
    if (w.def.cuts && (world.tick + k) % 4 === 0) {
      const px = p.x + Math.cos(a - 0.35) * r, py = p.y + Math.sin(a - 0.35) * r;
      severSweep(world, px, py, ox, oy, 13);
    }
    world.events.push({ t: 'orb', x: ox, y: oy, r: 7, weaponId: w.id, colour: w.def.colour });
  }
}

/** A damaging field centred on the player. */
function stepAura(world, w, st, S) {
  const p = world.player;
  const r = (st.area || 50) * S.area;
  w.cd -= DT;
  world.events.push({ t: 'aura', x: p.x, y: p.y, r, weaponId: w.id, colour: w.def.colour });
  if (w.cd > 0) return;
  w.cd += Math.max(0.12, (st.cooldown || 0.6) / (S.haste || 1));

  const dmg = (st.damage || 1) * S.might;
  const hits = world.spatialQuery(p.x, p.y, r, SCR);
  for (let i = 0; i < hits.length; i++) {
    const e = hits[i];
    if (!e.alive) continue;
    applyDamage(world, e, dmg, { weaponId: w.id, knock: st.knock,
                                 kx: (e.x - p.x), ky: (e.y - p.y) });
  }
  if (w.def.cuts) {
    // sweep the ring, not the centre: the threads live at the edge of the field
    for (let k = 0; k < 4; k++) {
      const a0 = w.t + k * (TAU / 4), a1 = a0 + TAU / 4;
      severSweep(world, p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r,
                        p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r, 14);
    }
    w.t += 0.4;
  }
}

/** Drops a lingering hazard at or near the target. */
function fireZone(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  for (let k = 0; k < n; k++) {
    const aim = aimAt(world, w, 300);
    const dist = 40 + world.rng.next() * 90;
    const h = world.hazards.alloc();
    if (!h) return;
    h.id = world.nextId++;
    h.x = aim.target ? aim.target.x : p.x + aim.x * dist;
    h.y = aim.target ? aim.target.y : p.y + aim.y * dist;
    h.r = (st.area || 40) * S.area;
    h.damage = (st.damage || 1) * S.might;
    h.tickRate = 0.35;
    h.acc = 0;
    h.life = (st.duration || 3) * S.duration;
    h.kind = w.id;
    h.hostile = false;
    h.ownerWeapon = w.id;
    h.colour = w.def.colour;
    h.knock = st.knock || 0;
  }
}

/** Lightning that jumps. `count` is the number of jumps. */
function fireChain(world, w, st, S) {
  const p = world.player;
  let from = p;
  const jumps = Math.max(1, (st.count | 0) + S.amount);
  const dmg = (st.damage || 1) * S.might;
  const hop = (st.area || 120) * S.area;
  const seen = w.data.seen || (w.data.seen = new Set());
  seen.clear();

  for (let j = 0; j < jumps; j++) {
    const near = world.spatialQuery(from.x, from.y, hop, SCR);
    let best = null, bd = 1e9;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive || seen.has(e.id)) continue;
      // Chains prefer strung bodies: the thread conducts.
      const bias = e.stringId ? 0.5 : 1;
      const d = ((e.x - from.x) ** 2 + (e.y - from.y) ** 2) * bias;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    seen.add(best.id);
    world.events.push({ t: 'bolt', x0: from.x, y0: from.y, x1: best.x, y1: best.y,
                        weaponId: w.id, colour: w.def.colour });
    if (w.def.cuts) severSweep(world, from.x, from.y, best.x, best.y, 12);
    applyDamage(world, best, dmg, { weaponId: w.id, knock: st.knock,
                                    kx: best.x - from.x, ky: best.y - from.y });
    applyShock(world, best, dmg * 0.25, 0.6);
    from = best;
  }
}

/** Lightning from above onto random targets. */
function fireStrike(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  const r = (st.area || 34) * S.area;
  const dmg = (st.damage || 1) * S.might;
  const near = world.spatialQuery(p.x, p.y, 300, SCR);
  for (let k = 0; k < n; k++) {
    let tx, ty;
    if (near.length) {
      const e = near[(world.rng.next() * near.length) | 0];
      tx = e.x; ty = e.y;
    } else {
      const a = world.rng.next() * TAU, d = 60 + world.rng.next() * 160;
      tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d;
    }
    const hits = world.spatialQuery(tx, ty, r, SCR);
    for (let i = 0; i < hits.length; i++) {
      if (!hits[i].alive) continue;
      applyDamage(world, hits[i], dmg, { weaponId: w.id, knock: st.knock,
                                         kx: hits[i].x - tx, ky: hits[i].y - ty });
    }
    if (w.def.cuts) severSweep(world, tx, ty - r, tx, ty + r, r * 0.6);
    world.events.push({ t: 'strike', x: tx, y: ty, r, weaponId: w.id, colour: w.def.colour });
  }
}

/** A puppet of your own. */
function fireSummon(world, w, st, S) {
  const p = world.player;
  const n = Math.max(1, (st.count | 0) + S.amount);
  for (let k = 0; k < n; k++) {
    const a = world.allies.alloc();
    if (!a) return;
    a.id = world.nextId++;
    a.x = p.x + (world.rng.next() - 0.5) * 40;
    a.y = p.y + (world.rng.next() - 0.5) * 40;
    a.hp = 1;
    a.damage = (st.damage || 8) * S.might;
    a.life = world.alliesEternal ? 1e9 : (st.duration || 6) * S.duration;
    a.cd = 0;
    a.def = null;
  }
}

/** A damaging trail dropped behind the player as they move. */
function stepTrail(world, w, st, S) {
  const p = world.player;
  w.cd -= DT;
  if (w.cd > 0) return;
  w.cd += Math.max(0.1, (st.cooldown || 0.4) / (S.haste || 1));
  if (Math.hypot(p.vx, p.vy) < 4) return;     // standing still lays nothing

  const h = world.hazards.alloc();
  if (!h) return;
  h.id = world.nextId++;
  h.x = p.x; h.y = p.y;
  h.r = (st.area || 22) * S.area;
  h.damage = (st.damage || 1) * S.might;
  h.tickRate = 0.3;
  h.acc = 0;
  h.life = (st.duration || 2.5) * S.duration;
  h.kind = w.id;
  h.hostile = false;
  h.ownerWeapon = w.id;
  h.colour = w.def.colour;
  h.knock = 0;
}

// ---------------------------------------------------------------------------

function spawnProjectile(world, w, st, S, x, y, dx, dy) {
  const pr = world.projectiles.alloc();
  if (!pr) return null;
  pr.id = world.nextId++;
  pr.x = x; pr.y = y;
  const sp = (st.speed || 220);
  pr.vx = dx * sp; pr.vy = dy * sp;
  pr.damage = (st.damage || 1) * S.might;
  pr.pierce = (st.pierce | 0) + S.pierce;
  pr.life = (st.duration || 1.6) * S.duration;
  pr.radius = 4 + (st.area || 8) * S.area * 0.1;
  pr.cuts = !!w.def.cuts;
  pr.hostile = false;
  pr.ownerWeapon = w.id;
  pr.kind = w.id;
  pr.colour = w.def.colour;
  pr.knock = st.knock || 0;
  pr.rot = Math.atan2(dy, dx);
  pr.scale = 1;
  pr.hitSet.clear();
  return pr;
}

export { spawnProjectile };
