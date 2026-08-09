/**
 * DECAY — Acid Rain, Blightbloom, Bloodtithe.
 *
 * Decay's world contract is the slowest and the most visible: acid pools, oozes
 * downhill and is still eating a bridge two minutes later; blight spreads corpse
 * to corpse and rots foliage to sticks; bloodtithe kills the plant life outright.
 * All three run on long-lived, slow-ticking fields so the cost stays flat.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { STATUS } from '../../sim/status.js';
import { SCHOOL, impact, castFlash, decal, splat, shake, hitstop, emitDesc as E, setColor as col, colA, colB, drawOrb } from '../fx.js';
import { projectile, field, dmgOpts, enemiesIn, anyIn, corpsesIn, propsOfMaterial, dirTo, DIR } from '../common.js';

const S = SCHOOL.decay;
const propScratch = [];
const listScratch = [];

/* ------------------------------------------------------------------ *
 * Acid Rain
 * ------------------------------------------------------------------ */

function dropHit(e, hit, w) {
  const d = e.data;
  w.surfaces.pour('acid', hit.x, hit.y, d.amount, d.spread);
  w.materialFx(hit.material, hit.x, hit.y, 0, -1, 0.4);
  const em = E(hit.x, hit.y, 6);
  em.vx = 0; em.vy = -1; em.speed = 150; em.speedVar = 110; em.vSpread = 1.1;
  em.life = 0.5; em.lifeVar = 0.3; em.size = 8; em.sizeEnd = 1; em.gravity = 700; em.drag = 1;
  em.add = true; em.glow = 0.03;
  em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.85);
  em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
  w.P.emit(em);
  if (hit.what === 'prop') w.damageProp(hit.prop, d.damage, 'acid', dmgOpts(e.owner, hit.x, hit.y, 0, 1, 0));
  else if (hit.what === 'entity') {
    const applied = w.damage(hit.entity, d.damage, 'acid', dmgOpts(e.owner, hit.x, hit.y, 0, 1, 0, 0, 'acid', 3, 1));
    d.report(e, hit.entity, applied, 'acid', hit.material);
  }
  w.ctx.audio.sfx('spell_acid_drip', { x: hit.x, y: hit.y });
  return 'stop';
}

function dropRender(e, alpha, R) {
  const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
  R.sprite({ tex: R.streak, x, y, w: 9, h: 34, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.9, layer: LAYER.FX, add: true });
  R.sprite({ tex: R.blob, x, y, w: 22, h: 22, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.6, layer: LAYER.FX });
}

/**
 * The caustic field: a slow tick that keeps eating masonry and timber wherever
 * acid is still lying, long after the cast. This is the "world remembers" part,
 * and it is one entity ticking five times a second, not a per-cell loop.
 */
function causticField(w, cx, cy, radius, life, strength, report) {
  const f = field(w, {
    x: cx, y: cy, life, tag: 'caustic',
    step(e, dt) {
      const d = e.data;
      d.acc += dt;
      if (d.acc < 0.25) return;
      const el = d.acc; d.acc = 0;
      const props = w.queryProps(e.x, e.y, d.radius, propScratch);
      let live = 0;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        const a = w.surfaces.amountAt('acid', p.x, p.bottom - 8);
        if (a < 0.05) continue;
        live++;
        const sol = MAT[p.material].soluble;
        if (sol <= 0) continue;
        w.damageProp(p, d.strength * sol * a * el, 'acid', dmgOpts(null, p.x, p.bottom - 8, 0, -1, 0));
        if (w.rng.next() < 0.25 * a) {
          const em = E(p.x + w.rng.range(-p.w * 0.4, p.w * 0.4), p.bottom - w.rng.range(0, p.h * 0.6), 1);
          em.vx = 0; em.vy = 1; em.speed = 40; em.vSpread = 0.4;
          em.life = 1.1; em.lifeVar = 0.5; em.size = 6; em.sizeEnd = 2; em.gravity = 260; em.drag = 0.6;
          em.add = true; em.glow = 0.02;
          em.color = col(colA, S.base[0], S.base[1], S.base[2], 0.8);
          em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
          w.P.emit(em);
        }
      }
      if (live === 0 && w.surfaces.amountAt('acid', e.x, e.y) < 0.02) d.idle += el;
      else d.idle = 0;
      if (d.idle > 12) w.despawn(e);      // nothing left to eat: stop paying for it
    },
  });
  if (f) { f.data.radius = radius; f.data.strength = strength; f.data.acc = 0; f.data.idle = 0; }
}

