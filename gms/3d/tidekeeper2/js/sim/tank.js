/* ═══════════════════════════════════════════════════════════════════════════
   WATER
   The nitrogen cycle, honestly modelled. Fish and rotting food make ammonia;
   one bacterial colony turns ammonia into nitrite, a second turns nitrite
   into nitrate; plants and a bucket are the only things that remove nitrate.
   Both colonies have to GROW, which is why a new tank poisons its first fish
   and a mature one shrugs off a mistake.

   These constants were set against a Node harness stepping weeks of
   chemistry at quarter-hour ticks — see tools/sim.mjs. Do not nudge them
   from a screenshot.
   ═══════════════════════════════════════════════════════════════════════════ */

import { clamp, lerp, smooth, TAU, rr, rnd, vnoise } from '../util.js';
import { CFG } from '../config.js';
import { GR, has } from '../data/gear.js';
import { PL, DEC } from '../data/flora.js';

export const SRC = { fw: { ph: 7.4, kh: 0.55 }, sw: { ph: 8.25, kh: 1.0 } };

export const TANKS = [
  { id:'t10',  name:'10 Gallon',  gal:10,  litres:38,  dims:[4.0, 2.4, 2.2], price:0     },
  { id:'t20',  name:'20 Gallon',  gal:20,  litres:75,  dims:[6.0, 3.0, 3.0], price:110   },
  { id:'t40',  name:'40 Breeder', gal:40,  litres:150, dims:[9.0, 4.0, 4.5], price:340   },
  { id:'t75',  name:'75 Gallon',  gal:75,  litres:284, dims:[12.0,4.6, 5.0], price:820   },
  { id:'t125', name:'125 Gallon', gal:125, litres:473, dims:[18.0,4.6, 6.0], price:1900  },
  { id:'t220', name:'220 Gallon', gal:220, litres:830, dims:[22.0,5.6, 6.6], price:4800  },
];
export const TK = {}; TANKS.forEach(t => TK[t.id] = t);

let nextTankId = 1;

export function makeTank(tankId, water, opts = {}) {
  const t = TK[tankId];
  const T = {
    uid: opts.uid ?? nextTankId++,
    tankId, water,
    name: opts.name || t.name,
    litres: t.litres, gal: t.gal, dims: t.dims.slice(),
    temp: opts.temp ?? (water === 'sw' ? 25.5 : 24.5),
    target: opts.temp ?? (water === 'sw' ? 25.5 : 24.5),
    ph: SRC[water].ph, kh: SRC[water].kh,
    o2: 0.95, nh3: 0, no2: 0, no3: 2,
    bactA: opts.cycled ? 1 : 0.02, bactN: opts.cycled ? 1 : 0.01,
    processed: opts.cycled ? 12 : 0,
    organics: 0.05, detritus: 0, algae: 0.02,
    fish: [], plants: [], decor: [],
    gear: new Set(['filter1', 'light1', ...(opts.gear || [])]),
    food: [], flowUser: 0.35,
    day: 1, hour: 8, ageDays: 0,
    lastWaterChange: 0, heaterBroken: false, powerOut: 0, filterOff: 0, heatwave: 0,
    nextFishId: 1, substrate: opts.substrate || 'sand',
    autoFeed: false, lastFed: 0,
  };
  return T;
}
export const setNextTankId = n => { nextTankId = n; };
export const peekTankId = () => nextTankId;

/* ── derived ─────────────────────────────────────────────────────────────── */
export function filterBact(T) {
  let b = 1;
  if (has(T, 'filter3')) b = GR.filter3.bact; else if (has(T, 'filter2')) b = GR.filter2.bact;
  if (T.filterOff > 0) b *= 0.25;
  return b;
}
export function lightFixture(T) {
  if (has(T, 'light3')) return GR.light3.light;
  if (has(T, 'light2')) return GR.light2.light;
  return GR.light1.light;
}
export function flowOf(T) {
  let f = T.flowUser;
  if (has(T, 'filter3')) f += 0.3; else if (has(T, 'filter2')) f += 0.18;
  if (has(T, 'wave')) f += GR.wave.flow;
  if (T.decor.some(d => d.id === 'bubbler')) f += 0.1;
  if (T.powerOut > 0) f = 0.02;
  return clamp(f, 0, 1.6);
}
export function daylight(T) {
  if (T.powerOut > 0) return 0;
  const h = T.hour;
  return clamp(Math.min(smooth(6.2, 8.2, h), 1 - smooth(18.5, 20.8, h)), 0, 1);
}
export const lightLevel = T => lightFixture(T) * daylight(T);
export const metabolism = T => clamp(1 + 0.055 * (T.temp - 24), 0.45, 2.1);
export const o2Sat = T => clamp(1.25 - 0.0165 * T.temp, 0.55, 1.05);

