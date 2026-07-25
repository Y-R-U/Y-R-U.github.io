// The utility slot: smoke screens, field repairs, nitro, EMP, scatter mines
// and the drone strike. Each one is a verb the player spends a charge on.

import * as THREE from 'three';
import { clamp01, rand } from './utils.js';
import { actorRoot, glowBasic } from './render.js';
import { terrainHeight } from './terrain.js';
import { spawnSmoke, spawnExplosion, spawnRing, spawnFlash } from './particles.js';
import { launch, applyBlast } from './projectiles.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';
import { emit } from './bus.js';

const _v = new THREE.Vector3();

// A fake weapon definition so a called-in strike uses the real shell pipeline.
const STRIKE_SHELL = {
  id: 'strike', kind: 'arc', dmg: 0, splashR: 9, splashDmg: 46, speed: 70,
  reload: 0, pen: 0.4, arc: 'high', wind: 0.2, shells: 1, spread: 0.02,
  craterR: 6, craterD: 1.3, propMul: 2.0, tracer: 0xffd750,
};

export function useUtility(tank, util, opts = {}) {
  switch (util.id) {
    case 'repair':
      tank.healOverTime(tank.hpMax * util.heal, util.dur);
      spawnRing(tank.pos, 5, 0x6aff9a);
      AudioFX.pickup();
      emit('utility', { id: 'repair', label: 'REPAIRING' });
      return true;

    case 'smoke':
      dropSmoke(tank.pos, util.radius, util.dur);
      AudioFX.gun('burst', 0.5);
      emit('utility', { id: 'smoke', label: 'SMOKE OUT' });
      return true;

    case 'boost':
      tank.boostTimer = util.dur;
      tank.boostMul = util.mul;
      tank.ramDmg = util.ram;
      AudioFX.horn();
      emit('utility', { id: 'boost', label: 'NITRO' });
      return true;

    case 'emp': {
      let hits = 0;
      for (const t of state.tanks) {
        if (t === tank || !t.alive || t.faction === tank.faction) continue;
        if (t.pos.distanceTo(tank.pos) > util.radius) continue;
        t.empTimer = util.dur;
        hits++;
      }
      if (state.drone && !tank.isPlayer) state.drone.damage(20);
      empFx(tank.pos, util.radius);
      emit('utility', { id: 'emp', label: hits ? `EMP · ${hits} SEIZED` : 'EMP · NO CONTACT' });
      return true;
    }

    case 'mines':
      for (let i = 0; i < util.count; i++) {
        const a = (i / util.count) * Math.PI * 2 + rand(-0.3, 0.3);
        const r = 3.6 + rand(0, 2.4);
        dropMine(
          tank.pos.x - tank.forwardX * 4 + Math.cos(a) * r,
          tank.pos.z - tank.forwardZ * 4 + Math.sin(a) * r,
          util.dmg, util.radius, tank);
      }
      AudioFX.click();
      emit('utility', { id: 'mines', label: 'MINES ARMED' });
      return true;

    case 'strike': {
      const target = opts.target || (state.drone && state.drone.marked);
      if (!target || !target.alive) {
        emit('utility', { id: 'strike', label: 'NO MARK — PAINT A TARGET', failed: true });
        return false;
      }
      state.strikes.push({
        x: target.pos.x, z: target.pos.z, left: util.shells, t: 0,
        gap: 0.42, owner: tank, target,
      });
      AudioFX.horn();
      emit('utility', { id: 'strike', label: 'STRIKE INBOUND' });
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Smoke screens
// ---------------------------------------------------------------------------

export function dropSmoke(pos, radius, dur) {
  state.smokes.push({
    x: pos.x, z: pos.z, r: radius, life: dur, max: dur, puffT: 0,
  });
}

function updateSmokes(dt) {
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    const s = state.smokes[i];
    s.life -= dt;
    if (s.life <= 0) { state.smokes.splice(i, 1); continue; }
    s.puffT -= dt;
    if (s.puffT <= 0) {
      s.puffT = 0.1;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * s.r;
      _v.set(s.x + Math.cos(a) * r, terrainHeight(s.x, s.z) + rand(0.4, 3.4), s.z + Math.sin(a) * r);
      spawnSmoke(_v, {
        scale: 3.2, life: 2.6, colour: 0xb8b4ae, rise: 0.7, drift: 0.6,
        opacity: 0.42, grow: 1.9,
      });
    }
    // anyone inside is hidden
    for (const t of state.tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.pos.x - s.x, t.pos.z - s.z) < s.r) t.smokeTimer = 0.4;
    }
  }
}

