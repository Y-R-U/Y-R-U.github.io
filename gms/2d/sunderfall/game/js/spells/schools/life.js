/**
 * LIFE — Gravewake.
 *
 * Its world contract is the harshest one in the game: it does not damage BONE
 * props, it *spends* them. A skull pile that gets raised is gone from the level
 * for good, and at rank 4 what is left behind is a mound of new terrain.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { SCHOOL, impact, castFlash, decal, splat, shake, drawOrb, emitDesc as E, setColor as col, colA, colB } from '../fx.js';
import { field, dmgOpts, enemiesIn, corpsesIn, propsOfMaterial } from '../common.js';

const S = SCHOOL.life;
const BONEC = [0.78, 0.74, 0.62];
const listScratch = [];

/* ------------------------------------------------------------------ *
 * The risen
 * ------------------------------------------------------------------ */

function minionUpdate(e, dt) {
  const d = e.data, w = d.w;
  d.age += dt;
  d.swing -= dt;
  d.rise = Math.min(1, d.rise + dt * 3);
  if (d.rise < 1) { e.vx = 0; return; }

  let t = d.target;
  if (!t || !t.alive) {
    d.scan -= dt;
    if (d.scan <= 0) { d.scan = 0.35; t = d.target = w.nearestEnemy(e.x, e.y, 900); }
  }
  if (!t || !t.alive) {
    // no work: shuffle back toward Rook
    const p = w.player;
    const want = p ? Math.sign(p.x - e.x) * (Math.abs(p.x - e.x) > 160 ? 1 : 0) : 0;
    e.vx += (want * d.speed * 0.6 - e.vx) * Math.min(1, 6 * dt);
    d.face = want || d.face;
    return;
  }
  const dx = t.x - e.x;
  d.face = dx >= 0 ? 1 : -1;
  if (Math.abs(dx) > 46) {
    e.vx += (Math.sign(dx) * d.speed - e.vx) * Math.min(1, 6 * dt);
    if (e.onGround && Math.abs(dx) < 300 && t.y < e.y - 60) e.vy = -900;
  } else {
    e.vx *= 0.8;
    if (d.swing <= 0) {
      d.swing = 0.75;
      const applied = w.damage(t, d.damage, 'impact', dmgOpts(e, t.x, t.y, d.face, -0.2, 260, 0.1));
      d.report(e, t, applied, 'impact', t.material);
      impact(w, t.x, t.y - 10, d.face, -0.2, 'life', 0.55, t.material);
      w.ctx.audio.sfx('minion_swing', { x: e.x, y: e.y });
    }
  }
}

function minionRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
  const r = d.rise;
  const h = e.h * r;
  const bob = Math.sin(d.age * 9) * 3 * Math.min(1, Math.abs(e.vx) / 120);
  const flash = e.hitFlash || 0;
  const cr = BONEC[0] * (1 - flash) + flash, cg = BONEC[1] * (1 - flash) + flash, cb = BONEC[2] * (1 - flash) + flash;

  // silhouette first: a hunched ribcage on two thin legs reads at 25% size
  R.sprite({ tex: R.blob, x, y: y + h * 0.28, w: 12, h: h * 0.44, rot: 0.12, r: cr * 0.7, g: cg * 0.7, b: cb * 0.7, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: x + 9, y: y + h * 0.28, w: 12, h: h * 0.44, rot: -0.12, r: cr * 0.7, g: cg * 0.7, b: cb * 0.7, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x, y: y - h * 0.05 + bob, w: e.w * 0.9, h: h * 0.46, r: cr, g: cg, b: cb, a: 1, layer: LAYER.ACTORS });
  for (let i = 0; i < 3; i++) {
    R.sprite({ tex: R.white, x, y: y - h * 0.12 + i * h * 0.1 + bob, w: e.w * 0.8, h: 3, r: cr * 0.45, g: cg * 0.45, b: cb * 0.45, a: 0.8, layer: LAYER.ACTORS });
  }
  R.sprite({ tex: R.blob, x: x + d.face * 5, y: y - h * 0.36 + bob, w: 26, h: 26, r: cr, g: cg, b: cb, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: x + d.face * 9, y: y - h * 0.36 + bob, w: 8, h: 6, r: S.base[0], g: S.base[1], b: S.base[2], a: 1, layer: LAYER.FX, add: true });
  R.sprite({ tex: R.streak, x: x + d.face * 22, y: y + h * 0.02 + bob, w: 8, h: 46, rot: d.face * (d.swing > 0.55 ? -0.9 : 0.5), r: cr * 0.8, g: cg * 0.8, b: cb * 0.8, a: 1, layer: LAYER.ACTORS });

  const glow = 0.4 + 0.6 * (1 - r);
  R.sprite({ tex: R.blob, x, y, w: e.w * 2.4, h: h * 1.4, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.16 * glow, layer: LAYER.FX, add: true });
  R.light({ x, y: y - 10, radius: 150, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.55 * glow, flicker: 0.25 });
}

