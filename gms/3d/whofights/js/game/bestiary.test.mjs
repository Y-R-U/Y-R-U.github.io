// One body, many monsters — so the rule that matters is that every one of them is still a fight
// somebody could win with the same knife the proving hands out.

import { test, eq, ok, near } from '../../tools/harness.mjs';
import { KINDS, KIND_IDS, VARIANTS, VARIANT_IDS, describe, roster, kindOf, variantOf, rankOfKind } from './bestiary.js';
import { EARTH, spawn, step, wound, isDead } from './foe.js';
import { SURFACES } from './ground.js';
import { KNIFE, WEAPONS } from './weapons.js';
import { WORK_RANKS, maxHp, soak, playerAt, floorDamage } from './ranks.js';

test('an unnamed spawn is the earth elemental the proving room was built around', () => {
  const d = describe({});
  eq(d.kind, 'earth');
  eq(d.variant, 'none');
  eq(d.name, 'Iron-rank Earth Elemental');
  eq(d.plainName, 'Earth Elemental');
  eq(d.rank, 'iron');
  eq(d.tuning.hp, EARTH.hp);
  eq(d.tuning.speed, EARTH.speed);
  eq(d.tuning.damage, EARTH.damage);
  eq(d.heals, 'dirt');
});

test('a kind nobody wrote falls back rather than throwing', () => {
  eq(kindOf('griffin').id, 'earth');
  eq(variantOf('haunted').id, 'none');
  eq(describe({ kind: 'griffin', variant: 'haunted' }).name, 'Iron-rank Earth Elemental');
  eq(describe({ kind: 'earth', rank: 'mithril' }).rank, 'iron', 'a rank nobody has heard of is the kind\u2019s own');
});

test('a variant multiplies the kind it is applied to, not the base', () => {
  const plain = describe({ kind: 'gale' });
  const great = describe({ kind: 'gale', variant: 'greater' });
  eq(great.name, 'Iron-rank Greater Gale Elemental');
  near(great.tuning.hp / plain.tuning.hp, VARIANTS.greater.hp, 1e-3);
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
    'Iron-rank The Thing in the Reeds', 'the rank always goes in front — Aaron asked for it in every name');
  eq(describe({ kind: 'mire', variant: 'greater', name: 'The Thing in the Reeds' }).plainName,
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

// The one number that has to stay honest across eighty-four monsters: how long it takes to kill.
// Run on bare stone — nothing mends — with a weapon landing every cooldown.
const killTime = (d, w = KNIFE) => {
  let f = spawn({ x: 0, z: 0 }, d.tuning);
  let t = 0, id = 0;
  const dt = 1 / 60;
  let next = 0;
  while (!isDead(f) && t < 400) {
    f = step(f, dt, { player: null, onDirt: () => false }, d.tuning);
    if (t >= next) { f = wound(f, w.damage, ++id); next = t + w.cooldown; }
    t += dt;
  }
  return isDead(f) ? t : Infinity;
};

// What a player of that rank is holding by the time they are meeting that rank's work. Not a
// guess: it is the dearest weapon a contract of the rank below pays for in one or two jobs.
// This used to be the knife for all eighty-four, which stopped being a fair yardstick the moment
// a rank multiplied what a monster is made of — a Silver-rank Processional is not supposed to
// die to Society property.
const ARMED = { iron: KNIFE, bronze: WEAPONS.shortsword, silver: WEAPONS.warsword, gold: WEAPONS.maul };

test('every monster on the roster dies to what its rank is fought with, and none of them takes all day', () => {
  const all = roster();
  eq(all.length, KIND_IDS.length * VARIANT_IDS.length);
  let worst = 0, worstName = '';
  for (const d of all) {
    const w = ARMED[d.rank];
    const t = killTime(d, w);
    ok(t < 60, `${d.name} takes ${t.toFixed(1)}s on stone with a ${w.name}`);
    if (t > worst) { worst = t; worstName = `${d.name} with a ${w.name}`; }
  }
  ok(worst > 3, `the easiest fight should still be a fight (worst was ${worstName} at ${worst.toFixed(1)}s)`);
});

// Aaron's rule for ranks, and the reason the boards gate what you may take: "a silver rank monster
// should be able to kill an iron rank user in one shot".
test('a monster two rungs up kills an iron adventurer where it stands', () => {
  const iron = maxHp('iron');
  for (const kind of KIND_IDS) {
    const silver = describe({ kind, rank: 'silver' });
    ok(soak('iron', silver.tuning.damage) >= iron,
      `${silver.name} hits for ${silver.tuning.damage} against ${iron} health — an iron adventurer would survive it`);
  }
});

test('a rank is worth the same wherever it is met — one rung up is one rung up for every kind', () => {
  for (let i = 1; i < WORK_RANKS.length; i++) {
    const below = WORK_RANKS[i - 1], here = WORK_RANKS[i];
    for (const kind of KIND_IDS) {
      const a = describe({ kind, rank: below }), b = describe({ kind, rank: here });
      near(b.tuning.hp / a.tuning.hp, 2.2, 0.02, `${kind}: ${below} → ${here} health`);
      // Damage, except where a rank's floor has caught a feeble kind and lifted it. That is the
      // floor doing its job and it only ever bites upward, so the pair is checked and skipped.
      const floored = d => d.tuning.damage <= floorDamage(d.rank) + 1e-6;
      if (floored(a) || floored(b)) {
        // Two floored ranks climb by what an adventurer climbs by (×2.7), not by ×3, because
        // that is what the floor is measured against.
        ok(b.tuning.damage > a.tuning.damage * 2.5, `${kind}: ${below} → ${here} went backwards`);
        continue;
      }
      near(b.tuning.damage / a.tuning.damage, 3, 0.02, `${kind}: ${below} → ${here} damage`);
    }
  }
});

// The other half of it: the rung you are standing on has to keep pace, or every promotion would
// be a step into a fight nobody can win.
test('being raised a rank is worth roughly what being met by one costs', () => {
  for (let i = 1; i < WORK_RANKS.length; i++) {
    const a = playerAt(WORK_RANKS[i - 1]), b = playerAt(WORK_RANKS[i]);
    const effective = p => p.hp / (1 - p.resist);
    const gained = effective(b) / effective(a);
    ok(gained > 2.4 && gained < 3, `a ${WORK_RANKS[i]} adventurer is ${gained.toFixed(2)}× an ${WORK_RANKS[i - 1]} one against a monster hitting 3× as hard`);
    ok(b.power > a.power, `${WORK_RANKS[i]} abilities are no better than ${WORK_RANKS[i - 1]} ones`);
    ok(b.mana > a.mana && b.thrift >= a.thrift);
  }
});

test('an iron kind fought at iron rank is exactly the monster the table wrote down', () => {
  for (const kind of KIND_IDS) {
    if (rankOfKind(kind) !== 'iron') continue;
    const d = describe({ kind });
    const t = { ...EARTH, ...KINDS[kind].tuning };
    near(d.tuning.hp, t.hp, 0.01, `${kind} hp drifted`);
    near(d.tuning.damage, t.damage, 0.01, `${kind} damage drifted`);
    near(d.tuning.regen, t.regen, 0.01, `${kind} regen drifted`);
  }
});

test('experience tracks how hard the fight is, and every monster is worth something', () => {
  for (const d of roster()) ok(d.xp >= 1, `${d.name} is worth nothing`);
  ok(describe({ kind: 'mire', variant: 'greater' }).xp > describe({ kind: 'rust', variant: 'lesser' }).xp);
});
