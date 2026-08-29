// The wall of red, and the thing at the end of it.
//
// Two completely different budgets live in this file. The blocks are hundreds
// of bodies that must cost almost nothing each: one InstancedMesh plus its
// outline shell for every enemy in the level, positions written straight into
// the instance matrix by the crowd from `units.js`/`toon.js`, no Object3D per
// man and no allocation in a frame. The boss is the opposite — three draw calls
// spent on one unit, because it is the only enemy the player ever looks *at*
// rather than through.
//
// WHY GROUPS, AND WHY THEY ARE CONTIGUOUS. Hit testing is the hot path: every
// bullet, every substep, asks "is anything here?". Testing 500 units per bullet
// is a quarter of a million distance checks a frame. So each block keeps an AABB
// refreshed once a frame — a bullet that misses the box skips all sixty of its
// men for four compares — and a block's men occupy one contiguous span of the
// unit arrays, so the scan inside a box is a tight loop over ~60 entries rather
// than a filtered pass over the whole pool. Retiring a block frees a whole span
// at once, which is what keeps the pool from filling up over a 600 m level.
//
// THE RIPPLE. A hit damages the nearest man in full and splashes into his
// neighbours. That is not a fairness feature, it is the look: the reference's
// front rank does not lose scattered individuals, it dissolves from the point
// the fire is landing. Splash plus a per-man hit flash plus wear-darkening as
// hp drops is what produces that out of an otherwise uniform grid.

import * as THREE from 'three';
import { PAL, TIERS, RUN, ROAD, GUN, DEV_MODE } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, rand, randInt } from './utils.js';
import { makeCrowd, partBox, mergeParts, flatMat, outlineMat } from './toon.js';
import { explode, sparkBurst, impactFlash, smokePuff, shockRing, floatNumber } from './vfx.js';
import { sfx } from './audio.js';
import { addShake } from './render.js';
import { makeTierCrowd } from './units.js';

// --------------------------------------------------------------------------
// Pools
// --------------------------------------------------------------------------

let MAXE = 480;
const MAXG = 16;

// Per-unit, structure of arrays. `uox`/`uoz` are the man's slot inside his
// block, so a marching column moves by writing ONE group position per frame
// rather than sixty unit positions.
let ux, uz, uox, uoz, uhp, umax, ugi, ust, udt, uph, ufl, usc;
let un = 0;

// Per-group. `gs`/`ge` are the half-open span of unit indices this group owns.
const gx = new Float32Array(MAXG), gz = new Float32Array(MAXG);
const gs = new Int32Array(MAXG), ge = new Int32Array(MAXG);
const gspd = new Float32Array(MAXG), gfire = new Float32Array(MAXG);
const galive = new Int32Array(MAXG), gform = new Uint8Array(MAXG);
const gminx = new Float32Array(MAXG), gmaxx = new Float32Array(MAXG);
const gminz = new Float32Array(MAXG), gmaxz = new Float32Array(MAXG);
const gdps = new Float32Array(MAXG), gn0 = new Float32Array(MAXG);
const glive = new Uint8Array(MAXG);
let gn = 0;

const FORM = { block: 0, column: 1, skirmish: 2 };
// The boss is built at soldier scale and then blown up, so one number moves the
// model, its hit box and its muzzle positions together. It has to tower over an
// eleven-metre-wide crowd without leaving the road.
const BOSS_S = 1.4;
const DIE_T = 0.55;
const SPACING = 0.62;
const FIRE_RANGE = 46;      // metres at which a block opens up on the squad

let crowd = null, group = null;
let pending = [];            // enemy specs not yet streamed in, sorted by z
let pendIdx = 0;
let levelNo = 1;
let needCollect = false;

// --------------------------------------------------------------------------
// Fallback body — only used while units.js is a stub
// --------------------------------------------------------------------------
// `makeTierCrowd` belongs to another agent. If it is not there yet we build the
// same shape locally out of toon.js parts, with the same `aPart` rig tags, so
// the gait and the outline are identical either way. This exists so gunfire can
// be art-directed before the unit ladder lands, not as a permanent path.

function fallbackGeo() {
  return mergeParts([
    partBox(0.20, 0.78, 0.22, -0.16, 0.39, 0, 1),
    partBox(0.20, 0.78, 0.22, 0.16, 0.39, 0, 2),
    partBox(0.56, 0.66, 0.36, 0, 1.10, 0, 0),
    partBox(0.16, 0.52, 0.18, -0.35, 1.12, 0, 3),
    partBox(0.16, 0.52, 0.18, 0.35, 1.12, 0, 4),
    partBox(0.36, 0.34, 0.36, 0, 1.60, 0, 5),
    partBox(0.46, 0.10, 0.46, 0, 1.76, 0, 5),
    partBox(0.10, 0.10, 0.62, 0.30, 1.20, -0.24, 4),   // rifle: the silhouette
  ]);                                                   // has to read as armed
}

