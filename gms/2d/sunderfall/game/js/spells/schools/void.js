/**
 * VOID — Voidlash, Mirrorstep, Nullring.
 *
 * Void's world contract is displacement rather than destruction: it moves things
 * that were not meant to move (debris, props, whole pools of fire), and Nullring
 * is the only thing in the game that can stop the world from spreading.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { STATUS } from '../../sim/status.js';
import { SCHOOL, impact, castFlash, decal, splat, shake, hitstop, drawOrb, emitDesc as E, setColor as col, colA, colB } from '../fx.js';
import { field, dmgOpts, enemiesIn, dirTo, DIR } from '../common.js';

const S = SCHOOL.void;
const propScratch = [];

/* ------------------------------------------------------------------ *
 * Voidlash — drag everything into one pile
 * ------------------------------------------------------------------ */

function lashStep(e, dt, t01) {
  const d = e.data, w = d.w, c = d.caster;
  if (!c || !c.alive) { w.despawn(e); return; }
  // the pile forms just in front of Rook, not on top of him
  e.x = c.x + d.face * 150;
  e.y = c.y;

  let alive = 0;
  for (let i = 0; i < d.targets.length; i++) {
    const t = d.targets[i];
    if (!t || !t.alive) continue;
    alive++;
    dirTo(t.x, t.y, e.x, e.y, DIR);
    const pull = d.force * dt;
    t.vx += DIR.x * pull;
    t.vy += DIR.y * pull - 240 * dt;      // a little lift so they do not plough the floor
    if (DIR.len < 70) {
      if (d.crush && d.crushCd <= 0) {
        d.crushCd = 0.35;
        w.damageArea(e.x, e.y, 90, d.damage, 'impact', CRUSHQ);
        impact(w, e.x, e.y, 0, -1, 'void', 0.8, MATERIAL.FLESH);
        w.ctx.audio.sfx('spell_voidlash_crush', { x: e.x, y: e.y });
      }
    }
    const applied = w.damage(t, d.damage * dt, 'void', dmgOpts(c, t.x, t.y, DIR.x, DIR.y, 0, 0, 'slow', 0.4, 0.6));
    d.report(e, t, applied, 'void', t.material);
  }
  d.crushCd -= dt;

  // loose debris comes in too — a negative shove is a pull
  w.shoveDebris(e.x, e.y, d.radius, -d.force * 1.6 * dt * 60);

  if (d.pullProps) {
    d.pacc += dt;
    if (d.pacc > 0.2) {
      d.pacc = 0;
      const props = w.queryProps(e.x, e.y, d.radius, propScratch);
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive || MAT[p.material].density > 1.6) continue;
        w.damageProp(p, d.damage * 0.6, 'void', dmgOpts(c, p.x, p.y, 0, 0, 0));
      }
      // and the fluids: fire and acid are dragged off the floor into the pile
      for (let k = 0; k < FLUIDS.length; k++) {
        const kind = FLUIDS[k];
        const a = w.surfaces.amountAt(kind, e.x + d.radius * 0.7, e.y) + w.surfaces.amountAt(kind, e.x - d.radius * 0.7, e.y);
        if (a > 0.05) {
          w.surfaces.clear(kind, e.x + d.radius * 0.75, e.y, d.radius * 0.45);
          w.surfaces.clear(kind, e.x - d.radius * 0.75, e.y, d.radius * 0.45);
          w.surfaces.pour(kind, e.x, e.y, a * 0.8, 40);
        }
      }
    }
  }

  const em = E(e.x + w.rng.range(-d.radius, d.radius), e.y + w.rng.range(-d.radius * 0.6, d.radius * 0.6), 1);
  dirTo(em.x, em.y, e.x, e.y, DIR);
  em.vx = DIR.x; em.vy = DIR.y; em.speed = 520; em.vSpread = 0.2;
  em.life = 0.35; em.size = 9; em.sizeEnd = 1; em.add = true; em.glow = 0.05; em.stretch = 2.2;
  em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.8);
  em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
  w.P.emit(em);
  if (alive === 0 && t01 > 0.4) w.despawn(e);
}
const CRUSHQ = { falloff: 0.4, props: true, terrain: false, team: 1, force: 200, stagger: 0.2 };
const FLUIDS = ['fire', 'acid', 'slime', 'oil'];

