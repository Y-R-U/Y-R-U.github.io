import { UNIT_TYPES } from '../data/units.js';

/**
 * Resolve combat between attacker and defender armies.
 * Returns a result object with the outcome and log.
 *
 * @param {Army} attacker
 * @param {Army} defender
 * @param {City|null} city - defending city (adds bonus) or null
 * @returns {{ attackerWins: boolean, log: string[], xpGained: number }}
 */
export function resolveCombat(attacker, defender, city) {
  // Deep-copy unit lists so we can mutate
  const atkUnits = attacker.units.map(u => ({ ...u }));
  const defUnits = defender.units.map(u => ({ ...u }));

  const cityDefBonus = city ? city.defenseBonus : 0;
  const hasSiege     = attacker.hasSiege();
  const effectiveCityBonus = hasSiege ? Math.max(0, cityDefBonus - 2) : cityDefBonus;

  const log = [];
  let rounds = 0;
  const MAX_ROUNDS = 60;

  while (atkUnits.length > 0 && defUnits.length > 0 && rounds < MAX_ROUNDS) {
    rounds++;

    // Calculate attack score this round
    const atkBase  = atkUnits.reduce((s, u) => s + UNIT_TYPES[u.type].attack,  0);
    const defBase  = defUnits.reduce((s, u) => s + UNIT_TYPES[u.type].defense, 0);
    const atkBonus = attacker.hero ? attacker.hero.attack  : 0;
    const defBonus = (defender.hero ? defender.hero.defense : 0) + effectiveCityBonus;

    const atkRoll = atkBase + atkBonus + Math.floor(Math.random() * 6) + 1;
    const defRoll = defBase + defBonus + Math.floor(Math.random() * 6) + 1;

    if (atkRoll > defRoll) {
      // Attacker wins round — kill weakest defender
      defUnits.sort((a, b) => UNIT_TYPES[a.type].strength - UNIT_TYPES[b.type].strength);
      const killed = defUnits.shift();
      log.push(`Round ${rounds}: Attacker kills ${UNIT_TYPES[killed.type].name}`);
    } else {
      // Defender wins round — kill weakest attacker
      atkUnits.sort((a, b) => UNIT_TYPES[a.type].strength - UNIT_TYPES[b.type].strength);
      const killed = atkUnits.shift();
      log.push(`Round ${rounds}: Defender kills ${UNIT_TYPES[killed.type].name}`);
    }
  }

  const attackerWins = atkUnits.length > 0 && defUnits.length === 0;
  const xpGained = Math.min(5 + Math.floor(rounds / 2), 20);

  return {
    attackerWins,
    remainingAttackerUnits: atkUnits,
    remainingDefenderUnits: defUnits,
    log,
    rounds,
    xpGained,
    cityDefBonus: effectiveCityBonus,
  };
}

/**
 * Apply combat results back to the actual army objects.
 * Kills heroes if their army is wiped.
 *
 * @param {Army} attacker
 * @param {Army} defender
 * @param {object} result - from resolveCombat
 */
export function applyCombatResult(attacker, defender, result) {
  attacker.units = result.remainingAttackerUnits;
  defender.units = result.remainingDefenderUnits;

  if (result.attackerWins) {
    // Defender army wiped
    if (defender.hero) { defender.hero.alive = false; defender.hero = null; }
    // Give attacker's hero XP
    if (attacker.hero) attacker.hero.gainXP(result.xpGained);
  } else {
    // Attacker army wiped
    if (attacker.hero) { attacker.hero.alive = false; attacker.hero = null; }
    // Give defender's hero XP
    if (defender.hero) defender.hero.gainXP(result.xpGained);
  }
}
