// The ladder, as arithmetic on both sides of the fight. Everything here is one rule Aaron gave,
// written as a number, so a later pass that "just nudges" a multiplier finds out which rule it
// has broken rather than finding out a month later in play.

import { test, eq, ok, near } from '../../tools/harness.mjs';
import {
  WORK_RANKS, MONSTER, PLAYER, HP_STEP, DAMAGE_STEP, XP_SCALE,
  playerAt, monsterAt, maxHp, maxMana, soak, costAt, powerAt, effectiveHp, floorDamage,
  xpScale, coinsFor,
} from './ranks.js';
import { RANKS } from './contracts.js';

test('every rank the Society has a board for is on both tables', () => {
  eq(WORK_RANKS, ['iron', 'bronze', 'silver', 'gold']);
  for (const r of WORK_RANKS) {
    ok(MONSTER[r], `no monster multiplier for ${r}`);
    ok(PLAYER[r], `no player profile for ${r}`);
  }
  // Unranked is not work, but it is somebody standing in the proving room and it must answer.
  eq(playerAt('none').hp, playerAt('iron').hp, 'the proving is fought at iron weight');
  eq(monsterAt('mithril'), MONSTER.iron, 'a rank nobody has heard of is iron, not nothing');
  eq(playerAt(undefined).hp, PLAYER.none.hp);
});

test('a rung is a rung: ×3 on what it hits for, ×2.2 on how much of it there is', () => {
  eq(MONSTER.iron.hp, 1);
  eq(MONSTER.iron.damage, 1);
  for (let i = 1; i < WORK_RANKS.length; i++) {
    const a = MONSTER[WORK_RANKS[i - 1]], b = MONSTER[WORK_RANKS[i]];
    near(b.damage / a.damage, DAMAGE_STEP, 1e-3);
    near(b.hp / a.hp, HP_STEP, 1e-3);
  }
  ok(DAMAGE_STEP > HP_STEP, 'damage has to climb faster than health or nothing one-shots anybody');
});

test('the player climbs too — more of you, cheaper spells, and everything lands harder', () => {
  for (let i = 1; i < WORK_RANKS.length; i++) {
    const a = playerAt(WORK_RANKS[i - 1]), b = playerAt(WORK_RANKS[i]);
    ok(b.hp > a.hp && b.mana > a.mana, `${WORK_RANKS[i]} is not bigger than ${WORK_RANKS[i - 1]}`);
    ok(b.resist > a.resist && b.thrift > a.thrift, `${WORK_RANKS[i]} is no tougher`);
    ok(b.power > a.power, `${WORK_RANKS[i]} abilities are no stronger`);
    ok(b.resist < 0.5, 'resistance must never be most of a blow');
  }
  eq(maxHp('iron'), 100, 'iron is the yardstick the proving was tuned against and must not move');
  eq(maxMana('iron'), 100);
  eq(powerAt('iron'), 1);
});

test('resistance takes a bite out of a blow and thrift out of a cost, and neither reaches zero', () => {
  eq(soak('iron', 50), 50, 'iron resists nothing');
  ok(soak('gold', 50) < 50 && soak('gold', 50) > 0);
  eq(soak('iron', -10), 0, 'a negative blow is not a heal');
  eq(costAt('iron', 20), 20);
  ok(costAt('gold', 20) < 20);
  eq(costAt('gold', 1), 1, 'thrift must never make something free');
  eq(effectiveHp('iron'), 100);
  ok(effectiveHp('gold') > effectiveHp('silver'));
});

// Aaron: "A silver rank monster should be able to kill an iron rank user in one shot, which is why
// monsters the user encounters must be same rank or lower as the user."
test('the damage floor is that sentence, said as a number', () => {
  eq(floorDamage('iron'), 0, 'iron has nothing two rungs below it');
  eq(floorDamage('bronze'), 0);
  eq(floorDamage('silver'), effectiveHp('iron'));
  eq(floorDamage('gold'), effectiveHp('bronze'));
  ok(floorDamage('silver') >= maxHp('iron'));
});

test('work below your rank is a trickle, and work at it is all of it', () => {
  eq(xpScale('iron', 'iron'), 1);
  eq(xpScale('none', 'iron'), 1, 'the proving is not a rung below anything');
  eq(xpScale('gold', 'gold'), 1);
  // Aaron: "you shouldn't start at 2nd star bronze when you have finished doing Iron tasks".
  ok(xpScale('bronze', 'iron') <= 0.15, 'iron work at bronze rank still pays too well');
  ok(xpScale('silver', 'iron') < xpScale('bronze', 'iron'));
  ok(xpScale('gold', 'iron') < xpScale('silver', 'iron'));
  ok(xpScale('gold', 'iron') > 0, 'it should be a trickle, not nothing at all');
  eq(XP_SCALE[0], 1);
});

test('a contract you are only just allowed to take pays the whole of itself', () => {
  for (let i = 1; i < RANKS.length; i++) eq(xpScale(RANKS[i], RANKS[i]), 1);
});

test('every monster is carrying coins, and a bigger one is carrying more', () => {
  const mid = () => 0.5;
  eq(coinsFor(0, 0.35, mid), 1, 'a monster worth nothing still has something on it');
  eq(coinsFor(100, 0, mid), 1, 'and so does one at a zeroed rate');
  ok(coinsFor(239, 0.35, mid) > coinsFor(14, 0.35, mid) * 10);
  // The spread is either side of the worth, never a multiplier on it.
  const lo = coinsFor(100, 0.5, () => 0), hi = coinsFor(100, 0.5, () => 0.999);
  ok(lo < hi && lo > 30 && hi < 70, `${lo}..${hi} either side of 50`);
});
