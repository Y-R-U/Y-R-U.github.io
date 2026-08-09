/**
 * STORM — Sparklash, Stormcall, Galewrench.
 *
 * Storm's world contract: it is the school that treats the level's materials as
 * a circuit. Glass shatters on contact, metal rings and conducts the arc onward,
 * timber splinters and catches, and Galewrench physically re-aims every fire on
 * the screen by driving world.surfaces.wind.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';
import { SCHOOL, impact, castFlash, decal, splat, scorch, drawOrb, jagged, drawJagged, boltPts, shake, hitstop, emitDesc as E, setColor as col, colA, colB } from '../fx.js';
import { field, dmgOpts, enemiesIn, dirTo, DIR, matAt } from '../common.js';
import { leaveAsh } from '../surfaces.js';

const S = SCHOOL.storm;

/* ------------------------------------------------------------------ *
 * Sparklash — chain lightning through flesh, metal and glass
 * ------------------------------------------------------------------ */

const chainBuf = [];
const propScratch = [];

/** Break every pane of glass and ring every bit of metal on a segment. */
function conductSegment(w, x0, y0, x1, y1, dmg, src, conductProps, out) {
  const steps = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 40));
  let jumped = null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    const props = w.queryProps(px, py, 54, propScratch);
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (!p.alive) continue;
      if (p.material === MATERIAL.GLASS) {
        w.breakProp(p, 'lightning');                      // instant, always
        w.ctx.audio.sfx('glass_break', { x: p.x, y: p.y });
      } else if (p.material === MATERIAL.METAL) {
        w.damageProp(p, dmg * 0.6, 'lightning', dmgOpts(src, px, py, 0, -1, 0));
        w.materialFx(MATERIAL.METAL, p.x, p.y, 0, -1, 1.2);
        w.ctx.audio.sfx('metal_ring', { x: p.x, y: p.y });
        if (conductProps && !jumped) jumped = p;
      } else if (MAT[p.material].conducts > 0.3) {
        w.damageProp(p, dmg * 0.4, 'lightning', dmgOpts(src, px, py, 0, -1, 0));
      }
    }
    const gy = w.groundY(px, py, 90);
    if (!Number.isNaN(gy) && w.rng.next() < 0.25) w.terrain.scorch(px, gy - 2, 14, 0.3);
  }
  return jumped;
}

function sparkDraw(e, R, t01) {
  const d = e.data;
  const a = (1 - t01) * (1 - t01);
  const pts = d.pts, n = d.n;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
    const segs = jagged(d.rng, x0, y0, x1, y1, 8, 22 * (0.4 + a));
    drawJagged(R, segs, S.hot, 0.95 * a, 7);
    drawJagged(R, segs, S.base, 0.55 * a, 20);
    R.light({ x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5, radius: 300, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 2.2 * a, flicker: 0.6 });
  }
  for (let i = 1; i < n; i++) drawOrb(R, pts[i * 2], pts[i * 2 + 1], 26 * a + 6, S.hot, a, 0.2);
}