function lashDraw(e, R, t01) {
  const d = e.data, c = d.caster;
  const a = t01 > 0.85 ? (1 - t01) / 0.15 : 1;
  if (c && c.alive) {
    for (let i = 0; i < d.targets.length; i++) {
      const t = d.targets[i];
      if (!t || !t.alive) continue;
      const seg = 6;
      for (let k = 0; k < seg; k++) {
        const t0 = k / seg, t1 = (k + 1) / seg;
        R.line(c.x + (t.x - c.x) * t0, c.y + (t.y - c.y) * t0,
          c.x + (t.x - c.x) * t1, c.y + (t.y - c.y) * t1,
          5 + 5 * (1 - t0), { r: S.base[0], g: S.base[1], b: S.base[2], a: 0.65 * a }, LAYER.FX, { add: true });
      }
    }
  }
  const pulse = 1 + Math.sin(t01 * 26) * 0.12;
  R.sprite({ tex: R.blob, x: e.x, y: e.y, w: d.radius * 1.6 * pulse, h: d.radius * 1.6 * pulse, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.75 * a, layer: LAYER.FX });
  drawOrb(R, e.x, e.y, 46 * pulse, S.base, 0.6 * a, 0.15);
  R.light({ x: e.x, y: e.y, radius: d.radius * 2, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.1 * a, flicker: 0.3 });
}

