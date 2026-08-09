/**
 * EARTH — Stonepin, Sunderquake, Thornsurge, Bulwark.
 *
 * Earth's world contract: it is the school that edits the terrain grid. Stonepin
 * embeds and stays embedded, Sunderquake undermines prop bases so the support
 * graph brings arches down, Thornsurge leaves real obstacles, and Bulwark builds
 * terrain that everyone — including the player — then has to live with.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { SCHOOL, impact, castFlash, decal, splat, shake, hitstop, shockwave, emitDesc as E, setColor as col, colA, colB } from '../fx.js';
import { projectile, field, dmgOpts, enemiesIn, dirTo, DIR, lobVelocity, VEL, matAt } from '../common.js';

const S = SCHOOL.earth;
const propScratch = [];

/* ------------------------------------------------------------------ *
 * Stonepin — a heavy arcing shard that stays where it lands
 * ------------------------------------------------------------------ */

function pinRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
  const rot = Math.atan2(e.vy, e.vx) + Math.PI * 0.5;
  R.sprite({ tex: R.streak, x, y, w: 26, h: 78, rot, r: 0.30, g: 0.28, b: 0.27, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.streak, x: x + 5, y, w: 9, h: 74, rot, r: 0.52, g: 0.48, b: 0.44, a: 0.9, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x, y, w: 70, h: 70, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.22, layer: LAYER.FX, add: true });
  R.light({ x, y, radius: 150, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.5 });
}

function pinHit(e, hit, w) {
  const d = e.data;
  const L = Math.hypot(e.vx, e.vy) || 1;
  const nx = e.vx / L, ny = e.vy / L;

  impact(w, hit.x, hit.y, nx, ny, 'earth', 1.4, hit.material);
  w.ctx.audio.sfx('spell_stonepin_impact', { x: hit.x, y: hit.y });
  hitstop(w.R, 0.05);
  shake(w.R, 0.32, 0.35);

  if (hit.what === 'entity') {
    const t = hit.entity;
    const applied = w.damage(t, d.dmg, 'impact', dmgOpts(e.owner, hit.x, hit.y, nx, ny, 420, 0.45,
      d.pin ? 'root' : null, d.pin ? 2.2 : 0, 1));
    d.report(e, t, applied, 'impact', t.material);
    if (!d.pin) return 'stop';
    // rank 3+: the shard carries on into the ground and nails the target there
    return 'pierce';
  }

  // stone-breaker: doubled against the two materials the design says it owns
  const bonus = (hit.material === MATERIAL.MASONRY || hit.material === MATERIAL.ROCK) ? 2.1 : 1;
  if (hit.what === 'prop') {
    const applied = w.damageProp(hit.prop, d.dmg * bonus, 'impact', dmgOpts(e.owner, hit.x, hit.y, nx, ny, 400));
    d.report(e, hit.prop, applied, 'impact', hit.material);
  } else {
    w.terrain.damage(hit.x, hit.y, 34, d.dmg * bonus, 'impact');
  }

  if (d.quake > 0) {
    w.explode(hit.x, hit.y, {
      radius: d.quake, damage: d.dmg * 0.55, type: 'impact', force: 520,
      terrain: true, terrainScale: 0.35, props: true,
      shake: 0.2, hitstop: 0, flash: 0.05, dust: 1.5, sparks: 0.3,
    });
  }

  if (d.split > 0) {
    for (let i = 0; i < d.split; i++) {
      const a = -Math.PI * 0.5 + (i - (d.split - 1) * 0.5) * 0.5;
      spawnPin(w, e.owner, hit.x, hit.y - 10, Math.cos(a) * 620, Math.sin(a) * 620, {
        dmg: d.dmg * 0.4, quake: 0, split: 0, pin: false, monolith: false, report: d.report,
      });
    }
  }

  // the lingering trace: the shard is still there, sticking out of the ground
  embedPin(w, hit.x, hit.y, nx, ny, d.monolith);
  return 'stop';
}

