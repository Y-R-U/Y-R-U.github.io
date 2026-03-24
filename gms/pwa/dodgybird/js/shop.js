// ── Shop & Progression System ── Upgrades, skins, localStorage persistence ──
const Shop = (() => {
    const STORAGE_KEY = 'flappyStrike_save';

    const SKINS = [
        { id: 'default', name: 'Strike Blue', cost: 0, colors: { body: '#3388ff', cockpit: '#66ccff', wing: '#2266cc', engine: '#ff6633' } },
        { id: 'red', name: 'Crimson Fury', cost: 50, colors: { body: '#dd3333', cockpit: '#ff6666', wing: '#aa2222', engine: '#ffaa00' } },
        { id: 'green', name: 'Venom Wing', cost: 75, colors: { body: '#33aa44', cockpit: '#66ff77', wing: '#228833', engine: '#44ffaa' } },
        { id: 'purple', name: 'Phantom', cost: 100, colors: { body: '#8844cc', cockpit: '#bb77ff', wing: '#6633aa', engine: '#ff44ff' } },
        { id: 'gold', name: 'Golden Eagle', cost: 200, colors: { body: '#ccaa33', cockpit: '#ffdd66', wing: '#aa8822', engine: '#ffffff' } },
        { id: 'stealth', name: 'Shadow Ops', cost: 150, colors: { body: '#333333', cockpit: '#555555', wing: '#222222', engine: '#666666' } },
    ];

    const UPGRADES = [
        { id: 'fireRate', name: 'Fire Rate', desc: 'Faster shooting', maxLvl: CONFIG.MAX_FIRE_RATE_LVL, baseCost: 20, costMult: 1.8, icon: '🔥' },
        { id: 'health', name: 'Extra Health', desc: '+1 max health', maxLvl: CONFIG.MAX_HEALTH_LVL, baseCost: 30, costMult: 2.0, icon: '❤️' },
        { id: 'magnet', name: 'Coin Magnet', desc: 'Attract coins', maxLvl: CONFIG.MAX_MAGNET_LVL, baseCost: 25, costMult: 1.7, icon: '🧲' },
        { id: 'shield', name: 'Shield+', desc: 'Longer shields', maxLvl: CONFIG.MAX_SHIELD_LVL, baseCost: 25, costMult: 1.8, icon: '🛡️' },
    ];

    let saveData = null;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                saveData = JSON.parse(raw);
            }
        } catch (e) { /* ignore */ }

        if (!saveData) {
            saveData = {
                coins: 0,
                highScore: 0,
                totalGames: 0,
                unlockedSkins: ['default'],
                activeSkin: 'default',
                upgrades: {
                    fireRate: 0,
                    health: 0,
                    magnet: 0,
                    shield: 0,
                },
                tutorialSeen: false,
                musicEnabled: true,
                sfxEnabled: true,
                colorblindMode: false,
            };
        }
        // Ensure all fields exist
        if (!saveData.upgrades) saveData.upgrades = { fireRate: 0, health: 0, magnet: 0, shield: 0 };
        if (!saveData.unlockedSkins) saveData.unlockedSkins = ['default'];
        if (saveData.colorblindMode === undefined) saveData.colorblindMode = false;
        return saveData;
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
        } catch (e) { /* ignore */ }
    }

    function getData() { return saveData; }

    function addCoins(amount) {
        saveData.coins += amount;
        save();
    }

    function setHighScore(score) {
        if (score > saveData.highScore) {
            saveData.highScore = score;
            save();
            return true;
        }
        return false;
    }

    function incrementGames() {
        saveData.totalGames++;
        save();
    }

    function getUpgradeCost(upgradeId) {
        const upg = UPGRADES.find(u => u.id === upgradeId);
        if (!upg) return Infinity;
        const lvl = saveData.upgrades[upgradeId] || 0;
        if (lvl >= upg.maxLvl) return Infinity;
        return Math.floor(upg.baseCost * Math.pow(upg.costMult, lvl));
    }

    function buyUpgrade(upgradeId) {
        const cost = getUpgradeCost(upgradeId);
        if (saveData.coins < cost) return false;
        saveData.coins -= cost;
        saveData.upgrades[upgradeId] = (saveData.upgrades[upgradeId] || 0) + 1;
        save();
        return true;
    }

    function buySkin(skinId) {
        const skin = SKINS.find(s => s.id === skinId);
        if (!skin || saveData.unlockedSkins.includes(skinId)) return false;
        if (saveData.coins < skin.cost) return false;
        saveData.coins -= skin.cost;
        saveData.unlockedSkins.push(skinId);
        save();
        return true;
    }

    function selectSkin(skinId) {
        if (saveData.unlockedSkins.includes(skinId)) {
            saveData.activeSkin = skinId;
            save();
            return true;
        }
        return false;
    }

    function getActiveSkin() {
        return SKINS.find(s => s.id === saveData.activeSkin) || SKINS[0];
    }

    function getUpgradeState() {
        return {
            fireRateLvl: saveData.upgrades.fireRate || 0,
            healthLvl: saveData.upgrades.health || 0,
            magnetLvl: saveData.upgrades.magnet || 0,
            shieldLvl: saveData.upgrades.shield || 0,
        };
    }

    function getMagnetRange() {
        return (saveData.upgrades.magnet || 0) * 50;
    }

    function getReviveCost(reviveCount) {
        return CONFIG.REVIVE_COST_BASE * (reviveCount + 1);
    }

    function canRevive(reviveCount) {
        return reviveCount < CONFIG.MAX_REVIVES_PER_RUN &&
            saveData.coins >= getReviveCost(reviveCount);
    }

    function payRevive(reviveCount) {
        const cost = getReviveCost(reviveCount);
        if (saveData.coins < cost) return false;
        saveData.coins -= cost;
        save();
        return true;
    }

    function markTutorialSeen() {
        saveData.tutorialSeen = true;
        save();
    }

    function setColorblindMode(on) {
        saveData.colorblindMode = on;
        save();
    }

    function setMusicPref(on) {
        saveData.musicEnabled = on;
        save();
    }

    function setSfxPref(on) {
        saveData.sfxEnabled = on;
        save();
    }

    return {
        load, save, getData, addCoins, setHighScore, incrementGames,
        getUpgradeCost, buyUpgrade, buySkin, selectSkin,
        getActiveSkin, getUpgradeState, getMagnetRange,
        getReviveCost, canRevive, payRevive,
        markTutorialSeen, setColorblindMode, setMusicPref, setSfxPref,
        SKINS, UPGRADES,
    };
})();
