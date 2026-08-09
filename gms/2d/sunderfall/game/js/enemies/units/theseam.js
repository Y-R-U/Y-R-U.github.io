/**
 * theseam — the boss. The tear the Darkness comes through.
 *
 * Four phases, each one louder than the last, and the signature: the arena does not
 * survive the fight. Every phase change pulls the support out from under a share of
 * the Glyphglade's stonework via `world.collapse`, so the cascade comes down as a
 * chain rather than a frame. By phase four you are fighting on the rubble of the
 * place you started in, which is the last image the game leaves a player with.
 *
 * Silhouette: a vertical wound in the air with arms coming out of it. Nothing else
 * in the game is a vertical negative shape, so it reads instantly.
 */

import { defineEnemy, startAction, acting } from '../base.js';
import { LAYER } from '../../gfx/renderer.js';
import { silhouette, drawRig, beginPaint } from '../rig.js';
import { spawnEnemyById } from '../registry.js';
import { spawnTrackingBolt } from '../projectiles.js';

const DARK = [0.045, 0.035, 0.075];
const LIMB = [0.075, 0.055, 0.115];
const EDGE = [0.55, 0.35, 0.95];
const TELL = [1.0, 0.45, 0.85];

const ARMS = ['a', 'b', 'c', 'd'];
const SEGS = 5;

/* one arm = five tapering bars; four of them, plus a two-piece maw */
const parts = [
  { n: 'root', ax: 0, ay: 0, len: 0, w: 8, h: 8, sh: 'disc', col: DARK, a: 0, gib: 0 },
];
for (let i = 0; i < ARMS.length; i++) {
  const A = ARMS[i];
  for (let s = 0; s < SEGS; s++) {
    parts.push({
      n: `${A}${s}`,
      p: s === 0 ? 'root' : `${A}${s - 1}`,
      ax: s === 0 ? 0 : 46 - s * 6,
      ay: s === 0 ? (i - 1.5) * 34 : 0,
      len: 46 - s * 6,
      w: 30 - s * 4.4,
      sh: 'disc',
      col: s > 3 ? [0.16, 0.10, 0.24] : LIMB,
      rest: 0,
      rel: s > 0 ? 1 : 0,
      tell: s > 3 ? 0.8 : 0.2,
    });
  }
}
parts.push(
  { n: 'mawU', p: 'root', ax: 0, ay: -30, len: 120, w: 44, sh: 'disc', col: DARK, rest: -0.25, tell: 0.3 },
  { n: 'mawL', p: 'root', ax: 0, ay: 30, len: 120, w: 44, sh: 'disc', col: DARK, rest: 0.25, tell: 0.3 },
  { n: 'tongue', p: 'root', ax: 0, ay: 0, len: 90, w: 18, sh: 'blob', col: [0.6, 0.15, 0.45], add: true, glow: 0.6, tell: 1, gib: 0 },
);

const PHASES = [
  { id: 1, name: 'widening', at: 1.00, tempo: 2.6 },
  { id: 2, name: 'grasping', at: 0.72, tempo: 2.1 },
  { id: 3, name: 'collapse', at: 0.44, tempo: 1.7 },
  { id: 4, name: 'unmaking', at: 0.16, tempo: 1.2 },
];

