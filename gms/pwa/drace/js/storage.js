/* DRace - Storage Module */
const Storage = {
    PREFIX: 'drace_',

    get(key, fallback = null) {
        try {
            const val = localStorage.getItem(this.PREFIX + key);
            return val !== null ? JSON.parse(val) : fallback;
        } catch { return fallback; }
    },

    set(key, value) {
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
        } catch { /* quota exceeded */ }
    },

    remove(key) {
        localStorage.removeItem(this.PREFIX + key);
    },

    getSettings() {
        return this.get('settings', {
            soundOn: true,
            musicOn: true
        });
    },

    saveSettings(settings) {
        this.set('settings', settings);
    },

    hasSeenGuide() {
        return this.get('seenGuide', false);
    },

    setSeenGuide() {
        this.set('seenGuide', true);
    },

    saveGame(state) {
        this.set('savedGame', state);
    },

    loadGame() {
        return this.get('savedGame', null);
    },

    clearGame() {
        this.remove('savedGame');
    }
};