function raise(w, caster, x, y, st, C) {
  const e = w.spawn({
    kind: 'custom', x, y: y - 44, w: 34, h: 88,
    team: 0, hp: st.hp, material: MATERIAL.BONE,
    gravity: 1, drag: 0, friction: 6, collides: true, gridSolid: false,
    life: st.lifetime, tag: 'risen', owner: caster,
    onUpdate: minionUpdate, render: minionRender,
    onDeath(sp) { boneBurst(w, sp, st); },
    onDespawn(sp) {
      if (sp.hp > 0) {              // timed out rather than killed: it just settles
        w.burstDebris(sp.x, sp.y + 30, MATERIAL.BONE, 6, { speed: 130, speedVar: 90, spread: 2.4, dir: -Math.PI / 2, size: 0.7 });
        w.ctx.audio.sfx('bone_clatter', { x: sp.x, y: sp.y });
      }
      splat(w.rng, sp.x, sp.y + 44, 26, [0.20, 0.19, 0.16, 0.5], 3, { life: 480, hold: 0.9 });
    },
  });
  if (!e) return null;
  const d = e.data;
  d.w = w; d.rise = 0; d.age = 0; d.swing = 0; d.scan = 0;
  d.damage = st.minionDamage; d.speed = st.minionSpeed; d.face = 1;
  d.target = null; d.shrapnel = st.shrapnel; d.chain = st.chain; d.report = C.report;
  d.st = st; d.caster = caster;

  // the raising itself: dirt and bone thrown up, a column of light
  w.burstDebris(x, y - 6, MATERIAL.EARTH, 6, { speed: 320, speedVar: 200, spread: 1.3, dir: -Math.PI / 2, size: 0.8 });
  const em = E(x, y - 20, 16);
  em.vx = 0; em.vy = -1; em.speed = 300; em.speedVar = 200; em.vSpread = 0.5;
  em.life = 0.8; em.lifeVar = 0.4; em.size = 12; em.sizeEnd = 1; em.gravity = 380; em.drag = 1.2;
  em.add = true; em.glow = 0.08;
  em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.9);
  em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
  w.P.emit(em);
  w.R.light({ x, y: y - 60, radius: 320, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.8 });
  w.ctx.audio.sfx('spell_gravewake_raise', { x, y });
  return e;
}

