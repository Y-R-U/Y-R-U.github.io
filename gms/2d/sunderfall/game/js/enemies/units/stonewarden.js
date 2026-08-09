/**
 * stonewarden — the armoured one, and the reason cover is not a solution.
 *
 * Small hits ping off it. What gets through is heavy impact and acid. In exchange
 * it is slow, it telegraphs enormously, and it destroys the arena: it slams craters
 * into terrain, and anything solid in its way gets punched through rather than
 * walked around. A stonewarden coming through the wall you were hiding behind is
 * the single best advertisement for the destruction system in the game.
 *
 * Silhouette: shoulders wider than it is tall, no visible neck, fists like anvils.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { MATERIAL } from '../../sim/materials.js';
import {
  walkToward, findTarget, canSee, thinkNow, driveX, faceTo, idleWander, propAhead, wallAhead,
} from '../ai.js';

const STONE = [0.265, 0.262, 0.288];
const STONE2 = [0.228, 0.226, 0.252];
const MOSS = [0.175, 0.235, 0.165];
const TELL = [1.0, 0.52, 0.18];

export default defineEnemy({
  id: 'stonewarden',
  name: 'Stonewarden',
  role: 'armour',
  hp: 240, w: 68, h: 92,
  speed: 54, jump: 0, xp: 26,
  friction: 14, flammable: 0,
  ichor: [0.55, 0.53, 0.5],
  death: 'shatter', debrisMaterial: MATERIAL.ROCK, gibs: 12,
  material: MATERIAL.FLESH,
  // "ignores small hits": anything under 24 does literally nothing, and everything
  // that is not acid or a heavy impact is halved on top of that.
  armour: { min: 24, types: [2], mul: 0.5 },
  lightCol: [1, 0.45, 0.15], lightR: 150, lightI: 0.18, lightY: 0.1,

  parts: [
    { n: 'pelvis', ax: 0, ay: 12, len: 0, w: 36, h: 22, sh: 'disc', col: STONE2 },
    { n: 'thighL', p: 'pelvis', ax: -10, ay: 6, len: 16, w: 20, sh: 'bar', col: STONE2, rest: 1.5 },
    { n: 'shinL', p: 'thighL', ax: 15, ay: 0, len: 15, w: 18, sh: 'bar', col: STONE2, rest: 0.1, rel: 1 },
    { n: 'footL', p: 'shinL', ax: 13, ay: 0, len: 22, w: 11, sh: 'bar', col: STONE2, rest: -1.5, rel: 1 },
    { n: 'thighR', p: 'pelvis', ax: 10, ay: 6, len: 16, w: 21, sh: 'bar', col: STONE, rest: 1.62 },
    { n: 'shinR', p: 'thighR', ax: 15, ay: 0, len: 15, w: 19, sh: 'bar', col: STONE, rest: -0.1, rel: 1 },
    { n: 'footR', p: 'shinR', ax: 13, ay: 0, len: 23, w: 12, sh: 'bar', col: STONE, rest: -1.5, rel: 1 },

    { n: 'torso', p: 'pelvis', ax: 0, ay: -8, len: 32, w: 40, sh: 'disc', col: STONE, rest: -1.52 },
    { n: 'chest', p: 'torso', ax: 24, ay: 0, len: 0, w: 60, h: 30, sh: 'disc', col: STONE },
    { n: 'moss', p: 'torso', ax: 30, ay: -10, len: 0, w: 38, h: 10, sh: 'disc', col: MOSS },
    // head sunk between the shoulders — barely there, which is the point
    { n: 'head', p: 'torso', ax: 33, ay: 0, len: 0, w: 16, h: 14, sh: 'disc', col: STONE2 },
    { n: 'eyeL', p: 'head', ax: 3, ay: -1, len: 0, w: 6, h: 4, sh: 'disc', col: [1, 0.5, 0.18], add: true, glow: 0.22, tell: 1, gib: 0 },

    { n: 'shldL', p: 'torso', ax: 26, ay: -28, len: 0, w: 30, h: 28, sh: 'disc', col: STONE2 },
    { n: 'armL', p: 'shldL', ax: 0, ay: 9, len: 21, w: 15, sh: 'bar', col: STONE2, rest: 1.4 },
    { n: 'foreL', p: 'armL', ax: 20, ay: 0, len: 21, w: 17, sh: 'bar', col: STONE2, rest: 0.15, rel: 1 },
    { n: 'fistL', p: 'foreL', ax: 20, ay: 0, len: 0, w: 25, h: 24, sh: 'disc', col: STONE2, tell: 0.5 },

    { n: 'shldR', p: 'torso', ax: 26, ay: 28, len: 0, w: 34, h: 31, sh: 'disc', col: STONE },
    { n: 'armR', p: 'shldR', ax: 0, ay: 9, len: 22, w: 16, sh: 'bar', col: STONE, rest: 1.5 },
    { n: 'foreR', p: 'armR', ax: 21, ay: 0, len: 22, w: 19, sh: 'bar', col: STONE, rest: 0.15, rel: 1 },
    { n: 'fistR', p: 'foreR', ax: 21, ay: 0, len: 0, w: 28, h: 27, sh: 'disc', col: STONE, tell: 0.5 },

    // molten seams between the plates: near-dead at rest, furnace-bright on the wind-up
    { n: 'seam1', p: 'torso', ax: 16, ay: 0, len: 20, w: 3.5, sh: 'bar', col: [0.26, 0.10, 0.04], rest: 1.57, tell: 1, glow: 0.10, gib: 0 },
    { n: 'seam2', p: 'torso', ax: 28, ay: -16, len: 14, w: 3, sh: 'bar', col: [0.26, 0.10, 0.04], rest: 2.5, tell: 1, glow: 0.10, gib: 0 },
    { n: 'seam3', p: 'pelvis', ax: 0, ay: -3, len: 22, w: 3, sh: 'bar', col: [0.26, 0.10, 0.04], rest: 0, tell: 1, glow: 0.08, gib: 0 },
  ],

  actions: {
    slam: {
      wind: 0.72, active: 0.16, recover: 0.62, cooldown: 2.4,
      tell: TELL, sfx: 'warden_slam',
      onWind(world, e, d, k) {
        if (k > 0.55 && Math.random() < 0.5) {
          world.P.emit({
            x: e.x + e.faceX * 26, y: e.y - 46, count: 1, speed: 60, speedVar: 50,
            life: 0.5, lifeVar: 0.3, size: 10, sizeEnd: 1,
            color: [1, 0.6, 0.2, 0.9], color2: [0.5, 0.08, 0.02, 0], gravity: -180, add: true, glow: 0.3,
          });
        }
      },
      fire(world, e, d) {
        const hx = e.x + e.faceX * 36;
        const hy = e.y + e.h * 0.42;
        world.damageArea(hx, hy, 132, 30, 'impact', {
          src: e, hitX: hx, hitY: hy, dirX: 0, dirY: -1, force: 820, falloff: 1,
          terrain: true, terrainScale: 0.52, props: true, stagger: 0.25,
        });
        world.R.fx.shake(0.6, 0.5);
        world.R.fx.timeScale(0.08, 0.07);
        world.R.fx.shockwave(hx, hy, 0.85);
        world.P.emit({
          x: hx, y: hy, count: 30, vx: 0, vy: -1, speed: 420, speedVar: 320, vSpread: 1.4,
          life: 0.7, lifeVar: 0.4, size: 16, sizeEnd: 3,
          color: [0.6, 0.55, 0.5, 0.9], color2: [0.2, 0.18, 0.18, 0], gravity: 1000, drag: 1.3, collide: true,
        });
        world.P.emit({
          x: hx, y: hy, count: 18, speed: 240, speedVar: 200, life: 1.5, lifeVar: 0.8,
          size: 40, sizeEnd: 140, color: [0.55, 0.52, 0.48, 0.5], color2: [0.15, 0.15, 0.18, 0],
          gravity: -60, drag: 1.9, fadeIn: 0.1,
        });
      },
    },
    smash: {
      wind: 0.55, active: 0.14, recover: 0.42, cooldown: 0.9,
      tell: TELL, sfx: 'warden_smash',
      fire(world, e, d) {
        const hx = e.x + e.faceX * 52;
        const hy = e.y - 4;
        // punch a hole rather than pathing around: the wall is the obstacle AND the answer
        const p = propAhead(world, e, 26);
        if (p) world.damageProp(p, 90, 'impact', { src: e, hitX: hx, hitY: hy, dirX: e.faceX });
        world.terrain.damage(hx, hy, 46, 60, 'impact', {});
        world.terrain.damage(hx, hy + 30, 40, 60, 'impact', {});
        world.damageArea(hx, hy, 54, 22, 'impact', {
          src: e, team: e.team === 1 ? 0 : 1, dirX: e.faceX, dirY: -0.3, force: 560, falloff: 0, props: false,
        });
        world.R.fx.shake(0.35, 0.35);
        world.ctx.audio.sfx('stone_break', { x: hx, y: hy });
      },
      onEnd(world, e, d) { d.wantSmash = false; },
    },
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 12)) {
      d.target = findTarget(world, e, 900);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }
    const t = d.target;
    if (acting(d)) { if (d.phase < 2) driveX(e, 0, 700, dt); if (t && d.phase === 0 && d.act === 'slam') faceTo(e, t.x); return; }
    if (!t) { d.wantSmash = false; idleWander(world, e, d, dt, { speed: 22 }); return; }

    const dx = t.x - e.x;
    const dist = Math.abs(dx);
    if (dist > 900) { idleWander(world, e, d, dt, { speed: 22 }); return; }

    if (dist < 108 && Math.abs(t.y - e.y) < 90 && d.cd <= 0) {
      faceTo(e, t.x); startAction(e, d, 'slam'); return;
    }

    // blocked? Then the wall is the target. It never turns around for terrain.
    faceTo(e, t.x);
    if (d.cd <= 0 && (d.wantSmash || propAhead(world, e, 24) || wallAhead(world, e, 18) > 40)) {
      startAction(e, d, 'smash'); return;
    }

    d.state = 'move';
    walkToward(world, e, d, t.x, {
      speed: 54 * d.slowK, accel: 240, jump: 0, stopAt: 66, gapReach: 0,
      smash: true, ledgeStop: true, avoidHazard: false,
    }, dt);
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const sp = Math.abs(e.vx);
    d.anim += (sp * 0.07 + 0.7) * (1 / 60);
    const w = d.anim;
    const walk = Math.min(1, sp / 50);

    rig.oy = -Math.abs(Math.sin(w)) * 3.2 * walk;
    rig.ang[T.pelvis] = Math.sin(w) * 0.05 * walk;
    rig.ang[T.thighL] = 1.5 + Math.sin(w) * 0.4 * walk;
    rig.ang[T.shinL] = 0.1 - Math.min(0, Math.sin(w)) * 0.5 * walk;
    rig.ang[T.thighR] = 1.62 + Math.sin(w + Math.PI) * 0.4 * walk;
    rig.ang[T.shinR] = -0.1 - Math.min(0, Math.sin(w + Math.PI)) * 0.5 * walk;
    rig.ang[T.footL] = -1.5 - Math.sin(w) * 0.15 * walk;
    rig.ang[T.footR] = -1.5 - Math.sin(w + Math.PI) * 0.15 * walk;

    rig.ang[T.torso] = -1.52 + Math.sin(w * 2) * 0.03 * walk + Math.sin(t * 1.1) * 0.02;
    rig.ang[T.head] = Math.sin(t * 0.9) * 0.05;

    let lA = 1.4 + Math.sin(w + Math.PI) * 0.22 * walk;
    let rA = 1.5 + Math.sin(w) * 0.22 * walk;
    let lF = 0.15, rF = 0.15;

    if (d.act === 'slam') {
      if (d.phase === 0) {
        // both fists go straight overhead and HOLD there — the longest, clearest
        // wind-up in the game, because the payoff is the biggest
        const k = Math.pow(d.tellK, 0.7);
        lA = 1.4 - 3.05 * k; rA = 1.5 - 3.18 * k;
        lF = 0.15 - 0.5 * k; rF = 0.15 - 0.5 * k;
        rig.ang[T.torso] = -1.52 - 0.18 * k;
        rig.oy -= 4 * k;
        const shiver = Math.sin(t * 40) * 0.03 * k;
        lA += shiver; rA -= shiver;
      } else {
        const k = Math.min(1, d.actT / (d.phase === 1 ? 0.08 : 0.5));
        lA = -1.65 + 3.35 * k; rA = -1.68 + 3.4 * k;
        lF = -0.35 + 0.5 * k; rF = -0.35 + 0.5 * k;
        rig.ang[T.torso] = -1.52 + 0.3 * k;
        rig.oy += 5 * k;
      }
    } else if (d.act === 'smash') {
      if (d.phase === 0) {
        const k = d.tellK * d.tellK;
        rA = 1.5 - 2.25 * k; rF = 0.15 - 1.15 * k;
        rig.ang[T.torso] = -1.52 - 0.22 * k;
      } else {
        const k = Math.min(1, d.actT / 0.07);
        rA = -0.75 + 0.8 * k; rF = -1.0 + 1.1 * k;
        rig.ang[T.torso] = -1.52 + 0.25 * k;
      }
    }

    rig.ang[T.armL] = lA; rig.ang[T.foreL] = lF;
    rig.ang[T.armR] = rA; rig.ang[T.foreR] = rF;

    // seams brighten and widen with the tell
    const seamK = 1 + d.tellK * 1.6;
    rig.widS[T.seam1] = seamK; rig.widS[T.seam2] = seamK; rig.widS[T.seam3] = seamK;

    if (d.hurtT > 0) rig.ang[T.torso] -= 0.1 * (d.hurtT / 0.3);
  },

  onDeathHook(world, e, d) {
    // it collapses into a small rockfall, and the ground it lands on takes it
    world.terrain.damage(e.x, e.y + e.h * 0.45, 40, 30, 'impact', {});
    world.burstDebris(e.x, e.y, MATERIAL.ROCK, 10, { speed: 300, speedVar: 240 });
    world.R.fx.shake(0.45, 0.6);
    return true;
  },
});
