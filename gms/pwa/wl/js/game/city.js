import { CITY_PRODUCTION } from '../data/units.js';

// Special loot tables for ruins
const RUIN_LOOT = [
  { type:'gold', amount:30,  label:'You find 30 gold!' },
  { type:'gold', amount:60,  label:'You find 60 gold!' },
  { type:'gold', amount:100, label:'A chest of 100 gold!' },
  { type:'unit', unit:'WIZARD',  label:'A Wizard joins your cause!' },
  { type:'unit', unit:'GIANT',   label:'A Giant swears fealty!' },
  { type:'unit', unit:'DRAGON',  label:'A Dragon awakens to serve you!' },
  { type:'nothing', label:'Only dust and bones remain.' },
  { type:'nothing', label:'Ancient traps — barely escaped!' },
];

export class City {
  /**
   * @param {number} x
   * @param {number} y
   * @param {string} type - 'village'|'town'|'city'|'capital'|'ruins'|'temple'
   * @param {string} name
   * @param {Player|null} owner
   */
  constructor(x, y, type, name, owner) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.name = name;
    this.owner = owner;
    this.garrison = [];     // Unit[] defending the city
    this.explored = false;  // have ruins been searched?
    this.defenseBonus = this._baseDefense();
  }

  _baseDefense() {
    const bonuses = { village:1, town:2, city:3, capital:4, ruins:0, temple:1 };
    return bonuses[this.type] || 0;
  }

  /** @returns {number} gold earned this turn */
  incomePerTurn() {
    if (!this.owner) return 0;
    return CITY_PRODUCTION[this.type]?.gold ?? 0;
  }

  /** @returns {string[]} unit type IDs available to train */
  availableUnits() {
    return CITY_PRODUCTION[this.type]?.units ?? [];
  }

  /** @returns {number} max garrison size */
  maxGarrison() {
    return CITY_PRODUCTION[this.type]?.maxGarrison ?? 0;
  }

  /** @returns {string} display label */
  typeLabel() {
    return CITY_PRODUCTION[this.type]?.label ?? 'Location';
  }

  /** Try to explore ruins; returns loot object or null if already explored */
  exploreRuins() {
    if (this.type !== 'ruins' || this.explored) return null;
    this.explored = true;
    const roll = Math.floor(Math.random() * RUIN_LOOT.length);
    return RUIN_LOOT[roll];
  }

  /** @returns {boolean} whether city is contested (owner != null but has enemy garrison) */
  isNeutral() { return this.owner === null; }
}
