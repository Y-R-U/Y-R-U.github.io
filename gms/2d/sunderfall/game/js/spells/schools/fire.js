/**
 * FIRE — Emberbolt, Cinderwake, Emberstorm, Pyreveil.
 *
 * Fire's world contract: it sets things alight and the fires outlive the fight.
 * Every fire spell either pours into world.surfaces('fire') or ignites a prop,
 * and every one leaves scorch and ash behind when it burns out.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { SCHOOL, impact, castFlash, decal, splat, scorch, drawOrb, drawBolt, shake, hitstop, emitDesc as E, setColor as col, colA, colB } from '../fx.js';
import { projectile, field, dmgOpts, enemiesIn, dirTo, DIR, lobVelocity, VEL } from '../common.js';
import { leaveAsh } from '../surfaces.js';

const S = SCHOOL.fire;

/* ------------------------------------------------------------------ *
 * Emberbolt
 * ------------------------------------------------------------------ */

function boltHit(e, hit, w) {
  const d = e.data;
  const dirX = e.vx, dirY = e.vy;
  const L = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / L, ny = dirY / L;

  impact(w, hit.x, hit.y, nx, ny, 'fire', d.big ? 1.0 : 0.55, hit.material);
  w.ctx.audio.sfx('spell_emberbolt_hit', { x: hit.x, y: hit.y });

  let killed = false;
  if (hit.what === 'entity') {
    const t = hit.entity;
    const applied = w.damage(t, d.dmg, 'fire', dmgOpts(e.owner, hit.x, hit.y, nx, ny, 130, 0, 'burn', 2.4 + d.rank * 0.4, 1));
    d.report(e, t, applied, 'fire', hit.material);
    killed = !t.alive || t.hp <= 0;
  } else if (hit.what === 'prop') {
    const applied = w.damageProp(hit.prop, d.dmg * 1.15, 'fire', dmgOpts(e.owner, hit.x, hit.y, nx, ny, 90));
    if (MAT[hit.prop.material].flammable > 0) w.igniteProp(hit.prop, 0.6 + d.rank * 0.14);
    d.report(e, hit.prop, applied, 'fire', hit.material);
  } else {
    w.terrain.damage(hit.x, hit.y, 14 + d.rank * 2, d.dmg * 0.5, 'fire');
  }

  // the world effect: fire takes hold where it can, and the mark stays either way
  w.surfaces.ignite(hit.x, hit.y, 34 + d.rank * 6, 0.55 + d.rank * 0.08);
  scorch(w, hit.x, hit.y, 26 + d.rank * 4, 0.5);

  if (d.splash > 0) {
    w.damageArea(hit.x, hit.y, d.splash, d.dmg * 0.45, 'fire', SPLASH);
  }

  if (d.forks > 0 && killed) forkFrom(w, e, hit.x, hit.y, d);
  if (d.pierce > 0 && hit.what === 'entity' && e.data._pierced < d.pierce) {
    d.dmg *= 0.7;
    return 'pierce';
  }
  return 'stop';
}
const SPLASH = { falloff: 1, props: true, terrain: false, debris: true, force: 160, igniteChance: 0.7 };

function forkFrom(w, e, x, y, d) {
  const list = enemiesIn(w, x, y, 340, null, 3);
  let n = 0;
  for (let i = 0; i < list.length && n < d.forks; i++) {
    const t = list[i];
    if (!t.alive) continue;
    n++;
    dirTo(x, y, t.x, t.y, DIR);
    spawnBolt(w, e.owner, x, y, DIR.x, DIR.y, {
      dmg: d.dmg * 0.55, rank: d.rank, forks: 0, splash: d.splash * 0.6, pierce: 0,
      speed: 1250, big: false, trailFire: 0, report: d.report,
    }, t);
  }
  if (n) {
    const em = E(x, y, 18);
    em.speed = 420; em.speedVar = 260; em.life = 0.4; em.lifeVar = 0.2;
    em.size = 9; em.sizeEnd = 0.5; em.add = true; em.glow = 0.2; em.drag = 3; em.stretch = 1.6;
    em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 1);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
    w.ctx.audio.sfx('spell_emberbolt_fork', { x, y });
  }
}