export const sparklash = {
  id: 'sparklash', name: 'Sparklash', school: 'storm',
  desc: 'It picks its own targets. He has stopped arguing with it.',
  unlockLevel: 2, manualOnly: false, cost: 14, cooldown: 1.15, range: 560, levels: 5,
  targeting: 'nearest', windup: 0.12, castSfx: 'spell_sparklash_cast',
  rankText: [
    'Chains to three targets. Glass in the way simply ceases.',
    'Four targets, and it reaches further between them.',
    'Five targets, and the arc will jump through iron to find them.',
    'Six targets, each one briefly stunned.',
    'The last target detonates and leaves fused glass in the ground.',
  ],
  scale(rank) {
    return {
      damage: [22, 27, 33, 40, 49][rank - 1],
      chains: [3, 4, 5, 6, 6][rank - 1],
      jump: [260, 300, 330, 360, 400][rank - 1],
      cooldown: [1.15, 1.08, 1.0, 0.94, 0.88][rank - 1],
      conductProps: rank >= 3,
      stun: rank >= 4 ? 0.35 : 0,
      burst: rank >= 5,
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'storm', 0.9);
    w.ctx.audio.sfx('spell_sparklash_cast', { x: C.x, y: C.y });

    const pts = SPARK_PTS;
    pts[0] = C.x; pts[1] = C.y;
    let n = 1;
    let cx = C.x, cy = C.y;
    let dmg = st.damage;
    chainBuf.length = 0;

    for (let i = 0; i < st.chains; i++) {
      const list = enemiesIn(w, cx, cy, i === 0 ? this.range : st.jump, caster, 12);
      let next = null;
      for (let k = 0; k < list.length; k++) {
        if (chainBuf.indexOf(list[k]) < 0) { next = list[k]; break; }
      }
      if (!next) break;
      chainBuf.push(next);
      const via = conductSegment(w, cx, cy, next.x, next.y, dmg, caster, st.conductProps);
      if (via) { pts[n * 2] = via.x; pts[n * 2 + 1] = via.y; n++; }
      pts[n * 2] = next.x; pts[n * 2 + 1] = next.y; n++;

      dirTo(cx, cy, next.x, next.y, DIR);
      const applied = w.damage(next, dmg, 'lightning',
        dmgOpts(caster, next.x, next.y, DIR.x, DIR.y, 180, st.stun, st.stun ? 'stun' : null, st.stun, 1));
      C.report(caster, next, applied, 'lightning', next.material);
      impact(w, next.x, next.y, DIR.x, DIR.y, 'storm', 0.8, next.material);
      w.ctx.audio.sfx('spell_sparklash_hit', { x: next.x, y: next.y });

      cx = next.x; cy = next.y;
      dmg *= 0.86;
    }

    // no enemies at all — the arc still goes somewhere and still breaks glass
    if (n === 1) {
      const ex = C.x + C.dirX * this.range, ey = C.y + C.dirY * this.range;
      conductSegment(w, C.x, C.y, ex, ey, st.damage, caster, false);
      w.damageArea(ex, ey, 70, st.damage * 0.7, 'lightning', ARCAREA);
      pts[2] = ex; pts[3] = ey; n = 2;
    }

    if (st.burst) {
      w.explode(cx, cy, {
        radius: 170, damage: st.damage * 1.1, type: 'lightning', force: 520,
        terrain: false, props: true, shake: 0.3, hitstop: 0.035, flash: 0.16,
      });
      // fulgurite: sand fused to glass where the bolt earthed itself
      const gy = w.groundY(cx, cy, 320);
      if (!Number.isNaN(gy)) {
        splat(w.rng, cx, gy - 3, 46, [0.62, 0.78, 0.92, 0.55], 5, { life: 400, hold: 0.9, add: true, glow: 0.15 });
        w.terrain.scorch(cx, gy - 2, 40, 0.6);
      }
      w.ctx.audio.sfx('spell_sparklash_burst', { x: cx, y: cy });
    }

    hitstop(w.R, 0.022);
    shake(w.R, 0.14, 0.22);
    w.R.fx.flash(S.base[0], S.base[1], S.base[2], 0.07, 0.07);
    w.R.fx.chroma(0.5, 0.2);

    const f = field(w, { x: C.x, y: C.y, life: 0.3, tag: 'sparklash', owner: caster, draw: sparkDraw });
    if (!f) return;
    f.data.pts = pts.slice(0, n * 2);
    f.data.n = n;
    f.data.rng = w.rng;
  },
  icon: null,
};
const SPARK_PTS = new Float32Array(32);
const ARCAREA = { falloff: 1, props: true, terrain: false, force: 220 };

/* ------------------------------------------------------------------ *
 * Stormcall — a standing cell that strikes on a timer
 * ------------------------------------------------------------------ */

