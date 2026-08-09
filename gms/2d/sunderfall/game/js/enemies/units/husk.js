/**
 * husk — the fodder. Shambles, swipes, dies in two hits, and leaves a body.
 *
 * Silhouette: hunched spine, head pushed forward past the chest, arms too long and
 * hanging below the knees. Even in flat black it reads as "something that used to
 * be a person and is not any more", which is the whole job.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander } from '../ai.js';

const SKIN = [0.300, 0.320, 0.255];
const MID = [0.245, 0.262, 0.212];
const DARK = [0.185, 0.205, 0.175];
const RAG = [0.230, 0.212, 0.200];
const TELL = [0.62, 1.0, 0.48];

export default defineEnemy({
  id: 'husk',
  name: 'Husk',
  role: 'fodder',
  hp: 30, w: 30, h: 62,
  speed: 66, jump: 560, xp: 5,
  ichor: [0.42, 0.52, 0.28],
  corpseCol: [0.17, 0.19, 0.15],
  death: 'burst', leavesCorpse: true, gibs: 9,

  parts: [
    { n: 'pelvis', ax: 0, ay: 4, len: 0, w: 24, h: 16, sh: 'disc', col: DARK },

    { n: 'thighL', p: 'pelvis', ax: -4, ay: 3, len: 14, w: 9, sh: 'bar', col: DARK, rest: 1.40 },
    { n: 'shinL', p: 'thighL', ax: 13, ay: 0, len: 13, w: 7.5, sh: 'bar', col: DARK, rest: 0.18, rel: 1 },
    { n: 'footL', p: 'shinL', ax: 12, ay: 0, len: 11, w: 5.5, sh: 'bar', col: DARK, rest: -1.40, rel: 1 },
    { n: 'thighR', p: 'pelvis', ax: 4, ay: 3, len: 14, w: 9.5, sh: 'bar', col: MID, rest: 1.72 },
    { n: 'shinR', p: 'thighR', ax: 13, ay: 0, len: 13, w: 8, sh: 'bar', col: MID, rest: -0.18, rel: 1 },
    { n: 'footR', p: 'shinR', ax: 12, ay: 0, len: 11, w: 6, sh: 'bar', col: MID, rest: -1.40, rel: 1 },

    // torso leans a full 45 degrees; the head ends up AHEAD of the chest, not above it
    { n: 'torso', p: 'pelvis', ax: 0, ay: -4, len: 24, w: 26, sh: 'disc', col: SKIN, rest: -1.20 },
    { n: 'rags', p: 'torso', ax: 10, ay: 3, len: 18, w: 26, sh: 'disc', col: RAG, rest: 1.35 },
    { n: 'chest', p: 'torso', ax: 18, ay: 0, len: 0, w: 28, h: 24, sh: 'disc', col: SKIN },
    { n: 'neck', p: 'torso', ax: 24, ay: 0, len: 7, w: 9, sh: 'bar', col: DARK, rest: 0.15 },
    { n: 'head', p: 'neck', ax: 7, ay: 0, len: 0, w: 19, h: 17, sh: 'disc', col: SKIN },
    { n: 'jaw', p: 'head', ax: 4, ay: 5, len: 10, w: 7, sh: 'bar', col: DARK, rest: 0.55, rel: 1 },
    { n: 'eye', p: 'head', ax: 5, ay: -2, len: 0, w: 5, h: 4, sh: 'disc', col: [0.55, 0.95, 0.45], add: true, glow: 0.12, tell: 1, gib: 0 },

    // arms hang past the knees — the one proportion that makes it read as not-human
    { n: 'armL', p: 'torso', ax: 20, ay: -7, len: 17, w: 6.5, sh: 'bar', col: DARK, rest: 1.05 },
    { n: 'foreL', p: 'armL', ax: 16, ay: 0, len: 17, w: 5.5, sh: 'bar', col: DARK, rest: 0.30, rel: 1 },
    { n: 'clawL', p: 'foreL', ax: 16, ay: 0, len: 9, w: 6.5, sh: 'bar', col: MID, rest: 0.25, tell: 1, rel: 1 },
    { n: 'armR', p: 'torso', ax: 20, ay: 7, len: 17, w: 7, sh: 'bar', col: SKIN, rest: 1.30 },
    { n: 'foreR', p: 'armR', ax: 17, ay: 0, len: 18, w: 6, sh: 'bar', col: SKIN, rest: 0.35, rel: 1 },
    { n: 'clawR', p: 'foreR', ax: 17, ay: 0, len: 10, w: 7, sh: 'bar', col: [0.36, 0.38, 0.30], rest: 0.25, tell: 1, rel: 1 },
  ],

  actions: {
    swipe: {
      wind: 0.45, active: 0.14, recover: 0.34, cooldown: 1.05,
      range: 52, tell: TELL, sfx: 'husk_swipe',
      fire(world, e, d) {
        const hx = e.x + e.faceX * 34;
        const hy = e.y - 6;
        world.damageArea(hx, hy, 34, 9, 'impact', {
          src: e, team: e.team === 1 ? 0 : 1, hitX: hx, hitY: hy,
          dirX: e.faceX, dirY: -0.25, force: 240, falloff: 0,
        });
        world.P.emit({
          x: hx, y: hy, count: 10, vx: e.faceX, vy: -0.2, speed: 260, speedVar: 160, vSpread: 0.7,
          life: 0.24, lifeVar: 0.12, size: 9, sizeEnd: 1,
          color: [0.6, 0.95, 0.5, 0.8], color2: [0.15, 0.3, 0.12, 0], add: true, drag: 3, stretch: 1.8,
        });
        world.R.fx.shake(0.05, 0.1);
      },
    },
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 9)) {
      d.target = findTarget(world, e, 900);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
      if (d.seesTarget) { d.lastSeenX = d.target.x; d.lastSeenY = d.target.y; }
    }
    const t = d.target;

    if (acting(d)) {
      if (d.phase < 2) driveX(e, 0, 900, dt);
      if (t && d.phase === 0) faceTo(e, t.x);
      return;
    }

    if (!t) { idleWander(world, e, d, dt, { speed: 26 }); return; }

    const dx = t.x - e.x, dy = t.y - e.y;
    const dist = Math.abs(dx);
    if (dist > 900 || Math.abs(dy) > 380) { idleWander(world, e, d, dt, { speed: 26 }); return; }

    if (dist < 48 && Math.abs(dy) < 46 && d.cd <= 0) {
      faceTo(e, t.x);
      startAction(e, d, 'swipe');
      return;
    }
    d.state = 'move';
    walkToward(world, e, d, t.x, {
      speed: 66 * d.slowK, accel: 420, jump: 540, stopAt: 34, gapReach: 170, stepUp: 70,
    }, dt);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const speed = Math.abs(e.vx);
    d.anim += (speed * 0.055 + 1.1) * (1 / 60);
    const w = d.anim;
    const walk = Math.min(1, speed / 60);
    const breathe = Math.sin(t * 1.9) * 0.05;

    rig.ang[T.pelvis] = Math.sin(w * 2) * 0.05 * walk;
    rig.oy = Math.abs(Math.sin(w)) * -2.2 * walk;

    // legs: a lurching, uneven gait — one leg drags
    rig.ang[T.thighL] = 1.40 + Math.sin(w) * 0.62 * walk;
    rig.ang[T.shinL] = 0.18 + Math.max(0, -Math.sin(w - 0.9)) * 0.9 * walk;
    rig.ang[T.thighR] = 1.72 + Math.sin(w + Math.PI) * 0.42 * walk;
    rig.ang[T.shinR] = -0.2 + Math.max(0, -Math.sin(w + Math.PI - 0.9)) * 0.55 * walk;
    rig.ang[T.footL] = -1.40 - Math.sin(w) * 0.2 * walk;
    rig.ang[T.footR] = -1.40 - Math.sin(w + Math.PI) * 0.15 * walk;

    rig.ang[T.torso] = -1.20 + breathe + Math.sin(w * 2) * 0.045 * walk;
    rig.ang[T.neck] = 0.15 + Math.sin(w * 2 + 1) * 0.06 * walk;
    rig.ang[T.head] = Math.sin(t * 1.3) * 0.09;
    rig.ang[T.jaw] = 0.55 + Math.sin(t * 2.6) * 0.12;

    let swingL = Math.sin(w + Math.PI) * 0.3 * walk;
    let swingR = Math.sin(w) * 0.3 * walk;
    let raise = 0;

    if (d.act === 'swipe') {
      if (d.phase === 0) {
        // wind-up: the striking arm hauls back and UP, well clear of the body
        const k = d.tellK * d.tellK;
        raise = -2.6 * k;
        swingR = 0;
        rig.ang[T.torso] = -1.20 - 0.30 * k;
        rig.ang[T.foreR] = 0.35 + 1.5 * k;
      } else {
        const k = Math.min(1, d.actT / 0.1);
        raise = -2.6 + 3.15 * k;
        rig.ang[T.foreR] = 1.85 - 1.6 * k;
        rig.ang[T.torso] = -1.20 + 0.32 * k;
      }
    } else {
      rig.ang[T.foreR] = 0.35 + Math.sin(w + 0.6) * 0.12 * walk;
    }

    rig.ang[T.armL] = 1.05 + swingL;
    rig.ang[T.foreL] = 0.30 + Math.sin(w + Math.PI + 0.6) * 0.14 * walk;
    rig.ang[T.armR] = 1.30 + swingR + raise;

    if (d.hurtT > 0) {
      const k = d.hurtT / 0.3;
      rig.ang[T.torso] -= 0.28 * k;
      rig.ang[T.neck] += 0.35 * k;
    }
  },

  // a husk burned to nothing leaves nothing Gravewake can use
  corpseIf(world, e) { return !(e.burning > 0.2); },
});
