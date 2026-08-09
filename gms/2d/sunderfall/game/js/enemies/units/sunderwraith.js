/**
 * sunderwraith — elite. It goes through the level, so cover is not an answer to it.
 *
 * Rules that keep that from being cheap: while it is inside solid ground it is
 * translucent, cannot attack, and takes half damage — so phasing is travel, not
 * safety. It must come out, and coming out is a 0.45s solidify with a hard colour
 * flip from cold blue to hot violet before the strike lands.
 *
 * Silhouette: legless — a tall torso tapering into a ribbon, arms far too long,
 * a single horizontal slit where a face should be.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { findTarget, thinkNow, faceTo } from '../ai.js';
import { wobbleChain } from '../rig.js';
import { spawnSpellShard } from '../pickups.js';

const VOID = [0.170, 0.140, 0.235];
const VOID2 = [0.115, 0.092, 0.170];
const EDGE = [0.215, 0.170, 0.320];
const TELL = [0.85, 0.35, 1.0];

const RIBBON = ['tail1', 'tail2', 'tail3', 'tail4'];
const CLOAK_L = ['clkL1', 'clkL2', 'clkL3'];
const CLOAK_R = ['clkR1', 'clkR2', 'clkR3'];

export default defineEnemy({
  id: 'sunderwraith',
  name: 'Sunderwraith',
  role: 'elite',
  elite: true,
  hp: 130, w: 40, h: 88,
  speed: 168, jump: 0, xp: 48,
  gravity: 0, drag: 1.8, collides: false, friction: 0, flammable: 0,
  ichor: [0.62, 0.35, 1.0],
  death: 'dissolve', gibs: 9,
  deathGlow: [0.7, 0.4, 1],
  lightCol: [0.45, 0.35, 0.9], lightR: 260, lightI: 0.35, lightY: 0.25, lightFlicker: 0.18,

  parts: [
    { n: 'torso', ax: 0, ay: -2, len: 34, w: 34, sh: 'disc', col: VOID, rest: -1.57 },
    { n: 'tail1', p: 'torso', ax: -2, ay: 0, len: 15, w: 26, sh: 'disc', col: VOID, rest: 1.57 },
    { n: 'tail2', p: 'tail1', ax: 14, ay: 0, len: 13, w: 18, sh: 'disc', col: VOID2, rest: 0 , rel: 1 },
    { n: 'tail3', p: 'tail2', ax: 12, ay: 0, len: 11, w: 12, sh: 'disc', col: VOID2, rest: 0 , rel: 1 },
    { n: 'tail4', p: 'tail3', ax: 10, ay: 0, len: 10, w: 7, sh: 'disc', col: VOID2, rest: 0 , rel: 1 },

    { n: 'clkL1', p: 'torso', ax: 8, ay: -13, len: 20, w: 13, sh: 'disc', col: VOID2, rest: 1.9 },
    { n: 'clkL2', p: 'clkL1', ax: 18, ay: 0, len: 18, w: 10, sh: 'disc', col: VOID2, rest: 0.2 , rel: 1 },
    { n: 'clkL3', p: 'clkL2', ax: 16, ay: 0, len: 15, w: 6, sh: 'disc', col: VOID2, rest: 0.2 , rel: 1 },
    { n: 'clkR1', p: 'torso', ax: 8, ay: 13, len: 20, w: 13, sh: 'disc', col: VOID2, rest: 1.3 },
    { n: 'clkR2', p: 'clkR1', ax: 18, ay: 0, len: 18, w: 10, sh: 'disc', col: VOID2, rest: -0.2 , rel: 1 },
    { n: 'clkR3', p: 'clkR2', ax: 16, ay: 0, len: 15, w: 6, sh: 'disc', col: VOID2, rest: -0.2 , rel: 1 },

    { n: 'shoulders', p: 'torso', ax: 30, ay: 0, len: 0, w: 34, h: 14, sh: 'disc', col: VOID },
    { n: 'head', p: 'torso', ax: 38, ay: 0, len: 0, w: 20, h: 22, sh: 'disc', col: VOID2 },
    { n: 'slit', p: 'head', ax: 2, ay: -1, len: 15, w: 4, sh: 'bar', col: [0.75, 0.55, 1], add: true, glow: 0.3, tell: 1, gib: 0 },
    { n: 'crown', p: 'head', ax: -2, ay: 0, len: 16, w: 13, sh: 'disc', col: VOID2, rest: -1.9 },

    { n: 'armL', p: 'shoulders', ax: -2, ay: -14, len: 26, w: 7, sh: 'bar', col: EDGE, rest: 1.5 },
    { n: 'foreL', p: 'armL', ax: 25, ay: 0, len: 26, w: 6, sh: 'bar', col: EDGE, rest: 0.25 , rel: 1 },
    { n: 'clawL1', p: 'foreL', ax: 25, ay: -3, len: 13, w: 3.2, sh: 'bar', col: [0.55, 0.42, 0.8], rest: 0.1, tell: 1 , rel: 1 },
    { n: 'clawL2', p: 'foreL', ax: 25, ay: 1, len: 15, w: 3.2, sh: 'bar', col: [0.55, 0.42, 0.8], rest: 0.3, tell: 1 , rel: 1 },
    { n: 'armR', p: 'shoulders', ax: -2, ay: 14, len: 27, w: 7.5, sh: 'bar', col: EDGE, rest: 1.6 },
    { n: 'foreR', p: 'armR', ax: 26, ay: 0, len: 27, w: 6.5, sh: 'bar', col: EDGE, rest: 0.3 , rel: 1 },
    { n: 'clawR1', p: 'foreR', ax: 26, ay: -3, len: 14, w: 3.4, sh: 'bar', col: [0.6, 0.45, 0.85], rest: 0.1, tell: 1 , rel: 1 },
    { n: 'clawR2', p: 'foreR', ax: 26, ay: 2, len: 16, w: 3.4, sh: 'bar', col: [0.6, 0.45, 0.85], rest: 0.32, tell: 1 , rel: 1 },
  ],

  actions: {
    rend: {
      wind: 0.45, active: 0.16, recover: 0.5, cooldown: 1.9,
      tell: TELL, sfx: 'wraith_rend',
      onStart(world, e, d) { d.solid = 1; },
      fire(world, e, d) {
        const hx = e.x + e.faceX * 52;
        world.damageArea(hx, e.y - 4, 62, 19, 'void', {
          src: e, team: e.team === 1 ? 0 : 1, hitX: hx, hitY: e.y,
          dirX: e.faceX, dirY: -0.2, force: 420, falloff: 0.5, stagger: 0.12, props: true,
        });
        // it rips the air itself: a scar in the terrain even where it missed
        world.terrain.scorch(hx, e.y, 44, 1.2);
        world.P.emit({
          x: hx, y: e.y - 4, count: 20, vx: e.faceX, vy: -0.2, speed: 460, speedVar: 280, vSpread: 0.9,
          life: 0.32, lifeVar: 0.18, size: 13, sizeEnd: 1,
          color: [0.9, 0.6, 1, 1], color2: [0.15, 0.02, 0.3, 0], add: true, drag: 3.2, stretch: 2.4,
        });
        world.R.fx.chroma(0.5, 0.22);
        world.R.fx.shake(0.16, 0.2);
      },
      onEnd(world, e, d) { d.solid = 0; },
    },
  },

  onSpawn(world, e, d) {
    d.phased = 0; d.solid = 0; d.drift = Math.random() * 6.28; d.scar = 0;
  },

  onDamageHook(world, e, d, amount) {
    // half damage while it is inside the world — phasing costs the player, not nothing
    return d.phased ? amount * 0.5 : amount;
  },

  think(world, e, d, dt) {
    if (thinkNow(world, e, 8)) d.target = findTarget(world, e, 1200);
    const t = d.target;
    d.drift += dt;
    d.phased = world.solidAt(e.x, e.y) || world.solidAt(e.x, e.y - e.h * 0.3) ? 1 : 0;
    d.alpha = d.spawnT * (d.phased ? 0.34 : (d.act ? 1 : 0.82));

    if (d.phased) {
      d.scar -= dt;
      if (d.scar <= 0) {
        d.scar = 0.09;
        world.terrain.scorch(e.x, e.y, 22, 0.7);
        world.P.emit({
          x: e.x, y: e.y + (Math.random() - 0.5) * e.h, count: 2, speed: 40, speedVar: 40,
          life: 0.7, lifeVar: 0.4, size: 12, sizeEnd: 1,
          color: [0.5, 0.3, 0.85, 0.7], color2: [0.05, 0.02, 0.15, 0], add: true, drag: 1.6,
        });
      }
    }

    if (acting(d)) {
      if (d.phase === 0) { e.vx *= Math.exp(-dt * 4); e.vy *= Math.exp(-dt * 4); if (t) faceTo(e, t.x); }
      else if (d.phase === 1) { e.vx = e.faceX * 340; e.vy *= 0.6; }
      return;
    }

    if (!t) {
      e.vx += Math.cos(d.drift * 0.5) * 40 * dt;
      e.vy += Math.sin(d.drift * 0.8) * 30 * dt;
      d.state = 'idle';
      return;
    }

    const dx = t.x - e.x, dy = (t.y - t.h * 0.15) - e.y;
    const dist = Math.hypot(dx, dy);
    faceTo(e, t.x);

    if (dist < 92 && !d.phased && d.cd <= 0) { startAction(e, d, 'rend'); return; }

    // straight line, through anything. It will not path around; that is the point.
    const l = dist || 1;
    const want = dist < 70 ? -0.5 : 1;
    const speed = 168 * d.slowK * (d.phased ? 1.25 : 1);
    e.vx += (dx / l) * want * speed * 3.4 * dt;
    e.vy += ((dy / l) * want * speed - 30) * 3.0 * dt;
    const sp = Math.hypot(e.vx, e.vy);
    if (sp > speed) { e.vx *= speed / sp; e.vy *= speed / sp; }
    d.state = 'move';
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    d.anim += (1 / 60);
    const sway = Math.sin(t * 1.6 + d.drift) * 0.07;
    rig.oy = Math.sin(t * 1.9) * 5;
    rig.ang[T.torso] = -1.57 + sway - e.vx * 0.0007;

    wobbleChain(rig, RIBBON, t, 0.24, 2.1, -e.vx * 0.004, 0.7);
    rig.ang[T.tail1] = 1.57 + Math.sin(t * 2.1) * 0.12;
    wobbleChain(rig, CLOAK_L, t, 0.2, 1.9, 1.2, 0.6);
    wobbleChain(rig, CLOAK_R, t, 0.2, 1.7, 2.4, 0.6);
    rig.ang[T.clkL1] = 1.9 + Math.sin(t * 1.9) * 0.12 - e.vx * 0.001;
    rig.ang[T.clkR1] = 1.3 + Math.sin(t * 1.7 + 1) * 0.12 - e.vx * 0.001;

    let aL = 1.5 + Math.sin(t * 1.3) * 0.1;
    let aR = 1.6 + Math.sin(t * 1.5 + 1) * 0.1;
    let fL = 0.25, fR = 0.3;

    if (d.act === 'rend') {
      if (d.phase === 0) {
        // both arms sweep back and wide, claws splayed — a scissor about to close
        const k = Math.pow(d.tellK, 0.8);
        aL = 1.5 - 3.9 * k; aR = 1.6 - 4.1 * k;
        fL = 0.25 + 1.2 * k; fR = 0.3 + 1.3 * k;
        rig.ang[T.torso] = -1.57 - 0.24 * k;
        rig.lenS[T.clawL2] = 1 + k * 0.5; rig.lenS[T.clawR2] = 1 + k * 0.5;
      } else {
        const k = Math.min(1, d.actT / 0.09);
        aL = -2.4 + 3.9 * k; aR = -2.5 + 4.1 * k;
        fL = 1.45 - 1.3 * k; fR = 1.6 - 1.4 * k;
        rig.ang[T.torso] = -1.57 + 0.3 * k;
      }
    }
    rig.ang[T.armL] = aL; rig.ang[T.foreL] = fL;
    rig.ang[T.armR] = aR; rig.ang[T.foreR] = fR;

    // colour flip: cold and washed out while phased, hot violet on the strike
    if (d.phased) { d.tint = COLD; } else if (d.act) { d.tint = HOT; } else { d.tint = null; }

    rig.widS[T.slit] = 1 + d.tellK * 2.4;
    rig.lenS[T.slit] = 1 + d.tellK * 0.5;

    if (d.hurtT > 0) rig.ang[T.torso] += 0.22 * (d.hurtT / 0.3) * -Math.sign(d.recoil || 1);
  },

  onDeathHook(world, e, d) {
    spawnSpellShard(world, e.x, e.y - 10, { value: 1 });
    world.R.fx.flash(0.55, 0.35, 1, 0.16, 0.16);
    world.R.fx.chroma(0.9, 0.4);
    return true;
  },
});

const COLD = [0.62, 0.78, 1.15];
const HOT = [1.25, 0.72, 1.3];