function buildCrowd(max) {
  let c = null;
  try {
    c = makeTierCrowd?.(0, {
      color: PAL.enemy, max, outline: 0.032, outlineColor: 0x4a0f0e,
      tint: true, castShadow: true,
    });
  } catch (e) { c = null; }
  if (c && typeof c.set === 'function' && c.group) return c;
  return makeCrowd(fallbackGeo(), {
    color: PAL.enemy, max, outline: 0.032, outlineColor: 0x4a0f0e, castShadow: true,
  });
}

// --------------------------------------------------------------------------
// The boss
// --------------------------------------------------------------------------

const boss = {
  on: false, dead: false, engaged: false, blew: false,
  hp: 0, max: 0, name: 'HEAVY', z: 0, x: 0, tier: 6,
  phase: 0, t: 0, fireT: 0, artT: 0, recoil: 0, dieT: 0, dps: 6, dmgSide: -1,
  group: null, hull: null, trim: null, outline: null,
  hullMat: null, trimMat: null, geos: null,
  tellX: 0, tellZ: 0, tellT: -1,
  dmgAcc: 0, dmgT: 0,
};

// One merged geometry for the hull and one for the trim: two lit draws plus one
// inverted-hull outline. Building it out of a Group of nine boxes would have
// been nine draw calls for one enemy.
function buildBoss(scene) {
  const hullGeo = mergeParts([
    partBox(1.00, 1.70, 1.20, -1.25, 0.90, 0, 0),        // legs
    partBox(1.00, 1.70, 1.20, 1.25, 0.90, 0, 0),
    partBox(1.25, 0.38, 1.75, -1.25, 0.19, -0.15, 0),    // feet
    partBox(1.25, 0.38, 1.75, 1.25, 0.19, -0.15, 0),
    partBox(2.30, 0.55, 1.45, 0, 2.00, 0, 0),            // hips
    partBox(3.10, 1.85, 1.75, 0, 3.05, 0, 0),            // torso
    partBox(1.10, 1.10, 1.50, -2.05, 3.45, 0, 0),        // shoulders
    partBox(1.10, 1.10, 1.50, 2.05, 3.45, 0, 0),
    partBox(1.20, 0.75, 1.05, 0, 4.35, -0.20, 0),        // head
  ]);
  const trimGeo = mergeParts([
    partBox(0.54, 0.54, 2.90, -2.15, 3.40, -1.55, 0),    // cannons, thrust
    partBox(0.54, 0.54, 2.90, 2.15, 3.40, -1.55, 0),     // forward at you
    partBox(2.10, 0.75, 0.22, 0, 3.20, -0.95, 0),        // chest plate
    partBox(0.95, 0.24, 0.18, 0, 4.42, -0.68, 0),        // visor
    partBox(2.60, 0.30, 1.55, 0, 1.72, 0, 0),            // waist band
    partBox(0.28, 0.90, 0.28, -1.05, 4.35, 0.55, 0),     // aerials
    partBox(0.28, 0.90, 0.28, 1.05, 4.35, 0.55, 0),
  ]);

  const hullMat = flatMat(PAL.boss, { flat: true });
  // The trim is the damage read-out: emissive climbs each phase, so the machine
  // itself tells you it is nearly dead without looking at the bar.
  const trimMat = flatMat(0x5c646c, { flat: true, emissive: 0xff2a12, emissiveIntensity: 0.14 });

  const g = new THREE.Group();
  g.scale.setScalar(BOSS_S);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  const outline = new THREE.Mesh(hullGeo, outlineMat(0.085, 0x1a0d22));
  outline.renderOrder = -1;
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.castShadow = true;
  g.add(outline, hull, trim);
  g.visible = false;
  scene.add(g);

  boss.group = g; boss.hull = hull; boss.trim = trim; boss.outline = outline;
  boss.hullMat = hullMat; boss.trimMat = trimMat;
  boss.geos = [hullGeo, trimGeo];
  return g;
}

// --------------------------------------------------------------------------
// Spawning
// --------------------------------------------------------------------------

