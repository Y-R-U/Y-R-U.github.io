/**
 * oozelord — elite. Splits when you hurt it, and pours real slime into the surface
 * layer as it moves, so the arena degrades into something you cannot run across.
 *
 * The slime is not a visual: it is `world.surfaces` 'slime', it flows downhill, it
 * slows whatever stands in it, and it is still there when the fight is over.
 *
 * Silhouette: a heavy pear of overlapping masses with two drooping arm-drips and a
 * cluster of eyes. It wobbles, so it reads as fluid even in flat black.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander } from '../ai.js';
import { spawnSlimeBlob } from '../projectiles.js';
import { spawnSpellShard } from '../pickups.js';
import { spawnEnemyById } from '../registry.js';

const GEL = [0.20, 0.42, 0.26];
const GEL2 = [0.14, 0.30, 0.20];
const GEL3 = [0.28, 0.55, 0.32];
const TELL = [0.55, 1.0, 0.45];

export default defineEnemy({
  id: 'oozelord',
  name: 'Oozelord',
  role: 'elite',
  elite: true,
  hp: 190, w: 66, h: 62,
  speed: 74, jump: 420, xp: 55,
  friction: 10, flammable: 0.2,
  ichor: [0.35, 0.72, 0.38],
  death: 'splat', gibs: 8,
  deathGlow: [0.4, 1, 0.5],
  lightCol: [0.3, 0.9, 0.45], lightR: 240, lightI: 0.30, lightY: 0.1,

  parts: [
    { n: 'core', ax: 0, ay: 4, len: 0, w: 56, h: 44, sh: 'disc', col: GEL },
    { n: 'm1', p: 'core', ax: -16, ay: 4, len: 0, w: 34, h: 30, sh: 'disc', col: GEL2 },
    { n: 'm2', p: 'core', ax: 16, ay: 6, len: 0, w: 32, h: 28, sh: 'disc', col: GEL2 },
    { n: 'm3', p: 'core', ax: -4, ay: -16, len: 0, w: 40, h: 28, sh: 'disc', col: GEL3 },
    { n: 'm4', p: 'core', ax: 12, ay: -14, len: 0, w: 26, h: 22, sh: 'disc', col: GEL3 },
    { n: 'skirt', p: 'core', ax: 0, ay: 18, len: 0, w: 62, h: 20, sh: 'disc', col: GEL2 },

    { n: 'armL', p: 'core', ax: -22, ay: -4, len: 22, w: 15, sh: 'disc', col: GEL2, rest: 1.15 },
    { n: 'dripL', p: 'armL', ax: 20, ay: 0, len: 16, w: 11, sh: 'disc', col: GEL2, rest: 0.5, tell: 0.5, rel: 1 },
    { n: 'armR', p: 'core', ax: 22, ay: -4, len: 24, w: 17, sh: 'disc', col: GEL, rest: 1.35 },
    { n: 'dripR', p: 'armR', ax: 22, ay: 0, len: 18, w: 13, sh: 'disc', col: GEL, rest: 0.45, tell: 0.5, rel: 1 },

    { n: 'eye1', p: 'core', ax: 6, ay: -14, len: 0, w: 10, h: 10, sh: 'disc', col: [0.85, 1, 0.6], add: true, glow: 0.2, tell: 1, gib: 0 },
    { n: 'eye2', p: 'core', ax: 16, ay: -8, len: 0, w: 7, h: 7, sh: 'disc', col: [0.8, 1, 0.55], add: true, glow: 0.14, tell: 1, gib: 0 },
    { n: 'eye3', p: 'core', ax: -2, ay: -6, len: 0, w: 6, h: 6, sh: 'disc', col: [0.8, 1, 0.55], add: true, glow: 0.12, tell: 1, gib: 0 },
  ],

  actions: {
    spray: {
      wind: 0.5, active: 0.3, recover: 0.45, cooldown: 3.0,
      tell: TELL, sfx: 'ooze_spray',
      onStart(world, e, d) { d.sprayN = 0; },
      fire(world, e, d) { d.sprayN = 0; },
      during(world, e, d, dt) {
        d.sprayT = (d.sprayT || 0) - dt;
        if (d.sprayT > 0 || d.sprayN >= 5) return;
        d.sprayT = 0.055;
        const spread = -1.5 + d.sprayN * 0.34;
        const sp = 430 + Math.random() * 90;
        spawnSlimeBlob(world, e, e.x + e.faceX * 20, e.y - 10,
          Math.cos(spread) * sp * e.faceX, Math.sin(spread) * sp, { damage: 8, amount: 0.9 });
        d.sprayN++;
      },
    },
    slam: {
      wind: 0.46, active: 0.16, recover: 0.5, cooldown: 2.2,
      tell: TELL, sfx: 'ooze_slam',
      fire(world, e, d) {
        world.damageArea(e.x, e.y + e.h * 0.4, 110, 20, 'acid', {
          src: e, team: e.team === 1 ? 0 : 1, dirY: -1, force: 520, falloff: 1,
          status: 'slow', statusTime: 2.5, statusPower: 0.8, props: true,
        });
        world.surfaces.pour('slime', e.x, e.y + e.h * 0.45, 1.0, 92);
        world.R.fx.shake(0.3, 0.35);
        world.R.fx.shockwave(e.x, e.y + e.h * 0.4, 0.5);
        world.P.emit({
          x: e.x, y: e.y + e.h * 0.4, count: 28, vx: 0, vy: -1, speed: 380, speedVar: 260, vSpread: 1.5,
          life: 0.8, lifeVar: 0.4, size: 16, sizeEnd: 4,
          color: [0.42, 0.85, 0.48, 0.95], color2: [0.1, 0.26, 0.15, 0], gravity: 1100, drag: 1, collide: true, bounce: 0.2,
        });
      },
    },
  },

  onSpawn(world, e, d, o) {
    d.gen = o.gen || 0;
    d.splitAt = e.maxHp * 0.62;
    d.wob = Math.random() * 6.28;
    d.trail = 0;
    if (d.gen > 0) { d.xp = Math.round(d.xp * 0.3); }
  },

  onDamageHook(world, e, d, amount, type) {
    // splitting is the identity: hurting it makes MORE of it, once per threshold
    if (e.hp - amount <= d.splitAt && d.gen < 2 && e.hp - amount > 0) {
      d.splitAt = -1;
      d.pendingSplit = 1;
    }
    return amount;
  },

  think(world, e, d, dt) {
    if (d.pendingSplit) { d.pendingSplit = 0; split(world, e, d, 1); }

    if (thinkNow(world, e, 9)) {
      d.target = findTarget(world, e, 900);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }

    // it leaks constantly, not only when it attacks
    d.trail -= dt;
    if (d.trail <= 0) {
      d.trail = 0.22;
      world.surfaces.add('slime', e.x, e.y + e.h * 0.5 + 6, 0.28 * (1 - d.gen * 0.3));
    }

    const t = d.target;
    if (acting(d)) { if (d.phase < 2 && d.act !== 'spray') driveX(e, 0, 800, dt); if (t && d.phase === 0) faceTo(e, t.x); return; }
    if (!t) { idleWander(world, e, d, dt, { speed: 26 }); return; }

    const dx = t.x - e.x;
    const dist = Math.abs(dx);
    if (dist > 900) { idleWander(world, e, d, dt, { speed: 26 }); return; }

    if (d.cd <= 0) {
      if (dist < 95) { faceTo(e, t.x); startAction(e, d, 'slam'); return; }
      if (dist < 460 && d.seesTarget) { faceTo(e, t.x); startAction(e, d, 'spray'); return; }
    }
    d.state = 'move';
    walkToward(world, e, d, t.x, {
      speed: 74 * d.slowK, accel: 380, jump: 420, stopAt: 62, gapReach: 150, stepUp: 60,
    }, dt);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const sp = Math.abs(e.vx);
    d.anim += (sp * 0.03 + 1.5) * (1 / 60);
    const w = d.anim;

    // the whole body is a jelly: every mass wobbles on its own phase
    const jig = 1 + Math.sin(t * 5.2 + d.wob) * 0.05;
    rig.sx *= jig; rig.sy *= 2 - jig;
    rig.oy = Math.sin(w * 2) * 3 - Math.abs(Math.sin(w)) * 2;

    rig.widS[T.m1] = 1 + Math.sin(t * 4.1 + 1) * 0.10;
    rig.widS[T.m2] = 1 + Math.sin(t * 3.7 + 2) * 0.10;
    rig.widS[T.m3] = 1 + Math.sin(t * 4.6 + 3) * 0.09;
    rig.widS[T.m4] = 1 + Math.sin(t * 5.1 + 4) * 0.11;
    rig.widS[T.skirt] = 1 + Math.sin(t * 3.2) * 0.07;
    rig.ang[T.core] = Math.sin(t * 2.4) * 0.05 - e.vx * 0.0008;

    rig.ang[T.armL] = 1.15 + Math.sin(w + Math.PI) * 0.3;
    rig.ang[T.armR] = 1.35 + Math.sin(w) * 0.3;
    rig.ang[T.dripL] = 0.5 + Math.sin(t * 3.3) * 0.2;
    rig.ang[T.dripR] = 0.45 + Math.sin(t * 3.1 + 1) * 0.2;

    if (d.act === 'slam') {
      if (d.phase === 0) {
        const k = d.tellK * d.tellK;
        rig.sy *= 1 + k * 0.42;      // rears up tall before it drops
        rig.sx *= 1 - k * 0.16;
        rig.oy -= k * 14;
        rig.ang[T.armL] = 1.15 - 2.2 * k;
        rig.ang[T.armR] = 1.35 - 2.4 * k;
      } else {
        const k = Math.min(1, d.actT / 0.12);
        rig.sy *= 1.42 - k * 0.62;
        rig.sx *= 0.84 + k * 0.5;
        rig.ang[T.armL] = -1.05 + 2.2 * k;
        rig.ang[T.armR] = -1.05 + 2.4 * k;
      }
    } else if (d.act === 'spray') {
      const k = d.phase === 0 ? d.tellK : 1;
      rig.ang[T.armR] = 1.35 - 1.5 * k;
      rig.ang[T.dripR] = 0.45 - 0.8 * k;
      rig.widS[T.dripR] = 1 + k * 0.8;
      rig.sx *= 1 + k * 0.1;
    }
  },

  onDeathHook(world, e, d) {
    if (d.gen < 2) split(world, e, d, 2);
    else if (Math.random() < 0.3) split(world, e, d, 1);
    world.surfaces.pour('slime', e.x, e.y + e.h * 0.4, 1.2, 110);
    if (d.gen === 0) {
      spawnSpellShard(world, e.x, e.y - 10, { value: 1 });
      world.R.fx.flash(0.4, 1, 0.55, 0.14, 0.14);
    }
    return true;
  },
});

/** Children inherit the split generation, shrink, and are flung apart. */
function split(world, e, d, n) {
  const gen = d.gen + 1;
  const scale = gen === 1 ? 0.62 : 0.42;
  for (let i = 0; i < n; i++) {
    const dir = i === 0 ? -1 : 1;
    const c = spawnEnemyById(world, 'oozelord', e.x + dir * 26, e.y + e.h * 0.4, {
      team: e.team, scale, gen,
      hp: Math.max(24, Math.round(e.maxHp * (gen === 1 ? 0.30 : 0.16))),
      cd: 0.7 + Math.random() * 0.5,
    });
    if (c) { c.vx = dir * 240; c.vy = -320; c.invuln = 0.3; }
  }
  world.P.emit({
    x: e.x, y: e.y, count: 24, speed: 300, speedVar: 220, life: 0.6, lifeVar: 0.35,
    size: 15, sizeEnd: 3, color: [0.45, 0.9, 0.5, 0.95], color2: [0.1, 0.28, 0.16, 0],
    gravity: 900, drag: 1.1, collide: true, bounce: 0.2,
  });
  world.ctx.audio.sfx('ooze_split', { x: e.x, y: e.y });
}