export const voidlash = {
  id: 'voidlash', name: 'Voidlash', school: 'void',
  desc: 'It gathers things. Rook has not asked what it does with them.',
  unlockLevel: 5, manualOnly: false, cost: 22, cooldown: 5, range: 560, levels: 5,
  targeting: 'nearest', windup: 0.2, castSfx: 'spell_voidlash_cast',
  rankText: [
    'A tether that drags one target in, and every loose brick with it.',
    'Two tethers.',
    'Three. They pile into each other and take the impact.',
    'Drags props, and hauls fire and acid off the floor into the pile.',
    'The pile implodes and leaves a hole in the world.',
  ],
  scale(rank) {
    return {
      damage: [16, 21, 27, 34, 43][rank - 1],
      targets: [1, 2, 3, 3, 4][rank - 1],
      duration: [1.2, 1.4, 1.6, 1.8, 2.0][rank - 1],
      force: [1600, 1800, 2000, 2200, 2500][rank - 1],
      radius: [180, 200, 220, 250, 280][rank - 1],
      crush: rank >= 3,
      pullProps: rank >= 4,
      implode: rank >= 5,
      cooldown: [5, 4.8, 4.6, 4.4, 4.2][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'void', 1.0);
    w.ctx.audio.sfx('spell_voidlash_cast', { x: C.x, y: C.y });
    const list = enemiesIn(w, caster.x, caster.y, this.range, caster, st.targets);
    const targets = [];
    for (let i = 0; i < list.length && i < st.targets; i++) targets.push(list[i]);
    const f = field(w, {
      x: caster.x, y: caster.y, life: st.duration, tag: 'voidlash', owner: caster,
      step: lashStep, draw: lashDraw,
      done(e) {
        const d = e.data;
        if (!d.implode) return;
        w.explode(e.x, e.y, {
          radius: 220, damage: d.damage * 2.4, type: 'void', force: 1100,
          terrain: true, terrainScale: 0.5, props: true,
          shake: 0.55, hitstop: 0.06, flash: 0.18, dust: 1, sparks: 0.6, light: 1.6,
        });
        // a hole in the world that keeps eating for a while
        w.surfaces.pour('void', e.x, e.y, 0.9, 90);
        splat(w.rng, e.x, e.y + 20, 70, [0.10, 0.05, 0.16, 0.7], 6, { life: 500, hold: 0.88 });
        w.ctx.audio.sfx('spell_voidlash_implode', { x: e.x, y: e.y });
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.targets = targets; d.damage = st.damage;
    d.force = st.force; d.radius = st.radius; d.crush = st.crush;
    d.pullProps = st.pullProps; d.implode = st.implode;
    d.face = C.dirX >= 0 ? 1 : -1; d.crushCd = 0; d.pacc = 0; d.report = C.report;
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Mirrorstep
 * ------------------------------------------------------------------ */

function decoyRender(e, alpha, R) {
  const d = e.data;
  const t = 1 - (e.life || 0) / d.fuse;
  const wob = Math.sin(t * 40) * 3 * t;
  R.sprite({ tex: R.blob, x: e.x + wob, y: e.y + 24, w: 18, h: 46, rot: 0.1, r: S.dark[0] * 2.2, g: S.dark[1] * 2.2, b: S.dark[2] * 2.0, a: 0.9, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: e.x + wob + 11, y: e.y + 24, w: 18, h: 46, rot: -0.1, r: S.dark[0] * 2.2, g: S.dark[1] * 2.2, b: S.dark[2] * 2.0, a: 0.9, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: e.x + wob, y: e.y, w: 44, h: 62, r: S.base[0] * 0.6, g: S.base[1] * 0.5, b: S.base[2] * 0.75, a: 0.95, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: e.x + wob, y: e.y - 34, w: 30, h: 34, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.6 + 0.4 * t, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: e.x + wob, y: e.y - 10, w: 130 * (0.6 + t), h: 150 * (0.6 + t), r: S.base[0], g: S.base[1], b: S.base[2], a: 0.18 + 0.5 * t * t, layer: LAYER.FX, add: true });
  R.light({ x: e.x, y: e.y, radius: 200 + 260 * t, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.7 + 1.6 * t * t, flicker: 0.2 });
}

function makeDecoy(w, caster, x, y, st, C) {
  const e = w.spawn({
    kind: 'effect', x, y, w: 40, h: 90, gravity: 0, collides: false, trigger: true,
    team: 0, life: st.fuse, tag: 'mirrordecoy', owner: caster,
    render: decoyRender,
    onDespawn(sp) {
      const d = sp.data;
      w.explode(sp.x, sp.y, {
        radius: d.radius, damage: d.damage, type: 'void', force: 800,
        terrain: d.carves, terrainScale: 0.55, props: true,
        shake: 0.36, hitstop: 0.04, flash: 0.16, dust: 0.8, sparks: 1, light: 1.4,
      });
      // void damage is ×1 or better on every material — hit them all again
      w.damageArea(sp.x, sp.y, d.radius, d.damage * 0.6, 'impact', DECOYQ);
      w.surfaces.pour('void', sp.x, sp.y, 0.5, 50);
      splat(w.rng, sp.x, sp.y + 40, 46, [0.12, 0.06, 0.18, 0.6], 4, { life: 420, hold: 0.85 });
      w.ctx.audio.sfx('spell_mirrorstep_detonate', { x: sp.x, y: sp.y });
      const em = E(sp.x, sp.y, 30);
      em.speed = 620; em.speedVar = 380; em.life = 0.5; em.lifeVar = 0.3;
      em.size = 14; em.sizeEnd = 1; em.add = true; em.glow = 0.15; em.stretch = 2; em.drag = 3;
      em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 1);
      em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
      w.P.emit(em);
    },
  });
  if (!e) return;
  e.data.fuse = st.fuse; e.data.damage = st.damage; e.data.radius = st.radius;
  e.data.carves = st.carves; e.data.taunt = st.taunt;
}

/** A void slit along the blink path: cuts props, carves terrain, leaves a scar. */
function shearPath(w, x0, y0, x1, y1, st, caster) {
  const steps = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 30));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    w.damageArea(px, py, 42, st.damage * 0.35, 'void', SHEARQ);
    w.terrain.damage(px, py, 16, st.damage * 0.4, 'void');
  }
  decal({
    x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5,
    w: 14, h: Math.hypot(x1 - x0, y1 - y0),
    rot: Math.atan2(y1 - y0, x1 - x0) + Math.PI * 0.5,
    color: [0.16, 0.06, 0.26, 0.85], life: 500, hold: 0.9, layer: LAYER.TERRAIN_FRONT, tex: w.R.streak,
  });
}
const SHEARQ = { falloff: 0, props: true, terrain: false, force: 260 };
const DECOYQ = { falloff: 1, props: true, terrain: false, force: 300 };

export const mirrorstep = {
  id: 'mirrorstep', name: 'Mirrorstep', school: 'void',
  desc: 'He leaves. Something that looks like him does not.',
  unlockLevel: 2, manualOnly: false, cost: 16, cooldown: 3.4, range: 380, levels: 5,
  targeting: 'self', windup: 0.06, castSfx: 'spell_mirrorstep_cast',
  rankText: [
    'Blink, leaving a decoy that goes off behind you.',
    'Steps further, and the decoy holds their attention.',
    'You cannot be hit mid-step, and the blast digs into the ground.',
    'Two decoys — one where you left, one where you arrive.',
    'The step itself shears the world along the line you crossed.',
  ],
  scale(rank) {
    return {
      dist: [300, 360, 400, 440, 500][rank - 1],
      damage: [30, 38, 48, 60, 74][rank - 1],
      radius: [140, 155, 170, 185, 205][rank - 1],
      fuse: [1.1, 1.1, 1.0, 1.0, 0.9][rank - 1],
      taunt: rank >= 2,
      carves: rank >= 3,
      invuln: rank >= 3 ? 0.4 : 0,
      twin: rank >= 4,
      shear: rank >= 5,
      cooldown: [3.4, 3.2, 3.0, 2.8, 2.6][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    const x0 = caster.x, y0 = caster.y;
    let dx = C.dirX, dy = C.dirY * 0.35;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;

    // walk the step out and stop short of anything solid
    let dist = st.dist;
    for (let d2 = 24; d2 <= st.dist; d2 += 16) {
      if (w.solidBox(x0 + dx * d2, y0 + dy * d2, caster.w, caster.h)) { dist = Math.max(0, d2 - 20); break; }
    }
    const x1 = x0 + dx * dist, y1 = y0 + dy * dist;

    castFlash(w, x0, y0, 'void', 1.0, dx, dy);
    w.ctx.audio.sfx('spell_mirrorstep_cast', { x: x0, y: y0 });

    makeDecoy(w, caster, x0, y0, st, C);
    caster.x = x1; caster.y = y1;
    caster.vx *= 0.3; caster.vy = Math.min(caster.vy, 0);
    if (st.invuln > 0) caster.invuln = Math.max(caster.invuln, st.invuln);
    if (st.twin) makeDecoy(w, caster, x1 + dx * 30, y1, st, C);
    if (st.shear) shearPath(w, x0, y0, x1, y1, st, caster);

    // arrival: the afterimage streak between the two points
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const em = E(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 3);
      em.speed = 90; em.life = 0.35 + t * 0.2; em.size = 26 * (1 - t * 0.5); em.sizeEnd = 2;
      em.add = true; em.glow = 0.06; em.drag = 3;
      em.color = col(colA, S.base[0], S.base[1], S.base[2], 0.7);
      em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
      w.P.emit(em);
    }
    castFlash(w, x1, y1, 'void', 0.8);
    w.R.fx.chroma(0.7, 0.22);
    w.ctx.audio.sfx('spell_mirrorstep_arrive', { x: x1, y: y1 });
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Nullring — the circle where nothing is allowed to happen
 * ------------------------------------------------------------------ */

function nullStep(e, dt, t01) {
  const d = e.data, w = d.w;

  const shots = w.queryRadius(e.x, e.y, d.radius, NULLQ, NULLBUF);
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.owner === d.caster || s.team === 0) continue;
    d.eaten++;
    const em = E(s.x, s.y, 10);
    em.speed = 140; em.life = 0.3; em.size = 8; em.sizeEnd = 1; em.add = true; em.drag = 4;
    em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.9);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
    w.despawn(s);
    w.ctx.audio.sfx('spell_nullring_eat', { x: e.x, y: e.y });
  }

  const list = enemiesIn(w, e.x, e.y, d.radius, null, 24);
  for (let i = 0; i < list.length; i++) {
    w.applyStatus(list[i], STATUS.SLOW, 0.3, d.slow);
    list[i].vx *= 1 - Math.min(0.9, d.slow * 0.5) * dt * 6;
  }

  if (d.freezes) {
    d.facc += dt;
    if (d.facc > 0.4) { d.facc = 0; w.surfaces.freeze(e.x, e.y, d.radius, 0.9); }
  }

  if (d.holds) {
    d.hacc += dt;
    if (d.hacc > 0.5) {
      d.hacc = 0;
      const props = w.queryProps(e.x, e.y, d.radius, propScratch);
      for (let i = 0; i < props.length; i++) if (props[i].alive) props[i].stable = true;
    }
  }

  if (w.rng.next() < 0.6) {
    const a = w.rng.angle();
    const em = E(e.x + Math.cos(a) * d.radius, e.y + Math.sin(a) * d.radius * 0.7, 1);
    em.vx = -Math.cos(a); em.vy = -Math.sin(a); em.speed = 40; em.vSpread = 0.3;
    em.life = 1.4; em.size = 7; em.sizeEnd = 1; em.add = true; em.drag = 0.4;
    em.color = col(colA, S.base[0], S.base[1], S.base[2], 0.6);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
  }
}
const NULLQ = { team: -1, kind: 'projectile', targetable: false, sort: false, max: 24 };
const NULLBUF = [];

function nullDraw(e, R, t01) {
  const d = e.data;
  const a = t01 < 0.08 ? t01 / 0.08 : (t01 > 0.9 ? (1 - t01) / 0.1 : 1);
  const n = 30;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + t01 * 0.8;
    const px = e.x + Math.cos(ang) * d.radius;
    const py = e.y + Math.sin(ang) * d.radius * 0.7;
    R.sprite({ tex: R.blob, x: px, y: py, w: 26, h: 26, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.5 * a, layer: LAYER.FX, add: true });
  }
  R.sprite({ tex: R.blob, x: e.x, y: e.y, w: d.radius * 2.1, h: d.radius * 1.5, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.42 * a, layer: LAYER.FX });
  // the standing-still shimmer: a second, counter-rotating ring
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 - t01 * 1.6;
    R.line(e.x + Math.cos(ang) * d.radius * 0.4, e.y + Math.sin(ang) * d.radius * 0.28,
      e.x + Math.cos(ang) * d.radius * 0.95, e.y + Math.sin(ang) * d.radius * 0.66,
      3, { r: S.hot[0], g: S.hot[1], b: S.hot[2], a: 0.28 * a }, LAYER.FX, { add: true });
  }
  R.light({ x: e.x, y: e.y, radius: d.radius * 2.2, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.85 * a, flicker: 0.1 });
}

