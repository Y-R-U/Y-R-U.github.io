import { UNIT_TYPES } from '../data/units.js';

/**
 * AI decision-making for non-human players.
 * Runs synchronously during AI_TURN phase.
 * Strategy: aggressive expansion — move toward nearest unowned city,
 *           attack weaker enemy armies, hire units when affordable.
 */
export class AIPlayer {
  /**
   * @param {Player} player
   * @param {World} world
   * @param {TurnManager} turnManager
   */
  constructor(player, world, turnManager) {
    this.player      = player;
    this.world       = world;
    this.turnManager = turnManager;
  }

  /** Execute full AI turn; call endTurn when done */
  takeTurn() {
    this._buyUnits();
    this._moveArmies();
    // Hire hero if no hero exists and affordable
    if (!this.player.armies.some(a => a.hero) && this.player.cities.length > 0) {
      this._tryHireHero();
    }
    this.turnManager.endTurn();
  }

  // ---- Buying ----

  _buyUnits() {
    const player = this.player;
    for (const city of [...player.cities]) {
      if (city.garrison.length >= city.maxGarrison()) continue;
      const available = city.availableUnits();
      // Pick most expensive unit we can afford (up to half gold reserve)
      const budget = Math.floor(player.gold * 0.5);
      const choices = available
        .map(id => UNIT_TYPES[id])
        .filter(u => u.cost <= budget && u.cost <= player.gold)
        .sort((a, b) => b.cost - a.cost);

      if (choices.length > 0) {
        const pick = choices[0];
        const result = this.turnManager.trainUnit(player, city, pick.id, null);
        // continue buying cheaper units if gold allows
      }
    }
  }

  _tryHireHero() {
    const capital = this.player.cities.find(c => c.type === 'capital') || this.player.cities[0];
    if (capital) {
      this.turnManager.hireHero(this.player, capital);
    }
  }

  // ---- Movement ----

  _moveArmies() {
    // Process all armies that still have move points
    for (const army of [...this.player.armies]) {
      if (army.movePoints <= 0 || army.units.length === 0) continue;
      this._moveArmy(army);
    }
  }

  _moveArmy(army) {
    const w = this.world;

    // Priority 1: attack adjacent enemy armies
    const adjEnemy = this._findAdjacentEnemy(army);
    if (adjEnemy) {
      this.turnManager.moveArmy(army, adjEnemy.x, adjEnemy.y);
      return;
    }

    // Priority 2: capture nearest undefended/neutral city
    const targetCity = this._findNearestTargetCity(army);
    if (targetCity) {
      const result = this.turnManager.moveArmy(army, targetCity.x, targetCity.y);
      return;
    }

    // Priority 3: move toward any enemy
    const enemyArmy = this._findNearestEnemyArmy(army);
    if (enemyArmy) {
      this._moveToward(army, enemyArmy.x, enemyArmy.y);
    }
  }

  _findAdjacentEnemy(army) {
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = army.x + dx, ny = army.y + dy;
      const tile = this.world.getTile(nx, ny);
      if (!tile) continue;
      const enemies = this.world.getEnemyArmiesAt(nx, ny, this.player);
      if (enemies.length > 0) {
        // Only attack if we're stronger
        const ourStr  = army.totalAttack();
        const theirStr = enemies[0].totalDefense();
        if (ourStr >= theirStr * 0.7) return { x: nx, y: ny };
      }
    }
    return null;
  }

  _findNearestTargetCity(army) {
    let best = null, bestDist = Infinity;
    for (const city of this.world.cities) {
      if (city.owner === this.player) continue;
      if (city.type === 'ruins' && city.explored) continue;
      // Check if city is lightly defended vs our strength
      const garrisonStrength = city.garrison.reduce(
        (s, u) => s + (UNIT_TYPES[u.type]?.strength || 1), 0
      );
      if (garrisonStrength > army.totalAttack() * 1.5) continue;

      const dist = Math.abs(city.x - army.x) + Math.abs(city.y - army.y);
      if (dist < bestDist) { best = city; bestDist = dist; }
    }
    return best;
  }

  _findNearestEnemyArmy(army) {
    let best = null, bestDist = Infinity;
    for (const other of this.world.armies) {
      if (other.player === this.player) continue;
      const dist = Math.abs(other.x - army.x) + Math.abs(other.y - army.y);
      if (dist < bestDist) { best = other; bestDist = dist; }
    }
    return best;
  }

  _moveToward(army, tx, ty) {
    // Find path and take as many steps as move points allow
    const path = army.findPath(this.world, tx, ty);
    if (!path || path.path.length === 0) return;
    // Move toward but don't exceed move points — moveArmy handles this
    this.turnManager.moveArmy(army, tx, ty);
  }
}