function rainStep(e, dt, t01) {
  const d = e.data, w = d.w;
  d.acc += dt;
  const gap = 1 / d.rate;
  let guard = 0;
  while (d.acc > gap && d.left > 0 && guard++ < 8) {
    d.acc -= gap;
    d.left--;
    const x = d.x0 + w.rng.next() * (d.x1 - d.x0);
    const p = projectile(w, {
      x, y: d.y - 620 - w.rng.range(0, 120), vx: w.rng.range(-30, 30), vy: 520, gravity: 1.4,
      school: 'decay', radius: 7, life: 4, tag: 'aciddrop', owner: d.caster, team: 0,
      render: dropRender, onHit: dropHit,
      trail: { color: [S.base[0], S.base[1], S.base[2], 0.5], color2: [S.dark[0], S.dark[1], S.dark[2], 0], size: 6, rate: 26, add: true, drag: 0.6 },
    });
    if (p) {
      p.data.amount = d.amount; p.data.spread = d.spread;
      p.data.damage = d.damage; p.data.report = d.report;
      p.data._light = 0.25;
    }
  }
  if (w.rng.next() < 0.6) {
    const x = d.x0 + w.rng.next() * (d.x1 - d.x0);
    const em = E(x, d.y - w.rng.range(100, 620), 1);
    em.vx = 0; em.vy = 1; em.speed = 400; em.vSpread = 0.1;
    em.life = 0.9; em.size = 5; em.sizeEnd = 1; em.stretch = 2.4; em.add = true;
    em.color = col(colA, S.base[0], S.base[1], S.base[2], 0.5);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
  }
}

function rainDraw(e, R, t01) {
  const d = e.data;
  const a = t01 < 0.15 ? t01 / 0.15 : (t01 > 0.85 ? (1 - t01) / 0.15 : 1);
  const cx = (d.x0 + d.x1) * 0.5, wd = d.x1 - d.x0;
  R.sprite({ tex: R.blob, x: cx, y: d.y - 560, w: wd * 1.2, h: 320, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.55 * a, layer: LAYER.FX });
  R.sprite({ tex: R.blob, x: cx, y: d.y - 520, w: wd, h: 200, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.10 * a, layer: LAYER.FX, add: true });
  R.light({ x: cx, y: d.y - 400, radius: wd * 0.8, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.55 * a, flicker: 0.2 });
}

