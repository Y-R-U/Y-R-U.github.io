/**
 * sporeling — the swarm. Fast, fragile, and it hurts you after it dies.
 *
 * Silhouette: a wide cap balanced on two thin legs, cap wider than the body is
 * tall. Nothing else in the roster is top-heavy, so a crowd of these reads as
 * "swarm" at a glance even at 25% size.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander, jump } from '../ai.js';

const CAP = [0.34, 0.42, 0.24];
const CAPD = [0.22, 0.28, 0.16];
const FLESH = [0.60, 0.62, 0.48];
const TELL = [0.68, 1.0, 0.42];

export default defineEnemy({
  id: 'sporeling',
  name: 'Sporeling',
  role: 'swarm',
  hp: 12, w: 26, h: 32,
  speed: 158, jump: 480, xp: 3,
  ichor: [0.55, 0.8, 0.35],
  death: 'spore', gibs: 5,
  lightCol: [0.5, 0.9, 0.45], lightR: 120, lightI: 0.20, lightY: 0.35,

  parts: [
    { n: 'body', ax: 0, ay: -2, len: 0, w: 21, h: 19, sh: 'disc', col: FLESH },
    { n: 'legL', p: 'body', ax: -5, ay: 7, len: 12, w: 3.4, sh: 'bar', col: CAPD, rest: 1.45 },
    { n: 'legR', p: 'body', ax: 5, ay: 7, len: 12, w: 3.6, sh: 'bar', col: CAPD, rest: 1.75 },
    { n: 'armL', p: 'body', ax: -8, ay: -1, len: 10, w: 3, sh: 'bar', col: CAPD, rest: 2.3 },
    { n: 'armR', p: 'body', ax: 8, ay: -1, len: 11, w: 3.2, sh: 'bar', col: CAPD, rest: 0.85 },
    // the cap: wide, flat, and overhanging — the whole silhouette lives here
    { n: 'cap', p: 'body', ax: 0, ay: -9, len: 0, w: 36, h: 15, sh: 'disc', col: CAP },
    { n: 'capTop', p: 'cap', ax: 0, ay: -4, len: 0, w: 24, h: 11, sh: 'disc', col: CAPD },
    { n: 'nub1', p: 'cap', ax: -10, ay: -7, len: 0, w: 6, h: 6, sh: 'disc', col: [0.5, 0.7, 0.35], tell: 1 },
    { n: 'nub2', p: 'cap', ax: 2, ay: -9, len: 0, w: 7, h: 7, sh: 'disc', col: [0.5, 0.7, 0.35], tell: 1 },
    { n: 'nub3', p: 'cap', ax: 11, ay: -6, len: 0, w: 5, h: 5, sh: 'disc', col: [0.5, 0.7, 0.35], tell: 1 },
    { n: 'eyeL', p: 'body', ax: 2, ay: -3, len: 0, w: 4, h: 4, sh: 'disc', col: [0.7, 1, 0.5], add: true, glow: 0.12, gib: 0 },
  ],

  actions: {
    lunge: {
      wind: 0.36, active: 0.22, recover: 0.28, cooldown: 1.5,
      tell: TELL, sfx: 'sporeling_lunge',
      onStart(world, e, d) { d.lungeDir = 0; },
      fire(world, e, d) {
        d.lungeDir = e.faceX;
        e.vx = e.faceX * 430;
        e.vy = -230;
      },
      during(world, e, d) {
        world.damageArea(e.x + e.faceX * 10, e.y, 20, 7, 'decay', {
          src: e, team: e.team === 1 ? 0 : 1, dirX: e.faceX, dirY: -0.4, force: 180, falloff: 0,
        });
      },
    },
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 7)) {
      d.target = findTarget(world, e, 800);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }
    const t = d.target;
    if (acting(d)) {
      if (d.phase === 0) { driveX(e, 0, 1200, dt); if (t) faceTo(e, t.x); }
      return;
    }
    if (!t) { idleWander(world, e, d, dt, { speed: 50 }); return; }

    const dx = t.x - e.x, dy = t.y - e.y;
    const dist = Math.abs(dx);
    if (dist > 700) { idleWander(world, e, d, dt, { speed: 50 }); return; }

    if (dist < 96 && Math.abs(dy) < 70 && d.cd <= 0) {
      faceTo(e, t.x);
      startAction(e, d, 'lunge');
      return;
    }
    d.state = 'move';
    // scuttling hop-run: it leaves the ground constantly, which is what sells "swarm"
    walkToward(world, e, d, t.x, {
      speed: 158 * d.slowK, accel: 1500, jump: 470, stopAt: 40, gapReach: 220, stepUp: 90,
    }, dt);
    if (e.onGround && Math.random() < 0.03) jump(e, 300);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const sp = Math.abs(e.vx);
    d.anim += (sp * 0.09 + 3) * (1 / 60);
    const w = d.anim;
    const run = Math.min(1, sp / 110);

    const air = e.onGround ? 0 : 1;
    rig.ang[T.legL] = 1.45 + Math.sin(w) * 0.85 * run - air * 0.5;
    rig.ang[T.legR] = 1.75 + Math.sin(w + Math.PI) * 0.85 * run - air * 0.3;
    rig.oy = -Math.abs(Math.sin(w)) * 3.4 * run;

    // the cap lags the body — cheap secondary motion, reads as weight
    const lag = Math.sin(w - 0.8) * 0.16 * run + Math.sin(t * 2.2) * 0.05;
    rig.ang[T.cap] = lag - e.vx * 0.0009;
    rig.ang[T.body] = -e.vx * 0.0006 + Math.sin(t * 3) * 0.03;

    rig.ang[T.armL] = 2.3 + Math.sin(w + 1) * 0.4 * run;
    rig.ang[T.armR] = 0.85 - Math.sin(w + 1) * 0.4 * run;

    if (d.act === 'lunge') {
      if (d.phase === 0) {
        // swells and crouches: the cap flattens, the legs compress
        const k = d.tellK;
        rig.sx *= 1 + k * 0.28;
        rig.sy *= 1 - k * 0.14;
        rig.ang[T.legL] = 1.45 + k * 0.45;
        rig.ang[T.legR] = 1.75 - k * 0.45;
        rig.ang[T.cap] = -0.1 * k;
        rig.oy = k * 4;
      } else {
        rig.sx *= 1.12; rig.sy *= 1.16;
        rig.ang[T.legL] = 2.4; rig.ang[T.legR] = 2.6;
        rig.ang[T.armL] = 2.9; rig.ang[T.armR] = 0.3;
        rig.ang[T.cap] = 0.35;
      }
    }
  },

  onDeathHook(world, e, d) {
    // the burst is the point of the creature: a real cloud that lingers and rots
    world.damageArea(e.x, e.y, 78, 9, 'decay', {
      src: e, hitX: e.x, hitY: e.y, falloff: 1, force: 120,
      status: 'acid', statusTime: 2.5, statusPower: 0.6,
    });
    world.surfaces.pour('spore', e.x, e.y, 0.85, 58);
    world.ctx.audio.sfx('sporeling_burst', { x: e.x, y: e.y });
    return true;
  },
});