function embedPin(w, x, y, nx, ny, monolith) {
  const rot = Math.atan2(ny, nx) + Math.PI * 0.5;
  decal({
    x: x - nx * 18, y: y - ny * 18, w: 26, h: 86, rot,
    color: [0.30, 0.285, 0.27, 1], life: 600, hold: 0.97, layer: LAYER.TERRAIN_FRONT, tex: w.R.streak,
  });
  decal({
    x: x - nx * 18 + 5, y: y - ny * 18, w: 9, h: 80, rot,
    color: [0.50, 0.46, 0.42, 0.85], life: 600, hold: 0.97, layer: LAYER.TERRAIN_FRONT, tex: w.R.streak,
  });
  splat(w.rng, x, y, 40, [0.14, 0.12, 0.11, 0.5], 4, { life: 300 });
  w.burstDebris(x, y, MATERIAL.ROCK, 7, { speed: 260, speedVar: 200, spread: 2.2, dir: -Math.PI / 2, size: 0.9 });
  if (monolith) {
    // rank 5: it is not decoration, it is cover — real terrain you can hide behind
    w.terrain.fill(x, y - 46, 26, MATERIAL.ROCK);
    w.terrain.fill(x, y - 12, 30, MATERIAL.ROCK);
  }
}

function spawnPin(w, owner, x, y, vx, vy, cfg) {
  const p = projectile(w, {
    x, y, vx, vy, gravity: 1.1, school: 'earth', radius: 14, life: 4, tag: 'stonepin',
    owner, team: 0, render: pinRender,
    trail: { color: [0.55, 0.50, 0.44, 0.6], color2: [0.26, 0.24, 0.22, 0], size: 12, rate: 55, add: false, gravity: 120, drag: 1.2 },
    onHit: pinHit,
  });
  if (!p) return null;
  Object.assign(p.data, cfg);
  return p;
}

