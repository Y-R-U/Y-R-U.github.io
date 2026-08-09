/**
 * Hit reactions, deaths and corpses.
 *
 * A death has to feel earned, so every one of them is the same five beats in the
 * same order: hitstop, a light pop, a burst of the creature's own colour, its rig
 * coming apart into physics gibs, and something left behind on the ground. The
 * flavour changes per creature; the beats do not.
 */

import { LAYER } from '../gfx/renderer.js';
import { silhouette } from './rig.js';

/* Audio keys this module emits. */
export const SFX = {
  hurt: 'enemy_hurt',
  die: 'enemy_die',
  gib: 'enemy_gib',
  corpse: 'corpse_flop',
  eliteDie: 'elite_die',
};

/**
 * Per-creature voice. `enemy_hurt` alone made all nine grunt like a husk; the
 * audio module synthesises a distinct voice per creature and resolves
 * `enemy.<tag>.<event>`, falling back to the generic key when a tag is missing.
 */
const voice = (e, event, fallback) => (e && e.tag ? `enemy.${e.tag}.${event}` : fallback);

/**
 * There is exactly one world at a time, and pooled entities cannot carry closures
 * without allocating a fresh one per spawn, so the shared update/render callbacks
 * read the world from here instead of from the entity.
 */
let _w = null;

/* ------------------------------------------------------------------ hit react */

/**
 * Squash the rig away from the blow and throw chips. The sim already did the
 * white flash via `e.hitFlash`; this is the motion half of the reaction.
 */
export function hitReact(world, e, d, amount, type, dirX, dirY) {
  const k = Math.min(1, amount / (e.maxHp * 0.35 + 6));
  d.squash = Math.min(1.1, (d.squash || 0) + 0.35 + k * 0.5);
  d.recoil = (dirX || 0) * (0.5 + k) * 14;
  d.hurtT = 0.16 + k * 0.14;
  d.lastHitType = type;

  const c = d.ichor || [0.62, 0.20, 0.24];
  world.P.emit({
    x: e.x, y: e.y - e.h * 0.1, count: 4 + (k * 10) | 0,
    vx: dirX || 0, vy: (dirY || 0) - 0.4, speed: 130 + k * 240, speedVar: 140, vSpread: 1.1,
    life: 0.45, lifeVar: 0.3, size: 6 + k * 6, sizeEnd: 1,
    color: [c[0], c[1], c[2], 1], color2: [c[0] * 0.3, c[1] * 0.2, c[2] * 0.25, 0],
    gravity: 900, drag: 1.4, collide: true, bounce: 0.25,
  });
  world.ctx.audio.sfx(voice(e, 'hit', SFX.hurt), { x: e.x, y: e.y });
}

/* ---------------------------------------------------------------------- gibs */

/**
 * Tear the rig apart into pooled physics bodies. Each gib is a `kind:'effect'`
 * entity so the sim's own collision, gravity and bounce do the work — a bespoke
 * ragdoll solver would look worse and cost more.
 */
