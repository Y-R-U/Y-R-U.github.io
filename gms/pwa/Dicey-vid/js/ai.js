/* ============================================
   DICEY - AI Player Logic (Skills-based)
   ============================================ */

const AI = {
    shouldBuySkill(player, skill, price, gameState) {
        const canAfford = player.money >= price;
        if (!canAfford) return false;

        // Always buy if cheap relative to cash
        const ratio = price / player.money;
        if (ratio < 0.15) return true;

        // Prefer attack skills for aggressive play
        if (skill.type === 'attack' && ratio < 0.5) return Math.random() < 0.8;

        // Defense skills — slightly less eager
        if (skill.type === 'defense' && ratio < 0.4) return Math.random() < 0.7;

        // Don't spend too much
        if (player.money - price < 150) return Math.random() < 0.2;

        return Math.random() < 0.5;
    },

    shouldUseShield(player, skill, gameState) {
        // Always shield against devastating attacks
        if (skill.id === 'ambush' || skill.id === 'jinx') return true;
        if (skill.id === 'sabotage' && player.money > 500) return true;
        if (skill.id === 'shakedown') return player.shields <= 2 ? false : true;

        // For money-stealing attacks, weigh cost vs shield value
        if (player.shields <= 1) return Math.random() < 0.3; // Save last shield
        if (player.money > 800) return Math.random() < 0.4; // Rich = absorb hit
        return Math.random() < 0.7;
    },

    jailDecision(player) {
        if (player.money < 50) return 'roll';
        if (player.jailTurns >= 2) return 'pay';
        if (player.money > 500) return Math.random() < 0.5 ? 'pay' : 'roll';
        return 'roll';
    },

    async delay() {
        return Utils.wait(500 + Math.random() * 500);
    }
};
