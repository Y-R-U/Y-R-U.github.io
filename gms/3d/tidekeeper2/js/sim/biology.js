/* Hunger, growth, illness, breeding and death. dt is in DAYS throughout. */

import { clamp, lerp, rr, rnd, TAU } from '../util.js';
import { CFG } from '../config.js';
import { has } from '../data/gear.js';
import { flowOf, metabolism, bioloadTotal, bioCapacity } from './tank.js';
import { SP } from '../data/species.js';

export function makeFish(T, spId, opts = {}) {
  const sp = SP[spId];
  const f = {
    id: T.nextFishId++, spId, sp,
    len: opts.len ?? sp.size * (0.42 + rnd() * 0.2),
    ageDays: opts.fry ? 0 : rr(10, 60),
    health: clamp((opts.health ?? 1), 0.05, 1),
    hunger: rr(0.2, 0.45), stress: 0, sick: 0, medicated: 0, finDamage: 0,
    alive: true, corpse: 0, fry: !!opts.fry, eaten: 0,
    tint: 0.84 + rnd() * 0.32, phase: rnd() * TAU, hostDecor: null, killedBy: null,
    zoneBias: rr(-0.22, 0.22), speedMul: 0.85 + rnd() * 0.3,
    /* motion state, owned by sim/behaviour.js */
    pos: null, vel: null, target: null, home: null, lastDir: null,
    mood: 'cruise', moodT: 0, chase: null, homeSet: false, bank: 0, flash: 0,
    yawLag: 0, pitch: 0, stalkT: 0,
  };
  T.fish.push(f);
  return f;
}

/** How much hunger one crumb of food removes for this fish. */
export const foodValue = (p, f) => (0.17 + f.len * 0.014) * (p.mass / CFG.FOOD_MASS);

/* ── how bad is the water, per animal ────────────────────────────────────── */
export function stressOf(T, f) {
  const sp = f.sp;
  let s = 0;
  const tol = 0.25 + sp.hardy * 0.9;
  s += clamp((T.nh3 - 0.03) * 3.0, 0, 2.6) / tol;
  s += clamp((T.no2 - 0.03) * 2.6, 0, 2.4) / tol;
  s += clamp((T.no3 - 30) / 60, 0, 1.6) / tol;
  s += clamp((0.72 - T.o2) * 4.0, 0, 2.6) / tol;
  if (T.temp < sp.temp[0]) s += (sp.temp[0] - T.temp) * 0.34 / tol;
  if (T.temp > sp.temp[1]) s += (T.temp - sp.temp[1]) * 0.42 / tol;
  if (T.ph < sp.ph[0]) s += (sp.ph[0] - T.ph) * 0.85 / tol;
  if (T.ph > sp.ph[1]) s += (T.ph - sp.ph[1]) * 0.70 / tol;
  if (f.hunger > 0.72) s += (f.hunger - 0.72) * 3.4;
  if (f.finDamage > 0.2) s += f.finDamage * 0.8;
  if (f.sick > 0) s += f.sick * 1.4;
  if (sp.school > 1) {
    const n = T.fish.reduce((a, x) => a + (x.alive && x.spId === f.spId ? 1 : 0), 0);
    if (n < sp.school) s += (sp.school - n) / sp.school * 1.3;
  }
  const load = bioloadTotal(T) / bioCapacity(T);
  if (load > 1) s += clamp((load - 1) * 0.85, 0, 2.2);
  const fl = flowOf(T);
  const want = sp.flow === 'low' ? 0.35 : sp.flow === 'med' ? 0.7 : 1.1;
  s += Math.max(0, fl - want - 0.3) * (sp.fragile ? 4.5 : 1.1);
  if (sp.flow === 'high' && fl < 0.3) s += 0.3;
  if (T.algae > 0.7) s += (T.algae - 0.7) * 1.2;
  /* substrate matters to the animals that feel their way around with barbels */
  if (sp.body.barbels && T.substrate === 'gravel') s += 0.45;
  /* a tank too short for a grazer that never stops moving */
  if (sp.id === 'tang' && T.dims[0] * 10 < sp.size * 8) s += 1.1;
  /* a mandarin eats things that only exist in an old tank */
  if (sp.id === 'mandarin' && T.ageDays < 60) s += (60 - T.ageDays) / 60 * 1.4;
  return s;
}