function strike(w, d, x) {
  const gy = w.groundY(x, d.y - 500, 1600);
  const ty = Number.isNaN(gy) ? d.y : gy;
  const n = jagged(w.rng, x + w.rng.range(-40, 40), d.y - d.height, x, ty, 12, 46);
  // stash the drawn bolt so the render pass can show it for a few frames
  const store = d.flash;
  store.set(boltPts.subarray(0, (n + 1) * 2));
  d.flashN = n;
  d.flashT = 0.2;

  w.damageArea(x, ty - 30, d.radius, d.damage, 'lightning', STRIKEQ);
  const props = w.queryProps(x, ty - 40, d.radius, propScratch);
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.alive) continue;
    const bonus = p.material === MATERIAL.TIMBER ? 2.2 : 1;
    w.damageProp(p, d.damage * bonus, 'lightning', dmgOpts(d.caster, p.x, p.y, 0, 1, 220));
    if (d.ignites && MAT[p.material].flammable > 0) w.igniteProp(p, 0.8);
    if (p.material === MATERIAL.GLASS) w.breakProp(p, 'lightning');
  }
  if (d.ignites) w.surfaces.ignite(x, ty - 8, 40, 0.6);
  w.terrain.damage(x, ty, 26, d.damage * 0.5, 'lightning');
  scorch(w, x, ty - 6, 40, 0.7, [0.09, 0.09, 0.11]);

  impact(w, x, ty - 20, 0, -1, 'storm', 1.25, matAt(w, x, ty + 4));
  w.ctx.audio.sfx('spell_stormcall_strike', { x, y: ty });

  if (d.chain) {
    const list = enemiesIn(w, x, ty - 40, 300, null, 2);
    if (list.length) {
      const t = list[0];
      w.damage(t, d.damage * 0.6, 'lightning', dmgOpts(d.caster, t.x, t.y, 0, -1, 120));
      d.chainX = t.x; d.chainY = t.y; d.chainT = 0.18;
    }
  }
  d.report(null, null, d.damage, 'lightning', MATERIAL.EARTH);
}
const STRIKEQ = { falloff: 1, props: false, terrain: false, team: 1, force: 300, stagger: 0.15 };

function cellStep(e, dt, t01) {
  const d = e.data, w = d.w;
  if (d.drift) {
    const t = w.nearestEnemy(e.x, e.y, 900);
    if (t) e.x += Math.sign(t.x - e.x) * 120 * dt;
  }
  d.flashT -= dt; d.chainT -= dt;
  d.acc += dt;
  if (d.acc >= d.gap) {
    d.acc = 0;
    strike(w, d, e.x + w.rng.range(-d.spread, d.spread));
  }
  // charge motes drifting up into the cell
  if (w.rng.next() < 0.5) {
    const em = E(e.x + w.rng.range(-d.spread, d.spread), e.y + w.rng.range(-40, 60), 1);
    em.vx = 0; em.vy = -1; em.speed = 180; em.vSpread = 0.5;
    em.life = 0.5; em.size = 6; em.sizeEnd = 1; em.add = true; em.glow = 0.05; em.stretch = 1.6;
    em.color = col(colA, S.base[0], S.base[1], S.base[2], 0.8);
    em.color2 = col(colB, S.dark[0], S.dark[1], S.dark[2], 0);
    w.P.emit(em);
  }
}

