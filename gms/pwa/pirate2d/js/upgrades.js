// Upgrade system - per-run and permanent upgrades

export const RUN_UPGRADES = {
    hull:     { name: 'Reinforce Hull',   desc: '+20 Max HP',        baseCost: 60,  costMult: 1.6, maxLevel: 10, icon: '\uD83D\uDEE1\uFE0F' },
    cannons:  { name: 'Upgrade Cannons',  desc: '+5 Cannon Damage',  baseCost: 80,  costMult: 1.7, maxLevel: 10, icon: '\uD83D\uDCA5' },
    speed:    { name: 'Better Sails',     desc: '+20 Max Speed',     baseCost: 50,  costMult: 1.5, maxLevel: 8,  icon: '\uD83D\uDCA8' },
    fireRate: { name: 'Faster Loading',   desc: '+0.2 Fire Rate',    baseCost: 100, costMult: 1.8, maxLevel: 8,  icon: '\u26A1' },
    range:    { name: 'Long Cannons',     desc: '+40 Range',         baseCost: 70,  costMult: 1.5, maxLevel: 6,  icon: '\uD83C\uDFAF' },
    cargo:    { name: 'Expand Hold',      desc: '+10 Cargo Space',   baseCost: 40,  costMult: 1.4, maxLevel: 6,  icon: '\uD83D\uDCE6' },
    armor:    { name: 'Iron Plating',     desc: '+3 Damage Resist',  baseCost: 90,  costMult: 1.7, maxLevel: 8,  icon: '\u2699\uFE0F' },
    repairSpeed: { name: 'Quick Patching', desc: '+0.5 HP/sec repair', baseCost: 30, costMult: 1.5, maxLevel: 8, icon: '\uD83D\uDD27', requiresRepair: true }
};

export const PERMANENT_UPGRADES = {
    repairUnlock:    { name: 'Repair Kit',       desc: 'Unlock ship auto-repair',  baseCost: 200, costMult: 1,   maxLevel: 1,  icon: '\uD83D\uDD27' },
    permDamage:      { name: 'Cannon Training',  desc: '+1 Cannon Damage',         baseCost: 10,  costMult: 1.5, maxLevel: 10, icon: '\uD83D\uDCA5' },
    permHealth:      { name: 'Thick Hull',       desc: '+2 Max HP',                baseCost: 10,  costMult: 1.5, maxLevel: 10, icon: '\u2764\uFE0F' },
    permSpeed:       { name: 'Silk Sails',       desc: '+5 Max Speed',             baseCost: 15,  costMult: 1.5, maxLevel: 8,  icon: '\uD83D\uDCA8' },
    permFireRate:    { name: 'Powder Monkey',    desc: '+0.05 Fire Rate',          baseCost: 20,  costMult: 1.6, maxLevel: 8,  icon: '\u26A1' },
    permCargo:       { name: 'Extra Hold',       desc: '+2 Cargo Space',           baseCost: 15,  costMult: 1.5, maxLevel: 8,  icon: '\uD83D\uDCE6' },
    permArmor:       { name: 'Steel Plates',     desc: '+1 Damage Resist',         baseCost: 20,  costMult: 1.6, maxLevel: 8,  icon: '\u2699\uFE0F' },
    startGold:       { name: 'Treasure Map',     desc: '+25 Starting Gold',        baseCost: 100, costMult: 2.0, maxLevel: 5,  icon: '\uD83D\uDDFA\uFE0F' },
    startHp:         { name: 'Sturdy Build',     desc: '+10 Starting HP',          baseCost: 150, costMult: 2.2, maxLevel: 5,  icon: '\u2764\uFE0F' },
    luck:            { name: 'Fortune\'s Favor', desc: '+5% Gold Bonus',           baseCost: 200, costMult: 2.5, maxLevel: 5,  icon: '\uD83C\uDF40' },
    permRepairSpeed: { name: 'Repair Crew',      desc: '+0.3 HP/sec repair',       baseCost: 25,  costMult: 1.6, maxLevel: 8,  icon: '\uD83D\uDD28', requiresRepair: true }
};

export const EXTRA_CANNON_COSTS = [25000, 100000];

export class UpgradeSystem {
    getRunUpgradeCost(key, player) {
        const upgrade = RUN_UPGRADES[key];
        const level = player.upgrades[key] || 0;
        if (level >= upgrade.maxLevel) return Infinity;
        return Math.round(upgrade.baseCost * Math.pow(upgrade.costMult, level));
    }

    buyRunUpgrade(key, player, audio) {
        const cost = this.getRunUpgradeCost(key, player);
        if (player.gold < cost) return { success: false, reason: 'Not enough gold' };
        player.gold -= cost;
        player.upgrades[key] = (player.upgrades[key] || 0) + 1;

        // Hull upgrade heals
        if (key === 'hull') {
            player.hp = Math.min(player.maxHp, player.hp + 20);
        }

        if (audio) audio.playUpgrade();
        return { success: true, newLevel: player.upgrades[key] };
    }

    getPermanentUpgradeCost(key, player) {
        const upgrade = PERMANENT_UPGRADES[key];
        const level = player.permanentUpgrades[key] || 0;
        if (level >= upgrade.maxLevel) return Infinity;
        return Math.round(upgrade.baseCost * Math.pow(upgrade.costMult, level));
    }

    buyPermanentUpgrade(key, player, audio) {
        const cost = this.getPermanentUpgradeCost(key, player);
        if (player.persistentGold < cost) return { success: false, reason: 'Not enough saved gold' };
        player.persistentGold -= cost;
        player.permanentUpgrades[key] = (player.permanentUpgrades[key] || 0) + 1;

        // Handle repair unlock
        if (key === 'repairUnlock') {
            player.hasRepairSkill = true;
        }

        player._savePersistent();

        if (audio) audio.playUpgrade();
        return { success: true, newLevel: player.permanentUpgrades[key] };
    }

    canBuyExtraCannon(player) {
        return (player.completedRuns || []).length > player.extraCannons && player.extraCannons < EXTRA_CANNON_COSTS.length;
    }

    getExtraCannonCost(player) {
        const idx = player.extraCannons;
        return idx < EXTRA_CANNON_COSTS.length ? EXTRA_CANNON_COSTS[idx] : Infinity;
    }

    buyExtraCannon(player, audio) {
        if (!this.canBuyExtraCannon(player)) return { success: false, reason: 'Not available' };
        const cost = this.getExtraCannonCost(player);
        if (player.persistentGold < cost) return { success: false, reason: 'Not enough saved gold' };
        player.persistentGold -= cost;
        player.extraCannons++;
        player._savePersistent();
        if (audio) audio.playUpgrade();
        return { success: true, totalCannons: 1 + player.extraCannons };
    }
}
