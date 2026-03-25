import { UNIT_TYPES } from '../data/units.js';
import { TERRAIN } from './tile.js';

let armyCounter = 0;

export class Army {
  /**
   * @param {Player} player
   * @param {number} x
   * @param {number} y
   */
  constructor(player, x, y) {
    this.id = armyCounter++;
    this.player = player;
    this.x = x;
    this.y = y;
    this.units = [];    // { type: string, hp: number }[]
    this.hero = null;   // Hero | null
    this.movePoints = 0;
    this.acted = false;
  }

  /** @returns {number} max move points this turn */
  maxMovePoints() {
    const heroMove = this.hero ? this.hero.move : 0;
    const unitMoves = this.units.map(u => UNIT_TYPES[u.type].move);
    const base = unitMoves.length > 0 ? Math.min(...unitMoves) : 0;
    return Math.max(base, heroMove);
  }

  resetMovePoints() {
    this.movePoints = this.maxMovePoints();
  }

  /** @returns {boolean} any unit in army can fly */
  hasFlying() {
    return this.units.some(u => UNIT_TYPES[u.type].flying);
  }

  /** @returns {boolean} army has a siege unit */
  hasSiege() {
    return this.units.some(u => UNIT_TYPES[u.type].siege);
  }

  /** @returns {number} total attack value including hero bonus */
  totalAttack() {
    const unitAtk = this.units.reduce((s, u) => s + UNIT_TYPES[u.type].attack, 0);
    const heroAtk = this.hero ? this.hero.attack : 0;
    return unitAtk + heroAtk;
  }

  /** @returns {number} total defense value including hero bonus */
  totalDefense() {
    const unitDef = this.units.reduce((s, u) => s + UNIT_TYPES[u.type].defense, 0);
    const heroDef = this.hero ? this.hero.defense : 0;
    return unitDef + heroDef;
  }

  /** @returns {number} max stack size */
  maxUnits() { return this.hero ? this.hero.maxCommand() : 8; }

  /** @returns {boolean} can accept more units */
  hasRoom() { return this.units.length < this.maxUnits(); }

  /** @returns {boolean} army is empty (should be removed) */
  isEmpty() { return this.units.length === 0 && !this.hero; }

  /**
   * BFS: returns Map<"x,y", cost> of reachable tiles within movePoints.
   * @param {World} world
   * @returns {Map<string, number>}
   */
  getReachableTiles(world) {
    const reachable = new Map();
    const queue = [{ x: this.x, y: this.y, cost: 0 }];
    reachable.set(`${this.x},${this.y}`, 0);
    const flying = this.hasFlying();

    while (queue.length > 0) {
      const cur = queue.shift();
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const tile = world.getTile(nx, ny);
        if (!tile) continue;

        // Passability
        if (!flying && !tile.terrain.passable) continue;

        const moveCost = cur.cost + (flying ? 1 : (tile.terrain.move || 1));
        if (moveCost > this.movePoints) continue;

        const key = `${nx},${ny}`;
        if (reachable.has(key) && reachable.get(key) <= moveCost) continue;
        reachable.set(key, moveCost);

        // Don't expand through enemy armies (can attack but not pass through)
        const hasEnemy = tile.armies.some(a => a.player !== this.player);
        if (!hasEnemy) {
          queue.push({ x: nx, y: ny, cost: moveCost });
        }
      }
    }

    return reachable;
  }

  /**
   * A* pathfinding to (toX,toY). Returns {path, cost} or null.
   * @param {World} world
   * @param {number} toX
   * @param {number} toY
   * @returns {{ path: {x,y}[], cost: number } | null}
   */
  findPath(world, toX, toY) {
    const flying = this.hasFlying();
    const heuristic = (x, y) => Math.abs(x - toX) + Math.abs(y - toY);

    const open = new Map();
    const closed = new Set();
    const gScore = new Map();
    const parent = new Map();

    const startKey = `${this.x},${this.y}`;
    open.set(startKey, { x: this.x, y: this.y, f: heuristic(this.x, this.y), g: 0 });
    gScore.set(startKey, 0);

    while (open.size > 0) {
      // Pick lowest f
      let curKey = null, curNode = null;
      for (const [k, v] of open) {
        if (!curNode || v.f < curNode.f) { curKey = k; curNode = v; }
      }
      open.delete(curKey);
      closed.add(curKey);

      if (curNode.x === toX && curNode.y === toY) {
        // Reconstruct path
        const path = [];
        let k = curKey;
        while (parent.has(k)) { const n = parent.get(k); path.unshift(n); k = `${n.x},${n.y}`; }
        path.push({ x: toX, y: toY });
        return { path, cost: gScore.get(curKey) };
      }

      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curNode.x + dx;
        const ny = curNode.y + dy;
        const tile = world.getTile(nx, ny);
        if (!tile) continue;
        if (!flying && !tile.terrain.passable) continue;

        const nKey = `${nx},${ny}`;
        if (closed.has(nKey)) continue;

        const moveCost = flying ? 1 : (tile.terrain.move || 1);
        const tentG = gScore.get(curKey) + moveCost;

        if (!gScore.has(nKey) || tentG < gScore.get(nKey)) {
          gScore.set(nKey, tentG);
          parent.set(nKey, { x: curNode.x, y: curNode.y });
          open.set(nKey, { x: nx, y: ny, f: tentG + heuristic(nx, ny), g: tentG });
        }
      }
    }

    return null;
  }

  /** Merge another army's units into this one (up to maxUnits) */
  mergeFrom(other) {
    for (const unit of other.units) {
      if (this.units.length < this.maxUnits()) {
        this.units.push({ ...unit });
      }
    }
    if (!this.hero && other.hero) {
      this.hero = other.hero;
      this.hero.army = this;
    }
  }

  /** @returns {string} summary label */
  label() {
    const heroStr = this.hero ? `★${this.hero.name} ` : '';
    return `${heroStr}[${this.units.length}]`;
  }
}