function cellDraw(e, R, t01) {
  const d = e.data;
  const a = t01 < 0.1 ? t01 / 0.1 : (t01 > 0.9 ? (1 - t01) / 0.1 : 1);
  const cy = e.y - d.height;
  for (let i = 0; i < 9; i++) {
    const px = e.x + Math.sin(i * 2.3 + d.acc) * d.spread * 0.95;
    const py = cy + Math.cos(i * 1.7) * 26;
    const lit = 0.5 + 0.5 * Math.cos(i * 1.7);        // moonlit tops, dark bellies
    R.sprite({ tex: R.blob, x: px, y: py, w: d.spread * 1.5, h: 130, r: 0.34 * lit + 0.12, g: 0.38 * lit + 0.14, b: 0.52 * lit + 0.20, a: 0.95 * a, layer: LAYER.ACTORS_BACK });
  }
  R.sprite({ tex: R.blob, x: e.x, y: cy + 34, w: d.spread * 3.0, h: 120, r: 0.07, g: 0.08, b: 0.13, a: 0.9 * a, layer: LAYER.ACTORS_BACK });
  R.sprite({ tex: R.blob, x: e.x, y: cy, w: d.spread * 3.6, h: 190, r: S.base[0], g: S.base[1], b: S.base[2], a: 0.10 * a, layer: LAYER.FX, add: true });
  R.light({ x: e.x, y: cy, radius: d.spread * 3, r: S.base[0], g: S.base[1], b: S.base[2], intensity: 0.5 * a, flicker: 0.7 });

  if (d.flashT > 0) {
    const k = d.flashT / 0.2;
    const p = d.flash;
    for (let i = 0; i < d.flashN; i++) {
      R.line(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3], 9 * k + 2, { r: S.hot[0], g: S.hot[1], b: S.hot[2], a: k }, LAYER.FX, { add: true });
      R.line(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3], 30 * k + 4, { r: S.base[0], g: S.base[1], b: S.base[2], a: 0.35 * k }, LAYER.FX, { add: true });
    }
  }
  if (d.chainT > 0) {
    const k = d.chainT / 0.18;
    const n = jagged(d.w.rng, d.chainX, d.chainY, e.x, e.y, 6, 30);
    drawJagged(R, n, S.hot, k, 5);
  }
}

