// movement.js - Army movement and pathfinding
'use strict';

const Movement = {
    getMoveCost(col, row, army) {
        if (!Utils.inBounds(col, row)) return Infinity;
        const terrain = TERRAIN_BY_ID[GameState.tiles[row][col]];
        if (!terrain) return Infinity;

        // Flying armies can go over everything except off-map
        if (Units.armyHasFlying(army)) {
            return terrain.id === TERRAIN.MOUNTAIN.id ? 2 : 1;
        }

        return terrain.moveCost;
    },

    canMoveTo(army, col, row) {
        if (!Utils.inBounds(col, row)) return false;
        const cost = this.getMoveCost(col, row, army);
        return cost < 50; // Mountains/water = 99
    },

    findPath(army, startCol, startRow, endCol, endRow) {
        if (!this.canMoveTo(army, endCol, endRow)) return null;

        // A* pathfinding
        const openSet = [{ col: startCol, row: startRow, g: 0, f: 0, parent: null }];
        const closed = new Set();

        while (openSet.length > 0) {
            // Find lowest f
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const key = `${current.col},${current.row}`;

            if (current.col === endCol && current.row === endRow) {
                // Reconstruct path
                const path = [];
                let node = current;
                while (node) {
                    path.unshift({ col: node.col, row: node.row, cost: node.g });
                    node = node.parent;
                }
                return path;
            }

            closed.add(key);

            for (const [nc, nr] of Utils.neighbors(current.col, current.row)) {
                const nkey = `${nc},${nr}`;
                if (closed.has(nkey)) continue;

                const cost = this.getMoveCost(nc, nr, army);
                if (cost >= 50) continue;

                const g = current.g + cost;
                const h = Utils.dist(nc, nr, endCol, endRow);
                const f = g + h;

                const existing = openSet.find(n => n.col === nc && n.row === nr);
                if (existing) {
                    if (g < existing.g) {
                        existing.g = g;
                        existing.f = f;
                        existing.parent = current;
                    }
                } else {
                    openSet.push({ col: nc, row: nr, g, f, parent: current });
                }
            }
        }

        return null; // No path found
    },

    moveArmy(army, path) {
        if (!path || path.length < 2) return false;
        if (army.movesLeft <= 0) return false;

        // Track each tile walked for undo support
        const stepsWalked = [{ col: army.col, row: army.row, movesLeft: army.movesLeft }];

        for (let i = 1; i < path.length; i++) {
            const step = path[i];
            const prevStep = path[i - 1];
            const cost = this.getMoveCost(step.col, step.row, army);

            if (army.movesLeft < cost && i > 1) break; // Can always make at least 1 move

            // Check for enemy at destination
            const enemyArmy = GameState.getArmyAt(step.col, step.row);
            if (enemyArmy && enemyArmy.owner !== army.owner) {
                // Initiate combat
                army.movesLeft = Math.max(0, army.movesLeft - cost);
                return { type: 'combat', attacker: army, defender: enemyArmy, col: step.col, row: step.row, stepsWalked };
            }

            // Check for friendly army - merge if possible
            if (enemyArmy && enemyArmy.owner === army.owner && enemyArmy.id !== army.id) {
                if (enemyArmy.units.length + army.units.length <= MAX_STACK_SIZE) {
                    // Merge armies
                    for (const unit of army.units) {
                        Units.addToArmy(enemyArmy, unit);
                    }
                    GameState.removeArmy(army);
                    GameState.revealAround(enemyArmy.owner, enemyArmy.col, enemyArmy.row);
                    return { type: 'merged', army: enemyArmy, stepsWalked };
                }
                break; // Can't merge, stack full
            }

            const prevCol = army.col;
            const prevRow = army.row;
            army.col = step.col;
            army.row = step.row;
            army.movesLeft = Math.max(0, army.movesLeft - cost);
            GameState.revealAround(army.owner, army.col, army.row);

            // Record this step
            stepsWalked.push({ col: army.col, row: army.row, movesLeft: army.movesLeft });

            // Add move animation
            Animation.addMoveTween(army, prevCol, prevRow, step.col, step.row, 120);

            // Check for ruin
            const ruin = GameState.getRuinAt(step.col, step.row);
            if (ruin && !ruin.searched && Units.armyHasHero(army)) {
                return { type: 'ruin', army, ruin, stepsWalked };
            }
        }

        return { type: 'moved', stepsWalked };
    },

    getReachableTiles(army) {
        const reachable = new Map();
        const queue = [{ col: army.col, row: army.row, movesLeft: army.movesLeft }];
        reachable.set(`${army.col},${army.row}`, army.movesLeft);

        while (queue.length > 0) {
            const cur = queue.shift();

            for (const [nc, nr] of Utils.neighbors(cur.col, cur.row)) {
                const cost = this.getMoveCost(nc, nr, army);
                if (cost >= 50) continue;

                const remaining = cur.movesLeft - cost;
                const key = `${nc},${nr}`;

                // Allow moving to adjacent tiles even with 0 moves (minimum 1 step)
                const minRemaining = cur.col === army.col && cur.row === army.row ? -cost + 0.01 : 0;

                if (remaining >= minRemaining) {
                    const existing = reachable.get(key);
                    if (existing === undefined || remaining > existing) {
                        reachable.set(key, Math.max(0, remaining));
                        if (remaining > 0) {
                            queue.push({ col: nc, row: nr, movesLeft: remaining });
                        }
                    }
                }
            }
        }

        return reachable;
    },
};
