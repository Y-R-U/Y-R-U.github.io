/**
 * The shared body of every enemy: the action/telegraph state machine, damage
 * reactions, death, and the render path that poses and draws the rig.
 *
 * A definition supplies anatomy (`parts`), a pose function, a `think` and a table
 * of `actions`. Everything else — and in particular the rule that no attack may
 * fire without at least 0.35s of readable wind-up — lives here so it cannot be
 * forgotten in a unit file.
 */

import { LAYER } from '../gfx/renderer.js';
import { STATUS } from '../sim/status.js';
import { MATERIAL } from '../sim/materials.js';
import { acquireRig, releaseRig, solveRig, drawRig, glowRig, beginPaint, silhouette } from './rig.js';
import { buildRig } from './rig.js';
import { hitReact, deathFx, gibRig, spawnCorpse } from './fx.js';

export const MIN_TELEGRAPH = 0.35;

let _w = null;
export function bindWorld(w) { _w = w; }
export function boundWorld() { return _w; }

const _proxy = { x: 0, y: 0, faceX: 1, h: 0, w: 0 };

/* ------------------------------------------------------------------ definition */

export function defineEnemy(def) {
  const d = {
    role: 'fodder', hp: 30, w: 34, h: 60, speed: 70, accel: 0,
    jump: 0, gravity: 1, drag: 0, friction: 8, bounce: 0, collides: true,
    mass: 1, xp: 4, elite: false, boss: false,
    ichor: [0.62, 0.20, 0.24], corpseCol: [0.20, 0.22, 0.17],
    death: 'burst', leavesCorpse: false, gibs: 8,
    material: MATERIAL.FLESH,
    think: null, pose: null, actions: {},
    aggroRange: 620, loseRange: 1100,
    ...def,
  };
  d.accel = d.accel || d.speed * 7;
  d.tpl = buildRig(d.parts);

  for (const k in d.actions) {
    const a = d.actions[k];
    // Structural guarantee: an attack the player cannot read is a bug, so the
    // wind-up floor is applied at definition time rather than trusted per unit.
    a.wind = Math.max(MIN_TELEGRAPH, a.wind === undefined ? MIN_TELEGRAPH : a.wind);
    a.active = a.active === undefined ? 0.12 : a.active;
    a.recover = a.recover === undefined ? 0.3 : a.recover;
    a.cooldown = a.cooldown === undefined ? 1.2 : a.cooldown;
    a.tell = a.tell || [1, 0.55, 0.2];
    a.name = k;
  }
  return d;
}

/* ---------------------------------------------------------------------- spawn */