export const stonepin = {
  id: 'stonepin', name: 'Stonepin', school: 'earth',
  desc: 'A spike of the hillside, thrown badly and very hard.',
  unlockLevel: 5, manualOnly: false, cost: 20, cooldown: 1.6, range: 820, levels: 5,
  targeting: 'aim', windup: 0.22, castSfx: 'spell_stonepin_cast',
  rankText: [
    'A heavy arcing shard. Nothing beats it against stone.',
    'The landing sends out a small quake of its own.',
    'Nails what it hits to the ground behind it.',
    'Shatters into three shards where it lands.',
    'The buried shard stays as real cover you can hide behind.',
  ],
  scale(rank) {
    return {
      damage: [34, 43, 54, 66, 82][rank - 1],
      speed: [1000, 1050, 1100, 1150, 1220][rank - 1],
      quake: [0, 90, 105, 120, 140][rank - 1],
      split: rank >= 4 ? 3 : 0,
      pin: rank >= 3,
      monolith: rank >= 5,
      cooldown: [1.6, 1.55, 1.5, 1.45, 1.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'earth', 1.0, C.dirX, C.dirY);
    w.ctx.audio.sfx('spell_stonepin_cast', { x: C.x, y: C.y });
    // dirt kicks up out of the ground as the shard is torn loose
    const gy = w.groundY(caster.x, caster.y, 200);
    if (!Number.isNaN(gy)) {
      w.burstDebris(caster.x, gy - 6, MATERIAL.EARTH, 5, { speed: 300, speedVar: 180, spread: 1.6, dir: -Math.PI / 2, size: 0.7 });
    }
    lobVelocity(C.x, C.y, C.tx, C.ty, st.speed, 3000 * 1.1, VEL);
    spawnPin(w, caster, C.x, C.y, VEL.x, VEL.y, {
      dmg: st.damage, quake: st.quake, split: st.split, pin: st.pin,
      monolith: st.monolith, report: C.report,
    });
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Sunderquake — the wall-breaker
 * ------------------------------------------------------------------ */

function quakeStep(e, dt, t01) {
  const d = e.data, w = d.w;
  d.acc += dt;
  const stepDist = 90;
  while (d.acc > d.gap && d.dist < d.reach) {
    d.acc -= d.gap;
    d.dist += stepDist;
    for (let s = -1; s <= 1; s += 2) {
      const x = e.x + s * d.dist;
      const gy = w.groundY(x, e.y - 120, 500);
      if (Number.isNaN(gy)) continue;
      const fall = 1 - d.dist / d.reach;

      // Each wave may only touch a given target once. Without this the twelve
      // overlapping steps stack into ~900 damage and level the whole screen.
      QUAKEQ.maxTargets = 24;
      const list = enemiesIn(w, x, gy - 40, d.radius, null, 24);
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (d.seen.indexOf(t.id) >= 0) continue;
        d.seen.push(t.id);
        w.damage(t, d.damage * fall, 'impact', dmgOpts(d.caster, t.x, t.y, s, -0.6, 620 * fall, 0.4));
      }
      if (d.fissure && (d.tick++ & 1) === 0) {
        // A crack, not a trench. Carving the ground out from under a prop's base
        // is what triggers the support re-solve — it does not need to be wide,
        // and a wave that eats the whole floor leaves nothing to stand on.
        w.terrain.damage(x, gy + 14, 14 + 8 * fall, d.damage * 0.55, 'impact', FISSURE);
      }
      const props = w.queryProps(x, gy - 60, d.radius * 0.8, propScratch);
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive || d.seenP.indexOf(p) >= 0) continue;
        d.seenP.push(p);
        w.damageProp(p, d.damage * fall * (p.material === MATERIAL.MASONRY ? 1.5 : 1), 'impact',
          dmgOpts(d.caster, p.x, p.bottom, 0, -1, 300));
        if (d.forceCollapse && !p.stable) w.collapse(p, w.rng.range(0.05, 0.4));
      }

      w.burstDebris(x, gy - 8, matAt(w, x, gy + 6), 4, { speed: 420 * fall + 120, speedVar: 200, spread: 1.1, dir: -Math.PI / 2, size: 0.9 });
      const em = E(x, gy - 20, 6);
      em.vx = 0; em.vy = -1; em.speed = 340 * fall + 100; em.speedVar = 200; em.vSpread = 0.6;
      em.life = 0.8; em.lifeVar = 0.5; em.size = 26; em.sizeEnd = 70; em.gravity = -40; em.drag = 1.6; em.fadeIn = 0.1;
      em.color = col(colA, 0.46, 0.40, 0.32, 0.55);
      em.color2 = col(colB, 0.20, 0.18, 0.17, 0);
      w.P.emit(em);

      // a crack in the floor that stays cracked
      decal({
        x, y: gy - 2, w: 120 * fall + 40, h: 12, rot: w.rng.range(-0.2, 0.2),
        color: [0.05, 0.045, 0.05, 0.85], life: 600, hold: 0.95, layer: LAYER.TERRAIN_FRONT, tex: w.R.streak,
      });
      w.ctx.audio.sfx('spell_sunderquake_crack', { x, y: gy });
    }
  }
}
const QUAKEQ = { falloff: 1, props: false, terrain: false, team: 1, force: 620, stagger: 0.4 };
const FISSURE = { jitter: 1.2, debris: 1.4, dust: 1.5, softEdge: true };

function quakeDraw(e, R, t01) {
  const d = e.data;
  const a = 1 - t01;
  for (let s = -1; s <= 1; s += 2) {
    const x = e.x + s * d.dist;
    R.sprite({ tex: R.blob, x, y: e.y + 30, w: 220, h: 90, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.22 * a, layer: LAYER.FX, add: true });
    R.light({ x, y: e.y + 20, radius: 260, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.8 * a });
  }
}

function slam(w, caster, st, C, aftershock) {
  const gy = w.groundY(caster.x, caster.y, 300);
  const y = Number.isNaN(gy) ? caster.y + 40 : gy;

  w.explode(caster.x, y - 10, {
    radius: st.radius, damage: st.damage, type: 'impact', force: 900,
    terrain: st.fissure, terrainScale: 0.22, props: true,
    shake: aftershock ? 0.4 : 0.75, hitstop: aftershock ? 0.03 : 0.07, flash: 0.10,
    dust: 2, sparks: 0.4, light: 0.8,
  });
  shockwave(w.R, caster.x, y, 1.3);
  w.ctx.audio.sfx('spell_sunderquake_slam', { x: caster.x, y });

  const f = field(w, {
    x: caster.x, y, life: 1.2, tag: 'sunderquake', owner: caster,
    step: quakeStep, draw: quakeDraw,
  });
  if (!f) return;
  const d = f.data;
  d.w = w; d.caster = caster; d.damage = st.damage * (aftershock ? 0.7 : 1);
  d.radius = st.radius * 0.62; d.reach = st.reach; d.dist = 0; d.acc = 0; d.gap = 0.028;
  d.seen = []; d.seenP = [];
  d.fissure = st.fissure; d.forceCollapse = st.forceCollapse; d.report = C.report; d.tick = 0;
}