function boltStep(e, dt) {
  const d = e.data;
  if (!d.trailFire) return;
  d.fireAcc = (d.fireAcc || 0) + dt;
  if (d.fireAcc < 0.045) return;
  d.fireAcc = 0;
  const w = d.__w;
  const gy = w.groundY(e.x, e.y, 150);
  if (!Number.isNaN(gy)) w.surfaces.ignite(e.x, gy - 6, 24, d.trailFire);
}

function spawnBolt(w, owner, x, y, dx, dy, cfg, target) {
  const p = projectile(w, {
    x, y, vx: dx * cfg.speed, vy: dy * cfg.speed,
    school: 'fire', radius: cfg.big ? 12 : 7, life: 1.6, tag: 'emberbolt',
    owner, team: 0, len: cfg.big ? 66 : 44, wide: cfg.big ? 17 : 11,
    homing: target ? 3.5 : 0, target,
    trail: { color: [S.hot[0], S.hot[1], S.hot[2], 1], color2: [S.dark[0], S.dark[1], S.dark[2], 0], size: cfg.big ? 15 : 10, rate: 90, glow: 0.12, gravity: -60, drag: 2.2, stretch: 0.8 },
    onHit: boltHit, onStep: cfg.trailFire ? boltStep : null,
  });
  if (!p) return null;
  Object.assign(p.data, cfg);
  p.data.__w = w;
  return p;
}

export const emberbolt = {
  id: 'emberbolt', name: 'Emberbolt', school: 'fire',
  desc: 'A thrown coal. It is not much. It is what he has.',
  unlockLevel: 1, manualOnly: false, cost: 7, cooldown: 0.5, range: 720, levels: 5,
  targeting: 'aim', windup: 0.10, castSfx: 'spell_emberbolt_cast',
  rankText: [
    'A fast bolt that sets what it touches alight.',
    'The bolt bursts — a small splash of flame on impact.',
    'Forks. A kill throws two more bolts at whatever is nearest.',
    'Punches through the first thing it kills and keeps going.',
    'Lays a line of fire along its whole flight path.',
  ],
  scale(rank) {
    return {
      damage: [16, 21, 26, 33, 41][rank - 1],
      speed: [1400, 1450, 1500, 1560, 1650][rank - 1],
      cooldown: [0.50, 0.47, 0.44, 0.41, 0.38][rank - 1],
      splash: [0, 44, 52, 62, 78][rank - 1],
      forks: rank >= 3 ? 2 : 0,
      pierce: rank >= 4 ? 1 : 0,
      trailFire: rank >= 5 ? 0.62 : 0,
      big: rank >= 4,
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'fire', 0.75, C.dirX, C.dirY);
    w.ctx.audio.sfx('spell_emberbolt_cast', { x: C.x, y: C.y });
    spawnBolt(w, caster, C.x, C.y, C.dirX, C.dirY, {
      dmg: st.damage, rank: C.rank, forks: st.forks, splash: st.splash,
      pierce: st.pierce, speed: st.speed, big: st.big, trailFire: st.trailFire,
      report: C.report,
    }, null);
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Cinderwake — orbiting embers
 * ------------------------------------------------------------------ */

function cinderStep(e, dt, t01) {
  const d = e.data, w = d.w, c = d.caster;
  if (!c || !c.alive) { w.despawn(e); return; }
  e.x = c.x; e.y = c.y - 6;
  d.ang += d.spin * dt;

  const n = d.count;
  for (let i = 0; i < n; i++) {
    if (d.dead[i] > 0) { d.dead[i] -= dt; if (d.dead[i] <= 0) d.dead[i] = 0; continue; }
    const a = d.ang + (i / n) * Math.PI * 2;
    const ex = e.x + Math.cos(a) * d.radius;
    const ey = e.y + Math.sin(a) * d.radius * 0.62;
    d.px[i] = ex; d.py[i] = ey;

    // brush damage
    const list = enemiesIn(w, ex, ey, 30 + d.size, c, 4);
    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      if (d.cool[i] > 0) break;
      const applied = w.damage(t, d.dmg, 'fire', dmgOpts(c, ex, ey, Math.cos(a), Math.sin(a), 120, 0, 'burn', 3, 1));
      d.report(e, t, applied, 'fire', t.material);
      d.cool[i] = 0.28;
      impact(w, ex, ey, Math.cos(a), Math.sin(a), 'fire', 0.5, t.material);
      if (d.burst) {
        w.explode(ex, ey, { radius: 76, damage: d.dmg * 0.8, type: 'fire', force: 320, terrain: false, props: true, shake: 0.12, hitstop: 0.012, flash: 0.05, igniteChance: 0.9 });
        d.dead[i] = 1.2;
      }
      break;
    }
    if (d.cool[i] > 0) d.cool[i] -= dt;

    // world effect: anything it brushes past catches
    const props = w.queryProps(ex, ey, 34 + d.size, PROPBUF);
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (!p.alive) continue;
      if (MAT[p.material].flammable > 0) w.igniteProp(p, 0.5);
      else w.damageProp(p, d.dmg * 0.25 * dt * 60 * 0.016, 'fire', dmgOpts(c, ex, ey, 0, -1, 0));
    }

    if (d.wake) {
      d.wacc[i] += dt;
      if (d.wacc[i] > 0.07) {
        d.wacc[i] = 0;
        w.surfaces.ignite(ex, ey, 22, 0.4);
      }
    }
    const gy = w.groundY(ex, ey, 60);
    if (!Number.isNaN(gy)) w.surfaces.ignite(ex, gy - 4, 18, 0.28);

    const em = E(ex, ey, 1);
    em.life = 0.42; em.lifeVar = 0.2; em.size = d.size * 0.9; em.sizeEnd = 0.4;
    em.speed = 26; em.gravity = -120; em.drag = 2; em.add = true; em.glow = 0.1;
    em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.95);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
  }
  if (t01 > 0.86 && !d.warned) { d.warned = true; w.ctx.audio.sfx('spell_cinderwake_fade', { x: e.x, y: e.y }); }
}
const PROPBUF = [];