export function makeEnemy(world, def, x, y, opts) {
  _w = world;
  const o = opts || {};
  const team = o.team === undefined ? 1 : o.team;
  const scale = o.scale === undefined ? 1 : o.scale;

  const e = world.spawn({
    kind: 'enemy', tag: def.id, team,
    x, y: y - (def.h * scale) * 0.5 - 1,
    w: def.w * scale, h: def.h * scale,
    hp: Math.round((o.hp || def.hp) * (o.hpMul || 1)),
    material: def.material,
    gravity: def.gravity, drag: def.drag, friction: def.friction,
    bounce: def.bounce, collides: def.collides === false ? false : true,
    faceX: o.faceX || (world.player && world.player.x < x ? -1 : 1),
    layer: LAYER.ACTORS,
    invuln: o.spawnIn ? 0.35 : 0,
    flammable: def.flammable === undefined ? 0.5 : def.flammable,
    onUpdate: baseUpdate,
    onDamage: baseDamage,
    onDeath: baseDeath,
    onDespawn: baseDespawn,
    render: baseRender,
  });
  if (!e) return null;

  const d = e.data;
  d.id = def.id;
  d.def = def;
  d.rig = acquireRig(def.tpl);
  d.scale = scale;
  d.state = 'idle';
  d.stateT = 0;
  d.anim = Math.random() * 6.283;
  d.act = null; d.phase = 0; d.actT = 0; d.tellK = 0; d.tellCol = null;
  d.cd = o.cd === undefined ? Math.random() * 0.6 : o.cd;
  d.squash = 0; d.recoil = 0; d.hurtT = 0;
  d.turnLock = 0; d.lockDir = e.faceX; d.wantSmash = false;
  d.slowK = 1; d.alpha = 1; d.dim = 1; d.tint = null;
  d.ichor = def.ichor;
  d.xp = o.xp === undefined ? def.xp : o.xp;
  d.target = null; d.seesTarget = false; d.lastSeenX = 0; d.lastSeenY = 0;
  d.spawnIn = o.spawnIn ? 1 : 0;
  d.spawnT = o.spawnIn ? 0 : 1;
  d.elite = !!def.elite;
  d.allied = team === 0;
  d.owner = o.owner || null;
  d.opts = o;

  if (o.spawnIn) {
    e.data.alpha = 0;
    world.P.emit({
      x: e.x, y: e.y + e.h * 0.5, count: 16, speed: 130, speedVar: 110, life: 0.7, lifeVar: 0.4,
      size: 14, sizeEnd: 2, color: [0.35, 0.25, 0.45, 0.8], color2: [0.05, 0.03, 0.1, 0],
      gravity: 300, drag: 1.6, vy: -1, vSpread: 0.9,
    });
  }
  if (def.onSpawn) def.onSpawn(world, e, d, o);
  world.bus.emit('enemy:spawn', { entity: e, id: def.id, x: e.x, y: e.y, elite: d.elite });
  return e;
}

function baseDespawn(e) {
  const d = e.data;
  if (d && d.def && d.def.onDespawn) d.def.onDespawn(_w, e, d);
  if (d && d.rig) { releaseRig(d.rig); d.rig = null; }
}

/* --------------------------------------------------------------------- update */

function baseUpdate(e, dt) {
  const d = e.data;
  const def = d.def;
  if (!def) return;

  d.stateT += dt;
  if (d.spawnT < 1) {
    d.spawnT = Math.min(1, d.spawnT + dt / 0.55);
    d.alpha = d.spawnT;
  }

  // statuses the sim does not apply to AI on our behalf
  const stun = e.status[STATUS.STUN];
  const root = e.status[STATUS.ROOT];
  const slow = e.status[STATUS.SLOW];
  d.slowK = slow > 0 ? Math.max(0.2, 1 - 0.5 * (e.power[STATUS.SLOW] || 1)) : 1;

  d.squash *= Math.exp(-dt * 8);
  d.recoil *= Math.exp(-dt * 11);
  if (d.hurtT > 0) d.hurtT -= dt;
  if (d.cd > 0) d.cd -= dt;
  if (d.turnLock > 0) d.turnLock -= dt;

  if (stun > 0) {
    cancelAction(e, d);
    d.state = 'stun';
    if (e.onGround) e.vx *= Math.exp(-dt * 6);
    return;
  }
  /* A cutscene owns the frame (story/runner.js sets this). Enemies left over
     from the fight before it kept swinging at a boy with no control, and a
     wind-up that survived the boundary landed on someone who could not dodge.
     Held, not despawned: whatever was on the road is still there afterwards. */
  if (_w && _w.storyLock) {
    cancelAction(e, d);
    if (e.onGround) e.vx *= Math.exp(-dt * 6);
    return;
  }
  if (root > 0) e.vx = 0;

  advanceAction(e, d, def, dt);

  // `frozen` is a harness affordance: hold position so a pose can be inspected,
  // while actions still run so telegraphs can be checked in isolation.
  if (d.frozen) { if (e.gravity) e.vx = 0; }
  else if (def.think) def.think(_w, e, d, dt);

  if (d.recoil) e.vx += d.recoil * dt * 6;
}

