/**
 * Upgrades system - manages meta upgrades and skin purchases
 */
const Upgrades = {
    /**
     * Room settings that can switch upgrades off. Missing means on: rooms are
     * a free-for-all unless whoever made them chose otherwise. Coin Bonus is
     * not here because it only ever changes your own payout.
     */
    ROOM_TOGGLES: [
        { key: 'baseSpeed',   label: 'Base Speed',     note: 'the big one' },
        { key: 'magnetRange', label: 'Magnet Range' },
        { key: 'startSize',   label: 'Starting Size' },
        { key: 'boostTime',   label: 'Boost Duration' },
        { key: 'boost',       label: 'BOOST button',   note: 'free power-up once a minute' }
    ],

    allowed(settings, key) {
        return !settings || settings[key] !== false;
    },

    /** Get computed player stats based on upgrade levels, minus any the room switched off. */
    getPlayerStats(saveData, settings) {
        const ups = { ...saveData.upgrades };
        for (const t of Upgrades.ROOM_TOGGLES) {
            if (t.key in ups && !Upgrades.allowed(settings, t.key)) ups[t.key] = 0;
        }
        return {
            startLength: Math.round(CONFIG.SNAKE_START_LENGTH + Storage.getUpgradeValue('startSize', ups.startSize)),
            speedLevels: ups.baseSpeed || 0,
            speedPerLevel: CONFIG.META_UPGRADES.baseSpeed.perLevel,
            speedBonus: Storage.getUpgradeValue('baseSpeed', ups.baseSpeed),
            boostTimeBonus: Storage.getUpgradeValue('boostTime', ups.boostTime) * 1000,
            magnetRange: Storage.getUpgradeValue('magnetRange', ups.magnetRange),
            boostCostReduction: Storage.getUpgradeValue('boostEff', ups.boostEff),
            coinMultiplier: 1 + Storage.getUpgradeValue('coinBonus', ups.coinBonus)
        };
    },

    /** Try to purchase an upgrade, returns true if successful */
    purchaseUpgrade(upgradeKey) {
        const data = Storage.load();
        const currentLevel = data.upgrades[upgradeKey] || 0;
        const cost = Storage.getUpgradeCost(upgradeKey, currentLevel);

        if (data.coins >= cost && currentLevel < CONFIG.META_UPGRADES[upgradeKey].maxLevel) {
            data.coins -= cost;
            data.upgrades[upgradeKey] = currentLevel + 1;
            Storage.save(data);
            return true;
        }
        return false;
    },

    /** Try to purchase a skin, returns true if successful */
    purchaseSkin(skinId) {
        const data = Storage.load();
        const skin = CONFIG.SKINS.find(s => s.id === skinId);
        if (!skin) return false;

        if (data.unlockedSkins.includes(skinId)) return false;
        if (data.coins < skin.cost) return false;

        data.coins -= skin.cost;
        data.unlockedSkins.push(skinId);
        Storage.save(data);
        return true;
    },

    /** Select a skin */
    selectSkin(skinId) {
        Storage.update(data => {
            if (data.unlockedSkins.includes(skinId)) {
                data.selectedSkin = skinId;
            }
        });
    },

    /**
     * Format an upgrade's cumulative effect for display. With twenty-level
     * ladders the player needs to see what they are actually buying, not just a
     * level number.
     */
    formatEffect(meta, value) {
        switch (meta.fmt) {
            case 'pct':   return `+${Math.round(value * 100)}% ${meta.unit}`;
            case 'plus2': return `+${value.toFixed(2)} ${meta.unit}`;
            case 'plus':
            default:      return `+${Math.round(value)} ${meta.unit}`;
        }
    },

    /** Build upgrade UI data for display */
    getUpgradeDisplayData() {
        const data = Storage.load();
        const items = [];

        for (const [key, meta] of Object.entries(CONFIG.META_UPGRADES)) {
            const level = data.upgrades[key] || 0;
            const cost = Storage.getUpgradeCost(key, level);
            const maxed = level >= meta.maxLevel;
            const canAfford = data.coins >= cost;
            const current = Storage.getUpgradeValue(key, level);
            const next = maxed ? null : Storage.getUpgradeValue(key, level + 1);

            items.push({
                key,
                name: meta.name,
                level,
                maxLevel: meta.maxLevel,
                cost: maxed ? null : cost,
                maxed,
                canAfford: !maxed && canAfford,
                currentValue: current,
                nextValue: next,
                unit: meta.unit,
                effectNow: level > 0 ? Upgrades.formatEffect(meta, current) : 'No bonus yet',
                effectNext: maxed ? null : Upgrades.formatEffect(meta, next)
            });
        }
        return items;
    },

    /** Build skin shop data for display */
    getSkinDisplayData() {
        const data = Storage.load();
        return CONFIG.SKINS.map(skin => ({
            ...skin,
            owned: data.unlockedSkins.includes(skin.id),
            selected: data.selectedSkin === skin.id,
            canAfford: data.coins >= skin.cost
        }));
    }
};
