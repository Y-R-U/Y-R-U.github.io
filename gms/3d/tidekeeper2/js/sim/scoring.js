/* The two numbers the player watches, and the one line the shop shows. */

import { clamp } from '../util.js';
import { SP } from '../data/species.js';
import { has } from '../data/gear.js';
import { GR } from '../data/gear.js';
import { bioloadTotal, bioCapacity, plantMass, decorStats, flowOf, daylight, isCycled } from './tank.js';

export function ecosystemHealth(T) {
  let score = 100;
  score -= clamp(T.nh3 * 42, 0, 40);
  score -= clamp(T.no2 * 38, 0, 32);
  score -= clamp((T.no3 - 25) * 0.55, 0, 22);
  score -= clamp((0.8 - T.o2) * 110, 0, 34);
  score -= clamp((T.algae - 0.25) * 48, 0, 18);
  const live = T.fish.filter(f => f.alive);
  if (live.length) {
    let h = 0, s = 0, sick = 0;
    for (const f of live) { h += f.health; s += f.stress; if (f.sick > 0) sick++; }
    score -= (1 - h / live.length) * 42;
    score -= clamp(s / live.length, 0, 1.4) * 22;
    score -= sick / live.length * 20;
  }
  const load = bioloadTotal(T) / bioCapacity(T);
  if (load > 1) score -= (load - 1) * 28;
  score -= T.fish.filter(f => !f.alive).length * 7;
  score -= clamp(T.detritus * 6, 0, 14);
  return clamp(score, 0, 100);
}

export function crowdAppeal(T, night) {
  const live = T.fish.filter(f => f.alive);
  let base = 0, drama = 0, rarest = 0;
  const counts = {};
  for (const f of live) counts[f.spId] = (counts[f.spId] || 0) + 1;
  for (const f of live) {
    const sp = f.sp;
    const grown = 0.45 + 0.55 * clamp(f.len / sp.size, 0, 1);
    const cond = 0.25 + 0.75 * f.health * (1 - f.finDamage * 0.55) * (f.sick > 0 ? 0.55 : 1);
    let a = sp.appeal * grown * cond * (0.6 + 0.4 * sp.activity);
    if (sp.school > 1 && counts[sp.id] >= sp.school) a *= 1.30;
    if (sp.glow > 0.3) a *= night ? 2.1 : 0.78;
    if (f.hostDecor) a *= 1.45;
    base += a;
    drama += sp.drama * cond;
    rarest = Math.max(rarest, sp.rarity);
  }
  const speciesCount = Object.keys(counts).length;
  const variety = 1 + clamp(speciesCount - 1, 0, 10) * 0.05;
  const pm = plantMass(T), dm = decorStats(T);
  const scape = pm.appeal * 1.2 + dm.appeal * 1.25;
  const lightBonus = has(T, 'light3') ? GR.light3.appeal : has(T, 'light2') ? GR.light2.appeal : 0;
  const hasPred = live.some(f => f.sp.behaviour === 'predator');
  const hasPrey = live.some(f => f.len < 12 && f.sp.behaviour !== 'predator');
  const tension = hasPred && hasPrey ? 1.14 : 1;
  const clean = clamp(1 - (T.algae - 0.3) * 0.9, 0.45, 1) * clamp(1 - T.detritus * 0.12, 0.5, 1);
  const dead = T.fish.filter(f => !f.alive).length;
  let total = (base + drama * 1.6 + scape + lightBonus + rarest * 3) * variety * tension * clean;
  /* nobody queues to look at an empty tank, however nicely it is planted */
  total *= 0.14 + 0.86 * clamp(live.length / 3, 0, 1);
  return Math.max(0, total - dead * 12);
}

/* ── the shop preview: one colour, one line ──────────────────────────────
   The line is always the WORST thing true about the placement, because that
   is the thing that is actually going to happen. */
