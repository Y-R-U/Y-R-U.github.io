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
                boostTime: 0,
                magnetRange: 0,
                boostEff: 0,
                coinBonus: 0
            },
            ladder: {
                v: 2,            // bumped when the rating scale changes under old saves
                rating: CONFIG.LADDER_START_RATING,
                peak: CONFIG.LADDER_START_RATING,
                bestRank: 0,
                rivals: []       // the regulars; seeded on first play, then they live here
            },
            stats: {
                gamesPlayed: 0,
                totalKills: 0,
                highScore: 0,
                totalMassEaten: 0,
                totalTimePlayed: 0,
                longestSnake: 0,
                bestKillStreak: 0,
                victories: 0,       // runs that reached WIN_MASS
                bestWinTime: 0      // seconds, fastest victory
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
                ladder: this._migrateLadder(defaults.ladder, data),
                stats: { ...defaults.stats, ...(data.stats || {}) },
                settings: { ...defaults.settings, ...(data.settings || {}) }
            };
        } catch (e) {
            console.warn('Failed to load save data:', e);
            return this._defaults();
        }
    },

    /**
     * The first ladder was a 60-row table where everyone started on 1000 and a
     * win was worth 150. The new one is a quarter of a million deep and starts
     * at zero, so those old numbers would drop a two-game player straight into
     * the top few thousand. Rebuild the rating from what the career actually
     * shows instead: wins first, then best run, then games played.
     */
    _migrateLadder(defaults, data) {
        const saved = data.ladder || {};
        // The raw save, not a merge with the defaults — the defaults carry the
        // current `v`, so merging first would make every old save look current.
        if (saved.v === 2) return { ...defaults, ...saved };
        const s = data.stats || {};
        const wins = s.victories || 0;
        const best = s.highScore || 0;
        const games = s.gamesPlayed || 0;
        const earned =
            wins * 90 +
            Math.min(4200, Math.sqrt(best / CONFIG.WIN_MASS) * 4200) +
            Math.min(900, games * 18);
        const rating = Utils.clamp(Math.round(earned), 0, CONFIG.LADDER_TOP_RATING);
        return { v: 2, rating, peak: rating, bestRank: 0, rivals: [] };
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

    /**
     * The in-progress run, in its own key — the one thing here that must never
     * join the account sync. A half-played arena restored on another device is
     * nobody's progress. cloud.js lists only `snakeio_save` for this reason.
     */
    saveRun(run) {
        try {
            localStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify({ ...run, savedAt: Date.now() }));
        } catch (e) { /* private mode; the run just won't survive a reload */ }
    },

    loadRun() {
        try {
            const raw = localStorage.getItem(CONFIG.RESUME_KEY);
            if (!raw) return null;
            const run = JSON.parse(raw);
            if (!run || !run.player) return null;
            if (Date.now() - (run.savedAt || 0) > CONFIG.RESUME_MAX_AGE_MS) {
                this.clearRun();
                return null;
            }
            return run;
        } catch (e) {
            return null;
        }
    },

    clearRun() {
        try { localStorage.removeItem(CONFIG.RESUME_KEY); } catch (e) { /* nothing to do */ }
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

    /** Calculate coins earned from a game. `won` adds the victory bonus. */
    calculateCoins(mass, kills, coinBonusLevel, won) {
        const baseMassCoins = Math.floor(mass / CONFIG.COINS_PER_MASS_DIVISOR);
        const killCoins = kills * CONFIG.COINS_PER_KILL;
        const winBonus = won ? CONFIG.WIN_COIN_BONUS : 0;
        const bonus = 1 + Storage.getUpgradeValue('coinBonus', coinBonusLevel);
        return Math.max(
            CONFIG.COINS_MIN_PER_GAME,
            Math.floor((baseMassCoins + killCoins + winBonus) * bonus)
        );
    },

    /**
     * How hard the AI should be, 0..1, derived from the whole career rather than
     * the session — difficulty follows the account between devices. Games played
     * ramps it; a high score or a win pulls it up faster so a good player is not
     * stuck against beginners' bots.
     *
     * Ladder rating is in here too, and it is the one that keeps mattering: the
     * other three saturate within about forty games, and the climb from there to
     * the top hundred is most of the career. Low ranks stay easy on purpose.
     */
    aiPressure(data) {
        const s = (data && data.stats) || {};
        const byGames = Utils.clamp((s.gamesPlayed || 0) / CONFIG.AI_PRESSURE_GAMES, 0, 1);
        const byScore = Utils.clamp((s.highScore || 0) / CONFIG.WIN_MASS, 0, 1);
        const byWins = Utils.clamp((s.victories || 0) / 3, 0, 1);
        const rating = ((data && data.ladder) || {}).rating || 0;
        const byRank = Utils.clamp(rating / CONFIG.LADDER_TOP_RATING, 0, 1);
        return Utils.clamp(Math.max(byGames, byScore * 0.9, byWins, byRank), 0, 1);
    }
};