export function bioloadTotal(T) {
  let b = 0;
  for (const f of T.fish) if (f.alive) b += f.sp.bioload * (0.35 + 0.65 * (f.len / f.sp.size));
  return b;
}
export function bioCapacity(T) {
  return (T.litres / 14) * (0.5 + 0.5 * filterBact(T) / 2.2);
}
export function plantMass(T) {
  let up = 0, o2 = 0, appeal = 0, hides = 0;
  const L = lightLevel(T), co2 = has(T, 'co2') ? 1 + GR.co2.plant : 1;
  for (const p of T.plants) {
    const d = PL[p.id];
    const lit = clamp(L / Math.max(0.12, d.light), 0, 1.25);
    const vig = p.health * lit * co2;
    up += d.uptake * vig;
    o2 += d.o2 * vig * Math.max(0.06, L);
    appeal += d.appeal * p.health;
    hides += d.hides * p.health;
  }
  return { up, o2, appeal, hides };
}
export function decorStats(T) {
  let appeal = 0, hides = 0, o2 = 0, ph = 0, host = false, territory = 0;
  for (const d of T.decor) {
    const def = DEC[d.id];
    appeal += def.appeal * (d.health ?? 1);
    hides += def.hides || 0; o2 += def.o2 || 0; ph += def.ph || 0;
    territory += def.territory || 0;
    if (def.host && (d.health ?? 1) > 0.4) host = true;
  }
  return { appeal, hides, o2, ph, host, territory };
}
export const isCycled = T => (T.processed || 0) > 4.5 && T.nh3 < 0.05 && T.no2 < 0.05;

