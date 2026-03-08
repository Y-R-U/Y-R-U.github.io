/* DRace - AI Module */
const AI = (() => {
    // AI chooses which square to land on (from available choices)
    // Has a small chance of randomness to keep things interesting
    function chooseSquare(player, choices, squares, allPlayers) {
        const RANDOM_CHANCE = 0.15; // 15% chance of random choice

        if (Math.random() < RANDOM_CHANCE) {
            return choices[Math.floor(Math.random() * choices.length)];
        }

        // Score each choice
        let bestIdx = choices[0];
        let bestScore = -Infinity;

        for (const idx of choices) {
            const sq = squares[idx];
            let score = idx * 0.5; // Base: prefer moving further forward

            if (!sq || !sq.effect) { bestIdx = idx; continue; }

            const eff = sq.effect;

            // Score by effect type
            switch (eff.id) {
                case 'finish':
                    score += 1000; // Always go to finish
                    break;
                case 'treasure_large':
                    score += 50;
                    break;
                case 'treasure_med':
                    score += 25;
                    break;
                case 'treasure_small':
                    score += 12;
                    break;
                case 'perm_plus_2':
                    score += 40;
                    break;
                case 'perm_plus_1':
                    score += 25;
                    break;
                case 'roll_again':
                    score += 20;
                    break;
                case 'double_roll':
                    score += 18;
                    break;
                case 'forward_3':
                    score += 15;
                    break;
                case 'forward_2':
                    score += 12;
                    break;
                case 'temp_plus_3':
                    score += 14;
                    break;
                case 'shield':
                    score += 10;
                    break;
                case 'skip_opponent':
                    score += 15;
                    break;
                case 'teleport':
                    score += 8;
                    break;
                case 'steal':
                    score += 10;
                    break;
                case 'spring':
                    score += 5;
                    break;
                case 'swap':
                    // Good if behind, bad if ahead
                    const avgPos = allPlayers.reduce((s, p) => s + p.position, 0) / allPlayers.length;
                    score += player.position < avgPos ? 15 : -10;
                    break;
                case 'empty':
                    score += 2;
                    break;
                case 'trap':
                    score -= 5;
                    break;
                case 'back_2':
                    score -= 12;
                    break;
                case 'back_3':
                    score -= 18;
                    break;
                case 'skip_turn':
                    score -= 20;
                    break;
                case 'perm_minus_1':
                    score -= 30;
                    break;
                case 'temp_minus_2':
                    score -= 10;
                    break;
                case 'lose_treasure':
                    score -= player.treasure > 0 ? 15 : 2;
                    break;
            }

            // If we have a shield, negative effects are less scary
            if (player.shield && eff.category === 'negative') {
                score += 15;
            }

            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        }

        return bestIdx;
    }

    return { chooseSquare };
})();
