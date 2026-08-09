/**
 * The plumbing every spell shares: projectiles, timed field effects, target
 * picking. Spells are written as data + two callbacks; anything longer than
 * that belongs here.
 *
 * Everything spawns through world.spawn(), which is pooled by the sim, and every
 * visual is drawn from the entity's own render() so it lands inside the sim's
 * render pass at the right layer. Drawing from anywhere else means drawing after
 * R.end(), i.e. drawing nothing.
 */

import { LAYER } from '../gfx/renderer.js';
import { MAT, MATERIAL } from '../sim/materials.js';
import { SCHOOL, drawBolt, drawOrb, impact, emitDesc as E, setColor as col, colA, colB } from './fx.js';

/* ------------------------------------------------------------------ *
 * Timed field effect — a self-updating, self-drawing entity with no body
 * ------------------------------------------------------------------ */

/**
 * @param o.life     seconds
 * @param o.step(e, dt, t01)   called every fixed step
 * @param o.draw(e, R, t01, alpha)
 * @param o.done(e)  called once when life runs out
 */
export function field(world, o) {
  const e = world.spawn({
    kind: 'effect', x: o.x, y: o.y, w: 8, h: 8,
    gravity: 0, collides: false, trigger: true, team: o.team === undefined ? 0 : o.team,
    life: o.life, tag: o.tag || 'spellfx', layer: o.layer === undefined ? LAYER.FX : o.layer,
    owner: o.owner || null,
    data: o.data || null,
    onUpdate: fieldUpdate, render: fieldRender, onDespawn: fieldDone,
  });
  if (!e) return null;
  e.data._t = 0;
  e.data._max = o.life;
  e.data._step = o.step || null;
  e.data._draw = o.draw || null;
  e.data._done = o.done || null;
  return e;
}
function fieldUpdate(e, dt) {
  const d = e.data;
  d._t += dt;
  if (d._step) d._step(e, dt, Math.min(1, d._t / d._max));
}
function fieldRender(e, alpha, R) {
  const d = e.data;
  if (d._draw) d._draw(e, R, Math.min(1, d._t / d._max), alpha);
}
function fieldDone(e) {
  const d = e.data;
  if (d._done) { const f = d._done; d._done = null; f(e); }
}

/* ------------------------------------------------------------------ *
 * Projectiles
 * ------------------------------------------------------------------ */

const SWEEP = { entities: true, props: true, terrain: true, team: -1, exclude: null, radius: 6, step: 6 };
const DMG = { src: null, hitX: 0, hitY: 0, dirX: 0, dirY: 0, force: 0, stagger: 0, status: null, statusTime: 0, statusPower: 1, crit: false };

/** Shared damage-opts object. Reset every field; a stale `status` is a real bug. */
export function dmgOpts(src, hitX, hitY, dirX, dirY, force, stagger, status, statusTime, statusPower) {
  DMG.src = src || null; DMG.hitX = hitX; DMG.hitY = hitY;
  DMG.dirX = dirX || 0; DMG.dirY = dirY || 0;
  DMG.force = force || 0; DMG.stagger = stagger || 0;
  DMG.status = status || null; DMG.statusTime = statusTime || 0; DMG.statusPower = statusPower === undefined ? 1 : statusPower;
  DMG.crit = false;
  return DMG;
}

/**
 * A swept projectile. Moves, sweeps for a hit, resolves it, trails behind.
 *
 * @param o.onHit(e, hit, world) -> 'stop' | 'pierce' | undefined
 * @param o.onStep(e, dt)
 * @param o.onExpire(e)
 * @param o.trail  {color, color2, size, rate, gravity, add, glow, life, stretch}
 */