function empFx(pos, radius) {
  spawnRing(pos, radius * 1.1, 0x8ad4ff);
  spawnFlash(_v.copy(pos).setY(pos.y + 2), 3.5, 0x8ad4ff);
  AudioFX.blip(180, 0.5, 0.16);
  AudioFX.blip(1400, 0.3, 0.1, 0.04);
}

// ---------------------------------------------------------------------------
// Mines
// ---------------------------------------------------------------------------

let mineGeo = null;
let mineMat = null;

export function dropMine(x, z, dmg, radius, owner) {
  if (!mineGeo) {
    mineGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8);
    mineMat = glowBasic(0xff5a4a, 1.6);
  }
  const mesh = new THREE.Mesh(mineGeo, mineMat);
  mesh.position.set(x, terrainHeight(x, z) + 0.18, z);
  actorRoot.add(mesh);
  state.mines.push({ mesh, x, z, dmg, radius, owner, arm: 0.7, life: 45, blink: 0 });
}

function updateMines(dt) {
  for (let i = state.mines.length - 1; i >= 0; i--) {
    const m = state.mines[i];
    m.life -= dt;
    m.arm -= dt;
    m.blink += dt * 6;
    m.mesh.scale.y = 1 + Math.sin(m.blink) * 0.25;
    if (m.life <= 0) { removeMine(i); continue; }
    if (m.arm > 0) continue;
    for (const t of state.tanks) {
      if (!t.alive) continue;
      if (m.owner && t.faction === m.owner.faction) continue;
      if (Math.hypot(t.pos.x - m.x, t.pos.z - m.z) > 3.4) continue;
      _v.set(m.x, terrainHeight(m.x, m.z) + 0.4, m.z);
      spawnExplosion(_v, { scale: 1.5, colour: 0xffb347, craterR: 4, craterD: 0.9 });
      applyBlast({
        pos: _v, radius: m.radius, dmg: m.dmg, owner: m.owner,
        byPlayer: !!(m.owner && m.owner.isPlayer),
      });
      removeMine(i);
      break;
    }
  }
}

function removeMine(i) {
  const m = state.mines[i];
  actorRoot.remove(m.mesh);
  state.mines.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Called-in barrages
// ---------------------------------------------------------------------------

function updateStrikes(dt) {
  for (let i = state.strikes.length - 1; i >= 0; i--) {
    const s = state.strikes[i];
    s.t -= dt;
    if (s.t > 0) continue;
    s.t = s.gap;
    s.left--;
    // walk the barrage around the mark, tracking a moving target loosely
    const tx = (s.target && s.target.alive ? s.target.pos.x * 0.5 + s.x * 0.5 : s.x) + rand(-5, 5);
    const tz = (s.target && s.target.alive ? s.target.pos.z * 0.5 + s.z * 0.5 : s.z) + rand(-5, 5);
    const from = _v.set(tx + rand(-6, 6), terrainHeight(tx, tz) + 130, tz + rand(-6, 6));
    launch({
      from, pitch: -1.42, yaw: 0, gun: STRIKE_SHELL, owner: s.owner,
      byPlayer: !!(s.owner && s.owner.isPlayer), speedMul: 1.1, spreadMul: 3,
    });
    AudioFX.whistle(0.5, 1.4);
    if (s.left <= 0) state.strikes.splice(i, 1);
  }
}

export function updateUtilities(dt) {
  updateSmokes(dt);
  updateMines(dt);
  updateStrikes(dt);
}

export function clearUtilities() {
  for (let i = state.mines.length - 1; i >= 0; i--) removeMine(i);
  state.smokes.length = 0;
  state.strikes.length = 0;
}

// True if the line between two points passes through a live smoke screen.
export function smokeBlocks(ax, az, bx, bz) {
  for (const s of state.smokes) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((s.x - ax) * dx + (s.z - az) * dz) / len2;
    t = clamp01(t);
    const px = ax + dx * t - s.x;
    const pz = az + dz * t - s.z;
    if (px * px + pz * pz < s.r * s.r) return true;
  }
  return false;
}
