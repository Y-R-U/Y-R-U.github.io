// LASTWALL — the infected: types, AI (seek/windup/attack/stagger/climb),
// spawn director, damage pipeline (stagger → live ragdoll → death ragdoll →
// dismember), serum drops. Live enemies are clamped to the wall; ragdolls fly.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, clampRects, rand, randi, pick } from './utils.js';
import { makeHumanoid } from './models.js';
import { spawnRagdoll, dismember, reattach } from './ragdoll.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';

export const TYPES = {
  shambler: { hp: 34, spd: 2.3, dmg: 9,  kb: 10, windup: .4,  reach: 2.0, serum: [2, 4],  mass: 1 },
  sprinter: { hp: 20, spd: 5.4, dmg: 7,  kb: 8,  windup: .25, reach: 1.9, serum: [3, 5],  mass: .8 },
  brute:    { hp: 170,spd: 1.9, dmg: 24, kb: 58, windup: .65, reach: 2.6, serum: [10, 16], mass: 2.6, grab: true },
  bloater:  { hp: 44, spd: 2.7, dmg: 26, kb: 42, windup: .5,  reach: 2.4, serum: [6, 9],  mass: 1.2, boom: 5.5 },
  boss:     { hp: 950,spd: 2.5, dmg: 34, kb: 72, windup: .7,  reach: 3.2, serum: [80, 120], mass: 4, grab: true, boss: true },
};

let scene, level, getPlayer, hooks, mult;
export const enemies = [];
export const drops = []; // serum orbs
let killCount = 0;
export const kills = () => killCount;

export function initEnemies(sc, lvl, playerGetter, hk) {
  scene = sc; level = lvl; getPlayer = playerGetter; hooks = hk;
  enemies.length = 0; drops.length = 0; killCount = 0;
  const n = lvl.n, D = CFG.director;
  mult = {
    hp: 1 + D.hpGrow * (n - 1),
    dmg: 1 + D.dmgGrow * (n - 1),
    spd: Math.min(D.speedCap, 1 + D.speedGrow * (n - 1)),
    pack: 2 + Math.min(7, Math.floor(n * 0.45)),
  };
  for (const s of lvl.spawns) s.used = false;
  for (const c of lvl.climbs) c.used = false;
}

export function spawnEnemy(type, x, z, opts = {}) {
  const def = TYPES[type];
  if (enemies.length >= CFG.maxEnemies && !def.boss) return null; // population cap
  const h = makeHumanoid(type === 'boss' ? 'boss' : type);
  h.group.position.set(x, CFG.wallH, z);
  scene.add(h.group);
  const e = {
    h, type, def, boss: !!def.boss,
    hp: def.hp * mult.hp * (opts.hpMul || 1), maxHp: def.hp * mult.hp * (opts.hpMul || 1),
    x, z, vx: 0, vz: 0, yaw: rand(0, 6.28),
    state: opts.climb ? 'climb' : 'seek', tmr: opts.climb ? 1.3 : 0,
    shoveX: 0, shoveZ: 0, dead: false, rag: null, burnT: 0,
    onRagdollGone() { removeEnemy(e); },
  };
  if (opts.climb) h.group.position.y = CFG.wallH - 2.6;
  enemies.push(e);
  return e;
}

function removeEnemy(e) {
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
  // always drop the group: after ragdolling it's an empty invisible husk that
  // would otherwise pile up in the scene graph one node per kill
  scene.remove(e.h.group);
}

// ONE death-bookkeeping path (contract #2): flags, kill count, serum drop,
// VOLATILE STRAIN shove, boss hook. Every kill route funnels through here.
function killEnemy(e, opts = {}) {
  if (e.dead) return false;
  e.dead = true;
  killCount++;
  const amt = Math.round(randi(e.def.serum[0], e.def.serum[1]) * (opts.serumMult || 1));
  drops.push({ x: opts.x ?? e.x, z: opts.z ?? e.z, amt, t: opts.dropT || 20, mesh: null });
  if (hooks.mods?.().volatile) { // epic powerup: kills knock nearby infected back
    for (const o of enemies) {
      if (o === e || o.dead || o.state === 'rag') continue;
      const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1;
      if (d < 4.5) { o.shoveX += dx / d * 16; o.shoveZ += dz / d * 16; }
    }
    fx.ring(new THREE.Vector3(e.x, CFG.wallH + .5, e.z), 0xff7fc2, 4.5, .3);
  }
  if (e.boss) hooks.bossDown?.(e);
  return true;
}

