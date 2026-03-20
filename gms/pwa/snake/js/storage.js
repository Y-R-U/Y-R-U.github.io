/**
 * LocalStorage management for user data
 */
const Storage = {
    KEY: 'snakeio_save',

    _defaults() {
        return {
            username: '',
            selectedSkin: 'default',
            unlockedSkins: ['default', 'fire', 'ocean'],
            coins: 0,
            upgrades: {
                startSize: 0,
                baseSpeed: 0,
                magnetRange: 0,
                boostEff: 0,
                coinBonus: 0
            },
            stats: {
                gamesPlayed: 0,
                totalKills: 0,
                highScore: 0,
                totalMassEaten: 0,
                totalTimePlayed: 0,
                longestSnake: 0,
                bestKillStreak: 0
            },
            settings: {
                musicVolume: 0.5,
                sfxVolume: 0.7,
                showGrid: true,
                joystickSide: 'left'
            }
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) return this._defaults();
            const data = JSON.parse(raw);
            // Merge with defaults to handle new fields
            const defaults = this._defaults();
            return {
                username: data.username ?? defaults.username,
                selectedSkin: data.selectedSkin ?? defaults.selectedSkin,
                unlockedSkins: data.unlockedSkins ?? defaults.unlockedSkins,
                coins: data.coins ?? defaults.coins,
                upgrades: { ...defaults.upgrades, ...(data.upgrades || {}) },
                stats: { ...defaults.stats, ...(data.stats || {}) },
                settings: { ...defaults.settings, ...(data.settings || {}) }
            };
        } catch (e) {
            console.warn('Failed to load save data:', e);
            return this._defaults();
        }
    },

    save(data) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save data:', e);
        }
    },

    /** Update specific fields and save */
    update(fn) {
        const data = this.load();
        fn(data);
        this.save(data);
        return data;
    },

    /** Get upgrade cost for a specific upgrade at current level */
    getUpgradeCost(upgradeKey, currentLevel) {
        const meta = CONFIG.META_UPGRADES[upgradeKey];
        if (!meta || currentLevel >= meta.maxLevel) return Infinity;
        return Math.floor(meta.baseCost * Math.pow(meta.costScale, currentLevel));
    },

    /** Get upgrade effect value at a given level */
    getUpgradeValue(upgradeKey, level) {
        const meta = CONFIG.META_UPGRADES[upgradeKey];
        if (!meta) return 0;
        return meta.perLevel * level;
    },

    /** Calculate coins earned from a game */
    calculateCoins(mass, kills, coinBonusLevel) {
        const baseMassCoins = Math.floor(mass / CONFIG.COINS_PER_MASS_DIVISOR);
        const killCoins = kills * CONFIG.COINS_PER_KILL;
        const bonus = 1 + Storage.getUpgradeValue('coinBonus', coinBonusLevel);
        return Math.max(CONFIG.COINS_MIN_PER_GAME, Math.floor((baseMassCoins + killCoins) * bonus));
    }
};