export const acidrain = {
  id: 'acidrain', name: 'Acid Rain', school: 'decay',
  desc: 'It falls slowly, it lands quietly, and it is still there tomorrow.',
  unlockLevel: 11, manualOnly: false, cost: 50, cooldown: 14, range: 800, levels: 5,
  targeting: 'area', windup: 0.45, castSfx: 'spell_acidrain_cast',
  rankText: [
    'Acid drips over a band, pools, and oozes downhill.',
    'Falls longer and heavier, over a wider band.',
    'The pools are deep enough to keep eating stone for a minute.',
    'Corrodes what it touches — armour stops helping.',
    'Leaves a caustic bog. That ground is ruined for good.',
  ],
  scale(rank) {
    return {
      damage: [9, 12, 15, 19, 24][rank - 1],
      duration: [3.4, 4.2, 5.0, 5.6, 6.4][rank - 1],
      band: [500, 600, 680, 740, 820][rank - 1],
      rate: [14, 18, 22, 26, 32][rank - 1],
      amount: [0.55, 0.68, 0.85, 0.95, 1.0][rank - 1],
      spread: [26, 30, 34, 38, 44][rank - 1],
      bogTime: [26, 45, 80, 120, 240][rank - 1],
      corrode: rank >= 4,
      permanent: rank >= 5,
      cooldown: [14, 13.6, 13.2, 12.8, 12.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'decay', 1.3);
    w.ctx.audio.sfx('spell_acidrain_cast', { x: C.tx, y: C.ty });
    const f = field(w, {
      x: C.tx, y: C.ty, life: st.duration, tag: 'acidrain', owner: caster,
      step: rainStep, draw: rainDraw,
      done(e) {
        const d = e.data;
        causticField(w, e.x, d.y, (d.x1 - d.x0) * 0.7, d.bogTime, d.damage * 0.14, d.report);
        if (d.corrode) {
          const list = enemiesIn(w, e.x, d.y, (d.x1 - d.x0) * 0.6, null, 24);
          for (let i = 0; i < list.length; i++) w.applyStatus(list[i], STATUS.CORRODE, 10, 1);
        }
        // the stain. permanent at rank 5 — you can find where you cast this
        const gy = w.groundY(e.x, d.y - 200, 800);
        const sy = Number.isNaN(gy) ? d.y : gy - 3;
        const n = Math.round((d.x1 - d.x0) / 70);
        for (let i = 0; i < n; i++) {
          const x = d.x0 + (i / n) * (d.x1 - d.x0) + w.rng.range(-20, 20);
          const g2 = w.groundY(x, d.y - 200, 800);
          splat(w.rng, x, Number.isNaN(g2) ? sy : g2 - 3, 44,
            [0.30, 0.42, 0.16, d.permanent ? 0.65 : 0.45], 3,
            { life: d.permanent ? 900 : 220, hold: 0.9 });
        }
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster;
    d.x0 = C.tx - st.band * 0.5; d.x1 = C.tx + st.band * 0.5; d.y = C.ty;
    d.rate = st.rate; d.left = Math.round(st.rate * st.duration); d.acc = 0;
    d.amount = st.amount; d.spread = st.spread; d.damage = st.damage;
    d.bogTime = st.bogTime; d.corrode = st.corrode; d.permanent = st.permanent;
    d.report = C.report;
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Blightbloom
 * ------------------------------------------------------------------ */

function bloomStep(e, dt, t01) {
  const d = e.data, w = d.w;
  d.acc += dt;
  if (d.acc < 0.2) { bloomMotes(w, e, d, dt); return; }
  const el = d.acc; d.acc = 0;

  const list = enemiesIn(w, e.x, e.y, d.radius, null, 16);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const applied = w.damage(t, d.damage * el, 'decay', dmgOpts(d.caster, t.x, t.y, 0, 0, 0, 0, 'slow', 0.6, 0.5));
    d.report(e, t, applied, 'decay', t.material);
    if (t.hp <= 0 || !t.alive) d.pending.push(t.x, t.y);
  }

  // rot the greenery: brittle first, then it simply falls apart
  const props = w.queryProps(e.x, e.y, d.radius, propScratch);
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.alive) continue;
    const m = p.material;
    if (m !== MATERIAL.FOLIAGE && !(d.rotsTimber && m === MATERIAL.TIMBER)) continue;
    w.damageProp(p, d.damage * el * (m === MATERIAL.FOLIAGE ? 2.4 : 1.1), 'decay', dmgOpts(d.caster, p.x, p.y, 0, 0, 0));
    if (p.alive) {
      p.tint = ROT_TINT;
      if (d.crumble && p.hp < p.maxHp * 0.45) w.breakProp(p, 'decay');
    }
  }
  w.surfaces.pour('rot', e.x, e.y, 0.35 * el, d.radius * 0.7);
  bloomMotes(w, e, d, dt);
}
const ROT_TINT = [0.55, 0.48, 0.30];

function bloomMotes(w, e, d, dt) {
  if (w.rng.next() > 0.55) return;
  const a = w.rng.angle(), r = Math.sqrt(w.rng.next()) * d.radius;
  const em = E(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.7, 1);
  em.speed = 24; em.life = 1.6; em.lifeVar = 0.9; em.size = 20; em.sizeVar = 12; em.sizeEnd = 48;
  em.gravity = -14; em.drag = 1.1; em.fadeIn = 0.25;
  em.color = col(colA, S.dark[0] + 0.16, S.dark[1] + 0.22, S.dark[2] + 0.08, 0.34);
  em.color2 = col(colB, 0.12, 0.16, 0.08, 0);
  w.P.emit(em);
}

function bloomDraw(e, R, t01) {
  const d = e.data;
  const a = (t01 < 0.12 ? t01 / 0.12 : (t01 > 0.8 ? (1 - t01) / 0.2 : 1));
  for (let i = 0; i < 7; i++) {
    const ang = i * 0.9 + t01 * 1.4;
    const puff = 0.6 + 0.4 * Math.sin(i * 2.1 + t01 * 5);
    R.sprite({
      tex: R.blob, x: e.x + Math.cos(ang) * d.radius * 0.38, y: e.y + Math.sin(ang) * d.radius * 0.24,
      w: d.radius * 1.9 * puff, h: d.radius * 1.4 * puff, rot: ang,
      r: 0.26, g: 0.36, b: 0.14, a: 0.44 * a, layer: LAYER.FX,
    });
  }
  R.sprite({ tex: R.blob, x: e.x, y: e.y, w: d.radius * 2.4, h: d.radius * 1.7,
    r: S.base[0], g: S.base[1], b: S.base[2], a: 0.10 * a, layer: LAYER.FX, add: true });
  R.light({ x: e.x, y: e.y, radius: d.radius * 2, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.45 * a, flicker: 0.15 });
}

function bloom(w, caster, x, y, st, C, gen) {
  const f = field(w, {
    x, y, life: st.duration, tag: 'blightbloom', owner: caster,
    step: bloomStep, draw: bloomDraw,
    done(e) {
      const d = e.data;
      // spread corpse to corpse: every kill inside becomes the next bloom
      if (d.spreads && d.gen < 3) {
        const p = d.pending;
        for (let i = 0; i < p.length && i < 6; i += 2) bloom(w, caster, p[i], p[i + 1], st, C, d.gen + 1);
        const bodies = corpsesIn(w, e.x, e.y, d.radius, listScratch);
        for (let i = 0; i < bodies.length && i < 2; i++) bloom(w, caster, bodies[i].x, bodies[i].y, st, C, d.gen + 1);
      }
      if (d.reseed && d.gen === 0) {
        field(w, { x: e.x, y: e.y, life: 6, tag: 'blightseed', done() { bloom(w, caster, e.x, e.y, st, C, 1); } });
      }
      w.surfaces.pour('rot', e.x, e.y, 0.5, d.radius * 0.6);
      splat(w.rng, e.x, e.y + 30, d.radius * 0.6, [0.20, 0.26, 0.12, 0.5], 5, { life: 300, hold: 0.85 });
    },
  });
  if (!f) return;
  const d = f.data;
  d.w = w; d.caster = caster; d.radius = st.radius; d.damage = st.damage;
  d.acc = 0; d.pending = []; d.spreads = st.spreads; d.crumble = st.crumble;
  d.rotsTimber = st.rotsTimber; d.reseed = st.reseed; d.gen = gen; d.report = C.report;
  w.ctx.audio.sfx('spell_blightbloom_burst', { x, y });
}

export const blightbloom = {
  id: 'blightbloom', name: 'Blightbloom', school: 'decay',
  desc: 'Something opens. The air goes wrong and stays wrong.',
  unlockLevel: 8, manualOnly: false, cost: 26, cooldown: 6, range: 520, levels: 5,
  targeting: 'nearest', windup: 0.26, castSfx: 'spell_blightbloom_cast',
  rankText: [
    'A spore cloud. It rots the greenery to brittle sticks.',
    'Wider and longer-lived.',
    'Spreads corpse to corpse — every kill inside it blooms again.',
    'Rotted foliage crumbles outright, and timber starts to go too.',
    'The ground stays infected and blooms a second time on its own.',
  ],
  scale(rank) {
    return {
      damage: [14, 18, 23, 29, 36][rank - 1],
      radius: [120, 140, 158, 175, 195][rank - 1],
      duration: [4, 5, 6, 6.5, 7][rank - 1],
      spreads: rank >= 3,
      crumble: rank >= 4,
      rotsTimber: rank >= 4,
      reseed: rank >= 5,
      cooldown: [6, 5.8, 5.6, 5.4, 5.2][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'decay', 0.9, C.dirX, C.dirY);
    w.ctx.audio.sfx('spell_blightbloom_cast', { x: C.x, y: C.y });
    bloom(w, caster, C.tx, C.ty, st, C, 0);
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Bloodtithe
 * ------------------------------------------------------------------ */

function titheStep(e, dt, t01) {
  const d = e.data, w = d.w, c = d.caster;
  if (!c || !c.alive) { w.despawn(e); return; }
  e.x = c.x; e.y = c.y;

  let healed = 0;
  for (let i = 0; i < d.targets.length; i++) {
    const t = d.targets[i];
    if (!t || !t.alive) continue;
    const applied = w.damage(t, d.damage * dt, 'decay', dmgOpts(c, t.x, t.y, 0, 0, 0));
    d.report(e, t, applied, 'decay', t.material);
    healed += applied * d.leech;
    // motes running back up the tether
    if (w.rng.next() < 0.5) {
      const k = w.rng.next();
      const em = E(t.x + (c.x - t.x) * k, t.y + (c.y - t.y) * k, 1);
      dirTo(t.x, t.y, c.x, c.y, DIR);
      em.vx = DIR.x; em.vy = DIR.y; em.speed = 420; em.vSpread = 0.25;
      em.life = 0.35; em.size = 7; em.sizeEnd = 1; em.add = true; em.glow = 0.04; em.stretch = 1.8;
      em.color = col(colA, SCHOOL.life.base[0], SCHOOL.life.base[1], SCHOOL.life.base[2], 0.9);
      em.color2 = col(colB, SCHOOL.life.dark[0], SCHOOL.life.dark[1], SCHOOL.life.dark[2], 0);
      w.P.emit(em);
    }
  }
  if (healed > 0) {
    const before = c.hp;
    w.damage(c, healed, 'life', dmgOpts(c, c.x, c.y, 0, 0, 0));
    const spill = healed - (c.hp - before);
    if (d.shield && spill > 0.5) w.applyStatus(c, STATUS.SHIELD, 4, Math.min(3, spill * 0.1));
  }

  // wither the plant life. slow tick — this is a two-second effect, not a frame one
  d.acc += dt;
  if (d.acc > 0.35) {
    const el = d.acc; d.acc = 0;
    const plants = propsOfMaterial(w, c.x, c.y, d.witherR, MATERIAL.FOLIAGE, listScratch);
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      w.damageProp(p, (d.killPlants ? 40 : 12) * el, 'decay', dmgOpts(c, p.x, p.y, 0, 0, 0));
      if (p.alive) p.tint = WITHER_TINT;
    }
    if (d.killPlants) {
      const gy = w.groundY(c.x, c.y, 300);
      if (!Number.isNaN(gy)) splat(w.rng, c.x + w.rng.range(-d.witherR, d.witherR), gy - 3, 40, [0.19, 0.15, 0.10, 0.4], 2, { life: 600, hold: 0.92 });
    }
  }
}
const WITHER_TINT = [0.62, 0.50, 0.34];

function titheDraw(e, R, t01) {
  const d = e.data, c = d.caster;
  if (!c || !c.alive) return;
  const a = 1 - t01 * 0.3;
  for (let i = 0; i < d.targets.length; i++) {
    const t = d.targets[i];
    if (!t || !t.alive) continue;
    const seg = 7;
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg, t1 = (k + 1) / seg;
      const bow = Math.sin(t0 * Math.PI) * 26 * Math.sin(t01 * 14 + i);
      const bow2 = Math.sin(t1 * Math.PI) * 26 * Math.sin(t01 * 14 + i);
      R.line(c.x + (t.x - c.x) * t0, c.y + (t.y - c.y) * t0 + bow,
        c.x + (t.x - c.x) * t1, c.y + (t.y - c.y) * t1 + bow2,
        7, { r: SCHOOL.life.base[0], g: SCHOOL.life.base[1], b: SCHOOL.life.base[2], a: 0.75 * a }, LAYER.FX, { add: true });
    }
    drawOrb(R, t.x, t.y, 22, SCHOOL.life.base, 0.55 * a, 0.2);
  }
  R.light({ x: c.x, y: c.y, radius: 260, r: SCHOOL.life.base[0], g: SCHOOL.life.base[1], b: SCHOOL.life.base[2], intensity: 1.1 * a, flicker: 0.25 });
}

export const bloodtithe = {
  id: 'bloodtithe', name: 'Bloodtithe', school: 'decay',
  desc: 'Taking is easier than asking. He has noticed this about himself.',
  unlockLevel: 4, manualOnly: false, cost: 18, cooldown: 3.2, range: 420, levels: 5,
  targeting: 'nearest', windup: 0.18, castSfx: 'spell_bloodtithe_cast',
  rankText: [
    'A tether that drinks. The grass around him dies.',
    'Drinks harder, from two at once.',
    'Kills the plant life outright. That ground stays dead.',
    'Healing past full becomes a shield.',
    'Three tethers, and a kill bursts into a healing bloom.',
  ],
  scale(rank) {
    return {
      damage: [26, 34, 43, 54, 68][rank - 1],
      duration: [1.4, 1.6, 1.8, 2.0, 2.2][rank - 1],
      leech: [0.4, 0.45, 0.5, 0.55, 0.6][rank - 1],
      targets: [1, 2, 2, 3, 3][rank - 1],
      witherR: [140, 165, 190, 210, 240][rank - 1],
      killPlants: rank >= 3,
      shield: rank >= 4,
      burst: rank >= 5,
      cooldown: [3.2, 3.1, 3.0, 2.9, 2.8][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'life', 0.8);
    w.ctx.audio.sfx('spell_bloodtithe_cast', { x: C.x, y: C.y });
    const list = enemiesIn(w, caster.x, caster.y, this.range, caster, st.targets);
    if (!list.length) return;
    const targets = [];
    for (let i = 0; i < list.length && i < st.targets; i++) targets.push(list[i]);
    const f = field(w, {
      x: caster.x, y: caster.y, life: st.duration, tag: 'bloodtithe', owner: caster,
      step: titheStep, draw: titheDraw,
      done(e) {
        const d = e.data;
        if (!d.burst) return;
        for (let i = 0; i < d.targets.length; i++) {
          const t = d.targets[i];
          if (t && !t.alive) {
            w.explode(t.x, t.y, { radius: 130, damage: d.damage * 0.5, type: 'decay', force: 240, terrain: false, props: true, shake: 0.1, hitstop: 0, flash: 0.06 });
            w.damage(caster, 12, 'life', dmgOpts(caster, caster.x, caster.y, 0, 0, 0));
          }
        }
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.targets = targets; d.damage = st.damage;
    d.leech = st.leech; d.witherR = st.witherR; d.killPlants = st.killPlants;
    d.shield = st.shield; d.burst = st.burst; d.acc = 0; d.report = C.report;
  },
  icon: null,
};

export const DECAY_SPELLS = [acidrain, blightbloom, bloodtithe];
