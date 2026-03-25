import { resolveCombat, applyCombatResult } from './combat.js';
import { Hero }       from './hero.js';
import { Army }       from './army.js';
import { UNIT_TYPES } from '../data/units.js';

/**
 * Manages turn sequencing, army movement, combat, and city actions.
 * Calls back into state/UI via the provided callbacks object.
 *
 * @param {World} world
 * @param {{ onCombat, onMessage, onGameOver, onTurnEnd, onCityCapture }} callbacks
 */
export class TurnManager {
  constructor(world, callbacks) {
    this.world     = world;
    this.callbacks = callbacks;
  }

  // ---- Turn flow ----

  /** Begin a player's turn: collect income, reset move points */
  startTurn(player) {
    player.turnEnded = false;
    player.collectIncome();
    player.resetArmies();
    this.world.log(`--- Turn ${this.world.turn}: ${player.name} ---`);
  }

  /** End current player's turn; advance to next */
  endTurn() {
    const w = this.world;
    const player = w.currentPlayer();
    player.turnEnded = true;

    let next = (w.currentPlayerIdx + 1) % w.players.length;
    let loops = 0;
    while (w.players[next].eliminated && loops < w.players.length) {
      next = (next + 1) % w.players.length;
      loops++;
    }
    if (next <= w.currentPlayerIdx) w.turn++;

    w.currentPlayerIdx = next;

    if (w.checkWinCondition()) {
      this.callbacks.onGameOver(w.winner);
      return;
    }

    this.startTurn(w.currentPlayer());
    this.callbacks.onTurnEnd(w.currentPlayer());
  }

  // ---- Army movement ----

  /**
   * Move army along A* path to (toX, toY).
   * Handles combat, city capture, ruins, and temple events.
   * @param {Army} army
   * @param {number} toX
   * @param {number} toY
   * @returns {{ moved: boolean, reason: string }}
   */
  moveArmy(army, toX, toY) {
    const w    = this.world;
    const path = army.findPath(w, toX, toY);
    if (!path) return { moved: false, reason: 'No path' };

    let stepsLeft = army.movePoints;
    let stepsTaken = 0;

    for (const step of path.path) {
      const tile     = w.getTile(step.x, step.y);
      const moveCost = army.hasFlying() ? 1 : (tile.terrain.move || 1);
      if (moveCost > stepsLeft) break;

      const enemies = w.getEnemyArmiesAt(step.x, step.y, army.player);
      if (enemies.length > 0) {
        w.moveArmy(army, step.x, step.y);
        stepsLeft -= moveCost;
        stepsTaken++;
        this._doCombat(army, enemies[0], step.x, step.y);
        army.movePoints = 0;
        army.acted = true;
        return { moved: true, reason: 'combat' };
      }

      w.moveArmy(army, step.x, step.y);
      stepsLeft -= moveCost;
      stepsTaken++;
    }

    army.movePoints = Math.max(0, stepsLeft);

    const destCity = w.getCityAt(army.x, army.y);
    if (destCity && destCity.owner !== army.player) {
      if (destCity.garrison.length > 0) {
        const garrisonArmy = this._garrisonToArmy(destCity);
        this._doCombat(army, garrisonArmy, army.x, army.y, destCity);
      } else {
        this._captureCity(army, destCity);
      }
    }

    // Explore ruins on arrival
    if (destCity && destCity.type === 'ruins' && !destCity.explored) {
      const loot = destCity.exploreRuins();
      if (loot) this._applyLoot(army, loot);
    }

    return { moved: stepsTaken > 0, reason: 'moved' };
  }

  // ---- Internals ----

  /** Build a temporary Army-like object from a city's garrison */
  _garrisonToArmy(city) {
    return {
      id: -1,
      player: city.owner,
      x: city.x, y: city.y,
      units: city.garrison,
      hero: null,
      hasFlying:    () => false,
      hasSiege:     () => false,
      totalAttack:  () => city.garrison.reduce((s, u) => s + (UNIT_TYPES[u.type]?.attack  || 1), 0),
      totalDefense: () => city.garrison.reduce((s, u) => s + (UNIT_TYPES[u.type]?.defense || 1), 0),
      maxUnits:     () => city.maxGarrison(),
      movePoints:   0,
    };
  }