export default defineEnemy({
  id: 'theseam',
  name: 'The Seam',
  role: 'boss',
  boss: true, elite: true,
  hp: 2600, w: 150, h: 330,
  speed: 0, jump: 0, xp: 900,
  gravity: 0, drag: 3, collides: false, friction: 0, flammable: 0,
  ichor: [0.7, 0.35, 1.0],
  death: 'dissolve', gibs: 14,
  deathGlow: [0.85, 0.5, 1],
  parts,

  actions: {
    /* the sweeping beam — present in every phase, faster and wider as it goes */
    lash: {
      wind: 0.68, active: 1.35, recover: 0.7, cooldown: 3.1,
      tell: TELL, sfx: 'seam_lash',
      onStart(world, e, d) {
        const t = d.target;
        const from = t ? Math.atan2(t.y - e.y, t.x - e.x) : 0.4;
        d.beamA = from - 0.55 * Math.sign(t ? t.x - e.x : 1);
        d.beamTo = from + 0.75 * Math.sign(t ? t.x - e.x : 1);
        d.beamOn = 0;
      },
      onWind(world, e, d, k) { d.beamOn = k * 0.35; },
      fire(world, e, d) {
        d.beamOn = 1;
        world.R.fx.shake(0.3, 0.4);
        world.R.fx.chroma(0.7, 0.4);
      },
      during(world, e, d, dt) {
        const span = d.beamTo - d.beamA;
        d.beamA += span * dt / 1.35;
        d.beamT = (d.beamT || 0) - dt;
        if (d.beamT > 0) return;
        d.beamT = 0.06;
        const dx = Math.cos(d.beamA), dy = Math.sin(d.beamA);
        const reach = 1500;
        for (let s = 90; s < reach; s += 90) {
          const bx = e.x + dx * s, by = e.y + dy * s;
          world.damageArea(bx, by, 62, 9, 'void', {
            src: e, team: e.team === 1 ? 0 : 1, falloff: 0, force: 180, props: true, dirX: dx, dirY: dy,
          });
          if (world.solidAt(bx, by)) {
            world.terrain.damage(bx, by, 34, 32, 'void', {});
            break;
          }
        }
      },
      onEnd(world, e, d) { d.beamOn = 0; },
    },

    /* an arm comes out of the tear and slams the ground where you are standing */
    grasp: {
      wind: 0.62, active: 0.9, recover: 0.6, cooldown: 3.6,
      tell: TELL, sfx: 'seam_grasp',
      onStart(world, e, d) {
        const t = d.target;
        d.armI = (d.armI + 1) % 4;
        d.graspX = t ? t.x : e.x + 200;
        const gy = world.groundY(d.graspX, e.y - 200, 900);
        d.graspY = Number.isFinite(gy) ? gy - 20 : e.y + 200;
        d.armReach = 0;
        d.graspHit = 0;
      },
      onWind(world, e, d, k) {
        d.armReach = k * 0.75;
        if (!silhouette() && Math.random() < 0.6) {
          world.P.emit({
            x: d.graspX + (Math.random() - 0.5) * 120, y: d.graspY, count: 1,
            speed: 90, speedVar: 60, vx: 0, vy: -1, vSpread: 0.5, life: 0.5, lifeVar: 0.3,
            size: 12, sizeEnd: 2, color: [0.8, 0.35, 1, 0.9], color2: [0.15, 0.02, 0.3, 0], add: true, gravity: -60,
          });
        }
      },
      during(world, e, d, dt) {
        d.armReach = Math.min(1, d.armReach + dt * 5);
        if (d.armReach >= 1 && !d.graspHit) {
          d.graspHit = 1;
          world.damageArea(d.graspX, d.graspY, 165, 34, 'impact', {
            src: e, team: e.team === 1 ? 0 : 1, hitX: d.graspX, hitY: d.graspY,
            dirY: -1, force: 900, falloff: 1, terrain: true, terrainScale: 0.6, props: true, stagger: 0.3,
          });
          world.R.fx.shake(0.85, 0.6);
          world.R.fx.timeScale(0.06, 0.09);
          world.R.fx.shockwave(d.graspX, d.graspY, 1.2);
          world.P.emit({
            x: d.graspX, y: d.graspY, count: 46, vx: 0, vy: -1, speed: 560, speedVar: 400, vSpread: 1.5,
            life: 0.9, lifeVar: 0.5, size: 20, sizeEnd: 3,
            color: [0.55, 0.45, 0.55, 0.95], color2: [0.12, 0.08, 0.18, 0], gravity: 1100, drag: 1.2, collide: true,
          });
          world.ctx.audio.sfx('seam_slam', { x: d.graspX, y: d.graspY });
          breakNearest(world, d, d.graspX, d.graspY, 220, 2);
        }
      },
      duringRecover(world, e, d, dt) { d.armReach = Math.max(0, d.armReach - dt * 2.2); },
      onEnd(world, e, d) { d.armReach = 0; },
    },

    /* it breathes in: props, debris and Rook all get dragged toward the tear */
    drag: {
      wind: 0.55, active: 1.6, recover: 0.5, cooldown: 6.5,
      tell: [0.5, 0.4, 1.0], sfx: 'seam_drag',
      during(world, e, d, dt) {
        world.shoveDebris(e.x, e.y, 900, -1400 * dt);
        const p = world.player;
        if (p && p.alive) {
          const dx = e.x - p.x, dy = e.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          if (l < 900) {
            const k = (1 - l / 900) * 900;
            p.vx += (dx / l) * k * dt;
            p.vy += (dy / l) * k * dt * 0.55;
          }
        }
        if (!silhouette()) {
          const a = Math.random() * 6.283;
          const r = 500 + Math.random() * 400;
          world.P.emit({
            x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.7, count: 1,
            vx: -Math.cos(a), vy: -Math.sin(a) * 0.7, speed: 420, speedVar: 200,
            life: 1.1, lifeVar: 0.4, size: 9, sizeEnd: 1,
            color: [0.7, 0.45, 1, 0.85], color2: [0.1, 0.02, 0.25, 0], add: true, drag: -0.4,
          });
        }
      },
    },

    /* the vomit: adds pour out of the tear */
    birth: {
      wind: 0.55, active: 0.9, recover: 0.6, cooldown: 8.0,
      tell: [0.6, 1.0, 0.5], sfx: 'seam_birth',
      onStart(world, e, d) { d.birthN = 0; },
      during(world, e, d, dt) {
        d.birthT = (d.birthT || 0) - dt;
        if (d.birthT > 0 || d.birthN >= d.birthCount) return;
        d.birthT = 0.16;
        const table = d.birthTable;
        const id = table[(Math.random() * table.length) | 0];
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = e.x + side * (60 + Math.random() * 70);
        const gy = world.groundY(x, e.y - 100, 900);
        const y = Number.isFinite(gy) ? gy : e.y + 160;
        const c = spawnEnemyById(world, id, x, y, { spawnIn: true, cd: 0.6 + Math.random() });
        if (c) { c.vx = side * 180; c.vy = -160; }
        world.P.emit({
          x, y: y - 20, count: 14, speed: 260, speedVar: 180, vSpread: 2, life: 0.6, lifeVar: 0.3,
          size: 14, sizeEnd: 2, color: [0.65, 0.4, 1, 0.9], color2: [0.1, 0.02, 0.2, 0], add: true, drag: 2,
        });
        d.birthN++;
      },
    },

    /* phase four only: shards fall across the whole arena */
    rain: {
      wind: 0.7, active: 2.4, recover: 0.7, cooldown: 5.5,
      tell: [1.0, 0.3, 0.6], sfx: 'seam_rain',
      during(world, e, d, dt) {
        d.rainT = (d.rainT || 0) - dt;
        if (d.rainT > 0) return;
        d.rainT = 0.14;
        const t = d.target;
        const cx = t ? t.x : e.x;
        const x = cx + (Math.random() - 0.5) * 900;
        const y = e.y - 420;
        spawnTrackingBolt(world, e, x, y, 0, 1, {
          speed: 430, turn: 0.35, damage: 14, life: 3, tag: 'seam_shard', col: [1, 0.35, 0.7],
        });
      },
    },
  },

  onSpawn(world, e, d, o) {
    d.boss = true;
    d.bossName = 'The Seam';
    d.bossPhase = 1;
    d.phaseName = 'widening';
    d.phaseIdx = 0;
    d.shift = 0;
    d.armI = 0;
    d.armReach = 0;
    d.beamOn = 0;
    d.open = 0.2;
    d.wob = 0;
    d.birthCount = 3;
    d.birthTable = ['husk', 'sporeling'];
    d.arena = o.arena || { x: e.x, y: e.y, w: 1800, h: 900 };
    d.arenaProps = collectArena(world, d);
    d.torn = 0;
    e.invuln = 1.2;
    world.bus.emit('boss:spawn', { entity: e, id: 'theseam', name: d.bossName, hp: e.maxHp });
    world.R.fx.chroma(1.2, 1.2);
    world.R.fx.shake(0.7, 1.4);
  },

  onDamageHook(world, e, d, amount) {
    return d.shift > 0 ? 0 : amount;      // untouchable during a phase change
  },

  think(world, e, d, dt) {
    d.target = world.player && world.player.alive ? world.player : null;
    d.wob += dt;
    const t = d.target;
    if (t) e.faceX = t.x < e.x ? -1 : 1;

    const frac = e.hp / e.maxHp;
    const want = phaseFor(frac);
    if (want > d.bossPhase && d.shift <= 0) beginShift(world, e, d, want);

    if (d.shift > 0) {
      d.shift -= dt;
      d.open = 0.2 + Math.sin(world.time * 9) * 0.15 + (1 - d.shift / 2.4) * 0.5;
      if (d.shift <= 0) endShift(world, e, d);
      return;
    }

    if (acting(d)) return;

    d.open = 0.16 + Math.sin(d.wob * 1.3) * 0.06 + d.bossPhase * 0.05;

    if (d.cd > 0) return;
    const p = d.bossPhase;
    const roll = Math.random();

    if (p >= 4 && roll < 0.3) { startAction(e, d, 'rain'); return; }
    if (p >= 2 && roll < 0.20) { startAction(e, d, 'drag'); return; }
    if (roll < 0.42 && countAdds(world) < 4 + p * 2) { startAction(e, d, 'birth'); return; }
    if (p >= 2 && roll < 0.74) { startAction(e, d, 'grasp'); return; }
    startAction(e, d, 'lash');
  },

  pose(e, d, rig, t) {
    const T = rig.tpl.index;
    const reach = d.armReach || 0;

    for (let i = 0; i < ARMS.length; i++) {
      const A = ARMS[i];
      const active = i === d.armI && reach > 0.01;
      const base = T[`${A}0`];
      if (!active) {
        // idle arms are stubs writhing just inside the tear
        for (let s = 0; s < SEGS; s++) {
          const b = T[`${A}${s}`];
          rig.lenS[b] = 0.16 + Math.sin(t * 1.7 + i * 2 + s) * 0.05;
          rig.widS[b] = 0.7;
          rig.ang[b] = (s === 0 ? (i - 1.5) * 0.55 : 0) + Math.sin(t * (1.4 + i * 0.3) + s * 0.9) * 0.28;
          rig.hide[b] = 0;
        }
        continue;
      }
      const dx = (d.graspX - e.x) * (e.faceX < 0 ? -1 : 1);
      const dy = d.graspY - e.y;
      const ang = Math.atan2(dy, dx);
      const curl = Math.sin(t * 6) * 0.05;
      for (let s = 0; s < SEGS; s++) {
        const b = T[`${A}${s}`];
        rig.hide[b] = 0;
        rig.lenS[b] = 0.2 + reach * (1.5 + s * 0.28);
        rig.widS[b] = 1 + reach * 0.35;
        rig.ang[b] = s === 0 ? ang : (0.16 - reach * 0.13) * (s % 2 ? 1 : -1) + curl;
      }
      void base;
    }

    const open = d.open;
    rig.ang[T.mawU] = -0.12 - open * 1.05;
    rig.ang[T.mawL] = 0.12 + open * 1.05;
    rig.lenS[T.mawU] = 0.6 + d.bossPhase * 0.14;
    rig.lenS[T.mawL] = 0.6 + d.bossPhase * 0.14;
    rig.hide[T.mawU] = d.bossPhase < 3 ? 1 : 0;
    rig.hide[T.mawL] = d.bossPhase < 3 ? 1 : 0;
    rig.hide[T.tongue] = d.bossPhase < 4 ? 1 : 0;
    rig.widS[T.tongue] = 1 + Math.sin(t * 7) * 0.25;
  },

  /** The tear is drawn by hand: the rig only carries the arms and the maw. */
  draw(R, e, d, rig, proxy, t, alpha) {
    const sil = silhouette();
    const x = proxy.x, y = proxy.y;
    const grow = 1 + d.bossPhase * 0.16 + (d.shift > 0 ? 0.2 : 0);
    const H = e.h * grow;
    const N = 26;
    const open = 0.55 + d.open * 1.5 + Math.sin(t * 2.1) * 0.08;

    if (!sil) {
      // outer bruise: the sky around the wound is stained
      for (let i = 0; i < 3; i++) {
        const s = (240 + i * 260) * grow;
        R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, s * 0.8, s * 1.5, 0,
          0.32, 0.14, 0.55, 0.16 - i * 0.04, LAYER.BG_NEAR, true, 1);
      }
    }

    // the crack itself: stacked shards, black, offset by a stable per-band wobble
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const yy = y + (f - 0.5) * H;
      const taper = Math.sin(f * Math.PI);
      const wob = Math.sin(f * 5.2 + t * 1.1) * 12 + Math.sin(f * 13.7 + t * 0.6) * 5;
      const w = (14 + taper * 92 * open) * grow;
      const rot = Math.sin(f * 6 + t * 0.9) * 0.09;
      R.spriteRaw(R.white, 0, 0, 1, 1, x + wob, yy, w, H / N * 2.5, rot,
        sil ? 0.012 : DARK[0], sil ? 0.012 : DARK[1], sil ? 0.018 : DARK[2], 1, LAYER.ACTORS, false, 1);
      if (!sil && taper > 0.05) {
        // the lit lips of the wound, brighter as the fight goes on
        const eg = 0.55 + d.bossPhase * 0.14;
        R.spriteRaw(R.white, 0, 0, 1, 1, x + wob - w * 0.5, yy, 3.5, H / N * 2.5, rot,
          EDGE[0] * eg, EDGE[1] * eg, EDGE[2] * eg, 0.95, LAYER.FX, true, 1);
        R.spriteRaw(R.white, 0, 0, 1, 1, x + wob + w * 0.5, yy, 3.5, H / N * 2.5, rot,
          EDGE[0] * eg, EDGE[1] * eg, EDGE[2] * eg, 0.95, LAYER.FX, true, 1);
        R.spriteRaw(R.blob, 0, 0, 1, 1, x + wob, yy, w * 1.0, H / N * 3.0, 0,
          0.42, 0.16, 0.7, 0.20 + d.bossPhase * 0.05, LAYER.FX, true, 1);
      }
    }

    beginPaint(e, d);
    drawRig(R, rig, proxy, LAYER.ACTORS);

    if (sil) return;

    // core: a hard white eye of nothing, and the light the whole arena is graded by
    const pulse = 0.8 + Math.sin(t * 3.1) * 0.12 + (d.shift > 0 ? 0.6 : 0);
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 130 * grow * pulse, 300 * grow * pulse, 0,
      0.75, 0.35, 1, 0.5, LAYER.FX, true, 1);
    R.spriteRaw(R.disc, 0, 0, 1, 1, x, y, 34 * pulse, 130 * grow * pulse, 0, 1, 0.9, 1, 0.9, LAYER.FX, true, 1);
    R.light({ x, y, radius: 1500 * grow, r: 0.55, g: 0.3, b: 1, intensity: 1.5 + d.bossPhase * 0.25, flicker: 0.14 });
    R.light({ x, y, radius: 420, r: 0.95, g: 0.8, b: 1, intensity: 2.2 * pulse, flicker: 0.2 });

    // the beam
    if (d.beamOn > 0) {
      const dx = Math.cos(d.beamA), dy = Math.sin(d.beamA);
      const len = 1500;
      const k = d.beamOn;
      const thick = 8 + k * 62;
      R.line(x, y, x + dx * len, y + dy * len, thick, { r: 0.7, g: 0.25, b: 1, a: 0.45 * k }, LAYER.FX, { add: true, tex: R.blob });
      R.line(x, y, x + dx * len, y + dy * len, thick * 0.28, { r: 1, g: 0.85, b: 1, a: 0.95 * k }, LAYER.FX, { add: true });
      if (k > 0.9) {
        R.light({ x: x + dx * 400, y: y + dy * 400, radius: 700, r: 0.8, g: 0.4, b: 1, intensity: 2.2 });
      }
    }

    // grasp target marker — the player must be told where the hand is going to land
    if (d.act === 'grasp' && d.armReach > 0 && d.armReach < 1) {
      const a = 0.35 + Math.sin(t * 22) * 0.25;
      R.spriteRaw(R.blob, 0, 0, 1, 1, d.graspX, d.graspY, 330, 70, 0, 1, 0.3, 0.7, a, LAYER.FX, true, 1);
    }
  },

  onDeathHook(world, e, d) {
    // the unmaking: everything left standing comes down, then the wound closes
    for (const p of d.arenaProps) if (p && p.alive) world.collapse(p, Math.random() * 1.6);
    world.R.fx.timeScale(0.03, 0.5);
    world.R.fx.flash(1, 0.9, 1, 0.9, 0.7);
    world.R.fx.shake(1.4, 2.4);
    world.R.fx.chroma(2, 1.4);
    world.R.fx.shockwave(e.x, e.y, 2.5);
    world.P.emit({
      x: e.x, y: e.y, count: 240, speed: 1100, speedVar: 700, life: 1.6, lifeVar: 0.9,
      size: 26, sizeEnd: 2, color: [1, 0.85, 1, 1], color2: [0.3, 0.05, 0.6, 0],
      add: true, glow: 0.5, drag: 1.6, stretch: 2.2,
    });
    world.P.emit({
      x: e.x, y: e.y, count: 70, speed: 260, speedVar: 220, life: 2.6, lifeVar: 1.2,
      size: 70, sizeEnd: 320, color: [0.45, 0.25, 0.7, 0.5], color2: [0.05, 0.03, 0.1, 0],
      gravity: -40, drag: 1.4, fadeIn: 0.15,
    });
    world.R.light({ x: e.x, y: e.y, radius: 3000, r: 1, g: 0.85, b: 1, intensity: 6 });
    world.ctx.audio.sfx('seam_death', { x: e.x, y: e.y });
    world.bus.emit('boss:dead', { entity: e, id: 'theseam', x: e.x, y: e.y });
    return true;
  },
});