export function startAction(e, d, name) {
  const a = d.def.actions[name];
  if (!a) return false;
  d.act = name; d.phase = 0; d.actT = 0; d.tellK = 0;
  d.tellCol = a.tell;
  d.state = 'wind';
  if (a.sfx) _w.ctx.audio.sfx(a.sfx + '_wind', { x: e.x, y: e.y });
  if (a.onStart) a.onStart(_w, e, d);
  return true;
}

export function cancelAction(e, d) {
  if (!d.act) return;
  const a = d.def.actions[d.act];
  if (a && a.onCancel) a.onCancel(_w, e, d);
  d.act = null; d.phase = 0; d.actT = 0; d.tellK = 0;
}

export function acting(d) { return !!d.act; }

function advanceAction(e, d, def, dt) {
  if (!d.act) return;
  const a = def.actions[d.act];
  d.actT += dt;

  if (d.phase === 0) {
    /* `windFor` lets an action shorten its own telegraph as a fight escalates —
       the Seam's beam warns for 1.7s in phase one and 1.0s in the unmaking, so
       later phases are read faster rather than dodged less. Falls back to the
       constant, which is what every other action uses. */
    const wind = a.windFor ? a.windFor(d) : a.wind;
    d.tellK = Math.min(1, d.actT / wind);
    // The tell is not only colour: a wind-up throws its own gathering particles.
    if (a.windFx !== false && !silhouette() && Math.random() < 0.55) {
      const c = a.tell;
      const r = 34 + 30 * d.tellK;
      const ang = Math.random() * 6.283;
      _w.P.emit({
        x: e.x + Math.cos(ang) * r, y: e.y - e.h * 0.15 + Math.sin(ang) * r * 0.7, count: 1,
        vx: -Math.cos(ang), vy: -Math.sin(ang), speed: 90 + 120 * d.tellK, life: 0.3,
        size: 7, sizeEnd: 1, color: [c[0], c[1], c[2], 0.9], color2: [c[0], c[1], c[2], 0],
        add: true, drag: 1.5,
      });
    }
    if (a.onWind) a.onWind(_w, e, d, d.tellK);
    if (d.actT >= wind) {
      d.phase = 1; d.actT = 0; d.tellK = 1; d.state = 'attack';
      if (a.sfx) _w.ctx.audio.sfx(a.sfx, { x: e.x, y: e.y });
      if (a.fire) a.fire(_w, e, d);
    }
  } else if (d.phase === 1) {
    if (a.during) a.during(_w, e, d, dt);
    if (d.actT >= a.active) { d.phase = 2; d.actT = 0; d.state = 'recover'; }
  } else {
    d.tellK = Math.max(0, 1 - d.actT / a.recover);
    if (a.duringRecover) a.duringRecover(_w, e, d, dt);
    if (d.actT >= a.recover) {
      d.act = null; d.tellK = 0; d.cd = a.cooldown;
      d.state = 'idle';
      if (a.onEnd) a.onEnd(_w, e, d);
    }
  }
}

/* --------------------------------------------------------------------- damage */

function baseDamage(e, amount, type, src) {
  const d = e.data;
  const def = d.def;
  let amt = amount;

  if (def.armour) {
    const ar = def.armour;
    const pierces = ar.types && ar.types.indexOf(type) >= 0;
    if (!pierces) {
      if (amt < ar.min) {
        // sparks off the plate: the "that did nothing" read has to be instant
        if (!silhouette()) {
          _w.P.emit({
            x: e.x + e.faceX * e.w * 0.2, y: e.y - e.h * 0.1, count: 5,
            speed: 240, speedVar: 180, vSpread: 2.2, life: 0.3, lifeVar: 0.15,
            size: 6, sizeEnd: 1, color: [1, 0.92, 0.6, 1], color2: [1, 0.4, 0.1, 0],
            add: true, gravity: 700, drag: 2, stretch: 1.6,
          });
        }
        _w.ctx.audio.sfx('armour_ping', { x: e.x, y: e.y });
        d.squash = Math.min(0.5, d.squash + 0.12);
        return 0;
      }
      amt *= ar.mul === undefined ? 0.45 : ar.mul;
    }
  }

  if (def.onDamageHook) {
    const v = def.onDamageHook(_w, e, d, amt, type, src);
    if (typeof v === 'number') amt = v;
  }
  if (amt > 0) hitReact(_w, e, d, amt, type, src ? Math.sign(e.x - src.x) : 0, -0.3);
  return amt;
}

