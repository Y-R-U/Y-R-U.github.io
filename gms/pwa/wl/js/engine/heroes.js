// heroes.js - Hero system and ruin searching
'use strict';

const Heroes = {
    searchRuin(army, ruin) {
        if (ruin.searched) return { type: 'already_searched' };
        if (!Units.armyHasHero(army)) return { type: 'no_hero' };

        ruin.searched = true;
        const hero = army.units.find(u => u.typeId === UNIT_TYPES.HERO.id);

        if (Math.random() > HERO_SEARCH_CHANCE) {
            return { type: 'nothing', message: 'The ruins are empty.' };
        }

        const reward = ruin.reward;
        switch (reward) {
            case 'item': {
                const item = Utils.pick(ITEMS);
                hero.items.push({ ...item });
                return {
                    type: 'item',
                    item: item,
                    message: `Found ${item.name}!`,
                };
            }
            case 'gold': {
                const amount = Utils.rand(10, 30);
                GameState.players[army.owner].gold += amount;
                return {
                    type: 'gold',
                    amount: amount,
                    message: `Found ${amount} gold!`,
                };
            }
            case 'ally': {
                const allyTypes = [UNIT_TYPES.GRIFFINS, UNIT_TYPES.GIANTS, UNIT_TYPES.WOLVES, UNIT_TYPES.ELVES];
                const allyType = Utils.pick(allyTypes);
                if (army.units.length < MAX_STACK_SIZE) {
                    const ally = Units.create(allyType.id, army.owner);
                    Units.addToArmy(army, ally);
                    return {
                        type: 'ally',
                        unitType: allyType,
                        message: `${allyType.name} joins your army!`,
                    };
                }
                // Stack full, give gold instead
                const gold = Utils.rand(5, 15);
                GameState.players[army.owner].gold += gold;
                return {
                    type: 'gold',
                    amount: gold,
                    message: `Stack full. Found ${gold} gold instead.`,
                };
            }
            default:
                return { type: 'nothing', message: 'The ruins are empty.' };
        }
    },
};
