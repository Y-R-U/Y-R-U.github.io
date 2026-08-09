/**
 * Enemy projectiles. Pooled `kind:'projectile'` entities driven by shared callbacks
 * (no per-spawn closures), each one sweeping the world itself so it resolves
 * against terrain, props and actors in one call.
 */

import { LAYER } from '../gfx/renderer.js';
import { silhouette } from './rig.js';

let _w = null;

const _hitOpts = { radius: 5, exclude: null, team: -1, entities: true, props: true, terrain: true, step: 8 };

/**
 * gloamarcher's bolt: slow, turns toward you, and therefore forces you to keep
 * moving rather than to dodge once. Turn rate is low enough to outrun deliberately.
 */
export function spawnTrackingBolt(world, from, x, y, dirX, dirY, o) {
  _w = world;
  const opt = o || {};
  return world.spawn({
    kind: 'projectile', tag: opt.tag || 'gloam_bolt', team: from.team,
    x, y, w: 14, h: 14,
    vx: dirX * (opt.speed || 250), vy: dirY * (opt.speed || 250),
    gravity: 0, collides: false, trigger: true, owner: from,
    life: opt.life === undefined ? 4.5 : opt.life,
    data: {
      speed: opt.speed || 250, turn: opt.turn === undefined ? 1.7 : opt.turn,
      dmg: opt.damage === undefined ? 11 : opt.damage,
      type: opt.type || 'void', col: opt.col || [0.62, 0.45, 1.0],
      trail: 0, hitTeam: from.team === 1 ? 0 : 1, born: world.time,
    },
    onUpdate: boltUpdate,
    render: boltRender,
  });
}

function boltUpdate(e, dt) {
  const d = e.data;
  const w = _w;
  const target = d.hitTeam === 0 ? w.player : w.nearest(e.x, e.y, 500, { team: 1, targetable: true });
  if (target && target.alive) {
    const tx = target.x - e.x, ty = (target.y - target.h * 0.15) - e.y;
    const tl = Math.hypot(tx, ty) || 1;
    const cur = Math.atan2(e.vy, e.vx);
    let want = Math.atan2(ty / tl, tx / tl);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const max = d.turn * dt;
    const a = cur + Math.max(-max, Math.min(max, diff));
    e.vx = Math.cos(a) * d.speed;
    e.vy = Math.sin(a) * d.speed;
  }

  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  _hitOpts.exclude = e.owner;
  _hitOpts.team = -1;
  const h = w.sweep(e.px, e.py, nx, ny, _hitOpts);
  if (h && !(h.what === 'entity' && (h.entity === e.owner || h.entity.team === e.team))) {
    if (h.what === 'entity') {
      w.damage(h.entity, d.dmg, d.type, { src: e.owner, hitX: h.x, hitY: h.y, dirX: e.vx, dirY: e.vy, force: 200 });
    } else if (h.what === 'prop') {
      w.damageProp(h.prop, d.dmg * 0.6, d.type, { src: e.owner, hitX: h.x, hitY: h.y });
    } else {
      w.terrain.scorch(h.x, h.y, 20, 0.5);
    }
    boltPop(w, e, h.x, h.y);
    return;
  }

  if (!silhouette()) {
    w.P.emit({
      x: e.x, y: e.y, count: 1, speed: 20, speedVar: 20, life: 0.35, lifeVar: 0.15,
      size: 11, sizeEnd: 1, color: [d.col[0], d.col[1], d.col[2], 0.9],
      color2: [d.col[0] * 0.2, 0, d.col[2] * 0.4, 0], add: true, drag: 2,
    });
  }
}

function boltPop(w, e, x, y) {
  const d = e.data;
  w.P.emit({
    x, y, count: 16, speed: 260, speedVar: 190, life: 0.4, lifeVar: 0.25, size: 11, sizeEnd: 1,
    color: [d.col[0], d.col[1], d.col[2], 1], color2: [0.05, 0, 0.15, 0], add: true, drag: 3, stretch: 1.4,
  });
  w.R.light({ x, y, radius: 200, r: d.col[0], g: d.col[1], b: d.col[2], intensity: 1.5 });
  w.ctx.audio.sfx('bolt_hit', { x, y });
  w.despawn(e);
}

function boltRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  const a = Math.atan2(e.vy, e.vx);
  if (silhouette()) {
    R.spriteRaw(R.disc, 0, 0, 1, 1, x, y, 14, 14, 0, 0.012, 0.012, 0.018, 1, LAYER.ACTORS, false, 1);
    return;
  }
  R.spriteRaw(R.streak, 0, 0, 1, 1, x, y, 16, 46, a + Math.PI / 2, d.col[0], d.col[1], d.col[2], 0.75, LAYER.FX, true, 1);
  R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 30, 30, 0, d.col[0], d.col[1], d.col[2], 0.7, LAYER.FX, true, 1);
  R.spriteRaw(R.disc, 0, 0, 1, 1, x, y, 9, 9, 0, 1, 1, 1, 1, LAYER.FX, true, 1);
  R.light({ x, y, radius: 190, r: d.col[0], g: d.col[1], b: d.col[2], intensity: 0.85, flicker: 0.15 });
}

