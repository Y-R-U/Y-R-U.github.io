// Player (human or AI) state
export class Player {
  /**
   * @param {number} id - player index
   * @param {object} faction - FACTIONS entry
   * @param {boolean} isHuman - true for human-controlled
   */
  constructor(id, faction, isHuman) {
    this.id = id;
    this.faction = faction;
    this.isHuman = isHuman;
    this.gold = 50;
    this.cities = [];       // City[]
    this.armies = [];       // Army[]
    this.eliminated = false;
    this.turnEnded = false;
    this.citiesOwnedLastTurn = 0;
  }

  /** @returns {string} faction color */
  get color() { return this.faction.color; }

  /** @returns {string} faction name */
  get name() { return this.faction.name; }

  /** @returns {boolean} has at least one city */
  isAlive() { return !this.eliminated && this.cities.length > 0; }

  /** Collect gold from all owned cities */
  collectIncome() {
    for (const city of this.cities) {
      this.gold += city.incomePerTurn();
    }
    this.citiesOwnedLastTurn = this.cities.length;
  }

  /** Reset all army move points for a new turn */
  resetArmies() {
    for (const army of this.armies) {
      army.resetMovePoints();
      army.acted = false;
    }
  }
}