export const nullring = {
  id: 'nullring', name: 'Nullring', school: 'void',
  desc: 'Inside the circle nothing is permitted to continue. Including him.',
  unlockLevel: 12, manualOnly: false, cost: 32, cooldown: 11, range: 600, levels: 5,
  targeting: 'ground', windup: 0.3, castSfx: 'spell_nullring_cast',
  rankText: [
    'Projectiles that enter simply stop existing. Everything inside slows.',
    'Wider, and the slow bites harder.',
    'Fire and acid inside stop spreading entirely.',
    'Nothing inside is allowed to fall down, either.',
    'It lets go all at once — everything it held is thrown back out.',
  ],
  scale(rank) {
    return {
      radius: [150, 175, 195, 215, 240][rank - 1],
      duration: [4.5, 5, 5.5, 6, 6.5][rank - 1],
      slow: [0.45, 0.6, 0.7, 0.8, 0.9][rank - 1],
      freezes: rank >= 3,
      holds: rank >= 4,
      release: rank >= 5,
      cooldown: [11, 10.6, 10.2, 9.8, 9.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'void', 1.1);
    w.ctx.audio.sfx('spell_nullring_cast', { x: C.tx, y: C.ty });
    const f = field(w, {
      x: C.tx, y: C.ty, life: st.duration, tag: 'nullring', owner: caster,
      step: nullStep, draw: nullDraw,
      done(e) {
        const d = e.data;
        if (d.release) {
          w.explode(e.x, e.y, {
            radius: d.radius * 1.2, damage: 20 + d.eaten * 12, type: 'void', force: 1200,
            terrain: false, props: true, shake: 0.5, hitstop: 0.05, flash: 0.2, light: 1.6,
          });
          w.shoveDebris(e.x, e.y, d.radius * 1.4, 1400);
          w.ctx.audio.sfx('spell_nullring_release', { x: e.x, y: e.y });
        }
        // frozen air settles as frost, and the ring stays scratched into the floor
        w.surfaces.pour('frost', e.x, e.y, 0.6, d.radius * 0.8);
        const gy = w.groundY(e.x, e.y, 400);
        const ry = Number.isNaN(gy) ? e.y : gy - 3;
        for (let i = 0; i < 18; i++) {
          const ang = (i / 18) * Math.PI * 2;
          decal({
            x: e.x + Math.cos(ang) * d.radius, y: ry + Math.sin(ang) * d.radius * 0.2,
            w: 34, h: 9, rot: ang + Math.PI * 0.5,
            color: [0.30, 0.24, 0.42, 0.55], life: 380, hold: 0.85, layer: LAYER.TERRAIN_FRONT,
          });
        }
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.radius = st.radius; d.slow = st.slow;
    d.freezes = st.freezes; d.holds = st.holds; d.release = st.release;
    d.facc = 0; d.hacc = 0; d.eaten = 0; d.report = C.report;
  },
  icon: null,
};

export const VOID_SPELLS = [voidlash, mirrorstep, nullring];