export const sunderquake = {
  id: 'sunderquake', name: 'Sunderquake', school: 'earth',
  desc: 'He hits the ground. The ground takes it personally.',
  unlockLevel: 7, manualOnly: false, cost: 42, cooldown: 7.5, range: 0, levels: 5,
  targeting: 'self', windup: 0.36, castSfx: 'spell_sunderquake_cast',
  rankText: [
    'A slam. The ground cracks away from him in both directions.',
    'Reaches further and throws what it catches into the air.',
    'Carves a real fissure — anything standing on undermined ground comes down.',
    'Two waves. The second is wider than the first.',
    'An aftershock a beat later finishes whatever was left leaning.',
  ],
  scale(rank) {
    return {
      damage: [30, 38, 48, 60, 74][rank - 1],
      radius: [130, 145, 160, 175, 195][rank - 1],
      reach: [520, 640, 760, 900, 1050][rank - 1],
      fissure: rank >= 3,
      double: rank >= 4,
      forceCollapse: rank >= 5,
      aftershock: rank >= 5,
      cooldown: [7.5, 7.2, 7.0, 6.8, 6.5][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'earth', 1.4);
    slam(w, caster, st, C, false);
    if (st.double) {
      field(w, {
        x: caster.x, y: caster.y, life: 0.34, tag: 'quakedelay',
        done() { if (caster.alive) slam(w, caster, { ...st, radius: st.radius * 1.5, damage: st.damage * 0.6 }, C, true); },
      });
    }
    if (st.aftershock) {
      field(w, {
        x: caster.x, y: caster.y, life: 1.3, tag: 'quakedelay',
        done() { if (caster.alive) slam(w, caster, { ...st, reach: st.reach * 1.2, damage: st.damage * 0.75 }, C, true); },
      });
    }
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Thornsurge — roots erupt in a line
 * ------------------------------------------------------------------ */

function spikeRender(e, alpha, R) {
  const d = e.data;
  const g = Math.min(1, d.grow);
  const h = d.height * g;
  const x = e.x, y = d.baseY - h * 0.5;
  const wither = d.life0 > 0 ? Math.min(1, (e.life || 0) / 1.5) : 1;
  const dark = 1.0 + 0.5 * (1 - Math.min(1, d.rot));
  R.sprite({ tex: R.streak, x, y, w: 30 * g, h, rot: d.lean, r: 0.26 * dark, g: 0.34 * dark, b: 0.16 * dark, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.streak, x: x + 6, y, w: 8 * g, h: h * 0.9, rot: d.lean, r: 0.54 * dark, g: 0.66 * dark, b: 0.30 * dark, a: 0.9, layer: LAYER.ACTORS });
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.2;
    const sy = d.baseY - h * t;
    const s = (i % 2 ? 1 : -1);
    R.sprite({ tex: R.streak, x: x + s * 12 * g, y: sy, w: 7 * g, h: 30 * g, rot: s * 0.9 + d.lean, r: 0.30 * dark, g: 0.40 * dark, b: 0.18 * dark, a: 1, layer: LAYER.ACTORS });
  }
  R.sprite({ tex: R.blob, x, y: d.baseY - h * 0.55, w: 44 * g, h: h * 1.1, r: 0.30, g: 0.44, b: 0.16, a: 0.16, layer: LAYER.FX, add: true });
  if (d.grow < 1) R.light({ x, y, radius: 160, r: SCHOOL.decay.base[0], g: SCHOOL.decay.base[1], b: SCHOOL.decay.base[2], intensity: 0.8 * (1 - d.grow) });
}

function spikeUpdate(e, dt) {
  const d = e.data;
  if (d.grow < 1) {
    d.grow = Math.min(1, d.grow + dt * 6);
    const w = d.w;
    const list = enemiesIn(w, e.x, d.baseY - d.height * 0.5, 46, null, 4);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (d.hitIds.indexOf(t.id) >= 0) continue;
      d.hitIds.push(t.id);
      const applied = w.damage(t, d.damage, 'impact', dmgOpts(d.caster, t.x, t.y, 0, -1, 320, 0.2, 'root', d.rootTime, 1));
      d.report(e, t, applied, 'impact', t.material);
      impact(w, t.x, t.y, 0, -1, 'decay', 0.7, t.material);
      w.ctx.audio.sfx('spell_thornsurge_impale', { x: t.x, y: t.y });
    }
  }
}

function eruptSpike(w, caster, x, baseY, st, C) {
  // roots burst through whatever is above them on the way out
  const props = w.queryProps(x, baseY - st.height * 0.5, 60, propScratch);
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.alive) continue;
    const bonus = p.material === MATERIAL.MASONRY ? (st.crack ? 2.4 : 1) : 1;
    w.damageProp(p, st.damage * bonus, 'impact', dmgOpts(caster, x, p.bottom, 0, -1, 240));
  }
  if (st.crack) w.terrain.damage(x, baseY + 6, 20, st.damage * 0.8, 'impact');

  w.burstDebris(x, baseY - 4, matAt(w, x, baseY + 6), 5,
    { speed: 340, speedVar: 200, spread: 1.4, dir: -Math.PI / 2, size: 0.8 });
  const em = E(x, baseY - 20, 10);
  em.vx = 0; em.vy = -1; em.speed = 300; em.speedVar = 180; em.vSpread = 0.8;
  em.life = 0.7; em.lifeVar = 0.4; em.size = 14; em.sizeEnd = 2; em.gravity = 500; em.drag = 1.4;
  em.color = col(colA, 0.36, 0.44, 0.20, 0.9);
  em.color2 = col(colB, 0.18, 0.22, 0.10, 0);
  w.P.emit(em);
  w.ctx.audio.sfx('spell_thornsurge_erupt', { x, y: baseY });

  const e = w.spawn({
    kind: 'effect', x, y: baseY - st.height * 0.5, w: 26, h: st.height,
    gravity: 0, collides: false, trigger: !st.persist, gridSolid: st.persist,
    team: 0, hp: st.persist ? 60 : 1, material: MATERIAL.FOLIAGE,
    life: st.persist ? st.persistTime : 1.6, tag: 'thornspike', owner: caster,
    onUpdate: spikeUpdate, render: spikeRender,
    onDespawn(sp) {
      const d = sp.data;
      if (d.spore) {
        d.w.surfaces.pour('rot', sp.x, d.baseY - 20, 0.7, 60);
        const em2 = E(sp.x, d.baseY - 40, 14);
        em2.speed = 120; em2.life = 1.6; em2.lifeVar = 0.8; em2.size = 20; em2.sizeEnd = 46; em2.drag = 1.2; em2.gravity = -30;
        em2.color = col(colA, 0.52, 0.68, 0.30, 0.55);
        em2.color2 = col(colB, 0.20, 0.28, 0.12, 0);
        d.w.P.emit(em2);
      }
      // the root leaves broken, rooted ground behind it
      decal({
        x: sp.x, y: d.baseY - 6, w: 62, h: 16, rot: d.w.rng.range(-0.2, 0.2),
        color: [0.12, 0.14, 0.08, 0.8], life: 420, hold: 0.9, layer: LAYER.TERRAIN_FRONT,
      });
      splat(d.w.rng, sp.x, d.baseY - 4, 24, [0.16, 0.19, 0.10, 0.6], 3, { life: 420 });
    },
  });
  if (!e) return;
  const d = e.data;
  d.w = w; d.caster = caster; d.grow = 0; d.height = st.height; d.baseY = baseY;
  d.damage = st.damage; d.rootTime = st.rootTime; d.lean = w.rng.range(-0.18, 0.18);
  d.hitIds = []; d.rot = 0; d.spore = st.spore; d.life0 = st.persist ? st.persistTime : 0;
  d.report = C.report;
}

