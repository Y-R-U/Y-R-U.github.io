/**
 * gloamarcher — the ranged one. Perches high, keeps its distance, and fires a slow
 * homing bolt that you must keep moving to shed.
 *
 * The whole design intent is "forces movement": it never chases, it repositions to
 * a better ledge, and its shot punishes standing still rather than standing wrong.
 *
 * Silhouette: crouched, hooded, with a bow arc that is nearly as tall as it is.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import {
  walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander, findPerch, jump, floorAhead,
} from '../ai.js';
import { spawnTrackingBolt } from '../projectiles.js';

const CLOTH = [0.155, 0.145, 0.205];
const CLOTH2 = [0.10, 0.095, 0.145];
const BOW = [0.22, 0.19, 0.17];
const TELL = [0.66, 0.5, 1.0];

export default defineEnemy({
  id: 'gloamarcher',
  name: 'Gloamarcher',
  role: 'ranged',
  hp: 26, w: 28, h: 66,
  speed: 96, jump: 700, xp: 9,
  ichor: [0.45, 0.35, 0.62],
  death: 'dissolve', gibs: 8,
  deathGlow: [0.6, 0.45, 1],

  parts: [
    { n: 'pelvis', ax: 0, ay: 6, len: 0, w: 16, h: 12, sh: 'disc', col: CLOTH2 },
    { n: 'thighL', p: 'pelvis', ax: -3, ay: 3, len: 15, w: 7, sh: 'bar', col: CLOTH2, rest: 0.95 },
    { n: 'shinL', p: 'thighL', ax: 14, ay: 0, len: 15, w: 6, sh: 'bar', col: CLOTH2, rest: 0.95, rel: 1 },
    { n: 'thighR', p: 'pelvis', ax: 3, ay: 3, len: 15, w: 7.5, sh: 'bar', col: CLOTH, rest: 1.9 },
    { n: 'shinR', p: 'thighR', ax: 14, ay: 0, len: 15, w: 6.5, sh: 'bar', col: CLOTH, rest: -0.2, rel: 1 },

    { n: 'torso', p: 'pelvis', ax: 0, ay: -3, len: 22, w: 19, sh: 'disc', col: CLOTH, rest: -1.42 },
    { n: 'cloak', p: 'torso', ax: 9, ay: -6, len: 26, w: 22, sh: 'disc', col: CLOTH2, rest: 1.85 },
    { n: 'hood', p: 'torso', ax: 21, ay: -1, len: 0, w: 21, h: 20, sh: 'disc', col: CLOTH },
    { n: 'peak', p: 'hood', ax: -6, ay: -6, len: 17, w: 11, sh: 'disc', col: CLOTH2, rest: -2.6 },
    { n: 'face', p: 'hood', ax: 5, ay: 2, len: 0, w: 9, h: 7, sh: 'disc', col: [0.05, 0.04, 0.09], gib: 0 },
    { n: 'gaze', p: 'hood', ax: 6, ay: 2, len: 0, w: 6, h: 3, sh: 'disc', col: [0.7, 0.55, 1], add: true, glow: 0.16, tell: 1, gib: 0 },

    // bow arm holds the arc out front; the arc is three bars, which is enough curve
    { n: 'armL', p: 'torso', ax: 17, ay: -3, len: 19, w: 6.5, sh: 'bar', col: CLOTH, rest: 0.05 },
    { n: 'grip', p: 'armL', ax: 19, ay: 0, len: 6, w: 6, sh: 'disc', col: BOW, rest: 0, rel: 1 },
    { n: 'bowU1', p: 'grip', ax: 3, ay: 0, len: 20, w: 4.2, sh: 'bar', col: BOW, rest: -1.62 },
    { n: 'bowU2', p: 'bowU1', ax: 19, ay: 0, len: 17, w: 3.4, sh: 'bar', col: BOW, rest: 0.42, rel: 1 },
    { n: 'bowD1', p: 'grip', ax: 3, ay: 0, len: 20, w: 4.2, sh: 'bar', col: BOW, rest: 1.62 },
    { n: 'bowD2', p: 'bowD1', ax: 19, ay: 0, len: 17, w: 3.4, sh: 'bar', col: BOW, rest: -0.42, rel: 1 },

    { n: 'armR', p: 'torso', ax: 16, ay: 4, len: 18, w: 6, sh: 'bar', col: CLOTH2, rest: 0.35 },
    { n: 'foreR', p: 'armR', ax: 18, ay: 0, len: 15, w: 5.5, sh: 'bar', col: CLOTH2, rest: -0.15, rel: 1 },
    { n: 'nock', p: 'foreR', ax: 14, ay: 0, len: 0, w: 7, h: 7, sh: 'disc', col: [0.6, 0.45, 1], add: true, glow: 0.55, tell: 1, gib: 0 },
  ],

  actions: {
    loose: {
      wind: 0.62, active: 0.1, recover: 0.42, cooldown: 2.0,
      tell: TELL, sfx: 'archer_loose',
      fire(world, e, d) {
        const t = d.target;
        const ox = e.x + e.faceX * 26, oy = e.y - 8;
        let dx = e.faceX, dy = -0.05;
        if (t) {
          dx = t.x - ox; dy = (t.y - t.h * 0.15) - oy;
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        }
        spawnTrackingBolt(world, e, ox, oy, dx, dy, { speed: 248, turn: 1.55, damage: 11 });
        world.P.emit({
          x: ox, y: oy, count: 12, vx: dx, vy: dy, speed: 300, speedVar: 200, vSpread: 0.5,
          life: 0.3, lifeVar: 0.15, size: 10, sizeEnd: 1,
          color: [0.75, 0.6, 1, 1], color2: [0.15, 0.05, 0.35, 0], add: true, drag: 3, stretch: 1.8,
        });
      },
    },
    kick: {
      wind: 0.35, active: 0.1, recover: 0.3, cooldown: 1.6,
      tell: [0.8, 0.7, 1],
      fire(world, e, d) {
        world.damageArea(e.x + e.faceX * 26, e.y + 8, 26, 8, 'impact', {
          src: e, team: e.team === 1 ? 0 : 1, dirX: e.faceX, dirY: -0.6, force: 480, falloff: 0,
        });
      },
    },
  },

  onSpawn(world, e, d, o) {
    d.perchX = e.x;
    d.repositionT = 0;
    d.preferHigh = o.preferHigh !== false;
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 11)) {
      d.target = findTarget(world, e, 1000);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }
    const t = d.target;
    if (acting(d)) { if (d.phase < 2) driveX(e, 0, 900, dt); if (t && d.phase === 0) faceTo(e, t.x); return; }
    if (!t) { idleWander(world, e, d, dt, { speed: 28 }); return; }

    const dx = t.x - e.x;
    const dist = Math.hypot(dx, t.y - e.y);
    d.repositionT -= dt;

    // too close: kick free, then back off. It never trades in melee.
    if (dist < 92) {
      faceTo(e, t.x);
      if (d.cd <= 0 && dist < 62) { startAction(e, d, 'kick'); return; }
      d.state = 'move';
      const away = e.x - Math.sign(dx || 1) * 260;
      if (!floorAhead(world, e, e.w * 0.5 + 16) && e.onGround) jump(e, 640);
      walkToward(world, e, d, away, { speed: 130 * d.slowK, accel: 900, jump: 660, ledgeStop: false, gapReach: 230 }, dt);
      return;
    }

    if (dist < 640 && d.seesTarget && d.cd <= 0) {
      faceTo(e, t.x);
      driveX(e, 0, 900, dt);
      startAction(e, d, 'loose');
      return;
    }

    // no shot: climb to somewhere with one. Perch search is the expensive sense,
    // so it only runs when repositioning is actually wanted.
    if (d.repositionT <= 0) {
      d.repositionT = 1.6 + Math.random();
      const perch = d.preferHigh ? findPerch(world, e, t.x, t.y, 420) : null;
      d.perchX = perch ? perch.x : t.x + (dx > 0 ? -300 : 300);
    }
    d.state = 'move';
    faceTo(e, t.x);
    walkToward(world, e, d, d.perchX, {
      speed: 96 * d.slowK, accel: 700, jump: 700, stopAt: 26, gapReach: 240, stepUp: 100, ledgeStop: false,
    }, dt);
    if (Math.abs(d.perchX - e.x) < 30) faceTo(e, t.x);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const sp = Math.abs(e.vx);
    d.anim += (sp * 0.06 + 1.4) * (1 / 60);
    const w = d.anim;
    const run = Math.min(1, sp / 95);
    const crouch = 1 - run * 0.6;

    rig.oy = 3 * crouch - Math.abs(Math.sin(w)) * 2.4 * run;
    rig.ang[T.thighL] = 0.95 + Math.sin(w) * 0.6 * run + (1 - run) * 0.25;
    rig.ang[T.shinL] = 0.95 - Math.sin(w) * 0.35 * run - (1 - run) * 0.2;
    rig.ang[T.thighR] = 1.9 + Math.sin(w + Math.PI) * 0.6 * run;
    rig.ang[T.shinR] = -0.2 - Math.min(0, Math.sin(w + Math.PI)) * 0.5 * run;

    rig.ang[T.torso] = -1.42 + 0.16 * crouch + Math.sin(t * 1.7) * 0.03;
    rig.ang[T.hood] = Math.sin(t * 1.1) * 0.06;
    rig.ang[T.cloak] = 1.85 + Math.sin(t * 1.4) * 0.09 - e.vx * 0.0012;

    // the bow is aimed at the target even while walking — reads as "he has you"
    let aim = 0;
    if (d.target) {
      const dx = (d.target.x - e.x) * e.faceX;
      const dy = (d.target.y - d.target.h * 0.15) - (e.y - 8);
      aim = Math.atan2(dy, Math.max(20, dx));
    }
    const armAim = Math.max(-0.9, Math.min(0.9, aim));
    rig.ang[T.armL] = 0.05 + armAim;

    let draw = 0;
    if (d.act === 'loose') {
      if (d.phase === 0) draw = d.tellK;
      else if (d.phase === 1) draw = 1 - Math.min(1, d.actT / 0.06);
      else draw = 0;
    }
    // draw: the string hand hauls back past the hood, bow limbs bend inward
    rig.ang[T.armR] = 0.35 + armAim + draw * 2.30;
    rig.ang[T.foreR] = -0.15 - draw * 1.55;
    rig.ang[T.bowU2] = 0.42 + draw * 0.5;
    rig.ang[T.bowD2] = -0.42 - draw * 0.5;
    rig.widS[T.nock] = 0.5 + draw * 1.6;
    rig.hide[T.nock] = draw < 0.05 ? 1 : 0;

    if (d.hurtT > 0) {
      const k = d.hurtT / 0.3;
      rig.ang[T.torso] -= 0.28 * k;
      rig.ang[T.hood] += 0.3 * k;
    }
  },

  /** Draws the bowstring: two lines from the limb tips to the drawing hand. */
  extraDraw(R, e, d, rig, proxy, t) {
    const T = rig.tpl.index;
    const flip = e.faceX < 0 ? -1 : 1;
    const tipU = boneEnd(rig, T.bowU2);
    const tipD = boneEnd(rig, T.bowD2);
    const hand = boneEnd(rig, T.foreR);
    const wx = (lx) => proxy.x + flip * lx * rig.sx;
    const wy = (ly) => proxy.y + ly * rig.sy;
    const col = { r: 0.55, g: 0.5, b: 0.7, a: 0.85 };
    R.line(wx(tipU.x), wy(tipU.y), wx(hand.x), wy(hand.y), 1.6, col, R.LAYER ? R.LAYER.ACTORS : 7);
    R.line(wx(tipD.x), wy(tipD.y), wx(hand.x), wy(hand.y), 1.6, col, R.LAYER ? R.LAYER.ACTORS : 7);
  },
});

const _ends = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
let _endN = 0;
function boneEnd(rig, i) {
  const o = _ends[_endN++ % _ends.length];
  const len = rig.tpl.len[i] * rig.lenS[i];
  o.x = rig.px[i] + Math.cos(rig.la[i]) * len;
  o.y = rig.py[i] + Math.sin(rig.la[i]) * len;
  return o;
}
