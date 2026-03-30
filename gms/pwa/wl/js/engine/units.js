// units.js - Unit creation and management
'use strict';

const Units = {
    create(typeId, owner) {
        const type = UNIT_TYPE_BY_ID[typeId];
        return {
            id: Utils.uid(),
            typeId: typeId,
            name: type.name,
            owner: owner,
            str: type.str,
            moves: type.moves,
            maxMoves: type.moves,
            flying: type.flying,
            symbol: type.symbol,
            items: [],
            xp: 0,
            level: 1,
        };
    },

    getEffectiveStr(unit) {
        let str = unit.str;
        for (const item of unit.items) {
            str += item.strBonus || 0;
        }
        str += Math.floor(unit.level / 3); // Level bonus
        return str;
    },

    getEffectiveMoves(unit) {
        let moves = unit.maxMoves;
        for (const item of unit.items) {
            moves += item.movesBonus || 0;
        }
        return moves;
    },

    armyMoves(army) {
        if (!army.units || army.units.length === 0) return 0;
        // Army moves at speed of slowest unit
        let minMoves = Infinity;
        let hasFlying = false;
        let allFlying = true;
        for (const unit of army.units) {
            const m = this.getEffectiveMoves(unit);
            if (m < minMoves) minMoves = m;
            if (unit.flying) hasFlying = true;
            if (!unit.flying) allFlying = false;
        }
        return minMoves;
    },

    armyStrength(army) {
        return army.units.reduce((sum, u) => sum + this.getEffectiveStr(u), 0);
    },

    armyHasFlying(army) {
        return army.units.every(u => u.flying);
    },

    armyHasHero(army) {
        return army.units.some(u => u.typeId === UNIT_TYPES.HERO.id);
    },

    addToArmy(army, unit) {
        if (army.units.length >= MAX_STACK_SIZE) return false;
        army.units.push(unit);
        return true;
    },

    removeFromArmy(army, unitId) {
        const idx = army.units.findIndex(u => u.id === unitId);
        if (idx >= 0) {
            army.units.splice(idx, 1);
            return true;
        }
        return false;
    },

    gainXP(unit, amount) {
        unit.xp += amount;
        const newLevel = 1 + Math.floor(unit.xp / 5);
        if (newLevel > unit.level) {
            unit.level = newLevel;
            return true;
        }
        return false;
    },

    checkPromotion(unit) {
        if (unit.promoted) return null;
        const promo = PROMOTIONS[unit.typeId];
        if (!promo) return null;
        if (unit.xp >= promo.xpRequired) {
            return promo;
        }
        return null;
    },

    applyPromotion(unit) {
        const promo = this.checkPromotion(unit);
        if (!promo) return false;
        unit.promoted = true;
        unit.str += promo.strBonus;
        unit.maxMoves += promo.movesBonus;
        unit.moves += promo.movesBonus;
        unit.name = promo.name;
        return true;
    },
};
