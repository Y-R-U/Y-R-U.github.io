// One body, many monsters — so the rule that matters is that every one of them is still a fight
// somebody could win with the same knife the proving hands out.

import { test, eq, ok } from '../../tools/harness.mjs';
import { KINDS, KIND_IDS, VARIANTS, VARIANT_IDS, describe, roster, kindOf, variantOf } from './bestiary.js';
import { EARTH, spawn, step, wound, isDead } from './foe.js';
import { SURFACES } from './ground.js';
import { KNIFE } from './weapons.js';

test('an unnamed spawn is the earth elemental the proving room was built around', () => {
  const d = describe({});
  eq(d.kind, 'earth');
  eq(d.variant, 'none');
  eq(d.name, 'Earth Elemental');
  eq(d.tuning.hp, EARTH.hp);
  eq(d.tuning.speed, EARTH.speed);
  eq(d.tuning.damage, EARTH.damage);
  eq(d.heals, 'dirt');
});

test('a kind nobody wrote falls back rather than throwing', () => {
  eq(kindOf('griffin').id, 'earth');
  eq(variantOf('haunted').id, 'none');
  eq(describe({ kind: 'griffin', variant: 'haunted' }).name, 'Earth Elemental');
});

test('a variant multiplies the kind it is applied to, not the base', () => {
  const plain = describe({ kind: 'gale' });
  const great = describe({ kind: 'gale', variant: 'greater' });
  eq(great.name, 'Greater Gale Elemental');
  eq(great.tuning.hp, +(plain.tuning.hp * VARIANTS.greater.hp).toFixed(2));
  ok(great.scale > plain.scale);
  ok(great.xp > plain.xp, 'and it is worth more');
});

test('a variant never touches the tell', () => {
  for (const v of VARIANT_IDS) {
    const d = describe({ kind: 'earth', variant: v });
    eq(d.tuning.windup, EARTH.windup, `${v} moved the windup`);
    eq(d.tuning.reach, EARTH.reach, `${v} moved the reach`);
    eq(d.tuning.arc, EARTH.arc, `${v} moved the arc`);
  }
});

test('a level can name a monster itself and the variant does not overwrite it', () => {
  eq(describe({ kind: 'mire', variant: 'greater', name: 'The Thing in the Reeds' }).name,
    'The Thing in the Reeds');
});

test('every kind mends from a surface a level can actually lay, or from none', () => {
  for (const id of KIND_IDS) {
    const k = KINDS[id];
    if (k.heals === null) continue;
    ok(SURFACES.includes(k.heals), `${id} mends from "${k.heals}", which no plot can be`);
  }
  ok(KIND_IDS.some(id => KINDS[id].heals), 'and at least one of them does mend');
});

test('a kind that mends from nothing has no regeneration to do it with', () => {
  for (const id of KIND_IDS) {
    const k = KINDS[id];
    const t = describe({ kind: id }).tuning;
    if (!k.heals) eq(t.regen, 0, `${id} regenerates but has nowhere to do it`);
    else ok(t.regen > 0, `${id} mends from ${k.heals} at a rate of nothing`);
  }
});

// The one number that has to stay honest across forty-two monsters: how long it takes to kill.
// Run on bare stone — nothing mends — with the proving knife landing every cooldown.
const killTime = d => {
  let f = spawn({ x: 0, z: 0 }, d.tuning);
  let t = 0, id = 0;
  const dt = 1 / 60;
  let next = 0;
  while (!isDead(f) && t < 200) {
    f = step(f, dt, { player: null, onDirt: () => false }, d.tuning);
    if (t >= next) { f = wound(f, KNIFE.damage, ++id); next = t + KNIFE.cooldown; }
    t += dt;
  }
  return isDead(f) ? t : Infinity;
};

test('every monster on the roster can be killed with the knife, and none of them takes all day', () => {
  const all = roster();
  eq(all.length, KIND_IDS.length * VARIANT_IDS.length);
  let worst = 0, worstName = '';
  for (const d of all) {
    const t = killTime(d);
    ok(t < 60, `${d.name} takes ${t.toFixed(1)}s on stone with a knife`);
    if (t > worst) { worst = t; worstName = d.name; }
  }
  ok(worst > 3, `the easiest fight should still be a fight (worst was ${worstName} at ${worst.toFixed(1)}s)`);
});

test('experience tracks how hard the fight is, and every monster is worth something', () => {
  for (const d of roster()) ok(d.xp >= 1, `${d.name} is worth nothing`);
  ok(describe({ kind: 'mire', variant: 'greater' }).xp > describe({ kind: 'rust', variant: 'lesser' }).xp);
});