export function projectile(world, o) {
  const e = world.spawn({
    kind: 'projectile', x: o.x, y: o.y, w: o.w || 14, h: o.h || 14,
    vx: o.vx, vy: o.vy,
    gravity: o.gravity === undefined ? 0 : o.gravity,
    drag: o.drag || 0,
    collides: false, trigger: true,
    team: o.team === undefined ? 0 : o.team,
    owner: o.owner || null,
    life: o.life === undefined ? 3 : o.life,
    tag: o.tag || 'spell',
    material: 8,
    layer: LAYER.FX,
    data: o.data || null,
    onUpdate: projUpdate, render: o.render || projRender, onDespawn: projDespawn,
  });
  if (!e) return null;
  const d = e.data;
  d._school = o.school || 'fire';
  d._radius = o.radius === undefined ? 8 : o.radius;
  d._hit = o.onHit || null;
  d._step = o.onStep || null;
  d._expire = o.onExpire || null;
  d._trail = o.trail || null;
  d._acc = 0;
  d._homing = o.homing || 0;
  d._target = o.target || null;
  d._spin = o.spin || 0;
  d._age = 0;
  d._len = o.len === undefined ? 34 : o.len;
  d._wide = o.wide === undefined ? 12 : o.wide;
  d._light = o.light === undefined ? 1 : o.light;
  d._pierced = 0;
  return e;
}

function projUpdate(e, dt) {
  const w = WORLD;
  const d = e.data;
  d._age += dt;

  if (d._homing && d._target && d._target.alive) {
    const tx = d._target.x - e.x, ty = d._target.y - e.y;
    const L = Math.hypot(tx, ty) || 1;
    const sp = Math.hypot(e.vx, e.vy) || 1;
    e.vx += (tx / L * sp - e.vx) * Math.min(1, d._homing * dt);
    e.vy += (ty / L * sp - e.vy) * Math.min(1, d._homing * dt);
  }

  if (d._step) d._step(e, dt);
  if (!e.alive) return;

  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  SWEEP.exclude = e.owner || null;
  SWEEP.radius = d._radius;
  SWEEP.team = -1;
  SWEEP.entities = true; SWEEP.props = true; SWEEP.terrain = true; SWEEP.step = 6;
  const hit = w.sweep(e.x, e.y, nx, ny, SWEEP);

  // trail is emitted along the pre-hit path so it never floats past a wall
  if (d._trail) trailStep(w, e, dt);

  if (hit) {
    const hx = hit.x, hy = hit.y;
    e.x = hx; e.y = hy;
    const r = d._hit ? d._hit(e, hit, w) : 'stop';
    if (r !== 'pierce') { if (e.alive) w.despawn(e); return; }
    d._pierced++;
    e.x = hx + e.vx * dt * 0.4;
    e.y = hy + e.vy * dt * 0.4;
  } else {
    e.x = nx; e.y = ny;
  }
}

const TR = { color: [1, 1, 1, 1], color2: [1, 1, 1, 0] };
function trailStep(w, e, dt) {
  const d = e.data, t = d._trail;
  d._acc += dt;
  const iv = 1 / (t.rate || 60);
  let guard = 0;
  while (d._acc >= iv && guard++ < 4) {
    d._acc -= iv;
    const em = E(e.x - e.vx * d._acc, e.y - e.vy * d._acc, 1);
    em.life = t.life === undefined ? 0.35 : t.life;
    em.lifeVar = em.life * 0.4;
    em.size = t.size === undefined ? 10 : t.size;
    em.sizeVar = em.size * 0.3;
    em.sizeEnd = 0.4;
    em.speed = t.speed || 0; em.speedVar = t.speedVar || 24;
    em.gravity = t.gravity || 0;
    em.drag = t.drag === undefined ? 1.4 : t.drag;
    em.add = t.add !== false;
    em.glow = t.glow || 0;
    em.stretch = t.stretch || 0;
    const c = t.color, c2 = t.color2;
    em.color = col(colA, c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]);
    em.color2 = col(colB, c2[0], c2[1], c2[2], c2[3] === undefined ? 0 : c2[3]);
    w.P.emit(em);
  }
}

function projRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
  const s = SCHOOL[d._school] || SCHOOL.fire;
  const sp = Math.hypot(e.vx, e.vy) || 1;
  drawBolt(R, x, y, e.vx / sp, e.vy / sp, d._len, d._wide, s.hot, 0.95);
  drawOrb(R, x, y, d._wide * 0.9, s.base, 0.9, 0.25);
  if (d._light > 0) {
    R.light({ x, y, radius: 190 * d._light, r: s.base[0], g: s.base[1], b: s.base[2], intensity: 0.95 * d._light, flicker: 0.12 });
  }
}

function projDespawn(e) {
  const d = e.data;
  if (d._expire) { const f = d._expire; d._expire = null; f(e); }
}

/* world back-reference: the sim does not put one on entities, so cache it. */
let WORLD = null;
export function bindWorld(w) { WORLD = w; }

/* ------------------------------------------------------------------ *
 * Targeting helpers
 * ------------------------------------------------------------------ */

const Q = { team: 1, kind: null, tag: null, exclude: null, targetable: true, los: false, sort: true, max: 32 };
const listA = [];
const listB = [];

export function enemiesIn(world, x, y, r, exclude, max, out) {
  Q.team = 1; Q.kind = null; Q.tag = null; Q.exclude = exclude || null;
  Q.targetable = true; Q.los = false; Q.sort = true; Q.max = max || 32;
  return world.queryRadius(x, y, r, Q, out || listA);
}

export function anyIn(world, x, y, r, kind, out) {
  Q.team = -1; Q.kind = kind || null; Q.tag = null; Q.exclude = null;
  Q.targetable = false; Q.los = false; Q.sort = true; Q.max = 48;
  return world.queryRadius(x, y, r, Q, out || listB);
}

export function corpsesIn(world, x, y, r, out) {
  return anyIn(world, x, y, r, 'corpse', out);
}

/** Props of one material inside a radius — Gravewake's BONE, Bloodtithe's FOLIAGE. */
const propBuf = [];
export function propsOfMaterial(world, x, y, r, material, out) {
  const list = world.queryProps(x, y, r, propBuf);
  const o = out || [];
  o.length = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.alive && p.material === material) o.push(p);
  }
  return o;
}

export { listA as scratchA, listB as scratchB };

/* ------------------------------------------------------------------ *
 * Small maths used all over
 * ------------------------------------------------------------------ */

/**
 * Ground material at a point, guaranteed valid.
 * The sim's `materialAt` returns **-1** for an empty cell, and `MAT[-1]` is
 * undefined — which blows up inside `burstDebris` and `materialFx`. Always go
 * through this rather than passing `world.materialAt` straight through.
 */
export function matAt(world, x, y) {
  const m = world.materialAt(x, y);
  return (m === undefined || m === null || m < 0 || m >= MAT.length) ? MATERIAL.EARTH : m;
}

export function dirTo(fromX, fromY, toX, toY, out) {
  let dx = toX - fromX, dy = toY - fromY;
  const L = Math.hypot(dx, dy) || 1;
  out.x = dx / L; out.y = dy / L; out.len = L;
  return out;
}
export const DIR = { x: 1, y: 0, len: 1 };

/** Ballistic velocity to lob from A to B at a given speed, +Y down. */
export function lobVelocity(x0, y0, x1, y1, speed, gravity, out) {
  const dx = x1 - x0, dy = y1 - y0;
  const g = gravity;
  const s2 = speed * speed;
  const root = s2 * s2 - g * (g * dx * dx + 2 * dy * s2);
  if (root < 0 || Math.abs(dx) < 1) {          // out of range: fire flat-ish at it
    const L = Math.hypot(dx, dy) || 1;
    out.x = dx / L * speed; out.y = dy / L * speed - Math.abs(dx) * 0.35;
    return out;
  }
  const ang = Math.atan((s2 - Math.sqrt(root)) / (g * dx));
  const sgn = dx < 0 ? -1 : 1;
  out.x = Math.cos(ang) * speed * sgn;
  out.y = -Math.abs(Math.sin(ang) * speed);
  if (dx < 0) out.x = -Math.abs(Math.cos(ang) * speed);
  return out;
}
export const VEL = { x: 0, y: 0 };
