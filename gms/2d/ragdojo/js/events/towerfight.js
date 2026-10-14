// THE TOWER's fights: a normal local Match whose opponent is built for the floor and scaled to
// the player's own body and kit, so floor 12 is the same climb for a white belt and a
// grandmaster. Balance: tools/eventtower.mjs (sims every floor at several saves).

import { Match } from '../match.js';
import { derive, ranksFor, activeMoves, playerRankAt, TOTAL_LEVELS } from '../config.js';
import { FLOORS } from './tower.js?v=20261014-ev';

const NAMES = ['DOORMAN', 'STAIR SWEEPER', 'LANDING LOU', 'BANISTER BEN', 'TWIN TREADS',
  'LIFT ATTENDANT', 'DRAUGHTY DOT', 'SPILT SAM', 'THE TWINS', 'RUBBER RITA', 'NIB NOBLE', 'THE TOP'];
const HAZARD = { 7: 'wind', 8: 'coffee', 10: 'eraser', 11: 'pencil', 12: 'rain' };
const PAIRS = new Set([5, 9]);

export const KNOBS = { hp0: 52, hp1: 2.2, dmg0: 4.6, dmg1: 1.7, sk0: 0.26, sk1: 0.56, m: 1 };

/** How much the player brings: their punch, their specials, and how much they can take. */
export function towerPower(save) {
  const d = derive(save);
  const owned = activeMoves(save).filter((m) => save.moves?.[m.id]?.owned);
  const lv = owned.reduce((s, m) => s + (save.moves[m.id].power | 0) + (save.moves[m.id].cd | 0) * 0.5, 0);
  return {
    off: d.atkMul * (1 + d.crit) * (1 + Math.min(0.9, owned.length * 0.05 + lv * 0.012)),
    tough: (d.maxHp * (1 + d.heal)) / 100 / d.dr,
  };
}

export function towerLevel(floor, save, k = KNOBS) {
  const f = Math.max(1, Math.min(FLOORS, floor | 0)), u = (f - 1) / (FLOORS - 1), c = Math.pow(u, 0.75);
  const p = towerPower(save), g = k.m * 0.38 * Math.pow(p.off * p.tough, 0.41);
  const tier = Math.round(u * 8), top = f === FLOORS, n = PAIRS.has(f) ? 2 : 1;
  const enemies = [];
  for (let i = 0; i < n; i++) {
    enemies.push({
      name: n > 1 ? `${NAMES[f - 1]} ${i ? 'II' : 'I'}` : NAMES[f - 1], tier,
      hp: Math.round(k.hp0 * (1 + k.hp1 * c) * p.off * g * (top ? 1.06 : 1) * (n > 1 ? 0.6 : 1)),
      dmg: k.dmg0 * (1 + k.dmg1 * c) * p.tough * g * (top ? 1.05 : 1),
      speed: 130 + 100 * u, skill: Math.min(0.86, k.sk0 + k.sk1 * u),
      scale: top ? 1.14 : 1 + tier * 0.008, mass: top ? 1.35 : 1,
      moves: Math.min(6, 1 + Math.floor(u * 5.5)), boss: top,
    });
  }
  const R = ranksFor(save.theme);
  return {
    idx: 300 + f, tier, kind: top ? 'champion' : 'fight', enemies, event: HAZARD[f] || null, reward: 0,
    dojo: 'THE TOWER', title: top ? 'THE TOP FLOOR' : `FLOOR ${f} / ${FLOORS}`, floor: f, rankName: R[tier].name,
  };
}

export class TowerMatch extends Match {
  constructor({ floor, save, onEnd, autoplay = false }) {
    super({ level: towerLevel(floor, save), save, onEnd, autoplay });
    this.tower = this.level.floor;
  }

  build() {
    super.build();
    const R = ranksFor(this.save.theme);
    this.player.rank = R[playerRankAt(Math.min(TOTAL_LEVELS - 1, this.save.level | 0))];
  }
}