export const stormcall = {
  id: 'stormcall', name: 'Stormcall', school: 'storm',
  desc: 'A small bad weather that stays where he puts it.',
  unlockLevel: 6, manualOnly: false, cost: 34, cooldown: 10, range: 700, levels: 5,
  targeting: 'ground', windup: 0.34, castSfx: 'spell_stormcall_cast',
  rankText: [
    'A storm cell that earths itself on a timer.',
    'Strikes faster, and what it hits catches fire.',
    'Wider, and timber under it splinters outright.',
    'Each strike arcs on to a second target.',
    'The cell hunts — it drifts toward whatever is nearest.',
  ],
  scale(rank) {
    return {
      damage: [26, 32, 39, 47, 57][rank - 1],
      duration: [6, 7, 8, 8, 9][rank - 1],
      gap: [1.2, 1.0, 0.85, 0.72, 0.6][rank - 1],
      spread: [150, 170, 195, 215, 240][rank - 1],
      radius: [90, 100, 112, 124, 140][rank - 1],
      ignites: rank >= 2,
      chain: rank >= 4,
      drift: rank >= 5,
      cooldown: [10, 9.6, 9.2, 8.8, 8.4][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'storm', 1.1);
    w.ctx.audio.sfx('spell_stormcall_cast', { x: C.tx, y: C.ty });
    const f = field(w, {
      x: C.tx, y: C.ty, life: st.duration, tag: 'stormcall', owner: caster,
      step: cellStep, draw: cellDraw,
      done(e) {
        const d = e.data;
        strike(w, d, e.x);            // one last earthing on the way out
        leaveAsh(w, e.x, e.y, d.spread, 0.3);
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.damage = st.damage; d.gap = st.gap; d.acc = st.gap * 0.4;
    d.spread = st.spread; d.radius = st.radius; d.ignites = st.ignites;
    d.chain = st.chain; d.drift = st.drift; d.height = 330; d.y = C.ty;
    d.flash = new Float32Array(32); d.flashN = 0; d.flashT = 0;
    d.chainT = 0; d.chainX = 0; d.chainY = 0; d.report = C.report;
  },
  icon: null,
};

/* ------------------------------------------------------------------ *
 * Galewrench — the shove
 * ------------------------------------------------------------------ */

function gustPulse(w, d, cx, cy, dx, dy, reach, arc, force, dt) {
  const list = enemiesIn(w, cx, cy, reach, d.caster, 24);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const tx = t.x - cx, ty = t.y - cy;
    const L = Math.hypot(tx, ty) || 1;
    if ((tx / L) * dx + (ty / L) * dy < arc) continue;
    const f = force * (1 - L / reach) * (dt ? dt * 6 : 1);
    w.knockback(t, dx, dy - 0.25, f);
    if (d.slam) t.data.__gale = 0.35;                  // read on landing for slam damage
    const applied = w.damage(t, d.damage, 'impact', dmgOpts(d.caster, t.x, t.y, dx, dy, 0, 0.1));
    if (applied > 0) d.report(null, t, applied, 'impact', t.material);
  }

  w.shoveDebris(cx + dx * reach * 0.4, cy + dy * reach * 0.4, reach * 0.8, force * 1.4);

  const props = w.queryProps(cx + dx * reach * 0.45, cy + dy * reach * 0.45, reach * 0.7, propScratch);
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.alive) continue;
    if (p.material === MATERIAL.FOLIAGE) {
      // topple, don't shred: foliage hinges over as one piece
      if (d.topple) w.collapse(p, 0.05 + w.rng.next() * 0.15);
      else w.damageProp(p, d.damage * 2, 'impact', dmgOpts(d.caster, p.x, p.y, dx, dy, force));
    } else if (MAT[p.material].density < 1.2) {
      w.damageProp(p, d.damage * 0.8, 'impact', dmgOpts(d.caster, p.x, p.y, dx, dy, force * 0.8));
    }
  }
}

function galeStep(e, dt, t01) {
  const d = e.data, w = d.w;
  const c = d.caster;
  if (d.channel && c && c.alive) { e.x = c.x; e.y = c.y; }
  if (d.channel) gustPulse(w, d, e.x, e.y, d.dx, d.dy, d.reach, d.arc, d.force * 0.5, dt);

  w.surfaces.wind = d.wind;

  const n = d.channel ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const t = w.rng.next();
    const px = e.x + d.dx * d.reach * t + w.rng.range(-40, 40);
    const py = e.y + d.dy * d.reach * t + w.rng.range(-70, 70);
    const em = E(px, py, 1);
    em.vx = d.dx; em.vy = d.dy; em.speed = 900 + w.rng.range(0, 500); em.vSpread = 0.22;
    em.life = 0.3; em.lifeVar = 0.18; em.size = 10; em.sizeEnd = 1; em.drag = 2.4;
    em.add = true; em.stretch = 3.4;
    em.color = col(colA, 0.80, 0.88, 0.96, 0.4);
    em.color2 = col(colB, 0.55, 0.66, 0.82, 0);
    w.P.emit(em);
    // grit and leaves, so the gust has weight
    const em2 = E(px, py, 1);
    em2.vx = d.dx; em2.vy = d.dy; em2.speed = 500; em2.speedVar = 300; em2.vSpread = 0.5;
    em2.life = 0.9; em2.lifeVar = 0.5; em2.size = 7; em2.sizeEnd = 2;
    em2.gravity = 340; em2.drag = 1.3; em2.collide = true; em2.bounce = 0.3;
    em2.color = col(colA, 0.36, 0.34, 0.26, 0.8);
    em2.color2 = col(colB, 0.24, 0.26, 0.18, 0);
    w.P.emit(em2);
  }
}