/* -------------------------------------------------------------- burning glob */

/**
 * wispmaw's drop: an arcing blob that sets the ground on fire where it lands. The
 * fire is the real weapon — the impact damage is almost incidental.
 */
export function spawnGlob(world, from, x, y, vx, vy, o) {
  _w = world;
  const opt = o || {};
  return world.spawn({
    kind: 'projectile', tag: 'fire_glob', team: from.team,
    x, y, w: 16, h: 16, vx, vy,
    gravity: 0.85, drag: 0.1, collides: false, trigger: true, owner: from, life: 6,
    data: {
      dmg: opt.damage === undefined ? 10 : opt.damage,
      radius: opt.radius === undefined ? 52 : opt.radius,
      burn: opt.burn === undefined ? 1 : opt.burn,
      col: [1, 0.62, 0.24],
    },
    onUpdate: globUpdate,
    render: globRender,
  });
}

function globUpdate(e, dt) {
  const w = _w;
  const d = e.data;
  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  _hitOpts.exclude = e.owner;
  const h = w.sweep(e.px, e.py, nx, ny, _hitOpts);
  if (h && !(h.what === 'entity' && (h.entity === e.owner || h.entity.team === e.team))) {
    w.explode(h.x, h.y, {
      radius: d.radius, damage: d.dmg, type: 'fire', force: 260,
      terrain: false, props: true, shake: 0.12, hitstop: 0, flash: 0, igniteChance: 1,
    });
    w.surfaces.ignite(h.x, h.y + 8, d.radius * 0.9, d.burn);
    w.terrain.scorch(h.x, h.y, d.radius, 1);
    w.ctx.audio.sfx('glob_splash', { x: h.x, y: h.y });
    w.despawn(e);
    return;
  }
  if (!silhouette() && Math.random() < 0.8) {
    w.P.emit({
      x: e.x, y: e.y, count: 1, speed: 30, speedVar: 30, life: 0.5, lifeVar: 0.3,
      size: 12, sizeEnd: 2, color: [1, 0.72, 0.3, 0.95], color2: [0.7, 0.12, 0.03, 0],
      gravity: -120, add: true, glow: 0.22, drag: 1.2,
    });
  }
}

function globRender(e, alpha, R) {
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  if (silhouette()) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 22, 26, 0, 0.012, 0.012, 0.018, 1, LAYER.ACTORS, false, 1);
    return;
  }
  const stretch = Math.min(1.9, 1 + Math.abs(e.vy) / 900);
  R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 44, 44 * stretch, 0, 1, 0.45, 0.14, 0.55, LAYER.FX, true, 1);
  R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 20, 22 * stretch, 0, 1, 0.9, 0.6, 1, LAYER.FX, true, 1);
  R.light({ x, y, radius: 260, r: 1, g: 0.66, b: 0.34, intensity: 1.5, flicker: 0.3 });
}

/* --------------------------------------------------------------- slime blob */

/** oozelord's spray: leaves real slime in the surface layer where it lands. */
export function spawnSlimeBlob(world, from, x, y, vx, vy, o) {
  _w = world;
  const opt = o || {};
  return world.spawn({
    kind: 'projectile', tag: 'slime_blob', team: from.team,
    x, y, w: 18, h: 18, vx, vy, gravity: 0.9, collides: false, trigger: true,
    owner: from, life: 6,
    data: { dmg: opt.damage === undefined ? 8 : opt.damage, amount: opt.amount === undefined ? 0.9 : opt.amount },
    onUpdate: slimeUpdate,
    render: slimeRender,
  });
}

function slimeUpdate(e, dt) {
  const w = _w;
  const d = e.data;
  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  _hitOpts.exclude = e.owner;
  const h = w.sweep(e.px, e.py, nx, ny, _hitOpts);
  if (h && !(h.what === 'entity' && (h.entity === e.owner || h.entity.team === e.team))) {
    w.surfaces.pour('slime', h.x, h.y, d.amount, 46);
    w.damageArea(h.x, h.y, 44, d.dmg, 'acid', {
      src: e.owner, status: 'slow', statusTime: 2.5, statusPower: 0.7, falloff: 1, props: false,
    });
    w.P.emit({
      x: h.x, y: h.y, count: 14, speed: 200, speedVar: 160, vSpread: 1.6, vx: 0, vy: -1,
      life: 0.7, lifeVar: 0.4, size: 12, sizeEnd: 3,
      color: [0.5, 0.9, 0.55, 0.9], color2: [0.1, 0.28, 0.16, 0], gravity: 1000, drag: 1,
    });
    w.ctx.audio.sfx('slime_splat', { x: h.x, y: h.y });
    w.despawn(e);
  }
}

function slimeRender(e, alpha, R) {
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  const sil = silhouette();
  const stretch = Math.min(1.8, 1 + Math.abs(e.vy) / 1100);
  R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 24, 26 * stretch, 0,
    sil ? 0.012 : 0.32, sil ? 0.012 : 0.62, sil ? 0.018 : 0.34, 1, LAYER.ACTORS, false, 1);
  if (!sil) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, x - 3, y - 4, 10, 10, 0, 0.7, 1, 0.7, 0.5, LAYER.FX, true, 1);
  }
}
