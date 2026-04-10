/* levels.js - Level state management, save/load progress, star calculation */
'use strict';

const LevelManager = (() => {
    const SAVE_KEY = 'paperant_progress';
    let levelStates = []; // { unlocked, completed, stars, bestTime }

    function init() {
        load();
        // Ensure first level is unlocked
        if (!levelStates[0]) levelStates[0] = {};
        levelStates[0].unlocked = true;
    }

    function load() {
        try {
            const data = JSON.parse(localStorage.getItem(SAVE_KEY));
            if (data && Array.isArray(data)) {
                levelStates = data;
                return;
            }
        } catch (e) {}
        // Default state
        levelStates = LEVELS.map((_, i) => ({
            unlocked: i === 0,
            completed: false,
            stars: 0,
            bestTime: null,
        }));
    }

    function save() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(levelStates));
        } catch (e) {}
    }

    function getStates() {
        return levelStates.map((s, i) => ({
            ...s,
            current: s.unlocked && !s.completed,
        }));
    }

    function getLevelData(index) {
        return LEVELS[index] || null;
    }

    function completeLevel(index, timeUsed) {
        const level = LEVELS[index];
        if (!level) return 0;

        const timeRemaining = level.timeLimit - timeUsed;
        const timeFrac = timeRemaining / level.timeLimit;

        // Star calculation
        let stars = 1; // always at least 1 star for completing
        if (timeFrac >= CONFIG.LEVEL_TIME_BONUS_2STAR) stars = 2;
        if (timeFrac >= CONFIG.LEVEL_TIME_BONUS_3STAR) stars = 3;

        // Update state
        if (!levelStates[index]) levelStates[index] = {};
        levelStates[index].completed = true;
        levelStates[index].unlocked = true;
        if (stars > (levelStates[index].stars || 0)) {
            levelStates[index].stars = stars;
        }
        if (!levelStates[index].bestTime || timeUsed < levelStates[index].bestTime) {
            levelStates[index].bestTime = timeUsed;
        }

        // Unlock next level
        if (index + 1 < LEVELS.length) {
            if (!levelStates[index + 1]) levelStates[index + 1] = {};
            levelStates[index + 1].unlocked = true;
        }

        save();
        return stars;
    }

    function isAllComplete() {
        return LEVELS.every((_, i) => levelStates[i]?.completed);
    }

    function getTotalStars() {
        return levelStates.reduce((sum, s) => sum + (s?.stars || 0), 0);
    }

    function getMaxStars() {
        return LEVELS.length * 3;
    }

    function getNextUnlockedLevel() {
        for (let i = 0; i < LEVELS.length; i++) {
            if (levelStates[i]?.unlocked && !levelStates[i]?.completed) return i;
        }
        return 0;
    }

    return {
        init, getStates, getLevelData, completeLevel,
        isAllComplete, getTotalStars, getMaxStars, getNextUnlockedLevel,
    };
})();
