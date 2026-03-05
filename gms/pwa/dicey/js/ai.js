/* ============================================
   DICEY - AI Player Logic
   Simple AI with slight randomness
   ============================================ */

const AI = {
    // Decide whether to buy a property
    shouldBuy(player, space, gameState) {
        // Always try to buy if it completes a set
        const group = space.group;
        if (group !== undefined) {
            const groupSpaces = Utils.BOARD_SPACES.map((s, i) => ({ s, i }))
                .filter(o => o.s.group === group && o.s.type === 'property');
            const owned = groupSpaces.filter(o => gameState.properties[o.i]?.owner === player.index).length;
            if (owned === groupSpaces.length - 1) return true; // Completing a set!
        }

        // Don't buy if it would leave us with very little cash
        if (player.money - space.price < 100) {
            return Math.random() < 0.15; // 15% chance to risk it
        }

        // Base buy chance is high for cheaper properties
        const ratio = space.price / player.money;
        if (ratio < 0.3) return Math.random() < 0.9; // 90% buy
        if (ratio < 0.5) return Math.random() < 0.7; // 70% buy
        if (ratio < 0.7) return Math.random() < 0.4; // 40% buy
        return Math.random() < 0.2; // 20% buy expensive stuff

    },

    // Decide whether to buy a railroad or utility
    shouldBuySpecial(player, space, gameState) {
        if (player.money - space.price < 80) return Math.random() < 0.1;

        // Count how many railroads/utilities we own
        if (space.type === 'railroad') {
            const railCount = Utils.BOARD_SPACES
                .map((s, i) => ({ s, i }))
                .filter(o => o.s.type === 'railroad' && gameState.properties[o.i]?.owner === player.index)
                .length;
            // More railroads = more incentive
            return Math.random() < (0.5 + railCount * 0.2);
        }

        return Math.random() < 0.6; // Utilities - 60% chance
    },

    // Decide what to build
    chooseBuild(player, gameState) {
        const buildable = [];
        Utils.BOARD_SPACES.forEach((space, idx) => {
            if (space.type !== 'property') return;
            const prop = gameState.properties[idx];
            if (!prop || prop.owner !== player.index || prop.houses >= 5) return;

            const group = space.group;
            const groupSpaces = Utils.BOARD_SPACES.map((s, i) => ({ s, i }))
                .filter(o => o.s.group === group && o.s.type === 'property');
            const ownsAll = groupSpaces.every(o => gameState.properties[o.i]?.owner === player.index);
            if (!ownsAll) return;

            const cost = Math.floor(space.price / 2);
            if (player.money - cost < 150) return; // Keep some reserve

            buildable.push({ idx, cost, houses: prop.houses });
        });

        if (buildable.length === 0) return null;

        // Prioritize properties with fewer houses (even building)
        buildable.sort((a, b) => a.houses - b.houses);

        // 70% chance to build on cheapest option
        if (Math.random() < 0.7) {
            return buildable[0].idx;
        }
        return null;
    },

    // Jail: pay or roll?
    jailDecision(player) {
        if (player.money < 50) return 'roll';
        if (player.jailTurns >= 2) return 'pay'; // Last chance
        if (player.money > 500) return Math.random() < 0.5 ? 'pay' : 'roll';
        return 'roll';
    },

    // Simulate AI turn delay
    async delay() {
        return Utils.wait(600 + Math.random() * 600);
    }
};
