// ai.js - AI opponent logic
'use strict';

const AI = {
    takeTurn(playerId) {
        const player = GameState.players[playerId];
        if (!player.alive) return;

        // Set production for cities without it
        this._manageProduction(playerId);

        // Move armies
        this._moveArmies(playerId);

        // Consider buying hero
        if (player.heroCount < 2 && player.gold >= 20) {
            Production.buyHero(playerId);
        }
    },

    _manageProduction(playerId) {
        const cities = GameState.getPlayerCities(playerId);
        for (const city of cities) {
            if (city.production === null) {
                const available = Production.getAvailableUnits(city);
                // Prefer a mix: some fast units, some strong
                const weighted = this._pickProductionUnit(available, playerId);
                Production.setProduction(city, weighted.id);
            }
        }
    },

    _pickProductionUnit(available, playerId) {
        const armies = GameState.getPlayerArmies(playerId);
        const totalUnits = armies.reduce((s, a) => s + a.units.length, 0);

        // Early game: cheap units
        if (totalUnits < 8) {
            const cheap = available.filter(u => u.cost <= 4);
            return Utils.pick(cheap.length > 0 ? cheap : available);
        }

        // Mid/late game: mix of strong and fast
        if (Math.random() < 0.3) {
            // Fast units for expansion
            const fast = available.filter(u => u.moves >= 4);
            if (fast.length > 0) return Utils.pick(fast);
        }
        if (Math.random() < 0.4) {
            // Strong units
            const strong = available.filter(u => u.str >= 5);
            if (strong.length > 0) return Utils.pick(strong);
        }
        return Utils.pick(available);
    },

    _moveArmies(playerId) {
        const armies = [...GameState.getPlayerArmies(playerId)];

        for (const army of armies) {
            if (!GameState.armies.includes(army)) continue; // May have been removed
            if (army.movesLeft <= 0) continue;

            const target = this._findTarget(army, playerId);
            if (!target) continue;

            const path = Movement.findPath(army, army.col, army.row, target.col, target.row);
            if (!path || path.length < 2) continue;

            const result = Movement.moveArmy(army, path);
            if (result && result.type === 'combat') {
                const terrain = GameState.tiles[result.defender.row][result.defender.col];
                // Only attack if we have reasonable odds
                const atkStr = Units.armyStrength(result.attacker);
                const defStr = Units.armyStrength(result.defender);
                if (atkStr >= defStr * 0.7) {
                    const combatResult = Combat.resolve(result.attacker, result.defender, terrain);
                    Combat.applyCombatResult(combatResult);
                    GameState.addMessage(
                        `${GameState.players[playerId].name} attacks at (${result.col},${result.row})!`
                    );
                }
            } else if (result && result.type === 'ruin') {
                const searchResult = Heroes.searchRuin(result.army, result.ruin);
                if (searchResult.message) {
                    GameState.addMessage(`AI: ${searchResult.message}`);
                }
            }
        }
    },

    _findTarget(army, playerId) {
        const targets = [];

        // Priority 1: Nearby weak enemy armies
        for (const enemy of GameState.armies) {
            if (enemy.owner === playerId || enemy.owner === -1) continue;
            const d = Utils.dist(army.col, army.row, enemy.col, enemy.row);
            if (d <= 8) {
                const myStr = Units.armyStrength(army);
                const theirStr = Units.armyStrength(enemy);
                if (myStr >= theirStr * 0.8) {
                    targets.push({ col: enemy.col, row: enemy.row, priority: 10 - d });
                }
            }
        }

        // Priority 2: Neutral cities
        for (const city of GameState.cities) {
            if (city.owner === -1) {
                const d = Utils.dist(army.col, army.row, city.col, city.row);
                if (d <= 12) {
                    targets.push({ col: city.col, row: city.row, priority: 8 - d * 0.5 });
                }
            }
        }

        // Priority 3: Enemy cities
        for (const city of GameState.cities) {
            if (city.owner >= 0 && city.owner !== playerId) {
                const d = Utils.dist(army.col, army.row, city.col, city.row);
                if (d <= 15) {
                    targets.push({ col: city.col, row: city.row, priority: 6 - d * 0.3 });
                }
            }
        }

        // Priority 4: Unsearched ruins (if army has hero)
        if (Units.armyHasHero(army)) {
            for (const ruin of GameState.ruins) {
                if (!ruin.searched) {
                    const d = Utils.dist(army.col, army.row, ruin.col, ruin.row);
                    if (d <= 10) {
                        targets.push({ col: ruin.col, row: ruin.row, priority: 5 - d * 0.3 });
                    }
                }
            }
        }

        if (targets.length === 0) {
            // Wander towards center or nearest enemy city
            const enemyCities = GameState.cities.filter(c => c.owner >= 0 && c.owner !== playerId);
            if (enemyCities.length > 0) {
                const nearest = enemyCities.reduce((best, c) => {
                    const d = Utils.dist(army.col, army.row, c.col, c.row);
                    return d < best.d ? { city: c, d } : best;
                }, { city: null, d: Infinity });
                if (nearest.city) {
                    return { col: nearest.city.col, row: nearest.city.row };
                }
            }
            return null;
        }

        targets.sort((a, b) => b.priority - a.priority);
        return targets[0];
    },
};

