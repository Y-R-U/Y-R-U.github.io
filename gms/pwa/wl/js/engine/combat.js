// combat.js - Combat resolution system
'use strict';

const Combat = {
    resolve(attacker, defender, terrain) {
        const atkStr = Units.armyStrength(attacker);
        const defStr = Units.armyStrength(defender);
        const defBonus = terrain ? (TERRAIN_BY_ID[terrain]?.defense || 0) : 0;
        const effectiveDefStr = defStr + defBonus;

        const result = {
            attacker: attacker,
            defender: defender,
            atkStrength: atkStr,
            defStrength: effectiveDefStr,
            atkLosses: [],
            defLosses: [],
            winner: null,
            rounds: [],
        };

        // Clone units for combat
        const atkUnits = attacker.units.map(u => ({ ...u, hp: this._getHP(u) }));
        const defUnits = defender.units.map(u => ({ ...u, hp: this._getHP(u) + defBonus * 0.5 }));

        // Combat rounds
        let round = 0;
        while (atkUnits.length > 0 && defUnits.length > 0 && round < 20) {
            round++;
            const roundResult = this._fightRound(atkUnits, defUnits);
            result.rounds.push(roundResult);

            // Remove dead
            for (let i = atkUnits.length - 1; i >= 0; i--) {
                if (atkUnits[i].hp <= 0) {
                    result.atkLosses.push(atkUnits[i].id);
                    atkUnits.splice(i, 1);
                }
            }
            for (let i = defUnits.length - 1; i >= 0; i--) {
                if (defUnits[i].hp <= 0) {
                    result.defLosses.push(defUnits[i].id);
                    defUnits.splice(i, 1);
                }
            }
        }

        result.winner = atkUnits.length > 0 ? 'attacker' : (defUnits.length > 0 ? 'defender' : 'attacker');
        return result;
    },

    _getHP(unit) {
        return Units.getEffectiveStr(unit) * 2;
    },

    _fightRound(atkUnits, defUnits) {
        // Each unit attacks a random enemy
        const roundLog = { atkDmg: 0, defDmg: 0 };

        for (const unit of atkUnits) {
            if (defUnits.length === 0) break;
            const target = defUnits[Utils.rand(0, defUnits.length - 1)];
            const dmg = this._calcDamage(unit, target);
            target.hp -= dmg;
            roundLog.atkDmg += dmg;
        }

        for (const unit of defUnits) {
            if (atkUnits.length === 0) break;
            const target = atkUnits[Utils.rand(0, atkUnits.length - 1)];
            const dmg = this._calcDamage(unit, target);
            target.hp -= dmg;
            roundLog.defDmg += dmg;
        }

        return roundLog;
    },

    _calcDamage(attacker, defender) {
        const str = Units.getEffectiveStr(attacker);
        const baseDmg = str * 0.6;
        const variance = Utils.randFloat(0.5, 1.5);
        return Math.max(0.5, baseDmg * variance);
    },

    applyCombatResult(result) {
        const attacker = result.attacker;
        const defender = result.defender;

        // Remove dead units
        for (const id of result.atkLosses) {
            const unit = attacker.units.find(u => u.id === id);
            if (unit && unit.typeId === UNIT_TYPES.HERO.id) {
                GameState.players[attacker.owner].heroCount--;
            }
            Units.removeFromArmy(attacker, id);
        }
        for (const id of result.defLosses) {
            const unit = defender.units.find(u => u.id === id);
            if (unit && unit.typeId === UNIT_TYPES.HERO.id && defender.owner >= 0) {
                GameState.players[defender.owner].heroCount--;
            }
            Units.removeFromArmy(defender, id);
        }

        // Give XP to surviving units
        const xpAmount = result.winner === 'attacker' ? 2 : 1;
        const winners = result.winner === 'attacker' ? attacker.units : defender.units;
        for (const unit of winners) {
            Units.gainXP(unit, xpAmount);
        }

        if (result.winner === 'attacker') {
            // Remove defender army
            GameState.removeArmy(defender);

            // Capture city if present
            const city = GameState.getCityAt(defender.col, defender.row);
            if (city) {
                const oldOwner = city.owner;
                city.owner = attacker.owner;
                city.production = null;
                city.turnsLeft = 0;
                GameState.addMessage(`${GameState.players[attacker.owner].name} captured ${city.name}!`);

                // Check if player eliminated
                if (oldOwner >= 0) {
                    const remaining = GameState.getPlayerCities(oldOwner);
                    const remainingArmies = GameState.getPlayerArmies(oldOwner);
                    if (remaining.length === 0 && remainingArmies.length === 0) {
                        GameState.eliminatePlayer(oldOwner);
                    }
                }
            }

            // Move attacker to defender position
            attacker.col = defender.col;
            attacker.row = defender.row;
            GameState.revealAround(attacker.owner, attacker.col, attacker.row);
        } else {
            // Remove attacker army
            GameState.removeArmy(attacker);

            // Check if attacker player eliminated
            if (attacker.owner >= 0) {
                const remaining = GameState.getPlayerCities(attacker.owner);
                const remainingArmies = GameState.getPlayerArmies(attacker.owner);
                if (remaining.length === 0 && remainingArmies.length === 0) {
                    GameState.eliminatePlayer(attacker.owner);
                }
            }
        }
    },
};
