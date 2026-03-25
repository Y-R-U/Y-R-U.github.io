import { HERO_NAMES } from '../data/factions.js';

let heroCounter = 0;

export class Hero {
  /**
   * @param {Player} player
   * @param {string} name
   * @param {number} x
   * @param {number} y
   */
  constructor(player, name, x, y) {
    this.id = heroCounter++;
    this.player = player;
    this.name = name;
    this.x = x;
    this.y = y;
    this.level = 1;
    this.experience = 0;
    this.expToNext = 10;
    this.attack = 1;    // bonus attack added to army
    this.defense = 1;   // bonus defense added to army
    this.move = 5;      // hero's base movement (army takes max of unit moves)
    this.alive = true;
    this.maxStackBonus = 0;  // extra units beyond base 8 this hero can command
  }

  /** Max units this hero can command */
  maxCommand() { return 8 + this.maxStackBonus; }

  /** Gain XP; returns true if levelled up */
  gainXP(amount) {
    this.experience += amount;
    if (this.experience >= this.expToNext) {
      this.levelUp();
      return true;
    }
    return false;
  }

  levelUp() {
    this.level++;
    this.experience -= this.expToNext;
    this.expToNext = Math.floor(this.expToNext * 1.5);
    // Alternate attack/defense bonus each level
    if (this.level % 2 === 0) this.attack++;
    else this.defense++;
    // Every 3 levels, can command one more unit
    if (this.level % 3 === 0) this.maxStackBonus++;
  }

  /** @returns {string} display string */
  toString() { return `${this.name} (Lvl ${this.level})`; }

  /** Create a random hero for a player */
  static random(player, x, y) {
    const name = HERO_NAMES[Math.floor(Math.random() * HERO_NAMES.length)];
    return new Hero(player, name, x, y);
  }

  /** Cost to hire a new hero from a city */
  static hireCost() { return 40; }
}