export function gibRig(world, e, d, opts) {
  _w = world;
  const rig = d.rig;
  if (!rig) return 0;
  const o = opts || {};
  const force = o.force === undefined ? 260 : o.force;
  const life = o.life === undefined ? 7 : o.life;
  const t = rig.tpl;
  const flip = e.faceX < 0 ? -1 : 1;
  let n = 0;
  const maxGibs = o.max === undefined ? 10 : o.max;

  for (let i = 0; i < t.n && n < maxGibs; i++) {
    if (!t.gib[i] || t.add[i] || rig.hide[i]) continue;
    if (t.len[i] < 4 && t.w[i] < 6) continue;
    const la = rig.la[i];
    const len = Math.max(t.len[i], t.w[i] * 0.9) * rig.lenS[i];
    const cx = e.x + flip * (rig.px[i] + Math.cos(la) * t.len[i] * 0.5) * rig.sx;
    const cy = e.y + (rig.py[i] + Math.sin(la) * t.len[i] * 0.5) * rig.sy;
    const ang = flip > 0 ? la : Math.PI - la;

    const g = world.spawn({
      kind: 'effect', tag: 'gib', team: 2, x: cx, y: cy,
      w: Math.max(6, len * 0.6), h: Math.max(6, t.w[i] * 0.8),
      vx: (o.vx || 0) + (Math.random() - 0.5) * force * 2 + flip * (o.push || 0),
      vy: (o.vy || 0) - Math.random() * force - 60,
      gravity: 1, drag: 0.25, bounce: 0.34, friction: 6, collides: true, trigger: true,
      life, material: 8,
      data: {
        gl: len, gw: t.w[i] * rig.widS[i], ga: ang, gs: t.sh[i],
        gr: t.col[i * 3], gg: t.col[i * 3 + 1], gb: t.col[i * 3 + 2],
        spin: (Math.random() - 0.5) * 14, rot: ang, fade: o.fade === undefined ? 1.2 : o.fade,
        burn: o.burn ? 1 : 0,
      },
      onUpdate: gibUpdate,
      render: gibRender,
    });
    if (g) n++;
  }
  if (n) world.ctx.audio.sfx(SFX.gib, { x: e.x, y: e.y });
  return n;
}

function gibUpdate(g, dt) {
  const d = g.data;
  if (!g.onGround) d.rot += d.spin * dt;
  else { d.spin *= 0.86; d.rot += d.spin * dt; }
  if (d.burn && Math.random() < 0.25) {
    _w.P.emit({
      x: g.x, y: g.y, count: 1, speed: 30, speedVar: 24, life: 0.5, lifeVar: 0.3,
      size: 7, sizeEnd: 1, color: [1, 0.7, 0.3, 0.9], color2: [0.6, 0.1, 0.05, 0],
      gravity: -140, add: true, glow: 0.2,
    });
  }
}

function gibRender(g, alpha, R) {
  const d = g.data;
  const x = g.px + (g.x - g.px) * alpha;
  const y = g.py + (g.y - g.py) * alpha;
  const fade = g.life < d.fade ? Math.max(0, g.life / d.fade) : 1;
  const sil = silhouette();
  const cr = sil ? 0.012 : d.gr, cg = sil ? 0.012 : d.gg, cb = sil ? 0.018 : d.gb;
  const tex = d.gs === 0 ? R.white : R.disc;
  R.spriteRaw(tex, 0, 0, 1, 1, x, y, Math.max(6, d.gl), Math.max(5, d.gw), d.rot,
    cr, cg, cb, fade, LAYER.ACTORS, false, 1);
}

/* -------------------------------------------------------------------- corpses */

/**
 * THE CORPSE CONTRACT — Gravewake reads this.
 *
 *   kind:  'corpse'      team: 2       tag: 'corpse'
 *   data.corpse   = true
 *   data.from     = enemy id the body came from ('husk', ...)
 *   data.raisable = true while it can still be raised
 *   data.raised   = set true by whoever raises it (then kill/despawn the corpse)
 *   data.decay    = 1 -> 0 over `data.decayTime`; rots away at 0
 *   data.facing   = -1 | 1
 *   data.hpBase   = the hp the creature had, so a minion can inherit it
 *
 * Corpses are NOT targetable, so a query must pass `{ kind:'corpse', targetable:false }`.
 * `enemies.raiseCorpse(world, corpse, opts)` is the one-call path.
 */