function galeDraw(e, R, t01) {
  const d = e.data;
  const a = (1 - t01) * (d.channel ? 1 : 1);
  for (let i = 0; i < 6; i++) {
    const t = (i / 6 + t01 * 1.6) % 1;
    const px = e.x + d.dx * d.reach * t;
    const py = e.y + d.dy * d.reach * t;
    const wdt = 40 + t * d.reach * 0.55;
    R.sprite({
      tex: R.blob, x: px, y: py, w: 70, h: wdt, rot: Math.atan2(d.dy, d.dx),
      r: 0.72, g: 0.82, b: 0.94, a: 0.16 * a * (1 - t), layer: LAYER.FX, add: true,
    });
  }
}

export const galewrench = {
  id: 'galewrench', name: 'Galewrench', school: 'storm',
  desc: 'Not a weapon. A very rude suggestion about where things should be.',
  unlockLevel: 2, manualOnly: false, cost: 12, cooldown: 1.8, range: 480, levels: 5,
  targeting: 'aim', windup: 0.09, castSfx: 'spell_galewrench_cast',
  rankText: [
    'A shove. Barely hurts. Moves everything that is not nailed down.',
    'Wider, and it topples trees and bushes outright.',
    'Bends every fire on the screen downwind for a few seconds.',
    'Slams what it catches into whatever is behind it.',
    'A sustained gust — it will fan a small fire into a firestorm.',
  ],
  scale(rank) {
    return {
      damage: [3, 4, 5, 9, 12][rank - 1],
      force: [700, 850, 950, 1150, 1300][rank - 1],
      reach: [420, 480, 520, 560, 620][rank - 1],
      arc: [0.55, 0.42, 0.36, 0.32, 0.30][rank - 1],
      windTime: [0, 0, 2.6, 3.0, 4.5][rank - 1],
      channel: rank >= 5 ? 1.1 : 0,
      topple: rank >= 2,
      slam: rank >= 4,
      cooldown: [1.8, 1.7, 1.6, 1.5, 2.2][rank - 1],
    };
  },
  cast(C, caster, target, st) {
    const w = C.world;
    castFlash(w, C.x, C.y, 'storm', 0.7, C.dirX, C.dirY);
    w.ctx.audio.sfx('spell_galewrench_cast', { x: C.x, y: C.y });
    shake(w.R, 0.1, 0.2);

    const f = field(w, {
      x: C.x, y: C.y, life: st.channel || 0.32, tag: 'galewrench', owner: caster,
      step: galeStep, draw: galeDraw,
      done(e) {
        const d = e.data;
        if (d.windTime > 0) {
          // hand the wind back gradually rather than snapping it off
          field(w, {
            x: e.x, y: e.y, life: d.windTime, tag: 'galewind',
            step(f2, dt, t) { w.surfaces.wind = d.wind * (1 - t); },
            done() { w.surfaces.wind = 0; },
          });
        } else w.surfaces.wind = 0;
        // dust settles into a swept streak on the floor
        const gy = w.groundY(e.x + d.dx * d.reach * 0.5, e.y, 400);
        if (!Number.isNaN(gy)) {
          splat(w.rng, e.x + d.dx * d.reach * 0.5, gy - 3, d.reach * 0.35,
            [0.42, 0.39, 0.33, 0.30], 6, { life: 60, hold: 0.4 });
        }
      },
    });
    if (!f) return;
    const d = f.data;
    d.w = w; d.caster = caster; d.dx = C.dirX; d.dy = C.dirY;
    d.reach = st.reach; d.arc = st.arc; d.force = st.force; d.damage = st.damage;
    d.topple = st.topple; d.slam = st.slam; d.channel = st.channel > 0;
    d.windTime = st.windTime; d.wind = Math.max(-1, Math.min(1, C.dirX * 1.2));
    d.report = C.report;

    if (!d.channel) gustPulse(w, d, C.x, C.y, C.dirX, C.dirY, st.reach, st.arc, st.force, 0);
    if (st.windTime > 0) w.surfaces.wind = d.wind;
  },
  icon: null,
};

export const STORM_SPELLS = [sparklash, stormcall, galewrench];