function boneBurst(w, sp, st) {
  const d = sp.data;
  if (d.shrapnel) {
    w.explode(sp.x, sp.y, {
      radius: 130, damage: d.damage * 1.6, type: 'impact', force: 620,
      terrain: false, props: true, shake: 0.18, hitstop: 0.02, flash: 0.08, dust: 0.5, sparks: 0.4,
    });
    w.burstDebris(sp.x, sp.y, MATERIAL.BONE, 12, { speed: 620, speedVar: 320, spread: Math.PI, size: 0.8 });
    w.ctx.audio.sfx('spell_gravewake_shrapnel', { x: sp.x, y: sp.y });
  }
  if (d.chain) {
    // rank 5: the dead it made raise their own dead
    const bodies = corpsesIn(w, sp.x, sp.y, 220, listScratch);
    if (bodies.length && d.st.__gen < 2) {
      const st2 = d.st;
      st2.__gen++;
      raise(w, d.caster, bodies[0].x, bodies[0].y, st2, { report: d.report });
      st2.__gen--;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Gravewake
 * ------------------------------------------------------------------ */

function wakeStep(e, dt, t01) {
  const d = e.data, w = d.w;
  d.acc += dt;
  if (d.acc < 0.16) return;
  d.acc = 0;
  if (d.left <= 0) return;

  // corpses first, then bone props — spending a skull pile is the last resort
  const bodies = corpsesIn(w, e.x, e.y, d.radius, listScratch);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (d.used.indexOf(b.id) >= 0) continue;
    d.used.push(b.id);
    d.left--;
    raise(w, d.caster, b.x, b.y + b.h * 0.5, d.st, { report: d.report });
    w.despawn(b);
    return;
  }
  const piles = propsOfMaterial(w, e.x, e.y, d.radius, MATERIAL.BONE, PILEBUF);
  for (let i = 0; i < piles.length; i++) {
    const p = piles[i];
    if (!p.alive) continue;
    d.left--;
    consumePile(w, d, p);
    return;
  }
  // nothing to raise from: the spell makes its own, at half strength
  if (d.left > 0 && d.desperate) {
    d.left--;
    const gy = w.groundY(e.x + w.rng.range(-d.radius, d.radius), e.y - 60, 400);
    if (!Number.isNaN(gy)) raise(w, d.caster, e.x + w.rng.range(-d.radius, d.radius), gy, d.st, { report: d.report });
  }
}
const PILEBUF = [];

/** A BONE prop is spent, not broken: it goes, and something stands up. */
function consumePile(w, d, p) {
  const px = p.x, py = p.bottom;
  const em = E(px, py - p.h * 0.5, 22);
  em.speed = 90; em.life = 0.6; em.lifeVar = 0.3; em.size = 10; em.sizeEnd = 2;
  em.gravity = -260; em.drag = 1.4; em.add = true; em.glow = 0.06;
  em.color = col(colA, BONEC[0], BONEC[1], BONEC[2], 0.95);
  em.color2 = col(colB, S.base[0], S.base[1], S.base[2], 0);
  w.P.emit(em);
  w.despawnProp ? w.despawnProp(p) : w.breakProp(p, 'gravewake');
  w.ctx.audio.sfx('spell_gravewake_consume', { x: px, y: py });
  raise(w, d.caster, px, py, d.st, { report: d.report });
  if (d.mound) {
    // it raises what it consumes — literally
    w.terrain.fill(px, py - 10, 26, MATERIAL.EARTH);
    w.terrain.fill(px, py + 4, 30, MATERIAL.EARTH);
    splat(w.rng, px, py - 4, 34, [0.22, 0.17, 0.12, 0.7], 4, { life: 900, hold: 0.95 });
  }
  splat(w.rng, px, py - 3, 30, [0.16, 0.15, 0.13, 0.6], 3, { life: 900, hold: 0.95 });
}

function wakeDraw(e, R, t01) {
  const d = e.data;
  const a = t01 > 0.8 ? (1 - t01) / 0.2 : Math.min(1, t01 * 5);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - t01 * 1.2;
    const px = e.x + Math.cos(ang) * d.radius;
    const py = e.y + Math.sin(ang) * d.radius * 0.28;
    R.sprite({ tex: R.blob, x: px, y: py, w: 30, h: 14, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.4 * a, layer: LAYER.FX, add: true });
    R.sprite({ tex: R.streak, x: px, y: py - 22, w: 10, h: 50, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.18 * a, layer: LAYER.FX, add: true });
  }
  R.sprite({ tex: R.blob, x: e.x, y: e.y, w: d.radius * 2.2, h: d.radius * 0.8, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.35 * a, layer: LAYER.FX });
  R.light({ x: e.x, y: e.y - 30, radius: d.radius * 2.4, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.0 * a, flicker: 0.3 });
}

export const gravewake = {
  id: 'gravewake', name: 'Gravewake', school: 'life',
  desc: 'Vayne would have hated this one. Rook likes it more than he should.',
  unlockLevel: 9, manualOnly: false, cost: 44, cooldown: 12, range: 560, levels: 5,
  targeting: 'ground', windup: 0.4, castSfx: 'spell_gravewake_cast',
  rankText: [
    'Two of the dead stand up and fight for you. Bone piles are spent doing it.',
    'Three, and they last longer.',
    'They burst into bone shrapnel when they fall.',
    'Four, and every pile it spends leaves a mound of new ground.',
    'The risen raise their own dead.',
  ],
  scale(rank) {
    return {
      count: [2, 3, 3, 4, 5][rank - 1],
      hp: [40, 55, 70, 90, 115][rank - 1],
      minionDamage: [12, 16, 21, 27, 34][rank - 1],
      minionSpeed: [190, 205, 215, 230, 250][rank - 1],
      lifetime: [14, 17, 20, 24, 30][rank - 1],
      radius: [200, 220, 240, 260, 290][rank - 1],
      shrapnel: rank >= 3,
      mound: rank >= 4,
      chain: rank >= 5,
      desperate: rank >= 2,
      cooldown: [12, 11.6, 11.2, 10.8, 10.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'life', 1.2);
    w.ctx.audio.sfx('spell_gravewake_cast', { x: C.tx, y: C.ty });
    shake(w.R, 0.2, 0.5);
    const gy = w.groundY(C.tx, C.ty - 120, 600);
    const y = Number.isNaN(gy) ? C.ty : gy;
    const f = field(w, {
      x: C.tx, y, life: 2.2, tag: 'gravewake', owner: caster,
      step: wakeStep, draw: wakeDraw,
      done(e) {
        const d = e.data;
        // the graves stay dug
        for (let i = 0; i < 5; i++) {
          splat(w.rng, e.x + w.rng.range(-d.radius, d.radius), e.y - 3, 30, [0.18, 0.16, 0.13, 0.45], 2, { life: 700, hold: 0.92 });
        }
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.radius = st.radius; d.left = st.count;
    d.acc = 0; d.used = []; d.mound = st.mound; d.desperate = st.desperate;
    d.report = C.report;
    d.st = st; st.__gen = 0;
  },
  icon: null,
};

export const LIFE_SPELLS = [gravewake];