function allocArrays(max) {
  ux = new Float32Array(max); uz = new Float32Array(max);
  uox = new Float32Array(max); uoz = new Float32Array(max);
  uhp = new Float32Array(max); umax = new Float32Array(max);
  ugi = new Int16Array(max); ust = new Uint8Array(max);
  udt = new Float32Array(max); uph = new Float32Array(max);
  ufl = new Float32Array(max); usc = new Float32Array(max);
}

// levels.js sizes an enemy item's `hp` as SECONDS of the squad's undivided fire
// rather than as a number, which is the only way a block stays a two-second
// problem at both twelve men and four hundred. Use it whenever it is there; the
// derived figure is a fallback for a hand-written or older LevelDef.
function hpFor(spec) {
  if (spec.hp > 0) return spec.hp;
  const tier = clamp(spec.tier | 0, 0, TIERS.length - 1);
  const base = 2.2 + levelNo * 0.42 + tier * 3.2;
  return base * (spec.form === 'skirmish' ? 2.4 : 1);
}

function spawnGroup(spec) {
  const gi = gn++;
  const form = FORM[spec.form] ?? 0;
  gx[gi] = spec.x || 0;
  gz[gi] = spec.z || 0;
  gspd[gi] = spec.speed || 0;
  gform[gi] = form;
  gfire[gi] = rand(0.2, 0.8);
  glive[gi] = 1;

  const count = Math.min(Math.max(1, spec.count | 0), MAXE - un);
  const w = Math.min(spec.w || 8, ROAD.halfW * 2);
  const hp = hpFor(spec);
  // Blocks and columns are grids that fill the road across and stack back —
  // that shape is the reference. Skirmishers scatter wide and shallow, so you
  // cannot sweep them with one line of fire.
  const cols = form === 2 ? 0 : clamp(Math.round(w / SPACING), 3, 20);

  gs[gi] = un;
  for (let k = 0; k < count; k++) {
    const i = un++;
    if (form === 2) {
      uox[i] = rand(-w * 0.9, w * 0.9);
      uoz[i] = rand(-1.5, 9);
    } else {
      const c = k % cols, r = (k / cols) | 0;
      uox[i] = (c - (cols - 1) / 2) * SPACING + rand(-0.07, 0.07);
      uoz[i] = r * SPACING * 0.92 + rand(-0.06, 0.06);
    }
    uhp[i] = umax[i] = hp;
    ugi[i] = gi;
    ust[i] = 0; udt[i] = 0;
    uph[i] = rand(6.283);
    ufl[i] = 0;
    usc[i] = rand(0.94, 1.06);
    ux[i] = gx[gi] + uox[i];
    uz[i] = gz[gi] + uoz[i];
  }
  ge[gi] = un;
  galive[gi] = count;
  // Men killed per second at FULL strength, from the level's own per-unit
  // figure. The 0.5 is the difference between the level generator's model —
  // "this is what ignoring the beat entirely costs you" — and the fact that a
  // block stays inside `FIRE_RANGE` for nearly four seconds, which is twice as
  // long as the generator assumes you spend on it.
  const per = spec.dps > 0 ? spec.dps : 0.55 * (1 + (spec.tier | 0) * 0.35);
  gdps[gi] = count * per * 0.5 * (form === 2 ? 1.3 : 1);
  gn0[gi] = Math.max(1, count);
  recomputeBounds(gi);
}

function recomputeBounds(gi) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = gs[gi]; i < ge[gi]; i++) {
    if (ust[i] !== 0) continue;
    const x = ux[i], z = uz[i];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  if (minx > maxx) { gminx[gi] = gminz[gi] = 1e9; gmaxx[gi] = gmaxz[gi] = -1e9; return; }
  gminx[gi] = minx - 0.6; gmaxx[gi] = maxx + 0.6;
  gminz[gi] = minz - 0.6; gmaxz[gi] = maxz + 0.6;
}

