/**
 * wispmaw — the flyer. Drifts above you and drops burning globs, so the ground
 * under your feet stops being safe. The fire it leaves outlives it, which is the
 * whole "the world remembers" thesis in one fodder enemy.
 *
 * Silhouette: a lantern-headed anglerfish — huge hinged jaw, tiny body, four long
 * trailing tendrils. Nothing else in the roster trails anything.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { findTarget, canSee, thinkNow, flyToward, faceTo } from '../ai.js';
import { spawnGlob } from '../projectiles.js';
import { wobbleChain } from '../rig.js';

const SKIN = [0.275, 0.225, 0.245];
const SKIN2 = [0.190, 0.155, 0.180];
const TEETH = [0.50, 0.47, 0.42];
const TELL = [1.0, 0.55, 0.18];

const TENDRILS = [
  ['t1a', 't1b', 't1c'], ['t2a', 't2b', 't2c'], ['t3a', 't3b', 't3c'], ['t4a', 't4b', 't4c'],
];

export default defineEnemy({
  id: 'wispmaw',
  name: 'Wispmaw',
  role: 'flyer',
  hp: 34, w: 48, h: 42,
  speed: 128, jump: 0, xp: 11,
  gravity: 0, drag: 1.4, collides: true, friction: 0,
  ichor: [0.75, 0.35, 0.16],
  death: 'splat', gibs: 9,
  deathGlow: [1, 0.6, 0.25],
  lightCol: [1, 0.62, 0.32], lightR: 260, lightI: 0.55, lightY: 0, lightFlicker: 0.3,

  parts: [
    { n: 'body', ax: 0, ay: 0, len: 0, w: 40, h: 32, sh: 'disc', col: SKIN },
    { n: 'back', p: 'body', ax: -12, ay: -4, len: 0, w: 26, h: 22, sh: 'disc', col: SKIN2 },

    // the maw: an upper plate and a long hinged lower jaw that opens on the tell
    { n: 'upper', p: 'body', ax: 10, ay: -6, len: 26, w: 15, sh: 'disc', col: SKIN, rest: 0.05 },
    { n: 'lower', p: 'body', ax: 8, ay: 4, len: 27, w: 12, sh: 'disc', col: SKIN2, rest: 0.12 },
    { n: 'fangU1', p: 'upper', ax: 9, ay: 5, len: 8, w: 4.5, sh: 'bar', col: TEETH, rest: 1.5 , rel: 1 },
    { n: 'fangU2', p: 'upper', ax: 19, ay: 4, len: 10, w: 5, sh: 'bar', col: TEETH, rest: 1.45 , rel: 1 },
    { n: 'fangL1', p: 'lower', ax: 10, ay: -4, len: 8, w: 4.5, sh: 'bar', col: TEETH, rest: -1.5 , rel: 1 },
    { n: 'fangL2', p: 'lower', ax: 20, ay: -3, len: 10, w: 5, sh: 'bar', col: TEETH, rest: -1.45 , rel: 1 },

    { n: 'gullet', p: 'body', ax: 13, ay: 0, len: 0, w: 13, h: 11, sh: 'blob', col: [0.9, 0.4, 0.12], add: true, glow: 0.22, tell: 1, gib: 0 },
    { n: 'eye', p: 'body', ax: -2, ay: -9, len: 0, w: 7, h: 6, sh: 'disc', col: [1, 0.85, 0.5], add: true, glow: 0.10, gib: 0 },

    { n: 't1a', p: 'body', ax: -14, ay: 6, len: 15, w: 4.5, sh: 'bar', col: SKIN2, rest: 1.2 },
    { n: 't1b', p: 't1a', ax: 14, ay: 0, len: 14, w: 3.5, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't1c', p: 't1b', ax: 13, ay: 0, len: 12, w: 2.6, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't2a', p: 'body', ax: -8, ay: 9, len: 17, w: 4.5, sh: 'bar', col: SKIN2, rest: 1.4 },
    { n: 't2b', p: 't2a', ax: 16, ay: 0, len: 15, w: 3.5, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't2c', p: 't2b', ax: 14, ay: 0, len: 13, w: 2.6, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't3a', p: 'body', ax: 0, ay: 10, len: 16, w: 4, sh: 'bar', col: SKIN2, rest: 1.55 },
    { n: 't3b', p: 't3a', ax: 15, ay: 0, len: 14, w: 3.2, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't3c', p: 't3b', ax: 13, ay: 0, len: 12, w: 2.4, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't4a', p: 'body', ax: 8, ay: 9, len: 14, w: 3.8, sh: 'bar', col: SKIN2, rest: 1.7 },
    { n: 't4b', p: 't4a', ax: 13, ay: 0, len: 12, w: 3, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
    { n: 't4c', p: 't4b', ax: 11, ay: 0, len: 10, w: 2.2, sh: 'bar', col: SKIN2, rest: 0.2 , rel: 1 },
  ],

  actions: {
    drop: {
      wind: 0.44, active: 0.12, recover: 0.4, cooldown: 2.1,
      tell: TELL, sfx: 'wisp_drop',
      onWind(world, e, d, k) {
        if (Math.random() < 0.5) {
          world.P.emit({
            x: e.x + e.faceX * 14, y: e.y + 4, count: 1, speed: 40, speedVar: 30,
            life: 0.4, lifeVar: 0.2, size: 9 + 8 * k, sizeEnd: 1,
            color: [1, 0.65, 0.25, 0.9], color2: [0.7, 0.15, 0.03, 0], gravity: -100, add: true, glow: 0.25,
          });
        }
      },
      fire(world, e, d) {
        const t = d.target;
        // lead the target so the glob lands where they are going, not where they were
        let vx = e.faceX * 40;
        if (t) {
          const fall = Math.max(0.25, Math.sqrt(Math.max(0, (t.y - e.y)) * 2 / 2550));
          vx = ((t.x + t.vx * fall * 0.6) - e.x) / fall;
          vx = Math.max(-260, Math.min(260, vx));
        }
        spawnGlob(world, e, e.x + e.faceX * 16, e.y + 12, vx, 90, { damage: 10, radius: 54, burn: 1.1 });
        e.vy -= 120;
        world.R.fx.shake(0.06, 0.12);
      },
    },
  },

  onSpawn(world, e, d) {
    d.drift = Math.random() * 6.283;
    d.hover = 150 + Math.random() * 60;
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 10)) {
      d.target = findTarget(world, e, 950);
      d.seesTarget = d.target ? canSee(world, e, d.target) : false;
    }
    const t = d.target;
    d.drift += dt;

    if (!t) {
      const wx = e.x + Math.cos(d.drift * 0.4) * 220;
      const wy = e.y - 20 + Math.sin(d.drift * 0.7) * 60;
      flyToward(world, e, d, wx, wy, { speed: 55, accel: 130 }, dt);
      d.state = 'idle';
      return;
    }

    faceTo(e, t.x);
    // hover above and slightly ahead, weaving so it is never a static target
    const lead = Math.sign(t.vx || e.faceX) * Math.min(70, Math.abs(t.vx) * 0.25);
    const wantX = t.x + lead + Math.sin(d.drift * 1.3) * 70;
    const wantY = t.y - d.hover + Math.sin(d.drift * 0.9) * 34;

    if (acting(d) && d.phase < 2) {
      flyToward(world, e, d, wantX, e.y, { speed: 40, accel: 260 }, dt);
      return;
    }

    flyToward(world, e, d, wantX, wantY, { speed: 128 * d.slowK, accel: 300, slowIn: 120 }, dt);
    d.state = 'move';

    if (d.cd <= 0 && Math.abs(t.x - e.x) < 150 && t.y > e.y + 60 && d.seesTarget) {
      startAction(e, d, 'drop');
    }
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    d.anim += (1 / 60);
    const bob = Math.sin(t * 2.4 + d.drift) * 4;
    rig.oy = bob;
    rig.ang[T.body] = e.vx * 0.0006 + Math.sin(t * 1.7) * 0.05;

    for (let i = 0; i < TENDRILS.length; i++) {
      wobbleChain(rig, TENDRILS[i], t, 0.26, 2.6 - i * 0.25, i * 1.1 - e.vx * 0.002, 0.55);
    }

    let open = 0.12 + Math.sin(t * 1.4) * 0.05;
    if (d.act === 'drop') {
      open = d.phase === 0 ? 0.12 + d.tellK * 0.95 : 1.07 - Math.min(1, d.actT / 0.25) * 0.9;
      rig.widS[T.gullet] = 1 + d.tellK * 1.3;
      rig.lenS[T.gullet] = 1 + d.tellK * 0.6;
    }
    rig.ang[T.lower] = open;
    rig.ang[T.upper] = 0.05 - open * 0.22;

    if (d.hurtT > 0) {
      const k = d.hurtT / 0.3;
      rig.ang[T.body] += 0.35 * k * (d.recoil > 0 ? 1 : -1);
    }
  },
});