  _doCombat(attacker, defender, x, y, city = null) {
    const w        = this.world;
    const cityHere = city || w.getCityAt(x, y);
    const result   = resolveCombat(attacker, defender, cityHere);
    applyCombatResult(attacker, defender, result);

    if (result.attackerWins) {
      if (defender.player && defender.id !== -1) {
        w.removeArmy(defender);
      } else if (cityHere) {
        cityHere.garrison = [];
      }
      if (cityHere && cityHere.owner !== attacker.player) {
        this._captureCity(attacker, cityHere);
      }
      w.log(`${attacker.player.name} won battle at (${x},${y})`);
    } else {
      w.removeArmy(attacker);
      w.log(`${attacker.player.name}'s army was destroyed at (${x},${y})`);
    }

    if (attacker.units?.length === 0 && !attacker.hero && attacker.id !== -1) {
      w.removeArmy(attacker);
    }

    this.callbacks.onCombat(result, attacker.player?.name, defender.player?.name ?? city?.owner?.name);
    w.checkWinCondition();
  }

  _captureCity(army, city) {
    const prevOwner = city.owner;
    this.world.captureCity(city, army.player);
    city.garrison = [];
    this.world.log(`${army.player.name} captured ${city.name}`);
    this.callbacks.onCityCapture(city, army.player, prevOwner);
    this.world.checkWinCondition();
  }

  _applyLoot(army, loot) {
    const player = army.player;
    if (loot.type === 'gold') {
      player.gold += loot.amount;
    } else if (loot.type === 'unit' && army.units.length < army.maxUnits()) {
      army.units.push({ type: loot.unit, hp: 1 });
    }
    this.world.log(`${player.name}: ${loot.label}`);
    this.callbacks.onMessage(loot.label);
  }

  // ---- City management ----

  /**
   * Hire a hero from a city for the current player.
   * @param {Player} player
   * @param {City} city
   * @returns {{ ok: boolean, army: Army|null, reason: string }}
   */
  hireHero(player, city) {
    const cost = Hero.hireCost();
    if (player.gold < cost) return { ok: false, army: null, reason: `Need ${cost} gold` };
    player.gold -= cost;
    const hero = Hero.random(player, city.x, city.y);
    const army = new Army(player, city.x, city.y);
    army.hero  = hero;
    army.movePoints = army.maxMovePoints();
    this.world.armies.push(army);
    this.world.tiles[city.y][city.x].armies.push(army);
    player.armies.push(army);
    this.world.log(`${player.name} hired hero ${hero.name}`);
    return { ok: true, army, reason: 'ok' };
  }

  /**
   * Train a unit in city; adds to targetArmy or garrison.
   * @param {Player} player
   * @param {City} city
   * @param {string} unitTypeId
   * @param {Army|null} targetArmy
   * @returns {{ ok: boolean, reason: string }}
   */
  trainUnit(player, city, unitTypeId, targetArmy) {
    const unitDef = UNIT_TYPES[unitTypeId];
    if (!unitDef) return { ok: false, reason: 'Unknown unit type' };
    if (player.gold < unitDef.cost) return { ok: false, reason: `Need ${unitDef.cost} gold` };
    if (!city.availableUnits().includes(unitTypeId)) return { ok: false, reason: 'Not available here' };

    player.gold -= unitDef.cost;
    const unit = { type: unitTypeId, hp: 1 };

    if (targetArmy && targetArmy.units.length < targetArmy.maxUnits()) {
      targetArmy.units.push(unit);
      return { ok: true, reason: 'ok' };
    }
    if (city.garrison.length < city.maxGarrison()) {
      city.garrison.push(unit);
      return { ok: true, reason: 'ok' };
    }

    player.gold += unitDef.cost; // refund
    return { ok: false, reason: 'No room in army or garrison' };
  }
}