export function spawnCorpse(world, e, d, opts) {
  _w = world;
  const o = opts || {};
  const c = world.spawn({
    kind: 'corpse', tag: 'corpse', team: 2,
    x: e.x, y: e.y + (o.dy || 0),
    w: Math.max(e.w, e.h * 0.8), h: Math.max(14, e.h * 0.34),
    vx: e.vx * 0.3 + (o.vx || 0), vy: -90 + (o.vy || 0),
    gravity: 1, drag: 0.4, bounce: 0.1, friction: 9, collides: true, trigger: true,
    material: 8, hp: 1,
    data: {
      corpse: true, from: d.id, raisable: true, raised: false,
      decay: 1, decayTime: o.decayTime === undefined ? 90 : o.decayTime,
      facing: e.faceX, hpBase: e.maxHp,
      cw: o.w || e.w * 1.15, ch: o.h || e.h * 0.34,
      col: o.col || (d.def && d.def.corpseCol) || [0.20, 0.22, 0.17],
      sunk: 0, settled: 0,
    },
    onUpdate: corpseUpdate,
    render: corpseRender,
  });
  if (c) {
    world.ctx.audio.sfx(SFX.corpse, { x: e.x, y: e.y });
    world.bus.emit('corpse:spawn', { entity: c, from: d.id, x: c.x, y: c.y });
  }
  return c;
}

function corpseUpdate(c, dt) {
  const d = c.data;
  if (c.onGround && !d.settled) { d.settled = 1; }
  d.decay -= dt / d.decayTime;
  if (d.decay <= 0) {
    d.raisable = false;
    _w.P.emit({
      x: c.x, y: c.y, count: 10, speed: 30, speedVar: 25, life: 1.6, lifeVar: 0.8,
      size: 12, sizeEnd: 2, color: [0.35, 0.42, 0.28, 0.5], color2: [0.1, 0.14, 0.1, 0],
      gravity: -40, fadeIn: 0.2,
    });
    _w.despawn(c);
  }
}

function corpseRender(c, alpha, R) {
  const d = c.data;
  const x = c.px + (c.x - c.px) * alpha;
  const y = c.py + (c.y - c.py) * alpha;
  const sil = silhouette();
  const k = 0.45 + d.decay * 0.55;
  const cr = sil ? 0.012 : d.col[0] * k, cg = sil ? 0.012 : d.col[1] * k, cb = sil ? 0.018 : d.col[2] * k;
  // slumped mass, one arm flung out, a suggestion of a head — enough to read as a body
  R.spriteRaw(R.disc, 0, 0, 1, 1, x, y + d.ch * 0.18, d.cw, d.ch, 0, cr, cg, cb, 1, LAYER.ACTORS, false, 1);
  R.spriteRaw(R.disc, 0, 0, 1, 1, x - d.facing * d.cw * 0.42, y + d.ch * 0.05,
    d.ch * 0.85, d.ch * 0.8, 0, cr * 1.1, cg * 1.1, cb * 1.1, 1, LAYER.ACTORS, false, 1);
  R.spriteRaw(R.white, 0, 0, 1, 1, x + d.facing * d.cw * 0.36, y + d.ch * 0.3,
    d.cw * 0.5, d.ch * 0.24, 0.22 * d.facing, cr * 0.8, cg * 0.8, cb * 0.8, 1, LAYER.ACTORS, false, 1);
  if (!sil && d.raisable) {
    // a faint ember of what is left — the visual cue that Gravewake has something to work with
    const pulse = 0.18 + Math.sin(_w.time * 2.1 + c.id) * 0.06;
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y - 2, d.cw * 0.9, d.ch * 1.4, 0,
      0.35, 0.85, 0.55, pulse * d.decay, LAYER.FX, true, 1);
  }
}

/* -------------------------------------------------------------------- deaths */

/**
 * The shared death sequence. `style` picks the flavour:
 *   'burst'   — flesh gives way (husk, thornhound)
 *   'spore'   — pops into a cloud (sporeling)
 *   'shatter' — stone comes apart (stonewarden)
 *   'dissolve'— unmakes itself into motes (gloamarcher, sunderwraith)
 *   'splat'   — fluid (oozelord, wispmaw)
 */
