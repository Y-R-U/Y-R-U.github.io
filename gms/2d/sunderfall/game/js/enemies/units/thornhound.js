/**
 * thornhound — the rusher. Crouches, scrapes, then commits to a straight line.
 *
 * The charge is deliberately un-steerable once launched: the player's counterplay
 * is to jump it or shove it, and that only works if the creature is honest about
 * where it is going.
 *
 * Silhouette: long and low, no neck, a ridge of thorns rising over the shoulders.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander, wallAhead, propAhead } from '../ai.js';

const HIDE = [0.255, 0.185, 0.170];
const HIDE2 = [0.190, 0.135, 0.128];
const THORN = [0.235, 0.105, 0.100];
const TELL = [1.0, 0.32, 0.22];

export default defineEnemy({
  id: 'thornhound',
  name: 'Thornhound',
  role: 'rusher',
  hp: 46, w: 60, h: 40,
  speed: 130, jump: 620, xp: 8,
  ichor: [0.55, 0.14, 0.15],
  death: 'burst', gibs: 10, leavesCorpse: false,

  parts: [
    { n: 'spine', ax: 0, ay: -4, len: 30, w: 24, sh: 'disc', col: HIDE, rest: -0.06 },
    { n: 'haunch', p: 'spine', ax: -3, ay: 0, len: 0, w: 32, h: 29, sh: 'disc', col: HIDE2 },
    { n: 'chest', p: 'spine', ax: 29, ay: 0, len: 0, w: 27, h: 25, sh: 'disc', col: HIDE },

    { n: 'tail', p: 'spine', ax: -8, ay: -2, len: 17, w: 7, sh: 'bar', col: HIDE2, rest: -2.85 },
    { n: 'tail2', p: 'tail', ax: 16, ay: 0, len: 14, w: 4.5, sh: 'bar', col: HIDE2, rest: -0.3, rel: 1 },

    { n: 'neck', p: 'chest', ax: 3, ay: 1, len: 11, w: 19, sh: 'disc', col: HIDE, rest: 0.24 },
    { n: 'head', p: 'neck', ax: 7, ay: 0, len: 18, w: 16, sh: 'disc', col: HIDE, rest: 0.12 },
    { n: 'jaw', p: 'head', ax: 5, ay: 6, len: 15, w: 6, sh: 'bar', col: HIDE2, rest: 0.18, rel: 1 },
    { n: 'fang1', p: 'head', ax: 16, ay: 4, len: 6, w: 4, sh: 'bar', col: [0.62, 0.60, 0.51], rest: 1.3, tell: 0.4, rel: 1 },
    { n: 'eye', p: 'head', ax: 7, ay: -4, len: 0, w: 5, h: 4, sh: 'disc', col: [1, 0.42, 0.26], add: true, glow: 0.14, tell: 1, gib: 0 },

    // the ridge: short, dark, rising then falling. It is a texture on the back, not a crown.
    { n: 'th1', p: 'spine', ax: 2, ay: -11, len: 6, w: 4, sh: 'bar', col: THORN, rest: -1.95, tell: 1 },
    { n: 'th2', p: 'spine', ax: 9, ay: -12, len: 10, w: 4.5, sh: 'bar', col: THORN, rest: -1.88, tell: 1 },
    { n: 'th3', p: 'spine', ax: 16, ay: -12, len: 13, w: 5, sh: 'bar', col: THORN, rest: -1.82, tell: 1 },
    { n: 'th4', p: 'spine', ax: 23, ay: -11, len: 9, w: 4.5, sh: 'bar', col: THORN, rest: -1.76, tell: 1 },
    { n: 'th5', p: 'spine', ax: 29, ay: -9, len: 6, w: 4, sh: 'bar', col: THORN, rest: -1.70, tell: 1 },

    { n: 'legFL', p: 'chest', ax: 3, ay: 9, len: 13, w: 6, sh: 'bar', col: HIDE2, rest: 1.5 },
    { n: 'pawFL', p: 'legFL', ax: 12, ay: 0, len: 11, w: 5.5, sh: 'bar', col: HIDE2, rest: 0.05, rel: 1 },
    { n: 'legFR', p: 'chest', ax: 7, ay: 9, len: 13, w: 6.5, sh: 'bar', col: HIDE, rest: 1.6 },
    { n: 'pawFR', p: 'legFR', ax: 12, ay: 0, len: 11, w: 6, sh: 'bar', col: HIDE, rest: -0.05, rel: 1 },
    { n: 'legBL', p: 'haunch', ax: -4, ay: 9, len: 14, w: 6.5, sh: 'bar', col: HIDE2, rest: 1.55 },
    { n: 'pawBL', p: 'legBL', ax: 13, ay: 0, len: 11, w: 5.5, sh: 'bar', col: HIDE2, rest: 0, rel: 1 },
    { n: 'legBR', p: 'haunch', ax: -1, ay: 9, len: 14, w: 7, sh: 'bar', col: HIDE, rest: 1.65 },
    { n: 'pawBR', p: 'legBR', ax: 13, ay: 0, len: 11, w: 6, sh: 'bar', col: HIDE, rest: -0.1, rel: 1 },
  ],

  actions: {
    charge: {
      wind: 0.52, active: 1.5, recover: 0.55, cooldown: 2.2,
      tell: TELL, sfx: 'hound_charge',
      onStart(world, e, d) { d.chargeDir = e.faceX; },
      onWind(world, e, d, k) {
        if (k > 0.5 && Math.random() < 0.4) {
          // scraping the ground: dirt kicks BACKWARD from the rear paws
          world.P.emit({
            x: e.x - e.faceX * 22, y: e.y + e.h * 0.45, count: 2,
            vx: -e.faceX, vy: -0.5, speed: 200, speedVar: 140, vSpread: 0.5,
            life: 0.5, lifeVar: 0.3, size: 8, sizeEnd: 2,
            color: [0.4, 0.33, 0.24, 0.9], color2: [0.2, 0.16, 0.12, 0], gravity: 800, drag: 1.2,
          });
        }
      },
      fire(world, e, d) {
        d.chargeDir = e.faceX;
        d.chargeHit = false;
        e.vx = e.faceX * 660;
        world.R.fx.shake(0.08, 0.15);
      },
      during(world, e, d, dt) {
        e.faceX = d.chargeDir;
        if (Math.abs(e.vx) < 620) e.vx += d.chargeDir * 2600 * dt;

        world.P.emit({
          x: e.x - d.chargeDir * 20, y: e.y + e.h * 0.35, count: 1,
          speed: 90, speedVar: 70, life: 0.45, lifeVar: 0.25, size: 14, sizeEnd: 30,
          color: [0.35, 0.3, 0.26, 0.4], color2: [0.15, 0.13, 0.12, 0], gravity: -30, drag: 2, fadeIn: 0.1,
        });

        if (!d.chargeHit) {
          const n = world.damageArea(e.x + d.chargeDir * 22, e.y, 26, 15, 'impact', {
            src: e, team: e.team === 1 ? 0 : 1, dirX: d.chargeDir, dirY: -0.35,
            force: 620, falloff: 0, stagger: 0.15, props: false,
          });
          if (n) { d.chargeHit = true; world.R.fx.shake(0.2, 0.2); world.R.fx.timeScale(0.15, 0.05); }
        }

        // it goes through what it can and stuns itself on what it cannot
        const p = propAhead(world, e, 20);
        if (p) {
          world.damageProp(p, 55, 'impact', { src: e, hitX: e.x + d.chargeDir * 26, hitY: e.y, dirX: d.chargeDir });
          impact(world, e, d);
        } else if (wallAhead(world, e, 16) > 30) {
          world.terrain.damage(e.x + d.chargeDir * 30, e.y, 26, 26, 'impact', {});
          impact(world, e, d);
        }
      },
      onEnd(world, e, d) { d.chargeDir = 0; },
    },
    bite: {
      wind: 0.38, active: 0.12, recover: 0.3, cooldown: 0.9,
      tell: TELL, sfx: 'hound_bite',
      fire(world, e, d) {
        const hx = e.x + e.faceX * 38;
        world.damageArea(hx, e.y, 26, 11, 'impact', {
          src: e, team: e.team === 1 ? 0 : 1, dirX: e.faceX, dirY: -0.2, force: 260, falloff: 0,
        });
      },
    },
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 8)) {
      d.target = findTarget(world, e, 900);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }
    const t = d.target;
    if (acting(d)) {
      if (d.act === 'charge' && d.phase === 0) { driveX(e, 0, 2000, dt); if (t) faceTo(e, t.x); }
      else if (d.act === 'bite' && d.phase < 2) driveX(e, 0, 1400, dt);
      else if (d.phase === 2) driveX(e, 0, 900, dt);
      return;
    }
    if (!t) { idleWander(world, e, d, dt, { speed: 45 }); return; }

    const dx = t.x - e.x, dy = t.y - e.y;
    const dist = Math.abs(dx);
    if (dist > 900 || Math.abs(dy) > 300) { idleWander(world, e, d, dt, { speed: 45 }); return; }

    if (dist < 46 && d.cd <= 0) { faceTo(e, t.x); startAction(e, d, 'bite'); return; }
    if (dist > 150 && dist < 640 && Math.abs(dy) < 90 && d.cd <= 0 && d.seesTarget) {
      faceTo(e, t.x); startAction(e, d, 'charge'); return;
    }
    d.state = 'move';
    walkToward(world, e, d, t.x, {
      speed: 130 * d.slowK, accel: 900, jump: 620, stopAt: 30, gapReach: 260, stepUp: 90,
    }, dt);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const sp = Math.abs(e.vx);
    d.anim += (sp * 0.055 + 1.6) * (1 / 60);
    const w = d.anim;
    const run = Math.min(1, sp / 130);
    const charging = d.act === 'charge' && d.phase === 1;

    rig.ang[T.spine] = -0.06 + Math.sin(w * 2) * 0.05 * run;
    rig.oy = -Math.abs(Math.sin(w * 2)) * 2.5 * run;

    const gait = charging ? 1.35 : 1;
    rig.ang[T.legFL] = 1.50 + Math.sin(w) * 0.75 * run * gait;
    rig.ang[T.legFR] = 1.6 + Math.sin(w + 0.5) * 0.75 * run * gait;
    rig.ang[T.legBL] = 1.55 + Math.sin(w + Math.PI) * 0.8 * run * gait;
    rig.ang[T.legBR] = 1.65 + Math.sin(w + Math.PI + 0.5) * 0.8 * run * gait;
    rig.ang[T.pawFL] = 0.05 - Math.min(0, Math.sin(w)) * 0.7 * run;
    rig.ang[T.pawFR] = -0.05 - Math.min(0, Math.sin(w + 0.5)) * 0.7 * run;
    rig.ang[T.pawBL] = -Math.min(0, Math.sin(w + Math.PI)) * 0.7 * run;
    rig.ang[T.pawBR] = -0.1 - Math.min(0, Math.sin(w + Math.PI + 0.5)) * 0.7 * run;

    rig.ang[T.tail] = -2.85 + Math.sin(w * 0.8 + 1) * 0.35;
    rig.ang[T.tail2] = -0.3 + Math.sin(w * 0.8) * 0.4;
    rig.ang[T.neck] = 0.20 + Math.sin(w * 2 + 0.4) * 0.07 * run;
    rig.ang[T.head] = 0.12 - Math.sin(w * 2) * 0.05 * run;
    rig.ang[T.jaw] = 0.18 + (charging ? 0.5 : Math.sin(t * 3) * 0.06);

    if (d.act === 'charge' && d.phase === 0) {
      // crouch: haunches drop, head lowers to the line of the charge, thorns flare
      const k = d.tellK * d.tellK;
      rig.oy += k * 6;
      rig.ang[T.spine] = -0.06 - 0.14 * k;
      rig.ang[T.neck] = 0.20 + 0.28 * k;
      rig.ang[T.head] = 0.12 - 0.22 * k;
      rig.ang[T.jaw] = 0.18 + 0.55 * k;
      rig.ang[T.legFL] = 1.50 + 0.5 * k; rig.ang[T.legFR] = 1.6 + 0.5 * k;
      rig.ang[T.legBL] = 1.55 - 0.35 * k; rig.ang[T.legBR] = 1.65 - 0.35 * k;
      rig.ang[T.tail] = -2.85 - 0.5 * k;
      for (let i = 1; i <= 5; i++) {
        const b = T['th' + i];
        rig.ang[b] = rig.tpl.rest[b] - 0.35 * k;
        rig.lenS[b] = 1 + 0.55 * k;
      }
    } else if (charging) {
      rig.ang[T.spine] = -0.16;
      rig.ang[T.neck] = 0.32; rig.ang[T.head] = -0.1;
      for (let i = 1; i <= 5; i++) rig.lenS[T['th' + i]] = 1.35;
    } else if (d.act === 'bite') {
      const k = d.phase === 0 ? d.tellK : 1 - Math.min(1, d.actT / 0.12);
      rig.ang[T.neck] = 0.20 - 0.35 * k;
      rig.ang[T.head] = 0.12 - 0.3 * k;
      rig.ang[T.jaw] = 0.18 + 0.85 * k;
    }

    if (d.hurtT > 0) rig.ang[T.spine] -= 0.2 * (d.hurtT / 0.3);
  },
});

/** Slamming into something it cannot break costs it the charge and a second of daze. */
function impact(world, e, d) {
  world.R.fx.shake(0.35, 0.3);
  world.R.fx.timeScale(0.1, 0.06);
  world.applyStatus(e, 'stun', 1.1);
  world.damage(e, 6, 'impact', { noFlash: false });
  e.vx = -d.chargeDir * 170;
  world.P.emit({
    x: e.x + d.chargeDir * 26, y: e.y, count: 16, vx: -d.chargeDir, vy: -0.3,
    speed: 320, speedVar: 250, vSpread: 1.2, life: 0.5, lifeVar: 0.3, size: 12, sizeEnd: 2,
    color: [0.6, 0.5, 0.42, 0.8], color2: [0.2, 0.16, 0.14, 0], gravity: 900, drag: 1.6,
  });
  world.ctx.audio.sfx('hound_slam', { x: e.x, y: e.y });
  d.act = null; d.phase = 0; d.tellK = 0; d.cd = 2.4;
}