/* ----------------------------------------------------------------- helpers */

function phaseFor(frac) {
  let p = 1;
  for (const ph of PHASES) if (frac <= ph.at) p = ph.id;
  return p;
}

function collectArena(world, d) {
  const list = [];
  const found = world.queryProps(d.arena.x, d.arena.y, Math.max(d.arena.w, d.arena.h), []);
  for (const p of found) if (p.alive) list.push(p);
  // farthest first, so the arena rots inward and the player is squeezed
  list.sort((a, b) => Math.abs(b.x - d.arena.x) - Math.abs(a.x - d.arena.x));
  return list;
}

function beginShift(world, e, d, want) {
  d.bossPhase = want;
  d.phaseIdx = want - 1;
  d.phaseName = PHASES[d.phaseIdx].name;
  d.shift = 2.4;
  d.cd = 0.6;
  cancelActionSoft(d);
  e.invuln = 2.4;
  d.birthCount = 2 + want;
  d.birthTable = want >= 4 ? ['husk', 'thornhound', 'gloamarcher', 'wispmaw']
    : want === 3 ? ['husk', 'thornhound', 'wispmaw']
      : ['husk', 'sporeling', 'thornhound'];

  world.R.fx.timeScale(0.25, 0.35);
  world.R.fx.flash(0.7, 0.4, 1, 0.5, 0.35);
  world.R.fx.shake(1.0, 1.6);
  world.R.fx.chroma(1.4, 1.0);
  world.R.fx.shockwave(e.x, e.y, 1.8);
  world.ctx.audio.sfx('seam_phase', { x: e.x, y: e.y });
  world.bus.emit('boss:phase', { entity: e, phase: want, name: d.phaseName });

  tearArena(world, d, want);

  if (want >= 3) spawnEnemyById(world, 'sunderwraith', e.x + 200, e.y + 150, { spawnIn: true });
  if (want >= 2) spawnEnemyById(world, 'oozelord', e.x - 240, e.y + 200, { spawnIn: true });
}