/* ── one step of biology ─────────────────────────────────────────────────── */
export function stepBiology(T, dt, G, perks = {}) {
  const meta = metabolism(T);
  const medics = T.fish.reduce((a, f) => a + (f.alive && f.sp.medic ? 1 : 0), 0);
  const guard = (1 / (1 + medics * 0.85))
              * ((has(T, 'uv') && T.powerOut <= 0) ? 0.45 : 1)
              * (1 + (perks.disease || 0));
  const died = [], born = [];

  for (const f of T.fish) {
    if (!f.alive) { f.corpse += dt; continue; }
    const sp = f.sp;

    const burn = (sp.diet === 'meaty' ? 0.42 : 0.85) * meta * (0.6 + 0.4 * sp.activity);
    f.hunger = clamp(f.hunger + burn * dt, 0, 1.4);

    if (sp.cleanup) {
      const graze = Math.min(1, T.detritus * 0.6 + T.algae * (sp.cleanup.algae || 0));
      f.hunger = clamp(f.hunger - graze * 0.8 * dt, 0, 1.4);
      T.detritus = Math.max(0, T.detritus - (sp.cleanup.detritus || 0) * 0.55 * dt);
    }

    const s = stressOf(T, f);
    f.stress = lerp(f.stress, clamp(s / 4, 0, 1.6), clamp(dt * 3, 0, 1));

    /* illness — stress is the door, the pathogen is always at it */
    if (f.sick <= 0) {
      if (rnd() < (0.004 + f.stress * 0.10) * guard * dt) {
        f.sick = 0.18;
        G.alert('bad', 'Illness', `<b>${sp.name}</b> is showing white spots. Ich spreads fast in a stressed tank.`);
        G.lore('ich');
      }
    } else {
      const trend = f.medicated > 0 ? -1.6 : (0.75 * f.stress - 0.30);
      f.sick = clamp(f.sick + trend * dt, 0, 1.5);
      if (f.sick > 0.25 && rnd() < 0.22 * guard * dt) {
        const others = T.fish.filter(x => x.alive && x.sick <= 0 && x !== f);
        if (others.length) others[Math.floor(rnd() * others.length)].sick = 0.12;
      }
    }
    if (f.medicated > 0) f.medicated -= dt;

    /* condition */
    let dh = 0;
    if (s < 1.4) dh += (1.30 - s) * 0.45;
    dh -= Math.min(0.85, Math.max(0, s - 1.2) * 0.20);
    if (f.hunger > 0.95) dh -= (f.hunger - 0.95) * 2.6;
    dh -= f.sick * 0.30;
    if (T.nh3 > 1.5) dh -= (T.nh3 - 1.5) * 0.5;
    if (T.o2 < 0.40) dh -= (0.40 - T.o2) * 2.4;
    f.health = clamp(f.health + dh * dt, 0, 1);

    if (f.finDamage > 0) f.finDamage = clamp(f.finDamage - (s < 0.5 ? 0.22 : 0.04) * dt, 0, 1);

    if (f.len < sp.size)
      f.len = Math.min(sp.size, f.len + sp.growth * dt * (0.35 + 0.65 * f.health) * (f.hunger < 0.85 ? 1 : 0.2));
    f.ageDays += dt;
    if (f.ageDays > sp.lifespan * 0.8)
      f.health -= (f.ageDays - sp.lifespan * 0.8) / (sp.lifespan * 0.2) * 0.18 * dt;

    if (f.health <= 0) {
      /* One mercy, once, ever. A first fish dying while you are still
         learning what the buttons do teaches nothing except to stop playing. */
      if (G.useMercy && G.useMercy(f, T)) { f.health = 0.10; f.hunger = Math.min(f.hunger, 0.55); }
      else { f.alive = false; f.corpse = 0; died.push(f); continue; }
    }

    /* breeding — only in genuinely good conditions, which is the whole point */
    if (G.can('breeding') && sp.school > 1 && f.len > sp.size * 0.8 &&
        f.health > 0.88 && s < 0.35 && f.hunger < 0.5) {
      const mates = T.fish.reduce((a, x) => a + (x.alive && x.spId === f.spId && x.len > sp.size * 0.75 ? 1 : 0), 0);
      const crowd = bioloadTotal(T) / bioCapacity(T);
      const rate = sp.breeder ? 0.11 : 0.055;
      if (mates >= 2 && crowd < 0.8 && rnd() < rate * dt * (sp.endangered ? 0.5 : 1)) born.push(sp);
    }
  }

  for (const f of died) G.onDeath(f, T, deathReason(T, f));
  for (const sp of born) {
    if (T.fish.filter(x => x.alive).length < 70) G.onBirth(sp, T);
  }

  /* corpses rot, and rotting is how one death becomes five */
  for (let i = T.fish.length - 1; i >= 0; i--) {
    const f = T.fish[i];
    if (!f.alive && f.corpse > 0.9) { T.detritus += f.sp.bioload * 0.5; T.fish.splice(i, 1); }
  }

  /* uneaten food becomes the problem */
  for (let i = T.food.length - 1; i >= 0; i--) {
    const p = T.food[i];
    p.age += dt;
    if (p.age > CFG.FOOD_LIFE_DAYS) {
      T.detritus += p.mass * (p.waste ?? 1);
      T.food.splice(i, 1);
    }
  }
}

export function deathReason(T, f) {
  if (f.killedBy) return f.killedBy;
  if (f.hunger > 0.95) return 'It starved.';
  if (T.nh3 > 0.5) return 'Ammonia burns.';
  if (T.no2 > 0.5) return 'Nitrite poisoning.';
  if (T.o2 < 0.5) return 'Suffocation — the oxygen was gone.';
  if (f.sick > 0.5) return 'The illness took it.';
  const sp = f.sp;
  if (T.temp < sp.temp[0] - 1) return 'The water was too cold for it.';
  if (T.temp > sp.temp[1] + 1) return 'The water was too warm for it.';
  if (T.ph < sp.ph[0] - 0.4 || T.ph > sp.ph[1] + 0.4) return 'The pH was wrong for it.';
  if (f.ageDays > sp.lifespan * 0.8) return 'Old age. It had a good run.';
  return 'Chronic stress.';
}
