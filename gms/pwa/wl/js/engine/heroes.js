// heroes.js - Hero system and ruin searching
'use strict';

const Heroes = {
    searchRuin(army, ruin) {
        if (ruin.searched) return { type: 'already_searched', message: 'These ruins have already been explored.' };
        if (!Units.armyHasHero(army)) return { type: 'no_hero', message: 'You need a hero to search ruins.' };

        ruin.searched = true;
        const hero = army.units.find(u => u.typeId === UNIT_TYPES.HERO.id);

        // Always find something in unexplored ruins - roll for quality
        const roll = Math.random();

        if (roll < 0.25) {
            // 25% - Find an item
            const item = Utils.pick(ITEMS);
            hero.items.push({ ...item });
            return {
                type: 'item',
                item: item,
                message: `Your hero discovers ${item.name}!`,
            };
        } else if (roll < 0.45) {
            // 20% - Find an ally
            const allyTypes = [UNIT_TYPES.GRIFFINS, UNIT_TYPES.GIANTS, UNIT_TYPES.WOLVES, UNIT_TYPES.ELVES, UNIT_TYPES.DWARVES];
            const allyType = Utils.pick(allyTypes);
            if (army.units.length < MAX_STACK_SIZE) {
                const ally = Units.create(allyType.id, army.owner);
                Units.addToArmy(army, ally);
                return {
                    type: 'ally',
                    unitType: allyType,
                    message: `${allyType.name} emerges from the shadows and joins your army!`,
                };
            }
            // Stack full, give gold instead
            const gold = Utils.rand(8, 20);
            GameState.players[army.owner].gold += gold;
            return {
                type: 'gold',
                amount: gold,
                message: `Stack full. Found a cache of ${gold} gold instead.`,
            };
        } else if (roll < 0.70) {
            // 25% - Find gold (decent amount)
            const amount = Utils.rand(12, 35);
            GameState.players[army.owner].gold += amount;
            return {
                type: 'gold',
                amount: amount,
                message: `Your hero uncovers a treasure chest with ${amount} gold!`,
            };
        } else if (roll < 0.85) {
            // 15% - Find a small amount of gold
            const amount = Utils.rand(3, 10);
            GameState.players[army.owner].gold += amount;
            return {
                type: 'gold',
                amount: amount,
                message: `Your hero finds ${amount} gold coins scattered among the rubble.`,
            };
        } else {
            // 15% - Hero gains XP from ancient knowledge
            const xp = Utils.rand(2, 5);
            Units.gainXP(hero, xp);
            return {
                type: 'xp',
                amount: xp,
                message: `Your hero studies ancient texts and gains ${xp} experience!`,
            };
        }
    },
};