function endShift(world, e, d) {
  e.invuln = 0;
  d.shift = 0;
}

/**
 * Pull the supports out from under a share of the arena. `world.collapse` runs the
 * support graph for us, so taking a buttress out brings the arch above it down too
 * — the cascade is the whole point and it must not be faked.
 */
function tearArena(world, d, phase) {
  const list = d.arenaProps.filter(p => p && p.alive);
  if (!list.length) return;
  const want = Math.ceil(list.length * (phase === 2 ? 0.28 : phase === 3 ? 0.42 : 0.75));
  const player = world.player;
  for (let i = 0, n = 0; i < list.length && n < want; i++) {
    const p = list[i];
    if (player && Math.abs(p.x - player.x) < 130) continue;   // never drop one on their head unannounced
    world.collapse(p, 0.15 + n * 0.13);
    n++;
  }
  d.torn += want;
}

function breakNearest(world, d, x, y, r, n) {
  const list = world.queryProps(x, y, r, []);
  for (let i = 0; i < Math.min(n, list.length); i++) world.collapse(list[i], 0.1 + i * 0.15);
}

function countAdds(world) {
  let n = 0;
  const list = world.entities;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive && e.kind === 'enemy' && e.tag !== 'theseam') n++;
  }
  return n;
}

function cancelActionSoft(d) {
  d.act = null; d.phase = 0; d.actT = 0; d.tellK = 0; d.beamOn = 0; d.armReach = 0;
}
