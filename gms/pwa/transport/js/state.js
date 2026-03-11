// ============================================================
// Transport Empire - Game State & Persistence
// ============================================================

let game = createDefaultState();

function createDefaultState() {
    return {
        money: 0,
        totalEarned: 0,
        totalClicks: 0,
        totalPrestiges: 0,
        prestigePoints: 0,
        lifetimePrestigePoints: 0,
        clickValue: 1,
        businesses: {},
        upgrades: {},
        achievements: {},
        prestigeUpgrades: {},
        activeBonuses: [],
        eventsCaught: 0,
        settings: { sfx: true, music: true, musicVol: 0.3, sfxVol: 0.5 },
        lastSave: Date.now(),
        lastOnline: Date.now(),
        version: 1
    };
}

function saveGame() {
    game.lastSave = Date.now();
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    } catch (e) {
        console.warn('Save failed:', e);
    }
}

function loadGame() {
    try {
        const data = localStorage.getItem(SAVE_KEY);
        if (data) {
            const saved = JSON.parse(data);
            const def = createDefaultState();
            game = { ...def, ...saved };
            game.settings = { ...def.settings, ...(saved.settings || {}) };
            game.businesses = saved.businesses || {};
            game.upgrades = saved.upgrades || {};
            game.achievements = saved.achievements || {};
            game.prestigeUpgrades = saved.prestigeUpgrades || {};
            game.activeBonuses = saved.activeBonuses || [];
            return true;
        }
    } catch (e) {
        console.warn('Load failed:', e);
    }
    return false;
}

function exportSave() {
    saveGame();
    return btoa(JSON.stringify(game));
}

function importSave(str) {
    try {
        const data = JSON.parse(atob(str));
        if (data && typeof data.money === 'number') {
            const def = createDefaultState();
            game = { ...def, ...data };
            game.settings = { ...def.settings, ...(data.settings || {}) };
            saveGame();
            return true;
        }
    } catch (e) {
        console.warn('Import failed:', e);
    }
    return false;
}

function hardReset() {
    game = createDefaultState();
    localStorage.removeItem(SAVE_KEY);
    saveGame();
}

function calculateOfflineEarnings() {
    const now = Date.now();
    const elapsed = (now - game.lastOnline) / 1000;
    if (elapsed < 10) return 0;
    const maxOffline = 3600 * 8; // 8 hours max
    const secs = Math.min(elapsed, maxOffline);
    const perSec = getTotalPerSec();
    return perSec * secs * 0.5; // 50% efficiency offline
}