/* ---------------------------------------------------------------------- death */

function baseDeath(e, cause) {
  const d = e.data;
  const def = d.def;
  d.state = 'dead';
  if (def.onDeathHook && def.onDeathHook(_w, e, d, cause) === false) return;

  deathFx(_w, e, d, def.death, {
    big: def.elite || def.boss ? 1 : 0,
    material: def.debrisMaterial,
    glow: def.deathGlow,
  });
  gibRig(_w, e, d, {
    max: def.gibs,
    force: def.boss ? 520 : def.elite ? 340 : 240,
    burn: e.burning > 0,
  });
  if (def.leavesCorpse && !(def.corpseIf && !def.corpseIf(_w, e, d, cause))) {
    spawnCorpse(_w, e, d, { col: def.corpseCol, w: e.w * 1.2, h: e.h * 0.3 });
  }
}

/* --------------------------------------------------------------------- render */

function baseRender(e, alpha, R) {
  const d = e.data;
  const def = d.def;
  const rig = d.rig;
  if (!rig) return;

  _proxy.x = e.px + (e.x - e.px) * alpha;
  _proxy.y = e.py + (e.y - e.py) * alpha;
  _proxy.faceX = e.faceX;
  _proxy.w = e.w; _proxy.h = e.h;

  const t = _w.time + alpha * _w.dt;
  rig.sx = d.scale * (1 + d.squash * 0.22);
  rig.sy = d.scale * (1 - d.squash * 0.20);
  rig.ox = 0; rig.oy = 0; rig.rot = 0;

  if (def.pose) def.pose(e, d, rig, t, alpha);
  solveRig(rig);

  beginPaint(e, d);

  // contact shadow first — same layer as the body, and quads keep call order
  if (!silhouette() && e.onGround) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, _proxy.x, e.y + e.h * 0.5 - 1, e.w * 1.6, e.h * 0.17, 0,
      0, 0, 0, 0.45 * d.alpha, LAYER.ACTORS, false, 1);
  }

  if (def.draw) def.draw(R, e, d, rig, _proxy, t, alpha);
  else drawRig(R, rig, _proxy, def.layer === undefined ? LAYER.ACTORS : def.layer);

  if (!silhouette()) {
    glowRig(R, rig, _proxy, d.alpha);
    // generic wind-up halo: readable even when the creature's own tell part is hidden
    if (d.tellK > 0.02 && d.tellCol) {
      const c = d.tellCol;
      const k = d.tellK * d.tellK;
      const s = (e.w + e.h) * (0.55 + k * 0.35);
      R.spriteRaw(R.blob, 0, 0, 1, 1, _proxy.x, _proxy.y - e.h * 0.1, s, s, 0,
        c[0], c[1], c[2], 0.20 * k * d.alpha, LAYER.FX, true, 1);
      R.light({
        x: _proxy.x, y: _proxy.y - e.h * 0.1, radius: (e.w + e.h) * 2.1,
        r: c[0], g: c[1], b: c[2], intensity: 0.9 * k, flicker: 0.15,
      });
    }
    if (def.lightCol && d.alpha > 0.05) {
      R.light({
        x: _proxy.x, y: _proxy.y - e.h * (def.lightY === undefined ? 0.2 : def.lightY),
        radius: def.lightR || 220, r: def.lightCol[0], g: def.lightCol[1], b: def.lightCol[2],
        intensity: (def.lightI || 0.7) * d.alpha, flicker: def.lightFlicker || 0.1,
      });
    }
    if (def.extraDraw) def.extraDraw(R, e, d, rig, _proxy, t);
  }
}

export { LAYER, STATUS };