// Reclaim the spans of retired groups. Runs only on the frame a block is
// finally written off, which over a whole level is a handful of times.
function collect() {
  let w = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    const ns = w;
    for (let i = gs[g]; i < ge[g]; i++, w++) {
      if (w === i) continue;
      ux[w] = ux[i]; uz[w] = uz[i]; uox[w] = uox[i]; uoz[w] = uoz[i];
      uhp[w] = uhp[i]; umax[w] = umax[i]; ust[w] = ust[i]; udt[w] = udt[i];
      uph[w] = uph[i]; ufl[w] = ufl[i]; usc[w] = usc[i];
    }
    gs[g] = ns; ge[g] = w;             // spans rewritten in place, read first
  }
  un = w;
  let gw = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    if (gw !== g) {
      gx[gw] = gx[g]; gz[gw] = gz[g]; gs[gw] = gs[g]; ge[gw] = ge[g];
      gspd[gw] = gspd[g]; gfire[gw] = gfire[g]; galive[gw] = galive[g];
      gform[gw] = gform[g]; gdps[gw] = gdps[g]; gn0[gw] = gn0[g]; glive[gw] = 1;
      gminx[gw] = gminx[g]; gmaxx[gw] = gmaxx[g];
      gminz[gw] = gminz[g]; gmaxz[gw] = gmaxz[g];
    }
    for (let i = gs[gw]; i < ge[gw]; i++) ugi[i] = gw;
    gw++;
  }
  gn = gw;
  needCollect = false;
}

// --------------------------------------------------------------------------
// Damage
// --------------------------------------------------------------------------

const _killPos = { x: 0, y: 0, z: 0 };
const _kill = { pos: _killPos, kind: 'enemy' };
// One shared payload for every shot this file asks combat.js to fire. Listeners
// read it synchronously and must never retain it — that is the price of not
// allocating an object per bullet.
const _fire = {
  x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1,
  dmg: 1, n: 1, speed: 0, side: 1, spread: 0.05, len: 1.6,
  flash: true, flashScale: 0.7,
};
const _bossHp = { frac: 1 };

function killUnit(i) {
  ust[i] = 1;
  udt[i] = DIE_T;
  const gi = ugi[i];
  if (galive[gi] > 0) galive[gi]--;
  _killPos.x = ux[i]; _killPos.y = 0.8; _killPos.z = uz[i];
  emit('enemy:killed', _kill);
  // MANAGER: nothing in game.js listens to `enemy:killed`, and `endRun` reports
  // `state.kills` in the run stats — so this file is the only thing that can
  // move it off zero. Happy to hand it back if game.js takes the listener.
  state.kills++;
  sfx('kill');
}

// The ripple. Full damage to the man hit, 45% to anyone within a body's width,
// capped at four neighbours so a tank shell into a dense grid cannot turn into
// a sixty-unit loop inside a bullet's substep.
function damageAt(i, amount) {
  const gi = ugi[i];
  uhp[i] -= amount;
  ufl[i] = 0.16;
  if (uhp[i] <= 0 && ust[i] === 0) killUnit(i);

  let splashed = 0;
  const sx = ux[i], sz = uz[i];
  for (let j = gs[gi]; j < ge[gi] && splashed < 4; j++) {
    if (j === i || ust[j] !== 0) continue;
    const dx = ux[j] - sx, dz = uz[j] - sz;
    if (dx * dx + dz * dz > 0.9) continue;
    splashed++;
    uhp[j] -= amount * 0.45;
    ufl[j] = 0.12;
    if (uhp[j] <= 0) killUnit(j);
  }
}

// The reused hit descriptor combat.js gets back. One object, because a hit test
// that allocates runs eight hundred times a second.
const _hit = {
  i: -1, boss: false, x: 0, y: 0, z: 0,
  apply(damage) {
    if (this.boss) { damageBoss(damage, this.x, this.y, this.z); return; }
    if (this.i < 0 || ust[this.i] !== 0) return;
    damageAt(this.i, damage);
  },
};

