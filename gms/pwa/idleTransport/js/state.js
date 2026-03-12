// ============================================================
// Idle Transport Empire - Game State & Persistence
// ============================================================

let G = newState();

function newState() {
    return {
        money: 0,
        totalEarned: 0,
        totalClicks: 0,
        totalPrestiges: 0,
        pp: 0, // prestige points
        lifetimePP: 0,
        clickVal: 1,
        routes: {},       // { id: { level, progress, returning, readyCollect } }
        upgrades: {},     // { id: true }
        achievements: {}, // { id: true }
        pUpgrades: {},    // { id: level }
        bonuses: [],      // [{ effect, mul, endTime }]
        eventsCaught: 0,
        settings: { sfx: true, music: true, musicVol: 0.3, sfxVol: 0.5 },
        lastSave: Date.now(),
        lastOnline: Date.now(),
        tutorialDone: false,
        selectedRoute: 0, // index into ROUTES
        ver: 1
    };
}

function saveGame() {
    G.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {}
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        const d = newState();
        G = { ...d, ...s };
        G.settings = { ...d.settings, ...(s.settings || {}) };
        G.routes = s.routes || {};
        G.upgrades = s.upgrades || {};
        G.achievements = s.achievements || {};
        G.pUpgrades = s.pUpgrades || {};
        G.bonuses = s.bonuses || [];
        return true;
    } catch (e) { return false; }
}

function exportSave() {
    saveGame();
    return btoa(JSON.stringify(G));
}

function importSave(str) {
    try {
        const d = JSON.parse(atob(str.trim()));
        if (d && typeof d.money === 'number') {
            const def = newState();
            G = { ...def, ...d };
            G.settings = { ...def.settings, ...(d.settings || {}) };
            saveGame();
            return true;
        }
    } catch (e) {}
    return false;
}

function hardReset() {
    G = newState();
    localStorage.removeItem(SAVE_KEY);
    saveGame();
}

function calcOfflineEarnings() {
    const elapsed = (Date.now() - G.lastOnline) / 1000;
    if (elapsed < 10) return 0;
    const secs = Math.min(elapsed, 3600 * 8);
    return getPerSec() * secs * 0.5;
}