export function deathFx(world, e, d, style, opts) {
  const o = opts || {};
  const c = d.ichor || [0.62, 0.20, 0.24];
  const big = o.big || 0;
  const R = world.R, P = world.P;

  R.fx.timeScale(big ? 0.04 : 0.12, big ? 0.09 : 0.045);
  R.fx.shake(big ? 0.55 : 0.14, big ? 0.5 : 0.2);
  if (big) R.fx.chroma(0.5, 0.3);

  world.ctx.audio.sfx(voice(e, 'die', big ? SFX.eliteDie : SFX.die), { x: e.x, y: e.y });

  if (style === 'spore') {
    P.emit({
      x: e.x, y: e.y, count: 46, speed: 210, speedVar: 170, life: 1.5, lifeVar: 0.9,
      size: 16, sizeEnd: 42, color: [0.62, 0.95, 0.45, 0.85], color2: [0.14, 0.3, 0.12, 0],
      gravity: -50, drag: 2.2, fadeIn: 0.1, glow: 0.15, add: true,
    });
    P.emit({
      x: e.x, y: e.y, count: 22, speed: 320, speedVar: 200, life: 0.7, lifeVar: 0.4,
      size: 8, sizeEnd: 1, color: [0.85, 1, 0.6, 1], color2: [0.2, 0.5, 0.15, 0],
      gravity: 500, drag: 1.4, add: true, collide: true,
    });
    R.light({ x: e.x, y: e.y, radius: 260, r: 0.55, g: 0.95, b: 0.5, intensity: 1.4 });
  } else if (style === 'shatter') {
    world.burstDebris(e.x, e.y, o.material === undefined ? 1 : o.material, 14, {
      speed: 420, speedVar: 300, spread: Math.PI, dir: -Math.PI / 2, size: 1.2, sizeVar: 0.5,
    });
    P.emit({
      x: e.x, y: e.y, count: 40, speed: 180, speedVar: 220, life: 1.5, lifeVar: 0.8,
      size: 30, sizeEnd: 110, color: [0.55, 0.53, 0.5, 0.55], color2: [0.16, 0.16, 0.2, 0],
      gravity: -60, drag: 1.8, fadeIn: 0.1,
    });
  } else if (style === 'dissolve') {
    P.emit({
      x: e.x, y: e.y, count: 54, speed: 90, speedVar: 90, life: 1.5, lifeVar: 0.9,
      size: 11, sizeEnd: 1, color: [c[0], c[1], c[2], 1], color2: [0.05, 0.02, 0.12, 0],
      gravity: -230, drag: 1.1, add: true, glow: 0.2, fadeIn: 0.08,
    });
    P.emit({
      x: e.x, y: e.y, count: 16, speed: 430, speedVar: 260, life: 0.4, lifeVar: 0.2,
      size: 10, sizeEnd: 1, color: [1, 1, 1, 1], color2: [c[0], c[1], c[2], 0],
      add: true, stretch: 2.4, drag: 3,
    });
  } else if (style === 'splat') {
    P.emit({
      x: e.x, y: e.y, count: 40, speed: 340, speedVar: 260, life: 1.1, lifeVar: 0.6,
      size: 15, sizeEnd: 4, color: [c[0], c[1], c[2], 1], color2: [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4, 0],
      gravity: 1200, drag: 0.8, collide: true, bounce: 0.15,
    });
  } else {
    P.emit({
      x: e.x, y: e.y, count: 30, speed: 300, speedVar: 240, life: 0.8, lifeVar: 0.5,
      size: 12, sizeEnd: 2, color: [c[0], c[1], c[2], 1], color2: [c[0] * 0.25, c[1] * 0.2, c[2] * 0.2, 0],
      gravity: 1100, drag: 1.1, collide: true, bounce: 0.2,
    });
    P.emit({
      x: e.x, y: e.y, count: 12, speed: 120, speedVar: 90, life: 1.3, lifeVar: 0.6,
      size: 20, sizeEnd: 60, color: [0.4, 0.35, 0.35, 0.35], color2: [0.1, 0.1, 0.12, 0],
      gravity: -70, drag: 2, fadeIn: 0.12,
    });
  }

  // the light pop: brief, coloured to the creature, gone in under a fifth of a second
  const glow = o.glow || c;
  R.light({ x: e.x, y: e.y, radius: 300 + big * 300, r: glow[0], g: glow[1], b: glow[2], intensity: 2 + big });
  if (big) R.fx.shockwave(e.x, e.y, 0.8);
}
