/**
 * SUNDERFALL — enemies.
 *
 * Public surface for every other module:
 *
 *   import { ENEMIES, spawnEnemy, createDirector } from './enemies/index.js';
 *
 *   ENEMIES                                  id -> definition (read-only)
 *   spawnEnemy(world, id, x, y, opts)        x, y is the FOOT position
 *   createDirector(world, opts)              { update, spawnWave, reset, ... }
 *   raiseCorpse(world, corpse, opts)         Gravewake's one-call path
 *   setSilhouette(bool)                      flat-black readability mode
 *
 * Nothing here writes to `sim/`; every world interaction goes through the documented
 * API in `sim/API.md`.
 */

import { register, ENEMIES, spawnEnemyById } from './registry.js';
import { bindWorld } from './base.js';
import { setSilhouette, silhouette } from './rig.js';
import { createDirector, MOVEMENTS, THREAT } from './director.js';
import { SFX } from './fx.js';
import { LAYER } from '../gfx/renderer.js';

import husk from './units/husk.js';
import sporeling from './units/sporeling.js';
import thornhound from './units/thornhound.js';
import gloamarcher from './units/gloamarcher.js';
import stonewarden from './units/stonewarden.js';
import wispmaw from './units/wispmaw.js';
import oozelord from './units/oozelord.js';
import sunderwraith from './units/sunderwraith.js';
import theseam from './units/theseam.js';

for (const def of [husk, sporeling, thornhound, gloamarcher, stonewarden, wispmaw, oozelord, sunderwraith, theseam]) {
  register(def);
}

export const ENEMY_IDS = Object.keys(ENEMIES);
export { ENEMIES, createDirector, setSilhouette, silhouette, MOVEMENTS, THREAT, SFX };

const bound = new WeakSet();

/**
 * Anything the module needs from a fresh world, done once and idempotently, so a
 * caller can just spawn without a setup step. Safe to call again after a reload.
 */
export function initEnemies(world) {
  bindWorld(world);
  if (bound.has(world)) return world;
  bound.add(world);

  // the sporeling's death cloud is a real, persistent surface — see DESIGN §4
  if (world.surfaces && !world.surfaces.kinds?.has?.('spore')) {
    world.surfaces.define({
      id: 'spore',
      color: [0.52, 0.85, 0.40], color2: [0.12, 0.24, 0.12],
      add: false, light: 0.18, layer: LAYER.FX,
      decay: 0.10, spread: 0.05, flow: 0,
      damage: 7, damageType: 'decay',
      status: 'slow', statusTime: 1.2,
    });
  }
  return world;
}

/**
 * Spawn by id. `x, y` is the FOOT position (the sim's props use foot anchors and
 * level authors think in ground lines, so enemies do too).
 *
 * opts: { team, scale, hp, hpMul, faceX, spawnIn, cd, gen, arena, owner, xp }
 */
export function spawnEnemy(world, id, x, y, opts) {
  initEnemies(world);
  return spawnEnemyById(world, id, x, y, opts);
}

/* ---------------------------------------------------------------- Gravewake */

/**
 * THE CORPSE CONTRACT (also documented in `fx.js`):
 *
 *   kind 'corpse', tag 'corpse', team 2, NOT targetable.
 *   data = { corpse:true, from:<enemyId>, raisable:bool, raised:bool,
 *            decay:1..0, decayTime, facing, hpBase }
 *
 * Find them with:
 *   world.queryRadius(x, y, r, { kind: 'corpse', targetable: false })
 *
 * Raise one with `raiseCorpse`. It despawns the corpse and returns a live enemy on
 * team 0 that hunts team 1 — the same definition, no separate "minion" type.
 */
export function raiseCorpse(world, corpse, opts) {
  if (!corpse || !corpse.alive) return null;
  const d = corpse.data;
  if (!d || !d.corpse || !d.raisable || d.raised) return null;
  const o = opts || {};
  const id = o.as || d.from || 'husk';
  d.raised = true;
  d.raisable = false;

  const foot = corpse.y + corpse.h * 0.5;
  const e = spawnEnemy(world, id, corpse.x, foot, {
    team: 0,
    hpMul: o.hpMul === undefined ? 0.6 : o.hpMul,
    scale: o.scale === undefined ? 0.92 : o.scale,
    spawnIn: true,
    owner: o.owner || null,
    xp: 0,
    faceX: d.facing,
  });
  if (e) {
    e.data.raised = true;
    e.data.tint = o.tint || [0.55, 1.05, 0.75];
    if (o.life) e.life = o.life;
    world.bus.emit('corpse:raised', { entity: e, from: id, x: e.x, y: e.y });
    world.ctx.audio.sfx('gravewake_raise', { x: e.x, y: e.y });
  }
  world.despawn(corpse);
  return e;
}

/** Every raisable corpse in range, nearest first. Reuses `out` if you pass one. */
export function findCorpses(world, x, y, r, out) {
  const list = world.queryRadius(x, y, r, { kind: 'corpse', targetable: false }, out);
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i].data;
    if (!d || !d.corpse || !d.raisable || d.raised) list.splice(i, 1);
  }
  return list;
}

export function isRaisable(e) {
  return !!(e && e.alive && e.kind === 'corpse' && e.data && e.data.corpse && e.data.raisable && !e.data.raised);
}

/* -------------------------------------------------------------------- misc */

/** Live hostile count — the level agent gates gates and doors on this. */
export function countEnemies(world, team) {
  let n = 0;
  const list = world.entities;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive && e.kind === 'enemy' && (team === undefined || e.team === team)) n++;
  }
  return n;
}

export function despawnAllEnemies(world) {
  world.each('enemy', (e) => world.despawn(e));
}