export function enemyHitTest(x, y, z, r) {
  // Boss first. It stands in front of whatever is behind it and its hull is the
  // biggest target on screen; letting a block steal those shots reads as a bug.
  if (boss.on && !boss.dead && boss.engaged) {
    const dx = x - boss.x, dz = z - boss.z;
    if (Math.abs(dx) < 2.9 * BOSS_S + r && dz > -3.1 * BOSS_S - r && dz < 1.4 * BOSS_S + r && y < 5.2 * BOSS_S) {
      _hit.boss = true; _hit.x = x; _hit.y = y; _hit.z = z;
      return _hit;
    }
  }
  const rr = (r + 0.34) * (r + 0.34);
  for (let g = 0; g < gn; g++) {
    if (!glive[g] || galive[g] <= 0) continue;
    if (x < gminx[g] || x > gmaxx[g] || z < gminz[g] || z > gmaxz[g]) continue;
    for (let i = gs[g]; i < ge[g]; i++) {
      if (ust[i] !== 0) continue;
      const dx = ux[i] - x, dz = uz[i] - z;
      if (dx * dx + dz * dz <= rr) {
        _hit.boss = false; _hit.i = i; _hit.x = x; _hit.y = y; _hit.z = z;
        return _hit;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Boss damage and phases
// --------------------------------------------------------------------------

function damageBoss(amount, x, y, z) {
  if (!boss.on || boss.dead) return;
  boss.hp = Math.max(0, boss.hp - amount);
  state.bossHp = boss.hp;
  boss.dmgAcc += amount;
  _bossHp.frac = boss.max > 0 ? boss.hp / boss.max : 0;
  emit('boss:hp', _bossHp);
  sfx('bossHit');
  impactFlash(x, y, z, 0.9, 0xffd0a0);
  sparkBurst(x, y, z, 0, 0.3, -0.7, 3, 0xffd0a0, 9);

  const want = _bossHp.frac > 0.6 ? 0 : _bossHp.frac > 0.3 ? 1 : 2;
  if (want > boss.phase) enterPhase(want);
  if (boss.hp <= 0) startBossDeath();
}

function enterPhase(p) {
  boss.phase = p;
  boss.trimMat.emissiveIntensity = 0.14 + p * 0.5;
  sfx('bossPhase');
  addShake(0.5);
  // A shoulder cooks off at each phase change, so the escalation happens on the
  // model and not only on the health bar.
  explode({ x: boss.x + (p === 1 ? -2.0 : 2.0), y: 3.4, z: boss.z }, 1.1, PAL.fire);
  emit('hud:toast', { text: p === 1 ? 'ARMOUR BREACHED' : 'CRITICAL', icon: '⚠' });
}

function startBossDeath() {
  boss.dead = true;
  boss.dieT = 0;
  // Release the squad the instant it dies. Walking into the wreck while it
  // falls is a better beat than standing still for two more seconds.
  state.bossHp = 0;
  _bossHp.frac = 0;
  emit('boss:hp', _bossHp);
  addShake(0.7);
}

// --------------------------------------------------------------------------
// Enemy return fire
// --------------------------------------------------------------------------
// Blocks do not aim at individuals; they put a volume of fire at the squad's
// disc, and a handful of front-rank men are the visible source. combat.js owns
// every bullet in the game, so this goes over the bus — importing it here would
// make enemies↔combat a cycle.

function groupFire(g, dt) {
  gfire[g] -= dt;
  if (gfire[g] > 0) return;
  const period = gform[g] === 2 ? 0.62 : 0.5;
  gfire[g] = period * rand(0.85, 1.2);

  const dz = gz[g] - state.z;
  if (dz < -4 || dz > FIRE_RANGE) return;

  const shots = clamp(Math.round(galive[g] / 12), 1, 4);
  // Output falls with the body count. A block down to its last two men that
  // still shoots like sixty is the single most unfair thing this file could do.
  const strength = galive[g] / gn0[g];
  const per = (gdps[g] * strength * period) / shots;
  let fired = 0, guard = 0;
  while (fired < shots && guard++ < 40) {
    const i = randInt(gs[g], ge[g] - 1);
    if (ust[i] !== 0) continue;
    fired++;
    _fire.x = ux[i]; _fire.y = 1.2; _fire.z = uz[i] - 0.4;
    const tx = state.x - ux[i], tz = state.z - uz[i];
    const l = Math.hypot(tx, tz) || 1;
    _fire.dx = tx / l; _fire.dy = 0; _fire.dz = tz / l;
    _fire.dmg = per;
    _fire.n = 1;
    _fire.speed = GUN.bulletSpeed * 0.55;
    _fire.spread = 0.045;
    _fire.len = 1.6;
    _fire.side = 1;
    _fire.flash = true;
    _fire.flashScale = 0.55;
    emit('combat:fire', _fire);
  }
  if (fired) sfx('enemyShot');
}

// --------------------------------------------------------------------------
// Frame
// --------------------------------------------------------------------------

const _tint = [1, 1, 1];

export function updateEnemies(dt) {
  if (!crowd) return;
  crowd.update(dt);

  // --- stream groups in ahead of the squad ------------------------------
  while (pendIdx < pending.length && pending[pendIdx].z - state.z < 105 &&
         gn < MAXG && un < MAXE - 8) {
    spawnGroup(pending[pendIdx++]);
  }

  // --- groups ------------------------------------------------------------
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    if (gspd[g] > 0) gz[g] -= gspd[g] * dt;       // columns march at you
    const wiped = galive[g] <= 0;
    // Anything well behind the squad has lost the fight and is written off, or
    // `enemyCount()` never reaches zero and the run can never end.
    const passed = gz[g] < state.z - 34;
    if ((wiped && !hasDying(g)) || passed) {
      glive[g] = 0; galive[g] = 0; needCollect = true;
      continue;
    }
    if (!wiped) groupFire(g, dt);
  }

  // --- units -------------------------------------------------------------
  let live = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    const run = gspd[g] > 0 ? 1 : 0.12;
    for (let i = gs[g]; i < ge[g]; i++) {
      ux[i] = gx[g] + uox[i];
      uz[i] = gz[g] + uoz[i];

      if (ust[i] === 0) {
        if (ufl[i] > 0) ufl[i] -= dt;
        const f = ufl[i] > 0 ? 1 + ufl[i] * 7 : 1;
        // Wounded men darken, so a block under sustained fire visibly wears
        // down before anyone in it actually falls.
        const wear = 0.55 + 0.45 * clamp(uhp[i] / umax[i], 0, 1);
        _tint[0] = f * wear; _tint[1] = f * wear * 0.9; _tint[2] = f * wear * 0.9;
        crowd.set(live++, ux[i], 0, uz[i], usc[i], Math.PI + uox[i] * 0.02,
          run, uph[i], _tint);
      } else if (udt[i] > 0) {
        udt[i] -= dt;
        const t = clamp(1 - udt[i] / DIE_T, 0, 1);
        // No ragdoll and no death clip: sink, shrink, darken, spin a little. At
        // this camera distance that reads as a body dropping and it costs four
        // multiplies instead of a skeleton.
        const d = 0.9 - 0.9 * t;
        _tint[0] = d; _tint[1] = d * 0.6; _tint[2] = d * 0.6;
        crowd.set(live++, ux[i], -1.15 * t * t, uz[i],
          Math.max(0.05, usc[i] * (1 - 0.72 * t)), Math.PI + t * 2.2, 0, uph[i], _tint);
      }
    }
  }
  crowd.count = live;
  crowd.commit();

  // Bounds are the hit-test accelerator. Once a frame is plenty: blocks move at
  // walking pace and the box carries 0.6 m of slack.
  for (let g = 0; g < gn; g++) if (glive[g]) recomputeBounds(g);
  if (needCollect) collect();

  updateBoss(dt);
}

function hasDying(g) {
  for (let i = gs[g]; i < ge[g]; i++) if (ust[i] === 1 && udt[i] > 0) return true;
  return false;
}

// --------------------------------------------------------------------------
// Boss frame
// --------------------------------------------------------------------------

function updateBoss(dt) {
  if (!boss.on) return;
  boss.t += dt;
  const gp = boss.group;

  if (!boss.engaged && !boss.dead) {
    // Engage well before the squad is on top of it: `game.js` freezes the run
    // the moment `state.bossMax` goes non-zero, and it has to freeze at a
    // distance where the whole machine is still in frame.
    if (state.z > boss.z - 27) {
      boss.engaged = true;
      state.bossMax = boss.max;
      state.bossHp = boss.hp;
      gp.visible = true;
      emit('hud:toast', { text: boss.name, icon: '☠' });
      emit('story:bubble', { who: 'RADIO', text: 'HEAVY ON THE ROAD. KEEP FIRING.', ms: 2400 });
      addShake(0.35);
      sfx('bossPhase');
    } else {
      gp.visible = state.z > boss.z - 95;   // visible early, so it is a threat
      gp.position.set(boss.x, 0, boss.z);
      return;
    }
  }

  if (boss.dead) {
    boss.dieT += dt;
    const t = boss.dieT;
    // Three beats: cook off, topple, then one big one.
    if (t < 1.6 && Math.random() < dt * 5.5) {
      explode({ x: boss.x + rand(-3, 3), y: rand(1.4, 5.6), z: boss.z + rand(-1, 1) }, rand(0.6, 1.1), PAL.fire);
    }
    // Topples toward the camera and ends FLAT. The pivot is the feet, so a
    // half-turn leaves it hanging in the air at an angle; it has to go past
    // 80 degrees before it reads as a wreck lying on the road.
    const fall = clamp((t - 0.45) / 1.4, 0, 1);
    const e = fall * fall * (3 - 2 * fall);
    gp.rotation.x = -e * 1.42;
    gp.rotation.z = e * 0.22;
    gp.position.set(boss.x, -e * 0.35, boss.z - e * 1.6);
    if (fall > 0.05 && Math.random() < dt * 6) {
      smokePuff(boss.x + rand(-3, 3), rand(0.2, 1.2), boss.z + rand(-2, 2), 1.6, rand(1.8, 3.0), 0x2b2622);
    }
    if (t > 1.9 && !boss.blew) {
      boss.blew = true;
      explode({ x: boss.x, y: 2.6, z: boss.z }, 3.6, PAL.fire);
      shockRing(boss.x, boss.z, 1.2, 19, 0.75, 0xffe0a0, 2.0);
      for (let i = 0; i < 8; i++) {
        smokePuff(boss.x + rand(-3, 3), rand(0.5, 3.5), boss.z + rand(-2.5, 2.5), 2.8, rand(2.4, 3.6), 0x2b2622);
      }
      addShake(1.1);
      floatNumber({ x: boss.x, y: 4.2, z: boss.z }, boss.name + ' DOWN', '#ffd24a');
    }
    if (t > 2.4) { gp.visible = false; boss.on = false; }
    return;
  }

  // Idle: heavy sway, slow bob. Recoil shoves it back along z so a volley has
  // weight without an animation clip.
  boss.recoil = Math.max(0, boss.recoil - dt * 4.2);
  gp.position.set(
    boss.x + Math.sin(boss.t * 0.9) * 0.09,
    Math.abs(Math.sin(boss.t * 1.6)) * 0.07,
    boss.z + boss.recoil * 0.9
  );
  gp.rotation.z = Math.sin(boss.t * 0.9) * 0.022;
  gp.rotation.x = -boss.recoil * 0.06;

  const rage = boss.phase === 2 ? 0.55 : boss.phase === 1 ? 0.78 : 1;

  // ATTACK 1 — cannon volley. Straight, fast and constant. This is what
  // punishes you for parking in front of it.
  boss.fireT -= dt;
  if (boss.fireT <= 0) {
    boss.fireT = 1.5 * rage;
    for (const s of [-1, 1]) {
      const bx = boss.x + s * 2.15 * BOSS_S, by = 3.4 * BOSS_S, bz = boss.z - 3.0 * BOSS_S;
      _fire.x = bx; _fire.y = by; _fire.z = bz;
      const tx = state.x - bx, tz = state.z - bz;
      const l = Math.hypot(tx, tz) || 1;
      _fire.dx = tx / l; _fire.dy = -0.02; _fire.dz = tz / l;
      _fire.dmg = boss.dps * boss.fireT * 0.33;   // two cannons, 2/3 of output
      _fire.n = boss.phase === 2 ? 3 : 2;
      _fire.speed = GUN.bulletSpeed * 0.72;
      _fire.spread = 0.05;
      _fire.len = 2.8;
      _fire.side = 1;
      _fire.flash = true;
      _fire.flashScale = 1.7;
      emit('combat:fire', _fire);
    }
    boss.recoil = 0.42;
    addShake(0.12);
    sfx('shot', { tier: 6, vol: 0.8 });
  }

  // ATTACK 2 — artillery, from phase 1 on. Telegraphed by a ring on the ground
  // a beat before it lands, because an unavoidable hit is not a mechanic, it is
  // just a tax.
  if (boss.phase >= 1) {
    if (boss.tellT >= 0) {
      boss.tellT -= dt;
      if (boss.tellT <= 0) {
        boss.tellT = -1;
        explode({ x: boss.tellX, y: 0.5, z: boss.tellZ }, 1.7, PAL.fire);
        const dx = boss.tellX - state.x, dz = boss.tellZ - state.z;
        const r = RUN.formSpacing * Math.sqrt(Math.max(1, state.troops)) + 1.6;
        if (dx * dx + dz * dz < r * r) {
          // Delivered as a point-blank enemy round so combat.js stays the one
          // place in the game that takes men off the board.
          _fire.x = state.x; _fire.y = 1.0; _fire.z = state.z - 0.8;
          _fire.dx = 0; _fire.dy = 0; _fire.dz = 1;
          _fire.dmg = boss.dps * 2.6;                // the artillery third, landed
          _fire.n = 1; _fire.speed = 6; _fire.spread = 0; _fire.len = 0.6;
          _fire.side = 1; _fire.flash = false;
          emit('combat:fire', _fire);
        }
      }
    } else {
      boss.artT -= dt;
      if (boss.artT <= 0) {
        boss.artT = 2.6 * rage;
        boss.tellX = clamp(state.x + rand(-2.2, 2.2), -ROAD.halfW, ROAD.halfW);
        boss.tellZ = state.z + rand(-1.5, 2.5);
        boss.tellT = 0.95;
        shockRing(boss.tellX, boss.tellZ, 2.6, 2.1, 0.95, 0xff5b3a, 1.6);
        shockRing(boss.tellX, boss.tellZ, 0.4, 2.4, 0.95, 0xffaa50, 0.9);
      }
    }
  }

  if (boss.phase === 2 && Math.random() < dt * 3) {
    smokePuff(boss.x + rand(-2.6, 2.6), rand(3.2, 5.4), boss.z + rand(-0.8, 0.8), 0.9, 1.4, 0x2e2a26);
  }

  // Boss damage is reported as one number a third of a second. Per-bullet
  // numbers on a 4000 hp boss is a wall of noise.
  boss.dmgT -= dt;
  if (boss.dmgT <= 0 && boss.dmgAcc > 0) {
    boss.dmgT = 0.34;
    // Beside the machine, alternating sides: two ticks a second stacked over
            // its head is a wall of yellow that hides the thing you are shooting.
            boss.dmgSide = -(boss.dmgSide || -1);
            floatNumber({ x: boss.x + boss.dmgSide * 4.2, y: 3.4 + rand(0, 1.2), z: boss.z },
              '-' + Math.round(boss.dmgAcc), '#ffd24a');
    boss.dmgAcc = 0;
  }
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initEnemies(ctx) {
  MAXE = clamp(Math.round((ctx?.quality?.maxCrowd || 600) * 0.8), 160, 520);
  allocArrays(MAXE);
  group = new THREE.Group();
  group.name = 'enemies';
  crowd = buildCrowd(MAXE);
  group.add(crowd.group);
  ctx.scene.add(group);
  buildBoss(ctx.scene);

  if (DEV_MODE) {
    window.__hbEnemies = {
      boss, enemyCount, bossState,
      get units() { return un; }, get groups() { return gn; },
    };
  }
  return group;
}

export function resetEnemies(level) {
  un = 0; gn = 0; needCollect = false;
  pending = []; pendIdx = 0;
  levelNo = level?.level || 1;
  if (crowd) { crowd.count = 0; crowd.commit(); }

  boss.on = false; boss.dead = false; boss.engaged = false; boss.blew = false;
  boss.hp = boss.max = 0; boss.phase = 0; boss.t = 0;
  boss.fireT = 1.4; boss.artT = 3.0; boss.recoil = 0; boss.dieT = 0;
  boss.tellT = -1; boss.dmgAcc = 0; boss.dmgT = 0;
  if (boss.group) {
    boss.group.visible = false;
    boss.group.position.set(0, 0, 0);
    boss.group.rotation.set(0, 0, 0);
    boss.trimMat.emissiveIntensity = 0.14;
  }
  state.bossHp = 0; state.bossMax = 0;

  for (const it of level?.items || []) {
    if (it.kind === 'enemy') pending.push(it);
    else if (it.kind === 'boss') {
      boss.on = true;
      boss.hp = boss.max = it.hp || 2000;
      boss.name = it.name || 'HEAVY';
      boss.z = it.z || 0;
      boss.x = it.x || 0;
      boss.tier = it.tier ?? 6;
      // levels.js sizes boss output against the squad that is expected to reach
      // it. Two thirds goes into the cannons, the rest into artillery.
      boss.dps = it.dps > 0 ? it.dps : 4 + levelNo * 0.4;
      boss.group.position.set(boss.x, 0, boss.z);
    }
  }
  pending.sort((a, b) => a.z - b.z);
  return pending.length;
}

// game.js ends the run when this reaches zero, so it has to count everything
// still able to shoot back: live men, blocks not yet streamed in, and a boss
// that has not finished blowing up.
export function enemyCount() {
  let c = 0;
  for (let g = 0; g < gn; g++) if (glive[g]) c += Math.max(0, galive[g]);
  for (let i = pendIdx; i < pending.length; i++) {
    if (pending[i].z > state.z - 10) c += Math.max(1, pending[i].count | 0);
  }
  if (boss.on && !boss.dead) c += 1;
  return c;
}

export function bossState() {
  if (!boss.on || !boss.engaged) return null;
  return { hp: boss.hp, max: boss.max, name: boss.name };
}

export function disposeEnemies() {
  crowd?.dispose();
  group?.parent?.remove(group);
  if (boss.group) {
    boss.group.parent?.remove(boss.group);
    boss.hullMat?.dispose(); boss.trimMat?.dispose();
    boss.outline?.material?.dispose();
    for (const g of boss.geos || []) g.dispose();
    boss.group = null;
  }
  crowd = null; group = null; un = 0; gn = 0;
}