function cinderDraw(e, R, t01) {
  const d = e.data;
  const fade = t01 > 0.86 ? 1 - (t01 - 0.86) / 0.14 : 1;
  for (let i = 0; i < d.count; i++) {
    if (d.dead[i] > 0) continue;
    drawOrb(R, d.px[i], d.py[i], d.size * 1.5, S.base, 0.9 * fade, 0.35);
    R.light({ x: d.px[i], y: d.py[i], radius: 210, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.05 * fade, flicker: 0.4 });
  }
}

export const cinderwake = {
  id: 'cinderwake', name: 'Cinderwake', school: 'fire',
  desc: 'Coals that will not settle. They follow him around like the dog did.',
  unlockLevel: 4, manualOnly: false, cost: 22, cooldown: 6.5, range: 0, levels: 5,
  targeting: 'self', windup: 0.22, castSfx: 'spell_cinderwake_cast',
  rankText: [
    'Two embers orbit Rook and burn what they brush.',
    'Three embers, a wider orbit, and props catch alight.',
    'Four embers. They drip fire onto the ground below them.',
    'Embers detonate on contact and rekindle a moment later.',
    'A wide burning wake — the orbit itself lays a ring of fire.',
  ],
  scale(rank) {
    return {
      count: [2, 3, 4, 4, 4][rank - 1],
      damage: [9, 12, 15, 19, 24][rank - 1],
      duration: [7, 8, 9, 10, 12][rank - 1],
      radius: [88, 100, 112, 120, 190][rank - 1],
      burst: rank >= 4,
      wake: rank >= 5,
      cooldown: [6.5, 6.2, 6.0, 5.8, 5.5][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'fire', 1.0);
    w.ctx.audio.sfx('spell_cinderwake_cast', { x: C.x, y: C.y });
    const f = field(w, {
      x: caster.x, y: caster.y, life: st.duration, tag: 'cinderwake', owner: caster,
      step: cinderStep, draw: cinderDraw,
      done(e) {
        const d = e.data;
        for (let i = 0; i < d.count; i++) {
          if (d.dead[i] > 0) continue;
          w.explode(d.px[i], d.py[i], { radius: 60, damage: d.dmg * 0.6, type: 'fire', force: 180, terrain: false, props: true, shake: 0.06, hitstop: 0, flash: 0, igniteChance: 0.8 });
        }
        leaveAsh(w, e.x, e.y + 40, d.radius * 0.9, 0.35);
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.count = st.count; d.dmg = st.damage;
    d.radius = st.radius; d.size = 9; d.ang = 0; d.spin = 2.6;
    d.burst = st.burst; d.wake = st.wake; d.report = C.report; d.warned = false;
    d.px = new Float32Array(4); d.py = new Float32Array(4);
    d.cool = new Float32Array(4); d.dead = new Float32Array(4); d.wacc = new Float32Array(4);
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Emberstorm — meteors across a band
 * ------------------------------------------------------------------ */

function meteorHit(e, hit, w) {
  const d = e.data;
  w.explode(hit.x, hit.y, {
    radius: d.radius, damage: d.dmg, type: 'fire', force: 700,
    terrain: true, terrainScale: 0.6, props: true,
    shake: 0.34, hitstop: 0.03, flash: 0.12, dust: 1.3, sparks: 1.2, light: 1.4,
    igniteChance: 0.85,
  });
  // masonry and rock take a second, dedicated impact pass — the design calls
  // Emberstorm a cratering spell, and fire alone barely scratches stone
  w.damageArea(hit.x, hit.y, d.radius * 0.8, d.dmg * 0.9, 'impact', STONEPASS);
  w.surfaces.ignite(hit.x, hit.y, d.radius * 0.7, d.burning ? 0.95 : 0.6);
  scorch(w, hit.x, hit.y, d.radius * 0.75, 1, [0.07, 0.06, 0.06]);
  leaveAsh(w, hit.x, hit.y, d.radius * 0.6, 0.6);
  d.report(e, null, d.dmg, 'fire', hit.material);
  w.ctx.audio.sfx('spell_emberstorm_impact', { x: hit.x, y: hit.y });
  return 'stop';
}
const STONEPASS = { falloff: 1, props: true, terrain: false, debris: true, force: 320, team: -1 };

function dropMeteor(w, owner, x, y, tx, ty, dmg, radius, big, burning, report) {
  const p = projectile(w, {
    x, y, vx: (tx - x) * 0.6, vy: 640, gravity: 1.9,
    school: 'fire', radius: big ? 26 : 16, life: 4, tag: 'meteor',
    owner, team: 0, len: big ? 150 : 90, wide: big ? 46 : 26,
    trail: { color: [S.hot[0], S.hot[1], S.hot[2], 0.85], color2: [S.dark[0], S.dark[1], S.dark[2], 0], size: big ? 30 : 20, rate: 220, glow: 0.16, gravity: -140, drag: 1.6, stretch: 1.6 },
    onHit: meteorHit,
  });
  if (!p) return;
  p.data.dmg = dmg; p.data.radius = radius; p.data.burning = burning; p.data.report = report;
  p.data._light = big ? 2 : 1.3;
  // smoke column so a falling meteor reads before it lands
  const em = E(x, y, 8);
  em.speed = 60; em.life = 1.2; em.lifeVar = 0.6; em.size = 30; em.sizeEnd = 90;
  em.color = col(colA, 0.3, 0.26, 0.24, 0.35); em.color2 = col(colB, 0.12, 0.11, 0.12, 0);
  w.P.emit(em);
}

function stormStep(e, dt, t01) {
  const d = e.data, w = d.w;
  d.acc += dt;
  if (d.left > 0 && d.acc >= d.gap) {
    d.acc = 0; d.left--;
    const x = d.x0 + w.rng.next() * (d.x1 - d.x0);
    const gy = w.groundY(x, d.y - 900, 2400);
    const ty = Number.isNaN(gy) ? d.y : gy;
    dropMeteor(w, d.caster, x + w.rng.range(-140, 140), d.y - 1150, x, ty, d.dmg, d.radius, false, d.burning, d.report);
    w.ctx.audio.sfx('spell_emberstorm_launch', { x, y: d.y - 900 });
  }
  if (d.finale && d.left <= 0 && !d.fired && t01 > 0.72) {
    d.fired = true;
    const cx = (d.x0 + d.x1) * 0.5;
    dropMeteor(w, d.caster, cx, d.y - 1400, cx, d.y, d.dmg * 2.6, d.radius * 2.1, true, true, d.report);
    w.ctx.audio.sfx('spell_emberstorm_finale', { x: cx, y: d.y });
  }
  if (d.firestorm) {
    d.facc += dt;
    if (d.facc > 0.12) {
      d.facc = 0;
      const x = d.x0 + w.rng.next() * (d.x1 - d.x0);
      const gy = w.groundY(x, d.y - 600, 1600);
      if (!Number.isNaN(gy)) w.surfaces.ignite(x, gy - 8, 44, 0.55);
      const em = E(x, d.y - w.rng.range(200, 700), 3);
      em.speed = 220; em.vx = 0; em.vy = 1; em.vSpread = 0.5;
      em.life = 1.4; em.lifeVar = 0.6; em.size = 8; em.sizeEnd = 1;
      em.add = true; em.glow = 0.06; em.gravity = 220; em.drag = 0.6; em.stretch = 1.2;
      em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.9);
      em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
      w.P.emit(em);
    }
  }
}

function stormDraw(e, R, t01) {
  const d = e.data;
  // the sky goes wrong before anything falls — the anticipation for an area spell
  const a = Math.sin(Math.min(1, t01 * 3) * Math.PI * 0.5) * (1 - t01 * 0.5);
  const cx = (d.x0 + d.x1) * 0.5, wdt = d.x1 - d.x0;
  R.sprite({ tex: R.blob, x: cx, y: d.y - 620, w: wdt * 1.25, h: 900, r: S.dark[0], g: S.dark[1], b: S.dark[2], a: 0.30 * a, layer: LAYER.BG_NEAR, add: true });
  R.sprite({ tex: R.blob, x: cx, y: d.y - 380, w: wdt * 1.05, h: 520, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.10 * a, layer: LAYER.FX, add: true });
  R.light({ x: cx, y: d.y - 300, radius: wdt * 0.9, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.9 * a, flicker: 0.5 });
}

export const emberstorm = {
  id: 'emberstorm', name: 'Emberstorm', school: 'fire',
  desc: 'He points at the sky and something up there agrees with him.',
  unlockLevel: 10, manualOnly: false, cost: 58, cooldown: 15, range: 900, levels: 5,
  targeting: 'area', windup: 0.5, castSfx: 'spell_emberstorm_cast',
  rankText: [
    'Eight meteors fall across a wide band. They crater the ground.',
    'Twelve meteors, a wider band, heavier stone damage.',
    'Every crater is left burning.',
    'A final, much larger meteor lands in the middle of the band.',
    'The whole band becomes a firestorm for four seconds.',
  ],
  scale(rank) {
    return {
      count: [8, 12, 14, 15, 16][rank - 1],
      damage: [30, 36, 42, 50, 60][rank - 1],
      radius: [118, 128, 138, 150, 165][rank - 1],
      band: [700, 860, 940, 1020, 1120][rank - 1],
      duration: [2.4, 2.8, 3.0, 3.6, 4.6][rank - 1],
      burning: rank >= 3,
      finale: rank >= 4,
      firestorm: rank >= 5,
      cooldown: [15, 15, 14.5, 14, 13][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'fire', 1.6);
    shake(w.R, 0.24, 0.5);
    w.ctx.audio.sfx('spell_emberstorm_cast', { x: C.x, y: C.y });
    const f = field(w, {
      x: C.tx, y: C.ty, life: st.duration + 0.7, tag: 'emberstorm', owner: caster,
      step: stormStep, draw: stormDraw,
      done(e) {
        const d = e.data;
        if (d.firestorm) leaveAsh(w, (d.x0 + d.x1) * 0.5, d.y, (d.x1 - d.x0) * 0.5, 0.7);
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster;
    d.x0 = C.tx - st.band * 0.5; d.x1 = C.tx + st.band * 0.5; d.y = C.ty;
    d.left = st.count; d.gap = st.duration / st.count; d.acc = d.gap * 0.5;
    d.dmg = st.damage; d.radius = st.radius; d.burning = st.burning;
    d.finale = st.finale; d.firestorm = st.firestorm; d.facc = 0; d.fired = false;
    d.report = C.report;
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Pyreveil — a defensive ring of flame
 * ------------------------------------------------------------------ */

function veilStep(e, dt, t01) {
  const d = e.data, w = d.w, c = d.caster;
  if (c && c.alive) { e.x = c.x; e.y = c.y; }
  d.ang += 1.7 * dt;

  const list = enemiesIn(w, e.x, e.y, d.radius + 40, c, 12);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const dx = t.x - e.x, dy = (t.y - e.y) * 1.4;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dist - d.radius) > 46) continue;
    const id = t.id;
    if (d.cool.get(id) > 0) continue;
    d.cool.set(id, 0.4);
    const L = dist || 1;
    const applied = w.damage(t, d.dmg, 'fire', dmgOpts(c, t.x, t.y, dx / L, dy / L, d.knock, 0, 'burn', 3.5, 1.2));
    d.report(e, t, applied, 'fire', t.material);
    impact(w, t.x, t.y, dx / L, dy / L, 'fire', 0.65, t.material);
    w.ctx.audio.sfx('spell_pyreveil_burn', { x: t.x, y: t.y });
  }
  d.cool.tick(dt);

  // erase incoming shots at rank 4
  if (d.eats) {
    const shots = w.queryRadius(e.x, e.y, d.radius + 30, SHOTQ, SHOTBUF);
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (s.team === 0 || s.owner === c) continue;
      impact(w, s.x, s.y, 0, -1, 'fire', 0.4, 8);
      w.despawn(s);
    }
  }

  // the ring cooks the ground it sits on
  d.acc += dt;
  if (d.acc > 0.1) {
    d.acc = 0;
    for (let i = 0; i < 3; i++) {
      const a = d.ang + i * 2.09;
      const px = e.x + Math.cos(a) * d.radius;
      const gy = w.groundY(px, e.y - 40, 200);
      if (!Number.isNaN(gy)) {
        if (d.burnGround) w.surfaces.ignite(px, gy - 6, 26, 0.5);
        w.terrain.scorch(px, gy - 2, 22, 0.4);
      }
      const props = w.queryProps(px, e.y, 40, PROPBUF);
      for (let k = 0; k < props.length; k++) if (MAT[props[k].material].flammable > 0) w.igniteProp(props[k], 0.4);
    }
  }

  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = d.ang * 1.4 + (i / n) * Math.PI * 2 + w.rng.range(-0.3, 0.3);
    const px = e.x + Math.cos(a) * d.radius;
    const py = e.y + Math.sin(a) * d.radius * 0.42;
    const em = E(px, py, 1);
    em.life = 0.5; em.lifeVar = 0.25; em.size = 15; em.sizeEnd = 1;
    em.speed = 40; em.vx = 0; em.vy = -1; em.vSpread = 0.5;
    em.gravity = -240; em.drag = 1.4; em.add = true; em.glow = 0.05;
    em.color = col(colA, S.hot[0], S.hot[1], S.hot[2], 0.85);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
  }
}

function veilDraw(e, R, t01) {
  const d = e.data;
  const fade = t01 > 0.85 ? 1 - (t01 - 0.85) / 0.15 : Math.min(1, t01 * 6);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = d.ang + (i / n) * Math.PI * 2;
    const px = e.x + Math.cos(a) * d.radius;
    const py = e.y + Math.sin(a) * d.radius * 0.42;
    const h = 54 + Math.sin(a * 3 + d.ang * 5) * 20;
    R.sprite({ tex: R.streak, x: px, y: py - h * 0.4, w: 30, h, rot: 0, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.42 * fade, layer: LAYER.FX, add: true });
    R.sprite({ tex: R.blob, x: px, y: py, w: 34, h: 22, r: S.hot[0], g: S.hot[1], b: S.hot[2], a: 0.30 * fade, layer: LAYER.FX, add: true });
  }
  R.light({ x: e.x, y: e.y, radius: d.radius * 2.4, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 1.5 * fade, flicker: 0.35 });
}

/** Tiny id->timer map with no per-frame allocation. */
function cooldownMap() {
  const ids = new Int32Array(32), tm = new Float32Array(32);
  return {
    get(id) { for (let i = 0; i < 32; i++) if (ids[i] === id) return tm[i]; return 0; },
    set(id, t) {
      let free = -1;
      for (let i = 0; i < 32; i++) { if (ids[i] === id) { tm[i] = t; return; } if (tm[i] <= 0 && free < 0) free = i; }
      if (free >= 0) { ids[free] = id; tm[free] = t; }
    },
    tick(dt) { for (let i = 0; i < 32; i++) if (tm[i] > 0) tm[i] -= dt; },
  };
}
const SHOTQ = { team: -1, kind: 'projectile', targetable: false, sort: false, max: 16 };
const SHOTBUF = [];

export const pyreveil = {
  id: 'pyreveil', name: 'Pyreveil', school: 'fire',
  desc: 'A circle he can stand inside. Nothing else can.',
  unlockLevel: 8, manualOnly: false, cost: 26, cooldown: 9, range: 0, levels: 5,
  targeting: 'self', windup: 0.28, castSfx: 'spell_pyreveil_cast',
  rankText: [
    'A ring of flame. Anything crossing it burns.',
    'Wider, and it throws crossers back out.',
    'The ring scorches the ground and sets the ring alight.',
    'Enemy shots crossing the ring are burnt out of the air.',
    'When it fades it detonates outward.',
  ],
  scale(rank) {
    return {
      radius: [132, 158, 172, 186, 205][rank - 1],
      damage: [14, 18, 23, 29, 36][rank - 1],
      duration: [5, 5.5, 6, 6.5, 7][rank - 1],
      knock: [140, 260, 300, 340, 420][rank - 1],
      burnGround: rank >= 3,
      eats: rank >= 4,
      detonate: rank >= 5,
      cooldown: [9, 8.6, 8.3, 8, 7.6][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'fire', 1.2);
    w.ctx.audio.sfx('spell_pyreveil_cast', { x: C.x, y: C.y });
    const f = field(w, {
      x: caster.x, y: caster.y, life: st.duration, tag: 'pyreveil', owner: caster,
      step: veilStep, draw: veilDraw,
      done(e) {
        const d = e.data;
        // the ring's lingering trace: a burnt circle on the floor, always
        const gy = w.groundY(e.x, e.y, 300);
        const ry = Number.isNaN(gy) ? e.y + 40 : gy - 3;
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          splat(w.rng, e.x + Math.cos(a) * d.radius, ry + Math.sin(a) * d.radius * 0.18, 26, [0.09, 0.075, 0.07, 0.8], 2, { life: 300, hold: 0.9 });
        }
        if (d.detonate) {
          w.explode(e.x, e.y, {
            radius: d.radius * 1.5, damage: d.dmg * 2.2, type: 'fire', force: 900,
            terrain: true, terrainScale: 0.4, props: true,
            shake: 0.5, hitstop: 0.05, flash: 0.2, igniteChance: 1,
          });
          w.ctx.audio.sfx('spell_pyreveil_burst', { x: e.x, y: e.y });
        }
        leaveAsh(w, e.x, ry, d.radius, 0.55);
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.radius = st.radius; d.dmg = st.damage;
    d.knock = st.knock; d.burnGround = st.burnGround; d.eats = st.eats;
    d.detonate = st.detonate; d.ang = 0; d.acc = 0; d.cool = cooldownMap(); d.report = C.report;
  },
  icon: null,
};

export const FIRE_SPELLS = [emberbolt, cinderwake, emberstorm, pyreveil];