export const thornsurge = {
  id: 'thornsurge', name: 'Thornsurge', school: 'earth',
  desc: 'The wood underneath remembers being alive and objects to being walked on.',
  unlockLevel: 6, manualOnly: false, cost: 24, cooldown: 4.2, range: 620, levels: 5,
  targeting: 'ground', windup: 0.24, castSfx: 'spell_thornsurge_cast',
  rankText: [
    'Five roots erupt in a line, impaling and holding.',
    'Eight roots, over a longer line.',
    'The roots burst through masonry and crack the floor.',
    'They stay up for eight seconds as real obstacles.',
    'When they die they burst into a rotting spore cloud.',
  ],
  scale(rank) {
    return {
      damage: [20, 25, 31, 38, 47][rank - 1],
      count: [5, 8, 9, 10, 11][rank - 1],
      spacing: [78, 74, 76, 78, 80][rank - 1],
      height: [110, 120, 130, 145, 160][rank - 1],
      rootTime: [1.2, 1.5, 1.8, 2.2, 2.6][rank - 1],
      crack: rank >= 3,
      persist: rank >= 4,
      persistTime: 8,
      spore: rank >= 5,
      cooldown: [4.2, 4.0, 3.8, 3.6, 3.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'earth', 1.0);
    w.ctx.audio.sfx('spell_thornsurge_cast', { x: C.x, y: C.y });
    const dir = C.tx >= caster.x ? 1 : -1;
    const f = field(w, {
      x: C.tx, y: C.ty, life: st.count * 0.055 + 0.2, tag: 'thornline', owner: caster,
      step(e, dt) {
        const d = e.data;
        d.acc += dt;
        while (d.acc > 0.05 && d.i < st.count) {
          d.acc -= 0.05;
          const x = d.x0 + dir * d.i * st.spacing;
          const gy = w.groundY(x, d.y0 - 200, 620);
          d.i++;
          if (Number.isNaN(gy)) continue;
          eruptSpike(w, caster, x, gy, st, C);
        }
      },
    });
    if (!f) return;
    f.data.x0 = C.tx - dir * st.spacing; f.data.y0 = C.ty; f.data.i = 0; f.data.acc = 0;
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Bulwark — build terrain
 * ------------------------------------------------------------------ */

function bulwarkStep(e, dt, t01) {
  const d = e.data, w = d.w;
  if (d.built) return;
  d.rise = Math.min(1, d.rise + dt * 4);

  const em = E(e.x + w.rng.range(-d.w2, d.w2), d.baseY, 2);
  em.vx = 0; em.vy = -1; em.speed = 340; em.speedVar = 220; em.vSpread = 0.5;
  em.life = 0.7; em.lifeVar = 0.4; em.size = 20; em.sizeEnd = 50; em.gravity = 400; em.drag = 1.4;
  em.color = col(colA, 0.48, 0.42, 0.34, 0.7);
  em.color2 = col(colB, 0.22, 0.20, 0.18, 0);
  w.P.emit(em);

  if (d.rise >= 1) {
    d.built = true;
    buildWall(w, d);
  }
}

function buildWall(w, d) {
  const steps = d.steps;
  for (let s = 0; s < steps; s++) {
    const h = d.height * (1 - s * 0.28);
    const hw = d.w2 * (1 - s * 0.22);
    const cols = Math.max(2, Math.round(hw / 12));
    for (let i = 0; i <= cols; i++) {
      const x = e_lerp(-hw, hw, i / cols) + d.cx;
      for (let yy = 0; yy < h; yy += 14) {
        w.terrain.fill(x, d.baseY - yy - 8, 16, d.material);
      }
    }
  }
  if (d.smother) {
    w.surfaces.clear('fire', d.cx, d.baseY - d.height * 0.5, d.w2 * 1.4);
    w.surfaces.clear('acid', d.cx, d.baseY - d.height * 0.5, d.w2 * 1.4);
    w.surfaces.clear('oil', d.cx, d.baseY - d.height * 0.5, d.w2 * 1.4);
  }
  if (d.launch) {
    w.damageArea(d.cx, d.baseY - 20, d.w2 * 1.3, d.damage, 'impact', LAUNCHQ);
  }
  w.burstDebris(d.cx, d.baseY - 10, d.material, 12, { speed: 420, speedVar: 260, spread: 1.5, dir: -Math.PI / 2, size: 1.1 });
  shockwave(w.R, d.cx, d.baseY - d.height * 0.5, 0.8);
  shake(w.R, 0.3, 0.35);
  hitstop(w.R, 0.03);
  w.ctx.audio.sfx('spell_bulwark_raise', { x: d.cx, y: d.baseY });
  // dust settling against the new face, so it does not appear from nowhere
  splat(w.rng, d.cx, d.baseY - 6, d.w2 * 1.2, [0.34, 0.30, 0.26, 0.35], 6, { life: 40, hold: 0.3 });
  w.solveSupport();
}
function e_lerp(a, b, t) { return a + (b - a) * t; }
const LAUNCHQ = { falloff: 0.5, props: false, terrain: false, team: 1, force: 1300, stagger: 0.3 };

function bulwarkDraw(e, R, t01) {
  const d = e.data;
  if (d.built) return;
  const h = d.height * d.rise;
  R.sprite({ tex: R.white, x: d.cx, y: d.baseY - h * 0.5, w: d.w2 * 2, h, r: 0.22, g: 0.20, b: 0.19, a: 0.9, layer: LAYER.TERRAIN });
  R.sprite({ tex: R.blob, x: d.cx, y: d.baseY - h, w: d.w2 * 2.6, h: 70, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.3 * (1 - d.rise), layer: LAYER.FX, add: true });
  R.light({ x: d.cx, y: d.baseY - h * 0.6, radius: 320, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.1 * (1 - d.rise) });
}

export const bulwark = {
  id: 'bulwark', name: 'Bulwark', school: 'earth',
  desc: 'A wall. His wall. It will also be in his way later.',
  unlockLevel: 9, manualOnly: false, cost: 30, cooldown: 8.5, range: 520, levels: 5,
  targeting: 'ground', windup: 0.3, castSfx: 'spell_bulwark_cast',
  rankText: [
    'Raises a slab of earth as cover. Anyone can break it.',
    'Bigger, and made of rock rather than soil.',
    'A stepped masonry wall you can also climb.',
    'Rising, it smothers any fire or acid on the spot.',
    'It erupts — anything standing there is thrown off it.',
  ],
  scale(rank) {
    return {
      width: [120, 150, 175, 190, 210][rank - 1],
      height: [130, 160, 190, 205, 230][rank - 1],
      steps: [1, 1, 2, 2, 3][rank - 1],
      material: [MATERIAL.EARTH, MATERIAL.ROCK, MATERIAL.MASONRY, MATERIAL.MASONRY, MATERIAL.MASONRY][rank - 1],
      smother: rank >= 4,
      launch: rank >= 5,
      damage: [0, 0, 0, 0, 30][rank - 1],
      cooldown: [8.5, 8.2, 8, 7.8, 7.5][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'earth', 1.1);
    w.ctx.audio.sfx('spell_bulwark_cast', { x: C.tx, y: C.ty });
    const gy = w.groundY(C.tx, C.ty - 120, 700);
    const baseY = Number.isNaN(gy) ? C.ty : gy;
    const f = field(w, {
      x: C.tx, y: baseY, life: 0.6, tag: 'bulwark', owner: caster,
      step: bulwarkStep, draw: bulwarkDraw,
      done(e) { if (!e.data.built) buildWall(w, e.data); },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.cx = C.tx; d.baseY = baseY; d.w2 = st.width * 0.5; d.height = st.height;
    d.steps = st.steps; d.material = st.material; d.smother = st.smother;
    d.launch = st.launch; d.damage = st.damage; d.rise = 0; d.built = false;
  },
  icon: null,
};

export const EARTH_SPELLS = [stonepin, sunderquake, thornsurge, bulwark];