export function evaluatePlacement(T, spId, count = 1, G = null) {
  const sp = SP[spId];
  const live = T.fish.filter(f => f.alive);
  const out = [];
  const add = (lvl, why, rel) => out.push({ lvl, why, rel });
  const lenCm = T.dims[0] * 10;

  if (sp.water !== T.water)
    add(3, `${sp.name} is ${sp.water === 'sw' ? 'a marine' : 'a freshwater'} fish and this is ${T.water === 'sw' ? 'salt water' : 'fresh water'}.`);

  if (sp.size * 4.5 > lenCm) add(3, `${sp.name} reaches ${sp.size} cm. This tank is too short for it to turn round.`);
  else if (sp.size * 7 > lenCm) add(2, `${sp.name} will outgrow the swimming room here.`);
  if (sp.id === 'tang' && sp.size * 8 > lenCm) add(3, 'A yellow tang grazes on the move all day. This tank is not long enough.', 'tang-room');

  const capLeft = bioCapacity(T) - bioloadTotal(T);
  const adding = sp.bioload * count;
  if (adding > capLeft + 0.05) add(3, `This would overload the filter. ${sp.name} needs more biological capacity than you have left.`);
  else if (adding > capLeft * 0.72) add(2, 'This takes the tank close to its filtration limit.');

  const already = live.filter(f => f.spId === spId).length;
  if (sp.school > 1 && already + count < sp.school)
    add(2, `${sp.name} needs a group of at least ${sp.school}. ${already + count} will be a nervous, dull fish.`);

  for (const f of live) {
    const o = f.sp;
    if (o.id === spId) continue;
    const loT = Math.max(sp.temp[0], o.temp[0]), hiT = Math.min(sp.temp[1], o.temp[1]);
    if (loT > hiT) add(3, `${sp.name} wants ${sp.temp[0]}–${sp.temp[1]} °C and your ${o.name} wants ${o.temp[0]}–${o.temp[1]} °C. One of them will be wrong.`);
    else if (hiT - loT < 1.5) add(2, `${sp.name} and your ${o.name} overlap over about one degree of temperature.`);
    if (Math.max(sp.ph[0], o.ph[0]) > Math.min(sp.ph[1], o.ph[1]))
      add(2, `${sp.name} and your ${o.name} want different water chemistry.`);
  }
  if (T.temp < sp.temp[0] - 0.5) add(2, `The tank runs at ${T.temp.toFixed(1)} °C; ${sp.name} wants at least ${sp.temp[0]} °C.`);
  if (T.temp > sp.temp[1] + 0.5) add(2, `The tank runs at ${T.temp.toFixed(1)} °C; ${sp.name} tops out at ${sp.temp[1]} °C.`);

  if (T.nh3 > 0.25 || T.no2 > 0.25)
    add(3, `There is ${T.nh3 > T.no2 ? 'ammonia' : 'nitrite'} in this water right now. Nothing new goes in until it reads zero.`);
  else if (!isCycled(T) && live.length > 0)
    add(2, 'This tank has not finished cycling. Anything you add now is breathing its own ammonia.');
  else if (!isCycled(T) && live.length === 0)
    add(1, 'A brand new tank. Start with one hardy species and let the bacteria catch up.');

  /* predation, both directions */
  for (const f of live) {
    if (f.sp.id === 'lion' && sp.size < 12) add(3, `Your lionfish will eat ${sp.name}. Not "might".`, 'lion-small');
    if (spId === 'lion' && f.len < 12) add(3, `A lionfish will work through your ${f.sp.name} within a week.`, 'lion-small');
    if (f.sp.id === 'angel' && spId === 'neon') add(f.len >= 9 ? 3 : 2,
      f.len >= 9 ? 'Your angelfish is big enough to eat neon tetras.'
                 : 'Your angelfish is still small — but it will be eating neons within a month.', 'angel-neon');
    if (spId === 'angel' && f.sp.id === 'neon') add(2, 'Angelfish start harmless and end up eating neon tetras. Decide now which fish this tank is for.', 'angel-neon');
    if (f.sp.id === 'puffer' && (spId === 'snail' || spId === 'cherry' || spId === 'shrimp'))
      add(3, `Your pea puffer eats ${sp.name.toLowerCase()}. That is what the beak is for.`, 'puffer-snail');
    if (spId === 'puffer' && ['snail','cherry','shrimp'].includes(f.spId))
      add(3, `A pea puffer will hunt your ${f.sp.name.toLowerCase()}.`, 'puffer-snail');
    if (spId === 'cherry' && f.len > 6 && f.sp.temper !== 'peaceful')
      add(3, `Your ${f.sp.name} is big enough to eat cherry shrimp.`, 'shrimp-snack');
    if (f.spId === 'cherry' && sp.size > 6 && sp.temper !== 'peaceful')
      add(3, `${sp.name} will work out that your cherry shrimp are food.`, 'shrimp-snack');
    if (f.sp.id === 'betta' && (sp.body.veil || 0) >= 0.55) add(3, `Your betta will shred ${sp.name}'s fins.`, 'betta-veil');
    if (spId === 'betta' && (f.sp.body.veil || 0) >= 0.55) add(3, `A betta will shred your ${f.sp.name}'s fins.`, 'betta-veil');
    if (f.spId === 'betta' && spId === 'betta') add(3, 'Two bettas in one tank is one betta, eventually.', 'betta-betta');
    if (f.spId === 'gramma' && spId === 'gramma') add(3, 'Two royal grammas will fight over the only crevice in the tank.', 'gramma-gramma');
    if (f.spId === 'barb' && (sp.body.veil || 0) >= 0.55 && live.filter(x => x.spId === 'barb').length < 6)
      add(2, `Tiger barbs under a school of six nip long fins, and ${sp.name} has them.`, 'barb-veil');
    if (spId === 'barb' && (f.sp.body.veil || 0) >= 0.55 && count + live.filter(x => x.spId === 'barb').length < 6)
      add(2, `Fewer than six tiger barbs will turn on your ${f.sp.name}'s fins.`, 'barb-veil');
  }

  /* the specialists */
  if (spId === 'seahorse' || live.some(f => f.spId === 'seahorse')) {
    const fast = live.filter(f => f.sp.activity > 0.55 && f.spId !== 'seahorse').length;
    if (spId === 'seahorse' && fast >= 2) add(3, `Seahorses feed slowly. Your ${fast} quick fish will clear every meal before it starts.`, 'seahorse-comp');
    else if (fast >= 1) add(2, 'Seahorses feed slowly and are easily outcompeted at dinner.', 'seahorse-comp');
    if (spId === 'seahorse' && flowOf(T) > 0.55) add(2, 'Seahorses need calm water. There is too much flow in here.');
  }
  if (spId === 'mandarin') {
    if (T.ageDays < 60) add(3, `A mandarin eats copepods off mature rock. This tank is ${Math.round(T.ageDays)} days old and has none.`, 'mandarin-food');
    else if (decorStats(T).hides < 1) add(2, 'A mandarin needs rockwork to pick over.', 'mandarin-food');
  }
  if (spId === 'jelly') {
    if (flowOf(T) > 0.45) add(3, 'Moon jellies are torn apart by this much flow. Lose the wavemaker first.', 'jelly-flow');
    if (live.some(f => f.sp.temper !== 'peaceful')) add(3, 'Anything with a mouth will damage a moon jelly.');
    if (T.no3 > 12) add(2, 'Jellies want water cleaner than this.');
  }
  if (spId === 'discus') {
    if (T.no3 > 20) add(2, 'Discus want nitrate under 20 mg/L. Yours is higher.', 'discus-temp');
    if (live.some(f => f.sp.temper === 'semi' || f.sp.temper === 'aggressive'))
      add(2, 'Discus are shy and will not feed properly with pushy tankmates.', 'discus-temp');
  }
  if (spId === 'goldfish' && T.plants.length) add(1, 'Goldfish will uproot and eat your planting.', 'goldfish-dirty');
  if (spId !== 'goldfish' && live.some(f => f.spId === 'goldfish') && sp.temp[0] > 23)
    add(2, 'Goldfish want cool water; your tropicals do not.', 'goldfish-dirty');
  if ((sp.body.barbels || 0) > 0 && T.substrate === 'gravel')
    add(2, `${sp.name} feels for food with barbels. Coarse gravel wears them away — use sand.`, 'kuhli-sand');

  /* good news is still news */
  if (spId === 'clown' && decorStats(T).host) add(0, 'Your anemone is waiting. A hosted clownfish is worth half again as much appeal.', 'clown-anem');
  if (spId === 'shrimp') add(0, 'A cleaner shrimp runs a clinic — it holds disease down across the whole tank.', 'shrimp-clinic');
  if (spId === 'flashlight') add(0, 'Flashlight fish earn their keep after dark. Under a bright lamp you cannot see the lamp.', 'flashlight-dark');

  if (sp.temper === 'aggressive' && live.some(f => f.sp.temper === 'peaceful' && f.sp.size < sp.size * 1.4))
    add(2, `${sp.name} is aggressive and most of this tank is smaller than it.`);
  if (sp.behaviour === 'territorial' && live.filter(f => f.sp.behaviour === 'territorial').length >= 1 && decorStats(T).hides < 1)
    add(2, 'Two territorial fish and nothing to break the sight lines between them.');

  out.sort((a, b) => b.lvl - a.lvl);
  const worst = out[0];
  if (!worst) return { lvl: 0, level: 'g', why: `${sp.name} is a clean fit for this tank.`, all: out };
  return { lvl: worst.lvl, level: worst.lvl >= 3 ? 'r' : worst.lvl === 2 ? 'a' : 'g',
           why: worst.why, rel: worst.rel, all: out };
}
