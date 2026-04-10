/* ui.js - Screen management, popups, HUD updates, level grid */
'use strict';

const UI = (() => {
    const screens = {};
    let currentScreen = null;

    // Callbacks
    let onPlayClick = null;
    let onLevelSelect = null;
    let onNextLevel = null;
    let onRetryLevel = null;
    let onBackToLevels = null;
    let onBackToTitle = null;

    function init(callbacks) {
        Object.assign({ onPlayClick, onLevelSelect, onNextLevel, onRetryLevel, onBackToLevels, onBackToTitle }, callbacks);
        onPlayClick = callbacks.onPlayClick;
        onLevelSelect = callbacks.onLevelSelect;
        onNextLevel = callbacks.onNextLevel;
        onRetryLevel = callbacks.onRetryLevel;
        onBackToLevels = callbacks.onBackToLevels;
        onBackToTitle = callbacks.onBackToTitle;

        // Cache screen elements
        const ids = ['title-screen', 'how-to-play-screen', 'level-select-screen',
                     'level-complete-screen', 'level-failed-screen', 'settings-screen',
                     'game-complete-screen'];
        ids.forEach(id => { screens[id] = document.getElementById(id); });

        // Button bindings
        bindBtn('play-btn', () => { Audio.SFX.buttonClick(); onPlayClick?.(); });
        bindBtn('how-to-play-btn', () => { Audio.SFX.buttonClick(); showScreen('how-to-play-screen'); });
        bindBtn('how-to-play-back', () => { Audio.SFX.buttonClick(); showScreen('title-screen'); });
        bindBtn('level-select-back', () => { Audio.SFX.buttonClick(); onBackToTitle?.(); });
        bindBtn('complete-next-btn', () => { Audio.SFX.buttonClick(); onNextLevel?.(); });
        bindBtn('complete-levels-btn', () => { Audio.SFX.buttonClick(); onBackToLevels?.(); });
        bindBtn('failed-retry-btn', () => { Audio.SFX.buttonClick(); onRetryLevel?.(); });
        bindBtn('failed-levels-btn', () => { Audio.SFX.buttonClick(); onBackToLevels?.(); });
        bindBtn('game-complete-btn', () => { Audio.SFX.buttonClick(); onBackToTitle?.(); });
        bindBtn('hud-back-btn', () => { Audio.SFX.buttonClick(); onBackToLevels?.(); });

        // Settings
        bindBtn('settings-btn', () => { Audio.SFX.buttonClick(); toggleSettings(); });
        bindBtn('settings-close', () => { Audio.SFX.buttonClick(); hideSettings(); });
        bindBtn('sfx-toggle', () => { toggleSettingBtn('sfx-toggle', Audio.toggleSfx()); });
        bindBtn('music-toggle', () => { toggleSettingBtn('music-toggle', Audio.toggleMusic()); });
        bindBtn('vibrate-toggle', () => { toggleSettingBtn('vibrate-toggle', Audio.toggleVibrate()); });

        // Init toggle states
        updateToggleBtn('sfx-toggle', Audio.sfxEnabled);
        updateToggleBtn('music-toggle', Audio.musicEnabled);
        updateToggleBtn('vibrate-toggle', Audio.vibrateEnabled);
    }

    function bindBtn(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    function toggleSettingBtn(id, state) {
        Audio.SFX.buttonClick();
        updateToggleBtn(id, state);
    }

    function updateToggleBtn(id, isOn) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('on', isOn);
        el.classList.toggle('off', !isOn);
        el.textContent = isOn ? 'ON' : 'OFF';
    }

    let settingsOpen = false;
    function toggleSettings() {
        if (settingsOpen) hideSettings();
        else showSettings();
    }
    function showSettings() {
        screens['settings-screen'].classList.add('active');
        settingsOpen = true;
    }
    function hideSettings() {
        screens['settings-screen'].classList.remove('active');
        settingsOpen = false;
    }
    function isSettingsOpen() { return settingsOpen; }

    function showScreen(id) {
        // Hide all screens
        Object.values(screens).forEach(s => s.classList.remove('active'));
        if (screens[id]) {
            screens[id].classList.add('active');
            currentScreen = id;
        }
    }

    function hideAllScreens() {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        currentScreen = null;
    }

    function showHUD(show) {
        const hud = document.getElementById('game-hud');
        hud.classList.toggle('hidden', !show);
    }

    function updateHUD(levelNum, goalText, time, inkFrac) {
        document.getElementById('hud-level').textContent = 'Level ' + levelNum;
        document.getElementById('hud-goal').textContent = goalText;
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        document.getElementById('hud-timer').textContent = mins + ':' + String(secs).padStart(2, '0');
        document.getElementById('ink-bar').style.width = (inkFrac * 100) + '%';

        // Color ink bar based on level
        const bar = document.getElementById('ink-bar');
        if (inkFrac < 0.2) bar.style.background = 'linear-gradient(90deg, #c44, #e66)';
        else if (inkFrac < 0.5) bar.style.background = 'linear-gradient(90deg, #c98a2e, #daa840)';
        else bar.style.background = 'linear-gradient(90deg, #3a5a9f, #5a7abf)';
    }

    function buildLevelGrid(levelStates, onSelect) {
        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';
        for (let i = 0; i < LEVELS.length; i++) {
            const btn = document.createElement('button');
            btn.className = 'level-btn';
            const state = levelStates[i] || {};

            if (state.unlocked) {
                btn.innerHTML = `<span>${i + 1}</span><span class="level-stars">${starsHTML(state.stars || 0)}</span>`;
                if (state.current) btn.classList.add('current');
                btn.addEventListener('click', () => {
                    Audio.SFX.buttonClick();
                    onSelect(i);
                });
            } else {
                btn.classList.add('locked');
                btn.innerHTML = `<span>&#128274;</span>`;
            }
            grid.appendChild(btn);
        }
    }

    function starsHTML(count) {
        let s = '';
        for (let i = 0; i < 3; i++) s += i < count ? '★' : '☆';
        return s;
    }

    function showLevelComplete(stars, time, levelNum) {
        const starsEl = document.getElementById('level-stars');
        starsEl.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const span = document.createElement('span');
            span.className = 'star ' + (i < stars ? 'earned' : 'empty');
            span.textContent = i < stars ? '★' : '☆';
            span.style.animationDelay = (i * 0.15) + 's';
            starsEl.appendChild(span);
        }
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        document.getElementById('level-time').textContent = `Time: ${mins}:${String(secs).padStart(2, '0')}`;

        // Hide next button if last level
        const nextBtn = document.getElementById('complete-next-btn');
        nextBtn.style.display = levelNum >= LEVELS.length ? 'none' : '';

        showScreen('level-complete-screen');
    }

    function showLevelFailed() {
        showScreen('level-failed-screen');
    }

    function showGameComplete(totalStars, maxStars) {
        document.getElementById('total-stars').textContent = `Total Stars: ${totalStars} / ${maxStars}`;
        showScreen('game-complete-screen');
    }

    return {
        init, showScreen, hideAllScreens, showHUD, updateHUD,
        buildLevelGrid, showLevelComplete, showLevelFailed, showGameComplete,
        isSettingsOpen, hideSettings,
    };
})();