/* ── one step of chemistry. dt is in DAYS. ───────────────────────────────── */
export function stepChem(T, dt, perks = {}) {
  const meta = metabolism(T);
  const L = lightLevel(T);
  const flow = flowOf(T);
  const plants = plantMass(T);
  const dec = decorStats(T);

  /* temperature — the heater pulls to target, the room pulls to itself */
  const roomT = 21 + (T.heatwave > 0 ? 5 : 0) + 1.6 * Math.sin((T.hour / 24) * TAU - 1.2);
  let heatRate = has(T, 'heater') ? 9 : 4.5;
  if (T.heaterBroken || T.powerOut > 0) heatRate = 0;
  const canCool = has(T, 'chiller') && T.powerOut <= 0;
  let drive = 0;
  if (T.temp < T.target) drive = heatRate * (T.target - T.temp);
  else if (T.temp > T.target && canCool) drive = -8 * (T.temp - T.target);
  T.temp = clamp(T.temp + (drive + (roomT - T.temp) * 2.2) * dt, 4, 40);

  /* waste in — the whole engine */
  let nh3In = 0;
  for (const f of T.fish) {
    if (!f.alive) { nh3In += Math.min(1.5, 0.55 * f.sp.bioload); continue; }
    nh3In += f.sp.bioload * (0.3 + 0.7 * f.len / f.sp.size) * meta * 0.26 * (0.35 + 0.65 * (1 - f.hunger));
  }
  T.detritus = Math.max(0, T.detritus);
  const detDecay = T.detritus * 0.55 * meta * dt;
  T.detritus -= detDecay;
  nh3In = nh3In * dt + detDecay * 0.8 + T.organics * 0.12 * dt;
  if (has(T, 'skimmer') && T.water === 'sw' && T.powerOut <= 0) nh3In *= (1 - GR.skimmer.organics);
  T.nh3 += nh3In * (1000 / T.litres * 0.075);

  /* bacteria — maturity 0..1, not a concentration. They grow whenever there
     is something to eat and fade slowly when there is not. Processing is a
     flat rate, deliberately not Monod: that is what lets a mature filter hold
     both toxins at zero and stops an overstocked one ever catching up. */
  const tRate = clamp(0.55 + 0.06 * (T.temp - 22), 0.2, 1.4);
  const cap = filterBact(T) * (1 + 0.12 * T.plants.length)
            * (0.62 / Math.max(0.5, Math.pow(T.litres / 220, 0.55)));
  const capA = cap * 3.4 * tRate, capN = cap * 2.4 * tRate;

  const dA = Math.min(T.nh3, capA * T.bactA * dt);
  T.nh3 -= dA; T.no2 += dA * 0.92;
  T.processed = (T.processed || 0) + dA;
  T.ageDays += dt;
  const dN = Math.min(T.no2, capN * T.bactN * dt);
  T.no2 -= dN; T.no3 += dN * 0.95;

  const grow = (b, food, rate) => {
    let d = food > 0.015 ? rate * (1.02 - b) : -0.055 * b;
    if (T.powerOut > 6 / 24) d -= 0.30;
    if (T.ph < 6.0) d -= 0.45;
    return clamp(b + d * tRate * dt, 0.004, 1);
  };
  const inv = 1 / Math.max(dt, 1e-9);
  T.bactA = grow(T.bactA, dA * inv + T.nh3 * 12, 0.30);
  T.bactN = grow(T.bactN, dN * inv + T.no2 * 12, 0.17);

  /* plants and algae both eat nitrogen; algae also eats your appeal */
  const perVol = 220 / Math.max(60, T.litres);
  const uptake = plants.up * 0.30 * dt * perVol;
  const fromNh3 = Math.min(T.nh3, uptake * 0.35);
  T.nh3 -= fromNh3;
  T.no3 = Math.max(0, T.no3 - (uptake - fromNh3) * 1.5);

  let algaeGrow = L * (0.09 + 0.055 * clamp(T.no3 / 30, 0, 2)) * (1 + T.organics);
  algaeGrow *= (1 - 0.55 * clamp(plants.up / 3, 0, 1));
  if (has(T, 'uv') && T.powerOut <= 0) algaeGrow *= (1 - GR.uv.algae);
  algaeGrow *= (1 + (perks.algae || 0));
  let graze = 0;
  for (const f of T.fish) if (f.alive && f.sp.cleanup?.algae) graze += f.sp.cleanup.algae * (0.4 + 0.6 * f.len / f.sp.size);
  T.algae = clamp(T.algae + (algaeGrow - 0.55 * graze - 0.05) * dt, 0, 1);
  T.no3 = Math.max(0, T.no3 - T.algae * 0.8 * L * dt);

  /* oxygen — demand is per litre, so a big tank really does buy you air */
  const sat = o2Sat(T);
  let o2In = (sat - T.o2) * (1.4 + flow * 2.6 + dec.o2) * dt + plants.o2 * 0.06 * dt;
  const o2Out = (bioloadTotal(T) * 0.020 * meta * perVol + T.detritus * 0.02
              + T.algae * 0.05 * (1 - L) + 0.02 + (T.bactA + T.bactN) * 0.012) * dt;
  T.o2 = clamp(T.o2 + o2In - o2Out, 0, 1.1);

  /* pH */
  const src = SRC[T.water];
  const acid = (T.no3 * 0.0032 + T.organics * 0.4 + (has(T, 'co2') ? 0.22 : 0)) * (1 - L * 0.25);
  const buffer = src.kh * (T.water === 'sw' ? 2.4 : 1.0) + (T.decor.some(d => d.id === 'rockpile') ? 0.2 : 0);
  T.ph = clamp(T.ph + (((src.ph + dec.ph - acid / Math.max(0.25, buffer)) - T.ph) * 1.1) * dt, 4.5, 9.2);
  T.organics = clamp(T.organics + bioloadTotal(T) * 0.004 * dt
                   - T.organics * (has(T, 'skimmer') ? 1.4 : 0.5) * dt, 0, 2);

  /* planting and living decor take the same damage the fish do */
  for (const p of T.plants) {
    const d = PL[p.id];
    const lit = clamp(L / Math.max(0.12, d.light), 0, 1.3);
    let dh = (lit - 0.55) * 0.5;
    if (T.no3 > 60) dh -= 0.25;
    if (T.algae > 0.55) dh -= 0.4 * (T.algae - 0.55);
    if (T.fish.some(f => f.alive && f.sp.uproots) && d.height > 0.3) dh -= 0.22;
    p.health = clamp(p.health + dh * dt, 0, 1);
  }
  for (const d of T.decor) {
    if (!DEC[d.id].living) continue;
    const need = DEC[d.id].light || 0.6;
    let dh = (clamp(L / need, 0, 1.2) - 0.6) * 0.45;
    if (T.nh3 > 0.25 || T.no2 > 0.25) dh -= 0.6;
    if (T.no3 > 35) dh -= 0.2;
    if (T.water === 'sw' && Math.abs(T.temp - 25.5) > 3) dh -= 0.3;
    d.health = clamp((d.health ?? 1) + dh * dt, 0, 1);
  }
}

/* ── the one number the player sees before they earn a test kit ──────────── */
export function waterScore(T) {
  let s = 100;
  s -= clamp(T.nh3 * 42, 0, 40);
  s -= clamp(T.no2 * 38, 0, 34);
  s -= clamp((T.no3 - 25) * 0.55, 0, 20);
  s -= clamp((0.8 - T.o2) * 110, 0, 30);
  s -= clamp((T.algae - 0.25) * 46, 0, 16);
  s -= clamp(T.detritus * 6, 0, 14);
  const load = bioloadTotal(T) / bioCapacity(T);
  if (load > 1) s -= clamp((load - 1) * 26, 0, 24);
  return clamp(s, 0, 100);
}