export function nearestEnemy(x, z, maxR = 1e9) {
  let best = null, bd = maxR * maxR;
  for (const e of enemies) {
    if (e.dead || e.state === 'rag' || e.state === 'climb') continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// THE hit pipeline (contract #2): impulse = kbImpulse already includes all multipliers
export function damageEnemy(e, dmg, dirX, dirZ, kbImpulse, opts = {}) {
  if (e.dead || !enemies.includes(e)) return false;
  e.hp -= dmg;
  const pos = new THREE.Vector3(e.x, CFG.wallH + 1.1 * e.h.s, e.z);
  fx.blood(pos, Math.min(14, 4 + dmg * 0.15), 3.5 + kbImpulse * 0.04);
  const imp = kbImpulse / e.def.mass;
  if (e.hp <= 0) {
    killEnemy(e, { serumMult: opts.serumMult });
    if (e.def.boom && !opts.noBoom) { explodeBloater(e); return true; }
    // cap launch speed so the comedy arc stays on screen
    const hv = Math.min(imp * .55, 26), vv = Math.min(2.5 + imp * .28, 15);
    const v = new THREE.Vector3(dirX * hv, vv, dirZ * hv);
    e.rag = spawnRagdoll(e.h, v, e, { dead: true });
    e.state = 'rag';
    // overkill dismember
    if (dmg > e.maxHp * 1.1 || imp > 55) {
      const parts = pick([['head'], ['farmL'], ['farmR'], ['head', 'farmR'], ['shinL']]);
      for (const p of parts) if (dismember(e.rag, p)) fx.blood(pos, 10, 7);
    }
    sfx.squelch();
    return true;
  }
  sfx.thud();
  if (imp >= CFG.ragdollThresh && e.state !== 'rag') {
    const hv = Math.min(imp * .5, 24), vv = Math.min(1.8 + imp * .22, 13);
    const v = new THREE.Vector3(dirX * hv, vv, dirZ * hv);
    e.rag = spawnRagdoll(e.h, v, e, { dead: false });
    e.state = 'rag';
  } else {
    e.shoveX += dirX * imp * .5; e.shoveZ += dirZ * imp * .5;
    // heavies shrug off light hits — no stun-locking brutes/bosses with a pistol
    if (imp >= e.def.mass * 5) { e.state = 'stagger'; e.tmr = .28 + imp * .01; }
  }
  return false;
}

// blast damage/launch around (x,z) — level-scaled; chains are allowed by design
function boomAoE(e, x, z) {
  fx.explosion(new THREE.Vector3(x, CFG.wallH + 1, z), e.def.boom);
  sfx.boom();
  for (const o of [...enemies]) {
    if (o === e || o.dead) continue;
    const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
    if (d < e.def.boom + 1.5) damageEnemy(o, 30 * mult.dmg, dx / (d || 1), dz / (d || 1), 46 * mult.dmg);
  }
  const P = getPlayer();
  const pd = Math.hypot(P.x - x, P.z - z);
  if (pd < e.def.boom + 1) P.hurt(e.def.dmg * mult.dmg, (P.x - x) / (pd || 1), (P.z - z) / (pd || 1), 40);
}

// full detonation for a still-standing bloater: gib ragdoll + AoE.
// NEVER call on an already-ragdolled enemy (its meshes are owned by the rag) —
// slam-kills use boomAoE + dismember on the existing rag instead.
function explodeBloater(e) {
  const v = new THREE.Vector3(rand(-1, 1) * 14, 11, rand(-1, 1) * 14);
  e.rag = spawnRagdoll(e.h, v, e, { dead: true, spin: 3 });
  for (const p of ['head', 'farmL', 'farmR', 'shinR']) dismember(e.rag, p);
  e.state = 'rag';
  boomAoE(e, e.x, e.z);
}

// ragdoll callbacks glue (main registers these on initRagdolls)
export const ragCallbacks = {
  slam(rag, p, spd) {
    sfx.crunch(); fx.addShake(.25);
    fx.blood(new THREE.Vector3(p.x, p.y, p.z), 8, 5);
    const e = rag.ent;
    if (e && !e.dead && e.def) {
      e.hp -= CFG.slamDmg + spd * .6;
      if (e.hp <= 0 && killEnemy(e, { x: p.x, z: p.z })) {
        rag.dead = true;
        hooks.toast?.('SLAMMED', 'drop');
        // a bloater smashed against the parapet still pops
        if (e.def.boom) { boomAoE(e, p.x, p.z); dismember(rag, 'head'); dismember(rag, 'farmL'); }
      }
    }
  },
  fall(rag) {
    sfx.scream();
    const e = rag.ent;
    if (e && e.def && !e.fellCredit) {
      e.fellCredit = true;
      if (killEnemy(e, { x: rag.pts.hip.x, z: rag.pts.hip.z, serumMult: 1.5, dropT: 8 })) {
        rag.dead = true;
        hooks.toast?.('LONG DROP +50%', 'drop');
        hooks.longDrop?.();
      }
    }
  },
  splat(rag) { sfx.splat(); },
  land(p, v) { if (Math.abs(v) > 12) sfx.thud(); },
  getup(rag) {
    const e = rag.ent;
    if (!e || e.dead || !e.def) return;
    const pos = reattach(rag);
    e.rag = null;
    const c = clampRects(level.rects, pos.x, pos.z, .7);
    e.x = c.x; e.z = c.z;
    e.h.group.position.set(e.x, CFG.wallH, e.z);
    e.state = 'stagger'; e.tmr = .5;
  },
};

// ---------- per-frame ----------
export function tickEnemies(dt, t) {
  const P = getPlayer();
  // cull live stragglers left far behind — they'd chase forever, and an
  // unbounded population turns sprint-past play into an O(n²) slideshow
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.boss || e.dead || e.state === 'rag') continue;
    if (Math.hypot(e.x - P.x, e.z - P.z) > 85) removeEnemy(e);
  }
  // director: activate spawn/climb points near player
  for (const s of level.spawns) {
    if (s.used) continue;
    const d = Math.hypot(s.x - P.x, s.z - P.z);
    if (d < 42 && d > 14) {
      s.used = true;
      const n = randi(Math.max(2, mult.pack - 2), mult.pack);
      for (let i = 0; i < n; i++) spawnEnemy(pickType(level.n), s.x + rand(-3, 3), s.z + rand(-3, 3));
    }
  }
  for (const c of level.climbs) {
    if (c.used) continue;
    if (Math.hypot(c.x - P.x, c.z - P.z) < 15) {
      c.used = true;
      hooks.toast?.('THEY CLIMB THE WALL');
      const n = randi(3, 5);
      for (let i = 0; i < n; i++) {
        const along = rand(-4, 4);
        const r = level.rects.find(r => !r.dead && c.x >= r.x0 && c.x <= r.x1 && c.z >= r.z0 && c.z <= r.z1);
        if (!r) continue; // this climber's spot is gone (collapsed span) — others still spawn
        let ex, ez;
        if (c.axis === 'x') { ex = c.edge === 'lo' ? r.x0 + .8 : r.x1 - .8; ez = c.z + along; }
        else { ez = c.edge === 'lo' ? r.z0 + .8 : r.z1 - .8; ex = c.x + along; }
        spawnEnemy(pickType(level.n), ex, ez, { climb: true });
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.state === 'rag') continue; // ragdoll module owns it
    if (e.dead) { removeEnemy(e); continue; }
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 1e-4;
    const dS = e.def.spd * mult.spd;
    switch (e.state) {
      case 'climb':
        e.tmr -= dt;
        e.h.group.position.y = CFG.wallH - 2.6 + (1.3 - Math.max(0, e.tmr)) / 1.3 * 2.6;
        if (e.tmr <= 0) { e.state = 'seek'; e.h.group.position.y = CFG.wallH; }
        break;
      case 'seek': {
        let mx = dx / dist * dS, mz = dz / dist * dS;
        // separation
        for (const o of enemies) {
          if (o === e || o.state === 'rag') continue;
          const sx = e.x - o.x, sz = e.z - o.z, sd = sx * sx + sz * sz;
          if (sd < 1.44 && sd > 1e-6) { const s = Math.sqrt(sd); mx += sx / s * 2.2; mz += sz / s * 2.2; }
        }
        e.x += (mx + e.shoveX) * dt; e.z += (mz + e.shoveZ) * dt;
        e.shoveX *= Math.exp(-5 * dt); e.shoveZ *= Math.exp(-5 * dt);
        const c = clampRects(level.rects, e.x, e.z, .6);
        e.x = c.x; e.z = c.z;
        e.yaw = Math.atan2(dx, dz);
        if (dist < e.def.reach * (e.def.boom ? 1.1 : 0.9)) { e.state = 'wind'; e.tmr = e.def.windup; }
        break;
      }
      case 'wind':
        e.tmr -= dt;
        e.yaw = Math.atan2(dx, dz);
        // telegraph: rear back
        e.h.parts.chest.pivot.rotation.x = -0.35;
        if (e.tmr <= 0) {
          if (e.def.boom) { e.hp = 0; killEnemy(e); explodeBloater(e); break; }
          e.state = 'attack'; e.tmr = .18;
          if (dist < e.def.reach + .6) {
            const kbI = e.def.kb * mult.dmg;
            P.hurt(e.def.dmg * mult.dmg, dx / dist, dz / dist, kbI);
            if (e.def.grab) { sfx.roar(); fx.addShake(.4); }
          }
        }
        break;
      case 'attack':
        e.tmr -= dt;
        // lunge
        e.x += dx / dist * dS * 2.2 * dt; e.z += dz / dist * dS * 2.2 * dt;
        { const c = clampRects(level.rects, e.x, e.z, .6); e.x = c.x; e.z = c.z; }
        if (e.tmr <= 0) { e.state = 'seek'; }
        break;
      case 'stagger':
        e.tmr -= dt;
        e.x += e.shoveX * dt; e.z += e.shoveZ * dt;
        e.shoveX *= Math.exp(-6 * dt); e.shoveZ *= Math.exp(-6 * dt);
        { const c = clampRects(level.rects, e.x, e.z, .6); e.x = c.x; e.z = c.z; }
        if (e.tmr <= 0) e.state = 'seek';
        break;
    }
    if (e.state !== 'climb') e.h.group.position.set(e.x, CFG.wallH, e.z);
    e.h.group.rotation.y = e.yaw;
    const spdNorm = e.state === 'seek' ? clamp(dS / 6, .3, 1) : .1;
    e.h.animate(t, spdNorm, dt);
    if (e.state === 'wind') { // arms raised telegraph (after animate)
      const k = 1 - e.tmr / e.def.windup;
      e.h.parts.uarmL.pivot.rotation.x = -2.4 * k; e.h.parts.uarmR.pivot.rotation.x = -2.4 * k;
    }
    // burn dot
    if (e.burnT > 0) {
      e.burnT -= dt;
      if ((e.burnTick = (e.burnTick || 0) - dt) <= 0) { e.burnTick = .4; damageEnemy(e, 4, 0, 0, 0); }
    }
  }

  // serum orbs: magnet to player
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (!d.mesh) {
      const c = clampRects(level.rects, d.x, d.z, .8); d.x = c.x; d.z = c.z; // orbs land on the wall
      d.mesh = fx.pickupMesh('serum'); d.mesh.scale.setScalar(.5); d.mesh.position.set(d.x, CFG.wallH + .7, d.z); scene.add(d.mesh);
    }
    d.t -= dt;
    const dx = P.x - d.x, dz = P.z - d.z, dist = Math.hypot(dx, dz);
    if (dist < 7) { d.x += dx / dist * 14 * dt; d.z += dz / dist * 14 * dt; }
    d.mesh.position.set(d.x, CFG.wallH + .7 + Math.sin(t * 3 + i) * .15, d.z);
    d.mesh.rotation.y += dt * 3;
    if (dist < 1.1) { hooks.serum?.(d.amt); sfx.pickup(); scene.remove(d.mesh); drops.splice(i, 1); }
    else if (d.t <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
  }
}

function pickType(n) {
  const r = Math.random();
  if (n >= 4 && r < 0.10 + n * 0.004) return 'brute';
  if (n >= 3 && r < 0.24) return 'bloater';
  if (n >= 2 && r < 0.55) return 'sprinter';
  return 'shambler';
}

export function spawnBoss(x, z) {
  sfx.roar();
  return spawnEnemy('boss', x, z);
}
