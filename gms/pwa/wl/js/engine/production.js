// production.js - City production and economy
'use strict';

const Production = {
    getAvailableUnits(city) {
        // Different cities can produce different units based on income/size
        const base = [UNIT_TYPES.LIGHT_INF, UNIT_TYPES.HEAVY_INF, UNIT_TYPES.CAVALRY];
        if (city.income >= 3) base.push(UNIT_TYPES.ELVES, UNIT_TYPES.DWARVES, UNIT_TYPES.WOLVES);
        if (city.income >= 4) base.push(UNIT_TYPES.UNDEAD, UNIT_TYPES.GRIFFINS);
        if (city.income >= 5) base.push(UNIT_TYPES.GIANTS);
        if (city.income >= 6) base.push(UNIT_TYPES.DRAGONS);
        return base;
    },

    setProduction(city, unitTypeId) {
        const type = UNIT_TYPE_BY_ID[unitTypeId];
        if (!type) return false;
        city.production = unitTypeId;
        city.turnsLeft = type.turns;
        return true;
    },

    processProduction(playerId) {
        const cities = GameState.getPlayerCities(playerId);
        const player = GameState.players[playerId];

        // Collect income
        let income = 0;
        for (const city of cities) {
            income += city.income;
        }

        // Pay upkeep (1 gold per army)
        const armies = GameState.getPlayerArmies(playerId);
        const upkeep = armies.length;
        player.gold += income - upkeep;

        // Warn if gold is negative
        if (player.gold < 0) {
            GameState.addMessage(`${player.name}: Treasury bankrupt! (${player.gold}g)`);
            // Auto-disband weakest army if deeply in debt
            if (player.gold < -10 && armies.length > 1) {
                const weakest = armies.reduce((w, a) =>
                    Units.armyStrength(a) < Units.armyStrength(w) ? a : w);
                if (!Units.armyHasHero(weakest)) {
                    GameState.removeArmy(weakest);
                    player.gold += 5;
                    GameState.addMessage(`${player.name}: Army disbanded due to bankruptcy`);
                }
            }
        }

        // Process city production
        for (const city of cities) {
            if (city.production === null) continue;

            city.turnsLeft--;
            if (city.turnsLeft <= 0) {
                this._produceUnit(city, playerId);
                // Reset production to same unit
                const type = UNIT_TYPE_BY_ID[city.production];
                city.turnsLeft = type.turns;
            }
        }
    },

    _produceUnit(city, playerId) {
        const type = UNIT_TYPE_BY_ID[city.production];
        if (!type) return;

        // Check if player can afford
        if (GameState.players[playerId].gold < type.cost) {
            GameState.addMessage(`${city.name}: Not enough gold for ${type.name}`);
            return;
        }

        GameState.players[playerId].gold -= type.cost;

        // Try to add to existing army at city
        const existingArmy = GameState.getArmyAt(city.col, city.row);
        if (existingArmy && existingArmy.owner === playerId) {
            if (existingArmy.units.length < MAX_STACK_SIZE) {
                const unit = Units.create(city.production, playerId);
                Units.addToArmy(existingArmy, unit);
                GameState.addMessage(`${city.name} produced ${type.name}`);
                return;
            }
            // Stack full, try adjacent tile
            for (const [nc, nr] of Utils.cardinalNeighbors(city.col, city.row)) {
                const t = GameState.tiles[nr][nc];
                if (TERRAIN_BY_ID[t].moveCost >= 50) continue;
                const adj = GameState.getArmyAt(nc, nr);
                if (!adj) {
                    const unit = Units.create(city.production, playerId);
                    const army = {
                        id: Utils.uid(),
                        col: nc,
                        row: nr,
                        owner: playerId,
                        units: [unit],
                        movesLeft: 0,
                    };
                    GameState.armies.push(army);
                    GameState.addMessage(`${city.name} produced ${type.name}`);
                    return;
                }
            }
            GameState.addMessage(`${city.name}: No room for ${type.name}`);
            return;
        }

        // No army at city, create new one
        const unit = Units.create(city.production, playerId);
        const army = {
            id: Utils.uid(),
            col: city.col,
            row: city.row,
            owner: playerId,
            units: [unit],
            movesLeft: 0,
        };
        GameState.armies.push(army);
        GameState.addMessage(`${city.name} produced ${type.name}`);
    },

    buyHero(playerId) {
        const player = GameState.players[playerId];
        if (player.gold < 15) return false;
        if (player.heroCount >= 3) return false;

        // Find a city to spawn hero
        const cities = GameState.getPlayerCities(playerId);
        if (cities.length === 0) return false;

        const city = cities.find(c => {
            const a = GameState.getArmyAt(c.col, c.row);
            return !a || (a.owner === playerId && a.units.length < MAX_STACK_SIZE);
        });
        if (!city) return false;

        player.gold -= 15;
        player.heroCount++;

        const hero = Units.create(UNIT_TYPES.HERO.id, playerId);
        const existing = GameState.getArmyAt(city.col, city.row);
        if (existing && existing.owner === playerId) {
            Units.addToArmy(existing, hero);
        } else {
            const army = {
                id: Utils.uid(),
                col: city.col,
                row: city.row,
                owner: playerId,
                units: [hero],
                movesLeft: 0,
            };
            GameState.armies.push(army);
        }

        GameState.addMessage(`A new hero joins ${player.name}!`);
        return true;
    },
};
